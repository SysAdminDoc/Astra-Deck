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
        ? '[data-target-id="PAmodern_transcript_view"]'
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
    const context = { console, document, globalThis: null };
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
