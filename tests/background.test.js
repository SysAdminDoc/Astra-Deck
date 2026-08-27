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
    initialSession = {},
    initialEnabledRulesets = ['astra_zero_ads'],
    apiNamespace = 'chrome'
} = {}) {
    let messageListener = null;
    let installedListener = null;
    let settingsState = { ...initialSettings };
    const sessionState = { ...initialSession };
    // Generic key/value half of storage.local, for keys that are not the
    // settings bag (onboarding sentinels and friends).
    const localState = {};
    const badgeCalls = [];
    const dnrCalls = [];
    const alarmCalls = [];
    let alarmListener = null;
    const enabledRulesetsState = new Set(initialEnabledRulesets);
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
                const value = Array.from(enabledRulesetsState);
                if (typeof callback === 'function') callback(value);
                return Promise.resolve(value);
            },
            updateEnabledRulesets(details, callback) {
                dnrCalls.push(details);
                for (const id of details?.enableRulesetIds || []) enabledRulesetsState.add(id);
                for (const id of details?.disableRulesetIds || []) enabledRulesetsState.delete(id);
                if (typeof callback === 'function') callback();
                return Promise.resolve();
            }
        },
        alarms: {
            create(name, details) {
                alarmCalls.push({ method: 'create', name, details });
                return Promise.resolve();
            },
            clear(name, callback) {
                alarmCalls.push({ method: 'clear', name });
                if (typeof callback === 'function') callback(true);
                return Promise.resolve(true);
            },
            onAlarm: {
                addListener(listener) { alarmListener = listener; }
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
                    // A string key that actually exists in the generic half
                    // answers from there. Without this every single-key read
                    // returned the settings bag, so no storage.local cache
                    // (the feature-disable feed's, for one) could be tested.
                    if (Object.hasOwn(localState, key)) return { [key]: localState[key] };
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
        // Service workers expose atob; the feed-signature decoder uses it.
        atob,
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
        getAlarmListener: () => alarmListener,
        badgeCalls,
        dnrCalls,
        alarmCalls,
        getSession: () => sessionState,
        getEnabledRulesets: () => Array.from(enabledRulesetsState),
        getLocal: () => localState,
        getSettings: () => settingsState,
        persistentCredentials,
        nativeMessages
    };
}

function dispatchMessage(listener, message, sender = {
    id: 'astra-test-extension',
    // A real content-script sender always carries its page origin and url.
    // The harness omitted both, so no sender-origin check could be exercised
    // and adding one read as a regression rather than a missing field.
    origin: 'https://www.youtube.com',
    url: 'https://www.youtube.com/watch?v=abc12345678',
    tab: { id: 9, windowId: 1, index: 0, url: 'https://www.youtube.com/watch?v=abc12345678' }
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
    assert.equal(response.paused, false);
    assert.equal(response.pauseUntil, null);
    assert.deepEqual(Array.from(response.enabledRulesets), ['astra_zero_ads']);
});

test('zero-ad recovery pauses only after an explicit action and publishes its deadline', async () => {
    const bg = loadBackground();
    const before = await dispatchMessage(bg.messageListener, { type: 'YTKIT_ZERO_AD_STATUS' });
    assert.equal(before.enabled, true, 'detection and status reads must not change policy');
    assert.deepEqual(bg.dnrCalls, []);

    const startedAt = Date.now();
    const paused = await dispatchMessage(bg.messageListener, { type: 'YTKIT_ZERO_AD_PAUSE_SESSION' });
    assert.equal(paused.ok, true);
    assert.equal(paused.enabled, false);
    assert.equal(paused.paused, true);
    assert.ok(paused.pauseUntil >= startedAt + (14 * 60 * 1000));
    assert.ok(paused.pauseUntil <= Date.now() + (16 * 60 * 1000));
    assert.equal(bg.getSession().ytkit_zero_ad_pause_until, paused.pauseUntil);
    assert.deepEqual(bg.getEnabledRulesets(), []);
    assert.ok(bg.dnrCalls.some((call) => call.disableRulesetIds?.includes('astra_zero_ads')));
    assert.ok(bg.alarmCalls.some((call) => call.method === 'create'
        && call.name === 'ytkit-zero-ad-restore'
        && call.details?.when === paused.pauseUntil));
});

test('zero-ad recovery resumes explicitly and clears the session deadline', async () => {
    const bg = loadBackground();
    await dispatchMessage(bg.messageListener, { type: 'YTKIT_ZERO_AD_PAUSE_SESSION' });
    const resumed = await dispatchMessage(bg.messageListener, { type: 'YTKIT_ZERO_AD_RESUME_SESSION' });

    assert.equal(resumed.ok, true);
    assert.equal(resumed.enabled, true);
    assert.equal(resumed.paused, false);
    assert.equal(resumed.pauseUntil, null);
    assert.deepEqual(bg.getEnabledRulesets(), ['astra_zero_ads']);
    assert.equal(bg.getSession().ytkit_zero_ad_pause_until, undefined);
    assert.ok(bg.alarmCalls.some((call) => call.method === 'clear'
        && call.name === 'ytkit-zero-ad-restore'));
});

test('zero-ad recovery restores an expired pause on worker startup and alarm wake', async () => {
    const bg = loadBackground({
        initialSession: { ytkit_zero_ad_pause_until: Date.now() - 1000 },
        initialEnabledRulesets: []
    });
    const status = await dispatchMessage(bg.messageListener, { type: 'YTKIT_ZERO_AD_STATUS' });

    assert.equal(status.enabled, true);
    assert.equal(status.paused, false);
    assert.equal(bg.getSession().ytkit_zero_ad_pause_until, undefined);
    assert.deepEqual(bg.getEnabledRulesets(), ['astra_zero_ads']);
    assert.ok(bg.dnrCalls.some((call) => call.enableRulesetIds?.includes('astra_zero_ads')));

    const alarmListener = bg.getAlarmListener();
    assert.equal(typeof alarmListener, 'function');
    alarmListener({ name: 'unrelated' });
    alarmListener({ name: 'ytkit-zero-ad-restore' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(bg.getEnabledRulesets(), ['astra_zero_ads']);
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

test('background keeps URL-backed document binding when documentId is absent', async () => {
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
    const sender = youtubeSender({ tabId: 9 });
    delete sender.documentId;

    const staleProof = await dispatchMessage(messageListener, {
        type: 'NATIVE_MSG_GET_TOKEN',
        purpose: 'cookie-handoff'
    }, sender);
    const navigatedUrl = 'https://www.youtube.com/watch?v=anotherVideo';
    const navigatedSender = {
        ...sender,
        url: navigatedUrl,
        tab: { ...sender.tab, url: navigatedUrl }
    };
    const staleUse = await dispatchMessage(messageListener, {
        type: 'YTKIT_COOKIE_HANDOFF',
        capability: staleProof.cookieCapability.token,
        protocolVersion: 1
    }, navigatedSender);

    const validProof = await dispatchMessage(messageListener, {
        type: 'NATIVE_MSG_GET_TOKEN',
        purpose: 'cookie-handoff'
    }, sender);
    const validUse = await dispatchMessage(messageListener, {
        type: 'YTKIT_COOKIE_HANDOFF',
        capability: validProof.cookieCapability.token,
        protocolVersion: 1
    }, sender);

    assert.equal(staleUse.error.code, 'COOKIE_CAPABILITY_CONTEXT_MISMATCH');
    assert.equal(validUse.ok, true);
    assert.equal(cookieReads, 1,
        'Firefox 142 must reject a same-tab navigation without relying on documentId');
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


// ── Bounded response reading ────────────────────────────────────────────
//
// The content-length pre-check only fires when the server declares one. A
// chunked response declares nothing, so the old readTextBounded fell through
// to response.text() and buffered the whole body into the worker before
// measuring it — the cap was a post-mortem rather than a limit. EXT_FETCH had
// streamed against an incremental cap since v3.20.4; these pin that the two
// stragglers now do the same.

function loadReadTextBounded() {
    const vm = require('node:vm');
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
    const start = source.indexOf('async function readTextBounded(');
    assert.ok(start > -1, 'background.js must define readTextBounded');
    const end = source.indexOf('\n// The broad optional pattern', start);
    assert.ok(end > start, 'readTextBounded must be followed by the optional-pattern comment');
    const sandbox = { TextEncoder, TextDecoder, Error };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(source.slice(start, end) + '\nglobalThis.__fn = readTextBounded;', sandbox);
    return sandbox.__fn;
}

// A chunked response: no content-length, body delivered in slices. `served`
// counts the bytes the reader actually pulled, which is what "aborted before
// fully buffering" means in practice.
function chunkedResponse(totalBytes, chunkSize = 1024) {
    const state = { served: 0, cancelled: false };
    let remaining = totalBytes;
    return {
        state,
        response: {
            headers: { get: () => null },
            body: {
                getReader: () => ({
                    read: async () => {
                        if (remaining <= 0) return { done: true, value: undefined };
                        const size = Math.min(chunkSize, remaining);
                        remaining -= size;
                        state.served += size;
                        return { done: false, value: new Uint8Array(size) };
                    },
                    cancel: () => { state.cancelled = true; }
                })
            },
            text: async () => { throw new Error('text() must not be reached on a streamed body'); }
        }
    };
}

test('an oversized chunked response is aborted before the whole body is buffered', async () => {
    const readTextBounded = loadReadTextBounded();
    const limit = 8 * 1024;
    const { response, state } = chunkedResponse(1024 * 1024);
    let aborted = false;
    const controller = { abort: () => { aborted = true; } };

    await assert.rejects(
        () => readTextBounded(response, limit, 'Test body', controller),
        /exceeds the 8192-byte limit/);

    assert.ok(state.served <= limit + 1024,
        `the reader must stop within one chunk of the cap, but pulled ${state.served} bytes`);
    assert.ok(state.served < 1024 * 1024,
        'the whole body must not be buffered before the cap trips');
    assert.equal(state.cancelled, true, 'the stream reader must be cancelled');
    assert.equal(aborted, true, 'the fetch must be aborted so the socket is not left draining');
});

test('a chunked response inside the cap is returned intact', async () => {
    const readTextBounded = loadReadTextBounded();
    const { response, state } = chunkedResponse(3000);
    const result = await readTextBounded(response, 8 * 1024, 'Test body');
    assert.equal(result.bytes, 3000, 'the byte count must be the streamed total');
    assert.equal(result.text.length, 3000, 'every chunk must be concatenated into the result');
    assert.equal(state.cancelled, false, 'an in-limit body must not be cancelled');
});

test('a declared over-limit content-length still short-circuits before reading', async () => {
    const readTextBounded = loadReadTextBounded();
    const { response, state } = chunkedResponse(1024 * 1024);
    response.headers = { get: (name) => (name === 'content-length' ? String(1024 * 1024) : null) };
    let aborted = false;

    await assert.rejects(
        () => readTextBounded(response, 8 * 1024, 'Test body', { abort: () => { aborted = true; } }),
        /exceeds the 8192-byte limit/);
    assert.equal(state.served, 0, 'a declared oversize must be rejected without reading any body');
    assert.equal(aborted, true, 'the declared-oversize path must abort the fetch too');
});

test('a response with no streaming body falls back rather than failing', async () => {
    const readTextBounded = loadReadTextBounded();
    const response = { headers: { get: () => null }, text: async () => 'hello' };
    const result = await readTextBounded(response, 1024, 'Test body');
    assert.equal(result.text, 'hello');
    assert.equal(result.bytes, 5);

    const oversize = { headers: { get: () => null }, text: async () => 'x'.repeat(2048) };
    await assert.rejects(
        () => readTextBounded(oversize, 1024, 'Test body'),
        /exceeds the 1024-byte limit/,
        'the fallback path must still enforce the cap');
});

test('the AI summary and selector-asset paths stream against their caps', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');

    const aiStart = source.indexOf('async function performAiSummaryRequest');
    assert.ok(aiStart > -1, 'performAiSummaryRequest must exist');
    const aiEnd = source.indexOf('\nasync function ', aiStart + 1);
    assert.ok(aiEnd > aiStart, 'performAiSummaryRequest must be followed by another function');
    const ai = source.slice(aiStart, aiEnd);
    assert.match(ai, /readTextBounded\(\s*\n?\s*response, MAX_AI_RESPONSE_BYTES/,
        'the AI response must go through the bounded reader');
    assert.doesNotMatch(ai, /await response\.text\(\)/,
        'buffering the provider body before measuring it is the defect this replaced');

    assert.match(source, /readTextBounded\(\s*\n?\s*response, MAX_SELECTOR_ASSET_BYTES, 'Selector asset', selectorAssetController\)/,
        'the selector asset must pass its controller so an oversize body aborts the fetch');
});

// --- Detached feed signatures (v4.88.3) ---------------------------------
//
// Both remote documents can change shipped behavior without a release. The
// feature-disable feed had no authenticity check at all, and the selector
// asset's `sha256:` digest travels inside the asset it vouches for, so it
// cannot detect substitution. These drive the real message handlers with the
// repository's real payloads and real committed signatures.

const FEED_URL_BASE = 'https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/refs/heads/main/';

function readSignedFeed(name) {
    return {
        text: fs.readFileSync(path.join(repoRoot, name), 'utf8'),
        signature: fs.readFileSync(path.join(repoRoot, `${name}.sig`), 'utf8')
    };
}

// Serves `name` and `name.sig`. `mutate` rewrites what the network returns so a
// test can tamper with either half without touching the repository.
function signedFeedFetch(name, mutate = (part, value) => value) {
    const feed = readSignedFeed(name);
    return async (url) => {
        const href = String(url);
        if (href === `${FEED_URL_BASE}${name}.sig`) {
            const body = mutate('signature', feed.signature);
            if (body === null) return new Response('', { status: 404 });
            return new Response(body, { status: 200 });
        }
        if (href === `${FEED_URL_BASE}${name}`) {
            const body = mutate('payload', feed.text);
            if (body === null) return new Response('', { status: 404 });
            return new Response(body, { status: 200 });
        }
        return new Response('', { status: 404 });
    };
}

test('feature disable feed accepts a payload carrying its real signature', async () => {
    const bg = loadBackground({ fetchImpl: signedFeedFetch('feature-disable-feed.csv') });
    const response = await dispatchMessage(bg.messageListener, { type: 'YTKIT_FETCH_FEATURE_DISABLE_FEED' });

    assert.equal(response.ok, true, 'a correctly signed feed must be delivered');
    assert.equal(response.source, 'network');
    assert.ok(response.text.length > 0);
    assert.ok(bg.getLocal()['ytkit-feature-disable-feed-v2'],
        'a verified feed becomes the last-known-good cache entry');
});

test('feature disable feed refuses a tampered payload and writes no cache', async () => {
    const bg = loadBackground({
        fetchImpl: signedFeedFetch('feature-disable-feed.csv',
            (part, value) => (part === 'payload' ? `${value}\nastraDeck,4.0.0,4.99.0,tampered` : value))
    });
    const response = await dispatchMessage(bg.messageListener, { type: 'YTKIT_FETCH_FEATURE_DISABLE_FEED' });

    assert.equal(response.ok, false, 'a payload whose signature does not match must be refused');
    assert.equal(bg.getLocal()['ytkit-feature-disable-feed-v2'], undefined,
        'a refused payload must never become the last-known-good cache entry');
});

test('feature disable feed refuses a missing or malformed signature', async () => {
    const missing = loadBackground({
        fetchImpl: signedFeedFetch('feature-disable-feed.csv', (part) => (part === 'signature' ? null : undefined))
    });
    assert.equal((await dispatchMessage(missing.messageListener,
        { type: 'YTKIT_FETCH_FEATURE_DISABLE_FEED' })).ok, false, 'an absent signature must fail closed');

    const malformed = loadBackground({
        fetchImpl: signedFeedFetch('feature-disable-feed.csv',
            (part, value) => (part === 'signature' ? 'not base64 at all!!' : value))
    });
    assert.equal((await dispatchMessage(malformed.messageListener,
        { type: 'YTKIT_FETCH_FEATURE_DISABLE_FEED' })).ok, false, 'a malformed signature must fail closed');

    // A well-formed base64 signature of the wrong length must not reach verify().
    const wrongLength = loadBackground({
        fetchImpl: signedFeedFetch('feature-disable-feed.csv',
            (part, value) => (part === 'signature' ? Buffer.alloc(63).toString('base64') : value))
    });
    assert.equal((await dispatchMessage(wrongLength.messageListener,
        { type: 'YTKIT_FETCH_FEATURE_DISABLE_FEED' })).ok, false, 'a short signature must fail closed');
});

test('feature disable feed keeps a stale cache when a tampered refresh is refused', async () => {
    const bg = loadBackground({
        fetchImpl: signedFeedFetch('feature-disable-feed.csv',
            (part, value) => (part === 'payload' ? `${value}\nastraDeck,4.0.0,4.99.0,tampered` : value))
    });
    // Old enough to be served-and-refreshed rather than used as-is.
    bg.getLocal()['ytkit-feature-disable-feed-v2'] = {
        text: 'astraDeck,4.0.0,4.99.0,known-good',
        cachedAt: Date.now() - (7 * 60 * 60 * 1000)
    };

    const response = await dispatchMessage(bg.messageListener, { type: 'YTKIT_FETCH_FEATURE_DISABLE_FEED' });
    assert.equal(response.ok, true, 'a stale-but-usable cache still answers the caller');
    assert.equal(response.source, 'stale');
    // The background refresh is fire-and-forget; give it a turn to finish.
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.match(bg.getLocal()['ytkit-feature-disable-feed-v2'].text, /known-good/,
        'the refused refresh must leave the last-known-good entry in place');
});

test('selector asset accepts its real signature and refuses a substituted body', async () => {
    const good = loadBackground({ fetchImpl: signedFeedFetch('selector-packs.json') });
    const accepted = await dispatchMessage(good.messageListener, { type: 'YTKIT_FETCH_SELECTOR_ASSET' });
    assert.equal(accepted.ok, true, 'a correctly signed selector asset must be delivered');
    assert.ok(accepted.text.includes('"schemaVersion"'));

    // A substituted asset that carries a self-consistent internal digest is
    // exactly what the digest check cannot catch. The signature can.
    const substituted = loadBackground({
        fetchImpl: signedFeedFetch('selector-packs.json', (part, value) => {
            if (part !== 'payload') return value;
            const parsed = JSON.parse(value);
            parsed.packs.player.stable = ['#attacker-controlled'];
            return JSON.stringify(parsed);
        })
    });
    const refused = await dispatchMessage(substituted.messageListener, { type: 'YTKIT_FETCH_SELECTOR_ASSET' });
    assert.equal(refused.ok, false, 'a substituted selector asset must be refused');
    assert.match(refused.error, /signature/i);
});

test('a feed cached before signatures existed is not served after upgrade', async () => {
    // The pre-v4.88.3 build cached under 'ytkit-feature-disable-feed' with no
    // verification, and a cache entry is served for up to 30 days without
    // refetching. Reusing the key would have kept serving an unverified — or
    // substituted — payload right through the upgrade that started verifying.
    const bg = loadBackground({ fetchImpl: signedFeedFetch('feature-disable-feed.csv') });
    bg.getLocal()['ytkit-feature-disable-feed'] = {
        text: 'astraDeck,4.0.0,4.99.0,substituted-while-unauthenticated',
        cachedAt: Date.now()
    };

    const response = await dispatchMessage(bg.messageListener, { type: 'YTKIT_FETCH_FEATURE_DISABLE_FEED' });

    assert.equal(response.source, 'network', 'the legacy entry must not answer as a fresh cache hit');
    assert.doesNotMatch(response.text, /substituted-while-unauthenticated/,
        'the unverified payload must never reach the caller');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(bg.getLocal()['ytkit-feature-disable-feed'], undefined,
        'the legacy entry must be purged once a verified feed replaces it');
    assert.ok(bg.getLocal()['ytkit-feature-disable-feed-v2'],
        'the verified feed becomes the new cache entry');
});

// --- Sender-origin policy (v4.88.3) -------------------------------------
//
// The listener authenticated the EXTENSION (`sender.id === runtime.id`) and
// nothing authenticated the PAGE. The github-full profile can hold a runtime
// host grant for an arbitrary user-typed HTTPS origin, so "our extension sent
// this" was carrying more weight than it could for the handlers that mint a
// native token, hand over YouTube cookies, or request host permissions.

const CONTENT_SCRIPT_ONLY_TYPES = [
    'NATIVE_MSG_GET_TOKEN',
    'YTKIT_COOKIE_HANDOFF',
    'YTKIT_REQUEST_OPTIONAL_HOSTS'
];

function senderOn(url) {
    return {
        id: 'astra-test-extension',
        origin: new URL(url).origin,
        url,
        tab: { id: 9, windowId: 1, index: 0, url }
    };
}

test('privileged content-script messages are refused from a non-YouTube origin', async () => {
    for (const type of CONTENT_SCRIPT_ONLY_TYPES) {
        for (const hostile of [
            'https://evil.example/page',
            // The shape that made this reachable: a user-granted host origin.
            'https://filter-lists.example.org/list.txt',
            // Lookalikes that must not satisfy a suffix check.
            'https://notyoutube.com/watch?v=1',
            'https://youtube.com.evil.example/watch?v=1'
        ]) {
            const bg = loadBackground();
            const response = await dispatchMessage(bg.messageListener, { type }, senderOn(hostile));
            assert.equal(response.ok, false, `${type} from ${hostile} must be refused`);
            assert.match(response.error, /origin/i, 'and the refusal must name the reason');
        }
    }
});

test('the same messages still pass from a real YouTube page', async () => {
    // The point of the check is to narrow the door, not close it.
    const { senderOriginAllowed } = loadBackground().context;
    for (const type of CONTENT_SCRIPT_ONLY_TYPES) {
        for (const good of [
            'https://www.youtube.com/watch?v=abc12345678',
            'https://m.youtube.com/watch?v=abc12345678',
            'https://www.youtube-nocookie.com/embed/abc12345678',
            'https://youtu.be/abc12345678'
        ]) {
            assert.equal(senderOriginAllowed(type, senderOn(good)), true,
                `${type} must still be allowed from ${good}`);
        }
    }
});

test('the origin policy covers only messages that are genuinely page-only', () => {
    // Checked against real senders rather than assumed: the AI credential
    // handlers come from popup.js and already refuse any sender with a tab,
    // and YTKIT_REPLACE_SETTINGS is sent by core/settings-controller.js, which
    // runs in both the content script and the popup.
    const { senderOriginAllowed } = loadBackground().context;
    const extensionSender = { id: 'astra-test-extension', origin: 'chrome-extension://astra-test-extension' };
    for (const type of ['YTKIT_AI_CREDENTIAL_SET', 'YTKIT_AI_CREDENTIAL_DELETE', 'YTKIT_REPLACE_SETTINGS']) {
        assert.equal(senderOriginAllowed(type, extensionSender), true,
            `${type} must remain reachable from an extension page`);
    }
    assert.equal(senderOriginAllowed('EXT_FETCH', { id: 'astra-test-extension' }), true,
        'unlisted types keep their previous behaviour');
});

test('a sender with no origin at all cannot reach a page-only handler', async () => {
    for (const type of CONTENT_SCRIPT_ONLY_TYPES) {
        const bg = loadBackground();
        const response = await dispatchMessage(bg.messageListener, { type },
            { id: 'astra-test-extension', tab: { id: 9, windowId: 1, index: 0 } });
        assert.equal(response.ok, false, `${type} must fail closed when the origin is unknown`);
    }
});
