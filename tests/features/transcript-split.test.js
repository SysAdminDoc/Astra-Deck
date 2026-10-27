'use strict';

// The transcript panel mounts in #secondary, and Theater Split hides #secondary
// while it shows #below as its side column. With the split open (the default)
// an enabled Transcript Sidebar sat at a 0x0 rect. These drive the real viewer
// and the real split positioning together against a fake DOM.

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadFeature, fakeTreeDocument } = require('../helpers/monolith');

const MODULE_PATH = '../../extension/features/sticky-video/index.js';
const VIDEO_ID = 'abc12345678';

function loadSplit(deps) {
    const originalFeatures = globalThis.YTKitFeatures;
    delete require.cache[require.resolve(MODULE_PATH)];
    globalThis.YTKitFeatures = {};
    const mod = require(MODULE_PATH);
    globalThis.YTKitFeatures = originalFeatures;
    return mod.createStickyVideoFeature(deps);
}

function buildPage() {
    const document = fakeTreeDocument();
    const flexy = document.createElement('ytd-watch-flexy');
    flexy.__data = {
        playerResponse: {
            videoDetails: { videoId: VIDEO_ID },
            captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ languageCode: 'en', baseUrl: 'https://example.invalid/t' }] } }
        }
    };
    // The live page's #below: a shelf, then anonymous wrappers around the title
    // block and the comments.
    const below = document.createElement('div');
    below.id = 'below';
    const shelf = document.createElement('div');
    shelf.id = 'shopping-timely-shelf';
    const metadata = document.createElement('div');
    metadata.appendChild(document.createElement('ytd-watch-metadata'));
    const comments = document.createElement('div');
    comments.appendChild(document.createElement('ytd-comments'));
    below.append(shelf, metadata, comments);
    const secondary = document.createElement('div');
    secondary.id = 'secondary';
    const related = document.createElement('div');
    related.id = 'related';
    secondary.appendChild(related);
    flexy.append(below, secondary);
    document.body.appendChild(flexy);

    const viewer = loadFeature('transcriptViewer', {
        document,
        window: {},
        location: { href: `https://www.youtube.com/watch?v=${VIDEO_ID}` },
        getVideoId: () => VIDEO_ID,
        clearCustomHighlight() {},
        setCustomHighlight: () => false,
        addNavigateRule() {},
        removeNavigateRule() {},
        fetchTranscriptWithFallback: () => new Promise(() => {})
    });
    const split = loadSplit({ getFeatureById: (id) => (id === 'transcriptViewer' ? viewer : null) });
    split._positionedEls = [];
    return { document, viewer, split, below, metadata, comments, secondary, related };
}

test('Theater Split shows the transcript panel in its side column and gives it back on close', () => {
    const { viewer, split, below, metadata, comments, secondary, related } = buildPage();
    viewer._create();
    const panel = viewer._panel;
    assert.ok(panel, 'the panel builds');
    assert.ok(secondary.children[0] === panel, 'with the split closed it opens at the top of the sidebar');

    split._positionOverRight(below, 32, '0', '100vh');
    assert.ok(panel.parentElement === below, 'opening the split moves it into the side column');
    assert.ok(below.children[2] === panel, 'it sits right under the video title');
    assert.ok(below.children[3] === comments, 'and above the comments');
    assert.ok(!secondary.children.includes(panel), 'the hidden sidebar no longer holds it');

    split._positionOverRight(below, 40, '0', '100vh');
    assert.ok(below.children[1] === metadata && below.children[2] === panel,
        'a re-layout (divider drag, resize) keeps it in place');
    assert.equal(below.children.length, 4);

    split._unpositionAll();
    assert.ok(secondary.children[0] === panel, 'closing the split puts it back at the top of the sidebar');
    assert.ok(secondary.children[1] === related);
    assert.ok(!below.children.includes(panel));
});

test('a transcript panel built while Theater Split is open mounts in the side column', () => {
    const { viewer, split, below, metadata, secondary } = buildPage();
    split._positionOverRight(below, 32, '0', '100vh');
    viewer._create();
    const panel = viewer._panel;
    assert.ok(below.children[1] === metadata && below.children[2] === panel,
        'the navigation-time rebuild lands under the title, not in the hidden sidebar');
    assert.ok(!secondary.children.includes(panel));

    split._unpositionAll();
    assert.ok(secondary.children[0] === panel, 'and closing the split still gives it back');
});

test('moving the transcript panel keeps keyboard focus and the transcript scroll', () => {
    const { document, viewer, split, below, secondary } = buildPage();
    viewer._create();
    const panel = viewer._panel;
    const body = panel.querySelector('.ytkit-transcript-body');
    const collapse = panel.querySelector('.ytkit-transcript-toggle');
    panel.contains = (node) => {
        for (let current = node; current; current = current.parentElement) if (current === panel) return true;
        return false;
    };
    // A real DOM blurs a moved subtree and resets its scroll. The fake does
    // neither, so both hosts act it out for the panel.
    for (const host of [below, secondary]) {
        const insert = host.insertBefore.bind(host);
        host.insertBefore = (child, reference) => {
            if (child === panel) { document.activeElement = null; body.scrollTop = 0; }
            return insert(child, reference);
        };
    }
    collapse.focus();
    body.scrollTop = 120;

    split._positionOverRight(below, 32, '0', '100vh');
    assert.ok(panel.parentElement === below);
    assert.ok(document.activeElement === collapse, 'opening the split keeps focus on the panel control');
    assert.equal(body.scrollTop, 120, 'and keeps the reading position');

    split._unpositionAll();
    assert.ok(secondary.children[0] === panel);
    assert.ok(document.activeElement === collapse, 'closing the split keeps focus too');
    assert.equal(body.scrollTop, 120);

    document.activeElement = null;
    viewer._placePanel();
    assert.ok(secondary.children[0] === panel, 'a closed split leaves a panel already in place alone');
    assert.ok(!document.activeElement, 'and does not pull focus to it');
});
