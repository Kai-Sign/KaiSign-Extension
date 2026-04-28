// =============================================================================
// KAISIGN CONTENT SCRIPT - TRANSACTION ANALYSIS & CLEAR SIGNING
// =============================================================================

console.log('[KaiSign] Content script loading...');

// Guard against double execution (manifest + dynamic injection fallback)
// Uses if/else block scope so `const` declarations don't cause SyntaxError on reload
if (window.__KAISIGN_LOADED) {
  console.log('[KaiSign] Already loaded, skipping');
} else {
window.__KAISIGN_LOADED = true;
console.log('[KaiSign] Content script initialized');

function getKaiSignDebugFlag() {
  try {
    return typeof window !== 'undefined' && window.localStorage?.getItem('kaisign_dev_mode') === 'true';
  } catch {
    return false;
  }
}

const KAISIGN_DEBUG = getKaiSignDebugFlag();

// Inject complete embedded styles (MAIN world cannot load external CSS files)
(function injectStyles() {
  if (document.getElementById('kaisign-styles')) return;
  const style = document.createElement('style');
  style.id = 'kaisign-styles';
  style.textContent = `

    /* KaiSign Complete Embedded Styles - Atelier Light Theme */
    .kaisign-popup { position: fixed; top: 20px; right: 20px; width: 420px; max-height: 85vh; overflow-y: auto; background: #fff9f1; color: #2b2722; padding: 0; border-radius: 16px; z-index: 2147483647; font-family: "Sora", "Avenir Next", "Segoe UI", sans-serif; font-size: 13px; line-height: 1.5; box-shadow: 0 18px 50px rgba(43,39,34,0.18); border: 1px solid #e6dccf; }
    .kaisign-popup * { box-sizing: border-box; }
    .kaisign-popup-header { display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid #e6dccf; background: linear-gradient(120deg, #fff4e6 0%, #f6f0e7 60%, #f2f7f5 100%); border-radius: 16px 16px 0 0; }
    .kaisign-popup-header { cursor: grab; }
    .kaisign-popup.dragging .kaisign-popup-header { cursor: grabbing; }
    .kaisign-popup.dragging { user-select: none; }
    .kaisign-popup-logo { display: flex; align-items: center; gap: 10px; }
    .kaisign-popup-logo-icon { width: 30px; height: 30px; background: linear-gradient(135deg, #0f9f9a, #2563eb); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 10px; color: white; box-shadow: 0 8px 16px rgba(37,99,235,0.25); }
    .kaisign-popup-title { font-size: 14px; font-weight: 700; color: #2b2722; }
    .kaisign-popup-subtitle { font-size: 11px; color: #7a6f63; }
    .kaisign-close-btn { width: 28px; height: 28px; background: transparent; border: 1px solid #e6dccf; border-radius: 8px; color: #7a6f63; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; }
    .kaisign-close-btn:hover { background: #ef4444; border-color: #ef4444; color: white; }
    .kaisign-warning { padding: 10px 16px; background: rgba(220, 38, 38, 0.08); border-bottom: 1px solid #e6dccf; font-size: 11px; color: #dc2626; text-align: center; }
    .kaisign-intent-section { padding: 16px; background: #f7efe5; border-bottom: 1px solid #e6dccf; }
    .kaisign-wrapper-context { font-size: 11px; color: #7a6f63; margin-bottom: 4px; padding: 4px 8px; background: rgba(15, 159, 154, 0.08); border-radius: 6px; display: inline-block; }
    .kaisign-intent { font-size: 16px; font-weight: 700; color: #0f9f9a; margin-bottom: 12px; line-height: 1.45; overflow-wrap: anywhere; }
    .kaisign-details-grid { display: flex; flex-wrap: wrap; gap: 8px 12px; }
    .kaisign-detail-item { font-size: 12px; min-width: 0; flex: 1 1 180px; }
    .kaisign-detail-label { color: #c2410c; font-weight: 600; }
    .kaisign-detail-value { color: #2b2722; word-break: break-all; font-family: 'SF Mono', Consolas, monospace; }
    .kaisign-detail-separator { color: #7a6f63; padding: 0 4px; }
    .kaisign-popup-content { padding: 16px; }
    .kaisign-section { margin-bottom: 16px; padding: 12px; background: #ffffff; border-radius: 10px; border: none; box-shadow: 0 8px 16px rgba(43,39,34,0.08); }
    .kaisign-section.success { box-shadow: 0 8px 16px rgba(22,163,74,0.12); }
    .kaisign-section.error { box-shadow: 0 8px 16px rgba(220,38,38,0.12); }
    .kaisign-section.purple { box-shadow: 0 8px 16px rgba(139,92,246,0.12); }
    .kaisign-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .kaisign-section-title { font-size: 12px; font-weight: 700; color: #0f9f9a; display: flex; align-items: center; gap: 6px; }
    .kaisign-section-title.green { color: #16a34a; }
    .kaisign-section-title.red { color: #dc2626; }
    .kaisign-section-title.purple { color: #8b5cf6; }
    .kaisign-copy-btn { padding: 4px 8px; background: #0f9f9a; color: white; border: none; border-radius: 6px; font-size: 10px; cursor: pointer; transition: all 0.2s ease; }
    .kaisign-copy-btn:hover { background: #0b7f7b; }
    .kaisign-copy-btn.copied { background: #16a34a; }
    .kaisign-bytecode { background: #f7f3ee; padding: 8px; border-radius: 6px; word-break: break-all; max-height: 100px; overflow-y: auto; font-family: 'SF Mono', Consolas, monospace; font-size: 10px; color: #7a6f63; border: 1px solid #e6dccf; }
    .kaisign-bytecode-info { margin-top: 8px; font-size: 10px; color: #9a8f82; }
    .kaisign-summary-list { margin: 0; padding-left: 18px; color: #2b2722; }
    .kaisign-summary-list li { margin: 0 0 6px; }
    .kaisign-disclosure { border: 1px solid #e6dccf; border-radius: 8px; background: #f7f3ee; }
    .kaisign-disclosure summary { cursor: pointer; padding: 10px 12px; font-weight: 600; color: #0f9f9a; list-style: none; }
    .kaisign-disclosure summary::-webkit-details-marker { display: none; }
    .kaisign-disclosure summary::after { content: 'Show'; float: right; font-size: 10px; color: #7a6f63; text-transform: uppercase; letter-spacing: 0.04em; }
    .kaisign-disclosure[open] summary::after { content: 'Hide'; }
    .kaisign-disclosure-body { padding: 0 12px 12px; }
    .kaisign-tree { background: #f7f3ee; padding: 12px; border-radius: 8px; margin-top: 8px; border: none; }
    .kaisign-tree-header { font-size: 11px; font-weight: 700; color: #16a34a; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #e6dccf; }
    .kaisign-tree-item { margin: 6px 0; padding: 8px; background: #fff; border-radius: 6px; border: none; box-shadow: 0 6px 12px rgba(43,39,34,0.08); }
    .kaisign-tree-item.level-1 { border-left-color: #ffd700; }
    .kaisign-tree-item.level-2 { border-left-color: #f85149; margin-left: 16px; }
    .kaisign-tree-item.level-3 { border-left-color: #4ecdc4; margin-left: 32px; }
    .kaisign-tree-item.level-4 { border-left-color: #45b7d1; margin-left: 48px; }
    .kaisign-tree-item.level-5 { border-left-color: #96ceb4; margin-left: 64px; }
    .kaisign-tree-selector { font-family: 'SF Mono', Consolas, monospace; font-weight: 600; color: #ffd700; }
    .kaisign-tree-level { font-size: 9px; color: #6e7681; margin-left: 8px; }
    .kaisign-tree-details { margin-top: 4px; font-size: 10px; color: #8b949e; }
    .kaisign-tree-target { color: #58a6ff; }
    .kaisign-tree-function { color: #3fb950; margin-left: 8px; }
    .kaisign-tree-intent { color: #ffd700; font-weight: 500; }
    .kaisign-tree-bytecode { margin-top: 6px; }
    .kaisign-tree-bytecode-label { font-size: 9px; font-weight: 600; color: #a371f7; margin-bottom: 4px; }
    .kaisign-tree-bytecode-value { background: #f7f3ee; padding: 6px; border-radius: 3px; word-break: break-all; max-height: 50px; overflow-y: auto; font-size: 8px; color: #7a6f63; font-family: 'SF Mono', Consolas, monospace; }
    .kaisign-popup.theme-dark { background: #161b22; color: #e6edf3; border-color: #30363d; }
    .kaisign-popup.theme-dark .kaisign-popup-header { background: #0d1117; border-bottom-color: #30363d; }
    .kaisign-popup.theme-dark .kaisign-popup-title { color: #e6edf3; }
    .kaisign-popup.theme-dark .kaisign-popup-subtitle { color: #8b949e; }
    .kaisign-popup.theme-dark .kaisign-intent-section { background: #21262d; border-bottom-color: #30363d; }
    .kaisign-popup.theme-dark .kaisign-intent { color: #3fb950; }
    .kaisign-popup.theme-dark .kaisign-detail-label { color: #ffd700; }
    .kaisign-popup.theme-dark .kaisign-detail-value { color: #e6edf3; }
    .kaisign-popup.theme-dark .kaisign-section { background: #0d1117; border: none; box-shadow: 0 12px 24px rgba(0,0,0,0.35); }
    .kaisign-popup.theme-dark .kaisign-section-title { color: #58a6ff; }
    .kaisign-popup.theme-dark .kaisign-copy-btn { background: #58a6ff; }
    .kaisign-popup.theme-dark .kaisign-bytecode { background: #0d1117; border-color: #30363d; color: #8b949e; }
    .kaisign-popup.theme-dark .kaisign-summary-list { color: #e6edf3; }
    .kaisign-popup.theme-dark .kaisign-disclosure { background: #0d1117; border-color: #30363d; }
    .kaisign-popup.theme-dark .kaisign-disclosure summary { color: #58a6ff; }
    .kaisign-popup.theme-dark .kaisign-tree { background: #0d1117; border: none; }
    .kaisign-popup.theme-dark .kaisign-tree-item { background: #161b22; border: none; box-shadow: 0 8px 16px rgba(0,0,0,0.35); }
    .kaisign-popup.theme-dark .kaisign-tree-bytecode-value { background: #0d1117; color: #8b949e; }
    .kaisign-tree-footer { margin-top: 8px; padding-top: 8px; border-top: 1px solid #30363d; font-size: 9px; color: #3fb950; text-align: center; }
    .kaisign-decode-result { font-size: 11px; }
    .kaisign-decode-success { color: #3fb950; margin-bottom: 4px; }
    .kaisign-decode-error { color: #f85149; }
    .kaisign-decode-detail { color: #8b949e; margin: 2px 0; }
    .kaisign-action-bar { display: flex; gap: 8px; padding: 16px; border-top: 1px solid #30363d; background: #0d1117; border-radius: 0 0 12px 12px; }
    .kaisign-btn { flex: 1; padding: 8px 12px; border-radius: 6px; font-size: 11px; font-weight: 500; cursor: pointer; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; gap: 6px; border: none; }
    .kaisign-btn-primary { background: #58a6ff; color: white; }
    .kaisign-btn-primary:hover { background: #4c8ed9; }
    .kaisign-btn-secondary { background: #21262d; color: #e6edf3; border: 1px solid #30363d; }
    .kaisign-btn-secondary:hover { background: #30363d; }
    .kaisign-btn-purple { background: #a371f7; color: white; }
    .kaisign-btn-purple:hover { background: #8b5cf6; }
    /* Modal styles */
    .kaisign-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90vw; max-width: 800px; max-height: 85vh; overflow-y: auto; background: #161b22; color: #e6edf3; padding: 0; border-radius: 12px; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; line-height: 1.5; box-shadow: 0 16px 48px rgba(0,0,0,0.6); border: 1px solid #30363d; }
    .kaisign-modal * { box-sizing: border-box; }
    .kaisign-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #30363d; background: #0d1117; border-radius: 12px 12px 0 0; }
    .kaisign-modal-title { font-size: 16px; font-weight: 600; color: #58a6ff; }
    .kaisign-modal-actions { display: flex; gap: 8px; }
    .kaisign-modal-content { padding: 16px 20px; }
    .kaisign-history-item { margin-bottom: 12px; padding: 14px; background: #0d1117; border-radius: 8px; border: 1px solid #30363d; }
    .kaisign-history-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .kaisign-history-intent { font-weight: 500; color: #3fb950; }
    .kaisign-history-time { font-size: 10px; color: #6e7681; }
    .kaisign-history-details { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; margin-bottom: 8px; }
    .kaisign-history-detail { color: #8b949e; }
    .kaisign-history-detail strong { color: #e6edf3; }
    .kaisign-history-data { margin-top: 8px; }
    .kaisign-history-data-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .kaisign-history-data-label { font-size: 10px; color: #ffd700; }
    .kaisign-history-data-value { background: #161b22; padding: 6px; border-radius: 4px; word-break: break-all; max-height: 60px; overflow-y: auto; font-size: 9px; font-family: 'SF Mono', Consolas, monospace; color: #8b949e; }
    .kaisign-modal-footer { padding: 16px 20px; border-top: 1px solid #30363d; text-align: center; background: #0d1117; border-radius: 0 0 12px 12px; }
    /* Dashboard styles */
    .kaisign-dashboard { position: fixed; top: 5%; left: 5%; width: 90vw; height: 90vh; overflow-y: auto; background: #0d1117; color: #e6edf3; padding: 0; border-radius: 12px; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; line-height: 1.5; box-shadow: 0 16px 48px rgba(0,0,0,0.7); border: 1px solid #30363d; }
    .kaisign-dashboard * { box-sizing: border-box; }
    .kaisign-dashboard-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid #30363d; background: #161b22; position: sticky; top: 0; z-index: 10; }
    .kaisign-dashboard-title { font-size: 18px; font-weight: 600; color: #58a6ff; }
    .kaisign-dashboard-content { padding: 24px; }
    .kaisign-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .kaisign-stat-card { background: #161b22; padding: 16px; border-radius: 8px; border: 1px solid #30363d; }
    .kaisign-stat-value { font-size: 28px; font-weight: 600; color: #e6edf3; font-family: 'SF Mono', Consolas, monospace; }
    .kaisign-stat-label { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
    .kaisign-category { margin-bottom: 24px; }
    .kaisign-category-title { font-size: 14px; font-weight: 600; color: #e6edf3; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #30363d; }
    .kaisign-method-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
    .kaisign-method-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #161b22; border-radius: 6px; border: 1px solid #30363d; font-size: 11px; }
    .kaisign-method-name { font-family: 'SF Mono', Consolas, monospace; color: #e6edf3; }
    .kaisign-method-count { background: #21262d; padding: 2px 8px; border-radius: 10px; font-size: 10px; color: #58a6ff; }
    .kaisign-security-alert { padding: 12px; background: rgba(248, 81, 73, 0.1); border: 1px solid #f85149; border-radius: 6px; margin-bottom: 8px; }
    .kaisign-security-alert-title { font-weight: 600; color: #f85149; margin-bottom: 4px; }
    .kaisign-security-alert-desc { font-size: 11px; color: #8b949e; }
    .kaisign-empty { text-align: center; padding: 40px; color: #6e7681; }
    /* Scrollbar styling */
    .kaisign-popup::-webkit-scrollbar, .kaisign-modal::-webkit-scrollbar, .kaisign-dashboard::-webkit-scrollbar { width: 6px; }
    .kaisign-popup::-webkit-scrollbar-track, .kaisign-modal::-webkit-scrollbar-track, .kaisign-dashboard::-webkit-scrollbar-track { background: transparent; }
    .kaisign-popup::-webkit-scrollbar-thumb, .kaisign-modal::-webkit-scrollbar-thumb, .kaisign-dashboard::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
    .kaisign-popup::-webkit-scrollbar-thumb:hover, .kaisign-modal::-webkit-scrollbar-thumb:hover, .kaisign-dashboard::-webkit-scrollbar-thumb:hover { background: #484f58; }
    /* Loading dots animation */
    .kaisign-loading-dots { display: flex; gap: 4px; justify-content: center; align-items: center; }
    .kaisign-loading-dots span { width: 6px; height: 6px; background: #58a6ff; border-radius: 50%; animation: kaisign-bounce 1.2s ease-in-out infinite; }
    .kaisign-loading-dots span:nth-child(2) { animation-delay: 0.2s; }
    .kaisign-loading-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes kaisign-bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
    /* Address hover tooltip for ENS/Basename resolution */
    .kaisign-address { position: relative; cursor: help; font-family: 'SF Mono', Consolas, 'Liberation Mono', monospace; }
    .kaisign-address:hover { color: #0f9f9a; }
    .kaisign-popup.theme-dark .kaisign-address:hover { color: #3fb950; }
    .kaisign-address[title]:hover::after { content: attr(title); position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: #fff9f1; color: #2b2722; border: 1px solid #0f9f9a; border-radius: 4px; padding: 6px 10px; font-size: 11px; white-space: nowrap; box-shadow: 0 4px 12px rgba(15, 159, 154, 0.2); z-index: 10000; margin-bottom: 5px; pointer-events: none; }
    .kaisign-popup.theme-dark .kaisign-address[title]:hover::after { background: #161b22; color: #e6edf3; border-color: #3fb950; }
    .kaisign-address[title]:hover::before { content: ''; position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); border: 5px solid transparent; border-top-color: #0f9f9a; z-index: 10001; margin-bottom: -4px; }
    .kaisign-popup.theme-dark .kaisign-address[title]:hover::before { border-top-color: #3fb950; }
  `;
  (document.head || document.documentElement).appendChild(style);
  KAISIGN_DEBUG && console.log('[KaiSign] Embedded styles injected');
})();

// =============================================================================
// HELPER: Update loading status text in popup
// =============================================================================
function updateLoadingStatus(text) {
  const statusEl = document.querySelector('.kaisign-loading-status');
  if (statusEl) statusEl.textContent = text;
}

function attachPopupDrag(popup) {
  const header = popup.querySelector('.kaisign-popup-header');
  if (!header) return;

  header.style.cursor = 'grab';
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let dragging = false;

  const onMouseMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const nextLeft = Math.max(8, Math.min(window.innerWidth - popup.offsetWidth - 8, startLeft + dx));
    const nextTop = Math.max(8, Math.min(window.innerHeight - popup.offsetHeight - 8, startTop + dy));
    popup.style.left = `${nextLeft}px`;
    popup.style.top = `${nextTop}px`;
    popup.style.right = 'auto';
  };

  const onMouseUp = () => {
    if (!dragging) return;
    dragging = false;
    header.style.cursor = 'grab';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  header.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const rect = popup.getBoundingClientRect();
    dragging = true;
    header.style.cursor = 'grabbing';
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

function bindPopupClose(popup) {
  if (!popup) return;
  popup.addEventListener('click', (event) => {
    const closeBtn = event.target.closest('.kaisign-close-btn');
    const closeAction = event.target.closest('.kaisign-btn-secondary');
    const isCloseAction = closeAction && closeAction.textContent.trim().toLowerCase() === 'close';
    if (closeBtn || isCloseAction) {
      popup.remove();
    }
  }, true);
}

function sanitizeForStorage(data) {
  const seen = new WeakSet();
  const clone = (value) => {
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'function' || typeof value === 'symbol') return undefined;
    if (value === null || typeof value !== 'object') return value;

    if (value?._isBigNumber) {
      if (value._value !== undefined) return value._value;
      if (value._hex) return value._hex;
      return String(value);
    }

    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => clone(item));
    }

    const result = {};
    for (const [key, nested] of Object.entries(value)) {
      const sanitized = clone(nested);
      if (sanitized !== undefined) {
        result[key] = sanitized;
      }
    }
    return result;
  };

  return clone(data);
}

function saveTransactionDirect(transactionData) {
  if (!chrome?.storage?.local || !chrome?.runtime?.id) return;
  try {
    chrome.storage.local.get(['kaisign-transactions', 'kaisign-settings'], (result) => {
      const existing = result['kaisign-transactions'] || [];
      const safeData = sanitizeForStorage(transactionData);
      if (existing.some((tx) => tx.id === safeData.id)) return;
      const settings = result['kaisign-settings'] || {};
      const maxTx = settings.maxTransactions || 100;
      existing.unshift(safeData);
      if (existing.length > maxTx) existing.splice(maxTx);
      chrome.storage.local.set({ 'kaisign-transactions': existing }, () => {});
    });
  } catch {}
}

function saveTransactionViaAllChannels(transactionData) {
  const safeTxData = sanitizeForStorage(transactionData);
  saveTransactionDirect(safeTxData);
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage && chrome.runtime?.id) {
    chrome.runtime.sendMessage({ type: 'SAVE_TRANSACTION', data: safeTxData }, () => {});
  }
  window.postMessage({ type: 'KAISIGN_SAVE_TX', data: safeTxData }, '*');
}

function stableStringify(value) {
  if (value == null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (typeof value === 'object') {
    if (value._isBigNumber) {
      return JSON.stringify(value._value || value._hex || String(value));
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(String(value));
}

function transactionContentId(tx, method, context = null) {
  const payload = {
    method,
    to: tx?.to || null,
    from: tx?.from || null,
    value: tx?.value || '0',
    data: tx?.data || '0x',
    chainId: tx?.chainId ?? context?.chainId ?? tx?.eip712TypedData?.domain?.chainId ?? null,
    type: tx?.type || null,
    primaryType: context?.primaryType || tx?.eip712TypedData?.primaryType || null,
    domainName: context?.domainName || tx?.eip712TypedData?.domain?.name || null,
    eip712TypedData: tx?.eip712TypedData || null,
    authorizationList: tx?.authorizationList || null,
    accessList: tx?.accessList || null
  };
  const serialized = stableStringify(payload);
  if (window.ethers?.keccak256 && window.ethers?.toUtf8Bytes) {
    try {
      return window.ethers.keccak256(window.ethers.toUtf8Bytes(serialized)).slice(2, 18);
    } catch {}
  }
  let hash = 2166136261;
  for (let i = 0; i < serialized.length; i++) {
    hash ^= serialized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `tx-${(hash >>> 0).toString(16)}`;
}

function buildTransactionRecord(tx, method, intent, decodedResult, extractedBytecodes = [], context = null) {
  return {
    id: transactionContentId(tx, method, context),
    method,
    time: new Date().toISOString(),
    to: tx.to,
    from: tx.from,
    value: tx.value,
    data: tx.data,
    gas: tx.gas,
    gasPrice: tx.gasPrice,
    maxFeePerGas: tx.maxFeePerGas,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    nonce: tx.nonce,
    chainId: tx.chainId ?? context?.chainId ?? null,
    type: tx.type,
    authorizationList: tx.authorizationList,
    accessList: tx.accessList,
    isEIP712: context?.isEIP712 || false,
    eip712TypedData: tx.eip712TypedData || null,
    primaryType: context?.primaryType || null,
    domainName: context?.domainName || null,
    intent,
    decodedResult,
    extractedBytecodes
  };
}

function attachSaveButton(popup, transactionData) {
  if (!popup || !transactionData) return;
  const handler = (btn) => {
    if (!btn) return;
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.dataset.txId = transactionData.id;

    saveTransactionViaAllChannels(transactionData);

    setTimeout(() => {
      if (!chrome?.storage?.local) {
        btn.textContent = 'Saved?';
        btn.disabled = false;
        return;
      }
      chrome.storage.local.get(['kaisign-transactions'], (result) => {
        const list = result['kaisign-transactions'] || [];
        const found = list.some((tx) => tx.id === transactionData.id);
        btn.textContent = found ? 'Saved' : 'Save failed';
        if (!found) {
          btn.disabled = false;
          setTimeout(() => {
            btn.textContent = originalText;
          }, 1500);
        }
      });
    }, 300);
  };

  popup.querySelectorAll('.kaisign-save-btn').forEach((btn) => {
    btn.addEventListener('click', () => handler(btn));
  });
}

function getStoredTheme() {
  return 'dark';
}

// =============================================================================
// HELPER: Show loading popup immediately for EIP-712 signatures
// =============================================================================
function showLoadingPopup(primaryType, walletName) {
  // Use unified showEnhancedTransactionInfo with loading state
  const tx = { to: null, from: null, data: '0x', value: '0x0' };
  showEnhancedTransactionInfo(
    tx,
    `eth_signTypedData_v4`,
    `Processing ${primaryType} signature...`,
    walletName,
    { success: false, isLoading: true, primaryType },
    []
  );
}

// =============================================================================
// HELPER: Flatten nested decodes to bytecodes format for UI
// =============================================================================

/**
 * Convert nested decodes from recursive decoder into flat bytecodes array for UI
 * @param {Array} nestedDecodes - Nested decode results
 * @param {number} depth - Current depth level
 * @returns {Array} Flat array of bytecode entries with formatted values
 */
function flattenNestedDecodesToBytecodes(nestedDecodes, depth = 1) {
  const result = [];

  for (const entry of nestedDecodes) {
    // Handle multicall operations
    if (entry.result?.params?.transactions_multicall?.operations) {
      const ops = entry.result.params.transactions_multicall.operations;
      for (const op of ops) {
        if (op.decoded) {
          // Build formatted params string
          let paramsStr = '';
          if (op.decoded.formatted) {
            const parts = [];
            for (const [key, info] of Object.entries(op.decoded.formatted)) {
              if (info.value && info.label) {
                parts.push(`${info.label}: ${info.value}`);
              }
            }
            paramsStr = parts.join(' | ');
          }

          result.push({
            selector: op.selector,
            functionName: op.decoded.functionName || op.decoded.function,
            target: op.to,
            intent: op.decoded.intent,
            depth: depth + 1,
            formattedParams: paramsStr,
            formatted: op.decoded.formatted
          });

          // Recurse if this operation has nested decodes
          if (op.decoded.nestedDecodes && op.decoded.nestedDecodes.length > 0) {
            result.push(...flattenNestedDecodesToBytecodes(op.decoded.nestedDecodes, depth + 2));
          }
        }
      }
    }
    // Handle direct nested decodes
    else if (entry.result?.nestedDecodes) {
      result.push(...flattenNestedDecodesToBytecodes(entry.result.nestedDecodes, depth + 1));
    }
  }

  return result;
}

function summarizeNestedActionTitle(method, decoded, fallbackIntent) {
  if (!decoded?.success) return fallbackIntent;
  if (method !== 'eth_signTypedData_v4') return fallbackIntent;

  const nestedCount = Array.isArray(decoded.nestedIntents) ? decoded.nestedIntents.length : 0;
  if (nestedCount <= 1) return fallbackIntent;

  return decoded.wrapperIntent || decoded.intent || fallbackIntent;
}

function collectNestedActionDetails(source, out = []) {
  if (!source) return out;
  if (Array.isArray(source)) {
    source.forEach((item) => collectNestedActionDetails(item, out));
    return out;
  }

  if (source.decoded) collectNestedActionDetails(source.decoded, out);
  if (source.result) collectNestedActionDetails(source.result, out);
  if (Array.isArray(source.operations)) {
    source.operations.forEach((op) => collectNestedActionDetails(op, out));
  }
  if (Array.isArray(source.nestedDecodes)) {
    source.nestedDecodes.forEach((nested) => collectNestedActionDetails(nested, out));
  }

  if (source.intent && source.formatted && typeof source.formatted === 'object') {
    const fields = Object.values(source.formatted)
      .filter((field) => field && typeof field === 'object')
      .filter((field) => field.label && field.value != null && field.value !== '')
      .filter((field) => !['Data', 'Transactions', 'Call Data', 'Permit'].includes(field.label))
      .filter((field) => String(field.value).length <= 140)
      .map((field) => ({
        label: field.label,
        value: String(field.value)
      }));

    if (fields.length > 0) {
      out.push({
        intent: source.intent,
        fields
      });
    }
  }

  return out;
}

function renderNestedActionDetailsSection(decodedResult, escapeHtml) {
  const details = collectNestedActionDetails(decodedResult?.nestedDecodes || []);
  if (!details.length) return '';

  const uniqueDetails = [];
  const seen = new Set();
  for (const detail of details) {
    const key = `${detail.intent}|${detail.fields.map((field) => `${field.label}:${field.value}`).join('|')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueDetails.push(detail);
  }

  return `
    <div class="kaisign-section purple">
      <div class="kaisign-section-header">
        <span class="kaisign-section-title purple">Action Details</span>
      </div>
      <div class="kaisign-decode-result">
        ${uniqueDetails.map((detail, index) => `
          <div style="margin-bottom: 10px; padding: 10px; background: rgba(139, 92, 246, 0.1); border-radius: 6px;">
            <div style="font-weight: bold; color: #a78bfa; margin-bottom: 6px;">#${index + 1}: ${escapeHtml(detail.intent)}</div>
            ${detail.fields.map((field) => `
              <div class="kaisign-decode-detail">${escapeHtml(field.label)}: ${escapeHtml(field.value)}</div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// =============================================================================
// UNIVERSAL ROUTER TRANSACTION PARSER (ETHERS.JS APPROACH)
// =============================================================================

// Minimal ABI decoder for Universal Router (replaces ethers.js dependency)
class SimpleABIDecoder {
  static decodeExecuteFunction(txData) {
    if (!txData || txData.length < 10) return null;

    // Remove function selector (first 4 bytes / 10 hex chars)
    const payload = txData.slice(10);
    
    try {
      // Parse ABI-encoded parameters: execute(bytes commands, bytes[] inputs, uint256 deadline)
      const commandsOffset = parseInt(payload.slice(0, 64), 16) * 2;
      const inputsOffset = parseInt(payload.slice(64, 128), 16) * 2; 
      const deadline = parseInt(payload.slice(128, 192), 16);
      
      // Parse commands bytes
      const commandsLength = parseInt(payload.slice(commandsOffset, commandsOffset + 64), 16) * 2;
      const commandsData = '0x' + payload.slice(commandsOffset + 64, commandsOffset + 64 + commandsLength);
      
      // Parse inputs array
      const inputsArrayLength = parseInt(payload.slice(inputsOffset, inputsOffset + 64), 16);
      const inputs = [];
      
      // Extract each input
      let currentOffset = inputsOffset + 64; // Skip array length
      for (let i = 0; i < inputsArrayLength; i++) {
        const inputOffsetRelative = parseInt(payload.slice(currentOffset, currentOffset + 64), 16) * 2;
        const inputDataStart = inputsOffset + inputOffsetRelative;
        const inputLength = parseInt(payload.slice(inputDataStart, inputDataStart + 64), 16) * 2;
        const inputData = '0x' + payload.slice(inputDataStart + 64, inputDataStart + 64 + inputLength);
        
        inputs.push(inputData);
        currentOffset += 64;
      }
      
      return {
        commands: commandsData,
        inputs: inputs,
        deadline: deadline
      };
    } catch (error) {
      console.error('[SimpleABIDecoder] Error:', error);
      return null;
    }
  }
}

// =============================================================================
// ADDRESS FILTERING UTILITIES - Configurable address validation
// =============================================================================

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Check if an address is valid (not a zero address or ABI offset)
 * Uses configurable patterns instead of hardcoded checks
 */
function isValidTokenAddress(addr) {
  if (!addr || addr.length !== 42) return false;
  const lowerAddr = addr.toLowerCase();

  // Exclude zero address
  if (lowerAddr === ZERO_ADDRESS.toLowerCase()) return false;

  // Exclude ABI offset patterns (small values encoded as addresses)
  // These are typically values like 0x000...0020, 0x000...0040, etc.
  if (/^0x0{24}[0-9a-f]{1,16}$/i.test(addr)) return false;

  // Must have some non-zero content in the address portion
  const addressPart = addr.slice(2);
  const nonZeroChars = addressPart.replace(/0/g, '');
  if (nonZeroChars.length < 4) return false;

  return true;
}


// =============================================================================
// GENERIC ABI DECODER UTILITIES - Metadata-driven parsing
// =============================================================================

// Dead code removed - all parsing now handled by decode.js and recursive-decoder.js


// =============================================================================
// GENERIC PROTOCOL TRANSACTION PARSING (METADATA-DRIVEN)
// =============================================================================

/**
 * GENERIC: Parse any protocol transaction using ERC-7730 metadata
 * Works for Universal Router, Safe MultiSend, or ANY protocol with metadata
 * @param {string} txData - The transaction calldata
 * @param {string} contractAddress - The contract address
 * @param {number} chainId - The chain ID
 * @param {string|null} transactionValue - Optional transaction value
 * @returns {Promise<object>} - Parsed transaction with intent
 */
async function parseProtocolTransaction(txData, contractAddress, chainId = 1, transactionValue = null) {
  try {
    // Use the existing generic decoder that reads from ERC-7730 metadata
    const decoded = await window.decodeCalldata?.(txData, contractAddress, chainId);

    if (!decoded || !decoded.success) {
      KAISIGN_DEBUG && console.log('[KaiSign] Generic decode failed, returning basic info');
      return {
        success: false,
        selector: txData?.slice(0, 10),
        intent: 'Contract interaction',
        error: decoded?.error || 'No metadata found'
      };
    }

    return {
      success: true,
      selector: decoded.selector,
      functionName: decoded.functionName,
      functionSignature: decoded.functionSignature,
      intent: decoded.intent,
      params: decoded.params,
      formatted: decoded.formatted,
      metadata: decoded.metadata
    };
  } catch (error) {
    console.error('[KaiSign] Protocol transaction parsing error:', error);
    return {
      success: false,
      selector: txData?.slice(0, 10),
      intent: 'Contract interaction',
      error: error.message
    };
  }
}

/**
 * GENERIC: Get command/operation info from registry
 * Works for Universal Router commands, Safe operations, or any protocol
 * @param {number|string} commandByte - The command byte or operation code
 * @param {string} protocolId - Optional protocol identifier for registry lookup
 */
function getCommandInfo(commandByte, protocolId = null) {
  // Command info comes from metadata - return generic info
  const byteHex = typeof commandByte === 'number'
    ? commandByte.toString(16).padStart(2, '0')
    : commandByte;

  return {
    name: `Command 0x${byteHex}`,
    intent: 'Operation',
    category: 'unknown',
    action: 'unknown'
  };
}

/**
 * GENERIC: Get intent for individual operation
 * Uses metadata from subgraph for decoding
 */
async function getOperationIntent(operation, chainId = 1) {
  if (!operation.selector || operation.selector === '0x') return null;

  // Use metadata service for decoding
  if (window.decodeCalldata && operation.to && operation.data) {
    try {
      const decoded = await window.decodeCalldata(operation.data, operation.to, chainId);

      if (decoded.success && decoded.intent && decoded.intent !== 'Contract interaction' && decoded.intent !== 'Unknown function') {
        return decoded.intent;
      }
    } catch (decodeError) {
      KAISIGN_DEBUG && console.warn(`[KaiSign] Decode failed:`, decodeError.message);
    }
  }

  return 'Contract Call';
}

// Universal Router functions DELETED - use generic getCommandInfo() instead

/**
 * Token address resolution - returns address snippet as fallback
 * Token info comes from metadata
 */
function resolveTokenSymbol(address) {
  if (!address) return null;
  // Token info should come from metadata
  // Return shortened address as fallback
  return address.slice(0, 6) + '...' + address.slice(-4);
}

/**
 * Get token symbol from address
 * Token info comes from metadata via subgraph
 */
function getTokenSymbol(address) {
  if (!address) return 'TOKEN';
  // Return shortened address - token info comes from metadata
  return address.slice(0, 6) + '...';
}

/**
 * Simple ETH formatter (convert hex wei to ETH)
 */
function formatEther(hexValue) {
  try {
    if (!hexValue || hexValue === '0x0') return '0';
    const wei = BigInt(hexValue);
    const eth = Number(wei) / 1e18;
    return eth > 0.001 ? eth.toFixed(4) : eth.toExponential(2);
  } catch {
    return hexValue;
  }
}

// NOTE: All intent extraction is now handled by parseProtocolTransaction() using ERC-7730 metadata

/**
 * Get function name from selector
 * Function info comes from metadata
 */
function getFunctionNameFromSelector(selector) {
  // Function info comes from metadata via decodeCalldata
  return selector || 'unknown';
}

// Wallet detection and hooking
const hookedWallets = new Set();
const eip6963ProviderNames = new WeakMap();
let lastEip6963RequestAt = 0;

// =============================================================================
// EAGER PROPERTY TRAPS - Instant wallet injection detection (no polling delay)
// =============================================================================

const propertyTrappedProviders = new Map();
let propertyTrapsInstalled = false;

function setupEagerPropertyTraps() {
  if (propertyTrapsInstalled) return;
  propertyTrapsInstalled = true;

  const walletProperties = ['ethereum', 'rabby', 'coinbaseWalletExtension', 'trustWallet', 'ambire', 'rainbow', 'walletConnectProvider'];

  walletProperties.forEach(propName => {
    const existingValue = window[propName];

    // Already exists - hook immediately
    if (existingValue?.request) {
      hookProviderFromTrap(existingValue, propName);
    }
    if (existingValue !== undefined) {
      propertyTrappedProviders.set(propName, existingValue);
    }

    // Skip non-configurable properties
    const desc = Object.getOwnPropertyDescriptor(window, propName);
    if (desc && !desc.configurable) return;

    try {
      Object.defineProperty(window, propName, {
        configurable: true,
        enumerable: true,
        get() { return propertyTrappedProviders.get(propName); },
        set(newValue) {
          propertyTrappedProviders.set(propName, newValue);
          if (newValue?.request) {
            hookProviderFromTrap(newValue, propName);
          } else if (newValue) {
            watchForRequestMethod(newValue, propName);
          }
        }
      });
    } catch (err) { /* skip non-configurable */ }
  });

  // Phantom nested property trap
  setupPhantomTrap();
}

function watchForRequestMethod(provider, propName) {
  const check = setInterval(() => {
    if (provider.request) {
      clearInterval(check);
      hookProviderFromTrap(provider, propName);
    }
  }, 10);
  setTimeout(() => clearInterval(check), 2000);
}

function setupPhantomTrap() {
  let phantomValue = window.phantom;
  if (phantomValue?.ethereum?.request) {
    hookProviderFromTrap(phantomValue.ethereum, 'phantom.ethereum');
    return;
  }
  const desc = Object.getOwnPropertyDescriptor(window, 'phantom');
  if (desc && !desc.configurable) return;
  try {
    Object.defineProperty(window, 'phantom', {
      configurable: true, enumerable: true,
      get() { return phantomValue; },
      set(newValue) {
        phantomValue = newValue;
        if (newValue?.ethereum?.request) hookProviderFromTrap(newValue.ethereum, 'phantom.ethereum');
      }
    });
  } catch (err) { /* skip non-configurable */ }
}

function hookProviderFromTrap(provider, propName) {
  const keyMap = {
    'ethereum': 'ethereum', 'rabby': 'rabby', 'coinbaseWalletExtension': 'coinbase',
    'trustWallet': 'trust', 'phantom.ethereum': 'phantom', 'ambire': 'ambire',
    'rainbow': 'rainbow', 'walletConnectProvider': 'walletconnect-dedicated'
  };
  const walletKey = keyMap[propName] || propName;
  if (hookedWallets.has(walletKey)) return;

  const walletName = getWalletName(provider);
  hookWalletProvider(provider, walletKey, walletName);
  hookedWallets.add(walletKey);
  console.log('[KaiSign] Property trap: hooked', walletKey, 'instantly');
}

function requestEip6963Providers() {
  const now = Date.now();
  if (now - lastEip6963RequestAt < 3000) return;
  lastEip6963RequestAt = now;
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

function setupEip6963ProviderListener() {
  if (window.__kaisignEip6963Listener) return;
  window.__kaisignEip6963Listener = true;
  window.addEventListener('eip6963:announceProvider', (event) => {
    const detail = event?.detail;
    const provider = detail?.provider;
    if (!provider || !provider.request) return;

    const nameFromInfo = detail?.info?.name || detail?.info?.rdns;
    if (nameFromInfo) eip6963ProviderNames.set(provider, nameFromInfo);

    let walletName = nameFromInfo || getWalletName(provider);

    // If this is WalletConnect, try to get the actual mobile wallet name
    if (provider.isWalletConnect || (nameFromInfo && nameFromInfo.includes('walletconnect'))) {
      const wcName = getWalletConnectSessionName(provider);
      walletName = wcName || walletName;
    }

    const walletKey = `eip6963-${detail?.info?.uuid || walletName}`;

    if (!hookedWallets.has(walletKey)) {
      hookWalletProvider(provider, walletKey, walletName);
      hookedWallets.add(walletKey);
    }
  });
}

// =============================================================================
// GENERIC PROTOCOL DETECTION (METADATA-DRIVEN - NO PROTOCOL-SPECIFIC CODE)
// =============================================================================

// NOTE: Protocol-specific functions have been removed
// All transaction parsing is now done via generic parseProtocolTransaction() using ERC-7730 metadata

// Wait for any wallet
function waitForWallets() {
  setupEip6963ProviderListener();
  requestEip6963Providers();

  // Check for different wallet providers
  detectAndHookWallets();

  // Keep checking for new wallets (some load late) - polling is now fallback, traps are primary
  setTimeout(waitForWallets, 1000);
}

// Detect and hook various wallets
function detectAndHookWallets() {

  // 1. MetaMask (window.ethereum) - but check it's not Ambire first
  if (window.ethereum && window.ethereum.request && !hookedWallets.has('ethereum')) {
    const walletName = getWalletName(window.ethereum);
    hookWalletProvider(window.ethereum, 'ethereum', walletName);
    hookedWallets.add('ethereum');
  }
  
  // 2. Rabby (window.rabby)
  if (window.rabby && window.rabby.request && !hookedWallets.has('rabby')) {
    hookWalletProvider(window.rabby, 'rabby');
    hookedWallets.add('rabby');
  }
  
  // 3. Coinbase Wallet (window.coinbaseWalletExtension)
  if (window.coinbaseWalletExtension && window.coinbaseWalletExtension.request && !hookedWallets.has('coinbase')) {
    hookWalletProvider(window.coinbaseWalletExtension, 'coinbase');
    hookedWallets.add('coinbase');
  }
  
  // 4. Trust Wallet (window.trustWallet)
  if (window.trustWallet && window.trustWallet.request && !hookedWallets.has('trust')) {
    hookWalletProvider(window.trustWallet, 'trust');
    hookedWallets.add('trust');
  }
  
  // 5. Phantom (window.phantom?.ethereum)
  if (window.phantom?.ethereum && window.phantom.ethereum.request && !hookedWallets.has('phantom')) {
    hookWalletProvider(window.phantom.ethereum, 'phantom');
    hookedWallets.add('phantom');
  }

  // 6. Ambire Wallet (window.ambire)
  if (window.ambire && window.ambire.request && !hookedWallets.has('ambire')) {
    hookWalletProvider(window.ambire, 'ambire', 'Ambire');
    hookedWallets.add('ambire');
  }

  // 7. Rainbow Wallet (window.rainbow)
  if (window.rainbow && window.rainbow.request && !hookedWallets.has('rainbow')) {
    hookWalletProvider(window.rainbow, 'rainbow', 'Rainbow');
    hookedWallets.add('rainbow');
  }

  // 8. WalletConnect on window.ethereum
  if (window.ethereum?.isWalletConnect && !hookedWallets.has('walletconnect')) {
    console.log('[KaiSign] Detected WalletConnect provider on window.ethereum');
    const walletName = getWalletConnectSessionName(window.ethereum) || 'WalletConnect';
    hookWalletProvider(window.ethereum, 'walletconnect', walletName);
    hookedWallets.add('walletconnect');
  }

  // 9. Dedicated WalletConnect provider
  if (window.walletConnectProvider && window.walletConnectProvider.request && !hookedWallets.has('walletconnect-dedicated')) {
    console.log('[KaiSign] Detected WalletConnect provider on window.walletConnectProvider');
    const walletName = getWalletConnectSessionName(window.walletConnectProvider) || 'WalletConnect';
    hookWalletProvider(window.walletConnectProvider, 'walletconnect-dedicated', walletName);
    hookedWallets.add('walletconnect-dedicated');
  }

  // 10. Check for multiple providers (some wallets inject arrays)
  if (window.ethereum?.providers && Array.isArray(window.ethereum.providers)) {
    window.ethereum.providers.forEach((provider, index) => {
      const walletKey = `provider-${index}`;
      if (provider.request && !hookedWallets.has(walletKey)) {
        const walletName = getWalletName(provider);
        hookWalletProvider(provider, walletKey, walletName);
        hookedWallets.add(walletKey);
      }
    });
  }

  // NOTE: All wallet providers are hooked generically above
  // Protocol-specific detection functions have been removed
}

// Poll for late-initializing WalletConnect providers
let wcCheckInterval = null;
let wcCheckCount = 0;
const MAX_WC_CHECKS = 15; // 15 checks * 2 seconds = 30 seconds

function startWalletConnectPolling() {
  // Only start polling once
  if (wcCheckInterval) return;

  wcCheckInterval = setInterval(() => {
    wcCheckCount++;

    // Check if WalletConnect appeared on window.ethereum
    if (window.ethereum?.isWalletConnect && !hookedWallets.has('walletconnect')) {
      console.log('[KaiSign] Late-detected WalletConnect on window.ethereum');
      const walletName = getWalletConnectSessionName(window.ethereum) || 'WalletConnect';
      hookWalletProvider(window.ethereum, 'walletconnect', walletName);
      hookedWallets.add('walletconnect');
    }

    // Check for dedicated provider
    if (window.walletConnectProvider && window.walletConnectProvider.request && !hookedWallets.has('walletconnect-dedicated')) {
      console.log('[KaiSign] Late-detected WalletConnect provider');
      const walletName = getWalletConnectSessionName(window.walletConnectProvider) || 'WalletConnect';
      hookWalletProvider(window.walletConnectProvider, 'walletconnect-dedicated', walletName);
      hookedWallets.add('walletconnect-dedicated');
    }

    // Stop polling after max checks
    if (wcCheckCount >= MAX_WC_CHECKS) {
      clearInterval(wcCheckInterval);
      wcCheckInterval = null;
    }
  }, 2000); // Check every 2 seconds
}

// Get wallet name from provider
// NOTE: Check specific wallets BEFORE MetaMask since many wallets set isMetaMask=true for compatibility
function getWalletName(provider) {
  const eip6963Name = eip6963ProviderNames.get(provider);
  if (eip6963Name) return eip6963Name;
  if (provider.isAmbire) return 'Ambire';  // Check Ambire FIRST (sets isMetaMask=true for compat)
  if (provider.isRabby) return 'Rabby';
  if (provider.isCoinbaseWallet) return 'Coinbase';
  if (provider.isTrust) return 'Trust';
  if (provider.isPhantom) return 'Phantom';
  if (provider.isBraveWallet) return 'Brave';
  if (provider.isExodus) return 'Exodus';
  if (provider.isSafe) return 'Safe Wallet';
  // Additional wallets - check before MetaMask (many set isMetaMask=true for compat)
  if (provider.isRainbow) return 'Rainbow';
  if (provider.isFrame) return 'Frame';
  if (provider.isZerion) return 'Zerion';
  if (provider.isImToken || provider.isImtoken) return 'imToken';
  if (provider.isElytro) return 'Elytro';
  if (provider.isNuFi) return 'NuFi';
  if (provider.isPillarX) return 'PillarX';
  if (provider.isBridgeWallet) return 'Bridge Wallet';
  if (provider.isDaimo) return 'Daimo';
  if (provider.isGemWallet) return 'Gem Wallet';
  if (provider.isZeus) return 'Zeus';
  if (provider.isFamily) return 'Family';
  // Check WalletConnect before MetaMask (might set isMetaMask for compatibility)
  if (provider.isWalletConnect) return getWalletConnectSessionName(provider);
  if (provider.isMetaMask) return 'MetaMask';  // Check MetaMask LAST
  return 'Unknown Wallet';
}

/**
 * Extract wallet name from WalletConnect session metadata
 * @param {Object} provider - WalletConnect provider
 * @returns {string} - Wallet name (e.g., "MetaMask Mobile", "Trust Wallet")
 */
function getWalletConnectSessionName(provider) {
  try {
    // WalletConnect v2
    if (provider.session?.peer?.metadata?.name) {
      return provider.session.peer.metadata.name + ' (WalletConnect)';
    }

    // WalletConnect v1
    if (provider.wc?.peerMeta?.name) {
      return provider.wc.peerMeta.name + ' (WalletConnect)';
    }

    // Fallback to connector metadata
    if (provider.connector?.peerMeta?.name) {
      return provider.connector.peerMeta.name + ' (WalletConnect)';
    }

    return 'WalletConnect';
  } catch (e) {
    console.warn('[KaiSign] Error extracting WalletConnect session name:', e);
    return 'WalletConnect';
  }
}

// Cache for Permit2 data - stores intent details by EIP-712 struct hash
// This allows wrapper messages to display original intent details when the original data was seen
window.kaisignPermit2Cache = window.kaisignPermit2Cache || new Map();


/**
 * Parse typed data - GENERIC, metadata-driven
 * Returns null to trigger metadata lookup for proper formatting
 */
function parsePermit2TypedData(typedData) {
  const primaryType = typedData?.primaryType;
  const message = typedData?.message;
  const types = typedData?.types;

  if (!primaryType || !message) return null;

  // Handle PermitSingle (Permit2)
  if (primaryType === 'PermitSingle' && message.details) {
    const details = message.details;
    const tokenAddr = details.token;
    const amount = details.amount?.toString() || '0';
    const expiration = details.expiration;
    const spender = message.spender;
    const sigDeadline = message.sigDeadline;

    // Format amount - check for max uint160 (unlimited)
    const MAX_UINT160 = '1461501637330902918203684832716283019655932542975';
    const formattedAmount = amount === MAX_UINT160 ? 'Unlimited' : amount;

    // Format timestamps
    const formatTs = (ts) => {
      if (!ts) return 'N/A';
      const num = parseInt(ts.toString());
      if (num === 0) return 'Immediately';
      if (num > 4102444800) return 'Never expires';
      return new Date(num * 1000).toLocaleString();
    };

    return {
      intent: `Approve ${formattedAmount} Token Spending`,
      details: [
        `Token: ${formatAddressShort(tokenAddr)}`,
        `Amount: ${formattedAmount}`,
        `Spender: ${formatAddressShort(spender)}`,
        `Permit Expires: ${formatTs(expiration)}`,
        `Signature Deadline: ${formatTs(sigDeadline)}`
      ],
      rawData: {
        token: tokenAddr,
        amount: amount,
        formattedAmount: formattedAmount,
        spender: spender,
        expiration: expiration,
        sigDeadline: sigDeadline
      }
    };
  }

  // Handle PermitBatch (Permit2)
  if (primaryType === 'PermitBatch' && message.details && Array.isArray(message.details)) {
    const details = message.details.map((d, i) => {
      const MAX_UINT160 = '1461501637330902918203684832716283019655932542975';
      const amount = d.amount?.toString() || '0';
      const formattedAmount = amount === MAX_UINT160 ? 'Unlimited' : amount;
      return `${i + 1}. Token ${formatAddressShort(d.token)}: ${formattedAmount}`;
    });

    return {
      intent: `Batch Approve ${message.details.length} Tokens`,
      details: details
    };
  }

  // Handle typed data with embedded calldata (like SafeTx, execTransaction wrappers)
  // Note: Multicall/multiSend parsing is handled by the recursive decoder in showEnhancedTransactionInfo
  // This fallback only handles simple embedded calldata without multicall structure
  if (message.data && typeof message.data === 'string' && message.data.length > 10 && message.data.startsWith('0x')) {
    const selector = message.data.slice(0, 10);

    // Try to get function name from selector
    let functionName = null;
    if (window.registryLoader) {
      const selectorInfo = window.registryLoader.getSelectorInfo(selector);
      if (selectorInfo?.name) {
        functionName = selectorInfo.name;
      }
    }

    // Build intent based on what we know
    const toAddr = message.to ? formatAddressShort(message.to) : null;
    let intent;
    if (functionName) {
      intent = toAddr ? `${functionName} to ${toAddr}` : functionName;
    } else if (toAddr) {
      intent = `Call ${toAddr}`;
    } else {
      intent = `Sign ${primaryType}`;
    }

    // Build details excluding raw data field
    const details = [];
    if (message.to) details.push(`to: ${formatAddressShort(message.to)}`);
    if (message.value && message.value !== '0' && message.value !== 0) {
      details.push(`value: ${message.value}`);
    }
    if (functionName) {
      details.push(`function: ${functionName}`);
    } else {
      details.push(`selector: ${selector}`);
    }
    if (message.operation !== undefined) {
      details.push(`operation: ${message.operation === 0 ? 'Call' : message.operation === 1 ? 'DelegateCall' : message.operation}`);
    }
    if (message.nonce !== undefined) details.push(`nonce: ${message.nonce}`);

    return {
      intent: intent,
      details: details
    };
  }

  // Handle Order types (CoW Protocol, etc.) with semantic labels
  if (primaryType === 'Order' && message.sellToken && message.buyToken) {
    // Use plain text truncation (no HTML) - HTML formatting happens at render time
    const truncateAddr = (addr) => addr ? `${addr.slice(0, 10)}...${addr.slice(-8)}` : 'Unknown';
    const sellToken = truncateAddr(message.sellToken);
    const buyToken = truncateAddr(message.buyToken);
    const sellAmount = message.sellAmount?.toString() || '0';
    const buyAmount = message.buyAmount?.toString() || '0';
    const kind = message.kind || 'swap';

    return {
      intent: `${kind === 'sell' ? 'Sell' : kind === 'buy' ? 'Buy' : 'Swap'} Order`,
      details: [
        `Sell Token: ${sellToken}`,
        `Buy Token: ${buyToken}`,
        `Receiver: ${message.receiver ? truncateAddr(message.receiver) : 'Self'}`,
        `Sell Amount: ${sellAmount}`,
        `Buy Amount: ${buyAmount}`,
        `Valid Until: ${message.validTo ? new Date(parseInt(message.validTo) * 1000).toLocaleString() : 'N/A'}`,
        `Fee: ${message.feeAmount?.toString() || '0'}`,
        `Order Type: ${kind}`,
        `Partial Fill: ${message.partiallyFillable ? 'Yes' : 'No'}`
      ].filter(d => !d.includes('undefined'))
    };
  }

  // Handle generic typed data - extract all fields recursively
  if (types && types[primaryType]) {
    const fields = extractTypedDataFields(message, types, primaryType);
    if (fields.length > 0) {
      return {
        intent: `Sign ${primaryType}`,
        details: fields
      };
    }
  }

  return null;
}

/**
 * Recursively extract fields from typed data message
 */
function extractTypedDataFields(data, types, typeName, prefix = '') {
  const fields = [];
  const typeFields = types[typeName];

  if (!typeFields || !Array.isArray(typeFields)) return fields;

  for (const field of typeFields) {
    const value = data[field.name];
    const fullPath = prefix ? `${prefix}.${field.name}` : field.name;

    if (value === undefined || value === null) continue;

    // Check if this is a nested type
    const nestedType = types[field.type];
    if (nestedType && typeof value === 'object' && !Array.isArray(value)) {
      // Recurse into nested type
      const nestedFields = extractTypedDataFields(value, types, field.type, fullPath);
      fields.push(...nestedFields);
    } else if (field.type === 'address') {
      fields.push(`${field.name}: ${formatAddressShort(value)}`);
    } else if (field.type.startsWith('uint') && value.toString().length > 20) {
      // Large number - check for max values
      const MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
      const MAX_UINT160 = '1461501637330902918203684832716283019655932542975';
      const strVal = value.toString();
      if (strVal === MAX_UINT256 || strVal === MAX_UINT160) {
        fields.push(`${field.name}: Unlimited`);
      } else if (field.name.toLowerCase().includes('deadline') ||
                 field.name.toLowerCase().includes('expir')) {
        // Timestamp
        const ts = parseInt(strVal);
        if (ts > 4102444800) {
          fields.push(`${field.name}: Never expires`);
        } else {
          fields.push(`${field.name}: ${new Date(ts * 1000).toLocaleString()}`);
        }
      } else {
        fields.push(`${field.name}: ${strVal}`);
      }
    } else if (field.type.startsWith('uint') &&
               (field.name.toLowerCase().includes('deadline') ||
                field.name.toLowerCase().includes('expir'))) {
      // Timestamp field
      const ts = parseInt(value.toString());
      if (ts === 0) {
        fields.push(`${field.name}: Immediately`);
      } else if (ts > 4102444800) {
        fields.push(`${field.name}: Never expires`);
      } else {
        fields.push(`${field.name}: ${new Date(ts * 1000).toLocaleString()}`);
      }
    } else {
      fields.push(`${field.name}: ${value}`);
    }
  }

  return fields;
}

/**
 * Get token symbol - GENERIC, no hardcoded mappings
 * Token symbols should come from metadata
 */
function getTokenSymbol(address) {
  if (!address) return 'Unknown Token';
  // No hardcoded token mappings - metadata should provide symbols
  // Return formatted address as fallback
  return formatAddressShort(address);
}

// Helper formatters for Permit2
function formatAddressShort(addr, chainId = 1) {
  if (!addr) return 'Unknown';
  const truncated = `${addr.slice(0, 8)}...${addr.slice(-6)}`;

  // Async name resolution
  if (window.nameResolutionService && chainId) {
    window.nameResolutionService.resolveName(addr, chainId).then(name => {
      if (name) {
        // Update all instances of this address
        const elements = document.querySelectorAll(`[data-address="${addr}"]`);
        elements.forEach(el => {
          if (el.textContent === truncated) {
            el.textContent = name;
          }
        });
      }
    }).catch(err => {
      console.debug('[ContentScript] Name resolution failed:', err);
    });
  }

  return `<span class="kaisign-address" data-address="${addr}" title="${addr}">${truncated}</span>`;
}

function formatPermit2Amount(amount) {
  if (!amount) return '0';
  const amtStr = amount.toString();
  // Check for unlimited (max uint160 or max uint256)
  if (amtStr.length > 45 || amtStr === '1461501637330902918203684832716283019655932542975') {
    return 'Unlimited';
  }
  return amtStr;
}

function formatPermit2Timestamp(ts) {
  if (!ts) return 'N/A';
  try {
    const timestamp = parseInt(ts.toString());
    if (timestamp === 0) return 'Immediately';
    if (timestamp === 281474976710655 || timestamp > 4102444800) return 'Never';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  } catch {
    return ts.toString();
  }
}

/**
 * Format wei value to ETH string
 */
function formatWeiToEth(weiValue) {
  try {
    const wei = BigInt(weiValue);
    const eth = Number(wei) / 1e18;
    if (eth === 0) return '0';
    if (eth < 0.0001) return '<0.0001';
    return eth.toFixed(4).replace(/\.?0+$/, '');
  } catch {
    return weiValue;
  }
}

/**
 * Parse multicall/multisend packed data using metadata-defined structure
 * @param {string} calldata - The full calldata including selector
 * @param {object} structure - The multicallStructure from metadata defining field sizes
 */
function parseMulticallData(calldata, structure) {
  const transactions = [];

  try {
    const dataHex = calldata.slice(2); // Remove 0x

    // ABI encoding for bytes parameter: [selector 4b][offset 32b][length 32b][packed data...]
    const length = parseInt(dataHex.slice(72, 136), 16) * 2; // length in hex chars
    const packedData = dataHex.slice(136, 136 + length);

    // Get field sizes from metadata structure (in bytes, convert to hex chars)
    const opSize = (structure.operation?.size || 1) * 2;
    const toSize = (structure.to?.size || 20) * 2;
    const valueSize = (structure.value?.size || 32) * 2;
    const dataLenSize = (structure.dataLength?.size || 32) * 2;

    let pos = 0;
    while (pos < packedData.length) {
      // Parse fields based on metadata structure
      const operation = parseInt(packedData.slice(pos, pos + opSize), 16);
      pos += opSize;

      const to = '0x' + packedData.slice(pos, pos + toSize);
      pos += toSize;

      const value = BigInt('0x' + packedData.slice(pos, pos + valueSize)).toString();
      pos += valueSize;

      const dataLength = parseInt(packedData.slice(pos, pos + dataLenSize), 16) * 2;
      pos += dataLenSize;

      const data = '0x' + packedData.slice(pos, pos + dataLength);
      pos += dataLength;

      // Get selector and try to resolve function name
      const selector = data.length >= 10 ? data.slice(0, 10) : null;
      let functionName = null;

      if (selector && window.registryLoader) {
        const selectorInfo = window.registryLoader.getSelectorInfo(selector);
        if (selectorInfo?.name) {
          functionName = selectorInfo.name;
        }
      }

      // Get operation label from metadata or use raw value
      const opLabels = structure.operation?.labels;
      const operationLabel = opLabels ? (opLabels[operation] || `Operation ${operation}`) : operation;

      transactions.push({
        operation: operationLabel,
        to,
        value,
        data,
        selector,
        functionName
      });
    }
  } catch (e) {
    console.warn('[KaiSign] Failed to parse multicall data:', e.message);
  }

  return transactions;
}

/**
 * Check if primaryType is a permit type - GENERIC
 * No hardcoded type list - checks for common patterns
 */
function isPermit2Type(primaryType) {
  // No hardcoded type list - check if type name contains 'Permit'
  return primaryType && primaryType.toLowerCase().includes('permit');
}

/**
 * Extract intents from typed data - GENERIC, metadata-driven
 * No hardcoded type-specific logic
 */
function extractPermit2Intent(typedData, primaryType) {
  // No hardcoded type handling - let metadata drive the display
  // Return null to trigger metadata-based formatting
  return null;
}

/**
 * GENERIC: Handle typed data signature requests (EIP-712)
 * Works for any protocol with EIP-712 typed data (permits, batch operations, etc.)
 * Reads protocol configuration from ERC-7730 metadata
 */
async function handleTypedDataSignature(typedData, signerAddress, walletName) {
  try {
    KAISIGN_DEBUG && console.log('[KaiSign] Processing EIP-712 signature request');
    const primaryType = typedData?.primaryType || 'Unknown';

    // SHOW LOADING POPUP IMMEDIATELY
    showLoadingPopup(primaryType, walletName);

    KAISIGN_DEBUG && console.log('[KaiSign] Primary type:', typedData?.primaryType);
    KAISIGN_DEBUG && console.log('[KaiSign] Domain:', typedData?.domain?.name, typedData?.domain?.verifyingContract);

    // STEP 1: Try to use EIP-712 metadata for rich display
    const verifyingContract = typedData?.domain?.verifyingContract;
    updateLoadingStatus('Fetching EIP-712 metadata...');

    if (window.getEIP712Metadata) {
      const eip712Metadata = await window.getEIP712Metadata(verifyingContract, primaryType);

      if (eip712Metadata) {
        KAISIGN_DEBUG && console.log('[KaiSign] Found EIP-712 metadata for', primaryType);
        updateLoadingStatus(`Found metadata for ${primaryType}`);
        const displayData = await window.formatEIP712Display(typedData, eip712Metadata);

        // Generic: decode nested transaction data if present (works for any typed data with embedded calldata)
        // Look for common patterns: message.data + message.to (calldata to contract)
        if (typedData?.message?.data && typedData.message.data !== '0x' && typedData?.message?.to) {
          updateLoadingStatus('Decoding nested calldata...');
          const chainId = typedData?.domain?.chainId || 1;
          const targetAddress = typedData.message.to;

          KAISIGN_DEBUG && console.log('[KaiSign] Typed data has nested calldata, decoding intents...');

          // Use recursive decoder for full intent resolution
          let nestedIntents = [];
          if (window.decodeCalldataRecursive && targetAddress) {
            try {
              KAISIGN_DEBUG && console.log('[KaiSign] Decoding typed-data nested calldata with error containment:', typedData.message.data?.slice(0, 20), targetAddress, chainId);
              const decoded = await decodeWithErrorContainment(typedData.message.data, targetAddress, chainId, 'typed-data nested calldata');
              KAISIGN_DEBUG && console.log('[KaiSign] Recursive decode result:', decoded);
              if (decoded?.success) {
                // Use aggregatedIntent or collect nested intents
                if (decoded.nestedIntents?.length > 0) {
                  nestedIntents = decoded.nestedIntents;
                } else if (decoded.intent && decoded.intent !== 'Contract interaction') {
                  nestedIntents = [decoded.intent];
                }

                // Update display with real intents - show ONLY the leaf intents in main title
                if (nestedIntents.length > 0) {
                  // Get protocol name from metadata, domain, or primaryType
                  const protocolName = eip712Metadata?.metadata?.owner ||
                                       typedData?.domain?.name ||
                                       primaryType;
                  // Main intent shows only the actual operations (leaf intents)
                  displayData.intent = nestedIntents.join(' + ');
                  displayData.nestedIntents = nestedIntents;
                  // Store wrapper context separately for UI display (only if we have a name)
                  if (protocolName) {
                    displayData.wrapperIntent = `via ${protocolName}`;
                  }
                  KAISIGN_DEBUG && console.log('[KaiSign] Typed data decoded intents:', nestedIntents);
                  updateLoadingStatus(`Decoded ${nestedIntents.length} operation(s)`);
                }
              } else {
                KAISIGN_DEBUG && console.warn('[KaiSign] Recursive decode failed:', decoded?.error);
              }
            } catch (e) {
              console.error('[KaiSign] Error decoding typed data calldata:', e);
            }
          } else {
            KAISIGN_DEBUG && console.warn('[KaiSign] decodeCalldataRecursive not available or no targetAddress');
          }
        }

        // For Permit2 types AND any typed data with parseable structure, extract intents
        // BUT only if we don't already have decoded intents from recursive decoder
        // AND metadata didn't already provide formatted fields
        KAISIGN_DEBUG && console.log('[KaiSign] Checking typed data:', primaryType);
        if (!displayData.hasMetadataFields && (!displayData.nestedIntents || displayData.nestedIntents.length === 0)) {
          const parsedIntent = parsePermit2TypedData(typedData);
          if (parsedIntent) {
            KAISIGN_DEBUG && console.log('[KaiSign] Parsed typed data intent:', parsedIntent);
            displayData.intent = parsedIntent.intent;
            displayData.nestedIntents = parsedIntent.details;
          }
        }

        if ((!displayData.nestedIntents || displayData.nestedIntents.length === 0) && isPermit2Type(primaryType)) {
          // Fallback to old extraction for basic Permit2 types
          const permit2Intent = extractPermit2Intent(typedData, primaryType);
          if (permit2Intent) {
            displayData.intent = permit2Intent.intent;
            displayData.nestedIntents = permit2Intent.details;
          }
        }

        // Generic: handle wrapper messages that contain a hash of another message
        // Pattern: message.message is a hash (bytes32) of the original typed data
        if (typedData?.message?.message && typeof typedData.message.message === 'string' &&
            typedData.message.message.startsWith('0x') && typedData.message.message.length === 66) {
          const messageHash = typedData.message.message;
          KAISIGN_DEBUG && console.log('[KaiSign] Wrapper message hash:', messageHash);

          // Check if we have cached the original typed data for this hash
          const cachedData = window.kaisignTypedDataCache?.get(messageHash);
          if (cachedData) {
            KAISIGN_DEBUG && console.log('[KaiSign] Found cached typed data for wrapper message:', cachedData.primaryType);
            const parsed = parsePermit2TypedData(cachedData);
            if (parsed) {
              const domainName = typedData?.domain?.name || 'Protocol';
              displayData.intent = `${domainName} Sign: ${parsed.intent}`;
              displayData.nestedIntents = parsed.details;
            }
          } else {
            const domainName = typedData?.domain?.name || 'Protocol';
            displayData.intent = `Sign ${domainName} Message`;
            displayData.nestedIntents = [
              `Hash: ${messageHash ? messageHash.slice(0, 18) + '...' + messageHash.slice(-8) : 'Unknown'}`
            ];
            // Mark that this needs decode option
            displayData.showDecodeOption = true;
            displayData.messageHash = messageHash;
          }
        }

        updateLoadingStatus('Rendering signature details...');
        await showEIP712TypedDataDisplay(typedData, displayData, walletName);
        return;
      }
    }

    // STEP 2: Detect protocol from typed data structure using existing logic
    const protocolInfo = detectProtocolFromTypedData(typedData);

    // Extract transaction data if present in typed data
    const txData = extractTxFromTypedData(typedData, protocolInfo);

    if (txData && txData.data && txData.data !== '0x' && txData.data.length > 2) {
      // Parse the embedded transaction using generic protocol parser
      const chainId = typedData?.domain?.chainId || 1;
      const decoded = await parseProtocolTransaction(txData.data, txData.to, chainId, txData.value);

      // Build context for display
      const context = {
        isTypedDataSignature: true,
        protocolId: protocolInfo?.id || 'unknown',
        protocolName: protocolInfo?.name || 'Protocol',
        signerAddress: signerAddress,
        domain: typedData?.domain
      };

      // Show transaction info with parsed intent
      const intent = decoded?.intent || 'Signature Request - parsing...';
      getIntentAndShow(txData, 'eth_signTypedData_v4', walletName, context);
    } else {
      // No embedded transaction - use EIP-712 display with parsed typed data
      KAISIGN_DEBUG && console.log('[KaiSign] No embedded transaction in typed data');
      updateLoadingStatus('Rendering signature details...');

      // Build display data from parsed typed data (fallback when metadata unavailable)
      const parsedIntent = parsePermit2TypedData(typedData);
      const domain = typedData?.domain || {};
      const fallbackDisplay = {
        primaryType: typedData?.primaryType || 'Unknown',
        domainName: domain.name || 'Unknown',
        intent: parsedIntent?.intent || `Sign ${typedData?.primaryType || 'Message'}`,
        nestedIntents: parsedIntent?.details || [],
        fields: [],
        verifyingContract: domain.verifyingContract || '',
        chainId: domain.chainId || ''
      };
      await showEIP712TypedDataDisplay(typedData, fallbackDisplay, walletName);
    }
  } catch (error) {
    console.error('[KaiSign] Error handling typed data signature:', error);
  }
}

/**
 * Show EIP-712 typed data with rich metadata-driven display
 * Uses same popup structure as execute transaction for consistency
 */
async function showEIP712TypedDataDisplay(typedData, displayData, walletName) {
  KAISIGN_DEBUG && console.log('[KaiSign] Showing EIP-712 display:', displayData);

  // Remove old popup if exists
  const old = document.getElementById('kaisign-popup');
  if (old) old.remove();

  const domain = typedData?.domain || {};

  // Helper to escape HTML
  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  // Helper to truncate address
  // Helper to truncate address with name resolution and hover tooltip
  const truncateAddress = (addr) => {
    if (!addr || addr.length < 12) return addr || 'N/A';
    const truncated = `${addr.slice(0, 8)}...${addr.slice(-6)}`;

    // Async name resolution (try to get chainId from domain or default to mainnet)
    const chainId = typedData?.domain?.chainId || 1;
    if (window.nameResolutionService && chainId) {
      window.nameResolutionService.resolveName(addr, chainId).then(name => {
        if (name) {
          // Update all instances of this address in the popup
          const elements = document.querySelectorAll(`[data-address="${addr}"]`);
          elements.forEach(el => {
            if (el.textContent === truncated) {
              el.textContent = name;
            }
          });
        }
      }).catch(err => {
        console.debug('[ContentScript] Name resolution failed:', err);
      });
    }

    return `<span class="kaisign-address" data-address="${addr}" title="${addr}">${truncated}</span>`;
  };

  // Build nested intents section if present
  let intentsSection = '';
  if (displayData.nestedIntents?.length > 0) {
    intentsSection = `
      <div class="kaisign-section purple">
        <div class="kaisign-section-header">
          <span class="kaisign-section-title purple">Transaction Actions (${displayData.nestedIntents.length})</span>
        </div>
        <div class="kaisign-intents-list">
          ${displayData.nestedIntents.map((intent, i) => `
            <div class="kaisign-intent-row">
              <span class="kaisign-intent-num">${i + 1}.</span>
              <span class="kaisign-intent-text" title="${escapeHtml(intent || '')}">${escapeHtml((window.formatTitleAddresses || ((s) => s))(intent || ''))}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Build fields section
  let fieldsSection = '';
  if (displayData.fields?.length > 0) {
    fieldsSection = `
      <div class="kaisign-section">
        <div class="kaisign-section-header">
          <span class="kaisign-section-title">Message Details</span>
        </div>
        <div class="kaisign-fields-list">
          ${displayData.fields.map(field => {
            if (field.isArray && field.items) {
              return `
                <div class="kaisign-field-row">
                  <span class="kaisign-field-label">${escapeHtml(field.label)}:</span>
                  <span class="kaisign-field-value">${escapeHtml(field.value)}</span>
                </div>
                ${field.items.map(item => `
                  <div class="kaisign-field-subrow">
                    ${(item.fields || []).map(sf => `
                      <span class="kaisign-subfield-label">${escapeHtml(sf.label)}:</span>
                      <span class="kaisign-subfield-value">${escapeHtml(sf.value)}</span>
                    `).join(' ')}
                  </div>
                `).join('')}
              `;
            }
            return `
              <div class="kaisign-field-row">
                <span class="kaisign-field-label">${escapeHtml(field.label)}:</span>
                <span class="kaisign-field-value">${escapeHtml(field.value)}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // Build decode section for wrapper messages
  let decodeSection = '';
  if (displayData.showDecodeOption) {
    decodeSection = `
      <div class="kaisign-section" id="kaisign-decode-section">
        <div class="kaisign-section-header">
          <span class="kaisign-section-title">Decode Original Message</span>
        </div>
        <div class="kaisign-decode-content">
          <p style="font-size: 12px; color: #8b949e; margin: 0 0 10px 0;">
            Paste the original typed data JSON below to decode:
          </p>
          <div id="kaisign-decode-input-container"></div>
          <button id="kaisign-decode-btn" class="kaisign-btn kaisign-btn-primary" style="margin-top: 8px; width: 100%;">Decode Message</button>
          <div id="kaisign-decode-result" style="margin-top: 10px;"></div>
        </div>
      </div>
    `;
  }

  // Create popup using same structure as execute transaction
  const popup = document.createElement('div');
  popup.id = 'kaisign-popup';
  const theme = await getStoredTheme();
  popup.className = 'kaisign-popup theme-dark';

  popup.innerHTML = `
    <div class="kaisign-warning">
      DEMONSTRATION VERSION - USE AT YOUR OWN RISK
    </div>

    <div class="kaisign-popup-header">
      <div class="kaisign-popup-logo">
        <span class="kaisign-popup-logo-icon">KS</span>
        <div>
          <div class="kaisign-popup-title">KaiSign Analysis</div>
          <div class="kaisign-popup-subtitle">${escapeHtml(walletName)} | EIP-712 Signature</div>
        </div>
      </div>
      <button class="kaisign-close-btn" onclick="this.closest('.kaisign-popup').remove()">✕</button>
    </div>

    <div class="kaisign-intent-section">
      ${displayData.wrapperIntent ? `<div class="kaisign-wrapper-context">${escapeHtml(displayData.wrapperIntent)}</div>` : ''}
      <div class="kaisign-intent" title="${escapeHtml(displayData.intent || 'Sign Message')}">${escapeHtml((window.formatTitleAddresses || ((s) => s))(displayData.intent || 'Sign Message'))}</div>
      <div class="kaisign-details-grid">
        <div class="kaisign-detail-item">
          <span class="kaisign-detail-label">App: </span>
          <span class="kaisign-detail-value">${escapeHtml(domain.name || 'Unknown')}</span>
        </div>
        <div class="kaisign-detail-item">
          <span class="kaisign-detail-label">Contract: </span>
          <span class="kaisign-detail-value">${truncateAddress(domain.verifyingContract)}</span>
        </div>
        <div class="kaisign-detail-item">
          <span class="kaisign-detail-label">Type: </span>
          <span class="kaisign-detail-value">${escapeHtml(displayData.primaryType || 'Unknown')}</span>
        </div>
        <div class="kaisign-detail-item">
          <span class="kaisign-detail-label">Chain: </span>
          <span class="kaisign-detail-value">${escapeHtml(domain.chainId || '1')}</span>
        </div>
      </div>
    </div>

    <div class="kaisign-popup-content">
      ${intentsSection}
      ${fieldsSection}
      ${decodeSection}
    </div>

    <div class="kaisign-action-bar">
      <button class="kaisign-btn kaisign-btn-primary" onclick="showTransactionHistory()">History</button>
      <button class="kaisign-btn kaisign-btn-secondary" onclick="this.closest('.kaisign-popup').remove()">Close</button>
    </div>
  `;

  document.body.appendChild(popup);
  bindPopupClose(popup);
  attachPopupDrag(popup);

  const transactionData = {
    id: transactionContentId({
      to: domain.verifyingContract,
      value: '0',
      data: '0x',
      eip712TypedData: typedData
    }, 'eth_signTypedData_v4', {
      isEIP712: true,
      primaryType: displayData.primaryType,
      domainName: domain.name,
      chainId: domain.chainId
    }),
    method: 'eth_signTypedData_v4',
    time: new Date().toISOString(),
    // Original EIP-712 typed data (unmodified)
    to: domain.verifyingContract,
    value: '0',
    data: '0x', // EIP-712 has no bytecode, data is in eip712TypedData field
    eip712TypedData: typedData, // Store complete original typed data
    // Decoded/analyzed data (for display only)
    intent: displayData.intent || 'Sign Message',
    decodedResult: {
      success: true,
      functionName: displayData.primaryType,
      protocolName: domain.name || 'EIP-712',
      nestedIntents: displayData.nestedIntents
    },
    isEIP712: true,
    primaryType: displayData.primaryType,
    domainName: domain.name
  };

  saveTransactionViaAllChannels(transactionData);

  // Add decode button handler if decode section exists
  if (displayData.showDecodeOption) {
    const container = document.getElementById('kaisign-decode-input-container');
    const decodeBtn = document.getElementById('kaisign-decode-btn');
    const decodeResult = document.getElementById('kaisign-decode-result');
    const theme = await getStoredTheme();

    // Create iframe to completely isolate textarea from Safe's event listeners
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width: 100%; height: 90px; border: none; background: transparent;';
    iframe.setAttribute('sandbox', 'allow-same-origin');
    container.appendChild(iframe);

    // Wait for iframe to load then add textarea
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.open();
    const textareaBg = theme === 'dark' ? '#0d1117' : '#fff7ee';
    const textareaBorder = theme === 'dark' ? '#30363d' : '#e6dccf';
    const textareaColor = theme === 'dark' ? '#e6edf3' : '#2b2722';
    const textareaFocus = theme === 'dark' ? '#58a6ff' : '#0f9f9a';

    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: transparent; }
          textarea {
            width: 100%;
            height: 80px;
            background: ${textareaBg};
            border: 1px solid ${textareaBorder};
            border-radius: 6px;
            color: ${textareaColor};
            padding: 8px;
            font-family: monospace;
            font-size: 11px;
            resize: none;
            outline: none;
          }
          textarea:focus { border-color: ${textareaFocus}; }
        </style>
      </head>
      <body>
        <textarea id="decode-input" placeholder="Paste typed data JSON here..."></textarea>
      </body>
      </html>
    `);
    iframeDoc.close();

    const decodeInput = iframeDoc.getElementById('decode-input');

    if (decodeBtn && decodeResult && decodeInput) {
      decodeBtn.addEventListener('click', () => {
        const inputText = decodeInput.value.trim();
        if (!inputText) {
          decodeResult.innerHTML = '<div style="color: #f85149;">Please paste the typed data JSON</div>';
          return;
        }

        try {
          const typedData = JSON.parse(inputText);

          if (!typedData.primaryType || !typedData.message) {
            decodeResult.innerHTML = '<div style="color: #f85149;">Invalid typed data: missing primaryType or message</div>';
            return;
          }

          KAISIGN_DEBUG && console.log('[KaiSign] Decoding pasted typed data:', typedData.primaryType);

          // Parse the typed data
          const parsed = parsePermit2TypedData(typedData);

          if (parsed) {
            // Update the popup with decoded info
            const intentEl = popup.querySelector('.kaisign-intent');
            if (intentEl) {
              intentEl.textContent = `Safe Sign: ${parsed.intent}`;
            }

            // Replace intents section
            const contentEl = popup.querySelector('.kaisign-popup-content');
            if (contentEl) {
              const newIntentsHtml = `
                <div class="kaisign-section purple">
                  <div class="kaisign-section-header">
                    <span class="kaisign-section-title purple">Decoded Actions (${parsed.details.length})</span>
                  </div>
                  <div class="kaisign-intents-list">
                    ${parsed.details.map((detail, i) => `
                      <div class="kaisign-intent-row">
                        <span class="kaisign-intent-num">${i + 1}.</span>
                        <span class="kaisign-intent-text" title="${escapeHtml(detail || '')}">${escapeHtml((window.formatTitleAddresses || ((s) => s))(detail || ''))}</span>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `;

              // Remove decode section and add decoded intents
              const decodeSection = document.getElementById('kaisign-decode-section');
              if (decodeSection) {
                decodeSection.outerHTML = newIntentsHtml;
              }
            }

            KAISIGN_DEBUG && console.log('[KaiSign] Successfully decoded:', parsed);
          } else {
            // Show raw message fields if we can't parse it specifically
            const msg = typedData.message;
            const details = Object.entries(msg).slice(0, 5).map(([k, v]) => {
              const val = typeof v === 'object' ? JSON.stringify(v).slice(0, 50) + '...' : String(v).slice(0, 50);
              return `${k}: ${val}`;
            });

            decodeResult.innerHTML = `
              <div style="color: #3fb950; margin-bottom: 8px;">Type: ${typedData.primaryType}</div>
              <div style="font-size: 11px; color: #8b949e;">
                ${details.map(d => `<div>${d}</div>`).join('')}
              </div>
            `;
          }
        } catch (e) {
          console.error('[KaiSign] Decode error:', e);
          decodeResult.innerHTML = `<div style="color: #f85149;">Invalid JSON: ${e.message}</div>`;
        }
      });
    }
  }

  // Auto-remove after 30 seconds (same as execute popup)
  setTimeout(() => {
    if (popup.parentNode) popup.remove();
  }, 30000);
}

/**
 * GENERIC: Detect protocol from EIP-712 typed data structure
 * Uses metadata to identify protocol by type names
 */
function detectProtocolFromTypedData(typedData) {
  const types = typedData?.types || {};
  const typeNames = Object.keys(types).filter(t => t !== 'EIP712Domain');
  const domain = typedData?.domain || {};

  // Check metadata for protocol with matching type definitions
  const allMetadata = window.metadataService?.getAllProtocolMetadata?.() || {};

  for (const [protocolId, metadata] of Object.entries(allMetadata)) {
    const typedDataConfig = metadata?.typedData || metadata?.display?.typedData;
    if (typedDataConfig?.primaryType && typeNames.includes(typedDataConfig.primaryType)) {
      return { id: protocolId, name: metadata.name || protocolId, config: typedDataConfig };
    }
  }

  // Generic fallback - use domain name if available, otherwise generic EIP-712
  const protocolName = domain.name || 'EIP-712 Signature';
  return { id: 'eip712', name: protocolName };
}

/**
 * GENERIC: Extract transaction data from typed data message
 */
function extractTxFromTypedData(typedData, protocolInfo) {
  const message = typedData?.message;
  const domain = typedData?.domain || {};
  if (!message) return null;

  // Common patterns for embedded transaction data
  return {
    to: message.to || message.target || message.recipient,
    value: message.value || message.amount || '0',
    data: message.data || message.callData || message.input || '0x',
    operation: message.operation,
    chainId: domain.chainId ?? null,
    eip712TypedData: typedData
  };
}

/**
 * GENERIC: Show typed data info when no embedded transaction
 */
function showTypedDataInfo(typedData, signerAddress, walletName) {
  const domain = typedData?.domain || {};
  const primaryType = typedData?.primaryType || 'Unknown';

  console.log(`[KaiSign] Typed data signature: ${primaryType}`);
  console.log(`[KaiSign] Domain: ${domain.name || 'Unknown'} on chain ${domain.chainId || 'unknown'}`);

  // Try to parse typed data for better intent
  const parsedIntent = parsePermit2TypedData(typedData);
  const intent = parsedIntent?.intent || `Sign ${primaryType}`;
  const nestedIntents = parsedIntent?.details || [];

  // Show signature notification with parsed data
  showEnhancedTransactionInfo(
    { to: domain.verifyingContract, data: '0x', value: '0', eip712TypedData: typedData },
    'eth_signTypedData_v4',
    intent,
    walletName,
    {
      success: true,
      functionName: primaryType,
      intent: intent,
      nestedIntents: nestedIntents
    },
    [],
    { isEIP712: true, primaryType, domainName: domain.name }
  );
}

/**
 * RPC Method Classification and Handling
 */

// Define all monitored Ethereum RPC methods
const ETHEREUM_RPC_METHODS = {
  // Transaction methods - these require user approval and show popup
  TRANSACTION: [
    'eth_sendTransaction',
    'eth_signTransaction',
    'eth_sendRawTransaction',
    'eth_signTypedData',
    'eth_signTypedData_v1',
    'eth_signTypedData_v3',
    'eth_signTypedData_v4',
    'personal_sign',
    // EIP-5792 batch transaction methods (Ambire, Safe, etc.)
    'wallet_sendCalls'
  ],

  // Wallet capability queries - no popup needed
  WALLET_QUERY: [
    'wallet_getCallsStatus',
    'wallet_showCallsStatus',
    'wallet_getCapabilities'
  ],
  
  // Query methods - read blockchain state
  QUERY: [
    'eth_call',                 // Smart contract calls
    'eth_getBalance',           // Address balances
    'eth_getCode',              // Contract code
    'eth_getTransactionReceipt', // Transaction receipts
    'eth_getLogs',              // Event logs
    'eth_getTransactionByHash', // Transaction details
    'eth_getBlockByNumber',     // Block details
    'eth_getBlockByHash'        // Block details by hash
  ],
  
  // Network info methods
  NETWORK: [
    'eth_blockNumber',          // Latest block number
    'eth_chainId',              // Network chain ID
    'eth_gasPrice',             // Current gas price
    'eth_feeHistory',           // Fee history for EIP-1559
    'net_version',              // Network version
    'web3_clientVersion'        // Client version
  ],
  
  // Gas estimation methods
  GAS: [
    'eth_estimateGas',          // Gas estimation
    'eth_maxPriorityFeePerGas', // EIP-1559 priority fee
    'eth_gasPrice'              // Legacy gas price
  ],
  
  // Real-time subscription methods
  SUBSCRIPTION: [
    'eth_subscribe',            // Subscribe to events
    'eth_unsubscribe'           // Unsubscribe from events
  ],
  
  // Account methods
  ACCOUNT: [
    'eth_accounts',             // Get accounts
    'eth_requestAccounts',      // Request account access
    'wallet_addEthereumChain',  // Add custom chain
    'wallet_switchEthereumChain' // Switch chains
  ],
  
  // Wallet extension methods (snaps, plugins, custom methods)
  WALLET_EXTENSIONS: [
    'wallet_invokeSnap',        // Snap invocation (MetaMask Snaps)
    'wallet_requestSnaps',      // Request Snap permissions
    'wallet_getSnaps',          // Get installed snaps
    'wallet_registerOnboarding', // Wallet onboarding
    'wallet_watchAsset'         // Add custom token
  ]
};

// RPC activity tracking
const rpcActivity = {
  methods: {},
  timeline: [],
  patterns: {},
  security: {
    suspiciousActivity: [],
    privacyConcerns: [],
    mevIndicators: []
  }
};

/**
 * Check if a method should be monitored
 */
function isMonitoredEthereumMethod(method) {
  return Object.values(ETHEREUM_RPC_METHODS).flat().includes(method);
}

/**
 * Check if method is transaction-related
 */
function isTransactionMethod(method) {
  return ETHEREUM_RPC_METHODS.TRANSACTION.includes(method);
}

/**
 * Get method category
 */
function getMethodCategory(method) {
  for (const [category, methods] of Object.entries(ETHEREUM_RPC_METHODS)) {
    if (methods.includes(method)) {
      return category.toLowerCase();
    }
  }
  return 'unknown';
}

/**
 * Handle non-transaction RPC methods
 */
function handleRpcMethod(method, params, walletName) {
  const timestamp = Date.now();
  const category = getMethodCategory(method);
  
  // Track method frequency
  if (!rpcActivity.methods[method]) {
    rpcActivity.methods[method] = { count: 0, lastCalled: null, category };
  }
  rpcActivity.methods[method].count++;
  rpcActivity.methods[method].lastCalled = timestamp;
  
  // Add to timeline
  rpcActivity.timeline.unshift({
    method,
    category,
    params,
    walletName,
    timestamp,
    time: new Date().toISOString()
  });
  
  // Keep timeline manageable
  if (rpcActivity.timeline.length > 100) {
    rpcActivity.timeline.splice(100);
  }
  
  // Analyze patterns and security implications
  analyzeRpcPatterns(method, params, category, timestamp);
  
  // Show RPC activity notification for important methods
  if (shouldShowRpcNotification(method, category)) {
    showRpcActivityNotification(method, params, category, walletName);
  }
  
}

/**
 * Analyze RPC patterns for security and privacy concerns
 */
function analyzeRpcPatterns(method, params, category, timestamp) {
  // Detect excessive balance checking (privacy concern)
  if (method === 'eth_getBalance') {
    const recentBalanceChecks = rpcActivity.timeline.filter(
      activity => activity.method === 'eth_getBalance' && 
      timestamp - activity.timestamp < 60000 // Last 1 minute
    ).length;
    
    if (recentBalanceChecks > 10) {
      rpcActivity.security.privacyConcerns.push({
        type: 'excessive_balance_checking',
        count: recentBalanceChecks,
        timestamp,
        addresses: params?.[0] ? [params[0]] : []
      });
    }
  }
  
  // Detect rapid gas price checking (MEV indicator)
  if (method === 'eth_gasPrice' || method === 'eth_feeHistory') {
    const recentGasChecks = rpcActivity.timeline.filter(
      activity => (activity.method === 'eth_gasPrice' || activity.method === 'eth_feeHistory') &&
      timestamp - activity.timestamp < 10000 // Last 10 seconds
    ).length;
    
    if (recentGasChecks > 5) {
      rpcActivity.security.mevIndicators.push({
        type: 'rapid_gas_monitoring',
        count: recentGasChecks,
        timestamp,
        pattern: 'potential_mev_activity'
      });
    }
  }
  
  // Detect rapid block monitoring (frontrunning indicator)
  if (method === 'eth_blockNumber') {
    const recentBlockChecks = rpcActivity.timeline.filter(
      activity => activity.method === 'eth_blockNumber' &&
      timestamp - activity.timestamp < 5000 // Last 5 seconds
    ).length;
    
    if (recentBlockChecks > 3) {
      rpcActivity.security.mevIndicators.push({
        type: 'rapid_block_monitoring',
        count: recentBlockChecks,
        timestamp,
        pattern: 'potential_frontrunning'
      });
    }
  }
  
  // Detect contract discovery patterns
  if (method === 'eth_getCode') {
    const address = params?.[0];
    if (address) {
      const codeChecks = rpcActivity.timeline.filter(
        activity => activity.method === 'eth_getCode'
      ).length;
      
      if (codeChecks > 20) {
        rpcActivity.security.suspiciousActivity.push({
          type: 'extensive_contract_discovery',
          count: codeChecks,
          timestamp,
          addresses: [address]
        });
      }
    }
  }
}

/**
 * Determine if RPC method should show notification
 */
function shouldShowRpcNotification(method, category) {
  // Show notifications for important methods
  const importantMethods = [
    'wallet_addEthereumChain',
    'wallet_switchEthereumChain',
    'eth_requestAccounts',
    'eth_subscribe',
    'eth_sendRawTransaction'
  ];
  
  return importantMethods.includes(method);
}

/**
 * Show RPC activity notification
 */
function showRpcActivityNotification(method, params, category, walletName) {
  // Add animation keyframes (inject once)
  if (!document.getElementById('kaisign-rpc-animations')) {
    const style = document.createElement('style');
    style.id = 'kaisign-rpc-animations';
    style.textContent = `
      @keyframes slideInLeft {
        from {
          transform: translateX(-100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Detect current theme from body or use light as default
  const isDarkTheme = document.body.classList.contains('theme-dark') ||
                      document.body.getAttribute('data-theme') === 'dark' ||
                      window.matchMedia('(prefers-color-scheme: dark)').matches;

  // Atelier theme colors
  const colors = isDarkTheme ? {
    bg: '#161b22',
    surface: '#21262d',
    border: '#30363d',
    text: '#e6edf3',
    textMuted: '#8b949e',
    accent: '#58a6ff',
    accentStrong: '#4393e6',
    success: '#3fb950',
    shadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
    shadowTight: '0 6px 18px rgba(0, 0, 0, 0.3)'
  } : {
    bg: '#f7f3ee',
    surface: '#ffffff',
    border: '#e6dccf',
    text: '#2b2722',
    textMuted: '#7a6f63',
    accent: '#0f9f9a',
    accentStrong: '#0b7f7b',
    success: '#16a34a',
    shadow: '0 10px 30px rgba(43, 39, 34, 0.08)',
    shadowTight: '0 6px 18px rgba(43, 39, 34, 0.08)'
  };

  // Create notification popup
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    width: 320px;
    background: ${colors.surface};
    border: 1px solid ${colors.border};
    color: ${colors.text};
    padding: 14px 16px;
    border-radius: 14px;
    z-index: 999998;
    font-family: "Sora", "Avenir Next", "Segoe UI", sans-serif;
    font-size: 13px;
    line-height: 1.5;
    box-shadow: ${colors.shadowTight};
    animation: slideInLeft 0.3s ease;
  `;

  // Format method description
  const getMethodDescription = (method) => {
    // Format method name to readable text
    const methodParts = method.split('_');
    return methodParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  };

  const description = getMethodDescription(method);

  const hoverBg = isDarkTheme ? '#30363d' : '#f3ebe0';

  notification.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 6px; height: 6px; background: ${colors.accent}; border-radius: 50%;"></div>
        <strong style="color: ${colors.text}; font-size: 14px; font-weight: 700;">RPC Activity</strong>
      </div>
      <button onclick="this.parentElement.parentElement.remove()"
              style="background: transparent; border: none; color: ${colors.textMuted}; cursor: pointer; padding: 4px; border-radius: 6px; font-size: 16px; line-height: 1; transition: all 0.2s;"
              onmouseover="this.style.background='${hoverBg}'; this.style.color='${colors.text}';"
              onmouseout="this.style.background='transparent'; this.style.color='${colors.textMuted}';">✕</button>
    </div>
    <div style="color: ${colors.text}; font-weight: 600; font-size: 14px; margin-bottom: 8px;">
      ${description}
    </div>
    <div style="display: flex; gap: 12px; font-size: 12px; color: ${colors.textMuted};">
      <span style="display: flex; align-items: center; gap: 6px;">
        <span style="opacity: 0.6;">Wallet:</span>
        <span style="color: ${colors.text};">${walletName}</span>
      </span>
      <span style="opacity: 0.4;">•</span>
      <span style="display: flex; align-items: center; gap: 6px;">
        <span style="opacity: 0.6;">Category:</span>
        <span style="color: ${colors.text}; text-transform: capitalize;">${category}</span>
      </span>
    </div>
    ${params && params.length > 0 ? `
      <div style="margin-top: 10px; padding: 10px 12px; background: ${isDarkTheme ? '#0d1117' : '#f3ebe0'}; border: 1px solid ${colors.border}; border-radius: 10px; font-size: 11px; color: ${colors.textMuted}; font-family: 'SF Mono', Consolas, monospace; line-height: 1.4; max-height: 100px; overflow: auto;">
        ${JSON.stringify(params, null, 2).slice(0, 300)}${JSON.stringify(params).length > 300 ? '...' : ''}
      </div>
    ` : ''}
  `;

  document.body.appendChild(notification);

  // Auto-remove after 8 seconds
  setTimeout(() => {
    if (notification.parentNode) notification.remove();
  }, 8000);
}

// Generic wallet provider hooker
function hookWalletProvider(provider, walletKey, walletName = walletKey) {
  if (!provider.request) return;
  if (provider.__kaisignHooked) return;

  Object.defineProperty(provider, '__kaisignHooked', {
    value: true,
    configurable: true,
    enumerable: false,
    writable: false
  });

  const originalRequest = provider.request.bind(provider);
  let lastObservedChainId = null;

  const normalizeChainId = (value) => {
    if (value == null || value === '') return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) && value > 0 ? value : null;
    }
    if (typeof value === 'string') {
      const parsed = value.startsWith('0x') || value.startsWith('0X')
        ? parseInt(value, 16)
        : parseInt(value, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    return null;
  };

  const resolveProviderChainId = async () => {
    if (lastObservedChainId != null) return lastObservedChainId;
    try {
      const reported = await originalRequest({ method: 'eth_chainId' });
      const normalized = normalizeChainId(reported);
      if (normalized != null) {
        lastObservedChainId = normalized;
      }
      return normalized;
    } catch (error) {
      KAISIGN_DEBUG && console.warn('[KaiSign] Failed to resolve provider chainId:', error?.message || error);
      return null;
    }
  };

  provider.request = async function(args) {

    // Check if it's any Ethereum RPC method we want to monitor
    if (isMonitoredEthereumMethod(args.method)) {

      console.log(`[KaiSign] Intercepted ${args.method} from ${walletName}`, args.params);
      
      // Handle different method categories
      if (isTransactionMethod(args.method)) {
        // Transaction and signature methods
        if (args.method.startsWith('eth_signTypedData')) {
          // Handle ALL EIP-712 typed data signature requests (v1, v3, v4, etc.)
          const typedDataRaw = args.params?.[1];
          const address = args.params?.[0];

          console.log('[KaiSign] EIP-712 request via:', args.method);

          if (typedDataRaw) {
            // Parse JSON string if needed
            let typedData;
            try {
              typedData = typeof typedDataRaw === 'string' ? JSON.parse(typedDataRaw) : typedDataRaw;
              console.log('[KaiSign] Parsed typedData:', { hasTypes: !!typedData.types, primaryType: typedData.primaryType });

              // Cache typed data by content-based key for later lookup
              // Skip caching wrapper types that contain nested messages (detected by having 'message' field with embedded typed data)
              const isWrapperType = typedData.message?.message !== undefined ||
                                    (typedData.message?.data && typedData.message?.to);
              if (typedData.primaryType && !isWrapperType) {
                const cacheKey = JSON.stringify(typedData.message);
                window.kaisignTypedDataCache = window.kaisignTypedDataCache || new Map();
                window.kaisignTypedDataCache.set(cacheKey, typedData);
                console.log('[KaiSign] Cached typed data:', typedData.primaryType);
              }
            } catch (e) {
              console.error('[KaiSign] Failed to parse typedData:', e);
              typedData = typedDataRaw;
            }

            handleTypedDataSignature(typedData, address, walletName);
          }
        } else if (args.method === 'personal_sign') {
          // Handle personal message signing - use same popup UI
          const message = args.params?.[0];
          const address = args.params?.[1];
          console.log('[KaiSign] Processing personal_sign request:', message);
          handlePersonalSign(message, address, walletName);
        } else if (args.method === 'wallet_sendCalls') {
          // EIP-5792 batch calls (Ambire, Safe, etc.)
          console.log('[KaiSign] EIP-5792 wallet_sendCalls detected:', args.params);
          const batchParams = args.params?.[0] || {};
          const calls = batchParams.calls || [];

          // Convert hex chainId to number if needed
          let chainId = batchParams.chainId;
          if (typeof chainId === 'string' && chainId.startsWith('0x')) {
            chainId = parseInt(chainId, 16);
          }

          // Process batch as single consolidated transaction
          handleEIP5792Batch(calls, batchParams.from, chainId, walletName);
        } else {
          // Handle regular transactions (eth_sendTransaction, eth_signTransaction)
          const tx = { ...(args.params?.[0] || {}) };
          const observedChainId = await resolveProviderChainId();
          if (observedChainId != null) {
            tx.chainId = observedChainId;
          } else if (tx.chainId !== undefined) {
            tx.chainId = normalizeChainId(tx.chainId);
          }
          getIntentAndShow(tx, args.method, walletName, null);
        }
      } else {
        // Handle all other RPC methods (queries, utilities, etc.)
        handleRpcMethod(args.method, args.params, walletName);
      }
    }

    // Call original wallet request
    return await originalRequest(args);
  };

  // Add WalletConnect-specific event listeners
  if (provider.on && provider.isWalletConnect) {
    provider.on('disconnect', () => {
      KAISIGN_DEBUG && console.log('[KaiSign] WalletConnect session disconnected');
    });

    provider.on('session_delete', () => {
      KAISIGN_DEBUG && console.log('[KaiSign] WalletConnect session deleted');
    });

    provider.on('chainChanged', (chainId) => {
      lastObservedChainId = normalizeChainId(chainId);
      KAISIGN_DEBUG && console.log('[KaiSign] WalletConnect chain changed to:', chainId);
    });

    provider.on('accountsChanged', (accounts) => {
      KAISIGN_DEBUG && console.log('[KaiSign] WalletConnect accounts changed:', accounts);
    });
  }

}

// Handle personal_sign - use same popup UI as other methods
function handlePersonalSign(message, address, walletName) {
  KAISIGN_DEBUG && console.log('[KaiSign] Processing personal_sign');

  // Decode message if hex
  let decodedMessage = message;
  let isHex = false;
  if (message && message.startsWith('0x')) {
    isHex = true;
    try {
      // Try to decode as UTF-8
      const bytes = [];
      for (let i = 2; i < message.length; i += 2) {
        bytes.push(parseInt(message.substr(i, 2), 16));
      }
      decodedMessage = new TextDecoder().decode(new Uint8Array(bytes));
    } catch (e) {
      decodedMessage = message; // Keep hex if decode fails
    }
  }

  // Create a transaction-like object for unified display
  const tx = {
    to: address,
    from: address,
    data: message,
    value: '0x0'
  };

  // Show popup using same UI
  showEnhancedTransactionInfo(
    tx,
    'personal_sign',
    `Sign Message: "${decodedMessage.slice(0, 50)}${decodedMessage.length > 50 ? '...' : ''}"`,
    walletName,
    {
      success: true,
      functionName: 'Personal Sign',
      selector: '0x',
      message: decodedMessage,
      isHex: isHex,
      originalMessage: message
    },
    []
  );
}

// Track last processed batch to prevent duplicates
let lastBatchHash = null;
let lastBatchTime = 0;

async function decodeWithErrorContainment(calldata, targetAddress, chainId, contextLabel = 'transaction') {
  if (!calldata || calldata.length < 10) return null;

  if (window.decodeCalldataRecursive) {
    try {
      return await window.decodeCalldataRecursive(calldata, targetAddress, chainId);
    } catch (recursiveError) {
      console.warn(`[KaiSign] Recursive decoder failed for ${contextLabel}, falling back to plain decoder:`, recursiveError);
    }
  }

  if (window.decodeCalldata) {
    return await window.decodeCalldata(calldata, targetAddress, chainId);
  }

  return null;
}

// Handle EIP-5792 batch calls (Ambire, Safe, etc.) - consolidate into single popup
async function handleEIP5792Batch(calls, from, chainId, walletName) {
  // Create hash of batch to detect duplicates
  const batchHash = calls.map(c => c.data?.slice(0, 20) || '').join('-');
  const now = Date.now();

  // Skip if same batch within 3 seconds
  if (batchHash === lastBatchHash && now - lastBatchTime < 3000) {
    KAISIGN_DEBUG && console.log('[KaiSign] Skipping duplicate batch call');
    return;
  }
  lastBatchHash = batchHash;
  lastBatchTime = now;

  KAISIGN_DEBUG && console.log(`[KaiSign] Processing EIP-5792 batch: ${calls.length} calls`);

  // SHOW LOADING POPUP IMMEDIATELY
  const method = `wallet_sendCalls (${calls.length} ops)`;
  showEnhancedTransactionInfo(
    { to: from, from: from, data: '0x', value: '0x0', chainId },
    method,
    'Processing batch...',
    walletName,
    { success: false, isLoading: true },
    []
  );

  const batchIntents = [];
  const batchBytecodes = [];

  // Decode each call
  for (let i = 0; i < calls.length; i++) {
    updateLoadingStatus(`Decoding call ${i + 1} of ${calls.length}...`);
    const call = calls[i];
    const selector = call.data?.slice(0, 10) || '0x';

    let intent = `Call ${i + 1}: ${call.to?.slice(0, 10)}...`;
    let decoded = null;

    try {
      if (call.data && call.data.length >= 10) {
        decoded = await decodeWithErrorContainment(call.data, call.to, chainId, `batch call ${i + 1}`);
        KAISIGN_DEBUG && console.log(`[KaiSign] Batch call ${i + 1} decoded:`, {
          success: decoded?.success,
          functionName: decoded?.functionName,
          intent: decoded?.intent,
          params: decoded?.params,
          formatted: decoded?.formatted
        });
        if (decoded && decoded.success) {
          intent = decoded.aggregatedIntent || decoded.intent || `${decoded.functionName || 'Unknown'}`;
        }
      }
    } catch (e) {
      KAISIGN_DEBUG && console.warn(`[KaiSign] Failed to decode batch call ${i + 1}:`, e);
    }

    batchIntents.push({
      index: i + 1,
      to: call.to,
      value: call.value || '0x0',
      data: call.data,
      selector: selector,
      intent: intent,
      decoded: decoded
    });

    // Add to bytecodes for display
    batchBytecodes.push({
      bytecode: call.data,
      selector: selector,
      depth: 1,
      index: i,
      target: call.to,
      functionName: decoded?.functionName || selector,
      intent: intent,
      type: 'eip5792_call'
    });
  }

  updateLoadingStatus('Rendering batch details...');

  // Create consolidated transaction object
  const batchTx = {
    to: from, // Self-call for EIP-7702
    from: from,
    data: calls.map(c => c.data).join(''), // Concatenated for display
    value: '0x0',
    chainId: chainId,
    _eip5792: true,
    _batchCalls: calls,
    _batchIntents: batchIntents
  };

  // Create consolidated intent
  const consolidatedIntent = `Batch: ${batchIntents.map(b => b.intent).join(' → ')}`;

  // Show single popup with all batch info (after all decoding complete)
  showEnhancedTransactionInfo(
    batchTx,
    `wallet_sendCalls (${calls.length} ops)`,
    consolidatedIntent,
    walletName,
    {
      success: true,
      functionName: 'EIP-5792 Batch',
      selector: '0x5792',
      batchIntents: batchIntents
    },
    batchBytecodes
  );
}

// Track last transaction to prevent rapid duplicate popups
let lastTxSignature = null;
let lastTxTime = 0;

// Get intent and show transaction
async function getIntentAndShow(tx, method, walletName = 'Wallet', context = null) {
  // Simple deduplication: skip if exact same transaction within 500ms
  const txSignature = `${tx.to || ''}-${(tx.data || '').slice(0, 66)}`;
  const now = Date.now();
  if (txSignature === lastTxSignature && (now - lastTxTime) < 500) {
    KAISIGN_DEBUG && console.log('[KaiSign] Skipping duplicate transaction (same tx within 500ms)');
    return;
  }
  lastTxSignature = txSignature;
  lastTxTime = now;

  let intent = 'Analyzing transaction...';
  let decodedResult = null;
  let extractedBytecodes = [];
  const selector = tx.data?.slice(0, 10);
  const authorizationList = Array.isArray(tx.authorizationList) ? tx.authorizationList : [];
  const isEIP7702Envelope = tx.type === '0x04' || tx.type === 4 || authorizationList.length > 0;
  const delegatedImplementationAddress = isEIP7702Envelope
    ? authorizationList
        .map((auth) => auth?.address)
        .find((addr) => typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr))
    : null;
  const decodeTargetAddress = delegatedImplementationAddress || tx.to;

  // SHOW LOADING POPUP IMMEDIATELY (only once)
  await showEnhancedTransactionInfo(tx, method, intent, walletName, { success: false, isLoading: true }, []);

  // TYPED DATA SIGNATURE CONTEXT - CHECK FIRST
  if (context && context.isTypedDataSignature) {
    const protocolName = context.protocolName || 'Protocol';
    KAISIGN_DEBUG && console.log(`[KaiSign] ${protocolName} signature context detected - checking transaction data`);
    updateLoadingStatus(`${protocolName} Signature - parsing...`);
    KAISIGN_DEBUG && console.log('[KaiSign] Typed data transaction selector:', tx.data ? tx.data.slice(0, 10) : 'no data');
  }

  // =============================================================================
  // GENERIC TRANSACTION DECODING - ALL PARSING VIA ERC-7730 METADATA
  // =============================================================================

  if (tx.data && tx.data.length >= 10) {
    KAISIGN_DEBUG && console.log('[KaiSign] Transaction detected - selector:', selector);
    const chainId = context?.chainId ?? tx.chainId ?? tx.eip712TypedData?.domain?.chainId ?? null;

    if (chainId == null) {
      decodedResult = {
        success: false,
        selector,
        error: 'Chain ID unavailable',
        statusTitle: 'Chain ID unavailable',
        statusDetail: 'Provider did not report a chain ID for this transaction'
      };
      intent = 'Transaction captured without chain ID';
      updateLoadingStatus('Chain ID unavailable');
    } else {
      updateLoadingStatus('Fetching metadata...');

      try {
        // GENERIC: Use ERC-7730 metadata to parse ANY transaction
        // Try recursive decoder first for full nested intent resolution
        let decoded;
        updateLoadingStatus('Decoding transaction...');
        decoded = await decodeWithErrorContainment(tx.data, decodeTargetAddress, chainId, 'transaction');

        if (decoded && decoded.success) {
          updateLoadingStatus('Parsing intents...');
          // Use aggregated intent if available (includes nested intents).
          // For noFormat results (ABI-decoded but no curated clear-sign metadata),
          // surface the function signature so users see "Function call: transfer(address,uint256)"
          // instead of the ambiguous "Contract interaction" — distinguishes "no metadata"
          // from "decoder failed" (success: false branch shows generic string).
          intent = decoded.aggregatedIntent || decoded.intent || 'Contract interaction';
          intent = summarizeNestedActionTitle(method, decoded, intent);
          if (decoded.noFormat && decoded.function) {
            intent = `Function call: ${decoded.function}`;
          }
          decodedResult = {
            success: true,
            functionName: decoded.functionName || 'Contract Call',
            selector: selector,
            intent: intent,
            nestedIntents: decoded.nestedIntents || [],
            ...decoded
          };

          // Convert nested decodes to extractedBytecodes format for UI display
          if (decoded.nestedDecodes && decoded.nestedDecodes.length > 0) {
            KAISIGN_DEBUG && console.log('[KaiSign] RAW nestedDecodes from recursive decoder:', JSON.stringify(decoded.nestedDecodes, null, 2));
            extractedBytecodes = flattenNestedDecodesToBytecodes(decoded.nestedDecodes, 1);
            KAISIGN_DEBUG && console.log('[KaiSign] Flattened to extractedBytecodes:', extractedBytecodes.length, 'entries');
          }

          KAISIGN_DEBUG && console.log(`[KaiSign] Decoded transaction: ${intent}`);
        } else if (decoded && !decoded.success && decoded.intent) {
          // Metadata was found but function selector wasn't matched — use the informative intent
          const missingMetadata = (decoded.error || '').toLowerCase().includes('no metadata');
          intent = decoded.intent;
          decodedResult = {
            success: false,
            selector: selector,
            contractName: decoded.contractName || '',
            metadata: decoded.metadata,
            unknownSummary: decoded.unknownSummary || null,
            params: decoded.params,
            formatted: decoded.formatted,
            functionName: decoded.functionName,
            function: decoded.function,
            intent: intent,
            error: decoded.error || 'Function not found in metadata',
            statusTitle: missingMetadata ? 'Metadata not found' : 'Function not recognized',
            statusDetail: missingMetadata
              ? (decoded.unknownSummary?.lines?.[0] || 'No matching metadata for this contract')
              : decoded.contractName
              ? `Selector ${selector} not found in ${decoded.contractName} metadata`
              : decoded.error || 'Function not found in metadata'
          };
          KAISIGN_DEBUG && console.log(`[KaiSign] Partial decode - known contract, unknown function: ${intent}`);
        }
      } catch (decodeError) {
        console.error('[KaiSign] Transaction decoding error:', decodeError);
        decodedResult = {
          success: false,
          selector,
          error: decodeError?.message || 'Transaction decode failed',
          statusTitle: 'Decode failed',
          statusDetail: decodeError?.message || 'Transaction decode failed'
        };
        intent = 'Unable to decode transaction';
        updateLoadingStatus('Decode failed');
      }
    }
  }

  if (!decodedResult && isEIP7702Envelope) {
    const authCount = authorizationList.length;
    const delegationTargets = authCount > 0
      ? authorizationList
          .map((auth) => auth?.address)
          .filter((addr) => typeof addr === 'string' && addr.startsWith('0x'))
      : [];
    const uniqueTargets = [...new Set(delegationTargets.map((addr) => addr.toLowerCase()))];
    const primaryTarget = delegationTargets[0] || null;
    const isRevocation = primaryTarget === '0x0000000000000000000000000000000000000000';

    if (!tx.data || tx.data === '0x') {
      intent = isRevocation
        ? 'Revoke EIP-7702 delegation'
        : uniqueTargets.length > 1
        ? `Authorize ${uniqueTargets.length} EIP-7702 delegations`
        : primaryTarget
        ? `Authorize EIP-7702 delegation to ${primaryTarget}`
        : 'Authorize EIP-7702 delegation';
    } else if (!decodedResult?.success) {
      intent = intent === 'Unknown contract interaction'
        ? 'Execute delegated EIP-7702 transaction'
        : intent;
    }

    decodedResult = decodedResult || {
      success: true,
      selector,
      functionName: tx.data && tx.data.length >= 10 ? 'Delegated transaction' : 'EIP-7702 delegation',
      intent,
      txType: 'EIP-7702',
      authorizationCount: authCount
    };
  }

  // ADDITIONAL DECODING: only run heuristic nested-bytecode scans when the
  // primary decode did not already succeed. Successful top-level decodes have
  // already gone through recursive-decoder.js, so doing a second heuristic
  // pass here just adds latency to simple calls like ERC-20 transfers.
  if (!decodedResult?.success && tx.data && tx.data.length > 10) {
    updateLoadingStatus('Scanning for nested calls...');

    if (window.AdvancedTransactionDecoder) {
      try {
        const decoder = new window.AdvancedTransactionDecoder();
        const chainId = context?.chainId ?? tx.chainId ?? null;
        if (chainId != null) {
          const advancedResult = await decoder.decodeTransaction(tx, decodeTargetAddress, chainId);
          if (advancedResult?.extractedBytecodes?.length > 0) {
            extractedBytecodes = advancedResult.extractedBytecodes;
            updateLoadingStatus(`Found ${extractedBytecodes.length} nested call(s)`);
          }
        }
      } catch (e) {
        // Try generic parser as fallback
        try {
          const genericBytecodes = await parseGenericNestedBytecode(tx.data);
          if (genericBytecodes?.length > 0) {
            extractedBytecodes = genericBytecodes;
          }
        } catch (genericError) {
          // Ignore
        }
      }
    }
  }

  if (!decodedResult) {
    decodedResult = {
      success: false,
      selector,
      error: 'Metadata not found',
      statusTitle: 'Metadata not found',
      statusDetail: 'No matching metadata for this contract'
    };
    intent = 'Unknown contract interaction';
    updateLoadingStatus('Metadata not found');
  } else {
    if (decodedResult.unknownSummary?.lines?.length) {
      decodedResult.statusDetail = decodedResult.unknownSummary.lines[0];
    }
    updateLoadingStatus('Rendering decoded transaction...');
  }

  // SHOW FINAL RESULT (only once, after all decoding is complete)
  showEnhancedTransactionInfo(tx, method, intent, walletName, decodedResult, extractedBytecodes, {
    ...context
  })
    .catch(err => console.error('[KaiSign] showEnhancedTransactionInfo error:', err));
}

// Show enhanced transaction info with complete bytecode data
async function showEnhancedTransactionInfo(tx, method, intent, walletName = 'Wallet', decodedResult = null, extractedBytecodes = [], context = null) {
  KAISIGN_DEBUG && console.log('[KaiSign] showEnhancedTransactionInfo called:', { method, intent, walletName, isLoading: decodedResult?.isLoading });

  // If loading state, show loading popup with bouncing dots
  if (decodedResult?.isLoading) {
    const old = document.getElementById('kaisign-popup');
    if (old) old.remove();

    const popup = document.createElement('div');
    popup.id = 'kaisign-popup';
    const theme = await getStoredTheme();
    popup.className = 'kaisign-popup theme-dark';
    popup.innerHTML = `
      <div class="kaisign-warning">
        DEMONSTRATION VERSION - USE AT YOUR OWN RISK
      </div>
      <div class="kaisign-popup-header">
        <div class="kaisign-popup-logo">
          <span class="kaisign-popup-logo-icon">KS</span>
          <div>
            <div class="kaisign-popup-title">KaiSign Analysis</div>
            <div class="kaisign-popup-subtitle">${walletName} | ${method}</div>
          </div>
        </div>
        <button class="kaisign-close-btn" onclick="this.closest('.kaisign-popup').remove()">✕</button>
      </div>
      <div class="kaisign-popup-content">
        <div class="kaisign-section" style="text-align: center; padding: 30px;">
          <div class="kaisign-loading-dots">
            <span></span><span></span><span></span>
          </div>
          <div class="kaisign-loading-status">
            Analyzing transaction...
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(popup);
    bindPopupClose(popup);
    attachPopupDrag(popup);
    return; // Don't continue to full popup
  }

  try {
  const transactionData = context?.transactionData
    || buildTransactionRecord(tx, method, intent, decodedResult, extractedBytecodes, context);

  if (!context?.transactionAlreadySaved) {
    saveTransactionViaAllChannels(transactionData);
  }

  // Remove old popup if exists
  const old = document.getElementById('kaisign-popup');
  if (old) old.remove();

  // Create enhanced popup using CSS classes
  const popup = document.createElement('div');
  popup.id = 'kaisign-popup';
  const theme = await getStoredTheme();
  popup.className = 'kaisign-popup theme-dark';

  // Extract chainId for name resolution
  const chainId = tx.chainId ?? context?.chainId ?? null;

  // Helper to escape HTML
  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  // Helper to safely stringify objects with BigInt/BigNumber values
  const safeStringify = (obj) => {
    try {
      return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'bigint') return value.toString();
        if (value?._isBigNumber) return value._value || value._hex;
        return value;
      });
    } catch {
      return '{}';
    }
  };

  // Helper to truncate address with name resolution and hover tooltip
  const truncateAddress = (addr) => {
    if (!addr || addr.length < 12) return addr || 'N/A';
    const truncated = `${addr.slice(0, 8)}...${addr.slice(-6)}`;
    const id = `addr-${addr.slice(2, 12)}`; // Unique ID for this address element

    // Async name resolution
    if (window.nameResolutionService && chainId) {
      window.nameResolutionService.resolveName(addr, chainId).then(name => {
        if (name) {
          // Update all instances of this address in the popup
          const elements = document.querySelectorAll(`[data-address="${addr}"]`);
          elements.forEach(el => {
            if (el.textContent === truncated) {
              el.textContent = name;
            }
          });
        }
      }).catch(err => {
        console.debug('[ContentScript] Name resolution failed:', err);
      });
    }

    return `<span class="kaisign-address" data-address="${addr}" title="${addr}">${truncated}</span>`;
  };

  // Helper to resolve addresses in intent strings
  const resolveIntentAddresses = async (intentStr) => {
    if (!intentStr || !window.nameResolutionService || !chainId) return intentStr;

    // Match full addresses (0x followed by 40 hex chars) or truncated (0x...xxx)
    const addressPattern = /(0x[a-fA-F0-9]{40})/g;

    let resolvedIntent = intentStr;

    // Find all full addresses
    const fullAddresses = intentStr.match(addressPattern) || [];
    for (const addr of fullAddresses) {
      try {
        const name = await window.nameResolutionService.resolveName(addr, chainId);
        if (name) {
          resolvedIntent = resolvedIntent.replace(addr, name);
        }
      } catch (err) {
        console.debug('[ContentScript] Failed to resolve address in intent:', addr);
      }
    }

    return resolvedIntent;
  };

  const bytecodeSection = tx.data ? `
    <div class="kaisign-section">
      <div class="kaisign-section-header">
        <span class="kaisign-section-title">${decodedResult?.unknownSummary ? 'Raw Calldata' : 'Complete Bytecode Data'}</span>
        <button class="kaisign-copy-btn" onclick="copyToClipboard('${escapeHtml(tx.data)}', this)">Copy All</button>
      </div>
      ${decodedResult?.unknownSummary ? `
        <details class="kaisign-disclosure">
          <summary>Expand full calldata</summary>
          <div class="kaisign-disclosure-body">
            <div class="kaisign-bytecode">${escapeHtml(tx.data)}</div>
            <div class="kaisign-bytecode-info">
              Length: ${tx.data.length} chars | Selector: ${tx.data.slice(0, 10)}
            </div>
          </div>
        </details>
      ` : `
        <div class="kaisign-bytecode">${escapeHtml(tx.data)}</div>
        <div class="kaisign-bytecode-info">
          Length: ${tx.data.length} chars | Selector: ${tx.data.slice(0, 10)}
        </div>
      `}
    </div>
  ` : '';

  const unknownSummarySection = decodedResult?.unknownSummary ? `
    <div class="kaisign-section">
      <div class="kaisign-section-header">
        <span class="kaisign-section-title">Compact Calldata Summary</span>
      </div>
      <ul class="kaisign-summary-list">
        ${decodedResult.unknownSummary.lines.map(line => `<li>${escapeHtml(line)}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  // Show all nested calls - NO COMPRESSION
  const extractedSection = extractedBytecodes.length > 0 ? `
    <div class="kaisign-section purple">
      <div class="kaisign-section-header">
        <span class="kaisign-section-title purple">Nested Calls (${extractedBytecodes.length} RAW)</span>
      </div>
      ${generateBytecodeTree(extractedBytecodes)}
    </div>
  ` : '';

  const actionDetailsSection = renderNestedActionDetailsSection(decodedResult, escapeHtml);

  // Only show decoding section if successful - hide failed results
  const decodingSection = decodedResult?.success ? `
    <div class="kaisign-section success">
      <div class="kaisign-section-header">
        <span class="kaisign-section-title green">Decoding Result</span>
      </div>
      <div class="kaisign-decode-result">
        <div class="kaisign-decode-success">Success</div>
        <div class="kaisign-decode-detail">Function: ${escapeHtml(decodedResult.functionName || 'Unknown')}</div>
        <div class="kaisign-decode-detail">Selector: ${escapeHtml(decodedResult.selector)}</div>
      </div>
    </div>
  ` : '';

  // EIP-5792 Batch operations section (shows each call with decoded params)
  const batchSection = decodedResult?.batchIntents && decodedResult.batchIntents.length > 0 ? `
    <div class="kaisign-section" style="border-left: 3px solid #8b5cf6;">
      <div class="kaisign-section-header">
        <span class="kaisign-section-title" style="color: #8b5cf6;">Batch Operations (${decodedResult.batchIntents.length})</span>
      </div>
      <div class="kaisign-decode-result">
        ${decodedResult.batchIntents.map((op, i) => {
          // Use formatted object which contains display values (e.g., "0.05 USDC")
          // Structure: formatted = { paramName: { label, value, rawValue, format } }
          let formattedParams = '';
          const formatted = op.decoded?.formatted;
          if (formatted && typeof formatted === 'object') {
            formattedParams = Object.entries(formatted)
              .filter(([k, v]) => v && v.value)
              .map(([k, v]) => `${v.label || k}: ${v.value}`)
              .join(', ');
          }
          return `
            <div style="margin-bottom: 10px; padding: 10px; background: rgba(139, 92, 246, 0.1); border-radius: 6px;">
              <div style="font-weight: bold; color: #a78bfa; margin-bottom: 4px;">#${op.index}: ${escapeHtml(op.intent)}</div>
              <div class="kaisign-decode-detail">Payload To: ${truncateAddress(op.to)}</div>
              ${op.decoded?.functionName ? `<div class="kaisign-decode-detail">Function: ${escapeHtml(op.decoded.functionName)}</div>` : ''}
              ${formattedParams ? `<div class="kaisign-decode-detail">${escapeHtml(formattedParams)}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  ` : '';

  // EIP-7702 Authorization List section
  const authorizationSection = tx.authorizationList && tx.authorizationList.length > 0 ? `
    <div class="kaisign-section" style="border-left: 3px solid #f59e0b;">
      <div class="kaisign-section-header">
        <span class="kaisign-section-title" style="color: #f59e0b;">EIP-7702 Authorization (${tx.authorizationList.length})</span>
      </div>
      <div class="kaisign-decode-result">
        ${tx.authorizationList.map((auth, i) => `
          <div style="margin-bottom: 8px; padding: 8px; background: rgba(245, 158, 11, 0.1); border-radius: 4px;">
            <div class="kaisign-decode-detail"><strong>Authorization #${i + 1}</strong></div>
            <div class="kaisign-decode-detail">Delegated To: ${truncateAddress(auth.address)}</div>
            <div class="kaisign-decode-detail">Chain ID: ${auth.chainId || 'Current'}</div>
            <div class="kaisign-decode-detail">Nonce: ${auth.nonce}</div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  // Detect EIP-7702 self-call pattern (from === to with authorization)
  const isSelfCall = tx.from && tx.to && tx.from.toLowerCase() === tx.to.toLowerCase();
  const isEIP7702 = tx.type === '0x04' || tx.type === 4 || (tx.authorizationList && tx.authorizationList.length > 0);

  const rawIntent = intent || 'Analyzing transaction...';
  const formattedIntent = (window.formatTitleAddresses || ((s) => s))(rawIntent);
  const contractName = decodedResult?.metadata?.context?.contract?.name || decodedResult?.contractName || '';
  const hasPayloadValue = (() => {
    try {
      return BigInt(tx.value || '0x0') !== 0n;
    } catch {
      return false;
    }
  })();
  const titleAlreadyCarriesMeaningfulValue = /\b\d[\d,]*(?:\.\d+)?\s+[A-Z][A-Z0-9.-]*\b/.test(rawIntent);
  const detailItems = [];
  if (hasPayloadValue && !titleAlreadyCarriesMeaningfulValue) {
    detailItems.push(`
      <div class="kaisign-detail-item">
        <span class="kaisign-detail-label">Payload Value: </span>
        <span class="kaisign-detail-value">${escapeHtml(formatEther(tx.value || '0x0'))} ETH</span>
      </div>
    `);
  }
  const payloadDetailsSection = detailItems.length > 0
    ? `<div class="kaisign-details-grid">${detailItems.join('')}</div>`
    : '';

  popup.innerHTML = `
    <div class="kaisign-warning">
      DEMONSTRATION VERSION - USE AT YOUR OWN RISK
    </div>

    <div class="kaisign-popup-header">
      <div class="kaisign-popup-logo">
        <span class="kaisign-popup-logo-icon">KS</span>
        <div>
          <div class="kaisign-popup-title">KaiSign Analysis <span id="kaisign-verification-badge" class="kaisign-verification-badge" title="Checking on-chain verification..." style="display:inline-block;font-size:12px;padding:1px 6px;border-radius:8px;margin-left:6px;background:rgba(156,163,175,0.2);color:#9ca3af;">...</span></div>
          <div class="kaisign-popup-subtitle">${escapeHtml(walletName)} | ${escapeHtml(method)}</div>
        </div>
      </div>
      <button class="kaisign-close-btn" onclick="this.closest('.kaisign-popup').remove()">✕</button>
    </div>

    <div class="kaisign-intent-section">
      ${decodedResult?.wrapperIntent && decodedResult.wrapperIntent !== intent ? `
        <div class="kaisign-wrapper-context">via ${escapeHtml(decodedResult.wrapperIntent)}</div>
      ` : ''}
      ${isEIP7702 ? `
        <div class="kaisign-wrapper-context" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b;">EIP-7702 Delegated Transaction${isSelfCall ? ' (Self-call)' : ''}</div>
      ` : ''}
      <div id="kaisign-intent-text" class="kaisign-intent" title="${escapeHtml(rawIntent)}">${escapeHtml(formattedIntent)}</div>
      ${payloadDetailsSection}
    </div>

    <div class="kaisign-popup-content">
      ${batchSection}
      ${authorizationSection}
      ${actionDetailsSection}
      ${unknownSummarySection}
      ${bytecodeSection}
      ${extractedSection}
      ${decodingSection}
    </div>

    <div class="kaisign-action-bar">
      <button class="kaisign-btn kaisign-btn-primary" onclick="showTransactionHistory()">History</button>
      <button class="kaisign-btn kaisign-btn-secondary" onclick="exportTransactionData('${escapeHtml(tx.data)}', ${JSON.stringify(safeStringify({decodedResult, extractedBytecodes}))})">Export</button>
    </div>
  `;

  document.body.appendChild(popup);
  bindPopupClose(popup);
  attachPopupDrag(popup);

  if (/0x[a-fA-F0-9]{40}\b/.test(rawIntent) && window.nameResolutionService && chainId) {
    resolveIntentAddresses(rawIntent).then((resolvedIntent) => {
      if (!resolvedIntent || resolvedIntent === rawIntent) return;
      const intentEl = document.getElementById('kaisign-intent-text');
      if (!intentEl) return;
      intentEl.title = resolvedIntent;
      intentEl.textContent = (window.formatTitleAddresses || ((s) => s))(resolvedIntent);
    }).catch((err) => {
      console.debug('[ContentScript] Failed to resolve intent addresses:', err);
    });
  }

  // Update verification badge asynchronously
  if (decodedResult?._verification || (typeof window !== 'undefined' && window.onChainVerifier)) {
    const updateVerificationBadge = (verification) => {
      const badge = document.getElementById('kaisign-verification-badge');
      if (!badge) return;

      if (!verification) {
        badge.textContent = 'Unverified';
        badge.title = 'No on-chain verification available';
        badge.style.background = 'rgba(156,163,175,0.2)';
        badge.style.color = '#9ca3af';
        return;
      }

      if (verification.verified) {
        badge.textContent = 'Verified';
        badge.title = 'Metadata verified against on-chain registry';
        badge.style.background = 'rgba(34,197,94,0.2)';
        badge.style.color = '#22c55e';
      } else if (verification.source === 'mismatch') {
        badge.textContent = 'Mismatch';
        badge.title = verification.details || 'Metadata hash does not match on-chain record';
        badge.style.background = 'rgba(239,68,68,0.2)';
        badge.style.color = '#ef4444';
      } else {
        badge.textContent = 'Unverified';
        badge.title = verification.details || 'No on-chain attestation found';
        badge.style.background = 'rgba(156,163,175,0.2)';
        badge.style.color = '#9ca3af';
      }
    };

    // Check if verification is already available on metadata
    const metadata = decodedResult?.metadata;
    if (metadata?._verification) {
      updateVerificationBadge(metadata._verification);
    } else {
      // Poll for verification result (it runs async)
      let pollCount = 0;
      const pollInterval = setInterval(() => {
        pollCount++;
        if (metadata?._verification) {
          updateVerificationBadge(metadata._verification);
          clearInterval(pollInterval);
        } else if (pollCount > 40) {
          // After 20 seconds, show as unverified
          updateVerificationBadge(null);
          clearInterval(pollInterval);
        }
      }, 500);
    }
  }

  // Auto-remove after 30 seconds
  setTimeout(() => {
    if (popup.parentNode) popup.remove();
  }, 30000);

  } catch (err) {
    console.error('[KaiSign] Popup render error:', err);
    // Fallback: show minimal popup with intent and basic tx info
    popup.innerHTML = `
      <div class="kaisign-popup-header">
        <div class="kaisign-popup-logo">
          <span class="kaisign-popup-logo-icon">KS</span>
          <div>
            <div class="kaisign-popup-title">KaiSign Analysis</div>
            <div class="kaisign-popup-subtitle">${escapeHtml(walletName)} | ${escapeHtml(method)}</div>
          </div>
        </div>
        <button class="kaisign-close-btn" onclick="this.closest('.kaisign-popup').remove()">&#x2715;</button>
      </div>
      <div class="kaisign-intent-section">
        <div class="kaisign-intent" title="${escapeHtml(intent || 'Unknown transaction')}">${escapeHtml((window.formatTitleAddresses || ((s) => s))(intent || 'Unknown transaction'))}</div>
        ${payloadDetailsSection || `
          <div class="kaisign-details-grid">
            <div class="kaisign-detail-item">
              <span class="kaisign-detail-label">Payload To: </span>
              <span class="kaisign-detail-value">${tx.to ? tx.to.slice(0, 8) + '...' + tx.to.slice(-6) : 'N/A'}</span>
            </div>
            ${hasPayloadValue ? `
              <div class="kaisign-detail-item">
                <span class="kaisign-detail-label">Payload Value: </span>
                <span class="kaisign-detail-value">${escapeHtml(formatEther(tx.value || '0x0'))} ETH</span>
              </div>
            ` : ''}
          </div>
        `}
      </div>
    `;
    document.body.appendChild(popup);
    bindPopupClose(popup);
    attachPopupDrag(popup);
    setTimeout(() => { if (popup.parentNode) popup.remove(); }, 30000);
  }
}

// Generic bytecode parser - scans for any potential nested bytecodes
async function parseGenericNestedBytecode(data) {
  const extractedCalls = [];
  
  try {
    
    // Remove function selector
    const payload = data.slice(10);
    const selector = data.slice(0, 10);
    
    // Add the main transaction as first call
    extractedCalls.push({
      bytecode: data,
      selector: selector,
      depth: 1,
      index: 0,
      target: 'Main Transaction',
      functionName: 'Transaction Root',
      type: 'root_call'
    });
    
    // Scan for potential function selectors in the payload
    // Function selectors are 4-byte patterns that appear at data boundaries
    const potentialSelectors = [];
    
    // Look for 4-byte patterns that could be function selectors
    for (let i = 0; i < payload.length - 8; i += 2) {
      const candidate = '0x' + payload.slice(i, i + 8);
      
      // Check if this looks like a function selector (not all zeros, reasonable hex)
      if (candidate !== '0x00000000' && candidate.match(/^0x[0-9a-fA-F]{8}$/)) {
        // Check if there's enough data after this to be a valid call
        const remainingData = payload.slice(i);
        if (remainingData.length >= 8) { // At least selector + some data
          potentialSelectors.push({
            position: i,
            selector: candidate,
            remainingData: '0x' + remainingData
          });
        }
      }
    }
    
    
    // Add potential nested calls (limit to avoid spam)
    let callIndex = 1;
    for (const potential of potentialSelectors.slice(0, 10)) {
      // Try to extract meaningful bytecode chunks
      let bytecodeLength = Math.min(potential.remainingData.length, 200); // Reasonable chunk size
      
      // Try to find natural boundaries (look for next potential selector)
      for (let j = 8; j < potential.remainingData.length - 8; j += 2) {
        const nextCandidate = potential.remainingData.slice(j, j + 8);
        if (nextCandidate.match(/^[0-9a-fA-F]{8}$/) && nextCandidate !== '00000000') {
          bytecodeLength = Math.min(j, 200);
          break;
        }
      }
      
      const extractedBytecode = potential.remainingData.slice(0, bytecodeLength);
      
      if (extractedBytecode.length >= 10) {
        extractedCalls.push({
          bytecode: extractedBytecode,
          selector: potential.selector,
          depth: 2,
          index: callIndex++,
          target: 'Detected Target',
          functionName: `Nested Call ${callIndex}`,
          type: 'detected_nested',
          position: potential.position
        });
      }
    }
    
  } catch (error) {
  }
  
  return extractedCalls;
}


// Helper function to generate bytecode tree structure
window.generateBytecodeTree = function(bytecodes) {
  if (!bytecodes || bytecodes.length === 0) return '';

  // LOG ALL ENTRIES TO DEBUG DUPLICATES
  console.log('[KaiSign] generateBytecodeTree received', bytecodes.length, 'entries:');
  bytecodes.forEach((bc, i) => {
    console.log(`  [${i}] selector=${bc.selector} target=${bc.target} fn=${bc.functionName} depth=${bc.depth}`);
  });

  function getDepthColor(depth) {
    const colors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4'];
    return colors[(depth - 1) % colors.length];
  }

  return `
    <div style="background: #1a1a2e; padding: 10px; border-radius: 6px; margin: 8px 0;">
      <div style="color: #68d391; font-size: 10px; margin-bottom: 6px; font-weight: bold;">
        📊 Call Stack (${bytecodes.length} operation${bytecodes.length > 1 ? 's' : ''})
      </div>
      ${bytecodes.map((bc, i) => {
        const depth = bc.depth || 1;
        const color = getDepthColor(depth);
        const indent = '  '.repeat(Math.max(0, depth - 1));
        const connector = depth > 1 ? '└─ ' : '';

        return `
          <div style="margin: 3px 0; padding: 4px 8px; background: #0d0d1a; border-radius: 3px; border-left: 3px solid ${color};">
            <div style="font-family: monospace; font-size: 10px;">
              <span style="color: #666;">${indent}${connector}</span>
              <span style="color: ${color}; font-weight: bold;">${bc.functionName || bc.selector || 'call'}</span>
              ${bc.target ? `<span style="color: #666;"> → ${bc.target.slice(0, 8)}...${bc.target.slice(-6)}</span>` : ''}
            </div>
            ${bc.intent ? `<div style="margin-left: ${depth * 12}px; font-size: 9px; color: #ffd700;">📋 ${bc.intent}</div>` : ''}
            ${bc.formattedParams ? `<div style="margin-left: ${depth * 12}px; font-size: 9px; color: #68d391;">💰 ${bc.formattedParams}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
};

// Helper functions for enhanced popup
window.copyToClipboard = function(text, button) {
  const showCopied = () => {
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    button.classList.add('copied');
    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('copied');
    }, 2000);
  };

  navigator.clipboard.writeText(text).then(showCopied).catch(err => {
    console.error('[KaiSign] Copy failed:', err);
    // Fallback: create temporary textarea
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showCopied();
  });
};

window.showTransactionHistory = function() {
  // Get transactions from chrome.storage via background.js
  chrome.runtime.sendMessage({ type: 'GET_TRANSACTIONS' }, (response) => {
    const transactions = response?.transactions || [];

    // Remove existing modal
    const existing = document.getElementById('kaisign-history');
    if (existing) existing.remove();

    const historyPopup = document.createElement('div');
    historyPopup.id = 'kaisign-history';
    historyPopup.className = 'kaisign-modal';

    // Helper to escape HTML
    const escapeHtml = (str) => {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    // Helper to truncate address with name resolution and hover tooltip
    const truncateAddress = (addr, chainId = 1) => {
      if (!addr || addr.length < 20) return addr || 'N/A';
      const truncated = `${addr.slice(0, 10)}...${addr.slice(-8)}`;

      // Async name resolution
      if (window.nameResolutionService && chainId) {
        window.nameResolutionService.resolveName(addr, chainId).then(name => {
          if (name) {
            // Update all instances of this address in the history popup
            const elements = document.querySelectorAll(`[data-address="${addr}"]`);
            elements.forEach(el => {
              if (el.textContent === truncated) {
                el.textContent = name;
              }
            });
          }
        }).catch(err => {
          KAISIGN_DEBUG && console.debug('[ContentScript] Name resolution failed:', err);
        });
      }

      return `<span class="kaisign-address" data-address="${addr}" title="${addr}">${truncated}</span>`;
    };

    historyPopup.innerHTML = `
      <div class="kaisign-modal-header">
        <h2 class="kaisign-modal-title">Transaction History (${transactions.length})</h2>
        <div class="kaisign-modal-actions">
          <button class="kaisign-close-btn" onclick="this.closest('.kaisign-modal').remove()">✕</button>
        </div>
      </div>

      <div class="kaisign-modal-content">
        ${transactions.length === 0 ?
          '<div class="kaisign-empty">No transactions recorded yet</div>' :
          transactions.map((tx, i) => `
            <div class="kaisign-history-item">
              <div class="kaisign-history-header">
                <span class="kaisign-history-intent">#${i + 1} ${escapeHtml(tx.intent || 'Unknown')}</span>
                <span class="kaisign-history-time">${tx.time ? new Date(tx.time).toLocaleString() : 'N/A'}</span>
              </div>
              <div class="kaisign-history-details">
                <div class="kaisign-history-detail"><strong>Method:</strong> ${escapeHtml(tx.method || 'N/A')}</div>
                <div class="kaisign-history-detail"><strong>To:</strong> ${truncateAddress(tx.to, tx.chainId)}</div>
              </div>
              ${tx.data ? `
                <div class="kaisign-history-data">
                  <div class="kaisign-history-data-header">
                    <span class="kaisign-history-data-label">Bytecode Data:</span>
                    <button class="kaisign-copy-btn" onclick="copyToClipboard('${escapeHtml(tx.data)}', this)">Copy</button>
                  </div>
                  <div class="kaisign-history-data-value">${escapeHtml(tx.data)}</div>
                </div>
              ` : ''}
            </div>
          `).join('')
        }
      </div>

      <div class="kaisign-modal-footer">
        <button class="kaisign-btn kaisign-btn-secondary" onclick="chrome.runtime.sendMessage({ type: 'CLEAR_TRANSACTIONS' }, () => { this.closest('.kaisign-modal').remove(); alert('Transaction history cleared!'); });">Clear History</button>
      </div>
    `;

    document.body.appendChild(historyPopup);
  });
};

/**
 * Show comprehensive RPC activity dashboard
 */
window.showRpcDashboard = function() {
  // Remove existing dashboard
  const existing = document.getElementById('kaisign-rpc-dashboard');
  if (existing) existing.remove();

  const dashboard = document.createElement('div');
  dashboard.id = 'kaisign-rpc-dashboard';
  dashboard.className = 'kaisign-dashboard';
  
  // Generate dashboard content
  const methodsCount = Object.keys(rpcActivity.methods).length;
  const totalCalls = Object.values(rpcActivity.methods).reduce((sum, method) => sum + method.count, 0);
  const recentActivity = rpcActivity.timeline.slice(0, 10);
  
  // Category statistics
  const categoryStats = {};
  for (const [method, data] of Object.entries(rpcActivity.methods)) {
    const category = data.category;
    if (!categoryStats[category]) {
      categoryStats[category] = { count: 0, methods: [] };
    }
    categoryStats[category].count += data.count;
    categoryStats[category].methods.push(method);
  }
  
  // Security analysis
  const securityConcerns = [
    ...rpcActivity.security.privacyConcerns,
    ...rpcActivity.security.mevIndicators,
    ...rpcActivity.security.suspiciousActivity
  ];
  
  // Typed data signatures analysis (EIP-712)
  const typedDataSignatures = rpcActivity.patterns.typedDataSignatures || rpcActivity.patterns.safeSignatures || [];
  const batchCoordination = rpcActivity.patterns.batchCoordination || rpcActivity.patterns.multisigCoordination || {};
  
  dashboard.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #4a5568; padding-bottom: 15px;">
      <h1 style="margin: 0; color: #63b3ed; font-size: 18px;">📊 KaiSign RPC Activity Dashboard</h1>
      <button onclick="this.parentElement.parentElement.remove()" style="
        background: #e53e3e;
        color: white;
        border: none;
        padding: 10px 15px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
      ">✕ Close</button>
    </div>
    
    <!-- Summary Statistics -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px;">
      <div style="background: #2d3748; padding: 15px; border-radius: 8px; border-left: 4px solid #68d391;">
        <div style="color: #68d391; font-size: 24px; font-weight: bold;">${totalCalls}</div>
        <div style="color: #a0aec0; font-size: 12px;">Total RPC Calls</div>
      </div>
      <div style="background: #2d3748; padding: 15px; border-radius: 8px; border-left: 4px solid #3182ce;">
        <div style="color: #3182ce; font-size: 24px; font-weight: bold;">${methodsCount}</div>
        <div style="color: #a0aec0; font-size: 12px;">Unique Methods</div>
      </div>
      <div style="background: #2d3748; padding: 15px; border-radius: 8px; border-left: 4px solid #f093fb;">
        <div style="color: #f093fb; font-size: 24px; font-weight: bold;">${typedDataSignatures.length}</div>
        <div style="color: #a0aec0; font-size: 12px;">EIP-712 Signatures</div>
      </div>
      <div style="background: #2d3748; padding: 15px; border-radius: 8px; border-left: 4px solid ${securityConcerns.length > 0 ? '#ff6b6b' : '#68d391'};">
        <div style="color: ${securityConcerns.length > 0 ? '#ff6b6b' : '#68d391'}; font-size: 24px; font-weight: bold;">${securityConcerns.length}</div>
        <div style="color: #a0aec0; font-size: 12px;">Security Alerts</div>
      </div>
    </div>
    
    <!-- Category Breakdown -->
    <div style="margin-bottom: 25px;">
      <h3 style="color: #ffd700; margin-bottom: 15px;">📂 Method Categories</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
        ${Object.entries(categoryStats).map(([category, stats]) => `
          <div style="background: #2d3748; padding: 12px; border-radius: 8px;">
            <div style="color: #63b3ed; font-weight: bold; margin-bottom: 8px;">
              ${category.toUpperCase()} (${stats.count} calls)
            </div>
            <div style="font-size: 10px; color: #a0aec0;">
              ${stats.methods.slice(0, 3).join(', ')}${stats.methods.length > 3 ? ` +${stats.methods.length - 3} more` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    
    <!-- Security Analysis -->
    ${securityConcerns.length > 0 ? `
      <div style="margin-bottom: 25px;">
        <h3 style="color: #ff6b6b; margin-bottom: 15px;">⚠️ Security Analysis</h3>
        <div style="background: #2d3748; padding: 15px; border-radius: 8px; border-left: 4px solid #ff6b6b;">
          ${securityConcerns.map((concern, i) => `
            <div style="margin-bottom: 10px; padding: 8px; background: #1a202c; border-radius: 6px;">
              <div style="color: #ff6b6b; font-weight: bold; margin-bottom: 4px;">
                ${concern.type.replace(/_/g, ' ').toUpperCase()}
              </div>
              <div style="font-size: 10px; color: #a0aec0;">
                Count: ${concern.count} | Pattern: ${concern.pattern || 'N/A'} | 
                Time: ${new Date(concern.timestamp).toLocaleTimeString()}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    
    <!-- Batch Coordination Activity -->
    ${Object.keys(batchCoordination).length > 0 ? `
      <div style="margin-bottom: 25px;">
        <h3 style="color: #f093fb; margin-bottom: 15px;">🔐 Batch Coordination</h3>
        <div style="background: #2d3748; padding: 15px; border-radius: 8px;">
          ${Object.entries(batchCoordination).map(([contractAddress, coordination]) => `
            <div style="margin-bottom: 15px; padding: 10px; background: #1a202c; border-radius: 6px;">
              <div style="color: #f093fb; font-weight: bold; margin-bottom: 6px;">
                Contract: ${formatAddressShort(contractAddress)}
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; font-size: 10px;">
                <div><strong>Signers:</strong> ${coordination.signers.size}</div>
                <div><strong>Recent Sigs:</strong> ${coordination.signatures.length}</div>
                <div><strong>Last Activity:</strong> ${new Date(coordination.lastActivity).toLocaleTimeString()}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    
    <!-- Recent Activity Timeline -->
    <div style="margin-bottom: 25px;">
      <h3 style="color: #68d391; margin-bottom: 15px;">⏱️ Recent Activity Timeline</h3>
      <div style="background: #2d3748; padding: 15px; border-radius: 8px; max-height: 300px; overflow-y: auto;">
        ${recentActivity.length > 0 ? recentActivity.map((activity, i) => `
          <div style="margin-bottom: 12px; padding: 10px; background: #1a202c; border-radius: 6px; border-left: 3px solid #68d391;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="color: #68d391; font-weight: bold;">${activity.method}</span>
              <span style="color: #a0aec0; font-size: 10px;">${new Date(activity.timestamp).toLocaleTimeString()}</span>
            </div>
            <div style="font-size: 10px; color: #a0aec0;">
              Category: ${activity.category} | Wallet: ${activity.walletName}
              ${activity.params && activity.params.length > 0 ? `<br>Params: ${JSON.stringify(activity.params).slice(0, 100)}...` : ''}
            </div>
          </div>
        `).join('') : '<div style="color: #a0aec0; text-align: center; padding: 20px;">No recent activity</div>'}
      </div>
    </div>
    
    <!-- Method Frequency Table -->
    <div style="margin-bottom: 25px;">
      <h3 style="color: #3182ce; margin-bottom: 15px;">📈 Method Frequency</h3>
      <div style="background: #2d3748; border-radius: 8px; overflow: hidden;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead style="background: #4a5568;">
            <tr>
              <th style="padding: 10px; text-align: left; color: #fff;">Method</th>
              <th style="padding: 10px; text-align: left; color: #fff;">Category</th>
              <th style="padding: 10px; text-align: center; color: #fff;">Count</th>
              <th style="padding: 10px; text-align: left; color: #fff;">Last Called</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(rpcActivity.methods)
              .sort(([,a], [,b]) => b.count - a.count)
              .slice(0, 20)
              .map(([method, data]) => `
                <tr style="border-bottom: 1px solid #4a5568;">
                  <td style="padding: 8px; color: #63b3ed;">${method}</td>
                  <td style="padding: 8px; color: #a0aec0;">${data.category}</td>
                  <td style="padding: 8px; text-align: center; color: #68d391; font-weight: bold;">${data.count}</td>
                  <td style="padding: 8px; color: #a0aec0; font-size: 10px;">
                    ${data.lastCalled ? new Date(data.lastCalled).toLocaleString() : 'N/A'}
                  </td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    
    <!-- Action Buttons -->
    <div style="text-align: center; padding-top: 20px; border-top: 1px solid #4a5568;">
      <button onclick="exportRpcActivity()" style="
        background: #38a169;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
        margin-right: 10px;
      ">💾 Export RPC Data</button>
      <button onclick="clearRpcActivity()" style="
        background: #e53e3e;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
      ">🗑️ Clear RPC Data</button>
    </div>
  `;
  
  document.body.appendChild(dashboard);
};

/**
 * Export RPC activity data
 */
window.exportRpcActivity = function() {
  try {
    const exportData = {
      timestamp: new Date().toISOString(),
      summary: {
        totalMethods: Object.keys(rpcActivity.methods).length,
        totalCalls: Object.values(rpcActivity.methods).reduce((sum, method) => sum + method.count, 0)
      },
      methods: rpcActivity.methods,
      timeline: rpcActivity.timeline,
      patterns: rpcActivity.patterns,
      security: rpcActivity.security
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kaisign-rpc-activity-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    alert('✅ RPC activity data exported successfully!');
  } catch (error) {
    console.error('[KaiSign] RPC export failed:', error);
    alert('❌ Export failed: ' + error.message);
  }
};

/**
 * Clear RPC activity data
 */
window.clearRpcActivity = function() {
  if (confirm('Are you sure you want to clear all RPC activity data?')) {
    // Reset all RPC activity
    rpcActivity.methods = {};
    rpcActivity.timeline = [];
    rpcActivity.patterns = {};
    rpcActivity.security = {
      suspiciousActivity: [],
      privacyConcerns: [],
      mevIndicators: []
    };
    
    // Close dashboard
    const dashboard = document.getElementById('kaisign-rpc-dashboard');
    if (dashboard) dashboard.remove();
    
    alert('✅ RPC activity data cleared!');
  }
};

window.exportTransactionData = function(calldata, analyzedData) {
  try {
    const safeStringify = (value) => JSON.stringify(value, (key, val) => {
      if (typeof val === 'bigint') return val.toString();
      return val;
    }, 2);

    let parsedAnalyzed;
    try {
      parsedAnalyzed = JSON.parse(analyzedData);
    } catch {
      parsedAnalyzed = analyzedData;
    }

    const data = {
      timestamp: new Date().toISOString(),
      calldata: calldata,
      analyzedData: parsedAnalyzed
    };
    
    const blob = new Blob([safeStringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kaisign-transaction-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    alert('✅ Transaction data exported successfully!');
  } catch (error) {
    console.error('[KaiSign] Export failed:', error);
    alert('❌ Export failed: ' + error.message);
  }
};

// Expose functions globally for testing
window.parseProtocolTransaction = parseProtocolTransaction;  // Generic protocol parser
window.getIntentAndShow = getIntentAndShow;

// Expose RPC monitoring functions globally
window.kaisignRpc = {
  activity: rpcActivity,
  methods: ETHEREUM_RPC_METHODS,
  showDashboard: () => window.showRpcDashboard(),
  export: () => window.exportRpcActivity(),
  clear: () => window.clearRpcActivity()
};

// CRITICAL: Install property traps IMMEDIATELY at document_start
// This catches wallet injection the instant it happens - no 500ms delay
setupEagerPropertyTraps();

function startKaiSign() {
  waitForWallets();
  startWalletConnectPolling();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startKaiSign);
} else {
  startKaiSign();
}

} // End of duplicate-load guard
