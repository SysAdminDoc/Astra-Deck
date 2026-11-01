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
        if (options.mobileOnly) throw new Error('fixture: the mobile route has nothing');
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
        if (options.mobileOnly) throw new Error('fixture: the mobile route has nothing');
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

test('downloadTranscript exits quietly when navigation cancels the fetch', async () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    let currentVideoId = 'abcdefghijk';
    const toasts = [];
    const svc = createTranscriptService({
        getVideoId: () => currentVideoId,
        showToast: (msg) => toasts.push(msg)
    });
    svc._getCaptionTracks = async () => {
        currentVideoId = 'zzzzzzzzzzz';
        return {
            videoId: 'abcdefghijk',
            source: 'innertube-player',
            tracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=abcdefghijk', languageCode: 'en' }]
        };
    };
    const hadConsole = console.error;
    console.error = () => {};
    let result;
    try {
        result = await svc.downloadTranscript();
    } finally {
        console.error = hadConsole;
    }
    assert.equal(result.success, false);
    assert.equal(result.cancelled, true);
    assert.deepEqual(toasts, ['Fetching transcript…'],
        'leaving the video is not a download failure and must not toast one');
});

test('downloadTranscript failure reports only its own video\'s provenance', async () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const svc = createTranscriptService({ getVideoId: () => 'abcdefghijk', showToast: () => {} });
    // An off-page fetch for another video left the shared diagnostic behind.
    svc._setTranscriptDiagnostic('otherpage01', 'ready', { source: 'innertube-player', fetchedAt: 1 });
    svc.fetchTranscript = async () => { throw new Error('format failed'); };
    const hadConsole = console.error;
    console.error = () => {};
    let result;
    try {
        result = await svc.downloadTranscript();
    } finally {
        console.error = hadConsole;
    }
    assert.equal(result.success, false);
    assert.equal(result.provenance, null, 'another video\'s provenance must not be reported as this one\'s');
});

// YouTube answers the web player's caption URLs (exp=xpe) with 200 and an empty
// body unless they hold a token only its own player can make. Measured signed
// out on 2026-11-01, which took every transcript feature down at once.
const VIDEO = 'abcdefghijk';
const WEB_TRACK = `https://www.youtube.com/api/timedtext?v=${VIDEO}&exp=xpe&lang=en&sig=web`;
const mobileUrl = (lang) => `https://www.youtube.com/api/timedtext?v=${VIDEO}&fmt=srv3&lang=${lang}&sig=mobile`;
const JSON3_BODY = JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'Real words' }] }] });

function playerResponse(tracks, videoId = VIDEO, title = 'From the player') {
    return {
        videoDetails: { videoId, title },
        captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } }
    };
}

// Every client answers from `clients` by name; anything unnamed refuses.
function mobileRouteHarness({ clients = {}, global = playerResponse([{ baseUrl: WEB_TRACK, languageCode: 'en', vssId: '.en' }]), text = null, ...rest } = {}) {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const posts = [];
    const gets = [];
    const svc = createTranscriptService({
        getVideoId: () => VIDEO,
        getPlayerResponseGlobal: () => global,
        extensionFetchJson: async (details) => {
            const body = JSON.parse(details.data);
            const name = body.context.client.clientName;
            posts.push({ name, credentials: details.credentials, retry: details.retry, url: details.url, client: body.context.client, videoId: body.videoId });
            if (name === 'WEB') {
                return { response: { status: 200 }, data: playerResponse([{ baseUrl: WEB_TRACK, languageCode: 'en', vssId: '.en' }]) };
            }
            if (!clients[name]) throw new Error(`HTTP 403 ${name}`);
            return { response: { status: 200 }, data: clients[name] };
        },
        extensionFetchText: async (details) => {
            gets.push({ url: details.url, credentials: details.credentials });
            if (text) return { text: text(details.url) };
            if (!details.url.includes('sig=mobile')) return { text: '' };
            return { text: details.url.includes('fmt=json3') ? JSON3_BODY : '' };
        },
        ...rest
    });
    svc._getInnertubeApiKey = () => 'AIzaSyFixtureKey123';
    svc._method3_HTMLPageFetch = async () => { throw new Error('fixture: no page'); };
    svc._method4_CaptionTracksRegex = async () => { throw new Error('fixture: no page'); };
    svc._method5_DOMPanelScrape = async () => { throw new Error('fixture: no panel'); };
    svc._scrapeRenderedTranscript = () => null;
    return { svc, posts, gets };
}

const androidTracks = (extra = []) => playerResponse([
    { baseUrl: mobileUrl('en'), languageCode: 'en', vssId: '.en' },
    ...extra
]);

test('a caption track that answers with nothing falls over to a mobile client and returns its words', async () => {
    const { svc, posts, gets } = mobileRouteHarness({ clients: { ANDROID: androidTracks() } });
    const result = await svc.fetchTranscript(VIDEO);
    assert.equal(result.status, 'ready');
    assert.deepEqual(result.segments.map((segment) => segment.text), ['Real words']);
    assert.equal(result.provenance.source, 'innertube-mobile', 'the provenance names the route that worked');
    assert.equal(result.provenance.fallbackReason, 'mobile-client');
    assert.equal(result.title, 'From the player');
    assert.deepEqual(posts.map((post) => post.name), ['ANDROID']);
    assert.ok(gets.some((get) => get.url.includes('sig=web')), 'the page track is still tried first');
});

test('the mobile call is anonymous, keyless and leaves retrying to the next client', async () => {
    const { svc, posts, gets } = mobileRouteHarness({ clients: { ANDROID: androidTracks() } });
    await svc.fetchTranscript(VIDEO);
    assert.equal(posts[0].credentials, 'omit');
    assert.equal(posts[0].retry, false);
    assert.equal(posts[0].videoId, VIDEO);
    assert.equal(posts[0].url, 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false');
    assert.equal(posts[0].client.clientVersion, '20.10.38');
    const mobileGets = gets.filter((get) => get.url.includes('sig=mobile'));
    assert.ok(mobileGets.length > 0);
    assert.ok(mobileGets.every((get) => get.credentials === 'omit'), 'the caption fetch stays anonymous too');
    assert.ok(gets.filter((get) => get.url.includes('sig=web')).every((get) => get.credentials === undefined),
        'a page track keeps the normal credentials policy');
});

test('a refused client hands over to the next one, in order', async () => {
    const ios = androidTracks();
    const { svc, posts } = mobileRouteHarness({ clients: { IOS: ios } });
    const result = await svc.fetchTranscript(VIDEO);
    assert.equal(result.status, 'ready');
    assert.deepEqual(posts.map((post) => post.name), ['ANDROID', 'IOS']);
    assert.equal(posts[1].client.deviceMake, 'Apple', 'IOS answers only with its device fields');
    assert.equal(posts[1].client.clientVersion, '20.10.4');
});

test('the last client is reached when the first two have nothing', async () => {
    const { svc, posts } = mobileRouteHarness({
        clients: { ANDROID: { videoDetails: { videoId: VIDEO } }, ANDROID_VR: androidTracks() }
    });
    const result = await svc.fetchTranscript(VIDEO);
    assert.equal(result.status, 'ready');
    assert.deepEqual(posts.map((post) => post.name), ['ANDROID', 'IOS', 'ANDROID_VR']);
    assert.equal(posts[2].client.clientVersion, '1.60.19');
    assert.equal(posts[2].client.deviceMake, 'Oculus');
});

test('a client answering for another video is not believed', async () => {
    const { svc, posts } = mobileRouteHarness({
        clients: { ANDROID: playerResponse([{ baseUrl: mobileUrl('en'), languageCode: 'en' }], 'zzzzzzzzzzz'), IOS: androidTracks() }
    });
    const result = await svc.fetchTranscript(VIDEO);
    assert.equal(result.status, 'ready');
    assert.deepEqual(posts.map((post) => post.name), ['ANDROID', 'IOS']);
});

test('tracks with no URL do not count as an answer', async () => {
    const { svc, posts } = mobileRouteHarness({
        clients: { ANDROID: playerResponse([{ languageCode: 'en' }]), IOS: androidTracks() }
    });
    const result = await svc.fetchTranscript(VIDEO);
    assert.equal(result.status, 'ready');
    assert.deepEqual(posts.map((post) => post.name), ['ANDROID', 'IOS']);
});

test('no mobile tracks never reads as a video with no captions', async () => {
    // An age gate looks like this from an anonymous client: no tracks, and the
    // video does have captions.
    const { svc } = mobileRouteHarness({ clients: { ANDROID: { videoDetails: { videoId: VIDEO }, playabilityStatus: { status: 'LOGIN_REQUIRED' } } } });
    const result = await svc.fetchTranscript(VIDEO);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.provenance.fallbackReason, 'empty-caption-track');
    assert.equal(result.provenance.source, 'player-global');
});

test('the requested language is kept across the fall over', async () => {
    const { svc, gets } = mobileRouteHarness({
        clients: { ANDROID: androidTracks([{ baseUrl: mobileUrl('ja'), languageCode: 'ja', vssId: '.ja' }]) },
        global: playerResponse([
            { baseUrl: WEB_TRACK, languageCode: 'en', vssId: '.en' },
            { baseUrl: `${WEB_TRACK}&tlang=ja`, languageCode: 'ja', vssId: '.ja' }
        ])
    });
    const result = await svc.fetchTranscript(VIDEO, { trackPreference: { languageCode: 'ja', vssId: '.ja', kind: 'manual' } });
    assert.equal(result.status, 'ready');
    assert.equal(result.track.languageCode, 'ja');
    assert.equal(result.provenance.language, 'ja');
    assert.ok(gets.some((get) => get.url.includes('lang=ja&sig=mobile')));
});

test('a strict track request stays unavailable when the mobile client lacks that language', async () => {
    const { svc } = mobileRouteHarness({
        clients: { ANDROID: androidTracks() },
        global: playerResponse([{ baseUrl: WEB_TRACK, languageCode: 'ja', vssId: '.ja', kind: 'manual' }])
    });
    const result = await svc.fetchTranscript(VIDEO, {
        trackPreference: { languageCode: 'ja', vssId: '.ja', kind: 'manual' },
        strictTrack: true
    });
    assert.equal(result.status, 'unavailable');
});

test('the result describes the track that supplied the words, not the one that came back empty', async () => {
    const mobileExpiring = `${mobileUrl('en')}&expire=2000000000`;
    const { svc } = mobileRouteHarness({
        clients: { ANDROID: playerResponse([{ baseUrl: mobileExpiring, languageCode: 'en', vssId: '.en', kind: 'manual' }]) },
        global: playerResponse([{ baseUrl: `${WEB_TRACK}&expire=1900000000`, languageCode: 'ja', vssId: '.ja', kind: 'manual' }]),
        nowFn: () => 1_000_000_000_000
    });
    const result = await svc.fetchTranscript(VIDEO);
    assert.equal(result.status, 'ready');
    assert.equal(result.track.languageCode, 'en');
    assert.equal(result.track.vssId, '.en');
    assert.equal(result.provenance.language, 'en');
    assert.equal(result.provenance.expiresAt, 2_000_000_000_000);
});

test('the caller can still cancel the mobile track fetch', async () => {
    const { svc } = mobileRouteHarness({ clients: { ANDROID: androidTracks() } });
    const real = svc._fetchTranscriptContent.bind(svc);
    const controller = new AbortController();
    const signals = [];
    svc._fetchTranscriptContent = async (url, options) => {
        if (url.includes('sig=mobile')) signals.push(options.signal === controller.signal);
        return real(url, options);
    };
    await svc.fetchTranscript(VIDEO, { signal: controller.signal });
    assert.deepEqual(signals, [true]);
});

test('a page track that throws for any other reason falls over too, and the words win', async () => {
    const { svc } = mobileRouteHarness({ clients: { ANDROID: androidTracks() } });
    const real = svc._fetchTranscriptContent.bind(svc);
    svc._fetchTranscriptContent = async (url, options) => {
        if (!url.includes('sig=mobile')) throw new Error('Failed to fetch transcript in any format');
        return real(url, options);
    };
    const result = await svc.fetchTranscript(VIDEO);
    assert.equal(result.status, 'ready');
    assert.equal(result.provenance.staleReason, 'fetch-failed');
});

test('a mobile track that is empty too stays unavailable and names the page track', async () => {
    const { svc } = mobileRouteHarness({ clients: { ANDROID: androidTracks() }, text: () => '' });
    const result = await svc.fetchTranscript(VIDEO);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.provenance.source, 'player-global');
    assert.equal(result.provenance.language, 'en');
});

test('a mobile track that fails to load leaves the earlier outcome in place', async () => {
    const { svc } = mobileRouteHarness({ clients: { ANDROID: androidTracks() } });
    const real = svc._fetchTranscriptContent.bind(svc);
    svc._fetchTranscriptContent = async (url, options) => {
        if (url.includes('sig=mobile')) throw new Error('HTTP 500');
        return real(url, options);
    };
    const result = await svc.fetchTranscript(VIDEO);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.provenance.fallbackReason, 'empty-caption-track');
});

test('a dead page URL\'s one refresh lands on the mobile route first', async () => {
    const { svc, posts } = mobileRouteHarness({ clients: { ANDROID: androidTracks() } });
    const real = svc._fetchTranscriptContent.bind(svc);
    let first = true;
    svc._fetchTranscriptContent = async (url, options) => {
        if (first) {
            first = false;
            throw Object.assign(new Error('HTTP 403'), { response: { status: 403 } });
        }
        return real(url, options);
    };
    const result = await svc.fetchTranscript(VIDEO);
    assert.equal(result.status, 'ready');
    assert.equal(result.provenance.source, 'innertube-mobile');
    assert.equal(result.provenance.staleReason, 'http-403');
    assert.deepEqual(posts.map((post) => post.name), ['ANDROID'], 'the web client\'s URLs are the ones that come back empty');
});

test('the fall over rescues a dead page URL when the refresh only found the web client', async () => {
    const { svc, posts } = mobileRouteHarness({ clients: { ANDROID: androidTracks() } });
    const real = svc._fetchTranscriptContent.bind(svc);
    const realTracks = svc._getCaptionTracks.bind(svc);
    svc._getCaptionTracks = async (videoId, options = {}) => {
        if (options.forceFresh) return { videoId, source: 'innertube-player', tracks: [{ baseUrl: WEB_TRACK, languageCode: 'en', vssId: '.en', kind: 'manual' }], videoTitle: '' };
        return realTracks(videoId, options);
    };
    let first = true;
    svc._fetchTranscriptContent = async (url, options) => {
        if (first) {
            first = false;
            throw Object.assign(new Error('HTTP 403'), { response: { status: 403 } });
        }
        return real(url, options);
    };
    const result = await svc.fetchTranscript(VIDEO);
    assert.equal(result.status, 'ready');
    assert.equal(result.provenance.source, 'innertube-mobile');
    assert.equal(result.provenance.fallbackReason, 'mobile-client');
    assert.deepEqual(posts.map((post) => post.name), ['ANDROID']);
});

test('the mobile route is tried before the other network routes', async () => {
    const { svc, posts, gets } = mobileRouteHarness({ clients: { ANDROID: androidTracks() }, global: null });
    let htmlAsked = false;
    svc._method3_HTMLPageFetch = async () => { htmlAsked = true; throw new Error('fixture: no page'); };
    const result = await svc.fetchTranscript(VIDEO);
    assert.equal(result.status, 'ready');
    assert.equal(result.provenance.source, 'innertube-mobile');
    assert.deepEqual(posts.map((post) => post.name), ['ANDROID'], 'the web client is never asked once a mobile client has the tracks');
    assert.equal(htmlAsked, false, 'nor is a whole watch page downloaded');
    assert.ok(gets.every((get) => get.url.includes('sig=mobile')));
});

test('a player that refuses to play the video says nothing about its captions', async () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const svc = createTranscriptService({ getVideoId: () => VIDEO });
    const read = (status) => svc._extractFromPlayerResponse({
        ...(status ? { playabilityStatus: { status } } : {}),
        videoDetails: { videoId: VIDEO, title: 'Title' }
    }).captionless;
    assert.equal(read('UNPLAYABLE'), false);
    assert.equal(read('LOGIN_REQUIRED'), false);
    assert.equal(read('ERROR'), false);
    assert.equal(read('OK'), true);
    assert.equal(read(''), true, 'a response with no status keeps its old meaning');
});

test('a web client answering 200 UNPLAYABLE never tells the user the video has no captions', async () => {
    const { svc, posts } = mobileRouteHarness({
        global: null,
        extensionFetchJson: async (details) => {
            const name = JSON.parse(details.data).context.client.clientName;
            posts.push({ name });
            if (name !== 'WEB') throw new Error(`HTTP 403 ${name}`);
            return {
                response: { status: 200 },
                data: { playabilityStatus: { status: 'UNPLAYABLE' }, videoDetails: { videoId: VIDEO, title: 'Title' } }
            };
        }
    });
    let htmlAsked = false;
    svc._method3_HTMLPageFetch = async () => {
        htmlAsked = true;
        return { tracks: [], videoTitle: 'Title', captionless: true };
    };
    const result = await svc.fetchTranscript(VIDEO);
    assert.equal(htmlAsked, true, 'the routes after it still get their say');
    assert.equal(result.status, 'captionless', 'and the page\'s own OK is what decides');
    assert.equal(posts[posts.length - 1].name, 'WEB');
});

test('discovery that fails everywhere else finds the mobile tracks and fetches them anonymously', async () => {
    const { svc, posts, gets } = mobileRouteHarness({ clients: { ANDROID: androidTracks() }, global: null });
    svc._getInnertubeApiKey = () => '';
    const result = await svc.fetchTranscript(VIDEO);
    assert.equal(result.status, 'ready');
    assert.equal(result.provenance.source, 'innertube-mobile');
    assert.equal(result.provenance.fallbackReason, '');
    assert.deepEqual(posts.map((post) => post.name), ['ANDROID'], 'an empty mobile track would not ask the same route twice');
    assert.ok(gets.every((get) => get.credentials === 'omit'));
});

test('an empty track from the mobile route does not ask the mobile route again', async () => {
    const { svc, posts } = mobileRouteHarness({ clients: { ANDROID: androidTracks() }, global: null, text: () => '' });
    svc._getInnertubeApiKey = () => '';
    const result = await svc.fetchTranscript(VIDEO);
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(posts.map((post) => post.name), ['ANDROID']);
});

test('off-page retrieval falls over too, without touching the page', async () => {
    const global = playerResponse([{ baseUrl: `${WEB_TRACK}&from=global`, languageCode: 'en' }]);
    const { svc, gets } = mobileRouteHarness({ clients: { ANDROID: androidTracks() }, global });
    const result = await svc.fetchTranscript('zyxwvutsrqp', { allowOffPage: true }).catch((error) => error);
    assert.ok(!gets.some((get) => get.url.includes('from=global')), 'the current page\'s tracks stay out of it');
    assert.equal(result.status === 'ready', false, 'tracks for another video must not satisfy the request');
});

test('leaving the video during the fall over cancels it', async () => {
    let current = VIDEO;
    const harness = mobileRouteHarness({ clients: { ANDROID: androidTracks() }, getVideoId: () => current });
    const realTracks = harness.svc._getCaptionTracks.bind(harness.svc);
    harness.svc._getCaptionTracks = async (videoId, options) => {
        const answer = await realTracks(videoId, options);
        if (options.mobileOnly) current = 'zzzzzzzzzzz';
        return answer;
    };
    await assert.rejects(() => harness.svc.fetchTranscript(VIDEO), { name: 'AbortError' });
    assert.ok(!harness.gets.some((get) => get.url.includes('sig=mobile')), 'nothing is fetched for the old video');
});

test('leaving the video while the mobile track loads cancels it', async () => {
    let current = VIDEO;
    const harness = mobileRouteHarness({
        clients: { ANDROID: androidTracks() },
        getVideoId: () => current,
        text: (url) => {
            if (!url.includes('sig=mobile')) return '';
            current = 'zzzzzzzzzzz';
            return JSON3_BODY;
        }
    });
    await assert.rejects(() => harness.svc.fetchTranscript(VIDEO), { name: 'AbortError' });
});

test('an abort stops the client chain', async () => {
    const controller = new AbortController();
    const { svc, posts } = mobileRouteHarness({ clients: {} });
    const options = { signal: controller.signal };
    const pending = svc._method6_MobileClientPlayer(VIDEO, options);
    controller.abort();
    await assert.rejects(() => pending, { name: 'AbortError' });
    assert.ok(posts.length <= 1, 'no client is asked after the abort');
});

test('an aborted mobile call is not swallowed as a refused client', async () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const names = [];
    const svc = createTranscriptService({
        getVideoId: () => VIDEO,
        extensionFetchJson: async (details) => {
            names.push(JSON.parse(details.data).context.client.clientName);
            throw Object.assign(new Error('Operation cancelled'), { name: 'AbortError' });
        }
    });
    await assert.rejects(() => svc._method6_MobileClientPlayer(VIDEO), { name: 'AbortError' });
    assert.deepEqual(names, ['ANDROID']);
});

test('an abort during the fall over reaches the caller instead of reading as unavailable', async () => {
    const abort = () => { throw Object.assign(new Error('Operation cancelled'), { name: 'AbortError' }); };
    const { svc } = mobileRouteHarness({ clients: { ANDROID: androidTracks() } });
    const real = svc._fetchTranscriptContent.bind(svc);
    svc._fetchTranscriptContent = async (url, options) => (url.includes('sig=mobile') ? abort() : real(url, options));
    await assert.rejects(() => svc.fetchTranscript(VIDEO), { name: 'AbortError' });

    const second = mobileRouteHarness({ clients: { ANDROID: androidTracks() } });
    second.svc._getCaptionTracks = (original => async (videoId, options) => (options.mobileOnly ? abort() : original(videoId, options)))(second.svc._getCaptionTracks.bind(second.svc));
    await assert.rejects(() => second.svc.fetchTranscript(VIDEO), { name: 'AbortError' });
});

test('every format fetch asks for one format, whatever the URL already named', async () => {
    const { svc, gets } = mobileRouteHarness({ text: () => '' });
    await svc._fetchTranscriptContent(mobileUrl('en'));
    assert.deepEqual(gets.map((get) => get.url), [
        `https://www.youtube.com/api/timedtext?v=${VIDEO}&lang=en&sig=mobile&fmt=json3`,
        `https://www.youtube.com/api/timedtext?v=${VIDEO}&lang=en&sig=mobile`
    ]);
});

test('stripping the format leaves the rest of the URL byte for byte', async () => {
    const { svc, gets } = mobileRouteHarness({ text: () => '' });
    const cases = [
        [`https://y/t?fmt=srv3&sparams=a%2Cb&sig=A~_-.`, 'https://y/t?sparams=a%2Cb&sig=A~_-.'],
        [`https://y/t?sparams=a%2Cb&sig=x&fmt=srv3`, 'https://y/t?sparams=a%2Cb&sig=x'],
        [`https://y/t?fmt=srv3`, 'https://y/t'],
        [`https://y/t?a=1&xfmt=keep&fmt=srv3&b=2`, 'https://y/t?a=1&xfmt=keep&b=2']
    ];
    for (const [input, expected] of cases) {
        gets.length = 0;
        await svc._fetchTranscriptContent(input);
        assert.equal(gets[1].url, expected);
    }
});

test('the XML a mobile URL returns is read when json3 has nothing', async () => {
    const xml = '<?xml version="1.0" encoding="utf-8" ?><transcript><text start="1.5" dur="2">Plain words</text></transcript>';
    const { svc } = mobileRouteHarness({
        clients: { ANDROID: androidTracks() },
        text: (url) => (url.includes('sig=mobile') && !url.includes('fmt=') ? xml : '')
    });
    svc._parseXML = (content) => (content.includes('Plain words') ? [{ startMs: 1500, endMs: 3500, text: 'Plain words' }] : []);
    const result = await svc.fetchTranscript(VIDEO);
    assert.equal(result.status, 'ready');
    assert.equal(result.segments[0].text, 'Plain words');
});

test('the page language names the tracks, and a strange one is not sent', async () => {
    const hadDocument = Object.prototype.hasOwnProperty.call(globalThis, 'document');
    const previous = globalThis.document;
    try {
        for (const [lang, expected] of [['ja', 'ja'], ['pt-BR', 'pt-BR'], ['', 'en'], ['"><x', 'en']]) {
            globalThis.document = { documentElement: { lang } };
            const { svc, posts } = mobileRouteHarness({ clients: { ANDROID: androidTracks() } });
            await svc._method6_MobileClientPlayer(VIDEO);
            assert.equal(posts[0].client.hl, expected);
        }
        delete globalThis.document;
        const { svc, posts } = mobileRouteHarness({ clients: { ANDROID: androidTracks() } });
        await svc._method6_MobileClientPlayer(VIDEO);
        assert.equal(posts[0].client.hl, 'en');
    } finally {
        if (hadDocument) globalThis.document = previous;
        else delete globalThis.document;
    }
});

test('the viewer labels the mobile route the same as other fresh player data', () => {
    const ytkit = fs.readFileSync(ytkitPath, 'utf8');
    assert.match(ytkit, /case 'innertube-player':\s+case 'innertube-mobile': return t\('transcriptSourceInnertube'/);
});
