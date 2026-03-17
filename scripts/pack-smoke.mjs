#!/usr/bin/env node

import { mkdtemp, readFile, rm, unlink, writeFile, cp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = process.cwd();

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agenc-sdk-pack-smoke.'));
  let tarballPath = null;

  try {
    const packOutput = run('npm', ['pack', '--json'], repoRoot);
    const [packed] = JSON.parse(packOutput);
    if (!packed?.filename) {
      throw new Error('npm pack did not return a filename');
    }
    tarballPath = path.join(repoRoot, packed.filename);

    run('npm', ['init', '-y'], tempRoot);
    run('npm', ['install', '--no-fund', '--no-audit', tarballPath], tempRoot);

    const smokeSource = [
      "const sdk = require('@tetsuo-ai/sdk');",
      "const internalSpl = require('@tetsuo-ai/sdk/internal/spl-token');",
      "if (typeof sdk.computeHashes !== 'function') throw new Error('missing computeHashes export');",
      "if (typeof internalSpl.createMint !== 'function') throw new Error('missing createMint export on internal SPL subpath');",
      "const leakedSplHelpers = ['createMint', 'mintTo', 'createAssociatedTokenAccount', 'createAssociatedTokenAccountInstruction', 'createInitializeMint2Instruction', 'createMintToInstruction'].filter((key) => key in sdk);",
      "if (leakedSplHelpers.length > 0) throw new Error(`internal SPL helpers leaked onto the public SDK surface: ${leakedSplHelpers.join(', ')}`);",
      "console.log('sdk-smoke-ok');",
    ].join(' ');
    const smokeOutput = run('node', ['-e', smokeSource], tempRoot).trim();
    if (smokeOutput !== 'sdk-smoke-ok') {
      throw new Error(`unexpected package smoke output: ${smokeOutput}`);
    }

    const exampleRoot = path.join(tempRoot, 'private-task-demo');
    await cp(path.join(repoRoot, 'examples', 'private-task-demo'), exampleRoot, { recursive: true });
    const examplePkgPath = path.join(exampleRoot, 'package.json');
    const examplePkg = JSON.parse(await readFile(examplePkgPath, 'utf8'));
    examplePkg.dependencies['@tetsuo-ai/sdk'] = tarballPath;
    await writeFile(examplePkgPath, `${JSON.stringify(examplePkg, null, 2)}\n`, 'utf8');
    run('npm', ['install', '--no-fund', '--no-audit'], exampleRoot);
    const exampleOutput = run('npm', ['run', 'start', '--', '--help'], exampleRoot);
    if (!exampleOutput.includes('PRIVATE_DEMO_TASK_ID')) {
      throw new Error('private task demo did not emit help output from the packed SDK install');
    }

    process.stdout.write('pack-smoke-ok\n');
  } finally {
    if (tarballPath) {
      try {
        await unlink(tarballPath);
      } catch {}
    }
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
