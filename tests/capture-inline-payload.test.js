'use strict';

// The MHTML capture must not silently downgrade a fixture.
//
// Chrome 152 stopped serialising <script> into Page.captureSnapshot. Measured
// 2026-09-05: a fresh watch capture returned 4.4 MB with zero script tags, no
// ytcfg, no ytInitialPlayerResponse and no videoDetails, while the 1.8 MB
// shipped fixture it would have overwritten holds 62, 19, 3 and 3. The capture
// reported success throughout, because the only tokens it checked
// (`ytd-watch-flexy`, `movie_player`) are DOM elements that survive the loss.
//
// Anyone refreshing the stale selector evidence would have thrown the inline
// payload away and been told it worked.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { chooseCaptureData, SURFACE_PROFILES } = require('../scripts/capture-watch-mhtml.js');

const REPO_ROOT = path.join(__dirname, '..');
const buildFallback = (html) => `MHTML-FALLBACK\n${html}`;

test('a snapshot that kept its inline payload is used as-is', () => {
    const chosen = chooseCaptureData({
        snapshot: 'snapshot with ytcfg and ytInitialPlayerResponse inside',
        renderedHtml: 'rendered with ytcfg and ytInitialPlayerResponse inside',
        inlineTokens: ['ytcfg', 'ytInitialPlayerResponse'],
        buildFallback
    });

    assert.equal(chosen.captureMode, 'cdp-mhtml');
    assert.equal(chosen.recovered, false);
    assert.deepEqual(chosen.missing, []);
    assert.match(chosen.data, /^snapshot/);
});

test('a snapshot that lost its scripts is replaced by the rendered DOM', () => {
    const chosen = chooseCaptureData({
        snapshot: '<html>DOM only, no inline anything</html>',
        renderedHtml: '<html><script>var ytcfg={};var ytInitialPlayerResponse={};</script></html>',
        inlineTokens: ['ytcfg', 'ytInitialPlayerResponse'],
        buildFallback
    });

    assert.equal(chosen.captureMode, 'dom-mhtml-recovered');
    assert.equal(chosen.recovered, true);
    assert.deepEqual(chosen.missing, [], 'the recovered fixture carries everything that was asked for');
    assert.deepEqual(chosen.lostFromSnapshot, ['ytcfg', 'ytInitialPlayerResponse'],
        'the run has to be able to say what the snapshot dropped');
    assert.match(chosen.data, /^MHTML-FALLBACK/);
});

test('a partial loss is still a loss and still recovers', () => {
    const chosen = chooseCaptureData({
        snapshot: 'has ytcfg but not the other one',
        renderedHtml: 'has ytcfg and ytInitialPlayerResponse',
        inlineTokens: ['ytcfg', 'ytInitialPlayerResponse'],
        buildFallback
    });

    assert.equal(chosen.recovered, true);
    assert.deepEqual(chosen.lostFromSnapshot, ['ytInitialPlayerResponse']);
});

test('when neither source carries the payload the caller is told, not handed a fixture', () => {
    const chosen = chooseCaptureData({
        snapshot: 'DOM only',
        renderedHtml: 'DOM only',
        inlineTokens: ['ytcfg', 'ytInitialPlayerResponse'],
        buildFallback
    });

    assert.equal(chosen.recovered, false);
    assert.deepEqual(chosen.missing, ['ytcfg', 'ytInitialPlayerResponse'],
        'the missing list is what the error message names');
});

test('a surface that declares no inline tokens is left exactly as it was', () => {
    const chosen = chooseCaptureData({
        snapshot: 'anything at all',
        renderedHtml: 'something else',
        inlineTokens: [],
        buildFallback
    });

    assert.equal(chosen.captureMode, 'cdp-mhtml');
    assert.deepEqual(chosen.missing, []);
    assert.equal(chosen.data, 'anything at all');
});

test('the watch profile names an inline token, so a DOM-only snapshot cannot pass', () => {
    // The watch surface is the one the fixture-refresh path actually uses and
    // the one whose loss was measured. Its DOM tokens (`ytd-watch-flexy`,
    // `movie_player`) all survive a snapshot that dropped every script, so
    // without an inline token there is nothing to notice the loss.
    const watch = SURFACE_PROFILES.watch;
    assert.ok(Array.isArray(watch.inlineTokens) && watch.inlineTokens.length > 0);
    assert.ok(watch.inlineTokens.includes('ytInitialPlayerResponse'),
        'the player response is the payload a watch fixture exists to carry');
});

test('no profile declares an inline token its own capture contradicts', () => {
    // Guards the declaration against the fixture, in the direction that can be
    // checked without a browser: if a capture exists and the profile claims a
    // token, the capture has to have it. No surface is exempt now that the
    // search and embed fixtures have been re-captured through the recovery
    // path; a skip here would hide exactly the degradation this file exists for.
    // Captures are gitignored, so a surface with no local file is simply not
    // asserted rather than failing a clean checkout.
    for (const [name, profile] of Object.entries(SURFACE_PROFILES)) {
        const declared = (profile.inlineTokens || []).length ? profile.inlineTokens : ['ytcfg'];
        if (!fs.existsSync(profile.out)) continue;
        const body = fs.readFileSync(profile.out, 'latin1');
        const missing = declared.filter((token) => !body.includes(token));
        assert.deepEqual(missing, [],
            `the ${name} profile declares ${missing.join(', ')} but its capture does not carry it`);
    }
});

test('a profile that declares no inline token is still checked', () => {
    // The guard used to be skipped whenever inlineTokens was empty, which let
    // the embed and notifications profiles write a script-free snapshot and
    // report success. ytcfg is the floor every YouTube page carries.
    const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'capture-watch-mhtml.js'), 'utf8');
    assert.ok(source.includes("(opts.inlineTokens || []).length ? opts.inlineTokens : ['ytcfg']"),
        'an empty declaration must fall back to a floor, not skip the check');
    assert.ok(!source.includes('if (inlineTokens.length) {'),
        'the check must not be conditional on the profile declaring something');
});

test('the reported capture mode is not overwritten when nothing was swapped', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'capture-watch-mhtml.js'), 'utf8');
    assert.ok(source.includes('if (chosen.recovered) captureMode = chosen.captureMode;'),
        'a dom-mhtml-fallback relabelled as cdp-mhtml claims a capture that never happened');
});

test('the capture refuses rather than writing, when it cannot recover', () => {
    // The wiring, not just the decision: the thrown message has to name the
    // tokens and say why the file was not written.
    const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'capture-watch-mhtml.js'), 'utf8');

    assert.match(source, /chooseCaptureData\(\{/, 'capture() must use the decision function');
    assert.match(source, /if \(chosen\.missing\.length\) \{\s*\n\s*throw new Error\(/,
        'a missing payload must throw before anything is written');
    const throwIndex = source.indexOf('lost its inline payload');
    const writeIndex = source.indexOf('fs.writeFileSync(opts.out');
    assert.ok(throwIndex > 0 && writeIndex > throwIndex,
        'the refusal has to come before the write, or the degraded fixture lands anyway');
});

test('the shipped watch fixture still carries what the profile now demands', () => {
    // A guard against the profile drifting away from the fixture it describes:
    // if this fails, either the fixture was replaced by a degraded capture or
    // the token list names something YouTube stopped emitting.
    const fixture = path.join(REPO_ROOT, 'mhtml', 'WatchPage.mhtml');
    if (!fs.existsSync(fixture)) return; // captures are gitignored; skip on a clean checkout

    const body = fs.readFileSync(fixture, 'latin1');
    for (const token of SURFACE_PROFILES.watch.inlineTokens) {
        assert.ok(body.includes(token), `mhtml/WatchPage.mhtml no longer carries ${token}`);
    }
});
