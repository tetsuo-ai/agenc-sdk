#!/usr/bin/env node

import process from "node:process";
import { PublicKey } from "@solana/web3.js";
import * as sdk from "../dist/index.mjs";
import {
  DEFAULT_AGENT_ENDPOINT,
  ensureBalance,
  ensureDistinctWallets,
  env,
  fixedUtf8Bytes,
  formatUnix,
  getFlagValue,
  hasFlag,
  lamportsToSol,
  loadPrograms,
  optionalEnv,
  randomBytes32,
  readArtifact,
  resolveIdlPath,
  sha256Bytes,
  toBigIntValue,
  toNumberValue,
  waitUntilUnix,
  writeArtifact,
} from "./devnet-helpers.mjs";

const DEFAULT_RPC_URL = process.env.AGENC_RPC_URL ?? sdk.DEVNET_RPC;
const DEFAULT_MAX_WAIT_SECONDS = 90;
const DEFAULT_PROPOSAL_VOTING_SECONDS = 30;
const DEFAULT_INIT_EXECUTION_DELAY_SECONDS = 15;
const DEFAULT_INIT_QUORUM_BPS = 2_000;
const DEFAULT_INIT_APPROVAL_THRESHOLD_BPS = 5_001;
const CAP_COMPUTE = 1n;
const DEFAULT_STAKE_FEE_BUFFER_LAMPORTS = 10_000_000n;
const INITIAL_AGENT_REPUTATION = 5_000n;
const MAX_REPUTATION = 10_000n;
const MIN_QUORUM_FACTOR = 2n;
const MAX_VOTE_WEIGHT_MULTIPLIER = 10n;

function usage() {
  process.stdout.write(`Usage:
  PROPOSER_WALLET=/path/to/proposer.json \\
  VOTER_A_WALLET=/path/to/voter-a.json \\
  VOTER_B_WALLET=/path/to/voter-b.json \\
  VOTER_C_WALLET=/path/to/voter-c.json \\
  [VOTER_D_WALLET=/path/to/voter-d.json] \\
  [PROTOCOL_AUTHORITY_WALLET=/path/to/authority.json] \\
  npm run test:devnet:governance

  EXECUTOR_WALLET=/path/to/executor.json npm run test:devnet:governance -- --resume /tmp/agenc-sdk-devnet/governance-....json

Environment:
  PROPOSER_WALLET                    Required for initial run.
  VOTER_A_WALLET                     Required for initial run.
  VOTER_B_WALLET                     Required for initial run.
  VOTER_C_WALLET                     Required for initial run.
  VOTER_D_WALLET                     Optional fourth voter for higher shared-devnet quorum.
  PROTOCOL_AUTHORITY_WALLET          Optional if governance already exists. Required to initialize governance if absent.
  EXECUTOR_WALLET                    Optional for resume. Falls back to PROPOSER_WALLET.
  AGENC_RPC_URL                      Optional. Defaults to ${DEFAULT_RPC_URL}
  AGENC_IDL_PATH                     Required for initial run. Optional on --resume if stored in the artifact.
  AGENC_MAX_WAIT_SECONDS             Optional. Defaults to ${DEFAULT_MAX_WAIT_SECONDS}
  AGENC_GOVERNANCE_VOTING_SECONDS    Optional. Defaults to ${DEFAULT_PROPOSAL_VOTING_SECONDS}

What this validates:
  1. Reuses governance config if present, or initializes it with protocol authority
  2. Registers proposer and voter agents
  3. Creates a fee-change proposal
  4. Casts governance votes
  5. Executes the proposal immediately when timing allows
  6. Otherwise writes a resume artifact for later execution
`);
}

function normalizeGovernanceConfig(raw) {
  return {
    authority: raw.authority,
    minProposalStake: toBigIntValue(
      raw.minProposalStake ?? raw.min_proposal_stake,
    ),
    votingPeriod: toNumberValue(raw.votingPeriod ?? raw.voting_period),
    executionDelay: toNumberValue(raw.executionDelay ?? raw.execution_delay),
    quorumBps: toNumberValue(raw.quorumBps ?? raw.quorum_bps),
    approvalThresholdBps: toNumberValue(
      raw.approvalThresholdBps ?? raw.approval_threshold_bps,
    ),
  };
}

async function fetchGovernanceConfig(connection, program) {
  const [governancePda] = sdk.deriveGovernanceConfigPda(program.programId);
  const info = await connection.getAccountInfo(governancePda, "confirmed");
  if (!info) {
    return null;
  }

  const raw = await program.account.governanceConfig.fetch(governancePda);
  return {
    governancePda,
    ...normalizeGovernanceConfig(raw),
  };
}

async function fetchRawProtocolConfig(program) {
  const protocolPda = sdk.deriveProtocolPda(program.programId);
  const raw = await program.account.protocolConfig.fetch(protocolPda);

  return {
    protocolPda,
    minAgentStake: toBigIntValue(
      raw.minAgentStake ?? raw.min_agent_stake,
    ),
    minArbiterStake: toBigIntValue(
      raw.minArbiterStake ?? raw.min_arbiter_stake,
    ),
    totalAgents: toBigIntValue(raw.totalAgents ?? raw.total_agents),
  };
}

function computeVoteWeight(stakeAmount, minArbiterStake) {
  const maxVoteStake = minArbiterStake * MAX_VOTE_WEIGHT_MULTIPLIER;
  const cappedStake = stakeAmount > maxVoteStake ? maxVoteStake : stakeAmount;
  if (cappedStake <= 0n) {
    return 0n;
  }

  const weighted =
    (cappedStake * INITIAL_AGENT_REPUTATION) / MAX_REPUTATION;
  return weighted > 0n ? weighted : 1n;
}

function computeStakePlan({
  governance,
  rawProtocol,
  participantCount,
  maxAffordableStake,
}) {
  const participants = BigInt(participantCount);
  const expectedTotalAgents = rawProtocol.totalAgents + participants;
  const computedQuorumFactor =
    (expectedTotalAgents * BigInt(governance.quorumBps)) / 10_000n;
  const quorumFactor =
    computedQuorumFactor > MIN_QUORUM_FACTOR
      ? computedQuorumFactor
      : MIN_QUORUM_FACTOR;
  const requiredVoteWeight = governance.minProposalStake * quorumFactor;
  const maxStakePerParticipant =
    rawProtocol.minArbiterStake * MAX_VOTE_WEIGHT_MULTIPLIER;
  const highestSearchStake =
    maxAffordableStake < maxStakePerParticipant
      ? maxAffordableStake
      : maxStakePerParticipant;

  if (highestSearchStake < governance.minProposalStake) {
    throw new Error(
      `Largest affordable stake ${highestSearchStake} is below governance minimum ${governance.minProposalStake}.`,
    );
  }

  const maxVoteWeightPerParticipant = computeVoteWeight(
    highestSearchStake,
    rawProtocol.minArbiterStake,
  );
  const maxTotalVoteWeight = maxVoteWeightPerParticipant * participants;

  if (maxTotalVoteWeight < requiredVoteWeight) {
    throw new Error(
      `Shared-devnet quorum needs ${requiredVoteWeight} vote weight, but ${participantCount} participant(s) can only provide ${maxTotalVoteWeight}. Add another voter or fund wallets further.`,
    );
  }

  let low = governance.minProposalStake;
  let high = highestSearchStake;

  while (low < high) {
    const mid = (low + high) / 2n;
    const totalVoteWeight =
      computeVoteWeight(mid, rawProtocol.minArbiterStake) * participants;

    if (totalVoteWeight >= requiredVoteWeight) {
      high = mid;
    } else {
      low = mid + 1n;
    }
  }

  return {
    expectedTotalAgents,
    quorumFactor,
    requiredVoteWeight,
    stakePerParticipant: low,
    voteWeightPerParticipant: computeVoteWeight(
      low,
      rawProtocol.minArbiterStake,
    ),
    maxTotalVoteWeight,
    maxStakePerParticipant,
  };
}

function buildFeeChangePayload(newFeeBps) {
  const payload = Buffer.alloc(64);
  payload.writeUInt16LE(newFeeBps, 0);
  return payload;
}

async function maybeDeregister(connection, program, authority, agentId, label) {
  try {
    const { txSignature } = await sdk.deregisterAgent(
      connection,
      program,
      authority,
      agentId,
    );
    console.log(`[cleanup] ${label} deregistered: ${txSignature}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[cleanup] could not deregister ${label}: ${message}`);
  }
}

async function resume() {
  const resumePath = getFlagValue("--resume");
  if (!resumePath) {
    throw new Error("Missing resume artifact path. Use --resume /path/to/file.json");
  }

  const executorWalletPath =
    optionalEnv("EXECUTOR_WALLET") ?? optionalEnv("PROPOSER_WALLET");
  if (!executorWalletPath) {
    throw new Error(
      "Set EXECUTOR_WALLET or PROPOSER_WALLET to resume governance execution.",
    );
  }

  const artifact = await readArtifact(resumePath);
  const rpcUrl = process.env.AGENC_RPC_URL ?? artifact.rpcUrl ?? DEFAULT_RPC_URL;
  const idlPath = resolveIdlPath(artifact.idlPath ?? null);

  console.log(`[resume] artifact: ${resumePath}`);
  console.log(`[resume] rpc: ${rpcUrl}`);
  console.log(`[resume] idl path: ${idlPath}`);
  console.log(`[resume] executor wallet: ${executorWalletPath}`);

  const { connection, keypairs, programs } = await loadPrograms({
    rpcUrl,
    idlPath,
    wallets: {
      executor: executorWalletPath,
    },
  });

  const executor = keypairs.executor;
  const executorProgram = programs.executor;
  const proposalPda = new PublicKey(artifact.proposalPda);
  const proposalBefore = await sdk.getProposal(executorProgram, proposalPda);
  if (!proposalBefore) {
    throw new Error(`Proposal ${artifact.proposalPda} no longer exists.`);
  }

  const executionAfter = proposalBefore.executionAfter;
  if (Date.now() / 1000 < executionAfter) {
    console.log(
      `[resume] proposal still locked until ${formatUnix(executionAfter)}. Re-run after that time.`,
    );
    return;
  }

  const executed = await sdk.executeProposal(
    connection,
    executorProgram,
    executor,
    proposalPda,
  );
  console.log(`[resume] proposal execution tx: ${executed.txSignature}`);

  const proposalAfter = await sdk.getProposal(executorProgram, proposalPda);
  if (!proposalAfter) {
    throw new Error("Proposal could not be fetched after execution.");
  }

  console.log(
    `[result] status=${proposalAfter.status} votesFor=${proposalAfter.votesFor.toString()} votesAgainst=${proposalAfter.votesAgainst.toString()} totalVoters=${proposalAfter.totalVoters}`,
  );
}

async function initial() {
  const proposerWalletPath = env("PROPOSER_WALLET");
  const voterAWalletPath = env("VOTER_A_WALLET");
  const voterBWalletPath = env("VOTER_B_WALLET");
  const voterCWalletPath = env("VOTER_C_WALLET");
  const voterDWalletPath = optionalEnv("VOTER_D_WALLET");
  const authorityWalletPath = optionalEnv("PROTOCOL_AUTHORITY_WALLET");
  const rpcUrl = process.env.AGENC_RPC_URL ?? DEFAULT_RPC_URL;
  const idlPath = resolveIdlPath();
  const maxWaitSeconds = Number(
    process.env.AGENC_MAX_WAIT_SECONDS ?? DEFAULT_MAX_WAIT_SECONDS,
  );
  const proposalVotingSeconds = Number(
    process.env.AGENC_GOVERNANCE_VOTING_SECONDS ??
      DEFAULT_PROPOSAL_VOTING_SECONDS,
  );

  console.log(`[config] rpc: ${rpcUrl}`);
  console.log(`[config] idl path: ${idlPath}`);
  console.log(`[config] proposer wallet: ${proposerWalletPath}`);
  console.log(`[config] voter A wallet: ${voterAWalletPath}`);
  console.log(`[config] voter B wallet: ${voterBWalletPath}`);
  console.log(`[config] voter C wallet: ${voterCWalletPath}`);
  console.log(`[config] voter D wallet: ${voterDWalletPath ?? "(not set)"}`);
  console.log(
    `[config] protocol authority wallet: ${authorityWalletPath ?? "(not set)"}`,
  );
  console.log(`[config] max wait seconds: ${maxWaitSeconds}`);

  const { connection, keypairs, programs } = await loadPrograms({
    rpcUrl,
    idlPath,
    wallets: {
      proposer: proposerWalletPath,
      voterA: voterAWalletPath,
      voterB: voterBWalletPath,
      voterC: voterCWalletPath,
      voterD: voterDWalletPath,
      authority: authorityWalletPath,
    },
  });

  ensureDistinctWallets(keypairs);

  const proposer = keypairs.proposer;
  const voterA = keypairs.voterA;
  const voterB = keypairs.voterB;
  const voterC = keypairs.voterC;
  const voterD = keypairs.voterD ?? null;
  const authority = keypairs.authority ?? null;
  const proposerProgram = programs.proposer;
  const voterAProgram = programs.voterA;
  const voterBProgram = programs.voterB;
  const voterCProgram = programs.voterC;
  const voterDProgram = programs.voterD ?? null;
  const authorityProgram = programs.authority ?? null;

  const protocolConfig = await sdk.getProtocolConfig(proposerProgram);
  if (!protocolConfig) {
    throw new Error("Protocol config PDA could not be fetched from devnet.");
  }
  const rawProtocolConfig = await fetchRawProtocolConfig(proposerProgram);

  let governance = await fetchGovernanceConfig(connection, proposerProgram);
  if (!governance) {
    if (!authority || !authorityProgram) {
      throw new Error(
        "Governance config is missing. Set PROTOCOL_AUTHORITY_WALLET to initialize it.",
      );
    }
    if (!authority.publicKey.equals(protocolConfig.authority)) {
      throw new Error(
        `PROTOCOL_AUTHORITY_WALLET ${authority.publicKey.toBase58()} does not match protocol authority ${protocolConfig.authority.toBase58()}.`,
      );
    }

    const initialized = await sdk.initializeGovernance(
      connection,
      authorityProgram,
      authority,
      {
        votingPeriod: proposalVotingSeconds,
        executionDelay: DEFAULT_INIT_EXECUTION_DELAY_SECONDS,
        quorumBps: DEFAULT_INIT_QUORUM_BPS,
        approvalThresholdBps: DEFAULT_INIT_APPROVAL_THRESHOLD_BPS,
        minProposalStake: protocolConfig.minAgentStake,
      },
    );
    console.log(
      `[step] governance initialized: ${initialized.txSignature} governancePda=${initialized.governanceConfigPda.toBase58()}`,
    );
    governance = await fetchGovernanceConfig(connection, proposerProgram);
  }

  if (!governance) {
    throw new Error("Governance config could not be fetched after initialization.");
  }

  const participants = [
    {
      label: "proposer",
      keypair: proposer,
      program: proposerProgram,
      agentId: randomBytes32(),
      balance: 0n,
    },
    {
      label: "voterA",
      keypair: voterA,
      program: voterAProgram,
      agentId: randomBytes32(),
      balance: 0n,
    },
    {
      label: "voterB",
      keypair: voterB,
      program: voterBProgram,
      agentId: randomBytes32(),
      balance: 0n,
    },
    {
      label: "voterC",
      keypair: voterC,
      program: voterCProgram,
      agentId: randomBytes32(),
      balance: 0n,
    },
  ];

  if (voterD && voterDProgram) {
    participants.push({
      label: "voterD",
      keypair: voterD,
      program: voterDProgram,
      agentId: randomBytes32(),
      balance: 0n,
    });
  }

  const perWalletMinimum =
    governance.minProposalStake + DEFAULT_STAKE_FEE_BUFFER_LAMPORTS;
  const balances = await Promise.all(
    participants.map((participant) =>
      ensureBalance(
        connection,
        participant.label,
        participant.keypair.publicKey,
        perWalletMinimum,
      ),
    ),
  );

  for (const [index, balance] of balances.entries()) {
    participants[index].balance = balance;
  }

  const maxAffordableStake = participants.reduce((minimum, participant) => {
    const availableStake =
      participant.balance - DEFAULT_STAKE_FEE_BUFFER_LAMPORTS;
    return availableStake < minimum ? availableStake : minimum;
  }, participants[0].balance - DEFAULT_STAKE_FEE_BUFFER_LAMPORTS);

  const stakePlan = computeStakePlan({
    governance,
    rawProtocol: rawProtocolConfig,
    participantCount: participants.length,
    maxAffordableStake,
  });
  const agentStake = stakePlan.stakePerParticipant;

  console.log(
    `[protocol] minAgentStake=${rawProtocolConfig.minAgentStake.toString()} minArbiterStake=${rawProtocolConfig.minArbiterStake.toString()} totalAgents=${rawProtocolConfig.totalAgents.toString()} protocolFeeBps=${protocolConfig.protocolFeeBps}`,
  );
  console.log(
    `[governance] minProposalStake=${governance.minProposalStake.toString()} votingPeriod=${governance.votingPeriod}s executionDelay=${governance.executionDelay}s quorumBps=${governance.quorumBps} approvalThresholdBps=${governance.approvalThresholdBps}`,
  );
  console.log(
    `[balances] ${participants.map((participant) => `${participant.label}=${lamportsToSol(participant.balance)} SOL`).join(" ")}`,
  );
  console.log(
    `[stake-plan] participants=${participants.length} expectedTotalAgents=${stakePlan.expectedTotalAgents.toString()} quorumFactor=${stakePlan.quorumFactor.toString()} requiredVoteWeight=${stakePlan.requiredVoteWeight.toString()} stakePerParticipant=${agentStake.toString()} voteWeightPerParticipant=${stakePlan.voteWeightPerParticipant.toString()}`,
  );

  const proposerParticipant = participants[0];
  const titleHash = sha256Bytes(
    "governance-title",
    proposerParticipant.agentId,
  );
  const descriptionHash = sha256Bytes(
    "governance-description",
    proposerParticipant.agentId,
  );
  const nextFeeBps =
    protocolConfig.protocolFeeBps >= 999
      ? protocolConfig.protocolFeeBps - 1
      : protocolConfig.protocolFeeBps + 1;
  const payload = buildFeeChangePayload(nextFeeBps);

  try {
    const registrations = await Promise.all(
      participants.map((participant) =>
        sdk.registerAgent(connection, participant.program, participant.keypair, {
          agentId: participant.agentId,
          capabilities: CAP_COMPUTE,
          endpoint: DEFAULT_AGENT_ENDPOINT,
          metadataUri: null,
          stakeAmount: agentStake,
        }),
      ),
    );
    console.log(
      `[step] agents registered: ${participants.map((participant, index) => `${participant.label}=${registrations[index].txSignature}`).join(" ")}`,
    );

    const proposerAgentPda = sdk.deriveAgentPda(
      proposerParticipant.agentId,
      proposerParticipant.program.programId,
    );

    const created = await sdk.createProposal(
      connection,
      proposerParticipant.program,
      proposerParticipant.keypair,
      {
        proposerAgentPda,
        nonce: 0,
        proposalType: sdk.ProposalType.FeeChange,
        titleHash,
        descriptionHash,
        payload,
        votingPeriod: proposalVotingSeconds,
      },
    );
    console.log(
      `[step] proposal created: ${created.txSignature} proposalPda=${created.proposalPda.toBase58()}`,
    );

    const votes = await Promise.all(
      participants.map((participant) =>
        sdk.voteProposal(
          connection,
          participant.program,
          participant.keypair,
          created.proposalPda,
          sdk.deriveAgentPda(
            participant.agentId,
            participant.program.programId,
          ),
          true,
        ),
      ),
    );
    console.log(
      `[step] votes cast: ${participants.map((participant, index) => `${participant.label}=${votes[index].txSignature}`).join(" ")}`,
    );

    const proposal = await sdk.getProposal(proposerProgram, created.proposalPda);
    if (!proposal) {
      throw new Error("Proposal could not be fetched after voting.");
    }

    console.log(
      `[result] before execution status=${proposal.status} votesFor=${proposal.votesFor.toString()} votesAgainst=${proposal.votesAgainst.toString()} totalVoters=${proposal.totalVoters} executionAfter=${formatUnix(proposal.executionAfter)}`,
    );

    const ready = await waitUntilUnix(
      proposal.executionAfter,
      "governance execution",
      maxWaitSeconds,
    );
    if (!ready) {
      const artifactPath = await writeArtifact("governance", {
        version: 1,
        kind: "governance",
        rpcUrl,
        idlPath,
        proposalPda: created.proposalPda.toBase58(),
        executionAfter: proposal.executionAfter,
      });
      console.log(
        `[artifact] governance execution deferred until ${formatUnix(proposal.executionAfter)}: ${artifactPath}`,
      );
      console.log(
        `[artifact] resume with: EXECUTOR_WALLET=/path/to/wallet.json npm run test:devnet:governance -- --resume ${artifactPath}`,
      );
      return;
    }

    const executed = await sdk.executeProposal(
      connection,
      proposerProgram,
      proposer,
      created.proposalPda,
    );
    console.log(`[step] proposal executed: ${executed.txSignature}`);

    const finalProposal = await sdk.getProposal(proposerProgram, created.proposalPda);
    if (!finalProposal) {
      throw new Error("Proposal could not be fetched after execution.");
    }

    const updatedProtocolConfig = await sdk.getProtocolConfig(proposerProgram);
    if (!updatedProtocolConfig) {
      throw new Error("Protocol config could not be fetched after execution.");
    }
    if (updatedProtocolConfig.protocolFeeBps !== nextFeeBps) {
      throw new Error(
        `Expected protocol fee ${nextFeeBps} after execution, received ${updatedProtocolConfig.protocolFeeBps}.`,
      );
    }

    console.log(
      `[result] final status=${finalProposal.status} votesFor=${finalProposal.votesFor.toString()} votesAgainst=${finalProposal.votesAgainst.toString()} totalVoters=${finalProposal.totalVoters} protocolFeeBps=${updatedProtocolConfig.protocolFeeBps}`,
    );
  } finally {
    for (const participant of participants) {
      await maybeDeregister(
        connection,
        participant.program,
        participant.keypair,
        participant.agentId,
        participant.label,
      );
    }
  }
}

async function main() {
  if (hasFlag("--help")) {
    usage();
    return;
  }

  if (hasFlag("--resume")) {
    await resume();
    return;
  }

  await initial();
}

main().catch((error) => {
  console.error(
    `[fatal] ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
