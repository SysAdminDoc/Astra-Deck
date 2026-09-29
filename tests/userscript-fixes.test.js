'use strict';

// Regression tests for the 2026-06 standalone-userscript audit fixes.
//
// These used to be 40 regex pins. A pin cannot tell a working fix from a broken
// one, so each behavioural claim now runs the code: the two standalone
// userscripts are evaluated in a sandbox with a fake YouTube around them, the
// single-flight probe guard is driven by concurrent callers, and the Innertube
// failover is called and its rejection observed.
//
// YTKit.user.js no longer carries its own MediaDLManager or transcript
// service. It is generated from extension/ and runs features/download-ui and
// core/transcript-service.js, so the behavioural tests drive those, after
// proving the userscript ships them.
//
// A few assertions stay textual, in two groups. "The artifact must not contain
// X" (a deleted installer path, an `irm | iex` command, a poison API-key
// literal) has no executable form, because absence is the whole claim, and it
// is checked across every generated userscript file. And `@match`,
// `@updateURL`, `@downloadURL`, `@namespace` and `@description` are metadata
// the userscript MANAGER parses out of the header comment, so the header itself
// is the contract. Nothing else here is a scan: an earlier pass pinned the
// install-prompt copy by scanning the file, which matched a comment above the
// code and two tooltips 15k lines away.
//
// Findings covered:
//  1. MediaDL install flow pointed at the deleted Install-YTYT.ps1 (HTTP 404).
//  2. @description claimed SponsorBlock, which the userscript did not ship.
//  3. _method2_InnertubeAPI sent a placeholder API key, guaranteeing a 400.
//  4. MediaDLManager.check() multiplied the 6-port probe storm.
//  5. theater-split.user.js fought YTKit's own split over one scroll gesture.
//  6. YT_Reaction_Spammer.user.js could not update and duplicated YTKit's UI.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const { fakeTreeDocument, collectFakeTree } = require('./helpers/monolith');
const { sources, userscriptBundles } = require('./helpers/source');
const { createDownloadUIFeature } = require('../extension/features/download-ui');

const REPO_ROOT = path.join(__dirname, '..');
const readRepoFile = (name) => fs.readFileSync(path.join(REPO_ROOT, name), 'utf8');

// Everything a manager installs: the host and its three @require libraries.
const userscriptSource = sources.userscript;
const userscriptHeader = readRepoFile('YTKit.user.js').split('// ==/UserScript==')[0];
const theaterSplitSource = readRepoFile('theater-split.user.js');
const reactionSpammerSource = readRepoFile('YT_Reaction_Spammer.user.js');

// ── A sandboxed YouTube, enough for a standalone userscript to boot in ──

function fakeYouTube({ htmlClasses = [], elementsById = {} } = {}) {
    const classes = new Set(htmlClasses);
    const listeners = [];
    const observers = [];
    const infos = [];
    const noopElement = () => ({
        style: { setProperty() {}, removeProperty() {}, cssText: '' },
        classList: { add() {}, remove() {}, contains: () => false },
        dataset: {},
        setAttribute() {}, removeAttribute() {}, appendChild() {}, append() {}, remove() {},
        addEventListener() {}, removeEventListener() {},
        querySelector: () => null, querySelectorAll: () => [],
        insertAdjacentHTML() {}, replaceChildren() {}, prepend() {}, focus() {}, blur() {}, click() {},
    });
    const documentElement = Object.assign(noopElement(), {
        classList: {
            contains: (name) => classes.has(name),
            add: (name) => classes.add(name),
            remove: (name) => classes.delete(name),
        },
    });
    const documentRef = Object.assign(noopElement(), {
        documentElement,
        readyState: 'complete',
        head: noopElement(),
        body: noopElement(),
        getElementById: (id) => elementsById[id] || null,
        createElement: () => noopElement(),
        addEventListener: (type, handler) => listeners.push({ target: 'document', type, handler }),
    });
    const windowRef = {
        location: {
            href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            pathname: '/watch',
            search: '?v=dQw4w9WgXcQ',
            hostname: 'www.youtube.com',
        },
        addEventListener: (type, handler) => listeners.push({ target: 'window', type, handler }),
        removeEventListener() {},
        matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
        innerWidth: 1440,
        innerHeight: 900,
    };
    const context = {
        console: { info: (...args) => infos.push(args.join(' ')), log() {}, warn() {}, error() {} },
        document: documentRef,
        window: windowRef,
        location: windowRef.location,
        navigator: { userAgent: 'node' },
        setTimeout: () => 0,
        clearTimeout() {},
        setInterval: () => 0,
        clearInterval() {},
        requestAnimationFrame: () => 0,
        cancelAnimationFrame() {},
        MutationObserver: class {
            constructor(callback) { this.callback = callback; observers.push(this); }
            observe(target, options) { this.target = target; this.options = options; }
            disconnect() { this.disconnected = true; }
        },
        ResizeObserver: class { observe() {} disconnect() {} },
        URL,
        URLSearchParams,
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        GM_getValue: (_key, fallback) => fallback,
        GM_setValue() {},
        GM_addStyle() {},
    };
    context.globalThis = context;
    context.self = context;
    context.unsafeWindow = context;
    return { context, listeners, observers, infos, classes, documentElement };
}

/** Evaluate one of the extension's core modules and hand back YTKitCore. */
function loadCoreModule(relativePath, extras = {}) {
    const context = { console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, ...extras };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(readRepoFile(relativePath), context, { filename: relativePath });
    return context.globalThis.YTKitCore;
}

// ── 1. MediaDL install flow: release EXE, not the deleted .ps1 ──

test('the generated userscript carries no reference to the deleted Install-YTYT installer script', () => {
    // Absence, so a scan is the only possible form of this assertion, and it
    // covers the libraries too: that is where the install flow lives now.
    assert.doesNotMatch(userscriptSource, /Install-YTYT/,
        'the userscript must not reference Install-YTYT.ps1/.bat — the installer script was deleted (raw URL is HTTP 404)');
    assert.doesNotMatch(userscriptSource, /\birm\b[^\n]*\|\s*iex/,
        'the userscript must not offer an `irm <url> | iex` command — piping a remote script to iex is a broken (404) and unsafe install path');
    // The hand-written userscript also refused to define INSTALLER_COMMAND.
    // It runs the extension's install assist now, whose primary action
    // downloads the release exe and whose "Copy fallback command" copies a
    // command that downloads that same exe; neither pipes a remote script.
});

// The floating release URL and its file name are pinned against the same
// MediaDLManager in tests/features/next-monolith-peel.test.js ("downloadUI
// Settings installer downloads the real GitHub release asset").

test('the install prompt renders the download action and says what to do with it', async () => {
    // Scanning the source for these strings matched a comment above the code
    // and unrelated tooltips 15k lines away, so the prompt is built for real
    // and read out of the tree it produced.
    assert.ok(userscriptBundles('features/download-ui/index.js'),
        'the userscript must ship the download module that builds this prompt');
    const documentRef = fakeTreeDocument(() => null);
    const toasts = [];
    const downloads = [];
    const opened = [];
    const { MediaDLManager } = createDownloadUIFeature({
        showToast: (message) => toasts.push(String(message)),
        triggerDownload: async (url, name) => { downloads.push([url, name]); },
        openExternalUrl: async (url) => { opened.push(url); },
    });

    const previousDocument = globalThis.document;
    const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    globalThis.document = documentRef;
    // A manager that grants no clipboard: the setup download still has to work.
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
    try {
        MediaDLManager.showInstallPrompt('install');
        const prompt = documentRef.body.children.find((node) => node.id === 'ytkit-mediadl-install-prompt');
        assert.ok(prompt, 'the prompt must mount');

        // The prompt wires its buttons with .onclick, not addEventListener.
        const downloadButton = collectFakeTree(prompt, 'button').find((node) =>
            typeof node.onclick === 'function'
            && String(node.textContent || '').includes('Download setup'));
        assert.ok(downloadButton, 'the prompt must offer a "Download setup" action');

        await downloadButton.onclick({ preventDefault() {} });
        assert.deepEqual(downloads, [[MediaDLManager.INSTALLER_URL, MediaDLManager.INSTALLER_FILE_NAME]],
            'clicking it downloads the release asset the manager names');
        assert.deepEqual(opened, [], 'a download that worked needs no URL fallback');
        const note = collectFakeTree(prompt, '.ytkit-install-prompt__note')[0];
        assert.match(String(note?.textContent || ''), /Open the file/,
            'the prompt then tells the user what to do with the file');
        assert.equal(toasts.length, 1);
        assert.match(toasts[0], /double-click the setup file to install/, 'and so does the toast beside it');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
        if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
        else delete globalThis.navigator;
    }
});

// ── 2. @description must not claim features the userscript does not ship ──

test('YTKit.user.js @description claims no feature the userscript does not ship', () => {
    // Header metadata: the userscript manager reads this line verbatim. The
    // hand-written build claimed SponsorBlock without shipping it. The build
    // is generated now and does ship it, so the claim is checked against what
    // the generated userscript actually carries rather than banned outright.
    const descMatch = userscriptHeader.match(/^\/\/ @description\s+(.+)$/m);
    assert.ok(descMatch, 'YTKit.user.js must declare @description');
    const claims = [
        [/sponsorblock/i, 'features/sponsorblock/index.js'],
        [/dearrow/i, 'features/dearrow/index.js'],
        [/dislike/i, 'features/return-dislike/index.js'],
    ];
    for (const [claim, module] of claims) {
        if (!claim.test(descMatch[1])) continue;
        assert.ok(userscriptBundles(module),
            `the description names ${claim.source}, so the userscript must ship ${module}`);
    }
});

// ── 3. Innertube transcript method: no placeholder API key ──

test('the userscript runs the extension transcript service and ships no placeholder key', () => {
    // Absence is the claim for the poison literal: it guaranteed a 400 from
    // youtubei/v1/player.
    assert.doesNotMatch(userscriptSource, /REDACTED_GOOGLE_API_KEY/,
        'the poison literal guaranteed a 400 from youtubei/v1/player');
    // The hand-written userscript carried its own LegacyTranscriptService. It
    // runs core/transcript-service.js now, whose failover the next test calls.
    assert.ok(userscriptBundles('core/transcript-service.js'),
        'the userscript must ship the transcript service the next test drives');
});

test('the extension Innertube method refuses a missing or malformed key', async () => {
    const core = loadCoreModule(path.join('extension', 'core', 'transcript-service.js'));
    let requests = 0;
    const service = core.createTranscriptService({
        getVideoId: () => 'dQw4w9WgXcQ',
        extensionFetchJson: async () => { requests += 1; return { response: {}, data: {} }; },
        extensionFetchText: async () => { requests += 1; return { response: {}, data: '' }; },
    });

    // No page-derived key: the method must reject so the caller falls through
    // to the next transcript method, and must not spend a request finding out.
    service._getInnertubeApiKey = () => null;
    await assert.rejects(
        () => service._method2_InnertubeAPI('dQw4w9WgXcQ'),
        /Innertube API key unavailable/,
        'a missing key must fail over, not POST'
    );
    assert.equal(requests, 0, 'no request may be sent without a real key');

    // A key that cannot be a real Innertube key is refused the same way.
    service._getInnertubeApiKey = () => 'nope';
    await assert.rejects(
        () => service._method2_InnertubeAPI('dQw4w9WgXcQ'),
        /Innertube API key has unexpected format/
    );
    assert.equal(requests, 0, 'a malformed key must not be sent either');
});

// ── 4. MediaDLManager.check() single-flight guard ──

test('MediaDLManager.check() shares one in-flight probe sweep across concurrent callers', async () => {
    // The MediaDLManager the userscript runs is the download module's.
    assert.ok(userscriptBundles('features/download-ui/index.js'));
    const { MediaDLManager } = createDownloadUIFeature();

    let sweeps = 0;
    MediaDLManager._checkImpl = async () => {
        sweeps += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'running';
    };

    await Promise.all([MediaDLManager.check(true), MediaDLManager.check(true), MediaDLManager.check(true)]);
    assert.equal(sweeps, 1, 'three concurrent callers must share one port-probe sweep');
    assert.equal(MediaDLManager._checkPromise, null, 'the single-flight slot must clear when the sweep settles');

    await MediaDLManager.check(true);
    assert.equal(sweeps, 2, 'a later caller starts a fresh sweep once the slot is clear');
});

// ── 5. theater-split stands down when YTKit is present ──

test('theater-split.user.js carries project-owned @updateURL/@downloadURL', () => {
    // Header metadata, parsed by the userscript manager, not by us.
    for (const field of ['updateURL', 'downloadURL']) {
        assert.match(theaterSplitSource,
            new RegExp(`// @${field}\\s+https://raw\\.githubusercontent\\.com/SysAdminDoc/Astra-Deck/main/theater-split\\.user\\.js`),
            `theater-split must declare a SysAdminDoc/Astra-Deck @${field}`);
    }
});

test('theater-split.user.js refuses to initialize alongside YTKit', () => {
    for (const marker of ['ytkit-split-active', 'ytkit-split-open']) {
        const env = fakeYouTube({ htmlClasses: [marker] });
        vm.runInNewContext(theaterSplitSource, env.context, { filename: 'theater-split.user.js' });
        assert.deepEqual(env.listeners, [],
            `with html.${marker} present, theater-split must wire no listeners`);
        assert.equal(env.observers.length, 0,
            `with html.${marker} present, theater-split must arm no observer`);
        assert.equal(env.infos.length, 1, 'stand-down must say so exactly once');
        assert.match(env.infos[0], /^\[Theater Split\] YTKit detected/);
    }

    for (const id of ['ytkit-split-wrapper', 'ytkit-masthead-btn']) {
        const env = fakeYouTube({ elementsById: { [id]: { id } } });
        vm.runInNewContext(theaterSplitSource, env.context, { filename: 'theater-split.user.js' });
        assert.deepEqual(env.listeners, [], `#${id} must also stand theater-split down`);
    }
});

test('theater-split.user.js runs normally when YTKit is absent, and stands down if it arrives late', () => {
    const env = fakeYouTube();
    vm.runInNewContext(theaterSplitSource, env.context, { filename: 'theater-split.user.js' });

    assert.deepEqual(
        env.listeners.map(({ target, type }) => `${target}:${type}`),
        ['window:yt-navigate-finish', 'document:fullscreenchange', 'window:popstate'],
        'with no YTKit present the script wires its own listeners'
    );
    assert.equal(env.infos.length, 0, 'nothing to announce when there is no conflict');

    // The defensive watch is armed on <html>'s class attribute.
    assert.equal(env.observers.length, 1, 'the late-activation watch must be armed');
    const [watcher] = env.observers;
    assert.equal(watcher.target, env.documentElement);
    // Compared field by field: a vm-built array is not reference-equal to a
    // host-realm one, so deepEqual would fail on identical values.
    assert.equal(watcher.options.attributes, true);
    assert.deepEqual(Array.from(watcher.options.attributeFilter), ['class']);

    // YTKit arms its split after boot: the watch must stand the script down.
    env.classes.add('ytkit-split-active');
    watcher.callback();
    assert.equal(env.infos.length, 1, 'late detection stands down');
    assert.match(env.infos[0], /^\[Theater Split\] YTKit detected/);
    assert.equal(watcher.disconnected, true, 'standing down releases the observer');

    // And it stays down rather than announcing again on every mutation.
    watcher.callback();
    assert.equal(env.infos.length, 1, 'stand-down is announced once, not per mutation');
});

// ── 6. reaction spammer: updatable install + YTKit conflict guard ──

test('YT_Reaction_Spammer.user.js carries project-owned metadata (namespace + update/download URLs)', () => {
    // Header metadata again: an install with no @updateURL can never update.
    assert.match(reactionSpammerSource,
        /\/\/ @namespace\s+https:\/\/github\.com\/SysAdminDoc\/Astra-Deck/,
        '@namespace must point at the repo that actually hosts the script');
    assert.doesNotMatch(reactionSpammerSource,
        /^\/\/ @namespace\s+https:\/\/github\.com\/SysAdminDoc\/yt-reaction-spammer$/m,
        '@namespace must not point at the nonexistent yt-reaction-spammer repo');
    for (const field of ['updateURL', 'downloadURL']) {
        assert.match(reactionSpammerSource,
            new RegExp(`// @${field}\\s+https://raw\\.githubusercontent\\.com/SysAdminDoc/Astra-Deck/main/YT_Reaction_Spammer\\.user\\.js`),
            `@${field} must point at the raw script so installs can update`);
    }
});

test('YT_Reaction_Spammer.user.js stands down when YTKit\'s reaction spammer UI is mounted', () => {
    // The extension mounts #ytkit-reaction-spammer-launcher / -panel into the
    // same live-chat frame, so either one means the standalone panel is a
    // duplicate.
    for (const id of ['ytkit-reaction-spammer-launcher', 'ytkit-reaction-spammer-panel']) {
        const env = fakeYouTube({ elementsById: { [id]: { id, remove() {} } } });
        vm.runInNewContext(reactionSpammerSource, env.context, { filename: 'YT_Reaction_Spammer.user.js' });
        assert.equal(env.infos.length, 1, `#${id} must stand the standalone panel down`);
        assert.match(env.infos[0], /^\[YT Reaction Spammer\] YTKit integrated reaction spammer detected/);
    }
});

test('YT_Reaction_Spammer.user.js stands down if YTKit mounts its UI late', () => {
    const elementsById = {};
    const env = fakeYouTube({ elementsById });
    vm.runInNewContext(reactionSpammerSource, env.context, { filename: 'YT_Reaction_Spammer.user.js' });
    assert.equal(env.infos.length, 0, 'nothing to announce while YTKit is absent');
    assert.ok(env.observers.length >= 1, 'the chat watch must be armed');

    const [watcher] = env.observers;
    elementsById['ytkit-reaction-spammer-panel'] = { id: 'ytkit-reaction-spammer-panel', remove() {} };
    watcher.callback();
    assert.equal(env.infos.length, 1, 'a late YTKit panel stands the standalone script down');
    assert.equal(watcher.disconnected, true, 'standing down releases the observer');

    watcher.callback();
    assert.equal(env.infos.length, 1, 'stand-down is announced once');
});
