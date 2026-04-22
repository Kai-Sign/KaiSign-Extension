/**
 * Replay an export file through the in-process decoder to verify regressions
 * and accumulate a backend backlog of contracts that still produce
 * unknown-title results after replay.
 *
 * Usage: node tests/replay-export.js <path-to-export.json>
 *                                    [--backend <path>] [--backlog <path>]
 *
 * Defaults:
 *   --backend ../../kaisign-backend/backend
 *   --backlog <backend>/metadata/_backlog/from-extension-exports.json
 *
 * The backlog is merged across runs (per-(address, chainId) key), so dropping
 * in multiple exports over time accumulates evidence rather than clobbering it.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TestHarness } from './lib/test-harness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {
    exportPath: null,
    backendPath: path.resolve(__dirname, '../../kaisign-backend/backend'),
    backlogPath: null,
    overridesPath: null
  };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--backend') args.backendPath = path.resolve(rest[++i]);
    else if (rest[i] === '--backlog') args.backlogPath = path.resolve(rest[++i]);
    else if (rest[i] === '--overrides') args.overridesPath = path.resolve(rest[++i]);
    else if (!args.exportPath) args.exportPath = path.resolve(rest[i]);
  }
  if (!args.exportPath) {
    console.error('Usage: node tests/replay-export.js <export.json> [--backend <path>] [--backlog <path>] [--overrides <path>]');
    process.exit(2);
  }
  if (!args.backlogPath) {
    args.backlogPath = path.join(args.backendPath, 'metadata/_backlog/from-extension-exports.json');
  }
  return args;
}

function loadOverrides(overridesPath) {
  if (!overridesPath) return {};
  return JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
}

function isUnknownTitle(title) {
  // Catches both pre-Phase-1 phrasings (Unknown call 0xSELECTOR / Unknown function on NAME)
  // and post-Phase-1 runtime-registry fallback phrasings (... on unknown contract).
  // All three indicate the backend lacks a working metadata entry for this (address, selector) pair.
  return /^Unknown call 0x[0-9a-f]{8}$/i.test(title)
    || /^Unknown function on /.test(title)
    || / on unknown contract$/.test(title);
}

function detectContractName(title) {
  // "Unknown function on NAME" → backend has the contract, ABI is stale → return NAME.
  // "... on unknown contract" → backend has nothing → null.
  const m = title.match(/^Unknown function on (.+)$/);
  return m ? m[1] : null;
}

function normalizeChainId(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string') {
    if (value.startsWith('0x') || value.startsWith('0X')) {
      const parsed = Number.parseInt(value, 16);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function aggregateBacklog(txs, replayResults) {
  // replayResults[i] = { title, ok }
  const gaps = new Map();
  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i];
    if (tx.method && tx.method !== 'eth_sendTransaction') continue;
    if (!tx.to) continue;
    const replayedTitle = replayResults[i]?.title || '';
    if (!isUnknownTitle(replayedTitle)) continue;

    const address = tx.to.toLowerCase();
    const chainId = normalizeChainId(replayResults[i]?.chainId);
    if (chainId == null) continue;
    const key = `${address}-${chainId}`;
    const selector = (tx.data && tx.data.length >= 10) ? tx.data.slice(0, 10).toLowerCase() : null;

    if (!gaps.has(key)) {
      gaps.set(key, {
        address,
        chainId,
        txCount: 0,
        unknownCount: 0,
        selectors: new Set(),
        detectedName: null,
        sampleTxIds: [],
        firstSeen: tx.time || null,
        lastSeen: tx.time || null
      });
    }
    const g = gaps.get(key);
    g.txCount++;
    g.unknownCount++;
    if (selector) g.selectors.add(selector);
    if (g.sampleTxIds.length < 3 && tx.id != null) g.sampleTxIds.push(tx.id);
    const detected = detectContractName(replayedTitle);
    if (detected && !g.detectedName) g.detectedName = detected;
    if (tx.time) {
      if (!g.firstSeen || tx.time < g.firstSeen) g.firstSeen = tx.time;
      if (!g.lastSeen || tx.time > g.lastSeen) g.lastSeen = tx.time;
    }
  }
  return gaps;
}

function loadExistingBacklog(backlogPath) {
  if (!fs.existsSync(backlogPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(backlogPath, 'utf8'));
  } catch (e) {
    console.warn(`[replay] Could not parse existing backlog at ${backlogPath}: ${e.message} — starting fresh`);
    return null;
  }
}

function mergeBacklog(existing, newGaps, sourceMeta) {
  const merged = existing ? { ...existing } : { _meta: { generatedAt: null, generatedBy: 'tests/replay-export.js', sourceExports: [] } };
  if (!merged._meta) merged._meta = { generatedAt: null, generatedBy: 'tests/replay-export.js', sourceExports: [] };
  if (!Array.isArray(merged._meta.sourceExports)) merged._meta.sourceExports = [];

  let newCount = 0;
  let mergedCount = 0;

  for (const [key, gap] of newGaps) {
    const entry = {
      address: gap.address,
      chainId: gap.chainId,
      txCount: gap.txCount,
      unknownCount: gap.unknownCount,
      selectors: [...gap.selectors].sort(),
      detectedName: gap.detectedName,
      sampleTxIds: [...gap.sampleTxIds],
      firstSeen: gap.firstSeen,
      lastSeen: gap.lastSeen
    };

    if (merged[key]) {
      const prev = merged[key];
      mergedCount++;
      entry.txCount = (prev.txCount || 0) + gap.txCount;
      entry.unknownCount = (prev.unknownCount || 0) + gap.unknownCount;
      entry.selectors = [...new Set([...(prev.selectors || []), ...entry.selectors])].sort();
      entry.detectedName = prev.detectedName || entry.detectedName;
      const ids = [...(prev.sampleTxIds || []), ...entry.sampleTxIds];
      entry.sampleTxIds = [...new Set(ids)].slice(0, 3);
      if (prev.firstSeen && (!entry.firstSeen || prev.firstSeen < entry.firstSeen)) entry.firstSeen = prev.firstSeen;
      if (prev.lastSeen && (!entry.lastSeen || prev.lastSeen > entry.lastSeen)) entry.lastSeen = prev.lastSeen;
    } else {
      newCount++;
    }
    merged[key] = entry;
  }

  merged._meta.generatedAt = new Date().toISOString();
  if (!merged._meta.sourceExports.some(s => s.file === sourceMeta.file)) {
    merged._meta.sourceExports.push(sourceMeta);
  }

  return { merged, newCount, mergedCount };
}

function writeBacklog(backlogPath, content) {
  fs.mkdirSync(path.dirname(backlogPath), { recursive: true });
  fs.writeFileSync(backlogPath, JSON.stringify(content, null, 2) + '\n');
}

function printBacklogSummary(backlogPath, newGaps, newCount, mergedCount) {
  const entries = [...newGaps.values()];
  if (entries.length === 0) {
    console.log('\n=== BACKEND BACKLOG ===');
    console.log('  no unknown-title contracts in this export — nothing to write');
    return;
  }
  const noMeta = entries.filter(g => !g.detectedName);
  const stale = entries.filter(g => g.detectedName);
  const selectorCounts = new Map();
  for (const g of entries) {
    for (const s of g.selectors) selectorCounts.set(s, (selectorCounts.get(s) || 0) + g.unknownCount);
  }
  const topSelectors = [...selectorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  console.log(`\n=== BACKEND BACKLOG (${backlogPath}) ===`);
  console.log(`  wrote ${entries.length} contract gaps → ${newCount} new, ${mergedCount} merged`);
  console.log('  by category:');
  console.log(`    no metadata at all       : ${noMeta.length} contracts`);
  if (stale.length > 0) {
    const names = stale.map(g => g.detectedName).join(', ');
    console.log(`    metadata exists, ABI stale: ${stale.length} contracts (${names})`);
  } else {
    console.log(`    metadata exists, ABI stale: 0 contracts`);
  }
  if (topSelectors.length > 0) {
    const top = topSelectors.map(([s, c]) => `${s} (${c} txs)`).join(', ');
    console.log(`  top selectors needing signatures: ${top}`);
  }
}

function classifyTitle(intent) {
  if (typeof intent !== 'string' || intent === '') return 'missing';
  if (intent === '<skipped: missing chainId>') return 'skipped-no-chain';
  if (/^Unknown call 0x[0-9a-f]{8}$/i.test(intent)) return 'unknown-bare';
  if (/^Unknown function on /.test(intent)) return 'unknown-on-named';
  if (/\b\d{18,}\b/.test(intent)) return 'raw-wei';
  if (intent.includes('115792089237316195423570985008687907853269984665640564039457')) return 'uint256-max-literal';
  if (/^Approve 0x[0-9a-f]{4}\.\.\.[0-9a-f]{4} /.test(intent)) return 'approve-hex-spender';
  return 'good';
}

async function main() {
  const { exportPath, backendPath, backlogPath, overridesPath } = parseArgs(process.argv);
  const exportData = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  const txs = exportData.transactions || [];
  const overrides = loadOverrides(overridesPath);
  console.log(`[replay] Loaded ${txs.length} transactions from ${exportPath}`);
  console.log(`[replay] Using backend metadata at ${backendPath}`);
  if (overridesPath) {
    console.log(`[replay] Using chain overrides from ${overridesPath}`);
  }

  const harness = new TestHarness({ fixturesPath: backendPath, defaultChainId: 1 });
  await harness.initialize();

  const before = {};
  const after = {};
  const titleDiffs = [];
  const replayResults = new Array(txs.length);

  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i];
    const data = tx.data;
    const to = tx.to;
    const overrideChainId = normalizeChainId(overrides[String(tx.id)]);
    const chainId = overrideChainId ?? normalizeChainId(tx.chainId);
    const capturedTitle = tx.decodedResult?.aggregatedIntent || tx.decodedResult?.intent || '';

    const beforeBucket = classifyTitle(capturedTitle);
    before[beforeBucket] = (before[beforeBucket] || 0) + 1;

    let replayedTitle = '';
    let replayOk = false;
    if (chainId == null) {
      replayedTitle = '<skipped: missing chainId>';
    } else {
      try {
        const result = await harness.decoders.decodeCalldata(data, to, chainId);
        replayedTitle = result?.aggregatedIntent || result?.intent || '';
        replayOk = true;
      } catch (e) {
        replayedTitle = `<decode error: ${e.message}>`;
      }
    }
    replayResults[i] = { title: replayedTitle, ok: replayOk };
    replayResults[i].chainId = chainId;
    const afterBucket = classifyTitle(replayedTitle);
    after[afterBucket] = (after[afterBucket] || 0) + 1;

    if (beforeBucket !== afterBucket || capturedTitle !== replayedTitle) {
      titleDiffs.push({ idx: i, to, beforeBucket, afterBucket, before: capturedTitle, after: replayedTitle });
    }
  }

  console.log('\n=== TITLE QUALITY: BEFORE (from export) vs AFTER (replayed) ===');
  const buckets = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const b of buckets) {
    const bCount = before[b] || 0;
    const aCount = after[b] || 0;
    const arrow = bCount === aCount ? '=' : (aCount > bCount ? '↑' : '↓');
    console.log(`  ${b.padEnd(24)} before=${String(bCount).padStart(3)}  after=${String(aCount).padStart(3)}  ${arrow}`);
  }

  console.log(`\n=== TITLE DIFFS (${titleDiffs.length}) — sample of 10 ===`);
  for (const d of titleDiffs.slice(0, 10)) {
    console.log(`  [${d.idx}] ${d.to}`);
    console.log(`      before [${d.beforeBucket}]: ${d.before.slice(0, 100)}`);
    console.log(`      after  [${d.afterBucket}]: ${d.after.slice(0, 100)}`);
  }

  // Backend backlog: aggregate post-replay unknown-title contracts and merge into the
  // shared file. Same export filename is idempotent — counters don't double-count.
  const newGaps = aggregateBacklog(txs, replayResults);
  if (newGaps.size > 0) {
    const existing = loadExistingBacklog(backlogPath);
    const sourceFile = path.basename(exportPath);
    const alreadyIngested = existing?._meta?.sourceExports?.some(s => s.file === sourceFile) ?? false;
    if (alreadyIngested) {
      console.log(`\n=== BACKEND BACKLOG (${backlogPath}) ===`);
      console.log(`  ${sourceFile} already ingested — skipping merge to keep counters idempotent`);
    } else {
      const sourceMeta = {
        file: sourceFile,
        exportDate: exportData.exportDate || null,
        transactionCount: txs.length,
        replayedAt: new Date().toISOString()
      };
      const { merged, newCount, mergedCount } = mergeBacklog(existing, newGaps, sourceMeta);
      writeBacklog(backlogPath, merged);
      printBacklogSummary(backlogPath, newGaps, newCount, mergedCount);
    }
  } else {
    printBacklogSummary(backlogPath, newGaps, 0, 0);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
