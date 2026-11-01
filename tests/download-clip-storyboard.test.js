'use strict';

// The clip track shows the frame under the pointer, cut out of the sprite sheets
// YouTube's own seek preview uses. The specs here are copied from real pages
// (2026-10-31), signatures shortened. A video with no spec, or a sheet that won't
// load, must cost nothing: no picture, no error, and the track keeps working.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createDownloadUIFeature,
    parseStoryboardSpec,
    storyboardFrame
} = require('../extension/features/download-ui');
const { fakeNode, fakeTreeDocument } = require('./helpers/monolith');

const TEMPLATE = 'https://i.ytimg.com/sb/dQw4w9WgXcQ/storyboard3_L$L/$N.jpg?sqp=abc';
const SPEC = [
    TEMPLATE,
    '48#27#100#10#10#0#default#rs$level0',
    '80#45#108#10#10#2000#M$M#rs$level1',
    '160#90#108#5#5#2000#M$M#rs$level2',
    '320#180#108#3#3#2000#M$M#rs$level3'
].join('|');
const DURATION = 213;

test('a real spec parses into its levels', () => {
    const parsed = parseStoryboardSpec(SPEC);
    assert.equal(parsed.levels.length, 4);
    assert.deepEqual({ ...parsed.levels[2] }, {
        index: 2, width: 160, height: 90, count: 108, columns: 5, rows: 5, intervalMs: 2000, name: 'M$M', sigh: 'rs$level2'
    });
});

test('anything that is not a YouTube sprite URL is refused', () => {
    for (const spec of ['', null, undefined, 'https://evil.example/sb/x.jpg|160#90#108#5#5#2000#M$M#rs$x', 'javascript:alert(1)|160#90#1#1#1#0#a#b']) {
        assert.equal(parseStoryboardSpec(spec), null, String(spec));
    }
    assert.equal(parseStoryboardSpec(`${TEMPLATE}|160#90`), null, 'a template with no usable level is nothing');
    assert.equal(parseStoryboardSpec(`${TEMPLATE}|160#90#108#0#5#2000#M$M#x`), null, 'zero columns would divide by zero');
});

test('the frame is cut from the right sheet and cell', () => {
    const parsed = parseStoryboardSpec(SPEC);
    // 2 s per frame and 25 frames a sheet. 58 s is frame 29: sheet 1, cell 4.
    assert.deepEqual(storyboardFrame(parsed, 58, DURATION), {
        url: 'https://i.ytimg.com/sb/dQw4w9WgXcQ/storyboard3_L2/M1.jpg?sqp=abc&sigh=rs$level2',
        width: 160,
        height: 90,
        x: 640,
        y: 0
    });
    // Frame 37 is sheet 1, cell 12: third row, third column.
    const frame = storyboardFrame(parsed, 74, DURATION);
    assert.equal(frame.x, 320);
    assert.equal(frame.y, 180);
});

test('it picks the nearest frame and stays inside the sheet at both ends', () => {
    const parsed = parseStoryboardSpec(SPEC);
    assert.equal(storyboardFrame(parsed, 2.9, DURATION).x, 160, '2.9 s is nearer frame 1 than frame 2');
    assert.equal(storyboardFrame(parsed, 3.1, DURATION).x, 320, '3.1 s is nearer frame 2');
    assert.equal(storyboardFrame(parsed, 0, DURATION).x, 0);
    assert.match(storyboardFrame(parsed, 99999, DURATION).url, /M4\.jpg/, 'past the end stays on the last frame (107, sheet 4)');
});

test('a level with no interval spreads across the video', () => {
    const parsed = parseStoryboardSpec(`${TEMPLATE}|48#27#100#10#10#0#default#rs$only`);
    const last = storyboardFrame(parsed, DURATION, DURATION);
    assert.equal(last.x, 432);
    assert.equal(last.y, 243);
    assert.match(last.url, /storyboard3_L0\/default\.jpg/);
});

test('a level keeps its place in the URL when one before it is unreadable', () => {
    const parsed = parseStoryboardSpec(`${TEMPLATE}|bad|160#90#108#5#5#2000#M$M#rs$x`);
    assert.match(storyboardFrame(parsed, 0, DURATION).url, /storyboard3_L1\/M0\.jpg/);
});

test('a level with an interval counts by time, not by share of the video', () => {
    const parsed = parseStoryboardSpec(SPEC);
    // The spec can stop short of a long video's end. 58 s is still frame 29.
    assert.equal(storyboardFrame(parsed, 58, 1000).x, 640);
    assert.match(storyboardFrame(parsed, 58, 1000).url, /M1\.jpg/);
});

test('a time before the start stays on the first frame', () => {
    const frame = storyboardFrame(parseStoryboardSpec(SPEC), -5, DURATION);
    assert.equal(frame.x, 0);
    assert.equal(frame.y, 0);
    assert.match(frame.url, /M0\.jpg/);
});

test('only levels larger than the preview still give a picture', () => {
    const parsed = parseStoryboardSpec(`${TEMPLATE}|320#180#108#3#3#2000#M$M#a|640#360#108#3#3#2000#M$M#b`);
    assert.equal(storyboardFrame(parsed, 0, DURATION).width, 320, 'the smallest one');
});

/** Open the popup with a spec, keeping every image it asks for. */
function openPopup({ spec = SPEC, reply = null, responseVideoId = 'dQw4w9WgXcQ' } = {}) {
    const documentRef = fakeTreeDocument(() => null);
    const createElement = documentRef.createElement.bind(documentRef);
    const trackRect = { left: 0, width: 400, top: 0, bottom: 26, right: 400, height: 26 };
    const images = [];
    documentRef.createElement = (tag) => {
        const node = createElement(tag);
        node.getBoundingClientRect = () => trackRect;
        node.replaceChildren = () => { node.children.length = 0; };
        node.scrollIntoView = () => {};
        node.focus = () => {};
        node.setPointerCapture = () => {};
        if (tag === 'img') images.push(node);
        return node;
    };
    documentRef.getElementById = () => null;
    const removed = [];
    documentRef.documentElement = {
        getAttribute: (name) => (name === 'data-ytkit-storyboard' ? reply : null),
        removeAttribute: (name) => removed.push(name)
    };
    globalThis.document = documentRef;
    globalThis.window = {
        location: { href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
        innerWidth: 1280,
        innerHeight: 900,
        addEventListener() {}, removeEventListener() {},
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
    };
    globalThis.CSS = { supports: () => true };
    globalThis.Event = class FakeEvent {
        constructor(type, init = {}) { this.type = type; this.bubbles = Boolean(init.bubbles); }
    };
    const published = [];
    const cleared = [];
    const feature = createDownloadUIFeature({
        getVideoId: () => 'dQw4w9WgXcQ',
        isWatchPagePath: () => true,
        supportsPopover: () => false,
        getPlayerResponseGlobal: () => ({
            videoDetails: { videoId: responseVideoId, lengthSeconds: String(DURATION) },
            ...(spec ? { storyboards: { playerStoryboardSpecRenderer: { spec } } } : {})
        }),
        getMainVideoElement: () => ({ duration: DURATION, currentTime: 0, addEventListener() {}, removeEventListener() {} }),
        publishBridgeAttribute: (name, value) => published.push([name, value]),
        clearBridgeAttribute: (name) => cleared.push(name),
        setTimeoutFn: () => 0,
        clearTimeoutFn: () => {},
        setIntervalFn: () => 0,
        clearIntervalFn: () => {},
        t: (_key, fallback) => fallback,
    });
    feature.downloadFormatEstimates.probe = async () => ({ status: 'error', error: 'stubbed' });
    const anchor = fakeNode({ tag: 'button', attributes: { class: 'ytkit-po-dl' } });
    anchor.getBoundingClientRect = () => ({ top: 400, bottom: 424, left: 600, width: 40 });
    anchor.focus = () => {};
    feature.showDownloadPopup(anchor);
    const popup = documentRef.body.children[documentRef.body.children.length - 1];
    const all = [];
    (function walk(node) { all.push(node); for (const child of node.children || []) walk(child); })(popup);
    const track = all.find((node) => String(node.className).split(/\s+/).includes('ytkit-dl-popup__clip-track'));
    return {
        track,
        images,
        published,
        cleared,
        removed,
        closeButton: all.find((node) => String(node.className).split(/\s+/).includes('ytkit-dl-popup__close')),
        trackRect,
        handle: (which) => track.children.find((node) => node.dataset?.handle === which),
        preview: () => track.children.find((node) => String(node.className).includes('clip-preview')) || null
    };
}

const fire = (node, type, event) => {
    for (const callback of node.listeners?.get(type) || []) callback(event);
};
const hover = (view, fraction) => fire(view.track, 'pointermove', { clientX: view.trackRect.width * fraction });

function loaded(image, naturalWidth = 800) {
    image.naturalWidth = naturalWidth;
    image.onload();
}

test('hovering shows the frame once its sheet has loaded', () => {
    const view = openPopup();
    hover(view, 0.5);
    assert.equal(view.images.length, 1, 'one sheet asked for');
    assert.match(view.images[0].src, /storyboard3_L2\/M2\.jpg\?sqp=abc&sigh=rs\$level2$/);
    assert.ok(!view.preview(), 'no picture until there is one to show');

    loaded(view.images[0]);
    const preview = view.preview();
    assert.equal(preview.hidden, false);
    assert.equal(preview.style.width, '160px');
    assert.equal(preview.style.height, '90px');
    assert.match(preview.style.backgroundImage, /M2\.jpg/);
    assert.equal(preview.dataset.time, '1:46.5');
    assert.equal(preview.style.left, '120px', 'centered on the pointer');
});

test('the preview stays over the track at both ends', () => {
    const view = openPopup();
    hover(view, 0);
    loaded(view.images[0]);
    assert.equal(view.preview().style.left, '0px');
    hover(view, 1);
    loaded(view.images[1]);
    assert.equal(view.preview().style.left, '240px');
});

test('a sheet is only asked for once', () => {
    const view = openPopup();
    hover(view, 0.01);
    hover(view, 0.02);
    hover(view, 0.03);
    assert.equal(view.images.length, 1);
    loaded(view.images[0]);
    hover(view, 0.04);
    assert.equal(view.images.length, 1);
});

test('leaving the track hides it, and a sheet landing afterwards stays hidden', () => {
    const view = openPopup();
    hover(view, 0.01);
    loaded(view.images[0]);
    assert.equal(view.preview().hidden, false);
    fire(view.track, 'pointerleave', {});
    assert.equal(view.preview().hidden, true);

    hover(view, 0.9);
    fire(view.track, 'pointerleave', {});
    loaded(view.images[1]);
    assert.equal(view.preview().hidden, true, 'the pointer has gone');
});

test('dragging a handle shows where the handle is and survives leaving the track', () => {
    const view = openPopup();
    const handle = view.handle('end');
    fire(handle, 'pointerdown', { pointerId: 1, preventDefault() {} });
    fire(handle, 'pointermove', { clientX: view.trackRect.width * 0.5 });
    hover(view, 0.5);
    loaded(view.images[0]);
    assert.equal(view.preview().dataset.time, '1:46.5');

    fire(view.track, 'pointerleave', {});
    assert.equal(view.preview().hidden, false, 'a drag holds the pointer even off the track');
    fire(handle, 'pointerup', {});
    fire(view.track, 'pointerleave', {});
    assert.equal(view.preview().hidden, true);
});

test('dragging shows the handle, not the pointer, when the other handle stops it', () => {
    const view = openPopup();
    const start = view.handle('start');
    fire(start, 'pointerdown', { pointerId: 1, preventDefault() {} });
    fire(start, 'pointermove', { clientX: view.trackRect.width * 0.25 });
    fire(start, 'pointerup', {});
    const end = view.handle('end');
    fire(end, 'pointerdown', { pointerId: 1, preventDefault() {} });
    // Pulling the end handle past the start pins it just after the start.
    fire(end, 'pointermove', { clientX: 0 });
    hover(view, 0);
    loaded(view.images[0]);
    assert.equal(view.preview().dataset.time.startsWith('0:53'), true, view.preview().dataset.time);
});

test('no spec means no picture, no request for one and a working track', () => {
    const view = openPopup({ spec: null });
    hover(view, 0.5);
    fire(view.track, 'pointerleave', {});
    assert.equal(view.images.length, 0);
    assert.ok(!view.preview(), 'no picture');
    assert.ok(view.handle('start') && view.handle('end'));
});

test('a sheet that fails keeps the track working and stops after a few', () => {
    const view = openPopup();
    for (const [index, fraction] of [0.01, 0.3, 0.6].entries()) {
        hover(view, fraction);
        assert.doesNotThrow(() => view.images[index].onerror());
    }
    assert.equal(view.images.length, 3);
    hover(view, 0.9);
    assert.equal(view.images.length, 3, 'three failures is enough to stop asking');
    assert.ok(!view.preview(), 'no picture');
});

test('the small gray placeholder YouTube answers with does not count as a sheet', () => {
    const view = openPopup();
    hover(view, 0.01);
    loaded(view.images[0], 120);
    assert.ok(!view.preview(), 'no picture');
});

test('the popup asks the player, and its answer beats a stale inline response', () => {
    const view = openPopup({
        spec: null,
        responseVideoId: 'firstVideoId',
        reply: JSON.stringify({ id: 'dQw4w9WgXcQ', spec: SPEC })
    });
    assert.equal(view.published.length, 1);
    assert.equal(view.published[0][0], 'data-ytkit-storyboard-want');
    assert.match(view.published[0][1], /^dQw4w9WgXcQ:\d+$/);
    hover(view, 0.5);
    assert.equal(view.images.length, 1);
});

test('frames from another video are never shown', () => {
    const stale = openPopup({ responseVideoId: 'firstVideoId' });
    hover(stale, 0.5);
    assert.equal(stale.images.length, 0, 'an inline response for another video');

    const otherReply = openPopup({ spec: null, reply: JSON.stringify({ id: 'firstVideoId', spec: SPEC }) });
    hover(otherReply, 0.5);
    assert.equal(otherReply.images.length, 0, 'an answer about another video');

    const garbled = openPopup({ reply: '{not json' });
    hover(garbled, 0.5);
    assert.equal(garbled.images.length, 1, 'a garbled answer falls back to the inline response');
});

test('closing the popup leaves nothing on the page', () => {
    const view = openPopup();
    // Opening closes whatever was open first, so only count from here.
    view.cleared.length = 0;
    view.removed.length = 0;
    fire(view.closeButton, 'click', {});
    assert.deepEqual([...view.cleared], ['data-ytkit-storyboard-want']);
    assert.deepEqual([...view.removed], ['data-ytkit-storyboard']);
});
