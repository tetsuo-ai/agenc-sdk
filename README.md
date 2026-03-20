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
- `computeHashes(taskPda, agentPubkey, output, salt, agentSecret)` — computes all hash fields without proof generation
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

## Devnet validation

The SDK now includes focused devnet validators for the major public flows added
in `agenc-sdk#14`.

Build the SDK first so the scripts can import `dist/index.mjs`:

```bash
npm run build
```

Set these once for all flows:

```bash
export AGENC_RPC_URL=https://api.devnet.solana.com
export AGENC_IDL_PATH=/absolute/path/to/agenc_coordination.json
export AGENC_MAX_WAIT_SECONDS=90
```

`AGENC_IDL_PATH` is required for initial runs. Resume artifacts keep the original
IDL path unless you override it.

Funding notes:

- All participating wallets need enough SOL for transaction fees and agent stake.
- `test:devnet:skills`: the buyer also needs the skill purchase price.
- `test:devnet:governance`: proposer and voters each need enough SOL to register
  and vote; the protocol authority only needs fees if governance is already
  initialized.
- `test:devnet:disputes`: the creator needs reward funding plus dispute stake,
  the worker needs agent stake, each arbiter needs arbiter stake, and the
  protocol authority only needs fees for the final resolve step.
- `test:devnet:reputation`: the delegator needs agent stake plus
  `AGENC_REPUTATION_STAKE_LAMPORTS`; the delegatee needs enough SOL to register.

### Skills flow

```bash
AUTHOR_WALLET=/path/to/author.json \
BUYER_WALLET=/path/to/buyer.json \
npm run test:devnet:skills
```

Optional:

- `AGENC_SKILL_PRICE_LAMPORTS`

This validates register -> purchase -> rate -> final state fetch.

### Governance flow

```bash
PROPOSER_WALLET=/path/to/proposer.json \
VOTER_A_WALLET=/path/to/voter-a.json \
VOTER_B_WALLET=/path/to/voter-b.json \
VOTER_C_WALLET=/path/to/voter-c.json \
PROTOCOL_AUTHORITY_WALLET=/path/to/authority.json \
npm run test:devnet:governance
```

Optional:

- `AGENC_GOVERNANCE_VOTING_SECONDS`

If governance already exists on devnet, the authority wallet is only needed when
the script must initialize the governance config. If execution cannot happen
inside `AGENC_MAX_WAIT_SECONDS`, the script writes a resume artifact and prints a
follow-up command:

```bash
EXECUTOR_WALLET=/path/to/executor.json \
npm run test:devnet:governance -- --resume /tmp/agenc-sdk-devnet/governance-....json
```

### Disputes flow

```bash
CREATOR_WALLET=/path/to/creator.json \
WORKER_WALLET=/path/to/worker.json \
ARBITER_A_WALLET=/path/to/arbiter-a.json \
ARBITER_B_WALLET=/path/to/arbiter-b.json \
ARBITER_C_WALLET=/path/to/arbiter-c.json \
PROTOCOL_AUTHORITY_WALLET=/path/to/authority.json \
npm run test:devnet:disputes
```

Optional:

- `AGENC_REWARD_LAMPORTS`

This validates create -> claim -> initiate dispute -> quorum votes. Public
devnet usually requires a second run for resolution because the protocol dispute
voting period is 24 hours:

```bash
PROTOCOL_AUTHORITY_WALLET=/path/to/authority.json \
npm run test:devnet:disputes -- --resume /tmp/agenc-sdk-devnet/dispute-....json
```

### Reputation flow

```bash
DELEGATOR_WALLET=/path/to/delegator.json \
DELEGATEE_WALLET=/path/to/delegatee.json \
npm run test:devnet:reputation
```

Optional:

- `AGENC_REPUTATION_STAKE_LAMPORTS`
- `AGENC_REPUTATION_DELEGATION_AMOUNT`

This validates register -> stake -> delegate on the first run. The protocol
enforces a 7-day cooldown for both delegation revocation and stake withdrawal,
so public devnet requires a later resume run:

```bash
DELEGATOR_WALLET=/path/to/delegator.json \
npm run test:devnet:reputation -- --resume /tmp/agenc-sdk-devnet/reputation-....json
```

## Protocol alignment note

Full protocol-IDL alignment is intentionally not tested in this repo yet. The
old monorepo `target/idl/agenc_coordination.json`-based test was removed from
this repo because it depended on a private monorepo build artifact. Gate 11
moves that contract check into the future protocol repo or a cross-repo
integration job.

The SDK error map is still guarded here. `src/errors.ts` is regenerated from a
committed snapshot of protocol IDL errors in `data/coordination-idl-errors.json`.
Refresh that snapshot from the protocol repo with
`AGENC_IDL_PATH=/absolute/path/to/agenc_coordination.json npm run errors:generate`.
