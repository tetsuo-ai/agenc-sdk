# Daemon Co-Attach

Minimal AgenC SDK example for sharing one daemon session between an SDK client
and the TUI daemon bridge.

The example:

- creates one daemon session through the SDK wrapper
- attaches an SDK client ID to that session
- accepts an injectable TUI attachment surface for the real TUI daemon bridge
- sends one SDK message and one TUI-style streamed message
- lists sessions and verifies both attachments remain visible on the same
  session

The standalone `npm run start` path uses the current JSON-line daemon protocol
fallback for the TUI side. In the runtime contract test, the same flow is wired
to the actual TUI daemon bridge so the SDK and TUI attachments share daemon
session state and event fan-out. That runtime contract is the authoritative
bridge integration until the SDK exposes the daemon initialize and subscription
transport surfaces directly.

The temporary JSON-line transport is intentionally local to the example. Replace
it with the SDK daemon transport once the initialize/version handshake and
subscription transport are public SDK surfaces.

## Run It

From this directory:

```bash
npm install --no-fund
npm run start
```

Set `AGENC_DAEMON_SOCKET` to override the socket path. If unset, the example
uses `$HOME/.agenc/daemon.sock`.
