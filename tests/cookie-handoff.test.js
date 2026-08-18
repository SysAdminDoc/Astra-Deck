'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const cookieHandoff = require('../extension/core/cookie-handoff');
const fs = require('node:fs');
const path = require('node:path');

function cookie(name, value, overrides = {}) {
    return {
        domain: '.youtube.com',
        name,
        value,
        path: '/',
        secure: true,
        httpOnly: false,
        expirationDate: undefined,
        ...overrides
    };
}

test('cookie handoff contract is versioned and limited to yt-dlp auth evidence', () => {
    assert.equal(cookieHandoff.PROTOCOL_VERSION, 1);
    assert.equal(cookieHandoff.MINIMUM_COMPANION_API, 2);
    assert.equal(cookieHandoff.QUERY_DOMAIN, '.youtube.com');
    assert.deepEqual(cookieHandoff.ALLOWED_DOMAINS, ['.youtube.com', 'youtube.com']);
    assert.deepEqual(cookieHandoff.ALLOWED_COOKIE_NAMES, [
        'LOGIN_INFO',
        'SAPISID',
        '__Secure-1PAPISID',
        '__Secure-3PAPISID'
    ]);
    assert.equal(Object.isFrozen(cookieHandoff.ALLOWED_COOKIE_NAMES), true);
});

test('cookie handoff fails closed unless LOGIN_INFO and a SAPISID variant survive', () => {
    const missingPrimary = cookieHandoff.sanitizeCookieHandoff([
        cookie('SAPISID', 'sid-value')
    ]);
    const missingSid = cookieHandoff.sanitizeCookieHandoff([
        cookie('LOGIN_INFO', 'login-value')
    ]);

    assert.deepEqual(missingPrimary.cookies, []);
    assert.deepEqual(missingSid.cookies, []);
    assert.equal(missingPrimary.diagnostics.acceptedCount, 0);
    assert.ok(missingPrimary.diagnostics.reasons.incompleteSet > 0);
    assert.ok(missingSid.diagnostics.reasons.incompleteSet > 0);
});

test('cookie handoff rejects unknown, malformed, insecure, and oversized credential material', () => {
    const unknown = 'unknown-secret';
    const malformed = 'line-one\nline-two';
    const oversized = 'x'.repeat(cookieHandoff.MAX_COOKIE_VALUE_BYTES + 1);
    const result = cookieHandoff.sanitizeCookieHandoff([
        cookie('LOGIN_INFO', 'login-value'),
        cookie('SAPISID', 'sid-value'),
        cookie('SID', unknown),
        cookie('SAPISID', malformed),
        cookie('SAPISID', oversized),
        cookie('SAPISID', 'path-secret', { path: '/accounts' }),
        cookie('SAPISID', 'domain-secret', { domain: '.google.com' }),
        cookie('SAPISID', 'insecure-secret', { secure: false })
    ]);

    assert.deepEqual(result.cookies.map((entry) => entry.name), ['LOGIN_INFO', 'SAPISID']);
    assert.equal(result.diagnostics.acceptedCount, 2);
    assert.equal(result.diagnostics.droppedCount, 6);
    assert.equal(result.diagnostics.reasons.unknownName, 1);
    assert.equal(result.diagnostics.reasons.invalidValue, 1);
    assert.equal(result.diagnostics.reasons.oversizedValue, 1);
    assert.equal(result.diagnostics.reasons.invalidPath, 1);
    assert.equal(result.diagnostics.reasons.invalidDomain, 1);
    assert.equal(result.diagnostics.reasons.insecure, 1);
    assert.equal(JSON.stringify(result).includes(unknown), false);
});

test('the userscript only hands cookies to a companion that proved its identity', () => {
    // The userscript posted ALL .youtube.com cookies — including the httpOnly
    // SID/SAPISID sign-in cookies — to whichever local server answered /health
    // in a shape it accepted. The legacy {token_required, port} shape proves
    // nothing about who is listening, so any local process on a catalogued
    // port could obtain a full Google session, defeating Chrome's app-bound
    // cookie encryption.
    const src = fs.readFileSync(path.join(__dirname, '..', 'YTKit.user.js'), 'utf8');

    const start = src.indexOf('async function _mediaDLSendDownload');
    assert.ok(start > -1, '_mediaDLSendDownload must exist');
    const fn = src.slice(start, src.indexOf('\n    // Aggressive button injection', start));
    assert.ok(fn.length > 0, 'the download sender must be extractable');

    assert.match(fn, /_lastHealth\?\.service === MediaDLManager\._SERVICE_ID/,
        'cookies require an exact service id, not merely a reachable port');
    assert.match(fn, /if \(!identityProven \|\| !handoff\)/,
        'an unproven companion must skip the handoff entirely');
    assert.ok(
        fn.indexOf('identityProven') < fn.indexOf('GM_cookie.list'),
        'identity must be proven before any cookie is read'
    );
    assert.match(fn, /sanitizeCookieHandoff\(cookies\)/,
        'cookies must pass through the reviewed allowlist contract');
    assert.doesNotMatch(fn, /domain: c\.domain, name: c\.name, value: c\.value/,
        'the raw jar must never be mapped into the payload');

    // The legacy health shape still authorizes ordinary downloads.
    assert.match(src, /return data\.token_required === true && Number\.isInteger\(data\.port\);/,
        'the backward-compatible health shape must still allow plain downloads');
});

test('the userscript ships no third-party download destination', () => {
    // y2mate / savefrom / ssyoutube received the canonical watch URL, existed
    // nowhere under extension/, and skipped the _buildConfiguredWebDownloaderUrl
    // boundary the Cobalt branch goes through.
    const src = fs.readFileSync(path.join(__dirname, '..', 'YTKit.user.js'), 'utf8');
    for (const host of ['y2mate.com', 'savefrom.net', 'ssyoutube.com']) {
        assert.equal(src.includes(host), false,
            `${host} must not appear as a download destination`);
    }
    assert.doesNotMatch(src, /id: 'downloadProvider'/,
        'the provider selector must be gone with its third-party choices');
    assert.match(src, /_getDownloadUrl\(videoUrl\) \{\s*\n\s*const configuredUrl = _buildConfiguredWebDownloaderUrl/,
        'the only web destination must go through the configured-URL boundary');
});
