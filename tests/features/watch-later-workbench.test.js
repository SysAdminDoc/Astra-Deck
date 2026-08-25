'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadFeature, fakeNode, fakeDocument, fakeTreeDocument } = require('../helpers/monolith');

const ytkitSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'extension', 'ytkit.js'), 'utf8');

// Window widened when filters and recovery gained their own UI and native
// restore path — these slices are length-sensitive.
function featureSlice(id, span = 60000) {
    const start = ytkitSource.indexOf(`id: '${id}'`);
    assert.notEqual(start, -1, `feature ${id} must exist in ytkit.js`);
    return ytkitSource.slice(start, start + span);
}

test('watchLaterWorkbench only activates on the WL playlist and bounds removal sessions', () => {
    const block = featureSlice('watchLaterWorkbench');
    assert.match(block, /params\.get\('list'\) === 'WL'/,
        'workbench must gate on the Watch Later playlist');
    assert.match(block, /_BATCH_LIMIT: 25/,
        'removal sessions are bounded to 25 rows per run');
    assert.match(block, /_PACE_MS: 400/,
        'removal clicks are paced at 400ms');
    assert.match(block, /matched\.slice\(0, this\._BATCH_LIMIT\)/,
        'each run consumes at most one batch');
});

test('watchLaterWorkbench keeps a capped removal log for recovery', () => {
    const block = featureSlice('watchLaterWorkbench');
    assert.match(block, /_LOG_KEY: 'ytkit-wl-removal-log'/,
        'removal log persists under a stable storage key');
    assert.match(block, /log\.slice\(-500\)/,
        'removal log is capped at 500 entries');
    assert.match(block, /Recovery list is in the removal log/,
        'completion toast points users at the recovery log');
});

test('watchLaterWorkbench filters, sorts, and exports the loaded scan', () => {
    const block = featureSlice('watchLaterWorkbench');
    assert.match(block, /watchedPct/,
        'scan must capture the watched percentage per row');
    assert.match(block, /ageDays/,
        'scan and matching must carry a conservative upload-age value');
    assert.match(block, /durationMin|durationMax/,
        'preview must support bounded duration filters');
    assert.match(block, /watchedState/,
        'matching must support explicit watched-state filters');
    assert.match(block, /duration-asc/,
        'preview supports duration sorting');
    assert.match(block, /videoId,title,channel,durationSec,watchedPct,watchedState,ageDays,publishedAt,url/,
        'CSV export carries the full column set');
    assert.match(block, /_csvEscape/,
        'CSV fields must be escaped');
    assert.match(block, /Scroll the playlist to load more rows/,
        'status must disclose that only loaded rows are covered (no silent cap)');
});

test('watchLaterWorkbench fails closed for unknown age or duration while matching explicit cleanup filters', () => {
    const feature = loadFeature('watchLaterWorkbench');
    const base = {
        watchedPct: 95,
        watchedState: 'watched',
        ageDays: 420,
        durationSec: 900,
        durationKnown: true,
        channel: 'Example Channel',
        title: 'Long Example'
    };
    assert.equal(feature._matches(base, {
        watched: 90, watchedState: 'watched', ageDays: 365,
        durationMin: 600, durationMax: 1200, channel: 'example', title: 'long'
    }), true, 'a row meeting every filter should match');
    assert.equal(feature._matches({ ...base, ageDays: null }, {
        watched: null, watchedState: 'any', ageDays: 365,
        durationMin: null, durationMax: null, channel: '', title: ''
    }), false, 'age filtering must not remove rows whose upload age is unknown');
    assert.equal(feature._matches({ ...base, durationKnown: false, durationSec: 0 }, {
        watched: null, watchedState: 'any', ageDays: null,
        durationMin: null, durationMax: 1200, channel: '', title: ''
    }), false, 'duration filtering must not remove rows whose duration is unknown');
    assert.equal(feature._watchedState(0), 'unwatched');
    assert.equal(feature._watchedState(12), 'in-progress');
    assert.equal(feature._watchedState(90), 'watched');
    const now = Date.parse('2026-08-11T00:00:00Z');
    assert.equal(feature._parseAgeDays('2 days ago', now), 2);
    assert.equal(feature._parseAgeDays('2 Jahren', now), 730);
});

test('watchLaterWorkbench appends recoverable sessions and restores one item or the whole bounded session', async () => {
    let log = [];
    const requests = [];
    const feature = loadFeature('watchLaterWorkbench', {
        storageReadJSON: (_key, fallback) => log.length ? log : fallback,
        storageWriteJSON: (_key, value) => { log = value; },
        hasExtensionContext: () => true,
        TranscriptService: {
            _getInnertubeApiKey: () => '0123456789abcdefghij',
            _getClientVersion: () => '2.20260401.00.00'
        },
        extensionFetchJson: async (details) => {
            requests.push(details);
            return { data: { playlistEdit: 'ok' } };
        }
    });
    const sessionId = feature._appendLog([
        { videoId: 'videoA123456', title: 'A', channel: 'Channel A' },
        { videoId: 'videoB123456', title: 'B', channel: 'Channel B' }
    ]);
    assert.equal(typeof sessionId, 'string');
    assert.equal(log.length, 2);
    assert.ok(log.every(entry => entry.sessionId === sessionId && entry.restoredAt === null));

    assert.equal(await feature._restoreEntry(log[0]), true, 'per-item Undo should restore through YouTube');
    assert.equal(log[0].restoredAt > 0, true);
    assert.equal(requests[0].data.includes('"action":"ACTION_ADD"'), true);
    assert.equal(requests[0].data.includes('"addedVideoId":"videoA123456"'), true);

    const restored = await feature._undoSession(sessionId);
    assert.equal(restored, 1, 'Undo all should restore the remaining item in the session');
    assert.equal(log.every(entry => entry.restoredAt > 0), true);
    assert.equal(requests.length, 2);
});

test('watchLaterWorkbench routes its user-facing copy through locale keys', () => {
    const block = featureSlice('watchLaterWorkbench');
    assert.match(block, /heading\.textContent = t\('feature_watchLaterWorkbench_name', 'Watch Later Workbench'\)/,
        'panel title must route through t()');
    assert.match(block, /t\('wlwbPanelAria', 'Watch Later workbench'\)/,
        'panel dialog aria-label must route through t()');
    assert.match(block, /t\('wlwbStatusTpl', /,
        'preview status must route through the {matched}/{loaded} template key');
    assert.match(block, /t\('wlwbRemoveMatchedTpl', /,
        'run button label must route through the {limit} template key');
    const en = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', '_locales', 'en', 'messages.json'), 'utf8'));
    for (const key of [
        'wlwbPanelAria', 'wlwbStatusTpl', 'wlwbRemoveMatchedTpl', 'wlwbOpenBtn',
        'wlwbAgePlaceholder', 'wlwbDurationMinPlaceholder', 'wlwbWatchedStateAria',
        'wlwbRecoveryTitle', 'wlwbUndoAll',
        // Was one key carrying "video(s)". Chrome's i18n has no plural support,
        // so a count string is a pair chosen between at the call site; both
        // halves have to exist or one of them renders as the raw key.
        'wlwbRestoredBatchTplOne', 'wlwbRestoredBatchTplOther'
    ]) {
        assert.ok(en[key]?.message, `en messages must define ${key}`);
    }
});

test('watchLaterWorkbench cleans up its UI on destroy', () => {
    const documentRef = fakeTreeDocument();
    const expectedHost = documentRef.createElement('main');
    const wrongTarget = documentRef.createElement('aside');
    documentRef.body.append(expectedHost, wrongTarget);
    const panel = documentRef.createElement('section');
    const button = documentRef.createElement('button');
    const style = documentRef.createElement('style');
    expectedHost.append(panel, button, style);
    const removedRules = [];
    const feature = loadFeature('watchLaterWorkbench', {
        document: documentRef,
        removeNavigateRule: (id) => removedRules.push(id)
    });
    feature._panel = panel;
    feature._btn = button;
    feature._styleEl = style;

    feature.destroy();

    assert.deepEqual(removedRules, ['watchLaterWorkbench']);
    assert.equal(expectedHost.children.length, 0,
        'destroy must remove every owned node from its rendered host');
    assert.equal(wrongTarget.children.length, 0,
        'the placement oracle must stay empty when teardown targets the real host');
    assert.equal(feature._panel, null);
    assert.equal(feature._btn, null);
    assert.equal(feature._styleEl, null);
    assert.equal(feature._navRule, null);
});

test('watchLaterWorkbench verifies the open menu belongs to the row it is removing', () => {
    // YouTube reuses one shared iron-dropdown for every row menu. Opening the
    // menu and waiting a fixed 120ms could click the previous row's entry
    // during a slow rebind — removing the wrong video and counting it as a
    // success.
    const block = featureSlice('watchLaterWorkbench');
    assert.match(block, /_openDropdown\(\)/,
        'removal must find the actually-open dropdown, not any menu markup');
    assert.match(block, /_waitFor\(\s*\n?\s*\(\) => this\._openDropdown\(\)\?\.querySelector/,
        'removal must wait for this row\'s menu to open instead of a fixed delay');
    assert.doesNotMatch(block, /menuBtn\.click\(\);\s*\n\s*await new Promise\(r => setTimeout\(r, 120\)\)/,
        'the fixed 120ms menu wait must be gone');
    assert.match(block, /_menuItemOwnership\(node, videoId\)/,
        'menu items must be checked against the row\'s video id');
    assert.match(block, /removal\.removedVideoId \|\| removal\.setVideoId/,
        'ownership must read the removal endpoint\'s target video');
    assert.match(block, /this\._menuItemOwnership\(structural, entry\.videoId\) === false/,
        'a menu that names a different video must abort the removal');
    assert.match(block, /remove from/i,
        'the locale-independent text fallback must survive for unreadable endpoints');
});

// ── Render assertions ───────────────────────────────────────────────────────
// The tests above prove the data half: what gets logged, restored, filtered.
// The DOM half was covered only by source pins, so a render path could be
// broken in any way that still left the right text in ytkit.js and every test
// stayed green. The shared helper attaches for real now, so these drive
// _renderRecovery and read the tree it actually builds.

function recoveryHarness(entries) {
    let log = entries;
    const status = fakeNode({ tag: 'div', attributes: { class: 'ytkit-wlwb-recovery-status' } });
    const list = fakeNode({ tag: 'div', attributes: { class: 'ytkit-wlwb-recovery-list' } });
    const feature = loadFeature('watchLaterWorkbench', {
        document: fakeDocument(() => []),
        storageReadJSON: (_key, fallback) => (log.length ? log : fallback),
        storageWriteJSON: (_key, value) => { log = value; },
        hasExtensionContext: () => true
    });
    feature._panel = fakeNode({ tag: 'div' });
    feature._panel.querySelector = (selector) => {
        if (selector === '.ytkit-wlwb-recovery-status') return status;
        if (selector === '.ytkit-wlwb-recovery-list') return list;
        return null;
    };
    feature._undoAllBtn = fakeNode({ tag: 'button' });
    return { feature, status, list };
}

function recoverable(videoId, title, channel) {
    return {
        videoId, title, channel,
        sessionId: 'session-1',
        removedAt: 1,
        restoredAt: null
    };
}

test('watchLaterWorkbench builds one recovery row per restorable entry', () => {
    const { feature, status, list } = recoveryHarness([
        recoverable('videoA123456', 'First video', 'Channel A'),
        recoverable('videoB123456', 'Second video', 'Channel B')
    ]);

    feature._renderRecovery();

    assert.equal(list.children.length, 2, 'each recoverable entry should render a row');
    const [first] = list.children;
    assert.equal(first.className, 'ytkit-wlwb-recovery-row');
    assert.equal(first.children.length, 2, 'a row is a label plus its Undo button');
    assert.equal(first.children[0].textContent, 'First video',
        'the label should carry the stored title');
    assert.equal(first.children[1].tagName, 'BUTTON');
    assert.ok(first.children[1].textContent, 'the Undo control needs a label');
    assert.equal(first.isConnected, true, 'rows must actually attach to the list');
    assert.match(status.textContent, /2/, 'the status line should count what it rendered');
    assert.equal(feature._undoAllBtn.disabled, false, 'Undo all is available when work exists');
});

test('watchLaterWorkbench empties the recovery list when nothing is restorable', () => {
    const { feature, status, list } = recoveryHarness([]);

    feature._renderRecovery();

    assert.equal(list.children.length, 0, 'no entries means no rows');
    assert.ok(status.textContent.length > 0, 'the empty state still needs to say something');
    assert.doesNotMatch(status.textContent, /\d/,
        'the empty state should not report a count');
    assert.equal(feature._undoAllBtn.disabled, true, 'Undo all is disabled with nothing to undo');
});

test('watchLaterWorkbench replaces previous recovery rows instead of appending to them', () => {
    // replaceChildren is the only thing standing between a re-render and a
    // list that grows a duplicate set of rows on every restore.
    const { feature, list } = recoveryHarness([
        recoverable('videoA123456', 'First video', 'Channel A')
    ]);

    feature._renderRecovery();
    feature._renderRecovery();
    feature._renderRecovery();

    assert.equal(list.children.length, 1,
        're-rendering must rebuild the list, not stack onto it');
});

test('watchLaterWorkbench renders a restorable entry that has no title', () => {
    // Removal logs written before titles were captured carry only an id.
    const { feature, list } = recoveryHarness([
        { videoId: 'videoC123456', sessionId: 's', removedAt: Date.now(), restoredAt: null }
    ]);

    feature._renderRecovery();

    assert.equal(list.children.length, 1);
    assert.equal(list.children[0].children[0].textContent, 'videoC123456',
        'the id stands in for a missing title rather than rendering blank');
});

test('watchLaterWorkbench renders a labelled zero-match state with recovery guidance', () => {
    const list = fakeNode({ tag: 'div', attributes: { class: 'ytkit-wlwb-list' } });
    const status = fakeNode({ tag: 'div', attributes: { class: 'ytkit-wlwb-status' } });
    const feature = loadFeature('watchLaterWorkbench', {
        document: fakeDocument(() => [])
    });
    feature._panel = fakeNode({ tag: 'div' });
    feature._panel.querySelector = (selector) => {
        if (selector === '.ytkit-wlwb-list') return list;
        if (selector === '.ytkit-wlwb-status') return status;
        return null;
    };
    feature._scanRows = () => [];
    feature._renderRecovery = () => {};

    feature._refreshPreview();

    assert.equal(list.children.length, 1, 'zero matches must render one state instead of a blank list');
    const empty = list.children[0];
    assert.equal(empty.className, 'ytkit-wlwb-empty');
    assert.equal(empty.getAttribute('role'), 'status');
    assert.equal(empty.getAttribute('aria-labelledby'), 'ytkit-wlwb-empty-title');
    assert.equal(empty.children[0].tagName, 'STRONG');
    assert.equal(empty.children[0].id, 'ytkit-wlwb-empty-title');
    assert.match(empty.children[0].textContent, /videos/i);
    assert.match(empty.children[1].textContent, /filter|scroll/i,
        'the state must explain how to recover matches');
    assert.match(status.textContent, /0/, 'the live summary must still report the loaded count');
});
