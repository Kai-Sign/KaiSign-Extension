/**
 * Compound V3 Protocol Tests
 */

import { CONTRACTS } from '../../config.js';
import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const cUSDCAddress = CONTRACTS.lending.compoundV3cUSDC.address.toLowerCase();
  harness.addMetadata(cUSDCAddress, loadMetadata('protocols/compound-v3-cusdc.json'));

  results.push(await harness.runTest({
    name: 'Compound V3 supply',
    calldata: '0xf2b9fdb8' +
      '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' +
      '0000000000000000000000000000000000000000000000000000000005f5e100',
    contractAddress: cUSDCAddress,
    expected: {
      shouldSucceed: true,
      selector: '0xf2b9fdb8',
      functionName: 'supply',
      intent: 'Supply 100.00 USDC to Compound',
      intentContains: '100.00'
    }
  }));

  // Test 2: withdraw(address asset, uint256 amount)
  results.push(await harness.runTest({
    name: 'Compound V3 withdraw',
    calldata: '0xf3fef3a3' +
      '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' + // USDC
      '0000000000000000000000000000000000000000000000000000000002faf080',  // 50000000 = 50 USDC
    contractAddress: cUSDCAddress,
    expected: {
      shouldSucceed: true,
      selector: '0xf3fef3a3',
      functionName: 'withdraw',
      intentContains: 'Compound'
    }
  }));

  return results;
}
