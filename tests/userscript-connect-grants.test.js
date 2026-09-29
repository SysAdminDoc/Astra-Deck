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
//
// The userscript is generated from extension/ now. Its host runs background.js
// in the page sandbox and backs the worker's cross-origin fetch() with
// GM_xmlhttpRequest, so the worker's reach IS the @connect list: the manifest's
// host permissions, and nothing the extension does not already hold.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sync = require('../sync-userscript.js');
const { config, readUserscriptBuild } = require('./helpers/source');

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

test('@connect is the extension host permissions and nothing more', () => {
    // A grant added by hand would be privilege the extension itself does not
    // hold. Deriving it from the manifest keeps the two vehicles' reach equal.
    assert.deepEqual(connectHosts(), sync.connectHosts(config.manifest),
        '@connect must be generated from the manifest host permissions');

    // The one wildcard stands for the optional `https://*/*` grant a
    // self-hosted AI or Cobalt endpoint asks for at runtime, and managers ask
    // the user before the first request to any host not named here. It must
    // come from that optional permission, never be added on its own.
    const optional = config.manifest.optional_host_permissions || [];
    assert.equal(connectHosts().includes('*'), optional.includes('https://*/*'),
        '@connect * exists exactly when the extension declares the optional https://*/* grant');
    if (connectHosts().includes('*')) {
        assert.equal(connectHosts().at(-1), '*', 'the wildcard follows every named host');
    }
});

/**
 * Every host the worker names as a request origin or endpoint, in code.
 *
 * Read from the extension files the userscript host runs as its background
 * (background.js and what it imports), not from the generated libraries:
 * those are compacted copies of the same files. Comments are dropped first,
 * since a comment that names a host requests nothing.
 */
function workerRequestedHosts() {
    const { modules } = readUserscriptBuild();
    const hosts = new Set();
    for (const file of [modules.background, ...modules.backgroundCore]) {
        const body = sync.stripCommentsByParser(
            fs.readFileSync(path.join(repoRoot, 'extension', file), 'utf8'), `extension/${file}`);
        // Only origins that appear inside a string literal, which is what a
        // request URL is.
        for (const m of body.matchAll(/['"`]https?:\/\/([A-Za-z0-9.-]+|\d+\.\d+\.\d+\.\d+)(?::\d+)?/g)) {
            hosts.add(m[1]);
        }
    }
    return hosts;
}

test('every named @connect host has a request site behind it in the worker', () => {
    // Checking against a hand-written list of hosts that are NOT governed only
    // catches the names someone thought of. A grant for a host the worker
    // never contacts is unearned privilege the user is asked to approve on
    // install, so ask the worker's code instead. @connect example.com also
    // covers its subdomains, which is how *.youtube.com arrives.
    const hosts = [...workerRequestedHosts()];
    assert.ok(hosts.length >= 10, `expected the worker to name its endpoints, found ${hosts.length}`);

    const unearned = connectHosts()
        .filter((host) => host !== '*')
        .filter((host) => !hosts.some((requested) => requested === host || requested.endsWith('.' + host)));
    assert.deepEqual(unearned, [],
        'these are granted on install but nothing in the worker requests them: ' + unearned.join(', '));
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
    assert.match(after.slice(0, 800), /localhost is deliberately not in @connect/i);
});
