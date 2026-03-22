#!/usr/bin/env node

import crypto from "node:crypto";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import * as sdk from "../dist/index.mjs";
import {
  DEFAULT_AGENT_ENDPOINT,
  ensureBalance,
  ensureDistinctWallets,
  env,
  fixedUtf8Bytes,
  formatUnix,
  hasFlag,
  lamportsToSol,
  loadPrograms,
  randomBytes32,
  resolveIdlPath,
  sha256Bytes,
  unixNow,
  writeArtifact,
} from "./devnet-helpers.mjs";

const DEFAULT_RPC_URL = process.env.AGENC_RPC_URL ?? sdk.DEVNET_RPC;
const DEFAULT_REWARD_LAMPORTS = 12_000_000n;
const TASK_TYPE_BID_EXCLUSIVE = 3;
const CAP_COMPUTE = 1n;
const DEFAULT_SECOND_SIGNER_PATH = path.join(
  os.homedir(),
  ".config/solana/agenc-devnet-second-signer.json",
);
const DEFAULT_THIRD_SIGNER_PATH = path.join(
  os.homedir(),
  ".config/solana/agenc-devnet-third-signer.json",
);
const DEFAULT_BID_MARKETPLACE_CONFIG = {
  minBidBondLamports: 1_000_000n,
  bidCreationCooldownSecs: 5,
  maxBidsPer24h: 100,
  maxActiveBidsPerTask: 10,
  maxBidLifetimeSecs: 3600,
  acceptedNoShowSlashBps: 2500,
};

function usage() {
  process.stdout.write(`Usage:
  CREATOR_WALLET=/path/to/creator.json \\
  WORKER_WALLET=/path/to/worker.json \\
  PROTOCOL_AUTHORITY_WALLET=/path/to/authority.json \\
  [PROTOCOL_SECOND_SIGNER_WALLET=/path/to/second-signer.json] \\
  [PROTOCOL_THIRD_SIGNER_WALLET=/path/to/third-signer.json] \\
  AGENC_IDL_PATH=/absolute/path/to/agenc_coordination.json \\
  npm run test:devnet:bid-marketplace

Environment:
  CREATOR_WALLET                Required.
  WORKER_WALLET                 Required. Acts as the bidder and accepted worker.
  PROTOCOL_AUTHORITY_WALLET     Required. Used to initialize bid marketplace config when missing.
  PROTOCOL_SECOND_SIGNER_WALLET Optional. Used for multisig-gated config initialization when required.
  PROTOCOL_THIRD_SIGNER_WALLET  Optional. Used when protocol multisig threshold exceeds two signers.
  AGENC_RPC_URL                 Optional. Defaults to ${DEFAULT_RPC_URL}
  AGENC_IDL_PATH                Required.
  AGENC_REWARD_LAMPORTS         Optional. Defaults to ${DEFAULT_REWARD_LAMPORTS.toString()}

What this validates:
  1. Creator and bidder agent registration
  2. Bid-exclusive task creation
  3. Bid marketplace config fetch/initialize
  4. Bid book initialization
  5. Bid creation and update
  6. Creator acceptance into a normal task claim
  7. Successful completeTask settlement using accepted-bid remaining accounts
`);
}

function createAgentId(label) {
  return sha256Bytes(
    "agenc-sdk-devnet-bid-marketplace",
    label,
    randomBytes32(),
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function resolveOptionalMultisigWalletPath(envName, fallbackPath) {
  const fromEnv = process.env[envName];
  if (fromEnv) {
    return fromEnv;
  }
  return existsSync(fallbackPath) ? fallbackPath : null;
}

async function main() {
  if (hasFlag("--help")) {
    usage();
    return;
  }

  const creatorWalletPath = env("CREATOR_WALLET");
  const bidderWalletPath = env("WORKER_WALLET");
  const authorityWalletPath = env("PROTOCOL_AUTHORITY_WALLET");
  const secondSignerWalletPath = resolveOptionalMultisigWalletPath(
    "PROTOCOL_SECOND_SIGNER_WALLET",
    DEFAULT_SECOND_SIGNER_PATH,
  );
  const thirdSignerWalletPath = resolveOptionalMultisigWalletPath(
    "PROTOCOL_THIRD_SIGNER_WALLET",
    DEFAULT_THIRD_SIGNER_PATH,
  );
  const rpcUrl = process.env.AGENC_RPC_URL ?? DEFAULT_RPC_URL;
  const idlPath = resolveIdlPath();
  const rewardLamports = BigInt(
    process.env.AGENC_REWARD_LAMPORTS ?? DEFAULT_REWARD_LAMPORTS.toString(),
  );

  console.log(`[config] rpc: ${rpcUrl}`);
  console.log(`[config] idl path: ${idlPath}`);
  console.log(`[config] creator wallet: ${creatorWalletPath}`);
  console.log(`[config] bidder wallet: ${bidderWalletPath}`);
  console.log(`[config] authority wallet: ${authorityWalletPath}`);
  if (secondSignerWalletPath) {
    console.log(`[config] second signer wallet: ${secondSignerWalletPath}`);
  }
  if (thirdSignerWalletPath) {
    console.log(`[config] third signer wallet: ${thirdSignerWalletPath}`);
  }
  console.log(
    `[config] reward lamports: ${rewardLamports.toString()} (${lamportsToSol(rewardLamports)} SOL)`,
  );

  const { connection, keypairs, programs } = await loadPrograms({
    rpcUrl,
    idlPath,
    wallets: {
      creator: creatorWalletPath,
      bidder: bidderWalletPath,
      authority: authorityWalletPath,
      secondSigner: secondSignerWalletPath,
      thirdSigner: thirdSignerWalletPath,
    },
  });

  ensureDistinctWallets(keypairs);

  const creator = keypairs.creator;
  const bidder = keypairs.bidder;
  const authority = keypairs.authority;
  const creatorProgram = programs.creator;
  const bidderProgram = programs.bidder;
  const authorityProgram = programs.authority;

  const protocolConfig = await sdk.getProtocolConfig(creatorProgram);
  if (!protocolConfig) {
    throw new Error("Protocol config PDA could not be fetched from devnet.");
  }
  if (!authority.publicKey.equals(protocolConfig.authority)) {
    throw new Error(
      `PROTOCOL_AUTHORITY_WALLET ${authority.publicKey.toBase58()} does not match protocol authority ${protocolConfig.authority.toBase58()}.`,
    );
  }

  let bidMarketplace = await sdk.getBidMarketplaceConfig(authorityProgram);
  if (!bidMarketplace) {
    console.log("[setup] bid marketplace config missing; initializing it now");

    const multisigSigners = [authority];
    if (keypairs.secondSigner) {
      multisigSigners.push(keypairs.secondSigner);
    }
    if (
      protocolConfig.multisigThreshold > multisigSigners.length &&
      keypairs.thirdSigner
    ) {
      multisigSigners.push(keypairs.thirdSigner);
    }
    if (multisigSigners.length < protocolConfig.multisigThreshold) {
      throw new Error(
        `Bid marketplace config is missing and protocol multisig threshold is ${protocolConfig.multisigThreshold}, but only ${multisigSigners.length} signer(s) are available. Provide PROTOCOL_SECOND_SIGNER_WALLET${protocolConfig.multisigThreshold > 2 ? " and PROTOCOL_THIRD_SIGNER_WALLET" : ""}.`,
      );
    }

    const initialized = await sdk.initializeBidMarketplace(
      connection,
      authorityProgram,
      multisigSigners,
      DEFAULT_BID_MARKETPLACE_CONFIG,
    );
    console.log(
      `[step] bid marketplace initialized: ${initialized.txSignature}`,
    );
    bidMarketplace = await sdk.getBidMarketplaceConfig(authorityProgram);
  }

  if (!bidMarketplace) {
    throw new Error("Bid marketplace config is still unavailable after initialization.");
  }

  console.log(
    `[setup] bid marketplace bond=${bidMarketplace.minBidBondLamports.toString()} cooldown=${bidMarketplace.bidCreationCooldownSecs}s maxBidsPer24h=${bidMarketplace.maxBidsPer24h} maxActiveBidsPerTask=${bidMarketplace.maxActiveBidsPerTask}`,
  );

  const minimums = {
    creator:
      protocolConfig.minAgentStake + rewardLamports + 30_000_000n,
    bidder:
      protocolConfig.minAgentStake +
      bidMarketplace.minBidBondLamports +
      20_000_000n,
    authority: 10_000_000n,
  };

  await Promise.all([
    ensureBalance(connection, "creator", creator.publicKey, minimums.creator),
    ensureBalance(connection, "bidder", bidder.publicKey, minimums.bidder),
    ensureBalance(
      connection,
      "authority",
      authority.publicKey,
      minimums.authority,
    ),
  ]);

  const creatorAgentId = createAgentId("creator");
  const bidderAgentId = createAgentId("bidder");

  const creatorRegistration = await sdk.registerAgent(
    connection,
    creatorProgram,
    creator,
    {
      agentId: creatorAgentId,
      capabilities: CAP_COMPUTE,
      endpoint: `${DEFAULT_AGENT_ENDPOINT}/creator-bid-marketplace`,
      metadataUri: "https://example.invalid/agenc/devnet/creator-bid-marketplace",
      stakeAmount: protocolConfig.minAgentStake,
    },
  );
  console.log(
    `[step] creator registered: ${creatorRegistration.txSignature} agent=${creatorRegistration.agentPda.toBase58()}`,
  );

  const bidderRegistration = await sdk.registerAgent(
    connection,
    bidderProgram,
    bidder,
    {
      agentId: bidderAgentId,
      capabilities: CAP_COMPUTE,
      endpoint: `${DEFAULT_AGENT_ENDPOINT}/bidder-bid-marketplace`,
      metadataUri: "https://example.invalid/agenc/devnet/bidder-bid-marketplace",
      stakeAmount: protocolConfig.minAgentStake,
    },
  );
  console.log(
    `[step] bidder registered: ${bidderRegistration.txSignature} agent=${bidderRegistration.agentPda.toBase58()}`,
  );

  const deadline = unixNow() + 3600;
  const taskId = randomBytes32();
  const createdTask = await sdk.createTask(
    connection,
    creatorProgram,
    creator,
    creatorAgentId,
    {
      taskId,
      requiredCapabilities: CAP_COMPUTE,
      description: fixedUtf8Bytes(
        "Marketplace V2 bid task completed through accepted-bid settlement",
        64,
      ),
      rewardAmount: rewardLamports,
      maxWorkers: 1,
      deadline,
      taskType: TASK_TYPE_BID_EXCLUSIVE,
      minReputation: 0,
    },
  );
  console.log(
    `[step] bid-exclusive task created: ${createdTask.txSignature} task=${createdTask.taskPda.toBase58()} deadline=${formatUnix(deadline)}`,
  );

  const initializedBidBook = await sdk.initializeBidBook(
    connection,
    creatorProgram,
    creator,
    {
      taskPda: createdTask.taskPda,
      policy: sdk.BidBookMatchingPolicy.WeightedScore,
      weights: {
        priceWeightBps: 4000,
        etaWeightBps: 3000,
        confidenceWeightBps: 2000,
        reliabilityWeightBps: 1000,
      },
    },
  );
  console.log(
    `[step] bid book initialized: ${initializedBidBook.txSignature} bidBook=${initializedBidBook.bidBookPda.toBase58()}`,
  );

  const initialBidReward = rewardLamports - 2_000_000n;
  const updatedBidReward = rewardLamports - 3_000_000n;
  const createdBid = await sdk.createBid(
    connection,
    bidderProgram,
    bidder,
    {
      taskPda: createdTask.taskPda,
      bidderAgentId,
      requestedRewardLamports: initialBidReward,
      etaSeconds: 900,
      confidenceBps: 7800,
      qualityGuaranteeHash: sha256Bytes("quality-guarantee", taskId),
      metadataHash: sha256Bytes("metadata", taskId),
      expiresAt: unixNow() + 1800,
    },
  );
  console.log(
    `[step] bid created: ${createdBid.txSignature} bid=${createdBid.bidPda.toBase58()}`,
  );

  const updatedBid = await sdk.updateBid(
    connection,
    bidderProgram,
    bidder,
    {
      taskPda: createdTask.taskPda,
      bidderAgentId,
      requestedRewardLamports: updatedBidReward,
      etaSeconds: 600,
      confidenceBps: 8400,
      qualityGuaranteeHash: sha256Bytes("quality-guarantee-updated", taskId),
      metadataHash: sha256Bytes("metadata-updated", taskId),
      expiresAt: unixNow() + 1500,
    },
  );
  console.log(
    `[step] bid updated: ${updatedBid.txSignature} bid=${updatedBid.bidPda.toBase58()}`,
  );

  const [bidAfterUpdate, bidBookAfterUpdate] = await Promise.all([
    sdk.getBid(bidderProgram, createdBid.bidPda),
    sdk.getBidBook(bidderProgram, createdBid.bidBookPda),
  ]);

  assert(bidAfterUpdate !== null, "Updated bid account could not be fetched.");
  assert(
    bidAfterUpdate.requestedRewardLamports === updatedBidReward,
    `Updated bid reward mismatch: expected ${updatedBidReward.toString()}, got ${bidAfterUpdate.requestedRewardLamports.toString()}`,
  );
  assert(
    bidAfterUpdate.etaSeconds === 600,
    `Updated bid ETA mismatch: expected 600, got ${bidAfterUpdate.etaSeconds}`,
  );
  assert(
    bidBookAfterUpdate?.state === sdk.TaskBidBookLifecycleState.Open,
    "Bid book should remain open after update.",
  );

  const acceptedBid = await sdk.acceptBid(connection, creatorProgram, creator, {
    taskPda: createdTask.taskPda,
    bidderAgentPda: createdBid.bidderAgentPda,
  });
  console.log(
    `[step] bid accepted: ${acceptedBid.txSignature} claim=${acceptedBid.claimPda.toBase58()}`,
  );

  const [taskAfterAccept, bidBookAfterAccept, bidAfterAccept] = await Promise.all([
    sdk.getTask(creatorProgram, createdTask.taskPda),
    sdk.getBidBook(creatorProgram, createdBid.bidBookPda),
    sdk.getBid(creatorProgram, createdBid.bidPda),
  ]);

  assert(taskAfterAccept !== null, "Task missing immediately after bid acceptance.");
  assert(
    taskAfterAccept.state === sdk.TaskState.InProgress,
    `Task should be in progress after accepting a bid, got ${taskAfterAccept.state}`,
  );
  assert(
    bidBookAfterAccept?.state === sdk.TaskBidBookLifecycleState.Accepted,
    "Bid book should be accepted after creator selection.",
  );
  assert(
    bidAfterAccept?.state === sdk.TaskBidLifecycleState.Accepted,
    "Accepted bid should move into accepted state.",
  );

  const completion = await sdk.completeTask(
    connection,
    bidderProgram,
    bidder,
    bidderAgentId,
    createdTask.taskPda,
    randomBytes32(),
    fixedUtf8Bytes("bid-marketplace-complete", 64),
    {
      acceptedBidSettlement: {
        bidBook: createdBid.bidBookPda,
        acceptedBid: createdBid.bidPda,
        bidderMarketState: createdBid.bidderMarketStatePda,
      },
      bidderAuthority: bidder.publicKey,
    },
  );
  console.log(`[step] task completed: ${completion.txSignature}`);

  const [finalTask, finalBidBook, finalBid, finalBidderMarketState] =
    await Promise.all([
      sdk.getTask(bidderProgram, createdTask.taskPda),
      sdk.getBidBook(bidderProgram, createdBid.bidBookPda),
      sdk.getBid(bidderProgram, createdBid.bidPda),
      sdk.getBidderMarketState(
        bidderProgram,
        createdBid.bidderMarketStatePda,
      ),
    ]);

  assert(finalTask !== null, "Task missing after completion.");
  assert(
    finalTask.state === sdk.TaskState.Completed,
    `Expected completed task state, got ${finalTask.state}`,
  );
  assert(
    finalBidBook?.state === sdk.TaskBidBookLifecycleState.Closed,
    "Bid book should be closed after successful task completion.",
  );
  assert(
    finalBidBook?.activeBids === 0,
    `Expected zero active bids after completion, got ${finalBidBook?.activeBids ?? "unknown"}`,
  );
  assert(
    finalBidBook?.acceptedBid?.equals(createdBid.bidPda) ?? false,
    "Closed bid book should retain the accepted bid pointer.",
  );
  assert(finalBid === null, "Accepted bid account should be closed after completion.");
  assert(
    finalBidderMarketState?.activeBidCount === 0,
    `Bidder active bid count should return to zero, got ${finalBidderMarketState?.activeBidCount ?? "unknown"}`,
  );
  assert(
    (finalBidderMarketState?.totalBidsAccepted ?? 0n) >= 1n,
    "Bidder total accepted bids counter should be incremented.",
  );

  const artifactPath = await writeArtifact("bid-marketplace", {
    kind: "bid-marketplace",
    createdAt: new Date().toISOString(),
    rpcUrl,
    idlPath,
    creator: creator.publicKey.toBase58(),
    bidder: bidder.publicKey.toBase58(),
    authority: authority.publicKey.toBase58(),
    taskPda: createdTask.taskPda.toBase58(),
    bidBookPda: createdBid.bidBookPda.toBase58(),
    bidPda: createdBid.bidPda.toBase58(),
    bidderMarketStatePda: createdBid.bidderMarketStatePda.toBase58(),
    claimPda: acceptedBid.claimPda.toBase58(),
    txSignatures: {
      registerCreator: creatorRegistration.txSignature,
      registerBidder: bidderRegistration.txSignature,
      createTask: createdTask.txSignature,
      initializeBidBook: initializedBidBook.txSignature,
      createBid: createdBid.txSignature,
      updateBid: updatedBid.txSignature,
      acceptBid: acceptedBid.txSignature,
      completeTask: completion.txSignature,
    },
    summary: {
      finalTaskState: finalTask.state,
      finalBidBookState: finalBidBook?.state ?? null,
      finalBidClosed: finalBid === null,
      finalActiveBidCount: finalBidderMarketState?.activeBidCount ?? null,
    },
  });

  console.log(`[artifact] bid marketplace report: ${artifactPath}`);
  console.log("[success] bid marketplace suite passed");
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[failure] ${message}`);
  process.exitCode = 1;
});
