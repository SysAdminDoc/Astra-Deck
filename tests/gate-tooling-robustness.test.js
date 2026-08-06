'use strict';

// The gate/tooling robustness batch. These are all "the check could not fail"
// or "two copies of one decision" defects, so each test pins the property that
// makes the tool trustworthy rather than the wording of its output.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');

test('MAIN-world scripts do not publish exports into the page global scope', () => {
    // These files run in the PAGE's scope. `typeof module` is a Node signal
    // there, not a bundler one — a page that defined its own CommonJS shim
    // would have had it overwritten with bridge internals.
    for (const file of [
        ['extension', 'ytkit-main.js'],
        ['extension', 'core', 'audio-track.js']
    ]) {
        const src = read(...file);
        assert.match(src, /const inNodeTests = typeof process !== 'undefined'/,
            `${file.join('/')} must gate its export block on the Node runtime`);
        assert.match(src, /if \(inNodeTests && typeof module !== 'undefined' && module\.exports\)/,
            `${file.join('/')} must not assign module.exports from a page context`);
    }

    // …and the exports still reach the tests that need them.
    delete require.cache[require.resolve('../extension/core/audio-track.js')];
    const audioTrack = require('../extension/core/audio-track.js');
    assert.equal(typeof audioTrack, 'object');
    assert.ok(audioTrack && Object.keys(audioTrack).length > 0,
        'the Node guard must still let the test harness import the module');
});

test('the side panel survives a missing browser-api wrapper', () => {
    const src = read('extension', 'sidepanel.js');
    const start = src.indexOf('function sendToTab(');
    const block = src.slice(start, start + 600);
    assert.match(block, /globalThis\.YTKitBrowser\?\.sendTabMessage/,
        'sendToTab must respect the bare-chrome fallback the file opens with');
    assert.doesNotMatch(block, /globalThis\.YTKitBrowser\.sendTabMessage\(/,
        'an unconditional call threw in static preview mode');
});

test('sidebar.html and sidepanel.html use the same i18n keys for the same strings', () => {
    const sidebar = read('extension', 'sidebar.html');
    const sidepanel = read('extension', 'sidepanel.html');
    const keysOf = (html) => (html.match(/data-i18n(?:-attr-[a-z-]+)?="([^"]+)"/g) || [])
        .map((m) => m.replace(/.*="([^"]+)"$/, '$1'));

    const sidebarKeys = new Set(keysOf(sidebar));
    const sidepanelKeys = new Set(keysOf(sidepanel));
    // The document title genuinely differs between the two surfaces.
    const SIDEBAR_ONLY = new Set(['sidebarDocTitle']);
    const onlyInSidebar = [...sidebarKeys]
        .filter((k) => !sidepanelKeys.has(k) && !SIDEBAR_ONLY.has(k));

    // Divergent keys mean the two twin surfaces can be translated differently
    // even though they render identical English today.
    assert.deepEqual(onlyInSidebar, [],
        `sidebar.html must not carry keys its sidepanel twin lacks: ${onlyInSidebar.join(', ')}`);
    for (const stale of ['toggleStateOn', 'healthClearBtn', 'dlProgressReady']) {
        assert.ok(!sidebar.includes(`data-i18n="${stale}"`), `${stale} drifted from the twin`);
    }
});

test('the storage-manager unload guard spans factory invocations', () => {
    const src = read('extension', 'core', 'storage-manager.js');
    const declaration = src.indexOf('const _installedUnloadHooks = new WeakSet();');
    const factory = src.search(/function createStorageManager|createStorageManager\s*[=(]/);
    assert.ok(declaration > -1, 'the guard must exist');
    assert.ok(factory === -1 || declaration < factory,
        'a per-factory WeakSet made the idempotence claim false — it must be module-scoped');
    assert.match(src, /keyed on the window whose listeners were installed/,
        'the comment must describe what the guard actually guarantees');
});

test('release readiness cross-checks the manifest hashes against the files and SHA256SUMS', () => {
    const src = read('scripts', 'generate-release-readiness.js');
    assert.match(src, /'manifest-hash-agreement'/,
        'a manifest hand-edit or a TOCTOU between the two hash passes went unflagged');
    assert.match(src, /sha256\(filePath\) !== declared/,
        'the declared hash must be compared to the file on disk');
    assert.match(src, /checksumEntries\.get\(name\)\.toLowerCase\(\) !== declared/,
        'the declared hash must also be compared to SHA256SUMS');
    assert.match(src, /manifestHashMissing\.push\(name\)/,
        'an asset with no declared hash must fail rather than silently pass');
});

test('the i18n substitution gate reports the counts it actually measured', () => {
    const src = read('scripts', 'check-i18n.js');
    // The success line interpolates real counts; a hardcoded number here is how
    // a gate ends up reporting a clean run it never performed.
    assert.match(src, /\$\{getMessageCallCount\} getMessage\(\) call\(s\)/);
    assert.match(src, /\$\{totalKeys\} message key\(s\) defined/);
    assert.match(src, /const getMessageCallCount = jsFiles\.reduce/,
        'the count must be derived from the files that were scanned');
});
