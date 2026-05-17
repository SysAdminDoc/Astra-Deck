// Astra Deck — Toolbar Popup
// Quick-toggle 15 most-used features plus full data management
// (export, import, reset, storage stats) previously hosted by the
// standalone options page.

const QUICK_TOGGLES = [
    { key: 'removeAllShorts',        group: 'Feed Cleanup',      name: 'Hide Shorts',            desc: 'Remove Shorts from feeds' },
    { key: 'hideRelatedVideos',      group: 'Feed Cleanup',      name: 'Hide Related',           desc: 'No related panel on watch' },
    { key: 'disableInfiniteScroll',  group: 'Feed Cleanup',      name: 'Cap Scroll',             desc: 'Stop infinite scroll' },
    { key: 'sponsorBlock',           group: 'Watch Flow',        name: 'SponsorBlock',           desc: 'Skip sponsored segments' },
    { key: 'deArrow',                group: 'Watch Flow',        name: 'DeArrow',                desc: 'Better titles & thumbnails' },
    { key: 'commentSearch',          group: 'Watch Flow',        name: 'Comment Search',         desc: 'Filter comments on watch pages' },
    { key: 'disableAutoplayNext',    group: 'Playback',          name: 'No Autoplay',            desc: 'Stop auto-advance to next' },
    { key: 'persistentSpeed',        group: 'Playback',          name: 'Persistent Speed',       desc: 'Remember playback rate' },
    { key: 'autoTheaterMode',        group: 'Playback',          name: 'Auto Theater',           desc: 'Default to theater view' },
    { key: 'blueLightFilter',        group: 'Focus',             name: 'Blue-Light Filter',      desc: 'Warmer colors' },
    { key: 'miniPlayerBar',          group: 'Focus',             name: 'Mini Player Bar',        desc: 'Floating bar on scroll' },
    { key: 'digitalWellbeing',       group: 'Focus',             name: 'Digital Wellbeing',      desc: 'Break reminders + daily cap' },
    { key: 'cleanShareUrls',         group: 'Utilities',         name: 'Clean URLs',             desc: 'Strip tracking params' },
    { key: 'transcriptViewer',       group: 'Utilities',         name: 'Transcript Sidebar',     desc: 'Clickable transcript + export' },
    { key: 'debugMode',              group: 'Utilities',         name: 'Debug Mode',             desc: 'Verbose console logging' },
];

const SVG_NS = 'http://www.w3.org/2000/svg';
const GROUP_ICONS = {
    'Feed Cleanup': [
        { tag: 'polygon', attrs: { points: '2 4 14 4 10 9 10 14 6 12 6 9' } },
    ],
    'Watch Flow': [
        { tag: 'circle',  attrs: { cx: '8', cy: '8', r: '6' } },
        { tag: 'polygon', attrs: { points: '7 5.5 11 8 7 10.5' } },
    ],
    'Playback': [
        { tag: 'polygon', attrs: { points: '3 3 8 8 3 13' } },
        { tag: 'polygon', attrs: { points: '8 3 13 8 8 13' } },
    ],
    'Focus': [
        { tag: 'path',    attrs: { d: 'M13 9.5A5.5 5.5 0 1 1 6.5 3a4 4 0 0 0 6.5 6.5z' } },
    ],
    'Utilities': [
        { tag: 'path',    attrs: { d: 'M11 2l3 3-1.5 1.5a2.5 2.5 0 0 1-3.5 0 2.5 2.5 0 0 1 0-3.5L11 2z' } },
        { tag: 'line',    attrs: { x1: '9.5', y1: '6.5', x2: '3', y2: '13' } },
    ],
};

function createGroupIcon(groupName) {
    const spec = GROUP_ICONS[groupName];
    if (!spec) return null;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'toggle-group-icon');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '12');
    svg.setAttribute('height', '12');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    for (const { tag, attrs } of spec) {
        const el = document.createElementNS(SVG_NS, tag);
        for (const [name, value] of Object.entries(attrs)) {
            el.setAttribute(name, value);
        }
        svg.appendChild(el);
    }
    return svg;
}

// ── i18n (Phase A) ──
// Resolves user-facing strings via chrome.i18n by default. A manual
// override (popup language dropdown) writes to chrome.storage.local
// `_localeOverride`; when set, we fetch that locale's bundled
// messages.json once and serve from it. English literals stay inline
// at every call site as the fallback so the source remains
// self-documenting and the userscript build (no chrome.i18n) keeps
// working.
const I18N = { override: null, map: null, ready: false };

async function initI18n() {
    try {
        const items = await new Promise((resolve) =>
            chrome.storage.local.get(['_localeOverride'], (i) => resolve(i || {})));
        const locale = (items._localeOverride || '').trim();
        if (!locale || locale === 'auto') { I18N.ready = true; return; }
        const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
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

function t(key, fallback) {
    try {
        if (I18N.map && Object.prototype.hasOwnProperty.call(I18N.map, key)) {
            const m = I18N.map[key];
            if (m) return m;
        }
        if (chrome?.i18n?.getMessage) {
            const m = chrome.i18n.getMessage(key);
            if (m) return m;
        }
    } catch (_) { /* reason: i18n is best-effort */ }
    return (fallback != null) ? fallback : key;
}

function initLanguageDropdown() {
    const sel = document.getElementById('languageSelect');
    if (!sel) return;
    sel.value = I18N.override || 'auto';

    // Surface the auto-detected locale name on the "Auto" option label so
    // users can see what chrome.i18n picked for them. If the detected
    // locale matches one of our bundled options we show its native name;
    // otherwise we just show the BCP-47 tag.
    try {
        const autoOpt = sel.querySelector('option[value="auto"]');
        if (autoOpt && chrome?.i18n?.getUILanguage) {
            const ui = chrome.i18n.getUILanguage() || '';
            // Map BCP-47 → bundled native label so an Auto user with a
            // German browser sees "Auto — Deutsch" instead of "Auto (de)".
            const NATIVE = {
                en: 'English', de: 'Deutsch', es: 'Español', fr: 'Français',
                it: 'Italiano', ja: '日本語', ko: '한국어',
                'pt-BR': 'Português', 'pt': 'Português',
                ru: 'Русский', 'zh-CN': '简体中文', 'zh': '简体中文'
            };
            const detected = NATIVE[ui] || NATIVE[ui.split('-')[0]] || ui || '?';
            const baseLabel = t('languageAuto', 'Auto (browser default)');
            autoOpt.textContent = `${baseLabel} — ${detected}`;
        }
    } catch (_) { /* reason: i18n detection is best-effort */ }

    sel.addEventListener('change', async () => {
        const locale = sel.value || 'auto';
        try {
            await new Promise((resolve) =>
                chrome.storage.local.set({ _localeOverride: locale }, resolve));
        } catch (_) { /* reason: storage best-effort */ }
        // Reload the popup so every cached string reflects the new locale.
        // Cheaper than re-rendering every dynamic surface manually, and
        // matches user expectation when changing app language.
        location.reload();
    });
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

const BRAND_NAME = 'Astra Deck';
const SETTINGS_STORAGE_KEY = 'ytSuiteSettings';
const PANEL_OPEN_MESSAGE = 'YTKIT_OPEN_PANEL';
const QUICK_TOGGLE_KEYS = QUICK_TOGGLES.map((toggle) => toggle.key);
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const RETIRED_SETTING_KEYS = new Set([
    'preferredQuality',
    'useEnhancedBitrate',
    'hideQualityPopup',
]);
const SETTINGS_VERSION_FALLBACK = 6;
const SETTINGS_IMPORT_MIGRATIONS = Object.freeze({
    2(settings) {
        return settings;
    },
    3(settings) {
        settings.hidePinnedComments = true;
        return settings;
    },
    4(settings) {
        settings.autoExpandComments = true;
        return settings;
    },
    5(settings) {
        return settings;
    },
    6(settings) {
        for (const key of RETIRED_SETTING_KEYS) delete settings[key];
        return settings;
    },
});

const STORAGE_KEYS = {
    settings: 'ytSuiteSettings',
    hiddenVideos: 'ytkit-hidden-videos',
    allowedVideos: 'ytkit-video-hider-allowed-videos',
    blockedChannels: 'ytkit-blocked-channels',
    bookmarks: 'ytkit-bookmarks',
    legacySidebarOrder: 'ytkit_sidebar_order'
};

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const IMPORT_LIMITS = Object.freeze({
    hiddenVideos: 5000,
    allowedVideos: 5000,
    blockedChannels: 2000,
    bookmarkVideos: 400,
    bookmarksPerVideo: 100,
    bookmarkNoteChars: 500,
    totalBytes: 4.5 * 1024 * 1024
});

const YOUTUBE_TAB_URLS = [
    '*://youtube.com/*',
    '*://*.youtube.com/*',
    '*://youtube-nocookie.com/*',
    '*://*.youtube-nocookie.com/*',
    '*://youtu.be/*'
];

const popupState = {
    settings: {},
    activeTab: null,
    statusTimer: null
};

const $ = (s) => document.querySelector(s);
const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

// ── Element refs ──
const list = $('#toggles');
const q = $('#q');
const enabledCount = $('#enabledCount');
const contextState = $('#contextState');
const supportNote = $('#supportNote');
const resultsState = $('#resultsState');
const statusBanner = $('#status');
const clearSearchButton = $('#clearSearch');
const openPanelButton = $('#openPanel');
const exportButton = $('#export-btn');
const importButton = $('#import-btn');
const importFileInput = $('#import-file');
const resetButton = $('#reset-btn');
const statKeys = $('#stat-keys');
const statSize = $('#stat-size');
const statHidden = $('#stat-hidden-videos');
const statBlocked = $('#stat-blocked-channels');
const statBookmarks = $('#stat-bookmarks');

const healthBanner = $('#health-banner');
const healthDetail = $('#health-detail');
const healthCopyBtn = $('#health-copy-btn');
const healthSaveBtn = $('#health-save-btn');
const healthClearBtn = $('#health-clear-btn');
// Captured so the Copy button can drop the full diagnostic payload on the
// clipboard without rebuilding it from DOM text.
let healthCopyPayload = '';

function getVersion() {
    try { return (chrome.runtime.getManifest().version || '—'); } catch { return '—'; }
}

const versionEl = $('#version');
const manifestVersion = getVersion();
versionEl.textContent = 'v' + manifestVersion;
versionEl.title = manifestVersion === '—'
    ? `${BRAND_NAME} version unavailable`
    : `${BRAND_NAME} v${manifestVersion}`;

// ── Storage wrappers ──

function storageGet(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, (items) => {
            const error = chrome.runtime.lastError;
            if (error) { reject(new Error(error.message)); return; }
            resolve(items || {});
        });
    });
}

function storageSet(entries) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(entries, () => {
            const error = chrome.runtime.lastError;
            if (error) { reject(new Error(error.message)); return; }
            resolve();
        });
    });
}

function storageRemove(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.remove(keys, () => {
            const error = chrome.runtime.lastError;
            if (error) { reject(new Error(error.message)); return; }
            resolve();
        });
    });
}

function storageClear() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.clear(() => {
            const error = chrome.runtime.lastError;
            if (error) { reject(new Error(error.message)); return; }
            resolve();
        });
    });
}

// ── Shared helpers ──

function deepClone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSafeObjectKey(key) {
    return typeof key === 'string' && !UNSAFE_OBJECT_KEYS.has(key);
}

function sanitizeSettingsObject(settings) {
    if (!isPlainObject(settings)) return {};
    const sanitized = {};
    for (const [key, value] of Object.entries(settings)) {
        if (isSafeObjectKey(key) && !RETIRED_SETTING_KEYS.has(key)) sanitized[key] = value;
    }
    return sanitized;
}

function normalizeSettingsVersion(value) {
    const version = Number(value);
    return Number.isInteger(version) && version > 0 ? version : 1;
}

function recordSettingsMigrationDiagnostic(settings, message) {
    const errors = Array.isArray(settings._errors)
        ? settings._errors.filter(isPlainObject).slice(-499)
        : [];
    errors.push({
        ts: Date.now(),
        ctx: 'settings-migration',
        msg: String(message).slice(0, 500)
    });
    settings._errors = errors;
}

function migrateImportedSettings(settings, currentVersion, source = 'popup-import') {
    const migrated = sanitizeSettingsObject(settings);
    const targetVersion = normalizeSettingsVersion(currentVersion || SETTINGS_VERSION_FALLBACK);
    const startingVersion = normalizeSettingsVersion(migrated._settingsVersion);
    let version = startingVersion;

    if (version > targetVersion) {
        recordSettingsMigrationDiagnostic(
            migrated,
            `${source}: preserved future settings schema v${version}; stored by v${targetVersion}`
        );
        migrated._settingsVersion = targetVersion;
        return sanitizeSettingsObject(migrated);
    }

    while (version < targetVersion) {
        version += 1;
        const migration = SETTINGS_IMPORT_MIGRATIONS[version];
        if (migration) migration(migrated);
        recordSettingsMigrationDiagnostic(
            migrated,
            `${source}: applied settings migration v${version} (${startingVersion} -> ${targetVersion})`
        );
    }

    migrated._settingsVersion = targetVersion;
    return sanitizeSettingsObject(migrated);
}

async function readExtensionJson(filename, fallback) {
    try {
        const url = chrome.runtime?.getURL ? chrome.runtime.getURL(filename) : filename;
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        return isPlainObject(json) ? json : fallback;
    } catch (error) {
        console.warn(`[Astra Deck popup] Could not read ${filename}:`, error);
        return fallback;
    }
}

async function loadSettingsImportCatalog() {
    const [defaults, meta] = await Promise.all([
        readExtensionJson('default-settings.json', {}),
        readExtensionJson('settings-meta.json', { settingsVersion: SETTINGS_VERSION_FALLBACK })
    ]);
    const settingsVersion = normalizeSettingsVersion(meta.settingsVersion || SETTINGS_VERSION_FALLBACK);
    return { defaults: sanitizeSettingsObject(defaults), settingsVersion };
}

function mergeImportedSettingsWithDefaults(settings, defaults, settingsVersion, source) {
    const migrated = migrateImportedSettings(settings, settingsVersion, source);
    return sanitizeSettingsObject({
        ...defaults,
        ...migrated,
        _settingsVersion: settingsVersion
    });
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function countObjectEntries(value) {
    if (!value || typeof value !== 'object') return 0;
    return Object.keys(value).length;
}

function normalizeStoredSettings(items) {
    const rawSettings = items?.[SETTINGS_STORAGE_KEY];
    const settings = {};
    const legacyKeys = [];

    if (isPlainObject(rawSettings)) {
        for (const [key, value] of Object.entries(rawSettings)) {
            if (UNSAFE_OBJECT_KEYS.has(key)) continue;
            settings[key] = value;
        }
    }

    for (const key of QUICK_TOGGLE_KEYS) {
        if (typeof items?.[key] !== 'boolean') continue;
        legacyKeys.push(key);
        if (typeof settings[key] === 'undefined') settings[key] = items[key];
    }

    return { settings, legacyKeys };
}

async function loadSettings() {
    const items = await storageGet([SETTINGS_STORAGE_KEY, ...QUICK_TOGGLE_KEYS]);
    const normalized = normalizeStoredSettings(items);

    if (normalized.legacyKeys.length > 0) {
        await storageSet({ [SETTINGS_STORAGE_KEY]: normalized.settings });
        await storageRemove(normalized.legacyKeys);
    }

    popupState.settings = normalized.settings;
    return popupState.settings;
}

// Serialize writes so rapid toggle clicks can't race the merge cycle.
let _pendingWriteChain = Promise.resolve();
async function writeSetting(key, value) {
    const task = _pendingWriteChain.catch(() => undefined).then(async () => {
        const nextSettings = { ...popupState.settings, [key]: value };
        popupState.settings = nextSettings;
        await storageSet({ [SETTINGS_STORAGE_KEY]: nextSettings });
        return nextSettings;
    });
    _pendingWriteChain = task;
    return task;
}

// ── URL / tab classification ──

function isAnyYouTubeUrl(urlString) {
    try {
        const parsed = new URL(urlString);
        return parsed.hostname === 'youtu.be'
            || parsed.hostname === 'youtube.com'
            || parsed.hostname === 'youtube-nocookie.com'
            || parsed.hostname.endsWith('.youtube.com')
            || parsed.hostname.endsWith('.youtube-nocookie.com');
    } catch { return false; }
}

function isSupportedInlinePanelUrl(urlString) {
    try {
        const parsed = new URL(urlString);
        const hostname = parsed.hostname;
        if (hostname === 'm.youtube.com' || hostname === 'studio.youtube.com') return false;
        if (parsed.pathname.startsWith('/live_chat')) return false;
        return hostname === 'youtu.be'
            || hostname === 'youtube.com'
            || hostname === 'youtube-nocookie.com'
            || hostname.endsWith('.youtube.com')
            || hostname.endsWith('.youtube-nocookie.com');
    } catch { return false; }
}

function getTabContext(tab) {
    const url = tab?.url || '';
    if (isSupportedInlinePanelUrl(url)) {
        return {
            label: t('contextStateYouTube', 'YouTube'),
            note: t('contextNoteInlinePanel', 'Click Open Full Settings to launch the in-page workspace on this tab.'),
            openLabel: t('openFullSettings', 'Open Full Settings'),
            mode: 'inline-panel'
        };
    }
    if (isAnyYouTubeUrl(url)) {
        return {
            label: t('contextStateYouTube', 'YouTube'),
            note: t('contextNoteLaunch', 'Full settings live in the in-page workspace on watchable YouTube tabs.'),
            openLabel: t('openYouTube', 'Open YouTube'),
            mode: 'launch'
        };
    }
    return {
        label: t('contextStateAnyTab', 'Any Tab'),
        note: t('contextNoteAnyTab', 'Quick toggles sync once a YouTube tab is open.'),
        openLabel: t('openYouTube', 'Open YouTube'),
        mode: 'launch'
    };
}

function updateContext(tab) {
    popupState.activeTab = tab || null;
    const nextContext = getTabContext(tab);
    contextState.textContent = nextContext.label;
    supportNote.textContent = nextContext.note;
    openPanelButton.textContent = nextContext.openLabel;
}

// ── Status banner ──

function showStatus(message = '', type = 'info', durationMs = 2800) {
    if (popupState.statusTimer) {
        clearTimeout(popupState.statusTimer);
        popupState.statusTimer = null;
    }
    if (!message) {
        statusBanner.textContent = '';
        statusBanner.className = 'status';
        return;
    }
    statusBanner.textContent = message;
    statusBanner.className = `status ${type}`;
    if (durationMs > 0) {
        popupState.statusTimer = setTimeout(() => {
            statusBanner.textContent = '';
            statusBanner.className = 'status';
            popupState.statusTimer = null;
        }, durationMs);
    }
}

function isVisibleFocusableElement(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.hidden || element.closest('[hidden]')) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    return true;
}

function getFocusableElements(root = document.body) {
    return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isVisibleFocusableElement);
}

function getActiveFocusRoot() {
    const confirmShell = $('#confirm-shell');
    if (confirmShell && !confirmShell.hidden) return confirmShell;
    return document.body;
}

function focusInitialPopupControl() {
    requestAnimationFrame(() => {
        if (document.activeElement && document.activeElement !== document.body) return;
        const firstControl = getFocusableElements(document.body)[0];
        firstControl?.focus?.({ preventScroll: true });
    });
}

function handlePopupDialogKeydown(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        window.close();
        return;
    }
    if (event.key === 'Tab') {
        const focusRoot = getActiveFocusRoot();
        const focusable = getFocusableElements(focusRoot);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        if (focusable.length === 1) {
            event.preventDefault();
            first.focus({ preventScroll: true });
            return;
        }

        if (event.shiftKey && (!active || active === first || !focusRoot.contains(active))) {
            event.preventDefault();
            last.focus({ preventScroll: true });
            return;
        }

        if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus({ preventScroll: true });
        }
    }
}

function installPopupFocusManagement() {
    document.addEventListener('keydown', handlePopupDialogKeydown);
}

// ── Summary ──

function updateSummary(settings) {
    const enabled = QUICK_TOGGLE_KEYS.reduce((count, key) => count + (settings[key] ? 1 : 0), 0);
    enabledCount.textContent = String(enabled);
}

function updateSearchState() {
    clearSearchButton.hidden = !q.value.trim();
}

function updateResultsState(totalCount, visibleCount, filter) {
    const normalizedFilter = (filter || '').trim();
    const controlsWord = totalCount === 1 ? t('controlSingular', 'control') : t('controlPlural', 'controls');
    const totalLabel = `${totalCount} ${controlsWord}`;
    if (!normalizedFilter) {
        resultsState.textContent = totalLabel;
        resultsState.title = t('resultsAllAvailableTpl', `${totalCount} quick controls are available in this popup`).replace('{count}', String(totalCount));
        return;
    }
    resultsState.textContent = `${visibleCount} ${t('resultsMatching', 'matching')}`;
    resultsState.title = t('resultsMatchTpl', `${visibleCount} of ${totalCount} ${controlsWord} match this filter`)
        .replace('{visible}', String(visibleCount))
        .replace('{total}', String(totalCount))
        .replace('{controls}', controlsWord);
}

// ── Toggle render ──

function renderLoading() {
    list.textContent = '';
    resultsState.textContent = t('loadingState', 'Loading');
    resultsState.removeAttribute('title');
    for (let index = 0; index < 5; index += 1) {
        const skeleton = document.createElement('div');
        skeleton.className = 'toggle-skeleton';
        const copy = document.createElement('div');
        copy.className = 'skeleton-copy';
        const linePrimary = document.createElement('div');
        linePrimary.className = 'skeleton-line';
        const lineSecondary = document.createElement('div');
        lineSecondary.className = 'skeleton-line short';
        copy.appendChild(linePrimary);
        copy.appendChild(lineSecondary);
        skeleton.appendChild(copy);
        list.appendChild(skeleton);
    }
}

function renderEmpty(filter) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    const title = document.createElement('span');
    title.className = 'empty-title';
    title.textContent = filter
        ? t('emptyNoMatch', 'No quick toggles match')
        : t('emptyNoToggles', 'No quick toggles available');
    const copy = document.createElement('span');
    copy.className = 'empty-copy';
    copy.textContent = filter
        ? t('emptyNoMatchHint', 'Clear the filter to see every quick control again.')
        : t('emptyNoTogglesHint', 'The popup could not load any quick controls right now.');
    empty.appendChild(title);
    empty.appendChild(copy);
    if (filter) {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'empty-action';
        action.textContent = t('clearFilterBtn', 'Clear Filter');
        action.addEventListener('click', () => {
            q.value = '';
            updateSearchState();
            render(popupState.settings, '');
            q.focus();
        });
        empty.appendChild(action);
    }
    list.appendChild(empty);
}

function sendTabMessage(tabId, message) {
    return new Promise((resolve) => {
        if (!tabId) { resolve(false); return; }
        try {
            chrome.tabs.sendMessage(tabId, message, (response) => {
                resolve(!chrome.runtime.lastError && response?.ok !== false);
            });
        } catch { resolve(false); }
    });
}

async function broadcast(key, value) {
    try {
        const tabs = await chrome.tabs.query({ url: YOUTUBE_TAB_URLS });
        for (const tab of tabs) {
            try {
                chrome.tabs.sendMessage(tab.id, { type: 'YTKIT_SETTING_CHANGED', key, value }, () => {
                    void chrome.runtime.lastError;
                });
            } catch { /* tab closing or no receiver */ }
        }
    } catch { /* extension suspended */ }
}

function render(settings, filter) {
    const term = (filter || '').toLowerCase().trim();
    const totalCount = QUICK_TOGGLES.length;
    const items = QUICK_TOGGLES.filter((item) => {
        if (!term) return true;
        // Match against both the source English text AND the translated
        // text so a user filtering in either language finds the toggle.
        const tName = t(`qt_${item.key}_name`, item.name);
        const tDesc = t(`qt_${item.key}_desc`, item.desc);
        const tGroup = t(`qtGroup_${item.group.replace(/\W+/g, '_')}`, item.group);
        return item.name.toLowerCase().includes(term)
            || item.desc.toLowerCase().includes(term)
            || item.key.toLowerCase().includes(term)
            || item.group.toLowerCase().includes(term)
            || tName.toLowerCase().includes(term)
            || tDesc.toLowerCase().includes(term)
            || tGroup.toLowerCase().includes(term);
    });
    list.textContent = '';
    updateSummary(settings);
    updateSearchState();
    updateResultsState(totalCount, items.length, term);
    if (!items.length) {
        renderEmpty(term);
        return;
    }

    const groupedItems = new Map();
    for (const item of items) {
        const groupName = item.group || t('groupQuickControls', 'Quick Controls');
        if (!groupedItems.has(groupName)) groupedItems.set(groupName, []);
        groupedItems.get(groupName).push(item);
    }

    for (const [groupName, groupItems] of groupedItems.entries()) {
        const section = document.createElement('section');
        section.className = 'toggle-group';
        const sectionId = `toggle-group-${groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        section.setAttribute('aria-labelledby', sectionId);

        const groupEnabled = groupItems.reduce((count, item) => count + (settings[item.key] ? 1 : 0), 0);
        section.dataset.active = groupEnabled > 0 ? 'true' : 'false';

        const groupHead = document.createElement('div');
        groupHead.className = 'toggle-group-head';

        const groupTitleWrap = document.createElement('div');
        groupTitleWrap.className = 'toggle-group-title-wrap';
        const icon = createGroupIcon(groupName);
        if (icon) groupTitleWrap.appendChild(icon);
        const groupTitle = document.createElement('h3');
        groupTitle.className = 'toggle-group-title';
        groupTitle.id = sectionId;
        groupTitle.textContent = t(`qtGroup_${groupName.replace(/\W+/g, '_')}`, groupName);
        groupTitleWrap.appendChild(groupTitle);

        const groupCount = document.createElement('span');
        groupCount.className = 'toggle-group-count';
        groupCount.textContent = `${groupEnabled}/${groupItems.length}`;

        groupHead.appendChild(groupTitleWrap);
        groupHead.appendChild(groupCount);
        section.appendChild(groupHead);

        for (const item of groupItems) {
            const on = Boolean(settings[item.key]);
            const tName = t(`qt_${item.key}_name`, item.name);
            const tDesc = t(`qt_${item.key}_desc`, item.desc);
            const stateLabel = on ? t('toggleStateOn', 'Enabled') : t('toggleStateOff', 'Disabled');
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'toggle' + (on ? ' on' : '');
            row.dataset.key = item.key;
            row.setAttribute('role', 'switch');
            row.setAttribute('aria-checked', String(on));
            row.setAttribute('aria-label', `${tName}. ${tDesc}. ${stateLabel}.`);

            const label = document.createElement('div');
            label.className = 'label';
            const name = document.createElement('div');
            name.className = 'name';
            name.textContent = tName;
            const desc = document.createElement('div');
            desc.className = 'desc';
            desc.textContent = tDesc;
            label.appendChild(name);
            label.appendChild(desc);

            const toggleSwitch = document.createElement('div');
            toggleSwitch.className = 'switch';

            row.appendChild(label);
            row.appendChild(toggleSwitch);
            row.addEventListener('click', async () => {
                row.disabled = true;
                try {
                    const next = !Boolean(popupState.settings[item.key]);
                    await writeSetting(item.key, next);
                    render(popupState.settings, q.value);
                    void broadcast(item.key, next);
                    showStatus(`${tName} ${next ? t('toggleStateOnLower', 'enabled') : t('toggleStateOffLower', 'disabled')}.`, 'success');
                } catch (error) {
                    console.warn('[Astra Deck popup] Failed to toggle setting:', error);
                    showStatus(t('toggleUpdateFailTpl', `Couldn't update ${tName}. Try again.`).replace('{name}', tName), 'error', 4200);
                } finally {
                    row.disabled = false;
                }
            });
            section.appendChild(row);
        }

        list.appendChild(section);
    }
}

// ── Storage stats ──

function summarizeStorage(allStorage) {
    const hiddenVideos = Array.isArray(allStorage[STORAGE_KEYS.hiddenVideos]) ? allStorage[STORAGE_KEYS.hiddenVideos].length : 0;
    const blockedChannels = Array.isArray(allStorage[STORAGE_KEYS.blockedChannels]) ? allStorage[STORAGE_KEYS.blockedChannels].length : 0;
    const bookmarks = countObjectEntries(allStorage[STORAGE_KEYS.bookmarks]);
    const keys = Object.keys(allStorage).length;
    const sizeBytes = new Blob([JSON.stringify(allStorage)]).size;
    const diagnostics = summarizeDiagnostics(allStorage[SETTINGS_STORAGE_KEY]);
    return {
        hiddenVideos, blockedChannels, bookmarks, keys,
        sizeBytes, sizeText: formatBytes(sizeBytes),
        diagnostics
    };
}

// v3.20.2: extract the TrustedTypes diagnostic signal written by
// ytkit.js TrustedHTML IIFE. We look for entries in the ring buffer
// (appState.settings._errors) tagged with ctx === 'trusted-types'.
// Returns a compact summary or null if nothing to surface.
function summarizeDiagnostics(settings) {
    if (!isPlainObject(settings) || !Array.isArray(settings._errors)) return null;
    const ttEntries = settings._errors.filter(
        (entry) => isPlainObject(entry) && entry.ctx === 'trusted-types'
    );
    if (ttEntries.length === 0) return null;
    // Newest-first for "most recent failure" copy-to-clipboard payload.
    ttEntries.sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));
    const latest = ttEntries[0];
    return {
        trustedTypes: {
            count: ttEntries.length,
            latestMessage: String(latest.msg || '').slice(0, 200),
            latestTs: Number(latest.ts) || 0
        }
    };
}

async function renderStorageInfo() {
    try {
        const allStorage = await chrome.storage.local.get(null);
        const summary = summarizeStorage(allStorage);
        statKeys.textContent = String(summary.keys);
        statSize.textContent = summary.sizeText;
        statHidden.textContent = String(summary.hiddenVideos);
        statBlocked.textContent = String(summary.blockedChannels);
        statBookmarks.textContent = String(summary.bookmarks);
        renderHealthBanner(summary.diagnostics);
    } catch (error) {
        statKeys.textContent = '0';
        statSize.textContent = '0 B';
        statHidden.textContent = '0';
        statBlocked.textContent = '0';
        statBookmarks.textContent = '0';
        renderHealthBanner(null);
        showStatus(t('statusStorageReadFail', 'Storage read failed') + ': ' + error.message, 'error', 4200);
    }
}

function renderHealthBanner(diagnostics) {
    if (!healthBanner || !healthDetail) return;
    const tt = diagnostics && diagnostics.trustedTypes;
    if (!tt || tt.count <= 0) {
        healthBanner.hidden = true;
        healthCopyPayload = '';
        return;
    }
    const eventWord = tt.count === 1 ? t('healthEventSingular', 'event') : t('healthEventPlural', 'events');
    const countLabel = tt.count + ' ' + eventWord;
    // Message was already URL-redacted at the ytkit.js capture site.
    healthDetail.textContent = t('healthFallbackPrefix', 'TrustedTypes fallback active') + ' — ' + countLabel + '. ' + tt.latestMessage;
    healthBanner.hidden = false;
    const tsText = tt.latestTs ? new Date(tt.latestTs).toISOString() : 'unknown-time';
    healthCopyPayload =
        '[Astra Deck diagnostic] TrustedTypes fallback\n' +
        'Events: ' + tt.count + '\n' +
        'Latest-at: ' + tsText + '\n' +
        'Latest-msg: ' + tt.latestMessage + '\n';
}

if (healthCopyBtn) {
    healthCopyBtn.addEventListener('click', async () => {
        if (!healthCopyPayload) return;
        try {
            await navigator.clipboard.writeText(healthCopyPayload);
            showStatus(t('statusDiagCopied', 'Diagnostic copied to clipboard.'), 'ok', 2400);
        } catch (_) {
            showStatus(t('statusClipboardUnavailable', 'Clipboard unavailable — see browser console.'), 'error', 3600);
            console.error('[Astra Deck popup] health-copy payload:\n' + healthCopyPayload);
        }
    });
}

// v3.23.0 (L9): Save the full DiagnosticLog ring buffer as a JSON file.
// The Copy button drops a compact summary on the clipboard; Save lets
// the user attach the raw structured payload to a bug report. Uses
// chrome.downloads.download when available so the file lands in the
// user's Downloads folder even after the popup closes; falls back to
// an a[download] click for Firefox builds without downloads permission.
if (healthSaveBtn) {
    healthSaveBtn.addEventListener('click', async () => {
        try {
            const items = await storageGet([SETTINGS_STORAGE_KEY]);
            const settings = isPlainObject(items[SETTINGS_STORAGE_KEY])
                ? items[SETTINGS_STORAGE_KEY]
                : {};
            const errors = Array.isArray(settings._errors) ? settings._errors : [];
            const payload = {
                exportedAt: new Date().toISOString(),
                extensionVersion: manifestVersion,
                userAgent: (typeof navigator !== 'undefined' && navigator.userAgent) || '',
                errors,
            };
            const json = JSON.stringify(payload, null, 2);
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `astra-deck-diagnostics-${stamp}.json`;
            const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
            if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
                await new Promise((resolve, reject) => {
                    chrome.downloads.download(
                        { url: dataUrl, filename, saveAs: true },
                        (id) => {
                            if (chrome.runtime.lastError || !id) {
                                reject(new Error(chrome.runtime.lastError?.message || 'download failed'));
                            } else {
                                resolve(id);
                            }
                        },
                    );
                });
                showStatus(t('statusDiagSaved', 'Diagnostic log saved.'), 'ok', 2400);
            } else {
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                showStatus(t('statusDiagSaved', 'Diagnostic log saved.'), 'ok', 2400);
            }
        } catch (e) {
            showStatus(t('statusDiagSaveFail', 'Could not save log') + ': ' + e.message, 'error', 3600);
            console.error('[Astra Deck popup] diag save failed:', e);
        }
    });
}

async function clearDiagnosticLog() {
    const confirmed = await confirmAction({
        eyebrow: t('confirmEyebrow', 'Confirm'),
        title: t('clearLogTitle', 'Clear diagnostic log?'),
        message: t('clearLogMessage', 'This removes all recorded diagnostic events from extension storage.'),
        confirmLabel: t('healthClearBtn', 'Clear'),
        tone: 'default'
    });
    if (!confirmed) return;

    try {
        const items = await storageGet([SETTINGS_STORAGE_KEY]);
        const settings = isPlainObject(items[SETTINGS_STORAGE_KEY])
            ? { ...items[SETTINGS_STORAGE_KEY] }
            : {};
        delete settings._errors;
        await storageSet({ [SETTINGS_STORAGE_KEY]: settings });
        renderHealthBanner(null);
        showStatus(t('statusDiagCleared', 'Diagnostic log cleared.'), 'success', 2400);
    } catch (error) {
        showStatus(t('statusDiagClearFail', 'Could not clear log') + ': ' + error.message, 'error', 4200);
    }
}

// ── Import sanitizers (ported from options.js) ──

function sanitizeImportedVideoIdList(value, limit = IMPORT_LIMITS.hiddenVideos) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const sanitized = [];
    const maxItems = Math.max(0, Number(limit) || 0);
    for (const entry of value) {
        if (typeof entry !== 'string') continue;
        const videoId = entry.trim();
        if (!VIDEO_ID_PATTERN.test(videoId) || seen.has(videoId)) continue;
        seen.add(videoId);
        sanitized.push(videoId);
        if (sanitized.length >= maxItems) break;
    }
    return sanitized;
}

function sanitizeImportedHiddenVideos(value) {
    return sanitizeImportedVideoIdList(value, IMPORT_LIMITS.hiddenVideos);
}

function getImportedFilteredVideoPosts(data) {
    if (!isPlainObject(data)) return null;
    if (Array.isArray(data.hiddenVideos)) return data.hiddenVideos;
    if (Array.isArray(data.filteredVideoPosts)) return data.filteredVideoPosts;
    return null;
}

function sanitizeImportedBlockedChannels(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const sanitized = [];
    for (const entry of value) {
        if (!isPlainObject(entry)) continue;
        const id = typeof entry.id === 'string' ? entry.id.trim().slice(0, 128) : '';
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, 200) : id;
        sanitized.push({ id, name: name || id });
        if (sanitized.length >= IMPORT_LIMITS.blockedChannels) break;
    }
    return sanitized;
}

function sanitizeImportedBookmarks(value) {
    if (!isPlainObject(value)) return {};
    const sanitized = {};
    let videoCount = 0;
    for (const [videoId, entries] of Object.entries(value)) {
        if (!isSafeObjectKey(videoId) || !VIDEO_ID_PATTERN.test(videoId) || !Array.isArray(entries)) continue;
        const seenTimes = new Set();
        const sanitizedEntries = [];
        for (const entry of entries) {
            if (!isPlainObject(entry)) continue;
            const rawTime = Number(entry.t);
            if (!Number.isFinite(rawTime) || rawTime < 0) continue;
            const time = Math.floor(rawTime);
            if (seenTimes.has(time)) continue;
            seenTimes.add(time);
            const note = typeof entry.n === 'string' ? entry.n.slice(0, IMPORT_LIMITS.bookmarkNoteChars) : '';
            const createdAt = Number.isFinite(Number(entry.d)) && Number(entry.d) > 0 ? Number(entry.d) : Date.now();
            sanitizedEntries.push({ t: time, n: note, d: createdAt });
            if (sanitizedEntries.length >= IMPORT_LIMITS.bookmarksPerVideo) break;
        }
        if (sanitizedEntries.length === 0) continue;
        sanitizedEntries.sort((left, right) => left.t - right.t);
        sanitized[videoId] = sanitizedEntries;
        videoCount += 1;
        if (videoCount >= IMPORT_LIMITS.bookmarkVideos) break;
    }
    return sanitized;
}

function estimateSerializedBytes(value) {
    return new Blob([JSON.stringify(value)]).size;
}

function getLegacySidebarOrder(allStorage = {}) {
    const legacyValue = allStorage[STORAGE_KEYS.legacySidebarOrder];
    return Array.isArray(legacyValue) && legacyValue.length > 0 ? deepClone(legacyValue) : null;
}

function mergeLegacySettings(settings, legacySidebarOrder = null) {
    const merged = sanitizeSettingsObject(settings);
    if (
        (!Array.isArray(merged.sidebarOrder) || merged.sidebarOrder.length === 0) &&
        Array.isArray(legacySidebarOrder) &&
        legacySidebarOrder.length > 0
    ) {
        merged.sidebarOrder = deepClone(legacySidebarOrder);
    }
    return merged;
}

function buildExportData(allStorage) {
    const mergedSettings = mergeLegacySettings(
        allStorage[STORAGE_KEYS.settings] || {},
        getLegacySidebarOrder(allStorage)
    );
    const hiddenVideos = sanitizeImportedHiddenVideos(allStorage[STORAGE_KEYS.hiddenVideos]);
    const allowedVideos = sanitizeImportedVideoIdList(allStorage[STORAGE_KEYS.allowedVideos], IMPORT_LIMITS.allowedVideos);
    const settings = sanitizeSettingsObject(mergedSettings);
    return {
        settings,
        hiddenVideos,
        filteredVideoPosts: hiddenVideos,
        allowedVideos,
        blockedChannels: sanitizeImportedBlockedChannels(allStorage[STORAGE_KEYS.blockedChannels]),
        bookmarks: sanitizeImportedBookmarks(allStorage[STORAGE_KEYS.bookmarks]),
        exportVersion: 3,
        exportDate: new Date().toISOString(),
        astraDeckVersion: manifestVersion,
        ytkitVersion: manifestVersion
    };
}

// ── Confirmation dialog ──

function confirmAction({
    eyebrow,
    title,
    message,
    confirmLabel,
    cancelLabel,
    tone = 'default'
}) {
    if (eyebrow == null) eyebrow = t('confirmEyebrow', 'Confirm');
    if (confirmLabel == null) confirmLabel = t('confirmContinue', 'Continue');
    if (cancelLabel == null) cancelLabel = t('confirmCancel', 'Cancel');
    const shell = $('#confirm-shell');
    const dialog = $('#confirm-dialog');
    const eyebrowEl = $('#confirm-eyebrow');
    const titleEl = $('#confirm-title');
    const copyEl = $('#confirm-copy');
    const cancelBtn = $('#confirm-cancel-btn');
    const acceptBtn = $('#confirm-accept-btn');
    const backdrop = shell.querySelector('[data-close-confirm]');

    return new Promise((resolve) => {
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        eyebrowEl.textContent = eyebrow;
        titleEl.textContent = title;
        copyEl.textContent = message;
        cancelBtn.textContent = cancelLabel;
        acceptBtn.textContent = confirmLabel;
        dialog.classList.toggle('is-danger', tone === 'danger');
        acceptBtn.className = tone === 'danger' ? 'danger' : 'primary';
        shell.hidden = false;

        const finish = (confirmed) => {
            shell.hidden = true;
            shell.removeEventListener('keydown', handleKeydown);
            backdrop.removeEventListener('click', onCancel);
            cancelBtn.removeEventListener('click', onCancel);
            acceptBtn.removeEventListener('click', onConfirm);
            requestAnimationFrame(() => previousFocus?.focus?.());
            resolve(confirmed);
        };
        const onCancel = () => finish(false);
        const onConfirm = () => finish(true);
        function handleKeydown(event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                finish(false);
            }
        }

        backdrop.addEventListener('click', onCancel);
        cancelBtn.addEventListener('click', onCancel);
        acceptBtn.addEventListener('click', onConfirm);
        shell.addEventListener('keydown', handleKeydown);
        requestAnimationFrame(() => (tone === 'danger' ? cancelBtn : acceptBtn).focus());
    });
}

// ── Export / Import / Reset ──

async function exportSettings() {
    exportButton.setAttribute('aria-busy', 'true');
    exportButton.disabled = true;
    try {
        const allStorage = await chrome.storage.local.get(null);
        const exportData = buildExportData(allStorage);
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // Prefer the downloads API when available so the file lands in the
        // user's downloads folder even though the popup will close. Falls back
        // to an anchor click if the permission is unavailable.
        const filename = 'astra_deck_settings_' + new Date().toISOString().slice(0, 10) + '.json';
        if (chrome.downloads?.download) {
            await new Promise((resolve, reject) => {
                chrome.downloads.download({ url, filename, saveAs: false }, (downloadId) => {
                    const err = chrome.runtime.lastError;
                    if (err) reject(new Error(err.message));
                    else resolve(downloadId);
                });
            });
        } else {
            const a = Object.assign(document.createElement('a'), { href: url, download: filename });
            a.click();
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        showStatus(t('statusBackupExported', 'Backup exported.'), 'success');
    } catch (error) {
        showStatus(t('statusExportFail', 'Export failed') + ': ' + error.message, 'error', 4200);
    } finally {
        exportButton.removeAttribute('aria-busy');
        exportButton.disabled = false;
    }
}

async function importSettings(file) {
    if (!file) return;
    importButton.setAttribute('aria-busy', 'true');
    importButton.disabled = true;
    try {
        if (file.size > 10 * 1024 * 1024) throw new Error('Import file exceeds 10 MB limit');
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object') throw new Error('Invalid format');

        const importCatalog = await loadSettingsImportCatalog();
        const writes = {};
        let importedSettings = null;
        if (data.exportVersion >= 3) {
            const filteredVideoPosts = getImportedFilteredVideoPosts(data);
            if (isPlainObject(data.settings)) importedSettings = data.settings;
            if (filteredVideoPosts) writes[STORAGE_KEYS.hiddenVideos] = sanitizeImportedHiddenVideos(filteredVideoPosts);
            if (Array.isArray(data.allowedVideos)) writes[STORAGE_KEYS.allowedVideos] = sanitizeImportedVideoIdList(data.allowedVideos, IMPORT_LIMITS.allowedVideos);
            if (Array.isArray(data.blockedChannels)) writes[STORAGE_KEYS.blockedChannels] = sanitizeImportedBlockedChannels(data.blockedChannels);
            if (isPlainObject(data.bookmarks)) writes[STORAGE_KEYS.bookmarks] = sanitizeImportedBookmarks(data.bookmarks);
        } else if (data.exportVersion >= 2) {
            const filteredVideoPosts = getImportedFilteredVideoPosts(data);
            if (isPlainObject(data.settings)) importedSettings = data.settings;
            if (filteredVideoPosts) writes[STORAGE_KEYS.hiddenVideos] = sanitizeImportedHiddenVideos(filteredVideoPosts);
            if (Array.isArray(data.blockedChannels)) writes[STORAGE_KEYS.blockedChannels] = sanitizeImportedBlockedChannels(data.blockedChannels);
        } else if (isPlainObject(data)) {
            importedSettings = data;
        }

        if (importedSettings) {
            writes[STORAGE_KEYS.settings] = mergeImportedSettingsWithDefaults(
                importedSettings,
                importCatalog.defaults,
                importCatalog.settingsVersion,
                'popup-import'
            );
        }

        if (Object.keys(writes).length === 0) throw new Error('No valid settings found in file');
        if (estimateSerializedBytes(writes) > IMPORT_LIMITS.totalBytes) throw new Error('Import data is too large for extension storage');

        await chrome.storage.local.set(writes);
        if (writes[STORAGE_KEYS.settings]) {
            await chrome.storage.local.remove(STORAGE_KEYS.legacySidebarOrder).catch(() => { /* reason: legacy key may not exist */ });
        }
        await renderStorageInfo();
        await loadSettings();
        render(popupState.settings, q.value);
        // Broadcast whole-settings change so open tabs pick up the new state
        for (const key of Object.keys(writes[STORAGE_KEYS.settings] || {})) {
            void broadcast(key, writes[STORAGE_KEYS.settings][key]);
        }
        showStatus(t('statusBackupImported', 'Backup imported.'), 'success');
    } catch (error) {
        showStatus(t('statusImportFail', 'Import failed') + ': ' + error.message, 'error', 4200);
    } finally {
        importFileInput.value = '';
        importButton.removeAttribute('aria-busy');
        importButton.disabled = false;
    }
}

async function resetAllData() {
    const confirmed = await confirmAction({
        eyebrow: t('confirmDestructiveEyebrow', 'Destructive action'),
        title: t('resetAllTitle', 'Reset all local data?'),
        message: t('resetAllMessage', `This clears ${BRAND_NAME} settings, hidden videos, allowed video exceptions, blocked channels, and bookmarks from extension storage.`).replace('{brand}', BRAND_NAME),
        confirmLabel: t('resetBtn', 'Reset'),
        tone: 'danger'
    });
    if (!confirmed) return;

    resetButton.setAttribute('aria-busy', 'true');
    resetButton.disabled = true;
    try {
        await storageClear();
        await renderStorageInfo();
        await loadSettings();
        render(popupState.settings, q.value);
        showStatus(t('statusAllDataCleared', 'All data cleared.'), 'success');
    } catch (error) {
        showStatus(t('statusResetFail', 'Reset failed') + ': ' + error.message, 'error', 4200);
    } finally {
        resetButton.removeAttribute('aria-busy');
        resetButton.disabled = false;
    }
}

// ── Wheel scrolling (keep native scroll inside the popup's flex area) ──

function getWheelScrollTarget(rawTarget) {
    let el = rawTarget instanceof Element ? rawTarget : rawTarget?.parentElement || null;
    while (el && el !== document.documentElement) {
        const style = window.getComputedStyle(el);
        const canScrollY = /(auto|scroll)/.test(style.overflowY);
        if (canScrollY && el.scrollHeight > el.clientHeight) return el;
        el = el.parentElement;
    }
    return list;
}

function normalizeWheelDelta(event, scroller) {
    if (event.deltaMode === 1) return event.deltaY * 16;
    if (event.deltaMode === 2) return event.deltaY * Math.max(scroller.clientHeight, 1);
    return event.deltaY;
}

function installWheelScrolling() {
    document.addEventListener('wheel', (event) => {
        const scroller = getWheelScrollTarget(event.target);
        if (!scroller || scroller.scrollHeight <= scroller.clientHeight) return;
        const delta = normalizeWheelDelta(event, scroller);
        if (!Number.isFinite(delta) || delta === 0) return;
        const maxScrollTop = scroller.scrollHeight - scroller.clientHeight;
        const nextScrollTop = Math.max(0, Math.min(maxScrollTop, scroller.scrollTop + delta));
        if (nextScrollTop === scroller.scrollTop) return;
        event.preventDefault();
        scroller.scrollTop = nextScrollTop;
    }, { passive: false });
}

// ── Bootstrap ──

(async () => {
    await initI18n();
    applyI18n();
    initLanguageDropdown();

    installWheelScrolling();
    installPopupFocusManagement();
    renderLoading();

    try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        updateContext(tab || null);
    } catch {
        updateContext(null);
    }

    void renderStorageInfo();

    try {
        const settings = await loadSettings();
        render(settings, '');
    } catch (error) {
        console.warn('[Astra Deck popup] Failed to load settings:', error);
        render({}, '');
        showStatus(t('statusQuickCtrlLoadFail', 'Quick controls could not be loaded. Try reopening the popup.'), 'error', 5000);
    }
    focusInitialPopupControl();

    let _searchDebounce = null;
    q.addEventListener('input', () => {
        updateSearchState();
        if (_searchDebounce) clearTimeout(_searchDebounce);
        _searchDebounce = setTimeout(() => {
            _searchDebounce = null;
            render(popupState.settings, q.value);
        }, 120);
    });
    q.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            const firstToggle = list.querySelector('.toggle');
            if (firstToggle) { event.preventDefault(); firstToggle.focus(); }
            return;
        }
        if (event.key === 'Escape' && q.value) {
            event.preventDefault();
            q.value = '';
            render(popupState.settings, '');
        }
    });
    clearSearchButton.addEventListener('click', () => {
        q.value = '';
        render(popupState.settings, '');
        q.focus();
    });

    if (chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;
            const relevant = changes[SETTINGS_STORAGE_KEY]
                || QUICK_TOGGLE_KEYS.some((key) => changes[key])
                || changes[STORAGE_KEYS.hiddenVideos]
                || changes[STORAGE_KEYS.allowedVideos]
                || changes[STORAGE_KEYS.blockedChannels]
                || changes[STORAGE_KEYS.bookmarks];
            if (!relevant) return;
            void loadSettings().then((settings) => {
                render(settings, q.value);
            }).catch((error) => {
                console.warn('[Astra Deck popup] Failed to refresh settings:', error);
            });
            void renderStorageInfo();
        });
    }

    openPanelButton.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            const nextContext = getTabContext(tab || null);
            if (nextContext.mode === 'inline-panel' && tab?.id) {
                const opened = await sendTabMessage(tab.id, { type: PANEL_OPEN_MESSAGE });
                if (opened) { window.close(); return; }
            }
            await chrome.tabs.create({ url: 'https://www.youtube.com/' });
            window.close();
        } catch (error) {
            console.warn('[Astra Deck popup] Failed to open the full workspace:', error);
            showStatus(t('statusOpenWorkspaceFail', 'Could not open the full workspace. Try again.'), 'error', 4200);
        }
    });

    exportButton.addEventListener('click', () => { void exportSettings(); });
    importButton.addEventListener('click', () => { importFileInput.click(); });
    importFileInput.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        if (file) void importSettings(file);
    });
    resetButton.addEventListener('click', () => { void resetAllData(); });
    if (healthClearBtn) healthClearBtn.addEventListener('click', () => { void clearDiagnosticLog(); });
})();
