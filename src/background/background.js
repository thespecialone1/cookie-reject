/**
 * Cookie Reject v2.0 — Background Service Worker
 * 
 * Manages extension state (mode, whitelist, stats) and contextual badge UI.
 */

// Initialize default state on first install
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.storage.local.set({
            mode: 'REJECT',
            whitelistedDomains: [],
            totalBlocked: 0,
            blockNewsletters: true,
            blockNotifications: true,
            blockAutoplay: true,
            removeStickyElements: true,
            showLyrics: true
        });
        console.log("[Cookie Reject] Default settings initialized.");
    } else {
        // Migrate from v1 if needed
        chrome.storage.local.get(['enabled', 'mode'], (result) => {
            if (!result.mode) {
                const mode = result.enabled === false ? 'PAUSED' : 'REJECT';
                chrome.storage.local.set({ mode });
                chrome.storage.local.remove('enabled');
            }
        });
    }
    updateBadgeForActiveTab();
});

// Sync badge whenever storage changes
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.mode || changes.whitelistedDomains)) {
        updateBadgeForActiveTab();
    }
});

// Update badge when switching tabs or when a tab updates URL
chrome.tabs.onActivated.addListener(() => {
    updateBadgeForActiveTab();
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
        updateBadgeForTab(tab);
    }
});

function updateBadgeForActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            updateBadgeForTab(tabs[0]);
        }
    });
}

function updateBadgeForTab(tab) {
    if (!tab || !tab.url) return;

    chrome.storage.local.get(['mode', 'whitelistedDomains'], (result) => {
        const mode = result.mode || 'REJECT';
        const whitelistedDomains = result.whitelistedDomains || [];

        let domain = '';
        try {
            domain = new URL(tab.url).hostname;
        } catch (e) {
            // Invalid URL (like chrome:// new tab)
        }

        const isWhitelisted = domain && whitelistedDomains.includes(domain);

        if (mode === 'PAUSED' || isWhitelisted) {
            // Inactive Context
            chrome.action.setBadgeText({ text: 'OFF', tabId: tab.id });
            chrome.action.setBadgeBackgroundColor({ color: '#5f6368', tabId: tab.id }); // Google Gray
        } else if (mode === 'ACCEPT') {
            // Accept Mode
            chrome.action.setBadgeText({ text: 'YES', tabId: tab.id });
            chrome.action.setBadgeBackgroundColor({ color: '#137333', tabId: tab.id }); // Google Green
        } else {
            // Reject Mode (Default)
            chrome.action.setBadgeText({ text: 'ON', tabId: tab.id });
            chrome.action.setBadgeBackgroundColor({ color: '#1a73e8', tabId: tab.id }); // Google Blue
        }
    });
}

// ─── Screenshot Tool ────────────────────────────────────────────

let pendingCapture = null; // { captures, width, height, viewportHeight, sourceUrl, singleImage }

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'captureVisible') {
        handleVisibleCapture(message.tabId);
        sendResponse({ success: true });
    } else if (message.type === 'captureFullPage') {
        handleFullPageCapture(message.tabId);
        sendResponse({ success: true });
    } else if (message.type === 'captureElement') {
        // Here, the message comes from the content script, so sender.tab exists
        const tabId = sender.tab ? sender.tab.id : message.tabId;
        if (tabId) handleElementCapture(tabId, message.rect);
        sendResponse({ success: true });
    } else if (message.type === 'activatePicker') {
        chrome.scripting.executeScript({
            target: { tabId: message.tabId },
            files: ['src/content/picker.js']
        });
        sendResponse({ success: true });
    } else if (message.type === 'getHiddenElements') {
        chrome.storage.local.get(['hiddenElements'], (result) => {
            const hidden = result.hiddenElements || {};
            sendResponse({ selectors: hidden[message.domain] || [] });
        });
        return true;
    } else if (message.type === 'removeHiddenElement') {
        chrome.storage.local.get(['hiddenElements'], (result) => {
            const hidden = result.hiddenElements || {};
            if (hidden[message.domain]) {
                hidden[message.domain] = hidden[message.domain].filter(s => s !== message.selector);
                if (hidden[message.domain].length === 0) delete hidden[message.domain];
                chrome.storage.local.set({ hiddenElements: hidden }, () => {
                    sendResponse({ success: true });
                });
            } else {
                sendResponse({ success: false });
            }
        });
        return true;
    } else if (message.type === 'openDownloader') {
        let urlParam = '?url=' + encodeURIComponent(message.url);
        if (message.start) urlParam += '&start=' + encodeURIComponent(message.start);
        if (message.end) urlParam += '&end=' + encodeURIComponent(message.end);
        chrome.tabs.create({ url: chrome.runtime.getURL('pages/downloader/downloader.html') + urlParam });
        sendResponse({ success: true });
    } else if (message.type === 'openDownloadsFolder') {
        if (nativeHost) {
            nativeHost.postMessage({ action: 'open_downloads' });
        }
        sendResponse({ success: true });
    } else if (message.type === 'fetchLyrics') {
        const query = encodeURIComponent(`${message.title} ${message.artist}`);
        fetch(`https://lrclib.net/api/search?q=${query}`)
            .then(res => {
                if (!res.ok) throw new Error('LRCLIB API HTTP Error');
                return res.json();
            })
            .then(data => {
                const bestMatch = data.find(song => song.syncedLyrics) || data[0];
                if (bestMatch && bestMatch.syncedLyrics) {
                    sendResponse({ lyrics: bestMatch.syncedLyrics });
                } else {
                    sendResponse({ error: 'No synced lyrics found' });
                }
            })
            .catch(err => {
                console.error('[Cookie Reject] LRCLIB Fetch Error:', err);
                sendResponse({ error: err.toString() });
            });
        return true; // Keep message channel open for async fetch
    }
    return true;
});

// ─── Universal Downloader Native Host ─────────────────────────

let nativeHost = null;
let uiPorts = [];

function getNativeHost() {
    if (!nativeHost) {
        try {
            nativeHost = chrome.runtime.connectNative('com.cookie_reject.ytdlp');
            nativeHost.onMessage.addListener((msg) => {
                for (let port of uiPorts) {
                    if (msg.status === 'started' || msg.status === 'progress' || msg.status === 'completed' || msg.error) {
                        port.postMessage({
                            type: msg.error ? 'task_error' : (msg.status === 'completed' ? 'task_completed' : 'task_progress'),
                            taskId: msg.taskId,
                            line: msg.line || msg.message,
                            code: msg.code,
                            error: msg.error
                        });
                    }
                }
            });
            nativeHost.onDisconnect.addListener(() => {
                const errorMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Unknown error';
                console.error("Native host disconnected:", errorMsg);
                nativeHost = null;
                for (let port of uiPorts) {
                    port.postMessage({ type: 'host_status', connected: false });
                    // Inform the UI to fail any active 'Starting...' tasks
                    port.postMessage({ type: 'host_disconnected', error: errorMsg });
                }
            });
        } catch (e) {
            console.error('Failed to connect to native host', e);
        }
    }
    return nativeHost;
}

// Port-based transfer: preview page connects and requests data
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'screenshot') {
        port.onMessage.addListener((msg) => {
            if (msg.type === 'ready') {
                if (pendingCapture) {
                    // Send metadata first
                    port.postMessage({
                        type: 'meta',
                        width: pendingCapture.width,
                        height: pendingCapture.height,
                        viewportHeight: pendingCapture.viewportHeight,
                        singleImage: pendingCapture.singleImage,
                        cropRect: pendingCapture.cropRect || null,
                        totalSlices: pendingCapture.captures.length
                    });

                    // Send each capture one at a time
                    for (const slice of pendingCapture.captures) {
                        port.postMessage({ type: 'slice', ...slice });
                    }

                    // Signal done
                    port.postMessage({ type: 'done' });

                    // Clear stored data
                    pendingCapture = null;
                } else {
                    port.postMessage({ type: 'error', message: 'No screenshot data' });
                }
            }
        });
    } else if (port.name === 'ytdlp-ui') {
        uiPorts.push(port);

        port.onMessage.addListener((msg) => {
            if (msg.type === 'init') {
                const host = getNativeHost();
                port.postMessage({ type: 'host_status', connected: !!host });
            } else if (msg.type === 'start_download') {
                const host = getNativeHost();
                if (host) {
                    host.postMessage({
                        action: 'download',
                        taskId: msg.taskId,
                        url: msg.url,
                        command: msg.command
                    });
                } else {
                    port.postMessage({
                        type: 'task_error',
                        taskId: msg.taskId,
                        error: 'Native host not connected or not installed. Did you run install_mac.sh?'
                    });
                }
            }
        });

        port.onDisconnect.addListener(() => {
            uiPorts = uiPorts.filter(p => p !== port);
        });
    }
});

// ── Visible Screenshot ──

async function handleVisibleCapture(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        const dataUrl = await captureTab(tab.windowId);
        if (!dataUrl) return;

        pendingCapture = {
            captures: [{ dataUrl, y: 0, last: false, remainder: 0 }],
            width: 0,
            height: 0,
            viewportHeight: 0,
            singleImage: true,
            sourceUrl: tab.url || ''
        };

        openPreview(tab.url || '');
    } catch (err) {
        console.error('Visible capture failed:', err);
    }
}

// ── Element Capture ──

async function handleElementCapture(tabId, rect) {
    try {
        const tab = await chrome.tabs.get(tabId);
        const dataUrl = await captureTab(tab.windowId);
        if (!dataUrl) return;

        pendingCapture = {
            captures: [{ dataUrl, y: 0, last: false, remainder: 0 }],
            width: rect.width || 0,
            height: rect.height || 0,
            viewportHeight: 0,
            singleImage: true,
            cropRect: rect,
            sourceUrl: tab.url || ''
        };

        openPreview(tab.url || '');
    } catch (err) {
        console.error('Element capture failed:', err);
    }
}

// ── Full Page Screenshot ──

async function handleFullPageCapture(tabId) {
    try {
        await sleep(300); // Let popup close

        const tab = await chrome.tabs.get(tabId);
        const windowId = tab.windowId;

        // Disable smooth scrolling
        const [dims] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                document.documentElement.style.setProperty('scroll-behavior', 'auto', 'important');
                if (document.body) document.body.style.setProperty('scroll-behavior', 'auto', 'important');
                return {
                    sh: Math.max(document.body?.scrollHeight || 0, document.documentElement.scrollHeight || 0),
                    vh: window.innerHeight,
                    vw: window.innerWidth,
                    sx: window.scrollX,
                    sy: window.scrollY
                };
            }
        });

        const { sh, vh, vw, sx, sy } = dims.result;
        const maxH = Math.min(sh, 16000);
        const sliceCount = Math.min(Math.ceil(maxH / vh), 25);
        const captures = [];

        // Prepare an array to hold all hidden elements for restoration
        await chrome.scripting.executeScript({
            target: { tabId },
            func: () => { window.__ssHiddenFixed = []; }
        });

        for (let i = 0; i < sliceCount; i++) {
            const y = i * vh;

            await chrome.scripting.executeScript({
                target: { tabId },
                func: (scrollY) => window.scrollTo(0, scrollY),
                args: [y]
            });

            // Wait for JS to react to scroll (make elements sticky, load lazy images)
            await sleep(350);

            if (i > 0) {
                // Hide any currently visible fixed/sticky elements
                // Also catch wide absolute elements glued to the top (like Google's search bar)
                await chrome.scripting.executeScript({
                    target: { tabId },
                    func: () => {
                        const vw = window.innerWidth;
                        document.querySelectorAll('*').forEach(el => {
                            const cs = getComputedStyle(el);
                            const isFixedOrSticky = cs.position === 'fixed' || cs.position === 'sticky';

                            let isTopAbsolute = false;
                            if (cs.position === 'absolute') {
                                const rect = el.getBoundingClientRect();
                                // If it's absolute, glued to top of viewport, and stretches almost full width
                                if (rect.top <= 10 && rect.width >= vw * 0.8 && rect.height < window.innerHeight / 2) {
                                    isTopAbsolute = true;
                                }
                            }

                            if ((isFixedOrSticky || isTopAbsolute) && cs.visibility !== 'hidden' && cs.opacity !== '0') {
                                window.__ssHiddenFixed.push({ el, prev: el.style.cssText });
                                el.style.setProperty('visibility', 'hidden', 'important');
                                el.style.setProperty('opacity', '0', 'important');
                            }
                        });
                    }
                });
                await sleep(50); // Tiny wait to let hiding paint
            }

            // Use explicit windowId!
            let dataUrl = await captureTab(windowId);
            if (!dataUrl) {
                await sleep(500);
                dataUrl = await captureTab(windowId);
            }
            if (!dataUrl) continue;

            captures.push({
                dataUrl,
                y,
                last: (i === sliceCount - 1),
                remainder: maxH - y
            });
        }

        // Restore fixed/sticky elements + scroll + CSS
        await chrome.scripting.executeScript({
            target: { tabId },
            func: (x, y) => {
                // Restore hidden elements
                if (window.__ssHiddenFixed) {
                    for (const item of window.__ssHiddenFixed) {
                        item.el.style.cssText = item.prev;
                    }
                    delete window.__ssHiddenFixed;
                }
                window.scrollTo(x, y);
                document.documentElement.style.removeProperty('scroll-behavior');
                if (document.body) document.body.style.removeProperty('scroll-behavior');
            },
            args: [sx, sy]
        });

        if (captures.length === 0) {
            handleVisibleCapture(tabId);
            return;
        }

        pendingCapture = {
            captures,
            width: vw,
            height: maxH,
            viewportHeight: vh,
            singleImage: false,
            sourceUrl: tab.url || ''
        };

        openPreview(tab.url || '');

    } catch (err) {
        console.error('Full page capture failed:', err);
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    if (window.__ssHiddenFixed) {
                        for (const item of window.__ssHiddenFixed) {
                            item.el.style.cssText = item.prev;
                        }
                        delete window.__ssHiddenFixed;
                    }
                    document.documentElement.style.removeProperty('scroll-behavior');
                    if (document.body) document.body.style.removeProperty('scroll-behavior');
                }
            });
        } catch (e) { }
        handleVisibleCapture(tabId);
    }
}

function captureTab(windowId) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 5000);
        chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 85 }, (url) => {
            clearTimeout(timer);
            if (chrome.runtime.lastError || !url) {
                resolve(null);
            } else {
                resolve(url);
            }
        });
    });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function openPreview(sourceUrl) {
    const previewUrl = chrome.runtime.getURL('pages/screenshot/screenshot.html')
        + '?url=' + encodeURIComponent(sourceUrl);
    chrome.tabs.create({ url: previewUrl });
}

