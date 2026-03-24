# Devnet Marketplace Validation Runbook

Last updated: 2026-03-22

## Purpose

This runbook captures the operational flow for validating the marketplace stack
on public Solana devnet:

1. upgrade the deployed program,
2. run the combined marketplace smoke suite,
3. resume dispute resolution after the 24-hour voting window closes.

Use this when you need the fastest path from a protocol change to a clean
devnet validation result.

## Preconditions

- Program ID: `6UcJzbTEemBz3aY5wK5qKHGMD7bdRsmR4smND29gB2ab`
- Upgrade authority wallet:
  `/Users/pchmirenko/.config/solana/id.json`
- Protocol repo:
  `/Users/pchmirenko/tmp/agenc-protocol-pr`
- SDK repo:
  `/Users/pchmirenko/agenc-sdk-prprep`
- Built IDL:
  `/Users/pchmirenko/tmp/agenc-protocol-pr/target/idl/agenc_coordination.json`

Fresh wallet sets are strongly recommended. Reused wallets can fail due to
spent balances or wallet-scoped cooldown overlap.

## Upgrade Command

```bash
env PATH=/Users/pchmirenko/.local/share/solana/install/active_release/bin:$PATH \
anchor upgrade \
  /Users/pchmirenko/tmp/agenc-protocol-pr/programs/agenc-coordination/target/deploy/agenc_coordination.so \
  --program-id 6UcJzbTEemBz3aY5wK5qKHGMD7bdRsmR4smND29gB2ab \
  --provider.cluster devnet \
  --provider.wallet /Users/pchmirenko/.config/solana/id.json
```

Validation upgrade on 2026-03-22:

- signature:
  `2MK4S5wp3h2WXt3hMuCDtd88kFNG7rM9VcZDv8coPyAmigHYATVuzDY9CCWxUTjDidictkXYuikMzbCmi7pdwnRr`

## Fresh Wallet Set Used On 2026-03-22

Directory:
`/Users/pchmirenko/tmp/agenc-marketplace-devnet-fresh-2026-03-22-c`

- creator: `FvNKvfhh55DJX9vdsWxpxK6Mi9j2FAxw5yX1ddTomwkf`
- worker: `2t84964u5bMCqXkYKfZgo1GNa3xQHU9iZC5LnYAebEUf`
- arbiter A: `6P533bAZ6cuo5V41v3azVUjykGB17graWGyBqSofW8Xy`
- arbiter B: `ACDzzFDrwGqoHxgWKBbREQQiPK8sNhrBUCNJxxfZ9YYa`
- arbiter C: `83y4Xr2FUmo7QQrj4QhXAes7YA9c62WUdytLxxF63VeT`

Funding that cleared the suite cleanly:

- creator: `0.4 SOL`
- worker: `0.3 SOL`
- each arbiter: `0.2 SOL`

## Focused Bid-Marketplace Validation

```bash
CREATOR_WALLET=/Users/pchmirenko/tmp/agenc-marketplace-devnet-fresh-2026-03-22-c/creator.json \
WORKER_WALLET=/Users/pchmirenko/tmp/agenc-marketplace-devnet-fresh-2026-03-22-c/worker.json \
ARBITER_A_WALLET=/Users/pchmirenko/tmp/agenc-marketplace-devnet-fresh-2026-03-22-c/arbiter-a.json \
ARBITER_B_WALLET=/Users/pchmirenko/tmp/agenc-marketplace-devnet-fresh-2026-03-22-c/arbiter-b.json \
ARBITER_C_WALLET=/Users/pchmirenko/tmp/agenc-marketplace-devnet-fresh-2026-03-22-c/arbiter-c.json \
PROTOCOL_AUTHORITY_WALLET=/Users/pchmirenko/.config/solana/id.json \
AGENC_IDL_PATH=/Users/pchmirenko/tmp/agenc-protocol-pr/target/idl/agenc_coordination.json \
AGENC_RPC_URL=https://api.devnet.solana.com \
npm run test:devnet:bid-marketplace
```

Successful artifact from 2026-03-22:

- `/var/folders/gd/mvb492r97z1bw8c0nzrwhj_m0000gp/T/agenc-sdk-devnet/bid-marketplace-1774211925698-c215c6c9.json`

## Full Marketplace Validation

```bash
CREATOR_WALLET=/Users/pchmirenko/tmp/agenc-marketplace-devnet-fresh-2026-03-22-c/creator.json \
WORKER_WALLET=/Users/pchmirenko/tmp/agenc-marketplace-devnet-fresh-2026-03-22-c/worker.json \
ARBITER_A_WALLET=/Users/pchmirenko/tmp/agenc-marketplace-devnet-fresh-2026-03-22-c/arbiter-a.json \
ARBITER_B_WALLET=/Users/pchmirenko/tmp/agenc-marketplace-devnet-fresh-2026-03-22-c/arbiter-b.json \
ARBITER_C_WALLET=/Users/pchmirenko/tmp/agenc-marketplace-devnet-fresh-2026-03-22-c/arbiter-c.json \
PROTOCOL_AUTHORITY_WALLET=/Users/pchmirenko/.config/solana/id.json \
AGENC_IDL_PATH=/Users/pchmirenko/tmp/agenc-protocol-pr/target/idl/agenc_coordination.json \
AGENC_RPC_URL=https://api.devnet.solana.com \
npm run test:devnet:marketplace
```

Observed result on 2026-03-22:

- `deep`: passed
- `bid-marketplace`: passed
- `disputes`: deferred at the expected 24-hour voting window
- combined report:
  `/var/folders/gd/mvb492r97z1bw8c0nzrwhj_m0000gp/T/agenc-sdk-devnet/marketplace-e2e-1774212297928-af5249ed.json`
- deferred dispute artifact:
  `/var/folders/gd/mvb492r97z1bw8c0nzrwhj_m0000gp/T/agenc-sdk-devnet/dispute-1774212290897-c7f76a69.json`

## Resume Commands

Resume just the dispute resolution:

```bash
PROTOCOL_AUTHORITY_WALLET=/Users/pchmirenko/.config/solana/id.json \
npm run test:devnet:disputes -- --resume /var/folders/gd/mvb492r97z1bw8c0nzrwhj_m0000gp/T/agenc-sdk-devnet/dispute-1774212290897-c7f76a69.json
```

Resume the combined marketplace report:

```bash
npm run test:devnet:marketplace -- --resume /var/folders/gd/mvb492r97z1bw8c0nzrwhj_m0000gp/T/agenc-sdk-devnet/marketplace-e2e-1774212297928-af5249ed.json
```

## Public Devnet Notes

- The combined suite intentionally waits between phases to avoid wallet-scoped
  cooldown overlap on shared devnet infrastructure.
- After the dispute artifact is written, shared public RPC can still emit
  `429 Too Many Requests` during follow-up reads. If the output already
  contains both the `[artifact]` lines and the `[report] marketplace e2e report`
  line, treat the written report as authoritative and resume later.
- The artifact paths above live under the system temporary directory. If they
  are cleaned up before the resume window, rerun the full marketplace suite on a
  fresh wallet set.
