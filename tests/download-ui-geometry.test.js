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
const { fakeNode, fakeTreeDocument } = require('./helpers/monolith');

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

    const documentRef = fakeTreeDocument((selector) =>
        (String(selector).includes('dl-btn') || String(selector).includes('download-btn') ? anchor : null));
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

    const documentRef = fakeTreeDocument((selector) =>
        (String(selector).includes('dl-btn') || String(selector).includes('download-btn') ? anchor : null));
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
});
