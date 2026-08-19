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

test('every @connect host has a real GM request site behind it', () => {
    // Hosts reached through the manager itself (@require/@updateURL/@icon) or
    // through plain CORS-governed fetch() are NOT @connect-governed and must
    // not appear in the list.
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
