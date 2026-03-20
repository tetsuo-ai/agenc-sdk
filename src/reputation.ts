/**
 * Reputation module — PDA helpers, instruction wrappers, query helpers, and CU budgets.
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
import {
  PROGRAM_ID,
  RECOMMENDED_CU_DELEGATE_REPUTATION,
  RECOMMENDED_CU_REVOKE_DELEGATION,
  RECOMMENDED_CU_STAKE_REPUTATION,
  RECOMMENDED_CU_WITHDRAW_REPUTATION_STAKE,
  SEEDS,
} from "./constants.js";
import { deriveAgentPdaFromId } from "./utils/pda.js";
import { toBigInt, toNumber } from "./utils/numeric.js";

export interface DelegateReputationParams {
  amount: number;
  expiresAt?: number | bigint;
}

export interface ReputationStakeState {
  agent: PublicKey;
  stakedAmount: bigint;
  lockedUntil: bigint;
  slashCount: number;
  createdAt: bigint;
  bump: number;
}

export interface ReputationDelegationState {
  delegator: PublicKey;
  delegatee: PublicKey;
  amount: number;
  expiresAt: bigint;
  createdAt: bigint;
  bump: number;
}

export function deriveReputationStakePda(
  agentPda: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.REPUTATION_STAKE, agentPda.toBuffer()],
    programId,
  );
}

export function deriveReputationDelegationPda(
  delegatorAgentPda: PublicKey,
  delegateeAgentPda: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      SEEDS.REPUTATION_DELEGATION,
      delegatorAgentPda.toBuffer(),
      delegateeAgentPda.toBuffer(),
    ],
    programId,
  );
}

export async function stakeReputation(
  connection: Connection,
  program: Program,
  authority: Keypair,
  agentId: Uint8Array | number[],
  amount: number | bigint,
): Promise<{ reputationStakePda: PublicKey; txSignature: string }> {
  const programId = program.programId;
  const agentPda = deriveAgentPdaFromId(agentId, programId);
  const [reputationStakePda] = deriveReputationStakePda(agentPda, programId);

  const tx = await program.methods
    .stakeReputation(new AnchorBN(amount.toString()))
    .accountsPartial({
      authority: authority.publicKey,
      agent: agentPda,
      reputationStake: reputationStakePda,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: RECOMMENDED_CU_STAKE_REPUTATION,
      }),
    ])
    .signers([authority])
    .rpc();

  await connection.confirmTransaction(tx, "confirmed");
  return { reputationStakePda, txSignature: tx };
}

export async function withdrawReputationStake(
  connection: Connection,
  program: Program,
  authority: Keypair,
  agentId: Uint8Array | number[],
  amount: number | bigint,
): Promise<{ txSignature: string }> {
  const programId = program.programId;
  const agentPda = deriveAgentPdaFromId(agentId, programId);
  const [reputationStakePda] = deriveReputationStakePda(agentPda, programId);

  const tx = await program.methods
    .withdrawReputationStake(new AnchorBN(amount.toString()))
    .accountsPartial({
      authority: authority.publicKey,
      agent: agentPda,
      reputationStake: reputationStakePda,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: RECOMMENDED_CU_WITHDRAW_REPUTATION_STAKE,
      }),
    ])
    .signers([authority])
    .rpc();

  await connection.confirmTransaction(tx, "confirmed");
  return { txSignature: tx };
}

export async function delegateReputation(
  connection: Connection,
  program: Program,
  authority: Keypair,
  delegatorAgentId: Uint8Array | number[],
  delegateeAgentId: Uint8Array | number[],
  params: DelegateReputationParams,
): Promise<{ delegationPda: PublicKey; txSignature: string }> {
  const programId = program.programId;
  const delegatorAgentPda = deriveAgentPdaFromId(delegatorAgentId, programId);
  const delegateeAgentPda = deriveAgentPdaFromId(delegateeAgentId, programId);
  const [delegationPda] = deriveReputationDelegationPda(
    delegatorAgentPda,
    delegateeAgentPda,
    programId,
  );

  const tx = await program.methods
    .delegateReputation(
      params.amount,
      new AnchorBN((params.expiresAt ?? 0).toString()),
    )
    .accountsPartial({
      authority: authority.publicKey,
      delegatorAgent: delegatorAgentPda,
      delegateeAgent: delegateeAgentPda,
      delegation: delegationPda,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: RECOMMENDED_CU_DELEGATE_REPUTATION,
      }),
    ])
    .signers([authority])
    .rpc();

  await connection.confirmTransaction(tx, "confirmed");
  return { delegationPda, txSignature: tx };
}

export async function revokeDelegation(
  connection: Connection,
  program: Program,
  authority: Keypair,
  delegatorAgentId: Uint8Array | number[],
  delegateeAgentId: Uint8Array | number[],
): Promise<{ delegationPda: PublicKey; txSignature: string }> {
  const programId = program.programId;
  const delegatorAgentPda = deriveAgentPdaFromId(delegatorAgentId, programId);
  const delegateeAgentPda = deriveAgentPdaFromId(delegateeAgentId, programId);
  const [delegationPda] = deriveReputationDelegationPda(
    delegatorAgentPda,
    delegateeAgentPda,
    programId,
  );

  const tx = await program.methods
    .revokeDelegation()
    .accountsPartial({
      authority: authority.publicKey,
      delegatorAgent: delegatorAgentPda,
      delegation: delegationPda,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: RECOMMENDED_CU_REVOKE_DELEGATION,
      }),
    ])
    .signers([authority])
    .rpc();

  await connection.confirmTransaction(tx, "confirmed");
  return { delegationPda, txSignature: tx };
}

function parseReputationStakeAccount(
  account: Record<string, unknown>,
): ReputationStakeState {
  return {
    agent: account.agent as PublicKey,
    stakedAmount: toBigInt(account.stakedAmount ?? account.staked_amount),
    lockedUntil: toBigInt(account.lockedUntil ?? account.locked_until),
    slashCount: toNumber(account.slashCount ?? account.slash_count),
    createdAt: toBigInt(account.createdAt ?? account.created_at),
    bump: toNumber(account.bump),
  };
}

function parseReputationDelegationAccount(
  account: Record<string, unknown>,
): ReputationDelegationState {
  return {
    delegator: account.delegator as PublicKey,
    delegatee: account.delegatee as PublicKey,
    amount: toNumber(account.amount),
    expiresAt: toBigInt(account.expiresAt ?? account.expires_at),
    createdAt: toBigInt(account.createdAt ?? account.created_at),
    bump: toNumber(account.bump),
  };
}

export async function getReputationStake(
  program: Program,
  reputationStakePda: PublicKey,
): Promise<ReputationStakeState | null> {
  try {
    const account = (await getAccount(program, "reputationStake").fetch(
      reputationStakePda,
    )) as Record<string, unknown>;
    return parseReputationStakeAccount(account);
  } catch {
    return null;
  }
}

export async function getReputationDelegation(
  program: Program,
  delegationPda: PublicKey,
): Promise<ReputationDelegationState | null> {
  try {
    const account = (await getAccount(program, "reputationDelegation").fetch(
      delegationPda,
    )) as Record<string, unknown>;
    return parseReputationDelegationAccount(account);
  } catch {
    return null;
  }
}
