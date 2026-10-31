'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fakeNode, fakeTreeDocument, loadFeature } = require('../helpers/monolith');

function preciseDateFixture() {
    const anchor = fakeNode({ tag: 'span', text: 'Streamed live on Aug 23, 2026' });
    const row = fakeNode({ tag: 'div', children: [anchor] });
    const preciseCounts = [];
    const documentRef = fakeTreeDocument((selector) => {
        if (selector.includes('#info-strings')) return [anchor];
        if (selector === '[data-ytkit-precise]') return preciseCounts;
        return null;
    });
    const feature = loadFeature('preciseViewCounts', {
        document: documentRef,
        _rw: {
            ytInitialPlayerResponse: {
                videoDetails: { videoId: 'dQw4w9WgXcQ' },
                microformat: {
                    playerMicroformatRenderer: {
                        liveBroadcastDetails: { startTimestamp: '2026-08-23T14:30:00Z' }
                    }
                }
            }
        },
        getVideoId: () => 'dQw4w9WgXcQ',
        YTKitCore: {
            parseYouTubeDate: (value) => new Date(value),
            formatAbsoluteYouTubeDate: () => 'August 23, 2026 at 10:30 AM'
        }
    });
    return { feature, anchor, row, preciseCounts };
}

test('precise watch metadata attaches one accessible exact date beside the native date', () => {
    const { feature, anchor, row } = preciseDateFixture();

    feature._renderExactUploadDate();
    feature._renderExactUploadDate();

    assert.equal(row.children.length, 2, 're-rendering replaces the prior exact date');
    assert.equal(row.children[0], anchor);
    const exact = row.children[1];
    assert.equal(exact.className, 'ytkit-exact-upload-date');
    assert.equal(exact.textContent, '(August 23, 2026 at 10:30 AM)');
    assert.equal(exact.title, 'August 23, 2026 at 10:30 AM');
    assert.equal(exact.getAttribute('aria-label'), 'August 23, 2026 at 10:30 AM');
    assert.equal(exact.getAttribute('translate'), 'no');
    assert.equal(exact.parentElement, row);
});

test('precise watch metadata teardown removes its date and restores the native count', () => {
    const { feature, row, preciseCounts } = preciseDateFixture();
    const count = fakeNode({ tag: 'span', text: '1,234,567 views' });
    count.dataset.ytkitPrecise = '1';
    count.dataset.ytkitPreciseOriginal = '1.2M views';
    preciseCounts.push(count);
    feature._renderExactUploadDate();

    feature.destroy();

    assert.equal(row.children.length, 1);
    assert.equal(feature._dateEl, null);
    assert.equal(count.textContent, '1.2M views');
    assert.equal(count.dataset.ytkitPrecise, undefined);
    assert.equal(count.dataset.ytkitPreciseOriginal, undefined);
});

test('video age cards render an approximate absolute date and restore the native metadata', () => {
    const date = fakeNode({
        tag: 'span',
        text: '3 days ago',
        attributes: { title: 'Uploaded recently', 'aria-label': '3 days ago' }
    });
    const meta = fakeNode({ tag: 'div', children: [date] });
    meta.querySelectorAll = () => [date];
    const documentRef = fakeTreeDocument((selector) => {
        if (selector === '[data-ytkit-absolute-date]') return [date];
        if (selector === '[data-ytkit-age]') return [];
        return null;
    });
    const feature = loadFeature('videoAgeColors', {
        document: documentRef,
        location: { pathname: '/' },
        YTKitCore: {
            parseRelativeYouTubeAge: () => ({ amount: 3, unit: 'day' }),
            formatApproximateYouTubeDate: () => 'August 20, 2026'
        }
    });

    feature._decorateAbsoluteDate(meta);

    assert.equal(date.textContent, '\u2248 August 20, 2026');
    assert.equal(date.getAttribute('aria-label'), '\u2248 August 20, 2026');
    assert.match(date.title, /3 days ago/);
    assert.equal(date.getAttribute('translate'), 'no');

    feature.destroy();

    assert.equal(date.textContent, '3 days ago');
    assert.equal(date.title, 'Uploaded recently');
    assert.equal(date.getAttribute('aria-label'), '3 days ago');
    assert.equal(date.hasAttribute('data-ytkit-absolute-date'), false);
    assert.equal(date.hasAttribute('translate'), false);
});

// A fresh load answers from the player response. After an in-app navigation that
// response is refused as stale, so the page tags decide, and they used to be read
// without asking which video they describe: every later video showed the first
// one's date, live on 2026-10-31.
function loadDateCore() {
    const context = { Intl };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'date-time.js'), 'utf8'), context);
    return context.YTKitCore;
}

function afterInAppNavigation(featureId, blocks) {
    const link = fakeNode({ tag: 'link', attributes: { href: 'https://www.youtube.com/watch?v=firstVideo' } });
    const meta = fakeNode({ tag: 'meta', attributes: { content: '2026-06-20' } });
    const holder = fakeNode({ tag: 'div', children: [meta, link] });
    holder.querySelector = (selector) => (selector.includes('itemprop="url"') ? link : null);
    const documentRef = fakeTreeDocument((selector) => {
        if (selector.includes('ld+json')) return blocks.map((block) => ({ textContent: JSON.stringify(block) }));
        if (selector.includes('datePublished')) return meta;
        return null;
    });
    return loadFeature(featureId, {
        document: documentRef,
        _rw: { ytInitialPlayerResponse: null },
        getVideoId: () => 'secondVideo',
        isWatchPagePath: () => true,
        YTKitCore: loadDateCore()
    });
}

const secondVideoBlock = { '@type': 'VideoObject', uploadDate: '2026-10-24T09:00:00-07:00', embedUrl: 'https://www.youtube.com/embed/secondVideo' };

test('the exact date never shows the date of the first video in the tab', () => {
    assert.equal(afterInAppNavigation('preciseViewCounts', [])._getUploadDateValue(), null,
        'nothing names this video yet, so no date');
    assert.equal(afterInAppNavigation('preciseViewCounts', [secondVideoBlock])._getUploadDateValue(), secondVideoBlock.uploadDate);
});

test('the age badge never shows the age of the first video in the tab', () => {
    const noDateText = fakeNode({ tag: 'span', text: 'no date here' });
    assert.equal(afterInAppNavigation('channelAgeDisplay', [])._getPublishDate(noDateText), null,
        'nothing names this video and the page text has no date, so no badge');
    assert.equal(afterInAppNavigation('channelAgeDisplay', [secondVideoBlock])._getPublishDate(noDateText).toISOString().slice(0, 10), '2026-10-24');
});
