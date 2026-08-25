'use strict';

// Download-progress announcements, replayed rather than read.
//
// The gate beside this asserts the shape of the dedupe key. It cannot tell you
// what a screen reader actually hears, which is how a key that collided on
// ('error', 'Needs Attention') — sent by BOTH the needs-auth poll and the
// terminal failure — passed review: the download could fail outright while the
// announcer still said "Waiting".

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const source = fs.readFileSync(
    path.join(repoRoot, 'extension', 'features', 'download-ui', 'index.js'), 'utf8');

// Lift the shipped setProgressState closure out and run it against nodes that
// record what a live region would have spoken.
function buildAnnouncer() {
    const start = source.indexOf('let announcedState = \'\';');
    assert.ok(start > -1, 'the dedupe state must still be here');
    const end = source.indexOf('\n            };', start);
    assert.ok(end > start, 'the setter must still end where it did');
    const body = source.slice(start, end + '\n            };'.length);

    const spoken = [];
    const node = () => ({ textContent: '', attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } });
    const panel = { dataset: {} };
    const statePill = node();
    const statusCopy = node();
    const actions = { hidden: true };
    const progressAnnouncer = {
        attributes: { 'aria-live': 'polite' },
        _text: '',
        setAttribute(name, value) { this.attributes[name] = value; },
        get textContent() { return this._text; },
        set textContent(value) {
            this._text = value;
            spoken.push({ politeness: this.attributes['aria-live'], text: value });
        }
    };

    // eslint-disable-next-line no-new-func
    const make = new Function(
        'panel', 'statePill', 'statusCopy', 'actions', 'progressAnnouncer',
        body + '\nreturn setProgressState;'
    );
    return {
        setProgressState: make(panel, statePill, statusCopy, actions, progressAnnouncer),
        spoken,
        panel,
        actions
    };
}

const NEEDS_ATTENTION = 'Needs Attention';

// WHEN a download that was waiting on authentication then fails outright, the
// failure SHALL be announced. It is the state a listener most needs to hear:
// it is the one with a Repair button attached.
test('a terminal failure is announced even after a needs-auth warning', () => {
    const { setProgressState, spoken, actions } = buildAnnouncer();

    setProgressState('pending', 'Preparing', 'Connecting to Astra Downloader.');
    setProgressState('error', NEEDS_ATTENTION, 'Waiting');
    setProgressState('error', NEEDS_ATTENTION,
        'yt-dlp could not sign in. Choose Repair downloader.', true);

    assert.equal(actions.hidden, false, 'the Repair button is showing');
    assert.equal(spoken.length, 3,
        'three distinct states, three announcements');
    assert.equal(spoken[2].text, 'yt-dlp could not sign in. Choose Repair downloader.');
    assert.equal(spoken[2].politeness, 'assertive',
        'a failure interrupts rather than queueing behind the warning');
});

// WHEN a download is running, its percentage SHALL NOT be announced on every
// poll. This is the flood the dedupe exists to stop, and the reason the key
// cannot simply include the copy everywhere.
test('an active download does not announce its percentage every poll', () => {
    const { setProgressState, spoken } = buildAnnouncer();

    setProgressState('pending', 'Preparing', 'Connecting to Astra Downloader.');
    for (let percent = 1; percent <= 60; percent += 1) {
        setProgressState('active', 'Downloading', `${percent}.0% complete. 2:00 remaining.`);
    }

    assert.equal(spoken.length, 2,
        `a 60-tick download must announce twice, not ${spoken.length} times`);
    assert.equal(spoken[1].text, '1.0% complete. 2:00 remaining.');
});

// WHEN a download changes between distinct non-active states, each SHALL be
// announced, including two that share a tone.
test('distinct non-active states are each announced', () => {
    const { setProgressState, spoken } = buildAnnouncer();

    setProgressState('active', 'Downloading', '10.0% complete.');
    setProgressState('warning', 'Status Unknown', 'Astra Downloader reported an unrecognized status.');
    setProgressState('error', 'Connection Lost', 'Astra Deck lost contact with Astra Downloader.');
    setProgressState('error', NEEDS_ATTENTION, 'Waiting');
    setProgressState('error', NEEDS_ATTENTION, 'Waiting');

    assert.equal(spoken.length, 4, 'only the exact repeat is suppressed');
    assert.deepEqual(spoken.map((entry) => entry.politeness),
        ['polite', 'polite', 'assertive', 'assertive']);
});

// WHEN the panel is built, the announcer SHALL be in the document before
// anything is written into it. A live region does not speak text that was
// already present when it was inserted, so the opening line was silently
// dropped — and marked as announced, which swallowed the next identical state.
test('nothing is announced into the region before it is in the document', () => {
    // NO announcement may precede the insertion, not merely the one that was
    // moved. Matching a single formatting of the opening call let a second
    // setProgressState be added above it without this noticing.
    const setterAt = source.indexOf('const setProgressState = (tone, label, copy');
    const insertion = source.indexOf('document.body.appendChild(panel);', setterAt);
    assert.ok(setterAt > -1 && insertion > setterAt, 'both landmarks must still exist');

    const before = source.slice(setterAt, insertion);
    // The definition reads `setProgressState = (`, so it is not a call and does
    // not count here. Any match at all is an announcement made into a region
    // that is not in the document yet.
    const calls = [...before.matchAll(/(?<![.\w])setProgressState\(/g)];
    assert.equal(calls.length, 0,
        'nothing may be announced before the panel is appended: '
        + 'a live region does not speak text that was already there when it was inserted');

    const after = source.slice(insertion, insertion + 900);
    assert.match(after, /setProgressState\(\s*\n?\s*'pending'/,
        'and the opening state has to be set once the panel is in the document');
});
