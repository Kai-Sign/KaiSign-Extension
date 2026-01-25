/**
 * Safe (Gnosis) Protocol Tests
 *
 * Tests Safe multisig operations:
 * - createProxyWithNonce (Safe creation)
 * - multiSend (batch transactions)
 * - execTransaction
 * - Module management
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONTRACTS } from '../../config.js';
import { loadMetadata } from '../../lib/metadata-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run Safe protocol tests
 */
export async function runTests(harness) {
  const results = [];

  // Safe Proxy Factory metadata
  const safeFactoryAddress = CONTRACTS.accountAbstraction.safeProxyFactory.address.toLowerCase();
  harness.addMetadata(safeFactoryAddress, loadMetadata('aa/safe-proxy-factory.json'));

  // Test createProxyWithNonce
  results.push(await harness.runTest({
    name: 'Safe createProxyWithNonce (Create Safe Wallet)',
    calldata: '0x1688f0b9' +
      '000000000000000000000000d9db270c1b5e3bd161e8c8503c55ceabee709552' + // singleton
      '0000000000000000000000000000000000000000000000000000000000000060' + // initializer offset
      '0000000000000000000000000000000000000000000000000000000000000001' + // saltNonce
      '0000000000000000000000000000000000000000000000000000000000000164' + // initializer length
      'b63e800d' + // setup selector
      '0000000000000000000000000000000000000000000000000000000000000100' +
      '0000000000000000000000000000000000000000000000000000000000000001' +
      '0000000000000000000000000000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000000000000000000000000140' +
      '000000000000000000000000f48f2b2d2a534e402487b3ee7c18c33aec0fe5e4' +
      '0000000000000000000000000000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000000000000000000000000001' +
      '000000000000000000000000408e2995a8e765e9a417dc98498f7ab773b9af94' +
      '0000000000000000000000000000000000000000000000000000000000000000',
    contractAddress: safeFactoryAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x1688f0b9',
      functionName: 'createProxyWithNonce',
      intentContains: 'Create Safe'
    }
  }));

  // Safe MultiSend metadata
  const multiSendAddress = CONTRACTS.accountAbstraction.safeMultiSend.address.toLowerCase();
  harness.addMetadata(multiSendAddress, loadMetadata('aa/safe-multisend.json'));

  // Test multiSend with ETH transfers
  // Packed format: operation (1) + to (20) + value (32) + dataLength (32) + data (variable)
  const multiSendData = buildMultiSendData([
    {
      operation: 0, // Call
      to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      value: BigInt('1000000000000000000'), // 1 ETH
      data: '0x'
    },
    {
      operation: 0,
      to: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      value: BigInt('500000000000000000'), // 0.5 ETH
      data: '0x'
    }
  ]);

  results.push(await harness.runTest({
    name: 'Safe multiSend (batch ETH transfers)',
    calldata: '0x8d80ff0a' +
      '0000000000000000000000000000000000000000000000000000000000000020' +
      multiSendData,
    contractAddress: multiSendAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x8d80ff0a',
      functionName: 'multiSend',
      intent: 'Execute batch transactions',
      intentContains: 'batch'
    }
  }));

  // Test multiSend with contract interactions
  const multiSendWithContractCalls = buildMultiSendData([
    {
      operation: 0,
      to: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
      value: BigInt(0),
      data: '0x095ea7b3' + // approve
        '000000000000000000000000111111125421ca6dc452d289314280a0f8842a65' +
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    },
    {
      operation: 0,
      to: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
      value: BigInt(0),
      data: '0x2e1a7d4d' + // withdraw
        '0000000000000000000000000000000000000000000000000de0b6b3a7640000'
    }
  ]);

  results.push(await harness.runTest({
    name: 'Safe multiSend (contract interactions)',
    calldata: '0x8d80ff0a' +
      '0000000000000000000000000000000000000000000000000000000000000020' +
      multiSendWithContractCalls,
    contractAddress: multiSendAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x8d80ff0a',
      functionName: 'multiSend',
      intent: 'Execute batch transactions',
      intentContains: 'batch'
    }
  }));

  // Safe Singleton metadata
  const safeSingletonAddress = CONTRACTS.accountAbstraction.safeSingleton.address.toLowerCase();
  harness.addMetadata(safeSingletonAddress, loadMetadata('aa/safe-singleton.json'));

  // Test addOwnerWithThreshold
  results.push(await harness.runTest({
    name: 'Safe addOwnerWithThreshold',
    calldata: '0x0d582f13' +
      '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045' + // new owner
      '0000000000000000000000000000000000000000000000000000000000000002',  // threshold
    contractAddress: safeSingletonAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x0d582f13',
      functionName: 'addOwnerWithThreshold',
      intentContains: 'Add Safe owner'
    }
  }));

  // Test execTransaction with value=0 (should NOT show "Execute 0")
  // This tests the fix for value substitution bug
  results.push(await harness.runTest({
    name: 'Safe execTransaction (value=0, intent should not be "Execute 0")',
    calldata: '0x6a761202' +
      '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' + // to: USDC
      '0000000000000000000000000000000000000000000000000000000000000000' + // value: 0
      '0000000000000000000000000000000000000000000000000000000000000140' + // data offset
      '0000000000000000000000000000000000000000000000000000000000000000' + // operation: Call
      '0000000000000000000000000000000000000000000000000000000000000000' + // safeTxGas
      '0000000000000000000000000000000000000000000000000000000000000000' + // baseGas
      '0000000000000000000000000000000000000000000000000000000000000000' + // gasPrice
      '0000000000000000000000000000000000000000000000000000000000000000' + // gasToken
      '0000000000000000000000000000000000000000000000000000000000000000' + // refundReceiver
      '00000000000000000000000000000000000000000000000000000000000001a0' + // signatures offset
      '0000000000000000000000000000000000000000000000000000000000000044' + // data length (68 bytes = approve)
      '095ea7b3' + // approve selector
      '000000000000000000000000111111125421ca6dc452d289314280a0f8842a65' + // spender
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' + // amount (max)
      '0000000000000000000000000000000000000000000000000000000000000041' + // sig length
      '0000000000000000000000000000000000000000000000000000000000000000' + // sig padding
      '0000000000000000000000000000000000000000000000000000000000000000' + // sig padding
      '0000000000000000000000000000000000000000000000000000000000000000', // sig padding
    contractAddress: safeSingletonAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x6a761202',
      functionName: 'execTransaction',
      intent: 'Execute Safe transaction', // Should NOT be "Execute 0"
      intentDoesNotContain: 'Execute 0'
    }
  }));

  // Load real Safe transactions from fixtures
  const safeOpsFile = path.resolve(__dirname, '../../fixtures/transactions/accountAbstraction-operations.json');
  if (fs.existsSync(safeOpsFile)) {
    const safeOps = JSON.parse(fs.readFileSync(safeOpsFile, 'utf8'));
    const safeTransactions = safeOps.filter(tx =>
      tx.to?.toLowerCase() === safeFactoryAddress ||
      tx.to?.toLowerCase() === multiSendAddress ||
      tx.to?.toLowerCase() === safeSingletonAddress
    );

    console.log(`  Testing ${safeTransactions.length} real Safe transactions`);

    for (const tx of safeTransactions) {
      results.push(await harness.runTest({
        name: tx.description || `Safe tx ${tx.expectedSelector}`,
        calldata: tx.input,
        contractAddress: tx.to,
        expected: {
          shouldSucceed: true,
          selector: tx.expectedSelector
        }
      }));
    }
  }

  return results;
}

/**
 * Build multiSend packed transactions data
 */
function buildMultiSendData(transactions) {
  let data = '';

  for (const tx of transactions) {
    // operation (1 byte)
    data += tx.operation.toString(16).padStart(2, '0');

    // to address (20 bytes)
    data += tx.to.slice(2).toLowerCase();

    // value (32 bytes)
    data += tx.value.toString(16).padStart(64, '0');

    // data length (32 bytes)
    const txData = tx.data.startsWith('0x') ? tx.data.slice(2) : tx.data;
    const dataLength = txData.length / 2;
    data += dataLength.toString(16).padStart(64, '0');

    // data
    data += txData;
  }

  // Return as hex with length prefix
  const totalLength = data.length / 2;
  return totalLength.toString(16).padStart(64, '0') + data;
}
