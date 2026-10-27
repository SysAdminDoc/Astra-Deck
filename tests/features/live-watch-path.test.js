'use strict';

// youtube.com/live/<id> renders the watch page under its own path. The
// modules below gated on pathname.startsWith('/watch'), so a /live/<id> link
// got no Theater Split and a Video Hider that thought it was on 'other'.
// Each one now asks core/page.js, which these load in a sandbox at a given URL.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { sources } = require('../helpers/source');

const ROOT = path.join(__dirname, '..', '..');
const pageSource = fs.readFileSync(path.join(ROOT, 'extension', 'core', 'page.js'), 'utf8');

function coreAt(href) {
    const url = new URL(href);
    const context = { window: { location: { pathname: url.pathname, hostname: url.hostname } } };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(pageSource, context, { filename: 'extension/core/page.js' });
    return context.YTKitCore;
}

// The modules resolve their default from globalThis.YTKitCore when the
// factory runs, the way ytkit.js builds them after core has loaded.
function build(modulePath, factory, core, deps = {}) {
    const originalFeatures = globalThis.YTKitFeatures;
    const originalCore = globalThis.YTKitCore;
    delete require.cache[require.resolve(modulePath)];
    globalThis.YTKitFeatures = {};
    globalThis.YTKitCore = { isWatchPagePath: core.isWatchPagePath };
    try {
        return require(modulePath)[factory](deps);
    } finally {
        globalThis.YTKitFeatures = originalFeatures;
        globalThis.YTKitCore = originalCore;
    }
}

test('Video Hider scopes a /live/<id> page as a watch page', () => {
    const core = coreAt('https://www.youtube.com/live/dQw4w9WgXcQ');
    const hider = build('../../extension/features/video-hider/index.js', 'createHideVideosFromHomeFeature', core);
    assert.equal(hider._getCurrentScope('/live/dQw4w9WgXcQ'), 'watch');
    assert.equal(hider._getCurrentScope('/watch'), 'watch');
    assert.equal(hider._getCurrentScope('/@LofiGirl/live'), 'channel', "a channel's live tab stays a channel page");
    assert.equal(hider._getCurrentScope('/live/abc123'), 'other');
});

function activateSplitAt(href) {
    const core = coreAt(href);
    const refreshes = [];
    const waits = [];
    const split = build('../../extension/features/sticky-video/index.js', 'createStickyVideoFeature', core, {
        VideoTypeDetector: { refresh() { refreshes.push(href); return 'live'; } },
        getVideoId: () => 'dQw4w9WgXcQ',
        waitForElement: (selector) => { waits.push(selector); return { cancel() {} }; }
    });
    split._getPlayer = () => null;
    split._getBelow = () => null;
    split._getChatEl = () => null;
    split._activate();
    return { refreshes, waits };
}

test('Theater Split starts mounting on a /live/<id> page', () => {
    const live = activateSplitAt('https://www.youtube.com/live/dQw4w9WgXcQ');
    assert.equal(live.refreshes.length, 1, 'it reads the video type');
    assert.deepEqual(live.waits, ['#player-container'], 'and waits for the player to mount into');

    const tab = activateSplitAt('https://www.youtube.com/@LofiGirl/live');
    assert.deepEqual(tab.refreshes, [], "a channel's live tab gets no split");
    assert.deepEqual(tab.waits, []);
});

test('ytkit.js hands Theater Split the shared watch-page check', () => {
    const start = sources.ytkit.indexOf('globalThis.YTKitFeatures?.stickyVideo?.createStickyVideoFeature?.({');
    assert.ok(start > -1);
    const bag = sources.ytkit.slice(start, sources.ytkit.indexOf('})', start));
    assert.match(bag, /\n\s*isWatchPagePath,\n/);
    assert.ok(!sources.ytkit.includes("window.location.pathname.startsWith('/watch')"),
        'no ytkit.js feature gates on the /watch prefix by hand anymore');
});
