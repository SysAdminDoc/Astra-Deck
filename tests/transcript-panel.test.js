'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
    parseDomElements,
    selectorMatchCount,
} = require('../scripts/build-selector-fixtures.js');

const ROOT = path.join(__dirname, '..');
const SERVICE_SOURCE = fs.readFileSync(path.join(ROOT, 'extension/core/transcript-service.js'), 'utf8');

function loadVariant(name) {
    const html = fs.readFileSync(path.join(__dirname, 'fixtures', `transcript-panel-${name}.html`), 'utf8');
    return { html, elements: parseDomElements(html) };
}

function loadServiceForVariant(name) {
    const variant = loadVariant(name);
    const panelSelector = name === 'modern'
        ? 'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"]'
        : 'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]';
    const transcriptRenderer = {
        data: {
            content: {
                transcriptSearchPanelRenderer: {
                    footer: {
                        transcriptFooterRenderer: {
                            languageMenu: {
                                sortFilterSubMenuRenderer: {
                                    subMenuItems: [{
                                        baseUrl: 'https://www.youtube.com/api/timedtext?v=abcdefghijk&lang=en',
                                        languageCode: 'en',
                                        title: 'English',
                                    }],
                                },
                            },
                        },
                    },
                },
            },
        },
        matches: () => false,
    };
    const panel = {
        isConnected: true,
        hidden: false,
        getClientRects: () => [{}],
        matches: () => false,
        querySelector: (selector) => selector === 'ytd-transcript-renderer' ? transcriptRenderer : null,
        querySelectorAll: () => [],
    };
    const document = {
        querySelector(selector) {
            if (selector === panelSelector && selectorMatchCount(variant.elements, selector) > 0) return panel;
            if (selector === 'h1.ytd-watch-metadata yt-formatted-string') return { textContent: 'Fixture video' };
            return null;
        },
    };
    const context = {
        console,
        document,
        setTimeout: (fn) => { setImmediate(fn); return 1; },
        globalThis: null,
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(SERVICE_SOURCE, context, { filename: 'core/transcript-service.js' });
    return { core: context.YTKitCore, document, panel, transcriptRenderer };
}

for (const variant of ['classic', 'modern']) {
    test(`transcript service resolves and scrapes the ${variant} panel fixture`, async () => {
        const { core, document } = loadServiceForVariant(variant);
        const panel = core.getTranscriptPanelElement(document, { required: true });
        assert.ok(panel, `${variant} transcript panel must resolve`);

        const service = core.createTranscriptService();
        const result = await service._method5_DOMPanelScrape('abcdefghijk');
        assert.equal(result.videoTitle, 'Fixture video');
        assert.deepEqual(JSON.parse(JSON.stringify(result.tracks)), [{
            baseUrl: 'https://www.youtube.com/api/timedtext?v=abcdefghijk&lang=en',
            languageCode: 'en',
            name: 'English',
            kind: 'manual',
        }]);
    });
}

test('required transcript panel resolution fails loudly when both rollout selectors drift', () => {
    const context = {
        console,
        document: { querySelector: () => null },
        globalThis: null,
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(SERVICE_SOURCE, context, { filename: 'core/transcript-service.js' });
    assert.throws(
        () => context.YTKitCore.getTranscriptPanelElement(context.document, { required: true }),
        /Required selector surface "transcriptPanel" was not found/
    );
});

test('active panel resolution skips a hidden stale rollout panel', () => {
    const { core } = loadServiceForVariant('classic');
    const hidden = {
        isConnected: true,
        hidden: true,
        getClientRects: () => [],
        getAttribute: () => null,
    };
    const visible = {
        isConnected: true,
        hidden: false,
        getClientRects: () => [{}],
        getAttribute: () => null,
    };
    const root = {
        querySelector: () => hidden,
        querySelectorAll: (selector) => selector.includes('engagement-panel-searchable-transcript')
            ? [hidden, visible]
            : [],
    };

    assert.equal(core.getTranscriptPanelElement(root, {
        videoId: 'abcdefghijk',
        isForVideo: (_videoId, panel) => panel === visible,
    }), visible);
});

test('DOM panel tracks and rendered cues are rejected when they cannot be bound to the video', async () => {
    const { core, panel, transcriptRenderer } = loadServiceForVariant('classic');
    transcriptRenderer.data.content.transcriptSearchPanelRenderer.footer
        .transcriptFooterRenderer.languageMenu.sortFilterSubMenuRenderer.subMenuItems[0]
        .baseUrl = 'https://www.youtube.com/api/timedtext?v=zzzzzzzzzzz&lang=en';

    const wrongTrackService = core.createTranscriptService({
        isDomTranscriptForVideo: (_videoId, candidate) => candidate === panel,
    });
    await assert.rejects(
        () => wrongTrackService._method5_DOMPanelScrape('abcdefghijk'),
        /no fetchable caption URLs/
    );

    const stalePanelService = core.createTranscriptService({
        getVideoId: () => 'abcdefghijk',
        isDomTranscriptForVideo: () => false,
    });
    stalePanelService._getCaptionTracks = async () => { throw new Error('network unavailable'); };
    await assert.rejects(
        () => stalePanelService.fetchTranscript('abcdefghijk'),
        /network unavailable/
    );
});

test('rendered-panel fallback reports unknown language and current-video provenance', async () => {
    const { core, panel } = loadServiceForVariant('classic');
    const row = {
        querySelector: () => ({ textContent: '1:23' }),
    };
    panel.querySelectorAll = () => [{
        textContent: 'Rendered caption',
        closest: () => row,
    }];
    const service = core.createTranscriptService({
        getVideoId: () => 'abcdefghijk',
        isDomTranscriptForVideo: (_videoId, candidate) => candidate === panel,
        nowFn: () => 1234,
    });
    service._getCaptionTracks = async () => { throw new Error('network unavailable'); };

    const result = await service.fetchTranscript('abcdefghijk');
    assert.equal(result.status, 'ready');
    assert.equal(result.language, '');
    assert.equal(result.provenance.source, 'dom-panel');
    assert.equal(result.provenance.fallbackReason, 'discovery-failed');
    assert.deepEqual(JSON.parse(JSON.stringify(result.segments)), [{
        startMs: 83000,
        endMs: 83000,
        text: 'Rendered caption',
    }]);
});

// The page as measured 2026-11-01: every rollout's panel sits in the DOM from the
// start with no box, "Show transcript" opens it, rows follow, and its own Close
// puts it away with the rows still inside.
const VIDEO = 'abcdefghijk';

function fakeWatchPage({ startsOpen = false, rowsAfterPolls = 0, rows = true, hasButton = true, onPoll } = {}) {
    const state = { open: startsOpen, opens: 0, closes: 0, polls: 0, videoId: VIDEO };
    const row = {
        querySelector: (selector) => selector.includes('transcript-segment-view-model > [aria-hidden="true"]')
            ? { textContent: ' 0:18 ' }
            : null,
    };
    const cue = {
        textContent: "  We're no\n strangers  ",
        closest: (selector) => selector.includes('transcript-segment-view-model') ? row : null,
    };
    const closeButton = { click() { state.closes += 1; state.open = false; } };
    const hiddenPanel = {
        id: 'classic',
        isConnected: true,
        hidden: false,
        getAttribute: () => null,
        getClientRects: () => [],
        querySelector: () => null,
        querySelectorAll: () => [],
    };
    const panel = {
        id: 'modern',
        isConnected: true,
        hidden: false,
        getAttribute: () => null,
        getClientRects: () => (state.open ? [{}] : []),
        querySelector: (selector) => (selector === '#visibility-button button' ? closeButton : null),
        querySelectorAll: (selector) => (rows && state.polls >= rowsAfterPolls
            && selector.includes('transcript-segment-view-model [role="text"]') ? [cue] : []),
    };
    // Only there once the panel has opened, on screen, and with no Close button.
    const innerList = {
        id: 'inner-list',
        isConnected: true,
        hidden: false,
        getAttribute: () => null,
        getClientRects: () => [{}],
        querySelector: () => null,
        querySelectorAll: () => [],
    };
    const button = { click() { state.opens += 1; state.open = true; } };
    const document = {
        querySelector: (selector) => (hasButton
            && selector === 'ytd-video-description-transcript-section-renderer button' ? button : null),
        querySelectorAll: (selector) => {
            if (selector.includes('engagement-panel-searchable-transcript')) return [hiddenPanel];
            if (selector.startsWith('[data-target-id=')) return state.open ? [innerList] : [];
            if (selector.includes('PAmodern_transcript_view')) return [panel];
            return [];
        },
    };
    const context = {
        console,
        document,
        setTimeout: (fn) => {
            state.polls += 1;
            onPoll?.(state);
            setImmediate(fn);
            return state.polls;
        },
        globalThis: null,
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(SERVICE_SOURCE, context, { filename: 'core/transcript-service.js' });
    const service = context.YTKitCore.createTranscriptService({
        getVideoId: () => state.videoId,
        isDomTranscriptForVideo: (_videoId, candidate) => candidate === panel,
    });
    service._getCaptionTracks = async () => { throw new Error('network unavailable'); };
    return { core: context.YTKitCore, document, panel, service, state };
}

test('the panel lookup for an open panel skips the ones only sitting hidden in the page', () => {
    const closed = fakeWatchPage();
    assert.equal(closed.core.getTranscriptPanelElement(closed.document)?.id, 'classic',
        'found is not the same as open');
    assert.ok(!closed.core.getTranscriptPanelElement(closed.document, { open: true }));

    const open = fakeWatchPage({ startsOpen: true });
    assert.equal(open.core.getTranscriptPanelElement(open.document, { open: true })?.id, 'modern');
});

test('the selectors for the newer panel match its measured markup', () => {
    const { elements } = loadVariant('modern');
    assert.equal(selectorMatchCount(elements, 'transcript-segment-view-model [role="text"]'), 2);
    assert.equal(selectorMatchCount(elements, 'transcript-segment-view-model > [aria-hidden="true"]'), 2);
    assert.equal(selectorMatchCount(elements, '#visibility-button button'), 1);
    // The list inside the open panel answers to the older selector too, and the
    // lookup has to prefer the panel around it or there's no Close button to press.
    assert.equal(selectorMatchCount(elements, '[data-target-id="PAmodern_transcript_view"]'), 1);
});

test('the newer rows read as cues at their shown time', () => {
    const { service } = fakeWatchPage({ startsOpen: true });
    assert.deepEqual(JSON.parse(JSON.stringify(service._scrapeRenderedTranscript(VIDEO))), [{
        startMs: 18000,
        endMs: 18000,
        text: "We're no strangers",
    }]);
});

test('with every route down the panel is opened, read and put away', async () => {
    const { service, state } = fakeWatchPage({ rowsAfterPolls: 3 });
    const result = await service.fetchTranscript(VIDEO);
    assert.equal(result.status, 'ready');
    assert.equal(result.segments[0].text, "We're no strangers");
    assert.equal(result.provenance.source, 'dom-panel');
    assert.equal(result.provenance.fallbackReason, 'discovery-failed');
    assert.equal(state.opens, 1);
    assert.equal(state.polls, 3);
    assert.equal(state.closes, 1);
    assert.equal(state.open, false);
});

test('a panel the viewer already has open is read and left open', async () => {
    const { service, state } = fakeWatchPage({ startsOpen: true, rowsAfterPolls: 2 });
    const result = await service.fetchTranscript(VIDEO);
    assert.equal(result.status, 'ready');
    assert.equal(state.opens, 0);
    assert.equal(state.closes, 0);
    assert.equal(state.open, true);
});

test('a panel already showing its rows is read straight away', async () => {
    const { service, state } = fakeWatchPage({ startsOpen: true });
    const result = await service.fetchTranscript(VIDEO);
    assert.equal(result.status, 'ready');
    assert.equal(state.polls, 0);
    assert.equal(state.opens, 0);
    assert.equal(state.closes, 0);
});

test('no transcript button and nothing open gives up without waiting', async () => {
    const { service, state } = fakeWatchPage({ hasButton: false });
    await assert.rejects(() => service.fetchTranscript(VIDEO), /network unavailable/);
    assert.equal(state.polls, 0);
    assert.equal(state.opens, 0);
    assert.equal(state.closes, 0);
});

test('a panel that never fills is given a limit, closed and the first error stands', async () => {
    const { service, state } = fakeWatchPage({ rows: false });
    await assert.rejects(() => service.fetchTranscript(VIDEO), /network unavailable/);
    assert.equal(state.opens, 1);
    assert.equal(state.polls, 32);
    assert.equal(state.closes, 1);
    assert.equal(state.open, false);
});

test('moving to another video during the wait stops it and puts the panel away', async () => {
    const { service, state } = fakeWatchPage({
        rows: false,
        onPoll: (s) => { if (s.polls === 2) s.videoId = 'zzzzzzzzzzz'; },
    });
    await assert.rejects(() => service.fetchTranscript(VIDEO), (error) => error.name === 'AbortError');
    assert.equal(state.polls, 2);
    assert.equal(state.closes, 1);
});

test('a panel closed by someone else during the wait is opened again, once', async () => {
    const { service, state } = fakeWatchPage({
        startsOpen: true,
        rowsAfterPolls: 4,
        onPoll: (s) => { if (s.polls === 2) s.open = false; },
    });
    const result = await service.fetchTranscript(VIDEO);
    assert.equal(result.status, 'ready');
    assert.equal(state.opens, 1);
    assert.equal(state.closes, 1);
});

test('a request that rules out the rendered panel never opens it', async () => {
    for (const options of [{ allowDomFallback: false }, { strictTrack: true }, { allowOffPage: true }]) {
        const { service, state } = fakeWatchPage();
        await assert.rejects(() => service.fetchTranscript(VIDEO, options), /network unavailable/);
        assert.equal(state.opens, 0, JSON.stringify(options));
        assert.equal(state.polls, 0, JSON.stringify(options));
    }
});
