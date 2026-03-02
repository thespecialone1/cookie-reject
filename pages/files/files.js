(async function () {
    'use strict';

    const filesList = document.getElementById('filesList');
    const emptyState = document.getElementById('emptyState');
    const selectAll = document.getElementById('selectAll');
    const selectedCount = document.getElementById('selectedCount');
    const btnDownloadSelected = document.getElementById('btnDownloadSelected');
    const btnDeleteSelected = document.getElementById('btnDeleteSelected');

    let screenshots = [];
    let selectedIds = new Set();

    async function init() {
        try {
            screenshots = await window.screenshotDB.getAllScreenshots();
            renderList();
        } catch (e) {
            console.error('Failed to load screenshots', e);
        }
    }

    function renderList() {
        // Clear all except empty state
        const items = filesList.querySelectorAll('.file-item');
        items.forEach(i => i.remove());

        if (screenshots.length === 0) {
            emptyState.style.display = 'flex';
            toolbarState();
            return;
        }

        emptyState.style.display = 'none';

        screenshots.forEach(shot => {
            const row = document.createElement('div');
            row.className = 'file-item';
            row.dataset.id = shot.id;
            if (selectedIds.has(shot.id)) row.classList.add('selected');

            // Checkbox
            const chkWrap = document.createElement('div');
            chkWrap.className = 'file-checkbox-wrapper';
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.className = 'checkbox item-checkbox';
            chk.dataset.id = shot.id;
            chk.checked = selectedIds.has(shot.id);
            chk.addEventListener('change', (e) => {
                if (e.target.checked) selectedIds.add(shot.id);
                else selectedIds.delete(shot.id);
                row.classList.toggle('selected', e.target.checked);
                updateSelection();
            });
            chkWrap.appendChild(chk);

            // Info (URL link)
            const info = document.createElement('div');
            info.className = 'file-info';
            const link = document.createElement('a');
            link.href = '../screenshot/screenshot.html?id=' + encodeURIComponent(shot.id);
            link.className = 'file-link';
            link.target = '_blank';
            // Provide a fallback if sourceUrl is empty
            const displayUrl = shot.sourceUrl || ('Screenshot from ' + new Date(shot.timestamp).toLocaleString());
            link.textContent = displayUrl;
            info.appendChild(link);

            // Meta (Size and Date)
            const meta = document.createElement('div');
            meta.className = 'file-meta';

            const size = document.createElement('div');
            size.className = 'file-size';
            size.textContent = formatBytes(shot.sizeBytes);

            const date = document.createElement('div');
            date.className = 'file-date';
            date.textContent = formatDate(shot.timestamp);

            meta.appendChild(size);
            meta.appendChild(date);

            row.appendChild(chkWrap);
            row.appendChild(info);
            row.appendChild(meta);

            filesList.appendChild(row);
        });

        updateSelection();
    }

    function updateSelection() {
        const count = selectedIds.size;
        selectedCount.textContent = `(${count} Selected)`;

        selectAll.checked = count > 0 && count === screenshots.length;
        selectAll.indeterminate = count > 0 && count < screenshots.length;

        const hasSelection = count > 0;
        btnDownloadSelected.disabled = !hasSelection;
        btnDeleteSelected.disabled = !hasSelection;
    }

    function toolbarState() {
        selectAll.checked = false;
        selectAll.indeterminate = false;
        selectedCount.textContent = '(0 Selected)';
        btnDownloadSelected.disabled = true;
        btnDeleteSelected.disabled = true;
    }

    selectAll.addEventListener('change', (e) => {
        const checked = e.target.checked;
        if (checked) {
            screenshots.forEach(s => selectedIds.add(s.id));
        } else {
            selectedIds.clear();
        }
        renderList();
    });

    // Bulk Delete
    btnDeleteSelected.addEventListener('click', async () => {
        if (!confirm(`Delete ${selectedIds.size} screenshot(s)? This action cannot be undone.`)) return;

        btnDeleteSelected.disabled = true;
        btnDeleteSelected.textContent = 'Deleting...';

        try {
            for (const id of selectedIds) {
                await window.screenshotDB.deleteScreenshot(id);
            }
            selectedIds.clear();
            await init();
        } catch (e) {
            console.error('Delete failed', e);
            alert('Failed to delete some screenshots.');
        } finally {
            btnDeleteSelected.textContent = 'Delete';
        }
    });

    // Bulk Download
    btnDownloadSelected.addEventListener('click', async () => {
        // Find which format to use from settings
        const res = await chrome.storage.local.get(['imageFormat']);
        const ext = res.imageFormat === 'jpg' ? 'jpg' : 'png';

        for (const id of selectedIds) {
            const shot = screenshots.find(s => s.id === id);
            if (shot) {
                const ts = new Date(shot.timestamp).toISOString().replace(/[:.]/g, '-').substring(0, 19);
                const link = document.createElement('a');
                link.download = `screenshot_${ts}.${ext}`;
                link.href = shot.dataUrl; // Usually saved as jpeg in DB, but browser handles extension mismatch or we can convert
                link.click();

                // Slight delay to not overwhelm browser downloads
                await new Promise(r => setTimeout(r, 200));
            }
        }

        // De-select after download for convenience
        selectedIds.clear();
        renderList();
    });

    // Utility
    function formatBytes(bytes, decimals = 2) {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    function formatDate(ms) {
        const d = new Date(ms);
        return d.toLocaleDateString() + ', ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Start
    init();

})();
