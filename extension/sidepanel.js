'use strict';

// Cross-browser extension namespace via core/browser-api.js (loaded first
// by sidepanel.html / sidebar.html). Prefers the standards-track `browser`
// namespace, falls back to `chrome`; the trailing chrome fallback keeps
// static previews working if the wrapper script tag was stripped.
const ext = globalThis.YTKitBrowser?.hasNamespace
    ? globalThis.YTKitBrowser.ns
    : (typeof chrome !== 'undefined' ? chrome : null);

const $ = (sel) => document.querySelector(sel);

// ── i18n ──
// Mirrors popup.js: resolves user-facing strings via ext.i18n by
// default, honouring the manual locale override the popup language
// dropdown persists to ext.storage.local `_localeOverride`. English
// literals stay inline at every call site as the fallback so the
// source remains self-documenting and static previews keep working.
const I18N = { override: null, map: null, ready: false };

// Bundled locales — must match the directories under extension/_locales/.
const BUNDLED_LOCALES = Object.freeze([
    'ar', 'en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pt_BR', 'ru', 'zh_CN'
]);
const BUNDLED_LOCALE_SET = new Set(BUNDLED_LOCALES);

// Defense: reject locale strings that aren't on the allowlist or that
// contain path-separator / parent-segment characters (same guard as
// popup.js — the storage key is a public surface).
function isValidLocaleTag(locale) {
    if (typeof locale !== 'string') return false;
    if (!locale || locale === 'auto') return false;
    if (locale.length > 16) return false;
    if (!/^[A-Za-z]{2,3}(?:[_-][A-Za-z0-9]{2,8})?$/.test(locale)) return false;
    return BUNDLED_LOCALE_SET.has(locale);
}

async function initI18n() {
    try {
        const items = await ext.storage.local.get('_localeOverride') || {};
        const locale = (items._localeOverride || '').trim();
        if (!locale || locale === 'auto') { I18N.ready = true; return; }
        if (!isValidLocaleTag(locale)) {
            // Stale or hostile override — fall back to ext.i18n auto-detect.
            I18N.ready = true;
            return;
        }
        const url = ext.runtime.getURL(`_locales/${locale}/messages.json`);
        const resp = await fetch(url);
        if (!resp.ok) { I18N.ready = true; return; }
        const json = await resp.json();
        const flat = {};
        for (const [k, v] of Object.entries(json)) {
            if (v && typeof v === 'object' && typeof v.message === 'string') flat[k] = v.message;
        }
        I18N.override = locale;
        I18N.map = flat;
        I18N.ready = true;
    } catch (_) { I18N.ready = true; }
}

// Keep <html lang>/<html dir> truthful for assistive tech and RTL
// locales (ar/he/fa/ur), mirroring popup.js applyDocumentLanguage().
// Locale tags are stored with an underscore (pt_BR) but the lang
// attribute wants BCP-47 (pt-BR).
const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

function applyDocumentLanguage() {
    try {
        const resolvedLocale = I18N.override
            || (ext?.i18n?.getUILanguage && ext.i18n.getUILanguage())
            || 'en';
        if (resolvedLocale) {
            const bcp47 = resolvedLocale.replace('_', '-');
            document.documentElement.lang = bcp47;
            const base = bcp47.split('-')[0].toLowerCase();
            document.documentElement.dir = RTL_LOCALES.has(base) ? 'rtl' : 'ltr';
        }
    } catch (_) { /* reason: lang/dir attributes are best-effort a11y metadata */ }
}

function t(key, fallback) {
    try {
        if (I18N.map && Object.prototype.hasOwnProperty.call(I18N.map, key)) {
            const m = I18N.map[key];
            if (m) return m;
        }
        if (ext?.i18n?.getMessage) {
            const m = ext.i18n.getMessage(key);
            if (m) return m;
        }
    } catch (_) { /* reason: i18n is best-effort */ }
    return (fallback != null) ? fallback : key;
}

function applyI18n(root = document) {
    // Walk every element with data-i18n* attributes and populate text /
    // title / aria-label / placeholder. Falls back to the existing inline
    // text so an element without a translated key still reads English.
    root.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;
        const fallback = el.textContent;
        const v = t(key, fallback);
        if (v !== fallback) el.textContent = v;
    });
    const ATTR_KEYS = ['title', 'placeholder', 'aria-label'];
    ATTR_KEYS.forEach((attr) => {
        const dataAttr = `data-i18n-attr-${attr}`;
        root.querySelectorAll(`[${dataAttr}]`).forEach((el) => {
            const key = el.getAttribute(dataAttr);
            if (!key) return;
            const fallback = el.getAttribute(attr) || '';
            const v = t(key, fallback);
            if (v !== fallback) el.setAttribute(attr, v);
        });
    });
}

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
    const manifest = ext.runtime.getManifest();
    setText(versionEl, manifest.version ? 'v' + manifest.version : '');
} catch (_) { /* reason: manifest unavailable */ }

function setText(el, text) {
    if (!el) return;
    const value = text == null ? '' : String(text);
    el.textContent = value;
    if (el.classList?.contains('sp-section-meta') || el.classList?.contains('sp-version')) {
        el.hidden = value.trim().length === 0;
    }
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

function emptyTitleForState(state) {
    if (state === 'error') return t('spEmptyTitleError', 'Needs a refresh');
    if (state === 'success') return t('spEmptyTitleSuccess', 'All clear');
    return t('spEmptyTitleIdle', 'Waiting for signal');
}

function hasTabsCreate() {
    return typeof ext?.tabs?.create === 'function';
}

function openYouTubeTab() {
    if (!hasTabsCreate()) return;
    try { ext.tabs.create({ url: 'https://www.youtube.com/' }); } catch (_) { /* reason: optional in static preview */ }
}

function showEmpty(el, message, state = 'idle', options = {}) {
    if (!el) return;
    el.hidden = false;
    el.dataset.state = state;
    el.textContent = '';

    const icon = document.createElement('span');
    icon.className = 'sp-empty-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = state === 'error' ? '!' : 'i';

    const copy = document.createElement('span');
    copy.className = 'sp-empty-copy';
    const title = document.createElement('strong');
    title.className = 'sp-empty-title';
    title.textContent = options.title || emptyTitleForState(state);
    const detail = document.createElement('span');
    detail.className = 'sp-empty-detail';
    detail.textContent = message;
    copy.appendChild(title);
    copy.appendChild(detail);

    el.appendChild(icon);
    el.appendChild(copy);
    if (options.actionLabel && typeof options.action === 'function') {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'sp-empty-action';
        action.textContent = options.actionLabel;
        action.setAttribute('aria-label', options.actionAriaLabel || options.actionLabel);
        action.addEventListener('click', options.action);
        el.appendChild(action);
    }
}

function hideEmpty(el) {
    if (!el) return;
    el.hidden = true;
    el.textContent = '';
    delete el.dataset.state;
}

function setBusy(isBusy) {
    document.body.dataset.loading = String(isBusy);
    document.querySelector('.sp-main')?.setAttribute('aria-busy', String(isBusy));
    if (refreshBtn) {
        refreshBtn.disabled = isBusy;
        refreshBtn.setAttribute('aria-busy', String(isBusy));
    }
    if (settingsList) {
        settingsList.setAttribute('aria-busy', String(isBusy));
        if (isBusy) settingsList.setAttribute('inert', '');
        else settingsList.removeAttribute('inert');
    }
}

function isSupportedUrl(url) {
    try {
        const parsed = new URL(url);
        const h = parsed.hostname;
        if (h === 'm.youtube.com' || h === 'studio.youtube.com') return false;
        if (parsed.pathname.startsWith('/live_chat')) return false;
        return h === 'youtu.be'
            || h === 'youtube.com'
            || h === 'youtube-nocookie.com'
            || h.endsWith('.youtube.com')
            || h.endsWith('.youtube-nocookie.com');
    } catch { return false; }
}

async function getActiveYouTubeTab() {
    try {
        const [tab] = await ext.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab && tab.id && isSupportedUrl(tab.url || '')) return tab;
    } catch (_) { /* reason: tabs query failed */ }
    return null;
}

function sendToTab(tabId, message) {
    // The wrapper may be absent — sidepanel.js deliberately falls back to bare
    // `chrome` at the top of this file for static previews. Calling through it
    // unconditionally threw there and broke the per-section empty states.
    const send = globalThis.YTKitBrowser?.sendTabMessage;
    if (typeof send !== 'function') return Promise.resolve(null);
    return send(tabId, message, { timeoutMs: 2000 });
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

// Localized wrapper: schema category ids ("watch-player") map to
// spCategory_* locale keys; the formatted English id stays the fallback
// so unknown categories still render readable text.
function localizeCategory(category) {
    const id = String(category || 'general').replace(/-/g, '_');
    return t(`spCategory_${id}`, formatCategory(category));
}

function formatMeta(value) {
    return String(value || '')
        .replace(/-/g, ' ')
        .replace(/^./, c => c.toUpperCase());
}

// Localized wrapper for schema metadata vocabulary (risk/scope values).
function localizeMeta(value) {
    const id = String(value || '').toLowerCase().replace(/-/g, '_');
    return t(`spMeta_${id}`, formatMeta(value));
}

function rowLabel(humanName, on, entry) {
    const pieces = [
        humanName,
        on ? t('toggleStateOn', 'Enabled') : t('toggleStateOff', 'Disabled'),
        localizeCategory(entry.category),
        t('spRiskTpl', '{risk} risk').replace('{risk}', localizeMeta(entry.risk)),
        t('spScopeTpl', '{scope} scope').replace('{scope}', localizeMeta(entry.scope))
    ];
    return pieces.filter(Boolean).join('. ');
}

async function renderPerf(tab) {
    if (!perfList) return;
    perfList.textContent = '';
    setText(perfTotal, '');
    if (!tab) {
        showEmpty(perfEmpty, t('spPerfEmptyNoTab', 'Open YouTube in the active tab, then refresh to measure startup timing.'), 'idle', {
            title: t('spPerfEmptyNoTabTitle', 'Open YouTube to measure startup'),
            actionLabel: hasTabsCreate() ? t('openYouTube', 'Open YouTube') : '',
            action: openYouTubeTab
        });
        return;
    }
    hideEmpty(perfEmpty);

    const resp = await sendToTab(tab.id, { type: 'YTKIT_GET_FEATURE_PERF' });
    if (!resp || !resp.ok || !Array.isArray(resp.features)) {
        showEmpty(perfEmpty, t('spPerfEmptyNoResponse', 'Content script is not responding. Reload the YouTube tab, then refresh diagnostics.'), 'error', {
            title: t('spPerfEmptyNoResponseTitle', 'Reconnect the active tab')
        });
        return;
    }
    setText(perfTotal, t('spPerfTotalTpl', '{count} measured').replace('{count}', String(resp.totalFeatures)));
    const top = resp.features.slice(0, 20);
    if (!top.length) {
        showEmpty(perfEmpty, t('spPerfEmptyNoData', 'Start playback or navigate once, then refresh to capture feature timing.'), 'idle', {
            title: t('spPerfEmptyNoDataTitle', 'No startup timings yet')
        });
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
        showEmpty(selectorEmpty, t('spSelectorEmptyNoTab', 'Open YouTube in the active tab to check whether page selectors still fit.'), 'idle', {
            title: t('spSelectorEmptyNoTabTitle', 'Open YouTube to check page fit')
        });
        return;
    }
    hideEmpty(selectorEmpty);

    const resp = await sendToTab(tab.id, { type: 'YTKIT_GET_SELECTOR_HEALTH' });
    if (!resp || !resp.ok || !Array.isArray(resp.surfaces)) {
        showEmpty(selectorEmpty, t('spSelectorEmptyNoResponse', 'Content script is not responding. Reload YouTube, then refresh diagnostics.'), 'error', {
            title: t('spSelectorEmptyNoResponseTitle', 'Reconnect selector health')
        });
        return;
    }
    setText(selectorTotal, t('spSelectorTotalTpl', '{count} surfaces').replace('{count}', String(resp.totalSurfaces)));
    const top = resp.surfaces.slice(0, 12);
    if (!top.length) {
        showEmpty(selectorEmpty, t('spSelectorEmptyNoData', 'Navigate YouTube once, then refresh to sample the surfaces this dashboard tracks.'), 'idle', {
            title: t('spSelectorEmptyNoDataTitle', 'No surfaces sampled yet')
        });
        return;
    }
    for (const surface of top) {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.className = 'sh-name';
        name.textContent = surface.surface
            + (surface.highChurn ? ' ' + t('spSelectorHighChurn', 'high churn') : '')
            + (surface.needsFreshCapture ? ' ' + t('spSelectorNeedsCapture', 'needs capture') : '');
        const stats = document.createElement('span');
        stats.className = 'sh-stats';
        const parts = [t('spSelectorHitsTpl', '{count} hits').replace('{count}', String(surface.hits || 0))];
        if (surface.errors > 0) parts.push(t('spSelectorErrTpl', '{count} err').replace('{count}', String(surface.errors)));
        if (surface.misses > 0) parts.push(t('spSelectorMissTpl', '{count} miss').replace('{count}', String(surface.misses)));
        if (surface.shapeDrifts > 0) parts.push(t('spSelectorDriftTpl', '{count} drift').replace('{count}', String(surface.shapeDrifts)));
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
    if (!Number.isFinite(n) || n <= 0) return t('spAgeNever', 'never');
    const sec = Math.max(0, Math.round((Date.now() - n) / 1000));
    if (sec < 60) return `${sec}s`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m`;
    return `${Math.round(min / 60)}h`;
}

function externalDetail(service) {
    const parts = [];
    if (service.lastSuccessTs) {
        parts.push(t('spExternalOkAgoTpl', 'ok {age} ago').replace('{age}', externalAge(service.lastSuccessTs)));
    }
    if (service.lastErrorClass) parts.push(service.lastErrorClass);
    if (service.cacheState && service.cacheState !== 'unknown') {
        parts.push(t('spExternalCacheTpl', 'cache {state}').replace('{state}', String(service.cacheState)));
    }
    if (service.fallbackState) {
        parts.push(t('spExternalFallbackTpl', 'fallback {state}').replace('{state}', String(service.fallbackState)));
    }
    const budget = service.requestBudget;
    if (budget && Number.isFinite(Number(budget.used)) && Number.isFinite(Number(budget.limit))) {
        parts.push(t('spExternalBudgetTpl', 'budget {used}/{limit}')
            .replace('{used}', String(budget.used))
            .replace('{limit}', String(budget.limit)));
    }
    return parts.join(' | ') || t('spExternalNoRequests', 'No requests observed yet.');
}

async function renderExternalHealth(tab) {
    if (!externalList) return;
    externalList.textContent = '';
    setText(externalTotal, '');
    if (!tab) {
        showEmpty(externalEmpty, t('spExternalEmptyNoTab', 'Open YouTube to see SponsorBlock, DeArrow, and RYD request health.'), 'idle', {
            title: t('spExternalEmptyNoTabTitle', 'Open YouTube to check integrations')
        });
        return;
    }
    hideEmpty(externalEmpty);

    const resp = await sendToTab(tab.id, { type: 'YTKIT_GET_EXTERNAL_API_HEALTH' });
    if (!resp || !resp.ok || !Array.isArray(resp.services)) {
        showEmpty(externalEmpty, t('spExternalEmptyNoResponse', 'Content script is not responding. Reload YouTube, then refresh external API health.'), 'error', {
            title: t('spExternalEmptyNoResponseTitle', 'Reconnect integration health')
        });
        return;
    }
    setText(externalTotal, t('externalHealthTotalTpl', '{count} services')
        .replace('{count}', String(resp.totalServices || resp.services.length)));
    if (!resp.services.length) {
        showEmpty(externalEmpty, t('spExternalEmptyNoData', 'No external services have been used in this session. Play or navigate once to collect request health.'), 'idle', {
            title: t('spExternalEmptyNoDataTitle', 'No requests observed yet')
        });
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
        state.textContent = service.state || t('spStateUnknown', 'unknown');
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
        const data = await ext.storage.local.get(null);
        const keys = Object.keys(data);
        const bytes = new TextEncoder().encode(JSON.stringify(data)).length;
        const settings = data[SETTINGS_KEY] && typeof data[SETTINGS_KEY] === 'object'
            ? data[SETTINGS_KEY] : {};
        const stats = [
            { label: t('statKeys', 'Keys'), value: String(keys.length) },
            { label: t('spStatSize', 'Size'), value: formatBytes(bytes) },
            { label: t('panelTitle', 'Settings'), value: String(Object.keys(settings).length) },
            { label: t('statHidden', 'Hidden'), value: String(countStoredItems(data['ytkit-hidden-videos'])) },
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
        const label = document.createElement('span');
        label.className = 'sp-stat-label';
        label.textContent = t('statStorage', 'Storage');
        const value = document.createElement('strong');
        value.className = 'sp-stat-value';
        value.textContent = t('spStatUnavailable', 'Unavailable');
        const detail = document.createElement('span');
        detail.className = 'sp-stat-detail';
        detail.textContent = t('spStorageUnavailableDetail', 'Reload the extension context to read local data.');
        div.appendChild(label);
        div.appendChild(value);
        div.appendChild(detail);
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
let _settingsLoadError = '';
let _settingsMutationController = null;
// Each entry: [nameKey, nameFallback, descKey, descFallback]. Locale keys
// resolve through t() at getSchema() time (after initI18n); the English
// literals stay inline as self-documenting fallbacks. Names reuse popup
// qt_/feature_ keys where the copy is identical; sidepanel-specific copy
// lives under spq_* keys.
const QUICK_SETTINGS = Object.freeze({
    removeAllShorts: ['qt_removeAllShorts_name', 'Hide Shorts', 'spq_removeAllShorts_desc', 'Remove Shorts shelves and navigation links.'],
    hideRelatedVideos: ['feature_hideRelatedVideos_name', 'Hide Related Videos', 'spq_hideRelatedVideos_desc', 'Clear the watch-page side rail.'],
    disableInfiniteScroll: ['spq_disableInfiniteScroll_name', 'Cap Infinite Scroll', 'spq_disableInfiniteScroll_desc', 'Stop feeds from loading forever.'],
    sponsorBlock: ['qt_sponsorBlock_name', 'SponsorBlock', 'spq_sponsorBlock_desc', 'Skip crowd-marked sponsor segments.'],
    deArrow: ['qt_deArrow_name', 'DeArrow', 'spq_deArrow_desc', 'Replace clickbait titles and thumbnails.'],
    commentSearch: ['qt_commentSearch_name', 'Comment Search', 'spq_commentSearch_desc', 'Filter watch-page comments inline.'],
    disableAutoplayNext: ['spq_disableAutoplayNext_name', 'Disable Autoplay', 'spq_disableAutoplayNext_desc', 'Stop the next video from starting automatically.'],
    persistentSpeed: ['qt_persistentSpeed_name', 'Persistent Speed', 'spq_persistentSpeed_desc', 'Keep playback speed consistent between videos.'],
    autoTheaterMode: ['feature_autoTheaterMode_name', 'Auto Theater Mode', 'spq_autoTheaterMode_desc', 'Open videos in theater view.'],
    blueLightFilter: ['qt_blueLightFilter_name', 'Blue-Light Filter', 'spq_blueLightFilter_desc', 'Warm the player for late viewing.'],
    miniPlayerBar: ['qt_miniPlayerBar_name', 'Mini Player Bar', 'spq_miniPlayerBar_desc', 'Keep essential controls visible while scrolling.'],
    digitalWellbeing: ['qt_digitalWellbeing_name', 'Digital Wellbeing', 'spq_digitalWellbeing_desc', 'Track breaks and daily viewing time.'],
    cleanShareUrls: ['feature_cleanShareUrls_name', 'Clean Share URLs', 'spq_cleanShareUrls_desc', 'Remove tracking parameters from copied links.'],
    transcriptViewer: ['qt_transcriptViewer_name', 'Transcript Sidebar', 'spq_transcriptViewer_desc', 'Read, jump through, and export captions.'],
    debugMode: ['spq_debugMode_name', 'Diagnostic Logging', 'spq_debugMode_desc', 'Record detailed local diagnostics for troubleshooting.'],
    privacyDataFlowPanel: ['spq_privacyDataFlowPanel_name', 'Data-Flow Panel', 'spq_privacyDataFlowPanel_desc', 'Review every service Astra Deck can contact.']
});

function getSchema() {
    if (_settingsSchema) return _settingsSchema;
    const scope = typeof window !== 'undefined' && window.__YTKIT_SETTINGS_SCHEMA__;
    if (!scope || !Array.isArray(scope.SETTINGS_SCHEMA)) return [];
    _settingsSchema = scope.SETTINGS_SCHEMA
        .filter(entry => entry.type === 'boolean' && QUICK_SETTINGS[entry.key])
        .map(entry => {
            const spec = QUICK_SETTINGS[entry.key];
            return {
                ...entry,
                quickLabel: t(spec[0], spec[1]),
                quickDescription: t(spec[2], spec[3])
            };
        });
    return _settingsSchema;
}

async function loadSettings() {
    try {
        const data = await ext.storage.local.get(SETTINGS_KEY);
        _settingsState = (data && data[SETTINGS_KEY] && typeof data[SETTINGS_KEY] === 'object')
            ? data[SETTINGS_KEY] : {};
        _settingsLoadError = '';
        return true;
    } catch (error) {
        _settingsState = {};
        _settingsLoadError = error?.message || 'Storage unavailable';
        return false;
    }
}

async function requestOptionalHostsForToggle(key, value) {
    // Mirror the popup's grant flow: enabling a feature whose origin is
    // declared under optional_host_permissions (store-safe builds) must
    // prompt inside the click gesture; everything else passes through.
    if (value !== true) return true;
    try {
        const core = globalThis.YTKitCore || {};
        if (typeof core.getOptionalHostPermissionsForFeature !== 'function') return true;
        const declared = chrome?.runtime?.getManifest?.().optional_host_permissions || [];
        if (!Array.isArray(declared) || !declared.length) return true;
        const declaredSet = new Set(declared);
        const origins = (core.getOptionalHostPermissionsForFeature(key) || [])
            .filter((origin) => declaredSet.has(origin));
        if (!origins.length) return true;
        const factory = core.createOptionalHostPermissions;
        const helper = (typeof factory === 'function') ? factory() : null;
        if (!helper || !helper.isSupported()) return false;
        return await helper.request(origins);
    } catch (_) {
        return false;
    }
}

async function writeSetting(key, value) {
    try {
        if (!_settingsMutationController) {
            const factory = globalThis.YTKitCore?.createSettingsMutationController;
            if (typeof factory !== 'function') return false;
            _settingsMutationController = factory({ source: 'sidepanel' });
        }
        const result = await _settingsMutationController.mutate(key, value);
        if (!result.ok) return false;
        _settingsState = result.settings;
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
        entry.vehicle,
        entry.quickDescription
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
    if (_settingsLoadError) {
        setText(overviewSettings, String(schema.length));
        setText(overviewEnabled, '--');
        if (settingsCount) settingsCount.textContent = t('spStatUnavailable', 'Unavailable');
        if (settingsClear) settingsClear.hidden = !query;
        showEmpty(settingsEmpty, t('spSettingsErrorMsg', 'Quick settings could not load because browser storage is unavailable. Reload the panel, or use the toolbar popup after the extension context is ready.'), 'error', {
            title: t('spSettingsErrorTitle', 'Quick settings unavailable'),
            actionLabel: t('spReloadPanel', 'Reload panel'),
            actionAriaLabel: t('spReloadPanelAria', 'Reload the Astra Deck panel'),
            action: () => {
                try { window.location.reload(); } catch (_) { /* reason: reload unavailable in static preview */ }
            }
        });
        return;
    }
    const visible = schema.filter(entry => {
        if (!query) return true;
        const humanName = entry.quickLabel || formatHumanName(entry.key);
        return settingSearchHaystack(entry, humanName).includes(query);
    });
    const enabled = schema.filter(entry => Boolean(_settingsState[entry.key] ?? entry.defaultValue)).length;

    setText(overviewSettings, String(schema.length));
    setText(overviewEnabled, String(enabled));
    if (settingsCount) {
        settingsCount.textContent = query
            ? `${visible.length}/${schema.length}`
            : t('spSettingsCountOnTpl', '{enabled}/{total} on')
                .replace('{enabled}', String(enabled))
                .replace('{total}', String(schema.length));
    }
    if (settingsClear) settingsClear.hidden = !query;

    if (visible.length) {
        hideEmpty(settingsEmpty);
    } else if (query) {
        showEmpty(settingsEmpty, t('spSettingsNoMatchTpl', 'No settings match "{query}". Clear the filter to return to all controls.').replace('{query}', String(filter)), 'idle', {
            title: t('spSettingsNoMatchTitle', 'No matching quick settings'),
            actionLabel: settingsClear ? t('spSettingsClearFilter', 'Clear filter') : '',
            actionAriaLabel: t('spSettingsClearFilterAria', 'Clear quick settings filter'),
            action: () => {
                if (!settingsSearch) return;
                settingsSearch.value = '';
                renderSettings('');
                settingsSearch.focus();
            }
        });
    } else {
        showEmpty(settingsEmpty, t('spSettingsEmptyMsg', 'Quick settings could not load. Reload the panel, or use the toolbar popup on a YouTube tab to manage every Astra Deck control.'), 'idle', {
            title: t('spSettingsEmptyTitle', 'No quick settings available'),
            actionLabel: t('spReloadPanel', 'Reload panel'),
            actionAriaLabel: t('spReloadPanelAria', 'Reload the Astra Deck panel'),
            // There is no options page (retired into the popup); reloading the
            // panel re-runs the schema injection that this empty state implies
            // failed. openOptionsPage() here was a silent no-op.
            action: () => {
                try { window.location.reload(); } catch (_) { /* reason: reload unavailable in static preview */ }
            }
        });
    }

    for (const [category, entries] of groupSettings(visible)) {
        const group = document.createElement('section');
        group.className = 'sp-settings-group';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', localizeCategory(category));

        const head = document.createElement('div');
        head.className = 'sp-settings-group-head';
        const title = document.createElement('span');
        title.className = 'sp-settings-group-title';
        title.textContent = localizeCategory(category);
        const count = document.createElement('span');
        count.className = 'sp-settings-group-count';
        const enabledInGroup = entries.filter(entry => Boolean(_settingsState[entry.key] ?? entry.defaultValue)).length;
        count.textContent = `${enabledInGroup}/${entries.length}`;
        head.appendChild(title);
        head.appendChild(count);
        group.appendChild(head);

        for (const entry of entries) {
            const on = Boolean(_settingsState[entry.key] ?? entry.defaultValue);
            const humanName = entry.quickLabel || formatHumanName(entry.key);
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
            const description = document.createElement('span');
            description.className = 'sp-setting-description';
            description.textContent = entry.quickDescription || '';
            const meta = document.createElement('span');
            meta.className = 'sp-setting-meta';
            const exceptionalMeta = [];
            if (entry.risk && entry.risk !== 'safe') exceptionalMeta.push([entry.risk, entry.risk]);
            if (entry.scope && entry.scope !== 'global') exceptionalMeta.push([entry.scope, 'scope']);
            if (entry.profile && entry.profile !== 'both') exceptionalMeta.push([entry.profile, 'profile']);
            for (const [label, tone] of exceptionalMeta) {
                const chip = document.createElement('span');
                chip.className = 'sp-setting-chip';
                chip.dataset.tone = tone;
                chip.textContent = localizeMeta(label);
                meta.appendChild(chip);
            }
            meta.hidden = exceptionalMeta.length === 0;
            copy.appendChild(name);
            copy.appendChild(description);
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
                row.setAttribute('aria-busy', 'true');
                row.setAttribute('aria-disabled', 'true');
                row.removeAttribute('data-error');
                row.setAttribute('aria-checked', String(next));
                row.setAttribute('aria-description', rowLabel(humanName, next, entry));
                const granted = await requestOptionalHostsForToggle(entry.key, next);
                const saved = granted ? await writeSetting(entry.key, next) : false;
                row.dataset.saving = 'false';
                row.removeAttribute('aria-busy');
                row.removeAttribute('aria-disabled');
                if (!saved) {
                    row.dataset.error = 'true';
                    row.setAttribute('aria-checked', String(!next));
                    row.setAttribute('aria-description', t('spRowSaveFailedTpl', '{name}. Save failed. Try refreshing the dashboard.').replace('{name}', humanName));
                    setRefreshStatus(t('spStatusSaveFailed', 'Could not save setting'), 'error');
                    return;
                }
                renderSettings(settingsSearch?.value || '');
                // Restore focus to the same setting row after re-render so
                // keyboard users don't lose their position.
                try {
                    const refocusTarget = settingsList?.querySelector(`[title^="${CSS.escape(entry.key)} "]`);
                    if (refocusTarget) refocusTarget.focus();
                } catch (_) { /* reason: CSS.escape or querySelector may fail */ }
                setRefreshStatus(
                    t(next ? 'spStatusEnabledTpl' : 'spStatusDisabledTpl', next ? '{name} enabled' : '{name} disabled')
                        .replace('{name}', humanName),
                    'success'
                );
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
}

if (settingsClear) {
    settingsClear.addEventListener('click', () => {
        if (!settingsSearch) return;
        settingsSearch.value = '';
        renderSettings('');
        settingsSearch.focus();
    });
}

if (ext?.storage?.onChanged) {
    ext.storage.onChanged.addListener((changes, areaName) => {
        // Settings live in local storage; ignore session/sync writes so a
        // same-named key in another area can't clobber the cache.
        if (areaName !== 'local') return;
        if (changes[SETTINGS_KEY]) {
            _settingsLoadError = '';
            _settingsState = (changes[SETTINGS_KEY].newValue && typeof changes[SETTINGS_KEY].newValue === 'object')
                ? changes[SETTINGS_KEY].newValue : {};
            // Preserve focus position across re-renders driven by external
            // storage changes (e.g. popup writes while side panel is open).
            const focused = document.activeElement;
            const focusKey = focused?.title?.split(' (')?.[0];
            renderSettings(settingsSearch?.value || '');
            if (focusKey && settingsList) {
                try {
                    const target = settingsList.querySelector(`[title^="${CSS.escape(focusKey)} "]`);
                    if (target) target.focus();
                } catch (_) { /* reason: focus restore is best-effort */ }
            }
        }
    });
}

async function refresh() {
    setBusy(true);
    setRefreshStatus(t('spStatusRefreshing', 'Refreshing…'), 'busy');
    try {
        const tab = await getActiveYouTubeTab();
        document.body.dataset.context = tab ? 'ready' : 'local';
        setContextState(
            tab ? t('spContextYouTubeTab', 'YouTube tab') : t('spLocalOnly', 'Local only'),
            tab ? 'ready' : 'warn'
        );
        await Promise.all([
            renderPerf(tab),
            renderSelectorHealth(tab),
            renderExternalHealth(tab),
            renderStorage()
        ]);
        const settingsLoaded = await loadSettings();
        renderSettings(settingsSearch?.value || '');
        if (!settingsLoaded) {
            setRefreshStatus(t('spStatusSettingsLoadFailed', 'Diagnostics updated; quick settings could not load'), 'warn');
        } else {
            setRefreshStatus(
                tab
                    ? t('spStatusUpdated', 'Live diagnostics updated')
                    : t('spStatusOpenYouTube', 'Open YouTube for live diagnostics'),
                tab ? 'success' : 'warn'
            );
        }
    } catch (_) {
        // reason: an unexpected render failure must not strand the only
        // recovery control disabled with a "Refreshing..." status forever.
        setRefreshStatus(t('spStatusRefreshFailed', 'Refresh failed — try again'), 'error');
    } finally {
        setBusy(false);
    }
}

if (refreshBtn) refreshBtn.addEventListener('click', () => { void refresh(); });

// Boot: resolve the locale override first so every rendered string —
// including the cached quick-settings schema labels — reflects the
// user's language, then localize the static markup and set <html
// lang/dir> before the first paint of dynamic content.
void initI18n().then(() => {
    applyDocumentLanguage();
    applyI18n();
    return refresh();
});
