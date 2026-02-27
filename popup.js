/**
 * Cookie Reject — Popup Script
 * Handles toggle switch and communicates with background service worker.
 */

document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggle');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    // Load current state — ask background for the authoritative state
    chrome.runtime.sendMessage({ type: 'getState' }, (response) => {
        if (chrome.runtime.lastError) {
            // Fallback to storage if background isn't ready
            chrome.storage.local.get(['enabled'], (result) => {
                const enabled = result.enabled !== false;
                toggle.checked = enabled;
                updateUI(enabled);
            });
            return;
        }
        const enabled = response && response.enabled !== false;
        toggle.checked = enabled;
        updateUI(enabled);
    });

    // Handle toggle — update UI immediately, then sync
    toggle.addEventListener('change', () => {
        const enabled = toggle.checked;

        // Update UI immediately (don't wait for callback)
        updateUI(enabled);

        // Persist to storage directly from popup too, for reliability
        chrome.storage.local.set({ enabled });

        // Send message to background to update badge
        chrome.runtime.sendMessage({ type: 'toggle', enabled }, () => {
            if (chrome.runtime.lastError) {
                // Background might not be ready, but storage is already set
                console.log('Background not ready, state saved to storage');
            }
        });

        // Reload the current tab to apply/remove the rejection
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.reload(tabs[0].id);
            }
        });
    });

    function updateUI(enabled) {
        if (enabled) {
            statusDot.classList.remove('inactive');
            statusText.textContent = 'Active';
            statusText.style.color = '#f5f5f7';
        } else {
            statusDot.classList.add('inactive');
            statusText.textContent = 'Paused';
            statusText.style.color = '#8e8e93';
        }
    }
});
