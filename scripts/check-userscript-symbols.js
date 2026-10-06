#!/usr/bin/env node
'use strict';

// scripts/check-userscript-symbols.js: every extension API the userscript's
// shipped code reaches for has to exist on the userscript host's adapter.
//
// The userscript runs the extension's own files, so a feature can't drift
// between the two builds any more. The seam that can still break is the one
// between that code and userscript/host.js, which stands in for chrome.* with
// GM_* grants. A background or content call to a member the adapter doesn't
// provide throws TypeError for userscript users only, past every extension
// test. The old version of this gate caught the same class of bug at the
// previous seam (v4.50.7 shipped five dead controls to every Tampermonkey
// user).
//
// How: run the generated YTKit.user.js host in a vm with stub modules and
// read the adapter it hands to content and background code, then scan the
// files it ships for `<api>.<namespace>.<member>` and storage area calls.
// A member the adapter lacks must be listed in GUARDED with the reason every
// call site already copes with it missing, and a listed member that nothing
// references any more fails too, so the list can't rot.
//
// Exit 0: every reference resolves. Exit 1: unresolved or stale. Exit 2: the
// host could not be run.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseUserscriptBuild } = require('../sync-userscript');

const REPO_ROOT = path.join(__dirname, '..');
const EXTENSION_ROOT = path.join(REPO_ROOT, 'extension');
const USERSCRIPT_PATH = path.join(REPO_ROOT, 'YTKit.user.js');

// Names the shipped code binds the extension API to.
const API_RECEIVERS = ['chrome', 'browser', 'ext', 'ns', 'extensionApi'];
const NAMESPACES = [
    'runtime', 'storage', 'tabs', 'downloads', 'alarms', 'permissions', 'cookies', 'action', 'i18n',
    'declarativeNetRequest', 'sidePanel', 'sidebarAction', 'contextMenus', 'scripting', 'webNavigation',
    'notifications', 'offscreen', 'identity', 'management', 'commands', 'windows', 'webRequest',
    'browserAction', 'userScripts', 'extension', 'privacy', 'history', 'bookmarks', 'sessions', 'idle',
];
const MEMBER_RE = new RegExp(
    `\\b(${API_RECEIVERS.join('|')})\\??\\.(${NAMESPACES.join('|')})\\??\\.([A-Za-z_$][\\w$]*)`, 'g');
const STORAGE_AREA_RE = /\bstorage\??\.(local|session|sync)\??\.([A-Za-z_$][\w$]*)/g;

const GUARDED = Object.freeze({
    content: Object.freeze({
        'runtime.getContexts': 'capability-probe.js only tests typeof, to report the capability',
        'tabs.sendMessage': 'core/browser-api.js returns null when ns?.tabs?.sendMessage is missing',
        'storage.session': 'core/credential-vault.js reads root.chrome?.storage?.session only inside createCredentialVault, which only the worker calls; the tab loads the module for its provider rules',
    }),
    background: Object.freeze({
        'runtime.connectNative': 'background.js checks ext.runtime?.connectNative first; the companion is reached over HTTP instead',
        'storage.sync': 'background.js reads ext.storage?.sync; with no sync area, settings sync stays off',
    }),
});

function fail(message, code = 1) {
    console.error(`[check-userscript-symbols] ${message}`);
    process.exit(code);
}

// Only what the host touches before it hands the adapter to the first module.
// The tests reuse this runner: `options.modules` replaces a stub module with a
// real function, and `options.prompts` answers window.prompt in order.
function captureAdapters(mainSource, build, initialValues = {}, options = {}) {
    const captured = {};
    const registry = {};
    for (const modulePath of build.requiredModules) {
        registry[modulePath] = function (globalThisArg, selfArg, windowArg, chromeArg) {
            if (modulePath === build.modules.background) captured.background = chromeArg;
            if (modulePath === build.modules.app) captured.content = chromeArg;
            if (options.modules?.[modulePath]) options.modules[modulePath].apply(this, arguments);
        };
    }
    const noop = () => {};
    const element = () => ({ setAttribute: noop, getAttribute: () => null, removeAttribute: noop, appendChild: noop, remove: noop });
    const values = new Map(Object.entries(initialValues));
    const pending = [];
    const menu = [];
    const prompts = [...(options.prompts || [])];
    const sandbox = {
        __astraDeckUserscriptModules: registry,
        location: { hostname: 'www.youtube.com', pathname: '/watch', href: 'https://www.youtube.com/watch?v=symbols', origin: 'https://www.youtube.com' },
        document: { documentElement: element(), head: element(), readyState: 'complete', addEventListener: noop, removeEventListener: noop, createElement: element },
        navigator: { language: 'en-US', languages: ['en-US'] },
        console: { log: noop, info: noop, debug: noop, warn: noop, error: noop },
        setTimeout: (run) => { pending.push(run); return pending.length; }, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
        queueMicrotask, performance: { now: () => 0 }, crypto: globalThis.crypto,
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
        MutationObserver: class { observe() {} disconnect() {} },
        URL, TextEncoder, TextDecoder, AbortController, Blob, Response, Headers,
        addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true,
        GM_info: { scriptHandler: 'check-userscript-symbols', version: '0' },
        GM_getValue: (key, fallback) => (values.has(key) ? values.get(key) : fallback),
        GM_setValue: (key, value) => values.set(key, value), GM_deleteValue: (key) => values.delete(key),
        GM_listValues: () => [...values.keys()], GM_addValueChangeListener: () => 1, GM_addStyle: element,
        GM_addElement: element, GM_xmlhttpRequest: noop, GM_download: noop, GM_openInTab: noop,
        GM_registerMenuCommand: (label, run) => menu.push({ label, run }),
        prompt: () => (prompts.length ? prompts.shift() : null), GM_getResourceText: () => '{}', GM_cookie: { list: (details, done) => done([]) },
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.top = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(mainSource, sandbox, { filename: 'YTKit.user.js' });
    // The ISOLATED runtime is scheduled with setTimeout; run it by hand.
    const drain = () => { while (pending.length) pending.shift()(); };
    drain();
    return { captured, state: sandbox.__astraDeckUserscript, values, menu, drain };
}

function surfaceOf(api) {
    const members = new Set();
    const areas = {};
    for (const [namespace, value] of Object.entries(api || {})) {
        if (!value || typeof value !== 'object') continue;
        for (const member of Object.keys(value)) members.add(`${namespace}.${member}`);
    }
    for (const area of ['local', 'session', 'sync']) {
        const target = api?.storage?.[area];
        if (target) areas[area] = new Set(Object.keys(target));
    }
    return { members, areas };
}

function referencesIn(files) {
    const members = new Map();
    const areaCalls = new Map();
    const note = (map, key, file) => {
        if (!map.has(key)) map.set(key, new Set());
        map.get(key).add(file);
    };
    for (const file of new Set(files)) {
        const source = fs.readFileSync(path.join(EXTENSION_ROOT, file), 'utf8');
        for (const match of source.matchAll(MEMBER_RE)) note(members, `${match[2]}.${match[3]}`, file);
        for (const match of source.matchAll(STORAGE_AREA_RE)) note(areaCalls, `${match[1]}.${match[2]}`, file);
    }
    return { members, areaCalls };
}

async function main() {
    const mainSource = fs.readFileSync(USERSCRIPT_PATH, 'utf8');
    const build = parseUserscriptBuild(mainSource);
    let adapters;
    try {
        adapters = captureAdapters(mainSource, build);
    } catch (error) {
        fail(`the host did not run in the vm: ${error.stack || error}`, 2);
    }
    await new Promise((resolve) => setImmediate(resolve));
    const { captured, state } = adapters;
    if (!captured.content || !captured.background) {
        fail(`the host never handed an adapter to ${captured.content ? 'background' : 'content'} code (phase ${state?.phase}, errors ${JSON.stringify(state?.errors || [])})`, 2);
    }

    const groups = {
        content: [build.modules.bridgeToken, ...build.modules.foundation, ...build.modules.features, build.modules.app, ...build.modules.liveChat],
        background: [build.modules.background, ...build.modules.backgroundCore],
    };
    // Positive control for the tests: `content:runtime.madeUp` adds a reference
    // no file makes, which has to fail.
    const injected = String(process.env.ASTRA_USERSCRIPT_SYMBOLS_INJECT || '').split(/[,\s]+/).filter(Boolean)
        .map((entry) => entry.split(':'));
    const problems = [];
    let checked = 0;
    for (const [world, files] of Object.entries(groups)) {
        const surface = surfaceOf(captured[world]);
        const { members, areaCalls } = referencesIn(files);
        for (const [injectedWorld, member] of injected) {
            if (injectedWorld === world && member) members.set(member, new Set(['(injected)']));
        }
        const guarded = GUARDED[world];
        for (const [member, sites] of members) {
            checked += 1;
            if (surface.members.has(member) || guarded[member]) continue;
            problems.push(`${world}: ${member} is not on the userscript adapter (used in ${[...sites].join(', ')})`);
        }
        for (const [call, sites] of areaCalls) {
            const [area, method] = call.split('.');
            if (!surface.areas[area]) continue; // a missing area is judged as storage.<area> above
            checked += 1;
            if (!surface.areas[area].has(method)) {
                problems.push(`${world}: storage.${call} is not on the userscript adapter (used in ${[...sites].join(', ')})`);
            }
        }
        for (const member of Object.keys(guarded)) {
            if (!members.has(member)) problems.push(`${world}: GUARDED lists ${member}, which no shipped file references any more; remove it`);
            else if (surface.members.has(member)) problems.push(`${world}: GUARDED lists ${member}, which the adapter now provides; remove it`);
        }
    }

    if (problems.length) {
        console.error(`[check-userscript-symbols] ${problems.length} problem(s):`);
        for (const problem of problems) console.error(`  - ${problem}`);
        console.error('  Add the member to userscript/host.js, or guard every call site and list it in GUARDED with the reason.');
        process.exit(1);
    }
    const guardedCount = Object.values(GUARDED).reduce((sum, list) => sum + Object.keys(list).length, 0);
    console.log(`[check-userscript-symbols] OK: ${checked} extension API reference(s) in shipped files resolve on the userscript adapter (${guardedCount} guarded absence(s))`);
}

if (require.main === module) {
    main().catch((error) => fail(error.stack || String(error), 2));
}

module.exports = { GUARDED, captureAdapters, surfaceOf };
