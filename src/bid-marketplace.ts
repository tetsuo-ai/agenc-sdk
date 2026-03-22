import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  type AccountMeta,
} from "@solana/web3.js";
import { type Program } from "@coral-xyz/anchor";
import { AnchorBN } from "./anchor-bn";
import { getAccount } from "./anchor-utils";
import { deriveAgentPda } from "./agents";
import { PROGRAM_ID, SEEDS } from "./constants";
import { deriveProtocolPda } from "./protocol";
import { deriveClaimPda } from "./tasks";
import { toBigInt, toNumber } from "./utils/numeric";
import { toFixedBytes } from "./utils/pda";

export enum BidBookMatchingPolicy {
  BestPrice = 0,
  BestEta = 1,
  WeightedScore = 2,
}

export enum TaskBidLifecycleState {
  Active = 0,
  Accepted = 1,
}

export enum TaskBidBookLifecycleState {
  Open = 0,
  Accepted = 1,
  Closed = 2,
}

export interface BidMarketplaceConfigParams {
  minBidBondLamports: number | bigint;
  bidCreationCooldownSecs: number;
  maxBidsPer24h: number;
  maxActiveBidsPerTask: number;
  maxBidLifetimeSecs: number;
  acceptedNoShowSlashBps: number;
}

export interface BidBookWeightedScoreWeights {
  priceWeightBps: number;
  etaWeightBps: number;
  confidenceWeightBps: number;
  reliabilityWeightBps: number;
}

export interface InitializeBidBookParams {
  taskPda: PublicKey;
  policy: BidBookMatchingPolicy | number;
  weights?: BidBookWeightedScoreWeights;
}

export interface BidderReference {
  bidderAgentId?: Uint8Array | number[];
  bidderAgentPda?: PublicKey;
}

export interface CreateBidParams extends BidderReference {
  taskPda: PublicKey;
  requestedRewardLamports: number | bigint;
  etaSeconds: number;
  confidenceBps: number;
  qualityGuaranteeHash?: Uint8Array | number[];
  metadataHash?: Uint8Array | number[];
  expiresAt: number;
}

export interface UpdateBidParams extends CreateBidParams {}

export interface CancelBidParams extends BidderReference {
  taskPda: PublicKey;
}

export interface AcceptBidParams extends BidderReference {
  taskPda: PublicKey;
}

export interface ExpireBidParams extends BidderReference {
  taskPda: PublicKey;
  bidderAuthority?: PublicKey;
}

export interface BidMarketplaceConfigState {
  authority: PublicKey;
  minBidBondLamports: bigint;
  bidCreationCooldownSecs: number;
  maxBidsPer24h: number;
  maxActiveBidsPerTask: number;
  maxBidLifetimeSecs: number;
  acceptedNoShowSlashBps: number;
  bump: number;
}

export interface BidderMarketStateSnapshot {
  bidder: PublicKey;
  lastBidCreatedAt: number;
  bidWindowStartedAt: number;
  bidsCreatedInWindow: number;
  activeBidCount: number;
  totalBidsCreated: bigint;
  totalBidsAccepted: bigint;
  bump: number;
}

export interface TaskBidAccountState {
  task: PublicKey;
  bidBook: PublicKey;
  bidder: PublicKey;
  bidderAuthority: PublicKey;
  requestedRewardLamports: bigint;
  etaSeconds: number;
  confidenceBps: number;
  reputationSnapshotBps: number;
  qualityGuaranteeHash: Uint8Array;
  metadataHash: Uint8Array;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
  state: TaskBidLifecycleState;
  bondLamports: bigint;
  bump: number;
}

export interface TaskBidBookAccountState {
  task: PublicKey;
  state: TaskBidBookLifecycleState;
  policy: BidBookMatchingPolicy;
  weights: BidBookWeightedScoreWeights;
  acceptedBid: PublicKey | null;
  version: bigint;
  totalBids: number;
  activeBids: number;
  createdAt: number;
  updatedAt: number;
  bump: number;
}

const EMPTY_HASH_BYTES = new Uint8Array(32);

function buildMultisigRemainingAccounts(signers: Keypair[]): AccountMeta[] {
  const unique = new Set<string>();
  const accounts: AccountMeta[] = [];

  for (const signer of signers) {
    const key = signer.publicKey.toBase58();
    if (unique.has(key)) continue;
    unique.add(key);
    accounts.push({
      pubkey: signer.publicKey,
      isSigner: true,
      isWritable: false,
    });
  }

  return accounts;
}

function validateMultisigSigners(signers: Keypair[], operationName: string): void {
  if (signers.length === 0) {
    throw new Error(`${operationName} requires at least one multisig signer`);
  }
}

function toHashBytes(
  value: Uint8Array | number[] | undefined,
  fieldName: string,
): Uint8Array {
  if (!value) {
    return EMPTY_HASH_BYTES;
  }
  return toFixedBytes(value, 32, fieldName);
}

function resolveBidderAgentPda(
  programId: PublicKey,
  params: BidderReference,
): PublicKey {
  const derived =
    params.bidderAgentId !== undefined
      ? deriveAgentPda(params.bidderAgentId, programId)
      : null;
  const provided = params.bidderAgentPda ?? null;

  if (derived && provided && !derived.equals(provided)) {
    throw new Error(
      `bidderAgentId and bidderAgentPda refer to different agents (${derived.toBase58()} != ${provided.toBase58()})`,
    );
  }

  const bidderAgentPda = provided ?? derived;
  if (!bidderAgentPda) {
    throw new Error("Either bidderAgentId or bidderAgentPda must be provided");
  }

  return bidderAgentPda;
}

function toUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value);
  }
  return new Uint8Array();
}

function parseTaskBidState(raw: unknown): TaskBidLifecycleState {
  if (typeof raw === "number") {
    return raw as TaskBidLifecycleState;
  }
  if (raw && typeof raw === "object") {
    const enumObj = raw as Record<string, unknown>;
    if ("active" in enumObj) return TaskBidLifecycleState.Active;
    if ("accepted" in enumObj) return TaskBidLifecycleState.Accepted;
  }
  return TaskBidLifecycleState.Active;
}

function parseBidBookState(raw: unknown): TaskBidBookLifecycleState {
  if (typeof raw === "number") {
    return raw as TaskBidBookLifecycleState;
  }
  if (raw && typeof raw === "object") {
    const enumObj = raw as Record<string, unknown>;
    if ("open" in enumObj) return TaskBidBookLifecycleState.Open;
    if ("accepted" in enumObj) return TaskBidBookLifecycleState.Accepted;
    if ("closed" in enumObj) return TaskBidBookLifecycleState.Closed;
  }
  return TaskBidBookLifecycleState.Open;
}

function parseBidBookMatchingPolicy(raw: unknown): BidBookMatchingPolicy {
  if (typeof raw === "number") {
    return raw as BidBookMatchingPolicy;
  }
  if (raw && typeof raw === "object") {
    const enumObj = raw as Record<string, unknown>;
    if ("bestPrice" in enumObj || "best_price" in enumObj) {
      return BidBookMatchingPolicy.BestPrice;
    }
    if ("bestEta" in enumObj || "best_eta" in enumObj) {
      return BidBookMatchingPolicy.BestEta;
    }
    if ("weightedScore" in enumObj || "weighted_score" in enumObj) {
      return BidBookMatchingPolicy.WeightedScore;
    }
  }
  return BidBookMatchingPolicy.BestPrice;
}

function parseWeights(raw: unknown): BidBookWeightedScoreWeights {
  if (!raw || typeof raw !== "object") {
    return {
      priceWeightBps: 0,
      etaWeightBps: 0,
      confidenceWeightBps: 0,
      reliabilityWeightBps: 0,
    };
  }

  const value = raw as Record<string, unknown>;
  return {
    priceWeightBps: toNumber(value.priceWeightBps ?? value.price_weight_bps),
    etaWeightBps: toNumber(value.etaWeightBps ?? value.eta_weight_bps),
    confidenceWeightBps: toNumber(
      value.confidenceWeightBps ?? value.confidence_weight_bps,
    ),
    reliabilityWeightBps: toNumber(
      value.reliabilityWeightBps ?? value.reliability_weight_bps,
    ),
  };
}

function isMissingAccountError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Account does not exist") ||
    message.includes("could not find account")
  );
}

export function deriveBidMarketplacePda(
  programId: PublicKey = PROGRAM_ID,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [SEEDS.BID_MARKETPLACE],
    programId,
  );
  return pda;
}

export function deriveBidBookPda(
  taskPda: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [SEEDS.BID_BOOK, taskPda.toBuffer()],
    programId,
  );
  return pda;
}

export function deriveBidPda(
  taskPda: PublicKey,
  bidderAgentPda: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [SEEDS.BID, taskPda.toBuffer(), bidderAgentPda.toBuffer()],
    programId,
  );
  return pda;
}

export function deriveBidderMarketStatePda(
  bidderAgentPda: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [SEEDS.BIDDER_MARKET, bidderAgentPda.toBuffer()],
    programId,
  );
  return pda;
}

export async function initializeBidMarketplace(
  connection: Connection,
  program: Program,
  multisigSigners: Keypair[],
  params: BidMarketplaceConfigParams,
): Promise<{ bidMarketplacePda: PublicKey; txSignature: string }> {
  validateMultisigSigners(multisigSigners, "initializeBidMarketplace");

  const authority = multisigSigners[0]!;
  const bidMarketplacePda = deriveBidMarketplacePda(program.programId);
  const builder = program.methods
    .initializeBidMarketplace(
      new AnchorBN(params.minBidBondLamports.toString()),
      new AnchorBN(params.bidCreationCooldownSecs.toString()),
      params.maxBidsPer24h,
      params.maxActiveBidsPerTask,
      new AnchorBN(params.maxBidLifetimeSecs.toString()),
      params.acceptedNoShowSlashBps,
    )
    .accountsPartial({
      protocolConfig: deriveProtocolPda(program.programId),
      bidMarketplace: bidMarketplacePda,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers(multisigSigners);

  const remainingAccounts = buildMultisigRemainingAccounts(multisigSigners);
  if (remainingAccounts.length > 0) {
    builder.remainingAccounts(remainingAccounts);
  }

  const tx = await builder.rpc();
  await connection.confirmTransaction(tx, "confirmed");

  return { bidMarketplacePda, txSignature: tx };
}

export async function updateBidMarketplaceConfig(
  connection: Connection,
  program: Program,
  multisigSigners: Keypair[],
  params: BidMarketplaceConfigParams,
): Promise<{ txSignature: string }> {
  validateMultisigSigners(multisigSigners, "updateBidMarketplaceConfig");

  const authority = multisigSigners[0]!;
  const builder = program.methods
    .updateBidMarketplaceConfig(
      new AnchorBN(params.minBidBondLamports.toString()),
      new AnchorBN(params.bidCreationCooldownSecs.toString()),
      params.maxBidsPer24h,
      params.maxActiveBidsPerTask,
      new AnchorBN(params.maxBidLifetimeSecs.toString()),
      params.acceptedNoShowSlashBps,
    )
    .accountsPartial({
      protocolConfig: deriveProtocolPda(program.programId),
      bidMarketplace: deriveBidMarketplacePda(program.programId),
      authority: authority.publicKey,
    })
    .signers(multisigSigners);

  const remainingAccounts = buildMultisigRemainingAccounts(multisigSigners);
  if (remainingAccounts.length > 0) {
    builder.remainingAccounts(remainingAccounts);
  }

  const tx = await builder.rpc();
  await connection.confirmTransaction(tx, "confirmed");

  return { txSignature: tx };
}

export async function initializeBidBook(
  connection: Connection,
  program: Program,
  creator: Keypair,
  params: InitializeBidBookParams,
): Promise<{ bidBookPda: PublicKey; txSignature: string }> {
  const bidBookPda = deriveBidBookPda(params.taskPda, program.programId);
  const weights = params.weights;

  const tx = await program.methods
    .initializeBidBook(
      params.policy,
      weights?.priceWeightBps ?? 0,
      weights?.etaWeightBps ?? 0,
      weights?.confidenceWeightBps ?? 0,
      weights?.reliabilityWeightBps ?? 0,
    )
    .accountsPartial({
      task: params.taskPda,
      bidBook: bidBookPda,
      protocolConfig: deriveProtocolPda(program.programId),
      creator: creator.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([creator])
    .rpc();

  await connection.confirmTransaction(tx, "confirmed");

  return { bidBookPda, txSignature: tx };
}

export async function createBid(
  connection: Connection,
  program: Program,
  authority: Keypair,
  params: CreateBidParams,
): Promise<{
  bidBookPda: PublicKey;
  bidPda: PublicKey;
  bidderAgentPda: PublicKey;
  bidderMarketStatePda: PublicKey;
  txSignature: string;
}> {
  const bidderAgentPda = resolveBidderAgentPda(program.programId, params);
  const bidBookPda = deriveBidBookPda(params.taskPda, program.programId);
  const bidPda = deriveBidPda(params.taskPda, bidderAgentPda, program.programId);
  const bidderMarketStatePda = deriveBidderMarketStatePda(
    bidderAgentPda,
    program.programId,
  );

  const tx = await program.methods
    .createBid(
      new AnchorBN(params.requestedRewardLamports.toString()),
      params.etaSeconds,
      params.confidenceBps,
      Array.from(toHashBytes(params.qualityGuaranteeHash, "qualityGuaranteeHash")),
      Array.from(toHashBytes(params.metadataHash, "metadataHash")),
      new AnchorBN(params.expiresAt.toString()),
    )
    .accountsPartial({
      protocolConfig: deriveProtocolPda(program.programId),
      bidMarketplace: deriveBidMarketplacePda(program.programId),
      task: params.taskPda,
      bidBook: bidBookPda,
      bid: bidPda,
      bidderMarketState: bidderMarketStatePda,
      bidder: bidderAgentPda,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();

  await connection.confirmTransaction(tx, "confirmed");

  return {
    bidBookPda,
    bidPda,
    bidderAgentPda,
    bidderMarketStatePda,
    txSignature: tx,
  };
}

export async function updateBid(
  connection: Connection,
  program: Program,
  authority: Keypair,
  params: UpdateBidParams,
): Promise<{
  bidBookPda: PublicKey;
  bidPda: PublicKey;
  bidderAgentPda: PublicKey;
  txSignature: string;
}> {
  const bidderAgentPda = resolveBidderAgentPda(program.programId, params);
  const bidBookPda = deriveBidBookPda(params.taskPda, program.programId);
  const bidPda = deriveBidPda(params.taskPda, bidderAgentPda, program.programId);

  const tx = await program.methods
    .updateBid(
      new AnchorBN(params.requestedRewardLamports.toString()),
      params.etaSeconds,
      params.confidenceBps,
      Array.from(toHashBytes(params.qualityGuaranteeHash, "qualityGuaranteeHash")),
      Array.from(toHashBytes(params.metadataHash, "metadataHash")),
      new AnchorBN(params.expiresAt.toString()),
    )
    .accountsPartial({
      task: params.taskPda,
      bidBook: bidBookPda,
      bid: bidPda,
      bidder: bidderAgentPda,
      authority: authority.publicKey,
      bidMarketplace: deriveBidMarketplacePda(program.programId),
      protocolConfig: deriveProtocolPda(program.programId),
    })
    .signers([authority])
    .rpc();

  await connection.confirmTransaction(tx, "confirmed");

  return {
    bidBookPda,
    bidPda,
    bidderAgentPda,
    txSignature: tx,
  };
}

export async function cancelBid(
  connection: Connection,
  program: Program,
  authority: Keypair,
  params: CancelBidParams,
): Promise<{
  bidBookPda: PublicKey;
  bidPda: PublicKey;
  bidderAgentPda: PublicKey;
  bidderMarketStatePda: PublicKey;
  txSignature: string;
}> {
  const bidderAgentPda = resolveBidderAgentPda(program.programId, params);
  const bidBookPda = deriveBidBookPda(params.taskPda, program.programId);
  const bidPda = deriveBidPda(params.taskPda, bidderAgentPda, program.programId);
  const bidderMarketStatePda = deriveBidderMarketStatePda(
    bidderAgentPda,
    program.programId,
  );

  const tx = await program.methods
    .cancelBid()
    .accountsPartial({
      task: params.taskPda,
      bidBook: bidBookPda,
      bid: bidPda,
      bidderMarketState: bidderMarketStatePda,
      bidder: bidderAgentPda,
      authority: authority.publicKey,
    })
    .signers([authority])
    .rpc();

  await connection.confirmTransaction(tx, "confirmed");

  return {
    bidBookPda,
    bidPda,
    bidderAgentPda,
    bidderMarketStatePda,
    txSignature: tx,
  };
}

export async function acceptBid(
  connection: Connection,
  program: Program,
  creator: Keypair,
  params: AcceptBidParams,
): Promise<{
  bidBookPda: PublicKey;
  bidPda: PublicKey;
  bidderAgentPda: PublicKey;
  bidderMarketStatePda: PublicKey;
  claimPda: PublicKey;
  txSignature: string;
}> {
  const bidderAgentPda = resolveBidderAgentPda(program.programId, params);
  const bidBookPda = deriveBidBookPda(params.taskPda, program.programId);
  const bidPda = deriveBidPda(params.taskPda, bidderAgentPda, program.programId);
  const bidderMarketStatePda = deriveBidderMarketStatePda(
    bidderAgentPda,
    program.programId,
  );
  const claimPda = deriveClaimPda(params.taskPda, bidderAgentPda, program.programId);

  const tx = await program.methods
    .acceptBid()
    .accountsPartial({
      task: params.taskPda,
      claim: claimPda,
      protocolConfig: deriveProtocolPda(program.programId),
      bidBook: bidBookPda,
      bid: bidPda,
      bidderMarketState: bidderMarketStatePda,
      bidder: bidderAgentPda,
      creator: creator.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([creator])
    .rpc();

  await connection.confirmTransaction(tx, "confirmed");

  return {
    bidBookPda,
    bidPda,
    bidderAgentPda,
    bidderMarketStatePda,
    claimPda,
    txSignature: tx,
  };
}

export async function expireBid(
  connection: Connection,
  program: Program,
  authority: Keypair,
  params: ExpireBidParams,
): Promise<{
  bidBookPda: PublicKey;
  bidPda: PublicKey;
  bidderAgentPda: PublicKey;
  bidderMarketStatePda: PublicKey;
  bidderAuthority: PublicKey;
  txSignature: string;
}> {
  const bidderAgentPda = resolveBidderAgentPda(program.programId, params);
  const bidBookPda = deriveBidBookPda(params.taskPda, program.programId);
  const bidPda = deriveBidPda(params.taskPda, bidderAgentPda, program.programId);
  const bidderMarketStatePda = deriveBidderMarketStatePda(
    bidderAgentPda,
    program.programId,
  );
  const bidderAuthority = params.bidderAuthority ?? authority.publicKey;

  const tx = await program.methods
    .expireBid()
    .accountsPartial({
      protocolConfig: deriveProtocolPda(program.programId),
      task: params.taskPda,
      bidBook: bidBookPda,
      bid: bidPda,
      bidderMarketState: bidderMarketStatePda,
      bidder: bidderAgentPda,
      bidderAuthority,
      authority: authority.publicKey,
    })
    .signers([authority])
    .rpc();

  await connection.confirmTransaction(tx, "confirmed");

  return {
    bidBookPda,
    bidPda,
    bidderAgentPda,
    bidderMarketStatePda,
    bidderAuthority,
    txSignature: tx,
  };
}

export async function getBidMarketplaceConfig(
  program: Program,
): Promise<BidMarketplaceConfigState | null> {
  try {
    const account = (await getAccount(program, "bidMarketplaceConfig").fetch(
      deriveBidMarketplacePda(program.programId),
    )) as Record<string, unknown>;

    return {
      authority: account.authority as PublicKey,
      minBidBondLamports: toBigInt(
        account.minBidBondLamports ?? account.min_bid_bond_lamports,
      ),
      bidCreationCooldownSecs: toNumber(
        account.bidCreationCooldownSecs ?? account.bid_creation_cooldown_secs,
      ),
      maxBidsPer24h: toNumber(account.maxBidsPer24h ?? account.max_bids_per_24h),
      maxActiveBidsPerTask: toNumber(
        account.maxActiveBidsPerTask ?? account.max_active_bids_per_task,
      ),
      maxBidLifetimeSecs: toNumber(
        account.maxBidLifetimeSecs ?? account.max_bid_lifetime_secs,
      ),
      acceptedNoShowSlashBps: toNumber(
        account.acceptedNoShowSlashBps ?? account.accepted_no_show_slash_bps,
      ),
      bump: toNumber(account.bump),
    };
  } catch (error) {
    if (isMissingAccountError(error)) {
      return null;
    }
    throw error;
  }
}

export async function getBidderMarketState(
  program: Program,
  bidderMarketStatePda: PublicKey,
): Promise<BidderMarketStateSnapshot | null> {
  try {
    const account = (await getAccount(program, "bidderMarketState").fetch(
      bidderMarketStatePda,
    )) as Record<string, unknown>;

    return {
      bidder: account.bidder as PublicKey,
      lastBidCreatedAt: toNumber(
        account.lastBidCreatedAt ?? account.last_bid_created_at,
      ),
      bidWindowStartedAt: toNumber(
        account.bidWindowStartedAt ?? account.bid_window_started_at,
      ),
      bidsCreatedInWindow: toNumber(
        account.bidsCreatedInWindow ?? account.bids_created_in_window,
      ),
      activeBidCount: toNumber(account.activeBidCount ?? account.active_bid_count),
      totalBidsCreated: toBigInt(
        account.totalBidsCreated ?? account.total_bids_created,
      ),
      totalBidsAccepted: toBigInt(
        account.totalBidsAccepted ?? account.total_bids_accepted,
      ),
      bump: toNumber(account.bump),
    };
  } catch (error) {
    if (isMissingAccountError(error)) {
      return null;
    }
    throw error;
  }
}

export async function getBidBook(
  program: Program,
  bidBookPda: PublicKey,
): Promise<TaskBidBookAccountState | null> {
  try {
    const account = (await getAccount(program, "taskBidBook").fetch(
      bidBookPda,
    )) as Record<string, unknown>;

    return {
      task: account.task as PublicKey,
      state: parseBidBookState(account.state),
      policy: parseBidBookMatchingPolicy(account.policy),
      weights: parseWeights(account.weights),
      acceptedBid: (account.acceptedBid ?? account.accepted_bid ?? null) as PublicKey | null,
      version: toBigInt(account.version),
      totalBids: toNumber(account.totalBids ?? account.total_bids),
      activeBids: toNumber(account.activeBids ?? account.active_bids),
      createdAt: toNumber(account.createdAt ?? account.created_at),
      updatedAt: toNumber(account.updatedAt ?? account.updated_at),
      bump: toNumber(account.bump),
    };
  } catch (error) {
    if (isMissingAccountError(error)) {
      return null;
    }
    throw error;
  }
}

export async function getBid(
  program: Program,
  bidPda: PublicKey,
): Promise<TaskBidAccountState | null> {
  try {
    const account = (await getAccount(program, "taskBid").fetch(
      bidPda,
    )) as Record<string, unknown>;

    return {
      task: account.task as PublicKey,
      bidBook: (account.bidBook ?? account.bid_book) as PublicKey,
      bidder: account.bidder as PublicKey,
      bidderAuthority: (account.bidderAuthority ??
        account.bidder_authority) as PublicKey,
      requestedRewardLamports: toBigInt(
        account.requestedRewardLamports ?? account.requested_reward_lamports,
      ),
      etaSeconds: toNumber(account.etaSeconds ?? account.eta_seconds),
      confidenceBps: toNumber(account.confidenceBps ?? account.confidence_bps),
      reputationSnapshotBps: toNumber(
        account.reputationSnapshotBps ?? account.reputation_snapshot_bps,
      ),
      qualityGuaranteeHash: toUint8Array(
        account.qualityGuaranteeHash ?? account.quality_guarantee_hash,
      ),
      metadataHash: toUint8Array(account.metadataHash ?? account.metadata_hash),
      expiresAt: toNumber(account.expiresAt ?? account.expires_at),
      createdAt: toNumber(account.createdAt ?? account.created_at),
      updatedAt: toNumber(account.updatedAt ?? account.updated_at),
      state: parseTaskBidState(account.state),
      bondLamports: toBigInt(account.bondLamports ?? account.bond_lamports),
      bump: toNumber(account.bump),
    };
  } catch (error) {
    if (isMissingAccountError(error)) {
      return null;
    }
    throw error;
  }
}
