/**
 * Cookie Reject - YouTube Auto-Synced Lyrics
 * Phase 17 - Feature: Floating Lyrics Box
 */

(function () {
    'use strict';

    let showLyricsEnabled = true;

    // Load state from Background 
    chrome.storage.local.get(['showLyrics'], (result) => {
        showLyricsEnabled = result.showLyrics !== false; // true by default
        if (showLyricsEnabled) {
            initYouTubeObserver();
        }
    });

    // Listen for toggle updates from Popup
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'stateUpdate' || message.type === 'toggle') {
            chrome.storage.local.get(['showLyrics'], (res) => {
                showLyricsEnabled = res.showLyrics !== false;
                if (!showLyricsEnabled) {
                    destroyLyricsUI();
                } else if (isYouTubeVideoURL(window.location.href)) {
                    initLyricsSequence();
                }
            });
        }
    });

    // ─────────────────────────────────────────────────────────────────
    // 1. YouTube SPA Navigation Observer
    // ─────────────────────────────────────────────────────────────────

    let lastVideoId = null;

    function initYouTubeObserver() {
        // YouTube is a Single Page Application (SPA).
        // URL changes happen without page reloads, so we must hook into their custom navigation events.

        // Initial check on load
        if (isYouTubeVideoURL(window.location.href)) {
            initLyricsSequence();
        }

        // Listen for YouTube's custom navigation finish event (works on desktop Web)
        document.addEventListener('yt-navigate-finish', handleNavigation);

        // Fallback: MutationObserver on the title to catch navigation if event fails
        let currentUrl = location.href;
        new MutationObserver(() => {
            if (currentUrl !== location.href) {
                currentUrl = location.href;
                handleNavigation();
            }
        }).observe(document.querySelector('title') || document.head, { subtree: true, characterData: true, childList: true });
    }

    function isYouTubeVideoURL(url) {
        return url.includes('youtube.com/watch') || url.includes('music.youtube.com/watch');
    }

    function extractVideoId(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.searchParams.get('v');
        } catch (e) {
            return null;
        }
    }

    function handleNavigation() {
        if (!showLyricsEnabled) return;

        const currentUrl = window.location.href;
        if (!isYouTubeVideoURL(currentUrl)) {
            destroyLyricsUI();
            lastVideoId = null;
            return;
        }

        const currentVideoId = extractVideoId(currentUrl);
        if (currentVideoId && currentVideoId !== lastVideoId) {
            lastVideoId = currentVideoId;
            initLyricsSequence();
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // 2. Metadata Scraping & Orchestration
    // ─────────────────────────────────────────────────────────────────

    function initLyricsSequence() {
        destroyLyricsUI(); // Clean slate

        // YouTube's DOM takes a moment to fully populate the video title and artist
        // even after the URL changes. We use a short polling mechanism.
        let attempts = 0;
        const maxAttempts = 15; // 7.5 seconds max wait (500ms * 15)

        const checkDOM = setInterval(() => {
            attempts++;
            // YouTube Web selectors
            const titleEl = document.querySelector('#title h1 yt-formatted-string, h1.ytd-watch-metadata yt-formatted-string, h1.title.ytd-video-primary-info-renderer');
            const artistEl = document.querySelector('#upload-info ytd-channel-name .yt-simple-endpoint, ytd-channel-name .yt-simple-endpoint');

            // YouTube Music selectors
            const ytMusicTitle = document.querySelector('yt-formatted-string.title.ytmusic-player-bar');
            const ytMusicArtist = document.querySelector('yt-formatted-string.byline.ytmusic-player-bar a');

            const finalTitle = titleEl?.textContent || ytMusicTitle?.textContent;
            const finalArtist = artistEl?.textContent || ytMusicArtist?.textContent;

            if (finalTitle && finalArtist) {
                clearInterval(checkDOM);
                processSong(cleanText(finalTitle), cleanText(finalArtist));
            } else if (attempts >= maxAttempts) {
                clearInterval(checkDOM);
                console.warn("[Cookie Reject] Lyrics: Could not find YouTube metadata within timeout.");
            }
        }, 500);
    }

    function cleanText(text) {
        if (!text) return '';
        // Strip common YouTube fluff from titles to improve API hit rates
        return text.trim()
            .replace(/\(Official.*?\)/gi, '')
            .replace(/\[Official.*?\]/gi, '')
            .replace(/\(Music Video\)/gi, '')
            .replace(/\[Music Video\]/gi, '')
            .replace(/\(Lyric.*?\)/gi, '')
            .replace(/\[Lyric.*?\]/gi, '')
            .replace(/\(Audio\)/gi, '')
            .replace(/\[Audio\]/gi, '')
            .replace(/\(HD\)/gi, '')
            .replace(/\[HD\]/gi, '')
            .replace(/ft\..*/gi, '')
            .replace(/feat\..*/gi, '')
            .replace(/\s+/g, ' ') // normalize spaces
            .trim();
    }

    async function processSong(title, artist) {
        console.log(`[Cookie Reject] Requesting generic lyrics for '${title}' by '${artist}' via Background...`);
        try {
            chrome.runtime.sendMessage({
                type: 'fetchLyrics',
                title: title,
                artist: artist
            }, (response) => {
                if (!response) {
                    console.error("[Cookie Reject] Failed to communicate with background script.");
                    return;
                }
                if (response.error) {
                    console.log(`[Cookie Reject] No valid lyrics found for: ${title}`);
                    return;
                }

                if (response.lyrics) {
                    console.log(`[Cookie Reject] Synced Lyrics Found!`);
                    const parsedLyrics = parseLRC(response.lyrics);
                    spawnLyricsUI(parsedLyrics);
                }
            });
        } catch (error) {
            console.error("[Cookie Reject] Lyrics Message Error:", error);
        }
    }

    function parseLRC(lrcText) {
        const lines = lrcText.split('\n');
        const lyricsArray = [];
        const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

        for (const line of lines) {
            const match = timeRegex.exec(line);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const milliseconds = parseInt(match[3].padEnd(3, '0'));

                const timeInSeconds = (minutes * 60) + seconds + (milliseconds / 1000);
                const text = line.replace(timeRegex, '').trim();

                // Allow empty lines as intentional instrument pauses or breaks
                lyricsArray.push({ time: timeInSeconds, text: text || '🎵 Instrumental 🎵' });
            }
        }

        // Ensure chronological order just in case API returns messy data
        return lyricsArray.sort((a, b) => a.time - b.time);
    }

    let currentVideo = null;
    let timeUpdateHandler = null;

    function spawnLyricsUI(parsedLyrics) {
        destroyLyricsUI(); // Ensure clean slate

        currentVideo = document.querySelector('video');
        if (!currentVideo) return;

        // Build the main container
        const container = document.createElement('div');
        container.id = 'cr-lyrics-container';
        container.className = 'cr-lyrics-container';

        // Build the Header (draggable area)
        const header = document.createElement('div');
        header.className = 'cr-lyrics-header';

        const titleWrapper = document.createElement('div');
        titleWrapper.style.display = 'flex';
        titleWrapper.style.alignItems = 'center';
        titleWrapper.style.gap = '6px';

        // Sleek music note icon
        const titleIcon = document.createElement('div');
        titleIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
        titleIcon.style.display = 'flex';
        titleIcon.style.opacity = '0.9';

        const titleSpan = document.createElement('span');
        titleSpan.textContent = 'Lyrics';
        titleSpan.className = 'cr-lyrics-title';

        titleWrapper.appendChild(titleIcon);
        titleWrapper.appendChild(titleSpan);

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.className = 'cr-lyrics-close';
        closeBtn.title = 'Minimize Lyrics';
        closeBtn.onclick = () => toggleLyricsMinimize(true);

        header.appendChild(titleWrapper);
        header.appendChild(closeBtn);
        container.appendChild(header);

        // Build the scrolling lyrics body
        const body = document.createElement('div');
        body.className = 'cr-lyrics-body';
        body.id = 'cr-lyrics-body';

        parsedLyrics.forEach((lyricObj, index) => {
            const line = document.createElement('div');
            line.className = 'cr-lyric-line';
            line.id = `cr-lyric-${index}`;
            line.dataset.time = lyricObj.time;
            line.textContent = lyricObj.text;
            body.appendChild(line);
        });

        container.appendChild(body);

        // Append to body instead of player to allow floating over comments
        document.body.appendChild(container);

        // Initialize drag logic
        initLyricsDrag(container, header);

        // Initialize Synchronization logic
        if (timeUpdateHandler) {
            currentVideo.removeEventListener('timeupdate', timeUpdateHandler);
        }

        let activeIndex = -1;

        timeUpdateHandler = () => {
            const currentTime = currentVideo.currentTime;

            // Find the closest lyric line that has already started, but hasn't been passed by the next line
            // We search backwards because the array is chronologically sorted
            let newActiveIndex = -1;
            for (let i = parsedLyrics.length - 1; i >= 0; i--) {
                if (currentTime >= parsedLyrics[i].time) {
                    newActiveIndex = i;
                    break;
                }
            }

            if (newActiveIndex !== activeIndex && newActiveIndex !== -1) {
                // Remove active class from old line
                if (activeIndex !== -1) {
                    const oldLine = document.getElementById(`cr-lyric-${activeIndex}`);
                    if (oldLine) oldLine.classList.remove('active');
                }

                // Add active class to new line
                const newLine = document.getElementById(`cr-lyric-${newActiveIndex}`);
                if (newLine) {
                    newLine.classList.add('active');

                    // Smooth scroll the body to keep the active line vertically centered
                    const offset = newLine.offsetTop - (body.clientHeight / 2) + (newLine.clientHeight / 2);
                    body.scrollTo({
                        top: Math.max(0, offset),
                        behavior: 'smooth'
                    });
                }
                activeIndex = newActiveIndex;
            }
        };

        currentVideo.addEventListener('timeupdate', timeUpdateHandler);
    }

    function toggleLyricsMinimize(minimize) {
        const container = document.getElementById('cr-lyrics-container');
        if (!container) return;

        let fab = document.getElementById('cr-lyrics-fab');

        if (minimize) {
            container.style.setProperty('display', 'none', 'important');
            if (!fab) {
                fab = document.createElement('div');
                fab.id = 'cr-lyrics-fab';
                fab.className = 'cr-lyrics-fab';
                fab.title = 'Open Lyrics';

                // Music icon inside FAB
                const icon = document.createElement('div');
                icon.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
                icon.style.pointerEvents = 'none';

                // Close button inside FAB
                const closeFabBtn = document.createElement('div');
                closeFabBtn.className = 'cr-lyrics-fab-close';
                closeFabBtn.innerHTML = '✕';
                closeFabBtn.title = 'Close permanently';
                closeFabBtn.onclick = (e) => {
                    e.stopPropagation();
                    destroyLyricsUI();
                };

                fab.onclick = () => toggleLyricsMinimize(false);

                fab.appendChild(icon);
                fab.appendChild(closeFabBtn);
                document.body.appendChild(fab);
            }
            fab.style.display = 'flex';
        } else {
            // Restore container
            container.style.setProperty('display', 'flex', 'important');
            if (fab) {
                fab.style.display = 'none';
            }
        }
    }

    function initLyricsDrag(container, header) {
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        header.addEventListener('mousedown', (e) => {
            if (e.target.tagName.toLowerCase() === 'button') return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;

            const rect = container.getBoundingClientRect();
            // Store initial coordinates relative to the viewport
            initialLeft = rect.left;
            initialTop = rect.top;

            // Prepare container for fixed positioning
            container.style.position = 'fixed';
            container.style.bottom = 'auto';
            container.style.right = 'auto';
            container.style.left = initialLeft + 'px';
            container.style.top = initialTop + 'px';
            container.style.transform = 'none'; // remove standard translation if any

            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            let newLeft = initialLeft + dx;
            let newTop = initialTop + dy;

            // Basic boundary checks against the viewport (so it floats correctly when scrolling)
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - container.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - container.offsetHeight));

            container.style.left = newLeft + 'px';
            container.style.top = newTop + 'px';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    function destroyLyricsUI() {
        const existing = document.getElementById('cr-lyrics-container');
        if (existing) {
            existing.remove();
        }
        const existingFab = document.getElementById('cr-lyrics-fab');
        if (existingFab) {
            existingFab.remove();
        }
        if (currentVideo && timeUpdateHandler) {
            currentVideo.removeEventListener('timeupdate', timeUpdateHandler);
            timeUpdateHandler = null;
        }
    }

})();
