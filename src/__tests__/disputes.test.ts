import { describe, expect, it, vi } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { cancelDispute, deriveDisputePda, deriveVotePda } from "../disputes";
import { PROGRAM_ID, SEEDS } from "../constants";
import { deriveProtocolPda } from "../protocol";

describe("disputes PDA helpers", () => {
  it('deriveDisputePda uses ["dispute", disputeId] seeds', () => {
    const disputeId = new Uint8Array(32).fill(11);
    const pda = deriveDisputePda(disputeId, PROGRAM_ID);

    const [expected] = PublicKey.findProgramAddressSync(
      [SEEDS.DISPUTE, disputeId],
      PROGRAM_ID,
    );

    expect(pda.equals(expected)).toBe(true);
  });

  it('deriveVotePda uses ["vote", disputePda, voterAgentPda] seeds', () => {
    const disputePda = Keypair.generate().publicKey;
    const voterAgentPda = Keypair.generate().publicKey;
    const pda = deriveVotePda(disputePda, voterAgentPda, PROGRAM_ID);

    const [expected] = PublicKey.findProgramAddressSync(
      [SEEDS.VOTE, disputePda.toBuffer(), voterAgentPda.toBuffer()],
      PROGRAM_ID,
    );

    expect(pda.equals(expected)).toBe(true);
  });

  it("cancelDispute passes protocolConfig for launch-control gates", async () => {
    const authority = Keypair.generate();
    const disputePda = Keypair.generate().publicKey;
    const taskPda = Keypair.generate().publicKey;
    const rpc = vi.fn().mockResolvedValue("cancel-dispute-tx");
    const signers = vi.fn().mockReturnValue({ rpc });
    const remainingAccounts = vi.fn().mockReturnValue({ rpc });
    const accountsPartial = vi.fn().mockReturnValue({ signers, remainingAccounts });
    const cancelDisputeMethod = vi.fn().mockReturnValue({ accountsPartial });
    const program = {
      programId: PROGRAM_ID,
      methods: { cancelDispute: cancelDisputeMethod },
    } as any;
    const connection = {
      confirmTransaction: vi.fn().mockResolvedValue({}),
    } as any;

    const result = await cancelDispute(
      connection,
      program,
      authority,
      disputePda,
      taskPda,
    );

    expect(result.txSignature).toBe("cancel-dispute-tx");
    expect(accountsPartial).toHaveBeenCalledWith(
      expect.objectContaining({
        protocolConfig: deriveProtocolPda(PROGRAM_ID),
        dispute: disputePda,
        task: taskPda,
        authority: authority.publicKey,
      }),
    );
    expect(connection.confirmTransaction).toHaveBeenCalledWith(
      "cancel-dispute-tx",
      "confirmed",
    );
  });
});
