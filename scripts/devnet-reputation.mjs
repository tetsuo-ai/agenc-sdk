#!/usr/bin/env node

import process from "node:process";
import { PublicKey } from "@solana/web3.js";
import * as sdk from "../dist/index.mjs";
import {
  DEFAULT_AGENT_ENDPOINT,
  ensureBalance,
  ensureDistinctWallets,
  env,
  formatUnix,
  getFlagValue,
  hasFlag,
  lamportsToSol,
  loadPrograms,
  randomBytes32,
  readArtifact,
  resolveIdlPath,
  waitUntilUnix,
  writeArtifact,
} from "./devnet-helpers.mjs";

const DEFAULT_RPC_URL = process.env.AGENC_RPC_URL ?? sdk.DEVNET_RPC;
const DEFAULT_STAKE_LAMPORTS = 5_000_000n;
const DEFAULT_DELEGATION_AMOUNT = 250;
const DEFAULT_MAX_WAIT_SECONDS = 90;
const REPUTATION_STAKE_COOLDOWN_SECONDS = 604_800;
const MIN_DELEGATION_DURATION_SECONDS = 604_800;
const CAP_COMPUTE = 1n;

function usage() {
  process.stdout.write(`Usage:
  DELEGATOR_WALLET=/path/to/delegator.json \\
  DELEGATEE_WALLET=/path/to/delegatee.json \\
  npm run test:devnet:reputation

  DELEGATOR_WALLET=/path/to/delegator.json npm run test:devnet:reputation -- --resume /tmp/agenc-sdk-devnet/reputation-....json

Environment:
  DELEGATOR_WALLET              Required.
  DELEGATEE_WALLET              Required for initial run.
  AGENC_RPC_URL                 Optional. Defaults to ${DEFAULT_RPC_URL}
  AGENC_IDL_PATH                Required for initial run. Optional on --resume if stored in the artifact.
  AGENC_REPUTATION_STAKE_LAMPORTS
                                Optional. Defaults to ${DEFAULT_STAKE_LAMPORTS.toString()}
  AGENC_REPUTATION_DELEGATION_AMOUNT
                                Optional. Defaults to ${DEFAULT_DELEGATION_AMOUNT}
  AGENC_MAX_WAIT_SECONDS        Optional. Defaults to ${DEFAULT_MAX_WAIT_SECONDS}

What this validates:
  1. Registers delegator and delegatee agents
  2. Stakes SOL on reputation
  3. Delegates reputation
  4. Revoke delegation and withdraw stake after cooldown
  5. Writes a resume artifact when the cooldown window is still open

Important:
  The protocol enforces a 7-day lock for both stake withdrawal and delegation
  revocation, so public devnet requires an initial run and a later --resume run.
`);
}

function encodeBytes(bytes) {
  return Buffer.from(bytes).toString("hex");
}

function decodeBytes(value) {
  return Uint8Array.from(Buffer.from(value, "hex"));
}

async function resume() {
  const resumePath = getFlagValue("--resume");
  if (!resumePath) {
    throw new Error("Missing resume artifact path. Use --resume /path/to/file.json");
  }

  const delegatorWalletPath = env("DELEGATOR_WALLET");
  const artifact = await readArtifact(resumePath);
  const rpcUrl = process.env.AGENC_RPC_URL ?? artifact.rpcUrl ?? DEFAULT_RPC_URL;
  const idlPath = resolveIdlPath(artifact.idlPath ?? null);

  console.log(`[resume] artifact: ${resumePath}`);
  console.log(`[resume] rpc: ${rpcUrl}`);
  console.log(`[resume] idl path: ${idlPath}`);
  console.log(`[resume] delegator wallet: ${delegatorWalletPath}`);

  const { connection, keypairs, programs } = await loadPrograms({
    rpcUrl,
    idlPath,
    wallets: {
      delegator: delegatorWalletPath,
    },
  });

  const delegator = keypairs.delegator;
  const delegatorProgram = programs.delegator;
  const delegatorAgentId = decodeBytes(artifact.delegatorAgentId);
  const delegateeAgentId = decodeBytes(artifact.delegateeAgentId);
  const delegationPda = new PublicKey(artifact.delegationPda);
  const reputationStakePda = new PublicKey(artifact.reputationStakePda);

  const [stakeBefore, delegationBefore] = await Promise.all([
    sdk.getReputationStake(delegatorProgram, reputationStakePda),
    sdk.getReputationDelegation(delegatorProgram, delegationPda),
  ]);

  if (Date.now() / 1000 < artifact.readyAt) {
    console.log(
      `[resume] cooldown still active until ${formatUnix(artifact.readyAt)}. Re-run after that time.`,
    );
    return;
  }

  if (delegationBefore) {
    const revoked = await sdk.revokeDelegation(
      connection,
      delegatorProgram,
      delegator,
      delegatorAgentId,
      delegateeAgentId,
    );
    console.log(`[resume] delegation revoked: ${revoked.txSignature}`);
  } else {
    console.log("[resume] delegation already revoked; skipping revoke step.");
  }

  const stakeAfterRevoke = await sdk.getReputationStake(
    delegatorProgram,
    reputationStakePda,
  );
  if (stakeAfterRevoke && stakeAfterRevoke.stakedAmount > 0n) {
    const withdrawn = await sdk.withdrawReputationStake(
      connection,
      delegatorProgram,
      delegator,
      delegatorAgentId,
      stakeAfterRevoke.stakedAmount,
    );
    console.log(`[resume] reputation stake withdrawn: ${withdrawn.txSignature}`);
  } else {
    console.log("[resume] reputation stake already empty; skipping withdraw step.");
  }

  const [finalStake, finalDelegation] = await Promise.all([
    sdk.getReputationStake(delegatorProgram, reputationStakePda),
    sdk.getReputationDelegation(delegatorProgram, delegationPda),
  ]);

  if (finalDelegation) {
    throw new Error("Delegation still exists after revoke step.");
  }

  console.log(
    `[result] delegation revoked=true remainingStake=${finalStake?.stakedAmount.toString() ?? "missing"}`,
  );
}

async function initial() {
  const delegatorWalletPath = env("DELEGATOR_WALLET");
  const delegateeWalletPath = env("DELEGATEE_WALLET");
  const rpcUrl = process.env.AGENC_RPC_URL ?? DEFAULT_RPC_URL;
  const idlPath = resolveIdlPath();
  const stakeLamports = BigInt(
    process.env.AGENC_REPUTATION_STAKE_LAMPORTS ??
      process.env.AGENC_REPUTATION_STAKE ??
      DEFAULT_STAKE_LAMPORTS.toString(),
  );
  const delegationAmount = Number(
    process.env.AGENC_REPUTATION_DELEGATION_AMOUNT ??
      process.env.AGENC_DELEGATION_AMOUNT ??
      DEFAULT_DELEGATION_AMOUNT,
  );
  const maxWaitSeconds = Number(
    process.env.AGENC_MAX_WAIT_SECONDS ?? DEFAULT_MAX_WAIT_SECONDS,
  );

  if (delegationAmount < 100 || delegationAmount > 5_000) {
    throw new Error(
      `AGENC_REPUTATION_DELEGATION_AMOUNT must be between 100 and 5000, received ${delegationAmount}`,
    );
  }

  console.log(`[config] rpc: ${rpcUrl}`);
  console.log(`[config] idl path: ${idlPath}`);
  console.log(`[config] delegator wallet: ${delegatorWalletPath}`);
  console.log(`[config] delegatee wallet: ${delegateeWalletPath}`);
  console.log(`[config] stake lamports: ${stakeLamports.toString()}`);
  console.log(`[config] delegation amount: ${delegationAmount}`);
  console.log(`[config] max wait seconds: ${maxWaitSeconds}`);

  const { connection, keypairs, programs } = await loadPrograms({
    rpcUrl,
    idlPath,
    wallets: {
      delegator: delegatorWalletPath,
      delegatee: delegateeWalletPath,
    },
  });

  ensureDistinctWallets(keypairs);

  const delegator = keypairs.delegator;
  const delegatee = keypairs.delegatee;
  const delegatorProgram = programs.delegator;
  const delegateeProgram = programs.delegatee;

  const protocolConfig = await sdk.getProtocolConfig(delegatorProgram);
  if (!protocolConfig) {
    throw new Error("Protocol config PDA could not be fetched from devnet.");
  }

  const delegatorMinimum =
    protocolConfig.minAgentStake + stakeLamports + 10_000_000n;
  const delegateeMinimum = protocolConfig.minAgentStake + 10_000_000n;

  const [delegatorBalance, delegateeBalance] = await Promise.all([
    ensureBalance(
      connection,
      "delegator",
      delegator.publicKey,
      delegatorMinimum,
    ),
    ensureBalance(
      connection,
      "delegatee",
      delegatee.publicKey,
      delegateeMinimum,
    ),
  ]);

  console.log(
    `[protocol] minAgentStake=${protocolConfig.minAgentStake.toString()}`,
  );
  console.log(
    `[balances] delegator=${lamportsToSol(delegatorBalance)} SOL delegatee=${lamportsToSol(delegateeBalance)} SOL`,
  );

  const delegatorAgentId = randomBytes32();
  const delegateeAgentId = randomBytes32();

  const registrations = await Promise.all([
    sdk.registerAgent(connection, delegatorProgram, delegator, {
      agentId: delegatorAgentId,
      capabilities: CAP_COMPUTE,
      endpoint: DEFAULT_AGENT_ENDPOINT,
      metadataUri: null,
      stakeAmount: protocolConfig.minAgentStake,
    }),
    sdk.registerAgent(connection, delegateeProgram, delegatee, {
      agentId: delegateeAgentId,
      capabilities: CAP_COMPUTE,
      endpoint: DEFAULT_AGENT_ENDPOINT,
      metadataUri: null,
      stakeAmount: protocolConfig.minAgentStake,
    }),
  ]);

  console.log(
    `[step] agents registered: delegator=${registrations[0].txSignature} delegatee=${registrations[1].txSignature}`,
  );

  const staked = await sdk.stakeReputation(
    connection,
    delegatorProgram,
    delegator,
    delegatorAgentId,
    stakeLamports,
  );
  console.log(
    `[step] reputation staked: ${staked.txSignature} stakePda=${staked.reputationStakePda.toBase58()}`,
  );

  const delegated = await sdk.delegateReputation(
    connection,
    delegatorProgram,
    delegator,
    delegatorAgentId,
    delegateeAgentId,
    {
      amount: delegationAmount,
      expiresAt: 0,
    },
  );
  console.log(
    `[step] reputation delegated: ${delegated.txSignature} delegationPda=${delegated.delegationPda.toBase58()}`,
  );

  const [stakeState, delegationState] = await Promise.all([
    sdk.getReputationStake(delegatorProgram, staked.reputationStakePda),
    sdk.getReputationDelegation(delegatorProgram, delegated.delegationPda),
  ]);

  if (!stakeState) {
    throw new Error("Reputation stake account could not be fetched after staking.");
  }
  if (!delegationState) {
    throw new Error("Delegation account could not be fetched after delegation.");
  }

  const revokeAfter =
    Number(delegationState.createdAt) + MIN_DELEGATION_DURATION_SECONDS;
  const readyAt = Math.max(Number(stakeState.lockedUntil), revokeAfter);

  console.log(
    `[result] before cooldown remainingStake=${stakeState.stakedAmount.toString()} delegated=${delegationState.amount} readyAt=${formatUnix(readyAt)}`,
  );

  const ready = await waitUntilUnix(
    readyAt,
    "reputation cooldown completion",
    maxWaitSeconds,
  );
  if (!ready) {
    const artifactPath = await writeArtifact("reputation", {
      version: 1,
      kind: "reputation",
      rpcUrl,
      idlPath,
      readyAt,
      stakedAmount: stakeState.stakedAmount.toString(),
      reputationStakePda: staked.reputationStakePda.toBase58(),
      delegationPda: delegated.delegationPda.toBase58(),
      delegatorAgentId: encodeBytes(delegatorAgentId),
      delegateeAgentId: encodeBytes(delegateeAgentId),
      stakeLockedUntil: Number(stakeState.lockedUntil),
      revokeAfter,
    });

    console.log(
      `[artifact] reputation cooldown deferred until ${formatUnix(readyAt)}: ${artifactPath}`,
    );
    console.log(
      `[artifact] resume with: DELEGATOR_WALLET=/path/to/delegator.json npm run test:devnet:reputation -- --resume ${artifactPath}`,
    );
    return;
  }

  console.log(
    "[result] cooldown unexpectedly fit within max wait window; rerun with --resume support if this environment differs from public devnet.",
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
