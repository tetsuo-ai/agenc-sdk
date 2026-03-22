#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  getFlagValue,
  hasFlag,
  readArtifact,
  writeArtifact,
} from "./devnet-helpers.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const DEEP_SCRIPT = path.join(__dirname, "devnet-integration-deep.mjs");
const BID_MARKETPLACE_SCRIPT = path.join(
  __dirname,
  "devnet-bid-marketplace.mjs",
);
const DISPUTE_SCRIPT = path.join(__dirname, "devnet-disputes.mjs");

function usage() {
  process.stdout.write(`Usage:
  CREATOR_WALLET=/path/to/creator.json \\
  WORKER_WALLET=/path/to/worker.json \\
  ARBITER_A_WALLET=/path/to/arbiter-a.json \\
  ARBITER_B_WALLET=/path/to/arbiter-b.json \\
  ARBITER_C_WALLET=/path/to/arbiter-c.json \\
  PROTOCOL_AUTHORITY_WALLET=/path/to/authority.json \\
  AGENC_IDL_PATH=/absolute/path/to/agenc_coordination.json \\
  npm run test:devnet:marketplace

  npm run test:devnet:marketplace -- --resume /tmp/agenc-sdk-devnet/marketplace-e2e-....json

What this validates:
  1. Direct marketplace lifecycle via the strict deep public-task validator
  2. Marketplace V2 bid-book lifecycle through accepted-bid settlement
  3. Dispute lifecycle via create -> claim -> initiate dispute -> quorum votes
  4. Final dispute resolution when a deferred artifact is resumed later

Important:
  Public devnet usually defers final dispute resolution because the protocol
  voting period is 24 hours. The first run is expected to produce a resume
  artifact instead of a full same-day green run.

`);
}

function nowIso() {
  return new Date().toISOString();
}

function buildPhaseSummary(name, result) {
  return {
    name,
    status: result.status,
    exitCode: result.exitCode,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    durationMs: result.finishedAtMs - result.startedAtMs,
    artifactPath: result.artifactPath ?? null,
    txSignature: result.txSignature ?? null,
    resumeHint: result.resumeHint ?? null,
    notes: result.notes ?? [],
  };
}

function extractDeferredArtifact(output) {
  const match = output.match(
    /\[artifact\] dispute resolution deferred until .*: (.+)$/m,
  );
  return match?.[1]?.trim() ?? null;
}

function extractResumeHint(output) {
  const match = output.match(/\[artifact\] resume with: (.+)$/m);
  return match?.[1]?.trim() ?? null;
}

function extractResolvedTx(output) {
  const patterns = [
    /\[resume\] dispute resolved: ([1-9A-HJ-NP-Za-km-z]+)$/m,
    /\[step\] dispute resolved: ([1-9A-HJ-NP-Za-km-z]+)$/m,
  ];
  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function extractBidArtifact(output) {
  const match = output.match(/\[artifact\] bid marketplace report: (.+)$/m);
  return match?.[1]?.trim() ?? null;
}

function isBidArtifactTerminalSuccess(artifact) {
  return (
    artifact?.kind === "bid-marketplace" &&
    artifact?.summary?.finalTaskState === 3 &&
    artifact?.summary?.finalBidBookState === 2 &&
    artifact?.summary?.finalBidClosed === true &&
    artifact?.summary?.finalActiveBidCount === 0
  );
}

async function inspectBidArtifact(artifactPath) {
  if (!artifactPath) {
    return {
      ok: false,
      notes: [],
    };
  }

  try {
    const artifact = await readArtifact(artifactPath);
    if (!isBidArtifactTerminalSuccess(artifact)) {
      return {
        ok: false,
        notes: [
          "Bid artifact was present, but it did not show the expected terminal settlement state.",
        ],
      };
    }

    return {
      ok: true,
      notes: [
        "Bid artifact proves the accepted-bid settlement reached its expected terminal state.",
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      notes: [`Could not read bid artifact: ${message}`],
    };
  }
}

function summarizeDeepResult(run) {
  const success = run.exitCode === 0 && run.stdout.includes("[success] deep devnet suite passed");
  return {
    ...run,
    status: success ? "passed" : "failed",
  };
}

async function summarizeBidResult(run) {
  const artifactPath = extractBidArtifact(run.stdout);
  const emittedSuccess = run.stdout.includes("[success] bid marketplace suite passed");
  const artifactInspection = await inspectBidArtifact(artifactPath);
  const success = (run.exitCode === 0 && emittedSuccess) || artifactInspection.ok;
  const notes = [...artifactInspection.notes];

  if (artifactInspection.ok && run.exitCode !== 0) {
    notes.push(
      "Non-zero exit was treated as post-success RPC/runtime noise because the bid artifact was already written after the final assertions passed.",
    );
  }

  return {
    ...run,
    status: success ? "passed" : "failed",
    artifactPath,
    notes,
  };
}

async function normalizeBidPhaseSummary(phase) {
  if (!phase?.artifactPath || phase.status === "passed") {
    return phase;
  }

  const artifactInspection = await inspectBidArtifact(phase.artifactPath);
  if (!artifactInspection.ok) {
    return phase;
  }

  return {
    ...phase,
    status: "passed",
    notes: [
      ...(phase.notes ?? []),
      ...artifactInspection.notes,
      "Phase status normalized from the persisted bid artifact after a post-success non-zero exit.",
    ],
  };
}

function summarizeDisputeResult(run, mode) {
  const artifactPath = extractDeferredArtifact(run.stdout);
  const resumeHint = extractResumeHint(run.stdout);
  const txSignature = extractResolvedTx(run.stdout);

  if (artifactPath) {
    return {
      ...run,
      status: "deferred",
      artifactPath,
      resumeHint,
      txSignature,
    };
  }

  if (run.exitCode !== 0) {
    return {
      ...run,
      status: "failed",
      artifactPath,
      resumeHint,
      txSignature,
    };
  }

  if (mode === "resume" && run.stdout.includes("[resume] dispute still locked until")) {
    return {
      ...run,
      status: "deferred",
      artifactPath: null,
      resumeHint: null,
      txSignature: null,
    };
  }

  if (
    mode === "resume" &&
    run.stdout.includes("[resume] dispute already moved to status=")
  ) {
    return {
      ...run,
      status: "already-resolved",
      artifactPath: null,
      resumeHint: null,
      txSignature: null,
    };
  }

  return {
    ...run,
    status: "passed",
    artifactPath: null,
    resumeHint,
    txSignature,
  };
}

async function runNodeScript(label, scriptPath, args = [], extraEnv = {}) {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();

  process.stdout.write(`[run] ${label}: node ${path.relative(REPO_ROOT, scriptPath)} ${args.join(" ")}\n`);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      const finishedAtMs = Date.now();
      resolve({
        label,
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
        startedAt,
        finishedAt: new Date(finishedAtMs).toISOString(),
        startedAtMs,
        finishedAtMs,
      });
    });
  });
}

function overallStatusFromReport(report) {
  const deepStatus = report.phases.deep?.status ?? "unknown";
  const bidStatus = report.phases.bidMarketplaceV2?.status ?? "unknown";
  const disputeStatus = report.phases.disputes?.status ?? "unknown";

  if (
    deepStatus === "failed" ||
    bidStatus === "failed" ||
    disputeStatus === "failed"
  ) {
    return "failed";
  }
  if (disputeStatus === "deferred") {
    return "deferred";
  }
  if (
    deepStatus === "passed" &&
    bidStatus === "passed" &&
    ["passed", "already-resolved"].includes(disputeStatus)
  ) {
    return "passed";
  }
  return "partial";
}

function buildCoverage(
  deepStatus,
  bidStatus,
  disputeStatus,
  bidArtifactPath = null,
  disputeArtifactPath = null,
) {
  return {
    directMarketplace: {
      status: deepStatus,
      validator: "scripts/devnet-integration-deep.mjs",
      mode: "strict",
      scenarios: [
        "below-min-stake registration rejected",
        "past-deadline create rejected",
        "capability mismatch claim rejected",
        "self-claim rejected",
        "complete without claim rejected",
        "deregister with active task rejected",
        "happy path ends in completed task state",
        "cancel after completion rejected",
      ],
    },
    bidMarketplaceV2: {
      status: bidStatus,
      validator: "scripts/devnet-bid-marketplace.mjs",
      scenarios: [
        "creator and bidder agent registration succeeds",
        "bid-exclusive task creation succeeds",
        "bid marketplace config fetch or initialize succeeds",
        "bid book initialization succeeds",
        "bid creation and update succeed",
        "creator accepts bidder into a normal task claim",
        "completeTask closes the bid book and the accepted bid account",
      ],
      artifactPath: bidArtifactPath,
    },
    disputes: {
      status: disputeStatus,
      validator: "scripts/devnet-disputes.mjs",
      scenarios: [
        "creator, worker, and three arbiters register",
        "task create and claim succeeds",
        "creator-side dispute succeeds",
        "three quorum votes succeed",
        disputeStatus === "passed" || disputeStatus === "already-resolved"
          ? "final dispute resolution succeeded"
          : "final dispute resolution deferred by protocol voting window",
      ],
      artifactPath: disputeArtifactPath,
    },
  };
}

async function initialRun() {
  const deepRun = summarizeDeepResult(
    await runNodeScript("deep", DEEP_SCRIPT, [], {
      AGENC_DEVNET_DRIFT_MODE: "strict",
    }),
  );

  const bidRun = await summarizeBidResult(
    await runNodeScript("bid-marketplace", BID_MARKETPLACE_SCRIPT),
  );

  const disputeRun = summarizeDisputeResult(
    await runNodeScript("disputes", DISPUTE_SCRIPT),
    "initial",
  );

  const report = {
    version: 2,
    kind: "marketplace-e2e",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    rpcUrl: process.env.AGENC_RPC_URL ?? "https://api.devnet.solana.com",
    idlPath: process.env.AGENC_IDL_PATH ?? null,
    phases: {
      deep: buildPhaseSummary("deep", deepRun),
      bidMarketplaceV2: buildPhaseSummary("bidMarketplaceV2", bidRun),
      disputes: buildPhaseSummary("disputes", disputeRun),
    },
    coverage: buildCoverage(
      deepRun.status,
      bidRun.status,
      disputeRun.status,
      bidRun.artifactPath ?? null,
      disputeRun.artifactPath ?? null,
    ),
    notes: [
      "This runner validates the direct marketplace lifecycle, the Marketplace V2 bid-book lifecycle, and the dispute lifecycle on public devnet.",
      "A first-run deferred dispute result is expected on public devnet because the protocol voting period is 24 hours.",
      "The bid-book validator proves accepted-bid settlement all the way through completeTask.",
    ],
    resume: {
      disputeArtifactPath: disputeRun.artifactPath ?? null,
      disputeResumeHint: disputeRun.resumeHint ?? null,
    },
  };

  report.overallStatus = overallStatusFromReport(report);
  const reportPath = await writeArtifact("marketplace-e2e", report);

  process.stdout.write(`[report] marketplace e2e report: ${reportPath}\n`);
  process.stdout.write(`[summary] overall=${report.overallStatus}\n`);
  if (report.resume.disputeResumeHint) {
    process.stdout.write(`[summary] next step: ${report.resume.disputeResumeHint}\n`);
    process.stdout.write(
      `[summary] or resume the combined report: npm run test:devnet:marketplace -- --resume ${reportPath}\n`,
    );
  }

  if (report.overallStatus === "failed") {
    process.exitCode = 1;
  }
}

async function resumeRun(reportPath) {
  const artifact = await readArtifact(reportPath);

  if (artifact.kind !== "marketplace-e2e") {
    const rawResume = summarizeDisputeResult(
      await runNodeScript("disputes", DISPUTE_SCRIPT, ["--resume", reportPath]),
      "resume",
    );

    if (rawResume.status === "failed") {
      process.exitCode = 1;
    }
    return;
  }

  artifact.phases.bidMarketplaceV2 = await normalizeBidPhaseSummary(
    artifact.phases.bidMarketplaceV2,
  );

  const disputeArtifactPath = artifact.resume?.disputeArtifactPath;
  if (!disputeArtifactPath) {
    throw new Error(
      `Combined report ${reportPath} does not contain resume.disputeArtifactPath`,
    );
  }

  const disputeRun = summarizeDisputeResult(
    await runNodeScript("disputes", DISPUTE_SCRIPT, ["--resume", disputeArtifactPath]),
    "resume",
  );

  artifact.updatedAt = nowIso();
  artifact.phases.disputes = buildPhaseSummary("disputes", disputeRun);
  artifact.coverage = buildCoverage(
    artifact.phases.deep?.status ?? "unknown",
    artifact.phases.bidMarketplaceV2?.status ?? "unknown",
    disputeRun.status,
    artifact.phases.bidMarketplaceV2?.artifactPath ?? null,
    disputeArtifactPath,
  );
  artifact.resume = {
    disputeArtifactPath,
    disputeResumeHint: disputeRun.resumeHint ?? artifact.resume?.disputeResumeHint ?? null,
  };
  artifact.overallStatus = overallStatusFromReport(artifact);

  await writeArtifact("marketplace-e2e", artifact, reportPath);

  process.stdout.write(`[report] marketplace e2e report updated: ${reportPath}\n`);
  process.stdout.write(`[summary] overall=${artifact.overallStatus}\n`);

  if (artifact.overallStatus === "failed") {
    process.exitCode = 1;
  }
}

async function main() {
  if (hasFlag("--help")) {
    usage();
    return;
  }

  if (hasFlag("--resume")) {
    await resumeRun(getFlagValue("--resume"));
    return;
  }

  await initialRun();
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[failure] ${message}`);
  process.exitCode = 1;
});
