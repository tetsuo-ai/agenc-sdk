/**
 * Minimal AgenC daemon example:
 * create a session, send one message, and await the JSON-RPC response.
 */

import { createConnection } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createAgenCDaemonClient,
  type AgenCDaemonMethod,
  type AgenCDaemonRequest,
  type AgenCDaemonResponse,
  type AgenCDaemonTransport,
} from "@tetsuo-ai/sdk";

const DEFAULT_PROMPT = "Say hello from the AgenC SDK.";
const DEFAULT_TIMEOUT_MS = 30_000;

interface UnixSocketTransportOptions {
  readonly socketPath?: string;
  readonly timeoutMs?: number;
}

class UnixSocketJsonLineTransport implements AgenCDaemonTransport {
  readonly #socketPath: string;
  readonly #timeoutMs: number;

  constructor(options: UnixSocketTransportOptions = {}) {
    this.#socketPath = options.socketPath ?? defaultAgenCDaemonSocketPath();
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  request<Method extends AgenCDaemonMethod>(
    request: AgenCDaemonRequest<Method>,
  ): Promise<AgenCDaemonResponse<Method>> {
    return new Promise((resolve, reject) => {
      const socket = createConnection(this.#socketPath);
      let buffer = "";
      let settled = false;

      const timeout = setTimeout(() => {
        finish(new Error(`Timed out waiting for ${request.method}`));
      }, this.#timeoutMs);

      const finish = (
        error: Error | null,
        response?: AgenCDaemonResponse<Method>,
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        socket.destroy();
        if (error) {
          reject(error);
          return;
        }
        resolve(response!);
      };

      socket.setEncoding("utf8");
      socket.once("connect", () => {
        socket.write(`${JSON.stringify(request)}\n`);
      });
      socket.on("data", (chunk) => {
        buffer += chunk;
        const newline = buffer.indexOf("\n");
        if (newline === -1) return;

        const line = buffer.slice(0, newline);
        try {
          finish(null, JSON.parse(line) as AgenCDaemonResponse<Method>);
        } catch (error) {
          finish(asError(error));
        }
      });
      socket.once("error", finish);
      socket.once("close", () => {
        finish(new Error(`Daemon connection closed before ${request.method}`));
      });
    });
  }
}

async function main(): Promise<void> {
  const prompt = process.argv.slice(2).join(" ").trim() || DEFAULT_PROMPT;
  const client = createAgenCDaemonClient({
    transport: new UnixSocketJsonLineTransport({
      socketPath: process.env.AGENC_DAEMON_SOCKET,
    }),
  });

  const session = await client.createSession({
    cwd: process.cwd(),
    initialPrompt: prompt,
    metadata: { source: "sdk-daemon-hello-world" },
  });
  const response = await client.sendMessage({
    sessionId: session.sessionId,
    content: prompt,
    metadata: { source: "sdk-daemon-hello-world" },
  });

  console.log(
    JSON.stringify(
      {
        sessionId: session.sessionId,
        messageId: response.messageId,
        acceptedAt: response.acceptedAt,
      },
      null,
      2,
    ),
  );
}

function defaultAgenCDaemonSocketPath(): string {
  return join(homedir(), ".agenc", "daemon.sock");
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

main().catch((error: unknown) => {
  console.error(asError(error).message);
  process.exitCode = 1;
});
