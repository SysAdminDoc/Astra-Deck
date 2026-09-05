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

function build({ settings = {}, saveThrows = false } = {}) {
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
        getVideoId: () => 'dQw4w9WgXcQ',
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
