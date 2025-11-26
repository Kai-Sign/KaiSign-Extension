// KaiSign metadata service - EXACT same approach as Snaps repo
console.log('[KaiSign] Loading metadata service...');

// =============================================================================
// METADATA SOURCE CONFIGURATION - LOCAL SWITCH
// =============================================================================
const USE_LOCAL_METADATA = true; // Set to true to use local files instead of subgraph/blobs
const LOCAL_METADATA_PATH = './local-metadata'; // Path to local metadata files

const SUBGRAPH_URL = 'https://api.studio.thegraph.com/query/117022/kaisign-subgraph/version/latest';
const BLOBSCAN_URL = 'https://api.sepolia.blobscan.com';

// Local metadata contract mapping (when USE_LOCAL_METADATA = true)
const LOCAL_CONTRACT_METADATA = {
  // KaiSign contracts
  '0x4dfea0c2b472a14cd052a8f9df9f19fa5cf03719': 'local-poap.json', // Use actual copied file
  
  // Universal Router (from your transaction)
  '0x66a9893cc07d91d95644aedd05d03f95e1dba8af': 'uniswap-v4/universal-router/v4-swap.json',
  
  // Uniswap V4 contracts
  '0x000000000004444c5dc75cb358380d2e3de08a90': 'uniswap-v4/pool-manager/metadata.json',
  '0x1f98400000000000000000000000000000000004': 'uniswap-v4/pool-manager/metadata.json',
  '0x9a13f98cb987694c9f086b1f5eb990eea8264ec3': 'uniswap-v4/pool-manager/metadata.json',
  '0x498581ff718922c3f8e6a244956af099b2652b2b': 'uniswap-v4/pool-manager/metadata.json',
  '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e': 'uniswap-v4/position-manager/metadata.json',
  '0x3d4e44eb1374240ce5f1b871ab261cd16335b76a': 'uniswap-v4/quoter/metadata.json',
  '0x2e234dae75c793f67a35089c9d99245e1c58470b': 'uniswap-v4/state-view/metadata.json',
  
  // ERC-20 Tokens (all from Snaps)
  '0xa0b86a33e6fe4c6b25e6e6f24a7d7a72d9f2e3c6': 'tokens/usdc.json',
  '0x6b175474e89094c44da98b954eedeac495271d0f': 'tokens/dai.json',
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'tokens/usdc.json', // USDC from your transaction
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 'tokens/usdt.json',
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'tokens/usdc.json', // WETH fallback to USDC format
  '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': 'tokens/aave.json',
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'tokens/btc.json',
  '0xc00e94cb662c3520282e6f5717214004a7f26888': 'tokens/comp.json',
  '0xd533a949740bb3306d119cc777fa900ba034cd52': 'tokens/crv.json',
  '0x5a98fecbea516cf06857215779fd812ca3bef1b3': 'tokens/ldo.json',
  '0x514910771af9ca656af840dff83e8264ecf986ca': 'tokens/link.json',
  '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0': 'tokens/matic.json',
  '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2': 'tokens/mkr.json',
  '0x4200000000000000000000000000000000000042': 'tokens/op.json',
  '0x6982508145454ce325ddbe47a25d4ec3d2311933': 'tokens/pepe.json',
  '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce': 'tokens/shib.json',
  '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f': 'tokens/snx.json',
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': 'tokens/uni.json',
  
  // 1inch Aggregation Router
  '0x1111111254eeb25477b68fb85ed929f73a960582': 'common-AggregationRouterV6.json',
  
  // POAP Bridge
  '0xa4e7b93bb9e9ed78046e3bb6d33e2d9b8bf86e1f': 'poap/poap-bridge/metadata.json'
};

console.log(`[Metadata] Source mode: ${USE_LOCAL_METADATA ? 'LOCAL' : 'REMOTE (subgraph+blobs)'}`);
if (USE_LOCAL_METADATA) {
  console.log(`[Metadata] Local contracts mapped: ${Object.keys(LOCAL_CONTRACT_METADATA).length}`);
}

// Metadata cache
const metadataCache = {};

// =============================================================================
// LOCAL METADATA LOADING FUNCTIONS
// =============================================================================

async function loadLocalMetadata(contractAddress, chainId) {
  try {
    const metadataFile = LOCAL_CONTRACT_METADATA[contractAddress];
    if (!metadataFile) {
      console.log(`[Metadata] No local mapping for contract: ${contractAddress}`);
      return null;
    }
    
    const filePath = `${LOCAL_METADATA_PATH}/${metadataFile}`;
    console.log(`[Metadata] Loading local metadata: ${filePath}`);
    
    try {
      // Try to fetch the file (works in browser environment)
      const response = await fetch(filePath);
      if (!response.ok) {
        console.log(`[Metadata] Local file not found: ${response.status}`);
        return null;
      }
      
      const metadata = await response.json();
      console.log(`[Metadata] ✅ Loaded local metadata from ${filePath}`);
      console.log(`[Metadata] Metadata keys:`, Object.keys(metadata));
      
      return metadata;
      
    } catch (fetchError) {
      console.log(`[Metadata] Local file fetch failed:`, fetchError.message);
      return null;
    }
    
  } catch (error) {
    console.error(`[Metadata] Error loading local metadata:`, error);
    return null;
  }
}

// Switch configuration functions
window.useLocalMetadata = function() {
  console.log('🔄 To use LOCAL metadata: Set USE_LOCAL_METADATA = true and reload');
};

window.useRemoteMetadata = function() {
  console.log('🔄 To use REMOTE metadata: Set USE_LOCAL_METADATA = false and reload');
};

window.getMetadataConfig = function() {
  return {
    mode: USE_LOCAL_METADATA ? 'LOCAL' : 'REMOTE',
    localPath: LOCAL_METADATA_PATH,
    contractsMapped: Object.keys(LOCAL_CONTRACT_METADATA).length,
    cache: Object.keys(metadataCache).length
  };
};

// Expose contract mapping for testing
window.LOCAL_CONTRACT_METADATA = LOCAL_CONTRACT_METADATA;

// Get contract metadata
async function getContractMetadata(contractAddress, chainId) {
  const normalizedAddress = contractAddress.toLowerCase();
  const cacheKey = `${normalizedAddress}-${chainId}`;
  
  console.log(`[Metadata] ===== METADATA FETCH =====`);
  console.log(`[Metadata] Contract: ${normalizedAddress}`);
  console.log(`[Metadata] ChainId: ${chainId}`);
  console.log(`[Metadata] Cache key: ${cacheKey}`);
  console.log(`[Metadata] Source: ${USE_LOCAL_METADATA ? 'LOCAL' : 'REMOTE'}`);
  
  if (metadataCache[cacheKey]) {
    console.log(`[Metadata] ✅ Cache hit for ${cacheKey}`);
    return metadataCache[cacheKey];
  }
  
  // LOCAL METADATA MODE - Check for local files first
  if (USE_LOCAL_METADATA) {
    console.log(`[Metadata] 📁 LOCAL MODE - Checking local metadata files`);
    const localMetadata = await loadLocalMetadata(normalizedAddress, chainId);
    if (localMetadata) {
      metadataCache[cacheKey] = localMetadata;
      return localMetadata;
    }
    console.log(`[Metadata] ❌ No local metadata found, falling back to remote`);
  }
  
  try {
    console.log(`[Metadata] 🔍 Querying subgraph for: ${normalizedAddress}`);
    
    // Query subgraph for blob hash
    const query = {
      query: `{ 
        specs(where: {targetContract: "${normalizedAddress}"}) { 
          blobHash 
          targetContract 
          status 
        } 
      }`
    };
    
    const response = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      mode: 'cors',
      body: JSON.stringify(query)
    });
    
    if (!response.ok) {
      console.log(`[Metadata] Subgraph error: ${response.status}`);
      return null;
    }
    
    const result = await response.json();
    
    // Get FINALIZED spec, not just first one
    const finalizedSpec = result.data?.specs?.find(spec => spec.status === 'FINALIZED');
    const blobHash = finalizedSpec?.blobHash;
    
    if (!blobHash) {
      console.log(`[Metadata] No blob hash found for ${normalizedAddress}`);
      return null;
    }
    
    console.log(`[Metadata] Found blob hash: ${blobHash}`);
    
    // Get blob storage URLs
    const blobResponse = await fetch(`${BLOBSCAN_URL}/blobs/${blobHash}`, {
      mode: 'cors'
    });
    if (!blobResponse.ok) {
      console.log(`[Metadata] Blobscan error: ${blobResponse.status}`);
      return null;
    }
    
    const blobData = await blobResponse.json();
    const swarmUrl = blobData.dataStorageReferences?.find(ref => ref.storage === 'swarm')?.url;
    const googleUrl = blobData.dataStorageReferences?.find(ref => ref.storage === 'google')?.url;
    const storageUrl = swarmUrl || googleUrl;
    
    if (!storageUrl) {
      console.log(`[Metadata] No storage URL found for blob ${blobHash}`);
      return null;
    }
    
    console.log(`[Metadata] Fetching from storage: ${storageUrl}`);
    
    const metadataResponse = await fetch(storageUrl, {
      mode: 'cors'
    });
    if (!metadataResponse.ok) {
      console.log(`[Metadata] Storage fetch error: ${metadataResponse.status}`);
      return null;
    }
    
    // Handle blob data - it might be hex-encoded or have null bytes
    let rawData = await metadataResponse.text();
    
    // Remove null bytes if present  
    rawData = rawData.replace(/\0/g, '');
    
    // Try to parse as JSON
    let metadata;
    try {
      metadata = JSON.parse(rawData);
      console.log(`[Metadata] Successfully parsed metadata for ${normalizedAddress}`);
    } catch (parseError) {
      console.log(`[Metadata] JSON parse error:`, parseError.message);
      console.log(`[Metadata] Raw data sample:`, rawData.substring(0, 200));
      return null;
    }
    
    // Cache it
    metadataCache[cacheKey] = metadata;
    return metadata;
    
  } catch (error) {
    console.error(`[Metadata] Error fetching metadata:`, error);
    
    // If remote fetch failed and we haven't tried local yet, try local metadata as fallback
    if (!USE_LOCAL_METADATA && (error.message.includes('CSP') || error.message.includes('violates') || error.message.includes('Failed to fetch'))) {
      console.log(`[Metadata] 🔄 CSP/Network error detected, trying local metadata fallback...`);
      const localMetadata = await loadLocalMetadata(normalizedAddress, chainId);
      if (localMetadata) {
        console.log(`[Metadata] ✅ Found fallback local metadata`);
        metadataCache[cacheKey] = localMetadata;
        return localMetadata;
      }
      console.log(`[Metadata] ❌ No local fallback metadata available`);
    }
    
    return null;
  }
}

// Extract function selector
function extractFunctionSelector(data) {
  if (!data || typeof data !== 'string') return null;
  if (!data.startsWith('0x')) data = '0x' + data;
  if (data.length < 10) return null;
  return data.slice(0, 10).toLowerCase();
}

// Helper function for title case
function toTitleCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Make everything available globally (SAME as Snaps repo)
window.metadataService = {
  getContractMetadata: getContractMetadata
};

window.extractFunctionSelector = extractFunctionSelector;
window.toTitleCase = toTitleCase;

console.log('[KaiSign] Metadata service ready');