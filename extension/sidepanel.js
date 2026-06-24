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

// ── Settings panel ──
const SETTINGS_KEY = 'ytSuiteSettings';
const settingsList = $('#sp-settings-list');
const settingsEmpty = $('#sp-settings-empty');
const settingsCount = $('#sp-settings-count');
const settingsSearch = $('#sp-settings-search');
let _settingsSchema = null;
let _settingsState = {};

function getSchema() {
    if (_settingsSchema) return _settingsSchema;
    const scope = typeof window !== 'undefined' && window.__YTKIT_SETTINGS_SCHEMA__;
    if (!scope || !Array.isArray(scope.SETTINGS_SCHEMA)) return [];
    _settingsSchema = scope.SETTINGS_SCHEMA.filter(e =>
        e.type === 'boolean' && !e.internal && e.key !== '_settingsVersion'
    );
    return _settingsSchema;
}

async function loadSettings() {
    try {
        const data = await chrome.storage.local.get(SETTINGS_KEY);
        _settingsState = (data && data[SETTINGS_KEY] && typeof data[SETTINGS_KEY] === 'object')
            ? data[SETTINGS_KEY] : {};
    } catch (_) { _settingsState = {}; }
}

async function writeSetting(key, value) {
    _settingsState[key] = value;
    try {
        await chrome.storage.local.set({ [SETTINGS_KEY]: _settingsState });
        const tabs = await chrome.tabs.query({ url: ['*://*.youtube.com/*'] });
        for (const tab of tabs) {
            try {
                chrome.tabs.sendMessage(tab.id, { type: 'YTKIT_SETTING_CHANGED', key, value }, () => {
                    void chrome.runtime.lastError;
                });
            } catch (_) { /* reason: tab may be closing */ }
        }
    } catch (_) { /* reason: storage write best-effort */ }
}

function renderSettings(filter) {
    if (!settingsList) return;
    settingsList.textContent = '';
    const schema = getSchema();
    const query = (filter || '').toLowerCase().trim();
    const visible = schema.filter(entry => {
        if (!query) return true;
        return entry.key.toLowerCase().includes(query)
            || (entry.category || '').toLowerCase().includes(query);
    });

    if (settingsEmpty) settingsEmpty.hidden = visible.length > 0;
    if (settingsCount) settingsCount.textContent = query
        ? `${visible.length} of ${schema.length} settings`
        : `${schema.length} settings`;

    for (const entry of visible) {
        const on = Boolean(_settingsState[entry.key] ?? entry.defaultValue);
        const row = document.createElement('div');
        row.className = 'sp-setting-row';
        row.setAttribute('role', 'switch');
        row.setAttribute('aria-checked', String(on));
        row.setAttribute('tabindex', '0');
        row.title = `${entry.key} (${entry.category || 'general'})`;

        const name = document.createElement('span');
        name.className = 'sp-setting-name';
        name.textContent = entry.key;

        const sw = document.createElement('span');
        sw.className = 'sp-setting-switch';

        row.appendChild(name);
        row.appendChild(sw);

        row.addEventListener('click', async () => {
            const next = !Boolean(_settingsState[entry.key] ?? entry.defaultValue);
            row.setAttribute('aria-checked', String(next));
            await writeSetting(entry.key, next);
        });
        row.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                row.click();
            }
        });
        settingsList.appendChild(row);
    }
}

if (settingsSearch) {
    let _debounce = null;
    settingsSearch.addEventListener('input', () => {
        clearTimeout(_debounce);
        _debounce = setTimeout(() => renderSettings(settingsSearch.value), 150);
    });
}

chrome.storage.onChanged.addListener((changes) => {
    if (changes[SETTINGS_KEY]) {
        _settingsState = (changes[SETTINGS_KEY].newValue && typeof changes[SETTINGS_KEY].newValue === 'object')
            ? changes[SETTINGS_KEY].newValue : {};
        renderSettings(settingsSearch?.value || '');
    }
});

async function refresh() {
    const tab = await getActiveYouTubeTab();
    await Promise.all([renderPerf(tab), renderSelectorHealth(tab), renderStorage()]);
    await loadSettings();
    renderSettings(settingsSearch?.value || '');
}

if (refreshBtn) refreshBtn.addEventListener('click', () => { void refresh(); });
void refresh();
