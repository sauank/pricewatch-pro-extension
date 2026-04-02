# ⬡ PriceWatch Pro — Chrome Extension

Track prices on Amazon India, Flipkart, Myntra, Snapdeal, Meesho and any shopping website.
Get browser notifications and email alerts on price drops. Sync history to Google Sheets.

---

## 🚀 Quick Install

1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer Mode** (top right toggle)
3. Click **Load unpacked** → select this folder
4. Pin the extension from the toolbar — you're live!

---

## 📦 How to Use

### Track a product
1. Visit any product page (Amazon, Flipkart, Myntra, Snapdeal, Meesho, or any site)
2. Click the PriceWatch Pro extension icon
3. The popup will detect the product and show its name & price
4. Click **+ Track** — done!

### View tracked items
- Click the extension icon to see all tracked items with current prices, price change %, and mini sparkline charts
- Click any product name to open its page
- Click **↻** (refresh button) to trigger an immediate price check

### Price checks
- Prices are checked automatically in the background (default: every 6 hours)
- When you visit a tracked page, it also updates the price live
- Change the interval in Settings

---

## ✉ Email Alerts Setup (EmailJS)

EmailJS sends emails from the browser — no backend needed. Free tier: **200 emails/month**.

1. Sign up at [emailjs.com](https://www.emailjs.com)
2. **Add an Email Service** (Gmail, Outlook, etc.) → note the **Service ID**
3. **Create an Email Template** — use these variables in your template:

   ```
   Subject: 💰 Price Drop: {{product_name}}
   
   Hi there!
   
   {{product_name}} on {{site_name}} dropped {{drop_percent}}!
   
   New price: {{current_price}}
   Was: {{old_price}}
   Lowest ever: {{lowest_ever}}
   
   👉 {{product_url}}
   ```

4. Note the **Template ID** and **Public Key** (from Account → API Keys)
5. Open PriceWatch Pro → Settings
6. Enable **Email Alerts**, fill in Service ID, Template ID, Public Key, and your email
7. Click **Save Settings**

---

## 📊 Google Sheets Sync Setup

### Step 1 — Google Cloud
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Search for **Google Sheets API** → Enable it
4. Go to **APIs & Services → Credentials**
5. Click **Create Credentials → OAuth 2.0 Client ID**
6. Application type: **Chrome Extension**
7. Set **Application ID** to your extension's ID
   - Find it at `chrome://extensions` after loading the extension
8. Copy the generated **Client ID**

### Step 2 — Update manifest.json
Open `manifest.json` and replace:
```json
"client_id": "YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com"
```
with your actual Client ID. Then **reload** the extension at `chrome://extensions`.

### Step 3 — Prepare your Google Sheet
1. Create a new Google Sheet
2. Add these headers in Row 1:
   ```
   Date | Product | Site | Current Price | Previous Price | Lowest Ever | Highest Ever | URL
   ```
3. Copy the Spreadsheet ID from the URL:
   `docs.google.com/spreadsheets/d/`**`[THIS IS YOUR ID]`**`/edit`

### Step 4 — Configure in extension
1. Open Settings → enable **Google Sheets Sync**
2. Paste your Spreadsheet ID and sheet/tab name
3. Click **Authorize Google Account**
4. Save Settings

---

## 🔧 Site-Specific Notes

| Site | Support Level | Notes |
|------|--------------|-------|
| Amazon India | ⭐⭐⭐ Excellent | Best extraction, may occasionally require page visit |
| Flipkart | ⭐⭐⭐ Excellent | Works well |
| Myntra | ⭐⭐ Good | Some pages block background fetch |
| Snapdeal | ⭐⭐ Good | Works well |
| Meesho | ⭐ Basic | JS-heavy site — relies on page visits |
| Other sites | ⭐⭐ Good | Uses generic selectors + JSON-LD schema |

**Note:** Some sites (especially Meesho) use JavaScript-heavy rendering, meaning background fetch (service worker) may not get the price. The extension will still update prices **automatically when you visit** those pages — the content script handles this.

---

## 🗂 File Structure

```
pricewatch-extension/
├── manifest.json       ← Extension config (add your OAuth client_id here)
├── background.js       ← Service worker: price checks, notifications, email, sheets
├── content.js          ← Runs on product pages: extracts price & name
├── popup.html/js/css   ← Extension popup UI
├── options.html/js/css ← Settings page
├── icons/              ← Extension icons
└── README.md           ← This file
```

---

## 🛠 Troubleshooting

**"Could not fetch price (site may block bots)"**
→ The site blocked background fetch. Just visit the product page — price will update automatically.

**Email not sending**
→ Double-check your EmailJS Service ID, Template ID, and Public Key. Make sure the template variable names match exactly.

**Google Sheets auth failing**
→ Make sure your extension ID in Google Cloud Console matches the one at `chrome://extensions`. Reload extension after updating manifest.json.

**Price shows "—"**
→ The selector didn't match. Try visiting the product page directly. If it consistently fails, open an issue with the URL.

---

## 📄 License
Personal use. Not for redistribution.
