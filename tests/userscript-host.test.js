'use strict';

// userscript/host.js behavior, run from the generated YTKit.user.js in a vm
// with stub modules (the same runner the symbols gate uses).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { captureAdapters } = require('../scripts/check-userscript-symbols');
const { parseUserscriptBuild } = require('../sync-userscript');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'YTKit.user.js'), 'utf8');
const build = parseUserscriptBuild(mainSource);
const INSTALLED = '__astraDeck.installedVersion';

function boot(values) {
    return captureAdapters(mainSource, build, values).values;
}

test('an upgrade from the old userscript keeps Return YouTube Dislike on', () => {
    const values = boot({ ytSuiteSettings: { returnYoutubeDislike: true, hideSidebar: false } });
    const settings = values.get('ytSuiteSettings');
    assert.equal(settings.returnDislike, true);
    assert.equal(Object.hasOwn(settings, 'returnYoutubeDislike'), false);
    assert.equal(settings.hideSidebar, false, 'other settings are left alone');
});

test('the rename never overwrites a value already stored under the new key', () => {
    const values = boot({ ytSuiteSettings: { returnYoutubeDislike: true, returnDislike: false } });
    assert.equal(values.get('ytSuiteSettings').returnDislike, false);
    assert.equal(Object.hasOwn(values.get('ytSuiteSettings'), 'returnYoutubeDislike'), false);
});

test('the rename runs only on the first run over an old install', () => {
    const stored = { returnYoutubeDislike: true };
    const values = boot({ [INSTALLED]: '4.92.0', ytSuiteSettings: stored });
    assert.deepEqual(values.get('ytSuiteSettings'), { returnYoutubeDislike: true });
});

test('a fresh install has nothing to rename', () => {
    const values = boot({});
    assert.equal(values.has('ytSuiteSettings'), false);
});

const settle = async (drain) => {
    for (let round = 0; round < 5; round += 1) {
        drain();
        await new Promise((resolve) => setImmediate(resolve));
    }
};

test('content code gets no storage.session, and never hears a session change', async () => {
    const heard = [];
    const run = captureAdapters(mainSource, build, {}, {
        modules: {
            [build.modules.app]: (globalThisArg, selfArg, windowArg, chrome) => {
                chrome.storage.onChanged.addListener((changes, area) => heard.push({ keys: Object.keys(changes), area }));
            },
        },
    });
    await settle(run.drain);
    const { content, background } = run.captured;
    assert.equal(content.storage.session, undefined, 'Chrome keeps storage.session from content scripts');
    assert.equal(typeof background.storage.session.set, 'function');
    heard.length = 0;
    await background.storage.session.set({ 'ytkit-credential-session:openai': 'sk-session' });
    await background.storage.local.set({ ordinary: 1 });
    await settle(run.drain);
    assert.deepEqual(JSON.parse(JSON.stringify(heard)), [{ keys: ['ordinary'], area: 'local' }]);
});

test('AI keys go to the manager storage, not the page IndexedDB, and old userscript keys still read', async () => {
    let vaultOptions = null;
    const run = captureAdapters(mainSource, build, { 'ytkit:ai-credential:anthropic': 'sk-old-userscript' }, {
        modules: {
            'core/credential-vault.js': (globalThisArg) => {
                const core = globalThisArg.YTKitCore || (globalThisArg.YTKitCore = {});
                core.createCredentialVault = (options) => { vaultOptions = options; return {}; };
            },
            [build.modules.background]: (globalThisArg, selfArg, windowArg, chrome) => {
                globalThisArg.YTKitCore.createCredentialVault({ sessionStorage: chrome.storage.session });
            },
        },
    });
    assert.ok(vaultOptions, 'background.js built its vault');
    assert.equal(typeof vaultOptions.sessionStorage.get, 'function', 'the options background.js passed are kept');
    const store = vaultOptions.persistentStore;
    assert.ok(store, 'the host hands the vault a persistent store, so it never falls back to IndexedDB');
    assert.equal(await store.get('anthropic'), 'sk-old-userscript');
    await store.set('openai', 'sk-new');
    assert.equal(run.values.get('ytkit:ai-credential:openai'), 'sk-new');
    await store.delete('openai');
    assert.equal(run.values.has('ytkit:ai-credential:openai'), false);
});

test('the AI provider key menu command saves through the background as a trusted sender', async () => {
    const received = [];
    const run = captureAdapters(mainSource, build, { ytSuiteSettings: { aiSummaryProvider: 'gemini' } }, {
        prompts: ['anthropic', ' sk-menu '],
        modules: {
            [build.modules.background]: (globalThisArg, selfArg, windowArg, chrome) => {
                chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                    if (message.type.startsWith('YTKIT_AI_CREDENTIAL')) received.push({ message, sender });
                    sendResponse({ ok: true });
                    return false;
                });
            },
        },
    });
    const command = run.menu.find((entry) => entry.label === build.credentialMenuLabel);
    assert.ok(command, 'the manager menu offers the AI provider key command');
    command.run();
    await settle(run.drain);
    assert.equal(received.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(received[0].message)), { type: 'YTKIT_AI_CREDENTIAL_SET', provider: 'anthropic', credential: ' sk-menu ', remember: true });
    assert.equal(received[0].sender.tab, undefined, 'the background only accepts keys from a sender with no tab');
});

test('an empty key in the menu command removes the saved one', async () => {
    const received = [];
    const run = captureAdapters(mainSource, build, {}, {
        prompts: ['openai', '   '],
        modules: {
            [build.modules.background]: (globalThisArg, selfArg, windowArg, chrome) => {
                chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                    if (message.type.startsWith('YTKIT_AI_CREDENTIAL')) received.push(message);
                    sendResponse({ ok: true });
                    return false;
                });
            },
        },
    });
    run.menu.find((entry) => entry.label === build.credentialMenuLabel).run();
    await settle(run.drain);
    assert.deepEqual(JSON.parse(JSON.stringify(received)), [{ type: 'YTKIT_AI_CREDENTIAL_DELETE', provider: 'openai' }]);
});

// Between releases the loader on main pins the last release's libraries. When
// main had two feature modules v4.97.0's libraries didn't carry, every fresh
// install stopped at the library check and ran nothing. Feature modules and
// the early switches are optional now; what the host boots on is not.
test('a library without a newer feature module or the early switches still boots, and lists what it skipped', async () => {
    const newer = [build.optionalModules.find((modulePath) => modulePath.startsWith('features/')), ...build.modules.earlyStart];
    assert.ok(newer[0] && build.modules.earlyStart.length, 'the build lists optional modules');
    const run = captureAdapters(mainSource, build, {}, { omit: newer });
    await settle(run.drain);
    assert.notEqual(run.state.phase, 'failed');
    assert.deepEqual([...run.state.missingOptionalModules].sort(), [...newer].sort());
    assert.ok(run.captured.content, 'the app still ran');
    // The spread copies the vm-made array into this realm, so deepEqual
    // compares contents rather than Array prototypes.
    assert.deepEqual([...run.state.errors].map((entry) => entry.stage)
        .filter((stage) => stage === 'library check' || stage === 'early switches'), [], 'skipping is not an error');
});

test('a library without a module the host boots on stops at the library check', () => {
    const run = captureAdapters(mainSource, build, {}, { omit: [build.modules.app] });
    assert.equal(run.state.phase, 'failed');
    const message = run.state.errors.map((entry) => entry.message).join('\n');
    assert.match(message, /did not load \(missing ytkit\.js\)/);
    assert.equal(run.captured.content, undefined);
    // Where to look has to be where the libraries come from. It kept naming
    // raw GitHub for a while after they moved to jsDelivr.
    const hosts = new Set([...mainSource.matchAll(/^\/\/ @require\s+https:\/\/([^/]+)\//gm)].map((match) => match[1]));
    assert.deepEqual([...hosts], ['cdn.jsdelivr.net']);
    assert.ok(message.includes('check that cdn.jsdelivr.net is reachable'), message);
});

// The manifest runs core/early-switches.js at document_start after the MAIN
// group, and it imports the channel module. The host has no import(), so it
// runs the channel from the registry first.
test('the early switches run at document start after the page world, with the channel module first', async () => {
    const order = [];
    const record = (name) => () => { order.push(name); };
    const run = captureAdapters(mainSource, build, {}, {
        modules: {
            [build.modules.bridgeToken]: record('token'),
            [build.modules.bridgeChannel]: record('channel'),
            ...Object.fromEntries(build.modules.earlyStart.map((modulePath) => [modulePath, record(modulePath)])),
            [build.modules.app]: record('app'),
        },
    });
    const documentStart = ['token', 'channel', ...build.modules.earlyStart];
    assert.deepEqual(order.slice(0, documentStart.length), documentStart, 'all of it before the idle runtime');
    await settle(run.drain);
    assert.equal(order.at(-1), 'app');
    // The idle runtime runs the channel module again in its foundation pass;
    // the module's own guard keeps the writer the early pass made.
    assert.ok(order.indexOf('app') > order.lastIndexOf(build.modules.earlyStart.at(-1)),
        'the app runs after the early switches');
    assert.deepEqual(build.modules.earlyStart, ['core/early-switches.js']);
});

// ── downloads ──

const SETUP_URL = 'https://github.com/SysAdminDoc/AstraDownloader/releases/latest/download/AstraDownloader.exe';

function downloadHost(answer, grants) {
    const details = [];
    const run = captureAdapters(mainSource, build, {}, {
        grants: grants || { GM_download: (request) => { details.push(request); answer?.(request); } },
    });
    const { downloads } = run.captured.background;
    const changes = [];
    downloads.onChanged.addListener((delta) => changes.push(JSON.parse(JSON.stringify(delta))));
    return { run, downloads, details, changes };
}

async function isPending(promise) {
    const marker = {};
    const seen = await Promise.race([promise.then(() => 'settled', () => 'settled'), new Promise((resolve) => setImmediate(() => resolve(marker)))]);
    return seen === marker;
}

test('a download the manager refuses fails instead of reading as saved', async () => {
    // Tampermonkey's default whitelist answers this for an .exe, in 6 ms measured.
    const host = downloadHost((request) => request.onerror({ error: 'not_whitelisted' }));
    await assert.rejects(host.downloads.download({ url: SETUP_URL, filename: 'AstraDownloader.exe', saveAs: false }), /not_whitelisted/);
    assert.equal(host.details[0].url, SETUP_URL);
    assert.equal(host.details[0].name, 'AstraDownloader.exe');
    assert.equal(host.details[0].saveAs, false);
    await settle(host.run.drain);
    assert.deepEqual(host.changes, [{ id: 1, state: { previous: 'in_progress', current: 'interrupted' }, error: { current: 'not_whitelisted' } }]);
});

test('a download the manager gives up on fails too', async () => {
    const host = downloadHost((request) => request.ontimeout());
    await assert.rejects(host.downloads.download({ url: SETUP_URL }), /TIMEOUT/);
    await settle(host.run.drain);
    assert.equal(host.changes[0].state.current, 'interrupted');
    assert.equal(host.changes[0].error.current, 'TIMEOUT');
});

test('a refusal with no reason still fails, with a reason of its own', async () => {
    const host = downloadHost((request) => request.onerror());
    await assert.rejects(host.downloads.download({ url: SETUP_URL }), /FAILED/);
});

test('a download waits for the manager, then counts as started on its first progress', async () => {
    const host = downloadHost();
    const started = host.downloads.download({ url: SETUP_URL });
    assert.equal(await isPending(started), true, 'no answer from the manager yet, so nothing is known about the download');
    host.details[0].onprogress({ loaded: 1 });
    assert.equal(await started, 1);
    assert.deepEqual(host.changes, []);
    host.details[0].onload();
    await settle(host.run.drain);
    assert.deepEqual(host.changes, [{ id: 1, state: { previous: 'in_progress', current: 'complete' } }]);
});

test('a download that finishes in its first answer hands over the id before reporting the end', async () => {
    const order = [];
    const host = downloadHost((request) => request.onload());
    host.downloads.onChanged.addListener(() => order.push('changed'));
    const id = await host.downloads.download({ url: SETUP_URL });
    order.push(`id ${id}`);
    await settle(host.run.drain);
    assert.deepEqual(order, ['id 1', 'changed'], 'a listener matching on the id would miss an end reported first');
});

test('a manager sitting on its own prompt cannot hang the caller, and its later refusal still reports', async () => {
    const host = downloadHost();
    const started = host.downloads.download({ url: SETUP_URL });
    assert.equal(await isPending(started), true);
    host.run.drain();
    assert.equal(await started, 1, 'the wait ran out, so it counts as started');
    host.details[0].onerror({ error: 'not_permitted' });
    await settle(host.run.drain);
    assert.equal(host.changes[0].error.current, 'not_permitted');
});

test('a manager without GM_download opens the file in a tab', async () => {
    const opened = [];
    const host = downloadHost(null, { GM_download: undefined, GM_openInTab: (url) => opened.push(url) });
    assert.equal(await host.downloads.download({ url: SETUP_URL }), 1);
    assert.deepEqual(opened, [SETUP_URL]);
});
