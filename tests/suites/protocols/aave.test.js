/**
 * Aave V3 Protocol Tests
 */

import { CONTRACTS } from '../../config.js';

export async function runTests(harness) {
  const results = [];

  const poolAddress = CONTRACTS.lending.aaveV3Pool.address.toLowerCase();

  harness.addMetadata(poolAddress, {
    context: {
      contract: {
        address: poolAddress,
        chainId: 1,
        name: 'Aave V3 Pool',
        abi: [
          { type: 'function', name: 'supply', selector: '0x617ba037', inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'onBehalfOf', type: 'address' }, { name: 'referralCode', type: 'uint16' }] },
          { type: 'function', name: 'withdraw', selector: '0x69328dec', inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'to', type: 'address' }] },
          { type: 'function', name: 'borrow', selector: '0xa415bcad', inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'interestRateMode', type: 'uint256' }, { name: 'referralCode', type: 'uint16' }, { name: 'onBehalfOf', type: 'address' }] },
          { type: 'function', name: 'repay', selector: '0x573ade81', inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'interestRateMode', type: 'uint256' }, { name: 'onBehalfOf', type: 'address' }] }
        ]
      }
    },
    display: {
      formats: {
        'supply(address,uint256,address,uint16)': { intent: 'Supply to Aave', fields: [] },
        'withdraw(address,uint256,address)': { intent: 'Withdraw from Aave', fields: [] },
        'borrow(address,uint256,uint256,uint16,address)': { intent: 'Borrow from Aave', fields: [] },
        'repay(address,uint256,uint256,address)': { intent: 'Repay Aave loan', fields: [] }
      }
    }
  });

  results.push(await harness.runTest({
    name: 'Aave V3 supply',
    calldata: '0x617ba037' +
      '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' +
      '0000000000000000000000000000000000000000000000000000000005f5e100' +
      '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045' +
      '0000000000000000000000000000000000000000000000000000000000000000',
    contractAddress: poolAddress,
    expected: { shouldSucceed: true, selector: '0x617ba037', functionName: 'supply' }
  }));

  return results;
}
