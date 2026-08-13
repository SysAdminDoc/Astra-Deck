'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const cookieHandoff = require('../extension/core/cookie-handoff');

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
