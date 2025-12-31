// Enhanced Advanced EVM Transaction Decoder - True Nested Bytecode Separation
console.log('[KaiSign] Loading enhanced advanced transaction decoder...');

// KaiSign subgraph and storage configuration
const KAISIGN_SUBGRAPH_URL = 'https://api.studio.thegraph.com/query/117022/kaisign-subgraph/version/latest';
const BLOBSCAN_API_BASE = 'https://api.sepolia.blobscan.com';

// Transaction type constants
const TX_TYPES = {
  LEGACY: 0x0,
  ACCESS_LIST: 0x1, 
  EIP1559: 0x2,
  EIP7702: 0x4
};

// Multicall selectors now loaded from registry (see registry-loader.js)
// Uses local-metadata/registry/selectors.json

// EIP-7702 delegation designator prefix
const DELEGATION_DESIGNATOR = '0xef0100';

class AdvancedTransactionDecoder {
  constructor() {
    this.cache = {};
    this.metadataCache = {};
    this.functionSignatureCache = {};
    this.maxDepth = 10; // Prevent infinite recursion
    this.maxBytecodeNesting = 5; // Max levels for bytecode extraction
  }

  /**
   * Main entry point for transaction decoding
   */
  async decodeTransaction(rawTx, contractAddress, chainId) {
    try {
      console.log(`[AdvDecoder] ===== ADVANCED DECODE START =====`);
      console.log(`[AdvDecoder] Raw TX type: ${typeof rawTx}`);
      
      // Parse transaction type and structure
      const txType = this.parseTransactionType(rawTx);
      console.log(`[AdvDecoder] Transaction type: 0x${txType.toString(16)}`);
      
      let decodedTx;
      switch (txType) {
        case TX_TYPES.EIP1559:
          decodedTx = await this.decodeType2Transaction(rawTx, contractAddress, chainId);
          break;
        case TX_TYPES.EIP7702:
          decodedTx = await this.decodeType4Transaction(rawTx, contractAddress, chainId);
          break;
        case TX_TYPES.LEGACY:
        case TX_TYPES.ACCESS_LIST:
          // Fallback to existing decoder for legacy types
          decodedTx = await this.decodeLegacyTransaction(rawTx, contractAddress, chainId);
          break;
        default:
          throw new Error(`Unsupported transaction type: 0x${txType.toString(16)}`);
      }
      
      console.log(`[AdvDecoder] ===== DECODE COMPLETE =====`);
      return decodedTx;
      
    } catch (error) {
      console.error('[AdvDecoder] Error:', error.message);
      return {
        success: false,
        error: error.message,
        txType: 'unknown',
        intent: 'Failed to decode transaction'
      };
    }
  }

  /**
   * Parse transaction type from raw transaction data
   */
  parseTransactionType(rawTx) {
    // Handle different input formats
    let txData;
    
    if (typeof rawTx === 'object' && rawTx.data) {
      // Standard transaction object
      if (rawTx.type !== undefined) {
        return parseInt(rawTx.type, 16);
      }
      // Try to detect from transaction structure
      if (rawTx.authorizationList) return TX_TYPES.EIP7702;
      if (rawTx.maxFeePerGas || rawTx.maxPriorityFeePerGas) return TX_TYPES.EIP1559;
      if (rawTx.accessList) return TX_TYPES.ACCESS_LIST;
      return TX_TYPES.LEGACY;
    }
    
    if (typeof rawTx === 'string') {
      // Raw transaction bytes
      if (!rawTx.startsWith('0x')) rawTx = '0x' + rawTx;
      if (rawTx.length < 4) return TX_TYPES.LEGACY;
      
      const firstByte = parseInt(rawTx.slice(2, 4), 16);
      if (firstByte >= 0x80) return TX_TYPES.LEGACY; // RLP encoded legacy
      return firstByte; // Typed transaction
    }
    
    return TX_TYPES.LEGACY; // Default fallback
  }

  /**
   * Decode EIP-1559 (Type 2) transactions
   */
  async decodeType2Transaction(rawTx, contractAddress, chainId) {
    console.log(`[AdvDecoder] Decoding Type 2 (EIP-1559) transaction`);
    
    const txData = this.extractTransactionData(rawTx);
    
    const result = {
      success: true,
      txType: 'EIP-1559',
      chainId: txData.chainId || chainId,
      nonce: txData.nonce,
      maxPriorityFeePerGas: txData.maxPriorityFeePerGas,
      maxFeePerGas: txData.maxFeePerGas,
      gasLimit: txData.gasLimit,
      to: txData.to || contractAddress,
      value: txData.value,
      data: txData.data,
      accessList: txData.accessList || [],
      intent: 'Contract interaction',
      nestedCalls: [],
      allIntents: []
    };

    // Decode the main call
    if (result.data && result.to) {
      const mainCall = await this.decodeCalldata(result.data, result.to, result.chainId);
      result.mainCall = mainCall;
      if (mainCall.success) {
        result.intent = mainCall.intent;
      }

      // Check for multicall pattern and decode nested calls
      const nestedAnalysis = await this.analyzeNestedCalls(result.data, result.to, result.chainId, 0);
      result.nestedCalls = nestedAnalysis.calls;
      result.allIntents = nestedAnalysis.intents;
      result.nestedIntents = nestedAnalysis.intents;

      // Build aggregated intent from nested intents (like recursive-decoder.js pattern)
      if (result.nestedIntents && result.nestedIntents.length > 0) {
        result.aggregatedIntent = result.nestedIntents.join(' + ');
        result.intent = result.aggregatedIntent;
      }
    }

    return result;
  }

  /**
   * Decode EIP-7702 (Type 4) transactions
   */
  async decodeType4Transaction(rawTx, contractAddress, chainId) {
    console.log(`[AdvDecoder] Decoding Type 4 (EIP-7702) transaction`);
    
    const txData = this.extractTransactionData(rawTx);
    
    const result = {
      success: true,
      txType: 'EIP-7702',
      chainId: txData.chainId || chainId,
      nonce: txData.nonce,
      maxPriorityFeePerGas: txData.maxPriorityFeePerGas,
      maxFeePerGas: txData.maxFeePerGas,
      gasLimit: txData.gasLimit,
      to: txData.to || contractAddress,
      value: txData.value,
      data: txData.data,
      accessList: txData.accessList || [],
      authorizationList: txData.authorizationList || [],
      intent: 'Delegate execution',
      delegations: [],
      nestedCalls: [],
      allIntents: []
    };

    // Parse authorization list
    if (result.authorizationList.length > 0) {
      result.delegations = await this.parseAuthorizationList(result.authorizationList, result.chainId);
    }

    // Decode the main call with delegation context
    if (result.data && result.to) {
      const mainCall = await this.decodeWithDelegation(result.data, result.to, result.delegations, result.chainId);
      result.mainCall = mainCall;
      if (mainCall.success) {
        result.intent = mainCall.intent;
      }

      // Analyze nested calls considering delegations
      const nestedAnalysis = await this.analyzeNestedCallsWithDelegation(
        result.data, result.to, result.delegations, result.chainId, 0
      );
      result.nestedCalls = nestedAnalysis.calls;
      result.allIntents = nestedAnalysis.intents;
      result.nestedIntents = nestedAnalysis.intents;

      // Build aggregated intent from nested intents (like recursive-decoder.js pattern)
      if (result.nestedIntents && result.nestedIntents.length > 0) {
        result.aggregatedIntent = result.nestedIntents.join(' + ');
        result.intent = result.aggregatedIntent;
      }
    }

    return result;
  }

  /**
   * Parse EIP-7702 authorization list
   */
  async parseAuthorizationList(authList, chainId) {
    const delegations = [];
    
    for (const auth of authList) {
      try {
        const delegation = {
          chainId: auth.chainId || auth[0],
          address: auth.address || auth[1],
          nonce: auth.nonce || auth[2],
          yParity: auth.yParity || auth[3],
          r: auth.r || auth[4],
          s: auth.s || auth[5],
          isRevocation: false,
          delegateCode: null,
          delegateMetadata: null
        };

        // Check for revocation (address = 0x0)
        if (delegation.address === '0x0000000000000000000000000000000000000000') {
          delegation.isRevocation = true;
        } else {
          // Get delegate contract code and metadata
          delegation.delegateCode = await this.getDelegateCode(delegation.address, chainId);
          delegation.delegateMetadata = await this.getContractMetadata(delegation.address, chainId);
        }

        delegations.push(delegation);
        console.log(`[AdvDecoder] Parsed delegation to: ${delegation.address}`);
        
      } catch (error) {
        console.warn(`[AdvDecoder] Failed to parse authorization:`, error.message);
      }
    }

    return delegations;
  }

  /**
   * Enhanced nested call analysis with true bytecode separation
   */
  async analyzeNestedCalls(calldata, contractAddress, chainId, depth = 0) {
    if (depth >= this.maxDepth) {
      console.warn(`[AdvDecoder] Max nesting depth reached: ${depth}`);
      return { calls: [], intents: [], bytecodes: [] };
    }

    const selector = this.extractFunctionSelector(calldata);
    const calls = [];
    const intents = [];
    const bytecodes = [];

    // Check if this looks like a multicall based on data structure
    // Multicall detection now based on metadata from subgraph
    const isMulticall = this.looksLikeMulticall(calldata);

    if (isMulticall) {
      console.log(`[AdvDecoder] Found potential multicall pattern at depth ${depth}`);
      
      try {
        const extractedBytecodes = await this.decodeMulticall(calldata, contractAddress, chainId);
        
        // Process each extracted bytecode
        for (const extracted of extractedBytecodes) {
          bytecodes.push(extracted);

          // Decode the individual bytecode
          const nestedResult = await this.decodeCalldata(extracted.bytecode, extracted.target, chainId);
          
          const callInfo = {
            ...extracted,
            decoded: nestedResult,
            intent: nestedResult.success ? nestedResult.intent : 'Unknown function',
            depth: depth + 1
          };
          
          calls.push(callInfo);
          if (nestedResult.success) {
            intents.push(nestedResult.intent);
          }
          
          // Recursively check for deeper nesting
          if (this.looksLikeCalldata(extracted.bytecode) && this.looksLikeMulticall(extracted.bytecode)) {
            const deeperNesting = await this.analyzeNestedCalls(
              extracted.bytecode, extracted.target, chainId, depth + 1
            );
            
            calls.push(...deeperNesting.calls);
            intents.push(...deeperNesting.intents);
            bytecodes.push(...deeperNesting.bytecodes);
          }
        }
      } catch (error) {
        console.warn(`[AdvDecoder] Failed to analyze nested calls:`, error.message);
      }
    } else {
      // Not a multicall, but might contain embedded calldata
      const embeddedBytecodes = await this.extractEmbeddedBytecodes(calldata, contractAddress, chainId);
      
      for (const embedded of embeddedBytecodes) {
        bytecodes.push(embedded);
        
        const nestedResult = await this.decodeCalldata(embedded.bytecode, embedded.target, chainId);
        
        calls.push({
          ...embedded,
          decoded: nestedResult,
          intent: nestedResult.success ? nestedResult.intent : 'Unknown function',
          depth: depth + 1
        });
        
        if (nestedResult.success) {
          intents.push(nestedResult.intent);
        }
      }
    }

    return { calls, intents, bytecodes };
  }

  /**
   * Extract embedded bytecodes from non-multicall functions
   */
  async extractEmbeddedBytecodes(calldata, contractAddress, chainId) {
    const embeddedBytecodes = [];
    
    try {
      // Get function metadata to understand parameters
      const metadata = await this.getContractMetadata(contractAddress, chainId);
      const selector = this.extractFunctionSelector(calldata);
      
      if (metadata?.context?.contract?.abi) {
        const abiFunction = metadata.context.contract.abi.find(
          item => item.type === 'function' && item.selector === selector
        );
        
        if (abiFunction?.inputs) {
          const paramData = calldata.slice(10);
          const decodedParams = this.decodeABIParameters(abiFunction.inputs, paramData);
          
          let embeddedIndex = 0;
          for (const [paramName, paramValue] of Object.entries(decodedParams)) {
            if (this.looksLikeCalldata(paramValue)) {
              embeddedBytecodes.push({
                index: embeddedIndex++,
                target: this.extractTargetFromEmbedded(paramValue, decodedParams) || contractAddress,
                bytecode: paramValue,
                selector: this.extractFunctionSelector(paramValue),
                value: '0x0',
                callType: 'EMBEDDED',
                parentCall: abiFunction.name,
                parameterName: paramName
              });
            }
          }
        }
      }
      
      // DISABLED: scanForCalldataPatterns was creating garbage by sliding window over all bytes
      // The recursive decoder already handles nested calldata properly via metadata
      // const additionalBytecodes = this.scanForCalldataPatterns(calldata, contractAddress);
      // embeddedBytecodes.push(...additionalBytecodes);
      
    } catch (error) {
      console.warn(`[AdvDecoder] Embedded bytecode extraction error:`, error.message);
    }
    
    return embeddedBytecodes;
  }

  /**
   * Scan raw calldata for patterns that look like embedded function calls
   */
  scanForCalldataPatterns(calldata, contractAddress) {
    const patterns = [];
    const data = calldata.slice(2); // Remove 0x prefix
    
    // Look for potential function selectors (4 bytes at 32-byte boundaries)
    for (let i = 8; i < data.length - 8; i += 2) {
      const potentialSelector = '0x' + data.slice(i, i + 8);
      
      // Check if this looks like a function selector
      if (this.couldBeFunctionSelector(potentialSelector)) {
        // Check if there's enough data after the selector
        const remainingData = data.slice(i + 8);
        if (remainingData.length >= 64) { // At least one parameter
          const embeddedBytecode = '0x' + data.slice(i);
          
          patterns.push({
            index: patterns.length,
            target: contractAddress,
            bytecode: embeddedBytecode,
            selector: potentialSelector,
            value: '0x0',
            callType: 'PATTERN_DETECTED',
            parentCall: 'unknown',
            note: `Found at offset ${i / 2}`
          });
        }
      }
    }
    
    return patterns;
  }

  /**
   * Check if a value could be a function selector
   */
  couldBeFunctionSelector(value) {
    if (!value || typeof value !== 'string' || value.length !== 10) return false;
    if (!value.startsWith('0x')) return false;
    
    // Simple heuristic: most function selectors have some pattern
    const hex = value.slice(2);
    if (hex === '00000000' || hex === 'ffffffff') return false; // Too simple
    
    // Check if hex is valid
    return /^[a-fA-F0-9]{8}$/.test(hex);
  }

  /**
   * Try to extract target address from embedded calldata context
   */
  extractTargetFromEmbedded(bytecode, allParams) {
    // Look for address parameters in the same function call
    for (const [paramName, paramValue] of Object.entries(allParams)) {
      if (typeof paramValue === 'string' && this.isValidAddress(paramValue)) {
        // If parameter name suggests it's a target (to, target, contract, etc.)
        const lowerParamName = paramName.toLowerCase();
        if (lowerParamName.includes('to') || 
            lowerParamName.includes('target') || 
            lowerParamName.includes('contract') ||
            lowerParamName.includes('recipient')) {
          return paramValue;
        }
      }
    }
    
    // Try to extract from the bytecode itself (first address-like parameter)
    try {
      const paramData = bytecode.slice(10); // Remove selector
      for (let i = 0; i < Math.min(3, paramData.length / 64); i++) {
        const param = paramData.slice(i * 64, (i + 1) * 64);
        if (param.startsWith('000000000000000000000000')) {
          const address = '0x' + param.slice(24);
          if (this.isValidAddress(address)) {
            return address;
          }
        }
      }
    } catch (error) {
      // Ignore extraction errors
    }
    
    return null;
  }

  /**
   * Analyze nested calls with EIP-7702 delegation context
   */
  async analyzeNestedCallsWithDelegation(calldata, contractAddress, delegations, chainId, depth) {
    // First do standard nested call analysis
    const standardAnalysis = await this.analyzeNestedCalls(calldata, contractAddress, chainId, depth);
    
    // Then enhance with delegation context
    for (const call of standardAnalysis.calls) {
      // Check if the call target has delegated code
      const delegation = delegations.find(d => d.address.toLowerCase() === call.target.toLowerCase());
      if (delegation && !delegation.isRevocation) {
        // Re-decode with delegation context
        call.delegationContext = delegation;
        call.actualExecutionTarget = delegation.address;
        console.log(`[AdvDecoder] Call ${call.index} delegates to: ${delegation.address}`);
      }
    }

    return standardAnalysis;
  }

  /**
   * Enhanced multicall decoder - GENERIC, metadata-driven
   * No hardcoded selector routing - uses generic ABI-based extraction
   */
  async decodeMulticall(calldata, contractAddress, chainId) {
    try {
      // No hardcoded selector routing - always use generic ABI-based extraction
      // Metadata provides the ABI structure for proper decoding
      const extractedCalls = await this.extractGenericMulticallBytecodes(calldata, contractAddress, chainId);
      return extractedCalls;
    } catch (error) {
      console.warn(`[AdvDecoder] Multicall decode error:`, error.message);
      return [];
    }
  }

  /**
   * Extract bytecodes from standard multicall format
   */
  extractStandardMulticallBytecodes(paramData, contractAddress) {
    const extractedCalls = [];
    
    try {
      // Decode bytes[] array with proper ABI parsing
      const arrayOffset = parseInt(paramData.slice(0, 64), 16) * 2;
      const arrayLength = parseInt(paramData.slice(arrayOffset, arrayOffset + 64), 16);
      
      let currentOffset = arrayOffset + 64;
      
      for (let i = 0; i < arrayLength; i++) {
        const callDataOffsetHex = paramData.slice(currentOffset, currentOffset + 64);
        const callDataOffset = parseInt(callDataOffsetHex, 16) * 2 + arrayOffset;
        
        const callDataLengthHex = paramData.slice(callDataOffset, callDataOffset + 64);
        const callDataLength = parseInt(callDataLengthHex, 16) * 2;
        
        const callDataHex = paramData.slice(callDataOffset + 64, callDataOffset + 64 + callDataLength);
        const bytecode = '0x' + callDataHex;
        
        // Extract actual function selector and validate
        const nestedSelector = this.extractFunctionSelector(bytecode);
        
        extractedCalls.push({
          index: i,
          target: contractAddress,
          bytecode: bytecode,
          selector: nestedSelector,
          value: '0x0',
          callType: 'CALL',
          parentCall: 'multicall'
        });
        
        currentOffset += 64;
      }
      
      console.log(`[AdvDecoder] Extracted ${extractedCalls.length} bytecodes from standard multicall`);
    } catch (error) {
      console.warn(`[AdvDecoder] Standard multicall bytecode extraction error:`, error.message);
    }
    
    return extractedCalls;
  }

  /**
   * Extract bytecodes from multicall with deadline
   */
  extractMulticallWithDeadlineBytecodes(paramData, contractAddress) {
    try {
      // Skip deadline (first 32 bytes = 64 hex chars)
      const deadlineHex = paramData.slice(0, 64);
      const deadline = parseInt(deadlineHex, 16);
      
      // Extract calls array starting after deadline parameter
      const callsArrayOffset = parseInt(paramData.slice(64, 128), 16) * 2;
      const callsData = paramData.slice(callsArrayOffset - 64); // Adjust for offset calculation
      
      const extractedCalls = this.extractStandardMulticallBytecodes(callsData, contractAddress);
      
      // Add deadline context to each call
      extractedCalls.forEach(call => {
        call.deadline = deadline;
        call.parentCall = 'multicallWithDeadline';
      });
      
      console.log(`[AdvDecoder] Extracted ${extractedCalls.length} bytecodes from deadline multicall (deadline: ${deadline})`);
      return extractedCalls;
    } catch (error) {
      console.warn(`[AdvDecoder] Deadline multicall bytecode extraction error:`, error.message);
      return [];
    }
  }

  /**
   * Extract bytecodes from multicall with value
   */
  extractMulticallValueBytecodes(paramData, contractAddress) {
    try {
      // multicall with value typically has signature: multicall(uint256 value, bytes[] data)
      const valueHex = paramData.slice(0, 64);
      const value = '0x' + parseInt(valueHex, 16).toString(16);
      
      const callsArrayOffset = parseInt(paramData.slice(64, 128), 16) * 2;
      const callsData = paramData.slice(callsArrayOffset - 64);
      
      const extractedCalls = this.extractStandardMulticallBytecodes(callsData, contractAddress);
      
      // Add value context to each call
      extractedCalls.forEach(call => {
        call.value = value;
        call.parentCall = 'multicallValue';
      });
      
      console.log(`[AdvDecoder] Extracted ${extractedCalls.length} bytecodes from value multicall (value: ${value})`);
      return extractedCalls;
    } catch (error) {
      console.warn(`[AdvDecoder] Value multicall bytecode extraction error:`, error.message);
      return [];
    }
  }

  /**
   * Extract bytecodes from Universal Router execute function
   */
  extractUniversalRouterBytecodes(paramData, contractAddress) {
    const extractedCalls = [];
    
    try {
      // Universal Router execute(bytes commands, bytes[] inputs, uint256 deadline)
      const commandsOffset = parseInt(paramData.slice(0, 64), 16) * 2;
      const inputsOffset = parseInt(paramData.slice(64, 128), 16) * 2;
      const deadline = parseInt(paramData.slice(128, 192), 16);
      
      // Extract commands bytes
      const commandsLengthHex = paramData.slice(commandsOffset, commandsOffset + 64);
      const commandsLength = parseInt(commandsLengthHex, 16) * 2;
      const commandsHex = paramData.slice(commandsOffset + 64, commandsOffset + 64 + commandsLength);
      
      // Extract inputs array
      const inputsArrayLengthHex = paramData.slice(inputsOffset, inputsOffset + 64);
      const inputsArrayLength = parseInt(inputsArrayLengthHex, 16);
      
      let currentInputOffset = inputsOffset + 64;
      
      // Parse each command and corresponding input
      for (let i = 0; i < Math.min(commandsHex.length / 2, inputsArrayLength); i++) {
        const commandByte = commandsHex.slice(i * 2, (i + 1) * 2);
        const command = parseInt(commandByte, 16);
        
        // Get input data for this command
        if (i < inputsArrayLength) {
          const inputOffsetHex = paramData.slice(currentInputOffset, currentInputOffset + 64);
          const inputDataOffset = parseInt(inputOffsetHex, 16) * 2 + inputsOffset;
          
          const inputLengthHex = paramData.slice(inputDataOffset, inputDataOffset + 64);
          const inputLength = parseInt(inputLengthHex, 16) * 2;
          
          const inputDataHex = paramData.slice(inputDataOffset + 64, inputDataOffset + 64 + inputLength);
          const inputBytecode = '0x' + inputDataHex;
          
          // Try to extract target from input data (depends on command type)
          const target = this.extractTargetFromUniversalRouterInput(command, inputBytecode) || contractAddress;
          
          extractedCalls.push({
            index: i,
            target: target,
            bytecode: inputBytecode,
            selector: this.extractFunctionSelector(inputBytecode),
            value: '0x0',
            callType: 'DELEGATECALL',
            parentCall: 'universalRouter',
            command: command,
            deadline: deadline
          });
          
          currentInputOffset += 64;
        }
      }
      
      console.log(`[AdvDecoder] Extracted ${extractedCalls.length} bytecodes from Universal Router execute`);
    } catch (error) {
      console.warn(`[AdvDecoder] Universal Router bytecode extraction error:`, error.message);
      
      // Fallback: treat entire paramData as single complex call
      extractedCalls.push({
        index: 0,
        target: contractAddress,
        bytecode: '0x3593564c' + paramData,
        selector: '0x3593564c',
        value: '0x0',
        callType: 'CALL',
        parentCall: 'universalRouter',
        note: 'Complex Universal Router execution - partial decode'
      });
    }
    
    return extractedCalls;
  }

  /**
   * Extract target address from Universal Router input based on command
   */
  extractTargetFromUniversalRouterInput(command, inputBytecode) {
    try {
      // Universal Router command types (simplified)
      // 0x00: V3_SWAP_EXACT_IN, 0x01: V3_SWAP_EXACT_OUT, etc.
      // Most commands have target as first parameter or embedded in data
      
      if (inputBytecode.length >= 42) { // At least an address
        // Try to find address pattern in first few parameters
        for (let i = 0; i < Math.min(3, (inputBytecode.length - 2) / 64); i++) {
          const paramStart = 2 + (i * 64);
          const param = inputBytecode.slice(paramStart, paramStart + 64);
          
          // Check if parameter looks like an address (last 40 chars as hex)
          if (param.length === 64 && param.startsWith('000000000000000000000000')) {
            const potentialAddress = '0x' + param.slice(24);
            if (this.isValidAddress(potentialAddress)) {
              return potentialAddress;
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate if string is a valid Ethereum address
   */
  isValidAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address) && address !== '0x0000000000000000000000000000000000000000';
  }

  /**
   * Generic multicall bytecode extraction using ABI
   */
  async extractGenericMulticallBytecodes(calldata, contractAddress, chainId) {
    const extractedCalls = [];
    
    try {
      const metadata = await this.getContractMetadata(contractAddress, chainId);
      if (!metadata?.context?.contract?.abi) {
        return [];
      }
      
      const selector = this.extractFunctionSelector(calldata);
      const abiFunction = metadata.context.contract.abi.find(
        item => item.type === 'function' && item.selector === selector
      );
      
      if (!abiFunction || !abiFunction.inputs) {
        return [];
      }
      
      // Look for parameters that might contain call data
      const paramData = calldata.slice(10);
      const decodedParams = this.decodeABIParameters(abiFunction.inputs, paramData);
      
      let callIndex = 0;
      for (const [paramName, paramValue] of Object.entries(decodedParams)) {
        if (this.looksLikeCalldata(paramValue)) {
          extractedCalls.push({
            index: callIndex++,
            target: contractAddress,
            bytecode: paramValue,
            selector: this.extractFunctionSelector(paramValue),
            value: '0x0',
            callType: 'CALL',
            parentCall: abiFunction.name,
            parameterName: paramName
          });
        } else if (Array.isArray(paramValue)) {
          // Handle arrays of call data or tuple arrays like (address,uint256,bytes)[]
          for (let i = 0; i < paramValue.length; i++) {
            const item = paramValue[i];

            // Check if array element is direct calldata
            if (this.looksLikeCalldata(item)) {
              extractedCalls.push({
                index: callIndex++,
                target: contractAddress,
                bytecode: item,
                selector: this.extractFunctionSelector(item),
                value: '0x0',
                callType: 'CALL',
                parentCall: abiFunction.name,
                parameterName: `${paramName}[${i}]`
              });
            }
            // Check if array element is a tuple with (to, value, data) structure
            else if (typeof item === 'object' && item !== null) {
              // Handle tuple arrays like (address,uint256,bytes)[] for executeMultiple/executeBatch
              const to = item.to || item[0];
              const value = item.value || item[1] || '0x0';
              const data = item.data || item[2];

              if (to && data && this.looksLikeCalldata(data)) {
                extractedCalls.push({
                  index: callIndex++,
                  target: to.toLowerCase ? to.toLowerCase() : to,
                  bytecode: data,
                  selector: this.extractFunctionSelector(data),
                  value: value?.toString?.() || '0x0',
                  callType: 'CALL',
                  parentCall: abiFunction.name,
                  parameterName: `${paramName}[${i}]`,
                  tupleFields: { to, value, data }
                });
              }
            }
          }
        }
      }
      
      console.log(`[AdvDecoder] Extracted ${extractedCalls.length} bytecodes from generic multicall function`);
    } catch (error) {
      console.warn(`[AdvDecoder] Generic multicall extraction error:`, error.message);
    }
    
    return extractedCalls;
  }

  /**
   * Check if a value looks like calldata (hex string starting with function selector)
   */
  looksLikeCalldata(value) {
    if (typeof value !== 'string') return false;
    if (!value.startsWith('0x')) return false;
    if (value.length < 10) return false; // At least selector

    // Check if first 4 bytes could be a function selector
    const selector = value.slice(0, 10);
    return /^0x[a-fA-F0-9]{8}$/.test(selector);
  }

  /**
   * Check if calldata looks like a multicall based on data structure
   * This is a heuristic - actual detection comes from metadata
   */
  looksLikeMulticall(calldata) {
    if (!this.looksLikeCalldata(calldata)) return false;

    // Check if data is long enough to contain multiple calls
    // Minimum: selector (10) + offset (64) + length (64) + some data
    if (calldata.length < 200) return false;

    // Check for common multicall patterns in the data
    // This is a heuristic - the real detection happens via metadata
    const paramData = calldata.slice(10);

    // Check if first word points to a reasonable offset (usually 0x20 = 32 for single bytes param)
    const firstWord = paramData.slice(0, 64);
    const offset = parseInt(firstWord, 16);

    // Offset should be 32 (0x20) for standard bytes parameter encoding
    return offset === 32 || offset === 64 || offset === 96;
  }

  /**
   * Simple ABI parameter decoder (basic implementation)
   */
  decodeABIParameters(inputs, paramData) {
    const decoded = {};
    let offset = 0;

    try {
      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        const paramName = input.name || `param${i}`;

        if (input.type === 'bytes' || input.type === 'bytes[]') {
          // Dynamic bytes - get offset and length
          const dataOffset = parseInt(paramData.slice(offset, offset + 64), 16) * 2;
          const dataLength = parseInt(paramData.slice(dataOffset, dataOffset + 64), 16) * 2;
          const data = '0x' + paramData.slice(dataOffset + 64, dataOffset + 64 + dataLength);
          decoded[paramName] = data;
        } else if (input.type === 'tuple[]' && input.components) {
          // Tuple array like (address,uint256,bytes)[] - common for executeMultiple/executeBatch
          const arrayOffset = parseInt(paramData.slice(offset, offset + 64), 16) * 2;
          const arrayLength = parseInt(paramData.slice(arrayOffset, arrayOffset + 64), 16);
          const tuples = [];

          // Each tuple element has an offset pointer
          for (let j = 0; j < arrayLength; j++) {
            const tupleOffsetPointer = arrayOffset + 64 + (j * 64);
            const tupleRelOffset = parseInt(paramData.slice(tupleOffsetPointer, tupleOffsetPointer + 64), 16) * 2;
            const tupleStart = arrayOffset + 64 + tupleRelOffset;

            // Decode the tuple components (address, uint256, bytes) structure
            const tuple = {};
            let tupleInnerOffset = 0;

            for (const comp of input.components) {
              if (comp.type === 'address') {
                tuple[comp.name] = '0x' + paramData.slice(tupleStart + tupleInnerOffset + 24, tupleStart + tupleInnerOffset + 64);
                tupleInnerOffset += 64;
              } else if (comp.type === 'uint256') {
                tuple[comp.name] = '0x' + paramData.slice(tupleStart + tupleInnerOffset, tupleStart + tupleInnerOffset + 64);
                tupleInnerOffset += 64;
              } else if (comp.type === 'bytes') {
                // Dynamic bytes within tuple
                const bytesRelOffset = parseInt(paramData.slice(tupleStart + tupleInnerOffset, tupleStart + tupleInnerOffset + 64), 16) * 2;
                const bytesStart = tupleStart + bytesRelOffset;
                const bytesLen = parseInt(paramData.slice(bytesStart, bytesStart + 64), 16) * 2;
                tuple[comp.name] = '0x' + paramData.slice(bytesStart + 64, bytesStart + 64 + bytesLen);
                tupleInnerOffset += 64;
              } else {
                // Generic 32-byte value
                tuple[comp.name] = '0x' + paramData.slice(tupleStart + tupleInnerOffset, tupleStart + tupleInnerOffset + 64);
                tupleInnerOffset += 64;
              }
            }

            tuples.push(tuple);
          }

          decoded[paramName] = tuples;
          console.log(`[AdvDecoder] Decoded tuple[] with ${tuples.length} elements`);
        } else if (input.type === 'address') {
          const addressHex = paramData.slice(offset + 24, offset + 64);
          decoded[paramName] = '0x' + addressHex;
        } else if (input.type.startsWith('uint')) {
          const valueHex = paramData.slice(offset, offset + 64);
          decoded[paramName] = parseInt(valueHex, 16);
        } else {
          // Generic 32-byte parameter
          const valueHex = paramData.slice(offset, offset + 64);
          decoded[paramName] = '0x' + valueHex;
        }

        offset += 64;
      }
    } catch (error) {
      console.warn(`[AdvDecoder] ABI parameter decoding error:`, error.message);
    }

    return decoded;
  }

  /**
   * Decode with EIP-7702 delegation context
   */
  async decodeWithDelegation(calldata, contractAddress, delegations, chainId) {
    // Check if the contract has delegated code
    const delegation = delegations.find(d => 
      d.address.toLowerCase() === contractAddress.toLowerCase() && !d.isRevocation
    );
    
    if (delegation) {
      console.log(`[AdvDecoder] Decoding with delegation to: ${delegation.address}`);
      // Decode using the delegate contract's metadata
      return await this.decodeCalldata(calldata, delegation.address, chainId);
    }
    
    // Standard decoding
    return await this.decodeCalldata(calldata, contractAddress, chainId);
  }

  /**
   * Get delegate contract code
   */
  async getDelegateCode(address, chainId) {
    try {
      // This would typically make an RPC call to get contract code
      // For now, return delegation designator format
      return DELEGATION_DESIGNATOR + address.slice(2).toLowerCase();
    } catch (error) {
      console.warn(`[AdvDecoder] Failed to get delegate code:`, error.message);
      return null;
    }
  }

  /**
   * Extract transaction data from various formats
   */
  extractTransactionData(rawTx) {
    if (typeof rawTx === 'object') {
      // Already parsed transaction object
      return {
        chainId: rawTx.chainId,
        nonce: rawTx.nonce,
        maxPriorityFeePerGas: rawTx.maxPriorityFeePerGas,
        maxFeePerGas: rawTx.maxFeePerGas,
        gasLimit: rawTx.gasLimit || rawTx.gas,
        to: rawTx.to || rawTx.destination,
        value: rawTx.value || rawTx.amount,
        data: rawTx.data || rawTx.payload,
        accessList: rawTx.accessList,
        authorizationList: rawTx.authorizationList
      };
    }
    
    if (typeof rawTx === 'string') {
      // TODO: Implement RLP decoding for raw transaction bytes
      // This would require a full RLP decoder implementation
      throw new Error('Raw transaction bytes decoding not yet implemented');
    }
    
    throw new Error('Invalid transaction format');
  }

  /**
   * Fallback to existing decoder for legacy transactions
   */
  async decodeLegacyTransaction(rawTx, contractAddress, chainId) {
    // Extract data from transaction
    const txData = this.extractTransactionData(rawTx);
    
    if (window.decodeCalldata && txData.data && (txData.to || contractAddress)) {
      return await window.decodeCalldata(txData.data, txData.to || contractAddress, chainId);
    }
    
    return {
      success: false,
      error: 'Legacy transaction decoder not available',
      txType: 'legacy'
    };
  }

  /**
   * Enhanced calldata decoder with field path resolution
   */
  async decodeCalldata(data, contractAddress, chainId) {
    try {
      const selector = this.extractFunctionSelector(data);
      if (!selector) {
        return {
          success: false,
          error: 'Invalid calldata format',
          selector: '0x',
          intent: 'Invalid data'
        };
      }
      
      // Get metadata for enhanced decoding
      const metadata = await this.getContractMetadata(contractAddress, chainId);
      if (!metadata) {
        // Fallback to existing decoder
        if (window.decodeCalldata) {
          return await window.decodeCalldata(data, contractAddress, chainId);
        }
        return {
          success: false,
          error: 'No metadata found',
          selector,
          intent: 'Unknown function'
        };
      }
      
      // Find function signature
      let functionSignature = this.functionSignatureCache[selector];
      let functionName = functionSignature ? functionSignature.split('(')[0] : undefined;
      
      if (!functionSignature && metadata.context?.contract?.abi) {
        for (const item of metadata.context.contract.abi) {
          if (item.type === 'function' && item.selector === selector) {
            const inputs = item.inputs || [];
            const types = inputs.map(input => input.type).join(',');
            functionSignature = `${item.name}(${types})`;
            functionName = item.name;
            this.functionSignatureCache[selector] = functionSignature;
            break;
          }
        }
      }
      
      if (!functionSignature || !functionName) {
        return {
          success: false,
          error: 'Function not found in metadata',
          selector,
          intent: 'Unknown function'
        };
      }
      
      // Get field information with path resolution
      const { intent, fieldInfo } = this.extractFieldInformation(
        metadata, functionSignature, functionName
      );
      
      // Decode parameters with enhanced formatting
      const decodedResult = await this.decodeParametersWithFieldPaths(
        data, metadata, functionSignature, functionName, fieldInfo
      );

      // Substitute intent template with actual decoded values
      const substitutedIntent = this.substituteIntentTemplate(
        intent,
        decodedResult.params,
        decodedResult.formatted
      );

      return {
        success: true,
        selector,
        function: functionSignature,
        functionName,
        params: decodedResult.params,
        intent: substitutedIntent || 'Contract interaction',
        formatted: decodedResult.formatted,
        fieldPaths: decodedResult.fieldPaths
      };
      
    } catch (error) {
      console.warn(`[AdvDecoder] Enhanced calldata decode error:`, error.message);
      
      // Fallback to existing decoder
      if (window.decodeCalldata) {
        return await window.decodeCalldata(data, contractAddress, chainId);
      }
      
      return {
        success: false,
        error: error.message,
        selector: this.extractFunctionSelector(data) || '0x',
        intent: 'Decode failed'
      };
    }
  }

  /**
   * Extract field information from metadata with support for multiple formats
   */
  extractFieldInformation(metadata, functionSignature, functionName) {
    let intent = 'Contract interaction';
    const fieldInfo = {};
    
    // Try ERC-7730 display.formats first
    if (metadata.display?.formats?.[functionSignature]) {
      const format = metadata.display.formats[functionSignature];
      intent = format.intent || intent;
      
      if (format.fields && Array.isArray(format.fields)) {
        for (const field of format.fields) {
          if (field.path) {
            fieldInfo[field.path] = {
              label: field.label || field.path,
              format: field.format || 'raw',
              description: field.description || '',
              params: field.params  // Include params for token formatting (decimals, symbol)
            };
          }
        }
      }
    }
    // Try KaiSign messages format
    else if (metadata.messages && functionName && metadata.messages[functionName]) {
      const messageFormat = metadata.messages[functionName];
      intent = messageFormat.label || intent;
      
      if (messageFormat.fields && Array.isArray(messageFormat.fields)) {
        for (const field of messageFormat.fields) {
          if (field.path) {
            fieldInfo[field.path] = {
              label: field.label || field.path,
              format: this.convertTypeToFormat(field.type),
              description: field.description || ''
            };
          }
        }
      }
    }
    
    return { intent, fieldInfo };
  }

  /**
   * Convert KaiSign field type to display format
   */
  convertTypeToFormat(type) {
    switch (type) {
      case 'address': return 'address';
      case 'wei': return 'wei';
      case 'uint256': return 'number';
      case 'bytes32': return 'hex';
      default: return 'raw';
    }
  }

  /**
   * Decode parameters with field path resolution
   */
  async decodeParametersWithFieldPaths(data, metadata, functionSignature, functionName, fieldInfo) {
    const params = {};
    const formatted = {};
    const fieldPaths = {};

    try {
      // Find ABI function for decoding
      let abiFunction = null;
      if (metadata.context?.contract?.abi) {
        abiFunction = metadata.context.contract.abi.find(
          item => item.type === 'function' && item.name === functionName
        );
      }
      
      if (abiFunction) {
        // Use ABI for accurate decoding
        const decodedData = await this.decodeWithABI(data, abiFunction);

        // Process each decoded parameter
        const inputs = abiFunction.inputs || [];

        // Handle both array (from ethers) and object (from decodeABIParameters) results
        if (Array.isArray(decodedData)) {
          // Array result - iterate by index
          for (let i = 0; i < decodedData.length && i < inputs.length; i++) {
            const input = inputs[i];
            const value = decodedData[i];
            const paramName = input.name || `param${i}`;

            if (input.type === 'tuple' && input.components) {
              this.processTupleParameter(value, input, paramName, params, formatted, fieldPaths, fieldInfo);
            } else {
              this.processSimpleParameter(value, input, paramName, params, formatted, fieldPaths, fieldInfo);
            }
          }
        } else if (decodedData && typeof decodedData === 'object') {
          // Object result - iterate by input names
          for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i];
            const paramName = input.name || `param${i}`;
            const value = decodedData[paramName];

            if (value !== undefined) {
              if (input.type === 'tuple' && input.components) {
                this.processTupleParameter(value, input, paramName, params, formatted, fieldPaths, fieldInfo);
              } else {
                this.processSimpleParameter(value, input, paramName, params, formatted, fieldPaths, fieldInfo);
              }
            }
          }
        }
      } else {
        // Fallback to simple parameter decoding
        const paramData = data.slice(10);
        const simpleParams = this.decodeABIParameters([{ type: 'bytes' }], paramData);
        
        params.data = paramData;
        formatted.data = {
          label: 'Transaction Data',
          value: paramData,
          format: 'hex'
        };
      }
    } catch (error) {
      console.warn(`[AdvDecoder] Parameter decoding error:`, error.message);
      
      // Emergency fallback
      params.rawData = data.slice(10);
      formatted.rawData = {
        label: 'Raw Data',
        value: data.slice(10),
        format: 'hex'
      };
    }
    
    return { params, formatted, fieldPaths };
  }

  /**
   * Process tuple parameter with nested field paths
   */
  processTupleParameter(value, inputDef, paramName, params, formatted, fieldPaths, fieldInfo) {
    if (!inputDef.components || !Array.isArray(inputDef.components)) return;
    
    params[paramName] = {};
    
    for (let i = 0; i < inputDef.components.length; i++) {
      const component = inputDef.components[i];
      const componentName = component.name || `field${i}`;
      const fieldPath = `${paramName}.${componentName}`;
      
      if (value && typeof value === 'object' && value[i] !== undefined) {
        const componentValue = this.formatValue(value[i]);
        params[paramName][componentName] = componentValue;
        
        // Get field definition for this path
        const fieldDef = fieldInfo[fieldPath] || fieldInfo[componentName];
        
        formatted[fieldPath] = {
          label: fieldDef?.label || this.toTitleCase(componentName),
          value: componentValue,
          format: fieldDef?.format || this.inferFormatFromType(component.type)
        };
        
        fieldPaths[fieldPath] = {
          paramName,
          componentName,
          type: component.type,
          arrayIndex: i
        };
      }
    }
  }

  /**
   * Process simple parameter
   */
  processSimpleParameter(value, inputDef, paramName, params, formatted, fieldPaths, fieldInfo) {
    const rawValue = this.formatValue(value);
    params[paramName] = rawValue;

    // Get field definition for this parameter
    const fieldDef = fieldInfo[paramName];

    // Apply proper formatting based on field definition
    let displayValue = rawValue;
    if (fieldDef?.format === 'amount' && fieldDef?.params) {
      // Format as token amount with decimals and symbol
      displayValue = this.formatTokenAmountWithParams(rawValue, fieldDef.params);
    }

    formatted[paramName] = {
      label: fieldDef?.label || this.toTitleCase(paramName),
      value: displayValue,
      format: fieldDef?.format || this.inferFormatFromType(inputDef.type),
      description: fieldDef?.description
    };

    fieldPaths[paramName] = {
      paramName,
      type: inputDef.type
    };
  }

  /**
   * Format token amount with decimals (no symbol - symbol comes from intent template)
   */
  formatTokenAmountWithParams(rawValue, params) {
    try {
      const decimals = Number(params.decimals || 18);

      // Fallback: simple BigInt-based formatting
      const value = BigInt(rawValue);
      const divisor = BigInt(10 ** decimals);
      const integerPart = value / divisor;
      const fractionalPart = value % divisor;

      const fractionalStr = fractionalPart.toString().padStart(decimals, '0').slice(0, 2);
      return `${integerPart}.${fractionalStr}`;
    } catch (e) {
      console.warn('[AdvDecoder] formatTokenAmountWithParams error:', e);
      return String(rawValue);
    }
  }

  /**
   * Format decoded value for display
   */
  formatValue(value) {
    if (typeof value === 'object' && value && '_isBigNumber' in value) {
      return value.toString();
    } else if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    } else {
      return String(value || '');
    }
  }

  /**
   * Infer display format from ABI type
   */
  inferFormatFromType(type) {
    if (type === 'address') return 'address';
    if (type.startsWith('uint') || type.startsWith('int')) return 'number';
    if (type.startsWith('bytes')) return 'hex';
    if (type === 'bool') return 'boolean';
    if (type === 'string') return 'string';
    return 'raw';
  }

  /**
   * Simple ABI decoder using available libraries
   */
  async decodeWithABI(data, abiFunction) {
    // Try to use ethers if available
    if (window.ethers?.utils?.Interface) {
      try {
        const iface = new window.ethers.utils.Interface([abiFunction]);
        const result = iface.decodeFunctionData(abiFunction.name, data);
        return Array.from(result);
      } catch (error) {
        console.warn(`[AdvDecoder] Ethers ABI decode failed:`, error.message);
      }
    }
    
    // Fallback to basic parameter decoding
    const paramData = data.slice(10);
    return this.decodeABIParameters(abiFunction.inputs || [], paramData);
  }

  /**
   * Convert string to title case
   */
  toTitleCase(str) {
    return str
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (match) => match.toUpperCase())
      .trim();
  }

  /**
   * Get contract metadata with enhanced blob storage integration
   */
  async getContractMetadata(contractAddress, chainId) {
    const cacheKey = `${contractAddress.toLowerCase()}-${chainId}`;
    
    // Check cache first
    if (this.metadataCache[cacheKey]) {
      return this.metadataCache[cacheKey];
    }
    
    // Try existing service first
    if (window.metadataService) {
      const metadata = await window.metadataService.getContractMetadata(contractAddress, chainId);
      if (metadata) {
        this.metadataCache[cacheKey] = metadata;
        return metadata;
      }
    }
    
    // Fallback to dynamic fetching
    const dynamicMetadata = await this.fetchDynamicMetadata(contractAddress, chainId);
    if (dynamicMetadata) {
      this.metadataCache[cacheKey] = dynamicMetadata;
      this.processFunctionSignatures(dynamicMetadata);
    }
    
    return dynamicMetadata;
  }

  /**
   * Fetch metadata dynamically via KaiSign subgraph and blob storage
   */
  async fetchDynamicMetadata(contractAddress, chainId) {
    try {
      console.log(`[AdvDecoder] Fetching dynamic metadata for ${contractAddress}`);
      
      // Step 1: Query KaiSign subgraph for blob hash
      const blobHash = await this.getBlobHashForContract(contractAddress, chainId);
      if (!blobHash) {
        return null;
      }
      
      // Step 2: Get storage URLs from Blobscan
      const { swarmUrl, googleUrl } = await this.getStorageUrlsForBlob(blobHash);
      
      // Step 3: Fetch and decode metadata
      const metadataUrl = swarmUrl || googleUrl;
      if (!metadataUrl) {
        console.warn(`[AdvDecoder] No storage URLs found for blob ${blobHash}`);
        return null;
      }
      
      const metadata = await this.fetchAndDecodeMetadata(metadataUrl);
      console.log(`[AdvDecoder] Successfully fetched metadata for ${contractAddress}`);
      
      return metadata;
    } catch (error) {
      console.warn(`[AdvDecoder] Failed to fetch dynamic metadata:`, error.message);
      return null;
    }
  }

  /**
   * Query KaiSign subgraph for blob hash
   */
  async getBlobHashForContract(contractAddress, chainId) {
    try {
      const normalizedAddress = contractAddress.toLowerCase();
      const query = {
        query: `{ 
          specs(where: {targetContract: "${normalizedAddress}"}) { 
            blobHash 
            targetContract 
            status 
          } 
        }`
      };
      
      const response = await fetch(KAISIGN_SUBGRAPH_URL, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(query)
      });
      
      if (!response.ok) {
        throw new Error(`Subgraph HTTP ${response.status}`);
      }
      
      const data = await response.json();
      const specs = data?.data?.specs || [];
      
      // Only use FINALIZED specs
      const finalizedSpec = specs.find(spec => spec.status === 'FINALIZED');

      return finalizedSpec?.blobHash || null;
    } catch (error) {
      console.warn(`[AdvDecoder] Subgraph query failed:`, error.message);
      return null;
    }
  }

  /**
   * Get storage URLs for a blob hash from Blobscan
   */
  async getStorageUrlsForBlob(blobHash) {
    try {
      const response = await fetch(`${BLOBSCAN_API_BASE}/blobs/${blobHash}`, {
        method: 'GET',
        mode: 'cors',
      });
      
      if (!response.ok) {
        throw new Error(`Blobscan HTTP ${response.status}`);
      }
      
      const data = await response.json();
      const refs = data?.dataStorageReferences || [];
      
      const swarmRef = refs.find(ref => ref.storage === 'swarm');
      const googleRef = refs.find(ref => ref.storage === 'google');
      
      return {
        swarmUrl: swarmRef?.url,
        googleUrl: googleRef?.url
      };
    } catch (error) {
      console.warn(`[AdvDecoder] Blobscan query failed:`, error.message);
      return {};
    }
  }

  /**
   * Fetch and decode metadata from storage URL
   */
  async fetchAndDecodeMetadata(url) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Storage fetch HTTP ${response.status}`);
      }
      
      const rawData = await response.text();
      
      // Handle hex-encoded blob data
      let jsonString = '';
      if (rawData.startsWith('"0x') || rawData.startsWith('0x')) {
        // Hex-encoded blob data
        const hexData = rawData.replace(/^"/, '').replace(/"$/, '').replace(/^0x/, '');
        const decodedString = this.hexToUtf8(hexData);
        const jsonStart = decodedString.indexOf('{');
        jsonString = jsonStart >= 0 ? decodedString.substring(jsonStart) : decodedString;
      } else {
        // Regular JSON response
        const jsonStart = rawData.indexOf('{');
        jsonString = jsonStart >= 0 ? rawData.substring(jsonStart) : rawData;
      }
      
      // Clean and parse JSON
      const cleanJsonString = jsonString.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
      return JSON.parse(cleanJsonString);
    } catch (error) {
      console.warn(`[AdvDecoder] Metadata parsing failed:`, error.message);
      throw error;
    }
  }

  /**
   * Convert hex string to UTF-8 with proper error handling
   */
  hexToUtf8(hexString) {
    try {
      // Remove any remaining 0x prefix and ensure even length
      const cleanHex = hexString.replace(/^0x/, '');
      const evenHex = cleanHex.length % 2 === 0 ? cleanHex : '0' + cleanHex;
      
      // Convert hex to bytes
      const bytes = [];
      for (let i = 0; i < evenHex.length; i += 2) {
        bytes.push(parseInt(evenHex.substr(i, 2), 16));
      }
      
      // Convert bytes to UTF-8 string and remove null bytes
      const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
      const uint8Array = new Uint8Array(bytes);
      return decoder.decode(uint8Array).replace(/\0/g, '');
    } catch (error) {
      console.warn(`[AdvDecoder] Hex decoding failed:`, error.message);
      throw error;
    }
  }

  /**
   * Process function signatures from metadata
   */
  processFunctionSignatures(metadata) {
    try {
      // Process ABI functions
      if (metadata?.context?.contract?.abi && Array.isArray(metadata.context.contract.abi)) {
        for (const item of metadata.context.contract.abi) {
          if (item.type === 'function') {
            const inputs = item.inputs || [];
            const types = inputs.map(input => input.type).join(',');
            const signature = `${item.name}(${types})`;
            const selector = item.selector || this.calculateFunctionSelector(signature);
            this.functionSignatureCache[selector] = signature;
          }
        }
      }
      
      // Process ERC-7730 display formats
      if (metadata?.display?.formats) {
        for (const signature of Object.keys(metadata.display.formats)) {
          const selector = this.calculateFunctionSelector(signature);
          this.functionSignatureCache[selector] = signature;
        }
      }
      
      // Process KaiSign messages format
      if (metadata?.messages) {
        for (const [functionName, messageData] of Object.entries(metadata.messages)) {
          if (messageData.fields && Array.isArray(messageData.fields)) {
            const paramTypes = this.inferParameterTypes(messageData.fields);
            const signature = `${functionName}(${paramTypes.join(',')})`;
            const selector = this.calculateFunctionSelector(signature);
            this.functionSignatureCache[selector] = signature;
          }
        }
      }
    } catch (error) {
      console.warn(`[AdvDecoder] Function signature processing failed:`, error.message);
    }
  }

  /**
   * Infer parameter types from KaiSign message fields
   */
  inferParameterTypes(fields) {
    const paramTypes = [];
    
    for (const field of fields) {
      if (field.type) {
        let abiType = field.type;
        if (abiType === 'wei') {
          // Intelligent type inference based on field path
          const path = field.path || '';
          if (path.includes('spec') || path.includes('hash') || path.includes('commitment')) {
            abiType = 'bytes32';
          } else {
            abiType = 'uint256';
          }
        }
        paramTypes.push(abiType);
      } else if (field.path !== '$value') {
        // Infer from path context
        const path = field.path || '';
        if (path.includes('address') || path.includes('contract')) {
          paramTypes.push('address');
        } else if (path.includes('amount') || path.includes('bond')) {
          paramTypes.push('uint256');
        } else {
          paramTypes.push('bytes32');
        }
      }
    }
    
    return paramTypes;
  }

  /**
   * Calculate function selector from signature
   */
  calculateFunctionSelector(signature) {
    // Use ethers-like keccak256 if available, otherwise simple hash
    if (window.ethers?.utils?.keccak256) {
      const hash = window.ethers.utils.keccak256(window.ethers.utils.toUtf8Bytes(signature));
      return hash.slice(0, 10);
    }
    
    // Simple fallback (not cryptographically secure, but for demo purposes)
    let hash = 0;
    for (let i = 0; i < signature.length; i++) {
      hash = ((hash << 5) - hash + signature.charCodeAt(i)) & 0xffffffff;
    }
    return '0x' + (Math.abs(hash) >>> 0).toString(16).padStart(8, '0').slice(0, 8);
  }

  /**
   * Extract function selector from calldata
   */
  extractFunctionSelector(data) {
    if (!data || typeof data !== 'string') return null;
    if (!data.startsWith('0x')) data = '0x' + data;
    if (data.length < 10) return null;
    return data.slice(0, 10).toLowerCase();
  }

  /**
   * Substitute intent template placeholders with actual decoded values
   * Handles both simple {paramName} and nested {param.field} paths
   */
  substituteIntentTemplate(template, params, formatted) {
    if (!template || typeof template !== 'string') return template;
    if (!template.includes('{')) return template;

    let result = template;

    // Replace {paramName} or {paramName:format} or {nested.path} patterns
    const regex = /\{([\w.]+)(?::(\w+))?\}/g;
    result = result.replace(regex, (match, paramPath, formatType) => {
      // Helper to get nested value by path (e.g., "data.fromAmount")
      const getNestedValue = (obj, path) => {
        if (!obj) return undefined;
        const parts = path.split('.');
        let value = obj;
        for (const part of parts) {
          if (value === undefined || value === null) return undefined;
          value = value[part];
        }
        return value;
      };

      // Try formatted value first (using path) - these have label/value structure
      const formattedValue = getNestedValue(formatted, paramPath);
      if (formattedValue && typeof formattedValue === 'object' && formattedValue.value !== undefined) {
        if (formatType === 'label') {
          return formattedValue.label || paramPath;
        }
        return formattedValue.value;
      }

      // Fall back to raw params for nested object paths
      const rawValue = getNestedValue(params, paramPath);
      if (rawValue !== undefined && rawValue !== null) {
        // Format BigNumber-like objects
        if (typeof rawValue === 'object' && rawValue._isBigNumber) {
          return rawValue.toString();
        }
        return String(rawValue);
      }

      // Return original placeholder if not found
      return match;
    });

    return result;
  }
}

// Create global instance
const advancedDecoder = new AdvancedTransactionDecoder();

// Export functions globally
window.advancedTransactionDecoder = advancedDecoder;
window.decodeAdvancedTransaction = advancedDecoder.decodeTransaction.bind(advancedDecoder);
window.extractNestedBytecodes = async function(calldata, contractAddress, chainId) {
  const analysis = await advancedDecoder.analyzeNestedCalls(calldata, contractAddress, chainId);
  return analysis.bytecodes;
};
window.getCallHierarchy = async function(calldata, contractAddress, chainId) {
  const analysis = await advancedDecoder.analyzeNestedCalls(calldata, contractAddress, chainId);
  return analysis.calls;
};

console.log('[KaiSign] Advanced transaction decoder ready - Types 0x2 and 0x4 with nested support');