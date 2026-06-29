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

test('stickyVideo style builders preserve the monolith fallback CSS', () => {
    const { mod } = loadModule();
    const [block] = extractFeatureBlock(sources.ytkit, 'stickyVideo');

    assert.equal(mod.buildSplitShellCss(), extractTemplate(block, 'css'));
    assert.equal(mod.buildSplitMetaCss(), extractTemplate(block, 'splitMetaCss'));
    assert.equal(mod.buildSplitCommentsCss(), extractTemplate(block, 'splitCommentsCss'));
});

test('stickyVideo wraps split-pane titles and grows live header height from rendered content', () => {
    const { mod } = loadModule();
    const css = mod.buildSplitMetaCss();
    const userscriptPath = path.join(config.repoRoot, 'theater-split.user.js');
    const theaterSplit = fs.readFileSync(userscriptPath, 'utf8');

    for (const [contents, label] of [
        [css, 'extension metadata CSS'],
        [sources.ytkit, 'extension fallback CSS'],
    ]) {
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
        [sources.ytkit, 'extension live header'],
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

test('stickyVideo monolith delegates style payloads through the feature module', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'stickyVideo');
    assert.match(block, /globalThis\.YTKitFeatures && globalThis\.YTKitFeatures\.stickyVideo/,
        'ytkit.js must read the stickyVideo feature namespace');
    for (const builder of [
        'buildSplitShellCss',
        'buildSplitMetaCss',
        'buildSplitCommentsCss'
    ]) {
        assert.match(block, new RegExp('stickyVideoFeatures\\.' + builder),
            'ytkit.js must delegate to ' + builder + ' when the module is loaded');
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
    const [block] = extractFeatureBlock(sources.ytkit, 'stickyVideo');

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

test('stickyVideo inline fallback keeps the comments-first panel resolver', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'stickyVideo');

    assert.match(block, /_resolveSplitPanelType\(rawType, chatEl, below\)/,
        'inline fallback must keep the split panel type resolver');
    assert.match(block, /_isSplitChatCandidate\(chatEl\)/,
        'inline fallback must filter hidden chat placeholders');
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
