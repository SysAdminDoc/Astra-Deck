'use strict';

// The remote broken-feature disable feed.
//
// The security property under test is one-directional: a feed row can stop a
// feature activating and it can do nothing else. Most of this file is the
// hostile-row battery that proves it, because the parser is the only thing
// standing between an editable file on GitHub and every install's runtime.
//
// The consumer half matters just as much and is asserted at the bottom against
// the real ytkit.js source: the gate has to sit AFTER the user's own setting
// in shouldFeatureBeActive, and nothing may write appState.settings from the
// feed path.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

function loadFeed() {
    const modulePath = path.join(REPO_ROOT, 'extension', 'core', 'feature-disable-feed.js');
    delete require.cache[require.resolve(modulePath)];
    const previous = globalThis.YTKitCore;
    globalThis.YTKitCore = {};
    try {
        return require(modulePath);
    } finally {
        globalThis.YTKitCore = previous;
    }
}

const KNOWN = new Set(['returnDislike', 'sponsorblock', 'dearrow', 'stickyVideo']);

function parse(text, overrides = {}) {
    const feed = loadFeed();
    return feed.parseFeatureDisableFeed(text, {
        version: '4.84.0',
        knownIds: KNOWN,
        ...overrides
    });
}

test('a well-formed row disables exactly the feature it names', () => {
    const result = parse([
        'feature,issue,broken-from,fixed-in',
        'returnDislike,412,4.80.0,'
    ].join('\n'));

    assert.deepEqual([...result.disabled], ['returnDislike']);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].issue, 412);
    assert.equal(result.entries[0].issueUrl, 'https://github.com/SysAdminDoc/Astra-Deck/issues/412');
    assert.deepEqual(result.rejected, []);
});

test('the parser has no shape that can enable, set, or change anything', () => {
    const result = parse('returnDislike,412,4.80.0,');
    // The whole output surface: a Set, a frozen entry list, and rejections.
    assert.deepEqual(Object.keys(result).sort(), ['disabled', 'entries', 'rejected']);
    assert.ok(result.disabled instanceof Set);
    const entry = result.entries[0];
    assert.ok(Object.isFrozen(entry));
    assert.deepEqual(Object.keys(entry).sort(),
        ['brokenFrom', 'featureId', 'fixedIn', 'issue', 'issueUrl']);
    // Nothing that could be read as a value to write, a target to enable, or
    // copy to render.
    for (const forbidden of ['enabled', 'enable', 'value', 'settings', 'message', 'html', 'url', 'script']) {
        assert.equal(Object.prototype.hasOwnProperty.call(entry, forbidden), false,
            `entry must not carry a "${forbidden}" field`);
    }
});

test('hostile rows are rejected one at a time and never poison the file', () => {
    const hostile = [
        // Naming a setting the schema does not ship.
        'aiSummaryApiKey,1,4.0.0,',
        'notAFeature,1,4.0.0,',
        // Prototype pollution attempts through the feature column.
        '__proto__,1,4.0.0,',
        'constructor,1,4.0.0,',
        // Injection attempts through the columns that reach the UI.
        'returnDislike,<script>alert(1)</script>,4.0.0,',
        'returnDislike,https://evil.example/steal,4.0.0,',
        'dearrow,0,4.0.0,',
        'dearrow,-5,4.0.0,',
        'dearrow,1e9,4.0.0,',
        // Version columns that would widen a row to everything.
        'sponsorblock,1,,',
        'sponsorblock,1,*,',
        'sponsorblock,1,0.0.0,999999999.0.0',
        'sponsorblock,1,4.90.0,4.80.0',
        // Structural attacks.
        'returnDislike,1,4.0.0,,extra',
        'returnDislike,1,4.0.0',
        '"returnDislike",1,4.0.0,',
        'returnDislike,1,4.0.0, ; DROP TABLE'
    ].join('\n');

    const result = parse(hostile);
    assert.deepEqual([...result.disabled], [], 'no hostile row may disable anything');
    assert.equal(result.entries.length, 0);
    assert.equal(result.rejected.length, 17);
    // A rejected row must not have reached the output object under any name.
    assert.equal(Object.prototype.hasOwnProperty.call(result.disabled, '__proto__'), false);
    assert.equal(({}).polluted, undefined);
});

test('a hostile row does not stop the valid rows around it being read', () => {
    const result = parse([
        'notAFeature,1,4.0.0,',
        'returnDislike,412,4.80.0,',
        '"quoted",2,4.0.0,',
        'dearrow,413,4.84.0,4.90.0'
    ].join('\n'));

    assert.deepEqual([...result.disabled].sort(), ['dearrow', 'returnDislike']);
    assert.equal(result.rejected.length, 2);
});

test('a row outside the running version range does not apply', () => {
    // Already fixed in the running build.
    assert.deepEqual([...parse('returnDislike,1,4.70.0,4.84.0').disabled], []);
    // Not broken yet in the running build.
    assert.deepEqual([...parse('returnDislike,1,4.90.0,').disabled], []);
    // fixed-in is exclusive, broken-from is inclusive.
    assert.deepEqual([...parse('returnDislike,1,4.84.0,4.85.0').disabled], ['returnDislike']);
    assert.deepEqual([...parse('returnDislike,1,4.84.0,4.84.0').disabled], []);
});

test('an unparseable running version disables nothing at all', () => {
    const result = parse('returnDislike,1,4.0.0,', { version: 'not-a-version' });
    assert.deepEqual([...result.disabled], []);
    assert.equal(result.rejected[0].reason, 'unknown-running-version');
});

test('feed IDs resolve through the same alias table stored settings use', () => {
    const result = parse('legacyDislikeKey,1,4.0.0,', {
        resolveId: (id) => (id === 'legacyDislikeKey' ? 'returnDislike' : id)
    });
    assert.deepEqual([...result.disabled], ['returnDislike']);
});

test('an oversized feed is discarded whole rather than read in part', () => {
    const feed = loadFeed();
    const body = 'returnDislike,1,4.0.0,\n' + 'x'.repeat(feed.FEATURE_DISABLE_FEED_MAX_BYTES);
    const result = parse(body);
    assert.deepEqual([...result.disabled], []);
    assert.equal(result.rejected[0].reason, 'feed-too-large');
});

test('the row cap stops reading rather than truncating silently', () => {
    const rows = Array.from({ length: 250 }, () => 'returnDislike,1,4.0.0,');
    const result = parse(rows.join('\n'));
    assert.ok(result.rejected.some((row) => row.reason === 'too-many-rows'));
});

test('a duplicated feature keeps the first row and reports the rest', () => {
    const result = parse([
        'returnDislike,412,4.80.0,',
        'returnDislike,999,4.80.0,'
    ].join('\n'));
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].issue, 412);
    assert.equal(result.rejected[0].reason, 'duplicate-feature-id');
});

test('comments and blank lines are ignored', () => {
    const result = parse([
        '# broken by the 2026-08-13 watch-page change',
        '',
        '   ',
        'returnDislike,412,4.80.0,'
    ].join('\n'));
    assert.deepEqual([...result.disabled], ['returnDislike']);
    assert.deepEqual(result.rejected, []);
});

test('cache freshness distinguishes usable, refreshable, and expired', () => {
    const feed = loadFeed();
    const now = 1_000_000_000_000;
    const classify = feed.classifyFeatureDisableFeedCache;
    assert.equal(classify(now - 60_000, now), 'fresh');
    assert.equal(classify(now - feed.FEATURE_DISABLE_FEED_MAX_AGE_MS - 1, now), 'stale');
    assert.equal(classify(now - feed.FEATURE_DISABLE_FEED_STALE_MS - 1, now), 'expired');
    assert.equal(classify(0, now), 'expired');
    assert.equal(classify(NaN, now), 'expired');
    // A cache stamped ahead of now is a clock change, not a fresh read.
    assert.equal(classify(now + 60_000, now), 'expired');
});

test('the runtime gate sits after the user setting and never writes settings', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'extension', 'ytkit.js'), 'utf8');

    const sliceFunction = (name) => {
        const start = source.indexOf(name);
        assert.ok(start > -1, name + ' must be findable');
        const end = source.indexOf('\n    }', start);
        assert.ok(end > start, name + ' must have a findable end');
        return source.slice(start, end);
    };

    const body = sliceFunction('function shouldFeatureBeActive(');
    const settingsCheck = body.indexOf('isFeatureEnabledInSettings');
    const noticeCheck = body.indexOf('getFeatureDisableNotice');
    assert.ok(settingsCheck > -1 && noticeCheck > -1);
    assert.ok(noticeCheck > settingsCheck,
        'the feed must only ever be consulted after the user\'s own setting');

    const refresh = sliceFunction('async function refreshFeatureDisableNotices(');
    assert.equal(/appState\.settings\s*\[/.test(refresh), false,
        'the feed path must never write into appState.settings');
    assert.equal(/settingsManager\.save/.test(refresh), false,
        'the feed path must never persist a setting');
});

test('the feed is fetched through its own message, not the general fetch proxy', () => {
    const background = fs.readFileSync(path.join(REPO_ROOT, 'extension', 'background.js'), 'utf8');
    assert.ok(background.includes("msg.type === 'YTKIT_FETCH_FEATURE_DISABLE_FEED'"));
    // The URL is a fixed literal the caller cannot influence.
    assert.ok(/const FEATURE_DISABLE_FEED_URL = 'https:\/\/raw\.githubusercontent\.com\//.test(background));
    const handler = background.slice(background.indexOf('function fetchFeatureDisableFeed'));
    assert.ok(handler.includes("credentials: 'omit'"));
    assert.ok(handler.includes("redirect: 'error'"));
    assert.ok(handler.includes('readTextBounded'));
});
