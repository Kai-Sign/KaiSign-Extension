/**
 * Aave V3 Protocol Tests
 */

import { CONTRACTS } from '../../config.js';
import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const poolAddress = CONTRACTS.lending.aaveV3Pool.address.toLowerCase();
  harness.addMetadata(poolAddress, loadMetadata('protocols/aave-v3-pool.json'));

  results.push(await harness.runTest({
    name: 'Aave V3 supply',
    calldata: '0x617ba037' +
      '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' +
      '0000000000000000000000000000000000000000000000000000000005f5e100' +
      '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045' +
      '0000000000000000000000000000000000000000000000000000000000000000',
    contractAddress: poolAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x617ba037',
      functionName: 'supply',
      intent: 'Supply 100.00 USDC to Aave',
      intentContains: '100.00'
    }
  }));

  return results;
}
