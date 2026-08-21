'use strict';

// Two related roadmap items, both about copy that told the user the wrong
// thing rather than merely reading awkwardly:
//
//  * statusResetSnapshotFail blamed "data too large for recoverable reset".
//    That stopped being true when the bulk of the snapshot moved to IndexedDB
//    and the stored payload became a tiny descriptor — the only real causes
//    are an unavailable storage API or a rejected pointer write. The pointer
//    then moved from session storage to local storage so the undo survives a
//    browser restart, and the copy moved with it.
//  * filterListStatusRefreshFail served two different failures, and the
//    helpers-unavailable branch told users to "Check the address, then try
//    again" when the address is fine and retrying cannot help.
//  * statusImportSnapshotFail carried two different English fallbacks, so the
//    visible string depended on which call site won.
//  * One destination went by three names, and a comment cited a PIN that does
//    not exist anywhere in the surface.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(repoRoot, p), 'utf8');

const popupJs = read('extension/popup.js');
const popupHtml = read('extension/popup.html');
const sidepanelJs = read('extension/sidepanel.js');
const enMessages = JSON.parse(read('extension/_locales/en/messages.json'));
const LOCALES = ['ar', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pt_BR', 'ru', 'zh_CN'];

function fallbacksFor(key) {
    const pattern = new RegExp(`t\\('${key}',\\s*\\n?\\s*'((?:[^'\\\\]|\\\\.)*)'`, 'g');
    return [...popupJs.matchAll(pattern)].map((m) => m[1]);
}

// ── one key, one fallback ─────────────────────────────────────────────────

test('the import-snapshot failure reads the same at both call sites', () => {
    const fallbacks = fallbacksFor('statusImportSnapshotFail');
    assert.equal(fallbacks.length, 2, 'both call sites must still be present');
    assert.equal(fallbacks[0], fallbacks[1],
        'a drifted fallback means the visible string depends on which site won');
    assert.equal(fallbacks[0], enMessages.statusImportSnapshotFail.message,
        'the fallback must match the message it stands in for');
});

test('the reset-snapshot failure names the real cause', () => {
    // This assertion used to require the words "session storage". That was
    // right while the undo pointer lived in chrome.storage.session; it is
    // wrong now that the pointer is durable, and naming the wrong storage area
    // is exactly the defect this test exists to catch.
    const message = enMessages.statusResetSnapshotFail.message;
    assert.match(message, /extension storage/i,
        'the failure is a write to extension storage, and the copy should say so');
    assert.doesNotMatch(message, /session storage/i,
        'the undo pointer no longer lives in session storage');
    assert.doesNotMatch(message, /too large/i,
        'the payload is a small descriptor now; the bulk lives in IndexedDB');
    assert.equal(fallbacksFor('statusResetSnapshotFail')[0], message);
});

test('the undo copy no longer promises recovery only until the browser closes', () => {
    // Reset and Import both told the user the undo lasted "until you close the
    // browser". It outlives a restart now, bounded by a 7-day retention
    // window, so the promise had to be restated rather than quietly dropped.
    for (const key of ['statusResetDoneUndo', 'statusBackupImportedUndo']) {
        const message = enMessages[key].message;
        assert.doesNotMatch(message, /until you close the browser/i,
            `${key} must not promise an undo that dies with the browser session`);
        assert.match(message, /7 days/,
            `${key} must state the retention window the undo actually has`);
    }
    for (const key of ['statusResetUndoExpired', 'statusImportUndoExpired']) {
        assert.doesNotMatch(enMessages[key].message, /session/i,
            `${key} must not blame the browser session for an expiry it no longer causes`);
    }
});

test('the filter-list state read has its own key, separate from a refresh failure', () => {
    assert.ok(enMessages.filterListStatusStateReadFail,
        'the helpers-unavailable branch needs a key of its own');
    assert.doesNotMatch(enMessages.filterListStatusStateReadFail.message, /address/i,
        'the address is fine in this branch — sending users to check it is a wrong lead');
    assert.match(enMessages.filterListStatusRefreshFail.message, /address/i,
        'the refresh failure keeps its cause-accurate advice');
    assert.match(popupJs, /setFilterListStatus\('filterListStatusStateReadFail'/,
        'the branch must use the new key');
});

// ── one destination, one name ─────────────────────────────────────────────

test('the settings workspace goes by one noun', () => {
    const surfaces = [
        enMessages.openFullSettings.message,
        enMessages.contextNoteInlinePanel.message,
        enMessages.workspaceEyebrow.message
    ];
    for (const copy of surfaces) {
        assert.match(copy, /workspace/i, `"${copy}" must name the same destination as its siblings`);
    }
    assert.doesNotMatch(enMessages.openFullSettings.message, /full settings/i,
        'the third name for the same place');
});

test('the Settings overview reference matches the heading it points at', () => {
    assert.equal(enMessages.schemaOverviewEyebrow.message, 'Settings overview');
    assert.match(enMessages.dlCobaltInstanceRequired.message, /Settings overview/,
        'the pointer must use the section\'s own capitalisation');
    assert.doesNotMatch(popupJs, /popup Settings Overview/,
        'the fallbacks must match too');
});

// ── dashes and placeholders ───────────────────────────────────────────────

test('the welcome skip uses no dash, and the markup agrees with the message', () => {
    const message = enMessages.welcomePresetSkip.message;
    assert.doesNotMatch(message, /[—–]| - /, 'no dash stand-ins in surface copy');
    assert.ok(popupHtml.includes(`>${message}<`),
        'the inline fallback in popup.html must match the message it falls back to');
});

test('the welcome skip is translated everywhere, not carried as English', () => {
    for (const locale of LOCALES) {
        const messages = JSON.parse(read(`extension/_locales/${locale}/messages.json`));
        assert.notEqual(messages.welcomePresetSkip.message, enMessages.welcomePresetSkip.message,
            `${locale} still ships the English string`);
    }
});

test('the side panel settings count uses the placeholder its siblings use', () => {
    const at = sidepanelJs.indexOf('if (_settingsLoadError) {');
    assert.ok(at > 0, 'the settings-load error branch must still exist');
    const block = sidepanelJs.slice(at, sidepanelJs.indexOf('if (settingsClear)', at));
    assert.match(block, /settingsCount\.textContent = '--';/,
        'a lone "Unavailable" next to two "--" siblings reads as inattention');
    assert.doesNotMatch(block, /spStatUnavailable/);
});

// ── the comment that described code that never existed ────────────────────

test('no comment in the popup claims a PIN', () => {
    assert.doesNotMatch(popupJs, /bypassing the PIN/,
        'the surface has no PIN; the comment sent maintainers looking for one');
    const at = popupJs.indexOf('storageBannerResetBtn.addEventListener');
    assert.ok(at > 0, 'the storage banner reset must still be wired');
    const preamble = popupJs.slice(Math.max(0, at - 420), at);
    assert.match(preamble, /resetAllData\(\) flow/,
        'the comment must say what routing through the primary flow actually buys');
    assert.match(preamble, /undo snapshot/);
});
