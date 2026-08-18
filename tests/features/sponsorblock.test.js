'use strict';

// Per-area test bed for the SponsorBlock feature.
//
// NX12 modularization seed (v3.23.0). Future SponsorBlock regressions
// land here; pre-existing tests in `tests/hardening.test.js` migrate
// incrementally.

const test = require('node:test');
const assert = require('node:assert/strict');
const { sources, config, extractFeatureBlock } = require('../helpers/source');

test('SponsorBlock feature block is reachable via the shared helper', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'sponsorBlock');
    assert.ok(block.length > 100,
        'SponsorBlock feature block must contain non-trivial source');
    assert.match(block, /_loadForVideo|_checkSkip|_segments/,
        'SponsorBlock feature must carry its segment-load / skip API');
});

test('SponsorBlock skip path announces via aria-live with a human-friendly category label (NX5)', () => {
    // The aria-live announcement landed in _checkSkip alongside the
    // already-shipped no-toast invariant. Pin the label map so a
    // refactor can't reduce screen-reader output to "Skipped sponsor"
    // (which is fine but the v3.23.0 surface uses richer labels).
    const block = sources.ytkit;
    const idx = block.indexOf('_checkSkip()');
    assert.ok(idx > -1, '_checkSkip must exist');
    const region = block.slice(idx, idx + 3500);
    assert.match(region, /announceA11y\(/,
        'SponsorBlock skip must announce via announceA11y');
    assert.match(region, /Skipped \$\{label\}/,
        'SponsorBlock announcement must use a human-friendly category label, not the raw category id');
});

test('SponsorBlock anti-adblock diagnostic records a string, not [object Object]', () => {
    // DiagnosticLog.record coerces the message via String(msg); passing an
    // object logs the literal "[object Object]" and loses the selector detail.
    const fs = require('fs');
    const path = require('path');
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'sponsorblock', 'index.js'), 'utf8');
    const idx = modSrc.indexOf("record('sb-anti-adblock'");
    assert.ok(idx > -1, 'anti-adblock diagnostic must call record with the sb-anti-adblock context');
    const region = modSrc.slice(idx, idx + 200);
    assert.doesNotMatch(region, /record\(\s*'sb-anti-adblock'\s*,\s*\{/,
        'record must not be passed an object literal (would log [object Object])');
    assert.match(region, /record\(\s*'sb-anti-adblock'\s*,\s*`/,
        'record must be passed a formatted string with the selector detail');
});

test('poi_highlight stays a marker, never a skip target (v3.20.1 Pass 8)', () => {
    // Pin the documented SponsorBlock API contract: poi_highlight is
    // a jump-to reference, never an auto-skip end. Pass 8 closed this
    // correctness finding; this regression keeps it closed.
    const block = sources.ytkit;
    const idx = block.indexOf('_checkSkip()');
    const region = block.slice(idx, idx + 1500);
    assert.match(region, /poi_highlight/,
        '_checkSkip must reference poi_highlight by name');
    assert.match(region, /continue/,
        '_checkSkip must short-circuit on poi_highlight (continue, not skip)');
});

test('SponsorBlock uses event-driven setTimeout scheduling, not requestAnimationFrame', () => {
    // Upstream SponsorBlock v6.1.5 (2026-04-21) fixed "segments not skipping
    // when video is scrolled away" — their old code path was gated on a
    // requestAnimationFrame loop that stops firing when YouTube hides the
    // off-screen video via IntersectionObserver. Our SponsorBlock has
    // always used event-driven setTimeout boundaries (scheduled from the
    // `playing` / `seeked` / `ratechange` events), which fire regardless
    // of viewport. This test pins the architecture so a future refactor
    // can't accidentally introduce the same regression.
    const [block] = extractFeatureBlock(sources.ytkit, 'sponsorBlock');
    assert.match(block, /_scheduleNextSkip\(\) \{/,
        '_scheduleNextSkip must exist as the boundary-scheduling primitive');
    assert.match(block, /setTimeout\(\(\) => \{[\s\S]*?_checkSkip\(\)/,
        '_scheduleNextSkip must schedule _checkSkip via setTimeout (not rAF)');
    // The dangerous regression would be using requestAnimationFrame ANYWHERE
    // inside the SponsorBlock feature object for skip orchestration. Bar
    // segment rendering is fine to repaint via rAF batching, but skip
    // SCHEDULING must not be — rAF is the failure mode upstream patched.
    assert.equal(/requestAnimationFrame\([^)]*_checkSkip/.test(block), false,
        'SponsorBlock must NEVER schedule _checkSkip via requestAnimationFrame');
    assert.equal(/requestAnimationFrame\([^)]*_scheduleNextSkip/.test(block), false,
        'SponsorBlock must NEVER schedule the boundary planner via requestAnimationFrame');
});

test('SponsorBlock pauses scheduling when video is paused', () => {
    // The schedule chain self-terminates on a paused video so a long-paused
    // background tab doesn't accumulate dangling timers. Pin the early-return.
    const [block] = extractFeatureBlock(sources.ytkit, 'sponsorBlock');
    assert.match(block, /_scheduleNextSkip\(\) \{[\s\S]*?if \(!video \|\| video\.paused/,
        '_scheduleNextSkip must early-return on a missing / paused video element');
});

test('SponsorBlock retries a failed primary API host through the validated mirror', async () => {
    const { createSponsorBlockFeature } = require('../../extension/features/sponsorblock');
    const videoId = 'dQw4w9WgXcQ';
    const calls = [];
    const health = [];
    const originalCrypto = globalThis.crypto;
    if (!globalThis.crypto) globalThis.crypto = require('node:crypto').webcrypto;
    try {
        const feature = createSponsorBlockFeature({
            appState: {
                settings: {
                    sbCat_sponsor: true,
                    sponsorBlockBaseUrl: 'https://sponsor.ajay.app',
                    sponsorBlockMirrorUrl: 'https://sponsorblock.kavin.rocks'
                }
            },
            storageReadJSON: () => ({}),
            storageWriteJSON() {},
            extensionFetchJson: async (request) => {
                calls.push(request);
                if (calls.length === 1) throw new Error('primary offline');
                return {
                    data: [{
                        videoID: videoId,
                        segments: [{ segment: [1, 4], category: 'sponsor', actionType: 'skip' }]
                    }]
                };
            },
            ExternalApiHealth: {
                recordSuccess: (...args) => health.push(args)
            },
            DiagnosticLog: { record() {} }
        });
        feature._scheduleCachePersist = () => {};

        const segments = await feature._fetchSegments(videoId);

        assert.equal(segments.length, 1);
        assert.match(calls[0].url, /^https:\/\/sponsor\.ajay\.app\/api\/skipSegments\//);
        assert.match(calls[1].url, /^https:\/\/sponsorblock\.kavin\.rocks\/api\/skipSegments\//);
        const success = health.find(([id]) => id === 'sponsorBlock');
        assert.equal(success[1].host, 'https://sponsorblock.kavin.rocks');
        assert.equal(success[1].fallbackState, 'mirror');
    } finally {
        if (!originalCrypto) delete globalThis.crypto;
    }
});

test('SponsorBlock rejects unallowlisted API settings and stays on the canonical host', async () => {
    const { createSponsorBlockFeature } = require('../../extension/features/sponsorblock');
    const calls = [];
    const originalCrypto = globalThis.crypto;
    if (!globalThis.crypto) globalThis.crypto = require('node:crypto').webcrypto;
    try {
        const feature = createSponsorBlockFeature({
            appState: {
                settings: {
                    sbCat_sponsor: true,
                    sponsorBlockBaseUrl: 'http://evil.example/api',
                    sponsorBlockMirrorUrl: 'https://evil.example'
                }
            },
            storageReadJSON: () => ({}),
            storageWriteJSON() {},
            extensionFetchJson: async (request) => {
                calls.push(request);
                return { data: [] };
            },
            ExternalApiHealth: { recordSuccess() {} },
            DiagnosticLog: { record() {} }
        });
        feature._scheduleCachePersist = () => {};
        await feature._fetchSegments('dQw4w9WgXcQ');
        assert.equal(calls.length, 1);
        assert.match(calls[0].url, /^https:\/\/sponsor\.ajay\.app\//);
    } finally {
        if (!originalCrypto) delete globalThis.crypto;
    }
});

test('SponsorBlock attributes rendered timeline data and removes the label with the markers', () => {
    const { createSponsorBlockFeature } = require('../../extension/features/sponsorblock');
    const originalDocument = globalThis.document;
    const makeNode = (tagName) => ({
        tagName: tagName.toUpperCase(),
        style: {},
        dataset: {},
        attributes: {},
        children: [],
        parentNode: null,
        isConnected: false,
        setAttribute(name, value) { this.attributes[name] = String(value); },
        addEventListener(type, listener) { this.listeners ||= {}; this.listeners[type] = listener; },
        appendChild(child) {
            child.parentNode = this;
            child.isConnected = true;
            this.children.push(child);
            return child;
        },
        insertBefore(child, before) {
            child.parentNode = this;
            child.isConnected = true;
            const index = before ? this.children.indexOf(before) : -1;
            if (index >= 0) this.children.splice(index, 0, child);
            else this.children.push(child);
            return child;
        },
        remove() {
            if (this.parentNode) {
                const index = this.parentNode.children.indexOf(this);
                if (index >= 0) this.parentNode.children.splice(index, 1);
            }
            this.parentNode = null;
            this.isConnected = false;
        },
        get firstChild() { return this.children[0] || null; }
    });
    const playerControls = makeNode('div');
    const progressBar = makeNode('div');
    globalThis.document = {
        createElement: makeNode,
        getElementById: (id) => id === 'ytkit-player-controls' ? playerControls : null,
        querySelector: () => null
    };
    try {
        const feature = createSponsorBlockFeature({
            appState: { settings: { sbCat_sponsor: true } },
            getMainVideoElement: () => ({ duration: 100 }),
            getPlayerProgressBar: () => progressBar,
            t: (_key, fallback) => fallback
        });
        feature._segments = [{ segment: [10, 20], category: 'sponsor', actionType: 'skip' }];

        feature._renderBarSegments();

        assert.equal(progressBar.children.length, 1, 'the segment marker must render');
        assert.equal(playerControls.children.length, 1, 'one attribution label must render beside player data');
        const attribution = playerControls.children[0];
        assert.equal(attribution.textContent, 'SponsorBlock data');
        assert.equal(attribution.href, 'https://sponsor.ajay.app/');
        assert.equal(attribution.target, '_blank');
        assert.equal(attribution.rel, 'noopener noreferrer');
        assert.equal(attribution.dataset.ytkitLicense, 'CC BY-NC-SA 4.0');
        assert.match(attribution.attributes['aria-label'], /CC BY-NC-SA 4\.0/);

        feature._clearBarSegments();
        assert.equal(progressBar.children.length, 0, 'segment markers must be removed together');
        assert.equal(playerControls.children.length, 0, 'attribution must not outlive the data it labels');
    } finally {
        if (originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
    }
});

test('userscript legacy SponsorBlock and DeArrow copies use the validated host resolver', () => {
    const sponsorStart = sources.userscript.lastIndexOf("id: 'sponsorBlock'");
    const sponsorEnd = sources.userscript.indexOf("id: 'deArrow'", sponsorStart);
    assert.ok(sponsorStart > -1 && sponsorEnd > sponsorStart,
        'userscript legacy SponsorBlock block should exist');
    const sponsorBlock = sources.userscript.slice(sponsorStart, sponsorEnd);
    assert.match(sponsorBlock, /getUserscriptSponsorBlockApiOrigins\(\)/,
        'userscript SponsorBlock must resolve the configured allowlisted origins');
    assert.match(sponsorBlock, /\$\{host\}\/api\/skipSegments\//,
        'userscript SponsorBlock must build requests from the resolved host');
    assert.doesNotMatch(sponsorBlock, /https:\/\/sponsor\.ajay\.app\/api\/skipSegments\//,
        'userscript SponsorBlock must not retain a canonical-only endpoint');

    const deArrowStart = sources.userscript.lastIndexOf("id: 'deArrow'");
    const deArrowEnd = sources.userscript.indexOf("id: 'showStatisticsDashboard'", deArrowStart);
    assert.ok(deArrowStart > -1 && deArrowEnd > deArrowStart,
        'userscript legacy DeArrow block should exist');
    const deArrowBlock = sources.userscript.slice(deArrowStart, deArrowEnd);
    assert.match(deArrowBlock, /getUserscriptSponsorBlockApiOrigins\(\)/,
        'userscript DeArrow must use the same host resolver');
    assert.match(deArrowBlock, /status === 404/,
        'userscript DeArrow must treat a 404 as a valid no-branding response');
});

test('SponsorBlock skip detection ignores element visibility', () => {
    // The match condition for "should skip now" reads video.currentTime
    // against segment bounds — it does NOT consult IntersectionObserver,
    // getBoundingClientRect, offsetParent, or any other visibility primitive.
    // This is exactly why the scrolled-away bug never reproduces here.
    const block = sources.ytkit;
    const idx = block.indexOf('_checkSkip()');
    const region = block.slice(idx, idx + 1800);
    assert.equal(/IntersectionObserver|getBoundingClientRect|offsetParent/.test(region), false,
        '_checkSkip must remain viewport-agnostic — never consult IntersectionObserver / ' +
        'getBoundingClientRect / offsetParent. Adding any of those would re-introduce ' +
        'the scrolled-away segment-skip regression that upstream SB v6.1.5 patched.');
});

// ── SponsorBlock Per-Channel Skip Profiles ──

test('SponsorBlock per-channel profiles default settings exist', () => {
    const { defaultSettings } = config;
    assert.strictEqual(defaultSettings.sbPerChannelProfiles, false,
        'sbPerChannelProfiles must default to false');
    assert.deepStrictEqual(defaultSettings.sbPerChannelProfilesData, {},
        'sbPerChannelProfilesData must default to an empty object');
});

test('SponsorBlock _getEnabledCategories checks per-channel overrides when sbPerChannelProfiles is on', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'sponsorBlock');
    assert.match(block, /sbPerChannelProfiles/,
        '_getEnabledCategories must reference sbPerChannelProfiles setting');
    assert.match(block, /sbPerChannelProfilesData/,
        '_getEnabledCategories must read sbPerChannelProfilesData for channel overrides');
    assert.match(block, /profile\.categories\[apiName\]/,
        '_getEnabledCategories must look up per-category overrides from the channel profile');
});

test('sbPerChannelProfiles feature block exists with correct id and category labels', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'sbPerChannelProfiles');
    assert.ok(block.length > 100,
        'sbPerChannelProfiles feature block must contain non-trivial source');
    assert.match(block, /SponsorBlock Per-Channel Profiles/,
        'Feature must have a descriptive name');
    assert.match(block, /_CATEGORY_LABELS/,
        'Feature must carry category labels for the UI');
    assert.match(block, /ytkit-sb-channel-chip/,
        'Feature must render a channel chip on the watch page');
});

test('sbPerChannelProfiles caps storage at 500 entries', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'sbPerChannelProfiles');
    assert.match(block, /500/,
        'Per-channel profiles must enforce a 500-entry cap');
    assert.match(block, /entries\.sort/,
        'Over-cap pruning must sort by updatedAt before evicting');
});

test('sbPerChannelProfiles has reset-to-global-defaults action', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'sbPerChannelProfiles');
    assert.match(block, /Reset to global defaults/,
        'Panel must include a reset action to clear per-channel overrides');
    assert.match(block, /_resetChannel/,
        'Feature must have a _resetChannel method');
});

// ── Anti-detection monitoring (Research Cycle 5) ──

test('SponsorBlock skip timing includes jitter to reduce detection fingerprint', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'sponsorblock', 'index.js'), 'utf8'
    );
    assert.match(src, /Math\.random\(\)/,
        '_scheduleNextSkip must include random jitter in timing');
    assert.match(src, /jitter/,
        'skip delay calculation must reference jitter variable');
});

test('SponsorBlock monitors for YouTube anti-adblock DOM elements', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'sponsorblock', 'index.js'), 'utf8'
    );
    assert.match(src, /_checkAntiAdblock/,
        'feature must define _checkAntiAdblock detection method');
    assert.match(src, /enforcement-message/,
        'anti-adblock detection must target YouTube enforcement-message selectors');
    assert.match(src, /DiagnosticLog\.record\('sb-anti-adblock'/,
        'detection must log to DiagnosticLog with sb-anti-adblock key');
    assert.match(src, /setInterval.*_checkAntiAdblock/,
        'init must schedule periodic anti-adblock checks');
    assert.match(src, /clearInterval.*_antiAdblockTimer/,
        'destroy must clean up the anti-adblock timer');
});

// ── poi_highlight is a POINT marker, not a zero-length segment to discard ──
// The API returns highlights as [t, t]. A strict `end > start` filter dropped
// every one of them before they reached the cache or the progress bar, so the
// "Jump to the highlight" sub-feature only ever widened the API query while
// _checkSkip's comment claimed the marker was rendered on the bar.
test('poi_highlight point markers survive normalization and render with a visible width', () => {
    const { createSponsorBlockFeature } = require('../../extension/features/sponsorblock');
    const feature = createSponsorBlockFeature({});
    const normalized = feature._normalizeSegments([
        { segment: [61.5, 61.5], category: 'poi_highlight', actionType: 'poi', UUID: 'poi-1' },
        { segment: [10, 20], category: 'sponsor', actionType: 'skip', UUID: 'sponsor-1' },
        { segment: [30, 30], category: 'sponsor', actionType: 'skip', UUID: 'bad-zero-length' },
        { segment: [50, 40], category: 'poi_highlight', actionType: 'poi', UUID: 'bad-reversed' },
    ]);

    const categories = normalized.map(s => s.category);
    assert.ok(categories.includes('poi_highlight'), 'the highlight marker must survive');
    assert.ok(categories.includes('sponsor'), 'ordinary segments still survive');
    assert.equal(normalized.length, 2,
        'a zero-length non-POI segment and a reversed POI must still be rejected');

    const poi = normalized.find(s => s.category === 'poi_highlight');
    assert.deepEqual(poi.segment, [61.5, 61.5]);
    assert.equal(feature._isPointSegment(poi), true);
    assert.equal(feature._isPointSegment({ category: 'sponsor', actionType: 'skip' }), false);
});

test('per-channel profiles resolve the same canonical key the chip writes', () => {
    // The chip that WRITES a profile canonicalises the owner href via
    // YTKitCore.channelSettingsKey, but this reader kept the raw href, so a
    // suffixed owner link (/featured, ?si=…) produced a key the stored
    // profile could never match: overrides were silently ignored on playback
    // while the chip still rendered them as active.
    const vm = require('node:vm');
    const fs = require('node:fs');
    const path = require('node:path');
    const { loadFallbackFeature, fakeNode, fakeDocument } = require('../helpers/monolith');

    // Use the REAL canonicaliser the writer uses, not a restatement of it.
    const urlContext = vm.createContext({ globalThis: undefined });
    urlContext.globalThis = urlContext;
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', 'url.js'), 'utf8'),
        urlContext,
        { filename: 'extension/core/url.js' }
    );
    const YTKitCore = urlContext.YTKitCore;
    assert.equal(typeof YTKitCore.channelSettingsKey, 'function',
        'the canonical key helper must load');

    const ownerLink = (href) => fakeNode({ tag: 'a', attributes: { href } });
    const makeFeature = (href) => loadFallbackFeature('sponsorBlock', {
        YTKitCore,
        appState: {
            settings: {
                sbPerChannelProfiles: true,
                sbPerChannelProfilesData: {
                    '/@creator': { categories: { sponsor: false } },
                },
                sbCategorySponsor: true,
            },
        },
        document: fakeDocument((selector) =>
            (selector.includes('/@') ? [ownerLink(href)] : [])),
    });

    // The canonical key for every spelling of the same owner link.
    for (const href of ['/@creator', '/@creator/featured', '/@creator?si=abc']) {
        const feature = makeFeature(href);
        assert.equal(feature._getChannelId(), '/@creator',
            `owner href '${href}' must resolve to the canonical profile key`);
        // …and the override that key selects is actually applied.
        assert.equal(feature._getEnabledCategories().includes('sponsor'), false,
            `owner href '${href}' must apply the stored per-channel override`);
    }

    // The peeled module must resolve identically: it is the copy that runs.
    const moduleSource = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'sponsorblock', 'index.js'), 'utf8');
    const readerStart = moduleSource.indexOf('_getChannelId() {');
    assert.ok(readerStart > -1, 'the module must define _getChannelId');
    const reader = moduleSource.slice(readerStart, moduleSource.indexOf('_getEnabledCategories()', readerStart));
    assert.match(reader, /channelSettingsKey/,
        'the peeled reader must canonicalise through the shared helper too');
    assert.doesNotMatch(reader, /return handleLink\.getAttribute\('href'\)/,
        'the peeled reader must not return a raw handle href');
});
