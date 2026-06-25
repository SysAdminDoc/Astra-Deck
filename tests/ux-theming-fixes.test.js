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
const defaultSettings = JSON.parse(read('extension', 'default-settings.json'));
const schemaModule = require('../extension/core/settings-schema.js');

const LOCALES = ['de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt_BR', 'ru', 'zh_CN'];

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

test('every dark-only inline widget family has a light-theme override block', () => {
    const families = [
        'html:not([dark]) .ytkit-ryd-pill',
        'html:not([dark]) .ytkit-sub-toolbar',
        'html:not([dark]) .ytkit-sub-group-chip',
        'html:not([dark]) .ytkit-transcript-search-btn',
        'html:not([dark]) .ytkit-monet-pill[data-tone="paid"]',
        'html:not([dark]) .ytkit-monet-pill[data-tone="sponsored"]',
        'html:not([dark]) .ytkit-monet-pill[data-tone="clean"]'
    ];
    for (const selector of families) {
        assert.ok(ytkitSource.includes(selector),
            `ytkit.js must carry a light-theme override for ${selector}`);
    }
    // overrides lean on YouTube's own tokens with sane fallbacks
    assert.ok(ytkitSource.includes('var(--yt-spec-text-primary,#0f0f0f)'),
        'light overrides must use --yt-spec-text-primary with a fallback');
    assert.ok(ytkitSource.includes('var(--yt-spec-text-secondary,#606060)'),
        'light overrides must use --yt-spec-text-secondary with a fallback');
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
    for (const selector of ['#ytkit-mediadl-install-prompt', '.ytkit-dl-progress', '.ytkit-dl-popup', '#ytkit-whats-new-badge']) {
        assert.ok(block.includes(selector),
            `reduced-motion block must cover ${selector}`);
    }
    assert.match(block, /animation:\s*none !important/,
        'reduced-motion block must use !important so it also beats the inline badge animation');
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
    assert.ok(!ytkitSource.includes("'MediaDL: '"),
        'the user-facing MediaDL: toast prefix must be gone');
    assert.ok(ytkitSource.includes("showToast('Astra Downloader: ' + (resp.error || 'Unknown error')"),
        'download error toast must use the Astra Downloader prefix');
    assert.ok(ytkitSource.includes("t('toastDlReady', 'Astra Downloader is ready.')"),
        'ready toast must say Astra Downloader is ready.');
    assert.ok(ytkitSource.includes("t('toastDlStopped', 'Astra Downloader stopped. Starting it again…')"),
        'stopped toast must use the standardized name');
    assert.ok(ytkitSource.includes("t('toastDlRequestFailed', 'Astra Downloader request failed.')"),
        'request-failed toast must use the standardized name');
    assert.ok(ytkitSource.includes("label: 'Install Astra Downloader'"),
        'context-menu installer entry must use the standardized name');
    // Renaming the failure default must not break the repair-button heuristic.
    assert.ok(ytkitSource.includes('/cookie|yt-dlp|unauthorized|local downloader|astra downloader/i'),
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
