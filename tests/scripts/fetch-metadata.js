/**
 * Metadata Fetch Script
 *
 * Fetches ABI from Etherscan and converts to ERC-7730 format.
 * Also tries to fetch existing metadata from KaiSign API.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { CONTRACTS, getAllContractAddresses } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from parent project if exists
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';
const KAISIGN_API_URL = 'https://kai-sign-production.up.railway.app/api/py/contract';

// Rate limiting
const DELAY_MS = 250; // 4 requests per second

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch ABI from Etherscan
 */
async function fetchAbiFromEtherscan(address, chainId = 1) {
  const baseUrl = getEtherscanApiUrl(chainId);
  const url = `${baseUrl}?module=contract&action=getabi&address=${address}&apikey=${ETHERSCAN_API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === '1' && data.result) {
      return JSON.parse(data.result);
    } else {
      console.log(`[Etherscan] Failed to fetch ABI for ${address}: ${data.message || data.result}`);
      return null;
    }
  } catch (e) {
    console.log(`[Etherscan] Error fetching ABI for ${address}:`, e.message);
    return null;
  }
}

/**
 * Fetch metadata from KaiSign API
 */
async function fetchFromKaiSignApi(address, chainId = 1) {
  const url = `${KAISIGN_API_URL}/${address}?chain_id=${chainId}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.success && data.metadata) {
      return data.metadata;
    }
    return null;
  } catch (e) {
    console.log(`[KaiSign API] Failed to fetch for ${address}:`, e.message);
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
    case 10:
      return 'https://api-optimistic.etherscan.io/api';
    case 8453:
      return 'https://api.basescan.org/api';
    case 42161:
      return 'https://api.arbiscan.io/api';
    default:
      return 'https://api.etherscan.io/api';
  }
}

/**
 * Calculate function selector from signature
 */
function calculateSelector(signature) {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(signature));
  return hash.slice(0, 10);
}

/**
 * Convert raw ABI to ERC-7730 format
 */
function convertToERC7730Format(abi, contractInfo) {
  const functions = abi.filter(item => item.type === 'function');

  // Build ABI with selectors
  const abiWithSelectors = functions.map(fn => {
    const types = (fn.inputs || []).map(i => i.type).join(',');
    const signature = `${fn.name}(${types})`;
    const selector = calculateSelector(signature);

    return {
      type: 'function',
      name: fn.name,
      selector: selector,
      inputs: fn.inputs || [],
      outputs: fn.outputs || [],
      stateMutability: fn.stateMutability || 'nonpayable'
    };
  });

  // Build display formats
  const formats = {};
  for (const fn of abiWithSelectors) {
    const types = (fn.inputs || []).map(i => i.type).join(',');
    const signature = `${fn.name}(${types})`;

    formats[signature] = {
      intent: generateIntent(fn.name),
      fields: fn.inputs.map(input => ({
        path: input.name,
        label: toTitleCase(input.name),
        format: inferFormat(input.type)
      }))
    };
  }

  return {
    "$schema": "../../erc7730-v1.schema.json",
    "context": {
      "contract": {
        "address": contractInfo.address,
        "chainId": contractInfo.chainId,
        "name": contractInfo.name,
        "abi": abiWithSelectors
      }
    },
    "display": {
      "formats": formats
    }
  };
}

/**
 * Generate human-readable intent from function name
 */
function generateIntent(functionName) {
  // Common mappings
  const intents = {
    // DEX
    'swap': 'Swap tokens',
    'execute': 'Execute transaction',
    'exchange': 'Exchange tokens',
    'unoswap': 'Swap via 1inch',
    'unoswapTo': 'Swap via 1inch to recipient',
    'uniswapV3Swap': 'Swap via Uniswap V3',
    'clipperSwap': 'Swap via Clipper',
    'fillOrder': 'Fill order',
    'fillOrderArgs': 'Fill order with arguments',
    'permit': 'Approve token spending',
    'permitTransferFrom': 'Permit and transfer',
    'permitBatch': 'Batch token approvals',

    // Lending
    'supply': 'Supply to lending pool',
    'withdraw': 'Withdraw from lending pool',
    'borrow': 'Borrow from lending pool',
    'repay': 'Repay loan',
    'liquidationCall': 'Liquidate position',
    'flashLoan': 'Flash loan',

    // Staking
    'submit': 'Stake ETH',
    'wrap': 'Wrap tokens',
    'unwrap': 'Unwrap tokens',
    'requestWithdrawals': 'Request withdrawals',
    'claimWithdrawals': 'Claim withdrawals',
    'deposit': 'Deposit',

    // Safe
    'createProxyWithNonce': 'Create Safe wallet',
    'createProxyWithCallback': 'Create Safe with callback',
    'multiSend': 'Execute batch transactions',
    'execTransaction': 'Execute Safe transaction',
    'setup': 'Setup Safe wallet',
    'addOwnerWithThreshold': 'Add Safe owner',
    'removeOwner': 'Remove Safe owner',
    'changeThreshold': 'Change Safe threshold',
    'enableModule': 'Enable Safe module',
    'disableModule': 'Disable Safe module',

    // ERC-4337
    'handleOps': 'Execute user operations',
    'handleAggregatedOps': 'Execute aggregated operations',
    'simulateValidation': 'Simulate validation',
    'depositTo': 'Deposit to account',
    'withdrawTo': 'Withdraw from account',

    // NFT
    'fulfillBasicOrder': 'Purchase NFT',
    'fulfillOrder': 'Fulfill NFT order',
    'fulfillAdvancedOrder': 'Fulfill advanced order',
    'matchOrders': 'Match NFT orders',
    'cancel': 'Cancel order',

    // ERC-20/721/1155
    'transfer': 'Transfer',
    'transferFrom': 'Transfer from',
    'approve': 'Approve spending',
    'safeTransferFrom': 'Safe transfer',

    // MakerDAO
    'frob': 'Modify vault',
    'fork': 'Fork vault',
    'hope': 'Grant permission',
    'nope': 'Revoke permission',
    'move': 'Move collateral',
    'flux': 'Transfer collateral',
    'drip': 'Accrue interest',
    'join': 'Join DSR',
    'exit': 'Exit DSR'
  };

  // Check exact match
  if (intents[functionName]) {
    return intents[functionName];
  }

  // Check if starts with known prefix
  for (const [key, intent] of Object.entries(intents)) {
    if (functionName.toLowerCase().startsWith(key.toLowerCase())) {
      return intent;
    }
  }

  // Default: convert camelCase to sentence
  return toTitleCase(functionName.replace(/([A-Z])/g, ' $1').trim());
}

/**
 * Infer display format from Solidity type
 */
function inferFormat(type) {
  if (type === 'address') return 'address';
  if (type.startsWith('uint') || type.startsWith('int')) return 'number';
  if (type === 'bool') return 'boolean';
  if (type === 'bytes' || type.startsWith('bytes')) return 'hex';
  if (type === 'string') return 'string';
  if (type.endsWith('[]')) return 'array';
  return 'raw';
}

/**
 * Convert string to Title Case
 */
function toTitleCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Save metadata to file
 */
function saveMetadata(metadata, filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2));
  console.log(`[Saved] ${filePath}`);
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('KAISIGN METADATA FETCH SCRIPT');
  console.log('='.repeat(60));

  if (!ETHERSCAN_API_KEY) {
    console.log('[Warning] ETHERSCAN_API_KEY not set. Using rate-limited access.');
  }

  const contracts = getAllContractAddresses();
  console.log(`\nFetching metadata for ${contracts.length} contracts...\n`);

  let successCount = 0;
  let failCount = 0;

  for (const contract of contracts) {
    console.log(`\n[${contract.name}] ${contract.address}`);

    // Try KaiSign API first (primary source)
    console.log(`  Trying KaiSign API...`);
    let metadata = await fetchFromKaiSignApi(contract.address, contract.chainId);

    if (metadata) {
      console.log(`  Found in KaiSign API`);
    } else {
      // Fallback to Etherscan V2 API
      console.log(`  Fallback: Fetching from Etherscan...`);
      const abi = await fetchAbiFromEtherscan(contract.address, contract.chainId);

      if (abi && Array.isArray(abi)) {
        metadata = convertToERC7730Format(abi, contract);
        console.log(`  Converted ABI to ERC-7730 (${abi.filter(f => f.type === 'function').length} functions)`);
      }
    }

    if (metadata) {
      const outputPath = path.resolve(__dirname, '../fixtures/metadata', contract.metadataFile);
      saveMetadata(metadata, outputPath);
      successCount++;
    } else {
      console.log(`  [FAILED] Could not fetch metadata`);
      failCount++;
    }

    await sleep(DELAY_MS);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`COMPLETE: ${successCount} succeeded, ${failCount} failed`);
  console.log('='.repeat(60));
}

main().catch(console.error);
