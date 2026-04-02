// ═══════════════════════════════════════════════════════════════
// PriceWatch Pro — Options Script
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  bindToggleGroups();
  bindEvents();
});

async function loadSettings() {
  const { settings = {} } = await chrome.storage.local.get('settings');

  el('check-interval').value = settings.checkIntervalHours || 6;
  el('drop-threshold').value = settings.dropThresholdPercent ?? 0;

  el('emailjs-enabled').checked = !!settings.emailjsEnabled;
  el('emailjs-service-id').value = settings.emailjsServiceId || '';
  el('emailjs-template-id').value = settings.emailjsTemplateId || '';
  el('emailjs-public-key').value = settings.emailjsPublicKey || '';
  el('recipient-email').value = settings.recipientEmail || '';

  el('sheets-enabled').checked = !!settings.sheetsEnabled;
  el('sheets-id').value = settings.sheetsId || '';
  el('sheets-name').value = settings.sheetsName || 'PriceHistory';

  updateFieldsGroup('emailjs-enabled', 'emailjs-fields');
  updateFieldsGroup('sheets-enabled', 'sheets-fields');
}

function bindToggleGroups() {
  el('emailjs-enabled').addEventListener('change', () => {
    updateFieldsGroup('emailjs-enabled', 'emailjs-fields');
  });
  el('sheets-enabled').addEventListener('change', () => {
    updateFieldsGroup('sheets-enabled', 'sheets-fields');
  });
}

function updateFieldsGroup(toggleId, groupId) {
  const enabled = el(toggleId).checked;
  el(groupId).classList.toggle('disabled', !enabled);
}

function bindEvents() {
  el('btn-save').addEventListener('click', saveSettings);

  el('btn-auth-sheets').addEventListener('click', async () => {
    el('auth-status').textContent = 'Authorizing…';
    el('auth-status').style.color = 'var(--text-dim)';
    const res = await chrome.runtime.sendMessage({ action: 'AUTH_SHEETS' });
    if (res?.success) {
      el('auth-status').textContent = '✓ Google account authorized';
      el('auth-status').style.color = 'var(--green)';
    } else {
      el('auth-status').textContent = '✗ Authorization failed: ' + (res?.error || 'Unknown error');
      el('auth-status').style.color = 'var(--red)';
    }
  });

  el('btn-export').addEventListener('click', exportData);
  el('btn-clear-all').addEventListener('click', clearAll);
}

async function saveSettings() {
  const settings = {
    checkIntervalHours: parseInt(el('check-interval').value) || 6,
    dropThresholdPercent: parseInt(el('drop-threshold').value) || 0,

    emailjsEnabled: el('emailjs-enabled').checked,
    emailjsServiceId: el('emailjs-service-id').value.trim(),
    emailjsTemplateId: el('emailjs-template-id').value.trim(),
    emailjsPublicKey: el('emailjs-public-key').value.trim(),
    recipientEmail: el('recipient-email').value.trim(),

    sheetsEnabled: el('sheets-enabled').checked,
    sheetsId: el('sheets-id').value.trim(),
    sheetsName: el('sheets-name').value.trim() || 'PriceHistory'
  };

  try {
    await chrome.storage.local.set({ settings });
    await chrome.runtime.sendMessage({ action: 'SETTINGS_UPDATED' });
    showStatus('✓ Settings saved', 'success');
  } catch (err) {
    showStatus('✗ Failed to save: ' + err.message, 'error');
  }
}

async function exportData() {
  const { trackedItems = {} } = await chrome.storage.local.get('trackedItems');
  const json = JSON.stringify(trackedItems, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pricewatch-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function clearAll() {
  if (!confirm('Clear ALL tracked items? This cannot be undone.')) return;
  await chrome.storage.local.set({ trackedItems: {} });
  await chrome.action.setBadgeText({ text: '' });
  showStatus('All items cleared', 'success');
}

function showStatus(text, type) {
  const s = el('save-status');
  s.textContent = text;
  s.className = `save-status ${type}`;
  setTimeout(() => { s.textContent = ''; s.className = 'save-status'; }, 3000);
}

function el(id) { return document.getElementById(id); }
