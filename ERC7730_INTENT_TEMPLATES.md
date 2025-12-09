# ERC-7730 Intent Template Extension

## Proposed Extension: Dynamic Intent Templates with Nested Bytecode Parsing

This document describes a proposed extension to the ERC-7730 standard to support:
1. Dynamic intent strings with parameter substitution
2. Nested bytecode parsing for complex parameters like `bytes` and `bytes[]`
3. Command registry references for protocols like Universal Router
4. **Required improvements to eliminate all hardcoded logic in decoders**

---

## Part 1: Simple Template Variables

### Current ERC-7730 Intent Format

Currently, ERC-7730 uses either:

1. **Static text in format array:**
```json
"intent": {
  "format": [
    {
      "type": "container",
      "format": "card",
      "fields": [
        {
          "type": "text",
          "value": "Execute via Universal Router",
          "format": "heading2"
        }
      ]
    }
  ]
}
```

2. **Simple static string:**
```json
"intent": "Approve Spending"
```

### Proposed Extension: Template Variables

Add support for `{paramName}` syntax in intent strings to dynamically insert decoded parameter values:

```json
"intent": "Approve {amount} for {spender}"
```

### Syntax

| Pattern | Description | Example Result |
|---------|-------------|----------------|
| `{paramName}` | Substitutes raw parameter value | `{amount}` → `1000000` |
| `{paramName:label}` | Substitutes the field label | `{amount:label}` → `Amount` |

### Example: Permit2 approve()

**Metadata:**
```json
{
  "$schema": "../../erc7730-v1.schema.json",
  "context": {
    "contract": {
      "abi": [
        {
          "type": "function",
          "name": "approve",
          "selector": "0x87517c45",
          "inputs": [
            {"name": "token", "type": "address"},
            {"name": "spender", "type": "address"},
            {"name": "amount", "type": "uint160"},
            {"name": "expiration", "type": "uint48"}
          ],
          "outputs": []
        }
      ]
    }
  },
  "display": {
    "formats": {
      "approve(address,address,uint160,uint48)": {
        "intent": "Approve {amount} for {spender}",
        "fields": [
          {
            "path": "token",
            "label": "Token",
            "format": "addressName"
          },
          {
            "path": "spender",
            "label": "Spender",
            "format": "addressName"
          },
          {
            "path": "amount",
            "label": "Amount",
            "format": "amount"
          }
        ]
      }
    }
  }
}
```

**Result:**
- Input: `approve(0xA0b8...eb48, 0x3fC9...7fad, 1000000000, 1735689600)`
- Intent: `"Approve 1000000000 for 0x3fC9...7fad"`

---

## Part 2: Nested Bytecode Parsing

### The Problem

Protocols like Uniswap's Universal Router use complex encoded parameters:

```solidity
function execute(bytes commands, bytes[] inputs, uint256 deadline)
```

- `commands`: Each byte is a command ID (0x00 = V3_SWAP_EXACT_IN, 0x0b = WRAP_ETH, etc.)
- `inputs`: Array of ABI-encoded parameters for each command

Simple template substitution cannot parse these nested structures. We need metadata that describes how to decode them.

### Proposed Solution: `nestedEncoding` Field

Add a new `nestedEncoding` field to describe how to parse complex `bytes` and `bytes[]` parameters:

```json
{
  "display": {
    "formats": {
      "execute(bytes,bytes[],uint256)": {
        "intent": "{decodedCommands:summary}",
        "fields": [
          {
            "path": "commands",
            "label": "Commands",
            "nestedEncoding": {
              "type": "commandArray",
              "registry": "universalRouterCommands",
              "decodeWith": "inputs"
            }
          }
        ]
      }
    }
  }
}
```

### Schema Definition

#### `nestedEncoding` Object

```typescript
interface NestedEncoding {
  // How to interpret the bytes data
  type: "commandArray" | "abiEncoded" | "packedEncoded" | "custom";

  // Reference to command/type definitions
  registry?: string;

  // Another parameter that provides decoding data
  decodeWith?: string;

  // For abiEncoded type: the ABI types to decode
  abiTypes?: string[];

  // Custom decoder function name (for complex cases)
  decoder?: string;
}
```

#### `commandRegistry` Object

Define command registries that map byte codes to their definitions:

```json
{
  "commandRegistries": {
    "universalRouterCommands": {
      "0x00": {
        "name": "V3_SWAP_EXACT_IN",
        "intent": "Swap",
        "category": "swap",
        "inputs": [
          {"name": "recipient", "type": "address"},
          {"name": "amountIn", "type": "uint256"},
          {"name": "amountOutMin", "type": "uint256"},
          {"name": "path", "type": "bytes"},
          {"name": "payerIsUser", "type": "bool"}
        ]
      },
      "0x0b": {
        "name": "WRAP_ETH",
        "intent": "Wrap ETH",
        "category": "wrap",
        "inputs": [
          {"name": "recipient", "type": "address"},
          {"name": "amountMin", "type": "uint256"}
        ]
      },
      "0x0c": {
        "name": "UNWRAP_WETH",
        "intent": "Unwrap WETH",
        "category": "unwrap",
        "inputs": [
          {"name": "recipient", "type": "address"},
          {"name": "amountMin", "type": "uint256"}
        ]
      }
    }
  }
}
```

### Complete Universal Router Metadata Example

```json
{
  "$schema": "../../erc7730-v1.schema.json",
  "context": {
    "contract": {
      "abi": [
        {
          "type": "function",
          "name": "execute",
          "selector": "0x3593564c",
          "inputs": [
            {"name": "commands", "type": "bytes"},
            {"name": "inputs", "type": "bytes[]"},
            {"name": "deadline", "type": "uint256"}
          ]
        }
      ]
    }
  },
  "commandRegistries": {
    "universalRouterCommands": {
      "0x00": {
        "name": "V3_SWAP_EXACT_IN",
        "intent": "Swap {amountIn} for minimum {amountOutMin}",
        "category": "swap",
        "inputs": [
          {"name": "recipient", "type": "address"},
          {"name": "amountIn", "type": "uint256", "format": "tokenAmount"},
          {"name": "amountOutMin", "type": "uint256", "format": "tokenAmount"},
          {"name": "path", "type": "bytes", "nestedEncoding": {"type": "uniswapPath"}},
          {"name": "payerIsUser", "type": "bool"}
        ]
      },
      "0x01": {
        "name": "V3_SWAP_EXACT_OUT",
        "intent": "Swap for exactly {amountOut}",
        "category": "swap",
        "inputs": [
          {"name": "recipient", "type": "address"},
          {"name": "amountOut", "type": "uint256", "format": "tokenAmount"},
          {"name": "amountInMax", "type": "uint256", "format": "tokenAmount"},
          {"name": "path", "type": "bytes", "nestedEncoding": {"type": "uniswapPath"}},
          {"name": "payerIsUser", "type": "bool"}
        ]
      },
      "0x08": {
        "name": "V2_SWAP_EXACT_IN",
        "intent": "Swap {amountIn} via V2",
        "category": "swap",
        "inputs": [
          {"name": "recipient", "type": "address"},
          {"name": "amountIn", "type": "uint256", "format": "tokenAmount"},
          {"name": "amountOutMin", "type": "uint256", "format": "tokenAmount"},
          {"name": "path", "type": "address[]"},
          {"name": "payerIsUser", "type": "bool"}
        ]
      },
      "0x0b": {
        "name": "WRAP_ETH",
        "intent": "Wrap {amountMin} ETH to WETH",
        "category": "wrap",
        "inputs": [
          {"name": "recipient", "type": "address"},
          {"name": "amountMin", "type": "uint256", "format": "ethAmount"}
        ]
      },
      "0x0c": {
        "name": "UNWRAP_WETH",
        "intent": "Unwrap {amountMin} WETH to ETH",
        "category": "unwrap",
        "inputs": [
          {"name": "recipient", "type": "address"},
          {"name": "amountMin", "type": "uint256", "format": "ethAmount"}
        ]
      },
      "0x04": {
        "name": "SWEEP",
        "intent": "Sweep {token} to {recipient}",
        "category": "cleanup",
        "inputs": [
          {"name": "token", "type": "address", "format": "tokenSymbol"},
          {"name": "recipient", "type": "address"},
          {"name": "amountMin", "type": "uint256"}
        ]
      }
    }
  },
  "display": {
    "formats": {
      "execute(bytes,bytes[],uint256)": {
        "intent": {
          "type": "composite",
          "source": "commands",
          "separator": " + ",
          "template": "{decodedCommands}"
        },
        "fields": [
          {
            "path": "commands",
            "label": "Commands",
            "nestedEncoding": {
              "type": "commandArray",
              "registry": "universalRouterCommands",
              "decodeWith": "inputs"
            }
          },
          {
            "path": "inputs",
            "label": "Command Inputs",
            "format": "hidden"
          },
          {
            "path": "deadline",
            "label": "Deadline",
            "format": "timestamp"
          }
        ]
      }
    }
  }
}
```

### Composite Intent Types

For functions that execute multiple sub-operations, use a `composite` intent:

```json
"intent": {
  "type": "composite",
  "source": "commands",
  "separator": " + ",
  "template": "{decodedCommands}"
}
```

| Field | Description |
|-------|-------------|
| `type` | Must be `"composite"` |
| `source` | The parameter containing sub-operations |
| `separator` | How to join multiple intents (e.g., `" + "`, `", "`) |
| `template` | Template with `{decodedCommands}` placeholder |
| `maxDisplay` | Optional: Maximum number of operations to show |
| `overflow` | Optional: Text when exceeding maxDisplay (e.g., `"and {count} more"`) |

### Expected Output

Given a Universal Router transaction with commands `0x0b` (WRAP_ETH) + `0x00` (V3_SWAP_EXACT_IN):

**Input calldata:**
```
0x3593564c  // execute selector
00...0b00   // commands: WRAP_ETH + V3_SWAP_EXACT_IN
[...]       // inputs array
[deadline]
```

**Decoded intent:**
```
"Wrap 1.5 ETH to WETH + Swap 1.5 WETH for minimum 3000 USDC"
```

---

## Part 3: Implementation Specification

### Decoder Algorithm

```
function decodeWithNestedEncoding(data, metadata):
  1. Decode top-level ABI parameters
  2. For each field with nestedEncoding:
     a. If type == "commandArray":
        - Iterate each byte in commands parameter
        - For each command byte:
          i. Look up command in registry
          ii. Get corresponding input from inputs[] array
          iii. Decode input using command's inputs ABI
          iv. Substitute values into command's intent template
     b. If type == "abiEncoded":
        - Decode using abiTypes
     c. If type == "packedEncoded":
        - Decode packed encoding
  3. Build composite intent from decoded sub-operations
  4. Return final intent string
```

### Uniswap V3 Path Decoding

For `path` parameters with `nestedEncoding: {"type": "uniswapPath"}`:

```
Uniswap V3 path encoding:
[token0 (20 bytes)][fee (3 bytes)][token1 (20 bytes)][fee (3 bytes)][token2 (20 bytes)]...

Example: WETH -> 0.3% -> USDC
0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2  // WETH
000bb8                                        // 3000 (0.3%)
0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48  // USDC
```

Decoded path intent: `"WETH → USDC (0.3%)"`

### Format Types for Nested Values

| Format | Description | Example |
|--------|-------------|---------|
| `tokenAmount` | Wei to human with symbol | `1500000000000000000` → `"1.5 WETH"` |
| `ethAmount` | Wei to ETH | `1500000000000000000` → `"1.5 ETH"` |
| `tokenSymbol` | Address to symbol | `0xC02...` → `"WETH"` |
| `timestamp` | Unix to human date | `1735689600` → `"Jan 1, 2025"` |
| `uniswapPath` | Path bytes to route | See above |
| `hidden` | Don't display | (used for internal data) |

---

## Part 4: Additional Nested Encoding Types

### Safe Multisend Decoding

For Safe's `multiSend(bytes transactions)`:

```json
{
  "commandRegistries": {
    "safeOperations": {
      "call": {"intent": "Call {to}"},
      "delegatecall": {"intent": "Delegate to {to}"}
    }
  },
  "display": {
    "formats": {
      "multiSend(bytes)": {
        "intent": {
          "type": "composite",
          "source": "transactions",
          "separator": " + "
        },
        "fields": [
          {
            "path": "transactions",
            "nestedEncoding": {
              "type": "safeMultiSend",
              "itemFormat": [
                {"name": "operation", "type": "uint8", "size": 1},
                {"name": "to", "type": "address", "size": 20},
                {"name": "value", "type": "uint256", "size": 32},
                {"name": "dataLength", "type": "uint256", "size": 32},
                {"name": "data", "type": "bytes", "sizeFrom": "dataLength"}
              ],
              "intentField": "data",
              "recursive": true
            }
          }
        ]
      }
    }
  }
}
```

### Permit2 Batch Operations

For `permit2.permitBatch()`:

```json
{
  "display": {
    "formats": {
      "permitBatch((address,uint160,uint48,uint48)[],address,uint256,bytes)": {
        "intent": {
          "type": "composite",
          "source": "details",
          "template": "Permit {count} tokens for {spender}"
        },
        "fields": [
          {
            "path": "details",
            "nestedEncoding": {
              "type": "tupleArray",
              "itemIntent": "Permit {token} ({amount})"
            }
          }
        ]
      }
    }
  }
}
```

---

## Part 5: Benefits

1. **No hardcoding** - All parsing logic defined in metadata
2. **Protocol agnostic** - Works for any protocol with command-based architecture
3. **Composable** - Sub-operations can be recursively decoded
4. **Human readable** - Users see actual values and operations
5. **Backwards compatible** - Static intents still work

---

## Part 6: Required ERC-7730 Extensions to Eliminate Hardcoded Logic

### Current Hardcoded Elements in Decoders

The following hardcoded elements exist in typical decoder implementations. ERC-7730 needs extensions to make these metadata-driven:

#### 6.1 Hardcoded Contract Address Mappings

**Current hardcoded logic (decode.js:164-177):**
```javascript
// FORBIDDEN - hardcoded contract address
if (contractAddress.toLowerCase() === '0x4dfea0c2b472a14cd052a8f9df9f19fa5cf03719') {
  const selectorToFunction = {
    '0xee5a7f6e': 'commitSpec',
    '0x4c0e5e3c': 'revealSpec',
    '0x82b85b60': 'proposeSpec',
    '0x8f23cc54': 'challengeSpec'
  };
  functionName = selectorToFunction[selector];
}
```

**Required ERC-7730 Extension:**
```json
{
  "context": {
    "contract": {
      "address": "0x4dfea0c2b472a14cd052a8f9df9f19fa5cf03719",
      "selectorFallbacks": {
        "0xee5a7f6e": "commitSpec",
        "0x4c0e5e3c": "revealSpec",
        "0x82b85b60": "proposeSpec",
        "0x8f23cc54": "challengeSpec"
      }
    }
  }
}
```

#### 6.2 Hardcoded Function Selectors

**Current hardcoded logic (content-script.js:131, 217, 322):**
```javascript
// FORBIDDEN - hardcoded selectors
if (!txData.startsWith('0x8d80ff0a')) return null;  // multiSend
selector: '0x3593564c',  // Universal Router execute
```

**Required ERC-7730 Extension - Selector Registry:**
```json
{
  "selectorRegistry": {
    "0x8d80ff0a": {
      "function": "multiSend(bytes)",
      "protocol": "Safe",
      "parser": "safeMultiSend"
    },
    "0x3593564c": {
      "function": "execute(bytes,bytes[],uint256)",
      "protocol": "Universal Router",
      "parser": "universalRouterExecute"
    }
  }
}
```

#### 6.3 Hardcoded Category-Based Intent Formatting

**Current hardcoded logic (content-script.js:541-658):**
```javascript
// FORBIDDEN - hardcoded category switch statements
switch (category) {
  case 'swap':
    // hardcoded swap parsing logic
    break;
  case 'transfer':
  case 'cleanup':
    // hardcoded transfer parsing logic
    break;
}
```

**Required ERC-7730 Extension - Category Parsers:**
```json
{
  "categoryParsers": {
    "swap": {
      "extractFields": [
        {"name": "amountIn", "offset": 64, "size": 64, "type": "uint256"},
        {"name": "fromToken", "scan": "tokenAddress", "position": 0},
        {"name": "toToken", "scan": "tokenAddress", "position": 1}
      ],
      "intentTemplate": "Swap {amountIn} {fromToken} for {toToken}"
    },
    "transfer": {
      "extractFields": [
        {"name": "token", "scan": "tokenAddress", "position": 0},
        {"name": "recipient", "scan": "address", "position": 1}
      ],
      "intentTemplate": "Transfer {token} to {recipient}"
    },
    "wrap": {
      "extractFields": [
        {"name": "amount", "source": "transactionValue", "format": "ethAmount"}
      ],
      "intentTemplate": "Wrap {amount} ETH to WETH"
    },
    "unwrap": {
      "extractFields": [
        {"name": "amount", "offset": 64, "size": 64, "type": "uint256", "format": "ethAmount"}
      ],
      "intentTemplate": "Unwrap {amount} WETH to ETH"
    }
  }
}
```

#### 6.4 Hardcoded Action-Based Formatting

**Current hardcoded logic (content-script.js:835-844):**
```javascript
// FORBIDDEN - hardcoded action checks
if (commandInfo.action === 'wrap' && transactionValue) {
  return `Wrap ${formatEther(transactionValue)} ETH to WETH`;
}
if (commandInfo.action === 'unwrap') {
  return 'Unwrap WETH to ETH';
}
```

**Required ERC-7730 Extension - Action Definitions:**
```json
{
  "actionDefinitions": {
    "wrap": {
      "requiresTransactionValue": true,
      "intentTemplate": "Wrap {transactionValue:ethAmount} ETH to WETH"
    },
    "unwrap": {
      "intentTemplate": "Unwrap WETH to ETH"
    },
    "swap": {
      "intentTemplate": "Swap {fromSymbol} to {toSymbol}"
    }
  }
}
```

#### 6.5 Hardcoded Address Pattern Matching

**Current hardcoded logic (content-script.js:560-563):**
```javascript
// FORBIDDEN - hardcoded address validation patterns
const isAbiOffset = addr.match(/^0x00000000000000000000000000000000000[0-9a-f]{1,5}$/i);
if (!isAbiOffset && addr !== '0x0000000000000000000000000000000000000000') {
```

**Required ERC-7730 Extension - Address Filters:**
```json
{
  "addressFilters": {
    "excludePatterns": [
      "^0x0{24}[0-9a-f]{1,16}$",
      "^0x0{40}$"
    ],
    "excludeAddresses": [
      "0x0000000000000000000000000000000000000000"
    ],
    "minimumAddressValue": "0x100000"
  }
}
```

#### 6.6 Hardcoded Emoji Prefixes

**Current hardcoded logic (content-script.js:679-686):**
```javascript
// FORBIDDEN - hardcoded emoji formatting
return `🔄 Swap ${parsedParams.fromSymbol} to ${parsedParams.toSymbol}`;
return `📤 Transfer ${parsedParams.tokenSymbol}`;
```

**Required ERC-7730 Extension - Intent Styling:**
```json
{
  "intentStyles": {
    "swap": {
      "prefix": "🔄",
      "template": "{prefix} Swap {fromSymbol} to {toSymbol}"
    },
    "transfer": {
      "prefix": "📤",
      "template": "{prefix} Transfer {tokenSymbol}"
    },
    "approval": {
      "prefix": "✅",
      "template": "{prefix} Approve {amount} {token}"
    }
  }
}
```

#### 6.7 Hardcoded ABI for Universal Router

**Current hardcoded logic (content-script.js:173-185):**
```javascript
// FORBIDDEN - hardcoded ABI
const UNIVERSAL_ROUTER_ABI = [
  {
    "inputs": [
      {"name": "commands", "type": "bytes"},
      {"name": "inputs", "type": "bytes[]"},
      {"name": "deadline", "type": "uint256"}
    ],
    "name": "execute",
    ...
  }
];
```

**Required ERC-7730 Extension:**
The ABI should be fetched from metadata context, not hardcoded:
```json
{
  "context": {
    "contract": {
      "abi": [
        {
          "type": "function",
          "name": "execute",
          "selector": "0x3593564c",
          "inputs": [
            {"name": "commands", "type": "bytes"},
            {"name": "inputs", "type": "bytes[]"},
            {"name": "deadline", "type": "uint256"}
          ]
        }
      ]
    }
  }
}
```

### 6.8 Required New Top-Level Schema Fields

To support all the above, ERC-7730 needs these new top-level fields:

```typescript
interface ERC7730Extended {
  // Existing fields
  $schema: string;
  context: Context;
  display: Display;
  metadata?: Metadata;

  // NEW: Command registries for nested bytecode
  commandRegistries?: {
    [registryName: string]: {
      [commandByte: string]: CommandDefinition;
    };
  };

  // NEW: Category-based parsers
  categoryParsers?: {
    [category: string]: CategoryParser;
  };

  // NEW: Action definitions with intent templates
  actionDefinitions?: {
    [action: string]: ActionDefinition;
  };

  // NEW: Address filtering rules
  addressFilters?: AddressFilters;

  // NEW: Intent styling (emojis, prefixes)
  intentStyles?: {
    [category: string]: IntentStyle;
  };

  // NEW: Selector fallbacks for contracts with string ABI references
  selectorFallbacks?: {
    [selector: string]: string;
  };
}

interface CommandDefinition {
  name: string;
  intent: string;  // Template with {param} placeholders
  category: string;
  inputs: ABIInput[];
}

interface CategoryParser {
  extractFields: FieldExtraction[];
  intentTemplate: string;
}

interface FieldExtraction {
  name: string;
  offset?: number;
  size?: number;
  type?: string;
  scan?: "tokenAddress" | "address" | "amount";
  position?: number;
  source?: "transactionValue" | "calldata";
  format?: string;
}

interface ActionDefinition {
  requiresTransactionValue?: boolean;
  intentTemplate: string;
}

interface AddressFilters {
  excludePatterns?: string[];
  excludeAddresses?: string[];
  minimumAddressValue?: string;
}

interface IntentStyle {
  prefix?: string;
  template: string;
}
```

---

## Part 7: Reference Implementation

### decode.js Changes Required

```javascript
/**
 * Decode nested bytecode using metadata definitions
 */
function decodeNestedEncoding(data, encoding, otherParams, registries) {
  switch (encoding.type) {
    case 'commandArray':
      return decodeCommandArray(data, otherParams[encoding.decodeWith], registries[encoding.registry]);
    case 'uniswapPath':
      return decodeUniswapPath(data);
    case 'safeMultiSend':
      return decodeSafeMultiSend(data, encoding);
    case 'tupleArray':
      return decodeTupleArray(data, encoding);
    default:
      return { raw: data };
  }
}

/**
 * Decode Universal Router command array
 */
function decodeCommandArray(commands, inputs, registry) {
  const results = [];
  const commandBytes = hexToBytes(commands);

  for (let i = 0; i < commandBytes.length; i++) {
    const cmdByte = '0x' + commandBytes[i].toString(16).padStart(2, '0');
    const cmdDef = registry[cmdByte];

    if (cmdDef && inputs[i]) {
      const decodedInput = abiDecode(cmdDef.inputs, inputs[i]);
      const intent = substituteIntentTemplate(cmdDef.intent, decodedInput);
      results.push({
        command: cmdDef.name,
        intent: intent,
        params: decodedInput
      });
    }
  }

  return results;
}

/**
 * Build composite intent from decoded operations
 */
function buildCompositeIntent(intentConfig, decodedOperations) {
  const separator = intentConfig.separator || ' + ';
  const intents = decodedOperations.map(op => op.intent);

  if (intentConfig.maxDisplay && intents.length > intentConfig.maxDisplay) {
    const shown = intents.slice(0, intentConfig.maxDisplay);
    const overflow = intentConfig.overflow || `and ${intents.length - intentConfig.maxDisplay} more`;
    return shown.join(separator) + separator + overflow;
  }

  return intents.join(separator);
}

/**
 * Apply category parser from metadata
 */
function applyCategoryParser(data, parser, context) {
  const extracted = {};

  for (const field of parser.extractFields) {
    if (field.offset !== undefined) {
      // Fixed offset extraction
      extracted[field.name] = extractAtOffset(data, field.offset, field.size, field.type);
    } else if (field.scan) {
      // Scan for pattern
      extracted[field.name] = scanForPattern(data, field.scan, field.position);
    } else if (field.source === 'transactionValue') {
      extracted[field.name] = context.transactionValue;
    }

    // Apply format if specified
    if (field.format && extracted[field.name]) {
      extracted[field.name] = applyFormat(extracted[field.name], field.format);
    }
  }

  return substituteIntentTemplate(parser.intentTemplate, extracted);
}

/**
 * Apply intent styling from metadata
 */
function applyIntentStyle(intent, category, styles) {
  const style = styles?.[category];
  if (!style) return intent;

  return substituteIntentTemplate(style.template, {
    prefix: style.prefix || '',
    ...extractIntentParams(intent)
  });
}
```

---

## Part 8: Migration Path

### Step 1: Add Selector Fallbacks to Existing Metadata
For contracts currently using hardcoded selector mappings, add `selectorFallbacks` to their metadata files.

### Step 2: Define Command Registries
Move all hardcoded command byte definitions to `commandRegistries` in protocol metadata.

### Step 3: Define Category Parsers
Extract category-specific parsing logic into metadata-driven `categoryParsers`.

### Step 4: Define Intent Styles
Move emoji prefixes and formatting to `intentStyles` in metadata.

### Step 5: Remove Hardcoded Logic
Once metadata is complete, remove all hardcoded selectors, addresses, and category switches from decoder implementations.

---

## Files Modified

- `decode.js` - Added `substituteIntentTemplate()` function, needs `decodeNestedEncoding()`
- `local-metadata/permit2-metadata.json` - Updated to use template syntax
- `local-metadata/universal-router-metadata.json` - Needs nested encoding definitions
- `metadata.js` - Updated embedded metadata

---

## Future Considerations

1. **Nested recursion limits** - Prevent infinite recursion in nested calls
2. **Gas-efficient encoding** - Support for packed encodings
3. **Cross-contract references** - When a nested call targets a different contract
4. **Error handling** - Graceful degradation when nested decoding fails
5. **Caching** - Cache decoded command registries for performance
6. **Schema validation** - JSON Schema for validating extended ERC-7730 files
7. **Backward compatibility** - Decoders should work with both old and extended schemas
