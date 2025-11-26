console.log('[KaiSign] Content script loading...');

// =============================================================================
// UNIVERSAL ROUTER TRANSACTION PARSER (ETHERS.JS APPROACH)
// =============================================================================

// Minimal ABI decoder for Universal Router (replaces ethers.js dependency)
class SimpleABIDecoder {
  static decodeExecuteFunction(txData) {
    if (!txData || txData.length < 10) return null;
    
    // Remove function selector (0x3593564c)
    const payload = txData.slice(10);
    
    try {
      // Parse ABI-encoded parameters: execute(bytes commands, bytes[] inputs, uint256 deadline)
      const commandsOffset = parseInt(payload.slice(0, 64), 16) * 2;
      const inputsOffset = parseInt(payload.slice(64, 128), 16) * 2; 
      const deadline = parseInt(payload.slice(128, 192), 16);
      
      // Parse commands bytes
      const commandsLength = parseInt(payload.slice(commandsOffset, commandsOffset + 64), 16) * 2;
      const commandsData = '0x' + payload.slice(commandsOffset + 64, commandsOffset + 64 + commandsLength);
      
      // Parse inputs array
      const inputsArrayLength = parseInt(payload.slice(inputsOffset, inputsOffset + 64), 16);
      const inputs = [];
      
      // Extract each input
      let currentOffset = inputsOffset + 64; // Skip array length
      for (let i = 0; i < inputsArrayLength; i++) {
        const inputOffsetRelative = parseInt(payload.slice(currentOffset, currentOffset + 64), 16) * 2;
        const inputDataStart = inputsOffset + inputOffsetRelative;
        const inputLength = parseInt(payload.slice(inputDataStart, inputDataStart + 64), 16) * 2;
        const inputData = '0x' + payload.slice(inputDataStart + 64, inputDataStart + 64 + inputLength);
        
        inputs.push(inputData);
        currentOffset += 64;
      }
      
      return {
        commands: commandsData,
        inputs: inputs,
        deadline: deadline
      };
    } catch (error) {
      console.error('[SimpleABIDecoder] Error:', error);
      return null;
    }
  }
}

// Universal Router ABI (execute function)
const UNIVERSAL_ROUTER_ABI = [
  {
    "inputs": [
      {"name": "commands", "type": "bytes"},
      {"name": "inputs", "type": "bytes[]"},
      {"name": "deadline", "type": "uint256"}
    ],
    "name": "execute",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
];

// Known token addresses and symbols (from ERC7730 metadata approach)
const TOKEN_REGISTRY = {
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6, name: 'USD Coin' },
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18, name: 'Wrapped Ether' },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18, name: 'Dai Stablecoin' },
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6, name: 'Tether USD' },
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC', decimals: 8, name: 'Wrapped BTC' },
  '0x514910771af9ca656af840dff83e8264ecf986ca': { symbol: 'LINK', decimals: 18, name: 'Chainlink Token' },
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': { symbol: 'UNI', decimals: 18, name: 'Uniswap' },
  '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0': { symbol: 'MATIC', decimals: 18, name: 'Polygon' }
};

/**
 * Parse Universal Router transaction using ethers.js ABI decoding
 * Following the proven Snaps ERC7730 approach for proper token resolution
 */
async function parseUniversalRouterTransaction(txData, transactionValue = null) {
  try {
    console.log('[UR-Parser-Ethers] Starting ethers.js-based parsing');
    console.log('[UR-Parser-Ethers] Data length:', txData.length);
    
    // Use simple ABI decoder instead of ethers.js
    console.log('[UR-Parser-Ethers] Using SimpleABIDecoder...');
    const decoded = SimpleABIDecoder.decodeExecuteFunction(txData);
    
    if (!decoded) {
      console.error('[UR-Parser-Ethers] Failed to decode execute function');
      return [];
    }
    
    console.log('[UR-Parser-Ethers] Decoded parameters:');
    console.log('[UR-Parser-Ethers] Commands:', decoded.commands);
    console.log('[UR-Parser-Ethers] Inputs length:', decoded.inputs.length);
    console.log('[UR-Parser-Ethers] Deadline:', decoded.deadline);
    
    // Parse commands bytes and inputs array
    const commandsData = decoded.commands.slice(2); // Remove 0x prefix
    const commandsLength = commandsData.length;
    const inputsArrayLength = decoded.inputs.length;
    
    console.log('[UR-Parser-Ethers] Commands bytes length:', commandsLength / 2);
    console.log('[UR-Parser-Ethers] Commands data:', commandsData);
    console.log('[UR-Parser-Ethers] Inputs array length:', inputsArrayLength);
    
    const extractedCalls = [];
    
    // Add root Universal Router call
    extractedCalls.push({
      bytecode: txData,
      selector: '0x3593564c',
      depth: 1,
      index: 0,
      target: 'Universal Router',
      functionName: 'execute(bytes,bytes[],uint256)',
      type: 'universal_router_root',
      params: {
        commandsCount: commandsLength / 2,
        inputsCount: inputsArrayLength,
        deadline: decoded.deadline
      },
      description: `Universal Router execution with ${commandsLength / 2} commands`
    });
    
    // Parse each command byte and corresponding input with metadata-driven intents
    for (let i = 0; i < commandsLength; i += 2) {
      const commandByteHex = commandsData.slice(i, i + 2);
      const commandByte = parseInt(commandByteHex, 16);
      const commandInfo = getUniversalRouterCommandInfo(commandByte);
      
      console.log('[UR-Parser-Ethers] Command', i / 2, ':', commandByteHex, '->', commandInfo.name);
      console.log('[UR-Parser-Ethers] Intent:', commandInfo.intent);
      
      const commandIndex = i / 2;
      if (commandIndex < inputsArrayLength) {
        // Get the properly decoded input data for this command
        try {
          const inputData = decoded.inputs[commandIndex];
          
          console.log('[UR-Parser-Ethers] Input', commandIndex, 'length:', inputData.length, 'bytes');
          console.log('[UR-Parser-Ethers] Input', commandIndex, 'data:', inputData.slice(0, 50) + '...');
          
          // Create atomic function call for this command with intent
          extractedCalls.push({
            bytecode: inputData,
            selector: '0x' + commandByteHex,
            depth: 2,
            index: commandIndex + 1,
            target: 'Universal Router',
            functionName: commandInfo.name,
            intent: commandInfo.intent,
            category: commandInfo.category,
            type: 'universal_router_command',
            params: {
              commandByte: '0x' + commandByteHex,
              inputLength: inputData.length,
              commandCategory: commandInfo.category
            },
            description: commandInfo.intent
          });
          
          // Extract meaningful parameters from input data using proper token resolution
          const parsedParams = parseUniversalRouterInputDataWithTokens(commandInfo, inputData);
          if (parsedParams) {
            extractedCalls[extractedCalls.length - 1].parsedParams = parsedParams;
            extractedCalls[extractedCalls.length - 1].description = formatCommandDescriptionWithTokens(commandInfo, parsedParams, transactionValue);
          } else {
            // For commands without parsed params, try to format with transaction value
            const description = formatCommandDescription(commandInfo, null, transactionValue);
            extractedCalls[extractedCalls.length - 1].description = description;
          }
          
          // If this input data contains a function selector, extract it as a nested call
          if (inputData.length >= 10) {
            const nestedSelector = inputData.slice(0, 10);
            const nestedFunctionName = getFunctionNameFromSelector(nestedSelector);
            
            if (nestedFunctionName && nestedFunctionName !== 'unknown') {
              extractedCalls.push({
                bytecode: inputData,
                selector: nestedSelector,
                depth: 3,
                index: (i / 2) * 10 + 100, // Unique index for nested calls
                target: 'Nested Function Target',
                functionName: nestedFunctionName,
                intent: `Nested: ${nestedFunctionName}`,
                type: 'nested_function_call',
                params: {
                  parentCommand: commandInfo.name,
                  dataLength: inputData.length / 2
                },
                description: `Nested function call: ${nestedFunctionName}`
              });
            }
          }
          
        } catch (inputError) {
          console.log('[UR-Parser] Error parsing input', i / 2, ':', inputError.message);
        }
      }
    }
    
    console.log('[UR-Parser] ✅ Successfully parsed', extractedCalls.length, 'atomic calls');
    return extractedCalls;
    
  } catch (error) {
    console.error('[UR-Parser] ❌ Error parsing Universal Router:', error);
    return [];
  }
}

/**
 * Get Universal Router command name from command byte
 */
// Simple Universal Router command mapping for clear intents
function getUniversalRouterCommandInfo(commandByte) {
  const commands = {
    0x00: { name: 'V3_SWAP_EXACT_IN', intent: 'Swap', category: 'swap', action: 'swap' },
    0x01: { name: 'V3_SWAP_EXACT_OUT', intent: 'Swap', category: 'swap', action: 'swap' }, 
    0x02: { name: 'PERMIT2_TRANSFER_FROM', intent: 'Transfer', category: 'transfer', action: 'transfer' },
    0x03: { name: 'PERMIT2_PERMIT_BATCH', intent: 'Permit', category: 'permit', action: 'permit' },
    0x04: { name: 'SWEEP', intent: 'Sweep', category: 'cleanup', action: 'sweep' },
    0x05: { name: 'TRANSFER', intent: 'Transfer', category: 'transfer', action: 'transfer' },
    0x06: { name: 'PAY_PORTION', intent: 'Pay', category: 'payment', action: 'pay' },
    0x08: { name: 'V2_SWAP_EXACT_IN', intent: 'Swap', category: 'swap', action: 'swap' },
    0x09: { name: 'V2_SWAP_EXACT_OUT', intent: 'Swap', category: 'swap', action: 'swap' },
    0x0a: { name: 'PERMIT2_PERMIT', intent: 'Permit', category: 'permit', action: 'permit' },
    0x0b: { name: 'WRAP_ETH', intent: 'Wrap ETH', category: 'wrap', action: 'wrap' },
    0x0c: { name: 'UNWRAP_WETH', intent: 'Unwrap WETH', category: 'unwrap', action: 'unwrap' },
    0x0d: { name: 'PERMIT2_TRANSFER_FROM_BATCH', intent: 'Transfer', category: 'transfer', action: 'transfer' },
    0x0e: { name: 'BALANCE_CHECK_ERC20', intent: 'Check Balance', category: 'query', action: 'check' },
    0x10: { name: 'SEAPORT', intent: 'Marketplace', category: 'marketplace', action: 'trade' },
    0x11: { name: 'LOOKS_RARE_V2', intent: 'Marketplace', category: 'marketplace', action: 'trade' },
    0x12: { name: 'NFTX', intent: 'Vault', category: 'vault', action: 'vault' },
    0x13: { name: 'CRYPTOPUNKS', intent: 'Marketplace', category: 'marketplace', action: 'trade' }
  };
  
  return commands[commandByte] || { 
    name: `UNKNOWN_CMD_0x${commandByte.toString(16).padStart(2, '0')}`, 
    intent: 'Unknown',
    category: 'unknown',
    action: 'unknown'
  };
}

// Backward compatibility
function getUniversalRouterCommandName(commandByte) {
  return getUniversalRouterCommandInfo(commandByte).name;
}

/**
 * Enhanced token address resolution using TOKEN_REGISTRY
 */
function resolveTokenSymbol(address) {
  if (!address) return null;
  
  const normalizedAddress = address.toLowerCase();
  const token = TOKEN_REGISTRY[normalizedAddress];
  
  if (token) {
    console.log('[Token-Resolver] Found:', normalizedAddress, '->', token.symbol);
    return token.symbol;
  }
  
  console.log('[Token-Resolver] Unknown token:', normalizedAddress);
  return null;
}

/**
 * Parse Universal Router input data with proper token resolution
 */
function parseUniversalRouterInputDataWithTokens(commandInfo, inputData) {
  if (!inputData || inputData.length < 10) return null;
  
  try {
    const category = commandInfo.category;
    const data = inputData.slice(2); // Remove 0x
    
    console.log('[Token-Parser] Parsing command category:', category);
    console.log('[Token-Parser] Input data length:', data.length);
    
    // Parse based on command category with enhanced token detection
    switch (category) {
      case 'swap':
        // V3_SWAP_EXACT_IN: Look for token addresses in the swap path
        const addresses = [];
        for (let i = 0; i < data.length; i += 64) {
          const chunk = data.slice(i, i + 64);
          if (chunk.length === 64 && chunk.slice(0, 24) === '000000000000000000000000') {
            const addr = '0x' + chunk.slice(24);
            if (addr !== '0x0000000000000000000000000000000000000000' && addr.length === 42) {
              // Filter out obvious ABI offset addresses (small numbers, mostly zeros)
              const isAbiOffset = addr.match(/^0x00000000000000000000000000000000000[0-9a-f]{1,5}$/i);
              if (!isAbiOffset && addr !== '0x0000000000000000000000000000000000000000') {
                addresses.push(addr);
                console.log('[Token-Parser] ✅ Found real address:', addr);
              } else {
                console.log('[Token-Parser] ❌ Skipping ABI offset:', addr);
              }
            }
          }
        }
        
        // Enhanced token search in raw hex data
        const knownTokenAddresses = Object.keys(TOKEN_REGISTRY);
        const foundTokens = [];
        
        for (const tokenAddr of knownTokenAddresses) {
          const searchAddr = tokenAddr.slice(2).toLowerCase(); // Remove 0x
          if (data.toLowerCase().includes(searchAddr)) {
            foundTokens.push(tokenAddr); // Don't add 0x prefix since tokenAddr already has it
            console.log('[Token-Parser] Found token in hex:', tokenAddr);
          }
        }
        
        // Combine both methods
        const allTokens = [...new Set([...addresses, ...foundTokens])];
        
        if (allTokens.length >= 2) {
          const fromToken = resolveTokenSymbol(allTokens[0]) || allTokens[0];
          const toToken = resolveTokenSymbol(allTokens[1]) || allTokens[1];
          
          return {
            fromToken: allTokens[0],
            toToken: allTokens[1], 
            fromSymbol: fromToken,
            toSymbol: toToken,
            type: 'swap'
          };
        } else if (allTokens.length === 1) {
          // Single token found, assume ETH as other token
          const knownToken = resolveTokenSymbol(allTokens[0]) || allTokens[0];
          return {
            fromToken: 'ETH',
            toToken: allTokens[0],
            fromSymbol: 'ETH', 
            toSymbol: knownToken,
            type: 'swap'
          };
        }
        break;
        
      case 'transfer':
      case 'cleanup':
        // Enhanced token detection for transfer/sweep commands
        const transferAddresses = [];
        for (let i = 0; i < data.length; i += 64) {
          const chunk = data.slice(i, i + 64);
          if (chunk.length === 64 && chunk.slice(0, 24) === '000000000000000000000000') {
            const addr = '0x' + chunk.slice(24);
            if (addr !== '0x0000000000000000000000000000000000000000' && addr.length === 42) {
              // Filter out ABI offset addresses
              const isAbiOffset = addr.match(/^0x00000000000000000000000000000000000[0-9a-f]{1,5}$/i);
              if (!isAbiOffset && addr !== '0x0000000000000000000000000000000000000000') {
                transferAddresses.push(addr);
                console.log('[Token-Parser] ✅ Found real transfer address:', addr);
              } else {
                console.log('[Token-Parser] ❌ Skipping transfer ABI offset:', addr);
              }
            }
          }
        }
        
        // Also search for known tokens in the hex data for cleanup commands
        const cleanupTokenAddresses = Object.keys(TOKEN_REGISTRY);
        const foundCleanupTokens = [];
        
        for (const tokenAddr of cleanupTokenAddresses) {
          const searchAddr = tokenAddr.slice(2).toLowerCase(); // Remove 0x
          if (data.toLowerCase().includes(searchAddr)) {
            foundCleanupTokens.push(tokenAddr);
            console.log('[Token-Parser] Found cleanup token:', tokenAddr);
          }
        }
        
        // Combine both methods
        const allTransferTokens = [...new Set([...transferAddresses, ...foundCleanupTokens])];
        
        if (allTransferTokens.length >= 1) {
          const token = allTransferTokens[0];
          const tokenSymbol = resolveTokenSymbol(token) || token;
          
          return {
            token: token,
            tokenSymbol: tokenSymbol,
            recipient: allTransferTokens[1] || null,
            type: 'transfer'
          };
        }
        break;
    }
    
    return null;
  } catch (error) {
    console.error('[Token-Parser] Error parsing input data:', error);
    return null;
  }
}

/**
 * Format command description with proper token symbols
 */
function formatCommandDescriptionWithTokens(commandInfo, parsedParams, transactionValue) {
  if (!parsedParams) {
    return commandInfo.intent || commandInfo.name;
  }
  
  try {
    switch (parsedParams.type) {
      case 'swap':
        if (parsedParams.fromSymbol && parsedParams.toSymbol) {
          return `🔄 Swap ${parsedParams.fromSymbol} to ${parsedParams.toSymbol}`;
        }
        break;
        
      case 'transfer':
        if (parsedParams.tokenSymbol) {
          return `📤 Transfer ${parsedParams.tokenSymbol}`;
        }
        break;
    }
    
    // Fallback to original formatting
    return formatCommandDescription(commandInfo, parsedParams, transactionValue);
  } catch (error) {
    console.error('[Format-Description] Error:', error);
    return commandInfo.intent || commandInfo.name;
  }
}

/**
 * Parse Universal Router input data to extract meaningful parameters (Original)
 */
function parseUniversalRouterInputData(commandInfo, inputData) {
  if (!inputData || inputData.length < 10) return null;
  
  try {
    const category = commandInfo.category;
    const data = inputData.slice(2); // Remove 0x
    
    // Parse based on command category
    switch (category) {
      case 'transfer':
      case 'cleanup':
        // TRANSFER/SWEEP: contains token address and recipient
        const addresses = [];
        for (let i = 0; i < data.length; i += 64) {
          const chunk = data.slice(i, i + 64);
          if (chunk.length === 64 && chunk.slice(0, 24) === '000000000000000000000000') {
            const addr = '0x' + chunk.slice(24);
            if (addr !== '0x0000000000000000000000000000000000000000' && addr.length === 42) {
              addresses.push(addr);
            }
          }
        }
        if (addresses.length >= 2) {
          return {
            token: addresses[0], // First address is usually token
            recipient: addresses[1], // Second is recipient
            type: 'transfer'
          };
        }
        break;
        
      case 'marketplace':
        // SEAPORT: complex marketplace data
        if (data.length >= 64) {
          return {
            marketplace: 'Seaport',
            dataLength: data.length / 2,
            type: 'marketplace',
            note: 'NFT/token marketplace operation'
          };
        }
        break;
        
      case 'swap':
        // V3_SWAP_EXACT_IN: contains pool info, amounts, etc.
        if (data.length >= 128) {
          return {
            swapType: 'exactInput',
            token0: data.slice(24, 64) ? '0x' + data.slice(24, 64) : null,
            token1: data.slice(88, 128) ? '0x' + data.slice(88, 128) : null,
            amount: data.slice(128, 192) ? '0x' + data.slice(128, 192) : null,
            type: 'swap'
          };
        }
        break;
    }
    
    // Direct search for known token addresses in the hex data
    const knownTokens = {
      'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
      'c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH',
      '6b175474e89094c44da98b954eedeac495271d0f': 'DAI'
    };
    
    const foundTokens = [];
    const lowerData = data.toLowerCase();
    
    for (const [tokenAddr, symbol] of Object.entries(knownTokens)) {
      if (lowerData.includes(tokenAddr)) {
        foundTokens.push({ address: '0x' + tokenAddr, symbol });
        console.log(`[Parser] Found ${symbol} token in ${commandInfo.name} data`);
      }
    }
    
    if (foundTokens.length > 0) {
      return {
        addresses: foundTokens.map(t => t.address),
        tokens: foundTokens,
        type: 'token_found',
        dataLength: data.length / 2
      };
    }
    
    // Fallback: extract any valid-looking addresses
    const addresses = [];
    for (let i = 0; i < data.length; i += 64) {
      const chunk = data.slice(i, i + 64);
      if (chunk.length === 64 && chunk.slice(0, 24) === '000000000000000000000000') {
        const addr = '0x' + chunk.slice(24);
        if (addr.length === 42 && 
            addr !== '0x0000000000000000000000000000000000000000' &&
            addr.match(/^0x[a-fA-F0-9]{40}$/)) {
          const addrNum = BigInt(addr);
          if (addrNum > 0x100000) { // Reasonable address threshold
            addresses.push(addr);
          }
        }
      }
    }
    
    console.log('[Parser] Command:', commandInfo.name, 'Category:', commandInfo.category);
    console.log('[Parser] Found tokens:', foundTokens.map(t => t.symbol));
    console.log('[Parser] Extracted addresses:', addresses);
    
    return addresses.length > 0 ? { 
      addresses, 
      type: 'generic',
      dataLength: data.length / 2 
    } : null;
    
  } catch (error) {
    console.log('[UR-Parser] Parameter parsing failed:', error.message);
    return null;
  }
}

// Token metadata for common tokens
const TOKEN_METADATA = {
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH', 
  '0x6b175474e89094c44da98b954eedeac495271d0f': 'DAI',
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'WBTC',
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': 'UNI',
  '0x514910771af9ca656af840dff83e8264ecf986ca': 'LINK',
  '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': 'AAVE',
  '0x0000000000000000000000000000000000000000': 'ETH'
};

/**
 * Get token symbol from address
 */
function getTokenSymbol(address) {
  if (!address) return 'TOKEN';
  const normalized = address.toLowerCase();
  return TOKEN_METADATA[normalized] || address.slice(0, 6) + '...';
}

/**
 * Format command description with parsed parameters and token names
 */
function formatCommandDescription(commandInfo, parsedParams, transactionValue) {
  if (!parsedParams) {
    // For WRAP_ETH and UNWRAP_WETH, use transaction value
    if (commandInfo.action === 'wrap' && transactionValue) {
      return `Wrap ${formatEther(transactionValue)} ETH to WETH`;
    }
    if (commandInfo.action === 'unwrap') {
      return `Unwrap WETH to ETH`;
    }
    return commandInfo.intent;
  }
  
  switch (parsedParams.type) {
    case 'transfer':
      const fromToken = getTokenSymbol(parsedParams.token);
      const recipient = parsedParams.recipient ? parsedParams.recipient.slice(0, 6) + '...' : 'recipient';
      return `Transfer ${fromToken} to ${recipient}`;
      
    case 'swap':
      const token0 = getTokenSymbol(parsedParams.token0);
      const token1 = getTokenSymbol(parsedParams.token1);
      return `Swap ${token0} to ${token1}`;
      
    case 'marketplace':
      return `${parsedParams.marketplace} Trade`;
      
    case 'generic':
      if (parsedParams.addresses.length > 0) {
        const firstToken = getTokenSymbol(parsedParams.addresses[0]);
        return `${commandInfo.intent} ${firstToken}`;
      }
      return commandInfo.intent;
      
    default:
      return commandInfo.intent;
  }
}

/**
 * Simple ETH formatter (convert hex wei to ETH)
 */
function formatEther(hexValue) {
  try {
    if (!hexValue || hexValue === '0x0') return '0';
    const wei = BigInt(hexValue);
    const eth = Number(wei) / 1e18;
    return eth > 0.001 ? eth.toFixed(4) : eth.toExponential(2);
  } catch {
    return hexValue;
  }
}

/**
 * Determine main transaction intent from Universal Router calls
 */
function getMainTransactionIntent(calls, transactionValue) {
  if (!calls || calls.length === 0) return null;
  
  console.log('[Intent] Analyzing calls for main intent:', calls.map(c => ({ category: c.category, parsedParams: c.parsedParams })));
  
  // Look for patterns in the calls
  const hasWrapEth = calls.some(call => call.category === 'wrap');
  const hasUnwrapWeth = calls.some(call => call.category === 'unwrap');
  const hasSwap = calls.some(call => call.category === 'swap');
  const hasMarketplace = calls.some(call => call.category === 'marketplace');
  const transferCalls = calls.filter(call => call.category === 'transfer' || call.category === 'cleanup');
  
  console.log('[Intent] Patterns detected:', { hasWrapEth, hasUnwrapWeth, hasSwap, hasMarketplace, transferCallsCount: transferCalls.length });
  
  // Find all unique token addresses in the transaction
  const allTokens = new Set();
  const foundTokenSymbols = new Set();
  
  calls.forEach((call, index) => {
    if (call.parsedParams) {
      console.log(`[Intent] Call ${index} parsedParams:`, call.parsedParams);
      
      // Handle enhanced parser token format
      if (call.parsedParams.fromToken) {
        allTokens.add(call.parsedParams.fromToken);
        if (call.parsedParams.fromSymbol) foundTokenSymbols.add(call.parsedParams.fromSymbol);
      }
      if (call.parsedParams.toToken) {
        allTokens.add(call.parsedParams.toToken);
        if (call.parsedParams.toSymbol) foundTokenSymbols.add(call.parsedParams.toSymbol);
      }
      // Handle legacy parser token format
      if (call.parsedParams.token) {
        allTokens.add(call.parsedParams.token);
        if (call.parsedParams.tokenSymbol) foundTokenSymbols.add(call.parsedParams.tokenSymbol);
      }
      if (call.parsedParams.addresses) {
        call.parsedParams.addresses.forEach(addr => allTokens.add(addr));
      }
      if (call.parsedParams.tokens) {
        call.parsedParams.tokens.forEach(token => {
          allTokens.add(token.address);
          foundTokenSymbols.add(token.symbol);
        });
      }
    }
  });
  
  // Remove WETH from tokens to find the actual target token
  const nonWethTokens = Array.from(allTokens).filter(token => 
    token.toLowerCase() !== '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' &&
    token.toLowerCase() !== '0x0000000000000000000000000000000000000000'
  );
  
  console.log('[Intent] All tokens found:', Array.from(allTokens));
  console.log('[Intent] Non-WETH tokens:', nonWethTokens);
  console.log('[Intent] Found token symbols:', Array.from(foundTokenSymbols));
  
  let fromToken = 'ETH';
  let toToken = null;
  
  // If we found any non-WETH tokens, prioritize known tokens (USDC, DAI, etc) over unknown ones
  if (nonWethTokens.length > 0) {
    // Prioritize tokens we can resolve to symbols (like USDC)
    let targetTokenAddress = nonWethTokens[0];
    
    // Find a token we can actually resolve to a symbol
    for (const token of nonWethTokens) {
      const symbol = resolveTokenSymbol(token);
      if (symbol && symbol !== token) { // Found a real symbol, not just the address
        targetTokenAddress = token;
        break;
      }
    }
    
    // Try enhanced token resolution first, fallback to legacy
    const targetTokenSymbol = resolveTokenSymbol(targetTokenAddress) || getTokenSymbol(targetTokenAddress);
    console.log('[Intent] Target token:', targetTokenAddress, '->', targetTokenSymbol);
    console.log('[Intent] Prioritized known token:', targetTokenSymbol !== targetTokenAddress ? 'YES' : 'NO');
    
    if (hasWrapEth && !hasUnwrapWeth) {
      // ETH → Token
      fromToken = 'ETH';
      toToken = targetTokenSymbol;
    } else if (!hasWrapEth && hasUnwrapWeth) {
      // Token → ETH
      fromToken = targetTokenSymbol;
      toToken = 'ETH';
    } else if (hasWrapEth && hasUnwrapWeth) {
      // ETH → Token → ETH (might be a trade through the token)
      fromToken = 'ETH';
      toToken = targetTokenSymbol;
    } else {
      // Direct token operation
      toToken = targetTokenSymbol;
    }
  } else if (foundTokenSymbols.size > 0) {
    // Fallback: if we have token symbols but no clear target address
    const symbolArray = Array.from(foundTokenSymbols);
    const targetSymbol = symbolArray.find(s => s !== 'ETH' && s !== 'WETH') || symbolArray[0];
    console.log('[Intent] Using fallback token symbol:', targetSymbol);
    
    if (hasWrapEth && !hasUnwrapWeth) {
      fromToken = 'ETH';
      toToken = targetSymbol;
    } else if (!hasWrapEth && hasUnwrapWeth) {
      fromToken = targetSymbol;
      toToken = 'ETH';
    } else {
      toToken = targetSymbol;
    }
  } else {
    // Fallback: search for known tokens in the raw transaction data
    console.log('[Intent] No tokens found in parsed params, searching raw transaction...');
    const rawTx = calls[0]?.bytecode || '';
    
    // Check for USDC specifically in the transaction data
    if (rawTx.toLowerCase().includes('a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')) {
      console.log('[Intent] Found USDC in raw transaction data!');
      if (hasWrapEth && !hasUnwrapWeth) {
        fromToken = 'ETH';
        toToken = 'USDC';
      } else if (!hasWrapEth && hasUnwrapWeth) {
        fromToken = 'USDC';
        toToken = 'ETH';
      } else {
        toToken = 'USDC';
      }
    }
    
    // Search for known token addresses in the raw transaction
    const tokenSearchMap = {
      'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
      'c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH',
      '6b175474e89094c44da98b954eedeac495271d0f': 'DAI',
      'dac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
      '2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'WBTC'
    };
    
    for (const [tokenAddr, tokenSymbol] of Object.entries(tokenSearchMap)) {
      if (rawTx.toLowerCase().includes(tokenAddr)) {
        console.log(`[Intent] Found ${tokenSymbol} in raw transaction`);
        if (hasMarketplace && !hasWrapEth && !hasUnwrapWeth) {
          // Direct marketplace trade
          toToken = tokenSymbol;
          fromToken = 'Unknown';
        } else if (hasWrapEth) {
          fromToken = 'ETH';
          toToken = tokenSymbol;
        } else if (hasUnwrapWeth) {
          fromToken = tokenSymbol;
          toToken = 'ETH';
        } else {
          toToken = tokenSymbol;
        }
        break;
      }
    }
  }
  
  console.log('[Intent] Final tokens:', { fromToken, toToken });
  
  // Format the intent
  if (hasMarketplace && (hasWrapEth || hasUnwrapWeth)) {
    return toToken ? `Swap ${fromToken} to ${toToken}` : `Swap ${fromToken}`;
  } else if (hasSwap) {
    return toToken ? `Swap ${fromToken} to ${toToken}` : 'Token Swap';
  } else if (transferCalls.length > 0 && toToken) {
    return hasWrapEth ? `Swap ${fromToken} to ${toToken}` : `Transfer ${toToken}`;
  }
  
  return null;
}

/**
 * Get function name from selector (basic mapping for common functions)
 */
function getFunctionNameFromSelector(selector) {
  const commonFunctions = {
    '0xa9059cbb': 'transfer(address,uint256)',
    '0x23b872dd': 'transferFrom(address,address,uint256)',
    '0x095ea7b3': 'approve(address,uint256)',
    '0x70a08231': 'balanceOf(address)',
    '0x414bf389': 'exactInputSingle((address,address,uint24,uint160,address,uint256,uint256,uint160))',
    '0x38ed1739': 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
    '0xd0e30db0': 'deposit()',
    '0x2e1a7d4d': 'withdraw(uint256)',
    '0x01e1d114': 'sweepToken(address,uint256,address)'
  };
  return commonFunctions[selector] || 'unknown';
}

// Wallet detection and hooking
const hookedWallets = new Set();

// Wait for any wallet
function waitForWallets() {
  // Check for different wallet providers
  detectAndHookWallets();
  
  // Keep checking for new wallets (some load late)
  setTimeout(waitForWallets, 500);
}

// Detect and hook various wallets
function detectAndHookWallets() {
  // 1. MetaMask (window.ethereum)
  if (window.ethereum && window.ethereum.request && !hookedWallets.has('ethereum')) {
    console.log('[KaiSign] Ethereum provider found (MetaMask/others), hooking...');
    hookWalletProvider(window.ethereum, 'ethereum');
    hookedWallets.add('ethereum');
  }
  
  // 2. Rabby (window.rabby)
  if (window.rabby && window.rabby.request && !hookedWallets.has('rabby')) {
    console.log('[KaiSign] Rabby wallet found, hooking...');
    hookWalletProvider(window.rabby, 'rabby');
    hookedWallets.add('rabby');
  }
  
  // 3. Coinbase Wallet (window.coinbaseWalletExtension)
  if (window.coinbaseWalletExtension && window.coinbaseWalletExtension.request && !hookedWallets.has('coinbase')) {
    console.log('[KaiSign] Coinbase Wallet found, hooking...');
    hookWalletProvider(window.coinbaseWalletExtension, 'coinbase');
    hookedWallets.add('coinbase');
  }
  
  // 4. Trust Wallet (window.trustWallet)
  if (window.trustWallet && window.trustWallet.request && !hookedWallets.has('trust')) {
    console.log('[KaiSign] Trust Wallet found, hooking...');
    hookWalletProvider(window.trustWallet, 'trust');
    hookedWallets.add('trust');
  }
  
  // 5. Phantom (window.phantom?.ethereum)
  if (window.phantom?.ethereum && window.phantom.ethereum.request && !hookedWallets.has('phantom')) {
    console.log('[KaiSign] Phantom Wallet found, hooking...');
    hookWalletProvider(window.phantom.ethereum, 'phantom');
    hookedWallets.add('phantom');
  }
  
  // 6. Check for multiple providers (some wallets inject arrays)
  if (window.ethereum?.providers && Array.isArray(window.ethereum.providers)) {
    window.ethereum.providers.forEach((provider, index) => {
      const walletKey = `provider-${index}`;
      if (provider.request && !hookedWallets.has(walletKey)) {
        const walletName = getWalletName(provider);
        console.log(`[KaiSign] Provider ${index} found (${walletName}), hooking...`);
        hookWalletProvider(provider, walletKey, walletName);
        hookedWallets.add(walletKey);
      }
    });
  }
}

// Get wallet name from provider
function getWalletName(provider) {
  if (provider.isMetaMask) return 'MetaMask';
  if (provider.isRabby) return 'Rabby';
  if (provider.isCoinbaseWallet) return 'Coinbase';
  if (provider.isTrust) return 'Trust';
  if (provider.isPhantom) return 'Phantom';
  if (provider.isBraveWallet) return 'Brave';
  if (provider.isExodus) return 'Exodus';
  return 'Unknown Wallet';
}

// Generic wallet provider hooker
function hookWalletProvider(provider, walletKey, walletName = walletKey) {
  if (!provider.request) return;
  
  const originalRequest = provider.request.bind(provider);
  
  provider.request = async function(args) {
    console.log(`[KaiSign] ${walletName} Request:`, args.method);
    
    // Check if it's a transaction
    if (args.method === 'eth_sendTransaction' || args.method === 'eth_signTransaction') {
      const tx = args.params?.[0] || {};
      console.log(`[KaiSign] ${walletName} TRANSACTION:`, tx);
      
      // Get intent and show popup
      getIntentAndShow(tx, args.method, walletName);
    }
    
    // Call original wallet request
    return await originalRequest(args);
  };
  
  console.log(`[KaiSign] ${walletName} hooked successfully`);
}

// Get intent and show transaction
async function getIntentAndShow(tx, method, walletName = 'Wallet') {
  let intent = 'Loading intent...';
  let decodedResult = null;
  let extractedBytecodes = [];
  
  // UNIVERSAL ROUTER SPECIFIC PARSING - CHECK FIRST, TAKES PRECEDENCE
  console.log('[KaiSign] Checking Universal Router - data exists:', !!tx.data);
  console.log('[KaiSign] Checking Universal Router - data starts with 0x3593564c:', tx.data?.startsWith('0x3593564c'));
  
  if (tx.data && tx.data.startsWith('0x3593564c')) {
    console.log('[KaiSign] 🌐 UNIVERSAL ROUTER DETECTED!!! - parsing commands FIRST');
    console.log('[KaiSign] TX data length:', tx.data.length);
    console.log('[KaiSign] TX data start:', tx.data.slice(0, 50));
    console.log('[KaiSign] Parser function available:', typeof parseUniversalRouterTransaction);
    
    // Force immediate popup update with Universal Router detection
    intent = 'Universal Router detected - parsing...';
    showEnhancedTransactionInfo(tx, method, intent, walletName, { success: false }, []);
    
    try {
      const universalRouterCalls = await parseUniversalRouterTransaction(tx.data, tx.value);
      console.log('[KaiSign] Parser returned:', universalRouterCalls);
      console.log('[KaiSign] Parser returned length:', universalRouterCalls?.length);
      
      if (universalRouterCalls && universalRouterCalls.length > 0) {
        console.log('[KaiSign] ✅ SUCCESS - Parsed', universalRouterCalls.length, 'Universal Router commands');
        extractedBytecodes = universalRouterCalls;
        
        // Set intent specifically for Universal Router with detected tokens
        const mainIntent = getMainTransactionIntent(universalRouterCalls, tx.value);
        intent = mainIntent || `Universal Router: ${universalRouterCalls.length} atomic calls`;
        decodedResult = {
          success: true,
          functionName: 'execute(bytes,bytes[],uint256)',
          selector: '0x3593564c',
          intent: intent,
          universalRouter: true,
          atomicCalls: universalRouterCalls.length
        };
        
        // Show final popup with Universal Router data
        showEnhancedTransactionInfo(tx, method, intent, walletName, decodedResult, extractedBytecodes);
        console.log('[KaiSign] ✅ UNIVERSAL ROUTER POPUP DISPLAYED WITH', universalRouterCalls.length, 'CALLS');
        return; // Skip ALL other decoding for Universal Router
      } else {
        console.log('[KaiSign] ❌ UNIVERSAL ROUTER PARSER RETURNED EMPTY OR NULL');
      }
    } catch (urError) {
      console.log('[KaiSign] ❌ UNIVERSAL ROUTER PARSING FAILED:', urError.message);
      console.error('[KaiSign] UR Error details:', urError);
    }
  }
  
  // Show popup immediately with loading state for non-Universal Router transactions
  showEnhancedTransactionInfo(tx, method, intent, walletName, decodedResult, extractedBytecodes);
  
  // Use EXACT decoder from Snaps repo
  console.log('[KaiSign] ===== CONTENT SCRIPT DECODE =====');
  console.log('[KaiSign] TX data:', tx.data?.slice(0, 20) + '...');
  console.log('[KaiSign] TX to:', tx.to);
  console.log('[KaiSign] Has decodeCalldata:', !!window.decodeCalldata);
  
  if (window.decodeCalldata && tx.data && tx.to) {
    try {
      // Use Sepolia chain ID for KaiSign contract
      const chainId = tx.to.toLowerCase() === '0x4dfea0c2b472a14cd052a8f9df9f19fa5cf03719' ? 11155111 : 1;
      console.log('[KaiSign] Using chain ID:', chainId);
      
      const decoded = await window.decodeCalldata(tx.data, tx.to, chainId);
      console.log('[KaiSign] Decode result:', decoded);
      
      // Try to extract nested bytecodes using enhanced decoder
      if (window.extractNestedBytecodes) {
        try {
          extractedBytecodes = await window.extractNestedBytecodes(tx.data, tx.to, chainId);
          console.log('[KaiSign] Extracted bytecodes:', extractedBytecodes.length);
        } catch (error) {
          console.log('[KaiSign] Bytecode extraction failed:', error.message);
        }
      }
      
      if (decoded.success) {
        intent = decoded.intent || 'Contract interaction';
        console.log('[KaiSign] ✅ SUCCESS - Intent:', intent);
        decodedResult = decoded;
      } else {
        intent = 'Contract interaction';
        console.log('[KaiSign] ❌ FAILED - Error:', decoded.error);
        decodedResult = decoded;
      }
      // Update popup with enhanced data
      showEnhancedTransactionInfo(tx, method, intent, walletName, decodedResult, extractedBytecodes);
    } catch (error) {
      console.log('[KaiSign] ❌ EXCEPTION:', error.message);
      intent = 'Contract interaction';
      decodedResult = { success: false, error: error.message };
      showEnhancedTransactionInfo(tx, method, intent, walletName, decodedResult, extractedBytecodes);
    }
  } else {
    console.log('[KaiSign] ❌ Missing decoder or transaction data');
    showEnhancedTransactionInfo(tx, method, intent, walletName, null, []);
  }
  
  // Save transaction with intent (store locally instead of using chrome.runtime)
  try {
    const transactionData = {
      id: Date.now().toString(),
      method: method,
      time: new Date().toISOString(),
      to: tx.to,
      value: tx.value,
      data: tx.data,
      intent: intent,
      decodedResult: decodedResult,
      extractedBytecodes: extractedBytecodes
    };
    
    // Save to localStorage instead
    const existingTxs = JSON.parse(localStorage.getItem('kaisign-transactions') || '[]');
    existingTxs.unshift(transactionData); // Add to beginning
    
    // Keep only last 50 transactions
    if (existingTxs.length > 50) {
      existingTxs.splice(50);
    }
    
    localStorage.setItem('kaisign-transactions', JSON.stringify(existingTxs));
    console.log('[KaiSign] ✅ Transaction saved locally');
  } catch (error) {
    console.log('[KaiSign] Save failed:', error.message);
  }
}

// Show enhanced transaction info with complete bytecode data
async function showEnhancedTransactionInfo(tx, method, intent, walletName = 'Wallet', decodedResult = null, extractedBytecodes = []) {
  // Remove old popup if exists
  const old = document.getElementById('kaisign-popup');
  if (old) old.remove();
  
  // Try to use advanced decoder for ANY transaction if available
  let realExtractedBytecodes = extractedBytecodes;
  let advancedDecodingResult = null;
  
  if (tx.data && tx.data.length > 10 && window.AdvancedTransactionDecoder) {
    try {
      console.log('[KaiSign] Using advanced decoder for transaction parsing');
      const decoder = new window.AdvancedTransactionDecoder();
      advancedDecodingResult = await decoder.decodeTransaction(tx, tx.to, 1);
      
      if (advancedDecodingResult && advancedDecodingResult.extractedBytecodes) {
        realExtractedBytecodes = advancedDecodingResult.extractedBytecodes;
        console.log('[KaiSign] Advanced decoding successful, found', realExtractedBytecodes.length, 'atomic calls');
      }
    } catch (error) {
      console.log('[KaiSign] Advanced decoder failed, using generic approach:', error.message);
      // Use generic approach for ANY bytecode that might contain nested calls
      if (tx.data && tx.data.length > 10) {
        try {
          realExtractedBytecodes = await parseGenericNestedBytecode(tx.data);
        } catch (genericError) {
          console.log('[KaiSign] Generic parsing also failed:', genericError.message);
        }
      }
    }
  }
  
  // Create enhanced popup
  const popup = document.createElement('div');
  popup.id = 'kaisign-popup';
  popup.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 450px;
    max-height: 80vh;
    overflow-y: auto;
    background: #2d3748;
    color: white;
    padding: 20px;
    border-radius: 12px;
    z-index: 999999;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    box-shadow: 0 8px 25px rgba(0,0,0,0.4);
    border: 2px solid #4a5568;
  `;
  
  const bytecodeSection = tx.data ? `
    <div style="margin: 12px 0; padding: 12px; background: #1a202c; border-radius: 6px; border-left: 4px solid #3182ce;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <strong style="color: #63b3ed;">📋 Complete Bytecode Data</strong>
        <button onclick="copyToClipboard('${tx.data}', this)" style="
          background: #3182ce;
          color: white;
          border: none;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 10px;
        ">📋 Copy All</button>
      </div>
      <div style="
        background: #000;
        padding: 8px;
        border-radius: 4px;
        word-break: break-all;
        max-height: 120px;
        overflow-y: auto;
        border: 1px solid #4a5568;
      ">
        ${tx.data}
      </div>
      <div style="margin-top: 8px; color: #a0aec0; font-size: 10px;">
        Length: ${tx.data.length} chars | Function: ${tx.data.slice(0, 10)}
      </div>
    </div>
  ` : '';
  
  const extractedSection = extractedBytecodes.length > 0 ? `
    <div style="margin: 12px 0; padding: 12px; background: #1a202c; border-radius: 6px; border-left: 4px solid #9f7aea;">
      <strong style="color: #b794f6;">🌳 Nested Bytecode Tree Structure (${extractedBytecodes.length})</strong>
      <div style="margin-top: 12px; font-family: monospace; font-size: 10px;">
        ${generateBytecodeTree(extractedBytecodes)}
      </div>
    </div>
  ` : '';
  
  const decodingSection = decodedResult ? `
    <div style="margin: 12px 0; padding: 12px; background: #1a202c; border-radius: 6px; border-left: 4px solid ${decodedResult.success ? '#38a169' : '#e53e3e'};">
      <strong style="color: ${decodedResult.success ? '#68d391' : '#fc8181'};">🔬 Decoding Result</strong>
      <div style="margin-top: 8px; font-size: 10px;">
        ${decodedResult.success ? 
          `<div style="color: #68d391;">✅ Success</div>
           <div>Function: ${decodedResult.functionName || 'Unknown'}</div>
           <div>Selector: ${decodedResult.selector}</div>` :
          `<div style="color: #fc8181;">❌ Failed: ${decodedResult.error}</div>`
        }
      </div>
    </div>
  ` : '';
  
  popup.innerHTML = `
    <div style="font-size: 11px; color: #ff6b6b; font-weight: bold; margin-bottom: 12px; text-align: center; border: 1px solid #ff6b6b; padding: 6px; border-radius: 6px;">
      ⚠️ DEMONSTRATION VERSION - USE AT YOUR OWN RISK
    </div>
    
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <div>
        <div style="font-size: 16px; font-weight: bold; color: #63b3ed;">
          🔍 KaiSign Transaction Analysis
        </div>
        <div style="font-size: 12px; color: #a0aec0;">
          ${walletName} | ${method}
        </div>
      </div>
      <button onclick="this.parentElement.parentElement.remove()" style="
        background: #e53e3e;
        color: white;
        border: none;
        padding: 6px 10px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
      ">✕ Close</button>
    </div>
    
    <div style="background: #4a5568; padding: 12px; border-radius: 8px; margin-bottom: 12px;">
      <div style="font-size: 18px; color: #68d391; margin-bottom: 8px; font-weight: bold;">
        🎯 ${intent || 'Loading intent...'}
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
        <div><strong style="color: #ffd700;">To:</strong> <span style="word-break: break-all;">${tx.to || 'N/A'}</span></div>
        <div><strong style="color: #ffd700;">Value:</strong> ${tx.value || '0x0'}</div>
      </div>
    </div>
    
    ${bytecodeSection}
    ${extractedSection}
    ${decodingSection}
    
    <div style="margin-top: 15px; padding-top: 12px; border-top: 1px solid #4a5568;">
      <button onclick="showTransactionHistory()" style="
        background: #3182ce;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
        margin-right: 10px;
      ">📋 View History</button>
      
      <button onclick="exportTransactionData('${tx.data}', '${JSON.stringify({decodedResult, extractedBytecodes}).replace(/'/g, "\\'")}')
      " style="
        background: #38a169;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
      ">💾 Export Data</button>
    </div>
  `;
  
  document.body.appendChild(popup);
  
  // Auto-remove after 30 seconds (longer for enhanced popup)
  setTimeout(() => {
    if (popup.parentNode) popup.remove();
  }, 30000);
}

// Generic bytecode parser - scans for any potential nested bytecodes
async function parseGenericNestedBytecode(data) {
  const extractedCalls = [];
  
  try {
    console.log('[KaiSign] Scanning for nested bytecodes in transaction data');
    
    // Remove function selector
    const payload = data.slice(10);
    const selector = data.slice(0, 10);
    
    // Add the main transaction as first call
    extractedCalls.push({
      bytecode: data,
      selector: selector,
      depth: 1,
      index: 0,
      target: 'Main Transaction',
      functionName: 'Transaction Root',
      type: 'root_call'
    });
    
    // Scan for potential function selectors in the payload
    // Function selectors are 4-byte patterns that appear at data boundaries
    const potentialSelectors = [];
    
    // Look for 4-byte patterns that could be function selectors
    for (let i = 0; i < payload.length - 8; i += 2) {
      const candidate = '0x' + payload.slice(i, i + 8);
      
      // Check if this looks like a function selector (not all zeros, reasonable hex)
      if (candidate !== '0x00000000' && candidate.match(/^0x[0-9a-fA-F]{8}$/)) {
        // Check if there's enough data after this to be a valid call
        const remainingData = payload.slice(i);
        if (remainingData.length >= 8) { // At least selector + some data
          potentialSelectors.push({
            position: i,
            selector: candidate,
            remainingData: '0x' + remainingData
          });
        }
      }
    }
    
    console.log('[KaiSign] Found', potentialSelectors.length, 'potential nested selectors');
    
    // Add potential nested calls (limit to avoid spam)
    let callIndex = 1;
    for (const potential of potentialSelectors.slice(0, 10)) {
      // Try to extract meaningful bytecode chunks
      let bytecodeLength = Math.min(potential.remainingData.length, 200); // Reasonable chunk size
      
      // Try to find natural boundaries (look for next potential selector)
      for (let j = 8; j < potential.remainingData.length - 8; j += 2) {
        const nextCandidate = potential.remainingData.slice(j, j + 8);
        if (nextCandidate.match(/^[0-9a-fA-F]{8}$/) && nextCandidate !== '00000000') {
          bytecodeLength = Math.min(j, 200);
          break;
        }
      }
      
      const extractedBytecode = potential.remainingData.slice(0, bytecodeLength);
      
      if (extractedBytecode.length >= 10) {
        extractedCalls.push({
          bytecode: extractedBytecode,
          selector: potential.selector,
          depth: 2,
          index: callIndex++,
          target: 'Detected Target',
          functionName: `Nested Call ${callIndex}`,
          type: 'detected_nested',
          position: potential.position
        });
      }
    }
    
  } catch (error) {
    console.log('[KaiSign] Generic parsing error:', error);
  }
  
  return extractedCalls;
}

// Helper function to generate bytecode tree structure
window.generateBytecodeTree = function(bytecodes) {
  if (!bytecodes || bytecodes.length === 0) return '<div style="color: #a0aec0;">No nested bytecodes found</div>';
  
  // Sort by depth and original order to maintain proper tree structure
  const sortedBytecodes = [...bytecodes].sort((a, b) => {
    const depthDiff = (a.depth || 1) - (b.depth || 1);
    if (depthDiff !== 0) return depthDiff;
    return (a.index || 0) - (b.index || 0);
  });
  
  function getTreeSymbol(depth, isLast, hasNextSibling) {
    const symbols = {
      1: '🔗',  // Root level
      2: '├─ 🔧', // First nested level
      3: '│  ├─ ⚙️', // Second nested level
      4: '│  │  ├─ 🔩', // Third nested level
      5: '│  │  │  ├─ 🧰' // Deep nested level
    };
    return symbols[Math.min(depth, 5)] || '│  '.repeat(depth - 1) + '├─ 🔹';
  }
  
  function getDepthColor(depth) {
    const colors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#f093fb'];
    return colors[(depth - 1) % colors.length];
  }
  
  function formatBytecode(bytecode, maxLength = 100) {
    if (!bytecode) return 'No bytecode';
    const truncated = bytecode.length > maxLength ? bytecode.slice(0, maxLength) + '...' : bytecode;
    return truncated;
  }
  
  return `
    <div style="background: #000; padding: 12px; border-radius: 6px; margin: 8px 0;">
      <div style="color: #68d391; font-size: 11px; margin-bottom: 8px; font-weight: bold;">
        📊 TRANSACTION EXECUTION TREE (${sortedBytecodes.length} atomic calls)
      </div>
      ${sortedBytecodes.map((bytecode, i) => {
        const depth = bytecode.depth || 1;
        const color = getDepthColor(depth);
        const treeSymbol = getTreeSymbol(depth);
        const isLast = i === sortedBytecodes.length - 1;
        
        return `
          <div style="margin: 4px 0; padding: 6px; background: #1a202c; border-radius: 4px; border-left: 4px solid ${color};">
            <!-- Tree Structure Line -->
            <div style="font-family: 'Courier New', monospace; color: ${color}; font-size: 11px; margin-bottom: 4px;">
              ${'  '.repeat(Math.max(0, depth - 1))}${treeSymbol} <span style="color: #ffd700; font-weight: bold;">${bytecode.selector || bytecode.functionName || `Call #${i + 1}`}</span>
              <span style="color: #a0aec0; font-size: 9px; margin-left: 8px;">[Level ${depth}]</span>
            </div>
            
            <!-- Function Details with Intent -->
            <div style="margin-left: ${depth * 16}px; font-size: 10px; color: #a0aec0; margin-bottom: 4px;">
              ${bytecode.target ? `<span style="color: #63b3ed;">📍 To: ${bytecode.target.slice(0, 8)}...${bytecode.target.slice(-6)}</span>` : ''}
              ${bytecode.functionName ? `<span style="color: #68d391; margin-left: 8px;">🔧 ${bytecode.functionName}</span>` : ''}
              ${bytecode.intent ? `<br><span style="color: #ffd700; font-weight: bold; margin-left: ${depth * 16}px;">💡 ${bytecode.intent}</span>` : ''}
              ${bytecode.category ? `<span style="color: #9f7aea; margin-left: 8px;">📂 ${bytecode.category}</span>` : ''}
              ${bytecode.value ? `<span style="color: #ffd700; margin-left: 8px;">💰 ${bytecode.value}</span>` : ''}
            </div>
            
            <!-- Bytecode Data with Copy Button -->
            <div style="margin-left: ${depth * 16}px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="color: #9f7aea; font-size: 9px; font-weight: bold;">RAW BYTECODE:</span>
                <button onclick="copyToClipboard('${(bytecode.bytecode || '').replace(/'/g, "\\'")}', this)" style="
                  background: #38a169;
                  color: white;
                  border: none;
                  padding: 2px 6px;
                  border-radius: 3px;
                  cursor: pointer;
                  font-size: 8px;
                ">📋 Copy</button>
              </div>
              <div style="
                background: #000;
                padding: 6px;
                border-radius: 3px;
                word-break: break-all;
                max-height: 60px;
                overflow-y: auto;
                font-size: 8px;
                color: #e2e8f0;
                border-left: 2px solid ${color};
              ">
                ${formatBytecode(bytecode.bytecode)}
              </div>
            </div>
            
            <!-- Parameter Information -->
            ${bytecode.params ? `
              <div style="margin-left: ${depth * 16}px; margin-top: 4px;">
                <span style="color: #f093fb; font-size: 9px;">📊 PARAMS: ${typeof bytecode.params === 'object' ? JSON.stringify(bytecode.params).slice(0, 80) + '...' : bytecode.params}</span>
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
      
      <!-- Tree Footer -->
      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #4a5568; color: #68d391; font-size: 9px; text-align: center;">
        🌳 Complete nested bytecode separation achieved - Ready for clear signing metadata replacement
      </div>
    </div>
  `;
};

// Helper functions for enhanced popup
window.copyToClipboard = function(text, button) {
  navigator.clipboard.writeText(text).then(() => {
    const originalText = button.textContent;
    button.textContent = '✅ Copied!';
    button.style.background = '#38a169';
    setTimeout(() => {
      button.textContent = originalText;
      button.style.background = '#3182ce';
    }, 2000);
  }).catch(err => {
    console.error('[KaiSign] Copy failed:', err);
    // Fallback: create temporary textarea
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    
    const originalText = button.textContent;
    button.textContent = '✅ Copied!';
    button.style.background = '#38a169';
    setTimeout(() => {
      button.textContent = originalText;
      button.style.background = '#3182ce';
    }, 2000);
  });
};

window.showTransactionHistory = function() {
  const transactions = JSON.parse(localStorage.getItem('kaisign-transactions') || '[]');
  
  const historyPopup = document.createElement('div');
  historyPopup.id = 'kaisign-history';
  historyPopup.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 80vw;
    max-width: 800px;
    max-height: 80vh;
    overflow-y: auto;
    background: #2d3748;
    color: white;
    padding: 20px;
    border-radius: 12px;
    z-index: 1000000;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    box-shadow: 0 8px 25px rgba(0,0,0,0.6);
    border: 2px solid #4a5568;
  `;
  
  historyPopup.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 style="margin: 0; color: #63b3ed;">📋 Transaction History (${transactions.length})</h2>
      <button onclick="this.parentElement.parentElement.remove()" style="
        background: #e53e3e;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 6px;
        cursor: pointer;
      ">✕ Close</button>
    </div>
    
    ${transactions.length === 0 ? 
      '<div style="text-align: center; color: #a0aec0; padding: 40px;">No transactions recorded yet</div>' :
      transactions.map((tx, i) => `
        <div style="margin-bottom: 15px; padding: 15px; background: #1a202c; border-radius: 8px; border: 1px solid #4a5568;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <strong style="color: #68d391;">#${i + 1} ${tx.intent}</strong>
            <span style="color: #a0aec0; font-size: 10px;">${new Date(tx.time).toLocaleString()}</span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; font-size: 10px;">
            <div><strong>Method:</strong> ${tx.method}</div>
            <div><strong>To:</strong> ${tx.to?.slice(0, 20)}...</div>
          </div>
          ${tx.data ? `
            <div style="margin-top: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="color: #ffd700; font-size: 10px;">Bytecode Data:</span>
                <button onclick="copyToClipboard('${tx.data}', this)" style="
                  background: #3182ce;
                  color: white;
                  border: none;
                  padding: 2px 6px;
                  border-radius: 3px;
                  cursor: pointer;
                  font-size: 9px;
                ">Copy</button>
              </div>
              <div style="background: #000; padding: 6px; border-radius: 4px; word-break: break-all; max-height: 60px; overflow-y: auto; font-size: 9px;">
                ${tx.data}
              </div>
            </div>
          ` : ''}
        </div>
      `).join('')
    }
    
    <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #4a5568; text-align: center;">
      <button onclick="localStorage.removeItem('kaisign-transactions'); this.parentElement.parentElement.remove(); alert('Transaction history cleared!');" style="
        background: #e53e3e;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
      ">🗑️ Clear History</button>
    </div>
  `;
  
  document.body.appendChild(historyPopup);
};

window.exportTransactionData = function(calldata, analyzedData) {
  try {
    const data = {
      timestamp: new Date().toISOString(),
      calldata: calldata,
      analyzedData: JSON.parse(analyzedData)
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kaisign-transaction-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    alert('✅ Transaction data exported successfully!');
  } catch (error) {
    console.error('[KaiSign] Export failed:', error);
    alert('❌ Export failed: ' + error.message);
  }
};

// Expose functions globally for testing
window.parseUniversalRouterTransaction = parseUniversalRouterTransaction;
window.getIntentAndShow = getIntentAndShow;

// Start wallet detection
waitForWallets();

console.log('[KaiSign] Content script ready - Multi-wallet support enabled');
console.log('[KaiSign] Enhanced features: Complete bytecode display, copy functionality, transaction history');
console.log('[KaiSign] Universal Router parser available globally');