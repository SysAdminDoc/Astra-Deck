'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createCredentialVault,
    createIndexedDbCredentialStore,
    validateProviderEndpoint
} = require('../extension/core/credential-vault');

function createHarness(options = {}) {
    const session = new Map();
    const persisted = new Map();
    const heldGets = [];
    const sessionStorage = {
        async get(key) { return { [key]: session.get(key) }; },
        async set(entries) { for (const [key, value] of Object.entries(entries)) session.set(key, value); },
        async remove(key) { session.delete(key); }
    };
    const persistentStore = {
        async get(provider) {
            const value = persisted.get(provider);
            // holdPersistentGet: the read resolves only when the test says,
            // with the value it saw when it started.
            if (options.holdPersistentGet) return new Promise((resolve) => heldGets.push(() => resolve(value)));
            return value;
        },
        async set(provider, value) {
            if (options.failPersistentSet) throw new Error('vault unavailable');
            persisted.set(provider, value);
        },
        async delete(provider) { persisted.delete(provider); }
    };
    return {
        session,
        persisted,
        releaseGets() { for (const release of heldGets.splice(0)) release(); },
        vault: createCredentialVault({ sessionStorage, persistentStore })
    };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

// IndexedDB shaped enough for transact(): every request succeeds, then the
// transaction either completes or aborts at commit (abortOnCommit).
function createFakeIndexedDb({ abortOnCommit = false } = {}) {
    const rows = new Map();
    const fire = (fn) => setImmediate(fn);
    const db = {
        objectStoreNames: { contains: () => true },
        close() {},
        transaction() {
            const transaction = { error: null };
            const settle = () => {
                if (abortOnCommit) {
                    transaction.error = new Error('QuotaExceededError');
                    transaction.onabort?.();
                } else {
                    transaction.oncomplete?.();
                }
            };
            const request = (run) => {
                const req = {};
                fire(() => {
                    req.result = run();
                    req.onsuccess?.();
                    fire(settle);
                });
                return req;
            };
            transaction.objectStore = () => ({
                get: (key) => request(() => rows.get(key)),
                put: (value, key) => request(() => { rows.set(key, value); return key; }),
                delete: (key) => request(() => { rows.delete(key); })
            });
            return transaction;
        }
    };
    return {
        rows,
        open() {
            const req = {};
            fire(() => { req.result = db; req.onsuccess?.(); });
            return req;
        }
    };
}

test('a get racing a remove does not write the removed credential back to the session', async () => {
    const harness = createHarness({ holdPersistentGet: true });
    harness.persisted.set('openai', 'sk-removed');

    const pending = harness.vault.get('openai');
    await tick();
    await harness.vault.remove('openai');
    harness.releaseGets();
    await pending;

    assert.equal(harness.session.has('ytkitAiCredential:openai'), false,
        'the removed key must not reappear in session custody');
});

test('a get racing a set does not overwrite the new session credential', async () => {
    const harness = createHarness({ holdPersistentGet: true });
    harness.persisted.set('openai', 'sk-old');

    const pending = harness.vault.get('openai');
    await tick();
    await harness.vault.set('openai', 'sk-new');
    harness.releaseGets();
    await pending;

    assert.equal(harness.session.get('ytkitAiCredential:openai'), 'sk-new');
});

test('indexedDB credential writes resolve on commit, not on request success', async () => {
    const ok = createFakeIndexedDb();
    const store = createIndexedDbCredentialStore({ indexedDB: ok });
    await store.set('openai', 'sk-kept');
    assert.equal(await store.get('openai'), 'sk-kept');

    const quota = createIndexedDbCredentialStore({ indexedDB: createFakeIndexedDb({ abortOnCommit: true }) });
    await assert.rejects(quota.set('openai', 'sk-lost'), /QuotaExceededError/,
        'a commit-time abort must reach the caller instead of a premature success');
});

test('credentials default to session custody and status never reveals values', async () => {
    const harness = createHarness();
    await harness.vault.set('openai', 'sk-session-only');

    assert.equal(await harness.vault.get('openai'), 'sk-session-only');
    assert.equal(harness.persisted.size, 0);
    assert.deepEqual((await harness.vault.status()).openai, {
        configured: true,
        remembered: false,
        credentialRequired: true
    });
    assert.doesNotMatch(JSON.stringify(await harness.vault.status()), /sk-session-only/);
});

test('remembered credentials persist and delete clears both custody tiers', async () => {
    const harness = createHarness();
    await harness.vault.set('anthropic', 'sk-ant', { remember: true });
    assert.equal(harness.persisted.get('anthropic'), 'sk-ant');

    await harness.vault.remove('anthropic');
    assert.equal(await harness.vault.get('anthropic'), '');
    assert.equal(harness.persisted.has('anthropic'), false);
});

test('legacy migration writes the vault before removing the ordinary setting', async () => {
    const failed = createHarness({ failPersistentSet: true });
    const legacy = { aiSummaryProvider: 'gemini', aiSummaryApiKey: 'legacy-secret', hideSidebar: true };
    await assert.rejects(failed.vault.migrateLegacy(legacy), /vault unavailable/);
    assert.equal(legacy.aiSummaryApiKey, 'legacy-secret');

    const harness = createHarness();
    const result = await harness.vault.migrateLegacy(legacy);
    assert.equal(result.migrated, true);
    assert.equal(result.settings.aiSummaryApiKey, undefined);
    assert.equal(result.settings.hideSidebar, true);
    assert.equal(harness.persisted.get('gemini'), 'legacy-secret');
});

test('provider endpoint validation binds credentials to exact approved origins', () => {
    assert.equal(
        validateProviderEndpoint('gemini', 'https://generativelanguage.googleapis.com/v1beta/models/x:generateContent').url,
        'https://generativelanguage.googleapis.com/v1beta/models/x:generateContent'
    );
    assert.throws(
        () => validateProviderEndpoint('gemini', 'https://evil.example/v1beta/models/x'),
        /must use https:\/\/generativelanguage\.googleapis\.com/
    );
    assert.throws(
        () => validateProviderEndpoint('gemini', 'https://generativelanguage.googleapis.com/v1beta/models/x?key=secret'),
        /Credentials are not allowed/
    );
});
