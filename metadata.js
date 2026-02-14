/**
 * KaiSign Metadata Service - Subgraph Only
 * All metadata fetched from subgraph (no local files, no embedded metadata)
 *
 * This file provides backward compatibility wrappers around subgraph-metadata.js
 */

// Guard against duplicate loading (MAIN world scripts can run multiple times)
if (window.__KAISIGN_METADATA_COMPAT_LOADED) {
  // Already loaded, skip
} else {
window.__KAISIGN_METADATA_COMPAT_LOADED = true;

console.log('[KaiSign] Metadata service (subgraph-only) loading...');

// Backward compatibility - expose the metadataService methods globally
// The actual implementation is in subgraph-metadata.js

// Wait for subgraph-metadata.js to initialize
function waitForMetadataService() {
  if (window.metadataService) {
    console.log('[KaiSign] Metadata service ready (using subgraph)');
  } else {
    setTimeout(waitForMetadataService, 50);
  }
}

waitForMetadataService();

console.log('[KaiSign] Metadata service loaded');

} // End of duplicate-load guard
