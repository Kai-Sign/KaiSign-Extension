/**
 * CoW Protocol GPv2 Settlement Tests
 *
 * OFF-CHAIN BATCH AUCTION:
 * CoW Protocol uses a completely different model - NO on-chain routing:
 *
 * 1. Users sign orders OFF-CHAIN (EIP-712 typed data)
 * 2. Orders are submitted to the CoW orderbook API
 * 3. Solvers compete to find optimal batch settlement:
 *    - Match orders with each other (Coincidence of Wants)
 *    - Route remaining through DEXs
 *    - Minimize MEV extraction
 * 4. Winning solver submits single `settle()` transaction
 *
 * User functions:
 *   - setPreSignature: Approve order on-chain (for smart contracts)
 *   - invalidateOrder: Cancel a pending order
 *
 * Solver functions:
 *   - settle: Execute batch of matched orders
 */

import { CONTRACTS } from '../../config.js';

export async function runTests(harness) {
  const results = [];

  const cowAddress = CONTRACTS.dex.cowProtocolSettlement.address.toLowerCase();

  // CoW orderUid structure (56 bytes):
  // - bytes32: order digest (hash of order parameters)
  // - address: owner (20 bytes)
  // - uint32: validTo timestamp (4 bytes)

  harness.addMetadata(cowAddress, {
    context: {
      contract: {
        address: cowAddress,
        chainId: 1,
        name: 'CoW Protocol GPv2 Settlement',
        abi: [
          {
            type: 'function',
            name: 'settle',
            selector: '0x13d79a0b',
            inputs: [
              { name: 'tokens', type: 'address[]' },
              { name: 'clearingPrices', type: 'uint256[]' },
              {
                name: 'trades',
                type: 'tuple[]',
                components: [
                  { name: 'sellTokenIndex', type: 'uint256' },
                  { name: 'buyTokenIndex', type: 'uint256' },
                  { name: 'receiver', type: 'address' },
                  { name: 'sellAmount', type: 'uint256' },
                  { name: 'buyAmount', type: 'uint256' },
                  { name: 'validTo', type: 'uint32' },
                  { name: 'appData', type: 'bytes32' },
                  { name: 'feeAmount', type: 'uint256' },
                  { name: 'flags', type: 'uint256' },
                  { name: 'executedAmount', type: 'uint256' },
                  { name: 'signature', type: 'bytes' }
                ]
              },
              {
                name: 'interactions',
                type: 'tuple[][3]',
                components: [
                  { name: 'target', type: 'address' },
                  { name: 'value', type: 'uint256' },
                  { name: 'callData', type: 'bytes' }
                ]
              }
            ]
          },
          {
            type: 'function',
            name: 'setPreSignature',
            selector: '0xec6cb13f',
            inputs: [
              { name: 'orderUid', type: 'bytes' },
              { name: 'signed', type: 'bool' }
            ]
          },
          {
            type: 'function',
            name: 'invalidateOrder',
            selector: '0x2d9a3f24',
            inputs: [
              { name: 'orderUid', type: 'bytes' }
            ]
          }
        ]
      }
    },
    display: {
      formats: {
        'settle(address[],uint256[],tuple[],tuple[][3])': {
          intent: 'Settle CoW batch auction',
          fields: [
            { path: 'tokens', label: 'Tokens', format: 'array' },
            { path: 'trades', label: 'Trades (off-chain matched)', format: 'array' },
            { path: 'interactions', label: 'DEX Interactions', format: 'array' }
          ]
        },
        'setPreSignature(bytes,bool)': {
          intent: 'Set CoW order pre-signature',
          fields: [
            { path: 'orderUid', label: 'Order UID', format: 'hex' },
            { path: 'signed', label: 'Approve Order', format: 'boolean' }
          ]
        },
        'invalidateOrder(bytes)': {
          intent: 'Invalidate CoW order',
          fields: [
            { path: 'orderUid', label: 'Order UID', format: 'hex' }
          ]
        }
      }
    }
  });

  // CoW Protocol setPreSignature calldata
  // This is a simpler function to test
  const setPreSignatureCalldata = '0xec6cb13f' +
    '0000000000000000000000000000000000000000000000000000000000000040' + // offset to orderUid
    '0000000000000000000000000000000000000000000000000000000000000001' + // signed = true
    '0000000000000000000000000000000000000000000000000000000000000038' + // orderUid length (56 bytes)
    'd8da6bf26964af9d7eed9e03e53415d37aa96045' + // owner (20 bytes)
    '0000000000000000000000000000000000000000000000000000000067890000' + // validTo (4 bytes padded)
    '0000000000000000000000000000000000000000000000000000000000000000'; // padding

  results.push(await harness.runTest({
    name: 'CoW setPreSignature',
    calldata: setPreSignatureCalldata,
    contractAddress: cowAddress,
    expected: { shouldSucceed: true, selector: '0xec6cb13f', functionName: 'setPreSignature', intent: 'Set CoW order pre-signature' }
  }));

  // CoW Protocol invalidateOrder calldata
  const invalidateOrderCalldata = '0x2d9a3f24' +
    '0000000000000000000000000000000000000000000000000000000000000020' + // offset
    '0000000000000000000000000000000000000000000000000000000000000038' + // orderUid length
    'd8da6bf26964af9d7eed9e03e53415d37aa96045' + // owner (20 bytes)
    '0000000000000000000000000000000000000000000000000000000067890000' + // validTo
    '0000000000000000000000000000000000000000000000000000000000000000'; // padding

  results.push(await harness.runTest({
    name: 'CoW invalidateOrder',
    calldata: invalidateOrderCalldata,
    contractAddress: cowAddress,
    expected: { shouldSucceed: true, selector: '0x2d9a3f24', functionName: 'invalidateOrder', intent: 'Invalidate CoW order' }
  }));

  return results;
}
