'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const modulePath = path.join(repoRoot, 'extension', 'features', 'video-insights', 'index.js');
const { runtimeModules } = require('../helpers/source');
const {
    createVideoInsightsFeature,
    extractVideoInsights,
    hasCompleteVideoInsights,
    isGithubFullArtifactManifest,
    mergeVideoInsights
} = require(modulePath);
const { fakeTreeDocument } = require('../helpers/monolith');

const VIDEO_ID = 'dQw4w9WgXcQ';
const CHANNEL_ID = 'UC38IQsAvIsxxjztdMZQtwHA';

function playerResponse(overrides = {}) {
    return {
        videoDetails: {
            videoId: VIDEO_ID,
            channelId: CHANNEL_ID,
            keywords: ['engineering', 'YouTube'],
            ...(overrides.videoDetails || {})
        },
        microformat: {
            playerMicroformatRenderer: {
                category: 'Science & Technology',
                uploadDate: '2026-07-14',
                ...(overrides.microformat || {})
            }
        }
    };
}

test('player-response extraction normalizes complete insights and rejects stale metadata', () => {
    const insights = extractVideoInsights(playerResponse(), VIDEO_ID);
    assert.equal(insights.category, 'Science & Technology');
    assert.deepEqual(insights.tags, ['engineering', 'YouTube']);
    assert.equal(insights.uploadDate, '2026-07-14');
    assert.equal(insights.channelId, CHANNEL_ID);
    assert.equal(hasCompleteVideoInsights(insights), true);

    const stale = extractVideoInsights(playerResponse({
        videoDetails: { videoId: '9bZkp7q19f0' }
    }), VIDEO_ID);
    assert.equal(stale.stale, true);
    assert.equal(stale.category, '');
    assert.deepEqual(stale.tags, []);
});

test('local tag intent wins during merge, including a deliberately empty tag list', () => {
    const local = extractVideoInsights(playerResponse({
        videoDetails: { keywords: [] },
        microformat: { category: '' }
    }), VIDEO_ID);
    const remote = extractVideoInsights(playerResponse({
        videoDetails: { keywords: ['remote-tag'] }
    }), VIDEO_ID);
    const merged = mergeVideoInsights(local, remote);
    assert.equal(merged.category, 'Science & Technology');
    assert.deepEqual(merged.tags, [], 'an explicit empty local keyword list must not be invented remotely');
    assert.equal(merged.hasTagsField, true);
});

test('complete page metadata renders without an InnerTube request', async () => {
    let fetchCount = 0;
    const successes = [];
    const feature = createVideoInsightsFeature({
        getPlayerResponse: () => playerResponse(),
        isGithubFullProfile: () => true,
        extensionFetchJson: async () => { fetchCount += 1; return { data: null }; },
        ExternalApiHealth: { recordSuccess: (...args) => successes.push(args) }
    });

    const result = await feature._loadInsights(VIDEO_ID);
    assert.equal(result.source, 'page');
    assert.equal(result.fetched, false);
    assert.equal(fetchCount, 0);
    assert.equal(successes[0][0], 'videoInsights');
    assert.equal(successes[0][1].source, 'page');
});

test('store-safe profile never requests missing insights', async () => {
    let fetchCount = 0;
    const incomplete = playerResponse({
        videoDetails: { keywords: undefined },
        microformat: { category: '', uploadDate: '' }
    });
    const feature = createVideoInsightsFeature({
        getPlayerResponse: () => incomplete,
        isGithubFullArtifact: () => false,
        isGithubFullProfile: () => false,
        extensionFetchJson: async () => { fetchCount += 1; return { data: null }; }
    });

    const result = await feature._loadInsights(VIDEO_ID);
    assert.equal(result.source, 'page');
    assert.equal(result.fetched, false);
    assert.equal(fetchCount, 0);
});

test('GitHub-full fallback validates, caches, and health-tracks InnerTube metadata', async () => {
    const requests = [];
    const health = [];
    const feature = createVideoInsightsFeature({
        getPlayerResponse: () => ({ videoDetails: { videoId: VIDEO_ID } }),
        isGithubFullArtifact: () => true,
        isGithubFullProfile: () => true,
        getInnertubeConfig: () => ({
            apiKey: 'AIzaSyValidPageDerivedKey123',
            clientVersion: '1.20260714.00.00'
        }),
        extensionFetchJson: async (request) => {
            requests.push(request);
            return { data: playerResponse() };
        },
        ExternalApiHealth: {
            recordSuccess: (...args) => health.push(['success', ...args]),
            recordFailure: (...args) => health.push(['failure', ...args])
        }
    });

    const first = await feature._loadInsights(VIDEO_ID);
    const second = await feature._loadInsights(VIDEO_ID);
    assert.equal(first.source, 'network');
    assert.equal(first.fetched, true);
    assert.equal(second.source, 'cache');
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /^https:\/\/www\.youtube\.com\/youtubei\/v1\/player\?key=/);
    assert.equal(requests[0].credentials, 'omit');
    assert.equal(JSON.parse(requests[0].data).videoId, VIDEO_ID);
    assert.equal(health[0][0], 'success');
    assert.equal(health[0][1], 'videoInsights');
    assert.equal(health[0][2].source, 'network');
});

test('video insights module is loaded before ytkit and registered in data-flow policy', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(repoRoot, 'extension', 'manifest.json'),
        'utf8'
    ));
    const normal = manifest.content_scripts.find((entry) => runtimeModules(entry).includes('ytkit.js'));
    const scripts = runtimeModules(normal);
    const featureIndex = scripts.indexOf('features/video-insights/index.js');
    assert.notEqual(featureIndex, -1);
    assert.ok(featureIndex < scripts.indexOf('ytkit.js'));

    const { ORIGIN_CATALOGUE } = require('../../extension/core/data-flow.js');
    const youtube = ORIGIN_CATALOGUE.find((entry) => entry.origin === 'https://*.youtube.com');
    assert.ok(youtube.requiredByFeatures.includes('videoInsights'));

    const { patchManifestForBuildProfile } = require('../../build-extension.js');
    assert.ok((manifest.optional_host_permissions || []).includes('https://api.openai.com/*'),
        'the source profile sentinel is runtime-optional, not an install-time host grant');
    assert.equal(isGithubFullArtifactManifest(manifest), true);
    assert.equal(isGithubFullArtifactManifest(patchManifestForBuildProfile(manifest, 'store-safe')), false);
    assert.equal(isGithubFullArtifactManifest(patchManifestForBuildProfile(manifest, 'github-full')), true);

    const source = fs.readFileSync(modulePath, 'utf8');
    assert.doesNotMatch(source, /innerHTML\s*=/);
    assert.match(source, /forced-colors:active/);
});

async function withRenderedInsights(overrides, verify) {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const timers = [];
    globalThis.setTimeout = (fn, delay) => {
        const timer = { fn, delay, cancelled: false };
        timers.push(timer);
        return timer;
    };
    globalThis.clearTimeout = (timer) => { if (timer) timer.cancelled = true; };
    const documentRef = fakeTreeDocument();
    const target = documentRef.createElement('div');
    documentRef.body.appendChild(target);
    const feature = createVideoInsightsFeature({
        documentRef,
        getVideoId: () => VIDEO_ID,
        isWatchPagePath: () => true,
        getPlayerResponse: () => playerResponse(),
        formatAbsoluteDate: () => 'July 14, 2026',
        injectStyle: () => ({ remove() {} }),
        ...overrides
    });
    const originalQuery = documentRef.querySelector.bind(documentRef);
    documentRef.querySelector = (selector) => selector === 'ytd-watch-metadata #above-the-fold, ytd-watch-metadata'
        ? target
        : originalQuery(selector);
    try {
        feature.init();
        const attachTimer = timers.find((timer) => timer.delay === 700);
        assert.ok(attachTimer, 'init schedules the first watch-page render');
        attachTimer.fn();
        await new Promise((resolve) => setImmediate(resolve));
        await verify({ documentRef, feature, target });
    } finally {
        feature.destroy();
        globalThis.setTimeout = originalSetTimeout;
        globalThis.clearTimeout = originalClearTimeout;
    }
}

test('video insights renders complete page metadata into one labelled region', async () => {
    await withRenderedInsights({}, async ({ feature, target }) => {
        const panel = target.querySelector('.ytkit-video-insights');
        assert.ok(panel, 'the panel attaches to watch metadata, not a detached node');
        assert.equal(panel.getAttribute('role'), 'region');
        assert.equal(panel.getAttribute('aria-labelledby'), 'ytkit-video-insights-title');
        assert.equal(panel.hasAttribute('aria-busy'), false);
        assert.equal(panel.dataset.tone, 'ready');
        assert.equal(panel.querySelector('.ytkit-video-insights__title').textContent, 'Video insights');
        assert.equal(panel.querySelector('.ytkit-video-insights__source').textContent, 'From this page');

        const facts = panel.querySelectorAll('.ytkit-video-insights__fact');
        assert.equal(facts.length, 4);
        assert.deepEqual(facts.map((row) => row.children[0].textContent),
            ['Category', 'Uploaded', 'Channel ID', 'Tags']);
        assert.equal(facts[0].children[1].textContent, 'Science & Technology');
        assert.equal(facts[1].children[1].textContent, 'July 14, 2026');
        const channelLink = facts[2].children[1].children[0];
        assert.match(channelLink.href, new RegExp(`/channel/${CHANNEL_ID}$`));
        assert.equal(channelLink.rel, 'noopener noreferrer');
        assert.deepEqual(facts[3].children[1].children.map((chip) => chip.textContent),
            ['engineering', 'YouTube']);

        feature.destroy();
        assert.equal(target.querySelector('.ytkit-video-insights'), null);
    });
});

test('a degraded lookup renders "Not checked" instead of claiming metadata was not published', async () => {
    await withRenderedInsights({
        getPlayerResponse: () => ({ videoDetails: { videoId: VIDEO_ID } }),
        isGithubFullArtifact: () => false,
        isGithubFullProfile: () => false
    }, async ({ target }) => {
        const panel = target.querySelector('.ytkit-video-insights');
        assert.equal(panel.dataset.tone, 'degraded');
        assert.match(panel.querySelector('.ytkit-video-insights__source').textContent, /lookup unavailable/i);
        const values = panel.querySelectorAll('.ytkit-video-insights__fact')
            .map((row) => row.children[1].textContent);
        assert.deepEqual(values, ['Not checked', 'Not checked', 'Not checked', 'Not checked']);
        assert.equal(panel.textContent.includes('Not provided'), false);
    });
});
