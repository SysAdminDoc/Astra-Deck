'use strict';

// A `typeof name === 'function'` guard on a name the file never declares is
// always false. The guarded path is dead, lint stays clean, and every gate
// passes. That is how Jump to Most Replayed and Heatmap Smart Speed shipped
// without ever showing a marker (`parseHeatmapMarkers` lives on YTKitCore
// and ytkit.js never destructured it), how the popup and side panel feature
// timing list stayed empty (`getLifecycle`), and how the userscript's
// chapter anti-translate never ran. Unit tests missed all of them because
// they inject the helper into the sandbox by name.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const repoRoot = path.join(__dirname, '..');

// Platform globals a guard may legitimately probe for.
const PLATFORM_GLOBALS = new Set([
    'window', 'document', 'chrome', 'browser', 'globalThis', 'self', 'navigator', 'location', 'history',
    'console', 'performance', 'prompt', 'requestIdleCallback', 'cancelIdleCallback', 'requestAnimationFrame',
    'queueMicrotask', 'structuredClone', 'trustedTypes', 'ResizeObserver', 'IntersectionObserver',
    'MutationObserver', 'PerformanceObserver', 'AbortController', 'fetch', 'Blob', 'URL', 'Intl', 'CSS',
    'CustomEvent', 'Event', 'Element', 'DOMParser', 'ClipboardItem', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'crypto', 'TextEncoder', 'TextDecoder', 'Worker', 'BroadcastChannel',
    'MessageChannel', 'getComputedStyle', 'matchMedia', 'module', 'require', 'exports', 'process',
    'importScripts', 'scheduler', 'WeakRef', 'FinalizationRegistry', 'cloneInto', 'exportFunction',
    'GM', 'GM_info', 'GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_addStyle', 'GM_xmlhttpRequest',
    'unsafeWindow', 'JSON', 'WeakMap', 'Float32Array', 'HTMLVideoElement', 'MediaSource', 'MediaCapabilities',
    'AudioContext', 'webkitAudioContext'
]);

// Deliberate, each with a working fallback when the name is absent. Keyed
// `<file basename>:<name>`, valued with the reason. The one former entry, the
// userscript Quick Settings `applyExternalSettingsUpdate` guard, was removed
// with the dead branch it guarded.
const ALLOWED = new Map();

function walk(node, visit) {
    if (!node || typeof node.type !== 'string') return;
    visit(node);
    for (const key of Object.keys(node)) {
        if (key === 'loc') continue;
        const value = node[key];
        if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
        else if (value && typeof value.type === 'string') walk(value, visit);
    }
}

function unboundGuardedNames(source) {
    const ast = acorn.parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'script',
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
        locations: true
    });
    const declared = new Set();
    const addPattern = (pattern) => {
        if (!pattern) return;
        if (pattern.type === 'Identifier') declared.add(pattern.name);
        else if (pattern.type === 'ObjectPattern') pattern.properties.forEach((prop) => addPattern(prop.type === 'RestElement' ? prop.argument : prop.value));
        else if (pattern.type === 'ArrayPattern') pattern.elements.forEach(addPattern);
        else if (pattern.type === 'AssignmentPattern') addPattern(pattern.left);
        else if (pattern.type === 'RestElement') addPattern(pattern.argument);
    };
    walk(ast, (node) => {
        if (node.type === 'VariableDeclarator') addPattern(node.id);
        if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id) declared.add(node.id.name);
        if (/Function/.test(node.type)) node.params.forEach(addPattern);
        if (node.type === 'CatchClause') addPattern(node.param);
    });
    const found = new Map();
    walk(ast, (node) => {
        if (node.type !== 'UnaryExpression' || node.operator !== 'typeof' || node.argument.type !== 'Identifier') return;
        const name = node.argument.name;
        if (declared.has(name) || PLATFORM_GLOBALS.has(name)) return;
        if (!found.has(name)) found.set(name, node.loc.start.line);
    });
    return found;
}

function shippedScripts() {
    const files = [
        'extension/ytkit.js',
        'extension/popup.js',
        'extension/sidepanel.js',
        'extension/background.js',
        'extension/ytkit-main.js',
        'YTKit.user.js'
    ];
    for (const dir of fs.readdirSync(path.join(repoRoot, 'extension/features'))) {
        const file = `extension/features/${dir}/index.js`;
        if (fs.existsSync(path.join(repoRoot, file))) files.push(file);
    }
    for (const name of fs.readdirSync(path.join(repoRoot, 'extension/core'))) {
        if (name.endsWith('.js')) files.push(`extension/core/${name}`);
    }
    return files;
}

test('no shipped script guards a name it never declares', () => {
    const problems = [];
    for (const rel of shippedScripts()) {
        const source = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
        for (const [name, line] of unboundGuardedNames(source)) {
            const key = `${path.basename(rel)}:${name}`;
            if (ALLOWED.has(key)) continue;
            problems.push(`${rel}:${line} typeof ${name}`);
        }
    }
    assert.deepEqual(problems, [],
        'a guard on an unbound name is always false; bind it from YTKitCore or remove the dead path');
});

test('the scanner itself reports an unbound guarded name and ignores a bound one', () => {
    const found = unboundGuardedNames([
        'const { bound } = globalThis.YTKitCore || {};',
        'if (typeof bound === "function") bound();',
        'if (typeof missing === "function") missing();',
        'function local() {}',
        'if (typeof local === "function") local();'
    ].join('\n'));
    assert.deepEqual([...found.keys()], ['missing']);
});

test('the feature timing request answers from the recorded init times', () => {
    const { loadDeclarations } = require('./helpers/monolith');
    let listener = null;
    const windowRef = { addEventListener() {} };
    windowRef.top = windowRef;
    loadDeclarations(['attachExtensionBridgeListeners'], {
        _extensionBridgeAttached: false,
        window: windowRef,
        chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; } } } },
        PANEL_MESSAGE_TYPES: new Proxy({}, { get: (_target, prop) => `panel:${String(prop)}` }),
        getFeatureHealthSnapshot: () => [
            { id: 'fast', name: 'Fast Feature', initialized: true, initMs: 1.234 },
            { id: 'slow', name: 'Slow Feature', initialized: true, initMs: 80.5, destroyMs: 2 },
            { id: 'off', name: 'Turned Off', initialized: false, initMs: 40 },
            { id: 'never', initialized: true }
        ]
    }).attachExtensionBridgeListeners();
    assert.equal(typeof listener, 'function');

    let response = null;
    listener({ type: 'YTKIT_GET_FEATURE_PERF' }, {}, (value) => { response = value; });
    assert.equal(response.ok, true);
    assert.deepEqual(response.features.map((row) => [row.id, row.name, row.initMs]), [
        ['slow', 'Slow Feature', 80.5],
        ['fast', 'Fast Feature', 1.23]
    ], 'running features, slowest first, with a readable name; a destroyed feature is not running');
    assert.equal(response.totalFeatures, 2);
});

test('the userscript restores chapter titles through YTKitCore, for the playing video only', () => {
    const vm = require('vm');
    const { loadUserscriptFeature, fakeTreeDocument } = require('./helpers/monolith');
    const coreSandbox = {};
    coreSandbox.globalThis = coreSandbox;
    vm.runInNewContext(fs.readFileSync(path.join(repoRoot, 'extension/core/chapters.js'), 'utf8'), coreSandbox);

    const documentRef = fakeTreeDocument();
    const rows = [['0:00', 'Einleitung'], ['1:00', 'Mitte']].map(([time, title]) => {
        const item = documentRef.createElement('ytd-macro-markers-list-item-renderer');
        const heading = documentRef.createElement('h4');
        heading.className = 'macro-markers-list-item-text';
        heading.textContent = title;
        const stamp = documentRef.createElement('div');
        stamp.id = 'time';
        stamp.textContent = time;
        item.append(heading, stamp);
        documentRef.body.appendChild(item);
        return heading;
    });
    let playing = 'aaaaaaaaaaa';
    const feature = loadUserscriptFeature('antiTranslateChapters', {
        YTKitCore: coreSandbox.YTKitCore,
        document: documentRef,
        window: { ytInitialPlayerResponse: { videoDetails: { videoId: 'aaaaaaaaaaa', shortDescription: '0:00 Intro\n1:00 Middle\n2:00 End' } } },
        getVideoId: () => playing
    });

    playing = 'bbbbbbbbbbb';
    assert.equal(feature._readOriginalChapters(), null,
        'after in-page navigation the page response describes the previous video');

    playing = 'aaaaaaaaaaa';
    feature._chapters = null;
    feature._process();
    assert.deepEqual(rows.map((heading) => heading.textContent), ['Intro', 'Middle'],
        'the original titles come back once the helpers are reached through YTKitCore');
});

test('userscript Quick Settings turns off the other side of a conflict pair', async () => {
    // The guard above hid this: Quick Settings called a reconciler the
    // userscript never defines, and its fallback toggled only the one feature.
    // Turning Theater Split on left Fit Player to Window running with it.
    const { loadUserscriptDeclarations, fakeTreeDocument, fakeNode } = require('./helpers/monolith');
    const calls = [];
    const feature = (id, name, initialized) => ({
        id, name, _initialized: initialized,
        init() { calls.push(`init:${id}`); },
        destroy() { calls.push(`destroy:${id}`); }
    });
    const run = async (saveResult) => {
        const documentRef = fakeTreeDocument();
        calls.length = 0;
        const features = [feature('stickyVideo', 'Theater Split', false), feature('fitPlayerToWindow', 'Fit Player to Window', true)];
        const appState = { settings: { stickyVideo: false, fitPlayerToWindow: true } };
        const saved = [];
        const toasts = [];
        const api = loadUserscriptDeclarations(['CONFLICT_MAP', 'closePageModal', 'openPageModal'], {
            document: documentRef,
            features,
            appState,
            _pageModalOpen: false,
            _pageModalOverlay: null,
            getCurrentPage: () => 'watch',
            PAGE_MODAL_PAGE_MAP: { watch: 'watch' },
            PAGE_MODAL_CONFIG: { watch: [{ id: 'stickyVideo', label: 'Theater Split' }] },
            PAGE_LABELS: { watch: 'Watch' },
            ICONS: new Proxy({}, { get: () => () => fakeNode() }),
            requestAnimationFrame: (fn) => fn(),
            setTimeout: () => 0,
            settingsManager: { save: (next) => { saved.push({ ...next }); return saveResult; } },
            showToast: (message) => toasts.push(message),
            DebugManager: { log() {} }
        });
        api.openPageModal();
        const card = documentRef.querySelector('.ytkit-pm-card');
        assert.ok(card, 'the Quick Settings card renders');
        await card.listeners.get('click').values().next().value({});
        return { appState, saved, toasts };
    };

    const ok = await run({ ok: true });
    assert.equal(ok.appState.settings.stickyVideo, true);
    assert.equal(ok.appState.settings.fitPlayerToWindow, false, 'the conflicting feature is switched off');
    assert.equal(ok.saved.at(-1).fitPlayerToWindow, false, 'and that is what gets saved');
    assert.deepEqual(calls, ['init:stickyVideo', 'destroy:fitPlayerToWindow']);
    assert.match(ok.toasts.join('\n'), /Fit Player to Window turned off/);

    // A rejected save puts both features back the way they were.
    const rejected = await run(Promise.resolve({ ok: false }));
    assert.deepEqual({ ...rejected.appState.settings }, { stickyVideo: false, fitPlayerToWindow: true });
    assert.deepEqual(calls, ['init:stickyVideo', 'destroy:fitPlayerToWindow', 'destroy:stickyVideo', 'init:fitPlayerToWindow']);
    assert.equal(rejected.toasts.length, 0, 'nothing was turned off, so nothing is announced');
});

test('every allowance names a guard that still exists', () => {
    for (const key of ALLOWED.keys()) {
        const [file, name] = key.split(':');
        const rel = shippedScripts().find((candidate) => path.basename(candidate) === file);
        assert.ok(rel, `${file} must still ship`);
        const found = unboundGuardedNames(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
        assert.ok(found.has(name), `${key} is no longer unbound; drop the allowance`);
    }
});
