'use strict';

// Regression guards for the deep-pass-3 audit fixes. These use single-line
// source patterns (CRLF-safe) to lock in fixes that are otherwise hard to
// exercise from the monolith.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const ytkit = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
const userscript = fs.readFileSync(path.join(repoRoot, 'YTKit.user.js'), 'utf8');
const popup = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8');

test('SponsorBlock _loadForVideo re-validates the video id after the segment fetch', () => {
    const i = ytkit.indexOf('async _loadForVideo()');
    assert.ok(i > -1, '_loadForVideo must exist');
    const block = ytkit.slice(i, i + 1000);
    assert.ok(
        /getVideoId\(\)\s*!==\s*videoId/.test(block),
        'must bail if the user navigated to a different video before the fetch resolved (stale segments / wrong-timestamp auto-skip)'
    );
});

test('subscriptionGroups tracks + clears its deferred nav timers (no wrong-page lastVisit stamp)', () => {
    assert.ok(/this\._stampTimer\s*=\s*setTimeout/.test(ytkit),
        'the 8s lastVisit stamp must be tracked on a handle');
    assert.ok(/clearTimeout\(this\._stampTimer\)/.test(ytkit),
        'the lastVisit stamp timer must be cleared (re-schedule + destroy) so it cannot stamp the wrong page');
    assert.ok(/clearTimeout\(this\._renderTimer\)/.test(ytkit),
        'the 1200ms render timer must also be tracked/cleared');
});

test('transcript timestamps are hours-aware (no 62:40 for a 1h02m cue)', () => {
    assert.ok(/_fmtTimestamp\(sec\)/.test(ytkit), 'must define the shared _fmtTimestamp helper');
    assert.ok(/h\s*>\s*0\s*\?/.test(ytkit), '_fmtTimestamp must emit an hours field past one hour');
    // The old inline `Math.floor(startSec / 60)` formatting must be gone from the render path.
    assert.ok(!/const mins = Math\.floor\(startSec \/ 60\)/.test(ytkit),
        'the hour-less inline transcript timestamp formatting must be replaced');
});

test('userscript CPU Tamer snapshots originals after guards and gates restore on _patched', () => {
    assert.ok(/_patched:\s*false/.test(userscript), 'userscript CPU Tamer must carry a _patched flag');
    assert.ok(/if \(this\._patched && this\._originals\)/.test(userscript),
        'destroy() must only restore timers when it actually patched them (else it can hang all page timers)');
});

test('popup gates the companion update buttons to the github-full profile', () => {
    assert.ok(/updateCompanionButton\.hidden\s*=\s*!githubFull/.test(popup),
        'Update Companion must be hidden for store-safe users');
    assert.ok(/updateYtdlpButton\.hidden\s*=\s*!githubFull/.test(popup),
        'Update yt-dlp must be hidden for store-safe users');
});

test('popup status banner announces errors assertively', () => {
    assert.ok(/setAttribute\('role',\s*'alert'\)/.test(popup),
        'error status must use role=alert');
    assert.ok(/setAttribute\('aria-live',\s*'assertive'\)/.test(popup),
        'error status must use aria-live=assertive');
});

test('popup removes its storage listener on pagehide', () => {
    assert.ok(/removeListener\(onStorageChanged\)/.test(popup),
        'the onChanged listener must be removed on teardown');
    assert.ok(/addEventListener\('pagehide'/.test(popup),
        'a pagehide teardown must exist');
});
