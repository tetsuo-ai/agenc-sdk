# @tetsuo-ai/sdk

Privacy-preserving agent coordination on Solana.

This repository is the canonical public home for the AgenC SDK. It owns:

- the published `@tetsuo-ai/sdk` package
- SDK changelog and release authority
- the SDK API baseline in `docs/api-baseline/sdk.json`
- the curated `examples/private-task-demo` starter example

## Features

- Generate RISC0 private payloads for task completion.
- Submit private completions through router-based verification.
- Enforce strict payload validation before submission.
- Keep reward/claim/escrow flows consistent with public task completion.

## Installation

```bash
npm install @tetsuo-ai/sdk
```

## Private payload model

`generateProof()` returns:

- `sealBytes` (260 bytes: trusted selector + Groth16 proof)
- `journal` (192 bytes)
- `imageId` (32 bytes)
- `bindingSeed` (32 bytes)
- `nullifierSeed` (32 bytes)

## Quick start

```ts
import { generateProof, generateSalt, completeTaskPrivate } from '@tetsuo-ai/sdk';

const proof = await generateProof(
  {
    taskPda,
    agentPubkey: worker.publicKey,
    output: [1n, 2n, 3n, 4n],
    salt: generateSalt(),
    agentSecret: 12345n,
  },
  { kind: 'remote', endpoint: 'https://prover.example.com' }
);

await completeTaskPrivate(
  connection,
  program,
  worker,
  workerAgentId,
  taskPda,
  {
    sealBytes: proof.sealBytes,
    journal: proof.journal,
    imageId: proof.imageId,
    bindingSeed: proof.bindingSeed,
    nullifierSeed: proof.nullifierSeed,
  },
);
```

The SDK derives and submits the required verification accounts:

- `routerProgram`
- `router`
- `verifierEntry`
- `verifierProgram`
- `bindingSpend`
- `nullifierSpend`

## Core APIs

### Proof functions

- `generateProof(params, proverConfig)` — generates a real RISC Zero proof via the remote prover service
- `computeHashes(taskPda, agentPubkey, output, salt, agentSecret?)` — computes all hash fields without proof generation
- `generateSalt()` — generates a cryptographically random salt

### Task functions

- `createTask(...)`
- `claimTask(...)`
- `completeTask(...)`
- `completeTaskPrivate(...)`
- `completeTaskPrivateWithPreflight(...)`

### Preflight validation

`runProofSubmissionPreflight()` validates:

- payload length/shape
- journal field consistency
- trusted selector/image requirements
- replay state checks for `bindingSpend` and `nullifierSpend`

## Security notes

- Never reuse salt values across distinct outputs.
- Use an explicit `agentSecret` for nullifier derivation in production paths.
- Proof verification happens on-chain via the RISC Zero Verifier Router CPI — there is no local verification function.

## Examples

- `examples/private-task-demo/`

## Release gates

Every release must pass:

- `npm run build`
- `npm run typecheck`
- `npm run test`
- `npm run api:baseline:check`
- `npm run pack:smoke`

## Protocol alignment note

Protocol-IDL alignment is intentionally not tested in this repo yet. The old
monorepo `target/idl/agenc_coordination.json`-based test was removed from this
repo because it depended on a private monorepo build artifact. Gate 11 moves
that contract check into the future protocol repo or a cross-repo integration
job.
