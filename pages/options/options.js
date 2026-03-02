(function () {
    'use strict';

    // UI Elements
    const optFormat = document.getElementById('imageFormat');
    const optPaper = document.getElementById('paperSize');
    const optDir = document.getElementById('downloadDirectory');
    const optSaveAs = document.getElementById('saveAs');
    const optAutoDown = document.getElementById('autoDownload');
    const optFitDocs = document.getElementById('fitToGoogleDocs');

    const permDownloads = document.getElementById('permDownloads');
    // We don't have a specific iframe permission to check, but let's wire up a basic toggle for show
    // In a real extension, you'd check something like chrome.permissions.contains({ origins: ["<all_urls>"] })
    const permIframe = document.getElementById('permIframe');

    // Load Settings
    chrome.storage.local.get({
        imageFormat: 'png',
        paperSize: 'letter',
        downloadDirectory: '',
        saveAs: false,
        autoDownload: false,
        fitToGoogleDocs: true
    }, (items) => {
        optFormat.value = items.imageFormat;
        optPaper.value = items.paperSize;
        optDir.value = items.downloadDirectory;
        optSaveAs.checked = items.saveAs;
        optAutoDown.checked = items.autoDownload;
        optFitDocs.checked = items.fitToGoogleDocs;
    });

    // Save Settings
    function saveSetting(key, val) {
        chrome.storage.local.set({ [key]: val });
    }

    optFormat.addEventListener('change', (e) => saveSetting('imageFormat', e.target.value));
    optPaper.addEventListener('change', (e) => saveSetting('paperSize', e.target.value));

    // Directory - sanitize input
    optDir.addEventListener('input', (e) => {
        let val = e.target.value.replace(/[^a-zA-Z0-9\-_/]/g, '');
        if (val !== e.target.value) {
            e.target.value = val;
        }
    });
    optDir.addEventListener('change', (e) => saveSetting('downloadDirectory', e.target.value));

    optSaveAs.addEventListener('change', (e) => saveSetting('saveAs', e.target.checked));
    optAutoDown.addEventListener('change', (e) => saveSetting('autoDownload', e.target.checked));
    optFitDocs.addEventListener('change', (e) => saveSetting('fitToGoogleDocs', e.target.checked));

    // Handle Permissions
    function updatePermissionsUI() {
        chrome.permissions.contains({ permissions: ['downloads'] }, (hasPerm) => {
            permDownloads.checked = hasPerm;
        });

        // For demonstration, just bind iframe permission checkbox to an origin request
        chrome.permissions.contains({ origins: ['*://*/*'] }, (hasPerm) => {
            permIframe.checked = hasPerm;
        });
    }

    updatePermissionsUI();

    permDownloads.addEventListener('change', (e) => {
        if (e.target.checked) {
            chrome.permissions.request({ permissions: ['downloads'] }, (granted) => {
                if (!granted) e.target.checked = false;
            });
        } else {
            chrome.permissions.remove({ permissions: ['downloads'] }, (removed) => {
                if (!removed) e.target.checked = true;
            });
        }
    });

    permIframe.addEventListener('change', (e) => {
        if (e.target.checked) {
            chrome.permissions.request({ origins: ['*://*/*'] }, (granted) => {
                if (!granted) e.target.checked = false;
            });
        } else {
            chrome.permissions.remove({ origins: ['*://*/*'] }, (removed) => {
                if (!removed) e.target.checked = true;
            });
        }
    });

    // Sidebar Navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            // Normally would switch content views here
        });
    });

})();
