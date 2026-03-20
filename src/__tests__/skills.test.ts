import { describe, expect, it, vi } from "vitest";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import type { Program } from "@coral-xyz/anchor";
import { deriveSkillPda, registerSkill } from "../skills";
import { PROGRAM_ID, SEEDS } from "../constants";
import { deriveAgentPdaFromId } from "../utils/pda";

describe("skills", () => {
  it('deriveSkillPda uses ["skill", authorAgentPda, skillId] seeds', () => {
    const authorAgentPda = Keypair.generate().publicKey;
    const skillId = new Uint8Array(32).fill(17);
    const [derived] = deriveSkillPda(authorAgentPda, skillId, PROGRAM_ID);

    const [expected] = PublicKey.findProgramAddressSync(
      [SEEDS.SKILL, authorAgentPda.toBuffer(), skillId],
      PROGRAM_ID,
    );

    expect(derived.equals(expected)).toBe(true);
  });

  it("registerSkill derives the author account, normalizes args, and submits expected accounts", async () => {
    const rpc = vi.fn().mockResolvedValue("tx-signature");
    const signers = vi.fn().mockReturnValue({ rpc });
    const preInstructions = vi.fn().mockReturnValue({ signers });
    const accountsPartial = vi.fn().mockReturnValue({ preInstructions });
    const registerSkillMethod = vi.fn().mockReturnValue({ accountsPartial });

    const program = {
      programId: PROGRAM_ID,
      methods: {
        registerSkill: registerSkillMethod,
      },
    } as unknown as Program;

    const connection = {
      confirmTransaction: vi.fn().mockResolvedValue(undefined),
    } as unknown as Connection;

    const authority = Keypair.generate();
    const authorAgentId = new Uint8Array(32).fill(4);
    const skillId = new Uint8Array(32).fill(8);

    const result = await registerSkill(connection, program, authority, authorAgentId, {
      skillId,
      name: new Uint8Array(32).fill(9),
      contentHash: new Uint8Array(32).fill(10),
      price: 42_000,
      tags: new Uint8Array(64).fill(11),
    });

    const authorAgentPda = deriveAgentPdaFromId(authorAgentId, PROGRAM_ID);
    const [expectedSkillPda] = deriveSkillPda(authorAgentPda, skillId, PROGRAM_ID);

    expect(registerSkillMethod).toHaveBeenCalledOnce();
    const args = registerSkillMethod.mock.calls[0];
    expect(args[0]).toEqual(Array.from(skillId));
    expect(args[3].toString()).toBe("42000");

    expect(accountsPartial).toHaveBeenCalledWith(
      expect.objectContaining({
        skill: expectedSkillPda,
        author: authorAgentPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      }),
    );
    expect(preInstructions).toHaveBeenCalledOnce();
    expect(result.skillPda.equals(expectedSkillPda)).toBe(true);
    expect(result.txSignature).toBe("tx-signature");
  });
});
