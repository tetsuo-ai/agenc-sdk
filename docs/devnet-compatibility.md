# Devnet Compatibility Report

Last updated: 2026-03-22

## Scope

This report tracks whether the current AgenC program deployed on Solana devnet
matches the SDK's public task-flow expectations.

The current result was reproduced on March 22, 2026 by running the deep devnet
integration harness against the current SDK build and the protocol IDL from the
merged protocol worktree, then confirmed again during the combined marketplace
validation flow after the accepted-bid settlement persistence fix was upgraded
to devnet:

```bash
CREATOR_WALLET=/path/to/creator.json \
WORKER_WALLET=/path/to/worker.json \
AGENC_IDL_PATH=/absolute/path/to/agenc_coordination.json \
npm run test:devnet:deep:strict
```

Harness file:

- `scripts/devnet-integration-deep.mjs`

## Current Result

The strict deep suite now passes on devnet. The only documented variance is the
accepted `InvalidAccountOwner` terminal failure for the cancel-after-complete
negative-path assertion described below.

### Verified negative paths

| Scenario | Expected Local Error | Observed Devnet Error |
| --- | --- | --- |
| Register agent below minimum stake | `InsufficientStake` | `InsufficientStake` |
| Create task with past deadline | `InvalidInput` | `InvalidInput` |
| Creator self-claims own task | `SelfTaskNotAllowed` | `SelfTaskNotAllowed` |
| Claim with insufficient capabilities | `InsufficientCapabilities` | `InsufficientCapabilities` |
| Complete task without an initialized claim | `NotClaimed` | `NotClaimed` |
| Deregister worker with an active task | `AgentHasActiveTasks` | `AgentHasActiveTasks` |
| Cancel task after successful completion | `InvalidStatusTransition` | `InvalidAccountOwner` |

### Verified happy path

- Public flow `register -> create -> claim -> complete` succeeds
- Final on-chain task state verifies as `Completed`
- Cleanup deregistration succeeds after task completion

## Harness Behavior

The deep devnet harness still supports two modes:

- `compat`
  - Reserved for temporary, explicitly documented devnet allowances
  - Currently has no active allowances configured

- `strict`
  - Fails on semantic drift, except for the documented cancel-after-complete
    cleanup variance
  - This is the recommended mode now that devnet matches current expectations

Recommended commands:

```bash
# Default mode; currently equivalent to strict because there are no active drift allowances
npm run test:devnet:deep

# Explicit strict mode for CI or release validation
npm run test:devnet:deep:strict
```

## Interpretation

The earlier devnet mismatch documented on March 18, 2026 is no longer present in
the deep public task suite for the main claim/completion lifecycle. One cleanup
variance remains after successful completion:

- complete without claim -> `NotClaimed`
- cancel after complete -> `InvalidAccountOwner`

The SDK deep harness now treats `InvalidAccountOwner` as an acceptable terminal
failure for the cancel-after-complete negative-path assertion because public
devnet can surface account-owner validation before the higher-level cancel guard
after the task has already been fully settled.

Marketplace V2 bid settlement was separately revalidated on March 22, 2026
after upgrading the protocol fix that explicitly persists `bid_book` and
`bidder_market_state` mutations when the accepted bid is settled from remaining
accounts. See `docs/devnet-marketplace-runbook.md` for the dated validation
artifacts and resume commands.
