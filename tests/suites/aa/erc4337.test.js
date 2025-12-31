/**
 * ERC-4337 Account Abstraction Tests
 *
 * Tests UserOperation decoding:
 * - handleOps
 * - UserOperation structure
 * - Bundler operations
 */

import { CONTRACTS } from '../../config.js';

/**
 * Run ERC-4337 tests
 */
export async function runTests(harness) {
  const results = [];

  // EntryPoint v0.6 metadata
  const entryPointV06Address = CONTRACTS.accountAbstraction.entryPointV06.address.toLowerCase();

  harness.addMetadata(entryPointV06Address, {
    context: {
      contract: {
        address: entryPointV06Address,
        chainId: 1,
        name: 'ERC-4337 EntryPoint v0.6',
        abi: [
          {
            type: 'function',
            name: 'handleOps',
            selector: '0x1fad948c',
            inputs: [
              {
                name: 'ops',
                type: 'tuple[]',
                components: [
                  { name: 'sender', type: 'address' },
                  { name: 'nonce', type: 'uint256' },
                  { name: 'initCode', type: 'bytes' },
                  { name: 'callData', type: 'bytes' },
                  { name: 'callGasLimit', type: 'uint256' },
                  { name: 'verificationGasLimit', type: 'uint256' },
                  { name: 'preVerificationGas', type: 'uint256' },
                  { name: 'maxFeePerGas', type: 'uint256' },
                  { name: 'maxPriorityFeePerGas', type: 'uint256' },
                  { name: 'paymasterAndData', type: 'bytes' },
                  { name: 'signature', type: 'bytes' }
                ]
              },
              { name: 'beneficiary', type: 'address' }
            ]
          },
          {
            type: 'function',
            name: 'depositTo',
            selector: '0xb760faf9',
            inputs: [
              { name: 'account', type: 'address' }
            ]
          }
        ]
      }
    },
    display: {
      formats: {
        'handleOps((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,uint256,bytes,bytes)[],address)': {
          intent: 'Execute user operations',
          fields: [
            { path: 'ops', label: 'User Operations', format: 'array' },
            { path: 'beneficiary', label: 'Beneficiary', format: 'address' }
          ]
        },
        'depositTo(address)': {
          intent: 'Deposit to account',
          fields: [
            { path: 'account', label: 'Account', format: 'address' }
          ]
        }
      }
    }
  });

  // Test depositTo
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

  // TODO: Add handleOps test with real UserOperation data

  return results;
}
