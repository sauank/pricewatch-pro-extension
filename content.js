// ═══════════════════════════════════════════════════════════════
// PriceWatch Pro — Content Script
// Runs on product pages to extract price & name
// ═══════════════════════════════════════════════════════════════

const HOSTNAME = location.hostname.replace('www.', '');

const SITE_CONFIG = {
  'amazon.in': {
    priceSelectors: [
      '.priceToPay .a-offscreen',
      '#corePriceDisplay_desktop_feature_div .a-offscreen',
      '.a-price .a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '.a-price-whole'
    ],
    nameSelectors: ['#productTitle', 'h1.product-title-word-break'],
    isProduct: () => /\/dp\/|\/gp\/product\//.test(location.pathname)
  },
  'flipkart.com': {
    priceSelectors: [
      '._30jeq3._16Jk6d',
      '._30jeq3',
      '.Nx9bqj.CxhGGd'
    ],
    nameSelectors: ['.B_NuCI', 'h1.yhB1nd', 'h1[class*="title"]'],
    isProduct: () => /\/p\//.test(location.pathname) || document.querySelector('._30jeq3') !== null
  },
  'snapdeal.com': {
    priceSelectors: ['#selling-price', '.payBlkBig', '.product-price'],
    nameSelectors: ['.pdp-e-i-head', 'h1.pdp-e-i-head'],
    isProduct: () => /\/product\//.test(location.pathname)
  },
  'meesho.com': {
    priceSelectors: ['[class*="pdpPrice"]', 'h4[class*="price"]', '[itemprop="price"]'],
    nameSelectors: ['h1[class*="ProductName"]', 'h1[class*="product"]'],
    isProduct: () => /\/p\//.test(location.pathname) || /\/product/.test(location.pathname)
  },
  'myntra.com': {
    priceSelectors: ['.pdp-price strong', '[class*="pdpPrice"]', '[class*="discountedPrice"]'],
    nameSelectors: ['.pdp-title', 'h1.pdp-name', '.pdp-product-description-title'],
    isProduct: () => /\/buy\/|\/\d+\/buy/.test(location.pathname) || document.querySelector('.pdp-price') !== null
  }
};

const siteConfig = SITE_CONFIG[HOSTNAME];
const isKnownSite = !!siteConfig;

// ── Extract price ──────────────────────────────────────────────
function extractPrice() {
  const selectors = isKnownSite ? siteConfig.priceSelectors : [
    'meta[property="product:price:amount"]',
    '[itemprop="price"]',
    '[class*="sale-price"]',
    '[class*="selling-price"]',
    '[class*="offer-price"]',
    '[class*="final-price"]',
    '[class*="current-price"]'
  ];

  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (!el) continue;
      const raw = el.getAttribute('content') || el.textContent || '';
      const price = parsePrice(raw);
      if (price) return price;
    } catch (_) {}
  }

  // Try JSON-LD
  try {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      const data = JSON.parse(s.textContent);
      const offers = data.offers || (Array.isArray(data['@graph'])
        ? data['@graph'].find(g => g.offers)?.offers
        : null);
      if (offers) {
        const offer = Array.isArray(offers) ? offers[0] : offers;
        const price = parsePrice(String(offer.price || ''));
        if (price) return price;
      }
    }
  } catch (_) {}

  return null;
}

// ── Extract product name ───────────────────────────────────────
function extractName() {
  const selectors = isKnownSite ? siteConfig.nameSelectors : [
    '[itemprop="name"]',
    'meta[property="og:title"]',
    'h1'
  ];

  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (!el) continue;
      const text = el.getAttribute('content') || el.textContent || '';
      const cleaned = text.trim().replace(/\s+/g, ' ');
      if (cleaned.length > 3) return cleaned.slice(0, 120);
    } catch (_) {}
  }

  return document.title.slice(0, 120) || 'Unknown Product';
}

function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/[₹,\s\u00a0]/g, '').replace(/[^\d.]/g, '');
  const price = parseFloat(cleaned);
  return (!isNaN(price) && price > 0 && price < 10000000) ? price : null;
}

// ── Check if this is a product page ───────────────────────────
function isProductPage() {
  if (isKnownSite) return siteConfig.isProduct();
  return extractPrice() !== null;
}

// ── Notify background of live price when on tracked page ──────
async function reportLivePriceToBackground() {
  const price = extractPrice();
  if (!price) return;
  try {
    chrome.runtime.sendMessage({
      action: 'UPDATE_PRICE_FROM_PAGE',
      url: location.href,
      price
    });
  } catch (_) {}
}

// ── Listen for popup requesting page data ─────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'GET_PAGE_PRODUCT') {
    if (!isProductPage()) {
      sendResponse({ isProduct: false });
      return;
    }
    const price = extractPrice();
    const name = extractName();
    sendResponse({
      isProduct: true,
      url: location.href,
      name,
      price
    });
  }
});

// ── Auto-report if this is a known tracked URL ─────────────────
window.addEventListener('load', () => {
  setTimeout(reportLivePriceToBackground, 2000);
});
