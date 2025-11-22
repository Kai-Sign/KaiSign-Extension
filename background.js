/**
 * KaiSign Extension - Background Service Worker
 * Manages extension lifecycle and popup communication
 */

console.log('[KaiSign-Background] Service worker started');

// Extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[KaiSign-Background] Extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    // Initialize storage on first install
    chrome.storage.local.set({
      transactionHistory: [],
      settings: {
        showNotifications: true,
        showEIP7702Only: false,
        maxTransactions: 50
      },
      isActive: true
    });
    
    console.log('[KaiSign-Background] Initial storage setup complete');
  }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('[KaiSign-Background] Extension started');
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[KaiSign-Background] Received message:', message.type, 'from', sender.tab?.url || 'popup', message);

  switch (message.type) {
    case 'TRANSACTION_CAPTURED':
      handleTransactionCaptured(message.data);
      break;
      
    case 'GET_TRANSACTION_HISTORY':
      getTransactionHistory(sendResponse);
      return true; // Keep channel open for async response
      
    case 'CLEAR_HISTORY':
      clearTransactionHistory(sendResponse);
      return true;
      
    case 'UPDATE_SETTINGS':
      updateSettings(message.data, sendResponse);
      return true;
      
    case 'GET_SETTINGS':
      getSettings(sendResponse);
      return true;
      
    case 'OPEN_TRANSACTION_POPUP':
      openTransactionPopup(message.data);
      break;
      
    default:
      console.warn('[KaiSign-Background] Unknown message type:', message.type);
  }
});

// Handle new transaction capture
async function handleTransactionCaptured(transactionData) {
  try {
    // Get current history
    const result = await chrome.storage.local.get(['transactionHistory', 'settings']);
    const history = result.transactionHistory || [];
    const settings = result.settings || { maxTransactions: 50 };

    // Add new transaction
    history.unshift(transactionData);
    
    // Limit history size
    if (history.length > settings.maxTransactions) {
      history.splice(settings.maxTransactions);
    }

    // Save updated history
    await chrome.storage.local.set({
      transactionHistory: history,
      lastTransactionTime: Date.now()
    });

    console.log('[KaiSign-Background] Transaction saved to history:', transactionData.id);

    // Update badge if EIP-7702 transaction
    if (transactionData.transaction?.isEIP7702) {
      updateBadge('EIP', '#ff6b35');
      
      // Reset badge after 10 seconds
      setTimeout(() => {
        updateBadge('', '');
      }, 10000);
    }

  } catch (error) {
    console.error('[KaiSign-Background] Error handling captured transaction:', error);
  }
}

// Get transaction history
async function getTransactionHistory(sendResponse) {
  try {
    const result = await chrome.storage.local.get(['transactionHistory']);
    const history = result.transactionHistory || [];
    
    sendResponse({
      success: true,
      data: {
        transactions: history,
        count: history.length
      }
    });
  } catch (error) {
    console.error('[KaiSign-Background] Error getting transaction history:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Clear transaction history
async function clearTransactionHistory(sendResponse) {
  try {
    await chrome.storage.local.set({
      transactionHistory: [],
      lastTransactionTime: null
    });
    
    updateBadge('', '');
    
    sendResponse({ success: true });
    console.log('[KaiSign-Background] Transaction history cleared');
  } catch (error) {
    console.error('[KaiSign-Background] Error clearing history:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Update extension settings
async function updateSettings(newSettings, sendResponse) {
  try {
    const result = await chrome.storage.local.get(['settings']);
    const currentSettings = result.settings || {};
    
    const updatedSettings = {
      ...currentSettings,
      ...newSettings
    };
    
    await chrome.storage.local.set({
      settings: updatedSettings
    });
    
    sendResponse({ success: true, settings: updatedSettings });
    console.log('[KaiSign-Background] Settings updated:', updatedSettings);
  } catch (error) {
    console.error('[KaiSign-Background] Error updating settings:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Get current settings
async function getSettings(sendResponse) {
  try {
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || {
      showNotifications: true,
      showEIP7702Only: false,
      maxTransactions: 50
    };
    
    sendResponse({ success: true, settings: settings });
  } catch (error) {
    console.error('[KaiSign-Background] Error getting settings:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Update extension badge
function updateBadge(text, color) {
  chrome.action.setBadgeText({ text: text });
  chrome.action.setBadgeBackgroundColor({ color: color });
}

// Open transaction popup window
async function openTransactionPopup(transactionData) {
  console.log('[KaiSign-Background] Opening transaction popup window');
  
  try {
    // Encode transaction data for URL
    const encodedData = encodeURIComponent(JSON.stringify(transactionData));
    const popupUrl = `transaction-popup.html?data=${encodedData}`;
    
    // Create popup window
    const popup = await chrome.windows.create({
      url: popupUrl,
      type: 'popup',
      width: 420,
      height: 650,
      focused: true,
      left: Math.max(0, screen.width - 850),
      top: 100
    });
    
    console.log('[KaiSign-Background] Popup window created:', popup.id);
    
    // Store popup ID to track it
    await chrome.storage.local.set({
      transactionPopupId: popup.id,
      transactionPopupData: transactionData
    });
    
  } catch (error) {
    console.error('[KaiSign-Background] Error creating popup window:', error);
  }
}

// Handle tab updates (inject content script into new pages)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Only inject into http/https pages
    if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
      console.log('[KaiSign-Background] Page loaded:', tab.url);
      
      // Content script should auto-inject via manifest, but we can handle
      // additional initialization here if needed
    }
  }
});

// Cleanup on extension shutdown
chrome.runtime.onSuspend.addListener(() => {
  console.log('[KaiSign-Background] Extension suspending, cleaning up...');
  updateBadge('', '');
});

// Keep service worker alive during active usage
let keepAliveInterval;

function keepServiceWorkerAlive() {
  keepAliveInterval = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'PING' }).catch(() => {
      // Expected error when no listeners
    });
  }, 20000); // Ping every 20 seconds
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// Start keep-alive on activity
chrome.tabs.onActivated.addListener(() => {
  if (!keepAliveInterval) {
    keepServiceWorkerAlive();
  }
});

// Stop keep-alive when idle (if idle API is available)
try {
  if (chrome.idle) {
    chrome.idle.onStateChanged.addListener((state) => {
      if (state === 'idle') {
        stopKeepAlive();
      } else if (state === 'active') {
        if (!keepAliveInterval) {
          keepServiceWorkerAlive();
        }
      }
    });
  }
} catch (error) {
  console.log('[KaiSign-Background] Idle API not available, skipping idle detection');
}

console.log('[KaiSign-Background] Service worker initialization complete');