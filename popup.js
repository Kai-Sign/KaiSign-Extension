console.log('[KaiSign] Popup loading...');

// Load transaction count
chrome.runtime.sendMessage({ type: 'GET_TRANSACTIONS' }, (response) => {
  const count = response?.transactions?.length || 0;
  document.getElementById('count').textContent = count;
});

// Show transactions
function showTransactions() {
  chrome.runtime.sendMessage({ type: 'GET_TRANSACTIONS' }, (response) => {
    const transactions = response?.transactions || [];
    
    if (transactions.length === 0) {
      alert('No transactions captured yet');
      return;
    }
    
    let text = `Captured ${transactions.length} transactions:\n\n`;
    
    transactions.slice(0, 5).forEach((tx, i) => {
      text += `${i + 1}. ${tx.intent || tx.method}\n`;
      text += `   To: ${tx.to || 'N/A'}\n`;
      text += `   Time: ${new Date(tx.time).toLocaleTimeString()}\n\n`;
    });
    
    if (transactions.length > 5) {
      text += `... and ${transactions.length - 5} more`;
    }
    
    alert(text);
  });
}

// Clear transactions
function clearTransactions() {
  if (confirm('Clear all transactions?')) {
    chrome.runtime.sendMessage({ type: 'CLEAR_TRANSACTIONS' }, () => {
      document.getElementById('count').textContent = '0';
      alert('Cleared!');
    });
  }
}

console.log('[KaiSign] Popup ready');