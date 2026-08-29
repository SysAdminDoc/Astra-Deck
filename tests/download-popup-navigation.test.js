'use strict';

// The download popup captured formats, size estimates, the playlist preview
// and the clip range for the video it was opened on — but the download CTA
// re-read window.location.href at CLICK time.
//
// YouTube's autoplay advances the page with no user gesture, so the popover's
// light-dismiss never fires and nothing else closed it. The popup therefore
// sat over the next video showing video A's formats, and clicking Download
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
function openDownloadPopup({ url = VIDEO_A, supportsPopover = false } = {}) {
    const documentRef = fakeTreeDocument(() => null);
    const createElement = documentRef.createElement.bind(documentRef);
    documentRef.createElement = (tag) => {
        const node = createElement(tag);
        node.offsetWidth = 320;
        node.offsetHeight = 230;
        node.getBoundingClientRect = () => ({ top: 0, bottom: 230, left: 0, right: 320, width: 320, height: 230 });
        node.replaceChildren = () => { node.children.length = 0; };
        node.scrollIntoView = () => {};
        node.showPopover = () => { node.popoverOpen = true; };
        node.hidePopover = () => { node.popoverOpen = false; };
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
        supportsPopover: () => supportsPopover,
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

test('both cleanup branches deregister the navigate rule under the same id', async () => {
    for (const supportsPopover of [false, true]) {
        const session = openDownloadPopup({ supportsPopover });
        await session.settle();
        const [registeredId] = session.navRules.keys();
        assert.equal(typeof registeredId, 'string');
        assert.ok(registeredId.length > 0);

        // Escape runs the popup's own dialog handler, which is the close
        // path that does NOT go through the navigate rule.
        const keydown = session.popup.listeners?.get('keydown');
        assert.ok(keydown && keydown.size > 0, 'the popup must handle its own keydown');
        keydown.forEach((handler) => handler({ key: 'Escape', preventDefault() {}, stopPropagation() {} }));

        assert.equal(session.navRules.size, 0,
            `the ${supportsPopover ? 'anchored' : 'fallback'} cleanup path must deregister`);
        assert.equal(session.popup.isConnected, false, 'Escape closes the popup');
    }
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
