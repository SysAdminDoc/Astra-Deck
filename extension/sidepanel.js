'use strict';

const $ = (sel) => document.querySelector(sel);

const versionEl = $('#sp-version');
const contextChip = $('#sp-context-chip');
const overviewContext = $('#sp-overview-context');
const overviewSettings = $('#sp-overview-settings');
const overviewEnabled = $('#sp-overview-enabled');
const perfList = $('#sp-perf-list');
const perfTotal = $('#sp-perf-total');
const perfEmpty = $('#sp-perf-empty');
const selectorList = $('#sp-selector-list');
const selectorTotal = $('#sp-selector-total');
const selectorEmpty = $('#sp-selector-empty');
const externalList = $('#sp-external-list');
const externalTotal = $('#sp-external-total');
const externalEmpty = $('#sp-external-empty');
const storageStats = $('#sp-storage-stats');
const refreshBtn = $('#sp-refresh');
const refreshStatus = $('#sp-refresh-status');
const settingsList = $('#sp-settings-list');
const settingsEmpty = $('#sp-settings-empty');
const settingsCount = $('#sp-settings-count');
const settingsSearch = $('#sp-settings-search');
const settingsClear = $('#sp-settings-clear');
const SETTINGS_KEY = 'ytSuiteSettings';

try {
    const manifest = chrome.runtime.getManifest();
    if (versionEl) versionEl.textContent = 'v' + (manifest.version || '');
} catch (_) { /* reason: manifest unavailable */ }

function setText(el, text) {
    if (el) el.textContent = text;
}

function setContextState(label, state = 'idle') {
    setText(contextChip, label);
    if (contextChip) contextChip.dataset.state = state;
    setText(overviewContext, label);
}

function setRefreshStatus(label, state = 'idle') {
    setText(refreshStatus, label);
    if (refreshStatus) refreshStatus.dataset.state = state;
}

function showEmpty(el, message, state = 'idle') {
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
    el.dataset.state = state;
}

function hideEmpty(el) {
    if (!el) return;
    el.hidden = true;
    el.textContent = '';
    delete el.dataset.state;
}

function setBusy(isBusy) {
    if (!refreshBtn) return;
    refreshBtn.disabled = isBusy;
    refreshBtn.setAttribute('aria-busy', String(isBusy));
}

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

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

function formatHumanName(key) {
    return String(key || '')
        .replace(/([A-Z])/g, ' $1')
        .replace(/[-_]+/g, ' ')
        .replace(/^./, c => c.toUpperCase())
        .trim();
}

function formatCategory(category) {
    return String(category || 'general')
        .split('-')
        .map(part => part ? part[0].toUpperCase() + part.slice(1) : part)
        .join(' ');
}

function formatMeta(value) {
    return String(value || '')
        .replace(/-/g, ' ')
        .replace(/^./, c => c.toUpperCase());
}

function rowLabel(humanName, on, entry) {
    const pieces = [
        humanName,
        on ? 'Enabled' : 'Disabled',
        formatCategory(entry.category),
        `${formatMeta(entry.risk)} risk`,
        `${formatMeta(entry.scope)} scope`
    ];
    return pieces.filter(Boolean).join('. ');
}

async function renderPerf(tab) {
    if (!perfList) return;
    perfList.textContent = '';
    setText(perfTotal, '');
    if (!tab) {
        showEmpty(perfEmpty, 'Open YouTube in the active tab, then refresh to measure startup timing.');
        return;
    }
    hideEmpty(perfEmpty);

    const resp = await sendToTab(tab.id, { type: 'YTKIT_GET_FEATURE_PERF' });
    if (!resp || !resp.ok || !Array.isArray(resp.features)) {
        showEmpty(perfEmpty, 'Content script not responding. Reload the YouTube tab and refresh.', 'error');
        return;
    }
    setText(perfTotal, `${resp.totalFeatures} measured`);
    const top = resp.features.slice(0, 20);
    if (!top.length) {
        showEmpty(perfEmpty, 'No features have initialized yet. Start playback or navigate once, then refresh.');
        return;
    }
    const maxMs = top[0].initMs || 1;
    for (const feat of top) {
        const li = document.createElement('li');
        li.className = 'sp-perf-row';
        li.setAttribute('aria-label', `${feat.id}: ${feat.initMs}ms`);
        if (feat.initMs > 50) li.classList.add('sp-perf-slow');
        const name = document.createElement('span');
        name.className = 'fp-name';
        name.textContent = feat.id;
        const bar = document.createElement('span');
        bar.className = 'fp-bar';
        bar.style.width = Math.max(3, (feat.initMs / maxMs) * 100) + '%';
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
    setText(selectorTotal, '');
    if (!tab) {
        showEmpty(selectorEmpty, 'Selector health needs an active YouTube tab.');
        return;
    }
    hideEmpty(selectorEmpty);

    const resp = await sendToTab(tab.id, { type: 'YTKIT_GET_SELECTOR_HEALTH' });
    if (!resp || !resp.ok || !Array.isArray(resp.surfaces)) {
        showEmpty(selectorEmpty, 'Content script not responding. Reload YouTube and refresh diagnostics.', 'error');
        return;
    }
    setText(selectorTotal, `${resp.totalSurfaces} surfaces`);
    const top = resp.surfaces.slice(0, 12);
    if (!top.length) {
        showEmpty(selectorEmpty, 'No surfaces sampled yet. Navigate YouTube once, then refresh.');
        return;
    }
    for (const surface of top) {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.className = 'sh-name';
        name.textContent = surface.surface
            + (surface.highChurn ? ' high churn' : '')
            + (surface.needsFreshCapture ? ' needs capture' : '');
        const stats = document.createElement('span');
        stats.className = 'sh-stats';
        const parts = [`${surface.hits || 0} hits`];
        if (surface.errors > 0) parts.push(`${surface.errors} err`);
        if (surface.misses > 0) parts.push(`${surface.misses} miss`);
        if (surface.shapeDrifts > 0) parts.push(`${surface.shapeDrifts} drift`);
        stats.textContent = parts.join(' | ');
        if (surface.errors > 0) stats.classList.add('sh-errors');
        if (surface.shapeDrifts > 0) stats.classList.add('sh-drifts');
        li.appendChild(name);
        li.appendChild(stats);
        selectorList.appendChild(li);
    }
}

function externalTone(state) {
    if (state === 'ok') return 'ok';
    if (state === 'degraded') return 'degraded';
    if (state === 'rate-limited') return 'rate-limited';
    if (state === 'error') return 'error';
    return 'unknown';
}

function externalAge(ts) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return 'never';
    const sec = Math.max(0, Math.round((Date.now() - n) / 1000));
    if (sec < 60) return `${sec}s`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m`;
    return `${Math.round(min / 60)}h`;
}

function externalDetail(service) {
    const parts = [];
    if (service.lastSuccessTs) parts.push(`ok ${externalAge(service.lastSuccessTs)} ago`);
    if (service.lastErrorClass) parts.push(service.lastErrorClass);
    if (service.cacheState && service.cacheState !== 'unknown') parts.push(`cache ${service.cacheState}`);
    if (service.fallbackState) parts.push(`fallback ${service.fallbackState}`);
    const budget = service.requestBudget;
    if (budget && Number.isFinite(Number(budget.used)) && Number.isFinite(Number(budget.limit))) {
        parts.push(`budget ${budget.used}/${budget.limit}`);
    }
    return parts.join(' | ') || 'No requests observed yet.';
}

async function renderExternalHealth(tab) {
    if (!externalList) return;
    externalList.textContent = '';
    setText(externalTotal, '');
    if (!tab) {
        showEmpty(externalEmpty, 'External health needs an active YouTube tab.');
        return;
    }
    hideEmpty(externalEmpty);

    const resp = await sendToTab(tab.id, { type: 'YTKIT_GET_EXTERNAL_API_HEALTH' });
    if (!resp || !resp.ok || !Array.isArray(resp.services)) {
        showEmpty(externalEmpty, 'Content script not responding. Reload YouTube and refresh external API health.', 'error');
        return;
    }
    setText(externalTotal, `${resp.totalServices || resp.services.length} services`);
    if (!resp.services.length) {
        showEmpty(externalEmpty, 'No external services have been used in this session.');
        return;
    }
    for (const service of resp.services) {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.className = 'eh-name';
        name.textContent = service.label || service.id;
        const state = document.createElement('span');
        state.className = 'eh-state';
        state.dataset.tone = externalTone(service.state);
        state.textContent = service.state || 'unknown';
        const detail = document.createElement('span');
        detail.className = 'eh-detail';
        detail.textContent = externalDetail(service);
        li.appendChild(name);
        li.appendChild(state);
        li.appendChild(detail);
        externalList.appendChild(li);
    }
}

async function renderStorage() {
    if (!storageStats) return;
    storageStats.textContent = '';
    try {
        const data = await chrome.storage.local.get(null);
        const keys = Object.keys(data);
        const bytes = new TextEncoder().encode(JSON.stringify(data)).length;
        const settings = data[SETTINGS_KEY] && typeof data[SETTINGS_KEY] === 'object'
            ? data[SETTINGS_KEY] : {};
        const stats = [
            { label: 'Keys', value: String(keys.length) },
            { label: 'Size', value: formatBytes(bytes) },
            { label: 'Settings', value: String(Object.keys(settings).length) },
            { label: 'Hidden', value: String(countStoredItems(data['ytkit-hidden-videos'])) },
        ];
        for (const s of stats) {
            const div = document.createElement('div');
            div.className = 'sp-stat';
            const label = document.createElement('span');
            label.className = 'sp-stat-label';
            label.textContent = s.label;
            const value = document.createElement('strong');
            value.className = 'sp-stat-value';
            value.textContent = s.value;
            div.appendChild(label);
            div.appendChild(value);
            storageStats.appendChild(div);
        }
    } catch (_) {
        const div = document.createElement('div');
        div.className = 'sp-stat';
        div.textContent = 'Storage unavailable';
        storageStats.appendChild(div);
    }
}

function countStoredItems(value) {
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === 'object') return Object.keys(value).length;
    return 0;
}

// Settings panel
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
        return true;
    } catch (_) {
        return false;
    }
}

function settingSearchHaystack(entry, humanName) {
    return [
        entry.key,
        humanName,
        entry.category,
        entry.risk,
        entry.scope,
        entry.profile,
        entry.vehicle
    ].filter(Boolean).join(' ').toLowerCase();
}

function groupSettings(entries) {
    const groups = new Map();
    for (const entry of entries) {
        const category = entry.category || 'general';
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category).push(entry);
    }
    return groups;
}

function renderSettings(filter) {
    if (!settingsList) return;
    settingsList.textContent = '';
    const schema = getSchema();
    const query = (filter || '').toLowerCase().trim();
    const visible = schema.filter(entry => {
        if (!query) return true;
        const humanName = formatHumanName(entry.key);
        return settingSearchHaystack(entry, humanName).includes(query);
    });
    const enabled = schema.filter(entry => Boolean(_settingsState[entry.key] ?? entry.defaultValue)).length;

    setText(overviewSettings, String(schema.length));
    setText(overviewEnabled, String(enabled));
    if (settingsCount) {
        settingsCount.textContent = query
            ? `${visible.length}/${schema.length}`
            : `${enabled}/${schema.length} on`;
    }
    if (settingsClear) settingsClear.hidden = !query;

    if (settingsEmpty) {
        settingsEmpty.hidden = visible.length > 0;
        if (!visible.length) {
            settingsEmpty.textContent = query
                ? `No settings match "${filter}". Clear the filter to return to all controls.`
                : 'No quick settings available.';
        }
    }

    for (const [category, entries] of groupSettings(visible)) {
        const group = document.createElement('section');
        group.className = 'sp-settings-group';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', formatCategory(category));

        const head = document.createElement('div');
        head.className = 'sp-settings-group-head';
        const title = document.createElement('span');
        title.className = 'sp-settings-group-title';
        title.textContent = formatCategory(category);
        const count = document.createElement('span');
        count.className = 'sp-settings-group-count';
        const enabledInGroup = entries.filter(entry => Boolean(_settingsState[entry.key] ?? entry.defaultValue)).length;
        count.textContent = `${enabledInGroup}/${entries.length}`;
        head.appendChild(title);
        head.appendChild(count);
        group.appendChild(head);

        for (const entry of entries) {
            const on = Boolean(_settingsState[entry.key] ?? entry.defaultValue);
            const humanName = formatHumanName(entry.key);
            const row = document.createElement('div');
            row.className = 'sp-setting-row';
            row.setAttribute('role', 'switch');
            row.setAttribute('aria-checked', String(on));
            row.setAttribute('aria-label', humanName);
            row.setAttribute('aria-description', rowLabel(humanName, on, entry));
            row.setAttribute('tabindex', '0');
            row.title = `${entry.key} (${entry.category || 'general'})`;

            const copy = document.createElement('span');
            copy.className = 'sp-setting-copy';
            const name = document.createElement('span');
            name.className = 'sp-setting-name';
            name.textContent = humanName;
            const meta = document.createElement('span');
            meta.className = 'sp-setting-meta';
            for (const [label, tone] of [
                [entry.risk || 'safe', entry.risk || 'safe'],
                [entry.scope || 'global', 'scope'],
                [entry.profile || 'both', 'profile']
            ]) {
                const chip = document.createElement('span');
                chip.className = 'sp-setting-chip';
                chip.dataset.tone = tone;
                chip.textContent = formatMeta(label);
                meta.appendChild(chip);
            }
            copy.appendChild(name);
            copy.appendChild(meta);

            const sw = document.createElement('span');
            sw.className = 'sp-setting-switch';
            sw.setAttribute('aria-hidden', 'true');

            row.appendChild(copy);
            row.appendChild(sw);

            row.addEventListener('click', async () => {
                if (row.dataset.saving === 'true') return;
                const next = !Boolean(_settingsState[entry.key] ?? entry.defaultValue);
                row.dataset.saving = 'true';
                row.removeAttribute('data-error');
                row.setAttribute('aria-checked', String(next));
                row.setAttribute('aria-description', rowLabel(humanName, next, entry));
                const saved = await writeSetting(entry.key, next);
                row.dataset.saving = 'false';
                if (!saved) {
                    row.dataset.error = 'true';
                    row.setAttribute('aria-checked', String(!next));
                    row.setAttribute('aria-description', `${humanName}. Save failed. Try refreshing the dashboard.`);
                    setRefreshStatus('Could not save setting', 'error');
                    return;
                }
                renderSettings(settingsSearch?.value || '');
                setRefreshStatus(`${humanName} ${next ? 'enabled' : 'disabled'}`, 'success');
            });
            row.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    row.click();
                }
            });
            group.appendChild(row);
        }
        settingsList.appendChild(group);
    }
}

if (settingsSearch) {
    let _debounce = null;
    settingsSearch.addEventListener('input', () => {
        clearTimeout(_debounce);
        _debounce = setTimeout(() => renderSettings(settingsSearch.value), 120);
    });
    settingsSearch.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && settingsSearch.value) {
            event.preventDefault();
            settingsSearch.value = '';
            renderSettings('');
            settingsSearch.focus();
        }
    });
}

if (settingsClear) {
    settingsClear.addEventListener('click', () => {
        if (!settingsSearch) return;
        settingsSearch.value = '';
        renderSettings('');
        settingsSearch.focus();
    });
}

if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes) => {
        if (changes[SETTINGS_KEY]) {
            _settingsState = (changes[SETTINGS_KEY].newValue && typeof changes[SETTINGS_KEY].newValue === 'object')
                ? changes[SETTINGS_KEY].newValue : {};
            renderSettings(settingsSearch?.value || '');
        }
    });
}

async function refresh() {
    setBusy(true);
    setRefreshStatus('Refreshing...', 'busy');
    const tab = await getActiveYouTubeTab();
    setContextState(tab ? 'YouTube tab' : 'Local only', tab ? 'ready' : 'warn');
    await Promise.all([
        renderPerf(tab),
        renderSelectorHealth(tab),
        renderExternalHealth(tab),
        renderStorage()
    ]);
    await loadSettings();
    renderSettings(settingsSearch?.value || '');
    setRefreshStatus(tab ? 'Live diagnostics updated' : 'Open YouTube for live diagnostics', tab ? 'success' : 'warn');
    setBusy(false);
}

if (refreshBtn) refreshBtn.addEventListener('click', () => { void refresh(); });
void refresh();
