import { describe, expect, it, vi } from "vitest";
import { runDaemonHelloWorld } from "./index.js";

describe("daemon hello-world example", () => {
  it("creates a session and sends one message through the SDK client", async () => {
    const client = {
      createSession: vi.fn().mockResolvedValue({
        sessionId: "session_1",
        agentId: "agent_default",
        status: "idle",
        createdAt: "2026-05-01T00:00:00.000Z",
      }),
      sendMessage: vi.fn().mockResolvedValue({
        messageId: "message_1",
        acceptedAt: "2026-05-01T00:00:01.000Z",
      }),
    };

    const result = await runDaemonHelloWorld({
      client,
      cwd: "/workspace",
      prompt: "Hello from test",
    });

    expect(client.createSession).toHaveBeenCalledWith({
      cwd: "/workspace",
      initialPrompt: "Hello from test",
      metadata: { source: "sdk-daemon-hello-world" },
    });
    expect(client.sendMessage).toHaveBeenCalledWith({
      sessionId: "session_1",
      content: "Hello from test",
      metadata: { source: "sdk-daemon-hello-world" },
    });
    expect(result.response.messageId).toBe("message_1");
  });
});
