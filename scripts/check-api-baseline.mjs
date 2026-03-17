#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const ts = require('typescript');

function parseArgs(argv) {
  const mode = argv.includes('--generate') ? 'generate' : argv.includes('--check') ? 'check' : null;
  if (!mode) {
    throw new Error('Usage: node scripts/check-api-baseline.mjs --generate|--check');
  }
  return mode;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function loadProgram() {
  const configPath = path.join(repoRoot, 'tsconfig.json');
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    repoRoot,
    { noEmit: true },
    configPath,
  );
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map((diag) => ts.flattenDiagnosticMessageText(diag.messageText, '\n')).join('; '));
  }
  return ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });
}

function formatSignature(checker, signature, decl) {
  return checker.signatureToString(signature, decl, ts.TypeFormatFlags.NoTruncation);
}

function inferExportEntry(checker, symbol, sourceFile) {
  const name = symbol.getName();
  if (name === 'default') return null;

  const resolved = (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
  const decl = resolved.valueDeclaration ?? resolved.declarations?.[0] ?? sourceFile;
  const type = checker.getTypeOfSymbolAtLocation(resolved, decl);
  const callSignatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call);
  if (callSignatures.length > 0) {
    return {
      name,
      kind: 'function',
      signature: callSignatures.map((sig) => formatSignature(checker, sig, decl)).join(' | '),
    };
  }

  if ((resolved.flags & ts.SymbolFlags.Class) !== 0) return { name, kind: 'class' };
  if ((resolved.flags & ts.SymbolFlags.Interface) !== 0) return { name, kind: 'interface' };
  if ((resolved.flags & ts.SymbolFlags.TypeAlias) !== 0) return { name, kind: 'type' };
  if ((resolved.flags & ts.SymbolFlags.Enum) !== 0) return { name, kind: 'enum' };
  return { name, kind: 'const' };
}

function collectExports() {
  const program = loadProgram();
  const checker = program.getTypeChecker();
  const entryPoint = path.join(repoRoot, 'src', 'index.ts');
  const source = program.getSourceFile(entryPoint);
  if (!source) {
    throw new Error(`Entry point not found: ${entryPoint}`);
  }
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) {
    return [];
  }

  return checker
    .getExportsOfModule(moduleSymbol)
    .map((symbol) => inferExportEntry(checker, symbol, source))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildBaseline() {
  const pkg = readJson(path.join(repoRoot, 'package.json'));
  return {
    package: pkg.name,
    version: pkg.version,
    generatedAt: new Date().toISOString(),
    entryPoint: 'src/index.ts',
    exports: collectExports(),
  };
}

function detectBreakingChanges(baseline, current) {
  const currentByName = new Map(current.exports.map((entry) => [entry.name, entry]));
  const changes = [];
  for (const base of baseline.exports) {
    const next = currentByName.get(base.name);
    if (!next) {
      changes.push(`removed export: ${base.name}`);
      continue;
    }
    if (base.kind !== next.kind) {
      changes.push(`kind changed for ${base.name}: ${base.kind} -> ${next.kind}`);
      continue;
    }
    if (base.signature !== undefined && next.signature !== undefined && base.signature !== next.signature) {
      changes.push(`signature changed for ${base.name}`);
    }
  }
  return changes;
}

function main() {
  const mode = parseArgs(process.argv.slice(2));
  const baselinePath = path.join(repoRoot, 'docs', 'api-baseline', 'sdk.json');
  const current = buildBaseline();

  if (mode === 'generate') {
    mkdirSync(path.dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
    process.stdout.write(`Generated baseline at ${baselinePath}\n`);
    return;
  }

  const baseline = readJson(baselinePath);
  const changes = detectBreakingChanges(baseline, current);
  if (changes.length > 0) {
    throw new Error(`Breaking API changes detected:\n- ${changes.join('\n- ')}`);
  }
  process.stdout.write('API baseline check passed.\n');
}

main();
