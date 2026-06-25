'use strict';

// Regression guards for the post-pass-3 follow-ups (userscript download
// port-fallback + identity check, popup byte/count formatting). Single-line
// source patterns (CRLF-safe).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const userscript = fs.readFileSync(path.join(repoRoot, 'YTKit.user.js'), 'utf8');
const popup = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8');
const ytkit = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');

test('userscript MediaDLManager probes fallback ports and gates on the Astra identity', () => {
    assert.ok(/_PORT_CANDIDATES:\s*Object\.freeze\(\[9751/.test(userscript),
        'must carry the fallback port list (was single-port 9751)');
    assert.ok(/_isAstraDownloaderHealth\(data\)/.test(userscript),
        'must validate the Astra Downloader health identity, not trust any localhost {token}');
    assert.ok(/baseUrl\(\)\s*\{\s*return 'http:\/\/127\.0\.0\.1:' \+ this\._port/.test(userscript),
        'must expose baseUrl() reflecting the discovered port');
    assert.ok(/MediaDLManager\.baseUrl\(\) \+ '\/status\//.test(userscript),
        'status poll must use the discovered port');
    assert.ok(/MediaDLManager\.baseUrl\(\) \+ '\/download'/.test(userscript),
        'download must use the discovered port');
    assert.ok(!/url:\s*'http:\/\/127\.0\.0\.1:9751\//.test(userscript),
        'no hardcoded 9751 endpoint URLs should remain (only @connect metadata)');
});

test('popup formatBytes scales beyond MB and counts are locale-aware', () => {
    assert.ok(/BYTE_UNITS = \['B', 'KB', 'MB', 'GB', 'TB'\]/.test(popup),
        'formatBytes must scale through GB/TB, not cap at MB');
    assert.ok(/function formatCount\(n\)/.test(popup),
        'a locale-aware count formatter must exist');
    assert.ok(/statKeys\.textContent = formatCount\(summary\.keys\)/.test(popup),
        'storage stat counts must use the locale-aware formatter');
});

test('subscriptionGroups duration-asc sort normalizes HH:MM:SS to seconds', () => {
    const i = ytkit.indexOf("mode === 'duration-asc'");
    assert.ok(i > -1, 'duration-asc branch must exist');
    const block = ytkit.slice(i, i + 1400);
    assert.ok(/\*\s*3600/.test(block),
        'HH:MM:SS must be scored in seconds (hours*3600), not minutes');
    assert.ok(!/\(Number\(m\[3\]\) \|\| 0\) \/ 60/.test(block),
        'must not use the old minutes-mixing formula (m[3]/60)');
});

test('zenMode uses a static dim overlay instead of backdrop blur', () => {
    const start = ytkit.indexOf("id: 'zenMode'");
    assert.ok(start > -1, 'zenMode feature must exist');
    const block = ytkit.slice(start, start + 1800);
    assert.match(block, /Dims the page around the video player/,
        'zenMode copy must not promise blur');
    assert.match(block, /box-shadow: inset 0 0 140px/,
        'zenMode should use a static vignette on the overlay');
    assert.doesNotMatch(block, /backdrop-filter\s*:\s*blur/i,
        'content-script Zen Mode must not use live backdrop blur');
});

test('sleepTimer uses an inline popover instead of a browser prompt', () => {
    const start = ytkit.indexOf("id: 'sleepTimer'");
    assert.ok(start > -1, 'sleepTimer feature must exist');
    const block = ytkit.slice(start, start + 9000);
    assert.doesNotMatch(block, /\bprompt\s*\(/,
        'sleepTimer must not block YouTube with a browser prompt');
    assert.match(block, /_showTimerPopover/,
        'sleepTimer must expose an inline timer popover');
    assert.match(block, /setAttribute\('role', 'dialog'\)/,
        'sleepTimer popover must declare dialog semantics');
    assert.match(block, /input\.type = 'number'/,
        'sleepTimer popover must use a bounded numeric input');
    assert.match(block, /Enter a value from 1 to 180 minutes\./,
        'sleepTimer validation must render inline feedback');
    assert.match(block, /focusRing/,
        'sleepTimer popover controls must keep visible keyboard focus');
    assert.match(block, /this\._dismissPopover\(\)/,
        'sleepTimer must clean up the popover when state changes');
});

test('userscript UI surfaces avoid backdrop blur filters', () => {
    assert.doesNotMatch(userscript, /backdrop-filter\s*:\s*blur/i,
        'YTKit.user.js must not ship backdrop blur on injected UI surfaces');
    assert.doesNotMatch(userscript, /-webkit-backdrop-filter\s*:\s*blur/i,
        'YTKit.user.js must not ship prefixed backdrop blur either');
});
