/**
 * Fluid Protocol Tests
 *
 * Tests Fluid USDC Vault deposit and withdraw functions.
 */

import { CONTRACTS } from '../../config.js';
import { loadMetadata } from '../../lib/metadata-loader.js';

export async function runTests(harness) {
  const results = [];

  const vaultAddress = CONTRACTS.lending.fluidUSDCVault.address.toLowerCase();
  harness.addMetadata(vaultAddress, loadMetadata('protocols/fluid-usdc-vault.json'));

  // Test 1: deposit(uint256 assets_, address receiver_)
  results.push(await harness.runTest({
    name: 'Fluid USDC vault deposit',
    calldata: '0x6e553f65' +
      '0000000000000000000000000000000000000000000000000000000005f5e100' + // 100 USDC (6 decimals)
      '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045',  // receiver
    contractAddress: vaultAddress,
    expected: {
      shouldSucceed: true,
      selector: '0x6e553f65',
      functionName: 'deposit',
      intentContains: 'Fluid'
    }
  }));

  // Test 2: withdraw(uint256 assets_, address receiver_, address owner_)
  results.push(await harness.runTest({
    name: 'Fluid USDC vault withdraw',
    calldata: '0xb460af94' +
      '0000000000000000000000000000000000000000000000000000000005f5e100' + // 100 USDC
      '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045' + // receiver
      '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045',  // owner
    contractAddress: vaultAddress,
    expected: {
      shouldSucceed: true,
      selector: '0xb460af94',
      functionName: 'withdraw',
      intentContains: 'Fluid'
    }
  }));

  return results;
}
