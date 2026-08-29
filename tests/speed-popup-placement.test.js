'use strict';

// Two guards the download popup carried and the speed popup did not.
//
// 1. The no-anchor fallback (Firefox, or any engine without CSS anchor
//    positioning) clamped `left` both ways and flipped above->below when the
//    popup would go off the top — but never clamped the BOTTOM edge and never
//    capped height. In a short viewport that flip put the ~230px grid past the
//    bottom of the screen, and a fixed popup cannot be scrolled back.
//
// 2. The capture-phase listeners are attached on a 50ms timer with no
//    isConnected guard. A fast reopen discards the old cleanup closure, but
//    the pending timer still fires and attaches listeners nothing will ever
//    remove — leaked for the page lifetime, and the orphaned outsideClick
//    closes the NEXT speed popup on its first click.
//
// These were 17 regex pins on the placement arithmetic. They now open the real
// popup against measured viewports and read the geometry back off the element,
// which is the only way to catch an arithmetic change that still matches the
// shape of the old expression.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { loadDeclarations, fakeNode } = require('./helpers/monolith');

const repoRoot = path.join(__dirname, '..');

const POPUP_WIDTH = 240;
const POPUP_HEIGHT = 230;

/**
 * Open the real speed popup against a measured viewport and hand back the
 * element, the sandbox, and everything the popup did to the document.
 */
function openSpeedPopup({ innerHeight, innerWidth = 1280, anchorRect, supportsAnchor = false }) {
    const listeners = [];
    const timers = [];
    const closes = [];

    const makeElement = (tag) => {
        const node = fakeNode({ tag });
        node.offsetWidth = POPUP_WIDTH;
        node.offsetHeight = POPUP_HEIGHT;
        node.contains = (other) => other === node || node.children.includes(other);
        node.showPopover = undefined;
        return node;
    };

    const body = makeElement('body');
    const documentRef = {
        body,
        createElement: makeElement,
        addEventListener: (type, handler, capture) => listeners.push({ type, handler, capture }),
        removeEventListener: (type, handler, capture) => {
            const index = listeners.findIndex((entry) => entry.handler === handler && entry.type === type
                && Boolean(entry.capture) === Boolean(capture));
            if (index > -1) listeners.splice(index, 1);
        },
    };

    const anchor = makeElement('button');
    anchor.getBoundingClientRect = () => anchorRect;

    const sandbox = loadDeclarations(['showSpeedPopup'], {
        document: documentRef,
        window: { innerHeight, innerWidth },
        // No `showPopover`, so the manual placement and listener paths run —
        // this is the Firefox lane the guards exist for.
        HTMLElement: function HTMLElement() {},
        CSS: { supports: () => supportsAnchor },
        SPEED_OPTIONS: [0.5, 1, 1.5, 2],
        appState: { settings: { persistentSpeedValue: 1 } },
        t: (_key, fallback) => fallback,
        storageWriteJSON() {},
        getMainVideoElement: () => null,
        getFeatureById: () => null,
        installMenuKeyboardModel: () => () => {},
        _closeSpeedPopup: () => closes.push(Date.now()),
        setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
        clearTimeout() {},
    });

    sandbox.showSpeedPopup(anchor, () => {});
    const popup = body.children[body.children.length - 1];
    popup.isConnected = true;
    return { popup, anchor, listeners, timers, closes, body };
}

const pixels = (value) => Number.parseFloat(String(value).replace('px', ''));

test('a roomy viewport still caps the popup height and lets it scroll', () => {
    const { popup } = openSpeedPopup({
        innerHeight: 900,
        anchorRect: { top: 600, bottom: 624, left: 400, width: 40 },
    });
    assert.equal(popup.style.overflowY, 'auto', 'a capped popup must still be able to show its contents');
    // Room above the anchor is 600 - 16 = 584, which is what it may use.
    assert.equal(pixels(popup.style.maxHeight), 584);
    // It fits above the anchor, so no flip: 600 - 230 - 8.
    assert.equal(pixels(popup.style.top), 362);
});

test('the bottom edge is clamped after the above/below flip, using the capped height', () => {
    // 200px tall viewport, anchor in the middle. The popup cannot fit above,
    // flips below to 132, and 132 + 230 would run 162px past the bottom.
    const { popup } = openSpeedPopup({
        innerHeight: 200,
        anchorRect: { top: 100, bottom: 124, left: 400, width: 40 },
    });

    // Neither side has 120px, so the floor wins and becomes the cap.
    assert.equal(pixels(popup.style.maxHeight), 120);

    const top = pixels(popup.style.top);
    assert.ok(top >= 8, `the correction must not push the popup off the top (got ${top})`);
    assert.ok(top + 120 <= 200 - 8, `the popup must end inside the viewport (got ${top + 120})`);
    // 200 - 120 - 8. Clamping against the UNCAPPED 230px height would have
    // over-corrected to the 8px floor and left a visible gap.
    assert.equal(top, 72);
});

test('the bottom clamp never pushes the popup off the top instead', () => {
    // 130px viewport: even the 120px floor does not fit under the anchor, so
    // the bottom correction wants a negative top. The GAP floor wins.
    const { popup } = openSpeedPopup({
        innerHeight: 130,
        anchorRect: { top: 60, bottom: 84, left: 400, width: 40 },
    });
    assert.equal(pixels(popup.style.maxHeight), 120, 'the floor is the only height that fits');
    assert.equal(pixels(popup.style.top), 8,
        'correcting the bottom edge must stop at the 8px top gap, not run past it');
});

test('the height cap is derived from the room actually available', () => {
    // Plenty of room below, none above: the cap must follow the larger side.
    const { popup } = openSpeedPopup({
        innerHeight: 800,
        anchorRect: { top: 10, bottom: 34, left: 400, width: 40 },
    });
    assert.equal(pixels(popup.style.maxHeight), 750, '800 - 34 - 16 is the room below');
    assert.equal(pixels(popup.style.top), 42, 'no room above, so it flips below the anchor');
});

test('the popup is clamped horizontally at both edges', () => {
    const nearLeft = openSpeedPopup({
        innerHeight: 900,
        innerWidth: 1280,
        anchorRect: { top: 400, bottom: 424, left: 0, width: 20 },
    });
    assert.equal(pixels(nearLeft.popup.style.left), 8, 'a left-edge anchor must not push the popup off screen');

    const nearRight = openSpeedPopup({
        innerHeight: 900,
        innerWidth: 1280,
        anchorRect: { top: 400, bottom: 424, left: 1270, width: 20 },
    });
    assert.equal(pixels(nearRight.popup.style.left), 1280 - POPUP_WIDTH - 8,
        'a right-edge anchor must not push the popup off screen');
});

test('placement is skipped entirely where CSS anchor positioning is available', () => {
    const { popup } = openSpeedPopup({
        innerHeight: 200,
        anchorRect: { top: 100, bottom: 124, left: 400, width: 40 },
        supportsAnchor: true,
    });
    assert.equal(popup.style.top, '', 'the browser owns placement when it supports anchor positioning');
    assert.equal(popup.style.maxHeight, '');
});

test('deferred listeners are not attached to a popup that already closed', () => {
    const { popup, listeners, timers } = openSpeedPopup({
        innerHeight: 900,
        anchorRect: { top: 400, bottom: 424, left: 400, width: 40 },
    });
    const armed = timers.filter((entry) => entry.delay === 50);
    assert.equal(armed.length, 1, 'the listeners are armed on one 50ms timer');
    assert.deepEqual(listeners, [], 'nothing is attached before the timer fires');

    // A fast reopen removed this popup; the pending timer still fires.
    popup.isConnected = false;
    armed[0].fn();
    assert.deepEqual(listeners, [],
        'attaching now would leak capture-phase listeners for the page lifetime');
});

test('a popup that is still open gets both listeners, and cleanup removes them', () => {
    const { listeners, timers } = openSpeedPopup({
        innerHeight: 900,
        anchorRect: { top: 400, bottom: 424, left: 400, width: 40 },
    });
    timers.find((entry) => entry.delay === 50).fn();
    assert.deepEqual(
        listeners.map(({ type, capture }) => `${type}:${Boolean(capture)}`),
        ['click:true', 'keydown:false'],
        'the outside-click listener is capture phase, the escape listener is not'
    );
});

test('the cleanup closure removes both listeners and collapses aria-expanded', () => {
    const listeners = [];
    const timers = [];
    const documentRef = {
        body: fakeNode({ tag: 'body' }),
        createElement: (tag) => {
            const node = fakeNode({ tag });
            node.offsetWidth = POPUP_WIDTH;
            node.offsetHeight = POPUP_HEIGHT;
            node.contains = () => false;
            return node;
        },
        addEventListener: (type, handler, capture) => listeners.push({ type, handler, capture }),
        removeEventListener: (type, handler, capture) => {
            const index = listeners.findIndex((entry) => entry.handler === handler && entry.type === type
                && Boolean(entry.capture) === Boolean(capture));
            if (index > -1) listeners.splice(index, 1);
        },
    };
    const anchor = fakeNode({ tag: 'button' });
    anchor.getBoundingClientRect = () => ({ top: 400, bottom: 424, left: 400, width: 40 });

    const sandbox = loadDeclarations(['showSpeedPopup'], {
        document: documentRef,
        window: { innerHeight: 900, innerWidth: 1280 },
        HTMLElement: function HTMLElement() {},
        CSS: { supports: () => false },
        SPEED_OPTIONS: [1, 2],
        appState: { settings: {} },
        t: (_key, fallback) => fallback,
        storageWriteJSON() {},
        getMainVideoElement: () => null,
        getFeatureById: () => null,
        installMenuKeyboardModel: () => () => {},
        _closeSpeedPopup: () => {},
        setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
        clearTimeout() {},
    });

    sandbox.showSpeedPopup(anchor, () => {});
    const popup = documentRef.body.children[documentRef.body.children.length - 1];
    popup.isConnected = true;
    assert.equal(anchor.getAttribute('aria-expanded'), 'true', 'opening announces the expanded state');

    timers.find((entry) => entry.delay === 50).fn();
    assert.equal(listeners.length, 2);

    sandbox.globalThis._speedPopupCleanup();
    assert.deepEqual(listeners, [], 'cleanup removes both listeners');
    assert.equal(anchor.getAttribute('aria-expanded'), 'false', 'cleanup collapses the anchor again');
});

test('the download popup keeps the same two guards', () => {
    // Cross-file regression pin: both guards originated in the download popup.
    // Its own geometry is exercised in tests/download-ui-geometry.test.js; this
    // assertion exists so removing them THERE cannot silently let the speed
    // popup drift back.
    const dl = fs.readFileSync(path.join(repoRoot, 'extension/features/download-ui/index.js'), 'utf8');
    assert.match(dl, /if \(!popup\.isConnected\) return;/);
    assert.match(dl, /popup\.style\.maxHeight = heightCap \+ 'px';/);
});
