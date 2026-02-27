/**
 * Cookie Reject — Background Service Worker
 * 
 * Manages extension state (enabled/disabled) and badge UI.
 */

// Initialize default state on first install only
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // Only set default on fresh install, not on update/reload
        chrome.storage.local.set({ enabled: true });
        updateBadge(true);
    } else {
        // On update/reload, read existing state
        chrome.storage.local.get(['enabled'], (result) => {
            updateBadge(result.enabled !== false);
        });
    }
});

// Sync badge whenever storage changes (covers all sources of state change)
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enabled) {
        updateBadge(changes.enabled.newValue !== false);
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'toggle') {
        const enabled = message.enabled;
        chrome.storage.local.set({ enabled });
        updateBadge(enabled);

        // Notify all tabs of the change
        chrome.tabs.query({}, (tabs) => {
            for (const tab of tabs) {
                try {
                    chrome.tabs.sendMessage(tab.id, { type: 'toggle', enabled });
                } catch (e) {
                    // Tab might not have content script
                }
            }
        });

        sendResponse({ success: true });
    }

    if (message.type === 'getState') {
        chrome.storage.local.get(['enabled'], (result) => {
            sendResponse({ enabled: result.enabled !== false });
        });
        return true; // async response
    }
});

function updateBadge(enabled) {
    if (enabled) {
        chrome.action.setBadgeText({ text: 'ON' });
        chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
        chrome.action.setTitle({ title: 'Cookie Reject — Active' });
    } else {
        chrome.action.setBadgeText({ text: 'OFF' });
        chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
        chrome.action.setTitle({ title: 'Cookie Reject — Paused' });
    }
}

// Set badge on startup from stored state
chrome.storage.local.get(['enabled'], (result) => {
    updateBadge(result.enabled !== false);
});
