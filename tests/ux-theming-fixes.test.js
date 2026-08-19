'use strict';

// Regression tests for the 2026-06-10 UX / accessibility / theming pass.
// Each test pins a source contract so refactors can't silently
// reintroduce the audited problem:
//   1. Owner Stylebot preset gated behind html.ytkit-clean-ui (cleanUiPreset)
//   2. Settings-panel focus ring uses the strong --ytkit-focus-ring token
//   3. Light-theme overrides exist for every dark-only inline widget family
//   4. --ytkit-text-muted meets WCAG AA on the panel surface
//   5. Reduced-motion coverage for entrance animations + badge pulse;
//      forced-colors CSS injected unconditionally
//   6. No stadium-pill radii on transcript eyebrow / search meta
//   7. Playback stats overlay exposes toggle state and design-system text
//   8. Companion microcopy standardized on "Astra Downloader"
//   9. Feature preview tooltips reachable by keyboard / assistive tech

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(repoRoot, ...p), 'utf8');

const earlyCss = read('extension', 'early.css');
const ytkitSource = read('extension', 'ytkit.js');
const downloadUiSource = read('extension', 'features', 'download-ui', 'index.js');
const settingsPanelModuleSource = read('extension', 'features', 'settings-panel', 'index.js');
const settingsVisualSystemSource = read('extension', 'core', 'settings-visual-system.js');
const settingsOverlaySmokeSource = read('scripts', 'smoke-settings-overlay.js');
const userscriptSource = read('YTKit-core.user.js') + '\n' + read('YTKit.user.js');
const defaultSettings = JSON.parse(read('extension', 'default-settings.json'));
const schemaModule = require('../extension/core/settings-schema.js');

const LOCALES = ['de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt_BR', 'ru', 'zh_CN'];

// Every source that ships inline widget CSS into the page. Features are being
// peeled out of ytkit.js one at a time, so a theming contract that only reads
// the monolith goes quiet the moment its feature moves. Read the whole shipped
// set instead: the question is whether the extension injects a light override,
// not which file the string happens to sit in today.
const featuresDir = path.join(repoRoot, 'extension', 'features');
const shippedInlineCss = [
    ytkitSource,
    ...fs.readdirSync(featuresDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(featuresDir, entry.name, 'index.js'))
        .filter((file) => fs.existsSync(file))
        .map((file) => fs.readFileSync(file, 'utf8'))
].join('\n');

// ── 1. Compact Clean UI preset gating ──

test('early.css ships no unguarded owner-preset rules (toast suppression et al.)', () => {
    // Every selector from the old unconditional block must now only appear
    // scoped under html.ytkit-clean-ui. An unguarded occurrence would
    // re-suppress the product's only feedback/Undo surface for every install.
    const personalSelectors = [
        '.ytkit-brand-intro',
        '.ytkit-brand-badges',
        '.ytkit-search-container',
        '.ytkit-pane-header',
        '.ytkit-nav-count',
        '.ytkit-shortcut',
        '.ytkit-version',
        'button.ytkit-nav-btn',
        'div.ytkit-nav-list',
        'div.ytkit-global-toast',
        'div.ytkit-subs-load-banner'
    ];
    for (const selector of personalSelectors) {
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const occurrences = earlyCss.match(new RegExp(escaped, 'g')) || [];
        const guarded = earlyCss.match(new RegExp('html\\.ytkit-clean-ui ' + escaped, 'g')) || [];
        assert.ok(occurrences.length > 0, `early.css must still carry ${selector} for the opt-in preset`);
        assert.equal(occurrences.length, guarded.length,
            `every early.css occurrence of ${selector} must be scoped under html.ytkit-clean-ui`);
    }
});

test('early.css owner-row margin rule pairs with the avatar-hide opt-out guard', () => {
    assert.match(earlyCss,
        /html:not\(\.ytkit-restore-native-ui\) ytd-video-owner-renderer\.style-scope\.ytd-watch-metadata \{\s*margin-top: 10px !important;/,
        'owner-row margin must be gated behind html:not(.ytkit-restore-native-ui), matching the avatar hide it compensates for');
    assert.doesNotMatch(earlyCss,
        /^ytd-video-owner-renderer\.style-scope\.ytd-watch-metadata/m,
        'no unguarded owner-row margin rule may remain');
});

test('cleanUiPreset follows the new-feature recipe (defaults, schema, catalog, locales)', () => {
    // defaults: object in ytkit.js
    assert.match(ytkitSource, /cleanUiPreset: false,/,
        'ytkit.js defaults must seed cleanUiPreset: false');
    // default-settings.json sync
    assert.equal(defaultSettings.cleanUiPreset, false,
        'default-settings.json must catalogue cleanUiPreset: false');
    // settings-schema entry mirrors restoreNativeYouTubeUi metadata
    const entry = schemaModule.findSettingEntry('cleanUiPreset');
    const sibling = schemaModule.findSettingEntry('restoreNativeYouTubeUi');
    assert.ok(entry, 'settings-schema must carry cleanUiPreset');
    assert.equal(entry.defaultValue, false, 'cleanUiPreset must default OFF');
    assert.equal(entry.risk, 'safe', 'cleanUiPreset must use the safe risk profile');
    assert.equal(entry.category, sibling.category,
        'cleanUiPreset must share restoreNativeYouTubeUi’s schema category');
    // feature definition renders a toggle and flips the html class
    const start = ytkitSource.indexOf("id: 'cleanUiPreset'");
    assert.ok(start > -1, 'cleanUiPreset feature definition must exist');
    const block = ytkitSource.slice(start, start + 1500);
    assert.match(block, /classList\.add\('ytkit-clean-ui'\)/,
        'init() must add html.ytkit-clean-ui');
    assert.match(block, /classList\.remove\('ytkit-clean-ui'\)/,
        'destroy() must remove html.ytkit-clean-ui');
    assert.match(block, /group: 'Theme'/,
        'cleanUiPreset must render alongside restoreNativeYouTubeUi in the Theme group');
    // locale seeding across all 10 bundles
    for (const locale of LOCALES) {
        const messages = JSON.parse(read('extension', '_locales', locale, 'messages.json'));
        assert.ok(messages.feature_cleanUiPreset_name?.message,
            `${locale} must seed feature_cleanUiPreset_name`);
        assert.ok(messages.feature_cleanUiPreset_desc?.message,
            `${locale} must seed feature_cleanUiPreset_desc`);
    }
});

// ── 2. Focus rings ──

test('settings-panel generic focus-visible rule uses the strong focus-ring token', () => {
    const ruleStart = ytkitSource.indexOf('#ytkit-settings-panel button:focus-visible');
    assert.ok(ruleStart > -1, 'generic panel focus-visible rule must exist');
    const rule = ytkitSource.slice(ruleStart, ytkitSource.indexOf('}', ruleStart));
    assert.match(rule, /box-shadow:\s*var\(--ytkit-focus-ring\)/,
        'panel focus ring must use the high-contrast --ytkit-focus-ring token, not the old 0.18-alpha shadow');
    assert.doesNotMatch(rule, /rgba\(255,107,74,0\.18\)/,
        'the invisible 1.26:1 focus shadow must be gone');
});

test('masthead trigger focus ring alpha raised to 0.8', () => {
    assert.match(ytkitSource,
        /\.ytkit-trigger-btn:focus-visible,[\s\S]{0,1200}?rgba\(var\(--ytkit-accent-rgb\),0\.8\) !important/,
        'the shared trigger/gear focus-visible rule must use accent alpha >= 0.8');
});

// ── 3. Light-theme overrides per widget family ──

test('settings panel search indexes metadata beyond visible name and description', () => {
    for (const [label, source] of [
        ['module', settingsPanelModuleSource],
        ['monolith', ytkitSource],
        ['userscript', userscriptSource]
    ]) {
        assert.ok(source.includes('card.dataset.searchText = ['),
            `${label} settings panel must build a searchable metadata index`);
        assert.ok(source.includes('f.group'),
            `${label} settings panel search must include category/group terms`);
        assert.ok(source.includes('f.type'),
            `${label} settings panel search must include control type terms`);
        assert.match(source, /const haystack = card\.dataset\.searchText \|\| `\$\{name\} \$\{desc\}`/,
            `${label} settings search must filter against the metadata index`);
    }
});

test('settings panel exposes persistent live status feedback for save/import/export/reset', () => {
    for (const [label, source] of [
        ['module', settingsPanelModuleSource],
        ['monolith', ytkitSource],
        ['userscript', userscriptSource]
    ]) {
        assert.ok(source.includes("footerStatus.id = 'ytkit-panel-status'"),
            `${label} settings panel must render the footer status live region`);
        assert.ok(source.includes("footerStatus.setAttribute('role', 'status')"),
            `${label} footer status must announce changes to assistive tech`);
        assert.ok(source.includes("setPanelStatus('Settings exported. The download is ready.', 'success')"),
            `${label} export path must update the live status`);
        assert.ok(source.includes('reset to defaults. Undo is available in the toast.'),
            `${label} reset path must explain the undo recovery state`);
    }
    assert.match(ytkitSource, /\.ytkit-panel-status\[data-tone="success"\]/,
        'monolith CSS must style successful footer status');
    assert.match(userscriptSource, /\.ytkit-panel-status\[data-tone="success"\]/,
        'userscript CSS must style successful footer status');
});

test('extension Takeout import keeps large-file and undo recovery parity', () => {
    for (const [label, source] of [
        ['settings module', settingsPanelModuleSource],
        ['extension fallback', ytkitSource]
    ]) {
        const start = source.indexOf("if (e.target.closest('#ytkit-import-history'))");
        assert.ok(start > -1, `${label} must handle Takeout import from the settings panel`);
        // Keep the complete handler in view as recovery/status details grow;
        // the previous 2.5 KB window truncated the maxBytes policy itself.
        const block = source.slice(start, start + 3500);
        assert.match(block, /handleFileImport\([\s\S]*\{\s*maxBytes:\s*500\s*\*\s*1024\s*\*\s*1024\s*\}/,
            `${label} must allow large YouTube Takeout history exports`);
        assert.ok(block.includes('const preImportStats = StorageManager.get(STORAGE_KEYS.watchTime, null);'),
            `${label} must snapshot watch-time state before import`);
        assert.ok(block.includes('const undoTarget = preImportStats !== null ? preImportStats : { days: {}, total: 0 };'),
            `${label} must restore the pre-import watch-time state from Undo, and the empty shape when there was none`);
        assert.ok(block.includes('StorageManager.setSync(STORAGE_KEYS.watchTime, undoTarget);'),
            `${label} undo must write the resolved restore target`);
        // The undo used to be inside `if (preImportStats !== null)`, so a
        // first-ever import — the case where the user is least sure — silently
        // got no undo at all. One contract, not two.
        assert.doesNotMatch(block, /if \(preImportStats !== null\) \{\s*showToast/,
            `${label} must not gate the undo affordance on there being prior watch-time data`);
        assert.ok(block.includes("'takeout-undo'") || block.includes('"takeout-undo"'),
            `${label} undo must notify storage listeners with a distinct Takeout undo source`);
    }
});

test('settings panel search copy matches the expanded filter behavior', () => {
    const en = JSON.parse(read('extension', '_locales', 'en', 'messages.json'));
    assert.equal(en.panelSearchPlaceholder.message, 'Search settings, pages, controls…');
    assert.equal(en.panelSearchAria.message, 'Search settings by name, page, category, or control type');
    assert.equal(en.panelSearchHint.message, 'Search by name, page, category, control type, or description.');
    for (const source of [settingsPanelModuleSource, ytkitSource, userscriptSource]) {
        assert.ok(source.includes('Search by name, page, category, control type, or description.'),
            'settings panel search hint must describe every indexed field');
        assert.ok(source.includes("mark.className = 'ytkit-search-mark'"),
            'settings panel search highlights must use the themed mark style');
    }
});

test('settings close tooltip avoids shortcut copy in every locale', () => {
    for (const locale of LOCALES) {
        const messages = JSON.parse(read('extension', '_locales', locale, 'messages.json'));
        assert.ok(messages.panelCloseTitle?.message,
            `${locale} must define panelCloseTitle`);
        assert.doesNotMatch(messages.panelCloseTitle.message, /\(Esc\)/,
            `${locale} close tooltip must not advertise a keyboard shortcut`);
    }
});

test('settings command-deck shell contracts live in the DOM builders and the v3 visual system', () => {
    // The stacked "premium refresh" / "command-center parity" / "mockup
    // parity" / "correction layer" !important sheets were deleted from
    // ytkit.js; extension/core/settings-visual-system.js (v3) is the single
    // cascade source of truth on top of the injectPanelStyles() base sheets.
    // DOM contracts stay pinned on the builders; cascade contracts moved to v3.
    assert.ok(settingsPanelModuleSource.includes("searchContainer.classList.add('ytkit-command-search')"),
        'extension settings search must live in the top command bar like the mockup');
    assert.ok(settingsPanelModuleSource.includes("footerActions.className = 'ytkit-action-stack ytkit-footer-actions'"),
        'extension settings module must render the mockup-style bottom action bar');
    assert.ok(settingsPanelModuleSource.includes("id: 'ytkit-close-footer'"),
        'bottom command bar must expose the prominent Close action from the mockup');
    assert.ok(settingsPanelModuleSource.includes("rail.className = 'ytkit-insights'"),
        'extension settings module must render the premium right-side insights rail');
    assert.ok(settingsPanelModuleSource.includes("statusHero.className = 'ytkit-status-hero'"),
        'extension settings module must render the mockup-style status hero in the inspector rail');
    assert.ok(ytkitSource.includes("rail.className = 'ytkit-insights'"),
        'extension settings monolith fallback must render the premium right-side insights rail');
    assert.ok(ytkitSource.includes("statusHeroIcon.className = 'ytkit-status-hero-icon'"),
        'settings inspector status hero must carry the green operational badge from the mockup');
    assert.ok(settingsVisualSystemSource.includes('.ytkit-status-hero-icon'),
        'v3 visual system must style the status hero operational badge');
    assert.ok(settingsPanelModuleSource.includes("stateSpan.className = 'ytkit-nav-state'"),
        'extension settings module must render nav completion indicators');
    assert.ok(ytkitSource.includes("stateSpan.className = 'ytkit-nav-state'"),
        'extension settings monolith fallback must render nav completion indicators');
    assert.ok(settingsPanelModuleSource.includes("id: 'ytkit-reset-active-section'"),
        'extension settings module must route a visible reset action to the active section');
    assert.ok(ytkitSource.includes("id: 'ytkit-reset-active-section'"),
        'extension settings monolith fallback must route a visible reset action to the active section');
    assert.ok(settingsPanelModuleSource.includes("['Last import', 'ytkit-insight-last-import', 'Not yet']"),
        'extension settings module must render the expanded recent activity rows');
    assert.ok(ytkitSource.includes("['Last import', 'ytkit-insight-last-import', 'Not yet']"),
        'extension settings monolith fallback must render the expanded recent activity rows');
    // Cascade contracts inherited from the folded layers, now owned by v3.
    assert.ok(settingsVisualSystemSource.includes('z-index: 2147483646 !important;'),
        'v3 must keep the settings panel above YouTube player chrome and ad overlays');
    assert.match(settingsVisualSystemSource, /#ytkit-overlay \{[\s\S]*?z-index:\s*2147483645 !important;/,
        'v3 must raise the backdrop with the panel');
    assert.ok(settingsVisualSystemSource.includes('.ytkit-header-live'),
        'v3 must style the live-apply status as a first-class header control');
    assert.ok(settingsVisualSystemSource.includes('.ytkit-insights'),
        'v3 must style the right-side insights rail');
    assert.match(ytkitSource, /\.ytkit-select-shell-chrome \{[\s\S]*?display:\s*none !important;/,
        'the decorative select chrome span must stay hidden by the base sheet');
});

test('every dark-only inline widget family has a light-theme override block', () => {
    const families = [
        'html:not([dark]) .ytkit-ryd-pill',
        'html:not([dark]) .ytkit-sub-toolbar',
        'html:not([dark]) .ytkit-sub-group-chip',
        'html:not([dark]) .ytkit-transcript-search-btn',
        'html:not([dark]) .ytkit-transcript-panel',
        'html:not([dark]) .ytkit-dl-popup',
        'html:not([dark]) .ytkit-monet-pill[data-tone="paid"]',
        'html:not([dark]) .ytkit-monet-pill[data-tone="sponsored"]',
        'html:not([dark]) .ytkit-monet-pill[data-tone="clean"]'
    ];
    for (const selector of families) {
        assert.ok(shippedInlineCss.includes(selector),
            `the extension must ship a light-theme override for ${selector}`);
    }
    // overrides lean on YouTube's own tokens with sane fallbacks
    assert.ok(shippedInlineCss.includes('var(--yt-spec-text-primary,#0f0f0f)'),
        'light overrides must use --yt-spec-text-primary with a fallback');
    assert.ok(shippedInlineCss.includes('var(--yt-spec-text-secondary,#606060)'),
        'light overrides must use --yt-spec-text-secondary with a fallback');
});

test('download and transcript light surfaces use readable semantic neutrals', () => {
    for (const [foreground, background, label] of [
        ['#5f6b79', '#ffffff', 'secondary text on white'],
        ['#4e5b6a', '#f1f3f6', 'control text on raised surface'],
        ['#a12a25', '#fff0ef', 'selected download option'],
        ['#075985', '#ffffff', 'transcript timestamp'],
    ]) {
        const parse = (hex) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
        const luminance = (hex) => {
            const [r, g, b] = parse(hex).map((value) => {
                const channel = value / 255;
                return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const first = luminance(foreground);
        const second = luminance(background);
        const ratio = (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
        assert.ok(ratio >= 4.5, `${label} must meet WCAG AA (got ${ratio.toFixed(2)}:1)`);
    }
    assert.match(ytkitSource, /html:not\(\[dark\]\) \.ytkit-transcript-meta__pill\[data-tone="warning"\]/);
    assert.match(ytkitSource, /html:not\(\[dark\]\) \.ytkit-dl-popup__chip\.is-active/);
});

// ── 4. Muted-text contrast ──

test('--ytkit-text-muted meets WCAG AA on the panel surface', () => {
    assert.match(ytkitSource, /--ytkit-text-muted:\s*#7e8ca3/,
        'muted token must be the audited #7e8ca3');
    assert.doesNotMatch(ytkitSource, /--ytkit-text-muted:\s*#6b7a90/,
        'the failing 3.87:1 #6b7a90 token must be gone');
    // Same relative-luminance math as scripts/check-contrast.js.
    const luminance = (r, g, b) => {
        const [rs, gs, bs] = [r, g, b].map((x) => {
            x = x / 255;
            return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };
    const parse = (hex) => [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16)
    ];
    const l1 = luminance(...parse('#7e8ca3'));
    const l2 = luminance(...parse('#181d27')); // --ytkit-bg-surface
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    assert.ok(ratio >= 4.5, `muted-on-surface contrast must be >= 4.5:1 (got ${ratio.toFixed(2)})`);
});

// ── 5. Reduced motion + forced colors ──

test('early.css globally disables entrance animations under prefers-reduced-motion', () => {
    const mediaStart = earlyCss.indexOf('@media (prefers-reduced-motion: reduce)');
    assert.ok(mediaStart > -1, 'early.css must carry a prefers-reduced-motion block');
    const block = earlyCss.slice(mediaStart, earlyCss.indexOf('}', earlyCss.indexOf('animation', mediaStart)) + 1);
    for (const selector of ['#ytkit-mediadl-install-prompt', '.ytkit-dl-progress', '.ytkit-dl-popup']) {
        assert.ok(block.includes(selector),
            `reduced-motion block must cover ${selector}`);
    }
    assert.match(block, /animation:\s*none !important/,
        'reduced-motion block must use !important so it also beats inline animations');
});

test('forced-colors CSS is injected unconditionally; the setting no longer gates it', () => {
    const start = ytkitSource.indexOf("id: 'forcedColorsSupport'");
    assert.ok(start > -1, 'forcedColorsSupport must exist');
    const block = ytkitSource.slice(start, start + 5000);
    assert.match(block, /ensureInjected\(\)/,
        'feature must expose an idempotent ensureInjected()');
    assert.match(block, /@media \(forced-colors: active\)/,
        'the media query stays the real gate');
    const destroyIdx = block.indexOf('destroy()');
    const destroyBlock = block.slice(destroyIdx, destroyIdx + 400);
    assert.doesNotMatch(destroyBlock, /_styleElement\?\.remove\(\)/,
        'toggling the legacy setting off must not strip the forced-colors stylesheet');
    assert.ok(
        ytkitSource.includes("getFeatureById('forcedColorsSupport')?.ensureInjected?.()"),
        'boot path must inject forced-colors support regardless of the setting');
});

// ── 6. Radii ──

test('transcript eyebrow and search meta use catalog radii (no stadium pills)', () => {
    const eyebrowStart = ytkitSource.indexOf('.ytkit-transcript-eyebrow {');
    assert.ok(eyebrowStart > -1, '.ytkit-transcript-eyebrow rule must exist');
    const eyebrow = ytkitSource.slice(eyebrowStart, ytkitSource.indexOf('}', eyebrowStart));
    assert.match(eyebrow, /border-radius:\s*6px/,
        'transcript eyebrow must use 6px radius (was a 20px-tall 10px-radius pill)');

    const metaRe = /\n\.ytkit-search-meta \{/;
    const metaMatch = metaRe.exec(ytkitSource);
    assert.ok(metaMatch, '.ytkit-search-meta rule must exist');
    const metaStart = metaMatch.index + 1;
    const meta = ytkitSource.slice(metaStart, ytkitSource.indexOf('}', metaStart));
    assert.match(meta, /border-radius:\s*6px/,
        'search meta chip must use 6px radius');
});

// ── 7. Playback stats overlay ──

test('playback stats overlay drops hacker-green text and exposes toggle state', () => {
    const start = ytkitSource.indexOf("id: 'playbackStatsOverlay'");
    assert.ok(start > -1, 'playbackStatsOverlay must exist');
    const block = ytkitSource.slice(start, start + 4000);
    assert.match(block, /color:#e8ecf4/,
        'overlay base text must use the design-system primary #e8ecf4');
    assert.doesNotMatch(block, /color:#0f0;/,
        'the #0f0 hacker-green base text must be gone');
    assert.match(block, /setAttribute\('aria-label', 'Toggle playback stats overlay'\)/,
        'STATS button must carry an accessible name');
    assert.match(block, /setAttribute\('aria-pressed', 'false'\)/,
        'STATS button must initialize aria-pressed');
    assert.match(block, /setAttribute\('aria-pressed', String\(show\)\)/,
        'STATS button must sync aria-pressed on toggle');
});

// ── 8. Microcopy ──

test('companion toasts standardize on "Astra Downloader" (no MediaDL prefix)', () => {
    assert.ok(!downloadUiSource.includes("'MediaDL: '"),
        'the user-facing MediaDL: toast prefix must be gone');
    assert.ok(downloadUiSource.includes('showDownloaderFailure(resp || {})'),
        'download error handling must route through classified recovery copy');
    assert.ok(downloadUiSource.includes("showToast(t('dlFailureTpl', 'Astra Downloader: {error} {advice}')"),
        'classified download failure toasts must use the localized Astra Downloader template');
    assert.ok(downloadUiSource.includes("t('toastDlReady', 'Astra Downloader is ready.')"),
        'ready toast must say Astra Downloader is ready.');
    assert.ok(downloadUiSource.includes("t('toastDlStopped', 'Astra Downloader stopped. Starting it again…')"),
        'stopped toast must use the standardized name');
    assert.ok(downloadUiSource.includes("t('toastDlRequestFailed', 'Astra Downloader request failed.')"),
        'request-failed toast must use the standardized name');
    assert.ok(ytkitSource.includes("label: 'Install Astra Downloader'"),
        'context-menu installer entry must use the standardized name');
    // Renaming the failure default must not break the repair-button heuristic.
    assert.ok(downloadUiSource.includes('/cookie|yt-dlp|unauthorized|local downloader|astra downloader/i'),
        'needsRepair regex must match both old server-supplied and new client failure text');
    // The en locale serves before the inline fallback — it must agree.
    const en = JSON.parse(read('extension', '_locales', 'en', 'messages.json'));
    assert.equal(en.toastDlReady.message, 'Astra Downloader is ready.',
        'en locale must carry the renamed ready toast');
    assert.equal(en.toastDlRequestFailed.message, 'Astra Downloader request failed.',
        'en locale must carry the renamed request-failed toast');
});

// ── 9. Feature preview tooltips for keyboard / AT users ──

test('feature preview tooltips trigger on focus-within and mirror into aria-description', () => {
    assert.ok(ytkitSource.includes('.ytkit-feature-card.ytkit-has-preview:focus-within::after'),
        'preview tooltip must also open via :focus-within for keyboard users');
    assert.ok(ytkitSource.includes("card.setAttribute('aria-description', previewText)"),
        'data-preview must be mirrored into aria-description for assistive tech');
});

// ── 10. Mobile settings bounds (render smoke) ──

test('render smoke keeps mobile navigation and footer bounded', () => {
    // The "Premium command-deck correction layer" that once carried these
    // mobile fixes in ytkit.js is gone; v3 owns the cascade and the render
    // smoke is the behavioral gate.
    assert.match(settingsOverlaySmokeSource, /--fallback-only/,
        'render smoke must expose a fallback-only mode');
    assert.match(settingsOverlaySmokeSource, /mobile footer consumes/,
        'render smoke must fail oversized mobile footers');
    assert.match(settingsOverlaySmokeSource, /mobile navigation consumes/,
        'render smoke must fail oversized mobile navigation');
    assert.match(settingsOverlaySmokeSource, /mobile navigation target is clipped/,
        'render smoke must fail clipped mobile navigation targets');
    assert.match(settingsVisualSystemSource, /grid-template-columns:\s*none !important;/,
        'v3 mobile nav rail must neutralize the base sheet grid template so buttons keep their tap width');
});

test('settings command search mirrors icon and actions without RTL overlap', () => {
    const moduleSource = read('extension/features/settings-panel/index.js');
    const monolithSource = read('extension/ytkit.js');
    for (const source of [moduleSource, monolithSource]) {
        assert.match(source, /\[dir="rtl"\] \.ytkit-command-search \.ytkit-search-icon \{ left: auto !important; right: 16px !important; \}/);
        assert.match(source, /\[dir="rtl"\] \.ytkit-command-search \.ytkit-search-actions \{ right: auto !important; left: 8px !important; \}/);
        assert.match(source, /\[dir="rtl"\] \.ytkit-command-search \.ytkit-search-input \{ padding: 0 44px 0 78px !important; \}/);
    }
    const smoke = read('scripts/smoke-settings-overlay.js');
    assert.match(smoke, /RTL search icon overlaps its actions/);
});

test('the settings search field fills its row so the placeholder is not clipped', () => {
    const monolith = read('extension/ytkit.js');
    const start = monolith.search(/\.ytkit-search-input \{[^}]*min-height: 36px;/);
    assert.ok(start > -1, 'the command-center search-input rule must exist');
    const rule = monolith.slice(start, start + 600);
    assert.match(rule, /width: 100%;/,
        'an unsized input stops at its intrinsic ~20-character width');
    assert.match(rule, /box-sizing: border-box;/,
        'the large right padding reserving room for the clear button must stay inside that width');

    // The icon declared `left` while statically positioned, so it did nothing
    // except occupy inline space beside the input — that is what kept the input
    // narrow and cut the placeholder mid-word in all six rendered states.
    const iconStart = monolith.indexOf('.ytkit-search-icon {', start);
    assert.ok(iconStart > -1);
    const iconRule = monolith.slice(iconStart, iconStart + 700);
    assert.match(iconRule, /position: absolute;/,
        'left/right offsets require a positioned element');
    assert.match(iconRule, /transform: translateY\(-50%\);/,
        'the icon must be centred against the field it overlays');
});

test('blue light filter stays opt-in with a master toggle and nested intensity control', () => {
    assert.equal(defaultSettings.blueLightFilter, false,
        'Blue Light Filter must remain disabled on clean installs');
    assert.equal(defaultSettings.blueLightIntensity, 30,
        'Blue Light Filter must retain its conservative default intensity');

    for (const [label, source] of [
        ['extension', ytkitSource],
        ['userscript', userscriptSource]
    ]) {
        const masterStart = source.indexOf("id: 'blueLightFilter'");
        const intensityStart = source.indexOf("id: 'blueLightIntensity'", masterStart);
        const nextFeatureStart = source.indexOf("id: 'disableInfiniteScroll'", intensityStart);
        assert.ok(masterStart > -1 && intensityStart > masterStart && nextFeatureStart > intensityStart,
            `${label} must define the Blue Light Filter toggle before its intensity sub-feature`);

        const masterBlock = source.slice(masterStart, intensityStart);
        const intensityBlock = source.slice(intensityStart, nextFeatureStart);
        assert.doesNotMatch(masterBlock, /type:\s*'range'/,
            `${label} master feature must render as a boolean toggle`);
        assert.match(intensityBlock, /type:\s*'range'/,
            `${label} intensity sub-feature must render as a range control`);
        assert.match(intensityBlock, /parentId:\s*'blueLightFilter'/,
            `${label} intensity control must be nested under the master toggle`);
        assert.match(intensityBlock, /min:\s*10[\s\S]*max:\s*80[\s\S]*step:\s*5/,
            `${label} intensity control must keep the audited 10-80 range`);
    }
});

test('fallback Takeout import exposes the same Undo toast contract as the module', () => {
    const marker = "if (e.target.closest('#ytkit-import-history'))";
    const fallbackStart = ytkitSource.indexOf(marker, ytkitSource.indexOf('function attachUIEventListeners'));
    assert.ok(fallbackStart > -1, 'fallback Takeout handler must exist');
    // Bound on the handler's own closing landmark rather than a fixed byte
    // window, which silently truncates as the handler grows.
    const fallbackEnd = ytkitSource.indexOf('maxBytes: 500 * 1024 * 1024', fallbackStart);
    assert.ok(fallbackEnd > fallbackStart, 'fallback Takeout handler must end at its size policy');
    const fallbackBlock = ytkitSource.slice(fallbackStart, fallbackEnd);
    // The Undo label goes through the locale pipeline like every other action
    // label; it used to be a bare English literal in both copies.
    assert.match(fallbackBlock, /showToast\(result\.message, '#22c55e',[\s\S]*?text:\s*t\('toastActionUndo', 'Undo'\)/,
        'fallback Takeout success must use the action-capable toast API with a localized label');
    assert.match(settingsPanelModuleSource, /showToast\(result\.message, '#22c55e',[\s\S]*?text:\s*t\('toastActionUndo', 'Undo'\)/,
        'module Takeout success must retain the same action-capable toast API with a localized label');
});

// ── Default-ON injected chrome must be legible on YouTube's light theme ──
// These four surfaces ship enabled on a fresh install and painted white-alpha
// text/chrome straight onto the light page background: the watch-page restyle
// (title, description, info row, comments header, compose placeholder), the
// thin scrollbar thumb, the injected Download / Hide All buttons, and the
// masthead quick-link launcher. Every other injected surface had already been
// given an html:not([dark]) lane; these were missed because no gate renders
// injected CSS against a light fixture.

test('default-ON injected surfaces carry html:not([dark]) light-theme lanes', () => {
    const required = [
        // watchPageRestyle
        ['ytd-watch-metadata h1.ytd-watch-metadata yt-formatted-string', 'watch-page title'],
        ['ytd-watch-metadata #description-inline-expander #snippet', 'description snippet'],
        ['ytd-watch-metadata #info-container', 'watch-page info row'],
        ['ytd-comments-header-renderer #count', 'comments header count'],
        ['ytd-comments-header-renderer ytd-comment-simplebox-renderer #placeholder-area', 'comment compose placeholder'],
        // thinScrollbar
        ['*::-webkit-scrollbar-thumb', 'scrollbar thumb'],
        // injected action buttons + masthead launcher
        ['.ytkit-watch-action-btn', 'watch action button'],
        ['.ytkit-ql-launcher', 'quick-link launcher'],
    ];
    for (const [selector, label] of required) {
        assert.ok(
            ytkitSource.includes(`html:not([dark]) ${selector}`),
            `${label} must have an html:not([dark]) light-theme override (selector: ${selector})`
        );
    }
});

test('the injected download icon inherits its colour instead of hardcoding white', () => {
    // The fill:currentColor correction previously lived only inside
    // watchPageRestyle's stylesheet, so disabling that feature left a white
    // icon on a light-theme action row.
    assert.doesNotMatch(ytkitSource, /setAttribute\('fill',\s*'white'\)/,
        'injected SVG icons must not hardcode a white fill');
    assert.match(ytkitSource, /path\.setAttribute\('fill',\s*'currentColor'\)/,
        'the download glyph must inherit the button colour');
});

// ── Popover top-layer migration follow-ups (d4bebef5) ──
// The top layer paints by SHOW ORDER, not z-index. Making the settings panel a
// popover therefore silently undid the v4.50.1 fix that put panel-fired Undo
// toasts above it, and left behind the two download overlays whose
// z-index 2147483647 existed purely to beat the panel's 2147483646.
test('an open toast is re-raised when the settings panel popover opens', () => {
    const toastCore = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'toast.js'), 'utf8');
    assert.match(toastCore, /function raiseActiveToasts\(\)/,
        'the shared toast layer must expose a re-stacking helper');
    assert.match(toastCore, /toast\._restackDepth = \(toast\._restackDepth \|\| 0\) \+ 1;[\s\S]{0,120}?hidePopover\(\);[\s\S]{0,40}?showPopover\(\);/,
        're-stacking must close and reopen the popover under a restack counter');

    // Both panel copies must trigger it.
    assert.match(ytkitSource, /panel\.showPopover\(\);[\s\S]{0,260}?raiseActiveToasts\?\.\(\)/,
        'the monolith panel must re-raise toasts after showing');
    assert.match(settingsPanelModuleSource, /panel\.showPopover\(\);[\s\S]{0,260}?raiseActiveToasts\?\.\(\)/,
        'the settings-panel module must re-raise toasts after showing');

    // The close half of a re-stack must not be mistaken for a dismissal.
    for (const [label, source] of [
        ['monolith', ytkitSource],
        ['toast-dom module', fs.readFileSync(
            path.join(__dirname, '..', 'extension', 'core', 'toast-dom.js'), 'utf8')],
    ]) {
        assert.match(source, /if \(toast\._restackDepth > 0\) \{[\s\S]{0,80}?toast\._restackDepth -= 1;[\s\S]{0,40}?return;/,
            `${label} popover toggle handler must ignore a programmatic re-stack`);
    }
});

test('toast dismissal hides the popover only after the exit animation', () => {
    // `[popover]:not(:popover-open)` is display:none, so calling hidePopover()
    // before the fade meant popover-path toasts vanished instantly and the
    // parity-pinned fade branch never painted.
    const toastDom = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'toast-dom.js'), 'utf8');
    for (const [label, source] of [['toast-dom', toastDom], ['monolith', ytkitSource]]) {
        const idx = source.indexOf('const finishRemoval = () => {');
        assert.ok(idx > -1, `${label} must remove the toast through finishRemoval`);
        const region = source.slice(idx, idx + 1200);
        assert.match(region, /hidePopover\(\)/, `${label} finishRemoval must hide the popover`);
        assert.match(region, /setTimeout\(\(\) => \{[\s\S]{0,80}?finishRemoval\(\);[\s\S]{0,40}?\}, 180\)/,
            `${label} must defer removal (and the hide) until the fade completes`);
    }
});

test('the install prompt and download progress card enter the top layer', () => {
    const downloadUi = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'features', 'download-ui', 'index.js'), 'utf8');
    assert.match(downloadUi, /_raiseOverlay\(el\) \{[\s\S]{0,600}?setAttribute\('popover', 'manual'\)[\s\S]{0,200}?showPopover\(\)/,
        'a shared helper must raise an overlay into the top layer with a fallback');
    assert.match(downloadUi, /this\._raiseOverlay\(prompt\)/,
        'the install/repair prompt must be raised');
    assert.match(downloadUi, /MediaDLManager\._raiseOverlay\(panel\)/,
        'the download progress card must be raised');
});
