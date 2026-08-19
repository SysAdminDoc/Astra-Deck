'use strict';

// Second half of the audited small-correctness batch: core storage, IndexedDB
// transaction ordering, the background broadcast list, DeArrow, comment
// language detection, feed layout scope, and the playlist enhancer.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sources } = require('../helpers/source');
const { loadFeature, fakeDocument } = require('../helpers/monolith');

const repoRoot = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');

// ── core/url.js: one canonical channel key ─────────────────────────────
test('channelSettingsKey normalises every owner-link shape to one key', () => {
    delete require.cache[require.resolve('../../extension/core/url.js')];
    require('../../extension/core/url.js');
    const { channelSettingsKey } = globalThis.YTKitCore;

    // The watch-page writer sees suffixed owner hrefs; the feed reader sees
    // bare ones. Both must land on the same key or the override is ignored.
    assert.equal(channelSettingsKey('/@SomeChannel'), '/@SomeChannel');
    assert.equal(channelSettingsKey('/@SomeChannel/featured'), '/@SomeChannel');
    assert.equal(channelSettingsKey('https://www.youtube.com/@SomeChannel?si=x'), '/@SomeChannel');
    assert.equal(channelSettingsKey('/channel/UC123abc'), 'UC123abc');
    assert.equal(channelSettingsKey('/channel/UC123abc/videos'), 'UC123abc');
    assert.equal(channelSettingsKey('/watch?v=abc12345678'), '');
    assert.equal(channelSettingsKey(''), '');
    assert.equal(channelSettingsKey(null), '');
});

test('both DeArrow override sides go through the shared key', () => {
    const module = read('extension', 'features', 'dearrow', 'index.js');
    assert.match(module, /channelSettingsKey\?\.\(href\)/,
        'the feed-card reader must use the shared normaliser');

    const writerStart = sources.ytkit.indexOf("id: 'deArrowChannelOverridesPanel'");
    const writer = sources.ytkit.slice(writerStart, writerStart + 4000);
    assert.match(writer, /channelSettingsKey\?\.\(/,
        'the watch-page writer must use the same normaliser, not the raw href');
    assert.doesNotMatch(writer, /if \(handleLink\) return handleLink\.getAttribute\('href'\) \|\| '';/,
        'storing the raw owner href produced a key no card could match');
});

// ── DeArrow thumbnail timestamp ────────────────────────────────────────
test('DeArrow validates the remote thumbnail timestamp before it reaches a URL', () => {
    // The monolith twin was deleted in v4.72.0; one implementation remains.
    for (const [label, src] of [
        ['module', read('extension', 'features', 'dearrow', 'index.js')]
    ]) {
        assert.match(src, /const stamp = Number\(thumb\?\.timestamp\);/, `${label} must coerce`);
        assert.match(src, /Number\.isFinite\(stamp\) && stamp >= 0/, `${label} must range-check`);
        assert.match(src, /time=\$\{stamp\}/, `${label} must interpolate the validated number`);
        assert.doesNotMatch(src, /time=\$\{thumb\.timestamp\}/,
            `${label} must not interpolate the raw remote value`);
    }
});

// ── comment language detection ─────────────────────────────────────────
test('Cyrillic comments are only classified when a marker distinguishes them', () => {
    const feature = loadFeature('commentFilterManager', { document: fakeDocument(() => []) });

    assert.equal(feature._languageFromScript('это очень хорошо'), 'ru', 'ы/э/ё identify Russian');
    assert.equal(feature._languageFromScript('це справді добре'), 'uk');
    assert.equal(feature._languageFromScript('њихова љубав'), 'sr');

    // Bulgarian: Cyrillic, no ы/э/ё. The old ternary returned 'ru' on BOTH
    // arms, so this was hidden by a Bulgarian-allowlisted filter.
    assert.equal(feature._languageFromScript('това е много добро'), '',
        'undistinguishable Cyrillic must report unknown so the caller fails open');

    // And unknown must in fact fail open.
    const allowlist = new Set(['bg']);
    feature._parseLanguageAllowlist = () => allowlist;
    feature._detectCommentLanguage = () => feature._languageFromScript('това е много добро');
    assert.equal(feature._shouldHideForLanguage({}), false);
});

// ── core/storage.js preload window ─────────────────────────────────────
test('the storage preload does not resurrect a key deleted mid-flight', () => {
    const src = read('extension', 'core', 'storage.js');
    assert.match(src, /const preloadWindowDeletions = new Set\(\);/);
    assert.match(src, /if \(preloadWindowDeletions\.has\(k\)\) continue;/,
        'the skip-if-present merge must also skip keys deleted during the round-trip');
    assert.match(src, /if \(!extensionStateReady\) preloadWindowDeletions\.add\(key\);/,
        'deletions are only interesting while the preload is in flight');
    assert.match(src, /preloadWindowDeletions\.clear\(\);/,
        'the set must not grow for the life of the page');
});

// ── persisted-domains transaction ordering ─────────────────────────────
test('transcript snapshot restore prepares every record before clearing', () => {
    const src = read('extension', 'core', 'persisted-domains.js');
    const start = src.indexOf('async function restoreTranscriptSnapshot');
    assert.ok(start > -1);
    const block = src.slice(start, start + 3000);
    const prepareAt = block.indexOf('prepared = transcriptRows.map');
    const clearAt = block.indexOf('records.clear()');
    assert.ok(prepareAt > -1 && clearAt > prepareAt,
        'a prepare throw after clear() commits the wipe plus a partial restore');
    assert.match(block.slice(prepareAt, clearAt), /tx\.abort\(\);/,
        'a prepare failure must abort the transaction, not fall out of the function');
});

// ── background broadcast list ──────────────────────────────────────────
test('the background broadcast covers every origin the content scripts run on', () => {
    const background = read('extension', 'background.js');
    const manifest = JSON.parse(read('extension', 'manifest.json'));
    assert.match(background, /const tabs = await callExtensionApi\(ext\.tabs, 'query', \{ url: YOUTUBE_TAB_URLS \}\);/);

    const listed = background.slice(background.indexOf('const YOUTUBE_TAB_URLS'));
    for (const host of ['youtube-nocookie.com', 'youtu.be']) {
        assert.ok(listed.includes(host), `${host} runs content scripts and must receive the broadcast`);
    }
    // And the popup's copy must stay identical.
    const popupList = sources.popup.slice(sources.popup.indexOf('const YOUTUBE_TAB_URLS'),
        sources.popup.indexOf('const YOUTUBE_TAB_URLS') + 260);
    for (const host of ['youtube-nocookie.com', 'youtu.be']) {
        assert.ok(popupList.includes(host));
    }
    const matches = manifest.content_scripts.flatMap((entry) => entry.matches || []).join(' ');
    assert.ok(matches.includes('youtube-nocookie.com') && matches.includes('youtu.be'),
        'the manifest is the source of truth for this list');
});

// ── listFeedLayout search scope ────────────────────────────────────────
test('listFeedLayout anchors its search rules on the element search actually renders in', () => {
    delete require.cache[require.resolve('../../extension/features/home-subs-css/index.js')];
    const mod = require('../../extension/features/home-subs-css/index.js');
    const css = mod.buildListFeedLayoutCss();
    assert.ok(css.includes('ytd-search[page-subtype="search"]'),
        'search results render under ytd-search, not ytd-browse');
    assert.ok(!/ytd-browse\[page-subtype="search"\]/.test(css),
        'the ytd-browse anchor made the whole search scope inert');
});

// ── playlist enhancer ──────────────────────────────────────────────────
test('playlist watched-percent rejects a pixel width and survives an unknown order', () => {
    const start = sources.ytkit.indexOf('_getWatchedPercent(item) {');
    const block = sources.ytkit.slice(start, start + 1600);
    assert.match(block, /match\(\/\(\\d\+\(\?:\\\.\\d\+\)\?\)\\s\*%\//,
        'the % sign must be required — "120px" used to read as 100% watched');
    assert.match(block, /aria-valuenow/,
        'the numeric aria attribute is still read directly');

    const orderStart = sources.ytkit.indexOf('_orderedEntries(entries, mode');
    const orderBlock = sources.ytkit.slice(orderStart, orderStart + 1400);
    assert.match(orderBlock, /Number\.isFinite\(known\) \? known : Number\.MAX_SAFE_INTEGER/,
        'an unseen entry must not produce a NaN comparator');
});

// ── return-dislike + video-hider + handle revealer ─────────────────────
test('the dislike pill re-arms while the actions row hydrates', () => {
    const src = read('extension', 'features', 'return-dislike', 'index.js');
    assert.match(src, /const _RENDER_RETRIES = 3;/);
    assert.match(src, /_render\(attempt \+ 1\)/,
        'a cold load renders the actions row after the single 1.5s timer');
});

test('the video-hider mutation buffer stops growing while subs loading is blocked', () => {
    const src = read('extension', 'features', 'video-hider', 'index.js');
    assert.match(src, /if \(!this\._subsLoadState\.loadingBlocked\) \{\s*\n\s*batchBuffer\.push/,
        'processBatch only drains when unblocked, so the push must be gated too');
});

test('the handle revealer bounds its parallel channel-page fetches', () => {
    const start = sources.ytkit.indexOf("id: 'enableHandleRevealer'");
    const block = sources.ytkit.slice(start, start + 9000);
    assert.match(block, /_MAX_INFLIGHT: 3,/);
    assert.match(block, /_drainLookupQueue\(\)/,
        'lookups must queue rather than all firing at once on a long thread');
    assert.match(block, /this\._inflightLookups \+= 1;/);
});

// ── dual captions ──────────────────────────────────────────────────────
test('dual captions gate on a watch route and spend their retry budget', () => {
    const src = read('extension', 'features', 'subtitles', 'index.js');
    const responseStart = src.indexOf('_playerResponse() {');
    assert.match(src.slice(responseStart, responseStart + 700),
        /if \(!String\(getVideoId\?\.\(\) \|\| ''\)\) return null;/,
        'off-route the id-mismatch guard cannot fire, so the stale response was accepted');

    const loadStart = src.indexOf('async _load() {');
    // Bound the slice by the next method signature rather than a fixed
    // character count, so growing _load() cannot silently push the guard out
    // of the window (fixed-length slices break when helpers grow). The mount
    // overlay argument is matched loosely because the invariant under test is
    // the retry-budget increment, not the exact track expression passed.
    const loadEnd = src.indexOf('_resetForNavigation() {', loadStart);
    const load = src.slice(loadStart, loadEnd > loadStart ? loadEnd : loadStart + 2600);
    assert.match(load, /if \(!this\._mountOverlay\([^)]*\) \|\| !this\._attachVideo\(\)\) \{[\s\S]*?this\._retryCount \+= 1;/,
        'mount/attach failures must count against the retry budget');

    assert.match(src, /_activeCaptionLanguage\(\)/,
        '"Auto" must avoid the track already on screen, not the browser locale');
});
