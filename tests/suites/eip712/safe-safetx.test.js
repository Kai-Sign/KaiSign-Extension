/**
 * Safe SafeTx EIP-712 Tests
 *
 * Tests EIP-712 minimal domain (chainId only, no name/version) and
 * wildcard verifyingContract. The Safe SafeTx format also has a
 * `calldata` format field for embedded transaction data.
 */

import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  // Safe metadata uses wildcard verifyingContract
  const safeAddress = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
  harness.addMetadata(safeAddress, loadMetadata('eip712/safe-safetx.json'));

  // Test 1: Simple ETH transfer via Safe
  results.push(await harness.runEIP712Test({
    name: 'Safe SafeTx: ETH transfer (minimal domain)',
    typedData: {
      domain: {
        chainId: 1,
        verifyingContract: safeAddress
      },
      primaryType: 'SafeTx',
      types: {
        EIP712Domain: [
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' }
        ],
        SafeTx: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
          { name: 'operation', type: 'uint8' },
          { name: 'safeTxGas', type: 'uint256' },
          { name: 'baseGas', type: 'uint256' },
          { name: 'gasPrice', type: 'uint256' },
          { name: 'gasToken', type: 'address' },
          { name: 'refundReceiver', type: 'address' },
          { name: 'nonce', type: 'uint256' }
        ]
      },
      message: {
        to: '0x1234567890abcdef1234567890abcdef12345678',
        value: '1000000000000000000', // 1 ETH
        data: '0x',
        operation: 0, // Call
        safeTxGas: '0',
        baseGas: '0',
        gasPrice: '0',
        gasToken: '0x0000000000000000000000000000000000000000',
        refundReceiver: '0x0000000000000000000000000000000000000000',
        nonce: '42'
      }
    },
    expected: {
      shouldSucceed: true,
      primaryType: 'SafeTx',
      intentContains: 'Safe',
      hasFields: ['to', 'value', 'data', 'operation', 'nonce']
    }
  }));

  // Test 2: Safe with embedded calldata (ERC-20 approve)
  results.push(await harness.runEIP712Test({
    name: 'Safe SafeTx: embedded USDC approve calldata',
    typedData: {
      domain: {
        chainId: 1,
        verifyingContract: safeAddress
      },
      primaryType: 'SafeTx',
      types: {
        EIP712Domain: [
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' }
        ],
        SafeTx: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
          { name: 'operation', type: 'uint8' },
          { name: 'safeTxGas', type: 'uint256' },
          { name: 'baseGas', type: 'uint256' },
          { name: 'gasPrice', type: 'uint256' },
          { name: 'gasToken', type: 'address' },
          { name: 'refundReceiver', type: 'address' },
          { name: 'nonce', type: 'uint256' }
        ]
      },
      message: {
        to: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC contract
        value: '0',
        data: '0x095ea7b3000000000000000000000000111111125421ca6dc452d289314280a0f8842a65ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', // approve(1inch, max)
        operation: 0,
        safeTxGas: '0',
        baseGas: '0',
        gasPrice: '0',
        gasToken: '0x0000000000000000000000000000000000000000',
        refundReceiver: '0x0000000000000000000000000000000000000000',
        nonce: '43'
      }
    },
    expected: {
      shouldSucceed: true,
      primaryType: 'SafeTx',
      intentContains: 'Safe',
      hasFields: ['to', 'data']
    }
  }));

  // Test 3: DelegateCall operation
  results.push(await harness.runEIP712Test({
    name: 'Safe SafeTx: delegateCall operation',
    typedData: {
      domain: {
        chainId: 1,
        verifyingContract: safeAddress
      },
      primaryType: 'SafeTx',
      types: {
        EIP712Domain: [
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' }
        ],
        SafeTx: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
          { name: 'operation', type: 'uint8' },
          { name: 'safeTxGas', type: 'uint256' },
          { name: 'baseGas', type: 'uint256' },
          { name: 'gasPrice', type: 'uint256' },
          { name: 'gasToken', type: 'address' },
          { name: 'refundReceiver', type: 'address' },
          { name: 'nonce', type: 'uint256' }
        ]
      },
      message: {
        to: '0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761', // Safe MultiSend
        value: '0',
        data: '0x8d80ff0a', // multiSend selector (truncated for test)
        operation: 1, // DelegateCall
        safeTxGas: '500000',
        baseGas: '100000',
        gasPrice: '0',
        gasToken: '0x0000000000000000000000000000000000000000',
        refundReceiver: '0x0000000000000000000000000000000000000000',
        nonce: '44'
      }
    },
    expected: {
      shouldSucceed: true,
      primaryType: 'SafeTx',
      hasFields: ['operation']
    }
  }));

  return results;
}
