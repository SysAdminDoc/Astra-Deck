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
const downloadUiSource = fs.readFileSync(
    path.join(repoRoot, 'extension', 'features', 'download-ui', 'index.js'),
    'utf8'
);
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

function featureBlock(id, length = 170000) {
    const source = ['downloadCobaltFallback', 'downloadStreamLinksPanel'].includes(id)
        ? downloadUiSource
        : ytkitSource;
    const start = source.indexOf(`id: '${id}'`);
    assert.ok(start > -1, `feature '${id}' must exist in its canonical source`);
    return source.slice(start, start + length);
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

test('settings persistence baselines stay detached from mutable app state', () => {
    const { manager } = createSettingsManagerFromSource(ytkitSource);
    const active = manager._normalizeProfileModel({
        ...manager.defaults,
        codecSelector: 'auto',
        hiddenPlayerControls: ['next']
    });
    const baseline = manager._snapshotSettings(active);

    active.codecSelector = 'h264';
    active.hiddenPlayerControls.push('settings');

    assert.equal(baseline.codecSelector, 'auto',
        'changing the first scalar setting after load must not mutate the diff baseline');
    assert.deepEqual(baseline.hiddenPlayerControls, ['next'],
        'in-place array edits must not mutate the diff baseline');
    assert.notStrictEqual(baseline.hiddenPlayerControls, active.hiddenPlayerControls,
        'nested setting values must be deep-cloned');

    const changedKeys = Object.entries(active)
        .filter(([key, value]) => JSON.stringify(baseline[key]) !== JSON.stringify(value))
        .map(([key]) => key);
    assert.ok(changedKeys.includes('codecSelector'));
    assert.ok(changedKeys.includes('hiddenPlayerControls'));

    assert.match(
        ytkitSource,
        /else\s*\{[\s\S]{0,400}_lastSubmittedSettings\s*=\s*this\._snapshotSettings\(merged\)/,
        'load() must not return the same object it stores as the persistence baseline'
    );
    assert.match(
        ytkitSource,
        /settingsManager\._lastSubmittedSettings\s*=\s*settingsManager\._snapshotSettings\(resolvedSettings\)/,
        'external settings reconciliation must also keep a detached baseline'
    );
});

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

test('watchTimeTracker rebases an external ledger without dropping pending local seconds', () => {
    const objectLiteral = findBalancedObjectLiteral(
        ytkitSource,
        "\n        {\n            id: 'watchTimeTracker'"
    );
    assert.ok(objectLiteral, 'watchTimeTracker object must be extractable');

    const storageKey = 'ytkit-watch-time';
    const today = new Date();
    const dayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const store = {
        [storageKey]: { days: { [dayKey]: 100 }, total: 100, imported: {} }
    };
    const writes = [];
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const StorageManager = {
        get(key, fallback) {
            return Object.prototype.hasOwnProperty.call(store, key) ? clone(store[key]) : fallback;
        },
        set(key, value) {
            store[key] = clone(value);
            writes.push({ key, value: clone(value) });
        }
    };
    const sanitizeWatchTimeStats = (value) => {
        const stats = value && typeof value === 'object' ? value : {};
        return {
            days: { ...(stats.days || {}) },
            total: Number(stats.total) || 0,
            imported: { ...(stats.imported || {}) }
        };
    };
    const tracker = Function(
        'STORAGE_KEYS',
        'sanitizeWatchTimeStats',
        'StorageManager',
        '"use strict"; return (' + objectLiteral + ');'
    )({ watchTime: storageKey }, sanitizeWatchTimeStats, StorageManager);

    const stats = tracker._getStats();
    tracker._lastPersist = Date.now();
    stats.days[dayKey] += 30;
    stats.total += 30;
    tracker._recordPendingDelta(dayKey, 30);
    tracker._writeStats(stats);
    assert.equal(tracker._dirty, true, 'the throttled local contribution must remain dirty');

    tracker._invalidateStatsCache({ days: { [dayKey]: 200 }, total: 200, imported: {} });
    const rebased = tracker._getStats();
    assert.equal(rebased.days[dayKey], 230,
        'an external write must be merged below the pending local day delta');
    assert.equal(rebased.total, 230,
        'an external write must not discard the pending local total delta');
    assert.equal(tracker._dirty, true, 'the rebased local delta must still be scheduled for persistence');

    tracker._flushStats();
    assert.equal(writes.at(-1).value.days[dayKey], 230,
        'the next flush must persist the rebased total');
    assert.equal(tracker._pendingDelta.total, 0, 'flushing must retire the merged pending delta');
    assert.match(
        ytkitSource,
        /tracker\._invalidateStatsCache\(\s*filteredChanges\[STORAGE_KEYS\.watchTime\]\.newValue,\s*\{ discardPending: isWatchTimeImport \}/,
        'the storage bridge must pass the incoming ledger and import distinction to the tracker'
    );
});

test('player-control features remove stale controls on navigation and destroy', () => {
    const controls = [
        { id: 'abLoop', nav: "addNavigateRule('abLoop'", ref: '_btn', selector: '.ytkit-ab-btn' },
        { id: 'fineSpeedControl', nav: "addNavigateRule('fineSpeed'", ref: '_badge', selector: '.ytkit-speed-badge' },
        { id: 'popOutPlayer', nav: "addNavigateRule('popOut'", ref: '_btn', selector: '.ytkit-popout-btn' },
        { id: 'videoLoopButton', nav: "addNavigateRule('loopBtn'", ref: '_btn', selector: '.ytkit-loop-btn' },
        { id: 'subtitleDownload', nav: 'this._navRule = () => {', ref: '_btn', selector: '.ytkit-subdl-btn' },
        { id: 'videoVisualFilters', nav: 'this._navRule = () => {', ref: '_btn', selector: '.ytkit-vvf-btn' },
        { id: 'copyChapterMarkdown', nav: 'this._navRule = () => {', ref: '_btn', selector: '.ytkit-chaps-btn' }
    ];

    for (const { id, nav, ref, selector } of controls) {
        const block = featureBlock(id, 16000);
        const navStart = block.indexOf(nav);
        assert.ok(navStart > -1, `${id} must register a navigation cleanup`);
        const navBlock = block.slice(navStart, navStart + 500);
        assert.match(
            navBlock,
            new RegExp(`this\\.${ref}\\?\\.remove\\(\\)[\\s\\S]*this\\.${ref}\\s*=\\s*null`),
            `${id} must remove its DOM control before clearing ${ref} on navigation`
        );

        const destroyBlock = methodSlice(block, 'destroy() {', 1800);
        assert.ok(
            destroyBlock.includes(`document.querySelectorAll('${selector}').forEach(el => el.remove());`),
            `${id} destroy must sweep orphaned ${selector} controls`
        );
    }
});

test('transcriptViewer resets translation state before rebuilding after navigation', () => {
    const block = featureBlock('transcriptViewer', 50000);
    const initBlock = methodSlice(block, 'init() {', 900);
    assert.match(initBlock, /this\._panel\?\.remove\(\);\s*this\._panel = null;/,
        'transcriptViewer must remove the previous panel on navigation');
    assert.match(initBlock, /this\._translatedCues = null;/,
        'transcriptViewer must discard translated cues on navigation');
    assert.match(initBlock, /this\._showingTranslation = false;/,
        'transcriptViewer must reset the translation toggle on navigation');
    assert.ok(
        initBlock.indexOf('this._translatedCues = null;')
            > initBlock.indexOf('this._panel = null;'),
        'translation state must reset after the previous panel is torn down'
    );
});

test('perChannelSpeed removes 1x overrides and saves navigation against the outgoing channel', () => {
    const block = featureBlock('perChannelSpeed', 6000);
    assert.match(block, /_activeChannelId:\s*null/, 'perChannelSpeed should track the active channel explicitly');
    assert.match(block, /this\._activeChannelId\s*=\s*channelId;/,
        'speed application should capture the channel before the page can navigate');
    assert.match(block, /this\._saveCurrentSpeed\(this\._activeChannelId\);/,
        'navigation should save using the cached outgoing channel');
    assert.match(block, /delete speeds\[channelId\];/, 'resetting to 1x should delete the channel override');

    const objectLiteral = findBalancedObjectLiteral(
        ytkitSource,
        "\n        {\n            id: 'perChannelSpeed'"
    );
    assert.ok(objectLiteral, 'perChannelSpeed object must be extractable');

    // A real owner link answers getAttribute; the key is derived through the
    // shared canonicaliser so dotted handles cannot collide.
    const ownerLink = (href) => ({ href, getAttribute: (name) => (name === 'href' ? href : null) });
    const owners = [ownerLink('https://www.youtube.com/@alpha')];
    const video = { playbackRate: 2 };
    const store = { 'ytkit-channel-speeds': { '@alpha': 1.5 } };
    const writes = [];
    const navRules = {};
    const document = {
        querySelector() { return owners[0]; },
        addEventListener() {},
        removeEventListener() {}
    };
    const StorageManager = {
        get(key, fallback) {
            return Object.prototype.hasOwnProperty.call(store, key) ? { ...store[key] } : fallback;
        },
        set(key, value) {
            store[key] = { ...value };
            writes.push({ key, value: { ...value } });
        }
    };
    const feature = Function(
        'PageTypes',
        'document',
        'getMainVideoElement',
        'StorageManager',
        'DebugManager',
        'addNavigateRule',
        'removeNavigateRule',
        'setTimeout',
        'clearTimeout',
        'schedulePlayerTask',
        'cancelPlayerTask',
        'isProgrammaticPlaybackRateChange',
        'setProgrammaticPlaybackRate',
        '"use strict"; return (' + objectLiteral + ');'
    )(
        { WATCH: 'watch' },
        document,
        () => video,
        StorageManager,
        { log() {} },
        (id, callback) => { navRules[id] = callback; },
        () => {},
        () => 1,
        () => {},
        // The apply path is exercised separately; here we only care about save.
        () => {},
        () => {},
        () => false,
        (videoEl, rate) => { videoEl.playbackRate = rate; }
    );

    feature.init();
    owners[0] = ownerLink('https://www.youtube.com/@beta');
    navRules.channelSpeed();
    assert.equal(store['ytkit-channel-speeds']['@alpha'], 2,
        'navigation must attribute the outgoing rate to the cached alpha channel');
    assert.equal(store['ytkit-channel-speeds']['@beta'], undefined,
        'navigation must not attribute the outgoing rate to the incoming channel');

    owners[0] = ownerLink('https://www.youtube.com/@alpha');
    video.playbackRate = 1;
    feature._activeChannelId = '@alpha';
    feature._saveCurrentSpeed();
    assert.equal(store['ytkit-channel-speeds']['@alpha'], undefined,
        'returning to 1x must remove the saved channel override');
    assert.equal(writes.at(-1).value['@alpha'], undefined,
        'the reset write must persist the deleted override');
});

test('focusedMode is limited to watch pages before injecting global shell CSS', () => {
    const block = featureBlock('focusedMode', 5000);
    assert.match(block, /pages:\s*\[PageTypes\.WATCH\]/,
        'focusedMode must be activated only on watch pages');
    assert.match(block, /#masthead-container\s*\{\s*display:\s*none\s*!important;/,
        'focusedMode should retain its watch-page shell treatment');
});

test('bulkCardActions logs a partial scrub after teardown and hides without Video Hider', async () => {
    const objectLiteral = findBalancedObjectLiteral(
        ytkitSource,
        "\n        {\n            id: 'bulkCardActions'"
    );
    assert.ok(objectLiteral, 'bulkCardActions object must be extractable');
    const feature = Function(
        'PageTypes',
        'getFeatureById',
        'showToast',
        't',
        '"use strict"; return (' + objectLiteral + ');'
    )(
        { HOME: 'home', SUBSCRIPTIONS: 'subscriptions', SEARCH: 'search', CHANNEL: 'channel', WATCH: 'watch' },
        () => null,
        () => {},
        (_key, fallback) => fallback
    );

    let releaseNativeAction;
    const card = {
        isConnected: true,
        dataset: {},
        classList: { add() {}, remove() {} }
    };
    feature._selected = new Map([['video-1', card]]);
    feature._applyNativeCardAction = () => new Promise(resolve => { releaseNativeAction = resolve; });
    const sessions = [];
    feature._appendScrubSession = session => sessions.push(session);
    const run = feature._runScrubSession('not-interested');
    await Promise.resolve();
    assert.equal(typeof releaseNativeAction, 'function', 'the scrub should reach its async native action');
    feature._lifecycleToken += 1;
    feature._scrubRunning = false;
    feature._selected = null;
    releaseNativeAction(true);
    await run;
    assert.equal(sessions.length, 1, 'teardown must still append the interrupted session');
    assert.equal(sessions[0].partial, true, 'the interrupted session must be marked partial');
    assert.deepEqual(sessions[0].videoIds, [], 'a destroyed feature must not claim local hides it could not finalize');

    const hiddenCard = {
        dataset: {},
        classList: {
            hidden: false,
            add() { this.hidden = true; },
            remove() {}
        }
    };
    feature._selected = new Map([['video-2', hiddenCard]]);
    feature._bulkHide();
    assert.equal(hiddenCard.classList.hidden, true,
        'bulk Hide must still hide the selected card when Video Hider is unavailable');
});

// ── item 4: stream links panel must not serve a stale player response ──

test('downloadStreamLinksPanel validates player-response videoId and closes the panel on navigation', () => {
    const block = featureBlock('downloadStreamLinksPanel', 14000);
    const extract = methodSlice(block, '_extractFormats() {', 1600);
    assert.match(extract, /getPlayerResponseGlobal\(\)/,
        '_extractFormats must prefer the injected player-response bridge');
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
    assert.match(sortBlock, /card\.dataset\.ytkitOrigIdx\s*!==\s*undefined\s*&&\s*card\.dataset\.ytkitOrigId\s*===\s*videoId/,
        'cards must be stamped before the first re-append, and RE-stamped when a continuation recycles the card into a different video');
    assert.match(sortBlock, /const videoId = this\._cardVideoId\(card\);/,
        'the stamp has to name the video it describes, or restoring it restores nothing meaningful');
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

test('subscriptionGroups ships a unified health/action center in both copies', () => {
    // The health center must exist in the peeled module (primary path) AND
    // the ytkit.js inline fallback, mirroring the Edit Channels convention.
    const moduleSource = fs.readFileSync(
        path.join(repoRoot, 'extension', 'features', 'subscription-groups', 'index.js'), 'utf8');
    for (const [label, src] of [['module', moduleSource], ['ytkit fallback', featureBlock('subscriptionGroups')]]) {
        assert.match(src, /dataset\.action = 'health'/,
            `${label}: toolbar must expose a Health action`);
        const panelBlock = (() => {
            const idx = src.indexOf('_renderHealthPanel() {');
            assert.ok(idx > -1, `${label}: _renderHealthPanel must exist`);
            return src.slice(idx, idx + 24000);
        })();
        assert.match(panelBlock, /Subscription Health/,
            `${label}: panel must carry the health title`);
        assert.match(panelBlock, /_collectRenderedCardSummaries\(lastVisit\)/,
            `${label}: health center must reuse the digest's rendered-card summaries`);
        assert.match(panelBlock, /_renderDeadChannelMarkers\(\)/,
            `${label}: health center must reuse the stale-channel collector`);
        assert.match(panelBlock, /No stale channels detected among the rendered cards/,
            `${label}: stale section must have an explanatory empty state`);
        assert.match(panelBlock, /Nothing staged\. Stage stale channels to review them before a bounded unsubscribe session/,
            `${label}: staged section empty state must explain review-before-apply semantics`);
        assert.match(panelBlock, /Undo all staged/,
            `${label}: staged section must expose bulk undo recovery`);
        assert.match(panelBlock, /Health scan failed/,
            `${label}: panel must render an error state instead of blanking`);
        assert.match(panelBlock, /_exportGroupsOpml\(\)/,
            `${label}: export actions must include OPML`);
        assert.match(src, /if \(hadHealthPanel\) this\._renderHealthPanel\(\)/,
            `${label}: toolbar re-render must restore an open health panel`);
        assert.match(src, /this\._closeHealthPanel\(\);\s*\n\s*this\._closeMembersPanel\(\)/,
            `${label}: destroy/rerender paths must close the health panel`);
    }
});

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

test('transcriptViewer aborts an in-flight translation when the video changes', () => {
    // _translateTranscript awaits language detection, on-device availability,
    // and the translation itself. The load path re-checks generation/panel/
    // videoId after every await; this one checked nothing, so a translation
    // started on video A painted its cues over video B's panel, flipped B's
    // button to "Show Original", and left _translatedCues holding A's text.
    // Bound by the NEXT method signature, not a character count: a fixed
    // window silently truncates the tail (and its guards) as the method grows.
    const block = featureBlock('transcriptViewer', 60000);
    const translateStart = block.indexOf('async _translateTranscript() {');
    assert.ok(translateStart > -1, '_translateTranscript must exist');
    const translateEnd = block.indexOf('_buildSrt()', translateStart);
    assert.ok(translateEnd > translateStart, '_buildSrt must follow _translateTranscript');
    const translate = block.slice(translateStart, translateEnd);

    assert.match(translate, /const generation = this\._loadGeneration;/,
        'the translation must latch the load generation before its first await');
    assert.match(translate, /const isStale = \(\) =>/,
        'the translation must define a staleness predicate');
    for (const leg of [
        /generation !== this\._loadGeneration/,
        /this\._panel !== panel/,
        /getVideoId\(\) !== videoId/,
        /!panel\?\.isConnected/,
    ]) {
        assert.match(translate, leg, `the staleness predicate must cover ${leg}`);
    }

    // Every await must be followed by a bail-out, including the catch: an
    // error caused by navigating away must not toast over the new video.
    const awaits = translate.split(/await /).length - 1;
    const bails = translate.split(/if \(isStale\(\)\) return;/).length - 1;
    assert.ok(awaits >= 4, `expected the multi-await translation path, saw ${awaits}`);
    assert.ok(bails >= awaits,
        `every await needs a staleness bail-out: ${awaits} awaits vs ${bails} guards`);

    // The write-back must not precede the guards.
    assert.ok(
        translate.indexOf('if (isStale()) return;') < translate.indexOf('this._translatedCues = translated;'),
        'the guards must run before the translated cues are published'
    );
});

function perChannelSpeedBlock() {
    // Bounded by the next feature's id line, so the slice cannot silently
    // truncate (and drop destroy()) as the feature grows.
    const start = ytkitSource.indexOf("\n        {\n            id: 'perChannelSpeed'");
    assert.ok(start > -1, 'perChannelSpeed must exist');
    const end = ytkitSource.indexOf("\n            id: '", start + 60);
    assert.ok(end > start, 'perChannelSpeed must be followed by another feature');
    return ytkitSource.slice(start, end);
}

test('perChannelSpeed keeps a saved speed when YouTube re-asserts 1x on its own', () => {
    // YouTube's player holds its own internal rate and re-asserts it on the
    // media element on a new stream or a quality change. That arrives untagged
    // at 1x, and persisting it DELETED the channel's saved speed moments after
    // we had applied it — the memory erased itself. A real speed change is
    // always driven by a pointer or a key, so an untagged reset with no recent
    // input is the player's, not the user's.
    const block = perChannelSpeedBlock();

    assert.match(block, /_USER_INTENT_WINDOW_MS/,
        'the feature must define a user-intent window');
    const rateHandler = block.slice(
        block.indexOf('this._rateHandler = () => {'),
        block.indexOf("document.addEventListener('ratechange'")
    );
    assert.ok(rateHandler.length > 0, 'the ratechange handler must be extractable');
    assert.match(rateHandler, /this\._lastInputAt\) > this\._USER_INTENT_WINDOW_MS/,
        'an untagged reset must be judged against recent user input');
    assert.match(rateHandler, /setProgrammaticPlaybackRate\(video, saved\)/,
        'an unattributed reset must re-apply the saved speed');
    assert.ok(
        rateHandler.indexOf('setProgrammaticPlaybackRate') < rateHandler.indexOf('this._saveCurrentSpeed()'),
        're-applying must pre-empt the save that would delete the override'
    );

    assert.match(block, /document\.addEventListener\(type, this\._inputHandler/,
        'user input must be observed to attribute rate changes');
    const destroy = block.slice(block.indexOf('destroy() {'));
    assert.ok(destroy.length > 0, 'destroy must be present in the slice');
    assert.match(destroy, /document\.removeEventListener\(type, this\._inputHandler/,
        'the input listeners must be removed on teardown');
    assert.match(destroy, /cancelPlayerTask\('feature:perChannelSpeed'\)/,
        'the scheduled apply must be cancelled on teardown');
});

test('perChannelSpeed keys dotted handles separately and retries a slow apply', () => {
    const block = perChannelSpeedBlock();

    // Run the SHIPPED pattern against real owner links rather than pinning its
    // text: @mr.beast used to key as "@mr", so every dotted handle sharing a
    // prefix collided into a single saved speed.
    const keyFn = block.slice(block.indexOf('_getChannelId() {'), block.indexOf('_getSpeeds()'));
    // Bounded by the call's own tail rather than a character class, so an
    // escaped slash inside the pattern cannot truncate the capture.
    const source = keyFn.match(/\.match\(([\s\S]+?)\)\?\.\[0\]/);
    assert.ok(source, 'the channel-key pattern must be extractable from the feature');
    const literal = source[1].trim();
    assert.ok(literal.startsWith('/') && literal.endsWith('/'),
        'the extracted channel-key pattern must be a regex literal');
    const pattern = new RegExp(literal.slice(1, -1));
    assert.equal('https://www.youtube.com/@mr.beast'.match(pattern)[0], '@mr.beast');
    assert.equal('https://www.youtube.com/@mr.bean'.match(pattern)[0], '@mr.bean');
    assert.equal('https://www.youtube.com/@alpha/featured'.match(pattern)[0], '@alpha',
        'a suffixed owner link must still resolve to the bare handle');
    assert.equal('https://www.youtube.com/channel/UCabc-123'.match(pattern)[0], 'channel/UCabc-123');

    // A single unvalidated read three seconds in gave up silently on slow
    // metadata; the apply now uses the retry ladder persistentSpeed uses.
    assert.match(block, /schedulePlayerTask\('feature:perChannelSpeed'/,
        'apply must go through the player task manager');
    assert.match(block, /retryDelays: \[0, 150, 400, 1000, 1800, 3000\]/,
        'apply must retry rather than fire once at t+3s');
});
