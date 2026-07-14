(() => {
    'use strict';

    const root = globalThis;
    const core = root.YTKitCore || (root.YTKitCore = {});
    if (core.createCredentialVault) return;

    const SESSION_PREFIX = 'ytkitAiCredential:';
    const PROVIDER_POLICIES = Object.freeze({
        openai: Object.freeze({
            origin: 'https://api.openai.com',
            defaultEndpoint: 'https://api.openai.com/v1/chat/completions',
            credentialHeader: 'Authorization',
            credentialPrefix: 'Bearer '
        }),
        anthropic: Object.freeze({
            origin: 'https://api.anthropic.com',
            defaultEndpoint: 'https://api.anthropic.com/v1/messages',
            credentialHeader: 'x-api-key',
            credentialPrefix: ''
        }),
        gemini: Object.freeze({
            origin: 'https://generativelanguage.googleapis.com',
            defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
            credentialHeader: 'x-goog-api-key',
            credentialPrefix: ''
        }),
        ollama: Object.freeze({
            origin: 'http://127.0.0.1:11434',
            defaultEndpoint: 'http://127.0.0.1:11434/v1/chat/completions',
            credentialHeader: '',
            credentialPrefix: ''
        })
    });
    const SENSITIVE_QUERY_KEYS = /^(?:key|api[-_]?key|token|access[-_]?token|client[-_]?secret|credential|auth|authorization)$/i;

    function normalizeProvider(provider) {
        const normalized = String(provider || '').trim().toLowerCase();
        return Object.prototype.hasOwnProperty.call(PROVIDER_POLICIES, normalized)
            ? normalized
            : null;
    }

    function validateProviderEndpoint(provider, endpoint) {
        const normalizedProvider = normalizeProvider(provider);
        if (!normalizedProvider) throw new Error('Unsupported AI provider.');
        const policy = PROVIDER_POLICIES[normalizedProvider];
        const parsed = new URL(String(endpoint || policy.defaultEndpoint));
        if (parsed.origin !== policy.origin) {
            throw new Error(`The ${normalizedProvider} endpoint must use ${policy.origin}.`);
        }
        for (const key of parsed.searchParams.keys()) {
            if (SENSITIVE_QUERY_KEYS.test(key)) {
                throw new Error('Credentials are not allowed in AI endpoint URLs.');
            }
        }
        return { provider: normalizedProvider, policy, url: parsed.toString() };
    }

    function createIndexedDbCredentialStore(options = {}) {
        const indexedDb = options.indexedDB || root.indexedDB;
        const databaseName = options.databaseName || 'ytkit-credential-vault';
        const storeName = options.storeName || 'credentials';

        function openDatabase() {
            if (!indexedDb?.open) return Promise.reject(new Error('Persistent credential storage is unavailable.'));
            return new Promise((resolve, reject) => {
                const request = indexedDb.open(databaseName, 1);
                request.onupgradeneeded = () => {
                    if (!request.result.objectStoreNames.contains(storeName)) {
                        request.result.createObjectStore(storeName);
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error || new Error('Could not open credential storage.'));
            });
        }

        async function transact(mode, operation) {
            const db = await openDatabase();
            try {
                return await new Promise((resolve, reject) => {
                    const transaction = db.transaction(storeName, mode);
                    const store = transaction.objectStore(storeName);
                    let request;
                    try { request = operation(store); } catch (error) { reject(error); return; }
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error || new Error('Credential storage transaction failed.'));
                    transaction.onabort = () => reject(transaction.error || new Error('Credential storage transaction aborted.'));
                });
            } finally {
                db.close();
            }
        }

        return Object.freeze({
            get(provider) { return transact('readonly', (store) => store.get(provider)); },
            set(provider, credential) { return transact('readwrite', (store) => store.put(credential, provider)); },
            delete(provider) { return transact('readwrite', (store) => store.delete(provider)); }
        });
    }

    function createCredentialVault(options = {}) {
        const sessionStorage = options.sessionStorage || root.chrome?.storage?.session || null;
        const persistentStore = options.persistentStore || createIndexedDbCredentialStore(options);
        const memorySession = new Map();

        async function sessionGet(provider) {
            const key = SESSION_PREFIX + provider;
            if (sessionStorage?.get) {
                const result = await sessionStorage.get(key);
                return typeof result?.[key] === 'string' ? result[key] : '';
            }
            return memorySession.get(provider) || '';
        }

        async function sessionSet(provider, credential) {
            const key = SESSION_PREFIX + provider;
            if (sessionStorage?.set) {
                await sessionStorage.set({ [key]: credential });
                return;
            }
            memorySession.set(provider, credential);
        }

        async function sessionDelete(provider) {
            const key = SESSION_PREFIX + provider;
            if (sessionStorage?.remove) {
                await sessionStorage.remove(key);
                return;
            }
            memorySession.delete(provider);
        }

        async function get(provider) {
            const normalized = normalizeProvider(provider);
            if (!normalized || normalized === 'ollama') return '';
            const sessionValue = await sessionGet(normalized);
            if (sessionValue) return sessionValue;
            const persisted = await persistentStore.get(normalized);
            if (typeof persisted === 'string' && persisted) {
                await sessionSet(normalized, persisted);
                return persisted;
            }
            return '';
        }

        async function set(provider, credential, setOptions = {}) {
            const normalized = normalizeProvider(provider);
            if (!normalized || normalized === 'ollama') throw new Error('This provider does not accept a stored credential.');
            const value = String(credential || '').trim();
            if (!value || value.length > 4096 || /[\r\n\0]/.test(value)) {
                throw new Error('Credential must be 1-4096 characters without control characters.');
            }
            if (setOptions.remember === true) {
                // Persistent write first: a failed remember operation must not
                // delete or supersede the legacy durable copy during migration.
                await persistentStore.set(normalized, value);
            } else {
                await persistentStore.delete(normalized);
            }
            await sessionSet(normalized, value);
            return { provider: normalized, configured: true, remembered: setOptions.remember === true };
        }

        async function remove(provider) {
            const normalized = normalizeProvider(provider);
            if (!normalized || normalized === 'ollama') throw new Error('This provider has no stored credential.');
            await persistentStore.delete(normalized);
            await sessionDelete(normalized);
            return { provider: normalized, configured: false, remembered: false };
        }

        async function status() {
            const providers = {};
            for (const provider of Object.keys(PROVIDER_POLICIES)) {
                if (provider === 'ollama') {
                    providers[provider] = { configured: true, remembered: false, credentialRequired: false };
                    continue;
                }
                const sessionValue = await sessionGet(provider);
                const persisted = await persistentStore.get(provider);
                providers[provider] = {
                    configured: Boolean(sessionValue || persisted),
                    remembered: Boolean(persisted),
                    credentialRequired: true
                };
            }
            return providers;
        }

        async function migrateLegacy(settings) {
            const source = settings && typeof settings === 'object' && !Array.isArray(settings)
                ? { ...settings }
                : {};
            const credential = typeof source.aiSummaryApiKey === 'string'
                ? source.aiSummaryApiKey.trim()
                : '';
            if (!credential) {
                delete source.aiSummaryApiKey;
                return { migrated: false, settings: source };
            }
            const provider = normalizeProvider(source.aiSummaryProvider) || 'openai';
            if (provider === 'ollama') {
                delete source.aiSummaryApiKey;
                return { migrated: false, settings: source };
            }
            await set(provider, credential, { remember: true });
            delete source.aiSummaryApiKey;
            return { migrated: true, provider, settings: source };
        }

        return Object.freeze({ get, set, remove, status, migrateLegacy });
    }

    function createUserscriptCredentialVault(options = {}) {
        const getValue = options.getValue || root.GM_getValue;
        const setValue = options.setValue || root.GM_setValue;
        const deleteValue = options.deleteValue || root.GM_deleteValue;
        const prefix = options.prefix || 'ytkit:ai-credential:';

        function keyFor(provider) {
            const normalized = normalizeProvider(provider);
            if (!normalized || normalized === 'ollama') throw new Error('This provider has no userscript credential.');
            return prefix + normalized;
        }

        async function get(provider) {
            if (normalizeProvider(provider) === 'ollama') return '';
            if (typeof getValue !== 'function') throw new Error('Userscript credential storage is unavailable.');
            const value = await Promise.resolve(getValue(keyFor(provider), ''));
            return typeof value === 'string' ? value.trim() : '';
        }

        async function set(provider, credential) {
            if (typeof setValue !== 'function') throw new Error('Userscript credential storage is unavailable.');
            const value = String(credential || '').trim();
            if (!value || value.length > 4096 || /[\r\n\0]/.test(value)) {
                throw new Error('Credential must be 1-4096 characters without control characters.');
            }
            await Promise.resolve(setValue(keyFor(provider), value));
            return { provider: normalizeProvider(provider), configured: true, remembered: true };
        }

        async function remove(provider) {
            const key = keyFor(provider);
            if (typeof deleteValue === 'function') await Promise.resolve(deleteValue(key));
            else if (typeof setValue === 'function') await Promise.resolve(setValue(key, ''));
            else throw new Error('Userscript credential storage is unavailable.');
            return { provider: normalizeProvider(provider), configured: false, remembered: false };
        }

        async function status(provider) {
            if (normalizeProvider(provider) === 'ollama') {
                return { provider: 'ollama', configured: true, remembered: false, credentialRequired: false };
            }
            return {
                provider: normalizeProvider(provider),
                configured: Boolean(await get(provider)),
                remembered: true,
                credentialRequired: true
            };
        }

        return Object.freeze({ get, set, remove, status });
    }

    Object.assign(core, {
        AI_PROVIDER_POLICIES: PROVIDER_POLICIES,
        createCredentialVault,
        createIndexedDbCredentialStore,
        createUserscriptCredentialVault,
        normalizeAiProvider: normalizeProvider,
        validateAiProviderEndpoint: validateProviderEndpoint
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            PROVIDER_POLICIES,
            createCredentialVault,
            createIndexedDbCredentialStore,
            createUserscriptCredentialVault,
            normalizeProvider,
            validateProviderEndpoint
        };
    }
})();
