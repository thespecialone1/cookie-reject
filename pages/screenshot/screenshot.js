/**
 * Screenshot Preview Page
 * Connects to background via port, receives captures, stitches and displays.
 */
(function () {
    'use strict';

    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const status = document.getElementById('status');
    const statusText = document.getElementById('status-text');
    const sourceUrlEl = document.getElementById('source-url');
    const btnPng = document.getElementById('btn-png');
    const btnPdf = document.getElementById('btn-pdf');
    const btnDelete = document.getElementById('btn-delete');

    const btnFiles = document.getElementById('btn-files');
    const btnSettings = document.getElementById('btn-settings');
    const btnReport = document.getElementById('btn-report');

    // URLs and IDs
    const params = new URLSearchParams(window.location.search);
    const sourceUrl = params.get('url') || '';
    const shotId = params.get('id');

    function updateSourceUrlDisplay(urlStr) {
        if (!urlStr) return;
        try {
            const u = new URL(urlStr);
            sourceUrlEl.textContent = u.hostname + u.pathname;
            sourceUrlEl.title = urlStr;
        } catch (e) {
            sourceUrlEl.textContent = urlStr.substring(0, 80);
        }
    }

    if (sourceUrl) updateSourceUrlDisplay(sourceUrl);

    // Toolbar actions
    btnFiles.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('pages/files/files.html') });
    });

    btnSettings.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('pages/options/options.html') });
    });

    btnReport.addEventListener('click', () => {
        // Simple mailto for now, or could link to a form
        window.open('mailto:support@cookiereject.com?subject=Screenshot%20Issue', '_blank');
    });

    // Handle Initialization Mode
    if (shotId) {
        // VIEW MODE: Load existing from database
        loadFromDatabase(shotId);
    } else {
        // CAPTURE MODE: Connect to background via port
        startLiveCapture();
    }

    async function loadFromDatabase(id) {
        statusText.textContent = 'Loading screenshot...';
        try {
            const shot = await window.screenshotDB.getScreenshot(id);
            if (!shot) throw new Error('Screenshot not found');

            updateSourceUrlDisplay(shot.sourceUrl);
            const img = await loadImage(shot.dataUrl);

            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0);

            finalize(false); // don't re-save to db
        } catch (e) {
            console.error(e);
            statusText.textContent = 'Failed to load screenshot.';
            status.querySelector('.spinner')?.remove();
        }
    }

    // ── Live Capture Mode ──

    let meta = null;
    let sliceQueue = [];
    let drawing = false;

    function startLiveCapture() {
        const port = chrome.runtime.connect({ name: 'screenshot' });

        port.onMessage.addListener((msg) => {
            if (msg.type === 'meta') {
                meta = msg;
                if (meta.singleImage) {
                    statusText.textContent = 'Loading…';
                } else {
                    statusText.textContent = 'Stitching ' + meta.totalSlices + ' slices…';
                }
            } else if (msg.type === 'slice') {
                sliceQueue.push(msg);
                processQueue();
            } else if (msg.type === 'done') {
                sliceQueue.push({ type: 'done' });
                processQueue();
            } else if (msg.type === 'error') {
                statusText.textContent = msg.message || 'Failed to load screenshot.';
                status.querySelector('.spinner')?.remove();
            }
        });

        port.postMessage({ type: 'ready' });
    }

    async function processQueue() {
        if (drawing) return;
        drawing = true;

        while (sliceQueue.length > 0) {
            const item = sliceQueue.shift();

            if (item.type === 'done') {
                finalize(true); // save to db
                drawing = false;
                return;
            }

            try {
                const img = await loadImage(item.dataUrl);

                if (meta && meta.singleImage) {
                    if (meta.cropRect) {
                        // Element crop mode: calculate TRUE device ratio based on captured image vs logical window
                        const actualDpr = meta.cropRect.viewportWidth ? (img.naturalWidth / meta.cropRect.viewportWidth) : (meta.cropRect.devicePixelRatio || 1);

                        const sx = Math.max(0, Math.floor(meta.cropRect.x * actualDpr));
                        const sy = Math.max(0, Math.floor(meta.cropRect.y * actualDpr));
                        const sw = Math.min(img.naturalWidth - sx, Math.ceil(meta.cropRect.width * actualDpr));
                        const sh = Math.min(img.naturalHeight - sy, Math.ceil(meta.cropRect.height * actualDpr));

                        // Set canvas to physical pixel dimensions
                        canvas.width = sw;
                        canvas.height = sh;

                        // Prevent retina display magnification by capping logical width
                        canvas.style.width = Math.ceil(meta.cropRect.width) + 'px';

                        // Draw only the cropped region
                        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
                    } else {
                        // Full viewport visible capture
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                        canvas.style.width = Math.ceil(img.naturalWidth / (window.devicePixelRatio || 1)) + 'px';
                        ctx.drawImage(img, 0, 0);
                    }
                } else if (meta) {
                    if (canvas.width !== meta.width || canvas.height !== meta.height) {
                        canvas.width = meta.width;
                        canvas.height = meta.height;
                    }

                    const vpH = meta.viewportHeight;
                    if (item.last && item.remainder < vpH) {
                        const ratio = item.remainder / vpH;
                        const srcY = img.naturalHeight * (1 - ratio);
                        ctx.drawImage(
                            img,
                            0, srcY, img.naturalWidth, img.naturalHeight - srcY,
                            0, item.y, meta.width, item.remainder
                        );
                    } else {
                        ctx.drawImage(
                            img,
                            0, 0, img.naturalWidth, img.naturalHeight,
                            0, item.y, meta.width, vpH
                        );
                    }
                }
            } catch (e) {
                console.error('Failed to draw slice:', e);
            }
        }

        drawing = false;
    }

    async function finalize(shouldSave) {
        status.style.display = 'none';
        canvas.style.display = 'block';

        const w = canvas.width;
        const h = canvas.height;
        document.title = 'Screenshot (' + w + '×' + h + ')';

        btnPng.disabled = false;
        btnPdf.disabled = false;

        if (shouldSave) {
            try {
                // Compress highly to save IndexedDB space (JPEG 80%)
                const finalDataUrl = canvas.toDataURL('image/jpeg', 0.8);
                const sizeBytes = Math.round(finalDataUrl.length * (3 / 4));

                await window.screenshotDB.saveScreenshot({
                    id: Date.now().toString(),
                    timestamp: Date.now(),
                    sourceUrl: sourceUrl,
                    width: w,
                    height: h,
                    sizeBytes: sizeBytes,
                    dataUrl: finalDataUrl
                });
            } catch (e) {
                console.error('Failed to save to database', e);
            }
        }
    }

    // ── Downloads ──

    btnPng.addEventListener('click', () => {
        // Read image format from settings if we had them here, but defaulting to PNG
        chrome.storage.local.get(['imageFormat'], (res) => {
            const format = res.imageFormat === 'jpg' ? 'image/jpeg' : 'image/png';
            const ext = res.imageFormat === 'jpg' ? 'jpg' : 'png';

            const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            const link = document.createElement('a');
            link.download = 'screenshot_' + ts + '.' + ext;
            link.href = canvas.toDataURL(format, format === 'image/jpeg' ? 0.9 : undefined);
            link.click();
        });
    });

    btnPdf.addEventListener('click', () => {
        window.print();
    });

    btnDelete.addEventListener('click', async () => {
        if (shotId) {
            // Delete from database if viewing existing
            if (confirm('Delete this screenshot? This action cannot be undone.')) {
                await window.screenshotDB.deleteScreenshot(shotId);
                window.close();
            }
        } else {
            // Just close if we haven't given them the ID yet
            // (It's saved in DB already, but for simplicity of UX we just close)
            window.close();
        }
    });

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }
})();
