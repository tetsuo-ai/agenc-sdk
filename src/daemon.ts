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
  | "request.cancel"
  | "agent.create"
  | "agent.list"
  | "agent.attach"
  | "agent.stop"
  | "agent.logs"
  | "session.create"
  | "session.list"
  | "session.attach"
  | "session.detach"
  | "session.terminate"
  | "message.send"
  | "message.stream"
  | "thread/realtime/start"
  | "thread/realtime/appendAudio"
  | "thread/realtime/appendText"
  | "thread/realtime/stop"
  | "thread/realtime/listVoices"
  | "tool.approve"
  | "tool.deny"
  | "tool.cancel"
  | "elicitation.respond"
  | "permission.list"
  | "fs.fuzzy_search"
  | "commandExec.start"
  | "commandExec.write"
  | "commandExec.resize"
  | "commandExec.terminate"
  | "health.ping"
  | "health.ready"
  | "health.stats"
  | "auth.login"
  | "auth.whoami"
  | "auth.logout";

export type AgenCDaemonNotificationMethod =
  | "commandExec.outputDelta"
  | "event.message_chunk"
  | "event.tool_request"
  | "event.permission_request"
  | "event.user_input_request"
  | "event.mcp_elicitation_request"
  | "event.agent_status"
  | "event.session_event"
  | "thread/realtime/started"
  | "thread/realtime/itemAdded"
  | "thread/realtime/transcript/delta"
  | "thread/realtime/transcript/done"
  | "thread/realtime/outputAudio/delta"
  | "thread/realtime/sdp"
  | "thread/realtime/error"
  | "thread/realtime/closed";

export interface InitializeParams extends AgenCDaemonJsonObject {
  readonly protocolVersion?: string;
  readonly clientName?: string;
  readonly authCookie?: string;
  readonly capabilities?: AgenCDaemonJsonObject;
}

export interface RequestCancelParams extends AgenCDaemonJsonObject {
  readonly requestId: AgenCDaemonRequestId;
  readonly reason?: string;
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

export interface AgentLogsParams extends AgenCDaemonJsonObject {
  readonly agentId: string;
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

export type ThreadRealtimeVersion = "v1" | "v2";
export type ThreadRealtimeSessionMode = "conversational" | "transcription";
export type ThreadRealtimeOutputModality = "audio" | "text";
export type ThreadRealtimeVoice =
  | "alloy"
  | "arbor"
  | "ash"
  | "ballad"
  | "breeze"
  | "cedar"
  | "coral"
  | "cove"
  | "echo"
  | "ember"
  | "juniper"
  | "maple"
  | "marin"
  | "sage"
  | "shimmer"
  | "sol"
  | "spruce"
  | "vale"
  | "verse";

export interface ThreadRealtimeWebsocketTransport extends AgenCDaemonJsonObject {
  readonly type: "websocket";
}

export interface ThreadRealtimeWebrtcTransport extends AgenCDaemonJsonObject {
  readonly type: "webrtc";
  readonly sdp: string;
}

export type ThreadRealtimeStartTransport =
  | ThreadRealtimeWebsocketTransport
  | ThreadRealtimeWebrtcTransport;

export interface ThreadRealtimeStartParams extends AgenCDaemonJsonObject {
  readonly threadId: string;
  readonly transport?: ThreadRealtimeStartTransport | null;
  readonly realtimeSessionId?: string | null;
  readonly prompt?: string | null;
  readonly outputModality: ThreadRealtimeOutputModality;
  readonly voice?: ThreadRealtimeVoice | null;
}

export interface ThreadRealtimeAudioChunk extends AgenCDaemonJsonObject {
  readonly data: string;
  readonly sampleRate: number;
  readonly numChannels: number;
  readonly samplesPerChannel?: number;
  readonly itemId?: string;
}

export interface ThreadRealtimeAppendAudioParams extends AgenCDaemonJsonObject {
  readonly threadId: string;
  readonly audio: ThreadRealtimeAudioChunk;
}

export interface ThreadRealtimeAppendTextParams extends AgenCDaemonJsonObject {
  readonly threadId: string;
  readonly text: string;
}

export interface ThreadRealtimeStopParams extends AgenCDaemonJsonObject {
  readonly threadId: string;
}

export interface ThreadRealtimeVoicesList extends AgenCDaemonJsonObject {
  readonly v1: readonly ThreadRealtimeVoice[];
  readonly v2: readonly ThreadRealtimeVoice[];
  readonly defaultV1: ThreadRealtimeVoice;
  readonly defaultV2: ThreadRealtimeVoice;
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

export interface ToolCancelParams extends AgenCDaemonJsonObject {
  readonly sessionId: string;
  readonly requestId: string;
  readonly reason?: string;
}

export interface ElicitationRespondParams extends AgenCDaemonJsonObject {
  readonly sessionId: string;
  readonly requestId: AgenCDaemonRequestId;
  readonly kind: "request_user_input" | "mcp";
  readonly serverName?: string;
  readonly response: AgenCDaemonJsonObject;
}

export interface PermissionListParams extends AgenCDaemonJsonObject {
  readonly agentId?: string;
  readonly sessionId?: string;
}

export interface FuzzyFileSearchParams extends AgenCDaemonJsonObject {
  readonly query: string;
  readonly roots: readonly string[];
  readonly cancellationToken?: string | null;
}

export interface CommandExecTerminalSize extends AgenCDaemonJsonObject {
  readonly rows: number;
  readonly cols: number;
}

export type CommandExecEnv = Readonly<Record<string, string | null>>;

export interface CommandExecStartParams extends AgenCDaemonJsonObject {
  readonly command: readonly string[];
  readonly processId?: string | null;
  readonly tty?: boolean;
  readonly streamStdin?: boolean;
  readonly streamStdoutStderr?: boolean;
  readonly outputBytesCap?: number | null;
  readonly disableOutputCap?: boolean;
  readonly disableTimeout?: boolean;
  readonly timeoutMs?: number | null;
  readonly cwd?: string | null;
  readonly env?: CommandExecEnv | null;
  readonly size?: CommandExecTerminalSize | null;
  readonly sandboxPolicy?: AgenCDaemonJsonObject | null;
  readonly permissionProfile?: AgenCDaemonJsonObject | null;
}

export interface CommandExecWriteParams extends AgenCDaemonJsonObject {
  readonly processId: string;
  readonly deltaBase64?: string | null;
  readonly closeStdin?: boolean;
}

export interface CommandExecTerminateParams extends AgenCDaemonJsonObject {
  readonly processId: string;
}

export interface CommandExecResizeParams extends AgenCDaemonJsonObject {
  readonly processId: string;
  readonly size: CommandExecTerminalSize;
}

export type EmptyDaemonParams = Record<string, never>;

export interface AgenCDaemonParamsByMethod {
  readonly initialize: InitializeParams;
  readonly "request.cancel": RequestCancelParams;
  readonly "agent.create": AgentCreateParams;
  readonly "agent.list": AgentListParams;
  readonly "agent.attach": AgentAttachParams;
  readonly "agent.stop": AgentStopParams;
  readonly "agent.logs": AgentLogsParams;
  readonly "session.create": SessionCreateParams;
  readonly "session.list": SessionListParams;
  readonly "session.attach": SessionAttachParams;
  readonly "session.detach": SessionDetachParams;
  readonly "session.terminate": SessionTerminateParams;
  readonly "message.send": MessageSendParams;
  readonly "message.stream": MessageStreamParams;
  readonly "thread/realtime/start": ThreadRealtimeStartParams;
  readonly "thread/realtime/appendAudio": ThreadRealtimeAppendAudioParams;
  readonly "thread/realtime/appendText": ThreadRealtimeAppendTextParams;
  readonly "thread/realtime/stop": ThreadRealtimeStopParams;
  readonly "thread/realtime/listVoices": EmptyDaemonParams;
  readonly "tool.approve": ToolApproveParams;
  readonly "tool.deny": ToolDenyParams;
  readonly "tool.cancel": ToolCancelParams;
  readonly "elicitation.respond": ElicitationRespondParams;
  readonly "permission.list": PermissionListParams;
  readonly "fs.fuzzy_search": FuzzyFileSearchParams;
  readonly "commandExec.start": CommandExecStartParams;
  readonly "commandExec.write": CommandExecWriteParams;
  readonly "commandExec.resize": CommandExecResizeParams;
  readonly "commandExec.terminate": CommandExecTerminateParams;
  readonly "health.ping": EmptyDaemonParams;
  readonly "health.ready": EmptyDaemonParams;
  readonly "health.stats": EmptyDaemonParams;
  readonly "auth.login": EmptyDaemonParams;
  readonly "auth.whoami": EmptyDaemonParams;
  readonly "auth.logout": EmptyDaemonParams;
}

export type AgentStatus = "idle" | "running" | "stopping" | "stopped" | "error";
export type AgentRunStatus =
  | "pending"
  | "running"
  | "working"
  | "paused"
  | "blocked"
  | "suspended"
  | "completed"
  | "errored"
  | "stopped";
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

export interface AgentLogSession extends AgenCDaemonJsonObject {
  readonly sessionId: string;
  readonly itemCount: number;
  readonly transcript: string;
  readonly rolloutPath?: string;
  readonly source?: string;
}

export interface AgentToolOutputLog extends AgenCDaemonJsonObject {
  readonly sessionId: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly status: string;
  readonly output: string;
  readonly outputBytes: number;
  readonly outputLogPath?: string;
  readonly outputLogBytes?: number;
}

export interface AgentLogsResult extends AgenCDaemonJsonObject {
  readonly agentId: string;
  readonly transcript: string;
  readonly sessions: readonly AgentLogSession[];
  readonly toolOutputs?: readonly AgentToolOutputLog[];
}

export interface InitializeResult extends AgenCDaemonJsonObject {
  readonly type: "initialized";
  readonly protocolVersion: string;
  readonly capabilities: AgenCDaemonJsonObject;
}

export interface RequestCancelResult extends AgenCDaemonJsonObject {
  readonly requestId: AgenCDaemonRequestId;
  readonly cancelled: boolean;
  readonly reason?: string;
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

export interface ThreadRealtimeStartResponse extends AgenCDaemonJsonObject {}

export interface ThreadRealtimeAppendAudioResponse extends AgenCDaemonJsonObject {}

export interface ThreadRealtimeAppendTextResponse extends AgenCDaemonJsonObject {}

export interface ThreadRealtimeStopResponse extends AgenCDaemonJsonObject {}

export interface ThreadRealtimeListVoicesResponse extends AgenCDaemonJsonObject {
  readonly voices: ThreadRealtimeVoicesList;
}

export interface ToolDecisionResult extends AgenCDaemonJsonObject {
  readonly requestId: string;
  readonly decision: "approved" | "denied" | "cancelled";
}

export interface ElicitationRespondResult extends AgenCDaemonJsonObject {
  readonly requestId: AgenCDaemonRequestId;
  readonly resolved: boolean;
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

export interface FuzzyFileSearchResult extends AgenCDaemonJsonObject {
  readonly root: string;
  readonly path: string;
  readonly match_type: "file" | "directory";
  readonly file_name: string;
  readonly score: number;
  readonly indices?: readonly number[];
}

export interface FuzzyFileSearchResponse extends AgenCDaemonJsonObject {
  readonly files: readonly FuzzyFileSearchResult[];
}

export interface CommandExecResponse extends AgenCDaemonJsonObject {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CommandExecWriteResponse extends AgenCDaemonJsonObject {}

export interface CommandExecTerminateResponse extends AgenCDaemonJsonObject {}

export interface CommandExecResizeResponse extends AgenCDaemonJsonObject {}

export type CommandExecOutputStream = "stdout" | "stderr";

export interface CommandExecOutputDeltaParams extends AgenCDaemonJsonObject {
  readonly processId: string;
  readonly stream: CommandExecOutputStream;
  readonly deltaBase64: string;
  readonly capReached: boolean;
}

export interface AgenCEventBaseParams extends AgenCDaemonJsonObject {
  readonly sessionId: string;
  readonly eventId: string;
  readonly agentId?: string;
  readonly sequence?: number;
  readonly acceptedAt?: string;
  readonly metadata?: AgenCDaemonJsonObject;
}

export interface EventMessageChunkParams extends AgenCEventBaseParams {
  readonly messageId?: string;
  readonly streamId?: string;
  readonly delta: string;
}

export interface EventToolRequestParams extends AgenCEventBaseParams {
  readonly requestId: string;
  readonly toolName: string;
  readonly turnId?: string;
  readonly input?: AgenCDaemonJsonValue;
  readonly recoveryCategory?: "idempotent" | "side-effecting" | "interactive";
}

export interface EventPermissionRequestParams extends AgenCEventBaseParams {
  readonly requestId: string;
  readonly toolName?: string;
  readonly turnId?: string;
  readonly permissions: readonly string[];
  readonly input?: AgenCDaemonJsonValue;
  readonly reason?: string;
}

export interface EventUserInputRequestParams extends AgenCEventBaseParams {
  readonly requestId: string;
  readonly callId: string;
  readonly turnId: string;
  readonly questions: readonly AgenCDaemonJsonObject[];
}

export interface EventMcpElicitationRequestParams extends AgenCEventBaseParams {
  readonly requestId: AgenCDaemonRequestId;
  readonly serverName: string;
  readonly turnId: string;
  readonly request: AgenCDaemonJsonObject;
}

export interface EventAgentStatusParams extends AgenCEventBaseParams {
  readonly agentId: string;
  readonly status: AgentStatus;
  readonly runStatus?: AgentRunStatus;
  readonly turnId?: string;
  readonly message?: string;
}

export interface EventSessionEventParams extends AgenCEventBaseParams {
  readonly event: AgenCDaemonJsonObject;
}

export interface ThreadRealtimeBaseParams extends AgenCDaemonJsonObject {
  readonly threadId: string;
}

export interface ThreadRealtimeStartedParams extends ThreadRealtimeBaseParams {
  readonly realtimeSessionId?: string | null;
  readonly version: ThreadRealtimeVersion;
}

export interface ThreadRealtimeItemAddedParams extends ThreadRealtimeBaseParams {
  readonly item: AgenCDaemonJsonValue;
}

export interface ThreadRealtimeTranscriptDeltaParams extends ThreadRealtimeBaseParams {
  readonly role: string;
  readonly delta: string;
}

export interface ThreadRealtimeTranscriptDoneParams extends ThreadRealtimeBaseParams {
  readonly role: string;
  readonly text: string;
}

export interface ThreadRealtimeOutputAudioDeltaParams extends ThreadRealtimeBaseParams {
  readonly audio: ThreadRealtimeAudioChunk;
}

export interface ThreadRealtimeSdpParams extends ThreadRealtimeBaseParams {
  readonly sdp: string;
}

export interface ThreadRealtimeErrorParams extends ThreadRealtimeBaseParams {
  readonly message: string;
}

export interface ThreadRealtimeClosedParams extends ThreadRealtimeBaseParams {
  readonly reason?: string | null;
}

export interface AgenCDaemonNotificationParamsByMethod {
  readonly "commandExec.outputDelta": CommandExecOutputDeltaParams;
  readonly "event.message_chunk": EventMessageChunkParams;
  readonly "event.tool_request": EventToolRequestParams;
  readonly "event.permission_request": EventPermissionRequestParams;
  readonly "event.user_input_request": EventUserInputRequestParams;
  readonly "event.mcp_elicitation_request": EventMcpElicitationRequestParams;
  readonly "event.agent_status": EventAgentStatusParams;
  readonly "event.session_event": EventSessionEventParams;
  readonly "thread/realtime/started": ThreadRealtimeStartedParams;
  readonly "thread/realtime/itemAdded": ThreadRealtimeItemAddedParams;
  readonly "thread/realtime/transcript/delta": ThreadRealtimeTranscriptDeltaParams;
  readonly "thread/realtime/transcript/done": ThreadRealtimeTranscriptDoneParams;
  readonly "thread/realtime/outputAudio/delta": ThreadRealtimeOutputAudioDeltaParams;
  readonly "thread/realtime/sdp": ThreadRealtimeSdpParams;
  readonly "thread/realtime/error": ThreadRealtimeErrorParams;
  readonly "thread/realtime/closed": ThreadRealtimeClosedParams;
}

export interface AgenCDaemonNotification<
  Method extends AgenCDaemonNotificationMethod = AgenCDaemonNotificationMethod,
> {
  readonly jsonrpc: typeof AGENC_DAEMON_JSON_RPC_VERSION;
  readonly method: Method;
  readonly params: AgenCDaemonNotificationParamsByMethod[Method];
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
  readonly "request.cancel": RequestCancelResult;
  readonly "agent.create": AgentCreateResult;
  readonly "agent.list": AgentListResult;
  readonly "agent.attach": AgentAttachResult;
  readonly "agent.stop": AgentStopResult;
  readonly "agent.logs": AgentLogsResult;
  readonly "session.create": SessionCreateResult;
  readonly "session.list": SessionListResult;
  readonly "session.attach": SessionAttachResult;
  readonly "session.detach": SessionDetachResult;
  readonly "session.terminate": SessionTerminateResult;
  readonly "message.send": MessageSendResult;
  readonly "message.stream": MessageStreamResult;
  readonly "thread/realtime/start": ThreadRealtimeStartResponse;
  readonly "thread/realtime/appendAudio": ThreadRealtimeAppendAudioResponse;
  readonly "thread/realtime/appendText": ThreadRealtimeAppendTextResponse;
  readonly "thread/realtime/stop": ThreadRealtimeStopResponse;
  readonly "thread/realtime/listVoices": ThreadRealtimeListVoicesResponse;
  readonly "tool.approve": ToolDecisionResult;
  readonly "tool.deny": ToolDecisionResult;
  readonly "tool.cancel": ToolDecisionResult;
  readonly "elicitation.respond": ElicitationRespondResult;
  readonly "permission.list": PermissionListResult;
  readonly "fs.fuzzy_search": FuzzyFileSearchResponse;
  readonly "commandExec.start": CommandExecResponse;
  readonly "commandExec.write": CommandExecWriteResponse;
  readonly "commandExec.resize": CommandExecResizeResponse;
  readonly "commandExec.terminate": CommandExecTerminateResponse;
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

  cancelRequest(params: RequestCancelParams): Promise<RequestCancelResult> {
    return this.request("request.cancel", params);
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

  getAgentLogs(params: AgentLogsParams): Promise<AgentLogsResult> {
    return this.request("agent.logs", params);
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

  startRealtime(
    params: ThreadRealtimeStartParams,
  ): Promise<ThreadRealtimeStartResponse> {
    return this.request("thread/realtime/start", params);
  }

  appendRealtimeAudio(
    params: ThreadRealtimeAppendAudioParams,
  ): Promise<ThreadRealtimeAppendAudioResponse> {
    return this.request("thread/realtime/appendAudio", params);
  }

  appendRealtimeText(
    params: ThreadRealtimeAppendTextParams,
  ): Promise<ThreadRealtimeAppendTextResponse> {
    return this.request("thread/realtime/appendText", params);
  }

  stopRealtime(
    params: ThreadRealtimeStopParams,
  ): Promise<ThreadRealtimeStopResponse> {
    return this.request("thread/realtime/stop", params);
  }

  listRealtimeVoices(): Promise<ThreadRealtimeListVoicesResponse> {
    return this.request("thread/realtime/listVoices");
  }

  approveTool(params: ToolApproveParams): Promise<ToolDecisionResult> {
    return this.request("tool.approve", params);
  }

  denyTool(params: ToolDenyParams): Promise<ToolDecisionResult> {
    return this.request("tool.deny", params);
  }

  cancelTool(params: ToolCancelParams): Promise<ToolDecisionResult> {
    return this.request("tool.cancel", params);
  }

  respondToElicitation(
    params: ElicitationRespondParams,
  ): Promise<ElicitationRespondResult> {
    return this.request("elicitation.respond", params);
  }

  listPermissions(
    params: PermissionListParams = {},
  ): Promise<PermissionListResult> {
    return this.request("permission.list", params);
  }

  fuzzySearch(params: FuzzyFileSearchParams): Promise<FuzzyFileSearchResponse> {
    return this.request("fs.fuzzy_search", params);
  }

  startCommandExec(
    params: CommandExecStartParams,
  ): Promise<CommandExecResponse> {
    return this.request("commandExec.start", params);
  }

  writeCommandExec(
    params: CommandExecWriteParams,
  ): Promise<CommandExecWriteResponse> {
    return this.request("commandExec.write", params);
  }

  resizeCommandExec(
    params: CommandExecResizeParams,
  ): Promise<CommandExecResizeResponse> {
    return this.request("commandExec.resize", params);
  }

  terminateCommandExec(
    params: CommandExecTerminateParams,
  ): Promise<CommandExecTerminateResponse> {
    return this.request("commandExec.terminate", params);
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
