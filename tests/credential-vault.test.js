'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createCredentialVault,
    validateProviderEndpoint
} = require('../extension/core/credential-vault');

function createHarness(options = {}) {
    const session = new Map();
    const persisted = new Map();
    const sessionStorage = {
        async get(key) { return { [key]: session.get(key) }; },
        async set(entries) { for (const [key, value] of Object.entries(entries)) session.set(key, value); },
        async remove(key) { session.delete(key); }
    };
    const persistentStore = {
        async get(provider) { return persisted.get(provider); },
        async set(provider, value) {
            if (options.failPersistentSet) throw new Error('vault unavailable');
            persisted.set(provider, value);
        },
        async delete(provider) { persisted.delete(provider); }
    };
    return {
        session,
        persisted,
        vault: createCredentialVault({ sessionStorage, persistentStore })
    };
}

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
