// YTKit Options Page - Standalone settings management via chrome.storage.local
(function() {
    'use strict';

    const manifest = chrome.runtime.getManifest();
    document.getElementById('version').textContent = 'v' + manifest.version;

    function showStatus(message, type) {
        const el = document.getElementById('status');
        el.textContent = message;
        el.className = 'status ' + type;
    }

    // Export
    document.getElementById('export-btn').addEventListener('click', async () => {
        try {
            const all = await chrome.storage.local.get(null);
            const exportData = {
                settings: all.ytSuiteSettings || {},
                hiddenVideos: all['ytkit-hidden-videos'] || [],
                blockedChannels: all['ytkit-blocked-channels'] || [],
                bookmarks: all['ytkit-bookmarks'] || {},
                exportVersion: 3,
                exportDate: new Date().toISOString(),
                ytkitVersion: manifest.version
            };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = Object.assign(document.createElement('a'), {
                href: url,
                download: 'ytkit_settings_' + new Date().toISOString().slice(0, 10) + '.json'
            });
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            showStatus('Settings exported successfully.', 'success');
        } catch (err) {
            showStatus('Export failed: ' + err.message, 'error');
        }
    });

    // Import
    document.getElementById('import-btn').addEventListener('click', () => {
        document.getElementById('import-file').click();
    });

    document.getElementById('import-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (typeof data !== 'object' || data === null) throw new Error('Invalid format');

            const writes = {};
            if (data.exportVersion >= 3) {
                if (data.settings && typeof data.settings === 'object') writes.ytSuiteSettings = data.settings;
                if (Array.isArray(data.hiddenVideos)) writes['ytkit-hidden-videos'] = data.hiddenVideos;
                if (Array.isArray(data.blockedChannels)) writes['ytkit-blocked-channels'] = data.blockedChannels;
                if (data.bookmarks && typeof data.bookmarks === 'object') writes['ytkit-bookmarks'] = data.bookmarks;
            } else if (data.exportVersion >= 2) {
                if (data.settings && typeof data.settings === 'object') writes.ytSuiteSettings = data.settings;
                if (Array.isArray(data.hiddenVideos)) writes['ytkit-hidden-videos'] = data.hiddenVideos;
                if (Array.isArray(data.blockedChannels)) writes['ytkit-blocked-channels'] = data.blockedChannels;
            } else {
                writes.ytSuiteSettings = data;
            }

            if (Object.keys(writes).length === 0) throw new Error('No valid settings found in file');

            await chrome.storage.local.set(writes);
            showStatus('Settings imported. Reload YouTube tabs to apply.', 'success');
            showStorageInfo();
        } catch (err) {
            showStatus('Import failed: ' + err.message, 'error');
        }
        e.target.value = '';
    });

    // Reset
    document.getElementById('reset-btn').addEventListener('click', async () => {
        try {
            await chrome.storage.local.clear();
            showStatus('All settings cleared. Reload YouTube tabs to apply.', 'success');
            showStorageInfo();
        } catch (err) {
            showStatus('Reset failed: ' + err.message, 'error');
        }
    });

    // Storage info
    async function showStorageInfo() {
        try {
            const all = await chrome.storage.local.get(null);
            const bytes = new Blob([JSON.stringify(all)]).size;
            const keys = Object.keys(all).length;
            document.getElementById('storage-info').textContent =
                keys + ' keys, ~' + (bytes / 1024).toFixed(1) + ' KB used';
        } catch (err) {
            document.getElementById('storage-info').textContent = 'Unable to read storage';
        }
    }
    showStorageInfo();
})();
