/**
 * 1inch Protocol Tests
 *
 * OFF-CHAIN ROUTING:
 * 1inch Pathfinder API computes optimal route across 300+ liquidity sources.
 * The `pools` array encodes the routing path:
 *   - High bit (0x80...) = swap direction (0=token0→token1, 1=token1→token0)
 *   - Lower bits = pool address
 *
 * Example pools[0] = 0x8000...0000:
 *   - Direction bit set (1) = swap token1 to token0
 *   - Pool address = 0x0000...0000 (placeholder in test)
 */

import { CONTRACTS } from '../../config.js';

export async function runTests(harness) {
  const results = [];

  const routerAddress = CONTRACTS.dex.oneInchRouterV6.address.toLowerCase();

  // 1inch unoswap parameters (decoded from calldata):
  // - srcToken: 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 (USDC)
  // - amount: 100000000 (100 USDC, 6 decimals)
  // - minReturn: 1000000000000000000 (1 ETH minimum output)
  // - pools: [0x8000...] (encoded routing path from 1inch API)

  harness.addMetadata(routerAddress, {
    context: {
      contract: {
        address: routerAddress,
        chainId: 1,
        name: '1inch Aggregation Router V6',
        abi: [
          {
            type: 'function',
            name: 'swap',
            selector: '0x12aa3caf',
            inputs: [
              { name: 'executor', type: 'address' },
              { name: 'desc', type: 'tuple', components: [
                { name: 'srcToken', type: 'address' },
                { name: 'dstToken', type: 'address' },
                { name: 'srcReceiver', type: 'address' },
                { name: 'dstReceiver', type: 'address' },
                { name: 'amount', type: 'uint256' },
                { name: 'minReturnAmount', type: 'uint256' },
                { name: 'flags', type: 'uint256' }
              ]},
              { name: 'permit', type: 'bytes' },
              { name: 'data', type: 'bytes' }
            ]
          },
          {
            type: 'function',
            name: 'unoswap',
            selector: '0x0502b1c5',
            inputs: [
              { name: 'srcToken', type: 'address' },
              { name: 'amount', type: 'uint256' },
              { name: 'minReturn', type: 'uint256' },
              { name: 'pools', type: 'uint256[]' }
            ]
          }
        ]
      }
    },
    display: {
      formats: {
        'swap(address,tuple,bytes,bytes)': {
          intent: 'Swap {desc.amount} via 1inch',
          fields: [
            { path: 'desc.srcToken', label: 'From Token', format: 'address' },
            { path: 'desc.dstToken', label: 'To Token', format: 'address' },
            { path: 'desc.amount', label: 'Amount', format: 'amount', params: { decimals: 6, symbol: 'USDC' } },
            { path: 'desc.minReturnAmount', label: 'Minimum Output', format: 'amount', params: { decimals: 18, symbol: 'ETH' } }
          ]
        },
        'unoswap(address,uint256,uint256,uint256[])': {
          intent: 'Swap {amount} via 1inch',
          fields: [
            { path: 'srcToken', label: 'From Token', format: 'address' },
            { path: 'amount', label: 'Amount In', format: 'amount', params: { decimals: 6, symbol: 'USDC' } },
            { path: 'minReturn', label: 'Min Amount Out', format: 'amount', params: { decimals: 18, symbol: 'ETH' } },
            { path: 'pools', label: 'Route (off-chain)', format: 'array' }
          ]
        }
      }
    }
  });

  // Real 1inch unoswap calldata:
  // Swapping 100 USDC → minimum 1 ETH
  // pools[] contains off-chain computed routing through DEX pools
  results.push(await harness.runTest({
    name: '1inch unoswap (100 USDC → min 1 ETH)',
    calldata: '0x0502b1c5' +
      '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' + // srcToken: USDC
      '0000000000000000000000000000000000000000000000000000000005f5e100' + // amount: 100,000,000 (100 USDC)
      '0000000000000000000000000000000000000000000000000de0b6b3a7640000' + // minReturn: 1e18 (1 ETH)
      '0000000000000000000000000000000000000000000000000000000000000080' + // pools offset
      '0000000000000000000000000000000000000000000000000000000000000001' + // pools.length = 1
      '8000000000000000000000000000000000000000000000000000000000000000', // pools[0]: direction=1, pool=0x0
    contractAddress: routerAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x0502b1c5',
      functionName: 'unoswap',
      intentContains: 'Swap'
    }
  }));

  return results;
}
