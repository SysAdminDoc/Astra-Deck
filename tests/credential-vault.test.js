'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createCredentialVault,
    createUserscriptCredentialVault,
    validateProviderEndpoint
} = require('../extension/core/credential-vault');
require('../extension/core/ai-summary-artifacts');
const { createUserscriptAiSummaryFeature } = require('../extension/core/userscript-ai-summary');

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

test('userscript custody stays in manager-isolated values', async () => {
    const values = new Map();
    const vault = createUserscriptCredentialVault({
        getValue(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
        setValue(key, value) { values.set(key, value); },
        deleteValue(key) { values.delete(key); }
    });

    await vault.set('gemini', 'manager-secret');
    assert.equal(values.get('ytkit:ai-credential:gemini'), 'manager-secret');
    assert.equal(await vault.get('gemini'), 'manager-secret');
    assert.doesNotMatch(JSON.stringify(await vault.status('gemini')), /manager-secret/);
    await vault.remove('gemini');
    assert.equal(values.size, 0);
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

test('userscript provider requests keep Gemini credentials in headers', async () => {
    const values = new Map([['ytkit:ai-credential:gemini', 'gemini-manager-secret']]);
    let requestDetails = null;
    const feature = createUserscriptAiSummaryFeature({
        document: {},
        getSettings: () => ({
            aiSummaryProvider: 'gemini',
            aiSummaryEndpoint: 'https://api.openai.com/v1/chat/completions',
            aiSummaryModel: 'gemini-2.0-flash'
        }),
        getVideoId: () => 'abcdefghijk',
        transcriptService: {},
        addNavigateRule() {},
        removeNavigateRule() {},
        injectStyle() {},
        credentialStore: {
            getValue(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
            setValue(key, value) { values.set(key, value); },
            deleteValue(key) { values.delete(key); }
        },
        request(details) {
            requestDetails = details;
            queueMicrotask(() => details.onload({
                status: 200,
                responseText: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'summary' }] } }] })
            }));
        }
    });

    assert.equal(await feature._call('Summarize this.'), 'summary');
    assert.equal(requestDetails.url.includes('gemini-manager-secret'), false);
    assert.equal(requestDetails.url.includes('?key='), false);
    assert.equal(requestDetails.headers['x-goog-api-key'], 'gemini-manager-secret');
    assert.equal(requestDetails.data.includes('gemini-manager-secret'), false);
});

test('userscript AI summary uses the local browser lane without a provider request', async () => {
    const makeNode = (tag) => {
        const node = {
            tagName: String(tag).toUpperCase(),
            children: [],
            textContent: '',
            append(...items) { this.children.push(...items); },
            appendChild(item) { this.children.push(item); },
            setAttribute() {},
            addEventListener() {},
            remove() { this.removed = true; }
        };
        return node;
    };
    const doc = {
        body: makeNode('body'),
        createElement: makeNode,
        querySelector: () => null
    };
    let created = 0;
    let destroyed = 0;
    let requests = 0;
    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    core.localAi = {
        getFactory: () => ({ create: async () => ({}) }),
        availability: async () => 'available',
        create: async () => {
            created += 1;
            return {
                summarize: async () => 'A local summary.',
                destroy: () => { destroyed += 1; }
            };
        }
    };
    try {
        const feature = createUserscriptAiSummaryFeature({
            document: doc,
            getSettings: () => ({ aiSummaryProvider: 'openai' }),
            getVideoId: () => 'abcdefghijk',
            transcriptService: {
                fetchTranscript: async () => ({
                    status: 'ready',
                    title: 'Local lane test',
                    language: 'en',
                    segments: [{ start: 0, end: 2, text: 'A sufficiently long transcript cue.' }]
                })
            },
            addNavigateRule() {},
            removeNavigateRule() {},
            injectStyle() {},
            credentialStore: {},
            request() { requests += 1; }
        });

        await feature._run();

        assert.equal(created, 1);
        assert.equal(destroyed, 1);
        assert.equal(requests, 0);
        assert.match(feature._panel.children[1].textContent, /On-device summary/);
        assert.match(feature._panel.children[1].textContent, /A local summary/);
    } finally {
        delete core.localAi;
    }
});
