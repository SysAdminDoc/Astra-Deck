'use strict';

// `@connect` is the userscript vehicle's outbound-request allowlist. Every
// entry is capability the user grants on install, so an entry with no request
// site behind it is unearned privilege.
//
// The one that matters is `localhost`. extension/background.js refuses to
// allowlist it — Firefox still resolves localhost through DNS, so a hostile
// network or compromised resolver can rebind it to an internal address and
// use the grant to probe the LAN. The companion is always reached by literal
// IP for exactly that reason, and the userscript must not re-open the door
// the extension deliberately closed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'YTKit.user.js'), 'utf8');

function metadataBlock() {
    const start = source.indexOf('// ==UserScript==');
    const end = source.indexOf('// ==/UserScript==');
    assert.ok(start >= 0 && end > start, 'the userscript metadata block must exist');
    return source.slice(start, end);
}

function connectHosts() {
    return Array.from(metadataBlock().matchAll(/^\/\/\s*@connect\s+(\S+)\s*$/gm)).map(m => m[1]);
}

test('localhost is never granted — the extension refuses it for DNS-rebinding reasons', () => {
    assert.ok(!connectHosts().includes('localhost'),
        '@connect localhost re-opens the LAN-probing path background.js explicitly closed');
});

test('the companion is reached by literal IP, and that grant is present', () => {
    assert.ok(connectHosts().includes('127.0.0.1'), 'the companion grant must remain');
});

// The runtime a userscript manager actually loads: the core library, then the
// main artifact.
const runtime = fs.readFileSync(path.join(repoRoot, 'YTKit-core.user.js'), 'utf8')
    + '\n' + source;

/** Every host the bundle names as a request origin or endpoint. */
function requestedHosts() {
    const hosts = new Set();
    for (const m of runtime.matchAll(/https?:\/\/([A-Za-z0-9.-]+|\d+\.\d+\.\d+\.\d+)(?::\d+)?/g)) {
        hosts.add(m[1]);
    }
    return hosts;
}

test('every @connect host has a request site behind it', () => {
    // Checking against a hand-written list of hosts that are NOT governed only
    // catches the three names someone thought of. A grant added for a host the
    // bundle never contacts is unearned privilege the user is asked to approve
    // on install, so ask the bundle instead.
    const hosts = requestedHosts();
    assert.ok(hosts.size >= 10, `expected the bundle to name its endpoints, found ${hosts.size}`);

    const unearned = connectHosts().filter((host) => !hosts.has(host));
    assert.deepEqual(unearned, [],
        'these are granted on install but nothing in the bundle requests them: ' + unearned.join(', '));
});

test('no @connect grant covers a host reached by the manager or by plain fetch', () => {
    // @require/@updateURL/@icon go through the manager, and plain fetch() is
    // governed by CORS. A grant for either is privilege with no request it
    // could ever authorize.
    const notGoverned = ['raw.githubusercontent.com', 'returnyoutubedislikeapi.com', 'localhost'];
    for (const host of connectHosts()) {
        assert.ok(!notGoverned.includes(host),
            `@connect ${host} has no GM_xmlhttpRequest site — it is reached by the manager or by plain fetch()`);
    }
});

test('the metadata block carries only directives, never prose', () => {
    // A userscript manager parses this block. Explanatory comments belong
    // below it, where they cannot be mistaken for a directive.
    const lines = metadataBlock().split(/\r?\n/).filter(line => line.trim());
    for (const line of lines) {
        assert.match(line, /^\/\/\s*(==UserScript==|@\w[\w.-]*\s)/,
            `metadata block carries a non-directive line: ${line}`);
    }
});

test('the localhost refusal is documented where a maintainer will see it', () => {
    const after = source.slice(source.indexOf('// ==/UserScript=='));
    assert.match(after.slice(0, 600), /localhost is deliberately NOT granted/);
});
