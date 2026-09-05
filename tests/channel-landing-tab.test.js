'use strict';

// The channel landing tab.
//
// `redirectToVideosTab` already skipped a channel's Home tab, but it hardcoded
// /videos. The tab a person wants is not always Videos, and not every channel
// carries every tab: Podcasts, Live and Posts are all commonly absent, and
// sending someone to a tab that is not there lands them back on the Home tab
// they were trying to skip.
//
// The tab list is read from the browse payload's endpoint URLs rather than the
// rendered tab strip, because <yt-tab-shape> carries a translated `tab-title`
// and no href. Matching that title would be the localised selector the repo's
// own gate forbids. These tests use the real captured channel page, so the
// shape under test is YouTube's, not one invented here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadDeclarations, loadFeature } = require('./helpers/monolith');

const REPO_ROOT = path.join(__dirname, '..');
const CAPTURE = path.join(REPO_ROOT, 'mhtml', 'Channel.mhtml');

function api(settings = {}, initialData = null) {
    return loadDeclarations(
        ['channelLandingTabSuffix', 'listChannelTabSuffixes', 'channelHasTab', 'CHANNEL_TAB_SUFFIXES'],
        { appState: { settings }, _rw: { ytInitialData: initialData } }
    );
}

/** ytInitialData lifted out of the captured channel page. */
function capturedInitialData() {
    const body = fs.readFileSync(CAPTURE, 'latin1').replace(/=\r?\n/g, '');
    const assign = /(?:^|[;\s])(?:var\s+|window\.)?ytInitialData\s*=\s*\{/.exec(body);
    assert.ok(assign, 'the capture must carry an ytInitialData assignment');
    const start = body.indexOf('{', body.indexOf('=', assign.index));
    let depth = 0, end = start, inString = false, escaped = false;
    for (; end < body.length; end += 1) {
        const ch = body[end];
        if (inString) {
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === '{') depth += 1;
        else if (ch === '}') { depth -= 1; if (depth === 0) { end += 1; break; } }
    }
    return JSON.parse(body.slice(start, end));
}

test('an unknown or missing tab choice falls back to Videos', () => {
    const { channelLandingTabSuffix } = api();

    for (const value of [undefined, null, '', 'featured', 'search', 'about', '../evil', 'VIDEOS ']) {
        assert.equal(channelLandingTabSuffix(value), '/videos', `${JSON.stringify(value)} must fall back`);
    }
});

test('each supported tab maps to its own unlocalised suffix', () => {
    const { channelLandingTabSuffix, CHANNEL_TAB_SUFFIXES } = api();

    // Array.from: the slice runs in a vm realm, and a vm-built array is not
    // reference-equal to a host-realm one however identical its contents.
    assert.deepEqual(Array.from(CHANNEL_TAB_SUFFIXES),
        ['videos', 'shorts', 'streams', 'podcasts', 'playlists', 'posts']);
    for (const tab of CHANNEL_TAB_SUFFIXES) {
        assert.equal(channelLandingTabSuffix(tab), `/${tab}`);
        assert.equal(channelLandingTabSuffix(tab.toUpperCase()), `/${tab}`, 'the choice is case-insensitive');
    }
});

test('the tab list comes from the real captured channel page', () => {
    const initialData = capturedInitialData();
    const { listChannelTabSuffixes } = api({}, initialData);

    const found = listChannelTabSuffixes(initialData);

    // Read off the capture: featured/videos/shorts/streams/podcasts/playlists/
    // posts/search. Only the six the setting offers are reported, so Home and
    // Search cannot be selected by accident.
    assert.deepEqual(Array.from(found).sort(),
        ['/playlists', '/podcasts', '/posts', '/shorts', '/streams', '/videos']);
});

test('a payload that lists no usable tab reports nothing rather than guessing', () => {
    const { listChannelTabSuffixes } = api();

    for (const data of [
        null,
        {},
        { contents: {} },
        { contents: { twoColumnBrowseResultsRenderer: {} } },
        { contents: { twoColumnBrowseResultsRenderer: { tabs: 'not an array' } } },
        { contents: { twoColumnBrowseResultsRenderer: { tabs: [{}, { tabRenderer: {} }] } } },
        // Home and Search are real tabs the setting deliberately does not offer.
        { contents: { twoColumnBrowseResultsRenderer: { tabs: [
            { tabRenderer: { endpoint: { commandMetadata: { webCommandMetadata: { url: '/@x/featured' } } } } },
            { tabRenderer: { endpoint: { commandMetadata: { webCommandMetadata: { url: '/@x/search' } } } } }
        ] } } }
    ]) {
        assert.deepEqual(Array.from(listChannelTabSuffixes(data)), [], JSON.stringify(data)?.slice(0, 70));
    }
});

test('a channel is only sent to a tab the payload actually lists', () => {
    const initialData = capturedInitialData();
    const { channelHasTab } = api({}, initialData);

    assert.equal(channelHasTab('/streams'), true, 'the captured channel has a Live tab');
    assert.equal(channelHasTab('/podcasts'), true);
    // Not offered by the setting, and not in the reported list either.
    assert.equal(channelHasTab('/featured'), false);
    assert.equal(channelHasTab('/membership'), false, 'a tab this channel does not carry');
});

test('an unreadable payload reports no tabs, so the redirect stays on Videos', () => {
    const { channelHasTab } = api({}, null);

    // "Do not know" must not be answered as "yes". The caller turns a false
    // here into /videos, which every channel has and which is exactly what this
    // feature did before the setting existed.
    assert.equal(channelHasTab('/streams'), false);
    assert.equal(channelHasTab('/videos'), false);
});

test('the setting is declared with exactly the tabs the runtime accepts', () => {
    const { CHANNEL_TAB_SUFFIXES } = api();
    const schema = require('../extension/core/settings-schema.js');
    const entry = schema.SETTINGS_SCHEMA.find((row) => row.key === 'channelLandingTab');

    assert.ok(entry, 'channelLandingTab must be in the schema');
    assert.equal(entry.type, 'string');
    assert.equal(entry.defaultValue, 'videos',
        'the default must preserve what redirectToVideosTab already did');
    assert.deepEqual([...entry.enum], Array.from(CHANNEL_TAB_SUFFIXES),
        'a tab offered in settings the runtime would reject is a dead option');

    const defaults = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'extension', 'default-settings.json'), 'utf8'));
    assert.equal(defaults.channelLandingTab, 'videos');
});

// The caller, not just the helpers.
//
// The first version of this file tested channelLandingTabSuffix and
// channelHasTab directly, and deleting the existence check from the function
// that actually builds the URL changed nothing it could see. These drive the
// real feature: the helpers are loaded from the monolith and injected into the
// feature's sandbox, so a mutation to either half fails here.

function driveFeature({ tab = 'videos', tabs = null, startPath = '/@YouTube' } = {}) {
    const helpers = api();
    const rules = new Map();
    const documentListeners = new Map();
    let href = `https://www.youtube.com${startPath}`;
    const location = {
        get href() { return href; },
        set href(value) { href = value; },
        get pathname() {
            const withoutOrigin = href.replace('https://www.youtube.com', '');
            return withoutOrigin.split(/[?#]/)[0];
        }
    };
    const initialData = tabs === null ? null : {
        contents: { twoColumnBrowseResultsRenderer: { tabs: tabs.map((suffix) => ({
            tabRenderer: { endpoint: { commandMetadata: { webCommandMetadata: { url: `/@YouTube${suffix}` } } } }
        })) } }
    };

    const feature = loadFeature('redirectToVideosTab', {
        appState: { settings: { channelLandingTab: tab } },
        _rw: { ytInitialData: initialData },
        addNavigateRule: (id, fn) => rules.set(id, fn),
        removeNavigateRule: (id) => rules.delete(id),
        location,
        document: {
            addEventListener: (type, handler) => { if (type === 'mousedown') documentListeners.set(type, handler); },
            removeEventListener: (type) => documentListeners.delete(type)
        },
        channelLandingTabSuffix: helpers.channelLandingTabSuffix,
        channelHasTab: (suffix) => {
            const available = helpers.listChannelTabSuffixes(initialData);
            return Array.from(available).includes(suffix);
        }
    });

    feature.init();

    /** Click a link, the way the mousedown rewrite sees it. */
    const clickAnchor = (href) => {
        const anchor = { href, closest(sel) { return sel === 'a' ? anchor : null; } };
        documentListeners.get('mousedown')?.({ target: anchor });
        return anchor.href;
    };

    return { landedOn: location.pathname, rules, clickAnchor };
}

test('the redirect sends the user to the tab they chose', () => {
    const { landedOn } = driveFeature({ tab: 'streams', tabs: ['/videos', '/streams'] });
    assert.equal(landedOn, '/@YouTube/streams');
});

test('the redirect falls back to Videos when the chosen tab is not there', () => {
    // The whole point of the existence check: this channel has no Live tab, and
    // sending the user there would bounce them back to the Home tab they were
    // trying to skip.
    const { landedOn } = driveFeature({ tab: 'streams', tabs: ['/videos', '/shorts'] });
    assert.equal(landedOn, '/@YouTube/videos');
});

test('the redirect falls back to Videos when the payload cannot be read', () => {
    const { landedOn } = driveFeature({ tab: 'podcasts', tabs: null });
    assert.equal(landedOn, '/@YouTube/videos');
});

test('a deep link to a specific tab is left alone', () => {
    for (const startPath of ['/@YouTube/playlists', '/@YouTube/streams', '/@YouTube/community']) {
        const { landedOn } = driveFeature({ tab: 'videos', tabs: ['/videos'], startPath });
        assert.equal(landedOn, startPath, `${startPath} must not be rewritten`);
    }
});

test('the redirect registers one navigation rule and no more', () => {
    const { rules } = driveFeature({ tab: 'videos', tabs: ['/videos'] });
    assert.deepEqual(Array.from(rules.keys()), ['channelRedirectorNav']);
});

// The anchor rewrite, which asks about a different channel than the one loaded.
//
// An adversarial review found this: the mousedown handler rewrites a link to
// ANY channel, and the existence check reads the browse payload of the page you
// are standing on. On a watch page that payload has no channel tabs at all, so
// every link was forced to /videos and the setting was silently discarded. On
// channel A's page, a link to channel B was rewritten using A's tab list.

test('a link to another channel is not rewritten using this page tab list', () => {
    // This page has /podcasts. The link points somewhere else entirely, and
    // nothing here knows whether THAT channel has a Podcasts tab.
    const { clickAnchor } = driveFeature({ tab: 'podcasts', tabs: ['/videos', '/podcasts'] });

    assert.equal(
        clickAnchor('https://www.youtube.com/@someoneElse'),
        'https://www.youtube.com/@someoneElse',
        'the href is left alone so the navigation rule can decide once the right payload is loaded'
    );
});

test('the anchor rewrite still shortcuts to Videos, which every channel has', () => {
    const { clickAnchor } = driveFeature({ tab: 'videos', tabs: ['/videos'] });

    assert.equal(clickAnchor('https://www.youtube.com/@someoneElse'), '/@someoneElse/videos',
        'the default tab needs no lookup, so the one-hop shortcut is kept');
});

test('the anchor rewrite leaves non-channel links alone', () => {
    const { clickAnchor } = driveFeature({ tab: 'videos', tabs: ['/videos'] });

    for (const href of [
        'https://www.youtube.com/watch?v=abc12345678',
        'https://www.youtube.com/@someoneElse/streams',
        'https://example.com/@someoneElse'
    ]) {
        assert.equal(clickAnchor(href), href, `${href} must not be rewritten`);
    }
});

test('a watch page cannot answer for a channel, and does not pretend to', () => {
    // ytInitialData on a watch page carries twoColumnWatchNextResults, not the
    // channel tab list, so the reader reports nothing.
    const { clickAnchor, landedOn } = driveFeature({
        tab: 'streams',
        tabs: [],
        startPath: '/watch?v=abc12345678'
    });

    assert.equal(landedOn, '/watch', 'a watch page is not a channel home and must not redirect');
    assert.equal(clickAnchor('https://www.youtube.com/@someoneElse'),
        'https://www.youtube.com/@someoneElse',
        'and a channel link from a watch page waits for the channel page to answer');
});
