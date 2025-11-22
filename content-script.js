/**
 * KaiSign Extension - Content Script  
 * Intercepts MetaMask ethereum.request() calls to capture transaction payloads
 */

(function() {
  'use strict';

  console.log('[KaiSign] Content script loaded - ' + Date.now());

  // Initialize EIP-7702 detector
  const detector = new EIP7702Detector();
  
  // Store for captured transactions  
  let capturedTransactions = [];
  let originalEthereumRequest = null;

  // Hook into ethereum object
  function hookEthereum() {
    function attemptHook() {
      if (!window.ethereum || !window.ethereum.request) {
        return false;
      }

      console.log('[KaiSign] Hooking into MetaMask ethereum object');
      
      // Store original request method
      originalEthereumRequest = window.ethereum.request.bind(window.ethereum);

      // Override ethereum.request
      window.ethereum.request = async function(args) {
        console.log('[KaiSign] INTERCEPTED ethereum.request:', args.method, args);

        try {
          // Check if this is a transaction call
          if (args.method === 'eth_sendTransaction' || args.method === 'wallet_sendCalls') {
            console.log('[KaiSign] Transaction detected, capturing data...');
            
            // Capture transaction data
            const transactionData = {
              id: 'tx_' + Date.now(),
              method: args.method,
              timestamp: new Date().toISOString(),
              transaction: detector.formatTransaction(args.params?.[0] || {}),
              originalCall: args
            };
            
            // Store captured transaction in memory
            capturedTransactions.unshift(transactionData);
            if (capturedTransactions.length > 20) {
              capturedTransactions = capturedTransactions.slice(0, 20);
            }
            
            // Send to communication script for storage
            try {
              window.postMessage({
                source: 'kaisign-main',
                type: 'SAVE_TRANSACTION',
                payload: transactionData
              }, '*');
              console.log('[KaiSign] ✅ Transaction sent to communication script for storage');
            } catch (msgError) {
              console.error('[KaiSign] ❌ Communication failed, transaction NOT saved:', msgError);
            }
            
            // Show KaiSign popup BEFORE MetaMask popup
            console.log('[KaiSign] Showing KaiSign popup BEFORE MetaMask');
            openTransactionPopup(transactionData);
            
            // Now call original MetaMask request (this will show MetaMask popup)
            return await originalEthereumRequest(args);
          } else {
            // For non-transaction calls, proceed normally
            return await originalEthereumRequest(args);
          }

        } catch (error) {
          console.error('[KaiSign] Error in intercepted call:', error);
          throw error;
        }
      };

      console.log('[KaiSign] Successfully hooked MetaMask ethereum.request');
      return true;
    }

    // Try immediate hook
    if (attemptHook()) return;

    // Poll for ethereum object
    const pollInterval = setInterval(() => {
      if (attemptHook()) {
        clearInterval(pollInterval);
      }
    }, 100);
    
    // Give up after 30 seconds
    setTimeout(() => {
      clearInterval(pollInterval);
    }, 30000);
  }

  // Load existing transactions via communication script
  function loadExistingTransactions() {
    try {
      // Request transaction history via communication script
      window.postMessage({
        source: 'kaisign-main',
        type: 'GET_TRANSACTIONS',
        payload: null
      }, '*');
      console.log('[KaiSign] Requested existing transactions via communication script');
    } catch (error) {
      console.log('[KaiSign] Could not request existing transactions:', error);
    }
  }
  
  // Listen for responses from communication script
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data.source || event.data.source !== 'kaisign-comm') {
      return;
    }
    
    const { type, success, data } = event.data;
    
    if (type === 'GET_TRANSACTIONS_RESPONSE' && success && data && data.transactions) {
      capturedTransactions = data.transactions;
      console.log('[KaiSign] ✅ Loaded', capturedTransactions.length, 'existing transactions from storage');
    }
  });

  // Initialize interception
  async function initializeInterception() {
    console.log('[KaiSign] Initializing...');
    await loadExistingTransactions();
    hookEthereum();
  }

  // Open transaction popup window
  function openTransactionPopup(transactionData) {
    console.log('[KaiSign] OPENING POPUP for transaction:', transactionData);
    
    try {
      // Send popup request via communication script
      window.postMessage({
        source: 'kaisign-main',
        type: 'OPEN_POPUP',
        payload: transactionData
      }, '*');
      console.log('[KaiSign] Popup request sent via communication script');
    } catch (error) {
      console.log('[KaiSign] Communication failed, using fallback');
      showInlineTransactionDetails(transactionData);
    }
  }

  // Fallback: Show transaction details inline
  function showInlineTransactionDetails(transactionData) {
    console.log('[KaiSign] SHOWING INLINE DETAILS for transaction:', transactionData);
    
    // Create floating panel
    const panel = document.createElement('div');
    panel.style.cssText = `
      position: fixed;
      top: 50px;
      right: 50px;
      width: 400px;
      max-height: 600px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.3);
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow-y: auto;
      border: 2px solid rgba(255,255,255,0.2);
    `;

    const isEIP7702 = transactionData.transaction?.isEIP7702;
    const tx = transactionData.transaction || {};

    panel.innerHTML = `
      <div style="padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.2);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 24px; margin-bottom: 5px;">🔍</div>
            <div style="font-size: 18px; font-weight: 600;">KaiSign</div>
            <div style="font-size: 14px; opacity: 0.8;">Transaction Inspector</div>
          </div>
          <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 30px; height: 30px; border-radius: 15px; cursor: pointer; font-size: 18px;">×</button>
        </div>
      </div>
      
      <div style="padding: 20px;">
        <div style="background: ${isEIP7702 ? 'rgba(255,183,77,0.2)' : 'rgba(255,255,255,0.1)'}; padding: 15px; border-radius: 8px; text-align: center; margin-bottom: 20px; ${isEIP7702 ? 'border: 2px solid rgba(255,183,77,0.5);' : ''}">
          <div style="font-size: 24px; margin-bottom: 5px;">${isEIP7702 ? '🚀' : '📝'}</div>
          <div style="font-weight: 600;">${isEIP7702 ? 'EIP-7702 Transaction' : 'Transaction Detected'}</div>
        </div>
        
        <div style="margin-bottom: 20px;">
          <div style="font-size: 14px; font-weight: 600; margin-bottom: 10px; opacity: 0.9;">Basic Information</div>
          <div style="font-size: 12px; line-height: 1.8; font-family: monospace;">
            <div><span style="opacity: 0.7;">Method:</span> ${transactionData.method || 'eth_sendTransaction'}</div>
            <div><span style="opacity: 0.7;">To:</span> ${tx.to || '-'}</div>
            <div><span style="opacity: 0.7;">From:</span> ${tx.from || '-'}</div>
            <div><span style="opacity: 0.7;">Value:</span> ${tx.value || '0x0'}</div>
            <div><span style="opacity: 0.7;">Gas:</span> ${tx.gas || tx.gasLimit || '-'}</div>
          </div>
        </div>
        
        ${isEIP7702 && tx.authorizationList ? `
          <div style="margin-bottom: 20px;">
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 10px; opacity: 0.9;">🚀 Authorization List</div>
            <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; font-size: 11px; font-family: monospace;">
              ${tx.authorizationList.map((auth, i) => `
                <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                  <div style="font-weight: bold;">Authorization ${i + 1}</div>
                  <div>Address: ${auth.address || '-'}</div>
                  <div>Chain ID: ${auth.chainId || '-'}</div>
                  <div>Nonce: ${auth.nonce || '-'}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        
        <div style="margin-bottom: 15px;">
          <div style="font-size: 14px; font-weight: 600; margin-bottom: 10px; opacity: 0.9;">Raw Data</div>
          <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 6px; font-size: 10px; font-family: monospace; max-height: 150px; overflow-y: auto; word-break: break-all;">
            ${JSON.stringify(transactionData, null, 2)}
          </div>
        </div>
        
        <div style="text-align: center;">
          <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 500;">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    // Auto-remove after 30 seconds
    setTimeout(() => {
      if (panel.parentNode) {
        panel.remove();
      }
    }, 30000);
  }

  // Expose functions for testing and popup access
  window.KaiSign = {
    detector: detector,
    capturedTransactions: capturedTransactions,
    status: () => {
      return {
        isActive: !!originalEthereumRequest,
        hasMetaMask: !!window.ethereum,
        transactionCount: capturedTransactions.length,
        version: 'FIXED_STORAGE'
      };
    },
    getTransactions: () => {
      // Return transactions from memory (content script can't access storage directly)
      console.log('[KaiSign] Returning', capturedTransactions.length, 'transactions from memory');
      return capturedTransactions;
    },
    clearTransactions: () => {
      // Clear from memory
      capturedTransactions = [];
      console.log('[KaiSign] Transactions cleared from memory');
      // Note: Storage clearing would need to be handled via communication script if needed
    },
    test: () => {
      console.log('[KaiSign] TESTING...');
      console.log('[KaiSign] window.ethereum exists:', !!window.ethereum);
      console.log('[KaiSign] originalEthereumRequest exists:', !!originalEthereumRequest);
      console.log('[KaiSign] Captured transactions:', capturedTransactions.length);
      
      if (window.ethereum && window.ethereum.request) {
        console.log('[KaiSign] Testing manual call...');
        window.ethereum.request({ method: 'eth_accounts' }).then(result => {
          console.log('[KaiSign] Test call worked:', result);
        }).catch(err => {
          console.log('[KaiSign] Test call failed:', err);
        });
      }
    },
    testCommunication: () => {
      console.log('[KaiSign] 🧪 TESTING COMMUNICATION...');
      try {
        window.postMessage({
          source: 'kaisign-main',
          type: 'GET_TRANSACTIONS',
          payload: null
        }, '*');
        console.log('[KaiSign] ✅ Message sent via communication script');
      } catch (error) {
        console.error('[KaiSign] ❌ Communication test failed:', error);
      }
    },
    forcePopup: () => {
      console.log('[KaiSign] FORCING TEST POPUP...');
      const testData = {
        id: 'test_' + Date.now(),
        method: 'eth_sendTransaction',
        timestamp: new Date().toISOString(),
        transaction: detector.formatTransaction({
          type: '0x2',
          to: '0x742d35Cc6481C8B4b5F90d4F6e5c3b8dA0c8C7B5',
          from: '0x123...',
          value: '0x1000000000000000',
          gas: '0x5208'
        })
      };
      openTransactionPopup(testData);
      return testData;
    }
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeInterception);
  } else {
    initializeInterception();
  }

})();