// ═══════════════════════════════════════════════════════════════
// PriceWatch Pro — Popup Script
// ═══════════════════════════════════════════════════════════════

let currentPageData = null;
let trackedItems = {};

// ── Init ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadItems();
  await checkCurrentPage();
  bindEvents();
});

// ── Load & render tracked items ─────────────────────────────────
async function loadItems() {
  const res = await msg({ action: 'GET_ITEMS' });
  trackedItems = res?.items || {};
  renderItems();
  renderStats();
}

function renderStats() {
  const items = Object.values(trackedItems);
  const dropCount = items.filter(i => i.previousPrice && i.currentPrice < i.previousPrice).length;
  const totalSaved = items.reduce((acc, i) => {
    if (i.previousPrice && i.currentPrice < i.previousPrice) {
      return acc + (i.previousPrice - i.currentPrice);
    }
    return acc;
  }, 0);

  el('stat-count').textContent = items.length;
  el('stat-drops').textContent = dropCount;
  el('stat-saved').textContent = '₹' + fmt(totalSaved);

  if (items.length > 0) show('stats-bar');
  else hide('stats-bar');
}

function renderItems() {
  const container = el('items-container');
  const items = Object.values(trackedItems).sort((a, b) => b.addedAt - a.addedAt);

  if (items.length === 0) {
    container.innerHTML = '';
    show('empty-state');
    return;
  }

  hide('empty-state');
  container.innerHTML = items.map(item => buildItemCard(item)).join('');

  // Draw sparklines
  items.forEach(item => {
    const canvas = document.getElementById(`spark-${item.id}`);
    if (canvas && item.priceHistory?.length > 1) drawSparkline(canvas, item.priceHistory);
  });

  // Bind remove buttons
  container.querySelectorAll('.item-remove').forEach(btn => {
    btn.addEventListener('click', () => removeItem(btn.dataset.id));
  });

  // Bind name clicks (open URL)
  container.querySelectorAll('.item-name').forEach(el => {
    el.addEventListener('click', () => {
      const url = el.dataset.url;
      if (url) chrome.tabs.create({ url });
    });
  });
}

function buildItemCard(item) {
  const hasDrop = item.previousPrice && item.currentPrice < item.previousPrice;
  const hasRise = item.previousPrice && item.currentPrice > item.previousPrice;
  const pctChange = item.previousPrice
    ? Math.round(((item.currentPrice - item.previousPrice) / item.previousPrice) * 100)
    : null;

  const cardClass = `item-card ${hasDrop ? 'price-drop' : hasRise ? 'price-rise' : ''}`;

  const badge = pctChange !== null && pctChange !== 0
    ? `<span class="item-badge ${pctChange < 0 ? 'badge-drop' : 'badge-rise'}">
        ${pctChange < 0 ? '↓' : '↑'} ${Math.abs(pctChange)}%
       </span>`
    : '';

  const errorLine = item.lastError
    ? `<div class="item-error">⚠ ${item.lastError}</div>`
    : '';

  const lowestNote = item.lowestEver && item.currentPrice === item.lowestEver
    ? `<span class="meta-chip" style="color:var(--green)">★ Lowest ever</span>`
    : item.lowestEver
      ? `<span class="meta-chip">Lowest <span>₹${fmt(item.lowestEver)}</span></span>`
      : '';

  const lastChecked = item.lastChecked
    ? `<span class="meta-chip">Checked <span>${timeAgo(item.lastChecked)}</span></span>`
    : '';

  return `
    <div class="${cardClass}" id="card-${item.id}">
      <div class="item-row1">
        <div class="item-name" data-url="${item.url}" title="${escHtml(item.name)}">${escHtml(truncate(item.name, 75))}</div>
        <button class="item-remove" data-id="${item.id}" title="Remove">×</button>
      </div>
      <div class="item-row2">
        <div class="item-price">${item.currentPrice ? '₹' + fmt(item.currentPrice) : '—'}</div>
        ${badge}
        <span class="item-site-tag">${item.siteName || ''}</span>
        ${item.priceHistory?.length > 1
          ? `<div class="sparkline-wrap"><canvas id="spark-${item.id}" width="60" height="22"></canvas></div>`
          : ''}
      </div>
      <div class="item-meta">
        ${lowestNote}
        ${lastChecked}
      </div>
      ${errorLine}
    </div>`;
}

function drawSparkline(canvas, history) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const prices = history.map(p => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  ctx.clearRect(0, 0, w, h);

  // Line
  const points = prices.map((p, i) => ({
    x: (i / (prices.length - 1)) * w,
    y: h - ((p - min) / range) * (h - 4) - 2
  }));

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);

  const lastPrice = prices[prices.length - 1];
  const prevPrice = prices[prices.length - 2];
  ctx.strokeStyle = lastPrice <= prevPrice ? '#10b981' : '#f43f5e';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Fill
  ctx.lineTo(points[points.length - 1].x, h);
  ctx.lineTo(points[0].x, h);
  ctx.closePath();
  ctx.fillStyle = lastPrice <= prevPrice ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.1)';
  ctx.fill();

  // Last dot
  const last = points[points.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = lastPrice <= prevPrice ? '#10b981' : '#f43f5e';
  ctx.fill();
}

// ── Check current page for product ─────────────────────────────
async function checkCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith('http')) {
      show('not-product');
      return;
    }

    const res = await chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_PRODUCT' })
      .catch(() => null);

    if (!res || !res.isProduct) {
      show('not-product');
      return;
    }

    currentPageData = res;

    // Check if already tracked
    const alreadyTracked = Object.values(trackedItems).some(i => i.url === res.url);
    if (alreadyTracked) {
      show('already-tracking');
      return;
    }

    el('page-product-name').textContent = truncate(res.name, 55);
    el('page-product-price').textContent = res.price ? '₹' + fmt(res.price) : 'Price not found';
    show('track-banner');
  } catch (err) {
    show('not-product');
  }
}

// ── Track current page ──────────────────────────────────────────
async function trackCurrentPage() {
  if (!currentPageData) return;
  showLoading(true);

  try {
    const res = await msg({
      action: 'ADD_ITEM',
      item: {
        name: currentPageData.name,
        url: currentPageData.url,
        price: currentPageData.price
      }
    });

    if (res?.success) {
      hide('track-banner');
      show('already-tracking');
      showToast('Tracking started!', 'success');
      await loadItems();
    }
  } finally {
    showLoading(false);
  }
}

// ── Remove item ─────────────────────────────────────────────────
async function removeItem(id) {
  const card = document.getElementById(`card-${id}`);
  if (card) {
    card.style.transition = 'opacity 0.15s, transform 0.15s';
    card.style.opacity = '0';
    card.style.transform = 'translateX(8px)';
    await sleep(150);
  }

  await msg({ action: 'REMOVE_ITEM', id });
  await loadItems();
  showToast('Removed', '');
}

// ── Bind events ─────────────────────────────────────────────────
function bindEvents() {
  el('btn-track-page')?.addEventListener('click', trackCurrentPage);
  el('btn-settings')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  el('btn-check-now')?.addEventListener('click', async () => {
    const btn = el('btn-check-now');
    btn.classList.add('spinning');
    showToast('Checking prices…');
    await msg({ action: 'CHECK_NOW' });
    await loadItems();
    btn.classList.remove('spinning');
    showToast('Prices updated!', 'success');
  });
}

// ── Helpers ─────────────────────────────────────────────────────
function msg(payload) {
  return chrome.runtime.sendMessage(payload).catch(() => null);
}

function el(id) { return document.getElementById(id); }
function show(id) { el(id)?.classList.remove('hidden'); }
function hide(id) { el(id)?.classList.add('hidden'); }

function showLoading(on) {
  on ? show('loading-overlay') : hide('loading-overlay');
}

function fmt(n) {
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function truncate(s, n) {
  return s?.length > n ? s.slice(0, n) + '…' : s;
}

function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.round(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.round(diff / 3600000) + 'h ago';
  return Math.round(diff / 86400000) + 'd ago';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let toastTimer;
function showToast(text, type = '') {
  const t = el('toast');
  t.textContent = text;
  t.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
  }, 2000);
}
