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

function qaDocument(options = {}) {
    const doc = fakeDocument(() => []);
    doc.activeElement = null;
    doc.dialogEvents = [];
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
            event.stopPropagation ||= function stopPropagation() { this.propagationStopped = true; };
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
        if (node.tagName === 'DIALOG') {
            const remove = node.remove.bind(node);
            node.open = false;
            node.showModal = () => {
                if (options.refuseModal) throw new Error('InvalidStateError');
                node.open = true;
                doc.dialogEvents.push('showModal');
            };
            // The browser only queues the close event, and tests fire it when it would land.
            node.close = () => {
                node.open = false;
                doc.dialogEvents.push('close');
            };
            node.remove = () => {
                doc.dialogEvents.push('remove');
                remove();
            };
        }
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
    const doc = qaDocument(options);
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
        YTKitCore: {
            aiSummaryArtifacts: artifacts,
            localAi,
            toast: { raiseActiveToasts: () => doc.dialogEvents.push('raise') }
        },
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
    assert.equal(dialog.tagName, 'DIALOG');
    assert.equal(dialog.open, true);
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

test('Transcript Q&A opens as a modal, moves focus in, and raises a toast that was already up', async () => {
    const { doc, feature } = makeFeature();
    feature._openQaPanel();
    await settle();

    assert.equal(feature._overlay.open, true);
    assert.deepEqual(doc.dialogEvents, ['showModal', 'raise']);
    assert.ok(doc.activeElement === feature._input, 'focus starts on the question box');
});

test('Transcript Q&A closes when the browser does, keeps Escape from the page, and restores the launcher', async () => {
    const { doc, feature, trigger } = makeFeature();
    feature._openQaPanel();
    await settle();
    const overlay = feature._overlay;

    const escaped = overlay.dispatch('keydown', { key: 'Escape' });
    assert.equal(escaped.propagationStopped, true, "YouTube's own key handlers don't get Escape");
    assert.ok(feature._overlay === overlay, 'the browser does the closing, not the key handler');
    const typed = overlay.dispatch('keydown', { key: 'a' });
    assert.notEqual(typed.propagationStopped, true);

    overlay.open = false;
    overlay.dispatch('close');
    assert.ok(feature._overlay === null, 'the panel state is gone');
    assert.ok(doc.activeElement === trigger, 'focus is back on the launcher');
    assert.ok(doc.dialogEvents.includes('remove'), 'the dialog left the document');
});

test('Transcript Q&A closes the dialog and rehosts toasts before it leaves the document', async () => {
    const { doc, feature, trigger } = makeFeature();
    feature._openQaPanel();
    await settle();
    doc.dialogEvents.length = 0;

    feature._closePanel();

    assert.deepEqual(doc.dialogEvents, ['close', 'raise', 'remove']);
    assert.ok(doc.activeElement === trigger, 'focus is back on the launcher');
});

test('Transcript Q&A leaves focus alone when a route change closes it', async () => {
    const { doc, feature, trigger } = makeFeature();
    feature._openQaPanel();
    await settle();

    feature._closePanel({ restoreFocus: false });

    assert.ok(feature._overlay === null, 'the panel closed');
    assert.ok(doc.activeElement !== trigger, 'focus did not jump to a launcher on the old page');
});

test('a late close event from the old panel leaves a newer one open', async () => {
    const { feature } = makeFeature();
    feature._openQaPanel();
    await settle();
    const oldOverlay = feature._overlay;

    feature._openQaPanel();
    await settle();
    const newOverlay = feature._overlay;
    assert.ok(newOverlay !== oldOverlay, 'reopening builds a new dialog');

    oldOverlay.dispatch('close');
    assert.ok(feature._overlay === newOverlay, 'the newer panel stays');
    assert.equal(newOverlay.open, true);
});

test('Transcript Q&A closes on a backdrop click and stays open for one on the card', async () => {
    const { feature } = makeFeature();
    feature._openQaPanel();
    await settle();
    const overlay = feature._overlay;
    const card = byClass(overlay, 'ytkit-ai-qa-modal__body')[0];

    const pressAndRelease = (from, to) => {
        overlay.dispatch('pointerdown', { target: from });
        overlay.dispatch('click', { target: to });
    };

    pressAndRelease(card, card);
    assert.ok(feature._overlay === overlay, 'a click inside the card keeps it open');

    pressAndRelease(card, overlay);
    assert.ok(feature._overlay === overlay, 'selecting the typed question past the edge must not lose it');

    pressAndRelease(overlay, card);
    assert.ok(feature._overlay === overlay, 'nor does a drag that ends on the card close it');

    pressAndRelease(overlay, overlay);
    assert.ok(feature._overlay === null, 'a click on the dialog itself is the backdrop');
});

test('a refused modal still leaves a working panel', async () => {
    const { doc, feature } = makeFeature({ refuseModal: true });
    assert.doesNotThrow(() => feature._openQaPanel());
    await settle();

    assert.equal(feature._overlay.open, false);
    assert.ok(doc.activeElement === feature._input, 'focus still lands on the question box');
    assert.ok(!doc.dialogEvents.includes('raise'), 'nothing to raise a toast into');
    feature._closePanel();
    assert.ok(!doc.dialogEvents.includes('close'), 'a dialog that never opened is not closed');
    assert.ok(doc.dialogEvents.includes('remove'), 'it still leaves the document');
});

test('Transcript Q&A busy state keeps controls and Escape inside the modal', async () => {
    const { doc, feature, trigger } = makeFeature();
    feature._openQaPanel();
    await settle();
    feature._askBtn.focus();

    feature._setBusy(true, 'Checking transcript evidence', true);

    assert.ok(doc.activeElement === feature._askBtn,
        'entering busy state must not blur the focused modal control to the page');
    assert.equal(feature._dialog.getAttribute('aria-busy'), 'true');
    assert.equal(feature._askBtn.disabled, false);
    assert.equal(feature._askBtn.getAttribute('aria-disabled'), 'true');
    assert.equal(feature._input.disabled, false);
    assert.equal(feature._input.readOnly, true);
    const overlay = feature._overlay;
    overlay.open = false;
    overlay.dispatch('close');
    assert.ok(feature._overlay === null, 'closing still works while busy');
    assert.ok(doc.activeElement === trigger, 'focus is back on the launcher');
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
