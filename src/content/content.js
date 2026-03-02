/**
 * Cookie Reject v2.0 — Content Script
 * 
 * Automatically handles cookie consent banners using multiple strategies:
 *   1. CMP framework APIs (OneTrust, Cookiebot, etc.)
 *   2. Clicks buttons based on text patterns & selectors
 *   3. Removes/hides remaining banners from the DOM
 */

(function () {
    'use strict';

    let mode = 'REJECT';
    let isWhitelisted = false;
    let hasRun = false;
    let actionTaken = false;
    let blockNewsletters = true;
    let blockNotifications = true;
    let blockAutoplay = true;
    let removeStickyElements = true;

    // 1. Initialize State
    const currentDomain = window.location.hostname;

    chrome.storage.local.get(['mode', 'whitelistedDomains', 'blockNewsletters', 'blockNotifications', 'blockAutoplay', 'removeStickyElements'], (result) => {
        mode = result.mode || 'REJECT';
        const whitelistedDomains = result.whitelistedDomains || [];
        isWhitelisted = whitelistedDomains.includes(currentDomain);
        blockNewsletters = result.blockNewsletters !== undefined ? result.blockNewsletters : true;
        blockNotifications = result.blockNotifications !== undefined ? result.blockNotifications : true;
        blockAutoplay = result.blockAutoplay !== undefined ? result.blockAutoplay : true;
        removeStickyElements = result.removeStickyElements !== undefined ? result.removeStickyElements : true;

        if (mode !== 'PAUSED' && !isWhitelisted) {
            init();
        }

        // Always apply user-hidden elements regardless of mode
        applyHiddenElements();
    });

    // Listen for toggle messages
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'toggle' || message.type === 'stateUpdate') {
            // We usually handle mode changes via tab reload, but this is a fallback
            window.location.reload();
        }
    });

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => runReject());
        } else {
            runReject();
        }

        setTimeout(runReject, 500);
        setTimeout(runReject, 1500);
        setTimeout(runReject, 3000);
        setTimeout(runReject, 5000);

        observeDOM();
    }

    function recordKill() {
        if (actionTaken) return; // Only count once per page load to avoid spam
        actionTaken = true;

        chrome.storage.local.get(['totalBlocked'], (result) => {
            const count = (result.totalBlocked || 0) + 1;
            chrome.storage.local.set({ totalBlocked: count });
        });
    }

    // ─── Main Execution ──────────────────────────────────────────

    function runReject() {
        if (mode === 'PAUSED' || isWhitelisted) return;
        hasRun = true;

        if (tryCMPAPIs()) recordKill();
        if (tryClickButtons()) recordKill();

        // CSS matching for removal is highly effective, but we don't want to increment 
        // the counter just because a CSS rule matched something hidden. 
        // We track interactions for stats.
        tryRemoveBanners();
        fixBodyScroll();

        // Feature modules
        if (blockNewsletters) runNewsletterBlocker();
        if (blockNotifications) runNotificationBlocker();
        if (blockAutoplay) runAutoplayBlocker();
        if (removeStickyElements) runStickyRemover();
    }

    // ─── Strategy 1: CMP API Calls ───────────────────────────────

    function tryCMPAPIs() {
        // Inject a script into the page context to access CMP APIs.
        // We pass the mode so the injected script knows whether to Accept or Reject.
        const script = document.createElement('script');
        script.textContent = `(${inPageCMP.toString()})('${mode}');`;
        (document.head || document.documentElement).appendChild(script);
        script.remove();

        // Assume true if we ran it, though we can't easily get the return value from the isolated world synchronously
        // For stats, we'll err on the side of counting it if the script runs.
        return false;
    }

    function inPageCMP(currentMode) {
        let acted = false;
        try {
            // ── OneTrust ──
            if (typeof window.OneTrust !== 'undefined') {
                try {
                    currentMode === 'ACCEPT' ? window.OneTrust.AcceptAll() : window.OneTrust.RejectAll();
                    acted = true;
                } catch (e) { }
            }

            // ── Cookiebot ──
            if (typeof window.Cookiebot !== 'undefined') {
                try {
                    currentMode === 'ACCEPT' ? window.Cookiebot.submitCustomConsent(true, true, true) : window.Cookiebot.decline();
                    acted = true;
                } catch (e) { }
            }

            // ── Quantcast / TCF 2.0 ──
            if (typeof window.__tcfapi === 'function') {
                try {
                    window.__tcfapi('addEventListener', 2, function (tcData, success) {
                        if (success && (tcData.eventStatus === 'cmpuishown' || tcData.eventStatus === 'tcloaded')) {
                            const val = currentMode === 'ACCEPT';
                            // Note: fully simulating TCF accept/reject is complex, this is a simplified approach
                            window.__tcfapi('setConsent', 2, function () { }, {
                                purpose: { consents: {}, legitimateInterests: {} },
                                vendor: { consents: {}, legitimateInterests: {} }
                            });
                            acted = true;
                        }
                    });
                } catch (e) { }
            }

            // ── Didomi ──
            if (typeof window.Didomi !== 'undefined') {
                try {
                    currentMode === 'ACCEPT' ? window.Didomi.setUserAgreeToAll() : window.Didomi.setUserDisagreeToAll();
                    window.Didomi.notice && window.Didomi.notice.hide();
                    acted = true;
                } catch (e) { }
            }

            // ── Osano ──
            if (typeof window.Osano !== 'undefined' && window.Osano.cm) {
                try {
                    currentMode === 'ACCEPT' ? window.Osano.cm.acceptAll() : window.Osano.cm.denyAll();
                    acted = true;
                } catch (e) { }
            }

            // ── Google Consent Mode ──
            if (typeof window.gtag === 'function') {
                try {
                    const status = currentMode === 'ACCEPT' ? 'granted' : 'denied';
                    window.gtag('consent', 'update', {
                        'ad_storage': status,
                        'analytics_storage': status,
                        'functionality_storage': status,
                        'personalization_storage': status,
                        'security_storage': 'granted' // always grant security
                    });
                    acted = true;
                } catch (e) { }
            }
        } catch (e) { }
        return acted;
    }

    // ─── Strategy 2: Click Buttons ────────────────────────────────

    const REJECT_PATTERNS = [
        /reject\s*(all)?/i, /decline\s*(all)?/i, /deny\s*(all)?/i, /refuse\s*(all)?/i,
        /disagree/i, /no\s*,?\s*thanks/i, /only\s*essential/i, /essential\s*only/i,
        /strictly\s*necessary/i, /manage\s*preferences/i, /continue\s*without\s*(accepting|consent)/i,
        /alle\s*ablehnen/i, /tout\s*refuser/i, /rechazar\s*todo/i, /rifiuta\s*tutto/i, /alles\s*weigeren/i
    ];

    const ACCEPT_PATTERNS = [
        /accept\s*(all)?/i, /allow\s*(all)?/i, /agree\s*(all)?/i, /i\s*agree/i,
        /got\s*it/i, /ok/i, /understood/i, /yes\s*please/i, /consent/i,
        /alle\s*akzeptieren/i, /tout\s*accepter/i, /aceptar\s*todo/i, /accetta\s*tutto/i, /alles\s*accepteren/i
    ];

    const REJECT_SELECTORS = [
        '#onetrust-reject-all-handler', '[id*="reject"]', '[class*="reject"]',
        '.onetrust-close-btn-handler', '#CybotCookiebotDialogBodyButtonDecline',
        '#didomi-notice-disagree-button', '.cmplz-deny', '.cky-btn-reject', '.osano-cm-denyAll'
    ];

    const ACCEPT_SELECTORS = [
        '#onetrust-accept-btn-handler', '[id*="accept"]', '[class*="accept"]',
        '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', '#didomi-notice-agree-button',
        '.cmplz-accept', '.cky-btn-accept', '.osano-cm-acceptAll'
    ];

    function tryClickButtons() {
        const patterns = mode === 'ACCEPT' ? ACCEPT_PATTERNS : REJECT_PATTERNS;
        const selectors = mode === 'ACCEPT' ? ACCEPT_SELECTORS : REJECT_SELECTORS;

        let clicked = false;

        // 1. Try known selectors first
        for (const selector of selectors) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const btn of elements) {
                    if (isVisible(btn) && looksLikeCookieButton(btn)) {
                        btn.click();
                        clicked = true;
                    }
                }
            } catch (e) { }
        }

        if (clicked) return true;

        // 2. Try text matching
        const clickables = [
            ...document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"], .btn, [class*="button"]')
        ];

        for (const pattern of patterns) {
            for (const el of clickables) {
                if (pattern.test(getElementText(el)) && isVisible(el) && looksLikeCookieButton(el)) {
                    el.click();
                    return true;
                }
            }
        }

        // 3. Shadow DOM fallback
        return tryShadowDOMClick(patterns, selectors);
    }

    function tryShadowDOMClick(patterns, selectors) {
        let clicked = false;
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
            if (el.shadowRoot) {
                // Try selectors
                for (const selector of selectors) {
                    try {
                        const btn = el.shadowRoot.querySelector(selector);
                        if (btn && isVisible(btn)) {
                            btn.click();
                            clicked = true;
                        }
                    } catch (e) { }
                }

                // Try text
                const clickables = el.shadowRoot.querySelectorAll('button, a, [role="button"]');
                for (const pattern of patterns) {
                    for (const btn of clickables) {
                        if (pattern.test(getElementText(btn)) && isVisible(btn)) {
                            btn.click();
                            clicked = true;
                        }
                    }
                }
            }
        }
        return clicked;
    }

    // ─── Strategy 3: Remove/hide remaining banners ────────────────

    const BANNER_SELECTORS = [
        '#onetrust-consent-sdk', '#onetrust-banner-sdk', '#CybotCookiebotDialog',
        '#qc-cmp2-container', '.fc-consent-root', '#fc-dialog-container',
        '#truste-consent-track', '#didomi-host', '.osano-cm-window',
        '#iubenda-cs-banner', '#cookie-notice', '.cc-window',
        '[class*="cookie-banner"]', '[class*="consent-banner"]', '[id*="cookie-banner"]'
    ];

    function tryRemoveBanners() {
        for (const selector of BANNER_SELECTORS) {
            try {
                document.querySelectorAll(selector).forEach((el) => {
                    if (isRealBanner(el)) {
                        el.style.display = 'none';
                        el.style.visibility = 'hidden';
                        el.style.opacity = '0';
                        el.style.pointerEvents = 'none';
                        el.style.height = '0';
                    }
                });
            } catch (e) { }
        }

        // Remove overlay/backdrops
        document.querySelectorAll('[class*="overlay"], [class*="backdrop"]').forEach((el) => {
            if (isCookieOverlay(el)) el.style.display = 'none';
        });
    }

    // ─── Fix scroll locks ────────────────────────────────────────

    function fixBodyScroll() {
        const body = document.body;
        if (!body) return;

        const scrollLockClasses = [
            'cookie-modal-open', 'cookie-consent-active', 'has-cookie-banner',
            'no-scroll', 'modal-open', 'overflow-hidden', 'body-locked', 'sp-message-open'
        ];

        scrollLockClasses.forEach((cls) => {
            body.classList.remove(cls);
            document.documentElement.classList.remove(cls);
        });

        if (body.style.overflow === 'hidden' || body.style.position === 'fixed') {
            body.style.overflow = '';
            body.style.position = '';
        }
    }

    // ─── MutationObserver ────────────────────────────────────────

    function observeDOM() {
        const observer = new MutationObserver((mutations) => {
            if (mode === 'PAUSED' || isWhitelisted) return;
            let shouldRun = false;

            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE && looksLikeCookieBanner(node)) {
                        shouldRun = true;
                        break;
                    }
                }
                if (shouldRun) break;
            }

            if (shouldRun) {
                // Re-run immediately then again slightly delayed
                runReject();
                setTimeout(runReject, 150);
            }
        });

        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    // ─── Utility functions ───────────────────────────────────────

    function getElementText(el) {
        return (el.textContent || el.innerText || el.value || el.getAttribute('aria-label') || '').trim();
    }

    function isVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && el.offsetWidth > 0 && el.offsetHeight > 0);
    }

    function looksLikeCookieButton(el) {
        // Prevent clicking random buttons across the page
        const parent = el.closest(BANNER_SELECTORS.join(','));
        if (parent) return true;

        let ancestor = el.parentElement;
        let depth = 0;
        while (ancestor && depth < 6) {
            const str = (ancestor.id || '').toLowerCase() + ' ' + (ancestor.className || '').toString().toLowerCase();
            if (/cookie|consent|gdpr|privacy|cmp|notice|banner/.test(str)) return true;
            ancestor = ancestor.parentElement;
            depth++;
        }
        return false;
    }

    function looksLikeCookieBanner(el) {
        const str = (el.id || '').toLowerCase() + ' ' + (el.className || '').toString().toLowerCase();
        return /cookie|consent|gdpr|privacy|cmp|cookiebot|onetrust|didomi|osano/.test(str);
    }

    function isRealBanner(el) {
        // Sanity check before hiding broad selectors
        if (el.tagName === 'BODY' || el.tagName === 'HTML' || el.tagName === 'MAIN') return false;
        if (el.offsetHeight > window.innerHeight * 0.9 && el.offsetWidth > window.innerWidth * 0.9) {
            // Suspicious: might be blocking the whole page, but could be a full-screen wall.
            // Let's assume full screen walls have related IDs
            const str = (el.id || '').toLowerCase() + ' ' + (el.className || '').toString().toLowerCase();
            if (!/cookie|consent|gdpr|privacy|wall/.test(str)) return false;
        }
        return true;
    }

    function isCookieOverlay(el) {
        const str = (el.id || '').toLowerCase() + ' ' + (el.className || '').toString().toLowerCase();
        return /cookie|consent|gdpr|cmp|privacy/.test(str);
    }

    // ─── Newsletter Popup Blocker ────────────────────────────────

    const NEWSLETTER_SELECTORS = [
        // Newsletter popups
        '[class*="newsletter-popup"]', '[class*="newsletter-modal"]', '[class*="newsletter-overlay"]',
        '[class*="subscribe-popup"]', '[class*="subscribe-modal"]', '[class*="subscribe-overlay"]',
        '[class*="signup-modal"]', '[class*="signup-popup"]', '[class*="email-popup"]',
        '[class*="email-modal"]', '[class*="exit-intent"]', '[class*="exit-popup"]',
        '[class*="lead-capture"]', '[class*="optin-popup"]', '[class*="optin-modal"]',
        '[class*="mailing-list"]', '[class*="mailchimp-popup"]',
        '[id*="newsletter-popup"]', '[id*="newsletter-modal"]', '[id*="subscribe-popup"]',
        '[id*="subscribe-modal"]', '[id*="email-popup"]', '[id*="exit-intent"]',
        '[id*="optin-popup"]', '[id*="mailchimp-popup"]', '[id*="mc-popup"]', '[id*="klaviyo"]',
        '.klaviyo-popup', '.mc-modal', '.sumo-overlay', '.sumome-overlay',
        // Paywall / subscription walls
        '[class*="paywall"]', '[class*="subscribe-wall"]', '[class*="regwall"]',
        '[class*="meter-wall"]', '[class*="piano-"]', '[class*="pw-wall"]',
        '[class*="subscription-wall"]', '[class*="barrier-page"]', '[class*="gate-overlay"]',
        '[class*="access-wall"]', '[class*="premium-wall"]', '[class*="article-gate"]',
        '[id*="paywall"]', '[id*="regwall"]', '[id*="subscribe-wall"]',
        '[id*="piano-"]', '[id*="premium-gate"]', '[id*="access-gate"]',
        '[data-testid*="paywall"]', '[data-testid*="regwall"]',
        '.tp-modal', '.tp-backdrop', '.tp-iframe-wrapper', '.piano-offer',
        '.met-flyover', '.met-slot', '.fancybox-overlay'
    ];

    const NEWSLETTER_TEXT_PATTERNS = /subscribe|newsletter|mailing list|sign up for|join our|get updates|stay informed|don't miss|don.t miss|exclusive offer|special offer|weekly digest|inbox|signup for our/i;
    const PAYWALL_TEXT_PATTERNS = /unlimited access|subscribe to|subscription|first month|per month|per year|free trial|claim this offer|start your|become a member|member(ship)?\s*(for|at|plan)|reading limit|article limit|stories remaining|already a subscriber|create.*account.*to continue|sign in to continue|premium content|exclusive access|full access|unlock (this|full|all|the)|continue reading|read more articles/i;

    function runNewsletterBlocker() {
        // Strategy 1: Known selectors
        for (const selector of NEWSLETTER_SELECTORS) {
            try {
                document.querySelectorAll(selector).forEach((el) => {
                    hideNewsletterElement(el);
                });
            } catch (e) { }
        }

        // Strategy 2: Heuristic detection — newsletters + paywalls
        const allElements = document.querySelectorAll('div, section, aside, form');
        for (const el of allElements) {
            if (looksLikeNewsletterPopup(el) || looksLikePaywall(el)) {
                hideNewsletterElement(el);
            }
        }
    }

    function looksLikePaywall(el) {
        const style = window.getComputedStyle(el);
        const position = style.position;
        const zIndex = parseInt(style.zIndex, 10) || 0;

        // Must be a floating overlay with high z-index
        if (position !== 'fixed' && position !== 'absolute') return false;
        if (zIndex < 500) return false;

        // Must contain paywall/subscription text
        const text = (el.textContent || '').substring(0, 800);
        if (!PAYWALL_TEXT_PATTERNS.test(text)) return false;

        // Must be a significant overlay (not a tiny button)
        if (el.offsetHeight < 100 || el.offsetWidth < 200) return false;

        // Exclude cookie banners
        const str = (el.id || '').toLowerCase() + ' ' + (el.className || '').toString().toLowerCase();
        if (/cookie|consent|gdpr|privacy/.test(str)) return false;

        return true;
    }

    function looksLikeNewsletterPopup(el) {
        const style = window.getComputedStyle(el);
        const position = style.position;
        const zIndex = parseInt(style.zIndex, 10) || 0;

        // Must be a floating overlay
        if (position !== 'fixed' && position !== 'absolute') return false;
        if (zIndex < 999) return false;

        // Must contain an email input
        const hasEmailInput = el.querySelector(
            'input[type="email"], input[placeholder*="email" i], input[name*="email" i]'
        );
        if (!hasEmailInput) return false;

        // Must contain newsletter-related text
        const text = (el.textContent || '').substring(0, 500); // Limit text scan for performance
        if (!NEWSLETTER_TEXT_PATTERNS.test(text)) return false;

        // Exclude cookie banners (don't double-hide)
        const str = (el.id || '').toLowerCase() + ' ' + (el.className || '').toString().toLowerCase();
        if (/cookie|consent|gdpr|privacy/.test(str)) return false;

        return true;
    }

    function hideNewsletterElement(el) {
        if (!el || el.tagName === 'BODY' || el.tagName === 'HTML') return;
        el.style.display = 'none';
        el.style.visibility = 'hidden';
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        el.style.height = '0';

        // Also hide any associated backdrop/overlay siblings
        const parent = el.parentElement;
        if (parent) {
            parent.querySelectorAll('[class*="overlay"], [class*="backdrop"], [class*="mask"]').forEach((bg) => {
                if (bg !== el && bg.tagName !== 'BODY') {
                    bg.style.display = 'none';
                }
            });
        }

        // Fix body scroll if newsletter popup locked it
        if (document.body.style.overflow === 'hidden') {
            document.body.style.overflow = '';
        }
    }

    // ─── Notification Permission Blocker ─────────────────────────

    const NOTIFICATION_SELECTORS = [
        '[class*="notification-prompt"]', '[class*="push-notification"]', '[class*="web-push"]',
        '[class*="push-prompt"]', '[class*="bell-prompt"]', '[class*="push-subscribe"]',
        '[class*="push-modal"]', '[class*="notification-modal"]', '[class*="notification-bar"]',
        '[class*="browser-push"]', '[class*="onesignal"]',
        '[id*="push-prompt"]', '[id*="notification-prompt"]', '[id*="web-push"]',
        '[id*="onesignal"]', '[id*="push-notification"]',
        '#onesignal-slidedown-container', '#onesignal-bell-container',
        '.onesignal-customlink-container'
    ];

    const NOTIFICATION_TEXT_PATTERNS = /enable notifications|allow notifications|push notification|stay updated|never miss|get notified|turn on notifications|desktop notification|browser notification|bell icon/i;

    let notificationAPIOverridden = false;

    function runNotificationBlocker() {
        // Strategy 1: Override Notification API (only once)
        if (!notificationAPIOverridden) {
            overrideNotificationAPI();
            notificationAPIOverridden = true;
        }

        // Strategy 2: Hide custom notification prompt modals via selectors
        for (const selector of NOTIFICATION_SELECTORS) {
            try {
                document.querySelectorAll(selector).forEach((el) => {
                    hideNotificationElement(el);
                });
            } catch (e) { }
        }

        // Strategy 3: Heuristic detection
        const allElements = document.querySelectorAll('div, section, aside');
        for (const el of allElements) {
            if (looksLikeNotificationPrompt(el)) {
                hideNotificationElement(el);
            }
        }
    }

    function overrideNotificationAPI() {
        // Inject into page context to override the Notification API
        const script = document.createElement('script');
        script.textContent = `(function() {
            try {
                // Override Notification.requestPermission to auto-deny
                if (typeof Notification !== 'undefined') {
                    Notification.requestPermission = function() {
                        return Promise.resolve('denied');
                    };
                    // Override permission getter
                    Object.defineProperty(Notification, 'permission', {
                        get: function() { return 'denied'; },
                        configurable: true
                    });
                }
                // Override navigator.permissions.query for notifications
                if (navigator.permissions && navigator.permissions.query) {
                    const origQuery = navigator.permissions.query.bind(navigator.permissions);
                    navigator.permissions.query = function(desc) {
                        if (desc && desc.name === 'notifications') {
                            return Promise.resolve({ state: 'denied', onchange: null });
                        }
                        return origQuery(desc);
                    };
                }
            } catch(e) {}
        })();`;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
    }

    function looksLikeNotificationPrompt(el) {
        const style = window.getComputedStyle(el);
        const position = style.position;
        const zIndex = parseInt(style.zIndex, 10) || 0;

        if (position !== 'fixed' && position !== 'absolute') return false;
        if (zIndex < 999) return false;

        const text = (el.textContent || '').substring(0, 500);
        if (!NOTIFICATION_TEXT_PATTERNS.test(text)) return false;

        // Exclude cookie/newsletter banners
        const str = (el.id || '').toLowerCase() + ' ' + (el.className || '').toString().toLowerCase();
        if (/cookie|consent|gdpr|privacy|newsletter|subscribe/.test(str)) return false;

        return true;
    }

    function hideNotificationElement(el) {
        if (!el || el.tagName === 'BODY' || el.tagName === 'HTML') return;
        el.style.display = 'none';
        el.style.visibility = 'hidden';
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        el.style.height = '0';
    }

    // ─── Auto-play Video Stopper ─────────────────────────────────

    let autoplayObserverActive = false;

    function runAutoplayBlocker() {
        // Process existing media elements
        pauseAllAutoplay();

        // Watch for dynamically added media (only set up once)
        if (!autoplayObserverActive) {
            autoplayObserverActive = true;
            const mediaObserver = new MutationObserver((mutations) => {
                if (!blockAutoplay) return;
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType !== Node.ELEMENT_NODE) continue;
                        if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
                            handleMediaElement(node);
                        } else if (node.tagName === 'IFRAME') {
                            stripIframeAutoplay(node);
                        }
                        // Check children too
                        if (node.querySelectorAll) {
                            node.querySelectorAll('video, audio').forEach(handleMediaElement);
                            node.querySelectorAll('iframe').forEach(stripIframeAutoplay);
                        }
                    }
                }
            });
            mediaObserver.observe(document.documentElement, { childList: true, subtree: true });
        }
    }

    function pauseAllAutoplay() {
        // Handle <video> and <audio> elements
        document.querySelectorAll('video, audio').forEach(handleMediaElement);

        // Handle <iframe> embeds (YouTube, Vimeo, etc.)
        document.querySelectorAll('iframe').forEach(stripIframeAutoplay);
    }

    function handleMediaElement(media) {
        // Remove autoplay attribute
        media.removeAttribute('autoplay');
        media.setAttribute('preload', 'metadata');

        // Pause if currently playing
        if (!media.paused) {
            try { media.pause(); } catch (e) { }
        }

        // Track that we've processed this element so we don't spam it
        if (!media._autoplayHandled) {
            media._autoplayHandled = true;

            // Note: We intentionally do NOT attach an aggressive 'play' event 
            // listener here to constantly call .pause(), because doing so breaks 
            // legitimate manual playback via custom UI buttons (like YouTube's play button)
            // or keyboard shortcuts. Removing the 'autoplay' attribute and pausing on 
            // discovery is sufficient to stop 99% of annoying auto-playing videos.
        }
    }

    function stripIframeAutoplay(iframe) {
        try {
            const src = iframe.src || iframe.getAttribute('src') || '';
            if (!src) return;

            // Only modify video embed iframes
            if (!/youtube|vimeo|dailymotion|player/.test(src)) return;

            // Strip autoplay param
            if (/[?&]autoplay=1/.test(src)) {
                iframe.src = src.replace(/([?&])autoplay=1/, '$1autoplay=0');
            }

            // Add autoplay=0 if not present
            if (!/autoplay/.test(iframe.src)) {
                const separator = iframe.src.includes('?') ? '&' : '?';
                iframe.src = iframe.src + separator + 'autoplay=0';
            }

            // Remove allow="autoplay" attribute
            const allow = iframe.getAttribute('allow') || '';
            if (allow.includes('autoplay')) {
                iframe.setAttribute('allow', allow.replace(/autoplay\s*;?\s*/g, '').trim());
            }
        } catch (e) { }
    }

    // ─── Sticky Element Remover ──────────────────────────────────

    const WIDGET_SELECTORS = [
        '[class*="chat-widget"]', '[class*="chat-button"]', '[class*="chat-launcher"]',
        '[class*="intercom"]', '[id*="intercom"]',
        '[class*="drift-"]', '[id*="drift-"]',
        '[class*="crisp-"]', '[id*="crisp-"]',
        '[class*="tawk-"]', '[id*="tawk-"]',
        '[class*="zendesk"]', '[id*="zendesk"]', '#launcher',
        '[class*="freshdesk"]', '[id*="freshdesk"]',
        '[class*="livechat"]', '[id*="livechat"]',
        '[class*="hubspot"]', '[id*="hubspot-messages"]',
        '[class*="fb-customerchat"]', '.fb_dialog',
        '[class*="olark"]', '[id*="olark"]',
        '[class*="helpshift"]', '[id*="helpshift"]',
        '[class*="tidio"]', '[id*="tidio"]',
        '[class*="smartsupp"]', '[id*="smartsupp"]'
    ];

    const STICKY_TEXT_PATTERNS = /chat with us|need help\?|how can we help|live chat|support chat|download our app|install our app|get the app|follow us|share this/i;

    function runStickyRemover() {
        // Strategy 1: Known widget selectors
        for (const selector of WIDGET_SELECTORS) {
            try {
                document.querySelectorAll(selector).forEach((el) => {
                    hideStickyElement(el);
                });
            } catch (e) { }
        }

        // Strategy 2: Heuristic — scan fixed/sticky elements
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
            if (looksLikeStickyWidget(el)) {
                hideStickyElement(el);
            }
        }
    }

    function looksLikeStickyWidget(el) {
        const style = window.getComputedStyle(el);
        const position = style.position;

        if (position !== 'fixed' && position !== 'sticky') return false;

        // Exclude navigation and headers
        const tag = el.tagName.toLowerCase();
        if (tag === 'header' || tag === 'nav') return false;

        const str = (el.id || '').toLowerCase() + ' ' + (el.className || '').toString().toLowerCase();
        const role = (el.getAttribute('role') || '').toLowerCase();

        // Exclude elements that look like navigation
        if (/nav|navigation|menu|toolbar|header/.test(str) || /navigation|banner|toolbar/.test(role)) return false;

        // Exclude cookie/consent banners (handled elsewhere)
        if (/cookie|consent|gdpr|privacy/.test(str)) return false;

        const rect = el.getBoundingClientRect();

        // If it spans the full width and is at the top, it's likely a navbar — skip
        if (rect.width > window.innerWidth * 0.8 && rect.top < 10) return false;

        // Floating button (small, bottom-right corner)
        if (rect.width < 80 && rect.height < 80 && rect.bottom > window.innerHeight - 150 && rect.right > window.innerWidth - 150) {
            return true;
        }

        // Small bar with widget-like text
        if (rect.height < 200) {
            const text = (el.textContent || '').substring(0, 300);
            if (STICKY_TEXT_PATTERNS.test(text)) return true;
        }

        return false;
    }

    function hideStickyElement(el) {
        if (!el || el.tagName === 'BODY' || el.tagName === 'HTML' || el.tagName === 'HEADER' || el.tagName === 'NAV') return;
        el.style.display = 'none';
        el.style.visibility = 'hidden';
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
    }

    // ─── Element Picker — Apply Hidden Elements ──────────────

    function applyHiddenElements() {
        chrome.storage.local.get(['hiddenElements'], (result) => {
            const hidden = result.hiddenElements || {};
            const selectors = hidden[currentDomain] || [];

            if (selectors.length === 0) return;

            // Inject a style tag for CSS-level hiding (works even before DOM ready)
            const style = document.createElement('style');
            style.id = '__picker-hidden-styles';
            style.textContent = selectors.map(s =>
                s + ' { display: none !important; visibility: hidden !important; }'
            ).join('\n');

            const inject = () => {
                if (document.head) {
                    document.head.appendChild(style);
                } else {
                    document.documentElement.appendChild(style);
                }
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', inject);
            } else {
                inject();
            }
        });
    }

})();
