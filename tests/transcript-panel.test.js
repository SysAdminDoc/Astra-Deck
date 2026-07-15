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
        matches: () => false,
        querySelector: (selector) => selector === 'ytd-transcript-renderer' ? transcriptRenderer : null,
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
    return { core: context.YTKitCore, document };
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
