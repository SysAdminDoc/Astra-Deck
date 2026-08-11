'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { createSettingsMutationController } = require('../extension/core/settings-controller');
const {
    createCredentialVault,
    validateProviderEndpoint
} = require('../extension/core/credential-vault');
// background.js pulls this in through importScripts in the browser. The vm
// context has no importScripts, so hand it the real module rather than a stub:
// the filter-list door is only as good as these rules.
const remoteListScope = require('../extension/core/remote-list-scope');

const repoRoot = path.join(__dirname, '..');
const backgroundSource = fs.readFileSync(path.join(repoRoot, 'extension', 'background.js'), 'utf8');

function loadBackground({
    fetchImpl,
    downloadsDownloadImpl,
    sessionGetImpl,
    sessionSetImpl,
    optionalHostPermissions = [],
    permissionsContainsImpl,
    permissionsRequestImpl,
    initialSettings = {},
    apiNamespace = 'chrome'
} = {}) {
    let messageListener = null;
    let installedListener = null;
    let settingsState = { ...initialSettings };
    const sessionState = {};
    // Generic key/value half of storage.local, for keys that are not the
    // settings bag (onboarding sentinels and friends).
    const localState = {};
    const badgeCalls = [];
    const persistentCredentials = new Map();
    const persistentStore = {
        async get(provider) { return persistentCredentials.get(provider); },
        async set(provider, value) { persistentCredentials.set(provider, value); },
        async delete(provider) { persistentCredentials.delete(provider); }
    };
    const chrome = {
        commands: {
            onCommand: {
                addListener() {}
            }
        },
        tabs: {
            query: async () => [],
            sendMessage() {},
            create(...args) {
                if (apiNamespace === 'browser' && args.length !== 1) {
                    throw new TypeError('Firefox tabs.create does not accept a callback');
                }
                return Promise.resolve({ id: 1 });
            }
        },
        runtime: {
            id: 'astra-test-extension',
            lastError: null,
            getManifest: () => ({ optional_host_permissions: optionalHostPermissions }),
            openOptionsPage: async () => {},
            onMessage: {
                addListener(listener) {
                    messageListener = listener;
                }
            },
            onInstalled: {
                addListener(listener) {
                    installedListener = listener;
                }
            }
        },
        action: {
            async setBadgeText(details) { badgeCalls.push({ method: 'setBadgeText', details }); },
            async setBadgeBackgroundColor(details) { badgeCalls.push({ method: 'setBadgeBackgroundColor', details }); }
        },
        downloads: {
            download: downloadsDownloadImpl || ((opts, callback) => callback(1)),
            // Chromium's downloads.show is a void API with NO callback
            // parameter and no promise form. Mirror that strictly so the
            // wrapper's callback-shaped first attempt throws, exercising
            // the bare-retry path (regression: successful reveals were
            // logged as reveal-failed).
            show(...args) {
                if (args.length !== 1 || typeof args[0] !== 'number') {
                    throw new TypeError('downloads.show takes a single numeric downloadId');
                }
            }
        },
        permissions: {
            contains: permissionsContainsImpl || ((_payload, callback) => callback(true)),
            request: permissionsRequestImpl || ((_payload, callback) => callback(true))
        },
        cookies: {
            getAll: async () => []
        },
        storage: {
            local: {
                async get(key) {
                    // An array request is a real multi-key read; the legacy
                    // string form still answers with the settings bag so the
                    // existing tests are unaffected.
                    if (Array.isArray(key)) {
                        const out = {};
                        for (const name of key) {
                            if (Object.hasOwn(localState, name)) out[name] = localState[name];
                        }
                        return out;
                    }
                    return { [key]: settingsState };
                },
                async set(entries) {
                    if (entries.ytSuiteSettings) settingsState = { ...entries.ytSuiteSettings };
                    Object.assign(localState, entries);
                },
                async remove(keys) {
                    for (const name of (Array.isArray(keys) ? keys : [keys])) delete localState[name];
                }
            },
            session: {
                async get(key) {
                    if (sessionGetImpl) return sessionGetImpl(key, sessionState);
                    return { [key]: sessionState[key] };
                },
                async set(entries) {
                    if (sessionSetImpl) return sessionSetImpl(entries, sessionState);
                    Object.assign(sessionState, entries);
                },
                async remove(key) { delete sessionState[key]; }
            }
        }
    };

    const context = {
        AbortController,
        ArrayBuffer,
        Blob,
        FormData,
        Headers,
        Response,
        TextDecoder,
        TextEncoder,
        URL,
        URLSearchParams,
        clearTimeout,
        console,
        fetch: fetchImpl || (async () => new Response('', {
            status: 200,
            headers: { 'content-length': '0' }
        })),
        globalThis: null,
        YTKitCore: {
            createSettingsMutationController,
            createCredentialVault: (options) => createCredentialVault({ ...options, persistentStore }),
            validateAiProviderEndpoint: validateProviderEndpoint,
            REMOTE_LIST_HOST_PATTERN: remoteListScope.REMOTE_LIST_HOST_PATTERN,
            describeRemoteListUrl: remoteListScope.describeRemoteListUrl,
            remoteListOriginPattern: remoteListScope.remoteListOriginPattern
        },
        setTimeout
    };
    context[apiNamespace] = chrome;
    context.globalThis = context;

    vm.createContext(context);
    vm.runInContext(backgroundSource, context, { filename: 'extension/background.js' });

    return {
        chrome,
        context,
        messageListener,
        installedListener,
        badgeCalls,
        getLocal: () => localState,
        getSettings: () => settingsState,
        persistentCredentials
    };
}

function dispatchMessage(listener, message, sender = {
    id: 'astra-test-extension',
    tab: { id: 9, windowId: 1, index: 0 }
}) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('Timed out waiting for sendResponse')), 1000);
        const sendResponse = (response) => {
            clearTimeout(timeoutId);
            resolve(response);
        };

        try {
            listener(message, sender, sendResponse);
        } catch (error) {
            clearTimeout(timeoutId);
            reject(error);
        }
    });
}

test('background serializes schema-aware setting mutations behind one message contract', async () => {
    const { messageListener, getSettings } = loadBackground({
        initialSettings: { safeStoreProfile: true, githubFullProfile: false, removeAllShorts: false }
    });

    const [saved, patched] = await Promise.all([
        dispatchMessage(messageListener, {
            type: 'YTKIT_MUTATE_SETTING',
            key: 'removeAllShorts',
            value: true,
            source: 'popup'
        }),
        dispatchMessage(messageListener, {
            type: 'YTKIT_MUTATE_SETTINGS',
            changes: { hideCommentComposer: true },
            source: 'in-page'
        })
    ]);
    const rejected = await dispatchMessage(messageListener, {
        type: 'YTKIT_MUTATE_SETTING',
        key: 'notASetting',
        value: true,
        source: 'sidepanel'
    });
    const rejectedSender = await dispatchMessage(messageListener, {
        type: 'YTKIT_MUTATE_SETTING',
        key: 'removeAllShorts',
        value: false,
        source: 'external'
    }, { id: 'another-extension' });

    assert.equal(saved.ok, true);
    assert.equal(saved.persisted, true);
    assert.equal(saved.previous, false);
    assert.equal(saved.value, true);
    assert.equal(patched.ok, true);
    assert.equal(getSettings().removeAllShorts, true);
    assert.equal(getSettings().hideCommentComposer, true);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.persisted, false);
    assert.equal(rejected.error.code, 'UNKNOWN_SETTING');
    assert.equal(rejectedSender.error, 'Sender rejected.');
    assert.equal(getSettings().notASetting, undefined);
    assert.equal(getSettings().removeAllShorts, true);
});

test('background resolves a Promise-only Firefox namespace without a chrome global', async () => {
    const { context, messageListener } = loadBackground({ apiNamespace: 'browser' });
    assert.equal(context.chrome, undefined);
    assert.equal(context.browser.runtime.id, 'astra-test-extension');

    const response = await dispatchMessage(messageListener, {
        type: 'OPEN_URL',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        active: false
    });
    assert.equal(response.tabId, 1);
});

test('background EXT_FETCH preserves empty-string request bodies', async () => {
    let capturedOptions = null;
    const { messageListener } = loadBackground({
        fetchImpl: async (_url, options) => {
            capturedOptions = options;
            return new Response('', {
                status: 200,
                headers: { 'content-length': '0' }
            });
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: {
            method: 'POST',
            url: 'https://www.youtube.com/api/test',
            headers: { 'Content-Type': 'text/plain' },
            data: ''
        }
    });

    assert.equal(capturedOptions?.body, '');
    assert.equal(response.status, 200);
    assert.equal(response.responseText, '');
});

test('background EXT_FETCH preserves JSON request bodies across Chrome message serialization', async () => {
    let capturedOptions = null;
    const { messageListener } = loadBackground({
        fetchImpl: async (_url, options) => {
            capturedOptions = options;
            return new Response('{}', {
                status: 200,
                headers: { 'content-length': '2' }
            });
        }
    });
    const message = JSON.parse(JSON.stringify({
        type: 'EXT_FETCH',
        details: {
            method: 'POST',
            url: 'https://www.youtube.com/api/test',
            headers: { 'Content-Type': 'application/json' },
            data: { query: 'transcript', limit: 25 }
        }
    }));

    const response = await dispatchMessage(messageListener, message);

    assert.equal(capturedOptions?.body, '{"query":"transcript","limit":25}');
    assert.equal(capturedOptions?.headers?.['Content-Type'], 'application/json');
    assert.equal(response.status, 200);
});

test('background EXT_FETCH rejects binary bodies instead of silently corrupting them', async () => {
    let fetchCalled = false;
    const { messageListener } = loadBackground({
        fetchImpl: async () => {
            fetchCalled = true;
            return new Response('', { status: 200 });
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: {
            method: 'POST',
            url: 'https://www.youtube.com/api/test',
            data: new Uint8Array([1, 2, 3])
        }
    });

    assert.equal(fetchCalled, false);
    assert.match(response.error, /Binary and form-data request bodies are not supported/);
});

test('background EXT_FETCH rejects unsupported methods instead of downgrading to GET', async () => {
    let fetchCalled = false;
    const { messageListener } = loadBackground({
        fetchImpl: async () => {
            fetchCalled = true;
            return new Response('', { status: 200 });
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: {
            method: 'POStt',
            url: 'https://www.youtube.com/api/test',
            data: 'must-not-be-sent-as-get'
        }
    });

    assert.equal(fetchCalled, false);
    assert.match(response.error, /Unsupported fetch method: POSTT/);
});

test('background EXT_FETCH rejects oversized request bodies before fetch', async () => {
    let fetchCalled = false;
    const { messageListener } = loadBackground({
        fetchImpl: async () => {
            fetchCalled = true;
            return new Response('', { status: 200 });
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: {
            method: 'POST',
            url: 'https://www.youtube.com/api/test',
            data: 'x'.repeat((2 * 1024 * 1024) + 1)
        }
    });

    assert.equal(fetchCalled, false);
    assert.match(response.error, /Request body too large/);
});

test('background EXT_FETCH rejects unserializable bodies before arming fetch', async () => {
    let fetchCalled = false;
    const cyclic = {};
    cyclic.self = cyclic;
    const { messageListener } = loadBackground({
        fetchImpl: async () => {
            fetchCalled = true;
            return new Response('', { status: 200 });
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: {
            method: 'POST',
            url: 'https://www.youtube.com/api/test',
            data: cyclic
        }
    });

    assert.equal(fetchCalled, false);
    assert.match(response.error, /could not be serialized/);
});

test('background EXT_FETCH uses manual redirect for credentialed (cookie-bearing) requests', async () => {
    let capturedOptions = null;
    const { messageListener } = loadBackground({
        fetchImpl: async (_url, options) => {
            capturedOptions = options;
            return new Response('{}', { status: 200, headers: { 'content-length': '2' } });
        }
    });

    await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: { method: 'GET', url: 'https://www.youtube.com/api/test' }
    });

    // youtube.com is a credentialed origin — redirects must not auto-follow.
    assert.equal(capturedOptions?.credentials, 'include');
    assert.equal(capturedOptions?.redirect, 'manual');
});

test('background EXT_FETCH honors a caller credentials omit downgrade on a cookie origin', async () => {
    let capturedOptions = null;
    const { messageListener } = loadBackground({
        fetchImpl: async (_url, options) => {
            capturedOptions = options;
            return new Response('{}', { status: 200, headers: { 'content-length': '2' } });
        }
    });

    await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: { method: 'GET', url: 'https://www.youtube.com/youtubei/v1/player', credentials: 'omit' }
    });

    // The caller asked for an anonymous probe — the allowlist must not
    // re-attach the YouTube session cookies.
    assert.equal(capturedOptions?.credentials, 'omit');
});

test('background EXT_FETCH never upgrades a non-cookie origin to credentials include', async () => {
    let capturedOptions = null;
    const { messageListener } = loadBackground({
        fetchImpl: async (_url, options) => {
            capturedOptions = options;
            return new Response('{}', { status: 200, headers: { 'content-length': '2' } });
        }
    });

    await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: { method: 'GET', url: 'https://sponsor.ajay.app/api/skipSegments', credentials: 'include' }
    });

    assert.equal(capturedOptions?.credentials, 'omit');
});

test('background EXT_FETCH blocks an opaqueredirect on a credentialed request', async () => {
    const { messageListener } = loadBackground({
        fetchImpl: async () => ({
            type: 'opaqueredirect',
            // Real opaque redirect responses do not expose the target URL.
            url: '',
            status: 0,
            headers: new Headers()
        })
    });

    const response = await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: { method: 'GET', url: 'https://www.youtube.com/api/test' }
    });

    assert.match(response.error, /Blocked redirect/);
});

test('background EXT_FETCH forces manual redirect when a BYO x-api-key header is present', async () => {
    let capturedOptions = null;
    const { messageListener } = loadBackground({
        fetchImpl: async (_url, options) => {
            capturedOptions = options;
            return new Response('{}', { status: 200, headers: { 'content-length': '2' } });
        }
    });

    await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: {
            method: 'POST',
            url: 'https://api.anthropic.com/v1/messages',
            data: { model: 'x' },
            headers: { 'x-api-key': 'sk-secret', 'anthropic-version': '2023-06-01' }
        }
    });

    // api.anthropic.com is not a cookie origin, but the key header must still
    // block auto-following cross-origin redirects that would leak the key.
    assert.equal(capturedOptions?.redirect, 'manual');
    assert.equal(capturedOptions?.headers?.['x-api-key'], 'sk-secret');
});

test('background EXT_FETCH strips BYO key headers when the origin is not an allowed AI provider', async () => {
    let capturedOptions = null;
    const { messageListener } = loadBackground({
        fetchImpl: async (_url, options) => {
            capturedOptions = options;
            return new Response('{}', { status: 200, headers: { 'content-length': '2' } });
        }
    });

    await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: {
            method: 'GET',
            url: 'https://sponsor.ajay.app/api/skipSegments',
            headers: { 'x-api-key': 'sk-secret' }
        }
    });

    assert.equal(capturedOptions?.headers?.['x-api-key'], undefined);
});

test('background EXT_FETCH uses manual redirects for non-credentialed requests too', async () => {
    let capturedOptions = null;
    const { messageListener } = loadBackground({
        fetchImpl: async (_url, options) => {
            capturedOptions = options;
            return new Response('{}', { status: 200, headers: { 'content-length': '2' } });
        }
    });

    await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: { method: 'GET', url: 'https://sponsor.ajay.app/api/skipSegments' }
    });

    assert.equal(capturedOptions?.credentials, 'omit');
    // Anonymous requests still need manual redirects so every Location can be
    // checked before the next hop is contacted.
    assert.equal(capturedOptions?.redirect, 'manual');
});

test('background EXT_FETCH validates each redirect hop before contacting it', async () => {
    const calls = [];
    const { messageListener } = loadBackground({
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            if (calls.length === 1) {
                return new Response(null, {
                    status: 302,
                    headers: { location: 'https://sponsor.ajay.app/allowed' }
                });
            }
            return new Response(null, {
                status: 302,
                headers: { location: 'https://attacker.example/internal' }
            });
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: { method: 'GET', url: 'https://sponsor.ajay.app/api/skipSegments' }
    });

    assert.match(response.error, /Redirect URL not in allowlist/);
    assert.deepEqual(calls.map((call) => call.url), [
        'https://sponsor.ajay.app/api/skipSegments',
        'https://sponsor.ajay.app/allowed'
    ]);
    assert.deepEqual(calls.map((call) => call.options.redirect), ['manual', 'manual']);
});

test('background EXT_FETCH rejects runtime optional hosts before fetch when grant is missing', async () => {
    let capturedPermissionsPayload = null;
    let fetchCalled = false;
    const { messageListener } = loadBackground({
        optionalHostPermissions: ['https://returnyoutubedislikeapi.com/*'],
        permissionsContainsImpl(payload, callback) {
            capturedPermissionsPayload = payload;
            callback(false);
        },
        fetchImpl: async () => {
            fetchCalled = true;
            return new Response('', {
                status: 200,
                headers: { 'content-length': '0' }
            });
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: {
            method: 'GET',
            url: 'https://returnyoutubedislikeapi.com/votes?videoId=dQw4w9WgXcQ'
        }
    });

    assert.deepEqual(
        Array.from(capturedPermissionsPayload?.origins || []),
        ['https://returnyoutubedislikeapi.com/*']
    );
    assert.equal(fetchCalled, false);
    assert.match(response.error, /Runtime host permission not granted/);
});

test('background EXT_FETCH allows runtime optional hosts after grant is present', async () => {
    let capturedPermissionsPayload = null;
    let capturedUrl = null;
    const { messageListener } = loadBackground({
        optionalHostPermissions: ['https://www.reddit.com/*'],
        permissionsContainsImpl(payload, callback) {
            capturedPermissionsPayload = payload;
            callback(true);
        },
        fetchImpl: async (url) => {
            capturedUrl = url;
            return new Response('{"ok":true}', {
                status: 200,
                headers: {
                    'content-length': '11',
                    'content-type': 'application/json'
                }
            });
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: {
            method: 'GET',
            url: 'https://www.reddit.com/search.json?q=url%3Ayoutube.com'
        }
    });

    assert.deepEqual(
        Array.from(capturedPermissionsPayload?.origins || []),
        ['https://www.reddit.com/*']
    );
    assert.equal(capturedUrl, 'https://www.reddit.com/search.json?q=url%3Ayoutube.com');
    assert.equal(response.status, 200);
    assert.equal(response.responseText, '{"ok":true}');
});

test('background requests only declared optional hosts from an in-page user gesture', async () => {
    let requestedPayload = null;
    const { messageListener } = loadBackground({
        optionalHostPermissions: ['https://sponsor.ajay.app/*'],
        permissionsRequestImpl(payload, callback) {
            requestedPayload = payload;
            callback(true);
        }
    });

    const granted = await dispatchMessage(messageListener, {
        type: 'YTKIT_REQUEST_OPTIONAL_HOSTS',
        origins: ['https://sponsor.ajay.app/*']
    });
    const rejected = await dispatchMessage(messageListener, {
        type: 'YTKIT_REQUEST_OPTIONAL_HOSTS',
        origins: ['https://attacker.example/*']
    });

    assert.equal(granted.ok, true);
    assert.equal(granted.granted, true);
    assert.deepEqual(Array.from(requestedPayload.origins), ['https://sponsor.ajay.app/*']);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.granted, false);
    assert.match(rejected.error, /not declared/);
});

test('background reports optional-host denial without persisting a false grant', async () => {
    const { messageListener } = loadBackground({
        optionalHostPermissions: ['https://sponsor.ajay.app/*'],
        permissionsRequestImpl(_payload, callback) {
            callback(false);
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'YTKIT_REQUEST_OPTIONAL_HOSTS',
        origins: ['https://sponsor.ajay.app/*']
    });

    assert.equal(response.ok, false);
    assert.equal(response.granted, false);
});

test('background DOWNLOAD_FILE sanitizes reserved Windows filenames', async () => {
    let capturedOptions = null;
    const { messageListener } = loadBackground({
        downloadsDownloadImpl: (options, callback) => {
            capturedOptions = options;
            callback(42);
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'DOWNLOAD_FILE',
        url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
        filename: 'CON.txt'
    });

    assert.equal(capturedOptions?.filename, '_CON.txt');
    assert.equal(response.downloadId, 42);
});

test('background DOWNLOAD_FILE enforces the filename cap with a long trailing segment', async () => {
    let capturedOptions = null;
    const { messageListener } = loadBackground({
        downloadsDownloadImpl: (options, callback) => {
            capturedOptions = options;
            callback(43);
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'DOWNLOAD_FILE',
        url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
        filename: `a.${'x'.repeat(300)}`
    });

    assert.ok(capturedOptions?.filename, 'download should receive a sanitized filename');
    assert.ok(capturedOptions.filename.length <= 180,
        'a long extension-like tail must not bypass the 180-character cap');
    assert.equal(response.downloadId, 43);
});

test('background DOWNLOAD_FILE waits for pending-reveal hydration before mirroring', async () => {
    let resolveHydration;
    let signalHydrationStarted;
    const hydrationStarted = new Promise((resolve) => { signalHydrationStarted = resolve; });
    const hydration = new Promise((resolve) => { resolveHydration = resolve; });
    let mirroredIds = null;

    const { messageListener } = loadBackground({
        downloadsDownloadImpl: (_options, callback) => callback(44),
        sessionGetImpl: async (key) => {
            if (key !== '_pendingReveals') return { [key]: undefined };
            signalHydrationStarted();
            await hydration;
            return { [key]: [5] };
        },
        sessionSetImpl: async (entries) => {
            if (Object.hasOwn(entries, '_pendingReveals')) mirroredIds = entries._pendingReveals;
        }
    });

    await hydrationStarted;
    const responsePromise = dispatchMessage(messageListener, {
        type: 'DOWNLOAD_FILE',
        url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
        showInFolder: true
    });
    resolveHydration();

    const response = await responsePromise;
    assert.equal(response.downloadId, 44);
    assert.deepEqual([...mirroredIds], [5, 44],
        'a cold-start download must merge with the hydrated reveal mirror before persisting');
});

test('background EXT_FETCH forwards x-goog-api-key to Gemini API', async () => {
    let capturedHeaders = null;
    const { messageListener } = loadBackground({
        fetchImpl: async (_url, options) => {
            capturedHeaders = options?.headers;
            return new Response('{}', {
                status: 200,
                headers: { 'content-length': '2', 'content-type': 'application/json' }
            });
        }
    });

    await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: {
            method: 'POST',
            url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': 'test-key-123' },
            data: '{}'
        }
    });

    assert.equal(capturedHeaders?.['x-goog-api-key'], 'test-key-123');
});

test('background vault migrates legacy AI keys and injects provider credentials', async () => {
    let capturedUrl = '';
    let capturedHeaders = null;
    const { messageListener, getSettings, persistentCredentials } = loadBackground({
        initialSettings: {
            aiSummaryProvider: 'gemini',
            aiSummaryApiKey: 'legacy-gemini-secret',
            aiSummaryEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent'
        },
        fetchImpl: async (url, options) => {
            capturedUrl = url;
            capturedHeaders = options.headers;
            return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'summary' }] } }] }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        }
    });

    const result = await dispatchMessage(messageListener, {
        type: 'YTKIT_AI_SUMMARY_REQUEST',
        provider: 'gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
        payload: { contents: [{ parts: [{ text: 'Summarize this.' }] }] }
    });

    assert.equal(result.ok, true);
    assert.equal(result.data.candidates[0].content.parts[0].text, 'summary');
    assert.equal(capturedUrl.includes('legacy-gemini-secret'), false);
    assert.equal(capturedHeaders['x-goog-api-key'], 'legacy-gemini-secret');
    assert.equal(getSettings().aiSummaryApiKey, undefined);
    assert.equal(persistentCredentials.get('gemini'), 'legacy-gemini-secret');
    assert.equal(JSON.stringify(result).includes('legacy-gemini-secret'), false);
});

test('background blocks provider responses that echo a credential', async () => {
    const secret = 'must-never-cross-worker-boundary';
    const { messageListener } = loadBackground({
        initialSettings: {
            aiSummaryProvider: 'openai',
            aiSummaryApiKey: secret
        },
        fetchImpl: async () => new Response(JSON.stringify({ echoed: secret }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        })
    });

    const result = await dispatchMessage(messageListener, {
        type: 'YTKIT_AI_SUMMARY_REQUEST',
        provider: 'openai',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        payload: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hello' }] }
    });

    assert.equal(result.ok, false);
    assert.match(result.error.message, /credential material.*blocked/i);
    assert.equal(JSON.stringify(result).includes(secret), false);
});

test('credential management rejects content-script callers and never reveals stored values', async () => {
    const { messageListener } = loadBackground();
    const rejected = await dispatchMessage(messageListener, {
        type: 'YTKIT_AI_CREDENTIAL_SET',
        provider: 'openai',
        credential: 'sk-content-script'
    });
    assert.equal(rejected.error.code, 'TRUSTED_CONTEXT_REQUIRED');

    const trustedSender = { id: 'astra-test-extension' };
    const saved = await dispatchMessage(messageListener, {
        type: 'YTKIT_AI_CREDENTIAL_SET',
        provider: 'openai',
        credential: 'sk-popup-secret',
        remember: false
    }, trustedSender);
    const status = await dispatchMessage(messageListener, {
        type: 'YTKIT_AI_CREDENTIAL_STATUS'
    }, trustedSender);
    assert.equal(saved.ok, true);
    assert.equal(status.providers.openai.configured, true);
    assert.equal(JSON.stringify(status).includes('sk-popup-secret'), false);
});

test('background EXT_FETCH rejects non-default ports on portless allowlist entries', async () => {
    const { messageListener } = loadBackground({
        fetchImpl: async () => new Response('{}', {
            status: 200,
            headers: { 'content-length': '2' }
        })
    });

    const response = await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: {
            method: 'GET',
            url: 'https://sponsor.ajay.app:8443/api/test'
        }
    });

    assert.ok(response.error, 'should reject non-standard port');
    assert.match(response.error, /not in allowlist/i);
});

// ── First-run onboarding on install ──

test('a fresh install stages the onboarding sentinel and badges the action', async () => {
    const bg = loadBackground();
    assert.ok(bg.installedListener, 'background must register a runtime onInstalled listener');

    bg.installedListener({ reason: 'install' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(bg.getLocal().ytkit_first_run_pending, true,
        'a fresh install must stage the pending sentinel so the popup can surface onboarding');
    const badge = bg.badgeCalls.find((call) => call.method === 'setBadgeText');
    assert.ok(badge, 'a fresh install must badge the toolbar action');
    assert.equal(badge.details.text, '1');
    assert.ok(bg.badgeCalls.some((call) => call.method === 'setBadgeBackgroundColor'),
        'the badge must carry a colour so it is legible on both themes');
});

test('a browser or extension update does not re-trigger onboarding', async () => {
    for (const reason of ['update', 'chrome_update', 'shared_module_update']) {
        const bg = loadBackground();
        bg.installedListener({ reason });
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.equal(bg.getLocal().ytkit_first_run_pending, undefined,
            `reason "${reason}" must not stage onboarding — the popup's What's New path owns version changes`);
        assert.equal(bg.badgeCalls.length, 0, `reason "${reason}" must not badge the action`);
    }
});

test('reinstalling over an onboarded profile does not onboard the user again', async () => {
    const bg = loadBackground();
    // The popup's upgrade guard stamps this for anyone who was already using
    // Astra Deck. Overwriting it would re-onboard an established install.
    bg.getLocal().ytkit_first_run_seen = true;

    bg.installedListener({ reason: 'install' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(bg.getLocal().ytkit_first_run_pending, undefined,
        'an existing sentinel must suppress onboarding');
    assert.equal(bg.badgeCalls.length, 0, 'and must leave the action unbadged');
});

test('the onboarding sentinel key names match between background and popup', () => {
    // A mismatch makes onboarding fire twice or never, and neither side would
    // fail on its own.
    const popupSource = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8');
    for (const key of ['ytkit_first_run_seen', 'ytkit_first_run_pending']) {
        assert.ok(backgroundSource.includes(`'${key}'`), `background.js must declare ${key}`);
        assert.ok(popupSource.includes(`'${key}'`), `popup.js must declare ${key}`);
    }
    assert.match(popupSource, /clearFirstRunPending/,
        'the popup must clear the pending sentinel it consumes');
});

// ── v4.60.0: the user-configured filter-list door ──
//
// Every other proxied origin is a literal in ALLOWED_FETCH_ORIGINS. A filter
// list is the one destination the user picks, so it is admitted through a
// separate path: the build must declare the broad optional pattern, the URL
// must survive the public-host denylist, and the user must have granted that
// exact origin. These tests exist because the first implementation of this
// feature shipped a Refresh button that could never succeed — the tests faked
// the fetch bridge and so never met the allowlist that rejected every URL.

const FILTER_LIST_DECLARED = ['https://*/*'];

test('a filter-list URL is refused when the build does not declare the broad optional pattern', async () => {
    let fetchCalled = false;
    const { messageListener } = loadBackground({
        optionalHostPermissions: [],
        fetchImpl: async () => {
            fetchCalled = true;
            return new Response('{}', { status: 200 });
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: { method: 'GET', url: 'https://lists.example.com/rules.json' }
    });

    assert.match(response.error, /not in allowlist/i);
    assert.equal(fetchCalled, false, 'store-safe builds must not reach a user-configured host');
});

test('a declared filter-list host is still fetched only after the user grants that exact origin', async () => {
    let capturedOrigins = null;
    let fetchCalled = false;
    const { messageListener } = loadBackground({
        optionalHostPermissions: FILTER_LIST_DECLARED,
        permissionsContainsImpl: (payload, callback) => {
            // Array.from re-homes the vm context's array into this realm;
            // deepEqual is prototype-sensitive across realms.
            capturedOrigins = Array.from(payload.origins || []);
            callback(false);
        },
        fetchImpl: async () => {
            fetchCalled = true;
            return new Response('{}', { status: 200 });
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: { method: 'GET', url: 'https://lists.example.com/rules.json' }
    });

    assert.deepEqual(capturedOrigins, ['https://lists.example.com/*'],
        'the grant is checked for the configured host alone, never the broad pattern');
    assert.match(response.error, /Runtime host permission not granted/);
    assert.equal(fetchCalled, false);
});

test('a granted filter-list host is proxied anonymously', async () => {
    let capturedUrl = null;
    let capturedInit = null;
    const { messageListener } = loadBackground({
        optionalHostPermissions: FILTER_LIST_DECLARED,
        permissionsContainsImpl: (_payload, callback) => callback(true),
        fetchImpl: async (url, init) => {
            capturedUrl = url;
            capturedInit = init;
            return new Response('{"astraDeckFilterList":true}', { status: 200 });
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: { method: 'GET', url: 'https://lists.example.com/rules.json' }
    });

    assert.equal(response.status, 200);
    assert.equal(capturedUrl, 'https://lists.example.com/rules.json');
    assert.equal(capturedInit.credentials, 'omit',
        'a user-configured host must never receive the YouTube session');
});

test('private-network filter-list hosts are refused even when the pattern is declared and granted', async () => {
    for (const url of [
        'https://169.254.169.254/latest/meta-data',
        'https://127.0.0.1/rules.json',
        'https://192.168.1.1/rules.json',
        'https://2130706433/rules.json',
        'https://[::ffff:127.0.0.1]/rules.json',
        'https://nas.local/rules.json',
        'https://intranet/rules.json'
    ]) {
        let fetchCalled = false;
        const { messageListener } = loadBackground({
            optionalHostPermissions: FILTER_LIST_DECLARED,
            permissionsContainsImpl: (_payload, callback) => callback(true),
            fetchImpl: async () => {
                fetchCalled = true;
                return new Response('{}', { status: 200 });
            }
        });

        const response = await dispatchMessage(messageListener, {
            type: 'EXT_FETCH',
            details: { method: 'GET', url }
        });

        assert.match(response.error, /not in allowlist/i, `${url} must not be proxied`);
        assert.equal(fetchCalled, false, `${url} must not reach fetch`);
    }
});

test('declaring the broad pattern does not make allowlisted origins require a grant', async () => {
    // The broad pattern matches every https URL. If it were fed through the
    // generic optional-host matcher, youtube.com would suddenly need a runtime
    // grant and the whole extension would stop working on a denied prompt.
    let containsCalled = false;
    let capturedUrl = null;
    const { messageListener } = loadBackground({
        optionalHostPermissions: FILTER_LIST_DECLARED,
        permissionsContainsImpl: (_payload, callback) => {
            containsCalled = true;
            callback(false);
        },
        fetchImpl: async (url) => {
            capturedUrl = url;
            return new Response('{}', { status: 200 });
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: { method: 'GET', url: 'https://www.youtube.com/youtubei/v1/player' }
    });

    assert.equal(response.status, 200);
    assert.equal(capturedUrl, 'https://www.youtube.com/youtubei/v1/player');
    assert.equal(containsCalled, false,
        'statically allowlisted origins must not consult the optional-grant path');
});

test('a page-driven request cannot escalate the filter-list door into blanket web access', async () => {
    const { messageListener } = loadBackground({
        optionalHostPermissions: FILTER_LIST_DECLARED,
        permissionsRequestImpl: (_payload, callback) => callback(true)
    });

    const broad = await dispatchMessage(messageListener, {
        type: 'YTKIT_REQUEST_OPTIONAL_HOSTS',
        origins: ['https://*/*']
    });
    assert.match(broad.error, /not declared by this extension build/,
        'the broad pattern is a declared capability, never a grantable request');

    const privateHost = await dispatchMessage(messageListener, {
        type: 'YTKIT_REQUEST_OPTIONAL_HOSTS',
        origins: ['https://192.168.1.1/*']
    });
    assert.match(privateHost.error, /not declared by this extension build/,
        'a private-network origin is not grantable through the filter-list door');

    const specific = await dispatchMessage(messageListener, {
        type: 'YTKIT_REQUEST_OPTIONAL_HOSTS',
        origins: ['https://lists.example.com/*']
    });
    assert.equal(specific.granted, true);
});
