#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchSourcifyAbi } from '../lib/sourcify-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TESTS_DIR = path.resolve(__dirname, '..');
const DEFAULT_INPUT = path.resolve(TESTS_DIR, '.cache', 'recent-mainnet-purpose-sample.json');
const DEFAULT_OUTPUT_DIR = path.resolve(TESTS_DIR, '.cache', 'generated-metadata', 'recent-mainnet');

function printUsage() {
  console.log(`
Usage:
  node tests/scripts/generate-metadata-from-sample.js [options]

Options:
  --input=path.json      Sample file from sample-recent-mainnet.js
  --output-dir=dir       Directory to write generated metadata files
  --help                 Show this help
`);
}

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    outputDir: DEFAULT_OUTPUT_DIR
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg.startsWith('--input=')) {
      args.input = path.resolve(process.cwd(), arg.slice('--input='.length));
    } else if (arg.startsWith('--output-dir=')) {
      args.outputDir = path.resolve(process.cwd(), arg.slice('--output-dir='.length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function fnSignature(abiFn) {
  const types = (abiFn.inputs || []).map(i => i.type).join(',');
  return `${abiFn.name}(${types})`;
}

function selectorOf(sampleEntry, abiFn) {
  return (sampleEntry.selector || abiFn.selector || '').toLowerCase();
}

function inferFormat(type) {
  if (type === 'address') return 'address';
  if (type === 'bool') return 'boolean';
  if (type === 'string') return 'string';
  if (type === 'bytes' || type.startsWith('bytes')) return 'hex';
  if (type.endsWith('[]')) return 'array';
  if (type.startsWith('uint') || type.startsWith('int')) return 'number';
  return 'raw';
}

function normalizeParamName(name, fallback) {
  if (!name || !name.trim()) return fallback;
  return name;
}

function titleLabel(name) {
  const trimmed = name.replace(/^_+/, '');
  if (!trimmed) return name;
  return trimmed
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, c => c.toUpperCase());
}

function generateIntentTemplate(abiFn) {
  const names = (abiFn.inputs || []).map((input, i) => normalizeParamName(input.name, `param${i}`));
  const amountField = names.find(name => /amount|value|liquidity|shares|min|max/i.test(name));
  const recipientField = names.find(name => /to|recipient|spender|account|owner/i.test(name));

  switch (abiFn.name) {
    case 'approve':
      return amountField ? `Approve {${amountField}}` : 'Approve spending';
    case 'transfer':
      if (amountField && recipientField) return `Transfer {${amountField}} to {${recipientField}}`;
      if (amountField) return `Transfer {${amountField}}`;
      return 'Transfer';
    case 'deposit':
      if (amountField) return `Deposit {${amountField}}`;
      return 'Deposit';
    default: {
      const readable = abiFn.name
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, c => c.toUpperCase());
      return readable;
    }
  }
}

function safeFileStem(contractName, address) {
  const base = (contractName || address)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || address.toLowerCase();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sampleFile = JSON.parse(fs.readFileSync(args.input, 'utf8'));
  const entries = sampleFile.sample || [];
  ensureDir(args.outputDir);

  const byContract = new Map();

  for (const entry of entries) {
    const key = `${entry.chainId}:${entry.contractAddress.toLowerCase()}`;
    if (!byContract.has(key)) {
      byContract.set(key, []);
    }
    byContract.get(key).push(entry);
  }

  const written = [];

  for (const [key, contractEntries] of byContract) {
    const first = contractEntries[0];
    const sourcify = await fetchSourcifyAbi(first.chainId, first.contractAddress);
    if (!sourcify?.abi) continue;

    const abiFunctions = [];
    const formats = {};
    const samples = [];

    for (const entry of contractEntries) {
      const abiFn = sourcify.abi.find(item =>
        item.type === 'function' &&
        fnSignature(item) === entry.functionSignature
      );
      if (!abiFn) continue;

      const signature = fnSignature(abiFn);
      if (!formats[signature]) {
        abiFunctions.push({
          type: 'function',
          name: abiFn.name,
          selector: selectorOf(entry, abiFn),
          inputs: (abiFn.inputs || []).map((input, i) => ({
            name: normalizeParamName(input.name, `param${i}`),
            type: input.type,
            ...(input.components ? { components: input.components } : {})
          })),
          outputs: abiFn.outputs || [],
          stateMutability: abiFn.stateMutability || 'nonpayable'
        });

        formats[signature] = {
          intent: generateIntentTemplate(abiFn),
          fields: (abiFn.inputs || []).map((input, i) => {
            const paramName = normalizeParamName(input.name, `param${i}`);
            return {
              path: paramName,
              label: titleLabel(paramName),
              format: inferFormat(input.type)
            };
          })
        };
      }

      samples.push({
        purposeKey: entry.purposeKey,
        txHash: entry.txHash,
        selector: entry.selector,
        functionSignature: entry.functionSignature,
        blockNumber: entry.blockNumber,
        blockTimestamp: entry.blockTimestamp
      });
    }

    const metadata = {
      context: {
        contract: {
          address: first.contractAddress.toLowerCase(),
          chainId: first.chainId,
          name: first.contractName,
          abi: abiFunctions
        }
      },
      display: {
        formats
      },
      _generatedFromSample: {
        sourceFile: path.relative(TESTS_DIR, args.input),
        generatedAt: new Date().toISOString(),
        samples
      }
    };

    const outPath = path.join(
      args.outputDir,
      `${safeFileStem(first.contractName, first.contractAddress)}-${first.contractAddress.toLowerCase()}.json`
    );
    fs.writeFileSync(outPath, JSON.stringify(metadata, null, 2) + '\n');
    written.push(outPath);
    console.log(`[generated] ${outPath}`);
  }

  console.log(`Generated ${written.length} metadata file(s) from ${entries.length} sample purpose(s).`);
}

main().catch(error => {
  console.log('[generate-metadata-from-sample] fatal:', error);
  process.exit(1);
});
