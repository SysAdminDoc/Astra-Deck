'use strict';

// Regression coverage for the extraction of TranscriptService
// out of the ytkit.js monolith and into extension/core/transcript-service.js.
//
// The factory module is loaded by faking the document_idle content_script
// load order: prime globalThis.YTKitCore from core/storage.js conventions,
// then require() the file (which auto-registers via the IIFE).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const corePath = path.join(repoRoot, 'extension', 'core', 'transcript-service.js');
const ytkitPath = path.join(repoRoot, 'extension', 'ytkit.js');
const manifestPath = path.join(repoRoot, 'extension', 'manifest.json');
const { runtimeModules } = require('./helpers/source');

function loadFactoryIntoFreshGlobal() {
    // Pretend we're at content-script load time: YTKitCore namespace exists,
    // earlier core/* modules have attached their exports.
    globalThis.YTKitCore = {};
    const src = fs.readFileSync(corePath, 'utf8');
    // The module is an IIFE that mutates globalThis.YTKitCore — eval it.
    // eslint-disable-next-line no-eval
    (0, eval)(src);
    if (typeof globalThis.YTKitCore.createTranscriptService !== 'function') {
        throw new Error('createTranscriptService not attached to YTKitCore');
    }
    return globalThis.YTKitCore.createTranscriptService;
}

test('createTranscriptService exposes the legacy API surface used by ytkit.js call sites', () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const svc = createTranscriptService({
        getVideoId: () => 'abc',
        showToast: () => {},
        getPlayerResponseGlobal: () => null,
        extensionFetchJson: async () => ({ response: { status: 200 }, data: {} }),
        extensionFetchText: async () => ({ text: '' })
    });
    assert.equal(typeof svc.downloadTranscript, 'function');
    assert.equal(typeof svc.fetchTranscript, 'function');
    assert.equal(typeof svc._getCaptionTracks, 'function');
    assert.equal(typeof svc._selectBestTrack, 'function');
    assert.equal(typeof svc._fetchTranscriptContent, 'function');
    assert.equal(typeof svc._formatTranscript, 'function');
    assert.equal(typeof svc._extractFromPlayerResponse, 'function');
    assert.equal(typeof svc.config, 'object');
    assert.deepEqual(svc.config.preferredLanguages, ['en', 'en-US', 'en-GB']);
});

test('fetchTranscript retrieves captions without depending on an opened DOM panel', async () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const svc = createTranscriptService({});
    svc._getCaptionTracks = async () => ({
        videoTitle: 'Shared service fixture',
        tracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=abcdefghijk', languageCode: 'en', kind: 'manual' }]
    });
    svc._fetchTranscriptContent = async () => [{ startMs: 0, endMs: 1000, text: 'Hello' }];
    const result = await svc.fetchTranscript('abcdefghijk');
    assert.equal(result.status, 'ready');
    assert.equal(result.title, 'Shared service fixture');
    assert.equal(result.language, 'en');
    assert.equal(result.segments.length, 1);
});

test('fetchTranscript reports captionless videos and honors cancellation', async () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const svc = createTranscriptService({ nowFn: () => 1234 });
    svc._getCaptionTracks = async () => ({
        videoId: 'abcdefghijk',
        source: 'player-global',
        captionless: true,
        tracks: []
    });
    assert.deepEqual(await svc.fetchTranscript('abcdefghijk'), {
        status: 'captionless', videoId: 'abcdefghijk', title: '', segments: [], language: '',
        provenance: {
            source: 'player-global', language: '', fetchedAt: 1234, expiresAt: 0,
            staleReason: '', fallbackReason: 'no-caption-tracks'
        }
    });

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
        () => svc.fetchTranscript('abcdefghijk', { signal: controller.signal }),
        (error) => error?.name === 'AbortError'
    );
});

test('expired caption URLs trigger one fresh discovery and expose bounded provenance', async () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const now = 2_000_000_000_000;
    const diagnostics = [];
    const svc = createTranscriptService({
        getVideoId: () => 'abcdefghijk',
        nowFn: () => now,
        recordDiagnostic: (detail) => diagnostics.push(detail)
    });
    const discoveries = [];
    svc._getCaptionTracks = async (_videoId, options) => {
        discoveries.push(options.forceFresh === true ? 'fresh' : 'initial');
        return {
            videoId: 'abcdefghijk',
            videoTitle: 'Fresh fixture',
            source: options.forceFresh ? 'innertube-player' : 'player-global',
            tracks: [{
                baseUrl: options.forceFresh
                    ? 'https://www.youtube.com/api/timedtext?v=abcdefghijk&expire=2000003600'
                    : 'https://www.youtube.com/api/timedtext?v=abcdefghijk&expire=1999999999',
                languageCode: 'en', kind: 'manual', vssId: '.en'
            }]
        };
    };
    const fetchedUrls = [];
    svc._fetchTranscriptContent = async (url) => {
        fetchedUrls.push(url);
        return [{ startMs: 0, endMs: 1000, text: 'Fresh caption' }];
    };

    const result = await svc.fetchTranscript('abcdefghijk');
    assert.deepEqual(discoveries, ['initial', 'fresh']);
    assert.equal(fetchedUrls.length, 1, 'known-expired URL must not be requested');
    assert.match(fetchedUrls[0], /expire=2000003600/);
    assert.equal(result.status, 'ready');
    assert.equal(result.videoId, 'abcdefghijk');
    assert.deepEqual(result.provenance, {
        source: 'innertube-player',
        language: 'en',
        fetchedAt: now,
        expiresAt: 2_000_003_600_000,
        staleReason: 'expired-url',
        fallbackReason: 'track-refresh'
    });
    assert.deepEqual(svc.getDiagnostics(), diagnostics[0]);
});

for (const status of [403, 404]) {
    test(`HTTP ${status} caption failure refreshes the track at most once`, async () => {
        const createTranscriptService = loadFactoryIntoFreshGlobal();
        const svc = createTranscriptService({ getVideoId: () => 'abcdefghijk', nowFn: () => 5000 });
        let discoveries = 0;
        svc._getCaptionTracks = async (_videoId, options) => {
            discoveries += 1;
            return {
                videoId: 'abcdefghijk',
                source: options.forceFresh ? 'watch-page-player' : 'player-global',
                tracks: [{
                    baseUrl: `https://www.youtube.com/api/timedtext?v=abcdefghijk&generation=${discoveries}`,
                    languageCode: 'en', kind: 'manual'
                }]
            };
        };
        let fetches = 0;
        svc._fetchTranscriptContent = async () => {
            fetches += 1;
            if (fetches === 1) {
                const error = new Error(`HTTP ${status}`);
                error.response = { status };
                throw error;
            }
            return [{ startMs: 0, endMs: 1000, text: 'Recovered' }];
        };

        const result = await svc.fetchTranscript('abcdefghijk');
        assert.equal(discoveries, 2);
        assert.equal(fetches, 2);
        assert.equal(result.provenance.staleReason, `http-${status}`);
        assert.equal(result.provenance.fallbackReason, 'track-refresh');
    });
}

test('a failed refreshed caption URL does not start a second rediscovery loop', async () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const svc = createTranscriptService({ getVideoId: () => 'abcdefghijk' });
    let discoveries = 0;
    svc._getCaptionTracks = async (_videoId, options) => {
        discoveries += 1;
        return {
            videoId: 'abcdefghijk',
            source: options.forceFresh ? 'watch-page-regex' : 'player-global',
            tracks: [{ baseUrl: `https://www.youtube.com/api/timedtext?v=abcdefghijk&n=${discoveries}`, languageCode: 'en' }]
        };
    };
    svc._fetchTranscriptContent = async () => {
        const error = new Error('HTTP 403');
        error.response = { status: 403 };
        throw error;
    };
    await assert.rejects(() => svc.fetchTranscript('abcdefghijk'), /HTTP 403/);
    assert.equal(discoveries, 2);
});

test('stale player globals fail over and navigation cancels before returning another video', async () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    let currentVideoId = 'abcdefghijk';
    const svc = createTranscriptService({
        getVideoId: () => currentVideoId,
        getPlayerResponseGlobal: () => ({ videoDetails: { videoId: 'zzzzzzzzzzz' } })
    });
    svc._method2_InnertubeAPI = async () => ({
        videoTitle: 'Current video',
        tracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=abcdefghijk', languageCode: 'en' }]
    });
    const discovered = await svc._getCaptionTracks('abcdefghijk');
    assert.equal(discovered.source, 'innertube-player');

    svc._getCaptionTracks = async () => discovered;
    svc._fetchTranscriptContent = async () => {
        currentVideoId = 'yyyyyyyyyyy';
        return [{ startMs: 0, endMs: 1000, text: 'Wrong video' }];
    };
    await assert.rejects(
        () => svc.fetchTranscript('abcdefghijk'),
        (error) => error?.name === 'AbortError'
    );
});

test('navigation to a non-video route cancels before transcript completion', async () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    let currentVideoId = 'abcdefghijk';
    const svc = createTranscriptService({ getVideoId: () => currentVideoId });
    svc._getCaptionTracks = async () => ({
        videoId: 'abcdefghijk',
        source: 'innertube-player',
        tracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=abcdefghijk', languageCode: 'en' }]
    });
    svc._fetchTranscriptContent = async () => {
        currentVideoId = null;
        return [{ startMs: 0, endMs: 1000, text: 'Stale completion' }];
    };

    await assert.rejects(
        () => svc.fetchTranscript('abcdefghijk'),
        (error) => error?.name === 'AbortError'
    );
});

test('caller trackData cannot inject a caption URL for another video', async () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const fetchedUrls = [];
    const svc = createTranscriptService({ getVideoId: () => 'abcdefghijk' });
    svc._getCaptionTracks = async () => ({
        videoId: 'abcdefghijk',
        source: 'innertube-player',
        tracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=abcdefghijk', languageCode: 'en' }]
    });
    svc._fetchTranscriptContent = async (url) => {
        fetchedUrls.push(url);
        return [{ startMs: 0, endMs: 1000, text: 'Bound caption' }];
    };

    const result = await svc.fetchTranscript('abcdefghijk', {
        trackData: {
            videoId: 'abcdefghijk',
            tracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=zzzzzzzzzzz', languageCode: 'en' }]
        }
    });
    assert.equal(result.status, 'ready');
    assert.deepEqual(fetchedUrls, ['https://www.youtube.com/api/timedtext?v=abcdefghijk']);
});

test('strict track refresh fails closed when the requested language disappears', async () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const now = 2_000_000_000_000;
    const svc = createTranscriptService({ getVideoId: () => 'abcdefghijk', nowFn: () => now });
    let discoveries = 0;
    svc._getCaptionTracks = async (_videoId, options) => {
        discoveries += 1;
        return {
            videoId: 'abcdefghijk',
            source: options.forceFresh ? 'innertube-player' : 'player-global',
            tracks: options.forceFresh
                ? [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=abcdefghijk&lang=es', languageCode: 'es', kind: 'manual' }]
                : [{
                    baseUrl: 'https://www.youtube.com/api/timedtext?v=abcdefghijk&lang=en&expire=1999999999',
                    languageCode: 'en', kind: 'manual', vssId: '.en'
                }]
        };
    };
    svc._fetchTranscriptContent = async () => assert.fail('no mismatched language URL should be fetched');

    const result = await svc.fetchTranscript('abcdefghijk', {
        trackPreference: { languageCode: 'en', kind: 'manual', vssId: '.en' },
        strictTrack: true
    });
    assert.equal(discoveries, 2);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.provenance.language, 'en');
    assert.equal(result.provenance.fallbackReason, 'strict-track-unavailable');
});

test('off-page retrieval uses target-bound network discovery without page globals or DOM', async () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const calls = [];
    const svc = createTranscriptService({ getVideoId: () => 'currentvid1' });
    svc._method1_WindowVariable = () => { calls.push('global'); throw new Error('must not run'); };
    svc._method2_InnertubeAPI = async () => {
        calls.push('innertube');
        return {
            tracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=abcdefghijk', languageCode: 'en' }],
            videoTitle: 'Off-page target'
        };
    };
    svc._method5_DOMPanelScrape = async () => { calls.push('dom'); throw new Error('must not run'); };
    svc._fetchTranscriptContent = async () => [{ startMs: 0, endMs: 1000, text: 'Target caption' }];

    const result = await svc.fetchTranscript('abcdefghijk', { allowOffPage: true });
    assert.equal(result.status, 'ready');
    assert.deepEqual(calls, ['innertube']);
});

test('valid matched player data distinguishes captionless videos from discovery failure', async () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const captionless = createTranscriptService({
        getVideoId: () => 'abcdefghijk',
        getPlayerResponseGlobal: () => ({ videoDetails: { videoId: 'abcdefghijk', title: 'No captions' } })
    });
    const result = await captionless.fetchTranscript('abcdefghijk');
    assert.equal(result.status, 'captionless');
    assert.equal(result.provenance.source, 'player-global');

    const broken = createTranscriptService({ getVideoId: () => 'abcdefghijk' });
    for (const method of [
        '_method1_WindowVariable', '_method2_InnertubeAPI', '_method3_HTMLPageFetch',
        '_method4_CaptionTracksRegex', '_method5_DOMPanelScrape'
    ]) broken[method] = async () => { throw new Error('fixture failure'); };
    await assert.rejects(
        () => broken.fetchTranscript('abcdefghijk', { allowDomFallback: false }),
        /Transcript discovery failed/
    );
    assert.equal(broken.getDiagnostics().status, 'error');
    assert.doesNotMatch(JSON.stringify(broken.getDiagnostics()), /timedtext|baseUrl|https?:\/\//);
});

test('downloadTranscript fails cleanly when no video id is in scope', async () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const toasts = [];
    const svc = createTranscriptService({
        getVideoId: () => null,
        showToast: (msg, color) => toasts.push({ msg, color }),
        getPlayerResponseGlobal: () => null,
        extensionFetchJson: async () => ({ response: { status: 200 }, data: {} }),
        extensionFetchText: async () => ({ text: '' })
    });
    const result = await svc.downloadTranscript();
    assert.equal(result.success, false);
    assert.equal(result.error, 'No video ID');
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].msg, 'No video ID found');
});

test('_selectBestTrack scores manual EN above autogen', () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const svc = createTranscriptService({});
    const tracks = [
        { languageCode: 'en', kind: 'asr', name: 'English (auto)' },
        { languageCode: 'en', kind: 'manual', name: 'English' },
        { languageCode: 'es', kind: 'manual', name: 'Spanish' }
    ];
    const best = svc._selectBestTrack(tracks);
    assert.equal(best.kind, 'manual');
    assert.equal(best.languageCode, 'en');
});

test('_formatTimestamp formats hours when ms >= 1h, MM:SS otherwise', () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const svc = createTranscriptService({});
    assert.equal(svc._formatTimestamp(0), '00:00');
    assert.equal(svc._formatTimestamp(65_000), '01:05');
    assert.equal(svc._formatTimestamp(3_725_000), '01:02:05');
});

test('normalizeTranscriptSegments creates bounded export cues without provider fields', () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const svc = createTranscriptService({});
    const normalized = svc.normalizeSegments([
        { startMs: 0, endMs: 1000, text: ' first\ncaption ' },
        { startMs: 65000, endMs: 70000, text: 'second' },
        { startMs: 90000, endMs: 91000, text: 'third' }
    ], { maxSegments: 2 });
    assert.deepEqual(normalized.cues.map((cue) => [cue.id, cue.timestamp, cue.text]), [
        ['C0001', '0:00', 'first caption'],
        ['C0002', '1:05', 'second']
    ]);
    assert.equal(normalized.truncated, true);
    assert.equal(normalized.cues[0].startMs, undefined);
});

test('Innertube API method requires a page-derived API key', async () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    let fetchCalled = false;
    const svc = createTranscriptService({
        extensionFetchJson: async () => {
            fetchCalled = true;
            return { response: { status: 200 }, data: {} };
        }
    });

    await assert.rejects(
        () => svc._method2_InnertubeAPI('abc123'),
        /Innertube API key unavailable/
    );
    assert.equal(fetchCalled, false);
});

test('_sanitizeFilename strips fs-unsafe chars and clamps length', () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const svc = createTranscriptService({});
    assert.equal(svc._sanitizeFilename('hello: <world>?'), 'hello_world');
    assert.equal(svc._sanitizeFilename(''), 'untitled');
    assert.ok(svc._sanitizeFilename('x'.repeat(200)).length <= 120);
});

test('manifest.json loads core/transcript-service.js BEFORE every ytkit.js entry', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const isoBlocks = manifest.content_scripts.filter(b => runtimeModules(b).includes('ytkit.js'));
    assert.ok(isoBlocks.length >= 1, 'expected a ytkit.js content_script entry');
    for (const block of isoBlocks) {
        const scripts = runtimeModules(block);
        const idxTranscript = scripts.indexOf('core/transcript-service.js');
        const idxYtkit = scripts.indexOf('ytkit.js');
        assert.notEqual(idxTranscript, -1, 'core/transcript-service.js missing from content_scripts.js');
        assert.notEqual(idxYtkit, -1, 'ytkit.js missing from content_scripts.js');
        assert.ok(idxTranscript < idxYtkit, 'core/transcript-service.js must load before ytkit.js');
    }
});

test('ytkit.js no longer declares the inline `const TranscriptService = {` block', () => {
    const src = fs.readFileSync(ytkitPath, 'utf8');
    // The line that USED to start the 446-line inline block.
    assert.equal(src.includes("const TranscriptService = {\n        config: {\n            preferredLanguages:"), false,
        'inline TranscriptService block still present in ytkit.js — extraction is incomplete');
    // Conversely, the factory instantiation must be present.
    assert.ok(src.includes('createTranscriptService('),
        'ytkit.js should instantiate TranscriptService via the factory');
});


// ── Refresh diagnostics and dead-URL short-circuit ──────────────────────

test('a revoked caption URL costs one request, not one per format', async () => {
    // Every format hits the same base URL with a different fmt param, so a
    // 403 is the URL being revoked rather than the format being unsupported.
    // Trying the next format was a second wasted round trip before the same
    // throw. The expired-`expire`-param case was already pre-skipped; this is
    // the revoked-but-unexpired one.
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const requested = [];
    const svc = createTranscriptService({
        extensionFetchText: async ({ url }) => {
            requested.push(url);
            const err = new Error('HTTP 403');
            err.status = 403;
            throw err;
        }
    });

    await assert.rejects(
        () => svc._fetchTranscriptContent('https://example.test/api/timedtext?v=abc', {}),
        /403/);
    assert.equal(requested.length, 1,
        `a revoked URL must be fetched once, but was fetched ${requested.length} times`);
});

test('a format that merely fails keeps trying the remaining formats', async () => {
    // The short-circuit must be scoped to the terminal statuses. A parse-level
    // or transient failure is exactly the case the format loop exists for.
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const requested = [];
    const svc = createTranscriptService({
        extensionFetchText: async ({ url }) => {
            requested.push(url);
            // A 500 is the server having a bad moment, not the URL being
            // revoked — the next format may well succeed, so the short-circuit
            // must stay scoped to 403/404 rather than "any 4xx/5xx".
            if (requested.length === 1) {
                const err = new Error('HTTP 500');
                err.status = 500;
                throw err;
            }
            return { text: '<transcript><text start="0" dur="1">hello</text></transcript>' };
        }
    });

    const segments = await svc._fetchTranscriptContent('https://example.test/api/timedtext?v=abc', {});
    assert.ok(requested.length > 1,
        'a non-terminal failure must fall through to the next format');
    assert.ok(Array.isArray(segments) && segments.length > 0,
        'the surviving format must still produce segments');
});

test('a 404 short-circuits the format loop the same way a 403 does', async () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const requested = [];
    const svc = createTranscriptService({
        extensionFetchText: async ({ url }) => {
            requested.push(url);
            const err = new Error('HTTP 404');
            err.status = 404;
            throw err;
        }
    });
    await assert.rejects(() => svc._fetchTranscriptContent('https://example.test/t', {}), /404/);
    assert.equal(requested.length, 1);
});

test('a failed refresh keeps its own reason in the error diagnostic', () => {
    // The thrown-error path hardcoded the panel reason, overwriting
    // 'refresh-discovery-failed' / 'refresh-fetch-failed' / 'refresh-expired-url'
    // — exactly the case the provenance exists to explain never reached
    // getDiagnostics() or DiagnosticLog.
    const src = fs.readFileSync(corePath, 'utf8');
    const idx = src.indexOf("this._setTranscriptDiagnostic(videoId, 'error'");
    assert.ok(idx > -1, 'the error diagnostic must exist');
    const block = src.slice(idx, src.indexOf('throw fetchError;', idx));
    assert.match(block, /fallbackReason: fallbackReason \|\| \(allowDomFallback \? 'panel-unavailable' : 'dom-disabled'\)/,
        'a reason recorded by the refresh attempt must survive into the diagnostic');

    // And the reasons it must preserve are actually set upstream.
    for (const reason of ['refresh-discovery-failed', 'refresh-fetch-failed', 'refresh-expired-url']) {
        assert.match(src, new RegExp(`fallbackReason = '${reason}'`),
            `${reason} must still be recorded by the refresh path`);
    }
});
