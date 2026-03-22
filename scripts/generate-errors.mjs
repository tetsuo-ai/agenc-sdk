import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const SNAPSHOT_PATH = path.join(ROOT_DIR, "data", "coordination-idl-errors.json");
const OUTPUT_PATH = path.join(ROOT_DIR, "src", "errors.ts");

const ERROR_CATEGORIES = [
  "agent",
  "task",
  "claim",
  "dispute",
  "state",
  "protocol",
  "general",
  "rate_limit",
  "version",
  "dependency",
  "nullifier",
  "cancel",
  "duplicate",
  "escrow",
  "status",
  "stake",
  "bond",
  "reputation",
  "security",
  "token",
  "governance",
  "skill",
  "feed",
];

const CATEGORY_BY_PREFIX = [
  ["Agent", "agent"],
  ["Bid", "task"],
  ["Task", "task"],
  ["Claim", "claim"],
  ["InvalidProof", "claim"],
  ["InvalidBid", "task"],
  ["InvalidJournal", "claim"],
  ["Dispute", "dispute"],
  ["State", "state"],
  ["Protocol", "protocol"],
  ["Multisig", "protocol"],
  ["ParentTask", "dependency"],
  ["Nullifier", "nullifier"],
  ["Bond", "bond"],
  ["Proposal", "governance"],
  ["Treasury", "governance"],
  ["Skill", "skill"],
  ["Feed", "feed"],
  ["Reputation", "reputation"],
  ["Trusted", "claim"],
  ["Cooldown", "rate_limit"],
  ["RateLimit", "rate_limit"],
];

const CATEGORY_BY_NAME = new Map([
  ["InsufficientCapabilities", "agent"],
  ["InvalidCapabilities", "agent"],
  ["MaxActiveTasksReached", "agent"],
  ["UnauthorizedAgent", "agent"],
  ["CreatorAuthorityMismatch", "agent"],
  ["InvalidAgentId", "agent"],
  ["DeadlinePassed", "task"],
  ["UnauthorizedTaskAction", "task"],
  ["InvalidCreator", "task"],
  ["InvalidTaskId", "task"],
  ["InvalidDescription", "task"],
  ["InvalidMaxWorkers", "task"],
  ["InvalidTaskType", "task"],
  ["InvalidDeadline", "task"],
  ["InvalidReward", "task"],
  ["InvalidMatchingPolicy", "task"],
  ["InvalidWeightedScoreWeights", "task"],
  ["InvalidRequiredCapabilities", "task"],
  ["CompetitiveTaskAlreadyWon", "task"],
  ["NoWorkers", "task"],
  ["ConstraintHashMismatch", "task"],
  ["NotPrivateTask", "task"],
  ["PrivateTaskRequiresZkProof", "task"],
  ["AlreadyClaimed", "claim"],
  ["NotClaimed", "claim"],
  ["GracePeriodNotPassed", "claim"],
  ["InvalidExpiration", "claim"],
  ["InvalidProof", "claim"],
  ["ZkVerificationFailed", "claim"],
  ["InvalidSealEncoding", "claim"],
  ["InvalidImageId", "claim"],
  ["InvalidJournalLength", "claim"],
  ["InvalidJournalSenderMismatch", "claim"],
  ["InvalidExpectedSender", "claim"],
  ["TrustedVerifierProgramMismatch", "claim"],
  ["RouterAccountMismatch", "claim"],
  ["InvalidOutputCommitment", "claim"],
  ["InvalidRentRecipient", "claim"],
  ["InvalidProofHash", "claim"],
  ["InvalidResultData", "claim"],
  ["VotingEnded", "dispute"],
  ["VotingNotEnded", "dispute"],
  ["AlreadyVoted", "dispute"],
  ["NotArbiter", "dispute"],
  ["InsufficientVotes", "dispute"],
  ["ActiveDisputeVotes", "dispute"],
  ["RecentVoteActivity", "dispute"],
  ["AuthorityAlreadyVoted", "dispute"],
  ["UnauthorizedResolver", "dispute"],
  ["InsufficientEvidence", "dispute"],
  ["EvidenceTooLong", "dispute"],
  ["SlashAlreadyApplied", "dispute"],
  ["SlashWindowExpired", "dispute"],
  ["NotTaskParticipant", "dispute"],
  ["InvalidEvidenceHash", "dispute"],
  ["ArbiterIsDisputeParticipant", "dispute"],
  ["InsufficientQuorum", "dispute"],
  ["ActiveDisputesExist", "dispute"],
  ["WorkerAgentRequired", "dispute"],
  ["WorkerClaimRequired", "dispute"],
  ["WorkerNotInDispute", "dispute"],
  ["InitiatorCannotResolve", "dispute"],
  ["TooManyDisputeVoters", "dispute"],
  ["VersionMismatch", "state"],
  ["InvalidStateValue", "state"],
  ["InvalidStateKey", "state"],
  ["InvalidInput", "general"],
  ["ArithmeticOverflow", "general"],
  ["VoteOverflow", "general"],
  ["InsufficientFunds", "general"],
  ["RewardTooSmall", "general"],
  ["CorruptedData", "general"],
  ["StringTooLong", "general"],
  ["InvalidAccountOwner", "general"],
  ["UpdateTooFrequent", "rate_limit"],
  ["InvalidCooldown", "rate_limit"],
  ["InsufficientStakeForDispute", "rate_limit"],
  ["InsufficientStakeForCreatorDispute", "rate_limit"],
  ["VersionMismatchProtocol", "version"],
  ["AccountVersionTooOld", "version"],
  ["AccountVersionTooNew", "version"],
  ["InvalidMigrationSource", "version"],
  ["InvalidMigrationTarget", "version"],
  ["UnauthorizedUpgrade", "version"],
  ["InvalidMinVersion", "version"],
  ["InvalidDependencyType", "dependency"],
  ["UnauthorizedCreator", "dependency"],
  ["InvalidNullifier", "nullifier"],
  ["InsufficientSeedEntropy", "nullifier"],
  ["IncompleteWorkerAccounts", "cancel"],
  ["WorkerAccountsRequired", "cancel"],
  ["DuplicateArbiter", "duplicate"],
  ["InsufficientEscrowBalance", "escrow"],
  ["InvalidStatusTransition", "status"],
  ["InsufficientStake", "protocol"],
  ["InvalidProtocolFee", "protocol"],
  ["InvalidDisputeThreshold", "protocol"],
  ["InvalidTreasury", "protocol"],
  ["UnauthorizedProtocolAuthority", "protocol"],
  ["StakeTooLow", "stake"],
  ["InvalidMinStake", "stake"],
  ["InvalidSlashAmount", "stake"],
  ["InsufficientReputation", "reputation"],
  ["InvalidMinReputation", "reputation"],
  ["DelegationCooldownNotElapsed", "reputation"],
  ["DevelopmentKeyNotAllowed", "security"],
  ["SelfTaskNotAllowed", "security"],
  ["MissingTokenAccounts", "token"],
  ["InvalidTokenEscrow", "token"],
  ["InvalidTokenMint", "token"],
  ["TokenTransferFailed", "token"],
  ["InvalidTokenAccountOwner", "token"],
  ["TimelockNotElapsed", "governance"],
  ["InvalidProposalPayload", "governance"],
  ["InvalidProposalType", "governance"],
  ["InvalidGovernanceParam", "governance"],
]);

function parseArgs(argv) {
  const args = {
    check: false,
    idlPath: process.env.AGENC_IDL_PATH ?? null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      args.check = true;
      continue;
    }

    if (arg === "--idl") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--idl requires a file path");
      }
      args.idlPath = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeErrors(rawErrors) {
  if (!Array.isArray(rawErrors) || rawErrors.length === 0) {
    throw new Error("No IDL errors were found");
  }

  const normalized = rawErrors.map((entry) => {
    const code = entry?.code;
    const name = entry?.name;
    const message = entry?.message ?? entry?.msg;

    if (!Number.isInteger(code)) {
      throw new Error(`Invalid error code: ${JSON.stringify(entry)}`);
    }

    if (typeof name !== "string" || name.length === 0) {
      throw new Error(`Invalid error name: ${JSON.stringify(entry)}`);
    }

    if (typeof message !== "string" || message.length === 0) {
      throw new Error(`Invalid error message: ${JSON.stringify(entry)}`);
    }

    return { code, name, message };
  });

  normalized.sort((left, right) => left.code - right.code);

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1].code === normalized[index].code) {
      throw new Error(`Duplicate error code ${normalized[index].code}`);
    }
  }

  return normalized;
}

function loadErrors(idlPath) {
  if (idlPath) {
    const idl = readJson(path.resolve(idlPath));
    return normalizeErrors(idl.errors);
  }

  if (!fs.existsSync(SNAPSHOT_PATH)) {
    throw new Error(
      `Missing ${SNAPSHOT_PATH}. Re-run with AGENC_IDL_PATH or --idl to seed the snapshot.`,
    );
  }

  return normalizeErrors(readJson(SNAPSHOT_PATH));
}

function categorizeError(name) {
  const directCategory = CATEGORY_BY_NAME.get(name);
  if (directCategory) {
    return directCategory;
  }

  for (const [prefix, category] of CATEGORY_BY_PREFIX) {
    if (name.startsWith(prefix)) {
      return category;
    }
  }

  throw new Error(`No category rule for ${name}`);
}

function renderErrorEntry(error) {
  const category = categorizeError(error.name);
  return `  ${error.code}: {\n    name: ${JSON.stringify(error.name)},\n    message: ${JSON.stringify(error.message)},\n    category: ${JSON.stringify(category)},\n  },`;
}

function renderErrorsFile(errors) {
  const minCode = errors[0].code;
  const maxCode = errors[errors.length - 1].code;
  const renderedEntries = errors.map(renderErrorEntry).join("\n");
  const renderedCategories = ERROR_CATEGORIES.map(
    (category) => `  | ${JSON.stringify(category)}`,
  ).join("\n");

  return `/**
 * Full AgenC coordination-program error map (${minCode}-${maxCode}).
 */

export type ErrorCategory =
${renderedCategories};

export interface CoordinationErrorEntry {
  name: string;
  message: string;
  category: ErrorCategory;
}

/**
 * Complete mapping of on-chain error codes to typed metadata.
 * Generated from data/coordination-idl-errors.json.
 * Refresh with AGENC_IDL_PATH=/absolute/path/to/agenc_coordination.json node scripts/generate-errors.mjs
 */
export const COORDINATION_ERROR_MAP: Record<number, CoordinationErrorEntry> = {
${renderedEntries}
};

export interface DecodedError extends CoordinationErrorEntry {
  code: number;
}

/**
 * Decode a numeric Anchor error code.
 */
export function decodeError(code: number): DecodedError | null {
  const entry = COORDINATION_ERROR_MAP[code];
  if (!entry) return null;
  return { code, ...entry };
}

function extractCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;

  const err = error as Record<string, unknown>;

  if (typeof err.code === "number") {
    return err.code;
  }

  const directErrorCode = err.errorCode as Record<string, unknown> | undefined;
  if (directErrorCode && typeof directErrorCode.number === "number") {
    return directErrorCode.number;
  }

  const nested = err.error as Record<string, unknown> | undefined;
  const nestedErrorCode = nested?.errorCode as
    | Record<string, unknown>
    | undefined;
  if (nestedErrorCode && typeof nestedErrorCode.number === "number") {
    return nestedErrorCode.number;
  }

  if (Array.isArray(err.logs)) {
    for (const line of err.logs) {
      if (typeof line !== "string") continue;
      const match = line.match(/Error Number: (\\d+)/);
      if (match) return Number.parseInt(match[1], 10);
    }
  }

  if (typeof err.message === "string") {
    const hexMatch = err.message.match(
      /custom program error: 0x([0-9a-fA-F]+)/,
    );
    if (hexMatch) {
      return Number.parseInt(hexMatch[1], 16);
    }
    const decimalMatch = err.message.match(/Error Number: (\\d+)/);
    if (decimalMatch) {
      return Number.parseInt(decimalMatch[1], 10);
    }
  }

  return null;
}

/**
 * Decode common Anchor error object shapes.
 */
export function decodeAnchorError(error: unknown): DecodedError | null {
  const code = extractCode(error);
  if (code === null) return null;
  return decodeError(code);
}
`;
}

function ensureTrailingNewline(content) {
  return content.endsWith("\n") ? content : `${content}\n`;
}

function writeIfChanged(filePath, content) {
  const normalized = ensureTrailingNewline(content);
  if (fs.existsSync(filePath)) {
    const current = fs.readFileSync(filePath, "utf8");
    if (current === normalized) {
      return false;
    }
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, normalized);
  return true;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const errors = loadErrors(args.idlPath);
  const snapshotContent = JSON.stringify(errors, null, 2);
  const errorsFileContent = renderErrorsFile(errors);

  if (args.check) {
    const expectedSnapshot = ensureTrailingNewline(snapshotContent);
    const expectedErrorsFile = ensureTrailingNewline(errorsFileContent);
    const currentSnapshot = fs.existsSync(SNAPSHOT_PATH)
      ? fs.readFileSync(SNAPSHOT_PATH, "utf8")
      : null;
    const currentErrorsFile = fs.existsSync(OUTPUT_PATH)
      ? fs.readFileSync(OUTPUT_PATH, "utf8")
      : null;

    if (currentSnapshot !== expectedSnapshot) {
      throw new Error(
        "coordination-idl-errors.json is out of date. Re-run node scripts/generate-errors.mjs",
      );
    }

    if (currentErrorsFile !== expectedErrorsFile) {
      throw new Error(
        "src/errors.ts is out of date. Re-run node scripts/generate-errors.mjs",
      );
    }

    return;
  }

  writeIfChanged(SNAPSHOT_PATH, snapshotContent);
  writeIfChanged(OUTPUT_PATH, errorsFileContent);
}

main();
