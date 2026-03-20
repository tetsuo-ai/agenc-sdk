#!/usr/bin/env node

import process from "node:process";
import { PublicKey } from "@solana/web3.js";
import * as sdk from "../dist/index.mjs";
import {
  DEFAULT_AGENT_ENDPOINT,
  ensureBalance,
  ensureDistinctWallets,
  env,
  fixedUtf8Bytes,
  formatUnix,
  getFlagValue,
  hasFlag,
  lamportsToSol,
  loadPrograms,
  randomBytes32,
  readArtifact,
  resolveIdlPath,
  sha256Bytes,
  waitUntilUnix,
  writeArtifact,
} from "./devnet-helpers.mjs";

const DEFAULT_RPC_URL = process.env.AGENC_RPC_URL ?? sdk.DEVNET_RPC;
const DEFAULT_REWARD_LAMPORTS = 10_000_000n;
const DEFAULT_MAX_WAIT_SECONDS = 90;
const CAP_COMPUTE = 1n;
const CAP_ARBITER = 1n << 7n;

function usage() {
  process.stdout.write(`Usage:
  CREATOR_WALLET=/path/to/creator.json \\
  WORKER_WALLET=/path/to/worker.json \\
  ARBITER_A_WALLET=/path/to/arbiter-a.json \\
  ARBITER_B_WALLET=/path/to/arbiter-b.json \\
  ARBITER_C_WALLET=/path/to/arbiter-c.json \\
  PROTOCOL_AUTHORITY_WALLET=/path/to/authority.json \\
  npm run test:devnet:disputes

  PROTOCOL_AUTHORITY_WALLET=/path/to/authority.json npm run test:devnet:disputes -- --resume /tmp/agenc-sdk-devnet/dispute-....json

Environment:
  CREATOR_WALLET                Required for initial run.
  WORKER_WALLET                 Required for initial run.
  ARBITER_A_WALLET              Required for initial run.
  ARBITER_B_WALLET              Required for initial run.
  ARBITER_C_WALLET              Required for initial run.
  PROTOCOL_AUTHORITY_WALLET     Required. Used for final dispute resolution.
  AGENC_RPC_URL                 Optional. Defaults to ${DEFAULT_RPC_URL}
  AGENC_IDL_PATH                Required for initial run. Optional on --resume if stored in the artifact.
  AGENC_REWARD_LAMPORTS         Optional. Defaults to ${DEFAULT_REWARD_LAMPORTS.toString()}
  AGENC_MAX_WAIT_SECONDS        Optional. Defaults to ${DEFAULT_MAX_WAIT_SECONDS}

What this validates:
  1. Registers creator, worker, and three arbiter agents
  2. Creates and claims a public task
  3. Initiates a creator-side dispute against the worker
  4. Casts the three arbiter votes required for quorum
  5. Resolves immediately when timing allows
  6. Otherwise writes a resume artifact for the authority to resolve later

Important:
  The protocol voting period defaults to 24 hours, so public devnet usually needs
  an initial run plus a later --resume run to validate the resolve step.
`);
}

function maxBigInt(...values) {
  return values.reduce((current, value) => (value > current ? value : current));
}

function getMinArbiterStake(protocolConfig) {
  return protocolConfig.minArbiterStake ?? protocolConfig.minAgentStake;
}

function getVotingPeriod(protocolConfig) {
  return protocolConfig.votingPeriod ?? null;
}

function parseVotePairs(pairs) {
  return pairs.map((pair) => ({
    votePda: new PublicKey(pair.votePda),
    agentPda: new PublicKey(pair.agentPda),
  }));
}

function parseWorkerPairs(pairs) {
  return pairs.map((pair) => ({
    claimPda: new PublicKey(pair.claimPda),
    agentPda: new PublicKey(pair.agentPda),
  }));
}

async function resume() {
  const resumePath = getFlagValue("--resume");
  if (!resumePath) {
    throw new Error("Missing resume artifact path. Use --resume /path/to/file.json");
  }

  const authorityWalletPath = env("PROTOCOL_AUTHORITY_WALLET");
  const artifact = await readArtifact(resumePath);
  const rpcUrl = process.env.AGENC_RPC_URL ?? artifact.rpcUrl ?? DEFAULT_RPC_URL;
  const idlPath = resolveIdlPath(artifact.idlPath ?? null);

  console.log(`[resume] artifact: ${resumePath}`);
  console.log(`[resume] rpc: ${rpcUrl}`);
  console.log(`[resume] idl path: ${idlPath}`);
  console.log(`[resume] authority wallet: ${authorityWalletPath}`);

  const { connection, keypairs, programs } = await loadPrograms({
    rpcUrl,
    idlPath,
    wallets: {
      authority: authorityWalletPath,
    },
  });

  const authority = keypairs.authority;
  const authorityProgram = programs.authority;
  const protocolConfig = await sdk.getProtocolConfig(authorityProgram);
  if (!protocolConfig) {
    throw new Error("Protocol config PDA could not be fetched from devnet.");
  }
  if (!authority.publicKey.equals(protocolConfig.authority)) {
    throw new Error(
      `PROTOCOL_AUTHORITY_WALLET ${authority.publicKey.toBase58()} does not match protocol authority ${protocolConfig.authority.toBase58()}.`,
    );
  }

  const disputePda = new PublicKey(artifact.disputePda);
  const disputeBefore = await sdk.getDispute(authorityProgram, disputePda);
  if (!disputeBefore) {
    throw new Error(`Dispute ${artifact.disputePda} no longer exists.`);
  }
  if (Date.now() / 1000 < disputeBefore.votingDeadline) {
    console.log(
      `[resume] dispute still locked until ${formatUnix(disputeBefore.votingDeadline)}. Re-run after that time.`,
    );
    return;
  }

  if (disputeBefore.status !== sdk.DisputeStatus.Active) {
    console.log(
      `[resume] dispute already moved to status=${disputeBefore.status}; nothing else to do.`,
    );
    return;
  }

  const resolved = await sdk.resolveDispute(
    connection,
    authorityProgram,
    authority,
    {
      disputePda,
      taskPda: new PublicKey(artifact.taskPda),
      creatorPubkey: new PublicKey(artifact.creatorPubkey),
      workerClaimPda: new PublicKey(artifact.workerClaimPda),
      workerAgentPda: new PublicKey(artifact.workerAgentPda),
      workerAuthority: new PublicKey(artifact.workerAuthority),
      arbiterPairs: parseVotePairs(artifact.arbiterPairs),
      workerPairs: parseWorkerPairs(artifact.workerPairs),
    },
  );
  console.log(`[resume] dispute resolved: ${resolved.txSignature}`);

  const [disputeAfter, taskAfter] = await Promise.all([
    sdk.getDispute(authorityProgram, disputePda),
    sdk.getTask(authorityProgram, new PublicKey(artifact.taskPda)),
  ]);

  if (!disputeAfter || !taskAfter) {
    throw new Error("Could not fetch final dispute/task state after resolution.");
  }

  console.log(
    `[result] dispute status=${disputeAfter.status} votesFor=${disputeAfter.votesFor.toString()} votesAgainst=${disputeAfter.votesAgainst.toString()} totalVoters=${disputeAfter.totalVoters}`,
  );
  console.log(
    `[result] task state=${sdk.formatTaskState(taskAfter.state)} currentWorkers=${taskAfter.currentWorkers}`,
  );
}

async function initial() {
  const creatorWalletPath = env("CREATOR_WALLET");
  const workerWalletPath = env("WORKER_WALLET");
  const arbiterAWalletPath = env("ARBITER_A_WALLET");
  const arbiterBWalletPath = env("ARBITER_B_WALLET");
  const arbiterCWalletPath = env("ARBITER_C_WALLET");
  const authorityWalletPath = env("PROTOCOL_AUTHORITY_WALLET");
  const rpcUrl = process.env.AGENC_RPC_URL ?? DEFAULT_RPC_URL;
  const idlPath = resolveIdlPath();
  const rewardLamports = BigInt(
    process.env.AGENC_REWARD_LAMPORTS ?? DEFAULT_REWARD_LAMPORTS.toString(),
  );
  const maxWaitSeconds = Number(
    process.env.AGENC_MAX_WAIT_SECONDS ?? DEFAULT_MAX_WAIT_SECONDS,
  );

  console.log(`[config] rpc: ${rpcUrl}`);
  console.log(`[config] idl path: ${idlPath}`);
  console.log(`[config] creator wallet: ${creatorWalletPath}`);
  console.log(`[config] worker wallet: ${workerWalletPath}`);
  console.log(`[config] arbiter A wallet: ${arbiterAWalletPath}`);
  console.log(`[config] arbiter B wallet: ${arbiterBWalletPath}`);
  console.log(`[config] arbiter C wallet: ${arbiterCWalletPath}`);
  console.log(`[config] authority wallet: ${authorityWalletPath}`);
  console.log(`[config] reward lamports: ${rewardLamports.toString()}`);
  console.log(`[config] max wait seconds: ${maxWaitSeconds}`);

  const { connection, keypairs, programs } = await loadPrograms({
    rpcUrl,
    idlPath,
    wallets: {
      creator: creatorWalletPath,
      worker: workerWalletPath,
      arbiterA: arbiterAWalletPath,
      arbiterB: arbiterBWalletPath,
      arbiterC: arbiterCWalletPath,
      authority: authorityWalletPath,
    },
  });

  ensureDistinctWallets(keypairs);

  const creator = keypairs.creator;
  const worker = keypairs.worker;
  const arbiterA = keypairs.arbiterA;
  const arbiterB = keypairs.arbiterB;
  const arbiterC = keypairs.arbiterC;
  const authority = keypairs.authority;
  const creatorProgram = programs.creator;
  const workerProgram = programs.worker;
  const arbiterAProgram = programs.arbiterA;
  const arbiterBProgram = programs.arbiterB;
  const arbiterCProgram = programs.arbiterC;
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

  const creatorStake = maxBigInt(
    protocolConfig.minAgentStake,
    protocolConfig.minStakeForDispute * 2n,
  );
  const workerStake = protocolConfig.minAgentStake;
  const arbiterStake = maxBigInt(
    protocolConfig.minAgentStake,
    getMinArbiterStake(protocolConfig),
  );

  const minimums = {
    creator: creatorStake + rewardLamports + 20_000_000n,
    worker: workerStake + 10_000_000n,
    arbiterA: arbiterStake + 10_000_000n,
    arbiterB: arbiterStake + 10_000_000n,
    arbiterC: arbiterStake + 10_000_000n,
    authority: 5_000_000n,
  };

  const balances = await Promise.all([
    ensureBalance(connection, "creator", creator.publicKey, minimums.creator),
    ensureBalance(connection, "worker", worker.publicKey, minimums.worker),
    ensureBalance(connection, "arbiterA", arbiterA.publicKey, minimums.arbiterA),
    ensureBalance(connection, "arbiterB", arbiterB.publicKey, minimums.arbiterB),
    ensureBalance(connection, "arbiterC", arbiterC.publicKey, minimums.arbiterC),
    ensureBalance(connection, "authority", authority.publicKey, minimums.authority),
  ]);

  console.log(
    `[protocol] minAgentStake=${protocolConfig.minAgentStake.toString()} minArbiterStake=${getMinArbiterStake(protocolConfig).toString()} minStakeForDispute=${protocolConfig.minStakeForDispute.toString()} votingPeriod=${getVotingPeriod(protocolConfig) ?? "unknown"}${getVotingPeriod(protocolConfig) ? "s" : ""}`,
  );
  console.log(
    `[balances] creator=${lamportsToSol(balances[0])} SOL worker=${lamportsToSol(balances[1])} SOL arbiterA=${lamportsToSol(balances[2])} SOL arbiterB=${lamportsToSol(balances[3])} SOL arbiterC=${lamportsToSol(balances[4])} SOL authority=${lamportsToSol(balances[5])} SOL`,
  );

  const creatorAgentId = randomBytes32();
  const workerAgentId = randomBytes32();
  const arbiterAAgentId = randomBytes32();
  const arbiterBAgentId = randomBytes32();
  const arbiterCAgentId = randomBytes32();
  const taskId = randomBytes32();
  const disputeId = randomBytes32();
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const description = fixedUtf8Bytes(
    `agenc dispute validation ${new Date().toISOString()}`,
    64,
  );
  const evidenceHash = sha256Bytes("agenc-sdk-dispute", disputeId);

  const registrations = await Promise.all([
    sdk.registerAgent(connection, creatorProgram, creator, {
      agentId: creatorAgentId,
      capabilities: CAP_COMPUTE,
      endpoint: DEFAULT_AGENT_ENDPOINT,
      metadataUri: null,
      stakeAmount: creatorStake,
    }),
    sdk.registerAgent(connection, workerProgram, worker, {
      agentId: workerAgentId,
      capabilities: CAP_COMPUTE,
      endpoint: DEFAULT_AGENT_ENDPOINT,
      metadataUri: null,
      stakeAmount: workerStake,
    }),
    sdk.registerAgent(connection, arbiterAProgram, arbiterA, {
      agentId: arbiterAAgentId,
      capabilities: CAP_ARBITER,
      endpoint: DEFAULT_AGENT_ENDPOINT,
      metadataUri: null,
      stakeAmount: arbiterStake,
    }),
    sdk.registerAgent(connection, arbiterBProgram, arbiterB, {
      agentId: arbiterBAgentId,
      capabilities: CAP_ARBITER,
      endpoint: DEFAULT_AGENT_ENDPOINT,
      metadataUri: null,
      stakeAmount: arbiterStake,
    }),
    sdk.registerAgent(connection, arbiterCProgram, arbiterC, {
      agentId: arbiterCAgentId,
      capabilities: CAP_ARBITER,
      endpoint: DEFAULT_AGENT_ENDPOINT,
      metadataUri: null,
      stakeAmount: arbiterStake,
    }),
  ]);

  console.log(
    `[step] agents registered: creator=${registrations[0].txSignature} worker=${registrations[1].txSignature} arbiterA=${registrations[2].txSignature} arbiterB=${registrations[3].txSignature} arbiterC=${registrations[4].txSignature}`,
  );

  const created = await sdk.createTask(
    connection,
    creatorProgram,
    creator,
    creatorAgentId,
    {
      taskId,
      requiredCapabilities: CAP_COMPUTE,
      description,
      rewardAmount: rewardLamports,
      maxWorkers: 1,
      deadline,
      taskType: 0,
      constraintHash: null,
      minReputation: 0,
      rewardMint: null,
    },
  );
  console.log(
    `[step] task created: ${created.txSignature} taskPda=${created.taskPda.toBase58()}`,
  );

  const claimed = await sdk.claimTask(
    connection,
    workerProgram,
    worker,
    workerAgentId,
    created.taskPda,
  );
  console.log(`[step] task claimed: ${claimed.txSignature}`);

  const workerAgentPda = sdk.deriveAgentPda(
    workerAgentId,
    workerProgram.programId,
  );
  const workerClaimPda = sdk.deriveClaimPda(
    created.taskPda,
    workerAgentPda,
    workerProgram.programId,
  );

  const initiated = await sdk.initiateDispute(
    connection,
    creatorProgram,
    creator,
    creatorAgentId,
    {
      disputeId,
      taskPda: created.taskPda,
      taskId,
      evidenceHash,
      resolutionType: sdk.ResolutionType.Refund,
      evidence: "creator disputes claimed task before completion",
      workerAgentPda,
      workerClaimPda,
    },
  );
  console.log(
    `[step] dispute initiated: ${initiated.txSignature} disputePda=${initiated.disputePda.toBase58()}`,
  );

  const arbiterPairs = [];
  for (const [program, keypair, agentId, label] of [
    [arbiterAProgram, arbiterA, arbiterAAgentId, "arbiterA"],
    [arbiterBProgram, arbiterB, arbiterBAgentId, "arbiterB"],
    [arbiterCProgram, arbiterC, arbiterCAgentId, "arbiterC"],
  ]) {
    const voted = await sdk.voteDispute(
      connection,
      program,
      keypair,
      agentId,
      {
        disputePda: initiated.disputePda,
        taskPda: created.taskPda,
        approve: true,
        workerClaimPda,
        defendantAgentPda: workerAgentPda,
      },
    );
    const agentPda = sdk.deriveAgentPda(agentId, program.programId);
    arbiterPairs.push({
      votePda: voted.votePda,
      agentPda,
    });
    console.log(`[step] ${label} voted: ${voted.txSignature}`);
  }

  const dispute = await sdk.getDispute(creatorProgram, initiated.disputePda);
  if (!dispute) {
    throw new Error("Dispute could not be fetched after voting.");
  }

  console.log(
    `[result] before resolution status=${dispute.status} votesFor=${dispute.votesFor.toString()} votesAgainst=${dispute.votesAgainst.toString()} totalVoters=${dispute.totalVoters} votingDeadline=${formatUnix(dispute.votingDeadline)}`,
  );

  const ready = await waitUntilUnix(
    dispute.votingDeadline,
    "dispute resolution",
    maxWaitSeconds,
  );
  if (!ready) {
    const artifactPath = await writeArtifact("dispute", {
      version: 1,
      kind: "dispute",
      rpcUrl,
      idlPath,
      disputePda: initiated.disputePda.toBase58(),
      taskPda: created.taskPda.toBase58(),
      creatorPubkey: creator.publicKey.toBase58(),
      workerClaimPda: workerClaimPda.toBase58(),
      workerAgentPda: workerAgentPda.toBase58(),
      workerAuthority: worker.publicKey.toBase58(),
      votingDeadline: dispute.votingDeadline,
      arbiterPairs: arbiterPairs.map((pair) => ({
        votePda: pair.votePda.toBase58(),
        agentPda: pair.agentPda.toBase58(),
      })),
      workerPairs: [
        {
          claimPda: workerClaimPda.toBase58(),
          agentPda: workerAgentPda.toBase58(),
        },
      ],
    });

    console.log(
      `[artifact] dispute resolution deferred until ${formatUnix(dispute.votingDeadline)}: ${artifactPath}`,
    );
    console.log(
      `[artifact] resume with: PROTOCOL_AUTHORITY_WALLET=/path/to/authority.json npm run test:devnet:disputes -- --resume ${artifactPath}`,
    );
    return;
  }

  const resolved = await sdk.resolveDispute(
    connection,
    authorityProgram,
    authority,
    {
      disputePda: initiated.disputePda,
      taskPda: created.taskPda,
      creatorPubkey: creator.publicKey,
      workerClaimPda,
      workerAgentPda,
      workerAuthority: worker.publicKey,
      arbiterPairs,
      workerPairs: [
        {
          claimPda: workerClaimPda,
          agentPda: workerAgentPda,
        },
      ],
    },
  );
  console.log(`[step] dispute resolved: ${resolved.txSignature}`);

  const [finalDispute, finalTask] = await Promise.all([
    sdk.getDispute(authorityProgram, initiated.disputePda),
    sdk.getTask(authorityProgram, created.taskPda),
  ]);
  if (!finalDispute || !finalTask) {
    throw new Error("Could not fetch final dispute/task state after resolution.");
  }

  console.log(
    `[result] dispute status=${finalDispute.status} votesFor=${finalDispute.votesFor.toString()} votesAgainst=${finalDispute.votesAgainst.toString()} totalVoters=${finalDispute.totalVoters}`,
  );
  console.log(
    `[result] task state=${sdk.formatTaskState(finalTask.state)} currentWorkers=${finalTask.currentWorkers}`,
  );
}

async function main() {
  if (hasFlag("--help")) {
    usage();
    return;
  }

  if (hasFlag("--resume")) {
    await resume();
    return;
  }

  await initial();
}

main().catch((error) => {
  console.error(
    `[fatal] ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
