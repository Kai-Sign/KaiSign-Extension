console.log('[KaiSign] Background script started');

let transactions = [];

// Handle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[KaiSign] Message:', message.type);

  if (message.type === 'SAVE_TRANSACTION') {
    transactions.unshift(message.data);
    if (transactions.length > 20) {
      transactions = transactions.slice(0, 20);
    }
    console.log('[KaiSign] Saved transaction:', transactions.length);
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === 'GET_TRANSACTIONS') {
    sendResponse({ transactions: transactions });
    return true;
  }
  
  if (message.type === 'CLEAR_TRANSACTIONS') {
    transactions = [];
    sendResponse({ success: true });
    return true;
  }
});

console.log('[KaiSign] Background ready');