'use strict';

// Theater Split's header surfaces (title bar, live header, action dock), split
// out of features/sticky-video into their own part module. The part is driven
// on its own here, with its four injected dependencies, so each test also
// proves the dependency it names is the one the method reads.

const test = require('node:test');
const assert = require('node:assert/strict');

const PART_PATH = '../../extension/features/sticky-video-header/index.js';

function loadPart() {
    const originalFeatures = globalThis.YTKitFeatures;
    delete require.cache[require.resolve(PART_PATH)];
    globalThis.YTKitFeatures = {};
    const mod = require(PART_PATH);
    const registered = globalThis.YTKitFeatures.stickyVideoHeader;
    globalThis.YTKitFeatures = originalFeatures;
    return { mod, registered };
}

function header(deps = {}, state = {}) {
    const { mod } = loadPart();
    const methods = mod.createStickyVideoHeaderMethods({
        t: (_key, fallback) => fallback,
        _rw: {},
        getVideoId: () => '',
        getFeatureById: () => null,
        ...deps
    });
    // Per-test overrides go last: tests swap single methods, as callers do.
    return Object.assign({ _isActive: true, _isSplit: true, _getBelow: () => null }, methods, state);
}

function withDocument(doc, run) {
    const saved = globalThis.document;
    globalThis.document = {
        title: '',
        querySelector: () => null,
        getElementById: () => null,
        ...doc
    };
    try {
        return run();
    } finally {
        if (saved === undefined) delete globalThis.document;
        else globalThis.document = saved;
    }
}

function playerResponse(videoId, extra = {}) {
    return {
        videoDetails: { videoId, ...extra.videoDetails },
        microformat: { playerMicroformatRenderer: { ...extra.microformat } }
    };
}

test('the header part loads on its own and hands out fresh methods', () => {
    const { mod, registered } = loadPart();
    assert.equal(registered, mod);
    assert.ok(Object.isFrozen(mod));
    const methods = mod.createStickyVideoHeaderMethods({});
    for (const name of ['_ensureSplitHeaderBar', '_ensureSplitLiveHeader', '_dockSplitHeader',
        '_startSplitActionDock', '_restoreSplitActionDock', '_getSplitPublishDate']) {
        assert.equal(typeof methods[name], 'function', `${name} must be part of the header`);
    }
    assert.notEqual(mod.createStickyVideoHeaderMethods({})._dockSplitHeader, methods._dockSplitHeader);
});

// YouTube keeps the previous video's player response around after a SPA
// navigation. A date or view count read from it would label the new video with
// the old one's numbers, so both readers check the response's video id.
test('upload date and view count come from the current video, never a stale response', () => {
    const meta = { getAttribute: (name) => (name === 'content' ? '2025-05-06' : null) };
    withDocument({ querySelector: (selector) => (selector.includes('datePublished') ? meta : null) }, () => {
        const current = header({
            getVideoId: () => 'current',
            _rw: { ytInitialPlayerResponse: playerResponse('current', {
                microformat: { publishDate: '2026-01-02' }, videoDetails: { viewCount: '1234567' }
            }) }
        });
        assert.equal(current._getSplitPublishDate().toISOString().slice(0, 10), '2026-01-02');
        assert.equal(current._getSplitViewCountText(), `${new Intl.NumberFormat().format(1234567)} views`);

        const stale = header({
            getVideoId: () => 'current',
            _rw: { ytInitialPlayerResponse: playerResponse('previous', {
                microformat: { publishDate: '2020-01-01' }, videoDetails: { viewCount: '99' }
            }) }
        }, { _getSplitFallbackViewCountText: () => 'from the page' });
        assert.equal(stale._getSplitPublishDate().toISOString().slice(0, 10), '2025-05-06',
            'a response for another video falls through to the page meta tag');
        assert.equal(stale._getSplitViewCountText(), 'from the page');
    });
});

test('with no title anywhere, the header falls back to localized copy', () => {
    withDocument({ title: ' - YouTube' }, () => {
        const split = header({
            t: (key, fallback) => (key === 'stickyVideoLiveVideoFallback' ? 'Vidéo en direct' : fallback),
            _rw: { ytInitialPlayerResponse: playerResponse('v') }
        });
        assert.equal(split._getSplitVideoTitleText(), 'Vidéo en direct');
    });
    withDocument({ title: 'A real title - YouTube' }, () => {
        assert.equal(header()._getSplitVideoTitleText(), 'A real title');
    });
});

test('docking the header fills in the metadata and moves the Quick Links launcher into it', () => {
    const node = () => ({ hidden: undefined, textContent: '', attributes: new Map(),
        setAttribute(name, value) { this.attributes.set(name, value); },
        removeAttribute(name) { this.attributes.delete(name); } });
    const metaEl = node();
    const dateEl = node();
    const viewEl = node();
    const appended = [];
    const actions = { hidden: undefined, appendChild: (child) => { appended.push(child); child.parentElement = actions; } };
    const bar = {
        querySelector: (selector) => ({
            '.ytkit-split-upload-meta': metaEl,
            '.ytkit-split-upload-date': dateEl,
            '.ytkit-split-view-count': viewEl,
            '.ytkit-split-header-actions': actions
        })[selector] || null
    };
    const originalParent = { id: 'masthead' };
    const logoWrap = { dataset: {}, parentElement: originalParent, parentNode: originalParent, nextSibling: null };
    const synced = [];
    withDocument({ getElementById: (id) => (id === 'ytkit-po-logo-wrap' ? logoWrap : null) }, () => {
        const split = header({
            getFeatureById: (id) => (id === 'quickLinkMenu' ? { _syncLauncherChrome: (el) => synced.push(el) } : null)
        }, {
            _ensureSplitHeaderBar: () => bar,
            _getSplitUploadDateText: () => 'Jan 2, 2026',
            _getSplitViewCountText: () => '12 views'
        });
        split._dockSplitHeader();

        assert.equal(dateEl.textContent, 'Jan 2, 2026');
        assert.equal(viewEl.textContent, '12 views');
        assert.equal(metaEl.attributes.get('aria-label'), 'Jan 2, 2026 | 12 views');
        assert.deepEqual(appended, [logoWrap], 'the launcher moves into the header actions');
        assert.equal(logoWrap.dataset.ytkitSplitHeaderDocked, '1');
        assert.deepEqual(split._splitHeaderMovedLogo, { parent: originalParent, next: null },
            'and remembers where it came from so restore can put it back');
        assert.deepEqual(synced, [logoWrap], 'Quick Links is told its launcher moved');
        assert.equal(actions.hidden, false);

        split._isSplit = false;
        appended.length = 0;
        split._dockSplitHeader();
        assert.deepEqual(appended, [], 'nothing docks while the split is closed');
    });
});
