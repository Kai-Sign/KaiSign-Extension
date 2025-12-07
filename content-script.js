
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

// Token lookups now use registryLoader (loaded from local-metadata/registry/tokens.json)
// See registry-loader.js for implementation

/**
 * Parse Universal Router transaction using ethers.js ABI decoding
 * Following the proven Snaps ERC7730 approach for proper token resolution
 */
async function parseUniversalRouterTransaction(txData, transactionValue = null) {
  try {
    
    // Use simple ABI decoder instead of ethers.js
    const decoded = SimpleABIDecoder.decodeExecuteFunction(txData);
    
    if (!decoded) {
      console.error('[UR-Parser-Ethers] Failed to decode execute function');
      return [];
    }
    
    
    // Parse commands bytes and inputs array
    const commandsData = decoded.commands.slice(2); // Remove 0x prefix
    const commandsLength = commandsData.length;
    const inputsArrayLength = decoded.inputs.length;
    
    
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
      
      
      const commandIndex = i / 2;
      if (commandIndex < inputsArrayLength) {
        // Get the properly decoded input data for this command
        try {
          const inputData = decoded.inputs[commandIndex];
          
          
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
    
    return extractedCalls;
    
  } catch (error) {
    console.error('[UR-Parser] ❌ Error parsing Universal Router:', error);
    return [];
  }
}

/**
 * Parse Safe MultiSend transaction data
 * Format: multiSend(bytes transactions) where transactions contains multiple encoded operations
 */
async function parseSafeMultiSendTransaction(txData) {
  try {

    if (!txData || !txData.startsWith('0x8d80ff0a')) {
      console.log('[KaiSign] Not a multiSend transaction');
      return null;
    }
    
    // Remove multiSend selector (0x8d80ff0a)
    const payload = txData.slice(10);
    
    // Parse ABI-encoded bytes parameter
    // First 32 bytes (64 hex chars) = offset to bytes data
    const offset = parseInt(payload.slice(0, 64), 16) * 2;
    
    // Next 32 bytes = length of bytes data
    const length = parseInt(payload.slice(offset, offset + 64), 16) * 2;
    
    // Extract the transactions bytes
    const transactionsData = payload.slice(offset + 64, offset + 64 + length);
    
    console.log('[KaiSign] MultiSend transactions data length:', transactionsData.length);
    
    // Parse individual transactions
    const operations = [];
    let pos = 0;
    
    while (pos < transactionsData.length) {
      if (pos + 40 > transactionsData.length) break; // Need at least operation + to + value
      
      // Each transaction: operation(1) + to(20) + value(32) + dataLength(32) + data(dataLength)
      const operation = parseInt(transactionsData.slice(pos, pos + 2), 16);
      const to = '0x' + transactionsData.slice(pos + 2, pos + 42);
      const value = '0x' + transactionsData.slice(pos + 42, pos + 106);
      const dataLength = parseInt(transactionsData.slice(pos + 106, pos + 170), 16) * 2;
      
      let data = '0x';
      if (dataLength > 0 && pos + 170 + dataLength <= transactionsData.length) {
        data = '0x' + transactionsData.slice(pos + 170, pos + 170 + dataLength);
      }
      
      operations.push({
        operation: operation,
        to: to,
        value: value,
        data: data,
        selector: data.length >= 10 ? data.slice(0, 10) : null
      });
      
      console.log(`[KaiSign] Extracted operation: ${operation === 0 ? 'CALL' : 'DELEGATECALL'} to ${to} with data ${data.slice(0, 20)}...`);
      
      // Move to next transaction
      pos += 170 + dataLength;
    }
    
    console.log(`[KaiSign] Parsed ${operations.length} operations from MultiSend`);

    // Analyze operations to create intent (await registry loading)
    const intents = [];
    for (const op of operations) {
      if (op.selector) {
        const intent = await getSafeOperationIntent(op);
        if (intent) intents.push(intent);
      }
    }

    const mainIntent = intents.length > 0 ? intents.join(' + ') : `Safe Batch (${operations.length} operations)`;
    
    return {
      operations: operations,
      intent: mainIntent,
      type: 'safe_multisend'
    };
    
  } catch (error) {
    console.error('[KaiSign] Safe MultiSend parsing error:', error);
    return null;
  }
}

/**
 * Get intent for individual Safe operation
 * Uses registry loader for selector lookups (no hardcoded values)
 * Now async to ensure registry is loaded
 */
async function getSafeOperationIntent(operation) {
  if (!operation.selector || operation.selector === '0x') return null;

  // Ensure registry is loaded before lookup
  if (window.registryLoader && !window.registryLoader.loaded) {
    console.log(`[KaiSign] Waiting for registry to load...`);
    await window.registryLoader.ensureLoaded();
  }

  // Debug logging
  console.log(`[KaiSign] getSafeOperationIntent for selector: ${operation.selector}`);
  console.log(`[KaiSign] Registry exists: ${!!window.registryLoader}`);
  console.log(`[KaiSign] Registry loaded: ${window.registryLoader?.loaded}`);
  console.log(`[KaiSign] Selector registry size: ${window.registryLoader?.selectorRegistry?.size}`);

  // Use registry loader for selector lookup
  const selectorInfo = window.registryLoader?.getSelectorInfo(operation.selector);

  console.log(`[KaiSign] Selector lookup result:`, selectorInfo);

  if (selectorInfo) {
    const intent = selectorInfo.intent;
    console.log(`[KaiSign] Found intent: ${intent}, category: ${selectorInfo.category}`);

    // Try to identify token for approval/transfer operations
    if (selectorInfo.category === 'approval' || selectorInfo.category === 'transfer') {
      const token = getTokenSymbol(operation.to);
      console.log(`[KaiSign] Token lookup for ${operation.to}: ${token}`);
      return `${intent} ${token}`;
    }
    return intent;
  }

  console.warn(`[KaiSign] No selector info found for ${operation.selector}, falling back to Contract Call`);
  return 'Contract Call';
}

/**
 * Get Universal Router command info from command byte
 * Uses registry loader for command lookups (no hardcoded values)
 */
function getUniversalRouterCommandInfo(commandByte) {
  // Use registry loader for command lookup
  if (window.registryLoader) {
    return window.registryLoader.getCommandInfo(commandByte);
  }

  // Fallback for when registry isn't loaded yet
  return {
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
 * Enhanced token address resolution using registry loader
 * No hardcoded values - uses local-metadata/registry/tokens.json
 */
function resolveTokenSymbol(address) {
  if (!address) return null;

  // Use registry loader for token lookup
  if (window.registryLoader) {
    const info = window.registryLoader.getTokenInfo(address);
    return info?.symbol || null;
  }

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
              } else {
              }
            }
          }
        }
        
        // Enhanced token search in raw hex data using registry loader
        const knownTokenAddresses = window.registryLoader?.tokenRegistry?.tokens
          ? Object.keys(window.registryLoader.tokenRegistry.tokens)
          : [];
        const foundTokens = [];

        for (const tokenAddr of knownTokenAddresses) {
          const searchAddr = tokenAddr.slice(2).toLowerCase(); // Remove 0x
          if (data.toLowerCase().includes(searchAddr)) {
            foundTokens.push(tokenAddr); // Don't add 0x prefix since tokenAddr already has it
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
              } else {
              }
            }
          }
        }
        
        // Also search for known tokens in the hex data for cleanup commands (using registry)
        const cleanupTokenAddresses = window.registryLoader?.tokenRegistry?.tokens
          ? Object.keys(window.registryLoader.tokenRegistry.tokens)
          : [];
        const foundCleanupTokens = [];
        
        for (const tokenAddr of cleanupTokenAddresses) {
          const searchAddr = tokenAddr.slice(2).toLowerCase(); // Remove 0x
          if (data.toLowerCase().includes(searchAddr)) {
            foundCleanupTokens.push(tokenAddr);
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
    
    // Direct search for known token addresses in the hex data (using registry)
    const registryTokens = window.registryLoader?.tokenRegistry?.tokens || {};
    const foundTokens = [];
    const lowerData = data.toLowerCase();

    for (const [fullAddr, tokenInfo] of Object.entries(registryTokens)) {
      const tokenAddr = fullAddr.slice(2).toLowerCase(); // Remove 0x prefix
      if (lowerData.includes(tokenAddr)) {
        foundTokens.push({ address: fullAddr, symbol: tokenInfo.symbol });
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
    
    
    return addresses.length > 0 ? { 
      addresses, 
      type: 'generic',
      dataLength: data.length / 2 
    } : null;
    
  } catch (error) {
    return null;
  }
}

// Token metadata now loaded from registry (see registry-loader.js)
// Uses local-metadata/registry/tokens.json

/**
 * Get token symbol from address
 * Uses registry loader for lookups (no hardcoded values)
 */
function getTokenSymbol(address) {
  if (!address) return 'TOKEN';

  // Use registry loader for token lookup
  if (window.registryLoader) {
    return window.registryLoader.getTokenSymbol(address);
  }

  // Fallback if registry not loaded
  return address.slice(0, 6) + '...';
}

/**
 * Format command description with parsed parameters and token names
 * Uses registry loader for intent templates (no hardcoded strings)
 */
function formatCommandDescription(commandInfo, parsedParams, transactionValue) {
  if (!parsedParams) {
    // For WRAP_ETH and UNWRAP_WETH, use transaction value
    if (commandInfo.action === 'wrap' && transactionValue) {
      const params = { amount: formatEther(transactionValue), category: 'wrap' };
      return window.registryLoader?.formatIntent('wrap_eth', params) ||
             `Wrap ${formatEther(transactionValue)} ETH to WETH`;
    }
    if (commandInfo.action === 'unwrap') {
      return window.registryLoader?.formatIntent('unwrap_weth', { category: 'unwrap' }) ||
             'Unwrap WETH to ETH';
    }
    return commandInfo.intent;
  }

  switch (parsedParams.type) {
    case 'transfer':
      const fromToken = getTokenSymbol(parsedParams.token);
      const recipient = parsedParams.recipient ? parsedParams.recipient.slice(0, 6) + '...' : 'recipient';
      return window.registryLoader?.formatIntent('transfer_to_recipient', { token: fromToken, recipient, category: 'transfer' }) ||
             `Transfer ${fromToken} to ${recipient}`;

    case 'swap':
      const token0 = getTokenSymbol(parsedParams.token0);
      const token1 = getTokenSymbol(parsedParams.token1);
      return window.registryLoader?.formatIntent('swap_with_tokens', { fromToken: token0, toToken: token1, category: 'swap' }) ||
             `Swap ${token0} to ${token1}`;

    case 'marketplace':
      return window.registryLoader?.formatIntent('marketplace_trade', { marketplace: parsedParams.marketplace, category: 'marketplace' }) ||
             `${parsedParams.marketplace} Trade`;

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
  
  
  // Look for patterns in the calls
  const hasWrapEth = calls.some(call => call.category === 'wrap');
  const hasUnwrapWeth = calls.some(call => call.category === 'unwrap');
  const hasSwap = calls.some(call => call.category === 'swap');
  const hasMarketplace = calls.some(call => call.category === 'marketplace');
  const transferCalls = calls.filter(call => call.category === 'transfer' || call.category === 'cleanup');
  
  
  // Find all unique token addresses in the transaction
  const allTokens = new Set();
  const foundTokenSymbols = new Set();
  
  calls.forEach((call, index) => {
    if (call.parsedParams) {
      
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
    const rawTx = calls[0]?.bytecode || '';
    
    // Check for USDC specifically in the transaction data
    if (rawTx.toLowerCase().includes('a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')) {
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
    
    // Search for known token addresses in the raw transaction (using registry)
    const searchTokens = window.registryLoader?.tokenRegistry?.tokens || {};

    for (const [fullAddr, tokenInfo] of Object.entries(searchTokens)) {
      const tokenAddr = fullAddr.slice(2).toLowerCase(); // Remove 0x prefix
      if (rawTx.toLowerCase().includes(tokenAddr)) {
        const tokenSymbol = tokenInfo.symbol;
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
 * Get function name from selector
 * Uses registry loader for lookups (no hardcoded values)
 */
function getFunctionNameFromSelector(selector) {
  // Use registry loader for selector lookup
  if (window.registryLoader) {
    return window.registryLoader.getFunctionName(selector);
  }

  return 'unknown';
}

// Wallet detection and hooking
const hookedWallets = new Set();

// Check if we're running on Safe
function isSafeApp() {
  return window.location.hostname === 'app.safe.global' || 
         window.location.hostname.includes('safe.global');
}

// Safe-specific transaction detection
function detectSafeTransactions() {
  if (!isSafeApp()) return;
  
  // Starting Safe transaction detection
  
  // STRATEGY 1: Advanced DOM Observer for Safe UI
  setupAdvancedSafeObserver();
  
  // STRATEGY 2: Polling for Safe transaction data in DOM
  setupSafeTransactionPolling();
  
  // STRATEGY 3: Hook Safe UI button clicks
  hookSafeSignatureButtons();
  
  // STRATEGY 4: Monitor Safe transaction confirmation dialogs
  monitorSafeConfirmationDialogs();
}

function setupAdvancedSafeObserver() {
  try {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        // Check added nodes
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            checkSafeTransactionElements(node);
          }
        });
        
        // Check attribute changes for Safe transaction updates
        if (mutation.type === 'attributes' && mutation.target) {
          const target = mutation.target;
          if (target.textContent && (
            target.textContent.includes('0x8d80ff0a') || // multiSend selector
            target.textContent.includes('0x9641d764') || // MultiSendCallOnly
            target.textContent.includes('Primary type: SafeTx') ||
            target.textContent.includes('Operation:')
          )) {
            extractSafeTransactionData();
          }
        }
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-testid', 'aria-label'],
      characterData: true
    });
    
  } catch (error) {
    console.error('[KaiSign-Safe] Error setting up advanced Safe observer:', error);
  }
}

function checkSafeTransactionElements(element) {
  // Check for Safe transaction interface elements
  const safeSelectors = [
    '[data-testid*="transaction"]',
    '[data-testid*="sign"]', 
    '[class*="transaction"]',
    '[class*="Transaction"]',
    '[class*="signature"]',
    '[class*="Signature"]',
    '[aria-label*="transaction"]',
    '[aria-label*="sign"]',
    'pre', 'code',
    '[class*="data"]',
    '[class*="Data"]'
  ];
  
  safeSelectors.forEach(selector => {
    const txElements = element.querySelectorAll ? element.querySelectorAll(selector) : [];
    if (txElements.length > 0) {
      
      txElements.forEach(txElement => {
        const text = txElement.textContent || txElement.innerText || '';
        if (text.includes('0x') && text.length > 20) {
          extractSafeTransactionFromElement(txElement);
        }
      });
    }
  });
}

function setupSafeTransactionPolling() {
  
  let lastProcessedData = '';
  
  const pollInterval = setInterval(() => {
    // Look for transaction data in the current DOM
    const allText = document.body.innerText || '';
    
    // Check for your specific transaction pattern
    if (allText.includes('Primary type: SafeTx') && 
        allText.includes('To: 0x9641d') && 
        allText.includes('Data: 0x8d80ff0a')) {
      
      const currentData = allText.slice(allText.indexOf('Primary type: SafeTx'), allText.indexOf('Primary type: SafeTx') + 500);
      
      if (currentData !== lastProcessedData) {
        console.log('[KaiSign-Safe] Transaction found in DOM');
        
        lastProcessedData = currentData;
        
        // Extract and process the Safe transaction
        extractSafeTransactionFromDomText(allText);
        
        // Clear interval once found
        clearInterval(pollInterval);
      }
    }
  }, 500);
  
  // Clear polling after 30 seconds to avoid infinite polling
  setTimeout(() => {
    clearInterval(pollInterval);
  }, 30000);
}

function extractSafeTransactionFromDomText(domText) {
  // Extract Safe transaction from DOM text
  
  try {
    // Parse the DOM text for Safe transaction details
    const toMatch = domText.match(/To:\s*(0x[a-fA-F0-9]{40})/);
    const dataMatch = domText.match(/Data:\s*(0x[a-fA-F0-9]+)/);
    const operationMatch = domText.match(/Operation:\s*(\d+)/);
    const nonceMatch = domText.match(/Nonce:\s*(\d+)/);
    
    if (toMatch && dataMatch) {
      const to = toMatch[1];
      const data = dataMatch[1];
      const operation = operationMatch ? parseInt(operationMatch[1]) : 0;
      const nonce = nonceMatch ? parseInt(nonceMatch[1]) : 0;
      
      
      // Create Safe transaction object
      const safeTx = {
        to,
        value: '0',
        data,
        operation,
        nonce
      };
      
      // Create typed data structure
      const typedData = {
        types: {
          SafeTx: [
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'data', type: 'bytes' },
            { name: 'operation', type: 'uint8' },
            { name: 'nonce', type: 'uint256' }
          ]
        },
        domain: {
          name: 'Safe',
          verifyingContract: '0xA1023ea549dAA39a108bC26d63bd8daA68E4a226' // Your Safe address
        },
        message: safeTx
      };
      
      console.log('[KaiSign-Safe] Triggering Safe signature request');
      handleSafeSignatureRequest(typedData, 'Safe User', 'Safe Wallet DOM');
      
      // Also trigger regular transaction processing
      getIntentAndShow(safeTx, 'Safe Transaction (DOM)', 'Safe Wallet', { 
        isSafeSignature: true,
        extractedFromDom: true 
      });
    }
  } catch (error) {
    console.error('[KaiSign-Safe] Error extracting Safe transaction from DOM:', error);
  }
}

function hookSafeSignatureButtons() {
  
  // Look for and hook Safe signature buttons
  const buttonSelectors = [
    'button[data-testid*="sign"]',
    'button[aria-label*="sign"]', 
    'button:contains("Sign")',
    'button:contains("Confirm")',
    'button:contains("Execute")',
    '[role="button"]:contains("Sign")'
  ];
  
  const hookButton = (button) => {
    if (button._kaisignHooked) return;
    
    
    const originalClick = button.onclick;
    button.onclick = function(event) {
      
      // Extract transaction data before signature
      setTimeout(() => {
        extractSafeTransactionData();
        extractSafeTransactionFromDomText(document.body.innerText);
      }, 100);
      
      if (originalClick) {
        return originalClick.apply(this, arguments);
      }
    };
    
    button.addEventListener('click', () => {
      setTimeout(() => {
        extractSafeTransactionData();
      }, 200);
    });
    
    button._kaisignHooked = true;
  };
  
  // Hook existing buttons
  buttonSelectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(hookButton);
    } catch (e) {
      // Selector might not be valid, skip
    }
  });
  
  // Hook new buttons as they appear
  const buttonObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'BUTTON' && 
              (node.textContent.includes('Sign') || 
               node.textContent.includes('Confirm') ||
               node.getAttribute('data-testid')?.includes('sign'))) {
            hookButton(node);
          }
          
          // Check child buttons
          node.querySelectorAll && node.querySelectorAll('button').forEach(button => {
            if (button.textContent.includes('Sign') || 
                button.textContent.includes('Confirm') ||
                button.getAttribute('data-testid')?.includes('sign')) {
              hookButton(button);
            }
          });
        }
      });
    });
  });
  
  buttonObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function monitorSafeConfirmationDialogs() {
  
  const dialogObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Look for dialog/modal elements
          if (node.matches && (
            node.matches('[role="dialog"]') ||
            node.matches('[class*="modal"]') ||
            node.matches('[class*="Modal"]') ||
            node.matches('[class*="dialog"]') ||
            node.matches('[class*="Dialog"]'))) {
            
            
            // Check if this dialog contains transaction data
            const dialogText = node.innerText || '';
            if (dialogText.includes('Transaction') || 
                dialogText.includes('Sign') ||
                dialogText.includes('0x')) {
              
              setTimeout(() => {
                extractSafeTransactionFromElement(node);
                extractSafeTransactionFromDomText(dialogText);
              }, 500);
            }
          }
        }
      });
    });
  });
  
  dialogObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function extractSafeTransactionFromElement(element) {
  try {
    const text = element.textContent || element.innerText || '';
    
    // Look for specific patterns in the element
    if (text.includes('0x8d80ff0a') || text.includes('multiSend') || text.includes('Primary type: SafeTx')) {
      extractSafeTransactionFromDomText(text);
    }
    
    // Also check for data attributes
    const dataAttrs = ['data-transaction', 'data-tx', 'data-safe-tx'];
    dataAttrs.forEach(attr => {
      const attrValue = element.getAttribute && element.getAttribute(attr);
      if (attrValue && attrValue.includes('0x')) {
        try {
          const txData = JSON.parse(attrValue);
          getIntentAndShow(txData, 'Safe Transaction (Attribute)', 'Safe Wallet', { 
            isSafeSignature: true,
            extractedFromAttribute: true 
          });
        } catch (e) {
        }
      }
    });
  } catch (error) {
  }
}

// Extract Safe transaction data from the UI
function extractSafeTransactionData() {
  try {
    // Look for transaction data in the Safe UI
    const dataElements = document.querySelectorAll('[class*="data"], [class*="Data"], pre, code');
    
    for (const element of dataElements) {
      const text = element.textContent || element.innerText;
      if (text && text.includes('0x') && text.length > 50) {
        console.log('[KaiSign] Safe transaction data detected');
        console.log('[KaiSign] DOM text sample:', text.slice(0, 200) + '...');
        
        // Try to extract transaction components
        const lines = text.split('\n');
        let toAddress = null;
        let data = null;
        let value = null;
        
        for (const line of lines) {
          const trimmed = line.trim();
          console.log('[KaiSign] Checking line:', trimmed.slice(0, 100));
          
          if (trimmed.toLowerCase().includes('to') && trimmed.includes('0x')) {
            const match = trimmed.match(/0x[a-fA-F0-9]{40}/);
            if (match) {
              toAddress = match[0];
              console.log('[KaiSign] Found TO address:', toAddress);
            }
          }
          if (trimmed.toLowerCase().includes('data') && trimmed.includes('0x')) {
            const match = trimmed.match(/0x[a-fA-F0-9]+/);
            if (match && match[0].length > 10) {
              data = match[0];
              console.log('[KaiSign] Found DATA:', data.slice(0, 50) + '...');
            }
          }
          if (trimmed.toLowerCase().includes('value')) {
            const match = trimmed.match(/0x[a-fA-F0-9]+/);
            if (match) {
              value = match[0];
              console.log('[KaiSign] Found VALUE:', value);
            }
          }
        }
        
        if (toAddress && data) {
          console.log('[KaiSign] ✅ Safe transaction extracted - triggering popup');
          
          // Create transaction object and analyze
          const tx = {
            to: toAddress,
            data: data,
            value: value || '0x0'
          };
          
          getIntentAndShow(tx, 'Safe Transaction', 'Safe Wallet', { 
            isSafeSignature: true,
            extractedFromDOM: true 
          });
          break;
        } else {
          console.log('[KaiSign] ❌ Failed to extract To/Data from Safe transaction');
        }
      }
    }
  } catch (error) {
    console.log('[KaiSign] Safe transaction extraction failed:', error.message);
  }
}

// Wait for any wallet
function waitForWallets() {
  // Check for different wallet providers
  detectAndHookWallets();
  
  // Also check for Safe-specific transactions
  detectSafeTransactions();
  
  // Keep checking for new wallets (some load late)
  setTimeout(waitForWallets, 500);
}

// Detect and hook various wallets
function detectAndHookWallets() {
  // 1. MetaMask (window.ethereum)
  if (window.ethereum && window.ethereum.request && !hookedWallets.has('ethereum')) {
    hookWalletProvider(window.ethereum, 'ethereum');
    hookedWallets.add('ethereum');
  }
  
  // 2. Rabby (window.rabby)
  if (window.rabby && window.rabby.request && !hookedWallets.has('rabby')) {
    hookWalletProvider(window.rabby, 'rabby');
    hookedWallets.add('rabby');
  }
  
  // 3. Coinbase Wallet (window.coinbaseWalletExtension)
  if (window.coinbaseWalletExtension && window.coinbaseWalletExtension.request && !hookedWallets.has('coinbase')) {
    hookWalletProvider(window.coinbaseWalletExtension, 'coinbase');
    hookedWallets.add('coinbase');
  }
  
  // 4. Trust Wallet (window.trustWallet)
  if (window.trustWallet && window.trustWallet.request && !hookedWallets.has('trust')) {
    hookWalletProvider(window.trustWallet, 'trust');
    hookedWallets.add('trust');
  }
  
  // 5. Phantom (window.phantom?.ethereum)
  if (window.phantom?.ethereum && window.phantom.ethereum.request && !hookedWallets.has('phantom')) {
    hookWalletProvider(window.phantom.ethereum, 'phantom');
    hookedWallets.add('phantom');
  }
  
  // 6. Check for multiple providers (some wallets inject arrays)
  if (window.ethereum?.providers && Array.isArray(window.ethereum.providers)) {
    window.ethereum.providers.forEach((provider, index) => {
      const walletKey = `provider-${index}`;
      if (provider.request && !hookedWallets.has(walletKey)) {
        const walletName = getWalletName(provider);
        hookWalletProvider(provider, walletKey, walletName);
        hookedWallets.add(walletKey);
      }
    });
  }
  
  // 7. CRITICAL: Safe Wallet Detection and Hooking
  detectAndHookSafeWallet();
  
  // 8. Hook Safe SDK if available
  hookSafeSDK();
  
  // 9. Hook Safe API calls
  hookSafeApiCalls();
}

/**
 * CRITICAL SAFE WALLET DETECTION AND HOOKING
 * This is the missing piece that prevents Safe popup from appearing
 */

function detectAndHookSafeWallet() {
  // Detecting Safe wallet providers
  
  // Strategy 1: Hook window.safe (Safe Wallet Web Extension)
  if (window.safe && !hookedWallets.has('safe-extension')) {
    if (window.safe.request) {
      hookWalletProvider(window.safe, 'safe-extension', 'Safe Web Extension');
      hookedWallets.add('safe-extension');
    }
  }
  
  // Strategy 2: Hook window.SafeProvider (Safe SDK)
  if (window.SafeProvider && !hookedWallets.has('safe-provider')) {
    if (window.SafeProvider.request) {
      hookWalletProvider(window.SafeProvider, 'safe-provider', 'Safe Provider');
      hookedWallets.add('safe-provider');
    }
  }
  
  // Strategy 3: Look for Safe in ethereum providers array
  if (window.ethereum?.providers) {
    window.ethereum.providers.forEach((provider, index) => {
      if (provider.isSafe || provider._metamask?.isSafe || (provider.constructor && provider.constructor.name === 'SafeProvider')) {
        const walletKey = `safe-provider-${index}`;
        if (!hookedWallets.has(walletKey)) {
          hookWalletProvider(provider, walletKey, 'Safe Wallet');
          hookedWallets.add(walletKey);
        }
      }
    });
  }
  
  // Strategy 4: Hook window object for Safe-specific globals
  const safeGlobals = ['__SAFE__', 'safeConnector', 'SafeAppsSDK'];
  safeGlobals.forEach(globalName => {
    if (window[globalName] && typeof window[globalName] === 'object') {
      hookSafeGlobal(window[globalName], globalName);
    }
  });
  
  // Strategy 5: Hook Safe-specific events
  hookSafeEvents();
}

function hookSafeGlobal(safeObj, globalName) {
  try {
    if (safeObj.request && typeof safeObj.request === 'function') {
      const walletKey = `safe-global-${globalName}`;
      if (!hookedWallets.has(walletKey)) {
        hookWalletProvider(safeObj, walletKey, `Safe ${globalName}`);
        hookedWallets.add(walletKey);
      }
    }
  } catch (error) {
  }
}

function hookSafeEvents() {
  // Setting up Safe event listeners
  
  // Listen for Safe-specific custom events
  const safeEvents = [
    'safe_signTypedData',
    'safe_signMessage', 
    'safe_signTransaction',
    'safe_sendTransaction',
    'safe_transactionProposal',
    'safe_signatureRequest'
  ];
  
  safeEvents.forEach(eventName => {
    document.addEventListener(eventName, (event) => {
      handleSafeCustomEvent(eventName, event.detail);
    });
  });
  
  // Listen for SafeAppsSDK events
  if (window.addEventListener) {
    window.addEventListener('message', (event) => {
      if (event.origin === window.location.origin && event.data) {
        const data = event.data;
        
        // Check for Safe Apps SDK messages
        if (data.messageId && data.method) {
          
          if (data.method === 'signTypedMessage' || data.method === 'signMessage') {
            handleSafeSdkSignRequest(data);
          }
        }
      }
    });
  }
}

function handleSafeCustomEvent(eventName, eventData) {
  
  if (eventData && eventData.params) {
    // Extract signature data from Safe custom event
    const params = eventData.params;
    
    if (eventName.includes('signTypedData') && params.typedData) {
      handleSafeSignatureRequest(params.typedData, params.address || 'Unknown', 'Safe Wallet');
    } else if (eventName.includes('Transaction') && params.transaction) {
      // Handle Safe transaction events
      getIntentAndShow(params.transaction, eventName, 'Safe Wallet', { isSafeEvent: true });
    }
  }
}

function handleSafeSdkSignRequest(sdkData) {
  
  if (sdkData.params && sdkData.method === 'signTypedMessage') {
    const typedData = sdkData.params.typedData || sdkData.params.message;
    const address = sdkData.params.address || 'Unknown';
    
    if (typedData) {
      handleSafeSignatureRequest(typedData, address, 'Safe SDK');
    }
  }
}

function hookSafeSDK() {
  // Hooking Safe SDK
  
  // Hook SafeAppsSDK if available
  if (window.SafeAppsSDK && !hookedWallets.has('safe-apps-sdk')) {
    try {
      const sdk = window.SafeAppsSDK;
      
      // Hook SDK methods
      if (sdk.txs && typeof sdk.txs.signTypedMessage === 'function') {
        const originalSignTypedMessage = sdk.txs.signTypedMessage;
        sdk.txs.signTypedMessage = function(typedData) {
          
          // Process the Safe signature request
          handleSafeSignatureRequest(typedData, 'Unknown', 'Safe Apps SDK');
          
          // Call original method
          return originalSignTypedMessage.apply(this, arguments);
        };
      }
      
      hookedWallets.add('safe-apps-sdk');
    } catch (error) {
    }
  }
}

function hookSafeApiCalls() {
  // Hooking Safe API calls
  
  // Hook fetch for Safe API requests
  if (window.fetch && !window._kaisignFetchHooked) {
    const originalFetch = window.fetch;
    
    window.fetch = async function(url, options) {
      // Check for Safe API calls
      if (typeof url === 'string' && (url.includes('safe.global') || url.includes('gnosis-safe'))) {
        
        // Check if it's a signature-related API call
        if (url.includes('/signatures') || url.includes('/confirm') || options?.method === 'POST') {
          
          // Try to extract transaction data from request body
          if (options?.body) {
            try {
              const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
              
              if (body.safeTxHash || body.transactionHash) {
                // This might be a signature submission - could trigger popup
              }
            } catch (parseError) {
            }
          }
        }
      }
      
      return originalFetch.apply(this, arguments);
    };
    
    window._kaisignFetchHooked = true;
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
  if (provider.isSafe) return 'Safe Wallet';
  return 'Unknown Wallet';
}

/**
 * Handle Safe signature requests (eth_signTypedData_v4)
 */
function handleSafeSignatureRequest(typedData, signerAddress, walletName) {
  try {
    console.log('[KaiSign] Parsing Safe signature request:', typedData);
    
    // Track Safe signature activity
    analyzeSafeSignatureActivity(typedData, signerAddress, walletName);
    
    // Check if this is a Safe transaction signature request
    console.log('[KaiSign] Checking SafeTx condition:', { hasTypes: !!typedData.types, hasSafeTx: !!(typedData.types?.SafeTx) });
    if (typedData.types && typedData.types.SafeTx) {
      console.log('[KaiSign] ✅ SAFE TRANSACTION DETECTED - proceeding to getIntentAndShow');
      const safeTx = typedData.message;
      
      // Convert Safe transaction to standard transaction format
      const tx = {
        to: safeTx.to,
        value: safeTx.value || '0x0',
        data: safeTx.data || '0x',
        from: signerAddress
      };
      
      // Add Safe-specific context with enhanced analysis
      const context = {
        operation: safeTx.operation,
        safeTxGas: safeTx.safeTxGas,
        baseGas: safeTx.baseGas,
        gasPrice: safeTx.gasPrice,
        gasToken: safeTx.gasToken,
        refundReceiver: safeTx.refundReceiver,
        nonce: safeTx.nonce,
        isSafeSignature: true,
        safeAddress: typedData.domain?.verifyingContract,
        chainId: typedData.domain?.chainId,
        safeName: typedData.domain?.name || 'Safe',
        safeVersion: typedData.domain?.version,
        multisigThreshold: detectMultisigThreshold(typedData),
        operationType: safeTx.operation === 0 ? 'CALL' : 'DELEGATECALL'
      };
      
      
      // Show Safe-specific notification
      try {
        showSafeSignatureNotification(safeTx, context, signerAddress, walletName);
      } catch (notifError) {
        console.error('[KaiSign] Safe notification error:', notifError);
      }
      
      // Process the transaction data like a regular transaction
      console.log('[KaiSign] 🚀 CALLING getIntentAndShow for Safe transaction:', { to: tx.to, dataLength: tx.data?.length });
      getIntentAndShow(tx, 'eth_signTypedData_v4 (Safe Multisig)', walletName, context);
    } else {
      // Handle other typed data signatures (EIP-712)
      console.log('[KaiSign] Processing EIP-712 signature:', typedData);
      handleEIP712Signature(typedData, signerAddress, walletName);
    }
  } catch (error) {
    console.error('[KaiSign] Error parsing Safe signature request:', error);
  }
}

/**
 * Analyze Safe signature activity patterns
 */
function analyzeSafeSignatureActivity(typedData, signerAddress, walletName) {
  const timestamp = Date.now();
  
  // Track Safe signature requests
  if (!rpcActivity.patterns.safeSignatures) {
    rpcActivity.patterns.safeSignatures = [];
  }
  
  const signatureData = {
    timestamp,
    signer: signerAddress,
    wallet: walletName,
    safeAddress: typedData.domain?.verifyingContract,
    chainId: typedData.domain?.chainId,
    nonce: typedData.message?.nonce,
    isSafeTransaction: !!(typedData.types && typedData.types.SafeTx)
  };
  
  rpcActivity.patterns.safeSignatures.push(signatureData);
  
  // Keep only recent signatures (last 24 hours)
  const oneDayAgo = timestamp - (24 * 60 * 60 * 1000);
  rpcActivity.patterns.safeSignatures = rpcActivity.patterns.safeSignatures.filter(
    sig => sig.timestamp > oneDayAgo
  );
  
  // Detect rapid Safe signing (potential automation/bot activity)
  const recentSignatures = rpcActivity.patterns.safeSignatures.filter(
    sig => timestamp - sig.timestamp < 60000 // Last 1 minute
  );
  
  if (recentSignatures.length > 5) {
    rpcActivity.security.suspiciousActivity.push({
      type: 'rapid_safe_signing',
      count: recentSignatures.length,
      timestamp,
      safeAddress: typedData.domain?.verifyingContract,
      signer: signerAddress,
      pattern: 'potential_automation'
    });
  }
  
  // Track multisig coordination patterns
  if (typedData.domain?.verifyingContract) {
    trackMultisigCoordination(typedData.domain.verifyingContract, signerAddress, timestamp);
  }
}

/**
 * Detect multisig threshold from Safe transaction data
 */
function detectMultisigThreshold(typedData) {
  // This would typically require additional Safe API calls
  // For now, we'll mark it as unknown but trackable
  return 'Unknown (requires Safe API)';
}

/**
 * Track multisig coordination patterns
 */
function trackMultisigCoordination(safeAddress, signer, timestamp) {
  if (!rpcActivity.patterns.multisigCoordination) {
    rpcActivity.patterns.multisigCoordination = {};
  }
  
  if (!rpcActivity.patterns.multisigCoordination[safeAddress]) {
    rpcActivity.patterns.multisigCoordination[safeAddress] = {
      signers: new Set(),
      signatures: [],
      lastActivity: null
    };
  }
  
  const coordination = rpcActivity.patterns.multisigCoordination[safeAddress];
  coordination.signers.add(signer);
  coordination.signatures.push({ signer, timestamp });
  coordination.lastActivity = timestamp;
  
  // Keep only recent signatures
  const oneHourAgo = timestamp - (60 * 60 * 1000);
  coordination.signatures = coordination.signatures.filter(
    sig => sig.timestamp > oneHourAgo
  );
  
}

/**
 * Handle EIP-712 signatures (non-Safe)
 */
function handleEIP712Signature(typedData, signerAddress, walletName) {
  console.log('[KaiSign] Processing EIP-712 signature');
  
  // Track EIP-712 activity
  handleRpcMethod('eth_signTypedData_v4', [signerAddress, typedData], walletName);
  
  // Show EIP-712 notification
  showEIP712Notification(typedData, signerAddress, walletName);
}

/**
 * Show Safe-specific signature notification
 */
function showSafeSignatureNotification(safeTx, context, signerAddress, walletName) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    width: 350px;
    background: #2d3748;
    color: white;
    padding: 15px;
    border-radius: 10px;
    z-index: 999997;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.4);
    border: 2px solid #4a5568;
    border-left: 6px solid #f093fb;
  `;
  
  const operationType = context.operationType || 'CALL';
  const safeAddress = context.safeAddress || 'Unknown';
  const operationColor = operationType === 'DELEGATECALL' ? '#ff6b6b' : '#68d391';
  
  notification.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <strong style="color: #f093fb; font-size: 13px;">🔐 Safe Multisig Signature</strong>
      <button onclick="this.parentElement.parentElement.remove()" style="
        background: #e53e3e;
        color: white;
        border: none;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 10px;
      ">✕</button>
    </div>
    
    <div style="margin-bottom: 10px;">
      <div style="color: #68d391; font-weight: bold; margin-bottom: 4px;">
        ${context.safeName} (${context.safeVersion || 'Unknown version'})
      </div>
      <div style="font-size: 10px; color: #a0aec0; word-break: break-all;">
        Safe: ${safeAddress.slice(0, 10)}...${safeAddress.slice(-8)}
      </div>
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; font-size: 10px;">
      <div><strong style="color: #ffd700;">Operation:</strong> <span style="color: ${operationColor};">${operationType}</span></div>
      <div><strong style="color: #ffd700;">Nonce:</strong> ${context.nonce}</div>
      <div><strong style="color: #ffd700;">To:</strong> ${safeTx.to?.slice(0, 8)}...</div>
      <div><strong style="color: #ffd700;">Value:</strong> ${safeTx.value} ETH</div>
    </div>
    
    <div style="background: #1a202c; padding: 8px; border-radius: 6px; margin-bottom: 10px;">
      <div style="color: #63b3ed; font-size: 10px; margin-bottom: 4px;">Gas Configuration:</div>
      <div style="font-size: 9px; color: #a0aec0;">
        Safe Gas: ${context.safeTxGas} | Base Gas: ${context.baseGas}<br>
        Gas Price: ${context.gasPrice} | Token: ${context.gasToken || 'ETH'}
      </div>
    </div>
    
    <div style="font-size: 10px; color: #a0aec0; text-align: center; margin-top: 10px;">
      Signer: ${signerAddress?.slice(0, 8)}...${signerAddress?.slice(-6)} | ${walletName}
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Auto-remove after 12 seconds (longer for Safe signatures)
  setTimeout(() => {
    if (notification.parentNode) notification.remove();
  }, 12000);
}

/**
 * Show EIP-712 signature notification
 */
function showEIP712Notification(typedData, signerAddress, walletName) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    width: 300px;
    background: #2d3748;
    color: white;
    padding: 12px;
    border-radius: 8px;
    z-index: 999997;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    border-left: 4px solid #9f7aea;
  `;
  
  const domain = typedData.domain || {};
  const primaryType = typedData.primaryType || 'Unknown';
  
  notification.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <strong style="color: #9f7aea;">📝 EIP-712 Signature</strong>
      <button onclick="this.parentElement.parentElement.remove()" style="
        background: #e53e3e;
        color: white;
        border: none;
        padding: 2px 6px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 9px;
      ">✕</button>
    </div>
    
    <div style="margin-bottom: 8px;">
      <div style="color: #b794f6; font-weight: bold;">${primaryType}</div>
      <div style="font-size: 10px; color: #a0aec0;">
        ${domain.name || 'Unknown dApp'} ${domain.version ? `v${domain.version}` : ''}
      </div>
    </div>
    
    <div style="font-size: 10px; color: #a0aec0;">
      ${domain.verifyingContract ? `Contract: ${domain.verifyingContract.slice(0, 10)}...` : ''}
      ${domain.chainId ? `| Chain: ${domain.chainId}` : ''}
    </div>
    
    <div style="margin-top: 8px; font-size: 10px; color: #a0aec0; text-align: center;">
      ${walletName} | ${signerAddress?.slice(0, 8)}...${signerAddress?.slice(-6)}
    </div>
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    if (notification.parentNode) notification.remove();
  }, 8000);
}

/**
 * RPC Method Classification and Handling
 */

// Define all monitored Ethereum RPC methods
const ETHEREUM_RPC_METHODS = {
  // Transaction methods
  TRANSACTION: [
    'eth_sendTransaction',
    'eth_signTransaction', 
    'eth_sendRawTransaction',
    'eth_signTypedData_v4',
    'personal_sign'
  ],
  
  // Query methods - read blockchain state
  QUERY: [
    'eth_call',                 // Smart contract calls
    'eth_getBalance',           // Address balances
    'eth_getCode',              // Contract code
    'eth_getTransactionReceipt', // Transaction receipts
    'eth_getLogs',              // Event logs
    'eth_getTransactionByHash', // Transaction details
    'eth_getBlockByNumber',     // Block details
    'eth_getBlockByHash'        // Block details by hash
  ],
  
  // Network info methods
  NETWORK: [
    'eth_blockNumber',          // Latest block number
    'eth_chainId',              // Network chain ID
    'eth_gasPrice',             // Current gas price
    'eth_feeHistory',           // Fee history for EIP-1559
    'net_version',              // Network version
    'web3_clientVersion'        // Client version
  ],
  
  // Gas estimation methods
  GAS: [
    'eth_estimateGas',          // Gas estimation
    'eth_maxPriorityFeePerGas', // EIP-1559 priority fee
    'eth_gasPrice'              // Legacy gas price
  ],
  
  // Real-time subscription methods
  SUBSCRIPTION: [
    'eth_subscribe',            // Subscribe to events
    'eth_unsubscribe'           // Unsubscribe from events
  ],
  
  // Account methods
  ACCOUNT: [
    'eth_accounts',             // Get accounts
    'eth_requestAccounts',      // Request account access
    'wallet_addEthereumChain',  // Add custom chain
    'wallet_switchEthereumChain' // Switch chains
  ],
  
  // Safe Wallet specific methods
  SAFE: [
    'safe_setSettings',         // Safe settings changes
    'safe_getSettings',         // Get Safe settings
    'wallet_invokeSnap',        // Snap invocation (MetaMask Snaps)
    'wallet_requestSnaps',      // Request Snap permissions
    'wallet_getSnaps'           // Get installed snaps
  ]
};

// RPC activity tracking
const rpcActivity = {
  methods: {},
  timeline: [],
  patterns: {},
  security: {
    suspiciousActivity: [],
    privacyConcerns: [],
    mevIndicators: []
  }
};

/**
 * Check if a method should be monitored
 */
function isMonitoredEthereumMethod(method) {
  return Object.values(ETHEREUM_RPC_METHODS).flat().includes(method);
}

/**
 * Check if method is transaction-related
 */
function isTransactionMethod(method) {
  return ETHEREUM_RPC_METHODS.TRANSACTION.includes(method);
}

/**
 * Get method category
 */
function getMethodCategory(method) {
  for (const [category, methods] of Object.entries(ETHEREUM_RPC_METHODS)) {
    if (methods.includes(method)) {
      return category.toLowerCase();
    }
  }
  return 'unknown';
}

/**
 * Handle non-transaction RPC methods
 */
function handleRpcMethod(method, params, walletName) {
  const timestamp = Date.now();
  const category = getMethodCategory(method);
  
  // Track method frequency
  if (!rpcActivity.methods[method]) {
    rpcActivity.methods[method] = { count: 0, lastCalled: null, category };
  }
  rpcActivity.methods[method].count++;
  rpcActivity.methods[method].lastCalled = timestamp;
  
  // Add to timeline
  rpcActivity.timeline.unshift({
    method,
    category,
    params,
    walletName,
    timestamp,
    time: new Date().toISOString()
  });
  
  // Keep timeline manageable
  if (rpcActivity.timeline.length > 100) {
    rpcActivity.timeline.splice(100);
  }
  
  // Analyze patterns and security implications
  analyzeRpcPatterns(method, params, category, timestamp);
  
  // Show RPC activity notification for important methods
  if (shouldShowRpcNotification(method, category)) {
    showRpcActivityNotification(method, params, category, walletName);
  }
  
}

/**
 * Analyze RPC patterns for security and privacy concerns
 */
function analyzeRpcPatterns(method, params, category, timestamp) {
  // Detect excessive balance checking (privacy concern)
  if (method === 'eth_getBalance') {
    const recentBalanceChecks = rpcActivity.timeline.filter(
      activity => activity.method === 'eth_getBalance' && 
      timestamp - activity.timestamp < 60000 // Last 1 minute
    ).length;
    
    if (recentBalanceChecks > 10) {
      rpcActivity.security.privacyConcerns.push({
        type: 'excessive_balance_checking',
        count: recentBalanceChecks,
        timestamp,
        addresses: params?.[0] ? [params[0]] : []
      });
    }
  }
  
  // Detect rapid gas price checking (MEV indicator)
  if (method === 'eth_gasPrice' || method === 'eth_feeHistory') {
    const recentGasChecks = rpcActivity.timeline.filter(
      activity => (activity.method === 'eth_gasPrice' || activity.method === 'eth_feeHistory') &&
      timestamp - activity.timestamp < 10000 // Last 10 seconds
    ).length;
    
    if (recentGasChecks > 5) {
      rpcActivity.security.mevIndicators.push({
        type: 'rapid_gas_monitoring',
        count: recentGasChecks,
        timestamp,
        pattern: 'potential_mev_activity'
      });
    }
  }
  
  // Detect rapid block monitoring (frontrunning indicator)
  if (method === 'eth_blockNumber') {
    const recentBlockChecks = rpcActivity.timeline.filter(
      activity => activity.method === 'eth_blockNumber' &&
      timestamp - activity.timestamp < 5000 // Last 5 seconds
    ).length;
    
    if (recentBlockChecks > 3) {
      rpcActivity.security.mevIndicators.push({
        type: 'rapid_block_monitoring',
        count: recentBlockChecks,
        timestamp,
        pattern: 'potential_frontrunning'
      });
    }
  }
  
  // Detect contract discovery patterns
  if (method === 'eth_getCode') {
    const address = params?.[0];
    if (address) {
      const codeChecks = rpcActivity.timeline.filter(
        activity => activity.method === 'eth_getCode'
      ).length;
      
      if (codeChecks > 20) {
        rpcActivity.security.suspiciousActivity.push({
          type: 'extensive_contract_discovery',
          count: codeChecks,
          timestamp,
          addresses: [address]
        });
      }
    }
  }
}

/**
 * Determine if RPC method should show notification
 */
function shouldShowRpcNotification(method, category) {
  // Show notifications for important methods
  const importantMethods = [
    'wallet_addEthereumChain',
    'wallet_switchEthereumChain',
    'eth_requestAccounts',
    'eth_subscribe',
    'eth_sendRawTransaction'
  ];
  
  return importantMethods.includes(method);
}

/**
 * Show RPC activity notification
 */
function showRpcActivityNotification(method, params, category, walletName) {
  // Create notification popup
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    width: 300px;
    background: #1a202c;
    color: white;
    padding: 12px;
    border-radius: 8px;
    z-index: 999998;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    border-left: 4px solid #3182ce;
  `;
  
  // Format method description
  const methodDescriptions = {
    'wallet_addEthereumChain': '🔗 Adding Custom Network',
    'wallet_switchEthereumChain': '🔄 Switching Networks',
    'eth_requestAccounts': '👤 Requesting Account Access',
    'eth_subscribe': '📡 Setting Up Real-time Subscription',
    'eth_sendRawTransaction': '📤 Broadcasting Raw Transaction',
    'eth_unsubscribe': '📡 Cancelling Subscription'
  };
  
  const description = methodDescriptions[method] || `📋 ${method}`;
  
  notification.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <strong style="color: #63b3ed;">KaiSign RPC Monitor</strong>
      <button onclick="this.parentElement.parentElement.remove()" style="
        background: #e53e3e;
        color: white;
        border: none;
        padding: 2px 6px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 9px;
      ">✕</button>
    </div>
    <div style="color: #68d391; margin-bottom: 4px;">
      ${description}
    </div>
    <div style="font-size: 10px; color: #a0aec0;">
      Wallet: ${walletName} | Category: ${category}
    </div>
    ${params && params.length > 0 ? `
      <div style="margin-top: 6px; padding: 6px; background: #000; border-radius: 3px; font-size: 9px; max-height: 60px; overflow-y: auto;">
        ${JSON.stringify(params, null, 1).slice(0, 200)}${JSON.stringify(params).length > 200 ? '...' : ''}
      </div>
    ` : ''}
  `;
  
  document.body.appendChild(notification);
  
  // Auto-remove after 8 seconds
  setTimeout(() => {
    if (notification.parentNode) notification.remove();
  }, 8000);
}

// Generic wallet provider hooker
function hookWalletProvider(provider, walletKey, walletName = walletKey) {
  if (!provider.request) return;
  
  const originalRequest = provider.request.bind(provider);
  
  provider.request = async function(args) {
    
    // Check if it's any Ethereum RPC method we want to monitor
    if (isMonitoredEthereumMethod(args.method)) {
      
      console.log(`[KaiSign] Intercepted ${args.method} from ${walletName}`, args.params);
      
      // Handle different method categories
      if (isTransactionMethod(args.method)) {
        // Transaction and signature methods
        if (args.method === 'eth_signTypedData_v4') {
          // Handle Safe signature requests
          const typedDataRaw = args.params?.[1];
          const address = args.params?.[0];
          
          if (typedDataRaw) {
            // Parse JSON string if needed
            let typedData;
            try {
              typedData = typeof typedDataRaw === 'string' ? JSON.parse(typedDataRaw) : typedDataRaw;
              console.log('[KaiSign] 🔧 Parsed typedData:', { hasTypes: !!typedData.types, hasSafeTx: !!(typedData.types?.SafeTx) });
            } catch (e) {
              console.error('[KaiSign] Failed to parse typedData:', e);
              typedData = typedDataRaw;
            }
            
            handleSafeSignatureRequest(typedData, address, walletName);
          }
        } else if (args.method === 'personal_sign') {
          // Handle personal message signing
          const message = args.params?.[0];
          const address = args.params?.[1];
          console.log('[KaiSign] Processing personal_sign request:', message);
          handleRpcMethod(args.method, args.params, walletName);
        } else {
          // Handle regular transactions (eth_sendTransaction, eth_signTransaction)
          const tx = args.params?.[0] || {};
          getIntentAndShow(tx, args.method, walletName, null);
        }
      } else {
        // Handle all other RPC methods (queries, utilities, etc.)
        handleRpcMethod(args.method, args.params, walletName);
      }
    }
    
    // Call original wallet request
    return await originalRequest(args);
  };
  
}

// Get intent and show transaction
async function getIntentAndShow(tx, method, walletName = 'Wallet', context = null) {
  let intent = 'Loading intent...';
  let decodedResult = null;
  let extractedBytecodes = [];
  
  // SAFE SIGNATURE REQUEST HANDLING - CHECK FIRST
  if (context && context.isSafeSignature) {
    console.log('[KaiSign] Safe signature context detected - checking transaction data');
    intent = '🔒 Safe Signature Request - parsing transaction...';
    showEnhancedTransactionInfo(tx, method, intent, walletName, { success: false }, []);
    
    // Add Safe context to method display
    method = `${method} (Safe Multi-Sig)`;
    console.log('[KaiSign] Safe transaction data selector:', tx.data ? tx.data.slice(0, 10) : 'no data');
  }
  
  // UNIVERSAL ROUTER SPECIFIC PARSING - CHECK FIRST, TAKES PRECEDENCE
  
  if (tx.data && tx.data.startsWith('0x3593564c')) {
    
    // Force immediate popup update with Universal Router detection
    intent = 'Universal Router detected - parsing...';
    showEnhancedTransactionInfo(tx, method, intent, walletName, { success: false }, []);
    
    try {
      const universalRouterCalls = await parseUniversalRouterTransaction(tx.data, tx.value);
      
      if (universalRouterCalls && universalRouterCalls.length > 0) {
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
        return; // Skip ALL other decoding for Universal Router
      } else {
      }
    } catch (urError) {
      console.error('[KaiSign] UR Error details:', urError);
    }
  }
  
  // SAFE TRANSACTION DETECTION - CHECK SECOND
  // Safe execTransaction (0x6a761202) or direct multiSend (0x8d80ff0a)
  if (tx.data && (tx.data.startsWith('0x6a761202') || tx.data.startsWith('0x8d80ff0a'))) {
    console.log('[KaiSign] ✅ SAFE PARSING SECTION REACHED - selector:', tx.data.slice(0, 10));
    intent = 'Safe transaction detected - parsing...';
    showEnhancedTransactionInfo(tx, method, intent, walletName, { success: false }, []);
    
    try {
      let multiSendData = null;
      
      // Direct multiSend call
      if (tx.data.startsWith('0x8d80ff0a')) {
        multiSendData = tx.data;
      }
      // Safe execTransaction - need to extract embedded multiSend data
      else if (tx.data.startsWith('0x6a761202')) {
        // Look for multiSend selector (0x8d80ff0a) in the transaction data
        // We need to find it at word boundaries (every 2 hex chars) to avoid partial matches
        console.log('[KaiSign] Searching for MultiSend selector in execTransaction data');
        
        let multiSendIndex = -1;
        let searchStart = 0;
        
        // Search for 8d80ff0a, but ensure it's at proper hex alignment
        while ((multiSendIndex = tx.data.indexOf('8d80ff0a', searchStart)) !== -1) {
          // Check if this index is at a proper hex word boundary
          // Transaction data starts with 0x, so valid positions are: 2, 4, 6, 8, etc.
          const hexPosition = multiSendIndex - 2; // Account for 0x prefix
          if (hexPosition >= 0 && hexPosition % 2 === 0) {
            // This is a valid alignment, check if it looks like a function selector
            const potentialData = '0x' + tx.data.slice(multiSendIndex);
            if (potentialData.startsWith('0x8d80ff0a')) {
              console.log('[KaiSign] Found properly aligned MultiSend selector at position:', multiSendIndex);
              break;
            }
          }
          searchStart = multiSendIndex + 1;
        }
        
        if (multiSendIndex !== -1) {
          // Extract the multiSend call data starting from the properly aligned selector
          multiSendData = '0x' + tx.data.slice(multiSendIndex);
          console.log('[KaiSign] Extracted MultiSend data:', multiSendData.slice(0, 20) + '...');
          
          // Final verification
          if (!multiSendData.startsWith('0x8d80ff0a')) {
            console.error('[KaiSign] CRITICAL: MultiSend data extraction failed');
            console.log('[KaiSign] Expected: 0x8d80ff0a, Got:', multiSendData.slice(0, 12));
            multiSendData = null; // Clear invalid data
          }
        }
      }
      
      if (multiSendData) {
        console.log('[KaiSign] Calling parseSafeMultiSendTransaction with:', multiSendData.slice(0, 50) + '...');
        const multiSendResult = await parseSafeMultiSendTransaction(multiSendData);
        console.log('[KaiSign] parseSafeMultiSendTransaction result:', multiSendResult);
        
        if (multiSendResult) {
          intent = multiSendResult.intent;
          decodedResult = {
            success: true,
            functionName: 'Safe Transaction',
            selector: tx.data.slice(0, 10),
            intent: intent,
            safeTransaction: true,
            operations: multiSendResult.operations.length
          };
          
          // Convert operations to extractedBytecodes format for display
          extractedBytecodes = await Promise.all(multiSendResult.operations.map(async (op, i) => ({
            bytecode: op.data,
            selector: op.selector,
            depth: 2,
            index: i + 1,
            target: op.to,
            functionName: `Operation ${i + 1}`,
            intent: await getSafeOperationIntent(op),
            type: 'safe_operation',
            value: op.value !== '0x0' ? op.value : null
          })));
          
          console.log(`[KaiSign] Safe: ${intent}`);
          showEnhancedTransactionInfo(tx, method, intent, walletName, decodedResult, extractedBytecodes);
          return; // Skip other decoding for Safe transactions
        }
      }
    } catch (safeError) {
      console.error('[KaiSign] Safe transaction parsing error:', safeError);
    }
  }
  
  // Show popup immediately with loading state for other transactions
  showEnhancedTransactionInfo(tx, method, intent, walletName, decodedResult, extractedBytecodes);
  
  // Use EXACT decoder from Snaps repo
  
  if (window.decodeCalldata && tx.data && tx.to) {
    try {
      // Use Sepolia chain ID for KaiSign contract
      const chainId = tx.to.toLowerCase() === '0x4dfea0c2b472a14cd052a8f9df9f19fa5cf03719' ? 11155111 : 1;
      
      const decoded = await window.decodeCalldata(tx.data, tx.to, chainId);
      
      // Try to extract nested bytecodes using enhanced decoder
      if (window.extractNestedBytecodes) {
        try {
          extractedBytecodes = await window.extractNestedBytecodes(tx.data, tx.to, chainId);
        } catch (error) {
        }
      }
      
      if (decoded.success) {
        intent = decoded.intent || 'Contract interaction';
        decodedResult = decoded;
      } else {
        intent = 'Contract interaction';
        decodedResult = decoded;
      }
      // Update popup with enhanced data
      showEnhancedTransactionInfo(tx, method, intent, walletName, decodedResult, extractedBytecodes);
    } catch (error) {
      intent = 'Contract interaction';
      decodedResult = { success: false, error: error.message };
      showEnhancedTransactionInfo(tx, method, intent, walletName, decodedResult, extractedBytecodes);
    }
  } else {
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
  } catch (error) {
  }
}

// Show enhanced transaction info with complete bytecode data
async function showEnhancedTransactionInfo(tx, method, intent, walletName = 'Wallet', decodedResult = null, extractedBytecodes = []) {
  console.log('[KaiSign] 🎯 showEnhancedTransactionInfo called:', { method, intent, walletName });
  
  // Remove old popup if exists
  const old = document.getElementById('kaisign-popup');
  if (old) old.remove();
  
  // Try to use advanced decoder for ANY transaction if available
  let realExtractedBytecodes = extractedBytecodes;
  let advancedDecodingResult = null;
  
  if (tx.data && tx.data.length > 10 && window.AdvancedTransactionDecoder) {
    try {
      const decoder = new window.AdvancedTransactionDecoder();
      advancedDecodingResult = await decoder.decodeTransaction(tx, tx.to, 1);
      
      if (advancedDecodingResult && advancedDecodingResult.extractedBytecodes) {
        realExtractedBytecodes = advancedDecodingResult.extractedBytecodes;
      }
    } catch (error) {
      // Use generic approach for ANY bytecode that might contain nested calls
      if (tx.data && tx.data.length > 10) {
        try {
          realExtractedBytecodes = await parseGenericNestedBytecode(tx.data);
        } catch (genericError) {
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
        margin-right: 10px;
      ">💾 Export Data</button>
      
      <button onclick="showRpcDashboard()" style="
        background: #9f7aea;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
      ">📊 RPC Activity</button>
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
      <div>
        <button onclick="showRpcDashboard()" style="
          background: #3182ce;
          color: white;
          border: none;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          margin-right: 10px;
          font-size: 11px;
        ">📊 RPC Dashboard</button>
        <button onclick="this.parentElement.parentElement.remove()" style="
          background: #e53e3e;
          color: white;
          border: none;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
        ">✕ Close</button>
      </div>
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

/**
 * Show comprehensive RPC activity dashboard
 */
window.showRpcDashboard = function() {
  // Remove existing dashboard
  const existing = document.getElementById('kaisign-rpc-dashboard');
  if (existing) existing.remove();
  
  const dashboard = document.createElement('div');
  dashboard.id = 'kaisign-rpc-dashboard';
  dashboard.style.cssText = `
    position: fixed;
    top: 5%;
    left: 5%;
    width: 90vw;
    height: 90vh;
    overflow-y: auto;
    background: #1a202c;
    color: white;
    padding: 20px;
    border-radius: 12px;
    z-index: 1000001;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.7);
    border: 2px solid #4a5568;
  `;
  
  // Generate dashboard content
  const methodsCount = Object.keys(rpcActivity.methods).length;
  const totalCalls = Object.values(rpcActivity.methods).reduce((sum, method) => sum + method.count, 0);
  const recentActivity = rpcActivity.timeline.slice(0, 10);
  
  // Category statistics
  const categoryStats = {};
  for (const [method, data] of Object.entries(rpcActivity.methods)) {
    const category = data.category;
    if (!categoryStats[category]) {
      categoryStats[category] = { count: 0, methods: [] };
    }
    categoryStats[category].count += data.count;
    categoryStats[category].methods.push(method);
  }
  
  // Security analysis
  const securityConcerns = [
    ...rpcActivity.security.privacyConcerns,
    ...rpcActivity.security.mevIndicators,
    ...rpcActivity.security.suspiciousActivity
  ];
  
  // Safe signatures analysis
  const safeSignatures = rpcActivity.patterns.safeSignatures || [];
  const multisigCoordination = rpcActivity.patterns.multisigCoordination || {};
  
  dashboard.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #4a5568; padding-bottom: 15px;">
      <h1 style="margin: 0; color: #63b3ed; font-size: 18px;">📊 KaiSign RPC Activity Dashboard</h1>
      <button onclick="this.parentElement.parentElement.remove()" style="
        background: #e53e3e;
        color: white;
        border: none;
        padding: 10px 15px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
      ">✕ Close</button>
    </div>
    
    <!-- Summary Statistics -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px;">
      <div style="background: #2d3748; padding: 15px; border-radius: 8px; border-left: 4px solid #68d391;">
        <div style="color: #68d391; font-size: 24px; font-weight: bold;">${totalCalls}</div>
        <div style="color: #a0aec0; font-size: 12px;">Total RPC Calls</div>
      </div>
      <div style="background: #2d3748; padding: 15px; border-radius: 8px; border-left: 4px solid #3182ce;">
        <div style="color: #3182ce; font-size: 24px; font-weight: bold;">${methodsCount}</div>
        <div style="color: #a0aec0; font-size: 12px;">Unique Methods</div>
      </div>
      <div style="background: #2d3748; padding: 15px; border-radius: 8px; border-left: 4px solid #f093fb;">
        <div style="color: #f093fb; font-size: 24px; font-weight: bold;">${safeSignatures.length}</div>
        <div style="color: #a0aec0; font-size: 12px;">Safe Signatures</div>
      </div>
      <div style="background: #2d3748; padding: 15px; border-radius: 8px; border-left: 4px solid ${securityConcerns.length > 0 ? '#ff6b6b' : '#68d391'};">
        <div style="color: ${securityConcerns.length > 0 ? '#ff6b6b' : '#68d391'}; font-size: 24px; font-weight: bold;">${securityConcerns.length}</div>
        <div style="color: #a0aec0; font-size: 12px;">Security Alerts</div>
      </div>
    </div>
    
    <!-- Category Breakdown -->
    <div style="margin-bottom: 25px;">
      <h3 style="color: #ffd700; margin-bottom: 15px;">📂 Method Categories</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
        ${Object.entries(categoryStats).map(([category, stats]) => `
          <div style="background: #2d3748; padding: 12px; border-radius: 8px;">
            <div style="color: #63b3ed; font-weight: bold; margin-bottom: 8px;">
              ${category.toUpperCase()} (${stats.count} calls)
            </div>
            <div style="font-size: 10px; color: #a0aec0;">
              ${stats.methods.slice(0, 3).join(', ')}${stats.methods.length > 3 ? ` +${stats.methods.length - 3} more` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    
    <!-- Security Analysis -->
    ${securityConcerns.length > 0 ? `
      <div style="margin-bottom: 25px;">
        <h3 style="color: #ff6b6b; margin-bottom: 15px;">⚠️ Security Analysis</h3>
        <div style="background: #2d3748; padding: 15px; border-radius: 8px; border-left: 4px solid #ff6b6b;">
          ${securityConcerns.map((concern, i) => `
            <div style="margin-bottom: 10px; padding: 8px; background: #1a202c; border-radius: 6px;">
              <div style="color: #ff6b6b; font-weight: bold; margin-bottom: 4px;">
                ${concern.type.replace(/_/g, ' ').toUpperCase()}
              </div>
              <div style="font-size: 10px; color: #a0aec0;">
                Count: ${concern.count} | Pattern: ${concern.pattern || 'N/A'} | 
                Time: ${new Date(concern.timestamp).toLocaleTimeString()}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    
    <!-- Safe Multisig Activity -->
    ${Object.keys(multisigCoordination).length > 0 ? `
      <div style="margin-bottom: 25px;">
        <h3 style="color: #f093fb; margin-bottom: 15px;">🔐 Safe Multisig Coordination</h3>
        <div style="background: #2d3748; padding: 15px; border-radius: 8px;">
          ${Object.entries(multisigCoordination).map(([safeAddress, coordination]) => `
            <div style="margin-bottom: 15px; padding: 10px; background: #1a202c; border-radius: 6px;">
              <div style="color: #f093fb; font-weight: bold; margin-bottom: 6px;">
                Safe: ${safeAddress.slice(0, 10)}...${safeAddress.slice(-8)}
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; font-size: 10px;">
                <div><strong>Signers:</strong> ${coordination.signers.size}</div>
                <div><strong>Recent Sigs:</strong> ${coordination.signatures.length}</div>
                <div><strong>Last Activity:</strong> ${new Date(coordination.lastActivity).toLocaleTimeString()}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    
    <!-- Recent Activity Timeline -->
    <div style="margin-bottom: 25px;">
      <h3 style="color: #68d391; margin-bottom: 15px;">⏱️ Recent Activity Timeline</h3>
      <div style="background: #2d3748; padding: 15px; border-radius: 8px; max-height: 300px; overflow-y: auto;">
        ${recentActivity.length > 0 ? recentActivity.map((activity, i) => `
          <div style="margin-bottom: 12px; padding: 10px; background: #1a202c; border-radius: 6px; border-left: 3px solid #68d391;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="color: #68d391; font-weight: bold;">${activity.method}</span>
              <span style="color: #a0aec0; font-size: 10px;">${new Date(activity.timestamp).toLocaleTimeString()}</span>
            </div>
            <div style="font-size: 10px; color: #a0aec0;">
              Category: ${activity.category} | Wallet: ${activity.walletName}
              ${activity.params && activity.params.length > 0 ? `<br>Params: ${JSON.stringify(activity.params).slice(0, 100)}...` : ''}
            </div>
          </div>
        `).join('') : '<div style="color: #a0aec0; text-align: center; padding: 20px;">No recent activity</div>'}
      </div>
    </div>
    
    <!-- Method Frequency Table -->
    <div style="margin-bottom: 25px;">
      <h3 style="color: #3182ce; margin-bottom: 15px;">📈 Method Frequency</h3>
      <div style="background: #2d3748; border-radius: 8px; overflow: hidden;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead style="background: #4a5568;">
            <tr>
              <th style="padding: 10px; text-align: left; color: #fff;">Method</th>
              <th style="padding: 10px; text-align: left; color: #fff;">Category</th>
              <th style="padding: 10px; text-align: center; color: #fff;">Count</th>
              <th style="padding: 10px; text-align: left; color: #fff;">Last Called</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(rpcActivity.methods)
              .sort(([,a], [,b]) => b.count - a.count)
              .slice(0, 20)
              .map(([method, data]) => `
                <tr style="border-bottom: 1px solid #4a5568;">
                  <td style="padding: 8px; color: #63b3ed;">${method}</td>
                  <td style="padding: 8px; color: #a0aec0;">${data.category}</td>
                  <td style="padding: 8px; text-align: center; color: #68d391; font-weight: bold;">${data.count}</td>
                  <td style="padding: 8px; color: #a0aec0; font-size: 10px;">
                    ${data.lastCalled ? new Date(data.lastCalled).toLocaleString() : 'N/A'}
                  </td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    
    <!-- Action Buttons -->
    <div style="text-align: center; padding-top: 20px; border-top: 1px solid #4a5568;">
      <button onclick="exportRpcActivity()" style="
        background: #38a169;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
        margin-right: 10px;
      ">💾 Export RPC Data</button>
      <button onclick="clearRpcActivity()" style="
        background: #e53e3e;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
      ">🗑️ Clear RPC Data</button>
    </div>
  `;
  
  document.body.appendChild(dashboard);
};

/**
 * Export RPC activity data
 */
window.exportRpcActivity = function() {
  try {
    const exportData = {
      timestamp: new Date().toISOString(),
      summary: {
        totalMethods: Object.keys(rpcActivity.methods).length,
        totalCalls: Object.values(rpcActivity.methods).reduce((sum, method) => sum + method.count, 0)
      },
      methods: rpcActivity.methods,
      timeline: rpcActivity.timeline,
      patterns: rpcActivity.patterns,
      security: rpcActivity.security
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kaisign-rpc-activity-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    alert('✅ RPC activity data exported successfully!');
  } catch (error) {
    console.error('[KaiSign] RPC export failed:', error);
    alert('❌ Export failed: ' + error.message);
  }
};

/**
 * Clear RPC activity data
 */
window.clearRpcActivity = function() {
  if (confirm('Are you sure you want to clear all RPC activity data?')) {
    // Reset all RPC activity
    rpcActivity.methods = {};
    rpcActivity.timeline = [];
    rpcActivity.patterns = {};
    rpcActivity.security = {
      suspiciousActivity: [],
      privacyConcerns: [],
      mevIndicators: []
    };
    
    // Close dashboard
    const dashboard = document.getElementById('kaisign-rpc-dashboard');
    if (dashboard) dashboard.remove();
    
    alert('✅ RPC activity data cleared!');
  }
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

// Expose RPC monitoring functions globally
window.kaisignRpc = {
  activity: rpcActivity,
  methods: ETHEREUM_RPC_METHODS,
  showDashboard: () => window.showRpcDashboard(),
  export: () => window.exportRpcActivity(),
  clear: () => window.clearRpcActivity(),
  
  // Test methods for different RPC types
  simulateMethod: (method, params, walletName = 'Test Wallet') => {
    console.log(`[KaiSign-Test] Simulating ${method}`);
    handleRpcMethod(method, params, walletName);
  },
  
  // Security analysis helpers
  getSuspiciousActivity: () => rpcActivity.security.suspiciousActivity,
  getPrivacyConcerns: () => rpcActivity.security.privacyConcerns,
  getMevIndicators: () => rpcActivity.security.mevIndicators,
  
  // Safe multisig helpers  
  getSafeSignatures: () => rpcActivity.patterns.safeSignatures || [],
  getMultisigCoordination: () => rpcActivity.patterns.multisigCoordination || {},
  
  // Statistics
  getStats: () => ({
    totalMethods: Object.keys(rpcActivity.methods).length,
    totalCalls: Object.values(rpcActivity.methods).reduce((sum, method) => sum + method.count, 0),
    categorizedMethods: Object.entries(rpcActivity.methods).reduce((acc, [method, data]) => {
      if (!acc[data.category]) acc[data.category] = [];
      acc[data.category].push(method);
      return acc;
    }, {}),
    securityAlertsCount: [
      ...rpcActivity.security.privacyConcerns,
      ...rpcActivity.security.mevIndicators, 
      ...rpcActivity.security.suspiciousActivity
    ].length
  })
};

// Console helpers
console.log(`
🔍 KaiSign Enhanced RPC Monitor Loaded!

Now monitoring ALL Ethereum RPC methods including:
• Transaction methods (eth_sendTransaction, eth_signTypedData_v4, etc.)
• Query methods (eth_call, eth_getBalance, eth_getLogs, etc.)
• Network methods (eth_chainId, eth_blockNumber, eth_gasPrice, etc.)
• Safe multisig signatures with enhanced tracking
• Security & privacy pattern detection

Quick access commands:
- window.kaisignRpc.showDashboard() - Full RPC dashboard
- window.kaisignRpc.getStats() - Quick statistics
- window.kaisignRpc.activity - Raw activity data
- window.kaisignRpc.simulateMethod('eth_getBalance', ['0x123...']) - Test RPC method

Features:
✅ Safe multisig signature analysis
✅ MEV/frontrunning detection  
✅ Privacy concern monitoring
✅ Comprehensive RPC call tracking
✅ Real-time security alerts
✅ Transaction history integration
`);

// ULTIMATE SAFE WALLET HOOK - THE MISSING PIECE!
// This hooks into Safe's internal postMessage communication
setupUltimateSafeHook();

// Start wallet detection
waitForWallets();

/**
 * ULTIMATE SAFE WALLET HOOK
 * This is the CRITICAL missing piece that will finally capture Safe signatures!
 */
function setupUltimateSafeHook() {
  
  // Hook postMessage for Safe iframe communication
  if (window.postMessage && !window._kaisignSafeMessageHooked) {
    const originalPostMessage = window.postMessage;
    
    window.postMessage = function(message, targetOrigin, transfer) {
      // Check for Safe-related messages
      if (message && typeof message === 'object') {
        // PostMessage intercepted - analyzing...
        
        if (message.method === 'signTypedMessage' || 
            message.method === 'eth_signTypedData_v4' ||
            (message.data && message.data.method === 'signTypedMessage')) {
          
          console.log('[KaiSign-Safe] Safe signature detected');
          
          // Extract typed data from the message
          const typedData = message.params?.typedData || 
                           message.data?.params?.typedData || 
                           message.typedData ||
                           message.params?.[1];
          
          if (typedData) {
            handleSafeSignatureRequest(typedData, 'Safe User', 'Safe PostMessage');
          }
        }
      }
      
      return originalPostMessage.apply(this, arguments);
    };
    
    window._kaisignSafeMessageHooked = true;
  }
  
  // Hook addEventListener for Safe events
  if (!window._kaisignSafeEventHooked) {
    const originalAddEventListener = window.addEventListener;
    
    window.addEventListener = function(type, listener, options) {
      // Wrap the original listener to intercept Safe events
      if (typeof listener === 'function') {
        const wrappedListener = function(event) {
          // Check if this is a Safe-related event
          if (event && event.data && (
            event.data.method === 'signTypedMessage' ||
            event.data.method === 'eth_signTypedData_v4' ||
            (event.data.params && event.data.params.typedData)
          )) {
            
            const typedData = event.data.params?.typedData || event.data.typedData;
            if (typedData) {
              handleSafeSignatureRequest(typedData, 'Safe User', 'Safe Event');
            }
          }
          
          // Call the original listener
          return listener.apply(this, arguments);
        };
        
        return originalAddEventListener.call(this, type, wrappedListener, options);
      }
      
      return originalAddEventListener.call(this, type, listener, options);
    };
    
    window._kaisignSafeEventHooked = true;
  }
  
  // Hook XMLHttpRequest for Safe API calls
  if (!window._kaisignSafeXHRHooked) {
    const originalXHRSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.send = function(data) {
      // Check if this XHR is to Safe API and contains signature data
      if (this._url && this._url.includes('safe') && data) {
        
        try {
          const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
          if (parsedData && parsedData.signature) {
          }
        } catch (e) {
          // Not JSON, that's okay
        }
      }
      
      return originalXHRSend.apply(this, arguments);
    };
    
    // Also hook open to capture URL
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
      this._url = url;
      return originalXHROpen.apply(this, arguments);
    };
    
    window._kaisignSafeXHRHooked = true;
  }
  
  // CRITICAL: Hook into Safe's signature confirmation flow
  if (isSafeApp()) {
    // Safe app detected - monitoring will be handled by existing Safe hooks
  }
}



