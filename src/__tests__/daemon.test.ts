import { describe, expect, it, vi } from "vitest";
import {
  AGENC_DAEMON_JSON_RPC_VERSION,
  AgenCDaemonClient,
  AgenCDaemonMalformedResponseError,
  AgenCDaemonRpcError,
  createAgenCDaemonClient,
  type AgenCDaemonRequest,
  type AgenCDaemonResponse,
  type AgenCDaemonTransport,
} from "../daemon";

function createTransport(
  handler: (
    request: AgenCDaemonRequest,
  ) => Promise<AgenCDaemonResponse> | AgenCDaemonResponse,
): AgenCDaemonTransport & {
  readonly request: ReturnType<typeof vi.fn>;
} {
  return {
    request: vi.fn((request: AgenCDaemonRequest) => handler(request)),
  };
}

describe("AgenCDaemonClient", () => {
  it("frames typed agent.create requests without SDK-side agent logic", async () => {
    const transport = createTransport((request) => ({
      jsonrpc: AGENC_DAEMON_JSON_RPC_VERSION,
      id: request.id,
      result: {
        agentId: "agent_1",
        status: "idle",
        createdAt: "2026-05-01T00:00:00.000Z",
        cwd: "/workspace",
      },
    }));
    const client = new AgenCDaemonClient({
      transport,
      createRequestId: () => "req_1",
    });

    const result = await client.createAgent({
      cwd: "/workspace",
      model: "grok-4",
    });

    expect(transport.request).toHaveBeenCalledWith({
      jsonrpc: AGENC_DAEMON_JSON_RPC_VERSION,
      id: "req_1",
      method: "agent.create",
      params: {
        cwd: "/workspace",
        model: "grok-4",
      },
    });
    expect(result.agentId).toBe("agent_1");
  });

  it("uses empty objects for required list-style params", async () => {
    const transport = createTransport((request) => ({
      jsonrpc: AGENC_DAEMON_JSON_RPC_VERSION,
      id: request.id,
      result: { agents: [] },
    }));
    const client = createAgenCDaemonClient({ transport });

    await expect(client.listAgents()).resolves.toEqual({ agents: [] });

    expect(transport.request).toHaveBeenCalledWith({
      jsonrpc: AGENC_DAEMON_JSON_RPC_VERSION,
      id: 1,
      method: "agent.list",
      params: {},
    });
  });

  it("omits params for optional health/auth methods", async () => {
    const transport = createTransport((request) => ({
      jsonrpc: AGENC_DAEMON_JSON_RPC_VERSION,
      id: request.id,
      result: {
        ok: true,
        now: "2026-05-01T00:00:00.000Z",
      },
    }));
    const client = new AgenCDaemonClient({ transport });

    await expect(client.ping()).resolves.toMatchObject({ ok: true });

    expect(transport.request).toHaveBeenCalledWith({
      jsonrpc: AGENC_DAEMON_JSON_RPC_VERSION,
      id: 1,
      method: "health.ping",
    });
  });

  it("throws structured JSON-RPC errors", async () => {
    const transport = createTransport((request) => ({
      jsonrpc: AGENC_DAEMON_JSON_RPC_VERSION,
      id: request.id,
      error: {
        code: -32601,
        message: "Unknown method",
      },
    }));
    const client = new AgenCDaemonClient({
      transport,
      createRequestId: () => "auth_1",
    });

    await expect(client.whoami()).rejects.toMatchObject({
      name: "AgenCDaemonRpcError",
      code: -32601,
      method: "auth.whoami",
      requestId: "auth_1",
    } satisfies Partial<AgenCDaemonRpcError>);
  });

  it("rejects mismatched response ids", async () => {
    const transport = createTransport(() => ({
      jsonrpc: AGENC_DAEMON_JSON_RPC_VERSION,
      id: "other",
      result: {
        ready: true,
        uptimeMs: 10,
        now: "2026-05-01T00:00:00.000Z",
      },
    }));
    const client = new AgenCDaemonClient({
      transport,
      createRequestId: () => "ready_1",
    });

    await expect(client.ready()).rejects.toBeInstanceOf(
      AgenCDaemonMalformedResponseError,
    );
    await expect(client.ready()).rejects.toThrow("response id mismatch");
  });

  it("rejects responses without result or error", async () => {
    const transport = createTransport((request) => ({
      jsonrpc: AGENC_DAEMON_JSON_RPC_VERSION,
      id: request.id,
    } as AgenCDaemonResponse));
    const client = new AgenCDaemonClient({ transport });

    await expect(client.stats()).rejects.toThrow(
      "must include result or error",
    );
  });
});
