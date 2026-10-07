'use strict';

// The "most replayed" heatmap YouTube already ships in the player response.
//
// Two payload shapes exist in the wild and which one arrives depends on the
// session's A/B bucket, so both are parsed. The rate resolver is the half
// that can do damage: it writes the user's playback speed, and the rule that
// matters is that it refuses to guess — an uncovered position returns null
// and the caller leaves the rate alone rather than snapping to 1x.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

function loadHeatmap() {
    globalThis.YTKitCore = {};
    const src = fs.readFileSync(path.join(repoRoot, 'extension/core/heatmap.js'), 'utf8');
    (0, eval)(src);
    return globalThis.YTKitCore;
}

function entityBatchResponse(markers) {
    return {
        frameworkUpdates: {
            entityBatchUpdate: {
                mutations: [
                    // A non-heatmap marker list sits ahead of the real one on
                    // real payloads (chapters), so the parser has to skip it.
                    { payload: { macroMarkersListEntity: { markersList: { markerType: 'MARKER_TYPE_CHAPTER', markers: [] } } } },
                    {
                        payload: {
                            macroMarkersListEntity: {
                                markersList: { markerType: 'MARKER_TYPE_HEATMAP', markers }
                            }
                        }
                    }
                ]
            }
        }
    };
}

function decoratedBarData(heatMarkers) {
    return {
        playerOverlays: {
            decoratedPlayerBarRenderer: {
                playerBar: {
                    multiMarkersPlayerBarRenderer: {
                        markersMap: [
                            { value: { chapters: [] } },
                            { value: { heatmap: { heatmapRenderer: { heatMarkers } } } }
                        ]
                    }
                }
            }
        }
    };
}

function evenMarkers(intensities, stepMillis = 10000) {
    return intensities.map((intensity, index) => ({
        startMillis: index * stepMillis,
        durationMillis: stepMillis,
        intensityScoreNormalized: intensity
    }));
}

test('the entity-batch payload shape parses into normalized seconds', () => {
    const core = loadHeatmap();
    const markers = core.parseHeatmapMarkers(
        entityBatchResponse(evenMarkers([0.1, 0.2, 0.9, 0.3, 0.15]))
    );
    assert.equal(markers.length, 5);
    assert.deepEqual(markers[0], { startSeconds: 0, durationSeconds: 10, intensity: 0.1 });
    assert.equal(markers[2].startSeconds, 20);
});

test('the decorated-player-bar payload shape parses to the same normalized form', () => {
    const core = loadHeatmap();
    const heatMarkers = [0.2, 0.4, 0.95, 0.3, 0.1].map((intensity, index) => ({
        heatMarkerRenderer: {
            timeRangeStartMillis: index * 5000,
            markerDurationMillis: 5000,
            heatMarkerIntensityScoreNormalized: intensity
        }
    }));
    const markers = core.parseHeatmapMarkers(decoratedBarData(heatMarkers));
    assert.equal(markers.length, 5);
    assert.deepEqual(markers[2], { startSeconds: 10, durationSeconds: 5, intensity: 0.95 });
});

test('a video without a heatmap yields nothing rather than an empty-looking curve', () => {
    const core = loadHeatmap();
    assert.deepEqual(core.parseHeatmapMarkers(null), []);
    assert.deepEqual(core.parseHeatmapMarkers({}), []);
    assert.deepEqual(core.parseHeatmapMarkers(entityBatchResponse([])), []);
    // Below the useful-marker floor the curve is too coarse to steer with.
    assert.deepEqual(core.parseHeatmapMarkers(entityBatchResponse(evenMarkers([0.5, 0.6]))), []);
});

test('malformed markers are dropped, not trusted', () => {
    const core = loadHeatmap();
    const markers = core.parseHeatmapMarkers(entityBatchResponse([
        { startMillis: 0, durationMillis: 1000, intensityScoreNormalized: 0.5 },
        { startMillis: 'x', durationMillis: 1000, intensityScoreNormalized: 0.5 },
        { startMillis: 1000, durationMillis: 0, intensityScoreNormalized: 0.5 },
        { startMillis: 2000, durationMillis: 1000 },
        { startMillis: 3000, durationMillis: 1000, intensityScoreNormalized: 0.7 },
        { startMillis: 4000, durationMillis: 1000, intensityScoreNormalized: 0.8 },
        { startMillis: 5000, durationMillis: 1000, intensityScoreNormalized: 1.9 }
    ]));
    assert.equal(markers.length, 4);
    assert.equal(markers[3].intensity, 1, 'an out-of-range score is clamped, not propagated');
});

test('markers come back in play order regardless of payload order', () => {
    const core = loadHeatmap();
    const markers = core.parseHeatmapMarkers(entityBatchResponse([
        { startMillis: 30000, durationMillis: 10000, intensityScoreNormalized: 0.2 },
        { startMillis: 0, durationMillis: 10000, intensityScoreNormalized: 0.4 },
        { startMillis: 20000, durationMillis: 10000, intensityScoreNormalized: 0.9 },
        { startMillis: 10000, durationMillis: 10000, intensityScoreNormalized: 0.1 }
    ]));
    assert.deepEqual(markers.map((m) => m.startSeconds), [0, 10, 20, 30]);
});

test('the most-replayed peak is the highest marker, and a tie goes to the earlier one', () => {
    const core = loadHeatmap();
    const markers = core.parseHeatmapMarkers(entityBatchResponse(evenMarkers([0.1, 0.9, 0.3, 0.9, 0.2])));
    const peak = core.findMostReplayed(markers);
    assert.equal(peak.startSeconds, 10,
        'sending the viewer to the FIRST equally-replayed moment is the answer that skips nothing');
});

test('the opening spike where every viewer starts is not the most-replayed moment', () => {
    const core = loadHeatmap();
    // The shape Gangnam Style's live curve had: full intensity at 0:00,
    // falling away, then the real peak later on.
    const spike = core.parseHeatmapMarkers(entityBatchResponse(evenMarkers([1, 0.4, 0.2, 0.55, 0.3])));
    assert.equal(core.findMostReplayed(spike).startSeconds, 30,
        'jumping to 0:00 moves nobody anywhere');
    const flat = core.parseHeatmapMarkers(entityBatchResponse(evenMarkers([1, 0.8, 0.6, 0.6, 0.2])));
    assert.equal(core.findMostReplayed(flat).startSeconds, 0,
        'a curve that never rises again really does peak at the start');
    const rising = core.parseHeatmapMarkers(entityBatchResponse(evenMarkers([0.3, 1, 0.2, 0.9, 0.1])));
    assert.equal(core.findMostReplayed(rising).startSeconds, 10);
});

test('smart speed leaves the user rate alone through hot regions and lifts it through cold ones', () => {
    const core = loadHeatmap();
    const markers = core.parseHeatmapMarkers(entityBatchResponse(evenMarkers([0.05, 0.9, 0.1, 0.8, 0.05])));
    const options = { baseRate: 1.25, coldRate: 2, hotThreshold: 0.4 };

    assert.equal(core.resolveHeatmapRate(markers, 5, options), 2, 'a cold region speeds up');
    assert.equal(core.resolveHeatmapRate(markers, 15, options), 1.25,
        'a most-replayed moment plays at exactly the speed the user chose');
    assert.equal(core.resolveHeatmapRate(markers, 35, options), 1.25);
});

test('smart speed never speeds up a hot region, even when the cold rate is lower than the base', () => {
    const core = loadHeatmap();
    const markers = core.parseHeatmapMarkers(entityBatchResponse(evenMarkers([0.05, 0.9, 0.05, 0.9, 0.05])));
    // A user watching at 2x with a 1.5x cold rate must never be SLOWED down:
    // the feature exists to skip the boring parts, not to override a speed.
    const rate = core.resolveHeatmapRate(markers, 5, { baseRate: 2, coldRate: 1.5 });
    assert.equal(rate, 2, 'the cold rate is a floor of the base rate, never a ceiling');
});

test('an uncovered position returns null so the caller leaves the rate alone', () => {
    const core = loadHeatmap();
    const markers = core.parseHeatmapMarkers(entityBatchResponse(evenMarkers([0.1, 0.9, 0.2, 0.3, 0.4])));
    assert.equal(core.resolveHeatmapRate([], 5, { baseRate: 1 }), null,
        'no heatmap must not be read as "reset to 1x"');
    assert.equal(core.resolveHeatmapRate(markers, -1, { baseRate: 1 }), null);
});

test('the tail past the last marker keeps the last region rather than dropping to no data', () => {
    const core = loadHeatmap();
    const markers = core.parseHeatmapMarkers(entityBatchResponse(evenMarkers([0.9, 0.9, 0.9, 0.9, 0.02])));
    // Without this the final second of every video would snap the speed back.
    assert.equal(core.resolveHeatmapRate(markers, 49.999, { baseRate: 1, coldRate: 2 }), 2);
    assert.equal(core.resolveHeatmapRate(markers, 60, { baseRate: 1, coldRate: 2 }), 2);
});

test('the summary reports the peak position for diagnostics', () => {
    const core = loadHeatmap();
    const markers = core.parseHeatmapMarkers(entityBatchResponse(evenMarkers([0.1, 0.2, 0.85, 0.3, 0.1])));
    const summary = core.summarizeHeatmap(markers);
    assert.equal(summary.markers, 5);
    assert.equal(summary.peakSeconds, 20);
    assert.equal(summary.peakIntensity, 0.85);
    assert.equal(summary.coveredSeconds, 50);
    assert.deepEqual(core.summarizeHeatmap([]), {
        markers: 0, peakSeconds: null, peakIntensity: 0, coveredSeconds: 0
    });
});

// ── the features that consume it ──

test('both heatmap features hide themselves when the video has no heatmap', () => {
    const ytkit = fs.readFileSync(path.join(repoRoot, 'extension/ytkit.js'), 'utf8');
    const start = ytkit.indexOf("id: 'jumpToMostReplayed'");
    assert.ok(start > -1, 'jumpToMostReplayed must exist');
    const end = ytkit.indexOf("id: 'persistentSpeed'", start);
    const body = ytkit.slice(start, end);

    assert.match(body, /if \(!this\._markers\.length\) \{\s*\n\s*this\._removeButton\(\);/,
        'a video without heatmap data must not get a dead button');
    // This used to pin `parseHeatmapMarkers(_rw.ytInitialPlayerResponse)`, a
    // call on a name ytkit.js never bound, so the pin held the bug in place.
    // The navigation copy joined the list as a third source; the first two
    // keep their order.
    assert.equal((body.match(/heatmapMarkersFor\(getVideoId\(\), _rw\.ytInitialPlayerResponse, _rw\.ytInitialData, _rw\.navigatedPageData\)/g) || []).length, 2,
        'both features read the player response first, initial data second, then the navigation copy, for the playing video only');
    const destructure = ytkit.slice(ytkit.indexOf('const {'), ytkit.indexOf('} = globalThis.YTKitCore || {};'));
    for (const name of ['findMostReplayed', 'heatmapMarkersFor', 'resolveHeatmapRate']) {
        assert.match(destructure, new RegExp(`\\b${name},`), `${name} must be bound from YTKitCore`);
    }
});

test('smart speed writes through setProgrammaticPlaybackRate so it cannot clobber a saved speed', () => {
    const ytkit = fs.readFileSync(path.join(repoRoot, 'extension/ytkit.js'), 'utf8');
    const start = ytkit.indexOf("id: 'heatmapSmartSpeed'");
    assert.ok(start > -1, 'heatmapSmartSpeed must exist');
    const end = ytkit.indexOf("id: 'persistentSpeed'", start);
    const body = ytkit.slice(start, end);

    // Writing video.playbackRate directly would look like a USER speed change
    // to persistentSpeed and perChannelSpeed, which watch for exactly that -
    // and the saved speed would be overwritten with a cold-region rate.
    assert.match(body, /setProgrammaticPlaybackRate\(video, target\)/);
    assert.doesNotMatch(body, /video\.playbackRate\s*=/,
        'a raw playbackRate write would be mistaken for a user speed change');
    assert.match(body, /isProgrammaticPlaybackRateChange\(\)/,
        'a speed the user picks mid-video must re-base the feature, not be overwritten');
    assert.match(body, /_ownsRate\?\.\(video\)/,
        'live catch-up owns the rate when it is active');
    assert.match(body, /_restoreBaseRate\(\)/,
        'leaving a video or disabling the feature must give the user their speed back');
});

test('the new keys are declared, defaulted off, and localizable', () => {
    const schema = fs.readFileSync(path.join(repoRoot, 'extension/core/settings-schema.js'), 'utf8');
    for (const key of ['jumpToMostReplayed', 'heatmapSmartSpeed', 'heatmapSmartSpeedColdRate']) {
        assert.ok(schema.includes(`key: "${key}"`), `${key} must be in the settings schema`);
    }
    assert.match(schema, /key: "heatmapSmartSpeed", [^\n]*defaultValue: false/,
        'a feature that rewrites playback speed must be opt-in');
    assert.match(schema, /key: "heatmapSmartSpeedColdRate", [^\n]*min: 1, max: 4/,
        'the cold rate must be bounded so it cannot be set to something unplayable');

    const messages = JSON.parse(
        fs.readFileSync(path.join(repoRoot, 'extension/_locales/en/messages.json'), 'utf8')
    );
    for (const key of ['heatmapJumpAria', 'heatmapJumpedToast']) {
        assert.ok(messages[key]?.message, `${key} must be localizable`);
    }
});

// The A/B fallback the runtime claims to have.
//
// `_readMarkers` in ytkit.js offers the parser two sources with the comment
// "the curve can arrive on either object depending on the A/B bucket, so both
// are offered and the parser picks". The second source was `_rw.ytInitialData`,
// and `_rw` exposed only `ytInitialPlayerResponse`, so that branch handed the
// parser `undefined` on every call and had never once produced a marker.

const { loadFeature } = require('./helpers/monolith');

const PLAYING = 'abc12345678';

function heatmapPayload(count = 5, videoId = PLAYING) {
    return {
        frameworkUpdates: { entityBatchUpdate: { mutations: [{
            payload: { macroMarkersListEntity: { externalVideoId: videoId, markersList: {
                markerType: 'MARKER_TYPE_HEATMAP',
                markers: Array.from({ length: count }, (_, index) => ({
                    startMillis: String(index * 10000),
                    durationMillis: '10000',
                    intensityScoreNormalized: index === 2 ? 1 : 0.2
                }))
            } } }
        }] } }
    };
}

// The sandbox gets the helper under the name ytkit.js binds from YTKitCore.
// These tests used to inject `parseHeatmapMarkers` by name, which ytkit.js
// never bound, and so passed while the shipped feature could not find a curve.
function heatmapFeature(id, _rw, videoId = PLAYING) {
    return loadFeature(id, {
        heatmapMarkersFor: loadHeatmap().heatmapMarkersFor,
        getVideoId: () => videoId,
        _rw
    });
}

test('the curve is read from ytInitialData when the player response has none', () => {
    const feature = heatmapFeature('jumpToMostReplayed', {
        ytInitialPlayerResponse: { videoDetails: { videoId: PLAYING } },
        ytInitialData: heatmapPayload()
    });

    const markers = feature._readMarkers();

    assert.equal(markers.length, 5, 'the documented A/B fallback has to actually reach the parser');
    assert.equal(markers[0].startSeconds, 0);
});

test('the player response still wins when it carries the curve', () => {
    const feature = heatmapFeature('jumpToMostReplayed', {
        ytInitialPlayerResponse: heatmapPayload(6),
        ytInitialData: heatmapPayload(5)
    });

    assert.equal(feature._readMarkers().length, 6, 'the first source is preferred, not merged');
});

test('neither source carrying a curve is still no markers and no throw', () => {
    for (const _rw of [
        {},
        { ytInitialPlayerResponse: null, ytInitialData: null },
        { ytInitialPlayerResponse: { videoDetails: {} }, ytInitialData: { contents: {} } },
        // Below the useful-marker floor: a two-point curve is noise, not a heatmap.
        { ytInitialPlayerResponse: null, ytInitialData: heatmapPayload(2) }
    ]) {
        const feature = heatmapFeature('jumpToMostReplayed', _rw);
        assert.deepEqual(Array.from(feature._readMarkers()), []);
    }
});

test('both features ignore a curve that belongs to the previous video', () => {
    // After in-page navigation the inline payloads still describe the video
    // the tab was opened on.
    const stale = { ytInitialPlayerResponse: heatmapPayload(6, 'zzzzzzzzzzz'), ytInitialData: heatmapPayload(5, 'zzzzzzzzzzz') };
    for (const id of ['jumpToMostReplayed', 'heatmapSmartSpeed']) {
        assert.deepEqual(Array.from(heatmapFeature(id, stale)._readMarkers()), [],
            `${id} must not steer playback with another video's curve`);
    }
    const mixed = { ytInitialPlayerResponse: heatmapPayload(6, 'zzzzzzzzzzz'), ytInitialData: heatmapPayload(5) };
    assert.equal(heatmapFeature('heatmapSmartSpeed', mixed)._readMarkers().length, 5,
        'a stale player response falls through to initial data about the playing video');
});

test('after an in-app click both features use the curve that navigation carried', () => {
    // The inline payloads still describe the video the tab opened on, so before
    // the navigation copy existed both features had no curve until a reload.
    const stale = { ytInitialPlayerResponse: heatmapPayload(6, 'zzzzzzzzzzz'), ytInitialData: heatmapPayload(5, 'zzzzzzzzzzz') };
    for (const id of ['jumpToMostReplayed', 'heatmapSmartSpeed']) {
        const markers = heatmapFeature(id, { ...stale, navigatedPageData: heatmapPayload(7) })._readMarkers();
        assert.equal(markers.length, 7, `${id} must read the new video's curve without a reload`);
        assert.equal(findPeak(markers), 20, 'and it is that curve, not the stale one');
        assert.deepEqual(Array.from(heatmapFeature(id, { ...stale, navigatedPageData: heatmapPayload(7, 'yyyyyyyyyyy') })._readMarkers()), [],
            `${id} still refuses a navigation curve that names another video`);
    }
});

function findPeak(markers) {
    return loadHeatmap().findMostReplayed(markers).startSeconds;
}

function navigationCapture(settings) {
    const { loadDeclarations } = require('./helpers/monolith');
    return loadDeclarations(['_rw', 'captureNavigatedPageData'], {
        appState: { settings },
        document: { querySelectorAll: () => [] },
        location: { href: 'https://www.youtube.com/watch?v=abc12345678' }
    });
}

function navigateFinish(payload) {
    return { type: 'yt-navigate-finish', detail: { pageType: 'watch', response: { response: payload } } };
}

test('the navigation copy is taken from YouTube\'s own event while a heatmap feature is on', () => {
    for (const settings of [{ jumpToMostReplayed: true }, { heatmapSmartSpeed: true }]) {
        const { _rw, captureNavigatedPageData } = navigationCapture(settings);
        captureNavigatedPageData(navigateFinish(heatmapPayload(5, 'nextvideo11')));
        assert.equal(loadHeatmap().heatmapMarkersFor('nextvideo11', _rw.navigatedPageData).length, 5,
            `with ${Object.keys(settings)[0]} on, the curve YouTube handed the navigation is kept`);

        // Firefox hands this world a live view of YouTube's object, and YouTube
        // empties it within a second, before the navigate rules read it.
        const live = heatmapPayload(5, 'nextvideo11');
        captureNavigatedPageData(navigateFinish(live));
        live.frameworkUpdates.entityBatchUpdate.mutations.length = 0;
        delete live.frameworkUpdates.entityBatchUpdate;
        assert.equal(loadHeatmap().heatmapMarkersFor('nextvideo11', _rw.navigatedPageData).length, 5,
            'the copy is taken during the dispatch, not a reference to an object YouTube clears');

        // A navigation with no curve (a channel page, a video without one)
        // must not leave the last video's copy behind.
        captureNavigatedPageData(navigateFinish({ contents: {} }));
        assert.equal(_rw.navigatedPageData, null);
    }

    const off = navigationCapture({ jumpToMostReplayed: false, heatmapSmartSpeed: false });
    let read = false;
    off.captureNavigatedPageData({ get detail() { read = true; return navigateFinish(heatmapPayload(5)).detail; } });
    assert.equal(read, false, 'with both features off the response is never copied into this world');
    assert.equal(off._rw.navigatedPageData, null);

    const { _rw, captureNavigatedPageData } = navigationCapture({ jumpToMostReplayed: true });
    captureNavigatedPageData(navigateFinish(heatmapPayload(5)));
    assert.doesNotThrow(() => captureNavigatedPageData({ get detail() { throw new Error('page-made getter'); } }));
    assert.equal(_rw.navigatedPageData, null, 'a detail that throws leaves no copy, old or new');
});

test('the navigation copy is wired in once the settings exist', () => {
    const ytkit = fs.readFileSync(path.join(repoRoot, 'extension/ytkit.js'), 'utf8');
    const settingsAt = ytkit.indexOf('appState.settings = settingsManager.load();');
    const wiredAt = ytkit.indexOf("document.addEventListener('yt-navigate-finish', captureNavigatedPageData, true);");
    assert.ok(settingsAt > 0 && wiredAt > 0, 'both lines exist');
    assert.ok(wiredAt > settingsAt,
        'the handler reads appState.settings, a `let` declared later in the file; wiring it earlier is a TDZ throw on every navigation');
});

test('heatmapMarkersFor needs a payload that names the playing video', () => {
    const { heatmapMarkersFor, heatmapPayloadVideoId } = loadHeatmap();
    const unnamed = heatmapPayload(5);
    delete unnamed.frameworkUpdates.entityBatchUpdate.mutations[0].payload.macroMarkersListEntity.externalVideoId;

    assert.equal(heatmapPayloadVideoId({ videoDetails: { videoId: 'aaaaaaaaaaa' } }), 'aaaaaaaaaaa');
    assert.equal(heatmapPayloadVideoId({ currentVideoEndpoint: { watchEndpoint: { videoId: 'bbbbbbbbbbb' } } }), 'bbbbbbbbbbb');
    assert.equal(heatmapPayloadVideoId(heatmapPayload(5, 'ccccccccccc')), 'ccccccccccc');
    assert.equal(heatmapPayloadVideoId(null), '');
    assert.deepEqual(Array.from(heatmapMarkersFor(PLAYING, unnamed)), [],
        'a payload that names no video cannot be trusted to be this one');
    assert.deepEqual(Array.from(heatmapMarkersFor('', heatmapPayload(5))), [],
        'no playing video means no curve');
    assert.equal(heatmapMarkersFor(PLAYING, null, heatmapPayload(5)).length, 5);
});

test('the player response accessor drops a payload about another video', () => {
    const { loadDeclarations } = require('./helpers/monolith');
    const payload = (videoId) => JSON.stringify({ videoDetails: { videoId, shortDescription: `about ${videoId}` } });
    const scripts = [{ textContent: `var ytInitialPlayerResponse = ${payload('aaaaaaaaaaa')};` }];
    let scans = 0;
    const locationRef = { href: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' };
    const { _rw } = loadDeclarations(['_rw'], {
        document: { querySelectorAll: (sel) => { if (sel === 'script:not([src])') { scans += 1; return scripts; } return []; } },
        location: locationRef,
        getVideoId: () => new URL(locationRef.href).searchParams.get('v')
    });

    assert.equal(_rw.ytInitialPlayerResponse.videoDetails.videoId, 'aaaaaaaaaaa', 'the hard-loaded video reads normally');

    // In-page navigation: the URL moves on and the inline script does not.
    locationRef.href = 'https://www.youtube.com/watch?v=bbbbbbbbbbb';
    assert.equal(_rw.ytInitialPlayerResponse, null, 'the first video\'s description must not answer for the second');
    const scansAfterReject = scans;
    assert.equal(_rw.ytInitialPlayerResponse, null);
    assert.equal(scans, scansAfterReject, 'a rejected page is not rescanned on every read');

    locationRef.href = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
    assert.equal(_rw.ytInitialPlayerResponse?.videoDetails?.videoId, 'aaaaaaaaaaa', 'returning to that video trusts it again');

    locationRef.href = 'https://www.youtube.com/';
    assert.equal(_rw.ytInitialPlayerResponse?.videoDetails?.videoId, 'aaaaaaaaaaa',
        'a page that names no video keeps the old behavior');
});

test('the runtime object really exposes ytInitialData, not just the call site', () => {
    // The tests above hand `_readMarkers` a stubbed `_rw`, so they pass whether
    // or not the real object has the property. That is exactly how the original
    // bug survived: the call site was right and the object was missing the
    // getter. This drives the shipped accessor against a fake document.
    const { loadDeclarations } = require('./helpers/monolith');
    const payload = JSON.stringify(heatmapPayload(5));
    const scripts = [
        { textContent: 'var somethingElse = {"not":"it"};' },
        { textContent: `var ytInitialData = ${payload};` }
    ];
    const { _rw } = loadDeclarations(['_rw'], {
        document: { querySelectorAll: (sel) => (sel === 'script:not([src])' ? scripts : []) },
        location: { href: 'https://www.youtube.com/watch?v=abc12345678' }
    });

    const data = _rw.ytInitialData;

    assert.ok(data, 'the accessor must exist and find the assignment');
    assert.ok(data.frameworkUpdates, 'and return the parsed payload, not the source text');
    assert.equal(loadHeatmap().parseHeatmapMarkers(data).length, 5,
        'the object the accessor returns has to be the one the parser understands');
});
