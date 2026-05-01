# Daemon Co-Attach

Minimal AgenC SDK example for sharing one daemon session between an SDK client
and the TUI daemon bridge.

The example:

- creates one daemon session through the SDK wrapper
- attaches an SDK client ID and a TUI client ID to that same session
- sends one SDK message and one TUI-style streamed message
- lists sessions and verifies both attachments remain visible on the same
  session

## Run It

From this directory:

```bash
npm install --no-fund
npm run start
```

Set `AGENC_DAEMON_SOCKET` to override the socket path. If unset, the example
uses `$HOME/.agenc/daemon.sock`.
