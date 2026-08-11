'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFeature, fakeNode, fakeDocument } = require('../helpers/monolith');

function documentForFeature() {
    return Object.assign(fakeDocument(() => []), {
        createElement: (tag) => fakeNode({ tag })
    });
}

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
    feature._panel = { querySelector: () => button };
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
    feature._panel = { querySelector: () => button };
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
