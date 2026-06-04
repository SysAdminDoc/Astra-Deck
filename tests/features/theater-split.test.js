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
    assert.deepEqual(mod.STYLE_IDS, {
        shell: 'stickyVideo',
        meta: 'stickyVideo-meta-layout',
        comments: 'stickyVideo-comments'
    });
    assert.equal(typeof exported.buildSplitShellCss, 'function');
});

test('stickyVideo style builders preserve the monolith fallback CSS', () => {
    const { mod } = loadModule();
    const [block] = extractFeatureBlock(sources.ytkit, 'stickyVideo');

    assert.equal(mod.buildSplitShellCss(), extractTemplate(block, 'css'));
    assert.equal(mod.buildSplitMetaCss(), extractTemplate(block, 'splitMetaCss'));
    assert.equal(mod.buildSplitCommentsCss(), extractTemplate(block, 'splitCommentsCss'));
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

test('abortDividerDrag exists in the userscript companion (H8)', () => {
    // The H8 fix introduced an idempotent abortDividerDrag() called
    // from teardown() to prevent orphaned mousemove listeners after
    // an SPA nav mid-drag. Pin its presence so the fix can't regress.
    const userscriptPath = path.join(config.repoRoot, 'theater-split.user.js');
    const source = fs.readFileSync(userscriptPath, 'utf8');
    assert.match(source, /abortDividerDrag/,
        'theater-split.user.js must keep the abortDividerDrag helper');
});
