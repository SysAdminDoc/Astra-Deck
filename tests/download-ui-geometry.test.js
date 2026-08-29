'use strict';

// Five defects in the download UI, all of the same family: code that was
// correct for the case it was written against and silently wrong for a
// neighbouring one. Four of them are now driven through the surface that
// carried the defect rather than read out of the source.
//
// One assertion stays a scan and says why: "every authenticated companion call
// agrees on the header name" is a claim about call sites this test cannot all
// reach, and a scan is what makes it exhaustive.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { createDownloadUIFeature } = require('../extension/features/download-ui');
const { fakeNode, fakeTreeDocument, selectorMatches } = require('./helpers/monolith');

const repoRoot = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'extension/features/download-ui/index.js'), 'utf8');

const POPUP_WIDTH = 320;
const POPUP_HEIGHT = 230;
const pixels = (value) => Number.parseFloat(String(value).replace('px', ''));

/** Open the download popup on the CSS-anchored branch at a measured viewport. */
function openAnchoredPopup({ innerWidth = 1280, innerHeight = 900, popupRect }) {
    const documentRef = fakeTreeDocument(() => null);
    const createElement = documentRef.createElement.bind(documentRef);
    documentRef.createElement = (tag) => {
        const node = createElement(tag);
        node.offsetWidth = POPUP_WIDTH;
        node.offsetHeight = POPUP_HEIGHT;
        node.getBoundingClientRect = () => popupRect
            || { top: 0, bottom: POPUP_HEIGHT, left: 0, right: POPUP_WIDTH, width: POPUP_WIDTH, height: POPUP_HEIGHT };
        node.replaceChildren = () => { node.children.length = 0; };
        node.scrollIntoView = () => {};
        return node;
    };
    documentRef.getElementById = () => null;

    globalThis.document = documentRef;
    globalThis.window = {
        location: { href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
        innerWidth,
        innerHeight,
        addEventListener() {}, removeEventListener() {},
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
    };
    globalThis.CSS = { supports: () => true };

    const feature = createDownloadUIFeature({
        getVideoId: () => 'dQw4w9WgXcQ',
        isWatchPagePath: () => true,
        supportsPopover: () => false,
        setTimeoutFn: () => 0,
        clearTimeoutFn: () => {},
        setIntervalFn: () => 0,
        clearIntervalFn: () => {},
    });
    feature.downloadFormatEstimates.probe = async () => ({ status: 'error', error: 'stubbed' });

    const anchor = fakeNode({ tag: 'button', attributes: { class: 'ytkit-po-dl' } });
    anchor.getBoundingClientRect = () => ({ top: 400, bottom: 424, left: 600, width: 40 });
    anchor.focus = () => {};
    feature.showDownloadPopup(anchor);

    return { documentRef, popup: documentRef.body.children[documentRef.body.children.length - 1] };
}

test('the inline clamp moves the popup on the axis it was measured on', () => {
    // The panel is centred on the trigger, so a trigger near the right edge
    // overhangs it. getBoundingClientRect is physical, so the correction has
    // to be physical too: marginInlineStart maps to margin-right in RTL and
    // moves a left-positioned box nowhere.
    const overhanging = openAnchoredPopup({
        innerWidth: 1280,
        popupRect: { top: 0, bottom: 230, left: 1100, right: 1420, width: 320, height: 230 },
    });
    const shift = pixels(overhanging.popup.style.marginLeft);
    assert.ok(Number.isFinite(shift), 'an overhanging popup must be nudged back');
    assert.ok(shift < 0, `the nudge must pull it left, not right (got ${shift})`);
    assert.ok(!overhanging.popup.style.marginInlineStart,
        'a logical property maps to margin-right in RTL and moves a left-positioned box nowhere');

    const inside = openAnchoredPopup({
        innerWidth: 1280,
        popupRect: { top: 0, bottom: 230, left: 400, right: 720, width: 320, height: 230 },
    });
    assert.ok(!inside.popup.style.marginLeft || pixels(inside.popup.style.marginLeft) === 0,
        'a popup already inside the viewport must not be nudged');
});

test('the height cap is applied even when the popup has not overflowed yet', () => {
    // Playlist rows and two-line chip labels render after open, and the popup
    // is pinned bottom:anchor(top), so late growth extends upward out of the
    // viewport. Capping only on an existing overflow misses all of that.
    const roomy = openAnchoredPopup({ innerHeight: 900 });
    assert.ok(pixels(roomy.popup.style.maxHeight) > 0,
        'a popup that fits today must still carry the cap that bounds it tomorrow');
    assert.equal(pixels(roomy.popup.style.maxHeight), 900 - 424 - 16,
        'the cap is the room below the trigger, which is the taller side here');
});

test('the health container adopts the one already beside the anchor', () => {
    // The sibling panels (stream links, cobalt, history) insert at the same
    // anchor, so nextElementSibling is whichever inserted last.
    const anchor = fakeNode({ tag: 'button', attributes: { class: 'ytkit-download-btn' } });
    const parent = fakeNode({ tag: 'div' });
    const existing = fakeNode({ tag: 'span', attributes: { class: 'ytkit-download-health' } });
    const otherPanel = fakeNode({ tag: 'div', attributes: { class: 'ytkit-stream-links-panel' } });
    parent.appendChild(anchor);
    parent.appendChild(otherPanel);
    parent.appendChild(existing);
    parent.querySelector = (selector) => (String(selector).includes('ytkit-download-health') ? existing : null);
    anchor.insertAdjacentElement = () => { throw new Error('a second container must not be created'); };

    // What the anchor IS. Substring routing answered
    // `.ytkit-NOPE-local-dl-btn-NOPE` just as happily, so the three panels that
    // find their anchor this way could all be pointed at a class YouTube never
    // renders with nothing going red.
    const anchorIs = { tag: 'button', className: 'ytkit-download-btn' };
    const documentRef = fakeTreeDocument((selector) =>
        (selectorMatches(selector, anchorIs) ? anchor : null));
    globalThis.document = documentRef;

    const feature = createDownloadUIFeature({
        isWatchPagePath: () => true,
        setTimeoutFn: () => 0,
        clearTimeoutFn: () => {},
        setIntervalFn: () => 0,
        clearIntervalFn: () => {},
    });

    feature.downloadHealthPanel._attach();
    assert.equal(feature.downloadHealthPanel._container, existing,
        'the container it found is the container it must use');
    assert.equal(parent.children.filter((node) =>
        String(node.className).includes('ytkit-download-health')).length, 1,
        'a duplicate carries a stale aria-live region that announces nothing');
});

test('the health container is created when the anchor has none', () => {
    const anchor = fakeNode({ tag: 'button', attributes: { class: 'ytkit-download-btn' } });
    const parent = fakeNode({ tag: 'div' });
    parent.appendChild(anchor);
    parent.querySelector = () => null;
    let inserted = null;
    anchor.insertAdjacentElement = (position, node) => { inserted = { position, node }; };

    // What the anchor IS. Substring routing answered
    // `.ytkit-NOPE-local-dl-btn-NOPE` just as happily, so the three panels that
    // find their anchor this way could all be pointed at a class YouTube never
    // renders with nothing going red.
    const anchorIs = { tag: 'button', className: 'ytkit-download-btn' };
    const documentRef = fakeTreeDocument((selector) =>
        (selectorMatches(selector, anchorIs) ? anchor : null));
    globalThis.document = documentRef;

    const feature = createDownloadUIFeature({
        isWatchPagePath: () => true,
        setTimeoutFn: () => 0,
        clearTimeoutFn: () => {},
        setIntervalFn: () => 0,
        clearIntervalFn: () => {},
        t: (_key, fallback) => fallback,
    });

    feature.downloadHealthPanel._attach();
    assert.ok(inserted, 'with nothing to adopt it has to build one');
    assert.equal(inserted.position, 'afterend');
    assert.equal(inserted.node.getAttribute('role'), 'status');
    assert.equal(inserted.node.getAttribute('aria-live'), 'polite',
        'health changes are announced politely, not assertively');
    assert.ok(inserted.node.getAttribute('aria-label'), 'and the region is named');
});

test('the health panel does not attach off a watch page', () => {
    const documentRef = fakeTreeDocument(() => fakeNode({ tag: 'button' }));
    globalThis.document = documentRef;
    const feature = createDownloadUIFeature({
        isWatchPagePath: () => false,
        setTimeoutFn: () => 0,
        clearTimeoutFn: () => {},
        setIntervalFn: () => 0,
        clearIntervalFn: () => {},
    });
    feature.downloadHealthPanel._attach();
    assert.equal(feature.downloadHealthPanel._container, null,
        'there is no download button to sit beside off /watch');
});

test('every authenticated companion call agrees on the header name', () => {
    // Exhaustive by nature: this is a claim about all call sites, including
    // ones no fixture reaches. X-MDL-Token appears nowhere else in the repo,
    // so a call using it always 401d.
    const authHeaders = Array.from(source.matchAll(/'X-(?:Auth|MDL)-Token'/g)).map((match) => match[0]);
    assert.ok(authHeaders.length >= 3, `expected several authenticated calls, saw ${authHeaders.length}`);
    for (const header of authHeaders) {
        assert.equal(header, "'X-Auth-Token'");
    }
    assert.match(source, /`\$\{MediaDLManager\.baseUrl\(\)\}\/provision-deno`/,
        'hand-concatenating the port bypasses the manager that knows which one is live');

    // The header-name sweep above only sees headers that exist. The call that
    // carried the wrong name is the one most likely to lose the header
    // altogether in a cleanup, so pin that request specifically.
    const at = source.indexOf('/provision-deno`');
    assert.ok(at > 0);
    const request = source.slice(at, at + 200);
    assert.match(request, /'X-Auth-Token': data\.token/,
        'an unauthenticated provision-deno request 401s exactly like the X-MDL-Token one did');
});

test('the Stream Links close button closes only its own panel', () => {
    // This handler was copied from the History panel, which bumps an async
    // request token and clears a debounce timer. Stream Links has neither, and
    // a copied `this._requestToken++` would cancel a History search that
    // happened to be in flight behind it.
    const documentRef = fakeTreeDocument(() => null);
    globalThis.document = documentRef;
    globalThis.window = {
        location: { href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
        addEventListener() {}, removeEventListener() {},
    };

    const feature = createDownloadUIFeature({
        getVideoId: () => 'dQw4w9WgXcQ',
        isWatchPagePath: () => true,
        getPlayerResponseGlobal: () => ({
            videoDetails: { videoId: 'dQw4w9WgXcQ' },
            streamingData: {
                formats: [{ itag: 18, mimeType: 'video/mp4; codecs="avc1"', qualityLabel: '360p', url: 'https://x/1' }],
                adaptiveFormats: [{ itag: 140, mimeType: 'audio/mp4', audioQuality: 'AUDIO_QUALITY_MEDIUM', url: 'https://x/2' }],
            },
        }),
        injectStyle: () => ({ remove() {} }),
        setTimeoutFn: () => 0,
        clearTimeoutFn: () => {},
        setIntervalFn: () => 0,
        clearIntervalFn: () => {},
    });

    const panelFeature = feature.downloadStreamLinksPanel;
    const history = feature.downloadHistoryPanel;
    const tokenBefore = history._requestToken;
    const ownKeysBefore = new Set(Object.keys(panelFeature));

    panelFeature._renderPanel();
    const panel = panelFeature._panel;
    assert.ok(panel, 'the panel opens');

    const close = panel.children.find((node) =>
        String(node.className).includes('ytkit-stream-links-panel__close'));
    assert.ok(close, 'the panel carries a close button');
    close.listeners.get('click').forEach((handler) => handler());

    assert.equal(panelFeature._panel, null, 'the close button closes the panel');
    assert.equal(panel.isConnected, false, 'and takes the node out of the document');
    // The copied handler would run with `this` bound to Stream Links, so it
    // would create `downloadStreamLinksPanel._requestToken` and leave the
    // History panel's own counter untouched. Watching the History counter
    // therefore could not fail; watch this panel's shape instead.
    const grown = Object.keys(panelFeature).filter((key) => !ownKeysBefore.has(key));
    assert.deepEqual(grown, [],
        'Stream Links has no async request token and no search timer; growing one means '
        + 'the History handler was copied in, and with it the state it cancels');
    assert.equal(panelFeature._requestToken, undefined,
        'a request token on this panel is the copied handler, not a feature');
    assert.equal(panelFeature._searchTimer, undefined,
        'and neither is a debounce timer for a panel with no search box');
    assert.equal(history._requestToken, tokenBefore,
        'the History panel is left alone either way');
});

test('every panel that mounts beside the download button uses the shipped anchor selector', () => {
    // Four panels look the anchor up independently: health, stream links,
    // cobalt fallback and history. A narrowing that only misses three of them
    // leaves those three silently unmounted, which is what happened.
    const anchorIs = { tag: 'button', className: 'ytkit-download-btn' };
    const localIs = { tag: 'button', className: 'ytkit-local-dl-btn' };

    const lookups = [...source.matchAll(/document\.querySelector\('([^']*dl-btn[^']*)'\)/g)]
        .map((match) => match[1]);
    assert.ok(lookups.length >= 4,
        `expected every panel's anchor lookup, found ${lookups.length}`);

    for (const selector of lookups) {
        assert.ok(selectorMatches(selector, anchorIs) || selectorMatches(selector, localIs),
            `"${selector}" matches neither download button, so this panel never mounts`);
    }
});
