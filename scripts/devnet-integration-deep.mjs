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
const DEFAULT_ENDPOINT = "https://example.invalid/agenc-devnet-deep-test";
const DEFAULT_REWARD = 10_000_000n;
const COOLDOWN_BUFFER_SECONDS = 5;
const DEFAULT_DRIFT_MODE = process.env.AGENC_DEVNET_DRIFT_MODE ?? "compat";

// Keep the compat/strict switch in place, but there are currently no active
// devnet allowances. Re-add entries here only when the deployed program is
// verified to diverge from the local SDK/source expectations again.
const KNOWN_DEVNET_DRIFT = {};

function usage() {
  process.stdout.write(`Usage:
  CREATOR_WALLET=/path/to/creator.json WORKER_WALLET=/path/to/worker.json npm run test:devnet:deep

Environment:
  CREATOR_WALLET          Required
  WORKER_WALLET           Required
  AGENC_RPC_URL           Optional (default: ${DEFAULT_RPC_URL})
  AGENC_IDL_PATH          Required. Path to agenc_coordination.json
  AGENC_DEVNET_DRIFT_MODE Optional: compat|strict (default: ${DEFAULT_DRIFT_MODE})
`);
}

function env(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function loadKeypair(path) {
  const raw = await loadJson(path);
  if (!Array.isArray(raw)) {
    throw new Error(`Invalid keypair file: ${path}`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(raw));
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

function fixedDescription(text) {
  const out = Buffer.alloc(64);
  const input = Buffer.from(text, "utf8");
  input.copy(out, 0, 0, Math.min(input.length, out.length));
  return out;
}

function short(pubkey) {
  const base58 = pubkey.toBase58();
  return `${base58.slice(0, 4)}...${base58.slice(-4)}`;
}

function decodeErrorName(error) {
  const decoded = sdk.decodeAnchorError(error)?.name;
  if (decoded) return decoded;
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/Error Code:\s+([A-Za-z0-9_]+)/);
  return match?.[1] ?? null;
}

function toInt(value, fallback = 0) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object") {
    if (typeof value.toNumber === "function") return value.toNumber();
    if (typeof value.toString === "function") {
      const parsed = Number(value.toString());
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTaskCreationCooldown(seconds, reason) {
  if (seconds <= 0) return;
  const waitSeconds = seconds + COOLDOWN_BUFFER_SECONDS;
  console.log(`[setup] waiting ${waitSeconds}s before ${reason}`);
  await sleep(waitSeconds * 1000);
}

function decodedSummary(error) {
  const decoded = sdk.decodeAnchorError(error);
  const message = error instanceof Error ? error.message : String(error);
  return decoded
    ? `${decoded.name}: ${decoded.message}`
    : message;
}

async function expectFailure(label, allowedNames, fn) {
  try {
    await fn();
  } catch (error) {
    const decodedName = decodeErrorName(error);
    if (decodedName && allowedNames.includes(decodedName)) {
      console.log(`[pass] ${label}: ${decodedName}`);
      return decodedName;
    }
    throw new Error(
      `${label} failed with unexpected error: ${decodedSummary(error)}`,
    );
  }
  throw new Error(
    `${label} unexpectedly succeeded; expected one of ${allowedNames.join(", ")}`,
  );
}

function noteMismatch(mismatches, label, expected, actual) {
  const finding = {
    label,
    expected,
    actual,
    known: KNOWN_DEVNET_DRIFT[label] === actual,
  };
  mismatches.push(finding);
  console.warn(
    `${finding.known ? "[drift]" : "[mismatch]"} ${label}: expected ${expected}, got ${actual}`,
  );
}

async function maybeCancelTask(connection, program, creator, taskPda, label) {
  try {
    const { txSignature } = await sdk.cancelTask(
      connection,
      program,
      creator,
      taskPda,
    );
    console.log(`[cleanup] ${label} cancelled: ${txSignature}`);
  } catch (error) {
    console.warn(`[cleanup] ${label} cancel skipped: ${decodedSummary(error)}`);
  }
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
    console.warn(
      `[cleanup] ${label} deregister skipped: ${decodedSummary(error)}`,
    );
  }
}

async function main() {
  if (process.argv.includes("--help")) {
    usage();
    return;
  }

  const driftMode = DEFAULT_DRIFT_MODE;
  if (driftMode !== "compat" && driftMode !== "strict") {
    throw new Error(
      `Invalid AGENC_DEVNET_DRIFT_MODE: ${driftMode}. Expected compat or strict.`,
    );
  }

  const creatorWalletPath = env("CREATOR_WALLET");
  const workerWalletPath = env("WORKER_WALLET");
  const idlPath = resolveIdlPath();
  const [creator, worker, idl] = await Promise.all([
    loadKeypair(creatorWalletPath),
    loadKeypair(workerWalletPath),
    loadJson(idlPath),
  ]);

  if (creator.publicKey.equals(worker.publicKey)) {
    throw new Error("CREATOR_WALLET and WORKER_WALLET must be different.");
  }

  const connection = new Connection(DEFAULT_RPC_URL, DEFAULT_COMMITMENT);
  const creatorProgram = new Program(
    idl,
    new AnchorProvider(connection, makeWallet(creator), {
      commitment: DEFAULT_COMMITMENT,
    }),
  );
  const workerProgram = new Program(
    idl,
    new AnchorProvider(connection, makeWallet(worker), {
      commitment: DEFAULT_COMMITMENT,
    }),
  );

  const protocolConfig = await sdk.getProtocolConfig(creatorProgram);
  if (!protocolConfig) {
    throw new Error("Protocol config not found on devnet.");
  }

  const creatorAgentId = crypto.randomBytes(32);
  const workerAgentId = crypto.randomBytes(32);
  const createdTasks = [];
  const results = [];
  const mismatches = [];
  const rawProtocolConfig = await creatorProgram.account.protocolConfig.fetch(
    sdk.deriveProtocolPda(creatorProgram.programId),
  );
  const taskCreationCooldown = Math.max(
    toInt(
      rawProtocolConfig.taskCreationCooldown ??
        rawProtocolConfig.task_creation_cooldown,
      60,
    ),
    0,
  );

  console.log(
    `[setup] creator=${short(creator.publicKey)} worker=${short(worker.publicKey)} minStake=${protocolConfig.minAgentStake.toString()} taskCreationCooldown=${taskCreationCooldown}s driftMode=${driftMode}`,
  );

  try {
    const belowMinStakeResult = await expectFailure(
      "register agent below min stake",
      ["InsufficientStake", "InsufficientFunds"],
      async () =>
        sdk.registerAgent(connection, creatorProgram, creator, {
          agentId: crypto.randomBytes(32),
          capabilities: 1n,
          endpoint: DEFAULT_ENDPOINT,
          metadataUri: null,
          stakeAmount: protocolConfig.minAgentStake - 1n,
        }),
    );
    results.push(belowMinStakeResult);
    if (belowMinStakeResult !== "InsufficientStake") {
      noteMismatch(
        mismatches,
        "register agent below min stake",
        "InsufficientStake",
        belowMinStakeResult,
      );
    }

    const creatorRegistration = await sdk.registerAgent(
      connection,
      creatorProgram,
      creator,
      {
        agentId: creatorAgentId,
        capabilities: 2n,
        endpoint: DEFAULT_ENDPOINT,
        metadataUri: null,
        stakeAmount: protocolConfig.minAgentStake,
      },
    );
    console.log(
      `[step] creator agent registered: ${creatorRegistration.txSignature}`,
    );

    const workerRegistration = await sdk.registerAgent(
      connection,
      workerProgram,
      worker,
      {
        agentId: workerAgentId,
        capabilities: 1n,
        endpoint: DEFAULT_ENDPOINT,
        metadataUri: null,
        stakeAmount: protocolConfig.minAgentStake,
      },
    );
    console.log(
      `[step] worker agent registered: ${workerRegistration.txSignature}`,
    );

    if (taskCreationCooldown > 0) {
      console.log(
        `[setup] waiting ${taskCreationCooldown + COOLDOWN_BUFFER_SECONDS}s for task creation cooldown`,
      );
      await sleep((taskCreationCooldown + COOLDOWN_BUFFER_SECONDS) * 1000);
    }

    const pastDeadlineResult = await expectFailure(
      "create task with past deadline",
      ["InvalidInput", "InvalidDeadline", "CooldownNotElapsed", "UpdateTooFrequent"],
      async () =>
        sdk.createTask(connection, creatorProgram, creator, creatorAgentId, {
          taskId: crypto.randomBytes(32),
          requiredCapabilities: 1n,
          description: fixedDescription("past deadline should fail"),
          rewardAmount: DEFAULT_REWARD,
          maxWorkers: 1,
          deadline: Math.floor(Date.now() / 1000) - 60,
          taskType: 0,
          constraintHash: null,
          minReputation: 0,
          rewardMint: null,
        }),
    );
    results.push(pastDeadlineResult);
    if (pastDeadlineResult !== "InvalidInput") {
      noteMismatch(
        mismatches,
        "create task with past deadline",
        "InvalidInput",
        pastDeadlineResult,
      );
    }
    if (
      pastDeadlineResult === "CooldownNotElapsed" ||
      pastDeadlineResult === "UpdateTooFrequent"
    ) {
      console.log("[setup] waiting extra 10s after cooldown-style mismatch");
      await sleep(10_000);
    }

    const capabilityTask = await sdk.createTask(
      connection,
      creatorProgram,
      creator,
      creatorAgentId,
      {
        taskId: crypto.randomBytes(32),
        requiredCapabilities: 2n,
        description: fixedDescription("capability mismatch"),
        rewardAmount: DEFAULT_REWARD,
        maxWorkers: 1,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        taskType: 0,
        constraintHash: null,
        minReputation: 0,
        rewardMint: null,
      },
    );
    createdTasks.push({ taskPda: capabilityTask.taskPda, label: "capability task" });

    results.push(
      await expectFailure(
        "reject insufficient capabilities on claim",
        ["InsufficientCapabilities"],
        async () =>
          sdk.claimTask(
            connection,
            workerProgram,
            worker,
            workerAgentId,
            capabilityTask.taskPda,
          ),
      ),
    );

    const selfClaimResult = await expectFailure(
      "reject self-claim by creator",
      ["SelfTaskNotAllowed", "ProposalUnauthorizedCancel"],
      async () =>
        sdk.claimTask(
          connection,
          creatorProgram,
          creator,
          creatorAgentId,
          capabilityTask.taskPda,
        ),
    );
    results.push(selfClaimResult);
    if (selfClaimResult !== "SelfTaskNotAllowed") {
      noteMismatch(
        mismatches,
        "reject self-claim by creator",
        "SelfTaskNotAllowed",
        selfClaimResult,
      );
    }

    await maybeCancelTask(
      connection,
      creatorProgram,
      creator,
      capabilityTask.taskPda,
      "capability task",
    );
    await waitForTaskCreationCooldown(
      taskCreationCooldown,
      "creating the unclaimed task",
    );

    const unclaimedTask = await sdk.createTask(
      connection,
      creatorProgram,
      creator,
      creatorAgentId,
      {
        taskId: crypto.randomBytes(32),
        requiredCapabilities: 1n,
        description: fixedDescription("complete without claim"),
        rewardAmount: DEFAULT_REWARD,
        maxWorkers: 1,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        taskType: 0,
        constraintHash: null,
        minReputation: 0,
        rewardMint: null,
      },
    );
    createdTasks.push({ taskPda: unclaimedTask.taskPda, label: "unclaimed task" });

    const completeWithoutClaimResult = await expectFailure(
      "reject complete without claim",
      ["NotClaimed", "AccountNotInitialized"],
      async () =>
        sdk.completeTask(
          connection,
          workerProgram,
          worker,
          workerAgentId,
          unclaimedTask.taskPda,
          crypto.randomBytes(32),
          null,
        ),
    );
    results.push(completeWithoutClaimResult);
    if (completeWithoutClaimResult !== "NotClaimed") {
      noteMismatch(
        mismatches,
        "reject complete without claim",
        "NotClaimed",
        completeWithoutClaimResult,
      );
    }

    await maybeCancelTask(
      connection,
      creatorProgram,
      creator,
      unclaimedTask.taskPda,
      "unclaimed task",
    );
    await waitForTaskCreationCooldown(
      taskCreationCooldown,
      "creating the happy-path task",
    );

    const happyTask = await sdk.createTask(
      connection,
      creatorProgram,
      creator,
      creatorAgentId,
      {
        taskId: crypto.randomBytes(32),
        requiredCapabilities: 1n,
        description: fixedDescription("deep happy path"),
        rewardAmount: DEFAULT_REWARD,
        maxWorkers: 1,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        taskType: 0,
        constraintHash: null,
        minReputation: 0,
        rewardMint: null,
      },
    );
    createdTasks.push({ taskPda: happyTask.taskPda, label: "happy task" });
    console.log(`[step] happy task created: ${happyTask.txSignature}`);

    const claimResult = await sdk.claimTask(
      connection,
      workerProgram,
      worker,
      workerAgentId,
      happyTask.taskPda,
    );
    console.log(`[step] happy task claimed: ${claimResult.txSignature}`);

    results.push(
      await expectFailure(
        "reject deregister with active task",
        ["AgentHasActiveTasks"],
        async () =>
          sdk.deregisterAgent(
            connection,
            workerProgram,
            worker,
            workerAgentId,
          ),
      ),
    );

    const completed = await sdk.completeTask(
      connection,
      workerProgram,
      worker,
      workerAgentId,
      happyTask.taskPda,
      crypto.randomBytes(32),
      null,
    );
    console.log(`[step] happy task completed: ${completed.txSignature}`);

    const cancelAfterCompleteResult = await expectFailure(
      "reject cancel after complete",
      [
        "InvalidStatusTransition",
        "TaskCannotBeCancelled",
        "AccountNotInitialized",
        "InvalidAccountOwner",
      ],
      async () =>
        sdk.cancelTask(
          connection,
          creatorProgram,
          creator,
          happyTask.taskPda,
        ),
    );
    results.push(cancelAfterCompleteResult);
    if (
      cancelAfterCompleteResult !== "InvalidStatusTransition" &&
      cancelAfterCompleteResult !== "TaskCannotBeCancelled" &&
      cancelAfterCompleteResult !== "InvalidAccountOwner"
    ) {
      noteMismatch(
        mismatches,
        "reject cancel after complete",
        "InvalidStatusTransition|TaskCannotBeCancelled|InvalidAccountOwner",
        cancelAfterCompleteResult,
      );
    }

    const finalTask = await sdk.getTask(creatorProgram, happyTask.taskPda);
    if (!finalTask || finalTask.state !== sdk.TaskState.Completed) {
      throw new Error("Happy task did not end in Completed state.");
    }

    const summary = await sdk.getTaskLifecycleSummary(
      creatorProgram,
      happyTask.taskPda,
    );
    console.log(
      `[verify] happy task state=${sdk.formatTaskState(finalTask.state)} currentWorkers=${finalTask.currentWorkers} timeline=${summary?.timeline.length ?? 0}`,
    );

    console.log(
      `[success] deep devnet suite passed with ${results.length} negative-path assertions`,
    );
    if (mismatches.length > 0) {
      const known = mismatches.filter((mismatch) => mismatch.known);
      const unknown = mismatches.filter((mismatch) => !mismatch.known);

      console.warn(
        `[drift] observed ${mismatches.length} semantic mismatch(es): ${mismatches
          .map(
            (mismatch) =>
              `${mismatch.label}: expected ${mismatch.expected}, got ${mismatch.actual}`,
          )
          .join("; ")}`,
      );

      if (driftMode === "strict" || unknown.length > 0) {
        throw new Error(
          `Deep suite found ${mismatches.length} semantic mismatch(es): ${mismatches
            .map(
              (mismatch) =>
                `${mismatch.label}: expected ${mismatch.expected}, got ${mismatch.actual}`,
            )
            .join("; ")}`,
        );
      }

      console.log(
        `[compat] completed with ${known.length} known devnet drift mapping(s); strict mode would fail`,
      );
    }
  } finally {
    for (const task of createdTasks) {
      await maybeCancelTask(
        connection,
        creatorProgram,
        creator,
        task.taskPda,
        task.label,
      );
    }

    await maybeDeregister(
      connection,
      creatorProgram,
      creator,
      creatorAgentId,
      "creator agent",
    );
    await maybeDeregister(
      connection,
      workerProgram,
      worker,
      workerAgentId,
      "worker agent",
    );
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[failure] ${message}`);
  process.exitCode = 1;
});
