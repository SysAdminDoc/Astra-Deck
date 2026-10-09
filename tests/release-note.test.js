'use strict';

// The popup's What's New banner and the userscript panel's note decide through
// one rule in core/persisted-domains.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveReleaseNoteState, formatReleaseNoteDetail, LAST_SEEN_VERSION_KEY, RELEASE_NOTES_URL } =
    require('../extension/core/persisted-domains.js');

test('the note shows only for an onboarded install that last saw another version', () => {
    assert.equal(LAST_SEEN_VERSION_KEY, 'ytkit_last_seen_version');
    assert.match(RELEASE_NOTES_URL, /^https:\/\/github\.com\/SysAdminDoc\/Astra-Deck\/blob\/main\/CHANGELOG\.md$/);
    const show = (input) => resolveReleaseNoteState(input).show;
    assert.equal(show({ version: '4.97.0', lastSeen: '4.96.0', firstRunSeen: true }), true);
    assert.equal(show({ version: '4.97.0', lastSeen: '', firstRunSeen: true }), true,
        'an onboarded install with an empty stamp still gets the tokenless note');
    assert.equal(show({ version: '4.97.0', lastSeen: '4.97.0', firstRunSeen: true }), false);
    assert.equal(show({ version: '4.97.0', lastSeen: '4.96.0', firstRunSeen: false }), false,
        'a fresh install gets onboarding, not a note');
    assert.equal(show({ version: '—', lastSeen: '4.96.0', firstRunSeen: true }), false,
        'an unreadable manifest version never shows');
    assert.equal(show({ version: '', lastSeen: '4.96.0', firstRunSeen: true }), false);
    assert.deepEqual(resolveReleaseNoteState({ version: '4.97.0', lastSeen: 42, firstRunSeen: true }),
        { show: true, version: '4.97.0', previous: '' }, 'a non-string stamp reads as none');
});

test('the note copy fills both versions through the catalogue', () => {
    const german = (key) => ({
        whatsNewDetailFromTpl: 'Aktualisiert auf v{version} (von v{previous}).',
        whatsNewDetailTpl: 'Aktualisiert auf v{version}.'
    })[key];
    assert.equal(formatReleaseNoteDetail({ version: '4.97.0', previous: '4.96.0' }, german),
        'Aktualisiert auf v4.97.0 (von v4.96.0).');
    assert.equal(formatReleaseNoteDetail({ version: '4.97.0', previous: '' }, german), 'Aktualisiert auf v4.97.0.');
    assert.equal(formatReleaseNoteDetail({ version: '4.97.0', previous: '$&' }),
        'Updated to v4.97.0 (from v$&). See what changed.', 'a version is inserted literally');
});
