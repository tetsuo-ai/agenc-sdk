# SDK Module Index

This is the grouped public export map for `@tetsuo-ai/sdk`.

## Primary Install Surfaces

- `@tetsuo-ai/sdk` - supported public package surface
- `@tetsuo-ai/sdk/internal/spl-token` - supported subpath for SPL-token helpers

Everything else in the repo is support material, tests, examples, or release tooling.

## Export Families

### Proof generation and validation

- `generateProof`, `computeHashes`, `generateSalt`
- `runProofSubmissionPreflight`
- `completeTaskPrivateWithPreflight`, `completeTaskPrivateSafe`
- `ProverConfig`, `RemoteProverConfig`, `ProverError`

Use this family for private completion payload construction, prover transport wiring, and client-side safety checks before submission.

### Task lifecycle

- `createTask`, `createDependentTask`, `claimTask`, `expireClaim`
- `completeTask`, `completeTaskPrivate`, `completeTaskPrivateWithPreflight`, `completeTaskPrivateSafe`
- `configureTaskValidation`, `submitTaskResult`
- `acceptTaskResult`, `rejectTaskResult`, `autoAcceptTaskResult`, `validateTaskResult`
- `cancelTask`, `getTask`, `getTasksByCreator`
- `deriveTaskPda`, `deriveClaimPda`, `deriveEscrowPda`

Use the explicit Task Validation V2 helpers when a task has been configured for review or attestation. The low-level SDK `completeTask` helper still sends `complete_task` directly and does not auto-route reviewed tasks into `submit_task_result`.

### Queries and replay-oriented reads

- `getTasksByDependency`, `getDependentTaskCount`, `getRootTasks`
- `getDisputesByActor`, `getReplayHealthCheck`
- `TASK_FIELD_OFFSETS`, `DISPUTE_FIELD_OFFSETS`

### Agent, dispute, governance, and protocol administration

- `registerAgent`, `updateAgent`, `suspendAgent`, `deregisterAgent`
- `initiateDispute`, `voteDispute`, `resolveDispute`
- `initializeProtocol`, `initializeZkConfig`, `updateProtocolFee`, `updateZkImageId`
- governance proposal helpers exported from `governance.ts`

### Marketplace and token helpers

- bid validation and scoring helpers from `bids.ts`
- token-task helpers from `tokens.ts`
- SPL-token helpers from `spl-token.ts`

### Diagnostics and compatibility

- `decodeError`, `decodeAnchorError`
- `checkVersionCompatibility`, `requireVersionCompatibility`
- `createLogger`, `setSdkLogLevel`
- process identity helpers from `process-identity.ts`

### Convenience wrapper

- `PrivacyClient` from `client.ts`

Use `PrivacyClient` when you want one object to wrap common flows. Use the lower-level modules directly when you need explicit transaction assembly, PDA derivation, or custom orchestration.

## Deprecated And Compatibility Notes

- `validateProofPreconditions` remains exported as a deprecated alias for `runProofSubmissionPreflight`.
- `completeTaskPrivateSafe` remains exported as a deprecated compatibility wrapper around `completeTaskPrivateWithPreflight`.
- Version compatibility state is defined in `src/version.ts` and must stay aligned with `package.json` and released protocol expectations.
