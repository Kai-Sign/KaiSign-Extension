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
import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const cowAddress = CONTRACTS.dex.cowProtocolSettlement.address.toLowerCase();
  const ethFlowAddress = CONTRACTS.dex.cowEthFlow.address.toLowerCase();

  // CoW orderUid structure (56 bytes):
  // - bytes32: order digest (hash of order parameters)
  // - address: owner (20 bytes)
  // - uint32: validTo timestamp (4 bytes)

  harness.addMetadata(cowAddress, loadMetadata('protocols/cow-protocol-settlement.json'));

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
    expected: {
      shouldSucceed: true,
      selector: '0xec6cb13f',
      functionName: 'setPreSignature',
      intentContains: 'Set pre-signature for order'
      // interpolatedIntent: "Set pre-signature for order {orderUid}"
    }
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
    expected: {
      shouldSucceed: true,
      selector: '0x2d9a3f24',
      functionName: 'invalidateOrder',
      intentContains: 'Invalidate order'
      // interpolatedIntent: "Invalidate order {orderUid}"
    }
  }));

  // ==========================================
  // CoW ETH Flow Tests
  // ==========================================
  // ETH Flow contract is used when selling native ETH via CoW Swap
  // Users interact with this contract instead of GPv2Settlement

  harness.addMetadata(ethFlowAddress, loadMetadata('protocols/cow-ethflow.json'));

  // ETH Flow createOrder calldata (from user's actual transaction)
  // Selling ETH for USDC
  const createOrderCalldata = '0x322bba21' +
    '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' + // buyToken (USDC)
    '000000000000000000000000638252f8b5977b5a870756955164319fc9dadf5b' + // receiver
    '0000000000000000000000000000000000000000000000000000aa87bee538000' + // sellAmount
    '0000000000000000000000000000000000000000000000000000000005622848' + // buyAmount
    '8e2e25c2896104b4842d70f9f566332f765a38e27e1daac307eca32acecabfb7' + // appData
    '0000000000000000000000000000000000000000000000000000000000000000' + // feeAmount
    '00000000000000000000000000000000000000000000000000000000698e6b71' + // validTo
    '0000000000000000000000000000000000000000000000000000000000000000' + // partiallyFillable
    '00000000000000000000000000000000000000000000000000000000402e6b4b';  // quoteId

  results.push(await harness.runTest({
    name: 'CoW ETH Flow createOrder',
    calldata: createOrderCalldata,
    contractAddress: ethFlowAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x322bba21',
      functionName: 'createOrder',
       intentContains: 'Sell',  // Interpolated: "Sell {sellAmount} ETH for {buyAmount}"
      // Verify ethAmount format is applied (0.003 ETH, not raw wei)
      intentNotContains: '3000000000000000',
      // Should show formatted ETH amount
       intentMatches: /Sell\s+[\d.]+\s*ETH\s+for\s+[\d.]+\s*USDC/i  // "Sell 0.003 ETH for 5.644932 USDC"
    }
  }));

  // ETH Flow invalidateOrder calldata
  const invalidateEthFlowOrderCalldata = '0x6dd33d2e' +
    '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' + // buyToken (USDC)
    '000000000000000000000000638252f8b5977b5a870756955164319fc9dadf5b' + // receiver
    '0000000000000000000000000000000000000000000000000000aa87bee538000' + // sellAmount
    '0000000000000000000000000000000000000000000000000000000005622848' + // buyAmount
    '8e2e25c2896104b4842d70f9f566332f765a38e27e1daac307eca32acecabfb7' + // appData
    '0000000000000000000000000000000000000000000000000000000000000000' + // feeAmount
    '00000000000000000000000000000000000000000000000000000000698e6b71' + // validTo
    '0000000000000000000000000000000000000000000000000000000000000000' + // partiallyFillable
    '00000000000000000000000000000000000000000000000000000000402e6b4b';  // quoteId

  results.push(await harness.runTest({
    name: 'CoW ETH Flow invalidateOrder',
    calldata: invalidateEthFlowOrderCalldata,
    contractAddress: ethFlowAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x6dd33d2e',
      functionName: 'invalidateOrder',
      intentContains: 'Cancel CoW ETH Flow'
    }
  }));

  // ==========================================
  // CoW ComposableCoW Tests
  // ==========================================
  // ComposableCoW is used for conditional orders like TWAPs, stop-loss, etc.

  const composableAddress = CONTRACTS.dex.cowComposable.address.toLowerCase();
  harness.addMetadata(composableAddress, loadMetadata('protocols/cow-composable.json'));

  // ComposableCoW create conditional order
  // create((address,bytes32,bytes),bool)
  // Generated with: cast calldata "create((address,bytes32,bytes),bool)" "(0x6cF1e9cA41f7611dEf408122793c358a3d11E5a5,0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890,0x1234)" true
  const createConditionalOrderCalldata =
    '0x6bfae1ca' +
    '0000000000000000000000000000000000000000000000000000000000000040' + // offset to params tuple
    '0000000000000000000000000000000000000000000000000000000000000001' + // dispatch = true
    '0000000000000000000000006cf1e9ca41f7611def408122793c358a3d11e5a5' + // handler
    'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' + // salt
    '0000000000000000000000000000000000000000000000000000000000000060' + // offset to staticInput
    '0000000000000000000000000000000000000000000000000000000000000002' + // staticInput length
    '1234000000000000000000000000000000000000000000000000000000000000'; // staticInput data

  results.push(await harness.runTest({
    name: 'CoW ComposableCoW create',
    calldata: createConditionalOrderCalldata,
    contractAddress: composableAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x6bfae1ca',
      functionName: 'create',
      intentContains: 'Create conditional order'
    }
  }));

  // ComposableCoW remove conditional order
  // remove(bytes32)
  const removeConditionalOrderCalldata = '0x95bc2673' +
    'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'; // orderHash

  results.push(await harness.runTest({
    name: 'CoW ComposableCoW remove',
    calldata: removeConditionalOrderCalldata,
    contractAddress: composableAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x95bc2673',
      functionName: 'remove',
      intentContains: 'Remove conditional order'
    }
  }));

  // ComposableCoW setSwapGuard
  // setSwapGuard(address)
  const setSwapGuardCalldata = '0x8f7984ed' +
    '000000000000000000000000deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'; // swapGuard address

  results.push(await harness.runTest({
    name: 'CoW ComposableCoW setSwapGuard',
    calldata: setSwapGuardCalldata,
    contractAddress: composableAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x8f7984ed',
      functionName: 'setSwapGuard',
      intentContains: 'Set swap guard'
    }
  }));

  // ==========================================
  // CoW HooksTrampoline Tests
  // ==========================================
  // HooksTrampoline executes pre/post-swap hooks

  const hooksTrampolineAddress = CONTRACTS.dex.cowHooksTrampoline.address.toLowerCase();
  harness.addMetadata(hooksTrampolineAddress, loadMetadata('protocols/cow-hooks-trampoline.json'));

  // HooksTrampoline execute
  // execute((address,bytes,uint256)[])
  const executeHooksCalldata = '0x760f2a0b' +
    '0000000000000000000000000000000000000000000000000000000000000020' + // offset to hooks array
    '0000000000000000000000000000000000000000000000000000000000000001' + // 1 hook
    '0000000000000000000000000000000000000000000000000000000000000020' + // offset to first hook
    '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' + // target (USDC)
    '0000000000000000000000000000000000000000000000000000000000000060' + // offset to callData
    '00000000000000000000000000000000000000000000000000000000000186a0' + // gasLimit (100000)
    '0000000000000000000000000000000000000000000000000000000000000004' + // callData length
    '70a0823100000000000000000000000000000000000000000000000000000000'; // callData (balanceOf selector)

  results.push(await harness.runTest({
    name: 'CoW HooksTrampoline execute',
    calldata: executeHooksCalldata,
    contractAddress: hooksTrampolineAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x760f2a0b',
      functionName: 'execute',
      intentContains: 'Execute'
    }
  }));

  return results;
}
