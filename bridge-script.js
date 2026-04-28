// ISOLATED world content script - bridge between MAIN world and background.
//
// Injection design (intentional, do not "simplify"):
//   manifest.json content_scripts already lists the MAIN-world files with
//   `"world": "MAIN"`. That is the primary path. The injectScripts() block
//   below is a *fallback* for pages where manifest injection didn't run
//   (some sites + some Chrome versions skip MAIN-world manifest scripts).
//   Each MAIN-world file uses an idempotent load guard at the top, so a
//   double-load is a no-op rather than a clobber.
//
// Logging policy: gate happy-path logs behind BRIDGE_DEBUG (default off,
// flippable via DevTools `globalThis.KAISIGN_BRIDGE_DEBUG = true`).
// console.warn / console.error stay ungated — those signal real failures.

const BRIDGE_DEBUG = (typeof globalThis !== 'undefined' && globalThis.KAISIGN_BRIDGE_DEBUG === true);

// Settings are passed via KAISIGN_GET_SETTINGS postMessage (no inline script needed - CSP safe)
(function injectScripts() {
  const container = document.documentElement || document.head || document.body;
  if (!container) return;

  // Inject MAIN world scripts (fallback if manifest injection failed)
  const scripts = [
    'name-resolution-service.js', 'subgraph-metadata.js', 'onchain-verifier.js',
    'runtime-registry.js', 'metadata.js', 'eip712-decoder.js', 'decode.js',
    'recursive-decoder.js', 'advanced-decoder.js', 'content-script.js'
  ];

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

/**
 * Safely send message to background script with error handling for extension context invalidation.
 * Returns null if the extension context is invalid.
 */
function safeSendMessage(message, callback) {
  try {
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      console.warn('[KaiSign Bridge] Extension context invalidated - please refresh the page');
      callback?.({ error: 'Extension was reloaded. Please refresh the page.' });
      return;
    }
    chrome.runtime.sendMessage(message, (response) => {
      // Check for chrome.runtime.lastError (set when extension context is invalid)
      if (chrome.runtime.lastError) {
        console.warn('[KaiSign Bridge] Message failed:', chrome.runtime.lastError.message);
        callback?.({ error: 'Extension context lost. Please refresh the page.' });
        return;
      }
      callback?.(response);
    });
  } catch (error) {
    console.warn('[KaiSign Bridge] Failed to send message:', error.message);
    callback?.({ error: 'Extension context invalid. Please refresh the page.' });
  }
}

// Listen for messages from MAIN world content script
window.addEventListener('message', (event) => {
  // Accept messages from page context (MAIN world)

  const message = event.data;

  // Filter for KaiSign messages
  if (!message || !message.type || !message.type.startsWith('KAISIGN_')) return;

  BRIDGE_DEBUG && console.log('[KaiSign Bridge] Received from MAIN world:', message.type);

  // Check chrome.runtime availability
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    console.warn('[KaiSign Bridge] chrome.runtime not available, cannot forward message');
    window.postMessage({
      type: message.type.replace('KAISIGN_', 'KAISIGN_') + '_RESPONSE',
      error: 'Extension context not available'
    }, '*');
    return;
  }

  // Forward to background script
  switch (message.type) {
    case 'KAISIGN_SAVE_TX':
      safeSendMessage({
        type: 'SAVE_TRANSACTION',
        data: message.data
      }, (response) => {
        BRIDGE_DEBUG && console.log('[KaiSign Bridge] Save response:', response);

        // Optionally send response back to MAIN world
        window.postMessage({
          type: 'KAISIGN_SAVE_TX_RESPONSE',
          success: response?.success,
          count: response?.count,
          error: response?.error
        }, '*');
      });
      break;

    case 'KAISIGN_GET_TXS':
      safeSendMessage({
        type: 'GET_TRANSACTIONS'
      }, (response) => {
        window.postMessage({
          type: 'KAISIGN_GET_TXS_RESPONSE',
          transactions: response?.transactions || [],
          error: response?.error
        }, '*');
      });
      break;

    case 'KAISIGN_CLEAR_TXS':
      safeSendMessage({
        type: 'CLEAR_TRANSACTIONS'
      }, (response) => {
        window.postMessage({
          type: 'KAISIGN_CLEAR_TXS_RESPONSE',
          success: response?.success,
          error: response?.error
        }, '*');
      });
      break;

    case 'KAISIGN_FETCH_BLOB':
      BRIDGE_DEBUG && console.log('[KaiSign Bridge] FETCH_BLOB request:', message.url);
      safeSendMessage({
        type: 'FETCH_BLOB',
        url: message.url
      }, (response) => {
        BRIDGE_DEBUG && console.log('[KaiSign Bridge] FETCH_BLOB response:', {
          hasData: !!response?.data,
          dataPreview: response?.data?.substring?.(0, 200),
          error: response?.error
        });
        window.postMessage({
          type: 'KAISIGN_BLOB_RESPONSE',
          messageId: message.messageId,
          data: response?.data,
          error: response?.error
        }, '*');
      });
      break;

    case 'KAISIGN_RPC_CALL':
      safeSendMessage({
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

    case 'KAISIGN_GET_SETTINGS':
      safeSendMessage({ type: 'GET_SETTINGS' }, (response) => {
        window.postMessage({
          type: 'KAISIGN_SETTINGS_RESPONSE',
          settings: response?.settings || {},
          error: response?.error
        }, '*');
      });
      break;

    case 'KAISIGN_SAVE_VERIFICATION_STATUS':
      safeSendMessage({
        type: 'SAVE_VERIFICATION_STATUS',
        data: message.data
      }, (response) => {
        window.postMessage({
          type: 'KAISIGN_SAVE_VERIFICATION_STATUS_RESPONSE',
          success: response?.success,
          status: response?.status,
          error: response?.error
        }, '*');
      });
      break;
  }
});

// Listen for settings updates from background (when user saves in options page)
try {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'KAISIGN_SETTINGS_UPDATED') {
      // Forward to MAIN world so services can react to URL changes
      window.postMessage({
        type: 'KAISIGN_SETTINGS_UPDATED',
        settings: message.settings
      }, '*');
    }
  });
} catch (error) {
  console.warn('[KaiSign Bridge] Failed to add message listener:', error.message);
}

BRIDGE_DEBUG && console.log('[KaiSign] Bridge script ready');
