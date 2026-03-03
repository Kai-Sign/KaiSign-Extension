/**
 * Transaction Fetch Script
 *
 * Fetches real mainnet transaction calldata from Etherscan
 * for each contract function to use as test fixtures.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { CONTRACTS, UNISWAP_COMMANDS, EIP7702_TEST_TX } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';
const ALCHEMY_RPC = process.env.ALCHEMY_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo';
const DELAY_MS = 250; // Rate limiting

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch recent transactions for a contract
 * Uses Etherscan V2 API (requires V2-enabled API key)
 */
async function fetchRecentTransactions(address, chainId = 1, maxTxs = 100) {
  // Etherscan V2 API format
  const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&page=1&offset=${maxTxs}&apikey=${ETHERSCAN_API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === '1' && Array.isArray(data.result)) {
      return data.result.filter(tx => tx.input && tx.input.length > 10);
    }

    // V2 API requires a V2-enabled API key
    if (data.message === 'NOTOK' && data.result?.includes('Invalid API Key')) {
      console.warn(`  [WARN] Etherscan V2 API requires a V2-enabled API key. Get one at https://etherscan.io/myapikey`);
    }

    return [];
  } catch (e) {
    console.error(`[Etherscan] Error fetching transactions:`, e.message);
    return [];
  }
}

/**
 * Fetch single transaction by hash using Alchemy RPC
 */
async function fetchTransactionByHash(txHash, chainId = 1) {
  try {
    const response = await fetch(ALCHEMY_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionByHash',
        params: [txHash]
      })
    });
    const data = await response.json();

    if (data.result) {
      return data.result;
    }
    return null;
  } catch (e) {
    console.error(`[Alchemy] Error fetching tx ${txHash}:`, e.message);
    return null;
  }
}

/**
 * Get Etherscan API URL for chain
 */
function getEtherscanApiUrl(chainId) {
  switch (chainId) {
    case 1:
      return 'https://api.etherscan.io/api';
    case 11155111:
      return 'https://api-sepolia.etherscan.io/api';
    default:
      return 'https://api.etherscan.io/api';
  }
}

/**
 * Calculate function selector
 */
function calculateSelector(signature) {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(signature));
  return hash.slice(0, 10);
}

/**
 * Group transactions by function selector
 */
function groupBySelector(transactions) {
  const grouped = {};

  for (const tx of transactions) {
    const selector = tx.input.slice(0, 10);
    if (!grouped[selector]) {
      grouped[selector] = [];
    }
    grouped[selector].push(tx);
  }

  return grouped;
}

/**
 * Extract one transaction per function
 */
function extractOnePerFunction(transactions, contractInfo) {
  const grouped = groupBySelector(transactions);
  const results = [];

  for (const [selector, txs] of Object.entries(grouped)) {
    // Take first transaction for this selector
    const tx = txs[0];

    results.push({
      description: `${contractInfo.name} - ${selector}`,
      hash: tx.hash,
      from: tx.from,
      to: tx.to || contractInfo.address,
      input: tx.input,
      value: tx.value,
      blockNumber: tx.blockNumber,
      expectedSelector: selector,
      expectedFunction: null // Will be populated from metadata
    });
  }

  return results;
}

/**
 * Fetch transactions for Uniswap Universal Router with COMMANDS
 */
async function fetchUniswapCommands() {
  console.log('\n[Uniswap] Fetching Universal Router transactions...');

  const routerAddress = CONTRACTS.dex.uniswapUniversalRouter.address;
  const transactions = await fetchRecentTransactions(routerAddress, 1, 500);

  console.log(`  Found ${transactions.length} transactions`);

  // We need to find transactions that use different commands
  // The execute function has commands as first parameter (bytes)
  const commandExamples = [];
  const seenCommands = new Set();

  for (const tx of transactions) {
    if (tx.input.length < 10) continue;

    const selector = tx.input.slice(0, 10);

    // Execute selector: 0x3593564c
    if (selector !== '0x3593564c') continue;

    // Parse the commands bytes from calldata
    // execute(bytes commands, bytes[] inputs, uint256 deadline)
    try {
      // First param is offset to commands (dynamic)
      const commandsOffset = parseInt(tx.input.slice(10, 74), 16) * 2;
      const commandsLength = parseInt(tx.input.slice(10 + commandsOffset, 10 + commandsOffset + 64), 16);
      const commandsData = tx.input.slice(10 + commandsOffset + 64, 10 + commandsOffset + 64 + commandsLength * 2);

      // Each command is 1 byte
      for (let i = 0; i < commandsData.length; i += 2) {
        const command = parseInt(commandsData.slice(i, i + 2), 16);
        const commandHex = '0x' + command.toString(16).padStart(2, '0');

        if (!seenCommands.has(command)) {
          seenCommands.add(command);

          // Find command name
          const commandName = Object.entries(UNISWAP_COMMANDS).find(([, v]) => v === command)?.[0] || `UNKNOWN_${commandHex}`;

          commandExamples.push({
            description: `Uniswap Command: ${commandName} (${commandHex})`,
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            input: tx.input,
            value: tx.value,
            blockNumber: tx.blockNumber,
            command: command,
            commandHex: commandHex,
            commandName: commandName,
            expectedSelector: selector,
            expectedFunction: 'execute(bytes,bytes[],uint256)'
          });

          console.log(`  Found command: ${commandName} (${commandHex})`);
        }
      }
    } catch (e) {
      // Skip malformed transactions
    }
  }

  console.log(`  Collected ${commandExamples.length} unique commands`);
  return commandExamples;
}

/**
 * Fetch EIP-7702 transaction
 */
async function fetchEIP7702Transaction() {
  console.log('\n[EIP-7702] Fetching Ambire delegation transaction...');

  const tx = await fetchTransactionByHash(EIP7702_TEST_TX.hash, 1);

  if (tx) {
    console.log(`  Found EIP-7702 transaction`);
    return [{
      description: 'EIP-7702 Delegation - Ambire',
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      input: tx.input,
      value: tx.value,
      type: tx.type,
      authorizationList: tx.authorizationList || [],
      expectedTxType: 'EIP-7702'
    }];
  }

  console.log(`  Failed to fetch transaction`);
  return [];
}

/**
 * Save transactions to fixture file
 */
function saveTransactions(transactions, filename) {
  const outputPath = path.resolve(__dirname, '../fixtures/transactions', filename);
  const dir = path.dirname(outputPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(transactions, null, 2));
  console.log(`[Saved] ${outputPath} (${transactions.length} transactions)`);
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('KAISIGN TRANSACTION FETCH SCRIPT');
  console.log('='.repeat(60));

  if (!ETHERSCAN_API_KEY) {
    console.warn('[Warning] ETHERSCAN_API_KEY not set. Using rate-limited access.');
  }

  const allTransactions = {
    dex: [],
    lending: [],
    staking: [],
    nft: [],
    accountAbstraction: []
  };

  // Process each category
  for (const [category, contracts] of Object.entries(CONTRACTS)) {
    console.log(`\n${'='.repeat(40)}`);
    console.log(`Category: ${category.toUpperCase()}`);
    console.log('='.repeat(40));

    for (const [key, contract] of Object.entries(contracts)) {
      console.log(`\n[${contract.name}] ${contract.address}`);

      const transactions = await fetchRecentTransactions(contract.address, contract.chainId);
      console.log(`  Found ${transactions.length} transactions`);

      const extracted = extractOnePerFunction(transactions, contract);
      console.log(`  Extracted ${extracted.length} unique functions`);

      // Add to category
      allTransactions[category] = allTransactions[category] || [];
      allTransactions[category].push(...extracted);

      await sleep(DELAY_MS);
    }
  }

  // Special: Uniswap COMMANDS
  const uniswapCommands = await fetchUniswapCommands();
  await sleep(DELAY_MS);

  // Special: EIP-7702
  const eip7702Txs = await fetchEIP7702Transaction();

  // Save all transactions
  console.log('\n' + '='.repeat(40));
  console.log('SAVING TRANSACTION FILES');
  console.log('='.repeat(40) + '\n');

  // Save by category
  for (const [category, txs] of Object.entries(allTransactions)) {
    if (txs.length > 0) {
      saveTransactions(txs, `${category}-operations.json`);
    }
  }

  // Save special files
  saveTransactions(uniswapCommands, 'uniswap-commands.json');
  saveTransactions(eip7702Txs, 'eip7702-delegations.json');

  // Summary
  const totalTxs = Object.values(allTransactions).reduce((sum, txs) => sum + txs.length, 0)
    + uniswapCommands.length
    + eip7702Txs.length;

  console.log('\n' + '='.repeat(60));
  console.log(`COMPLETE: ${totalTxs} total transactions saved`);
  console.log('='.repeat(60));
}

main().catch(console.error);
