// KaiSign Extension - Background Service Worker
//
// Logging policy: gate happy-path logs behind BG_DEBUG (default off, flip via
// `globalThis.KAISIGN_BG_DEBUG = true` from the SW DevTools). console.warn /
// console.error stay ungated — those signal real failures.

const BG_DEBUG = (typeof globalThis !== 'undefined' && globalThis.KAISIGN_BG_DEBUG === true);

const STORAGE_KEYS = {
  TRANSACTIONS: 'kaisign-transactions',
  RPC_ACTIVITY: 'kaisign-rpc-activity',
  SETTINGS: 'kaisign-settings',
  VERIFICATION_STATUS: 'kaisign-verification-status'
};

const DEFAULT_VERIFICATION_STATUS = {
  registryAddress: '0x122d1ad78fdda6829f104cb8cbb56e5561e56ba8',
  merkleRoot: null,
  verificationMode: 'manual',
  lastUpdated: null,
  lastError: null,
  source: 'uninitialized'
};

const DEFAULT_SETTINGS = {
  maxTransactions: 100,
  notifications: true,
  rpcTracking: true,
  securityAlerts: true,
  theme: 'dark',
  verificationMode: 'manual'
};

async function initializeStorage() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.VERIFICATION_STATUS]);
    if (!result[STORAGE_KEYS.SETTINGS]) {
      await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS });
    }
    if (!result[STORAGE_KEYS.VERIFICATION_STATUS]) {
      await chrome.storage.local.set({ [STORAGE_KEYS.VERIFICATION_STATUS]: DEFAULT_VERIFICATION_STATUS });
    }
  } catch (error) {
    // Silent fail
  }
}

async function getSettings() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.SETTINGS]);
    return result[STORAGE_KEYS.SETTINGS] || DEFAULT_SETTINGS;
  } catch (error) {
    return DEFAULT_SETTINGS;
  }
}

async function saveTransaction(transaction) {
  try {
    const settings = await getSettings();
    const result = await chrome.storage.local.get([STORAGE_KEYS.TRANSACTIONS]);
    const transactions = result[STORAGE_KEYS.TRANSACTIONS] || [];
    if (transaction?.id && transactions.some((tx) => tx.id === transaction.id)) {
      return { success: true, count: transactions.length, deduped: true };
    }
    transactions.unshift(transaction);
    const maxTx = settings.maxTransactions || 100;
    if (transactions.length > maxTx) {
      transactions.splice(maxTx);
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.TRANSACTIONS]: transactions });
    return { success: true, count: transactions.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getTransactions() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.TRANSACTIONS]);
    return result[STORAGE_KEYS.TRANSACTIONS] || [];
  } catch (error) {
    return [];
  }
}

async function clearTransactions() {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.TRANSACTIONS]: [] });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function saveRpcActivity(activity) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.RPC_ACTIVITY]: activity });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

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
    return null;
  }
}

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
    return { success: false, error: error.message };
  }
}

async function saveSettings(settings) {
  try {
    const currentSettings = await getSettings();
    const newSettings = { ...currentSettings, ...settings };
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: newSettings });
    await saveVerificationStatus({
      verificationMode: newSettings.verificationMode === 'automatic' ? 'automatic' : 'manual'
    });

    // Broadcast settings to all tabs so content scripts can update localStorage
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'KAISIGN_SETTINGS_UPDATED',
          settings: newSettings
        }).catch(() => {}); // Ignore tabs without content script
      }
    } catch (broadcastError) {
      // Silent fail for broadcast - settings are still saved
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getVerificationStatus() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.VERIFICATION_STATUS]);
    return { ...DEFAULT_VERIFICATION_STATUS, ...(result[STORAGE_KEYS.VERIFICATION_STATUS] || {}) };
  } catch (error) {
    return { ...DEFAULT_VERIFICATION_STATUS };
  }
}

async function saveVerificationStatus(status) {
  try {
    const current = await getVerificationStatus();
    const next = {
      ...current,
      ...status
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.VERIFICATION_STATUS]: next });
    return { success: true, status: next };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function refreshVerificationStatus(registryAddress) {
  try {
    const settings = await getSettings();
    const current = await getVerificationStatus();
    const address = (registryAddress || current.registryAddress || DEFAULT_VERIFICATION_STATUS.registryAddress || '').toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      return { success: false, error: 'Invalid registry address' };
    }

    const rpcUrl = settings.rpcEndpoints?.['11155111']
      || settings.rpcEndpoints?.[11155111]
      || 'https://ethereum-sepolia-rpc.publicnode.com';

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to: address, data: '0x2eb4a7ab' }, 'latest'],
        id: 1
      })
    });
    if (!response.ok) {
      throw new Error(`RPC request failed with HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload.error) {
      throw new Error(payload.error.message || 'RPC error');
    }

    const rawResult = payload.result;
    const merkleRoot = rawResult && rawResult !== '0x' && rawResult.length >= 66
      ? `0x${rawResult.slice(2, 66).toLowerCase()}`
      : null;
    if (!merkleRoot) {
      throw new Error('Registry returned an empty merkle root');
    }

    return await saveVerificationStatus({
      registryAddress: address,
      merkleRoot,
      verificationMode: settings.verificationMode === 'automatic' ? 'automatic' : 'manual',
      lastUpdated: new Date().toISOString(),
      lastError: null,
      source: 'manual-refresh'
    });
  } catch (error) {
    await saveVerificationStatus({
      registryAddress: registryAddress || undefined,
      lastError: error.message,
      source: 'refresh-error'
    });
    return { success: false, error: error.message };
  }
}

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
    return { success: false, error: error.message };
  }
}

async function importData(data, mergeMode = false) {
  try {
    if (!data.version || !data.transactions) {
      return { success: false, error: 'Invalid data format' };
    }

    const currentData = await chrome.storage.local.get([STORAGE_KEYS.TRANSACTIONS]);
    let transactions = currentData[STORAGE_KEYS.TRANSACTIONS] || [];

    if (mergeMode) {
      const existingIds = new Set(transactions.map(tx => tx.id));
      const newTransactions = data.transactions.filter(tx => !existingIds.has(tx.id));
      transactions = [...newTransactions, ...transactions];
      transactions.sort((a, b) => new Date(b.time) - new Date(a.time));
    } else {
      transactions = data.transactions;
    }

    const settings = await getSettings();
    if (transactions.length > settings.maxTransactions) {
      transactions = transactions.slice(0, settings.maxTransactions);
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.TRANSACTIONS]: transactions });

    if (data.rpcActivity) {
      await chrome.storage.local.set({ [STORAGE_KEYS.RPC_ACTIVITY]: data.rpcActivity });
    }

    return {
      success: true,
      imported: transactions.length,
      message: mergeMode ? 'Data merged successfully' : 'Data imported successfully'
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'SAVE_TRANSACTION':
          sendResponse(await saveTransaction(message.data));
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
        case 'GET_VERIFICATION_STATUS':
          sendResponse({ status: await getVerificationStatus() });
          break;
        case 'SAVE_VERIFICATION_STATUS':
          sendResponse(await saveVerificationStatus(message.data));
          break;
        case 'REFRESH_VERIFICATION_STATUS':
          sendResponse(await refreshVerificationStatus(message.registryAddress));
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
          try {
            const ALLOWED_BLOB_HOSTS = ['kai-sign-production.up.railway.app'];
            let isAllowedBlob = false;
            try {
              const parsed = new URL(message.url);
              isAllowedBlob = parsed.protocol === 'https:' && ALLOWED_BLOB_HOSTS.includes(parsed.hostname);
            } catch { /* invalid URL */ }

            if (!isAllowedBlob) {
              sendResponse({ error: 'URL not in whitelist' });
              return;
            }

            BG_DEBUG && console.log('[KaiSign BG] FETCH_BLOB:', message.url);
            const response = await fetch(message.url);
            BG_DEBUG && console.log('[KaiSign BG] FETCH_BLOB status:', response.status, response.statusText);
            if (!response.ok) {
              console.warn('[KaiSign BG] FETCH_BLOB HTTP error:', response.status);
              sendResponse({ error: `HTTP ${response.status}: ${response.statusText}` });
              return;
            }
            const text = await response.text();
            BG_DEBUG && console.log('[KaiSign BG] FETCH_BLOB response length:', text.length, 'preview:', text.substring(0, 150));
            sendResponse({ success: true, data: text });
          } catch (fetchError) {
            console.warn('[KaiSign BG] FETCH_BLOB error:', fetchError.message);
            sendResponse({ error: fetchError.message });
          }
          break;
        case 'RPC_CALL':
          try {
            // Whitelist validation: only allow known RPC endpoints
            const ALLOWED_RPC_HOSTS = [
              'rpc.sepolia.org',
              'ethereum-sepolia-rpc.publicnode.com',
              'eth.llamarpc.com',
              'rpc.ankr.com',
              'ethereum.publicnode.com',
              'mainnet.base.org',
              'base.llamarpc.com',
              'localhost',
              '127.0.0.1'
            ];
            const ALLOWED_LOCAL_PORTS = ['3000', '3001', '8545'];
            let isAllowedRpc = false;
            try {
              const parsed = new URL(message.rpcUrl);
              const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
              isAllowedRpc = ALLOWED_RPC_HOSTS.includes(parsed.hostname) &&
                (parsed.protocol === 'https:' || (isLocalhost && parsed.protocol === 'http:' && ALLOWED_LOCAL_PORTS.includes(parsed.port)));
            } catch { /* invalid URL */ }

            if (!isAllowedRpc) {
              sendResponse({ error: 'RPC URL not in whitelist' });
              return;
            }

            const rpcResponse = await fetch(message.rpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: message.method,
                params: message.params,
                id: 1
              })
            });
            if (!rpcResponse.ok) {
              sendResponse({ error: 'RPC request failed' });
              return;
            }
            const rpcResult = await rpcResponse.json();
            if (rpcResult.error) {
              sendResponse({ error: rpcResult.error.message || 'RPC error' });
            } else {
              sendResponse({ success: true, result: rpcResult.result });
            }
          } catch (rpcError) {
            sendResponse({ error: rpcError.message });
          }
          break;
        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      sendResponse({ error: error.message });
    }
  })();
  return true;
});

initializeStorage();
