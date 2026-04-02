// ═══════════════════════════════════════════════════════════════
// PriceWatch Pro — Background Service Worker
// ═══════════════════════════════════════════════════════════════

// ── Price selectors per site ────────────────────────────────────
const PRICE_SELECTORS = {
  'amazon.in': [
    '.priceToPay .a-offscreen',
    '#corePriceDisplay_desktop_feature_div .a-offscreen',
    '.a-price .a-offscreen',
    '#priceblock_ourprice',
    '#priceblock_dealprice',
    '#priceblock_saleprice',
    '.a-price-whole'
  ],
  'flipkart.com': [
    '._30jeq3._16Jk6d',
    '._30jeq3',
    '.Nx9bqj.CxhGGd',
    '[class*="finalPrice"]',
    '[class*="selling-price"]'
  ],
  'snapdeal.com': [
    '#selling-price',
    '.payBlkBig',
    '.product-price',
    '[itemprop="price"]',
    '[class*="price-final"]'
  ],
  'meesho.com': [
    '[class*="pdpPrice"]',
    'h4[class*="price"]',
    '[itemprop="price"]',
    'meta[property="product:price:amount"]'
  ],
  'myntra.com': [
    '.pdp-price strong',
    '.pdp-discount-container strong',
    '[class*="pdpPrice"]',
    '[class*="discountedPrice"]'
  ],
  'generic': [
    'meta[property="product:price:amount"]',
    '[itemprop="price"]',
    '[class*="sale-price"]',
    '[class*="selling-price"]',
    '[class*="offer-price"]',
    '[class*="final-price"]',
    '[class*="current-price"]',
    '[class*="price-now"]',
    '[id*="selling-price"]',
    '[id*="offer-price"]'
  ]
};

const SITE_NAMES = {
  'amazon.in': 'Amazon India',
  'flipkart.com': 'Flipkart',
  'snapdeal.com': 'Snapdeal',
  'meesho.com': 'Meesho',
  'myntra.com': 'Myntra'
};

// ── On install / update ─────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Default settings
    await chrome.storage.local.set({
      settings: {
        checkIntervalHours: 6,
        emailjsEnabled: false,
        emailjsServiceId: '',
        emailjsTemplateId: '',
        emailjsPublicKey: '',
        recipientEmail: '',
        sheetsEnabled: false,
        sheetsId: '',
        sheetsName: 'PriceHistory',
        dropThresholdPercent: 0
      },
      trackedItems: {}
    });
  }
  await setupAlarm();
  console.log('PriceWatch Pro ready');
});

async function setupAlarm() {
  await chrome.alarms.clearAll();
  const { settings = {} } = await chrome.storage.local.get('settings');
  const minutes = (settings.checkIntervalHours || 6) * 60;
  chrome.alarms.create('priceCheck', {
    delayInMinutes: 1,
    periodInMinutes: minutes
  });
}

// ── Alarm handler ───────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'priceCheck') {
    console.log('PriceWatch: Running scheduled price check...');
    await checkAllPrices();
  }
});

// ── Core price check loop ───────────────────────────────────────
async function checkAllPrices() {
  const { trackedItems = {}, settings = {} } = await chrome.storage.local.get(['trackedItems', 'settings']);
  const ids = Object.keys(trackedItems);
  if (ids.length === 0) return;

  let updated = false;

  for (const id of ids) {
    const item = trackedItems[id];
    try {
      const newPrice = await fetchPrice(item.url);
      if (newPrice === null) {
        trackedItems[id].lastError = 'Could not fetch price (site may block bots)';
        trackedItems[id].lastChecked = Date.now();
        updated = true;
        continue;
      }

      const oldPrice = item.currentPrice;
      const priceHistory = item.priceHistory || [];
      priceHistory.push({ price: newPrice, date: Date.now() });
      if (priceHistory.length > 60) priceHistory.shift(); // keep 60 data points

      const allPrices = priceHistory.map(h => h.price);
      const lowestEver = Math.min(...allPrices);
      const highestEver = Math.max(...allPrices);

      trackedItems[id] = {
        ...item,
        previousPrice: oldPrice,
        currentPrice: newPrice,
        lowestEver,
        highestEver,
        lastChecked: Date.now(),
        lastError: null,
        priceHistory
      };

      // ── Price drop detection ──────────────────────────────────
      if (oldPrice && newPrice < oldPrice) {
        const dropPct = Math.round(((oldPrice - newPrice) / oldPrice) * 100);
        const threshold = settings.dropThresholdPercent || 0;

        if (dropPct >= threshold) {
          // Browser notification
          chrome.notifications.create(`price-drop-${id}-${Date.now()}`, {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: '💰 Price Drop Alert!',
            message: `${item.name}\n₹${fmt(newPrice)} (was ₹${fmt(oldPrice)}) — ${dropPct}% off!`,
            contextMessage: item.siteName || '',
            priority: 2
          });

          // Email alert
          if (settings.emailjsEnabled) {
            await sendEmailAlert(trackedItems[id], oldPrice, newPrice, dropPct, settings);
          }

          // Google Sheets sync
          if (settings.sheetsEnabled) {
            await syncToSheets(trackedItems[id], settings);
          }

          // Update badge to show drop count
          updateBadge(trackedItems);
        }
      }

      updated = true;
    } catch (err) {
      console.error(`PriceWatch error for ${item.url}:`, err);
      trackedItems[id].lastError = err.message;
      trackedItems[id].lastChecked = Date.now();
      updated = true;
    }
  }

  if (updated) {
    await chrome.storage.local.set({ trackedItems });
  }
}

// ── Fetch & parse price from URL ────────────────────────────────
async function fetchPrice(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-IN,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) return null;
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const hostname = new URL(url).hostname.replace('www.', '');
    const selectors = PRICE_SELECTORS[hostname] || PRICE_SELECTORS['generic'];

    for (const selector of selectors) {
      try {
        if (selector.startsWith('meta[')) {
          const meta = doc.querySelector(selector);
          if (meta) {
            const price = parsePrice(meta.getAttribute('content') || '');
            if (price) return price;
          }
        } else {
          const el = doc.querySelector(selector);
          if (el) {
            const price = parsePrice(el.textContent || el.getAttribute('content') || '');
            if (price) return price;
          }
        }
      } catch (_) {}
    }

    // Fallback: scan meta tags for any price
    const ldJson = doc.querySelector('script[type="application/ld+json"]');
    if (ldJson) {
      try {
        const data = JSON.parse(ldJson.textContent);
        const offers = data.offers || (data['@graph'] || []).find(g => g.offers)?.offers;
        if (offers) {
          const price = parsePrice(String((Array.isArray(offers) ? offers[0] : offers).price || ''));
          if (price) return price;
        }
      } catch (_) {}
    }

    return null;
  } catch (err) {
    console.warn('fetchPrice failed:', err.message);
    return null;
  }
}

function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/[₹,\s\u00a0]/g, '').replace(/[^\d.]/g, '');
  const price = parseFloat(cleaned);
  return (!isNaN(price) && price > 0 && price < 10000000) ? price : null;
}

function fmt(n) {
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Email via EmailJS ───────────────────────────────────────────
async function sendEmailAlert(item, oldPrice, newPrice, dropPct, settings) {
  try {
    const payload = {
      service_id: settings.emailjsServiceId,
      template_id: settings.emailjsTemplateId,
      user_id: settings.emailjsPublicKey,
      template_params: {
        to_email: settings.recipientEmail,
        product_name: item.name,
        site_name: item.siteName || 'Unknown Site',
        current_price: `₹${fmt(newPrice)}`,
        old_price: `₹${fmt(oldPrice)}`,
        drop_percent: `${dropPct}%`,
        lowest_ever: `₹${fmt(item.lowestEver)}`,
        product_url: item.url
      }
    };

    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log('Email sent:', res.status);
  } catch (err) {
    console.error('Email alert failed:', err);
  }
}

// ── Google Sheets sync ──────────────────────────────────────────
async function syncToSheets(item, settings) {
  try {
    const token = await getAuthToken();
    if (!token) return;

    const spreadsheetId = settings.sheetsId;
    const sheetName = settings.sheetsName || 'PriceHistory';
    const range = `${sheetName}!A:H`;

    const row = [
      new Date().toLocaleString('en-IN'),
      item.name,
      item.siteName || '',
      item.currentPrice,
      item.previousPrice || '',
      item.lowestEver || '',
      item.highestEver || '',
      item.url
    ];

    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: [row] })
      }
    );
    console.log('Synced to Google Sheets');
  } catch (err) {
    console.error('Sheets sync failed:', err);
  }
}

async function getAuthToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        console.warn('Auth token unavailable:', chrome.runtime.lastError?.message);
        resolve(null);
      } else {
        resolve(token);
      }
    });
  });
}

// ── Badge update ────────────────────────────────────────────────
function updateBadge(trackedItems) {
  const dropCount = Object.values(trackedItems).filter(
    item => item.previousPrice && item.currentPrice < item.previousPrice
  ).length;

  if (dropCount > 0) {
    chrome.action.setBadgeText({ text: String(dropCount) });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// ── Message handler (from popup / content script) ────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {

    case 'ADD_ITEM': {
      (async () => {
        const { trackedItems = {} } = await chrome.storage.local.get('trackedItems');
        const id = msg.item.id || generateId();
        const hostname = new URL(msg.item.url).hostname.replace('www.', '');

        trackedItems[id] = {
          id,
          name: msg.item.name,
          url: msg.item.url,
          siteName: SITE_NAMES[hostname] || new URL(msg.item.url).hostname,
          currentPrice: msg.item.price,
          previousPrice: null,
          lowestEver: msg.item.price,
          highestEver: msg.item.price,
          targetPrice: msg.item.targetPrice || null,
          addedAt: Date.now(),
          lastChecked: Date.now(),
          lastError: null,
          priceHistory: msg.item.price ? [{ price: msg.item.price, date: Date.now() }] : []
        };

        await chrome.storage.local.set({ trackedItems });
        sendResponse({ success: true, id });
      })();
      return true;
    }

    case 'REMOVE_ITEM': {
      (async () => {
        const { trackedItems = {} } = await chrome.storage.local.get('trackedItems');
        delete trackedItems[msg.id];
        await chrome.storage.local.set({ trackedItems });
        updateBadge(trackedItems);
        sendResponse({ success: true });
      })();
      return true;
    }

    case 'GET_ITEMS': {
      (async () => {
        const { trackedItems = {} } = await chrome.storage.local.get('trackedItems');
        sendResponse({ items: trackedItems });
      })();
      return true;
    }

    case 'CHECK_NOW': {
      (async () => {
        await checkAllPrices();
        sendResponse({ success: true });
      })();
      return true;
    }

    case 'SETTINGS_UPDATED': {
      setupAlarm();
      sendResponse({ success: true });
      return true;
    }

    case 'UPDATE_PRICE_FROM_PAGE': {
      // Content script sends live price when user visits a tracked page
      (async () => {
        const { trackedItems = {} } = await chrome.storage.local.get('trackedItems');
        const item = Object.values(trackedItems).find(i => i.url === msg.url);
        if (item && msg.price) {
          const priceHistory = item.priceHistory || [];
          priceHistory.push({ price: msg.price, date: Date.now() });
          if (priceHistory.length > 60) priceHistory.shift();
          const allPrices = priceHistory.map(h => h.price);
          const oldPrice = item.currentPrice;
          trackedItems[item.id] = {
            ...item,
            previousPrice: oldPrice,
            currentPrice: msg.price,
            lowestEver: Math.min(...allPrices),
            highestEver: Math.max(...allPrices),
            lastChecked: Date.now(),
            lastError: null,
            priceHistory
          };
          await chrome.storage.local.set({ trackedItems });
          updateBadge(trackedItems);
        }
        sendResponse({ success: true });
      })();
      return true;
    }

    case 'AUTH_SHEETS': {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true });
        }
      });
      return true;
    }
  }
});

// ── Notification click — open product URL ───────────────────────
chrome.notifications.onClicked.addListener(async (notifId) => {
  if (notifId.startsWith('price-drop-')) {
    // notifId format: price-drop-{itemId}-{timestamp}
    const parts = notifId.split('-');
    const itemId = parts.slice(2, -1).join('-');
    const { trackedItems = {} } = await chrome.storage.local.get('trackedItems');
    const item = trackedItems[itemId];
    if (item?.url) {
      chrome.tabs.create({ url: item.url });
    }
    chrome.notifications.clear(notifId);
  }
});

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
