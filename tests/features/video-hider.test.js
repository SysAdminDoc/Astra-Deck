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
        't',
        'runBudgetedElementBatch',
        'injectStyle'
    ]) {
        assert.ok(dependencyBag.includes(dep), 'ytkit.js factory dependency bag must include ' + dep);
    }
    assert.ok(dependencyBag.includes('createSVG: globalThis.YTKitCore?.createSVG'),
        'factory dependency bag must avoid the later-declared local createSVG binding');
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
