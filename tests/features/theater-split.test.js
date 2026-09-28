'use strict';

// Per-area test bed for the Theater Split (`stickyVideo`) feature +
// its standalone userscript companion `theater-split.user.js`.
//
// NX12 modularization seed (v3.23.0). Future theater-split regressions
// land here; existing tests in `tests/hardening.test.js` migrate
// incrementally.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sources, config, extractFeatureBlock, readTheaterSplitSource } = require('../helpers/source');
const { fakeTreeDocument } = require('../helpers/monolith');

const MODULE_PATH = '../../extension/features/sticky-video/index.js';
const STYLES_PATH = '../../extension/features/sticky-video-styles/index.js';

// The behaviour used to exist twice: once in the feature module and once as an
// inline fallback inside ytkit.js that every page load parsed and discarded.
// The fallback is a descriptor stub now, so the module IS the implementation
// and these assertions read it directly.
const MODULE_SOURCE = readTheaterSplitSource();

function loadModule() {
    const originalFeatures = globalThis.YTKitFeatures;
    delete require.cache[require.resolve(MODULE_PATH)];
    delete require.cache[require.resolve(STYLES_PATH)];
    globalThis.YTKitFeatures = {};
    const styles = require(STYLES_PATH);
    const mod = require(MODULE_PATH);
    const exported = globalThis.YTKitFeatures.stickyVideo;
    const exportedStyles = globalThis.YTKitFeatures.stickyVideoStyles;
    globalThis.YTKitFeatures = originalFeatures;
    return { mod, exported, styles, exportedStyles };
}

function extractTemplate(block, name) {
    const tick = String.fromCharCode(96);
    const needle = 'const ' + name + ' = ';
    const start = block.indexOf(needle);
    assert.ok(start > -1, 'stickyVideo block must declare ' + name);
    const open = block.indexOf(tick, start + needle.length);
    assert.ok(open > -1, name + ' must be a template literal fallback');
    for (let i = open + 1; i < block.length; i++) {
        if (block[i] === tick && block[i - 1] !== '\\') return block.slice(open + 1, i);
    }
    throw new Error('unterminated template literal: ' + name);
}

test('Theater Split userscript companion is present at v1.0.7 or later', () => {
    // The v3.20.3 H8 hardening pass closed a divider-drag SPA-nav
    // memory leak in v1.0.7. Make sure the shipped userscript hasn't
    // regressed to a pre-fix version.
    const userscriptPath = path.join(config.repoRoot, 'theater-split.user.js');
    const source = fs.readFileSync(userscriptPath, 'utf8');
    const versionMatch = source.match(/^\/\/\s*@version\s+(\S+)/m);
    assert.ok(versionMatch, 'theater-split.user.js must declare @version in its header');
    const [major, minor, patch] = versionMatch[1].split('.').map(Number);
    assert.ok(
        major > 1 || (major === 1 && (minor > 0 || (minor === 0 && patch >= 7))),
        `theater-split.user.js version ${versionMatch[1]} is below the v1.0.7 floor (H8 fix)`,
    );
});

test('stickyVideo + scoped CSS rules exist in the extension build', () => {
    // The extension build also ships theater-split functionality inline
    // (the userscript companion is the standalone artifact). Sanity
    // check that the inline path is still wired.
    assert.match(sources.ytkit, /stickyVideo/,
        'stickyVideo feature flag must exist in ytkit.js');
});

test('the Theater Split modules export the style builders and the factory', () => {
    const { mod, exported, styles, exportedStyles } = loadModule();
    assert.equal(typeof styles.buildSplitShellCss, 'function');
    assert.equal(typeof styles.buildSplitMetaCss, 'function');
    assert.equal(typeof styles.buildSplitCommentsCss, 'function');
    assert.equal(typeof mod.createStickyVideoFeature, 'function');
    assert.deepEqual(styles.STYLE_IDS, {
        shell: 'stickyVideo',
        meta: 'stickyVideo-meta-layout',
        comments: 'stickyVideo-comments'
    });
    assert.equal(typeof exportedStyles.buildSplitShellCss, 'function');
    assert.equal(typeof exported.createStickyVideoFeature, 'function');
});

test('Theater Split renders its divider and close action into the overlay it owns', () => {
    const { mod } = loadModule();
    const documentRef = fakeTreeDocument();
    const wrongTarget = documentRef.createElement('aside');
    const player = documentRef.createElement('div');
    player.id = 'player-container';
    const below = documentRef.createElement('div');
    below.id = 'below';
    documentRef.body.append(wrongTarget, player, below);
    const writes = [];
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;
    const originalResizeObserver = globalThis.ResizeObserver;
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.document = documentRef;
    globalThis.window = {
        innerWidth: 1440,
        addEventListener() {},
        removeEventListener() {},
        scrollTo() {}
    };
    globalThis.ResizeObserver = class {
        observe() {}
        disconnect() {}
    };
    globalThis.requestAnimationFrame = (callback) => {
        callback();
        return 1;
    };
    try {
        const feature = mod.createStickyVideoFeature({
            storageWrite: (key, value) => writes.push([key, value])
        });
        feature._triggerPlayerResize = () => {};
        feature._getPlayer = () => player;
        feature._getBelow = () => below;
        feature._getChatEl = () => null;
        feature._videoType = 'live';
        feature._mountOverlay();
        const overlay = feature._splitWrapper;

        assert.equal(overlay.parentElement, documentRef.body,
            'the production mount path must attach the overlay to the page body');
        assert.equal(documentRef.contains(overlay), true,
            'the overlay must exist in the connected page tree');
        assert.equal(wrongTarget.children.length, 0,
            'the placement oracle must reject a render redirected to a sibling');
        assert.deepEqual(overlay.children.map((child) => child.id), [
            'ytkit-split-left', 'ytkit-split-divider', 'ytkit-split-right'
        ]);

        const divider = overlay.querySelector('#ytkit-split-divider');
        assert.equal(divider.getAttribute('role'), 'separator');
        assert.equal(divider.getAttribute('aria-orientation'), 'vertical');
        assert.equal(divider.getAttribute('aria-valuemin'), '25');
        assert.equal(divider.getAttribute('aria-valuemax'), '100');
        assert.equal(divider.getAttribute('aria-valuenow'), '100');
        assert.equal(divider.getAttribute('aria-expanded'), 'false');
        assert.equal(divider.getAttribute('aria-hidden'), 'true');
        assert.equal(divider.tabIndex, -1);
        assert.equal(divider.querySelector('.ytkit-divider-pip').children.length, 3);

        feature._isSplit = true;
        feature._setDividerPanelState(divider, true, 68, true);
        divider.dispatchEvent({ type: 'keydown', key: 'ArrowLeft', preventDefault() {} });
        assert.equal(divider.getAttribute('aria-valuenow'), '66',
            'ArrowLeft must shrink the left pane through the live divider handler');
        assert.deepEqual(writes.at(-1), ['ytkit_split_ratio', 66]);

        const chat = documentRef.createElement('div');
        let resizedRightPct = null;
        feature._splitLiveHeader = documentRef.createElement('section');
        feature._ensureSplitLiveHeader = (rightPct) => {
            resizedRightPct = rightPct;
            return 196;
        };
        feature._getChatEl = () => chat;
        divider.dispatchEvent({ type: 'keydown', key: 'ArrowRight', preventDefault() {} });
        assert.equal(resizedRightPct, 32,
            'resizing a live split must remeasure the header at the new panel width');
        assert.equal(chat.style.getPropertyValue('top'), '196px',
            'resizing a live split must move chat below the remeasured header');
        assert.equal(chat.style.getPropertyValue('height'), 'calc(100vh - 196px)',
            'resizing a live split must preserve a non-overlapping chat height');
        feature._splitLiveHeader = null;
        feature._getChatEl = () => null;

        divider.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault() {} });
        assert.equal(feature._isSplit, false, 'Enter must collapse the comments pane');
        assert.equal(divider.getAttribute('aria-expanded'), 'false');
        assert.equal(divider.getAttribute('aria-hidden'), null);
        assert.equal(divider.dataset.ytkitPanelState, 'closed');
        assert.equal(divider.style.width, '8px', 'a click-collapse must keep the divider available');

        let reopened = 0;
        feature._expandSplit = () => {
            reopened += 1;
            feature._isSplit = true;
            feature._setDividerPanelState(divider, true, 66, true);
        };
        divider.dispatchEvent({ type: 'click', detail: 0, preventDefault() {} });
        assert.equal(reopened, 1, 'a synthetic accessible click must reopen comments');
        assert.equal(divider.getAttribute('aria-expanded'), 'true');

        const close = overlay.querySelector('#ytkit-split-close');
        assert.equal(close.tagName, 'BUTTON');
        assert.equal(close.getAttribute('aria-label'), 'Close side panel');
        let dismissed = null;
        feature._collapseSplit = (value) => { dismissed = value; };
        close.onclick();
        assert.equal(dismissed, true, 'the rendered close button must dismiss the split');

        feature._unmount();
        assert.equal(documentRef.contains(overlay), false,
            'the production teardown path must leave no overlay chrome behind');
    } finally {
        globalThis.document = originalDocument;
        globalThis.window = originalWindow;
        globalThis.ResizeObserver = originalResizeObserver;
        globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    }
});

test('Theater Split divider separates a click toggle from a drag resize', () => {
    const { mod } = loadModule();
    const documentRef = fakeTreeDocument();
    const player = documentRef.createElement('div');
    player.id = 'player-container';
    const below = documentRef.createElement('div');
    below.id = 'below';
    documentRef.body.append(player, below);

    const windowListeners = new Map();
    const windowRef = {
        innerWidth: 1000,
        addEventListener(type, handler) {
            if (!windowListeners.has(type)) windowListeners.set(type, new Set());
            windowListeners.get(type).add(handler);
        },
        removeEventListener(type, handler) {
            windowListeners.get(type)?.delete(handler);
        },
        dispatch(type, event = {}) {
            for (const handler of [...(windowListeners.get(type) || [])]) handler(event);
        },
        scrollTo() {}
    };
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;
    const originalResizeObserver = globalThis.ResizeObserver;
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    globalThis.document = documentRef;
    globalThis.window = windowRef;
    globalThis.ResizeObserver = class {
        observe() {}
        disconnect() {}
    };
    globalThis.requestAnimationFrame = (callback) => {
        callback();
        return 1;
    };
    globalThis.cancelAnimationFrame = () => {};

    try {
        const writes = [];
        const feature = mod.createStickyVideoFeature({
            storageWrite: (key, value) => writes.push([key, value])
        });
        feature._triggerPlayerResize = () => {};
        feature._getPlayer = () => player;
        feature._getBelow = () => below;
        feature._getChatEl = () => null;
        feature._videoType = 'live';
        feature._mountOverlay();

        const wrapper = feature._splitWrapper;
        const divider = wrapper.querySelector('#ytkit-split-divider');
        const left = wrapper.querySelector('#ytkit-split-left');
        wrapper.getBoundingClientRect = () => ({ width: 1000 });
        left.getBoundingClientRect = () => ({ width: 680 });

        feature._isSplit = true;
        feature._setDividerPanelState(divider, true, 68, true);
        let toggles = 0;
        feature._toggleSplitFromDivider = () => { toggles += 1; };

        divider.dispatchEvent({
            type: 'mousedown', button: 0, detail: 1, clientX: 680,
            preventDefault() {}
        });
        windowRef.dispatch('mouseup');
        assert.equal(toggles, 1, 'press and release without movement must toggle the pane');

        divider.dispatchEvent({
            type: 'mousedown', button: 0, detail: 1, clientX: 680,
            preventDefault() {}
        });
        windowRef.dispatch('mousemove', { clientX: 730 });
        windowRef.dispatch('mouseup');
        assert.equal(toggles, 1, 'a drag must not also toggle the pane on release');
        assert.equal(Math.round(writes.at(-1)[1]), 73,
            'dragging an open divider must persist the resized split ratio');

        feature._isSplit = false;
        let expansions = 0;
        feature._expandSplit = () => {
            expansions += 1;
            feature._isSplit = true;
        };
        divider.dispatchEvent({
            type: 'mousedown', button: 0, detail: 1, clientX: 992,
            preventDefault() {}
        });
        windowRef.dispatch('mousemove', { clientX: 900 });
        windowRef.dispatch('mouseup');
        assert.equal(expansions, 1, 'dragging the closed divider must reopen comments');
        assert.equal(Math.round(writes.at(-1)[1]), 85,
            'a closed-panel drag must open at the bounded pointer position');
        assert.equal(toggles, 1, 'drag-open must not fire the click toggle afterward');

        feature._unmount();
    } finally {
        globalThis.document = originalDocument;
        globalThis.window = originalWindow;
        globalThis.ResizeObserver = originalResizeObserver;
        globalThis.requestAnimationFrame = originalRequestAnimationFrame;
        globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    }
});

// ── The standalone userscript: its own design, pinned as it ships ──

test('the standalone Theater Split keeps its divider contract and token lanes', () => {
    const standalone = fs.readFileSync(path.join(config.repoRoot, 'theater-split.user.js'), 'utf8');

    assert.match(standalone, /setAttribute\('role', 'separator'\)/,
        'the standalone userscript must expose the resize divider as a separator');
    assert.match(standalone, /setAttribute\('aria-orientation', 'vertical'\)/);
    assert.match(standalone, /setAttribute\('aria-valuenow'/);
    assert.match(standalone, /e\.key === 'ArrowLeft'/);
    assert.match(standalone, /DIVIDER_DRAG_THRESHOLD_PX = 4/);
    assert.match(standalone, /collapseSplit\(false, \{ keepDivider: true \}\)/);
    assert.match(standalone, /setAttribute\('aria-expanded', String\(open\)\)/);
    assert.match(standalone, /data-panel-state="closed"/);
    assert.match(standalone, /--ts-panel: #0d1928/);
    assert.match(standalone, /html:not\(\[dark\]\) body\.ts-active/,
        'the standalone split must define a light token lane');
    assert.match(standalone, /background: 'var\(--ts-panel\)'/,
        'standalone positioned surfaces must consume the shared panel token');
    assert.match(standalone, /#ts-divider:focus-visible/);
    assert.match(standalone, /setAttribute\('aria-label', 'Close side panel'\)/,
        'the standalone userscript close button must keep its accessible name');
    assert.doesNotMatch(standalone, /background: '#0b1624'/,
        'standalone positioned surfaces must not bypass theme tokens');
});

test('the standalone Theater Split keeps its compact metadata hierarchy', () => {
    const css = fs.readFileSync(path.join(config.repoRoot, 'theater-split.user.js'), 'utf8');
    assert.match(css, /grid-template-areas:\s*"home actions date" !important/);
    assert.match(css, /\.ytkit-split-title-bar[\s\S]{0,900}order: 2 !important/);
    assert.match(css, /#title h1[\s\S]{0,900}order: 1 !important/);
    assert.match(css, /row-gap: 6px !important;\s*padding: 8px 10px 9px !important/);
    assert.match(css, /\.ytkit-split-upload-meta[\s\S]{0,420}height: 40px !important[\s\S]{0,420}box-sizing: border-box !important/);
    assert.match(css, /grid-template-areas:\s*"owner sub"\s*"actions actions" !important/);
    assert.match(css, /grid-template-areas:\s*"owner owner"\s*"actions actions" !important/);
    assert.doesNotMatch(css, /grid-template-areas:\s*"owner"\s*"sub"\s*"actions"/);
    assert.match(css, /#owner(?:#owner)?[\s\S]{0,900}gap: 6px 10px !important[\s\S]{0,260}padding: 8px 10px !important/);
    assert.match(css, /#subscribe-button[\s\S]{0,420}min-width: 98px !important[\s\S]{0,200}height: 32px !important[\s\S]{0,220}border-radius: 6px !important/);
    assert.match(css, /ytd-comment-replies-renderer[\s\S]{0,1500}border-radius: 6px !important[\s\S]{0,400}background: var\(--[^,;]*comment-control\) !important/);
    assert.match(css, /margin: 0 0 10px !important;\s*padding: 0 0 10px !important/);
});

test('the standalone Theater Split keeps wrapper-proof comment controls in every state', () => {
    const css = fs.readFileSync(path.join(config.repoRoot, 'theater-split.user.js'), 'utf8');
    const visualSystem = fs.readFileSync(
        path.join(config.repoRoot, 'extension', 'core', 'settings-visual-system.js'), 'utf8');
    for (const token of ['control', 'control-hover', 'control-active', 'border', 'divider', 'shadow']) {
        assert.match(css, new RegExp(`--ts-comment-${token}:`), `standalone must define the ${token} comment token`);
    }
    assert.match(css, /ytd-comment-engagement-bar #toolbar[\s\S]{0,180}gap: 8px !important/);
    const wrapperStart = css.indexOf('#toolbar#toolbar > :is(');
    const wrapperRules = wrapperStart >= 0 ? css.slice(wrapperStart, wrapperStart + 2600) : '';
    assert.ok(wrapperRules.includes('#like-button,') && wrapperRules.includes('#reply-button-end,')
        && wrapperRules.includes('height: 32px !important;'));
    assert.ok(wrapperRules.includes('> :is(yt-button-shape, ytd-button-renderer, yt-icon-button)'));
    assert.match(css, /#vote-count-middle[\s\S]{0,1400}font-variant-numeric: tabular-nums !important/);
    assert.match(css, /#creator-heart-button[\s\S]{0,1200}height: 30px !important/);
    assert.match(css, /\[aria-pressed="true"\]/);
    assert.match(css, /\[aria-disabled="true"\]/);
    assert.match(css, /@media \(forced-colors: active\)[\s\S]*ButtonFace/);

    assert.match(visualSystem, /--ytkit-premium-control: #101f33/,
        'the shared visual system must own the dark control surface');
    assert.match(visualSystem, /html:not\(\[dark\]\)[\s\S]*--ytkit-premium-control: #f7f9fb/,
        'the shared visual system must own the light control surface');
});

// ── The extension split: one token set, one flat pane ──

function extensionSheets() {
    const { styles } = loadModule();
    return {
        shell: styles.buildSplitShellCss(),
        meta: styles.buildSplitMetaCss(),
        comments: styles.buildSplitCommentsCss()
    };
}

// Literal colors the split may still name: things that look the same in
// every theme (YouTube's red glyph, the LIVE badge, the creator heart, the
// white play mark) and the close button, which always sits over video.
const THEME_INDEPENDENT_COLORS = new Set([
    '#ff0033', '#ffffff', '#cc0000', '#ff4e45',
    'rgba(8, 8, 10, 0.74)', 'rgba(255, 255, 255, 0.16)', 'rgba(255, 255, 255, 0.3)',
    'rgba(24, 24, 28, 0.86)', 'rgba(0, 0, 0, 0.32)'
]);

test('the extension split derives every color from the page theme and the Astra accent', () => {
    const { shell, meta, comments } = extensionSheets();
    const all = [shell, meta, comments].join('\n');

    // YouTube's own tokens are what the OLED theme and the color themes
    // override, so deriving from them is what makes the split follow those.
    assert.match(shell, /--ytkit-split-text: var\(--yt-spec-text-primary,/);
    assert.match(shell, /--ytkit-split-panel: var\(--yt-spec-base-background,/);
    assert.match(shell, /--ytkit-split-accent: var\(--ytkit-accent,/,
        'the split uses the accent the user picked, not a fixed coral');
    assert.match(shell, /html:not\(\[dark\]\)\.ytkit-split-active \{/,
        'the split must follow YouTube light mode');
    assert.match(shell, /--yt-spec-base-background: var\(--ytkit-split-panel\);/,
        'native fades inside the pane must paint the pane color, not an ancestor scope');
    assert.match(shell, /color-scheme: inherit !important/,
        'the positioned comments surface must inherit the active theme');
    assert.doesNotMatch(all, /--ytkit-premium-/,
        'the split no longer carries its own fixed palette');

    const withoutFallbacks = all.replace(/var\(--[\w-]+,\s*[^()]*(?:\([^()]*\))?[^()]*\)/g, 'var()');
    const literals = withoutFallbacks.match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g) || [];
    const unexpected = [...new Set(literals)].filter((color) => !THEME_INDEPENDENT_COLORS.has(color));
    assert.deepEqual(unexpected, [], 'every other color must come from a token');

    assert.match(MODULE_SOURCE, /background:'var\(--ytkit-split-panel\)'/);
    assert.doesNotMatch(MODULE_SOURCE, /background:'#0b1624'/,
        'positioned split surfaces must not bypass theme tokens');
    assert.doesNotMatch(MODULE_SOURCE, /2px solid rgba\(255,255,255,0\.1\)/,
        'the VOD chat divider must use the hairline token');
    assert.doesNotMatch(all, /border-radius:\s*(?:50%|9{3,}px)/, 'no pill or circle backdrops');
});

test('the extension split keeps shell and metadata sheets safe to strip', () => {
    const { shell, meta } = extensionSheets();
    const { stripCommentRestyleCss } = require('../../extension/core/styles.js');
    for (const [name, css] of [['shell', shell], ['meta', meta]]) {
        // The controller passes these two through stripCommentRestyleCss,
        // which splits on "}": an at-rule block would be cut in half and a
        // comment rule would silently vanish.
        assert.doesNotMatch(css, /@(?:media|container|supports)\b/, `${name} must hold no at-rule blocks`);
        const rules = (css.match(/\}/g) || []).length;
        const kept = (stripCommentRestyleCss(css).match(/\}/g) || []).length;
        assert.equal(kept, rules, `${name} must hold no comment rules the strip would drop`);
    }
});

test('the extension divider and close button carry every interactive state', () => {
    const { shell, comments } = extensionSheets();
    assert.match(shell, /#ytkit-split-divider:hover/);
    assert.match(shell, /#ytkit-split-divider:focus-visible \.ytkit-divider-pip \{[\s\S]{0,120}outline: 2px solid var\(--ytkit-split-accent\)/,
        'keyboard focus on the divider must show a ring');
    assert.match(shell, /#ytkit-split-divider\[data-ytkit-panel-state="closed"\]/,
        'a click-collapsed divider must read as a handle to reopen');
    assert.match(shell, /#ytkit-split-divider\[data-ytkit-panel-state="hidden"\]/);
    assert.match(shell, /#ytkit-split-divider::after \{[\s\S]{0,120}inset: 0 0 0 -8px/,
        'the divider needs a hit area wider than its 8px strip');
    assert.match(shell, /#ytkit-split-close:focus-visible/);
    assert.match(shell, /#ytkit-split-close:active \{ transform: translateY\(0\) scale\(0\.96\)/);
    assert.doesNotMatch(MODULE_SOURCE, /addEventListener\('mouseenter'/,
        'divider hover lives in CSS, where it follows the theme');
    assert.match(comments, /@media \(prefers-reduced-motion: reduce\)[\s\S]*#ytkit-split-divider/);
    assert.match(comments, /@media \(forced-colors: active\)[\s\S]*#ytkit-split-divider[\s\S]*ButtonFace/);
});

test('the extension split lays metadata out title first in one flat section', () => {
    const { meta, comments } = extensionSheets();
    assert.match(meta, /#title h1,\n[^{]*h1\.ytd-watch-metadata \{\n    order: 1 !important/,
        'the video title leads the reading order');
    assert.match(meta, /\.ytkit-split-title-bar \{\n    order: 2 !important[\s\S]{0,400}grid-template-areas: "home actions date" !important/,
        'utilities sit on one compact row after the title');
    assert.match(meta, /ytd-watch-metadata \{\n    display: block !important;[\s\S]{0,400}border: 0 !important;\n    border-bottom: 1px solid var\(--ytkit-split-hairline\) !important;\n    border-radius: 0 !important;\n    background: none !important;/,
        'the watch restyle card is flattened to one section with a hairline under it');
    assert.match(meta, /grid-template-areas: "owner sub" "actions actions" !important/,
        'channel identity and Subscribe share a row');
    assert.match(meta, /#owner:not\(:has\(#subscribe-button \*\)\) \{ grid-template-areas: "owner owner" "actions actions" !important; \}/,
        'a subscribed channel gives the empty slot back');
    assert.match(meta, /height: var\(--ytkit-split-control-h\) !important/);
    assert.match(meta, /\.ytkit-split-upload-date:not\(\[hidden\]\):not\(:empty\) ~ \.ytkit-split-view-count/,
        'date and view count read as one line with a separator');
    assert.match(meta, /#description-inline-expander\) \{\n    margin: 0 !important;\n    padding: 0 !important;\n    border: 0 !important;\n    background: none !important;/,
        'the description is one box, not a box in a box');
    assert.match(comments, /@container ytkit-split-owner \(max-width: 420px\)[\s\S]{0,600}ytkit-watch-action-btn__label[\s\S]{0,200}clip-path: inset\(50%\)/,
        'a narrow pane keeps the action row on one line and Download named for screen readers');
});

test('the extension split keeps comment controls quiet, compact and stateful', () => {
    const { comments } = extensionSheets();
    assert.match(comments, /ytd-comments-header-renderer \{\n    display: flex !important;\n    flex-direction: column !important;\n    align-items: stretch !important;\n    gap: 0 !important;/,
        'the header must not turn its empty children into gapped rows');
    assert.match(comments, /ytd-comments-header-renderer #simple-box \{ margin-top: 16px !important; \}/);
    assert.match(comments, /ytd-comment-engagement-bar #toolbar \{[\s\S]{0,200}gap: 8px !important/);
    const wrapperStart = comments.indexOf('#toolbar#toolbar > :is(');
    const wrapperRules = wrapperStart >= 0 ? comments.slice(wrapperStart, wrapperStart + 900) : '';
    assert.ok(wrapperRules.includes('#like-button,') && wrapperRules.includes('#reply-button-end,')
        && wrapperRules.includes('height: 32px !important;'),
    'YouTube\'s outer action wrappers are held to the 32px row');
    assert.ok(wrapperRules.includes('> :is(yt-button-shape, ytd-button-renderer, yt-icon-button)'),
        'and so are their first-level wrappers');
    assert.match(comments, /#toolbar#toolbar :is\(\.yt-spec-button-shape-next, \.ytSpecButtonShapeNextHost\),[\s\S]{0,700}background: transparent !important;/,
        'comment actions are ghost buttons until hovered');
    assert.match(comments, /:hover \{ background: var\(--ytkit-split-control-hover\) !important;/);
    assert.match(comments, /:active \{ background: var\(--ytkit-split-control-active\) !important; transform: scale\(0\.96\)/);
    assert.match(comments, /\[aria-pressed="true"\] \{ background: var\(--ytkit-split-accent-soft\) !important; color: var\(--ytkit-split-accent-ink\)/,
        'a liked comment reads as selected in the accent');
    assert.match(comments, /\[aria-disabled="true"\]\) \{ opacity: 0\.45 !important;/);
    assert.match(comments, /:focus-visible \{ outline: 2px solid var\(--ytkit-split-accent\) !important;/);
    const countStart = comments.indexOf('ytd-comment-engagement-bar #vote-count-middle {');
    const countRules = countStart >= 0 ? comments.slice(countStart, countStart + 1100) : '';
    assert.ok(/border: 0 !important;[\s\S]*background: transparent !important;[\s\S]*font-variant-numeric: tabular-nums !important;/.test(countRules),
        'like counts are stable inline metadata');
    assert.ok(/#vote-count-middle::after \{\n    content: none !important;\n    display: none !important;/.test(countRules),
        'the native separator after the count is gone');
    assert.match(comments, /#more-replies-sub-thread[\s\S]{0,400}\{[\s\S]{0,700}background: transparent !important;\n    color: var\(--ytkit-split-accent-ink\) !important;/,
        'reply expanders are quiet accent text, not pills');
    assert.match(comments, /#action-menu \{[\s\S]{0,160}opacity: 0 !important;[\s\S]{0,400}:is\(:hover, :focus-within\) > #body > #action-menu/,
        'the overflow menu appears with the comment it belongs to');
    assert.match(comments, /content-visibility: auto !important;/);
});

test('stickyVideo factory returns the full Theater Split runtime surface', () => {
    const { mod } = loadModule();
    const feature = mod.createStickyVideoFeature();

    assert.equal(feature.id, 'stickyVideo');
    assert.equal(feature.name, 'Theater Split');
    assert.deepEqual(feature.pages, ['watch']);
    for (const method of [
        'init',
        'destroy',
        '_activate',
        '_mountOverlay',
        '_expandSplit',
        '_collapseSplit',
        '_unmount',
        '_dockSplitHeader',
        '_resolveSplitPanelType'
    ]) {
        assert.equal(typeof feature[method], 'function', 'factory feature must expose ' + method);
    }
    assert.equal(feature._isActive, false);
    assert.equal(feature._isSplit, false);
});

test('stickyVideo resolves premiered-video chat placeholders back to comments', () => {
    const { mod } = loadModule();
    const feature = mod.createStickyVideoFeature();
    const makeChat = (attrs = [], extra = {}) => ({
        hidden: false,
        hasAttribute: (name) => attrs.includes(name),
        getAttribute: (name) => (name === 'aria-hidden' && attrs.includes('aria-hidden')) ? 'true' : null,
        ...extra
    });
    const visibleChat = makeChat();
    const hiddenChat = makeChat(['hidden']);
    const collapsedChat = makeChat(['collapsed']);
    const belowWithComments = { querySelector: () => ({}) };
    const belowWithoutComments = { querySelector: () => null };

    assert.equal(feature._isSplitChatCandidate(hiddenChat), false,
        'hidden chat placeholders must not be treated as usable split chat');
    assert.equal(feature._resolveSplitPanelType('vod', hiddenChat, belowWithComments), 'standard',
        'past live/premiere pages with hidden chat should show comments full-height');
    assert.equal(feature._resolveSplitPanelType('vod', collapsedChat, belowWithComments), 'standard',
        'collapsed replay shells on comments pages should not reserve a blank chat band');
    assert.equal(feature._resolveSplitPanelType('vod', visibleChat, belowWithComments), 'vod',
        'real VOD chat replay remains a split chat plus comments surface');
    assert.equal(feature._resolveSplitPanelType('standard', visibleChat, belowWithComments), 'standard',
        'stale chat nodes on ordinary comment pages must not steal the right panel');
    assert.equal(feature._resolveSplitPanelType('standard', visibleChat, belowWithoutComments), 'live',
        'late visible chat without a comments surface still reclassifies as live');
    assert.equal(feature._resolveSplitPanelType('premiere', visibleChat, belowWithComments), 'standard',
        'premiered videos with a comments surface prefer comments over chat chrome');
});


test('stickyVideo keeps comment scrolling native and bounds offscreen rendering', () => {
    const { styles } = loadModule();
    const moduleSource = readTheaterSplitSource();
    const userscriptSource = fs.readFileSync(path.join(config.repoRoot, 'theater-split.user.js'), 'utf8');
    const commentsCss = styles.buildSplitCommentsCss();

    for (const [contents, label] of [
        [moduleSource, 'extension module'],
        [userscriptSource, 'standalone userscript'],
    ]) {
        const nativeScrollGateCount = (
            contents.match(/if \(isInRightContent\(e\.target\)\) return;/g) || []
        ).length + (
            contents.match(/if \(isSplit && !isInRightContent\(e\.target\)\)/g) || []
        ).length;
        assert.ok(nativeScrollGateCount >= 2,
            `${label} must leave right-panel wheel and touch gestures on the native scroller`);
        assert.ok(contents.includes("'overscroll-behavior-y'"),
            `${label} must contain split-panel scroll chaining`);
        assert.ok(contents.includes("classList.add('ytkit-split-scroll-surface')")
            && contents.includes("classList.remove('ytkit-split-scroll-surface')"),
            `${label} must add and clean up the stable split-surface class`);
        assert.ok(!contents.includes('#below[style*="position"]')
            && !contents.includes('#below[style*="position:fixed"]'),
            `${label} must not use expensive inline-style substring selectors for the split surface`);
    }

    assert.ok(commentsCss.includes('content-visibility: auto !important;'),
        'split comments should skip layout and paint for offscreen threads');
    assert.ok(commentsCss.includes('contain-intrinsic-size: auto 180px !important;'),
        'offscreen threads should reserve a stable learned scroll size');
    assert.ok(commentsCss.includes('#below.ytkit-split-scroll-surface'),
        'split comments CSS should use the stable surface class');
});

test('stickyVideo clamps live titles and keeps responsive header geometry bounded', () => {
    const { styles } = loadModule();
    const css = styles.buildSplitMetaCss();
    const userscriptPath = path.join(config.repoRoot, 'theater-split.user.js');
    const theaterSplit = fs.readFileSync(userscriptPath, 'utf8');

    for (const [contents, label] of [[css, 'extension metadata CSS']]) {
        assert.ok(contents.includes('white-space: normal !important;'),
            `${label} must override YouTube title nowrap/truncation in the split pane`);
        assert.ok(contents.includes('overflow-wrap: anywhere !important;'),
            `${label} must keep long title tokens inside the right pane`);
        assert.ok(contents.includes('max-inline-size: 100% !important;'),
            `${label} must constrain modern YouTube title hosts to the pane inline size`);
        assert.ok(contents.includes('yt-core-attributed-string--white-space-pre-wrap'),
            `${label} must cover YouTube attributed-string title children`);
        assert.ok(contents.includes('-webkit-line-clamp: unset !important;'),
            `${label} must remove native watch-title clamping in the split pane`);
    }

    for (const [contents, label] of [
        [MODULE_SOURCE, 'extension live header'],
        [theaterSplit, 'standalone live header'],
    ]) {
        assert.ok(contents.includes('const narrow = headerWidth > 0 && headerWidth < 420')
            && contents.includes('baseHeaderHeight = narrow ? 190 : (compact ? 164'),
            `${label} must switch to a dedicated narrow live-header layout`);
        assert.ok(contents.includes('grid-template-columns:minmax(0,1fr) minmax(0,min(330px,42%))'),
            `${label} must bound the native action column so the title cannot measure wider than the pane`);
        assert.ok(contents.includes("card.style.gridTemplateAreas = narrow")
            && contents.includes('\'"channel" "actions" "title" "meta"\''),
            `${label} must give narrow headers full-width rows for actions and title metadata`);
        assert.ok(contents.includes("'overflow:hidden'"),
            `${label} must contain live-header content while its width changes`);
        assert.ok(contents.includes('min-width:0;width:100%;max-width:100%;contain:inline-size;overflow:hidden;'),
            `${label} must contain the action dock instead of letting native controls force hidden overflow`);
        assert.ok(contents.includes('const naturalWidth = Math.max(32, Math.ceil(rect.width || control.offsetWidth || 96));')
            && contents.includes('const controlWidth = Math.max(32, Math.floor((availableWidth - gapWidth) / naturalMetrics.length));')
            && contents.includes('width: Math.min(item.naturalWidth, controlWidth)')
            && contents.includes("actions.style.width = '100%'")
            && contents.includes("control.style.setProperty('max-width', `${width}px`, 'important');"),
            `${label} must fit every pinned live action inside the measured row`);
        assert.ok(contents.includes("'width:100%'"),
            `${label} must stretch the live title within the bounded card`);
        assert.ok(contents.includes("'display:-webkit-box'") && contents.includes("'-webkit-line-clamp:2'"),
            `${label} must clamp long live titles to two readable lines`);
        assert.ok(contents.includes('maxHeaderHeight = Math.max(baseHeaderHeight, Math.min(260, Math.round(window.innerHeight * 0.42)))'),
            `${label} must cap header growth so chat remains useful`);
        assert.ok(contents.includes("titleEl.style.setProperty('-webkit-line-clamp', '2')"),
            `${label} must preserve the live-title clamp after metadata refreshes`);
        assert.ok(contents.includes("titleEl.style.setProperty('white-space', 'normal')")
            && contents.includes("titleEl.style.setProperty('overflow-wrap', 'anywhere')")
            && contents.includes("titleEl.style.setProperty('word-break', 'normal')"),
            `${label} must reapply live-title wrapping after each metadata refresh`);
        assert.ok(contents.includes('const measuredCardHeight = Math.max(card?.scrollHeight || 0, card?.getBoundingClientRect?.().height || 0);')
            && contents.includes('const measuredHeaderHeight = Math.ceil((measuredCardHeight || baseHeaderHeight - outerVerticalPadding) + outerVerticalPadding);'),
            `${label} must measure the clamped card with its responsive outer padding`);
        assert.ok(contents.includes('const dateInfo = supplementalInfo || dateText;'),
            `${label} must avoid repeating upload dates while a live start status is available`);
        assert.ok(contents.includes("replace(/\\swatching$/i, ' watching now')"),
            `${label} must label live audience counts read from the page clearly`);
        // A count the header formats itself goes through a locale key in the
        // extension, and must not depend on rewriting an English "views"
        // suffix, which no other locale has. The standalone userscript ships
        // English only.
        assert.ok(label.startsWith('extension')
            ? contents.includes("t('stickyVideoWatchingNowTpl', '{count} watching now')")
                && contents.includes('this._formatSplitWatchingCount(playerResponse?.videoDetails?.viewCount)')
                && !contents.includes("replace(/\\s+views$/i, ' watching now')")
            : contents.includes("replace(/\\s+views$/i, ' watching now')"),
            `${label} must label fallback live audience counts clearly`);
        assert.ok(contents.includes('const liveHeaderTop =')
            && contents.includes("chatEl.style.setProperty('top', `${liveHeaderTop}px`, 'important')")
            && contents.includes("chatEl.style.setProperty('height', `calc(100vh - ${liveHeaderTop}px)`, 'important')"),
            `${label} must remeasure and reposition chat during divider resizing`);
        assert.ok(contents.includes('return liveHeaderHeight;'),
            `${label} must return the measured height so live chat starts below the title area`);
        assert.ok(contents.includes('.ytkit-split-live-card')
            && contents.includes('background: var(--')
            && contents.includes('-raised) !important;'),
            `${label} must theme the live card through the active split palette`);
        assert.ok(contents.includes('[data-ytkit-split-live-pinned="1"] *')
            && contents.includes('background: var(--')
            && contents.includes('-control) !important;')
            && contents.includes('-webkit-text-fill-color: var(--'),
            `${label} must keep pinned live actions legible in dark and light themes`);
        assert.ok(!contents.includes("button.style.setProperty('border-radius', '999px', 'important')"),
            `${label} must not turn pinned live actions into oversized pills`);
    }
});


test('stickyVideo monolith prefers the module runtime factory before inline fallback', () => {
    const factoryNeedle = 'globalThis.YTKitFeatures?.stickyVideo?.createStickyVideoFeature?.({';
    const factoryIndex = sources.ytkit.indexOf(factoryNeedle);
    assert.ok(factoryIndex > -1, 'ytkit.js must construct stickyVideo through the module factory');
    const fallbackIndex = sources.ytkit.indexOf("id: 'stickyVideo'", factoryIndex);
    assert.ok(fallbackIndex > factoryIndex, 'ytkit.js must retain the inline stickyVideo fallback after the factory call');
    assert.ok(sources.ytkit.slice(factoryIndex, fallbackIndex).includes('}) || {'),
        'module factory path must fall back to the inline feature object');

    for (const dep of [
        'PageTypes',
        'VideoTypeDetector',
        'getVideoId',
        '_rw',
        'getFeatureById',
        'storageRead',
        'storageWrite',
        'DebugManager',
        'checkAllButtons',
        'waitForElement',
        'injectStyle',
        'stripCommentRestyleCss',
        'addNavigateRule',
        'removeNavigateRule'
    ]) {
        assert.ok(
            sources.ytkit.slice(factoryIndex, fallbackIndex).includes(dep),
            'ytkit.js factory dependency bag must include ' + dep
        );
    }
});

test('stickyVideo module loads before ytkit.js in content scripts', () => {
    for (const scriptGroup of config.manifest.content_scripts) {
        const scripts = scriptGroup.js || [];
        const ytkitIndex = scripts.indexOf('ytkit.js');
        if (ytkitIndex === -1) continue;
        const moduleIndex = scripts.indexOf('features/sticky-video/index.js');
        assert.ok(moduleIndex > -1, 'manifest content script must include sticky-video module');
        assert.ok(moduleIndex < ytkitIndex, 'sticky-video module must load before ytkit.js');
    }
});

test('stickyVideo chat observer lifecycle uses one teardown path (NF32)', () => {
    const block = MODULE_SOURCE;

    assert.doesNotMatch(block, /_pendingChatObs|_chatSafetyTimeout|_chatWatcherObs|_chatWatcherStopTimer/,
        'stickyVideo must not reintroduce separate pending-chat and late-chat observer state');
    assert.match(block, /_chatObserver:\s*null/,
        'stickyVideo must declare the single chat observer slot');
    assert.match(block, /_chatObserverTimer:\s*null/,
        'stickyVideo must declare the single chat observer safety timer');
    assert.match(block, /_stopChatObserver\(\)\s*\{[\s\S]*this\._chatObserver\?\.disconnect\(\)[\s\S]*this\._chatObserver\s*=\s*null/,
        'stickyVideo must have one idempotent observer cleanup helper');
    assert.match(block, /_watchForChat\(options = \{\}\)\s*\{[\s\S]*this\._stopChatObserver\(\)[\s\S]*new MutationObserver[\s\S]*this\._chatObserver\.observe\(document\.body,\s*\{ childList: true, subtree: true \}\)[\s\S]*setTimeout\(\(\) => this\._stopChatObserver\(\), options\.timeoutMs \|\| 10000\)/,
        'stickyVideo must route all chat watches through _watchForChat');
    assert.match(block, /_waitForChat\(rightPct, topOffset, heightStr\)\s*\{[\s\S]*this\._watchForChat\(\{[\s\S]*position: true[\s\S]*timeoutMs: 10000[\s\S]*\}\)/,
        '_waitForChat must use the shared observer lifecycle for split-open positioning');
    assert.match(block, /this\._watchForChat\(\{ position: false, timeoutMs: 15000 \}\)/,
        'standard-page late-chat reclassification must use the shared observer lifecycle');
    assert.match(block, /_unmount\(keepClass\)\s*\{[\s\S]*this\._stopChatObserver\(\)/,
        '_unmount must stop the shared chat observer');
    assert.match(block, /destroy\(\)\s*\{[\s\S]*this\._stopChatObserver\(\)/,
        'destroy must stop the shared chat observer even when no overlay is active');
});

test('stickyVideo keeps the comments-first panel resolver', () => {
    const block = MODULE_SOURCE;

    assert.match(block, /_resolveSplitPanelType\(rawType, chatEl, below\)/,
        'the module must keep the split panel type resolver');
    assert.match(block, /_isSplitChatCandidate\(chatEl\)/,
        'the module must filter hidden chat placeholders');
    assert.match(block, /Late chat ignored, using \$\{resolvedType\} comments panel/,
        'late stale chat frames must be ignored in favor of the comments panel');
});

test('abortDividerDrag exists in the userscript companion (H8)', () => {
    // The H8 fix introduced an idempotent abortDividerDrag() called
    // from teardown() to prevent orphaned mousemove listeners after
    // an SPA nav mid-drag. Pin its presence so the fix can't regress.
    const userscriptPath = path.join(config.repoRoot, 'theater-split.user.js');
    const source = fs.readFileSync(userscriptPath, 'utf8');
    assert.match(source, /abortDividerDrag/,
        'theater-split.user.js must keep the abortDividerDrag helper');
});

test('fullscreen exit only pins a px player width while the resize observer is attached', () => {
    // The resize observer is disconnected while the split is collapsed, so a
    // px width written on fullscreen exit survived every later window resize
    // until the next expand. Collapsed state must stay fluid.
    const moduleSource = fs.readFileSync(path.join(__dirname, MODULE_PATH), 'utf8');
    for (const [label, source] of [['sticky-video module', moduleSource]]) {
        const start = source.indexOf('const leftW = this._isSplit');
        assert.ok(start > -1, `${label} must compute a restore width on fullscreen exit`);
        const block = source.slice(start, start + 700);
        assert.match(block, /:\s*0;/,
            `${label} must not fall back to a window.innerWidth px snapshot when collapsed`);
        assert.match(block, /width: leftW > 0 \? leftW \+ 'px' : '100%'/,
            `${label} must restore a fluid width unless the split pane measured one`);
        assert.doesNotMatch(block, /:\s*window\.innerWidth;/,
            `${label} collapsed branch must not pin the viewport width in pixels`);
    }
});

const STICKY_MODULE_SOURCE = readTheaterSplitSource();

// ── Collapse belongs to the comments pane, not the video ───────────────
// Scrolling up while the pointer rested over the player used to throw the
// split away on a 3-tick guard. Collapse is now owned solely by the comments
// column reaching its top and being pushed past it.
test('scrolling over the video never collapses the split', () => {
    for (const [label, source] of [['module', STICKY_MODULE_SOURCE]]) {
        const start = source.indexOf('this._wheelHandler = (e) => {');
        assert.ok(start > -1, `${label} must define the document wheel handler`);
        const handler = source.slice(start, start + 2600);

        assert.ok(!/isOverPlayer\(e\.target\) && e\.deltaY < 0[\s\S]{0,400}_collapseSplit/.test(handler),
            `${label}: an up-scroll over the player must not reach _collapseSplit`);
        assert.ok(!handler.includes('_playerCollapseCount'),
            `${label}: the player-side collapse counter must be gone entirely`);

        // It still proxies the gesture, in both directions, because the page
        // scroller is disabled while the split is open.
        assert.match(handler, /scrollEl\.scrollTop \+= e\.deltaY;/,
            `${label}: wheel over the player must still scroll the comments pane`);

        // Same rule for touch: no pull-down-on-video collapse.
        const touchStart = source.indexOf('this._touchMoveHandler = (e) => {');
        const touchHandler = source.slice(touchStart, touchStart + 1800);
        assert.ok(!/isOverPlayer\(e\.target\) && delta < -40[\s\S]{0,200}_collapseSplit/.test(touchHandler),
            `${label}: a swipe over the player must not collapse the split`);
        assert.ok(!/delta < -40 && scrollEl\.scrollTop <= 0/.test(touchHandler),
            `${label}: the forwarded-touch path must not collapse either`);
    }
});

test('the comments pane collapses only after being pushed past its top', () => {
    for (const [label, source] of [['module', STICKY_MODULE_SOURCE]]) {
        const start = source.indexOf('this._rightWheelHandler = (e) => {');
        assert.ok(start > -1, `${label} must define the comments-pane wheel handler`);
        const handler = source.slice(start, start + 900);

        // Reaching the top is not enough — that is what "past the title" means.
        assert.match(handler, /scrollEl\.scrollTop <= 0 && e\.deltaY < 0/,
            `${label}: collapse must require being at the top AND still scrolling up`);
        assert.match(handler, /_collapseScrollCount >= 3/,
            `${label}: landing on the top edge must not collapse on its own`);
        assert.match(handler, /_collapseScrollCount = 0;\s*\n\s*\}\s*\n\s*\};/,
            `${label}: any downward scroll must reset the counter`);
    }
});

// ── Quick Links dropdown footer ────────────────────────────────────────
// The Edit and Settings controls are icon-only, but the footer was a
// 2-column 1fr/1fr grid with align-items: stretch AND the buttons carry
// .ytkit-ql-item (flex: 1 1 auto) — so each was drawn as a half-width,
// 34px-tall slab holding a 12px glyph.
test('the Quick Links footer renders compact icon buttons, not half-width slabs', () => {
    const playerDock = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'player-dock', 'index.js'), 'utf8');
    const userscriptCore = fs.readFileSync(
        path.join(__dirname, '..', '..', 'YTKit-core.user.js'), 'utf8');
    const iconLibrary = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'core', 'icons.js'), 'utf8');

    const footerBuildStart = sources.ytkit.indexOf('// Bottom row: Edit + Settings');
    const footerBuildEnd = sources.ytkit.indexOf('menu.appendChild(bottomRow);', footerBuildStart);
    const footerBuild = footerBuildStart >= 0
        ? sources.ytkit.slice(footerBuildStart, footerBuildEnd + 260)
        : '';
    assert.match(iconLibrary, /\bedit:\s*\(\)\s*=>\s*createSVG/,
        'the shared icon library must own the Edit glyph');
    assert.match(iconLibrary, /function hardenOutlineIcon\(svg\)[\s\S]{0,900}style\.setProperty\('fill', 'none', 'important'\)[\s\S]{0,360}style\.setProperty\('stroke', 'currentColor', 'important'\)/,
        'the shared icon library must offer host-proof outline paint');
    assert.match(footerBuild, /ICONS\.edit\(\)/,
        'the Edit control must use the shared icon library');
    assert.match(footerBuild, /ICONS\.settings\(\)/,
        'the Settings control must use the shared icon library');
    assert.match(footerBuild, /style\.setProperty\([\s\S]{0,180}light-dark\(#334155, rgba\(226, 232, 240, 0\.86\)\)[\s\S]{0,180}'important'/,
        'footer controls must pin their theme foreground above YouTube button rules');
    assert.match(footerBuild, /hardenOutlineIcon\?\.\(icon\)/,
        'footer glyphs must use the shared host-proof outline helper');
    assert.doesNotMatch(footerBuild, /TrustedHTML\.setHTML\((?:editBtn|gear)/,
        'footer controls must not carry handwritten inline SVG markup');

    // The userscript bundle ships these stylesheets whitespace-compacted, so
    // every lookup below is written against `selector{...}` with optional
    // spacing rather than the source formatting. Splitting on a literal
    // "selector {" silently found nothing once compaction reached player-dock,
    // and a loop over zero blocks asserts nothing at all.
    const declarationsFor = (source, selector) => {
        const literal = selector.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
        const pattern = new RegExp(`${literal}${String.raw`\s*\{([^}]*)\}`}`, 'g');
        return [...source.matchAll(pattern)].map(match => match[1]);
    };

    for (const [label, source] of [['userscript core', userscriptCore], ['player-dock', playerDock]]) {
        // No footer row may still be a stretched two-column grid.
        const rows = declarationsFor(source, '.ytkit-ql-bottom');
        assert.ok(rows.length >= 1, `${label}: stylesheet must define the footer row`);
        for (const decl of rows) {
            assert.ok(!/grid-template-columns:\s*repeat\(2/.test(decl),
                `${label}: the footer must not lay two icon buttons out as equal columns`);
            assert.ok(!/align-items:\s*stretch/.test(decl),
                `${label}: stretching is what made them full-height slabs`);
        }
    }

    // And the buttons must opt out of the .ytkit-ql-item flex grow they inherit.
    for (const [label, source] of [['userscript core', userscriptCore], ['player-dock', playerDock]]) {
        const btnBlocks = declarationsFor(source, '.ytkit-ql-bottom-btn');
        assert.ok(btnBlocks.length >= 1, `${label}: stylesheet must define the button`);
        for (const decl of btnBlocks) {
            assert.match(decl, /flex:\s*0 0 auto/,
                `${label}: without this the .ytkit-ql-item flex grow stretches the button again`);
            // 28px in the base sheets, 26px in the denser po-drop override.
            assert.match(decl, /width:\s*2[0-9]px/, `${label}: the control should be a square, sized to its glyph`);
            assert.match(decl, /height:\s*2[0-9]px/);
        }

        const poBlocks = declarationsFor(source, '#ytkit-po-drop .ytkit-ql-bottom-btn');
        assert.ok(poBlocks.length >= 1, `${label}: stylesheet must define the compact override`);
        for (const decl of poBlocks) {
            assert.match(decl, /flex:\s*0 0 auto\s*!important/,
                `${label}: the compact override must not reintroduce the stretch`);
        }
    }

    assert.match(sources.ytkit,
        /html body \.ytkit-ql-drop \.ytkit-ql-bottom-btn \.ytkit-ql-icon[\s\S]{0,320}fill: none !important[\s\S]{0,160}stroke: currentColor !important/,
        'the footer icon root must resist YouTube dark-theme SVG paint rules');
    assert.match(sources.ytkit,
        /html body \.ytkit-ql-drop \.ytkit-ql-bottom-btn \.ytkit-ql-icon :is\(path, circle, rect, line, polyline, polygon\)[\s\S]{0,320}fill: none !important[\s\S]{0,160}stroke: currentColor !important/,
        'every outline glyph part must inherit the visible footer foreground');
    assert.match(sources.ytkit,
        /:is\(#ytkit-ql-menu, #ytkit-po-drop\) \.ytkit-ql-bottom-btn \.ytkit-ql-icon[\s\S]{0,420}fill: none !important[\s\S]{0,160}stroke: currentColor !important/,
        'real menu ids must outrank late YouTube SVG paint rules');
    assert.match(sources.ytkit,
        /html\[dark\] body \.ytkit-ql-drop \.ytkit-ql-bottom-btn[\s\S]{0,160}color: rgba\(226, 232, 240, 0\.86\) !important/,
        'dark YouTube button rules must not be able to repaint footer icons black');
    assert.match(sources.ytkit,
        /html:not\(\[dark\]\) body \.ytkit-ql-drop \.ytkit-ql-bottom-btn[\s\S]{0,160}color: #334155 !important/,
        'light mode must retain its own footer icon foreground');
});

test('the monolith carries only a descriptor stub for stickyVideo', () => {
    // What this replaces: ytkit.js used to hold a second, hand-synchronised
    // copy of this entire feature - 316,911 bytes and 133 behaviour
    // properties, parsed on every page load and then discarded by the `||`.
    // Keeping the two in step was manual, and a fix applied to one and not the
    // other diverged silently until a module failed to load and the stale copy
    // took over.
    const [fallback] = extractFeatureBlock(sources.ytkit, 'stickyVideo');
    assert.ok(fallback.length < 2000,
        `the stickyVideo fallback grew back to ${fallback.length} bytes; it must stay a descriptor stub`);
    for (const key of ['id', 'name', 'description', 'group', 'icon', 'pages']) {
        assert.match(fallback, new RegExp('\\b' + key + ':'), `the stub still needs ${key} for the settings list`);
    }
    assert.doesNotMatch(fallback, /_resolveSplitPanelType|buildSplitShellCss|_dockSplitHeader/,
        'behaviour belongs in the module, not in a second copy');
    assert.match(sources.ytkit, /YTKitFeatures\?\.stickyVideo\?\.createStickyVideoFeature/,
        'ytkit.js must still call the module factory');
});
