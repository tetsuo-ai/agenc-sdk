export const AGENC_DAEMON_JSON_RPC_VERSION = "2.0" as const;

export type AgenCDaemonRequestId = string | number;
export type AgenCDaemonJsonPrimitive = string | number | boolean | null;
export type AgenCDaemonJsonValue =
  | AgenCDaemonJsonPrimitive
  | readonly AgenCDaemonJsonValue[]
  | AgenCDaemonJsonObject;

export interface AgenCDaemonJsonObject {
  readonly [key: string]: AgenCDaemonJsonValue | undefined;
}

export type AgenCDaemonMethod =
  | "initialize"
  | "agent.create"
  | "agent.list"
  | "agent.attach"
  | "agent.stop"
  | "session.create"
  | "session.list"
  | "session.attach"
  | "session.detach"
  | "session.terminate"
  | "message.send"
  | "message.stream"
  | "tool.approve"
  | "tool.deny"
  | "permission.list"
  | "health.ping"
  | "health.ready"
  | "health.stats"
  | "auth.login"
  | "auth.whoami"
  | "auth.logout";

export interface InitializeParams extends AgenCDaemonJsonObject {
  readonly protocolVersion?: string;
  readonly clientName?: string;
  readonly capabilities?: AgenCDaemonJsonObject;
}

export interface AgentCreateParams extends AgenCDaemonJsonObject {
  readonly objective?: string;
  readonly cwd?: string;
  readonly model?: string;
  readonly provider?: string;
  readonly profile?: string;
  readonly instructions?: string;
  readonly unattendedAllow?: readonly string[];
  readonly unattendedDeny?: readonly string[];
  readonly metadata?: AgenCDaemonJsonObject;
}

export interface AgentListParams extends AgenCDaemonJsonObject {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface AgentAttachParams extends AgenCDaemonJsonObject {
  readonly agentId: string;
  readonly clientId?: string;
}

export interface AgentStopParams extends AgenCDaemonJsonObject {
  readonly agentId: string;
  readonly reason?: string;
}

export interface SessionCreateParams extends AgenCDaemonJsonObject {
  readonly agentId?: string;
  readonly cwd?: string;
  readonly initialPrompt?: string;
  readonly metadata?: AgenCDaemonJsonObject;
}

export interface SessionListParams extends AgenCDaemonJsonObject {
  readonly agentId?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface SessionAttachParams extends AgenCDaemonJsonObject {
  readonly sessionId: string;
  readonly clientId?: string;
}

export interface SessionDetachParams extends AgenCDaemonJsonObject {
  readonly sessionId: string;
  readonly attachmentId?: string;
  readonly clientId?: string;
}

export interface SessionTerminateParams extends AgenCDaemonJsonObject {
  readonly sessionId: string;
  readonly reason?: string;
}

export interface MessageContentBlock extends AgenCDaemonJsonObject {
  readonly type: "text";
  readonly text: string;
}

export type MessageContent = string | readonly MessageContentBlock[];

export interface MessageSendParams extends AgenCDaemonJsonObject {
  readonly sessionId: string;
  readonly content: MessageContent;
  readonly clientMessageId?: string;
  readonly metadata?: AgenCDaemonJsonObject;
}

export interface MessageStreamParams extends MessageSendParams {
  readonly streamId?: string;
}

export interface ToolApproveParams extends AgenCDaemonJsonObject {
  readonly sessionId: string;
  readonly requestId: string;
  readonly scope?: "once" | "session" | "agent";
}

export interface ToolDenyParams extends AgenCDaemonJsonObject {
  readonly sessionId: string;
  readonly requestId: string;
  readonly reason?: string;
}

export interface PermissionListParams extends AgenCDaemonJsonObject {
  readonly agentId?: string;
  readonly sessionId?: string;
}

export type EmptyDaemonParams = Record<string, never>;

export interface AgenCDaemonParamsByMethod {
  readonly initialize: InitializeParams;
  readonly "agent.create": AgentCreateParams;
  readonly "agent.list": AgentListParams;
  readonly "agent.attach": AgentAttachParams;
  readonly "agent.stop": AgentStopParams;
  readonly "session.create": SessionCreateParams;
  readonly "session.list": SessionListParams;
  readonly "session.attach": SessionAttachParams;
  readonly "session.detach": SessionDetachParams;
  readonly "session.terminate": SessionTerminateParams;
  readonly "message.send": MessageSendParams;
  readonly "message.stream": MessageStreamParams;
  readonly "tool.approve": ToolApproveParams;
  readonly "tool.deny": ToolDenyParams;
  readonly "permission.list": PermissionListParams;
  readonly "health.ping": EmptyDaemonParams;
  readonly "health.ready": EmptyDaemonParams;
  readonly "health.stats": EmptyDaemonParams;
  readonly "auth.login": EmptyDaemonParams;
  readonly "auth.whoami": EmptyDaemonParams;
  readonly "auth.logout": EmptyDaemonParams;
}

export type AgentStatus = "idle" | "running" | "stopping" | "stopped" | "error";
export type SessionStatus = "idle" | "running" | "waiting" | "closed" | "error";

export interface AgentSummary extends AgenCDaemonJsonObject {
  readonly agentId: string;
  readonly agentPath?: string;
  readonly objective?: string;
  readonly status: AgentStatus;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly lastActiveAt?: string;
  readonly cwd?: string;
  readonly activeSessionIds?: readonly string[];
  readonly metadata?: AgenCDaemonJsonObject;
}

export interface SessionSummary extends AgenCDaemonJsonObject {
  readonly sessionId: string;
  readonly agentId: string;
  readonly status: SessionStatus;
  readonly createdAt: string;
  readonly cwd?: string;
  readonly metadata?: AgenCDaemonJsonObject;
  readonly activeAttachmentIds?: readonly string[];
  readonly closedAt?: string;
}

export interface AgentCreateResult extends AgentSummary {
  readonly sessionId?: string;
}

export interface AgentListResult extends AgenCDaemonJsonObject {
  readonly agents: readonly AgentSummary[];
  readonly nextCursor?: string;
}

export interface AgentAttachResult extends AgenCDaemonJsonObject {
  readonly agentId: string;
  readonly attachmentId: string;
  readonly sessionIds: readonly string[];
}

export interface AgentStopResult extends AgenCDaemonJsonObject {
  readonly agentId: string;
  readonly stopped: boolean;
}

export interface InitializeResult extends AgenCDaemonJsonObject {
  readonly type: "initialized";
  readonly protocolVersion: string;
  readonly capabilities: AgenCDaemonJsonObject;
}

export interface SessionCreateResult extends SessionSummary {}

export interface SessionListResult extends AgenCDaemonJsonObject {
  readonly sessions: readonly SessionSummary[];
  readonly nextCursor?: string;
}

export interface SessionAttachResult extends AgenCDaemonJsonObject {
  readonly sessionId: string;
  readonly attachmentId: string;
  readonly attachedAt: string;
  readonly clientId?: string;
  readonly activeAttachmentIds: readonly string[];
}

export interface SessionDetachResult extends AgenCDaemonJsonObject {
  readonly sessionId: string;
  readonly detached: boolean;
  readonly attachmentId?: string;
  readonly remainingAttachmentIds: readonly string[];
}

export interface SessionTerminateResult extends AgenCDaemonJsonObject {
  readonly sessionId: string;
  readonly terminated: boolean;
  readonly status: "closed";
  readonly closedAt: string;
  readonly reason?: string;
}

export interface MessageSendResult extends AgenCDaemonJsonObject {
  readonly messageId: string;
  readonly acceptedAt: string;
}

export interface MessageStreamResult extends MessageSendResult {
  readonly streamId: string;
}

export interface ToolDecisionResult extends AgenCDaemonJsonObject {
  readonly requestId: string;
  readonly decision: "approved" | "denied";
}

export interface PermissionGrant extends AgenCDaemonJsonObject {
  readonly permissionId: string;
  readonly subject: string;
  readonly action: string;
  readonly scope?: string;
  readonly grantedAt?: string;
  readonly expiresAt?: string;
}

export interface PermissionListResult extends AgenCDaemonJsonObject {
  readonly permissions: readonly PermissionGrant[];
}

export interface HealthPingResult extends AgenCDaemonJsonObject {
  readonly ok: true;
  readonly now: string;
}

export interface HealthReadyResult extends AgenCDaemonJsonObject {
  readonly ready: boolean;
  readonly uptimeMs: number;
  readonly now: string;
}

export interface HealthMemoryStats extends AgenCDaemonJsonObject {
  readonly rss: number;
  readonly heapTotal: number;
  readonly heapUsed: number;
  readonly external: number;
  readonly arrayBuffers: number;
}

export interface HealthSessionStats extends AgenCDaemonJsonObject {
  readonly active: number;
  readonly closed: number;
  readonly total: number;
}

export interface HealthStatsResult extends AgenCDaemonJsonObject {
  readonly uptimeMs: number;
  readonly now: string;
  readonly sessions: HealthSessionStats;
  readonly memory: HealthMemoryStats;
}

export interface AuthIdentity extends AgenCDaemonJsonObject {
  readonly accountId?: string;
  readonly email?: string;
  readonly displayName?: string;
  readonly plan?: string;
}

export interface AuthWhoamiResult extends AgenCDaemonJsonObject {
  readonly authenticated: boolean;
  readonly provider?: string;
  readonly identity?: AuthIdentity;
}

export interface AuthLoginResult extends AgenCDaemonJsonObject {
  readonly authenticated: true;
  readonly provider?: string;
  readonly identity?: AuthIdentity;
}

export interface AuthLogoutResult extends AgenCDaemonJsonObject {
  readonly authenticated: false;
}

export interface AgenCDaemonResultByMethod {
  readonly initialize: InitializeResult;
  readonly "agent.create": AgentCreateResult;
  readonly "agent.list": AgentListResult;
  readonly "agent.attach": AgentAttachResult;
  readonly "agent.stop": AgentStopResult;
  readonly "session.create": SessionCreateResult;
  readonly "session.list": SessionListResult;
  readonly "session.attach": SessionAttachResult;
  readonly "session.detach": SessionDetachResult;
  readonly "session.terminate": SessionTerminateResult;
  readonly "message.send": MessageSendResult;
  readonly "message.stream": MessageStreamResult;
  readonly "tool.approve": ToolDecisionResult;
  readonly "tool.deny": ToolDecisionResult;
  readonly "permission.list": PermissionListResult;
  readonly "health.ping": HealthPingResult;
  readonly "health.ready": HealthReadyResult;
  readonly "health.stats": HealthStatsResult;
  readonly "auth.login": AuthLoginResult;
  readonly "auth.whoami": AuthWhoamiResult;
  readonly "auth.logout": AuthLogoutResult;
}

export interface AgenCDaemonRequest<
  Method extends AgenCDaemonMethod = AgenCDaemonMethod,
> {
  readonly jsonrpc: typeof AGENC_DAEMON_JSON_RPC_VERSION;
  readonly id: AgenCDaemonRequestId;
  readonly method: Method;
  readonly params?: AgenCDaemonParamsByMethod[Method];
}

export type AgenCDaemonErrorCode =
  | -32700
  | -32600
  | -32601
  | -32602
  | -32603
  | -32000;

export interface AgenCDaemonErrorObject extends AgenCDaemonJsonObject {
  readonly code: AgenCDaemonErrorCode;
  readonly message: string;
  readonly data?: AgenCDaemonJsonValue;
}

export interface AgenCDaemonSuccessResponse<
  Method extends AgenCDaemonMethod = AgenCDaemonMethod,
> {
  readonly jsonrpc: typeof AGENC_DAEMON_JSON_RPC_VERSION;
  readonly id: AgenCDaemonRequestId;
  readonly result: AgenCDaemonResultByMethod[Method];
}

export interface AgenCDaemonErrorResponse {
  readonly jsonrpc: typeof AGENC_DAEMON_JSON_RPC_VERSION;
  readonly id: AgenCDaemonRequestId | null;
  readonly error: AgenCDaemonErrorObject;
}

export type AgenCDaemonResponse<
  Method extends AgenCDaemonMethod = AgenCDaemonMethod,
> = AgenCDaemonSuccessResponse<Method> | AgenCDaemonErrorResponse;

export interface AgenCDaemonTransport {
  request<Method extends AgenCDaemonMethod>(
    request: AgenCDaemonRequest<Method>,
  ): Promise<AgenCDaemonResponse<Method>>;
}

export interface AgenCDaemonClientOptions {
  readonly transport: AgenCDaemonTransport;
  readonly createRequestId?: () => AgenCDaemonRequestId;
}

export class AgenCDaemonRpcError extends Error {
  readonly code: AgenCDaemonErrorCode;
  readonly data?: AgenCDaemonJsonValue;
  readonly method: AgenCDaemonMethod;
  readonly requestId: AgenCDaemonRequestId | null;

  constructor(
    error: AgenCDaemonErrorObject,
    method: AgenCDaemonMethod,
    requestId: AgenCDaemonRequestId | null,
  ) {
    super(error.message);
    this.name = "AgenCDaemonRpcError";
    this.code = error.code;
    this.data = error.data;
    this.method = method;
    this.requestId = requestId;
  }
}

export class AgenCDaemonMalformedResponseError extends Error {
  readonly response: unknown;

  constructor(message: string, response: unknown) {
    super(message);
    this.name = "AgenCDaemonMalformedResponseError";
    this.response = response;
  }
}

export class AgenCDaemonClient {
  readonly #transport: AgenCDaemonTransport;
  readonly #createRequestId: () => AgenCDaemonRequestId;

  constructor(options: AgenCDaemonClientOptions) {
    this.#transport = options.transport;
    this.#createRequestId = options.createRequestId ?? createNumericIdFactory();
  }

  async request<Method extends AgenCDaemonMethod>(
    method: Method,
    params?: AgenCDaemonParamsByMethod[Method],
  ): Promise<AgenCDaemonResultByMethod[Method]> {
    const id = this.#createRequestId();
    const request: AgenCDaemonRequest<Method> =
      params === undefined
        ? { jsonrpc: AGENC_DAEMON_JSON_RPC_VERSION, id, method }
        : { jsonrpc: AGENC_DAEMON_JSON_RPC_VERSION, id, method, params };
    const response = await this.#transport.request(request);
    return parseAgenCDaemonResponse(response, method, id);
  }

  createAgent(params: AgentCreateParams = {}): Promise<AgentCreateResult> {
    return this.request("agent.create", params);
  }

  initialize(params: InitializeParams = {}): Promise<InitializeResult> {
    return this.request("initialize", params);
  }

  listAgents(params: AgentListParams = {}): Promise<AgentListResult> {
    return this.request("agent.list", params);
  }

  attachAgent(params: AgentAttachParams): Promise<AgentAttachResult> {
    return this.request("agent.attach", params);
  }

  stopAgent(params: AgentStopParams): Promise<AgentStopResult> {
    return this.request("agent.stop", params);
  }

  createSession(
    params: SessionCreateParams = {},
  ): Promise<SessionCreateResult> {
    return this.request("session.create", params);
  }

  listSessions(params: SessionListParams = {}): Promise<SessionListResult> {
    return this.request("session.list", params);
  }

  attachSession(params: SessionAttachParams): Promise<SessionAttachResult> {
    return this.request("session.attach", params);
  }

  detachSession(params: SessionDetachParams): Promise<SessionDetachResult> {
    return this.request("session.detach", params);
  }

  terminateSession(
    params: SessionTerminateParams,
  ): Promise<SessionTerminateResult> {
    return this.request("session.terminate", params);
  }

  sendMessage(params: MessageSendParams): Promise<MessageSendResult> {
    return this.request("message.send", params);
  }

  streamMessage(params: MessageStreamParams): Promise<MessageStreamResult> {
    return this.request("message.stream", params);
  }

  approveTool(params: ToolApproveParams): Promise<ToolDecisionResult> {
    return this.request("tool.approve", params);
  }

  denyTool(params: ToolDenyParams): Promise<ToolDecisionResult> {
    return this.request("tool.deny", params);
  }

  listPermissions(
    params: PermissionListParams = {},
  ): Promise<PermissionListResult> {
    return this.request("permission.list", params);
  }

  ping(): Promise<HealthPingResult> {
    return this.request("health.ping");
  }

  ready(): Promise<HealthReadyResult> {
    return this.request("health.ready");
  }

  stats(): Promise<HealthStatsResult> {
    return this.request("health.stats");
  }

  login(): Promise<AuthLoginResult> {
    return this.request("auth.login");
  }

  whoami(): Promise<AuthWhoamiResult> {
    return this.request("auth.whoami");
  }

  logout(): Promise<AuthLogoutResult> {
    return this.request("auth.logout");
  }
}

export function createAgenCDaemonClient(
  options: AgenCDaemonClientOptions,
): AgenCDaemonClient {
  return new AgenCDaemonClient(options);
}

function createNumericIdFactory(): () => number {
  let nextId = 1;
  return () => {
    const id = nextId;
    nextId += 1;
    return id;
  };
}

function parseAgenCDaemonResponse<Method extends AgenCDaemonMethod>(
  response: AgenCDaemonResponse<Method>,
  method: Method,
  requestId: AgenCDaemonRequestId,
): AgenCDaemonResultByMethod[Method] {
  if (!isObjectRecord(response)) {
    throw new AgenCDaemonMalformedResponseError(
      "AgenC daemon response must be an object",
      response,
    );
  }
  if (response.jsonrpc !== AGENC_DAEMON_JSON_RPC_VERSION) {
    throw new AgenCDaemonMalformedResponseError(
      "AgenC daemon response used an unsupported JSON-RPC version",
      response,
    );
  }
  if (response.id !== requestId) {
    throw new AgenCDaemonMalformedResponseError(
      "AgenC daemon response id mismatch",
      response,
    );
  }
  if (isAgenCDaemonErrorResponse(response)) {
    throw new AgenCDaemonRpcError(response.error, method, response.id);
  }
  if (!("result" in response)) {
    throw new AgenCDaemonMalformedResponseError(
      "AgenC daemon response must include result or error",
      response,
    );
  }
  return response.result;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAgenCDaemonErrorResponse(
  response: unknown,
): response is AgenCDaemonErrorResponse {
  return (
    isObjectRecord(response) &&
    "error" in response &&
    isObjectRecord(response.error)
  );
}
