// KaiSign Extension - Popup Script
console.log('[KaiSign] Popup loading...');

// State
let transactions = [];
let currentFilter = 'all';
let currentSearch = '';
let importData = null;

// DOM Elements
const elements = {
  txCount: document.getElementById('txCount'),
  rpcCount: document.getElementById('rpcCount'),
  txList: document.getElementById('txList'),
  loadingState: document.getElementById('loadingState'),
  searchInput: document.getElementById('searchInput'),
  filterTags: document.getElementById('filterTags'),
  exportBtn: document.getElementById('exportBtn'),
  exportDropdown: document.getElementById('exportDropdown'),
  importBtn: document.getElementById('importBtn'),
  importModal: document.getElementById('importModal'),
  clearBtn: document.getElementById('clearBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  fileDrop: document.getElementById('fileDrop'),
  fileInput: document.getElementById('fileInput'),
  confirmImport: document.getElementById('confirmImport'),
  cancelImport: document.getElementById('cancelImport'),
  closeModal: document.getElementById('closeModal'),
  toast: document.getElementById('toast')
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadData();
  setupEventListeners();
}

// Load data from storage
async function loadData() {
  try {
    // Get stats
    chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
      if (response) {
        elements.txCount.textContent = response.transactionCount || 0;
        elements.rpcCount.textContent = response.rpcCallCount || 0;
      }
    });

    // Get transactions
    chrome.runtime.sendMessage({ type: 'GET_TRANSACTIONS' }, (response) => {
      transactions = response?.transactions || [];
      renderTransactions();
    });
  } catch (error) {
    console.error('[KaiSign] Load error:', error);
    showToast('Failed to load data', 'error');
  }
}

// Categorize transaction by intent
function categorizeTransaction(tx) {
  const intent = (tx.intent || '').toLowerCase();
  const method = (tx.method || '').toLowerCase();

  if (intent.includes('swap') || intent.includes('exchange') ||
      method.includes('swap') || method.includes('exactinput') || method.includes('exactoutput')) {
    return 'swap';
  }
  if (intent.includes('transfer') || intent.includes('send') ||
      method.includes('transfer') || method === 'eth_sendtransaction') {
    return 'transfer';
  }
  if (intent.includes('approve') || intent.includes('allowance') ||
      method.includes('approve') || method.includes('permit')) {
    return 'approval';
  }
  return 'other';
}

// Get icon for transaction category
function getTxIcon(category) {
  const icons = {
    swap: '↔️',
    transfer: '➡️',
    approval: '✓',
    other: '📄'
  };
  return icons[category] || icons.other;
}

// Generate meaningful title for transaction
function generateMeaningfulTitle(tx) {
  // 1. Try decoded protocol name
  if (tx.decodedResult?.protocolName) {
    return tx.decodedResult.protocolName;
  }

  // 2. Try intent if meaningful (filter out useless text)
  if (tx.intent) {
    const intent = tx.intent;
    const invalidPatterns = [
      'Parsing',
      'Loading',
      'Contract interaction',
      'Unknown',
      '...',
      'undefined'
    ];

    // Check if intent is useful
    const isUseful = !invalidPatterns.some(pattern =>
      intent.toLowerCase().includes(pattern.toLowerCase())
    );

    if (isUseful && intent.length > 3) {
      // Truncate if too long
      if (intent.length > 50) {
        return intent.slice(0, 47) + '...';
      }
      return intent;
    }
  }

  // 3. Try function name from decoded result
  if (tx.decodedResult?.functionName) {
    return tx.decodedResult.functionName;
  }

  // 4. Try method name (clean it up)
  if (tx.method) {
    const method = tx.method;
    // Clean up method name if it's a signature
    if (method.includes('eth_')) {
      const methodMap = {
        'eth_sendTransaction': 'Send Transaction',
        'eth_signTypedData_v4': 'Sign Message',
        'eth_sign': 'Sign Message',
        'eth_call': 'Contract Call'
      };
      return methodMap[method] || method;
    }
    return method;
  }

  // 5. Fallback to contract address
  if (tx.to) {
    return `Contract ${tx.to.slice(0, 8)}...${tx.to.slice(-6)}`;
  }

  return 'Transaction';
}

// Filter transactions
function filterTransactions(txs) {
  return txs.filter(tx => {
    // Category filter
    if (currentFilter !== 'all') {
      const category = categorizeTransaction(tx);
      if (category !== currentFilter) return false;
    }

    // Search filter
    if (currentSearch) {
      const searchLower = currentSearch.toLowerCase();
      const matchesSearch =
        (tx.intent || '').toLowerCase().includes(searchLower) ||
        (tx.to || '').toLowerCase().includes(searchLower) ||
        (tx.method || '').toLowerCase().includes(searchLower) ||
        (tx.data || '').toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    return true;
  });
}

// Render transactions
function renderTransactions() {
  elements.loadingState.style.display = 'none';

  const filtered = filterTransactions(transactions);

  if (filtered.length === 0) {
    elements.txList.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M5 4a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H5zm-.5 2.5A.5.5 0 0 1 5 6h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zM5 8a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H5zm0 2a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1H5z"/>
          <path fill-rule="evenodd" d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2zm10-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1z"/>
        </svg>
        <p>${currentSearch || currentFilter !== 'all' ? 'No matching transactions' : 'No transactions yet'}</p>
      </div>
    `;
    return;
  }

  elements.txList.innerHTML = filtered.map(tx => {
    const category = categorizeTransaction(tx);
    const icon = getTxIcon(category);
    const time = tx.time ? new Date(tx.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const intent = generateMeaningfulTitle(tx);
    const method = tx.method || '';

    return `
      <div class="tx-item" data-id="${tx.id || ''}">
        <div class="tx-icon ${category}">${icon}</div>
        <div class="tx-content">
          <div class="tx-intent">${escapeHtml(intent)}</div>
          <div class="tx-meta">
            <span class="tx-method">${escapeHtml(method)}</span>
            <span class="tx-time">${time}</span>
          </div>
        </div>
        <span class="tx-arrow">›</span>
      </div>
    `;
  }).join('');
}

// Setup event listeners
function setupEventListeners() {
  // Search
  elements.searchInput.addEventListener('input', (e) => {
    currentSearch = e.target.value;
    renderTransactions();
  });

  // Filter tags
  elements.filterTags.addEventListener('click', (e) => {
    if (e.target.classList.contains('filter-tag')) {
      document.querySelectorAll('.filter-tag').forEach(tag => tag.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      renderTransactions();
    }
  });

  // Export button toggle
  elements.exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.exportDropdown.classList.toggle('show');
  });

  // Export options
  elements.exportDropdown.addEventListener('click', (e) => {
    const option = e.target.closest('.export-option');
    if (option) {
      const format = option.dataset.format;
      handleExport(format);
      elements.exportDropdown.classList.remove('show');
    }
  });

  // Close dropdown on outside click
  document.addEventListener('click', () => {
    elements.exportDropdown.classList.remove('show');
  });

  // Import button
  elements.importBtn.addEventListener('click', () => {
    elements.importModal.classList.add('show');
  });

  // Close modal
  elements.closeModal.addEventListener('click', closeImportModal);
  elements.cancelImport.addEventListener('click', closeImportModal);
  elements.importModal.addEventListener('click', (e) => {
    if (e.target === elements.importModal) closeImportModal();
  });

  // File drop area
  elements.fileDrop.addEventListener('click', () => {
    elements.fileInput.click();
  });

  elements.fileDrop.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.fileDrop.classList.add('dragover');
  });

  elements.fileDrop.addEventListener('dragleave', () => {
    elements.fileDrop.classList.remove('dragover');
  });

  elements.fileDrop.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.fileDrop.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  });

  elements.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFileSelect(file);
  });

  // Confirm import
  elements.confirmImport.addEventListener('click', handleImport);

  // Clear button
  elements.clearBtn.addEventListener('click', handleClear);

  // Settings button
  elements.settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Refresh button
  elements.refreshBtn.addEventListener('click', () => {
    elements.loadingState.style.display = 'flex';
    loadData();
  });

  // Transaction item click
  elements.txList.addEventListener('click', (e) => {
    const item = e.target.closest('.tx-item');
    if (item) {
      const txId = item.dataset.id;
      const tx = transactions.find(t => t.id === txId);
      if (tx) {
        showTransactionDetails(tx);
      }
    }
  });
}

// Handle export
async function handleExport(format) {
  try {
    chrome.runtime.sendMessage({ type: 'EXPORT_DATA' }, (response) => {
      if (!response?.success) {
        showToast('Export failed', 'error');
        return;
      }

      const data = response.data;
      let content, filename, mimeType;

      if (format === 'json') {
        content = JSON.stringify(data, null, 2);
        filename = `kaisign-export-${Date.now()}.json`;
        mimeType = 'application/json';
      } else if (format === 'csv') {
        content = convertToCSV(data.transactions);
        filename = `kaisign-transactions-${Date.now()}.csv`;
        mimeType = 'text/csv';
      }

      downloadFile(content, filename, mimeType);
      showToast(`Exported as ${format.toUpperCase()}`, 'success');
    });
  } catch (error) {
    console.error('[KaiSign] Export error:', error);
    showToast('Export failed', 'error');
  }
}

// Convert transactions to CSV
function convertToCSV(transactions) {
  const headers = ['id', 'time', 'method', 'intent', 'to', 'value', 'data'];
  const rows = [headers.join(',')];

  for (const tx of transactions) {
    const row = headers.map(h => {
      let value = tx[h] || '';
      // Escape quotes and wrap in quotes if contains comma
      if (typeof value === 'string') {
        value = value.replace(/"/g, '""');
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          value = `"${value}"`;
        }
      }
      return value;
    });
    rows.push(row.join(','));
  }

  return rows.join('\n');
}

// Download file
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Handle file select for import
function handleFileSelect(file) {
  // Validate file size (5MB max)
  if (file.size > 5 * 1024 * 1024) {
    showToast('File too large (max 5MB)', 'error');
    return;
  }

  // Validate file type
  if (!file.name.endsWith('.json')) {
    showToast('Only JSON files are supported', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      importData = JSON.parse(e.target.result);

      // Validate structure
      if (!importData.version || !importData.transactions) {
        showToast('Invalid file format', 'error');
        importData = null;
        return;
      }

      elements.fileDrop.innerHTML = `
        <svg viewBox="0 0 16 16" fill="currentColor" style="color: var(--accent-green)">
          <path fill-rule="evenodd" d="M10.354 6.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7 8.793l2.646-2.647a.5.5 0 0 1 .708 0z"/>
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z"/>
        </svg>
        <p style="color: var(--accent-green)">${file.name}</p>
        <p class="hint">${importData.transactions.length} transactions</p>
      `;

      elements.confirmImport.disabled = false;
    } catch (error) {
      showToast('Invalid JSON file', 'error');
      importData = null;
    }
  };
  reader.readAsText(file);
}

// Handle import confirmation
function handleImport() {
  if (!importData) return;

  const mergeMode = document.getElementById('importMerge').checked;

  chrome.runtime.sendMessage({
    type: 'IMPORT_DATA',
    data: importData,
    mergeMode
  }, (response) => {
    if (response?.success) {
      showToast(response.message, 'success');
      closeImportModal();
      loadData();
    } else {
      showToast(response?.error || 'Import failed', 'error');
    }
  });
}

// Close import modal
function closeImportModal() {
  elements.importModal.classList.remove('show');
  importData = null;
  elements.confirmImport.disabled = true;
  elements.fileInput.value = '';
  elements.fileDrop.innerHTML = `
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
      <path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/>
    </svg>
    <p>Drop JSON file here or click to browse</p>
    <p class="hint">Max file size: 5MB</p>
  `;
}

// Handle clear
function handleClear() {
  if (!confirm('Are you sure you want to clear all transaction data?')) return;

  chrome.runtime.sendMessage({ type: 'CLEAR_TRANSACTIONS' }, (response) => {
    if (response?.success) {
      transactions = [];
      renderTransactions();
      elements.txCount.textContent = '0';
      showToast('Data cleared', 'success');
    } else {
      showToast('Failed to clear data', 'error');
    }
  });
}

// Show transaction details (simple alert for now, can be enhanced)
function showTransactionDetails(tx) {
  const details = `
Intent: ${tx.intent || 'N/A'}
Method: ${tx.method || 'N/A'}
To: ${tx.to || 'N/A'}
Value: ${tx.value || '0x0'}
Time: ${tx.time ? new Date(tx.time).toLocaleString() : 'N/A'}
  `.trim();

  // For EIP-712 signatures, copy the complete typed data JSON
  // For regular transactions, copy the raw bytecode
  let dataToCopy;
  if (tx.isEIP712 && tx.eip712TypedData) {
    dataToCopy = JSON.stringify(tx.eip712TypedData, null, 2);
  } else {
    dataToCopy = tx.data || '0x';
  }

  // Copy data to clipboard
  navigator.clipboard.writeText(dataToCopy).then(() => {
    const dataType = tx.isEIP712 ? 'EIP-712 typed data' : 'Transaction bytecode';
    alert(details + `\n\n${dataType} copied to clipboard!`);
  }).catch(() => {
    alert(details);
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

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

console.log('[KaiSign] Popup ready');
