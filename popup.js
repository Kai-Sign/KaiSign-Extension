/**
 * KaiSign Extension - Popup JavaScript
 * Handles the popup UI and communication with background script
 */

class KaiSignPopup {
  constructor() {
    this.transactions = [];
    this.settings = {};
    this.currentTab = 'transactions';
    this.init();
  }

  async init() {
    console.log('[KaiSign-Popup] Initializing...');
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Load initial data
    await this.loadSettings();
    await this.loadTransactions();
    
    // Set up auto-refresh
    this.startAutoRefresh();
    
    console.log('[KaiSign-Popup] Initialized successfully');
  }

  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Action buttons
    document.getElementById('refresh-btn').addEventListener('click', () => {
      this.loadTransactions();
    });

    document.getElementById('clear-btn').addEventListener('click', () => {
      this.clearTransactions();
    });

    document.getElementById('clear-all-btn').addEventListener('click', () => {
      this.clearAllData();
    });

    document.getElementById('export-btn').addEventListener('click', () => {
      this.exportData();
    });

    // Settings
    document.getElementById('show-notifications').addEventListener('change', (e) => {
      this.updateSetting('showNotifications', e.target.checked);
    });

    document.getElementById('eip7702-only').addEventListener('change', (e) => {
      this.updateSetting('showEIP7702Only', e.target.checked);
    });

    document.getElementById('max-transactions').addEventListener('change', (e) => {
      this.updateSetting('maxTransactions', parseInt(e.target.value));
    });

    // Modal
    document.getElementById('modal-close').addEventListener('click', () => {
      this.closeModal();
    });

    document.getElementById('close-modal').addEventListener('click', () => {
      this.closeModal();
    });

    document.getElementById('copy-transaction').addEventListener('click', () => {
      this.copyTransactionData();
    });

    // Close modal on background click
    document.getElementById('transaction-modal').addEventListener('click', (e) => {
      if (e.target.id === 'transaction-modal') {
        this.closeModal();
      }
    });
  }

  switchTab(tabName) {
    // Update buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');

    this.currentTab = tabName;

    // Load specific tab data
    if (tabName === 'eip7702') {
      this.loadEIP7702Transactions();
    } else if (tabName === 'settings') {
      this.loadDebugInfo();
    }
  }

  async loadSettings() {
    try {
      const result = await this.sendMessage({ type: 'GET_SETTINGS' });
      if (result.success) {
        this.settings = result.settings;
        this.updateSettingsUI();
      }
    } catch (error) {
      console.error('[KaiSign-Popup] Error loading settings:', error);
    }
  }

  async loadTransactions() {
    try {
      // Try background script first
      const result = await this.sendMessage({ type: 'GET_TRANSACTION_HISTORY' });
      if (result && result.success) {
        this.transactions = result.data.transactions;
        this.updateTransactionSummary();
        this.updateTransactionList();
        return;
      }
    } catch (error) {
      console.log('[KaiSign-Popup] Background script not available, trying direct storage:', error.message);
    }

    // Fallback: try direct storage access
    try {
      const data = await chrome.storage.local.get(['transactionHistory', 'allTransactions']);
      console.log('[KaiSign-Popup] Direct storage data:', data);
      
      this.transactions = data.transactionHistory || data.allTransactions || [];
      this.updateTransactionSummary();
      this.updateTransactionList();
      
      if (this.transactions.length > 0) {
        console.log('[KaiSign-Popup] Loaded', this.transactions.length, 'transactions from direct storage');
      }
    } catch (error) {
      console.error('[KaiSign-Popup] Error with direct storage access:', error);
    }
  }

  updateTransactionSummary() {
    const totalCount = this.transactions.length;
    const eip7702Count = this.transactions.filter(tx => tx.transaction?.isEIP7702).length;
    const recentCount = this.transactions.filter(tx => {
      const age = Date.now() - new Date(tx.timestamp).getTime();
      return age < 24 * 60 * 60 * 1000; // Last 24 hours
    }).length;

    document.getElementById('total-transactions').textContent = totalCount;
    document.getElementById('eip7702-count').textContent = eip7702Count;
    document.getElementById('recent-count').textContent = recentCount;
  }

  updateTransactionList() {
    const listContainer = document.getElementById('transaction-list');
    const noTransactionsDiv = document.getElementById('no-transactions');

    if (this.transactions.length === 0) {
      noTransactionsDiv.style.display = 'block';
      return;
    }

    noTransactionsDiv.style.display = 'none';

    // Clear existing items
    const existingItems = listContainer.querySelectorAll('.transaction-item');
    existingItems.forEach(item => item.remove());

    // Add transaction items
    this.transactions.forEach(transaction => {
      const item = this.createTransactionItem(transaction);
      listContainer.appendChild(item);
    });
  }

  createTransactionItem(transactionData) {
    const item = document.createElement('div');
    item.className = `transaction-item ${transactionData.transaction?.isEIP7702 ? 'eip7702' : ''}`;
    item.addEventListener('click', () => {
      this.showTransactionDetails(transactionData);
    });

    const time = new Date(transactionData.timestamp).toLocaleTimeString();
    const type = transactionData.transaction?.isEIP7702 ? '🚀 EIP-7702' : '📤 Standard';
    const to = transactionData.transaction?.to?.slice(0, 20) || 'Unknown';
    const authCount = transactionData.transaction?.authorizationCount || 0;

    item.innerHTML = `
      <div class="transaction-header">
        <span class="transaction-type ${transactionData.transaction?.isEIP7702 ? 'eip7702' : ''}">${type}</span>
        <span class="transaction-time">${time}</span>
      </div>
      <div class="transaction-details">
        <div>To: <span class="transaction-address">${to}...</span></div>
        ${transactionData.transaction?.isEIP7702 ? `<div>📋 ${authCount} authorization(s)</div>` : ''}
        <div>Method: ${transactionData.method}</div>
      </div>
    `;

    return item;
  }

  loadEIP7702Transactions() {
    const eip7702Transactions = this.transactions.filter(tx => tx.transaction?.isEIP7702);
    const container = document.getElementById('eip7702-transactions');
    const noEIP7702Div = document.getElementById('no-eip7702');

    if (eip7702Transactions.length === 0) {
      noEIP7702Div.style.display = 'block';
      return;
    }

    noEIP7702Div.style.display = 'none';

    // Clear existing items
    const existingItems = container.querySelectorAll('.transaction-item');
    existingItems.forEach(item => item.remove());

    // Add EIP-7702 transaction items
    eip7702Transactions.forEach(transaction => {
      const item = this.createEIP7702Item(transaction);
      container.appendChild(item);
    });
  }

  createEIP7702Item(transactionData) {
    const item = document.createElement('div');
    item.className = 'transaction-item eip7702';
    item.addEventListener('click', () => {
      this.showTransactionDetails(transactionData);
    });

    const time = new Date(transactionData.timestamp).toLocaleTimeString();
    const to = transactionData.transaction?.to?.slice(0, 30) || 'Unknown';
    const authList = transactionData.transaction?.authorizationList || [];

    let authListHtml = '';
    if (authList.length > 0) {
      const authSummary = authList.slice(0, 2).map(auth => 
        `${auth.address?.slice(0, 15)}... (Chain: ${auth.chainId})`
      ).join('<br>');
      
      authListHtml = `
        <div class="authorization-list">
          ${authSummary}
          ${authList.length > 2 ? `<br>... and ${authList.length - 2} more` : ''}
        </div>
      `;
    }

    item.innerHTML = `
      <div class="transaction-header">
        <span class="transaction-type eip7702">🚀 EIP-7702 Account Abstraction</span>
        <span class="transaction-time">${time}</span>
      </div>
      <div class="transaction-details">
        <div>To: <span class="transaction-address">${to}</span></div>
        <div>📋 ${authList.length} authorization(s)</div>
        ${authListHtml}
      </div>
    `;

    return item;
  }

  showTransactionDetails(transactionData) {
    const modal = document.getElementById('transaction-modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');

    const isEIP7702 = transactionData.transaction?.isEIP7702;
    title.textContent = isEIP7702 ? '🚀 EIP-7702 Transaction Details' : '📤 Transaction Details';

    let detailsHtml = `
      <div style="margin-bottom: 20px;">
        <h4>Basic Information</h4>
        <p><strong>Type:</strong> ${transactionData.transaction?.type}</p>
        <p><strong>Method:</strong> ${transactionData.method}</p>
        <p><strong>Timestamp:</strong> ${new Date(transactionData.timestamp).toLocaleString()}</p>
        <p><strong>To:</strong> <code>${transactionData.transaction?.to}</code></p>
        <p><strong>From:</strong> <code>${transactionData.transaction?.from}</code></p>
        <p><strong>Value:</strong> ${transactionData.transaction?.value}</p>
      </div>
    `;

    if (isEIP7702 && transactionData.transaction?.authorizationList) {
      const authList = transactionData.transaction.authorizationList;
      detailsHtml += `
        <div style="margin-bottom: 20px;">
          <h4>🔐 Authorization List (${authList.length})</h4>
          ${authList.map((auth, index) => `
            <div style="background: #f7fafc; padding: 12px; margin: 8px 0; border-radius: 6px; border-left: 4px solid #667eea;">
              <p><strong>Authorization ${index + 1}</strong></p>
              <p><strong>Address:</strong> <code>${auth.address}</code></p>
              <p><strong>Chain ID:</strong> ${auth.chainId}</p>
              <p><strong>Nonce:</strong> ${auth.nonce}</p>
              ${auth.yParity !== undefined ? `<p><strong>Y Parity:</strong> ${auth.yParity}</p>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    }

    if (transactionData.validation) {
      const validation = transactionData.validation;
      detailsHtml += `
        <div style="margin-bottom: 20px;">
          <h4>🔍 Validation</h4>
          <p><strong>Valid:</strong> ${validation.isValid ? '✅ Yes' : '❌ No'}</p>
          ${validation.warnings?.length ? `<p><strong>Warnings:</strong> ${validation.warnings.join(', ')}</p>` : ''}
          ${validation.errors?.length ? `<p><strong>Errors:</strong> ${validation.errors.join(', ')}</p>` : ''}
        </div>
      `;
    }

    detailsHtml += `
      <div>
        <h4>📋 Raw Transaction Data</h4>
        <div class="code-block">${JSON.stringify(transactionData.transaction?.rawTransaction || transactionData.originalCall, null, 2)}</div>
      </div>
    `;

    body.innerHTML = detailsHtml;
    modal.classList.add('active');

    // Store current transaction for copying
    this.currentModalTransaction = transactionData;
  }

  closeModal() {
    document.getElementById('transaction-modal').classList.remove('active');
    this.currentModalTransaction = null;
  }

  async copyTransactionData() {
    if (!this.currentModalTransaction) return;

    try {
      const data = JSON.stringify(this.currentModalTransaction, null, 2);
      await navigator.clipboard.writeText(data);
      
      // Show feedback
      const button = document.getElementById('copy-transaction');
      const originalText = button.textContent;
      button.textContent = '✅ Copied!';
      setTimeout(() => {
        button.textContent = originalText;
      }, 2000);
    } catch (error) {
      console.error('[KaiSign-Popup] Error copying to clipboard:', error);
    }
  }

  updateSettingsUI() {
    document.getElementById('show-notifications').checked = this.settings.showNotifications ?? true;
    document.getElementById('eip7702-only').checked = this.settings.showEIP7702Only ?? false;
    document.getElementById('max-transactions').value = this.settings.maxTransactions ?? 50;
  }

  async updateSetting(key, value) {
    try {
      const result = await this.sendMessage({
        type: 'UPDATE_SETTINGS',
        data: { [key]: value }
      });
      
      if (result.success) {
        this.settings = result.settings;
        console.log('[KaiSign-Popup] Setting updated:', key, value);
      }
    } catch (error) {
      console.error('[KaiSign-Popup] Error updating setting:', error);
    }
  }

  async clearTransactions() {
    if (!confirm('Clear all transaction history?')) return;

    try {
      const result = await this.sendMessage({ type: 'CLEAR_HISTORY' });
      if (result.success) {
        this.transactions = [];
        this.updateTransactionSummary();
        this.updateTransactionList();
        this.loadEIP7702Transactions();
      }
    } catch (error) {
      console.error('[KaiSign-Popup] Error clearing transactions:', error);
    }
  }

  async clearAllData() {
    if (!confirm('Clear ALL extension data including settings? This cannot be undone.')) return;

    try {
      await chrome.storage.local.clear();
      location.reload();
    } catch (error) {
      console.error('[KaiSign-Popup] Error clearing all data:', error);
    }
  }

  async exportData() {
    try {
      const data = {
        transactions: this.transactions,
        settings: this.settings,
        exportedAt: new Date().toISOString(),
        version: '1.0.0'
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `kaisign-data-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[KaiSign-Popup] Error exporting data:', error);
    }
  }

  async loadDebugInfo() {
    // Check content script status
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      
      if (tab && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        document.getElementById('content-script-status').textContent = '✅ Active';
      } else {
        document.getElementById('content-script-status').textContent = '⚠️ N/A (not web page)';
      }
    } catch (error) {
      document.getElementById('content-script-status').textContent = '❌ Error';
    }

    // Calculate storage usage
    try {
      const storage = await chrome.storage.local.get(null);
      const size = JSON.stringify(storage).length;
      document.getElementById('storage-usage').textContent = `${(size / 1024).toFixed(1)} KB`;
    } catch (error) {
      document.getElementById('storage-usage').textContent = 'Unknown';
    }
  }

  startAutoRefresh() {
    // Refresh every 5 seconds when popup is open
    this.refreshInterval = setInterval(() => {
      this.loadTransactions();
    }, 5000);
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.kaiSignPopup = new KaiSignPopup();
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  if (window.kaiSignPopup) {
    window.kaiSignPopup.stopAutoRefresh();
  }
});