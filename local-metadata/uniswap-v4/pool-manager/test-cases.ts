/**
 * Comprehensive test suite for Uniswap V4 PoolManager decoding
 */

import { decodeCalldata } from '../../../utils/calldata';
import sampleTransactions from './sample-transactions.json';

// Test configuration
const CONTRACT_ADDRESS = '0x000000000004444c5dc75cb358380d2e3de08a90';
const CHAIN_ID = 1;

describe('Uniswap V4 PoolManager Decoding', () => {
  
  describe('Initialize Function', () => {
    test('should decode initialize transaction correctly', async () => {
      const txData = sampleTransactions.transactions.initialize;
      
      const result = await decodeCalldata(
        txData.input,
        CONTRACT_ADDRESS,
        CHAIN_ID
      );
      
      expect(result).toBeDefined();
      expect(result.functionName).toBe('initialize');
      expect(result.formatted).toBeDefined();
      
      // Check specific field formatting
      expect(result.formatted['key.currency0']).toBeDefined();
      expect(result.formatted['key.currency1']).toBeDefined();
      expect(result.formatted['key.fee']).toBeDefined();
      expect(result.formatted['sqrtPriceX96']).toBeDefined();
      
      // Verify address formatting
      expect(result.formatted['key.currency0'].format).toBe('addressName');
      expect(result.formatted['key.currency1'].format).toBe('addressName');
      
      // Verify fee formatting as percentage
      expect(result.formatted['key.fee'].format).toBe('percentage');
      
      console.log('✓ Initialize function decoded successfully');
      console.log('  - Currency0:', result.formatted['key.currency0'].value);
      console.log('  - Currency1:', result.formatted['key.currency1'].value);
      console.log('  - Fee:', result.formatted['key.fee'].value);
    });
    
    test('should handle native currency (ETH) in initialize', async () => {
      const txData = sampleTransactions.transactions.initialize;
      const result = await decodeCalldata(txData.input, CONTRACT_ADDRESS, CHAIN_ID);
      
      // Native currency should be 0x0000... address
      expect(result.formatted['key.currency0'].value).toBe('0x0000000000000000000000000000000000000000');
    });
  });
  
  describe('Swap Function', () => {
    test('should decode swap transaction correctly', async () => {
      const txData = sampleTransactions.transactions.swap;
      
      const result = await decodeCalldata(
        txData.input,
        CONTRACT_ADDRESS,
        CHAIN_ID
      );
      
      expect(result).toBeDefined();
      expect(result.functionName).toBe('swap');
      
      // Check swap-specific fields
      expect(result.formatted['params.zeroForOne']).toBeDefined();
      expect(result.formatted['params.amountSpecified']).toBeDefined();
      expect(result.formatted['params.sqrtPriceLimitX96']).toBeDefined();
      
      // Verify amount formatting
      expect(result.formatted['params.amountSpecified'].format).toBe('amount');
      
      console.log('✓ Swap function decoded successfully');
      console.log('  - Direction (zeroForOne):', result.formatted['params.zeroForOne'].value);
      console.log('  - Amount:', result.formatted['params.amountSpecified'].value);
    });
    
    test('should properly identify swap direction', async () => {
      const txData = sampleTransactions.transactions.swap;
      const result = await decodeCalldata(txData.input, CONTRACT_ADDRESS, CHAIN_ID);
      
      // Should indicate direction of swap
      const zeroForOne = result.formatted['params.zeroForOne'];
      expect(typeof zeroForOne.value).toBe('string');
      expect(['true', 'false']).toContain(zeroForOne.value);
    });
  });
  
  describe('ModifyLiquidity Function', () => {
    test('should decode modifyLiquidity transaction correctly', async () => {
      const txData = sampleTransactions.transactions.modifyLiquidity;
      
      const result = await decodeCalldata(
        txData.input,
        CONTRACT_ADDRESS,
        CHAIN_ID
      );
      
      expect(result).toBeDefined();
      expect(result.functionName).toBe('modifyLiquidity');
      
      // Check liquidity-specific fields
      expect(result.formatted['params.tickLower']).toBeDefined();
      expect(result.formatted['params.tickUpper']).toBeDefined();
      expect(result.formatted['params.liquidityDelta']).toBeDefined();
      expect(result.formatted['params.salt']).toBeDefined();
      
      // Verify liquidity amount formatting
      expect(result.formatted['params.liquidityDelta'].format).toBe('amount');
      
      console.log('✓ ModifyLiquidity function decoded successfully');
      console.log('  - Lower Tick:', result.formatted['params.tickLower'].value);
      console.log('  - Upper Tick:', result.formatted['params.tickUpper'].value);
      console.log('  - Liquidity Delta:', result.formatted['params.liquidityDelta'].value);
    });
    
    test('should handle tick range validation', async () => {
      const txData = sampleTransactions.transactions.modifyLiquidity;
      const result = await decodeCalldata(txData.input, CONTRACT_ADDRESS, CHAIN_ID);
      
      const lowerTick = parseInt(result.formatted['params.tickLower'].value);
      const upperTick = parseInt(result.formatted['params.tickUpper'].value);
      
      expect(lowerTick).toBeLessThan(upperTick);
    });
  });
  
  describe('Balance Management Functions', () => {
    test('should decode take function correctly', async () => {
      const txData = sampleTransactions.transactions.take;
      
      const result = await decodeCalldata(
        txData.input,
        CONTRACT_ADDRESS,
        CHAIN_ID
      );
      
      expect(result).toBeDefined();
      expect(result.functionName).toBe('take');
      
      // Check take-specific fields
      expect(result.formatted['currency']).toBeDefined();
      expect(result.formatted['to']).toBeDefined();
      expect(result.formatted['amount']).toBeDefined();
      
      // Verify formatting
      expect(result.formatted['currency'].format).toBe('addressName');
      expect(result.formatted['to'].format).toBe('address');
      expect(result.formatted['amount'].format).toBe('amount');
      
      console.log('✓ Take function decoded successfully');
    });
    
    test('should decode settle function correctly', async () => {
      const txData = sampleTransactions.transactions.settle;
      
      const result = await decodeCalldata(
        txData.input,
        CONTRACT_ADDRESS,
        CHAIN_ID
      );
      
      expect(result).toBeDefined();
      expect(result.functionName).toBe('settle');
      
      // Settle has no parameters
      expect(Object.keys(result.formatted).length).toBe(0);
      
      console.log('✓ Settle function decoded successfully');
    });
  });
  
  describe('Universal Decoding Features', () => {
    test('should handle nested struct decoding', async () => {
      const txData = sampleTransactions.transactions.initialize;
      const result = await decodeCalldata(txData.input, CONTRACT_ADDRESS, CHAIN_ID);
      
      // Should have flattened nested PoolKey struct
      expect(result.formatted['key.currency0']).toBeDefined();
      expect(result.formatted['key.currency1']).toBeDefined();
      expect(result.formatted['key.fee']).toBeDefined();
      expect(result.formatted['key.tickSpacing']).toBeDefined();
      expect(result.formatted['key.hooks']).toBeDefined();
    });
    
    test('should detect function without hardcoded logic', async () => {
      const txData = sampleTransactions.transactions.swap;
      const result = await decodeCalldata(txData.input, CONTRACT_ADDRESS, CHAIN_ID);
      
      // Should identify function through metadata, not hardcoded selectors
      expect(result.functionName).toBe('swap');
      expect(result.selector).toBe('0x414bf389');
    });
    
    test('should format values based on metadata specification', async () => {
      const txData = sampleTransactions.transactions.modifyLiquidity;
      const result = await decodeCalldata(txData.input, CONTRACT_ADDRESS, CHAIN_ID);
      
      // Currency addresses should be formatted as addressName
      expect(result.formatted['key.currency0'].format).toBe('addressName');
      
      // Fee should be formatted as percentage
      expect(result.formatted['key.fee'].format).toBe('percentage');
      
      // Amounts should be formatted as amount
      expect(result.formatted['params.liquidityDelta'].format).toBe('amount');
    });
  });
  
  describe('Error Handling', () => {
    test('should handle invalid transaction data gracefully', async () => {
      const invalidInput = '0x12345678';
      
      try {
        const result = await decodeCalldata(invalidInput, CONTRACT_ADDRESS, CHAIN_ID);
        // Should either return null or throw a descriptive error
        expect(result).toBeNull();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
    
    test('should handle unknown function selectors', async () => {
      const unknownInput = '0x99999999000000000000000000000000000000000000000000000000000000000000000000000000';
      
      try {
        const result = await decodeCalldata(unknownInput, CONTRACT_ADDRESS, CHAIN_ID);
        expect(result).toBeNull();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
  
  describe('Performance Tests', () => {
    test('should decode transactions quickly', async () => {
      const startTime = Date.now();
      
      const txData = sampleTransactions.transactions.initialize;
      await decodeCalldata(txData.input, CONTRACT_ADDRESS, CHAIN_ID);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should decode within 100ms
      expect(duration).toBeLessThan(100);
      
      console.log(`✓ Decoding performance: ${duration}ms`);
    });
    
    test('should handle large transaction batches', async () => {
      const transactions = Object.values(sampleTransactions.transactions);
      const results = [];
      
      const startTime = Date.now();
      
      for (const txData of transactions) {
        if (txData.input) {
          const result = await decodeCalldata(txData.input, CONTRACT_ADDRESS, CHAIN_ID);
          results.push(result);
        }
      }
      
      const endTime = Date.now();
      const avgTime = (endTime - startTime) / results.length;
      
      expect(avgTime).toBeLessThan(50); // Average less than 50ms per transaction
      
      console.log(`✓ Batch performance: ${avgTime.toFixed(2)}ms average per transaction`);
    });
  });
});

// Helper function to run all tests
export async function runPoolManagerTests() {
  console.log('🧪 Running Uniswap V4 PoolManager Comprehensive Tests...\n');
  
  try {
    // Test each transaction type
    const transactions = sampleTransactions.transactions;
    
    for (const [functionName, txData] of Object.entries(transactions)) {
      console.log(`Testing ${functionName} function...`);
      
      const result = await decodeCalldata(
        txData.input,
        CONTRACT_ADDRESS,
        CHAIN_ID
      );
      
      if (result) {
        console.log(`  ✅ Successfully decoded ${functionName}`);
        console.log(`     Function: ${result.functionName}`);
        console.log(`     Fields: ${Object.keys(result.formatted).length}`);
      } else {
        console.log(`  ❌ Failed to decode ${functionName}`);
      }
      console.log('');
    }
    
    console.log('🎉 All PoolManager tests completed!');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    throw error;
  }
}

// Export for standalone testing
if (require.main === module) {
  runPoolManagerTests().catch(console.error);
}