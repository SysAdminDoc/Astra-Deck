'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const visualSystemPath = path.join(repoRoot, 'extension', 'core', 'settings-visual-system.js');
const visualSystemSource = fs.readFileSync(visualSystemPath, 'utf8');
const manifest = require('../extension/manifest.json');
const syncUserscript = fs.readFileSync(path.join(repoRoot, 'sync-userscript.js'), 'utf8');
const settingsPanel = fs.readFileSync(
    path.join(repoRoot, 'extension', 'features', 'settings-panel', 'index.js'),
    'utf8'
);
const shell = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
const userscript = fs.readFileSync(path.join(repoRoot, 'YTKit.user.js'), 'utf8');
const overlaySmoke = fs.readFileSync(path.join(repoRoot, 'scripts', 'smoke-settings-overlay.js'), 'utf8');

test('settings visual system replaces boxed dashboard chrome with a compact settings document', () => {
    assert.match(visualSystemSource, /settings visual system v4 — calm, compact document UI/);
    assert.match(
        visualSystemSource,
        /\.ytkit-feature-card\s*\{[\s\S]*?min-height:\s*70px[\s\S]*?border:\s*0[\s\S]*?border-bottom:\s*1px solid var\(--ytkit-v3-border\)[\s\S]*?background:\s*transparent/
    );
    assert.match(visualSystemSource, /\.ytkit-pane-title h2\s*\{[\s\S]*?font-size:\s*29px/);
    assert.match(visualSystemSource, /\.ytkit-feature-name\s*\{[\s\S]*?font-size:\s*16px/);
    assert.match(visualSystemSource, /\.ytkit-feature-desc\s*\{[\s\S]*?font-size:\s*14px[\s\S]*?white-space:\s*nowrap/);
    assert.match(
        visualSystemSource,
        /\.ytkit-feature-glyph,[\s\S]*?\.ytkit-feature-meta,[\s\S]*?\.ytkit-feature-badge\s*\{\s*display:\s*none/
    );
    assert.match(visualSystemSource, /\.ytkit-info-card\s*\{\s*grid-column:\s*1 \/ -1/);
    assert.doesNotMatch(settingsPanel, /card\.style\.cssText = 'background: linear-gradient/);
    assert.match(
        visualSystemSource,
        /\.ytkit-feature-card\.ytkit-card-enabled\s*\{[\s\S]*?background:\s*transparent[\s\S]*?box-shadow:\s*none/
    );
    assert.match(
        visualSystemSource,
        /\.ytkit-mediadl-banner\[data-state\][\s\S]*?background:\s*transparent[\s\S]*?\.ytkit-mediadl-banner__status[\s\S]*?color:\s*var\(--ytkit-v3-muted\)/
    );
    assert.match(visualSystemSource, /\.ytkit-nav-btn\.active::before\s*\{\s*background:\s*var\(--ytkit-v3-accent\)/);
    assert.match(
        visualSystemSource,
        /\.ytkit-switch\.active \.ytkit-switch-thumb\s*\{[\s\S]*?inset-inline-start:\s*23px[\s\S]*?inset-inline-end:\s*auto[\s\S]*?transform:\s*none/
    );
    assert.doesNotMatch(
        visualSystemSource,
        /\.ytkit-switch(?:\.active)? \.ytkit-switch-thumb\s*\{[\s\S]*?left:\s*auto !important;[\s\S]*?\}/
    );
    assert.match(visualSystemSource, /#ytkit-reset-active-section\s*\{\s*display:\s*none/);
    assert.match(
        visualSystemSource,
        /\.ytkit-body\s*\{[\s\S]*?grid-template-columns:\s*240px minmax\(0, 1fr\)/
    );
    assert.match(visualSystemSource, /\.ytkit-insights\s*\{\s*display:\s*none/);
    assert.match(visualSystemSource, /\.ytkit-header\s*\{[\s\S]*?min-height:\s*64px/);
    assert.match(visualSystemSource, /\.ytkit-footer\s*\{[\s\S]*?min-height:\s*58px/);
    assert.match(visualSystemSource, /\.ytkit-select\s*\{[\s\S]*?border:\s*0[\s\S]*?background:\s*var\(--ytkit-v3-surface\)/);
    assert.match(visualSystemSource, /\.ytkit-select-shell-chrome\s*\{\s*display:\s*none/);
    assert.match(
        visualSystemSource,
        /\.ytkit-panel-status\s*\{[\s\S]*?border:\s*0[\s\S]*?background:\s*transparent[\s\S]*?text-align:\s*start/
    );
    for (const source of [settingsPanel, shell]) {
        assert.match(source, /footerStatus\.textContent = 'Saved'/);
        assert.match(source, /id: 'ytkit-close-footer',[\s\S]*?label: 'Done'/);
        assert.match(source, /paneDescription\.title = paneDescription\.textContent/);
    }
});

test('insight-rail curation keys on stable data attributes, not nth-child position', () => {
    // Inserting one makeStatusRow/makeInsightSection call used to silently
    // swap which stats were visible because the visual system selected by
    // position across files.
    assert.doesNotMatch(visualSystemSource, /\.ytkit-insight-section:nth-child/);
    assert.doesNotMatch(visualSystemSource, /\.ytkit-status-row:nth-child/);
    assert.match(visualSystemSource, /data-ytkit-insight-section="recent-activity"/);
    for (const key of ['extension', 'enabled', 'profile']) {
        assert.match(visualSystemSource, new RegExp(`data-ytkit-insight="${key}"`));
    }
    for (const source of [settingsPanel, shell]) {
        assert.match(source, /dataset\.ytkitInsightSection = insightKey/);
        assert.match(source, /dataset\.ytkitInsight = insightKey/);
        assert.match(source, /makeInsightSection\('Recent Activity', 'recent-activity'\)/);
        assert.match(source, /'ytkit-insight-profile-name', 'profile'\)/);
    }
});

test('sticky settings section header stays opaque above scrolling controls', () => {
    assert.match(
        visualSystemSource,
        /#ytkit-settings-panel \.ytkit-pane-header\s*\{[\s\S]*?position:\s*sticky !important;[\s\S]*?top:\s*0 !important;[\s\S]*?z-index:\s*4 !important;[\s\S]*?background:\s*var\(--ytkit-v3-bg\) !important;[\s\S]*?box-shadow:\s*0 -20px 0 var\(--ytkit-v3-bg\) !important;/
    );
    assert.match(overlaySmoke, /sticky section header background is not opaque after scrolling/);
    assert.match(overlaySmoke, /for \(const categoryId of categoryIds\)/);
    assert.match(overlaySmoke, /category-\$\{categorySlug\}-scrolled-header\.png/);
    assert.match(overlaySmoke, /\.map\(\(failure\) => `\$\{categoryId\}: \$\{failure\}`\)/);
});

test('settings visual system covers light, mobile, forced-color, and reduced-motion states', () => {
    assert.match(visualSystemSource, /html:not\(\[dark\]\) #ytkit-settings-panel/);
    assert.match(visualSystemSource, /@media \(max-width:\s*900px\)/);
    assert.match(visualSystemSource, /@media \(max-width:\s*560px\)/);
    assert.match(visualSystemSource, /@media \(forced-colors:\s*active\)/);
    assert.match(visualSystemSource, /@media \(prefers-reduced-motion:\s*reduce\)/);
});

test('settings brand lockup cannot collapse into stacked oversized labels', () => {
    assert.match(
        visualSystemSource,
        /\.ytkit-brand-lockup\s*\{[\s\S]*?display:\s*inline-flex[\s\S]*?flex-direction:\s*row[\s\S]*?white-space:\s*nowrap/
    );
    assert.match(
        settingsPanel,
        /brandLockup\.appendChild\(eyebrow\);\s*brandLockup\.appendChild\(title\);\s*brandCopy\.appendChild\(brandLockup\);/
    );
    assert.match(shell, /brandCopy\.appendChild\(brandLockup\);/);
    assert.match(overlaySmoke, /name:\s*'tablet-dark',\s*width:\s*760/);
});

test('settings version is passive text without a dismiss-only notification badge', () => {
    for (const [label, source] of [
        ['settings module', settingsPanel],
        ['fallback shell', shell],
        ['userscript', userscript]
    ]) {
        assert.doesNotMatch(source, /ytkit-whats-new-badge/, `${label} must not render the obsolete badge`);
    }
    assert.doesNotMatch(settingsPanel, /versionSpan\.(?:onclick|style\.cursor)/);
    assert.doesNotMatch(shell, /versionSpan\.(?:onclick|style\.cursor)/);
    assert.doesNotMatch(userscript, /versionSpan\.(?:onclick|style\.cursor)/);
    assert.match(overlaySmoke, /obsolete version notification badge is visible/);
});

test('extension and userscript load the shared settings visual system before the panel', () => {
    const mainScripts = manifest.content_scripts.find((entry) =>
        entry.js?.includes('features/settings-panel/index.js')
    ).js;
    const stylesIndex = mainScripts.indexOf('core/styles.js');
    const visualIndex = mainScripts.indexOf('core/settings-visual-system.js');
    const panelIndex = mainScripts.indexOf('features/settings-panel/index.js');

    assert.ok(stylesIndex >= 0);
    assert.equal(visualIndex, stylesIndex + 1);
    assert.ok(visualIndex < panelIndex);
    assert.match(
        syncUserscript,
        /'extension\/core\/styles\.js',\s*'extension\/core\/settings-visual-system\.js',/
    );
    assert.match(settingsPanel, /ensurePanelStyles\?\.\(\);\s*globalThis\.YTKitCore\?\.ensureSettingsVisualSystem\?\.\(\);/);
    assert.match(
        shell,
        /globalThis\.YTKitCore\?\.ensureSettingsVisualSystem\?\.\(\);\s*injectPanelStyles\._done = true;/
    );
});

test('settings visual-system injection is safe and idempotent', () => {
    const previousCore = globalThis.YTKitCore;
    const previousDocument = globalThis.document;
    const injections = [];
    globalThis.YTKitCore = {
        injectStyle(css, id, raw) {
            injections.push({ css, id, raw });
            return { id: `yt-suite-style-${id}` };
        }
    };
    const modulePath = require.resolve(visualSystemPath);
    delete require.cache[modulePath];
    const visualSystem = require(modulePath);

    try {
        const existing = { id: 'yt-suite-style-ytkit-settings-visual-v4' };
        const existingDocument = { getElementById: () => existing };
        assert.equal(visualSystem.ensureSettingsVisualSystem(existingDocument), existing);
        assert.equal(injections.length, 0);

        const activeDocument = { getElementById: () => null };
        globalThis.document = activeDocument;
        const inserted = visualSystem.ensureSettingsVisualSystem();
        assert.equal(inserted.id, existing.id);
        assert.equal(injections.length, 1);
        assert.equal(injections[0].id, visualSystem.STYLE_ID);
        assert.equal(injections[0].raw, true);
    } finally {
        globalThis.YTKitCore = previousCore;
        globalThis.document = previousDocument;
        delete require.cache[modulePath];
    }
});
