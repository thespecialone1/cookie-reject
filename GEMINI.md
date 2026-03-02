# BrowseClean — Extension Evolution Plan

> Expanding Cookie Reject into a general-purpose **"clean browsing"** extension.
> Extension name stays as **Cookie Reject** for now — rename only when Tier 2+ features are stable.

---

## Architecture & Design Rules

### Design Language (MUST follow)
- **Theme:** Google Material 3 Dark
- **Background colors:** `#1a1a1c` (body), `#232326` (cards), `#2b2b2f` (controls), `#45454a` (elevated)
- **Accent:** `#a8c7fa` (primary blue), `#0842a0` (dark blue), `#81c995` (green), `#9aa0a6` (muted gray)
- **Border color:** `#323236`
- **Font:** Inter, 600 headings, 500 body, 400 secondary
- **Border radius:** 12px (cards/sections), 8px (buttons/inner), 24px (toggles)
- **Transitions:** `0.2s ease` or `0.25s cubic-bezier(0.4, 0.0, 0.2, 1)`
- **Popup width:** 320px

### Code Architecture
- **Content script:** Single IIFE in `content.js` — each feature module is a function inside this IIFE
- **Feature flags:** All new features stored in `chrome.storage.local` with sensible defaults (enabled by default)
- **Background:** `background.js` handles state, badge, messaging
- **Popup:** `popup.html` + `popup.css` + `popup.js` — each feature gets a toggle card in the popup
- **CSS injection:** `hide-banners.css` — extended for new CSS-based features

### Toggle Card Pattern (for popup UI)
Every new feature gets a toggle card like this:
```html
<div class="feature-section">
  <div class="feature-info">
    <div class="feature-icon">🔇</div>
    <div class="feature-text">
      <div class="feature-title">Newsletter Popup Blocker</div>
      <div class="feature-desc">Blocks "subscribe" modals</div>
    </div>
  </div>
  <label class="toggle-switch">
    <input type="checkbox" id="feature-newsletters" checked>
    <span class="slider"></span>
  </label>
</div>
```
Style the `.feature-section` identically to `.domain-section` with the same background, border, padding, and border-radius.

---

## Progress Tracker

| # | Feature | Tier | Status |
|---|---------|------|--------|
| 1 | Newsletter/Popup Blocker | T1 | ✅ Done |
| 2 | Notification Permission Blocker | T1 | ✅ Done |
| 3 | Auto-play Video Stopper | T1 | ✅ Done |
| 4 | Sticky Element Remover | T1 | ✅ Done |
| 5 | Anti-Adblock Bypass | T1 | ⬜ Not Started |
| 6 | Tracker Blocker | T2 | ⬜ Not Started |
| 7 | Dark Mode Injector | T2 | ⬜ Not Started |
| 8 | Reader Mode | T2 | ⬜ Not Started |
| 9 | Element Picker/Hider | T3 | ✅ Done |
| 10 | Custom CSS Injector | T3 | ⬜ Not Started |
| 11 | Page Screenshot Tool | T3 | ✅ Done |
| 12 | Stats Dashboard | T4 | ⬜ Not Started |
| 13 | Site Privacy Score | T4 | ⬜ Not Started |
| 14 | Export/Import Settings | T4 | ⬜ Not Started |
| 15 | Smart Element Tools (Magic Wand) | T4 | ⬜ Not Started |

**Legend:** ⬜ Not Started · 🔨 In Progress · ✅ Done

---

*Note: Phase 15 is extensively detailed in `ELEMENT_TOOLS_SPEC.md`, replacing the basic Element Picker from Phase 9.*
---

## Phase 1 — Newsletter / Popup Blocker

### Goal
Detect and dismiss "Subscribe to our newsletter", "Sign up for updates", "Join our mailing list" modals that appear as overlays or slide-ins.

### 1A. Content Script — `content.js`

Add a new function `runNewsletterBlocker()` inside the IIFE, called from `runReject()` (gated by feature flag `blockNewsletters`).

**Detection strategy:**
1. **CSS selectors** — common newsletter modal classes/IDs:
   - `[class*="newsletter"]`, `[class*="subscribe"]`, `[class*="signup-modal"]`, `[class*="popup-modal"]`, `[class*="email-popup"]`, `[class*="exit-intent"]`, `[class*="lead-capture"]`, `[class*="optin"]`, `[class*="mailing-list"]`
   - `[id*="newsletter"]`, `[id*="subscribe"]`, `[id*="email-popup"]`, `[id*="exit-intent"]`
2. **Heuristic check** — An element is likely a newsletter popup if:
   - It's a fixed/absolute positioned overlay (`position: fixed` or `position: absolute`)
   - It contains an `<input type="email">` or `<input>` with placeholder matching `/email/i`
   - It contains text matching newsletter patterns: `/subscribe|newsletter|mailing list|sign up for|join our|get updates|stay informed|don't miss/i`
   - Its z-index is > 999
3. **Action** — Hide the element and its associated backdrop/overlay.

**Storage key:** `blockNewsletters` (default: `true`)

### 1B. CSS — `hide-banners.css`

Add a new section `/* ===== Newsletter / Email Popups ===== */` with selectors for known newsletter popup classes.

### 1C. Popup UI — `popup.html` + `popup.js`

Add a new toggle card below the domain section for "Newsletter Blocker" with ID `feature-newsletters`.

In `popup.js`:
- Load `blockNewsletters` from storage on init
- Update toggle state based on stored value
- Save changes and reload tab on toggle change

### 1D. Background — `background.js`

Add `blockNewsletters: true` to the default state on install.

### Verification
- Load the extension in Chrome (chrome://extensions → Developer Mode → Load unpacked)
- Visit sites with known newsletter popups and confirm they are blocked
- Toggle the feature off in popup and confirm newsletters appear again
- Verify existing cookie banner blocking still works

---

## Phase 2 — Notification Permission Blocker

### Goal
Automatically deny the browser's "Allow notifications?" permission prompt AND block custom notification permission modals that sites use before triggering the browser prompt.

### 2A. Content Script — `content.js`

Add `runNotificationBlocker()`:
1. **Override Notification API** — Inject a script into the page context:
   ```js
   // Override Notification.requestPermission to auto-deny
   const origRequest = Notification.requestPermission;
   Notification.requestPermission = function() {
     return Promise.resolve('denied');
   };
   // Override permission getter
   Object.defineProperty(Notification, 'permission', { get: () => 'denied' });
   ```
2. **CSS/DOM cleanup** — Hide custom notification prompt modals:
   - `[class*="notification-prompt"]`, `[class*="push-notification"]`, `[class*="web-push"]`, `[class*="push-prompt"]`, `[class*="bell-prompt"]`
   - Heuristic: fixed element with text matching `/enable notifications|allow notifications|push notification|stay updated|never miss/i`

**Storage key:** `blockNotifications` (default: `true`)

### 2B. CSS — `hide-banners.css`
Add section `/* ===== Notification Prompts ===== */`.

### 2C. Popup UI
Add toggle card "Notification Blocker" with ID `feature-notifications`.

### 2D. Background
Add `blockNotifications: true` to install defaults.

### Verification
- Visit sites that request notification permissions (e.g., news sites)
- Confirm the browser prompt does not appear
- Confirm custom notification modals are hidden
- Toggle off and verify the prompt appears normally

---

## Phase 3 — Auto-play Video Stopper

### Goal
Pause all auto-playing videos on page load while keeping user-initiated playback working.

### 3A. Content Script — `content.js`

Add `runAutoplayBlocker()`:
1. **MutationObserver** for new `<video>` and `<iframe>` elements
2. For `<video>` elements:
   - Remove `autoplay` attribute
   - Set `video.pause()` on load
   - Listen for `play` event: if `!video.userInitiated`, pause it (use a flag set on click)
3. For `<iframe>` embeds (YouTube, Vimeo):
   - Modify `src` to add `autoplay=0` parameter
4. **Audio elements** — also pause auto-playing `<audio>` tags

**Storage key:** `blockAutoplay` (default: `true`)

### 3B. Popup UI
Add toggle card "Auto-play Blocker" with ID `feature-autoplay`.

### 3C. Background
Add `blockAutoplay: true` to install defaults.

### Verification
- Visit YouTube, news sites with auto-play videos
- Confirm videos do not auto-play
- Click play manually and confirm playback works
- Toggle off and confirm auto-play resumes

---

## Phase 4 — Sticky Element Remover

### Goal
Remove annoying fixed-position bars: floating chat widgets, promo bars, "Download our app" bars, social share floating buttons.

### 4A. Content Script — `content.js`

Add `runStickyRemover()`:
1. After DOM ready, scan all elements with `position: fixed` or `position: sticky`
2. Exclude: navigation bars (if at top and wide, likely nav), `<header>` tags, elements with `nav`/`navigation` in class/role
3. For remaining fixed elements:
   - If height < 200px and contains text matching `/chat|help|support|download our app|install|get the app|follow us|share/i`, hide it
   - If it's a floating button (circular, small, bottom-right corner), hide it
4. Known widget selectors: `[class*="chat-widget"]`, `[class*="intercom"]`, `[id*="hubspot"]`, `[class*="drift-"]`, `[class*="crisp-"]`, `[class*="tawk-"]`, `[class*="zendesk"]`, `[class*="freshdesk"]`, `[class*="livechat"]`

**Storage key:** `removeStickyElements` (default: `true`)

### 4B. CSS — `hide-banners.css`
Add section `/* ===== Chat Widgets & Sticky Elements ===== */` with known widget selectors.

### 4C. Popup UI
Add toggle card "Sticky Element Remover" with ID `feature-sticky`.

### 4D. Background
Add `removeStickyElements: true` to install defaults.

### Verification
- Visit sites with Intercom/Drift/Tawk chat widgets
- Confirm floating widgets are hidden
- Confirm the main navigation bar is NOT hidden
- Toggle off and confirm widgets appear

---

## Phase 5 — Anti-Adblock Bypass

### Goal
Dismiss "Please disable your adblocker" overlays that block page content.

### 5A. Content Script — `content.js`

Add `runAntiAdblockBypass()`:
1. **CSS selectors** for known anti-adblock overlays:
   - `[class*="adblock"]`, `[class*="ad-block"]`, `[class*="adblocker"]`, `[id*="adblock"]`
   - `[class*="disable-adb"]`, `[class*="adb-overlay"]`
2. **Heuristic** — fixed/absolute element with text matching:
   `/ad\s*block|adblocker|disable.*ad.*block|whitelist this|turn off.*ad.*block|detected.*ad.*block/i`
3. **Action** — hide element + remove associated overlay + fix body scroll

**Storage key:** `bypassAntiAdblock` (default: `true`)

### 5B. CSS — `hide-banners.css`
Add section `/* ===== Anti-Adblock Overlays ===== */`.

### 5C. Popup UI
Add toggle card "Anti-Adblock Bypass" with ID `feature-antiadblock`.

### 5D. Background
Add `bypassAntiAdblock: true` to install defaults.

### Verification
- Visit sites known to detect adblockers
- Confirm the "disable adblocker" overlay is removed
- Confirm page content is accessible
- Toggle off and confirm overlay appears

---

## Phase 6 — Tracker Blocker

### Goal
Block known third-party tracking scripts from loading, improving privacy and page speed.

### 6A. Background — `background.js`

Use `chrome.declarativeNetRequest` to block tracking domains:
- Google Analytics (`google-analytics.com`, `googletagmanager.com`)
- Facebook Pixel (`connect.facebook.net`, `facebook.com/tr`)
- Hotjar (`static.hotjar.com`)
- Mixpanel, Segment, Amplitude, etc.

Create a `tracker-rules.json` file with declarativeNetRequest rules.

### 6B. Manifest — `manifest.json`
Add `declarativeNetRequest` permission and reference the rules file.

### 6C. Popup UI
Add toggle card "Tracker Blocker" with ID `feature-trackers`.
Show count of trackers blocked.

### 6D. Background
Add `blockTrackers: true` to install defaults.
Track count of blocked requests.

### Verification
- Visit sites with Google Analytics
- Open DevTools Network tab and confirm analytics requests are blocked
- Check popup shows tracker count
- Toggle off and confirm tracking scripts load normally

---

## Phase 7 — Dark Mode Injector

### Goal
Force dark mode on any website using smart CSS inversion with heuristic corrections.

### 7A. Content Script — new file `dark-mode.css`

A separate injectable CSS file:
- `filter: invert(1) hue-rotate(180deg)` on root
- Un-invert images, videos, SVGs, canvases: `img, video, svg, canvas, [style*="background-image"] { filter: invert(1) hue-rotate(180deg); }`
- Fine-tune background/text colors

### 7B. Background — `background.js`
Inject/remove `dark-mode.css` via `chrome.scripting.insertCSS` / `chrome.scripting.removeCSS` based on toggle + per-site preferences.

### 7C. Popup UI
Add toggle card "Dark Mode" with ID `feature-darkmode`.
Include a per-site sub-toggle.

### Verification
- Toggle dark mode on and visit various sites
- Confirm images and videos are NOT inverted
- Confirm text is readable
- Toggle off per-site and confirm site returns to normal

---

## Phase 8 — Reader Mode

### Goal
Strip page to just the article content — clean typography, no ads, no distractions.

### 8A. Content Script — `content.js` or new file `reader.js`

Use Mozilla's Readability.js algorithm (or a lightweight port):
1. Extract main article content
2. Replace page with a clean reader view
3. Use Inter font, comfortable line height, max-width 680px
4. Match dark theme from popup (`#1a1a1c` background, `#e3e3e8` text)
5. Add a floating "Exit Reader" button

### 8B. Popup UI
Add a button (not a toggle) "Reader Mode" that activates reader view on the current tab.

### Verification
- Click Reader Mode on a news article
- Confirm only article content is shown
- Confirm images within the article are preserved
- Click Exit and confirm normal page returns

---

## Phase 9 — Element Picker / Hider

### Goal
Let users click on any element on a page to permanently hide it on that domain.

### 9A. Content Script — new file `picker.js`

On activation:
1. Add a hover overlay to highlight elements
2. On click, generate a CSS selector for the element
3. Store the selector + domain in `chrome.storage.local`
4. Apply stored selectors on every page load for that domain

### 9B. Popup UI
Add button "Hide an Element" that sends a message to activate picker mode.
Show list of hidden elements for current domain with option to unhide.

### Verification
- Click "Hide an Element" and pick a sidebar ad
- Refresh and confirm it stays hidden
- Remove it from the list and confirm it reappears

---

## Phase 10 — Custom CSS Injector

### Goal
Let users add custom CSS per-site.

### 10A. Popup UI
Add "Custom CSS" section with a small textarea and Save button.

### 10B. Content Script
Load and inject stored CSS for the current domain on page load.

### Verification
- Add custom CSS (e.g., `body { background: red !important; }`)
- Confirm it applies
- Remove it and confirm site returns to normal

---

## Phase 11 — Page Screenshot Tool

### Goal
Capture visible area or full-page screenshot.

### 11A. Background — `background.js`
Use `chrome.tabs.captureVisibleTab()` for visible area.
For full page: scroll + stitch approach.

### 11B. Popup UI
Add "Screenshot" button with dropdown: "Visible Area" / "Full Page".

### Verification
- Take a visible-area screenshot and confirm download
- Take a full-page screenshot and confirm it captures the full scroll height

---

## Phase 12 — Stats Dashboard

### Goal
Show detailed blocking stats: per-site breakdown, timeline, totals per feature.

### 12A. New Page — `dashboard.html`
A full-page stats dashboard opened from popup.
Charts using lightweight SVG/Canvas.

### 12B. Storage
Extend stats to track per-feature, per-domain counts.

### Verification
- Visit multiple sites with the extension active
- Open dashboard and verify counts match
- Verify per-site breakdown is accurate

---

## Phase 13 — Site Privacy Score

### Goal
Rate each site's privacy based on trackers, cookies, and fingerprinting attempts detected.

### 13A. Content Script + Background
Count trackers, cookies, and fingerprinting APIs used on each site.
Calculate a score from A (most private) to F (least private).

### 13B. Popup UI
Show privacy grade badge in popup header area.

### Verification
- Visit privacy-respecting sites and confirm high scores
- Visit tracker-heavy sites and confirm low scores

---

## Phase 14 — Export/Import Settings

### Goal
Allow users to export all settings and hidden element rules as JSON, and import them.

### 14A. Popup UI
Add "Export Settings" and "Import Settings" buttons in a new settings area.

### 14B. Logic
Export: serialize `chrome.storage.local` to JSON file download.
Import: parse JSON and merge into storage.

### Verification
- Export settings to a file
- Clear extension data
- Import the file and confirm all settings are restored

---

## Agent Instructions

> [!IMPORTANT]
> **Work in STRICT phase order.** Do not skip ahead. Complete Phase N before starting Phase N+1.
> After completing each phase, update the **Progress Tracker** table above (change ⬜ to ✅).
> After completing each phase, test the feature by loading the extension in Chrome.

### Before each phase:
1. Read this file to check which phase is next
2. Read the specific phase section for detailed instructions
3. Implement the feature following the patterns established in existing code
4. Update the Progress Tracker

### Code patterns to follow:
- Content script features: add new function inside the IIFE, gate behind feature flag from `chrome.storage.local`
- Popup toggles: follow the `.domain-section` card pattern with the toggle switch
- Storage: always add defaults in `background.js` `onInstalled` handler
- CSS: add new sections to `hide-banners.css` with clear section headers

### After ALL phases are done:
- Rename extension to **BrowseClean** (or user-chosen name)
- Update `manifest.json` description
- Update `README.md`
- Create final release zip
