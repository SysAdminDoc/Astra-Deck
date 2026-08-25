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
const subscriptionGroups = fs.readFileSync(
    path.join(repoRoot, 'extension', 'features', 'subscription-groups', 'index.js'), 'utf8');

test('userscript MediaDLManager probes fallback ports and gates on the Astra identity', () => {
    assert.ok(/_PORT_CANDIDATES:\s*Object\.freeze\(USERSCRIPT_COMPANION_PORT_CATALOGUE\?\.ports/.test(userscript),
        'must consume the shared companion fallback port catalogue');
    assert.ok(/_isAstraDownloaderHealth\(data\)/.test(userscript),
        'must validate the Astra Downloader health identity, not trust any localhost {token}');
    assert.ok(/baseUrl\(\)\s*\{\s*return 'http:\/\/' \+ \(USERSCRIPT_COMPANION_PORT_CATALOGUE/.test(userscript),
        'must expose baseUrl() reflecting the shared host and discovered port');
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
    // Pinned the assignment shape, but what it is asserting is that the counts
    // go through formatCount. The five cards are written through one setter now
    // so the unavailable state can clear itself, and the formatter call moved
    // into that setter's argument list.
    assert.ok(/setStatCards\(\[\s*formatCount\(summary\.keys\)/.test(popup),
        'storage stat counts must use the locale-aware formatter');
});

test('subscriptionGroups duration-asc sort normalizes HH:MM:SS to seconds', () => {
    const i = subscriptionGroups.indexOf("mode === 'duration-asc'");
    assert.ok(i > -1, 'duration-asc branch must exist');
    const block = subscriptionGroups.slice(i, i + 1400);
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

// WHEN the popup first paints, the five storage cards SHALL read a real zero
// rather than a placeholder glyph; and WHEN extension storage is unavailable,
// they SHALL say so in localized copy alongside the existing recovery message,
// never a bare dash.
test('the popup storage cards seed at zero and name the failure', () => {
    const popupHtml = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.html'), 'utf8');
    const popupJs = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8');
    const messages = JSON.parse(fs.readFileSync(
        path.join(repoRoot, 'extension', '_locales', 'en', 'messages.json'), 'utf8'));

    const IDS = ['stat-keys', 'stat-size', 'stat-hidden-videos', 'stat-blocked-channels', 'stat-bookmarks'];
    for (const id of IDS) {
        const match = popupHtml.match(new RegExp('id="' + id + '">([^<]*)<'));
        assert.ok(match, `${id} must still be in the markup`);
        assert.notEqual(match[1].trim(), '—',
            `${id} seeds a placeholder glyph, which is the first thing a user sees`);
        assert.match(match[1].trim(), /^0( B)?$/, `${id} must seed a real zero`);
    }

    // The dash is gone from the failure path entirely.
    const start = popupJs.indexOf('async function renderStorageInfo()');
    assert.ok(start > 0, 'renderStorageInfo must still exist');
    const body = popupJs.slice(start, popupJs.indexOf('\nasync function renderSettingsSyncStatus', start));
    // Only what it writes, not what it says: there is a prose em dash in a
    // comment in here and matching that would make this assertion about
    // punctuation rather than about behaviour.
    assert.ok(!/textContent\s*=\s*[^;]*'—'/.test(body),
        'the storage render path must not write an em dash into a stat card');
    assert.ok(!/setStatCards\(\[[^\]]*'—'/.test(body),
        'the storage render path must not seed a stat card with an em dash');

    assert.ok(popupJs.includes("t('spStatUnavailable', 'Unavailable')"),
        'the unavailable state must use the catalog entry that already exists for it');
    assert.ok(messages.spStatUnavailable && messages.spStatUnavailable.message,
        'spStatUnavailable must be present in the EN catalog');

    // The recovery copy is still shown with it, not instead of it.
    assert.match(body, /if \(storageUnavailable\) setStatCardsUnavailable\(\);/);
    assert.match(body, /showStatus\(getStorageUnavailableMessage\(\), 'info', 0\)/);

    // A read that failed for another reason reports zero, not "unavailable".
    assert.match(body, /else setStatCards\(\['0', '0 B', '0', '0', '0'\]\)/);

    // Recovering from the unavailable state has to clear it, or the cards keep
    // the muted styling and the title after the numbers come back.
    const setter = popupJs.slice(popupJs.indexOf('function setStatCards(values)'));
    assert.match(setter.slice(0, 500), /delete element\.dataset\.state/);
    assert.match(setter.slice(0, 500), /element\.removeAttribute\('title'\)/);
});
