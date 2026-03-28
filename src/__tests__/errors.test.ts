import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COORDINATION_ERROR_MAP,
  decodeAnchorError,
  decodeError,
} from "../errors";

const IDL_ERRORS = JSON.parse(
  readFileSync(
    new URL("../../data/coordination-idl-errors.json", import.meta.url),
    "utf8",
  ),
) as Array<{ code: number; name: string; message: string }>;

describe("errors", () => {
  it("matches the committed protocol error snapshot", () => {
    expect(IDL_ERRORS.length).toBeGreaterThan(0);
    expect(IDL_ERRORS[0]?.code).toBe(6000);

    const mapCodes = Object.keys(COORDINATION_ERROR_MAP)
      .map((code) => Number.parseInt(code, 10))
      .sort((left, right) => left - right);

    expect(IDL_ERRORS).toHaveLength(mapCodes.length);
    expect(IDL_ERRORS.at(-1)?.code).toBe(mapCodes.at(-1));
    expect(mapCodes).toEqual(IDL_ERRORS.map((entry) => entry.code));

    for (const entry of IDL_ERRORS) {
      expect(COORDINATION_ERROR_MAP[entry.code]).toMatchObject({
        name: entry.name,
        message: entry.message,
      });
    }
  });

  it("decodeError returns known coordination errors", () => {
    const decoded = decodeError(6000);
    expect(decoded).not.toBeNull();
    expect(decoded?.name).toBe("AgentAlreadyRegistered");
    expect(decoded?.category).toBe("agent");
  });

  it("decodeError returns null for unknown code", () => {
    expect(decodeError(9999)).toBeNull();
  });

  it("decodeAnchorError handles direct Anchor errorCode shape", () => {
    const decoded = decodeAnchorError({ errorCode: { number: 6001 } });
    expect(decoded?.name).toBe("AgentNotFound");
  });

  it("decodeAnchorError handles nested Anchor error shape", () => {
    const decoded = decodeAnchorError({
      error: { errorCode: { number: 6014 } },
    });
    expect(decoded?.name).toBe("TaskNotOpen");
  });

  it("decodeAnchorError handles log/message formats", () => {
    const fromLogs = decodeAnchorError({
      logs: ["Program log: Error Number: 6014"],
    });
    expect(fromLogs?.name).toBe("TaskNotOpen");

    const fromHex = decodeAnchorError({
      message: "custom program error: 0x1770",
    });
    expect(fromHex?.name).toBe("AgentAlreadyRegistered");
  });

  it("decodes protocol InsufficientStake with the current devnet/program IDL code", () => {
    const decoded = decodeAnchorError({
      message:
        "AnchorError thrown in src/instructions/register_agent.rs:69. Error Code: InsufficientStake. Error Number: 6135. Error Message: Insufficient stake for arbiter registration.",
    });

    expect(decoded).not.toBeNull();
    expect(decoded?.name).toBe("InsufficientStake");
    expect(decoded?.message).toBe(
      "Insufficient stake for arbiter registration.",
    );
  });

  it("prefers Anchor's named error over a stale numeric mapping", () => {
    const decoded = decodeAnchorError({
      logs: [
        "Program log: AnchorError thrown in src/instructions/register_agent.rs:69. Error Code: InsufficientStake. Error Number: 6135. Error Message: Insufficient stake for arbiter registration.",
      ],
      message: "custom program error: 0x17f7",
    });

    expect(decoded).not.toBeNull();
    expect(decoded?.code).toBe(6135);
    expect(decoded?.name).toBe("InsufficientStake");
    expect(decoded?.message).toBe("Insufficient stake for arbiter registration.");
  });
});
