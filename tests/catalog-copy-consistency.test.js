'use strict';

// The settings catalog disagreeing with itself in ways a reader notices.
//
// One correction to the premise, up front. The 432 feature descriptions split
// roughly 288 without a full stop and 144 with one, which looks like drift and
// is not: the short ones are labels ("Hide clip button below videos") and the
// long ones are prose ("Set two points on the timeline and loop between them.
// Visual markers on the progress bar."). Forcing either register onto the other
// would be a regression dressed as consistency. What IS a defect is a
// description that runs to more than one sentence and never terminates, and
// there were three.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const en = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'extension', '_locales', 'en', 'messages.json'), 'utf8'));
const entries = Object.entries(en).map(([key, value]) => [key, String(value.message || '')]);

// WHEN a string reports a count, it SHALL be a singular/plural key pair rather
// than "(s)". That construction is not a plural in any language, it cannot be
// translated into one, and in English it reads as a typo.
test('no shipped string uses the (s) plural hack', () => {
    const offenders = entries
        .filter(([, message]) => /\(s\)/.test(message))
        .map(([key]) => key);
    assert.deepEqual(offenders, [],
        'a count string has to be a One/Other pair chosen at the call site');
});

test('every count string ships both halves of its pair', () => {
    const stems = new Set(entries
        .map(([key]) => key)
        .filter((key) => key.endsWith('One'))
        .map((key) => key.slice(0, -3)));
    const pluralStems = [...stems].filter((stem) => en[stem + 'Other']);
    assert.ok(pluralStems.length >= 8,
        `only ${pluralStems.length} plural pairs found; the eight converted ones must all be here`);

    for (const stem of pluralStems) {
        const one = en[stem + 'One'].message;
        const other = en[stem + 'Other'].message;
        assert.notEqual(one, other, `${stem}: the two halves must differ, or the pair is decoration`);
        // Same placeholders on both sides, or one of them renders a raw token.
        const tokensOf = (text) => [...String(text).matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]).sort();
        assert.deepEqual(tokensOf(one), tokensOf(other),
            `${stem}: both halves must carry the same substitutions`);
    }
});

// WHEN a chooser picks between the halves, it SHALL pick on the count. Reading
// the shipped implementation rather than restating it.
test('the plural chooser picks singular only at one', () => {
    for (const rel of ['extension/ytkit.js', 'extension/popup.js']) {
        const source = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
        const start = source.indexOf('function tCount(count, key, singular, plural) {');
        assert.ok(start > -1, `${rel} must define the chooser`);
        const body = source.slice(start, start + 400);
        assert.match(body, /Math\.abs\(n\) === 1/,
            `${rel}: -1 items is one item; a bare === 1 gets that wrong`);
        assert.match(body, /key \+ 'One'/);
        assert.match(body, /key \+ 'Other'/);
    }
});

// WHEN playback speed is written, it SHALL use the same character everywhere.
test('playback speed is written one way', () => {
    const offenders = entries
        .filter(([, message]) => /[0-9]\s*×/.test(message))
        .map(([key]) => key);
    assert.deepEqual(offenders, [],
        'two strings used a multiplication sign where the rest of the catalog uses x');
});

// WHEN two surfaces show the same number, they SHALL call it the same thing.
// The popup and the sidepanel both display the storage byte total, under
// "Storage" and "Size". The counts beside them are genuinely different measures
// — storage keys against customized settings — and keep their own names.
test('the byte total has one name across both surfaces', () => {
    assert.equal(en.spStatSize.message, en.statStorage.message,
        'the same number under two names is the reader’s problem, not a style choice');
});

// WHEN copy quotes how many features something covers, that number SHALL come
// from the registry. bisectIntro said 291 while the catalog defined far more,
// because it was typed into the sentence.
test('the bisect copy takes its feature count from the registry', () => {
    assert.match(en.bisectIntro.message, /\{count\}/,
        'the number must be a placeholder, not prose');
    assert.doesNotMatch(en.bisectIntro.message, /\b\d{2,}\b/,
        'no baked-in count may remain');

    const html = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.html'), 'utf8');
    assert.match(html, /narrow \{count\} of them down to one/,
        'the inline fallback carries the placeholder too, or it renders 291 again');

    const popup = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8');
    assert.match(popup, /function bisectFeatureCount\(\)/);
    assert.match(popup, /entry\.type === 'boolean'/,
        'the bisect halves feature toggles, so that is what it must count');
    assert.match(popup, /entry\.internal !== true/,
        'an internal key is not a feature the user can see it switch');
    assert.match(popup, /applyBisectFeatureCount\(root\)/,
        'and it has to actually run during the i18n pass');
});

test('the derived count is a real number for this build', () => {
    const { SETTINGS_SCHEMA } = require('../extension/core/settings-schema.js');
    const count = SETTINGS_SCHEMA.filter((entry) => entry.internal !== true && entry.type === 'boolean').length;
    assert.ok(count > 100, `the registry yielded ${count}, which is not a plausible feature count`);
});

// WHEN a feature name is written, it SHALL match the case convention the other
// 420 use.
test('feature names are Title Case, all of them', () => {
    const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of',
        'on', 'or', 'the', 'to', 'with', 'from', 'into', 'per', 'vs']);
    const offenders = entries
        .filter(([key]) => /^feature_.*_name$/.test(key))
        .filter(([, message]) => {
            const words = message.split(/\s+/).filter((word) => /^[A-Za-z]/.test(word));
            if (!words.length) return false;
            return !words.every((word, position) =>
                (position > 0 && SMALL.has(word.toLowerCase()))
                || word[0] === word[0].toUpperCase());
        })
        .map(([key]) => key);
    assert.deepEqual(offenders, [],
        'twelve names were sentence case among 420 Title Case ones');
});

// WHEN a description runs to more than one sentence, it SHALL end with a full
// stop. A single phrase does not have to, and most of them do not.
test('a multi-sentence description finishes its last sentence', () => {
    const offenders = entries
        .filter(([key]) => /^feature_.*_desc$/.test(key))
        .filter(([, message]) => /[.!?]\s+[A-Z"(]/.test(message))
        .filter(([, message]) => !/[.!?]["')\]]?\s*$/.test(message))
        .map(([key]) => key);
    assert.deepEqual(offenders, [],
        'prose that starts a second sentence has to finish the last one');
});
