#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SDK_REPO = path.resolve(__dirname, "..");
const DEFAULT_PROTOCOL_REPO = path.resolve(
  DEFAULT_SDK_REPO,
  "..",
  "agenc-protocol-prprep",
);

function usage() {
  process.stdout.write(`Usage:
  npm run test:devnet:release-check

Optional environment:
  AGENC_SDK_REPO        Override the SDK repo path. Defaults to ${DEFAULT_SDK_REPO}
  AGENC_PROTOCOL_REPO   Override the protocol repo path. Defaults to ${DEFAULT_PROTOCOL_REPO}

What this checks:
  1. SDK worktree is clean
  2. Protocol worktree is clean
  3. Both paths resolve to git repos before cutting a release candidate
`);
}

function runGit(repoPath, args) {
  const result = spawnSync("git", args, {
    cwd: repoPath,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function inspectRepo(label, repoPath) {
  if (!existsSync(repoPath)) {
    return {
      label,
      repoPath,
      ok: false,
      reason: "path does not exist",
      branch: null,
      changes: [],
    };
  }

  const status = runGit(repoPath, ["status", "--short", "--branch"]);
  if (status.status !== 0) {
    return {
      label,
      repoPath,
      ok: false,
      reason: (status.stderr || status.stdout || "git status failed").trim(),
      branch: null,
      changes: [],
    };
  }

  const lines = status.stdout.trimEnd().split("\n");
  const branch = lines[0] ?? "unknown";
  const changes = lines.slice(1).filter(Boolean);

  return {
    label,
    repoPath,
    ok: changes.length === 0,
    reason: changes.length === 0 ? null : `${changes.length} pending change(s)`,
    branch,
    changes,
  };
}

function printRepoResult(result) {
  process.stdout.write(`[check] ${result.label}: ${result.repoPath}\n`);
  if (result.branch) {
    process.stdout.write(`[check] ${result.label} branch: ${result.branch}\n`);
  }
  if (result.ok) {
    process.stdout.write(`[ok] ${result.label} worktree is clean\n`);
    return;
  }

  process.stdout.write(`[warn] ${result.label}: ${result.reason}\n`);
  for (const change of result.changes) {
    process.stdout.write(`  ${change}\n`);
  }
}

function main() {
  if (process.argv.includes("--help")) {
    usage();
    return;
  }

  const sdkRepo = process.env.AGENC_SDK_REPO ?? DEFAULT_SDK_REPO;
  const protocolRepo = process.env.AGENC_PROTOCOL_REPO ?? DEFAULT_PROTOCOL_REPO;
  const results = [
    inspectRepo("sdk", sdkRepo),
    inspectRepo("protocol", protocolRepo),
  ];

  for (const result of results) {
    printRepoResult(result);
  }

  if (results.some((result) => !result.ok)) {
    process.stdout.write(
      "[failure] release candidate requires clean SDK and protocol worktrees before mainnet sign-off\n",
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write("[success] release candidate worktrees are clean\n");
}

main();
