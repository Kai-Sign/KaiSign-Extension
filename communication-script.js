/**
 * KaiSign Extension - Communication Script
 * Runs in isolated world to handle extension messaging
 */

console.log('[KaiSign-Comm] Communication script loaded');

// Listen for messages from the main world content script
window.addEventListener('message', async (event) => {
  // Only accept messages from same origin and with our signature
  if (event.source !== window || !event.data.type || event.data.source !== 'kaisign-main') {
    return;
  }

  console.log('[KaiSign-Comm] Received message from main world:', event.data);

  const { type, payload } = event.data;

  try {
    switch (type) {
      case 'SAVE_TRANSACTION':
        // Send transaction to background script for storage
        if (chrome && chrome.runtime) {
          chrome.runtime.sendMessage({
            type: 'TRANSACTION_CAPTURED',
            data: payload
          });
          console.log('[KaiSign-Comm] ✅ Transaction sent to background script');
          
          // Send success back to main world
          window.postMessage({
            source: 'kaisign-comm',
            type: 'SAVE_TRANSACTION_RESPONSE',
            success: true
          }, '*');
        } else {
          throw new Error('Chrome runtime not available');
        }
        break;

      case 'GET_TRANSACTIONS':
        // Request transaction history from background
        if (chrome && chrome.runtime) {
          chrome.runtime.sendMessage({ type: 'GET_TRANSACTION_HISTORY' }, (response) => {
            window.postMessage({
              source: 'kaisign-comm',
              type: 'GET_TRANSACTIONS_RESPONSE',
              success: response?.success || false,
              data: response?.data || null
            }, '*');
          });
        }
        break;

      case 'OPEN_POPUP':
        // Request popup window from background
        if (chrome && chrome.runtime) {
          chrome.runtime.sendMessage({
            type: 'OPEN_TRANSACTION_POPUP',
            data: payload
          });
          console.log('[KaiSign-Comm] ✅ Popup request sent to background');
        }
        break;

      default:
        console.warn('[KaiSign-Comm] Unknown message type:', type);
    }
  } catch (error) {
    console.error('[KaiSign-Comm] Error handling message:', error);
    
    // Send error back to main world
    window.postMessage({
      source: 'kaisign-comm',
      type: type + '_RESPONSE',
      success: false,
      error: error.message
    }, '*');
  }
});

console.log('[KaiSign-Comm] Communication script ready');