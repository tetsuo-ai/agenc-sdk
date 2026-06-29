# Daemon Hello World

Minimal AgenC SDK example for the daemon JSON-RPC wrapper.

It opens the local AgenC daemon Unix socket, creates a session, sends one
message, and waits for the `message.send` response.

## Run It

From this directory:

```bash
npm install --no-fund
npm run start -- "Say hello from the SDK"
```

Set `AGENC_DAEMON_SOCKET` to override the socket path. If unset, the example
uses `$HOME/.agenc/daemon.sock`.
