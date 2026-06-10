'use strict';

// Regression tests for the 2026-06-10 verified-audit logic-fix pass.
// Each test pins a behavior (or its source shape) so future refactors
// can't silently reintroduce the audited bug. Follows the extraction
// patterns established in tests/hardening.test.js and
// tests/settings-migration-roundtrip.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { findBalancedObjectLiteral } = require('../scripts/catalog-utils');

const repoRoot = path.join(__dirname, '..');
const ytkitSource = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
const stickySource = fs.readFileSync(
    path.join(repoRoot, 'extension', 'features', 'sticky-video', 'index.js'),
    'utf8'
);
const schemaSource = fs.readFileSync(
    path.join(repoRoot, 'extension', 'core', 'settings-schema.js'),
    'utf8'
);
const defaultSettings = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'extension', 'default-settings.json'), 'utf8')
);

function featureBlock(id, length = 95000) {
    const start = ytkitSource.indexOf(`id: '${id}'`);
    assert.ok(start > -1, `feature '${id}' must exist in ytkit.js`);
    return ytkitSource.slice(start, start + length);
}

function methodSlice(block, marker, length = 3000) {
    const idx = block.indexOf(marker);
    assert.ok(idx > -1, `marker '${marker}' must exist in feature block`);
    return block.slice(idx, idx + length);
}

// ── behavioral settingsManager extraction (same harness as the
//    settings-migration-roundtrip suite) ──

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSafeObjectKey(key) {
    return key !== '__proto__' && key !== 'prototype' && key !== 'constructor';
}

function extractRetiredSettingKeys(source) {
    const match = source.match(/const\s+RETIRED_SETTING_KEYS\s*=\s*new Set\(\s*(\[[\s\S]*?\])\s*\);/);
    assert.ok(match, 'RETIRED_SETTING_KEYS must be extractable from ytkit.js');
    return new Set(Function('"use strict"; return (' + match[1] + ');')());
}

function createSettingsManagerFromSource(source) {
    const objectLiteral = findBalancedObjectLiteral(source, 'const settingsManager =');
    assert.ok(objectLiteral, 'settingsManager object literal must be extractable from ytkit.js');
    const diagnostics = [];
    const manager = Function(
        'isPlainObject',
        'isSafeObjectKey',
        'RETIRED_SETTING_KEYS',
        'DiagnosticLog',
        'DebugManager',
        '"use strict"; return (' + objectLiteral + ');'
    )(
        isPlainObject,
        isSafeObjectKey,
        extractRetiredSettingKeys(source),
        { record(ctx, msg) { diagnostics.push({ ctx, msg }); } },
        { log() {} }
    );
    return { manager, diagnostics };
}

// ── item 1: migrations 3/4 must be conditional ──

test('migrations 3 and 4 preserve an explicit user false instead of force-enabling', () => {
    assert.match(
        ytkitSource,
        /3:\s*\(s\)\s*=>\s*\{\s*if\s*\(s\.hidePinnedComments\s*===\s*undefined\)\s*s\.hidePinnedComments\s*=\s*true;/,
        'migration 3 must only seed hidePinnedComments when the key is absent'
    );
    assert.match(
        ytkitSource,
        /4:\s*\(s\)\s*=>\s*\{\s*if\s*\(s\.autoExpandComments\s*===\s*undefined\)\s*s\.autoExpandComments\s*=\s*true;/,
        'migration 4 must only seed autoExpandComments when the key is absent'
    );

    const { manager } = createSettingsManagerFromSource(ytkitSource);
    const explicit = manager._migrate({
        _settingsVersion: 1,
        hidePinnedComments: false,
        autoExpandComments: false
    });
    assert.equal(explicit.hidePinnedComments, false,
        'explicit hidePinnedComments=false must survive migration 3');
    assert.equal(explicit.autoExpandComments, false,
        'explicit autoExpandComments=false must survive migration 4');

    const seeded = manager._migrate({ _settingsVersion: 1 });
    assert.equal(seeded.hidePinnedComments, true,
        'absent hidePinnedComments must still seed true for pre-v3 profiles');
    assert.equal(seeded.autoExpandComments, true,
        'absent autoExpandComments must still seed true for pre-v4 profiles');
});

// ── item 1: schema-only backups must seed the migration start version
//    from the top-level settingsSchemaVersion ──

test('in-page import seeds migration start from backupSchemaVersion when inner marker is stripped', () => {
    // Call site must thread the backup top-level stamp through.
    assert.match(
        ytkitSource,
        /_prepareImportedSettings\(settings,\s*\{\s*backupSchemaVersion:\s*importedData\.settingsSchemaVersion\s*\}\)/,
        'importAllSettings must pass the backup settingsSchemaVersion into the import-migration path'
    );

    const current = createSettingsManagerFromSource(ytkitSource);
    const seededResult = current.manager._prepareImportedSettings(
        { hideCreateButton: false },
        { backupSchemaVersion: current.manager.SETTINGS_VERSION }
    );
    assert.equal(seededResult._settingsVersion, current.manager.SETTINGS_VERSION);
    assert.equal(
        current.diagnostics.filter(d => d.ctx === 'settings-migration' && d.msg.includes('applied')).length,
        0,
        'a current-version schema-only backup must not re-run any migration'
    );

    const unseeded = createSettingsManagerFromSource(ytkitSource);
    unseeded.manager._prepareImportedSettings({ hideCreateButton: false });
    assert.equal(
        unseeded.diagnostics.filter(d => d.ctx === 'settings-migration' && d.msg.includes('applied')).length,
        unseeded.manager.SETTINGS_VERSION - 1,
        'without any version marker the import must still migrate from v1'
    );

    const innerWins = createSettingsManagerFromSource(ytkitSource);
    innerWins.manager._prepareImportedSettings(
        { hideCreateButton: false, _settingsVersion: innerWins.manager.SETTINGS_VERSION - 1 },
        { backupSchemaVersion: 1 }
    );
    assert.equal(
        innerWins.diagnostics.filter(d => d.ctx === 'settings-migration' && d.msg.includes('applied')).length,
        1,
        'an explicit inner _settingsVersion must win over the top-level backup stamp'
    );
});

// ── item 2: videoNotes debounce must capture identity at schedule time ──

test('videoNotes captures videoId/title at schedule time and flushes before teardown', () => {
    const block = featureBlock('videoNotes', 20000);
    assert.match(
        block,
        /_pendingSave\s*=\s*\{\s*value,\s*videoId:\s*getVideoId\(\),\s*title:\s*this\._currentTitle\(\)\s*\}/,
        '_scheduleSave must capture the videoId and title when the edit happens, not when the debounce fires'
    );
    assert.match(
        block,
        /_saveCurrentNote\(value,\s*videoId\s*=\s*getVideoId\(\),\s*title\s*=\s*this\._currentTitle\(\)\)/,
        '_saveCurrentNote must accept the captured videoId/title'
    );
    const navRule = methodSlice(block, 'this._navRule = () => {', 700);
    assert.match(navRule, /this\._flushPendingSave\(\)/,
        'navigate rule must flush the pending debounced save under the captured (previous) videoId');
    const destroyBlock = methodSlice(block, 'destroy() {', 700);
    assert.match(destroyBlock, /this\._flushPendingSave\(\)/,
        'destroy must flush (not drop) a pending note edit');
    const flush = methodSlice(block, '_flushPendingSave() {', 600);
    assert.match(flush, /_saveCurrentNote\(pending\.value,\s*pending\.videoId,\s*pending\.title\)/,
        'flush must save with the captured identity');
});

// ── item 3: deferred nav-rule attach timers must be tracked + guarded ──

test('downloadHealthPanel tracks its navigate-rule timer and guards against post-destroy resurrection', () => {
    const block = featureBlock('downloadHealthPanel', 9000);
    const initBlock = methodSlice(block, 'init() {', 1200);
    assert.match(initBlock, /this\._navTimer\s*=\s*setTimeout/,
        'navigate rule must store the deferred attach timer');
    assert.match(initBlock, /if\s*\(this\._destroyed\)\s*return;/,
        'deferred attach must no-op after destroy');
    const destroyBlock = methodSlice(block, 'destroy() {', 900);
    assert.match(destroyBlock, /this\._destroyed\s*=\s*true/, 'destroy must arm the destroyed flag');
    assert.match(destroyBlock, /clearTimeout\(this\._navTimer\)/, 'destroy must clear the nav timer');
});

test('downloadCobaltFallback tracks its navigate-rule timer and gates on _hooked', () => {
    const block = featureBlock('downloadCobaltFallback', 9000);
    const initBlock = methodSlice(block, 'init() {', 1600);
    assert.match(initBlock, /this\._navTimer\s*=\s*setTimeout/,
        'navigate rule must store the deferred attach timer');
    assert.match(initBlock, /if\s*\(!this\._hooked\)\s*return;/,
        'deferred attach must no-op after destroy (hooked flag cleared)');
    const destroyBlock = methodSlice(block, 'destroy() {', 700);
    assert.match(destroyBlock, /clearTimeout\(this\._navTimer\)/, 'destroy must clear the nav timer');
});

// ── item 4: stream links panel must not serve a stale player response ──

test('downloadStreamLinksPanel validates player-response videoId and closes the panel on navigation', () => {
    const block = featureBlock('downloadStreamLinksPanel', 14000);
    const extract = methodSlice(block, '_extractFormats() {', 1600);
    assert.match(extract, /_rw\.ytInitialPlayerResponse/,
        '_extractFormats must prefer the shared _rw player-response bridge');
    assert.match(extract, /data\?\.videoDetails\?\.videoId\s*!==\s*getVideoId\(\)/,
        '_extractFormats must reject a player response that belongs to a different (previous) video');
    assert.match(extract, /return\s*\{\s*formats:\s*\[\],\s*adaptive:\s*\[\]\s*\}/,
        'a stale response must surface the empty-state, not expired stream URLs');
    const initBlock = methodSlice(block, 'init() {', 900);
    assert.match(initBlock, /this\._panel\?\.remove\(\)/,
        'navigate rule must close an open panel — its URLs belong to the previous video');
});

// ── item 5: subscriptionGroups must initialize from any page ──

test('subscriptionGroups init has no pathname hard-return; the nav rule gates by path instead', () => {
    const block = featureBlock('subscriptionGroups');
    const initBlock = methodSlice(block, 'init() {', 1200);
    assert.ok(
        !/init\(\)\s*\{\s*if\s*\(window\.location\.pathname/.test(initBlock),
        'init() must not hard-return off-path — initFeatureLifecycle marks _initialized unconditionally, which left the feature permanently inert'
    );
    assert.match(initBlock, /this\._ensureStyles\(\)/, 'init must always register styles/rules');
    assert.match(
        block,
        /this\._navRule\s*=\s*\(\)\s*=>\s*\{\s*if\s*\(window\.location\.pathname\s*!==\s*'\/feed\/subscriptions'\)\s*return;/,
        'the navigate rule must re-check the subscriptions path itself'
    );
});

// ── item 6: switching back to the default sort restores the original order ──

test('subscriptionGroups default sort restores stamped original card order', () => {
    const block = featureBlock('subscriptionGroups');
    const sortBlock = methodSlice(block, '_applySort(modeOverride) {', 4200);
    assert.match(sortBlock, /card\.dataset\.ytkitOrigIdx\s*===\s*undefined/,
        'cards must be stamped with their original index before the first re-append');
    assert.match(
        sortBlock,
        /mode === 'default'[\s\S]{0,700}Number\(a\.dataset\.ytkitOrigIdx\)/,
        "the 'default' branch must re-sort by the stamped original index instead of early-returning"
    );
    const destroyBlock = methodSlice(block, 'destroy() {', 2200);
    assert.match(destroyBlock, /data-ytkit-orig-idx/,
        'destroy must remove the original-order stamps');
});

// ── item 7: digest mark-read toast counts channels, not videos ──

test('subscriptionGroups digest mark-read toast counts distinct channels', () => {
    const block = featureBlock('subscriptionGroups');
    const markBlock = methodSlice(block, "_markGroupDigestRead(groupId = '') {", 2200);
    assert.match(markBlock, /const markedChannels = new Set\(\)/,
        'mark-read must dedupe by channelId — summaries carry one entry per VIDEO');
    assert.match(markBlock, /const marked = markedChannels\.size/,
        'the toast count must be the distinct channel count');
});

// ── item 8: 30-day staged-unsubscribe deadline is actually enforced ──

test('subscriptionGroups prunes expired staged-unsubscribe records on read', () => {
    const block = featureBlock('subscriptionGroups');
    const readBlock = methodSlice(block, '_readUnsubscribeStaging() {', 1300);
    assert.match(readBlock, /undoUntil\s*&&\s*now\s*>\s*undoUntil/,
        'records past their stored undoUntil deadline must be dropped');
    assert.match(readBlock, /if\s*\(dropped\s*>\s*0\)\s*this\._writeUnsubscribeStaging\(pruned\)/,
        'the pruned map must be persisted so storage stops growing');
});

// ── item 9: duration sort handles lockup badge surfaces + last-match fallback ──

test('subscriptionGroups duration sort reads lockup badges and prefers the LAST text match', () => {
    const block = featureBlock('subscriptionGroups');
    const durationBlock = methodSlice(block, "mode === 'duration-asc'", 1400);
    assert.match(durationBlock, /yt-thumbnail-badge-view-model/,
        'badge selector must include the newer lockup badge element');
    assert.match(durationBlock, /\.badge-shape__text/,
        'badge selector must include the badge-shape text surface');
    assert.match(durationBlock, /matchAll/,
        'whole-card text fallback must collect every duration-shaped match');
    assert.match(durationBlock, /matches\[matches\.length - 1\]/,
        'fallback must use the LAST match — titles precede the thumbnail badge in card text');
});

// ── item 10: group membership editor + empty-state + honest description ──

test('subscriptionGroups ships an Edit Channels membership editor with empty-state notice', () => {
    const block = featureBlock('subscriptionGroups');
    assert.ok(!block.includes('drag channels in'),
        'feature description must not promise drag-in membership (no drag path exists)');
    assert.match(block, /Edit Channels panel/,
        'description must point at the shipped membership editor');
    assert.match(block, /dataset\.action = 'edit-channels'/,
        'toolbar must expose an Edit Channels action for the active group');
    const panelBlock = methodSlice(block, '_renderMembersPanel(groupId) {', 6000);
    assert.match(panelBlock, /_collectRenderedCardSummaries\(\)/,
        'editor must reuse the same per-card channel identity extraction as the filter');
    assert.match(panelBlock, /setAttribute\('role', 'dialog'\)/, 'editor panel must be a dialog');
    assert.match(panelBlock, /e\.key === 'Escape'/, 'editor must close on Escape');
    assert.match(panelBlock, /checkbox\.type = 'checkbox'/, 'channels are toggled via checkboxes');
    const writeBlock = methodSlice(block, '_setGroupMembership(groupId, channelId, included) {', 1400);
    assert.match(writeBlock, /this\._writeGroups\(next\)/,
        'membership changes must persist through the existing _writeGroups path');
    assert.match(block, /No channels in this group yet/,
        'an empty group filter must render an inline empty-state notice instead of silently blanking the feed');
    const destroyBlock = methodSlice(block, 'destroy() {', 2200);
    assert.match(destroyBlock, /this\._closeMembersPanel\(\)/, 'destroy must close the membership editor');
    assert.match(destroyBlock, /ytkit-sub-group-empty/, 'destroy must remove the empty-state notice');
});

// ── item 11: never lower a newer settings-version stamp ──

test('external settings updates and profile loads preserve a newer settings stamp', () => {
    const applyStart = ytkitSource.indexOf('function applyExternalSettingsUpdate');
    assert.ok(applyStart > -1, 'applyExternalSettingsUpdate must exist');
    const applyBlock = ytkitSource.slice(applyStart, applyStart + 1700);
    assert.match(applyBlock, /incomingVersion > settingsManager\.SETTINGS_VERSION\s*\?\s*incomingVersion\s*:\s*settingsManager\.SETTINGS_VERSION/,
        'external updates must keep max(incoming stamp, running version) — mirrors load()');
    assert.ok(!/nextSettings\),\s*_settingsVersion:\s*settingsManager\.SETTINGS_VERSION\s*\}/.test(applyBlock),
        'external updates must not unconditionally force the running version onto the stamp');

    const loadStart = ytkitSource.indexOf('// Shallow-merge snapshot over defaults');
    assert.ok(loadStart > -1, 'profile load merge must exist');
    const loadBlock = ytkitSource.slice(loadStart, loadStart + 1200);
    assert.match(loadBlock, /Math\.max\(snapshotVersion,\s*currentVersion,\s*settingsManager\.SETTINGS_VERSION\)/,
        'profile load must keep the highest known stamp instead of forcing the running version');
});

// ── item 12: sticky-video must not zombie-mount after destroy ──

test('stickyVideo cancels pending element waits and refuses to mount after destroy (both copies)', () => {
    for (const [name, source] of [['features/sticky-video/index.js', stickySource], ['ytkit.js inline fallback', ytkitSource]]) {
        assert.match(source, /_pendingWaits:\s*\[\]/,
            `${name}: must track waitForElement cancel fns`);
        assert.match(source, /if\s*\(this\._destroyed\s*\|\|\s*this\._isActive\)\s*return;/,
            `${name}: doMount must refuse to mount after destroy`);
        assert.match(source, /this\._pendingWaits\.push\(waitForElement\('#player-container'/,
            `${name}: the outer wait's cancel fn must be stored`);
        assert.match(source, /this\._destroyed\s*=\s*true;\s*\n\s*this\._cancelPendingWaits\(\);/,
            `${name}: destroy must arm the flag and cancel in-flight waits`);
        assert.match(source, /_cancelPendingWaits\(\)\s*\{/,
            `${name}: cancel helper must exist`);
    }
    // init must re-arm cleanly after a destroy/init cycle.
    assert.match(stickySource, /init\(\)\s*\{\s*this\._destroyed = false;/,
        'standalone module init must clear the destroyed flag');
    assert.match(ytkitSource, /init\(\)\s*\{\s*this\._destroyed = false;\s*const stickyVideoFeatures/,
        'inline fallback init must clear the destroyed flag');
});

// ── item 13: schema min for the subs-load hidden ratio matches consumer floors ──

test('hideVideosSubsLoadHiddenRatio schema min is 0.05 so a schema-legal value cannot silently behave as 0.8', () => {
    assert.match(
        schemaSource,
        /key:\s*"hideVideosSubsLoadHiddenRatio"[^\n]*min:\s*0\.05,\s*max:\s*1/,
        'schema must declare min 0.05 — every consumer treats raw <= 0 as invalid and falls back to 0.8'
    );
    assert.equal(defaultSettings.hideVideosSubsLoadHiddenRatio, 0.8,
        'default value stays 0.8');
    // Consumers still guard the (0, 1] contract at the call site.
    assert.match(ytkitSource, /raw <= 0 \|\| raw > 1\) return 0\.8/,
        'ytkit.js consumer must keep the (0,1] fallback guard');
});
