# Private Task Demo

This is the curated standalone SDK example for private-task payload construction.

If you do not provide `PRIVATE_DEMO_AGENT_SECRET`, the demo derives a private
agent secret from the generated worker key for that run so nullifier derivation
still works without hard-coded shared defaults.

After the SDK package is published, install dependencies in this folder and run:

```bash
npm install
npm run start -- --help
```
