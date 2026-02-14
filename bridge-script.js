// ISOLATED world content script - bridge between MAIN world and background

// Fallback: inject MAIN world scripts dynamically if manifest injection failed
// (e.g. hard refresh race condition). content-script.js has a __KAISIGN_LOADED guard.
(function injectMainWorldScripts() {
  const scripts = [
    'name-resolution-service.js', 'subgraph-metadata.js', 'onchain-verifier.js',
    'runtime-registry.js', 'metadata.js', 'eip712-decoder.js', 'decode.js',
    'recursive-decoder.js', 'advanced-decoder.js', 'content-script.js'
  ];

  const container = document.documentElement || document.head || document.body;
  if (!container) return;

  for (const file of scripts) {
    const el = document.createElement('script');
    el.src = chrome.runtime.getURL(file);
    el.async = false;
    container.appendChild(el);
    el.onload = () => el.remove();
    el.onerror = () => el.remove();
  }
})();

// Check chrome.runtime availability
if (typeof chrome === 'undefined' || !chrome.runtime) {
  console.error('[KaiSign Bridge] CRITICAL: chrome.runtime not available!');
}

// Listen for messages from MAIN world content script
window.addEventListener('message', (event) => {
  // Accept messages from page context (MAIN world)

  const message = event.data;

  // Filter for KaiSign messages
  if (!message || !message.type || !message.type.startsWith('KAISIGN_')) return;

  console.log('[KaiSign Bridge] Received from MAIN world:', message.type);

  // Check chrome.runtime availability
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    console.error('[KaiSign Bridge] chrome.runtime not available, cannot forward message');
    window.postMessage({
      type: message.type.replace('KAISIGN_', 'KAISIGN_') + '_RESPONSE',
      error: 'Extension context not available'
    }, '*');
    return;
  }

  // Forward to background script
  switch (message.type) {
    case 'KAISIGN_SAVE_TX':
      chrome.runtime.sendMessage({
        type: 'SAVE_TRANSACTION',
        data: message.data
      }, (response) => {
        console.log('[KaiSign Bridge] Save response:', response);

        // Optionally send response back to MAIN world
        window.postMessage({
          type: 'KAISIGN_SAVE_TX_RESPONSE',
          success: response?.success,
          count: response?.count
        }, '*');
      });
      break;

    case 'KAISIGN_GET_TXS':
      chrome.runtime.sendMessage({
        type: 'GET_TRANSACTIONS'
      }, (response) => {
        window.postMessage({
          type: 'KAISIGN_GET_TXS_RESPONSE',
          transactions: response?.transactions || []
        }, '*');
      });
      break;

    case 'KAISIGN_CLEAR_TXS':
      chrome.runtime.sendMessage({
        type: 'CLEAR_TRANSACTIONS'
      }, (response) => {
        window.postMessage({
          type: 'KAISIGN_CLEAR_TXS_RESPONSE',
          success: response?.success
        }, '*');
      });
      break;

    case 'KAISIGN_FETCH_BLOB':
      chrome.runtime.sendMessage({
        type: 'FETCH_BLOB',
        url: message.url
      }, (response) => {
        window.postMessage({
          type: 'KAISIGN_BLOB_RESPONSE',
          messageId: message.messageId,
          data: response?.data,
          error: response?.error
        }, '*');
      });
      break;

    case 'KAISIGN_RPC_CALL':
      chrome.runtime.sendMessage({
        type: 'RPC_CALL',
        rpcUrl: message.rpcUrl,
        method: message.method,
        params: message.params
      }, (response) => {
        window.postMessage({
          type: 'KAISIGN_RPC_RESPONSE',
          messageId: message.messageId,
          result: response?.result,
          error: response?.error
        }, '*');
      });
      break;
  }
});

console.log('[KaiSign] Bridge script ready');
