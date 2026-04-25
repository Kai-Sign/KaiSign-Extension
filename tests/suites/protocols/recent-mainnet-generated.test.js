/**
 * Recent Mainnet Generated Metadata Tests
 *
 * Verifies generated metadata from recent live samples against a second
 * similar transaction on the same contract address.
 */

import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const tetherAddress = '0xdac17f958d2ee523a2206206994597c13d831ec7';
  harness.addMetadata(tetherAddress, loadMetadata('recent-mainnet/tethertoken-0xdac17f958d2ee523a2206206994597c13d831ec7.json'));

  results.push(await harness.runTest({
    name: 'Recent-mainnet generated metadata: TetherToken transfer second live sample',
    calldata: '0xa9059cbb0000000000000000000000009bf81cc31d0f1fa7ade83058509a4db154a182a20000000000000000000000000000000000000000000000000000000022dd82f1',
    contractAddress: tetherAddress,
    expected: {
      shouldSucceed: true,
      functionName: 'transfer',
      intentContains: 'USDT',
      params: {
        _to: '0x9bf81cc31d0f1fa7ade83058509a4db154a182a2',
        _value: '584942321'
      }
    }
  }));

  // ABI-only ERC-20 fallback: re-register USDT with display.formats stripped.
  // Verifies the decoder synthesizes a "Transfer {_value} to {_to}" template +
  // amount fieldDef from getTokenMetadata, so titles surface decimals even when
  // no curated ERC-7730 format exists for the selector.
  harness.addMetadata(tetherAddress, loadMetadata('recent-mainnet/tethertoken-noformat-0xdac17f958d2ee523a2206206994597c13d831ec7.json'));

  results.push(await harness.runTest({
    name: 'Recent-mainnet generated metadata: TetherToken transfer ABI-only decimals fallback',
    calldata: '0xa9059cbb0000000000000000000000009bf81cc31d0f1fa7ade83058509a4db154a182a20000000000000000000000000000000000000000000000000000000022dd82f1',
    contractAddress: tetherAddress,
    expected: {
      shouldSucceed: true,
      functionName: 'transfer',
      // Decoder must surface USDT decimals (584942321 / 10^6 = 584.942321) — not raw wei.
      intentContains: '584.942321 USDT'
    }
  }));

  return results;
}
