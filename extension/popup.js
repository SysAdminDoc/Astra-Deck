// Astra Deck — Toolbar Popup
// Quick-toggle 15 most-used features plus full data management
// (export, import, reset, storage stats) previously hosted by the
// standalone options page.

const QUICK_TOGGLES = [
    { key: 'removeAllShorts',        group: 'Feed Cleanup',      name: 'Hide Shorts',            desc: 'Remove Shorts shelves and links' },
    { key: 'hideRelatedVideos',      group: 'Feed Cleanup',      name: 'Hide Related',           desc: 'Clear the watch-page side rail' },
    { key: 'disableInfiniteScroll',  group: 'Feed Cleanup',      name: 'Cap Scroll',             desc: 'Stop endless feed loading' },
    { key: 'sponsorBlock',           group: 'Watch Flow',        name: 'SponsorBlock',           desc: 'Skip crowd-marked sponsor segments' },
    { key: 'deArrow',                group: 'Watch Flow',        name: 'DeArrow',                desc: 'Replace clickbait titles and thumbnails' },
    { key: 'commentSearch',          group: 'Watch Flow',        name: 'Comment Search',         desc: 'Filter watch-page comments inline' },
    { key: 'disableAutoplayNext',    group: 'Playback',          name: 'No Autoplay',            desc: 'Stop the next video from starting' },
    { key: 'persistentSpeed',        group: 'Playback',          name: 'Persistent Speed',       desc: 'Keep playback speed consistent' },
    { key: 'autoTheaterMode',        group: 'Playback',          name: 'Auto Theater',           desc: 'Open videos in theater view' },
    { key: 'blueLightFilter',        group: 'Focus',             name: 'Blue-Light Filter',      desc: 'Warm the player for late viewing' },
    { key: 'miniPlayerBar',          group: 'Focus',             name: 'Mini Player Bar',        desc: 'Keep controls visible while scrolling' },
    { key: 'digitalWellbeing',       group: 'Focus',             name: 'Digital Wellbeing',      desc: 'Track breaks and daily viewing' },
    { key: 'cleanShareUrls',         group: 'Utilities',         name: 'Clean URLs',             desc: 'Remove tracking from share links' },
    { key: 'transcriptViewer',       group: 'Utilities',         name: 'Transcript Sidebar',     desc: 'Read, jump, and export captions' },
    { key: 'debugMode',              group: 'Utilities',         name: 'Debug Mode',             desc: 'Record detailed local diagnostics' },
    // v4.15.0: privacy + profile toggles surfaced in the popup so the
    // v4.10.0 data-flow panel + v4.7.0 policy-profile machinery are
    // actually discoverable. safeStoreProfile stays on by default; the
    // others are off and become opt-in via the popup.
    { key: 'privacyDataFlowPanel',   group: 'Privacy',           name: 'Data-Flow Panel',        desc: 'Show every API origin Astra Deck can contact' },
    { key: 'safeStoreProfile',       group: 'Privacy',           name: 'Store-Safe Profile',     desc: 'Hide github-full toggles + scrub keys on export' },
    { key: 'githubFullProfile',      group: 'Privacy',           name: 'GitHub-Full Profile',    desc: 'Unlock github-full toggles (e.g. Cobalt, AI keys)' },
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
    // v4.15.0: padlock glyph for the Privacy group. Two pieces: a
    // rectangular body + a U-shaped shackle. House style — square
    // corners, no pill backdrop, matches the other group icons.
    'Privacy': [
        { tag: 'rect',    attrs: { x: '3.5', y: '7',   width: '9',   height: '7', rx: '1' } },
        { tag: 'path',    attrs: { d: 'M5.5 7 V5 a2.5 2.5 0 0 1 5 0 V7' } },
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
// v4.47.0: Filter mini-DSL. A search term can be plain free text OR a
// mix of free-text tokens and `field:value` filters. Recognised fields
// are `risk`, `category`, `scope`, and `profile` — each maps to a
// metadata field on the settings-schema entry. Comma-separated values
// inside a filter (`risk:api,local-companion`) act as OR within the
// field; multiple `field:` clauses are ANDed. Field values are
// case-insensitive and trim whitespace. Unknown fields fall back to
// free text so a typo (`riks:api`) still does something useful instead
// of swallowing the user's input.
const SEARCH_FILTER_FIELDS = Object.freeze(['risk', 'category', 'scope', 'profile']);
function parseSearchQuery(raw) {
    const filters = Object.create(null); // { field: Set<lowercase value> }
    const freeTokens = [];
    const term = (raw || '').toLowerCase().trim();
    if (!term) return { filters, freeText: '', tokens: [] };
    for (const token of term.split(/\s+/)) {
        if (!token) continue;
        const colon = token.indexOf(':');
        if (colon > 0 && colon < token.length - 1) {
            const field = token.slice(0, colon);
            const valueRaw = token.slice(colon + 1);
            if (SEARCH_FILTER_FIELDS.includes(field)) {
                const set = filters[field] || (filters[field] = new Set());
                for (const v of valueRaw.split(',')) {
                    const trimmed = v.trim();
                    if (trimmed) set.add(trimmed);
                }
                continue;
            }
        }
        freeTokens.push(token);
    }
    return { filters, freeText: freeTokens.join(' '), tokens: freeTokens };
}
function entryPassesFilters(entry, filters) {
    if (!entry) return Object.keys(filters).length === 0;
    for (const field of SEARCH_FILTER_FIELDS) {
        const allowed = filters[field];
        if (!allowed || allowed.size === 0) continue;
        const value = entry[field];
        if (typeof value !== 'string') return false;
        if (!allowed.has(value.toLowerCase())) return false;
    }
    return true;
}
// Lookup a schema entry by storage key. Lazily memoised because the
// schema is frozen and ~354 entries — a Map keyed by `key` keeps the
// per-toggle filter check at O(1).
let _schemaIndex = null;
function getSchemaIndex() {
    if (_schemaIndex) return _schemaIndex;
    const scope = (typeof window !== 'undefined') && window.__YTKIT_SETTINGS_SCHEMA__;
    if (!scope || !Array.isArray(scope.SETTINGS_SCHEMA)) return null;
    _schemaIndex = new Map();
    for (const e of scope.SETTINGS_SCHEMA) _schemaIndex.set(e.key, e);
    return _schemaIndex;
}

// Resolves user-facing strings via chrome.i18n by default. A manual
// override (popup language dropdown) writes to chrome.storage.local
// `_localeOverride`; when set, we fetch that locale's bundled
// messages.json once and serve from it. English literals stay inline
// at every call site as the fallback so the source remains
// self-documenting and the userscript build (no chrome.i18n) keeps
// working.
const I18N = { override: null, map: null, ready: false };

// Bundled locales — must match the directories under extension/_locales/.
// Keep in sync with the language dropdown options in popup.html.
const BUNDLED_LOCALES = Object.freeze([
    'en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pt_BR', 'ru', 'zh_CN'
]);
const BUNDLED_LOCALE_SET = new Set(BUNDLED_LOCALES);

// Defense: reject locale strings that aren't on the allowlist or that contain
// path-separator / parent-segment characters. `chrome.runtime.getURL` is
// bounded to the extension origin, so the worst a malformed locale could do
// is fetch an unrelated extension file and fall into the JSON-parse catch —
// but rejecting up front avoids any wasted fetch and keeps the i18n surface
// auditable.
function isValidLocaleTag(locale) {
    if (typeof locale !== 'string') return false;
    if (!locale || locale === 'auto') return false;
    if (locale.length > 16) return false;
    if (!/^[A-Za-z]{2,3}(?:[_-][A-Za-z0-9]{2,8})?$/.test(locale)) return false;
    return BUNDLED_LOCALE_SET.has(locale);
}

async function initI18n() {
    try {
        const items = await new Promise((resolve) =>
            chrome.storage.local.get(['_localeOverride'], (i) => resolve(i || {})));
        const locale = (items._localeOverride || '').trim();
        if (!locale || locale === 'auto') { I18N.ready = true; return; }
        if (!isValidLocaleTag(locale)) {
            // Stale or hostile override — fall back to chrome.i18n auto-detect.
            I18N.ready = true;
            return;
        }
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
        const rawLocale = sel.value || 'auto';
        // Guard the persisted value too — the dropdown is constrained to known
        // options but the storage key is a public surface that other code
        // (or future migrations) might overwrite.
        const locale = (rawLocale === 'auto' || isValidLocaleTag(rawLocale)) ? rawLocale : 'auto';
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
    statusTimer: null,
    // v4.39.0: policy-profile instance — populated lazily on first
    // schema-overview render so the badge code can read profile
    // visibility without rebuilding the resolver on every key row.
    _policyProfile: null
};

function ensurePolicyProfile() {
    if (popupState._policyProfile) return popupState._policyProfile;
    const factory = window.YTKitCore && window.YTKitCore.createPolicyProfile;
    if (typeof factory !== 'function') return null;
    try {
        popupState._policyProfile = factory();
    } catch (err) {
        console.warn('[Astra Deck popup] policy-profile init failed:', err);
        popupState._policyProfile = null;
    }
    return popupState._policyProfile;
}

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

// iter-6 N2: storage-quota proactive warning banner.
const storageBanner = $('#storage-banner');
const storageBannerDetail = $('#storage-banner-detail');
const storageBannerResetBtn = $('#storage-banner-reset-btn');

// iter-6 N7: selector-health dashboard refs.
const selectorHealthSection = $('#selector-health');
const selectorHealthTotal = $('#selector-health-total');
const selectorHealthList = $('#selector-health-list');
const selectorHealthCtx = $('#selector-health-ctx');
// v4.47.0: copy-report button + transient status line.
const selectorHealthCopyBtn = $('#selector-health-copy-btn');
const selectorHealthCopyStatus = $('#selector-health-copy-status');

// v4.12.0: data-flow panel refs.
const dataFlowSection = $('#data-flow');
const dataFlowSummary = $('#data-flow-summary');
const dataFlowList = $('#data-flow-list');

// v4.23.0: schema-driven category overview refs.
const schemaOverviewSection = $('#schema-overview');
const schemaOverviewCount = $('#schema-overview-count');
const schemaOverviewList = $('#schema-overview-list');

// v4.24.0: which category rows are currently expanded. Stored in a
// Set so re-renders preserve open state across storage.onChanged
// without a settings round-trip.
//
// v4.29.0: also persisted across popup opens. The expanded set is
// mirrored into chrome.storage.local under SCHEMA_OVERVIEW_EXPANDED_KEY
// so the popup remembers which categories the user had open.
const SCHEMA_OVERVIEW_EXPANDED_KEY = 'ytkit_popup_schema_overview_expanded';
const schemaOverviewState = { expanded: new Set() };

// v4.29.0: persist popup overview expansion across opens. Stored as a
// plain string array rather than a Set for chrome.storage compatibility.
async function persistSchemaOverviewExpanded() {
    try {
        await storageSet({ [SCHEMA_OVERVIEW_EXPANDED_KEY]: [...schemaOverviewState.expanded] });
    } catch (_) {
        // reason: persistence is best-effort — the user's expansion
        // is purely UI ergonomics; never break the popup if storage
        // is unavailable.
    }
}

async function restoreSchemaOverviewExpanded() {
    try {
        const items = await storageGet([SCHEMA_OVERVIEW_EXPANDED_KEY]);
        const raw = items[SCHEMA_OVERVIEW_EXPANDED_KEY];
        if (!Array.isArray(raw)) return;
        schemaOverviewState.expanded = new Set(
            raw.filter((entry) => typeof entry === 'string' && entry.length > 0 && entry.length < 64)
        );
    } catch (_) {
        // reason: best-effort — empty Set is the safe default.
    }
}

// Storage warning thresholds.
// Astra Deck declares the `unlimitedStorage` permission so the
// default 10 MB chrome.storage.local quota is removed — but a
// runaway-growth signal is still useful UX even without a hard
// ceiling. Tier 1 (>20 MB) starts the soft nudge; tier 2 (>50 MB)
// upgrades the wording. Both stay polite — the popup never auto-
// resets; the Reset button hands the user to the existing
// confirm-action dialog so the destructive step keeps its guard.
const STORAGE_WARN_SOFT_BYTES = 20 * 1024 * 1024;
const STORAGE_WARN_HARD_BYTES = 50 * 1024 * 1024;

function getVersion() {
    try { return (chrome.runtime.getManifest().version || '—'); } catch { return '—'; }
}

const versionEl = $('#version');
const manifestVersion = getVersion();
// Defensive: a popup.html edit removing #version used to crash the entire
// popup bootstrap at this top-level line. Audit pass: degrade gracefully
// so the rest of the popup still functions even if the badge slot is gone.
if (versionEl) {
    versionEl.textContent = 'v' + manifestVersion;
    versionEl.title = manifestVersion === '—'
        ? `${BRAND_NAME} version unavailable`
        : `${BRAND_NAME} v${manifestVersion}`;
}

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
            note: t('contextNoteInlinePanel', 'Open the full workspace on this tab; quick toggles apply immediately.'),
            openLabel: t('openFullSettings', 'Open Full Settings'),
            mode: 'inline-panel'
        };
    }
    if (isAnyYouTubeUrl(url)) {
        return {
            label: t('contextStateYouTube', 'YouTube'),
            note: t('contextNoteLaunch', 'Open a watchable YouTube tab to use the full in-page workspace.'),
            openLabel: t('openYouTube', 'Open YouTube'),
            mode: 'launch'
        };
    }
    return {
        label: t('contextStateAnyTab', 'Any Tab'),
        note: t('contextNoteAnyTab', 'Quick toggles are saved now and sync when YouTube is open.'),
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
    const normalizedType = type === 'ok' ? 'success' : type;
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
    statusBanner.className = `status ${normalizedType}`;
    if (durationMs > 0) {
        popupState.statusTimer = setTimeout(() => {
            statusBanner.textContent = '';
            statusBanner.className = 'status';
            popupState.statusTimer = null;
        }, durationMs);
    }
}

function appendSelectorMetric(parent, text, className = '') {
    if (parent.childNodes.length > 0) {
        parent.appendChild(document.createTextNode(' · '));
    }
    if (className) {
        const span = document.createElement('span');
        span.className = className;
        span.textContent = text;
        parent.appendChild(span);
        return;
    }
    parent.appendChild(document.createTextNode(text));
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

// Bulk variant for import / reset paths where dozens or hundreds of settings
// change at once. Sending one message per key produces O(N*tabs) IPC traffic
// — the receiver only needs the final aggregate state, so a single
// `YTKIT_SETTINGS_REPLACED` message per tab is both cheaper and more
// consistent (no flicker between partial reload states). Receivers that don't
// understand the bulk message still re-read storage on `chrome.storage.onChanged`.
async function broadcastSettingsReplaced(settings) {
    try {
        const tabs = await chrome.tabs.query({ url: YOUTUBE_TAB_URLS });
        for (const tab of tabs) {
            try {
                chrome.tabs.sendMessage(tab.id, { type: 'YTKIT_SETTINGS_REPLACED', settings }, () => {
                    void chrome.runtime.lastError;
                });
            } catch { /* tab closing or no receiver */ }
        }
    } catch { /* extension suspended */ }
}

// v4.16.0: schema-driven risk-band badge for the popup toggle list.
// Returns a small <span> tagged with the entry's risk band, or null
// when the schema declares the toggle as `safe` (or when the schema
// module isn't loaded — defensive degradation). Reuses the v4.12.0
// data-flow palette so the popup speaks one consistent visual
// language for "what this toggle does to your network surface".
function createSchemaRiskBadge(key) {
    const finder = window.YTKitCore && window.YTKitCore.findSettingEntry;
    let entry = null;
    if (typeof finder === 'function') {
        try { entry = finder(key); }
        catch (_) { /* reason: schema lookup must never break a toggle row */ }
    }
    if (!entry) return null;
    if (entry.risk === 'safe') return null;
    if (entry.internal) return null;
    const span = document.createElement('span');
    span.className = 'toggle-risk-badge toggle-risk-' + entry.risk;
    span.textContent = entry.risk;
    // Localised tooltip describes what the badge means; falls back to
    // an English sentence so unenglish locales still get a usable hint.
    span.title = t('toggleRiskTooltip_' + entry.risk,
        ({
            api:               'Talks to an external API server',
            'local-companion': 'Talks to the local Astra Downloader (127.0.0.1)',
            experimental:      'Experimental feature; behaviour may change',
            'store-risk':      'Higher review-policy sensitivity — github-full only'
        }[entry.risk]) || ('Risk band: ' + entry.risk));
    span.setAttribute('aria-label', span.title);
    return span;
}

function render(settings, filter) {
    const rawTerm = (filter || '').toLowerCase().trim();
    const parsed = parseSearchQuery(rawTerm);
    const hasFilters = Object.keys(parsed.filters).length > 0;
    const freeTerm = parsed.freeText;
    const schemaIdx = (hasFilters) ? getSchemaIndex() : null;
    const totalCount = QUICK_TOGGLES.length;
    const items = QUICK_TOGGLES.filter((item) => {
        // v4.47.0: mini-DSL field filters (risk:/category:/scope:/profile:)
        // act as a hard AND gate on top of free-text matching. The
        // metadata lives on the schema entry, not the quick-toggle row.
        if (hasFilters) {
            const entry = schemaIdx ? schemaIdx.get(item.key) : null;
            if (!entryPassesFilters(entry, parsed.filters)) return false;
        }
        if (!freeTerm) return true;
        // Match against both the source English text AND the translated
        // text so a user filtering in either language finds the toggle.
        const tName = t(`qt_${item.key}_name`, item.name);
        const tDesc = t(`qt_${item.key}_desc`, item.desc);
        const tGroup = t(`qtGroup_${item.group.replace(/\W+/g, '_')}`, item.group);
        return item.name.toLowerCase().includes(freeTerm)
            || item.desc.toLowerCase().includes(freeTerm)
            || item.key.toLowerCase().includes(freeTerm)
            || item.group.toLowerCase().includes(freeTerm)
            || tName.toLowerCase().includes(freeTerm)
            || tDesc.toLowerCase().includes(freeTerm)
            || tGroup.toLowerCase().includes(freeTerm);
    });
    const term = rawTerm; // keep below-the-loop callers stable
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
            const nameRow = document.createElement('div');
            nameRow.className = 'name-row';
            const name = document.createElement('div');
            name.className = 'name';
            name.textContent = tName;
            nameRow.appendChild(name);
            // v4.16.0: schema-driven risk-band badge. Shown only when the
            // toggle's risk is non-`safe` so the surface stays calm for
            // ordinary cosmetic toggles and the small set of API/companion-
            // touching toggles stand out. Reads from the v4.6.0 schema via
            // window.YTKitCore.findSettingEntry; degrades silently if the
            // schema module didn't load (CSP regression guard).
            const riskBadge = createSchemaRiskBadge(item.key);
            if (riskBadge) nameRow.appendChild(riskBadge);
            const desc = document.createElement('div');
            desc.className = 'desc';
            desc.textContent = tDesc;
            label.appendChild(nameRow);
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
    // estimateSerializedBytes avoids the second Blob allocation `new Blob(...)`
    // used to do just to read .size — relevant on every popup open with a
    // multi-MB local storage payload.
    const sizeBytes = estimateSerializedBytes(allStorage);
    const diagnostics = summarizeDiagnostics(allStorage[SETTINGS_STORAGE_KEY]);
    // iter-6 N4: surface malformed storage payloads so users aren't left
    // staring at silently-broken state (e.g. ytSuiteSettings deserialized
    // as a string, hiddenVideos as an object). Detector returns the list
    // of issues; banner offers the same guarded Reset as the quota tier.
    const corruption = detectStorageCorruption(allStorage);
    return {
        hiddenVideos, blockedChannels, bookmarks, keys,
        sizeBytes, sizeText: formatBytes(sizeBytes),
        diagnostics,
        corruption
    };
}

// iter-6 N4: storage corruption detector. chrome.storage.local is robust
// in practice but the underlying browser profile is not — disk full
// during a write, browser crash mid-flush, profile sync conflicts, or a
// user manually editing the profile JSON can leave keys in shapes that
// the rest of the popup assumes are correct (Arrays for lists, plain
// objects for settings + bookmarks). Returns an array of findings; an
// empty array means storage looks healthy.
function detectStorageCorruption(allStorage) {
    if (!allStorage || typeof allStorage !== 'object') {
        return [{ key: '(root)', kind: 'not-object', detail: 'storage payload is not an object' }];
    }
    const findings = [];
    const settingsRaw = allStorage[STORAGE_KEYS.settings];
    if (settingsRaw !== undefined && !isPlainObject(settingsRaw)) {
        findings.push({
            key: STORAGE_KEYS.settings,
            kind: 'wrong-type',
            detail: `expected plain object, got ${typeof settingsRaw}` + (Array.isArray(settingsRaw) ? ' (array)' : '')
        });
    }
    for (const k of ['hiddenVideos', 'allowedVideos', 'blockedChannels']) {
        const raw = allStorage[STORAGE_KEYS[k]];
        if (raw !== undefined && !Array.isArray(raw)) {
            findings.push({
                key: STORAGE_KEYS[k],
                kind: 'wrong-type',
                detail: `expected Array, got ${typeof raw}` + (raw === null ? ' (null)' : '')
            });
        }
    }
    const bookmarksRaw = allStorage[STORAGE_KEYS.bookmarks];
    if (bookmarksRaw !== undefined && !isPlainObject(bookmarksRaw)) {
        findings.push({
            key: STORAGE_KEYS.bookmarks,
            kind: 'wrong-type',
            detail: `expected plain object, got ${typeof bookmarksRaw}`
        });
    }
    return findings;
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
        // iter-6 N4: corruption wins over quota — if we detect a malformed
        // payload, that's a more urgent signal than "storage is large."
        if (summary.corruption && summary.corruption.length > 0) {
            renderStorageWarningBanner(0, 0, 0, 0, summary.corruption);
        } else {
            renderStorageWarningBanner(summary.sizeBytes, summary.hiddenVideos, summary.blockedChannels, summary.bookmarks);
        }
    } catch (error) {
        statKeys.textContent = '0';
        statSize.textContent = '0 B';
        statHidden.textContent = '0';
        statBlocked.textContent = '0';
        statBookmarks.textContent = '0';
        renderHealthBanner(null);
        // iter-6 N4: a thrown error from chrome.storage.local.get(null) is
        // itself a corruption signal (profile-level read failure). Surface
        // it through the same banner so the user has a single recovery
        // surface regardless of the failure mode.
        renderStorageWarningBanner(0, 0, 0, 0, [{
            key: '(read)', kind: 'read-failed',
            detail: String(error && error.message || error).slice(0, 200)
        }]);
        showStatus(t('statusStorageReadFail', 'Storage read failed') + ': ' + error.message, 'error', 4200);
    }
}

// iter-6 N2: storage-size warning banner. Surfaces a polite nudge when
// total chrome.storage.local payload crosses the soft threshold, and a
// firmer wording at the hard threshold. The Reset button shares the
// existing destructive-confirm dialog so accidental clicks are still
// guarded.
function renderStorageWarningBanner(sizeBytes, hiddenVideos, blockedChannels, bookmarks, corruption) {
    if (!storageBanner || !storageBannerDetail) return;

    // iter-6 N4: corruption tier supersedes quota tier. Show first to
    // signal that the recovery action (Reset) is more urgent than a
    // size nudge.
    if (Array.isArray(corruption) && corruption.length > 0) {
        const summary = corruption
            .slice(0, 3)  // bound so the banner detail stays readable
            .map((f) => `${f.key}: ${f.detail}`)
            .join('; ');
        const extra = corruption.length > 3 ? ` (+${corruption.length - 3} more)` : '';
        storageBanner.dataset.tier = 'corruption';
        storageBannerDetail.textContent =
            t('storageBannerCorruptionTpl', 'Storage data malformed — Reset to recover.')
            + ' ' + summary + extra;
        storageBanner.hidden = false;
        // Record to DiagnosticLog ring (per iter-5 ROADMAP plan: storage-
        // corruption ctx triggers promote-to-Now signals in future runs).
        recordCorruptionDiagnostic(corruption);
        return;
    }

    const bytes = Number(sizeBytes) || 0;
    if (bytes < STORAGE_WARN_SOFT_BYTES) {
        storageBanner.hidden = true;
        return;
    }
    const sizeText = formatBytes(bytes);
    const tier = bytes >= STORAGE_WARN_HARD_BYTES ? 'hard' : 'soft';
    storageBanner.dataset.tier = tier;
    // Build a compact detail string showing the four biggest contributor
    // counts so users know which lists to trim if they don't want to nuke
    // everything. Empty contributors omitted.
    const parts = [];
    if (Number.isFinite(hiddenVideos) && hiddenVideos > 0) parts.push(hiddenVideos + ' hidden');
    if (Number.isFinite(blockedChannels) && blockedChannels > 0) parts.push(blockedChannels + ' blocked');
    if (Number.isFinite(bookmarks) && bookmarks > 0) parts.push(bookmarks + ' bookmarks');
    const contributors = parts.length ? ' — ' + parts.join(' · ') : '';
    const baseTpl = tier === 'hard'
        ? t('storageBannerHardTpl', `Storage at ${sizeText} — consider Reset.`)
        : t('storageBannerSoftTpl', `Storage at ${sizeText} — heading toward the ceiling.`);
    storageBannerDetail.textContent = baseTpl.replace('{size}', sizeText) + contributors;
    storageBanner.hidden = false;
}

// iter-6 N4: best-effort persistence into the existing _errors ring so
// future factory runs (per iter-5 ROADMAP) can promote N4 follow-ups when
// the field detects corruption events. We do NOT show or save corruption
// findings during the storage-read-failed path (no settings to write to).
// iter-6 N7: selector-health dashboard. Queries the active YouTube tab
// for the per-surface health snapshot + DiagnosticLog ctx counts, then
// renders a compact list of top-K problematic surfaces. Bounded payload
// (top 12 surfaces per the message handler in ytkit.js); we render up to
// 6 here to keep the popup compact. Hides the section gracefully when
// no YT tab is active OR the content script doesn't respond.
async function renderSelectorHealthDashboard() {
    if (!selectorHealthSection || !selectorHealthList) return;
    try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tab || !tab.id || !isSupportedInlinePanelUrl(tab.url || '')) {
            selectorHealthSection.hidden = true;
            return;
        }
        const response = await new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), 1500);
            try {
                chrome.tabs.sendMessage(tab.id, { type: 'YTKIT_GET_SELECTOR_HEALTH' }, (msg) => {
                    clearTimeout(timer);
                    if (chrome.runtime.lastError) {
                        resolve(null);
                        return;
                    }
                    resolve(msg);
                });
            } catch {
                clearTimeout(timer);
                resolve(null);
            }
        });
        if (!response || response.ok === false || !Array.isArray(response.surfaces)) {
            selectorHealthSection.hidden = true;
            return;
        }
        // Top 6 problematic surfaces (already sorted by trouble-score
        // in the content-script handler).
        const top = response.surfaces.slice(0, 6);
        selectorHealthList.textContent = '';
        if (top.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'selector-health-empty';
            empty.textContent = t('selectorHealthEmpty', 'No surfaces sampled yet.');
            selectorHealthList.appendChild(empty);
        } else {
            for (const surface of top) {
                const li = document.createElement('li');
                const name = document.createElement('span');
                name.className = 'sh-name';
                name.textContent = surface.surface
                    + (surface.highChurn ? ' ⚡' : '')
                    + (surface.needsFreshCapture ? ' 📷' : '');
                const stats = document.createElement('span');
                stats.className = 'sh-stats';
                appendSelectorMetric(stats, `${surface.hits || 0} hits`);
                if (surface.errors > 0) appendSelectorMetric(stats, `${surface.errors} err`, 'sh-errors');
                if (surface.misses > 0) appendSelectorMetric(stats, `${surface.misses} miss`);
                if (surface.shapeDrifts > 0) appendSelectorMetric(stats, `${surface.shapeDrifts} drift`, 'sh-drifts');
                li.appendChild(name);
                li.appendChild(stats);
                selectorHealthList.appendChild(li);
            }
        }
        // Total surfaces line.
        if (selectorHealthTotal) {
            const totalLabel = t('selectorHealthTotalTpl', `${response.totalSurfaces} surfaces tracked`);
            selectorHealthTotal.textContent = totalLabel.replace('{count}', String(response.totalSurfaces));
        }
        // Per-ctx diagnostic chip strip.
        if (selectorHealthCtx) {
            selectorHealthCtx.textContent = '';
            const counts = response.ctxCounts && typeof response.ctxCounts === 'object' ? response.ctxCounts : {};
            const ordered = Object.entries(counts)
                .filter(([, v]) => Number(v) > 0)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);
            if (ordered.length === 0) {
                selectorHealthCtx.hidden = true;
            } else {
                selectorHealthCtx.hidden = false;
                for (const [ctx, count] of ordered) {
                    const chip = document.createElement('span');
                    chip.className = 'sh-ctx-chip';
                    chip.textContent = `${ctx}: ${count}`;
                    selectorHealthCtx.appendChild(chip);
                }
            }
        }
        selectorHealthSection.hidden = false;
    } catch (_) {
        // Best-effort surface — never break the popup on a snapshot failure.
        selectorHealthSection.hidden = true;
    }
}

// v4.47.0: "Copy report" button on the selector-health dashboard.
// Fetches the full snapshot from the active YT tab, formats it via the
// bundled core/selector-health.js `formatSelectorCopyReport`, and copies
// to the clipboard. The button stays disabled while the round-trip is
// in flight so a rapid double-click can't post two reports. Status line
// announces the outcome through aria-live="polite" so screen readers
// hear success/failure.
let _selectorHealthCopyInFlight = false;
async function copySelectorHealthReport() {
    if (_selectorHealthCopyInFlight) return;
    if (!selectorHealthCopyBtn) return;
    const setStatus = (msg) => {
        if (selectorHealthCopyStatus) selectorHealthCopyStatus.textContent = msg;
    };
    _selectorHealthCopyInFlight = true;
    selectorHealthCopyBtn.disabled = true;
    setStatus(t('selectorHealthCopyPending', 'Building report…'));
    try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tab || !tab.id || !isSupportedInlinePanelUrl(tab.url || '')) {
            setStatus(t('selectorHealthCopyNeedYt', 'Open a YouTube tab to build the report.'));
            return;
        }
        // Same message shape as renderSelectorHealthDashboard — the
        // content-script handler returns `surfaces` (already sorted by
        // trouble-score, top 12) + `totalSurfaces` + `ctxCounts`. The
        // formatter only needs the surfaces array.
        const response = await new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), 1500);
            try {
                chrome.tabs.sendMessage(tab.id, { type: 'YTKIT_GET_SELECTOR_HEALTH' }, (msg) => {
                    clearTimeout(timer);
                    if (chrome.runtime.lastError) { resolve(null); return; }
                    resolve(msg);
                });
            } catch (_) {
                clearTimeout(timer);
                resolve(null);
            }
        });
        if (!response || response.ok === false || !Array.isArray(response.surfaces)) {
            setStatus(t('selectorHealthCopyNoSnap', 'No snapshot available — the page may still be loading.'));
            return;
        }
        // Formatter is bundled via core/selector-health.js; defensive
        // fallback for the (impossible) case where the module didn't
        // attach to globalThis.YTKitCore.
        const core = globalThis.YTKitCore || {};
        const formatter = typeof core.formatSelectorCopyReport === 'function'
            ? core.formatSelectorCopyReport
            : null;
        let payload;
        if (formatter) {
            payload = formatter(response.surfaces, {
                exportedAt: new Date().toISOString(),
                productVersion: getVersion(),
                browserUA: (navigator && navigator.userAgent) || 'unknown',
                topN: 10
            });
            // Prepend the active tab URL + the per-ctx counts the formatter
            // doesn't otherwise include. The popup ctx-counts strip already
            // surfaces them, but a bug report should carry them inline.
            const tabLine = 'activeTab: ' + (tab.url || 'unknown');
            const ctxLines = [];
            const ctx = (response.ctxCounts && typeof response.ctxCounts === 'object') ? response.ctxCounts : {};
            const ordered = Object.entries(ctx).filter(([, v]) => Number(v) > 0).sort((a, b) => b[1] - a[1]);
            if (ordered.length) {
                ctxLines.push('');
                ctxLines.push('diagnostic ctx counts:');
                for (const [k, v] of ordered) ctxLines.push('  - ' + k + ': ' + v);
            }
            payload = tabLine + '\n' + payload + ctxLines.join('\n');
        } else {
            // Minimal fallback — emit the raw snapshot so the user still has
            // something to file. Should never trigger in production.
            payload = JSON.stringify({
                productVersion: getVersion(),
                exportedAt: new Date().toISOString(),
                activeTab: tab.url || 'unknown',
                surfaces: response.surfaces,
                ctxCounts: response.ctxCounts || {}
            }, null, 2);
        }
        // navigator.clipboard works in popup contexts because the popup
        // counts as a user-activated focused surface. Catch the
        // permission-denied path explicitly so we can fall back to the
        // ancient textarea-execCommand approach without a console warning
        // bubbling out of the .catch.
        try {
            await navigator.clipboard.writeText(payload);
            setStatus(t('selectorHealthCopyDone', 'Copied — paste into a GitHub issue.'));
        } catch (clipErr) {
            // Fallback: hidden textarea + document.execCommand('copy').
            // Same shape as the existing health-banner copy path.
            const ta = document.createElement('textarea');
            ta.value = payload;
            ta.setAttribute('readonly', '');
            ta.style.position = 'absolute';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (_) {
                // reason: execCommand may throw in tightly-locked-down contexts
                ok = false;
            }
            ta.remove();
            if (ok) {
                setStatus(t('selectorHealthCopyDone', 'Copied — paste into a GitHub issue.'));
            } else {
                setStatus(t('selectorHealthCopyFail', 'Clipboard write blocked. Open DevTools and call window.__ytkitDiagnostics.download() instead.'));
            }
        }
    } catch (_) {
        // reason: any unexpected failure must not break the popup
        setStatus(t('selectorHealthCopyFail', 'Clipboard write blocked. Open DevTools and call window.__ytkitDiagnostics.download() instead.'));
    } finally {
        _selectorHealthCopyInFlight = false;
        if (selectorHealthCopyBtn) selectorHealthCopyBtn.disabled = false;
    }
}

if (selectorHealthCopyBtn) {
    selectorHealthCopyBtn.addEventListener('click', () => { void copySelectorHealthReport(); });
}

// v4.12.0: data-flow panel. Reads extension/core/data-flow.js's
// catalogue (bundled into popup.html) and renders the per-origin chip
// surface gated on the `privacyDataFlowPanel` schema setting. Operates
// entirely inside the popup context — no content-script round-trip
// required, since the catalogue is static + the live settings are
// already in popupState.
function renderDataFlowPanel() {
    if (!dataFlowSection || !dataFlowList) return;
    const settings = popupState.settings || {};
    if (settings.privacyDataFlowPanel !== true) {
        dataFlowSection.hidden = true;
        return;
    }
    const factory = window.YTKitCore && window.YTKitCore.createDataFlow;
    if (typeof factory !== 'function') {
        // Modules failed to load (CSP regression, missing file). Stay hidden
        // rather than render a broken panel.
        dataFlowSection.hidden = true;
        return;
    }
    let manifest = null;
    try { manifest = chrome.runtime.getManifest(); } catch (_) { /* reason: unavailable in some contexts */ }
    const df = factory({ manifest });
    const origins = df.getOrigins(settings);
    const summary = df.summarise(settings);

    dataFlowList.textContent = '';
    for (const entry of origins) {
        const li = document.createElement('li');
        li.classList.add(entry.currentlyActive ? 'df-active' : 'df-inactive');

        const dot = document.createElement('span');
        dot.className = 'data-flow-dot df-risk-' + entry.riskBand;
        dot.setAttribute('aria-hidden', 'true');

        const originSpan = document.createElement('span');
        originSpan.className = 'data-flow-origin';
        originSpan.textContent = entry.origin;

        const flag = document.createElement('span');
        flag.className = 'data-flow-active-flag' + (entry.currentlyActive ? '' : ' df-flag-inactive');
        flag.textContent = entry.currentlyActive
            ? t('dataFlowActive', 'active')
            : t('dataFlowInactive', 'idle');

        const purpose = document.createElement('span');
        purpose.className = 'data-flow-purpose';
        purpose.textContent = entry.purpose;

        const meta = document.createElement('span');
        meta.className = 'data-flow-meta';
        appendDataFlowMeta(meta, t('dataFlowProfile', 'profile'), entry.profile);
        appendDataFlowMeta(meta, t('dataFlowCreds', 'creds'), entry.credentialsPolicy);
        appendDataFlowMeta(meta, t('dataFlowRisk', 'risk'), entry.riskBand);
        if (entry.requiredByFeatures.length > 0) {
            const featList = entry.requiredByFeatures.length <= 2
                ? entry.requiredByFeatures.join(', ')
                : entry.requiredByFeatures.slice(0, 2).join(', ') + ' +' + (entry.requiredByFeatures.length - 2);
            appendDataFlowMeta(meta, t('dataFlowDriver', 'driver'), featList);
        }

        li.appendChild(dot);
        li.appendChild(originSpan);
        li.appendChild(flag);
        li.appendChild(purpose);
        li.appendChild(meta);
        dataFlowList.appendChild(li);
    }

    if (dataFlowSummary) {
        const tpl = t('dataFlowSummaryTpl', '{active}/{total} origins active');
        dataFlowSummary.textContent = tpl
            .replace('{active}', String(summary.currentlyActive))
            .replace('{total}', String(summary.totalCatalogued));
    }
    dataFlowSection.hidden = false;
}

// v4.23.0: schema-driven category overview. Reads SETTINGS_SCHEMA
// (bundled in popup.html as core/settings-schema.js) and renders a
// dense per-category roll-up of enabled-vs-total counts. Internal
// (_-prefixed) entries excluded; counts derive from the live
// settings bag so the row tone updates as the user toggles features.
function renderSchemaOverview() {
    if (!schemaOverviewSection || !schemaOverviewList) return;
    const scope = window.__YTKIT_SETTINGS_SCHEMA__;
    if (!scope || !Array.isArray(scope.SETTINGS_SCHEMA)) {
        // Schema module didn't load — leave the section collapsed and
        // empty rather than render a broken UI.
        schemaOverviewSection.hidden = true;
        return;
    }
    schemaOverviewSection.hidden = false;
    const settings = popupState.settings || {};

    // v4.39.0: seed the policy-profile resolver before the row-builder
    // runs so each github-full row can render the gated badge from the
    // same cached instance. ensurePolicyProfile() is idempotent.
    ensurePolicyProfile();

    // v4.25.0: share the popup's existing `#q` filter with the schema
    // overview. When a search term is active, the overview auto-opens
    // any category that contains a matching key + filters keys within
    // those categories to only the matches. Empty filter restores the
    // user's manually-toggled state.
    // v4.47.0: parse the mini-DSL so `risk:api`, `category:downloads`,
    // `scope:watch`, `profile:store-safe` narrow the overview by
    // metadata. Free-text tokens still match key/category/label/desc.
    const rawTerm = (q && q.value ? q.value : '').toLowerCase().trim();
    const parsed = parseSearchQuery(rawTerm);
    const hasFilters = Object.keys(parsed.filters).length > 0;
    const freeTerm = parsed.freeText;
    const term = rawTerm; // preserve downstream callers
    const humanizerLocal = scope && scope.humanizeSettingKey;
    const matchEntry = (entry) => {
        if (hasFilters && !entryPassesFilters(entry, parsed.filters)) return false;
        if (!freeTerm) return true;
        if (entry.key.toLowerCase().includes(freeTerm)) return true;
        if (entry.category.toLowerCase().includes(freeTerm)) return true;
        // v4.47.0: also search the humanised label and any description
        // field so a user looking for "auto download" can find
        // `autoDownloadOnVisit` without remembering the exact camelCase.
        if (typeof humanizerLocal === 'function') {
            const label = String(humanizerLocal(entry.key) || '').toLowerCase();
            if (label.includes(freeTerm)) return true;
        }
        if (entry.description && String(entry.description).toLowerCase().includes(freeTerm)) {
            return true;
        }
        return false;
    };

    const buckets = new Map();
    let nonInternalTotal = 0;
    let nonInternalEnabled = 0;
    for (const entry of scope.SETTINGS_SCHEMA) {
        if (entry.internal) continue;
        nonInternalTotal += 1;
        const isOn = isToggleEnabled(entry, settings);
        if (isOn) nonInternalEnabled += 1;
        if (!buckets.has(entry.category)) buckets.set(entry.category, { total: 0, enabled: 0, matches: 0 });
        const b = buckets.get(entry.category);
        b.total += 1;
        if (isOn) b.enabled += 1;
        if (matchEntry(entry)) b.matches += 1;
    }
    // Render rolled-up counts.
    if (schemaOverviewCount) {
        const tpl = t('schemaOverviewCountTpl',
            '{enabled}/{total} settings on across {categories} categories');
        schemaOverviewCount.textContent = tpl
            .replace('{enabled}',    String(nonInternalEnabled))
            .replace('{total}',      String(nonInternalTotal))
            .replace('{categories}', String(buckets.size));
    }
    // Render per-category rows in CATEGORIES order so the layout stays
    // stable between renders.
    schemaOverviewList.textContent = '';
    const ordered = Array.isArray(scope.CATEGORIES) ? scope.CATEGORIES : [...buckets.keys()];
    for (const cat of ordered) {
        const bucket = buckets.get(cat);
        if (!bucket) continue;
        // v4.25.0: when a search term is active, hide categories that
        // don't contain any matching keys.
        if (term && bucket.matches === 0) continue;
        const li = document.createElement('li');
        li.dataset.active = bucket.enabled > 0 ? 'true' : 'false';
        li.dataset.category = cat;

        // v4.24.0: the row is now a clickable disclosure. Use <button>
        // so screen readers + keyboard activation work without bespoke
        // role/tabindex/keydown plumbing.
        //
        // v4.25.0: when a search term is active, force-expand every
        // matching category so users see results without an extra click.
        const isExpanded = (term && bucket.matches > 0) || schemaOverviewState.expanded.has(cat);
        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'so-row-head';
        head.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
        head.dataset.category = cat;
        const nameSpan = document.createElement('span');
        nameSpan.className = 'so-category';
        nameSpan.textContent = cat;
        const countsSpan = document.createElement('span');
        countsSpan.className = 'so-counts';
        countsSpan.textContent = bucket.enabled + '/' + bucket.total;
        head.appendChild(nameSpan);
        head.appendChild(countsSpan);
        head.addEventListener('click', () => {
            if (schemaOverviewState.expanded.has(cat)) {
                schemaOverviewState.expanded.delete(cat);
            } else {
                schemaOverviewState.expanded.add(cat);
            }
            renderSchemaOverview();
            // v4.29.0: best-effort persist so the user's chosen
            // expansion survives the next popup open.
            void persistSchemaOverviewExpanded();
        });
        li.appendChild(head);

        // Render the per-key sub-list only when the row is expanded.
        // Keeps the popup compact when none are open.
        // v4.25.0: search-term match also force-opens the row.
        if (isExpanded) {
            const subList = document.createElement('ul');
            subList.className = 'so-key-list';
            subList.setAttribute('role', 'list');
            const entriesInCat = scope.SETTINGS_SCHEMA
                .filter((entry) => entry.category === cat && !entry.internal && matchEntry(entry));
            for (const entry of entriesInCat) {
                subList.appendChild(buildSchemaOverviewKeyRow(entry, settings));
            }
            li.appendChild(subList);
        }

        schemaOverviewList.appendChild(li);
    }
}

// v4.24.0: per-key row inside an expanded category. Booleans become a
// real switch button (read + write through chrome.storage.local).
// Non-booleans show their current value as a read-only badge — the
// editing surface for non-boolean types lives in the in-page workspace.
function buildSchemaOverviewKeyRow(entry, settings) {
    const row = document.createElement('li');
    row.className = 'so-key-row';
    row.dataset.key = entry.key;

    const label = document.createElement('span');
    label.className = 'so-key-name';
    // v4.28.0: prefer the schema's humanised label so users see
    // "Custom progress bar color" instead of "customProgressBarColor".
    // The raw storage key is still surfaced via the tooltip so power
    // users can identify the underlying setting for support tickets.
    //
    // v4.40.0: a schema entry may carry an explicit `labelKey` /
    // `descriptionKey` override for brand-name / domain-specific
    // strings where the deterministic humaniser is imprecise
    // (e.g. "Cobalt API instance URL" beats "Download cobalt instance").
    // The raw storage key still goes in the tooltip so power users
    // can identify the underlying setting.
    const humanizer = window.__YTKIT_SETTINGS_SCHEMA__
        && window.__YTKIT_SETTINGS_SCHEMA__.humanizeSettingKey;
    const overrideLabel = typeof entry.labelKey === 'string' && entry.labelKey.trim();
    label.textContent = overrideLabel
        || (typeof humanizer === 'function' ? humanizer(entry.key) : entry.key);
    const overrideDesc = typeof entry.descriptionKey === 'string' && entry.descriptionKey.trim();
    label.title = overrideDesc
        ? `${entry.key} — ${overrideDesc}`
        : entry.key;
    row.appendChild(label);

    // v4.39.0: profile-badge integration. A `github-full` entry only
    // takes effect when `githubFullProfile=true`; under store-safe the
    // toggle is a no-op. Make that visible up-front via a small lock
    // badge so users understand why a flip didn't change anything.
    // policy-profile.js exposes `isEntryAllowedInProfile`; we cache
    // the factory once per render via `popupState._policyProfile`.
    if (entry.profile === 'github-full') {
        const policy = popupState._policyProfile;
        const effective = policy
            ? policy.resolveEffectiveProfile(settings || {})
            : 'store-safe';
        if (!policy || !policy.isEntryAllowedInProfile(entry, effective)) {
            const badge = document.createElement('span');
            badge.className = 'so-key-profile-badge so-key-profile-gated';
            badge.textContent = 'github-full';
            badge.title = 'This setting only applies when GitHub-Full Profile is enabled.';
            row.appendChild(badge);
        }
    }

    if (entry.type === 'boolean') {
        const on = settings[entry.key] === true;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'so-key-switch' + (on ? ' on' : '');
        btn.setAttribute('role', 'switch');
        btn.setAttribute('aria-checked', String(on));
        btn.setAttribute('aria-label', entry.key + ' (' + (on ? 'on' : 'off') + ')');
        btn.dataset.key = entry.key;
        btn.addEventListener('click', async () => {
            const next = !(popupState.settings[entry.key] === true);
            btn.disabled = true;
            try {
                await writeSetting(entry.key, next);
                // Re-render the overview to refresh the count + this row.
                renderSchemaOverview();
            } catch (err) {
                console.warn('[Astra Deck popup] schema-overview toggle failed:', err);
            } finally {
                btn.disabled = false;
            }
        });
        row.appendChild(btn);
    } else if (entry.type === 'number') {
        // v4.26.0: number-type inline editor. <input type="number">
        // accepts any numeric value the user enters and persists on
        // change/blur. Schema default fills the placeholder so the
        // user can recover by clearing and re-typing.
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'so-key-number';
        input.dataset.key = entry.key;
        input.placeholder = String(entry.defaultValue);
        input.setAttribute('aria-label', entry.key);
        const current = settings[entry.key];
        if (current !== undefined && current !== null) input.value = String(current);
        // Persist on every change/blur. We deliberately don't debounce
        // — typing in a number field implies a deliberate edit, and
        // writeSetting's chained Promise already serialises rapid
        // edits so race conditions are bounded.
        const persist = async () => {
            const raw = input.value.trim();
            if (raw === '') return;     // empty input leaves the prior value untouched
            const next = Number(raw);
            if (!Number.isFinite(next)) return;
            if (popupState.settings[entry.key] === next) return;
            input.disabled = true;
            try {
                await writeSetting(entry.key, next);
                renderSchemaOverview();
            } catch (err) {
                console.warn('[Astra Deck popup] schema-overview number persist failed:', err);
            } finally {
                input.disabled = false;
            }
        };
        input.addEventListener('change', persist);
        input.addEventListener('blur',   persist);
        row.appendChild(input);
    } else if (entry.type === 'string') {
        // v4.27.0: string-type inline editor. Schema entries whose
        // default looks like a hex colour (#RGB or #RRGGBB or #RRGGBBAA)
        // get a real <input type="color"> picker; everything else gets
        // a compact text input. Either way the persist path is the
        // same — writeSetting on change/blur, empty short-circuits.
        const def = typeof entry.defaultValue === 'string' ? entry.defaultValue : '';
        const looksHex = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?$/.test(def)
            || /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?$/.test(settings[entry.key] || '');
        const input = document.createElement('input');
        input.type = looksHex ? 'color' : 'text';
        input.className = looksHex ? 'so-key-color' : 'so-key-text';
        input.dataset.key = entry.key;
        input.setAttribute('aria-label', entry.key);
        if (looksHex) {
            const current = settings[entry.key] || def || '#000000';
            // input[type=color] only accepts #RRGGBB. Coerce shorter
            // forms by mirroring the digit-expand from theme-css.
            const safe = /^#[0-9a-fA-F]{3}$/.test(current)
                ? '#' + current[1] + current[1] + current[2] + current[2] + current[3] + current[3]
                : current;
            input.value = /^#[0-9a-fA-F]{6}$/.test(safe) ? safe : '#000000';
        } else {
            input.placeholder = def;
            const current = settings[entry.key];
            if (typeof current === 'string') input.value = current;
        }
        const persist = async () => {
            const raw = (input.value || '').toString();
            // For the colour picker an empty value never happens; for
            // the text input we let empty strings persist so a user
            // can intentionally clear a string-shaped setting.
            if (popupState.settings[entry.key] === raw) return;
            input.disabled = true;
            try {
                await writeSetting(entry.key, raw);
                renderSchemaOverview();
            } catch (err) {
                console.warn('[Astra Deck popup] schema-overview string persist failed:', err);
            } finally {
                input.disabled = false;
            }
        };
        input.addEventListener('change', persist);
        input.addEventListener('blur',   persist);
        row.appendChild(input);
    } else if (entry.type === 'array' || entry.type === 'object') {
        // v4.41.0: array / object JSON editor. The schema overview
        // can now edit every type — closes the editor coverage from
        // ~340 to 354 schema keys. The editor renders the current
        // value via JSON.stringify(value, null, 2) and persists on
        // commit (change/blur) via JSON.parse. If parse fails the
        // row shows a parse-error pill below the textarea and skips
        // persistence; the user sees the bad JSON until they fix it.
        const wrap = document.createElement('div');
        wrap.className = 'so-key-json-wrap';
        const textarea = document.createElement('textarea');
        textarea.className = 'so-key-json';
        textarea.dataset.key = entry.key;
        textarea.setAttribute('aria-label', entry.key);
        textarea.spellcheck = false;
        textarea.rows = 4;
        const seed = settings[entry.key];
        const seedSafe = (seed === undefined || seed === null)
            ? (entry.type === 'array' ? [] : {})
            : seed;
        try {
            textarea.value = JSON.stringify(seedSafe, null, 2);
        } catch (_) {
            // reason: a cyclic / non-JSON-serialisable value can't be
            // stringified — render as empty so the user can re-key
            // from a clean slate.
            textarea.value = entry.type === 'array' ? '[]' : '{}';
        }
        const errorPill = document.createElement('span');
        errorPill.className = 'so-key-json-error';
        errorPill.hidden = true;
        const persist = async () => {
            const raw = textarea.value;
            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch (err) {
                errorPill.textContent = 'Invalid JSON: ' + (err && err.message || err);
                errorPill.hidden = false;
                return;
            }
            // Reject type mismatches up-front so a user who pastes
            // `{}` into an array-typed entry sees a clear error
            // instead of silently corrupting the storage shape.
            if (entry.type === 'array' && !Array.isArray(parsed)) {
                errorPill.textContent = 'Expected an array';
                errorPill.hidden = false;
                return;
            }
            if (entry.type === 'object' && (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object')) {
                errorPill.textContent = 'Expected an object';
                errorPill.hidden = false;
                return;
            }
            errorPill.hidden = true;
            errorPill.textContent = '';
            textarea.disabled = true;
            try {
                await writeSetting(entry.key, parsed);
                renderSchemaOverview();
            } catch (err) {
                console.warn('[Astra Deck popup] schema-overview JSON persist failed:', err);
            } finally {
                textarea.disabled = false;
            }
        };
        textarea.addEventListener('change', persist);
        textarea.addEventListener('blur',   persist);
        wrap.appendChild(textarea);
        wrap.appendChild(errorPill);
        row.appendChild(wrap);
    } else {
        // Read-only value badge for null types. The schema-overview
        // popup ships type-specific editors for boolean / number /
        // string / array / object; the remaining cases (only `null`
        // in the current schema) fall through to this read-only path.
        const badge = document.createElement('span');
        badge.className = 'so-key-value';
        const value = settings[entry.key];
        let display;
        if (value === undefined || value === null) display = '—';
        else display = String(value);
        badge.textContent = display;
        badge.title = entry.type + ' (no inline editor)';
        row.appendChild(badge);
    }
    return row;
}

// Decide whether a schema entry counts as "enabled" in the popup
// roll-up. Mirrors the heuristic used by the data-flow panel's
// isFeatureCurrentlyActive: booleans use truthiness, non-empty
// strings count, positive numbers count, objects/arrays count
// when non-empty, null/undefined → off.
function isToggleEnabled(entry, settings) {
    const value = settings[entry.key];
    if (value === undefined || value === null) return false;
    if (entry.type === 'boolean') return value === true;
    if (entry.type === 'string')  return typeof value === 'string' && value.length > 0;
    if (entry.type === 'number')  return Number(value) > 0;
    if (entry.type === 'array')   return Array.isArray(value) && value.length > 0;
    if (entry.type === 'object')  return value && Object.keys(value).length > 0;
    return Boolean(value);
}

function appendDataFlowMeta(container, label, value) {
    const wrap = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = label + ':';
    wrap.appendChild(strong);
    wrap.appendChild(document.createTextNode(' ' + value));
    container.appendChild(wrap);
}

async function recordCorruptionDiagnostic(corruption) {
    try {
        const items = await storageGet([SETTINGS_STORAGE_KEY]);
        const settings = isPlainObject(items[SETTINGS_STORAGE_KEY])
            ? { ...items[SETTINGS_STORAGE_KEY] }
            : {};
        const arr = Array.isArray(settings._errors)
            ? settings._errors.filter(isPlainObject).slice(-499)
            : [];
        arr.push({
            ts: Date.now(),
            ctx: 'storage-corruption',
            msg: corruption.slice(0, 5)
                .map((f) => `${f.kind}:${f.key}`)
                .join('|')
                .slice(0, 500)
        });
        settings._errors = arr;
        await storageSet({ [SETTINGS_STORAGE_KEY]: settings });
    } catch (_) {
        // Best-effort — if even writing the diagnostic fails the popup
        // banner is still surfaced, which is the user-facing recovery.
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
    // TextEncoder is dramatically cheaper than new Blob([...]) — the Blob
    // path allocates a second copy of the payload just to read .size.
    // Falls back to UTF-16 length × 2 if TextEncoder is missing (very old
    // browsers); slight over-estimate but never an under-estimate, which
    // is the safe direction for a quota check.
    const json = JSON.stringify(value);
    if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(json).byteLength;
    }
    return json.length * 2;
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
            // Firefox historically requires the anchor to be in the document
            // before .click() will trigger the download dialog. Chrome accepts
            // a detached anchor. Append + remove keeps the DOM clean and works
            // on both engines. The popup may unload immediately after; the
            // synchronous removeChild + click pair runs before any GC.
            const a = Object.assign(document.createElement('a'), { href: url, download: filename, rel: 'noopener' });
            document.body.appendChild(a);
            try {
                a.click();
            } finally {
                a.remove();
            }
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
        // Broadcast whole-settings change so open tabs pick up the new state.
        // Use the bulk-replaced variant — the prior per-key fan-out produced
        // O(N*tabs) IPC traffic on an import (~250 settings × open tabs) and
        // visible flicker as the UI reconciled partial state.
        if (writes[STORAGE_KEYS.settings]) {
            void broadcastSettingsReplaced(writes[STORAGE_KEYS.settings]);
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
    // iter-6 N7: best-effort selector-health snapshot from the active tab.
    // Hides the section if the user isn't on a YouTube page or if the
    // content script doesn't respond in time.
    void renderSelectorHealthDashboard();

    // v4.29.0: restore the persisted schema-overview expanded set BEFORE
    // the first render so the user sees their open categories on open.
    await restoreSchemaOverviewExpanded();

    try {
        const settings = await loadSettings();
        render(settings, '');
        // v4.12.0: data-flow panel renders from the v5.0.0 core/data-flow.js
        // catalogue. Gated on the privacyDataFlowPanel schema setting so the
        // popup stays compact for users who haven't opted in.
        renderDataFlowPanel();
        // v4.23.0: schema-driven category overview — read-only roll-up of
        // every settings-schema category with live enabled/total counts.
        // v4.29.0: expanded-category state restored above.
        renderSchemaOverview();
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
            // v4.25.0: the schema overview consults q.value too — keep
            // it in sync with the same debounce cadence as the
            // quick-toggle filter.
            renderSchemaOverview();
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
                // v4.12.0: keep the data-flow panel reactive — flipping
                // privacyDataFlowPanel from the in-page workspace must
                // surface in the popup on next render.
                renderDataFlowPanel();
                // v4.23.0: keep the schema overview's counts in sync
                // when settings change from any source.
                renderSchemaOverview();
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
    // iter-6 N2: storage-banner Reset shares the same destructive-confirm
    // dialog as the primary Reset button so accidental clicks stay guarded.
    if (storageBannerResetBtn) storageBannerResetBtn.addEventListener('click', () => { void resetAllData(); });
})();
