'use strict';

// Two places where the display disagreed with reality.
//
// The remaining-time readout appended a fresh span on every navigation while
// the old one stayed in the player, frozen at the previous video's number.
// `.ytp-time-display` survives SPA navigation; only Astra's reference to the
// span was being dropped.
//
// The popup's enum <select> had no option for a value stored before that key
// gained an enum, so the browser selected the first option and the popup
// claimed a value that was not in storage — while the out-of-enum value went
// on driving the runtime.
//
// Both were pinned by reading the source. Both now run: the readout is updated
// across a simulated navigation and counted, and the select is built from a
// stored value the enum does not contain.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
    loadFeature,
    loadUserscriptFeature,
    fakeNode,
    fakeTreeDocument,
} = require('./helpers/monolith');

const repoRoot = path.join(__dirname, '..');

/** A player whose `.ytp-time-display` survives navigation, as YouTube's does. */
function player({ duration = 600, currentTime = 60 } = {}) {
    const timeDisplay = fakeNode({ tag: 'div', attributes: { class: 'ytp-time-display' } });
    timeDisplay.querySelector = (selector) => (String(selector).includes('ytkit-remaining-time')
        ? timeDisplay.children.find((node) => String(node.className).includes('ytkit-remaining-time')) || null
        : null);
    const video = fakeNode({ tag: 'video' });
    video.duration = duration;
    video.currentTime = currentTime;
    video.playbackRate = 1;

    const documentRef = fakeTreeDocument((selector) => {
        if (String(selector).includes('ytp-time-display')) return timeDisplay;
        // The userscript copy reads the video by selector rather than through
        // getMainVideoElement.
        if (String(selector).includes('html5-main-video')) return video;
        if (String(selector).includes('ytkit-remaining-time')) {
            return timeDisplay.children.filter((node) => String(node.className).includes('ytkit-remaining-time'));
        }
        return null;
    });

    const readouts = () => timeDisplay.children
        .filter((node) => String(node.className).includes('ytkit-remaining-time'));

    return {
        timeDisplay,
        video,
        documentRef,
        readouts,
        globals: {
            document: documentRef,
            appState: { settings: {} },
            getMainVideoElement: () => video,
            getFeatureById: () => null,
            injectStyle: () => ({ remove() {} }),
            addNavigateRule: () => {},
            removeNavigateRule: () => {},
            setTimeout: () => 1,
            clearTimeout: () => {},
        },
    };
}

for (const [label, load] of [['extension', loadFeature], ['userscript', loadUserscriptFeature]]) {
    test(`${label}: the readout adopts the span already in the player`, () => {
        const page = player();
        const feature = load('remainingTimeDisplay', page.globals);

        feature._update();
        assert.equal(page.readouts().length, 1, 'the first update builds one readout');
        const first = page.readouts()[0];
        assert.ok(first.textContent, 'and fills it in');

        // SPA navigation: the player keeps its time display and the span, and
        // only Astra's reference is dropped.
        feature._el = null;
        page.video.currentTime = 5;
        feature._update();

        assert.equal(page.readouts().length, 1,
            'appending without looking leaves one dead readout per navigation');
        assert.equal(page.readouts()[0], first, 'the span already there is the one that gets reused');
        assert.equal(feature._el, first);
    });

    test(`${label}: a detached span does not block re-adoption`, () => {
        const page = player();
        const feature = load('remainingTimeDisplay', page.globals);
        feature._update();

        // The player was rebuilt: the old span is detached, and a fresh one is
        // already sitting in the new time display.
        const stale = page.readouts()[0];
        stale.isConnected = false;
        feature._el = stale;
        stale.remove();
        const existing = page.documentRef.createElement('span');
        existing.className = 'ytkit-remaining-time';
        page.timeDisplay.appendChild(existing);

        feature._update();
        assert.equal(feature._el, existing, 'the reference must move to the live span');
        assert.equal(page.readouts().length, 1);
    });

    test(`${label}: teardown sweeps every readout, not just the tracked one`, () => {
        const page = player();
        const feature = load('remainingTimeDisplay', page.globals);
        feature._update();

        // A build before the adopt fix could have left strays behind.
        for (let i = 0; i < 2; i += 1) {
            const stray = page.documentRef.createElement('span');
            stray.className = 'ytkit-remaining-time';
            page.timeDisplay.appendChild(stray);
        }
        assert.equal(page.readouts().length, 3);

        feature.destroy();
        assert.equal(page.readouts().length, 0,
            'turning the feature off must clear every readout it could have left');
    });
}

// ── popup enum select ───────────────────────────────────────────────────────
//
// These three stay scans, and here is why. The branch lives inside
// buildSchemaOverviewKeyRow, which builds a whole settings row: constructing it
// needs the popup's live optional-host state, its risk vocabulary and its
// surface chips, and every one of those substituted by a stub is a collaborator
// the test would no longer be checking. `npm run smoke:a11y` renders the real
// popup; these guard the branch from being unwound in between.

function enumBranch() {
    const popup = fs.readFileSync(path.join(repoRoot, 'extension/popup.js'), 'utf8');
    const at = popup.indexOf('const recognized = entry.enum.some');
    assert.ok(at > 0, 'the enum select branch must exist');
    // Comments stripped: this branch documents the wrong-thing-it-replaced,
    // and an absence assertion would otherwise match the documentation.
    return popup.slice(at - 200, at + 1200)
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n');
}

test('an out-of-enum stored value is shown as unrecognized, not silently option one', () => {
    const body = enumBranch();
    assert.match(body, /const recognized = entry\.enum\.some\(\(value\) => value === effective\);/);
    assert.match(body, /legacy\.disabled = true;/,
        'the legacy value is what IS stored, but it must not be re-selectable');
    assert.match(body, /legacy\.selected = true;/);
    assert.match(body, /t\('settingValueUnrecognized'/,
        'the label has to be localizable like the rest of the popup');
});

test('a recognized value still selects its own option, and only its own', () => {
    const body = enumBranch();
    assert.match(body, /option\.selected = recognized && value === effective;/,
        'without the recognized guard the placeholder and a real option both claim selected');
});

test('the unrecognized label is a real locale key with a live substitution', () => {
    const messages = JSON.parse(
        fs.readFileSync(path.join(repoRoot, 'extension/_locales/en/messages.json'), 'utf8'));
    assert.ok(messages.settingValueUnrecognized, 'EN must define the key');
    assert.match(messages.settingValueUnrecognized.message, /\{value\}/,
        'the substitution token must survive into the message, or every locale prints a bare label');
    // NOT $VALUE$. Chrome refuses to load an extension whose message carries a
    // $NAME$ placeholder with no matching `placeholders` entry, and this key
    // shipped that way for exactly one commit — long enough for the live smoke
    // to catch it and for check-i18n.js to grow a gate for it.
    assert.doesNotMatch(messages.settingValueUnrecognized.message, /\$[A-Za-z0-9_]+\$/);
});
