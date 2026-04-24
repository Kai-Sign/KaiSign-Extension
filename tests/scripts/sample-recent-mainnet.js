#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { TestHarness } from '../lib/test-harness.js';
import { fetchSourcifyAbi } from '../lib/sourcify-client.js';
import { validateDecodedResultForAbiStructure } from '../lib/clear-sign-readiness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TESTS_DIR = path.resolve(__dirname, '..');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DEFAULT_CHAIN_ID = 1;
const DEFAULT_BLOCKS = 25;
const DEFAULT_TARGETS = 50;
const DEFAULT_STATE_PATH = path.resolve(TESTS_DIR, '.cache', 'recent-mainnet-purpose-state.json');
const DEFAULT_OUTPUT_PATH = path.resolve(TESTS_DIR, '.cache', 'recent-mainnet-purpose-sample.json');
const RPC_URL = process.env.PUBLICNODE_RPC_URL || process.env.ALCHEMY_RPC_URL || process.env.ALCHEMY_RPC || 'https://ethereum-rpc.publicnode.com';

function printUsage() {
  console.log(`
Usage:
  node tests/scripts/sample-recent-mainnet.js [options]

Options:
  --blocks=25            Number of latest blocks to inspect
  --target=50            Number of fresh purposes to emit
  --chain=1              Chain ID (currently mainnet-focused)
  --state=path.json      Persistent seen-purpose state file
  --output=path.json     Output sample file
  --reset-state          Ignore existing seen-purpose state
  --include-seen         Include already-seen purposes in output
  --verbose              Print progress
  --help                 Show this help

Purpose key:
  chainId:address:selector

The script walks recent blocks newest-first, keeps only verified-ABI calls,
validates structural decode, and emits only unseen purposes by default so each
run tends to produce new metadata work.
`);
}

function parseArgs(argv) {
  const args = {
    blocks: DEFAULT_BLOCKS,
    target: DEFAULT_TARGETS,
    chainId: DEFAULT_CHAIN_ID,
    statePath: DEFAULT_STATE_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
    resetState: false,
    includeSeen: false,
    verbose: false
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--verbose' || arg === '-v') {
      args.verbose = true;
    } else if (arg === '--reset-state') {
      args.resetState = true;
    } else if (arg === '--include-seen') {
      args.includeSeen = true;
    } else if (arg.startsWith('--blocks=')) {
      args.blocks = Math.max(1, Number(arg.slice('--blocks='.length)) || DEFAULT_BLOCKS);
    } else if (arg.startsWith('--target=')) {
      args.target = Math.max(1, Number(arg.slice('--target='.length)) || DEFAULT_TARGETS);
    } else if (arg.startsWith('--chain=')) {
      args.chainId = Math.max(1, Number(arg.slice('--chain='.length)) || DEFAULT_CHAIN_ID);
    } else if (arg.startsWith('--state=')) {
      args.statePath = path.resolve(process.cwd(), arg.slice('--state='.length));
    } else if (arg.startsWith('--output=')) {
      args.outputPath = path.resolve(process.cwd(), arg.slice('--output='.length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function loadState(statePath, resetState) {
  if (resetState || !fs.existsSync(statePath)) {
    return {
      seenPurposes: {},
      seenTransactionHashes: {},
      lastRunAt: null
    };
  }

  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return {
      seenPurposes: {},
      seenTransactionHashes: {},
      lastRunAt: null
    };
  }
}

function saveState(statePath, state) {
  ensureDir(path.dirname(statePath));
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
}

async function rpcCall(method, params) {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params
    })
  });

  const payload = await response.json();
  if (payload.error) {
    throw new Error(`${method}: ${payload.error.message || JSON.stringify(payload.error)}`);
  }
  return payload.result;
}

async function getLatestBlockNumber() {
  const hex = await rpcCall('eth_blockNumber', []);
  return Number.parseInt(hex, 16);
}

async function getBlockWithTransactions(blockNumber) {
  const hex = `0x${blockNumber.toString(16)}`;
  return rpcCall('eth_getBlockByNumber', [hex, true]);
}

function fnSignature(abiFn) {
  const types = (abiFn.inputs || []).map(i => i.type).join(',');
  return `${abiFn.name}(${types})`;
}

function selectorOf(abiFn) {
  if (abiFn.selector) return abiFn.selector.toLowerCase();
  return ethers.id(fnSignature(abiFn)).slice(0, 10).toLowerCase();
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

function findMatchingAbiFunction(abi, selector) {
  return abi.find(item =>
    item.type === 'function' &&
    item.stateMutability !== 'view' &&
    item.stateMutability !== 'pure' &&
    selectorOf(item) === selector.toLowerCase()
  ) || null;
}

function purposeKey(chainId, address, selector) {
  return `${chainId}:${address.toLowerCase()}:${selector.toLowerCase()}`;
}

function toIsoFromHexTimestamp(hexTs) {
  if (!hexTs) return null;
  const value = Number.parseInt(hexTs, 16);
  return Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = loadState(args.statePath, args.resetState);
  const harness = new TestHarness({
    fixturesPath: path.resolve(TESTS_DIR, 'fixtures'),
    extensionPath: path.resolve(TESTS_DIR, '..'),
    defaultChainId: args.chainId,
    verbose: args.verbose,
    useRemoteApi: false
  });
  await harness.initialize();

  const latestBlock = await getLatestBlockNumber();
  const sample = [];
  const summary = {
    generatedAt: new Date().toISOString(),
    chainId: args.chainId,
    latestBlock,
    blocksRequested: args.blocks,
    targetPurposes: args.target,
    scannedBlocks: 0,
    scannedTransactions: 0,
    contractCalls: 0,
    verifiedContracts: 0,
    decodedPurposes: 0,
    emittedPurposes: 0,
    skipped: {
      seenPurpose: 0,
      noInput: 0,
      create: 0,
      noAbi: 0,
      noMatchingSelector: 0,
      decodeFailed: 0,
      structureFailed: 0
    }
  };

  const abiCache = new Map();

  for (let blockNumber = latestBlock; blockNumber > latestBlock - args.blocks; blockNumber--) {
    if (sample.length >= args.target) break;
    const block = await getBlockWithTransactions(blockNumber);
    summary.scannedBlocks++;
    if (args.verbose) {
      console.log(`[sample] block ${blockNumber} txs=${block?.transactions?.length || 0}`);
    }

    for (const tx of (block?.transactions || [])) {
      if (sample.length >= args.target) break;
      summary.scannedTransactions++;

      if (!tx.to) {
        summary.skipped.create++;
        continue;
      }

      if (!tx.input || tx.input.length < 10 || tx.input === '0x') {
        summary.skipped.noInput++;
        continue;
      }

      summary.contractCalls++;
      const address = tx.to.toLowerCase();
      const selector = tx.input.slice(0, 10).toLowerCase();
      const key = purposeKey(args.chainId, address, selector);

      if (!args.includeSeen && state.seenPurposes[key]) {
        summary.skipped.seenPurpose++;
        continue;
      }

      let sourcify = abiCache.get(address);
      if (sourcify === undefined) {
        sourcify = await fetchSourcifyAbi(args.chainId, address);
        abiCache.set(address, sourcify);
      }
      if (!sourcify?.abi) {
        summary.skipped.noAbi++;
        continue;
      }

      summary.verifiedContracts++;
      const abiFn = findMatchingAbiFunction(sourcify.abi, selector);
      if (!abiFn) {
        summary.skipped.noMatchingSelector++;
        continue;
      }

      harness.addMetadata(
        address,
        metadataFromAbi(address, args.chainId, sourcify.name || address, sourcify.abi),
        args.chainId
      );

      let decoded;
      try {
        decoded = await harness.decoders.decodeCalldata(tx.input, address, args.chainId);
      } catch {
        summary.skipped.decodeFailed++;
        continue;
      }

      const structural = validateDecodedResultForAbiStructure(decoded, abiFn);
      if (!structural.ok) {
        summary.skipped.structureFailed++;
        continue;
      }

      summary.decodedPurposes++;
      state.seenPurposes[key] = {
        firstSeenAt: new Date().toISOString(),
        txHash: tx.hash,
        contract: address,
        selector
      };
      state.seenTransactionHashes[tx.hash.toLowerCase()] = true;

      sample.push({
        purposeKey: key,
        chainId: args.chainId,
        contractAddress: address,
        contractName: sourcify.name || address,
        selector,
        functionSignature: fnSignature(abiFn),
        functionName: abiFn.name,
        txHash: tx.hash,
        from: tx.from,
        value: tx.value,
        blockNumber: Number.parseInt(tx.blockNumber, 16),
        blockTimestamp: toIsoFromHexTimestamp(block.timestamp),
        calldata: tx.input,
        rawParams: decoded.rawParams,
        params: decoded.params,
        intent: decoded.intent || 'Contract interaction'
      });
    }
  }

  state.lastRunAt = new Date().toISOString();
  saveState(args.statePath, state);

  const output = {
    summary: {
      ...summary,
      emittedPurposes: sample.length
    },
    sample
  };

  ensureDir(path.dirname(args.outputPath));
  fs.writeFileSync(args.outputPath, JSON.stringify(output, null, 2) + '\n');

  console.log('');
  console.log('=== RECENT MAINNET SAMPLE ===');
  console.log(`Latest block        : ${latestBlock}`);
  console.log(`Blocks scanned      : ${summary.scannedBlocks}`);
  console.log(`Transactions scanned: ${summary.scannedTransactions}`);
  console.log(`Contract calls      : ${summary.contractCalls}`);
  console.log(`Verified contracts  : ${summary.verifiedContracts}`);
  console.log(`Decoded purposes    : ${summary.decodedPurposes}`);
  console.log(`Emitted purposes    : ${sample.length}`);
  console.log(`State file          : ${args.statePath}`);
  console.log(`Output file         : ${args.outputPath}`);

  if (sample.length) {
    console.log('--- emitted purposes ---');
    for (const item of sample.slice(0, 25)) {
      console.log(`${item.blockNumber} ${item.contractName} ${item.functionSignature} ${item.txHash}`);
    }
    if (sample.length > 25) {
      console.log(`... ${sample.length - 25} more omitted`);
    }
  }
}

main().catch(error => {
  console.error('[sample] fatal:', error);
  process.exit(1);
});
