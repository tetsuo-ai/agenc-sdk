/**
 * Skills module — PDA helpers, instruction wrappers, query helpers, and CU budgets.
 */

import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { type Program } from "@coral-xyz/anchor";
import { AnchorBN } from "./anchor-bn.js";
import { getAccount } from "./anchor-utils.js";
import { PROGRAM_ID, SEEDS } from "./constants.js";
import { deriveProtocolPda } from "./protocol.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "./spl-token.js";
import { toBigInt, toNumber } from "./utils/numeric.js";
import { deriveAgentPdaFromId, toFixedBytes } from "./utils/pda.js";

// ============================================================================
// PDA helpers
// ============================================================================

export function deriveSkillPda(
  authorAgentPda: PublicKey,
  skillId: Uint8Array | Buffer,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  const skillIdBytes = toFixedBytes(skillId, 32, "skillId");
  return PublicKey.findProgramAddressSync(
    [SEEDS.SKILL, authorAgentPda.toBuffer(), Buffer.from(skillIdBytes)],
    programId,
  );
}

export function deriveSkillRatingPda(
  skillPda: PublicKey,
  raterAgentPda: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.SKILL_RATING, skillPda.toBuffer(), raterAgentPda.toBuffer()],
    programId,
  );
}

export function deriveSkillPurchasePda(
  skillPda: PublicKey,
  buyerAgentPda: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.SKILL_PURCHASE, skillPda.toBuffer(), buyerAgentPda.toBuffer()],
    programId,
  );
}

// ============================================================================
// Compute unit budgets
// ============================================================================

/** CU budget for register_skill instruction */
export const RECOMMENDED_CU_REGISTER_SKILL = 50_000;

/** CU budget for update_skill instruction */
export const RECOMMENDED_CU_UPDATE_SKILL = 30_000;

/** CU budget for rate_skill instruction */
export const RECOMMENDED_CU_RATE_SKILL = 40_000;

/** CU budget for purchase_skill instruction (SOL path) */
export const RECOMMENDED_CU_PURCHASE_SKILL = 60_000;

/** CU budget for purchase_skill instruction (SPL token path) */
export const RECOMMENDED_CU_PURCHASE_SKILL_TOKEN = 100_000;

// ============================================================================
// Types
// ============================================================================

export interface RegisterSkillParams {
  skillId: Uint8Array | number[];
  name: Uint8Array | number[];
  contentHash: Uint8Array | number[];
  price: number | bigint;
  priceMint?: PublicKey;
  tags: Uint8Array | number[];
}

export interface UpdateSkillParams {
  contentHash: Uint8Array | number[];
  price: number | bigint;
  tags?: Uint8Array | number[];
  isActive?: boolean;
}

export interface RateSkillParams {
  rating: number;
  reviewHash?: Uint8Array | number[];
}

export interface PurchaseSkillParams {
  skillPda: PublicKey;
  expectedPrice?: number | bigint;
  buyerTokenAccount?: PublicKey;
  authorTokenAccount?: PublicKey;
  treasuryTokenAccount?: PublicKey;
}

export interface SkillState {
  author: PublicKey;
  skillId: Uint8Array;
  name: Uint8Array;
  contentHash: Uint8Array;
  price: bigint;
  priceMint: PublicKey | null;
  tags: Uint8Array;
  totalRating: bigint;
  ratingCount: number;
  downloadCount: number;
  version: number;
  isActive: boolean;
  createdAt: bigint;
  updatedAt: bigint;
  bump: number;
}

export interface SkillRatingState {
  skill: PublicKey;
  rater: PublicKey;
  rating: number;
  reviewHash: Uint8Array | null;
  raterReputation: number;
  timestamp: bigint;
  bump: number;
}

export interface PurchaseRecordState {
  skill: PublicKey;
  buyer: PublicKey;
  pricePaid: bigint;
  timestamp: bigint;
  bump: number;
}

interface SkillPurchaseContext {
  skill: {
    author: PublicKey;
    price: bigint;
    priceMint: PublicKey | null;
  };
  authorAgent: {
    authority: PublicKey;
  };
  protocolConfig: {
    treasury: PublicKey;
  };
}

function parseSkillAccount(account: Record<string, unknown>): SkillState {
  return {
    author: (account.author ?? account.authority) as PublicKey,
    skillId: new Uint8Array(
      (account.skillId ?? account.skill_id ?? []) as number[],
    ),
    name: new Uint8Array((account.name ?? []) as number[]),
    contentHash: new Uint8Array(
      (account.contentHash ?? account.content_hash ?? []) as number[],
    ),
    price: toBigInt(account.price),
    priceMint: (account.priceMint ?? account.price_mint ?? null) as
      | PublicKey
      | null,
    tags: new Uint8Array((account.tags ?? []) as number[]),
    totalRating: toBigInt(account.totalRating ?? account.total_rating),
    ratingCount: toNumber(account.ratingCount ?? account.rating_count),
    downloadCount: toNumber(account.downloadCount ?? account.download_count),
    version: toNumber(account.version),
    isActive: Boolean(account.isActive ?? account.is_active),
    createdAt: toBigInt(account.createdAt ?? account.created_at),
    updatedAt: toBigInt(account.updatedAt ?? account.updated_at),
    bump: toNumber(account.bump),
  };
}

function parseSkillRatingAccount(
  account: Record<string, unknown>,
): SkillRatingState {
  return {
    skill: account.skill as PublicKey,
    rater: account.rater as PublicKey,
    rating: toNumber(account.rating),
    reviewHash: account.reviewHash ?? account.review_hash
      ? new Uint8Array(
          (account.reviewHash ?? account.review_hash) as number[],
        )
      : null,
    raterReputation: toNumber(
      account.raterReputation ?? account.rater_reputation,
    ),
    timestamp: toBigInt(account.timestamp),
    bump: toNumber(account.bump),
  };
}

function parsePurchaseRecordAccount(
  account: Record<string, unknown>,
): PurchaseRecordState {
  return {
    skill: account.skill as PublicKey,
    buyer: account.buyer as PublicKey,
    pricePaid: toBigInt(account.pricePaid ?? account.price_paid),
    timestamp: toBigInt(account.timestamp),
    bump: toNumber(account.bump),
  };
}

function buildSkillTokenAccounts(
  mint: PublicKey | null,
  buyerWallet: PublicKey,
  authorWallet: PublicKey,
  treasury: PublicKey,
  overrides: Pick<
    PurchaseSkillParams,
    "buyerTokenAccount" | "authorTokenAccount" | "treasuryTokenAccount"
  > = {},
): Record<string, PublicKey | null> {
  if (!mint) {
    return {
      priceMint: null,
      buyerTokenAccount: null,
      authorTokenAccount: null,
      treasuryTokenAccount: null,
      tokenProgram: null,
    };
  }

  return {
    priceMint: mint,
    buyerTokenAccount:
      overrides.buyerTokenAccount ??
      getAssociatedTokenAddressSync(mint, buyerWallet),
    authorTokenAccount:
      overrides.authorTokenAccount ??
      getAssociatedTokenAddressSync(mint, authorWallet),
    treasuryTokenAccount:
      overrides.treasuryTokenAccount ??
      getAssociatedTokenAddressSync(mint, treasury),
    tokenProgram: TOKEN_PROGRAM_ID,
  };
}

async function fetchSkillPurchaseContext(
  program: Program,
  skillPda: PublicKey,
  protocolPda: PublicKey,
): Promise<SkillPurchaseContext> {
  const skill = (await getAccount(program, "skillRegistration").fetch(
    skillPda,
  )) as {
    author: PublicKey;
    price: unknown;
    priceMint: PublicKey | null;
  };

  const authorAgent = (await getAccount(program, "agentRegistration").fetch(
    skill.author,
  )) as {
    authority: PublicKey;
  };

  const protocolConfig = (await getAccount(program, "protocolConfig").fetch(
    protocolPda,
  )) as {
    treasury: PublicKey;
  };

  return {
    skill: {
      author: skill.author,
      price: toBigInt(skill.price),
      priceMint: skill.priceMint ?? null,
    },
    authorAgent,
    protocolConfig,
  };
}

// ============================================================================
// Instruction wrappers
// ============================================================================

export async function registerSkill(
  connection: Connection,
  program: Program,
  authority: Keypair,
  authorAgentId: Uint8Array | number[],
  params: RegisterSkillParams,
): Promise<{ skillPda: PublicKey; txSignature: string }> {
  const programId = program.programId;
  const authorAgentPda = deriveAgentPdaFromId(authorAgentId, programId);
  const skillId = toFixedBytes(params.skillId, 32, "skillId");
  const name = toFixedBytes(params.name, 32, "name");
  const contentHash = toFixedBytes(params.contentHash, 32, "contentHash");
  const tags = toFixedBytes(params.tags, 64, "tags");
  const [skillPda] = deriveSkillPda(authorAgentPda, skillId, programId);
  const protocolPda = deriveProtocolPda(programId);

  const tx = await program.methods
    .registerSkill(
      Array.from(skillId),
      Array.from(name),
      Array.from(contentHash),
      new AnchorBN(params.price.toString()),
      params.priceMint ?? null,
      Array.from(tags),
    )
    .accountsPartial({
      skill: skillPda,
      author: authorAgentPda,
      protocolConfig: protocolPda,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: RECOMMENDED_CU_REGISTER_SKILL,
      }),
    ])
    .signers([authority])
    .rpc();

  await connection.confirmTransaction(tx, "confirmed");
  return { skillPda, txSignature: tx };
}

export async function updateSkill(
  connection: Connection,
  program: Program,
  authority: Keypair,
  authorAgentId: Uint8Array | number[],
  skillPda: PublicKey,
  params: UpdateSkillParams,
): Promise<{ txSignature: string }> {
  const programId = program.programId;
  const authorAgentPda = deriveAgentPdaFromId(authorAgentId, programId);
  const protocolPda = deriveProtocolPda(programId);
  const contentHash = toFixedBytes(params.contentHash, 32, "contentHash");
  const tags = params.tags ? Array.from(toFixedBytes(params.tags, 64, "tags")) : null;

  const tx = await program.methods
    .updateSkill(
      Array.from(contentHash),
      new AnchorBN(params.price.toString()),
      tags,
      params.isActive ?? null,
    )
    .accountsPartial({
      skill: skillPda,
      author: authorAgentPda,
      protocolConfig: protocolPda,
      authority: authority.publicKey,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: RECOMMENDED_CU_UPDATE_SKILL,
      }),
    ])
    .signers([authority])
    .rpc();

  await connection.confirmTransaction(tx, "confirmed");
  return { txSignature: tx };
}

export async function rateSkill(
  connection: Connection,
  program: Program,
  authority: Keypair,
  raterAgentId: Uint8Array | number[],
  skillPda: PublicKey,
  params: RateSkillParams,
): Promise<{ ratingPda: PublicKey; txSignature: string }> {
  const programId = program.programId;
  const raterAgentPda = deriveAgentPdaFromId(raterAgentId, programId);
  const [ratingPda] = deriveSkillRatingPda(skillPda, raterAgentPda, programId);
  const [purchaseRecordPda] = deriveSkillPurchasePda(
    skillPda,
    raterAgentPda,
    programId,
  );
  const protocolPda = deriveProtocolPda(programId);
  const reviewHash = params.reviewHash
    ? Array.from(toFixedBytes(params.reviewHash, 32, "reviewHash"))
    : null;

  const tx = await program.methods
    .rateSkill(params.rating, reviewHash)
    .accountsPartial({
      skill: skillPda,
      ratingAccount: ratingPda,
      rater: raterAgentPda,
      purchaseRecord: purchaseRecordPda,
      protocolConfig: protocolPda,
      authority: authority.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: RECOMMENDED_CU_RATE_SKILL,
      }),
    ])
    .signers([authority])
    .rpc();

  await connection.confirmTransaction(tx, "confirmed");
  return { ratingPda, txSignature: tx };
}

export async function purchaseSkill(
  connection: Connection,
  program: Program,
  buyer: Keypair,
  buyerAgentId: Uint8Array | number[],
  params: PurchaseSkillParams,
): Promise<{ purchaseRecordPda: PublicKey; txSignature: string }> {
  const programId = program.programId;
  const buyerAgentPda = deriveAgentPdaFromId(buyerAgentId, programId);
  const [purchaseRecordPda] = deriveSkillPurchasePda(
    params.skillPda,
    buyerAgentPda,
    programId,
  );
  const protocolPda = deriveProtocolPda(programId);
  const context = await fetchSkillPurchaseContext(
    program,
    params.skillPda,
    protocolPda,
  );
  const expectedPrice = params.expectedPrice ?? context.skill.price;
  const tokenAccounts = buildSkillTokenAccounts(
    context.skill.priceMint,
    buyer.publicKey,
    context.authorAgent.authority,
    context.protocolConfig.treasury,
    params,
  );
  const cuLimit = context.skill.priceMint
    ? RECOMMENDED_CU_PURCHASE_SKILL_TOKEN
    : RECOMMENDED_CU_PURCHASE_SKILL;

  const tx = await program.methods
    .purchaseSkill(new AnchorBN(expectedPrice.toString()))
    .accountsPartial({
      skill: params.skillPda,
      purchaseRecord: purchaseRecordPda,
      buyer: buyerAgentPda,
      authorAgent: context.skill.author,
      authorWallet: context.authorAgent.authority,
      protocolConfig: protocolPda,
      treasury: context.protocolConfig.treasury,
      authority: buyer.publicKey,
      systemProgram: SystemProgram.programId,
      ...tokenAccounts,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
    ])
    .signers([buyer])
    .rpc();

  await connection.confirmTransaction(tx, "confirmed");
  return { purchaseRecordPda, txSignature: tx };
}

// ============================================================================
// Query helpers
// ============================================================================

export async function getSkill(
  program: Program,
  skillPda: PublicKey,
): Promise<SkillState | null> {
  try {
    const account = (await getAccount(program, "skillRegistration").fetch(
      skillPda,
    )) as Record<string, unknown>;
    return parseSkillAccount(account);
  } catch {
    return null;
  }
}

export async function getSkillRating(
  program: Program,
  ratingPda: PublicKey,
): Promise<SkillRatingState | null> {
  try {
    const account = (await getAccount(program, "skillRating").fetch(
      ratingPda,
    )) as Record<string, unknown>;
    return parseSkillRatingAccount(account);
  } catch {
    return null;
  }
}

export async function getPurchaseRecord(
  program: Program,
  purchaseRecordPda: PublicKey,
): Promise<PurchaseRecordState | null> {
  try {
    const account = (await getAccount(program, "purchaseRecord").fetch(
      purchaseRecordPda,
    )) as Record<string, unknown>;
    return parsePurchaseRecordAccount(account);
  } catch {
    return null;
  }
}
