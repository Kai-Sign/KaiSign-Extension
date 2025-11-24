console.log('[KaiSign] Content script loading...');

// Wallet detection and hooking
const hookedWallets = new Set();

// Wait for any wallet
function waitForWallets() {
  // Check for different wallet providers
  detectAndHookWallets();
  
  // Keep checking for new wallets (some load late)
  setTimeout(waitForWallets, 500);
}

// Detect and hook various wallets
function detectAndHookWallets() {
  // 1. MetaMask (window.ethereum)
  if (window.ethereum && window.ethereum.request && !hookedWallets.has('ethereum')) {
    console.log('[KaiSign] Ethereum provider found (MetaMask/others), hooking...');
    hookWalletProvider(window.ethereum, 'ethereum');
    hookedWallets.add('ethereum');
  }
  
  // 2. Rabby (window.rabby)
  if (window.rabby && window.rabby.request && !hookedWallets.has('rabby')) {
    console.log('[KaiSign] Rabby wallet found, hooking...');
    hookWalletProvider(window.rabby, 'rabby');
    hookedWallets.add('rabby');
  }
  
  // 3. Coinbase Wallet (window.coinbaseWalletExtension)
  if (window.coinbaseWalletExtension && window.coinbaseWalletExtension.request && !hookedWallets.has('coinbase')) {
    console.log('[KaiSign] Coinbase Wallet found, hooking...');
    hookWalletProvider(window.coinbaseWalletExtension, 'coinbase');
    hookedWallets.add('coinbase');
  }
  
  // 4. Trust Wallet (window.trustWallet)
  if (window.trustWallet && window.trustWallet.request && !hookedWallets.has('trust')) {
    console.log('[KaiSign] Trust Wallet found, hooking...');
    hookWalletProvider(window.trustWallet, 'trust');
    hookedWallets.add('trust');
  }
  
  // 5. Phantom (window.phantom?.ethereum)
  if (window.phantom?.ethereum && window.phantom.ethereum.request && !hookedWallets.has('phantom')) {
    console.log('[KaiSign] Phantom Wallet found, hooking...');
    hookWalletProvider(window.phantom.ethereum, 'phantom');
    hookedWallets.add('phantom');
  }
  
  // 6. Check for multiple providers (some wallets inject arrays)
  if (window.ethereum?.providers && Array.isArray(window.ethereum.providers)) {
    window.ethereum.providers.forEach((provider, index) => {
      const walletKey = `provider-${index}`;
      if (provider.request && !hookedWallets.has(walletKey)) {
        const walletName = getWalletName(provider);
        console.log(`[KaiSign] Provider ${index} found (${walletName}), hooking...`);
        hookWalletProvider(provider, walletKey, walletName);
        hookedWallets.add(walletKey);
      }
    });
  }
}

// Get wallet name from provider
function getWalletName(provider) {
  if (provider.isMetaMask) return 'MetaMask';
  if (provider.isRabby) return 'Rabby';
  if (provider.isCoinbaseWallet) return 'Coinbase';
  if (provider.isTrust) return 'Trust';
  if (provider.isPhantom) return 'Phantom';
  if (provider.isBraveWallet) return 'Brave';
  if (provider.isExodus) return 'Exodus';
  return 'Unknown Wallet';
}

// Generic wallet provider hooker
function hookWalletProvider(provider, walletKey, walletName = walletKey) {
  if (!provider.request) return;
  
  const originalRequest = provider.request.bind(provider);
  
  provider.request = async function(args) {
    console.log(`[KaiSign] ${walletName} Request:`, args.method);
    
    // Check if it's a transaction
    if (args.method === 'eth_sendTransaction' || args.method === 'eth_signTransaction') {
      const tx = args.params?.[0] || {};
      console.log(`[KaiSign] ${walletName} TRANSACTION:`, tx);
      
      // Get intent and show popup
      getIntentAndShow(tx, args.method, walletName);
    }
    
    // Call original wallet request
    return await originalRequest(args);
  };
  
  console.log(`[KaiSign] ${walletName} hooked successfully`);
}

// Get intent and show transaction
async function getIntentAndShow(tx, method, walletName = 'Wallet') {
  let intent = 'Loading intent...';
  
  // Show popup immediately with loading state
  showTransactionInfo(tx, method, intent, walletName);
  
  // Use EXACT decoder from Snaps repo
  console.log('[KaiSign] ===== CONTENT SCRIPT DECODE =====');
  console.log('[KaiSign] TX data:', tx.data?.slice(0, 20) + '...');
  console.log('[KaiSign] TX to:', tx.to);
  console.log('[KaiSign] Has decodeCalldata:', !!window.decodeCalldata);
  
  if (window.decodeCalldata && tx.data && tx.to) {
    try {
      // Use Sepolia chain ID for KaiSign contract
      const chainId = tx.to.toLowerCase() === '0x4dfea0c2b472a14cd052a8f9df9f19fa5cf03719' ? 11155111 : 1;
      console.log('[KaiSign] Using chain ID:', chainId);
      
      const decoded = await window.decodeCalldata(tx.data, tx.to, chainId);
      console.log('[KaiSign] Decode result:', decoded);
      
      if (decoded.success) {
        intent = decoded.intent || 'Contract interaction';
        console.log('[KaiSign] ✅ SUCCESS - Intent:', intent);
      } else {
        intent = 'Contract interaction';
        console.log('[KaiSign] ❌ FAILED - Error:', decoded.error);
      }
      // Update popup with real intent
      showTransactionInfo(tx, method, intent, walletName);
    } catch (error) {
      console.log('[KaiSign] ❌ EXCEPTION:', error.message);
      intent = 'Contract interaction';
      showTransactionInfo(tx, method, intent, walletName);
    }
  } else {
    console.log('[KaiSign] ❌ Missing decoder or transaction data');
  }
  
  // Save transaction with intent
  try {
    chrome.runtime.sendMessage({
      type: 'SAVE_TRANSACTION',
      data: {
        id: Date.now().toString(),
        method: method,
        time: new Date().toISOString(),
        to: tx.to,
        value: tx.value,
        data: tx.data,
        intent: intent
      }
    });
  } catch (error) {
    console.log('[KaiSign] Save failed:', error.message);
  }
}

// Show transaction info
function showTransactionInfo(tx, method, intent, walletName = 'Wallet') {
  // Remove old popup if exists
  const old = document.getElementById('kaisign-popup');
  if (old) old.remove();
  
  // Create simple popup
  const popup = document.createElement('div');
  popup.id = 'kaisign-popup';
  popup.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 300px;
    background: #333;
    color: white;
    padding: 15px;
    border-radius: 8px;
    z-index: 999999;
    font-family: monospace;
    font-size: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  
  popup.innerHTML = `
    <div style="font-size: 12px; color: #ff6b6b; font-weight: bold; margin-bottom: 8px; text-align: center; border: 1px solid #ff6b6b; padding: 4px; border-radius: 4px;">
      ⚠️ THIS IS A DEMONSTRATION OF THE REAL PRODUCT. USE AT YOUR OWN RISK
    </div>
    <div style="font-size: 14px; font-weight: bold; margin-bottom: 8px;">
      🔍 KaiSign - Transaction Detected (${walletName})
    </div>
    <div style="font-size: 16px; color: #4CAF50; margin-bottom: 8px; font-weight: bold;">
      🎯 ${intent || 'Loading intent...'}
    </div>
    <div><strong>To:</strong> ${tx.to || 'N/A'}</div>
    <div><strong>Value:</strong> ${tx.value || '0x0'}</div>
    ${tx.data ? `<div><strong>Data:</strong> ${tx.data.slice(0, 20)}...</div>` : ''}
    <button onclick="this.parentElement.remove()" style="
      background: #555;
      color: white;
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      margin-top: 8px;
      cursor: pointer;
    ">Close</button>
  `;
  
  document.body.appendChild(popup);
  
  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (popup.parentNode) popup.remove();
  }, 10000);
}

// Start wallet detection
waitForWallets();

console.log('[KaiSign] Content script ready - Multi-wallet support enabled');