// KaiSign Extension - Options Page Script
console.log('[KaiSign] Options page loading...');

// DOM Elements - wait for DOM to be ready
let elements = {};

// Current RPC endpoints state (chainId -> url)
let rpcEndpointsState = {};

function initElements() {
  elements = {
    // Settings
    maxTransactions: document.getElementById('maxTransactions'),
    autoExport: document.getElementById('autoExport'),
    theme: document.getElementById('theme'),
    notifications: document.getElementById('notifications'),

    // Name Resolution
    enableNameResolution: document.getElementById('enableNameResolution'),

    // RPC Settings (dynamic)
    rpcEndpointsList: document.getElementById('rpcEndpointsList'),
    addRpcBtn: document.getElementById('addRpcBtn'),

    // Developer Settings
    backendApiUrl: document.getElementById('backendApiUrl'),

    // Storage info
    storageBar: document.getElementById('storageBar'),
    storageText: document.getElementById('storageText'),

    // Buttons
    saveBtn: document.getElementById('saveBtn'),
    exportAllBtn: document.getElementById('exportAllBtn'),
    importBtn: document.getElementById('importBtn'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    fileInput: document.getElementById('fileInput'),

    // Version and toast
    version: document.getElementById('version'),
    toast: document.getElementById('toast')
  };

  console.log('[KaiSign] Elements initialized:', {
    rpcEndpointsList: !!elements.rpcEndpointsList,
    addRpcBtn: !!elements.addRpcBtn,
    saveBtn: !!elements.saveBtn
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  initElements();
  loadSettings();
  loadStorageInfo();
  setupEventListeners();
  loadVersion();
}

// Load settings from storage
function loadSettings() {
  console.log('[KaiSign] Loading settings...');

  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
    console.log('[KaiSign] GET_SETTINGS response:', response);

    const settings = response?.settings || {};

    if (elements.maxTransactions) elements.maxTransactions.value = settings.maxTransactions || 100;
    if (elements.autoExport) elements.autoExport.checked = settings.autoExport || false;
    if (elements.theme) elements.theme.value = settings.theme || 'dark';
    if (elements.notifications) elements.notifications.checked = settings.notifications !== false;

    // Name Resolution settings
    if (elements.enableNameResolution) {
      elements.enableNameResolution.checked = settings.enableNameResolution !== false;
    }

    // RPC settings - load into state and render
    const rpcEndpoints = settings.rpcEndpoints || {};
    console.log('[KaiSign] RPC endpoints from settings:', rpcEndpoints);

    // Normalize keys to numbers and store in state
    rpcEndpointsState = {};
    for (const [chainId, url] of Object.entries(rpcEndpoints)) {
      if (url && url.trim()) {
        rpcEndpointsState[parseInt(chainId, 10)] = url.trim();
      }
    }

    // Render RPC endpoints
    renderRpcEndpoints();

    // Developer settings
    if (elements.backendApiUrl) {
      elements.backendApiUrl.value = settings.backendApiUrl || '';
    }

    console.log('[KaiSign] Settings loaded successfully');
  });
}

// Create placeholder message for empty RPC list
function createRpcPlaceholder() {
  const p = document.createElement('p');
  p.style.cssText = 'color: var(--text-secondary); font-size: 13px;';
  p.textContent = 'No custom RPC endpoints configured. Click "Add Chain" to add one.';
  return p;
}

// Render RPC endpoints list
function renderRpcEndpoints() {
  if (!elements.rpcEndpointsList) return;

  // Clear existing content
  while (elements.rpcEndpointsList.firstChild) {
    elements.rpcEndpointsList.removeChild(elements.rpcEndpointsList.firstChild);
  }

  const chainIds = Object.keys(rpcEndpointsState).map(Number).sort((a, b) => a - b);

  // If no endpoints, show placeholder
  if (chainIds.length === 0) {
    elements.rpcEndpointsList.appendChild(createRpcPlaceholder());
    return;
  }

  for (const chainId of chainIds) {
    const url = rpcEndpointsState[chainId];
    const row = createRpcEndpointRow(chainId, url);
    elements.rpcEndpointsList.appendChild(row);
  }
}

// Create a single RPC endpoint row element using safe DOM methods
function createRpcEndpointRow(chainId = '', url = '') {
  const row = document.createElement('div');
  row.className = 'rpc-endpoint-row';
  row.dataset.chainId = chainId;

  // Chain ID container
  const chainDiv = document.createElement('div');
  chainDiv.className = 'rpc-chain-id';

  const chainLabel = document.createElement('label');
  chainLabel.textContent = 'Chain ID';
  chainDiv.appendChild(chainLabel);

  const chainInput = document.createElement('input');
  chainInput.type = 'number';
  chainInput.className = 'rpc-chain-input';
  chainInput.value = chainId;
  chainInput.placeholder = 'e.g., 1';
  chainInput.min = '1';
  chainDiv.appendChild(chainInput);

  // URL container
  const urlDiv = document.createElement('div');
  urlDiv.className = 'rpc-url';

  const urlLabel = document.createElement('label');
  urlLabel.textContent = 'RPC URL';
  urlDiv.appendChild(urlLabel);

  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.className = 'rpc-url-input';
  urlInput.value = url;
  urlInput.placeholder = 'https://...';
  urlDiv.appendChild(urlInput);

  // Remove button
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'rpc-remove-btn';
  removeBtn.title = 'Remove';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'currentColor');

  const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path1.setAttribute('d', 'M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z');
  svg.appendChild(path1);

  const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path2.setAttribute('fill-rule', 'evenodd');
  path2.setAttribute('d', 'M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4L4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z');
  svg.appendChild(path2);

  removeBtn.appendChild(svg);

  // Assemble row
  row.appendChild(chainDiv);
  row.appendChild(urlDiv);
  row.appendChild(removeBtn);

  // Add remove button handler
  removeBtn.addEventListener('click', () => {
    const currentChainId = row.dataset.chainId;
    if (currentChainId) {
      delete rpcEndpointsState[parseInt(currentChainId, 10)];
    }
    row.remove();

    // Show placeholder if list is empty
    if (Object.keys(rpcEndpointsState).length === 0 && elements.rpcEndpointsList.children.length === 0) {
      elements.rpcEndpointsList.appendChild(createRpcPlaceholder());
    }
  });

  // Track chain ID changes
  chainInput.addEventListener('change', () => {
    const oldChainId = row.dataset.chainId;
    const newChainId = parseInt(chainInput.value, 10);

    // Remove old entry from state
    if (oldChainId) {
      delete rpcEndpointsState[parseInt(oldChainId, 10)];
    }

    // Update row's chainId reference
    if (!isNaN(newChainId) && newChainId > 0) {
      row.dataset.chainId = newChainId;
      if (urlInput.value.trim()) {
        rpcEndpointsState[newChainId] = urlInput.value.trim();
      }
    } else {
      row.dataset.chainId = '';
    }
  });

  // Track URL changes
  urlInput.addEventListener('change', () => {
    const currentChainId = parseInt(row.dataset.chainId, 10);
    if (!isNaN(currentChainId) && currentChainId > 0) {
      if (urlInput.value.trim()) {
        rpcEndpointsState[currentChainId] = urlInput.value.trim();
      } else {
        delete rpcEndpointsState[currentChainId];
      }
    }
  });

  return row;
}

// Add a new RPC endpoint row
function addRpcEndpoint() {
  // Remove placeholder if present
  const placeholder = elements.rpcEndpointsList.querySelector('p');
  if (placeholder) {
    placeholder.remove();
  }

  const row = createRpcEndpointRow('', '');
  elements.rpcEndpointsList.appendChild(row);

  // Focus the chain ID input
  const chainInput = row.querySelector('.rpc-chain-input');
  chainInput.focus();
}

// Load storage info
function loadStorageInfo() {
  chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
    if (response) {
      const maxTx = parseInt(elements.maxTransactions.value) || 100;
      const txCount = response.transactionCount || 0;
      const percentage = Math.min((txCount / maxTx) * 100, 100);

      elements.storageBar.style.width = `${percentage}%`;
      elements.storageText.textContent = `${txCount} / ${maxTx} transactions`;

      // Color coding
      if (percentage > 80) {
        elements.storageBar.style.background = 'var(--accent-red)';
      } else if (percentage > 60) {
        elements.storageBar.style.background = 'var(--accent-orange)';
      } else {
        elements.storageBar.style.background = 'var(--accent-blue)';
      }
    }
  });
}

// Load version
function loadVersion() {
  const manifest = chrome.runtime.getManifest();
  elements.version.textContent = manifest.version;
}

// Setup event listeners
function setupEventListeners() {
  // Save settings
  elements.saveBtn.addEventListener('click', saveSettings);

  // Export all data
  elements.exportAllBtn.addEventListener('click', exportAllData);

  // Import data
  elements.importBtn.addEventListener('click', () => {
    elements.fileInput.click();
  });

  elements.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleImport(file);
  });

  // Clear all data
  elements.clearAllBtn.addEventListener('click', clearAllData);

  // Update storage info when max transactions changes
  elements.maxTransactions.addEventListener('change', loadStorageInfo);

  // Add RPC endpoint
  if (elements.addRpcBtn) {
    elements.addRpcBtn.addEventListener('click', addRpcEndpoint);
  }
}

// Save settings
function saveSettings() {
  // Collect RPC endpoints from current DOM state (in case user hasn't blurred inputs)
  const rpcEndpoints = {};
  if (elements.rpcEndpointsList) {
    const rows = elements.rpcEndpointsList.querySelectorAll('.rpc-endpoint-row');
    rows.forEach(row => {
      const chainInput = row.querySelector('.rpc-chain-input');
      const urlInput = row.querySelector('.rpc-url-input');
      const chainId = parseInt(chainInput?.value, 10);
      const url = urlInput?.value?.trim();

      if (!isNaN(chainId) && chainId > 0 && url) {
        rpcEndpoints[chainId] = url;
      }
    });
  }

  // Update state to match what we're saving
  rpcEndpointsState = { ...rpcEndpoints };

  const settings = {
    maxTransactions: parseInt(elements.maxTransactions?.value) || 100,
    autoExport: elements.autoExport?.checked || false,
    theme: elements.theme?.value || 'dark',
    notifications: elements.notifications?.checked !== false,
    enableNameResolution: elements.enableNameResolution?.checked !== false,
    rpcEndpoints: rpcEndpoints,
    backendApiUrl: elements.backendApiUrl?.value?.trim() || ''
  };

  console.log('[KaiSign] Saving settings:', settings);

  // Validate max transactions
  if (settings.maxTransactions < 10) settings.maxTransactions = 10;
  if (settings.maxTransactions > 500) settings.maxTransactions = 500;
  elements.maxTransactions.value = settings.maxTransactions;

  chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', data: settings }, (response) => {
    if (response?.success) {
      showToast('Settings saved', 'success');
      loadStorageInfo();

      // Update name resolution service with new config
      if (window.nameResolutionService) {
        window.nameResolutionService.updateConfig({
          enabled: settings.enableNameResolution
        });
      }
    } else {
      showToast('Failed to save settings', 'error');
    }
  });
}

// Export all data
function exportAllData() {
  chrome.runtime.sendMessage({ type: 'EXPORT_DATA' }, (response) => {
    if (!response?.success) {
      showToast('Export failed', 'error');
      return;
    }

    const data = response.data;
    const content = JSON.stringify(data, null, 2);
    const filename = `kaisign-full-export-${Date.now()}.json`;

    downloadFile(content, filename, 'application/json');
    showToast('Data exported successfully', 'success');
  });
}

// Download file helper
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Handle import
function handleImport(file) {
  // Validate file size (5MB max)
  if (file.size > 5 * 1024 * 1024) {
    showToast('File too large (max 5MB)', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      // Validate structure
      if (!data.version || !data.transactions) {
        showToast('Invalid file format', 'error');
        return;
      }

      // Confirm import
      const txCount = data.transactions.length;
      if (!confirm(`Import ${txCount} transactions?\n\nThis will replace all existing data.`)) {
        return;
      }

      chrome.runtime.sendMessage({
        type: 'IMPORT_DATA',
        data: data,
        mergeMode: false
      }, (response) => {
        if (response?.success) {
          showToast(`Imported ${response.imported} transactions`, 'success');
          loadStorageInfo();
        } else {
          showToast(response?.error || 'Import failed', 'error');
        }
      });
    } catch (error) {
      showToast('Invalid JSON file', 'error');
    }
  };
  reader.readAsText(file);

  // Reset file input
  elements.fileInput.value = '';
}

// Clear all data
function clearAllData() {
  if (!confirm('Are you sure you want to clear ALL data?\n\nThis action cannot be undone.')) {
    return;
  }

  // Double confirmation for destructive action
  if (!confirm('This will permanently delete:\n- All transactions\n- RPC activity data\n\nProceed?')) {
    return;
  }

  Promise.all([
    new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'CLEAR_TRANSACTIONS' }, resolve);
    }),
    new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'CLEAR_RPC_ACTIVITY' }, resolve);
    })
  ]).then(() => {
    showToast('All data cleared', 'success');
    loadStorageInfo();
  }).catch(() => {
    showToast('Failed to clear data', 'error');
  });
}

// Show toast notification
function showToast(message, type = 'info') {
  elements.toast.textContent = message;
  elements.toast.className = `toast ${type} show`;

  setTimeout(() => {
    elements.toast.classList.remove('show');
  }, 3000);
}

console.log('[KaiSign] Options page ready');
