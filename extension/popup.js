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
    { key: 'githubFullProfile',      group: 'Privacy',      nameKey: 'qt_githubFullProfile_name',     nameFallback: 'GitHub-Full Profile', descKey: 'qt_githubFullProfile_desc',     descFallback: 'Turn on github-full toggles such as Cobalt and AI keys' },
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

// Failure copy. These surfaces used to append `error.message` to their own
// label, which is unactionable for the reader, untranslatable (the appended
// half is always English) and, on the AI credential paths, able to put a
// provider response body on screen. core/failure-copy.js maps the throw into a
// closed set of localized causes that each name a next action; the raw text
// goes to the console diagnostic channel only.
function logFailure(context, error) {
    try {
        const detail = globalThis.YTKitCore?.failureDiagnosticText?.(error)
            || String(error?.message || error);
        console.warn(`[Astra Deck popup] ${context}:`, detail);
    } catch (_) { /* reason: diagnostics must never break the surface reporting them */ }
}

function describeFailureCause(error) {
    const describe = globalThis.YTKitCore?.describeFailure;
    if (typeof describe === 'function') return describe(error, t);
    return t('failureCauseUnknown', 'Something unexpected went wrong. The diagnostic log has the details.');
}

function failureText(context, error, labelKey, labelFallback) {
    logFailure(context, error);
    const label = labelKey ? t(labelKey, labelFallback) : '';
    const withLabel = globalThis.YTKitCore?.describeFailureWithLabel;
    if (typeof withLabel === 'function') return withLabel(label, error, t);
    const cause = describeFailureCause(error);
    return label ? `${label.replace(/[.:]\s*$/, '')}: ${cause}` : cause;
}

// Generated by scripts/i18n-coverage.js from the same measurement the i18n gate
// enforces. Fetched rather than bundled so a stale copy cannot outlive a
// regenerated report, and every failure path leaves the picker exactly as it
// was: a missing percentage is better than a wrong one.
async function annotateLanguageCoverage(sel) {
    let coverage = null;
    try {
        const response = await fetch(ext.runtime.getURL('i18n-coverage.json'));
        if (!response.ok) return;
        coverage = await response.json();
    } catch (_) {
        return; // reason: the picker works without the annotation
    }
    const percent = coverage?.translatedPercent;
    if (!percent || typeof percent !== 'object') return;

    for (const option of sel.querySelectorAll('option')) {
        const locale = option.value;
        if (!locale || locale === 'auto') continue;
        const value = Number(percent[locale]);
        if (!Number.isFinite(value) || value >= 100) continue;
        // Only the shortfall is worth saying. Marking English "100%" would be
        // noise; marking the rest tells a user what they are actually choosing.
        option.textContent = t('languageCoverageTpl', '{language} ({percent}% translated)')
            .replace('{language}', option.textContent)
            .replace('{percent}', String(value));
    }
}

function initLanguageDropdown() {
    const sel = document.getElementById('languageSelect');
    if (!sel) return;
    sel.value = I18N.override || 'auto';
    annotateLanguageCoverage(sel);

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
            autoOpt.textContent = t('languageAutoDetectedTpl', '{label} ({detected})')
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

// The bisect copy said "291 of them" while the catalog defined 432, because
// the number was typed into the sentence. It comes from the registry now, so it
// cannot be wrong again, and the string carries {count} in every locale.
function bisectFeatureCount() {
    const schema = globalThis.__YTKIT_SETTINGS_SCHEMA__;
    const entries = Array.isArray(schema?.SETTINGS_SCHEMA) ? schema.SETTINGS_SCHEMA : [];
    // What the bisect can actually switch: user-facing booleans. Internal keys
    // and numeric or string settings are not features it halves.
    const count = entries.filter((entry) => entry
        && entry.internal !== true
        && entry.type === 'boolean').length;
    return count > 0 ? count : null;
}

function applyBisectFeatureCount(root = document) {
    const count = bisectFeatureCount();
    root.querySelectorAll('[data-i18n="bisectIntro"]').forEach((el) => {
        // No registry, no number: say "your features" rather than a wrong count
        // or a raw placeholder.
        el.textContent = String(el.textContent || '')
            .replace('{count}', count === null ? t('bisectIntroCountUnknown', 'your features') : formatCount(count));
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
    applyBisectFeatureCount(root);
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
// Must stay in step with ytkit.js#RETIRED_SETTING_KEYS. It had drifted:
// lowPowerProfileBackup was retired in v4.62.0 in the monolith and never added
// here, so the popup carried a key the runtime strips.
const RETIRED_SETTING_KEYS = new Set([
    'preferredQuality',
    'useEnhancedBitrate',
    'hideQualityPopup',
    'aiSummaryApiKey',
    'lowPowerProfileBackup',
    'adblockFilterAutoUpdate',
    'adblockFilterUrl',
    'audioEqPreset',
    'autoResumePosition',
    'autoResumeThreshold',
    'autoSkipStillWatching',
    'cinemaMode',
    'defaultPlaybackSpeed',
    'disableSeekPreview',
    'gpuContextRecovery',
    'hideSponsorBlockLabels',
    'mousewheelSpeed',
    'mousewheelVolume',
    'playbackSpeedPresets',
    'skipSilenceSpeed',
    'skipSilenceThreshold',
    'sponsorBlockCategories',
]);
// v4.47.0 NF25: must match ytkit.js#SETTINGS_VERSION and
// settings-meta.json#settingsVersion. The check-versions.js gate
// enforces parity across all three sources; bump in lockstep.
const SETTINGS_VERSION_FALLBACK = 10;
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
    10(settings) {
        let candidate = typeof settings.downloadCobaltInstance === 'string'
            ? settings.downloadCobaltInstance.trim() : '';
        try {
            const parsed = new URL(candidate);
            if (parsed.pathname === '/api/json' && !parsed.search && !parsed.hash) {
                candidate = parsed.origin + '/';
            }
        } catch (_) {
            // reason: the shared validator below owns the stable result
        }
        const described = globalThis.YTKitCore?.describeCobaltInstanceUrl?.(candidate);
        if (described?.ok) {
            settings.downloadCobaltInstance = described.url;
        } else {
            settings.downloadCobaltInstance = '';
            settings.downloadCobaltFallback = false;
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
    },
    _dataFlowGrantRenderToken: 0
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
const filterListPreferences = $('#filter-list-preferences');
const filterListRefreshMode = $('#filter-list-refresh-mode');
const filterListStaleEnabled = $('#filter-list-stale-enabled');
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
const transcriptIndexDetail = $('#transcript-index-detail');
const transcriptIndexRecover = $('#transcript-index-recover');
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
const dataFlowGrants = $('#data-flow-grants');
const dataFlowGrantsCount = $('#data-flow-grants-count');
const dataFlowGrantsList = $('#data-flow-grants-list');

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
const schemaOverviewDiffCount = $('#schema-overview-diff-count');
const schemaOverviewDiffToggle = $('#schema-overview-diff-toggle');
const schemaOverviewDiffCopy = $('#schema-overview-diff-copy');
const featureReportCopy = $('#feature-report-copy');
const bisectPanel = $('#bisect-panel');
const bisectStart = $('#bisect-start');
const bisectStep = $('#bisect-step');
const bisectPrompt = $('#bisect-prompt');
const bisectYes = $('#bisect-yes');
const bisectNo = $('#bisect-no');
const bisectResult = $('#bisect-result');
const bisectCopy = $('#bisect-copy');
const bisectAbort = $('#bisect-abort');
const schemaOverviewDiff = $('#schema-overview-diff');
const schemaOverviewDiffEmpty = $('#schema-overview-diff-empty');
const schemaOverviewDiffList = $('#schema-overview-diff-list');

// v4.24.0: which category rows are currently expanded. Stored in a
// Set so re-renders preserve open state across storage.onChanged
// without a settings round-trip.
//
// v4.29.0: also persisted across popup opens. The expanded set is
// mirrored into ext.storage.local under SCHEMA_OVERVIEW_EXPANDED_KEY
// so the popup remembers which categories the user had open.
const SCHEMA_OVERVIEW_EXPANDED_KEY = 'ytkit_popup_schema_overview_expanded';
const schemaOverviewState = { expanded: new Set(), showChangedOnly: false };

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

// Chrome's i18n has no plural support, so a string that has to say either
// "1 setting" or "3 settings" is a key pair chosen between here.
function tCount(count, key, singular, plural) {
    const n = Number(count);
    return Math.abs(n) === 1 ? t(key + 'One', singular) : t(key + 'Other', plural);
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
    // Resolve renamed keys before anything reads them. A value stored under a
    // key that has since been renamed would otherwise be dropped here and the
    // setting would revert to its default with nothing on screen to say so.
    const aliased = globalThis.__YTKIT_SETTINGS_SCHEMA__?.applySettingAliases?.(settings);
    const source = isPlainObject(aliased?.settings) ? aliased.settings : settings;
    const sanitized = {};
    for (const [key, value] of Object.entries(source)) {
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
        migrated._settingsVersion = Math.max(startingVersion, targetVersion);
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
    // `_settingsVersion` is migration metadata rather than a schema setting.
    // Keep it out of the per-setting validator, then restore the highest stamp
    // after known-key validation so a downgrade cannot re-arm migrations.
    const migratedVersion = normalizeSettingsVersion(migrated._settingsVersion);
    const settingsToValidate = { ...migrated };
    delete settingsToValidate._settingsVersion;
    const validated = validateSettingsForBackupImport(settingsToValidate);
    const skipped = takeLastImportSkippedKeys();
    if (skipped.length) reportImportSkippedKeys(skipped);
    return sanitizeSettingsObject({
        ...defaults,
        ...validated,
        _settingsVersion: Math.max(migratedVersion, normalizeSettingsVersion(settingsVersion))
    });
}

// A future-version backup can carry settings this build has never heard of.
// Naming them is the difference between "27 settings imported" and the user
// knowing that the one setting they cared about did not come across.
function reportImportSkippedKeys(keys) {
    const MAX_NAMED = 6;
    const named = keys.slice(0, MAX_NAMED).join(', ');
    const extra = keys.length > MAX_NAMED ? ` (+${keys.length - MAX_NAMED} more)` : '';
    const message = tCount(keys.length, 'statusImportSkippedKeysTpl',
        '{count} setting from a newer version was skipped: {keys}',
        '{count} settings from a newer version were skipped: {keys}')
        .replace('{count}', String(keys.length))
        .replace('{keys}', named + extra);
    // Held longer than a routine status: the user needs time to read a list.
    showStatus(message, 'info', 9000);
    console.warn('[Astra Deck] settings import skipped unknown keys:', keys.join(', '));
}

function formatSchemaValidationError(prefix, validation) {
    const errors = validation && Array.isArray(validation.errors) ? validation.errors : [];
    const sample = errors.slice(0, 4).join('; ');
    const suffix = errors.length > 4 ? `; +${errors.length - 4} more` : '';
    return `${prefix}: ${sample || 'schema validation failed'}${suffix}`;
}

// Names of settings dropped by the most recent import, so the caller can tell
// the user WHICH settings did not survive rather than only how many.
let lastImportSkippedKeys = [];

function takeLastImportSkippedKeys() {
    const keys = lastImportSkippedKeys;
    lastImportSkippedKeys = [];
    return keys;
}

function validateSettingsForBackupImport(settings) {
    lastImportSkippedKeys = [];
    const policy = ensurePolicyProfile();
    if (!policy || typeof policy.validateSettingsSnapshot !== 'function') {
        return sanitizeSettingsObject(settings);
    }
    // A backup from a newer build may contain settings this build does not
    // know. Import every validated key and drop only the unknown ones -- but
    // record their names, because an aggregate count cannot tell a user
    // whether the setting they cared about survived. Type-invalid known keys
    // remain a hard rejection.
    const validation = policy.validateSettingsSnapshot(settings, { dropUnknown: true });
    if (!validation.ok) {
        throw new Error(formatSchemaValidationError('Settings import rejected', validation));
    }
    if (Array.isArray(validation.skippedKeys) && validation.skippedKeys.length) {
        lastImportSkippedKeys = validation.skippedKeys.slice();
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
        // A backup must never be impossible to take. This snapshot came out of
        // this browser's own storage, so a value that fails the schema is a local
        // state to record and repair, not an attack to refuse. It is defaulted and
        // named in defaultedKeys, which the export summary already reports. Import
        // keeps the hard rejection: that data comes from somewhere else.
        const validation = policy.validateSettingsSnapshot(snapshot.settings, { repairInvalid: true });
        if (!validation.ok) {
            throw new Error(formatSchemaValidationError('Settings export rejected', validation));
        }
        snapshot.settings = sanitizeSettingsObject(validation.settings);
        if (Array.isArray(validation.repairedKeys) && validation.repairedKeys.length) {
            snapshot.defaultedKeys = [
                ...(Array.isArray(snapshot.defaultedKeys) ? snapshot.defaultedKeys : []),
                ...validation.repairedKeys.map((item) => item.key)
            ];
        }
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

function getManifestRequiredHostPermissions() {
    try {
        const declared = ext?.runtime?.getManifest?.().host_permissions || [];
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

function createOptionalHostPermissionHelper() {
    const factory = window.YTKitCore && window.YTKitCore.createOptionalHostPermissions;
    return typeof factory === 'function' ? factory() : null;
}

function getConfiguredFilterListDescriptor(settings = popupState.settings) {
    const describe = window.YTKitCore?.describeRemoteListUrl;
    const configured = typeof settings?.hideVideosFilterListUrl === 'string'
        ? settings.hideVideosFilterListUrl
        : '';
    return typeof describe === 'function' ? describe(configured) : { ok: false };
}

function getConfiguredCobaltDescriptor(settings = popupState.settings) {
    const describe = window.YTKitCore?.describeCobaltInstanceUrl;
    const configured = typeof settings?.downloadCobaltInstance === 'string'
        ? settings.downloadCobaltInstance
        : '';
    return typeof describe === 'function' ? describe(configured) : { ok: false, reason: 'scope-service-unavailable' };
}

function getSpecificDataFlowDescriptor(entry, settings = popupState.settings) {
    if (entry?.specificOriginRequired !== true) return null;
    if (entry.requiredByFeatures?.includes('downloadCobaltFallback')) {
        return getConfiguredCobaltDescriptor(settings);
    }
    if (entry.requiredByFeatures?.includes('hideVideosFilterListUrl')) {
        return getConfiguredFilterListDescriptor(settings);
    }
    return null;
}

function getDynamicOptionalHostsForSetting(key, declaredSet, profile, settings) {
    if (profile !== 'github-full'
        || (key !== 'downloadCobaltFallback' && key !== 'downloadCobaltInstance')) return [];
    const broadPattern = window.YTKitCore?.REMOTE_LIST_HOST_PATTERN || 'https://*/*';
    if (!declaredSet.has(broadPattern)) return [];
    const described = getConfiguredCobaltDescriptor(settings);
    return described.ok ? [described.originPattern] : [];
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
        if (entry.specificOriginRequired === true) continue;
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
    const dynamic = getDynamicOptionalHostsForSetting(
        key,
        declaredSet,
        profile,
        options.settings || popupState.settings
    );
    if (dynamic.length) return dynamic;
    if (options.directOnly) {
        return getDirectOptionalHostsForSetting(key, declaredSet, profile);
    }
    return uniqueOptionalOrigins(core.getOptionalHostPermissionsForFeature(key, { profile }))
        .filter((origin) => declaredSet.has(origin));
}

async function requestOptionalHostOrigins(origins) {
    origins = uniqueOptionalOrigins(origins);
    if (!origins.length) return true;
    const helper = createOptionalHostPermissionHelper();
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
    if (key === 'downloadCobaltInstance') {
        const candidateSettings = { ...(popupState.settings || {}), downloadCobaltInstance: value };
        const described = getConfiguredCobaltDescriptor(candidateSettings);
        if (!described.ok && (String(value || '').trim()
            || popupState.settings?.downloadCobaltFallback === true)) {
            const error = new Error(t('dlCobaltInstanceRequired',
                'Configure a self-hosted Cobalt HTTPS origin in the toolbar popup Settings overview, then grant access to that site.'));
            error.code = 'COBALT_INSTANCE_INVALID';
            throw error;
        }
        if (popupState.settings?.downloadCobaltFallback === true && described.ok) {
            return requestOptionalHostOrigins(getDeclaredOptionalHostsForSetting(key, { settings: candidateSettings }));
        }
        return true;
    }
    if (key === 'downloadCobaltFallback' && value === true) {
        const described = getConfiguredCobaltDescriptor();
        if (!described.ok) {
            const error = new Error(t('dlCobaltInstanceRequired',
                'Configure a self-hosted Cobalt HTTPS origin in the toolbar popup Settings overview, then grant access to that site.'));
            error.code = 'COBALT_INSTANCE_INVALID';
            throw error;
        }
    }
    if (value !== true) return true;
    return requestOptionalHostOrigins(getDeclaredOptionalHostsForSetting(key));
}

function isOptionalHostPermissionError(error) {
    return error?.code === 'OPTIONAL_HOST_PERMISSION_DENIED'
        || /optional host permission|host access/i.test(error?.message || '');
}

function isCobaltInstanceError(error) {
    return error?.code === 'COBALT_INSTANCE_INVALID';
}

function formatSettingWriteError(name, error) {
    if ((isOptionalHostPermissionError(error) || isCobaltInstanceError(error)) && error?.message) {
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
    const specific = getSpecificDataFlowDescriptor(entry);
    const permission = entry.specificOriginRequired === true
        ? (specific?.ok ? specific.originPattern : '')
        : entry.optionalManifestPermission;
    return !permission || popupState._optionalHostGrantState.missingOrigins.has(permission)
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
    const helper = createOptionalHostPermissionHelper();
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
    const helper = createOptionalHostPermissionHelper();
    if (!helper) return;
    helper.onAdded(() => {
        void refreshOptionalHostGrantState().finally(() => renderDataFlowPanel());
    });
    helper.onRemoved(() => {
        void refreshOptionalHostGrantState({ notify: true }).finally(() => renderDataFlowPanel());
    });
}

async function revokeRuntimeOptionalHostOrigin(originPattern) {
    const describePattern = window.YTKitCore?.describeRemoteListOriginPattern;
    const described = typeof describePattern === 'function'
        ? describePattern(originPattern)
        : { ok: false };
    if (!described.ok) {
        return { ok: false, removed: false, code: 'INVALID_ORIGIN_PATTERN', hostname: '' };
    }
    if (getManifestRequiredHostPermissions().includes(described.originPattern)) {
        return {
            ok: true,
            removed: false,
            required: true,
            hostname: described.hostname
        };
    }
    const helper = createOptionalHostPermissionHelper();
    if (!helper || typeof helper.getAll !== 'function' || typeof helper.remove !== 'function') {
        return {
            ok: false,
            removed: false,
            code: 'PERMISSIONS_API_UNAVAILABLE',
            hostname: described.hostname
        };
    }
    try {
        const snapshot = await helper.getAll();
        const grantedOrigins = uniqueOptionalOrigins(snapshot?.origins);
        if (!grantedOrigins.includes(described.originPattern)) {
            return { ok: true, removed: false, hostname: described.hostname };
        }
        const removed = await helper.remove([described.originPattern]);
        if (!removed) {
            return {
                ok: false,
                removed: false,
                code: 'PERMISSION_REMOVE_REFUSED',
                hostname: described.hostname
            };
        }
        await refreshOptionalHostGrantState({ render: false });
        return { ok: true, removed: true, hostname: described.hostname };
    } catch (error) {
        console.warn('[Astra Deck popup] Optional host revoke failed:', error);
        return {
            ok: false,
            removed: false,
            code: 'PERMISSION_REMOVE_FAILED',
            hostname: described.hostname,
            error: error?.message || String(error)
        };
    }
}

function isRuntimeOptionalOriginStillNeeded(settings, originPattern) {
    if (typeof originPattern !== 'string' || !originPattern) return false;
    const filterList = getConfiguredFilterListDescriptor(settings);
    if (filterList.ok && filterList.originPattern === originPattern) return true;
    const cobalt = getConfiguredCobaltDescriptor(settings);
    return settings?.downloadCobaltFallback === true
        && cobalt.ok
        && cobalt.originPattern === originPattern;
}

async function reconcileFilterListGrantTransition(previousSettings, nextSettings) {
    const previous = getConfiguredFilterListDescriptor(previousSettings);
    const next = getConfiguredFilterListDescriptor(nextSettings);
    if (!previous.ok
        || previous.originPattern === (next.ok ? next.originPattern : '')
        || isRuntimeOptionalOriginStillNeeded(nextSettings, previous.originPattern)) {
        return { ok: true, removed: false, hostname: previous.ok ? previous.hostname : '' };
    }
    return revokeRuntimeOptionalHostOrigin(previous.originPattern);
}

async function reconcileCobaltGrantTransition(previousSettings, nextSettings) {
    const previous = getConfiguredCobaltDescriptor(previousSettings);
    const next = getConfiguredCobaltDescriptor(nextSettings);
    const wasEnabled = previousSettings?.downloadCobaltFallback === true;
    const isEnabled = nextSettings?.downloadCobaltFallback === true;
    if (!previous.ok || (!wasEnabled && !isEnabled)
        || (isEnabled && previous.originPattern === (next.ok ? next.originPattern : ''))
        || isRuntimeOptionalOriginStillNeeded(nextSettings, previous.originPattern)) {
        return { ok: true, removed: false, hostname: previous.ok ? previous.hostname : '' };
    }
    return revokeRuntimeOptionalHostOrigin(previous.originPattern);
}

function formatPermissionCleanupFailure(cleanup) {
    if (cleanup?.ok !== false) return '';
    return t('dataFlowGrantRemoveFailedTpl', 'Could not remove site access for {host}.')
        .replace('{host}', cleanup.hostname || t('optionalHostPrevious', 'the previous host'));
}

async function writeSetting(key, value) {
    const previousSettings = popupState.settings;
    await requestOptionalHostsForSetting(key, value);
    const result = await getSettingsMutationController().mutate(key, value);
    if (!result.ok) {
        const error = new Error(result.error?.message || `Could not update ${key}.`);
        error.code = result.error?.code || 'SETTING_WRITE_FAILED';
        error.result = result;
        throw error;
    }
    popupState.settings = result.settings;
    let permissionCleanup = { ok: true, removed: false, hostname: '' };
    if (key === 'hideVideosFilterListUrl') {
        permissionCleanup = await reconcileFilterListGrantTransition(previousSettings, result.settings);
    } else if (key === 'downloadCobaltFallback' || key === 'downloadCobaltInstance') {
        permissionCleanup = await reconcileCobaltGrantTransition(previousSettings, result.settings);
    }
    await refreshOptionalHostGrantState({ render: false });
    return { ...result, permissionCleanup };
}

async function replaceSettings(settings) {
    const previousSettings = popupState.settings;
    const result = await getSettingsMutationController().replace(settings);
    if (!result.ok) {
        const error = new Error(result.error?.message || 'Could not replace settings.');
        error.code = result.error?.code || 'SETTING_WRITE_FAILED';
        error.result = result;
        throw error;
    }
    popupState.settings = result.settings;
    const filterListCleanup = await reconcileFilterListGrantTransition(
        previousSettings,
        result.settings
    );
    const cobaltCleanup = await reconcileCobaltGrantTransition(previousSettings, result.settings);
    await refreshOptionalHostGrantState({ render: false });
    return {
        ...result,
        permissionCleanup: filterListCleanup.ok === false ? filterListCleanup : cobaltCleanup
    };
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
            note: t('contextNoteInlinePanel',
                'Open the settings workspace on this tab. Quick toggles apply immediately.'),
            openLabel: t('openFullSettings', 'Open Workspace'),
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
    // Errors must interrupt the screen reader; routine successes/info stay
    // polite. (The #status region is aria-live="polite" by default.)
    // The politeness has to be in place BEFORE the text changes: the mutation
    // is what queues the announcement, so setting role="alert" afterwards
    // applied it to the NEXT message and left this error polite. In the other
    // direction a routine message that followed an error inherited assertive
    // and interrupted whatever the reader was on.
    if (normalizedType === 'error') {
        statusBanner.setAttribute('role', 'alert');
        statusBanner.setAttribute('aria-live', 'assertive');
    } else {
        statusBanner.removeAttribute('role');
        statusBanner.setAttribute('aria-live', 'polite');
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
    if (element.offsetParent === null && getComputedStyle(element).position !== 'fixed') return false;
    return true;
}

function getFocusableElements(root = document.body) {
    return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isVisibleFocusableElement);
}

function getActiveFocusRoot() {
    // v4.47.0 NF14 retired the confirm-shell modal in favor of immediate-apply +
    // undo toasts, so this always returns document.body now.
    //
    // That reads like a trap with nothing to trap, and a 2026-08-14 audit logged
    // it as vestigial — it is not. popup.html declares `role="dialog"
    // aria-modal="true"` on <body>: the popup IS the dialog, and a modal dialog
    // owes assistive technology a real focus cycle. The Tab handling below is
    // what makes that declaration true, and hardening.test.js pins it
    // deliberately. Removing it would leave a modal that lies.
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

async function sendPanelOpenMessage(tabId, settingKey = '') {
    // The panel-open ack must distinguish "no receiver in the tab" (reject →
    // open a fresh tab) from "receiver busy hydrating" (timeout → trust
    // delivery). Collapsing both to a 2s null previously opened a duplicate
    // youtube.com tab whenever a watch page blocked the main thread past the
    // ack window.
    if (!tabId) return false;
    let timeoutId;
    try {
        const response = await Promise.race([
            callExtensionApi(ext?.tabs, 'sendMessage', tabId, settingKey
                ? { type: PANEL_OPEN_MESSAGE, settingKey }
                : { type: PANEL_OPEN_MESSAGE }),
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
        showStatus(failureText('ai-credential-status', error, 'aiCredentialStatusError', 'Credential status unavailable.'), 'error', 3600);
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
        showStatus(failureText('ai-credential-save', error, 'aiCredentialSaveFailed', 'Credential could not be saved.'), 'error', 4200);
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
        // No undo is possible here and none can be faked: the stored secret is
        // never re-displayable (popup.html marks the field write-only), so the
        // popup does not hold a copy to restore. Every other destructive action
        // in this surface restores on undo; the one that cannot must say so
        // rather than reading like the reversible ones.
        showStatus(
            t('aiCredentialDeleted', 'AI credential deleted. This can\'t be undone, so re-enter the key to use AI features again.'),
            'success',
            5200
        );
        await refreshAiCredentialManager();
    } catch (error) {
        showStatus(failureText('ai-credential-delete', error, 'aiCredentialDeleteFailed', 'Credential could not be deleted.'), 'error', 4200);
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
    // The i18n message-name grammar allows only [A-Za-z0-9_], so a hyphenated
    // risk band can never resolve as a key. Normalize before lookup, otherwise
    // `local-companion` and `store-risk` render English in every locale
    // forever and adding keys later would silently fix only half the bands.
    const riskKeySuffix = String(entry.risk || '').replace(/-/g, '_');
    span.title = t('toggleRiskTooltip_' + riskKeySuffix,
        ({
            api:               'Talks to an external API server',
            'local-companion': 'Talks to the local Astra Downloader (127.0.0.1)',
            experimental:      'Experimental feature; behaviour may change',
            'store-risk':      'Higher review-policy sensitivity. GitHub-full only.'
        }[entry.risk]) || ('Risk band: ' + entry.risk));
    span.setAttribute('aria-label', span.title);
    return span;
}

function render(settings, filter) {
    list.setAttribute('aria-busy', 'false');
    syncFilterListUrlInput(settings);
    void refreshFilterListStatus();
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

// The five cards ship a bare em dash in the markup and used to get one back
// whenever storage was unavailable, so the first thing the popup showed was
// five dashes and the failure state was indistinguishable from "not loaded
// yet". A dash is not a number and it is not an explanation.
const STAT_ELEMENTS = () => [statKeys, statSize, statHidden, statBlocked, statBookmarks];

function setStatCards(values) {
    const elements = STAT_ELEMENTS();
    for (let index = 0; index < elements.length; index += 1) {
        const element = elements[index];
        if (!element) continue;
        element.textContent = values[index];
        delete element.dataset.state;
        element.removeAttribute('title');
    }
}

function setStatCardsUnavailable() {
    // spStatUnavailable already exists in the catalog for exactly this and was
    // unused on this surface. The cards are narrow, so the word is also the
    // title: an ellipsis on its own would be another glyph with no meaning.
    const copy = t('spStatUnavailable', 'Unavailable');
    for (const element of STAT_ELEMENTS()) {
        if (!element) continue;
        element.textContent = copy;
        element.dataset.state = 'unavailable';
        element.title = copy;
    }
}

// The transcript store, which the storage cards above cannot see.
//
// Those numbers come from extension-local storage. The transcript index is in
// an IndexedDB under the YouTube origin, so the largest thing Astra Deck writes
// to disk had no readout on the one surface a user goes to for storage — and a
// store with unreadable records in it looked exactly like a large one.
//
// It has to be asked for through a YouTube tab, because that is where the
// database is. When there is not one, say so rather than showing nothing.
let transcriptRecoveryBusy = false;

function setTranscriptIndexDetail(text) {
    if (transcriptIndexDetail) transcriptIndexDetail.textContent = text;
}

async function renderTranscriptIndexUsage() {
    if (!transcriptIndexDetail) return;
    if (transcriptIndexRecover) transcriptIndexRecover.hidden = true;
    let stats;
    try {
        const { response } = await sendPersistedDataMessage({ action: 'stats' });
        stats = response;
    } catch (error) {
        setTranscriptIndexDetail(isPersistedDataUnavailable(error)
            ? t('transcriptStoreNoTab', 'Transcript store: open a YouTube tab to measure it.')
            : t('transcriptStoreFailed', 'Transcript store: could not be measured.'));
        return;
    }

    const records = Number(stats?.records) || 0;
    const corrupt = Number(stats?.corrupt) || 0;
    const bytes = Number(stats?.bytes) || 0;
    if (!records) {
        setTranscriptIndexDetail(t('transcriptStoreEmpty', 'Transcript store: empty.'));
        return;
    }

    const size = formatBytes(bytes);
    if (corrupt > 0) {
        setTranscriptIndexDetail(tCount(corrupt, 'transcriptStoreDamagedTpl',
            'Transcript store: {size} across {count} video, {corrupt} of them unreadable.',
            'Transcript store: {size} across {count} videos, {corrupt} of them unreadable.')
            .replace('{size}', size)
            .replace('{count}', formatCount(records))
            .replace('{corrupt}', formatCount(corrupt)));
        if (transcriptIndexRecover) transcriptIndexRecover.hidden = false;
        return;
    }
    setTranscriptIndexDetail(tCount(records, 'transcriptStoreOkTpl',
        'Transcript store: {size} across {count} video.',
        'Transcript store: {size} across {count} videos.')
        .replace('{size}', size)
        .replace('{count}', formatCount(records)));
}

// Export first, clear second, and never the second without the first.
//
// A damaged store is the one case where clearing is the only way out, and it
// is also the case where whatever is still readable is the only copy. So the
// readable records are written to a file the user has, and the clear only runs
// once that has actually happened.
async function recoverTranscriptIndex() {
    if (transcriptRecoveryBusy) return;
    transcriptRecoveryBusy = true;
    if (transcriptIndexRecover) transcriptIndexRecover.disabled = true;
    try {
        let exported;
        try {
            exported = await readAllTranscriptRecords({ allowUnavailable: true });
        } catch (error) {
            showStatus(failureText('transcript-recovery-export', error,
                'transcriptStoreExportFailed',
                'Could not export the transcript store. Nothing was cleared.'), 'error', 5000);
            return;
        }
        if (!exported.available) {
            showStatus(t('transcriptStoreNoTab', 'Transcript store: open a YouTube tab to measure it.'), 'info', 4000);
            return;
        }

        const records = Array.isArray(exported.records) ? exported.records : [];
        try {
            downloadTranscriptRecovery(records);
        } catch (error) {
            showStatus(failureText('transcript-recovery-download', error,
                'transcriptStoreExportFailed',
                'Could not export the transcript store. Nothing was cleared.'), 'error', 5000);
            return;
        }

        try {
            await sendPersistedDataMessage({ action: 'clear' }, exported.origin);
        } catch (error) {
            showStatus(failureText('transcript-recovery-clear', error,
                'transcriptStoreClearFailed',
                'The export was saved, but the store could not be cleared.'), 'error', 5000);
            return;
        }
        showStatus(tCount(records.length, 'transcriptStoreRecoveredTpl',
            'Exported {count} readable transcript and cleared the store.',
            'Exported {count} readable transcripts and cleared the store.')
            .replace('{count}', formatCount(records.length)), 'success', 4200);
        await renderTranscriptIndexUsage();
    } finally {
        transcriptRecoveryBusy = false;
        if (transcriptIndexRecover) transcriptIndexRecover.disabled = false;
    }
}

function downloadTranscriptRecovery(records) {
    const payload = JSON.stringify({
        kind: 'astra-deck-transcript-recovery',
        exportedAt: new Date().toISOString(),
        records
    }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    try {
        const link = document.createElement('a');
        link.href = url;
        link.download = 'astra-deck-transcripts-recovery.json';
        link.click();
    } finally {
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
}

async function renderStorageInfo() {
    try {
        const allStorage = await callExtensionApi(ext?.storage?.local, 'get', null);
        const summary = summarizeStorage(allStorage);
        setStatCards([
            formatCount(summary.keys),
            summary.sizeText,
            formatCount(summary.hiddenVideos),
            formatCount(summary.blockedChannels),
            formatCount(summary.bookmarks)
        ]);
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
        // A read that failed for some other reason genuinely found nothing, so
        // zero is the truthful answer there. Storage being absent entirely is
        // a different statement and gets said out loud, alongside the recovery
        // copy showStatus already carries below.
        if (storageUnavailable) setStatCardsUnavailable();
        else setStatCards(['0', '0 B', '0', '0', '0']);
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
            detail: describeFailureCause(error)
        }]);
        showStatus(failureText('storage-read', error, 'statusStorageReadFail', 'Storage read failed'), 'error', 4200);
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
            ? t('settingsSyncOn', 'On. Preferences and blocklists sync through your browser account.')
            : t('settingsSyncOff', 'Off. This device only.');
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
        showStatus(failureText('settings-sync-undo', error, 'settingsSyncUndoFailed', 'Could not undo the last browser sync.'), 'error', 4600);
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
            t('storageBannerCorruptionTpl', 'Storage data is malformed. Choose Reset to recover.')
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
    const contributors = parts.length ? ': ' + parts.join(' · ') : '';
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
            const youtubeBuild = response.youtubeClientVersion
                ? t('selectorHealthYouTubeBuildTpl', 'YouTube {version}')
                    .replace('{version}', String(response.youtubeClientVersion))
                : '';
            // The raw asset error is a fetch/parse throw. Showing it here put
            // untranslated exception text in the popup; the localized cause
            // sentence names a next action instead, and the raw text goes to
            // the diagnostic channel.
            if (asset.lastError) logFailure('selector-asset', asset.lastError);
            // raw-error-copy: the raw text only decides whether a cause line is
            // shown at all; describeFailureCause supplies every rendered character.
            const assetCause = asset.lastError ? describeFailureCause(asset.lastError) : '';
            // The opt-in schedule, when it is on. "Checked" is the last
            // attempt and "updated" the last one that changed anything, and
            // they differ whenever the asset was already current.
            const schedule = response.selectorAutoRefresh || {};
            let scheduleLabel = '';
            if (schedule.enabled) {
                const checked = schedule.lastCheckedAt
                    ? t('selectorAutoRefreshCheckedTpl', 'auto-checked {age}')
                        .replace('{age}', formatFeatureHealthAge(schedule.lastCheckedAt, Date.now()))
                    : t('selectorAutoRefreshNeverChecked', 'auto-refresh on, no check yet');
                const updated = schedule.lastSuccessAt
                    ? t('selectorAutoRefreshUpdatedTpl', 'last update {age}')
                        .replace('{age}', formatFeatureHealthAge(schedule.lastSuccessAt, Date.now()))
                    : '';
                scheduleLabel = [checked, updated].filter(Boolean).join(', ');
            }
            selectorHealthAsset.textContent = [assetLabel, youtubeBuild, scheduleLabel, assetCause].filter(Boolean).join(' · ');
            selectorHealthAsset.dataset.state = response.criticalCanary?.status === 'degraded'
                ? 'rollback'
                : (asset.status || 'unknown');
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
            if (selectorHealthAsset) selectorHealthAsset.textContent = [refreshFailedLabel, describeFailureCause(response?.error)].filter(Boolean).join(' ');
            return;
        }
        await renderSelectorHealthDashboard();
    } catch (error) {
        logFailure('selector-health-refresh', error);
        if (selectorHealthAsset) selectorHealthAsset.textContent = [refreshFailedLabel, describeFailureCause(error)].filter(Boolean).join(' ');
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
// The copy-status lines are aria-live regions, and unlike showStatus they had
// no auto-clear: a "Copied." sat there for the popup's lifetime, so two
// dashboards could show stale results at once and the next update announced
// them alongside the new one. Pending states are exempt, since the work they
// describe can outlast the timer.
const COPY_STATUS_CLEAR_MS = 4000;
const _copyStatusTimers = new WeakMap();
function makeCopyStatusSetter(el) {
    return (msg, { pending = false } = {}) => {
        if (!el) return;
        const queued = _copyStatusTimers.get(el);
        if (queued) {
            clearTimeout(queued);
            _copyStatusTimers.delete(el);
        }
        el.textContent = msg;
        if (!msg || pending) return;
        _copyStatusTimers.set(el, setTimeout(() => {
            el.textContent = '';
            _copyStatusTimers.delete(el);
        }, COPY_STATUS_CLEAR_MS));
    };
}

let _selectorHealthCopyInFlight = false;
async function copySelectorHealthReport() {
    if (_selectorHealthCopyInFlight) return;
    if (!selectorHealthCopyBtn) return;
    const setStatus = makeCopyStatusSetter(selectorHealthCopyStatus);
    _selectorHealthCopyInFlight = true;
    selectorHealthCopyBtn.disabled = true;
    setStatus(t('selectorHealthCopyPending', 'Building report…'), { pending: true });
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
            setStatus(t('selectorHealthCopyNoSnap', 'No snapshot available. The page may still be loading.'));
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
                youtubeClientVersion: response.youtubeClientVersion,
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
                youtubeClientVersion: response.youtubeClientVersion || null,
                criticalCanary: response.criticalCanary || null,
                selectorAsset: response.selectorAsset || null
            }, null, 2);
        }
        // navigator.clipboard works in popup contexts because the popup
        // counts as a user-activated focused surface. Catch the
        // permission-denied path explicitly so we can fall back to the
        // ancient textarea-execCommand approach without a console warning
        // bubbling out of the .catch.
        setStatus(await copyTextToClipboard(payload)
            ? t('selectorHealthCopyDone', 'Copied. Paste it into a GitHub issue.')
            : t('selectorHealthCopySaveFallback', 'Couldn’t copy to the clipboard. Try again, or use the Diagnostics Save button to download the report instead.'));
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

// Connectivity.
//
// Nothing in the extension observed it before v4.88.3: `navigator.onLine` was
// read in exactly one place (core/failure-copy.js, to pick a cause sentence
// after a request had already failed) and no file anywhere registered an
// `online` or `offline` listener. So every network-backed surface showed a
// generic failure with no cause, and nothing re-checked when the connection
// came back — the user had to reopen the popup to find out.
function isDeviceOffline() {
    try {
        return typeof navigator !== 'undefined' && navigator.onLine === false;
    } catch (_) {
        // reason: navigator is absent in the test harness
        return false;
    }
}

function offlineNoticeText() {
    return t('failureCauseOffline', 'Your device looks offline. Reconnect, then try again.');
}

// Renders (or clears) the connectivity notice on a health section. The notice
// element is created on demand so the markup carries no dead node.
function setConnectivityNotice(section, offline) {
    if (!section) return null;
    let notice = section.querySelector('.connectivity-notice');
    if (!offline) {
        notice?.remove();
        section.removeAttribute('data-offline');
        return null;
    }
    if (!notice) {
        notice = document.createElement('p');
        notice.className = 'connectivity-notice';
        notice.setAttribute('role', 'status');
        notice.setAttribute('aria-live', 'polite');
        section.insertBefore(notice, section.firstChild);
    }
    notice.textContent = offlineNoticeText();
    section.dataset.offline = 'true';
    return notice;
}

function renderConnectivityState() {
    const offline = isDeviceOffline();

    // The banner is the surface a user actually sees. Both health sections
    // ship `hidden`, and #external-health is unhidden only after a live
    // content script answers — which a dropped connection is what prevents —
    // so a notice drawn only into them was invisible in exactly the case it
    // exists for.
    const banner = $('#connectivity-banner');
    const detail = $('#connectivity-banner-detail');
    if (banner) banner.hidden = !offline;
    if (detail) detail.textContent = offline ? offlineNoticeText() : '';

    // Resolved here rather than closed over: the feature-health binding is
    // declared further down this file, and a call during module evaluation
    // would hit its temporal dead zone. These mark the sections for styling
    // and for anyone who has them open; the banner carries the message.
    setConnectivityNotice($('#external-health'), offline);
    setConnectivityNotice($('#feature-health'), offline);
    return offline;
}

// Re-check provider health the moment the connection returns, so a user who
// reconnects with the popup open sees live state instead of a stale outage.
function installConnectivityWatch() {
    if (typeof globalThis.addEventListener !== 'function') return () => {};
    const onOffline = () => { renderConnectivityState(); };
    const onOnline = () => {
        renderConnectivityState();
        void renderExternalApiHealthDashboard();
    };
    globalThis.addEventListener('offline', onOffline);
    globalThis.addEventListener('online', onOnline);
    renderConnectivityState();
    return () => {
        globalThis.removeEventListener('offline', onOffline);
        globalThis.removeEventListener('online', onOnline);
    };
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
        renderConnectivityState();
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
    const setStatus = makeCopyStatusSetter(externalHealthCopyStatus);
    _externalHealthCopyInFlight = true;
    externalHealthCopyBtn.disabled = true;
    setStatus(t('externalHealthCopyPending', 'Building report…'), { pending: true });
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
        setStatus(await copyTextToClipboard(payload)
            ? t('externalHealthCopyDone', 'Copied. Paste it into a GitHub issue.')
            : t('externalHealthCopyFail', 'Could not copy.'));
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

// v4.68.0 — feature health. One round-trip to the active tab for the
// joined per-feature report (built content-script side in
// buildFeatureHealthPayload, because that world owns all four inputs),
// rendered worst-first. Unlike the diagnostics dashboards below this
// panel is not gated on a debug setting: the whole point is that a user
// who thinks "something broke" gets an answer without knowing which
// toggle exposes the telemetry.
const featureHealthSection = $('#feature-health');
const featureHealthList = $('#feature-health-list');
const featureHealthLine = $('#feature-health-line');

// How many rows the list renders. Healthy features are summarised by the
// count in the header; enumerating all of them would bury the problems
// and make the popup scroll for pages.
const FEATURE_HEALTH_MAX_ROWS = 25;

function formatFeatureHealthAge(at, now) {
    if (!Number.isFinite(at) || at <= 0) return '';
    const ms = Math.max(0, now - at);
    if (ms < 60000) return t('featureHealthAgeSecondsTpl', '{count}s ago').replace('{count}', String(Math.max(1, Math.round(ms / 1000))));
    if (ms < 3600000) return t('featureHealthAgeMinutesTpl', '{count}m ago').replace('{count}', String(Math.round(ms / 60000)));
    if (ms < 86400000) return t('featureHealthAgeHoursTpl', '{count}h ago').replace('{count}', String(Math.round(ms / 3600000)));
    return t('featureHealthAgeDaysTpl', '{count}d ago').replace('{count}', String(Math.round(ms / 86400000)));
}

function featureHealthStatusLabel(status) {
    if (status === 'failed') return t('featureHealthStatusFailed', 'Failed');
    if (status === 'degraded') return t('featureHealthStatusDegraded', 'Degraded');
    if (status === 'idle') return t('featureHealthStatusIdle', 'Not active here');
    return t('featureHealthStatusHealthy', 'Working');
}

function renderFeatureHealthRows(report) {
    const now = Date.now();
    featureHealthList.textContent = '';
    const rows = Array.isArray(report.features) ? report.features : [];
    // Rows arrive worst-first from the builder, so a plain slice shows
    // every problem before any healthy row. A completely healthy install
    // still lists real feature names rather than a bare "all good" claim
    // the user has no way to check.
    const shown = rows.slice(0, FEATURE_HEALTH_MAX_ROWS);
    if (shown.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'feature-health-empty';
        empty.textContent = t('featureHealthEmpty', 'No enabled features sampled yet.');
        featureHealthList.appendChild(empty);
        return;
    }
    for (const row of shown) {
        const li = document.createElement('li');
        li.className = 'feature-health-row';
        li.dataset.status = row.status;

        const name = document.createElement('span');
        name.className = 'fh-name';
        name.textContent = row.name;

        const badge = document.createElement('span');
        badge.className = 'fh-status';
        badge.dataset.status = row.status;
        badge.textContent = featureHealthStatusLabel(row.status);

        li.appendChild(name);
        li.appendChild(badge);

        const reason = Array.isArray(row.reasons) ? row.reasons[0] : null;
        if (reason) {
            const detail = document.createElement('span');
            detail.className = 'fh-reason';
            const age = formatFeatureHealthAge(reason.at, now);
            const canaryVersion = reason.youtubeClientVersion
                || t('selectorCanaryBuildUnknown', 'current build');
            const antiAdblockState = reason.playbackState === 'advancing'
                ? t('antiAdblockPlaybackAdvancing', 'advancing')
                : reason.playbackState === 'stalled'
                    ? t('antiAdblockPlaybackStalled', 'stalled')
                    : reason.playbackState === 'blocked'
                        ? t('antiAdblockPlaybackBlocked', 'blocked')
                        : t('antiAdblockPlaybackUnknown', 'unknown');
            const what = reason.kind === 'selector'
                ? t('featureHealthReasonSelectorTpl', 'Page element “{surface}” no longer found')
                    .replace('{surface}', reason.surface || reason.detail || '')
                : reason.kind === 'selector-fallback'
                    ? t('featureHealthReasonSelectorFallbackTpl',
                        'Page element “{surface}” only matched a backup rule')
                        .replace('{surface}', reason.surface || reason.detail || '')
                : reason.kind === 'selector-canary'
                    ? t('featureHealthReasonCanaryTpl', 'YouTube {version} changed {surface}')
                        .replace('{version}', canaryVersion)
                        .replace('{surface}', reason.surface || reason.detail || '')
                : reason.kind === 'anti-adblock'
                    ? t('featureHealthReasonAntiAdblockTpl', 'YouTube warning via {selector}; playback {state}')
                        .replace('{selector}', reason.selector || '')
                        .replace('{state}', antiAdblockState)
                : reason.kind === 'api'
                    ? t('featureHealthReasonApiTpl', '{service}: {detail}')
                        .replace('{service}', reason.service || '')
                        .replace('{detail}', reason.detail || '')
                    : reason.detail || '';
            detail.textContent = age ? `${what} · ${age}` : what;
            li.appendChild(detail);
        }
        featureHealthList.appendChild(li);
    }
    if (rows.length > shown.length) {
        const more = document.createElement('li');
        more.className = 'feature-health-more';
        // Neutral wording: with more than FEATURE_HEALTH_MAX_ROWS problems
        // the overflow is not all healthy rows, and claiming it would be a lie
        // in exactly the situation the panel exists for.
        more.textContent = t('featureHealthMoreTpl', '+{count} more')
            .replace('{count}', String(rows.length - shown.length));
        featureHealthList.appendChild(more);
    }
}

async function renderFeatureHealthPanel() {
    if (!featureHealthSection || !featureHealthList) return;
    try {
        const [tab] = await callExtensionApi(ext?.tabs, 'query', { active: true, lastFocusedWindow: true });
        if (!tab || !tab.id || !isSupportedInlinePanelUrl(tab.url || '')) {
            featureHealthSection.hidden = true;
            return;
        }
        const response = await browserApi.sendTabMessage(
            tab.id,
            { type: 'YTKIT_GET_FEATURE_HEALTH' },
            { timeoutMs: 1500 }
        );
        if (!response || response.ok === false || !response.report) {
            featureHealthSection.hidden = true;
            return;
        }
        const report = response.report;
        if (featureHealthLine) {
            // Same formatter the report itself ships with, so the collapsed
            // header can never disagree with the expanded list.
            const format = window.YTKitCore?.formatFeatureHealthLine;
            featureHealthLine.textContent = typeof format === 'function'
                ? format(report, t)
                : String(report.counts?.healthy || 0);
            featureHealthLine.dataset.status = report.worstStatus || 'healthy';
        }
        renderFeatureHealthRows(report);
        featureHealthSection.hidden = false;
        // Open on arrival when something is wrong. A healthy install keeps
        // it collapsed so the popup stays compact.
        const worst = report.worstStatus;
        if (worst === 'failed' || worst === 'degraded') featureHealthSection.open = true;
    } catch (_) {
        // reason: feature health is a diagnostic read; a non-responsive tab hides the panel
        featureHealthSection.hidden = true;
    }
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
function getRemovableRuntimeHostDescriptors(permissionSnapshot) {
    const describePattern = window.YTKitCore?.describeRemoteListOriginPattern;
    if (typeof describePattern !== 'function') return [];
    const required = new Set(getManifestRequiredHostPermissions());
    return uniqueOptionalOrigins(permissionSnapshot?.origins)
        .filter((originPattern) => !required.has(originPattern))
        .map((originPattern) => describePattern(originPattern))
        .filter((described) => described.ok)
        .sort((left, right) => left.hostname.localeCompare(right.hostname));
}

async function removeDataFlowRuntimeGrant(described, button) {
    if (!described?.ok || !button) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
        const configured = getConfiguredFilterListDescriptor();
        const cobalt = getConfiguredCobaltDescriptor();
        const clearsFilterList = configured.ok && configured.originPattern === described.originPattern;
        const disablesCobalt = popupState.settings?.downloadCobaltFallback === true
            && cobalt.ok && cobalt.originPattern === described.originPattern;
        let cleanup;
        if (clearsFilterList || disablesCobalt) {
            const nextSettings = { ...(popupState.settings || {}) };
            if (clearsFilterList) nextSettings.hideVideosFilterListUrl = '';
            if (disablesCobalt) nextSettings.downloadCobaltFallback = false;
            const result = await replaceSettings(nextSettings);
            cleanup = result.permissionCleanup;
            if (clearsFilterList) {
                if (typeof persistedDomains?.sanitizeVideoFilterListSubscription === 'function') {
                    await storageSet({
                        [STORAGE_KEYS.filterListSubscription]: persistedDomains.sanitizeVideoFilterListSubscription({})
                    });
                }
                syncFilterListUrlInput(popupState.settings, { force: true });
                await refreshFilterListStatus();
            }
        } else {
            cleanup = await revokeRuntimeOptionalHostOrigin(described.originPattern);
        }
        if (!cleanup?.ok) throw new Error(cleanup?.code || 'permission removal failed');
        render(popupState.settings, q.value);
        renderDataFlowPanel();
        renderSchemaOverview();
        showStatus(t('dataFlowGrantRemovedTpl', 'Removed site access for {host}.')
            .replace('{host}', described.hostname), 'success', 3600);
    } catch (error) {
        console.warn('[Astra Deck popup] Data-flow grant removal failed:', error);
        showStatus(t('dataFlowGrantRemoveFailedTpl', 'Could not remove site access for {host}.')
            .replace('{host}', described.hostname), 'error', 4800);
        renderDataFlowPanel();
    } finally {
        button.removeAttribute('aria-busy');
        button.disabled = false;
    }
}

async function renderDataFlowGrantedHosts(originEntries, renderToken) {
    if (!dataFlowGrants || !dataFlowGrantsList || !dataFlowGrantsCount) return;
    const helper = createOptionalHostPermissionHelper();
    if (!helper || typeof helper.getAll !== 'function') {
        dataFlowGrants.hidden = true;
        return;
    }
    try {
        const permissionSnapshot = await helper.getAll();
        if (renderToken !== popupState._dataFlowGrantRenderToken || dataFlowSection?.hidden) return;
        const descriptors = getRemovableRuntimeHostDescriptors(permissionSnapshot);
        dataFlowGrantsList.replaceChildren();
        dataFlowGrantsCount.textContent = t('dataFlowGrantedHostsCountTpl', '{count} granted')
            .replace('{count}', String(descriptors.length));
        for (const described of descriptors) {
            const catalogueEntry = originEntries.find((entry) =>
                entry.optionalManifestPermission === described.originPattern);
            const filterList = getConfiguredFilterListDescriptor();
            const cobalt = getConfiguredCobaltDescriptor();
            const servesFilterList = filterList.ok && filterList.originPattern === described.originPattern;
            const servesCobalt = cobalt.ok && cobalt.originPattern === described.originPattern;
            const li = document.createElement('li');
            li.className = 'data-flow-grant-row';
            li.dataset.originPattern = described.originPattern;

            const host = document.createElement('span');
            host.className = 'data-flow-grant-host';
            host.textContent = described.hostname;
            host.title = described.hostname;

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'data-flow-grant-remove';
            remove.textContent = t('dataFlowGrantRemove', 'Remove access');
            remove.setAttribute('aria-label', t('dataFlowGrantRemoveAriaTpl',
                'Remove site access for {host}').replace('{host}', described.hostname));
            remove.addEventListener('click', () => {
                void removeDataFlowRuntimeGrant(described, remove);
            });

            const purpose = document.createElement('span');
            purpose.className = 'data-flow-grant-purpose';
            if (servesFilterList && servesCobalt) {
                purpose.textContent = t('dataFlowSharedGrantPurpose',
                    'Video Hider and self-hosted Cobalt can use this site until access is removed.');
            } else if (servesCobalt) {
                purpose.textContent = t('dataFlowCobaltGrantPurpose',
                    'Self-hosted Cobalt can process this video through this site until access is removed.');
            } else {
                purpose.textContent = catalogueEntry?.purpose
                    || t('dataFlowFilterListGrantPurpose',
                        'Video Hider can fetch data from this site until access is removed.');
            }

            li.appendChild(host);
            li.appendChild(remove);
            li.appendChild(purpose);
            dataFlowGrantsList.appendChild(li);
        }
        dataFlowGrants.hidden = descriptors.length === 0;
    } catch (error) {
        if (renderToken !== popupState._dataFlowGrantRenderToken) return;
        console.warn('[Astra Deck popup] Granted host enumeration failed:', error);
        dataFlowGrants.hidden = true;
    }
}

function renderDataFlowPanel() {
    if (!dataFlowSection || !dataFlowList) return;
    const settings = popupState.settings || {};
    if (settings.privacyDataFlowPanel !== true) {
        popupState._dataFlowGrantRenderToken += 1;
        if (dataFlowGrants) dataFlowGrants.hidden = true;
        dataFlowSection.hidden = true;
        return;
    }
    const factory = window.YTKitCore && window.YTKitCore.createDataFlow;
    if (typeof factory !== 'function') {
        // Modules failed to load (CSP regression, missing file). Stay hidden
        // rather than render a broken panel.
        popupState._dataFlowGrantRenderToken += 1;
        if (dataFlowGrants) dataFlowGrants.hidden = true;
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
        const specificOrigin = getSpecificDataFlowDescriptor(entry, settings);
        originSpan.textContent = specificOrigin?.ok ? specificOrigin.origin : entry.origin;

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
    if (dataFlowGrants) dataFlowGrants.hidden = true;
    const grantRenderToken = ++popupState._dataFlowGrantRenderToken;
    void renderDataFlowGrantedHosts(origins, grantRenderToken);
}

function getVisibleSchemaChanges(scope, settings, effectiveProfile) {
    if (typeof scope.getChangedSettings !== 'function') return [];
    const policy = ensurePolicyProfile();
    return scope.getChangedSettings(settings).filter((change) => {
        const entry = typeof scope.findSettingEntry === 'function'
            ? scope.findSettingEntry(change.key)
            : scope.SETTINGS_SCHEMA.find((candidate) => candidate.key === change.key);
        return !policy || policy.isEntryAllowedInProfile(entry, effectiveProfile);
    });
}

function formatSchemaDiffValue(value, key) {
    const safe = redactBugReportSettings({ [key]: value })[key];
    if (safe === undefined) return '—';
    if (typeof safe === 'string') return safe;
    try { return JSON.stringify(safe); } catch (_) {
        // reason: a malformed imported value should still be visible as a
        // bounded scalar instead of breaking the changed-settings view.
        return String(safe);
    }
}

function sanitizeSchemaDiff(changes) {
    return changes.map((change) => ({
        key: change.key,
        category: change.category,
        current: redactBugReportSettings({ [change.key]: change.currentValue })[change.key],
        default: redactBugReportSettings({ [change.key]: change.defaultValue })[change.key]
    }));
}

// Copies text, falling back to the hidden-textarea route when the popup's
// clipboard permission is denied. Four surfaces need this and each had grown
// its own copy of the same twenty lines, differing only in which status
// string it showed on the way out. Returns whether the text landed; the
// caller owns the message.
async function copyTextToClipboard(text) {
    try {
        if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
        await navigator.clipboard.writeText(text);
        return true;
    } catch (_) {
        // reason: popup clipboard permission varies by browser and profile
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_) {
        // reason: execCommand throws in tightly-locked-down contexts
        copied = false;
    }
    textarea.remove();
    return copied;
}

// A compact browser label from the user agent.
//
// The full UA string is a fingerprinting surface and most of it is noise a
// reader skips anyway. This keeps the engine and its major version — the two
// things that decide whether a report is reproducible — and drops the rest.
function describeBrowserForReport(userAgent = (typeof navigator !== 'undefined' && navigator.userAgent) || '') {
    const ua = String(userAgent);
    // Order matters: Edge and Brave both carry "Chrome/", so the specific
    // engines have to be tried before the one they impersonate.
    for (const [label, pattern] of [
        ['Firefox', /Firefox\/(\d+)/],
        ['Edge', /Edg\/(\d+)/],
        ['Opera', /OPR\/(\d+)/],
        ['Chrome', /Chrome\/(\d+)/],
        ['Safari', /Version\/(\d+).*Safari/]
    ]) {
        const match = pattern.exec(ua);
        if (match) return `${label} ${match[1]}`;
    }
    return 'unknown browser';
}

// The privacy-safe sibling of the diagnostic bundle.
//
// The maintainer's blind spot is which of 291 features anyone actually turns
// on, and the project takes no telemetry, so the only honest answer is a
// report the user chooses to produce and chooses where to paste. That only
// works if it is safe to paste in public, which means IDs and nothing else:
// not one setting VALUE reaches this string, so a filter-list URL, a channel
// name, a note, a bookmark, or a provider key cannot ride along even when the
// user has all of them populated.
function buildEnabledFeatureReport(options = {}) {
    const {
        scope = window.__YTKIT_SETTINGS_SCHEMA__,
        settings = popupState.settings || {},
        version = '',
        profile = '',
        userAgent = undefined
    } = options;

    const changes = scope && Array.isArray(scope.SETTINGS_SCHEMA)
        ? getVisibleSchemaChanges(scope, settings, profile || 'store-safe')
        : [];
    // getChangedSettings already drops internal (`_`-prefixed) keys, so what
    // is left is the user-facing surface and nothing else.
    const keys = changes.map((change) => change.key).sort();

    const lines = [
        `Astra Deck ${version}`,
        describeBrowserForReport(userAgent),
        `Profile: ${profile || 'store-safe'}`,
        '',
        t('featureReportChangedTpl', 'Settings changed from their defaults ({count}):')
            .replace('{count}', String(keys.length))
    ];
    if (keys.length) {
        for (const key of keys) lines.push(`  ${key}`);
    } else {
        lines.push('  ' + t('featureReportNoneChanged', 'none'));
    }
    lines.push('');
    lines.push(t('featureReportPrivacyNote',
        'Names only, no values. Nothing was sent anywhere. This is on your clipboard '
        + 'and you decide whether to paste it.'));
    return lines.join('\n');
}

async function copyEnabledFeatureReport() {
    if (!featureReportCopy) return;
    const settings = popupState.settings || {};
    const policy = ensurePolicyProfile();
    featureReportCopy.disabled = true;
    try {
        const report = buildEnabledFeatureReport({
            settings,
            version: manifestVersion,
            profile: policy ? policy.resolveEffectiveProfile(settings) : 'store-safe'
        });
        const copied = await copyTextToClipboard(report);
        showStatus(copied
            ? t('featureReportCopyDone', 'Feature list copied. Nothing was sent anywhere.')
            : t('featureReportCopyFail', 'Could not copy the feature list.'),
        copied ? 'ok' : 'error', copied ? 3200 : 3600);
    } finally {
        featureReportCopy.disabled = false;
    }
}

// ── Feature bisect ──
//
// "When something breaks for you but not for me, your report is the only
// signal I get." With 291 features a reporter cannot say which one, and this
// moves that work to the only person who can reproduce it: about ten reloads
// of a binary search over their own enabled set.
//
// The state machine lives in core/feature-bisect.js and is pure. Everything
// here is the parts it deliberately does not own: persisting the session,
// applying a step to real settings, and putting the snapshot back.
const BISECT_SESSION_KEY = 'ytkit-feature-bisect';

let _bisectFinishedSession = null;

function bisectCore() {
    return (typeof window !== 'undefined' && window.YTKitCore) || {};
}

// Booleans that are modes, not features. Switching one of these does not turn
// a behaviour off — it re-derives OTHER settings. The profile pair is the
// example that bit: the settings controller keeps exactly one of them true, so
// a step that switched safeStoreProfile off flipped githubFullProfile on, and
// the run both searched a differently-configured extension and left the user
// on the other profile afterwards.
const BISECT_EXCLUDED_KEYS = new Set(['safeStoreProfile', 'githubFullProfile']);

// Boolean feature settings that are currently on. A colour or a speed is a
// value, not a feature, and cannot be "the one that broke it"; internal keys
// are not the user's choices at all.
function enabledFeatureIdsForBisect(settings = popupState.settings || {}) {
    const scope = window.__YTKIT_SETTINGS_SCHEMA__;
    if (!scope || !Array.isArray(scope.SETTINGS_SCHEMA)) return [];
    return scope.SETTINGS_SCHEMA
        .filter((entry) => !entry.internal
            && entry.type === 'boolean'
            && !BISECT_EXCLUDED_KEYS.has(entry.key)
            && settings[entry.key] === true)
        .map((entry) => entry.key);
}

// Drops keys the running schema no longer ships.
//
// A session can outlive an update by up to its 24-hour deadline, and the
// settings controller rejects a replacement containing a key it does not
// recognise. Without this, one renamed or retired feature made every restore
// path throw — forever, because each of them restores before clearing the
// session, so the failure repeated on every attempt with the user's features
// still switched off.
function sanitizeBisectSettings(settings) {
    const scope = window.__YTKIT_SETTINGS_SCHEMA__;
    if (!scope || !Array.isArray(scope.SETTINGS_SCHEMA) || !isPlainObject(settings)) {
        return { ...settings };
    }
    const known = new Set(scope.SETTINGS_SCHEMA.map((entry) => entry.key));
    const out = {};
    for (const [key, value] of Object.entries(settings)) {
        if (known.has(key) || key.startsWith('_')) out[key] = value;
    }
    return out;
}

async function readBisectSession() {
    try {
        const stored = await storageGet(BISECT_SESSION_KEY);
        const session = stored?.[BISECT_SESSION_KEY];
        return session && Array.isArray(session.snapshot) ? session : null;
    } catch (_) {
        // reason: an unreadable session is no session; never block the popup
        return null;
    }
}

// Persisting is NOT best-effort. Without a stored session the Yes/No and Stop
// buttons all read null and return, so a swallowed write failure left every
// feature switched off with no route back and a UI that looked like a run in
// progress. The caller has to know.
async function writeBisectSession(session) {
    if (session) await storageSet({ [BISECT_SESSION_KEY]: session });
    else await storageRemove([BISECT_SESSION_KEY]);
}

// Writes the settings a step needs. The base is the settings the run STARTED
// with, not the half-state the previous step left and not whatever
// popupState happens to hold, so no sequence of steps can drift the user's
// real configuration and no ordering of popup startup can lose a key.
async function applyBisectSettings(session, offIds) {
    const off = new Set(offIds);
    const next = sanitizeBisectSettings(session.settings);
    for (const id of session.snapshot) next[id] = !off.has(id);
    await replaceSettings(next);
}

// Restores the whole bag the run started with, key for key.
//
// It used to force the snapshot's feature IDs back to true on top of
// popupState.settings, which was wrong twice over. Anything the step had
// changed INDIRECTLY was not in the snapshot and stayed changed. And on the
// expiry path this runs before the popup has loaded settings at all, so
// popupState.settings was still {} and replacing with it dropped every key the
// snapshot did not name.
async function restoreBisectSnapshot(session) {
    if (!session || !isPlainObject(session.settings)) return;
    await replaceSettings(sanitizeBisectSettings(session.settings));
}

async function startFeatureBisectRun() {
    const core = bisectCore();
    if (typeof core.createFeatureBisect !== 'function') return;
    const enabled = enabledFeatureIdsForBisect();
    if (!enabled.length) {
        showStatus(t('bisectNothingEnabled',
            'No features are switched on, so there is nothing to search.'), 'info', 3200);
        return;
    }
    const session = {
        ...core.createFeatureBisect(enabled, Date.now()),
        // The entire settings bag as it stands right now. Restoring from this
        // is what makes "exactly" true: an indirect change a step causes, a
        // key no step ever names, and a popup that has not finished loading
        // are all covered by replacing the whole object.
        settings: sanitizeBisectSettings(popupState.settings || {})
    };
    // Persist BEFORE touching settings. A session that failed to save cannot
    // be answered or stopped, so applying a step first would strand every
    // feature switched off.
    try {
        await writeBisectSession(session);
    } catch (error) {
        showStatus(t('bisectStartFailed',
            'Could not start: this browser profile will not save the bisect session.'), 'error', 4200);
        return;
    }
    await applyBisectSettings(session, core.disabledForBisectStep(session));
    renderBisect(session);
    showStatus(t('bisectStarted', 'Reload YouTube, then answer below.'), 'ok', 3600);
}

// Restores and clears, in that order, and clears even when the restore throws.
//
// Order matters: clearing first would drop the only record of what to put
// back. But a restore that throws must not keep the session either, because
// every entry point restores before clearing and the same failure would
// repeat on every attempt with the features still off. So the session goes
// either way, and the user is told rather than left with a silent rejection.
async function endFeatureBisectRun(session) {
    let failure = null;
    try {
        await restoreBisectSnapshot(session);
    } catch (error) {
        failure = error;
    }
    try {
        await writeBisectSession(null);
    } catch (_) {
        // reason: an unwritable store is already the worse problem above
    }
    if (failure) {
        showStatus(t('bisectRestoreFailed',
            'Could not put your settings back. Open Settings and check them.'), 'error', 6000);
    }
    return !failure;
}

async function answerFeatureBisectRun(stillHappens) {
    const core = bisectCore();
    const session = await readBisectSession();
    if (!session || typeof core.answerFeatureBisect !== 'function') return;
    const next = core.answerFeatureBisect(session, stillHappens);

    if (core.isBisectFinished(next)) {
        // Put the user's world back before showing the answer. A finished run
        // that leaves features switched off is a worse outcome than not
        // running one at all.
        await endFeatureBisectRun(next);
        renderBisect(next);
        return;
    }
    // Same ordering as the start: a step that cannot be recorded must not be
    // applied, or the run becomes unanswerable with features off.
    try {
        await writeBisectSession(next);
    } catch (error) {
        await endFeatureBisectRun(session);
        renderBisect(null);
        showStatus(t('bisectStartFailed',
            'Could not start: this browser profile will not save the bisect session.'), 'error', 4200);
        return;
    }
    await applyBisectSettings(next, core.disabledForBisectStep(next));
    renderBisect(next);
}

async function abortFeatureBisectRun() {
    const session = await readBisectSession();
    if (!session) return;
    const restored = await endFeatureBisectRun(session);
    renderBisect(null);
    if (restored) {
        showStatus(t('bisectAborted', 'Bisect stopped. Your features are back on.'), 'ok', 3000);
    }
}

// Called on every popup open. An abandoned run is the expected ending, not the
// exception: the problem being investigated is often "the page is unusable",
// which is exactly the state someone closes the tab on. The deadline is what
// gives their settings back, not the user remembering.
async function resumeOrExpireFeatureBisect() {
    const core = bisectCore();
    const session = await readBisectSession();
    if (!session) {
        renderBisect(null);
        return;
    }
    if (core.isBisectExpired?.(session, Date.now())) {
        const restored = await endFeatureBisectRun(session);
        renderBisect(null);
        if (restored) {
            showStatus(t('bisectExpired',
                'An unfinished bisect expired. Your features are back on.'), 'info', 4200);
        }
        return;
    }
    renderBisect(session);
}

async function copyFeatureBisectResult() {
    const core = bisectCore();
    const session = _bisectFinishedSession;
    if (!session || typeof core.formatBisectResult !== 'function') return;
    let pageType = 'unknown';
    try {
        const [tab] = await callExtensionApi(ext?.tabs, 'query', { active: true, lastFocusedWindow: true });
        pageType = describeBisectPageType(tab?.url || '');
    } catch (_) {
        // reason: page type is context, not the answer; unknown is fine
    }
    const report = core.formatBisectResult(session, {
        version: manifestVersion,
        browser: describeBrowserForReport(),
        pageType
    });
    const copied = await copyTextToClipboard(report);
    showStatus(copied
        ? t('bisectCopyDone', 'Result copied. Nothing was sent anywhere.')
        : t('bisectCopyFail', 'Could not copy the result.'),
    copied ? 'ok' : 'error', copied ? 3200 : 3600);
}

// Which kind of YouTube page the problem was on. A path shape, never the URL
// itself: a bisect result is pasted in public like the feature report is, and
// a watch URL names what the user was watching.
function describeBisectPageType(url) {
    let parsed;
    try { parsed = new URL(String(url || '')); } catch (_) { return 'unknown'; }
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(parsed.hostname)) return 'not-youtube';
    const path = parsed.pathname;
    if (path === '/watch') return 'watch';
    if (path.startsWith('/shorts')) return 'shorts';
    if (path.startsWith('/results')) return 'search';
    if (path.startsWith('/feed/subscriptions')) return 'subscriptions';
    if (path.startsWith('/playlist')) return 'playlist';
    if (path.startsWith('/@') || path.startsWith('/channel') || path.startsWith('/c/')) return 'channel';
    if (path === '/' ) return 'home';
    return 'other';
}

function renderBisect(session) {
    if (!bisectPanel) return;
    const core = bisectCore();
    const finished = !!session && core.isBisectFinished?.(session) === true;
    const running = !!session && !finished;

    if (bisectStart) bisectStart.hidden = running;
    if (bisectStep) bisectStep.hidden = !running;
    if (bisectAbort) bisectAbort.hidden = !running;
    if (bisectResult) bisectResult.hidden = !finished;
    if (bisectCopy) bisectCopy.hidden = !finished;

    if (running && bisectPrompt) {
        bisectPrompt.textContent = t('bisectStepTpl',
            'Step {step} of about {total}. Reload YouTube, then answer: does the problem still happen?')
            .replace('{step}', String(session.step))
            .replace('{total}', String(core.bisectTotalSteps?.(session) || 0));
    }
    if (finished && bisectResult) {
        bisectResult.textContent = session.phase === core.BISECT_PHASES?.CULPRIT
            ? t('bisectCulpritTpl', 'It is {feature}.').replace('{feature}', session.candidates[0])
            : t('bisectNoCulprit',
                'No single feature is responsible. Something outside Astra Deck, or a combination of features, is causing it.');
        _bisectFinishedSession = session;
    }
    if (!session) _bisectFinishedSession = null;
}

function formatSchemaDiffReport(changes) {
    return JSON.stringify({
        astraDeckSettingsDiff: true,
        exportedAt: new Date().toISOString(),
        changed: sanitizeSchemaDiff(changes)
    }, null, 2);
}

function renderSchemaDiff(changes) {
    if (schemaOverviewDiffCount) {
        schemaOverviewDiffCount.textContent = t('schemaOverviewChangedCountTpl', '{count} changed')
            .replace('{count}', String(changes.length));
    }
    if (schemaOverviewDiffToggle) {
        schemaOverviewDiffToggle.setAttribute('aria-pressed', String(schemaOverviewState.showChangedOnly));
        schemaOverviewDiffToggle.textContent = schemaOverviewState.showChangedOnly
            ? t('schemaOverviewAllView', 'Show all settings')
            : t('schemaOverviewChangedView', 'Changed from defaults');
    }
    if (schemaOverviewDiff) schemaOverviewDiff.hidden = !schemaOverviewState.showChangedOnly;
    if (schemaOverviewList) schemaOverviewList.hidden = schemaOverviewState.showChangedOnly;
    if (!schemaOverviewDiffList) return;
    schemaOverviewDiffList.textContent = '';
    if (schemaOverviewDiffEmpty) schemaOverviewDiffEmpty.hidden = changes.length > 0;
    for (const change of changes) {
        const li = document.createElement('li');
        li.className = 'schema-overview-diff-row';

        const head = document.createElement('div');
        head.className = 'schema-overview-diff-head';
        const label = document.createElement('strong');
        label.textContent = typeof window.__YTKIT_SETTINGS_SCHEMA__?.humanizeSettingKey === 'function'
            ? window.__YTKIT_SETTINGS_SCHEMA__.humanizeSettingKey(change.key)
            : change.key;
        label.title = change.key;
        const category = document.createElement('span');
        category.textContent = change.category;
        head.appendChild(label);
        head.appendChild(category);

        const values = document.createElement('div');
        values.className = 'schema-overview-diff-values';
        const current = document.createElement('span');
        current.className = 'schema-overview-diff-value';
        current.textContent = t('schemaOverviewDiffCurrent', 'Current') + ': '
            + formatSchemaDiffValue(change.currentValue, change.key);
        const defaultValue = document.createElement('span');
        defaultValue.className = 'schema-overview-diff-value schema-overview-diff-default';
        defaultValue.textContent = t('schemaOverviewDiffDefault', 'Default') + ': '
            + formatSchemaDiffValue(change.defaultValue, change.key);
        values.appendChild(current);
        values.appendChild(defaultValue);

        li.appendChild(head);
        li.appendChild(values);
        schemaOverviewDiffList.appendChild(li);
    }
}

async function copySchemaOverviewDiff() {
    if (!schemaOverviewDiffCopy) return;
    const scope = window.__YTKIT_SETTINGS_SCHEMA__;
    if (!scope || !Array.isArray(scope.SETTINGS_SCHEMA)) return;
    const settings = popupState.settings || {};
    const policy = ensurePolicyProfile();
    const effectiveProfile = policy
        ? policy.resolveEffectiveProfile(settings)
        : 'store-safe';
    const changes = getVisibleSchemaChanges(scope, settings, effectiveProfile);
    if (!changes.length) {
        showStatus(t('schemaOverviewCopyDiffEmpty', 'No settings differ from their defaults.'), 'info', 3200);
        return;
    }
    schemaOverviewDiffCopy.disabled = true;
    const payload = formatSchemaDiffReport(changes);
    try {
        const copied = await copyTextToClipboard(payload);
        showStatus(copied
            ? t('schemaOverviewCopyDiffDone', 'Changed settings copied to clipboard.')
            : t('schemaOverviewCopyDiffFail', 'Could not copy changed settings.'),
        copied ? 'ok' : 'error', copied ? 2600 : 3600);
    } finally {
        schemaOverviewDiffCopy.disabled = false;
    }
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
        // The in-page panel matches the page a setting applies to and the
        // control type, so a popup that did not was a narrower search wearing
        // the same box. `scope` is the schema's name for the page; the DSL
        // above already filters on both, but only if the user knows to type
        // `scope:watch` rather than `watch`.
        if (entry.scope && String(entry.scope).toLowerCase().includes(freeTerm)) return true;
        if (entry.type && String(entry.type).toLowerCase().includes(freeTerm)) return true;
        return false;
    };

    const buckets = new Map();
    const policy = ensurePolicyProfile();
    const effectiveProfile = policy
        ? policy.resolveEffectiveProfile(settings || {})
        : 'store-safe';
    renderSchemaDiff(getVisibleSchemaChanges(scope, settings, effectiveProfile));
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
    // A search that matches nothing used to render an empty list, which reads
    // as broken rather than as "no results". Say so, and say what would help.
    if (term && [...buckets.values()].every((bucket) => bucket.matches === 0)) {
        const empty = document.createElement('li');
        empty.className = 'so-empty';
        empty.textContent = t('schemaOverviewNoMatchesTpl',
            'No setting matches "{term}". Try a feature name, a category, a page like watch or feed, or a control type like boolean.')
            .replace('{term}', rawTerm);
        schemaOverviewList.appendChild(empty);
        return;
    }
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

if (schemaOverviewDiffToggle) {
    schemaOverviewDiffToggle.addEventListener('click', () => {
        schemaOverviewState.showChangedOnly = !schemaOverviewState.showChangedOnly;
        renderSchemaOverview();
        schemaOverviewDiffToggle.focus();
    });
}
if (featureReportCopy) {
    featureReportCopy.addEventListener('click', () => { void copyEnabledFeatureReport(); });
}
// Every one of these ends in a settings write that can reject. Left as bare
// `void`, a rejection was an unhandled promise with no status message and no
// UI change — the user saw a button that did nothing.
function reportBisectFailure() {
    showStatus(t('bisectFailed', 'The bisect could not continue. Check Settings.'), 'error', 5000);
}
if (bisectStart) bisectStart.addEventListener('click', () => { startFeatureBisectRun().catch(reportBisectFailure); });
if (bisectYes) bisectYes.addEventListener('click', () => { answerFeatureBisectRun(true).catch(reportBisectFailure); });
if (bisectNo) bisectNo.addEventListener('click', () => { answerFeatureBisectRun(false).catch(reportBisectFailure); });
if (bisectAbort) bisectAbort.addEventListener('click', () => { abortFeatureBisectRun().catch(reportBisectFailure); });
if (bisectCopy) bisectCopy.addEventListener('click', () => { copyFeatureBisectResult().catch(reportBisectFailure); });
if (bisectPanel) resumeOrExpireFeatureBisect().catch(reportBisectFailure);
if (schemaOverviewDiffCopy) {
    schemaOverviewDiffCopy.addEventListener('click', () => { void copySchemaOverviewDiff(); });
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
        + `.so-key-row[data-key="${esc}"] select[data-key="${esc}"], `
        + `.so-key-row[data-key="${esc}"] textarea[data-key="${esc}"], `
        + `.so-key-row[data-key="${esc}"] .so-key-reset-btn`);
    if (control) { control.focus(); return; }
    refocusSchemaOverviewCategory(entry.category);
}

// v4.24.0: per-key row inside an expanded category. Booleans become a
// real switch button (read + write through ext.storage.local).
// Non-booleans show their current value as a read-only badge — the
// editing surface for non-boolean types lives in the in-page workspace.
// The popup edits booleans, numbers, strings, and finite selects inline. An
// array or object value (a channel list, a notes store, a group tree) has no
// inline editor here and belongs to the in-page panel.
function schemaSurfaceForEntry(entry) {
    return entry.type === 'array' || entry.type === 'object' ? 'panel' : 'popup';
}

function createSchemaSurfaceChip(entry) {
    const chip = document.createElement(schemaSurfaceForEntry(entry) === 'popup' ? 'span' : 'button');
    chip.className = 'so-key-profile-badge so-key-surface';
    if (schemaSurfaceForEntry(entry) === 'popup') {
        chip.textContent = t('schemaSurfaceHere', 'here');
        chip.title = t('schemaSurfaceHereTitle', 'This setting can be changed in the popup.');
        return chip;
    }
    chip.type = 'button';
    chip.dataset.surfaceOpen = 'panel';
    chip.textContent = t('schemaSurfacePanel', 'in-page panel');
    chip.title = t('schemaSurfacePanelTitle',
        'This setting is edited in the Astra Deck panel on YouTube. Opens it.');
    chip.addEventListener('click', (event) => {
        event.stopPropagation();
        void openSettingsSurfaceForKey(entry.key);
    });
    return chip;
}

// The chip that says a setting lives in the in-page panel now carries the key
// there. It used to open the panel on whatever category was last shown and
// leave the user to find the row again, which for 484 settings is not a link.
const PANEL_DEEP_LINK = '#ytkit-setting=';

async function openSettingsSurfaceForKey(settingKey = '') {
    const key = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(String(settingKey || '')) ? String(settingKey) : '';
    try {
        const [tab] = await callExtensionApi(ext?.tabs, 'query', { active: true, lastFocusedWindow: true });
        if (tab?.id && getTabContext(tab || null).mode === 'inline-panel') {
            if (await sendPanelOpenMessage(tab.id, key)) { window.close(); return; }
        }
        // A fresh tab has no content script to message yet, so the key rides on
        // the URL and the panel picks it up when it builds.
        await callExtensionApi(ext?.tabs, 'create', {
            url: key
                ? `https://www.youtube.com/${PANEL_DEEP_LINK}${encodeURIComponent(key)}`
                : 'https://www.youtube.com/'
        });
        window.close();
    } catch (_) {
        showStatus(t('statusOpenWorkspaceFail', 'Could not open the full workspace. Try again.'), 'error', 4200);
    }
}

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
    // (e.g. "Self-hosted Cobalt origin" beats "Download cobalt instance").
    // The raw storage key still goes in the tooltip so power users
    // can identify the underlying setting.
    const humanizer = window.__YTKIT_SETTINGS_SCHEMA__
        && window.__YTKIT_SETTINGS_SCHEMA__.humanizeSettingKey;
    const overrideLabel = typeof entry.labelKey === 'string' && entry.labelKey.trim();
    // One resolved name for every place this row speaks. The reset button's
    // accessible name, its tooltip, the reset toast and the write-failure
    // status used to interpolate entry.key directly, so voice-control users
    // heard "customProgressBarColor" for a row reading "Custom progress bar
    // colour" — and three call sites disagreed on which name to use. The raw
    // key stays reachable on the row label's own tooltip below.
    const visibleLabel = overrideLabel
        || (typeof humanizer === 'function' ? humanizer(entry.key) : entry.key);
    label.textContent = visibleLabel;
    const overrideDesc = typeof entry.descriptionKey === 'string' && entry.descriptionKey.trim();
    label.title = overrideDesc
        ? `${entry.key}: ${overrideDesc}`
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

    // Which surface owns this setting, and a way to get there.
    //
    // Five settings surfaces exist with nothing telling the user how they
    // relate. A row that is editable right here says so; one that is not says
    // where it lives and opens it. Without this, searching the popup and
    // finding a setting you cannot change here is a dead end.
    row.appendChild(createSchemaSurfaceChip(entry));

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
        // The visible word was a CSS ::before content: string, so it rendered
        // English in every locale. Short forms rather than the sentence-length
        // toggleStateOn/Off keys: this is a ~17px pill with 8px of padding.
        const stateWord = on
            ? t('switchLabelOn', 'on')
            : t('switchLabelOff', 'off');
        btn.textContent = stateWord;
        // Accessible name must CONTAIN the visible label, or voice control
        // cannot target the row: the switch used to announce the raw storage
        // key while the row reads a humanised label.
        btn.setAttribute('aria-label', visibleLabel + ' (' + stateWord + ')');
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
                showStatus(formatSettingWriteError(visibleLabel, err), 'error', 5200);
            } finally {
                btn.disabled = false;
            }
        });
        row.appendChild(btn);
    } else if (Array.isArray(entry.enum) && entry.enum.length > 0) {
        // Finite settings are choices, not free-form text/numbers. Rendering a
        // select keeps the popup vocabulary identical to the runtime control
        // and makes it impossible to save a value the feature will ignore.
        const select = document.createElement('select');
        select.className = 'so-key-select';
        select.dataset.key = entry.key;
        select.setAttribute('aria-label', label.textContent);
        const effective = resolveEffectiveSettingValue(entry, settings);
        // A stored value from before this key gained an enum still drives the
        // runtime, but has no option to select - so the browser would show the
        // FIRST option and quietly claim a value that is not in storage. Show
        // it instead, disabled, so display and storage agree and picking any
        // real option is what replaces it.
        const recognized = entry.enum.some((value) => value === effective);
        if (!recognized) {
            const legacy = document.createElement('option');
            legacy.value = String(effective);
            legacy.disabled = true;
            legacy.selected = true;
            legacy.textContent = t('settingValueUnrecognized', 'Unrecognized: {value}')
                .replace('{value}', String(effective) || '—');
            select.appendChild(legacy);
        }
        for (const value of entry.enum) {
            const option = document.createElement('option');
            option.value = String(value);
            option.textContent = String(value) || '—';
            option.selected = recognized && value === effective;
            select.appendChild(option);
        }
        select.addEventListener('change', async () => {
            const previous = resolveEffectiveSettingValue(entry, popupState.settings);
            const next = entry.type === 'number' ? Number(select.value) : select.value;
            if (previous === next) return;
            select.disabled = true;
            try {
                await writeSetting(entry.key, next);
                renderSchemaOverview();
                refocusSchemaOverviewKey(entry);
            } catch (err) {
                console.warn('[Astra Deck popup] schema-overview enum persist failed:', err);
                select.value = String(previous);
                showStatus(formatSettingWriteError(visibleLabel, err), 'error', 5200);
            } finally {
                select.disabled = false;
            }
        });
        row.appendChild(select);
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
        input.setAttribute('aria-label', label.textContent);
        const current = resolveEffectiveSettingValue(entry, settings);
        if (current !== undefined && current !== null) input.value = String(current);
        // Persist on every change/blur. We deliberately don't debounce
        // — typing in a number field implies a deliberate edit, and
        // writeSetting's chained Promise already serialises rapid
        // edits so race conditions are bounded.
        const persist = async () => {
            const raw = input.value.trim();
            // Clearing then committing is an explicit reset. The old path
            // silently retained storage while the empty field displayed the
            // default placeholder, so the visible and persisted values lied.
            let next = raw === '' ? entry.defaultValue : Number(raw);
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
            if (resolveEffectiveSettingValue(entry, popupState.settings) === next) return;
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
        input.setAttribute('aria-label', label.textContent);
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
        const previousValue = input.value;
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
                input.removeAttribute('aria-invalid');
                renderSchemaOverview();
            } catch (err) {
                console.warn('[Astra Deck popup] schema-overview string persist failed:', err);
                input.value = previousValue;
                input.setAttribute('aria-invalid', 'true');
                showStatus(formatSettingWriteError(visibleLabel, err), 'error', 5200);
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
        grid.setAttribute('aria-label', label.textContent);
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
        textarea.setAttribute('aria-label', label.textContent);
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
                // A hand-edited JSON textarea is the one surface where the
                // parser's offset is the next action, so keep the position and
                // drop the English prose the engine wraps around it.
                logFailure('schema-json-edit', err);
                const position = /position\s+(\d+)/i.exec(String(err?.message || ''));
                // raw-error-copy: only the parser's numeric offset is kept, never its prose
                errorPill.textContent = position
                    ? t('schemaJsonInvalidAtTpl', 'Invalid JSON at position {position}. Fix it, then apply.')
                        .replace('{position}', position[1])
                    : t('schemaJsonInvalid', 'Invalid JSON. Check the syntax, then apply.');
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
                .replace('{key}', visibleLabel)
                .replace('{value}', describeDefaultForTooltip(entry.defaultValue));
            resetBtn.setAttribute('aria-label',
                t('schemaResetAriaTpl', 'Reset {key} to default value')
                    .replace('{key}', visibleLabel));
            resetBtn.addEventListener('click', async () => {
                resetBtn.disabled = true;
                try {
                    await writeSetting(entry.key, entry.defaultValue);
                    // Tpl + token: the catalogue wins over this fallback in the
                    // extension, and the old tokenless message meant every
                    // reset toasted the same context-free "… reset to default."
                    showStatus(t('statusPerKeyResetTpl', '{key} reset to default.')
                        .replace('{key}', visibleLabel), 'ok', 2400);
                    renderSchemaOverview();
                    // The rebuild removed this reset button (value is back
                    // at default) — refocus the row's remaining control so
                    // keyboard focus doesn't fall to <body>.
                    refocusSchemaOverviewKey(entry);
                } catch (err) {
                    showStatus(failureText('schema-key-reset', err,
                        'statusPerKeyResetFail', 'Could not reset'), 'error', 3600);
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
    healthDetail.textContent = t('healthFallbackPrefix', 'TrustedTypes fallback active') + ': ' + countLabel + '. ' + tt.latestMessage;
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
            showStatus(t('statusClipboardUnavailable', 'Copying isn’t available here. Select the text and copy it yourself instead.'), 'error', 3600);
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
    'hideVideosFilterListUrl',
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
            out[key] = `[redacted, ${v.length} chars]`;
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
            const items = await storageGet([SETTINGS_STORAGE_KEY, STORAGE_KEYS.filterListSubscription]);
            const settings = isPlainObject(items[SETTINGS_STORAGE_KEY])
                ? items[SETTINGS_STORAGE_KEY]
                : {};
            const errors = Array.isArray(settings._errors) ? settings._errors : [];
            const sanitized = redactBugReportSettings(settings);
            // Drop the errors array out of sanitized — already in `errors`
            // above; carrying it twice would just bloat the bundle.
            delete sanitized._errors;
            const filterListSubscription = typeof persistedDomains?.buildVideoFilterListSubscriptionMetadata === 'function'
                ? persistedDomains.buildVideoFilterListSubscriptionMetadata(
                    items[STORAGE_KEYS.filterListSubscription],
                    { redactSource: true, now: Date.now() }
                )
                : null;
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
            // v4.68.0: the joined per-feature answer travels with the bundle.
            // A report that says "Video Hider degraded — feedCard missing 4m
            // ago" is the single most useful line in a breakage report, and
            // it is exactly what a user cannot type from memory.
            let featureHealth = null;
            try {
                const [healthTab] = await callExtensionApi(ext?.tabs, 'query', { active: true, lastFocusedWindow: true });
                if (healthTab?.id && isSupportedInlinePanelUrl(healthTab.url || '')) {
                    const resp = await browserApi.sendTabMessage(
                        healthTab.id,
                        { type: 'YTKIT_GET_FEATURE_HEALTH' },
                        { timeoutMs: 1500 }
                    );
                    if (resp?.ok && resp.report) featureHealth = resp.report;
                }
            } catch (_) {
                // reason: feature health needs a live YouTube tab; the bundle ships without it otherwise
            }
            const schemaScope = window.__YTKIT_SETTINGS_SCHEMA__;
            const policy = ensurePolicyProfile();
            const effectiveProfile = policy
                ? policy.resolveEffectiveProfile(settings)
                : 'store-safe';
            const settingsDiff = schemaScope && Array.isArray(schemaScope.SETTINGS_SCHEMA)
                ? sanitizeSchemaDiff(getVisibleSchemaChanges(schemaScope, settings, effectiveProfile))
                : [];
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
                featureHealth,
                filterListSubscription,
                settings: sanitized,
                settingsDiff,
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
            showStatus(failureText('diagnostic-log-save', e, 'statusDiagSaveFail', 'Could not save log'), 'error', 3600);
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
        // Mutable: the upgrade guard below can stamp this value during this
        // same render, and the What's New gate has to see what was stamped
        // rather than what was on disk when the popup opened.
        let lastSeen = typeof items[LAST_SEEN_VERSION_KEY] === 'string'
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
            const stampedVersion = manifestVersion && manifestVersion !== '—'
                ? manifestVersion
                : '';
            try {
                await storageSet({
                    [FIRST_RUN_SEEN_KEY]: true,
                    [LAST_SEEN_VERSION_KEY]: stampedVersion,
                });
                firstRunSeen = true;
                // Adopt what was just written. Leaving lastSeen at its
                // pre-stamp '' made the gate below fire showWhatsNew('') on
                // this very open — the banner this guard exists to suppress,
                // in its tokenless "Updated to vX. See what changed." form.
                lastSeen = stampedVersion;
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
    // No profile-* reason reaches here: the profile step hands over to the
    // preset step, which fires the confirmation once onboarding completes.
    void reason;
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
        showStatus(failureText('welcome-profile', err,
            'statusWelcomeProfileFail', 'Could not apply profile'), 'error', 4200);
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
        // Onboarding used to end in silence: the card simply vanished. The two
        // profile-confirmation messages existed and were translated into every
        // locale, but nothing could reach them — the profile step hands over to
        // this preset step rather than dismissing, and no toast branch matched
        // a `preset-*` reason. Fire them here, which is the actual moment
        // onboarding completes and the chosen profile takes effect.
        // The profile step always writes this key explicitly on both branches,
        // so it is present by the time onboarding reaches the preset step; the
        // schema default (false) is the right answer if it somehow is not.
        const fullProfile = popupState.settings?.githubFullProfile === true;
        showStatus(fullProfile
            ? t('statusWelcomeProfileFull',
                'GitHub-Full profile enabled. Astra Downloader and AI providers are now available.')
            : t('statusWelcomeProfileSafe',
                'Store-safe profile active. Open Full Settings to explore features.'),
        'ok', 4200);
    } catch (err) {
        showStatus(failureText('welcome-preset', err, 'statusWelcomePresetFail', 'Could not apply preset'), 'error', 4200);
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
        showStatus(failureText('diagnostic-log-clear', error, 'statusDiagClearFail', 'Could not clear log'), 'error', 4200);
    }
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

// Shared by the Export button and by the safety copy Import writes before it
// overwrites anything. Returns the filename so the caller can name it in a
// status message.
async function downloadBackupFile(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    try {
        // Prefer the downloads API when available so the file lands in the
        // user's downloads folder even though the popup will close. Falls back
        // to an anchor click if the permission is unavailable.
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
    } finally {
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    return filename;
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
        await downloadBackupFile(
            exportData,
            'astra_deck_settings_' + new Date().toISOString().slice(0, 10) + '.json'
        );
        showStatus(transcript.available
            ? t('statusBackupExported', 'Backup exported.')
            : t('statusBackupExportedNoTranscript',
                'Backup exported without the transcript index because no responsive YouTube tab was available.'),
        'success', transcript.available ? 3200 : 6000);
    } catch (error) {
        showStatus(failureText('backup-export', error, 'statusExportFail', 'Export failed'), 'error', 4200);
    } finally {
        exportButton.removeAttribute('aria-busy');
        exportButton.disabled = false;
    }
}

// Reasons from core/remote-list-scope.js that mean "this address is not on the
// public internet". They share one message because the user's next action is
// the same for all of them: publish the list somewhere reachable.
const NON_PUBLIC_FILTER_LIST_REASONS = new Set(['private-network', 'ip-literal', 'non-public-host']);

function setFilterListStatus(messageKey, fallback, type = 'info') {
    if (!filterListStatus) return;
    filterListStatus.textContent = t(messageKey, fallback);
    filterListStatus.dataset.state = type;
}

// For the {host} templates, which have to be substituted at the call site so
// the check-i18n token gate can see the replace() next to its own t().
function setFilterListStatusText(text, type = 'info') {
    if (!filterListStatus) return;
    filterListStatus.textContent = text;
    filterListStatus.dataset.state = type;
}

function syncFilterListUrlInput(settings = popupState.settings, { force = false } = {}) {
    if (!filterListUrlInput) return;
    // The URL is only persisted when the user submits it, so until then this
    // field holds uncommitted input. render() runs on any quick toggle, any
    // storage change, and every permission refresh — rewriting the value then
    // discards a half-typed address mid-entry. Same guard the schema-overview
    // editors carry. Deliberate actions (submit, stop following, reset) pass
    // force, because there the new value IS the user's intent.
    if (!force && document.activeElement === filterListUrlInput) return;
    filterListUrlInput.value = typeof settings?.hideVideosFilterListUrl === 'string'
        ? settings.hideVideosFilterListUrl
        : '';
}

function formatFilterListRelativeTime(timestamp) {
    const formatter = window.YTKitCore?.formatRelativeTimestamp;
    const formatted = typeof formatter === 'function'
        ? formatter(timestamp, { locale: document.documentElement.lang || undefined })
        : '';
    if (formatted) return formatted;
    const date = new Date(Number(timestamp));
    return Number.isNaN(date.getTime())
        ? t('filterListTimeUnknown', 'at an unknown time')
        : date.toLocaleString();
}

function getFilterListFailureText(code, httpStatus = 0) {
    switch (code) {
    case 'bad-format':
    case 'not-modified-without-cache':
        return t('filterListFailureBadFormat', 'the response was not a supported Astra Deck filter list');
    case 'too-large':
        return t('filterListFailureTooLarge', 'the response exceeded the 1 MiB limit');
    case 'http-error':
        return t('filterListFailureHttpTpl', 'the server returned HTTP {status}')
            .replace('{status}', String(Number(httpStatus) || 0));
    case 'storage-error':
        return t('filterListFailureStorage', 'the verified list could not be saved');
    case 'integrity-error':
        return t('filterListFailureIntegrity', 'SHA-256 verification was unavailable');
    case 'expired':
        return t('filterListFailureExpired', 'the last verification is older than 7 days');
    case 'unreachable':
    case 'unknown':
    default:
        return t('filterListFailureUnreachable', 'the source could not be reached');
    }
}

function renderFilterListSubscriptionStatus(described, record) {
    if (!filterListStatus || !described?.ok) return;
    const sanitize = persistedDomains?.sanitizeVideoFilterListSubscription;
    const resolve = persistedDomains?.resolveVideoFilterListSubscriptionState;
    if (typeof sanitize !== 'function' || typeof resolve !== 'function') {
        setFilterListStatus('filterListStatusStateReadFail',
            'Could not read the filter-list state. Reload the extension, then open the popup again.', 'error');
        return;
    }

    const sanitized = sanitize(record && (record.sourceUrl || record.url) === described.url
        ? record
        : { sourceUrl: described.url });
    const resolved = resolve(sanitized, Date.now());
    const current = resolved.subscription;
    const good = current.lastKnownGood;

    if (filterListPreferences) filterListPreferences.hidden = false;
    if (filterListRefreshMode) filterListRefreshMode.value = current.refreshMode;
    if (filterListStaleEnabled) filterListStaleEnabled.checked = current.staleEnabled;

    const host = described.hostname;
    if (!good) {
        if (resolved.state === 'error') {
            const reason = getFilterListFailureText(resolved.reasonCode, current.httpStatus);
            setFilterListStatusText(
                t('filterListStatusErrorTpl', 'No rules from {host} are active. Last refresh failed because {reason}.')
                    .replace('{host}', host)
                    .replace('{reason}', reason), 'error');
            return;
        }
        setFilterListStatusText(
            t('filterListStatusPendingTpl', 'Not fetched yet. Choose Refresh list now to follow {host}.')
                .replace('{host}', host), 'info');
        return;
    }

    const checkedAt = good.validatedAt || good.fetchedAt;
    const age = formatFilterListRelativeTime(checkedAt);
    const version = String(good.filterListVersion || 1);
    const hash = good.contentSha256
        ? good.contentSha256.slice(0, 12)
        : t('filterListHashUnavailable', 'not recorded');
    if (resolved.state === 'stale') {
        const reason = getFilterListFailureText(resolved.reasonCode, current.httpStatus);
        const template = current.staleEnabled
            ? t('filterListStatusStaleActiveTpl', 'Cached {host} rules remain active; checked {age}; {reason}. Format v{version}; SHA-256 {hash}.')
            : t('filterListStatusStalePausedTpl', 'Cached {host} rules are paused; checked {age}; {reason}. Format v{version}; SHA-256 {hash}.');
        setFilterListStatusText(
            template
                .replace('{host}', host)
                .replace('{age}', age)
                .replace('{reason}', reason)
                .replace('{version}', version)
                .replace('{hash}', hash), current.staleEnabled ? 'error' : 'info');
        return;
    }

    setFilterListStatusText(
        t('filterListStatusActiveTpl', 'Following {host}. Checked {age}; format v{version}; SHA-256 {hash}.')
            .replace('{host}', host)
            .replace('{age}', age)
            .replace('{version}', version)
            .replace('{hash}', hash), 'success');
}

// Report the sanitized subscription record, including visible freshness and
// last-known-good state. The full source URL is never echoed into the DOM.
async function refreshFilterListStatus() {
    if (!filterListStatus) return;
    const describe = window.YTKitCore?.describeRemoteListUrl;
    const configured = typeof popupState.settings?.hideVideosFilterListUrl === 'string'
        ? popupState.settings.hideVideosFilterListUrl
        : '';
    const described = typeof describe === 'function' ? describe(configured) : { ok: false };
    if (!described.ok) {
        if (filterListPreferences) filterListPreferences.hidden = true;
        setFilterListStatus('filterListStatusReady', 'No filter list is being followed.');
        return;
    }

    let record = null;
    try {
        const stored = await callExtensionApi(ext?.storage?.local, 'get', STORAGE_KEYS.filterListSubscription);
        record = stored?.[STORAGE_KEYS.filterListSubscription] || null;
    } catch (_) {
        // reason: an unreadable cache is indistinguishable from "never fetched"
    }
    renderFilterListSubscriptionStatus(described, record);
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
        setFilterListStatus('filterListStatusFail', 'Something went wrong. Your saved rules were not changed.', 'error');
        showStatus(failureText('filter-list-export', error, 'filterListExportFail', 'Filter-list export failed'), 'error', 4200);
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
            throw new Error(t('statusImportSnapshotFail',
                'Import stopped. Astra Deck could not save an undo point to extension storage, so export a backup first.'));
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
        setFilterListStatus('filterListStatusFail', 'Something went wrong. Your saved rules were not changed.', 'error');
        showStatus(failureText('filter-list-import', error, 'filterListImportFail', 'Filter-list import failed'), 'error', 5200);
    } finally {
        importFilterListFileInput.value = '';
        importFilterListButton.removeAttribute('aria-busy');
        importFilterListButton.disabled = false;
        try { await refreshUndoImportVisibility(); } catch (_) { /* reason: popup teardown or storage failure */ }
    }
}

async function updateFilterListSubscriptionPreferences(patch) {
    const described = getConfiguredFilterListDescriptor();
    const sanitize = persistedDomains?.sanitizeVideoFilterListSubscription;
    if (!described.ok || typeof sanitize !== 'function') return;
    if (filterListRefreshMode) filterListRefreshMode.disabled = true;
    if (filterListStaleEnabled) filterListStaleEnabled.disabled = true;
    try {
        const stored = await callExtensionApi(ext?.storage?.local, 'get', STORAGE_KEYS.filterListSubscription);
        const raw = stored?.[STORAGE_KEYS.filterListSubscription];
        const current = sanitize(raw && (raw.sourceUrl || raw.url) === described.url
            ? raw
            : { sourceUrl: described.url });
        const next = sanitize({ ...current, ...patch, sourceUrl: described.url });
        await storageSet({ [STORAGE_KEYS.filterListSubscription]: next });
        renderFilterListSubscriptionStatus(described, next);
    } catch (_) {
        setFilterListStatus('filterListStatusPreferenceFail', 'Could not save filter-list preferences.', 'error');
    } finally {
        if (filterListRefreshMode) filterListRefreshMode.disabled = false;
        if (filterListStaleEnabled) filterListStaleEnabled.disabled = false;
    }
}

async function refreshFilterList() {
    if (!refreshFilterListButton || !filterListUrlInput) return;
    refreshFilterListButton.setAttribute('aria-busy', 'true');
    refreshFilterListButton.disabled = true;
    try {
        const describe = window.YTKitCore?.describeRemoteListUrl;
        if (typeof describe !== 'function') throw new Error('Filter-list service unavailable');
        const described = describe(filterListUrlInput.value);
        if (!described.ok) {
            if (NON_PUBLIC_FILTER_LIST_REASONS.has(described.reason)) {
                setFilterListStatus('filterListStatusPrivateHost',
                    'That address is on a private or local network. Filter lists must be served from a public HTTPS site.', 'error');
            } else {
                setFilterListStatus('filterListStatusInvalidUrl',
                    'Enter a full HTTPS address, with no username, password, or # fragment.', 'error');
            }
            return;
        }

        // Ask for this origin before any other await. Chromium hands the popup
        // click's transient activation to the first call only, so a preceding
        // storage round-trip would spend the gesture and the prompt would be
        // suppressed. Requesting an already-granted origin resolves true with
        // no prompt, which is why there is no contains() pre-check here.
        try {
            await requestOptionalHostOrigins([described.originPattern]);
        } catch (error) {
            if (isOptionalHostPermissionError(error)) {
                setFilterListStatus('filterListStatusPermissionNeeded',
                    'Astra Deck needs your permission to read from that site. Choose Allow when your browser asks.', 'error');
                return;
            }
            throw error;
        }

        let permissionCleanup = { ok: true, removed: false, hostname: '' };
        if (popupState.settings.hideVideosFilterListUrl !== described.url) {
            const writeResult = await writeSetting('hideVideosFilterListUrl', described.url);
            permissionCleanup = writeResult.permissionCleanup;
            syncFilterListUrlInput(popupState.settings, { force: true });
        }
        const result = await sendPopupBridgeMessageToYouTubeTabs('YTKIT_REFRESH_FILTER_LIST');
        if (result?.noYouTubeTab) {
            setFilterListStatus('filterListStatusNoTab', 'Open a YouTube tab to refresh the remote list.', 'error');
            return;
        }
        if (!result?.ok) {
            if (result?.subscription) {
                renderFilterListSubscriptionStatus(described, result.subscription);
            } else {
                const reason = getFilterListFailureText(result?.code, result?.status);
                setFilterListStatusText(
                    t('filterListStatusRefreshReasonTpl', 'Could not refresh the list because {reason}.')
                        .replace('{reason}', reason), 'error');
            }
            return;
        }
        renderFilterListSubscriptionStatus(described, result.subscription);
        const cleanupFailure = formatPermissionCleanupFailure(permissionCleanup);
        if (cleanupFailure) {
            showStatus(cleanupFailure, 'error', 5200);
        } else if (result.notModified) {
            showStatus(t('filterListNotModified', 'Filter list checked; cached content is unchanged.'), 'success', 3200);
        } else {
            showStatus(t('filterListRefreshed', 'Video Hider filter list refreshed.'), 'success', 3200);
        }
    } catch (error) {
        setFilterListStatus('filterListStatusRefreshFail', 'Could not refresh the list. Check the address, then try again.', 'error');
        showStatus(failureText('filter-list-refresh', error, 'filterListRefreshFail', 'Filter-list refresh failed'), 'error', 5200);
    } finally {
        refreshFilterListButton.removeAttribute('aria-busy');
        refreshFilterListButton.disabled = false;
    }
}

async function clearConfiguredFilterListUrl() {
    if (!filterListUrlInput || filterListUrlInput.value.trim()) return;
    const configured = getConfiguredFilterListDescriptor();
    if (!configured.ok && !popupState.settings?.hideVideosFilterListUrl) {
        setFilterListStatus('filterListStatusReady', 'No filter list is being followed.');
        return;
    }
    filterListUrlInput.disabled = true;
    if (refreshFilterListButton) refreshFilterListButton.disabled = true;
    try {
        const result = await writeSetting('hideVideosFilterListUrl', '');
        if (typeof persistedDomains?.sanitizeVideoFilterListSubscription === 'function') {
            await storageSet({
                [STORAGE_KEYS.filterListSubscription]: persistedDomains.sanitizeVideoFilterListSubscription({})
            });
        }
        syncFilterListUrlInput(popupState.settings, { force: true });
        await refreshFilterListStatus();
        renderDataFlowPanel();
        renderSchemaOverview();
        const cleanupFailure = formatPermissionCleanupFailure(result.permissionCleanup);
        if (cleanupFailure) {
            showStatus(cleanupFailure, 'error', 5200);
        } else {
            showStatus(t('filterListStoppedTpl',
                'Stopped following {host}. No filter-list-only site access remains.')
                .replace('{host}', configured.ok ? configured.hostname : t('optionalHostPrevious', 'the previous host')),
            'success', 3600);
        }
    } catch (error) {
        console.warn('[Astra Deck popup] Filter-list clear failed:', error);
        showStatus(t('filterListStopFailed', 'Could not stop following the filter list.'), 'error', 4800);
        syncFilterListUrlInput(popupState.settings, { force: true });
    } finally {
        filterListUrlInput.disabled = false;
        if (refreshFilterListButton) refreshFilterListButton.disabled = false;
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
        let permissionCleanup = { ok: true, removed: false, hostname: '' };
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
                'That file is not an Astra Deck backup. Choose the .json file produced by Export. A valid backup contains an "exportVersion" field.'));
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
                'Import stopped. Astra Deck could not save an undo point to extension storage, so export a backup first.'),
                'error', 6000);
            return;
        }
        // The undo point above covers a mistake the user notices while Astra
        // Deck is still installed. A file on disk covers everything else, and
        // it has to be written before the first overwrite or it is worthless.
        let preImportBackupName = '';
        try {
            const backupTranscript = await readAllTranscriptRecords({ allowUnavailable: true });
            preImportBackupName = await downloadBackupFile(
                buildExportData(currentLocal, backupTranscript.records),
                'astra_deck_pre_import_backup_'
                    + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
                    + '.json'
            );
        } catch (backupError) {
            // A failed safety copy must not abort an import the user asked for
            // — the undo point is already staged. Say so instead of going quiet.
            console.warn('[Astra Deck popup] Pre-import backup file failed:', backupError);
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
                permissionCleanup = result.permissionCleanup;
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
                'Backup imported. Click Undo Import to restore the previous state. The undo point lasts 7 days and survives closing the browser.');
        const previewSummary = t('statusImportPreviewSummaryTpl', 'Preview: {preview}.')
            .replace('{preview}', previewText);
        const importSummary = t('statusImportSummaryTpl', '{status} {preview}')
            .replace('{status}', importedStatus)
            .replace('{preview}', previewSummary);
        const backupNote = preImportBackupName
            ? t('statusImportBackupWrittenTpl',
                'Your previous data was saved to {file} first.')
                .replace('{file}', preImportBackupName)
            : t('statusImportBackupFileFailed',
                'Astra Deck could not save a backup file of your previous data first, so Undo Import is the only way back.');
        const cleanupFailure = formatPermissionCleanupFailure(permissionCleanup);
        const importMessage = importSummary + ' ' + backupNote;
        showStatus(cleanupFailure ? importMessage + ' ' + cleanupFailure : importMessage,
            cleanupFailure ? 'error' : 'success', cleanupFailure ? 7600 : 6400);
    } catch (error) {
        showStatus(failureText('settings-import', error, 'statusImportFail', 'Import failed'), 'error', 4200);
    } finally {
        importFileInput.value = '';
        importButton.removeAttribute('aria-busy');
        importButton.disabled = false;
        // Reconcile the recovery affordance after every exit path. Rollback
        // itself may throw when the owning YouTube tab disappears, but a
        // staged snapshot must still surface Undo Import.
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
                'Undo Import is no longer available. The undo point expired after 7 days.'),
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
        showStatus(failureText('settings-import-undo', error, 'statusImportUndoFail', 'Undo Import failed'), 'error', 4200);
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
                'Astra Downloader install prompts re-enabled. Reload a YouTube tab to see them.'),
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
                'Open a YouTube tab first. The popup needs one to reach Astra Downloader.'),
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
            showStatus(t('statusYtdlpUpdateFailedTpl', 'yt-dlp update failed. {error}{recovery}')
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
                'Open a YouTube tab first. The popup needs one to reach Astra Downloader.'),
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
            showStatus(t('statusCompanionUpdateFailedTpl', 'Astra Downloader update failed. {error}')
                .replace('{error}', err), 'error', 7200);
        }
    } finally {
        updateCompanionButton.removeAttribute('aria-busy');
        updateCompanionButton.disabled = false;
    }
}

// Undo grace period for Reset and Import. The bulk payload has always
// lived in extension IndexedDB (persistedDomains.writeExtensionSnapshot),
// which survives a browser restart; only the small pointer to it used to
// live in ext.storage.session, which the browser wipes on exit. That made
// the undo for the two most destructive actions in the product evaporate
// the moment the user closed the browser — reset, quit, reopen, and there
// was no path back. The pointer is durable now, in ext.storage.local,
// bounded by UNDO_SNAPSHOT_RETENTION_MS so a forgotten snapshot cannot sit
// in IndexedDB forever and cannot overwrite weeks of later real edits. The
// undo button is auto-shown when a live snapshot exists and auto-hidden
// when it's consumed, expired, or absent.
//
// The YouTube page-state snapshot below stays session-scoped on purpose:
// it is keyed to a tab id, and tab ids do not survive a restart.
const IMPORT_SNAPSHOT_KEY = '_importSnapshot';
const RESET_SNAPSHOT_KEY = '_resetSnapshot';
const YOUTUBE_STATE_RESET_SNAPSHOT_KEY = '_youtubeStateResetSnapshot';
const UNDO_SNAPSHOT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
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
        showStatus(failureText('youtube-state-reset', error, 'statusYoutubeStateResetFail', 'YouTube state reset failed'), 'error', 6200);
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
        showStatus(failureText('youtube-state-undo', error, 'statusYoutubeStateUndoFail', 'YouTube state Undo failed'), 'error', 6200);
    } finally {
        undoYoutubeStateButton.removeAttribute('aria-busy');
        undoYoutubeStateButton.disabled = false;
    }
}

function sessionStorageAvailable() {
    return !!(ext && ext.storage && ext.storage.session);
}

function undoPointerStorageAvailable() {
    return !!(ext && ext.storage && ext.storage.local);
}

function createSnapshotId(kind) {
    const randomPart = globalThis.crypto?.randomUUID?.()
        || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${kind}-${randomPart}`;
}

async function createCoordinatedSnapshot(kind, options = {}) {
    if (!persistedDomains) throw new Error('Persisted-domain service unavailable');
    if (!undoPointerStorageAvailable()) throw new Error('Extension storage is unavailable; recoverable changes are disabled');
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
    const snapshot = { ...(items || {}) };
    // The undo pointers now live in the same area this snapshot copies.
    // Restoring one would resurrect a pointer whose IndexedDB payload is
    // already gone, so the snapshot never carries them.
    delete snapshot[IMPORT_SNAPSHOT_KEY];
    delete snapshot[RESET_SNAPSHOT_KEY];
    return snapshot;
}

async function restoreLocalStorageSnapshot(snapshot) {
    await storageClear();
    if (snapshot && Object.keys(snapshot).length > 0) {
        await callExtensionApi(ext?.storage?.local, 'set', snapshot);
    }
}

function undoSnapshotExpired(snapshot) {
    const createdAt = Number(snapshot?.createdAt);
    if (!Number.isFinite(createdAt) || createdAt <= 0) return true;
    // A clock that moved backwards must not delete a good snapshot, so only
    // forward age expires one.
    return Date.now() - createdAt > UNDO_SNAPSHOT_RETENTION_MS;
}

async function readDurableSnapshot(key) {
    if (!undoPointerStorageAvailable()) return null;
    let snap = null;
    try {
        const items = await callExtensionApi(ext.storage.local, 'get', key);
        snap = items && items[key];
    } catch (_) {
        // reason: a failed pointer read presents as "no undo available"
        return null;
    }
    if (!snap || typeof snap !== 'object') return null;
    if (undoSnapshotExpired(snap)) {
        // Retention bound. The IndexedDB payload is the large half, so it goes
        // with the pointer rather than being left behind as an orphan.
        await discardCoordinatedSnapshot(snap);
        await clearDurableSnapshot(key);
        return null;
    }
    return snap;
}

async function writeDurableSnapshot(key, snapshot) {
    if (!undoPointerStorageAvailable()) return false;
    try {
        await callExtensionApi(ext.storage.local, 'set', { [key]: snapshot });
        return true;
    } catch (_) {
        // reason: pointer write failed; treat as no-snapshot, undo unavailable
        return false;
    }
}

async function clearDurableSnapshot(key) {
    if (!undoPointerStorageAvailable()) return;
    try {
        await callExtensionApi(ext.storage.local, 'remove', key);
    } catch (_) {
        // reason: remove failure is benign; the retention bound collects it later
    }
}

async function readImportSnapshot() {
    return readDurableSnapshot(IMPORT_SNAPSHOT_KEY);
}

async function writeImportSnapshot(snapshot) {
    const previous = await readImportSnapshot();
    if (previous?.snapshotId && previous.snapshotId !== snapshot?.snapshotId) {
        await discardCoordinatedSnapshot(previous);
    }
    return writeDurableSnapshot(IMPORT_SNAPSHOT_KEY, snapshot);
}

async function clearImportSnapshot() {
    return clearDurableSnapshot(IMPORT_SNAPSHOT_KEY);
}

async function readResetSnapshot() {
    return readDurableSnapshot(RESET_SNAPSHOT_KEY);
}

async function writeResetSnapshot(snapshot) {
    const previous = await readResetSnapshot();
    if (previous?.snapshotId && previous.snapshotId !== snapshot?.snapshotId) {
        await discardCoordinatedSnapshot(previous);
    }
    return writeDurableSnapshot(RESET_SNAPSHOT_KEY, snapshot);
}

async function clearResetSnapshot() {
    return clearDurableSnapshot(RESET_SNAPSHOT_KEY);
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
    // v4.47.0 NF14: applies immediately. The Undo Reset button already
    // provides the recovery surface — clicking Reset stages a snapshot,
    // surfaces the Undo button, and keeps it available for the retention
    // window even across a browser restart. Project policy bans
    // confirmation dialogs in favor of this pattern.
    resetButton.setAttribute('aria-busy', 'true');
    resetButton.disabled = true;
    if (storageBannerResetBtn) storageBannerResetBtn.disabled = true;
    try {
        const previousSettings = popupState.settings;
        let permissionCleanup = { ok: true, removed: false, hostname: '' };
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
            // The pre-EI2 copy blamed "data too large". The session payload
            // is a tiny descriptor now (the bulk goes to IndexedDB via
            // persistedDomains.writeExtensionSnapshot), so the only ways
            // writeSessionSnapshot returns false are an unavailable session API
            // or a rejected session write. Name that instead.
            showStatus(t('statusResetSnapshotFail',
                'Reset stopped. Astra Deck could not save an undo point to extension storage, so export a backup first.'),
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
                // storageClear() wiped the undo pointer along with everything
                // else. Put it back, or Reset destroys its own recovery path.
                [RESET_SNAPSHOT_KEY]: snapshot,
            });
            if (snapshot.pageSnapshotId) {
                await sendPersistedDataMessage({ action: 'clear' }, snapshot.pageOrigin);
            }
        } catch (error) {
            await restoreCoordinatedSnapshot(snapshot);
            await clearResetSnapshot();
            throw new Error(`Reset did not complete; previous data was restored: ${error.message}`);
        }
        // Permissions live outside extension storage, so revoke only after the
        // recoverable data reset has committed. A failed revoke must not roll
        // restored user data back into a reset the user already requested.
        const filterListCleanup = await reconcileFilterListGrantTransition(previousSettings, {});
        const cobaltCleanup = await reconcileCobaltGrantTransition(previousSettings, {});
        permissionCleanup = filterListCleanup.ok === false ? filterListCleanup : cobaltCleanup;
        await renderStorageInfo();
        await loadSettings();
        await refreshOptionalHostGrantState({ render: false });
        render(popupState.settings, q.value);
        await refreshUndoResetVisibility();
        undoResetButton?.focus?.({ preventScroll: true });
        const resetMessage = !snapshot.pageSnapshotId
            ? t('statusResetDoneNoTranscript',
                'Extension data cleared with Undo available. Transcript data was left unchanged because no responsive YouTube tab was available. Stored AI credentials were retained.')
            : t('statusResetDoneUndo',
                'Portable settings, histories, queues, and transcript data cleared. Stored AI credentials are retained; use Delete credential to remove them. Click Undo Reset to restore them. The undo point lasts 7 days and survives closing the browser.');
        if (permissionCleanup.ok === false) {
            const permissionMessage = formatPermissionCleanupFailure(permissionCleanup);
            showStatus(resetMessage + ' ' + permissionMessage, 'error', 7200);
        } else {
            showStatus(resetMessage, 'success', 6000);
        }
    } catch (error) {
        showStatus(failureText('data-reset', error, 'statusResetFail', 'Reset failed'), 'error', 4200);
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
            // Snapshot vanished (retention window elapsed, or another surface
            // consumed it). Hide the button and report.
            setUndoResetVisible(false);
            showStatus(t('statusResetUndoExpired',
                'Undo is no longer available. The undo point expired after 7 days.'),
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
        await refreshOptionalHostGrantState({ render: false });
        render(popupState.settings, q.value);
        renderDataFlowPanel();
        renderSchemaOverview();
        if (restoredLocal[STORAGE_KEYS.settings]) {
            void broadcastSettingsReplaced(restoredLocal[STORAGE_KEYS.settings]);
        }
        setUndoResetVisible(false);
        showStatus(t('statusResetUndone', 'Reset undone. All data restored.'), 'success', 3200);
    } catch (error) {
        showStatus(failureText('data-reset-undo', error, 'statusResetUndoFail', 'Undo failed'), 'error', 4200);
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
        // Never swallow the browser's Ctrl/Cmd+wheel zoom gesture — cancelling
        // it would strip a zoom path low-vision users rely on inside the popup.
        if (event.ctrlKey || event.metaKey) return;
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
    // The transcript store lives in a YouTube-origin IndexedDB, so it needs a
    // tab rather than a storage read. Kept off the storage path so a missing
    // tab never delays the cards above it.
    void renderTranscriptIndexUsage();
    void renderSettingsSyncStatus();
    // best-effort selector-health snapshot from the active tab.
    // Hides the section if the user isn't on a YouTube page or if the
    // content script doesn't respond in time.
    void renderFeatureHealthPanel();
    void renderSelectorHealthDashboard();
    void renderExternalApiHealthDashboard();
    void renderFeaturePerfDashboard();
    // Watch connectivity for the life of the popup: an offline device gets a
    // named cause instead of a generic failure, and reconnecting re-checks
    // provider health without the user reopening anything.
    installConnectivityWatch();

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
            // Match the storage-change path: a late capability probe must not
            // rebuild and discard a focused inline editor mid-entry.
            if (!schemaOverviewList || !schemaOverviewList.contains(document.activeElement)) {
                renderSchemaOverview();
            }
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
        // sendPanelOpenMessage waits up to 8s for an ack. Without a busy state
        // the button looked idle for that whole window, and every extra click
        // started another flight — each of which could fall through to
        // tabs.create and open its own YouTube tab.
        if (openPanelButton.disabled) return;
        openPanelButton.disabled = true;
        openPanelButton.setAttribute('aria-busy', 'true');
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
        } finally {
            openPanelButton.removeAttribute('aria-busy');
            openPanelButton.disabled = false;
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
                if (openSidePanelBtn.disabled) return;
                openSidePanelBtn.disabled = true;
                openSidePanelBtn.setAttribute('aria-busy', 'true');
                try {
                    const [tab] = await callExtensionApi(ext?.tabs, 'query', { active: true, lastFocusedWindow: true });
                    await openSidePanel({ tabId: tab?.id });
                    window.close();
                } catch (err) {
                    showStatus(failureText('open-dashboard', err, 'statusOpenDashboardFail', 'Could not open dashboard'), 'error', 3000);
                } finally {
                    openSidePanelBtn.removeAttribute('aria-busy');
                    openSidePanelBtn.disabled = false;
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
    if (filterListRefreshMode) {
        filterListRefreshMode.addEventListener('change', () => {
            const refreshMode = ['daily', 'weekly', 'manual'].includes(filterListRefreshMode.value)
                ? filterListRefreshMode.value
                : 'daily';
            void updateFilterListSubscriptionPreferences({ refreshMode });
        });
    }
    if (filterListStaleEnabled) {
        filterListStaleEnabled.addEventListener('change', () => {
            void updateFilterListSubscriptionPreferences({ staleEnabled: filterListStaleEnabled.checked });
        });
    }
    if (filterListUrlInput) {
        filterListUrlInput.addEventListener('change', () => {
            if (!filterListUrlInput.value.trim()) void clearConfiguredFilterListUrl();
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
    // The banner's Reset routes through the same resetAllData() flow as the
    // primary one, so it stages the undo snapshot and re-stamps the onboarding
    // sentinels. A direct storageClear() here would be an unrecoverable reset
    // reachable only from the banner. (There is no PIN in this surface; the
    // comment that claimed one never matched the code.)
    if (storageBannerResetBtn) storageBannerResetBtn.addEventListener('click', () => { void resetAllData(); });
    if (transcriptIndexRecover) {
        transcriptIndexRecover.addEventListener('click', () => { void recoverTranscriptIndex(); });
    }
})();
