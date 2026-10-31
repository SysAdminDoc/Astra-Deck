'use strict';

// The like-rate badge divides a like count by a view count and then grades the
// result. The grade is the fragile half: YouTube redefined its public view count
// on 2026-08-24 to count a view from the first frame with no minimum watch time.
// Uploads from then on read about half the like rate of earlier ones, and the
// earlier ones didn't move, so there are two sets of bands chosen by upload date.
//
// These tests pin the two things that keep that honest: the bands are explicit
// (so a guessed recalibration cannot land quietly), and the badge always carries
// the raw counts it divided, so a reader can audit the verdict no matter how the
// bands are tuned.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { fakeNode, fakeTreeDocument, loadFeature } = require('../helpers/monolith');

/** The calibration note names the metric and the bands; assert on code only. */
function stripComments(text) {
    return text
        .split('\n')
        .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n');
}

test('like-rate tone bands are explicit, ordered, and frozen', () => {
    const feature = loadFeature('likeViewRatio');
    // Pinned deliberately. A recalibration is legitimate only against real data,
    // and changing these numbers should fail here first. Array.from rebuilds in
    // this realm: `bands.map` would return a vm-realm Array, and deepStrictEqual
    // compares prototypes before contents.
    for (const [bands, expected] of [
        [feature._TONE_BANDS, [[6, 'excellent'], [2, 'strong'], [1, 'steady']]],
        [feature._TONE_BANDS_BEFORE_CHANGE, [[8, 'excellent'], [4, 'strong'], [2, 'steady']]]
    ]) {
        assert.ok(Array.isArray(bands), 'the bands should be a declared list, not inline magic numbers');
        assert.ok(Object.isFrozen(bands), 'the band list should be frozen');
        bands.forEach(band => assert.ok(Object.isFrozen(band), 'each band should be frozen'));
        assert.deepEqual(
            Array.from(bands, band => [band.minPercent, band.tone]),
            expected,
            'the calibrated bands should not drift without re-derivation');
        const descending = bands.every((band, i) =>
            i === 0 || bands[i - 1].minPercent > band.minPercent);
        assert.ok(descending, 'bands must descend so the first match is the highest earned tone');
    }
    assert.equal(feature._VIEW_COUNT_CHANGED, '2026-08-24');
});

test('_getTone grades on the band boundaries and floors at quiet', () => {
    const feature = loadFeature('likeViewRatio');

    assert.equal(feature._getTone(12, '2026-10-01'), 'excellent');
    assert.equal(feature._getTone(6, '2026-10-01'), 'excellent', 'the boundary belongs to the band it opens');
    assert.equal(feature._getTone(5.99, '2026-10-01'), 'strong');
    assert.equal(feature._getTone(2, '2026-10-01'), 'strong');
    assert.equal(feature._getTone(1, '2026-10-01'), 'steady');
    assert.equal(feature._getTone(0.99, '2026-10-01'), 'quiet');
    assert.equal(feature._getTone(0, '2026-10-01'), 'quiet', 'a zero ratio must still resolve to a tone');

    assert.equal(feature._getTone(8, '2026-06-01'), 'excellent');
    assert.equal(feature._getTone(7.99, '2026-06-01'), 'strong');
    assert.equal(feature._getTone(4, '2026-06-01'), 'strong');
    assert.equal(feature._getTone(2, '2026-06-01'), 'steady');
    assert.equal(feature._getTone(1.99, '2026-06-01'), 'quiet');
});

test('the upload date picks the bands, and an unknown date reads as current', () => {
    const feature = loadFeature('likeViewRatio');

    assert.equal(feature._getTone(1.2, '2026-10-24'), 'steady', 'measured live: a 1.2% video from October');
    assert.equal(feature._getTone(2.1, '2026-06-20'), 'steady', 'measured live: a 2.1% video from June');
    assert.equal(feature._getTone(2.1, '2026-08-23'), 'steady', 'the last day under the old count');
    assert.equal(feature._getTone(2.1, '2026-08-24'), 'strong', 'the first day under the new one');
    assert.equal(feature._getTone(2.1), 'strong', 'no date means the current bands');
    assert.equal(feature._getTone(2.1, ''), 'strong');
});

function uploadDayFrom(response, blocks = [], videoId = 'thisVideo') {
    const vm = require('node:vm');
    const context = { Intl };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'date-time.js'), 'utf8'), context);
    return loadFeature('likeViewRatio', {
        document: fakeTreeDocument((selector) => (selector.includes('ld+json')
            ? blocks.map(block => ({ textContent: JSON.stringify(block) }))
            : null)),
        _rw: { ytInitialPlayerResponse: response },
        getVideoId: () => videoId,
        YTKitCore: context.YTKitCore
    })._getUploadDay();
}

test('the upload day comes from this video, never another', () => {
    const response = (videoId, publishDate) => ({
        videoDetails: { videoId },
        microformat: { playerMicroformatRenderer: { publishDate } }
    });
    const block = { '@type': 'VideoObject', uploadDate: '2026-10-24T09:00:00-07:00', embedUrl: 'https://www.youtube.com/embed/thisVideo' };

    assert.equal(uploadDayFrom(response('thisVideo', '2026-06-20T06:00:00-07:00')), '2026-06-20',
        'the time and zone are dropped, the uploader day stays');
    assert.equal(uploadDayFrom(response('anotherVideo', '2026-06-20T06:00:00-07:00')), '',
        'a response for another video does not count');
    assert.equal(uploadDayFrom(null, [block]), '2026-10-24', 'after in-app navigation the page block answers');
    assert.equal(uploadDayFrom(null, []), '', 'nothing known');
    assert.equal(uploadDayFrom(response('thisVideo', 'June 20')), '', 'only a real date counts');
});

test('an inflated view denominator only ever grades down, never up', () => {
    const feature = loadFeature('likeViewRatio');
    const likes = 9000;

    // The same video either side of the metric change: identical likes, more
    // counted views. The grade may fall; it must never rise.
    const before = (likes / 100000) * 100;
    const after = (likes / 150000) * 100;
    const order = ['quiet', 'steady', 'strong', 'excellent'];

    for (const day of ['2026-06-01', '2026-10-01']) {
        assert.ok(order.indexOf(feature._getTone(after, day)) <= order.indexOf(feature._getTone(before, day)),
            'a larger denominator must not produce a better tone');
    }
});

test('the rendered badge reports the counts it divided and replaces itself in place', () => {
    // A compact count on purpose: a digits-only strip read "1.5M views" as 15
    // and produced a like rate in the hundreds of thousands of percent. The
    // userscript runs this same feature, so this covers both vehicles.
    const view = fakeNode({ tag: 'span', text: '1.5M views' });
    const row = fakeNode({ tag: 'div', children: [view] });
    const like = fakeNode({ tag: 'button', attributes: { 'aria-label': '90,000 likes' } });
    const documentRef = fakeTreeDocument((selector) => {
        if (selector.startsWith('#info-container')) return [view];
        if (selector.startsWith('like-button-view-model')) return like;
        return null;
    });
    const feature = loadFeature('likeViewRatio', {
        document: documentRef,
        isWatchPagePath: () => true
    });

    feature._calculate();
    feature._calculate();

    assert.equal(row.children.length, 2, 'recalculation replaces the prior badge');
    const badge = row.children[1];
    assert.equal(badge.className, 'ytkit-lv-ratio');
    assert.equal(badge.dataset.state, 'excellent', 'with no upload date the current bands grade it');
    assert.equal(badge.children[0].textContent, '6.0%');
    assert.equal(badge.children[1].textContent, 'Like Rate');
    assert.equal(badge.title, '90,000 likes from 1,500,000 views');
    assert.equal(
        badge.getAttribute('aria-label'),
        'Like rate 6.0% based on 90,000 likes and 1,500,000 views'
    );
    assert.equal(badge.getAttribute('translate'), 'no');

    feature.destroy();
    assert.deepEqual(row.children, [view]);
});

// Drawing a badge is a page mutation, so the feature's own rule woke it again and
// it redrew forever. Next to Video Age Display, which looped faster, every redraw
// restarted this timer and the like badge never appeared at all (live, 2026-10-31).
function badgeWithRules(viewText, likeLabel) {
    const view = fakeNode({ tag: 'span', text: viewText });
    const row = fakeNode({ tag: 'div', children: [view] });
    const like = fakeNode({ tag: 'button', attributes: { 'aria-label': likeLabel } });
    const documentRef = fakeTreeDocument((selector) => {
        if (selector.startsWith('#info-container')) return [view];
        if (selector.startsWith('like-button-view-model')) return like;
        return null;
    });
    const timers = [];
    const rules = {};
    const feature = loadFeature('likeViewRatio', {
        document: documentRef,
        isWatchPagePath: () => true,
        setTimeout: (fn, delay) => { const timer = { fn, delay, cleared: false }; timers.push(timer); return timer; },
        clearTimeout: (timer) => { if (timer) timer.cleared = true; },
        addMutationRule: (id, fn) => { rules.mutation = fn; },
        addNavigateRule: () => {},
        removeMutationRule: () => {},
        removeNavigateRule: () => {}
    });
    return { feature, row, view, like, timers, rules };
}

test('recalculating an unchanged badge leaves it alone', () => {
    const { feature, row, view, like } = badgeWithRules('1.5M views', '90,000 likes');

    feature._calculate();
    const first = row.children[1];
    assert.equal(first.dataset.state, 'excellent');
    let writes = 0;
    const realAppend = row.appendChild.bind(row);
    row.appendChild = (node) => { writes += 1; return realAppend(node); };
    feature._calculate();
    assert.equal(writes, 0, 'an unchanged badge must not touch the page');
    assert.ok(row.children[1] === first, 'the same badge stays in place');

    like.setAttribute('aria-label', '120,000 likes');
    feature._calculate();
    assert.equal(writes, 1, 'new numbers redraw it');
    assert.equal(row.children[1].children[0].textContent, '8.0%');
    assert.equal(row.children.length, 2, 'the old badge is gone');

    first.isConnected = true;
    row.children[1].remove();
    feature._calculate();
    assert.equal(writes, 2, 'a badge YouTube threw away is drawn again');

    view.textContent = 'no count here';
    feature._calculate();
    assert.equal(row.children.length, 1, 'with nothing to divide the badge leaves');
    feature.destroy();
});

test('a busy page cannot keep putting the badge off', () => {
    const { feature, timers, rules } = badgeWithRules('1.5M views', '90,000 likes');
    feature.init();
    timers.splice(0).forEach((timer) => { if (!timer.cleared) timer.fn(); });

    rules.mutation();
    assert.equal(timers.length, 1, 'the first mutation books one calculation');
    const booked = timers[0];
    rules.mutation();
    rules.mutation();
    assert.equal(timers.length, 1, 'later mutations leave it booked');
    assert.equal(booked.cleared, false, 'and never restart it');

    booked.fn();
    rules.mutation();
    assert.equal(timers.length, 2, 'once it ran the next mutation books another');
    feature.destroy();
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

// The badge's title and aria-label used to be English template literals, so
// every locale (and every screen reader) got "likes from ... views". They come
// from the catalogue now; this renders the badge with the shipped German one.
test('the badge speaks the active locale, screen-reader label included', () => {
    const catalogue = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', '_locales', 'de', 'messages.json'), 'utf8'));
    const t = (key, fallback) => catalogue[key]?.message ?? fallback;
    const view = fakeNode({ tag: 'span', text: '1.5M views' });
    const row = fakeNode({ tag: 'div', children: [view] });
    const like = fakeNode({ tag: 'button', attributes: { 'aria-label': '90,000 likes' } });
    const documentRef = fakeTreeDocument((selector) => {
        if (selector.startsWith('#info-container')) return [view];
        if (selector.startsWith('like-button-view-model')) return like;
        return null;
    });
    const feature = loadFeature('likeViewRatio', { document: documentRef, isWatchPagePath: () => true, t });
    feature._calculate();

    const badge = row.children[1];
    const likes = new Intl.NumberFormat().format(90000);
    const views = new Intl.NumberFormat().format(1500000);
    assert.equal(badge.children[1].textContent, 'Like-Rate');
    assert.equal(badge.title, `${likes} Likes bei ${views} Aufrufen`);
    assert.equal(badge.getAttribute('aria-label'), `Like-Rate 6.0 % bei ${likes} Likes und ${views} Aufrufen`);
    for (const text of [badge.title, badge.getAttribute('aria-label'), badge.children[1].textContent]) {
        assert.doesNotMatch(text, /\b(likes from|views|Like Rate|based on)\b/, 'no English left');
    }
    feature.destroy();
});
