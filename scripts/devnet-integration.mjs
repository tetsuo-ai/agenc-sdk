#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";
import crypto from "node:crypto";
import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import * as sdk from "../dist/index.mjs";
import { resolveIdlPath } from "./devnet-helpers.mjs";

const DEFAULT_RPC_URL = process.env.AGENC_RPC_URL ?? sdk.DEVNET_RPC;
const DEFAULT_COMMITMENT = "confirmed";
const DEFAULT_REWARD_LAMPORTS = 10_000_000n; // 0.01 SOL
const DEFAULT_AGENT_ENDPOINT = "https://example.invalid/agenc-devnet-test";

function usage() {
  process.stdout.write(`Usage:
  CREATOR_WALLET=/path/to/creator.json WORKER_WALLET=/path/to/worker.json npm run test:devnet:public

Environment:
  CREATOR_WALLET          Required. Solana keypair JSON for task creator.
  WORKER_WALLET           Required. Solana keypair JSON for task worker.
  AGENC_RPC_URL           Optional. Defaults to ${DEFAULT_RPC_URL}
  AGENC_REWARD_LAMPORTS   Optional. Defaults to ${DEFAULT_REWARD_LAMPORTS.toString()}
  AGENC_IDL_PATH          Required. Path to agenc_coordination.json

What this validates:
  1. Reads protocol config from devnet
  2. Registers a creator agent
  3. Registers a worker agent
  4. Creates a public task
  5. Claims the task
  6. Completes the task
  7. Fetches final on-chain task state
  8. Best-effort deregisters both agents to refund stake
`);
}

function env(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function loadKeypair(path) {
  const raw = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error(`Invalid keypair file: ${path}`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function loadIdl(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function makeWallet(keypair) {
  return {
    publicKey: keypair.publicKey,
    async signTransaction(tx) {
      tx.partialSign(keypair);
      return tx;
    },
    async signAllTransactions(txs) {
      for (const tx of txs) {
        tx.partialSign(keypair);
      }
      return txs;
    },
  };
}

function short(pubkey) {
  const base58 = pubkey.toBase58();
  return `${base58.slice(0, 4)}...${base58.slice(-4)}`;
}

function lamportsToSol(lamports) {
  return Number(lamports) / 1_000_000_000;
}

async function ensureBalance(connection, label, pubkey, minimumLamports) {
  const balance = BigInt(await connection.getBalance(pubkey, DEFAULT_COMMITMENT));
  if (balance < minimumLamports) {
    throw new Error(
      `${label} ${pubkey.toBase58()} has ${balance} lamports (${lamportsToSol(balance)} SOL), ` +
        `needs at least ${minimumLamports} lamports (${lamportsToSol(minimumLamports)} SOL)`,
    );
  }
  return balance;
}

function fixedDescription(text) {
  const out = Buffer.alloc(64);
  const input = Buffer.from(text, "utf8");
  input.copy(out, 0, 0, Math.min(input.length, out.length));
  return out;
}

async function maybeDeregister(connection, program, authority, agentId, label) {
  try {
    const { txSignature } = await sdk.deregisterAgent(
      connection,
      program,
      authority,
      agentId,
    );
    console.log(`[cleanup] ${label} deregistered: ${txSignature}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[cleanup] could not deregister ${label}: ${message}`);
  }
}

async function main() {
  if (process.argv.includes("--help")) {
    usage();
    return;
  }

  const creatorWalletPath = env("CREATOR_WALLET");
  const workerWalletPath = env("WORKER_WALLET");
  const rpcUrl = process.env.AGENC_RPC_URL ?? DEFAULT_RPC_URL;
  const rewardLamports = BigInt(
    process.env.AGENC_REWARD_LAMPORTS ?? DEFAULT_REWARD_LAMPORTS.toString(),
  );
  const idlPath = resolveIdlPath();

  console.log(`[config] rpc: ${rpcUrl}`);
  console.log(`[config] creator wallet: ${creatorWalletPath}`);
  console.log(`[config] worker wallet: ${workerWalletPath}`);
  console.log(`[config] reward lamports: ${rewardLamports.toString()}`);
  console.log(`[config] idl path: ${idlPath}`);

  const [creator, worker] = await Promise.all([
    loadKeypair(creatorWalletPath),
    loadKeypair(workerWalletPath),
  ]);
  const idl = await loadIdl(idlPath);

  if (creator.publicKey.equals(worker.publicKey)) {
    throw new Error(
      "CREATOR_WALLET and WORKER_WALLET must be different for this integration test.",
    );
  }

  const connection = new Connection(rpcUrl, DEFAULT_COMMITMENT);
  const creatorProvider = new AnchorProvider(
    connection,
    makeWallet(creator),
    { commitment: DEFAULT_COMMITMENT },
  );
  const workerProvider = new AnchorProvider(
    connection,
    makeWallet(worker),
    { commitment: DEFAULT_COMMITMENT },
  );

  const creatorProgram = new Program(idl, creatorProvider);
  const workerProgram = new Program(idl, workerProvider);

  const protocolConfig = await sdk.getProtocolConfig(creatorProgram);
  if (!protocolConfig) {
    throw new Error(
      `Protocol config PDA ${sdk.deriveProtocolPda(sdk.PROGRAM_ID).toBase58()} does not exist on ${rpcUrl}`,
    );
  }

  const minStake = protocolConfig.minAgentStake;
  const creatorMinimum = minStake + rewardLamports + 20_000_000n;
  const workerMinimum = minStake + 10_000_000n;

  const [creatorBalance, workerBalance] = await Promise.all([
    ensureBalance(connection, "creator", creator.publicKey, creatorMinimum),
    ensureBalance(connection, "worker", worker.publicKey, workerMinimum),
  ]);

  console.log(
    `[protocol] authority=${protocolConfig.authority.toBase58()} treasury=${protocolConfig.treasury.toBase58()} minStake=${minStake.toString()}`,
  );
  console.log(
    `[balances] creator=${creatorBalance.toString()} (${lamportsToSol(creatorBalance)} SOL) worker=${workerBalance.toString()} (${lamportsToSol(workerBalance)} SOL)`,
  );

  const creatorAgentId = crypto.randomBytes(32);
  const workerAgentId = crypto.randomBytes(32);
  const taskId = crypto.randomBytes(32);
  const proofHash = crypto.randomBytes(32);
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const description = fixedDescription(
    `agenc-sdk devnet integration ${new Date().toISOString()}`,
  );

  console.log(
    `[actors] creator=${short(creator.publicKey)} worker=${short(worker.publicKey)}`,
  );

  let taskPda = null;

  try {
    const creatorReg = await sdk.registerAgent(
      connection,
      creatorProgram,
      creator,
      {
        agentId: creatorAgentId,
        capabilities: 1n,
        endpoint: DEFAULT_AGENT_ENDPOINT,
        metadataUri: null,
        stakeAmount: minStake,
      },
    );
    console.log(`[step] creator agent registered: ${creatorReg.txSignature}`);

    const workerReg = await sdk.registerAgent(
      connection,
      workerProgram,
      worker,
      {
        agentId: workerAgentId,
        capabilities: 1n,
        endpoint: DEFAULT_AGENT_ENDPOINT,
        metadataUri: null,
        stakeAmount: minStake,
      },
    );
    console.log(`[step] worker agent registered: ${workerReg.txSignature}`);

    const created = await sdk.createTask(
      connection,
      creatorProgram,
      creator,
      creatorAgentId,
      {
        taskId,
        requiredCapabilities: 1n,
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
    taskPda = created.taskPda;
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

    const completed = await sdk.completeTask(
      connection,
      workerProgram,
      worker,
      workerAgentId,
      created.taskPda,
      proofHash,
      null,
    );
    console.log(`[step] task completed: ${completed.txSignature}`);

    const task = await sdk.getTask(creatorProgram, created.taskPda);
    if (!task) {
      throw new Error("Task account could not be fetched after completion.");
    }

    console.log(
      `[result] state=${sdk.formatTaskState(task.state)} reward=${task.rewardAmount.toString()} completedAt=${task.completedAt ?? "null"}`,
    );

    if (task.state !== sdk.TaskState.Completed) {
      throw new Error(
        `Expected task state Completed, got ${sdk.formatTaskState(task.state)}`,
      );
    }

    console.log("[success] devnet public integration flow passed");
  } finally {
    await maybeDeregister(connection, creatorProgram, creator, creatorAgentId, "creator agent");
    await maybeDeregister(connection, workerProgram, worker, workerAgentId, "worker agent");

    if (taskPda) {
      console.log(`[final] taskPda=${taskPda.toBase58()}`);
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[failure] ${message}`);
  process.exitCode = 1;
});
