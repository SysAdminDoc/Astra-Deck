'use strict';

// The like-rate badge divides a like count by a view count and then grades the
// result. The grade is the fragile half: its bands were calibrated against
// YouTube's public view count, and YouTube redefined that metric on 2026-08-24
// to count a view from the first frame with no minimum watch time. Every
// denominator inflates, so real like rates move down as a group and the same
// video grades lower than it used to.
//
// These tests pin the two things that keep that honest: the bands are explicit
// and unchanged (so a guessed recalibration cannot land quietly), and the badge
// always carries the raw counts it divided, so a reader can audit the verdict
// no matter how the bands are tuned.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadFeature } = require('../helpers/monolith');

const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'extension', 'ytkit.js'), 'utf8');

/** The calibration note names the metric and the bands; assert on code only. */
function stripComments(text) {
    return text
        .split('\n')
        .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n');
}

function featureBlock() {
    const start = source.indexOf("id: 'likeViewRatio'");
    assert.ok(start > -1, 'likeViewRatio block should exist');
    const end = source.indexOf('\n        },\n', start);
    assert.ok(end > start, 'likeViewRatio block should terminate');
    return stripComments(source.slice(start, end));
}

test('like-rate tone bands are explicit, ordered, and frozen', () => {
    const feature = loadFeature('likeViewRatio');
    const bands = feature._TONE_BANDS;

    assert.ok(Array.isArray(bands), 'the bands should be a declared list, not inline magic numbers');
    assert.ok(Object.isFrozen(bands), 'the band list should be frozen');
    bands.forEach(band => assert.ok(Object.isFrozen(band), 'each band should be frozen'));

    // Pinned deliberately. A recalibration is legitimate only against real
    // post-2026-08-24 data, and changing these numbers should fail here first.
    // Array.from rebuilds in this realm: `bands.map` would return a vm-realm
    // Array, and deepStrictEqual compares prototypes before contents.
    assert.deepEqual(
        Array.from(bands, band => [band.minPercent, band.tone]),
        [[8, 'excellent'], [4, 'strong'], [2, 'steady']],
        'the calibrated bands should not drift without re-derivation');

    const descending = bands.every((band, i) =>
        i === 0 || bands[i - 1].minPercent > band.minPercent);
    assert.ok(descending, 'bands must descend so the first match is the highest earned tone');
});

test('_getTone grades on the band boundaries and floors at quiet', () => {
    const feature = loadFeature('likeViewRatio');

    assert.equal(feature._getTone(12), 'excellent');
    assert.equal(feature._getTone(8), 'excellent', 'the boundary belongs to the band it opens');
    assert.equal(feature._getTone(7.99), 'strong');
    assert.equal(feature._getTone(4), 'strong');
    assert.equal(feature._getTone(2), 'steady');
    assert.equal(feature._getTone(1.99), 'quiet');
    assert.equal(feature._getTone(0), 'quiet', 'a zero ratio must still resolve to a tone');
});

test('an inflated view denominator only ever grades down, never up', () => {
    const feature = loadFeature('likeViewRatio');
    const likes = 9000;

    // The same video either side of the metric change: identical likes, more
    // counted views. The grade may fall; it must never rise.
    const before = (likes / 100000) * 100;
    const after = (likes / 150000) * 100;
    const order = ['quiet', 'steady', 'strong', 'excellent'];

    assert.ok(order.indexOf(feature._getTone(after)) <= order.indexOf(feature._getTone(before)),
        'a larger denominator must not produce a better tone');
});

test('the badge reports the counts it divided so the verdict is auditable', () => {
    const body = featureBlock();

    assert.match(body, /badge\.title\s*=/, 'the badge should carry a tooltip');
    assert.match(body, /_formatCount\(likes\)/, 'the tooltip should report the like count it used');
    assert.match(body, /_formatCount\(views\)/, 'the tooltip should report the view count it used');
    assert.match(body, /setAttribute\('aria-label'/,
        'the same figures should reach assistive technology, not only the tooltip');
});

test('the userscript copy sizes a compact view count instead of stripping it', () => {
    // `textContent.replace(/[^0-9]/g,'')` reads "1.2M views" as 12, so a
    // collapsed metadata row produced a like rate in the hundreds of
    // thousands of percent. There is no bundled module for this feature, so
    // the userscript copy has to be fixed in place.
    const userscript = fs.readFileSync(
        path.join(__dirname, '..', '..', 'YTKit.user.js'), 'utf8');

    const start = userscript.indexOf("id: 'likeViewRatio'");
    assert.ok(start > -1, 'the userscript should still carry likeViewRatio');
    const body = stripComments(userscript.slice(start, start + 2600));

    assert.match(body, /YTKitCore\?\.parseCompactCount/,
        'the userscript should read counts through the shared parser');
    assert.doesNotMatch(body, /viewEl\.textContent\?\.replace\(\/\[\^0-9\]\/g/,
        'the digits-only strip discards the compact magnitude');
});

test('the shared parser sizes the shapes the watch page actually renders', () => {
    const core = {};
    const vm = require('node:vm');
    vm.runInNewContext(
        fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'text-metrics.js'), 'utf8'),
        { globalThis: { YTKitCore: core } });

    assert.equal(core.parseCompactCount('1.2M views', 0), 1200000,
        'a compact count keeps its magnitude');
    assert.equal(core.parseCompactCount('1,234,567 views', 0), 1234567,
        'a grouped integer is read whole');
    assert.equal(core.parseCompactCount('1.2K', 0, { allowBare: true }), 1200,
        'a bare compact like token is sized');
    assert.equal(core.parseCompactCount('', 0), 0,
        'an unhydrated row reports no count rather than a false zero ratio');
});

test('no view threshold is rescaled on the users behalf', () => {
    // The metric redefinition changes what a stored threshold means, but
    // silently rewriting a number the user chose is worse than leaving it.
    const settingsSource = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'core', 'settings-schema.js'), 'utf8');

    assert.match(settingsSource, /"hideVideosLowViewThreshold"[^)]*defaultValue:\s*1000/,
        'the low-view default should stay where users last saw it');
    assert.match(settingsSource, /"hideVideosLowSignalMinViews"[^)]*defaultValue:\s*1000/,
        'the low-signal view default should stay where users last saw it');

    const migrations = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'core', 'persisted-domains.js'), 'utf8');
    assert.doesNotMatch(stripComments(migrations), /hideVideosLowViewThreshold\s*[*/]/,
        'no migration should scale a stored view threshold');
});
