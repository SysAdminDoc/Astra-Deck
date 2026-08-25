'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sources, config, runtimeModules } = require('./helpers/source');

function loadFeatureModule(modulePath, namespaceKey) {
    const originalFeatures = globalThis.YTKitFeatures;
    delete require.cache[require.resolve(modulePath)];
    globalThis.YTKitFeatures = {};
    const mod = require(modulePath);
    const exported = globalThis.YTKitFeatures[namespaceKey];
    globalThis.YTKitFeatures = originalFeatures;
    return { mod, exported };
}

test('external API health core module loads before crowd API feature modules', () => {
    for (const scriptGroup of config.manifest.content_scripts) {
        const scripts = runtimeModules(scriptGroup);
        const coreIndex = scripts.indexOf('core/external-api-health.js');
        if (coreIndex === -1) continue;
        for (const featurePath of [
            'features/video-insights/index.js',
            'features/return-dislike/index.js',
            'features/sponsorblock/index.js',
            'features/dearrow/index.js'
        ]) {
            const featureIndex = scripts.indexOf(featurePath);
            if (featureIndex === -1) continue;
            assert.ok(coreIndex < featureIndex, 'external-api-health must load before ' + featurePath);
        }
    }
});

test('popup and sidepanel expose external API health snapshots and diagnostics export includes them', () => {
    const popupHtml = sources.popupHtml;
    const popupJs = sources.popup;
    const sidepanelHtml = fs.readFileSync(path.join(__dirname, '..', 'extension', 'sidepanel.html'), 'utf8');
    const sidepanelJs = fs.readFileSync(path.join(__dirname, '..', 'extension', 'sidepanel.js'), 'utf8');

    assert.match(popupHtml, /id="external-health"/, 'popup must declare the external API health section');
    assert.match(popupJs, /YTKIT_GET_EXTERNAL_API_HEALTH/, 'popup must request the external API health snapshot');
    assert.match(popupJs, /externalApiHealth/, 'diagnostics save payload must include externalApiHealth');
    assert.match(popupJs, /lastHost/, 'popup health detail must expose the host that answered');
    assert.match(popupJs, /lastSuccessSource/, 'popup health detail must expose data provenance');
    assert.match(popupJs, /localFallback/, 'popup health detail must expose the local fallback');
    assert.match(sidepanelHtml, /id="sp-external"/, 'sidepanel must declare the external API health section');
    assert.match(sidepanelJs, /YTKIT_GET_EXTERNAL_API_HEALTH/, 'sidepanel must request the external API health snapshot');
    assert.match(sidepanelJs, /spExternalHostTpl/, 'sidepanel health detail must expose the host that answered');
    assert.match(sidepanelJs, /lastRefreshAgeMs/, 'sidepanel health detail must expose refresh age');
});

test('ytkit exposes external API health message handler and passes tracker into crowd modules', () => {
    assert.match(sources.ytkit, /createExternalApiHealth/, 'ytkit must instantiate ExternalApiHealth');
    assert.match(sources.ytkit, /YTKIT_GET_EXTERNAL_API_HEALTH/, 'ytkit must expose the health snapshot message');
    for (const factoryName of [
        'createVideoInsightsFeature',
        'createSponsorBlockFeature',
        'createDeArrowFeature',
        'createReturnDislikeFeature'
    ]) {
        const idx = sources.ytkit.indexOf(factoryName);
        assert.ok(idx > -1, factoryName + ' must be instantiated');
        const depBag = sources.ytkit.slice(idx, idx + 600);
        assert.match(depBag, /ExternalApiHealth/, factoryName + ' dependency bag must include ExternalApiHealth');
    }
});

function loadHealthCore() {
    const originalCore = globalThis.YTKitCore;
    delete require.cache[require.resolve('../extension/core/external-api-health.js')];
    globalThis.YTKitCore = {};
    require('../extension/core/external-api-health.js');
    const core = globalThis.YTKitCore;
    globalThis.YTKitCore = originalCore;
    return core;
}

test('describeDegradation stays silent for healthy services and describes degraded ones', () => {
    const core = loadHealthCore();
    const health = core.createExternalApiHealth({ now: () => 1000000 });

    // Healthy / unknown → no in-page feedback.
    assert.equal(core.describeExternalApiDegradation(null), null);
    const okRec = health.recordSuccess('sponsorBlock', { ts: 999000 });
    assert.equal(health.describeDegradation(okRec), null);

    // Rate-limited with a budget reset → retry reason in the copy.
    const limited = health.recordFailure('returnDislike', null, {
        errorClass: 'rate-limited',
        requestBudget: { limit: 100, used: 100, resetMs: 40000 }
    });
    const limitedDesc = health.describeDegradation(limited);
    assert.equal(limitedDesc.feature, 'returnDislike');
    assert.match(limitedDesc.text, /rate limited, retrying in 40s/);

    // Stale-cache fallback → cache age in the copy.
    health.recordSuccess('deArrow', { ts: 1000000 - 12 * 60000 });
    const degraded = health.recordCacheFallback('deArrow', new Error('network offline'));
    const degradedDesc = health.describeDegradation(degraded, 1000000);
    assert.equal(degradedDesc.state, 'degraded');
    assert.match(degradedDesc.text, /showing 12m-old cache/);

    // Plain error → human reason, not a raw error class token.
    const errored = health.recordFailure('sponsorBlock', new Error('fetch failed'));
    const erroredDesc = health.describeDegradation(errored);
    assert.match(erroredDesc.text, /SponsorBlock: network error/);

    const permissionError = new Error('Runtime host permission not granted: https://sponsor.ajay.app/*');
    const permissionDenied = health.recordFailure('deArrow', permissionError);
    assert.equal(permissionDenied.lastErrorClass, 'permission-denied');
    assert.match(health.describeDegradation(permissionDenied).text,
        /DeArrow: host access needed, re-enable in Settings/);
});

test('health subscribers are notified on every record mutation and recovery', () => {
    const core = loadHealthCore();
    const health = core.createExternalApiHealth({ now: () => 5000 });
    const seen = [];
    const unsubscribe = health.subscribe((rec) => seen.push({ id: rec.id, state: rec.state }));

    health.recordFailure('sponsorBlock', new Error('boom'));
    health.recordCacheFallback('deArrow', new Error('boom'));
    health.recordSuccess('sponsorBlock');

    assert.deepEqual(seen[0], { id: 'sponsorBlock', state: 'error' });
    assert.equal(seen[seen.length - 1].id, 'sponsorBlock');
    assert.equal(seen[seen.length - 1].state, 'ok');
    // recordCacheFallback notifies through recordFailure AND after the
    // degraded-state rewrite; the final notification must carry 'degraded'.
    assert.ok(seen.some((entry) => entry.id === 'deArrow' && entry.state === 'degraded'));

    unsubscribe();
    health.recordFailure('returnDislike', new Error('boom'));
    assert.equal(seen.some((entry) => entry.id === 'returnDislike'), false,
        'unsubscribed listeners must not fire');

    // A throwing subscriber must never poison the fetch path.
    health.subscribe(() => { throw new Error('bad listener'); });
    assert.doesNotThrow(() => health.recordFailure('sponsorBlock', new Error('boom')));
});

test('external API health records the host that answered or failed', () => {
    const core = loadHealthCore();
    const health = core.createExternalApiHealth({ now: () => 5000 });

    const success = health.recordSuccess('sponsorBlock', {
        host: 'https://sponsorblock.kavin.rocks',
        fallbackState: 'mirror'
    });
    assert.equal(success.lastHost, 'https://sponsorblock.kavin.rocks');
    assert.equal(success.fallbackState, 'mirror');

    const failure = health.recordFailure('deArrow', new Error('offline'), {
        host: 'https://sponsor.ajay.app'
    });
    assert.equal(failure.lastHost, 'https://sponsor.ajay.app');
});

test('external API health exposes provenance, TTL staleness, privacy, and cooldown state', () => {
    const core = loadHealthCore();
    let now = 1000;
    const health = core.createExternalApiHealth({ now: () => now });

    health.recordSuccess('sponsorBlock', {
        source: 'cache',
        cacheState: 'fresh',
        ts: now,
        cacheTtlMs: 1000
    });
    let sponsor = health.snapshot().find((entry) => entry.id === 'sponsorBlock');
    assert.equal(sponsor.lastSuccessSource, 'cache');
    assert.equal(sponsor.lastRefreshAgeMs, 0);
    assert.equal(sponsor.availability, 'available');
    assert.match(sponsor.privacy, /hashed video prefix/);
    assert.match(sponsor.localFallback, /native playback/);

    now = 2000;
    sponsor = health.snapshot().find((entry) => entry.id === 'sponsorBlock');
    assert.equal(sponsor.cacheState, 'stale', 'a cached result must become visibly stale after its TTL');
    assert.equal(sponsor.availability, 'stale');
    assert.equal(sponsor.lastRefreshAgeMs, 1000);

    const rateLimited = new Error('HTTP 429');
    rateLimited.response = { status: 429 };
    health.recordFailure('returnDislike', rateLimited, {
        requestBudget: { used: 100, limit: 100, resetMs: 5000 }
    });
    const ryd = health.snapshot().find((entry) => entry.id === 'returnDislike');
    assert.equal(ryd.availability, 'cooldown');
    assert.equal(ryd.cooldownRemainingMs, 5000);
    assert.equal(ryd.cooldownReason, 'rate-limited');
});

test('external API health keeps empty, revalidated, and timeout outcomes distinguishable', () => {
    const core = loadHealthCore();
    let now = 1000;
    const health = core.createExternalApiHealth({ now: () => now });

    const empty = health.recordSuccess('sponsorBlock', {
        source: 'network',
        cacheState: 'refreshed',
        status: 200,
        itemCount: 0
    });
    assert.equal(empty.state, 'ok');
    assert.equal(empty.cacheState, 'refreshed');
    assert.equal(empty.lastSuccessSource, 'network');

    now = 2000;
    const revalidated = health.recordSuccess('sponsorBlock', {
        source: 'revalidated-cache',
        cacheState: 'fresh',
        status: 304,
        ts: 1000
    });
    assert.equal(revalidated.state, 'ok');
    assert.equal(revalidated.lastSuccessSource, 'revalidated-cache');
    assert.equal(revalidated.lastRefreshAgeMs, 1000);

    const timeout = new Error('request timeout');
    health.recordFailure('deArrow', timeout, { errorClass: 'network-error' });
    const failed = health.snapshot().find((entry) => entry.id === 'deArrow');
    assert.equal(failed.state, 'error');
    assert.equal(failed.lastErrorClass, 'network-error');
    assert.equal(failed.availability, 'unavailable');
});

test('ytkit renders the in-page degraded-state strip with theme and motion safeguards', () => {
    const src = sources.ytkit;
    assert.match(src, /ServiceStateStrip/, 'ytkit must define the service-state strip');
    assert.match(src, /ExternalApiHealth\.subscribe\(\(record\) => ServiceStateStrip\.update\(record\)\)/,
        'the strip must subscribe to health record mutations');
    assert.match(src, /appState\?\.settings\?\.\[desc\.feature\]/,
        'pills must only render while the owning feature is enabled');
    assert.match(src, /prefers-reduced-motion: reduce/,
        'strip styling must respect reduced motion');
    assert.match(src, /html:not\(\[dark\]\) \.ytkit-service-state-pill/,
        'strip styling must carry a light-theme override');
    assert.match(src, /setAttribute\('role', 'status'\)/,
        'the strip container must be a polite live region');
});

test('SponsorBlock reports stale-cache fallback to ExternalApiHealth', async () => {
    const { mod } = loadFeatureModule(
        '../extension/features/sponsorblock/index.js',
        'createSponsorBlockFeature'
    );
    const calls = [];
    const videoId = 'dQw4w9WgXcQ';
    const staleTs = Date.now() - (13 * 60 * 60 * 1000);
    const feature = mod.createSponsorBlockFeature({
        appState: { settings: { sbCat_sponsor: true } },
        storageReadJSON: () => ({
            [videoId]: {
                ts: staleTs,
                categoryKey: 'sponsor',
                segments: [{ segment: [1, 4], category: 'sponsor', actionType: 'skip' }]
            }
        }),
        storageWriteJSON() {},
        extensionFetchJson: async () => { throw new Error('network offline'); },
        ExternalApiHealth: {
            recordCacheFallback: (...args) => calls.push(args)
        },
        DiagnosticLog: { record() {} },
        VIDEO_ID_PATTERN: /^[A-Za-z0-9_-]{11}$/
    });

    const segments = await feature._fetchSegments(videoId);

    assert.equal(segments.length, 1);
    assert.equal(segments[0]._ytkitCacheSource, 'stale');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'sponsorBlock');
    assert.equal(calls[0][2].fallbackState, 'stale-cache');
});

test('DeArrow reports invalid branding payload to ExternalApiHealth', async () => {
    const { mod } = loadFeatureModule(
        '../extension/features/dearrow/index.js',
        'createDeArrowFeature'
    );
    const calls = [];
    const feature = mod.createDeArrowFeature({
        appState: { settings: {} },
        extensionFetchJson: async () => ({ data: [] }),
        storageWriteJSON() {},
        ExternalApiHealth: {
            recordFailure: (...args) => calls.push(args)
        },
        DiagnosticLog: { record() {} }
    });

    const result = await feature._doFetch('dQw4w9WgXcQ');

    assert.equal(result, null);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'deArrow');
    assert.equal(calls[0][2].errorClass, 'invalid-payload');
});

test('DeArrow treats HTTP 404 as an expected cached no-branding result', async () => {
    const { mod } = loadFeatureModule(
        '../extension/features/dearrow/index.js',
        'createDeArrowFeature'
    );
    const calls = [];
    let fetchCount = 0;
    const notFound = new Error('HTTP 404');
    notFound.response = { status: 404 };
    notFound.data = {
        titles: [],
        thumbnails: [],
        casualVotes: [],
        randomTime: 0.2,
        videoDuration: null
    };
    const feature = mod.createDeArrowFeature({
        appState: { settings: { daCacheTTL: '4' } },
        extensionFetchJson: async () => {
            fetchCount += 1;
            throw notFound;
        },
        storageWriteJSON() {},
        ExternalApiHealth: {
            recordFailure: (...args) => calls.push(['failure', ...args]),
            recordSuccess: (...args) => calls.push(['success', ...args])
        },
        DiagnosticLog: { record() {} }
    });
    feature._schedulePersist = () => {};

    const first = await feature._fetchBranding('aaaaaaaaaaa');
    const second = await feature._fetchBranding('aaaaaaaaaaa');

    assert.equal(fetchCount, 1, 'negative lookup must be cached instead of refetched');
    assert.equal(first, second);
    assert.deepEqual(first.titles, []);
    assert.equal(calls.some(([kind]) => kind === 'failure'), false);
    assert.equal(calls[0][0], 'success');
    assert.equal(calls[0][2].source, 'network-miss');
});

test('DeArrow retries a failed primary API host through the configured mirror', async () => {
    const { mod } = loadFeatureModule(
        '../extension/features/dearrow/index.js',
        'createDeArrowFeature'
    );
    const calls = [];
    const health = [];
    const serviceUnavailable = new Error('HTTP 503');
    serviceUnavailable.response = { status: 503 };
    const feature = mod.createDeArrowFeature({
        appState: {
            settings: {
                daCacheTTL: '4',
                sponsorBlockBaseUrl: 'https://sponsor.ajay.app',
                sponsorBlockMirrorUrl: 'https://sponsorblock.kavin.rocks'
            }
        },
        extensionFetchJson: async (request) => {
            calls.push(request);
            if (calls.length === 1) throw serviceUnavailable;
            return { data: { titles: [], thumbnails: [], casualVotes: [] } };
        },
        storageWriteJSON() {},
        ExternalApiHealth: {
            recordSuccess: (...args) => health.push(args)
        },
        DiagnosticLog: { record() {} }
    });
    feature._schedulePersist = () => {};

    const result = await feature._doFetch('dQw4w9WgXcQ');

    assert.deepEqual(result.titles, []);
    assert.match(calls[0].url, /^https:\/\/sponsor\.ajay\.app\/api\/branding/);
    assert.match(calls[1].url, /^https:\/\/sponsorblock\.kavin\.rocks\/api\/branding/);
    const success = health.find(([id]) => id === 'deArrow');
    assert.equal(success[1].host, 'https://sponsorblock.kavin.rocks');
    assert.equal(success[1].fallbackState, 'mirror');
});

test('Return Dislike reports invalid payload and request-budget exhaustion', async () => {
    const { mod } = loadFeatureModule(
        '../extension/features/return-dislike/index.js',
        'createReturnDislikeFeature'
    );
    const calls = [];
    let fetchCount = 0;
    const feature = mod.createReturnDislikeFeature({
        appState: { settings: { returnDislikeCacheHours: 24 } },
        storageReadJSON: () => ({}),
        storageWriteJSON() {},
        extensionFetchJson: async () => {
            fetchCount += 1;
            if (fetchCount === 1) return { data: { likes: 10 } };
            return { data: { likes: 10, dislikes: 3, viewCount: 100, rating: 4.5 } };
        },
        ExternalApiHealth: {
            recordFailure: (...args) => calls.push(['failure', ...args]),
            recordSuccess: (...args) => calls.push(['success', ...args])
        },
        DiagnosticLog: { record() {} }
    });

    assert.equal(await feature._fetch('invalid-payload-video'), null);
    assert.equal(calls[0][0], 'failure');
    assert.equal(calls[0][3].errorClass, 'invalid-payload');

    for (let i = 0; i < 99; i++) {
        const data = await feature._fetch(`budget-ok-${i}`);
        assert.ok(data);
    }
    assert.equal(await feature._fetch('budget-exhausted'), null);
    const last = calls[calls.length - 1];
    assert.equal(last[0], 'failure');
    assert.equal(last[1], 'returnDislike');
    assert.equal(last[3].errorClass, 'rate-limited');
    assert.equal(last[3].requestBudget.used, 100);
});

// ── SponsorBlock 404 = "nothing submitted", not a failure ──
// The hash-prefix endpoint answers 404 for any prefix with no submissions,
// which is most videos. Treating it as an error failed over to the mirror,
// spent a second request, and surfaced the mirror's reply as an in-page
// "SponsorBlock: unexpected response" pill on ordinary watch pages.
test('SponsorBlock treats HTTP 404 as an empty segment list, not a failure', async () => {
    const { mod } = loadFeatureModule(
        '../extension/features/sponsorblock/index.js',
        'createSponsorBlockFeature'
    );
    const health = [];
    const hosts = [];
    const notFound = new Error('HTTP 404');
    notFound.response = { status: 404 };
    const feature = mod.createSponsorBlockFeature({
        appState: {
            settings: {
                sbCat_sponsor: true,
                sponsorBlockBaseUrl: 'https://sponsor.ajay.app',
                sponsorBlockMirrorUrl: 'https://sponsorblock.kavin.rocks'
            }
        },
        storageReadJSON: (_key, fallback) => fallback,
        storageWriteJSON() {},
        extensionFetchJson: async ({ url }) => {
            hosts.push(new URL(url).origin);
            throw notFound;
        },
        ExternalApiHealth: {
            recordSuccess: (...args) => health.push(['success', ...args]),
            recordFailure: (...args) => health.push(['failure', ...args]),
            recordCacheFallback: (...args) => health.push(['fallback', ...args])
        },
        DiagnosticLog: { record() {} },
        VIDEO_ID_PATTERN: /^[A-Za-z0-9_-]{11}$/
    });

    const segments = await feature._fetchSegments('dQw4w9WgXcQ');

    assert.deepEqual(segments, [], 'a 404 answers as no segments');
    assert.equal(hosts.length, 1,
        'a 404 must not fail over to the mirror — there is nothing there to find either');
    assert.equal(health.some(([kind]) => kind !== 'success'), false,
        'a 404 must never be recorded as a failure or a cache fallback');
    assert.equal(health[0][2].itemCount, 0);
});

test('SponsorBlock still fails over and reports when a host genuinely errors', async () => {
    const { mod } = loadFeatureModule(
        '../extension/features/sponsorblock/index.js',
        'createSponsorBlockFeature'
    );
    const health = [];
    const hosts = [];
    const serverError = new Error('HTTP 503');
    serverError.response = { status: 503 };
    const feature = mod.createSponsorBlockFeature({
        appState: {
            settings: {
                sbCat_sponsor: true,
                sponsorBlockBaseUrl: 'https://sponsor.ajay.app',
                sponsorBlockMirrorUrl: 'https://sponsorblock.kavin.rocks'
            }
        },
        storageReadJSON: (_key, fallback) => fallback,
        storageWriteJSON() {},
        extensionFetchJson: async ({ url }) => {
            hosts.push(new URL(url).origin);
            throw serverError;
        },
        ExternalApiHealth: {
            recordSuccess: (...args) => health.push(['success', ...args]),
            recordFailure: (...args) => health.push(['failure', ...args]),
            recordCacheFallback: (...args) => health.push(['fallback', ...args])
        },
        DiagnosticLog: { record() {} },
        VIDEO_ID_PATTERN: /^[A-Za-z0-9_-]{11}$/
    });

    const segments = await feature._fetchSegments('dQw4w9WgXcQ');

    assert.deepEqual(segments, []);
    assert.equal(hosts.length, 2, 'a real error still tries the mirror');
    assert.equal(health.filter(([kind]) => kind === 'failure').length, 1,
        'a real error is still reported');
});

// ── Only actionable degradation earns an in-page pill ──
test('describeDegradation marks only user-fixable states actionable', () => {
    const core = loadHealthCore();
    const health = core.createExternalApiHealth({ now: () => 1000000 });

    const permissionError = new Error('Runtime host permission not granted: https://sponsor.ajay.app/*');
    assert.equal(health.describeDegradation(health.recordFailure('sponsorBlock', permissionError)).actionable,
        true, 'a revoked host permission is fixed by the user in Settings');

    for (const [label, detail] of [
        ['rate limit', { errorClass: 'rate-limited' }],
        ['server error', { errorClass: 'server-error' }],
        ['invalid payload', { errorClass: 'invalid-payload' }],
        ['network error', { errorClass: 'network-error' }]
    ]) {
        const record = health.recordFailure('deArrow', null, detail);
        const desc = health.describeDegradation(record);
        assert.equal(desc.actionable, false, `${label} is not something the reader can act on`);
        assert.ok(desc.text, 'the copy is still produced for the diagnostic surfaces');
    }
});

test('the in-page strip suppresses non-actionable states except a sustained outage', () => {
    // This pinned the exact suppression expression, which was right when the
    // only two ways past it were "actionable" and debugMode. There is now a
    // third and it is the point of the surface: a service failing repeatedly
    // is invisible where the user is looking, so an upstream going down reads
    // as Astra Deck breaking YouTube. The rule the test is for — a single
    // transient must never earn a pill — is unchanged and asserted below.
    const src = sources.ytkit;
    const start = src.indexOf('const ServiceStateStrip');
    assert.ok(start > -1, 'the strip must exist');
    const block = src.slice(start, src.indexOf('return { update, remove };', start));
    assert.match(block, /!desc\.actionable && !showOutage && appState\?\.settings\?\.debugMode !== true/,
        'non-actionable states must be suppressed unless debugMode is on or the service is sustainedly down');
    assert.match(block, /remove\(record\.id\);/,
        'a suppressed state must also clear any pill it had already shown');
});

// ── Sustained outages on the watch page ──
//
// SponsorBlock and DeArrow failures used to reach only the diagnostic log, so
// an upstream outage or a rate limit read to the user as "Astra Deck broke
// YouTube" — the documented way enrichment tools lose trust. The page now says
// which service is down, but only when it is really down: a single transient
// interrupting someone's video is the false alarm that teaches people to
// ignore the indicator.

const outageHealth = require('../extension/core/external-api-health.js');

function healthWithFailures(count, detail = {}) {
    const health = outageHealth.createExternalApiHealth({ now: () => 1_000_000 });
    let record = null;
    for (let i = 0; i < count; i += 1) {
        record = health.recordFailure('sponsorBlock', new Error('fetch failed'), detail);
    }
    return { health, record };
}

test('one failure is a transient and earns no page notice', () => {
    const { health, record } = healthWithFailures(1);
    assert.equal(record.consecutiveFailures, 1);
    assert.equal(health.describeServiceOutage(record), null);
});

test('repeated failures name the service as unreachable', () => {
    const { health, record } = healthWithFailures(3);
    const outage = health.describeServiceOutage(record);
    assert.ok(outage, 'a sustained failure must reach the page');
    assert.equal(outage.kind, 'unreachable');
    assert.equal(outage.id, 'sponsorBlock');
    assert.ok(outage.label.length > 0, 'the notice must name the upstream service');
    assert.equal(outage.failures, 3);
});

test('"nothing for this video" is not an outage, however often it happens', () => {
    // A 404 from an enrichment API is the normal case for most videos. Telling
    // a user their extension is broken because SponsorBlock has no segments
    // for a two-view upload is the exact false alarm to avoid.
    const health = outageHealth.createExternalApiHealth({ now: () => 1_000_000 });
    let record = null;
    for (let i = 0; i < 5; i += 1) {
        record = health.recordFailure('sponsorBlock', Object.assign(new Error('not found'), { status: 404 }));
    }
    assert.equal(record.lastErrorClass, 'no-data');
    assert.equal(record.consecutiveFailures, 0);
    assert.equal(health.describeServiceOutage(record), null);
});

test('one success clears the streak, so a recovered service stops warning', () => {
    const { health } = healthWithFailures(4);
    const recovered = health.recordSuccess('sponsorBlock', { source: 'network' });
    assert.equal(recovered.consecutiveFailures, 0);
    assert.equal(health.describeServiceOutage(recovered), null);
});

test('a revoked host permission is reported as the user\'s to fix, not an outage', () => {
    const health = outageHealth.createExternalApiHealth({ now: () => 1_000_000 });
    const error = Object.assign(new Error('optional host permission denied'), {
        code: 'OPTIONAL_HOST_PERMISSION_DENIED'
    });
    health.recordFailure('deArrow', error);
    const record = health.recordFailure('deArrow', error);
    const outage = health.describeServiceOutage(record);
    assert.equal(outage.kind, 'permission');
});

test('the in-page pill shows a sustained outage, names the service, and can be dismissed', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');
    const strip = source.slice(
        source.indexOf('const ServiceStateStrip'),
        source.indexOf('if (typeof ExternalApiHealth.subscribe')
    );
    assert.ok(strip.includes('describeServiceOutage'),
        'the strip must consult the outage rule, not only the diagnostic one');
    assert.ok(strip.includes('dismissed.has(record.id)'),
        'a dismissed service must stay dismissed');
    assert.ok(strip.includes('serviceOutageTpl'),
        'the copy must be localized');
    // Suppressed while the feature is off: the existing settings gate above
    // the outage branch is what does that, so it must still be there.
    assert.ok(strip.includes("!appState?.settings?.[desc.feature]"),
        'a feature that is off must never produce a notice');
    // Passive: no retry affordance, and the auto-expire timer still applies.
    assert.equal(/addEventListener\('click'[^)]*retry/i.test(strip), false);
    assert.ok(strip.includes('AUTO_EXPIRE_MS'));
});
