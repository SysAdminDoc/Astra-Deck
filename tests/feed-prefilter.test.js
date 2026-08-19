'use strict';

// Filter before render instead of hiding after it.
//
// Post-render CSS hiding is why hideCollaborations could hide 32 of 102 cards
// for months with no symptom: the cards were still in the response, still in
// the layout, still counted - just invisible.
//
// The dangerous half of moving that decision earlier is everything it must NOT
// touch. A player response drives autoplay and the resume position; playlist
// item lists carry positional indices YouTube uses for "N of M", next/previous
// and shuffle. Removing an entry from either is a broken player, not a cleaner
// feed, and those are the assertions that matter most here.
//
// The last test drives the REAL interception: the real core module loaded into
// a real JSON.parse hook, exactly as ytkit-main.js installs it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

function loadPrefilter() {
    globalThis.YTKitCore = {};
    const src = fs.readFileSync(path.join(repoRoot, 'extension/core/feed-prefilter.js'), 'utf8');
    // eslint-disable-next-line no-eval
    (0, eval)(src);
    return globalThis.YTKitCore;
}

const BLOCKED = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const ALLOWED = 'UCbbbbbbbbbbbbbbbbbbbbbb';

function videoItem(channelId, videoId = 'v1') {
    return {
        richItemRenderer: {
            content: {
                videoRenderer: {
                    videoId,
                    ownerText: {
                        runs: [{
                            text: 'A Channel',
                            navigationEndpoint: { browseEndpoint: { browseId: channelId } }
                        }]
                    }
                }
            }
        }
    };
}

function browseResponse(items) {
    return {
        contents: {
            twoColumnBrowseResultsRenderer: {
                tabs: [{
                    tabRenderer: {
                        content: { richGridRenderer: { contents: items } }
                    }
                }]
            }
        }
    };
}

test('a blocked channel is dropped out of the browse response', () => {
    const core = loadPrefilter();
    const response = browseResponse([
        videoItem(ALLOWED, 'keep1'),
        videoItem(BLOCKED, 'drop1'),
        videoItem(ALLOWED, 'keep2')
    ]);
    const report = core.filterBrowseResponse(response, { blockedChannels: [BLOCKED] });
    assert.equal(report.applied, true);
    assert.equal(report.removed, 1);

    const kept = response.contents.twoColumnBrowseResultsRenderer.tabs[0]
        .tabRenderer.content.richGridRenderer.contents;
    assert.equal(kept.length, 2);
    assert.deepEqual(
        kept.map((item) => item.richItemRenderer.content.videoRenderer.videoId),
        ['keep1', 'keep2']
    );
});

test('a channel identity is matched however the blocklist spells it', () => {
    const core = loadPrefilter();
    for (const spelling of [BLOCKED, `https://www.youtube.com/channel/${BLOCKED}`, { channelId: BLOCKED }]) {
        const response = browseResponse([videoItem(BLOCKED, 'drop'), videoItem(ALLOWED, 'keep')]);
        const report = core.filterBrowseResponse(response, { blockedChannels: [spelling] });
        assert.equal(report.removed, 1, `spelling ${JSON.stringify(spelling)} must match`);
    }
});

test('handles match case-insensitively, and an unmatched handle removes nothing', () => {
    const core = loadPrefilter();
    assert.equal(core.normalizeBlockedChannelId('@SomeChannel'), '@somechannel');
    assert.equal(core.normalizeBlockedChannelId('https://www.youtube.com/@SomeChannel'), '@somechannel');
    assert.equal(core.normalizeBlockedChannelId('not a channel'), null);
    assert.equal(core.normalizeBlockedChannelId(''), null);
    assert.equal(core.normalizeBlockedChannelId(null), null);
});

test('a card whose channel cannot be read is never removed', () => {
    const core = loadPrefilter();
    const anonymous = { richItemRenderer: { content: { videoRenderer: { videoId: 'mystery' } } } };
    const response = browseResponse([anonymous, videoItem(BLOCKED, 'drop')]);
    const report = core.filterBrowseResponse(response, { blockedChannels: [BLOCKED] });
    assert.equal(report.removed, 1);
    const kept = response.contents.twoColumnBrowseResultsRenderer.tabs[0]
        .tabRenderer.content.richGridRenderer.contents;
    assert.equal(kept.length, 1);
    assert.equal(kept[0], anonymous, 'an unidentified card is not a match');
});

// ── the things it must never touch ──

test('a player response is refused outright, so autoplay is never rewritten', () => {
    const core = loadPrefilter();
    const playerResponse = {
        videoDetails: { videoId: 'abc', channelId: BLOCKED },
        contents: [videoItem(BLOCKED, 'drop')]
    };
    const report = core.filterBrowseResponse(playerResponse, { blockedChannels: [BLOCKED] });
    assert.equal(report.skipped, 'player-response');
    assert.equal(report.removed, 0);
    assert.equal(playerResponse.contents.length, 1, 'nothing may be spliced out of a player response');
});

test('playlist entries survive, because their positions are load-bearing', () => {
    const core = loadPrefilter();
    // playlistVideoRenderer carries an index YouTube uses for "N of M",
    // next/previous and shuffle. Removing one silently renumbers the playlist.
    const response = {
        contents: [
            { playlistVideoRenderer: { videoId: 'p1', index: { simpleText: '1' }, shortBylineText: { runs: [{ navigationEndpoint: { browseEndpoint: { browseId: BLOCKED } } }] } } },
            { playlistVideoRenderer: { videoId: 'p2', index: { simpleText: '2' } } }
        ]
    };
    const report = core.filterBrowseResponse(response, { blockedChannels: [BLOCKED] });
    assert.equal(report.removed, 0);
    assert.equal(response.contents.length, 2);
});

test('the queue panel is left intact too', () => {
    const core = loadPrefilter();
    const response = {
        contents: [
            { playlistPanelVideoRenderer: { videoId: 'q1', navigationEndpoint: { browseEndpoint: { browseId: BLOCKED } } } }
        ]
    };
    assert.equal(core.filterBrowseResponse(response, { blockedChannels: [BLOCKED] }).removed, 0);
    assert.equal(response.contents.length, 1);
});

test('an empty blocklist does not walk the response at all', () => {
    const core = loadPrefilter();
    const report = core.filterBrowseResponse(browseResponse([videoItem(ALLOWED)]), { blockedChannels: [] });
    assert.equal(report.skipped, 'empty-blocklist');
    assert.equal(report.visited, 0);
});

test('a rule that would empty a feed refuses, and says it refused', () => {
    const core = loadPrefilter();
    // The same failing-open direction the post-render path takes. Being at the
    // right layer does not make a bad verdict good.
    const items = [];
    for (let i = 0; i < 10; i += 1) items.push(videoItem(BLOCKED, `v${i}`));
    items.push(videoItem(ALLOWED, 'keep'));
    const response = browseResponse(items);
    const report = core.filterBrowseResponse(response, { blockedChannels: [BLOCKED] });
    assert.equal(report.removed, 0, 'nothing is removed when the verdict is implausible');
    assert.equal(report.refusedLists, 1);
    assert.equal(report.refusedItems, 10);
    const kept = response.contents.twoColumnBrowseResultsRenderer.tabs[0]
        .tabRenderer.content.richGridRenderer.contents;
    assert.equal(kept.length, 11, 'the feed is shown whole rather than emptied');
});

test('a small list is not subject to the ratio guard', () => {
    const core = loadPrefilter();
    // Three of four blocked on a four-card list is a real state, not a misfire.
    const response = browseResponse([
        videoItem(BLOCKED, 'a'), videoItem(BLOCKED, 'b'),
        videoItem(BLOCKED, 'c'), videoItem(ALLOWED, 'd')
    ]);
    const report = core.filterBrowseResponse(response, { blockedChannels: [BLOCKED] });
    assert.equal(report.removed, 3);
});

test('the walk is bounded so a hostile payload cannot spin the parse hook', () => {
    const core = loadPrefilter();
    // Every JSON.parse on the page goes through this once the hook is on.
    let deep = { contents: [] };
    const root = deep;
    for (let i = 0; i < 200; i += 1) {
        const next = { contents: [] };
        deep.nested = next;
        deep = next;
    }
    const report = core.filterBrowseResponse(root, { blockedChannels: [BLOCKED] });
    assert.equal(report.removed, 0);
    assert.ok(report.visited <= 20000);
});

test('non-objects are handled without throwing', () => {
    const core = loadPrefilter();
    for (const value of [null, undefined, 'string', 42, true]) {
        const report = core.filterBrowseResponse(value, { blockedChannels: [BLOCKED] });
        assert.equal(report.skipped, 'not-an-object');
    }
});

// ── the real interception, not a stub ──

test('the real JSON.parse hook filters a real browse payload end to end', () => {
    const core = loadPrefilter();

    // This is exactly what ytkit-main.js installs: the page's own JSON.parse,
    // wrapped, handing the parsed object to the real filter before the caller
    // ever sees it. No stub stands in for either half.
    const originalParse = JSON.parse;
    const blocklist = core.buildChannelBlocklist([BLOCKED]);
    let reports = 0;
    JSON.parse = function patched(...args) {
        const parsed = originalParse.apply(this, args);
        const report = core.filterBrowseResponse(parsed, { blocklist });
        if (report.applied) reports += 1;
        return parsed;
    };

    try {
        const payload = JSON.stringify(browseResponse([
            videoItem(ALLOWED, 'keep1'),
            videoItem(BLOCKED, 'drop1'),
            videoItem(ALLOWED, 'keep2')
        ]));

        // The caller does nothing special - it just parses, the way YouTube's
        // own code does.
        const response = JSON.parse(payload);
        const rendered = response.contents.twoColumnBrowseResultsRenderer.tabs[0]
            .tabRenderer.content.richGridRenderer.contents;

        assert.equal(reports, 1, 'the hook must have filtered exactly one payload');
        assert.deepEqual(
            rendered.map((item) => item.richItemRenderer.content.videoRenderer.videoId),
            ['keep1', 'keep2'],
            'the blocked card must never exist in the object the page renders from'
        );
    } finally {
        JSON.parse = originalParse;
    }
});

test('the hook leaves an unrelated parse untouched', () => {
    const core = loadPrefilter();
    const originalParse = JSON.parse;
    const blocklist = core.buildChannelBlocklist([BLOCKED]);
    JSON.parse = function patched(...args) {
        const parsed = originalParse.apply(this, args);
        core.filterBrowseResponse(parsed, { blocklist });
        return parsed;
    };
    try {
        // The hook sits on EVERY parse the page makes, so an ordinary payload
        // has to come back byte-identical.
        const value = JSON.parse('{"a":[1,2,3],"b":{"c":"d"}}');
        assert.deepEqual(value, { a: [1, 2, 3], b: { c: 'd' } });
    } finally {
        JSON.parse = originalParse;
    }
});

// ── wiring ──

test('the MAIN-world hook is installed from the shared module, not a second copy', () => {
    const main = fs.readFileSync(path.join(repoRoot, 'extension/ytkit-main.js'), 'utf8');
    assert.match(main, /globalThis\.YTKitCore\s*\n?\s*&& globalThis\.YTKitCore\.filterBrowseResponse/,
        'the MAIN world must use the shared decision module');
    const start = main.indexOf('function installFeedPrefilter');
    const body = main.slice(start, main.indexOf('Feature: Force DVR', start));
    // A duplicated rule set would drift from the tested one.
    assert.doesNotMatch(body, /playlistVideoRenderer/,
        'the filtering rules must live in core/feed-prefilter.js only');
    // Our own bridge payload must not re-enter the filter.
    assert.match(body, /originalParse \|\| JSON\.parse/);

    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'extension/manifest.json'), 'utf8'));
    const mainWorld = manifest.content_scripts.find((entry) => entry.world === 'MAIN');
    assert.ok(mainWorld.js.includes('core/feed-prefilter.js'),
        'the decision module must load into the MAIN world');
    assert.ok(
        mainWorld.js.indexOf('core/feed-prefilter.js') < mainWorld.js.indexOf('ytkit-main.js'),
        'it must load before the script that reads it'
    );
});

test('the feature is opt-in and the post-render path is untouched', () => {
    const schema = fs.readFileSync(path.join(repoRoot, 'extension/core/settings-schema.js'), 'utf8');
    assert.match(schema, /key: "feedPrefilter", [^\n]*defaultValue: false/,
        'response interception must be opt-in');
    // Same risk band as forceDvr, which already ships the identical JSON.parse
    // mechanism under the chromium-store profile.
    assert.match(schema, /key: "feedPrefilter", [^\n]*risk: "experimental"/);

    // Video Hider still owns the DOM path. If this assertion ever fails,
    // the fallback was removed and unrecognised shapes stop being filtered.
    const ytkit = fs.readFileSync(path.join(repoRoot, 'extension/ytkit.js'), 'utf8');
    assert.match(ytkit, /_applyVideoHiddenState\(element, shouldHide/,
        'the post-render path must remain as the fallback');
});
