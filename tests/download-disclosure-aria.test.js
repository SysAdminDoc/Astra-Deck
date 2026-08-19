'use strict';

// The speed button in the same player dock declares aria-haspopup="menu" and
// an initial aria-expanded="false". The two download triggers declared neither,
// so aria-expanded only materialised after the popup had been opened once — a
// disclosure widget with no disclosure state for the whole first visit.
//
// The context-menu path made the opposite mistake: with no download button on
// the page it passes #movie_player purely as a positioning anchor, and the
// popup stamped aria-expanded onto that plain div.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(repoRoot, p), 'utf8');

const playerDock = read('extension/features/player-dock/index.js');
const downloadUi = read('extension/features/download-ui/index.js');
const monolith = read('extension/ytkit.js');

// ── both triggers declare the state from creation ─────────────────────────

test('the in-player download trigger declares its disclosure state at creation', () => {
    for (const [label, source] of [['player-dock', playerDock], ['ytkit.js', monolith]]) {
        const at = source.indexOf("'ytp-button ytkit-player-btn ytkit-po-dl'");
        assert.ok(at > 0, `${label} must still build the .ytkit-po-dl trigger`);
        const block = source.slice(at, source.indexOf('wrap.appendChild(dlBtn)', at));
        assert.match(block, /dlBtn\.setAttribute\('aria-haspopup', 'dialog'\)/,
            `${label}: the download trigger opens a dialog, and must say so`);
        assert.match(block, /dlBtn\.setAttribute\('aria-expanded', 'false'\)/,
            `${label}: the collapsed state must exist before the first open`);
    }
});

test('the watch-page download trigger declares the same contract', () => {
    const at = monolith.indexOf("'ytkit-watch-action-btn ytkit-local-dl-btn'");
    assert.ok(at > 0, 'ytkit.js must still build the .ytkit-local-dl-btn trigger');
    const block = monolith.slice(at, at + 1400);
    assert.match(block, /btn\.setAttribute\('aria-haspopup', 'dialog'\)/);
    assert.match(block, /btn\.setAttribute\('aria-expanded', 'false'\)/);
});

test('the sibling speed button still sets the pattern these two now follow', () => {
    // If the speed control ever drops the contract, these assertions are
    // copying a broken precedent rather than a good one.
    assert.match(playerDock, /speedBtn\.setAttribute\('aria-haspopup', 'menu'\)/);
    assert.match(playerDock, /speedBtn\.setAttribute\('aria-expanded', 'false'\)/);
});

// ── the popup only stamps state onto real widgets ─────────────────────────

// isDisclosureTrigger decides which anchors get aria-expanded. Executing it is
// the only way to test the #movie_player case: a source pin sees the guard, not
// what the guard lets through.
function loadIsDisclosureTrigger() {
    const at = downloadUi.indexOf('function isDisclosureTrigger(el) {');
    assert.ok(at > 0, 'download-ui must define isDisclosureTrigger');
    const end = downloadUi.indexOf('\n        }', at) + '\n        }'.length;
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(`${downloadUi.slice(at, end)}\nglobalThis.__fn = isDisclosureTrigger;`, sandbox);
    return sandbox.__fn;
}

const fakeEl = (tagName, role = null) => ({
    tagName,
    getAttribute: (name) => (name === 'role' ? role : null)
});

test('a button anchor gets the disclosure state', () => {
    const isDisclosureTrigger = loadIsDisclosureTrigger();
    assert.equal(isDisclosureTrigger(fakeEl('BUTTON')), true);
    assert.equal(isDisclosureTrigger(fakeEl('DIV', 'button')), true,
        'an explicit button role is a widget even on a div');
});

test('#movie_player does not get the disclosure state', () => {
    const isDisclosureTrigger = loadIsDisclosureTrigger();
    // What the context-menu fallback actually passes: a plain container used
    // for positioning. aria-expanded on it announces a state it does not have.
    assert.equal(isDisclosureTrigger(fakeEl('DIV')), false);
    assert.equal(isDisclosureTrigger(null), false);
    assert.equal(isDisclosureTrigger({}), false, 'a node with no getAttribute must not throw');
});

test('the popup routes every aria-expanded write through the guard', () => {
    const at = downloadUi.indexOf('const disclosureAnchor = isDisclosureTrigger(anchorEl)');
    assert.ok(at > 0, 'the open path must resolve the disclosure anchor');
    // Both cleanup closures and the open path: none may write to anchorEl.
    const writes = [...downloadUi.matchAll(/(\w+)\?\.setAttribute\?\.\('aria-expanded'/g)]
        .map((m) => m[1]);
    assert.ok(writes.length >= 3, `expected the open path and both cleanups, found ${writes.length}`);
    assert.deepEqual([...new Set(writes)], ['disclosureAnchor'],
        'aria-expanded must never be written to the raw anchor again');
});

test('the context-menu fallback still passes #movie_player for positioning', () => {
    // The guard is the fix, not removing the fallback: without an anchor the
    // popup has nothing to position against.
    assert.match(monolith,
        /showDownloadPopup\(playerBtn \|\| document\.querySelector\('#movie_player'\)\)/,
        'the popup still needs a positioning anchor when no trigger is on the page');
});
