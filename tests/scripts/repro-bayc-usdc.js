/**
 * Repro script for BAYC + USDC decoder behavior using production API metadata.
 * Mirrors what the extension popup gets after our ICU + title-overflow fixes.
 */

import { TestHarness } from '../lib/test-harness.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const harness = new TestHarness({
  fixturesPath: path.resolve(__dirname, '../fixtures'),
  extensionPath: path.resolve(__dirname, '../..'),
  defaultChainId: 1
});
await harness.initialize();

// BAYC metadata as returned by production API
const baycMeta = {
  context: { contract: { address: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d', chainId: 1, name: 'Bored Ape Yacht Club', symbol: 'BAYC',
    abi: [{ type: 'function', name: 'setApprovalForAll', selector: '0xa22cb465',
      inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }] }] } },
  display: { formats: { 'setApprovalForAll(address,bool)': {
    intent: '{approved, select, true {Approve all BAYC for {operator}} other {Revoke BAYC approval for {operator}}}',
    fields: [{ path: 'operator', label: 'Operator', format: 'address' }, { path: 'approved', label: 'Approval', format: 'raw' }] } } }
};

// USDC metadata as returned by production API
const usdcMeta = {
  context: { contract: { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', chainId: 1, name: 'USD Coin', symbol: 'USDC', decimals: 6,
    abi: [
      { type: 'function', name: 'approve', selector: '0x095ea7b3', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }] },
      { type: 'function', name: 'transfer', selector: '0xa9059cbb', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }] }
    ] } },
  display: { formats: {
    'approve(address,uint256)': { intent: 'Approve {amount} USDC', fields: [{ path: 'spender', label: 'Spender', format: 'address' }, { path: 'amount', label: 'Amount', format: 'amount', params: { decimals: 6, symbol: 'USDC' } }] },
    'transfer(address,uint256)': { intent: 'Transfer {amount} USDC', fields: [{ path: 'to', label: 'Recipient', format: 'address' }, { path: 'amount', label: 'Amount', format: 'amount', params: { decimals: 6, symbol: 'USDC' } }] }
  } }
};

harness.addMetadata('0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d', baycMeta);
harness.addMetadata('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', usdcMeta);

// BAYC setApprovalForAll(0x1e0049783F008A0085193E00003D00cd54003c71, true)
const baycCalldata = '0xa22cb4650000000000000000000000001e0049783f008a0085193e00003d00cd54003c710000000000000000000000000000000000000000000000000000000000000001';
const bayc = await harness.decoders.decodeCalldata(baycCalldata, '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d', 1);
console.log('\n=== BAYC ===');
console.log('intent:', JSON.stringify(bayc.intent));
console.log('success:', bayc.success);
console.log('noFormat:', bayc.noFormat);
console.log('function:', bayc.function);

// USDC transfer(0x9bf81cc31d0f1fa7ade83058509a4db154a182a2, 100 USDC = 100000000)
const usdcCalldata = '0xa9059cbb0000000000000000000000009bf81cc31d0f1fa7ade83058509a4db154a182a20000000000000000000000000000000000000000000000000000000005f5e100';
const usdc = await harness.decoders.decodeCalldata(usdcCalldata, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 1);
console.log('\n=== USDC ===');
console.log('intent:', JSON.stringify(usdc.intent));
console.log('success:', usdc.success);
console.log('noFormat:', usdc.noFormat);
console.log('function:', usdc.function);

// And the title-formatter applied
const fmt = harness.decoders.formatTitleAddresses;
console.log('\n=== AFTER formatTitleAddresses ===');
console.log('BAYC →', JSON.stringify(fmt(bayc.intent)));
console.log('USDC →', JSON.stringify(fmt(usdc.intent)));
