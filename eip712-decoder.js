/**
 * EIP-712 Decoder - Subgraph Only
 * Parse and format typed structured data using metadata from subgraph
 * NO HARDCODED CONTRACT ADDRESSES - all detection via metadata
 */

// Guard against duplicate loading (MAIN world scripts can run multiple times)
if (window.formatEIP712Display) {
  console.log('[KaiSign] EIP-712 decoder already loaded, skipping');
} else {

console.log('[KaiSign] Loading EIP-712 decoder (subgraph-only)...');

// Cache for EIP-712 metadata
const eip712MetadataCache = new Map();

/**
 * Get EIP-712 metadata from subgraph
 * @param {string} verifyingContract - Verifying contract address
 * @param {string} primaryType - Primary type (e.g., "PermitSingle", "Order")
 * @returns {Promise<Object|null>} Metadata or null
 */
async function getEIP712Metadata(verifyingContract, primaryType) {
  const cacheKey = `${verifyingContract}-${primaryType}`;

  // Check cache first
  if (eip712MetadataCache.has(cacheKey)) {
    return eip712MetadataCache.get(cacheKey);
  }

  try {
    if (!window.metadataService) {
      return null;
    }

    const metadata = await window.metadataService.getEIP712Metadata(verifyingContract, primaryType);

    if (metadata) {
      eip712MetadataCache.set(cacheKey, metadata);
      return metadata;
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Extract dapp name from current page hostname
 * @returns {string|null} Capitalized dapp name or null
 */
function getDappName() {
  try {
    const hostname = window.location.hostname;
    // Remove common prefixes
    const clean = hostname.replace(/^(app\.|www\.|beta\.|staging\.|swap\.|trade\.|v2\.|v3\.)/, '');
    // Get the domain name (before TLD)
    const parts = clean.split('.');
    if (parts.length < 2) return null;
    const name = parts[0].toLowerCase();

    // Known dapp brand names for proper casing/full names
    const knownDapps = {
      'cow': 'CoW Swap',
      'uniswap': 'Uniswap',
      'sushiswap': 'SushiSwap',
      'sushi': 'SushiSwap',
      'aave': 'Aave',
      'compound': 'Compound',
      'curve': 'Curve',
      'balancer': 'Balancer',
      'pancakeswap': 'PancakeSwap',
      'paraswap': 'ParaSwap',
      '1inch': '1inch',
      'lifi': 'LI.FI',
      'stargate': 'Stargate',
      'opensea': 'OpenSea',
      'blur': 'Blur',
      'rarible': 'Rarible',
      'morpho': 'Morpho',
      'pendle': 'Pendle',
      'eigenlayer': 'EigenLayer',
      'lido': 'Lido',
      'rocketpool': 'Rocket Pool',
      'maker': 'Maker',
      'spark': 'Spark',
      'sky': 'Sky',
      'across': 'Across',
      'hop': 'Hop',
      'synapse': 'Synapse',
      'aerodrome': 'Aerodrome',
      'velodrome': 'Velodrome',
      'gmx': 'GMX',
      'dydx': 'dYdX',
      'kwenta': 'Kwenta',
      'zapper': 'Zapper',
      'zerion': 'Zerion',
      'safe': 'Safe',
      'gnosis': 'Gnosis',
      'ens': 'ENS',
      'chainlink': 'Chainlink',
    };

    return knownDapps[name] || name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return null;
  }
}

/**
 * Resolve a token path from metadata field params to a token address
 * @param {string} tokenPath - Path like "$.domain.verifyingContract" or "#.message.token"
 * @param {Object} typedData - Full EIP-712 typed data
 * @returns {string|null} Token address
 */
function resolveTokenPath(tokenPath, typedData) {
  if (!tokenPath) return null;

  // Handle domain references
  if (tokenPath === '$.domain.verifyingContract' || tokenPath === '#.domain.verifyingContract') {
    return typedData?.domain?.verifyingContract || null;
  }

  // Handle message field references
  const message = typedData?.message;
  if (!message) return null;

  return resolveFieldPath(message, tokenPath);
}

const MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
const MAX_UINT160 = '1461501637330902918203684832716283019655932542975';

/**
 * Apply formatting to a single EIP-712 field based on its format spec
 * @param {any} rawValue - Raw field value
 * @param {Object} fieldSpec - Field spec from metadata {label, path, format, params}
 * @param {Object} typedData - Full EIP-712 typed data
 * @returns {Promise<Object>} Formatted field {value, rawAddress?, isRisk?, tokenSymbol?}
 */
async function applyEIP712FieldFormat(rawValue, fieldSpec, typedData) {
  const format = fieldSpec.format || 'raw';

  switch (format) {
    case 'address': {
      const addr = String(rawValue || '');
      const result = { value: addr, rawAddress: addr };

      // Try to resolve contract name
      const chainId = typedData?.domain?.chainId || 1;
      if (window.metadataService && addr) {
        try {
          const meta = await window.metadataService.getContractMetadata(addr, chainId);
          if (meta?.metadata?.owner) {
            result.value = `${meta.metadata.owner} (${addr.slice(0, 8)}...${addr.slice(-6)})`;
            result.contractName = meta.metadata.owner;
          }
        } catch { /* ignore */ }
      }
      return result;
    }

    case 'amount': {
      const strVal = String(rawValue || '0');
      const result = { value: strVal };

      // Check for unlimited amounts
      if (strVal === MAX_UINT256 || strVal === MAX_UINT160) {
        result.value = 'Unlimited';
        result.isRisk = true;
      }

      // Try to resolve token for symbol and decimals
      const tokenPath = fieldSpec.params?.tokenPath;
      if (tokenPath) {
        const tokenAddr = resolveTokenPath(tokenPath, typedData);
        if (tokenAddr && window.metadataService) {
          const chainId = typedData?.domain?.chainId || 1;
          try {
            const tokenMeta = await Promise.race([
              window.metadataService.getTokenMetadata(tokenAddr, chainId),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
            ]);
            if (tokenMeta) {
              const symbol = tokenMeta.symbol || '';
              result.tokenSymbol = symbol;

              if (result.isRisk) {
                result.value = symbol ? `Unlimited ${symbol}` : 'Unlimited';
              } else if (tokenMeta.decimals !== undefined) {
                // Format with decimals
                const decimals = parseInt(tokenMeta.decimals);
                const raw = BigInt(strVal);
                const divisor = BigInt(10) ** BigInt(decimals);
                const whole = raw / divisor;
                const frac = raw % divisor;
                const fullFrac = frac.toString().padStart(decimals, '0');
                const firstSig = fullFrac.search(/[1-9]/);
                let fracStr;
                if (firstSig === -1) {
                  fracStr = '';
                } else {
                  fracStr = fullFrac.slice(0, firstSig + 5).replace(/0+$/, '');
                }
                const formatted = fracStr ? `${whole}.${fracStr}` : whole.toString();
                result.value = symbol ? `${formatted} ${symbol}` : formatted;
              } else if (symbol) {
                result.value = `${strVal} ${symbol}`;
              }
            }
          } catch { /* timeout or error, use raw value */ }
        }
      }
      return result;
    }

    case 'timestamp': {
      const num = parseInt(String(rawValue));
      if (isNaN(num) || num === 0) {
        return { value: 'Immediately' };
      }
      if (num > 4102444800) {
        return { value: 'Never expires' };
      }
      return { value: new Date(num * 1000).toLocaleString() };
    }

    case 'integer': {
      return { value: String(rawValue) };
    }

    default: {
      return { value: String(rawValue ?? '') };
    }
  }
}

/**
 * Format EIP-712 typed data for display using metadata
 * @param {Object} typedData - The EIP-712 typed data
 * @param {Object} metadata - ERC-7730 metadata from subgraph
 * @returns {Promise<Object>} Formatted display data
 */
async function formatEIP712Display(typedData, metadata) {
  const primaryType = typedData.primaryType;
  const domain = typedData.domain || {};
  const message = typedData.message || {};

  // Extract display format from metadata
  const formats = metadata?.display?.formats || {};
  const format = formats[primaryType] || {};

  // Build display data
  const displayData = {
    primaryType: primaryType,
    domainName: domain.name || 'Unknown',
    domainVersion: domain.version || '',
    verifyingContract: domain.verifyingContract || '',
    chainId: domain.chainId || '',
    intent: format.intent || `Sign ${primaryType}`,
    fields: [],
    nestedIntents: []
  };

  // Format fields according to metadata, applying field-level formatting
  if (format.fields && Array.isArray(format.fields)) {
    for (const fieldSpec of format.fields) {
      const rawValue = resolveFieldPath(message, fieldSpec.path);
      const formatted = await applyEIP712FieldFormat(rawValue, fieldSpec, typedData);

      displayData.fields.push({
        label: fieldSpec.label || fieldSpec.path,
        value: formatted.value,
        rawValue: rawValue,
        rawAddress: formatted.rawAddress || null,
        format: fieldSpec.format || 'raw',
        isRisk: formatted.isRisk || false,
        tokenSymbol: formatted.tokenSymbol || null,
        contractName: formatted.contractName || null,
        path: fieldSpec.path
      });
    }
  }

  // For Permit-like types, build contextual intent from formatted fields
  if (primaryType === 'Permit' || primaryType === 'PermitSingle' || primaryType === 'PermitBatch') {
    const amountField = displayData.fields.find(f => f.path === 'value' || f.label === 'Amount');
    const dappName = getDappName();

    if (amountField && dappName) {
      displayData.intent = `Approve ${amountField.value} for ${dappName}`;
    } else if (amountField) {
      displayData.intent = `Approve ${amountField.value}`;
    }
  }

  // For Order types (CoW Swap / DEX swaps), build swap intent from formatted fields
  if (primaryType === 'Order') {
    const sellField = displayData.fields.find(f => f.path === 'sellAmount');
    const buyField = displayData.fields.find(f => f.path === 'buyAmount');
    const dappName = getDappName();
    if (sellField && buyField) {
      const dappSuffix = dappName ? ` on ${dappName}` : '';
      displayData.intent = `Swap ${sellField.value} → ${buyField.value}${dappSuffix}`;
    }
    // Store token symbols for details grid
    const sellTokenField = displayData.fields.find(f => f.path === 'sellToken');
    const buyTokenField = displayData.fields.find(f => f.path === 'buyToken');
    if (sellTokenField?.tokenSymbol) displayData.sellSymbol = sellTokenField.tokenSymbol;
    if (buyTokenField?.tokenSymbol) displayData.buySymbol = buyTokenField.tokenSymbol;
  }

  return displayData;
}

/**
 * Resolve field path (e.g., "#.message.details.token" => message.details.token)
 * @param {Object} data - Data object
 * @param {string} path - JSONPath-like path
 * @returns {any} Resolved value
 */
function resolveFieldPath(data, path) {
  if (!path) return null;

  // Remove # prefix if present
  const cleanPath = path.startsWith('#.message.') ? path.slice(10) :
                    path.startsWith('$.message.') ? path.slice(10) :
                    path.startsWith('#.') ? path.slice(2) :
                    path.startsWith('$.') ? path.slice(2) :
                    path;

  const parts = cleanPath.split('.');
  let value = data;

  for (const part of parts) {
    if (value === null || value === undefined) return null;
    value = value[part];
  }

  return value;
}

// Expose globally
window.getEIP712Metadata = getEIP712Metadata;
window.formatEIP712Display = formatEIP712Display;
window.getDappName = getDappName;

console.log('[KaiSign] EIP-712 decoder ready (subgraph-only)');

} // End of duplicate-load guard
