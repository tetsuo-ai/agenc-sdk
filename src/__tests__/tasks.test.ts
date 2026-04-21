/**
 * Unit tests for TaskState enum, task helper functions, and PDA derivation.
 *
 * These tests verify:
 * 1. TaskState enum values match on-chain TaskStatus
 * 2. formatTaskState() returns correct human-readable strings
 * 3. PDA derivation functions produce deterministic results
 * 4. cancelTask and other task function types are exported
 */

import { describe, it, expect, vi } from "vitest";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  TaskState,
  TaskValidationMode,
  TaskSubmissionStatus,
  formatTaskState,
  deriveTaskPda,
  deriveClaimPda,
  deriveTaskValidationConfigPda,
  deriveTaskJobSpecPda,
  setTaskJobSpec,
  claimTaskWithJobSpec,
  getTaskJobSpec,
  deriveTaskSubmissionPda,
  deriveTaskValidationVotePda,
  deriveEscrowPda,
  deriveAuthorityRateLimitPda,
  calculateEscrowFee,
} from "../tasks";
import { PROGRAM_ID, SEEDS } from "../constants";

describe("TaskState enum", () => {
  describe("enum values match on-chain TaskStatus", () => {
    // Values MUST match programs/agenc-coordination/src/state.rs:TaskStatus
    it("Open equals 0", () => {
      expect(TaskState.Open).toBe(0);
    });

    it("InProgress equals 1", () => {
      expect(TaskState.InProgress).toBe(1);
    });

    it("PendingValidation equals 2", () => {
      expect(TaskState.PendingValidation).toBe(2);
    });

    it("Completed equals 3", () => {
      expect(TaskState.Completed).toBe(3);
    });

    it("Cancelled equals 4", () => {
      expect(TaskState.Cancelled).toBe(4);
    });

    it("Disputed equals 5", () => {
      expect(TaskState.Disputed).toBe(5);
    });
  });

  describe("enum completeness", () => {
    it("has exactly 6 states", () => {
      const numericValues = Object.values(TaskState).filter(
        (v): v is number => typeof v === "number",
      );
      expect(numericValues).toHaveLength(6);
    });

    it("has all expected state names", () => {
      const expectedNames = [
        "Open",
        "InProgress",
        "PendingValidation",
        "Completed",
        "Cancelled",
        "Disputed",
      ];

      for (const name of expectedNames) {
        expect(TaskState[name as keyof typeof TaskState]).toBeDefined();
      }
    });

    it("values are sequential from 0 to 5", () => {
      const numericValues = Object.values(TaskState)
        .filter((v): v is number => typeof v === "number")
        .sort((a, b) => a - b);

      expect(numericValues).toEqual([0, 1, 2, 3, 4, 5]);
    });
  });
});

describe("TaskValidationMode enum", () => {
  it("Auto equals 0", () => {
    expect(TaskValidationMode.Auto).toBe(0);
  });

  it("CreatorReview equals 1", () => {
    expect(TaskValidationMode.CreatorReview).toBe(1);
  });

  it("ValidatorQuorum equals 2", () => {
    expect(TaskValidationMode.ValidatorQuorum).toBe(2);
  });

  it("ExternalAttestation equals 3", () => {
    expect(TaskValidationMode.ExternalAttestation).toBe(3);
  });
});

describe("TaskSubmissionStatus enum", () => {
  it("Idle equals 0", () => {
    expect(TaskSubmissionStatus.Idle).toBe(0);
  });

  it("Submitted equals 1", () => {
    expect(TaskSubmissionStatus.Submitted).toBe(1);
  });

  it("Accepted equals 2", () => {
    expect(TaskSubmissionStatus.Accepted).toBe(2);
  });

  it("Rejected equals 3", () => {
    expect(TaskSubmissionStatus.Rejected).toBe(3);
  });
});

describe("formatTaskState", () => {
  describe("returns correct strings for all states", () => {
    it("formats Open correctly", () => {
      expect(formatTaskState(TaskState.Open)).toBe("Open");
    });

    it("formats InProgress correctly", () => {
      expect(formatTaskState(TaskState.InProgress)).toBe("In Progress");
    });

    it("formats PendingValidation correctly", () => {
      expect(formatTaskState(TaskState.PendingValidation)).toBe(
        "Pending Validation",
      );
    });

    it("formats Completed correctly", () => {
      expect(formatTaskState(TaskState.Completed)).toBe("Completed");
    });

    it("formats Cancelled correctly", () => {
      expect(formatTaskState(TaskState.Cancelled)).toBe("Cancelled");
    });

    it("formats Disputed correctly", () => {
      expect(formatTaskState(TaskState.Disputed)).toBe("Disputed");
    });
  });

  describe("edge cases", () => {
    it("returns Unknown for invalid state value", () => {
      expect(formatTaskState(99 as TaskState)).toBe("Unknown");
    });

    it("returns Unknown for negative state value", () => {
      expect(formatTaskState(-1 as TaskState)).toBe("Unknown");
    });

    it("handles numeric zero correctly (Open)", () => {
      expect(formatTaskState(0 as TaskState)).toBe("Open");
    });
  });
});

describe("PDA derivation", () => {
  describe("deriveTaskPda", () => {
    it('uses correct seeds: ["task", creator, taskId]', () => {
      const creator = Keypair.generate().publicKey;
      const taskId = new Uint8Array(32).fill(1);

      const result = deriveTaskPda(creator, taskId);

      // Verify by computing manually
      const [expected] = PublicKey.findProgramAddressSync(
        [SEEDS.TASK, creator.toBuffer(), taskId],
        PROGRAM_ID,
      );
      expect(result.equals(expected)).toBe(true);
    });

    it("accepts number[] as taskId", () => {
      const creator = Keypair.generate().publicKey;
      const taskId = Array.from(new Uint8Array(32).fill(2));

      // Should not throw
      const result = deriveTaskPda(creator, taskId);
      expect(result).toBeInstanceOf(PublicKey);
    });

    it("is deterministic", () => {
      const creator = Keypair.generate().publicKey;
      const taskId = new Uint8Array(32).fill(3);

      const result1 = deriveTaskPda(creator, taskId);
      const result2 = deriveTaskPda(creator, taskId);
      expect(result1.equals(result2)).toBe(true);
    });

    it("different creators produce different PDAs", () => {
      const creator1 = Keypair.generate().publicKey;
      const creator2 = Keypair.generate().publicKey;
      const taskId = new Uint8Array(32).fill(4);

      const pda1 = deriveTaskPda(creator1, taskId);
      const pda2 = deriveTaskPda(creator2, taskId);
      expect(pda1.equals(pda2)).toBe(false);
    });
  });

  describe("deriveClaimPda", () => {
    it('uses correct seeds: ["claim", taskPda, workerAgentPda]', () => {
      const taskPda = Keypair.generate().publicKey;
      const workerAgentPda = Keypair.generate().publicKey;

      const result = deriveClaimPda(taskPda, workerAgentPda);

      const [expected] = PublicKey.findProgramAddressSync(
        [SEEDS.CLAIM, taskPda.toBuffer(), workerAgentPda.toBuffer()],
        PROGRAM_ID,
      );
      expect(result.equals(expected)).toBe(true);
    });
  });

  describe("deriveEscrowPda", () => {
    it('uses correct seeds: ["escrow", taskPda]', () => {
      const taskPda = Keypair.generate().publicKey;

      const result = deriveEscrowPda(taskPda);

      const [expected] = PublicKey.findProgramAddressSync(
        [SEEDS.ESCROW, taskPda.toBuffer()],
        PROGRAM_ID,
      );
      expect(result.equals(expected)).toBe(true);
    });
  });

  describe("deriveTaskValidationConfigPda", () => {
    it('uses correct seeds: ["task_validation", taskPda]', () => {
      const taskPda = Keypair.generate().publicKey;

      const result = deriveTaskValidationConfigPda(taskPda);

      const [expected] = PublicKey.findProgramAddressSync(
        [SEEDS.TASK_VALIDATION, taskPda.toBuffer()],
        PROGRAM_ID,
      );
      expect(result.equals(expected)).toBe(true);
    });
  });

  describe("deriveTaskSubmissionPda", () => {
    it('uses correct seeds: ["task_submission", claimPda]', () => {
      const claimPda = Keypair.generate().publicKey;

      const result = deriveTaskSubmissionPda(claimPda);

      const [expected] = PublicKey.findProgramAddressSync(
        [SEEDS.TASK_SUBMISSION, claimPda.toBuffer()],
        PROGRAM_ID,
      );
      expect(result.equals(expected)).toBe(true);
    });
  });

  describe("deriveTaskJobSpecPda", () => {
    it('uses correct seeds: ["task_job_spec", taskPda]', () => {
      const taskPda = Keypair.generate().publicKey;

      const result = deriveTaskJobSpecPda(taskPda);

      const [expected] = PublicKey.findProgramAddressSync(
        [SEEDS.TASK_JOB_SPEC, taskPda.toBuffer()],
        PROGRAM_ID,
      );
      expect(result.equals(expected)).toBe(true);
    });
  });

  describe("deriveTaskValidationVotePda", () => {
    it('uses correct seeds: ["task_validation_vote", taskSubmissionPda, reviewer]', () => {
      const taskSubmissionPda = Keypair.generate().publicKey;
      const reviewer = Keypair.generate().publicKey;

      const result = deriveTaskValidationVotePda(taskSubmissionPda, reviewer);

      const [expected] = PublicKey.findProgramAddressSync(
        [
          SEEDS.TASK_VALIDATION_VOTE,
          taskSubmissionPda.toBuffer(),
          reviewer.toBuffer(),
        ],
        PROGRAM_ID,
      );
      expect(result.equals(expected)).toBe(true);
    });
  });

  describe("deriveAuthorityRateLimitPda", () => {
    it('uses correct seeds: ["authority_rate_limit", authority]', () => {
      const authority = Keypair.generate().publicKey;

      const result = deriveAuthorityRateLimitPda(authority);

      const [expected] = PublicKey.findProgramAddressSync(
        [SEEDS.AUTHORITY_RATE_LIMIT, authority.toBuffer()],
        PROGRAM_ID,
      );
      expect(result.equals(expected)).toBe(true);
    });
  });
});

describe("calculateEscrowFee", () => {
  it("calculates basic fee correctly", () => {
    expect(calculateEscrowFee(1000, 1)).toBe(10); // 1% of 1000
  });

  it("returns 0 for zero escrow", () => {
    expect(calculateEscrowFee(0)).toBe(0);
  });

  it("throws for negative escrow", () => {
    expect(() => calculateEscrowFee(-1)).toThrow();
  });

  it("throws for NaN escrow", () => {
    expect(() => calculateEscrowFee(NaN)).toThrow();
  });

  it("throws for overflow escrow", () => {
    expect(() => calculateEscrowFee(Number.MAX_SAFE_INTEGER)).toThrow();
  });
});


describe("task job spec helpers", () => {
  it("sets task job spec metadata with the derived PDA", async () => {
    const creator = Keypair.generate();
    const taskPda = Keypair.generate().publicKey;
    const jobSpecHash = new Uint8Array(32).fill(7);
    const jobSpecUri = "agenc://job-spec/sha256/test";
    const rpc = vi.fn().mockResolvedValue("set-job-spec-tx");
    const signers = vi.fn().mockReturnValue({ rpc });
    const preInstructions = vi.fn().mockReturnValue({ signers });
    const accountsPartial = vi.fn().mockReturnValue({ preInstructions });
    const setTaskJobSpecMethod = vi.fn().mockReturnValue({ accountsPartial });
    const program = {
      programId: PROGRAM_ID,
      methods: { setTaskJobSpec: setTaskJobSpecMethod },
    } as any;
    const connection = {
      confirmTransaction: vi.fn().mockResolvedValue({}),
    } as any;

    const result = await setTaskJobSpec(connection, program, creator, taskPda, {
      jobSpecHash,
      jobSpecUri,
    });

    const expectedPda = deriveTaskJobSpecPda(taskPda);
    expect(result.txSignature).toBe("set-job-spec-tx");
    expect(result.taskJobSpecPda.equals(expectedPda)).toBe(true);
    expect(setTaskJobSpecMethod).toHaveBeenCalledWith(
      Array.from(jobSpecHash),
      jobSpecUri,
    );
    expect(accountsPartial).toHaveBeenCalledWith(
      expect.objectContaining({
        task: taskPda,
        taskJobSpec: expectedPda,
        creator: creator.publicKey,
      }),
    );
    expect(connection.confirmTransaction).toHaveBeenCalledWith(
      "set-job-spec-tx",
      "confirmed",
    );
  });

  it("claims task with the verified task job spec PDA", async () => {
    const worker = Keypair.generate();
    const workerAgentId = new Uint8Array(32).fill(5);
    const taskPda = Keypair.generate().publicKey;
    const rpc = vi.fn().mockResolvedValue("claim-with-job-spec-tx");
    const signers = vi.fn().mockReturnValue({ rpc });
    const preInstructions = vi.fn().mockReturnValue({ signers });
    const accountsPartial = vi.fn().mockReturnValue({ preInstructions });
    const claimTaskWithJobSpecMethod = vi
      .fn()
      .mockReturnValue({ accountsPartial });
    const program = {
      programId: PROGRAM_ID,
      methods: { claimTaskWithJobSpec: claimTaskWithJobSpecMethod },
    } as any;
    const connection = {
      confirmTransaction: vi.fn().mockResolvedValue({}),
    } as any;

    const result = await claimTaskWithJobSpec(
      connection,
      program,
      worker,
      workerAgentId,
      taskPda,
    );

    const expectedTaskJobSpecPda = deriveTaskJobSpecPda(taskPda);
    const [expectedWorkerAgentPda] = PublicKey.findProgramAddressSync(
      [SEEDS.AGENT, workerAgentId],
      PROGRAM_ID,
    );
    const expectedClaimPda = deriveClaimPda(taskPda, expectedWorkerAgentPda);

    expect(result.txSignature).toBe("claim-with-job-spec-tx");
    expect(result.taskJobSpecPda.equals(expectedTaskJobSpecPda)).toBe(true);
    expect(claimTaskWithJobSpecMethod).toHaveBeenCalledOnce();
    expect(accountsPartial).toHaveBeenCalledWith(
      expect.objectContaining({
        task: taskPda,
        taskJobSpec: expectedTaskJobSpecPda,
        claim: expectedClaimPda,
        worker: expectedWorkerAgentPda,
        authority: worker.publicKey,
      }),
    );
    expect(connection.confirmTransaction).toHaveBeenCalledWith(
      "claim-with-job-spec-tx",
      "confirmed",
    );
  });

  it("reads task job spec metadata and normalizes account values", async () => {
    const taskPda = Keypair.generate().publicKey;
    const creator = Keypair.generate().publicKey;
    const hash = new Uint8Array(32).fill(9);
    const fetch = vi.fn().mockResolvedValue({
      task: taskPda,
      creator,
      jobSpecHash: Array.from(hash),
      jobSpecUri: "agenc://job-spec/sha256/read",
      createdAt: { toNumber: () => 11 },
      updatedAt: { toNumber: () => 22 },
      bump: 3,
    });
    const program = {
      programId: PROGRAM_ID,
      account: { taskJobSpec: { fetch } },
    } as any;

    const pointer = await getTaskJobSpec(program, taskPda);

    expect(fetch).toHaveBeenCalledWith(deriveTaskJobSpecPda(taskPda));
    expect(pointer?.task.equals(taskPda)).toBe(true);
    expect(pointer?.creator.equals(creator)).toBe(true);
    expect(pointer?.jobSpecHash).toEqual(hash);
    expect(pointer?.jobSpecUri).toBe("agenc://job-spec/sha256/read");
    expect(pointer?.createdAt).toBe(11);
    expect(pointer?.updatedAt).toBe(22);
    expect(pointer?.bump).toBe(3);
  });

  it("returns null when task job spec metadata account does not exist", async () => {
    const taskPda = Keypair.generate().publicKey;
    const program = {
      programId: PROGRAM_ID,
      account: {
        taskJobSpec: {
          fetch: vi.fn().mockRejectedValue(new Error("Account does not exist")),
        },
      },
    } as any;

    await expect(getTaskJobSpec(program, taskPda)).resolves.toBeNull();
  });
});
