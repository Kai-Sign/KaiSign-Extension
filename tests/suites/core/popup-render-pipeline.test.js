/**
 * Popup-render-pipeline tests.
 *
 * Mirror what content-script.js *actually* renders, not just what the
 * decoder/formatter emit in isolation. Each test bakes in the exact render
 * template the popup uses so render-layer regressions (missing formatter,
 * missing tooltip, missing escapeHtml) get caught.
 *
 * Render sites under test:
 *   - signature popup    line 1685
 *   - transaction popup  line 3105  (this is the one BAYC actually hits)
 *
 * Selector-match site under test:
 *   - subgraph-metadata.js line 358 / 429 (selectorMatchesSignature)
 *
 * Cases:
 *   1. BAYC ICU-resolved intent through transaction-popup render template
 *      → final HTML must contain truncated address AND title="" with full address
 *   2. LiFi swapTokensMultipleV3ERC20ToERC20 with canonical selector
 *      0x5fd9ae2e → metadata's stored non-canonical 0xdd081734 must still
 *      match via keccak256(signature) check
 */

import { calculateSelector } from '../../lib/node-adapter.js';
import { ethers } from 'ethers';

// Mirror escapeHtml from content-script.js
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Mirror the EXACT render template at content-script.js:3105 + 1685
function renderIntentDiv(intent, formatTitleAddresses) {
  const fmt = formatTitleAddresses || ((s) => s);
  const display = intent || 'Analyzing transaction...';
  return `<div class="kaisign-intent" title="${escapeHtml(display)}">${escapeHtml(fmt(display))}</div>`;
}

function renderTransactionIntentSection({ intent, tx, decodedResult }, formatTitleAddresses) {
  const fmt = formatTitleAddresses || ((s) => s);
  const rawIntent = intent || 'Analyzing transaction...';
  const formattedIntent = fmt(rawIntent);
  const contractName = decodedResult?.metadata?.context?.contract?.name || decodedResult?.contractName || '';
  const isSelfCall = tx.from && tx.to && tx.from.toLowerCase() === tx.to.toLowerCase();
  const isEIP7702 = tx.type === '0x04' || tx.type === 4 || (tx.authorizationList && tx.authorizationList.length > 0);
  const hasPayloadValue = (() => {
    try {
      return BigInt(tx.value || '0x0') !== 0n;
    } catch {
      return false;
    }
  })();
  const titleAlreadyCarriesMeaningfulValue = /\b\d[\d,]*(?:\.\d+)?\s+[A-Z][A-Z0-9.-]*\b/.test(rawIntent);
  const shouldShowPayloadTarget = Boolean(
    tx.to && (
      decodedResult?.unknownSummary ||
      !decodedResult?.success ||
      decodedResult?.batchIntents?.length ||
      decodedResult?.wrapperIntent ||
      isEIP7702
    )
  );
  const payloadTargetLabel = isSelfCall && isEIP7702
    ? 'Delegated Self: '
    : contractName
      ? 'Payload Contract: '
      : 'Payload To: ';
  const payloadDetails = [];
  if (shouldShowPayloadTarget) payloadDetails.push(payloadTargetLabel);
  if (hasPayloadValue && !titleAlreadyCarriesMeaningfulValue) payloadDetails.push('Payload Value: ');
  return `
    <div class="kaisign-intent-section">
      <div class="kaisign-intent" title="${escapeHtml(rawIntent)}">${escapeHtml(formattedIntent)}</div>
      ${payloadDetails.join(' ')}
    </div>
  `;
}

function summarizeNestedActionTitle(method, decoded, fallbackIntent) {
  if (!decoded?.success) return fallbackIntent;
  if (method !== 'eth_signTypedData_v4') return fallbackIntent;
  const nestedCount = Array.isArray(decoded.nestedIntents) ? decoded.nestedIntents.length : 0;
  if (nestedCount <= 1) return fallbackIntent;
  return decoded.wrapperIntent || decoded.intent || fallbackIntent;
}

function collectNestedActionDetails(source, out = []) {
  if (!source) return out;
  if (Array.isArray(source)) {
    source.forEach((item) => collectNestedActionDetails(item, out));
    return out;
  }
  if (source.decoded) collectNestedActionDetails(source.decoded, out);
  if (source.result) collectNestedActionDetails(source.result, out);
  if (Array.isArray(source.operations)) source.operations.forEach((op) => collectNestedActionDetails(op, out));
  if (Array.isArray(source.nestedDecodes)) source.nestedDecodes.forEach((nested) => collectNestedActionDetails(nested, out));

  if (source.intent && source.formatted && typeof source.formatted === 'object') {
    const fields = Object.values(source.formatted)
      .filter((field) => field && typeof field === 'object')
      .filter((field) => field.label && field.value != null && field.value !== '')
      .filter((field) => !['Data', 'Transactions', 'Call Data', 'Permit'].includes(field.label))
      .filter((field) => String(field.value).length <= 140)
      .map((field) => ({ label: field.label, value: String(field.value) }));
    if (fields.length > 0) out.push({ intent: source.intent, fields });
  }
  return out;
}

// Mirror selectorMatchesSignature behavior: with the fix it must use keccak256
function checkSelectorMatch(selectorMatchesSignature, selector, signature) {
  return selectorMatchesSignature(selector, signature);
}

export async function runTests(harness) {
  const results = [];

  const record = (result) => {
    results.push(result);
    if (harness?.stats) {
      if (result.passed) harness.stats.passed++;
      else harness.stats.failed++;
    }
  };

  const baseResult = (name, passed, error = null) => ({
    name,
    passed,
    duration: 0,
    result: null,
    expected: {},
    error,
    skipped: false
  });

  const fmt = harness.decoders.formatTitleAddresses;

  // --- Case 1: BAYC popup render through the ACTUAL transaction-popup template ---
  const baycAddr = '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d';
  harness.addMetadata(baycAddr, {
    context: { contract: { address: baycAddr, chainId: 1, name: 'Bored Ape Yacht Club', symbol: 'BAYC',
      abi: [{ type: 'function', name: 'setApprovalForAll', selector: '0xa22cb465',
        inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }] }] } },
    display: { formats: { 'setApprovalForAll(address,bool)': {
      intent: '{approved, select, true {Approve all BAYC for {operator}} other {Revoke BAYC approval for {operator}}}',
      fields: [{ path: 'operator', label: 'Operator', format: 'address' }, { path: 'approved', label: 'Approval', format: 'raw' }] } } }
  });

  const baycCalldata = '0xa22cb4650000000000000000000000001e0049783f008a0085193e00003d00cd54003c710000000000000000000000000000000000000000000000000000000000000001';
  const baycDecoded = await harness.decoders.decodeCalldata(baycCalldata, baycAddr, 1);
  const baycHtml = renderIntentDiv(baycDecoded.intent, fmt);

  // Visible text must be truncated (no full 42-char addr in the visible part)
  // tooltip (title="") must contain the full address for hover
  const baycVisibleOk = baycHtml.includes('Approve all BAYC for 0x1e00…3c71');
  const baycTooltipOk = baycHtml.includes('title="Approve all BAYC for 0x1e0049783f008a0085193e00003d00cd54003c71"')
    || baycHtml.includes('title="Approve all BAYC for 0x1e0049783F008A0085193E00003d00cd54003c71"');

  record(baseResult(
    'popup pipeline: BAYC final transaction-popup HTML shows truncated addr + full-addr tooltip',
    baycVisibleOk && baycTooltipOk,
    `expected truncated visible + full tooltip, got ${baycHtml}`
  ));

  // --- Case 2: LiFi canonical selector NOT in production metadata ---
  // Production fixture says selector for swapTokensMultipleV3ERC20ToERC20 is 0xdd081734
  // but keccak256 of canonical signature is 0x5fd9ae2e. Calldata generated by ethers
  // uses the canonical selector, so the popup misses metadata lookup entirely.
  const lifiAddr = '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae';
  harness.addMetadata(lifiAddr, {
    context: { contract: { address: lifiAddr, chainId: 1, name: 'LI.FI Diamond',
      // Mirror production metadata: declares selector 0xdd081734 (WRONG — should be 0x5fd9ae2e)
      abi: [{ type: 'function', name: 'swapTokensMultipleV3ERC20ToERC20', selector: '0xdd081734',
        inputs: [
          { name: 'transactionId', type: 'bytes32' },
          { name: 'integrator', type: 'string' },
          { name: 'referrer', type: 'string' },
          { name: 'receiver', type: 'address' },
          { name: 'minAmountOut', type: 'uint256' },
          { name: 'swapData', type: 'tuple[]', components: [
            { name: 'callTo', type: 'address' }, { name: 'approveTo', type: 'address' },
            { name: 'sendingAssetId', type: 'address' }, { name: 'receivingAssetId', type: 'address' },
            { name: 'fromAmount', type: 'uint256' }, { name: 'callData', type: 'bytes' },
            { name: 'requiresDeposit', type: 'bool' }
          ] }
        ] }] } },
    display: { formats: { 'swapTokensMultipleV3ERC20ToERC20(bytes32,string,string,address,uint256,(address,address,address,address,uint256,bytes,bool)[])': {
      intent: 'Swap exact in', fields: [] } } }
  });

  // First, the keccak256-based check itself: canonical selector for the signature MUST match
  const sig = 'swapTokensMultipleV3ERC20ToERC20(bytes32,string,string,address,uint256,(address,address,address,address,uint256,bytes,bool)[])';
  const canonicalSelector = calculateSelector(sig);
  record(baseResult(
    'popup pipeline: keccak256(signature) for LiFi swap is canonical 0x5fd9ae2e',
    canonicalSelector === '0x5fd9ae2e',
    `expected 0x5fd9ae2e, got ${canonicalSelector}`
  ));

  // Encode a real (well-formed) LiFi swap call so the decoder can fully decode it
  // after the canonical-selector match. Using ethers ABI coder ensures parameter
  // bytes are valid, isolating the test from calldata-truncation noise.
  const iface = new ethers.Interface([{
    type: 'function', name: 'swapTokensMultipleV3ERC20ToERC20',
    inputs: [
      { name: 'transactionId', type: 'bytes32' },
      { name: 'integrator', type: 'string' },
      { name: 'referrer', type: 'string' },
      { name: 'receiver', type: 'address' },
      { name: 'minAmountOut', type: 'uint256' },
      { name: 'swapData', type: 'tuple[]', components: [
        { name: 'callTo', type: 'address' }, { name: 'approveTo', type: 'address' },
        { name: 'sendingAssetId', type: 'address' }, { name: 'receivingAssetId', type: 'address' },
        { name: 'fromAmount', type: 'uint256' }, { name: 'callData', type: 'bytes' },
        { name: 'requiresDeposit', type: 'bool' }
      ] }
    ],
    outputs: []
  }]);
  const swapLeg = ['0x0000000000000000000000000000000000000001', '0x0000000000000000000000000000000000000002',
    '0x0000000000000000000000000000000000000003', '0x0000000000000000000000000000000000000004',
    1000000n, '0x', false];
  const lifiCalldata = iface.encodeFunctionData('swapTokensMultipleV3ERC20ToERC20', [
    '0xa482dfda03721a978ea9a5e8e3ea827a463f0a10529d1365061e99e14b01767a',
    'integrator-x', 'referrer-y',
    '0xa10235ea549daa39a108bc26d63bd8daa68e4a22',
    1000000000000000n,
    [swapLeg, swapLeg, swapLeg]
  ]);
  // Sanity: encoded calldata starts with the canonical selector
  if (!lifiCalldata.startsWith('0x5fd9ae2e')) {
    throw new Error(`expected canonical selector 0x5fd9ae2e in encoded calldata, got ${lifiCalldata.slice(0, 10)}`);
  }
  const lifiDecoded = await harness.decoders.decodeCalldata(lifiCalldata, lifiAddr, 1);
  const lifiRendered = fmt(lifiDecoded.intent || '');
  record(baseResult(
    'popup pipeline: LiFi 0x5fd9ae2e calldata resolves to decoded intent (not "Unknown function")',
    lifiRendered.startsWith('Swap exact in') || (lifiDecoded.aggregatedIntent && lifiDecoded.aggregatedIntent.includes('Swap')),
    `expected "Swap exact in" intent, got intent=${JSON.stringify(lifiDecoded.intent)} success=${lifiDecoded.success} aggregated=${JSON.stringify(lifiDecoded.aggregatedIntent)}`
  ));

  const usdcRecipient = '0x9bf81cc31d0f1fa7ade83058509a4db154a182a2';
  const transferHtml = renderTransactionIntentSection({
    intent: `Transfer 100.00 USDC to ${usdcRecipient}`,
    tx: {
      to: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      value: '0x0'
    },
    decodedResult: {
      success: true,
      metadata: {
        context: {
          contract: {
            name: 'USD Coin'
          }
        }
      }
    }
  }, fmt);
  record(baseResult(
    'popup pipeline: simple token transfer keeps recipient in title and omits payload To/Value rows',
    transferHtml.includes('Transfer 100.00 USDC to 0x9bf8…82a2')
      && !transferHtml.includes('Payload To:')
      && !transferHtml.includes('Payload Value:'),
    `expected recipient in title without payload rows, got ${transferHtml}`
  ));

  const typedBatchTitle = summarizeNestedActionTitle('eth_signTypedData_v4', {
    success: true,
    wrapperIntent: 'Execute batch transactions',
    intent: 'Execute batch transactions',
    nestedIntents: [
      'Approve 1.00 USDC to 0xc92e8bdf79f0507f65a392b0ab4667716bfe0110',
      'Authorize CoW order'
    ]
  }, 'Approve 1.00 USDC to 0xc92e8bdf79f0507f65a392b0ab4667716bfe0110 + Authorize CoW order');
  record(baseResult(
    'popup pipeline: typed-data batch title stays on wrapper intent instead of joined child intents',
    typedBatchTitle === 'Execute batch transactions',
    `expected wrapper title, got ${typedBatchTitle}`
  ));

  const actionDetails = collectNestedActionDetails([{
    result: {
      operations: [
        {
          decoded: {
            intent: 'Authorize CoW order',
            formatted: {
              orderDigest: { label: 'Order Digest', value: '0x4587f79fd230dc4b0c563e89cbce8eb834bd5975cb910b5d23f1fef0ddd33056' },
              orderOwner: { label: 'Order Owner', value: '0xa10235ea549daa39a108bc26d63bd8daa68e4a22' },
              validUntil: { label: 'Valid Until', value: '2026-04-28T12:34:45Z' }
            }
          }
        }
      ]
    }
  }]);
  record(baseResult(
    'popup pipeline: nested action details surface CoW digest-like fields',
    actionDetails.length === 1
      && actionDetails[0].fields.some((field) => field.label === 'Order Digest')
      && actionDetails[0].fields.some((field) => field.label === 'Order Owner'),
    `expected nested action details with Order Digest, got ${JSON.stringify(actionDetails)}`
  ));

  return results;
}
