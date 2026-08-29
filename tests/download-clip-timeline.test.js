'use strict';

// The download popup could already fetch a portion of a video, but only if you
// typed two timestamps into it — so you had to know the numbers before you
// started. The handles are the feature; the text inputs are the precise
// fallback and the only thing the send path reads, which is what keeps the
// existing validation the single gate.
//
// What has to hold:
//
//   * dragging or keying a handle writes the inputs,
//   * editing an input moves the handles,
//   * the handles cannot cross,
//   * and with no duration there is no track and the inputs still work.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDownloadUIFeature } = require('../extension/features/download-ui');
const { fakeNode, fakeTreeDocument } = require('./helpers/monolith');

const DURATION = 600;

/** Open the download popup with a player response that declares a duration. */
function openPopup({ lengthSeconds = DURATION, currentTime = null, mediaDuration = null } = {}) {
    const documentRef = fakeTreeDocument(() => null);
    const createElement = documentRef.createElement.bind(documentRef);
    const trackRect = { left: 0, width: 300, top: 0, bottom: 26, right: 300, height: 26 };
    documentRef.createElement = (tag) => {
        const node = createElement(tag);
        node.getBoundingClientRect = () => trackRect;
        node.replaceChildren = () => { node.children.length = 0; };
        node.scrollIntoView = () => {};
        node.focus = () => {};
        node.setPointerCapture = () => {};
        return node;
    };
    documentRef.getElementById = () => null;

    globalThis.document = documentRef;
    globalThis.window = {
        location: { href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
        innerWidth: 1280,
        innerHeight: 900,
        addEventListener() {}, removeEventListener() {},
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
    };
    globalThis.CSS = { supports: () => true };
    // The track dispatches a plain `input` event so the popup's own validity
    // reset runs exactly as it does when a person types.
    globalThis.Event = class FakeEvent {
        constructor(type, init = {}) { this.type = type; this.bubbles = Boolean(init.bubbles); }
    };

    const media = currentTime === null ? null : {
        currentTime,
        duration: mediaDuration ?? lengthSeconds,
        listeners: new Map(),
        addEventListener(type, callback) {
            if (!this.listeners.has(type)) this.listeners.set(type, []);
            this.listeners.get(type).push(callback);
        },
    };

    const feature = createDownloadUIFeature({
        getVideoId: () => 'dQw4w9WgXcQ',
        isWatchPagePath: () => true,
        supportsPopover: () => false,
        getPlayerResponseGlobal: () => (lengthSeconds
            ? { videoDetails: { videoId: 'dQw4w9WgXcQ', lengthSeconds: String(lengthSeconds) } }
            : null),
        getMainVideoElement: () => media,
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
    const walk = (node) => {
        all.push(node);
        for (const child of node.children || []) walk(child);
    };
    walk(popup);

    const byClass = (name) => all.filter((node) => String(node.className).split(/\s+/).includes(name));
    const track = byClass('ytkit-dl-popup__clip-track')[0] || null;
    const inputs = byClass('ytkit-dl-popup__clip-input');

    return {
        popup,
        track,
        media,
        trackRect,
        startInput: inputs[0],
        endInput: inputs[1],
        handle: (which) => (track
            ? (track.children || []).find((node) => node.dataset?.handle === which)
            : null),
        selection: track ? (track.children || []).find(
            (node) => String(node.className).includes('clip-selection')) : null,
        playhead: track ? (track.children || []).find(
            (node) => String(node.className).includes('clip-playhead')) : null,
    };
}

const fire = (node, type, event) => {
    for (const callback of node.listeners?.get(type) || []) callback(event);
};

/** Drag a handle to a fraction of the track's width. */
const dragTo = (view, which, fraction) => {
    const handle = view.handle(which);
    fire(handle, 'pointerdown', { pointerId: 1, preventDefault() {} });
    fire(handle, 'pointermove', { clientX: view.trackRect.left + (view.trackRect.width * fraction) });
    fire(handle, 'pointerup', {});
};

const key = (view, which, keyName, shiftKey = false) =>
    fire(view.handle(which), 'keydown', { key: keyName, shiftKey, preventDefault() {} });

test('the popup renders a clip track with a handle at each end', () => {
    const view = openPopup();
    assert.ok(view.track, 'a video with a known duration gets a track');
    assert.ok(view.handle('start'), 'and a start handle');
    assert.ok(view.handle('end'), 'and an end handle');

    // Both are real sliders, not drag-only targets. Pointer-only trimming
    // would put the feature out of reach of anyone not using a mouse, and the
    // repo ships no keyboard shortcuts to compensate.
    for (const which of ['start', 'end']) {
        const handle = view.handle(which);
        assert.equal(handle.getAttribute('role'), 'slider');
        assert.equal(handle.tabIndex, 0, `${which} handle must be reachable by keyboard`);
        assert.ok(handle.getAttribute('aria-label'), `${which} handle must be named`);
        assert.equal(handle.getAttribute('aria-valuemax'), String(DURATION));
    }
    assert.equal(view.handle('start').style.left, '0%', 'an unset clip spans the whole video');
    assert.equal(view.handle('end').style.left, '100%');
});

test('dragging a handle writes the timestamp the download will use', () => {
    const view = openPopup();
    assert.equal(view.startInput.value, '', 'nothing is set to begin with');

    dragTo(view, 'start', 0.25);
    assert.equal(view.startInput.value, '2:30',
        'a quarter of ten minutes, in the format the placeholder promises');
    // Both ends, not one. `normalizeSectionInput` refuses a half-filled range
    // ("Enter both clip times"), so a drag that wrote only the handle it moved
    // would draw a clip the popup then rejects.
    assert.equal(view.endInput.value, '10:00', 'the other end materialises at the video end');

    dragTo(view, 'end', 0.5);
    assert.equal(view.endInput.value, '5:00');
    assert.equal(view.startInput.value, '2:30', 'the first handle stays where it was put');
});

test('typing a timestamp moves the handle', () => {
    const view = openPopup();
    view.startInput.value = '1:00';
    fire(view.startInput, 'input', {});

    assert.equal(view.handle('start').style.left, '10%', 'a minute into ten minutes');
    assert.equal(view.selection.style.left, '10%');

    view.endInput.value = '9:00';
    fire(view.endInput, 'input', {});
    assert.equal(view.handle('end').style.left, '90%');
    assert.equal(view.selection.style.width, '80%', 'the selection spans what was typed');
});

test('a half-typed timestamp does not move anything', () => {
    // The handles must not jump around under the user's hands while they are
    // still typing; only a value that parses moves them.
    const view = openPopup();
    view.startInput.value = '1:00';
    fire(view.startInput, 'input', {});
    assert.equal(view.handle('start').style.left, '10%');

    view.startInput.value = '1:';
    fire(view.startInput, 'input', {});
    assert.equal(view.handle('start').style.left, '10%', 'an unparseable value is ignored');
});

test('the handles cannot cross', () => {
    const view = openPopup();
    dragTo(view, 'start', 0.2);
    dragTo(view, 'end', 0.4);
    assert.equal(view.startInput.value, '2:00');
    assert.equal(view.endInput.value, '4:00');

    // Push the start past the end. It pins against it instead of swapping, the
    // way every editor behaves and the only way the text stays readable.
    //
    // Asserting only "start is still before end" is not enough: pinning the
    // wrong handle also satisfies that, by shoving the END forward to make
    // room. The handle the user did not touch has to stay exactly where they
    // left it, which is the property that separates the two.
    dragTo(view, 'start', 0.9);
    assert.equal(view.endInput.value, '4:00',
        'the end handle was not touched and must not move');
    assert.ok(view.startInput.value < view.endInput.value,
        `start ${view.startInput.value} must stay before end ${view.endInput.value}`);
    assert.notEqual(view.startInput.value, view.endInput.value, 'a zero-length clip is not a clip');

    // And the same pushing the other way: the start is the untouched one now.
    dragTo(view, 'start', 0.1);
    dragTo(view, 'end', 0.05);
    assert.equal(view.startInput.value, '1:00', 'the start handle must not move');
    assert.ok(view.startInput.value < view.endInput.value);
});

test('a drag past either edge clamps to the video', () => {
    const view = openPopup();
    dragTo(view, 'start', -5);
    assert.equal(view.startInput.value, '0:00', 'there is nothing before the beginning');

    dragTo(view, 'end', 5);
    assert.equal(view.endInput.value, '10:00', 'nor after the end');
});

test('the handles move by keyboard, a second at a time and ten with shift', () => {
    const view = openPopup();
    key(view, 'start', 'ArrowRight');
    assert.equal(view.startInput.value, '0:01');

    key(view, 'start', 'ArrowRight', true);
    assert.equal(view.startInput.value, '0:11', 'shift is the coarse step');

    key(view, 'start', 'ArrowLeft');
    assert.equal(view.startInput.value, '0:10');

    // Home on the END handle pins the END against the start. Pinning the
    // wrong one drags the stationary handle down with it, which is what this
    // caught the first time.
    key(view, 'end', 'Home');
    assert.equal(view.startInput.value, '0:10', 'the start handle must not move');
    assert.ok(view.endInput.value > view.startInput.value,
        'and the end stays after it rather than crossing');

    key(view, 'end', 'End');
    assert.equal(view.endInput.value, '10:00');
});

test('the playhead marks where the user is watching', () => {
    const view = openPopup({ currentTime: 150 });
    assert.ok(view.playhead, 'the marker exists');
    assert.equal(view.playhead.hidden, false);
    assert.equal(view.playhead.style.left, '25%', 'two and a half minutes into ten');
    assert.equal(view.playhead.getAttribute('aria-hidden'), 'true',
        'it is a marker, not a control');

    // It follows playback.
    view.media.currentTime = 300;
    for (const callback of view.media.listeners.get('timeupdate') || []) callback();
    assert.equal(view.playhead.style.left, '50%');
});

test('with no playing video there is no playhead to show', () => {
    const view = openPopup({ currentTime: null });
    assert.ok(view.track, 'the track still renders from the declared duration');
    assert.equal(view.playhead.hidden, true);
});

test('with no known duration there is no track, and the inputs still work', () => {
    // A live stream, or a page whose player response has not landed. The row
    // has to keep working exactly as it did before the track existed.
    const view = openPopup({ lengthSeconds: 0 });
    assert.equal(view.track, null, 'nothing to scale against means nothing to draw');
    assert.ok(view.startInput, 'the text inputs are still there');
    assert.ok(view.endInput);

    view.startInput.value = '0:30';
    fire(view.startInput, 'input', {});
    assert.equal(view.startInput.value, '0:30', 'and still accept a timestamp');
});

test('the media element supplies the duration when the player response has not landed', () => {
    // On a cold watch page the response can arrive after the popup opens. The
    // element already knows how long the video is, and a track that waited for
    // the response would simply not be there when the user reached for it.
    const view = openPopup({ lengthSeconds: 0, currentTime: 30, mediaDuration: 600 });
    assert.ok(view.track, 'the element is the fallback source for the duration');
    assert.equal(view.handle('end').getAttribute('aria-valuemax'), '600');

    dragTo(view, 'end', 0.5);
    assert.equal(view.endInput.value, '5:00', 'and it scales the same way');
});

test('an hour-long video reads in hours, not in minutes past sixty', () => {
    const view = openPopup({ lengthSeconds: 7200 });
    dragTo(view, 'start', 0.5);
    assert.equal(view.startInput.value, '1:00:00',
        'a timestamp the parser cannot read back is a timestamp the download cannot use');

    // And it round-trips: the parser accepts what the formatter wrote.
    view.startInput.value = '1:30:00';
    fire(view.startInput, 'input', {});
    assert.equal(view.handle('start').style.left, '75%');
});
