'use strict';

// The repo's own invariant, from the v4.53.0 note: any state keyed to a DOM
// node must re-evaluate per pass or track the element it was bound to.
//
// YouTube recycles nodes aggressively. ytd-watch-metadata survives every SPA
// navigation, feed cards are reused by continuations, and live chat reuses a
// small pool of renderers for the whole stream. Four features stamped a
// "judged" marker and never looked again, so the first verdict froze onto
// every later occupant: bot messages inherited an innocent pass, innocent
// messages inherited display:none, an ex-Shorts card stayed invisible as a
// regular video, and the precise view count went inert after one navigation.
//
// hideWatchedVideos was already fixed for exactly this class. These are the
// remaining four.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const ytkit = fs.readFileSync(path.join(repoRoot, 'extension/ytkit.js'), 'utf8');
const userscript = fs.readFileSync(path.join(repoRoot, 'YTKit.user.js'), 'utf8');
const subsModule = fs.readFileSync(
    path.join(repoRoot, 'extension/features/subscription-groups/index.js'), 'utf8');

function stripComments(text) {
    return text.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
}

function slice(source, anchor, length) {
    const at = source.indexOf(anchor);
    assert.ok(at > 0, `anchor not found: ${anchor}`);
    return stripComments(source.slice(at, at + length));
}

// A fixed-length window that runs past the end of the function it anchors on
// is a vacuous test: the assertion can be satisfied by the NEXT function. The
// two live-chat filters sit next to each other and call the same helper, so
// they have to be sliced to their own closing brace.
function topLevelFunction(source, name) {
    const at = source.indexOf(`function ${name}() {`);
    assert.ok(at > 0, `function not found: ${name}`);
    const end = source.indexOf('\n    }\n', at);
    assert.ok(end > at, `unterminated function: ${name}`);
    return stripComments(source.slice(at, end));
}

// ── (a) preciseViewCounts ───────────────────────────────────────────────────

test('the precise-view navigate rule clears the markers off the recycled metadata element', () => {
    const rule = slice(ytkit, "addNavigateRule('preciseViews', () => {", 1200);
    assert.match(rule, /querySelectorAll\('\[data-ytkit-precise\]'\)/,
        'ytd-watch-metadata is reused, so the markers survive onto the next video');
    assert.match(rule, /delete el\.dataset\.ytkitPrecise;/);
    assert.match(rule, /delete el\.dataset\.ytkitPreciseOriginal;/,
        'leaving the saved original behind makes destroy() write video A’s text onto video B');
    assert.doesNotMatch(rule, /el\.textContent = /,
        'the saved text belongs to the previous video; YouTube re-renders this element itself');
});

test('the precise-view teardown still restores the text it replaced', () => {
    const destroy = slice(ytkit, "removeNavigateRule('preciseViews');", 900);
    assert.match(destroy, /el\.textContent = el\.dataset\.ytkitPreciseOriginal;/,
        'with the navigate fix the stored original always belongs to the video on screen');
});

// ── (b) live chat ───────────────────────────────────────────────────────────

test('live-chat verdicts are keyed to the message they were about', () => {
    const fingerprint = slice(ytkit, 'function liveChatMessageFingerprint(msg) {', 600);
    assert.match(fingerprint, /#author-name/);
    assert.match(fingerprint, /#message/,
        'author alone is not enough: the same author posts many messages through one recycled node');

    for (const name of ['applyBotFilter', 'applyKeywordFilter']) {
        const body = topLevelFunction(ytkit, name);
        assert.doesNotMatch(body, /:not\(\[data-ytkit-(?:bot|kw)-checked\]\)/,
            `${name} must stop skipping nodes it has ever judged`);
        assert.match(body, /liveChatMessageFingerprint\(/,
            `${name} must re-judge a node whose content changed`);
        assert.match(body, /=== fingerprint\) return;/,
            `${name} must compare against the stored fingerprint, not merely record one`);
    }
});

test('both live-chat filters un-hide a recycled node whose verdict flipped', () => {
    const bot = topLevelFunction(ytkit, 'applyBotFilter');
    assert.match(bot, /classList\.contains\('yt-suite-hidden-bot'\)[\s\S]{0,200}classList\.remove\('yt-suite-hidden-bot'\)/,
        'without this an innocent message inherits a bot message’s display:none and is swallowed');

    const keyword = topLevelFunction(ytkit, 'applyKeywordFilter');
    const nonEmptyBranch = keyword.slice(keyword.indexOf('const keywords = keywordsRaw'));
    assert.match(nonEmptyBranch, /classList\.remove\('yt-suite-hidden-keyword'\)/,
        'the non-empty-keyword path also needs an un-hide, not only the cleared-keywords path');
});

// ── (c) removeAllShorts ─────────────────────────────────────────────────────

test('a card recycled out of Shorts is made visible again', () => {
    const scan = slice(ytkit, 'const scanPage = () => {', 1600);
    assert.match(scan, /querySelectorAll\('\[data-ytkit-shorts-hidden\]'\)[\s\S]{0,400}querySelector\('a\[href\^="\/shorts"\]'\)/,
        'a hidden card must be re-checked for a Shorts link before it stays hidden');
    const recheck = scan.slice(scan.indexOf('[data-ytkit-shorts-hidden]'));
    assert.match(recheck, /delete el\.dataset\.ytkitShortsHidden/);
    assert.match(recheck, /applyHideAttribution\(el, \{ featureId: this\.id, hidden: false \}\)/,
        'un-hiding without clearing attribution leaves the card counted as hidden');
});

// ── (d) subscription groups ─────────────────────────────────────────────────

test('the original-order stamp names the video it describes, in both copies', () => {
    for (const [label, source] of [['ytkit.js', ytkit], ['subscription-groups module', subsModule]]) {
        const helper = slice(source, '_cardVideoId(card) {', 500);
        assert.match(helper, /\[\?&\]v=\(\[A-Za-z0-9_-\]\{11\}\)/, `${label}: the id must be parsed, not guessed`);

        // Anchored on the unique line: `cards.forEach(card => {` appears in
        // several unrelated blocks in the monolith.
        const stamp = slice(source, 'const videoId = this._cardVideoId(card);', 900);
        assert.match(stamp, /card\.dataset\.ytkitOrigId === videoId/,
            `${label}: a card recycled into a different video must be re-stamped`);
        assert.match(stamp, /card\.dataset\.ytkitOrigId = videoId;/, `${label}: the pairing must be persisted`);

        assert.match(source, /delete el\.dataset\.ytkitOrigIdx; delete el\.dataset\.ytkitOrigId;/,
            `${label}: teardown must clear both halves of the stamp`);
    }
});

// ── Userscript parity ───────────────────────────────────────────────────────

test('all four fixes reached the userscript bundle', () => {
    assert.match(userscript, /querySelectorAll\('\[data-ytkit-precise\]'\)/);
    assert.match(userscript, /function liveChatMessageFingerprint\(msg\)/);
    assert.match(userscript, /querySelectorAll\('\[data-ytkit-shorts-hidden\]'\)/);
    assert.match(userscript, /card\.dataset\.ytkitOrigId = videoId;/);
});
