'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// Run the module in THIS realm, matching the sibling pure-module tests. A vm
// sandbox would hand back arrays whose prototype belongs to the sandbox, and
// every deepStrictEqual against a plain [] would fail on prototype identity
// rather than on content.
function loadChapters() {
    globalThis.YTKitCore = {};
    const src = fs.readFileSync(path.join(__dirname, '..', 'extension', 'core', 'chapters.js'), 'utf8');
    // eslint-disable-next-line no-eval
    (0, eval)(src);
    return globalThis.YTKitCore;
}

const core = loadChapters();

const REAL_DESCRIPTION = [
    'Here is what we cover in this video.',
    '',
    '0:00 Introduction',
    '1:30 Setting up the workspace',
    '4:05 The first build',
    '12:44 Troubleshooting',
    '1:02:10 Final thoughts',
    '',
    'Links: https://example.com'
].join('\n');

test('timestamps parse in every shipped shape', () => {
    assert.equal(core.parseChapterTimestamp('0:00'), 0);
    assert.equal(core.parseChapterTimestamp('00:00'), 0);
    assert.equal(core.parseChapterTimestamp('1:30'), 90);
    assert.equal(core.parseChapterTimestamp('1:02:03'), 3723);
    assert.equal(core.parseChapterTimestamp('01:02:03'), 3723);
});

test('malformed stamps are rejected rather than coerced', () => {
    assert.equal(core.parseChapterTimestamp('1:75'), null, 'seconds over 59');
    assert.equal(core.parseChapterTimestamp('1:99:00'), null, 'minutes over 59 with an hour part');
    assert.equal(core.parseChapterTimestamp('abc'), null);
    assert.equal(core.parseChapterTimestamp(''), null);
    assert.equal(core.parseChapterTimestamp(null), null);
});

test('a real chapter list parses with its original titles', () => {
    const chapters = core.parseDescriptionChapters(REAL_DESCRIPTION);
    assert.equal(chapters.length, 5);
    assert.deepEqual(chapters[0], { startSeconds: 0, title: 'Introduction' });
    assert.deepEqual(chapters[4], { startSeconds: 3730, title: 'Final thoughts' });
});

test('list punctuation and separators around the stamp are stripped', () => {
    const chapters = core.parseDescriptionChapters([
        '- 0:00 - Intro',
        '• 2:00 — Middle',
        '(4:30) Wrap up'
    ].join('\n'));
    assert.deepEqual(chapters.map(c => c.title), ['Intro', 'Middle', 'Wrap up']);
});

test('a description that merely cites timestamps is NOT a chapter list', () => {
    // The load-bearing safety case: no 0:00 opener.
    const cited = [
        'My favourite bit is at 3:40 and the bloopers are at 8:12.',
        'Someone asked about 10:05 in the comments.',
        'Also see 12:00 for the summary.'
    ].join('\n');
    assert.deepEqual(core.parseDescriptionChapters(cited), []);
});

test('fewer than three chapters is not a chapter list', () => {
    assert.deepEqual(core.parseDescriptionChapters('0:00 Start\n5:00 End'), []);
});

test('chapters closer together than ten seconds are rejected', () => {
    assert.deepEqual(core.parseDescriptionChapters('0:00 A\n0:05 B\n1:00 C'), []);
});

test('a bare stamp with no label is skipped, not kept as an empty title', () => {
    const chapters = core.parseDescriptionChapters('0:00 Intro\n1:00\n2:00 Middle\n3:00 End');
    assert.deepEqual(chapters.map(c => c.title), ['Intro', 'Middle', 'End']);
});

test('an absurd number of stamps is refused outright', () => {
    const stamp = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const rest = seconds % 60;
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
    };
    const lines = [];
    // 130 well-formed, ascending, comfortably-spaced chapters — every one of
    // them individually valid, so only the cap can reject this.
    for (let index = 0; index < 130; index += 1) lines.push(`${stamp(index * 30)} Chapter ${index}`);
    assert.deepEqual(core.parseDescriptionChapters(lines.join('\n')), []);
});

test('minutes past 59 are legitimate when no hour part is present', () => {
    // "90:00" is how a long video's description writes 1h30m, and rejecting
    // it would silently drop the tail of a real chapter list.
    const chapters = core.parseDescriptionChapters('0:00 Start\n45:00 Middle\n90:00 Late\n120:00 End');
    assert.deepEqual(chapters.map(c => c.startSeconds), [0, 2700, 5400, 7200]);
});

test('empty and missing descriptions yield no chapters', () => {
    assert.deepEqual(core.parseDescriptionChapters(''), []);
    assert.deepEqual(core.parseDescriptionChapters(null), []);
    assert.deepEqual(core.parseDescriptionChapters(undefined), []);
});

test('a rendered title is matched to its original by timestamp', () => {
    const chapters = core.parseDescriptionChapters(REAL_DESCRIPTION);
    assert.equal(core.findChapterTitle(chapters, 90), 'Setting up the workspace');
    // One second of rounding slack, because the rail displays a rounded stamp.
    assert.equal(core.findChapterTitle(chapters, 91), 'Setting up the workspace');
    assert.equal(core.findChapterTitle(chapters, 300), null, 'no chapter near this point');
});

test('the restore plan names only the rows that were actually translated', () => {
    const chapters = core.parseDescriptionChapters(REAL_DESCRIPTION);
    const rendered = [
        { timestampText: '0:00', title: 'Einleitung' },
        { timestampText: '1:30', title: 'Setting up the workspace' },
        { timestampText: '4:05', title: 'Der erste Build' },
        { timestampText: '7:00', title: 'Not a chapter' }
    ];
    const plan = core.planChapterRestore(rendered, chapters);

    assert.equal(plan.length, 2, 'the untranslated row and the unmatched row are both left out');
    assert.deepEqual(
        plan.map(entry => [entry.from, entry.to]),
        [['Einleitung', 'Introduction'], ['Der erste Build', 'The first build']]
    );
    assert.equal(plan[0].row, rendered[0], 'the caller gets its own row back to write through');
});

test('a plan against no chapters is empty rather than destructive', () => {
    assert.deepEqual(core.planChapterRestore([{ timestampText: '0:00', title: 'X' }], []), []);
    assert.deepEqual(core.planChapterRestore(null, null), []);
});
