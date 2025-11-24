// KaiSign metadata service - EXACT same approach as Snaps repo
console.log('[KaiSign] Loading metadata service...');

const SUBGRAPH_URL = 'https://api.studio.thegraph.com/query/117022/kaisign-subgraph/version/latest';
const BLOBSCAN_URL = 'https://api.sepolia.blobscan.com';

// Metadata cache
const metadataCache = {};

// Get contract metadata
async function getContractMetadata(contractAddress, chainId) {
  const normalizedAddress = contractAddress.toLowerCase();
  const cacheKey = `${normalizedAddress}-${chainId}`;
  
  console.log(`[Metadata] ===== METADATA FETCH =====`);
  console.log(`[Metadata] Contract: ${normalizedAddress}`);
  console.log(`[Metadata] ChainId: ${chainId}`);
  console.log(`[Metadata] Cache key: ${cacheKey}`);
  
  if (metadataCache[cacheKey]) {
    console.log(`[Metadata] ✅ Cache hit for ${cacheKey}`);
    return metadataCache[cacheKey];
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