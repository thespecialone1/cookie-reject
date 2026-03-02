# 🛡️ Cookie Reject

**Automatically reject cookie consent banners on every website.**

No more clicking "Reject All" or "Accept Essential Only" on every site you visit. Cookie Reject handles it for you, instantly and silently.

<p align="center">
  <img src="https://raw.githubusercontent.com/thespecialone1/cookie-reject/main/store-assets/mascot.png" alt="Cookie Reject Mascot" width="200">
</p>

## ✨ Features

- 🚫 **Auto-reject cookies** — Clicks "Reject All", "Decline", "Essential Only" buttons automatically
- 🎨 **CSS hiding** — Hides cookie banners instantly (no flash) using 60+ known selectors
- 🔌 **CMP support** — Handles OneTrust, Cookiebot, Quantcast, Didomi, Osano, Klaro, CookieYes, Iubenda, Complianz
- 🌍 **Multilingual** — Detects reject buttons in English, German, French, Spanish, Italian, Dutch, Portuguese
- 👁️ **Shadow DOM** — Finds banners hidden inside Shadow DOM roots
- ⚡ **Dynamic detection** — MutationObserver catches late-loading banners
- 🔒 **Zero data collection** — Everything runs locally, no tracking, no analytics
- 🎚️ **Toggle on/off** — Clean popup UI to pause/resume

## 📦 Install from Chrome Web Store

> Coming soon!

## 🛠️ Install Manually (Developer Mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/thespecialone1/cookie-reject.git
   ```
2. Open Chrome → navigate to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the cloned folder
5. Done! The shield mascot icon will appear in your toolbar

## 🧪 Test It

Open `test-page.html` in Chrome — it has **12 different cookie consent implementations** to stress-test the extension:

| # | Type | Difficulty |
|---|---|---|
| 1 | Full-screen cookie wall | 🔴 Hard |
| 2 | Bottom GDPR banner | 🟡 Standard |
| 3 | Top notification bar | 🟡 Standard |
| 4 | Corner popup | 🟡 Standard |
| 5 | OneTrust simulation | 🔵 CMP |
| 6 | Cookiebot simulation | 🔵 CMP |
| 7 | GDPR modal with categories | 🔴 Complex |
| 8 | Scroll-lock overlay | 🔴 Evil |
| 9 | cc-banner library | 🟡 Standard |
| 10 | Dynamically injected (3s delay) | 🟢 Dynamic |
| 11 | Shadow DOM banner | 🟣 Shadow |
| 12 | Fake CMP API traps | 🟢 API |

## 📁 Project Structure

```
cookie-reject/
├── manifest.json          # Extension manifest (V3)
├── content.js             # Auto-reject engine
├── hide-banners.css       # Instant CSS banner hiding
├── background.js          # State management service worker
├── popup.html/css/js      # Toggle popup UI
├── privacy-policy.html    # Privacy policy (required for Web Store)
├── assets/
│   ├── icons/             # Extension icons (16, 48, 128px)
├── store-assets/          # Chrome Web Store listing assets
│   ├── mascot.png
│   └── promo-tile.png
└── test-page.html         # Cookie consent torture test
```

## 🔒 Privacy

Cookie Reject collects **zero data**. No personal info, no browsing history, no analytics, no tracking. Everything runs locally in your browser. [Read the full Privacy Policy →](privacy-policy.html)

## 📄 License

MIT License — free to use, modify, and distribute.

## 🤝 Contributing

Issues and pull requests are welcome! If you find a cookie banner that Cookie Reject doesn't handle, please [open an issue](https://github.com/thespecialone1/cookie-reject/issues).
