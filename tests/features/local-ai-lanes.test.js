'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFeature, fakeNode, fakeDocument } = require('../helpers/monolith');

function documentForFeature() {
    return Object.assign(fakeDocument(() => []), {
        createElement: (tag) => fakeNode({ tag })
    });
}

function dialogDocument(options = {}) {
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
        node.dispatch = (type, event = {}) => {
            event.target ||= node;
            event.stopPropagation ||= function stopPropagation() { this.propagationStopped = true; };
            for (const handler of listeners.get(type) || []) handler(event);
            return event;
        };
        node.focus = () => { doc.activeElement = node; };
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

function dialogFeature(options = {}) {
    const doc = dialogDocument(options);
    const feature = loadFeature('localAiSummary', {
        document: doc,
        window: {},
        YTKitCore: {
            localAi: options.localAi,
            toast: { raiseActiveToasts: () => doc.dialogEvents.push('raise') }
        },
        getVideoId: () => 'abc12345678',
        getFeatureById: () => options.remote || null,
        showToast: () => {}
    });
    const launcher = doc.createElement('button');
    feature._btn = launcher;
    return { doc, feature, launcher };
}

function closeButton(overlay) {
    return overlay.children[0].children.find((child) => child.tagName === 'BUTTON');
}

test('Local Summary opens a labelled modal with focus on Close', () => {
    const { doc, feature } = dialogFeature();
    feature._renderModal('Local Summary', 'The answer.');
    const overlay = feature._modal;

    assert.equal(overlay.tagName, 'DIALOG');
    assert.equal(overlay.open, true);
    assert.deepEqual(doc.dialogEvents, ['showModal', 'raise']);
    assert.equal(overlay.getAttribute('aria-labelledby'), 'ytkit-local-ai-title');
    assert.equal(overlay.getAttribute('aria-describedby'), 'ytkit-local-ai-text');
    assert.equal(feature._modalTitle.id, 'ytkit-local-ai-title');
    assert.equal(feature._modalText.id, 'ytkit-local-ai-text');
    assert.equal(feature._modalText.getAttribute('aria-live'), 'polite');
    assert.ok(doc.activeElement === closeButton(overlay), 'focus starts on Close');
});

test('a second render keeps the open dialog and announces the new words', () => {
    const { doc, feature } = dialogFeature();
    feature._renderModal('Local Summarizer', 'Loading');
    const overlay = feature._modal;
    const button = closeButton(overlay);
    doc.dialogEvents.length = 0;

    feature._renderModal('Local Summary', 'The answer.');

    assert.ok(feature._modal === overlay, 'the same dialog stays open');
    assert.ok(doc.activeElement === button, 'focus stays where it was');
    assert.equal(feature._modalTitle.textContent, 'Local Summary');
    assert.equal(feature._modalText.textContent, 'The answer.');
    assert.deepEqual(doc.dialogEvents, []);
});

test('Close shuts the dialog, rehosts toasts before it leaves, and restores the launcher', () => {
    const { doc, feature, launcher } = dialogFeature();
    feature._renderModal('Local Summary', 'The answer.');
    const overlay = feature._modal;
    doc.dialogEvents.length = 0;

    closeButton(overlay).dispatch('click');

    assert.deepEqual(doc.dialogEvents, ['close', 'raise', 'remove']);
    assert.ok(feature._modal === null, 'the dialog state is gone');
    assert.ok(doc.activeElement === launcher, 'focus is back on the launcher');
});

test('the dialog closes when the browser does and keeps Escape from the page', () => {
    const { doc, feature, launcher } = dialogFeature();
    feature._renderModal('Local Summary', 'The answer.');
    const overlay = feature._modal;

    const escaped = overlay.dispatch('keydown', { key: 'Escape' });
    assert.equal(escaped.propagationStopped, true, "YouTube's own key handlers don't get Escape");
    assert.ok(feature._modal === overlay, 'the browser does the closing, not the key handler');
    const typed = overlay.dispatch('keydown', { key: 'a' });
    assert.notEqual(typed.propagationStopped, true);

    overlay.open = false;
    overlay.dispatch('close');
    assert.ok(feature._modal === null, 'the dialog state is gone');
    assert.ok(doc.dialogEvents.includes('remove'), 'it left the document');
    assert.ok(doc.activeElement === launcher, 'focus is back on the launcher');
});

test('a late close event from the old dialog leaves a newer one open', () => {
    const { feature } = dialogFeature();
    feature._renderModal('Local Summary', 'First.');
    const oldOverlay = feature._modal;
    feature._closeModal();
    feature._renderModal('Local Summary', 'Second.');
    const newOverlay = feature._modal;
    assert.ok(newOverlay !== oldOverlay, 'reopening builds a new dialog');

    oldOverlay.dispatch('close');
    assert.ok(feature._modal === newOverlay, 'the newer dialog stays');
    assert.equal(newOverlay.open, true);
});

test('the dialog closes on a backdrop click and stays open for one on the card', () => {
    const { feature } = dialogFeature();
    feature._renderModal('Local Summary', 'The answer.');
    const overlay = feature._modal;

    overlay.dispatch('click', { target: overlay.children[0] });
    assert.ok(feature._modal === overlay, 'a click inside the card keeps it open');

    overlay.dispatch('click', { target: overlay });
    assert.ok(feature._modal === null, 'a click on the dialog itself is the backdrop');
});

test('a route change closes the dialog without pulling focus to the old launcher', () => {
    const { doc, feature, launcher } = dialogFeature();
    feature._renderModal('Local Summary', 'The answer.');

    feature._closeModal({ restoreFocus: false });

    assert.ok(feature._modal === null, 'the dialog closed');
    assert.ok(doc.activeElement !== launcher, 'focus stayed put');
});

test('a refused modal still leaves a working dialog', () => {
    const { doc, feature } = dialogFeature({ refuseModal: true });
    assert.doesNotThrow(() => feature._renderModal('Local Summary', 'The answer.'));
    const overlay = feature._modal;

    assert.equal(overlay.open, false);
    assert.ok(doc.activeElement === closeButton(overlay), 'focus still lands on Close');
    assert.ok(!doc.dialogEvents.includes('raise'), 'nothing to raise a toast into');
    feature._closeModal();
    assert.ok(!doc.dialogEvents.includes('close'), 'a dialog that never opened is not closed');
    assert.ok(doc.dialogEvents.includes('remove'), 'it still leaves the document');
});

test('closing while the model runs cancels it, so the answer never reopens the dialog', async () => {
    let finishSummary;
    let destroyed = 0;
    const localAi = {
        has: () => true,
        availability: async () => 'available',
        create: async () => ({
            summarize: () => new Promise((resolve) => { finishSummary = resolve; }),
            destroy: () => { destroyed += 1; }
        })
    };
    const { feature } = dialogFeature({ localAi });
    feature._fetchTranscript = async () => 'A sufficiently long transcript for the local summary lane.';

    const run = feature._summarize();
    assert.ok(feature._modal, 'the loading dialog is up');
    assert.equal(feature._modalText.textContent, 'Loading transcript and running the local model\u2026');
    while (!finishSummary) await new Promise(setImmediate);

    feature._closeModal();
    finishSummary('Too late.');
    await run;

    assert.ok(feature._modal === null, 'the answer did not reopen it');
    assert.equal(destroyed, 1);
});

test('closing while the model is checked stops the hand-off to the BYO-key lane', async () => {
    let finishAvailability;
    const remoteRuns = [];
    const localAi = {
        has: () => true,
        availability: () => new Promise((resolve) => { finishAvailability = resolve; })
    };
    const { feature } = dialogFeature({ localAi, remote: { _run: async () => remoteRuns.push(1) } });

    const run = feature._summarize();
    feature._closeModal();
    finishAvailability('unavailable');
    await run;

    assert.deepEqual(remoteRuns, []);
});

test('the hand-off to the BYO-key lane takes the loading dialog down first', async () => {
    const order = [];
    const localAi = { has: () => true, availability: async () => 'unavailable' };
    const { doc, feature, launcher } = dialogFeature({
        localAi,
        remote: {
            _run: async () => {
                order.push(feature._modal === null ? 'run with no dialog' : 'run under the dialog');
                order.push(doc.dialogEvents.includes('remove') ? 'removed' : 'still there');
            }
        }
    });

    await feature._summarize();

    assert.deepEqual(order, ['run with no dialog', 'removed']);
    assert.ok(doc.activeElement === launcher, 'focus is back on the launcher, not lost');
});

test('Local Summary uses the browser lane without invoking the BYO-key feature', async () => {
    let created = 0;
    let destroyed = 0;
    const rendered = [];
    const remoteRuns = [];
    const localAi = {
        has: (kind) => kind === 'summarizer',
        availability: async () => 'available',
        create: async () => {
            created += 1;
            return {
                summarize: async (text) => `Local(${text.slice(0, 8)})`,
                destroy: () => { destroyed += 1; }
            };
        }
    };
    const feature = loadFeature('localAiSummary', {
        document: documentForFeature(),
        window: {},
        YTKitCore: { localAi },
        getFeatureById: (id) => id === 'aiVideoSummary'
            ? { _run: async (options) => remoteRuns.push(options) }
            : null
    });
    feature._fetchTranscript = async () => 'A sufficiently long transcript for the local summary lane.';
    feature._renderModal = (title, body) => rendered.push({ title, body });

    await feature._summarize();

    assert.equal(created, 1);
    assert.equal(destroyed, 1);
    assert.deepEqual(remoteRuns, []);
    const result = rendered.at(-1);
    assert.equal(result.title, 'Local Summary');
    assert.match(result.body, /^Local\(/);
});

test('Local Summary explicitly hands off to the configured BYO-key lane', async () => {
    const notices = [];
    const remoteRuns = [];
    const localAi = {
        has: () => false,
        availability: async () => 'unavailable'
    };
    const feature = loadFeature('localAiSummary', {
        document: documentForFeature(),
        window: {},
        YTKitCore: { localAi },
        showToast: (message) => notices.push(message),
        getFeatureById: (id) => id === 'aiVideoSummary'
            ? { _run: async (options) => remoteRuns.push(options) }
            : null
    });
    feature._renderModal = () => assert.fail('the configured fallback should be invoked');

    await feature._summarize();

    assert.equal(remoteRuns.length, 1);
    assert.match(remoteRuns[0].laneNotice, /BYO-key/);
    assert.ok(notices.some((message) => /BYO-key/.test(message)));
});

test('transcript translation reports the local lane and preserves source cues', async () => {
    const button = fakeNode({ tag: 'button' });
    const localAi = {
        has: (kind) => kind === 'translator',
        availability: async () => 'available',
        create: async () => ({
            translate: async (text) => `Local(${text})`,
            destroy() {}
        })
    };
    const feature = loadFeature('transcriptViewer', {
        document: documentForFeature(),
        window: { Translator: { create() {} } },
        navigator: { language: 'en-US' },
        YTKitCore: { localAi },
        getFeatureById: () => null
    });
    // A real panel is attached; the translation path bails when it is not.
    feature._panel = { querySelector: () => button, isConnected: true };
    feature._cues = [{ start: 0, text: 'Bonjour' }, { start: 2, text: 'monde' }];
    feature._detectTranscriptLanguage = async () => 'fr';
    feature._renderCueTexts = () => {};

    await feature._translateTranscript();

    assert.equal(feature._translationLane, 'local');
    assert.deepEqual(feature._cues.map((cue) => cue.text), ['Bonjour', 'monde']);
    assert.deepEqual(Array.from(feature._translatedCues, (cue) => cue.text), ['Local(Bonjour)', 'Local(monde)']);
    assert.equal(feature._showingTranslation, true);
});

test('transcript translation explicitly falls back to BYO-key output', async () => {
    const button = fakeNode({ tag: 'button' });
    const notices = [];
    const calls = [];
    const localAi = {
        has: () => false,
        availability: async () => 'unavailable'
    };
    const remote = {
        _requestByoHostAccess: async () => { calls.push('grant'); },
        _callLLM: async (prompt) => {
            calls.push(prompt);
            return JSON.stringify(['Hola', 'mundo']);
        }
    };
    const feature = loadFeature('transcriptViewer', {
        document: documentForFeature(),
        window: {},
        navigator: { language: 'en-US' },
        YTKitCore: { localAi },
        showToast: (message) => notices.push(message),
        getFeatureById: (id) => id === 'aiVideoSummary' ? remote : null
    });
    // A real panel is attached; the translation path bails when it is not.
    feature._panel = { querySelector: () => button, isConnected: true };
    feature._cues = [{ start: 0, text: 'Bonjour' }, { start: 2, text: 'monde' }];
    feature._detectTranscriptLanguage = async () => 'fr';
    feature._renderCueTexts = () => {};

    await feature._translateTranscript();

    assert.equal(feature._translationLane, 'byo-key');
    assert.deepEqual(Array.from(feature._translatedCues, (cue) => cue.text), ['Hola', 'mundo']);
    assert.equal(calls[0], 'grant');
    assert.match(calls[1], /untrusted source material/);
    assert.ok(notices.some((message) => /BYO-key/.test(message)));
});

test('transcript translation started on one video never writes into the next', () => {
    // Autoplay navigates without a click, so the panel can be torn down and
    // rebuilt while the translation is still awaiting. Every await in the load
    // path re-checks the generation; this path checked nothing, so video A's
    // cues were painted into video B's panel and B's button was flipped to
    // "Show Original".
    const button = fakeNode({ tag: 'button' });
    const localAi = {
        has: (kind) => kind === 'translator',
        availability: async () => 'available',
        create: async () => ({
            translate: async (text) => `Local(${text})`,
            destroy() {}
        })
    };
    const feature = loadFeature('transcriptViewer', {
        document: documentForFeature(),
        window: { Translator: { create() {} } },
        navigator: { language: 'en-US' },
        YTKitCore: { localAi },
        getFeatureById: () => null
    });
    feature._panel = { querySelector: () => button, isConnected: true };
    feature._cues = [{ start: 0, text: 'Bonjour' }, { start: 2, text: 'monde' }];
    feature._renderCueTexts = () => assert.fail('a stale translation must not render');
    // The user navigates while language detection is still in flight — which
    // is exactly what the navigate rule does to _loadGeneration.
    feature._detectTranscriptLanguage = async () => {
        feature._loadGeneration += 1;
        return 'fr';
    };

    return feature._translateTranscript().then(() => {
        assert.equal(feature._translatedCues, null,
            'a stale translation must not publish cues');
        assert.equal(feature._showingTranslation, false,
            'a stale translation must not flip the toggle');
        assert.notEqual(button.textContent, 'Show Original',
            'a stale translation must not relabel the new video\'s button');
    });
});
