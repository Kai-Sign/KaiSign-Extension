#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import { TestHarness } from '../lib/test-harness.js';
import { validateDecodedResultForAbiStructure } from '../lib/clear-sign-readiness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TESTS_DIR = path.resolve(__dirname, '..');
const CACHE_DIR = path.resolve(TESTS_DIR, '.cache', 'sourcify');

const DEFAULT_CHAINS = [1];
const DEFAULT_MATCH_TYPE = 'full_match';
const MANIFEST_URL = 'https://repo-backup.sourcify.dev/manifest.json';
const BAD_INTENT_RES = [/^Unknown call 0x/, /^Unknown function on /];

function printUsage() {
  console.log(`
Usage:
  node tests/scripts/sweep-verified-abi.js [options]

Options:
  --chain=1,8453         Comma-separated chain IDs (default: 1)
  --prefix=00,01,ff      Optional comma-separated shard prefixes
  --match=full_match     Sourcify match type: full_match or partial_match
  --max-shards=10        Stop after N shards
  --max-contracts=100    Stop after N contracts
  --max-selectors=1000   Stop after N selectors
  --output=path.json     Write machine-readable summary JSON
  --verbose              Print per-contract progress
  --help                 Show this help

Examples:
  node tests/scripts/sweep-verified-abi.js --chain=1 --prefix=00
  node tests/scripts/sweep-verified-abi.js --chain=1,8453 --max-shards=20
`);
}

function parseArgs(argv) {
  const args = {
    chains: DEFAULT_CHAINS,
    prefixes: null,
    matchType: DEFAULT_MATCH_TYPE,
    maxShards: Infinity,
    maxContracts: Infinity,
    maxSelectors: Infinity,
    output: null,
    verbose: false
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--verbose' || arg === '-v') {
      args.verbose = true;
    } else if (arg.startsWith('--chain=')) {
      args.chains = arg.slice('--chain='.length).split(',').map(v => Number(v.trim())).filter(Number.isFinite);
    } else if (arg.startsWith('--prefix=')) {
      args.prefixes = arg
        .slice('--prefix='.length)
        .split(',')
        .map(v => v.trim().toUpperCase())
        .filter(v => /^[0-9A-F]{2}$/.test(v));
    } else if (arg.startsWith('--match=')) {
      args.matchType = arg.slice('--match='.length).trim();
    } else if (arg.startsWith('--max-shards=')) {
      args.maxShards = Number(arg.slice('--max-shards='.length)) || Infinity;
    } else if (arg.startsWith('--max-contracts=')) {
      args.maxContracts = Number(arg.slice('--max-contracts='.length)) || Infinity;
    } else if (arg.startsWith('--max-selectors=')) {
      args.maxSelectors = Number(arg.slice('--max-selectors='.length)) || Infinity;
    } else if (arg.startsWith('--output=')) {
      args.output = path.resolve(process.cwd(), arg.slice('--output='.length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!['full_match', 'partial_match'].includes(args.matchType)) {
    throw new Error(`Unsupported --match value: ${args.matchType}`);
  }

  if (args.chains.length === 0) {
    throw new Error('No valid chain IDs provided');
  }

  return args;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function fetchWithCache(url, cachePath) {
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath);
  }

  ensureDir(path.dirname(cachePath));
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Fetch failed ${url}: HTTP ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  fs.writeFileSync(cachePath, buf);
  return buf;
}

async function loadManifest() {
  const manifestPath = path.join(CACHE_DIR, 'backup-manifest.json');
  const buf = await fetchWithCache(MANIFEST_URL, manifestPath);
  return JSON.parse(buf.toString('utf8'));
}

function extractShardPath(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry.path === 'string') return entry.path;
  if (entry && typeof entry.name === 'string') return entry.name;
  if (entry && typeof entry.key === 'string') return entry.key;
  return null;
}

function listShardPaths(manifest, chainId, matchType, prefixes) {
  const entries = Array.isArray(manifest?.files)
    ? manifest.files
    : Array.isArray(manifest)
      ? manifest
      : [];

  const paths = [];
  const re = new RegExp(`${matchType}\\.${chainId}\\.([0-9A-F]{2})\\.tar\\.gz$`, 'i');

  for (const entry of entries) {
    const shardPath = extractShardPath(entry);
    if (!shardPath) continue;
    const match = shardPath.match(re);
    if (!match) continue;
    const prefix = match[1].toUpperCase();
    if (prefixes && !prefixes.includes(prefix)) continue;
    paths.push(shardPath);
  }

  return paths.sort((a, b) => a.localeCompare(b));
}

async function ensureShardFile(shardPath) {
  const fileName = shardPath.split('/').pop();
  const localPath = path.join(CACHE_DIR, 'shards', fileName);
  const url = new URL(shardPath, 'https://repo-backup.sourcify.dev/').toString();
  await fetchWithCache(url, localPath);
  return localPath;
}

function readTarString(buf, start, length) {
  return buf.slice(start, start + length).toString('utf8').replace(/\0.*$/, '');
}

function parseOctal(str) {
  const trimmed = str.replace(/\0.*$/, '').trim();
  return trimmed ? Number.parseInt(trimmed, 8) : 0;
}

function isGzipFile(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(2);
    fs.readSync(fd, header, 0, 2, 0);
    return header[0] === 0x1f && header[1] === 0x8b;
  } finally {
    fs.closeSync(fd);
  }
}

async function* streamTarGzEntries(filePath) {
  const rawStream = fs.createReadStream(filePath);
  const source = isGzipFile(filePath) ? rawStream.pipe(zlib.createGunzip()) : rawStream;
  let pending = Buffer.alloc(0);
  let current = null;

  for await (const chunk of source) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk);

    while (pending.length > 0) {
      if (!current) {
        if (pending.length < 512) break;
        const header = pending.subarray(0, 512);
        pending = pending.subarray(512);

        if (header.every(byte => byte === 0)) {
          return;
        }

        current = {
          name: readTarString(header, 0, 100),
          size: parseOctal(readTarString(header, 124, 12)),
          remainingContent: parseOctal(readTarString(header, 124, 12)),
          remainingPadding: 0,
          chunks: []
        };
        current.remainingPadding = (512 - (current.size % 512)) % 512;
      }

      if (current.remainingContent > 0) {
        if (pending.length === 0) break;
        const take = Math.min(current.remainingContent, pending.length);
        current.chunks.push(pending.subarray(0, take));
        pending = pending.subarray(take);
        current.remainingContent -= take;
        if (current.remainingContent > 0) break;
      }

      if (current.remainingPadding > 0) {
        if (pending.length < current.remainingPadding) break;
        pending = pending.subarray(current.remainingPadding);
        current.remainingPadding = 0;
      }

      if (current.remainingContent === 0 && current.remainingPadding === 0) {
        yield {
          name: current.name,
          content: Buffer.concat(current.chunks, current.size)
        };
        current = null;
      }
    }
  }
}

function extractAddressFromTarPath(name) {
  const match = name.match(/0x[0-9a-fA-F]{40}/);
  return match ? match[0].toLowerCase() : null;
}

function contractNameFromMetadata(metadata, fallbackAddress) {
  const compilationTarget = metadata?.settings?.compilationTarget;
  if (compilationTarget && typeof compilationTarget === 'object') {
    const name = Object.values(compilationTarget)[0];
    if (typeof name === 'string' && name.trim()) return name;
  }
  return metadata?.contractName || fallbackAddress;
}

function fnSignature(abiFn) {
  const types = (abiFn.inputs || []).map(i => i.type).join(',');
  return `${abiFn.name}(${types})`;
}

function selectorOf(abiFn) {
  return ethers.id(fnSignature(abiFn)).slice(0, 10);
}

function zeroValueForType(type) {
  if (type.endsWith(']')) {
    const fixedMatch = type.match(/^(.+)\[(\d+)\]$/);
    if (fixedMatch) {
      const [, inner, n] = fixedMatch;
      return Array.from({ length: Number(n) }, () => zeroValueForType(inner));
    }
    return [];
  }
  if (type === 'address') return ethers.ZeroAddress;
  if (type === 'bool') return false;
  if (type === 'string') return '';
  if (type === 'bytes') return '0x';
  if (type.startsWith('bytes')) {
    const n = Number(type.slice(5));
    return '0x' + '00'.repeat(Number.isFinite(n) ? n : 0);
  }
  if (type.startsWith('uint') || type.startsWith('int')) return 0n;
  if (type === 'tuple') return [];
  return 0n;
}

function buildTupleZero(components) {
  return components.map(c => {
    if (c.type === 'tuple') return buildTupleZero(c.components || []);
    if (c.type.endsWith(']') && c.components) {
      const fixedMatch = c.type.match(/^tuple\[(\d+)\]$/);
      if (fixedMatch) {
        return Array.from({ length: Number(fixedMatch[1]) }, () => buildTupleZero(c.components));
      }
      return [];
    }
    return zeroValueForType(c.type);
  });
}

function buildSyntheticCalldata(abiFn) {
  const iface = new ethers.Interface([abiFn]);
  const args = (abiFn.inputs || []).map(input => {
    if (input.type === 'tuple') return buildTupleZero(input.components || []);
    if (input.type.startsWith('tuple[') && input.components) {
      const fixedMatch = input.type.match(/^tuple\[(\d+)\]$/);
      if (fixedMatch) {
        return Array.from({ length: Number(fixedMatch[1]) }, () => buildTupleZero(input.components));
      }
      return [];
    }
    return zeroValueForType(input.type);
  });
  return iface.encodeFunctionData(abiFn.name, args);
}

function metadataFromAbi(address, chainId, name, abi) {
  const fnEntries = abi.filter(e => e.type === 'function');
  const abiWithSelectors = fnEntries.map(fn => ({
    type: 'function',
    name: fn.name,
    selector: selectorOf(fn),
    inputs: fn.inputs || [],
    outputs: fn.outputs || [],
    stateMutability: fn.stateMutability || 'nonpayable'
  }));
  return {
    context: {
      contract: {
        address,
        chainId,
        name,
        abi: abiWithSelectors
      }
    },
    display: { formats: {} }
  };
}

function isBadIntent(intent) {
  if (!intent) return true;
  return BAD_INTENT_RES.some(re => re.test(intent));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const harness = new TestHarness({
    fixturesPath: path.resolve(TESTS_DIR, 'fixtures'),
    extensionPath: path.resolve(TESTS_DIR, '..'),
    defaultChainId: args.chains[0],
    verbose: args.verbose,
    useRemoteApi: false
  });

  await harness.initialize();

  const manifest = await loadManifest();
  const summary = {
    generatedAt: new Date().toISOString(),
    chains: args.chains,
    matchType: args.matchType,
    prefixes: args.prefixes,
    maxShards: Number.isFinite(args.maxShards) ? args.maxShards : null,
    maxContracts: Number.isFinite(args.maxContracts) ? args.maxContracts : null,
    maxSelectors: Number.isFinite(args.maxSelectors) ? args.maxSelectors : null,
    shardsScanned: 0,
    contractsScanned: 0,
    selectorsScanned: 0,
    selectorsPassed: 0,
    failures: [],
    badIntents: [],
    skippedContracts: []
  };

  outer:
  for (const chainId of args.chains) {
    const shardPaths = listShardPaths(manifest, chainId, args.matchType, args.prefixes);
    if (shardPaths.length === 0) {
      console.log(`[sweep] No shards found for chain ${chainId} (${args.matchType})`);
      continue;
    }

    for (const shardPath of shardPaths) {
      if (summary.shardsScanned >= args.maxShards) break outer;
      const shardFile = await ensureShardFile(shardPath);
      summary.shardsScanned++;
      console.log(`[sweep] shard ${summary.shardsScanned}: ${shardPath}`);

      for await (const entry of streamTarGzEntries(shardFile)) {
        if (!entry.name.endsWith('metadata.json')) continue;
        if (summary.contractsScanned >= args.maxContracts || summary.selectorsScanned >= args.maxSelectors) {
          break outer;
        }

        let metadata;
        try {
          metadata = JSON.parse(entry.content.toString('utf8'));
        } catch (error) {
          summary.skippedContracts.push({ chainId, shardPath, tarPath: entry.name, reason: `invalid JSON: ${error.message}` });
          continue;
        }

        const abi = metadata?.output?.abi;
        const address = extractAddressFromTarPath(entry.name);
        if (!address || !Array.isArray(abi)) {
          summary.skippedContracts.push({ chainId, shardPath, tarPath: entry.name, reason: 'missing address or ABI' });
          continue;
        }

        const contractName = contractNameFromMetadata(metadata, address);
        summary.contractsScanned++;
        if (args.verbose) {
          console.log(`[sweep] contract ${summary.contractsScanned}: ${chainId}:${address} ${contractName}`);
        }

        harness.addMetadata(address, metadataFromAbi(address, chainId, contractName, abi), chainId);

        const fnEntries = abi.filter(e =>
          e.type === 'function' &&
          e.stateMutability !== 'view' &&
          e.stateMutability !== 'pure'
        );

        for (const abiFn of fnEntries) {
          if (summary.selectorsScanned >= args.maxSelectors) break outer;
          summary.selectorsScanned++;

          const sig = fnSignature(abiFn);
          const selector = selectorOf(abiFn);

          let calldata;
          try {
            calldata = buildSyntheticCalldata(abiFn);
          } catch (error) {
            summary.failures.push({
              chainId,
              address,
              contractName,
              selector,
              signature: sig,
              stage: 'encode',
              error: error.message
            });
            continue;
          }

          let decoded;
          try {
            decoded = await harness.decoders.decodeCalldata(calldata, address, chainId);
          } catch (error) {
            summary.failures.push({
              chainId,
              address,
              contractName,
              selector,
              signature: sig,
              stage: 'decode',
              error: error.message
            });
            continue;
          }

          if (isBadIntent(decoded?.intent || '')) {
            summary.badIntents.push({
              chainId,
              address,
              contractName,
              selector,
              signature: sig,
              intent: decoded?.intent || null
            });
          }

          const structural = validateDecodedResultForAbiStructure(decoded, abiFn);
          if (!structural.ok) {
            summary.failures.push({
              chainId,
              address,
              contractName,
              selector,
              signature: sig,
              stage: 'validate',
              error: structural.issues.join('; ')
            });
            continue;
          }

          summary.selectorsPassed++;
        }
      }
    }
  }

  const pct = summary.selectorsScanned > 0
    ? ((summary.selectorsPassed / summary.selectorsScanned) * 100).toFixed(1)
    : '0.0';

  console.log('');
  console.log('=== VERIFIED ABI SWEEP ===');
  console.log(`Chains scanned      : ${summary.chains.join(', ')}`);
  console.log(`Match type          : ${summary.matchType}`);
  console.log(`Shards scanned      : ${summary.shardsScanned}`);
  console.log(`Contracts scanned   : ${summary.contractsScanned}`);
  console.log(`Selectors scanned   : ${summary.selectorsScanned}`);
  console.log(`Selectors passed    : ${summary.selectorsPassed} (${pct}%)`);
  console.log(`Structural failures : ${summary.failures.length}`);
  console.log(`Bad intents         : ${summary.badIntents.length}`);
  console.log(`Skipped contracts   : ${summary.skippedContracts.length}`);

  if (summary.failures.length) {
    console.log('--- failures ---');
    for (const failure of summary.failures.slice(0, 200)) {
      console.log(`${failure.chainId}:${failure.address} ${failure.selector} ${failure.signature} [${failure.stage}] -> ${failure.error}`);
    }
    if (summary.failures.length > 200) {
      console.log(`... ${summary.failures.length - 200} more failures omitted`);
    }
  }

  if (args.output) {
    ensureDir(path.dirname(args.output));
    fs.writeFileSync(args.output, JSON.stringify(summary, null, 2));
    console.log(`[sweep] wrote ${args.output}`);
  }

  process.exit(summary.failures.length > 0 || summary.badIntents.length > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('[sweep] fatal:', error);
  process.exit(1);
});
