'use strict';

// A rejected settings preload used to be a console.warn and nothing else: the
// cache stayed empty, extensionStateReady still flipped true, and every feature
// on the page ran at factory defaults for the whole tab session while the popup
// (its own read path) kept showing the user's real values. These tests pin both
// halves of the signal that now exists — the recorded failure in core/storage.js
// and the in-page report that turns it into a diagnostic entry plus a toast.

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const storagePath = path.join(repoRoot, 'extension', 'core', 'storage.js');
const ytkitPath = path.join(repoRoot, 'extension', 'ytkit.js');

function loadStorageModule(getImpl) {
    const context = vm.createContext({
        console: { warn() {}, error() {} },
        setTimeout,
        clearTimeout,
        chrome: { storage: { local: { get: getImpl, set: async () => {} } } }
    });
    context.globalThis = context;
    context.YTKitCore = { hasExtensionContext: () => true };
    vm.runInContext(fs.readFileSync(storagePath, 'utf8'), context);
    return context.YTKitCore;
}

test('a rejected storage preload is recorded instead of only warned about', async () => {
    const core = loadStorageModule(async () => {
        throw new Error('QUOTA_BYTES quota exceeded');
    });

    assert.equal(core.getStoragePreloadError(), null, 'no failure before the preload runs');
    await core.preloadExtensionState();

    const recorded = core.getStoragePreloadError();
    // Duck-typed, not `instanceof Error`: the module runs in its own vm realm,
    // so its Error prototype is not this realm's.
    assert.ok(recorded && typeof recorded.message === 'string', 'the rejection is retained');
    assert.match(recorded.message, /QUOTA_BYTES/);
    // The cache is still usable and still empty — the failure signal must not
    // change the existing "degrade to defaults" behaviour, only expose it.
    assert.equal(core.storageRead('anyKey', 'fallback'), 'fallback');
});

test('a successful storage preload records no failure', async () => {
    const core = loadStorageModule(async () => ({ 'ytkit-settings': { theme: 'oled' } }));
    await core.preloadExtensionState();

    assert.equal(core.getStoragePreloadError(), null);
    assert.deepEqual(core.storageRead('ytkit-settings', null), { theme: 'oled' });
});

function loadReporter(globals) {
    const src = fs.readFileSync(ytkitPath, 'utf8');
    const start = src.indexOf('    let _storagePreloadNoticeShown = false;');
    assert.ok(start > 0, 'the preload reporter must exist in ytkit.js');
    // Bound the slice on the next declaration rather than a fixed byte window:
    // a fixed window silently truncates when the function grows and turns the
    // assertions below vacuous.
    const end = src.indexOf('\n    let _mainRan = false;', start);
    assert.ok(end > start, 'the reporter slice must end at the bootstrap guard');
    const context = vm.createContext({ console: { warn() {} }, ...globals });
    context.globalThis = context;
    vm.runInContext(`${src.slice(start, end)}\n;globalThis.__report = reportStoragePreloadFailure;`, context);
    return context;
}

test('main() reports a failed preload to diagnostics and to the user', () => {
    const recorded = [];
    const toasts = [];
    const context = loadReporter({
        getStoragePreloadError: () => new Error('storage unavailable'),
        DiagnosticLog: { record: (ctx, msg) => recorded.push([ctx, msg]) },
        isLiveChatFrame: () => false,
        showToast: (message, color, options) => toasts.push({ message, color, options }),
        t: (key, fallback) => fallback
    });

    context.__report();

    assert.equal(recorded.length, 1, 'the failure reaches the diagnostic ring');
    assert.equal(recorded[0][0], 'storage-preload');
    assert.match(recorded[0][1], /storage unavailable/);
    assert.equal(toasts.length, 1, 'the user gets a visible degraded-state signal');
    assert.equal(toasts[0].options.tone, 'error');
    assert.equal(toasts[0].options.persistent, true, 'a defaults-only session must not auto-dismiss its notice');
    assert.match(toasts[0].message, /running on defaults/);

    // One notice per page, not one per call.
    context.__report();
    assert.equal(toasts.length, 1);
    assert.equal(recorded.length, 1);
});

test('a healthy preload reports nothing, and a chat iframe records without toasting', () => {
    const healthy = loadReporter({
        getStoragePreloadError: () => null,
        DiagnosticLog: { record: () => assert.fail('nothing to record on a healthy preload') },
        isLiveChatFrame: () => false,
        showToast: () => assert.fail('no toast on a healthy preload'),
        t: (key, fallback) => fallback
    });
    healthy.__report();

    const recorded = [];
    const chat = loadReporter({
        getStoragePreloadError: () => new Error('storage unavailable'),
        DiagnosticLog: { record: (ctx, msg) => recorded.push([ctx, msg]) },
        isLiveChatFrame: () => true,
        showToast: () => assert.fail('the chat iframe shares the page toast host'),
        t: (key, fallback) => fallback
    });
    chat.__report();
    assert.equal(recorded.length, 1, 'the chat frame still records the failure');
});

test('the degraded-state notice is localizable, not an inline English literal', () => {
    const en = require(path.join(repoRoot, 'extension', '_locales', 'en', 'messages.json'));
    const de = require(path.join(repoRoot, 'extension', '_locales', 'de', 'messages.json'));
    const ar = require(path.join(repoRoot, 'extension', '_locales', 'ar', 'messages.json'));

    assert.match(en.storagePreloadFailed.message, /running on defaults/);
    assert.notEqual(de.storagePreloadFailed.message, en.storagePreloadFailed.message);
    assert.notEqual(ar.storagePreloadFailed.message, en.storagePreloadFailed.message);
});
