// ISOLATED world content script - bridge between MAIN world and background
console.log('[KaiSign] Bridge script loaded (ISOLATED world)');

// Listen for messages from MAIN world content script
window.addEventListener('message', (event) => {
  // Only accept messages from same origin
  if (event.source !== window) return;

  const message = event.data;

  // Filter for KaiSign messages
  if (!message || !message.type || !message.type.startsWith('KAISIGN_')) return;

  console.log('[KaiSign Bridge] Received from MAIN world:', message.type);

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
  }
});

console.log('[KaiSign] Bridge script ready');
