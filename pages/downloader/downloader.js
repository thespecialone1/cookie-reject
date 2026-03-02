document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('url-input');
    const btnPaste = document.getElementById('btn-paste');
    const commandInput = document.getElementById('command-input');
    const btnDownload = document.getElementById('btn-download');
    const formatRadios = document.querySelectorAll('input[name="base_fmt"]');
    const flagCheckboxes = document.querySelectorAll('#flags-group input[type="checkbox"]');
    const tasksContainer = document.getElementById('tasks-container');
    const statusIndicator = document.getElementById('connection-status');
    const statusText = statusIndicator.querySelector('span');
    const setupGuide = document.getElementById('setup-guide');
    const mainContent = document.getElementById('main-content');
    const extIdDisplay = document.getElementById('ext-id-display');
    const btnCopyId = document.getElementById('btn-copy-id');
    const startTimeInput = document.getElementById('start-time');
    const endTimeInput = document.getElementById('end-time');
    const intervalError = document.getElementById('interval-error');

    // Populate extension ID for guide
    if (extIdDisplay) {
        extIdDisplay.textContent = chrome.runtime.id;
        btnCopyId.addEventListener('click', () => {
            navigator.clipboard.writeText(chrome.runtime.id);
            btnCopyId.textContent = 'Copied!';
            setTimeout(() => btnCopyId.textContent = 'Copy', 2000);
        });
    }

    let bgPort = null;
    const activeTasks = new Map();

    // 1. Initialize Connection to Background
    function connectToBackground() {
        bgPort = chrome.runtime.connect({ name: 'ytdlp-ui' });

        bgPort.onMessage.addListener((msg) => {
            if (msg.type === 'host_status') {
                if (msg.connected) {
                    statusIndicator.classList.add('connected');
                    statusIndicator.classList.remove('error');
                    statusText.textContent = 'Ready';
                    setupGuide.style.display = 'none';
                    mainContent.style.display = 'block';
                } else {
                    statusIndicator.classList.add('error');
                    statusIndicator.classList.remove('connected');
                    statusText.textContent = 'Native Host Disconnected';
                    setupGuide.style.display = 'block';
                    mainContent.style.display = 'none';
                }
            } else if (msg.type === 'task_progress') {
                updateTaskProgress(msg.taskId, msg.line);
            } else if (msg.type === 'task_completed') {
                finishTask(msg.taskId, msg.code);
            } else if (msg.type === 'task_error') {
                errorTask(msg.taskId, msg.error);
            } else if (msg.type === 'host_disconnected') {
                activeTasks.forEach((task, id) => {
                    if (task.status.textContent === 'Starting...' || task.status.textContent === 'Downloading') {
                        errorTask(id, `Native Host Disconnected: ${msg.error}`);
                    }
                });
            }
        });

        bgPort.onDisconnect.addListener(() => {
            statusIndicator.classList.add('error');
            statusIndicator.classList.remove('connected');
            statusText.textContent = 'Background Disconnected';
        });

        // Ping for initialization status
        bgPort.postMessage({ type: 'init' });
    }

    connectToBackground();

    // 2. Parse URL parameters
    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get('url');
    const startParam = params.get('start');
    const endParam = params.get('end');

    if (urlParam) {
        urlInput.value = urlParam;
    }
    if (startParam) {
        startTimeInput.value = startParam;
    }
    if (endParam) {
        endTimeInput.value = endParam;
    }

    if (urlParam || startParam || endParam) {
        updateCommand();
    }

    // 3. UI Event Listeners
    btnPaste.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                urlInput.value = text.trim();
                validateInputs();
            }
        } catch (err) {
            console.error('Failed to read clipboard', err);
        }
    });

    urlInput.addEventListener('input', validateInputs);
    commandInput.addEventListener('input', validateInputs);
    startTimeInput.addEventListener('input', updateCommand);
    endTimeInput.addEventListener('input', updateCommand);

    function extractSeconds(timeStr) {
        if (!timeStr) return 0;
        const parts = timeStr.split(':').reverse();
        let secs = 0;
        for (let i = 0; i < parts.length; i++) {
            secs += parseFloat(parts[i]) * Math.pow(60, i);
        }
        return secs || 0;
    }

    function updateCommand() {
        let cmd = [];
        const selectedFormat = document.querySelector('input[name="base_fmt"]:checked');
        if (selectedFormat && selectedFormat.value) {
            cmd.push(selectedFormat.value);
        }
        flagCheckboxes.forEach(cb => {
            if (cb.checked) cmd.push(cb.value);
        });

        // Handle Time Intervals
        const startRaw = startTimeInput.value.trim();
        const endRaw = endTimeInput.value.trim();
        let intervalValid = true;

        if (startRaw || endRaw) {
            const startStr = startRaw || '0';
            let intervalStr = `*${startStr}`;

            if (endRaw) {
                intervalStr += `-${endRaw}`;
                const startSecs = extractSeconds(startStr);
                const endSecs = extractSeconds(endRaw);
                if (endSecs <= startSecs) {
                    intervalValid = false;
                }
            } else {
                intervalStr += '-inf';
            }

            if (intervalValid) {
                cmd.push(`--download-sections`);
                cmd.push(`*${startStr}-${endRaw || 'inf'}`);
                cmd.push(`--force-keyframes-at-cuts`);
                // Append clip times to output filename so yt-dlp doesn't abort if full video already exists
                const safeStart = startStr.replace(/:/g, '-').replace(/\./g, '');
                const safeEnd = endRaw ? endRaw.replace(/:/g, '-').replace(/\./g, '') : 'inf';
                cmd.push(`-o`);
                cmd.push(`"%(title)s (Clip ${safeStart} to ${safeEnd}) [%(id)s].%(ext)s"`);

                intervalError.style.display = 'none';
                startTimeInput.style.borderColor = '';
                endTimeInput.style.borderColor = '';
            } else {
                intervalError.style.display = 'block';
                startTimeInput.style.borderColor = 'var(--accent-red)';
                endTimeInput.style.borderColor = 'var(--accent-red)';
            }
        } else {
            intervalError.style.display = 'none';
            startTimeInput.style.borderColor = '';
            endTimeInput.style.borderColor = '';
        }

        commandInput.value = cmd.join(' ');
        validateInputs(intervalValid);
    }

    formatRadios.forEach(r => r.addEventListener('change', updateCommand));
    flagCheckboxes.forEach(c => c.addEventListener('change', updateCommand));

    btnDownload.addEventListener('click', () => {
        const url = urlInput.value.trim();
        const cmd = commandInput.value.trim();
        if (!url) return;

        // Generate a random ID for the UI
        const taskId = 'task_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

        // Create UI Card
        createTaskCard(taskId, url, cmd);

        // Send to background
        bgPort.postMessage({
            type: 'start_download',
            taskId: taskId,
            url: url,
            command: cmd
        });

        urlInput.value = '';
        startTimeInput.value = '';
        endTimeInput.value = '';
        validateInputs();
    });

    function validateInputs(intervalValid = true) {
        const hasUrl = urlInput.value.trim().length > 0;
        const hasCmd = commandInput.value.trim().length > 0;
        btnDownload.disabled = !(hasUrl && hasCmd && intervalValid);
    }

    // 4. Task Card Management
    function createTaskCard(taskId, url, cmd) {
        // Remove empty state if present
        const emptyState = tasksContainer.querySelector('.empty-state');
        if (emptyState) emptyState.remove();

        // Create card HTML
        const card = document.createElement('div');
        card.className = 'task-card';
        card.id = taskId;
        card.innerHTML = `
            <div class="task-header">
                <div class="task-title" title="${url}">${url}</div>
                <div class="task-actions" style="display: flex; gap: 8px; align-items: center;">
                    <div class="task-status active" id="status_${taskId}">Starting...</div>
                    <button id="folderbtn_${taskId}" class="icon-btn" title="Open Downloads Folder" style="display: none; width: 28px; height: 28px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                    </button>
                </div>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar" id="bar_${taskId}"></div>
            </div>
            <div class="task-details">
                <span id="dtls_${taskId}">Preparing download...</span>
            </div>
            <div class="console-output" id="console_${taskId}">&gt; yt-dlp ${cmd} ${url}\n</div>
        `;

        tasksContainer.prepend(card);

        activeTasks.set(taskId, {
            card: card,
            console: card.querySelector(`#console_${taskId}`),
            bar: card.querySelector(`#bar_${taskId}`),
            status: card.querySelector(`#status_${taskId}`),
            details: card.querySelector(`#dtls_${taskId}`),
            folderBtn: card.querySelector(`#folderbtn_${taskId}`)
        });

        // Add event listener to folder button
        const folderBtn = card.querySelector(`#folderbtn_${taskId}`);
        folderBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: 'openDownloadsFolder' });
        });
    }

    function updateTaskProgress(taskId, line) {
        const task = activeTasks.get(taskId);
        if (!task) return;

        // Append line to console
        task.console.textContent += line + '\n';
        task.console.scrollTop = task.console.scrollHeight;

        // Parse format: [download]  45.3% of ~50.00MiB at  2.00MiB/s ETA 00:15
        if (line.includes('[download]')) {
            const percentMatch = line.match(/([0-9.]+)%/);
            if (percentMatch) {
                const percent = parseFloat(percentMatch[1]);
                task.bar.style.width = `${percent}%`;
            }

            // Clean up line for details text
            const cleanLine = line.replace('[download]', '').trim();
            if (cleanLine && !cleanLine.includes('Destination')) {
                task.details.textContent = cleanLine;
                task.status.textContent = 'Downloading';
            }
        }
    }

    function finishTask(taskId, code) {
        const task = activeTasks.get(taskId);
        if (!task) return;

        if (code === 0) {
            task.status.textContent = 'Complete';
            task.status.className = 'task-status completed';
            task.bar.style.width = '100%';
            task.bar.style.background = 'var(--accent-green)';
            task.details.textContent = "Saved to your Mac's Downloads folder.";
            task.console.textContent += '\n✅ Download finished. Check your Downloads folder.\n';
            if (task.folderBtn) task.folderBtn.style.display = 'flex';
        } else {
            errorTask(taskId, `Process exited with code ${code}`);
        }
        task.console.scrollTop = task.console.scrollHeight;
    }

    function errorTask(taskId, errorStr) {
        const task = activeTasks.get(taskId);
        if (!task) return;

        task.status.textContent = 'Error';
        task.status.className = 'task-status error';
        task.bar.style.background = 'var(--accent-red)';
        task.details.textContent = 'Failed';
        task.console.textContent += `\n❌ ERROR: ${errorStr}\n`;
        task.console.scrollTop = task.console.scrollHeight;
    }
});
