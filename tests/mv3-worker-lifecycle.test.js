'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const lifecycleSmoke = require('../scripts/smoke-mv3-worker-lifecycle');

const repoRoot = path.join(__dirname, '..');
const background = fs.readFileSync(path.join(repoRoot, 'extension', 'background.js'), 'utf8');
const smokeSource = fs.readFileSync(path.join(repoRoot, 'scripts', 'smoke-mv3-worker-lifecycle.js'), 'utf8');
const packageJson = require('../package.json');

function state(overrides = {}) {
    return {
        settings: { githubFullProfile: false, hideCreateButton: false, safeStoreProfile: true },
        pendingReveals: [],
        lifecycle: [
            { event: 'update-recovery-resumed', operationId: lifecycleSmoke.UPDATE_OPERATION_ID },
            { event: 'reveal-interrupted', operationId: 'download:7:interrupted' }
        ],
        updateRecovery: { id: lifecycleSmoke.UPDATE_OPERATION_ID, state: 'resumed' },
        permissions: { origins: ['https://*.youtube.com/*'], permissions: ['storage'] },
        ...overrides
    };
}

test('MV3 smoke closes real worker targets and never enables a visible browser path', () => {
    assert.match(smokeSource, /Target\.closeTarget/);
    assert.match(smokeSource, /if \(!args\.includes\('--headless=new'\)\) throw new Error/);
    assert.match(smokeSource, /windowsHide: true/);
    assert.match(smokeSource, /createChromiumStage\(stageRoot\)/);
    assert.doesNotMatch(smokeSource, /Input\.dispatch|--headed|openPopupFromToolbar/);
    assert.equal(packageJson.scripts['smoke:mv3-lifecycle'], 'node scripts/smoke-mv3-worker-lifecycle.js');
});

test('MV3 smoke covers settings, permissions, pending reveal, diagnostics, and update recovery', () => {
    for (const evidence of [
        'YTKIT_MUTATE_SETTING',
        'chrome.permissions.getAll()',
        'DOWNLOAD_FILE',
        'GET_SW_LIFECYCLE',
        'update-recovery-resumed',
        'reveal-interrupted'
    ]) assert.ok(smokeSource.includes(evidence), `missing lifecycle smoke evidence: ${evidence}`);
    assert.match(smokeSource, /JSON\.stringify\(after\.settings\) !== JSON\.stringify\(before\.settings\)/);
    assert.match(smokeSource, /JSON\.stringify\(after\.permissions\) !== JSON\.stringify\(before\.permissions\)/);
});

test('recovery assertions reject replay and accept one idempotent completion', () => {
    const valid = state();
    assert.doesNotThrow(() => lifecycleSmoke.assertRecoveredState(valid, valid, 7));
    assert.equal(lifecycleSmoke.countOperation(valid.lifecycle, 'update-recovery-resumed', lifecycleSmoke.UPDATE_OPERATION_ID), 1);
    assert.throws(() => lifecycleSmoke.assertRecoveredState(valid, {
        ...valid,
        lifecycle: [...valid.lifecycle, { event: 'update-recovery-resumed', operationId: lifecycleSmoke.UPDATE_OPERATION_ID }]
    }, 7), /exactly once/);
});

test('update recovery survives extension updates and restores session-only reveal state', () => {
    assert.match(background, /const UPDATE_RECOVERY_KEY = '_updateRecovery'/);
    const stageStart = background.indexOf('async function _stageUpdateRecovery');
    const resumeStart = background.indexOf('const _updateRecoveryReady');
    const updateBlock = background.slice(stageStart, background.indexOf("void _recordSwLifecycle('sw-start')") + 50);
    assert.ok(stageStart > -1 && resumeStart > stageStart);
    assert.match(updateBlock, /callExtensionApi\(ext\.storage\.local, 'set', \{ \[UPDATE_RECOVERY_KEY\]: checkpoint \}\)/,
        'storage.session is cleared on extension update, so checkpoints must use storage.local');
    assert.match(updateBlock, /callExtensionApi\(ext\.storage\.local, 'get', UPDATE_RECOVERY_KEY\)/);
    assert.match(updateBlock, /checkpoint\.version !== runningVersion/);
    assert.match(updateBlock, /_addPendingReveal\(downloadId\)/);
    assert.match(updateBlock, /callExtensionApi\(ext\.storage\.session, 'set', \{ \[_PENDING_REVEALS_KEY\]: \[\.\.\._pendingReveals\] \}\)/);
    assert.match(updateBlock, /ext\.runtime\.onUpdateAvailable\.addListener/);
});

test('lifecycle diagnostics deduplicate operation ids and wait for recovery before responding', () => {
    assert.match(background, /arr\.some\(\(entry\) => entry\?\.event === event && entry\?\.operationId === operationId\)/);
    assert.match(background, /void _recordSwLifecycle\(`reveal-\$\{state\}`/);
    const reader = background.slice(background.indexOf("msg.type === 'GET_SW_LIFECYCLE'"), background.indexOf("msg.type === 'NATIVE_MSG_GET_TOKEN'"));
    assert.match(reader, /await _updateRecoveryReady/);
    assert.match(reader, /await _swLifecycleChain\.catch/);
});

test('runtime-message expression preserves chrome.runtime.lastError for actionable failures', () => {
    const expression = lifecycleSmoke.runtimeMessageExpression({ type: 'GET_SW_LIFECYCLE' });
    assert.match(expression, /chrome\.runtime\.sendMessage/);
    assert.match(expression, /chrome\.runtime\.lastError\?\.message/);
});
