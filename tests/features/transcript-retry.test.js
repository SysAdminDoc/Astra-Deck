'use strict';

// A failed transcript load used to end in "Reload the page or try again in a
// moment", with nothing to press. Reloading a watch page throws away the
// playback position, the queue and whatever else the viewer had open, just to
// re-ask YouTube for one caption track. These tests drive the real panel
// against a fake DOM and a fetch whose answers the test hands out one at a
// time, so the order of late and early responses is under test control.

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadFeature, fakeTreeDocument } = require('../helpers/monolith');

const VIDEO_ID = 'abc12345678';

function flush() {
    return new Promise((resolve) => setImmediate(resolve));
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function buildPanel() {
    const document = fakeTreeDocument();
    const flexy = document.createElement('ytd-watch-flexy');
    flexy.__data = {
        playerResponse: {
            videoDetails: { videoId: VIDEO_ID },
            captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ languageCode: 'en', baseUrl: 'https://example.invalid/t' }] } }
        }
    };
    const secondary = document.createElement('div');
    secondary.id = 'secondary';
    flexy.appendChild(secondary);
    document.body.appendChild(flexy);

    let seeks = 0;
    let time = 42;
    const video = document.createElement('video');
    Object.defineProperty(video, 'currentTime', {
        get() { return time; },
        set(value) { seeks += 1; time = value; },
        configurable: true
    });
    document.body.appendChild(video);

    const calls = [];
    let reloads = 0;
    const navigateRules = new Map();
    const feature = loadFeature('transcriptViewer', {
        document,
        window: {},
        location: { href: `https://www.youtube.com/watch?v=${VIDEO_ID}`, reload() { reloads += 1; } },
        getVideoId: () => VIDEO_ID,
        clearCustomHighlight() {},
        setCustomHighlight: () => false,
        addNavigateRule: (name, handler) => navigateRules.set(name, handler),
        removeNavigateRule: (name) => navigateRules.delete(name),
        fetchTranscriptWithFallback(tracks, _lang, options) {
            const answer = deferred();
            calls.push({ tracks, options, answer });
            return answer.promise;
        }
    });
    const copies = [];
    feature._copyToClipboard = (text) => copies.push(text);
    feature._create();
    const panel = feature._panel;
    const q = (selector) => panel.querySelector(selector);
    return {
        document, feature, panel, calls, copies, navigateRules, q,
        get seeks() { return seeks; },
        get reloads() { return reloads; },
        body: () => q('.ytkit-transcript-body'),
        exportBar: () => q('.ytkit-transcript-export'),
        retryButton: () => q('.ytkit-transcript-state__action'),
        click: (node) => node.dispatchEvent({ type: 'click' })
    };
}

const failure = { cues: [], status: 'error', error: 'YouTube returned no cues' };
const success = {
    cues: [{ start: 0, end: 4, text: 'first line' }, { start: 4, end: 9, text: 'second line' }],
    track: { languageCode: 'en' },
    provenance: { source: 'player-global', language: 'en' }
};

test('a failed load offers Retry, and a successful retry renders the transcript without seeking or reloading', async () => {
    const view = buildPanel();
    assert.equal(view.calls.length, 1, 'opening the panel starts one load');
    view.calls[0].answer.resolve(failure);
    await flush();

    assert.ok(view.q('.ytkit-transcript-state--error'), 'a retryable failure renders the error state');
    const retry = view.retryButton();
    assert.ok(retry, 'the error state carries a visible Retry button');
    assert.equal(retry.textContent, 'Retry');
    assert.equal(view.body().getAttribute('aria-busy'), 'false');
    assert.equal(view.exportBar().hidden, true, 'nothing to export yet');

    view.click(retry);
    assert.equal(view.calls.length, 2, 'Retry starts exactly one new load');
    assert.ok(view.calls[1].options.signal !== view.calls[0].options.signal, 'the retry gets its own abort signal');
    assert.equal(view.calls[1].options.videoId, VIDEO_ID);
    assert.equal(view.body().getAttribute('aria-busy'), 'true', 'the busy state is announced while the retry runs');
    assert.ok(view.q('.ytkit-transcript-state--loading'), 'the loading state replaces the failed one');
    assert.ok(!view.retryButton(), 'no Retry while a retry is running');
    assert.ok(view.document.activeElement === view.body(), 'focus parks on the body instead of falling to the page');

    view.calls[1].answer.resolve(success);
    await flush();
    assert.equal(view.panel.querySelectorAll('.ytkit-transcript-line').length, 2);
    assert.equal(view.exportBar().hidden, false, 'exports appear once there are cues');
    assert.equal(view.body().getAttribute('aria-busy'), 'false');
    assert.equal(view.seeks, 0, 'retrying must not touch playback');
    assert.equal(view.reloads, 0, 'retrying must not reload the page');
});

test('a retry that fails again offers Retry again and hands it focus', async () => {
    const view = buildPanel();
    view.calls[0].answer.resolve(failure);
    await flush();
    view.click(view.retryButton());
    view.calls[1].answer.reject(new Error('network down'));
    await flush();

    const second = view.retryButton();
    assert.ok(second, 'a thrown failure is retryable too');
    assert.ok(view.q('.ytkit-transcript-state--error'));
    assert.ok(view.document.activeElement === second, 'focus moves to the new Retry so the keyboard user is not stranded');
    assert.equal(view.q('.ytkit-transcript-meta__pill').dataset.tone, 'danger');

    view.click(second);
    assert.equal(view.calls.length, 3);
    view.calls[2].answer.resolve(failure);
    await flush();
    assert.ok(view.retryButton(), 'every retryable failure keeps the way out');
    assert.equal(view.seeks, 0);
});

test('pressing Retry twice starts one load, not two', async () => {
    const view = buildPanel();
    view.calls[0].answer.resolve(failure);
    await flush();
    const retry = view.retryButton();
    view.click(retry);
    view.click(retry);
    assert.equal(view.feature._retryTranscript(), false, 'a direct retry while one is in flight is refused');
    assert.equal(view.calls.length, 2, 'only one retry load is in flight');
    assert.equal(view.calls[1].options.signal.aborted, false, 'the running retry was not restarted');
});

test('a video without captions gets no Retry', async () => {
    const view = buildPanel();
    view.calls[0].answer.resolve({ cues: [], status: 'captionless' });
    await flush();
    assert.ok(view.q('.ytkit-transcript-state--empty'), 'captionless renders the empty state');
    assert.ok(!view.retryButton(), 'asking again will not give a captionless video captions');
    assert.equal(view.q('.ytkit-transcript-meta__pill').dataset.tone, 'warning');
});

test('blank cues are dropped, and a track of only blank cues cannot be exported', async () => {
    const view = buildPanel();
    view.calls[0].answer.resolve({ cues: [{ start: 0, text: '' }, { start: 2, text: '   ' }, { start: 3 }], track: { languageCode: 'en' } });
    await flush();
    assert.equal(view.feature._cues.length, 0, 'blank cues must not survive into the export source');
    assert.ok(view.q('.ytkit-transcript-state--empty'));
    assert.ok(view.retryButton(), 'an empty track may still fill in, so it is retryable');
    assert.equal(view.exportBar().hidden, true);
    for (const button of view.exportBar().children) view.click(button);
    assert.equal(view.copies.length, 0, 'a hidden export bar is not the only guard');

    view.click(view.retryButton());
    view.calls[1].answer.resolve({
        cues: [{ start: 0, text: 'kept' }, { start: 1, text: '' }, { start: 2, text: 'also kept' }],
        track: { languageCode: 'en' }
    });
    await flush();
    assert.deepEqual(view.feature._cues.map((cue) => cue.text), ['kept', 'also kept']);
    assert.equal(view.panel.querySelectorAll('.ytkit-transcript-line').length, view.feature._cues.length,
        'rendered lines and cues line up, so the active-line sync and translation swap index the right line');
    view.click(view.exportBar().children[0]);
    assert.deepEqual(view.copies, ['kept\nalso kept']);
});

test('collapsing aborts the load, expanding restarts it, and the old response is ignored', async () => {
    const view = buildPanel();
    const toggle = view.q('.ytkit-transcript-toggle');
    view.click(toggle);
    assert.equal(view.calls[0].options.signal.aborted, true, 'closing the panel stops the fetch');
    assert.equal(view.body().getAttribute('aria-busy'), 'false');

    view.click(toggle);
    assert.equal(view.calls.length, 2, 'expanding picks the interrupted load back up');
    view.calls[1].answer.resolve(success);
    await flush();
    assert.equal(view.panel.querySelectorAll('.ytkit-transcript-line').length, 2);

    view.calls[0].answer.resolve(failure);
    await flush();
    assert.equal(view.panel.querySelectorAll('.ytkit-transcript-line').length, 2, 'a late answer from the aborted load must not replace the transcript');
    assert.ok(!view.retryButton());
    assert.equal(view.exportBar().hidden, false);
});

test('collapsing after a failure keeps the failure, and expanding does not refetch on its own', async () => {
    const view = buildPanel();
    view.calls[0].answer.resolve(failure);
    await flush();
    const toggle = view.q('.ytkit-transcript-toggle');
    view.click(toggle);
    view.click(toggle);
    assert.equal(view.calls.length, 1, 'only an interrupted load resumes on expand');
    assert.ok(view.retryButton());
});

test('a hidden export bar stays hidden under both stylesheets', () => {
    // Both sheets give the bar a display value, and an author display rule
    // beats the hidden attribute, so failed loads showed export buttons.
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..', '..', 'extension');
    for (const file of ['ytkit.js', 'core/settings-visual-system.js']) {
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        assert.match(source, /\.ytkit-transcript-export\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/, `${file} keeps [hidden] on the export bar`);
    }
});

test('navigation and disable abort a retry in flight', async () => {
    const view = buildPanel();
    view.feature.init();
    clearTimeout(view.feature._createTimer);
    view.calls[0].answer.resolve(failure);
    await flush();
    view.click(view.retryButton());
    const retrySignal = view.calls[1].options.signal;

    view.navigateRules.get('transcriptViewer')();
    clearTimeout(view.feature._createTimer);
    assert.equal(retrySignal.aborted, true, 'navigating away aborts the retry');
    assert.ok(!view.feature._panel);
    view.calls[1].answer.resolve(success);
    await flush();
    assert.equal(view.panel.querySelectorAll('.ytkit-transcript-line').length, 0, 'the late answer lands nowhere');

    const second = buildPanel();
    second.calls[0].answer.resolve(failure);
    await flush();
    second.click(second.retryButton());
    second.feature.destroy();
    assert.equal(second.calls[1].options.signal.aborted, true, 'disabling the feature aborts the retry');
    assert.ok(!second.feature._loadController);
});
