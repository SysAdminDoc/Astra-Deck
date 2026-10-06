'use strict';

// YouTube's 2026-09-25 feed cards print counts and ages abbreviated ("1.1M",
// "6d ago"). Every view-count, age and lockup-duration read in Video Hider
// returned nothing on them, so the low-view, low-signal and duration filters
// passed every card while looking healthy. These tests drive the shipped
// extractors against markup trimmed from real captures of both layouts.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { selectorMatches } = require('../helpers/monolith');

require('../../extension/core/text-metrics.js');
require('../../extension/core/date-time.js');
const { createHideVideosFromHomeFeature } = require('../../extension/features/video-hider/index.js');
const { extractLoadedAgeMs } = require('../../extension/features/subscription-view/index.js');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const DAY_MS = 86_400_000;

const VOID_TAGS = new Set(['img', 'br', 'input', 'meta', 'link', 'hr', 'source']);

function decodeEntities(value) {
    return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** A read-only element over a parsed tree, enough for the extractors. */
function makeElement(tag, attrs, parent) {
    const element = {
        tag,
        tagName: tag.toUpperCase(),
        attrs,
        parent,
        children: [],
        dataset: {},
        get href() { return attrs.href; },
        get className() { return attrs.class || ''; },
        get ancestors() {
            const chain = [];
            for (let node = this.parent; node && node.tag !== '#root'; node = node.parent) chain.unshift(node);
            return chain;
        },
        get textContent() {
            return this.children.map(child => (child.tag ? child.textContent : child.text)).join('');
        },
        getAttribute(name) {
            return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
        },
        hasAttribute(name) {
            return Object.prototype.hasOwnProperty.call(attrs, name);
        },
        matches(selector) {
            return selectorMatches(selector, this);
        },
        closest(selector) {
            for (let node = this; node && node.tag !== '#root'; node = node.parent) {
                if (selectorMatches(selector, node)) return node;
            }
            return null;
        },
        querySelectorAll(selector) {
            const found = [];
            const walk = (node) => {
                for (const child of node.children) {
                    if (!child.tag) continue;
                    if (selectorMatches(selector, child)) found.push(child);
                    walk(child);
                }
            };
            walk(this);
            return found;
        },
        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        }
    };
    return element;
}

/** Parse trimmed capture markup. Unclosed tags simply nest, like a browser
 *  that never sees the end tag. */
function parseCard(html) {
    const root = makeElement('#root', {}, null);
    let current = root;
    const token = /<!--[\s\S]*?-->|<\/([\w-]+)\s*>|<([\w-]+)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*\/?>|([^<]+)/g;
    for (const match of html.matchAll(token)) {
        if (match[1]) {
            let node = current;
            while (node && node.tag !== match[1].toLowerCase()) node = node.parent;
            if (node && node.parent) current = node.parent;
        } else if (match[2]) {
            const attrs = {};
            match[3].replace(/([^\s=>]+)(?:="([^"]*)")?/g, (_, name, value) => {
                attrs[name] = value === undefined ? '' : decodeEntities(value);
            });
            const node = makeElement(match[2].toLowerCase(), attrs, current);
            current.children.push(node);
            if (!VOID_TAGS.has(node.tag)) current = node;
        } else if (match[4]) {
            current.children.push({ text: decodeEntities(match[4]) });
        }
    }
    const card = root.children.find(child => child.tag);
    assert.ok(card, 'fixture block must hold an element');
    return card;
}

/** Fixture blocks keyed by their comment label. */
function fixtureBlocks(file) {
    const html = fs.readFileSync(path.join(FIXTURES, file), 'utf8');
    const blocks = {};
    const marker = /<!--\s*([^>]*?)\s*-->/g;
    // Empty <!----> markers are Polymer's, inside cards; only labels split.
    const marks = [...html.matchAll(marker)].filter(mark => mark[1]);
    marks.forEach((mark, index) => {
        const end = index + 1 < marks.length ? marks[index + 1].index : html.length;
        const body = html.slice(mark.index + mark[0].length, end).trim();
        if (body) blocks[mark[1]] = body;
    });
    return blocks;
}

const CURRENT = fixtureBlocks('feed-card-layouts-2026-10.html');
const OLD_LOCKUPS = fixtureBlocks('watch-sidebar-lockup-cards.html');

// The search layout before 2026-09-25 is the same renderer with the words
// spelled out, so the old fixture is the current capture with them restored.
const OLD_SEARCH = CURRENT['search: video']
    .replace('>193K<', '>193K views<')
    .replace('>1d ago<', '>1 day ago<');

const cards = {
    channelLockup: () => parseCard(CURRENT['lockup: channel videos grid']),
    sidebarLockup: () => parseCard(CURRENT['lockup: watch sidebar']),
    searchVideo: () => parseCard(CURRENT['search: video']),
    searchLive: () => parseCard(CURRENT['search: live']),
    oldLockup: () => parseCard(OLD_LOCKUPS['sidebar recommendation 1']),
    oldSearch: () => parseCard(OLD_SEARCH)
};

function feature(settings = {}, deps = {}) {
    return createHideVideosFromHomeFeature({ appState: { settings }, ...deps });
}

test('the fixtures really are the two layouts', () => {
    assert.match(cards.searchVideo().querySelector('#metadata-line').textContent, /193K\s*1d ago/);
    assert.doesNotMatch(cards.searchVideo().textContent, /\bviews\b/);
    assert.match(cards.oldLockup().textContent, /1\.2M views/);
    assert.match(cards.oldLockup().textContent, /10 months ago/);
    assert.match(cards.oldSearch().textContent, /193K views/);
});

test('view counts read on the current and the previous card layouts', () => {
    const hider = feature();
    assert.equal(hider._extractViewCount(cards.channelLockup()), 1_100_000);
    assert.equal(hider._extractViewCount(cards.sidebarLockup()), 412_000_000);
    assert.equal(hider._extractViewCount(cards.searchVideo()), 193_000);
    assert.equal(hider._extractViewCount(cards.searchLive()), 17_000);
    assert.equal(hider._extractViewCount(cards.oldLockup()), 1_200_000);
    assert.equal(hider._extractViewCount(cards.oldSearch()), 193_000);
});

test('a bare age next to a missing count is never read as views', () => {
    // "6d ago" is a bare-looking token once the count span is gone; the
    // whole-candidate rule has to keep it from becoming 6 views.
    const html = CURRENT['lockup: channel videos grid']
        .replace(/<span[^>]*aria-label="1\.1 million views"[^>]*>1\.1M<\/span>/, '');
    assert.notEqual(html, CURRENT['lockup: channel videos grid'], 'fixture edit must apply');
    assert.equal(feature()._extractViewCount(parseCard(html)), null);
});

test('durations read from lockup badges, search overlays and the old layout', () => {
    const hider = feature();
    assert.equal(hider._extractDuration(cards.channelLockup()), 5 * 60 + 8);
    assert.equal(hider._extractDuration(cards.sidebarLockup()), 4 * 60 + 25);
    assert.equal(hider._extractDuration(cards.searchVideo()), 3600 + 4 * 60 + 42);
    assert.equal(hider._extractDuration(cards.oldLockup()), 35 * 60 + 41);
    assert.equal(hider._extractDuration(cards.searchLive()), 0);
});

test('a real duration badge wins over a clock-like title label', () => {
    // The colon-in-aria-label fallback used to be one arm of a single
    // querySelector, so whichever matched first in the document won.
    const html = CURRENT['lockup: channel videos grid']
        .replace('<a href="/watch?v=ONAuUyml0yI" class="ytLockupViewModelContentImage">',
            '<span aria-label="Starts at 12:30"></span><a href="/watch?v=ONAuUyml0yI" class="ytLockupViewModelContentImage">');
    assert.notEqual(html, CURRENT['lockup: channel videos grid'], 'fixture edit must apply');
    assert.equal(feature()._extractDuration(parseCard(html)), 5 * 60 + 8);
});

test('upload ages read from abbreviated rows and their aria-labels', () => {
    const hider = feature();
    const ageDays = card => hider._extractVideoMetadata(card).ageDays;
    assert.equal(ageDays(cards.channelLockup()), 6);
    assert.equal(ageDays(cards.searchVideo()), 1);
    assert.equal(ageDays(cards.oldSearch()), 1);
    const sidebar = ageDays(cards.sidebarLockup());
    assert.ok(sidebar >= 17 * 365 && sidebar <= 17 * 366 + 1, `17 years ago read as ${sidebar} days`);
    const old = ageDays(cards.oldLockup());
    assert.ok(old >= 300 && old <= 310, `10 months ago read as ${old} days`);
});

test('lockup titles read as their visible text', () => {
    const hider = feature();
    assert.equal(hider._extractTitle(cards.channelLockup()), "we're trying something new...");
    assert.equal(hider._extractTitle(cards.sidebarLockup()), 'daryl hall & john oates - maneater (official video)');
    assert.equal(hider._extractTitle(cards.oldLockup()), 'why the dating crisis is just natural selection');
    assert.match(hider._extractTitle(cards.searchVideo()), /^cozy autumn music/);
    // Home's Shorts shelf wraps this same lockup in a rich item.
    const shorts = parseCard(`<ytd-rich-item-renderer>${CURRENT['shorts: search shelf lockup']}</ytd-rich-item-renderer>`);
    assert.match(hider._extractTitle(shorts), /^woodworking tips and tricks #diy/);
});

test('title keywords hide lockup cards on every surface', () => {
    const hider = feature({ hideVideosKeywordFilter: 'something new, maneater, cozy autumn, dating crisis' });
    for (const [label, make] of Object.entries(cards)) {
        if (label === 'searchLive' || label === 'oldSearch') continue;
        const card = make();
        assert.equal(hider._shouldHide(card), true, `${label} must hide on a title keyword`);
        assert.equal(card.dataset.ytkitFilterReason, 'keyword', label);
    }
    const unrelated = feature({ hideVideosKeywordFilter: 'minutes' });
    assert.equal(unrelated._shouldHide(cards.channelLockup()), false,
        'the duration in the title aria-label is not part of the title');
});

test('Hide Mixes hides a real Mix but not a plain video linked into a radio', () => {
    const hider = feature({ hideVideosHideMixes: true });
    const mix = parseCard(CURRENT['lockup: watch sidebar mix']);
    const radioVideo = parseCard(CURRENT['lockup: watch sidebar radio-linked video']);
    assert.match(radioVideo.querySelector('a').getAttribute('href'), /start_radio=1/, 'fixture really is radio-linked');
    assert.equal(hider._extractVideoMetadata(radioVideo).isMix, false);
    assert.equal(hider._extractVideoMetadata(cards.sidebarLockup()).isMix, false);
    assert.deepEqual(hider._matchesMetadataFilters(radioVideo), { hide: false, reason: '' });
    assert.equal(hider._extractVideoMetadata(mix).isMix, true);
    assert.deepEqual(hider._matchesMetadataFilters(mix), { hide: true, reason: 'mix' });
});

test('type filters never read the title or the channel name', () => {
    const typeWords = 'how to mix audio for a free movie premiere live';
    const search = parseCard(CURRENT['search: video']
        .replaceAll('cozy autumn music 🍂 lofi beats to study / relax to', typeWords)
        .replaceAll('Lofi Girl', 'Film Theory Premieres Live'));
    const sidebar = parseCard(CURRENT['lockup: watch sidebar']
        .replace('>Daryl Hall &amp; John Oates<', '>Film Theory Live Mix Premiere<'));
    assert.match(search.querySelector('#meta').textContent, /mix audio/, 'the title really sits inside #meta');
    assert.match(sidebar.querySelector('yt-content-metadata-view-model').textContent, /Film Theory/);

    const hider = feature({ hideVideosHideMixes: true, hideVideosHideMovies: true, hideVideosHideUpcoming: true, hideVideosHideLive: true });
    for (const card of [search, sidebar]) {
        const metadata = hider._extractVideoMetadata(card);
        assert.deepEqual(
            { isMix: metadata.isMix, isMovie: metadata.isMovie, isUpcoming: metadata.isUpcoming, isLive: metadata.isLive },
            { isMix: false, isMovie: false, isUpcoming: false, isLive: false });
        assert.deepEqual(hider._matchesMetadataFilters(card), { hide: false, reason: '' });
    }
    // The age and view rows after the byline still read.
    assert.equal(hider._extractVideoMetadata(sidebar).ageDays > 6000, true);

    // The title also rides on aria-labels, where a substring marker caught it.
    const liveTitle = parseCard(CURRENT['lockup: watch sidebar']
        .replaceAll('Daryl Hall &amp; John Oates - Maneater (Official Video)', 'Billie Jean (Live) Members Only Alive'));
    assert.ok(liveTitle.querySelectorAll('[aria-label]').some((node) => node.getAttribute('aria-label').includes('(Live)')),
        'the title really sits on an aria-label');
    assert.equal(hider._extractVideoMetadata(liveTitle).isLive, false);
    assert.equal(hider._extractVideoMetadata(liveTitle).isMembersOnly, null);
    assert.equal(hider._extractVideoMetadata(cards.searchLive()).isLive, true, 'the LIVE badge still reads');
});

test('Subscriptions hides live and streamed lockups by their badge and date row', () => {
    const { createSubscriptionGroupsFeature } = require('../../extension/features/subscription-groups/index.js');
    const withClassList = (card) => {
        const classes = new Set();
        card.classList = { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) };
        return card;
    };
    const liveNow = withClassList(parseCard(CURRENT['lockup: channel live tab, live now']));
    const streamed = withClassList(parseCard(CURRENT['lockup: channel live tab, streamed']));
    const plain = withClassList(cards.channelLockup());
    const capsTitle = withClassList(parseCard(CURRENT['lockup: channel videos grid']
        .replaceAll("We're trying something new...", 'LIVE REACTION TO THE DELIVERY')));
    const streamedChannel = withClassList(parseCard(CURRENT['lockup: watch sidebar']
        .replace('>Daryl Hall &amp; John Oates<', '>Streamed Gaming<')));
    assert.ok(capsTitle.textContent.includes('LIVE REACTION'), 'fixture title really was replaced');

    const all = [liveNow, streamed, plain, capsTitle, streamedChannel];
    const originalDocument = globalThis.document;
    globalThis.document = { querySelectorAll: () => all };
    try {
        const feature = createSubscriptionGroupsFeature({
            appState: { settings: { subscriptionFilterLive: true, subscriptionFilterStreamed: true } }
        });
        feature._runCardBatch = (label, list, callback) => list.forEach(callback);
        feature._applyContentTypeFilter();
    } finally {
        globalThis.document = originalDocument;
    }
    const hidden = (card) => card.classList.contains('ytkit-sub-hidden-by-type');
    assert.equal(hidden(liveNow), true, 'the LIVE badge has no aria-label on lockups');
    assert.equal(hidden(streamed), true, '"Streamed 4y ago" sits in the lockup row');
    assert.equal(hidden(plain), false);
    assert.equal(hidden(capsTitle), false, 'an all-caps LIVE in the title is not a live badge');
    assert.equal(hidden(streamedChannel), false, 'the channel row is not the date row');

    assert.equal(createHideVideosFromHomeFeature({ appState: { settings: {} } })._extractVideoMetadata(liveNow).isLive, true);
});

test('the shared parsers accept the 2026-09 spellings', () => {
    const { parseCompactCount, parseRelativeYouTubeAge } = globalThis.YTKitCore;
    assert.equal(parseCompactCount('186 thousand views'), 186_000);
    assert.equal(parseCompactCount('1.2 billion views'), 1_200_000_000);
    assert.equal(parseCompactCount('57M', null, { allowBare: true }), 57_000_000);
    assert.equal(parseCompactCount('4y ago', null, { allowBare: true }), null);
    const now = new Date(2026, 9, 6, 12);
    assert.equal(parseRelativeYouTubeAge('4y ago', now).unit, 'year');
    assert.equal(parseRelativeYouTubeAge('1mo ago', now).unit, 'month');
    assert.equal(parseRelativeYouTubeAge('3m ago', now).unit, 'minute');
    assert.equal(parseRelativeYouTubeAge('6d ago', now).date.getTime(), now.getTime() - 6 * DAY_MS);
    assert.equal(parseRelativeYouTubeAge('1.1M 6d ago', now).unit, 'day');
    assert.equal(parseRelativeYouTubeAge('1.1M views', now), null);
});

test('low-view and low-signal filters act on the current layout', () => {
    const lowView = feature({ hideVideosLowViewFilter: true, hideVideosLowViewThreshold: 1_000_000 });
    assert.deepEqual(lowView._matchesMetadataFilters(cards.searchVideo()), { hide: true, reason: 'low-view' });
    assert.equal(lowView._matchesMetadataFilters(cards.channelLockup()).hide, false);

    const lowSignal = feature({
        hideVideosLowSignalFilter: true,
        hideVideosLowSignalMinViews: 2_000_000,
        hideVideosLowSignalMinAgeDays: 3
    });
    assert.deepEqual(lowSignal._matchesMetadataFilters(cards.channelLockup()), { hide: true, reason: 'low-signal' });
    assert.equal(lowSignal._matchesMetadataFilters(cards.searchVideo()).hide, false, '1 day old is under the age floor');
});

test('feature health reports a page of cards whose filter inputs cannot be read', () => {
    const calls = [];
    let route = '/results';
    const hider = feature(
        { hideVideosLowViewFilter: true, hideVideosLowViewThreshold: 1000, hideVideosDurationFilter: 2 },
        { setFeatureHealth: (id, patch) => calls.push({ id, ...patch }), getCurrentPath: () => route }
    );
    const blank = () => parseCard('<ytd-video-renderer><a id="video-title" href="/watch?v=abcdefghijk">Untitled</a><div id="metadata-line"><span class="inline-metadata-item">Recommended for you</span></div></ytd-video-renderer>');

    for (let i = 0; i < 11; i += 1) hider._matchesMetadataFilters(blank());
    assert.equal(calls.length, 0, 'eleven cards are not a page yet');

    hider._matchesMetadataFilters(blank());
    assert.equal(calls.length, 1);
    assert.equal(calls[0].id, 'hideVideosFromHome');
    assert.equal(calls[0].status, 'degraded');
    assert.equal(calls[0].source, 'video-hider-inputs');
    assert.match(calls[0].lastError, /view counts or durations/);

    hider._matchesMetadataFilters(cards.searchVideo());
    assert.equal(calls.length, 2, 'a readable card clears the report');
    assert.equal(calls[1].status, 'initialized');
    assert.equal(calls[1].lastError, null);

    route = '/feed/subscriptions';
    for (let i = 0; i < 20; i += 1) hider._matchesMetadataFilters(cards.channelLockup());
    assert.equal(calls.length, 2, 'readable cards never report');
});

test('feature health counts cards, not re-checks of the same card', () => {
    const calls = [];
    const hider = feature(
        { hideVideosLowViewFilter: true, hideVideosLowViewThreshold: 1000 },
        { setFeatureHealth: (...args) => calls.push(args), getCurrentPath: () => '/results' }
    );
    // A shelf card with no count is re-checked on every feed mutation.
    const shelf = parseCard('<ytd-video-renderer><a id="video-title" href="/watch?v=abcdefghijk">Untitled</a></ytd-video-renderer>');
    for (let i = 0; i < 30; i += 1) hider._matchesMetadataFilters(shelf);
    assert.equal(calls.length, 0, 'one unreadable card is not a page of them');
});

test('feature health clears its report once no filter needs the input', () => {
    const calls = [];
    const settings = { hideVideosLowViewFilter: true, hideVideosLowViewThreshold: 1000 };
    const hider = createHideVideosFromHomeFeature({
        appState: { settings },
        setFeatureHealth: (id, patch) => calls.push(patch),
        getCurrentPath: () => '/results'
    });
    const blank = () => parseCard('<ytd-video-renderer><a id="video-title" href="/watch?v=abcdefghijk">Untitled</a></ytd-video-renderer>');
    for (let i = 0; i < 12; i += 1) hider._matchesMetadataFilters(blank());
    assert.equal(calls.at(-1).status, 'degraded');

    settings.hideVideosLowViewFilter = false;
    hider._matchesMetadataFilters(blank());
    assert.equal(calls.at(-1).status, 'initialized', 'a switched-off filter has nothing left to report');
    assert.equal(calls.at(-1).lastError, null);
    hider._matchesMetadataFilters(blank());
    assert.equal(calls.length, 2, 'and it says so once');
});

test('a new search starts a fresh count even though the path stays /results', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'features', 'video-hider', 'index.js'), 'utf8');
    const start = source.indexOf("addNavigateRule('hideVideosFromHomeNav'");
    assert.match(source.slice(start, start + 900), /this\._inputReadability = null;/);
});

test('feature health stays quiet when no filter needs a number', () => {
    const calls = [];
    const hider = feature({ hideVideosHideLive: true }, { setFeatureHealth: (...args) => calls.push(args) });
    const blank = parseCard('<ytd-video-renderer><a id="video-title">Untitled</a></ytd-video-renderer>');
    for (let i = 0; i < 30; i += 1) hider._matchesMetadataFilters(blank);
    assert.equal(calls.length, 0);
});

test('the shipped factory call hands Video Hider the feature-health setter', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'ytkit.js'), 'utf8');
    const start = source.indexOf('createHideVideosFromHomeFeature?.({');
    assert.ok(start > -1);
    assert.match(source.slice(start, source.indexOf('}) ||', start)), /\n\s*setFeatureHealth,\n/);
});

test('subscription sort reads the age off the lockup aria-label', () => {
    const now = Date.now();
    assert.equal(extractLoadedAgeMs(cards.channelLockup(), now), 6 * DAY_MS);
    assert.equal(extractLoadedAgeMs(cards.oldLockup(), now), 10 * 2_629_746_000);
});
