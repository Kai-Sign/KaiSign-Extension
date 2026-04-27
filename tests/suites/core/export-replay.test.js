import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadMetadata } from '../../lib/metadata-loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exportPath = path.resolve(__dirname, '../../../kaisign-export-1777280840473.json');

const BAYC_METADATA = {
  context: {
    contract: {
      address: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
      chainId: 1,
      name: 'Bored Ape Yacht Club',
      symbol: 'BAYC',
      abi: [{
        type: 'function',
        name: 'setApprovalForAll',
        selector: '0xa22cb465',
        inputs: [
          { name: 'operator', type: 'address' },
          { name: 'approved', type: 'bool' }
        ]
      }]
    }
  },
  display: {
    formats: {
      'setApprovalForAll(address,bool)': {
        intent: '{approved, select, true {Approve all BAYC for {operator}} other {Revoke BAYC approval for {operator}}}',
        fields: [
          { path: 'operator', label: 'Operator', format: 'address' },
          { path: 'approved', label: 'Approval', format: 'raw' }
        ]
      }
    }
  }
};

export async function runTests(harness) {
  const results = [];
  const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  const txs = exported.transactions;

  const lifiAddress = '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae';
  const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  const baycAddress = '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d';

  harness.addMetadata(lifiAddress, loadMetadata('protocols/lifi-diamond-from-api.json'));
  harness.addMetadata(usdcAddress, loadMetadata('tokens/usdc.json'));
  harness.addMetadata(baycAddress, BAYC_METADATA);

  results.push(await harness.runTest({
    name: 'Export replay tx0: LiFi single swap is not unknown',
    calldata: txs[0].data,
    contractAddress: txs[0].to,
    expected: {
      shouldSucceed: true,
      selector: '0x4666fc80',
      functionName: 'swapTokensSingleV3ERC20ToERC20',
      intentContains: 'Swap',
      intentDoesNotContain: 'Unknown'
    }
  }));

  results.push(await harness.runTest({
    name: 'Export replay tx1: LiFi native swap is not unknown',
    calldata: txs[1].data,
    contractAddress: txs[1].to,
    expected: {
      shouldSucceed: true,
      selector: '0x2c57e884',
      intentContains: 'Swap',
      intentDoesNotContain: 'Unknown'
    }
  }));

  results.push(await harness.runRecursiveTest({
    name: 'Export replay tx2: LiFi wrapper intent survives nested approvals',
    calldata: txs[2].data,
    contractAddress: txs[2].to,
    expected: {
      shouldSucceed: true,
      selector: '0x5fd9ae2e',
      functionName: 'swapTokensMultipleV3ERC20ToERC20',
      intentContains: 'Swap',
      intentDoesNotContain: 'Approve Unlimited'
    }
  }));

  results.push(await harness.runRecursiveTest({
    name: 'Export replay tx3: LiFi wrapper intent survives nested approvals',
    calldata: txs[3].data,
    contractAddress: txs[3].to,
    expected: {
      shouldSucceed: true,
      selector: '0x5fd9ae2e',
      functionName: 'swapTokensMultipleV3ERC20ToERC20',
      intentContains: 'Swap',
      intentDoesNotContain: 'Approve Unlimited'
    }
  }));

  results.push(await harness.runTest({
    name: 'Export replay tx4: ERC-20 transfer is not unknown',
    calldata: txs[4].data,
    contractAddress: txs[4].to,
    expected: {
      shouldSucceed: true,
      selector: '0xa9059cbb',
      functionName: 'transfer',
      intentContains: 'Transfer',
      intentDoesNotContain: 'Unknown'
    }
  }));

  results.push(await harness.runTest({
    name: 'Export replay tx5: BAYC approval title stays curated',
    calldata: txs[5].data,
    contractAddress: txs[5].to,
    expected: {
      shouldSucceed: true,
      selector: '0xa22cb465',
      functionName: 'setApprovalForAll',
      intentContains: 'Approve all BAYC',
      intentDoesNotContain: 'Unknown'
    }
  }));

  return results;
}
