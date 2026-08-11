'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const source = fs.readFileSync(
    path.join(repoRoot, 'extension', 'core', 'resource-unlock.js'),
    'utf8'
);

function createEnvironment(initialVisibility = 'visible') {
    class FakeDocument {
        constructor() {
            this.visibilityState = initialVisibility;
            this.listeners = new Map();
        }

        addEventListener(type, listener) {
            this.listeners.set(type, listener);
        }

        removeEventListener(type, listener) {
            if (this.listeners.get(type) === listener) this.listeners.delete(type);
        }

        setVisibility(visibilityState) {
            this.visibilityState = visibilityState;
            this.listeners.get('visibilitychange')?.();
        }
    }

    class FakeLockManager {
        constructor() {
            this.calls = [];
        }

        request(...args) {
            this.calls.push(args);
            const callback = args.at(-1);
            return Promise.resolve().then(() => callback({ name: args[0] }));
        }
    }

    class FakeRequest {
        constructor() {
            this.listeners = new Map();
        }

        addEventListener(type, listener) {
            this.listeners.set(type, listener);
        }

        succeed(db) {
            this.listeners.get('success')?.({ target: { result: db } });
        }
    }

    class FakeIDBFactory {
        constructor() {
            this.requests = [];
        }

        open() {
            const request = new FakeRequest();
            this.requests.push(request);
            return request;
        }
    }

    const document = new FakeDocument();
    const lockManager = new FakeLockManager();
    const indexedDB = new FakeIDBFactory();
    const root = {
        document,
        navigator: { locks: lockManager },
        indexedDB,
        Promise,
        setTimeout
    };
    const context = { globalThis: null, Promise, setTimeout };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'extension/core/resource-unlock.js' });

    const bridge = context.YTKitCore.createResourceUnlockBridge({
        root,
        document,
        lockManager,
        indexedDB,
        Promise,
        setTimeout
    });
    return { bridge, document, indexedDB, lockManager };
}

test('foreground Web Locks keep native results and held locks release when the tab hides', async () => {
    const { bridge, document, lockManager } = createEnvironment();
    bridge.install();
    bridge.setEnabled(true);

    const foregroundResult = await lockManager.request('foreground', () => 'native-result');
    assert.equal(foregroundResult, 'native-result');

    const held = lockManager.request('held', () => new Promise(() => {}));
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(bridge.getStats().activeLocks, 1);

    document.setVisibility('hidden');
    assert.equal(await held, undefined);
    assert.equal(bridge.getStats().releasedLocks, 1);
    assert.equal(bridge.getStats().activeLocks, 0);
});

test('hidden Web Lock requests queue and replay on foreground or disable', async () => {
    const { bridge, document, lockManager } = createEnvironment('hidden');
    bridge.install();
    bridge.setEnabled(true);

    const foregroundReplay = lockManager.request('queued-visible', () => 'visible-result');
    assert.equal(lockManager.calls.length, 0);
    assert.equal(bridge.getStats().queuedLocks, 1);

    document.setVisibility('visible');
    assert.equal(await foregroundReplay, 'visible-result');
    assert.equal(lockManager.calls.length, 1);

    document.setVisibility('hidden');
    const disableReplay = lockManager.request('queued-disable', () => 'disable-result');
    assert.equal(bridge.getStats().queuedLocks, 1);
    bridge.setEnabled(false);
    assert.equal(await disableReplay, 'disable-result');
    assert.equal(lockManager.calls.length, 2);
    assert.equal(bridge.getStats().queuedLocks, 0);
});

test('tracked YouTube databases close on hide and native methods restore on destroy', () => {
    const { bridge, document, indexedDB, lockManager } = createEnvironment();
    const originalLockRequest = lockManager.request;
    const originalIdbOpen = Object.getPrototypeOf(indexedDB).open;
    bridge.install();
    bridge.setEnabled(true);

    const db = {
        closeCalls: 0,
        addEventListener() {},
        close() { this.closeCalls += 1; }
    };
    const request = indexedDB.open('youtube');
    request.succeed(db);
    assert.equal(bridge.getStats().trackedDatabases, 1);

    document.setVisibility('hidden');
    assert.equal(db.closeCalls, 1);
    assert.equal(bridge.getStats().closedDatabases, 1);
    assert.equal(bridge.getStats().trackedDatabases, 0);

    bridge.destroy();
    assert.equal(lockManager.request, originalLockRequest);
    assert.equal(Object.getPrototypeOf(indexedDB).open, originalIdbOpen);
});

test('CPU Tamer owns the MAIN-world bridge opt-in in extension and userscript builds', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(repoRoot, 'extension', 'manifest.json'),
        'utf8'
    ));
    const mainEntry = manifest.content_scripts.find((entry) => entry.world === 'MAIN');
    assert.deepEqual(
        mainEntry.js.slice(0, 4),
        ['core/injection-guard.js', 'core/resource-unlock.js', 'core/player.js', 'core/audio-track.js']
    );

    const mainSource = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit-main.js'), 'utf8');
    const extensionSource = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
    const userscriptSource = fs.readFileSync(path.join(repoRoot, 'YTKit.user.js'), 'utf8');
    assert.match(mainSource, /data-ytkit-resource-unlock/);
    assert.match(mainSource, /data-ytkit-resource-lock-stats/);
    assert.match(extensionSource, /setAttribute\('data-ytkit-resource-unlock', 'on'\)/);
    assert.match(extensionSource, /removeAttribute\('data-ytkit-resource-unlock'\)/);
    assert.match(userscriptSource, /createResourceUnlockBridge\(\{ root: win, document \}\)/);
});
