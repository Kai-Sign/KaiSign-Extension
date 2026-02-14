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
 * Format EIP-712 typed data for display using metadata
 * @param {Object} typedData - The EIP-712 typed data
 * @param {Object} metadata - ERC-7730 metadata from subgraph
 * @returns {Object} Formatted display data
 */
function formatEIP712Display(typedData, metadata) {
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

  // Format fields according to metadata
  if (format.fields && Array.isArray(format.fields)) {
    for (const fieldSpec of format.fields) {
      const fieldValue = resolveFieldPath(message, fieldSpec.path);
      displayData.fields.push({
        label: fieldSpec.label || fieldSpec.path,
        value: fieldValue,
        format: fieldSpec.format || 'raw',
        path: fieldSpec.path
      });
    }
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

console.log('[KaiSign] EIP-712 decoder ready (subgraph-only)');

} // End of duplicate-load guard
