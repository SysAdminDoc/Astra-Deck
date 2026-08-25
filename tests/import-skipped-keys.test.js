'use strict';

// Importing a backup from a NEWER build silently dropped any setting this
// build has never heard of. `skippedKeys` was computed by the validator and
// returned all the way up to the popup — and then discarded. The user saw
// only aggregate before/after counts, which cannot answer the one question
// that matters: did the setting I cared about survive?

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const popupSource = fs.readFileSync(path.join(repoRoot, 'extension/popup.js'), 'utf8');
const policySource = fs.readFileSync(path.join(repoRoot, 'extension/core/policy-profile.js'), 'utf8');
const enMessages = JSON.parse(fs.readFileSync(path.join(repoRoot, 'extension/_locales/en/messages.json'), 'utf8'));

test('the validator still reports which keys it dropped', () => {
    assert.match(policySource, /skippedKeys/,
        'the producer side of this contract must exist for the popup to consume it');
});

test('the popup captures skippedKeys instead of discarding them', () => {
    const start = popupSource.indexOf('function validateSettingsForBackupImport');
    assert.ok(start > 0);
    const body = popupSource.slice(start, start + 1600);
    assert.match(body, /validation\.skippedKeys/,
        'the popup must read the skipped keys the validator returns');
    assert.match(body, /lastImportSkippedKeys = validation\.skippedKeys\.slice\(\)/);
});

test('a merge that skipped keys reports them', () => {
    const start = popupSource.indexOf('function mergeImportedSettingsWithDefaults');
    assert.ok(start > 0);
    const body = popupSource.slice(start, start + 1200);
    assert.match(body, /takeLastImportSkippedKeys\(\)/);
    assert.match(body, /reportImportSkippedKeys\(skipped\)/);
});

test('the report names the keys, not just a count', () => {
    const start = popupSource.indexOf('function reportImportSkippedKeys');
    assert.ok(start > 0, 'the reporter must exist');
    const body = popupSource.slice(start, start + 900);
    assert.match(body, /keys\.slice\(0, MAX_NAMED\)\.join\(', '\)/,
        'the whole point is naming the dropped settings');
    assert.match(body, /\{keys\}/, 'the locale template must receive the names');
    assert.match(body, /\{count\}/);
    assert.match(body, /showStatus\(/);
});

test('the status is held long enough to read a list of names', () => {
    const start = popupSource.indexOf('function reportImportSkippedKeys');
    const body = popupSource.slice(start, start + 900);
    const match = /showStatus\(message, '[a-z]+', (\d+)\)/.exec(body);
    assert.ok(match, 'the reporter must call showStatus with an explicit duration');
    assert.ok(Number(match[1]) >= 6000,
        `a list of setting names needs more than ${match[1]}ms on screen`);
});

test('the reporter reads a real status type', () => {
    const start = popupSource.indexOf('function reportImportSkippedKeys');
    const body = popupSource.slice(start, start + 900);
    const match = /showStatus\(message, '([a-z]+)'/.exec(body);
    assert.ok(match);
    // showStatus normalizes 'ok' to 'success'; anything outside this set would
    // render an unstyled banner class.
    assert.ok(['info', 'success', 'error', 'ok'].includes(match[1]),
        `${match[1]} is not a status type showStatus renders`);
});

test('the template exists in EN and carries both tokens', () => {
    // Was one key carrying "setting(s)". Chrome's i18n has no plural support,
    // so a count string is a pair chosen between at the call site, and BOTH
    // halves have to carry both tokens: a half that drops one renders a raw
    // placeholder, or loses the list of skipped keys entirely.
    for (const key of ['statusImportSkippedKeysTplOne', 'statusImportSkippedKeysTplOther']) {
        const entry = enMessages[key];
        assert.ok(entry, `${key} must exist`);
        assert.match(entry.message, /\{count\}/);
        assert.match(entry.message, /\{keys\}/);
    }
});

test('the skipped list is cleared between imports', () => {
    const start = popupSource.indexOf('function validateSettingsForBackupImport');
    const body = popupSource.slice(start, start + 400);
    assert.match(body, /lastImportSkippedKeys = \[\];/,
        'a second import must not inherit the first import\'s skipped keys');
    const take = popupSource.indexOf('function takeLastImportSkippedKeys');
    assert.ok(take > 0);
    assert.match(popupSource.slice(take, take + 250), /lastImportSkippedKeys = \[\]/);
});
