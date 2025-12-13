console.log('[KaiSign] Background script started');


// Storage keys
const STORAGE_KEYS = {
  TRANSACTIONS: 'kaisign-transactions',
  RPC_ACTIVITY: 'kaisign-rpc-activity',
  SETTINGS: 'kaisign-settings'
};

// Default settings
const DEFAULT_SETTINGS = {
  maxTransactions: 100,
  notifications: true,
  rpcTracking: true,
  securityAlerts: true,
  theme: 'dark'
};

// Initialize storage with defaults
async function initializeStorage() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.SETTINGS]);
    if (!result[STORAGE_KEYS.SETTINGS]) {
      await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS });
      console.log('[KaiSign] Initialized default settings');
    }
  } catch (error) {
    console.error('[KaiSign] Storage initialization error:', error);
  }
}

// Get settings
async function getSettings() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.SETTINGS]);
    return result[STORAGE_KEYS.SETTINGS] || DEFAULT_SETTINGS;
  } catch (error) {
    console.error('[KaiSign] Get settings error:', error);
    return DEFAULT_SETTINGS;
  }
}

// Save transaction
async function saveTransaction(transaction) {
  try {
    const settings = await getSettings();
    const result = await chrome.storage.local.get([STORAGE_KEYS.TRANSACTIONS]);
    const transactions = result[STORAGE_KEYS.TRANSACTIONS] || [];

    // Add new transaction at the beginning
    transactions.unshift(transaction);

    // Limit based on settings
    const maxTx = settings.maxTransactions || 100;
    if (transactions.length > maxTx) {
      transactions.splice(maxTx);
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.TRANSACTIONS]: transactions });
    console.log('[KaiSign] Saved transaction, total:', transactions.length);
    return { success: true, count: transactions.length };
  } catch (error) {
    console.error('[KaiSign] Save transaction error:', error);
    return { success: false, error: error.message };
  }
}

// Get transactions
async function getTransactions() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.TRANSACTIONS]);
    return result[STORAGE_KEYS.TRANSACTIONS] || [];
  } catch (error) {
    console.error('[KaiSign] Get transactions error:', error);
    return [];
  }
}

// Clear transactions
async function clearTransactions() {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.TRANSACTIONS]: [] });
    console.log('[KaiSign] Cleared all transactions');
    return { success: true };
  } catch (error) {
    console.error('[KaiSign] Clear transactions error:', error);
    return { success: false, error: error.message };
  }
}

// Save RPC activity
async function saveRpcActivity(activity) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.RPC_ACTIVITY]: activity });
    return { success: true };
  } catch (error) {
    console.error('[KaiSign] Save RPC activity error:', error);
    return { success: false, error: error.message };
  }
}

// Get RPC activity
async function getRpcActivity() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.RPC_ACTIVITY]);
    return result[STORAGE_KEYS.RPC_ACTIVITY] || {
      methods: {},
      timeline: [],
      patterns: {},
      security: {
        suspiciousActivity: [],
        privacyConcerns: [],
        mevIndicators: []
      }
    };
  } catch (error) {
    console.error('[KaiSign] Get RPC activity error:', error);
    return null;
  }
}

// Clear RPC activity
async function clearRpcActivity() {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.RPC_ACTIVITY]: {
        methods: {},
        timeline: [],
        patterns: {},
        security: {
          suspiciousActivity: [],
          privacyConcerns: [],
          mevIndicators: []
        }
      }
    });
    return { success: true };
  } catch (error) {
    console.error('[KaiSign] Clear RPC activity error:', error);
    return { success: false, error: error.message };
  }
}

// Save settings
async function saveSettings(settings) {
  try {
    const currentSettings = await getSettings();
    const newSettings = { ...currentSettings, ...settings };
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: newSettings });
    console.log('[KaiSign] Saved settings');
    return { success: true };
  } catch (error) {
    console.error('[KaiSign] Save settings error:', error);
    return { success: false, error: error.message };
  }
}

// Export all data
async function exportAllData() {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.TRANSACTIONS,
      STORAGE_KEYS.RPC_ACTIVITY,
      STORAGE_KEYS.SETTINGS
    ]);

    const transactions = result[STORAGE_KEYS.TRANSACTIONS] || [];
    const rpcActivity = result[STORAGE_KEYS.RPC_ACTIVITY] || {};
    const settings = result[STORAGE_KEYS.SETTINGS] || DEFAULT_SETTINGS;

    // Calculate date range
    let dateRange = { from: null, to: null };
    if (transactions.length > 0) {
      const times = transactions.map(tx => new Date(tx.time).getTime());
      dateRange.from = new Date(Math.min(...times)).toISOString();
      dateRange.to = new Date(Math.max(...times)).toISOString();
    }

    return {
      success: true,
      data: {
        version: '1.0',
        exportDate: new Date().toISOString(),
        metadata: {
          extensionVersion: chrome.runtime.getManifest().version,
          transactionCount: transactions.length,
          dateRange
        },
        transactions,
        rpcActivity,
        settings
      }
    };
  } catch (error) {
    console.error('[KaiSign] Export error:', error);
    return { success: false, error: error.message };
  }
}

// Import data
async function importData(data, mergeMode = false) {
  try {
    // Validate structure
    if (!data.version || !data.transactions) {
      return { success: false, error: 'Invalid data format' };
    }

    const currentData = await chrome.storage.local.get([STORAGE_KEYS.TRANSACTIONS]);
    let transactions = currentData[STORAGE_KEYS.TRANSACTIONS] || [];

    if (mergeMode) {
      // Merge: add new transactions, skip duplicates by id
      const existingIds = new Set(transactions.map(tx => tx.id));
      const newTransactions = data.transactions.filter(tx => !existingIds.has(tx.id));
      transactions = [...newTransactions, ...transactions];

      // Sort by time descending
      transactions.sort((a, b) => new Date(b.time) - new Date(a.time));
    } else {
      // Replace mode
      transactions = data.transactions;
    }

    // Apply limit
    const settings = await getSettings();
    if (transactions.length > settings.maxTransactions) {
      transactions = transactions.slice(0, settings.maxTransactions);
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.TRANSACTIONS]: transactions });

    // Import RPC activity if present
    if (data.rpcActivity) {
      await chrome.storage.local.set({ [STORAGE_KEYS.RPC_ACTIVITY]: data.rpcActivity });
    }

    return {
      success: true,
      imported: transactions.length,
      message: mergeMode ? 'Data merged successfully' : 'Data imported successfully'
    };
  } catch (error) {
    console.error('[KaiSign] Import error:', error);
    return { success: false, error: error.message };
  }
}

// Handle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[KaiSign] Message:', message.type);

  // Use async/await pattern
  (async () => {
    try {
      switch (message.type) {
        case 'SAVE_TRANSACTION':
          const saveResult = await saveTransaction(message.data);
          sendResponse(saveResult);
          break;

        case 'GET_TRANSACTIONS':
          sendResponse({ transactions: await getTransactions() });
          break;

        case 'CLEAR_TRANSACTIONS':
          sendResponse(await clearTransactions());
          break;

        case 'SAVE_RPC_ACTIVITY':
          sendResponse(await saveRpcActivity(message.data));
          break;

        case 'GET_RPC_ACTIVITY':
          sendResponse({ activity: await getRpcActivity() });
          break;

        case 'CLEAR_RPC_ACTIVITY':
          sendResponse(await clearRpcActivity());
          break;

        case 'GET_SETTINGS':
          sendResponse({ settings: await getSettings() });
          break;

        case 'SAVE_SETTINGS':
          sendResponse(await saveSettings(message.data));
          break;

        case 'EXPORT_DATA':
          sendResponse(await exportAllData());
          break;

        case 'IMPORT_DATA':
          sendResponse(await importData(message.data, message.mergeMode));
          break;

        case 'GET_STATS':
          const transactions = await getTransactions();
          const rpcActivity = await getRpcActivity();
          sendResponse({
            transactionCount: transactions.length,
            rpcMethodCount: Object.keys(rpcActivity?.methods || {}).length,
            rpcCallCount: Object.values(rpcActivity?.methods || {}).reduce((sum, m) => sum + (m.count || 0), 0)
          });
          break;

        case 'FETCH_BLOB':
          // Proxy fetch to bypass CORS restrictions (for KaiSign API)
          try {
            const response = await fetch(message.url);
            if (!response.ok) {
              sendResponse({ error: `HTTP ${response.status}: ${response.statusText}` });
              return;
            }
            // KaiSign API returns JSON - fetch as text
            const text = await response.text();
            sendResponse({ success: true, data: text });
          } catch (fetchError) {
            console.error('[KaiSign] API fetch error:', fetchError);
            sendResponse({ error: fetchError.message });
          }
          break;

        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('[KaiSign] Message handler error:', error);
      sendResponse({ error: error.message });
    }
  })();

  // Return true to indicate async response
  return true;
});

// Initialize on startup
initializeStorage();

console.log('[KaiSign] Background ready with chrome.storage.local');
