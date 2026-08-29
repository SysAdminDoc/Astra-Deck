'use strict';

// Importing a backup from a NEWER build silently dropped any setting this
// build has never heard of. `skippedKeys` was computed by the validator and
// returned all the way up to the popup — and then discarded. The user saw
// only aggregate before/after counts, which cannot answer the one question
// that matters: did the setting I cared about survive?
//
// This was 22 pins on the plumbing. It now runs the import: a payload carrying
// unknown keys goes through the real validate/merge/report chain and the
// status the user would read is captured.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { loadDeclarationsFrom } = require('./helpers/monolith');
const { sources } = require('./helpers/source');

const repoRoot = path.join(__dirname, '..');
const policySource = fs.readFileSync(path.join(repoRoot, 'extension/core/policy-profile.js'), 'utf8');
const enMessages = JSON.parse(fs.readFileSync(path.join(repoRoot, 'extension/_locales/en/messages.json'), 'utf8'));

const IMPORT_CHAIN = [
    'lastImportSkippedKeys',
    'reportImportSkippedKeys',
    'takeLastImportSkippedKeys',
    'validateSettingsForBackupImport',
];

/**
 * The real import chain, wired to a policy that drops the keys named in
 * `unknown`. Returns the statuses and warnings a user would end up with.
 */
function importChain({ unknown = [] } = {}) {
    const statuses = [];
    const warnings = [];
    const api = loadDeclarationsFrom(sources.popup, IMPORT_CHAIN, {
        ensurePolicyProfile: () => ({
            validateSettingsSnapshot: (settings) => {
                const kept = { ...settings };
                for (const key of unknown) delete kept[key];
                return { ok: true, settings: kept, skippedKeys: unknown.slice() };
            },
        }),
        sanitizeSettingsObject: (settings) => settings,
        formatSchemaValidationError: (label) => label,
        showStatus: (message, type, duration) => statuses.push({ message, type, duration }),
        console: { warn: (...args) => warnings.push(args.join(' ')) },
        tCount: (count, _key, one, other) => (count === 1 ? one : other),
    });
    return { api, statuses, warnings };
}

test('the validator still reports which keys it dropped', () => {
    // The producer half lives in a module the popup only consumes; its own
    // behaviour is covered with the policy profile.
    assert.match(policySource, /skippedKeys/,
        'the producer side of this contract must exist for the popup to consume it');
});

test('the popup captures the keys the validator dropped', () => {
    const chain = importChain({ unknown: ['brandNewToggle', 'anotherNewOne'] });
    chain.api.validateSettingsForBackupImport({ hideSidebar: true, brandNewToggle: 1, anotherNewOne: 2 });

    assert.deepEqual(Array.from(chain.api.takeLastImportSkippedKeys()), ['brandNewToggle', 'anotherNewOne'],
        'the popup must read the skipped keys the validator returns');
});

test('the skipped list is emptied by the take, and by the next import', () => {
    // Array.from throughout: an array built inside the vm realm is never
    // reference-equal to a host-realm one under assert/strict.
    const chain = importChain({ unknown: ['brandNewToggle'] });
    chain.api.validateSettingsForBackupImport({ brandNewToggle: 1 });
    assert.deepEqual(Array.from(chain.api.takeLastImportSkippedKeys()), ['brandNewToggle']);
    assert.deepEqual(Array.from(chain.api.takeLastImportSkippedKeys()), [],
        'taking the list must empty it, or one import reports twice');

    // A second import that skips nothing must not inherit the first one's list.
    const carried = importChain({ unknown: ['first'] });
    carried.api.validateSettingsForBackupImport({ first: 1 });
    carried.api.globalThis.ensurePolicyProfile = () => ({
        validateSettingsSnapshot: (settings) => ({ ok: true, settings, skippedKeys: [] }),
    });
    carried.api.validateSettingsForBackupImport({ hideSidebar: true });
    assert.deepEqual(Array.from(carried.api.takeLastImportSkippedKeys()), [],
        'an import that skipped nothing must not report the previous one keys');
});

test('the status names the dropped settings rather than counting them', () => {
    const chain = importChain();
    chain.api.reportImportSkippedKeys(['brandNewToggle', 'anotherNewOne']);

    assert.equal(chain.statuses.length, 1, 'the user is told once');
    const [status] = chain.statuses;
    assert.match(status.message, /brandNewToggle/, 'the whole point is naming the dropped settings');
    assert.match(status.message, /anotherNewOne/);
    assert.match(status.message, /^2 settings/, 'and counting them, in the plural form');
    assert.ok(['info', 'success', 'error', 'ok'].includes(status.type),
        `${status.type} is not a status type showStatus renders`);
    assert.ok(status.duration >= 6000,
        `a list of setting names needs more than ${status.duration}ms on screen`);
    assert.equal(chain.warnings.length, 1, 'and the full list reaches the console for support');
    assert.match(chain.warnings[0], /brandNewToggle, anotherNewOne/);
});

test('a single skipped key reads in the singular', () => {
    const chain = importChain();
    chain.api.reportImportSkippedKeys(['brandNewToggle']);
    assert.match(chain.statuses[0].message, /^1 setting /,
        'Chrome i18n has no plural support, so the call site chooses the form');
});

test('a long list is truncated with a count of the rest, not silently cut', () => {
    const keys = Array.from({ length: 10 }, (_, index) => `key${index}`);
    const chain = importChain();
    chain.api.reportImportSkippedKeys(keys);

    const [status] = chain.statuses;
    assert.match(status.message, /key0, key1, key2, key3, key4, key5/, 'the first six are named');
    assert.doesNotMatch(status.message, /key6/, 'the rest are not');
    assert.match(status.message, /\(\+4 more\)/, 'and the user is told how many were left out');
    assert.match(chain.warnings[0], /key9/, 'while the console still carries all of them');
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
