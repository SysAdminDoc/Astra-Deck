'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const storageSource = fs.readFileSync(path.join(repoRoot, 'extension', 'core', 'storage.js'), 'utf8');
const popupSource = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8');
const popupHtml = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.html'), 'utf8');
const ytkitSource = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');

class MockStorage {
    constructor(entries = {}) {
        this.data = new Map(Object.entries(entries));
        this.failOnSet = '';
    }

    getItem(key) {
        return this.data.has(key) ? this.data.get(key) : null;
    }

    setItem(key, value) {
        if (key === this.failOnSet) throw new Error(`set failed: ${key}`);
        this.data.set(key, String(value));
    }

    removeItem(key) {
        this.data.delete(key);
    }
}

function loadStorageCore() {
    const context = {
        Blob,
        CustomEvent: class CustomEvent {},
        chrome: { storage: { local: {}, onChanged: { addListener() {} } } },
        clearTimeout,
        console,
        document: { addEventListener() {}, visibilityState: 'visible' },
        globalThis: null,
        setTimeout,
        window: { addEventListener() {}, dispatchEvent() {} }
    };
    context.globalThis = context;
    context.YTKitCore = { hasExtensionContext: () => false };
    vm.createContext(context);
    vm.runInContext(storageSource, context, { filename: 'extension/core/storage.js' });
    return context.YTKitCore;
}

test('YouTube state reset snapshots and clears only the exact allowlist', () => {
    const core = loadStorageCore();
    const local = new MockStorage({
        'yt.config_': '{"stale":true}',
        'yt-player-volume': '88',
        'ytkit-bookmarks': '{"keep":true}',
        'unrelated-site-key': 'keep'
    });
    const session = new MockStorage({
        'yt-remote-session-name': 'Living room',
        'ytkit-session': 'keep'
    });
    const manager = core.createYouTubeStateManager({
        localStorage: local,
        sessionStorage: session,
        origin: 'https://www.youtube.com'
    });

    const snapshot = manager.snapshot();
    assert.deepEqual(Array.from(snapshot.local, (entry) => Array.from(entry)), [
        ['yt.config_', '{"stale":true}'],
        ['yt-player-volume', '88']
    ]);
    assert.deepEqual(Array.from(snapshot.session, (entry) => Array.from(entry)), [
        ['yt-remote-session-name', 'Living room']
    ]);

    const result = manager.clear(snapshot);
    assert.equal(result.cleared.length, 3);
    assert.equal(local.getItem('yt.config_'), null);
    assert.equal(session.getItem('yt-remote-session-name'), null);
    assert.equal(local.getItem('ytkit-bookmarks'), '{"keep":true}');
    assert.equal(local.getItem('unrelated-site-key'), 'keep');
    assert.equal(session.getItem('ytkit-session'), 'keep');

    const restored = manager.restore(snapshot);
    assert.equal(restored.restored.length, 3);
    assert.equal(local.getItem('yt-player-volume'), '88');
    assert.equal(session.getItem('yt-remote-session-name'), 'Living room');
});

test('YouTube state reset clears oversized values without a snapshot instead of failing', () => {
    const core = loadStorageCore();
    const bloated = 'x'.repeat(200 * 1024);
    const local = new MockStorage({
        'yt.innertube::requests': bloated,
        'yt-player-volume': '88'
    });
    const session = new MockStorage();
    const manager = core.createYouTubeStateManager({
        localStorage: local,
        sessionStorage: session,
        origin: 'https://www.youtube.com'
    });

    // The bloated key is exactly what reset targets — snapshot must not throw.
    const snapshot = manager.snapshot();
    assert.deepEqual(Array.from(snapshot.local, (entry) => Array.from(entry)), [
        ['yt-player-volume', '88']
    ]);
    assert.deepEqual(Array.from(snapshot.oversized), ['local:yt.innertube::requests']);

    const result = manager.clear(snapshot);
    assert.deepEqual(Array.from(result.cleared), ['local:yt-player-volume']);
    assert.deepEqual(Array.from(result.notUndoable), ['local:yt.innertube::requests']);
    assert.equal(local.getItem('yt.innertube::requests'), null);

    // Undo restores only the snapshotted key; the oversized one stays cleared.
    const restored = manager.restore(snapshot);
    assert.deepEqual(Array.from(restored.restored), ['local:yt-player-volume']);
    assert.equal(local.getItem('yt.innertube::requests'), null);
});

test('YouTube state reset skips values changed after capture', () => {
    const core = loadStorageCore();
    const local = new MockStorage({ 'yt-player-quality': 'hd720' });
    const session = new MockStorage();
    const manager = core.createYouTubeStateManager({
        localStorage: local,
        sessionStorage: session,
        origin: 'https://music.youtube.com'
    });
    const snapshot = manager.snapshot();
    local.setItem('yt-player-quality', 'hd1080');
    const result = manager.clear(snapshot);
    assert.deepEqual(Array.from(result.cleared), []);
    assert.deepEqual(Array.from(result.skipped), ['local:yt-player-quality']);
    assert.equal(local.getItem('yt-player-quality'), 'hd1080');
    const restored = manager.restore(snapshot);
    assert.deepEqual(Array.from(restored.restored), []);
    assert.deepEqual(Array.from(restored.skipped), ['local:yt-player-quality']);
    assert.equal(local.getItem('yt-player-quality'), 'hd1080');
});

test('YouTube state restore rolls back both storage areas on failure', () => {
    const core = loadStorageCore();
    const local = new MockStorage({ 'yt.config_': 'old-local' });
    const session = new MockStorage({ 'yt-remote-session-name': 'old-session' });
    const manager = core.createYouTubeStateManager({
        localStorage: local,
        sessionStorage: session,
        origin: 'https://www.youtube.com'
    });
    const snapshot = manager.snapshot();
    manager.clear(snapshot);
    session.failOnSet = 'yt-remote-session-name';

    assert.throws(() => manager.restore(snapshot), /set failed/);
    assert.equal(local.getItem('yt.config_'), null);
    assert.equal(session.getItem('yt-remote-session-name'), null);
});

test('popup reset uses snapshot-stage-clear ordering and tab-scoped Undo', () => {
    assert.match(popupHtml, /id="reset-youtube-state-btn"/);
    assert.match(popupHtml, /id="undo-youtube-state-btn"[^>]*hidden/);
    const resetStart = popupSource.indexOf('async function resetYoutubeState()');
    const undoStart = popupSource.indexOf('async function undoYoutubeStateReset()', resetStart);
    assert.ok(resetStart > -1 && undoStart > resetStart);
    const resetBlock = popupSource.slice(resetStart, undoStart);
    assert.notEqual(resetBlock.indexOf("{ action: 'snapshot' }"), -1, 'anchor: the snapshot call must exist or the ordering is vacuous');
    assert.ok(resetBlock.indexOf("{ action: 'snapshot' }") < resetBlock.indexOf("ext.storage.session, 'set'"));
    assert.ok(resetBlock.indexOf("ext.storage.session, 'set'") < resetBlock.indexOf("{ action: 'clear', snapshot: staged.snapshot }"));
    assert.match(resetBlock, /sendPopupBridgeMessageToTab\(\s*staged\.tabId/);
    const undoBlock = popupSource.slice(undoStart, popupSource.indexOf('function sessionStorageAvailable()', undoStart));
    assert.match(undoBlock, /\{ action: 'restore', snapshot: staged\.snapshot \}/);
    assert.match(undoBlock, /clearYoutubeStateResetSnapshot\(\)/);
});

test('content bridge records reset diagnostics and exposes an in-page toast', () => {
    const start = ytkitSource.indexOf("message.type === 'YTKIT_RESET_YOUTUBE_STATE'");
    const end = ytkitSource.indexOf('// Portable data bridge', start);
    assert.ok(start > -1 && end > start);
    const block = ytkitSource.slice(start, end);
    assert.match(block, /createYouTubeStateManager/);
    assert.match(block, /DiagnosticLog\?\.record\?\.\(\s*'youtube-state-reset'/);
    assert.match(block, /console\.info\('\[Astra Deck\] YouTube state reset'/);
    assert.match(block, /showToast\(t\('youtubeStateResetToast'/);
    assert.match(block, /return true/);
});

// ── An orphaned tab must not report successful writes ──
// When the extension is updated/reloaded/disabled while a YouTube tab stays
// open, hasExtensionContext() goes false but the settings panel keeps working
// against the in-memory cache. flushPendingStorageWrites() used to resolve
// { ok: true } with writes still pending and no way to persist them, so
// imports, undo/rollback confirmations and "Settings saved" toasts all claimed
// success for data that was lost on the next page load. The { ok, error }
// contract exists precisely to make that impossible.
function loadStorageCoreWithContext(hasContext) {
    const context = {
        Blob,
        CustomEvent: class CustomEvent {},
        chrome: { storage: { local: {}, onChanged: { addListener() {} } } },
        clearTimeout,
        console,
        document: { addEventListener() {}, visibilityState: 'visible' },
        globalThis: null,
        setTimeout,
        window: { addEventListener() {}, dispatchEvent() {} }
    };
    context.globalThis = context;
    context.YTKitCore = { hasExtensionContext: () => hasContext };
    vm.createContext(context);
    vm.runInContext(storageSource, context, { filename: 'extension/core/storage.js' });
    return context.YTKitCore;
}

test('an invalidated extension context reports write failure instead of success', async () => {
    const core = loadStorageCoreWithContext(false);

    // Nothing pending: staying quiet is correct, there is nothing to lose.
    const idle = await core.flushPendingStorageWrites();
    assert.equal(idle.ok, true, 'an empty flush must not manufacture a failure');

    // A real write with no way to reach disk must report failure.
    const result = await core.storageWrite('ytSuiteSettings', { theme: 'dark' }, { immediate: true });
    assert.equal(result.ok, false,
        'a write that cannot be persisted must not resolve ok');
    assert.match(String(result.error?.message || ''), /Extension context invalidated/,
        'the failure must name the reload-the-page cause the UI already renders');
});

test('a live extension context still resolves writes successfully', async () => {
    const core = loadStorageCoreWithContext(true);
    const idle = await core.flushPendingStorageWrites();
    assert.equal(idle.ok, true);
});
