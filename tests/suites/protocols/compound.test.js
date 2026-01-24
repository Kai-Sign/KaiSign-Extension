/**
 * Compound V3 Protocol Tests
 */

import { CONTRACTS } from '../../config.js';
import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const cUSDCAddress = CONTRACTS.lending.compoundV3cUSDC.address.toLowerCase();
  harness.addMetadata(cUSDCAddress, loadMetadata('protocols/compound-v3-cusdc.json'));
  const altCUSDCAddress = '0xa17581a9e3356d9a858b789d68b4d866e593ae94';
  harness.addMetadata(altCUSDCAddress, loadMetadata('protocols/compound-v3-cusdc-a175.json'));

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

  results.push(await harness.runTest({
    name: 'Compound V3 supply (alt cUSDC)',
    calldata: '0xf2b9fdb8' +
      '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' +
      '00000000000000000000000000000000000000000000000000000000000186a0',
    contractAddress: altCUSDCAddress,
    expected: {
      shouldSucceed: true,
      selector: '0xf2b9fdb8',
      functionName: 'supply',
      intentContains: 'Supply'
    }
  }));

  return results;
}
