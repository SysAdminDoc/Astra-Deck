'use strict';

// Regression coverage for the extraction of the StorageManager
// cache+debounce layer out of ytkit.js into
// extension/core/storage-manager.js (exported as createStorageCache).
//
// Disambiguation reminder: this is the HIGH-LEVEL convenience layer that
// sits on top of core/storage.js (the LOW-LEVEL chrome.storage wrapper).
// The two used to share a name; the factory's export is now
// createStorageCache so the layer boundary is explicit.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const corePath = path.join(repoRoot, 'extension', 'core', 'storage-manager.js');
const ytkitPath = path.join(repoRoot, 'extension', 'ytkit.js');
const manifestPath = path.join(repoRoot, 'extension', 'manifest.json');

function loadFactoryIntoFreshGlobal() {
    globalThis.YTKitCore = {};
    const src = fs.readFileSync(corePath, 'utf8');
    // eslint-disable-next-line no-eval
    (0, eval)(src);
    if (typeof globalThis.YTKitCore.createStorageCache !== 'function') {
        throw new Error('createStorageCache not attached to YTKitCore');
    }
    return globalThis.YTKitCore.createStorageCache;
}

function makeBackingStore() {
    const store = {};
    const writeLog = [];
    return {
        store,
        writeLog,
        storageRead: (key, defaultVal) =>
            Object.prototype.hasOwnProperty.call(store, key) ? store[key] : defaultVal,
        storageWrite: (key, value, options = {}) => {
            store[key] = value;
            writeLog.push({ kind: 'single', key, value, options });
            return Promise.resolve();
        },
        storageWriteMany: (entries, options = {}) => {
            Object.assign(store, entries);
            writeLog.push({ kind: 'many', entries: { ...entries }, options });
            return Promise.resolve();
        },
        flushPendingStorageWrites: () => Promise.resolve()
    };
}

test('createStorageCache exposes the StorageManager API used by ytkit.js', () => {
    const factory = loadFactoryIntoFreshGlobal();
    const cache = factory({});
    for (const method of [
        '_serialize',
        '_rememberLocalWrite',
        'consumeLocalEcho',
        'get',
        'set',
        '_scheduleSave',
        '_flush',
        'setSync',
        'syncFromExternal',
        '_initUnloadFlush'
    ]) {
        assert.equal(typeof cache[method], 'function', `${method} should exist on the manager`);
    }
    assert.ok(cache._cache && typeof cache._cache === 'object');
    assert.ok(cache._dirty instanceof Set);
});

test('get() reads through to the backing store on cold cache, then memoizes', () => {
    const factory = loadFactoryIntoFreshGlobal();
    const backing = makeBackingStore();
    backing.store.foo = 42;
    const cache = factory(backing);
    assert.equal(cache.get('foo'), 42);
    backing.store.foo = 99; // mutate backing AFTER cache primed
    assert.equal(cache.get('foo'), 42, 'expected memoized value, not refreshed read');
});

test('set() + _flush() emits a single storageWriteMany call for all dirty keys', () => {
    const factory = loadFactoryIntoFreshGlobal();
    const backing = makeBackingStore();
    const cache = factory({ ...backing, getSaveDebounceMs: () => 0 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache._flush();
    const many = backing.writeLog.find(e => e.kind === 'many');
    assert.ok(many, 'expected a storageWriteMany call');
    assert.deepEqual(many.entries, { a: 1, b: 2 });
    assert.equal(many.options.immediate, true);
});

test('setSync() bypasses dirty set and writes through immediately', () => {
    const factory = loadFactoryIntoFreshGlobal();
    const backing = makeBackingStore();
    const cache = factory(backing);
    cache.set('a', 1);  // becomes dirty
    cache.setSync('a', 9);  // should clear dirty
    assert.equal(cache._dirty.has('a'), false);
    const single = backing.writeLog.find(e => e.kind === 'single' && e.key === 'a');
    assert.ok(single);
    assert.equal(single.value, 9);
    assert.equal(single.options.immediate, true);
});

test('consumeLocalEcho returns true exactly once for a recently written value', () => {
    const factory = loadFactoryIntoFreshGlobal();
    const cache = factory({});
    cache.set('k', { x: 1 });
    assert.equal(cache.consumeLocalEcho('k', { x: 1 }), true);
    assert.equal(cache.consumeLocalEcho('k', { x: 1 }), false, 'echo should be consumed');
});

test('syncFromExternal updates cache without marking dirty (avoids write-back loop)', () => {
    const factory = loadFactoryIntoFreshGlobal();
    const cache = factory({});
    cache.set('a', 1);  // dirty
    cache.syncFromExternal('a', 7);
    assert.equal(cache._cache.a, 7);
    assert.equal(cache._dirty.has('a'), false);
});

test('syncFromExternal with undefined deletes the cache entry', () => {
    const factory = loadFactoryIntoFreshGlobal();
    const cache = factory({});
    cache.set('a', 1);
    cache.syncFromExternal('a', undefined);
    assert.equal('a' in cache._cache, false);
});

test('manifest.json loads core/storage-manager.js BEFORE ytkit.js in every ISOLATED entry', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const isoBlocks = manifest.content_scripts.filter(b => b.world === 'ISOLATED');
    for (const block of isoBlocks) {
        const idxCache = block.js.indexOf('core/storage-manager.js');
        const idxYtkit = block.js.indexOf('ytkit.js');
        assert.notEqual(idxCache, -1, 'core/storage-manager.js missing from content_scripts.js');
        assert.ok(idxCache < idxYtkit, 'core/storage-manager.js must load before ytkit.js');
        // Must load AFTER core/storage.js because the factory accessors
        // resolve at first-call against the low-level functions.
        const idxLowLevel = block.js.indexOf('core/storage.js');
        assert.notEqual(idxLowLevel, -1, 'core/storage.js (low-level) missing from content_scripts.js');
        assert.ok(idxLowLevel < idxCache,
            'core/storage.js must load BEFORE core/storage-manager.js so the high-level cache can reach the low-level functions');
    }
});

test('ytkit.js no longer declares the inline `const StorageManager = {` block', () => {
    const src = fs.readFileSync(ytkitPath, 'utf8');
    // The exact opening line of the OLD inline block.
    assert.equal(src.includes('const StorageManager = {\n        _cache: {},\n        _dirty: new Set(),'), false,
        'inline StorageManager block still present in ytkit.js');
    // The factory instantiation must be present.
    assert.ok(src.includes('createStorageCache('),
        'ytkit.js should instantiate StorageManager via the createStorageCache factory');
});
