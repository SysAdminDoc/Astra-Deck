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
const { sources, config, extractFeatureBlock } = require('../helpers/source');

const MODULE_PATH = '../../extension/features/sticky-video/index.js';

// The behaviour used to exist twice: once in the feature module and once as an
// inline fallback inside ytkit.js that every page load parsed and discarded.
// The fallback is a descriptor stub now, so the module IS the implementation
// and these assertions read it directly.
const MODULE_SOURCE = fs.readFileSync(
    path.join(config.repoRoot, 'extension', 'features', 'sticky-video', 'index.js'), 'utf8');

function loadModule() {
    const originalFeatures = globalThis.YTKitFeatures;
    delete require.cache[require.resolve(MODULE_PATH)];
    globalThis.YTKitFeatures = {};
    const mod = require(MODULE_PATH);
    const exported = globalThis.YTKitFeatures.stickyVideo;
    globalThis.YTKitFeatures = originalFeatures;
    return { mod, exported };
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

test('stickyVideo module exports the Theater Split style builders', () => {
    const { mod, exported } = loadModule();
    assert.equal(typeof mod.buildSplitShellCss, 'function');
    assert.equal(typeof mod.buildSplitMetaCss, 'function');
    assert.equal(typeof mod.buildSplitCommentsCss, 'function');
    assert.equal(typeof mod.createStickyVideoFeature, 'function');
    assert.deepEqual(mod.STYLE_IDS, {
        shell: 'stickyVideo',
        meta: 'stickyVideo-meta-layout',
        comments: 'stickyVideo-comments'
    });
    assert.equal(typeof exported.buildSplitShellCss, 'function');
    assert.equal(typeof exported.createStickyVideoFeature, 'function');
});

test('Theater Split keeps the premium theme and accessible divider in both builds', () => {
    const { mod } = loadModule();
    const commentsCss = mod.buildSplitCommentsCss();
    const standalone = fs.readFileSync(
        path.join(config.repoRoot, 'theater-split.user.js'),
        'utf8'
    );

    for (const [source, label] of [
        [MODULE_SOURCE, 'extension module'],
        [standalone, 'standalone userscript'],
    ]) {
        assert.match(source, /setAttribute\('role', 'separator'\)/,
            `${label} must expose the resize divider as a separator`);
        assert.match(source, /setAttribute\('aria-orientation', 'vertical'\)/,
            `${label} must expose the divider orientation`);
        assert.match(source, /setAttribute\('aria-valuenow'/,
            `${label} must keep the divider value current`);
        assert.match(source, /e\.key === 'ArrowLeft'/,
            `${label} must support keyboard resizing`);
        assert.match(source, /e\.detail >= 2/,
            `${label} must reset on the second divider press`);
        assert.match(source, /68/,
            `${label} must retain the balanced 68\/32 default`);
    }

    assert.match(commentsCss, /--ytkit-split-panel: #0d1928/);
    assert.match(commentsCss, /#ytkit-split-divider:focus-visible/);
    assert.match(commentsCss, /border-radius: 6px !important/);
    assert.match(standalone, /--ts-panel: #0d1928/);
    assert.match(standalone, /#ts-divider:focus-visible/);
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
    const { mod } = loadModule();
    const moduleSource = fs.readFileSync(path.join(config.repoRoot, 'extension', 'features', 'sticky-video', 'index.js'), 'utf8');
    const userscriptSource = fs.readFileSync(path.join(config.repoRoot, 'theater-split.user.js'), 'utf8');
    const commentsCss = mod.buildSplitCommentsCss();

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

test('stickyVideo wraps split-pane titles and grows live header height from rendered content', () => {
    const { mod } = loadModule();
    const css = mod.buildSplitMetaCss();
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
        assert.ok(contents.includes('baseHeaderHeight = compact ? 172'),
            `${label} must reserve enough compact height for wrapped live titles`);
        assert.ok(contents.includes('grid-template-columns:minmax(0,1fr) minmax(0,min(330px,42%))'),
            `${label} must bound the native action column so the title cannot measure wider than the pane`);
        assert.ok(contents.includes("'overflow:visible'"),
            `${label} must let wrapped live-title content contribute to measured header height`);
        assert.ok(contents.includes('min-width:0;width:100%;max-width:100%;contain:inline-size;overflow:hidden;'),
            `${label} must contain the action dock instead of letting native controls force hidden overflow`);
        assert.ok(contents.includes('const naturalWidth = Math.max(32, Math.ceil(rect.width || control.offsetWidth || 96));')
            && contents.includes('width: Math.min(180, naturalWidth)')
            && contents.includes("actions.style.width = '100%'")
            && contents.includes("control.style.setProperty('max-width', `${width}px`, 'important');"),
            `${label} must cap misreported native action widths before positioning pinned controls`);
        assert.ok(contents.includes("'width:100%'"),
            `${label} must stretch the live title within the bounded card`);
        assert.ok(contents.includes("'display:block'") && contents.includes("'-webkit-line-clamp:unset'"),
            `${label} must render live titles as full block text instead of a clamped webkit box`);
        assert.ok(contents.includes('maxHeaderHeight = Math.max(baseHeaderHeight, Math.min(420, Math.round(window.innerHeight * 0.5)))'),
            `${label} must leave enough measured height for the full wrapped live title`);
        assert.ok(contents.includes("titleEl.style.setProperty('-webkit-line-clamp', 'unset')"),
            `${label} must not reintroduce runtime live-title clamping`);
        assert.ok(contents.includes("titleEl.style.setProperty('white-space', 'normal')")
            && contents.includes("titleEl.style.setProperty('overflow-wrap', 'anywhere')")
            && contents.includes("titleEl.style.setProperty('word-break', 'break-word')"),
            `${label} must reapply live-title wrapping after each metadata refresh`);
        assert.ok(contents.includes('const measuredHeaderHeight = Math.ceil((card?.scrollHeight || baseHeaderHeight - 20) + 20);'),
            `${label} must measure the wrapped title before offsetting chat`);
        assert.ok(contents.includes('return liveHeaderHeight;'),
            `${label} must return the measured height so live chat starts below the title area`);
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

const STICKY_MODULE_SOURCE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'extension', 'features', 'sticky-video', 'index.js'), 'utf8');

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

    for (const [label, source] of [['monolith', sources.ytkit], ['player-dock', playerDock]]) {
        // No footer row may still be a stretched two-column grid.
        const rows = source.split('.ytkit-ql-bottom {').slice(1);
        for (const row of rows) {
            const decl = row.slice(0, row.indexOf('}'));
            assert.ok(!/grid-template-columns:\s*repeat\(2/.test(decl),
                `${label}: the footer must not lay two icon buttons out as equal columns`);
            assert.ok(!/align-items:\s*stretch/.test(decl),
                `${label}: stretching is what made them full-height slabs`);
        }
    }

    // And the buttons must opt out of the .ytkit-ql-item flex grow they inherit.
    const btnBlocks = sources.ytkit.split('.ytkit-ql-bottom-btn {').slice(1);
    assert.ok(btnBlocks.length >= 2, 'both stylesheet copies must define the button');
    for (const block of btnBlocks) {
        const decl = block.slice(0, block.indexOf('}'));
        assert.match(decl, /flex:\s*0 0 auto/,
            'without this the .ytkit-ql-item flex grow stretches the button again');
        // 28px in the base sheets, 26px in the denser po-drop override.
        assert.match(decl, /width:\s*2[0-9]px/, 'the control should be a square, sized to its glyph');
        assert.match(decl, /height:\s*2[0-9]px/);
    }

    // The override layer must not reintroduce the stretch.
    const poStart = sources.ytkit.indexOf('#ytkit-po-drop .ytkit-ql-bottom-btn {');
    const poBlock = sources.ytkit.slice(poStart, poStart + 400);
    assert.match(poBlock, /flex:\s*0 0 auto !important/);
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
