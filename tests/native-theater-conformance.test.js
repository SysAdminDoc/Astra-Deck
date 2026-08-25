'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    nativeTheaterFailures,
    watchModeFailures
} = require('../scripts/smoke-zero-ads-live');

function modeState(mode = 'normal') {
    const native = mode === 'native-theater';
    const split = mode === 'theater-split';
    return {
        mode,
        theater: native,
        splitActive: split,
        splitOpen: split,
        splitWrapper: split,
        sizeButton: true,
        fullscreen: false,
        staleGeometry: [],
        playerRect: {
            top: 0,
            right: 1440,
            bottom: 810,
            left: 0,
            width: 1440,
            height: 810
        },
        metadataRect: {
            top: 810,
            right: 1040,
            bottom: 1030,
            left: 40,
            width: 1000,
            height: 220
        },
        playerMetadataOverlap: 0,
        viewport: { width: 1440, height: 900 },
        fullBleedContainers: [
            {
                selector: '#full-bleed-container',
                exists: true,
                visible: true,
                pageToken: '#07090d',
                textToken: '#f1f5f9',
                watchCanvas: '#07090d',
                watchText: '#f1f5f9'
            },
            {
                selector: '#player-full-bleed-container',
                exists: true,
                visible: true,
                pageToken: '#07090d',
                textToken: '#f1f5f9',
                watchCanvas: '#07090d',
                watchText: '#f1f5f9'
            }
        ]
    };
}

function readable(selector, text = 'Readable surface') {
    return { selector, text, contrast: 8, width: 320, height: 40 };
}

function theaterDetails() {
    return {
        available: true,
        visible: true,
        colorScheme: 'dark',
        modeState: modeState('native-theater'),
        scroll: { top: 810, height: 2400, clientHeight: 900 },
        supportSurface: { type: 'related', ...readable('#secondary #related #video-title') },
        surfaces: [
            readable('ytd-watch-metadata h1, ytd-watch-metadata #title', 'Video title and channel'),
            readable('ytd-comment-view-model #author-text, ytd-comment-renderer #author-text', 'Channel name'),
            readable('ytd-comment-view-model #content-text, ytd-comment-renderer #content-text', 'Comment body')
        ]
    };
}

test('watch mode validator distinguishes normal, native Theater, and Theater Split', () => {
    assert.deepEqual(watchModeFailures(modeState('normal'), 'normal'), []);
    assert.deepEqual(watchModeFailures(modeState('native-theater'), 'native-theater'), []);
    assert.deepEqual(watchModeFailures(modeState('theater-split'), 'theater-split'), []);

    const staleNormal = modeState('normal');
    staleNormal.staleGeometry.push('#movie_player:width=100%!important');
    assert.match(watchModeFailures(staleNormal, 'normal').join('\n'), /stale Theater Split geometry/);

    const crossedModes = modeState('theater-split');
    crossedModes.theater = true;
    assert.match(watchModeFailures(crossedModes, 'theater-split').join('\n'), /unexpectedly toggled native Theater/);
});

test('native Theater validator requires themed full-bleed geometry and reachable reading surfaces', () => {
    const valid = theaterDetails();
    assert.deepEqual(nativeTheaterFailures(valid, 'dark Theater', 'dark'), []);

    const unthemed = theaterDetails();
    unthemed.modeState.fullBleedContainers[0].pageToken = '';
    assert.match(nativeTheaterFailures(unthemed, 'dark Theater', 'dark').join('\n'), /missing watch-theme tokens/);

    const overlapping = theaterDetails();
    overlapping.modeState.playerMetadataOverlap = 400;
    assert.match(nativeTheaterFailures(overlapping, 'dark Theater', 'dark').join('\n'), /overlaps metadata/);

    const unreadable = theaterDetails();
    unreadable.surfaces[2].contrast = 2.1;
    assert.match(nativeTheaterFailures(unreadable, 'dark Theater', 'dark').join('\n'), /rendered comment text is not readable/);

    const trapped = theaterDetails();
    trapped.scroll.top = 0;
    assert.match(nativeTheaterFailures(trapped, 'dark Theater', 'dark').join('\n'), /scrolling cannot reach/);

    const noSecondarySurface = theaterDetails();
    noSecondarySurface.supportSurface = null;
    assert.match(nativeTheaterFailures(noSecondarySurface, 'dark Theater', 'dark').join('\n'), /related videos or live chat/);

    const hiddenSecondarySurface = theaterDetails();
    hiddenSecondarySurface.supportSurface.width = 0;
    assert.match(nativeTheaterFailures(hiddenSecondarySurface, 'dark Theater', 'dark').join('\n'), /related videos or live chat/);

    const emptyComments = theaterDetails();
    emptyComments.surfaces = [
        readable('ytd-watch-metadata h1 yt-formatted-string, ytd-watch-metadata h1', 'Video title'),
        readable('ytd-comments-header-renderer #count', '0 Comments'),
        readable('ytd-comments-header-renderer #sort-menu', 'Sort comments')
    ];
    assert.deepEqual(nativeTheaterFailures(emptyComments, 'dark Theater', 'dark'), [],
        'a readable empty-comments state is valid evidence when the video has no comment bodies');
});
