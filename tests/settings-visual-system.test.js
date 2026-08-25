'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const visualSystemPath = path.join(repoRoot, 'extension', 'core', 'settings-visual-system.js');
const visualSystemSource = fs.readFileSync(visualSystemPath, 'utf8');
const manifest = require('../extension/manifest.json');
const { runtimeModules } = require('./helpers/source');
const syncUserscript = fs.readFileSync(path.join(repoRoot, 'sync-userscript.js'), 'utf8');
const settingsPanel = fs.readFileSync(
    path.join(repoRoot, 'extension', 'features', 'settings-panel', 'index.js'),
    'utf8'
);
const shell = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
const userscript = fs.readFileSync(path.join(repoRoot, 'YTKit.user.js'), 'utf8');
const overlaySmoke = fs.readFileSync(path.join(repoRoot, 'scripts', 'smoke-settings-overlay.js'), 'utf8');
const a11ySmoke = fs.readFileSync(path.join(repoRoot, 'scripts', 'smoke-headless-a11y.js'), 'utf8');
const commandDeckCss = visualSystemSource.slice(
    visualSystemSource.indexOf('/* v5 command-deck parity overrides')
);

test('settings visual system renders the flat command-deck hierarchy', () => {
    assert.match(visualSystemSource, /settings visual system v5 — imagegen-matched command deck/);
    assert.match(
        commandDeckCss,
        /\.ytkit-feature-card\s*\{[\s\S]*?min-height:\s*70px[\s\S]*?background:\s*transparent/
    );
    assert.match(commandDeckCss, /\.ytkit-pane-title h2\s*\{[\s\S]*?font-size:\s*30px/);
    assert.match(commandDeckCss, /\.ytkit-feature-name\s*\{[\s\S]*?font-size:\s*16px/);
    assert.match(commandDeckCss, /\.ytkit-feature-desc\s*\{[\s\S]*?font-size:\s*14px[\s\S]*?white-space:\s*normal/);
    assert.match(
        commandDeckCss,
        /\.ytkit-feature-glyph\s*\{[\s\S]*?display:\s*grid[\s\S]*?width:\s*44px/
    );
    assert.match(commandDeckCss, /\.ytkit-nav-group-label\s*\{[\s\S]*?display:\s*none/);
    assert.match(commandDeckCss, /\.ytkit-pane-context\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    assert.match(commandDeckCss, /\.ytkit-pane-icon\s*\{[\s\S]*?width:\s*78px[\s\S]*?background:\s*color-mix/);
    assert.doesNotMatch(commandDeckCss, /(?:linear|radial)-gradient\(/,
        'command deck should use flat fills without decorative gradients');
    assert.match(commandDeckCss, /\.ytkit-feature-section-title\s*\{[\s\S]*?text-transform:\s*uppercase/);
    assert.match(commandDeckCss, /\.ytkit-feature-section-body\s*\{[\s\S]*?background:[\s\S]*?var\(--ytkit-v3-panel\)/);
    assert.match(commandDeckCss, /\.ytkit-header-live-switch\s*\{[\s\S]*?background:\s*var\(--ytkit-v3-accent\)/);
    assert.match(commandDeckCss, /\.ytkit-panel-status::before\s*\{[\s\S]*?content:\s*"✓"/);
    assert.match(settingsPanel, /categoryGroupLabels = \{[\s\S]*?panelNavGroupPlayer[\s\S]*?panelNavGroupSystem/);
    assert.match(settingsPanel, /paneContextFeatures[\s\S]*?ytkit-pane-context-value/);
    for (const source of [settingsPanel, shell]) {
        assert.match(source, /categorySections\[cat\]/);
        assert.match(source, /featureSection\.className = 'ytkit-feature-section'/);
        assert.match(source, /sortedParentFeatures\.slice\(0, 3\)/);
    }
    assert.match(visualSystemSource, /\.ytkit-info-card\s*\{\s*grid-column:\s*1 \/ -1/);
    assert.doesNotMatch(settingsPanel, /card\.style\.cssText = 'background: linear-gradient/);
    // The enabled state must be visible without tracking the switch at the far
    // right of a 1300px row. It used to be `background: transparent` with no
    // shadow — nothing at all — and the pin that was supposed to hold that
    // shape matched lazily across the whole file, so it passed either way.
    // Both assertions below are bounded to the rule block.
    const enabledRule = visualSystemSource.match(
        /\.ytkit-feature-card\.ytkit-card-enabled \{([^}]*)\}/
    );
    assert.ok(enabledRule, 'the enabled-card rule must exist');
    assert.match(enabledRule[1], /background:\s*rgba\(var\(--ytkit-v3-accent-rgb\),0\.055\)/,
        'an enabled row must be tinted, not transparent');
    const enabledRail = visualSystemSource.match(
        /\.ytkit-feature-card\.ytkit-card-enabled::before \{([^}]*)\}/
    );
    assert.ok(enabledRail, 'enabled rows must carry a leading accent rail');
    assert.match(enabledRail[1], /inset-inline-start:\s*0/,
        'the rail must be logical so it flips in RTL');
    assert.match(enabledRail[1], /background:\s*var\(--ytkit-v3-accent\)/);

    // Category counts stay visible on every nav row, not only the open one —
    // that map is how you find which category holds your enabled settings.
    const countRule = visualSystemSource.match(/\.ytkit-nav-count \{([^}]*)\}/);
    assert.ok(countRule, 'the nav-count rule must exist');
    assert.match(countRule[1], /display:\s*inline !important/,
        'every category must show its count, not just the active one');
});

test('v6 desktop settings parity keeps labels readable and gives Video Hider a summary dashboard', () => {
    assert.match(visualSystemSource, /\/\* v6 desktop parity pass\./);
    assert.match(
        visualSystemSource,
        /@media \(min-width:\s*1181px\)[\s\S]*?grid-template-columns:\s*320px minmax\(0, 1fr\)/
    );
    assert.match(
        visualSystemSource,
        /\.ytkit-nav-label,[\s\S]*?\.ytkit-pane-context-value[\s\S]*?text-overflow:\s*clip !important;[\s\S]*?white-space:\s*normal !important;/
    );
    assert.match(
        visualSystemSource,
        /\.ytkit-vh-summary\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/
    );
    for (const source of [settingsPanel, shell]) {
        assert.match(source, /paneSummary\.className = 'ytkit-vh-summary'/);
        assert.match(source, /paneIcon\.appendChild\(\(ICONS\['eye-off'\]/);
        assert.match(source, /paneHeader\.appendChild\(paneLead\)/);
        assert.match(source, /pane\.appendChild\(paneSummary\)/);
    }
    assert.match(userscript, /globalThis\.YTKitCore\?\.ensureSettingsVisualSystem\?\.\(\);/);
    assert.match(userscript, /makeNavBtn\(\s*'Video Hider'/);
    assert.match(userscript, /if \(cat === 'Content'\) content\.appendChild\(buildVideoHiderPane\(config\)\);/);
    assert.match(userscript, /paneSummary\.className = 'ytkit-vh-summary'/);
    assert.match(userscript, /addSummaryCard\('filters', 'filter', 'Active Filters'/);
    assert.match(overlaySmoke, /name:\s*'desktop-dark',\s*width:\s*1440,\s*height:\s*900/);
    assert.match(overlaySmoke, /name:\s*'desktop-wide',\s*width:\s*1920,\s*height:\s*1080/);
    assert.match(overlaySmoke, /--desktop-only/);
});

// The panel used to paint --ytkit-v3-bg on the shell, the rail, the content
// column, the header and the footer alike, at #090e14 — one notch off black.
// With no elevation and hairline dividers, a 57-row category read as one
// undifferentiated slab. Folding the planes back together is the specific
// regression this guards.
test('the settings panel keeps three distinct elevation planes', () => {
    const luminance = (hex) => {
        const chan = [1, 3, 5].map((i) => {
            const x = parseInt(hex.slice(i, i + 2), 16) / 255;
            return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
    };
    const token = (name) => {
        const m = visualSystemSource.match(new RegExp(`--ytkit-v3-${name}:\\s*(#[0-9a-f]{6})`, 'i'));
        assert.ok(m, `--ytkit-v3-${name} must be a literal hex`);
        return m[1];
    };
    const [rail, bg, panel] = [token('rail'), token('bg'), token('panel')];
    const [lRail, lBg, lPanel] = [rail, bg, panel].map(luminance);
    assert.ok(lRail < lBg, `the nav rail (${rail}) must sit below the content plane (${bg})`);
    assert.ok(lPanel > lBg, `the settings table (${panel}) must sit above the content plane (${bg})`);
    // The v5 content plane is intentionally midnight navy, but must remain
    // measurably lifted above the old #090e14 floor (0.0056).
    assert.ok(lBg > 0.0065, `the content plane (${bg}) must not collapse to near-black (got ${lBg.toFixed(4)})`);

    assert.match(visualSystemSource, /\.ytkit-sidebar \{[^}]*background:\s*var\(--ytkit-v3-rail\)/,
        'the sidebar must paint the rail plane');
    assert.match(commandDeckCss, /\.ytkit-feature-section-body \{[\s\S]*?background:[\s\S]*?var\(--ytkit-v3-panel\)/,
        'each semantic control section must paint the panel plane');
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
        /\.ytkit-body\s*\{[\s\S]*?grid-template-columns:\s*260px minmax\(0, 1fr\)/
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
        assert.match(source, /footerStatus\.textContent = (?:'Saved'|t\('settingsFooterSaved', 'Saved'\))/);
        assert.match(source, /id: 'ytkit-close-footer',[\s\S]*?label: (?:'Done'|t\('commonDone', 'Done'\))/);
        assert.match(source, /paneDescription\.title = paneDescription\.textContent/);
    }
});

test('all ten menu pages define semantic command-deck sections', () => {
    const previousCore = globalThis.YTKitCore;
    const modulePath = require.resolve(visualSystemPath);
    delete require.cache[modulePath];
    globalThis.YTKitCore = {};

    try {
        const { SETTINGS_CATEGORY_SECTIONS } = require(modulePath);
        const categories = [
            'Video Player',
            'Playback',
            'Comments',
            'Watch Page',
            'Content',
            'Home / Subscriptions',
            'Theme',
            'Live Chat',
            'Downloads',
            'Advanced'
        ];
        assert.deepEqual(Object.keys(SETTINGS_CATEGORY_SECTIONS), categories);
        for (const category of categories) {
            const sections = SETTINGS_CATEGORY_SECTIONS[category];
            assert.ok(sections.length >= 3, `${category} must have at least three semantic sections`);
            assert.equal(new Set(sections.map(({ labelKey }) => labelKey)).size, sections.length,
                `${category} section locale keys must be unique`);
            assert.ok(sections.every(({ labelKey, fallback }) =>
                /^settingsSection[A-Z]/.test(labelKey) && typeof fallback === 'string' && fallback.length > 0
            ), `${category} sections must expose locale keys and readable fallbacks`);
            assert.equal(sections.at(-1).match.test('__future_feature__'), true,
                `${category} must end with a catch-all section for forward compatibility`);
        }
    } finally {
        globalThis.YTKitCore = previousCore;
        delete require.cache[modulePath];
    }
});

test('the Shorts section owns every Shorts schema key without changing schema categories', () => {
    const previousCore = globalThis.YTKitCore;
    const modulePath = require.resolve(visualSystemPath);
    delete require.cache[modulePath];
    globalThis.YTKitCore = {};

    try {
        const {
            createShortsLedgerPresentation,
            refreshShortsLedgerPresentation,
            SETTINGS_CATEGORY_SECTIONS,
            SHORTS_SETTING_KEYS,
            SHORTS_PANEL_SETTING_KEYS
        } = require(modulePath);
        const { SETTINGS_SCHEMA } = require('../extension/core/settings-schema');
        const expected = SETTINGS_SCHEMA
            .filter((entry) => entry.category === 'shorts' || /shorts/i.test(entry.key))
            .map((entry) => entry.key);
        assert.deepEqual(SHORTS_SETTING_KEYS, expected,
            'the presentation index must cover the canonical Shorts category plus cross-category Shorts keys');
        assert.deepEqual(
            SHORTS_PANEL_SETTING_KEYS,
            expected,
            'the in-page section must include the read-only daily ledger'
        );
        const section = SETTINGS_CATEGORY_SECTIONS.Content.find(
            ({ labelKey }) => labelKey === 'settingsSectionShortsDiscovery');
        assert.equal(section.fallback, 'Shorts controls');
        for (const key of SHORTS_PANEL_SETTING_KEYS) {
            assert.equal(section.match.test(key), true, `${key} must land in the Shorts controls section`);
        }
        assert.equal(SETTINGS_SCHEMA.find((entry) => entry.key === 'shortsDailyLimitMin').category, 'research-ai',
            'the grouping is presentation-only; the persisted schema category must stay put');

        const now = new Date(2026, 7, 21, 14, 5, 0);
        const today = '2026-08-21';
        const ledger = createShortsLedgerPresentation({
            shortsWatchTimeToday: {
                date: today,
                seconds: (12 * 60) + 1,
                snoozeUntil: now.getTime() + (30 * 60 * 1000)
            }
        }, (_key, fallback) => fallback, now);
        assert.equal(ledger.id, 'shortsWatchTimeToday');
        assert.equal(ledger.group, 'Content');
        assert.equal(ledger.type, 'info');
        assert.equal(ledger.i18nResolved, true);
        assert.match(ledger.description, /^13 min watched today\. Snoozed until .+\.$/);

        const staleLedger = createShortsLedgerPresentation({
            shortsWatchTimeToday: { date: '2026-08-20', seconds: 9999, snoozeUntil: now.getTime() + 1000 }
        }, (_key, fallback) => fallback, now);
        assert.equal(staleLedger.description, 'No Shorts watch time recorded today.');

        const nameNode = { textContent: '' };
        const descriptionNode = { textContent: '' };
        const attributes = {};
        const card = {
            dataset: {},
            querySelector(selector) {
                if (selector === '.ytkit-feature-name') return nameNode;
                if (selector === '.ytkit-feature-desc') return descriptionNode;
                return null;
            },
            setAttribute(name, value) { attributes[name] = value; }
        };
        assert.equal(refreshShortsLedgerPresentation({ querySelector: () => card }, {
            shortsWatchTimeToday: { date: today, seconds: (12 * 60) + 1, snoozeUntil: 0 }
        }, (_key, fallback) => fallback, now), true);
        assert.equal(nameNode.textContent, 'Shorts today');
        assert.equal(descriptionNode.textContent, '13 min watched today.');
        assert.equal(card.title, '13 min watched today.');
        assert.equal(attributes['aria-label'], 'Shorts today');
        assert.match(card.dataset.searchText, /13 min watched today/);
        assert.equal(refreshShortsLedgerPresentation({ querySelector: () => null }, {}, undefined, now), false);

        for (const source of [settingsPanel, shell]) {
            assert.match(source, /refreshShortsLedgerPresentation\?\.\(document, appState\.settings, t\)/,
                'module and fallback must refresh the ledger after its initial build');
        }
    } finally {
        globalThis.YTKitCore = previousCore;
        delete require.cache[modulePath];
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

test('settings visual system restores focus rings after command-deck resets', () => {
    assert.match(
        visualSystemSource,
        /#ytkit-settings-panel button:focus-visible,[\s\S]*?#ytkit-settings-panel input:focus-visible,[\s\S]*?box-shadow:[^;]+!important/,
        'buttons and inputs must retain a visible focus ring after reset rules'
    );
    assert.match(
        visualSystemSource,
        /#ytkit-settings-panel a:focus-visible[\s\S]*?border-color:\s*var\(--ytkit-v3-accent\) !important/,
        'links must retain a visible focus border after reset rules'
    );
});

test('settings visual system covers hidden controls, narrow reflow, and forced-color focus', () => {
    assert.match(
        visualSystemSource,
        /#ytkit-settings-panel \.ytkit-footer-actions \.ytkit-btn:focus-visible[\s\S]*?rgba\(255,90,79,0\.75\)/,
        'footer actions must retain a visible focus ring after the late reset rules'
    );
    assert.match(
        visualSystemSource,
        /#ytkit-settings-panel \[hidden\]\s*\{\s*display:\s*none !important;/,
        'hidden dialog controls must stay out of sight and keyboard traversal'
    );
    assert.match(
        visualSystemSource,
        /@media \(max-width:\s*720px\)[\s\S]*?#ytkit-settings-panel \.ytkit-pane-header[\s\S]*?position:\s*static !important;/,
        'narrow settings layouts must release the oversized sticky header'
    );
    assert.match(
        visualSystemSource,
        /#ytkit-settings-panel \.ytkit-select:focus-visible,[\s\S]*?outline:\s*2px solid Highlight !important;/,
        'forced colors must expose a system focus indicator on selects'
    );
});

test('headless a11y smoke audits real focus traversal and the correct injected traps', () => {
    const { SURFACES } = require('../scripts/smoke-headless-a11y');
    assert.match(a11ySmoke, /Input\.dispatchKeyEvent/);
    assert.match(a11ySmoke, /:focus-visible/);
    assert.match(a11ySmoke, /async function auditFocusTrap\(/);
    assert.match(a11ySmoke, /name: 'settings'[\s\S]*?focusTrap: Object\.freeze\(\{ root: '#ytkit-settings-panel' \}\)/);
    assert.match(a11ySmoke, /name: 'download'[\s\S]*?focusTrap: Object\.freeze\(\{ root: '\.ytkit-dl-popup' \}\)/);
    assert.equal(
        SURFACES.find((surface) => surface.name === 'transcript')?.focusTrap,
        undefined,
        'transcript must not report the download overlay as its focus trap'
    );
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
    const mainScripts = runtimeModules(manifest.content_scripts.find((entry) =>
        runtimeModules(entry).includes('features/settings-panel/index.js')
    ));
    const stylesIndex = mainScripts.indexOf('core/styles.js');
    const visualIndex = mainScripts.indexOf('core/settings-visual-system.js');
    const panelIndex = mainScripts.indexOf('features/settings-panel/index.js');

    assert.ok(stylesIndex >= 0);
    assert.equal(visualIndex, stylesIndex + 1);
    assert.ok(visualIndex < panelIndex);
    assert.match(
        syncUserscript,
        /'extension\/core\/styles\.js',\s*(?:'extension\/core\/trusted-html\.js',\s*)?'extension\/core\/settings-visual-system\.js',/
    );
    assert.match(settingsPanel, /ensurePanelStyles\?\.\(\);\s*globalThis\.YTKitCore\?\.ensureSettingsVisualSystem\?\.\(\);/);
    assert.match(
        shell,
        /globalThis\.YTKitCore\?\.ensureSettingsVisualSystem\?\.\(\);\s*injectPanelStyles\._done = true;/
    );
});

test('shared surface system covers the polished YouTube and injected UI families', () => {
    const visualSystem = require(visualSystemPath);
    const css = visualSystem.SURFACE_VISUAL_SYSTEM_CSS;
    for (const selector of [
        '.ytkit-ai-qa-modal',
        '.ytkit-aisum-panel',
        '.ytkit-transcript-panel',
        '.ytkit-dl-popup',
        '.ytkit-dl-progress',
        '.ytkit-sub-toolbar',
        '.ytkit-queue-panel',
        '.ytkit-bookmarks-container',
        '.ytkit-search-container',
        // Was '.ytkit-wha-overlay' and '.ytkit-wl-workbench'. The first is the
        // watch-history scrim, not its panel, and forcing an opaque ground on
        // it painted over the whole viewport; the box rules now name the card.
        // The second is a playlist toolbar BUTTON whose own rule deliberately
        // follows YouTube's theme, so it never belonged in a panel list.
        '.ytkit-wha-card',
        '.ytkit-global-toast',
        'html.ytkit-watch-restyle',
        'html.ytkit-split-active',
    ]) {
        assert.ok(css.includes(selector), `surface system must cover ${selector}`);
    }
    assert.match(css, /html:not\(\[dark\]\)/,
        'surface tokens must include a light theme lane');
    assert.match(css, /html\.ytkit-watch-restyle:not\(\[dark\]\)[\s\S]*color-scheme: light !important/,
        'normal watch mode must expose a real light color-scheme lane');
    assert.match(css, /--yt-spec-base-background: var\(--ytkit-watch-canvas\) !important/,
        'normal watch mode must map YouTube canvas chrome to Astra tokens');
    assert.match(css, /html\.ytkit-watch-restyle ytd-masthead[\s\S]*background: var\(--ytkit-watch-panel\) !important/,
        'normal watch masthead must use the shared surface hierarchy');
    assert.match(css, /html\.ytkit-watch-restyle ytd-comments#comments[\s\S]*background: var\(--ytkit-watch-panel\) !important/,
        'normal watch comments must use a bounded theme-aware panel');
    assert.match(css, /@media \(forced-colors: active\)/);
    assert.doesNotMatch(css, /(?:linear|radial)-gradient\(/,
        'premium surfaces must use flat fills');

    const allowedRadii = new Set([0, 4, 6, 8, 10, 12]);
    for (const match of css.matchAll(/border-radius:\s*([0-9.]+)px/g)) {
        assert.ok(allowedRadii.has(Number(match[1])),
            `surface radius ${match[1]}px must use the compact token scale`);
    }
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
        const existing = { id: 'yt-suite-style-ytkit-settings-visual-v5' };
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

test('the surface system never forces an opaque box onto a full-viewport scrim', () => {
    // `.ytkit-ai-qa-modal`, `.ytkit-local-ai-modal`, `.ytkit-wha-overlay`,
    // `.ytkit-sub-group-dialog` and `.ytkit-pm-overlay` are backdrops:
    // `position: fixed; inset: 0` with a translucent wash, centring a card.
    // Listing them beside real panels made the forced
    // `background: var(--ytkit-premium-panel) !important` repaint the entire
    // viewport opaque, in BOTH themes, and killed the authored light-theme
    // backdrop rule (which has no !important and therefore cannot win).
    const css = require(visualSystemPath).SURFACE_VISUAL_SYSTEM_CSS;
    const extensionDir = path.join(repoRoot, 'extension');

    const files = [];
    (function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { if (entry.name !== '_locales') walk(full); }
            else if (/\.(js|html)$/.test(full)) files.push(full);
        }
    }(extensionDir));
    const authored = files
        .filter((file) => !file.endsWith('settings-visual-system.js'))
        .map((file) => fs.readFileSync(file, 'utf8'))
        .join('\n');

    // Every class the surface system forces a box onto.
    const forcedBlocks = [...css.matchAll(/:is\(([^)]*)\)\s*\{[^}]*background:\s*var\(--ytkit-premium-panel\)\s*!important/g)];
    assert.ok(forcedBlocks.length >= 2, 'the forced-surface blocks must still be recognisable');

    const forced = new Set();
    for (const block of forcedBlocks) {
        for (const raw of block[1].split(',')) {
            const selector = raw.trim();
            if (selector.startsWith('.')) forced.add(selector.slice(1));
        }
    }
    assert.ok(forced.size > 20, 'the surface families must still be populated');

    for (const name of forced) {
        // Escaped properly: written through a shell heredoc the first time,
        // this read `'\.' + … + '\s*\{'`, which JS resolves to `.` (any char)
        // and a literal `s*{`. It therefore matched only MINIFIED rules, where
        // no space separates the selector from its brace. That is why it caught
        // the scrims in ytkit.js and missed the photosensitivity dim, whose
        // stylesheet is formatted.
        const rule = new RegExp('\\.' + name.replace(/[-_]/g, '[-_]') + '(?![\\w-])\\s*\\{([^}]*)\\}');
        const match = rule.exec(authored);
        if (!match) continue;
        const body = match[1].replace(/\s+/g, ' ');
        // `absolute` covers its containing block as completely as `fixed`
        // covers the viewport. The photosensitivity dim is drawn that way, and
        // the first version of this check only looked for `fixed`, so the
        // surface system was painting an opaque panel over the video that the
        // dim exists to soften.
        const isScrim = /position\s*:\s*(?:fixed|absolute)/.test(body) && /inset\s*:\s*0\s*[;}]/.test(body);
        assert.equal(isScrim, false,
            `.${name} covers everything beneath it; force the box onto the card it contains, not the scrim`);
    }
});

test('every surface the system paints white in light theme also resets color-scheme', () => {
    // A forced `background: var(--ytkit-premium-panel)` is #ffffff under
    // `html:not([dark])`. Leaving `color-scheme: dark` on it renders dark UA
    // scrollbars, date pickers and select popups on a white panel.
    const css = require(visualSystemPath).SURFACE_VISUAL_SYSTEM_CSS;
    const selectorsOf = (block) => new Set(block.split(',')
        .map((raw) => raw.trim())
        .filter((selector) => selector.startsWith('.')));

    const forced = [...css.matchAll(/:is\(([^)]*)\)\s*\{[^}]*background:\s*var\(--ytkit-premium-panel\)\s*!important[^}]*color-scheme:\s*dark\s*!important/g)]
        .map((match) => selectorsOf(match[1]));
    const reset = [...css.matchAll(/html:not\(\[dark\]\)\s*:is\(([^)]*)\)\s*\{\s*color-scheme:\s*light\s*!important/g)]
        .map((match) => selectorsOf(match[1]));
    assert.equal(forced.length, reset.length,
        'each forced-surface family needs its own light color-scheme reset');

    for (let index = 0; index < forced.length; index += 1) {
        const missing = [...forced[index]].filter((selector) => !reset[index].has(selector));
        assert.deepEqual(missing, [],
            'these surfaces go white in light theme but keep color-scheme: dark');
    }
});

test('the surface system names no selector the extension never renders', () => {
    // `.ytkit-stats-overlay`, `.ytkit-ql-menu`, `.ytkit-mediadl-install-prompt`
    // and `.ytkit-reaction-spammer-panel` were listed as classes but only ever
    // exist as ids, and `.ytkit-playback-recovery` is a sessionStorage key with
    // no element at all. Five of the surfaces the design system claimed to
    // cover silently received nothing.
    const css = require(visualSystemPath).SURFACE_VISUAL_SYSTEM_CSS;
    const extensionDir = path.join(repoRoot, 'extension');
    const files = [];
    (function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { if (entry.name !== '_locales') walk(full); }
            else if (/\.(js|html)$/.test(full)) files.push(full);
        }
    }(extensionDir));
    const authored = files
        .filter((file) => !file.endsWith('settings-visual-system.js'))
        .map((file) => fs.readFileSync(file, 'utf8'))
        .join('\n');

    const forced = new Set();
    const forcedBlocks = css.matchAll(/:is\(([^)]*)\)\s*\{[^}]*background:\s*var\(--ytkit-premium-panel\)\s*!important/g);
    for (const block of forcedBlocks) {
        for (const raw of block[1].split(',')) {
            const selector = raw.trim();
            if (selector.startsWith('.ytkit-')) forced.add(selector.slice(1));
        }
    }
    assert.ok(forced.size > 20, 'the surface families must still be populated');

    // A class the extension actually renders shows up in a className
    // assignment, a classList.add, or a literal class attribute.
    const orphans = [...forced].filter((name) => {
        if (authored.includes("classList.add('" + name + "'")) return false;
        if (authored.includes('classList.add("' + name + '"')) return false;
        const wordy = new RegExp(
            "(className\\s*=\\s*[`'\"][^`'\"]*\\b" + name + "\\b)"
            + "|(className:\\s*[`'\"][^`'\"]*\\b" + name + "\\b)"
            + "|(class\\s*=\\s*\"[^\"]*\\b" + name + "\\b)"
            + "|(classList\\.add\\([^)]*\\b" + name + "\\b)"
        );
        return !wordy.test(authored);
    });
    assert.deepEqual(orphans, [],
        'these surface selectors match nothing the extension builds');
});
