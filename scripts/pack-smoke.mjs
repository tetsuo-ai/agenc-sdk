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

function buildWriteSmokeSource({ esm }) {
  const lines = esm
    ? [
        "import { Keypair } from '@solana/web3.js';",
        "const sdk = await import('@tetsuo-ai/sdk');",
      ]
    : [
        "const { Keypair } = require('@solana/web3.js');",
        "const sdk = require('@tetsuo-ai/sdk');",
      ];

  return [
    ...lines,
    "(async () => {",
    "function makeBuilder(signature) {",
    "  return {",
    "    accountsPartial() { return this; },",
    "    signers() { return this; },",
    "    remainingAccounts() { return this; },",
    "    preInstructions() { return this; },",
    "    rpc() { return Promise.resolve(signature); },",
    "  };",
    "}",
    "const authority = Keypair.generate();",
    "const secondSigner = Keypair.generate();",
    "const creator = Keypair.generate();",
    "const connection = { confirmTransaction: () => Promise.resolve() };",
    "const program = {",
    "  programId: sdk.PROGRAM_ID,",
    "  methods: {",
    "    registerAgent(...args) {",
    "      if (args[1].toString() !== '42') throw new Error('registerAgent BN conversion failed');",
    "      if (args[4].toString() !== '1000') throw new Error('registerAgent stake BN conversion failed');",
    "      return makeBuilder('register-agent-sig');",
    "    },",
    "    createTask(...args) {",
    "      if (args[1].toString() !== '7') throw new Error('createTask capability BN conversion failed');",
    "      if (args[3].toString() !== '1000') throw new Error('createTask reward BN conversion failed');",
    "      if (args[5].toString() !== '1735689600') throw new Error('createTask deadline BN conversion failed');",
    "      return makeBuilder('create-task-sig');",
    "    },",
    "    initializeGovernance(...args) {",
    "      if (args[0].toString() !== '60') throw new Error('initializeGovernance votingPeriod BN conversion failed');",
    "      if (args[1].toString() !== '30') throw new Error('initializeGovernance executionDelay BN conversion failed');",
    "      if (args[4].toString() !== '250') throw new Error('initializeGovernance stake BN conversion failed');",
    "      return makeBuilder('initialize-governance-sig');",
    "    },",
    "    initializeProtocol(...args) {",
    "      if (args[2].toString() !== '1000000') throw new Error('initializeProtocol minStake BN conversion failed');",
    "      if (args[3].toString() !== '500000') throw new Error('initializeProtocol disputeStake BN conversion failed');",
    "      return makeBuilder('initialize-protocol-sig');",
    "    },",
    "    updateState(...args) {",
    "      if (args[2].toString() !== '1') throw new Error('updateState version BN conversion failed');",
    "      return makeBuilder('update-state-sig');",
    "    },",
    "  },",
    "};",
    "await sdk.registerAgent(connection, program, authority, {",
    "  agentId: new Uint8Array(32).fill(1),",
    "  capabilities: 42,",
    "  endpoint: 'https://agent.example.com',",
    "  stakeAmount: 1000,",
    "});",
    "await sdk.createTask(connection, program, creator, new Uint8Array(32).fill(2), {",
    "  taskId: new Uint8Array(32).fill(3),",
    "  requiredCapabilities: 7,",
    "  description: Buffer.alloc(64, 1),",
    "  rewardAmount: 1000,",
    "  maxWorkers: 1,",
    "  deadline: 1735689600,",
    "  taskType: 0,",
    "});",
    "await sdk.initializeGovernance(connection, program, authority, {",
    "  votingPeriod: 60,",
    "  executionDelay: 30,",
    "  quorumBps: 5000,",
    "  approvalThresholdBps: 6000,",
    "  minProposalStake: 250,",
    "});",
    "await sdk.initializeProtocol(connection, program, authority, secondSigner, Keypair.generate().publicKey, {",
    "  disputeThreshold: 51,",
    "  protocolFeeBps: 100,",
    "  minStake: 1000000,",
    "  minStakeForDispute: 500000,",
    "  multisigThreshold: 2,",
    "  multisigOwners: [authority.publicKey, secondSigner.publicKey],",
    "});",
    "await sdk.updateState(connection, program, authority, {",
    "  agentId: new Uint8Array(32).fill(4),",
    "  stateKey: new Uint8Array(32).fill(5),",
    "  stateValue: new Uint8Array(64).fill(6),",
    "  version: 1,",
    "});",
    "console.log('sdk-write-smoke-ok');",
    "})().catch((error) => {",
    "  console.error(error);",
    "  process.exit(1);",
    "});",
  ].join(' ');
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

    const cjsWriteSmokeOutput = run(
      'node',
      ['-e', buildWriteSmokeSource({ esm: false })],
      tempRoot,
    ).trim();
    if (cjsWriteSmokeOutput !== 'sdk-write-smoke-ok') {
      throw new Error(`unexpected CJS write smoke output: ${cjsWriteSmokeOutput}`);
    }

    const esmWriteSmokeOutput = run(
      'node',
      ['--input-type=module', '-e', buildWriteSmokeSource({ esm: true })],
      tempRoot,
    ).trim();
    if (esmWriteSmokeOutput !== 'sdk-write-smoke-ok') {
      throw new Error(`unexpected ESM write smoke output: ${esmWriteSmokeOutput}`);
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
