// KaiSign Extension - Options Page Script
console.log('[KaiSign] Options page loading...');

// DOM Elements
const elements = {
  // Settings
  maxTransactions: document.getElementById('maxTransactions'),
  autoExport: document.getElementById('autoExport'),
  theme: document.getElementById('theme'),
  notifications: document.getElementById('notifications'),
  rpcTracking: document.getElementById('rpcTracking'),
  securityAlerts: document.getElementById('securityAlerts'),

  // Name Resolution
  enableNameResolution: document.getElementById('enableNameResolution'),
  alchemyApiKey: document.getElementById('alchemyApiKey'),

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

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  loadSettings();
  loadStorageInfo();
  setupEventListeners();
  loadVersion();
}

// Load settings from storage
function loadSettings() {
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
    const settings = response?.settings || {};

    elements.maxTransactions.value = settings.maxTransactions || 100;
    elements.autoExport.checked = settings.autoExport || false;
    if (elements.theme) {
      elements.theme.value = settings.theme || 'dark';
    }
    elements.notifications.checked = settings.notifications !== false;
    elements.rpcTracking.checked = settings.rpcTracking !== false;
    elements.securityAlerts.checked = settings.securityAlerts !== false;

    // Name Resolution settings
    if (elements.enableNameResolution) {
      elements.enableNameResolution.checked = settings.enableNameResolution !== false;
    }
    if (elements.alchemyApiKey) {
      elements.alchemyApiKey.value = settings.alchemyApiKey || '';
    }

    console.log('[KaiSign] Settings loaded:', settings);
  });
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
}

// Save settings
function saveSettings() {
  const settings = {
    maxTransactions: parseInt(elements.maxTransactions.value) || 100,
    autoExport: elements.autoExport.checked,
    theme: elements.theme ? elements.theme.value : 'dark',
    notifications: elements.notifications.checked,
    rpcTracking: elements.rpcTracking.checked,
    securityAlerts: elements.securityAlerts.checked,
    enableNameResolution: elements.enableNameResolution ? elements.enableNameResolution.checked : true,
    alchemyApiKey: elements.alchemyApiKey ? elements.alchemyApiKey.value.trim() : ''
  };

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
          alchemyApiKey: settings.alchemyApiKey,
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
