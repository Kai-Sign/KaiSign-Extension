/**
 * Compound V3 Protocol Tests
 */

import { CONTRACTS } from '../../config.js';

export async function runTests(harness) {
  const results = [];

  const cUSDCAddress = CONTRACTS.lending.compoundV3cUSDC.address.toLowerCase();

  harness.addMetadata(cUSDCAddress, {
    context: {
      contract: {
        address: cUSDCAddress,
        chainId: 1,
        name: 'Compound V3 cUSDC',
        abi: [
          { type: 'function', name: 'supply', selector: '0xf2b9fdb8', inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }] },
          { type: 'function', name: 'withdraw', selector: '0xf3fef3a3', inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }] }
        ]
      }
    },
    display: {
      formats: {
        'supply(address,uint256)': { intent: 'Supply to Compound', fields: [] },
        'withdraw(address,uint256)': { intent: 'Withdraw from Compound', fields: [] }
      }
    }
  });

  results.push(await harness.runTest({
    name: 'Compound V3 supply',
    calldata: '0xf2b9fdb8' +
      '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' +
      '0000000000000000000000000000000000000000000000000000000005f5e100',
    contractAddress: cUSDCAddress,
    expected: { shouldSucceed: true, selector: '0xf2b9fdb8', functionName: 'supply' }
  }));

  return results;
}
