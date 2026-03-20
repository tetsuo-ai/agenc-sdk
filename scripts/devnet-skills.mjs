#!/usr/bin/env node

import process from "node:process";
import * as sdk from "../dist/index.mjs";
import {
  DEFAULT_AGENT_ENDPOINT,
  ensureBalance,
  ensureDistinctWallets,
  env,
  fixedUtf8Bytes,
  hasFlag,
  lamportsToSol,
  loadPrograms,
  randomBytes32,
  resolveIdlPath,
  sha256Bytes,
} from "./devnet-helpers.mjs";

const DEFAULT_RPC_URL = process.env.AGENC_RPC_URL ?? sdk.DEVNET_RPC;
const DEFAULT_SKILL_PRICE_LAMPORTS = 1_000_000n;
const CAP_COMPUTE = 1n;

function usage() {
  process.stdout.write(`Usage:
  AUTHOR_WALLET=/path/to/author.json BUYER_WALLET=/path/to/buyer.json npm run test:devnet:skills

Environment:
  AUTHOR_WALLET              Required. Solana keypair JSON for skill author.
  BUYER_WALLET               Required. Solana keypair JSON for skill buyer/rater.
  AGENC_RPC_URL              Optional. Defaults to ${DEFAULT_RPC_URL}
  AGENC_IDL_PATH             Required. Path to agenc_coordination.json
  AGENC_SKILL_PRICE_LAMPORTS Optional. Defaults to ${DEFAULT_SKILL_PRICE_LAMPORTS.toString()}

What this validates:
  1. Reads protocol config from devnet
  2. Registers an author agent and a buyer agent
  3. Registers a paid skill
  4. Purchases the skill
  5. Rates the skill
  6. Fetches final skill, purchase, and rating state
`);
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

async function main() {
  if (hasFlag("--help")) {
    usage();
    return;
  }

  const authorWalletPath = env("AUTHOR_WALLET");
  const buyerWalletPath = env("BUYER_WALLET");
  const rpcUrl = process.env.AGENC_RPC_URL ?? DEFAULT_RPC_URL;
  const idlPath = resolveIdlPath();
  const skillPrice = BigInt(
    process.env.AGENC_SKILL_PRICE_LAMPORTS ??
      DEFAULT_SKILL_PRICE_LAMPORTS.toString(),
  );

  console.log(`[config] rpc: ${rpcUrl}`);
  console.log(`[config] author wallet: ${authorWalletPath}`);
  console.log(`[config] buyer wallet: ${buyerWalletPath}`);
  console.log(`[config] skill price: ${skillPrice.toString()}`);
  console.log(`[config] idl path: ${idlPath}`);

  const { connection, keypairs, programs } = await loadPrograms({
    rpcUrl,
    idlPath,
    wallets: {
      author: authorWalletPath,
      buyer: buyerWalletPath,
    },
  });

  ensureDistinctWallets(keypairs);

  const author = keypairs.author;
  const buyer = keypairs.buyer;
  const authorProgram = programs.author;
  const buyerProgram = programs.buyer;

  const protocolConfig = await sdk.getProtocolConfig(authorProgram);
  if (!protocolConfig) {
    throw new Error("Protocol config PDA could not be fetched from devnet.");
  }

  const authorMinimum = protocolConfig.minAgentStake + 10_000_000n;
  const buyerMinimum = protocolConfig.minAgentStake + skillPrice + 10_000_000n;

  const [authorBalance, buyerBalance] = await Promise.all([
    ensureBalance(connection, "author", author.publicKey, authorMinimum),
    ensureBalance(connection, "buyer", buyer.publicKey, buyerMinimum),
  ]);

  console.log(
    `[protocol] minStake=${protocolConfig.minAgentStake.toString()} treasury=${protocolConfig.treasury.toBase58()}`,
  );
  console.log(
    `[balances] author=${authorBalance.toString()} (${lamportsToSol(authorBalance)} SOL) buyer=${buyerBalance.toString()} (${lamportsToSol(buyerBalance)} SOL)`,
  );

  const authorAgentId = randomBytes32();
  const buyerAgentId = randomBytes32();
  const skillId = randomBytes32();
  const skillName = fixedUtf8Bytes(
    `skill-${Date.now().toString().slice(-6)}`,
    32,
  );
  const skillTags = fixedUtf8Bytes("devnet,skills,validation", 64);
  const contentHash = sha256Bytes("agenc-sdk-skill-v1", skillId);
  const reviewHash = sha256Bytes("agenc-sdk-skill-review", skillId);

  try {
    const authorReg = await sdk.registerAgent(
      connection,
      authorProgram,
      author,
      {
        agentId: authorAgentId,
        capabilities: CAP_COMPUTE,
        endpoint: DEFAULT_AGENT_ENDPOINT,
        metadataUri: null,
        stakeAmount: protocolConfig.minAgentStake,
      },
    );
    console.log(`[step] author agent registered: ${authorReg.txSignature}`);

    const buyerReg = await sdk.registerAgent(
      connection,
      buyerProgram,
      buyer,
      {
        agentId: buyerAgentId,
        capabilities: CAP_COMPUTE,
        endpoint: DEFAULT_AGENT_ENDPOINT,
        metadataUri: null,
        stakeAmount: protocolConfig.minAgentStake,
      },
    );
    console.log(`[step] buyer agent registered: ${buyerReg.txSignature}`);

    const registered = await sdk.registerSkill(
      connection,
      authorProgram,
      author,
      authorAgentId,
      {
        skillId,
        name: skillName,
        contentHash,
        price: skillPrice,
        priceMint: null,
        tags: skillTags,
      },
    );
    console.log(
      `[step] skill registered: ${registered.txSignature} skillPda=${registered.skillPda.toBase58()}`,
    );

    const purchased = await sdk.purchaseSkill(
      connection,
      buyerProgram,
      buyer,
      buyerAgentId,
      {
        skillPda: registered.skillPda,
        expectedPrice: skillPrice,
      },
    );
    console.log(`[step] skill purchased: ${purchased.txSignature}`);

    const rated = await sdk.rateSkill(
      connection,
      buyerProgram,
      buyer,
      buyerAgentId,
      registered.skillPda,
      {
        rating: 5,
        reviewHash,
      },
    );
    console.log(`[step] skill rated: ${rated.txSignature}`);

    const [skill, purchaseRecord, ratingRecord] = await Promise.all([
      sdk.getSkill(authorProgram, registered.skillPda),
      sdk.getPurchaseRecord(buyerProgram, purchased.purchaseRecordPda),
      sdk.getSkillRating(buyerProgram, rated.ratingPda),
    ]);

    if (!skill) {
      throw new Error("Skill account could not be fetched after rating.");
    }
    if (!purchaseRecord) {
      throw new Error("Purchase record could not be fetched after purchase.");
    }
    if (!ratingRecord) {
      throw new Error("Rating record could not be fetched after rating.");
    }

    if (skill.ratingCount !== 1) {
      throw new Error(`Expected ratingCount=1, received ${skill.ratingCount}`);
    }
    if (skill.downloadCount !== 1) {
      throw new Error(
        `Expected downloadCount=1, received ${skill.downloadCount}`,
      );
    }
    const expectedTotalRating =
      BigInt(ratingRecord.rating) * BigInt(ratingRecord.raterReputation);

    if (skill.totalRating !== expectedTotalRating) {
      throw new Error(
        `Expected totalRating=${expectedTotalRating.toString()}, received ${skill.totalRating.toString()}`,
      );
    }
    if (purchaseRecord.pricePaid !== skillPrice) {
      throw new Error(
        `Expected pricePaid=${skillPrice.toString()}, received ${purchaseRecord.pricePaid.toString()}`,
      );
    }
    if (ratingRecord.rating !== 5) {
      throw new Error(`Expected rating=5, received ${ratingRecord.rating}`);
    }

    console.log(
      `[result] downloads=${skill.downloadCount} ratingCount=${skill.ratingCount} totalRating=${skill.totalRating.toString()} version=${skill.version}`,
    );
    console.log(
      `[result] purchaseRecord=${purchased.purchaseRecordPda.toBase58()} ratingRecord=${rated.ratingPda.toBase58()}`,
    );
  } finally {
    await maybeDeregister(connection, authorProgram, author, authorAgentId, "author");
    await maybeDeregister(connection, buyerProgram, buyer, buyerAgentId, "buyer");
  }
}

main().catch((error) => {
  console.error(
    `[fatal] ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
