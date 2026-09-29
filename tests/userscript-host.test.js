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
