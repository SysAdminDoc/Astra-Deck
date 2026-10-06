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
    createResourceUnlockBridge: 'userscript-only, behind !hasExtensionContext()'
});

const CORE_READ = /YTKitCore\??\.([A-Za-z_$][\w$]*)/g;

function loadCore(...files) {
    const core = {};
    for (const file of files) new Function('globalThis', 'module', read(file))({ YTKitCore: core }, undefined);
    return core;
}

test('every YTKitCore helper the isolated runtime reads is loaded into the isolated runtime', () => {
    const readers = runtimeModules.filter((file) => file === 'ytkit.js' || file.startsWith('features/'));
    const wanted = new Map();
    for (const file of readers) {
        for (const [, name] of read(file).matchAll(CORE_READ)) {
            if (!wanted.has(name)) wanted.set(name, new Set());
            wanted.get(name).add(file);
        }
    }
    assert.ok(wanted.has('normalizeBlockedChannelId') && wanted.has('validateAiProviderEndpoint'),
        'the scan must see the reads this test was written for');

    // A module that reads a name does not define it, so reads are cut first.
    const definers = runtimeModules.filter((file) => file !== 'ytkit.js').map((file) => read(file).replace(CORE_READ, ''));
    const missing = [...wanted.keys()].filter((name) => {
        if (NOT_IN_ISOLATED[name]) return false;
        const bare = new RegExp(`(^|[^\\w$])${name.replace(/\$/g, '\\$')}($|[^\\w$])`);
        return !definers.some((source) => bare.test(source));
    }).map((name) => `${name} (read by ${[...wanted.get(name)].join(', ')})`);
    assert.deepEqual(missing, [], 'add the defining core module to x-ytkit-runtime-modules before ytkit.js');

    for (const name of Object.keys(NOT_IN_ISOLATED)) {
        assert.ok(wanted.has(name), `${name} is no longer read; drop its exemption`);
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
