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

const repoRoot = path.join(__dirname, '..');
const backgroundSource = fs.readFileSync(path.join(repoRoot, 'extension', 'background.js'), 'utf8');

function loadBackground({
    fetchImpl,
    downloadsDownloadImpl,
    optionalHostPermissions = [],
    permissionsContainsImpl,
    permissionsRequestImpl,
    initialSettings = {},
    apiNamespace = 'chrome'
} = {}) {
    let messageListener = null;
    let settingsState = { ...initialSettings };
    const sessionState = {};
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
            }
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
                    return { [key]: settingsState };
                },
                async set(entries) {
                    if (entries.ytSuiteSettings) settingsState = { ...entries.ytSuiteSettings };
                }
            },
            session: {
                async get(key) { return { [key]: sessionState[key] }; },
                async set(entries) { Object.assign(sessionState, entries); },
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
            validateAiProviderEndpoint: validateProviderEndpoint
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

test('background EXT_FETCH blocks an opaqueredirect on a credentialed request', async () => {
    const { messageListener } = loadBackground({
        fetchImpl: async () => ({
            type: 'opaqueredirect',
            url: 'https://attacker.example/',
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

test('background EXT_FETCH still follows redirects for non-credentialed requests', async () => {
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
    // No manual redirect forced — nothing sensitive to leak.
    assert.notEqual(capturedOptions?.redirect, 'manual');
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
