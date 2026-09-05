'use strict';

// Per-video notes.
//
// This module had no test file of its own: it appeared in the i18n ratchet, the
// light-theme lane and the peel inventory, none of which can tell a working
// note store from a broken one. The store is the part worth guarding — it is
// the only copy of something the user typed, it silently drops anything it does
// not recognise, and it evicts by recency once it is full.
//
// Expected values are written as literals rather than read back off the feature,
// because an assertion whose expected value comes from the subject cannot fail.

const test = require('node:test');
const assert = require('node:assert/strict');

const { fakeTreeDocument } = require('../helpers/monolith');
const { createVideoNotesFeature } = require('../../extension/features/video-notes');

function build({ settings = {}, saveThrows = false, videoId = 'dQw4w9WgXcQ' } = {}) {
    const saved = [];
    const navigateRules = new Map();
    const styles = [];
    const appState = { settings };
    const feature = createVideoNotesFeature({
        appState,
        settingsManager: {
            save(next) {
                if (saveThrows) throw new Error('quota exceeded');
                saved.push(next);
            }
        },
        injectStyle: (css, id) => {
            const handle = { id, removed: false, remove() { this.removed = true; } };
            styles.push(handle);
            return handle;
        },
        addNavigateRule: (id, rule) => navigateRules.set(id, rule),
        removeNavigateRule: (id) => navigateRules.delete(id),
        getVideoId: () => videoId,
        isWatchPagePath: () => true
    });
    return { feature, appState, saved, navigateRules, styles };
}

const noteFor = (videoId, overrides = {}) => ({
    videoId,
    note: `note for ${videoId}`,
    updatedAt: 1_700_000_000_000,
    createdAt: 1_700_000_000_000,
    ...overrides
});

test('the note store keeps only entries it can identify as a video note', () => {
    const { feature } = build();

    const kept = feature._enforceNotesCap({
        dQw4w9WgXcQ: noteFor('dQw4w9WgXcQ'),
        'not a video id': noteFor('x'),
        short: noteFor('short'),
        thisVideoIdIsFarTooLongToBeReal: noteFor('y'),
        aaaaaaaaaaa: null,
        bbbbbbbbbbb: 'a string, not a record',
        ccccccccccc: noteFor('ccccccccccc', { note: '   ' })
    });

    assert.deepEqual(Object.keys(kept), ['dQw4w9WgXcQ'],
        'ids outside 6-20 word characters, non-objects and blank notes are all dropped');
});

test('a note is truncated at five thousand characters, not rejected', () => {
    const { feature } = build();

    const kept = feature._enforceNotesCap({
        dQw4w9WgXcQ: noteFor('dQw4w9WgXcQ', { note: 'x'.repeat(6000) })
    });

    assert.equal(kept.dQw4w9WgXcQ.note.length, 5000);
    assert.equal(feature._MAX_NOTE_CHARS, 5000, 'the shipped cap is five thousand characters');
});

test('the store evicts the least recently edited note once it is full', () => {
    const { feature } = build();
    const notes = {};
    // 1001 valid ids, oldest first, so exactly one must be evicted.
    for (let index = 0; index < 1001; index += 1) {
        const videoId = `vid${String(index).padStart(8, '0')}`;
        notes[videoId] = noteFor(videoId, { updatedAt: 1_700_000_000_000 + index });
    }

    const kept = feature._enforceNotesCap(notes);

    assert.equal(Object.keys(kept).length, 1000, 'the store holds a thousand notes');
    assert.equal(feature._MAX_NOTES, 1000, 'the shipped cap is a thousand notes');
    assert.equal(kept.vid00000000, undefined, 'the oldest note is the one evicted');
    assert.ok(kept.vid00001000, 'the most recently edited note survives');
    assert.deepEqual(Object.keys(kept)[0], 'vid00001000', 'the survivors are ordered most-recent first');
});

test('reading a store that was never written returns an empty set rather than throwing', () => {
    for (const stored of [undefined, null, 'a string', 42, ['an', 'array']]) {
        const { feature } = build({ settings: { videoNotesData: stored } });
        assert.deepEqual(feature._readNotes(), {}, `a ${typeof stored} store reads as empty`);
    }
});

test('writing notes persists the capped set and reports a failed save', () => {
    const { feature, appState, saved } = build();

    const written = feature._writeNotes({
        dQw4w9WgXcQ: noteFor('dQw4w9WgXcQ'),
        'not a video id': noteFor('x')
    });

    assert.deepEqual(Object.keys(written), ['dQw4w9WgXcQ']);
    assert.deepEqual(Object.keys(appState.settings.videoNotesData), ['dQw4w9WgXcQ'],
        'the capped set, not the raw input, is what lands in settings');
    assert.equal(saved.length, 1, 'the write reaches the settings manager');
    assert.equal(feature._lastWriteOk, true);

    const failing = build({ saveThrows: true });
    failing.feature._writeNotes({ dQw4w9WgXcQ: noteFor('dQw4w9WgXcQ') });
    assert.equal(failing.feature._lastWriteOk, false,
        'a save that throws must be reported, not swallowed as success');
});

test('init registers a navigation rule and destroy takes everything back down', (t) => {
    const previousDocument = global.document;
    const documentRef = fakeTreeDocument(() => null);
    global.document = documentRef;
    t.after(() => { global.document = previousDocument; });

    const { feature, navigateRules, styles } = build();

    feature.init();
    assert.equal(navigateRules.size, 1, 'init registers exactly one navigation rule');
    assert.ok(navigateRules.has('videoNotes'), 'the rule is registered under the feature id');
    assert.equal(styles.length, 1, 'init injects the panel stylesheet once');

    feature.init();
    assert.equal(styles.length, 1, 'a second init must not inject a second stylesheet');

    feature.destroy();
    assert.equal(navigateRules.size, 0, 'destroy removes the navigation rule');
    assert.equal(styles[0].removed, true, 'destroy removes the injected stylesheet');
    assert.equal(feature._styleEl, null);
    assert.equal(feature._container, null);
    assert.equal(feature._navRule, null);
    assert.equal(feature._attachTimer, null, 'destroy clears the pending attach timer');
});


// The SPA race, and the honesty of the save status.
//
// An adversarial review found three mutations the tests above could not see:
// dropping the video id captured when the edit was scheduled, dropping the
// flush from destroy, and reporting "Saved locally." after a failed write. The
// first is the exact bug the module's own comment says the capture exists to
// prevent, and losing user-typed text is the worst thing this feature can do.

test('a debounced edit is saved under the video it was typed on', () => {
    // The page has already moved on to B: getVideoId() answers B, while the
    // pending edit was scheduled on A. Dropping the captured id makes the
    // 450ms timer write A's text onto B, which is the race the module's own
    // comment says the capture exists to prevent.
    const { feature, appState } = build({ videoId: 'BBBBBBBBBBB' });

    feature._pendingSave = { value: 'notes about A', videoId: 'AAAAAAAAAAA', title: 'Video A' };
    feature._flushPendingSave();

    const stored = appState.settings.videoNotesData || {};
    assert.equal(stored.AAAAAAAAAAA?.note, 'notes about A', 'the note belongs to the video it was typed on');
    assert.equal(stored.BBBBBBBBBBB, undefined, 'and must not land on whatever is playing when the timer fires');
});

test('the pending edit is flushed when the feature is torn down', (t) => {
    const previousDocument = global.document;
    global.document = fakeTreeDocument(() => null);
    t.after(() => { global.document = previousDocument; });

    const { feature, appState } = build();
    feature.init();
    feature._pendingSave = { value: 'unsaved thought', videoId: 'CCCCCCCCCCC', title: 'Video C' };

    feature.destroy();

    assert.equal(appState.settings.videoNotesData?.CCCCCCCCCCC?.note, 'unsaved thought',
        'teardown must not discard text the user typed but has not paused long enough to save');
});

test('a failed write is reported as a failure, not as saved', () => {
    const statuses = [];
    const { feature } = build({ saveThrows: true });
    feature._statusEl = { textContent: '', hidden: false };
    feature._updateStatus = (message) => { statuses.push(message); };
    feature._setEmptyState = () => {};
    feature._updateCount = () => {};

    feature._saveCurrentNote('some text', 'DDDDDDDDDDD', 'Video D');

    assert.equal(statuses.length, 1);
    assert.match(statuses[0], /save/i);
    assert.doesNotMatch(statuses[0], /Saved locally/,
        'claiming success after a storage failure loses the note silently');
});
