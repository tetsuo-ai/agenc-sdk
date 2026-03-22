import { beforeEach, describe, expect, it, vi } from "vitest";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  acceptBid,
  BidBookMatchingPolicy,
  cancelBid,
  createBid,
  deriveBidBookPda,
  deriveBidMarketplacePda,
  deriveBidPda,
  deriveBidderMarketStatePda,
  deriveClaimPda,
  deriveAgentPda,
  getBidBook,
  initializeBidBook,
  initializeBidMarketplace,
  PROGRAM_ID,
} from "../index.js";
import { getAccount } from "../anchor-utils.js";

vi.mock("../anchor-utils.js", () => ({
  getAccount: vi.fn(),
}));

function makeKeypair(seed: number): Keypair {
  const bytes = new Uint8Array(32);
  bytes.fill(seed);
  return Keypair.fromSeed(bytes);
}

function makeAgentId(seed: number): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.fill(seed);
  return bytes;
}

function createPublicKeySeeded(seed: number): PublicKey {
  const bytes = new Uint8Array(32);
  bytes.fill(seed);
  return new PublicKey(bytes);
}

function makeProgram(methodNames: string[], rpcValue: string): unknown {
  const builder = {
    accountsPartial: vi.fn().mockReturnThis(),
    remainingAccounts: vi.fn().mockReturnThis(),
    signers: vi.fn().mockReturnThis(),
    rpc: vi.fn().mockResolvedValue(rpcValue),
  };

  const methods: Record<string, (..._args: unknown[]) => unknown> = {};
  for (const methodName of methodNames) {
    methods[methodName] = vi.fn().mockReturnValue(builder);
  }

  return {
    methods,
    programId: PROGRAM_ID,
  };
}

describe("Marketplace V2 bid SDK contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAccount).mockReset();
  });

  it("builds initializeBidMarketplace with multisig remaining accounts", async () => {
    const connection = { confirmTransaction: vi.fn() } as unknown as Connection;
    const program = makeProgram(
      ["initializeBidMarketplace"],
      "tx-init-bid-marketplace",
    ) as never;
    const signerA = makeKeypair(1);
    const signerB = makeKeypair(2);

    const result = await initializeBidMarketplace(
      connection,
      program as never,
      [signerA, signerB],
      {
        minBidBondLamports: 1_000_000n,
        bidCreationCooldownSecs: 5,
        maxBidsPer24h: 50,
        maxActiveBidsPerTask: 10,
        maxBidLifetimeSecs: 3600,
        acceptedNoShowSlashBps: 2_500,
      },
    );

    expect(result.bidMarketplacePda).toBeInstanceOf(PublicKey);
    expect(result.bidMarketplacePda.equals(deriveBidMarketplacePda(PROGRAM_ID))).toBe(
      true,
    );
    expect(result.txSignature).toBe("tx-init-bid-marketplace");

    const builder = (program as any).methods.initializeBidMarketplace.mock.results[0]
      .value;
    expect(builder.accountsPartial).toHaveBeenCalledWith({
      protocolConfig: expect.any(PublicKey),
      bidMarketplace: deriveBidMarketplacePda(PROGRAM_ID),
      authority: signerA.publicKey,
      systemProgram: SystemProgram.programId,
    });
    expect(builder.remainingAccounts).toHaveBeenCalledWith([
      { pubkey: signerA.publicKey, isSigner: true, isWritable: false },
      { pubkey: signerB.publicKey, isSigner: true, isWritable: false },
    ]);
  });

  it("derives bid PDAs from bidder agent id for createBid", async () => {
    const connection = { confirmTransaction: vi.fn() } as unknown as Connection;
    const program = makeProgram(["createBid"], "tx-create-bid") as never;
    const bidder = makeKeypair(3);
    const taskPda = createPublicKeySeeded(4);
    const bidderAgentId = makeAgentId(5);
    const bidderAgentPda = deriveAgentPda(bidderAgentId, PROGRAM_ID);
    const bidBookPda = deriveBidBookPda(taskPda, PROGRAM_ID);
    const bidPda = deriveBidPda(taskPda, bidderAgentPda, PROGRAM_ID);
    const bidderMarketStatePda = deriveBidderMarketStatePda(
      bidderAgentPda,
      PROGRAM_ID,
    );

    const result = await createBid(connection, program as never, bidder, {
      taskPda,
      bidderAgentId,
      requestedRewardLamports: 7_000_000n,
      etaSeconds: 900,
      confidenceBps: 8_000,
      qualityGuaranteeHash: new Uint8Array(32),
      metadataHash: new Uint8Array(32),
      expiresAt: 1_800_000_000,
    });

    expect(result.bidderAgentPda.equals(bidderAgentPda)).toBe(true);
    expect(result.bidBookPda.equals(bidBookPda)).toBe(true);
    expect(result.bidPda.equals(bidPda)).toBe(true);
    expect(result.bidderMarketStatePda.equals(bidderMarketStatePda)).toBe(true);
    expect(result.txSignature).toBe("tx-create-bid");

    const builder = (program as any).methods.createBid.mock.results[0].value;
    expect(builder.accountsPartial).toHaveBeenCalledWith({
      protocolConfig: expect.any(PublicKey),
      bidMarketplace: deriveBidMarketplacePda(PROGRAM_ID),
      task: taskPda,
      bidBook: bidBookPda,
      bid: bidPda,
      bidderMarketState: bidderMarketStatePda,
      bidder: bidderAgentPda,
      authority: bidder.publicKey,
      systemProgram: SystemProgram.programId,
    });
  });

  it("derives claim PDA from bidder agent for acceptBid", async () => {
    const connection = { confirmTransaction: vi.fn() } as unknown as Connection;
    const program = makeProgram(["acceptBid"], "tx-accept-bid") as never;
    const creator = makeKeypair(6);
    const taskPda = createPublicKeySeeded(7);
    const bidderAgentPda = createPublicKeySeeded(8);
    const expectedClaimPda = deriveClaimPda(taskPda, bidderAgentPda, PROGRAM_ID);

    const result = await acceptBid(connection, program as never, creator, {
      taskPda,
      bidderAgentPda,
    });

    expect(result.claimPda.equals(expectedClaimPda)).toBe(true);
    expect(result.txSignature).toBe("tx-accept-bid");

    const builder = (program as any).methods.acceptBid.mock.results[0].value;
    expect(builder.accountsPartial).toHaveBeenCalledWith({
      task: taskPda,
      claim: expectedClaimPda,
      protocolConfig: expect.any(PublicKey),
      bidBook: deriveBidBookPda(taskPda, PROGRAM_ID),
      bid: deriveBidPda(taskPda, bidderAgentPda, PROGRAM_ID),
      bidderMarketState: deriveBidderMarketStatePda(bidderAgentPda, PROGRAM_ID),
      bidder: bidderAgentPda,
      creator: creator.publicKey,
      systemProgram: SystemProgram.programId,
    });
  });

  it("uses bidder authority signer as cancelBid close recipient", async () => {
    const connection = { confirmTransaction: vi.fn() } as unknown as Connection;
    const program = makeProgram(["cancelBid"], "tx-cancel-bid") as never;
    const bidder = makeKeypair(9);
    const taskPda = createPublicKeySeeded(10);
    const bidderAgentPda = createPublicKeySeeded(11);

    const result = await cancelBid(connection, program as never, bidder, {
      taskPda,
      bidderAgentPda,
    });

    expect(result.txSignature).toBe("tx-cancel-bid");

    const builder = (program as any).methods.cancelBid.mock.results[0].value;
    expect(builder.accountsPartial).toHaveBeenCalledWith({
      task: taskPda,
      bidBook: deriveBidBookPda(taskPda, PROGRAM_ID),
      bid: deriveBidPda(taskPda, bidderAgentPda, PROGRAM_ID),
      bidderMarketState: deriveBidderMarketStatePda(bidderAgentPda, PROGRAM_ID),
      bidder: bidderAgentPda,
      authority: bidder.publicKey,
    });
  });

  it("normalizes fetched bid book state", async () => {
    const bidBookPda = createPublicKeySeeded(12);
    const task = createPublicKeySeeded(13);
    const acceptedBid = createPublicKeySeeded(14);

    vi.mocked(getAccount).mockReturnValueOnce({
      fetch: vi.fn().mockResolvedValue({
        task,
        state: { accepted: {} },
        policy: { weightedScore: {} },
        weights: {
          priceWeightBps: 4_000,
          etaWeightBps: 3_000,
          confidenceWeightBps: 2_000,
          reliabilityWeightBps: 1_000,
        },
        acceptedBid,
        version: 4n,
        totalBids: 5,
        activeBids: 1,
        createdAt: 100,
        updatedAt: 200,
        bump: 255,
      }),
    } as never);

    const result = await getBidBook(
      { account: {}, programId: PROGRAM_ID } as never,
      bidBookPda,
    );

    expect(result).not.toBeNull();
    expect(result?.task.equals(task)).toBe(true);
    expect(result?.acceptedBid?.equals(acceptedBid)).toBe(true);
    expect(result?.state).toBe(1);
    expect(result?.policy).toBe(BidBookMatchingPolicy.WeightedScore);
    expect(result?.weights).toEqual({
      priceWeightBps: 4_000,
      etaWeightBps: 3_000,
      confidenceWeightBps: 2_000,
      reliabilityWeightBps: 1_000,
    });
  });

  it("creates bid book with explicit weighted-score configuration", async () => {
    const connection = { confirmTransaction: vi.fn() } as unknown as Connection;
    const program = makeProgram(["initializeBidBook"], "tx-init-bid-book") as never;
    const creator = makeKeypair(15);
    const taskPda = createPublicKeySeeded(16);

    const result = await initializeBidBook(connection, program as never, creator, {
      taskPda,
      policy: BidBookMatchingPolicy.WeightedScore,
      weights: {
        priceWeightBps: 4_000,
        etaWeightBps: 3_000,
        confidenceWeightBps: 2_000,
        reliabilityWeightBps: 1_000,
      },
    });

    expect(result.bidBookPda.equals(deriveBidBookPda(taskPda, PROGRAM_ID))).toBe(
      true,
    );
    expect(result.txSignature).toBe("tx-init-bid-book");

    const method = (program as any).methods.initializeBidBook;
    expect(method).toHaveBeenCalledWith(2, 4_000, 3_000, 2_000, 1_000);
  });
});
