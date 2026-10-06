'use strict';

// ytkit.js and the peeled feature modules run in the ISOLATED world and reach
// shared helpers through globalThis.YTKitCore. A helper that only the MAIN
// world or the background worker loads is undefined there, and every reader
// guards with `typeof fn !== 'function'`, so the miss is silent. Two shipped
// that way: the feed prefilter published an empty blocklist on every
// navigation (normalizeBlockedChannelId lived only in MAIN), and AI Summary
// threw "AI provider policy is unavailable" before every request
// (validateAiProviderEndpoint lived only in the worker).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadFeature } = require('./helpers/monolith');

const extensionRoot = path.join(__dirname, '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'));
const runtimeEntry = manifest.content_scripts.find((entry) => Array.isArray(entry['x-ytkit-runtime-modules']));
const runtimeModules = runtimeEntry['x-ytkit-runtime-modules'];
const read = (file) => fs.readFileSync(path.join(extensionRoot, file), 'utf8');

// Read on purpose only where no isolated module defines it.
const NOT_IN_ISOLATED = Object.freeze({
    // The extension's MAIN-world bridge patches the page; ytkit.js builds the
    // inline twin only when there is no extension context (the userscript).
    createResourceUnlockBridge: 'userscript-only, behind !hasExtensionContext()',
    // isFeatureAllowedByArtifact has never found it, so the page shows and
    // runs GitHub-full-only features the popup hides. Making it work would
    // hide 17 of them, AI Summary and Custom CSS among them, from everyone on
    // the default profile: an owner decision, logged in Roadmap_Blocked.md.
    findSettingEntry: 'dead profile filter, owner decision pending'
});

// A read, not a write: `YTKitCore.x = ...` is how a feature module publishes.
const CORE_READ = /YTKitCore\??\.([A-Za-z_$][\w$]*)(?![\w$])(?!\s*=[^=])/g;
const CORE_WRITE = /YTKitCore\.([A-Za-z_$][\w$]*)\s*=[^=]/g;

function loadCore(...files) {
    const core = {};
    for (const file of files) new Function('globalThis', 'module', read(file))({ YTKitCore: core }, undefined);
    return core;
}

/**
 * What the isolated runtime really puts on YTKitCore: every module before
 * ytkit.js, run in manifest order over a stand-in page that answers anything.
 * A text search for the name was fooled by a module that merely mentions it.
 */
function isolatedCoreKeys() {
    const anything = () => new Proxy(function () {}, {
        get: (_target, key) => (key === Symbol.toPrimitive ? () => '' : key === 'length' ? 0 : anything()),
        apply: () => anything(),
        construct: () => anything()
    });
    const context = {
        console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, structuredClone,
        URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, crypto: globalThis.crypto,
        document: anything(),
        navigator: { userAgent: 'test', language: 'en' },
        location: { href: 'https://www.youtube.com/', hostname: 'www.youtube.com', pathname: '/' }
    };
    context.globalThis = context;
    context.window = context;
    context.self = context;
    vm.createContext(context);
    const failed = [];
    for (const file of runtimeModules.filter((entry) => entry !== 'ytkit.js')) {
        try {
            vm.runInContext(read(file), context, { filename: file });
        } catch (error) {
            failed.push(`${file}: ${error.message}`);
        }
    }
    assert.deepEqual(failed, [], 'a module that fails to load here would silently drop its keys from this check');
    return new Set(Object.keys(context.YTKitCore || {}));
}

test('every YTKitCore helper the isolated runtime reads is loaded into the isolated runtime', () => {
    const readers = runtimeModules.filter((file) => file === 'ytkit.js' || file.startsWith('features/'));
    const wanted = new Map();
    const publishedAtRuntime = new Set();
    for (const file of readers) {
        const source = read(file);
        for (const [, name] of source.matchAll(CORE_READ)) {
            if (!wanted.has(name)) wanted.set(name, new Set());
            wanted.get(name).add(file);
        }
        for (const [, name] of source.matchAll(CORE_WRITE)) publishedAtRuntime.add(name);
    }
    assert.ok(wanted.has('normalizeBlockedChannelId') && wanted.has('validateAiProviderEndpoint'),
        'the scan must see the reads this test was written for');

    const defined = isolatedCoreKeys();
    const missing = [...wanted.keys()]
        .filter((name) => !NOT_IN_ISOLATED[name] && !defined.has(name) && !publishedAtRuntime.has(name))
        .map((name) => `${name} (read by ${[...wanted.get(name)].join(', ')})`);
    assert.deepEqual(missing, [], 'add the defining core module to x-ytkit-runtime-modules before ytkit.js');

    for (const name of Object.keys(NOT_IN_ISOLATED)) {
        assert.ok(wanted.has(name), `${name} is no longer read; drop its exemption`);
        assert.ok(!defined.has(name), `${name} is defined in the tab now; drop its exemption`);
    }
});

test('the two modules load before ytkit.js and are web-accessible to the runtime loader', () => {
    const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources);
    for (const file of ['core/feed-prefilter.js', 'core/credential-vault.js']) {
        const index = runtimeModules.indexOf(file);
        assert.ok(index > -1 && index < runtimeModules.indexOf('ytkit.js'), `${file} must load before ytkit.js`);
        assert.ok(resources.includes(file), `${file} must be importable by runtime-core-loader.mjs`);
    }
});

test('the feed prefilter bridges a normalized blocklist from every stored record shape', () => {
    const feature = loadFeature('feedPrefilter', {
        YTKitCore: loadCore('core/feed-prefilter.js'),
        STORAGE_KEYS: { blockedChannels: 'blockedChannels' },
        StorageManager: {
            get: (key, fallback) => key === 'blockedChannels' ? [
                { channelId: 'UCabcdefghijklmnopqrstuv', name: 'Record' },
                { handle: '@SomeCreator' },
                'https://www.youtube.com/@AnotherOne/videos',
                { name: 'No identity' }
            ] : fallback
        }
    });
    // Lowercased, as the MAIN-world side compares them; a channel URL is cut
    // to its handle, and a record with no identity bridges nothing.
    assert.deepEqual([...feature._collectIds()], ['ucabcdefghijklmnopqrstuv', '@somecreator', '@anotherone']);
});

test('AI Summary resolves its provider endpoint in the content script', () => {
    const feature = loadFeature('aiVideoSummary', {
        YTKitCore: loadCore('core/credential-vault.js'),
        // A provider switch keeps the old provider's default in settings.
        appState: { settings: { aiSummaryProvider: 'anthropic', aiSummaryEndpoint: 'https://api.openai.com/v1/chat/completions' } }
    });
    assert.deepEqual({ ...feature._getProviderEndpoint() },
        { provider: 'anthropic', endpoint: 'https://api.anthropic.com/v1/messages' });
});
