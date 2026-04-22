/**
 * Verified ABI Coverage Suite
 *
 * For every (chainId, address) listed in tests/fixtures/audit-addresses.txt:
 *   1. Fetch the verified ABI from Sourcify (cached on disk).
 *   2. Inject the ABI as ERC-7730-shaped metadata into the harness.
 *   3. For each non-view/non-pure function selector, build synthetic
 *      zero-valued calldata and run it through the decoder.
 *   4. Assert: decoder returns success===true OR functionName matches the
 *      ABI AND every input arg name appears in result.params; AND
 *      result.intent does not match /^Unknown (call 0x|function on )/.
 *
 * Failures are the punch list of decoder bugs to fix in decode.js.
 *
 * The audit list is user-curated. Sourcify-missing addresses are reported
 * as "skipped" (NOT counted as failures) so unverifiable contracts are
 * visible without polluting the failure signal.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import { fetchSourcifyAbi } from '../../lib/sourcify-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_PATH = path.resolve(__dirname, '..', '..', 'fixtures', 'audit-addresses.txt');

// Intents that count as decoder failures (the decoder broke):
//   "Unknown call 0x..."       — selector lookup failed completely
//   "Unknown function on ..."  — contract metadata missing
// "Contract interaction" is NOT a failure: it means the decoder worked but
// no curated ERC-7730 format exists for this selector. Counted separately
// in the "no curated format" bucket so coverage gaps stay visible without
// polluting the failure signal.
const BAD_INTENT_RES = [
  /^Unknown call 0x/,
  /^Unknown function on /
];

const NO_FORMAT_INTENT = 'Contract interaction';

function isBadIntent(intent) {
  if (!intent) return true;
  return BAD_INTENT_RES.some(re => re.test(intent));
}

function parseAuditList(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  const out = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const [chainStr, address] = line.split(':').map(s => s && s.trim());
    const chainId = Number(chainStr);
    if (!Number.isFinite(chainId) || !/^0x[0-9a-fA-F]{40}$/.test(address || '')) {
      console.log(`  [audit-addresses.txt] skipping unparseable line: ${rawLine}`);
      continue;
    }
    out.push({ chainId, address: address.toLowerCase() });
  }
  return out;
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

function fnSignature(abiFn) {
  const types = (abiFn.inputs || []).map(i => i.type).join(',');
  return `${abiFn.name}(${types})`;
}

function selectorOf(abiFn) {
  return ethers.id(fnSignature(abiFn)).slice(0, 10);
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
        name: name || 'Unknown',
        abi: abiWithSelectors
      }
    },
    display: { formats: {} }
  };
}

function buildResult(name, passed, error, intent) {
  return {
    name,
    passed,
    duration: 0,
    result: intent ? { intent } : null,
    expected: {},
    error,
    skipped: false
  };
}

export async function runTests(harness) {
  const results = [];
  const auditList = parseAuditList(FIXTURE_PATH);

  if (auditList.length === 0) {
    console.log('  [verified-abi-coverage] audit-addresses.txt is empty; nothing to audit.');
    return results;
  }

  console.log(`  [verified-abi-coverage] auditing ${auditList.length} contracts from audit-addresses.txt`);

  let contractsAudited = 0;
  let selectorsAudited = 0;
  let selectorsClean = 0;
  let selectorsNoFormat = 0;
  const failures = [];
  const noFormat = [];
  const sourcifyMissing = [];

  for (const { chainId, address } of auditList) {
    let sourcifyResult;
    try {
      sourcifyResult = await fetchSourcifyAbi(chainId, address);
    } catch (e) {
      results.push(buildResult(
        `[fetch] ${chainId}:${address}`,
        false,
        `Sourcify fetch failed: ${e.message}`
      ));
      harness.stats.failed++;
      continue;
    }

    if (!sourcifyResult) {
      sourcifyMissing.push(`${chainId}:${address}`);
      results.push({
        name: `[skip] ${chainId}:${address} not on Sourcify`,
        passed: true,
        duration: 0,
        result: null,
        expected: {},
        error: null,
        skipped: true
      });
      harness.stats.skipped = (harness.stats.skipped || 0) + 1;
      continue;
    }

    contractsAudited++;
    const { abi, name: contractName } = sourcifyResult;
    const metadata = metadataFromAbi(address, chainId, contractName, abi);
    harness.addMetadata(address, metadata, chainId);

    const fnEntries = abi.filter(e =>
      e.type === 'function' &&
      e.stateMutability !== 'view' &&
      e.stateMutability !== 'pure'
    );

    for (const abiFn of fnEntries) {
      selectorsAudited++;
      const sig = fnSignature(abiFn);
      const selector = selectorOf(abiFn);
      const testName = `${contractName || address.slice(0, 10)} ${sig}`;

      let calldata;
      try {
        calldata = buildSyntheticCalldata(abiFn);
      } catch (e) {
        const msg = `encode failed: ${e.message}`;
        failures.push({ chainId, address, selector, sig, intent: msg });
        results.push(buildResult(testName, false, msg));
        harness.stats.failed++;
        continue;
      }

      let decoded;
      try {
        decoded = await harness.decoders.decodeCalldata(calldata, address, chainId);
      } catch (e) {
        const msg = `decoder threw: ${e.message}`;
        failures.push({ chainId, address, selector, sig, intent: msg });
        results.push(buildResult(testName, false, msg));
        harness.stats.failed++;
        continue;
      }

      const intent = decoded?.intent || '';
      const fnNameMatches = decoded?.functionName === abiFn.name;
      const inputNames = (abiFn.inputs || []).map(i => i.name).filter(Boolean);
      const paramKeys = decoded?.params ? Object.keys(decoded.params) : [];
      const allInputsPresent = inputNames.every(n => paramKeys.includes(n));
      const intentClean = !isBadIntent(intent);
      const structuralPass = decoded?.success === true || (fnNameMatches && allInputsPresent);

      const passed = structuralPass && intentClean;

      if (passed) {
        selectorsClean++;
        if (intent === NO_FORMAT_INTENT) {
          selectorsNoFormat++;
          noFormat.push({ chainId, address, selector, sig });
        }
        results.push({
          name: testName,
          passed: true,
          duration: 0,
          result: decoded,
          expected: {},
          error: null,
          skipped: false
        });
        harness.stats.passed++;
      } else {
        const reason = !intent
          ? 'no intent'
          : !intentClean
            ? `bad intent: ${intent}`
            : !fnNameMatches
              ? `functionName mismatch (got ${decoded?.functionName})`
              : `missing params: ${inputNames.filter(n => !paramKeys.includes(n)).join(',')}`;
        failures.push({ chainId, address, selector, sig, intent: reason });
        results.push({
          name: testName,
          passed: false,
          duration: 0,
          result: decoded,
          expected: {},
          error: reason,
          skipped: false
        });
        harness.stats.failed++;
      }
    }
  }

  const pct = selectorsAudited > 0 ? ((selectorsClean / selectorsAudited) * 100).toFixed(1) : '0.0';
  console.log('');
  console.log('  === DECODER COVERAGE ===');
  console.log(`  Contracts audited        : ${contractsAudited}`);
  console.log(`  Selectors audited        : ${selectorsAudited}`);
  console.log(`  Selectors decoded clean  : ${selectorsClean}  (${pct}%)`);
  console.log(`  Selectors with no format : ${selectorsNoFormat}  (decoder OK, missing curated ERC-7730 metadata)`);
  console.log(`  Selectors with bad title : ${failures.length}  (decoder bug)`);
  if (failures.length) {
    console.log('  ----- failures (decoder bugs) -----');
    for (const f of failures) {
      console.log(`    ${f.chainId}:${f.address}  ${f.selector}  ${f.sig}  -> ${f.intent}`);
    }
  }
  if (noFormat.length) {
    console.log('  ----- no curated format (decoder works, ship metadata to improve title) -----');
    for (const n of noFormat) {
      console.log(`    ${n.chainId}:${n.address}  ${n.selector}  ${n.sig}`);
    }
  }
  if (sourcifyMissing.length) {
    console.log('  ----- not on Sourcify (skipped, NOT counted as fail) -----');
    for (const s of sourcifyMissing) console.log(`    ${s}`);
  }
  console.log('');

  return results;
}
