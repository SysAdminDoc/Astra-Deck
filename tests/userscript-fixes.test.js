'use strict';

// Regression tests for the 2026-06 standalone-userscript audit fixes.
//
// These used to be 40 regex pins. A pin cannot tell a working fix from a broken
// one, so each behavioural claim now runs the code: the two standalone
// userscripts are evaluated in a sandbox with a fake YouTube around them, the
// single-flight probe guard is driven by concurrent callers, and the Innertube
// failover is called and its rejection observed.
//
// Four assertions stay textual on purpose. "The artifact must not contain X"
// (a deleted installer path, an `irm | iex` command, a poison API-key literal)
// has no executable form — absence is the whole claim — and `@match`,
// `@updateURL`, `@namespace` and `@description` are metadata the userscript
// manager parses out of the header comment, so the header IS the contract.
//
// Findings covered:
//  1. MediaDL install flow pointed at the deleted Install-YTYT.ps1 (HTTP 404).
//  2. @description claimed SponsorBlock, which the userscript does not ship.
//  3. _method2_InnertubeAPI sent a placeholder API key, guaranteeing a 400.
//  4. MediaDLManager.check() multiplied the 6-port probe storm.
//  5. theater-split.user.js fought YTKit's own split over one scroll gesture.
//  6. YT_Reaction_Spammer.user.js could not update and duplicated YTKit's UI.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const { loadUserscriptDeclarations } = require('./helpers/monolith');

const REPO_ROOT = path.join(__dirname, '..');
const readRepoFile = (name) => fs.readFileSync(path.join(REPO_ROOT, name), 'utf8');

const userscriptSource = readRepoFile('YTKit.user.js');
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

test('YTKit.user.js carries no reference to the deleted Install-YTYT installer script', () => {
    // Absence, so a scan is the only possible form of this assertion.
    assert.doesNotMatch(userscriptSource, /Install-YTYT/,
        'YTKit.user.js must not reference Install-YTYT.ps1/.bat — the installer script was deleted (raw URL is HTTP 404)');
    assert.doesNotMatch(userscriptSource, /\birm\b[^\n]*\|\s*iex/,
        'YTKit.user.js must not offer an `irm <url> | iex` command — piping a remote script to iex is a broken (404) and unsafe install path');
    assert.doesNotMatch(userscriptSource, /INSTALLER_COMMAND/,
        'YTKit.user.js must not define INSTALLER_COMMAND — the install flow is download-the-release-exe, not copy-paste-to-PowerShell');
});

test('the MediaDL install flow resolves a floating AstraDownloader release asset', () => {
    const { MediaDLManager } = loadUserscriptDeclarations(
        ['USERSCRIPT_COMPANION_PORT_CATALOGUE', 'MediaDLManager'],
        { fetch: () => new Promise(() => {}), AbortController, setTimeout: () => 0, clearTimeout() {} }
    );

    // A pinned tag went stale once already; /latest/ cannot.
    const url = new URL(MediaDLManager.INSTALLER_URL);
    assert.equal(url.origin, 'https://github.com');
    assert.equal(url.pathname, '/SysAdminDoc/AstraDownloader/releases/latest/download/AstraDownloader.exe');
    assert.equal(MediaDLManager.INSTALLER_FILE_NAME, 'AstraDownloader.exe');
    assert.ok(url.pathname.endsWith(`/${MediaDLManager.INSTALLER_FILE_NAME}`),
        'the download URL must end in the file name the prompt names');

    // The prompt copy is what the user acts on, so assert the strings the
    // install path actually renders.
    assert.match(userscriptSource, /Download Astra Downloader \(\.exe\)/,
        'install prompt must offer a "Download Astra Downloader (.exe)" action');
    assert.match(userscriptSource, /open the file to install/,
        'install prompt copy must direct the user to open the downloaded exe');
});

// ── 2. @description must not claim features the userscript does not ship ──

test('YTKit.user.js @description does not claim SponsorBlock', () => {
    // Header metadata: the userscript manager reads this line verbatim.
    const descMatch = userscriptSource.match(/^\/\/ @description\s+(.+)$/m);
    assert.ok(descMatch, 'YTKit.user.js must declare @description');
    assert.doesNotMatch(descMatch[1], /sponsorblock/i,
        'the userscript build has no SponsorBlock implementation (only DeArrow uses sponsor.ajay.app) — the description must not claim it');
});

// ── 3. Innertube transcript method: no placeholder API key ──

test('the Innertube transcript method fails over instead of sending a placeholder key', async () => {
    assert.doesNotMatch(userscriptSource, /REDACTED_GOOGLE_API_KEY/,
        'the poison literal guaranteed a 400 from youtubei/v1/player');

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
    const { MediaDLManager } = loadUserscriptDeclarations(
        ['USERSCRIPT_COMPANION_PORT_CATALOGUE', 'MediaDLManager'],
        { fetch: () => new Promise(() => {}), AbortController, setTimeout: () => 0, clearTimeout() {}, DebugManager: { log() {} } }
    );

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
