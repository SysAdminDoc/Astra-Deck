'use strict';

// YouTube's playlist page can render rows as lockups and its header as a page-header
// view model, with no ytd-playlist-video-renderer on the page. These stubs answer a
// selector list the way a real row does: with the first selector naming a part it has.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadDeclarations, loadFeature } = require('../helpers/monolith');

const getVideoId = (href) => /[?&]v=([\w-]{11})/.exec(href || '')?.[1] || null;

function stubRow(parts, extra = {}) {
    const row = {
        style: {},
        dataset: {},
        ...extra,
        querySelector(list) {
            for (const selector of list.split(',').map((part) => part.trim())) {
                if (parts[selector]) return parts[selector];
            }
            return null;
        },
        querySelectorAll: () => [],
        getAttribute: () => null
    };
    return row;
}

function clickable(extra = {}) {
    return { clicked: 0, click() { this.clicked += 1; }, ...extra };
}

function lockupRow({ id = 'GvgqDSnpRQM', title = 'Andrew Willis', watched = null, menu = clickable() } = {}) {
    const parts = {
        'a.ytLockupMetadataViewModelTitle': { href: `https://www.youtube.com/watch?v=${id}&list=PLx&index=1`, textContent: ` ${title} ` },
        'yt-content-metadata-view-model a[href^="/@"]': { textContent: 'Google Search Stories' },
        '.ytBadgeShapeText': { textContent: '1:30' },
        '.ytLockupMetadataViewModelMenuButton button': menu
    };
    if (watched !== null) {
        parts['.ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment'] = { style: { width: `${watched}%` }, getAttribute: () => null };
    }
    return stubRow(parts);
}

function fakeDocument(answers, extra = {}) {
    return {
        createElement: () => ({ style: {}, dataset: {}, setAttribute() {}, addEventListener() {} }),
        querySelector: () => null,
        querySelectorAll(selector) {
            for (const [marker, nodes] of answers) {
                if (selector.includes(marker)) return nodes;
            }
            return [];
        },
        ...extra
    };
}

const rendered = (extra = {}) => ({
    appended: [],
    getClientRects: () => [{}],
    querySelector: () => null,
    appendChild(child) { this.appended.push(child); },
    ...extra
});
const hidden = (extra = {}) => rendered({ getClientRects: () => [], ...extra });

function helpers(document) {
    return loadDeclarations(
        ['PLAYLIST_PAGE', 'PLAYLIST_PAGE_ROW_SELECTOR', 'PLAYLIST_ROW_MENU_BUTTON_SELECTOR', 'PLAYLIST_MENU_ITEM_SELECTOR', 'firstRenderedIn', 'findPlaylistPageActionsHost', 'readPlaylistPageRow'],
        { getVideoId, document }
    );
}

function featureGlobals(document) {
    const { globalThis: _sandbox, ...declared } = helpers(document);
    return { ...declared, getVideoId, document };
}

test('a lockup row reads the same way as a legacy row', () => {
    const { readPlaylistPageRow } = helpers();
    const lockup = readPlaylistPageRow(lockupRow({ watched: 56 }));
    assert.equal(lockup.videoId, 'GvgqDSnpRQM');
    assert.equal(lockup.title, 'Andrew Willis');
    assert.equal(lockup.channel, 'Google Search Stories');
    assert.equal(lockup.durationText, '1:30');
    assert.equal(lockup.watchedPct, 56);

    const legacy = readPlaylistPageRow(stubRow({
        'a#video-title': { href: 'https://www.youtube.com/watch?v=V4DDt30Aat4&list=PLx', textContent: 'Mark Lesek' },
        'ytd-channel-name a': { textContent: 'Channel' },
        'ytd-thumbnail-overlay-time-status-renderer': { textContent: ' 2:39 ' },
        '#progress': { style: { width: '100%' } }
    }));
    assert.equal(legacy.videoId, 'V4DDt30Aat4');
    assert.equal(legacy.title, 'Mark Lesek');
    assert.equal(legacy.channel, 'Channel');
    assert.equal(legacy.durationText, '2:39');
    assert.equal(legacy.watchedPct, 100);
});

test('a deleted lockup row has no title, but its thumbnail link still names the video', () => {
    const { readPlaylistPageRow } = helpers();
    const row = readPlaylistPageRow(stubRow({
        'a[href*="/watch"]': { href: 'https://www.youtube.com/watch?v=fIc_VEQ7Vo0&list=PLx&index=2' }
    }));
    assert.equal(row.videoId, 'fIc_VEQ7Vo0');
    assert.equal(row.title, '');
    assert.equal(row.channel, '');
    assert.equal(row.durationText, '');
    assert.equal(row.watchedPct, 0);
});

test('only lockups on a playlist page count as playlist rows', () => {
    const { PLAYLIST_PAGE_ROW_SELECTOR } = helpers();
    const parts = PLAYLIST_PAGE_ROW_SELECTOR.split(',').map((part) => part.trim());
    assert.ok(parts.includes('ytd-playlist-video-renderer'));
    assert.ok(parts.includes('ytd-browse[page-subtype="playlist"] yt-lockup-view-model'));
    assert.ok(!parts.includes('yt-lockup-view-model'), 'a home feed lockup is not a playlist row');
});

test('the duration lands on the rendered header, not the hidden sidebar left in the DOM', () => {
    const sidebar = hidden();
    const header = rendered();
    const document = fakeDocument([
        ['.ytBadgeShapeText', [{ textContent: '1:30' }, { textContent: ' 2:30 ' }, { textContent: 'LIVE' }]],
        ['yt-page-header-renderer', [sidebar, header]]
    ]);
    const feature = loadFeature('showPlaylistDuration', {
        ...featureGlobals(document),
        formatDuration: (seconds) => `${seconds}s`,
        getMainVideoElement: () => null
    });
    feature._calculate();
    assert.equal(sidebar.appended.length, 0);
    assert.equal(header.appended.length, 1);
    assert.equal(header.appended[0].textContent, '240s');
});

test('no rendered header means no badge yet, so the mutation rule can try again', () => {
    const sidebar = hidden();
    const document = fakeDocument([
        ['.ytBadgeShapeText', [{ textContent: '1:30' }]],
        ['yt-page-header-renderer', [sidebar]]
    ]);
    const feature = loadFeature('showPlaylistDuration', {
        ...featureGlobals(document),
        formatDuration: (seconds) => `${seconds}s`,
        getMainVideoElement: () => null
    });
    feature._calculate();
    assert.equal(sidebar.appended.length, 0);
});

test('the Watch Later tools take their button host from the rendered header', () => {
    const stale = hidden();
    const host = rendered();
    const { findPlaylistPageActionsHost } = helpers(fakeDocument([['yt-flexible-actions-view-model', [stale, host]]]));
    assert.ok(findPlaylistPageActionsHost() === host);
});

test('Quick Remove adds its button to lockup rows once', () => {
    const row = lockupRow();
    row.appended = [];
    row.appendChild = (child) => row.appended.push(child);
    const document = fakeDocument([['yt-lockup-view-model', [row]]], { querySelector: () => ({}) });
    const feature = loadFeature('playlistQuickRemove', featureGlobals(document));
    feature._attachOverlays();
    feature._attachOverlays();
    assert.equal(row.appended.length, 1);
    assert.equal(row.dataset.ytkitQr, '1');
});

test('Quick Remove leaves the rows of someone else\'s playlist alone', () => {
    const row = lockupRow();
    row.appended = [];
    row.appendChild = (child) => row.appended.push(child);
    const document = fakeDocument([['yt-lockup-view-model', [row]]]);
    const feature = loadFeature('playlistQuickRemove', featureGlobals(document));
    feature._attachOverlays();
    assert.equal(row.appended.length, 0);
});

test('Remove Watched takes only watched lockup rows through their own menu', async () => {
    const done = clickable();
    const unwatched = clickable();
    const partly = clickable();
    const removeItem = clickable({ textContent: 'Remove from Watch later' });
    const document = fakeDocument([
        ['yt-list-item-view-model', [removeItem]],
        ['yt-lockup-view-model', [
            lockupRow({ watched: 95, menu: done }),
            lockupRow({ watched: 40, menu: partly }),
            lockupRow({ menu: unwatched })
        ]]
    ], { body: { click() {} } });
    const feature = loadFeature('watchLaterCleanup', featureGlobals(document));
    const btn = { disabled: false, textContent: '' };
    await feature._removeWatched(btn);
    assert.equal(done.clicked, 1);
    assert.equal(partly.clicked, 0);
    assert.equal(unwatched.clicked, 0);
    assert.equal(removeItem.clicked, 1);
});

test('the Workbench scans lockup rows and removes one through its view-model menu', async () => {
    const menu = clickable();
    const row = lockupRow({ id: 'XDgC4FMftpg', title: 'Mark Kempton', watched: 100, menu });
    const document = fakeDocument([['yt-lockup-view-model', [row]]]);
    const feature = loadFeature('watchLaterWorkbench', featureGlobals(document));
    feature._ageCacheFor = () => null;
    const rows = feature._scanRows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].videoId, 'XDgC4FMftpg');
    assert.equal(rows[0].title, 'Mark Kempton');
    assert.equal(rows[0].channel, 'Google Search Stories');
    assert.equal(rows[0].durationSec, 90);
    assert.equal(rows[0].durationKnown, true);
    assert.equal(rows[0].watchedPct, 100);

    const item = clickable({ textContent: 'Remove from Watch later', matches: () => false, closest: () => null });
    const dropdown = { querySelector: () => item, querySelectorAll: () => [item] };
    let opened = false;
    feature._openDropdown = () => (opened ? dropdown : null);
    menu.click = function click() { this.clicked += 1; opened = true; };
    feature._PACE_MS = 0;
    const removed = await feature._removeRow(rows[0]);
    assert.equal(removed, true);
    assert.equal(menu.clicked, 1);
    assert.equal(item.clicked, 1);
});

test('the Workbench reads a lockup age from its label, since the text is abbreviated', () => {
    const feature = loadFeature('watchLaterWorkbench', featureGlobals(fakeDocument([])));
    const row = lockupRow();
    row.querySelectorAll = (selector) => (selector.includes('yt-content-metadata-view-model')
        ? [{ getAttribute: () => '2.6 million views' }, { getAttribute: () => '13 years ago' }]
        : []);
    assert.equal(feature._publishedValue(row), '13 years ago');
});
