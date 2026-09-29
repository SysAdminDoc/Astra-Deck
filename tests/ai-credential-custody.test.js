'use strict';

// The custody claim: an AI provider credential is reachable only by the worker
// that talks to the provider, and it never lands anywhere a settings export, a
// content script, a request URL, or a provider response can carry it out.
//
// This was thirty-four regex reads of four files. A source pin proves a shape,
// and every one of these is a behaviour: whether a vault hands a key back to a
// status query, whether an endpoint validator refuses `?key=`, whether the
// legacy migration actually empties the settings object. So the vault, the
// validator and both migrations now RUN, against the real module.
//
// Four claims stay scans and say why at the assertion.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
    PROVIDER_POLICIES,
    createCredentialVault,
    normalizeProvider,
    validateProviderEndpoint,
} = require('../extension/core/credential-vault.js');
const { userscriptBundles } = require('./helpers/source');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const ytkit = read('extension/ytkit.js');
const background = read('extension/background.js');
const popup = read('extension/popup.js');
const popupHtml = read('extension/popup.html');
const schema = read('extension/core/settings-schema.js');
const defaults = JSON.parse(read('extension/default-settings.json'));
// The metadata block of the generated userscript. Its code is extension/
// files registered in the three @require libraries, so claims about code read
// extension/ and use userscriptBundles() to prove the userscript runs it.
const userscriptHeader = read('YTKit.user.js').split('// ==/UserScript==')[0];

const CREDENTIAL = 'sk-secret-value-0123456789';

/** A vault over in-memory stores, so a real store round-trip is observable. */
function vault() {
    const persisted = new Map();
    const session = new Map();
    const api = createCredentialVault({
        persistentStore: {
            get: async (provider) => persisted.get(provider) || '',
            set: async (provider, value) => { persisted.set(provider, value); },
            delete: async (provider) => { persisted.delete(provider); },
        },
        sessionStorage: {
            get: async (key) => (session.has(key) ? { [key]: session.get(key) } : {}),
            set: async (entries) => { for (const [k, v] of Object.entries(entries)) session.set(k, v); },
            remove: async (key) => { session.delete(key); },
        },
    });
    return { api, persisted, session };
}

async function rejects(promise) {
    try { await promise; } catch (error) { return error; }
    return null;
}

// ── the credential never appears in ordinary settings ───────────────────────

test('ordinary settings and imports cannot carry an AI credential', () => {
    assert.equal(Object.hasOwn(defaults, 'aiSummaryApiKey'), false);
    assert.doesNotMatch(schema, /key:\s*["']aiSummaryApiKey["']/);
});

/**
 * Slice one numbered migration out of a migration table and build it. The
 * tables are object properties, not declarations, so they cannot come through
 * loadDeclarationsFrom -- but a single migration is a self-contained function
 * of one argument, which is exactly what has to be run here.
 */
function migration(source, header, indent) {
    const at = source.indexOf(`\n${indent}${header}`);
    assert.ok(at > 0, `migration ${header} must exist`);
    const close = source.indexOf(`\n${indent}},`, at);
    assert.ok(close > at, `migration ${header} must close at its own indent`);
    const body = source.slice(at + 1 + indent.length, close + 1 + indent.length + 1);
    // `8: (s) => {…}` and `8(settings) {…}` are both valid inside an object.
    return new Function(`return ({ ${body} })[8];`)();
}

test('the settings migration empties the legacy key out of the object it is handed', () => {
    // Both copies of migration 8 run. A pin on `delete s.aiSummaryApiKey` says
    // the statement is written, not that the object handed on is clean.
    const copies = [
        ['extension', migration(ytkit, '8: (s) => {', ' '.repeat(12))],
        ['popup', migration(popup, '8(settings) {', ' '.repeat(4))],
    ];
    for (const [label, migrate] of copies) {
        assert.equal(typeof migrate, 'function', `${label}: migration 8 must be a function`);
        const carried = { aiSummaryApiKey: CREDENTIAL, aiSummaryProvider: 'openai', other: 1 };
        const out = migrate(carried) || carried;
        assert.equal(Object.hasOwn(out, 'aiSummaryApiKey'), false,
            `${label}: a settings object that still holds the key exports it on the next backup`);
        assert.equal(JSON.stringify(out).includes(CREDENTIAL), false,
            `${label}: and it must not survive under any other name`);
        assert.equal(out.other, 1, `${label}: unrelated settings are left alone`);
    }
});

test('the retired key is refused by name, not merely absent from the defaults', () => {
    // The retired list is a module-scope constant in the monolith; slice it and
    // build the real value rather than pattern-matching the literal.
    const at = ytkit.indexOf('const RETIRED_SETTING_KEYS');
    assert.ok(at > 0, 'the retired-key list must exist');
    const close = ytkit.indexOf(');', at);
    assert.ok(close > at);
    const retired = new Function(`${ytkit.slice(at, close + 2)} return RETIRED_SETTING_KEYS;`)();
    assert.ok(new Set(retired).has('aiSummaryApiKey'),
        'an import carrying the old key must be rejected on the way in, not just ignored');
});

// ── the vault ───────────────────────────────────────────────────────────────

test('a status query reports that a credential exists without handing it over', async () => {
    const { api } = vault();
    await api.set('openai', CREDENTIAL, { remember: true });

    const status = await api.status();
    assert.equal(status.openai.configured, true, 'the popup has to be able to show "configured"');
    assert.equal(status.openai.remembered, true);
    assert.equal(JSON.stringify(status).includes(CREDENTIAL), false,
        'status crosses to the popup; a credential in it is a credential in the popup');
    assert.equal(await api.get('openai'), CREDENTIAL, 'the worker itself still reads the real value');
});

test('a session-only credential is never written to durable storage', async () => {
    const { api, persisted, session } = vault();
    await api.set('openai', CREDENTIAL);

    assert.equal(persisted.size, 0, 'not remembering means not persisting');
    assert.equal(Array.from(session.values()).includes(CREDENTIAL), true,
        'but the worker must still be able to use it for this session');

    const status = await api.status();
    assert.equal(status.openai.configured, true);
    assert.equal(status.openai.remembered, false, 'and the popup must not claim it was remembered');
});

test('remembering, then not remembering, clears the durable copy', async () => {
    const { api, persisted } = vault();
    await api.set('openai', CREDENTIAL, { remember: true });
    assert.equal(persisted.get('openai'), CREDENTIAL);

    await api.set('openai', 'sk-second-value-abcdefghij');
    assert.equal(persisted.size, 0,
        'turning "remember" off must delete the key on disk, not leave the old one behind');
});

test('deleting a credential removes both copies', async () => {
    const { api, persisted, session } = vault();
    await api.set('openai', CREDENTIAL, { remember: true });
    await api.remove('openai');

    assert.equal(persisted.size, 0, 'the durable copy is gone');
    assert.equal(Array.from(session.values()).join('').includes(CREDENTIAL), false,
        'and so is the session copy, or the key keeps working after the user deleted it');
    assert.equal(await api.get('openai'), '');
    assert.equal((await api.status()).openai.configured, false);
});

test('a credential is refused if it could smuggle a header break or an unbounded body', async () => {
    const { api } = vault();
    for (const [value, why] of [
        ['', 'an empty credential'],
        ['   ', 'whitespace only'],
        [`${CREDENTIAL}\r\nX-Injected: 1`, 'a CRLF header injection'],
        [`${CREDENTIAL}\nmore`, 'an embedded newline'],
        [`${CREDENTIAL}\0`, 'an embedded NUL'],
        ['x'.repeat(4097), 'a 4097-character value'],
    ]) {
        assert.ok(await rejects(api.set('openai', value)), `${why} must be refused`);
    }
    assert.ok(await api.set('openai', 'x'.repeat(4096), { remember: true }),
        'and the boundary value itself is accepted');
});

test('the local provider holds no credential at all', async () => {
    const { api } = vault();
    assert.ok(await rejects(api.set('ollama', CREDENTIAL)), 'a local model needs no key');
    assert.ok(await rejects(api.remove('ollama')));
    assert.equal(await api.get('ollama'), '');

    const status = await api.status();
    assert.equal(status.ollama.credentialRequired, false);
    assert.equal(status.ollama.configured, true, 'so the popup must not nag for one');
});

test('an unknown provider name cannot open a slot in the vault', async () => {
    const { api, persisted } = vault();
    assert.equal(normalizeProvider('OpenAI'), 'openai', 'case and spacing are normalized');
    assert.equal(normalizeProvider('__proto__'), null);
    assert.equal(normalizeProvider('evil'), null);

    assert.ok(await rejects(api.set('evil', CREDENTIAL, { remember: true })));
    assert.equal(persisted.size, 0, 'nothing was stored under an unrecognized name');
    assert.equal(await api.get('evil'), '');
});

test('the legacy key is moved into the vault and struck from the settings', async () => {
    const { api, persisted } = vault();
    const result = await api.migrateLegacy({
        aiSummaryApiKey: CREDENTIAL,
        aiSummaryProvider: 'gemini',
        theme: 'dark',
    });

    assert.equal(result.migrated, true);
    assert.equal(result.provider, 'gemini');
    assert.equal(persisted.get('gemini'), CREDENTIAL, 'the key keeps working after the upgrade');
    assert.equal(Object.hasOwn(result.settings, 'aiSummaryApiKey'), false,
        'and leaves the settings object it came from');
    assert.equal(result.settings.theme, 'dark');

    // A settings blob with no key must still come back clean, and must not
    // create an empty vault entry.
    const empty = vault();
    const none = await empty.api.migrateLegacy({ aiSummaryApiKey: '   ', aiSummaryProvider: 'openai' });
    assert.equal(none.migrated, false);
    assert.equal(Object.hasOwn(none.settings, 'aiSummaryApiKey'), false);
    assert.equal(empty.persisted.size, 0);
});

// ── endpoint policy ─────────────────────────────────────────────────────────

test('a credential cannot be smuggled into the endpoint URL', () => {
    for (const query of [
        'key=leak', 'api_key=leak', 'api-key=leak', 'apikey=leak', 'token=leak',
        'access_token=leak', 'client_secret=leak', 'credential=leak', 'auth=leak',
        'authorization=leak', 'KEY=leak', 'Api_Key=leak',
    ]) {
        const endpoint = `${PROVIDER_POLICIES.gemini.defaultEndpoint}?${query}`;
        const error = (() => { try { validateProviderEndpoint('gemini', endpoint); return null; } catch (e) { return e; } })();
        assert.ok(error, `?${query} must be refused`);
        assert.match(error.message, /not allowed in AI endpoint URLs/);
    }

    // A harmless parameter still passes, or the validator is just a blocklist
    // on query strings.
    assert.ok(validateProviderEndpoint('gemini', `${PROVIDER_POLICIES.gemini.defaultEndpoint}?alt=sse`));
});

test('an endpoint cannot be pointed off the provider origin', () => {
    for (const [provider, endpoint, why] of [
        ['openai', 'https://evil.example/v1/chat/completions', 'another host'],
        ['openai', 'http://api.openai.com/v1/chat/completions', 'plain http'],
        ['openai', 'https://api.openai.com.evil.example/v1', 'a lookalike host'],
        ['gemini', PROVIDER_POLICIES.openai.defaultEndpoint, 'the other provider'],
        ['evil', undefined, 'an unsupported provider'],
    ]) {
        assert.throws(() => validateProviderEndpoint(provider, endpoint), `${why} must be refused`);
    }

    const validated = validateProviderEndpoint('openai', undefined);
    assert.equal(validated.provider, 'openai');
    assert.equal(validated.url, PROVIDER_POLICIES.openai.defaultEndpoint,
        'omitting the endpoint falls back to the policy default');
});

test('each remote provider carries the credential in a header, and the local one carries none', () => {
    assert.equal(PROVIDER_POLICIES.gemini.credentialHeader, 'x-goog-api-key');
    assert.equal(PROVIDER_POLICIES.openai.credentialHeader, 'Authorization');
    assert.equal(PROVIDER_POLICIES.openai.credentialPrefix, 'Bearer ');
    assert.equal(PROVIDER_POLICIES.ollama.credentialHeader, '',
        'a local model must not be sent a credential at all');
    for (const policy of Object.values(PROVIDER_POLICIES)) {
        assert.doesNotMatch(policy.defaultEndpoint, /[?&]/,
            'a default endpoint with a query string is a place for a credential to end up');
    }
});

// ── the request path ────────────────────────────────────────────────────────

test('the content script sends the request, never the credential', () => {
    // _callLLM lives inside the aiVideoSummary feature and reaches the worker
    // through chrome.runtime; the claim is about what its message does NOT
    // contain, which is exhaustive over a source region rather than over any
    // one call a fixture could make.
    const callStart = ytkit.indexOf('async _callLLM(prompt)');
    assert.notEqual(callStart, -1, 'anchor: _callLLM must exist or the slice is empty');
    // `async _run(options = {})`, not `async _run()`. The old terminator
    // matched nothing, indexOf returned -1, and the "block" was the whole rest
    // of the file -- every absence assertion below was scanning 12,000 lines
    // it had no business reading.
    const callEnd = ytkit.indexOf('async _run(', callStart);
    assert.ok(callEnd > callStart, 'and the window must hold real source');
    const block = ytkit.slice(callStart, callEnd);

    assert.match(block, /type:\s*'YTKIT_AI_SUMMARY_REQUEST'/);
    assert.match(block, /provider,\s*\n\s*endpoint,\s*\n\s*payload,/);
    assert.doesNotMatch(block, /aiSummaryApiKey/);
    assert.doesNotMatch(block, /\?key=/);
    assert.doesNotMatch(block, /encodeURIComponent\([^)]*credential/);

    // The userscript kept a copy of _callLLM and needed its own scan. It runs
    // this file now, so the block above is the userscript's request too.
    assert.ok(userscriptBundles('ytkit.js'),
        'the userscript must send its summary requests through extension/ytkit.js');
});

test('the worker attaches the credential by header and refuses to follow a redirect with it', () => {
    // Ordering and configuration inside performAiSummaryRequest, which needs
    // the vault, the provider allowlist and fetch to run end to end.
    assert.match(background, /headers\[validated\.policy\.credentialHeader\]/);
    assert.match(background, /redirect:\s*credential\s*\?\s*'manual'/,
        'a followed redirect re-sends the header to wherever it points');
    assert.match(background, /AI provider response contained credential material and was blocked/,
        'a provider that echoes the key back must not reach the page');
});

test('the popup credential field is write-only and its status carries no value', () => {
    assert.match(popupHtml, /id="ai-credential-input"[^>]*type="password"/);
    assert.doesNotMatch(popupHtml.match(/<input id="ai-credential-input"[\s\S]*?>/)?.[0] || '', /\svalue=/);
    assert.match(popup, /YTKIT_AI_CREDENTIAL_STATUS/);
    assert.match(popup, /YTKIT_AI_CREDENTIAL_SET/);
    assert.match(popup, /YTKIT_AI_CREDENTIAL_DELETE/);
    assert.match(popup, /aiCredentialInput\.value\s*=\s*''/);

    // Both needles, and the end searched FROM the start. Searching the end
    // needle from 0 meant a dispatch reorder would produce an empty slice, and
    // doesNotMatch on an empty string passes while asserting nothing.
    const statusStart = background.indexOf("if (msg.type === 'YTKIT_AI_CREDENTIAL_STATUS'");
    assert.notEqual(statusStart, -1, 'anchor: credential-status dispatch must exist');
    const statusEnd = background.indexOf("if (msg.type === 'YTKIT_AI_SUMMARY_REQUEST'", statusStart);
    assert.ok(statusEnd > statusStart,
        'the summary-request dispatch must follow the credential-status one, or this window is empty');
    const statusBlock = background.slice(statusStart, statusEnd);
    assert.ok(statusBlock.length > 100, 'the credential-status window must hold real source');
    assert.doesNotMatch(statusBlock, /credential:\s*await/);
});

test('the userscript ships the grants and the wiring its vault depends on', () => {
    // Metadata and bundle composition: there is no runtime here to ask.
    assert.match(userscriptHeader, /@grant\s+GM_deleteValue/,
        'without the grant the manager silently drops the delete');
    // The vault, the worker that owns it, and the feature that asks the
    // worker for a summary. Where the vault then keeps the key is a runtime
    // question, answered by the boot test below.
    for (const file of ['core/credential-vault.js', 'background.js', 'ytkit.js']) {
        assert.ok(userscriptBundles(file), `the userscript must run the extension's ${file}`);
    }
});

// ── the generated userscript, booted ────────────────────────────────────────

/**
 * Boots the four generated files in the order a manager loads them, over fake
 * GM storage and a fake page-origin IndexedDB that records every write. The
 * host's own timers are unref'd so a feature interval cannot hold the test
 * process open once the assertions are done.
 */
async function bootUserscriptWithLegacyCredential(credential) {
    const gm = new Map([['ytSuiteSettings', { aiSummaryApiKey: credential, aiSummaryProvider: 'openai' }]]);
    const pageOriginWrites = [];
    const databases = new Map();
    const later = (fn) => setTimeout(fn, 0);
    const pageIndexedDB = {
        open(name) {
            const request = {};
            later(() => {
                const upgrade = !databases.has(name);
                if (upgrade) databases.set(name, new Map());
                const stores = databases.get(name);
                request.result = {
                    objectStoreNames: { contains: (store) => stores.has(store) },
                    createObjectStore: (store) => { stores.set(store, new Map()); },
                    transaction(storeName) {
                        const records = stores.get(storeName);
                        const op = (fn) => { const r = {}; later(() => { r.result = fn(); r.onsuccess?.(); }); return r; };
                        return {
                            objectStore: () => ({
                                get: (key) => op(() => records.get(key)),
                                put: (value, key) => {
                                    pageOriginWrites.push({ database: name, store: storeName, key, value });
                                    return op(() => { records.set(key, value); });
                                },
                                delete: (key) => op(() => { records.delete(key); }),
                            }),
                        };
                    },
                    close() {},
                };
                if (upgrade) request.onupgradeneeded?.();
                request.onsuccess?.();
            });
            return request;
        },
    };
    const unref = (handle) => { handle?.unref?.(); return handle; };
    const errors = [];
    const page = {
        console: { log() {}, info() {}, debug() {}, warn() {}, error: (...args) => errors.push(args.map(String).join(' ')) },
        setTimeout: (...args) => unref(setTimeout(...args)),
        setInterval: (...args) => unref(setInterval(...args)),
        clearTimeout, clearInterval, queueMicrotask,
        URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, structuredClone,
        crypto: require('node:crypto').webcrypto, performance,
        location: {
            href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', hostname: 'www.youtube.com',
            pathname: '/watch', origin: 'https://www.youtube.com', search: '?v=dQw4w9WgXcQ',
        },
        // Still loading: the host starts the background and waits for the DOM,
        // which is all this test needs to run.
        document: { readyState: 'loading', documentElement: null, addEventListener() {} },
        MutationObserver: class { observe() {} disconnect() {} },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
        Event: class { constructor(type) { this.type = type; } },
        addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
        indexedDB: pageIndexedDB,
        GM_getValue: (key, fallback) => (gm.has(key) ? structuredClone(gm.get(key)) : fallback),
        GM_setValue: (key, value) => { gm.set(key, structuredClone(value)); },
        GM_deleteValue: (key) => { gm.delete(key); },
        GM_listValues: () => [...gm.keys()],
        GM_addValueChangeListener: () => 1,
        GM_info: { scriptHandler: 'test', version: '0' },
    };
    page.window = page; page.self = page; page.top = page; page.globalThis = page;
    vm.createContext(page);
    for (const file of ['YTKit-core.user.js', 'YTKit-features.user.js', 'YTKit-app.user.js', 'YTKit.user.js']) {
        vm.runInContext(read(file), page, { filename: file });
    }
    const settings = () => gm.get('ytSuiteSettings') || {};
    // The migration strips the legacy setting only after the vault write has
    // settled, so its disappearance is the signal that the write happened.
    for (let waited = 0; Object.hasOwn(settings(), 'aiSummaryApiKey') && waited < 3000; waited += 20) {
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return { errors, settings, gm, pageOriginWrites, host: page.__astraDeckUserscript };
}

test('the userscript keeps a migrated credential out of storage the page can read', async () => {
    // The extension's vault writes to the extension origin's IndexedDB, which
    // no web page can open. The generated userscript runs background.js inside
    // the tab, and the host hands it the tab's own indexedDB, so the same vault
    // writes to the youtube.com origin: readable by YouTube's scripts and by
    // anything else that runs there. The hand-written userscript kept each
    // provider key under a manager-isolated GM key that page script cannot
    // reach, so this is custody the userscript used to have.
    const run = await bootUserscriptWithLegacyCredential(CREDENTIAL);
    assert.deepEqual(run.errors, [], 'the generated userscript must boot cleanly');
    assert.equal(run.host?.backgroundStarted, true, 'the in-tab worker must have started');
    assert.equal(Object.hasOwn(run.settings(), 'aiSummaryApiKey'), false,
        'the legacy setting must still leave the settings object');
    const leaked = run.pageOriginWrites
        .filter((write) => JSON.stringify(write.value).includes(CREDENTIAL))
        .map((write) => `${write.database}/${write.store}/${write.key}`);
    assert.deepEqual(leaked, [],
        'a provider credential must never be written to the IndexedDB of the youtube.com origin');
    assert.ok([...run.gm.values()].some((value) => JSON.stringify(value).includes(CREDENTIAL)),
        'and the migrated key must survive in manager-isolated storage');
});
