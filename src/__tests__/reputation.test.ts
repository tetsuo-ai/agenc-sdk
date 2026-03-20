import { describe, expect, it, vi } from "vitest";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import type { Program } from "@coral-xyz/anchor";
import {
  deriveReputationDelegationPda,
  deriveReputationStakePda,
  stakeReputation,
} from "../reputation";
import { PROGRAM_ID, SEEDS } from "../constants";
import { deriveAgentPdaFromId } from "../utils/pda";

describe("reputation", () => {
  it('deriveReputationStakePda uses ["reputation_stake", agentPda] seeds', () => {
    const agentPda = Keypair.generate().publicKey;
    const [derived] = deriveReputationStakePda(agentPda, PROGRAM_ID);

    const [expected] = PublicKey.findProgramAddressSync(
      [SEEDS.REPUTATION_STAKE, agentPda.toBuffer()],
      PROGRAM_ID,
    );

    expect(derived.equals(expected)).toBe(true);
  });

  it('deriveReputationDelegationPda uses ["reputation_delegation", delegator, delegatee] seeds', () => {
    const delegator = Keypair.generate().publicKey;
    const delegatee = Keypair.generate().publicKey;
    const [derived] = deriveReputationDelegationPda(
      delegator,
      delegatee,
      PROGRAM_ID,
    );

    const [expected] = PublicKey.findProgramAddressSync(
      [SEEDS.REPUTATION_DELEGATION, delegator.toBuffer(), delegatee.toBuffer()],
      PROGRAM_ID,
    );

    expect(derived.equals(expected)).toBe(true);
  });

  it("stakeReputation derives the stake PDA and submits expected accounts", async () => {
    const rpc = vi.fn().mockResolvedValue("tx-signature");
    const signers = vi.fn().mockReturnValue({ rpc });
    const preInstructions = vi.fn().mockReturnValue({ signers });
    const accountsPartial = vi.fn().mockReturnValue({ preInstructions });
    const stakeReputationMethod = vi.fn().mockReturnValue({ accountsPartial });

    const program = {
      programId: PROGRAM_ID,
      methods: {
        stakeReputation: stakeReputationMethod,
      },
    } as unknown as Program;

    const connection = {
      confirmTransaction: vi.fn().mockResolvedValue(undefined),
    } as unknown as Connection;

    const authority = Keypair.generate();
    const agentId = new Uint8Array(32).fill(6);

    const result = await stakeReputation(
      connection,
      program,
      authority,
      agentId,
      1_000_000,
    );

    const agentPda = deriveAgentPdaFromId(agentId, PROGRAM_ID);
    const [expectedStakePda] = deriveReputationStakePda(agentPda, PROGRAM_ID);

    expect(stakeReputationMethod).toHaveBeenCalledOnce();
    expect(stakeReputationMethod.mock.calls[0][0].toString()).toBe("1000000");
    expect(accountsPartial).toHaveBeenCalledWith(
      expect.objectContaining({
        authority: authority.publicKey,
        agent: agentPda,
        reputationStake: expectedStakePda,
        systemProgram: SystemProgram.programId,
      }),
    );
    expect(preInstructions).toHaveBeenCalledOnce();
    expect(result.reputationStakePda.equals(expectedStakePda)).toBe(true);
    expect(result.txSignature).toBe("tx-signature");
  });
});
