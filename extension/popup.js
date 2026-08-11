// Astra Deck — Toolbar Popup
// Quick-toggle 15 most-used features plus full data management
// (export, import, reset, storage stats) previously hosted by the
// standalone options page.

const browserApi = globalThis.YTKitBrowser;
const ext = browserApi?.hasNamespace ? browserApi.ns : null;

function callExtensionApi(target, method, ...args) {
    if (!browserApi?.call) {
        return Promise.reject(new Error(`Extension API wrapper unavailable: ${method}`));
    }
    return browserApi.call(target, method, args);
}

const QUICK_TOGGLES = [
    { key: 'removeAllShorts',        group: 'Feed Cleanup', nameKey: 'qt_removeAllShorts_name',        nameFallback: 'Hide Shorts',         descKey: 'qt_removeAllShorts_desc',        descFallback: 'Remove Shorts shelves and links' },
    { key: 'hideRelatedVideos',      group: 'Feed Cleanup', nameKey: 'qt_hideRelatedVideos_name',     nameFallback: 'Hide Related',        descKey: 'qt_hideRelatedVideos_desc',     descFallback: 'Clear the watch-page side rail' },
    { key: 'disableInfiniteScroll',  group: 'Feed Cleanup', nameKey: 'qt_disableInfiniteScroll_name', nameFallback: 'Cap Infinite Scroll', descKey: 'qt_disableInfiniteScroll_desc', descFallback: 'Stop endless feed loading' },
    { key: 'sponsorBlock',           group: 'Watch Flow',   nameKey: 'qt_sponsorBlock_name',          nameFallback: 'SponsorBlock',         descKey: 'qt_sponsorBlock_desc',          descFallback: 'Skip crowd-marked sponsor segments' },
    { key: 'deArrow',                group: 'Watch Flow',   nameKey: 'qt_deArrow_name',               nameFallback: 'DeArrow',              descKey: 'qt_deArrow_desc',               descFallback: 'Replace clickbait titles and thumbnails' },
    { key: 'commentSearch',          group: 'Watch Flow',   nameKey: 'qt_commentSearch_name',         nameFallback: 'Comment Search',       descKey: 'qt_commentSearch_desc',         descFallback: 'Filter watch-page comments inline' },
    { key: 'disableAutoplayNext',    group: 'Playback',     nameKey: 'qt_disableAutoplayNext_name',   nameFallback: 'Disable Autoplay',     descKey: 'qt_disableAutoplayNext_desc',   descFallback: 'Stop the next video from starting' },
    { key: 'persistentSpeed',        group: 'Playback',     nameKey: 'qt_persistentSpeed_name',       nameFallback: 'Persistent Speed',     descKey: 'qt_persistentSpeed_desc',       descFallback: 'Keep playback speed consistent' },
    { key: 'autoTheaterMode',        group: 'Playback',     nameKey: 'qt_autoTheaterMode_name',       nameFallback: 'Auto Theater Mode',   descKey: 'qt_autoTheaterMode_desc',       descFallback: 'Open videos in theater view' },
    { key: 'blueLightFilter',        group: 'Focus',        nameKey: 'qt_blueLightFilter_name',       nameFallback: 'Blue-Light Filter',    descKey: 'qt_blueLightFilter_desc',       descFallback: 'Warm the player for late viewing' },
    { key: 'miniPlayerBar',          group: 'Focus',        nameKey: 'qt_miniPlayerBar_name',         nameFallback: 'Mini Player Bar',      descKey: 'qt_miniPlayerBar_desc',         descFallback: 'Keep controls visible while scrolling' },
    { key: 'digitalWellbeing',       group: 'Focus',        nameKey: 'qt_digitalWellbeing_name',      nameFallback: 'Digital Wellbeing',    descKey: 'qt_digitalWellbeing_desc',      descFallback: 'Track breaks and daily viewing' },
    { key: 'cleanShareUrls',         group: 'Utilities',   nameKey: 'qt_cleanShareUrls_name',        nameFallback: 'Clean URLs',            descKey: 'qt_cleanShareUrls_desc',        descFallback: 'Remove tracking from share links' },
    { key: 'transcriptViewer',       group: 'Utilities',   nameKey: 'qt_transcriptViewer_name',      nameFallback: 'Transcript Sidebar',    descKey: 'qt_transcriptViewer_desc',      descFallback: 'Read, jump, and export captions' },
    { key: 'debugMode',              group: 'Utilities',   nameKey: 'qt_debugMode_name',             nameFallback: 'Diagnostic Logging',   descKey: 'qt_debugMode_desc',             descFallback: 'Record detailed local diagnostics' },
    // v4.15.0: privacy + profile toggles surfaced in the popup so the
    // v4.10.0 data-flow panel + v4.7.0 policy-profile machinery are
    // actually discoverable. safeStoreProfile stays on by default; the
    // others are off and become opt-in via the popup.
    { key: 'privacyDataFlowPanel',   group: 'Privacy',      nameKey: 'qt_privacyDataFlowPanel_name', nameFallback: 'Data-Flow Panel',     descKey: 'qt_privacyDataFlowPanel_desc', descFallback: 'Show every API origin Astra Deck can contact' },
    { key: 'syncSettings',           group: 'Privacy',      nameKey: 'qt_syncSettings_name',          nameFallback: 'Browser Sync',        descKey: 'qt_syncSettings_desc',          descFallback: 'Opt in to sync safe preferences and Video Hider blocklists' },
    { key: 'safeStoreProfile',       group: 'Privacy',      nameKey: 'qt_safeStoreProfile_name',      nameFallback: 'Store-Safe Profile',  descKey: 'qt_safeStoreProfile_desc',      descFallback: 'Hide github-full toggles + scrub keys on export' },
    { key: 'githubFullProfile',      group: 'Privacy',      nameKey: 'qt_githubFullProfile_name',     nameFallback: 'GitHub-Full Profile', descKey: 'qt_githubFullProfile_desc',     descFallback: 'Unlock github-full toggles (e.g. Cobalt, AI keys)' },
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
// schema is frozen and ~362 entries — a Map keyed by `key` keeps the
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

// Resolve a quick-toggle's effective on/off state. Raw storage
// truthiness is wrong on a fresh install (or right after Reset):
// default-on features (removeAllShorts, hideRelatedVideos,
// sponsorBlock, cleanShareUrls) have no stored value yet, so
// `Boolean(settings[key])` rendered them as Disabled, miscounted the
// enabled summary, and made the first click a no-op write of the
// already-effective value. Mirror the sidepanel's resolution
// (`_settingsState[key] ?? entry.defaultValue`) by falling back to the
// schema default when the key was never written.
function isQuickToggleOn(settings, key) {
    const raw = settings ? settings[key] : undefined;
    const value = raw ?? getSchemaIndex()?.get(key)?.defaultValue;
    return Boolean(value);
}

// Resolves user-facing strings via ext.i18n by default. A manual
// override (popup language dropdown) writes to ext.storage.local
// `_localeOverride`; when set, we fetch that locale's bundled
// messages.json once and serve from it. English literals stay inline
// at every call site as the fallback so the source remains
// self-documenting and the userscript build (no ext.i18n) keeps
// working.
const I18N = { override: null, map: null, ready: false };

// Bundled locales — must match the directories under extension/_locales/.
// Keep in sync with the language dropdown options in popup.html.
const BUNDLED_LOCALES = Object.freeze([
    'ar', 'en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pt_BR', 'ru', 'zh_CN'
]);
const BUNDLED_LOCALE_SET = new Set(BUNDLED_LOCALES);

// Defense: reject locale strings that aren't on the allowlist or that contain
// path-separator / parent-segment characters. `ext.runtime.getURL` is
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
        const items = await callExtensionApi(ext?.storage?.local, 'get', ['_localeOverride']) || {};
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

// Keep <html lang> truthful for assistive tech. popup.html ships
// lang="en"; once initI18n resolves the effective locale (manual
// override or ext.i18n auto-detect) the document language must
// follow, otherwise screen readers announce localized strings with
// English pronunciation rules. Locale tags are stored with an
// underscore (pt_BR) but the lang attribute wants BCP-47 (pt-BR).
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

function initLanguageDropdown() {
    const sel = document.getElementById('languageSelect');
    if (!sel) return;
    sel.value = I18N.override || 'auto';

    // Surface the auto-detected locale name on the "Auto" option label so
    // users can see what ext.i18n picked for them. If the detected
    // locale matches one of our bundled options we show its native name;
    // otherwise we just show the BCP-47 tag.
    try {
        const autoOpt = sel.querySelector('option[value="auto"]');
        if (autoOpt && ext?.i18n?.getUILanguage) {
            const ui = ext.i18n.getUILanguage() || '';
            // Map BCP-47 → bundled native label so an Auto user with a
            // German browser sees "Auto — Deutsch" instead of "Auto (de)".
            const NATIVE = {
                ar: 'العربية',
                en: 'English', de: 'Deutsch', es: 'Español', fr: 'Français',
                it: 'Italiano', ja: '日本語', ko: '한국어',
                'pt-BR': 'Português', 'pt': 'Português',
                ru: 'Русский', 'zh-CN': '简体中文', 'zh': '简体中文'
            };
            const detected = NATIVE[ui] || NATIVE[ui.split('-')[0]] || ui || '?';
            const baseLabel = t('languageAuto', 'Auto (browser default)');
            autoOpt.textContent = t('languageAutoDetectedTpl', '{label} — {detected}')
                .replace('{label}', baseLabel)
                .replace('{detected}', detected);
        }
    } catch (_) { /* reason: i18n detection is best-effort */ }

    sel.addEventListener('change', async () => {
        const rawLocale = sel.value || 'auto';
        // Guard the persisted value too — the dropdown is constrained to known
        // options but the storage key is a public surface that other code
        // (or future migrations) might overwrite.
        const locale = (rawLocale === 'auto' || isValidLocaleTag(rawLocale)) ? rawLocale : 'auto';
        try {
            await callExtensionApi(ext?.storage?.local, 'set', { _localeOverride: locale });
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
    'aiSummaryApiKey',
]);
// v4.47.0 NF25: must match ytkit.js#SETTINGS_VERSION and
// settings-meta.json#settingsVersion. The check-versions.js gate
// enforces parity across all three sources; bump in lockstep.
const SETTINGS_VERSION_FALLBACK = 9;
const SETTINGS_IMPORT_MIGRATIONS = Object.freeze({
    2(settings) {
        return settings;
    },
    // Migrations 3 and 4 exist to seed new defaults onto pre-v3/v4
    // snapshots. They must stay conditional — an imported backup that
    // carries an explicit user choice (false) must not be flipped back
    // to true just because the version marker was stripped or old.
    3(settings) {
        if (settings.hidePinnedComments === undefined) settings.hidePinnedComments = true;
        return settings;
    },
    4(settings) {
        if (settings.autoExpandComments === undefined) settings.autoExpandComments = true;
        return settings;
    },
    5(settings) {
        return settings;
    },
    6(settings) {
        for (const key of RETIRED_SETTING_KEYS) delete settings[key];
        return settings;
    },
    7(settings) {
        return settings;
    },
    8(settings) {
        delete settings.aiSummaryApiKey;
        return settings;
    },
    9(settings) {
        if (settings.hideAiSummary === false) {
            if (settings.hideAskAi === undefined) settings.hideAskAi = false;
            if (settings.hideGeminiButtons === undefined) settings.hideGeminiButtons = false;
            if (settings.hideAiContextPanels === undefined) settings.hideAiContextPanels = false;
        }
        return settings;
    },
});

const STORAGE_KEYS = {
    settings: 'ytSuiteSettings',
    hiddenVideos: 'ytkit-hidden-videos',
    allowedVideos: 'ytkit-video-hider-allowed-videos',
    markedWatchedVideos: 'ytkit-marked-watched-videos',
    blockedChannels: 'ytkit-blocked-channels',
    allowedChannels: 'ytkit-allowed-channels',
    filterListSubscription: 'ytkit-video-filter-list-subscription',
    bookmarks: 'ytkit-bookmarks',
    watchProgress: 'ytkit-watch-progress',
    watchTime: 'ytkit-watch-time',
    channelSpeeds: 'ytkit-channel-speeds',
    resumePositions: 'ytkit_resume_positions',
    persistentQueue: 'ytkit-queue',
    legacySidebarOrder: 'ytkit_sidebar_order'
};

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const IMPORT_LIMITS = Object.freeze({
    hiddenVideos: 5000,
    allowedVideos: 5000,
    blockedChannels: 2000,
    allowedChannels: 2000,
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

const PERSISTED_DATA_MESSAGE = 'YTKIT_PERSISTED_DATA';
const persistedDomains = globalThis.YTKitCore?.persistedDomains;

const popupState = {
    settings: {},
    activeTab: null,
    statusTimer: null,
    // v4.39.0: policy-profile instance — populated lazily on first
    // schema-overview render so the badge code can read profile
    // visibility without rebuilding the resolver on every key row.
    _policyProfile: null,
    // v4.47.0 NF10 follow-up: capability map populated once at popup
    // boot via capabilityProbe.runAll(). Schema rows whose `requires:`
    // field declares an unavailable capability surface an inline
    // "Unavailable" chip so users understand why a flip would no-op.
    // Null until the probe resolves; treated as "all available" until
    // then so the popup never blocks on the probe (it can fall through
    // to chip-less rendering if the probe rejects or times out).
    _capabilities: null,
    _optionalHostGrantState: {
        missingKeys: new Set(),
        missingOrigins: new Set()
    }
};

async function ensureCapabilityMap() {
    if (popupState._capabilities !== null) return popupState._capabilities;
    const probe = window.YTKitCore && window.YTKitCore.capabilityProbe;
    if (!probe || typeof probe.runAll !== 'function') {
        popupState._capabilities = {};
        return popupState._capabilities;
    }
    try {
        popupState._capabilities = await probe.runAll();
    } catch (err) {
        console.warn('[Astra Deck popup] capability-probe runAll failed:', err);
        popupState._capabilities = {};
    }
    return popupState._capabilities;
}

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
const undoImportButton = $('#undo-import-btn');
const exportFilterListButton = $('#export-filter-list-btn');
const importFilterListButton = $('#import-filter-list-btn');
const importFilterListFileInput = $('#import-filter-list-file');
const filterListUrlInput = $('#filter-list-url');
const refreshFilterListButton = $('#refresh-filter-list-btn');
const filterListStatus = $('#filter-list-status');
const resetButton = $('#reset-btn');
const resetYoutubeStateButton = $('#reset-youtube-state-btn');
const undoYoutubeStateButton = $('#undo-youtube-state-btn');
const statKeys = $('#stat-keys');
const statSize = $('#stat-size');
const statHidden = $('#stat-hidden-videos');
const statBlocked = $('#stat-blocked-channels');
const statBookmarks = $('#stat-bookmarks');
const settingsSyncCard = $('#settings-sync-card');
const settingsSyncStatus = $('#settings-sync-status');
const settingsSyncUndoButton = $('#settings-sync-undo');

const healthBanner = $('#health-banner');
const healthDetail = $('#health-detail');
const healthCopyBtn = $('#health-copy-btn');
const healthSaveBtn = $('#health-save-btn');
const healthClearBtn = $('#health-clear-btn');
// Captured so the Copy button can drop the full diagnostic payload on the
// clipboard without rebuilding it from DOM text.
let healthCopyPayload = '';

// storage-quota proactive warning banner.
const storageBanner = $('#storage-banner');
const storageBannerDetail = $('#storage-banner-detail');
const storageBannerResetBtn = $('#storage-banner-reset-btn');

// v4.47.0 NF21: first-run welcome card + What's New banner refs.
const welcomeCard = $('#welcome-card');
const welcomeDismissBtn = $('#welcome-dismiss-btn');
const welcomeProfileSafeBtn = $('#welcome-profile-safe');
const welcomeProfileFullBtn = $('#welcome-profile-full');
const whatsNewBanner = $('#whats-new');
const whatsNewDetail = $('#whats-new-detail');
const whatsNewOpenBtn = $('#whats-new-open');
const whatsNewDismissBtn = $('#whats-new-dismiss');
const optionalHostBanner = $('#optional-host-banner');
const optionalHostBannerDetail = $('#optional-host-banner-detail');
const optionalHostGrantBtn = $('#optional-host-grant-btn');

// v4.47.0 NF21: dedicated storage keys outside SETTINGS_STORAGE_KEY so
// settings export/import + Reset don't clobber them. _firstRunSeen is
// a boolean sentinel set on welcome-card dismiss / profile pick;
// _lastSeenVersion records the manifest version the popup was last
// opened against so the What's New banner only fires once per bump.
const FIRST_RUN_SEEN_KEY = 'ytkit_first_run_seen';
const LAST_SEEN_VERSION_KEY = 'ytkit_last_seen_version';
// Set by the background worker's runtime onInstalled listener so a fresh
// install can surface onboarding without the user first clicking the toolbar
// icon. Opening the popup IS the acknowledgement, so this clears here. Name
// must match background.js — pinned by a test.
const FIRST_RUN_PENDING_KEY = 'ytkit_first_run_pending';
// Anchor pattern documented in CHANGELOG.md: GitHub renders the
// version inside ## brackets as #<lowercase-major-minor-patch>.
const CHANGELOG_BASE_URL = 'https://github.com/SysAdminDoc/Astra-Deck/blob/main/CHANGELOG.md';

// selector-health dashboard refs.
const selectorHealthSection = $('#selector-health');
const selectorHealthTotal = $('#selector-health-total');
const selectorHealthList = $('#selector-health-list');
const selectorHealthCtx = $('#selector-health-ctx');
const selectorHealthAsset = $('#selector-health-asset');
const selectorHealthRefreshBtn = $('#selector-health-refresh-btn');
// v4.47.0: copy-report button + transient status line.
const selectorHealthCopyBtn = $('#selector-health-copy-btn');
const selectorHealthCopyStatus = $('#selector-health-copy-status');

// External API health dashboard refs.
const externalHealthSection = $('#external-health');
const externalHealthTotal = $('#external-health-total');
const externalHealthList = $('#external-health-list');
const externalHealthCopyBtn = $('#external-health-copy-btn');
const externalHealthCopyStatus = $('#external-health-copy-status');

// v4.12.0: data-flow panel refs.
const dataFlowSection = $('#data-flow');
const dataFlowSummary = $('#data-flow-summary');
const dataFlowList = $('#data-flow-list');

const aiCredentialSection = $('#ai-credential-manager');
const aiCredentialProvider = $('#ai-credential-provider');
const aiCredentialInput = $('#ai-credential-input');
const aiCredentialRemember = $('#ai-credential-remember');
const aiCredentialSave = $('#ai-credential-save');
const aiCredentialDelete = $('#ai-credential-delete');
const aiCredentialStatus = $('#ai-credential-status');
let aiCredentialProviders = Object.create(null);

// v4.23.0: schema-driven category overview refs.
const schemaOverviewSection = $('#schema-overview');
const schemaOverviewCount = $('#schema-overview-count');
const schemaOverviewList = $('#schema-overview-list');

// v4.24.0: which category rows are currently expanded. Stored in a
// Set so re-renders preserve open state across storage.onChanged
// without a settings round-trip.
//
// v4.29.0: also persisted across popup opens. The expanded set is
// mirrored into ext.storage.local under SCHEMA_OVERVIEW_EXPANDED_KEY
// so the popup remembers which categories the user had open.
const SCHEMA_OVERVIEW_EXPANDED_KEY = 'ytkit_popup_schema_overview_expanded';
const schemaOverviewState = { expanded: new Set() };

// v4.29.0: persist popup overview expansion across opens. Stored as a
// plain string array rather than a Set for ext.storage compatibility.
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
// default 10 MB ext.storage.local quota is removed — but a
// runaway-growth signal is still useful UX even without a hard
// ceiling. Tier 1 (>20 MB) starts the soft nudge; tier 2 (>50 MB)
// upgrades the wording. Both stay polite — the popup never auto-
// resets; the Reset button applies immediately with a session-scoped
// undo snapshot (the confirm dialog was removed in v4.47.0 NF14).
const STORAGE_WARN_SOFT_BYTES = 20 * 1024 * 1024;
const STORAGE_WARN_HARD_BYTES = 50 * 1024 * 1024;

function getVersion() {
    try { return (ext.runtime.getManifest().version || '—'); } catch { return '—'; }
}

const versionEl = $('#version');
const manifestVersion = getVersion();
// Defensive: a popup.html edit removing #version used to crash the entire
// popup bootstrap at this top-level line. Audit pass: degrade gracefully
// so the rest of the popup still functions even if the badge slot is gone.
if (versionEl) {
    const hasManifestVersion = manifestVersion && manifestVersion !== '—';
    versionEl.hidden = !hasManifestVersion;
    versionEl.textContent = hasManifestVersion ? 'v' + manifestVersion : '';
    versionEl.title = hasManifestVersion
        ? `${BRAND_NAME} v${manifestVersion}`
        : `${BRAND_NAME} version unavailable`;
}

// ── Storage wrappers ──

function hasChromeStorageLocal(method) {
    // `ext` is null (not undefined) when popup.html is opened outside an
    // extension context — the exact case the preview-mode banner handles.
    return !!ext
        && !!ext.storage
        && !!ext.storage.local
        && (!method || typeof ext.storage.local[method] === 'function');
}

function isExtensionStorageUnavailable(error) {
    if (!hasChromeStorageLocal('get')) return true;
    const message = String(error?.message || error || '');
    return /Extension storage is unavailable|Extension API unavailable|Cannot read properties of (?:undefined|null) \(reading 'local'\)/i.test(message);
}

function getStorageUnavailableMessage() {
    return 'Preview mode: extension storage is unavailable here. Reload the installed extension to use saved controls.';
}

function storageGet(keys) {
    if (!hasChromeStorageLocal('get')) {
        return Promise.reject(new Error('Extension storage is unavailable in this context'));
    }
    return callExtensionApi(ext.storage.local, 'get', keys).then((items) => items || {});
}

function storageSet(entries) {
    if (!hasChromeStorageLocal('set')) {
        return Promise.reject(new Error('Extension storage is unavailable in this context'));
    }
    return callExtensionApi(ext.storage.local, 'set', entries).then(() => undefined);
}

function storageRemove(keys) {
    if (!hasChromeStorageLocal('remove')) {
        return Promise.reject(new Error('Extension storage is unavailable in this context'));
    }
    return callExtensionApi(ext.storage.local, 'remove', keys).then(() => undefined);
}

function storageClear() {
    if (!hasChromeStorageLocal('clear')) {
        return Promise.reject(new Error('Extension storage is unavailable in this context'));
    }
    return callExtensionApi(ext.storage.local, 'clear').then(() => undefined);
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

function migrateImportedSettings(settings, currentVersion, source = 'popup-import', options = {}) {
    const migrated = sanitizeSettingsObject(settings);
    const targetVersion = normalizeSettingsVersion(currentVersion || SETTINGS_VERSION_FALLBACK);
    // buildExportSnapshot({ schemaOnly: true }) strips the inner
    // `_settingsVersion` marker on export (it is not a schema key), so
    // a re-imported backup would otherwise re-run every migration from
    // v1. Seed from the backup's top-level `settingsSchemaVersion`
    // (threaded through options.backupSchemaVersion) when the inner
    // marker is missing; an explicit inner marker still wins.
    const versionSeed = (migrated._settingsVersion !== undefined && migrated._settingsVersion !== null)
        ? migrated._settingsVersion
        : options.backupSchemaVersion;
    const startingVersion = normalizeSettingsVersion(versionSeed);
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
        const url = ext.runtime?.getURL ? ext.runtime.getURL(filename) : filename;
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

function mergeImportedSettingsWithDefaults(settings, defaults, settingsVersion, source, options = {}) {
    const migrated = migrateImportedSettings(settings, settingsVersion, source, options);
    const validated = validateSettingsForBackupImport(migrated);
    return sanitizeSettingsObject({
        ...defaults,
        ...validated,
        _settingsVersion: settingsVersion
    });
}

function formatSchemaValidationError(prefix, validation) {
    const errors = validation && Array.isArray(validation.errors) ? validation.errors : [];
    const sample = errors.slice(0, 4).join('; ');
    const suffix = errors.length > 4 ? `; +${errors.length - 4} more` : '';
    return `${prefix}: ${sample || 'schema validation failed'}${suffix}`;
}

function validateSettingsForBackupImport(settings) {
    const policy = ensurePolicyProfile();
    if (!policy || typeof policy.validateSettingsSnapshot !== 'function') {
        return sanitizeSettingsObject(settings);
    }
    const validation = policy.validateSettingsSnapshot(settings);
    if (!validation.ok) {
        throw new Error(formatSchemaValidationError('Settings import rejected', validation));
    }
    return sanitizeSettingsObject(validation.settings);
}

function buildSchemaValidatedExportSettings(settings) {
    const source = sanitizeSettingsObject(settings);
    const policy = ensurePolicyProfile();
    if (!policy || typeof policy.buildExportSnapshot !== 'function') {
        return {
            settings: source,
            effectiveProfile: 'unknown',
            scrubbedKeys: [],
            defaultedKeys: []
        };
    }
    const snapshot = policy.buildExportSnapshot(source, { schemaOnly: true });
    if (typeof policy.validateSettingsSnapshot === 'function') {
        const validation = policy.validateSettingsSnapshot(snapshot.settings);
        if (!validation.ok) {
            throw new Error(formatSchemaValidationError('Settings export rejected', validation));
        }
        snapshot.settings = sanitizeSettingsObject(validation.settings);
    }
    return {
        settings: snapshot.settings,
        effectiveProfile: snapshot.effective || 'unknown',
        scrubbedKeys: Array.isArray(snapshot.scrubbedKeys) ? snapshot.scrubbedKeys : [],
        defaultedKeys: Array.isArray(snapshot.defaultedKeys) ? snapshot.defaultedKeys : []
    };
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];
function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${formatCount(bytes)} B`;
    let value = bytes;
    let unit = 0;
    // Scale through KB/MB/GB/TB instead of capping at MB (a multi-GB payload
    // previously read "2048.00 MB"). Locale-aware decimals so German users see
    // "1,5 KB", consistent with the tabular-numerals styling.
    while (value >= 1024 && unit < BYTE_UNITS.length - 1) { value /= 1024; unit += 1; }
    const decimals = value < 10 ? 2 : 1;
    const num = value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
    return `${num} ${BYTE_UNITS[unit]}`;
}

// Locale-aware integer formatting for storage counts (grouping separators).
function formatCount(n) {
    const v = Number(n);
    return Number.isFinite(v) ? v.toLocaleString() : '0';
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
    if (!hasChromeStorageLocal('get')) {
        popupState.settings = {};
        return popupState.settings;
    }
    const items = await storageGet([SETTINGS_STORAGE_KEY, ...QUICK_TOGGLE_KEYS]);
    const normalized = normalizeStoredSettings(items);

    if (normalized.legacyKeys.length > 0) {
        // Merge the legacy top-level values into ytSuiteSettings through
        // the background-serialized mutation controller — the old direct
        // storageSet of the full object could clobber a concurrent write
        // from another surface (lost-update race). mutateMany merges into
        // the freshest stored object, and the legacy keys are only removed
        // after the merge persisted, so a failed migration retries on the
        // next popup open instead of losing data.
        let migrated = null;
        try {
            migrated = await getSettingsMutationController().mutateMany(
                Object.fromEntries(normalized.legacyKeys.map((key) => [key, normalized.settings[key]]))
            );
        } catch (_) {
            // reason: controller unavailable (core script failed to load) —
            // keep the merged in-memory view and retry the migration later.
        }
        if (migrated?.ok) {
            await storageRemove(normalized.legacyKeys);
            popupState.settings = isPlainObject(migrated.settings)
                ? migrated.settings
                : normalized.settings;
            return popupState.settings;
        }
    }

    popupState.settings = normalized.settings;
    return popupState.settings;
}

let _settingsMutationController = null;

function getSettingsMutationController() {
    if (_settingsMutationController) return _settingsMutationController;
    const factory = window.YTKitCore?.createSettingsMutationController;
    if (typeof factory !== 'function') {
        throw new Error('The settings service is unavailable. Reload the extension.');
    }
    _settingsMutationController = factory({ source: 'popup' });
    return _settingsMutationController;
}
function getManifestOptionalHostPermissions() {
    try {
        const declared = ext?.runtime?.getManifest?.().optional_host_permissions || [];
        return Array.isArray(declared) ? declared : [];
    } catch (_) {
        return [];
    }
}

function uniqueOptionalOrigins(origins) {
    if (!Array.isArray(origins)) return [];
    return Array.from(new Set(origins.filter((origin) =>
        typeof origin === 'string' && origin.trim()).map((origin) => origin.trim())));
}

function getDirectOptionalHostsForSetting(key, declaredSet, profile = 'store-safe') {
    const core = window.YTKitCore || {};
    const catalogue = Array.isArray(core.ORIGIN_CATALOGUE) ? core.ORIGIN_CATALOGUE : [];
    const hostFactory = core.hostPermissionsForDataFlowOrigin;
    if (!catalogue.length || typeof hostFactory !== 'function') return [];
    const hosts = [];
    for (const entry of catalogue) {
        if (entry?.profile !== profile) continue;
        if (entry.hostGrant !== 'runtime-optional') continue;
        if (Array.isArray(entry.runtimeOptionalProfiles)
            && !entry.runtimeOptionalProfiles.includes(profile)) continue;
        if (!Array.isArray(entry.requiredByFeatures) || !entry.requiredByFeatures.includes(key)) continue;
        hosts.push(...hostFactory(entry.origin));
    }
    return uniqueOptionalOrigins(hosts).filter((origin) => declaredSet.has(origin));
}

function getDeclaredOptionalHostsForSetting(key, options = {}) {
    const core = window.YTKitCore || {};
    if (typeof core.getOptionalHostPermissionsForFeature !== 'function') return [];
    const declared = getManifestOptionalHostPermissions();
    if (!Array.isArray(declared) || !declared.length) return [];
    const declaredSet = new Set(declared);
    const policy = ensurePolicyProfile();
    const profile = options.profile || (policy
        ? policy.resolveEffectiveProfile(popupState.settings || {})
        : 'store-safe');
    if (options.directOnly) {
        return getDirectOptionalHostsForSetting(key, declaredSet, profile);
    }
    return uniqueOptionalOrigins(core.getOptionalHostPermissionsForFeature(key, { profile }))
        .filter((origin) => declaredSet.has(origin));
}

async function requestOptionalHostOrigins(origins) {
    origins = uniqueOptionalOrigins(origins);
    if (!origins.length) return true;
    const factory = window.YTKitCore && window.YTKitCore.createOptionalHostPermissions;
    const helper = (typeof factory === 'function') ? factory() : null;
    if (!helper || !helper.isSupported()) {
        const error = new Error('Optional host permission prompts are not available in this browser.');
        error.code = 'OPTIONAL_HOST_PERMISSION_DENIED';
        throw error;
    }
    const granted = await helper.request(origins);
    if (!granted) {
        const error = new Error('Astra Deck needs host access for this optional feature before it can be enabled.');
        error.code = 'OPTIONAL_HOST_PERMISSION_DENIED';
        throw error;
    }
    return true;
}

async function requestOptionalHostsForSetting(key, value) {
    if (value !== true) return true;
    return requestOptionalHostOrigins(getDeclaredOptionalHostsForSetting(key));
}

function isOptionalHostPermissionError(error) {
    return error?.code === 'OPTIONAL_HOST_PERMISSION_DENIED'
        || /optional host permission|host access/i.test(error?.message || '');
}

function formatSettingWriteError(name, error) {
    if (isOptionalHostPermissionError(error) && error?.message) {
        return error.message;
    }
    return t('toggleUpdateFailTpl', `Couldn't update ${name}. Try again.`).replace('{name}', name);
}

function setEquals(a, b) {
    if (!(a instanceof Set) || !(b instanceof Set)) return false;
    if (a.size !== b.size) return false;
    for (const value of a) {
        if (!b.has(value)) return false;
    }
    return true;
}

function isOptionalHostGrantMissing(key) {
    return popupState._optionalHostGrantState.missingKeys.has(key);
}

function getOptionalHostGrantTitle(key) {
    const origins = getDeclaredOptionalHostsForSetting(key);
    const list = origins.length ? origins.join(', ') : t('optionalHostUnknown', 'optional host access');
    return t('optionalHostPermissionMissingTooltip',
        'Host access for this optional feature is denied or was revoked. Enable the setting again to grant access.')
        + ' ' + list;
}

function createQuickOptionalHostBadge(key) {
    if (!isOptionalHostGrantMissing(key)) return null;
    const badge = document.createElement('span');
    badge.className = 'toggle-risk-badge toggle-risk-permission';
    badge.textContent = t('optionalHostPermissionBadge', 'permission needed');
    badge.title = getOptionalHostGrantTitle(key);
    badge.setAttribute('aria-label', badge.title);
    return badge;
}

function createSchemaOptionalHostBadge(key) {
    if (!isOptionalHostGrantMissing(key)) return null;
    const badge = document.createElement('span');
    badge.className = 'so-key-profile-badge so-key-permission-missing';
    badge.textContent = t('optionalHostPermissionBadge', 'permission needed');
    badge.title = getOptionalHostGrantTitle(key);
    return badge;
}

function dataFlowOptionalGrantLabel(entry) {
    if (!entry?.optionalManifestPermission || !entry.currentlyActive) return null;
    return popupState._optionalHostGrantState.missingOrigins.has(entry.optionalManifestPermission)
        ? t('dataFlowGrantNeeded', 'permission needed')
        : t('dataFlowGrantActive', 'granted');
}

function renderOptionalHostBanner() {
    if (!optionalHostBanner || !optionalHostBannerDetail || !optionalHostGrantBtn) return;
    const state = popupState._optionalHostGrantState;
    const missingOrigins = Array.from(state.missingOrigins);
    if (!missingOrigins.length) {
        optionalHostBanner.hidden = true;
        optionalHostGrantBtn.disabled = false;
        return;
    }
    const missingKeys = Array.from(state.missingKeys);
    const featureCount = missingKeys.length;
    const originText = missingOrigins.join(', ');
    optionalHostBannerDetail.textContent = featureCount === 1
        ? t('optionalHostBannerDetailOne',
            '1 enabled enrichment feature needs host access: {origins}.').replace('{origins}', originText)
        : t('optionalHostBannerDetailMany',
            '{count} enabled enrichment features need host access: {origins}.')
            .replace('{count}', String(featureCount)).replace('{origins}', originText);
    optionalHostGrantBtn.disabled = false;
    optionalHostBanner.hidden = false;
}

async function grantMissingOptionalHostPermissions() {
    if (!optionalHostGrantBtn) return;
    const origins = Array.from(popupState._optionalHostGrantState.missingOrigins);
    if (!origins.length) {
        renderOptionalHostBanner();
        return;
    }
    optionalHostGrantBtn.disabled = true;
    optionalHostGrantBtn.setAttribute('aria-busy', 'true');
    try {
        await requestOptionalHostOrigins(origins);
        await refreshOptionalHostGrantState();
        showStatus(t('optionalHostPermissionGranted', 'Optional host access granted.'), 'success', 3200);
    } catch (error) {
        console.warn('[Astra Deck popup] Optional host grant request failed:', error);
        showStatus(formatSettingWriteError(t('optionalHostGrantName', 'optional host access'), error), 'error', 5200);
    } finally {
        optionalHostGrantBtn.removeAttribute('aria-busy');
        optionalHostGrantBtn.disabled = false;
        renderOptionalHostBanner();
    }
}

async function refreshOptionalHostGrantState(options = {}) {
    const settings = popupState.settings || {};
    const factory = window.YTKitCore && window.YTKitCore.createOptionalHostPermissions;
    const helper = (typeof factory === 'function') ? factory() : null;
    const nextMissingKeys = new Set();
    const nextMissingOrigins = new Set();

    // Iterate the SCHEMA, not the sparse settings bag: a default-on feature
    // that was never toggled has no key in storage, so a bag-driven scan could
    // never see it. sponsorBlock is exactly that case on a store-safe build —
    // its origins are runtime-optional, the grant is only ever requested from a
    // toggle the user never touches, and the banner built to surface the
    // missing grant was structurally blind to it.
    const schemaIndex = getSchemaIndex();
    const candidateKeys = schemaIndex
        ? Array.from(schemaIndex.keys())
        : Object.keys(settings);
    for (const key of candidateKeys) {
        const entry = schemaIndex?.get(key);
        const value = entry
            ? resolveEffectiveSettingValue(entry, settings)
            : settings[key];
        if (value !== true) continue;
        const origins = getDeclaredOptionalHostsForSetting(key, { directOnly: true });
        if (!origins.length) continue;
        let granted = false;
        if (helper && helper.isSupported()) {
            try {
                granted = await helper.contains(origins);
            } catch (err) {
                console.warn('[Astra Deck popup] Optional host permission check failed:', err);
            }
        }
        if (!granted) {
            nextMissingKeys.add(key);
            for (const origin of origins) nextMissingOrigins.add(origin);
        }
    }

    const previous = popupState._optionalHostGrantState;
    const changed = !setEquals(previous.missingKeys, nextMissingKeys)
        || !setEquals(previous.missingOrigins, nextMissingOrigins);
    popupState._optionalHostGrantState = {
        missingKeys: nextMissingKeys,
        missingOrigins: nextMissingOrigins
    };
    renderOptionalHostBanner();
    if (!changed) return popupState._optionalHostGrantState;

    if (options.notify && nextMissingKeys.size > 0) {
        showStatus(t('optionalHostPermissionRevoked',
            'Optional host access was revoked. Re-enable the affected setting to grant access again.'),
            'error', 5200);
    }
    if (options.render !== false) {
        render(popupState.settings, q.value);
        renderDataFlowPanel();
        renderSchemaOverview();
        renderOptionalHostBanner();
    }
    return popupState._optionalHostGrantState;
}

function registerOptionalHostPermissionListeners() {
    const factory = window.YTKitCore && window.YTKitCore.createOptionalHostPermissions;
    const helper = (typeof factory === 'function') ? factory() : null;
    if (!helper) return;
    helper.onAdded(() => {
        void refreshOptionalHostGrantState();
    });
    helper.onRemoved(() => {
        void refreshOptionalHostGrantState({ notify: true });
    });
}

async function writeSetting(key, value) {
    await requestOptionalHostsForSetting(key, value);
    const result = await getSettingsMutationController().mutate(key, value);
    if (!result.ok) {
        const error = new Error(result.error?.message || `Could not update ${key}.`);
        error.code = result.error?.code || 'SETTING_WRITE_FAILED';
        error.result = result;
        throw error;
    }
    popupState.settings = result.settings;
    await refreshOptionalHostGrantState({ render: false });
    return result;
}

async function replaceSettings(settings) {
    const result = await getSettingsMutationController().replace(settings);
    if (!result.ok) {
        const error = new Error(result.error?.message || 'Could not replace settings.');
        error.code = result.error?.code || 'SETTING_WRITE_FAILED';
        error.result = result;
        throw error;
    }
    popupState.settings = result.settings;
    return result;
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
            mode: 'inline-panel',
            state: 'ready'
        };
    }
    if (isAnyYouTubeUrl(url)) {
        return {
            label: t('contextStateYouTube', 'YouTube'),
            note: t('contextNoteLaunch', 'Open a watchable YouTube tab to use the full in-page workspace.'),
            openLabel: t('openYouTube', 'Open YouTube'),
            mode: 'launch',
            state: 'warn'
        };
    }
    return {
        label: t('contextStateAnyTab', 'Any Tab'),
        note: t('contextNoteAnyTab', 'Quick toggles are saved now and sync when YouTube is open.'),
        openLabel: t('openYouTube', 'Open YouTube'),
        mode: 'launch',
        state: 'local'
    };
}

function updateContext(tab) {
    popupState.activeTab = tab || null;
    const nextContext = getTabContext(tab);
    contextState.textContent = nextContext.label;
    contextState.dataset.state = nextContext.state;
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
    // Errors must interrupt the screen reader; routine successes/info stay
    // polite. (The #status region is aria-live="polite" by default.)
    if (normalizedType === 'error') {
        statusBanner.setAttribute('role', 'alert');
        statusBanner.setAttribute('aria-live', 'assertive');
    } else {
        statusBanner.removeAttribute('role');
        statusBanner.setAttribute('aria-live', 'polite');
    }
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
    if (element.offsetParent === null && getComputedStyle(element).position !== 'fixed') return false;
    return true;
}

function getFocusableElements(root = document.body) {
    return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isVisibleFocusableElement);
}

function getActiveFocusRoot() {
    // v4.47.0 NF14: the confirm-shell modal was retired in favor of the
    // immediate-apply + undo-toast pattern. The Tab-trap below now
    // always rotates within the document body.
    return document.body;
}

function focusInitialPopupControl() {
    requestAnimationFrame(() => {
        if (document.activeElement && document.activeElement !== document.body) return;
        const firstControl = getFocusableElements(document.body)[0];
        firstControl?.focus?.();
    });
}

function handlePopupDialogKeydown(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') {
        const openMaintenance = document.querySelector('.maintenance-menu[open]');
        if (openMaintenance) {
            event.preventDefault();
            openMaintenance.open = false;
            openMaintenance.querySelector('summary')?.focus?.();
            return;
        }
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
            first.focus();
            return;
        }

        if (event.shiftKey && (!active || active === first || !focusRoot.contains(active))) {
            event.preventDefault();
            last.focus();
            return;
        }

        if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    }
}

function installPopupFocusManagement() {
    document.addEventListener('keydown', handlePopupDialogKeydown);
}

// ── Summary ──

function updateSummary(settings) {
    const enabled = QUICK_TOGGLE_KEYS.reduce((count, key) => count + (isQuickToggleOn(settings, key) ? 1 : 0), 0);
    enabledCount.textContent = String(enabled);
}

function updateSearchState() {
    clearSearchButton.hidden = !q.value.trim();
}

function updateResultsState(totalCount, visibleCount, filter) {
    const normalizedFilter = (filter || '').trim();
    const controlsWord = totalCount === 1 ? t('controlSingular', 'control') : t('controlPlural', 'controls');
    const totalLabel = t('resultsCountTpl', '{count} {controls}')
        .replace('{count}', String(totalCount))
        .replace('{controls}', controlsWord);
    if (!normalizedFilter) {
        resultsState.textContent = totalLabel;
        resultsState.title = t('resultsAllAvailableTpl', `${totalCount} quick controls are available in this popup`).replace('{count}', String(totalCount));
        return;
    }
    resultsState.textContent = t('resultsVisibleTpl', '{count} matching')
        .replace('{count}', String(visibleCount));
    resultsState.title = t('resultsMatchTpl', `${visibleCount} of ${totalCount} ${controlsWord} match this filter`)
        .replace('{visible}', String(visibleCount))
        .replace('{total}', String(totalCount))
        .replace('{controls}', controlsWord);
}

// ── Toggle render ──

function renderLoading() {
    list.setAttribute('aria-busy', 'true');
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

async function sendPanelOpenMessage(tabId) {
    // The panel-open ack must distinguish "no receiver in the tab" (reject →
    // open a fresh tab) from "receiver busy hydrating" (timeout → trust
    // delivery). Collapsing both to a 2s null previously opened a duplicate
    // youtube.com tab whenever a watch page blocked the main thread past the
    // ack window.
    if (!tabId) return false;
    let timeoutId;
    try {
        const response = await Promise.race([
            callExtensionApi(ext?.tabs, 'sendMessage', tabId, { type: PANEL_OPEN_MESSAGE }),
            new Promise((resolve) => { timeoutId = setTimeout(() => resolve('ytkit-ack-timeout'), 8000); })
        ]);
        if (response === 'ytkit-ack-timeout') return true;
        return response?.ok !== false;
    } catch (_) {
        return false;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function sendTabMessageResponse(tabId, message) {
    if (!tabId) throw new Error('No YouTube tab is available');
    const response = await callExtensionApi(ext?.tabs, 'sendMessage', tabId, message);
    if (!response?.ok) {
        const error = new Error(response?.error || 'YouTube data operation failed');
        error.code = 'YTKIT_PERSISTED_DATA_OPERATION_FAILED';
        throw error;
    }
    return response;
}

async function queryYoutubeTabs() {
    try {
        const tabs = await callExtensionApi(ext?.tabs, 'query', { url: YOUTUBE_TAB_URLS });
        return Array.isArray(tabs) ? tabs : [];
    } catch (_) {
        return [];
    }
}

function getTabOrigin(tab) {
    try { return new URL(tab?.url || '').origin; } catch (_) { return ''; }
}

async function sendPersistedDataMessage(message, requiredOrigin = '') {
    const tabs = await queryYoutubeTabs();
    const ordered = tabs
        .filter((tab) => tab?.id && !/\/live_chat(?:\?|$)/.test(tab.url || ''))
        .filter((tab) => !requiredOrigin || getTabOrigin(tab) === requiredOrigin)
        .sort((left, right) => {
            const score = (tab) => (tab.active ? 4 : 0) + (getTabOrigin(tab) === 'https://www.youtube.com' ? 2 : 0) + (tab.id === popupState.activeTab?.id ? 1 : 0);
            return score(right) - score(left);
        });
    let lastError = null;
    let lastOperationError = null;
    for (const tab of ordered) {
        try {
            const response = await sendTabMessageResponse(tab.id, { type: PERSISTED_DATA_MESSAGE, ...message });
            return { response, origin: getTabOrigin(tab), tabId: tab.id };
        } catch (error) {
            lastError = error;
            if (error?.code === 'YTKIT_PERSISTED_DATA_OPERATION_FAILED') lastOperationError = error;
        }
    }
    if (lastOperationError) throw lastOperationError;
    const unavailable = new Error(lastError?.message || 'No responsive YouTube tab is available');
    unavailable.code = 'YTKIT_PERSISTED_DATA_UNAVAILABLE';
    throw unavailable;
}

function isPersistedDataUnavailable(error) {
    return error?.code === 'YTKIT_PERSISTED_DATA_UNAVAILABLE';
}

function sendRuntimeMessage(message) {
    return callExtensionApi(ext?.runtime, 'sendMessage', message);
}

function setAiCredentialBusy(busy) {
    for (const control of [aiCredentialProvider, aiCredentialInput, aiCredentialRemember, aiCredentialSave, aiCredentialDelete]) {
        if (control) control.disabled = !!busy;
    }
    if (!busy) renderAiCredentialStatus();
}

function renderAiCredentialStatus() {
    if (!aiCredentialProvider || !aiCredentialStatus || !aiCredentialDelete) return;
    const state = aiCredentialProviders[aiCredentialProvider.value] || {};
    aiCredentialStatus.textContent = state.configured
        ? (state.remembered
            ? t('aiCredentialStatusRemembered', 'Configured · remembered')
            : t('aiCredentialStatusSession', 'Configured · this session'))
        : t('aiCredentialStatusNotConfigured', 'Not configured');
    aiCredentialDelete.disabled = !state.configured;
    aiCredentialSave.textContent = state.configured
        ? t('aiCredentialReplaceBtn', 'Replace credential')
        : t('aiCredentialSaveBtn', 'Save credential');
}

async function refreshAiCredentialManager() {
    if (!aiCredentialSection) return;
    const policy = ensurePolicyProfile();
    const effective = policy
        ? policy.resolveEffectiveProfile(popupState.settings || {})
        : 'store-safe';
    aiCredentialSection.hidden = effective !== 'github-full';
    if (aiCredentialSection.hidden) return;
    if (aiCredentialProvider && !aiCredentialProvider.dataset.initialized
        && ['openai', 'anthropic', 'gemini'].includes(popupState.settings?.aiSummaryProvider)) {
        aiCredentialProvider.value = popupState.settings.aiSummaryProvider;
        aiCredentialProvider.dataset.initialized = 'true';
    }
    try {
        const response = await sendRuntimeMessage({ type: 'YTKIT_AI_CREDENTIAL_STATUS' });
        if (!response?.ok) throw new Error(response?.error?.message || t('aiCredentialStatusError', 'Credential status unavailable.'));
        aiCredentialProviders = response.providers || Object.create(null);
        renderAiCredentialStatus();
    } catch (error) {
        aiCredentialStatus.textContent = t('aiCredentialStatusUnavailable', 'Status unavailable');
        aiCredentialDelete.disabled = true;
        showStatus(error.message || t('aiCredentialStatusError', 'Credential status unavailable.'), 'error', 3600);
    }
}

async function saveAiCredential() {
    const provider = aiCredentialProvider?.value;
    const credential = aiCredentialInput?.value || '';
    if (!credential.trim()) {
        aiCredentialInput?.setCustomValidity(t('aiCredentialInputRequired', 'Enter a credential to save.'));
        aiCredentialInput?.reportValidity();
        return;
    }
    setAiCredentialBusy(true);
    try {
        const response = await sendRuntimeMessage({
            type: 'YTKIT_AI_CREDENTIAL_SET',
            provider,
            credential,
            remember: aiCredentialRemember?.checked === true
        });
        if (!response?.ok) throw new Error(response?.error?.message || t('aiCredentialSaveFailed', 'Credential could not be saved.'));
        aiCredentialInput.value = '';
        aiCredentialRemember.checked = false;
        showStatus(t('aiCredentialSaved', 'AI credential saved without exposing its value.'), 'success', 3200);
        await refreshAiCredentialManager();
    } catch (error) {
        showStatus(error.message || t('aiCredentialSaveFailed', 'Credential could not be saved.'), 'error', 4200);
    } finally {
        setAiCredentialBusy(false);
    }
}

async function deleteAiCredential() {
    const provider = aiCredentialProvider?.value;
    setAiCredentialBusy(true);
    try {
        const response = await sendRuntimeMessage({ type: 'YTKIT_AI_CREDENTIAL_DELETE', provider });
        if (!response?.ok) throw new Error(response?.error?.message || t('aiCredentialDeleteFailed', 'Credential could not be deleted.'));
        aiCredentialInput.value = '';
        aiCredentialRemember.checked = false;
        showStatus(t('aiCredentialDeleted', 'AI credential deleted.'), 'success', 3200);
        await refreshAiCredentialManager();
    } catch (error) {
        showStatus(error.message || t('aiCredentialDeleteFailed', 'Credential could not be deleted.'), 'error', 4200);
    } finally {
        setAiCredentialBusy(false);
    }
}

// Bulk variant for import / reset paths where dozens or hundreds of settings
// change at once. Sending one message per key produces O(N*tabs) IPC traffic
// — the receiver only needs the final aggregate state, so a single
// `YTKIT_SETTINGS_REPLACED` message per tab is both cheaper and more
// consistent (no flicker between partial reload states). Receivers that don't
// understand the bulk message still re-read storage on `ext.storage.onChanged`.
async function broadcastSettingsReplaced(settings) {
    try {
        const tabs = await callExtensionApi(ext?.tabs, 'query', { url: YOUTUBE_TAB_URLS });
        await Promise.all(tabs.map((tab) => browserApi.sendTabMessage(
                tab.id,
                { type: 'YTKIT_SETTINGS_REPLACED', settings },
                { timeoutMs: 2000 }
            )));
    } catch { /* reason: extension suspended — ext.tabs.query rejected */ }
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
    list.setAttribute('aria-busy', 'false');
    syncFilterListUrlInput(settings);
    // The Astra Downloader companion is a github-full-only feature. Hide the
    // "Update Companion" / "Update yt-dlp" actions for store-safe users instead
    // of surfacing buttons that only error ("open a YouTube tab first") against
    // a companion they never installed.
    //
    // ONE predicate: this used to read the raw githubFullProfile flag while
    // refreshCompanionUpdateVisibility() resolved the effective policy profile,
    // and render() runs last in refreshOptionalHostGrantState, so the raw flag
    // could overwrite the policy result. Two copies of the same decision is the
    // exact drift trap this repo keeps paying for.
    refreshCompanionUpdateVisibility();

    const rawTerm = (filter || '').toLowerCase().trim();
    const parsed = parseSearchQuery(rawTerm);
    const hasFilters = Object.keys(parsed.filters).length > 0;
    const freeTerm = parsed.freeText;
    const schemaIdx = (hasFilters) ? getSchemaIndex() : null;
    const policy = ensurePolicyProfile();
    const effectiveProfile = policy
        ? policy.resolveEffectiveProfile(settings || {})
        : 'store-safe';
    const totalCount = QUICK_TOGGLES.length;
    const items = QUICK_TOGGLES.filter((item) => {
        const entry = schemaIdx?.get(item.key)
            || window.__YTKIT_SETTINGS_SCHEMA__?.findSettingEntry?.(item.key)
            || null;
        if (policy && entry && !policy.isEntryAllowedInProfile(entry, effectiveProfile)) return false;
        // v4.47.0: mini-DSL field filters (risk:/category:/scope:/profile:)
        // act as a hard AND gate on top of free-text matching. The
        // metadata lives on the schema entry, not the quick-toggle row.
        if (hasFilters) {
            if (!entryPassesFilters(entry, parsed.filters)) return false;
        }
        if (!freeTerm) return true;
        // Match against both the source English text AND the translated
        // text so a user filtering in either language finds the toggle.
        const tName = t(item.nameKey, item.nameFallback);
        const tDesc = t(item.descKey, item.descFallback);
        const tGroup = t(`qtGroup_${item.group.replace(/\W+/g, '_')}`, item.group);
        return item.nameFallback.toLowerCase().includes(freeTerm)
            || item.descFallback.toLowerCase().includes(freeTerm)
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

        const groupEnabled = groupItems.reduce((count, item) => count + (isQuickToggleOn(settings, item.key) ? 1 : 0), 0);
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
        groupCount.textContent = t('quickGroupCountTpl', '{enabled}/{total}')
            .replace('{enabled}', String(groupEnabled))
            .replace('{total}', String(groupItems.length));

        groupHead.appendChild(groupTitleWrap);
        groupHead.appendChild(groupCount);
        section.appendChild(groupHead);

        for (const item of groupItems) {
            const on = isQuickToggleOn(settings, item.key);
            const tName = t(item.nameKey, item.nameFallback);
            const tDesc = t(item.descKey, item.descFallback);
            const stateLabel = on ? t('toggleStateOn', 'Enabled') : t('toggleStateOff', 'Disabled');
            const permissionState = isOptionalHostGrantMissing(item.key)
                ? ' ' + t('optionalHostPermissionAria', 'Permission needed.') : '';
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'toggle' + (on ? ' on' : '');
            row.dataset.key = item.key;
            row.setAttribute('role', 'switch');
            row.setAttribute('aria-checked', String(on));
            row.setAttribute('aria-label', t('quickToggleAriaTpl', '{name}. {description}. {state}.{permission}')
                .replace('{name}', tName)
                .replace('{description}', tDesc)
                .replace('{state}', stateLabel)
                .replace('{permission}', permissionState));

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
            const permissionBadge = createQuickOptionalHostBadge(item.key);
            if (permissionBadge) nameRow.appendChild(permissionBadge);
            const desc = document.createElement('div');
            desc.className = 'desc';
            desc.textContent = tDesc;
            label.appendChild(nameRow);
            label.appendChild(desc);

            const toggleSwitch = document.createElement('div');
            toggleSwitch.className = 'switch';

            row.appendChild(label);
            row.appendChild(toggleSwitch);
            section.appendChild(row);
        }

        list.appendChild(section);
    }
}

// ── Toggle click delegation ──
// Single listener on #toggles handles all toggle clicks. Replaces
// per-row addEventListener which leaked detached-DOM listeners on
// every render() rebuild.

function installToggleClickDelegation() {
    if (!list) return;
    list.addEventListener('click', async (e) => {
        const row = e.target.closest('.toggle[data-key]');
        if (!row || row.disabled) return;
        const key = row.dataset.key;
        const toggle = QUICK_TOGGLES.find((t) => t.key === key);
        if (!toggle) return;
        const tName = t(toggle.nameKey, toggle.nameFallback);
        row.disabled = true;
        try {
            const next = !isQuickToggleOn(popupState.settings, key);
            await writeSetting(key, next);
            render(popupState.settings, q.value);
            const refocus = document.querySelector(`.toggle[data-key="${CSS.escape(key)}"]`);
            if (refocus) refocus.focus();
            showStatus(t('toggleStatusTpl', '{name} {state}.')
                .replace('{name}', tName)
                .replace('{state}', next ? t('toggleStateOnLower', 'enabled') : t('toggleStateOffLower', 'disabled')), 'success');
        } catch (error) {
            console.warn('[Astra Deck popup] Failed to toggle setting:', error);
            showStatus(formatSettingWriteError(tName, error), 'error', 5200);
        } finally {
            row.disabled = false;
        }
    });
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
    // surface malformed storage payloads so users aren't left
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

// storage corruption detector. ext.storage.local is robust
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
    for (const k of ['hiddenVideos', 'allowedVideos', 'blockedChannels', 'allowedChannels']) {
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
        const allStorage = await callExtensionApi(ext?.storage?.local, 'get', null);
        const summary = summarizeStorage(allStorage);
        statKeys.textContent = formatCount(summary.keys);
        statSize.textContent = summary.sizeText;
        statHidden.textContent = formatCount(summary.hiddenVideos);
        statBlocked.textContent = formatCount(summary.blockedChannels);
        statBookmarks.textContent = formatCount(summary.bookmarks);
        renderHealthBanner(summary.diagnostics);
        // corruption wins over quota — if we detect a malformed
        // payload, that's a more urgent signal than "storage is large."
        if (summary.corruption && summary.corruption.length > 0) {
            renderStorageWarningBanner(0, 0, 0, 0, summary.corruption);
        } else {
            renderStorageWarningBanner(summary.sizeBytes, summary.hiddenVideos, summary.blockedChannels, summary.bookmarks);
        }
    } catch (error) {
        const storageUnavailable = isExtensionStorageUnavailable(error);
        statKeys.textContent = storageUnavailable ? '—' : '0';
        statSize.textContent = storageUnavailable ? '—' : '0 B';
        statHidden.textContent = storageUnavailable ? '—' : '0';
        statBlocked.textContent = storageUnavailable ? '—' : '0';
        statBookmarks.textContent = storageUnavailable ? '—' : '0';
        renderHealthBanner(null);
        if (storageUnavailable) {
            if (storageBanner) {
                storageBanner.hidden = true;
                delete storageBanner.dataset.tier;
            }
            showStatus(getStorageUnavailableMessage(), 'info', 0);
            return;
        }
        // a thrown error from ext.storage.local.get(null) is
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

async function renderSettingsSyncStatus() {
    if (!settingsSyncCard || !settingsSyncStatus) return;
    try {
        const result = await callExtensionApi(ext?.runtime, 'sendMessage', { type: 'YTKIT_SYNC_STATUS' });
        settingsSyncCard.hidden = false;
        if (!result?.ok || result.available === false) {
            settingsSyncStatus.textContent = t(
                'settingsSyncUnavailable',
                'Browser sync is unavailable in this browser.'
            );
            if (settingsSyncUndoButton) settingsSyncUndoButton.hidden = true;
            return;
        }
        settingsSyncStatus.textContent = result.enabled
            ? t('settingsSyncOn', 'On — preferences and blocklists sync through your browser account.')
            : t('settingsSyncOff', 'Off — this device only.');
        if (settingsSyncUndoButton) settingsSyncUndoButton.hidden = result.hasUndo !== true;
    } catch (error) {
        settingsSyncCard.hidden = false;
        settingsSyncStatus.textContent = t(
            'settingsSyncUnavailable',
            'Browser sync is unavailable in this browser.'
        );
        if (settingsSyncUndoButton) settingsSyncUndoButton.hidden = true;
        void error;
    }
}

async function undoSettingsSync() {
    if (!settingsSyncUndoButton) return;
    settingsSyncUndoButton.disabled = true;
    settingsSyncUndoButton.setAttribute('aria-busy', 'true');
    try {
        const result = await callExtensionApi(ext?.runtime, 'sendMessage', { type: 'YTKIT_SYNC_UNDO' });
        if (!result?.ok) {
            throw new Error(result?.error?.message || t(
                'settingsSyncUndoFailed',
                'Could not undo the last browser sync.'
            ));
        }
        const settings = await loadSettings();
        render(settings, q.value);
        renderDataFlowPanel();
        renderSchemaOverview();
        await renderSettingsSyncStatus();
        await renderStorageInfo();
        showStatus(t('settingsSyncUndoDone', 'Last browser sync undone locally.'), 'success', 3600);
    } catch (error) {
        showStatus(t('settingsSyncUndoFailed', 'Could not undo the last browser sync.') + ' ' + error.message, 'error', 4600);
        await renderSettingsSyncStatus();
    } finally {
        settingsSyncUndoButton.removeAttribute('aria-busy');
        settingsSyncUndoButton.disabled = false;
    }
}

// storage-size warning banner. Surfaces a polite nudge when
// total ext.storage.local payload crosses the soft threshold, and a
// firmer wording at the hard threshold. The Reset button shares the
// existing destructive-confirm dialog so accidental clicks are still
// guarded.
function renderStorageWarningBanner(sizeBytes, hiddenVideos, blockedChannels, bookmarks, corruption) {
    if (!storageBanner || !storageBannerDetail) return;

    // corruption tier supersedes quota tier. Show first to
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
        // Record to DiagnosticLog ring (per ROADMAP plan: storage-
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
        // The extension declares unlimitedStorage, so there is no ceiling to
        // head toward, and steering at Reset offered a full wipe as the answer
        // to a size report. Name the size and point at trimming instead.
        ? t('storageBannerHardTpl', `Astra Deck is storing ${sizeText}. Trimming the largest lists below keeps it fast.`)
        : t('storageBannerSoftTpl', `Astra Deck is storing ${sizeText} of data on this device.`);
    storageBannerDetail.textContent = baseTpl.replace('{size}', sizeText) + contributors;
    storageBanner.hidden = false;
}

// best-effort persistence into the existing _errors ring so
// future factory runs (per ROADMAP) can promote N4 follow-ups when
// the field detects corruption events. We do NOT show or save corruption
// findings during the storage-read-failed path (no settings to write to).
// selector-health dashboard. Queries the active YouTube tab
// for the per-surface health snapshot + DiagnosticLog ctx counts, then
// renders a compact list of top-K problematic surfaces. Bounded payload
// (top 12 surfaces per the message handler in ytkit.js); we render up to
// 6 here to keep the popup compact. Hides the section gracefully when
// no YT tab is active OR the content script doesn't respond.
async function renderSelectorHealthDashboard() {
    if (!selectorHealthSection || !selectorHealthList) return;
    try {
        const [tab] = await callExtensionApi(ext?.tabs, 'query', { active: true, lastFocusedWindow: true });
        if (!tab || !tab.id || !isSupportedInlinePanelUrl(tab.url || '')) {
            selectorHealthSection.hidden = true;
            return;
        }
        const response = await browserApi.sendTabMessage(
            tab.id,
            { type: 'YTKIT_GET_SELECTOR_HEALTH' },
            { timeoutMs: 1500 }
        );
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
        if (selectorHealthAsset) {
            const asset = response.selectorAsset || {};
            const assetLabel = t('selectorHealthAssetTpl', 'Rules: {status} · {version} · {source}')
                .replace('{status}', String(asset.status || 'unknown'))
                .replace('{version}', String(asset.assetVersion || 'unknown'))
                .replace('{source}', String(asset.source || 'unknown'));
            selectorHealthAsset.textContent = asset.lastError
                ? `${assetLabel} — ${String(asset.lastError).slice(0, 120)}`
                : assetLabel;
            selectorHealthAsset.dataset.state = asset.status || 'unknown';
        }
        // Per-ctx diagnostic chip strip.
        if (selectorHealthCtx) {
            selectorHealthCtx.textContent = '';
            const counts = response.ctxCounts && typeof response.ctxCounts === 'object' ? response.ctxCounts : {};
            const ordered = Object.entries(counts)
                .filter(([, v]) => Number(v) > 0)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);
            const degradedMutationRules = Array.isArray(response.mutationRules)
                ? response.mutationRules.filter(rule => rule?.circuitOpen).slice(0, 5)
                : [];
            if (ordered.length === 0 && degradedMutationRules.length === 0) {
                selectorHealthCtx.hidden = true;
            } else {
                selectorHealthCtx.hidden = false;
                for (const [ctx, count] of ordered) {
                    const chip = document.createElement('span');
                    chip.className = 'sh-ctx-chip';
                    chip.textContent = t('selectorHealthCtxCountTpl', '{ctx}: {count}')
                        .replace('{ctx}', ctx)
                        .replace('{count}', String(count));
                    selectorHealthCtx.appendChild(chip);
                }
                for (const rule of degradedMutationRules) {
                    const chip = document.createElement('span');
                    chip.className = 'sh-ctx-chip sh-errors';
                    chip.textContent = String(rule.featureId || 'unknown');
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

let _selectorHealthRefreshInFlight = false;
async function refreshSelectorAssetFromPopup() {
    if (_selectorHealthRefreshInFlight || !selectorHealthRefreshBtn) return;
    _selectorHealthRefreshInFlight = true;
    selectorHealthRefreshBtn.disabled = true;
    if (selectorHealthAsset) selectorHealthAsset.textContent = t('selectorHealthRefreshPending', 'Refreshing selector rules…');
    const refreshFailedLabel = t('selectorHealthRefreshFailed', 'Selector rules were not refreshed.');
    try {
        const [tab] = await callExtensionApi(ext?.tabs, 'query', { active: true, lastFocusedWindow: true });
        if (!tab?.id || !isSupportedInlinePanelUrl(tab.url || '')) {
            if (selectorHealthAsset) selectorHealthAsset.textContent = t('selectorHealthCopyNeedYt', 'Open a YouTube tab to build the report.');
            return;
        }
        const response = await browserApi.sendTabMessage(
            tab.id,
            { type: 'YTKIT_REFRESH_SELECTOR_ASSET' },
            { timeoutMs: 15000 }
        );
        if (!response?.ok) {
            if (selectorHealthAsset) selectorHealthAsset.textContent = [refreshFailedLabel, String(response?.error || '').slice(0, 120)].filter(Boolean).join(' ');
            return;
        }
        await renderSelectorHealthDashboard();
    } catch (error) {
        if (selectorHealthAsset) selectorHealthAsset.textContent = [refreshFailedLabel, String(error?.message || error).slice(0, 120)].filter(Boolean).join(' ');
    } finally {
        _selectorHealthRefreshInFlight = false;
        selectorHealthRefreshBtn.disabled = false;
    }
}

if (selectorHealthRefreshBtn) {
    selectorHealthRefreshBtn.addEventListener('click', () => { void refreshSelectorAssetFromPopup(); });
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
        const [tab] = await callExtensionApi(ext?.tabs, 'query', { active: true, lastFocusedWindow: true });
        if (!tab || !tab.id || !isSupportedInlinePanelUrl(tab.url || '')) {
            setStatus(t('selectorHealthCopyNeedYt', 'Open a YouTube tab to build the report.'));
            return;
        }
        // Same message shape as renderSelectorHealthDashboard — the
        // content-script handler returns `surfaces` (already sorted by
        // trouble-score, top 12) + `totalSurfaces` + `ctxCounts`. The
        // formatter only needs the surfaces array.
        const response = await browserApi.sendTabMessage(
            tab.id,
            { type: 'YTKIT_GET_SELECTOR_HEALTH' },
            { timeoutMs: 1500 }
        );
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
                mutationRules: response.mutationRules,
                selectorAsset: response.selectorAsset,
                topN: 10
            });
            // Prepend the active tab URL + the per-ctx counts the formatter
            // doesn't otherwise include. The popup ctx-counts strip already
            // surfaces them, but a bug report should carry them inline.
            let safeTabUrl = 'unknown';
            try { const u = new URL(tab.url || ''); safeTabUrl = u.origin + u.pathname; } catch (_) { /* reason: unparseable URL */ }
            const tabLine = 'activeTab: ' + safeTabUrl;
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
            let safeTabUrlFallback = 'unknown';
            try { const u = new URL(tab.url || ''); safeTabUrlFallback = u.origin + u.pathname; } catch (_) { /* reason: unparseable URL */ }
            payload = JSON.stringify({
                productVersion: getVersion(),
                exportedAt: new Date().toISOString(),
                activeTab: safeTabUrlFallback,
                surfaces: response.surfaces,
                ctxCounts: response.ctxCounts || {},
                selectorAsset: response.selectorAsset || null
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
                setStatus(t('selectorHealthCopySaveFallback', 'Couldn’t copy to the clipboard. Try again, or use the Diagnostics Save button to download the report instead.'));
            }
        }
    } catch (_) {
        // reason: any unexpected failure must not break the popup
        setStatus(t('selectorHealthCopySaveFallback', 'Couldn’t copy to the clipboard. Try again, or use the Diagnostics Save button to download the report instead.'));
    } finally {
        _selectorHealthCopyInFlight = false;
        if (selectorHealthCopyBtn) selectorHealthCopyBtn.disabled = false;
    }
}

if (selectorHealthCopyBtn) {
    selectorHealthCopyBtn.addEventListener('click', () => { void copySelectorHealthReport(); });
}

function formatExternalHealthAge(ts) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return 'never';
    const seconds = Math.max(0, Math.round((Date.now() - n) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
}

function externalHealthTone(state) {
    if (state === 'ok') return 'ok';
    if (state === 'degraded') return 'degraded';
    if (state === 'rate-limited') return 'rate-limited';
    if (state === 'error') return 'error';
    return 'unknown';
}

function formatExternalHealthBudget(budget) {
    if (!budget || typeof budget !== 'object') return '';
    const used = Number.isFinite(Number(budget.used)) ? Number(budget.used) : null;
    const limit = Number.isFinite(Number(budget.limit)) ? Number(budget.limit) : null;
    if (used === null || limit === null) return '';
    const resetMs = Number(budget.resetMs);
    const reset = Number.isFinite(resetMs) && resetMs > 0
        ? `, reset ${Math.ceil(resetMs / 1000)}s`
        : '';
    return `budget ${used}/${limit}${reset}`;
}

function formatExternalHealthDetail(service) {
    const parts = [];
    if (service.lastSuccessTs) parts.push(`success ${formatExternalHealthAge(service.lastSuccessTs)}`);
    if (service.lastSuccessSource) parts.push(t('externalHealthSourceTpl', 'source {source}')
        .replace('{source}', String(service.lastSuccessSource)));
    if (service.lastRefreshAgeMs !== null && service.lastRefreshAgeMs !== undefined) {
        parts.push(t('externalHealthRefreshTpl', 'refreshed {age} ago')
            .replace('{age}', formatExternalHealthAge(service.lastRefreshTs).replace(/\s+ago$/, '')));
    }
    if (service.availability && service.availability !== 'unknown') {
        parts.push(t('externalHealthAvailabilityTpl', 'availability {state}')
            .replace('{state}', String(service.availability)));
    }
    if (service.lastHost) parts.push(`host ${service.lastHost}`);
    if (service.lastErrorClass) parts.push(`last error ${service.lastErrorClass}`);
    if (service.cacheState && service.cacheState !== 'unknown') parts.push(`cache ${service.cacheState}`);
    if (service.fallbackState) parts.push(`fallback ${service.fallbackState}`);
    const budget = formatExternalHealthBudget(service.requestBudget);
    if (budget) parts.push(budget);
    if (service.lastErrorMessage) parts.push(String(service.lastErrorMessage).slice(0, 90));
    return parts.join(' | ') || t('externalHealthDetailEmpty', 'No requests observed in this tab yet.');
}

async function requestExternalApiHealthSnapshot(timeoutMs = 1500) {
    const [tab] = await callExtensionApi(ext?.tabs, 'query', { active: true, lastFocusedWindow: true });
    if (!tab || !tab.id || !isSupportedInlinePanelUrl(tab.url || '')) return null;
    const response = await browserApi.sendTabMessage(
        tab.id,
        { type: 'YTKIT_GET_EXTERNAL_API_HEALTH' },
        { timeoutMs }
    );
    if (!response || response.ok === false || !Array.isArray(response.services)) return null;
    return { tab, services: response.services, totalServices: response.totalServices || response.services.length };
}

function renderExternalHealthRows(services) {
    if (!externalHealthList) return;
    externalHealthList.textContent = '';
    if (!services.length) {
        const empty = document.createElement('li');
        empty.className = 'external-health-empty';
        empty.textContent = t('externalHealthEmpty', 'No external API services tracked yet.');
        externalHealthList.appendChild(empty);
        return;
    }
    for (const service of services) {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.className = 'external-health-name';
        name.textContent = service.label || service.id;
        const state = document.createElement('span');
        state.className = 'external-health-state';
        const tone = externalHealthTone(service.state);
        state.dataset.tone = tone;
        state.textContent = service.state || 'unknown';
        const detail = document.createElement('span');
        detail.className = 'external-health-detail';
        detail.textContent = formatExternalHealthDetail(service);
        li.title = [service.privacy, service.localFallback].filter(Boolean).join(' · ');
        li.appendChild(name);
        li.appendChild(state);
        li.appendChild(detail);
        externalHealthList.appendChild(li);
    }
}

async function renderExternalApiHealthDashboard() {
    if (!externalHealthSection || !externalHealthList) return;
    try {
        const snapshot = await requestExternalApiHealthSnapshot();
        if (!snapshot) {
            externalHealthSection.hidden = true;
            return;
        }
        renderExternalHealthRows(snapshot.services);
        if (externalHealthTotal) {
            externalHealthTotal.textContent = t('externalHealthTotalTpl', '{count} services')
                .replace('{count}', String(snapshot.totalServices));
        }
        externalHealthSection.hidden = false;
    } catch (_) {
        externalHealthSection.hidden = true;
    }
}

function formatExternalApiHealthReport(services, meta = {}) {
    const lines = [
        'Astra Deck external API health report',
        `exportedAt: ${meta.exportedAt || new Date().toISOString()}`,
        `extensionVersion: ${meta.extensionVersion || getVersion()}`,
        `activeTab: ${meta.activeTab || 'unknown'}`,
        ''
    ];
    for (const service of services || []) {
        lines.push(`${service.label || service.id}: ${service.state || 'unknown'}`);
        lines.push(`  origin: ${service.origin || 'unknown'}`);
        lines.push(`  host: ${service.lastHost || 'unknown'}`);
        lines.push(`  lastSuccess: ${formatExternalHealthAge(service.lastSuccessTs)}`);
        lines.push(`  source: ${service.lastSuccessSource || 'unknown'}`);
        lines.push(`  refreshAgeMs: ${service.lastRefreshAgeMs ?? 'unknown'}`);
        lines.push(`  availability: ${service.availability || 'unknown'}`);
        lines.push(`  privacy: ${service.privacy || 'unknown'}`);
        lines.push(`  localFallback: ${service.localFallback || 'unknown'}`);
        lines.push(`  lastError: ${service.lastErrorClass || 'none'}`);
        if (service.lastErrorMessage) lines.push(`  message: ${service.lastErrorMessage}`);
        lines.push(`  cache: ${service.cacheState || 'unknown'}`);
        lines.push(`  fallback: ${service.fallbackState || 'none'}`);
        const budget = formatExternalHealthBudget(service.requestBudget);
        if (budget) lines.push(`  ${budget}`);
    }
    return lines.join('\n');
}

let _externalHealthCopyInFlight = false;
async function copyExternalApiHealthReport() {
    if (_externalHealthCopyInFlight || !externalHealthCopyBtn) return;
    const setStatus = (msg) => { if (externalHealthCopyStatus) externalHealthCopyStatus.textContent = msg; };
    _externalHealthCopyInFlight = true;
    externalHealthCopyBtn.disabled = true;
    setStatus(t('externalHealthCopyPending', 'Building report…'));
    try {
        const snapshot = await requestExternalApiHealthSnapshot();
        if (!snapshot) {
            setStatus(t('externalHealthCopyNeedYt', 'Open a YouTube tab to build the report.'));
            return;
        }
        let safeTabUrl = 'unknown';
        try { const u = new URL(snapshot.tab.url || ''); safeTabUrl = u.origin + u.pathname; } catch (_) { /* reason: unparseable URL */ }
        const payload = formatExternalApiHealthReport(snapshot.services, {
            exportedAt: new Date().toISOString(),
            extensionVersion: getVersion(),
            activeTab: safeTabUrl
        });
        try {
            await navigator.clipboard.writeText(payload);
            setStatus(t('externalHealthCopyDone', 'Copied.'));
        } catch (_) {
            const ta = document.createElement('textarea');
            ta.value = payload;
            ta.setAttribute('readonly', '');
            ta.style.position = 'absolute';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
            ta.remove();
            setStatus(ok
                ? t('externalHealthCopyDone', 'Copied.')
                : t('externalHealthCopyFail', 'Could not copy.'));
        }
    } catch (_) {
        setStatus(t('externalHealthCopyFail', 'Could not copy.'));
    } finally {
        _externalHealthCopyInFlight = false;
        if (externalHealthCopyBtn) externalHealthCopyBtn.disabled = false;
    }
}

if (externalHealthCopyBtn) {
    externalHealthCopyBtn.addEventListener('click', () => { void copyExternalApiHealthReport(); });
}

// Feature performance dashboard. Queries the active YouTube tab for
// per-feature init timing via YTKIT_GET_FEATURE_PERF, then renders the
// slowest features with a visual bar. Threshold: features > 50ms are
// flagged. The section is hidden when no YT tab is active or the
// content script doesn't respond.
const featurePerfSection = $('#feature-perf');
const featurePerfList = $('#feature-perf-list');
const featurePerfTotal = $('#feature-perf-total');

async function renderFeaturePerfDashboard() {
    if (!featurePerfSection || !featurePerfList) return;
    try {
        const [tab] = await callExtensionApi(ext?.tabs, 'query', { active: true, lastFocusedWindow: true });
        if (!tab || !tab.id || !isSupportedInlinePanelUrl(tab.url || '')) {
            featurePerfSection.hidden = true;
            return;
        }
        const response = await browserApi.sendTabMessage(
            tab.id,
            { type: 'YTKIT_GET_FEATURE_PERF' },
            { timeoutMs: 1500 }
        );
        if (!response || response.ok === false || !Array.isArray(response.features)) {
            featurePerfSection.hidden = true;
            return;
        }
        const top = response.features.slice(0, 10);
        featurePerfList.textContent = '';
        if (top.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'feature-perf-empty';
            empty.textContent = t('featurePerfEmpty', 'No features initialized yet.');
            featurePerfList.appendChild(empty);
        } else {
            const maxMs = top[0].initMs || 1;
            for (const feat of top) {
                const li = document.createElement('li');
                li.className = 'feature-perf-row';
                if (feat.initMs > 50) li.classList.add('feature-perf-slow');
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
                featurePerfList.appendChild(li);
            }
        }
        if (featurePerfTotal) {
            featurePerfTotal.textContent = t('featurePerfTotalTpl', '{count} features measured')
                .replace('{count}', String(response.totalFeatures));
        }
        featurePerfSection.hidden = false;
    } catch (_) {
        featurePerfSection.hidden = true;
    }
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
    try { manifest = ext.runtime.getManifest(); } catch (_) { /* reason: unavailable in some contexts */ }
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
        const grantLabel = dataFlowOptionalGrantLabel(entry);
        if (grantLabel) appendDataFlowMeta(meta, t('dataFlowGrant', 'grant'), grantLabel);
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
    const policy = ensurePolicyProfile();
    const effectiveProfile = policy
        ? policy.resolveEffectiveProfile(settings || {})
        : 'store-safe';
    let nonInternalTotal = 0;
    let nonInternalEnabled = 0;
    for (const entry of scope.SETTINGS_SCHEMA) {
        if (entry.internal) continue;
        if (policy && !policy.isEntryAllowedInProfile(entry, effectiveProfile)) continue;
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
            // renderSchemaOverview() rebuilds the list, destroying the
            // focused disclosure button and dropping keyboard focus to
            // <body>. Refocus the rebuilt equivalent by data-category —
            // same pattern as the quick-toggle click delegation.
            refocusSchemaOverviewCategory(cat);
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
                .filter((entry) => entry.category === cat
                    && !entry.internal
                    && (!policy || policy.isEntryAllowedInProfile(entry, effectiveProfile))
                    && matchEntry(entry));
            for (const entry of entriesInCat) {
                subList.appendChild(buildSchemaOverviewKeyRow(entry, settings));
            }
            li.appendChild(subList);
        }

        schemaOverviewList.appendChild(li);
    }
}

// Keyboard-focus restoration after a renderSchemaOverview() rebuild.
// The overview re-renders wholesale on expand/collapse, per-key toggle,
// and per-key reset — destroying the focused element and silently
// dropping keyboard focus to <body>. Mirror the quick-toggle click
// delegation, which refocuses the rebuilt control by data-key.
function refocusSchemaOverviewCategory(cat) {
    if (!schemaOverviewList || typeof cat !== 'string') return;
    const head = schemaOverviewList.querySelector(
        `.so-row-head[data-category="${CSS.escape(cat)}"]`);
    if (head) head.focus();
}

function refocusSchemaOverviewKey(entry) {
    if (!schemaOverviewList || !entry?.key) return;
    const esc = CSS.escape(entry.key);
    // Prefer the row's interactive control (switch / inline editor —
    // they all carry data-key). A per-key reset removes its own button
    // on success, so fall back to the row's control, then the category
    // disclosure so focus never lands on <body>.
    const control = schemaOverviewList.querySelector(
        `.so-key-row[data-key="${esc}"] button[data-key="${esc}"], `
        + `.so-key-row[data-key="${esc}"] input[data-key="${esc}"], `
        + `.so-key-row[data-key="${esc}"] .so-key-reset-btn`);
    if (control) { control.focus(); return; }
    refocusSchemaOverviewCategory(entry.category);
}

// v4.24.0: per-key row inside an expanded category. Booleans become a
// real switch button (read + write through ext.storage.local).
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
            // i18n-static: build-profile identifier, matches manifest naming
            badge.textContent = 'github-full';
            badge.title = t('schemaBadgeGithubFullTitle',
                'This setting only applies when GitHub-Full Profile is enabled.');
            row.appendChild(badge);
        }
    }

    // v4.47.0 NF10 follow-up: capability-probe chip. Schema entries
    // with a `requires:` array declare runtime browser capabilities
    // (e.g. ['summarizerApi'] for subscriptionAiTags, ['mediaDL'] for the
    // download* family, ['ollama'] for the local-LLM provider). If
    // the capability map is populated and the entry's required set
    // is not satisfied, render an "Unavailable" chip with the missing
    // capability names in the tooltip so users understand the no-op.
    // The chip uses the same compact pill geometry as the profile
    // badge above; styling lives in popup.css under .so-key-unavailable.
    if (Array.isArray(entry.requires) && entry.requires.length > 0) {
        const probe = window.YTKitCore && window.YTKitCore.capabilityProbe;
        const caps = popupState._capabilities;
        // Skip the chip while the probe is still resolving (caps === null)
        // so we don't flash "Unavailable" on every row at boot. Once
        // ensureCapabilityMap() resolves and renderSchemaOverview()
        // re-runs, the chip surfaces on the entries that actually
        // lack a required capability.
        if (caps && probe && typeof probe.isEntryAvailable === 'function'
            && !probe.isEntryAvailable(entry, caps)) {
            const missing = entry.requires.filter((cap) => caps[cap] !== true);
            const chip = document.createElement('span');
            chip.className = 'so-key-profile-badge so-key-unavailable';
            chip.textContent = t('schemaBadgeUnavailable', 'unavailable');
            chip.title = t('schemaBadgeUnavailableTitleTpl',
                'This setting requires a capability not available in this browser: {capabilities}. '
                + 'Toggling the setting has no effect until the capability becomes available.')
                .replace('{capabilities}', missing.join(', '));
            row.appendChild(chip);
        }
    }

    // v4.47.0: inline trust signal on credential-bearing rows. The
    // privacy data-flow panel (v4.12.0) already explains the "stored
    // locally only" guarantee, but that panel is off by default — a
    // user pasting an API key into the schema-overview editor has no
    // visible reassurance about where the key lives. A small green
    // "local only" chip on the row makes the trust boundary visible
    // at the pasting moment, not buried in an opt-in panel. Tooltip
    // expands: bug-report bundles redact the value via NEW-1's
    // BUG_REPORT_REDACTED_KEYS list, and ext.storage.local is
    // origin-scoped (never synced to a Google account).
    if (TRUST_SIGNAL_LOCAL_ONLY_KEYS.has(entry.key)) {
        const trustChip = document.createElement('span');
        trustChip.className = 'so-key-profile-badge so-key-trust-local';
        trustChip.textContent = t('schemaBadgeLocalOnly', 'local only');
        trustChip.title = t('schemaBadgeLocalOnlyTitle',
            'This value is stored in extension storage on this device. '
            + 'It is never synced to a Google account, never sent to Astra Deck servers, '
            + 'and is redacted from the bug-report bundle (Diagnostics → Save).');
        row.appendChild(trustChip);
    }

    const optionalHostChip = createSchemaOptionalHostBadge(entry.key);
    if (optionalHostChip) row.appendChild(optionalHostChip);

    if (entry.type === 'boolean') {
        // Resolve through the schema default: an untouched default-on feature
        // is on, and rendering it as off contradicted the quick toggles that
        // sit a few pixels away in the same popup.
        const on = resolveEffectiveSettingValue(entry, settings) === true;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'so-key-switch' + (on ? ' on' : '');
        btn.setAttribute('role', 'switch');
        btn.setAttribute('aria-checked', String(on));
        // Accessible name must CONTAIN the visible label, or voice control
        // cannot target the row: the switch used to announce the raw storage
        // key while the row reads a humanised label.
        btn.setAttribute('aria-label', label.textContent + ' (' + (on ? 'on' : 'off') + ')');
        btn.dataset.key = entry.key;
        btn.addEventListener('click', async () => {
            // Settings persist sparsely, so an untouched default-on key is
            // absent from the bag. Deriving `next` from the raw bag made the
            // first click on such a row rewrite the value it already had: the
            // row rendered on, stayed on, and only the second click did
            // anything. Resolve through the schema, exactly as the row renders.
            const next = resolveEffectiveSettingValue(entry, popupState.settings) !== true;
            btn.disabled = true;
            try {
                await writeSetting(entry.key, next);
                // Re-render the overview to refresh the count + this row,
                // then restore keyboard focus to the rebuilt switch.
                renderSchemaOverview();
                refocusSchemaOverviewKey(entry);
            } catch (err) {
                console.warn('[Astra Deck popup] schema-overview toggle failed:', err);
                showStatus(formatSettingWriteError(entry.key, err), 'error', 5200);
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
        const current = resolveEffectiveSettingValue(entry, settings);
        if (current !== undefined && current !== null) input.value = String(current);
        // Persist on every change/blur. We deliberately don't debounce
        // — typing in a number field implies a deliberate edit, and
        // writeSetting's chained Promise already serialises rapid
        // edits so race conditions are bounded.
        const persist = async () => {
            const raw = input.value.trim();
            if (raw === '') return;     // empty input leaves the prior value untouched
            let next = Number(raw);
            if (!Number.isFinite(next)) return;
            // Route through the same clamp/enum coercion the import path
            // applies (policy-profile clampSettingValue) so an inline edit
            // can't persist an out-of-range value that a backup
            // round-trip would clamp. Reflect the clamped value back
            // into the input so the user sees what was saved.
            const policy = ensurePolicyProfile();
            if (policy && typeof policy.clampSettingValue === 'function') {
                next = policy.clampSettingValue(next, entry);
                if (String(next) !== raw) input.value = String(next);
            }
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
            const current = resolveEffectiveSettingValue(entry, settings);
            if (typeof current === 'string') input.value = current;
        }
        const persist = async () => {
            let raw = (input.value || '').toString();
            // For the colour picker an empty value never happens; for
            // the text input we let empty strings persist so a user
            // can intentionally clear a string-shaped setting.
            // Same clamp/enum coercion as the import path: an enum-typed
            // string entry edited to an unrecognized value coerces back
            // to the schema default instead of persisting raw. Reflect
            // the coerced value so the input shows what was saved.
            const policy = ensurePolicyProfile();
            if (policy && typeof policy.clampSettingValue === 'function') {
                const coerced = policy.clampSettingValue(raw, entry);
                if (typeof coerced === 'string' && coerced !== raw) {
                    raw = coerced;
                    input.value = coerced;
                }
            }
            // Compare against the EFFECTIVE value: a sparse key reads back as
            // undefined, which never equals the field's text, so a focus and
            // blur with no edit used to persist '' over a non-empty default.
            if (resolveEffectiveSettingValue(entry, popupState.settings) === raw) return;
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
    } else if (entry.type === 'array' && Array.isArray(entry.knownValues) && entry.knownValues.length > 0) {
        // v4.47.0 NF7: checkbox-grid editor for array-typed entries
        // that carry a `knownValues` enumeration on the schema. Replaces
        // the raw JSON textarea for the four hidden* entries
        // (hiddenChatElements, hiddenActionButtons, hiddenPlayerControls,
        // hiddenWatchElements) so users don't have to hand-edit JSON to
        // toggle individual items. Each token becomes a checkbox; checking
        // adds the token to the array, unchecking removes it. Order
        // matches knownValues so the storage payload stays deterministic
        // for export-import round-trips.
        const grid = document.createElement('div');
        grid.className = 'so-key-checks';
        grid.setAttribute('role', 'group');
        grid.setAttribute('aria-label', entry.key);
        const effective = resolveEffectiveSettingValue(entry, settings);
        const seed = Array.isArray(effective) ? effective : [];
        const seedSet = new Set(seed);
        const known = entry.knownValues;
        const inputs = [];
        for (const token of known) {
            const label = document.createElement('label');
            label.className = 'so-key-check';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = token;
            cb.checked = seedSet.has(token);
            cb.dataset.key = entry.key;
            inputs.push(cb);
            const text = document.createElement('span');
            text.textContent = token;
            label.appendChild(cb);
            label.appendChild(text);
            grid.appendChild(label);
        }
        const persist = async () => {
            // Rebuild the array in known-values order from the checked
            // boxes; preserve any unknown tokens (legacy / import) at the
            // tail so a user who has a saved value with deprecated tokens
            // doesn't lose them when toggling a checkbox.
            const checked = new Set(inputs.filter((i) => i.checked).map((i) => i.value));
            const knownSet = new Set(known);
            const preserved = seed.filter((t) => !knownSet.has(t));
            const next = known.filter((t) => checked.has(t)).concat(preserved);
            for (const cb of inputs) cb.disabled = true;
            try {
                await writeSetting(entry.key, next);
                renderSchemaOverview();
            } catch (err) {
                console.warn('[Astra Deck popup] schema-overview checkbox persist failed:', err);
            } finally {
                for (const cb of inputs) cb.disabled = false;
            }
        };
        for (const cb of inputs) cb.addEventListener('change', persist);
        row.appendChild(grid);
    } else if (entry.type === 'array' || entry.type === 'object') {
        // v4.41.0: array / object JSON editor. The schema overview
        // can now edit every type — closes the editor coverage from
        // ~340 to all schema keys. The editor renders the current
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
        const seed = resolveEffectiveSettingValue(entry, settings);
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
        // Announce parse failures: the pill was visual-only, so a screen-reader
        // user got no feedback that their edit had been rejected.
        errorPill.id = 'so-json-error-' + entry.key;
        errorPill.setAttribute('role', 'alert');
        textarea.setAttribute('aria-describedby', errorPill.id);
        const persist = async () => {
            const raw = textarea.value;
            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch (err) {
                errorPill.textContent = t('schemaJsonInvalidTpl', 'Invalid JSON: {error}')
                    .replace('{error}', String(err && err.message || err));
                errorPill.hidden = false;
                return;
            }
            // Reject type mismatches up-front so a user who pastes
            // `{}` into an array-typed entry sees a clear error
            // instead of silently corrupting the storage shape.
            if (entry.type === 'array' && !Array.isArray(parsed)) {
                errorPill.textContent = t('schemaJsonExpectedArray', 'Expected an array');
                errorPill.hidden = false;
                return;
            }
            if (entry.type === 'object' && (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object')) {
                errorPill.textContent = t('schemaJsonExpectedObject', 'Expected an object');
                errorPill.hidden = false;
                return;
            }
            errorPill.hidden = true;
            errorPill.textContent = '';
            // Skip the write when the value is unchanged. `change` and `blur`
            // both fire persist, so editing then blurring would otherwise issue
            // two identical writeSetting calls (double storage write + tab
            // broadcast + re-render flicker). Mirrors the number editor's guard.
            let unchanged = false;
            try {
                unchanged = JSON.stringify(resolveEffectiveSettingValue(entry, popupState.settings))
                    === JSON.stringify(parsed);
            } catch { unchanged = false; }
            if (unchanged) return;
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
        badge.title = t('schemaBadgeNoEditorTpl', '{type} (no inline editor)')
            .replace('{type}', entry.type);
        row.appendChild(badge);
    }

    // v4.47.0 NEW-6: per-key Reset affordance. A user who has changed
    // one setting to a non-default value (e.g. pasted breaking CSS
    // into customCssCode, or set vvfBrightness to 0 making the page
    // invisible) currently has to either remember the default or hit
    // global Reset (which nukes everything). Per-key reset is a
    // one-click recovery scoped to this row.
    //
    // Only rendered when (a) the schema declares a defaultValue and
    // (b) the current value differs from it. Internal entries
    // (`_activeProfile`, `_settingsVersion`, etc.) get the affordance
    // too — they're already filtered out of the schema overview by
    // the rendering layer.
    if (Object.prototype.hasOwnProperty.call(entry, 'defaultValue')) {
        const currentValue = settings[entry.key];
        if (!isDefaultValue(currentValue, entry.defaultValue)) {
            const resetBtn = document.createElement('button');
            resetBtn.type = 'button';
            resetBtn.className = 'so-key-reset-btn';
            resetBtn.textContent = '↺';
            resetBtn.title = t('schemaResetTitleTpl', 'Reset {key} to default ({value})')
                .replace('{key}', entry.key)
                .replace('{value}', describeDefaultForTooltip(entry.defaultValue));
            resetBtn.setAttribute('aria-label',
                t('schemaResetAriaTpl', 'Reset {key} to default value')
                    .replace('{key}', entry.key));
            resetBtn.addEventListener('click', async () => {
                resetBtn.disabled = true;
                try {
                    await writeSetting(entry.key, entry.defaultValue);
                    // Tpl + token: the catalogue wins over this fallback in the
                    // extension, and the old tokenless message meant every
                    // reset toasted the same context-free "… reset to default."
                    showStatus(t('statusPerKeyResetTpl', '{key} reset to default.')
                        .replace('{key}', entry.key), 'ok', 2400);
                    renderSchemaOverview();
                    // The rebuild removed this reset button (value is back
                    // at default) — refocus the row's remaining control so
                    // keyboard focus doesn't fall to <body>.
                    refocusSchemaOverviewKey(entry);
                } catch (err) {
                    showStatus(t('statusPerKeyResetFail',
                        'Could not reset') + ': ' + err.message, 'error', 3600);
                } finally {
                    resetBtn.disabled = false;
                }
            });
            row.appendChild(resetBtn);
        }
    }

    return row;
}

// v4.47.0 NEW-6: deep-equality check for the per-key reset gate.
// Booleans / numbers / strings compare with ===. Arrays + objects
// fall through to a JSON-string comparison — slow but correct for
// the small payloads the schema overview deals with (the heaviest
// is `hiddenChatElements` at ~10 short strings). Null / undefined
// are treated as equivalent so a never-set storage slot doesn't
// surface a reset button against the schema default.
// A schema entry's effective value: what the feature actually behaves as,
// which is the stored value when present and the schema default otherwise.
function resolveEffectiveSettingValue(entry, settings) {
    const raw = settings ? settings[entry.key] : undefined;
    if (raw !== undefined) return raw;
    return Object.prototype.hasOwnProperty.call(entry, 'defaultValue') ? entry.defaultValue : undefined;
}

function isDefaultValue(currentValue, defaultValue) {
    if (currentValue === defaultValue) return true;
    // A key that was never written IS at its default — the comment above the
    // reset affordance always claimed this, but it only held for null
    // defaults, so every untouched key with a `false`/`0`/`''` default grew a
    // spurious "reset to default" button.
    if (currentValue === undefined) return true;
    if ((currentValue == null) && (defaultValue == null)) return true;
    if (currentValue == null || defaultValue == null) return false;
    if (typeof currentValue !== typeof defaultValue) return false;
    if (typeof currentValue === 'object') {
        try {
            return JSON.stringify(currentValue) === JSON.stringify(defaultValue);
        } catch (_) { /* reason: cyclic refs are not expected in settings */ return false; }
    }
    return false;
}

// v4.47.0 NEW-6: short pretty-print of the default value for the
// reset button's tooltip. Truncates anything over 48 chars so the
// tooltip stays readable.
function describeDefaultForTooltip(value) {
    if (value === null) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') {
        if (value.length === 0) return '(empty)';
        return value.length > 48 ? `"${value.slice(0, 45)}…"` : `"${value}"`;
    }
    try {
        const json = JSON.stringify(value);
        return json.length > 48 ? json.slice(0, 45) + '…' : json;
    } catch (_) { /* reason: cyclic refs are not expected in settings */ return '<value>'; }
}

// Decide whether a schema entry counts as "enabled" in the popup
// roll-up. Mirrors the heuristic used by the data-flow panel's
// isFeatureCurrentlyActive: booleans use truthiness, non-empty
// strings count, positive numbers count, objects/arrays count
// when non-empty, null/undefined → off.
function isToggleEnabled(entry, settings) {
    // The stored bag is SPARSE — only changed keys are persisted — so a
    // default-on feature that was never touched has no stored value. Treating
    // that as "off" rendered default-on features as Disabled and undercounted
    // every category roll-up on a fresh install. Same resolution the quick
    // toggles and the sidepanel already use.
    const value = resolveEffectiveSettingValue(entry, settings);
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

// Dedupe guard for recordCorruptionDiagnostic. Writing the diagnostic
// mutates SETTINGS_STORAGE_KEY, which re-fires onStorageChanged →
// renderStorageInfo → renderStorageWarningBanner → back here. While a
// corrupted key persists in storage that was an unbounded write loop.
// Recording only when the corruption signature (sorted key+reason
// list) differs from the last successfully recorded one terminates
// the loop after one write per distinct finding.
let _lastCorruptionSignature = null;

async function recordCorruptionDiagnostic(corruption) {
    const signature = corruption
        .map((f) => `${f.key}:${f.kind}`)
        .sort()
        .join('|');
    if (signature === _lastCorruptionSignature) return;
    try {
        const items = await storageGet([SETTINGS_STORAGE_KEY]);
        const settings = isPlainObject(items[SETTINGS_STORAGE_KEY])
            ? items[SETTINGS_STORAGE_KEY]
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
        // Persist only the `_errors` key through the background-serialized
        // mutation controller — the old full-object storageSet could
        // clobber concurrent ytSuiteSettings writes (lost-update race).
        const result = await getSettingsMutationController().mutate('_errors', arr);
        if (!result.ok) return;
        _lastCorruptionSignature = signature;
    } catch (_) {
        // reason: best-effort — if even writing the diagnostic fails the
        // popup banner is still surfaced, which is the user-facing
        // recovery path.
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

// v4.47.0 NEW-1: keys whose values are user-private and MUST NOT
// leak into a bug report bundle. The BYO-key fields and any free-text
// endpoint URL go here (an endpoint URL may contain a personal/self-
// hosted hostname). The keys map to the corresponding schema entries
// at settings-schema.js (search for risk:"api" / risk:"store-risk").
const BUG_REPORT_REDACTED_KEYS = Object.freeze([
    'aiSummaryApiKey',
    'aiSummaryEndpoint',
    'customCssCode',
    'downloadCobaltInstance',
    'alternativeFrontendInstance',
]);

// v4.47.0: schema-overview rows for these keys carry an inline
// "local only" trust signal chip. The set is a strict subset of
// BUG_REPORT_REDACTED_KEYS — only the truly credential-bearing
// keys (BYO API keys + the AI endpoint URL, which can embed a
// key as a query param). Public default URLs (Cobalt instance,
// alternative frontend, custom CSS) are redacted from bundles
// but don't need a trust chip on the editor row because the
// "local only" reassurance is specifically about secrets.
const TRUST_SIGNAL_LOCAL_ONLY_KEYS = new Set([
    'aiSummaryEndpoint',
]);

// v4.47.0 NEW-1: redact in place so the bug-report bundle never ships
// a user's BYO API key, a self-hosted endpoint, or pasted custom CSS.
// Returns a NEW object — callers must NOT use the input afterwards.
// "[redacted]" placeholder preserves the key for diagnostics (presence
// is signal: e.g. confirms that an API key WAS set) without leaking
// the value.
function redactBugReportSettings(settings) {
    if (!isPlainObject(settings)) return {};
    // Union of the explicit key list with the policy-profile scrub
    // predicate (ALWAYS_SCRUB_KEY_PATTERNS) so the bug-report surface
    // can never drift behind the export scrubber.
    const policy = ensurePolicyProfile();
    const scrubByPolicy = (policy && typeof policy.shouldScrubKey === 'function')
        ? policy.shouldScrubKey
        : () => false;
    const out = { ...settings };
    for (const key of Object.keys(out)) {
        if (!BUG_REPORT_REDACTED_KEYS.includes(key) && !scrubByPolicy(key)) continue;
        const v = out[key];
        if (typeof v === 'string' && v.length > 0) {
            out[key] = `[redacted — ${v.length} chars]`;
        } else if (v !== undefined && v !== null && typeof v !== 'string') {
            // Non-string secret-shaped values (unexpected, but possible
            // via import) are masked outright — presence stays visible.
            out[key] = '[redacted]';
        }
    }
    return out;
}

// v3.23.0 (L9): Save the full DiagnosticLog ring buffer as a JSON file.
// The Copy button drops a compact summary on the clipboard; Save lets
// the user attach the raw structured payload to a bug report. Uses
// ext.downloads.download when available so the file lands in the
// user's Downloads folder even after the popup closes; falls back to
// an a[download] click for Firefox builds without downloads permission.
//
// v4.47.0 NEW-1: payload expanded into a full bug-report bundle. Adds
// sanitized settings snapshot (BYO API keys + endpoint URLs + custom
// CSS redacted via redactBugReportSettings) and the capability-probe
// map so issue triagers can see what was configured + what the
// browser environment supports. A new top-level `astraDeckBugReport`
// marker makes the bundle self-identifying for the issue template.
if (healthSaveBtn) {
    healthSaveBtn.addEventListener('click', async () => {
        try {
            const items = await storageGet([SETTINGS_STORAGE_KEY]);
            const settings = isPlainObject(items[SETTINGS_STORAGE_KEY])
                ? items[SETTINGS_STORAGE_KEY]
                : {};
            const errors = Array.isArray(settings._errors) ? settings._errors : [];
            const sanitized = redactBugReportSettings(settings);
            // Drop the errors array out of sanitized — already in `errors`
            // above; carrying it twice would just bloat the bundle.
            delete sanitized._errors;
            const capabilities = popupState._capabilities || null;
            const capabilityMatrix = window.YTKitCore?.capabilityProbe?.CAPABILITY_MATRIX || null;
            const capabilityProbe = window.YTKitCore?.capabilityProbe;
            const capabilityLanes = capabilityProbe?.resolveAiLaneStatus
                ? await capabilityProbe.resolveAiLaneStatus()
                : capabilityProbe?.getAiLaneStatus?.() || null;
            // v4.47.0 NEW-7: pull the SW lifecycle ring out of the
            // background script. Best-effort — if the SW is non-
            // responsive or the message handler is absent (older
            // build), we still ship the bundle without the ring.
            let swLifecycle = null;
            try {
                const resp = await callExtensionApi(
                    ext?.runtime,
                    'sendMessage',
                    { type: 'GET_SW_LIFECYCLE' }
                ).catch(() => null);
                if (resp && Array.isArray(resp.entries)) swLifecycle = resp.entries;
            } catch (_) {
                // reason: SW lifecycle ring is supplemental; bundle ships without it on failure
            }
            let externalApiHealth = null;
            try {
                const snapshot = await requestExternalApiHealthSnapshot(1200);
                if (snapshot && Array.isArray(snapshot.services)) externalApiHealth = snapshot.services;
            } catch (_) {
                // reason: active-tab API health is supplemental; bundle ships without it on failure
            }
            const payload = {
                astraDeckBugReport: true,
                schemaVersion: 2,
                exportedAt: new Date().toISOString(),
                extensionVersion: manifestVersion,
                userAgent: (typeof navigator !== 'undefined' && navigator.userAgent) || '',
                capabilities,
                capabilityMatrix,
                capabilityLanes,
                swLifecycle,
                externalApiHealth,
                settings: sanitized,
                errors,
            };
            const json = JSON.stringify(payload, null, 2);
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `astra-deck-diagnostics-${stamp}.json`;
            const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
            if (typeof ext !== 'undefined' && ext.downloads?.download) {
                const id = await callExtensionApi(
                    ext.downloads,
                    'download',
                    { url: dataUrl, filename, saveAs: true }
                );
                if (!id) throw new Error('download failed');
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

// v4.47.0 NF21: first-run welcome card + What's New banner.
//
// Detection signal for "first run" is the absence of FIRST_RUN_SEEN_KEY
// in ext.storage.local — NOT the absence of SETTINGS_STORAGE_KEY,
// because settings can be cleared via Reset and we don't want Reset
// to re-trigger the welcome card.
//
// Audit pass: upgrade-from-pre-NF21 must NOT show the welcome card.
// Existing users have a populated SETTINGS_STORAGE_KEY but no
// FIRST_RUN_SEEN_KEY (the sentinel only exists in builds that ship
// NF21). Without an upgrade guard every existing user would see the
// welcome card on their first popup open after the upgrade — a
// regression. The guard treats "SETTINGS_STORAGE_KEY contains at
// least one non-internal key" as the upgrade signal and silently
// stamps both the run-seen sentinel and the last-seen-version key.
// The user then experiences the popup as they always have, and the
// What's New banner fires correctly on their *next* version bump.
//
// What's New uses LAST_SEEN_VERSION_KEY: when it differs from the
// current manifestVersion we render a banner. Dismissing the banner
// or clicking "Read changelog" sets the key to the current version.
async function renderFirstRunSurfaces() {
    try {
        const items = await storageGet([
            FIRST_RUN_SEEN_KEY,
            LAST_SEEN_VERSION_KEY,
            SETTINGS_STORAGE_KEY,
        ]);
        let firstRunSeen = items[FIRST_RUN_SEEN_KEY] === true;
        const lastSeen = typeof items[LAST_SEEN_VERSION_KEY] === 'string'
            ? items[LAST_SEEN_VERSION_KEY]
            : '';

        // Upgrade guard. A user who had Astra Deck installed before
        // NF21 shipped has a populated SETTINGS_STORAGE_KEY but no
        // FIRST_RUN_SEEN_KEY. Treat them as already-onboarded and
        // stamp the sentinels silently so neither surface fires today.
        // "Populated" means at least one user-authored setting key
        // is present — diagnostic-only keys (`_errors`,
        // `_settingsVersion`, `_activeProfile`) are excluded because
        // a barely-touched install could carry just those.
        const storedSettings = isPlainObject(items[SETTINGS_STORAGE_KEY])
            ? items[SETTINGS_STORAGE_KEY]
            : null;
        const looksLikeExistingInstall = storedSettings
            && Object.keys(storedSettings).some(
                (k) => !k.startsWith('_'),
            );
        if (!firstRunSeen && looksLikeExistingInstall) {
            try {
                await storageSet({
                    [FIRST_RUN_SEEN_KEY]: true,
                    [LAST_SEEN_VERSION_KEY]:
                        manifestVersion && manifestVersion !== '—'
                            ? manifestVersion
                            : '',
                });
                firstRunSeen = true;
            } catch (err) {
                // reason: storage write failures are non-fatal — the
                // worst case is the welcome card shows once on the
                // next open, which is still better than crashing.
                console.warn('[Astra Deck popup] upgrade-guard stamp failed:', err);
            }
        }

        if (!firstRunSeen) {
            showWelcomeCard();
        }
        // What's New is mutually exclusive with the welcome card: a
        // fresh install shows the welcome flow, not a What's New
        // banner that says "Welcome to v4.47.0 (the only version
        // you've ever seen)." Once firstRunSeen flips true, we treat
        // every subsequent open as an upgrade candidate — but skip
        // the banner when lastSeen was stamped THIS render by the
        // upgrade guard above (same version → no diff → already
        // handled by the firstRunSeen && lastSeen !== manifestVersion
        // gate below).
        if (firstRunSeen && manifestVersion && manifestVersion !== '—' && lastSeen !== manifestVersion) {
            showWhatsNew(lastSeen);
        }

        // Opening the popup is the acknowledgement of the install badge that
        // background.js raised, whichever surface the user ends up seeing.
        await clearFirstRunPending();
    } catch (err) {
        console.warn('[Astra Deck popup] first-run surface render failed:', err);
    }
}

async function clearFirstRunPending() {
    try {
        const items = await storageGet([FIRST_RUN_PENDING_KEY]);
        if (items[FIRST_RUN_PENDING_KEY] !== true) return;
        await callExtensionApi(ext?.storage?.local, 'remove', [FIRST_RUN_PENDING_KEY]);
    } catch (err) {
        // reason: a stale pending flag only means the badge clears on the next
        // open; it must never block the onboarding surfaces above.
        console.warn('[Astra Deck popup] first-run pending clear failed:', err);
    }
    try {
        await callExtensionApi(ext?.action, 'setBadgeText', { text: '' });
    } catch (_) {
        // reason: badge APIs are cosmetic and vary by browser.
    }
}

function showWelcomeCard() {
    if (!welcomeCard) return;
    welcomeCard.hidden = false;
}

function hideWelcomeCard() {
    if (welcomeCard) welcomeCard.hidden = true;
}

async function dismissWelcomeCard(reason) {
    hideWelcomeCard();
    try {
        await storageSet({ [FIRST_RUN_SEEN_KEY]: true });
        // Also stamp the current version so the user doesn't get a
        // What's New banner on the very next popup open (they just
        // walked through the welcome flow — they know this is fresh).
        if (manifestVersion && manifestVersion !== '—') {
            await storageSet({ [LAST_SEEN_VERSION_KEY]: manifestVersion });
        }
    } catch (err) {
        console.warn('[Astra Deck popup] welcome dismiss persist failed:', err);
    }
    if (reason === 'profile-store-safe') {
        showStatus(t('statusWelcomeProfileSafe',
            'Store-safe profile active. Open Full Settings to explore features.'),
            'ok', 4200);
    } else if (reason === 'profile-github-full') {
        showStatus(t('statusWelcomeProfileFull',
            'GitHub-Full profile enabled. Astra Downloader and AI providers are now available.'),
            'ok', 4200);
    }
}

// Audit pass: serialize welcome-button clicks so a double-tap can't
// fire two writeSetting + storageSet pairs in flight. The buttons
// are visible only on a fresh install — the rapid-double-click is
// the failure mode where a user clicks while the UI is still
// settling. We disable BOTH profile buttons + the dismiss link
// while a pick is in flight; the welcome card hide happens at the
// end so visual feedback is immediate.
let _welcomePickInFlight = false;
async function pickWelcomeProfile(profile) {
    if (_welcomePickInFlight) return;
    _welcomePickInFlight = true;
    if (welcomeProfileSafeBtn) welcomeProfileSafeBtn.disabled = true;
    if (welcomeProfileFullBtn) welcomeProfileFullBtn.disabled = true;
    if (welcomeDismissBtn) welcomeDismissBtn.disabled = true;
    try {
        if (profile === 'github-full') {
            await writeSetting('githubFullProfile', true);
        } else {
            await writeSetting('githubFullProfile', false);
        }
        renderSchemaOverview();
        transitionToPresetStep();
    } catch (err) {
        showStatus(t('statusWelcomeProfileFail',
            'Could not apply profile') + ': ' + err.message, 'error', 4200);
        if (welcomeProfileSafeBtn) welcomeProfileSafeBtn.disabled = false;
        if (welcomeProfileFullBtn) welcomeProfileFullBtn.disabled = false;
        if (welcomeDismissBtn) welcomeDismissBtn.disabled = false;
    } finally {
        _welcomePickInFlight = false;
    }
}

function transitionToPresetStep() {
    const step1 = document.getElementById('welcome-step-profile');
    const step2 = document.getElementById('welcome-step-preset');
    if (step1) step1.hidden = true;
    if (step2) step2.hidden = false;
    if (welcomeDismissBtn) welcomeDismissBtn.hidden = true;
}

async function pickWelcomePreset(presetKey) {
    if (_welcomePickInFlight) return;
    _welcomePickInFlight = true;
    document.querySelectorAll('.welcome-preset-btn, .welcome-preset-skip').forEach(b => { b.disabled = true; });
    try {
        if (presetKey) {
            await writeSetting(presetKey, true);
        }
        await dismissWelcomeCard(presetKey ? `preset-${presetKey}` : 'preset-skip');
        renderSchemaOverview();
    } catch (err) {
        showStatus(t('statusWelcomePresetFail', 'Could not apply preset') + ': ' + err.message, 'error', 4200);
        document.querySelectorAll('.welcome-preset-btn, .welcome-preset-skip').forEach(b => { b.disabled = false; });
    } finally {
        _welcomePickInFlight = false;
    }
}

function showWhatsNew(lastSeen) {
    if (!whatsNewBanner || !whatsNewDetail) return;
    // Dynamic content — render directly. The t() helper does not
    // interpolate placeholders, so routing this through it would
    // erase the version detail in any translated build. Brand name
    // is omitted because the popup header already carries it; the
    // banner sits inside the same surface and adding "Astra Deck"
    // here is redundant.
    whatsNewDetail.textContent = lastSeen
        ? t('whatsNewDetailFromTpl', 'Updated to v{version} (from v{previous}). See what changed.')
            .replace('{version}', manifestVersion)
            .replace('{previous}', lastSeen)
        : t('whatsNewDetailTpl', 'Updated to v{version}. See what changed.')
            .replace('{version}', manifestVersion);
    whatsNewBanner.hidden = false;
}

function hideWhatsNew() {
    if (whatsNewBanner) whatsNewBanner.hidden = true;
}

async function dismissWhatsNew() {
    hideWhatsNew();
    try {
        if (manifestVersion && manifestVersion !== '—') {
            await storageSet({ [LAST_SEEN_VERSION_KEY]: manifestVersion });
        }
    } catch (err) {
        console.warn('[Astra Deck popup] whats-new dismiss persist failed:', err);
    }
}

if (welcomeDismissBtn) {
    welcomeDismissBtn.addEventListener('click', () => { void dismissWelcomeCard('skip'); });
}
if (welcomeProfileSafeBtn) {
    welcomeProfileSafeBtn.addEventListener('click', () => { void pickWelcomeProfile('store-safe'); });
}
if (welcomeProfileFullBtn) {
    welcomeProfileFullBtn.addEventListener('click', () => { void pickWelcomeProfile('github-full'); });
}
for (const btn of document.querySelectorAll('.welcome-preset-btn')) {
    btn.addEventListener('click', () => { void pickWelcomePreset(btn.dataset.preset || null); });
}
const welcomePresetSkipBtn = document.getElementById('welcome-preset-skip');
if (welcomePresetSkipBtn) {
    welcomePresetSkipBtn.addEventListener('click', () => { void pickWelcomePreset(null); });
}
if (whatsNewDismissBtn) {
    whatsNewDismissBtn.addEventListener('click', () => { void dismissWhatsNew(); });
}
if (whatsNewOpenBtn) {
    whatsNewOpenBtn.addEventListener('click', async () => {
        // Anchor pattern matches GitHub's auto-generated heading slugs
        // for CHANGELOG.md '## [Unreleased]' or '## [x.y.z]'. We link
        // to the top of the file because anchor stability across
        // CHANGELOG rewrites is not guaranteed — the user lands on
        // the changelog and scrolls to the top entry.
        const url = CHANGELOG_BASE_URL;
        try {
            // Dismiss BEFORE opening the tab: creating an active tab closes
            // the popup, and any work scheduled after the await races popup
            // teardown — the banner would reappear on every popup open.
            void dismissWhatsNew();
            if (ext?.tabs?.create) {
                await callExtensionApi(ext.tabs, 'create', { url, active: true });
            } else {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        } catch (err) {
            console.warn('[Astra Deck popup] whats-new open failed:', err);
        }
    });
}

async function clearDiagnosticLog() {
    // v4.47.0 NF14: applies immediately — the diagnostic log is a ring
    // buffer of runtime errors, not user-authored data. No confirm
    // dialog needed (project policy bans them).
    //
    // Routed through the background-serialized mutation controller: the
    // old read-modify-write of the full ytSuiteSettings object raced
    // concurrent writes from other surfaces (lost-update). Resetting
    // `_errors` to its schema default (empty array) only touches that key.
    try {
        const result = await getSettingsMutationController().mutate('_errors', []);
        if (!result.ok) {
            throw new Error(result.error?.message || 'Settings write failed.');
        }
        if (isPlainObject(result.settings)) popupState.settings = result.settings;
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

function buildExportData(allStorage, transcriptRecords) {
    const mergedSettings = mergeLegacySettings(
        allStorage[STORAGE_KEYS.settings] || {},
        getLegacySidebarOrder(allStorage)
    );
    // Export the FULL live data — sanitizeImported* functions are import-time
    // caps, not export caps. Truncating here silently loses data, which is
    // dangerous because the reset flow recommends "export a backup first."
    const rawHidden = allStorage[STORAGE_KEYS.hiddenVideos];
    const hiddenVideos = Array.isArray(rawHidden) ? rawHidden.filter(v => typeof v === 'string' && v.trim()) : [];
    const rawAllowed = allStorage[STORAGE_KEYS.allowedVideos];
    const allowedVideos = Array.isArray(rawAllowed) ? rawAllowed.filter(v => typeof v === 'string' && v.trim()) : [];
    const rawMarkedWatched = allStorage[STORAGE_KEYS.markedWatchedVideos];
    const markedWatchedVideos = Array.isArray(rawMarkedWatched) ? rawMarkedWatched.filter(v => typeof v === 'string' && v.trim()) : [];
    const rawBlocked = allStorage[STORAGE_KEYS.blockedChannels];
    const blockedChannels = Array.isArray(rawBlocked) ? rawBlocked.filter(v => v && typeof v === 'object') : [];
    const rawAllowedChannels = allStorage[STORAGE_KEYS.allowedChannels];
    const allowedChannels = Array.isArray(rawAllowedChannels) ? rawAllowedChannels.filter(v => v && typeof v === 'object') : [];
    const rawBookmarks = allStorage[STORAGE_KEYS.bookmarks];
    const bookmarks = (rawBookmarks && typeof rawBookmarks === 'object' && !Array.isArray(rawBookmarks)) ? rawBookmarks : {};
    const exportSettings = buildSchemaValidatedExportSettings(mergedSettings);
    const domains = persistedDomains?.buildIncludedDomainPayload(allStorage, {
        settings: exportSettings.settings
    }) || {
        settings: exportSettings.settings,
        hiddenVideos,
        allowedVideos,
        markedWatchedVideos,
        blockedChannels,
        allowedChannels,
        bookmarks
    };
    const transcriptAvailable = Array.isArray(transcriptRecords);
    if (transcriptAvailable) {
        domains.transcriptIndex = persistedDomains?.sanitizeTranscriptRecords(transcriptRecords) || transcriptRecords;
    }
    return {
        astraDeckBackup: true,
        settings: exportSettings.settings,
        hiddenVideos: domains.hiddenVideos || hiddenVideos,
        filteredVideoPosts: domains.hiddenVideos || hiddenVideos,
        allowedVideos: domains.allowedVideos || allowedVideos,
        markedWatchedVideos: domains.markedWatchedVideos || markedWatchedVideos,
        blockedChannels: domains.blockedChannels || blockedChannels,
        allowedChannels: domains.allowedChannels || allowedChannels,
        bookmarks: domains.bookmarks || bookmarks,
        domains,
        unavailableDomains: transcriptAvailable ? [] : ['transcriptIndex'],
        exclusions: (persistedDomains?.EXCLUDED_DOMAINS || []).map(({ id, reason }) => ({ id, reason })),
        exportVersion: persistedDomains?.BACKUP_EXPORT_VERSION || 5,
        backupSchemaVersion: persistedDomains?.BACKUP_SCHEMA_VERSION || 2,
        settingsSchemaVersion: SETTINGS_VERSION_FALLBACK,
        settingsProfile: exportSettings.effectiveProfile,
        scrubbedSettings: exportSettings.scrubbedKeys,
        profileDefaultedSettings: exportSettings.defaultedKeys,
        exportDate: new Date().toISOString(),
        astraDeckVersion: manifestVersion,
        ytkitVersion: manifestVersion
    };
}

// ── Confirmation dialog (retired in v4.47.0 NF14) ──
//
// The confirmAction() helper and its supporting #confirm-shell modal
// were removed because project policy explicitly bans confirmation
// dialogs in favor of immediate-apply + undo-toast / soft-delete
// patterns. The two former callers (clearDiagnosticLog, resetAllData)
// now apply immediately:
// - clearDiagnosticLog: the diagnostic log is a ring buffer of
// runtime errors, not user-authored data
// - resetAllData: the EI2 session-scoped snapshot + Undo Reset
// button provides the recovery surface
//
// See ROADMAP.md house style and docs/architecture.md §Conventions.

// ── Export / Import / Reset ──

async function readAllTranscriptRecords(options = {}) {
    if (!persistedDomains) throw new Error('Persisted-domain service unavailable');
    const records = [];
    let afterKey = '';
    let origin = '';
    for (let chunkIndex = 0; chunkIndex < 1100; chunkIndex += 1) {
        let page;
        try {
            page = await sendPersistedDataMessage({
                action: 'export-chunk',
                afterKey,
                maxBytes: persistedDomains.MAX_MESSAGE_BYTES
            }, origin);
        } catch (error) {
            if (options.allowUnavailable && isPersistedDataUnavailable(error)) {
                return { records: null, origin: '', available: false };
            }
            throw error;
        }
        const { response, origin: responseOrigin } = page;
        origin = responseOrigin;
        records.push(...(Array.isArray(response.records) ? response.records : []));
        if (response.done) {
            return {
                records: persistedDomains.sanitizeTranscriptRecords(records),
                origin,
                available: true
            };
        }
        if (!response.nextCursor || response.nextCursor === afterKey) throw new Error('Transcript export did not advance');
        afterKey = response.nextCursor;
    }
    throw new Error('Transcript export exceeded the bounded record count');
}

function chunkTranscriptRecords(records) {
    const chunks = [];
    let chunk = [];
    let bytes = 2;
    for (const record of records) {
        const recordBytes = persistedDomains.estimateJsonBytes(record) + 1;
        if (chunk.length && bytes + recordBytes > persistedDomains.MAX_MESSAGE_BYTES) {
            chunks.push(chunk);
            chunk = [];
            bytes = 2;
        }
        chunk.push(record);
        bytes += recordBytes;
    }
    if (chunk.length || chunks.length === 0) chunks.push(chunk);
    return chunks;
}

async function replaceTranscriptDomain(records, origin) {
    const chunks = chunkTranscriptRecords(persistedDomains.sanitizeTranscriptRecords(records));
    let written = 0;
    for (let index = 0; index < chunks.length; index += 1) {
        const result = await sendPersistedDataMessage({
            action: 'replace-chunk',
            clearFirst: index === 0,
            records: chunks[index]
        }, origin);
        written += Number(result.response.written) || 0;
    }
    return written;
}

async function exportSettings() {
    exportButton.setAttribute('aria-busy', 'true');
    exportButton.disabled = true;
    try {
        const [allStorage, transcript] = await Promise.all([
            callExtensionApi(ext?.storage?.local, 'get', null),
            readAllTranscriptRecords({ allowUnavailable: true })
        ]);
        const exportData = buildExportData(allStorage, transcript.records);
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // Prefer the downloads API when available so the file lands in the
        // user's downloads folder even though the popup will close. Falls back
        // to an anchor click if the permission is unavailable.
        const filename = 'astra_deck_settings_' + new Date().toISOString().slice(0, 10) + '.json';
        if (ext.downloads?.download) {
            await callExtensionApi(ext.downloads, 'download', { url, filename, saveAs: false });
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
        showStatus(transcript.available
            ? t('statusBackupExported', 'Backup exported.')
            : t('statusBackupExportedNoTranscript',
                'Backup exported without the transcript index because no responsive YouTube tab was available.'),
        'success', transcript.available ? 3200 : 6000);
    } catch (error) {
        showStatus(t('statusExportFail', 'Export failed') + ': ' + error.message, 'error', 4200);
    } finally {
        exportButton.removeAttribute('aria-busy');
        exportButton.disabled = false;
    }
}

function setFilterListStatus(messageKey, fallback, type = 'info') {
    if (!filterListStatus) return;
    filterListStatus.textContent = t(messageKey, fallback);
    filterListStatus.dataset.state = type;
}

function syncFilterListUrlInput(settings = popupState.settings) {
    if (!filterListUrlInput) return;
    filterListUrlInput.value = typeof settings?.hideVideosFilterListUrl === 'string'
        ? settings.hideVideosFilterListUrl
        : '';
}

async function exportFilterList() {
    if (!exportFilterListButton) return;
    exportFilterListButton.setAttribute('aria-busy', 'true');
    exportFilterListButton.disabled = true;
    try {
        if (!persistedDomains?.buildVideoFilterListRules || !persistedDomains?.createVideoFilterList) {
            throw new Error('Filter-list service unavailable');
        }
        const allStorage = await callExtensionApi(ext?.storage?.local, 'get', null);
        const rules = persistedDomains.buildVideoFilterListRules({
            settings: allStorage?.[STORAGE_KEYS.settings] || {},
            hiddenVideos: allStorage?.[STORAGE_KEYS.hiddenVideos],
            allowedVideos: allStorage?.[STORAGE_KEYS.allowedVideos],
            blockedChannels: allStorage?.[STORAGE_KEYS.blockedChannels],
            allowedChannels: allStorage?.[STORAGE_KEYS.allowedChannels]
        });
        const payload = persistedDomains.createVideoFilterList(rules);
        const json = JSON.stringify(payload, null, 2);
        const maxBytes = persistedDomains.FILTER_LIST_MAX_BYTES || 1024 * 1024;
        if (estimateSerializedBytes(payload) > maxBytes) throw new Error('Filter list exceeds the 1 MiB safety limit');
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const filename = `astra_deck_video_filter_rules_${new Date().toISOString().slice(0, 10)}.json`;
        if (ext.downloads?.download) {
            await callExtensionApi(ext.downloads, 'download', { url, filename, saveAs: false });
        } else {
            const anchor = Object.assign(document.createElement('a'), { href: url, download: filename, rel: 'noopener' });
            document.body.appendChild(anchor);
            try { anchor.click(); } finally { anchor.remove(); }
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        setFilterListStatus('filterListStatusExported', 'Local filter rules exported.', 'success');
        showStatus(t('filterListExported', 'Video Hider rules exported.'), 'success', 3200);
    } catch (error) {
        setFilterListStatus('filterListStatusFail', 'Filter-list operation failed.', 'error');
        showStatus(t('filterListExportFail', 'Filter-list export failed') + ': ' + error.message, 'error', 4200);
    } finally {
        exportFilterListButton.removeAttribute('aria-busy');
        exportFilterListButton.disabled = false;
    }
}

async function importFilterList(file) {
    if (!file || !importFilterListButton) return;
    importFilterListButton.setAttribute('aria-busy', 'true');
    importFilterListButton.disabled = true;
    try {
        if (!persistedDomains?.parseVideoFilterList || !persistedDomains?.sanitizeDomainValue) {
            throw new Error('Filter-list service unavailable');
        }
        const maxBytes = persistedDomains.FILTER_LIST_MAX_BYTES || 1024 * 1024;
        if (file.size > maxBytes) throw new Error('Filter list exceeds the 1 MiB safety limit');
        let data;
        try {
            data = JSON.parse(await file.text());
        } catch (_) {
            throw new Error(t('filterListImportNotJson', 'That file is not valid JSON.'));
        }
        // Parse and validate the versioned format before reading a snapshot or
        // writing any storage. Future formats are a strict no-op.
        const parsed = persistedDomains.parseVideoFilterList(data);
        const rules = parsed.rules;
        const importCatalog = await loadSettingsImportCatalog();
        const currentLocal = await readLocalStorageSnapshot();
        const currentSettings = isPlainObject(currentLocal[STORAGE_KEYS.settings])
            ? currentLocal[STORAGE_KEYS.settings]
            : popupState.settings;
        const importedSettings = mergeImportedSettingsWithDefaults({
            ...currentSettings,
            hideVideosKeywordFilter: rules.keywordFilter,
            advancedLocalPredicate: rules.predicateEnabled,
            advancedLocalPredicateCode: rules.predicateCode
        }, importCatalog.defaults, importCatalog.settingsVersion, 'filter-list-import');
        const nonSettingWrites = {
            [STORAGE_KEYS.hiddenVideos]: persistedDomains.sanitizeDomainValue('hiddenVideos', rules.hiddenVideos),
            [STORAGE_KEYS.allowedVideos]: persistedDomains.sanitizeDomainValue('allowedVideos', rules.allowedVideos),
            [STORAGE_KEYS.blockedChannels]: persistedDomains.sanitizeDomainValue('blockedChannels', rules.blockedChannels),
            [STORAGE_KEYS.allowedChannels]: persistedDomains.sanitizeDomainValue('allowedChannels', rules.allowedChannels)
        };
        if (estimateSerializedBytes({ ...nonSettingWrites, [STORAGE_KEYS.settings]: importedSettings }) > 64 * 1024 * 1024) {
            throw new Error('Filter-list import data exceeds the 64 MB safety limit');
        }

        const snapshot = await createCoordinatedSnapshot('filter-list-import', { localSnapshot: currentLocal });
        const snapped = await writeImportSnapshot(snapshot);
        if (!snapped) {
            await discardCoordinatedSnapshot(snapshot);
            throw new Error(t('statusImportSnapshotFail', 'Could not stage an undo snapshot.'));
        }
        try {
            await storageSet(nonSettingWrites);
            const result = await replaceSettings(importedSettings);
            await renderStorageInfo();
            await loadSettings();
            render(popupState.settings, q.value);
            setUndoImportVisible(true);
            setFilterListStatus('filterListStatusImported', 'Filter rules imported. Undo Import is available.', 'success');
            showStatus(t('filterListImported', 'Video Hider rules imported. Undo Import is available.'), 'success', 5200);
            void result;
        } catch (error) {
            try { await restoreCoordinatedSnapshot(snapshot); } finally {
                await clearImportSnapshot();
                await discardCoordinatedSnapshot(snapshot);
            }
            throw new Error(t('filterListImportRollback', 'Filter-list import failed; previous data was restored.'));
        }
    } catch (error) {
        setFilterListStatus('filterListStatusFail', 'Filter-list operation failed.', 'error');
        showStatus(t('filterListImportFail', 'Filter-list import failed') + ': ' + error.message, 'error', 5200);
    } finally {
        importFilterListFileInput.value = '';
        importFilterListButton.removeAttribute('aria-busy');
        importFilterListButton.disabled = false;
        try { await refreshUndoImportVisibility(); } catch (_) { /* reason: popup teardown or storage failure */ }
    }
}

async function refreshFilterList() {
    if (!refreshFilterListButton || !filterListUrlInput) return;
    refreshFilterListButton.setAttribute('aria-busy', 'true');
    refreshFilterListButton.disabled = true;
    try {
        if (!persistedDomains?.normalizeFilterListUrl) throw new Error('Filter-list service unavailable');
        const normalizedUrl = persistedDomains.normalizeFilterListUrl(filterListUrlInput.value);
        if (!normalizedUrl) {
            setFilterListStatus('filterListStatusInvalidUrl', 'Enter an HTTPS URL without credentials or a fragment.', 'error');
            return;
        }
        if (popupState.settings.hideVideosFilterListUrl !== normalizedUrl) {
            await writeSetting('hideVideosFilterListUrl', normalizedUrl);
            syncFilterListUrlInput(popupState.settings);
        }
        const result = await sendPopupBridgeMessageToYouTubeTabs('YTKIT_REFRESH_FILTER_LIST');
        if (result?.noYouTubeTab) {
            setFilterListStatus('filterListStatusNoTab', 'Open a YouTube tab to refresh the remote list.', 'error');
            return;
        }
        if (!result?.ok) {
            setFilterListStatus('filterListStatusFail', result?.error || 'Remote list refresh failed.', 'error');
            return;
        }
        setFilterListStatus('filterListStatusRefreshed', 'Remote filter list refreshed.', 'success');
        showStatus(t('filterListRefreshed', 'Video Hider filter list refreshed.'), 'success', 3200);
    } catch (error) {
        setFilterListStatus('filterListStatusFail', 'Remote list refresh failed.', 'error');
        showStatus(t('filterListRefreshFail', 'Filter-list refresh failed') + ': ' + error.message, 'error', 5200);
    } finally {
        refreshFilterListButton.removeAttribute('aria-busy');
        refreshFilterListButton.disabled = false;
    }
}

async function importSettings(file) {
    if (!file) return;
    importButton.setAttribute('aria-busy', 'true');
    importButton.disabled = true;
    try {
        if (!persistedDomains) throw new Error('Persisted-domain service unavailable');
        if (file.size > persistedDomains.MAX_BACKUP_BYTES) throw new Error('Import file exceeds the 512 MB safety limit');
        const text = await file.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (parseError) {
            // A raw SyntaxError names a byte offset ("Unexpected token < in JSON
            // at position 0"), which tells the user nothing about which file to
            // pick. Every other import failure path here has hand-written copy;
            // this one leaked the parser's. Keep the raw text for the console
            // and the diagnostic bundle, and tell the user what a backup is.
            console.warn('[Astra Deck popup] Settings import parse failed:', parseError);
            throw new Error(t('statusImportNotBackup',
                'That file is not an Astra Deck backup. Choose the .json file produced by Export — a valid backup contains an "exportVersion" field.'));
        }
        // Version validation happens before any snapshot or write. A backup
        // from a future Astra version must be a strict no-op, not a best-effort
        // partial import that silently drops unknown domains.
        const migrated = persistedDomains.migrateBackup(data);
        const importCatalog = await loadSettingsImportCatalog();
        const sanitized = persistedDomains.sanitizeMigratedDomains(migrated, (importedSettings) => (
            mergeImportedSettingsWithDefaults(
                importedSettings,
                importCatalog.defaults,
                importCatalog.settingsVersion,
                'popup-import',
                { backupSchemaVersion: migrated.settingsSchemaVersion }
            )
        ));
        const writes = persistedDomains.domainsToExtensionWrites(sanitized.domains);
        const hasTranscriptDomain = Object.prototype.hasOwnProperty.call(sanitized.domains, 'transcriptIndex');
        if (Object.keys(writes).length === 0 && !hasTranscriptDomain) throw new Error('No valid portable data found in file');
        if (estimateSerializedBytes(writes) > 64 * 1024 * 1024) throw new Error('Extension-local import data exceeds the 64 MB safety limit');

        const preview = persistedDomains.buildImportPreview(
            sanitized.domains,
            sanitized.droppedByDomain,
            sanitized.appliedByDomain
        );
        const previewText = persistedDomains.formatImportPreview(preview);
        showStatus(t('statusImportPreviewApplyTpl', 'Import preview: {preview}. Applying with rollback…')
            .replace('{preview}', previewText), 'success', 6000);
        await new Promise((resolve) => (globalThis.requestAnimationFrame || setTimeout)(resolve, 0));

        const currentLocal = await readLocalStorageSnapshot();
        const keysToRemove = persistedDomains.extensionKeysToRemove(sanitized.domains, currentLocal);
        const snapshot = await createCoordinatedSnapshot('import', {
            includePage: hasTranscriptDomain,
            allowPageUnavailable: true,
            localSnapshot: currentLocal
        });
        const snapped = await writeImportSnapshot(snapshot);
        if (!snapped) {
            await discardCoordinatedSnapshot(snapshot);
            showStatus(t('statusImportSnapshotFail',
                'Import aborted - could not stage an undo snapshot. Export a backup first.'),
                'error', 6000);
            return;
        }
        try {
            const importedSettingsToApply = writes[STORAGE_KEYS.settings];
            const nonSettingWrites = { ...writes };
            delete nonSettingWrites[STORAGE_KEYS.settings];
            if (keysToRemove.length) await storageRemove(keysToRemove);
            if (Object.keys(nonSettingWrites).length) await storageSet(nonSettingWrites);
            if (importedSettingsToApply) {
                const result = await replaceSettings(importedSettingsToApply);
                writes[STORAGE_KEYS.settings] = result.settings;
            }
            if (hasTranscriptDomain && snapshot.pageSnapshotId) {
                await replaceTranscriptDomain(sanitized.domains.transcriptIndex, snapshot.pageOrigin);
            }
        } catch (error) {
            await restoreCoordinatedSnapshot(snapshot);
            await clearImportSnapshot();
            await discardCoordinatedSnapshot(snapshot);
            showStatus(t('statusSettingsImportFailed',
                'Import failed while applying data; previous state was restored.'),
                'error', 6000);
            return;
        }
        if (writes[STORAGE_KEYS.settings]) {
            await callExtensionApi(
                ext?.storage?.local,
                'remove',
                STORAGE_KEYS.legacySidebarOrder
            ).catch(() => { /* reason: legacy key may not exist */ });
        }
        await renderStorageInfo();
        await loadSettings();
        render(popupState.settings, q.value);
        const transcriptSkipped = hasTranscriptDomain && !snapshot.pageSnapshotId;
        const importedStatus = transcriptSkipped
            ? t('statusBackupImportedNoTranscript',
                'Extension data imported with Undo available. The transcript index was left unchanged because no responsive YouTube tab was available.')
            : t('statusBackupImportedUndo',
                'Backup imported. Click Undo Import to restore the previous state until you close the browser.');
        const previewSummary = t('statusImportPreviewSummaryTpl', 'Preview: {preview}.')
            .replace('{preview}', previewText);
        showStatus(t('statusImportSummaryTpl', '{status} {preview}')
            .replace('{status}', importedStatus)
            .replace('{preview}', previewSummary),
            'success', 6000);
    } catch (error) {
        showStatus(t('statusImportFail', 'Import failed') + ': ' + error.message, 'error', 4200);
    } finally {
        importFileInput.value = '';
        importButton.removeAttribute('aria-busy');
        importButton.disabled = false;
        // Reconcile the recovery affordance after every exit path. Rollback
        // itself may throw when the owning YouTube tab disappears, but a
        // staged session snapshot must still surface Undo Import.
        try { await refreshUndoImportVisibility(); } catch (_) {
            // reason: popup teardown or storage failure must not mask import status
        }
    }
}

async function undoImportSettings() {
    if (!undoImportButton) return;
    undoImportButton.setAttribute('aria-busy', 'true');
    undoImportButton.disabled = true;
    try {
        const snap = await readImportSnapshot();
        if (!snap || Object.keys(snap).length === 0) {
            setUndoImportVisible(false);
            showStatus(t('statusImportUndoExpired',
                'Undo Import is no longer available - the browser session snapshot expired.'),
                'error', 4200);
            return;
        }
        const restoredLocal = await restoreCoordinatedSnapshot(snap);
        await clearImportSnapshot();
        await renderStorageInfo();
        await loadSettings();
        render(popupState.settings, q.value);
        renderDataFlowPanel();
        renderSchemaOverview();
        if (restoredLocal[STORAGE_KEYS.settings]) {
            void broadcastSettingsReplaced(restoredLocal[STORAGE_KEYS.settings]);
        }
        setUndoImportVisible(false);
        showStatus(t('statusSettingsImportUndone',
            'Import undone. Previous settings and local data restored.'),
            'success', 4200);
    } catch (error) {
        showStatus(t('statusImportUndoFail', 'Undo Import failed') + ': ' + error.message, 'error', 4200);
    } finally {
        undoImportButton.removeAttribute('aria-busy');
        undoImportButton.disabled = false;
    }
}

// v4.47.0 NF6 (partial): Astra Downloader "Skip for now" recovery.
// ytkit.js's MediaDLManager.showInstallPrompt sets
// `ytkit_mediadl_prompt_dismissed = true` in ext.storage.local
// when the user clicks "Skip for now". That dismiss is permanent —
// the prompt never reappears on its own. Surface a small recovery
// action in the popup so users who change their mind can re-enable
// the prompt without manually editing storage.
const MEDIADL_DISMISSED_KEY = 'ytkit_mediadl_prompt_dismissed';
const reenableMediadlButton = $('#reenable-mediadl-btn');
// v4.47.0 NF6: on-demand Astra Downloader companion self-update button.
const updateCompanionButton = $('#update-companion-btn');
// v4.47.0 NF18: on-demand yt-dlp self-update button.
const updateYtdlpButton = $('#update-ytdlp-btn');

// Gate the companion-maintenance buttons on the effective policy
// profile. Under store-safe no Astra Downloader companion can exist
// (it is a github-full-only feature), so "Update Astra Downloader" /
// "Update yt-dlp" would be dead controls. Mirrors the
// #reenable-mediadl-btn pattern: JS drives the hidden flag from live
// state; re-evaluated at boot and on every storage change so flipping
// githubFullProfile updates the buttons without reopening the popup.
function refreshCompanionUpdateVisibility() {
    if (!updateCompanionButton && !updateYtdlpButton) return;
    const policy = ensurePolicyProfile();
    const effective = policy
        ? policy.resolveEffectiveProfile(popupState.settings || {})
        : 'store-safe';
    const show = effective === 'github-full';
    if (updateCompanionButton) updateCompanionButton.hidden = !show;
    if (updateYtdlpButton) updateYtdlpButton.hidden = !show;
}

async function readMediadlDismissed() {
    if (!ext?.storage?.local) return false;
    try {
        const items = await callExtensionApi(ext.storage.local, 'get', MEDIADL_DISMISSED_KEY);
        return items && items[MEDIADL_DISMISSED_KEY] === true;
    } catch (_) {
        // reason: extension storage unavailable; treat as not dismissed
        return false;
    }
}

async function clearMediadlDismissed() {
    if (!ext?.storage?.local) return false;
    try {
        await callExtensionApi(ext.storage.local, 'remove', MEDIADL_DISMISSED_KEY);
        return true;
    } catch (_) {
        // reason: extension storage remove unavailable; report failure
        return false;
    }
}

async function refreshReenableMediadlVisibility() {
    if (!reenableMediadlButton) return;
    const dismissed = await readMediadlDismissed();
    reenableMediadlButton.hidden = !dismissed;
}

async function reenableMediadlPrompts() {
    if (!reenableMediadlButton) return;
    reenableMediadlButton.setAttribute('aria-busy', 'true');
    reenableMediadlButton.disabled = true;
    try {
        const ok = await clearMediadlDismissed();
        if (ok) {
            reenableMediadlButton.hidden = true;
            showStatus(t('statusMediadlReenabled',
                'Astra Downloader install prompts re-enabled — reload a YouTube tab to see them.'),
                'success', 4200);
        } else {
            showStatus(t('statusMediadlReenableFail',
                "Could not re-enable Astra Downloader prompts. Open your browser's extensions page and reload."),
                'error', 4200);
        }
    } finally {
        reenableMediadlButton.removeAttribute('aria-busy');
        reenableMediadlButton.disabled = false;
    }
}

// v4.47.0 NF18: on-demand yt-dlp self-update. Round-trips through
// the active YouTube tab's content script (which has
// MediaDLManager.check() warm + the per-install token cached) so
// the popup never has to do its own discovery or token handling.
// User-visible status string maps the structured server response:
// - 200 ok:true                 -> "yt-dlp updated to vX (was vY)"
// - 409 ok:false (in-flight)   -> "N download(s) in flight — try again"
// - 503 ok:false (no yt-dlp)   -> "Astra Downloader has no yt-dlp yet"
// - 500 ok:false (exit code)   -> "yt-dlp -U failed: <stderr>"
// - status=0  (no MediaDL/SW)  -> "Start Astra Downloader and try again"
function rankPopupBridgeTab(tab) {
    // tabs.Tab has no `currentWindow` property (that name is a tabs.query
    // filter, not a Tab field), so an earlier ranking criterion that read
    // it off the tab object was a permanent no-op and was dropped.
    return (tab?.active ? 0 : 4)
        + (tab?.highlighted ? 0 : 1);
}

function sortPopupBridgeTabs(tabs) {
    return [...(tabs || [])].sort((a, b) =>
        rankPopupBridgeTab(a) - rankPopupBridgeTab(b)
        || Number(a?.index || 0) - Number(b?.index || 0)
        || Number(a?.id || 0) - Number(b?.id || 0)
    );
}

async function sendPopupBridgeMessageToYouTubeTabs(messageType) {
    return sendPopupBridgeMessageToYouTubeTabsWithPayload(messageType);
}

async function sendPopupBridgeMessageToYouTubeTabsWithPayload(messageType, payload = {}) {
    let tabs = [];
    try { tabs = await callExtensionApi(ext?.tabs, 'query', { url: YOUTUBE_TAB_URLS }); }
    catch (_) { /* reason: extension suspended or tabs API unavailable */ }
    tabs = sortPopupBridgeTabs(tabs).filter((tab) =>
        tab && typeof tab.id !== 'undefined' && Number.isFinite(Number(tab.id)));
    if (!tabs.length) {
        return { ok: false, status: 0, noYouTubeTab: true, error: 'No YouTube tab is open.' };
    }

    let lastNoResponse = null;
    for (const tab of tabs) {
        const result = await callExtensionApi(
            ext?.tabs,
            'sendMessage',
            tab.id,
            { type: messageType, ...payload }
        ).catch((error) => ({
            ok: false,
            status: 0,
            error: error?.message || 'Could not message the YouTube tab.'
        })) || { ok: false, status: 0, error: 'No response from the YouTube tab.' };
        if (result?.ok || (result && result.status !== 0)) {
            return { ...result, tabId: tab.id, origin: getTabOrigin(tab) };
        }
        lastNoResponse = result;
    }
    return lastNoResponse || { ok: false, status: 0, error: 'No response from any YouTube tab.' };
}

async function sendPopupBridgeMessageToTab(tabId, messageType, payload = {}) {
    if (!Number.isFinite(Number(tabId))) {
        return { ok: false, status: 0, error: 'The original YouTube tab is unavailable.' };
    }
    return await callExtensionApi(
        ext?.tabs,
        'sendMessage',
        tabId,
        { type: messageType, ...payload }
    ).catch((error) => ({
        ok: false,
        status: 0,
        error: error?.message || 'Could not message the original YouTube tab.'
    })) || { ok: false, status: 0, error: 'No response from the original YouTube tab.' };
}

async function updateYtdlpNow() {
    if (!updateYtdlpButton) return;
    updateYtdlpButton.setAttribute('aria-busy', 'true');
    updateYtdlpButton.disabled = true;
    try {
        const result = await sendPopupBridgeMessageToYouTubeTabs('YTKIT_UPDATE_YTDLP');
        if (result?.noYouTubeTab) {
            showStatus(t('statusUpdateYtdlpNoTab',
                'Open a YouTube tab first — the popup needs it to reach the Astra Downloader.'),
                'error', 5200);
            return;
        }
        if (result && result.ok) {
            const before = result.version_before || '';
            const after = result.version_after || '';
            // Dynamic content — render directly rather than route through
            // t() because the helper does not interpolate placeholders;
            // a translation key would erase the version delta. "v"-prefix
            // matches the version chip in the popup header so users
            // visually anchor on the same shape.
            const detail = (before && after && before === after)
                ? t('statusYtdlpCurrentTpl', 'yt-dlp already at v{version}')
                    .replace('{version}', after)
                : t('statusYtdlpUpdatedTpl', 'yt-dlp updated to v{version}{from}')
                    .replace('{version}', after || '?')
                    .replace('{from}', before
                        ? t('statusYtdlpFromTpl', ' (from v{version})').replace('{version}', before)
                        : '');
            const rollback = result.rollback_version
                ? t('statusYtdlpRollbackTpl', ' Last-known-good: v{version}.')
                    .replace('{version}', result.rollback_version)
                : '';
            showStatus(detail + rollback, 'success', 6200);
        } else {
            const rawErr = (result && (result.error || result.stderr)) || t('statusUpdateFailed', 'Update failed.');
            // stderr can be a multi-line traceback wall — the status strip is
            // two lines tall; keep the first meaningful line.
            const err = String(rawErr).split('\n').find((line) => line.trim()) || t('statusUpdateFailed', 'Update failed.');
            const recovery = result?.rolled_back
                ? t('statusYtdlpRestoredTpl', ' Active version restored to v{version}.')
                    .replace('{version}', result.version_after || result.rollback_version || '?')
                : '';
            // Same reasoning — t() would lose the stderr appendix.
            showStatus(t('statusYtdlpUpdateFailedTpl', 'yt-dlp update failed — {error}{recovery}')
                .replace('{error}', err)
                .replace('{recovery}', recovery), 'error', 7200);
        }
    } finally {
        updateYtdlpButton.removeAttribute('aria-busy');
        updateYtdlpButton.disabled = false;
    }
}

// v4.47.0 NF6: on-demand Astra Downloader companion self-update.
// Uses the same active-tab bridge as updateYtdlpNow because the content
// script owns MediaDLManager discovery and the per-install auth token.
async function updateCompanionNow() {
    if (!updateCompanionButton) return;
    updateCompanionButton.setAttribute('aria-busy', 'true');
    updateCompanionButton.disabled = true;
    try {
        const result = await sendPopupBridgeMessageToYouTubeTabs('YTKIT_UPDATE_COMPANION');
        if (result?.noYouTubeTab) {
            showStatus(t('statusUpdateYtdlpNoTab',
                'Open a YouTube tab first — the popup needs it to reach the Astra Downloader.'),
                'error', 5200);
            return;
        }
        if (result && result.ok) {
            const current = result.current_version || '';
            const latest = result.latest_version || '';
            if (result.update_available === false || result.status === 'current') {
                showStatus(t('statusCompanionCurrentTpl', 'Astra Downloader already at v{version}.')
                    .replace('{version}', latest || current || '?'), 'success', 5200);
            } else {
                const rollback = result.rollback_version || current || '?';
                showStatus(t('statusCompanionReadyTpl', 'Astra Downloader update ready: v{current} → v{latest}. Restarting with v{rollback} retained for automatic rollback.')
                    .replace('{current}', current || '?')
                    .replace('{latest}', latest || '?')
                    .replace('{rollback}', rollback), 'success', 8200);
            }
        } else {
            const err = (result && result.error) || t('statusUpdateFailed', 'Update failed.');
            showStatus(t('statusCompanionUpdateFailedTpl', 'Astra Downloader update failed — {error}')
                .replace('{error}', err), 'error', 7200);
        }
    } finally {
        updateCompanionButton.removeAttribute('aria-busy');
        updateCompanionButton.disabled = false;
    }
}

// v4.47.0 EI2: undo grace period for Reset. The snapshot lives in
// ext.storage.session — survives popup close/reopen but is wiped
// when the browser quits. That's the right shape for "you misclicked
// 30 seconds ago" while keeping the recovery window bounded; the
// previous behaviour wiped everything with no path back. The undo
// button is auto-shown when a snapshot exists and auto-hidden when
// it's consumed or absent.
const IMPORT_SNAPSHOT_KEY = '_importSnapshot';
const RESET_SNAPSHOT_KEY = '_resetSnapshot';
const YOUTUBE_STATE_RESET_SNAPSHOT_KEY = '_youtubeStateResetSnapshot';
const undoResetButton = $('#undo-reset-btn');

async function readYoutubeStateResetSnapshot() {
    if (!sessionStorageAvailable()) return null;
    try {
        const items = await callExtensionApi(ext.storage.session, 'get', YOUTUBE_STATE_RESET_SNAPSHOT_KEY);
        return items?.[YOUTUBE_STATE_RESET_SNAPSHOT_KEY] || null;
    } catch (_) {
        // reason: session storage can be unavailable in restricted Firefox contexts
        return null;
    }
}

async function clearYoutubeStateResetSnapshot() {
    if (!sessionStorageAvailable()) return;
    await callExtensionApi(ext.storage.session, 'remove', YOUTUBE_STATE_RESET_SNAPSHOT_KEY);
}

function setUndoYoutubeStateVisible(visible) {
    if (!undoYoutubeStateButton) return;
    undoYoutubeStateButton.hidden = !visible;
    if (visible) undoYoutubeStateButton.closest('details')?.setAttribute('open', '');
}

async function refreshUndoYoutubeStateVisibility() {
    const snapshot = await readYoutubeStateResetSnapshot();
    setUndoYoutubeStateVisible(Boolean(snapshot?.snapshot && snapshot?.tabId));
}

async function resetYoutubeState() {
    if (!resetYoutubeStateButton) return;
    resetYoutubeStateButton.setAttribute('aria-busy', 'true');
    resetYoutubeStateButton.disabled = true;
    try {
        if (!sessionStorageAvailable()) {
            throw new Error('Session recovery storage is unavailable; reset was not started');
        }
        const captured = await sendPopupBridgeMessageToYouTubeTabsWithPayload(
            'YTKIT_RESET_YOUTUBE_STATE',
            { action: 'snapshot' }
        );
        if (captured?.noYouTubeTab) {
            showStatus(t('statusYoutubeStateNoTab', 'Open a YouTube tab before resetting its local page state.'), 'error', 5200);
            return;
        }
        if (!captured?.ok) throw new Error(captured?.error || 'Could not capture YouTube page state');
        if (!captured.count) {
            showStatus(t('statusYoutubeStateEmpty', 'No stale YouTube page-state keys were found.'), 'info', 3600);
            return;
        }

        const staged = {
            schemaVersion: 1,
            tabId: captured.tabId,
            origin: captured.origin,
            createdAt: Date.now(),
            snapshot: captured.snapshot
        };
        await callExtensionApi(ext.storage.session, 'set', {
            [YOUTUBE_STATE_RESET_SNAPSHOT_KEY]: staged
        });

        const cleared = await sendPopupBridgeMessageToTab(
            staged.tabId,
            'YTKIT_RESET_YOUTUBE_STATE',
            { action: 'clear', snapshot: staged.snapshot }
        );
        if (!cleared?.ok) {
            if (cleared?.status === 0) {
                // Transport-level failure (tab navigating, port closed): the
                // content script may already have cleared state, so keep the
                // staged snapshot and surface Undo instead of destroying the
                // only recovery path.
                setUndoYoutubeStateVisible(true);
            } else {
                await clearYoutubeStateResetSnapshot();
            }
            throw new Error(cleared?.error || 'YouTube page-state reset failed');
        }
        const undoableCount = cleared.cleared?.length || 0;
        const notUndoableCount = cleared.notUndoable?.length || 0;
        if (!undoableCount && !notUndoableCount) {
            await clearYoutubeStateResetSnapshot();
            showStatus(t('statusYoutubeStateChanged',
                'YouTube changed its page state before reset, so nothing was cleared.'), 'info', 4200);
            return;
        }

        if (undoableCount) {
            setUndoYoutubeStateVisible(true);
        } else {
            // Only oversized (never-snapshotted) keys were cleared — there is
            // nothing Undo could restore, so don't offer it.
            await clearYoutubeStateResetSnapshot();
        }
        if (notUndoableCount) {
            showStatus(t('statusYoutubeStateResetPartialUndo',
                'Cleared {count} stale YouTube page-state keys. {big} exceeded the backup limit, so Undo cannot restore them.')
                .replace('{count}', String(undoableCount + notUndoableCount))
                .replace('{big}', String(notUndoableCount)),
            'success', 7200);
        } else {
            showStatus(t('statusYoutubeStateReset',
                'Cleared {count} stale YouTube page-state keys. Reload YouTube to apply; Undo remains available while the original tab stays open.')
                .replace('{count}', String(undoableCount)),
            'success', 7200);
        }
    } catch (error) {
        showStatus(t('statusYoutubeStateResetFail', 'YouTube state reset failed') + ': ' + error.message, 'error', 6200);
    } finally {
        resetYoutubeStateButton.removeAttribute('aria-busy');
        resetYoutubeStateButton.disabled = false;
    }
}

async function undoYoutubeStateReset() {
    if (!undoYoutubeStateButton) return;
    undoYoutubeStateButton.setAttribute('aria-busy', 'true');
    undoYoutubeStateButton.disabled = true;
    try {
        const staged = await readYoutubeStateResetSnapshot();
        if (!staged?.snapshot || !staged?.tabId) {
            setUndoYoutubeStateVisible(false);
            showStatus(t('statusYoutubeStateUndoExpired',
                'YouTube state Undo is no longer available for the original tab.'), 'info', 4200);
            return;
        }
        const restored = await sendPopupBridgeMessageToTab(
            staged.tabId,
            'YTKIT_RESET_YOUTUBE_STATE',
            { action: 'restore', snapshot: staged.snapshot }
        );
        if (!restored?.ok) throw new Error(restored?.error || 'Could not restore YouTube page state');
        await clearYoutubeStateResetSnapshot();
        setUndoYoutubeStateVisible(false);
        showStatus(t('statusYoutubeStateRestored',
            'Restored {count} YouTube page-state keys. Reload YouTube to apply them.')
            .replace('{count}', String(restored.restored?.length || 0)),
        'success', 5200);
    } catch (error) {
        showStatus(t('statusYoutubeStateUndoFail', 'YouTube state Undo failed') + ': ' + error.message, 'error', 6200);
    } finally {
        undoYoutubeStateButton.removeAttribute('aria-busy');
        undoYoutubeStateButton.disabled = false;
    }
}

function sessionStorageAvailable() {
    return !!(ext && ext.storage && ext.storage.session);
}

function createSnapshotId(kind) {
    const randomPart = globalThis.crypto?.randomUUID?.()
        || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${kind}-${randomPart}`;
}

async function createCoordinatedSnapshot(kind, options = {}) {
    if (!persistedDomains) throw new Error('Persisted-domain service unavailable');
    if (!sessionStorageAvailable()) throw new Error('Session storage is unavailable; recoverable changes are disabled');
    const snapshotId = createSnapshotId(kind);
    const local = options.localSnapshot || await readLocalStorageSnapshot();
    await persistedDomains.writeExtensionSnapshot(snapshotId, local);
    let pageOrigin = '';
    let pageSnapshotId = '';
    try {
        if (options.includePage) {
            try {
                const page = await sendPersistedDataMessage({ action: 'snapshot', snapshotId });
                pageOrigin = page.origin;
                pageSnapshotId = snapshotId;
            } catch (error) {
                if (!options.allowPageUnavailable || !isPersistedDataUnavailable(error)) throw error;
            }
        }
        return {
            schemaVersion: 2,
            kind,
            snapshotId,
            pageSnapshotId,
            pageOrigin,
            createdAt: Date.now()
        };
    } catch (error) {
        await persistedDomains.deleteExtensionSnapshot(snapshotId).catch(() => {});
        throw error;
    }
}

async function restoreCoordinatedSnapshot(snapshot) {
    if (!snapshot?.snapshotId) throw new Error('Recovery snapshot is invalid or expired');
    // Read before mutating either domain so an expired extension token cannot
    // cause a valid page snapshot to be consumed.
    const local = await persistedDomains.readExtensionSnapshot(snapshot.snapshotId);
    // Restore the page-origin domain first. If its tab is unavailable, no
    // extension-local mutation occurs and the snapshot remains retryable.
    if (snapshot.pageSnapshotId) {
        await sendPersistedDataMessage({
            action: 'restore-snapshot',
            snapshotId: snapshot.pageSnapshotId,
            keepSnapshot: true
        }, snapshot.pageOrigin || '');
    }
    await restoreLocalStorageSnapshot(local);
    if (snapshot.pageSnapshotId) {
        await sendPersistedDataMessage({
            action: 'discard-snapshot',
            snapshotId: snapshot.pageSnapshotId
        }, snapshot.pageOrigin || '');
    }
    await persistedDomains.deleteExtensionSnapshot(snapshot.snapshotId);
    return local;
}

async function discardCoordinatedSnapshot(snapshot) {
    if (!snapshot?.snapshotId || !persistedDomains) return;
    const work = [persistedDomains.deleteExtensionSnapshot(snapshot.snapshotId)];
    if (snapshot.pageSnapshotId) {
        work.push(sendPersistedDataMessage({
            action: 'discard-snapshot',
            snapshotId: snapshot.pageSnapshotId
        }, snapshot.pageOrigin || ''));
    }
    await Promise.allSettled(work);
}

async function readLocalStorageSnapshot() {
    const items = await callExtensionApi(ext?.storage?.local, 'get', null);
    return items || {};
}

async function restoreLocalStorageSnapshot(snapshot) {
    await storageClear();
    if (snapshot && Object.keys(snapshot).length > 0) {
        await callExtensionApi(ext?.storage?.local, 'set', snapshot);
    }
}

async function readSessionSnapshot(key) {
    if (!sessionStorageAvailable()) return null;
    try {
        const items = await callExtensionApi(ext.storage.session, 'get', key);
        const snap = items && items[key];
        return snap && typeof snap === 'object' ? snap : null;
    } catch (_) {
        // reason: session API may be unavailable in some Firefox versions
        return null;
    }
}

async function writeSessionSnapshot(key, snapshot) {
    if (!sessionStorageAvailable()) return false;
    try {
        await callExtensionApi(ext.storage.session, 'set', { [key]: snapshot });
        return true;
    } catch (_) {
        // reason: session API write failed; treat as no-snapshot, undo unavailable
        return false;
    }
}

async function clearSessionSnapshot(key) {
    if (!sessionStorageAvailable()) return;
    try {
        await callExtensionApi(ext.storage.session, 'remove', key);
    } catch (_) {
        // reason: session.remove failure is benign; snapshot evicts on browser close
    }
}

async function readImportSnapshot() {
    return readSessionSnapshot(IMPORT_SNAPSHOT_KEY);
}

async function writeImportSnapshot(snapshot) {
    const previous = await readImportSnapshot();
    if (previous?.snapshotId && previous.snapshotId !== snapshot?.snapshotId) {
        await discardCoordinatedSnapshot(previous);
    }
    return writeSessionSnapshot(IMPORT_SNAPSHOT_KEY, snapshot);
}

async function clearImportSnapshot() {
    return clearSessionSnapshot(IMPORT_SNAPSHOT_KEY);
}

async function readResetSnapshot() {
    return readSessionSnapshot(RESET_SNAPSHOT_KEY);
}

async function writeResetSnapshot(snapshot) {
    const previous = await readResetSnapshot();
    if (previous?.snapshotId && previous.snapshotId !== snapshot?.snapshotId) {
        await discardCoordinatedSnapshot(previous);
    }
    return writeSessionSnapshot(RESET_SNAPSHOT_KEY, snapshot);
}

async function clearResetSnapshot() {
    return clearSessionSnapshot(RESET_SNAPSHOT_KEY);
}

function setUndoImportVisible(visible) {
    if (!undoImportButton) return;
    undoImportButton.hidden = !visible;
    if (visible) undoImportButton.closest('details')?.setAttribute('open', '');
}

async function refreshUndoImportVisibility() {
    const snap = await readImportSnapshot();
    setUndoImportVisible(!!snap && Object.keys(snap).length > 0);
}

function setUndoResetVisible(visible) {
    if (!undoResetButton) return;
    undoResetButton.hidden = !visible;
    if (visible) undoResetButton.closest('details')?.setAttribute('open', '');
}

async function refreshUndoResetVisibility() {
    const snap = await readResetSnapshot();
    setUndoResetVisible(!!snap && Object.keys(snap).length > 0);
}

async function resetAllData() {
    // v4.47.0 NF14: applies immediately. EI2's Undo Reset button
    // already provides the recovery surface — clicking Reset stages a
    // session-scoped snapshot in ext.storage.session, surfaces the
    // Undo button, and dies with the browser session. Project policy
    // bans confirmation dialogs in favor of this pattern.
    resetButton.setAttribute('aria-busy', 'true');
    resetButton.disabled = true;
    if (storageBannerResetBtn) storageBannerResetBtn.disabled = true;
    try {
        // Snapshot extension-local data in extension IndexedDB and the
        // YouTube-origin transcript store in its own origin. Session storage
        // holds only the small capability token, avoiding its quota ceiling.
        const snapshot = await createCoordinatedSnapshot('reset', {
            includePage: true,
            allowPageUnavailable: true
        });
        const snapped = await writeResetSnapshot(snapshot);
        if (!snapped) {
            await discardCoordinatedSnapshot(snapshot);
            showStatus(t('statusResetSnapshotFail',
                'Reset aborted — could not stage an undo snapshot (data too large for recoverable reset). Export a backup first.'),
                'error', 6000);
            return;
        }
        try {
            await storageClear();
            // Re-stamp the first-run / what's-new sentinels that storageClear()
            // just wiped, so reset does not replay onboarding.
            await storageSet({
                [FIRST_RUN_SEEN_KEY]: true,
                [LAST_SEEN_VERSION_KEY]: (manifestVersion && manifestVersion !== '—') ? manifestVersion : '',
            });
            if (snapshot.pageSnapshotId) {
                await sendPersistedDataMessage({ action: 'clear' }, snapshot.pageOrigin);
            }
        } catch (error) {
            await restoreCoordinatedSnapshot(snapshot);
            await clearResetSnapshot();
            throw new Error(`Reset did not complete; previous data was restored: ${error.message}`);
        }
        await renderStorageInfo();
        await loadSettings();
        render(popupState.settings, q.value);
        await refreshUndoResetVisibility();
        undoResetButton?.focus?.({ preventScroll: true });
        showStatus(!snapshot.pageSnapshotId
            ? t('statusResetDoneNoTranscript',
                'Extension data cleared with Undo available. Transcript data was left unchanged because no responsive YouTube tab was available. Stored AI credentials were retained.')
            : t('statusResetDoneUndo',
                'Portable settings, histories, queues, and transcript data cleared. Stored AI credentials are retained; use Delete credential to remove them. Click Undo Reset to restore until you close the browser.'),
        'success', 6000);
    } catch (error) {
        showStatus(t('statusResetFail', 'Reset failed') + ': ' + error.message, 'error', 4200);
    } finally {
        resetButton.removeAttribute('aria-busy');
        resetButton.disabled = false;
        if (storageBannerResetBtn) storageBannerResetBtn.disabled = false;
    }
}

async function undoResetAllData() {
    if (!undoResetButton) return;
    undoResetButton.setAttribute('aria-busy', 'true');
    undoResetButton.disabled = true;
    try {
        const snap = await readResetSnapshot();
        if (!snap || Object.keys(snap).length === 0) {
            // Snapshot vanished (browser restart, session.remove from another
            // surface). Hide the button and report.
            setUndoResetVisible(false);
            showStatus(t('statusResetUndoExpired',
                'Undo no longer available — snapshot expired with the browser session.'),
                'error', 4200);
            return;
        }
        // Wipe-and-replace so any new keys added between reset and undo
        // don't pollute the restored payload. The snapshot is the
        // single source of truth.
        const restoredLocal = await restoreCoordinatedSnapshot(snap);
        await clearResetSnapshot();
        await renderStorageInfo();
        await loadSettings();
        render(popupState.settings, q.value);
        renderDataFlowPanel();
        renderSchemaOverview();
        if (restoredLocal[STORAGE_KEYS.settings]) {
            void broadcastSettingsReplaced(restoredLocal[STORAGE_KEYS.settings]);
        }
        setUndoResetVisible(false);
        showStatus(t('statusResetUndone', 'Reset undone — all data restored.'), 'success', 3200);
    } catch (error) {
        showStatus(t('statusResetUndoFail', 'Undo failed') + ': ' + error.message, 'error', 4200);
    } finally {
        undoResetButton.removeAttribute('aria-busy');
        undoResetButton.disabled = false;
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
    applyDocumentLanguage();
    applyI18n();
    initLanguageDropdown();

    installWheelScrolling();
    installPopupFocusManagement();
    installToggleClickDelegation();
    renderLoading();

    try {
        const [tab] = await callExtensionApi(ext?.tabs, 'query', { active: true, lastFocusedWindow: true });
        updateContext(tab || null);
    } catch {
        updateContext(null);
    }

    void renderStorageInfo();
    void renderSettingsSyncStatus();
    // best-effort selector-health snapshot from the active tab.
    // Hides the section if the user isn't on a YouTube page or if the
    // content script doesn't respond in time.
    void renderSelectorHealthDashboard();
    void renderExternalApiHealthDashboard();
    void renderFeaturePerfDashboard();

    // v4.47.0 NF21: render the first-run welcome card + What's New
    // banner in parallel with the rest of boot. Both are best-effort —
    // failures fall through to hidden surfaces so the popup never
    // blocks on either.
    void renderFirstRunSurfaces();

    // v4.29.0: restore the persisted schema-overview expanded set BEFORE
    // the first render so the user sees their open categories on open.
    await restoreSchemaOverviewExpanded();

    // v4.47.0 NF10 follow-up: kick off capability probe in parallel with
    // settings load. We do NOT await it inline — the popup must remain
    // responsive even if a probe (mediaDL fetch, ollama fetch) takes
    // ~1.5s to time out. When the probe resolves we re-render the
    // schema overview to surface the "Unavailable" chips on rows whose
    // requires: declares a capability that came back false.
    void ensureCapabilityMap().then((caps) => {
        if (caps && Object.keys(caps).length > 0) {
            renderSchemaOverview();
        }
    });

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
        // Companion update buttons only make sense under github-full.
        refreshCompanionUpdateVisibility();
        void refreshAiCredentialManager();
        registerOptionalHostPermissionListeners();
        void refreshOptionalHostGrantState();
    } catch (error) {
        console.warn('[Astra Deck popup] Failed to load settings:', error);
        render({}, '');
        // Settings unknown — fail closed to the store-safe shape.
        refreshCompanionUpdateVisibility();
        void refreshAiCredentialManager();
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
            updateSearchState();
            render(popupState.settings, '');
            // The schema overview consults q.value too — clearing the
            // filter must un-filter the overview, not just the toggles.
            renderSchemaOverview();
        }
    });
    clearSearchButton.addEventListener('click', () => {
        q.value = '';
        updateSearchState();
        render(popupState.settings, '');
        // Keep the schema overview in sync with the cleared filter.
        renderSchemaOverview();
        q.focus();
    });

    const onStorageChanged = (changes, areaName) => {
        if (areaName !== 'local') return;
        const relevant = changes[SETTINGS_STORAGE_KEY]
            || QUICK_TOGGLE_KEYS.some((key) => changes[key])
            || changes[STORAGE_KEYS.hiddenVideos]
            || changes[STORAGE_KEYS.allowedVideos]
            || changes[STORAGE_KEYS.blockedChannels]
            || changes[STORAGE_KEYS.allowedChannels]
            || changes[STORAGE_KEYS.filterListSubscription]
            || changes[STORAGE_KEYS.bookmarks];
        if (!relevant) return;
        void loadSettings().then((settings) => {
            render(settings, q.value);
            // refreshOptionalHostGrantState is its own promise — give it a
            // catch so a throw can't become an unhandled rejection during a
            // routine background update.
            void refreshOptionalHostGrantState().catch(() => {});
            // v4.12.0: keep the data-flow panel reactive — flipping
            // privacyDataFlowPanel from the in-page workspace must
            // surface in the popup on next render.
            renderDataFlowPanel();
            // Profile flips (githubFullProfile / safeStoreProfile) must
            // show/hide the companion update buttons immediately.
            refreshCompanionUpdateVisibility();
            void refreshAiCredentialManager();
            // v4.23.0: keep the schema overview's counts in sync
            // when settings change from any source — but never blow away
            // a focused inline editor (number/text/JSON), which would
            // discard the user's uncommitted input mid-edit.
            if (!schemaOverviewList || !schemaOverviewList.contains(document.activeElement)) {
                renderSchemaOverview();
            }
            void renderSettingsSyncStatus();
        }).catch((error) => {
            console.warn('[Astra Deck popup] Failed to refresh settings:', error);
        });
        void renderStorageInfo();
        void renderSettingsSyncStatus();
    };
    // `ext` is null (not undefined) in preview mode — a bare
    // `ext.storage` here threw and killed every listener wired after
    // this point in the bootstrap IIFE.
    if (ext?.storage?.onChanged) {
        ext.storage.onChanged.addListener(onStorageChanged);
        // Close the boot race: a mutation committed while the initial
        // loadSettings() round-trip was awaited landed before this listener
        // existed and was silently dropped — the popup then rendered the
        // pre-mutation value until the next unrelated storage change. One
        // cheap reconciliation read repairs it.
        const preListenerSnapshot = JSON.stringify(popupState.settings || {});
        void loadSettings().then((settings) => {
            if (JSON.stringify(settings) !== preListenerSnapshot) {
                render(settings, q.value);
                renderSchemaOverview();
            }
        }).catch(() => {});
        // The popup can be torn down mid-flight (it closes on blur). Remove the
        // listener and cancel the status timer on pagehide so a late storage
        // change can't run render paths against a dying DOM / invalidated
        // extension context.
        window.addEventListener('pagehide', () => {
            try { ext.storage.onChanged.removeListener(onStorageChanged); } catch (_) { /* reason: extension context may already be invalidated during teardown */ }
            if (popupState.statusTimer) { clearTimeout(popupState.statusTimer); popupState.statusTimer = null; }
        }, { once: true });
    }

    openPanelButton.addEventListener('click', async () => {
        try {
            const [tab] = await callExtensionApi(ext?.tabs, 'query', { active: true, lastFocusedWindow: true });
            const nextContext = getTabContext(tab || null);
            if (nextContext.mode === 'inline-panel' && tab?.id) {
                const opened = await sendPanelOpenMessage(tab.id);
                if (opened) { window.close(); return; }
            }
            await callExtensionApi(ext?.tabs, 'create', { url: 'https://www.youtube.com/' });
            window.close();
        } catch (error) {
            console.warn('[Astra Deck popup] Failed to open the full workspace:', error);
            showStatus(t('statusOpenWorkspaceFail', 'Could not open the full workspace. Try again.'), 'error', 4200);
        }
    });

    const openSidePanelBtn = $('#openSidePanel');
    if (openSidePanelBtn) {
        const sidePanelApi = ext?.['sidePanel'];
        const openSidePanel = sidePanelApi && typeof sidePanelApi['open'] === 'function'
            ? sidePanelApi['open'].bind(sidePanelApi)
            : null;
        if (openSidePanel) {
            openSidePanelBtn.addEventListener('click', async () => {
                try {
                    const [tab] = await callExtensionApi(ext?.tabs, 'query', { active: true, lastFocusedWindow: true });
                    await openSidePanel({ tabId: tab?.id });
                    window.close();
                } catch (err) {
                    showStatus(t('statusOpenDashboardFail', 'Could not open dashboard') + ': ' + err.message, 'error', 3000);
                }
            });
        } else {
            openSidePanelBtn.hidden = true;
        }
    }

    exportButton.addEventListener('click', () => { void exportSettings(); });
    importButton.addEventListener('click', () => { importFileInput.click(); });
    importFileInput.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        if (file) void importSettings(file);
    });
    if (exportFilterListButton) exportFilterListButton.addEventListener('click', () => { void exportFilterList(); });
    if (importFilterListButton) importFilterListButton.addEventListener('click', () => { importFilterListFileInput?.click(); });
    if (importFilterListFileInput) {
        importFilterListFileInput.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (file) void importFilterList(file);
        });
    }
    if (refreshFilterListButton) refreshFilterListButton.addEventListener('click', () => { void refreshFilterList(); });
    if (filterListUrlInput) {
        filterListUrlInput.addEventListener('change', () => {
            syncFilterListUrlInput({ hideVideosFilterListUrl: filterListUrlInput.value });
        });
    }
    if (undoImportButton) {
        undoImportButton.addEventListener('click', () => { void undoImportSettings(); });
        void refreshUndoImportVisibility();
    }
    if (settingsSyncUndoButton) {
        settingsSyncUndoButton.addEventListener('click', () => { void undoSettingsSync(); });
    }
    resetButton.addEventListener('click', () => { void resetAllData(); });
    if (undoResetButton) {
        undoResetButton.addEventListener('click', () => { void undoResetAllData(); });
        // Boot visibility: surface the Undo button if a prior reset's snapshot
        // is still in storage.session (e.g. user reset, closed the popup, then
        // reopened it). Best-effort — failure leaves the button hidden which
        // is the safe default.
        void refreshUndoResetVisibility();
    }
    if (resetYoutubeStateButton) {
        resetYoutubeStateButton.addEventListener('click', () => { void resetYoutubeState(); });
    }
    if (undoYoutubeStateButton) {
        undoYoutubeStateButton.addEventListener('click', () => { void undoYoutubeStateReset(); });
        void refreshUndoYoutubeStateVisibility();
    }
    if (reenableMediadlButton) {
        reenableMediadlButton.addEventListener('click', () => { void reenableMediadlPrompts(); });
        // Boot visibility: only show the button if the dismissed flag is
        // currently set in ext.storage.local. Hidden otherwise — most
        // users will never see this.
        void refreshReenableMediadlVisibility();
    }
    if (updateCompanionButton) {
        updateCompanionButton.addEventListener('click', () => { void updateCompanionNow(); });
    }
    if (updateYtdlpButton) {
        updateYtdlpButton.addEventListener('click', () => { void updateYtdlpNow(); });
    }
    if (optionalHostGrantBtn) {
        optionalHostGrantBtn.addEventListener('click', () => { void grantMissingOptionalHostPermissions(); });
    }
    if (aiCredentialProvider) {
        aiCredentialProvider.addEventListener('change', renderAiCredentialStatus);
    }
    if (aiCredentialInput) {
        aiCredentialInput.addEventListener('input', () => aiCredentialInput.setCustomValidity(''));
    }
    if (aiCredentialSave) {
        aiCredentialSave.addEventListener('click', () => { void saveAiCredential(); });
    }
    if (aiCredentialDelete) {
        aiCredentialDelete.addEventListener('click', () => { void deleteAiCredential(); });
    }
    if (healthClearBtn) healthClearBtn.addEventListener('click', () => { void clearDiagnosticLog(); });
    // Route through the same flow as the primary Reset (undo-backed, no confirm dialog) to prevent
    // bypassing the PIN when the banner is showing.
    if (storageBannerResetBtn) storageBannerResetBtn.addEventListener('click', () => { void resetAllData(); });
})();
