import { describe, expect, it, vi } from "vitest";
import { runDaemonCoAttach } from "./index.js";

describe("daemon co-attach example", () => {
  it("drives one session through SDK and TUI attachments", async () => {
    const calls: string[] = [];
    const client = {
      createSession: vi.fn().mockImplementation(async () => {
        calls.push("createSession");
        return {
          sessionId: "session_1",
          agentId: "agent_default",
          status: "idle",
          createdAt: "2026-05-01T00:00:00.000Z",
        };
      }),
      attachSession: vi.fn().mockImplementation(async (params) => {
        calls.push(`attach:${params.clientId}`);
        return {
          sessionId: "session_1",
          attachmentId: `${params.clientId}_attachment`,
          attachedAt: "2026-05-01T00:00:00.100Z",
          clientId: params.clientId,
          activeAttachmentIds:
            params.clientId === "tui-test"
              ? ["sdk-test_attachment", "tui-test_attachment"]
              : ["sdk-test_attachment"],
        };
      }),
      sendMessage: vi.fn().mockImplementation(async (params) => {
        calls.push(`sdk:${params.sessionId}`);
        return {
          messageId: "message_sdk",
          acceptedAt: "2026-05-01T00:00:01.000Z",
        };
      }),
      streamMessage: vi.fn(),
      listSessions: vi.fn().mockImplementation(async () => {
        calls.push("listSessions");
        return {
          sessions: [
            {
              sessionId: "session_1",
              agentId: "agent_default",
              status: "idle",
              createdAt: "2026-05-01T00:00:00.000Z",
              activeAttachmentIds: [
                "sdk-test_attachment",
                "tui-test_attachment",
              ],
            },
          ],
        };
      }),
    };
    const attachTui = vi.fn().mockImplementation(async (options) => {
      calls.push(`attachTui:${options.clientId}`);
      return {
        attachmentId: "tui-test_attachment",
        submit: async (message: string) => {
          calls.push(`tui:${options.sessionId}`);
          expect(message).toBe("hello from tui");
          expect(options.clientId).toBe("tui-test");
          expect(options.sessionId).toBe("session_1");
          expect(options.client).toBe(client);
          return {
            messageId: "message_tui",
            streamId: "tui-test:hello-world",
            acceptedAt: "2026-05-01T00:00:02.000Z",
          };
        },
      };
    });

    const result = await runDaemonCoAttach({
      attachTui,
      client,
      cwd: "/workspace",
      sdkClientId: "sdk-test",
      sdkPrompt: "hello from sdk",
      tuiClientId: "tui-test",
      tuiPrompt: "hello from tui",
    });

    expect(calls).toEqual([
      "createSession",
      "attach:sdk-test",
      "attachTui:tui-test",
      "sdk:session_1",
      "tui:session_1",
      "listSessions",
    ]);
    expect(client.createSession).toHaveBeenCalledWith({
      cwd: "/workspace",
      initialPrompt: "hello from sdk",
      metadata: { source: "sdk-tui-coattach" },
    });
    expect(attachTui).toHaveBeenCalledWith({
      client,
      sessionId: "session_1",
      clientId: "tui-test",
    });
    expect(result.tuiMessage).toEqual({
      messageId: "message_tui",
      streamId: "tui-test:hello-world",
      acceptedAt: "2026-05-01T00:00:02.000Z",
    });
    expect(result.visibleSession.activeAttachmentIds).toEqual([
      "sdk-test_attachment",
      "tui-test_attachment",
    ]);
  });

  it("provides a protocol fallback for the TUI side", async () => {
    const calls: string[] = [];
    const client = {
      createSession: vi.fn().mockResolvedValue({
        sessionId: "session_1",
        agentId: "agent_default",
        status: "idle",
        createdAt: "2026-05-01T00:00:00.000Z",
      }),
      attachSession: vi.fn().mockImplementation(async (params) => {
        calls.push(`attach:${params.clientId}`);
        return {
          sessionId: "session_1",
          attachmentId: `${params.clientId}_attachment`,
          attachedAt: "2026-05-01T00:00:00.100Z",
          clientId: params.clientId,
          activeAttachmentIds:
            params.clientId === "tui-test"
              ? ["sdk-test_attachment", "tui-test_attachment"]
              : ["sdk-test_attachment"],
        };
      }),
      sendMessage: vi.fn().mockResolvedValue({
        messageId: "message_sdk",
        acceptedAt: "2026-05-01T00:00:01.000Z",
      }),
      streamMessage: vi.fn().mockResolvedValue({
        messageId: "message_tui",
        streamId: "tui-test:hello-world",
        acceptedAt: "2026-05-01T00:00:02.000Z",
      }),
      listSessions: vi.fn().mockImplementation(async () => {
        return {
          sessions: [
            {
              sessionId: "session_1",
              agentId: "agent_default",
              status: "idle",
              createdAt: "2026-05-01T00:00:00.000Z",
              activeAttachmentIds: [
                "sdk-test_attachment",
                "tui-test_attachment",
              ],
            },
          ],
        };
      }),
    };

    await runDaemonCoAttach({
      client,
      cwd: "/workspace",
      sdkClientId: "sdk-test",
      sdkPrompt: "hello from sdk",
      tuiClientId: "tui-test",
      tuiPrompt: "hello from tui",
    });

    expect(client.streamMessage).toHaveBeenCalledWith({
      sessionId: "session_1",
      content: "hello from tui",
      streamId: "tui-test:hello-world",
      metadata: { source: "tui-test" },
    });
    expect(calls).toEqual(["attach:sdk-test", "attach:tui-test"]);
  });
});
