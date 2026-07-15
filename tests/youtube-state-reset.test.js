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
