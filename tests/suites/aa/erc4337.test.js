/**
 * ERC-4337 Account Abstraction Tests
 *
 * Tests UserOperation decoding:
 * - handleOps with nested callData decoding
 * - UserOperation structure
 * - Smart account execute() operations
 * - Token amounts and names in nested intents
 */

import { CONTRACTS } from '../../config.js';
import { loadMetadata, loadMetadataWithAddress } from '../../lib/metadata-loader.js';

/**
 * Run ERC-4337 tests
 */
export async function runTests(harness) {
  const results = [];

  // EntryPoint v0.6 metadata
  const entryPointV06Address = CONTRACTS.accountAbstraction.entryPointV06.address.toLowerCase();
  harness.addMetadata(entryPointV06Address, loadMetadata('aa/erc4337-entrypoint-v06.json'));

  // Smart Account metadata (for nested callData decoding)
  // Common ERC-4337 smart account interface (SimpleAccount, Biconomy, etc.)
  const smartAccountAddress = '0xabcdef1234567890abcdef1234567890abcdef12';
  harness.addMetadata(smartAccountAddress, loadMetadataWithAddress('aa/smart-account.json', smartAccountAddress));

  // USDC metadata for nested approve calls (same as EIP-7702 test)
  const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  harness.addMetadata(usdcAddress, loadMetadata('tokens/usdc.json'));

  // Test depositTo (simple case)
  results.push(await harness.runTest({
    name: 'EntryPoint depositTo',
    calldata: '0xb760faf9' +
      '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045',
    contractAddress: entryPointV06Address,
    expected: {
      shouldSucceed: true,
      selector: '0xb760faf9',
      functionName: 'depositTo',
      intentContains: 'Deposit'
    }
  }));

  // ============================================================
  // Real ERC-4337 handleOps with nested USDC approve
  // ============================================================
  // This demonstrates decoding nested operations:
  // handleOps → UserOperation.callData → execute() → USDC.approve()
  //
  // UserOperation contains:
  //   sender: Smart account address
  //   callData: execute(USDC, 0, approve(spender, 100 USDC))
  //
  // Expected decoded intent: "Approve 100.00 USDC"
  // ============================================================

  // Inner calldata: approve(1inch router, 100 USDC)
  // approve(address spender, uint256 amount)
  // Amount: 100 USDC = 100 * 10^6 = 100000000 = 0x5F5E100
  const approveCalldata =
    '095ea7b3' + // approve selector
    '000000000000000000000000111111125421ca6dc452d289314280a0f8842a65' + // spender: 1inch router
    '0000000000000000000000000000000000000000000000000000000005f5e100';  // amount: 100 USDC

  // Smart account execute calldata: execute(USDC, 0, approveCalldata)
  // execute(address dest, uint256 value, bytes func)
  const executeCalldata =
    'b61d27f6' + // execute selector
    '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' + // dest: USDC
    '0000000000000000000000000000000000000000000000000000000000000000' + // value: 0
    '0000000000000000000000000000000000000000000000000000000000000060' + // func offset: 96
    '0000000000000000000000000000000000000000000000000000000000000044' + // func length: 68 bytes
    approveCalldata +
    '00000000000000000000000000000000000000000000000000000000'; // padding to 32-byte boundary

  // Full handleOps calldata with one UserOperation
  // handleOps(UserOperation[] ops, address beneficiary)
  //
  // UserOperation struct:
  //   address sender
  //   uint256 nonce
  //   bytes initCode
  //   bytes callData      <- This contains execute(USDC, 0, approve(...))
  //   uint256 callGasLimit
  //   uint256 verificationGasLimit
  //   uint256 preVerificationGas
  //   uint256 maxFeePerGas
  //   uint256 maxPriorityFeePerGas
  //   bytes paymasterAndData
  //   bytes signature
  const handleOpsCalldata = '0x1fad948c' + // handleOps selector
    // Head section
    '0000000000000000000000000000000000000000000000000000000000000040' + // ops array offset: 64
    '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045' + // beneficiary
    // Array at offset 64
    '0000000000000000000000000000000000000000000000000000000000000001' + // array length: 1
    '0000000000000000000000000000000000000000000000000000000000000020' + // offset to first tuple: 32 (relative to array start)
    // UserOperation tuple at offset 64 + 64 = 128
    '000000000000000000000000abcdef1234567890abcdef1234567890abcdef12' + // sender (smart account)
    '0000000000000000000000000000000000000000000000000000000000000000' + // nonce: 0
    '0000000000000000000000000000000000000000000000000000000000000160' + // initCode offset (from tuple start)
    '0000000000000000000000000000000000000000000000000000000000000180' + // callData offset
    '00000000000000000000000000000000000000000000000000000000000f4240' + // callGasLimit: 1,000,000
    '00000000000000000000000000000000000000000000000000000000000186a0' + // verificationGasLimit: 100,000
    '000000000000000000000000000000000000000000000000000000000000c350' + // preVerificationGas: 50,000
    '000000000000000000000000000000000000000000000000000000174876e800' + // maxFeePerGas: 100 gwei
    '0000000000000000000000000000000000000000000000000000000077359400' + // maxPriorityFeePerGas: 2 gwei
    '00000000000000000000000000000000000000000000000000000000000002a0' + // paymasterAndData offset
    '00000000000000000000000000000000000000000000000000000000000002c0' + // signature offset
    // initCode at tuple offset 0x160 (empty)
    '0000000000000000000000000000000000000000000000000000000000000000' + // length: 0
    // callData at tuple offset 0x180
    '00000000000000000000000000000000000000000000000000000000000000e4' + // length: 228 bytes
    executeCalldata +
    // paymasterAndData at tuple offset 0x2a0 (empty)
    '0000000000000000000000000000000000000000000000000000000000000000' + // length: 0
    // signature at tuple offset 0x2c0
    '0000000000000000000000000000000000000000000000000000000000000041' + // length: 65 bytes
    'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' + // r
    'cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe' + // s
    '1b00000000000000000000000000000000000000000000000000000000000000'; // v (27) + padding

  results.push(await harness.runAdvancedTest({
    name: 'ERC-4337 handleOps with USDC approve',
    rawTx: {
      type: 2, // Regular EIP-1559 tx (bundler submits handleOps)
      to: entryPointV06Address,
      data: handleOpsCalldata,
      value: '0x0'
    },
    contractAddress: entryPointV06Address,
    expected: {
      shouldSucceed: true,
      selector: '0x1fad948c',
      functionName: 'handleOps',
      // Validate nested structure with exact intents
      nestedIntents: [
        'Execute account operation',  // Smart account execute
        'Approve 100.00 USDC'  // Leaf USDC approve - exact match
      ],
      intentContains: 'Approve',
      nestedIntentContains: ['100.00', 'USDC']  // Keep existing for backwards compat
    }
  }));

  return results;
}
