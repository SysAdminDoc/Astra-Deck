'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sources, config } = require('../helpers/source');

const MODULE_PATH = '../../extension/features/video-hider/index.js';
const MODULE_SOURCE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'extension', 'features', 'video-hider', 'index.js'),
    'utf8'
);

require('../../extension/core/text-metrics.js');
require('../../extension/core/date-time.js');
require('../../extension/core/predicate-sandbox.js');
require('../../extension/core/persisted-domains.js');

function loadModule() {
    const originalFeatures = globalThis.YTKitFeatures;
    delete require.cache[require.resolve(MODULE_PATH)];
    globalThis.YTKitFeatures = {};
    const mod = require(MODULE_PATH);
    const exported = globalThis.YTKitFeatures.hideVideosFromHome;
    globalThis.YTKitFeatures = originalFeatures;
    return { mod, exported };
}

function fakeVideoCard(title, rowText = '') {
    const titleNode = { textContent: title };
    const rows = rowText ? [{
        textContent: rowText,
        getAttribute: () => null
    }] : [];
    return {
        dataset: {},
        querySelector(selector) {
            if (selector.includes('#video-title') || selector.includes('.title')) return titleNode;
            return null;
        },
        querySelectorAll(selector) {
            if (selector === 'a[href]') return [];
            if (selector.includes('#metadata-line')) return rows;
            return [];
        }
    };
}

function predicateVideoCard({ title = 'Example video', rowText = '', short = false, membersOnly = false } = {}) {
    const titleNode = { textContent: title };
    const row = { textContent: rowText, getAttribute: () => null };
    const shortLink = {
        href: '/shorts/abc12345678',
        getAttribute: name => name === 'href' ? '/shorts/abc12345678' : null
    };
    const membersBadge = {
        textContent: 'Members only',
        getAttribute: name => name === 'aria-label' ? 'Members only' : null
    };
    return {
        querySelector(selector) {
            if (selector.includes('#video-title') || selector.includes('.title')) return titleNode;
            if (short && selector.includes('/shorts/')) return shortLink;
            if (membersOnly && selector.includes('members only')) return membersBadge;
            return null;
        },
        querySelectorAll(selector) {
            if (selector === 'a[href]') return short ? [shortLink] : [];
            if (selector.includes('#metadata-line')) return rowText ? [row] : [];
            return [];
        }
    };
}

function heuristicVideoCard({
    title = 'Example video',
    rowText = '450 views · 60 days ago · 14 uploads per week',
    description = 'Automated narration generated with text to speech.',
    channelName = 'AI Daily Facts',
    channelHref = 'https://youtube.com/@ai-daily-facts'
} = {}) {
    const titleNode = { textContent: title };
    const row = { textContent: rowText, getAttribute: () => null };
    const descriptionNode = { textContent: description, getAttribute: () => null };
    const channelNode = {
        textContent: channelName,
        getAttribute: key => key === 'href' ? channelHref : null
    };
    return {
        textContent: `${title} ${rowText} ${description} ${channelName}`,
        dataset: {},
        querySelector(selector) {
            if (selector.includes('#video-title') || selector.includes('.title')) return titleNode;
            if (selector.includes('#description') || selector.includes('.description')) return descriptionNode;
            if (selector.includes('a[href*="/@"]') || selector.includes('#channel-name')) return channelNode;
            return null;
        },
        querySelectorAll(selector) {
            if (selector === 'a[href]') return [channelNode];
            if (selector.includes('#metadata-line')) return [row];
            if (selector.includes('#channel-name') || selector.includes('a[href*="/@"]')) return [channelNode];
            return [];
        }
    };
}

function channelVideoCard(href = null, channelName = '') {
    const channelLink = href
        ? {
            href,
            getAttribute: name => name === 'href' ? href : null
        }
        : null;
    const channelNode = channelName ? { textContent: channelName } : null;
    return {
        textContent: '',
        dataset: {},
        querySelector(selector) {
            if (selector.includes('a[href*="/@"]') || selector.includes('a[href*="/channel/"]')) return channelLink;
            if (selector.includes('#channel-name a')) return channelNode;
            return null;
        },
        querySelectorAll() {
            return [];
        }
    };
}

function multiChannelVideoCard(channels) {
    const links = channels.map(({ href, name }) => ({
        href,
        textContent: name,
        getAttribute: key => key === 'href' ? href : null
    }));
    return {
        textContent: '',
        dataset: {},
        querySelector(selector) {
            if (selector.includes('a[href*="/@"]') || selector.includes('a[href*="/channel/"]')) return links[0] || null;
            if (selector.includes('#channel-name a')) return links[0] || null;
            return null;
        },
        querySelectorAll(selector) {
            if (selector.includes('a[href*="/@"]') || selector.includes('a[href*="/channel/"]')) return links;
            return [];
        }
    };
}

test('hideVideosFromHome module exports the Video Hider runtime factory', () => {
    const { mod, exported } = loadModule();
    assert.equal(typeof mod.createHideVideosFromHomeFeature, 'function');
    assert.equal(typeof exported.createHideVideosFromHomeFeature, 'function');
});

test('hideVideosFromHome factory returns the Video Hider runtime surface', () => {
    const { mod } = loadModule();
    const feature = mod.createHideVideosFromHomeFeature();

    assert.equal(feature.id, 'hideVideosFromHome');
    assert.equal(feature.name, 'Video Hider');
    assert.equal(feature.isParent, true);
    assert.equal(feature._channelKeyCache, null);
    for (const method of [
        'init',
        'destroy',
        '_processAllVideos',
        '_processVideoElement',
        '_extractChannelInfos',
        '_setBlockedChannelCache',
        '_getBlockedChannelKeys',
        '_getAllowedChannels',
        '_setAllowedChannels',
        '_addAllowedChannel',
        '_removeAllowedChannel',
        '_evaluateDirectWatchBlock',
        '_showDirectWatchInterstitial',
        '_getPredicateEvaluator',
        '_createHomeHideAllButton',
        '_createSubsHideAllButton',
        '_syncMastheadPageActions',
        '_mutationTouchesMastheadControls',
        '_removeHiddenVideosOnPage'
    ]) {
        assert.equal(typeof feature[method], 'function', 'factory feature must expose ' + method);
    }
});

test('Video Hider applies cached remote data rules but never executes remote predicates', () => {
    const { mod } = loadModule();
    const url = 'https://example.com/rules.json';
    const subscription = {
        url,
        fetchedAt: 1000,
        rules: {
            keywordFilter: 'remote keyword',
            predicateEnabled: true,
            predicateCode: 'return true;',
            hiddenVideos: ['abcdefghijk'],
            allowedVideos: ['lmnopqrstuv'],
            blockedChannels: [{ id: 'UC1234567890', name: 'Remote block' }],
            allowedChannels: []
        }
    };
    const appState = {
        settings: {
            hideVideosFilterListUrl: url,
            hideVideosKeywordFilter: '',
            hideVideosChannelAllowlist: false,
            advancedLocalPredicate: false,
            hideVideosDurationFilter: 0
        }
    };
    const feature = mod.createHideVideosFromHomeFeature({
        appState,
        storageReadJSON: (_key, fallback) => subscription || fallback,
        getBlockedChannelIdentityKeys: channel => channel?.id ? [`legacy:${channel.id}`] : [],
        normalizeBlockedChannelRecord: value => value
    });
    feature._extractVideoId = () => 'abcdefghijk';
    feature._extractChannelInfos = () => [];
    assert.equal(feature._isVideoIdHidden('abcdefghijk'), true);
    assert.equal(feature._isVideoAllowed('lmnopqrstuv'), true);

    feature._extractVideoId = () => null;
    assert.equal(feature._shouldHide(fakeVideoCard('remote keyword review')), true);
    const neutral = fakeVideoCard('ordinary review');
    assert.equal(feature._shouldHide(neutral), false, 'remote predicate code must remain inert');

    feature._extractChannelInfos = () => [{ id: 'UC1234567890', name: 'Remote block' }];
    assert.equal(feature._isChannelBlocked(feature._extractChannelInfos()), true);

    const pausedSubscription = globalThis.YTKitCore.persistedDomains.sanitizeVideoFilterListSubscription({
        ...subscription,
        staleEnabled: false
    });
    const pausedFeature = mod.createHideVideosFromHomeFeature({
        appState,
        storageReadJSON: () => pausedSubscription,
        nowFn: () => globalThis.YTKitCore.persistedDomains.FILTER_LIST_STALE_MS + 1001
    });
    assert.equal(pausedFeature._getRemoteFilterRules(), null, 'user-paused stale rules must not remain active');
});

test('Video Hider refreshes filter lists anonymously and preserves stale cache on failure', async () => {
    const { mod } = loadModule();
    const url = 'https://example.com/rules.json';
    const freshRules = {
        keywordFilter: 'fresh',
        predicateEnabled: true,
        predicateCode: 'return true;',
        hiddenVideos: ['abcdefghijk'],
        allowedVideos: [],
        blockedChannels: [],
        allowedChannels: []
    };
    const writes = [];
    const timers = [];
    const appState = { settings: { hideVideosFilterListUrl: url } };
    const payload = globalThis.YTKitCore.persistedDomains.createVideoFilterList(freshRules);
    const responseText = JSON.stringify(payload);
    const feature = mod.createHideVideosFromHomeFeature({
        appState,
        storageReadJSON: (_key, fallback) => fallback,
        storageWriteJSON: async (_key, value) => {
            writes.push(value);
            return { ok: true };
        },
        extensionFetchJson: async details => {
            assert.equal(details.credentials, 'omit');
            assert.equal(details.method, 'GET');
            assert.equal(details.timeout, 15000);
            assert.equal(details.maxResponseBytes, 1024 * 1024);
            assert.equal(details.acceptNotModified, true);
            return {
                data: payload,
                response: {
                    status: 200,
                    responseText,
                    responseHeaders: 'etag: "remote-v1"\r\nlast-modified: Wed, 12 Aug 2026 12:00:00 GMT'
                }
            };
        },
        sha256TextFn: async text => {
            assert.equal(text, responseText);
            return 'a'.repeat(64);
        },
        nowFn: () => 1000000,
        setTimeoutFn: (callback, delay) => {
            timers.push({ callback, delay });
            return timers.length;
        },
        clearTimeoutFn: () => {}
    });
    feature._processAllVideosDebounced = () => {};
    const result = await feature._refreshFilterListNow();
    assert.equal(result.ok, true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].schemaVersion, 2);
    assert.equal(writes[0].sourceUrl, url);
    assert.equal(writes[0].state, 'active');
    assert.equal(writes[0].lastKnownGood.fetchedAt, 1000000);
    assert.equal(writes[0].lastKnownGood.validatedAt, 1000000);
    assert.equal(writes[0].lastKnownGood.contentSha256, 'a'.repeat(64));
    assert.equal(writes[0].lastKnownGood.etag, '"remote-v1"');
    assert.equal(writes[0].lastKnownGood.rules.keywordFilter, 'fresh');
    assert.equal(writes[0].lastKnownGood.rules.predicateCode, '', 'remote predicate code must not persist');
    feature._scheduleFilterListRefresh();
    assert.equal(timers.length, 1);
    assert.ok(timers[0].delay >= 6 * 60 * 60 * 1000);
    assert.ok(timers[0].delay <= 7 * 24 * 60 * 60 * 1000);

    const stale = globalThis.YTKitCore.persistedDomains.sanitizeVideoFilterListSubscription({
        sourceUrl: url,
        attemptedAt: 1000,
        state: 'active',
        staleEnabled: true,
        lastKnownGood: {
            filterListVersion: 1,
            fetchedAt: 900,
            validatedAt: 900,
            httpStatus: 200,
            contentSha256: 'b'.repeat(64),
            etag: '"stale"',
            rules: { keywordFilter: 'stale', hiddenVideos: ['abcdefghijk'] }
        }
    });
    let failedWrite;
    const failedFeature = mod.createHideVideosFromHomeFeature({
        appState: { settings: { hideVideosFilterListUrl: url } },
        storageReadJSON: (_key, fallback) => stale || fallback,
        storageWriteJSON: async (_key, value) => {
            failedWrite = value;
            return { ok: true };
        },
        extensionFetchJson: async () => { throw new Error('offline'); },
        nowFn: () => 2000000
    });
    const failed = await failedFeature._refreshFilterListNow();
    assert.equal(failed.ok, false);
    assert.equal(failed.code, 'unreachable');
    assert.equal(failedWrite.state, 'stale');
    assert.equal(failedWrite.errorCode, 'unreachable');
    assert.equal(failedWrite.lastKnownGood.rules.keywordFilter, 'stale');
    assert.equal(failedWrite.lastKnownGood.fetchedAt, 900);
    assert.equal(Object.prototype.hasOwnProperty.call(failedWrite, 'error'), false, 'free-text errors must not persist');
});

test('Video Hider sends validators and refreshes last-known-good age on HTTP 304', async () => {
    const { mod } = loadModule();
    const codec = globalThis.YTKitCore.persistedDomains;
    const url = 'https://example.com/rules.json';
    const stored = codec.sanitizeVideoFilterListSubscription({
        sourceUrl: url,
        attemptedAt: 1000,
        state: 'active',
        refreshMode: 'weekly',
        lastKnownGood: {
            filterListVersion: 1,
            fetchedAt: 900,
            validatedAt: 950,
            httpStatus: 200,
            contentSha256: 'c'.repeat(64),
            etag: '"v1"',
            lastModified: 'Wed, 12 Aug 2026 12:00:00 GMT',
            rules: { keywordFilter: 'cached' }
        }
    });
    let written;
    const feature = mod.createHideVideosFromHomeFeature({
        appState: { settings: { hideVideosFilterListUrl: url } },
        storageReadJSON: () => stored,
        storageWriteJSON: async (_key, value) => { written = value; return { ok: true }; },
        extensionFetchJson: async details => {
            assert.equal(details.headers['If-None-Match'], '"v1"');
            assert.equal(details.headers['If-Modified-Since'], 'Wed, 12 Aug 2026 12:00:00 GMT');
            return { notModified: true, response: { status: 304, responseHeaders: 'etag: "v1"' } };
        },
        nowFn: () => 2000
    });
    feature._processAllVideosDebounced = () => {};
    const result = await feature._refreshFilterListNow();
    assert.equal(result.ok, true);
    assert.equal(result.notModified, true);
    assert.equal(written.state, 'active');
    assert.equal(written.httpStatus, 304);
    assert.equal(written.refreshMode, 'weekly');
    assert.equal(written.lastKnownGood.fetchedAt, 900);
    assert.equal(written.lastKnownGood.validatedAt, 2000);
    assert.equal(written.lastKnownGood.rules.keywordFilter, 'cached');
});

test('Video Hider rolls back hostile payloads and drops old rules when the source URL changes', async () => {
    const { mod } = loadModule();
    const codec = globalThis.YTKitCore.persistedDomains;
    const oldUrl = 'https://example.com/rules.json';
    const stored = codec.sanitizeVideoFilterListSubscription({
        sourceUrl: oldUrl,
        attemptedAt: 1000,
        state: 'active',
        lastKnownGood: {
            filterListVersion: 1,
            fetchedAt: 900,
            validatedAt: 900,
            httpStatus: 200,
            contentSha256: 'd'.repeat(64),
            rules: { keywordFilter: 'safe' }
        }
    });
    const hostile = {
        ...codec.createVideoFilterList({ keywordFilter: 'hostile' }),
        unexpectedCapability: 'execute'
    };
    let rollback;
    const sameSource = mod.createHideVideosFromHomeFeature({
        appState: { settings: { hideVideosFilterListUrl: oldUrl } },
        storageReadJSON: () => stored,
        storageWriteJSON: async (_key, value) => { rollback = value; return { ok: true }; },
        extensionFetchJson: async () => ({
            data: hostile,
            response: { status: 200, responseText: JSON.stringify(hostile), responseHeaders: '' }
        }),
        sha256TextFn: async () => 'e'.repeat(64),
        nowFn: () => 2000
    });
    sameSource._processAllVideosDebounced = () => {};
    const rejected = await sameSource._refreshFilterListNow();
    assert.equal(rejected.code, 'bad-format');
    assert.equal(rollback.state, 'stale');
    assert.equal(rollback.lastKnownGood.rules.keywordFilter, 'safe');

    const newUrl = 'https://lists.example.org/rules.json';
    let changed;
    const changedSource = mod.createHideVideosFromHomeFeature({
        appState: { settings: { hideVideosFilterListUrl: newUrl } },
        storageReadJSON: () => stored,
        storageWriteJSON: async (_key, value) => { changed = value; return { ok: true }; },
        extensionFetchJson: async () => { throw new Error('offline'); },
        nowFn: () => 3000
    });
    changedSource._processAllVideosDebounced = () => {};
    const failed = await changedSource._refreshFilterListNow();
    assert.equal(failed.code, 'unreachable');
    assert.equal(changed.sourceUrl, newUrl);
    assert.equal(changed.state, 'error');
    assert.equal(changed.lastKnownGood, null, 'rules from a different source must not roll forward');
});

test('Video Hider processes current card hosts and keeps the thumbnail control mounted', () => {
    for (const [label, source] of [
        ['module', MODULE_SOURCE],
        ['monolith', sources.ytkit],
        ['userscript', sources.userscript]
    ]) {
        const cardSelector = source.match(/(?:_VIDEO_SELECTORS:\s*'|const selectors = ')([^']*)'/)?.[1] || '';
        assert.match(cardSelector, /yt-lockup-view-model/, `${label} should scan modern lockup cards`);
        assert.match(cardSelector, /ytd-rich-grid-media/, `${label} should scan rich-grid media cards`);
        assert.match(cardSelector, /ytd-playlist-video-renderer/, `${label} should scan playlist video cards`);
        assert.match(
            source,
            /a\.ytLockupViewModelContentImage/,
            `${label} should recognize the modern lockup thumbnail anchor`
        );

        const styleStart = source.indexOf('.ytkit-video-hide-btn {');
        const buttonStyle = source.slice(styleStart, styleStart + 1600);
        // The control stays mounted (that is the whole point of the v4.58.6
        // fix) and sits on the INLINE-END corner, but idles neutral: a feed of
        // permanently red dots reads as damage rather than as a control.
        assert.match(buttonStyle, /opacity:\s*1\s*!important/,
            `${label} should keep the hide control visibly mounted`);
        assert.match(buttonStyle, /inset-inline-end:\s*8px\s*!important/,
            `${label} should place the hide control on the thumbnail's top-end corner`);
        assert.doesNotMatch(buttonStyle, /background:\s*rgba\(220,\s*38,\s*38/,
            `${label} should not paint the destructive tint at idle`);

        const hoverStart = source.indexOf('.ytkit-video-hide-btn:hover');
        const hoverStyle = source.slice(hoverStart, hoverStart + 400);
        assert.match(hoverStyle, /background:\s*rgba\(220,\s*38,\s*38,\s*0\.96\)\s*!important/,
            `${label} should reveal the destructive tint on hover/focus`);

        // The hover-reveal rules the always-visible control superseded must be
        // gone, not left behind reading as if hover-reveal still governs.
        assert.doesNotMatch(source, /:hover \.ytkit-video-hide-btn \{ opacity: 1; \}/,
            `${label} should not retain dead hover-reveal rules for the hide control`);
    }
});

test('Video Hider injects one top-right hide button into a modern thumbnail', () => {
    const { mod } = loadModule();
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;

    const makeNode = (tagName) => ({
        tagName,
        type: '',
        className: '',
        title: '',
        dataset: {},
        style: {},
        children: [],
        attributes: new Map(),
        listeners: new Map(),
        appendChild(child) { this.children.push(child); return child; },
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        addEventListener(name, handler) { this.listeners.set(name, handler); },
        querySelector(selector) {
            if (selector === '.ytkit-video-hide-btn') {
                return this.children.find(child => child.className === 'ytkit-video-hide-btn') || null;
            }
            return null;
        }
    });

    const thumbnail = makeNode('yt-thumbnail-view-model');
    thumbnail.matches = selector => selector === 'yt-thumbnail-view-model';
    const card = {
        dataset: {},
        matches: () => false,
        querySelector(selector) {
            return selector === 'yt-thumbnail-view-model' ? thumbnail : null;
        }
    };

    globalThis.document = { createElement: makeNode };
    globalThis.window = {
        location: { pathname: '/' },
        getComputedStyle: () => ({ position: 'static' })
    };

    try {
        const feature = mod.createHideVideosFromHomeFeature({
            appState: {
                settings: {
                    hideVideosShowQuickHideButton: true,
                    hideVideosAllowChannelBlock: false
                }
            },
            createSVG: () => makeNode('svg')
        });
        feature._isScopeEnabledForPath = () => true;

        feature._syncQuickHideButton(card, 'A1234567890');
        feature._syncQuickHideButton(card, 'A1234567890');

        const controls = thumbnail.children.filter(child => child.className === 'ytkit-video-hide-btn');
        assert.equal(controls.length, 1, 'reprocessing must not duplicate the hide control');
        assert.equal(controls[0].type, 'button');
        assert.equal(thumbnail.style.position, 'relative');
        assert.ok(controls[0].listeners.has('click'));
    } finally {
        globalThis.document = originalDocument;
        globalThis.window = originalWindow;
    }
});

test('Video Hider records explainable reasons for automatic hide rules in both runtimes', () => {
    const { mod } = loadModule();
    const appState = {
        settings: {
            hideVideosChannelAllowlist: false,
            hideVideosKeywordFilter: 'spoiler',
            hideVideosHideLive: false,
            hideVideosHideUpcoming: false,
            hideVideosHideMixes: false,
            hideVideosHidePlaylists: false,
            hideVideosHideMovies: false,
            hideVideosHideAutoDubbed: false,
            hideVideosLowViewFilter: false,
            hideVideosWatchedRatio: 0,
            advancedLocalPredicate: false,
            hideVideosDurationFilter: 0
        }
    };
    const feature = mod.createHideVideosFromHomeFeature({ appState });
    const keywordCard = fakeVideoCard('Spoiler review');
    assert.equal(feature._shouldHide(keywordCard), true);
    assert.equal(keywordCard.dataset.ytkitFilterReason, 'keyword');

    appState.settings.hideVideosKeywordFilter = '';
    appState.settings.hideVideosHideLive = true;
    const liveCard = fakeVideoCard('Neutral title', 'LIVE · 1,234 watching now');
    assert.equal(feature._shouldHide(liveCard), true);
    assert.equal(liveCard.dataset.ytkitFilterReason, 'live');

    appState.settings.hideVideosHideLive = false;
    appState.settings.hideVideosDurationFilter = 2;
    feature._extractDuration = () => 30;
    const shortCard = fakeVideoCard('Short video');
    assert.equal(feature._shouldHide(shortCard), true);
    assert.equal(shortCard.dataset.ytkitFilterReason, 'duration');

    appState.settings.hideVideosDurationFilter = 0;
    assert.equal(feature._shouldHide(keywordCard), false);
    assert.equal(keywordCard.dataset.ytkitFilterReason, undefined);

    for (const [label, source] of [['module', MODULE_SOURCE], ['monolith', sources.ytkit], ['userscript', sources.userscript]]) {
        assert.match(source, /hideVideosShowFilterReason/, `${label} should include the explain-hidden-cards setting`);
        assert.match(source, /ytkit-video-hidden-placeholder/, `${label} should include the hidden-card placeholder`);
        assert.match(source, /videoHiderHiddenReason/, `${label} should localize the hidden-card reason copy`);
    }
});

test('Video Hider placeholder follows the opt-in setting and hidden-card lifecycle', () => {
    const { mod } = loadModule();
    const originalHTMLElement = globalThis.HTMLElement;

    class FakeElement {
        constructor() {
            this.dataset = {};
            this.parentNode = null;
            this.children = [];
            this.classList = {
                values: new Set(),
                add: (...names) => names.forEach(name => this.classList.values.add(name)),
                remove: (...names) => names.forEach(name => this.classList.values.delete(name)),
                toggle: (name, enabled) => enabled ? this.classList.values.add(name) : this.classList.values.delete(name),
                contains: name => this.classList.values.has(name)
            };
            this.attributes = {};
        }

        get nextSibling() {
            if (!this.parentNode) return null;
            const index = this.parentNode.children.indexOf(this);
            return index > -1 ? this.parentNode.children[index + 1] || null : null;
        }

        get isConnected() {
            return !!this.parentNode;
        }

        setAttribute(name, value) {
            this.attributes[name] = String(value);
        }

        remove() {
            if (!this.parentNode) return;
            const index = this.parentNode.children.indexOf(this);
            if (index > -1) this.parentNode.children.splice(index, 1);
            this.parentNode = null;
        }
    }

    class FakeParent {
        constructor() {
            this.children = [];
            this.isConnected = true;
        }

        appendChild(element) {
            element.parentNode = this;
            this.children.push(element);
            return element;
        }

        insertBefore(element, reference) {
            element.parentNode = this;
            const index = reference ? this.children.indexOf(reference) : -1;
            if (index > -1) this.children.splice(index, 0, element);
            else this.children.push(element);
            return element;
        }
    }

    globalThis.HTMLElement = FakeElement;
    try {
        const appState = { settings: { hideVideosShowFilterReason: true, hideVideosRemoveHiddenCards: false } };
        const parent = new FakeParent();
        const card = new FakeElement();
        card.dataset.ytkitVideoId = 'abc12345678';
        parent.appendChild(card);
        const feature = mod.createHideVideosFromHomeFeature({
            appState,
            documentRef: { createElement: () => new FakeElement() },
            t: (key, fallback) => key === 'videoHiderReasonKeyword' ? 'a keyword rule' : fallback
        });

        assert.equal(feature._applyVideoHiddenState(card, true, 'keyword'), true);
        assert.equal(parent.children.length, 2);
        assert.equal(parent.children[0], card);
        assert.equal(parent.children[1].className, 'ytkit-video-hidden-placeholder');
        assert.equal(parent.children[1].textContent, 'Hidden by Video Hider: a keyword rule');
        assert.equal(card.classList.contains('ytkit-video-hidden'), true);

        appState.settings.hideVideosShowFilterReason = false;
        feature._applyVideoHiddenState(card, false);
        assert.equal(parent.children.length, 1);
        assert.equal(card.classList.contains('ytkit-video-hidden'), false);
        assert.equal(card.dataset.ytkitFilterReason, undefined);
    } finally {
        globalThis.HTMLElement = originalHTMLElement;
    }
});

test('Video Hider extracts every credited channel and applies blocked/allowed decisions across the card', () => {
    const { mod } = loadModule();
    const storage = new Map();
    const appState = {
        settings: {
            hideVideosChannelAllowlist: false,
            hideVideosKeywordFilter: '',
            hideVideosHideLive: false,
            hideVideosHideUpcoming: false,
            hideVideosHideMixes: false,
            hideVideosHidePlaylists: false,
            hideVideosHideMovies: false,
            hideVideosHideAutoDubbed: false,
            hideVideosLowViewFilter: false,
            hideVideosWatchedRatio: 0,
            advancedLocalPredicate: false,
            hideVideosDurationFilter: 0
        }
    };
    const normalizeChannel = entry => {
        const id = String(entry?.id || '').trim()
            .replace(/^https?:\/\/(?:www\.)?youtube\.com\//i, '');
        return id ? { id, name: entry.name || id, source: entry.source || 'dom' } : null;
    };
    const feature = mod.createHideVideosFromHomeFeature({
        appState,
        storageRead: (key, fallback) => storage.has(key) ? storage.get(key) : fallback,
        storageWrite: (key, value) => storage.set(key, value),
        sanitizeImportedBlockedChannels: value => Array.isArray(value) ? value : [],
        sanitizeImportedAllowedChannels: value => Array.isArray(value) ? value : [],
        normalizeBlockedChannelRecord: normalizeChannel,
        getBlockedChannelIdentityKeys: channel => channel?.id ? [String(channel.id).toLowerCase()] : []
    });
    const card = multiChannelVideoCard([
        { href: 'https://youtube.com/@first', name: 'First uploader' },
        { href: 'https://youtube.com/@second', name: 'Second uploader' }
    ]);

    const infos = feature._extractChannelInfos(card);
    assert.deepEqual(infos.map(info => info.name), ['First uploader', 'Second uploader']);

    feature._setBlockedChannels([{ id: '@second', name: 'Second uploader' }]);
    assert.equal(feature._isChannelBlocked(infos), true, 'any blocked participant must match the card');
    assert.equal(feature._shouldHide(card), true, 'a blocked participant must hide the collaboration card');
    assert.equal(card.dataset.ytkitFilterReason, 'blockedChannel');

    appState.settings.hideVideosChannelAllowlist = true;
    feature._setBlockedChannels([{ id: '@first', name: 'First uploader' }]);
    feature._setAllowedChannels([{ id: '@second', name: 'Second uploader' }]);
    assert.equal(feature._shouldHide(card), false, 'allowlist mode must remain an override when any participant is allowed');
});

test('Video Hider ignores live/upcoming words in titles but detects metadata rows', () => {
    const { mod } = loadModule();
    const feature = mod.createHideVideosFromHomeFeature();

    const titleOnly = feature._extractVideoMetadata(fakeVideoCard(
        'The Premiere LIVE at Wembley — Upcoming tech starts in 5 minutes'
    ));
    assert.equal(titleOnly.isLive, false);
    assert.equal(titleOnly.isUpcoming, false);

    const upcomingRow = feature._extractVideoMetadata(fakeVideoCard(
        'The Premiere', 'UPCOMING · Set reminder'
    ));
    assert.equal(upcomingRow.isUpcoming, true);

    const liveRow = feature._extractVideoMetadata(fakeVideoCard(
        'LIVE at Wembley', 'LIVE · 1,234 watching now'
    ));
    assert.equal(liveRow.isLive, true);
});

test('Video Hider live/upcoming regex pins read rows in module and monolith', () => {
    for (const [label, source] of [['module', MODULE_SOURCE], ['monolith', sources.ytkit]]) {
        const start = source.indexOf('_extractVideoMetadata(element) {');
        assert.ok(start > -1, `${label} must expose video metadata extraction`);
        const end = source.indexOf('\n            },', start);
        assert.ok(end > start, `${label} metadata extraction block must be bounded`);
        const block = source.slice(start, end);

        assert.match(block, /isLive:[\s\S]*?\.test\(normalizedRowsText\) && !hasDuration/,
            `${label} live fallback must inspect metadata rows`);
        assert.match(block, /isUpcoming:[\s\S]*?\.test\(normalizedRowsText\)/,
            `${label} upcoming detection must inspect metadata rows`);
        assert.doesNotMatch(block, /\.test\(metadataText\)/,
            `${label} type detection must not scan the title-inclusive metadata text`);
    }
});

test('Video Hider type predicates recognize localized metadata rows', () => {
    const { mod } = loadModule();
    const feature = mod.createHideVideosFromHomeFeature();
    const fixtures = [
        {
            locale: 'Spanish',
            live: 'EN DIRECTO · 1,2 mil espectadores',
            upcoming: 'Programado para mañana · Establecer recordatorio',
            mix: 'Mezcla',
            playlist: 'Lista de reproducción'
        },
        {
            locale: 'Japanese',
            live: 'ライブ · 視聴中',
            upcoming: '配信予定 · リマインダーを設定',
            mix: 'ミックス',
            playlist: '再生リスト'
        },
        {
            locale: 'Arabic',
            live: 'بث مباشر · يشاهد الآن',
            upcoming: 'مجدول · تعيين تذكير',
            mix: 'ميكس',
            playlist: 'قائمة تشغيل'
        },
        {
            // Korean was absent from this list, which is how all four predicates
            // shipped dead on it: NFD decomposes Hangul into conjoining Jamo,
            // so a precomposed literal could never match the normalized text.
            locale: 'Korean',
            live: '라이브 · 시청 중',
            upcoming: '예정 · 알림 설정',
            mix: '믹스',
            playlist: '재생목록'
        }
    ];

    for (const fixture of fixtures) {
        assert.equal(feature._extractVideoMetadata(fakeVideoCard('Neutral title', fixture.live)).isLive, true,
            `${fixture.locale} live metadata should match`);
        assert.equal(feature._extractVideoMetadata(fakeVideoCard('Neutral title', fixture.upcoming)).isUpcoming, true,
            `${fixture.locale} upcoming metadata should match`);
        assert.equal(feature._extractVideoMetadata(fakeVideoCard('Neutral title', fixture.mix)).isMix, true,
            `${fixture.locale} mix metadata should match`);
        assert.equal(feature._extractVideoMetadata(fakeVideoCard('Neutral title', fixture.playlist)).isPlaylist, true,
            `${fixture.locale} playlist metadata should match`);
    }
});

test('Video Hider predicate context derives age, Shorts, and members-only fields', () => {
    const { mod } = loadModule();
    const originalWindow = globalThis.window;
    globalThis.window = { location: { pathname: '/' } };
    try {
        const markedCard = predicateVideoCard({ rowText: '2 days ago', short: true, membersOnly: true });
        const baseCtx = mod.createHideVideosFromHomeFeature({
            PredicateSandbox: globalThis.YTKitCore.createPredicateSandbox()
        })._buildPredicateCtx(markedCard, 'abc12345678', {
            id: 'UC123',
            handle: '@example',
            name: 'Example channel'
        });

        assert.equal(baseCtx.ageDays, 2);
        assert.equal(baseCtx.isShort, true);
        assert.equal(baseCtx.isMembersOnly, true);

        for (const code of ['ctx.ageDays > 1', 'ctx.isShort', 'ctx.isMembersOnly']) {
            const feature = mod.createHideVideosFromHomeFeature({
                appState: { settings: { advancedLocalPredicateCode: code } },
                PredicateSandbox: globalThis.YTKitCore.createPredicateSandbox()
            });
            assert.equal(feature._getPredicateEvaluator()(baseCtx), true, `predicate should match ${code}`);
        }

        const unknownCtx = mod.createHideVideosFromHomeFeature()._buildPredicateCtx(
            predicateVideoCard({ rowText: '1,234 views' }),
            'abc12345678',
            null
        );
        assert.equal(unknownCtx.ageDays, null);
        assert.equal(unknownCtx.isShort, null);
        assert.equal(unknownCtx.isMembersOnly, null);
    } finally {
        globalThis.window = originalWindow;
    }
});

test('Video Hider local low-signal heuristics are independent and predicate-visible', () => {
    const { mod } = loadModule();
    const settings = {
        hideVideosSyntheticNarrationFilter: false,
        hideVideosLowSignalFilter: false,
        hideVideosLowSignalMinViews: 1000,
        hideVideosLowSignalMinAgeDays: 30,
        hideVideosUploadCadenceFilter: false,
        hideVideosUploadCadencePerDay: 1,
        hideVideosLowViewFilter: false,
        hideVideosWatchedRatio: 0,
        hideVideosKeywordFilter: '',
        advancedLocalPredicate: false,
        advancedLocalPredicateCode: ''
    };
    const feature = mod.createHideVideosFromHomeFeature({
        appState: { settings },
        PredicateSandbox: globalThis.YTKitCore.createPredicateSandbox()
    });
    const card = heuristicVideoCard();
    const metadata = feature._extractVideoMetadata(card);

    assert.equal(metadata.syntheticNarration, true);
    assert.equal(metadata.uploadCadencePerDay, 2);
    assert.equal(metadata.views, 450);
    assert.equal(metadata.ageDays, 60);
    assert.equal(feature._matchesMetadataFilters(card, metadata).hide, false,
        'all new lanes must be opt-in');

    settings.hideVideosSyntheticNarrationFilter = true;
    assert.deepEqual(feature._matchesMetadataFilters(card, metadata), {
        hide: true,
        reason: 'synthetic-narration'
    });
    settings.hideVideosSyntheticNarrationFilter = false;

    settings.hideVideosLowSignalFilter = true;
    assert.deepEqual(feature._matchesMetadataFilters(card, metadata), {
        hide: true,
        reason: 'low-signal'
    });
    settings.hideVideosLowSignalFilter = false;

    settings.hideVideosUploadCadenceFilter = true;
    assert.deepEqual(feature._matchesMetadataFilters(card, metadata), {
        hide: true,
        reason: 'upload-cadence'
    });
    settings.hideVideosUploadCadenceFilter = false;

    const sparse = heuristicVideoCard({
        title: 'Ordinary upload',
        rowText: '',
        description: '',
        channelName: 'Ordinary channel',
        channelHref: 'https://youtube.com/@ordinary'
    });
    settings.hideVideosLowSignalFilter = true;
    settings.hideVideosUploadCadenceFilter = true;
    assert.equal(feature._matchesMetadataFilters(sparse).hide, false,
        'missing view, age, and cadence metadata must fail open');

    const originalWindow = globalThis.window;
    globalThis.window = { location: { pathname: '/' } };
    try {
        const ctx = feature._buildPredicateCtx(card, 'abc12345678', {
            id: 'UC123',
            handle: '@ai-daily-facts',
            name: 'AI Daily Facts'
        });
        assert.equal(ctx.syntheticNarration, true);
        assert.equal(ctx.uploadCadencePerDay, 2);
        assert.match(ctx.descriptionText, /automated narration/);
        assert.ok(globalThis.YTKitCore.PREDICATE_CONTEXT_FIELDS.includes('syntheticNarration'));

        const compiled = globalThis.YTKitCore.createPredicateSandbox().compile(
            'ctx.syntheticNarration === true && ctx.descriptionText.includes("automated") && ctx.uploadCadencePerDay > 1 && ctx.viewCount < 1000 && ctx.ageDays > 30'
        );
        assert.equal(compiled.ok, true);
        assert.equal(compiled.evaluator(ctx), true);
    } finally {
        globalThis.window = originalWindow;
    }

    settings.hideVideosLowSignalFilter = false;
    settings.hideVideosUploadCadenceFilter = false;
    settings.hideVideosSyntheticNarrationFilter = true;
    assert.equal(feature._shouldHide(card), true);
    assert.equal(card.dataset.ytkitFilterReason, 'synthetic-narration',
        'hidden cards must name the heuristic that fired');
});

test('Video Hider channel allowlist is fail-open when empty and isolated from the blocklist', () => {
    const { mod } = loadModule();
    const storage = new Map();
    const appState = {
        settings: {
            hideVideosChannelAllowlist: true,
            hideVideosKeywordFilter: '',
            hideVideosHideLive: false,
            hideVideosHideUpcoming: false,
            hideVideosHideMixes: false,
            hideVideosHidePlaylists: false,
            hideVideosHideMovies: false,
            hideVideosHideAutoDubbed: false,
            hideVideosLowViewFilter: false,
            hideVideosWatchedRatio: 0,
            advancedLocalPredicate: false,
            hideVideosDurationFilter: 0
        }
    };
    const normalizeChannel = entry => {
        const raw = typeof entry === 'string'
            ? entry
            : (entry.channelId || entry.id || entry.handle || entry.url || '');
        const id = String(raw).replace(/^https?:\/\/(?:www\.)?youtube\.com\//i, '');
        return id
            ? {
                id,
                name: typeof entry === 'object' && entry.name ? entry.name : id,
                ...(typeof entry === 'object' && entry.source ? { source: entry.source } : {})
            }
            : null;
    };
    const feature = mod.createHideVideosFromHomeFeature({
        appState,
        storageRead: (key, fallback) => storage.has(key) ? storage.get(key) : fallback,
        storageWrite: (key, value) => storage.set(key, value),
        sanitizeImportedBlockedChannels: value => Array.isArray(value) ? value : [],
        sanitizeImportedAllowedChannels: value => Array.isArray(value) ? value : [],
        normalizeBlockedChannelRecord: normalizeChannel,
        getBlockedChannelIdentityKeys: channel => channel?.id ? [String(channel.id).toLowerCase()] : []
    });
    const allowedCard = channelVideoCard('https://youtube.com/@allowed', 'Allowed Channel');
    const otherCard = channelVideoCard('https://youtube.com/@other', 'Other Channel');
    const unknownCard = channelVideoCard();

    assert.equal(feature._shouldHide(allowedCard), false, 'an empty allowlist must not hide identified channels');
    assert.equal(feature._shouldHide(otherCard), false, 'an empty allowlist must fail open for every channel');
    assert.equal(feature._shouldHide(unknownCard), false, 'an unresolvable channel must fail open');

    feature._addAllowedChannel({ id: '@allowed', name: 'Allowed Channel', source: 'settings' });
    assert.equal(feature._shouldHide(allowedCard), false, 'listed channels must remain visible');
    assert.equal(feature._shouldHide(otherCard), true, 'unlisted channels must be hidden when the allowlist is populated');
    assert.equal(otherCard.dataset.ytkitFilterReason, 'channelNotAllowed');
    assert.deepEqual(storage.get('ytkit-allowed-channels'), [{ id: '@allowed', name: 'Allowed Channel', source: 'settings' }]);

    appState.settings.hideVideosChannelAllowlist = false;
    feature._setBlockedChannels([{ id: '@other', name: 'Other Channel' }]);
    assert.equal(feature._shouldHide(otherCard), true, 'blocklist mode must still hide blocked channels');
    assert.equal(feature._shouldHide(allowedCard), false, 'blocklist mode must not reinterpret the allowlist');
    assert.deepEqual(storage.get('ytkit-allowed-channels'), [{ id: '@allowed', name: 'Allowed Channel', source: 'settings' }]);
});

test('Video Hider strips stateful regex flags before boolean matching', () => {
    assert.match(MODULE_SOURCE, /regexMatch\[2\]\.replace\(\/\[gy\]\/g, ''\)/,
        'Video Hider module must strip global/sticky flags');
    assert.match(sources.ytkit, /regexMatch\[2\]\.replace\(\/\[gy\]\/g, ''\)/,
        'Video Hider monolith fallback must strip global/sticky flags');
    assert.ok(
        (sources.userscript.match(/regexMatch\[2\]\.replace\(\/\[gy\]\/g, ''\)/g) || []).length >= 2,
        'userscript module and fallback must strip global/sticky flags'
    );

    const stable = new RegExp('spam', 'gi'.replace(/[gy]/g, ''));
    assert.equal(stable.global, false);
    assert.equal(stable.sticky, false);
    assert.equal(stable.test('spam'), true);
    assert.equal(stable.test('spam'), true);
});

test('masthead quick actions synchronize without a post-paint delay', () => {
    const { mod } = loadModule();
    const feature = mod.createHideVideosFromHomeFeature();
    const originalWindow = globalThis.window;
    const events = [];

    feature._isScopeEnabledForPath = () => true;
    feature._createSubsHideAllButton = () => events.push('create-subs');
    feature._removeSubsHideAllButton = () => events.push('remove-subs');
    feature._createHomeHideAllButton = () => events.push('create-home');
    feature._removeHomeHideAllButton = () => events.push('remove-home');

    try {
        globalThis.window = { location: { pathname: '/feed/subscriptions' } };
        feature._syncMastheadPageActions();
        assert.deepEqual(events.splice(0), ['create-subs', 'remove-home']);

        globalThis.window.location.pathname = '/';
        feature._syncMastheadPageActions();
        assert.deepEqual(events.splice(0), ['remove-subs', 'create-home']);

        globalThis.window.location.pathname = '/watch';
        feature._syncMastheadPageActions();
        assert.deepEqual(events.splice(0), ['remove-subs', 'remove-home']);
    } finally {
        globalThis.window = originalWindow;
    }

    const mastheadTarget = {
        nodeType: 1,
        matches: selector => selector === '#masthead #end #buttons',
        closest: () => null,
        querySelector: () => null
    };
    const unrelatedTarget = {
        nodeType: 1,
        matches: () => false,
        closest: () => null,
        querySelector: () => null
    };
    assert.equal(feature._mutationTouchesMastheadControls([{ target: mastheadTarget }]), true);
    assert.equal(feature._mutationTouchesMastheadControls([{ target: unrelatedTarget }]), false);

    for (const source of [MODULE_SOURCE, sources.ytkit, sources.userscript]) {
        assert.doesNotMatch(source, /setTimeout\(\(\) => this\._create(?:Subs|Home)HideAllButton\(\), 1000\)/,
            'masthead actions must not wait one second after native controls paint');
        assert.match(source, /if \(this\._mutationTouchesMastheadControls\(mutations\)\) \{\s*this\._syncMastheadPageActions\(\);\s*\}/,
            'the DOM observer must synchronize actions when the masthead is created or replaced');
    }
});

test('hideVideosFromHome monolith prefers the module runtime factory before inline fallback', () => {
    const factoryNeedle = 'globalThis.YTKitFeatures?.hideVideosFromHome?.createHideVideosFromHomeFeature?.({';
    const factoryIndex = sources.ytkit.indexOf(factoryNeedle);
    assert.ok(factoryIndex > -1, 'ytkit.js must construct hideVideosFromHome through the module factory');
    const fallbackIndex = sources.ytkit.indexOf("id: 'hideVideosFromHome'", factoryIndex);
    assert.ok(fallbackIndex > factoryIndex, 'ytkit.js must retain the inline hideVideosFromHome fallback after the factory call');
    const dependencyBag = sources.ytkit.slice(factoryIndex, fallbackIndex);
    assert.ok(dependencyBag.includes('}) || {'),
        'module factory path must fall back to the inline feature object');

    for (const dep of [
        'Z',
        'appState',
        'DebugManager',
        'setSettingsPanelOpen',
        'storageRead',
        'storageReadJSON',
        'storageWrite',
        'sanitizeImportedHiddenVideos',
        'sanitizeImportedVideoIdList',
        'sanitizeImportedBlockedChannels',
        'sanitizeImportedAllowedChannels',
        'IMPORT_LIMITS',
        'VIDEO_ID_PATTERN',
        'normalizeBlockedChannelRecord',
        'getBlockedChannelIdentityKeys',
        'isPlainObject',
        'showToast',
        'PredicateSandbox',
        'addNavigateRule',
        'removeNavigateRule',
        'getVideoId',
        'getPlayerResponseGlobal',
        'extensionFetchJson',
        'storageWriteJSON',
        'filterListCodec',
        't',
        'runBudgetedElementBatch',
        'injectStyle'
    ]) {
        assert.ok(dependencyBag.includes(dep), 'ytkit.js factory dependency bag must include ' + dep);
    }
    assert.ok(dependencyBag.includes('createSVG: globalThis.YTKitCore?.createSVG'),
        'factory dependency bag must avoid the later-declared local createSVG binding');
});

test('hideVideosFromHome inline fallback keeps filter-list refresh parity', () => {
    for (const method of [
        '_readFilterListSubscription',
        '_refreshFilterList',
        '_scheduleFilterListRefresh',
        '_refreshFilterListNow',
        '_initializeFilterListSubscription',
        '_getEffectiveKeywordFilters'
    ]) {
        assert.ok(sources.ytkit.includes(`${method}(`),
            `ytkit.js inline fallback must expose ${method}`);
    }
    assert.match(sources.ytkit, /MONOLITH_FILTER_LIST_CODEC = globalThis\.YTKitCore\?\.persistedDomains/,
        'inline fallback must use the shared filter-list codec when available');
    assert.match(sources.ytkit, /credentials: 'omit'/,
        'inline fallback refreshes must omit ambient credentials');
    assert.match(sources.ytkit, /predicateEnabled: false,\s*predicateCode: ''/,
        'inline fallback must never execute predicate code received from a remote list');
});

test('hideVideosFromHome budgets large feed scans and cancels stale batches', () => {
    assert.match(MODULE_SOURCE, /runBudgetedElementBatch = \(items, callback\) =>/,
        'module factory must accept an injected budgeted batch runner');
    assert.match(MODULE_SOURCE, /_processAllBudgetHandle: null/,
        'full-page scan handle must be tracked for cancellation');
    assert.match(MODULE_SOURCE, /_mutationBudgetHandle: null/,
        'mutation scan handle must be tracked for cancellation');
    assert.match(MODULE_SOURCE, /_cancelBudgetedScans\(\)/,
        'feature must expose a shared cancellation helper');
    assert.match(MODULE_SOURCE, /label: 'video-hider:process-all'/,
        'all-card scans must carry a diagnostic label');
    assert.match(MODULE_SOURCE, /label: 'video-hider:mutation-batch'/,
        'mutation batches must carry a diagnostic label');
    assert.match(MODULE_SOURCE, /chunkSize: 60/,
        'full-page scans should use a bounded chunk size');
    assert.match(MODULE_SOURCE, /chunkSize: 80/,
        'mutation batches should use a bounded chunk size');
    assert.match(MODULE_SOURCE, /DebugManager\.log\('VideoHider', `Budgeted scan/,
        'slow multi-chunk scans must be logged for diagnostics');
    assert.match(MODULE_SOURCE, /this\._cancelBudgetedScans\(\);[\s\S]*this\._restoreRemovedVideoNodes/,
        'destroy must cancel pending scans before restoring DOM state');
});

test('_parseCompactCount preserves comma-grouped view counts (no decimal corruption)', () => {
    const { mod } = loadModule();
    const feature = mod.createHideVideosFromHomeFeature();

    // Regression: "1,234 views" must not be read as 1 (the old replace(',', '.') bug).
    assert.equal(feature._parseCompactCount('1,234 views'), 1234);
    assert.equal(feature._parseCompactCount('12,345 views'), 12345);
    assert.equal(feature._parseCompactCount('1,234,567 views'), 1234567);
    assert.equal(feature._parseCompactCount('987 views'), 987);
    assert.equal(feature._parseCompactCount('42 watching'), 42);

    // Suffixed counts keep their decimal semantics.
    assert.equal(feature._parseCompactCount('1.2M views'), 1200000);
    assert.equal(feature._parseCompactCount('12.5K views'), 12500);
    assert.equal(feature._parseCompactCount('3B views'), 3000000000);

    // Sentinels.
    assert.equal(feature._parseCompactCount('No views'), 0);
    assert.equal(feature._parseCompactCount('Streamed 3 years ago'), null);

    // Empty text is "no data", not "0 views" — the low-view guard below
    // depends on the difference.
    assert.equal(feature._parseCompactCount(''), null);
});

test('a card with no rendered metadata is not hidden as low-view', () => {
    const { mod } = loadModule();
    const feature = mod.createHideVideosFromHomeFeature({
        appState: {
            settings: {
                hideVideosLowViewFilter: true,
                hideVideosLowViewThreshold: 1000
            }
        }
    });

    // Cards processed before Polymer hydrates carry a title but no metadata
    // row yet. Reading that as 0 views hid them permanently as "low-view".
    const unhydrated = fakeVideoCard('Freshly rendered card');
    assert.equal(feature._extractViewCount(unhydrated), null,
        'missing metadata must report "no data", not zero views');
    assert.equal(feature._matchesMetadataFilters(unhydrated).hide, false);

    // A genuinely zero-view card still hides.
    const zeroViews = fakeVideoCard('Brand new upload', 'No views  2 minutes ago');
    assert.equal(feature._extractViewCount(zeroViews), 0);
    assert.deepEqual(feature._matchesMetadataFilters(zeroViews), {
        hide: true,
        reason: 'low-view'
    });

    // Subscriber metadata keeps the same contract for predicate authors.
    assert.equal(feature._extractSubsCount(''), null);
});

test('Video Hider parses localized view and subscriber counts structurally', () => {
    const { mod } = loadModule();
    const feature = mod.createHideVideosFromHomeFeature({
        appState: {
            settings: {
                hideVideosLowViewFilter: true,
                hideVideosLowViewThreshold: 1000
            }
        }
    });

    assert.equal(feature._parseCompactCount('987 Aufrufe'), 987);
    assert.equal(feature._parseCompactCount('12.3万 回視聴'), 123000);
    assert.equal(feature._extractSubsCount('1,2 Mio. Abonnenten'), 1_200_000);
    assert.equal(feature._extractSubsCount('12.3万 登録者'), 123000);

    const germanCard = fakeVideoCard('Lokales Video', '987 Aufrufe');
    assert.equal(feature._extractViewCount(germanCard), 987);
    assert.deepEqual(feature._matchesMetadataFilters(germanCard), {
        hide: true,
        reason: 'low-view'
    });
});

test('_extractViewCount reads grouped counts from a card element (popular video not misread)', () => {
    const { mod } = loadModule();
    const feature = mod.createHideVideosFromHomeFeature();

    // Minimal fake card: a metadata line carrying the grouped view count, like
    // YouTube renders. The headline bug made this read as 1, so a low-view
    // filter wrongly hid popular videos.
    function fakeCard(metaText) {
        const meta = {
            textContent: metaText,
            getAttribute: () => null
        };
        return {
            querySelectorAll: () => [meta],
            textContent: metaText
        };
    }

    assert.equal(feature._extractViewCount(fakeCard('1,234,567 views')), 1234567);
    assert.equal(feature._extractViewCount(fakeCard('1.2M views')), 1200000);
    assert.equal(feature._extractViewCount(fakeCard('No views')), 0);
    // Cards with no parseable count return null so a low-view filter can tell
    // "no data" apart from "zero views" and leave them alone.
    assert.equal(feature._extractViewCount(fakeCard('Recommended for you')), null);
});

test('hideVideosFromHome module loads before ytkit.js in content scripts', () => {
    for (const scriptGroup of config.manifest.content_scripts) {
        const scripts = scriptGroup.js || [];
        const ytkitIndex = scripts.indexOf('ytkit.js');
        if (ytkitIndex === -1) continue;
        const moduleIndex = scripts.indexOf('features/video-hider/index.js');
        assert.ok(moduleIndex > -1, 'manifest content script must include video-hider module');
        assert.ok(moduleIndex < ytkitIndex, 'video-hider module must load before ytkit.js');
    }
});

test('isMovie and isAutoDubbed match localised metadata, not just English', () => {
    const { mod } = loadModule();
    const feature = mod.createHideVideosFromHomeFeature();

    // These two predicates were the only members of their family still matching
    // English alone, so they were permanently false on 10 of the 11 shipped
    // locales — the filter silently did nothing for those users.
    const fixtures = [
        { locale: 'English', movie: 'Movie · Free with ads', autoDubbed: 'Auto-dubbed · Audio track' },
        { locale: 'Spanish', movie: 'Película · Gratis con anuncios', autoDubbed: 'Doblado automáticamente · Pista de audio' },
        { locale: 'German', movie: 'Film · Kostenlos mit Werbung', autoDubbed: 'Automatisch synchronisiert · Tonspur' },
        { locale: 'French', movie: 'Film · Gratuit avec publicités', autoDubbed: 'Doublage · Piste audio' },
        { locale: 'Italian', movie: 'Film · Gratis con annunci', autoDubbed: 'Doppiato automaticamente · Traccia audio' },
        { locale: 'Portuguese', movie: 'Filme · Grátis com anúncios', autoDubbed: 'Dublado automaticamente · Faixa de áudio' },
        { locale: 'Russian', movie: 'Фильм · Бесплатно с рекламой', autoDubbed: 'Автоматический дубляж · Аудиодорожка' },
        { locale: 'Japanese', movie: '映画 · 広告付きで無料', autoDubbed: '自動吹き替え · 音声トラック' },
        { locale: 'Korean', movie: '영화 · 광고 포함 무료', autoDubbed: '자동 더빙 · 오디오 트랙' },
        { locale: 'Chinese', movie: '电影 · 含广告免费', autoDubbed: '自动配音 · 音轨' },
        { locale: 'Arabic', movie: 'فيلم · مجاني مع الإعلانات', autoDubbed: 'مدبلج تلقائيًا · المسار الصوتي' }
    ];

    for (const fixture of fixtures) {
        assert.equal(
            feature._extractVideoMetadata(fakeVideoCard('Neutral title', fixture.movie)).isMovie, true,
            `${fixture.locale} movie metadata should match`
        );
        assert.equal(
            feature._extractVideoMetadata(fakeVideoCard('Neutral title', fixture.autoDubbed)).isAutoDubbed, true,
            `${fixture.locale} auto-dubbed metadata should match`
        );
    }

    // Both predicates read metadata rows only, never the title — matching titles
    // hid videos called "movie review" or "how to mix audio". Keep that true.
    const titled = feature._extractVideoMetadata(
        fakeVideoCard('Movie review: the best dubbed film of the year', '1.2M views · 3 days ago')
    );
    assert.equal(titled.isMovie, false, 'a movie-ish TITLE must not set isMovie');
    assert.equal(titled.isAutoDubbed, false, 'a dubbed-ish TITLE must not set isAutoDubbed');

    // Ordinary metadata rows in each script must stay negative.
    for (const row of ['1.2M views · 3 days ago', '120 k vues · il y a 3 jours', '10万回視聴 · 3 日前', '120 тыс. просмотров · 3 дня назад']) {
        const plain = feature._extractVideoMetadata(fakeVideoCard('Neutral title', row));
        assert.equal(plain.isMovie, false, `plain row must not match isMovie: ${row}`);
        assert.equal(plain.isAutoDubbed, false, `plain row must not match isAutoDubbed: ${row}`);
    }
});

test('Video Hider processes a nested lockup card once, not once per matching host', () => {
    const { mod } = loadModule();
    const feature = mod.createHideVideosFromHomeFeature({
        appState: { settings: {} }
    });

    // Current feeds render ytd-rich-item-renderer > yt-lockup-view-model, and
    // both tags are scanned, so without the guard every card is extracted,
    // predicate-evaluated and painted twice per pass.
    const makeHost = (tagName, parent) => {
        const node = { tagName, dataset: {}, parentElement: parent || null };
        node.closest = (selector) => {
            let cursor = node;
            while (cursor) {
                if (selector.split(',').some(part => part.trim().toLowerCase() === cursor.tagName.toLowerCase())) {
                    return cursor;
                }
                cursor = cursor.parentElement;
            }
            return null;
        };
        return node;
    };

    const outer = makeHost('ytd-rich-item-renderer', null);
    const inner = makeHost('yt-lockup-view-model', outer);

    assert.equal(feature._isNestedCardHost(outer), false,
        'the outer card host owns the verdict and must be processed');
    assert.equal(feature._isNestedCardHost(inner), true,
        'the inner lockup of an already-scanned card must be skipped');

    const standalone = makeHost('yt-lockup-view-model', null);
    assert.equal(feature._isNestedCardHost(standalone), false,
        'a bare lockup card (watch sidebar) has no scanned ancestor and must be processed');

    const processed = [];
    feature._isScopeEnabledForPath = () => true;
    feature._extractVideoId = () => 'A1234567890';
    feature._shouldHide = () => false;
    feature._applyVideoHiddenState = (el) => { processed.push(el.tagName); return false; };
    feature._applyMarkedWatchedState = () => {};
    feature._syncQuickHideButton = () => {};
    feature._syncMarkWatchedButton = () => {};

    feature._processVideoElement(outer);
    feature._processVideoElement(inner);
    assert.deepEqual(processed, ['ytd-rich-item-renderer'],
        'only the outer host should reach the hidden-state pass');

    assert.equal(feature._processVideoElementWithResult(inner), false,
        'the result-returning path must also skip nested hosts');
});

test('rule-driven filters fail open when they would hide most of a feed', () => {
    const { mod } = loadModule();
    const feature = mod.createHideVideosFromHomeFeature({ appState: { settings: {} } });

    // A card that reports a hidden state plus the reason that hid it, the way
    // _applyVideoHiddenState leaves it.
    const makeCard = (reason) => {
        const classes = new Set(reason ? ['ytkit-video-hidden'] : []);
        return {
            dataset: reason ? { ytkitFilterReason: reason } : {},
            classList: {
                contains: (name) => classes.has(name),
                add: (name) => classes.add(name),
                remove: (name) => classes.delete(name)
            },
            _classes: classes
        };
    };

    const revealed = [];
    feature._applyVideoHiddenState = (el, shouldHide) => {
        if (!shouldHide) { el.classList.remove('ytkit-video-hidden'); revealed.push(el); }
        return !!shouldHide;
    };

    // 10 cards, 6 hidden by a keyword rule: far over the 25% ceiling.
    const overreaching = Array.from({ length: 6 }, () => makeCard('keyword'))
        .concat(Array.from({ length: 4 }, () => makeCard(null)));
    assert.equal(feature._enforceRuleHideRatioGuard(overreaching), true,
        'a rule matching 60% of the feed must fail open');
    assert.equal(revealed.length, 6, 'every rule-hidden card must be revealed');
    assert.deepEqual(feature._lastRuleHideGuard, { hidden: 6, total: 10 });

    // Two of ten is within the ceiling and must stay hidden.
    revealed.length = 0;
    const reasonable = Array.from({ length: 2 }, () => makeCard('predicate'))
        .concat(Array.from({ length: 8 }, () => makeCard(null)));
    assert.equal(feature._enforceRuleHideRatioGuard(reasonable), false);
    assert.equal(revealed.length, 0, 'a normal match rate must not be disturbed');

    // Deliberate choices are exempt: a user who blocked channels or hid videos
    // by hand keeps them hidden however much of the feed that covers, and
    // allowlist mode hides everything unlisted by design.
    for (const reason of ['manual', 'blockedChannel', 'marked-watched', 'channelNotAllowed']) {
        revealed.length = 0;
        const deliberate = Array.from({ length: 9 }, () => makeCard(reason))
            .concat([makeCard(null)]);
        assert.equal(feature._enforceRuleHideRatioGuard(deliberate), false,
            `${reason} is a deliberate choice and must not be second-guessed`);
        assert.equal(revealed.length, 0, `${reason} hides must survive the guard`);
    }

    // Small feeds are exempt: 3 of 4 is not evidence of a misfiring rule.
    revealed.length = 0;
    const small = Array.from({ length: 3 }, () => makeCard('keyword')).concat([makeCard(null)]);
    assert.equal(feature._enforceRuleHideRatioGuard(small), false,
        'the guard needs a reasonably sized feed before it can judge a ratio');
});

test('the fail-open guard puts back cards that remove-mode detached', () => {
    // With "remove hidden cards from layout" on, an over-matching rule detaches
    // the cards. The guard cleared their classes and toasted "left visible"
    // while the feed stayed empty: clearing state on an orphaned node reveals
    // nothing. Restoring is the other half of revealing.
    const { mod } = loadModule();
    const feature = mod.createHideVideosFromHomeFeature({ appState: { settings: {} } });

    const makeCard = (id) => {
        const classes = new Set(['ytkit-video-hidden']);
        return {
            dataset: { ytkitFilterReason: 'keyword', ytkitRemoved: 'true', ytkitVideoId: id },
            classList: {
                contains: (name) => classes.has(name),
                add: (name) => classes.add(name),
                remove: (name) => classes.delete(name)
            }
        };
    };

    feature._applyVideoHiddenState = (el, shouldHide) => {
        if (!shouldHide) {
            el.classList.remove('ytkit-video-hidden');
            delete el.dataset.ytkitRemoved;   // the real method clears the marker
        }
        return !!shouldHide;
    };
    let restoredWith = null;
    feature._restoreRemovedVideoNodes = (ids) => { restoredWith = ids; return ids ? ids.size : 0; };

    const detached = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6'].map(makeCard);
    const visible = Array.from({ length: 4 }, () => ({
        dataset: {},
        classList: { contains: () => false, add() {}, remove() {} }
    }));

    assert.equal(feature._enforceRuleHideRatioGuard(detached.concat(visible)), true,
        'a rule matching 60% of the feed must still fail open in remove mode');
    assert.ok(restoredWith, 'the guard must ask for the detached cards back');
    assert.deepEqual([...restoredWith].sort(), ['a1', 'b2', 'c3', 'd4', 'e5', 'f6'],
        'every detached rule-hidden card must be restored by id');
});

test('the fail-open guard also covers infinite-scroll batches, not just navigation', () => {
    // The invariant only ever ran from _processAllVideos (navigation, chip
    // clicks). Continuation batches loaded by scrolling hid cards with no
    // guard at all, so an over-matching rule emptied every new batch silently
    // until the next navigation — the exact symptom the invariant exists for.
    const source = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'video-hider', 'index.js'), 'utf8');

    const batchStart = source.indexOf('const scheduleMutationBatch = () => {');
    assert.ok(batchStart > -1, 'the mutation batch scheduler must exist');
    const batchEnd = source.indexOf('this._observer = new MutationObserver', batchStart);
    assert.ok(batchEnd > batchStart, 'the observer must follow the scheduler');
    assert.match(source.slice(batchStart, batchEnd), /_enforceRuleHideRatioGuard\(this\._guardCardSet\(\)\)/,
        'each settled mutation batch must run the ratio guard');

    // A cancelled full scan must not starve the guard either.
    const scanStart = source.indexOf('this._processAllBudgetHandle = handle;');
    const scanEnd = source.indexOf('_processAllVideosDebounced', scanStart);
    const scanTail = source.slice(scanStart, scanEnd);
    assert.match(scanTail, /this\._enforceRuleHideRatioGuard\(videos\);/,
        'the full scan must run the guard');
    assert.ok(
        scanTail.indexOf('this._enforceRuleHideRatioGuard(videos);') < scanTail.indexOf('if (!result?.cancelled)'),
        'the guard must run before the cancelled-scan early exit, not inside it'
    );

    // The card set must include nodes remove-mode detached, or the numerator
    // silently drops to zero in exactly that mode.
    const setStart = source.indexOf('_guardCardSet() {');
    assert.ok(setStart > -1, '_guardCardSet must exist');
    const setFn = source.slice(setStart, source.indexOf('_enforceRuleHideRatioGuard(cards)', setStart));
    assert.match(setFn, /_removedVideoNodes/, 'detached cards must be counted');
    assert.match(setFn, /!el\.isConnected/, 'only still-detached cards may be added back');

    // Both copies ship the fix: which one runs no longer depends on the route,
    // but the monolith copy is still live code for userscript users.
    const monolith = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'ytkit.js'), 'utf8');
    assert.match(monolith, /_enforceRuleHideRatioGuard\(this\._guardCardSet\(\)\)/,
        'the monolith observer must run the guard on mutation batches too');
    assert.match(monolith, /if \(removedIds\.length\) this\._restoreRemovedVideoNodes\(new Set\(removedIds\)\);/,
        'the monolith guard must restore detached cards too');
});
