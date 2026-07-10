'use strict';

// Cross-browser extension API wrapper (core/browser-api.js): namespace
// resolution must prefer the standards-track `browser` object, fall back
// to `chrome`, and degrade to a null namespace when neither exists.
// The wrapper loads FIRST on every surface so migrated call sites can
// rely on it; sidepanel.js is the first migrated batch.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const wrapperSource = fs.readFileSync(path.join(repoRoot, 'extension', 'core', 'browser-api.js'), 'utf8');

function loadWrapper(globals = {}) {
    const context = { ...globals };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(wrapperSource, context, { filename: 'extension/core/browser-api.js' });
    return context;
}

test('browser-api resolves the chrome namespace when only chrome exists', () => {
    const chrome = { runtime: { id: 'x' }, storage: {}, tabs: {}, permissions: {}, downloads: {}, i18n: {} };
    const ctx = loadWrapper({ chrome });
    assert.equal(ctx.YTKitBrowser.hasNamespace, true);
    assert.equal(ctx.YTKitBrowser.ns, chrome);
    assert.equal(ctx.YTKitBrowser.runtime, chrome.runtime);
    assert.equal(ctx.YTKitBrowser.downloads, chrome.downloads);
});

test('browser-api prefers the standards-track browser namespace over chrome', () => {
    const chrome = { runtime: { id: 'chrome' } };
    const browser = { runtime: { id: 'firefox' }, storage: {}, tabs: {} };
    const ctx = loadWrapper({ chrome, browser });
    assert.equal(ctx.YTKitBrowser.ns, browser, 'browser.* must win when both namespaces exist');
    assert.equal(ctx.YTKitBrowser.runtime.id, 'firefox');
});

test('browser-api degrades to a null namespace outside an extension context', () => {
    const ctx = loadWrapper({});
    assert.equal(ctx.YTKitBrowser.hasNamespace, false);
    assert.equal(ctx.YTKitBrowser.ns, null);
    assert.equal(ctx.YTKitBrowser.storage, null);
    assert.equal(ctx.YTKitBrowser.tabs, null);
});

test('browser-api ignores namespace objects without a runtime surface', () => {
    // A page script may define `window.browser` for its own purposes; only
    // an object exposing `runtime` counts as the extension namespace.
    const chrome = { runtime: { id: 'chrome' } };
    const ctx = loadWrapper({ chrome, browser: { detect: () => 'not-an-extension-api' } });
    assert.equal(ctx.YTKitBrowser.ns, chrome);
});

test('browser-api exposes a scope-injectable factory on YTKitCore', () => {
    const ctx = loadWrapper({ chrome: { runtime: { id: 'x' } } });
    assert.equal(typeof ctx.YTKitCore.createBrowserApi, 'function');
    const custom = ctx.YTKitCore.createBrowserApi({ browser: { runtime: { id: 'custom' } } });
    assert.equal(custom.runtime.id, 'custom');
    const empty = ctx.YTKitCore.createBrowserApi({});
    assert.equal(empty.hasNamespace, false);
});

test('browser-api normalizes Promise-based Firefox tab messaging', async () => {
    const browser = {
        runtime: { id: 'firefox' },
        tabs: { sendMessage: async (tabId, message) => ({ tabId, type: message.type, ok: true }) }
    };
    const ctx = loadWrapper({ browser, setTimeout, clearTimeout, Promise });
    const result = await ctx.YTKitBrowser.sendTabMessage(7, { type: 'PING' });
    assert.deepEqual({ ...result }, { tabId: 7, type: 'PING', ok: true });
});

test('browser-api tab messaging resolves null on rejection instead of leaking an error', async () => {
    const chrome = {
        runtime: { id: 'chrome' },
        tabs: { sendMessage: async () => { throw new Error('No receiver'); } }
    };
    const ctx = loadWrapper({ chrome, setTimeout, clearTimeout, Promise });
    assert.equal(await ctx.YTKitBrowser.sendTabMessage(8, { type: 'PING' }), null);
});

test('browser-api loads first in every content-script group and every extension page', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'extension', 'manifest.json'), 'utf8'));
    for (const group of manifest.content_scripts) {
        const scripts = group.js || [];
        if (!scripts.length) continue;
        if (!scripts.includes('ytkit.js')) continue; // MAIN-world bridge group stays wrapper-free
        assert.equal(scripts[0], 'core/browser-api.js',
            'the wrapper must load before every other ISOLATED-world script');
    }
    for (const page of ['popup.html', 'sidepanel.html', 'sidebar.html']) {
        const html = fs.readFileSync(path.join(repoRoot, 'extension', page), 'utf8');
        const wrapperIdx = html.indexOf('core/browser-api.js');
        assert.ok(wrapperIdx > -1, `${page} must load the wrapper`);
        const mainScript = page === 'popup.html' ? 'popup.js' : 'sidepanel.js';
        assert.ok(wrapperIdx < html.indexOf(`"${mainScript}"`),
            `${page} must load the wrapper before ${mainScript}`);
    }
});

test('sidepanel.js is fully migrated off direct chrome.* API calls (first batch)', () => {
    const sidepanelSource = fs.readFileSync(path.join(repoRoot, 'extension', 'sidepanel.js'), 'utf8');
    // The only allowed `chrome` reference is the guarded static-preview
    // fallback inside the `ext` resolver at the top of the file.
    const chromeCalls = sidepanelSource.match(/\bchrome\.[a-zA-Z]/g) || [];
    assert.deepEqual(chromeCalls, [],
        `sidepanel.js must route every extension API call through the ext wrapper (found: ${chromeCalls.join(', ')})`);
    assert.match(sidepanelSource, /globalThis\.YTKitBrowser\?\.hasNamespace/,
        'sidepanel.js must resolve its namespace through YTKitBrowser');
});
