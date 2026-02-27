/**
 * Cookie Reject — Content Script
 * 
 * Automatically rejects cookie consent banners using multiple strategies:
 *   1. Clicks "Reject All" / "Decline" / "Essential Only" buttons
 *   2. Calls CMP framework APIs (OneTrust, Cookiebot, Quantcast, etc.)
 *   3. Removes/hides remaining banners from the DOM
 *   4. Uses MutationObserver to catch dynamically loaded banners
 */

(function () {
    'use strict';

    let isEnabled = true;
    let hasRun = false;

    // Check if extension is enabled
    chrome.storage.local.get(['enabled'], (result) => {
        isEnabled = result.enabled !== false; // default to enabled
        if (isEnabled) {
            init();
        }
    });

    // Listen for toggle messages from popup/background
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'toggle') {
            isEnabled = message.enabled;
            if (isEnabled && !hasRun) {
                init();
            }
        }
    });

    function init() {
        // Run immediately if DOM is ready, otherwise wait
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => runReject());
        } else {
            runReject();
        }

        // Also run after a delay for late-loading banners
        setTimeout(runReject, 500);
        setTimeout(runReject, 1500);
        setTimeout(runReject, 3000);
        setTimeout(runReject, 5000);

        // Watch for dynamically added banners
        observeDOM();
    }

    // ─── Main reject function ────────────────────────────────────

    function runReject() {
        if (!isEnabled) return;
        hasRun = true;

        tryRejectCMPAPIs();
        tryClickRejectButtons();
        tryRemoveBanners();
        fixBodyScroll();
    }

    // ─── Strategy 1: CMP API Calls ───────────────────────────────

    function tryRejectCMPAPIs() {
        // Inject a script into the page context to access CMP APIs
        const script = document.createElement('script');
        script.textContent = `(${inPageReject.toString()})();`;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
    }

    function inPageReject() {
        try {
            // ── OneTrust ──
            if (typeof window.OneTrust !== 'undefined') {
                try { window.OneTrust.RejectAll(); } catch (e) { }
            }
            if (typeof window.OptanonWrapper !== 'undefined') {
                try {
                    window.Optanon && window.Optanon.RejectAll && window.Optanon.RejectAll();
                } catch (e) { }
            }

            // ── Cookiebot ──
            if (typeof window.Cookiebot !== 'undefined') {
                try { window.Cookiebot.decline(); } catch (e) { }
            }
            if (typeof window.CookieConsent !== 'undefined' && window.CookieConsent.decline) {
                try { window.CookieConsent.decline(); } catch (e) { }
            }

            // ── Quantcast / TCF 2.0 ──
            if (typeof window.__tcfapi === 'function') {
                try {
                    window.__tcfapi('addEventListener', 2, function (tcData, success) {
                        if (success && (tcData.eventStatus === 'cmpuishown' || tcData.eventStatus === 'tcloaded')) {
                            // Try to set all purposes to false
                            window.__tcfapi('setConsent', 2, function () { }, {
                                purpose: { consents: {}, legitimateInterests: {} },
                                vendor: { consents: {}, legitimateInterests: {} }
                            });
                        }
                    });
                } catch (e) { }
            }

            // ── Didomi ──
            if (typeof window.Didomi !== 'undefined') {
                try {
                    window.Didomi.setUserDisagreeToAll();
                } catch (e) { }
                try {
                    window.Didomi.notice && window.Didomi.notice.hide();
                } catch (e) { }
            }

            // ── Osano ──
            if (typeof window.Osano !== 'undefined' && window.Osano.cm) {
                try {
                    window.Osano.cm.denyAll();
                } catch (e) { }
            }

            // ── Iubenda ──
            if (typeof window._iub !== 'undefined' && window._iub.cs) {
                try {
                    window._iub.cs.api && window._iub.cs.api.rejectAll();
                } catch (e) { }
            }

            // ── Google Consent Mode — set denied ──
            if (typeof window.gtag === 'function') {
                try {
                    window.gtag('consent', 'update', {
                        'ad_storage': 'denied',
                        'analytics_storage': 'denied',
                        'functionality_storage': 'denied',
                        'personalization_storage': 'denied',
                        'security_storage': 'granted'
                    });
                } catch (e) { }
            }

            // ── Klaro ──
            if (typeof window.klaro !== 'undefined') {
                try {
                    window.klaro.getManager().changeAll(false);
                    window.klaro.getManager().saveAndApplyConsents();
                } catch (e) { }
            }

            // ── CookieYes ──
            if (typeof window.ckyBannerController !== 'undefined') {
                try {
                    window.ckyBannerController.reject();
                } catch (e) { }
            }

            // ── Complianz ──
            if (typeof window.complianz !== 'undefined') {
                try {
                    window.complianz.deny_all();
                } catch (e) { }
            }

        } catch (e) {
            // silently fail
        }
    }

    // ─── Strategy 2: Click reject buttons ────────────────────────

    const REJECT_TEXT_PATTERNS = [
        // English
        /reject\s*(all)?/i,
        /decline\s*(all)?/i,
        /deny\s*(all)?/i,
        /refuse\s*(all)?/i,
        /disagree/i,
        /no\s*,?\s*thanks/i,
        /only\s*essential/i,
        /essential\s*only/i,
        /necessary\s*only/i,
        /only\s*necessary/i,
        /strictly\s*necessary/i,
        /manage\s*preferences/i,     // fallback – opens settings
        /cookie\s*settings/i,         // fallback
        /do\s*not\s*(accept|consent|agree)/i,
        /opt[\s-]*out/i,
        /i\s*don'?t\s*agree/i,
        /not\s*accept/i,
        /dismiss/i,
        /close/i,
        /continue\s*without\s*(accepting|consent)/i,

        // German
        /alle\s*ablehnen/i,
        /ablehnen/i,
        /nur\s*notwendige/i,

        // French
        /tout\s*refuser/i,
        /refuser/i,
        /continuer\s*sans\s*accepter/i,

        // Spanish
        /rechazar\s*(todo|todas)?/i,
        /solo\s*las?\s*necesarias?/i,

        // Italian
        /rifiuta\s*(tutto|tutti)?/i,

        // Dutch
        /alles\s*weigeren/i,
        /weigeren/i,

        // Portuguese
        /rejeitar\s*(tudo)?/i,
    ];

    // Higher priority patterns (try these first)
    const PRIORITY_PATTERNS = [
        /reject\s*all/i,
        /decline\s*all/i,
        /deny\s*all/i,
        /refuse\s*all/i,
        /alle\s*ablehnen/i,
        /tout\s*refuser/i,
        /rechazar\s*todo/i,
        /rifiuta\s*tutto/i,
        /alles\s*weigeren/i,
        /rejeitar\s*tudo/i,
    ];

    // Known reject button selectors from popular CMPs
    const REJECT_SELECTORS = [
        // OneTrust
        '#onetrust-reject-all-handler',
        '.onetrust-close-btn-handler',
        'button.ot-pc-refuse-all-handler',

        // Cookiebot
        '#CybotCookiebotDialogBodyButtonDecline',
        '#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll',

        // Quantcast
        '.qc-cmp2-summary-buttons button[mode="secondary"]',
        'button.fc-cta-do-not-consent',
        'button.fc-button.fc-secondary-button',

        // TrustArc
        '.truste_popup_button[data-choice="deny"]',
        '#truste-consent-required',

        // Didomi
        '#didomi-notice-disagree-button',
        '.didomi-dismiss-button',

        // Cookie Notice
        '.cookie-notice-container .cn-decline',
        '#cookie-notice-decline',

        // Complianz
        '.cmplz-deny',
        '.cmplz-close',

        // CookieYes
        '.cky-btn-reject',

        // GDPR Cookie Compliance
        '.cc-deny',
        '.cc-dismiss',

        // Klaro
        '.klaro .cm-btn-decline',
        '.klaro .cn-decline',

        // Iubenda
        '.iubenda-cs-reject-btn',

        // Osano
        '.osano-cm-denyAll',
        '.osano-cm-dialog__close',

        // Generic patterns
        'button[data-action="reject"]',
        'button[data-action="deny"]',
        'button[data-action="decline"]',
        'a[data-action="reject"]',
        'a[data-action="deny"]',
        '[data-testid="cookie-reject"]',
        '[data-testid="reject-all"]',
        '[data-cy="cookie-reject"]',
        '[aria-label*="reject" i]',
        '[aria-label*="decline" i]',
        '[aria-label*="deny" i]',
    ];

    function tryClickRejectButtons() {
        // Step 1: Try known selectors first
        for (const selector of REJECT_SELECTORS) {
            try {
                const btn = document.querySelector(selector);
                if (btn && isVisible(btn)) {
                    btn.click();
                    return;
                }
            } catch (e) { }
        }

        // Step 2: Search for buttons/links by text content
        const clickables = [
            ...document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"], .btn, [class*="button"]')
        ];

        // Try priority (strongest) patterns first
        for (const pattern of PRIORITY_PATTERNS) {
            for (const el of clickables) {
                const text = getElementText(el);
                if (pattern.test(text) && isVisible(el) && looksLikeCookieButton(el)) {
                    el.click();
                    return;
                }
            }
        }

        // Then try all reject patterns
        for (const pattern of REJECT_TEXT_PATTERNS) {
            for (const el of clickables) {
                const text = getElementText(el);
                if (pattern.test(text) && isVisible(el) && looksLikeCookieButton(el)) {
                    el.click();
                    return;
                }
            }
        }

        // Step 3: Try shadow DOM roots
        tryShadowDOMReject();
    }

    function tryShadowDOMReject() {
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
            if (el.shadowRoot) {
                for (const selector of REJECT_SELECTORS) {
                    try {
                        const btn = el.shadowRoot.querySelector(selector);
                        if (btn && isVisible(btn)) {
                            btn.click();
                            return;
                        }
                    } catch (e) { }
                }

                // Text search in shadow DOM
                const clickables = el.shadowRoot.querySelectorAll('button, a, [role="button"]');
                for (const pattern of PRIORITY_PATTERNS) {
                    for (const btn of clickables) {
                        if (pattern.test(getElementText(btn)) && isVisible(btn)) {
                            btn.click();
                            return;
                        }
                    }
                }
            }
        }
    }

    // ─── Strategy 3: Remove/hide remaining banners ────────────────

    const BANNER_SELECTORS = [
        '#onetrust-consent-sdk',
        '#onetrust-banner-sdk',
        '#CybotCookiebotDialog',
        '#CybotCookiebotDialogBodyUnderlay',
        '#qc-cmp2-container',
        '.fc-consent-root',
        '#fc-dialog-container',
        '#truste-consent-track',
        '#trustarc-banner-container',
        '#consent_blackbar',
        '#didomi-host',
        '#didomi-popup',
        '.osano-cm-window',
        '.osano-cm-dialog',
        '#iubenda-cs-banner',
        '#cookie-notice',
        '#cookie-law-info-bar',
        '.cc-window',
        '.cc-banner',
        '.cookie-consent',
        '.cookie-banner',
        '.cookie-popup',
        '.cookie-overlay',
        '.cookie-modal',
        '.consent-banner',
        '.consent-popup',
        '.consent-modal',
        '.gdpr-banner',
        '.gdpr-popup',
        '.privacy-banner',
        '#cookie-consent',
        '#cookie-banner',
        '#cookie-popup',
        '#consent-banner',
        '#gdpr-banner',
        '.cky-consent-container',
        '.klaro',
    ];

    function tryRemoveBanners() {
        for (const selector of BANNER_SELECTORS) {
            try {
                document.querySelectorAll(selector).forEach((el) => {
                    el.style.display = 'none';
                    el.style.visibility = 'hidden';
                    el.style.opacity = '0';
                    el.style.pointerEvents = 'none';
                    el.style.height = '0';
                    el.style.overflow = 'hidden';
                    el.setAttribute('aria-hidden', 'true');
                });
            } catch (e) { }
        }

        // Remove overlay/backdrops
        document.querySelectorAll('[class*="overlay"], [class*="backdrop"]').forEach((el) => {
            if (isCookieOverlay(el)) {
                el.style.display = 'none';
            }
        });
    }

    // ─── Fix scroll locks ────────────────────────────────────────

    function fixBodyScroll() {
        const html = document.documentElement;
        const body = document.body;
        if (!body) return;

        // Remove classes that lock scrolling
        const scrollLockClasses = [
            'cookie-modal-open', 'cookie-consent-active', 'has-cookie-banner',
            'no-scroll', 'modal-open', 'overflow-hidden', 'body-locked',
            'sp-message-open', 'didomi-popup-open'
        ];

        scrollLockClasses.forEach((cls) => {
            body.classList.remove(cls);
            html.classList.remove(cls);
        });

        // Reset inline overflow styles that banners sometimes set
        if (body.style.overflow === 'hidden' || body.style.position === 'fixed') {
            body.style.overflow = '';
            body.style.position = '';
            body.style.top = '';
            body.style.width = '';
        }
        if (html.style.overflow === 'hidden') {
            html.style.overflow = '';
        }
    }

    // ─── MutationObserver — catch late/dynamic banners ───────────

    function observeDOM() {
        const observer = new MutationObserver((mutations) => {
            if (!isEnabled) return;
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
                // Small delay to let the banner fully render
                setTimeout(runReject, 100);
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
    }

    // ─── Utility functions ───────────────────────────────────────

    function getElementText(el) {
        return (el.textContent || el.innerText || el.value || el.getAttribute('aria-label') || '').trim();
    }

    function isVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            el.offsetWidth > 0 &&
            el.offsetHeight > 0
        );
    }

    function looksLikeCookieButton(el) {
        // Check if the button is within or near a cookie-related container
        const parent = el.closest(BANNER_SELECTORS.join(','));
        if (parent) return true;

        // Check ancestor chain for cookie-related keywords
        let ancestor = el.parentElement;
        let depth = 0;
        while (ancestor && depth < 8) {
            const id = (ancestor.id || '').toLowerCase();
            const cls = (ancestor.className || '').toString().toLowerCase();
            if (
                /cookie|consent|gdpr|privacy|cmp|notice|banner|dialog/.test(id) ||
                /cookie|consent|gdpr|privacy|cmp|notice|banner|dialog/.test(cls)
            ) {
                return true;
            }
            ancestor = ancestor.parentElement;
            depth++;
        }

        return false;
    }

    function looksLikeCookieBanner(el) {
        const id = (el.id || '').toLowerCase();
        const cls = (el.className || '').toString().toLowerCase();
        const tag = el.tagName;

        return (
            /cookie|consent|gdpr|privacy|cmp|cookiebot|onetrust|didomi|osano|truste|iubenda/.test(id) ||
            /cookie|consent|gdpr|privacy|cmp|cookiebot|onetrust|didomi|osano|truste|iubenda/.test(cls) ||
            BANNER_SELECTORS.some((sel) => {
                try { return el.matches(sel); } catch (e) { return false; }
            })
        );
    }

    function isCookieOverlay(el) {
        const id = (el.id || '').toLowerCase();
        const cls = (el.className || '').toString().toLowerCase();
        return /cookie|consent|gdpr|cmp|privacy/.test(id + cls);
    }

})();
