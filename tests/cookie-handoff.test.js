'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const cookieHandoff = require('../extension/core/cookie-handoff');
const { sources, userscriptBundles } = require('./helpers/source');

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

test('the userscript runs the extension handoff, which proves the companion before any cookie is read', () => {
    // The hand-written userscript once posted ALL .youtube.com cookies —
    // including the httpOnly SID/SAPISID sign-in cookies — to whichever local
    // server answered /health in a shape it accepted, and later gated them on
    // the service id that /health reports. Neither proves who is listening, so
    // any local process on a catalogued port could obtain a Google session.
    //
    // That sender is gone. The userscript runs features/download-ui's
    // _mediaDLSendDownload, which reads cookies only after a fresh native-host
    // proof and an endpoint proof, and hands them over only through this
    // contract. Those gates are driven in tests/features/next-monolith-peel.test.js
    // ("downloadUI never requests cookies for a legacy-health token" and
    // "downloadUI uses a fresh native capability ..."), and the contract itself
    // above. A userscript has no native messaging channel, so in practice its
    // downloads go out without cookies rather than to an unproven listener.
    for (const file of ['features/download-ui/index.js', 'core/cookie-handoff.js', 'background.js']) {
        assert.ok(userscriptBundles(file), `the userscript must run the extension's ${file}`);
    }
});

test('the userscript ships no third-party download destination', () => {
    // y2mate / savefrom / ssyoutube received the canonical watch URL and
    // existed nowhere under extension/. Absence is the claim, so every
    // generated file is scanned: the host and the libraries that hold the code.
    for (const host of ['y2mate.com', 'savefrom.net', 'ssyoutube.com']) {
        assert.equal(sources.userscript.includes(host), false,
            `${host} must not appear as a download destination`);
    }
    // The provider selector went with its third-party choices, and the schema
    // keeps its key only on the retired list so an old value is dropped.
    const { SETTINGS_SCHEMA, isRetiredShippedId } = require('../extension/core/settings-schema');
    assert.equal(SETTINGS_SCHEMA.some((entry) => entry.key === 'downloadProvider'), false,
        'downloadProvider must not come back as a live setting');
    assert.equal(isRetiredShippedId('downloadProvider'), true);
    assert.doesNotMatch(sources.ytkit, /id: 'downloadProvider'/,
        'and no settings row may offer it');
});
