'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createSettingsMutationController } = require('../extension/core/settings-controller');
const {
    createCredentialVault,
    validateProviderEndpoint
} = require('../extension/core/credential-vault');
// background.js pulls this in through importScripts in the browser. The vm
// context has no importScripts, so hand it the real module rather than a stub:
// the user-chosen HTTPS door is only as good as these rules.
const remoteListScope = require('../extension/core/remote-list-scope');
const cookieHandoff = require('../extension/core/cookie-handoff');

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
    cookiesGetAllImpl,
    connectNativeImpl,
    nativeResponse,
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
    const nativeMessages = [];
    const persistentCredentials = new Map();
    const persistentStore = {
        async get(provider) { return persistentCredentials.get(provider); },
        async set(provider, value) { persistentCredentials.set(provider, value); },
        async delete(provider) { persistentCredentials.delete(provider); }
    };
    const createNativePort = () => {
        const messageListeners = [];
        const disconnectListeners = [];
        let disconnected = false;
        return {
            error: null,
            onMessage: {
                addListener(listener) { messageListeners.push(listener); }
            },
            onDisconnect: {
                addListener(listener) { disconnectListeners.push(listener); }
            },
            postMessage(message) {
                nativeMessages.push(message);
                Promise.resolve().then(() => {
                    if (disconnected) return;
                    const response = typeof nativeResponse === 'function'
                        ? nativeResponse(message)
                        : nativeResponse;
                    for (const listener of messageListeners) listener(response);
                });
            },
            disconnect() { disconnected = true; },
            _disconnectListeners: disconnectListeners
        };
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
            },
            connectNative: connectNativeImpl
                || (nativeResponse !== undefined ? () => createNativePort() : undefined)
        },
        action: {
            async setBadgeText(details) { badgeCalls.push({ method: 'setBadgeText', details }); },
            async setBadgeBackgroundColor(details) { badgeCalls.push({ method: 'setBadgeBackgroundColor', details }); }
        },
        declarativeNetRequest: {
            getEnabledRulesets(callback) {
                const value = ['astra_zero_ads'];
                if (typeof callback === 'function') callback(value);
                return Promise.resolve(value);
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
            getAll: cookiesGetAllImpl || (async () => [])
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
        crypto: webcrypto,
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
            COBALT_PUBLIC_INSTANCE_HOST: remoteListScope.COBALT_PUBLIC_INSTANCE_HOST,
            describeCobaltInstanceUrl: remoteListScope.describeCobaltInstanceUrl,
            describeRemoteListUrl: remoteListScope.describeRemoteListUrl,
            remoteListOriginPattern: remoteListScope.remoteListOriginPattern,
            cookieHandoff
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
        persistentCredentials,
        nativeMessages
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

function youtubeSender({ tabId = 9, documentId = 'document-a', cookieStoreId } = {}) {
    return {
        id: 'astra-test-extension',
        frameId: 0,
        documentId,
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        tab: {
            id: tabId,
            windowId: 1,
            index: 0,
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            ...(cookieStoreId ? { cookieStoreId } : {})
        }
    };
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

test('background exposes the enabled zero-ad ruleset through its internal status contract', async () => {
    const { messageListener } = loadBackground();
    const response = await dispatchMessage(messageListener, { type: 'YTKIT_ZERO_AD_STATUS' });

    assert.equal(response.ok, true);
    assert.equal(response.rulesetId, 'astra_zero_ads');
    assert.equal(response.enabled, true);
    assert.deepEqual(Array.from(response.enabledRulesets), ['astra_zero_ads']);
});

test('background retires generic and forged cookie requests before touching the cookie API', async () => {
    let cookieReads = 0;
    const { messageListener } = loadBackground({
        cookiesGetAllImpl: async () => {
            cookieReads += 1;
            return [];
        },
        nativeResponse: { ok: true, token: 'legacy-native-token' }
    });
    const sender = youtubeSender();

    const retired = await dispatchMessage(messageListener, {
        type: 'EXT_COOKIE_LIST',
        filter: { domain: '.youtube.com' }
    }, sender);
    const forged = await dispatchMessage(messageListener, {
        type: 'YTKIT_COOKIE_HANDOFF',
        capability: '0'.repeat(48),
        protocolVersion: 1
    }, sender);
    const legacyProof = await dispatchMessage(messageListener, {
        type: 'NATIVE_MSG_GET_TOKEN',
        purpose: 'cookie-handoff'
    }, sender);

    assert.equal(retired.error.code, 'COOKIE_BRIDGE_RETIRED');
    assert.equal(forged.error.code, 'COOKIE_CAPABILITY_INVALID');
    assert.equal(legacyProof.token, 'legacy-native-token');
    assert.equal(legacyProof.cookieCapability, null,
        'a native response without the versioned service/API proof must not unlock cookies');
    assert.equal(cookieReads, 0);
});

test('background binds one-use cookie capabilities to a top-level YouTube document', async () => {
    let cookieReads = 0;
    const { messageListener } = loadBackground({
        nativeResponse: {
            ok: true,
            service: 'astra-downloader',
            api: 2,
            token: 'native-download-token'
        },
        cookiesGetAllImpl: async () => {
            cookieReads += 1;
            return [];
        }
    });
    const sender = youtubeSender({ tabId: 9, documentId: 'document-a' });

    const iframeSender = { ...sender, frameId: 4 };
    const iframeProof = await dispatchMessage(messageListener, {
        type: 'NATIVE_MSG_GET_TOKEN',
        purpose: 'cookie-handoff'
    }, iframeSender);
    assert.equal(iframeProof.cookieCapability, null,
        'an embedded frame must not receive a top-level cookie capability');

    const wrongContextProof = await dispatchMessage(messageListener, {
        type: 'NATIVE_MSG_GET_TOKEN',
        purpose: 'cookie-handoff'
    }, sender);
    const wrongContext = await dispatchMessage(messageListener, {
        type: 'YTKIT_COOKIE_HANDOFF',
        capability: wrongContextProof.cookieCapability.token,
        protocolVersion: 1
    }, youtubeSender({ tabId: 9, documentId: 'document-b' }));

    const validProof = await dispatchMessage(messageListener, {
        type: 'NATIVE_MSG_GET_TOKEN',
        purpose: 'cookie-handoff'
    }, sender);
    const firstUse = await dispatchMessage(messageListener, {
        type: 'YTKIT_COOKIE_HANDOFF',
        capability: validProof.cookieCapability.token,
        protocolVersion: 1
    }, sender);
    const replay = await dispatchMessage(messageListener, {
        type: 'YTKIT_COOKIE_HANDOFF',
        capability: validProof.cookieCapability.token,
        protocolVersion: 1
    }, sender);

    assert.equal(wrongContext.error.code, 'COOKIE_CAPABILITY_CONTEXT_MISMATCH');
    assert.equal(firstUse.ok, true);
    assert.equal(replay.error.code, 'COOKIE_CAPABILITY_INVALID');
    assert.equal(cookieReads, 1, 'only the correctly bound first use may reach cookies.getAll');
});

test('background releases only the complete versioned YouTube auth-cookie set with redacted diagnostics', async () => {
    const unknownSecret = 'unknown-cookie-secret';
    const badPathSecret = 'wrong-path-secret';
    const badDomainSecret = 'wrong-domain-secret';
    const insecureSecret = 'insecure-cookie-secret';
    const oversizedSecret = 'oversized-cookie-secret-' + 'x'.repeat(4096);
    let query = null;
    const { messageListener } = loadBackground({
        nativeResponse: {
            ok: true,
            service: 'astra-downloader',
            api: 2,
            token: 'native-download-token'
        },
        cookiesGetAllImpl: async (details) => {
            query = details;
            return [
                { domain: '.youtube.com', name: 'LOGIN_INFO', value: 'login-value', path: '/', secure: true, httpOnly: true },
                { domain: '.youtube.com', name: 'SAPISID', value: 'sapisid-value', path: '/', secure: true },
                { domain: '.youtube.com', name: '__Secure-1PAPISID', value: 'one-papisid-value', path: '/', secure: true },
                { domain: '.youtube.com', name: '__Secure-3PAPISID', value: 'three-papisid-value', path: '/', secure: true },
                { domain: '.youtube.com', name: 'SID', value: unknownSecret, path: '/', secure: true },
                { domain: '.youtube.com', name: 'LOGIN_INFO', value: badPathSecret, path: '/accounts', secure: true },
                { domain: '.google.com', name: 'SAPISID', value: badDomainSecret, path: '/', secure: true },
                { domain: '.youtube.com', name: 'SAPISID', value: insecureSecret, path: '/', secure: false },
                { domain: '.youtube.com', name: 'SAPISID', value: oversizedSecret, path: '/', secure: true }
            ];
        }
    });
    const sender = youtubeSender({ cookieStoreId: 'firefox-container-2' });
    const proof = await dispatchMessage(messageListener, {
        type: 'NATIVE_MSG_GET_TOKEN',
        purpose: 'cookie-handoff'
    }, sender);
    const result = await dispatchMessage(messageListener, {
        type: 'YTKIT_COOKIE_HANDOFF',
        capability: proof.cookieCapability.token,
        protocolVersion: proof.cookieCapability.protocolVersion
    }, sender);

    assert.equal(result.ok, true);
    assert.deepEqual(
        Array.from(result.cookies, (cookie) => cookie.name),
        ['LOGIN_INFO', 'SAPISID', '__Secure-1PAPISID', '__Secure-3PAPISID']
    );
    assert.equal(query.domain, '.youtube.com');
    assert.equal(query.storeId, 'firefox-container-2');
    assert.equal(result.diagnostics.acceptedCount, 4);
    assert.equal(result.diagnostics.droppedCount, 5);

    const serialized = JSON.stringify(result);
    for (const secret of [unknownSecret, badPathSecret, badDomainSecret, insecureSecret, oversizedSecret]) {
        assert.equal(serialized.includes(secret), false, 'a rejected cookie value must not cross sendResponse');
    }
    assert.equal(serialized.includes(proof.cookieCapability.token), false,
        'the consumed capability must not be reflected in the response');
    const serializedDiagnostics = JSON.stringify(result.diagnostics);
    assert.doesNotMatch(serializedDiagnostics, /LOGIN_INFO|SAPISID|PAPISID|cookie-secret|native-download-token/);
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
    // Anonymous requests still use manual redirects, which is what turns any
    // 3xx into an opaque-redirect response the handler can refuse. With
    // 'follow', the browser would contact every intermediate host before the
    // allowlist ever saw the final URL.
    assert.equal(capturedOptions?.redirect, 'manual');
});

test('background EXT_FETCH refuses a redirect instead of following it', async () => {
    // `redirect: 'manual'` makes a real browser return an opaque-redirect
    // FILTERED response: type 'opaqueredirect', status 0, no readable headers.
    // The mock has to reproduce that or the test proves nothing about shipped
    // behaviour -- this one used to return Response(null, {status: 302,
    // headers: {location}}), which is type 'basic' with a readable Location, so
    // it drove a hop-following branch that could never run in a browser.
    const calls = [];
    const { messageListener } = loadBackground({
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return {
                type: 'opaqueredirect',
                status: 0,
                ok: false,
                url: '',
                headers: new Headers(),
                text: async () => '',
                json: async () => ({})
            };
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: { method: 'GET', url: 'https://sponsor.ajay.app/api/skipSegments' }
    });

    assert.match(response.error, /Blocked redirect/);
    assert.match(response.error, /cannot be validated/);
    // Exactly one request: the redirect target is never contacted, because it
    // cannot be read from the filtered response to be validated first.
    assert.deepEqual(calls.map((call) => call.url), [
        'https://sponsor.ajay.app/api/skipSegments'
    ]);
    assert.deepEqual(calls.map((call) => call.options.redirect), ['manual']);
});

test('background EXT_FETCH refuses a readable 3xx too, not just the opaque form', async () => {
    // Belt and braces: if a host ever hands back a readable 3xx (a non-browser
    // fetch shim, a future spec change), it must still be refused rather than
    // silently followed through the unvalidated path.
    const calls = [];
    const { messageListener } = loadBackground({
        fetchImpl: async (url, options) => {
            calls.push(url);
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

    assert.match(response.error, /Blocked redirect/);
    assert.deepEqual(calls, ['https://sponsor.ajay.app/api/skipSegments']);
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

test('background EXT_FETCH carries conditional validators and enforces a caller-lowered response cap', async () => {
    const calls = [];
    const { messageListener } = loadBackground({
        optionalHostPermissions: ['https://*/*'],
        permissionsContainsImpl(_payload, callback) { callback(true); },
        fetchImpl: async (_url, options) => {
            calls.push(options);
            if (calls.length === 1) {
                return new Response(null, {
                    status: 304,
                    headers: { etag: '"v1"', 'last-modified': 'Wed, 12 Aug 2026 12:00:00 GMT' }
                });
            }
            return new Response('x'.repeat(2048), {
                status: 200,
                headers: { 'content-length': '2048' }
            });
        }
    });

    const notModified = await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: {
            method: 'GET',
            url: 'https://lists.example.org/rules.json',
            headers: {
                'If-None-Match': '"v1"',
                'If-Modified-Since': 'Wed, 12 Aug 2026 12:00:00 GMT'
            },
            maxResponseBytes: 1024
        }
    });
    assert.equal(calls[0].headers['If-None-Match'], '"v1"');
    assert.equal(calls[0].headers['If-Modified-Since'], 'Wed, 12 Aug 2026 12:00:00 GMT');
    assert.equal(notModified.status, 304);
    assert.match(notModified.responseHeaders, /etag: "v1"/i);

    const tooLarge = await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: {
            method: 'GET',
            url: 'https://lists.example.org/rules.json',
            maxResponseBytes: 1024
        }
    });
    assert.match(tooLarge.error, /Response too large \(2048 bytes\)/);
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

    const publicCobalt = await dispatchMessage(messageListener, {
        type: 'YTKIT_REQUEST_OPTIONAL_HOSTS',
        origins: ['https://api.cobalt.tools/*']
    });
    assert.match(publicCobalt.error, /not declared by this extension build/,
        'the dynamic permission door must not provide an alternate grant for Cobalt public service');

    const specific = await dispatchMessage(messageListener, {
        type: 'YTKIT_REQUEST_OPTIONAL_HOSTS',
        origins: ['https://lists.example.com/*']
    });
    assert.equal(specific.granted, true);
});

// ── Self-hosted Cobalt capability contract ──

const COBALT_SETTINGS = Object.freeze({
    safeStoreProfile: false,
    githubFullProfile: true,
    downloadCobaltFallback: true,
    downloadCobaltInstance: 'https://cobalt.example.net/'
});
const COBALT_SENDER = Object.freeze({
    id: 'astra-test-extension',
    tab: { id: 9, windowId: 1, index: 0, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=private-context' }
});

test('self-hosted Cobalt requires the configured host grant before any POST', async () => {
    let fetchCalled = false;
    let checkedOrigins = [];
    const { messageListener } = loadBackground({
        optionalHostPermissions: FILTER_LIST_DECLARED,
        initialSettings: COBALT_SETTINGS,
        permissionsContainsImpl: (payload, callback) => {
            checkedOrigins = Array.from(payload.origins || []);
            callback(false);
        },
        fetchImpl: async () => {
            fetchCalled = true;
            return new Response('{}', { status: 200 });
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'YTKIT_COBALT_REQUEST'
    }, COBALT_SENDER);

    assert.equal(response.ok, false);
    assert.equal(response.error.code, 'COBALT_PERMISSION_REQUIRED');
    assert.deepEqual(checkedOrigins, ['https://cobalt.example.net/*']);
    assert.equal(fetchCalled, false);
});

test('self-hosted Cobalt owns its endpoint and sends only a canonical video URL', async () => {
    let capturedUrl = null;
    let capturedInit = null;
    const { messageListener } = loadBackground({
        optionalHostPermissions: FILTER_LIST_DECLARED,
        initialSettings: COBALT_SETTINGS,
        permissionsContainsImpl: (_payload, callback) => callback(true),
        fetchImpl: async (url, init) => {
            capturedUrl = url;
            capturedInit = init;
            return new Response(JSON.stringify({
                status: 'redirect',
                url: 'https://media.example.net/video.mp4'
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'YTKIT_COBALT_REQUEST',
        // Forged destinations and media context are ignored; the worker reads
        // validated storage and the sender tab instead.
        endpoint: 'https://attacker.example/',
        url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA&secret=leak'
    }, COBALT_SENDER);

    assert.equal(response.ok, true);
    assert.equal(response.data.status, 'redirect');
    assert.equal(capturedUrl, 'https://cobalt.example.net/');
    assert.equal(capturedInit.method, 'POST');
    assert.equal(capturedInit.credentials, 'omit');
    assert.equal(capturedInit.redirect, 'error');
    assert.equal(capturedInit.headers.Accept, 'application/json');
    assert.deepEqual(JSON.parse(capturedInit.body), {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    });
});

test('the public Cobalt service and non-watch senders fail closed', async () => {
    for (const [settings, sender, code] of [
        [{ ...COBALT_SETTINGS, downloadCobaltInstance: 'https://api.cobalt.tools/' }, COBALT_SENDER, 'COBALT_INSTANCE_REQUIRED'],
        [COBALT_SETTINGS, { id: 'astra-test-extension', tab: { url: 'https://www.youtube.com/' } }, 'COBALT_WATCH_TAB_REQUIRED']
    ]) {
        let fetchCalled = false;
        const { messageListener } = loadBackground({
            optionalHostPermissions: FILTER_LIST_DECLARED,
            initialSettings: settings,
            permissionsContainsImpl: (_payload, callback) => callback(true),
            fetchImpl: async () => {
                fetchCalled = true;
                return new Response('{}', { status: 200 });
            }
        });
        const response = await dispatchMessage(messageListener, { type: 'YTKIT_COBALT_REQUEST' }, sender);
        assert.equal(response.error.code, code);
        assert.equal(fetchCalled, false);
    }
});

test('generic EXT_FETCH cannot turn one dynamic grant into a POST proxy', async () => {
    let fetchCalled = false;
    let containsCalled = false;
    const { messageListener } = loadBackground({
        optionalHostPermissions: FILTER_LIST_DECLARED,
        permissionsContainsImpl: (_payload, callback) => {
            containsCalled = true;
            callback(true);
        },
        fetchImpl: async () => {
            fetchCalled = true;
            return new Response('{}', { status: 200 });
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: {
            method: 'POST',
            url: 'https://cobalt.example.net/',
            data: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
        }
    });

    assert.match(response.error, /only support anonymous GET\/HEAD/);
    assert.equal(containsCalled, false, 'request shape is rejected before consulting permission state');
    assert.equal(fetchCalled, false);
});

test('dynamic GET redirects require an exact grant at every hop', async () => {
    const checked = [];
    const fetched = [];
    const { messageListener } = loadBackground({
        optionalHostPermissions: FILTER_LIST_DECLARED,
        permissionsContainsImpl: (payload, callback) => {
            const origin = Array.from(payload.origins || [])[0];
            checked.push(origin);
            callback(origin === 'https://lists.example.com/*');
        },
        fetchImpl: async (url) => {
            fetched.push(url);
            return new Response(null, {
                status: 302,
                headers: { location: 'https://redirect.example.net/rules.json' }
            });
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: { method: 'GET', url: 'https://lists.example.com/rules.json' }
    });

    // The redirect is refused before any grant re-check can happen, because the
    // target is unreadable -- so only the ORIGINAL origin is ever checked. The
    // previous expectation (a second check for redirect.example.net) was an
    // artifact of the unrealistic readable-302 mock.
    assert.match(response.error, /Blocked redirect/);
    assert.deepEqual(checked, ['https://lists.example.com/*']);
    assert.deepEqual(fetched, ['https://lists.example.com/rules.json']);
});
