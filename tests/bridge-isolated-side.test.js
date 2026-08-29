'use strict';

// The isolated half of the channel: the token bootstrap that runs at
// document_start, and the two helpers in ytkit.js that every bridge write goes
// through.
//
// Both are small and both are load-bearing. A bootstrap that mints nothing
// leaves the bridge with no token, and a helper that writes the attribute but
// forgets to seal leaves the bridge reading a value that never changes — in
// both cases the features quietly stop working and no attribute looks wrong.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { bridgeChannel } = require('../extension/core/bridge-channel.js');

const repoRoot = path.join(__dirname, '..');
const channelSource = fs.readFileSync(
    path.join(repoRoot, 'extension', 'core', 'bridge-channel.js'), 'utf8');
const tokenSource = fs.readFileSync(
    path.join(repoRoot, 'extension', 'core', 'bridge-token.js'), 'utf8');
const ytkitSource = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');

/** A `<html>` stand-in. */
function fakeRoot() {
    const attrs = new Map();
    return {
        attrs,
        getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
        setAttribute: (name, value) => { attrs.set(name, String(value)); },
        removeAttribute: (name) => { attrs.delete(name); },
    };
}

/** The isolated world at document_start: channel, then token bootstrap. */
function isolatedWorld({ crypto: cryptoRef } = {}) {
    const documentElement = fakeRoot();
    const context = {
        console, JSON, Object, Array, String, Number, Math, Set, Map, Uint8Array, isFinite,
        document: { documentElement },
        crypto: cryptoRef === undefined ? require('node:crypto').webcrypto : cryptoRef,
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(channelSource, context, { filename: 'extension/core/bridge-channel.js' });
    vm.runInContext(tokenSource, context, { filename: 'extension/core/bridge-token.js' });
    return { context, documentElement };
}

test('the bootstrap mints a real token and leaves it where the bridge will find it', () => {
    const { context, documentElement } = isolatedWorld();

    const token = context[bridgeChannel.TOKEN_GLOBAL];
    assert.match(String(token), /^[0-9a-f]{64}$/,
        'a token that is not 256 random bits is a token worth guessing');
    assert.equal(documentElement.getAttribute(bridgeChannel.TOKEN_ATTR), token,
        'the bridge reads it off <html> in the same document_start pass');
});

test('two documents do not share a token', () => {
    const first = isolatedWorld().context[bridgeChannel.TOKEN_GLOBAL];
    const second = isolatedWorld().context[bridgeChannel.TOKEN_GLOBAL];
    assert.notEqual(first, second, 'per page, or one page can seal for another');
});

test('the bootstrap does not rotate a token the bridge may already hold', () => {
    // An extension update can re-evaluate a content script mid-session. Minting
    // a second token then would leave the running bridge unable to read
    // anything the isolated world published afterwards.
    const { context, documentElement } = isolatedWorld();
    const first = context[bridgeChannel.TOKEN_GLOBAL];

    vm.runInContext(tokenSource, context, { filename: 'extension/core/bridge-token.js' });
    assert.equal(context[bridgeChannel.TOKEN_GLOBAL], first, 'still the first token');
    assert.equal(documentElement.getAttribute(bridgeChannel.TOKEN_ATTR), first);
});

test('a host with no WebCrypto still gets a token rather than none', () => {
    const { context } = isolatedWorld({ crypto: null });
    assert.match(String(context[bridgeChannel.TOKEN_GLOBAL]), /^[0-9a-f]{64}$/);
});

// ── the two helpers every bridge write goes through ────────────────────────

/** `publishBridgeAttribute` / `clearBridgeAttribute`, lifted out of ytkit.js. */
function isolatedWriters() {
    const start = ytkitSource.indexOf('function publishBridgeAttribute(name, value) {');
    assert.ok(start > 0, 'ytkit.js must define the publish helper');
    const end = ytkitSource.indexOf('const STORAGE_KEYS', start);
    assert.ok(end > start, 'and the clear helper must sit beside it');
    const body = ytkitSource.slice(start, end);
    assert.match(body, /function clearBridgeAttribute/, 'both helpers must be in the slice');

    const { context, documentElement } = isolatedWorld();
    const built = vm.runInContext(
        `(function () { ${body}\nreturn { publishBridgeAttribute, clearBridgeAttribute }; })()`,
        context,
        { filename: 'extension/ytkit.js (helpers)' }
    );
    return { ...built, context, documentElement };
}

test('a bridge write both sets the attribute and seals a copy', () => {
    const { publishBridgeAttribute, context, documentElement } = isolatedWriters();

    publishBridgeAttribute('data-ytkit-codec', 'av01');

    assert.equal(documentElement.getAttribute('data-ytkit-codec'), 'av01',
        'the attribute is still written; CSS and the isolated world read it');

    const reader = context.YTKitCore.createBridgeReader({
        documentElement,
        token: context[bridgeChannel.TOKEN_GLOBAL],
    });
    assert.equal(reader.sync(), true, 'and a sealed copy has to be there for the bridge');
    assert.equal(reader.get('data-ytkit-codec'), 'av01');
});

test('withdrawing a value withdraws the sealed copy too', () => {
    const { publishBridgeAttribute, clearBridgeAttribute, context, documentElement } = isolatedWriters();
    const reader = context.YTKitCore.createBridgeReader({
        documentElement,
        token: context[bridgeChannel.TOKEN_GLOBAL],
    });

    publishBridgeAttribute('data-ytkit-resource-unlock', 'on');
    reader.sync();
    assert.equal(reader.get('data-ytkit-resource-unlock'), 'on');

    clearBridgeAttribute('data-ytkit-resource-unlock');
    assert.equal(documentElement.getAttribute('data-ytkit-resource-unlock'), null,
        'the attribute goes');
    assert.equal(reader.sync(), true, 'and the withdrawal is published');
    assert.equal(reader.get('data-ytkit-resource-unlock'), null,
        'a feature switched off must not keep running off the last sealed value');
});

test('the helpers still write the attribute when there is no channel at all', () => {
    // A userscript host, or a load order that lost the module. The bridge is
    // not there to read anything, but CSS still keys off some of these.
    const documentElement = fakeRoot();
    const context = {
        console, JSON, Object, Array, String, Number, Math,
        document: { documentElement },
    };
    context.globalThis = context;
    vm.createContext(context);

    const start = ytkitSource.indexOf('function publishBridgeAttribute(name, value) {');
    const end = ytkitSource.indexOf('const STORAGE_KEYS', start);
    const built = vm.runInContext(
        `(function () { ${ytkitSource.slice(start, end)}\nreturn { publishBridgeAttribute, clearBridgeAttribute }; })()`,
        context
    );

    assert.doesNotThrow(() => built.publishBridgeAttribute('data-ytkit-audio-only', '1'));
    assert.equal(documentElement.getAttribute('data-ytkit-audio-only'), '1');
    assert.doesNotThrow(() => built.clearBridgeAttribute('data-ytkit-audio-only'));
    assert.equal(documentElement.getAttribute('data-ytkit-audio-only'), null);
});

// ── the isolated world announcing a navigation ─────────────────────────────

const navigationSource = fs.readFileSync(
    path.join(repoRoot, 'extension', 'core', 'navigation.js'), 'utf8');

/** `runNavigateRules`, lifted out of core/navigation.js with its collaborators. */
function navigateRunner({ href = 'https://www.youtube.com/watch?v=one' } = {}) {
    const at = navigationSource.indexOf('    function runNavigateRules() {');
    assert.ok(at > 0, 'core/navigation.js must define runNavigateRules');
    const close = navigationSource.indexOf('\n    }\n', at);
    assert.ok(close > at);
    const body = navigationSource.slice(at + 4, close + 6);

    const announced = [];
    const scope = {
        location: { href },
        lastNavHref: null,
        pendingMutationRouteReset: false,
        core: {
            notifyBridgeNavigate: (reason) => { announced.push(reason); return true; },
            resetHideAttribution: () => {},
        },
        resetMutationRuleHealthForRoute: () => {},
        _executeNavigateRules: () => {},
        window: { matchMedia: () => ({ matches: true }) },
        document: {},
    };

    const run = new Function(
        'location', 'core', 'resetMutationRuleHealthForRoute', '_executeNavigateRules', 'window', 'document',
        `let lastNavHref = null; let pendingMutationRouteReset = false;
         ${body}
         return function (nextHref) { location.href = nextHref; return runNavigateRules(); };`
    )(scope.location, scope.core, scope.resetMutationRuleHealthForRoute,
        scope._executeNavigateRules, scope.window, scope.document);

    return { run, announced };
}

test('every navigation is announced to the bridge, and says which kind it was', () => {
    // The bridge stopped listening to YouTube's own navigate events, so this
    // call is the only thing that tells it the page moved. Without it the
    // quality reset, the buffer re-apply, the codec re-check and the audio
    // graph reconnect all stop happening, and nothing looks broken until a
    // user notices a setting no longer applies after the first video.
    const { run, announced } = navigateRunner();

    run('https://www.youtube.com/watch?v=two');
    assert.deepEqual(announced, ['navigate'], 'a real URL change is a navigation');

    // Same URL: YouTube fires this as the feed appends during infinite scroll.
    run('https://www.youtube.com/watch?v=two');
    assert.deepEqual(announced, ['navigate', 'page-data'],
        'and a same-URL update is the lighter signal, not silence');
});

test('no bridge attribute is written straight onto the document anywhere', () => {
    // Exhaustive by nature, and it has already failed once: the sweep that
    // routed 54 writes through the channel was single-line, so a call
    // written across two lines kept writing the raw attribute. A write that
    // skips the seal is a value the bridge never sees change.
    const raw = [...ytkitSource.matchAll(
        /document\.documentElement\.(?:set|remove)Attribute\(\s*\n?\s*'(data-ytkit-[a-z0-9-]+)'/g)]
        .map((match) => match[1]);
    assert.deepEqual(raw, [],
        'these bypass the sealed channel: ' + raw.join(', '));

    // And the helpers really are the only door, so the count is worth having.
    const published = (ytkitSource.match(/publishBridgeAttribute\('data-ytkit-/g) || []).length;
    const cleared = (ytkitSource.match(/clearBridgeAttribute\('data-ytkit-/g) || []).length;
    assert.ok(published + cleared >= 50,
        `expected the bridge writes to go through the helpers, saw ${published + cleared}`);
});
