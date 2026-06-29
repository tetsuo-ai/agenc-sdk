/**
 * AgenC daemon co-attach example:
 * one SDK client and one TUI client ID drive the same daemon session.
 */

import { createConnection } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAgenCDaemonClient,
  type AgenCDaemonClient,
  type AgenCDaemonMethod,
  type AgenCDaemonRequest,
  type AgenCDaemonResponse,
  type AgenCDaemonTransport,
  type MessageSendResult,
  type MessageStreamResult,
  type SessionAttachResult,
  type SessionCreateResult,
  type SessionSummary,
} from "@tetsuo-ai/sdk";

const DEFAULT_SDK_PROMPT = "Hello from the SDK side.";
const DEFAULT_TUI_PROMPT = "Hello from the TUI side.";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_SDK_CLIENT_ID = "sdk-example";
const DEFAULT_TUI_CLIENT_ID = "tui-example";

interface UnixSocketTransportOptions {
  readonly socketPath?: string;
  readonly timeoutMs?: number;
}

export interface DaemonCoAttachOptions {
  readonly attachTui?: (
    options: DaemonTuiAttachOptions,
  ) => Promise<DaemonTuiAttachment>;
  readonly client?: Pick<
    AgenCDaemonClient,
    | "attachSession"
    | "createSession"
    | "listSessions"
    | "sendMessage"
    | "streamMessage"
  >;
  readonly cwd?: string;
  readonly sdkClientId?: string;
  readonly sdkPrompt?: string;
  readonly socketPath?: string;
  readonly timeoutMs?: number;
  readonly tuiClientId?: string;
  readonly tuiPrompt?: string;
}

export interface DaemonTuiAttachOptions {
  readonly client: Pick<AgenCDaemonClient, "attachSession" | "streamMessage">;
  readonly clientId: string;
  readonly sessionId: string;
}

export interface DaemonTuiAttachment {
  readonly attachmentId: string;
  submit(message: string): Promise<MessageStreamResult>;
}

export interface DaemonCoAttachResult {
  readonly session: SessionCreateResult;
  readonly sdkAttachment: SessionAttachResult;
  readonly tuiAttachment: DaemonTuiAttachment;
  readonly sdkMessage: MessageSendResult;
  readonly tuiMessage: MessageStreamResult;
  readonly visibleSession: SessionSummary;
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
      let timeout: ReturnType<typeof setTimeout>;

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

      timeout = setTimeout(() => {
        finish(new Error(`Timed out waiting for ${request.method}`));
      }, this.#timeoutMs);

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

export async function runDaemonCoAttach(
  options: DaemonCoAttachOptions = {},
): Promise<DaemonCoAttachResult> {
  const sdkClientId = options.sdkClientId ?? DEFAULT_SDK_CLIENT_ID;
  const tuiClientId = options.tuiClientId ?? DEFAULT_TUI_CLIENT_ID;
  const sdkPrompt = options.sdkPrompt?.trim() || DEFAULT_SDK_PROMPT;
  const tuiPrompt = options.tuiPrompt?.trim() || DEFAULT_TUI_PROMPT;
  const client =
    options.client ??
    createAgenCDaemonClient({
      transport: new UnixSocketJsonLineTransport({
        socketPath: options.socketPath,
        timeoutMs: options.timeoutMs,
      }),
    });

  const session = await client.createSession({
    cwd: options.cwd ?? process.cwd(),
    initialPrompt: sdkPrompt,
    metadata: { source: "sdk-tui-coattach" },
  });
  const sdkAttachment = await client.attachSession({
    sessionId: session.sessionId,
    clientId: sdkClientId,
  });
  const attachTui = options.attachTui ?? attachProtocolTuiSide;
  const tuiAttachment = await attachTui({
    client,
    sessionId: session.sessionId,
    clientId: tuiClientId,
  });
  const sdkMessage = await client.sendMessage({
    sessionId: session.sessionId,
    content: sdkPrompt,
    metadata: { source: sdkClientId },
  });
  const tuiMessage = await tuiAttachment.submit(tuiPrompt);
  const listed = await client.listSessions({ agentId: session.agentId });
  const visibleSession = listed.sessions.find(
    (candidate) => candidate.sessionId === session.sessionId,
  );

  if (visibleSession === undefined) {
    throw new Error(`Session ${session.sessionId} was not visible to listSessions`);
  }
  assertAttachmentVisible(visibleSession, sdkAttachment.attachmentId);
  assertAttachmentVisible(visibleSession, tuiAttachment.attachmentId);

  return {
    session,
    sdkAttachment,
    tuiAttachment,
    sdkMessage,
    tuiMessage,
    visibleSession,
  };
}

async function attachProtocolTuiSide(
  options: DaemonTuiAttachOptions,
): Promise<DaemonTuiAttachment> {
  const attachment = await options.client.attachSession({
    sessionId: options.sessionId,
    clientId: options.clientId,
  });
  return {
    attachmentId: attachment.attachmentId,
    submit: (message) =>
      options.client.streamMessage({
        sessionId: options.sessionId,
        content: message,
        streamId: `${options.clientId}:hello-world`,
        metadata: { source: options.clientId },
      }),
  };
}

async function main(): Promise<void> {
  const { session, sdkAttachment, tuiAttachment, sdkMessage, tuiMessage } =
    await runDaemonCoAttach({
      socketPath: process.env.AGENC_DAEMON_SOCKET,
    });

  console.log(
    JSON.stringify(
      {
        sessionId: session.sessionId,
        sdkAttachmentId: sdkAttachment.attachmentId,
        tuiAttachmentId: tuiAttachment.attachmentId,
        sdkMessageId: sdkMessage.messageId,
        tuiStreamId: tuiMessage.streamId,
      },
      null,
      2,
    ),
  );
}

function assertAttachmentVisible(
  session: SessionSummary,
  attachmentId: string,
): void {
  if (!session.activeAttachmentIds?.includes(attachmentId)) {
    throw new Error(
      `Session ${session.sessionId} did not expose attachment ${attachmentId}`,
    );
  }
}

function isMainModule(): boolean {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

function defaultAgenCDaemonSocketPath(): string {
  return join(homedir(), ".agenc", "daemon.sock");
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

if (isMainModule()) {
  main().catch((error: unknown) => {
    console.error(asError(error).message);
    process.exitCode = 1;
  });
}
