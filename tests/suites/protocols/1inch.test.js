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
import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const routerAddress = CONTRACTS.dex.oneInchRouterV6.address.toLowerCase();

  // 1inch unoswap parameters (decoded from calldata):
  // - srcToken: 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 (USDC)
  // - amount: 100000000 (100 USDC, 6 decimals)
  // - minReturn: 1000000000000000000 (1 ETH minimum output)
  // - pools: [0x8000...] (encoded routing path from 1inch API)

  harness.addMetadata(routerAddress, loadMetadata('protocols/1inch-router-v6.json'));

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
      intentContains: 'Swap 100.00 USDC for at least'
      // interpolatedIntent: "Swap {amount} for at least {minReturn}"
      // Note: minReturn can't be formatted as token amount (no dstToken in function)
    }
  }));

  return results;
}
