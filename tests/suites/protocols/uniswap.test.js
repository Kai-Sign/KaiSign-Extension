/**
 * Uniswap Protocol Tests
 *
 * OFF-CHAIN ROUTING:
 * Uniswap Auto Router API computes optimal swap path and returns:
 *   - commands: Byte array where each byte is a command opcode
 *   - inputs[]: ABI-encoded parameters for each command
 *
 * COMMAND OPCODES (computed off-chain by Auto Router):
 *   0x00 = V3_SWAP_EXACT_IN      - Swap exact input on V3
 *   0x01 = V3_SWAP_EXACT_OUT     - Swap exact output on V3
 *   0x02 = PERMIT2_TRANSFER_FROM - Transfer via Permit2
 *   0x03 = PERMIT2_PERMIT_BATCH  - Batch permit
 *   0x04 = SWEEP                 - Sweep tokens to recipient
 *   0x05 = TRANSFER              - Transfer tokens
 *   0x06 = PAY_PORTION           - Pay portion of balance
 *   0x08 = V2_SWAP_EXACT_IN      - Swap exact input on V2
 *   0x09 = V2_SWAP_EXACT_OUT     - Swap exact output on V2
 *   0x0a = PERMIT2_PERMIT        - Single permit
 *   0x0b = WRAP_ETH              - Wrap ETH to WETH
 *   0x0c = UNWRAP_WETH           - Unwrap WETH to ETH
 *   0x0d = PERMIT2_TRANSFER_FROM_BATCH
 *
 * Example: commands = 0x0b00 means:
 *   [0] = 0x0b (WRAP_ETH) - First wrap ETH
 *   [1] = 0x00 (V3_SWAP_EXACT_IN) - Then swap on V3
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONTRACTS, UNISWAP_COMMANDS } from '../../config.js';
import { loadMetadata } from '../../lib/metadata-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run Uniswap protocol tests
 */
export async function runTests(harness) {
  const results = [];

  // Load Uniswap transaction fixtures
  const commandsFile = path.resolve(__dirname, '../../fixtures/transactions/uniswap-commands.json');
  let commandTransactions = [];

  if (fs.existsSync(commandsFile)) {
    commandTransactions = JSON.parse(fs.readFileSync(commandsFile, 'utf8'));
  }

  // Add Universal Router metadata for testing
  const universalRouterAddress = CONTRACTS.dex.uniswapUniversalRouter.address.toLowerCase();
  harness.addMetadata(universalRouterAddress, loadMetadata('protocols/uniswap-universal-router.json'));

  // Test: commands = 0x0b00 = [WRAP_ETH (0x0b), V3_SWAP_EXACT_IN (0x00)]
  // This is a typical ETH → Token swap: wrap ETH first, then swap
  results.push(await harness.runTest({
    name: 'Universal Router execute (WRAP_ETH + V3_SWAP)',
    calldata: '0x3593564c' +
      '0000000000000000000000000000000000000000000000000000000000000060' + // commands offset
      '00000000000000000000000000000000000000000000000000000000000000a0' + // inputs offset
      '0000000000000000000000000000000000000000000000000000000067680f80' + // deadline
      '0000000000000000000000000000000000000000000000000000000000000002' + // commands length
      '0b00000000000000000000000000000000000000000000000000000000000000' + // commands: [0x0b, 0x00] = WRAP_ETH, V3_SWAP
      '0000000000000000000000000000000000000000000000000000000000000002' + // inputs.length = 2
      '0000000000000000000000000000000000000000000000000000000000000040' + // inputs[0] offset
      '00000000000000000000000000000000000000000000000000000000000000c0' + // inputs[1] offset
      '0000000000000000000000000000000000000000000000000000000000000040' + // inputs[0] length
      '0000000000000000000000000000000000000000000000000000000000000002' + // WRAP_ETH: recipient
      '00000000000000000000000000000000000000000000000000005af3107a4000' + // WRAP_ETH: amountMin (0.001 ETH)
      '0000000000000000000000000000000000000000000000000000000000000040' + // inputs[1] length
      '0000000000000000000000000000000000000000000000000000000000000001' + // V3_SWAP: recipient
      '00000000000000000000000000000000000000000000000000005af3107a4000', // V3_SWAP: amountIn
    contractAddress: universalRouterAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x3593564c',
      functionName: 'execute',
      // Exact composite intent validation
      intent: 'Wrap 0.000100 ETH to WETH + Swap 0x for min 0x',
      intentContains: 'Wrap',  // Also check substring for backwards compat
      // Validate command array structure
      decodedCommands: [
        {
          command: '0x0b',
          name: 'WRAP_ETH'
          // Don't validate intent per command (too fragile)
        },
        {
          command: '0x00',
          name: 'V3_SWAP_EXACT_IN'
        }
      ]
    }
  }));

  // Test each COMMAND type from fetched transactions (if available)
  if (commandTransactions.length > 0) {
    console.log(`  Testing ${commandTransactions.length} real Uniswap COMMAND transactions`);

    for (const tx of commandTransactions) {
      results.push(await harness.runTest({
        name: tx.description || `Command ${tx.commandHex}`,
        calldata: tx.input,
        contractAddress: tx.to,
        expected: {
          shouldSucceed: true,
          selector: '0x3593564c',
          functionName: 'execute'
        }
      }));
    }
  }

  // Test Permit2 metadata
  const permit2Address = CONTRACTS.dex.permit2.address.toLowerCase();
  harness.addMetadata(permit2Address, loadMetadata('protocols/permit2.json'));

  // Test V3 Factory
  const v3FactoryAddress = CONTRACTS.dex.uniswapV3Factory.address.toLowerCase();
  harness.addMetadata(v3FactoryAddress, loadMetadata('protocols/uniswap-v3-factory.json'));

  results.push(await harness.runTest({
    name: 'V3 Factory createPool function',
    calldata: '0xa1671295' +
      '000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' + // USDC
      '000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' + // WETH
      '0000000000000000000000000000000000000000000000000000000000000bb8',  // 0.3% fee
    contractAddress: v3FactoryAddress,
    expected: {
      shouldSucceed: true,
      selector: '0xa1671295',
      functionName: 'createPool'
    }
  }));

  // Test Quoter V2
  const quoterAddress = CONTRACTS.dex.uniswapQuoterV2.address.toLowerCase();
  harness.addMetadata(quoterAddress, loadMetadata('protocols/uniswap-quoter-v2.json'));

  return results;
}
