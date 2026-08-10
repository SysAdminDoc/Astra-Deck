'use strict';

// Card discovery is the whole product for Video Hider: if the scanner does not
// match a card host, no hide button can be attached to it and no filter can
// evaluate it. YouTube moved its feed and sidebar cards to bare
// yt-lockup-view-model hosts with a camelCase thumbnail-anchor class, and the
// v4.58.2 selector list matched ZERO of the sidebar cards — the quick-hide
// button silently disappeared from that surface while every gate stayed green.
//
// This drives the SHIPPED selector lists (parsed out of the module, so
// narrowing them fails here) against markup trimmed from real captures, and
// requires a 100% resolution rate per surface.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MODULE_SOURCE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'extension', 'features', 'video-hider', 'index.js'), 'utf8');

const FIXTURES = [
    {
        label: 'subscriptions feed',
        file: 'subs-collaboration-cards.html',
        // Feed cards wrap a lockup in a ytd-rich-item-renderer.
        cardTag: 'ytd-rich-item-renderer'
    },
    {
        label: 'watch sidebar',
        file: 'watch-sidebar-lockup-cards.html',
        // Sidebar recommendations are BARE lockups with no ytd-* wrapper.
        cardTag: 'yt-lockup-view-model'
    }
];

/** The selector list the shipped scanner uses to find card hosts. */
function shippedCardSelectors() {
    const match = MODULE_SOURCE.match(/_VIDEO_SELECTORS:\s*'([^']+)'/);
    assert.ok(match, 'video-hider must declare _VIDEO_SELECTORS');
    return match[1].split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
}

/** The selector list _findThumbnailContainer walks, in order. */
function shippedThumbnailSelectors() {
    const start = MODULE_SOURCE.indexOf('_findThumbnailContainer(element) {');
    assert.ok(start > -1, 'video-hider must define _findThumbnailContainer');
    const block = MODULE_SOURCE.slice(start, start + 600);
    const match = block.match(/const selectors = \[([^\]]+)\]/);
    assert.ok(match, '_findThumbnailContainer must declare its selector list');
    return match[1].split(',').map((part) => part.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

/** Split a fixture into card blocks starting at each top-level host tag.
 *  Fixtures are TRIMMED captures: element trees are cut mid-way and closing
 *  tags may be absent, so blocks run from one host opening tag to the next
 *  rather than being balanced. */
function splitCards(html, tag) {
    const openRe = new RegExp('<' + tag + '[' + String.fromCharCode(92) + 's>]', 'g');
    const starts = [];
    let match;
    while ((match = openRe.exec(html)) !== null) starts.push(match.index);
    // Drop hosts nested inside an earlier card (a feed card wraps a lockup).
    const topLevel = starts.filter((start, index) => {
        if (index === 0) return true;
        const previous = starts[index - 1];
        const between = html.slice(previous, start);
        // A nested host has no comment separator before it; captured fixtures
        // put one comment per card.
        return between.includes('<!--');
    });
    return topLevel.map((start, index) => {
        const nextStart = topLevel[index + 1];
        return html.slice(start, nextStart === undefined ? html.length : nextStart);
    });
}

/** Does a card block expose a thumbnail container the scanner can find? */
function resolvesThumbnail(cardHtml, selectors) {
    return selectors.some((selector) => {
        if (selector.startsWith('a.')) return cardHtml.includes('class="' + selector.slice(2))
            || cardHtml.includes(' ' + selector.slice(2) + '"')
            || cardHtml.includes(selector.slice(2));
        if (selector.startsWith('#')) return cardHtml.includes('id="' + selector.slice(1) + '"');
        return cardHtml.includes('<' + selector);
    });
}

/** Does a card block expose a video id the scanner can extract? */
function resolvesVideoId(cardHtml) {
    return /content-id-[a-zA-Z0-9_-]+/.test(cardHtml)
        || /[?&]v=[a-zA-Z0-9_-]+/.test(cardHtml)
        || /\/shorts\/[a-zA-Z0-9_-]+/.test(cardHtml)
        || /data-video-id="/.test(cardHtml);
}

for (const fixture of FIXTURES) {
    test(`Video Hider resolves every ${fixture.label} card in a real capture`, () => {
        const html = fs.readFileSync(path.join(__dirname, '..', 'fixtures', fixture.file), 'utf8');
        const cards = splitCards(html, fixture.cardTag);
        assert.ok(cards.length > 0, `fixture ${fixture.file} must contain ${fixture.cardTag} cards`);

        const cardSelectors = shippedCardSelectors();
        const thumbSelectors = shippedThumbnailSelectors();

        assert.ok(cardSelectors.includes(fixture.cardTag),
            `_VIDEO_SELECTORS must scan ${fixture.cardTag} — the ${fixture.label} renders its cards there`);

        const unresolvedThumbnail = cards.filter((card) => !resolvesThumbnail(card, thumbSelectors));
        const unresolvedId = cards.filter((card) => !resolvesVideoId(card));

        assert.equal(unresolvedThumbnail.length, 0,
            `${unresolvedThumbnail.length}/${cards.length} ${fixture.label} cards expose no thumbnail container the `
            + 'scanner can find, so no hide button can mount on them');
        assert.equal(unresolvedId.length, 0,
            `${unresolvedId.length}/${cards.length} ${fixture.label} cards expose no extractable video id`);
    });
}

test('the shipped thumbnail lookup knows the camelCase lockup anchor', () => {
    const selectors = shippedThumbnailSelectors();
    assert.ok(selectors.includes('a.ytLockupViewModelContentImage'),
        'current lockup cards carry the camelCase anchor class; dropping it blinds the sidebar');
    assert.ok(selectors.includes('a.yt-lockup-view-model__content-image'),
        'the older BEM anchor must stay for cards YouTube has not migrated');
});
