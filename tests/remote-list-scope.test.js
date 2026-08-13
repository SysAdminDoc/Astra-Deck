'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    COBALT_PUBLIC_INSTANCE_HOST,
    REMOTE_LIST_HOST_PATTERN,
    describeCobaltInstanceUrl,
    describeRemoteListUrl,
    isRemoteListUrlAllowed,
    remoteListOriginPattern
} = require('../extension/core/remote-list-scope');
const {
    describeRemoteListOriginPattern
} = require('../extension/core/optional-host-permissions');

// The scope rules for the one destination a user chooses: the Video Hider
// filter-list URL. Everything here is a table because the failure mode is a
// single missed address form, not a broken function.

test('a public HTTPS list URL is admitted and yields a single-host grant pattern', () => {
    const described = describeRemoteListUrl('https://lists.example.com/astra/rules.json?v=2');
    assert.equal(described.ok, true);
    assert.equal(described.url, 'https://lists.example.com/astra/rules.json?v=2');
    assert.equal(described.hostname, 'lists.example.com');
    assert.equal(described.originPattern, 'https://lists.example.com/*');
});

test('a self-hosted Cobalt root is normalized to one exact public HTTPS origin', () => {
    for (const input of [
        'https://cobalt.example.net',
        '  https://cobalt.example.net/  '
    ]) {
        const described = describeCobaltInstanceUrl(input);
        assert.equal(described.ok, true, input);
        assert.equal(described.url, 'https://cobalt.example.net/');
        assert.equal(described.origin, 'https://cobalt.example.net');
        assert.equal(described.originPattern, 'https://cobalt.example.net/*');
    }
});

test('Cobalt rejects the public service and endpoint shapes that could carry authority', () => {
    assert.equal(COBALT_PUBLIC_INSTANCE_HOST, 'api.cobalt.tools');
    const cases = [
        ['https://api.cobalt.tools/', 'public-instance'],
        ['http://cobalt.example.net/', 'not-https'],
        ['https://user:secret@cobalt.example.net/', 'credentials'],
        ['https://cobalt.example.net/?token=secret', 'query'],
        ['https://cobalt.example.net/#fragment', 'fragment'],
        ['https://cobalt.example.net/api/json', 'path'],
        ['https://127.0.0.1/', 'private-network'],
        ['https://cobalt.local/', 'non-public-host'],
        ['https://8.8.8.8/', 'ip-literal']
    ];
    for (const [input, reason] of cases) {
        const described = describeCobaltInstanceUrl(input);
        assert.equal(described.ok, false, input);
        assert.equal(described.reason, reason, input);
    }
});

test('the grant pattern drops the port, because match patterns have no port component', () => {
    // `https://host:8443/*` is not a valid match pattern and permissions.request
    // throws on it. The host pattern covers every port on that host instead.
    const described = describeRemoteListUrl('https://lists.example.com:8443/rules.json');
    assert.equal(described.ok, true);
    assert.equal(described.originPattern, 'https://lists.example.com/*');
    assert.equal(remoteListOriginPattern('lists.example.com'), 'https://lists.example.com/*');
});

test('URL shape rules reject anything that is not a plain anonymous HTTPS GET target', () => {
    const cases = [
        ['', 'empty'],
        ['   ', 'empty'],
        [null, 'empty'],
        [42, 'empty'],
        ['http://lists.example.com/rules.json', 'not-https'],
        ['ftp://lists.example.com/rules.json', 'not-https'],
        ['javascript:alert(1)', 'not-https'],
        ['https://user:pass@lists.example.com/rules.json', 'credentials'],
        ['https://user@lists.example.com/rules.json', 'credentials'],
        ['https://lists.example.com/rules.json#section', 'fragment'],
        ['https://*.example.com/rules.json', 'malformed-host'],
        ['not a url', 'malformed-host'],
        ['https://lists.example.com/' + 'a'.repeat(2100), 'too-long']
    ];
    for (const [input, reason] of cases) {
        const described = describeRemoteListUrl(input);
        assert.equal(described.ok, false, `${String(input).slice(0, 40)} must be rejected`);
        assert.equal(described.reason, reason, `${String(input).slice(0, 40)} reason`);
    }
});

test('permission-pattern parsing accepts one exact public host and rejects broad grants', () => {
    const described = describeRemoteListOriginPattern('https://lists.example.com/*');
    assert.equal(described.ok, true);
    assert.equal(described.hostname, 'lists.example.com');
    for (const pattern of [
        'https://*/*',
        'https://*.example.com/*',
        'https://lists.example.com/path/*',
        'http://lists.example.com/*'
    ]) {
        assert.equal(describeRemoteListOriginPattern(pattern).ok, false,
            `${pattern} must not be treated as an exact removable grant`);
    }
});

test('private, loopback, link-local and reserved addresses are rejected in every spelling', () => {
    // WHATWG URL parsing folds the integer, hex and short-dotted spellings into
    // a dotted quad before this code sees them, so one range check covers them
    // all — but the folding is exactly what makes hand-written checks miss, so
    // pin the spellings.
    const privateUrls = [
        'https://127.0.0.1/rules.json',
        'https://127.1/rules.json',
        'https://2130706433/rules.json',
        'https://0x7f.0.0.1/rules.json',
        'https://10.0.0.5/rules.json',
        'https://172.16.0.1/rules.json',
        'https://172.31.255.254/rules.json',
        'https://192.168.1.1/rules.json',
        'https://169.254.169.254/latest/meta-data',
        'https://100.64.0.1/rules.json',
        'https://0.0.0.0/rules.json',
        'https://192.0.2.1/rules.json',
        'https://198.18.0.1/rules.json',
        'https://203.0.113.5/rules.json',
        'https://224.0.0.1/rules.json',
        'https://255.255.255.255/rules.json',
        'https://[::1]/rules.json',
        'https://[::]/rules.json',
        'https://[fe80::1]/rules.json',
        'https://[fc00::1]/rules.json',
        'https://[ff02::1]/rules.json'
    ];
    for (const url of privateUrls) {
        const described = describeRemoteListUrl(url);
        assert.equal(described.ok, false, `${url} must be rejected`);
        assert.equal(described.reason, 'private-network', `${url} reason`);
    }
});

test('an IPv4-mapped IPv6 loopback is rejected after URL parsing rewrites it to hex', () => {
    // Regression: the first cut of this module matched only a trailing dotted
    // quad, but `new URL` rewrites `[::ffff:127.0.0.1]` to `[::ffff:7f00:1]`,
    // so loopback was classified public and would have been grantable.
    assert.equal(new URL('https://[::ffff:127.0.0.1]/').hostname, '[::ffff:7f00:1]');
    for (const url of [
        'https://[::ffff:127.0.0.1]/rules.json',
        'https://[::ffff:7f00:1]/rules.json',
        'https://[::ffff:192.168.0.1]/rules.json',
        'https://[::ffff:169.254.169.254]/rules.json'
    ]) {
        const described = describeRemoteListUrl(url);
        assert.equal(described.ok, false, `${url} must be rejected`);
        assert.equal(described.reason, 'private-network', `${url} reason`);
    }
});

test('bare address literals are rejected even when globally routable', () => {
    // A published filter list always has a name. Refusing every literal keeps
    // one rule instead of two and removes the alternate-spelling surface from
    // the grant path entirely.
    for (const url of [
        'https://8.8.8.8/rules.json',
        'https://172.32.0.1/rules.json',
        'https://[2606:4700:4700::1111]/rules.json'
    ]) {
        const described = describeRemoteListUrl(url);
        assert.equal(described.ok, false, `${url} must be rejected`);
        assert.equal(described.reason, 'ip-literal', `${url} reason`);
    }
});

test('names that never resolve on the public internet are rejected', () => {
    for (const url of [
        'https://intranet/rules.json',
        'https://fileserver/rules.json',
        'https://nas.local/rules.json',
        'https://build.internal/rules.json',
        'https://router.lan/rules.json',
        'https://printer.home.arpa/rules.json',
        'https://host.localhost/rules.json',
        'https://staging.test/rules.json',
        'https://lists.example.com./rules.json'
    ]) {
        const described = describeRemoteListUrl(url);
        assert.equal(described.ok, false, `${url} must be rejected`);
        assert.ok(['non-public-host', 'malformed-host'].includes(described.reason),
            `${url} reason was ${described.reason}`);
    }
});

test('internationalised public suffixes are still admitted', () => {
    assert.equal(isRemoteListUrlAllowed('https://example.xn--p1ai/rules.json'), true);
    assert.equal(isRemoteListUrlAllowed('https://lists.example.co.uk/rules.json'), true);
});

test('the declared host pattern is the broad one, so a build can be checked for it', () => {
    assert.equal(REMOTE_LIST_HOST_PATTERN, 'https://*/*');
});
