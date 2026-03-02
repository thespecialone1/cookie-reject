/**
 * Cookie Reject v2.0 — Popup Script
 * Handles segmented control, domain whitelisting, and stats display.
 */

document.addEventListener('DOMContentLoaded', () => {
    const radioInputs = document.querySelectorAll('input[name="mode"]');
    const statusText = document.getElementById('status-text');
    const whitelistToggle = document.getElementById('whitelist-toggle');
    const currentDomainEl = document.getElementById('current-domain');
    const statsBlockedEl = document.getElementById('stats-blocked');
    const reportLink = document.getElementById('report-link');
    const newsletterToggle = document.getElementById('feature-newsletters');
    const notificationToggle = document.getElementById('feature-notifications');
    const autoplayToggle = document.getElementById('feature-autoplay');
    const stickyToggle = document.getElementById('feature-sticky');

    let activeDomain = '';

    // 1. Get current active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url) {
            try {
                const url = new URL(tabs[0].url);
                activeDomain = url.hostname;
                if (!url.protocol.startsWith('http')) {
                    activeDomain = ''; // Don't allow whitelisting chrome:// or file://
                }
            } catch (e) {
                activeDomain = '';
            }
        }

        if (activeDomain) {
            currentDomainEl.textContent = activeDomain;
            reportLink.href = `https://github.com/thespecialone1/cookie-reject/issues/new?title=Missed+Cookie+Banner+on+${activeDomain}&body=Please+fix+the+cookie+banner+on+https://${activeDomain}`;
            reportLink.target = "_blank";
        } else {
            currentDomainEl.textContent = 'this page';
            whitelistToggle.disabled = true;
            reportLink.style.display = 'none';
        }

        // 2. Load state
        chrome.storage.local.get(['mode', 'whitelistedDomains', 'totalBlocked', 'blockNewsletters', 'blockNotifications', 'blockAutoplay', 'removeStickyElements'], (result) => {
            const mode = result.mode || 'REJECT';
            const whitelistedDomains = result.whitelistedDomains || [];
            const totalBlocked = result.totalBlocked || 0;

            // Update Stats
            statsBlockedEl.textContent = `${totalBlocked.toLocaleString()} banner${totalBlocked !== 1 ? 's' : ''} blocked forever`;

            // Update Segmented Control
            document.querySelector(`input[name="mode"][value="${mode}"]`).checked = true;
            updateStatusText(mode);

            // Update Whitelist Toggle
            if (activeDomain) {
                whitelistToggle.checked = !whitelistedDomains.includes(activeDomain);
            }

            // Update Feature Toggles
            newsletterToggle.checked = result.blockNewsletters !== undefined ? result.blockNewsletters : true;
            notificationToggle.checked = result.blockNotifications !== undefined ? result.blockNotifications : true;
            autoplayToggle.checked = result.blockAutoplay !== undefined ? result.blockAutoplay : true;
            stickyToggle.checked = result.removeStickyElements !== undefined ? result.removeStickyElements : true;
        });

        // Load hidden elements for current domain
        if (activeDomain) {
            chrome.runtime.sendMessage({ type: 'getHiddenElements', domain: activeDomain }, (response) => {
                if (response && response.selectors && response.selectors.length > 0) {
                    renderHiddenList(response.selectors);
                }
            });
        }
    });

    // Handle Mode Change (Reject / Pause / Accept)
    radioInputs.forEach(input => {
        input.addEventListener('change', (e) => {
            const mode = e.target.value;
            updateStatusText(mode);
            chrome.storage.local.set({ mode }, reloadCurrentTab);
        });
    });

    // Handle Whitelist Toggle (Block banners on this site)
    whitelistToggle.addEventListener('change', (e) => {
        if (!activeDomain) return;

        // If toggle is CHECKED = Blocking banners on this site (remove from whitelist)
        // If toggle is UNCHECKED = Not blocking banners on this site (add to whitelist)
        const isBlocking = e.target.checked;

        chrome.storage.local.get(['whitelistedDomains'], (result) => {
            let domains = result.whitelistedDomains || [];

            if (isBlocking) {
                domains = domains.filter(d => d !== activeDomain);
            } else {
                if (!domains.includes(activeDomain)) {
                    domains.push(activeDomain);
                }
            }

            chrome.storage.local.set({ whitelistedDomains: domains }, reloadCurrentTab);
        });
    });

    // Handle Newsletter Toggle
    newsletterToggle.addEventListener('change', (e) => {
        chrome.storage.local.set({ blockNewsletters: e.target.checked }, reloadCurrentTab);
    });

    // Handle Notification Toggle
    notificationToggle.addEventListener('change', (e) => {
        chrome.storage.local.set({ blockNotifications: e.target.checked }, reloadCurrentTab);
    });

    // Handle Autoplay Toggle
    autoplayToggle.addEventListener('change', (e) => {
        chrome.storage.local.set({ blockAutoplay: e.target.checked }, reloadCurrentTab);
    });

    // Handle Sticky Toggle
    stickyToggle.addEventListener('change', (e) => {
        chrome.storage.local.set({ removeStickyElements: e.target.checked }, reloadCurrentTab);
    });

    // Handle Options Button (only if it exists)
    const btnOptions = document.getElementById('btn-options');
    if (btnOptions) {
        btnOptions.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('pages/options/options.html') });
        });
    }

    // Handle Screenshot Buttons
    document.getElementById('btn-screenshot-visible').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            chrome.runtime.sendMessage({ type: 'captureVisible', tabId: tabs[0].id });
            setTimeout(() => window.close(), 100);
        });
    });

    document.getElementById('btn-screenshot-full').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            chrome.runtime.sendMessage({ type: 'captureFullPage', tabId: tabs[0].id });
            setTimeout(() => window.close(), 100);
        });
    });

    // Handle Element Picker
    const btnPicker = document.getElementById('btn-pick-element');
    const hiddenListContainer = document.getElementById('hidden-elements-list');

    btnPicker.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0] || !tabs[0].url.startsWith('http')) {
                alert('The Magic Wand cannot be used on restricted browser pages (like New Tab, Extensions, or Settings). Please navigate to a normal website first.');
                return;
            }
            chrome.runtime.sendMessage({ type: 'activatePicker', tabId: tabs[0].id });
            window.close();
        });
    });

    const btnDownloader = document.getElementById('btn-open-downloader');
    if (btnDownloader) {
        btnDownloader.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                let urlParam = '';
                if (tabs[0] && tabs[0].url && tabs[0].url.startsWith('http')) {
                    urlParam = '?url=' + encodeURIComponent(tabs[0].url);
                }
                chrome.tabs.create({ url: chrome.runtime.getURL('pages/downloader/downloader.html') + urlParam });
                window.close();
            });
        });
    }

    function renderHiddenList(selectors) {
        hiddenListContainer.style.display = 'block';
        hiddenListContainer.innerHTML = '<div class="hidden-list-header">Hidden elements (' + selectors.length + ')</div>';

        selectors.forEach((selector) => {
            const item = document.createElement('div');
            item.className = 'hidden-item';

            const selectorSpan = document.createElement('span');
            selectorSpan.className = 'hidden-selector';
            selectorSpan.textContent = selector;
            selectorSpan.title = selector;

            const unhideBtn = document.createElement('button');
            unhideBtn.className = 'unhide-btn';
            unhideBtn.textContent = '✕';
            unhideBtn.title = 'Unhide this element';
            unhideBtn.addEventListener('click', () => {
                chrome.runtime.sendMessage({
                    type: 'removeHiddenElement',
                    domain: activeDomain,
                    selector: selector
                }, () => {
                    reloadCurrentTab();
                    item.remove();
                    // Update count
                    const remaining = hiddenListContainer.querySelectorAll('.hidden-item').length;
                    if (remaining === 0) {
                        hiddenListContainer.style.display = 'none';
                    } else {
                        hiddenListContainer.querySelector('.hidden-list-header').textContent =
                            'Hidden elements (' + remaining + ')';
                    }
                });
            });

            item.appendChild(selectorSpan);
            item.appendChild(unhideBtn);
            hiddenListContainer.appendChild(item);
        });
    }

    function updateStatusText(mode) {
        if (mode === 'REJECT') {
            statusText.textContent = 'Active (Rejecting)';
            statusText.style.color = '#a8c7fa'; // Google blue
        } else if (mode === 'ACCEPT') {
            statusText.textContent = 'Active (Accepting)';
            statusText.style.color = '#81c995'; // Google green
        } else {
            statusText.textContent = 'Paused Globally';
            statusText.style.color = '#9aa0a6'; // Google gray
        }
    }

    function reloadCurrentTab() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.reload(tabs[0].id);
            }
        });
    }
});
