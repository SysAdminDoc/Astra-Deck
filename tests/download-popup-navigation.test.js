'use strict';

// The download popup captured formats, size estimates, the playlist preview
// and the clip range for the video it was opened on — but the download CTA
// re-read window.location.href at CLICK time.
//
// YouTube's autoplay advances the page with no user gesture, and nothing
// closed the popup when it did. The popup therefore sat over the next video showing video A's formats, and clicking Download
// fetched video B.
//
// This was 13 regex pins on the identifiers involved. It now opens the real
// popup, moves the page underneath it, and watches which URL the popup's own
// exits use — the only form of the assertion that can survive a rename.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { createDownloadUIFeature } = require('../extension/features/download-ui');
const { fakeNode, fakeTreeDocument, collectFakeTree } = require('./helpers/monolith');

const VIDEO_A = 'https://www.youtube.com/watch?v=AAAAAAAAAAA';
const VIDEO_B = 'https://www.youtube.com/watch?v=BBBBBBBBBBB';

/**
 * Open the real download popup on `url` and hand back everything needed to
 * observe where it sends the user afterwards.
 */
function openDownloadPopup({ url = VIDEO_A } = {}) {
    const documentRef = fakeTreeDocument(() => null);
    const createElement = documentRef.createElement.bind(documentRef);
    documentRef.createElement = (tag) => {
        const node = createElement(tag);
        node.offsetWidth = 320;
        node.offsetHeight = 230;
        node.getBoundingClientRect = () => ({ top: 0, bottom: 230, left: 0, right: 320, width: 320, height: 230 });
        node.replaceChildren = () => { node.children.length = 0; };
        node.scrollIntoView = () => {};
        node.showModal = () => { node.open = true; };
        node.close = () => { node.open = false; };
        return node;
    };
    documentRef.getElementById = () => null;

    const navRules = new Map();
    const debugLines = [];
    const probes = [];
    const timers = [];

    globalThis.document = documentRef;
    globalThis.window = {
        location: { href: url },
        innerWidth: 1280,
        innerHeight: 900,
        addEventListener() {},
        removeEventListener() {},
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
    };
    globalThis.CSS = { supports: () => false };

    const feature = createDownloadUIFeature({
        getVideoId: (candidate) => {
            try {
                return new URL(candidate || globalThis.window.location.href).searchParams.get('v');
            } catch (_) { return null; }
        },
        isWatchPagePath: () => true,
        addNavigateRule: (id, rule) => navRules.set(id, rule),
        removeNavigateRule: (id) => navRules.delete(id),
        DebugManager: { log: (area, message) => debugLines.push(`${area}: ${message}`) },
        // Captured, not scheduled: the arm-window timer would otherwise fire
        // long after the test that started it, into another test's document.
        setTimeoutFn: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
        clearTimeoutFn: () => {},
        setIntervalFn: () => 0,
        clearIntervalFn: () => {},
    });

    // The store is created inside the factory and handed back on the feature,
    // so patching it here is patching the object the popup itself calls.
    feature.downloadFormatEstimates.probe = async (videoId, videoUrl, options) => {
        probes.push({ videoId, videoUrl, options });
        return { status: 'error', error: 'probe stubbed' };
    };

    const anchor = fakeNode({ tag: 'button' });
    anchor.getBoundingClientRect = () => ({ top: 400, bottom: 424, left: 400, width: 40 });
    anchor.focus = () => {};

    feature.showDownloadPopup(anchor);
    const popup = documentRef.body.children[documentRef.body.children.length - 1];

    return {
        feature,
        documentRef,
        popup,
        anchor,
        navRules,
        debugLines,
        probes,
        timers,
        navigateTo(next) { globalThis.window.location.href = next; },
        // The popup kicks off an async format probe as it opens; let it land
        // before the test reads what the popup did.
        settle: () => new Promise((resolve) => setImmediate(resolve)),
    };
}

const findByClass = (root, className) =>
    collectFakeTree(root, '*').find((node) => String(node.className || '').includes(className));

const mountedPopups = (documentRef) => documentRef.body.children
    .filter((node) => String(node.className || '').includes('ytkit-dl-popup')).length;

const downloadRequests = (debugLines) => debugLines
    .filter((line) => line.startsWith('Download: Download requested: '))
    .map((line) => line.replace('Download: Download requested: ', '').split(' (')[0]);

test('the popup registers exactly one navigate rule while it is open', async () => {
    const session = openDownloadPopup();
    await session.settle();
    assert.equal(session.navRules.size, 1, 'the popup arms one navigate rule');
    assert.ok(session.popup, 'the popup is mounted');
    assert.ok(String(session.popup.className).includes('ytkit-dl-popup'));
});

test('the navigate rule leaves the popup open while the page stays on the same video', async () => {
    const session = openDownloadPopup({ url: VIDEO_A });
    await session.settle();
    const [rule] = session.navRules.values();
    // The immediate registration call fires with the page unchanged.
    rule();
    assert.equal(session.popup.isConnected, true, 'the popup must survive its own registration');
    assert.equal(session.navRules.size, 1);

    // A same-video navigation (a #t= jump, a replaceState) must not close it.
    session.navigateTo(`${VIDEO_A}&t=90`);
    rule();
    assert.equal(session.popup.isConnected, true,
        'the same video under a different query is still the same video');
});

test('the navigate rule closes the popup once autoplay moves to another video', async () => {
    const session = openDownloadPopup({ url: VIDEO_A });
    await session.settle();
    const [rule] = session.navRules.values();
    session.navigateTo(VIDEO_B);
    rule();
    assert.equal(session.popup.isConnected, false,
        'a popup describing video A must not sit over video B');
    assert.equal(session.navRules.size, 0, 'closing deregisters the navigate rule');
});

test('the download CTA sends the url the popup was opened for, not the current page', async () => {
    const session = openDownloadPopup({ url: VIDEO_A });
    await session.settle();
    const cta = findByClass(session.popup, 'ytkit-dl-popup__go');
    assert.ok(cta, 'the popup must carry a download CTA');

    // Autoplay advanced the page but nothing closed the popup yet.
    session.navigateTo(VIDEO_B);
    cta.listeners.get('click').forEach((handler) => handler({ target: cta }));

    assert.deepEqual(downloadRequests(session.debugLines), [VIDEO_A],
        'clicking Download must fetch the video the popup describes');
});

test('the format probe describes the same video the CTA would download', async () => {
    const session = openDownloadPopup({ url: VIDEO_A });
    await session.settle();
    assert.ok(session.probes.length > 0, 'opening the popup probes formats');

    // Autoplay advances the page, then the user asks for a fresh probe. This
    // is the moment the two urls differ: a probe that re-reads location here
    // describes video B while the CTA still downloads video A.
    session.navigateTo(VIDEO_B);
    const probeButton = collectFakeTree(session.popup, '*').find((node) =>
        node.tagName === 'BUTTON'
        && node.listeners?.has('click')
        && /^Check/.test(String(node.textContent || '')));
    assert.ok(probeButton, 'the popup must offer a fresh format probe');
    probeButton.listeners.get('click').forEach((handler) => handler({ target: probeButton }));
    await session.settle();

    assert.ok(session.probes.length > 1, 'the button must run another probe');
    for (const probe of session.probes) {
        assert.equal(probe.videoUrl, VIDEO_A,
            'probing a different url than the CTA downloads is the same bug in another place');
    }
});

test('the playlist url is derived from the frozen url, not the current page', async () => {
    const withList = `${VIDEO_A}&list=PLfrozen`;
    const session = openDownloadPopup({ url: withList });
    await session.settle();
    // The playlist surface only appears when the opened url carried a list.
    const hint = collectFakeTree(session.popup, '*')
        .map((node) => String(node.textContent || ''))
        .join(' ');
    assert.match(hint, /playlist/i, 'a list= url must surface the playlist controls');

    session.navigateTo(VIDEO_B);
    const cta = findByClass(session.popup, 'ytkit-dl-popup__go');
    cta.listeners.get('click').forEach((handler) => handler({ target: cta }));
    assert.deepEqual(downloadRequests(session.debugLines), [withList],
        'with no items selected the frozen video url is what downloads');

    // The playlist id itself is read at open time, when the frozen url and
    // window.location.href are still the same string — so no behaviour can
    // separate the two expressions today. The pin guards the intent: move
    // this read after an await and the two diverge.
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'features', 'download-ui', 'index.js'),
        'utf8'
    );
    assert.match(source, /playlistId = new URL\(openedUrl\)\.searchParams\.get\('list'\) \|\| '';/);
});

const fire = (node, type, event = {}) => {
    node.listeners?.get(type)?.forEach((handler) => handler.call(node, { type, ...event }));
};

// Inside the fake box is 0..320 by 0..230.
const OUTSIDE = { clientX: 500, clientY: 500 };
const INSIDE = { clientX: 100, clientY: 100 };

test('the popup opens as a real modal dialog', async () => {
    const session = openDownloadPopup();
    await session.settle();
    assert.equal(String(session.popup.tagName).toLowerCase(), 'dialog');
    assert.equal(session.popup.open, true, 'showModal ran');
    assert.equal(session.popup.getAttribute('popover'), null, 'and it is no popover as well');
    assert.equal(session.popup.getAttribute('aria-label'), 'Download options');
});

test('when the browser closes the dialog the popup comes down with it', async () => {
    const session = openDownloadPopup();
    await session.settle();
    assert.equal(session.anchor.getAttribute('aria-expanded'), 'true');
    let focused = 0;
    session.anchor.focus = () => { focused += 1; };

    // What Escape does: the browser closes it, then `close` arrives.
    session.popup.open = false;
    fire(session.popup, 'close');

    assert.equal(session.navRules.size, 0, 'this path does not go through the navigate rule');
    assert.equal(session.popup.isConnected, false);
    assert.equal(session.anchor.getAttribute('aria-expanded'), 'false');
    assert.equal(focused, 1, 'focus goes back to the trigger');
});

test('a late close from an earlier popup leaves the newer one open', async () => {
    const session = openDownloadPopup();
    await session.settle();
    const first = session.popup;
    session.feature.showDownloadPopup(session.anchor);
    await session.settle();
    fire(first, 'close');
    assert.equal(mountedPopups(session.documentRef), 1);
    const second = session.documentRef.body.children.at(-1);
    assert.equal(second.open, true);
    assert.equal(session.navRules.size, 1);
});

test('Escape stays away from the page, and the browser does the closing', async () => {
    const session = openDownloadPopup();
    await session.settle();
    let stopped = 0;
    const stopPropagation = () => { stopped += 1; };
    fire(session.popup, 'keydown', { key: 'Escape', stopPropagation });
    assert.equal(stopped, 1);
    assert.equal(session.popup.isConnected, true, 'the close event takes it down, not the key');
    fire(session.popup, 'keydown', { key: 'a', stopPropagation });
    assert.equal(stopped, 1, 'other keys are left alone');
});

test('a press and release outside the box close the popup', async () => {
    const session = openDownloadPopup();
    await session.settle();
    fire(session.popup, 'pointerdown', { target: session.popup, ...OUTSIDE });
    fire(session.popup, 'click', { target: session.popup, ...OUTSIDE });
    assert.equal(session.popup.isConnected, false);
});

test('past any side of the box counts as outside', async () => {
    const sides = [
        { clientX: -5, clientY: 100 },
        { clientX: 325, clientY: 100 },
        { clientX: 100, clientY: -5 },
        { clientX: 100, clientY: 235 }
    ];
    for (const side of sides) {
        const session = openDownloadPopup();
        await session.settle();
        fire(session.popup, 'pointerdown', { target: session.popup, ...side });
        fire(session.popup, 'click', { target: session.popup, ...side });
        assert.equal(session.popup.isConnected, false, JSON.stringify(side));
    }
});

test('a drag that began inside and ended outside leaves the popup open', async () => {
    const session = openDownloadPopup();
    await session.settle();
    // The browser sends that click to what both ends share, the dialog itself.
    fire(session.popup, 'pointerdown', { target: findByClass(session.popup, 'ytkit-dl-popup__tab'), ...INSIDE });
    fire(session.popup, 'click', { target: session.popup, ...OUTSIDE });
    assert.equal(session.popup.isConnected, true);
    assert.equal(session.popup.open, true);
});

test('a drag that began outside and ended inside leaves the popup open', async () => {
    const session = openDownloadPopup();
    await session.settle();
    fire(session.popup, 'pointerdown', { target: session.popup, ...OUTSIDE });
    fire(session.popup, 'click', { target: session.popup, ...INSIDE });
    assert.equal(session.popup.isConnected, true);
});

test('the box border and the controls inside it do not close the popup', async () => {
    const session = openDownloadPopup();
    await session.settle();
    fire(session.popup, 'pointerdown', { target: session.popup, ...INSIDE });
    fire(session.popup, 'click', { target: session.popup, ...INSIDE });
    assert.equal(session.popup.isConnected, true, 'the dialog\'s own edge is inside the box');
    const tab = findByClass(session.popup, 'ytkit-dl-popup__tab');
    fire(session.popup, 'pointerdown', { target: tab, ...OUTSIDE });
    fire(session.popup, 'click', { target: tab, ...OUTSIDE });
    assert.equal(session.popup.isConnected, true);
});

test('a toast hosted in the popup gets out before the popup leaves the document', async () => {
    const order = [];
    const session = openDownloadPopup();
    await session.settle();
    const { popup } = session;
    const close = popup.close;
    popup.close = () => { order.push('close'); close(); };
    const previous = globalThis.YTKitCore;
    globalThis.YTKitCore = {
        toast: { raiseActiveToasts: () => { order.push(popup.isConnected ? 'raise while mounted' : 'raise too late'); return 0; } }
    };
    try {
        session.feature._closeDlPopup();
    } finally {
        globalThis.YTKitCore = previous;
    }
    assert.deepEqual(order, ['close', 'raise while mounted']);
    assert.equal(popup.isConnected, false);
});

test('a toast shown before the popup comes up over it', async () => {
    let raised = 0;
    const previous = globalThis.YTKitCore;
    globalThis.YTKitCore = { toast: { raiseActiveToasts: () => { raised += 1; return 0; } } };
    try {
        openDownloadPopup();
    } finally {
        globalThis.YTKitCore = previous;
    }
    assert.equal(raised, 1);
});

test('a browser that refuses the modal still gets a popup with a way out', async () => {
    const session = openDownloadPopup();
    await session.settle();
    const documentRef = session.documentRef;
    const createElement = documentRef.createElement.bind(documentRef);
    documentRef.createElement = (tag) => {
        const node = createElement(tag);
        node.showModal = () => { throw new Error('refused'); };
        return node;
    };
    session.feature.showDownloadPopup(session.anchor);
    await session.settle();
    const popup = documentRef.body.children.at(-1);
    assert.ok(String(popup.className).includes('ytkit-dl-popup'));
    fire(findByClass(popup, 'ytkit-dl-popup__close'), 'click');
    assert.equal(popup.isConnected, false);
});

test('reopening the popup replaces the rule rather than stacking rules', async () => {
    const session = openDownloadPopup({ url: VIDEO_A });
    await session.settle();
    assert.equal(session.navRules.size, 1);
    session.feature.showDownloadPopup(session.anchor);
    assert.equal(session.navRules.size, 1, 'a second open must not leave two rules armed');
    assert.equal(session.popup.isConnected, false, 'the first popup is taken down');
    assert.equal(mountedPopups(session.documentRef), 1, 'and must not leave two popups mounted');
});

// The format line said "Something unexpected went wrong" and logged a failure
// every time the popup opened without the optional helper running.
test('no downloader running reads as a plain status', async () => {
    const session = openDownloadPopup();
    session.feature.downloadFormatEstimates.probe = async () => ({ status: 'unavailable', error: 'Downloader not running' });
    await session.settle();
    // The popup's own first look used the harness stub.
    session.debugLines.length = 0;
    const button = findByClass(session.popup, 'ytkit-dl-popup__dir-btn');
    assert.match(String(button.textContent), /Check what/);
    await [...button.listeners.get('click')][0]();
    const line = collectFakeTree(session.popup, '*')
        .filter((node) => String(node.className || '').includes('ytkit-dl-popup__playlist-meta'))
        .map((node) => String(node.textContent))
        .find((text) => /Downloader|unavailable|unexpected/i.test(text));
    assert.equal(line, 'Downloader not running');
    assert.equal(session.debugLines.filter((entry) => /format-probe/.test(entry)).length, 0);
});

test('a real format failure still says so', async () => {
    const session = openDownloadPopup();
    session.feature.downloadFormatEstimates.probe = async () => ({ status: 'unavailable', error: 'yt-dlp exploded' });
    await session.settle();
    const button = findByClass(session.popup, 'ytkit-dl-popup__dir-btn');
    assert.match(String(button.textContent), /Check what/);
    await [...button.listeners.get('click')][0]();
    const line = collectFakeTree(session.popup, '*')
        .filter((node) => String(node.className || '').includes('ytkit-dl-popup__playlist-meta'))
        .map((node) => String(node.textContent))
        .find((text) => /Format list unavailable/.test(text));
    assert.ok(line, 'the failure is shown');
    assert.equal(/yt-dlp exploded/.test(line), false, 'a raw error stays out of the popup');
});
