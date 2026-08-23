'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const artifacts = require('../../extension/core/ai-summary-artifacts');
const { loadFeature, fakeNode, fakeDocument } = require('../helpers/monolith');

function collect(root, predicate) {
    const found = [];
    (function walk(node) {
        for (const child of node?.children || []) {
            if (predicate(child)) found.push(child);
            walk(child);
        }
    })(root);
    return found;
}

function byClass(root, className) {
    return collect(root, (node) => node.classList?.contains?.(className));
}

function qaDocument() {
    const doc = fakeDocument(() => []);
    doc.activeElement = null;
    const create = doc.createElement.bind(doc);
    doc.createElement = (tag) => {
        const node = create(tag);
        const listeners = new Map();
        node.addEventListener = (type, handler) => {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(handler);
        };
        node.removeEventListener = (type, handler) => listeners.get(type)?.delete(handler);
        node.dispatch = (type, event = {}) => {
            event.target ||= node;
            event.currentTarget = node;
            event.preventDefault ||= function preventDefault() { this.defaultPrevented = true; };
            for (const handler of listeners.get(type) || []) handler(event);
            return event;
        };
        node.click = () => {
            node.clicked += 1;
            node.dispatch('click', { target: node });
        };
        node.focus = () => { doc.activeElement = node; };
        node.querySelectorAll = (selector) => {
            if (selector.includes('button:not([disabled])')) {
                return collect(node, (candidate) => {
                    if (candidate.disabled) return false;
                    if (candidate.tagName === 'BUTTON' || candidate.tagName === 'TEXTAREA') return true;
                    if (candidate.tagName === 'A' && candidate.href) return true;
                    return candidate.hasAttribute?.('tabindex') && candidate.getAttribute('tabindex') !== '-1';
                });
            }
            return collect(node, (candidate) => {
                try { return candidate.matches?.(selector); } catch (_) { return false; }
            });
        };
        node.querySelector = (selector) => node.querySelectorAll(selector)[0] || null;
        return node;
    };
    return doc;
}

function makeTranscript() {
    const segments = [
        { startMs: 0, endMs: 4000, text: 'Opening context.' },
        { startMs: 65000, endMs: 70000, text: 'The central finding is supported here.' },
        { startMs: 130000, endMs: 136000, text: 'The closing recommendation follows.' }
    ];
    return {
        videoId: 'abc12345678',
        title: 'Transcript fixture',
        language: 'en',
        prepared: artifacts.prepareQaTranscript(segments)
    };
}

function makeFeature(options = {}) {
    const doc = qaDocument();
    const trigger = doc.createElement('button');
    trigger.isConnected = true;
    trigger.focus();
    const store = new Map([['ytkit-ai-transcript-qa', options.initialStore || {}]]);
    const styles = [];
    const logs = [];
    const grants = [];
    const prompts = [];
    const localAi = options.localAi || {
        has: (kind) => kind === 'prompt',
        availability: async () => 'available',
        create: async () => ({
            prompt: async (prompt) => {
                prompts.push(prompt);
                return JSON.stringify({
                    notFound: false,
                    claims: [{ text: 'The central finding is supported.', citations: ['C0002'] }]
                });
            },
            destroy() {}
        })
    };
    const appState = {
        settings: {
            transcriptQaLane: options.lane || 'on-device',
            aiSummaryProvider: options.provider || 'ollama',
            aiSummaryModel: options.model || 'fixture-model'
        }
    };
    const remote = options.remote || {
        async _requestByoHostAccess(featureId) { grants.push(featureId); },
        async _callLLM(prompt) {
            prompts.push(prompt);
            return JSON.stringify({
                notFound: false,
                claims: [{ text: 'The configured provider found evidence.', citations: ['C0002'] }]
            });
        }
    };
    const feature = loadFeature('localAiTranscriptQa', {
        document: doc,
        window: {},
        appState,
        YTKitCore: { aiSummaryArtifacts: artifacts, localAi },
        DebugManager: { log: (...args) => logs.push(args.join(' ')) },
        StorageManager: {
            get: (key, fallback) => (store.has(key) ? store.get(key) : fallback),
            setSync: (key, value) => {
                store.set(key, value);
                return Promise.resolve({ ok: true });
            }
        },
        STORAGE_KEYS: { aiTranscriptQa: 'ytkit-ai-transcript-qa' },
        DiagnosticLog: { record() {} },
        failureText: (_context, _error, _key, fallback) => fallback,
        injectStyle: (css) => { styles.push(css); return fakeNode(); },
        getFeatureById: (id) => (id === 'aiVideoSummary' ? remote : null)
    });
    feature._btn = trigger;
    feature._fetchTranscript = async () => makeTranscript();
    return { appState, doc, feature, grants, logs, prompts, remote, store, styles, trigger };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('Transcript Q&A renders a localized modal with live status and citation links', async () => {
    const fixture = makeFeature();
    fixture.feature._ensureStyles();
    fixture.feature._openQaPanel();
    await settle();

    const dialog = fixture.feature._dialog;
    assert.equal(dialog.getAttribute('role'), 'dialog');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.equal(dialog.getAttribute('aria-labelledby'), 'ytkit-ai-qa-title');
    assert.equal(dialog.getAttribute('aria-describedby'), 'ytkit-ai-qa-description');
    assert.equal(fixture.feature._status.getAttribute('role'), 'status', fixture.logs.join('\n'));
    assert.equal(fixture.feature._status.getAttribute('aria-live'), 'polite');
    assert.equal(fixture.feature._history.getAttribute('role'), 'log');
    assert.equal(fixture.feature._history.getAttribute('aria-live'), 'polite');
    assert.equal(byClass(dialog, 'ytkit-ai-qa-empty').length, 1);

    fixture.feature._input.value = 'What is the central finding?';
    await fixture.feature._askQuestion();

    assert.equal(byClass(dialog, 'ytkit-ai-qa-turn').length, 1);
    assert.equal(byClass(dialog, 'ytkit-ai-qa-claim')[0].textContent,
        'The central finding is supported.1:05');
    const citation = byClass(dialog, 'ytkit-ai-qa-citation')[0];
    assert.equal(citation.textContent, '1:05');
    assert.equal(citation.href, 'https://www.youtube.com/watch?v=abc12345678&t=65s');
    assert.match(citation.getAttribute('aria-label'), /Transcript citation 1:05/);
    assert.equal(Object.values(fixture.store.get('ytkit-ai-transcript-qa'))[0].turns.length, 1);

    const css = fixture.styles.join('\n');
    assert.match(css, /html:not\(\[dark\]\) \.ytkit-ai-qa-modal__body/);
    assert.match(css, /@media\(forced-colors:active\)/);
    assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
    assert.match(css, /\.ytkit-ai-qa-modal textarea:focus-visible/);
});

test('Transcript Q&A traps focus, closes on Escape, and restores the launcher', async () => {
    const { doc, feature, trigger } = makeFeature();
    feature._openQaPanel();
    await settle();

    const controls = feature._dialog.querySelectorAll(
        'a[href],button:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    );
    const first = controls[0];
    const last = controls.at(-1);
    last.focus();
    const wrapped = feature._overlay.dispatch('keydown', { key: 'Tab', shiftKey: false });
    assert.equal(wrapped.defaultPrevented, true);
    assert.equal(doc.activeElement, first);

    first.focus();
    const reverse = feature._overlay.dispatch('keydown', { key: 'Tab', shiftKey: true });
    assert.equal(reverse.defaultPrevented, true);
    assert.equal(doc.activeElement, last);

    const escaped = feature._overlay.dispatch('keydown', { key: 'Escape' });
    assert.equal(escaped.defaultPrevented, true);
    assert.equal(feature._overlay, null);
    assert.equal(doc.activeElement, trigger);
});

test('Transcript Q&A busy state keeps controls and Escape inside the modal', async () => {
    const { doc, feature, trigger } = makeFeature();
    feature._openQaPanel();
    await settle();
    feature._askBtn.focus();

    feature._setBusy(true, 'Checking transcript evidence', true);

    assert.equal(doc.activeElement, feature._askBtn,
        'entering busy state must not blur the focused modal control to the page');
    assert.equal(feature._askBtn.disabled, false);
    assert.equal(feature._askBtn.getAttribute('aria-disabled'), 'true');
    assert.equal(feature._input.disabled, false);
    assert.equal(feature._input.readOnly, true);
    const escaped = feature._overlay.dispatch('keydown', { key: 'Escape' });
    assert.equal(escaped.defaultPrevented, true);
    assert.equal(feature._overlay, null);
    assert.equal(doc.activeElement, trigger);
});

test('Transcript Q&A uses the configured provider only after its existing grant gate', async () => {
    let localCreateCalls = 0;
    const fixture = makeFeature({
        lane: 'configured-provider',
        provider: 'ollama',
        model: 'qwen-fixture',
        localAi: {
            has: () => true,
            availability: async () => 'available',
            create: async () => { localCreateCalls += 1; return null; }
        }
    });
    fixture.feature._openQaPanel();
    await settle();
    fixture.feature._input.value = 'What is supported?';

    await fixture.feature._askQuestion();

    assert.deepEqual(fixture.grants, ['localAiTranscriptQa']);
    assert.equal(localCreateCalls, 0);
    assert.match(fixture.prompts[0], /Prompt version: transcript-qa-citation-v1/);
    const saved = Object.values(fixture.store.get('ytkit-ai-transcript-qa'))[0];
    assert.equal(saved.provider, 'ollama');
    assert.equal(saved.model, 'qwen-fixture');
    assert.equal(saved.turns[0].claims[0].text, 'The configured provider found evidence.');
});

test('Transcript Q&A cannot reuse remote provider access after the effective profile becomes store-safe', async () => {
    const dataFlow = require('../../extension/core/data-flow');
    let providerCalls = 0;
    const blockedRemote = loadFeature('aiVideoSummary', {
        appState: {
            settings: {
                aiSummaryProvider: 'ollama',
                aiSummaryEndpoint: 'http://127.0.0.1:11434/api/chat',
                aiSummaryModel: 'fixture-model',
                safeStoreProfile: true,
                githubFullProfile: false
            }
        },
        URL,
        hasExtensionContext: () => true,
        settingsManager: {
            _getPolicyProfile: () => ({ resolveEffectiveProfile: () => 'store-safe' })
        },
        YTKitBrowser: {
            runtime: {
                getManifest: () => ({
                    host_permissions: ['http://127.0.0.1:11434/*'],
                    optional_host_permissions: [
                        'https://api.openai.com/*',
                        'https://api.anthropic.com/*',
                        'https://generativelanguage.googleapis.com/*'
                    ]
                })
            }
        },
        YTKitCore: {
            AI_PROVIDER_POLICIES: {
                ollama: { defaultEndpoint: 'http://127.0.0.1:11434/api/chat' }
            },
            ORIGIN_CATALOGUE: dataFlow.ORIGIN_CATALOGUE,
            getOptionalHostPermissionsForFeature: dataFlow.getOptionalHostPermissionsForFeature,
            isOriginAvailableForProfile: dataFlow.isOriginAvailableForProfile,
            validateAiProviderEndpoint: () => ({ url: 'http://127.0.0.1:11434/api/chat' })
        }
    });
    blockedRemote._callLLM = async () => {
        providerCalls += 1;
        return '{"notFound":true,"claims":[]}';
    };
    const fixture = makeFeature({ lane: 'configured-provider', remote: blockedRemote });
    fixture.feature._openQaPanel();
    await settle();
    fixture.feature._input.value = 'Can this leave the browser?';

    await fixture.feature._askQuestion();

    assert.equal(providerCalls, 0, 'profile rejection must happen before any provider request');
    assert.match(fixture.feature._status.textContent, /build or profile/i);
});

test('Transcript Q&A reopens only the conversation matching language, provider, model, and prompt version', async () => {
    const identity = {
        videoId: 'abc12345678',
        title: 'Transcript fixture',
        language: 'en',
        provider: 'chrome-on-device',
        model: 'prompt-api',
        promptVersion: artifacts.QA_PROMPT_VERSION
    };
    const transcript = makeTranscript();
    const context = artifacts.selectQaContext(transcript.prepared, 'What is central?');
    const result = artifacts.parseQaResponse(JSON.stringify({
        notFound: false,
        claims: [{ text: 'Saved answer.', citations: ['C0002'] }]
    }), context.cues);
    const conversation = artifacts.appendQaTurn(artifacts.createQaConversation(identity), {
        question: 'What is central?', result, cues: context.cues
    });
    const fixture = makeFeature({ initialStore: artifacts.mergeQaConversation({}, conversation) });

    fixture.feature._openQaPanel();
    await settle();

    assert.equal(byClass(fixture.feature._dialog, 'ytkit-ai-qa-turn').length, 1);
    assert.match(fixture.feature._status.textContent, /restored/i);
    fixture.appState.settings.aiSummaryModel = 'different-model';
    fixture.appState.settings.transcriptQaLane = 'configured-provider';
    fixture.feature._input.value = 'Start a different conversation';
    await fixture.feature._askQuestion();
    assert.equal(Object.keys(fixture.store.get('ytkit-ai-transcript-qa')).length, 2);
});

test('Transcript Q&A durable domain sanitizes backup writes through the citation store', () => {
    const modulePath = require.resolve('../../extension/core/persisted-domains');
    delete require.cache[modulePath];
    globalThis.YTKitCore = { aiSummaryArtifacts: artifacts };
    const persisted = require('../../extension/core/persisted-domains');
    const domain = persisted.DURABLE_DOMAIN_REGISTRY.find((entry) => entry.id === 'aiTranscriptQa');
    assert.equal(domain?.key, 'ytkit-ai-transcript-qa');
    assert.equal(domain?.backup, 'include');
    assert.deepEqual(persisted.sanitizeDomainValue('aiTranscriptQa', {
        bad: { videoId: '../escape', turns: [{ question: '<script>' }] }
    }), {});
    const writes = persisted.domainsToExtensionWrites({ aiTranscriptQa: {} });
    assert.deepEqual(writes['ytkit-ai-transcript-qa'], {});
});
