/**
 * 1inch Protocol Tests
 */

import { CONTRACTS } from '../../config.js';

export async function runTests(harness) {
  const results = [];

  const routerAddress = CONTRACTS.dex.oneInchRouterV6.address.toLowerCase();

  harness.addMetadata(routerAddress, {
    context: {
      contract: {
        address: routerAddress,
        chainId: 1,
        name: '1inch Aggregation Router V6',
        abi: [
          { type: 'function', name: 'swap', selector: '0x12aa3caf', inputs: [{ name: 'executor', type: 'address' }, { name: 'desc', type: 'tuple', components: [] }, { name: 'permit', type: 'bytes' }, { name: 'data', type: 'bytes' }] },
          { type: 'function', name: 'unoswap', selector: '0x0502b1c5', inputs: [{ name: 'srcToken', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'minReturn', type: 'uint256' }, { name: 'pools', type: 'uint256[]' }] }
        ]
      }
    },
    display: {
      formats: {
        'swap(address,(address,address,address,address,uint256,uint256,uint256),bytes,bytes)': { intent: 'Swap via 1inch', fields: [] },
        'unoswap(address,uint256,uint256,uint256[])': { intent: 'Swap via 1inch Unoswap', fields: [] }
      }
    }
  });

  results.push(await harness.runTest({
    name: '1inch unoswap',
    calldata: '0x0502b1c5' +
      '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' +
      '0000000000000000000000000000000000000000000000000000000005f5e100' +
      '0000000000000000000000000000000000000000000000000de0b6b3a7640000' +
      '0000000000000000000000000000000000000000000000000000000000000080' +
      '0000000000000000000000000000000000000000000000000000000000000001' +
      '8000000000000000000000000000000000000000000000000000000000000000',
    contractAddress: routerAddress,
    expected: { shouldSucceed: true, selector: '0x0502b1c5', functionName: 'unoswap' }
  }));

  return results;
}
