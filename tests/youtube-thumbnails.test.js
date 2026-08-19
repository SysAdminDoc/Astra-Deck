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
    assert.match(body, /this\._oEmbedCache\.set\(videoId, null\)/);
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
