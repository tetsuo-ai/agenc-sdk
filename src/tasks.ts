/**
 * Task Management Helpers for AgenC
 *
 * Create, claim, complete, and cancel tasks on the AgenC protocol.
 * Supports both native SOL and SPL token-denominated tasks.
 */

import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  ComputeBudgetProgram,
  type AccountMeta,
} from "@solana/web3.js";
import { type Program } from "@coral-xyz/anchor";
import { AnchorBN } from "./anchor-bn";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "./spl-token";
import {
  PROGRAM_ID,
  SEEDS,
  TaskState,
  DISCRIMINATOR_SIZE,
  PERCENT_BASE,
  DEFAULT_FEE_PERCENT,
  HASH_SIZE,
  RESULT_DATA_SIZE,
  RISC0_SEAL_BYTES_LEN,
  RISC0_JOURNAL_LEN,
  RISC0_IMAGE_ID_LEN,
  TRUSTED_RISC0_SELECTOR,
  RECOMMENDED_CU_CREATE_TASK,
  RECOMMENDED_CU_CREATE_TASK_TOKEN,
  RECOMMENDED_CU_CREATE_DEPENDENT_TASK,
  RECOMMENDED_CU_CLAIM_TASK,
  RECOMMENDED_CU_EXPIRE_CLAIM,
  RECOMMENDED_CU_COMPLETE_TASK,
  RECOMMENDED_CU_COMPLETE_TASK_TOKEN,
  RECOMMENDED_CU_COMPLETE_TASK_PRIVATE,
  RECOMMENDED_CU_COMPLETE_TASK_PRIVATE_TOKEN,
  RECOMMENDED_CU_CONFIGURE_TASK_VALIDATION,
  RECOMMENDED_CU_SUBMIT_TASK_RESULT,
  RECOMMENDED_CU_ACCEPT_TASK_RESULT,
  RECOMMENDED_CU_ACCEPT_TASK_RESULT_TOKEN,
  RECOMMENDED_CU_REJECT_TASK_RESULT,
  RECOMMENDED_CU_AUTO_ACCEPT_TASK_RESULT,
  RECOMMENDED_CU_AUTO_ACCEPT_TASK_RESULT_TOKEN,
  RECOMMENDED_CU_VALIDATE_TASK_RESULT,
  RECOMMENDED_CU_VALIDATE_TASK_RESULT_TOKEN,
  RECOMMENDED_CU_CANCEL_TASK,
  RECOMMENDED_CU_CANCEL_TASK_TOKEN,
} from "./constants";
import { getAccount } from "./anchor-utils";
import { getSdkLogger } from "./logger";
import { deriveProtocolPda, deriveZkConfigPda, getZkConfig } from "./protocol";
import { getDependentTaskCount } from "./queries";
import {
  runProofSubmissionPreflight,
  type ProofSubmissionPreflightResult,
  type ProofPreconditionResult,
} from "./proof-validation";
import { NullifierCache } from "./nullifier-cache";
import { imageIdsEqual, validateRisc0PayloadShape } from "./validation";

export { TaskState };

export enum TaskValidationMode {
  Auto = 0,
  CreatorReview = 1,
  ValidatorQuorum = 2,
  ExternalAttestation = 3,
}

export enum TaskSubmissionStatus {
  Idle = 0,
  Submitted = 1,
  Accepted = 2,
  Rejected = 3,
}

// ============================================================================
// Types
// ============================================================================

export interface TaskParams {
  /** Task ID — 32-byte identifier */
  taskId: Uint8Array | number[];
  /** Required capability bitmask (u64) */
  requiredCapabilities: number | bigint;
  /** Task description or instruction hash — exactly 64 bytes */
  description: Uint8Array | Buffer;
  /** Reward amount in lamports (SOL) or smallest token units */
  rewardAmount: number | bigint;
  /** Maximum workers allowed (u8) */
  maxWorkers: number;
  /** Deadline as Unix timestamp (seconds) */
  deadline: number;
  /** Task type: 0=Exclusive, 1=Collaborative, 2=Competitive */
  taskType: number;
  /** Constraint hash for private task verification (32 bytes). Null for public tasks. */
  constraintHash?: number[] | null;
  /** Minimum reputation score required (u16, default 0) */
  minReputation?: number;
  /** SPL token mint for reward denomination. Null/undefined for SOL tasks. */
  rewardMint?: PublicKey | null;
  /** Creator's token account. Required when rewardMint is set. If omitted, derived as ATA. */
  creatorTokenAccount?: PublicKey;
}

export interface DependentTaskParams extends TaskParams {
  /** Dependency type enum value */
  dependencyType: number;
}

export interface TaskStatus {
  /** Task ID bytes */
  taskId: Uint8Array;
  /** Current state */
  state: TaskState;
  /** Creator public key */
  creator: PublicKey;
  /** Reward amount in lamports or token units */
  rewardAmount: bigint;
  /** Deadline timestamp */
  deadline: number;
  /** Constraint hash (if private) */
  constraintHash: Uint8Array | null;
  /** Number of current workers */
  currentWorkers: number;
  /** Max workers */
  maxWorkers: number;
  /** Completion timestamp (if completed) */
  completedAt: number | null;
  /** SPL token mint (null for SOL tasks) */
  rewardMint: PublicKey | null;
}

export interface ConfigureTaskValidationParams {
  /** Validation mode matching the on-chain ValidationMode enum */
  mode: TaskValidationMode | number;
  /** Review window in seconds (i64) */
  reviewWindowSecs: number | bigint;
  /** Validator approvals required in validator-quorum mode */
  validatorQuorum?: number;
  /** Optional external attestor wallet */
  attestor?: PublicKey | null;
}

export interface SubmitTaskResultParams {
  /** Worker-submitted proof hash (32 bytes) */
  proofHash: Uint8Array | number[];
  /** Optional worker-submitted result payload (64 bytes) */
  resultData?: Uint8Array | number[] | null;
}

export interface RejectTaskResultParams {
  /** Evidence or rejection reason hash (32 bytes) */
  rejectionHash: Uint8Array | number[];
}

export interface ValidateTaskResultParams {
  /** Whether the reviewer approves the submission */
  approved: boolean;
  /** Optional validator agent ID for validator-quorum mode */
  validatorAgentId?: Uint8Array | number[] | null;
}

export interface PrivateCompletionPayload {
  /** Router seal bytes (trusted selector + proof = 260 bytes) */
  sealBytes: Buffer | Uint8Array;
  /** Fixed private journal bytes (192 bytes) */
  journal: Buffer | Uint8Array;
  /** RISC0 image ID (32 bytes) */
  imageId: Buffer | Uint8Array;
  /** Binding spend seed (32 bytes) */
  bindingSeed: Buffer | Uint8Array;
  /** Nullifier spend seed (32 bytes) */
  nullifierSeed: Buffer | Uint8Array;
}

export interface CompleteTaskPrivateWithPreflightOptions {
  runProofSubmissionPreflight?: boolean;
  nullifierCache?: NullifierCache;
  proofGeneratedAtMs?: number;
  maxProofAgeMs?: number;
  parentTaskPda?: PublicKey;
  acceptedBidSettlement?: TaskCompletionAcceptedBidSettlement;
  bidderAuthority?: PublicKey;
}

/**
 * @deprecated Since v1.6.0. Use {@link CompleteTaskPrivateWithPreflightOptions} and
 * `runProofSubmissionPreflight` instead of `validatePreconditions`.
 */
export interface CompleteTaskPrivateSafeOptions extends CompleteTaskPrivateWithPreflightOptions {
  validatePreconditions?: boolean;
}

export interface TaskCompletionAcceptedBidSettlement {
  bidBook: PublicKey;
  acceptedBid: PublicKey;
  bidderMarketState: PublicKey;
}

export interface TaskCompletionOptions {
  parentTaskPda?: PublicKey;
  acceptedBidSettlement?: TaskCompletionAcceptedBidSettlement;
  bidderAuthority?: PublicKey;
}

export interface ExpireClaimBidMarketplaceSettlement {
  bidMarketplace: PublicKey;
  bidBook: PublicKey;
  acceptedBid: PublicKey;
  bidderMarketState: PublicKey;
  creator: PublicKey;
}

export interface ExpireClaimOptions {
  bidMarketplaceSettlement?: ExpireClaimBidMarketplaceSettlement;
}

export interface CancelTaskWorkerCleanupTriple {
  claimPda: PublicKey;
  workerAgentPda: PublicKey;
  rentRecipient: PublicKey;
}

export interface CancelTaskBidMarketplaceSettlement {
  bidBook: PublicKey;
  acceptedBid?: PublicKey;
  bidderMarketState?: PublicKey;
}

export interface CancelTaskOptions {
  workerCleanupTriples?: CancelTaskWorkerCleanupTriple[];
  bidMarketplaceSettlement?: CancelTaskBidMarketplaceSettlement;
}

export interface TaskLifecycleEvent {
  eventName: string;
  timestamp: number;
  txSignature?: string;
  actor?: PublicKey;
  data?: Record<string, unknown>;
}

export interface TaskLifecycleSummary {
  taskPda: PublicKey;
  currentState: TaskState;
  creator: PublicKey;
  rewardAmount: bigint;
  rewardMint: PublicKey | null;
  timeline: TaskLifecycleEvent[];
  currentWorkers: number;
  maxWorkers: number;
  createdAt: number;
  deadline: number;
  completedAt: number | null;
  hasActiveDispute: boolean;
  dependsOn: PublicKey | null;
  dependentCount: number;
  durationSeconds: number | null;
  isExpired: boolean;
}

function formatPreflightFailureReasons(result: {
  failures: Array<{ message: string }>;
}): string {
  return result.failures.map((failure) => failure.message).join("; ");
}

export class ProofSubmissionPreflightError extends Error {
  readonly result: ProofSubmissionPreflightResult;

  constructor(result: ProofSubmissionPreflightResult) {
    super(
      `Proof submission preflight failed: ${formatPreflightFailureReasons(result)}`,
    );
    this.name = "ProofSubmissionPreflightError";
    this.result = result;
  }
}

/**
 * @deprecated Since v1.6.0. Use {@link ProofSubmissionPreflightError} instead.
 */
export class ProofPreconditionError extends ProofSubmissionPreflightError {
  readonly result: ProofPreconditionResult;

  constructor(result: ProofPreconditionResult) {
    super(result);
    this.name = "ProofPreconditionError";
    this.message = `Proof precondition check failed: ${formatPreflightFailureReasons(result)}`;
    this.result = result;
  }
}

// ============================================================================
// PDA Derivation
// ============================================================================

/**
 * Derive task PDA from creator and task ID.
 * Seeds: ["task", creator, task_id]
 */
export function deriveTaskPda(
  creator: PublicKey,
  taskId: Uint8Array | number[],
  programId: PublicKey = PROGRAM_ID,
): PublicKey {
  const idBytes = taskId instanceof Uint8Array ? taskId : Buffer.from(taskId);
  const [pda] = PublicKey.findProgramAddressSync(
    [SEEDS.TASK, creator.toBuffer(), idBytes],
    programId,
  );
  return pda;
}

/**
 * Derive claim PDA from task and worker agent PDA.
 * Seeds: ["claim", task_pda, worker_agent_pda]
 */
export function deriveClaimPda(
  taskPda: PublicKey,
  workerAgentPda: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [SEEDS.CLAIM, taskPda.toBuffer(), workerAgentPda.toBuffer()],
    programId,
  );
  return pda;
}

/**
 * Derive task validation config PDA from task.
 * Seeds: ["task_validation", task_pda]
 */
export function deriveTaskValidationConfigPda(
  taskPda: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [SEEDS.TASK_VALIDATION, taskPda.toBuffer()],
    programId,
  );
  return pda;
}

/**
 * Derive task attestor config PDA from task.
 * Seeds: ["task_attestor", task_pda]
 */
export function deriveTaskAttestorConfigPda(
  taskPda: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [SEEDS.TASK_ATTESTOR, taskPda.toBuffer()],
    programId,
  );
  return pda;
}

/**
 * Derive task submission PDA from claim.
 * Seeds: ["task_submission", claim_pda]
 */
export function deriveTaskSubmissionPda(
  claimPda: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [SEEDS.TASK_SUBMISSION, claimPda.toBuffer()],
    programId,
  );
  return pda;
}

/**
 * Derive task validation vote PDA from submission and reviewer wallet.
 * Seeds: ["task_validation_vote", task_submission_pda, reviewer]
 */
export function deriveTaskValidationVotePda(
  taskSubmissionPda: PublicKey,
  reviewer: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      SEEDS.TASK_VALIDATION_VOTE,
      taskSubmissionPda.toBuffer(),
      reviewer.toBuffer(),
    ],
    programId,
  );
  return pda;
}

/**
 * Derive escrow PDA from task.
 * Seeds: ["escrow", task_pda]
 */
export function deriveEscrowPda(
  taskPda: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [SEEDS.ESCROW, taskPda.toBuffer()],
    programId,
  );
  return pda;
}

/**
 * Derive authority rate limit PDA from a wallet authority.
 * Seeds: ["authority_rate_limit", authority]
 */
export function deriveAuthorityRateLimitPda(
  authority: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [SEEDS.AUTHORITY_RATE_LIMIT, authority.toBuffer()],
    programId,
  );
  return pda;
}

// ============================================================================
// Internal Helpers
// ============================================================================

function deriveAgentPda(
  agentId: Uint8Array | number[],
  programId: PublicKey,
): PublicKey {
  const idBytes =
    agentId instanceof Uint8Array ? agentId : Buffer.from(agentId);
  const [pda] = PublicKey.findProgramAddressSync(
    [SEEDS.AGENT, idBytes],
    programId,
  );
  return pda;
}

type TaskTokenAccounts = Record<string, PublicKey | null>;

interface TaskCreationContext {
  taskPda: PublicKey;
  escrowPda: PublicKey;
  protocolPda: PublicKey;
  creatorAgentPda: PublicKey;
  authorityRateLimitPda: PublicKey;
  idBytes: Uint8Array;
  mint: PublicKey | null;
  tokenAccounts: TaskTokenAccounts;
}

const BINDING_SPEND_SEED = Buffer.from("binding_spend");
const NULLIFIER_SPEND_SEED = Buffer.from("nullifier_spend");
const ROUTER_SEED = Buffer.from("router");
const VERIFIER_SEED = Buffer.from("verifier");
const TRUSTED_RISC0_ROUTER_PROGRAM_ID = new PublicKey(
  "E9ZiqfCdr6gGeB2UhBbkWnFP9vGnRYQwqnDsS1LM3NJZ",
);
const TRUSTED_RISC0_VERIFIER_PROGRAM_ID = new PublicKey(
  "3ZrAHZKjk24AKgXFekpYeG7v3Rz7NucLXTB3zxGGTjsc",
);

function toFixedBytes(
  value: Uint8Array | Buffer,
  expectedLen: number,
  label: string,
): Buffer {
  const bytes = Buffer.from(value);
  if (bytes.length !== expectedLen) {
    throw new Error(
      `${label} must be exactly ${expectedLen} bytes, got ${bytes.length}`,
    );
  }
  return bytes;
}

function normalizeTaskId(taskId: Uint8Array | number[]): Uint8Array {
  return taskId instanceof Uint8Array ? taskId : Uint8Array.from(taskId);
}

function buildTaskTokenAccounts(
  mint: PublicKey | null,
  creator: PublicKey,
  escrowPda: PublicKey,
  creatorTokenAccount?: PublicKey,
): TaskTokenAccounts {
  if (!mint) {
    return {
      rewardMint: null,
      creatorTokenAccount: null,
      tokenEscrowAta: null,
      tokenProgram: null,
      associatedTokenProgram: null,
    };
  }

  const resolvedCreatorTokenAccount =
    creatorTokenAccount ?? getAssociatedTokenAddressSync(mint, creator);
  const tokenEscrowAta = getAssociatedTokenAddressSync(mint, escrowPda, true);

  return {
    rewardMint: mint,
    creatorTokenAccount: resolvedCreatorTokenAccount,
    tokenEscrowAta,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  };
}

function buildTaskCreationContext(
  programId: PublicKey,
  creator: Keypair,
  creatorAgentId: Uint8Array | number[],
  params: TaskParams,
): TaskCreationContext {
  const idBytes = normalizeTaskId(params.taskId);
  const taskPda = deriveTaskPda(creator.publicKey, idBytes, programId);
  const escrowPda = deriveEscrowPda(taskPda, programId);
  const protocolPda = deriveProtocolPda(programId);
  const creatorAgentPda = deriveAgentPda(creatorAgentId, programId);
  const authorityRateLimitPda = deriveAuthorityRateLimitPda(
    creator.publicKey,
    programId,
  );
  const mint = params.rewardMint ?? null;
  const tokenAccounts = buildTaskTokenAccounts(
    mint,
    creator.publicKey,
    escrowPda,
    params.creatorTokenAccount,
  );

  return {
    taskPda,
    escrowPda,
    protocolPda,
    creatorAgentPda,
    authorityRateLimitPda,
    idBytes,
    mint,
    tokenAccounts,
  };
}

type CompletionTokenAccounts = Record<string, PublicKey | null>;

function buildCompletionTokenAccounts(
  mint: PublicKey | null,
  escrowPda: PublicKey,
  workerPubkey: PublicKey,
  treasury: PublicKey,
): CompletionTokenAccounts {
  if (mint) {
    return {
      tokenEscrowAta: getAssociatedTokenAddressSync(mint, escrowPda, true),
      workerTokenAccount: getAssociatedTokenAddressSync(mint, workerPubkey),
      treasuryTokenAccount: getAssociatedTokenAddressSync(mint, treasury),
      rewardMint: mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    };
  }
  return {
    tokenEscrowAta: null,
    workerTokenAccount: null,
    treasuryTokenAccount: null,
    rewardMint: null,
    tokenProgram: null,
  };
}

function buildTaskCompletionRemainingAccounts(
  options: TaskCompletionOptions | undefined,
  defaultBidderAuthority: PublicKey,
): AccountMeta[] {
  const metas: AccountMeta[] = [];

  if (options?.parentTaskPda) {
    metas.push({
      pubkey: options.parentTaskPda,
      isSigner: false,
      isWritable: false,
    });
  }

  if (options?.acceptedBidSettlement) {
    const bidderAuthority = options.bidderAuthority ?? defaultBidderAuthority;
    metas.push(
      {
        pubkey: options.acceptedBidSettlement.bidBook,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: options.acceptedBidSettlement.acceptedBid,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: options.acceptedBidSettlement.bidderMarketState,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: bidderAuthority,
        isSigner: false,
        isWritable: true,
      },
    );
  }

  return metas;
}

function asOptionalAccounts(
  accounts: Record<string, PublicKey | null>,
): Record<string, PublicKey | undefined> {
  // Anchor accepts null for optional accounts at runtime, but its TS surface only allows undefined.
  return accounts as unknown as Record<string, PublicKey | undefined>;
}

function buildExpireClaimRemainingAccounts(
  options: ExpireClaimOptions | undefined,
): AccountMeta[] {
  const settlement = options?.bidMarketplaceSettlement;
  if (!settlement) {
    return [];
  }

  return [
    {
      pubkey: settlement.bidMarketplace,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: settlement.bidBook,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: settlement.acceptedBid,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: settlement.bidderMarketState,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: settlement.creator,
      isSigner: false,
      isWritable: true,
    },
  ];
}

function buildLegacyCancelTaskRemainingAccounts(
  workerPairs?: Array<{ claimPda: PublicKey; workerAgentPda: PublicKey }>,
): AccountMeta[] {
  return (workerPairs ?? []).flatMap((pair) => [
    { pubkey: pair.claimPda, isSigner: false, isWritable: true },
    { pubkey: pair.workerAgentPda, isSigner: false, isWritable: true },
  ]);
}

function buildCancelTaskRemainingAccounts(
  workerPairs:
    | Array<{ claimPda: PublicKey; workerAgentPda: PublicKey }>
    | undefined,
  options: CancelTaskOptions | undefined,
): AccountMeta[] {
  const settlement = options?.bidMarketplaceSettlement;
  const hasMarketplaceAccounts =
    settlement !== undefined || (options?.workerCleanupTriples?.length ?? 0) > 0;

  if (!hasMarketplaceAccounts) {
    return buildLegacyCancelTaskRemainingAccounts(workerPairs);
  }

  if (!settlement) {
    throw new Error(
      "CancelTaskOptions.bidMarketplaceSettlement is required when providing Marketplace V2 cleanup accounts",
    );
  }

  const hasAcceptedBidSuffix =
    settlement.acceptedBid !== undefined ||
    settlement.bidderMarketState !== undefined;
  if (
    hasAcceptedBidSuffix &&
    (settlement.acceptedBid === undefined ||
      settlement.bidderMarketState === undefined)
  ) {
    throw new Error(
      "CancelTaskOptions.bidMarketplaceSettlement.acceptedBid and bidderMarketState must be provided together",
    );
  }

  if (
    hasAcceptedBidSuffix &&
    options?.workerCleanupTriples === undefined &&
    (workerPairs?.length ?? 0) > 0
  ) {
    throw new Error(
      "CancelTaskOptions.workerCleanupTriples are required for bid-marketplace cancellation with accepted worker claims",
    );
  }

  if (
    !hasAcceptedBidSuffix &&
    (options?.workerCleanupTriples?.length ?? 0) > 0
  ) {
    throw new Error(
      "CancelTaskOptions.workerCleanupTriples require acceptedBid and bidderMarketState settlement accounts",
    );
  }

  const metas: AccountMeta[] = [];
  for (const triple of options?.workerCleanupTriples ?? []) {
    metas.push(
      { pubkey: triple.claimPda, isSigner: false, isWritable: true },
      { pubkey: triple.workerAgentPda, isSigner: false, isWritable: true },
      { pubkey: triple.rentRecipient, isSigner: false, isWritable: true },
    );
  }

  metas.push({
    pubkey: settlement.bidBook,
    isSigner: false,
    isWritable: true,
  });

  if (settlement.acceptedBid && settlement.bidderMarketState) {
    metas.push(
      {
        pubkey: settlement.acceptedBid,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: settlement.bidderMarketState,
        isSigner: false,
        isWritable: true,
      },
    );
  }

  return metas;
}

interface CompletionContext {
  task: {
    creator: PublicKey;
    rewardMint: PublicKey | null;
    taskId?: number[] | Uint8Array;
  };
  protocolConfig: {
    treasury: PublicKey;
  };
}

interface WorkerReviewContext {
  authority: PublicKey;
}

async function fetchCompletionContext(
  program: Program,
  taskPda: PublicKey,
  protocolPda: PublicKey,
): Promise<CompletionContext> {
  const task = (await getAccount(program, "task").fetch(taskPda)) as {
    creator: PublicKey;
    taskId: number[] | Uint8Array;
    rewardMint: PublicKey | null;
  };

  const protocolConfig = (await getAccount(program, "protocolConfig").fetch(
    protocolPda,
  )) as {
    treasury: PublicKey;
  };

  return { task, protocolConfig };
}

async function fetchWorkerReviewContext(
  program: Program,
  workerAgentPda: PublicKey,
): Promise<WorkerReviewContext> {
  const worker = (await getAccount(program, "agentRegistration").fetch(
    workerAgentPda,
  )) as {
    authority: PublicKey;
  };

  return {
    authority: worker.authority,
  };
}

async function submitTaskCreationTransaction(
  connection: Connection,
  operation: "createTask" | "createDependentTask",
  send: () => Promise<string>,
): Promise<string> {
  try {
    const tx = await send();
    await connection.confirmTransaction(tx, "confirmed");
    return tx;
  } catch (error) {
    getSdkLogger().error(operation + " failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// ============================================================================
// Task Functions
// ============================================================================

/**
 * Create a new task.
 *
 * For SPL token tasks, the caller must ensure the creator's token account
 * exists and has sufficient balance. The escrow ATA is created by the
 * on-chain instruction via CPI.
 */
export async function createTask(
  connection: Connection,
  program: Program,
  creator: Keypair,
  creatorAgentId: Uint8Array | number[],
  params: TaskParams,
): Promise<{ taskPda: PublicKey; txSignature: string }> {
  const context = buildTaskCreationContext(
    program.programId,
    creator,
    creatorAgentId,
    params,
  );

  const cuLimit = context.mint
    ? RECOMMENDED_CU_CREATE_TASK_TOKEN
    : RECOMMENDED_CU_CREATE_TASK;

  const tx = await submitTaskCreationTransaction(connection, "createTask", () =>
    program.methods
      .createTask(
        Array.from(context.idBytes),
        new AnchorBN(params.requiredCapabilities.toString()),
        Buffer.from(params.description),
        new AnchorBN(params.rewardAmount.toString()),
        params.maxWorkers,
        new AnchorBN(params.deadline),
        params.taskType,
        params.constraintHash ?? null,
        params.minReputation ?? 0,
        context.mint,
      )
      .accountsPartial({
        task: context.taskPda,
        escrow: context.escrowPda,
        protocolConfig: context.protocolPda,
        creatorAgent: context.creatorAgentPda,
        authorityRateLimit: context.authorityRateLimitPda,
        authority: creator.publicKey,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
        ...context.tokenAccounts,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
      ])
      .signers([creator])
      .rpc(),
  );

  return { taskPda: context.taskPda, txSignature: tx };
}

/**
 * Create a dependent task with an explicit parent task reference.
 */
export async function createDependentTask(
  connection: Connection,
  program: Program,
  creator: Keypair,
  creatorAgentId: Uint8Array | number[],
  parentTaskPda: PublicKey,
  params: DependentTaskParams,
): Promise<{ taskPda: PublicKey; txSignature: string }> {
  const context = buildTaskCreationContext(
    program.programId,
    creator,
    creatorAgentId,
    params,
  );

  const tx = await submitTaskCreationTransaction(
    connection,
    "createDependentTask",
    () =>
      program.methods
        .createDependentTask(
          Array.from(context.idBytes),
          new AnchorBN(params.requiredCapabilities.toString()),
          Buffer.from(params.description),
          new AnchorBN(params.rewardAmount.toString()),
          params.maxWorkers,
          new AnchorBN(params.deadline),
          params.taskType,
          params.constraintHash ?? null,
          params.dependencyType,
          params.minReputation ?? 0,
          context.mint,
        )
        .accountsPartial({
          task: context.taskPda,
          escrow: context.escrowPda,
          parentTask: parentTaskPda,
          protocolConfig: context.protocolPda,
          creatorAgent: context.creatorAgentPda,
          authorityRateLimit: context.authorityRateLimitPda,
          authority: creator.publicKey,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
          ...context.tokenAccounts,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({
            units: RECOMMENDED_CU_CREATE_DEPENDENT_TASK,
          }),
        ])
        .signers([creator])
        .rpc(),
  );

  return { taskPda: context.taskPda, txSignature: tx };
}

/**
 * Claim a task as a worker agent.
 */
export async function claimTask(
  connection: Connection,
  program: Program,
  worker: Keypair,
  workerAgentId: Uint8Array | number[],
  taskPda: PublicKey,
): Promise<{ txSignature: string }> {
  const programId = program.programId;
  const workerAgentPda = deriveAgentPda(workerAgentId, programId);
  const claimPda = deriveClaimPda(taskPda, workerAgentPda, programId);
  const protocolPda = deriveProtocolPda(programId);

  const tx = await program.methods
    .claimTask()
    .accountsPartial({
      task: taskPda,
      claim: claimPda,
      protocolConfig: protocolPda,
      worker: workerAgentPda,
      authority: worker.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: RECOMMENDED_CU_CLAIM_TASK,
      }),
    ])
    .signers([worker])
    .rpc();

  await connection.confirmTransaction(tx, "confirmed");

  return { txSignature: tx };
}

/**
 * Expire a claim after its deadline.
 */
export async function expireClaim(
  connection: Connection,
  program: Program,
  caller: Keypair,
  taskPda: PublicKey,
  workerAgentId: Uint8Array | number[],
  rentRecipient: PublicKey = caller.publicKey,
  options?: ExpireClaimOptions,
): Promise<{ txSignature: string }> {
  const programId = program.programId;
  const workerAgentPda = deriveAgentPda(workerAgentId, programId);
  const claimPda = deriveClaimPda(taskPda, workerAgentPda, programId);
  const escrowPda = deriveEscrowPda(taskPda, programId);
  const protocolPda = deriveProtocolPda(programId);

  const builder = program.methods
    .expireClaim()
    .accountsPartial({
      authority: caller.publicKey,
      task: taskPda,
      escrow: escrowPda,
      claim: claimPda,
      worker: workerAgentPda,
      protocolConfig: protocolPda,
      ...asOptionalAccounts({
        taskValidationConfig: null,
        taskSubmission: null,
      }),
      rentRecipient,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: RECOMMENDED_CU_EXPIRE_CLAIM,
      }),
    ])
    .signers([caller]);

  const remainingAccounts = buildExpireClaimRemainingAccounts(options);
  if (remainingAccounts.length > 0) {
    builder.remainingAccounts(remainingAccounts);
  }

  const tx = await builder.rpc();

  await connection.confirmTransaction(tx, "confirmed");

  return { txSignature: tx };
}

/**
 * Complete a task (public completion with proof hash).
 *
 * Fetches the task and protocol config on-chain to determine accounts.
 * For SPL token tasks, the caller must ensure the worker's token account exists.
 */
export async function completeTask(
  connection: Connection,
  program: Program,
  worker: Keypair,
  workerAgentId: Uint8Array | number[],
  taskPda: PublicKey,
  proofHash: Uint8Array | number[],
  resultData?: Uint8Array | number[] | null,
  options?: TaskCompletionOptions,
): Promise<{ txSignature: string }> {
  const programId = program.programId;
  const workerAgentPda = deriveAgentPda(workerAgentId, programId);
  const claimPda = deriveClaimPda(taskPda, workerAgentPda, programId);
  const escrowPda = deriveEscrowPda(taskPda, programId);
  const protocolPda = deriveProtocolPda(programId);

  const { task, protocolConfig } = await fetchCompletionContext(
    program,
    taskPda,
    protocolPda,
  );

  const mint = task.rewardMint;
  const tokenAccounts = buildCompletionTokenAccounts(
    mint,
    escrowPda,
    worker.publicKey,
    protocolConfig.treasury,
  );

  const proofHashArr = Array.from(proofHash);
  const resultDataBuf = resultData ? Buffer.from(resultData) : null;

  const cuLimit = mint
    ? RECOMMENDED_CU_COMPLETE_TASK_TOKEN
    : RECOMMENDED_CU_COMPLETE_TASK;

  const builder = program.methods
    .completeTask(proofHashArr, resultDataBuf)
    .accountsPartial({
      task: taskPda,
      claim: claimPda,
      escrow: escrowPda,
      creator: task.creator,
      worker: workerAgentPda,
      protocolConfig: protocolPda,
      treasury: protocolConfig.treasury,
      authority: worker.publicKey,
      systemProgram: SystemProgram.programId,
      ...tokenAccounts,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
    ])
    .signers([worker]);

  const remainingAccounts = buildTaskCompletionRemainingAccounts(
    options,
    worker.publicKey,
  );
  if (remainingAccounts.length > 0) {
    builder.remainingAccounts(remainingAccounts);
  }

  const tx = await builder.rpc();

  await connection.confirmTransaction(tx, "confirmed");

  return { txSignature: tx };
}

/**
 * Complete a task privately with a ZK proof.
 *
 * Fetches the task and protocol config on-chain to determine accounts.
 * The task_id u64 argument is derived from the first 8 bytes of the task's taskId field.
 */
export async function completeTaskPrivate(
  connection: Connection,
  program: Program,
  worker: Keypair,
  workerAgentId: Uint8Array | number[],
  taskPda: PublicKey,
  proof: PrivateCompletionPayload,
  options?: TaskCompletionOptions,
): Promise<{ txSignature: string }> {
  const programId = program.programId;
  const workerAgentPda = deriveAgentPda(workerAgentId, programId);
  const claimPda = deriveClaimPda(taskPda, workerAgentPda, programId);
  const escrowPda = deriveEscrowPda(taskPda, programId);
  const protocolPda = deriveProtocolPda(programId);
  const zkConfigPda = deriveZkConfigPda(programId);
  const sealBytes = toFixedBytes(
    proof.sealBytes,
    RISC0_SEAL_BYTES_LEN,
    "sealBytes",
  );
  const journal = toFixedBytes(proof.journal, RISC0_JOURNAL_LEN, "journal");
  const imageId = toFixedBytes(proof.imageId, RISC0_IMAGE_ID_LEN, "imageId");
  const bindingSeed = toFixedBytes(proof.bindingSeed, HASH_SIZE, "bindingSeed");
  const nullifierSeed = toFixedBytes(
    proof.nullifierSeed,
    HASH_SIZE,
    "nullifierSeed",
  );

  // Defense-in-depth: validate payload shape (sizes + trusted selector)
  validateRisc0PayloadShape({
    sealBytes,
    journal,
    imageId,
    bindingSeed,
    nullifierSeed,
  });

  const [bindingSpend] = PublicKey.findProgramAddressSync(
    [BINDING_SPEND_SEED, bindingSeed],
    programId,
  );
  const [nullifierSpend] = PublicKey.findProgramAddressSync(
    [NULLIFIER_SPEND_SEED, nullifierSeed],
    programId,
  );
  const [router] = PublicKey.findProgramAddressSync(
    [ROUTER_SEED],
    TRUSTED_RISC0_ROUTER_PROGRAM_ID,
  );
  const [verifierEntry] = PublicKey.findProgramAddressSync(
    [VERIFIER_SEED, Buffer.from(TRUSTED_RISC0_SELECTOR)],
    TRUSTED_RISC0_ROUTER_PROGRAM_ID,
  );

  const { task, protocolConfig } = await fetchCompletionContext(
    program,
    taskPda,
    protocolPda,
  );
  const zkConfig = await getZkConfig(program);
  if (!zkConfig) {
    throw new Error("zkConfig account not found");
  }
  if (!imageIdsEqual(zkConfig.activeImageId, imageId)) {
    throw new Error("imageId does not match active zkConfig image ID");
  }

  // Extract task_id as u64 (first 8 bytes LE)
  const taskIdBuf = Buffer.from(task.taskId!);
  const taskIdU64 = new AnchorBN(taskIdBuf.subarray(0, 8), "le");

  const mint = task.rewardMint;
  const tokenAccounts = buildCompletionTokenAccounts(
    mint,
    escrowPda,
    worker.publicKey,
    protocolConfig.treasury,
  );

  const cuLimit = mint
    ? RECOMMENDED_CU_COMPLETE_TASK_PRIVATE_TOKEN
    : RECOMMENDED_CU_COMPLETE_TASK_PRIVATE;

  const builder = program.methods
    .completeTaskPrivate(taskIdU64, {
      sealBytes: Buffer.from(sealBytes),
      journal: Buffer.from(journal),
      imageId: Array.from(imageId),
      bindingSeed: Array.from(bindingSeed),
      nullifierSeed: Array.from(nullifierSeed),
    })
    .accountsPartial({
      task: taskPda,
      claim: claimPda,
      escrow: escrowPda,
      creator: task.creator,
      worker: workerAgentPda,
      protocolConfig: protocolPda,
      zkConfig: zkConfigPda,
      bindingSpend,
      nullifierSpend,
      treasury: protocolConfig.treasury,
      authority: worker.publicKey,
      routerProgram: TRUSTED_RISC0_ROUTER_PROGRAM_ID,
      router,
      verifierEntry,
      verifierProgram: TRUSTED_RISC0_VERIFIER_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      ...tokenAccounts,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
    ])
    .signers([worker]);

  const remainingAccounts = buildTaskCompletionRemainingAccounts(
    options,
    worker.publicKey,
  );
  if (remainingAccounts.length > 0) {
    builder.remainingAccounts(remainingAccounts);
  }

  const tx = await builder.rpc();

  await connection.confirmTransaction(tx, "confirmed");

  return { txSignature: tx };
}

/**
 * Complete a task privately with optional best-effort client-side preflight checks
 * and local nullifier cache tracking.
 *
 * The preflight checks are not a cryptographic proof verifier and do not guarantee
 * transaction success.
 */
export async function completeTaskPrivateWithPreflight(
  connection: Connection,
  program: Program,
  worker: Keypair,
  workerAgentId: Uint8Array | number[],
  taskPda: PublicKey,
  proof: PrivateCompletionPayload,
  options: CompleteTaskPrivateWithPreflightOptions = {},
): Promise<{
  txSignature: string;
  preflightResult?: ProofSubmissionPreflightResult;
}> {
  if (options.nullifierCache?.isUsed(proof.nullifierSeed)) {
    throw new Error("Nullifier already submitted in this session");
  }

  // SECURITY FIX: Mark nullifier as used BEFORE submission to prevent concurrent
  // duplicate submissions. On failure, remove it to allow retry.
  options.nullifierCache?.markUsed(proof.nullifierSeed);

  const shouldRunPreflight = options.runProofSubmissionPreflight ?? true;
  let preflightResult: ProofSubmissionPreflightResult | undefined;

  try {
    if (shouldRunPreflight) {
      const workerAgentPda = deriveAgentPda(workerAgentId, program.programId);
      preflightResult = await runProofSubmissionPreflight(connection, program, {
        taskPda,
        workerAgentPda,
        authorityPubkey: worker.publicKey,
        proof,
        proofGeneratedAtMs: options.proofGeneratedAtMs,
        maxProofAgeMs: options.maxProofAgeMs,
      });

      if (!preflightResult.valid) {
        throw new ProofSubmissionPreflightError(preflightResult);
      }
    }

    const result = await completeTaskPrivate(
      connection,
      program,
      worker,
      workerAgentId,
      taskPda,
      proof,
      {
        parentTaskPda: options.parentTaskPda,
        acceptedBidSettlement: options.acceptedBidSettlement,
        bidderAuthority: options.bidderAuthority,
      },
    );

    // Confirm nullifier usage after successful on-chain transaction
    options.nullifierCache?.confirmUsed(proof.nullifierSeed);

    return {
      ...result,
      preflightResult,
    };
  } catch (err) {
    // Rollback: allow retry with same nullifier after failure
    options.nullifierCache?.remove(proof.nullifierSeed);
    throw err;
  }
}

/**
 * @deprecated Since v1.6.0. Use {@link completeTaskPrivateWithPreflight}.
 */
export async function completeTaskPrivateSafe(
  connection: Connection,
  program: Program,
  worker: Keypair,
  workerAgentId: Uint8Array | number[],
  taskPda: PublicKey,
  proof: PrivateCompletionPayload,
  options: CompleteTaskPrivateSafeOptions = {},
): Promise<{
  txSignature: string;
  validationResult?: ProofPreconditionResult;
}> {
  const runProofSubmissionPreflightOption =
    options.runProofSubmissionPreflight ?? options.validatePreconditions;

  try {
    const result = await completeTaskPrivateWithPreflight(
      connection,
      program,
      worker,
      workerAgentId,
      taskPda,
      proof,
      {
        runProofSubmissionPreflight: runProofSubmissionPreflightOption,
        nullifierCache: options.nullifierCache,
        proofGeneratedAtMs: options.proofGeneratedAtMs,
        maxProofAgeMs: options.maxProofAgeMs,
        parentTaskPda: options.parentTaskPda,
        acceptedBidSettlement: options.acceptedBidSettlement,
        bidderAuthority: options.bidderAuthority,
      },
    );

    return {
      txSignature: result.txSignature,
      validationResult: result.preflightResult,
    };
  } catch (error) {
    if (error instanceof ProofSubmissionPreflightError) {
      throw new ProofPreconditionError(error.result);
    }
    throw error;
  }
}

/**
 * Configure Task Validation V2 on an existing task.
 */
export async function configureTaskValidation(
  connection: Connection,
  program: Program,
  creator: Keypair,
  taskPda: PublicKey,
  params: ConfigureTaskValidationParams,
): Promise<{
  taskValidationConfigPda: PublicKey;
  taskAttestorConfigPda: PublicKey;
  txSignature: string;
}> {
  const programId = program.programId;
  const taskValidationConfigPda = deriveTaskValidationConfigPda(
    taskPda,
    programId,
  );
  const taskAttestorConfigPda = deriveTaskAttestorConfigPda(taskPda, programId);
  const protocolPda = deriveProtocolPda(programId);

  const tx = await program.methods
    .configureTaskValidation(
      params.mode,
      new AnchorBN(params.reviewWindowSecs.toString()),
      params.validatorQuorum ?? 0,
      params.attestor ?? null,
    )
    .accountsPartial({
      task: taskPda,
      taskValidationConfig: taskValidationConfigPda,
      taskAttestorConfig: taskAttestorConfigPda,
      protocolConfig: protocolPda,
      creator: creator.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: RECOMMENDED_CU_CONFIGURE_TASK_VALIDATION,
      }),
    ])
    .signers([creator])
    .rpc();

  await connection.confirmTransaction(tx, "confirmed");

  return { taskValidationConfigPda, taskAttestorConfigPda, txSignature: tx };
}

/**
 * Submit a worker result for Task Validation V2 manual validation.
 */
export async function submitTaskResult(
  connection: Connection,
  program: Program,
  authority: Keypair,
  workerAgentId: Uint8Array | number[],
  taskPda: PublicKey,
  params: SubmitTaskResultParams,
): Promise<{ taskSubmissionPda: PublicKey; txSignature: string }> {
  const programId = program.programId;
  const workerAgentPda = deriveAgentPda(workerAgentId, programId);
  const claimPda = deriveClaimPda(taskPda, workerAgentPda, programId);
  const taskValidationConfigPda = deriveTaskValidationConfigPda(
    taskPda,
    programId,
  );
  const taskSubmissionPda = deriveTaskSubmissionPda(claimPda, programId);
  const protocolPda = deriveProtocolPda(programId);

  const proofHash = Array.from(
    toFixedBytes(
      Buffer.from(params.proofHash),
      HASH_SIZE,
      "proofHash",
    ),
  );
  const resultData = params.resultData
    ? toFixedBytes(
        Buffer.from(params.resultData),
        RESULT_DATA_SIZE,
        "resultData",
      )
    : null;

  const tx = await program.methods
    .submitTaskResult(proofHash, resultData)
    .accountsPartial({
      task: taskPda,
      claim: claimPda,
      taskValidationConfig: taskValidationConfigPda,
      taskSubmission: taskSubmissionPda,
      protocolConfig: protocolPda,
      worker: workerAgentPda,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: RECOMMENDED_CU_SUBMIT_TASK_RESULT,
      }),
    ])
    .signers([authority])
    .rpc();

  await connection.confirmTransaction(tx, "confirmed");

  return { taskSubmissionPda, txSignature: tx };
}

/**
 * Accept a pending Task Validation V2 submission and settle the task reward.
 */
export async function acceptTaskResult(
  connection: Connection,
  program: Program,
  creator: Keypair,
  workerAgentId: Uint8Array | number[],
  taskPda: PublicKey,
  options?: TaskCompletionOptions,
): Promise<{ txSignature: string }> {
  const programId = program.programId;
  const workerAgentPda = deriveAgentPda(workerAgentId, programId);
  const claimPda = deriveClaimPda(taskPda, workerAgentPda, programId);
  const escrowPda = deriveEscrowPda(taskPda, programId);
  const taskValidationConfigPda = deriveTaskValidationConfigPda(
    taskPda,
    programId,
  );
  const taskSubmissionPda = deriveTaskSubmissionPda(claimPda, programId);
  const protocolPda = deriveProtocolPda(programId);

  const { task, protocolConfig } = await fetchCompletionContext(
    program,
    taskPda,
    protocolPda,
  );
  const workerReviewContext = await fetchWorkerReviewContext(
    program,
    workerAgentPda,
  );

  const mint = task.rewardMint;
  const tokenAccounts = buildCompletionTokenAccounts(
    mint,
    escrowPda,
    workerReviewContext.authority,
    protocolConfig.treasury,
  );

  const cuLimit = mint
    ? RECOMMENDED_CU_ACCEPT_TASK_RESULT_TOKEN
    : RECOMMENDED_CU_ACCEPT_TASK_RESULT;

  const builder = program.methods
    .acceptTaskResult()
    .accountsPartial({
      task: taskPda,
      claim: claimPda,
      escrow: escrowPda,
      taskValidationConfig: taskValidationConfigPda,
      taskSubmission: taskSubmissionPda,
      worker: workerAgentPda,
      protocolConfig: protocolPda,
      treasury: protocolConfig.treasury,
      creator: creator.publicKey,
      workerAuthority: workerReviewContext.authority,
      systemProgram: SystemProgram.programId,
      ...tokenAccounts,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
    ])
    .signers([creator]);

  const remainingAccounts = buildTaskCompletionRemainingAccounts(
    options,
    workerReviewContext.authority,
  );
  if (remainingAccounts.length > 0) {
    builder.remainingAccounts(remainingAccounts);
  }

  const tx = await builder.rpc();

  await connection.confirmTransaction(tx, "confirmed");

  return { txSignature: tx };
}

/**
 * Reject a pending Task Validation V2 submission and return the task to active work.
 */
export async function rejectTaskResult(
  connection: Connection,
  program: Program,
  creator: Keypair,
  workerAgentId: Uint8Array | number[],
  taskPda: PublicKey,
  params: RejectTaskResultParams,
): Promise<{ txSignature: string }> {
  const programId = program.programId;
  const workerAgentPda = deriveAgentPda(workerAgentId, programId);
  const claimPda = deriveClaimPda(taskPda, workerAgentPda, programId);
  const taskValidationConfigPda = deriveTaskValidationConfigPda(
    taskPda,
    programId,
  );
  const taskSubmissionPda = deriveTaskSubmissionPda(claimPda, programId);
  const protocolPda = deriveProtocolPda(programId);
  const workerReviewContext = await fetchWorkerReviewContext(program, workerAgentPda);
  const rejectionHash = Array.from(
    toFixedBytes(
      Buffer.from(params.rejectionHash),
      HASH_SIZE,
      "rejectionHash",
    ),
  );

  const tx = await program.methods
    .rejectTaskResult(rejectionHash)
    .accountsPartial({
      task: taskPda,
      claim: claimPda,
      taskValidationConfig: taskValidationConfigPda,
      taskSubmission: taskSubmissionPda,
      worker: workerAgentPda,
      protocolConfig: protocolPda,
      creator: creator.publicKey,
      workerAuthority: workerReviewContext.authority,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: RECOMMENDED_CU_REJECT_TASK_RESULT,
      }),
    ])
    .signers([creator])
    .rpc();

  await connection.confirmTransaction(tx, "confirmed");

  return { txSignature: tx };
}

/**
 * Permissionlessly auto-accept a timed-out creator-review submission.
 */
export async function autoAcceptTaskResult(
  connection: Connection,
  program: Program,
  authority: Keypair,
  workerAgentId: Uint8Array | number[],
  taskPda: PublicKey,
  options?: TaskCompletionOptions,
): Promise<{ txSignature: string }> {
  const programId = program.programId;
  const workerAgentPda = deriveAgentPda(workerAgentId, programId);
  const claimPda = deriveClaimPda(taskPda, workerAgentPda, programId);
  const escrowPda = deriveEscrowPda(taskPda, programId);
  const taskValidationConfigPda = deriveTaskValidationConfigPda(
    taskPda,
    programId,
  );
  const taskSubmissionPda = deriveTaskSubmissionPda(claimPda, programId);
  const protocolPda = deriveProtocolPda(programId);

  const { task, protocolConfig } = await fetchCompletionContext(
    program,
    taskPda,
    protocolPda,
  );
  const workerReviewContext = await fetchWorkerReviewContext(
    program,
    workerAgentPda,
  );

  const mint = task.rewardMint;
  const tokenAccounts = buildCompletionTokenAccounts(
    mint,
    escrowPda,
    workerReviewContext.authority,
    protocolConfig.treasury,
  );

  const cuLimit = mint
    ? RECOMMENDED_CU_AUTO_ACCEPT_TASK_RESULT_TOKEN
    : RECOMMENDED_CU_AUTO_ACCEPT_TASK_RESULT;

  const builder = program.methods
    .autoAcceptTaskResult()
    .accountsPartial({
      task: taskPda,
      claim: claimPda,
      escrow: escrowPda,
      taskValidationConfig: taskValidationConfigPda,
      taskSubmission: taskSubmissionPda,
      worker: workerAgentPda,
      protocolConfig: protocolPda,
      treasury: protocolConfig.treasury,
      creator: task.creator,
      workerAuthority: workerReviewContext.authority,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
      ...tokenAccounts,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
    ])
    .signers([authority]);

  const remainingAccounts = buildTaskCompletionRemainingAccounts(
    options,
    workerReviewContext.authority,
  );
  if (remainingAccounts.length > 0) {
    builder.remainingAccounts(remainingAccounts);
  }

  const tx = await builder.rpc();

  await connection.confirmTransaction(tx, "confirmed");

  return { txSignature: tx };
}

/**
 * Record a validator quorum vote or external attestation for a submission.
 */
export async function validateTaskResult(
  connection: Connection,
  program: Program,
  reviewer: Keypair,
  workerAgentId: Uint8Array | number[],
  taskPda: PublicKey,
  params: ValidateTaskResultParams,
  options?: TaskCompletionOptions,
): Promise<{
  taskSubmissionPda: PublicKey;
  taskValidationVotePda: PublicKey;
  txSignature: string;
}> {
  const programId = program.programId;
  const workerAgentPda = deriveAgentPda(workerAgentId, programId);
  const claimPda = deriveClaimPda(taskPda, workerAgentPda, programId);
  const escrowPda = deriveEscrowPda(taskPda, programId);
  const taskValidationConfigPda = deriveTaskValidationConfigPda(
    taskPda,
    programId,
  );
  const taskAttestorConfigPda = deriveTaskAttestorConfigPda(taskPda, programId);
  const taskSubmissionPda = deriveTaskSubmissionPda(claimPda, programId);
  const taskValidationVotePda = deriveTaskValidationVotePda(
    taskSubmissionPda,
    reviewer.publicKey,
    programId,
  );
  const protocolPda = deriveProtocolPda(programId);
  const validatorAgentPda = params.validatorAgentId
    ? deriveAgentPda(params.validatorAgentId, programId)
    : null;

  const { task, protocolConfig } = await fetchCompletionContext(
    program,
    taskPda,
    protocolPda,
  );
  const workerReviewContext = await fetchWorkerReviewContext(
    program,
    workerAgentPda,
  );

  const mint = task.rewardMint;
  const tokenAccounts = buildCompletionTokenAccounts(
    mint,
    escrowPda,
    workerReviewContext.authority,
    protocolConfig.treasury,
  );

  const cuLimit = mint
    ? RECOMMENDED_CU_VALIDATE_TASK_RESULT_TOKEN
    : RECOMMENDED_CU_VALIDATE_TASK_RESULT;

  const builder = program.methods
    .validateTaskResult(params.approved)
    .accountsPartial({
      task: taskPda,
      claim: claimPda,
      escrow: escrowPda,
      taskValidationConfig: taskValidationConfigPda,
      taskAttestorConfig: validatorAgentPda
        ? undefined
        : taskAttestorConfigPda,
      taskSubmission: taskSubmissionPda,
      taskValidationVote: taskValidationVotePda,
      worker: workerAgentPda,
      protocolConfig: protocolPda,
      validatorAgent: validatorAgentPda ?? undefined,
      treasury: protocolConfig.treasury,
      creator: task.creator,
      workerAuthority: workerReviewContext.authority,
      reviewer: reviewer.publicKey,
      systemProgram: SystemProgram.programId,
      ...tokenAccounts,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
    ])
    .signers([reviewer]);

  const remainingAccounts = buildTaskCompletionRemainingAccounts(
    options,
    workerReviewContext.authority,
  );
  if (remainingAccounts.length > 0) {
    builder.remainingAccounts(remainingAccounts);
  }

  const tx = await builder.rpc();

  await connection.confirmTransaction(tx, "confirmed");

  return { taskSubmissionPda, taskValidationVotePda, txSignature: tx };
}

/**
 * Cancel a task and refund the escrow to the creator.
 *
 * For tasks with active workers, pass workerPairs to close their claim accounts.
 * The on-chain instruction uses remaining_accounts for worker claim/agent pairs.
 */
export async function cancelTask(
  connection: Connection,
  program: Program,
  creator: Keypair,
  taskPda: PublicKey,
  workerPairs?: Array<{ claimPda: PublicKey; workerAgentPda: PublicKey }>,
  options?: CancelTaskOptions,
): Promise<{ txSignature: string }> {
  const programId = program.programId;
  const escrowPda = deriveEscrowPda(taskPda, programId);
  const protocolPda = deriveProtocolPda(programId);

  // Fetch task to get reward_mint
  const task = (await getAccount(program, "task").fetch(taskPda)) as {
    rewardMint: PublicKey | null;
  };

  const mint = task.rewardMint;

  // Build token-specific accounts
  let tokenAccounts: Record<string, PublicKey | null>;
  if (mint) {
    tokenAccounts = {
      tokenEscrowAta: getAssociatedTokenAddressSync(mint, escrowPda, true),
      creatorTokenAccount: getAssociatedTokenAddressSync(
        mint,
        creator.publicKey,
      ),
      rewardMint: mint,
      tokenProgram: TOKEN_PROGRAM_ID,
    };
  } else {
    tokenAccounts = {
      tokenEscrowAta: null,
      creatorTokenAccount: null,
      rewardMint: null,
      tokenProgram: null,
    };
  }

  // Build remaining accounts for worker claim pairs
  const remainingAccounts = buildCancelTaskRemainingAccounts(workerPairs, options);

  const cuLimit = mint
    ? RECOMMENDED_CU_CANCEL_TASK_TOKEN
    : RECOMMENDED_CU_CANCEL_TASK;

  const builder = program.methods
    .cancelTask()
    .accountsPartial({
      task: taskPda,
      escrow: escrowPda,
      authority: creator.publicKey,
      protocolConfig: protocolPda,
      systemProgram: SystemProgram.programId,
      ...tokenAccounts,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
    ])
    .signers([creator]);

  if (remainingAccounts.length > 0) {
    builder.remainingAccounts(remainingAccounts);
  }

  const tx = await builder.rpc();

  await connection.confirmTransaction(tx, "confirmed");

  return { txSignature: tx };
}

// ============================================================================
// Internal helpers
// ============================================================================

interface TaskAccountData {
  taskId?: number[] | Uint8Array;
  status?: { [key: string]: Record<string, never> } | number;
  creator?: PublicKey;
  rewardAmount?: { toString: () => string };
  deadline?: { toNumber: () => number };
  constraintHash?: number[] | Uint8Array | null;
  currentWorkers?: number;
  maxWorkers?: number;
  completedAt?: { toNumber: () => number } | null;
  rewardMint?: PublicKey | null;
}

function parseTaskAccountData(data: TaskAccountData): TaskStatus | null {
  if (data.creator === undefined || data.status === undefined) {
    return null;
  }

  const state = parseTaskState(data.status);

  let constraintHash: Uint8Array | null = null;
  if (data.constraintHash) {
    const bytes = new Uint8Array(data.constraintHash);
    if (bytes.some((b) => b !== 0)) {
      constraintHash = bytes;
    }
  }

  return {
    taskId: data.taskId ? new Uint8Array(data.taskId) : new Uint8Array(32),
    state,
    creator: data.creator,
    rewardAmount: BigInt(data.rewardAmount?.toString() ?? "0"),
    deadline: data.deadline?.toNumber() ?? 0,
    constraintHash,
    currentWorkers: data.currentWorkers ?? 0,
    maxWorkers: data.maxWorkers ?? 1,
    completedAt: data.completedAt?.toNumber() ?? null,
    rewardMint: data.rewardMint ?? null,
  };
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get task status by PDA.
 */
export async function getTask(
  program: Program,
  taskPda: PublicKey,
): Promise<TaskStatus | null> {
  try {
    const task = await getAccount(program, "task").fetch(taskPda);
    const data = task as TaskAccountData;
    const parsed = parseTaskAccountData(data);

    if (!parsed) {
      getSdkLogger().warn("Task account data missing required fields");
      return null;
    }

    return parsed;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes("Account does not exist") ||
      errorMessage.includes("could not find account")
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * Get all tasks created by an address.
 */
export async function getTasksByCreator(
  program: Program,
  creator: PublicKey,
): Promise<TaskStatus[]> {
  const tasks = await getAccount(program, "task").all([
    {
      memcmp: {
        offset: DISCRIMINATOR_SIZE + 32, // After discriminator + task_id
        bytes: creator.toBase58(),
      },
    },
  ]);

  const result: TaskStatus[] = [];

  for (let idx = 0; idx < tasks.length; idx++) {
    const t = tasks[idx];
    const data = t.account as TaskAccountData;
    const parsed = parseTaskAccountData(data);

    if (!parsed) {
      getSdkLogger().warn(
        `Task at index ${idx} missing required fields, skipping`,
      );
      continue;
    }

    result.push(parsed);
  }

  return result;
}

/**
 * Fetch all claims for a task and build timeline events for each claim/completion.
 */
async function buildClaimTimelineEvents(
  program: Program,
  taskPda: PublicKey,
): Promise<TaskLifecycleEvent[]> {
  const claims = await getAccount(program, "taskClaim").all([
    {
      memcmp: {
        offset: DISCRIMINATOR_SIZE, // discriminator + task pubkey at offset 8
        bytes: taskPda.toBase58(),
      },
    },
  ]);

  const events: TaskLifecycleEvent[] = [];
  for (const claim of claims) {
    const claimAccount = claim.account as {
      worker?: PublicKey;
      claimedAt?: { toNumber: () => number };
      claimed_at?: { toNumber: () => number };
      completedAt?: { toNumber: () => number };
      completed_at?: { toNumber: () => number };
    };

    const claimedAt =
      claimAccount.claimedAt?.toNumber() ??
      claimAccount.claimed_at?.toNumber() ??
      0;
    if (claimedAt > 0) {
      events.push({
        eventName: "taskClaimed",
        timestamp: claimedAt,
        actor: claimAccount.worker,
        data: { claimPda: claim.publicKey.toBase58() },
      });
    }

    const claimCompletedAt =
      claimAccount.completedAt?.toNumber() ??
      claimAccount.completed_at?.toNumber() ??
      0;
    if (claimCompletedAt > 0) {
      events.push({
        eventName: "taskClaimCompleted",
        timestamp: claimCompletedAt,
        actor: claimAccount.worker,
        data: { claimPda: claim.publicKey.toBase58() },
      });
    }
  }

  return events;
}

/**
 * Fetch all disputes for a task and build timeline events, tracking active dispute state.
 */
async function buildDisputeTimelineEvents(
  program: Program,
  taskPda: PublicKey,
): Promise<{ events: TaskLifecycleEvent[]; hasActiveDispute: boolean }> {
  const disputes = await getAccount(program, "dispute").all([
    {
      memcmp: {
        offset: DISCRIMINATOR_SIZE + 32, // discriminator + dispute_id
        bytes: taskPda.toBase58(),
      },
    },
  ]);

  const parseDisputeStatus = (status: unknown): number => {
    if (typeof status === "number") return status;
    if (!status || typeof status !== "object") return 0;
    const key = Object.keys(status as Record<string, unknown>)[0];
    const map: Record<string, number> = {
      active: 0,
      resolved: 1,
      expired: 2,
      cancelled: 3,
    };
    return map[key] ?? 0;
  };

  const events: TaskLifecycleEvent[] = [];
  let hasActiveDispute = false;
  for (const dispute of disputes) {
    const d = dispute.account as {
      initiator?: PublicKey;
      createdAt?: { toNumber: () => number };
      created_at?: { toNumber: () => number };
      resolvedAt?: { toNumber: () => number };
      resolved_at?: { toNumber: () => number };
      status?: unknown;
    };

    const created = d.createdAt?.toNumber() ?? d.created_at?.toNumber() ?? 0;
    const resolved = d.resolvedAt?.toNumber() ?? d.resolved_at?.toNumber() ?? 0;
    const status = parseDisputeStatus(d.status);

    if (status === 0) {
      hasActiveDispute = true;
    }

    if (created > 0) {
      events.push({
        eventName: "disputeInitiated",
        timestamp: created,
        actor: d.initiator,
        data: { disputePda: dispute.publicKey.toBase58() },
      });
    }

    if (resolved > 0 && status === 1) {
      events.push({
        eventName: "disputeResolved",
        timestamp: resolved,
        data: { disputePda: dispute.publicKey.toBase58() },
      });
    }
  }

  return { events, hasActiveDispute };
}

/**
 * Build a timeline summary for a task from task/claim/dispute accounts.
 *
 * @example
 * ```typescript
 * const summary = await getTaskLifecycleSummary(program, taskPda);
 * if (summary?.currentState === TaskState.Completed) {
 *   console.log(`Task completed in ${summary.durationSeconds}s`);
 * }
 * ```
 */
export async function getTaskLifecycleSummary(
  program: Program,
  taskPda: PublicKey,
): Promise<TaskLifecycleSummary | null> {
  const task = await getTask(program, taskPda);
  if (!task) {
    return null;
  }

  const rawTask = (await getAccount(program, "task").fetch(taskPda)) as {
    creator: PublicKey;
    createdAt?: { toNumber: () => number };
    created_at?: { toNumber: () => number };
    dependsOn?: PublicKey | null;
    depends_on?: PublicKey | null;
    completedAt?: { toNumber: () => number } | null;
    completed_at?: { toNumber: () => number } | null;
  };

  const createdAt =
    rawTask.createdAt?.toNumber() ?? rawTask.created_at?.toNumber() ?? 0;
  const dependsOn = rawTask.dependsOn ?? rawTask.depends_on ?? null;
  const completedAt =
    rawTask.completedAt?.toNumber() ??
    rawTask.completed_at?.toNumber() ??
    task.completedAt;

  const timeline: TaskLifecycleEvent[] = [
    {
      eventName: "taskCreated",
      timestamp: createdAt,
      actor: task.creator,
    },
  ];

  const claimEvents = await buildClaimTimelineEvents(program, taskPda);
  timeline.push(...claimEvents);

  if (task.state === TaskState.Completed && completedAt && completedAt > 0) {
    timeline.push({
      eventName: "taskCompleted",
      timestamp: completedAt,
    });
  }

  if (task.state === TaskState.Cancelled) {
    timeline.push({
      eventName: "taskCancelled",
      timestamp: completedAt && completedAt > 0 ? completedAt : createdAt,
      actor: rawTask.creator,
    });
  }

  const disputeResult = await buildDisputeTimelineEvents(program, taskPda);
  timeline.push(...disputeResult.events);
  const hasActiveDispute = disputeResult.hasActiveDispute;

  timeline.sort((a, b) => a.timestamp - b.timestamp);

  const providerConnection = (program.provider as { connection?: Connection })
    .connection;
  if (!providerConnection) {
    throw new Error("Program provider does not expose a connection");
  }

  const dependentCount = await getDependentTaskCount(
    providerConnection,
    program.programId,
    taskPda,
  );

  const now = Math.floor(Date.now() / 1000);
  const isExpired =
    task.deadline > 0 &&
    now > task.deadline &&
    task.state !== TaskState.Completed &&
    task.state !== TaskState.Cancelled;

  const durationSeconds =
    completedAt && createdAt > 0 ? completedAt - createdAt : null;

  return {
    taskPda,
    currentState: task.state,
    creator: task.creator,
    rewardAmount: task.rewardAmount,
    rewardMint: task.rewardMint,
    timeline,
    currentWorkers: task.currentWorkers,
    maxWorkers: task.maxWorkers,
    createdAt,
    deadline: task.deadline,
    completedAt,
    hasActiveDispute,
    dependsOn,
    dependentCount,
    durationSeconds,
    isExpired,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse Anchor enum status to TaskState number.
 * Anchor returns enums as objects like { open: {} }, { inProgress: {} }, etc.
 */
function parseTaskState(
  status: { [key: string]: Record<string, never> } | number,
): TaskState {
  if (typeof status === "number") return status as TaskState;

  const key = Object.keys(status)[0];
  const stateMap: Record<string, TaskState> = {
    open: TaskState.Open,
    inProgress: TaskState.InProgress,
    pendingValidation: TaskState.PendingValidation,
    completed: TaskState.Completed,
    cancelled: TaskState.Cancelled,
    disputed: TaskState.Disputed,
  };
  return stateMap[key] ?? TaskState.Open;
}

/**
 * Format task state as human-readable string
 */
export function formatTaskState(state: TaskState): string {
  const states: Record<TaskState, string> = {
    [TaskState.Open]: "Open",
    [TaskState.InProgress]: "In Progress",
    [TaskState.PendingValidation]: "Pending Validation",
    [TaskState.Completed]: "Completed",
    [TaskState.Cancelled]: "Cancelled",
    [TaskState.Disputed]: "Disputed",
  };
  return states[state] ?? "Unknown";
}

/**
 * Calculate escrow fee (protocol fee percentage)
 * @param escrowLamports - Escrow amount in lamports (must be non-negative)
 * @param feePercentage - Fee percentage (must be between 0 and PERCENT_BASE)
 * @returns Fee amount in lamports
 */
export function calculateEscrowFee(
  escrowLamports: number,
  feePercentage: number = DEFAULT_FEE_PERCENT,
): number {
  if (escrowLamports < 0 || !Number.isFinite(escrowLamports)) {
    throw new Error(
      "Invalid escrow amount: must be a non-negative finite number",
    );
  }
  if (
    feePercentage < 0 ||
    feePercentage > PERCENT_BASE ||
    !Number.isFinite(feePercentage)
  ) {
    throw new Error(
      `Invalid fee percentage: must be between 0 and ${PERCENT_BASE}`,
    );
  }

  const maxSafeMultiplier = Math.floor(Number.MAX_SAFE_INTEGER / PERCENT_BASE);
  if (escrowLamports > maxSafeMultiplier) {
    throw new Error("Escrow amount too large: would cause arithmetic overflow");
  }

  return Math.floor((escrowLamports * feePercentage) / PERCENT_BASE);
}
