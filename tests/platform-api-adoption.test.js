'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('the retained browser namespace path probes browser and falls back to chrome', () => {
    const source = read('extension/core/browser-api.js');
    const load = (globals) => {
        const context = { ...globals, globalThis: null };
        context.globalThis = context;
        vm.createContext(context);
        vm.runInContext(source, context, { filename: 'extension/core/browser-api.js' });
        return context.YTKitBrowser;
    };

    const browser = { runtime: { id: 'standard' } };
    const chrome = { runtime: { id: 'vendor' } };
    assert.equal(load({ browser, chrome }).ns, browser);
    assert.equal(load({ chrome }).ns, chrome);
    assert.equal(load({ browser: { unrelated: true }, chrome }).ns, chrome);
    assert.equal(load({}).ns, null);
});

test('the retained documentId path has changed-document and Firefox 142 fallback coverage', () => {
    const backgroundTests = read('tests/background.test.js');
    assert.match(backgroundTests, /documentId: 'document-a'/,
        'the background suite must exercise a sender with documentId');
    assert.match(backgroundTests, /documentId: 'document-b'/,
        'the background suite must reject a different documentId');
    assert.match(backgroundTests, /URL-backed document binding when documentId is absent/,
        'the background suite must exercise the Firefox 142 fallback without documentId');
    assert.match(backgroundTests, /delete sender\.documentId/,
        'the fallback fixture must actually remove documentId from the sender');
    assert.match(backgroundTests, /COOKIE_CAPABILITY_CONTEXT_MISMATCH/,
        'the document identity test must assert the rejected capability');
});

test('runtime.getContexts cannot replace the synchronous same-world injection guard', () => {
    let contextQueries = 0;
    const source = read('extension/core/injection-guard.js');
    const context = {
        Date,
        Object,
        Number,
        String,
        TypeError,
        console: { warn() {} },
        browser: {
            runtime: {
                getContexts() {
                    contextQueries += 1;
                    return Promise.resolve([]);
                }
            }
        },
        globalThis: null
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'extension/core/injection-guard.js' });

    const first = context.YTKitCore.createInjectionGuard({ key: '__platformPolicy', owner: 'first' });
    const duplicate = context.YTKitCore.createInjectionGuard({ key: '__platformPolicy', owner: 'second' });
    assert.equal(first.claimed, true);
    assert.equal(duplicate.claimed, false);
    assert.equal(contextQueries, 0, 'the guard must not add an asynchronous context-enumeration startup path');
});

test('deferred APIs leave one tested fallback path in each affected subsystem', () => {
    const player = read('extension/core/player.js');
    for (const eventName of ['loadstart', 'loadedmetadata', 'canplay', 'playing']) {
        assert.match(player, new RegExp(`addEventListener\\('${eventName}'`),
            `player fallback must retain ${eventName}`);
    }
    assert.doesNotMatch(player, /CSS\.supports\([^\n]*:playing|querySelector\([^\n]*:playing/,
        'media-state pseudo-classes must not add a second player-state path');

    const styles = read('extension/core/styles.js');
    assert.match(styles, /createElement\('style'\)/,
        'style ownership must retain the Chrome 120 and Firefox 142 style-element path');
    assert.doesNotMatch(styles, /adoptedStyleSheets|new CSSStyleSheet/,
        'content-script constructed stylesheets must not duplicate the style lifecycle');

    const manifest = JSON.parse(read('extension/manifest.json'));
    const { patchManifestForFirefox } = require('../scripts/manifest-patch');
    const firefoxManifest = patchManifestForFirefox(manifest);
    assert.equal(firefoxManifest.browser_specific_settings.gecko.strict_min_version, '142.0');
    assert.equal('sandbox' in firefoxManifest, false,
        'the Firefox 142 build must not declare the Firefox 154 sandbox key');

    const predicate = read('extension/core/predicate-sandbox.js');
    assert.match(predicate, /function compile\(/,
        'the synchronous predicate fallback must remain available');
    assert.doesNotMatch(predicate, /\beval\s*\(|\bnew\s+Function\s*\(|createElement\(['"]iframe/,
        'the fallback must remain interpreter-only');
});

test('deferred platform probes are documentation, not shipped startup work', () => {
    const runtimeFiles = [
        'extension/background.js',
        'extension/core/injection-guard.js',
        'extension/core/player.js',
        'extension/core/styles.js',
        'extension/live-chat.js',
        'extension/ytkit.js',
        'extension/ytkit-main.js'
    ];
    const shipped = runtimeFiles.map(read).join('\n');
    assert.doesNotMatch(shipped, /\.getContexts\s*\(/);
    assert.doesNotMatch(shipped, /adoptedStyleSheets|new CSSStyleSheet/);
    assert.doesNotMatch(shipped, /CSS\.supports\([^\n]*:playing|querySelector\([^\n]*:playing/);
});
