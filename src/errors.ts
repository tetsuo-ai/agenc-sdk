/**
 * Full AgenC coordination-program error map (6000-6216).
 */

export type ErrorCategory =
  | "agent"
  | "task"
  | "claim"
  | "dispute"
  | "state"
  | "protocol"
  | "general"
  | "rate_limit"
  | "version"
  | "dependency"
  | "nullifier"
  | "cancel"
  | "duplicate"
  | "escrow"
  | "status"
  | "stake"
  | "bond"
  | "reputation"
  | "security"
  | "token"
  | "governance"
  | "skill"
  | "feed";

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
  6000: {
    name: "AgentAlreadyRegistered",
    message: "Agent is already registered",
    category: "agent",
  },
  6001: {
    name: "AgentNotFound",
    message: "Agent not found",
    category: "agent",
  },
  6002: {
    name: "AgentNotActive",
    message: "Agent is not active",
    category: "agent",
  },
  6003: {
    name: "InsufficientCapabilities",
    message: "Agent has insufficient capabilities",
    category: "agent",
  },
  6004: {
    name: "InvalidCapabilities",
    message: "Agent capabilities bitmask cannot be zero",
    category: "agent",
  },
  6005: {
    name: "MaxActiveTasksReached",
    message: "Agent has reached maximum active tasks",
    category: "agent",
  },
  6006: {
    name: "AgentHasActiveTasks",
    message: "Agent has active tasks and cannot be deregistered",
    category: "agent",
  },
  6007: {
    name: "UnauthorizedAgent",
    message: "Only the agent authority can perform this action",
    category: "agent",
  },
  6008: {
    name: "CreatorAuthorityMismatch",
    message: "Creator must match authority to prevent social engineering",
    category: "agent",
  },
  6009: {
    name: "InvalidAgentId",
    message: "Invalid agent ID: agent_id cannot be all zeros",
    category: "agent",
  },
  6010: {
    name: "AgentRegistrationRequired",
    message: "Agent registration required to create tasks",
    category: "agent",
  },
  6011: {
    name: "AgentSuspended",
    message: "Agent is suspended and cannot change status",
    category: "agent",
  },
  6012: {
    name: "AgentBusyWithTasks",
    message: "Agent cannot set status to Active while having active tasks",
    category: "agent",
  },
  6013: {
    name: "TaskNotFound",
    message: "Task not found",
    category: "task",
  },
  6014: {
    name: "TaskNotOpen",
    message: "Task is not open for claims",
    category: "task",
  },
  6015: {
    name: "TaskFullyClaimed",
    message: "Task has reached maximum workers",
    category: "task",
  },
  6016: {
    name: "TaskExpired",
    message: "Task has expired",
    category: "task",
  },
  6017: {
    name: "TaskNotExpired",
    message: "Task deadline has not passed",
    category: "task",
  },
  6018: {
    name: "DeadlinePassed",
    message: "Task deadline has passed",
    category: "task",
  },
  6019: {
    name: "TaskNotInProgress",
    message: "Task is not in progress",
    category: "task",
  },
  6020: {
    name: "TaskAlreadyCompleted",
    message: "Task is already completed",
    category: "task",
  },
  6021: {
    name: "TaskCannotBeCancelled",
    message: "Task cannot be cancelled",
    category: "task",
  },
  6022: {
    name: "UnauthorizedTaskAction",
    message: "Only the task creator can perform this action",
    category: "task",
  },
  6023: {
    name: "InvalidCreator",
    message: "Invalid creator",
    category: "task",
  },
  6024: {
    name: "InvalidTaskId",
    message: "Invalid task ID: cannot be zero",
    category: "task",
  },
  6025: {
    name: "InvalidDescription",
    message: "Invalid description: cannot be empty",
    category: "task",
  },
  6026: {
    name: "InvalidMaxWorkers",
    message: "Invalid max workers: must be between 1 and 100",
    category: "task",
  },
  6027: {
    name: "InvalidTaskType",
    message: "Invalid task type",
    category: "task",
  },
  6028: {
    name: "TaskNotBidExclusive",
    message: "Task is not a Marketplace V2 bid-exclusive task",
    category: "task",
  },
  6029: {
    name: "BidExclusiveRequiresSingleWorker",
    message: "Bid-exclusive tasks must use max_workers = 1",
    category: "task",
  },
  6030: {
    name: "BidTaskSolOnly",
    message: "Marketplace V2 bid tasks are SOL-only in v2",
    category: "task",
  },
  6031: {
    name: "BidTaskRequiresAcceptance",
    message: "Bid-exclusive tasks require bid acceptance and cannot be claimed directly",
    category: "task",
  },
  6032: {
    name: "BidBookNotOpen",
    message: "Bid book is not open",
    category: "task",
  },
  6033: {
    name: "BidBookNotAccepted",
    message: "Bid book is not in accepted state",
    category: "task",
  },
  6034: {
    name: "BidSettlementAccountsRequired",
    message: "Bid settlement accounts are required",
    category: "task",
  },
  6035: {
    name: "BidPriceExceedsTaskBudget",
    message: "Bid price exceeds task budget",
    category: "task",
  },
  6036: {
    name: "InvalidBidExpiry",
    message: "Bid expiry is invalid",
    category: "task",
  },
  6037: {
    name: "InvalidBidEta",
    message: "Bid ETA must be greater than zero",
    category: "task",
  },
  6038: {
    name: "InvalidBidConfidence",
    message: "Bid confidence must be between 0 and 10000 basis points",
    category: "task",
  },
  6039: {
    name: "InvalidMatchingPolicy",
    message: "Invalid matching policy",
    category: "task",
  },
  6040: {
    name: "InvalidWeightedScoreWeights",
    message: "Weighted score weights must sum to 10000 basis points",
    category: "task",
  },
  6041: {
    name: "BidNotActive",
    message: "Bid is not active",
    category: "task",
  },
  6042: {
    name: "BidAlreadyAccepted",
    message: "Bid has already been accepted",
    category: "task",
  },
  6043: {
    name: "BidNotExpired",
    message: "Bid has not expired and bid book is not closed",
    category: "task",
  },
  6044: {
    name: "BidBookCapacityReached",
    message: "Bid book has reached its active bid capacity",
    category: "task",
  },
  6045: {
    name: "InvalidDeadline",
    message: "Invalid deadline: deadline must be greater than zero",
    category: "task",
  },
  6046: {
    name: "InvalidReward",
    message: "Invalid reward: reward must be greater than zero",
    category: "task",
  },
  6047: {
    name: "InvalidRequiredCapabilities",
    message: "Invalid required capabilities: required_capabilities cannot be zero",
    category: "task",
  },
  6048: {
    name: "CompetitiveTaskAlreadyWon",
    message: "Competitive task already completed by another worker",
    category: "task",
  },
  6049: {
    name: "NoWorkers",
    message: "Task has no workers",
    category: "task",
  },
  6050: {
    name: "ConstraintHashMismatch",
    message: "Proof constraint hash does not match task's stored constraint hash",
    category: "task",
  },
  6051: {
    name: "NotPrivateTask",
    message: "Task is not a private task (no constraint hash set)",
    category: "task",
  },
  6052: {
    name: "AlreadyClaimed",
    message: "Worker has already claimed this task",
    category: "claim",
  },
  6053: {
    name: "NotClaimed",
    message: "Worker has not claimed this task",
    category: "claim",
  },
  6054: {
    name: "ClaimAlreadyCompleted",
    message: "Claim has already been completed",
    category: "claim",
  },
  6055: {
    name: "ClaimNotExpired",
    message: "Claim has not expired yet",
    category: "claim",
  },
  6056: {
    name: "ClaimExpired",
    message: "Claim has expired",
    category: "claim",
  },
  6057: {
    name: "InvalidExpiration",
    message: "Invalid expiration: expires_at cannot be zero",
    category: "claim",
  },
  6058: {
    name: "InvalidProof",
    message: "Invalid proof of work",
    category: "claim",
  },
  6059: {
    name: "ZkVerificationFailed",
    message: "ZK proof verification failed",
    category: "claim",
  },
  6060: {
    name: "InvalidSealEncoding",
    message: "Invalid RISC0 seal encoding",
    category: "claim",
  },
  6061: {
    name: "InvalidJournalLength",
    message: "Invalid RISC0 journal length",
    category: "claim",
  },
  6062: {
    name: "InvalidJournalBinding",
    message: "Invalid RISC0 journal binding",
    category: "claim",
  },
  6063: {
    name: "InvalidJournalTask",
    message: "RISC0 journal task binding mismatch",
    category: "claim",
  },
  6064: {
    name: "InvalidJournalAuthority",
    message: "RISC0 journal authority binding mismatch",
    category: "claim",
  },
  6065: {
    name: "InvalidImageId",
    message: "Invalid RISC0 image ID",
    category: "claim",
  },
  6066: {
    name: "TrustedSelectorMismatch",
    message: "RISC0 seal selector does not match trusted selector",
    category: "claim",
  },
  6067: {
    name: "TrustedVerifierProgramMismatch",
    message: "RISC0 verifier program does not match trusted verifier",
    category: "claim",
  },
  6068: {
    name: "RouterAccountMismatch",
    message: "RISC0 router account constraints failed",
    category: "claim",
  },
  6069: {
    name: "InvalidProofSize",
    message: "Invalid proof size - expected 256 bytes for RISC Zero seal body",
    category: "claim",
  },
  6070: {
    name: "InvalidProofBinding",
    message: "Invalid proof binding: expected_binding cannot be all zeros",
    category: "claim",
  },
  6071: {
    name: "InvalidOutputCommitment",
    message: "Invalid output commitment: output_commitment cannot be all zeros",
    category: "claim",
  },
  6072: {
    name: "InvalidRentRecipient",
    message: "Invalid rent recipient: must be worker authority",
    category: "claim",
  },
  6073: {
    name: "GracePeriodNotPassed",
    message: "Grace period not passed: only worker authority can expire claim within 60 seconds of expiry",
    category: "claim",
  },
  6074: {
    name: "InvalidProofHash",
    message: "Invalid proof hash: proof_hash cannot be all zeros",
    category: "claim",
  },
  6075: {
    name: "InvalidResultData",
    message: "Invalid result data: result_data cannot be all zeros when provided",
    category: "claim",
  },
  6076: {
    name: "DisputeNotActive",
    message: "Dispute is not active",
    category: "dispute",
  },
  6077: {
    name: "VotingEnded",
    message: "Voting period has ended",
    category: "dispute",
  },
  6078: {
    name: "VotingNotEnded",
    message: "Voting period has not ended",
    category: "dispute",
  },
  6079: {
    name: "AlreadyVoted",
    message: "Already voted on this dispute",
    category: "dispute",
  },
  6080: {
    name: "NotArbiter",
    message: "Not authorized to vote (not an arbiter)",
    category: "dispute",
  },
  6081: {
    name: "InsufficientVotes",
    message: "Insufficient votes to resolve",
    category: "dispute",
  },
  6082: {
    name: "DisputeAlreadyResolved",
    message: "Dispute has already been resolved",
    category: "dispute",
  },
  6083: {
    name: "UnauthorizedResolver",
    message: "Only protocol authority or dispute initiator can resolve disputes",
    category: "dispute",
  },
  6084: {
    name: "ActiveDisputeVotes",
    message: "Agent has active dispute votes pending resolution",
    category: "dispute",
  },
  6085: {
    name: "RecentVoteActivity",
    message: "Agent must wait 24 hours after voting before deregistering",
    category: "dispute",
  },
  6086: {
    name: "AuthorityAlreadyVoted",
    message: "Authority has already voted on this dispute",
    category: "dispute",
  },
  6087: {
    name: "InsufficientEvidence",
    message: "Insufficient dispute evidence provided",
    category: "dispute",
  },
  6088: {
    name: "EvidenceTooLong",
    message: "Dispute evidence exceeds maximum allowed length",
    category: "dispute",
  },
  6089: {
    name: "DisputeNotExpired",
    message: "Dispute has not expired",
    category: "dispute",
  },
  6090: {
    name: "SlashAlreadyApplied",
    message: "Dispute slashing already applied",
    category: "dispute",
  },
  6091: {
    name: "SlashWindowExpired",
    message: "Slash window expired: must apply slashing within 7 days of resolution",
    category: "dispute",
  },
  6092: {
    name: "DisputeNotResolved",
    message: "Dispute has not been resolved",
    category: "dispute",
  },
  6093: {
    name: "NotTaskParticipant",
    message: "Only task creator or workers can initiate disputes",
    category: "dispute",
  },
  6094: {
    name: "InvalidEvidenceHash",
    message: "Invalid evidence hash: cannot be all zeros",
    category: "dispute",
  },
  6095: {
    name: "ArbiterIsDisputeParticipant",
    message: "Arbiter cannot vote on disputes they are a participant in",
    category: "dispute",
  },
  6096: {
    name: "InsufficientQuorum",
    message: "Insufficient quorum: minimum number of voters not reached",
    category: "dispute",
  },
  6097: {
    name: "ActiveDisputesExist",
    message: "Agent has active disputes as defendant and cannot deregister",
    category: "dispute",
  },
  6098: {
    name: "TooManyDisputeVoters",
    message: "Dispute has reached maximum voter capacity",
    category: "dispute",
  },
  6099: {
    name: "WorkerAgentRequired",
    message: "Worker agent account required when creator initiates dispute",
    category: "dispute",
  },
  6100: {
    name: "WorkerClaimRequired",
    message: "Worker claim account required when creator initiates dispute",
    category: "dispute",
  },
  6101: {
    name: "WorkerNotInDispute",
    message: "Worker was not involved in this dispute",
    category: "dispute",
  },
  6102: {
    name: "InitiatorCannotResolve",
    message: "Dispute initiator cannot resolve their own dispute",
    category: "dispute",
  },
  6103: {
    name: "VersionMismatch",
    message: "State version mismatch (concurrent modification)",
    category: "state",
  },
  6104: {
    name: "StateKeyExists",
    message: "State key already exists",
    category: "state",
  },
  6105: {
    name: "StateNotFound",
    message: "State not found",
    category: "state",
  },
  6106: {
    name: "InvalidStateValue",
    message: "Invalid state value: state_value cannot be all zeros",
    category: "state",
  },
  6107: {
    name: "StateOwnershipViolation",
    message: "State ownership violation: only the creator agent can update this state",
    category: "state",
  },
  6108: {
    name: "InvalidStateKey",
    message: "Invalid state key: state_key cannot be all zeros",
    category: "state",
  },
  6109: {
    name: "ProtocolAlreadyInitialized",
    message: "Protocol is already initialized",
    category: "protocol",
  },
  6110: {
    name: "ProtocolNotInitialized",
    message: "Protocol is not initialized",
    category: "protocol",
  },
  6111: {
    name: "InvalidProtocolFee",
    message: "Invalid protocol fee (must be <= 1000 bps)",
    category: "protocol",
  },
  6112: {
    name: "InvalidTreasury",
    message: "Invalid treasury: treasury account cannot be default pubkey",
    category: "protocol",
  },
  6113: {
    name: "InvalidDisputeThreshold",
    message: "Invalid dispute threshold: must be 1-100 (percentage of votes required)",
    category: "protocol",
  },
  6114: {
    name: "InsufficientStake",
    message: "Insufficient stake for arbiter registration",
    category: "protocol",
  },
  6115: {
    name: "MultisigInvalidThreshold",
    message: "Invalid multisig threshold",
    category: "protocol",
  },
  6116: {
    name: "MultisigInvalidSigners",
    message: "Invalid multisig signer configuration",
    category: "protocol",
  },
  6117: {
    name: "MultisigNotEnoughSigners",
    message: "Not enough multisig signers",
    category: "protocol",
  },
  6118: {
    name: "MultisigDuplicateSigner",
    message: "Duplicate multisig signer provided",
    category: "protocol",
  },
  6119: {
    name: "MultisigDefaultSigner",
    message: "Multisig signer cannot be default pubkey",
    category: "protocol",
  },
  6120: {
    name: "MultisigSignerNotSystemOwned",
    message: "Multisig signer account not owned by System Program",
    category: "protocol",
  },
  6121: {
    name: "InvalidInput",
    message: "Invalid input parameter",
    category: "general",
  },
  6122: {
    name: "ArithmeticOverflow",
    message: "Arithmetic overflow",
    category: "general",
  },
  6123: {
    name: "VoteOverflow",
    message: "Vote count overflow",
    category: "general",
  },
  6124: {
    name: "InsufficientFunds",
    message: "Insufficient funds",
    category: "general",
  },
  6125: {
    name: "RewardTooSmall",
    message: "Reward too small: worker must receive at least 1 lamport",
    category: "general",
  },
  6126: {
    name: "CorruptedData",
    message: "Account data is corrupted",
    category: "general",
  },
  6127: {
    name: "StringTooLong",
    message: "String too long",
    category: "general",
  },
  6128: {
    name: "InvalidAccountOwner",
    message: "Account owner validation failed: account not owned by this program",
    category: "general",
  },
  6129: {
    name: "RateLimitExceeded",
    message: "Rate limit exceeded: maximum actions per 24h window reached",
    category: "rate_limit",
  },
  6130: {
    name: "CooldownNotElapsed",
    message: "Cooldown period has not elapsed since last action",
    category: "rate_limit",
  },
  6131: {
    name: "UpdateTooFrequent",
    message: "Agent update too frequent: must wait cooldown period",
    category: "rate_limit",
  },
  6132: {
    name: "InvalidCooldown",
    message: "Cooldown value cannot be negative",
    category: "rate_limit",
  },
  6133: {
    name: "CooldownTooLarge",
    message: "Cooldown value exceeds maximum (24 hours)",
    category: "rate_limit",
  },
  6134: {
    name: "RateLimitTooHigh",
    message: "Rate limit value exceeds maximum allowed (1000)",
    category: "rate_limit",
  },
  6135: {
    name: "CooldownTooLong",
    message: "Cooldown value exceeds maximum allowed (1 week)",
    category: "rate_limit",
  },
  6136: {
    name: "InsufficientStakeForDispute",
    message: "Insufficient stake to initiate dispute",
    category: "rate_limit",
  },
  6137: {
    name: "InsufficientStakeForCreatorDispute",
    message: "Creator-initiated disputes require 2x the minimum stake",
    category: "rate_limit",
  },
  6138: {
    name: "VersionMismatchProtocol",
    message: "Protocol version mismatch: account version incompatible with current program",
    category: "version",
  },
  6139: {
    name: "AccountVersionTooOld",
    message: "Account version too old: migration required",
    category: "version",
  },
  6140: {
    name: "AccountVersionTooNew",
    message: "Account version too new: program upgrade required",
    category: "version",
  },
  6141: {
    name: "InvalidMigrationSource",
    message: "Migration not allowed: invalid source version",
    category: "version",
  },
  6142: {
    name: "InvalidMigrationTarget",
    message: "Migration not allowed: invalid target version",
    category: "version",
  },
  6143: {
    name: "UnauthorizedUpgrade",
    message: "Only upgrade authority can perform this action",
    category: "version",
  },
  6144: {
    name: "UnauthorizedProtocolAuthority",
    message: "Only protocol authority can perform this action",
    category: "protocol",
  },
  6145: {
    name: "InvalidMinVersion",
    message: "Minimum version cannot exceed current protocol version",
    category: "version",
  },
  6146: {
    name: "ProtocolConfigRequired",
    message: "Protocol config account required: suspending an agent requires the protocol config PDA in remaining_accounts",
    category: "protocol",
  },
  6147: {
    name: "ParentTaskCancelled",
    message: "Parent task has been cancelled",
    category: "dependency",
  },
  6148: {
    name: "ParentTaskDisputed",
    message: "Parent task is in disputed state",
    category: "dependency",
  },
  6149: {
    name: "InvalidDependencyType",
    message: "Invalid dependency type",
    category: "dependency",
  },
  6150: {
    name: "ParentTaskNotCompleted",
    message: "Parent task must be completed before completing a proof-dependent task",
    category: "dependency",
  },
  6151: {
    name: "ParentTaskAccountRequired",
    message: "Parent task account required for proof-dependent task completion",
    category: "dependency",
  },
  6152: {
    name: "UnauthorizedCreator",
    message: "Parent task does not belong to the same creator",
    category: "dependency",
  },
  6153: {
    name: "NullifierAlreadySpent",
    message: "Nullifier has already been spent - proof/knowledge reuse detected",
    category: "nullifier",
  },
  6154: {
    name: "InvalidNullifier",
    message: "Invalid nullifier: nullifier value cannot be all zeros",
    category: "nullifier",
  },
  6155: {
    name: "IncompleteWorkerAccounts",
    message: "All worker accounts must be provided when cancelling a task with active claims",
    category: "cancel",
  },
  6156: {
    name: "WorkerAccountsRequired",
    message: "Worker accounts required when task has active workers",
    category: "cancel",
  },
  6157: {
    name: "DuplicateArbiter",
    message: "Duplicate arbiter provided in remaining_accounts",
    category: "duplicate",
  },
  6158: {
    name: "InsufficientEscrowBalance",
    message: "Escrow has insufficient balance for reward transfer",
    category: "escrow",
  },
  6159: {
    name: "InvalidStatusTransition",
    message: "Invalid task status transition",
    category: "status",
  },
  6160: {
    name: "StakeTooLow",
    message: "Stake value is below minimum required (0.001 SOL)",
    category: "stake",
  },
  6161: {
    name: "InvalidMinStake",
    message: "min_stake_for_dispute must be greater than zero",
    category: "stake",
  },
  6162: {
    name: "InvalidSlashAmount",
    message: "Slash amount must be greater than zero",
    category: "stake",
  },
  6163: {
    name: "BondAmountTooLow",
    message: "Bond amount too low",
    category: "bond",
  },
  6164: {
    name: "BondAlreadyExists",
    message: "Bond already exists",
    category: "bond",
  },
  6165: {
    name: "BondNotFound",
    message: "Bond not found",
    category: "bond",
  },
  6166: {
    name: "BondNotMatured",
    message: "Bond not yet matured",
    category: "bond",
  },
  6167: {
    name: "InsufficientReputation",
    message: "Agent reputation below task minimum requirement",
    category: "reputation",
  },
  6168: {
    name: "InvalidMinReputation",
    message: "Invalid minimum reputation: must be <= 10000",
    category: "reputation",
  },
  6169: {
    name: "DevelopmentKeyNotAllowed",
    message: "Development verifying key detected (gamma == delta). ZK proofs are forgeable. Run MPC ceremony before use.",
    category: "security",
  },
  6170: {
    name: "SelfTaskNotAllowed",
    message: "Cannot claim own task: worker authority matches task creator",
    category: "security",
  },
  6171: {
    name: "MissingTokenAccounts",
    message: "Token accounts not provided for token-denominated task",
    category: "token",
  },
  6172: {
    name: "InvalidTokenEscrow",
    message: "Token escrow ATA does not match expected derivation",
    category: "token",
  },
  6173: {
    name: "InvalidTokenMint",
    message: "Provided mint does not match task's reward_mint",
    category: "token",
  },
  6174: {
    name: "TokenTransferFailed",
    message: "SPL token transfer CPI failed",
    category: "token",
  },
  6175: {
    name: "ProposalNotActive",
    message: "Proposal is not active",
    category: "governance",
  },
  6176: {
    name: "ProposalVotingNotEnded",
    message: "Voting period has not ended",
    category: "governance",
  },
  6177: {
    name: "ProposalVotingEnded",
    message: "Voting period has ended",
    category: "governance",
  },
  6178: {
    name: "ProposalAlreadyExecuted",
    message: "Proposal has already been executed",
    category: "governance",
  },
  6179: {
    name: "ProposalInsufficientQuorum",
    message: "Insufficient quorum for proposal execution",
    category: "governance",
  },
  6180: {
    name: "ProposalNotApproved",
    message: "Proposal did not achieve majority",
    category: "governance",
  },
  6181: {
    name: "ProposalUnauthorizedCancel",
    message: "Only the proposer can cancel this proposal",
    category: "governance",
  },
  6182: {
    name: "ProposalInsufficientStake",
    message: "Insufficient stake to create a proposal",
    category: "governance",
  },
  6183: {
    name: "InvalidProposalPayload",
    message: "Invalid proposal payload",
    category: "governance",
  },
  6184: {
    name: "InvalidProposalType",
    message: "Invalid proposal type",
    category: "governance",
  },
  6185: {
    name: "TreasuryInsufficientBalance",
    message: "Treasury spend amount exceeds available balance",
    category: "governance",
  },
  6186: {
    name: "TimelockNotElapsed",
    message: "Execution timelock has not elapsed",
    category: "governance",
  },
  6187: {
    name: "InvalidGovernanceParam",
    message: "Invalid governance configuration parameter",
    category: "governance",
  },
  6188: {
    name: "TreasuryNotProgramOwned",
    message: "Treasury must be a program-owned PDA",
    category: "governance",
  },
  6189: {
    name: "TreasuryNotSpendable",
    message: "Treasury must be program-owned, or a signer system account for governance spends",
    category: "governance",
  },
  6190: {
    name: "SkillInvalidId",
    message: "Skill ID cannot be all zeros",
    category: "skill",
  },
  6191: {
    name: "SkillInvalidName",
    message: "Skill name cannot be all zeros",
    category: "skill",
  },
  6192: {
    name: "SkillInvalidContentHash",
    message: "Skill content hash cannot be all zeros",
    category: "skill",
  },
  6193: {
    name: "SkillNotActive",
    message: "Skill is not active",
    category: "skill",
  },
  6194: {
    name: "SkillInvalidRating",
    message: "Rating must be between 1 and 5",
    category: "skill",
  },
  6195: {
    name: "SkillSelfRating",
    message: "Cannot rate own skill",
    category: "skill",
  },
  6196: {
    name: "SkillUnauthorizedUpdate",
    message: "Only the skill author can update this skill",
    category: "skill",
  },
  6197: {
    name: "SkillSelfPurchase",
    message: "Cannot purchase own skill",
    category: "skill",
  },
  6198: {
    name: "FeedInvalidContentHash",
    message: "Feed content hash cannot be all zeros",
    category: "feed",
  },
  6199: {
    name: "FeedInvalidTopic",
    message: "Feed topic cannot be all zeros",
    category: "feed",
  },
  6200: {
    name: "FeedPostNotFound",
    message: "Feed post not found",
    category: "feed",
  },
  6201: {
    name: "FeedSelfUpvote",
    message: "Cannot upvote own post",
    category: "feed",
  },
  6202: {
    name: "ReputationStakeAmountTooLow",
    message: "Reputation stake amount must be greater than zero",
    category: "reputation",
  },
  6203: {
    name: "ReputationStakeLocked",
    message: "Reputation stake is locked: withdrawal before cooldown",
    category: "reputation",
  },
  6204: {
    name: "ReputationStakeInsufficientBalance",
    message: "Reputation stake has insufficient balance for withdrawal",
    category: "reputation",
  },
  6205: {
    name: "ReputationDelegationAmountInvalid",
    message: "Reputation delegation amount invalid: must be > 0, <= 10000, and >= MIN_DELEGATION_AMOUNT",
    category: "reputation",
  },
  6206: {
    name: "ReputationCannotDelegateSelf",
    message: "Cannot delegate reputation to self",
    category: "reputation",
  },
  6207: {
    name: "ReputationDelegationExpired",
    message: "Reputation delegation has expired",
    category: "reputation",
  },
  6208: {
    name: "ReputationAgentNotActive",
    message: "Agent must be Active to participate in reputation economy",
    category: "reputation",
  },
  6209: {
    name: "ReputationDisputesPending",
    message: "Agent has pending disputes as defendant: cannot withdraw stake",
    category: "reputation",
  },
  6210: {
    name: "PrivateTaskRequiresZkProof",
    message: "Private tasks (non-zero constraint_hash) must use complete_task_private",
    category: "task",
  },
  6211: {
    name: "InvalidTokenAccountOwner",
    message: "Token account owner does not match expected authority",
    category: "token",
  },
  6212: {
    name: "InsufficientSeedEntropy",
    message: "Binding or nullifier seed has insufficient byte diversity (min 8 distinct bytes required)",
    category: "nullifier",
  },
  6213: {
    name: "SkillPriceBelowMinimum",
    message: "Skill price below minimum required",
    category: "skill",
  },
  6214: {
    name: "SkillPriceChanged",
    message: "Skill price changed since transaction was prepared",
    category: "skill",
  },
  6215: {
    name: "DelegationCooldownNotElapsed",
    message: "Delegation must be active for minimum duration before revocation",
    category: "reputation",
  },
  6216: {
    name: "RateLimitBelowMinimum",
    message: "Rate limit value below protocol minimum",
    category: "rate_limit",
  },
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
      const match = line.match(/Error Number: (\d+)/);
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
    const decimalMatch = err.message.match(/Error Number: (\d+)/);
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
