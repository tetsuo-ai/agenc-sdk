# @tetsuo-ai/sdk

Privacy-preserving agent coordination on Solana.

This repo is the canonical public home for the AgenC SDK. It owns:

- the published `@tetsuo-ai/sdk` package
- the public SDK changelog and release authority
- the SDK API baseline in `docs/api-baseline/sdk.json`
- the curated `examples/private-task-demo` example

## Start Here

- [docs/DOCS_INDEX.md](docs/DOCS_INDEX.md) - reading order for developers and AI agents
- [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md) - repo structure and file ownership
- [docs/MODULE_INDEX.md](docs/MODULE_INDEX.md) - grouped public export map
- [docs/MAINTAINER_GUIDE.md](docs/MAINTAINER_GUIDE.md) - validation and release workflow

## Installation

```bash
npm install @tetsuo-ai/sdk
```

## Repo Layout

```text
agenc-sdk/
  src/                         public package source
  src/__tests__/               module-level contract tests
  docs/api-baseline/           API drift snapshot
  examples/private-task-demo/  curated runnable example
  scripts/                     baseline and pack-smoke tooling
  .github/workflows/           CI and publish automation
```

## Public API Families

- Proofs and prover wiring: `proofs.ts`, `prover.ts`, `proof-validation.ts`
- Task lifecycle, validation flows, and queries: `tasks.ts`, `queries.ts`, `tokens.ts`
- Agent, dispute, governance, and protocol helpers: `agents.ts`, `disputes.ts`, `governance.ts`, `protocol.ts`, `state.ts`
- Diagnostics and compatibility: `errors.ts`, `logger.ts`, `process-identity.ts`, `version.ts`
- Convenience wrapper: `client.ts`
- Supported subpath export: `@tetsuo-ai/sdk/internal/spl-token`

See [docs/MODULE_INDEX.md](docs/MODULE_INDEX.md) for the grouped export list.

## Private Payload Model

`generateProof()` returns:

- `sealBytes` - 260 bytes: trusted selector plus Groth16 proof
- `journal` - 192 bytes
- `imageId` - 32 bytes
- `bindingSeed` - 32 bytes
- `nullifierSeed` - 32 bytes

## Quick Start

```ts
import { generateProof, generateSalt, completeTaskPrivate } from "@tetsuo-ai/sdk";

const proof = await generateProof(
  {
    taskPda,
    agentPubkey: worker.publicKey,
    output: [1n, 2n, 3n, 4n],
    salt: generateSalt(),
    agentSecret: 12345n,
  },
  { kind: "remote", endpoint: "https://prover.example.com" },
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

## Safe Private Completion Flow

- `completeTaskPrivate(...)` submits the payload directly
- `runProofSubmissionPreflight(...)` performs client-side validation
- `completeTaskPrivateSafe(...)` combines the preflight path with the submit flow

- `generateProof(params, proverConfig)` — generates a real RISC Zero proof via the remote prover service
- `computeHashes(taskPda, agentPubkey, output, salt, agentSecret)` — computes all hash fields without proof generation
- `generateSalt()` — generates a cryptographically random salt

### Task functions

- `createTask(...)`
- `claimTask(...)`
- `completeTask(...)`
- `completeTaskPrivate(...)`
- `completeTaskPrivateWithPreflight(...)`
- `configureTaskValidation(...)`
- `submitTaskResult(...)`
- `acceptTaskResult(...)`
- `rejectTaskResult(...)`
- `autoAcceptTaskResult(...)`
- `validateTaskResult(...)`

## Task Validation V2

The SDK exposes the full reviewed public-task surface introduced by protocol Task Validation V2.

- `configureTaskValidation(...)` enables creator review, validator quorum, or external attestation on an open public task
- `submitTaskResult(...)` records a reviewed submission without paying out immediately
- `acceptTaskResult(...)`, `rejectTaskResult(...)`, and `autoAcceptTaskResult(...)` resolve creator-review tasks
- `validateTaskResult(...)` records validator-quorum votes and external attestations

Important: raw SDK `completeTask(...)` still calls on-chain `complete_task` directly. It does not auto-route manual-validation tasks into `submit_task_result`. That auto-routing exists in the runtime wrapper, not in the SDK.

### Preflight validation

`runProofSubmissionPreflight()` validates:

- payload length/shape
- journal field consistency
- trusted selector/image requirements
- replay state checks for `bindingSpend` and `nullifierSpend`

## Security Notes

- Never reuse salt values across distinct outputs.
- Use an explicit `agentSecret` for nullifier derivation in production flows.
- Proof verification happens on-chain through the RISC Zero verifier-router path; there is no local verification shortcut in this package.

## Examples

- [examples/private-task-demo/README.md](examples/private-task-demo/README.md)

## Release Gates

Every release must pass:

```bash
npm run build
npm run typecheck
npm run test
npm run api:baseline:check
npm run pack:smoke
```

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
- `test:devnet:bid-marketplace`: the creator needs reward funding plus agent
  stake, the bidder needs agent stake plus bid bond, and the protocol
  authority only needs fees if the bid marketplace config must be initialized.
- `test:devnet:reputation`: the delegator needs agent stake plus
  `AGENC_REPUTATION_STAKE_LAMPORTS`; the delegatee needs enough SOL to register.

### Public task flow

```bash
CREATOR_WALLET=/path/to/creator.json \
WORKER_WALLET=/path/to/worker.json \
npm run test:devnet:public
```

This validates the happy-path public lifecycle `register -> create -> claim -> complete`.
`AGENC_IDL_PATH` must be set explicitly so the validator runs against the intended
protocol build instead of a machine-local fallback.

### Deep public task flow

```bash
CREATOR_WALLET=/path/to/creator.json \
WORKER_WALLET=/path/to/worker.json \
npm run test:devnet:deep:strict
```

Optional:

- `AGENC_DEVNET_DRIFT_MODE`

This validates the public deep task lifecycle and the key negative paths:
minimum-stake registration, past-deadline create, self-claim rejection,
complete-without-claim, cancel-after-complete, and the final completed task
state. As of March 21, 2026, the strict suite passes on devnet. The current
status is tracked in `docs/devnet-compatibility.md`.

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

### Bid marketplace flow

```bash
CREATOR_WALLET=/path/to/creator.json \
WORKER_WALLET=/path/to/worker.json \
PROTOCOL_AUTHORITY_WALLET=/path/to/authority.json \
npm run test:devnet:bid-marketplace
```

Optional:

- `AGENC_REWARD_LAMPORTS`
- `PROTOCOL_SECOND_SIGNER_WALLET`
- `PROTOCOL_THIRD_SIGNER_WALLET`

This validates register -> create bid-exclusive task -> initialize bid book ->
create bid -> update bid -> accept bid -> complete task with accepted-bid
settlement accounts. If the bid marketplace config is not already initialized
and the protocol multisig threshold is greater than one, provide the additional
multisig signer wallet paths as needed. The validator writes a standalone
artifact under `/tmp/agenc-sdk-devnet`.

### Marketplace end-to-end flow

```bash
CREATOR_WALLET=/path/to/creator.json \
WORKER_WALLET=/path/to/worker.json \
ARBITER_A_WALLET=/path/to/arbiter-a.json \
ARBITER_B_WALLET=/path/to/arbiter-b.json \
ARBITER_C_WALLET=/path/to/arbiter-c.json \
PROTOCOL_AUTHORITY_WALLET=/path/to/authority.json \
npm run test:devnet:marketplace
```

This orchestrates the strict deep public-task validator, the bid marketplace
validator, and the dispute validator, then writes a combined report artifact
under `/tmp/agenc-sdk-devnet`. On public devnet, the first run usually ends
with `overall=deferred` because the dispute voting window is 24 hours. Resume
the combined report later to finish the resolution step:

```bash
npm run test:devnet:marketplace -- --resume /tmp/agenc-sdk-devnet/marketplace-e2e-....json
```

For a concrete operator workflow, including the expected deferred dispute
artifact and resume commands from a real public-devnet run, see
`docs/devnet-marketplace-runbook.md`.

Coverage today:

- direct marketplace lifecycle: automated
- Marketplace V2 bid-book lifecycle: automated
- dispute lifecycle: automated, with resume for final resolve on public devnet

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

## Cross-Repo Boundaries

- `agenc-protocol` owns the public protocol artifacts and on-chain source of truth
- `agenc-plugin-kit` owns the public plugin authoring ABI
- `agenc-core` owns runtime and product implementation details
- `agenc-prover` owns the proving service and private admin flows

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
