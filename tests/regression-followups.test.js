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
    const ytkit = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
    const i = ytkit.indexOf("mode === 'duration-asc'");
    assert.ok(i > -1, 'duration-asc branch must exist');
    const block = ytkit.slice(i, i + 1400);
    assert.ok(/\*\s*3600/.test(block),
        'HH:MM:SS must be scored in seconds (hours*3600), not minutes');
    assert.ok(!/\(Number\(m\[3\]\) \|\| 0\) \/ 60/.test(block),
        'must not use the old minutes-mixing formula (m[3]/60)');
});
