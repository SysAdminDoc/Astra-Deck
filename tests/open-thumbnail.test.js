'use strict';

// Open the thumbnail at full size.
//
// The download button already resolves the best available thumbnail: it probes
// maxresdefault, falls back to hqdefault, and returns the last candidate rather
// than nothing when both probes fail. Viewing one is that same resolution
// followed by an open instead of a download, so this rides on the existing
// resolver rather than adding a second one that could disagree with it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadFeature, loadUserscriptFeature, fakeTreeDocument } = require('./helpers/monolith');

const REPO_ROOT = path.join(__dirname, '..');
const VIDEO_ID = 'dQw4w9WgXcQ';

function build({ openThumbnailButton = true, headStatuses = {}, opened = [], extra = {} } = {}) {
    const documentRef = fakeTreeDocument(() => null);
    const actions = documentRef.createElement('div');
    actions.id = 'actions';
    documentRef.body.append(actions);
    const appState = { settings: { downloadThumbnail: true, openThumbnailButton } };

    const feature = loadFeature('downloadThumbnail', {
        document: documentRef,
        appState,
        getVideoId: () => VIDEO_ID,
        isWatchPagePath: () => true,
        openExternalUrl: async (url) => { opened.push(url); return { ok: true }; },
        triggerDownload: async () => {},
        showToast: () => {},
        addNavigateRule: () => {},
        removeNavigateRule: () => {},
        addMutationRule: () => {},
        removeMutationRule: () => {},
        extensionRequestAsync: async ({ url }) => {
            const status = Object.prototype.hasOwnProperty.call(headStatuses, url) ? headStatuses[url] : 200;
            if (status === 'throw') throw new Error('network');
            return { status };
        },
        ...extra
    });
    return { feature, documentRef, actions, opened, appState };
}

// Timers the test runs by hand, so a revert can be fired (or shown to be
// cancelled) without waiting two seconds.
function manualTimers() {
    const timers = [];
    return {
        timers,
        pending: () => timers.filter((entry) => !entry.cleared && !entry.ran),
        setTimeout: (fn, ms) => { timers.push({ fn, ms, cleared: false, ran: false }); return timers.length; },
        clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
        run(entry) { entry.ran = true; entry.fn(); }
    };
}

const click = (button) => button.listeners.get('click').values().next().value({});
const labelOf = (button) => button.querySelector('.ytkit-watch-action-btn__label').textContent;

const MAXRES = `https://i.ytimg.com/vi/${VIDEO_ID}/maxresdefault.jpg`;
const HQ = `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`;

test('the view button is off by default and absent until the setting is on', () => {
    const off = build({ openThumbnailButton: false });
    off.feature._create();
    assert.equal(off.documentRef.querySelectorAll('.ytkit-open-thumb-btn').length, 0);

    const on = build({ openThumbnailButton: true });
    on.feature._create();
    assert.equal(on.documentRef.querySelectorAll('.ytkit-open-thumb-btn').length, 1,
        'turning it on adds exactly one button');
});

test('a second render does not stack a second button', () => {
    const { feature, documentRef } = build();
    feature._create();
    feature._create();
    assert.equal(documentRef.querySelectorAll('.ytkit-open-thumb-btn').length, 1);
});

test('clicking it opens the max-res thumbnail in a new tab', async () => {
    const opened = [];
    const { feature, documentRef } = build({ opened });
    feature._create();

    const button = documentRef.querySelectorAll('.ytkit-open-thumb-btn')[0];
    await button.listeners.get('click').values().next().value({});

    assert.deepEqual(opened, [MAXRES]);
});

test('it falls back to the next resolution when max-res is missing', async () => {
    const opened = [];
    const { feature, documentRef } = build({ opened, headStatuses: { [MAXRES]: 404 } });
    feature._create();

    const button = documentRef.querySelectorAll('.ytkit-open-thumb-btn')[0];
    await button.listeners.get('click').values().next().value({});

    assert.deepEqual(opened, [HQ], 'a video with no max-res thumbnail must still open one');
});

test('it opens something even when every probe fails', async () => {
    const opened = [];
    const { feature, documentRef } = build({
        opened,
        headStatuses: { [MAXRES]: 'throw', [HQ]: 'throw' }
    });
    feature._create();

    const button = documentRef.querySelectorAll('.ytkit-open-thumb-btn')[0];
    await button.listeners.get('click').values().next().value({});

    assert.deepEqual(opened, [HQ],
        'the resolver returns its last candidate rather than nothing, and that behaviour is shared');
});

test('teardown removes the view button too', () => {
    const { feature, documentRef } = build();
    feature._create();
    assert.equal(documentRef.querySelectorAll('.ytkit-open-thumb-btn').length, 1);

    feature.destroy();

    assert.equal(documentRef.querySelectorAll('.ytkit-open-thumb-btn').length, 0,
        'a feature that leaves its button behind fails the destroy contract');
    assert.equal(feature._openBtn, null);
});

test('the action uses the download resolver rather than a second one', () => {
    // A parallel resolver would drift from the one the download button uses,
    // and the two buttons would disagree about which thumbnail exists.
    const source = fs.readFileSync(path.join(REPO_ROOT, 'extension', 'ytkit.js'), 'utf8');
    const start = source.indexOf('_createOpenButton(actions, videoId) {');
    const end = source.indexOf('actions.appendChild(openBtn);', start);
    assert.ok(start > 0 && end > start, 'the open button builder must exist');

    const body = source.slice(start, end);
    assert.match(body, /this\._resolveThumbnailUrl\(videoId\)/,
        'it must call the shared resolver');
    assert.doesNotMatch(body, /i\.ytimg\.com/,
        'it must not build a thumbnail URL of its own');
    assert.match(body, /openExternalUrl\(/,
        'opening goes through the vetted helper, which refuses anything that is not http(s)');
});

test('the setting is declared and defaults off in every mirror', () => {
    const schema = require('../extension/core/settings-schema.js');
    const entry = schema.SETTINGS_SCHEMA.find((row) => row.key === 'openThumbnailButton');
    assert.ok(entry, 'openThumbnailButton must be in the schema');
    assert.equal(entry.type, 'boolean');
    assert.equal(entry.defaultValue, false, 'a new button must not appear uninvited');
    assert.equal(entry.destroyRequired, true, 'it adds DOM, so teardown has to run');

    const defaults = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'extension', 'default-settings.json'), 'utf8'));
    assert.equal(defaults.openThumbnailButton, false);
});

test('each button keeps its own labels and its own revert timer', async () => {
    const clock = manualTimers();
    let openFails = false;
    const { feature, documentRef } = build({
        extra: {
            setTimeout: clock.setTimeout,
            clearTimeout: clock.clearTimeout,
            openExternalUrl: async () => { if (openFails) throw new Error('blocked'); return { ok: true }; }
        }
    });
    feature._create();
    const download = documentRef.querySelector('.ytkit-dl-thumb-btn');
    const view = documentRef.querySelector('.ytkit-open-thumb-btn');

    await click(download);
    assert.equal(labelOf(download), 'Downloaded');
    assert.equal(clock.pending().length, 1, 'a finished download arms one revert');
    const downloadRevert = clock.pending()[0];

    // A View click used to clear that shared timer and stamp the download
    // button's labels onto View.
    await click(view);
    assert.equal(labelOf(view), 'View');
    assert.equal(view.getAttribute('aria-label'), 'Open thumbnail at full size');
    assert.equal(downloadRevert.cleared, false, 'a View click must not cancel the Download revert');

    clock.run(downloadRevert);
    assert.equal(labelOf(download), 'Thumbnail');
    assert.equal(download.getAttribute('aria-label'), 'Download thumbnail');

    openFails = true;
    await click(view);
    assert.equal(labelOf(view), 'Retry');
    assert.equal(view.getAttribute('aria-label'), 'Could not open the thumbnail. Try again in a moment.',
        'a failed View must not announce a failed download');
    clock.run(clock.pending()[0]);
    assert.equal(labelOf(view), 'View', 'View reverts to its own label, not "Thumbnail"');
    assert.equal(view.getAttribute('aria-label'), 'Open thumbnail at full size');
});

test('the download button speaks the catalog, not hardcoded English', async () => {
    const clock = manualTimers();
    const { feature, documentRef } = build({
        openThumbnailButton: false,
        extra: {
            t: (key) => `<${key}>`,
            setTimeout: clock.setTimeout,
            clearTimeout: clock.clearTimeout,
            triggerDownload: async () => { throw new Error('denied'); }
        }
    });
    feature._create();
    const download = documentRef.querySelector('.ytkit-dl-thumb-btn');
    assert.equal(labelOf(download), '<thumbnailDownloadLabel>');
    assert.equal(download.getAttribute('aria-label'), '<thumbnailDownloadAria>');

    await click(download);
    assert.equal(labelOf(download), '<thumbnailDownloadRetry>');
    assert.equal(download.getAttribute('aria-label'), '<thumbnailDownloadFailedAria>');
});

test('a slow download keeps its busy label instead of reverting mid-download', async () => {
    const clock = manualTimers();
    let finish;
    const { feature, documentRef } = build({
        openThumbnailButton: false,
        extra: {
            setTimeout: clock.setTimeout,
            clearTimeout: clock.clearTimeout,
            triggerDownload: () => new Promise((resolve) => { finish = resolve; })
        }
    });
    feature._create();
    const download = documentRef.querySelector('.ytkit-dl-thumb-btn');
    const running = click(download);
    for (let i = 0; i < 10 && !finish; i++) await Promise.resolve();
    assert.equal(labelOf(download), 'Downloading…');
    assert.equal(clock.pending().length, 0, 'nothing may flip the label back while the download runs');
    finish();
    await running;
    assert.equal(labelOf(download), 'Downloaded');
});

test('turning the View setting on or off applies without waiting for the next video', () => {
    const { feature, documentRef, appState } = build({
        openThumbnailButton: false,
        extra: { setTimeout: () => 0, clearTimeout: () => {} }
    });
    feature.init();
    feature._create();
    const fire = () => documentRef.listeners.get('ytkit-settings-changed')?.forEach((handler) => handler({ detail: {} }));
    assert.equal(documentRef.querySelectorAll('.ytkit-open-thumb-btn').length, 0);

    appState.settings.openThumbnailButton = true;
    fire();
    assert.equal(documentRef.querySelectorAll('.ytkit-open-thumb-btn').length, 1);
    fire();
    assert.equal(documentRef.querySelectorAll('.ytkit-open-thumb-btn').length, 1, 'a repeat event does not stack buttons');

    appState.settings.openThumbnailButton = false;
    fire();
    assert.equal(documentRef.querySelectorAll('.ytkit-open-thumb-btn').length, 0);

    feature.destroy();
    assert.equal(documentRef.listeners.get('ytkit-settings-changed')?.size || 0, 0, 'destroy drops the settings listener');
});

test('the userscript Thumbnail button follows the video after in-app navigation', () => {
    // YouTube keeps #actions when you click from one video to another, so the
    // old button stayed in place, bound to the first video, and _create() saw
    // it and stopped. Checked live: a node appended to #actions survives the
    // navigation.
    const clock = manualTimers();
    const documentRef = fakeTreeDocument(() => null);
    const actions = documentRef.createElement('div');
    actions.id = 'actions';
    documentRef.body.append(actions);
    const locationRef = { href: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' };
    let onNavigate = null;
    const fetched = [];
    const feature = loadUserscriptFeature('downloadThumbnail', {
        document: documentRef,
        location: locationRef,
        URL,
        isWatchPagePath: () => true,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
        addNavigateRule: (_id, fn) => { onNavigate = fn; },
        removeNavigateRule: () => {},
        setSafeBlankTarget: () => {},
        fetch: async (url) => { fetched.push(url); return { ok: false }; }
    });

    feature.init();
    clock.run(clock.pending()[0]);
    assert.equal(documentRef.querySelectorAll('.ytkit-dl-thumb-btn').length, 1);

    locationRef.href = 'https://www.youtube.com/watch?v=bbbbbbbbbbb';
    onNavigate();
    clock.run(clock.pending()[0]);
    const buttons = documentRef.querySelectorAll('.ytkit-dl-thumb-btn');
    assert.equal(buttons.length, 1);
    return click(buttons[0]).then(() => {
        assert.deepEqual(fetched, ['https://i.ytimg.com/vi/bbbbbbbbbbb/maxresdefault.jpg'],
            'the button must fetch the video on screen, not the first one');

        // Switching the feature off inside the two-second window must not let
        // the pending create put a button back.
        onNavigate();
        feature.destroy();
        assert.equal(clock.pending().length, 0);
        assert.equal(documentRef.querySelectorAll('.ytkit-dl-thumb-btn').length, 0);
    });
});
