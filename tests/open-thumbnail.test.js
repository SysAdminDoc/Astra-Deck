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

const { loadFeature, fakeTreeDocument } = require('./helpers/monolith');

const REPO_ROOT = path.join(__dirname, '..');
const VIDEO_ID = 'dQw4w9WgXcQ';

function build({ openThumbnailButton = true, headStatuses = {}, opened = [] } = {}) {
    const documentRef = fakeTreeDocument(() => null);
    const actions = documentRef.createElement('div');
    actions.id = 'actions';
    documentRef.body.append(actions);

    const feature = loadFeature('downloadThumbnail', {
        document: documentRef,
        appState: { settings: { downloadThumbnail: true, openThumbnailButton } },
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
        }
    });
    return { feature, documentRef, actions, opened };
}

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
