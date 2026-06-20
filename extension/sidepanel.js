'use strict';

const $ = (sel) => document.querySelector(sel);

const versionEl = $('#sp-version');
const perfList = $('#sp-perf-list');
const perfTotal = $('#sp-perf-total');
const perfEmpty = $('#sp-perf-empty');
const selectorList = $('#sp-selector-list');
const selectorTotal = $('#sp-selector-total');
const selectorEmpty = $('#sp-selector-empty');
const storageStats = $('#sp-storage-stats');
const refreshBtn = $('#sp-refresh');

try {
    const manifest = chrome.runtime.getManifest();
    if (versionEl) versionEl.textContent = 'v' + (manifest.version || '');
} catch (_) { /* reason: manifest unavailable */ }

function isSupportedUrl(url) {
    return typeof url === 'string' && /^https:\/\/(www\.)?youtube\.com\//i.test(url);
}

async function getActiveYouTubeTab() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab && tab.id && isSupportedUrl(tab.url || '')) return tab;
    } catch (_) { /* reason: tabs query failed */ }
    return null;
}

function sendToTab(tabId, message) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 2000);
        try {
            chrome.tabs.sendMessage(tabId, message, (msg) => {
                clearTimeout(timer);
                if (chrome.runtime.lastError) { resolve(null); return; }
                resolve(msg);
            });
        } catch (_) { clearTimeout(timer); resolve(null); }
    });
}

async function renderPerf(tab) {
    if (!perfList) return;
    perfList.textContent = '';
    if (!tab) { if (perfEmpty) perfEmpty.hidden = false; return; }
    if (perfEmpty) perfEmpty.hidden = true;

    const resp = await sendToTab(tab.id, { type: 'YTKIT_GET_FEATURE_PERF' });
    if (!resp || !resp.ok || !Array.isArray(resp.features)) {
        if (perfEmpty) { perfEmpty.hidden = false; perfEmpty.textContent = 'Content script not responding.'; }
        return;
    }
    if (perfTotal) perfTotal.textContent = `${resp.totalFeatures} measured`;
    const top = resp.features.slice(0, 20);
    if (!top.length) {
        if (perfEmpty) { perfEmpty.hidden = false; perfEmpty.textContent = 'No features initialized yet.'; }
        return;
    }
    const maxMs = top[0].initMs || 1;
    for (const feat of top) {
        const li = document.createElement('li');
        li.className = 'sp-perf-row';
        if (feat.initMs > 50) li.classList.add('sp-perf-slow');
        const name = document.createElement('span');
        name.className = 'fp-name';
        name.textContent = feat.id;
        const bar = document.createElement('span');
        bar.className = 'fp-bar';
        bar.style.width = Math.max(2, (feat.initMs / maxMs) * 100) + '%';
        const ms = document.createElement('span');
        ms.className = 'fp-ms';
        ms.textContent = feat.initMs + 'ms';
        li.appendChild(name);
        li.appendChild(bar);
        li.appendChild(ms);
        perfList.appendChild(li);
    }
}

async function renderSelectorHealth(tab) {
    if (!selectorList) return;
    selectorList.textContent = '';
    if (!tab) { if (selectorEmpty) selectorEmpty.hidden = false; return; }
    if (selectorEmpty) selectorEmpty.hidden = true;

    const resp = await sendToTab(tab.id, { type: 'YTKIT_GET_SELECTOR_HEALTH' });
    if (!resp || !resp.ok || !Array.isArray(resp.surfaces)) {
        if (selectorEmpty) { selectorEmpty.hidden = false; selectorEmpty.textContent = 'Content script not responding.'; }
        return;
    }
    if (selectorTotal) selectorTotal.textContent = `${resp.totalSurfaces} surfaces`;
    const top = resp.surfaces.slice(0, 12);
    if (!top.length) {
        if (selectorEmpty) { selectorEmpty.hidden = false; selectorEmpty.textContent = 'No surfaces sampled yet.'; }
        return;
    }
    for (const surface of top) {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.className = 'sh-name';
        name.textContent = surface.surface
            + (surface.highChurn ? ' ⚡' : '')
            + (surface.needsFreshCapture ? ' 📷' : '');
        const stats = document.createElement('span');
        stats.className = 'sh-stats';
        const parts = [`${surface.hits || 0} hits`];
        if (surface.errors > 0) parts.push(`${surface.errors} err`);
        if (surface.misses > 0) parts.push(`${surface.misses} miss`);
        if (surface.shapeDrifts > 0) parts.push(`${surface.shapeDrifts} drift`);
        stats.textContent = parts.join(' · ');
        if (surface.errors > 0) stats.classList.add('sh-errors');
        li.appendChild(name);
        li.appendChild(stats);
        selectorList.appendChild(li);
    }
}

async function renderStorage() {
    if (!storageStats) return;
    storageStats.textContent = '';
    try {
        const data = await chrome.storage.local.get(null);
        const keys = Object.keys(data);
        const bytes = new TextEncoder().encode(JSON.stringify(data)).length;
        const stats = [
            { label: 'Keys', value: String(keys.length) },
            { label: 'Size', value: bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : (bytes / 1024).toFixed(0) + ' KB' },
        ];
        for (const s of stats) {
            const div = document.createElement('div');
            div.className = 'sp-stat';
            const label = document.createElement('div');
            label.className = 'sp-stat-label';
            label.textContent = s.label;
            const value = document.createElement('div');
            value.className = 'sp-stat-value';
            value.textContent = s.value;
            div.appendChild(label);
            div.appendChild(value);
            storageStats.appendChild(div);
        }
    } catch (_) { /* reason: storage read failed */ }
}

async function refresh() {
    const tab = await getActiveYouTubeTab();
    await Promise.all([renderPerf(tab), renderSelectorHealth(tab), renderStorage()]);
}

if (refreshBtn) refreshBtn.addEventListener('click', () => { void refresh(); });
void refresh();
