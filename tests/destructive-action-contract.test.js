'use strict';

// Three surfaces used to apply three different safety contracts to comparable
// destructive actions: one irreversible action with neither confirmation nor
// undo, one per-entry delete with no undo sitting twenty lines above two bulk
// siblings that have one, and an import whose undo appeared only when there
// happened to be prior data to snapshot. The rule these pin: every destructive
// action either restores on undo, or says in its own toast that it cannot.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');

const ytkitSource = read('extension', 'ytkit.js');
const settingsPanelSource = read('extension', 'features', 'settings-panel', 'index.js');
const popupSource = read('extension', 'popup.js');

function hiddenListDeleteHandler(label, source) {
    // Bound the slice on real landmarks in the handler rather than a byte
    // window, so the assertions cannot go vacuous when the block grows.
    const start = source.indexOf('videoHiderRemoveHiddenVideoAriaTpl');
    assert.ok(start > -1, `${label} must build the per-entry "Remove From List" action`);
    const end = source.indexOf('actions.appendChild(link);', start);
    assert.ok(end > start, `${label} delete handler must end at the action row assembly`);
    return source.slice(start, end);
}

test('per-entry hidden-list delete offers the same undo its bulk siblings do', () => {
    for (const [label, source] of [
        ['monolith', ytkitSource],
        ['settings-panel module', settingsPanelSource]
    ]) {
        const block = hiddenListDeleteHandler(label, source);
        assert.ok(block.includes("_removeHiddenVideos?.([vid])"),
            `${label} delete must remove the entry`);
        assert.match(block, /action:\s*\{\s*text:\s*t\('toastActionUndo'/,
            `${label} delete must offer Undo, like "Clear Hidden List Only" twenty lines below`);
        assert.ok(block.includes('_addHiddenVideos?.(removed)'),
            `${label} undo must put the removed entry back, not merely re-render`);
        // A no-op delete has nothing to undo and must not pretend otherwise.
        assert.ok(block.includes('if (removed.length === 0)'),
            `${label} must not offer Undo when nothing was removed`);
    }
});

test('both hidden-list copies stayed in step', () => {
    // The peel left two implementations of this panel; a fix applied to one and
    // not the other is the failure mode this repo keeps hitting.
    const monolith = hiddenListDeleteHandler('monolith', ytkitSource);
    const module = hiddenListDeleteHandler('settings-panel module', settingsPanelSource);
    for (const marker of ['_addHiddenVideos?.(removed)', 'toastActionUndo', 'if (removed.length === 0)']) {
        assert.ok(monolith.includes(marker) && module.includes(marker),
            `both copies must carry ${marker}`);
    }
});

test('the one destructive action that cannot be undone says so', () => {
    const start = popupSource.indexOf('async function deleteAiCredential()');
    assert.ok(start > -1, 'deleteAiCredential must exist');
    const end = popupSource.indexOf('\nasync function broadcastSettingsReplaced', start);
    assert.ok(end > start, 'the deleteAiCredential slice must end at the next function');
    const block = popupSource.slice(start, end);

    // No undo is possible: the stored secret is never re-displayable, so the
    // popup holds no copy to restore. The contract is honesty, not a fake undo.
    assert.ok(block.includes("t('aiCredentialDeleted'"),
        'the delete confirmation must go through the locale key');
    assert.match(block, /cannot be undone/,
        'an irreversible action must not read like the reversible ones');
    assert.doesNotMatch(block, /toastActionUndo|action:\s*\{/,
        'deleteAiCredential must not offer an undo it cannot honour');
});

test('the irreversibility warning is localized, not English-only', () => {
    const en = JSON.parse(read('extension', '_locales', 'en', 'messages.json'));
    assert.match(en.aiCredentialDeleted.message, /cannot be undone/);
    for (const locale of ['de', 'es', 'fr', 'it', 'pt_BR', 'ru', 'ja', 'ko', 'ar', 'zh_CN']) {
        const messages = JSON.parse(read('extension', '_locales', locale, 'messages.json'));
        assert.notEqual(messages.aiCredentialDeleted.message, en.aiCredentialDeleted.message,
            `${locale} must carry a real translation, not the English fallback`);
        assert.ok(messages.aiCredentialDeleted.message.length > 30,
            `${locale} must carry the full warning, not just the old short sentence`);
    }
});
