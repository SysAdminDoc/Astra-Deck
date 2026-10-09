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

// `location` is where the user is now and `hardLoadPath` is where the
// document, and so its inline payload, was loaded. They differ after an
// in-app move.
function api(settings = {}, initialData = null, {
    location = { pathname: '/@YouTube' },
    hardLoadPath = location.pathname,
    rw = { ytInitialData: initialData, navigatedChannelTabs: null }
} = {}) {
    return loadDeclarations(
        ['channelLandingTabSuffix', 'listChannelTabSuffixes', 'channelBaseFromTabs', 'channelHasTab', 'CHANNEL_TAB_SUFFIXES'],
        { appState: { settings }, _rw: rw, location, HARD_LOAD_PATH: hardLoadPath }
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

    // The capture is the @YouTube channel, and the payload has to agree it is
    // about that channel before its tab list is trusted at all.
    assert.equal(channelHasTab('/streams', '/@YouTube'), true, 'the captured channel has a Live tab');
    assert.equal(channelHasTab('/podcasts', '/@YouTube'), true);
    // Not offered by the setting, and not in the reported list either.
    assert.equal(channelHasTab('/featured', '/@YouTube'), false);
    assert.equal(channelHasTab('/membership', '/@YouTube'), false, 'a tab this channel does not carry');
    // A payload about someone else answers no, however complete it is.
    assert.equal(channelHasTab('/streams', '/@SomeoneElse'), false,
        'a stale payload from another channel must not decide for this one');
    assert.equal(channelHasTab('/streams', ''), false, 'no channel means no answer');
});

test('an unreadable payload reports no tabs, so the redirect stays on Videos', () => {
    const { channelHasTab } = api({}, null);

    // "Do not know" must not be answered as "yes". The caller turns a false
    // here into /videos, which every channel has and which is exactly what this
    // feature did before the setting existed.
    assert.equal(channelHasTab('/streams', '/@YouTube'), false);
    assert.equal(channelHasTab('/videos', '/@YouTube'), false);
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

function driveFeature({ tab = 'videos', tabs = null, startPath = '/@YouTube', payloadChannel = null, hardLoadPath = null } = {}) {
    const rules = new Map();
    const documentListeners = new Map();
    const timers = new Map();
    let nextTimer = 1;
    let href = `https://www.youtube.com${startPath}`;
    const location = {
        get href() { return href; },
        set href(value) { href = value; },
        get pathname() {
            const withoutOrigin = href.replace('https://www.youtube.com', '');
            return withoutOrigin.split(/[?#]/)[0];
        }
    };
    // The payload names the channel it describes. Defaulting it to the channel
    // in startPath models a fresh load; passing payloadChannel models the stale
    // payload a soft navigation leaves behind.
    const ownerMatch = /^(\/(?:@[^/?#]+|(?:c|user|channel)\/[^/?#]+))/.exec(startPath);
    const owner = payloadChannel || (ownerMatch ? ownerMatch[1] : '/@YouTube');
    const initialData = tabs === null ? null : {
        contents: { twoColumnBrowseResultsRenderer: { tabs: tabs.map((suffix) => ({
            tabRenderer: { endpoint: { commandMetadata: { webCommandMetadata: { url: `${owner}${suffix}` } } } }
        })) } }
    };

    // Defaults to a hard load of startPath. A different hardLoadPath is an
    // in-app move from there, whose own tab list arrives later through arrive().
    const rw = { ytInitialData: initialData, navigatedChannelTabs: null };
    const helpers = api({}, initialData, {
        location,
        hardLoadPath: hardLoadPath ?? location.pathname,
        rw
    });

    const feature = loadFeature('redirectToVideosTab', {
        appState: { settings: { channelLandingTab: tab } },
        _rw: rw,
        addNavigateRule: (id, fn) => rules.set(id, fn),
        removeNavigateRule: (id) => rules.delete(id),
        location,
        setTimeout: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; },
        clearTimeout: (id) => timers.delete(id),
        document: {
            addEventListener: (type, handler) => { if (type === 'mousedown') documentListeners.set(type, handler); },
            removeEventListener: (type) => documentListeners.delete(type)
        },
        channelLandingTabSuffix: helpers.channelLandingTabSuffix,
        channelHasTab: (suffix, base) => helpers.channelHasTab(suffix, base)
    });

    feature.init();

    /** Click a link, the way the mousedown rewrite sees it. */
    const clickAnchor = (href) => {
        const anchor = { href, closest(sel) { return sel === 'a' ? anchor : null; } };
        documentListeners.get('mousedown')?.({ target: anchor });
        return anchor.href;
    };

    /** yt-navigate-finish brings this page's tab list (null: none), then the rules rerun. */
    const arrive = (suffixes) => {
        const here = location.pathname;
        rw.navigatedChannelTabs = { path: here, base: suffixes ? here : '', suffixes: suffixes || [] };
        rules.get('channelRedirectorNav')();
        return location.pathname;
    };

    /** Fire every pending timer, the way time passing would. */
    const elapse = () => {
        for (const [id, timer] of [...timers]) {
            timers.delete(id);
            timer.fn();
        }
        return location.pathname;
    };

    return { landedOn: location.pathname, rules, clickAnchor, arrive, elapse, timers, feature, location };
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

// The stale payload a soft navigation leaves behind.
//
// `_rw.ytInitialData` reads inline scripts, and those are written once at hard
// load. After a YouTube SPA navigation the document still carries the previous
// page's scripts, so the accessor keeps answering for the channel you came
// from — and the navigate rule fires precisely on soft navigation. An
// adversarial review drove this and watched Alpha's tab list send Beta to a
// /streams tab Beta does not have.

test('a payload left over from another channel does not decide for this one', () => {
    // We have soft-navigated to Beta. The document still holds Alpha's payload,
    // and Alpha has a Live tab.
    const { landedOn } = driveFeature({
        tab: 'streams',
        tabs: ['/videos', '/streams'],
        startPath: '/@Beta',
        payloadChannel: '/@Alpha'
    });

    assert.equal(landedOn, '/@Beta/videos',
        'Beta must not be sent to a tab only Alpha was known to have');
});

test('a fresh payload for this channel is still trusted', () => {
    const { landedOn } = driveFeature({
        tab: 'streams',
        tabs: ['/videos', '/streams'],
        startPath: '/@Beta',
        payloadChannel: '/@Beta'
    });

    assert.equal(landedOn, '/@Beta/streams', 'the check must not block the case it exists to serve');
});

test('a payload carried over from a watch page decides nothing', () => {
    // A watch page's ytInitialData has no channel tabs at all, so the base it
    // reports is empty and cannot match any channel.
    const { landedOn } = driveFeature({
        tab: 'podcasts',
        tabs: [],
        startPath: '/@Beta',
        payloadChannel: '/@Beta'
    });

    assert.equal(landedOn, '/@Beta/videos');
});

// An in-app move, measured live on 2026-10-07: navigatesuccess (which runs
// the rules) came at 38 ms and yt-navigate-finish, carrying the new channel's
// tab list, at 542 ms. Settling at 38 ms sent every in-app visit to Videos.

test('an in-app visit waits for its own tab list, then lands on the chosen tab', () => {
    const { landedOn, arrive, timers } = driveFeature({
        tab: 'streams',
        tabs: ['/videos'],
        startPath: '/@NASA',
        payloadChannel: '/results',
        hardLoadPath: '/results'
    });

    assert.equal(landedOn, '/@NASA', 'nothing is decided before the tab list arrives');
    assert.equal(timers.size, 1, 'and the wait is bounded');
    assert.equal(arrive(['/videos', '/shorts', '/streams']), '/@NASA/streams');
    assert.equal(timers.size, 0, 'an answer ends the wait');
});

test('an in-app visit from another channel is answered by its own list, not the old one', () => {
    // We moved from Alpha to Beta. The document still holds Alpha's payload,
    // and Alpha has a Live tab.
    const { landedOn, arrive } = driveFeature({
        tab: 'streams',
        tabs: ['/videos', '/streams'],
        startPath: '/@Beta',
        payloadChannel: '/@Alpha',
        hardLoadPath: '/@Alpha'
    });

    assert.equal(landedOn, '/@Beta');
    assert.equal(arrive(['/videos', '/shorts']), '/@Beta/videos',
        'Beta must not be sent to a tab only Alpha was known to have');
});

test('an in-app visit whose navigation brings no tab list falls back to Videos', () => {
    const { arrive } = driveFeature({
        tab: 'streams',
        tabs: ['/videos', '/streams'],
        startPath: '/@Beta',
        payloadChannel: '/@Alpha',
        hardLoadPath: '/@Alpha'
    });

    assert.equal(arrive(null), '/@Beta/videos');
});

test('a move made before ytkit.js booted lands on Videos when the wait runs out', () => {
    // The live failure of the first attempt: results hard-loaded, the click to
    // /@NASA happened, then ytkit.js booted. yt-navigate-finish had already
    // fired, so no tab list is ever coming.
    const { landedOn, rules, timers, elapse } = driveFeature({
        tab: 'streams',
        tabs: ['/videos'],
        startPath: '/@NASA',
        payloadChannel: '/results',
        hardLoadPath: '/results'
    });

    assert.equal(landedOn, '/@NASA');
    // Page-data updates rerun the rule; they must not push the deadline back.
    rules.get('channelRedirectorNav')();
    rules.get('channelRedirectorNav')();
    assert.equal(timers.size, 1);
    assert.equal([...timers.values()][0].ms, 3000);
    assert.equal(elapse(), '/@NASA/videos');
});

test('a wait that outlives its page does nothing', () => {
    const { location, elapse } = driveFeature({
        tab: 'streams',
        tabs: ['/videos'],
        startPath: '/@NASA',
        payloadChannel: '/results',
        hardLoadPath: '/results'
    });

    location.href = 'https://www.youtube.com/watch?v=abc12345678';
    assert.equal(elapse(), '/watch', 'the user moved on, so the old channel is not forced back');
});

test('turning the feature off ends the wait', () => {
    const { feature, timers } = driveFeature({
        tab: 'streams',
        tabs: ['/videos'],
        startPath: '/@NASA',
        payloadChannel: '/results',
        hardLoadPath: '/results'
    });

    assert.equal(timers.size, 1);
    feature.destroy();
    assert.equal(timers.size, 0);
});

test('the load path comes from the navigation entry, not the URL at boot', () => {
    const load = (globals) => loadDeclarations(['documentLoadPath'], { URL, ...globals }).documentLoadPath();
    const performance = {
        getEntriesByType: (type) => (type === 'navigation'
            ? [{ name: 'https://www.youtube.com/results?search_query=nasa&sp=CAI%3D' }]
            : [])
    };

    assert.equal(load({ performance, location: { pathname: '/@NASA' } }), '/results');
    assert.equal(load({ performance: { getEntriesByType: () => [] }, location: { pathname: '/@NASA' } }), '/@NASA',
        'no entry: the current path is the best guess left');
    assert.equal(load({ location: { pathname: '/@NASA' } }), '/@NASA', 'no performance object at all');
});

// The capture itself, fed the event shape a live in-app click onto /@NASA
// produced on 2026-10-07.
function tabCapture(settings, pathname) {
    return loadDeclarations(
        ['_rw', 'captureNavigatedPageData', 'CHANNEL_HOME_PATH_RE', 'channelLandingTabSuffix',
            'CHANNEL_TAB_SUFFIXES', 'channelBaseFromTabs', 'listChannelTabSuffixes'],
        {
            appState: { settings },
            document: { querySelectorAll: () => [] },
            location: { href: `https://www.youtube.com${pathname}`, pathname }
        }
    );
}

function channelFinish(owner) {
    const urls = ['featured', 'videos', 'shorts', 'streams', 'podcasts', 'playlists', 'posts', 'search']
        .map((tab) => `${owner}/${tab}`);
    return { detail: { pageType: 'channel', response: { response: { contents: { twoColumnBrowseResultsRenderer: {
        tabs: urls.map((url) => ({ tabRenderer: { endpoint: { commandMetadata: { webCommandMetadata: { url } } } } }))
    } } } } } };
}

test('an in-app visit to a channel Home tab keeps that channel\'s tab list', () => {
    const on = { redirectToVideosTab: true, channelLandingTab: 'streams' };
    const { _rw, captureNavigatedPageData } = tabCapture(on, '/@NASA');
    captureNavigatedPageData(channelFinish('/@NASA'));
    assert.deepEqual(JSON.parse(JSON.stringify(_rw.navigatedChannelTabs)), {
        path: '/@NASA',
        base: '/@NASA',
        suffixes: ['/videos', '/shorts', '/streams', '/podcasts', '/playlists', '/posts']
    });

    const broken = tabCapture(on, '/@NASA');
    broken.captureNavigatedPageData({ get detail() { throw new Error('page-made getter'); } });
    assert.deepEqual(JSON.parse(JSON.stringify(broken._rw.navigatedChannelTabs)), { path: '/@NASA', base: '', suffixes: [] },
        'a detail that throws still answers for this path, so the rule settles instead of waiting');

    // Heatmap features on too, and a curve that won't serialize: the tab list
    // still lands, and `detail` (a copy per read in Chromium) is read once.
    const both = tabCapture({ ...on, jumpToMostReplayed: true }, '/@NASA');
    const finish = channelFinish('/@NASA');
    const cyclic = {};
    cyclic.self = cyclic;
    finish.detail.response.response.frameworkUpdates = cyclic;
    let reads = 0;
    both.captureNavigatedPageData({ get detail() { reads++; return finish.detail; } });
    assert.equal(reads, 1);
    assert.equal(both._rw.navigatedPageData, null);
    assert.deepEqual(JSON.parse(JSON.stringify(both._rw.navigatedChannelTabs)).suffixes,
        ['/videos', '/shorts', '/streams', '/podcasts', '/playlists', '/posts'],
        'a curve that fails to copy must not blank the tab list');

    for (const [settings, pathname, why] of [
        [{ redirectToVideosTab: true, channelLandingTab: 'videos' }, '/@NASA', 'Videos needs no list'],
        [{ redirectToVideosTab: false, channelLandingTab: 'streams' }, '/@NASA', 'the feature is off'],
        [on, '/@NASA/videos', 'not a Home tab'],
        [on, '/watch', 'not a channel']
    ]) {
        const quiet = tabCapture(settings, pathname);
        let read = false;
        quiet.captureNavigatedPageData({ get detail() { read = true; return channelFinish('/@NASA').detail; } });
        assert.equal(read, false, `the response is not copied when ${why}`);
        assert.equal(quiet._rw.navigatedChannelTabs, null);
    }
});
