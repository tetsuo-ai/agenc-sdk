import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";

export const DEFAULT_COMMITMENT = "confirmed";
export const DEFAULT_AGENT_ENDPOINT =
  "https://example.invalid/agenc-devnet-test";

const DEFAULT_ARTIFACT_DIR = path.join(os.tmpdir(), "agenc-sdk-devnet");

export function env(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function optionalEnv(name) {
  return process.env[name] ?? null;
}

export function resolveIdlPath(fallback = null) {
  const idlPath = process.env.AGENC_IDL_PATH ?? fallback;
  if (!idlPath) {
    throw new Error(
      "Missing AGENC_IDL_PATH. Point it at agenc_coordination.json before running this validator.",
    );
  }
  return idlPath;
}

export function hasFlag(flag) {
  return process.argv.includes(flag);
}

export function getFlagValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

export async function loadKeypair(filePath) {
  const raw = JSON.parse(await readFile(filePath, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error(`Invalid keypair file: ${filePath}`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export async function loadIdl(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export function makeWallet(keypair) {
  return {
    publicKey: keypair.publicKey,
    async signTransaction(tx) {
      tx.partialSign(keypair);
      return tx;
    },
    async signAllTransactions(txs) {
      for (const tx of txs) {
        tx.partialSign(keypair);
      }
      return txs;
    },
  };
}

export function createProgram(connection, idl, keypair) {
  return new Program(
    idl,
    new AnchorProvider(connection, makeWallet(keypair), {
      commitment: DEFAULT_COMMITMENT,
    }),
  );
}

export async function loadPrograms({ rpcUrl, idlPath, wallets }) {
  const connection = new Connection(rpcUrl, DEFAULT_COMMITMENT);
  const idl = await loadIdl(idlPath);
  const keypairs = {};
  const programs = {};

  for (const [name, walletPath] of Object.entries(wallets)) {
    if (!walletPath) {
      continue;
    }
    const keypair = await loadKeypair(walletPath);
    keypairs[name] = keypair;
    programs[name] = createProgram(connection, idl, keypair);
  }

  return { connection, idl, keypairs, programs };
}

export function ensureDistinctWallets(namedKeypairs) {
  const seen = new Map();

  for (const [label, keypair] of Object.entries(namedKeypairs)) {
    const pubkey = keypair.publicKey.toBase58();
    const existing = seen.get(pubkey);
    if (existing) {
      throw new Error(
        `${label} and ${existing} must use different keypairs (${pubkey})`,
      );
    }
    seen.set(pubkey, label);
  }
}

export function short(pubkey) {
  const base58 = pubkey.toBase58();
  return `${base58.slice(0, 4)}...${base58.slice(-4)}`;
}

export function lamportsToSol(lamports) {
  return Number(lamports) / 1_000_000_000;
}

export async function ensureBalance(
  connection,
  label,
  pubkey,
  minimumLamports,
) {
  const balance = BigInt(
    await connection.getBalance(pubkey, DEFAULT_COMMITMENT),
  );
  if (balance < minimumLamports) {
    throw new Error(
      `${label} ${pubkey.toBase58()} has ${balance} lamports (${lamportsToSol(balance)} SOL), ` +
        `needs at least ${minimumLamports} lamports (${lamportsToSol(minimumLamports)} SOL)`,
    );
  }
  return balance;
}

export function fixedUtf8Bytes(text, size) {
  const output = Buffer.alloc(size);
  const input = Buffer.from(text, "utf8");
  input.copy(output, 0, 0, Math.min(input.length, output.length));
  return output;
}

export function sha256Bytes(...parts) {
  const hash = crypto.createHash("sha256");
  for (const part of parts) {
    if (typeof part === "string") {
      hash.update(part);
    } else {
      hash.update(Buffer.from(part));
    }
  }
  return hash.digest();
}

export function randomBytes32() {
  return crypto.randomBytes(32);
}

export function unixNow() {
  return Math.floor(Date.now() / 1000);
}

export function formatUnix(ts) {
  return new Date(ts * 1000).toISOString();
}

export function toBigIntValue(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  if (value && typeof value.toString === "function") {
    return BigInt(value.toString());
  }
  throw new Error(`Cannot convert value to bigint: ${String(value)}`);
}

export function toNumberValue(value) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value.toString === "function") {
    return Number(value.toString());
  }
  throw new Error(`Cannot convert value to number: ${String(value)}`);
}

export async function waitUntilUnix(targetUnix, label, maxWaitSeconds) {
  const waitSeconds = Math.max(0, targetUnix - unixNow());

  if (waitSeconds > maxWaitSeconds) {
    console.log(
      `[wait] ${label}: requires ${waitSeconds}s until ${formatUnix(targetUnix)}, exceeding max wait ${maxWaitSeconds}s`,
    );
    return false;
  }

  if (waitSeconds > 0) {
    console.log(
      `[wait] ${label}: sleeping ${waitSeconds}s until ${formatUnix(targetUnix)}`,
    );
    await new Promise((resolve) => {
      setTimeout(resolve, (waitSeconds + 1) * 1000);
    });
  }

  return true;
}

export async function writeArtifact(kind, data, explicitPath = null) {
  const filePath =
    explicitPath ??
    path.join(
      DEFAULT_ARTIFACT_DIR,
      `${kind}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.json`,
    );

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return filePath;
}

export async function readArtifact(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}
