/**
 * EIP-7702 Delegation Tests
 *
 * Tests EIP-7702 transaction parsing:
 * - Authorization list parsing
 * - Delegation detection
 * - Revocation detection (zero address)
 * - Delegated execution decoding
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONTRACTS, EIP7702_TEST_TX } from '../../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run EIP-7702 tests
 */
export async function runTests(harness) {
  const results = [];

  // Load EIP-7702 transaction fixtures
  const eip7702File = path.resolve(__dirname, '../../fixtures/transactions/eip7702-delegations.json');
  let eip7702Transactions = [];

  if (fs.existsSync(eip7702File)) {
    eip7702Transactions = JSON.parse(fs.readFileSync(eip7702File, 'utf8'));
  }

  // Add Ambire Delegator metadata
  const ambireDelegatorAddress = CONTRACTS.accountAbstraction.ambireDelegator.address.toLowerCase();

  harness.addMetadata(ambireDelegatorAddress, {
    context: {
      contract: {
        address: ambireDelegatorAddress,
        chainId: 1,
        name: 'Ambire EIP-7702 Delegator',
        abi: [
          {
            type: 'function',
            name: 'execute',
            selector: '0xb61d27f6',
            inputs: [
              { name: 'to', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'data', type: 'bytes' }
            ]
          },
          {
            type: 'function',
            name: 'executeBatch',
            selector: '0x47e1da2a',
            inputs: [
              {
                name: 'calls',
                type: 'tuple[]',
                components: [
                  { name: 'to', type: 'address' },
                  { name: 'value', type: 'uint256' },
                  { name: 'data', type: 'bytes' }
                ]
              }
            ]
          }
        ]
      }
    },
    display: {
      formats: {
        'execute(address,uint256,bytes)': {
          intent: 'Execute delegated transaction',
          fields: [
            { path: 'to', label: 'Target', format: 'address' },
            { path: 'value', label: 'Value', format: 'number' },
            { path: 'data', label: 'Data', format: 'calldata', type: 'calldata', to: '$.to' }
          ]
        },
        'executeBatch((address,uint256,bytes)[])': {
          intent: 'Execute batch delegated transactions',
          fields: [
            { path: 'calls', label: 'Calls', format: 'array' }
          ]
        }
      }
    }
  });

  // Test real EIP-7702 transaction from Ambire (if available)
  if (eip7702Transactions.length > 0) {
    console.log(`  Testing ${eip7702Transactions.length} real EIP-7702 transactions`);

    for (const tx of eip7702Transactions) {
      // For EIP-7702, we need to use the advanced decoder
      results.push(await harness.runAdvancedTest({
        name: tx.description || 'EIP-7702 Delegation',
        rawTx: {
          type: tx.type || 4,
          to: tx.to,
          data: tx.input,
          value: tx.value,
          authorizationList: tx.authorizationList || []
        },
        contractAddress: tx.to,
        expected: {
          txType: 'EIP-7702',
          hasDelegations: tx.authorizationList?.length > 0
        }
      }));
    }
  } else {
    console.log('  [WARN] No EIP-7702 transaction fixtures found. Run: npm run fetch-transactions');

    // Add manual test with known EIP-7702 tx hash
    results.push({
      name: `Ambire EIP-7702 Delegation (${EIP7702_TEST_TX.hash.slice(0, 18)}...)`,
      passed: false,
      duration: 0,
      result: null,
      expected: {
        txHash: EIP7702_TEST_TX.hash,
        authority: EIP7702_TEST_TX.authority,
        delegatedTo: EIP7702_TEST_TX.delegatedTo
      },
      error: 'No real transaction data available - run fetch-transactions first',
      skipped: true
    });
  }

  // Test synthetic EIP-7702 authorization parsing

  // Single authorization
  results.push(await harness.runAdvancedTest({
    name: 'EIP-7702 single authorization parsing',
    rawTx: {
      type: 4,
      to: '0x408e2995a8E765E9a417dC98498f7AB773b9Af94',
      data: '0x',
      value: '0x0',
      authorizationList: [
        {
          chainId: 1,
          address: '0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d',
          nonce: 8,
          yParity: '0x1',
          r: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          s: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321'
        }
      ]
    },
    contractAddress: '0x408e2995a8E765E9a417dC98498f7AB773b9Af94',
    expected: {
      txType: 'EIP-7702',
      authorizationCount: 1,
      hasDelegations: true
    }
  }));

  // Multiple authorizations
  results.push(await harness.runAdvancedTest({
    name: 'EIP-7702 multiple authorizations',
    rawTx: {
      type: 4,
      to: '0x408e2995a8E765E9a417dC98498f7AB773b9Af94',
      data: '0x',
      value: '0x0',
      authorizationList: [
        {
          chainId: 1,
          address: '0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d',
          nonce: 8,
          yParity: '0x1',
          r: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          s: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321'
        },
        {
          chainId: 1,
          address: '0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761',
          nonce: 5,
          yParity: '0x0',
          r: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          s: '0x0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba'
        }
      ]
    },
    contractAddress: '0x408e2995a8E765E9a417dC98498f7AB773b9Af94',
    expected: {
      txType: 'EIP-7702',
      authorizationCount: 2,
      hasDelegations: true
    }
  }));

  // Revocation (zero address)
  results.push(await harness.runAdvancedTest({
    name: 'EIP-7702 revocation (zero address delegation)',
    rawTx: {
      type: 4,
      to: '0x408e2995a8E765E9a417dC98498f7AB773b9Af94',
      data: '0x',
      value: '0x0',
      authorizationList: [
        {
          chainId: 1,
          address: '0x0000000000000000000000000000000000000000', // Revocation
          nonce: 10,
          yParity: '0x1',
          r: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          s: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321'
        }
      ]
    },
    contractAddress: '0x408e2995a8E765E9a417dC98498f7AB773b9Af94',
    expected: {
      txType: 'EIP-7702',
      authorizationCount: 1
      // Revocation should be detected by decoder
    }
  }));

  // Delegated execution with calldata
  results.push(await harness.runAdvancedTest({
    name: 'EIP-7702 delegated execute() call',
    rawTx: {
      type: 4,
      to: '0x408e2995a8E765E9a417dC98498f7AB773b9Af94',
      // execute(address to, uint256 value, bytes data)
      data: '0xb61d27f6' +
        '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' + // USDC
        '0000000000000000000000000000000000000000000000000000000000000000' + // 0 value
        '0000000000000000000000000000000000000000000000000000000000000060' + // data offset
        '0000000000000000000000000000000000000000000000000000000000000044' + // data length
        '095ea7b3' + // approve selector
        '000000000000000000000000111111125421ca6dc452d289314280a0f8842a65' + // 1inch router
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' + // unlimited
        '00000000000000000000000000000000000000000000000000000000', // padding
      value: '0x0',
      authorizationList: [
        {
          chainId: 1,
          address: '0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d',
          nonce: 8,
          yParity: '0x1',
          r: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          s: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321'
        }
      ]
    },
    contractAddress: ambireDelegatorAddress,
    expected: {
      txType: 'EIP-7702',
      hasDelegations: true
    }
  }));

  return results;
}
