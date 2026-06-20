// Astra Deck — Toolbar Popup
// Quick-toggle 15 most-used features plus full data management
// (export, import, reset, storage stats) previously hosted by the
// standalone options page.

// ── Settings PIN gate (mirrors ytkit.js PIN logic) ──
const PIN_STORAGE_KEY = 'ytkit_pin_hash';
const PIN_SALT = 'ytkit-pin-salt-v1:';

async function _popupHashPin(pin) {
    const data = new TextEncoder().encode(PIN_SALT + pin);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function popupRequirePin() {
    const result = await chrome.storage.local.get(PIN_STORAGE_KEY);
    const stored = result[PIN_STORAGE_KEY];
    if (!stored) return true;
    const pin = prompt('Enter your Astra Deck PIN to continue:');
    if (pin === null) return false;
    return (await _popupHashPin(pin.trim())) === stored;
}

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
    'ar', 'en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pt_BR', 'ru', 'zh_CN'
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

// Keep <html lang> truthful for assistive tech. popup.html ships
// lang="en"; once initI18n resolves the effective locale (manual
// override or chrome.i18n auto-detect) the document language must
// follow, otherwise screen readers announce localized strings with
// English pronunciation rules. Locale tags are stored with an
// underscore (pt_BR) but the lang attribute wants BCP-47 (pt-BR).
const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

function applyDocumentLanguage() {
    try {
        const resolvedLocale = I18N.override
            || (chrome?.i18n?.getUILanguage && chrome.i18n.getUILanguage())
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
                ar: 'العربية',
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
// v4.47.0 NF25: must match ytkit.js#SETTINGS_VERSION and
// settings-meta.json#settingsVersion. The check-versions.js gate
// enforces parity across all three sources; bump in lockstep.
const SETTINGS_VERSION_FALLBACK = 7;
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
// Anchor pattern documented in CHANGELOG.md: GitHub renders the
// version inside ## brackets as #<lowercase-major-minor-patch>.
const CHANGELOG_BASE_URL = 'https://github.com/SysAdminDoc/Astra-Deck/blob/main/CHANGELOG.md';

// selector-health dashboard refs.
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
function getManifestOptionalHostPermissions() {
    try {
        const declared = chrome?.runtime?.getManifest?.().optional_host_permissions || [];
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

function getDirectOptionalHostsForSetting(key, declaredSet) {
    const core = window.YTKitCore || {};
    const catalogue = Array.isArray(core.ORIGIN_CATALOGUE) ? core.ORIGIN_CATALOGUE : [];
    const hostFactory = core.hostPermissionsForDataFlowOrigin;
    if (!catalogue.length || typeof hostFactory !== 'function') return [];
    const hosts = [];
    for (const entry of catalogue) {
        if (entry?.profile !== 'store-safe') continue;
        if (entry.hostGrant !== 'runtime-optional') continue;
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
    if (options.directOnly) {
        return getDirectOptionalHostsForSetting(key, declaredSet);
    }
    return uniqueOptionalOrigins(core.getOptionalHostPermissionsForFeature(key))
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

    for (const [key, value] of Object.entries(settings)) {
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
    const task = _pendingWriteChain.catch(() => undefined).then(async () => {
        const nextSettings = { ...popupState.settings, [key]: value };
        popupState.settings = nextSettings;
        await storageSet({ [SETTINGS_STORAGE_KEY]: nextSettings });
        await refreshOptionalHostGrantState({ render: false });
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
            } catch { /* reason: tab closing or no receiver — fine to skip */ }
        }
    } catch { /* reason: extension suspended — chrome.tabs.query rejected */ }
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
            } catch { /* reason: tab closing or no receiver — fine to skip */ }
        }
    } catch { /* reason: extension suspended — chrome.tabs.query rejected */ }
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
    // The Astra Downloader companion is a github-full-only feature. Hide the
    // "Update Companion" / "Update yt-dlp" actions for store-safe users instead
    // of surfacing buttons that only error ("open a YouTube tab first") against
    // a companion they never installed. Mirrors the reenable-mediadl gating.
    const githubFull = !!(settings && settings.githubFullProfile);
    if (updateCompanionButton) updateCompanionButton.hidden = !githubFull;
    if (updateYtdlpButton) updateYtdlpButton.hidden = !githubFull;

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
            const permissionState = isOptionalHostGrantMissing(item.key)
                ? ' ' + t('optionalHostPermissionAria', 'Permission needed.') : '';
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'toggle' + (on ? ' on' : '');
            row.dataset.key = item.key;
            row.setAttribute('role', 'switch');
            row.setAttribute('aria-checked', String(on));
            row.setAttribute('aria-label', `${tName}. ${tDesc}. ${stateLabel}.${permissionState}`);

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
            row.addEventListener('click', async () => {
                row.disabled = true;
                try {
                    const next = !Boolean(popupState.settings[item.key]);
                    await writeSetting(item.key, next);
                    render(popupState.settings, q.value);
                    // render() rebuilds the list, destroying the button the user
                    // just activated — restore focus to the freshly-rendered row
                    // so keyboard users don't get bounced to <body> on every toggle.
                    const refocus = document.querySelector(`.toggle[data-key="${CSS.escape(item.key)}"]`);
                    if (refocus) refocus.focus();
                    void broadcast(item.key, next);
                    showStatus(`${tName} ${next ? t('toggleStateOnLower', 'enabled') : t('toggleStateOffLower', 'disabled')}.`, 'success');
                } catch (error) {
                    console.warn('[Astra Deck popup] Failed to toggle setting:', error);
                    showStatus(formatSettingWriteError(tName, error), 'error', 5200);
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

// storage corruption detector. chrome.storage.local is robust
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
        statKeys.textContent = '0';
        statSize.textContent = '0 B';
        statHidden.textContent = '0';
        statBlocked.textContent = '0';
        statBookmarks.textContent = '0';
        renderHealthBanner(null);
        // a thrown error from chrome.storage.local.get(null) is
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

// storage-size warning banner. Surfaces a polite nudge when
// total chrome.storage.local payload crosses the soft threshold, and a
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
        ? t('storageBannerHardTpl', `Storage at ${sizeText} — consider Reset.`)
        : t('storageBannerSoftTpl', `Storage at ${sizeText} — heading toward the ceiling.`);
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
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tab || !tab.id || !isSupportedInlinePanelUrl(tab.url || '')) {
            featurePerfSection.hidden = true;
            return;
        }
        const response = await new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), 1500);
            try {
                chrome.tabs.sendMessage(tab.id, { type: 'YTKIT_GET_FEATURE_PERF' }, (msg) => {
                    clearTimeout(timer);
                    if (chrome.runtime.lastError) { resolve(null); return; }
                    resolve(msg);
                });
            } catch { clearTimeout(timer); resolve(null); }
        });
        if (!response || response.ok === false || !Array.isArray(response.features)) {
            featurePerfSection.hidden = true;
            return;
        }
        const top = response.features.slice(0, 10);
        featurePerfList.textContent = '';
        if (top.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'feature-perf-empty';
            empty.textContent = 'No features initialized yet.';
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
            featurePerfTotal.textContent = `${response.totalFeatures} feature${response.totalFeatures === 1 ? '' : 's'} measured`;
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

    // v4.47.0 NF10 follow-up: capability-probe chip. Schema entries
    // with a `requires:` array declare runtime browser capabilities
    // (e.g. ['summarizerApi'] for localAiSummary, ['mediaDL'] for the
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
            chip.textContent = 'unavailable';
            chip.title = 'This setting requires a capability not available in this browser: '
                + missing.join(', ')
                + '. Toggling the setting has no effect until the capability becomes available.';
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
    // BUG_REPORT_REDACTED_KEYS list, and chrome.storage.local is
    // origin-scoped (never synced to a Google account).
    if (TRUST_SIGNAL_LOCAL_ONLY_KEYS.has(entry.key)) {
        const trustChip = document.createElement('span');
        trustChip.className = 'so-key-profile-badge so-key-trust-local';
        trustChip.textContent = 'local only';
        trustChip.title = 'This value is stored in chrome.storage.local on this device. '
            + 'It is never synced to a Google account, never sent to Astra Deck servers, '
            + 'and is redacted from the bug-report bundle (Diagnostics → Save).';
        row.appendChild(trustChip);
    }

    const optionalHostChip = createSchemaOptionalHostBadge(entry.key);
    if (optionalHostChip) row.appendChild(optionalHostChip);

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
        const current = settings[entry.key];
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
            const current = settings[entry.key];
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
        const seed = Array.isArray(settings[entry.key]) ? settings[entry.key] : [];
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
            resetBtn.title = `Reset ${entry.key} to default (${describeDefaultForTooltip(entry.defaultValue)})`;
            resetBtn.setAttribute('aria-label',
                `Reset ${entry.key} to default value`);
            resetBtn.addEventListener('click', async () => {
                resetBtn.disabled = true;
                try {
                    await writeSetting(entry.key, entry.defaultValue);
                    showStatus(t('statusPerKeyReset',
                        `${entry.key} reset to default.`), 'ok', 2400);
                    renderSchemaOverview();
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
function isDefaultValue(currentValue, defaultValue) {
    if (currentValue === defaultValue) return true;
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
    'aiSummaryApiKey',
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
// chrome.downloads.download when available so the file lands in the
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
            // v4.47.0 NEW-7: pull the SW lifecycle ring out of the
            // background script. Best-effort — if the SW is non-
            // responsive or the message handler is absent (older
            // build), we still ship the bundle without the ring.
            let swLifecycle = null;
            try {
                const resp = await new Promise((resolve) => {
                    try {
                        chrome.runtime.sendMessage({ type: 'GET_SW_LIFECYCLE' }, (r) => {
                            // Swallow chrome.runtime.lastError so a missing
                            // listener (very old SW) doesn't reject the bundle.
                            void chrome.runtime.lastError;
                            resolve(r || null);
                        });
                    } catch (_) { resolve(null); /* reason: extension context invalid mid-call */ }
                });
                if (resp && Array.isArray(resp.entries)) swLifecycle = resp.entries;
            } catch (_) {
                // reason: SW lifecycle ring is supplemental; bundle ships without it on failure
            }
            const payload = {
                astraDeckBugReport: true,
                schemaVersion: 2,
                exportedAt: new Date().toISOString(),
                extensionVersion: manifestVersion,
                userAgent: (typeof navigator !== 'undefined' && navigator.userAgent) || '',
                capabilities,
                swLifecycle,
                settings: sanitized,
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

// v4.47.0 NF21: first-run welcome card + What's New banner.
//
// Detection signal for "first run" is the absence of FIRST_RUN_SEEN_KEY
// in chrome.storage.local — NOT the absence of SETTINGS_STORAGE_KEY,
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
    } catch (err) {
        console.warn('[Astra Deck popup] first-run surface render failed:', err);
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
            'GitHub-Full profile enabled. The download companion and AI providers are now available.'),
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
    // Apply profile by writing the gating boolean directly. Reuses
    // the existing writeSetting path so the policy-profile resolver
    // sees the change and refreshes the schema overview.
    try {
        if (profile === 'github-full') {
            await writeSetting('githubFullProfile', true);
        } else {
            // store-safe is the default (githubFullProfile=false). Set
            // it explicitly anyway so the user's choice is recorded —
            // matters for the popup overview's profile-badge logic
            // and for any export+import round-trip downstream.
            await writeSetting('githubFullProfile', false);
        }
        await dismissWelcomeCard(`profile-${profile}`);
        // Re-render the overview so any profile-gating badges refresh.
        renderSchemaOverview();
    } catch (err) {
        showStatus(t('statusWelcomeProfileFail',
            'Could not apply profile') + ': ' + err.message, 'error', 4200);
        // Re-enable so the user can retry on failure.
        if (welcomeProfileSafeBtn) welcomeProfileSafeBtn.disabled = false;
        if (welcomeProfileFullBtn) welcomeProfileFullBtn.disabled = false;
        if (welcomeDismissBtn) welcomeDismissBtn.disabled = false;
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
    const fromClause = lastSeen ? ` (from v${lastSeen})` : '';
    whatsNewDetail.textContent = `Updated to v${manifestVersion}${fromClause}. See what changed.`;
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
if (whatsNewDismissBtn) {
    whatsNewDismissBtn.addEventListener('click', () => { void dismissWhatsNew(); });
}
if (whatsNewOpenBtn) {
    whatsNewOpenBtn.addEventListener('click', () => {
        // Anchor pattern matches GitHub's auto-generated heading slugs
        // for CHANGELOG.md '## [Unreleased]' or '## [x.y.z]'. We link
        // to the top of the file because anchor stability across
        // CHANGELOG rewrites is not guaranteed — the user lands on
        // the changelog and scrolls to the top entry.
        const url = CHANGELOG_BASE_URL;
        try {
            if (chrome.tabs?.create) {
                chrome.tabs.create({ url, active: true });
            } else {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
            void dismissWhatsNew();
        } catch (err) {
            console.warn('[Astra Deck popup] whats-new open failed:', err);
        }
    });
}

async function clearDiagnosticLog() {
    // v4.47.0 NF14: applies immediately — the diagnostic log is a ring
    // buffer of runtime errors, not user-authored data. No confirm
    // dialog needed (project policy bans them).
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
    const exportSettings = buildSchemaValidatedExportSettings(mergedSettings);
    return {
        astraDeckBackup: true,
        settings: exportSettings.settings,
        hiddenVideos,
        filteredVideoPosts: hiddenVideos,
        allowedVideos,
        blockedChannels: sanitizeImportedBlockedChannels(allStorage[STORAGE_KEYS.blockedChannels]),
        bookmarks: sanitizeImportedBookmarks(allStorage[STORAGE_KEYS.bookmarks]),
        exportVersion: 4,
        backupSchemaVersion: 1,
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
                'popup-import',
                // Backup-level schema version stamped by buildExportData.
                // Lets the migration chain start from the exporter's
                // version even though schemaOnly exports strip the inner
                // `_settingsVersion` marker.
                { backupSchemaVersion: data.settingsSchemaVersion }
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

// v4.47.0 NF6 (partial): Astra Downloader "Skip for now" recovery.
// ytkit.js's MediaDLManager.showInstallPrompt sets
// `ytkit_mediadl_prompt_dismissed = true` in chrome.storage.local
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
    if (!chrome?.storage?.local) return false;
    return new Promise((resolve) => {
        try {
            chrome.storage.local.get(MEDIADL_DISMISSED_KEY, (items) => {
                if (chrome.runtime.lastError) { resolve(false); return; }
                resolve(items && items[MEDIADL_DISMISSED_KEY] === true);
            });
        } catch (_) {
            // reason: chrome.storage.local unavailable; treat as not dismissed
            resolve(false);
        }
    });
}

async function clearMediadlDismissed() {
    if (!chrome?.storage?.local) return false;
    return new Promise((resolve) => {
        try {
            chrome.storage.local.remove(MEDIADL_DISMISSED_KEY, () => {
                resolve(!chrome.runtime.lastError);
            });
        } catch (_) {
            // reason: chrome.storage.local.remove unavailable; report failure
            resolve(false);
        }
    });
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
                'Could not re-enable Astra Downloader prompts. Open chrome://extensions and reload.'),
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
async function updateYtdlpNow() {
    if (!updateYtdlpButton) return;
    updateYtdlpButton.setAttribute('aria-busy', 'true');
    updateYtdlpButton.disabled = true;
    try {
        // Find any YouTube tab where MediaDLManager is loaded.
        let tabs = [];
        try { tabs = await chrome.tabs.query({ url: YOUTUBE_TAB_URLS }); }
        catch (_) { /* reason: extension suspended or tabs API unavailable */ }
        if (!tabs || tabs.length === 0) {
            showStatus(t('statusUpdateYtdlpNoTab',
                'Open a YouTube tab first — the popup needs it to reach the Astra Downloader.'),
                'error', 5200);
            return;
        }
        const tab = tabs[0];
        const result = await new Promise((resolve) => {
            try {
                chrome.tabs.sendMessage(tab.id, { type: 'YTKIT_UPDATE_YTDLP' }, (r) => {
                    void chrome.runtime.lastError;
                    resolve(r || { ok: false, status: 0, error: 'No response from the YouTube tab.' });
                });
            } catch (_) { resolve({ ok: false, status: 0, error: 'Could not message the YouTube tab.' }); }
        });
        if (result && result.ok) {
            const before = result.version_before || '';
            const after = result.version_after || '';
            // Dynamic content — render directly rather than route through
            // t() because the helper does not interpolate placeholders;
            // a translation key would erase the version delta. "v"-prefix
            // matches the version chip in the popup header so users
            // visually anchor on the same shape.
            const detail = (before && after && before === after)
                ? `yt-dlp already at v${after}`
                : `yt-dlp updated to v${after || '?'}${before ? ` (from v${before})` : ''}`;
            showStatus(detail, 'success', 5200);
        } else {
            const err = (result && (result.error || result.stderr)) || 'Update failed.';
            // Same reasoning — t() would lose the stderr appendix.
            showStatus('yt-dlp update failed — ' + err, 'error', 6200);
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
        let tabs = [];
        try { tabs = await chrome.tabs.query({ url: YOUTUBE_TAB_URLS }); }
        catch (_) { /* reason: extension suspended or tabs API unavailable */ }
        if (!tabs || tabs.length === 0) {
            showStatus('Open a YouTube tab first — the popup needs it to reach the Astra Downloader.', 'error', 5200);
            return;
        }
        const tab = tabs[0];
        const result = await new Promise((resolve) => {
            try {
                chrome.tabs.sendMessage(tab.id, { type: 'YTKIT_UPDATE_COMPANION' }, (r) => {
                    void chrome.runtime.lastError;
                    resolve(r || { ok: false, status: 0, error: 'No response from the YouTube tab.' });
                });
            } catch (_) { resolve({ ok: false, status: 0, error: 'Could not message the YouTube tab.' }); }
        });
        if (result && result.ok) {
            const current = result.current_version || '';
            const latest = result.latest_version || '';
            if (result.update_available === false || result.status === 'current') {
                showStatus(`Astra Downloader already at v${latest || current || '?'}.`, 'success', 5200);
            } else {
                showStatus(`Astra Downloader update ready: v${current || '?'} -> v${latest || '?'}. Restarting Astra Downloader.`, 'success', 7200);
            }
        } else {
            const err = (result && result.error) || 'Update failed.';
            showStatus('Astra Downloader update failed — ' + err, 'error', 7200);
        }
    } finally {
        updateCompanionButton.removeAttribute('aria-busy');
        updateCompanionButton.disabled = false;
    }
}

// v4.47.0 EI2: undo grace period for Reset. The snapshot lives in
// chrome.storage.session — survives popup close/reopen but is wiped
// when the browser quits. That's the right shape for "you misclicked
// 30 seconds ago" while keeping the recovery window bounded; the
// previous behaviour wiped everything with no path back. The undo
// button is auto-shown when a snapshot exists and auto-hidden when
// it's consumed or absent.
const RESET_SNAPSHOT_KEY = '_resetSnapshot';
const undoResetButton = $('#undo-reset-btn');

function sessionStorageAvailable() {
    return !!(chrome && chrome.storage && chrome.storage.session);
}

async function readResetSnapshot() {
    if (!sessionStorageAvailable()) return null;
    return new Promise((resolve) => {
        try {
            chrome.storage.session.get(RESET_SNAPSHOT_KEY, (items) => {
                if (chrome.runtime.lastError) { resolve(null); return; }
                const snap = items && items[RESET_SNAPSHOT_KEY];
                resolve(snap && typeof snap === 'object' ? snap : null);
            });
        } catch (_) {
            // reason: session API may be unavailable in some Firefox versions
            resolve(null);
        }
    });
}

async function writeResetSnapshot(snapshot) {
    if (!sessionStorageAvailable()) return false;
    return new Promise((resolve) => {
        try {
            chrome.storage.session.set({ [RESET_SNAPSHOT_KEY]: snapshot }, () => {
                resolve(!chrome.runtime.lastError);
            });
        } catch (_) {
            // reason: session API write failed; treat as no-snapshot, undo unavailable
            resolve(false);
        }
    });
}

async function clearResetSnapshot() {
    if (!sessionStorageAvailable()) return;
    return new Promise((resolve) => {
        try {
            chrome.storage.session.remove(RESET_SNAPSHOT_KEY, () => resolve());
        } catch (_) {
            // reason: session.remove failure is benign — snapshot evicts on browser close
            resolve();
        }
    });
}

function setUndoResetVisible(visible) {
    if (!undoResetButton) return;
    undoResetButton.hidden = !visible;
}

async function refreshUndoResetVisibility() {
    const snap = await readResetSnapshot();
    setUndoResetVisible(!!snap && Object.keys(snap).length > 0);
}

async function resetAllData() {
    // v4.47.0 NF14: applies immediately. EI2's Undo Reset button
    // already provides the recovery surface — clicking Reset stages a
    // session-scoped snapshot in chrome.storage.session, surfaces the
    // Undo button, and dies with the browser session. Project policy
    // bans confirmation dialogs in favor of this pattern.
    resetButton.setAttribute('aria-busy', 'true');
    resetButton.disabled = true;
    try {
        // Snapshot everything in storage.local BEFORE clearing so an
        // Undo can restore byte-identical. Session storage is the right
        // home — the snapshot must not survive a browser restart (that
        // would let stale snapshots overwrite later real edits) but
        // must survive a popup close/reopen so the user sees the Undo
        // button on the next launch.
        const snapshot = await new Promise((resolve, reject) => {
            try {
                chrome.storage.local.get(null, (items) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(items || {});
                    }
                });
            } catch (err) { reject(err); }
        });
        const snapped = await writeResetSnapshot(snapshot);
        if (!snapped && sessionStorageAvailable()) {
            // Session API exists but the snapshot write failed (e.g. data too
            // large) — abort so we never clear without a recoverable snapshot.
            showStatus(t('statusResetSnapshotFail',
                'Reset aborted — could not stage an undo snapshot (data too large for recoverable reset). Export a backup first.'),
                'error', 6000);
            return;
        }
        // When chrome.storage.session is entirely unavailable (older Firefox),
        // writeResetSnapshot returns false up front and there is no Undo path.
        // Proceed with the reset (the user asked for it, and policy bans
        // confirmation dialogs) but report honestly rather than promising an
        // Undo button that will never appear.
        const undoAvailable = snapped && sessionStorageAvailable();
        await storageClear();
        // Re-stamp the first-run / what's-new sentinels that storageClear()
        // just wiped, so a reset doesn't re-trigger the welcome/onboarding
        // card on the next popup open. Undo is unaffected — the pre-clear
        // snapshot holds the originals and restores them verbatim.
        await storageSet({
            [FIRST_RUN_SEEN_KEY]: true,
            [LAST_SEEN_VERSION_KEY]: (manifestVersion && manifestVersion !== '—') ? manifestVersion : '',
        });
        await renderStorageInfo();
        await loadSettings();
        render(popupState.settings, q.value);
        await refreshUndoResetVisibility();
        showStatus(undoAvailable
            ? t('statusAllDataClearedUndo',
                'All data cleared. Click Undo Reset to restore (until you close the browser).')
            : t('statusAllDataClearedNoUndo',
                'All data cleared. Undo is unavailable on this browser, so this reset cannot be undone.'),
            'success', 6000);
    } catch (error) {
        showStatus(t('statusResetFail', 'Reset failed') + ': ' + error.message, 'error', 4200);
    } finally {
        resetButton.removeAttribute('aria-busy');
        resetButton.disabled = false;
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
        await storageClear();
        await new Promise((resolve, reject) => {
            try {
                chrome.storage.local.set(snap, () => {
                    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                    else resolve();
                });
            } catch (err) { reject(err); }
        });
        await clearResetSnapshot();
        await renderStorageInfo();
        await loadSettings();
        render(popupState.settings, q.value);
        renderDataFlowPanel();
        renderSchemaOverview();
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
    renderLoading();

    try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        updateContext(tab || null);
    } catch {
        updateContext(null);
    }

    void renderStorageInfo();
    // best-effort selector-health snapshot from the active tab.
    // Hides the section if the user isn't on a YouTube page or if the
    // content script doesn't respond in time.
    void renderSelectorHealthDashboard();
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
        registerOptionalHostPermissionListeners();
        void refreshOptionalHostGrantState();
    } catch (error) {
        console.warn('[Astra Deck popup] Failed to load settings:', error);
        render({}, '');
        // Settings unknown — fail closed to the store-safe shape.
        refreshCompanionUpdateVisibility();
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
            // The schema overview consults q.value too — clearing the
            // filter must un-filter the overview, not just the toggles.
            renderSchemaOverview();
        }
    });
    clearSearchButton.addEventListener('click', () => {
        q.value = '';
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
            // v4.23.0: keep the schema overview's counts in sync
            // when settings change from any source — but never blow away
            // a focused inline editor (number/text/JSON), which would
            // discard the user's uncommitted input mid-edit.
            if (!schemaOverviewList || !schemaOverviewList.contains(document.activeElement)) {
                renderSchemaOverview();
            }
        }).catch((error) => {
            console.warn('[Astra Deck popup] Failed to refresh settings:', error);
        });
        void renderStorageInfo();
    };
    if (chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener(onStorageChanged);
        // The popup can be torn down mid-flight (it closes on blur). Remove the
        // listener and cancel the status timer on pagehide so a late storage
        // change can't run render paths against a dying DOM / invalidated
        // extension context.
        window.addEventListener('pagehide', () => {
            try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch (_) { /* reason: extension context may already be invalidated during teardown */ }
            if (popupState.statusTimer) { clearTimeout(popupState.statusTimer); popupState.statusTimer = null; }
        }, { once: true });
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

    exportButton.addEventListener('click', async () => { if (await popupRequirePin()) void exportSettings(); });
    importButton.addEventListener('click', async () => { if (await popupRequirePin()) importFileInput.click(); });
    importFileInput.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        if (file) void importSettings(file);
    });
    resetButton.addEventListener('click', async () => { if (await popupRequirePin()) void resetAllData(); });
    if (undoResetButton) {
        undoResetButton.addEventListener('click', () => { void undoResetAllData(); });
        // Boot visibility: surface the Undo button if a prior reset's snapshot
        // is still in storage.session (e.g. user reset, closed the popup, then
        // reopened it). Best-effort — failure leaves the button hidden which
        // is the safe default.
        void refreshUndoResetVisibility();
    }
    if (reenableMediadlButton) {
        reenableMediadlButton.addEventListener('click', () => { void reenableMediadlPrompts(); });
        // Boot visibility: only show the button if the dismissed flag is
        // currently set in chrome.storage.local. Hidden otherwise — most
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
    if (healthClearBtn) healthClearBtn.addEventListener('click', () => { void clearDiagnosticLog(); });
    // storage-banner Reset shares the same destructive-confirm
    // dialog as the primary Reset button so accidental clicks stay guarded.
    if (storageBannerResetBtn) storageBannerResetBtn.addEventListener('click', () => { void resetAllData(); });
})();
