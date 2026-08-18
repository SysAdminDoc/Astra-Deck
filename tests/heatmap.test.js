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
    // eslint-disable-next-line no-eval
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
    assert.match(body, /parseHeatmapMarkers\(_rw\.ytInitialPlayerResponse\)/,
        'the player response is the primary source');
    assert.match(body, /parseHeatmapMarkers\(_rw\.ytInitialData\)/,
        'initial data is the fallback shape');
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
