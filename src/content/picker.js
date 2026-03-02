/**
 * Element Picker (Magic Wand) — picker.js
 * Click any element on the page to open the floating Element Tools menu.
 */
(function () {
    'use strict';

    if (window.__pickerActive) return;
    window.__pickerActive = true;

    const domain = window.location.hostname;
    let hoveredEl = null;
    let overlay, tooltip, menuHost;
    let isMenuOpen = false;

    function init() {
        // Overlay
        overlay = document.createElement('div');
        overlay.id = '__picker-overlay';
        overlay.setAttribute('style',
            'position:fixed;pointer-events:none;border:2px solid #a8c7fa;' +
            'background:rgba(168,199,250,0.12);border-radius:4px;' +
            'z-index:2147483646;transition:all 80ms ease;display:none;'
        );

        // Tooltip
        tooltip = document.createElement('div');
        tooltip.id = '__picker-tooltip';
        tooltip.setAttribute('style',
            'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);' +
            'background:#232326;color:#e3e3e8;font-family:system-ui,sans-serif;' +
            'font-size:13px;font-weight:500;padding:10px 20px;border-radius:12px;' +
            'border:1px solid #45454a;z-index:2147483647;' +
            'box-shadow:0 8px 32px rgba(0,0,0,0.6);text-align:center;'
        );
        tooltip.textContent = 'Click any element to open Magic Wand tools · Esc to cancel';

        const root = document.documentElement || document.body;
        root.appendChild(overlay);
        root.appendChild(tooltip);

        document.addEventListener('mousemove', onMouseMove, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('keydown', onKeyDown, true);
    }

    function onMouseMove(e) {
        if (isMenuOpen) return;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || el === overlay || el === tooltip || (menuHost && el === menuHost)) return;

        // Prevent selecting the shadow DOM host itself
        if (el.id === '__picker-menu-host') return;

        hoveredEl = el;
        const r = el.getBoundingClientRect();
        overlay.style.display = 'block';
        overlay.style.top = r.top + 'px';
        overlay.style.left = r.left + 'px';
        overlay.style.width = r.width + 'px';
        overlay.style.height = r.height + 'px';
    }

    function onClick(e) {
        if (isMenuOpen) {
            // If clicking outside the menu, close it and return to hover mode
            if (e.target.id !== '__picker-menu-host' && (!menuHost || !menuHost.contains(e.target))) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                closeMenu();
            }
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (!hoveredEl || hoveredEl === overlay || hoveredEl === tooltip) return;

        openMenu(e.clientX, e.clientY);
    }

    function onKeyDown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            if (isMenuOpen) closeMenu();
            else cleanup();
        }
    }

    // --- Floating Menu ---

    function openMenu(clickX, clickY) {
        isMenuOpen = true;
        tooltip.style.display = 'none';

        menuHost = document.createElement('div');
        menuHost.id = '__picker-menu-host';
        menuHost.style.position = 'absolute';
        menuHost.style.zIndex = '2147483647';

        // Position menu near the click, ensuring it stays in viewport
        let top = window.scrollY + clickY + 15;
        let left = window.scrollX + clickX + 15;

        menuHost.style.top = top + 'px';
        menuHost.style.left = left + 'px';

        const shadow = menuHost.attachShadow({ mode: 'closed' });

        const style = document.createElement('style');
        style.textContent = `
            .menu {
                background: #1a1a1c;
                border: 1px solid #323236;
                border-radius: 12px;
                padding: 8px;
                width: 220px;
                font-family: 'Inter', system-ui, sans-serif;
                color: #e3e3e8;
                box-shadow: 0 12px 24px rgba(0,0,0,0.5);
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .menu-header {
                font-size: 11px;
                font-weight: 600;
                color: #9aa0a6;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                padding: 6px 10px;
                margin-bottom: 2px;
            }
            .menu-btn {
                background: transparent;
                border: none;
                color: #e3e3e8;
                font-size: 13px;
                font-weight: 500;
                padding: 8px 10px;
                text-align: left;
                border-radius: 6px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                transition: background 0.15s, color 0.15s;
            }
            .menu-btn:hover {
                background: #2b2b2f;
                color: #ffffff;
            }
            .menu-btn.danger { color: #f28b82; }
            .menu-btn.danger:hover { background: rgba(242,139,130,0.1); }
            
            .menu-btn svg { width: 16px; height: 16px; opacity: 0.8; }
            
            .divider {
                height: 1px;
                background: #323236;
                margin: 4px 0;
            }
        `;

        const container = document.createElement('div');
        container.className = 'menu';

        const createBtn = (text, iconSvg, onClickHandler, isDanger = false) => {
            const btn = document.createElement('button');
            btn.className = 'menu-btn' + (isDanger ? ' danger' : '');
            btn.innerHTML = `${iconSvg} <span>${text}</span>`;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                onClickHandler(e);
            });
            return btn;
        };

        const copyIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg>';
        const imageIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
        const hideIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path></svg>';
        const markdownIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';

        const redactIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0110 0v4"></path></svg>';
        const scrambleIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>';
        const blurIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"></path></svg>';
        const downloadIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';

        const headerExport = document.createElement('div');
        headerExport.className = 'menu-header';
        headerExport.textContent = 'Export';
        container.appendChild(headerExport);

        container.appendChild(createBtn('Copy Text', copyIcon, () => {
            navigator.clipboard.writeText(hoveredEl.innerText || "").then(() => flashSuccess(container, 'Copied!'));
        }));

        container.appendChild(createBtn('Copy as Markdown', markdownIcon, () => {
            navigator.clipboard.writeText(htmlToMarkdown(hoveredEl)).then(() => flashSuccess(container, 'Copied HTML as MD!'));
        }));

        container.appendChild(createBtn('Export as Image', imageIcon, () => {
            flashSuccess(container, 'Capturing...');
            captureElementScreenshot(hoveredEl);
        }));

        const divider1 = document.createElement('div');
        divider1.className = 'divider';
        container.appendChild(divider1);

        const headerPrivacy = document.createElement('div');
        headerPrivacy.className = 'menu-header';
        headerPrivacy.textContent = 'Privacy';
        container.appendChild(headerPrivacy);

        container.appendChild(createBtn('Redact Element', redactIcon, () => {
            redactElement(hoveredEl);
            flashSuccess(container, 'Redacted!');
        }));

        container.appendChild(createBtn('Scramble Text', scrambleIcon, () => {
            scrambleText(hoveredEl);
            flashSuccess(container, 'Scrambled!');
        }));

        container.appendChild(createBtn('Fake Blur', blurIcon, () => {
            blurElement(hoveredEl);
            flashSuccess(container, 'Blurred!');
        }));

        const divider2 = document.createElement('div');
        divider2.className = 'divider';
        container.appendChild(divider2);

        const getExtractUrl = () => {
            let urlToDownload = window.location.href;
            if ((hoveredEl.tagName.toLowerCase() === 'video' || hoveredEl.tagName.toLowerCase() === 'iframe') &&
                hoveredEl.src && !hoveredEl.src.startsWith('blob:')) {
                urlToDownload = hoveredEl.src;
            } else {
                const mediaSelectors = [
                    'a[href*="/watch?v="]', 'a[href*="/shorts/"]',
                    'a[href*="/p/"]', 'a[href*="/reel/"]',
                    'a[href*="/status/"]', 'a[href*="/video/"]',
                    'a[href*="/videos/"]', 'a[href*="/comments/"]'
                ].join(', ');
                let foundLink = hoveredEl.closest(mediaSelectors);
                if (!foundLink) foundLink = hoveredEl.querySelector(mediaSelectors);
                if (!foundLink) foundLink = hoveredEl.closest('a[href]');
                if (!foundLink) {
                    const postContainer = hoveredEl.closest('article, [role="article"], .post, .tweet, ytd-video-renderer, ytd-rich-item-renderer, ytd-grid-video-renderer');
                    if (postContainer) foundLink = postContainer.querySelector(mediaSelectors) || postContainer.querySelector('a[href]');
                }
                if (foundLink && foundLink.href) urlToDownload = foundLink.href;
            }
            return urlToDownload;
        };

        container.appendChild(createBtn('Send to yt-dlp', downloadIcon, () => {
            chrome.runtime.sendMessage({ type: 'openDownloader', url: getExtractUrl() });
            flashSuccess(container, 'Sent to yt-dlp!');
        }));

        const clipIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h5v5"></path><path d="M19.5 4L9 14.5"></path><circle cx="6" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle></svg>`;

        function showPersistentClipTool(extractedUrl, originX, originY) {
            const clipBox = document.createElement('div');
            clipBox.style.cssText = `
                position: fixed; top: ${Math.max(10, originY - 50)}px; left: ${Math.max(10, originX + 20)}px;
                background: #1a1a1c; border: 1px solid #323236; border-radius: 12px; padding: 16px; width: 340px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.6); display: flex; flex-direction: column; gap: 16px;
                z-index: 2147483647; font-family: 'Inter', sans-serif;
            `;

            clipBox.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-size:14px; font-weight:600; color:#e3e3e8;">Clip Interval Tool</div>
                    <div id="clip-close" style="cursor:pointer; color:#9aa0a6; font-size:18px; line-height:1;">&times;</div>
                </div>
                <div style="display:flex; gap:12px;">
                    <div style="flex:1; border:1px solid #45454a; border-radius:8px; padding:8px 12px; position:relative; background:#1a1a1c;">
                        <div style="position:absolute; top:-8px; left:8px; background:#1a1a1c; padding:0 4px; font-size:11px; color:#9aa0a6;">Start time</div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
                            <input type="text" id="wand-start" placeholder="00:00:00.000" style="background:none; border:none; color:#e3e3e8; font-size:14px; outline:none; width:80%;" />
                            <div id="record-start" style="cursor:pointer; color:#a8c7fa;" title="Freeze timestamp">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            </div>
                        </div>
                    </div>
                    <div style="flex:1; border:1px solid #45454a; border-radius:8px; padding:8px 12px; position:relative; background:#1a1a1c;">
                        <div style="position:absolute; top:-8px; left:8px; background:#1a1a1c; padding:0 4px; font-size:11px; color:#9aa0a6;">End time</div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
                            <input type="text" id="wand-end" placeholder="00:00:00.000" style="background:none; border:none; color:#e3e3e8; font-size:14px; outline:none; width:80%;" />
                            <div id="record-end" style="cursor:pointer; color:#a8c7fa;" title="Freeze timestamp">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            </div>
                        </div>
                    </div>
                </div>
                <div style="display:flex; justify-content:flex-end; margin-top:4px;">
                    <button id="clip-send-btn" style="background:#a8c7fa; color:#0842a0; border:none; border-radius:8px; padding:8px 16px; font-weight:600; cursor:pointer; font-size:14px; display:flex; align-items:center; gap:6px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> 
                        Download Clip
                    </button>
                </div>
            `;

            document.body.appendChild(clipBox);

            const formatTimeMs = (secs) => {
                const h = Math.floor(secs / 3600).toString().padStart(2, '0');
                const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
                const s = Math.floor(secs % 60).toString().padStart(2, '0');
                const ms = Math.floor((secs % 1) * 1000).toString().padStart(3, '0');
                if (h === '00') return `${m}:${s}.${ms}`;
                return `${h}:${m}:${s}.${ms}`;
            };

            const findVideoTime = () => {
                const vids = document.getElementsByTagName('video');
                if (vids.length > 0) return vids[0].currentTime;
                return null;
            };

            // Dragging Logic
            let isDragging = false;
            let currentX, currentY, initialX, initialY;
            let xOffset = clipBox.getBoundingClientRect().left;
            let yOffset = clipBox.getBoundingClientRect().top;

            const header = clipBox.querySelector('div[style*="justify-content:space-between"]');
            header.style.cursor = 'grab';

            header.addEventListener('mousedown', (e) => {
                if (e.target.id === 'clip-close') return;
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;
                isDragging = true;
                header.style.cursor = 'grabbing';
            });

            document.addEventListener('mousemove', (e) => {
                if (isDragging) {
                    e.preventDefault();
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;
                    xOffset = currentX;
                    yOffset = currentY;
                    clipBox.style.left = currentX + 'px';
                    clipBox.style.top = currentY + 'px';
                }
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    initialX = currentX;
                    initialY = currentY;
                    isDragging = false;
                    header.style.cursor = 'grab';
                }
            });

            clipBox.querySelector('#clip-close').addEventListener('click', () => clipBox.remove());

            clipBox.querySelector('#record-start').addEventListener('click', () => {
                const t = findVideoTime();
                if (t !== null) clipBox.querySelector('#wand-start').value = formatTimeMs(t);
            });

            clipBox.querySelector('#record-end').addEventListener('click', () => {
                const t = findVideoTime();
                if (t !== null) clipBox.querySelector('#wand-end').value = formatTimeMs(t);
            });

            clipBox.querySelector('#clip-send-btn').addEventListener('click', () => {
                const s = clipBox.querySelector('#wand-start').value.trim();
                const e = clipBox.querySelector('#wand-end').value.trim();
                let params = { type: 'openDownloader', url: extractedUrl };
                if (s) params.start = s;
                if (e) params.end = e;

                chrome.runtime.sendMessage(params);
                clipBox.remove();
            });
        }

        container.appendChild(createBtn('Clip Video Range...', clipIcon, (e) => {
            const extractedUrl = getExtractUrl();
            const clickX = e.clientX;
            const clickY = e.clientY;
            cleanup(); // Destroy hover container immediately
            showPersistentClipTool(extractedUrl, clickX, clickY);
        }));

        const divider3 = document.createElement('div');
        divider3.className = 'divider';
        container.appendChild(divider3);

        const headerActions = document.createElement('div');
        headerActions.className = 'menu-header';
        headerActions.textContent = 'Actions';
        container.appendChild(headerActions);

        container.appendChild(createBtn('Hide Element', hideIcon, () => {
            hideTargetElement();
            cleanup();
        }, true));

        shadow.appendChild(style);
        shadow.appendChild(container);
        document.body.appendChild(menuHost);

        // Adjust if it goes off screen right or bottom
        const rect = menuHost.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menuHost.style.left = (window.scrollX + window.innerWidth - rect.width - 20) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            menuHost.style.top = (window.scrollY + clickY - rect.height - 15) + 'px';
        }
    }

    function closeMenu() {
        if (menuHost) {
            menuHost.remove();
            menuHost = null;
        }
        isMenuOpen = false;
        if (tooltip) tooltip.style.display = 'block';
    }

    function flashSuccess(container, text) {
        const overlaySpan = document.createElement('div');
        overlaySpan.style.position = 'absolute';
        overlaySpan.style.top = '0';
        overlaySpan.style.left = '0';
        overlaySpan.style.right = '0';
        overlaySpan.style.bottom = '0';
        overlaySpan.style.background = 'rgba(26,26,28,0.95)';
        overlaySpan.style.color = '#81c995';
        overlaySpan.style.display = 'flex';
        overlaySpan.style.alignItems = 'center';
        overlaySpan.style.justifyContent = 'center';
        overlaySpan.style.fontWeight = '600';
        overlaySpan.style.fontSize = '14px';
        overlaySpan.style.borderRadius = '12px';
        overlaySpan.textContent = text;
        container.appendChild(overlaySpan);
        setTimeout(() => {
            if (overlaySpan.parentNode) overlaySpan.remove();
            cleanup();
        }, 1200);
    }

    // --- Core Action Functions ---

    function htmlToMarkdown(element) {
        let md = '';
        function traverse(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                let text = node.textContent.replace(/\s+/g, ' ');
                if (text.trim()) md += text;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = node.tagName.toLowerCase();
                if (tag === 'h1') md += '\n# ';
                if (tag === 'h2') md += '\n## ';
                if (tag === 'h3') md += '\n### ';
                if (tag === 'p') md += '\n\n';
                if (tag === 'br') md += '\n';
                if (tag === 'a') md += '[';
                if (tag === 'strong' || tag === 'b') md += '**';
                if (tag === 'em' || tag === 'i') md += '*';
                if (tag === 'li') md += '\n- ';
                if (tag === 'code') md += '`';

                for (let child of node.childNodes) {
                    traverse(child);
                }

                if (tag === 'a') md += `](${node.href || ''})`;
                if (tag === 'strong' || tag === 'b') md += '**';
                if (tag === 'em' || tag === 'i') md += '*';
                if (tag === 'code') md += '`';
                if (tag === 'p' || /h[1-6]/.test(tag)) md += '\n';
            }
        }
        traverse(element);
        return md.trim();
    }

    function redactElement(el) {
        el.style.setProperty('background-color', '#000000', 'important');
        el.style.setProperty('color', '#000000', 'important');
        el.style.setProperty('border-color', '#000000', 'important');
        el.style.setProperty('user-select', 'none', 'important');
        const children = el.querySelectorAll('*');
        for (let child of children) {
            child.style.setProperty('background-color', '#000000', 'important');
            child.style.setProperty('color', '#000000', 'important');
            child.style.setProperty('border-color', '#000000', 'important');
            child.style.setProperty('user-select', 'none', 'important');
        }
    }

    function scrambleText(el) {
        function scrambleWord(word) {
            return word.split('').map(char => {
                if (/[a-z]/.test(char)) return String.fromCharCode(97 + Math.floor(Math.random() * 26));
                if (/[A-Z]/.test(char)) return String.fromCharCode(65 + Math.floor(Math.random() * 26));
                if (/[0-9]/.test(char)) return String.fromCharCode(48 + Math.floor(Math.random() * 10));
                return char;
            }).join('');
        }
        function traverse(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                if (node.textContent.trim()) {
                    node.textContent = node.textContent.split(/(\s+)/).map(part => {
                        return /^\s+$/.test(part) ? part : scrambleWord(part);
                    }).join('');
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                for (let child of node.childNodes) {
                    traverse(child);
                }
            }
        }
        traverse(el);
    }

    function blurElement(el) {
        el.style.setProperty('filter', 'blur(7px) contrast(1.2)', 'important');
        el.style.setProperty('user-select', 'none', 'important');
        // Prevent children from being selected
        const children = el.querySelectorAll('*');
        for (let child of children) {
            child.style.setProperty('user-select', 'none', 'important');
        }
    }

    function hideTargetElement() {
        const selector = makeSelector(hoveredEl);
        if (!selector) return;

        hoveredEl.style.setProperty('display', 'none', 'important');

        chrome.storage.local.get(['hiddenElements'], (res) => {
            const h = res.hiddenElements || {};
            if (!h[domain]) h[domain] = [];
            if (!h[domain].includes(selector)) h[domain].push(selector);
            chrome.storage.local.set({ hiddenElements: h });
        });
    }

    function captureElementScreenshot(el) {
        const rect = el.getBoundingClientRect();
        closeMenu(); // Hide menu before screenshotting

        // Wait for DOM to paint the menu hiding before taking the shot
        setTimeout(() => {
            chrome.runtime.sendMessage({
                type: 'captureElement',
                rect: {
                    x: rect.left,
                    y: rect.top,
                    width: rect.width,
                    height: rect.height,
                    devicePixelRatio: window.devicePixelRatio || 1,
                    viewportWidth: window.innerWidth
                }
            });
            cleanup(); // Exit magic wand mode after capture
        }, 60);
    }

    // --- Legacy / Selector Utils ---

    function makeSelector(el) {
        if (el.id) {
            try {
                const sel = '#' + CSS.escape(el.id);
                if (document.querySelectorAll(sel).length === 1) return sel;
            } catch (e) { }
        }

        const parts = [];
        let cur = el;

        for (let d = 0; d < 6 && cur && cur !== document.body && cur !== document.documentElement; d++) {
            let p = cur.tagName.toLowerCase();

            const cls = [];
            if (cur.classList) {
                for (let i = 0; i < cur.classList.length && cls.length < 2; i++) {
                    const c = cur.classList[i];
                    if (c.length > 2 && c.length < 40 && !/^\\d|^_/.test(c)) {
                        cls.push(CSS.escape(c));
                    }
                }
            }
            if (cls.length) p += '.' + cls.join('.');

            const test = parts.length ? p + '>' + parts.join('>') : p;
            try { if (document.querySelectorAll(test).length === 1) return test; } catch (e) { }

            const parent = cur.parentElement;
            if (parent) {
                let idx = 1, sib = cur.previousElementSibling;
                while (sib) {
                    if (sib.tagName === cur.tagName) idx++;
                    sib = sib.previousElementSibling;
                }
                const count = parent.querySelectorAll(':scope>' + cur.tagName.toLowerCase()).length;
                if (count > 1) p += ':nth-of-type(' + idx + ')';
            }

            parts.unshift(p);
            cur = cur.parentElement;
        }

        const final = parts.join('>');
        try {
            if (document.querySelector(final)) return final;
        } catch (e) { }

        return null;
    }

    function cleanup() {
        document.removeEventListener('mousemove', onMouseMove, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKeyDown, true);
        try { overlay?.remove(); } catch (e) { }
        try { tooltip?.remove(); } catch (e) { }
        try { menuHost?.remove(); } catch (e) { }
        window.__pickerActive = false;
    }

    // Start
    if (document.body || document.documentElement) {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
})();
