'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const modulePath = path.join(repoRoot, 'extension', 'features', 'video-insights', 'index.js');
const {
    createVideoInsightsFeature,
    extractVideoInsights,
    hasCompleteVideoInsights,
    isGithubFullArtifactManifest,
    mergeVideoInsights
} = require(modulePath);

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
    const normal = manifest.content_scripts.find((entry) => entry.js?.includes('ytkit.js'));
    const featureIndex = normal.js.indexOf('features/video-insights/index.js');
    assert.notEqual(featureIndex, -1);
    assert.ok(featureIndex < normal.js.indexOf('ytkit.js'));

    const { ORIGIN_CATALOGUE } = require('../../extension/core/data-flow.js');
    const youtube = ORIGIN_CATALOGUE.find((entry) => entry.origin === 'https://*.youtube.com');
    assert.ok(youtube.requiredByFeatures.includes('videoInsights'));

    const { patchManifestForBuildProfile } = require('../../build-extension.js');
    assert.equal(isGithubFullArtifactManifest(manifest), true);
    assert.equal(isGithubFullArtifactManifest(patchManifestForBuildProfile(manifest, 'store-safe')), false);
    assert.equal(isGithubFullArtifactManifest(patchManifestForBuildProfile(manifest, 'github-full')), true);

    const source = fs.readFileSync(modulePath, 'utf8');
    assert.doesNotMatch(source, /innerHTML\s*=/);
    assert.match(source, /aria-labelledby/);
    assert.match(source, /forced-colors:active/);
});
