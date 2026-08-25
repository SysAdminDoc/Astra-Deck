'use strict';

// Original-language thumbnails.
//
// The half-fix this replaces: antiTranslate restored the title while the
// thumbnail beside it still showed localised text, so the card read in two
// languages at once.
//
// The design decision under test is that the original is taken from a
// locale-independent SOURCE (player response, then oEmbed) rather than by
// pattern-matching the localised URL. A URL guess that stops matching looks
// identical to a feature that works, which is the failure mode this project
// has already been bitten by twice.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

function loadThumbnails() {
    globalThis.YTKitCore = {};
    const src = fs.readFileSync(path.join(repoRoot, 'extension/core/youtube-thumbnails.js'), 'utf8');
    // eslint-disable-next-line no-eval
    (0, eval)(src);
    return globalThis.YTKitCore;
}

const VIDEO_ID = 'dQw4w9WgXcQ';

test('a plain thumbnail URL parses into its video identity', () => {
    const core = loadThumbnails();
    const parsed = core.parseThumbnailUrl(`https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`);
    assert.equal(parsed.videoId, VIDEO_ID);
    assert.equal(parsed.quality, 'hqdefault');
    assert.equal(parsed.webp, false);
    assert.equal(parsed.variant, false);
    assert.equal(parsed.custom, false);
});

test('the numbered CDN mirrors and the webp path are recognised', () => {
    const core = loadThumbnails();
    assert.equal(core.parseThumbnailUrl(`https://i9.ytimg.com/vi/${VIDEO_ID}/hq720.jpg`).videoId, VIDEO_ID);
    const webp = core.parseThumbnailUrl(`https://i.ytimg.com/vi_webp/${VIDEO_ID}/maxresdefault.webp`);
    assert.equal(webp.webp, true);
    assert.equal(webp.extension, 'webp');
});

test('anything that is not a YouTube thumbnail is rejected outright', () => {
    const core = loadThumbnails();
    // An <img> whose src we cannot identify must never be swapped.
    assert.equal(core.parseThumbnailUrl('https://evil.example.com/vi/dQw4w9WgXcQ/hqdefault.jpg'), null);
    assert.equal(core.parseThumbnailUrl(`https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.svg`), null);
    assert.equal(core.parseThumbnailUrl('https://i.ytimg.com/vi/short/hqdefault.jpg'), null);
    assert.equal(core.parseThumbnailUrl('javascript:alert(1)'), null);
    assert.equal(core.parseThumbnailUrl(''), null);
    assert.equal(core.parseThumbnailUrl(null), null);
});

test('a signed crop variant canonicalises to the uploader asset', () => {
    const core = loadThumbnails();
    const rendered = `https://i.ytimg.com/vi/${VIDEO_ID}/hq720.jpg?sqp=-oaymwEnCOgCEMoBSFryq4qpAxkIARUAAIhCGAHYAQHiAQoIGBACGAY4AUAB&rs=AOn4CLDsomething`;
    assert.equal(
        core.canonicalThumbnailUrl(rendered),
        `https://i.ytimg.com/vi/${VIDEO_ID}/hq720.jpg`
    );
});

test('an already-canonical URL returns null rather than churning the same value back', () => {
    const core = loadThumbnails();
    assert.equal(core.canonicalThumbnailUrl(`https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`), null);
});

test("an uploader's custom Shorts thumbnail is never stripped back to a video frame", () => {
    const core = loadThumbnails();
    const custom = `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault_custom_1.jpg`;
    const parsed = core.parseThumbnailUrl(custom);
    assert.equal(parsed.custom, true);
    // `_custom_N` IS the uploader's chosen image. Dropping the suffix would
    // fall back to an auto-generated frame - a worse picture than we started
    // with, dressed up as a fix.
    assert.equal(core.canonicalThumbnailUrl(custom), null);
    const customVariant = `${custom}?sqp=abc&rs=def`;
    assert.equal(core.canonicalThumbnailUrl(customVariant), custom,
        'stripping the crop variant must keep the _custom_ suffix intact');
});

test('the player-response ladder yields its widest entry', () => {
    const core = loadThumbnails();
    const playerResponse = {
        videoDetails: {
            thumbnail: {
                thumbnails: [
                    { url: `https://i.ytimg.com/vi/${VIDEO_ID}/default.jpg`, width: 120, height: 90 },
                    { url: `https://i.ytimg.com/vi/${VIDEO_ID}/maxresdefault.jpg`, width: 1280, height: 720 },
                    { url: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`, width: 480, height: 360 }
                ]
            }
        }
    };
    assert.equal(
        core.pickPlayerResponseThumbnail(playerResponse),
        `https://i.ytimg.com/vi/${VIDEO_ID}/maxresdefault.jpg`
    );
    assert.equal(core.pickPlayerResponseThumbnail({}), null);
    assert.equal(core.pickPlayerResponseThumbnail(null), null);
});

test('a player-response entry pointing off-host is skipped, not trusted for its width', () => {
    const core = loadThumbnails();
    const playerResponse = {
        videoDetails: {
            thumbnail: {
                thumbnails: [
                    { url: 'https://evil.example.com/huge.jpg', width: 4000 },
                    { url: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`, width: 480 }
                ]
            }
        }
    };
    assert.equal(
        core.pickPlayerResponseThumbnail(playerResponse),
        `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`
    );
});

test('the oEmbed URL is same-origin youtube.com, so no new host permission is needed', () => {
    const core = loadThumbnails();
    const url = core.buildOEmbedUrl(VIDEO_ID);
    assert.ok(url.startsWith('https://www.youtube.com/oembed?'),
        `expected a youtube.com endpoint, got ${url}`);
    assert.match(url, /format=json/);
    assert.match(url, /dQw4w9WgXcQ/);
    assert.equal(core.buildOEmbedUrl('not-an-id'), null);
    assert.equal(core.buildOEmbedUrl(''), null);
});

test('oEmbed payloads are validated, and a thumbnail pointing off-host is dropped', () => {
    const core = loadThumbnails();
    const good = core.parseOEmbedMetadata(JSON.stringify({
        title: 'Original title',
        author_name: 'Some Channel',
        thumbnail_url: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`
    }));
    assert.equal(good.title, 'Original title');
    assert.equal(good.videoId, VIDEO_ID);

    // Same-origin does not mean trusted: an <img> src must never be pointed
    // somewhere arbitrary because a response said so.
    const hostile = core.parseOEmbedMetadata(JSON.stringify({
        title: 'Original title',
        thumbnail_url: 'https://tracker.example.com/pixel.jpg'
    }));
    assert.equal(hostile.thumbnailUrl, null, 'an off-host thumbnail must be dropped');
    assert.equal(hostile.title, 'Original title', 'the title is still usable');

    assert.equal(core.parseOEmbedMetadata('not json'), null);
    assert.equal(core.parseOEmbedMetadata('{}'), null);
    assert.equal(core.parseOEmbedMetadata(JSON.stringify({ title: 'x'.repeat(20000) })), null,
        'an oversized body is not an oEmbed document');
});

// ── the fallback order the acceptance criterion names ──

test('the player response wins when it is available', () => {
    const core = loadThumbnails();
    const rendered = `https://i.ytimg.com/vi/${VIDEO_ID}/hq720.jpg?sqp=abc&rs=def`;
    const resolved = core.resolveOriginalThumbnail(rendered, {
        playerResponse: {
            videoDetails: { thumbnail: { thumbnails: [{ url: `https://i.ytimg.com/vi/${VIDEO_ID}/maxresdefault.jpg`, width: 1280 }] } }
        },
        oEmbedThumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`
    });
    assert.equal(resolved.source, 'player-response');
    assert.equal(resolved.url, `https://i.ytimg.com/vi/${VIDEO_ID}/maxresdefault.jpg`);
});

test('oEmbed is used on feed cards, where no player response exists', () => {
    const core = loadThumbnails();
    const rendered = `https://i.ytimg.com/vi/${VIDEO_ID}/hq720.jpg?sqp=abc&rs=def`;
    const resolved = core.resolveOriginalThumbnail(rendered, {
        oEmbedThumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`
    });
    assert.equal(resolved.source, 'oembed');
});

test('with no metadata at all it still drops the crop variant, and says which rung it used', () => {
    const core = loadThumbnails();
    const rendered = `https://i.ytimg.com/vi/${VIDEO_ID}/hq720.jpg?sqp=abc&rs=def`;
    const resolved = core.resolveOriginalThumbnail(rendered, {});
    assert.equal(resolved.source, 'canonical-url');
    assert.equal(resolved.url, `https://i.ytimg.com/vi/${VIDEO_ID}/hq720.jpg`);
});

test('a thumbnail that is already the original resolves to nothing', () => {
    const core = loadThumbnails();
    const rendered = `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`;
    assert.equal(core.resolveOriginalThumbnail(rendered, {
        oEmbedThumbnailUrl: rendered
    }), null, 'no swap must happen when there is nothing to swap to');
    assert.equal(core.resolveOriginalThumbnail(rendered, {}), null);
});

// ── the feature contract ──

test('the feature restores what YouTube rendered when the original fails to load', () => {
    const ytkit = fs.readFileSync(path.join(repoRoot, 'extension/ytkit.js'), 'utf8');
    const start = ytkit.indexOf("id: 'antiTranslateThumbnails'");
    assert.ok(start > -1, 'antiTranslateThumbnails must exist');
    const end = ytkit.indexOf("id: 'antiTranslateTranscript'", start);
    const body = ytkit.slice(start, end);

    // A 404 on the "original" must not leave a hole where a card used to be.
    assert.match(body, /addEventListener\('error'/);
    assert.match(body, /\{ once: true \}/);
    assert.match(body, /destroy\(\)/);
    assert.match(body, /img\[data-ytkit-original-thumbnail\]/,
        'destroy must put every swapped image back');
});

test('the oEmbed lookup is credential-free, cached, and bounded', () => {
    const ytkit = fs.readFileSync(path.join(repoRoot, 'extension/ytkit.js'), 'utf8');
    const start = ytkit.indexOf("id: 'antiTranslateThumbnails'");
    const end = ytkit.indexOf("id: 'antiTranslateTranscript'", start);
    const body = ytkit.slice(start, end);

    // This must never become an identified request to YouTube.
    assert.match(body, /credentials: 'omit'/);
    // A feed scroll re-surfaces the same ids constantly; one request per card
    // per tick would be a self-inflicted rate limit.
    assert.match(body, /_oEmbedCache/);
    assert.match(body, /_MAX_IN_FLIGHT/);
    assert.match(body, /_MAX_CACHE/);
    // A failed lookup must be remembered as a miss, or every feed tick retries.
    // Asserted through the OPTIONAL form: this write happens after an await, so
    // it has to survive destroy() having nulled the cache under it. Pinning the
    // bare form here is what kept the extension and the userscript apart on
    // this exact line, and turned the fix red.
    assert.match(body, /this\._oEmbedCache\?\.set\(videoId, null\)/);
    assert.ok(!/this\._oEmbedCache\.set\(/.test(body),
        'a write after an await must tolerate teardown having nulled the cache');
});

test('the feature is opt-in and adds no new install-time host permission', () => {
    const schema = fs.readFileSync(path.join(repoRoot, 'extension/core/settings-schema.js'), 'utf8');
    assert.match(schema, /key: "antiTranslateThumbnails", [^\n]*defaultValue: false/,
        'a feature that issues network lookups must be opt-in');

    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'extension/manifest.json'), 'utf8'));
    const hosts = manifest.host_permissions || [];
    // oEmbed lives on www.youtube.com, which the extension already reaches;
    // that is the whole reason it was chosen over a third-party metadata API.
    assert.ok(
        hosts.some((pattern) => pattern.includes('youtube.com')),
        'youtube.com must already be granted'
    );
    assert.ok(
        !hosts.some((pattern) => pattern.includes('oembed')),
        'oEmbed must not introduce a host pattern of its own'
    );
});

// ── teardown of in-flight lookups ──

// The feature object is a literal inside the monolith's feature array, so it is
// lifted out and evaluated against stubs. Asserting on its SOURCE would only
// prove the words are present; what matters here is whether an abort actually
// reaches the fetch and what the cache remembers afterwards.
function loadAntiTranslateThumbnails(deps) {
    const source = fs.readFileSync(path.join(repoRoot, 'extension/ytkit.js'), 'utf8');
    const start = source.lastIndexOf('{', source.indexOf("id: 'antiTranslateThumbnails'"));
    assert.ok(start > -1, 'antiTranslateThumbnails must exist');

    // Balanced-brace extraction, string- and comment-aware. A fixed window
    // would break the first time the feature grows.
    let depth = 0;
    let index = start;
    let quote = '';
    let inLine = false;
    let inBlock = false;
    for (; index < source.length; index += 1) {
        const ch = source[index];
        const next = source[index + 1];
        if (inLine) { if (ch === '\n') inLine = false; continue; }
        if (inBlock) { if (ch === '*' && next === '/') { inBlock = false; index += 1; } continue; }
        if (quote) {
            if (ch === '\\') { index += 1; continue; }
            if (ch === quote) quote = '';
            continue;
        }
        if (ch === '/' && next === '/') { inLine = true; index += 1; continue; }
        if (ch === '/' && next === '*') { inBlock = true; index += 1; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
        if (ch === '{') depth += 1;
        else if (ch === '}') { depth -= 1; if (depth === 0) break; }
    }
    const literal = source.slice(start, index + 1);
    assert.ok(literal.includes('_lookupOEmbed'), 'the extraction must have caught the lookup');

    const names = Object.keys(deps);
    // eslint-disable-next-line no-new-func
    const make = new Function(...names, 'return (' + literal + ');');
    return make(...names.map((name) => deps[name]));
}

// init() arms the feed scheduler on a real timer. These tests are about the
// lookup, and letting that timer fire drags the whole processing path in.
function startFeature(feature) {
    feature.init();
    if (feature._timer) clearTimeout(feature._timer);
    feature._timer = null;
    return feature;
}

function stubDeps(overrides = {}) {
    return {
        parseThumbnailUrl: () => null,
        buildOEmbedUrl: (videoId) => 'https://www.youtube.com/oembed?id=' + videoId,
        parseOEmbedMetadata: () => ({ title: 'x' }),
        resolveOriginalThumbnail: () => null,
        DebugManager: { log() {} },
        addNavigateRule() {},
        removeNavigateRule() {},
        addScopedMutationRule() {},
        removeScopedMutationRule() {},
        PageTypes: {},
        document: { querySelectorAll: () => [] },
        fetch: async () => { throw new Error('unstubbed fetch'); },
        isWatchPagePath: () => false,
        getPlayerResponse: () => null,
        parseOEmbedThumbnailUrl: () => null,
        ...overrides
    };
}

// WHEN the feature is torn down while a thumbnail lookup is outstanding, that
// request SHALL be aborted rather than left running to completion.
test('destroy aborts the oEmbed lookups still in flight', async () => {
    let seenSignal = null;
    const feature = loadAntiTranslateThumbnails(stubDeps({
        fetch: (url, options) => {
            seenSignal = options.signal;
            return new Promise((resolve, reject) => {
                options.signal.addEventListener('abort', () => {
                    const error = new Error('aborted');
                    error.name = 'AbortError';
                    reject(error);
                });
            });
        }
    }));

    startFeature(feature);
    const pending = feature._lookupOEmbed('aaaaaaaaaaa');
    await Promise.resolve();
    assert.ok(seenSignal, 'the lookup must carry a signal at all');
    assert.equal(seenSignal.aborted, false);

    feature.destroy();
    assert.equal(seenSignal.aborted, true, 'destroy must abort the outstanding request');
    assert.equal(await pending, null, 'the aborted lookup resolves to no metadata');
});

// WHEN a lookup is aborted, the videoId SHALL NOT be remembered as a miss.
// Caching an abort would poison the entry for the rest of the page session, so
// toggling the feature off and on would permanently stop restoring that
// thumbnail — a failure caused entirely by the teardown.
test('an aborted lookup is not cached as a miss', async () => {
    let abortNow = null;
    const feature = loadAntiTranslateThumbnails(stubDeps({
        fetch: (url, options) => new Promise((resolve, reject) => {
            abortNow = () => {
                const error = new Error('aborted');
                error.name = 'AbortError';
                reject(error);
            };
            options.signal.addEventListener('abort', abortNow);
        })
    }));

    startFeature(feature);
    const cache = feature._oEmbedCache;
    const pending = feature._lookupOEmbed('bbbbbbbbbbb');
    await Promise.resolve();
    abortNow();
    assert.equal(await pending, null);
    assert.equal(cache.has('bbbbbbbbbbb'), false,
        'an abort says nothing about the video and must not be remembered as a miss');
    assert.equal(feature._inFlight.size, 0, 'the in-flight slot must be released');
});

// WHEN a lookup fails for a real reason, it SHALL still be cached as a miss, or
// every feed tick retries a video whose oEmbed is genuinely unavailable.
test('a real failure is still cached as a miss', async () => {
    const feature = loadAntiTranslateThumbnails(stubDeps({
        fetch: async () => { throw new Error('network down'); }
    }));
    startFeature(feature);
    assert.equal(await feature._lookupOEmbed('ccccccccccc'), null);
    assert.equal(feature._oEmbedCache.get('ccccccccccc'), null);
    assert.ok(feature._oEmbedCache.has('ccccccccccc'),
        'a genuine failure must be remembered so the feed does not retry it every tick');
});

// WHEN a lookup hangs, it SHALL abort on its own rather than running forever.
test('a hung lookup times out without waiting for teardown', async () => {
    const timers = [];
    const feature = loadAntiTranslateThumbnails(stubDeps({
        fetch: (url, options) => new Promise((resolve, reject) => {
            options.signal.addEventListener('abort', () => {
                const error = new Error('aborted');
                error.name = 'AbortError';
                reject(error);
            });
        })
    }));
    startFeature(feature);
    assert.equal(typeof feature._OEMBED_TIMEOUT_MS, 'number');
    assert.ok(feature._OEMBED_TIMEOUT_MS > 0 && feature._OEMBED_TIMEOUT_MS <= 30000,
        'the timeout must be a real bound, not effectively infinite');

    // Drive the real timer rather than trusting the constant.
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return realSetTimeout(() => {}, 0); };
    let pending;
    try {
        pending = feature._lookupOEmbed('ddddddddddd');
        await Promise.resolve();
    } finally {
        globalThis.setTimeout = realSetTimeout;
    }
    const armed = timers.find((entry) => entry.ms === feature._OEMBED_TIMEOUT_MS);
    assert.ok(armed, 'the lookup must arm its own abort timer');
    armed.fn();
    assert.equal(await pending, null);
    assert.equal(feature._oEmbedCache.has('ddddddddddd'), false,
        'a timeout is an abort, so it must not be cached as a miss either');
    feature.destroy();
});

// WHEN the extension fixes a leak in a feature the userscript also ships, the
// userscript's own copy SHALL get the same fix. YTKit.user.js is
// hand-maintained rather than generated from the monolith, so nothing carries
// a change across on its own — its copy of this feature still had both the
// missing abort AND the older post-teardown TypeError the extension had
// already fixed.
test('the hand-maintained userscript aborts its oEmbed lookups too', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'YTKit.user.js'), 'utf8');
    const start = source.indexOf("id: 'antiTranslateThumbnails'");
    assert.ok(start > -1, 'the userscript must still ship this feature');
    const end = source.indexOf("id: 'thumbnailQualityUpgrade'", start);
    assert.ok(end > start, 'the feature must still be followed by its neighbour');
    const body = source.slice(start, end);

    assert.match(body, /signal: controller\.signal/,
        'the lookup must carry an abort signal');
    assert.match(body, /setTimeout\(\(\) => controller\.abort\(\), this\._OEMBED_TIMEOUT_MS\)/,
        'a hung lookup must abort on its own');
    assert.match(body, /this\._oEmbedControllers\?\.forEach\(\(controller\) => controller\.abort\(\)\)/,
        'destroy must abort what is still outstanding');
    assert.match(body, /if \(error\?\.name !== 'AbortError'\)/,
        'an abort must not be cached as a miss');
    // The older teardown fix never reached this copy either: destroy() nulls
    // the cache while lookups are still awaiting, so every touch after an
    // await has to tolerate it being gone.
    //
    // Asserted against BOTH bodies. Checking only the userscript pinned that
    // build's shape and called it parity, and the two drifted on exactly this
    // line: the extension kept a bare .set() on the 404 path, which throws a
    // TypeError into an uncaught promise when a 404 resolves across a destroy.
    const extension = fs.readFileSync(path.join(repoRoot, 'extension/ytkit.js'), 'utf8');
    const extStart = extension.indexOf("id: 'antiTranslateThumbnails'");
    const extEnd = extension.indexOf("id: 'antiTranslateTranscript'", extStart);
    const extensionBody = extension.slice(extStart, extEnd);

    for (const [label, text] of [['userscript', body], ['extension', extensionBody]]) {
        assert.ok(!/this\._oEmbedCache\.set\(/.test(text),
            `${label}: writes after an await must tolerate teardown having nulled the cache`);
        assert.ok(!/this\._inFlight\.delete\(/.test(text),
            `${label}: the in-flight release runs in a finally that can outlive destroy`);
    }
});
