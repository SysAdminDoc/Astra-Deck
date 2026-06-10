'use strict';

// Regression tests for the 2026-06 standalone-userscript audit fixes.
// Each test pins an invariant established by a verified audit finding
// so future refactors (or a re-run of sync-userscript.js) can't
// silently regress the fix.
//
// Findings covered:
//  1. YTKit.user.js MediaDL install flow pointed at the deleted
//     Install-YTYT.ps1 (HTTP 404) and offered an `irm <404> | iex`
//     copy-paste command. Ported to the extension's GitHub Releases
//     AstraDownloader.exe flow.
//  2. YTKit.user.js @description claimed SponsorBlock, but the
//     userscript build ships no SponsorBlock implementation (only
//     DeArrow talks to sponsor.ajay.app).
//  3. TranscriptService._method2_InnertubeAPI sent a literal
//     placeholder API key ('REDACTED_GOOGLE_API_KEY') to
//     youtubei/v1/player, guaranteeing a 400; now it fails over.
//  4. MediaDLManager.check() gained the extension's single-flight
//     _checkPromise guard so concurrent health checks don't multiply
//     the 6-port probe storm.
//  5. theater-split.user.js duplicates YTKit's built-in stickyVideo
//     split with zero mutual exclusion — it now stands down when
//     YTKit is detected.
//  6. YT_Reaction_Spammer.user.js had no @updateURL/@downloadURL
//     (installs could never update), a @namespace pointing at a
//     nonexistent repo, and no guard against YTKit's integrated
//     reaction spammer UI.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

const userscriptSource = fs.readFileSync(
    path.join(REPO_ROOT, 'YTKit.user.js'),
    'utf8'
);

const theaterSplitSource = fs.readFileSync(
    path.join(REPO_ROOT, 'theater-split.user.js'),
    'utf8'
);

const reactionSpammerSource = fs.readFileSync(
    path.join(REPO_ROOT, 'YT_Reaction_Spammer.user.js'),
    'utf8'
);

// ── 1. MediaDL install flow: release EXE, not the deleted .ps1 ──

test('YTKit.user.js carries no reference to the deleted Install-YTYT installer script', () => {
    assert.doesNotMatch(userscriptSource, /Install-YTYT/,
        'YTKit.user.js must not reference Install-YTYT.ps1/.bat — the installer script was deleted (raw URL is HTTP 404)');
});

test('YTKit.user.js carries no irm|iex copy-paste install command', () => {
    assert.doesNotMatch(userscriptSource, /\birm\b[^\n]*\|\s*iex/,
        'YTKit.user.js must not offer an `irm <url> | iex` command — piping a remote script to iex is a broken (404) and unsafe install path');
    assert.doesNotMatch(userscriptSource, /INSTALLER_COMMAND/,
        'YTKit.user.js must not define INSTALLER_COMMAND — the install flow is download-the-release-exe, not copy-paste-to-PowerShell');
});

test('YTKit.user.js MediaDL install flow points at the GitHub Releases AstraDownloader.exe', () => {
    assert.match(userscriptSource,
        /INSTALLER_URL:\s*'https:\/\/github\.com\/SysAdminDoc\/Astra-Deck\/releases\/latest\/download\/AstraDownloader\.exe'/,
        'INSTALLER_URL must point at the GitHub Releases latest AstraDownloader.exe (parity with extension/ytkit.js)');
    assert.match(userscriptSource, /INSTALLER_FILE_NAME:\s*'AstraDownloader\.exe'/,
        'INSTALLER_FILE_NAME must name the release exe');
    assert.match(userscriptSource, /Download Astra Downloader \(\.exe\)/,
        'install prompt must offer a "Download Astra Downloader (.exe)" action');
    assert.match(userscriptSource, /open the file to install/,
        'install prompt copy must direct the user to open the downloaded exe');
});

// ── 2. @description must not claim features the userscript does not ship ──

test('YTKit.user.js @description does not claim SponsorBlock', () => {
    const descMatch = userscriptSource.match(/^\/\/ @description\s+(.+)$/m);
    assert.ok(descMatch, 'YTKit.user.js must declare @description');
    assert.doesNotMatch(descMatch[1], /sponsorblock/i,
        'the userscript build has no SponsorBlock implementation (only DeArrow uses sponsor.ajay.app) — the description must not claim it');
});

// ── 3. Innertube transcript method: no placeholder API key ──

test('YTKit.user.js never sends a placeholder Innertube API key', () => {
    assert.doesNotMatch(userscriptSource, /REDACTED_GOOGLE_API_KEY/,
        'the poison literal guaranteed a 400 from youtubei/v1/player');
    // When no page-derived key is available, the method must bail so
    // _getCaptionTracks fails over to the next transcript method —
    // same contract as extension/core/transcript-service.js.
    assert.match(userscriptSource,
        /const apiKey = this\._getInnertubeApiKey\(\);\s*\n\s*if \(!apiKey\) \{[\s\S]{0,400}?throw new Error\('Innertube API key unavailable'\)/,
        '_method2_InnertubeAPI must throw (fail over) when no page-derived API key exists instead of sending a placeholder');
});

// ── 4. MediaDLManager.check() single-flight guard ──

test('YTKit.user.js MediaDLManager.check() shares one in-flight probe sweep across concurrent callers', () => {
    const start = userscriptSource.indexOf('const MediaDLManager = {');
    assert.ok(start > -1, 'MediaDLManager must exist in YTKit.user.js');
    const block = userscriptSource.slice(start, start + 6000);

    assert.match(block, /_checkPromise:\s*null/,
        'MediaDLManager must declare the _checkPromise single-flight slot (parity with extension/ytkit.js)');
    assert.match(block, /if \(this\._checkPromise\) return this\._checkPromise;/,
        'check() must return the in-flight promise to concurrent callers');
    assert.match(block,
        /this\._checkPromise = this\._checkImpl\(force\)\.finally\(\(\) => \{ this\._checkPromise = null; \}\);/,
        'check() must clear the single-flight slot when the probe sweep settles');
    assert.match(block, /async _checkImpl\(force\)/,
        'the port-probe sweep must live in _checkImpl so check() can wrap it');
});

// ── 5. theater-split stands down when YTKit is present ──

test('theater-split.user.js carries project-owned @updateURL/@downloadURL', () => {
    assert.match(theaterSplitSource,
        /\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/SysAdminDoc\/Astra-Deck\/main\/theater-split\.user\.js/,
        'theater-split must declare a SysAdminDoc/Astra-Deck @updateURL');
    assert.match(theaterSplitSource,
        /\/\/ @downloadURL\s+https:\/\/raw\.githubusercontent\.com\/SysAdminDoc\/Astra-Deck\/main\/theater-split\.user\.js/,
        'theater-split must declare a SysAdminDoc/Astra-Deck @downloadURL');
});

test('theater-split.user.js detects YTKit and refuses to initialize alongside it', () => {
    // Boot-time check + defensive class-attribute watch: YTKit's
    // stickyVideo split marks <html> with ytkit-split-active /
    // ytkit-split-open and mounts #ytkit-split-wrapper.
    assert.match(theaterSplitSource, /function ytkitPresent\(\)/,
        'theater-split must define the ytkitPresent() detector');
    assert.match(theaterSplitSource, /classList\.contains\('ytkit-split-active'\)/,
        'detector must check the html.ytkit-split-active marker');
    assert.match(theaterSplitSource, /classList\.contains\('ytkit-split-open'\)/,
        'detector must check the html.ytkit-split-open marker');
    assert.match(theaterSplitSource, /getElementById\('ytkit-split-wrapper'\)/,
        'detector must check for YTKit\'s mounted split wrapper');

    assert.match(theaterSplitSource, /function disableForYtkit\(\)/,
        'theater-split must define the stand-down path');
    assert.match(theaterSplitSource, /console\.info\('\[Theater Split\] YTKit detected/,
        'stand-down must log a single console.info explaining why the script is inert');

    // init() must early-exit when YTKit is already detectable, and arm
    // the defensive observer otherwise.
    const initStart = theaterSplitSource.indexOf('function init()');
    assert.ok(initStart > -1, 'init() must exist');
    const initBody = theaterSplitSource.slice(initStart, initStart + 600);
    assert.match(initBody, /if \(ytkitPresent\(\)\) \{\s*\n\s*disableForYtkit\(\);\s*\n\s*return;/,
        'init() must stand down before wiring any listeners when YTKit is present');
    assert.match(initBody, /watchForYtkit\(\);/,
        'init() must arm the defensive MutationObserver for late YTKit activation');

    // activate() must also re-check, since both scripts race at document-start.
    assert.match(theaterSplitSource, /if \(isActive \|\| ytkitConflictDisabled\) return;/,
        'activate() must respect the conflict-disabled flag');
});

test('theater-split.user.js defensively watches for html.ytkit-split-active appearing late', () => {
    assert.match(theaterSplitSource, /function watchForYtkit\(\)/,
        'watchForYtkit() must exist');
    assert.match(theaterSplitSource,
        /ytkitMarkerObserver\.observe\(document\.documentElement,\s*\{ attributes:\s*true,\s*attributeFilter:\s*\['class'\] \}\)/,
        'the observer must watch the <html> class attribute for ytkit-split-* markers');
});

// ── 6. reaction spammer: updatable install + YTKit conflict guard ──

test('YT_Reaction_Spammer.user.js carries project-owned metadata (namespace + update/download URLs)', () => {
    assert.match(reactionSpammerSource,
        /\/\/ @namespace\s+https:\/\/github\.com\/SysAdminDoc\/Astra-Deck/,
        '@namespace must point at the repo that actually hosts the script');
    assert.doesNotMatch(reactionSpammerSource,
        /^\/\/ @namespace\s+https:\/\/github\.com\/SysAdminDoc\/yt-reaction-spammer$/m,
        '@namespace must not point at the nonexistent yt-reaction-spammer repo');
    assert.match(reactionSpammerSource,
        /\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/SysAdminDoc\/Astra-Deck\/main\/YT_Reaction_Spammer\.user\.js/,
        '@updateURL must point at the raw script so installs can update');
    assert.match(reactionSpammerSource,
        /\/\/ @downloadURL\s+https:\/\/raw\.githubusercontent\.com\/SysAdminDoc\/Astra-Deck\/main\/YT_Reaction_Spammer\.user\.js/,
        '@downloadURL must point at the raw script so installs can update');
});

test('YT_Reaction_Spammer.user.js stands down when YTKit\'s integrated reaction spammer UI is mounted', () => {
    // The extension's reactionSpammer feature mounts
    // #ytkit-reaction-spammer-launcher / #ytkit-reaction-spammer-panel
    // into the same live-chat frame (see extension/ytkit.js).
    assert.match(reactionSpammerSource,
        /getElementById\('ytkit-reaction-spammer-launcher'\)/,
        'detector must check for YTKit\'s launcher button');
    assert.match(reactionSpammerSource,
        /getElementById\('ytkit-reaction-spammer-panel'\)/,
        'detector must check for YTKit\'s panel');
    assert.match(reactionSpammerSource, /const disableForYtkit = \(\) => \{/,
        'stand-down path must exist');
    assert.match(reactionSpammerSource,
        /console\.info\('\[YT Reaction Spammer\] YTKit integrated reaction spammer detected/,
        'stand-down must log a single console.info');
    assert.match(reactionSpammerSource,
        /if \(ytkitSpammerPresent\(\)\) \{ disableForYtkit\(\); return; \}/,
        'ready() must bail before building the panel when YTKit\'s UI is mounted');
    assert.match(reactionSpammerSource,
        /if \(ytkitConflictDisabled \|\| ytkitSpammerPresent\(\)\) \{/,
        'the MutationObserver must defensively stand down if YTKit\'s UI mounts late');
});
