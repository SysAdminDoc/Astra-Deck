'use strict';

// Regression tests for v3.14.0+ hardening passes. Each test captures an
// invariant established by an audit finding so future refactors can't
// silently regress the fix.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ytkitSource = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'ytkit.js'),
    'utf8'
);

// v3.19.0: options.html / options.js removed. The toolbar popup
// now hosts all data management (export/import/reset/stats) plus
// the quick-toggle list. Tests that touched the options page
// source have been retired in this release.

const popupSource = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'popup.js'),
    'utf8'
);

const popupHtmlSource = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'popup.html'),
    'utf8'
);

const backgroundSource = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'background.js'),
    'utf8'
);

// iter-7 N11 (M-phase #2): PredicateSandbox moved out of ytkit.js into
// core/predicate-sandbox.js. The safety-invariant hardening tests read
// this source instead so the tests follow the implementation.
const predicateSandboxSource = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'core', 'predicate-sandbox.js'),
    'utf8'
);

function runNodeCommand(args) {
    const { spawnSync } = require('child_process');
    return spawnSync(process.execPath, args, {
        stdio: 'pipe',
        cwd: path.join(__dirname, '..')
    });
}

// ── v3.14.0 C1: ReDoS guard in videoHider ──

test('videoHider ReDoS guard catches alternation-wrapped quantifier stacks', () => {
    // The guard at ytkit.js:~10248 must reject patterns that wrap a
    // quantified atom in a group and then quantify the group (e.g. `(a|b+)+`).
    // The narrower `(a+)+`-only guard shipped before v3.14.0 allowed
    // alternation-hidden ReDoS patterns through.
    const guardStart = ytkitSource.indexOf('Reject patterns with nested quantifiers');
    assert.ok(guardStart > -1, 'Nested-quantifier guard comment should exist');
    const guardBlock = ytkitSource.slice(guardStart, guardStart + 1500);

    assert.match(
        guardBlock,
        /groupWithInnerQuantifier/,
        'Guard must include a dedicated check for alternation-wrapped quantifier stacks'
    );
    // The guard regex uses character-class + non-capturing alternation
    // `[^()]*(?:[+*?]|{...})` so it matches quantifiers anywhere inside the
    // group body, not just at the end. Assert the critical fragment is
    // present (substring check avoids re-escaping a regex-of-a-regex).
    assert.ok(
        guardBlock.includes('[^()]*(?:[+*?]|'),
        'groupWithInnerQuantifier must use character-class + alternation to match quantifiers anywhere in group body'
    );
    assert.ok(
        guardBlock.includes(')\\s*(?:[+*?]|'),
        'groupWithInnerQuantifier must require the group itself to be followed by a quantifier'
    );
});

// ── v3.19.0: export/import now lives in popup.js ──

test('settings backups include filtered video posts and import the alias', () => {
    const popupExportStart = popupSource.indexOf('function buildExportData');
    const popupExportEnd = popupSource.indexOf('function confirmAction');
    assert.ok(popupExportStart > -1 && popupExportEnd > popupExportStart, 'popup buildExportData should exist');
    const popupExportBody = popupSource.slice(popupExportStart, popupExportEnd);
    assert.match(
        popupExportBody,
        /filteredVideoPosts:\s*hiddenVideos/,
        'Popup exports should include filteredVideoPosts beside hiddenVideos'
    );
    assert.match(
        popupExportBody,
        /allowedVideos/,
        'Popup exports should include allowed video exceptions'
    );

    const panelExportStart = ytkitSource.indexOf('exportAllSettings()');
    const panelExportEnd = ytkitSource.indexOf('importAllSettings(jsonString)');
    assert.ok(panelExportStart > -1 && panelExportEnd > panelExportStart, 'in-page exportAllSettings should exist');
    const panelExportBody = ytkitSource.slice(panelExportStart, panelExportEnd);
    assert.match(
        panelExportBody,
        /filteredVideoPosts:\s*hiddenVideosForExport/,
        'In-page exports should include filteredVideoPosts beside hiddenVideos'
    );
    assert.match(
        panelExportBody,
        /allowedVideos/,
        'In-page exports should include allowed video exceptions'
    );

    assert.ok(
        popupSource.includes('function getImportedFilteredVideoPosts') &&
        ytkitSource.includes('function getImportedFilteredVideoPosts'),
        'Both import paths should share a filtered-video-posts fallback helper'
    );
    assert.ok(
        popupSource.includes('data.filteredVideoPosts') &&
        ytkitSource.includes('data.filteredVideoPosts'),
        'Imports should restore hidden videos from filteredVideoPosts when hiddenVideos is absent'
    );
    assert.ok(
        popupSource.includes('data.allowedVideos') &&
        ytkitSource.includes('importedData.allowedVideos'),
        'Imports should restore allowed video exceptions from backups'
    );
});

// ── v3.14.0 infrastructure: selectorChain helper ──

test('selectorChain helper exists with label, all:true, and first-miss logging', () => {
    assert.match(
        ytkitSource,
        /function\s+selectorChain\s*\(\s*selectors\s*,\s*options\s*=\s*\{\}\s*\)/,
        'selectorChain(selectors, options) must be defined'
    );

    const start = ytkitSource.indexOf('function selectorChain');
    // Slice generously — selectorChain is ~40 lines including comments.
    const body = ytkitSource.slice(start, start + 3500);

    assert.match(body, /options\.all\s*===\s*true/, 'Must support { all: true } mode for NodeList results');
    assert.match(body, /root\.querySelectorAll/, 'all:true branch must use querySelectorAll');
    assert.match(body, /root\.querySelector\b/, 'single-match branch must use querySelector');
    assert.match(body, /_selectorMissLogged/, 'Must deduplicate miss logs per session');
    assert.match(body, /DiagnosticLog\?\.record\?\.\(/, 'Misses must funnel into diagnosticLog');
});

test('selectorChain is adopted at macro-markers (chapter extract + chapter-jump)', () => {
    // Both copyChapterMarkdown._extract and chapterJumpButtons._getChapterTimes
    // should go through selectorChain with a label so drift surfaces.
    const extractMatches = ytkitSource.match(/selectorChain\(\s*\[[\s\S]*?'ytd-macro-markers-list-item-renderer'/g) || [];
    assert.ok(
        extractMatches.length >= 2,
        'Expected at least 2 selectorChain adoptions citing macro-markers (chapter + chapter-jump)'
    );

    const labelCount = (ytkitSource.match(/label:\s*'chapters\.macroMarkers'/g) || []).length;
    assert.ok(
        labelCount >= 2,
        `Expected at least 2 'chapters.macroMarkers' labels, found ${labelCount}`
    );
});

test('quality forcer uses MAIN-world setPlaybackQualityRange, not gear-menu DOM clicks (v3.18.0)', () => {
    // ISOLATED side: autoMaxResolution toggles a single attribute. The whole
    // _setQualityViaDOM / _temporarilyHideQualityPopup / settings-menu-click
    // path that caused the popup-flash bug must stay deleted.
    assert.match(
        ytkitSource,
        /id:\s*'autoMaxResolution'[\s\S]{0,800}data-ytkit-quality/,
        'autoMaxResolution must set data-ytkit-quality on <html>'
    );
    assert.ok(
        !/_setQualityViaDOM|_temporarilyHideQualityPopup|ytkit-hide-quality-popup/.test(ytkitSource),
        'gear-menu DOM-click quality forcing must remain removed'
    );

    // MAIN side: the bridge must use the documented player APIs.
    const mainSource = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit-main.js'),
        'utf8'
    );
    assert.match(mainSource, /setPlaybackQualityRange/, 'MAIN bridge must call setPlaybackQualityRange');
    assert.match(mainSource, /getAvailableQualityData/, 'MAIN bridge must use getAvailableQualityData for Premium awareness');
    assert.match(mainSource, /\/premium\/i/, 'MAIN bridge must detect Premium-labelled qualityLabel entries');
});

test('audio track language does not drive the native player settings menu', () => {
    const start = ytkitSource.indexOf("id: 'audioTrackLanguage'");
    // Bound the slice to the next feature object, not the end of the array —
    // otherwise later features unrelated to audioTrackLanguage pollute the
    // regex search.
    const next = ytkitSource.indexOf("\n        {", start + 1);
    const end = next > start ? next : ytkitSource.indexOf('    ];', start);
    assert.ok(start > -1 && end > start, 'audioTrackLanguage feature block should exist');
    const block = ytkitSource.slice(start, end);

    assert.match(
        block,
        /without opening YouTube settings automatically/,
        'Feature description should state that it does not open YouTube settings automatically'
    );
    assert.match(
        block,
        /Automatic audio track switching skipped/,
        'Feature should log that automatic switching is skipped instead of driving native menus'
    );
    assert.doesNotMatch(
        block,
        /\.ytp-settings-button|\.ytp-menuitem|\.click\(|setTimeout\(\s*\(\)\s*=>\s*this\._applyPreferred/,
        'audioTrackLanguage must not open or click YouTube native settings menu items'
    );
});

// ── v3.14.0 getSetting helper ──

test('getSetting helper exists and is null-safe', () => {
    assert.match(
        ytkitSource,
        /function\s+getSetting\s*\(\s*key\s*,\s*def\s*\)/,
        'getSetting(key, default) must be defined'
    );

    const start = ytkitSource.indexOf('function getSetting');
    // Slice a generous window — the function body is short so any later code
    // won't affect the assertions.
    const body = ytkitSource.slice(start, start + 600);

    assert.match(body, /appState\s*&&\s*appState\.settings/, 'Must guard against missing appState.settings');
    assert.match(body, /typeof\s+settings\s*!==\s*'object'/, 'Must guard against non-object settings');
});

// ── v3.14.0 L1: chrome.downloads.show via onChanged ──

test('background.js reveals downloads via onChanged, not setTimeout', () => {
    assert.match(
        backgroundSource,
        /chrome\.downloads\.onChanged\.addListener/,
        'background.js must listen for downloads.onChanged'
    );
    assert.match(
        backgroundSource,
        /delta\.state\?\.current/,
        'onChanged handler must inspect delta.state.current transitions'
    );
    assert.match(
        backgroundSource,
        /state\s*===\s*'complete'/,
        'onChanged handler must branch on complete state'
    );
    assert.match(
        backgroundSource,
        /_pendingReveals/,
        'Pending reveals must be tracked via a Set, not timeouts'
    );

    // Confirm the legacy setTimeout(900, chrome.downloads.show) is gone.
    // Use multiline-aware regex since setTimeout callback spans newlines.
    assert.doesNotMatch(
        backgroundSource,
        /setTimeout\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?chrome\.downloads\.show/,
        'Legacy setTimeout + downloads.show pattern must be removed'
    );
});

// ── v3.14.0 C4: empty catch blocks must be documented ──

test('empty catch (_) {} blocks are eliminated from extension source', () => {
    for (const [name, source] of [
        ['ytkit.js', ytkitSource],
        ['background.js', backgroundSource],
        ['popup.js', popupSource]
    ]) {
        const matches = source.match(/catch\s*\(\s*_\s*\)\s*\{\s*\}/g) || [];
        assert.equal(
            matches.length,
            0,
            `${name} must not contain empty catch (_) {} blocks; each must carry a // reason: or log`
        );
    }
});

// ── v3.14.0 L2: diagnosticLog destroy clears _errors ──

test('diagnosticLog destroy clears _errors for immediate storage relief', () => {
    const idx = ytkitSource.indexOf("id: 'diagnosticLog'");
    assert.ok(idx > -1, 'diagnosticLog feature must exist');
    const end = ytkitSource.indexOf("id: 'storageQuotaLRU'", idx);
    const block = ytkitSource.slice(idx, end);

    assert.match(block, /destroy\s*\(\s*\)/, 'diagnosticLog must expose a destroy hook');
    assert.match(block, /DiagnosticLog\.clear\s*\(\s*\)/, 'destroy must call DiagnosticLog.clear()');
});

// ── v3.16+ Audit Pass: popup.js serializes toggle writes ──

test('popup.js serializes toggle writes to avoid read-merge-write race', () => {
    // The fix chains every writeSetting() call onto a shared promise so two
    // rapid toggle clicks can't both read pre-write storage and clobber each
    // other's update.
    assert.match(
        popupSource,
        /_pendingWriteChain/,
        'popup.js must serialize writeSetting() via a pending-write chain'
    );
    // The merge must be against the in-memory popupState.settings, not a
    // fresh storageGet() round-trip (which was the race source).
    const fnStart = popupSource.indexOf('async function writeSetting');
    assert.ok(fnStart > -1, 'writeSetting must exist');
    const fnBody = popupSource.slice(fnStart, fnStart + 1200);
    assert.match(fnBody, /\.\.\.\s*popupState\.settings/, 'writeSetting must merge from popupState.settings');
    assert.doesNotMatch(fnBody, /await\s+storageGet\s*\(/, 'writeSetting must not re-read storage per call');
});

test('popup.js exposes live result counts and the new data-management controls', () => {
    assert.ok(
        popupSource.includes('function updateResultsState(totalCount, visibleCount, filter)'),
        'popup.js should compute a live quick-control results summary'
    );
    assert.ok(
        popupHtmlSource.includes('id="resultsState"'),
        'popup.html should expose a dedicated results summary chip'
    );
    // v3.19.0: export/import/reset + storage stats were absorbed from the
    // removed options page. Every control must be wired up in the popup.
    for (const id of ['export-btn', 'import-btn', 'reset-btn', 'stat-keys', 'stat-size', 'stat-hidden-videos']) {
        assert.ok(
            popupHtmlSource.includes(`id="${id}"`),
            `popup.html must expose ${id} (ported from the removed options page)`
        );
    }
    assert.match(popupSource, /async function exportSettings/, 'popup.js must define exportSettings');
    assert.match(popupSource, /async function importSettings/, 'popup.js must define importSettings');
    assert.match(popupSource, /async function resetAllData/, 'popup.js must define resetAllData');
    assert.match(popupSource, /function summarizeStorage/, 'popup.js must own storage summarization');
});

// ── v3.19.0: options.html / options.js retirement ──

test('extension bundle no longer ships a standalone options page', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'),
        'utf8'
    ));
    assert.equal(
        manifest.options_ui,
        undefined,
        'manifest.options_ui must stay removed — the toolbar popup is the only settings surface'
    );
    assert.ok(
        !fs.existsSync(path.join(__dirname, '..', 'extension', 'options.html')),
        'extension/options.html must remain deleted'
    );
    assert.ok(
        !fs.existsSync(path.join(__dirname, '..', 'extension', 'options.js')),
        'extension/options.js must remain deleted'
    );
});

test('popup.js import accepts exportVersion >= 3 without an upper cap', () => {
    assert.doesNotMatch(
        popupSource,
        /exportVersion\s*>=\s*3\s*&&\s*data\.exportVersion\s*<\s*100/,
        'Arbitrary `< 100` import cap must be absent from the ported importer'
    );
});

test('settings imports run schema migrations before stamping the current version', () => {
    assert.match(
        ytkitSource,
        /_prepareImportedSettings\s*\(\s*settings\s*\)/,
        'Content-script import path must prepare imported settings through a dedicated migration helper'
    );
    assert.match(
        ytkitSource,
        /_migrate\s*\(\s*this\._sanitize\s*\(\s*settings\s*\)\s*,\s*'profile-import'\s*\)/,
        'Content-script imports must run the migration chain from the imported _settingsVersion'
    );
    assert.match(
        ytkitSource,
        /DiagnosticLog\?\.record\?\.\(\s*'settings-migration'/,
        'Migration steps must be sent to DiagnosticLog with ctx === settings-migration'
    );
    assert.match(
        ytkitSource,
        /preserved future settings schema/,
        'Future-version imports must preserve safe unknown fields while clamping local schema metadata'
    );

    assert.match(
        popupSource,
        /const\s+SETTINGS_IMPORT_MIGRATIONS\s*=\s*Object\.freeze/,
        'Popup import path must carry the same forward migration steps as the content script'
    );
    assert.match(
        popupSource,
        /function\s+migrateImportedSettings\s*\(/,
        'Popup imports must migrate old settings snapshots before writing storage'
    );
    assert.match(
        popupSource,
        /function\s+mergeImportedSettingsWithDefaults\s*\(/,
        'Popup imports must merge migrated settings over generated defaults so missing keys are restored'
    );
    assert.match(
        popupSource,
        /settings-meta\.json/,
        'Popup imports must read generated settings metadata instead of hard-stamping an imported version'
    );
    assert.match(
        popupSource,
        /ctx:\s*'settings-migration'/,
        'Popup imports must append settings-migration diagnostics for each migration step'
    );
});

test('popup root is a modal dialog with focus trapping and Escape close semantics', () => {
    assert.match(
        popupHtmlSource,
        /<body[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="popup-title"/,
        'Popup body must expose modal dialog semantics to assistive technology'
    );
    assert.match(
        popupHtmlSource,
        /id="popup-title"/,
        'Popup dialog must be labelled by the visible title'
    );
    assert.match(
        popupSource,
        /const\s+FOCUSABLE_SELECTOR\s*=/,
        'Popup focus trap must enumerate focusable controls'
    );
    assert.match(
        popupSource,
        /function\s+handlePopupDialogKeydown\s*\(/,
        'Popup must own a keyboard handler for dialog-level focus management'
    );
    assert.match(
        popupSource,
        /event\.key\s*===\s*'Tab'[\s\S]*?event\.shiftKey[\s\S]*?focus\(\{\s*preventScroll:\s*true\s*\}\)/,
        'Tab and Shift+Tab must wrap between first and last popup controls'
    );
    assert.match(
        popupSource,
        /event\.key\s*===\s*'Escape'[\s\S]*?window\.close\(\)/,
        'Escape must close the extension popup when no nested dialog handled it'
    );
    assert.match(
        popupSource,
        /focusInitialPopupControl\s*\(\s*\)/,
        'Popup boot must move focus into the dialog after controls render'
    );
});

// ── v3.16+ Audit Pass: SponsorBlock destroy is race-proof ──

test('sponsorBlock _loadForVideo aborts if destroy runs mid-fetch', () => {
    const idx = ytkitSource.indexOf("id: 'sponsorBlock'");
    assert.ok(idx > -1, 'sponsorBlock feature must exist');
    const end = ytkitSource.indexOf("id: 'sbCat_sponsor'", idx);
    const block = ytkitSource.slice(idx, end);

    assert.match(block, /_generation:\s*0/, 'sponsorBlock must track a generation counter');
    assert.match(
        block,
        /gen\s*!==\s*this\._generation/,
        '_loadForVideo must short-circuit when destroy bumped the generation'
    );
    // The destroy() hook must bump the counter before clearing other state
    // so late fetches observe the bump. Match `destroy() {` to skip prose
    // that mentions destroy() in comments.
    const destroyIdx = block.search(/destroy\s*\(\s*\)\s*\{/);
    assert.ok(destroyIdx > -1, 'destroy() method must exist');
    const destroyBody = block.slice(destroyIdx, destroyIdx + 1800);
    assert.match(destroyBody, /this\._generation\s*=/, 'destroy must bump _generation');
});

test('sponsorBlock caches segments before network and serves stale cache on failure', () => {
    const idx = ytkitSource.indexOf("id: 'sponsorBlock'");
    assert.ok(idx > -1, 'sponsorBlock feature must exist');
    const end = ytkitSource.indexOf("id: 'sbCat_sponsor'", idx);
    const block = ytkitSource.slice(idx, end);

    assert.match(block, /_CACHE_KEY:\s*'sb_segments_cache'/,
        'SponsorBlock must store segment cache under a named top-level key');
    assert.match(block, /_CACHE_TTL_MS:\s*12\s*\*\s*60\s*\*\s*60\s*\*\s*1000/,
        'Fresh SponsorBlock cache TTL must be 12 hours');
    assert.match(block, /_CACHE_STALE_MAX_MS:\s*7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/,
        'Stale fallback window must be capped at 7 days');
    assert.match(block, /_CACHE_MAX_ENTRIES:\s*500/,
        'SponsorBlock cache must be bounded to 500 videos');

    for (const helper of [
        '_getCachedSegments',
        '_rememberSegments',
        '_markCachedSegments',
        '_flushCachePersist',
        '_formatCacheTimestamp'
    ]) {
        assert.match(block, new RegExp(`${helper}\\s*\\(`), `${helper} helper must exist`);
    }

    const fetchStart = block.indexOf('async _fetchSegments');
    assert.ok(fetchStart > -1, '_fetchSegments must exist');
    const fetchBody = block.slice(fetchStart, fetchStart + 2800);
    const cacheReadIdx = fetchBody.indexOf('_getCachedSegments(videoId, cats)');
    const networkIdx = fetchBody.indexOf('extensionFetchJson');
    assert.ok(cacheReadIdx > -1 && networkIdx > cacheReadIdx,
        '_fetchSegments must check fresh cache before network fetch');
    assert.match(fetchBody, /this\._rememberSegments\(videoId,\s*cats,\s*segments\)/,
        'Network results must be normalized and remembered in the cache');
    assert.match(fetchBody, /allowStale:\s*true/,
        'Fetch failure path must ask for stale cache entries');
    assert.match(fetchBody, /stale cache fallback/,
        'Stale fallback should emit a diagnostic breadcrumb');
    assert.match(fetchBody, /return\s+this\._markCachedSegments\(stale\.segments,\s*stale\.ts,\s*'stale'\)/,
        'Stale fallback must annotate returned segments as stale');

    const destroyIdx = block.search(/destroy\s*\(\s*\)\s*\{/);
    assert.ok(destroyIdx > -1, 'destroy() method must exist');
    const destroyBody = block.slice(destroyIdx, destroyIdx + 1800);
    assert.match(destroyBody, /this\._flushCachePersist\(\)/,
        'Destroy must synchronously flush pending SponsorBlock cache writes');
    assert.match(destroyBody, /this\._cache\s*=\s*null/,
        'Destroy must release the in-memory SponsorBlock cache');
});

test('sponsorBlock stale cache markers are category-filtered and annotated', () => {
    const idx = ytkitSource.indexOf("id: 'sponsorBlock'");
    assert.ok(idx > -1, 'sponsorBlock feature must exist');
    const end = ytkitSource.indexOf("id: 'sbCat_sponsor'", idx);
    const block = ytkitSource.slice(idx, end);

    const renderStart = block.search(/\n\s+_renderBarSegments\(\)\s*\{/);
    assert.ok(renderStart > -1, '_renderBarSegments must exist');
    const renderBody = block.slice(renderStart, renderStart + 1800);

    assert.match(renderBody, /const\s+enabledCats\s*=\s*this\._getEnabledCategories\(\)/,
        'Cached segment rendering must re-read the current enabled categories');
    assert.match(renderBody, /enabledCats\.includes\(seg\.category\)/,
        'Cached segments from disabled categories must not render markers');
    assert.match(renderBody, /bar\.dataset\.ytkitCacheSource\s*=\s*'stale'/,
        'Stale markers must expose their cache source for diagnostics and CSS');
    assert.match(renderBody, /cached at/,
        'Stale marker tooltip must include the cached-at timestamp microcopy');
});

// ── v3.17.0 Perf Pass: scoped mutation rule helper ──

test('addScopedMutationRule exists in core/navigation.js and is selector-filtered', () => {
    const navSource = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'navigation.js'),
        'utf8'
    );
    // New helper that only fires when an element matching `selector` is added
    // in the mutation batch. Without it the shared observer fan-out ran all
    // ~37 rules on every rAF tick.
    assert.match(navSource, /function\s+addScopedMutationRule\s*\(\s*id\s*,\s*selector\s*,\s*ruleFn\s*\)/,
        'addScopedMutationRule(id, selector, ruleFn) must exist');
    assert.match(navSource, /scopedMutationRules/, 'scoped rules must live in a separate Map from addMutationRule rules');
    // The dispatch path must short-circuit when no added node matches.
    assert.match(navSource, /anyAddedMatchesSelector/, 'scoped dispatch must use the added-node match helper');
    // Core must export both the add and remove helpers.
    assert.match(navSource, /addScopedMutationRule,/, 'addScopedMutationRule must be exported on core');
    assert.match(navSource, /removeScopedMutationRule/, 'removeScopedMutationRule must be exported on core');
});

test('hot feed-driven mutation rules are migrated to scoped form', () => {
    // These four features ran `document.querySelectorAll`/debounced schedulers
    // on every mutation tick. After the perf pass they only fire when a
    // thumbnail-bearing renderer is added to the DOM.
    for (const id of [
        'thumbnailQualityUpgrade',
        'watchLaterQuickAdd',
        'videoResolutionBadge',
        'videoAgeColors'
    ]) {
        assert.ok(
            ytkitSource.includes(`addScopedMutationRule(\n                    '${id}'`)
            || ytkitSource.includes(`addScopedMutationRule(\n                    '${id}',`)
            || new RegExp(`addScopedMutationRule\\(\\s*'${id}'`).test(ytkitSource),
            `${id} must register via addScopedMutationRule, not addMutationRule`
        );
        // And cleanup must use the matching remove helper.
        assert.ok(
            new RegExp(`removeScopedMutationRule\\(\\s*'${id}'`).test(ytkitSource),
            `${id} destroy must call removeScopedMutationRule`
        );
    }
});

// ── v3.17.0 Perf Pass: 1Hz intervals → timeupdate events ──

test('remainingTimeDisplay + showTimeInTabTitle use timeupdate, not setInterval', () => {
    // These were setInterval(_update, 1000) — waking up once a second even in
    // background tabs. `timeupdate` is free (fires during playback only) and
    // stops when the video pauses.
    const remainIdx = ytkitSource.indexOf("id: 'remainingTimeDisplay'");
    assert.ok(remainIdx > -1, 'remainingTimeDisplay feature must exist');
    const nextFeatureIdx = ytkitSource.indexOf("id: 'showTimeInTabTitle'", remainIdx);
    const remainBlock = ytkitSource.slice(remainIdx, nextFeatureIdx);
    assert.doesNotMatch(remainBlock, /setInterval\s*\(\s*\(\s*\)\s*=>\s*this\._update/,
        'remainingTimeDisplay must not wake up once per second via setInterval');
    assert.match(remainBlock, /addEventListener\('timeupdate'/,
        'remainingTimeDisplay must bind to the video `timeupdate` event');

    const titleIdx = ytkitSource.indexOf("id: 'showTimeInTabTitle'");
    assert.ok(titleIdx > -1);
    const titleEnd = ytkitSource.indexOf("id: 'customProgressBarColor'", titleIdx);
    const titleBlock = ytkitSource.slice(titleIdx, titleEnd);
    assert.doesNotMatch(titleBlock, /setInterval\s*\(\s*\(\s*\)\s*=>\s*this\._update/,
        'showTimeInTabTitle must not wake up once per second via setInterval');
    assert.match(titleBlock, /addEventListener\('timeupdate'/,
        'showTimeInTabTitle must bind to the video `timeupdate` event');
});

// ── Audit pass: EXT_FETCH SSRF post-redirect validation ──

test('EXT_FETCH rejects responses whose final URL escapes the origin allowlist', () => {
    // A 30x from an allowed origin (e.g. api.openai.com) to an internal IP
    // would otherwise smuggle an arbitrary host into the response because
    // fetch() defaults to `redirect: 'follow'`. The guard must re-check
    // `resp.url` against isUrlAllowed before the body is streamed back.
    assert.match(
        backgroundSource,
        /resp\.url\s*!==\s*url\s*&&\s*!isUrlAllowed\(resp\.url\)/,
        'background.js must re-check the post-redirect URL against the allowlist'
    );
    assert.match(
        backgroundSource,
        /Response URL not in allowlist after redirect/,
        'Rejection must carry a descriptive error so callers can surface it'
    );
});

// ── Audit pass: storage write backoff prevents retry storms ──

test('core/storage.js applies exponential backoff on persistent write failures', () => {
    const storageSource = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'storage.js'),
        'utf8'
    );
    // Without a backoff, a QUOTA_BYTES failure would retry every 140ms
    // forever, saturating the SW IPC channel and flooding the console.
    assert.match(
        storageSource,
        /storageFlushBackoffMs/,
        'Storage flush must track a backoff value on failure'
    );
    assert.match(
        storageSource,
        /storageFlushFailureCount/,
        'Storage flush must track consecutive failure count for backoff'
    );
    assert.match(
        storageSource,
        /STORAGE_FLUSH_MAX_BACKOFF_MS/,
        'Storage flush must cap the backoff so it cannot diverge'
    );
    // Success path must reset the backoff — a sticky backoff would keep
    // penalising writes long after the transient error cleared.
    const flushFn = storageSource.slice(
        storageSource.indexOf('function flushPendingStorageWrites')
    );
    const successBody = flushFn.slice(0, flushFn.indexOf('.catch('));
    assert.match(
        successBody,
        /storageFlushBackoffMs\s*=\s*0/,
        'Success path must reset backoff'
    );
    assert.match(
        successBody,
        /storageFlushFailureCount\s*=\s*0/,
        'Success path must reset failure count'
    );
});

// ── Audit pass: download progress poll is resilient and non-overlapping ──

test('showDownloadProgress uses self-scheduling poll with consecutive-error budget', () => {
    const progressStart = ytkitSource.indexOf('function showDownloadProgress(');
    assert.ok(progressStart > -1, 'showDownloadProgress must exist');
    // Grab from the function start up to the matching `}` — the function is
    // ~14 KB with all the DOM scaffolding so this generous capture covers
    // the whole poll loop without overshooting into neighbours.
    const progressBody = ytkitSource.slice(progressStart, progressStart + 16000);

    // setInterval would allow a slow poll to overlap itself, doubling load
    // on the downloader when yt-dlp is busy merging or extracting audio.
    assert.doesNotMatch(
        progressBody,
        /setInterval\s*\(\s*poll/,
        'showDownloadProgress must not drive its poll loop with setInterval'
    );
    // Tolerate a small streak of transient failures before tearing down the
    // panel so a single network blip doesn't kill an otherwise healthy
    // download.
    assert.match(
        progressBody,
        /consecutiveErrors/,
        'Poll loop must track consecutive errors for graceful retry'
    );
    assert.match(
        progressBody,
        /MAX_CONSECUTIVE_ERRORS/,
        'Poll loop must cap consecutive errors before giving up'
    );
    assert.match(
        progressBody,
        /pollTimer\s*=\s*setTimeout\(poll/,
        'Poll loop must reschedule itself with setTimeout, not setInterval'
    );
});

// ── v3.20.0 Hardening Pass 7 ──

test('_pendingReveals is mirrored to chrome.storage.session for SW-restart survival', () => {
    // The roadmap audit-pass flagged the in-memory Set as fragile: a SW
    // terminated between download() and state.complete would lose the reveal.
    // Pass 7 mirrors writes into chrome.storage.session (MV3-only, survives
    // SW restart, cleared on browser restart) and hydrates on SW cold-start.
    assert.match(
        backgroundSource,
        /_PENDING_REVEALS_KEY\s*=\s*'_pendingReveals'/,
        'Session-storage key constant must exist'
    );
    assert.match(
        backgroundSource,
        /_pendingRevealsReady\s*=\s*\(async\s*\(\s*\)\s*=>/,
        'Hydration promise must bootstrap on SW cold-start'
    );
    assert.match(
        backgroundSource,
        /chrome\.storage\.session\.get\s*\(\s*_PENDING_REVEALS_KEY/,
        'Hydration must read from chrome.storage.session'
    );
    assert.match(
        backgroundSource,
        /function\s+_persistPendingReveals/,
        'Persist helper must exist so add/delete mirror into storage.session'
    );
    assert.match(
        backgroundSource,
        /chrome\.storage\.session\.set\s*\(\s*payload/,
        'Persist helper must write through chrome.storage.session.set'
    );
    // The onChanged listener must await the hydration promise so a reveal
    // queued before SW cold-start is still honoured when the event arrives.
    const listenerStart = backgroundSource.indexOf(
        'chrome.downloads.onChanged.addListener'
    );
    assert.ok(listenerStart > -1, 'onChanged listener must exist');
    // Bound the slice to the closing brace of the addListener() call so
    // growth of the listener body doesn't silently let the assertion below
    // reach past it into unrelated code.
    const listenerEnd = backgroundSource.indexOf('\n}', listenerStart);
    assert.ok(listenerEnd > listenerStart, 'onChanged listener must have a closing brace');
    const listenerBody = backgroundSource.slice(listenerStart, listenerEnd);
    assert.match(
        listenerBody,
        /await\s+_pendingRevealsReady/,
        'onChanged listener must await the hydration promise before checking membership'
    );
    assert.match(
        listenerBody,
        /_persistPendingReveals\s*\(\s*\)/,
        'onChanged listener must persist the Set after deleting a completed/interrupted id'
    );

    // The DOWNLOAD_FILE handler must persist the add, not just update the
    // in-memory Set — otherwise a SW kill between add and state.complete
    // loses the reveal. Hardening pass moved the add behind _addPendingReveal
    // so the per-cap bound is enforced; scope the search to the DOWNLOAD_FILE
    // branch so we don't catch the cap helper's internal `.add()` call.
    const dlBranch = backgroundSource.indexOf("msg.type === 'DOWNLOAD_FILE'");
    assert.ok(dlBranch > -1, 'DOWNLOAD_FILE branch must exist');
    const dlBlock = backgroundSource.slice(dlBranch, dlBranch + 3000);
    assert.match(
        dlBlock,
        /(_pendingReveals\.add|_addPendingReveal)\s*\(\s*downloadId\s*\)/,
        'DOWNLOAD_FILE handler must populate _pendingReveals'
    );
    assert.match(
        dlBlock,
        /_persistPendingReveals\s*\(\s*\)/,
        'DOWNLOAD_FILE handler must mirror the add into storage.session'
    );
});

test('_pendingReveals add path is bounded by a hard cap', () => {
    // Hardening pass — defends against unbounded growth if storage.session
    // writes fail repeatedly. The cap must use _pendingReveals.values()/.delete()
    // to drop the oldest id when the Set is at capacity.
    assert.match(
        backgroundSource,
        /PENDING_REVEALS_CAP\s*=\s*\d+/,
        'background.js must declare a cap constant for _pendingReveals'
    );
    assert.match(
        backgroundSource,
        /_addPendingReveal\s*\(/,
        'background.js must expose the cap-enforcing _addPendingReveal() helper'
    );
    // The helper must drop the oldest id when the set is full.
    const helperStart = backgroundSource.indexOf('function _addPendingReveal');
    const helperBody = backgroundSource.slice(helperStart, helperStart + 600);
    assert.match(helperBody, /_pendingReveals\.size\s*>=\s*PENDING_REVEALS_CAP/,
        'cap helper must check Set.size against the cap');
    assert.match(helperBody, /_pendingReveals\.values\(\)\.next\(\)\.value/,
        'cap helper must drop the insertion-order-oldest entry');
});

test('_pendingReveals is pruned when a tracked download is erased from history', () => {
    // Pass 8 closes the Pass 7 LOW security finding: without onErased, a
    // download that is cancelled + erased (or wiped on crash recovery)
    // before reaching `state.complete` / `state.interrupted` would leave
    // its id in `_pendingReveals` forever — both in memory and in the
    // session mirror.
    assert.match(
        backgroundSource,
        /chrome\.downloads\?\.onErased\?\.addListener/,
        'onErased listener must exist (guarded for older Firefox builds)'
    );
    const erasedStart = backgroundSource.indexOf('chrome.downloads.onErased.addListener');
    assert.ok(erasedStart > -1, 'onErased listener must be registered');
    // Bound the slice to the closing brace of this addListener() call so
    // growth elsewhere in the file can't satisfy these assertions.
    const erasedEnd = backgroundSource.indexOf('\n}', erasedStart);
    assert.ok(erasedEnd > erasedStart, 'onErased listener must have a closing brace');
    const erasedBody = backgroundSource.slice(erasedStart, erasedEnd);
    assert.match(
        erasedBody,
        /await\s+_pendingRevealsReady/,
        'onErased listener must await the hydration promise before mutating the Set'
    );
    assert.match(
        erasedBody,
        /_pendingReveals\.delete\s*\(\s*downloadId\s*\)/,
        'onErased listener must drop the id from the in-memory Set'
    );
    assert.match(
        erasedBody,
        /_persistPendingReveals\s*\(\s*\)/,
        'onErased listener must mirror the delete into chrome.storage.session'
    );
    assert.match(
        erasedBody,
        /_pendingReveals\.has\s*\(\s*downloadId\s*\)/,
        'onErased listener must no-op on ids we never tracked (e.g. unrelated downloads)'
    );
});

test('manifest declares unlimitedStorage to exceed the 10 MB default quota', () => {
    // Watch history, DeArrow cache, and storageQuotaLRU can collectively
    // push chrome.storage.local past the 10 MB default quota for long-term
    // users. `unlimitedStorage` removes the ceiling without changing any
    // other permission surface.
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'),
        'utf8'
    ));
    assert.ok(
        Array.isArray(manifest.permissions) && manifest.permissions.includes('unlimitedStorage'),
        'manifest.permissions must include "unlimitedStorage"'
    );
});

test('v4.5.3: manifest declares no keyboard shortcuts (Chrome + Firefox patched)', () => {
    // The `commands` block was retired in v4.5.3 per the "no keyboard
    // shortcuts" project rule. Removing it from the Chrome manifest also
    // resolves the Firefox Ctrl+Shift+Y collision with "Show Downloads"
    // without a per-vendor patch — there is no shortcut left to collide.
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'),
        'utf8'
    ));
    assert.equal(
        manifest.commands,
        undefined,
        'Chrome manifest must NOT declare a `commands` block (no keyboard shortcuts)'
    );

    const { patchManifestForFirefox } = require('../scripts/manifest-patch');
    const ffManifest = JSON.parse(JSON.stringify(manifest));
    patchManifestForFirefox(ffManifest);

    assert.equal(
        ffManifest.commands,
        undefined,
        'Firefox-patched manifest must also be free of `commands`'
    );
    // The Firefox-specific gecko + background transformations must still
    // apply — a regression here would silently break Firefox at load time.
    assert.equal(ffManifest.browser_specific_settings?.gecko?.id, 'ytkit@sysadmindoc.github.io');
    assert.equal(ffManifest.browser_specific_settings?.gecko?.strict_min_version, '128.0');
    assert.ok(
        Array.isArray(ffManifest.background?.scripts) && ffManifest.background.scripts.length > 0,
        'Firefox background must be a scripts[] array, not a service_worker entry'
    );

    // Running the patch twice must stay idempotent.
    patchManifestForFirefox(ffManifest);
    assert.equal(ffManifest.commands, undefined, 'Patch must remain idempotent across re-runs');
});

test('SponsorBlock never auto-skips poi_highlight (API contract: marker, not skip)', () => {
    // Pass 8 closes the Pass 7 POI correctness finding. The SponsorBlock
    // API defines poi_highlight as a jump-to marker. Previously we skipped
    // past it like any other segment. Both the skip check and the
    // scheduler now exclude it explicitly, while the progress-bar render
    // still paints the marker.
    // Match method DEFINITIONS (leading whitespace + name, not call sites).
    const checkStart = ytkitSource.search(/\n\s+_checkSkip\(\)\s*\{/);
    assert.ok(checkStart > -1, '_checkSkip method definition must exist');
    const checkEnd = ytkitSource.indexOf('            },', checkStart);
    assert.ok(checkEnd > checkStart, '_checkSkip must have a closing brace');
    const checkBody = ytkitSource.slice(checkStart, checkEnd);
    assert.match(
        checkBody,
        /seg\.category\s*===\s*'poi_highlight'/,
        '_checkSkip must explicitly skip the poi_highlight category'
    );

    const schedStart = ytkitSource.search(/\n\s+_scheduleNextSkip\(\)\s*\{/);
    assert.ok(schedStart > -1, '_scheduleNextSkip method definition must exist');
    const schedEnd = ytkitSource.indexOf('            },', schedStart);
    assert.ok(schedEnd > schedStart, '_scheduleNextSkip must have a closing brace');
    const schedBody = ytkitSource.slice(schedStart, schedEnd);
    assert.match(
        schedBody,
        /seg\.category\s*===\s*'poi_highlight'/,
        '_scheduleNextSkip must also exclude poi_highlight so no skip timer fires for it'
    );
});

test('_run_download no longer contains the dead "Downloading video" regex match', () => {
    const downloaderSource = fs.readFileSync(
        path.join(__dirname, '..', 'astra_downloader', 'astra_downloader.py'),
        'utf8'
    );
    // The match target captured a group count but assigned it to `m` and
    // never read it. Removing the dead line keeps `_run_download` focused
    // on filename detection + progress parsing.
    assert.doesNotMatch(
        downloaderSource,
        /m\s*=\s*re\.search\(r'\\\[download\\\] Downloading video/,
        'Dead "Downloading video" regex must remain removed from _run_download'
    );
});

// ── v3.20.2 H1: TrustedTypes createPolicy fallback is observable ──
//
// Previously the catch block at ytkit.js:~640 swallowed createPolicy()
// failures silently, so peer-extension policy-name collisions were
// invisible in field diagnostics — the userscript fell back to DOMParser
// with no signal in the ring buffer. H1 routes the fallback reason through
// DiagnosticLog so users can surface it via the diagnostic dump if another
// extension squats the 'ytkit-policy' name.

test('TrustedTypes IIFE captures a fallbackReason for DiagnosticLog', () => {
    const iifeStart = ytkitSource.indexOf('const TrustedHTML = (() => {');
    assert.ok(iifeStart > -1, 'TrustedHTML IIFE must still exist');
    const iifeEnd = ytkitSource.indexOf('})();', iifeStart);
    assert.ok(iifeEnd > iifeStart, 'TrustedHTML IIFE must close');
    const iifeBody = ytkitSource.slice(iifeStart, iifeEnd);

    assert.match(
        iifeBody,
        /let\s+fallbackReason\s*=\s*null/,
        'IIFE must declare a fallbackReason variable to capture the failure mode'
    );
    assert.match(
        iifeBody,
        /let\s+fallbackLogged\s*=/,
        'IIFE must debounce logging with a fallbackLogged flag so it records once'
    );
    assert.match(
        iifeBody,
        /TT_UNAVAILABLE/,
        'Firefox / older-browser path must be tagged TT_UNAVAILABLE so field logs distinguish it from policy collisions'
    );
    assert.match(
        iifeBody,
        /TT_POLICY_FAIL/,
        'createPolicy throw path must be tagged TT_POLICY_FAIL so field logs can distinguish it from TT_UNAVAILABLE'
    );
});

test('TrustedTypes createPolicy catch redacts URLs before logging', () => {
    const iifeStart = ytkitSource.indexOf('const TrustedHTML = (() => {');
    const iifeEnd = ytkitSource.indexOf('})();', iifeStart);
    const iifeBody = ytkitSource.slice(iifeStart, iifeEnd);

    // The raw error message can contain the offending page URL. Redacting
    // before it lands in DiagnosticLog prevents page-URL leakage in
    // diagnostic dumps that users send to us.
    assert.match(
        iifeBody,
        /replace\(\s*\/https\?:\\\/\\\/\[\^\\s\)\]\+\/g/,
        'createPolicy catch must redact http(s)://… URLs from the logged message'
    );
});

test('TrustedTypes setHTML and create both trigger lazy fallback log', () => {
    const iifeStart = ytkitSource.indexOf('const TrustedHTML = (() => {');
    const iifeEnd = ytkitSource.indexOf('})();', iifeStart);
    const iifeBody = ytkitSource.slice(iifeStart, iifeEnd);

    // setHTML runs before appState.settings is guaranteed ready, so the
    // log call must be deferred into the first public-method invocation.
    // Both setHTML and create are public entry points; both must call
    // logFallbackOnce so whichever fires first surfaces the signal.
    const setHTMLStart = iifeBody.indexOf('setHTML(element, html)');
    const createStart = iifeBody.indexOf('create(html)');
    assert.ok(setHTMLStart > -1 && createStart > -1, 'Both public methods must exist');

    const setHTMLBody = iifeBody.slice(setHTMLStart, createStart);
    const createBody = iifeBody.slice(createStart);

    assert.match(setHTMLBody, /logFallbackOnce\(\)/,
        'setHTML must call logFallbackOnce so the first render records the signal');
    assert.match(createBody, /logFallbackOnce\(\)/,
        'create must call logFallbackOnce in case it fires before any setHTML call');
});

test('TrustedTypes fallback uses DOMParser + replaceChildren (no raw innerHTML clear)', () => {
    const iifeStart = ytkitSource.indexOf('const TrustedHTML = (() => {');
    const iifeEnd = ytkitSource.indexOf('})();', iifeStart);
    const iifeBody = ytkitSource.slice(iifeStart, iifeEnd);

    // The fallback path for non-TrustedTypes browsers (Firefox) must not
    // use `innerHTML = ''` even for clearing — that's still a TrustedHTML
    // sink on strict-CSP pages. replaceChildren() + DOMParser template
    // extraction is the correct pattern.
    assert.match(iifeBody, /new DOMParser\(\)/,
        'Fallback must parse via DOMParser to avoid innerHTML sink');
    assert.match(iifeBody, /element\.replaceChildren\(\);/,
        'Fallback must clear via replaceChildren, not innerHTML = ""');
    assert.doesNotMatch(iifeBody, /element\.innerHTML\s*=\s*['"]{2}/,
        'Fallback must NOT use innerHTML = "" to clear — trips strict-CSP TrustedHTML sinks');
});

// ── v3.20.2 H4: popup surfaces TrustedTypes diagnostic signal ──
//
// The signal written by H1 only has value if a user sees it. The popup
// gains a conditional "health banner" that reads ytSuiteSettings._errors,
// filters for ctx === 'trusted-types', and surfaces the latest event
// with a Copy-to-clipboard payload so users filing bug reports include
// the reason code instead of a vague "something broke."

test('popup.html carries a hidden health-banner scaffold', () => {
    assert.match(popupHtmlSource, /id="health-banner"[^>]*hidden/,
        'Health banner must be rendered hidden by default so the happy path is quiet');
    assert.match(popupHtmlSource, /id="health-detail"/,
        'Banner must expose a detail slot so popup.js can fill the message in');
    assert.match(popupHtmlSource, /id="health-copy-btn"/,
        'Banner must include a Copy button to dump the diagnostic payload to clipboard');
    assert.match(popupHtmlSource, /role="status"[^>]*aria-live="polite"/,
        'Banner must be an aria-live polite status region so screen readers announce it non-intrusively');
});

test('popup.js filters trusted-types diagnostics from _errors and renders a count', () => {
    // Pin the filter predicate so a rename of ctx ('trusted-types' is the
    // tag ytkit.js uses when logging) breaks the test immediately.
    assert.match(popupSource, /entry\.ctx\s*===\s*'trusted-types'/,
        'summarizeDiagnostics must filter _errors entries where ctx === "trusted-types"');
    // Pin the shape returned so renderHealthBanner can rely on it.
    assert.match(popupSource, /trustedTypes:\s*\{[\s\S]*?count:/,
        'Diagnostic summary must expose trustedTypes.count so the banner can show an event total');
    assert.match(popupSource, /latestMessage:/,
        'Diagnostic summary must include the latest message verbatim (already URL-redacted at capture site)');
});

test('popup.js health banner stays hidden when no trusted-types events exist', () => {
    // The render path takes either null (no diagnostics) OR an object
    // whose trustedTypes.count is zero and must keep the banner hidden.
    const renderStart = popupSource.indexOf('function renderHealthBanner');
    assert.ok(renderStart > -1, 'renderHealthBanner must exist');
    const renderEnd = popupSource.indexOf('\nif (healthCopyBtn)', renderStart);
    assert.ok(renderEnd > renderStart, 'renderHealthBanner must have an identifiable end boundary');
    const renderBody = popupSource.slice(renderStart, renderEnd);

    assert.match(renderBody, /healthBanner\.hidden\s*=\s*true/,
        'Null / zero-count path must hide the banner');
    assert.match(renderBody, /!tt\s*\|\|\s*tt\.count\s*<=\s*0/,
        'Null / zero-count guard must match the trustedTypes.count shape');
    assert.match(renderBody, /healthCopyPayload\s*=\s*['"]{2}/,
        'Null path must reset the copy payload so a stale payload never reaches the clipboard on a later click');
});

test('popup.css styles the health banner with a warning-toned palette and focus-visible outline', () => {
    const cssSource = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.css'),
        'utf8'
    );
    assert.match(cssSource, /\.health-banner\s*\{/,
        'health-banner CSS rule must exist');
    assert.match(cssSource, /\.health-banner\[hidden\]\s*\{\s*display:\s*none/,
        'Banner must honor the [hidden] attribute (avoid grid-layout peek)');
    assert.match(cssSource, /\.health-copy-btn:focus-visible/,
        'Copy button must carry a focus-visible outline for keyboard users');
});

// ── v3.20.2 H5 + v3.20.x H13: storageQuotaLRU top-level cache pruning ──
//
// The prune loop iterated `appState.settings.deArrowCache`, but the actual
// DeArrow branding cache lives under the top-level storage key
// `da_branding_cache` (written via storageWriteJSON, not through settings).
// The entry was dead — it never matched a real cache, regardless of
// whether the DeArrow feature was running. H5 removes the stale entry
// and adds a belt-and-suspenders sweep on the real top-level key. H13 adds
// the same quota hygiene for SponsorBlock's top-level segment cache.

test('storageQuotaLRU._prune no longer references the dead deArrowCache key', () => {
    const pruneStart = ytkitSource.indexOf("id: 'storageQuotaLRU'");
    assert.ok(pruneStart > -1, 'storageQuotaLRU feature must still exist');
    const pruneEnd = ytkitSource.indexOf("this._timer = null;", pruneStart);
    assert.ok(pruneEnd > pruneStart, 'storageQuotaLRU must have a terminator');
    const pruneBlock = ytkitSource.slice(pruneStart, pruneEnd);

    assert.doesNotMatch(
        pruneBlock,
        /\['deArrowCache',/,
        "Dead 'deArrowCache' cap entry must be removed — DeArrow does not store under appState.settings.deArrowCache"
    );
    assert.match(
        pruneBlock,
        /storageReadJSON\(['"]da_branding_cache['"]/,
        "Prune must read da_branding_cache (the real DeArrow top-level storage key) via storageReadJSON"
    );
    assert.match(
        pruneBlock,
        /storageWriteJSON\(['"]da_branding_cache['"]/,
        "Prune must persist the trimmed da_branding_cache via storageWriteJSON"
    );
    assert.match(
        pruneBlock,
        /storageReadJSON\(['"]sb_segments_cache['"]/,
        "Prune must read sb_segments_cache (the SponsorBlock top-level storage key) via storageReadJSON"
    );
    assert.match(
        pruneBlock,
        /storageWriteJSON\(['"]sb_segments_cache['"]/,
        "Prune must persist the trimmed sb_segments_cache via storageWriteJSON"
    );
    assert.match(
        pruneBlock,
        /entries\.slice\(0,\s*500\)/,
        'SponsorBlock segment cache pruning must cap storage at 500 entries'
    );
});

test('storageQuotaLRU description names every top-level cache it prunes', () => {
    const pruneStart = ytkitSource.indexOf("id: 'storageQuotaLRU'");
    const pruneBlock = ytkitSource.slice(pruneStart, pruneStart + 500);
    // Pre-fix: description claimed to cover 'deArrowCache' (never existed).
    assert.doesNotMatch(pruneBlock, /description:\s*['"][^'"]*deArrowCache/,
        'Description must not reference the dead deArrowCache key');
    assert.match(pruneBlock, /description:\s*['"][^'"]*da_branding_cache/,
        'Description must name the real da_branding_cache top-level key so users can audit what the sweep actually touches');
    assert.match(pruneBlock, /description:\s*['"][^'"]*sb_segments_cache/,
        'Description must name the SponsorBlock segment cache key so users can audit quota pruning');
});

// ── v3.20.3 H6: explicit cookie-jar wire contract via normalizeCookieExpiry ──
//
// Three sites previously inlined `expirationDate: c.expirationDate || 0`:
//   - extension/ytkit.js (MediaDL cookie mapper, ~line 2633)
//   - extension/background.js (EXT_COOKIE_LIST handler, ~line 620)
//   - YTKit.user.js (GM_cookie fallback, ~line 1851)
//
// The contract was implicit — null/undefined/negative/NaN/strings all
// happened to coerce to 0 because of JavaScript's truthiness rules. A
// future wire-format change (or a future Chrome cookies API that returns
// expirationDate as ISO string) could silently break that. Centralize as
// a named helper so the contract is explicit, parity across sites is
// testable, and the Python downloader's defensive parsing
// (test_astra_downloader.py:333+) has a documented JS counterpart.

function extractNormalizeFn(source, label) {
    const startIdx = source.indexOf('function normalizeCookieExpiry');
    assert.ok(startIdx > -1, `${label}: normalizeCookieExpiry must be defined`);
    // Find the matching closing brace (small function — ~5 lines).
    const openBrace = source.indexOf('{', startIdx);
    let depth = 1;
    let i = openBrace + 1;
    while (i < source.length && depth > 0) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') depth--;
        i++;
    }
    const body = source.slice(startIdx, i);
    // eval is safe here — body is a vetted, repo-tracked function literal,
    // and the test runs in node:test sandboxes already.
    // eslint-disable-next-line no-new-func
    return new Function(body + '; return normalizeCookieExpiry;')();
}

test('normalizeCookieExpiry is defined identically in all three sites', () => {
    const userscriptSource = fs.readFileSync(
        path.join(__dirname, '..', 'YTKit.user.js'),
        'utf8'
    );

    const fnYtkit = extractNormalizeFn(ytkitSource, 'extension/ytkit.js');
    const fnBg = extractNormalizeFn(backgroundSource, 'extension/background.js');
    const fnUser = extractNormalizeFn(userscriptSource, 'YTKit.user.js');

    // Parity check: every input shape must produce the same output across
    // all three implementations. If a site drifts, this test trips.
    const cases = [
        ['undefined', undefined, 0],
        ['null', null, 0],
        ['empty string', '', 0],
        ['zero', 0, 0],
        ['negative int', -42, 0],
        ['negative float', -1.5, 0],
        ['positive int', 1700000000, 1700000000],
        ['positive float (preserved)', 1700000000.123, 1700000000.123],
        ['NaN', NaN, 0],
        ['Infinity', Infinity, 0],
        ['-Infinity', -Infinity, 0],
        ['bogus string', 'bogus', 0],
        ['numeric string', '1700000000', 1700000000],
        ['boolean true (Number(true)===1, treated as 1s past epoch — quirky but consistent)', true, 1],
        ['boolean false', false, 0],
    ];

    for (const [label, input, expected] of cases) {
        const a = fnYtkit(input);
        const b = fnBg(input);
        const c = fnUser(input);
        assert.equal(a, expected, `ytkit.js: ${label} must return ${expected}, got ${a}`);
        assert.equal(b, expected, `background.js: ${label} must return ${expected}, got ${b}`);
        assert.equal(c, expected, `YTKit.user.js: ${label} must return ${expected}, got ${c}`);
    }
});

test('normalizeCookieExpiry replaces every prior c.expirationDate || 0 site', () => {
    const userscriptSource = fs.readFileSync(
        path.join(__dirname, '..', 'YTKit.user.js'),
        'utf8'
    );

    // The legacy `c.expirationDate || 0` pattern must be gone everywhere
    // we ship. Catches the case where a future PR adds back a fourth
    // inlined site.
    for (const [label, src] of [
        ['extension/ytkit.js', ytkitSource],
        ['extension/background.js', backgroundSource],
        ['YTKit.user.js', userscriptSource],
    ]) {
        assert.doesNotMatch(
            src,
            /expirationDate:\s*c\.expirationDate\s*\|\|\s*0/,
            `${label} must use normalizeCookieExpiry instead of "c.expirationDate || 0"`
        );
        assert.match(
            src,
            /expirationDate:\s*normalizeCookieExpiry\(c\.expirationDate\)/,
            `${label} must call normalizeCookieExpiry on c.expirationDate at the cookie-mapper site`
        );
    }
});

// ── v1.0.7 H7: theater-split divider-drag mid-SPA-nav cleanup ──
//
// The divider-drag handler in theater-split.user.js attaches mousemove +
// mouseup to `window` and a position:fixed shield to document.body. The
// only cleanup path was the mouseup handler — but if a yt-navigate-finish
// fires between mousedown and mouseup, teardown() would remove the split
// wrapper while leaving the window listeners + dragShield orphaned. They
// would then fire closures over the disposed wrapper indefinitely.
//
// Fix: hoist drag handles to module-scope state (dragShield, dragOnMove,
// dragOnUp), provide an idempotent abortDividerDrag() helper, and call
// it from teardown() so SPA nav mid-drag cleans up the orphan listeners.

test('theater-split bumps to v1.0.7 with abortDividerDrag in teardown', () => {
    const tsSource = fs.readFileSync(
        path.join(__dirname, '..', 'theater-split.user.js'),
        'utf8'
    );
    assert.match(tsSource, /@version\s+1\.0\.7/, 'theater-split userscript must declare v1.0.7');
    assert.match(tsSource, /function abortDividerDrag\(\)/,
        'abortDividerDrag helper must be defined');
    // Module-scope state hoisted (was previously closure-local in initDividerDrag).
    assert.match(tsSource, /let dragShield\s*=\s*null/,
        'dragShield must be hoisted to module scope so teardown can reach it');
    assert.match(tsSource, /let dragOnMove\s*=\s*null/,
        'dragOnMove must be hoisted to module scope');
    assert.match(tsSource, /let dragOnUp\s*=\s*null/,
        'dragOnUp must be hoisted to module scope');
});

test('theater-split teardown calls abortDividerDrag to handle SPA-nav mid-drag', () => {
    const tsSource = fs.readFileSync(
        path.join(__dirname, '..', 'theater-split.user.js'),
        'utf8'
    );
    const teardownStart = tsSource.indexOf('function teardown()');
    assert.ok(teardownStart > -1, 'teardown function must exist');
    const teardownEnd = tsSource.indexOf('// ── Activate', teardownStart);
    assert.ok(teardownEnd > teardownStart, 'teardown must have a recognizable end');
    const teardownBody = tsSource.slice(teardownStart, teardownEnd);

    assert.match(teardownBody, /abortDividerDrag\(\)/,
        'teardown must call abortDividerDrag so a mid-drag SPA navigation does not orphan window listeners or the dragShield');
});

// ── v3.20.4 H9: EXT_FETCH controller.abort() consistency on size limits ──
//
// Five "responded = true" early-return paths in EXT_FETCH:
//   1. timeout → already aborted
//   2. redirect to non-allowlisted origin → already aborted
//   3. content-length declared > MAX_RESPONSE_BYTES → already aborted
//   4. streamed body exceeds limit while reading → reader.cancel() only,
//      no controller.abort() — fetch could keep reading until natural EOF
//   5. non-streaming body exceeds limit after measuring → no abort either
//
// (4) and (5) leak: we've already responded to the content script, but the
// SW continues to consume bandwidth and a socket for a response we will
// never use. v3.20.4 adds controller.abort() to both paths so all five
// early-returns are consistent.

// ── v3.20.4 H10: scripts/check-versions.js — pre-push version drift check ──
//
// .github/workflows/build.yml validates version-string consistency only
// after a tag push. A developer who bumps most sources locally
// (e.g. forgets to run `node sync-userscript.js`) won't notice until CI
// fails post-tag. H10 ports the same check into a local `npm run check`
// hook so drift is caught pre-push.

test('check-versions.js exists and is wired into npm run check', () => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'check-versions.js');
    assert.ok(fs.existsSync(scriptPath), 'scripts/check-versions.js must exist');
    const scriptSource = fs.readFileSync(scriptPath, 'utf8');
    // Confirm every canonical version surface is read, including the lockfile.
    assert.match(scriptSource, /readPackageVersion/, 'must read package.json version');
    assert.match(scriptSource, /readPackageLockVersion/, 'must read package-lock.json version');
    assert.match(scriptSource, /readManifestVersion/, 'must read extension/manifest.json version');
    assert.match(scriptSource, /readYtkitVersion/, 'must read extension/ytkit.js YTKIT_VERSION');
    assert.match(scriptSource, /readUserscriptVersion/, 'must read YTKit.user.js @version');
    // Confirm the empty-string guard fix (earlier draft had .includes('') bug).
    assert.match(scriptSource, /sources\[0\]\.value\s*!==\s*['"]{2}/,
        "Empty-string guard must use !== '' (not .includes('') — which would always evaluate true and silently break the happy path)");

    // Confirm npm run check chains both syntax + version validation.
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.match(pkg.scripts.check || '', /check-versions/,
        '`npm run check` must include node scripts/check-versions.js after check-syntax');
});

test('check-versions.js runs cleanly against the current tree', () => {
    // Spawn the script and capture exit code. Should be 0 — all four
    // sources are kept in sync by the release workflow + the local
    // sync-userscript.js helper.
    const { execFileSync } = require('child_process');
    const scriptPath = path.join(__dirname, '..', 'scripts', 'check-versions.js');
    let exitCode = 0;
    try {
        execFileSync(process.execPath, [scriptPath], { stdio: 'pipe' });
    } catch (e) {
        exitCode = e.status || 1;
    }
    assert.equal(exitCode, 0,
        'check-versions must pass on a clean tree — if this fails, version drift exists somewhere in the canonical version surfaces');
});

test('build-extension.js updates package-lock version during --bump', () => {
    const buildSource = fs.readFileSync(
        path.join(__dirname, '..', 'build-extension.js'),
        'utf8'
    );
    assert.match(buildSource, /package-lock\.json/,
        'build-extension.js must update package-lock.json during version bumps');
    assert.match(buildSource, /lock\.packages\[''\]\.version\s*=\s*version/,
        'build-extension.js must update packages[""].version so lockfile drift cannot ship');
});

test('check-syntax dynamically covers every extension and script JS file', () => {
    const scriptSource = fs.readFileSync(
        path.join(__dirname, '..', 'scripts', 'check-syntax.js'),
        'utf8'
    );
    assert.match(scriptSource, /function\s+listJsFiles\s*\(/,
        'check-syntax.js must recursively discover JS files instead of carrying a stale hand list');
    for (const expectedDir of ["'extension'", "'scripts'"]) {
        assert.ok(scriptSource.includes(expectedDir),
            `check-syntax.js must scan ${expectedDir}`);
    }
    assert.doesNotMatch(scriptSource, /core\/storage-manager\.js/,
        'check-syntax.js must not regress to hard-coded recently extracted core modules');
});

test('EXT_FETCH aborts the controller on every size-limit early return path', () => {
    const fetchHandlerStart = backgroundSource.indexOf('const controller = new AbortController()');
    assert.ok(fetchHandlerStart > -1, 'EXT_FETCH AbortController must exist');
    const fetchHandlerEnd = backgroundSource.indexOf('return true; // keep sendResponse channel open', fetchHandlerStart);
    assert.ok(fetchHandlerEnd > fetchHandlerStart, 'EXT_FETCH handler must terminate');
    const handler = backgroundSource.slice(fetchHandlerStart, fetchHandlerEnd);

    // Count abort sites — should be at least 4 (timeout + redirect + content-length
    // + streamed-too-large + non-streaming-too-large = 5 total, but timeout fires
    // outside the success branch).
    const abortMatches = handler.match(/controller\.abort\(\)/g) || [];
    assert.ok(
        abortMatches.length >= 5,
        `Expected ≥5 controller.abort() call sites covering timeout + redirect + content-length + streamed-too-large + non-streaming-too-large; found ${abortMatches.length}`
    );

    // Pin the streamed-too-large block to require BOTH reader.cancel AND
    // controller.abort. reader.cancel alone closes the reader but doesn't
    // always tear down the network request.
    const streamErr = handler.indexOf('Response body too large');
    assert.ok(streamErr > -1, 'streamed too-large branch must exist');
    // Walk back from the error to find the opening of the if-block.
    const blockStart = handler.lastIndexOf('if (received > MAX_RESPONSE_BYTES)', streamErr);
    assert.ok(blockStart > -1, 'streamed too-large guard must exist');
    const blockBody = handler.slice(blockStart, streamErr + 200);
    assert.match(blockBody, /reader\.cancel\(\)/,
        'streamed too-large path must still call reader.cancel()');
    assert.match(blockBody, /controller\.abort\(\)/,
        'streamed too-large path must ALSO call controller.abort() so the SW socket is freed');

    // Pin the non-streaming too-large branch (text = await resp.text() path).
    const measuredBytesIdx = handler.indexOf('measuredBytes > MAX_RESPONSE_BYTES');
    assert.ok(measuredBytesIdx > -1, 'non-streaming too-large guard must exist');
    const nonStreamingBlock = handler.slice(measuredBytesIdx, measuredBytesIdx + 400);
    assert.match(nonStreamingBlock, /controller\.abort\(\)/,
        'non-streaming too-large path must call controller.abort() to free the SW + socket');
});

test('theater-split divider mousedown clears any pre-existing drag state defensively', () => {
    const tsSource = fs.readFileSync(
        path.join(__dirname, '..', 'theater-split.user.js'),
        'utf8'
    );
    const initStart = tsSource.indexOf('function initDividerDrag');
    assert.ok(initStart > -1, 'initDividerDrag must exist');
    // mousedown handler must clear any orphan drag before starting a new one.
    const mdStart = tsSource.indexOf("'mousedown'", initStart);
    const fnEnd = tsSource.indexOf('function ', mdStart + 1);
    const handlerBody = tsSource.slice(mdStart, fnEnd);
    assert.match(handlerBody, /abortDividerDrag\(\)/,
        'mousedown must defensively call abortDividerDrag before starting a new drag, so re-entrancy or orphans cannot stack listeners');
});

test('normalizeCookieExpiry produces wire-compatible output with the Python downloader', () => {
    // The Python downloader at astra_downloader/astra_downloader.py:830-838
    // parses raw_expiry as `int(float(x)) if x not in (None, "") else 0`,
    // clamping negatives to 0. The JS helper must produce values that
    // survive that round-trip identically. Test the boundary cases:
    //   - JS sends 0 → Python gets 0 → wire emits "0" (session marker)
    //   - JS sends positive double → Python truncates to int, same int
    //   - JS sends 0 for any non-positive-finite-number → Python sees 0
    const fn = extractNormalizeFn(ytkitSource, 'extension/ytkit.js');
    // Mimic Python's `int(float(x))` truncation:
    const pythonRoundTrip = (jsOutput) => Math.trunc(Number(jsOutput));

    assert.equal(pythonRoundTrip(fn(undefined)), 0);
    assert.equal(pythonRoundTrip(fn(null)), 0);
    assert.equal(pythonRoundTrip(fn(-1)), 0);
    assert.equal(pythonRoundTrip(fn(1700000000)), 1700000000);
    assert.equal(pythonRoundTrip(fn(1700000000.999)), 1700000000);  // Python truncates
});

// ── Pass 17 NX1: i18n scaffold ──

test('_locales/en/messages.json exists and is valid JSON', () => {
    const localesPath = path.join(__dirname, '..', 'extension', '_locales', 'en', 'messages.json');
    assert.ok(fs.existsSync(localesPath), '_locales/en/messages.json must exist');
    let parsed;
    assert.doesNotThrow(
        () => { parsed = JSON.parse(fs.readFileSync(localesPath, 'utf8')); },
        '_locales/en/messages.json must be valid JSON'
    );
    assert.equal(typeof parsed, 'object', 'Parsed messages must be an object');
});

test('_locales/en/messages.json contains the three required manifest-level keys', () => {
    // v4.5.3: toggleControlCenterDesc was removed along with the entire
    // `commands` keyboard-shortcut surface (no keyboard shortcuts rule).
    const localesPath = path.join(__dirname, '..', 'extension', '_locales', 'en', 'messages.json');
    const messages = JSON.parse(fs.readFileSync(localesPath, 'utf8'));
    for (const key of ['extName', 'extDescription', 'extActionTitle']) {
        assert.ok(Object.prototype.hasOwnProperty.call(messages, key),
            `messages.json must define "${key}"`);
        assert.equal(typeof messages[key].message, 'string',
            `messages.json["${key}"].message must be a string`);
        assert.ok(messages[key].message.length > 0,
            `messages.json["${key}"].message must not be empty`);
    }
    assert.equal(
        Object.prototype.hasOwnProperty.call(messages, 'toggleControlCenterDesc'),
        false,
        'toggleControlCenterDesc must be absent — the keyboard command was retired in v4.5.3'
    );
});

test('manifest.json uses __MSG_ references for name, description, and action title', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    assert.equal(manifest.name, '__MSG_extName__',
        'manifest.json name must use __MSG_extName__ i18n reference');
    assert.equal(manifest.description, '__MSG_extDescription__',
        'manifest.json description must use __MSG_extDescription__ i18n reference');
    assert.equal(manifest.action?.default_title, '__MSG_extActionTitle__',
        'manifest.json action.default_title must use __MSG_extActionTitle__ i18n reference');
    assert.equal(manifest.commands, undefined,
        'manifest.json must NOT declare a commands block (no keyboard shortcuts)');
    assert.equal(manifest.default_locale, 'en',
        'manifest.json must declare default_locale: "en" alongside __MSG_ references');
});

test('check-i18n.js exists and all __MSG_ references in manifest resolve', () => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'check-i18n.js');
    assert.ok(fs.existsSync(scriptPath), 'scripts/check-i18n.js must exist');
    const { execFileSync } = require('child_process');
    let exitCode = 0;
    try {
        execFileSync(process.execPath, [scriptPath], { stdio: 'pipe' });
    } catch (e) {
        exitCode = e.status || 1;
    }
    assert.equal(exitCode, 0,
        'check-i18n must exit 0 on the current tree — all __MSG_ and getMessage() keys must resolve');
});

// ── Pass 17 L9: DiagnosticLog clear button ──

test('popup.html carries a Clear button in the health banner', () => {
    assert.match(popupHtmlSource, /id="health-clear-btn"/,
        'Health banner must include a Clear button with id="health-clear-btn"');
    assert.match(popupHtmlSource, /class="health-clear-btn"/,
        'Clear button must carry the health-clear-btn CSS class');
    assert.match(popupHtmlSource, /aria-label="Clear diagnostic log"/,
        'Clear button must have an accessible aria-label for screen readers');
});

test('popup.js defines clearDiagnosticLog and wires the health-clear-btn', () => {
    assert.match(popupSource, /async function clearDiagnosticLog\s*\(\s*\)/,
        'popup.js must define clearDiagnosticLog()');
    assert.match(popupSource, /const healthClearBtn\s*=\s*\$\s*\(\s*'#health-clear-btn'\s*\)/,
        'popup.js must hold a reference to health-clear-btn');
    assert.match(popupSource, /healthClearBtn\.addEventListener\s*\(\s*'click'/,
        'popup.js bootstrap must wire the click listener on healthClearBtn');
    // Clear path must ask for confirmation before deleting _errors.
    const clearFnStart = popupSource.indexOf('async function clearDiagnosticLog');
    assert.ok(clearFnStart > -1, 'clearDiagnosticLog must exist');
    const clearFnBody = popupSource.slice(clearFnStart, clearFnStart + 1000);
    assert.match(clearFnBody, /confirmAction\s*\(/,
        'clearDiagnosticLog must present a confirmation dialog before clearing');
    assert.match(clearFnBody, /delete settings\._errors/,
        'clearDiagnosticLog must delete _errors from the stored settings object');
    assert.match(clearFnBody, /renderHealthBanner\s*\(\s*null\s*\)/,
        'clearDiagnosticLog must hide the banner after clearing via renderHealthBanner(null)');
});

test('popup.css carries .health-clear-btn styles with focus-visible outline', () => {
    const cssSource = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.css'),
        'utf8'
    );
    assert.match(cssSource, /\.health-clear-btn\s*\{/,
        '.health-clear-btn CSS rule must exist');
    assert.match(cssSource, /\.health-clear-btn:focus-visible/,
        'Clear button must carry a focus-visible outline for keyboard users');
});

// ── Pass 17 L1: ESLint SW addListener rule ──

test('eslint.config.js exists and registers the custom no-post-await-addlistener rule', () => {
    const configPath = path.join(__dirname, '..', 'eslint.config.js');
    assert.ok(fs.existsSync(configPath), 'eslint.config.js must exist');
    const configSource = fs.readFileSync(configPath, 'utf8');
    assert.match(configSource, /no-post-await-addlistener/,
        'eslint.config.js must reference the no-post-await-addlistener rule');
    assert.match(configSource, /extension\/background\.js/,
        'eslint.config.js must target extension/background.js');
});

test('scripts/eslint-rules/no-post-await-addlistener.js is loadable and has correct meta', () => {
    const rulePath = path.join(__dirname, '..', 'scripts', 'eslint-rules', 'no-post-await-addlistener.js');
    assert.ok(fs.existsSync(rulePath), 'Rule file must exist');
    const rule = require(rulePath);
    assert.equal(typeof rule.create, 'function', 'Rule must export a create function');
    assert.equal(rule.meta.type, 'problem', 'Rule must be typed as "problem"');
    assert.ok(rule.meta.messages.postAwaitAddListener,
        'Rule must define the postAwaitAddListener message ID');
});

test('npm run lint passes cleanly on extension/background.js', () => {
    const result = runNodeCommand([
        path.join(__dirname, '..', 'node_modules', 'eslint', 'bin', 'eslint.js'),
        'extension/background.js'
    ]);
    assert.equal(result.status, 0,
        'npm run lint must pass cleanly — all existing addListener calls must be at top level');
});

// ── Pass 18 L7: WCAG 2.2 a11y audit ──

test('popup carries dialog semantics with focus trap, Tab wrap, Escape close', () => {
    assert.match(
        popupHtmlSource,
        /<body[^>]*role="dialog"[^>]*aria-modal="true"/,
        'popup body must have role="dialog" and aria-modal="true"'
    );
    assert.match(
        popupHtmlSource,
        /aria-labelledby="popup-title"/,
        'popup must be labelled by popup-title element'
    );
    assert.match(
        popupSource,
        /const FOCUSABLE_SELECTOR/,
        'popup.js must define FOCUSABLE_SELECTOR for focus trap'
    );
    assert.match(
        popupSource,
        /function handlePopupDialogKeydown\s*\(/,
        'popup.js must define handlePopupDialogKeydown for Tab/Shift-Tab wrap and Escape close'
    );
});

test('all popup buttons carry aria-label or visible text for a11y', () => {
    const dynamicButtonIds = new Set(['confirm-cancel-btn', 'confirm-accept-btn']);
    const buttons = [...popupHtmlSource.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
    assert.ok(buttons.length >= 10, 'popup.html should expose every static button to the audit');
    for (const [, attrs, body] of buttons) {
        const id = (attrs.match(/\bid="([^"]+)"/) || [])[1] || '(anonymous button)';
        const hasAriaLabel = /\baria-label="[^"]+"/.test(attrs);
        const hasVisibleText = body.replace(/<[^>]+>/g, '').replace(/&times;/g, 'x').trim().length > 0;
        const hasDynamicText = dynamicButtonIds.has(id) && new RegExp(`${id.replace(/-/g, '[-]')}|${id}`).test(popupHtmlSource)
            && (id === 'confirm-cancel-btn' ? /cancelBtn\.textContent\s*=/.test(popupSource) : /acceptBtn\.textContent\s*=/.test(popupSource));
        assert.ok(
            hasAriaLabel || hasVisibleText || hasDynamicText,
            `Button ${id} must have aria-label, visible text, or audited dynamic text`
        );
    }
});

test('popup CSS includes focus-visible styles for keyboard navigation', () => {
    const cssSource = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.css'),
        'utf8'
    );
    for (const selector of [
        'button:focus-visible',
        'input:focus-visible',
        'textarea:focus-visible',
        '.toggle:focus-visible',
        '[role="switch"]:focus-visible'
    ]) {
        assert.ok(
            cssSource.includes(selector),
            `${selector} must be defined in popup.css for keyboard focus visibility`
        );
    }
});

test('health banner colors pass WCAG AA contrast (4.5:1 for text)', () => {
    const result = runNodeCommand([path.join(__dirname, '..', 'scripts', 'check-contrast.js')]);
    assert.equal(result.status, 0,
        'npm run audit:contrast must pass — all health banner colors must meet WCAG AA');
});

test('npm run audit:a11y reports no popup a11y issues', () => {
    const result = runNodeCommand([path.join(__dirname, '..', 'scripts', 'audit-popup-a11y.js')]);
    assert.equal(result.status, 0,
        'npm run audit:a11y must pass — all buttons must be labeled, dialog semantics must be present');
});

test('popup selector-health stats are rendered without template innerHTML', () => {
    assert.match(popupSource, /function\s+appendSelectorMetric\s*\(/,
        'popup.js must use a DOM helper for selector-health metrics');
    assert.doesNotMatch(popupSource, /tmpl\.innerHTML\s*=/,
        'selector-health metrics must not use template.innerHTML for mixed text/spans');
});

// ── v3.23.0 NX5: ARIA live region for SponsorBlock skip + DeArrow replace ──

test('announceA11y helper exists and uses a polite live region', () => {
    // The helper must declare a `role="status"` aria-live="polite"
    // region so screen readers queue the message rather than
    // interrupt. Aria-atomic ensures the full message reads.
    assert.match(ytkitSource, /function\s+announceA11y\s*\(/,
        'announceA11y helper must exist');
    const start = ytkitSource.indexOf('function announceA11y');
    const block = ytkitSource.slice(start, start + 2000);
    assert.match(block, /aria-live['"]?\s*,\s*['"]polite['"]/,
        'announceA11y must use aria-live=polite');
    assert.match(block, /role['"]?\s*,\s*['"]status['"]/,
        'announceA11y must use role=status');
    assert.match(block, /aria-atomic/,
        'announceA11y must use aria-atomic so the full message is announced');
});

test('sponsorBlock skip announces via aria-live and never via a toast', () => {
    // Toasts over the video were removed in an earlier pass as
    // distracting. The aria-live announcement replaces that signal
    // for assistive-tech users only — sighted users see no change.
    const skipStart = ytkitSource.indexOf('_checkSkip()');
    assert.ok(skipStart > -1, '_checkSkip method must exist');
    const block = ytkitSource.slice(skipStart, skipStart + 3000);
    assert.match(block, /announceA11y\(/,
        '_checkSkip must announce skips via announceA11y for SR users');
    // SB skips must NOT call showToast inside _checkSkip — that would
    // regress the v3.20.x decision to remove distracting toasts.
    const showToastCount = (block.match(/showToast\(/g) || []).length;
    assert.equal(showToastCount, 0,
        '_checkSkip must not call showToast — toasts over the video were intentionally removed');
});

test('DeArrow watch-page title replacement announces via aria-live', () => {
    // Only the watch-page primary title gets announced — grid thumbnails
    // would spam the screen reader. Pin both the announcement and the
    // gating condition.
    const deArrowStart = ytkitSource.indexOf('Show original title on hover if setting enabled');
    assert.ok(deArrowStart > -1, 'DeArrow primary-title block must exist');
    const block = ytkitSource.slice(deArrowStart, deArrowStart + 1500);
    assert.match(block, /announceA11y\(/,
        'DeArrow watch-page replacement must announce via announceA11y');
    assert.match(block, /isWatchPagePath\(\)/,
        'DeArrow announcement must be gated on isWatchPagePath() to avoid grid spam');
});

// ── v3.23.0 N5: CSP connect-src allowlist on extension pages ──

test('extension manifest CSP scopes connect-src to documented host_permissions', () => {
    // Defense-in-depth: a compromised content-script (or a careless future
    // contributor wiring popup.js to off-self origins) should hit CSP
    // friction rather than exfiltrate freely. The allowlist mirrors the
    // manifest host_permissions for popup-originated fetches.
    const manifestSource = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'),
        'utf8',
    );
    const manifest = JSON.parse(manifestSource);
    const csp = manifest.content_security_policy?.extension_pages || '';

    assert.match(csp, /script-src\s+'self'/,
        'CSP must keep script-src self-only');
    assert.match(csp, /object-src\s+'self'/,
        'CSP must keep object-src self-only');
    assert.match(csp, /connect-src\s+'self'/,
        'CSP must declare a connect-src directive starting with self');

    // Required origins that popup.js or the legitimate AI/SponsorBlock /
    // localhost downloader flows may legitimately fetch.
    const requiredOrigins = [
        'https://api.openai.com',
        'https://api.anthropic.com',
        'https://generativelanguage.googleapis.com',
        'https://sponsor.ajay.app',
        'http://127.0.0.1:9751',
        'http://127.0.0.1:11434',
    ];
    for (const origin of requiredOrigins) {
        assert.ok(
            csp.includes(origin),
            `connect-src must include ${origin} so the corresponding host_permission stays usable from extension pages`,
        );
    }

    // Negative assertion: connect-src must NOT be a wildcard.
    assert.ok(!/connect-src[^;]*\*\s*[;'"]/.test(csp),
        'connect-src must not be a wildcard — defeats the purpose');
});

// ── v3.23.0 N3: Reaction Spammer default-OFF + cooldown floor ──

test('reactionSpammer defaults to false in both ytkit.js source and the generated catalog', () => {
    // Brand-new feature; opt-in only. YouTube's automated-behavior heuristics
    // could rate-limit or flag accounts on rapid emoji reactions, so the
    // default must NOT enrol every user without consent.
    const defaultSettings = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'default-settings.json'),
        'utf8',
    ));
    assert.equal(defaultSettings.reactionSpammer, false,
        'default-settings.json must default reactionSpammer to false');
    assert.equal(defaultSettings._reactionSpammerAck, false,
        'default-settings.json must default _reactionSpammerAck to false');

    // Pin the source-side default too, so the generator can never produce
    // true again. A regex slice is sufficient — we're locking the literal.
    assert.match(
        ytkitSource,
        /reactionSpammer:\s*false,/,
        'ytkit.js defaults must declare reactionSpammer: false',
    );
});

test('SETTINGS_VERSION is 7 and migration 7 force-resets reactionSpammer to false', () => {
    assert.match(
        ytkitSource,
        /SETTINGS_VERSION:\s*7,/,
        'ytkit.js settingsManager must declare SETTINGS_VERSION: 7',
    );
    // The v7 migration must reset reactionSpammer to false and reset the
    // ack flag so the warning toast re-fires on the next opt-in.
    const migrationStart = ytkitSource.indexOf('7: (s) =>');
    assert.ok(migrationStart > -1, 'migration 7 must exist');
    const migrationBlock = ytkitSource.slice(migrationStart, migrationStart + 1500);
    assert.match(migrationBlock, /s\.reactionSpammer\s*=\s*false/,
        'migration 7 must explicitly reset reactionSpammer to false');
    assert.match(migrationBlock, /s\._reactionSpammerAck\s*=\s*false/,
        'migration 7 must reset _reactionSpammerAck to false');
});

test('reaction spammer panel interval is clamped to a 500 ms minimum floor', () => {
    // Rapid reactions risk YouTube account flagging; the 50 ms floor that
    // shipped in v3.22.0 was too aggressive. Pin the floor at 500 ms.
    assert.match(
        ytkitSource,
        /_INTERVAL_MIN_MS:\s*500,/,
        'ytkit.js reaction-spammer feature must declare _INTERVAL_MIN_MS: 500',
    );
    // The userscript companion clamps the same floor — pin its constant too.
    const userscriptSource = fs.readFileSync(
        path.join(__dirname, '..', 'YT_Reaction_Spammer.user.js'),
        'utf8',
    );
    assert.match(
        userscriptSource,
        /const\s+MIN_INTERVAL_MS\s*=\s*500;/,
        'YT_Reaction_Spammer.user.js must declare MIN_INTERVAL_MS = 500',
    );
});

test('reaction spammer panel surfaces a one-shot rate-limit warning toast on first open', () => {
    // First-time launcher click warns the user about YouTube's heuristics;
    // _reactionSpammerAck is persisted so the toast doesn't re-fire forever.
    const toastStart = ytkitSource.indexOf('_maybeShowFirstUseWarning');
    assert.ok(toastStart > -1, 'reaction spammer must expose _maybeShowFirstUseWarning');
    const block = ytkitSource.slice(toastStart, toastStart + 1500);
    assert.match(block, /_reactionSpammerAck/,
        'first-use warning must read appState.settings._reactionSpammerAck');
    assert.match(block, /showToast\(/,
        'first-use warning must call showToast');
    assert.match(block, /rate-limit|rate\s*limit/i,
        'first-use warning message must mention rate-limiting');
});

// ── v3.25.0 P1: Predicate sandbox safety invariants ──

test('PredicateSandbox uses no eval / Function / with anywhere on its path', () => {
    // The sandbox is Option C from docs/predicate-sandbox-investigation.md —
    // expression-only AST walker. If `eval(`, `new Function(`, or `with (`
    // appear inside the implementation the safety promise is broken.
    // iter-7 N11: the canonical source is now extension/core/predicate-sandbox.js.
    const block = predicateSandboxSource;
    assert.ok(!/\beval\s*\(/.test(block),
        'PredicateSandbox must not call eval()');
    assert.ok(!/new\s+Function\s*\(/.test(block),
        'PredicateSandbox must not use new Function()');
    assert.ok(!/\bwith\s*\(/.test(block),
        'PredicateSandbox must not use with()');
});

test('PredicateSandbox enforces ReDoS guard on user-supplied match/test patterns', () => {
    const block = predicateSandboxSource;
    assert.match(block, /hasUnsafeQuantifiers/,
        'PredicateSandbox must expose a ReDoS guard helper');
    assert.match(block, /nested quantifiers \(ReDoS risk\)/,
        'PredicateSandbox must reject regex patterns with nested quantifiers');
});

test('PredicateSandbox compile returns ok:false with error position on parse failure', () => {
    const block = predicateSandboxSource;
    assert.match(block, /ok:\s*false[\s,]*error/,
        'compile() must return an { ok:false, error, position } shape on failure');
    assert.match(block, /position:\s*e instanceof PredicateError/,
        'compile() must surface PredicateError positions to the caller');
});

test('PredicateSandbox runtime budget + circuit breaker auto-disable', () => {
    const block = predicateSandboxSource;
    assert.match(block, /BUDGET_MS\s*=\s*5/,
        'Per-card budget must be 5 ms');
    assert.match(block, /ERROR_CIRCUIT\s*=\s*10/,
        'Circuit must open after 10 consecutive errors');
    assert.match(block, /circuitOpen\s*=\s*true/,
        'circuitOpen flag must be flipped when the budget or error gate trips');
});

test('ytkit.js consumes the PredicateSandbox factory and wires DebugManager telemetry (iter-7 N11)', () => {
    // After the iter-7 M-phase #2 extraction, ytkit.js no longer holds
    // the PredicateSandbox implementation — it constructs a sandbox via
    // the core factory and forwards budget/circuit telemetry through
    // DebugManager.log. A legacy fallback shape is retained so a missing
    // core module surfaces as a permanently-failing compile() rather
    // than crashing featureSet boot.
    assert.match(
        ytkitSource,
        /globalThis\.YTKitCore\.createPredicateSandbox\(\{[\s\S]*?debugLog:[\s\S]*?DebugManager\.log/,
        'ytkit.js must construct PredicateSandbox via createPredicateSandbox with a DebugManager-backed debugLog'
    );
    assert.match(
        ytkitSource,
        /PredicateSandbox core module not loaded/,
        'ytkit.js must keep the defensive fallback error string so featureSet boots when core/predicate-sandbox.js is missing'
    );
    // Manifest load-order: predicate-sandbox.js must load BEFORE ytkit.js
    // in every content_scripts entry that includes ytkit.js.
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'),
        'utf8'
    ));
    for (const entry of manifest.content_scripts || []) {
        if (!Array.isArray(entry.js)) continue;
        if (!entry.js.includes('ytkit.js')) continue;
        const sandboxIdx = entry.js.indexOf('core/predicate-sandbox.js');
        const ytkitIdx = entry.js.indexOf('ytkit.js');
        assert.ok(
            sandboxIdx > -1 && sandboxIdx < ytkitIdx,
            'core/predicate-sandbox.js must precede ytkit.js in every content_scripts entry'
        );
    }
});

test('videoHider integrates predicate evaluator between metadata and duration checks', () => {
    const idx = ytkitSource.indexOf('_getPredicateEvaluator()');
    assert.ok(idx > -1, 'videoHider must call _getPredicateEvaluator');
    const ctxIdx = ytkitSource.indexOf('_buildPredicateCtx(');
    assert.ok(ctxIdx > -1, 'videoHider must build a ctx surface for the predicate');
    // The ctx must be frozen at the call site per the investigation doc.
    const buildSig = ytkitSource.indexOf('_buildPredicateCtx(element, videoId, channelInfo)');
    assert.ok(buildSig > -1, '_buildPredicateCtx must accept (element, videoId, channelInfo)');
    const buildBlock = ytkitSource.slice(buildSig, buildSig + 4000);
    assert.match(buildBlock, /Object\.freeze\(ctx\)/,
        '_buildPredicateCtx must return a frozen ctx object');
});

// ── v3.25.0 P1: Comment filter manager invariants ──

test('commentFilterManager rejects ReDoS regex inputs at compile time', () => {
    const start = ytkitSource.indexOf("id: 'commentFilterManager'");
    assert.ok(start > -1, 'commentFilterManager feature must exist');
    const block = ytkitSource.slice(start, start + 6000);
    assert.match(block, /Regex rejected: nested quantifiers \(ReDoS risk\)/,
        'commentFilterManager must log the ReDoS rejection reason');
    assert.match(block, /\(adjacent \|\| groupInner\)/,
        'commentFilterManager must check both adjacent and group-inner nested quantifiers');
});

test('commentFilterManager processes mutation addedNodes only, never full-document scans on tick', () => {
    const start = ytkitSource.indexOf("id: 'commentFilterManager'");
    const block = ytkitSource.slice(start, start + 9000);
    // The mutation rule callback must loop addedNodes only — not call
    // querySelectorAll on document.
    assert.match(block, /addMutationRule\(this\.id/,
        'commentFilterManager must register a mutation rule');
    const mutBlock = block.slice(block.indexOf('addMutationRule'));
    assert.ok(!/document\.querySelectorAll/.test(mutBlock.slice(0, 800)),
        'commentFilterManager mutation rule must not call document.querySelectorAll on every tick');
    assert.match(mutBlock, /m\.addedNodes/,
        'commentFilterManager mutation rule must process addedNodes only');
});

test('commentFilterManager destroy() restores hidden threads and clears compiled rule cache', () => {
    const start = ytkitSource.indexOf("id: 'commentFilterManager'");
    const block = ytkitSource.slice(start, start + 8000);
    const destroyIdx = block.indexOf('destroy()');
    assert.ok(destroyIdx > -1, 'commentFilterManager must define destroy()');
    const destroyBlock = block.slice(destroyIdx, destroyIdx + 1500);
    assert.match(destroyBlock, /data-ytkit-comment-filter-hidden="1"/,
        'destroy() must unhide previously hidden threads');
    assert.match(destroyBlock, /this\._compiledRules\s*=\s*null/,
        'destroy() must clear the compiled rules cache');
});

// ── v3.25.0 P1: Bulk card actions invariants ──

test('bulkCardActions delegates hide/allow to videoHider rather than duplicating storage', () => {
    const start = ytkitSource.indexOf("id: 'bulkCardActions'");
    assert.ok(start > -1, 'bulkCardActions feature must exist');
    const block = ytkitSource.slice(start, start + 16000);
    assert.match(block, /getFeatureById\('hideVideosFromHome'\)/,
        'bulkCardActions must reuse the videoHider feature for storage');
    assert.match(block, /vh\?\._addHiddenVideos/,
        'bulkCardActions must defer to videoHider._addHiddenVideos');
    assert.match(block, /vh\?\._addAllowedVideos/,
        'bulkCardActions must defer to videoHider._addAllowedVideos');
});

test('bulkCardActions destroy() removes its toggle button, action bar, and document click listener', () => {
    const start = ytkitSource.indexOf("id: 'bulkCardActions'");
    const block = ytkitSource.slice(start, start + 16000);
    const destroyIdx = block.indexOf('destroy()');
    assert.ok(destroyIdx > -1, 'bulkCardActions must define destroy()');
    const destroyBlock = block.slice(destroyIdx, destroyIdx + 1500);
    assert.match(destroyBlock, /removeEventListener\('click'/,
        'destroy() must remove the document click listener');
    assert.match(destroyBlock, /_toggleBtn\?\.remove\(\)/,
        'destroy() must remove the toggle button');
    assert.match(destroyBlock, /_actionBar\?\.remove\(\)/,
        'destroy() must remove the action bar');
});

// ── v3.25.0 P1: Feed Triage profile invariants ──

test('feedTriageProfile backs up prior values before applying the recipe', () => {
    const start = ytkitSource.indexOf("id: 'feedTriageProfile'");
    assert.ok(start > -1, 'feedTriageProfile feature must exist');
    const block = ytkitSource.slice(start, start + 6000);
    assert.match(block, /_RECIPE:\s*\{/,
        'feedTriageProfile must declare a recipe object');
    assert.match(block, /_BACKUP_KEY:\s*'ytkit-feed-triage-backup'/,
        'feedTriageProfile must persist a backup under a stable storage key');
    assert.match(block, /backup\[key\]\s*=\s*appState\.settings\[key\]/,
        'feedTriageProfile must snapshot current settings before mutating them');
});

test('feedTriageProfile destroy() restores prior values from the backup snapshot', () => {
    const start = ytkitSource.indexOf("id: 'feedTriageProfile'");
    const block = ytkitSource.slice(start, start + 6000);
    const destroyIdx = block.indexOf('destroy()');
    assert.ok(destroyIdx > -1, 'feedTriageProfile must define destroy()');
    const destroyBlock = block.slice(destroyIdx, destroyIdx + 800);
    assert.match(destroyBlock, /this\._restore\(\)/,
        'destroy() must call _restore() when a backup is present');
});

// ── v3.26.0 P1: Player control superset invariants ──

test('videoScreenshot honors the format setting (PNG/JPEG/WebP)', () => {
    // _getScreenshotFormat reads the user's downloadScreenshotFormat setting and
    // returns { mime, ext }. _capture passes mime through _blobFromCanvas.
    const start = ytkitSource.indexOf('_getScreenshotFormat()');
    assert.ok(start > -1, 'videoScreenshot must declare _getScreenshotFormat()');
    const block = ytkitSource.slice(start, start + 1200);
    assert.match(block, /'image\/jpeg'/,
        '_getScreenshotFormat must recognize JPEG');
    assert.match(block, /'image\/webp'/,
        '_getScreenshotFormat must recognize WebP');
    assert.match(block, /downloadScreenshotFormat/,
        '_getScreenshotFormat must read appState.settings.downloadScreenshotFormat');

    // _capture must thread the mime through _blobFromCanvas + clipboard helper.
    const capIdx = ytkitSource.indexOf('async _capture()');
    const capBlock = ytkitSource.slice(capIdx, capIdx + 2500);
    assert.match(capBlock, /_blobFromCanvas\(canvas,\s*mime\)/,
        '_capture must pass the chosen mime into _blobFromCanvas');
    assert.match(capBlock, /_copyBlobToClipboard\(blob,\s*mime\)/,
        '_capture must pass mime into _copyBlobToClipboard');
});

test('videoScreenshot bakes captions into the canvas when downloadSubtitlesWithScreenshot is on', () => {
    const captionsIdx = ytkitSource.indexOf('_drawCaptionsOntoCanvas(');
    assert.ok(captionsIdx > -1, 'videoScreenshot must declare _drawCaptionsOntoCanvas()');
    const block = ytkitSource.slice(captionsIdx, captionsIdx + 2000);
    assert.match(block, /\.ytp-caption-segment/,
        '_drawCaptionsOntoCanvas must read from .ytp-caption-segment');
    // _capture gate
    const gateIdx = ytkitSource.indexOf('_shouldIncludeSubtitles()');
    assert.ok(gateIdx > -1, 'videoScreenshot must declare _shouldIncludeSubtitles()');
});

test('SPEED_OPTIONS expanded to extreme range with at least 18 entries', () => {
    const m = ytkitSource.match(/const SPEED_OPTIONS = \[([^\]]+)\]/);
    assert.ok(m, 'SPEED_OPTIONS must be declared');
    const entries = m[1].split(',').map(s => parseFloat(s.trim())).filter(Number.isFinite);
    assert.ok(entries.length >= 18, `SPEED_OPTIONS must have >= 18 entries, got ${entries.length}`);
    assert.ok(entries.includes(0.25), 'SPEED_OPTIONS must include 0.25x');
    assert.ok(entries.includes(1), 'SPEED_OPTIONS must include 1x');
    assert.ok(entries.some(v => v >= 10), 'SPEED_OPTIONS must include 10x+');
});

test('volumeWheelMode uses passive:false wheel listener with preventDefault and shows visible HUD', () => {
    const start = ytkitSource.indexOf("id: 'volumeWheelMode'");
    assert.ok(start > -1, 'volumeWheelMode feature must exist');
    const block = ytkitSource.slice(start, start + 8000);
    assert.match(block, /addEventListener\('wheel',\s*this\._wheelHandler,\s*\{\s*passive:\s*false\s*\}\)/,
        'volumeWheelMode must register the wheel listener with passive:false (preventDefault required)');
    assert.match(block, /e\.preventDefault\(\)/,
        'volumeWheelMode wheel handler must call preventDefault');
    assert.match(block, /class="ytkit-volume-hint"|className = 'ytkit-volume-hint'/,
        'volumeWheelMode must surface a visible "Scroll to change volume" hint');
});

test('volumeWheelMode destroy() removes the wheel listener, HUD, hint, and style tag', () => {
    const start = ytkitSource.indexOf("id: 'volumeWheelMode'");
    const block = ytkitSource.slice(start, start + 8000);
    const destroyIdx = block.indexOf('destroy()');
    const destroyBlock = block.slice(destroyIdx, destroyIdx + 1500);
    assert.match(destroyBlock, /removeEventListener\('wheel'/,
        'destroy() must remove the wheel listener');
    assert.match(destroyBlock, /_hudEl\?\.remove\(\)/,
        'destroy() must remove the HUD element');
    assert.match(destroyBlock, /_styleElement\?\.remove\(\)/,
        'destroy() must remove the injected style tag');
});

test('initialPlayerState features respect visibility state and "inherit" mode', () => {
    const fgStart = ytkitSource.indexOf("id: 'initialPlayerStateForeground'");
    const bgStart = ytkitSource.indexOf("id: 'initialPlayerStateBackground'");
    assert.ok(fgStart > -1, 'initialPlayerStateForeground must exist');
    assert.ok(bgStart > -1, 'initialPlayerStateBackground must exist');
    const fg = ytkitSource.slice(fgStart, fgStart + 3000);
    const bg = ytkitSource.slice(bgStart, bgStart + 3000);
    assert.match(fg, /document\.visibilityState !== 'visible'/,
        'foreground variant must short-circuit when tab is hidden');
    assert.match(bg, /document\.visibilityState === 'visible'/,
        'background variant must short-circuit when tab is visible');
    assert.match(fg, /=== 'inherit'/, 'foreground variant must respect inherit mode');
    assert.match(bg, /=== 'inherit'/, 'background variant must respect inherit mode');
});

test('perChannelIntroOutro stores offsets keyed by channel ID and skips bidirectionally', () => {
    const start = ytkitSource.indexOf("id: 'perChannelIntroOutro'");
    assert.ok(start > -1, 'perChannelIntroOutro feature must exist');
    const block = ytkitSource.slice(start, start + 8000);
    assert.match(block, /_STORAGE_KEY: 'perChannelIntroOutroData'/,
        'must persist to perChannelIntroOutroData');
    assert.match(block, /introSec/,
        'must support intro offset');
    assert.match(block, /outroSec/,
        'must support outro offset');
    assert.match(block, /timeupdate/,
        'must hook video timeupdate');
    assert.match(block, /this\._video\.currentTime\s*=\s*offsets\.intro/,
        'must fast-forward past the intro window');
});

test('disableLoudnessNormalization flips the html data attribute for the MAIN-world bridge', () => {
    const start = ytkitSource.indexOf("id: 'disableLoudnessNormalization'");
    assert.ok(start > -1, 'disableLoudnessNormalization must exist');
    const block = ytkitSource.slice(start, start + 4000);
    assert.match(block, /documentElement\.dataset\.ytkitDisableLoudness\s*=\s*'1'/,
        'must set data-ytkit-disable-loudness for future MAIN-world bridge');
    const destroyIdx = block.indexOf('destroy()');
    const destroyBlock = block.slice(destroyIdx, destroyIdx + 1000);
    assert.match(destroyBlock, /delete document\.documentElement\.dataset\.ytkitDisableLoudness/,
        'destroy() must clear the html data attribute');
});

// ── v3.27.0 P1: Downloads & local media library invariants ──

test('downloadHealthPanel reads /health every 30s and renders PO Token / yt-dlp / ffmpeg pills', () => {
    const start = ytkitSource.indexOf("id: 'downloadHealthPanel'");
    assert.ok(start > -1, 'downloadHealthPanel must exist');
    const block = ytkitSource.slice(start, start + 8000);
    assert.match(block, /MediaDLManager\.baseUrl\(\) \+ '\/health'/,
        'must query the local /health endpoint');
    // Hardening pass added a route + visibility gate inside the interval
    // callback so we don't ping the local downloader from every YouTube tab.
    assert.match(block, /setInterval\([\s\S]+?30000\)/,
        'must poll every 30 s');
    assert.match(block, /isWatchPagePath/,
        'poll callback must short-circuit when not on /watch');
    assert.match(block, /document\.visibilityState === 'hidden'/,
        'poll callback must short-circuit when the tab is hidden');
    assert.match(block, /poTokenProvider/, 'must surface PO Token state');
    assert.match(block, /ytDlpVersion/, 'must surface yt-dlp version');
    assert.match(block, /ffmpegCapabilities/, 'must surface ffmpeg freshness');
    const destroyIdx = block.indexOf('destroy()');
    const destroyBlock = block.slice(destroyIdx, destroyIdx + 1000);
    assert.match(destroyBlock, /clearInterval\(this\._pollTimer\)/,
        'destroy() must stop the poll timer');
});

test('downloadStreamLinksPanel reads ytInitialPlayerResponse and supports adaptive + combined formats', () => {
    const start = ytkitSource.indexOf("id: 'downloadStreamLinksPanel'");
    assert.ok(start > -1, 'downloadStreamLinksPanel must exist');
    const block = ytkitSource.slice(start, start + 12000);
    assert.match(block, /ytInitialPlayerResponse/,
        'must parse ytInitialPlayerResponse from script tags');
    assert.match(block, /streamingData\?\.adaptiveFormats/,
        'must extract adaptiveFormats');
    assert.match(block, /streamingData\?\.formats/,
        'must extract legacy combined formats');
    assert.match(block, /'SABR-only'/,
        'must render a SABR-only label when f.url is missing');
    const destroyIdx = block.indexOf('destroy()');
    const destroyBlock = block.slice(destroyIdx, destroyIdx + 1500);
    assert.match(destroyBlock, /_btn\?\.remove\(\)/,
        'destroy() must remove the toolbar button');
    assert.match(destroyBlock, /_panel\?\.remove\(\)/,
        'destroy() must remove the panel');
});

test('downloadCobaltFallback gates on github-full profile and only fires when downloader is offline', () => {
    const start = ytkitSource.indexOf("id: 'downloadCobaltFallback'");
    assert.ok(start > -1, 'downloadCobaltFallback must exist');
    const block = ytkitSource.slice(start, start + 8000);
    assert.match(block, /mode === 'github-full'/,
        'must gate on github-full profile mode');
    assert.match(block, /if \(mdl\?\.ok\)/,
        'must check Astra Downloader status before falling back to cobalt');
    assert.match(block, /downloadCobaltInstance/,
        'must read the configured cobalt instance URL');
    assert.match(block, /'_blank',\s*'noopener,noreferrer'/,
        'must open the returned media URL with noopener+noreferrer');
});

test('downloadHistoryPanel reads /history with auth + limit=50 and shows offline state', () => {
    const start = ytkitSource.indexOf("id: 'downloadHistoryPanel'");
    assert.ok(start > -1, 'downloadHistoryPanel must exist');
    const block = ytkitSource.slice(start, start + 10000);
    assert.match(block, /\/history\?limit=50/,
        'must request a bounded history slice');
    assert.match(block, /'X-MDL-Client': 'MediaDL'/,
        'must send the MediaDL client header');
    assert.match(block, /'Bearer ' \+ \(status\.token \|\| ''\)/,
        'must forward the local downloader token');
    assert.match(block, /Astra Downloader unreachable\./,
        'must render an explicit offline state, not a blank panel');
});

// ── v3.28.0 P1: Ratings, clickbait, and metadata trust invariants ──

test('returnDislike enforces a 100 req/min budget, cookieless fetch, and LRU-capped cache', () => {
    const start = ytkitSource.indexOf("id: 'returnDislike'");
    assert.ok(start > -1, 'returnDislike feature must exist');
    const block = ytkitSource.slice(start, start + 12000);
    assert.match(block, /_BUDGET_PER_MIN:\s*100/,
        'must declare a 100 req/min budget');
    assert.match(block, /credentials:\s*'omit'/,
        'must fetch without cookies');
    assert.match(block, /returnyoutubedislikeapi\.com\/votes\?videoId=/,
        'must hit the public RYD votes endpoint');
    assert.match(block, /500/,
        'cache must be LRU-capped (500 entries)');
});

test('returnDislike honors returnDislikeCacheHours TTL with a sane minimum', () => {
    const start = ytkitSource.indexOf("id: 'returnDislike'");
    const block = ytkitSource.slice(start, start + 12000);
    assert.match(block, /Math\.max\(1,\s*Number\(appState\?\.settings\?\.returnDislikeCacheHours\)\s*\|\|\s*24\)/,
        'TTL must default to 24 h with a 1 h floor');
});

test('extension manifest now whitelists returnyoutubedislikeapi.com (host_permissions + CSP)', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'),
        'utf8'
    ));
    assert.ok(
        (manifest.host_permissions || []).includes('https://returnyoutubedislikeapi.com/*'),
        'manifest host_permissions must include the RYD API'
    );
    const csp = manifest.content_security_policy?.extension_pages || '';
    assert.ok(
        csp.includes('https://returnyoutubedislikeapi.com'),
        'CSP connect-src must include the RYD API'
    );
});

test('antiTranslateAudioTrack uses movie_player.setAudioTrack and caps retries', () => {
    const start = ytkitSource.indexOf("id: 'antiTranslateAudioTrack'");
    assert.ok(start > -1, 'antiTranslateAudioTrack must exist');
    const block = ytkitSource.slice(start, start + 5000);
    assert.match(block, /movie\.getAvailableAudioTracks/,
        'must call getAvailableAudioTracks');
    assert.match(block, /movie\.setAudioTrack/,
        'must call setAudioTrack with the chosen track');
    assert.match(block, /_MAX_ATTEMPTS:\s*5/,
        'must cap retry attempts at 5');
});

test('monetizationIndicator paints exactly one pill and removes it on destroy', () => {
    const start = ytkitSource.indexOf("id: 'monetizationIndicator'");
    assert.ok(start > -1, 'monetizationIndicator must exist');
    const block = ytkitSource.slice(start, start + 7000);
    assert.match(block, /this\._pillEl\?\.remove\(\)/,
        '_render() must remove any prior pill before painting a new one');
    const destroyIdx = block.indexOf('destroy()');
    const destroyBlock = block.slice(destroyIdx, destroyIdx + 1000);
    assert.match(destroyBlock, /querySelectorAll\('\.ytkit-monet-pill'\)/,
        'destroy() must remove all stray pills (covers SPA route races)');
});

// ── v3.29.0 P1: Subscription manager invariants ──

test('subscriptionGroups keys by channel ID and survives SPA navigation', () => {
    const start = ytkitSource.indexOf("id: 'subscriptionGroups'");
    assert.ok(start > -1, 'subscriptionGroups must exist');
    const block = ytkitSource.slice(start, start + 36000);
    assert.match(block, /_GROUPS_KEY: 'subscriptionGroupData'/,
        'must persist groups to subscriptionGroupData');
    assert.match(block, /a\[href\*="\/channel\/"]/,
        'must extract channel IDs from /channel/UC… links');
    assert.match(block, /addNavigateRule\(this\.id/,
        'must hook the SPA navigate event so groups re-apply on route changes');
    assert.match(block, /addMutationRule\(this\.id/,
        'must hook the mutation rule so newly-rendered cards get filtered');
});

test('subscriptionGroups exports + imports JSON with schema version', () => {
    const start = ytkitSource.indexOf("id: 'subscriptionGroups'");
    const block = ytkitSource.slice(start, start + 30000);
    assert.match(block, /schemaVersion:\s*1/,
        'export payload must declare schemaVersion 1');
    assert.match(block, /astra-deck-subscription-groups-/,
        'export filename must include the project prefix');
    // Import must sanitize channelIds + name length + color format.
    assert.match(block, /Array\.isArray\(raw\.channelIds\)/,
        'import must validate that raw.channelIds is an array before assigning');
    assert.match(block, /\/\^#\[0-9a-fA-F\]\{6\}\$\//,
        'import must validate the color is a 6-digit hex code');
});

test('subscriptionGroups destroy() clears toolbar, hidden-by-group classes, and new-since badges', () => {
    const start = ytkitSource.indexOf("id: 'subscriptionGroups'");
    const block = ytkitSource.slice(start, start + 30000);
    const destroyIdx = block.indexOf('destroy()');
    const destroyBlock = block.slice(destroyIdx, destroyIdx + 2000);
    assert.match(destroyBlock, /_toolbar\?\.remove\(\)/,
        'destroy() must remove the injected toolbar');
    assert.match(destroyBlock, /\.ytkit-sub-hidden-by-group/,
        'destroy() must unhide cards that were hidden by group filter');
    assert.match(destroyBlock, /\.ytkit-sub-new-badge/,
        'destroy() must remove new-since-last-visit badges');
});

test('subscriptionGroups sort modes cover unwatched / duration / new-since', () => {
    const start = ytkitSource.indexOf("id: 'subscriptionGroups'");
    const block = ytkitSource.slice(start, start + 30000);
    assert.match(block, /'duration-asc'/, 'must support duration-asc sort');
    assert.match(block, /'unwatched'/, 'must support unwatched sort');
    assert.match(block, /'new-since-last-visit'/, 'must support new-since-last-visit sort');
});

// ── v3.30.0 P1: Research workspace invariants ──

test('localAiSummary checks for Chrome built-in Summarizer and never falls through to remote providers', () => {
    const start = ytkitSource.indexOf("id: 'localAiSummary'");
    assert.ok(start > -1, 'localAiSummary must exist');
    const block = ytkitSource.slice(start, start + 12000);
    assert.match(block, /window\.Summarizer/,
        'must check for Chrome\'s top-level Summarizer factory');
    assert.match(block, /window\.ai\?\.summarizer/,
        'must check for the window.ai.summarizer fallback');
    assert.match(block, /Local Summarizer not available/,
        'must surface an explicit "not available" message instead of falling through');
    // The IIFE explicitly says "never silently routes to a remote provider".
    // The simplest invariant: there is no fetch / xhr in the local-AI path.
    const summarizeIdx = block.indexOf('async _summarize()');
    const summarizeBlock = block.slice(summarizeIdx, summarizeIdx + 2500);
    assert.ok(!/fetch\(/.test(summarizeBlock),
        '_summarize() must not call fetch() — local-only path');
    assert.ok(!/XMLHttpRequest/.test(summarizeBlock),
        '_summarize() must not use XHR');
});

test('researchSpacedReview emits a CSV with header + escapes embedded quotes', () => {
    const start = ytkitSource.indexOf("id: 'researchSpacedReview'");
    assert.ok(start > -1, 'researchSpacedReview must exist');
    const block = ytkitSource.slice(start, start + 8000);
    assert.match(block, /\['front', 'back', 'tags'\]/,
        'CSV header must be front, back, tags');
    assert.match(block, /_csvEscape/,
        'must declare a CSV escaper');
    assert.match(block, /s\.replace\(\/"\/g, '""'\)/,
        'CSV escaper must double-quote embedded quotes');
});

test('researchTranscriptIndex stores transcripts in IndexedDB keyed by videoId', () => {
    const start = ytkitSource.indexOf("id: 'researchTranscriptIndex'");
    assert.ok(start > -1, 'researchTranscriptIndex must exist');
    const block = ytkitSource.slice(start, start + 8000);
    assert.match(block, /_DB_NAME:\s*'ytkit-transcript-index'/,
        'must use the documented IndexedDB name');
    assert.match(block, /keyPath:\s*'videoId'/,
        'object store must be keyed by videoId');
    assert.match(block, /window\.__ytkitClearTranscriptIndex/,
        'must expose a clear() helper on window for the settings panel');
    assert.match(block, /hits\.length\s*>=\s*200/,
        'search must cap hits to bound memory');
});

// ── v3.31.0 P1: Accessibility, mobile, low power invariants ──

test('reducedMotion neuters Astra-injected animations and transitions globally', () => {
    const start = ytkitSource.indexOf("id: 'reducedMotion'");
    assert.ok(start > -1, 'reducedMotion must exist');
    const block = ytkitSource.slice(start, start + 4000);
    assert.match(block, /animation-duration:\s*0\.001ms\s*!important/,
        'must zero out animation-duration on Astra-injected elements');
    assert.match(block, /transition-duration:\s*0\.001ms\s*!important/,
        'must zero out transition-duration too');
    assert.match(block, /\[class\*="ytkit-"\]/,
        'must scope to .ytkit-* injected classes');
});

test('forcedColorsSupport hooks @media (forced-colors: active) and uses system colors', () => {
    const start = ytkitSource.indexOf("id: 'forcedColorsSupport'");
    assert.ok(start > -1, 'forcedColorsSupport must exist');
    const block = ytkitSource.slice(start, start + 4000);
    assert.match(block, /@media \(forced-colors: active\)/,
        'must scope overrides under the forced-colors media query');
    assert.match(block, /background:\s*Canvas\s*!important/,
        'must use the Canvas system color for backgrounds');
    assert.match(block, /color:\s*CanvasText\s*!important/,
        'must use the CanvasText system color for text');
    assert.match(block, /color:\s*LinkText\s*!important/,
        'links must use LinkText');
    assert.match(block, /outline:\s*2px solid Highlight\s*!important/,
        'focus rings must use the Highlight system color');
});

test('globalAriaLiveRegion mounts a hidden role=status / aria-live=polite container', () => {
    const start = ytkitSource.indexOf("id: 'globalAriaLiveRegion'");
    assert.ok(start > -1, 'globalAriaLiveRegion must exist');
    const block = ytkitSource.slice(start, start + 3000);
    assert.match(block, /id\s*=\s*'ytkit-aria-live'/,
        'must mount the region with the documented id');
    assert.match(block, /setAttribute\('role',\s*'status'\)/,
        'must set role=status');
    assert.match(block, /setAttribute\('aria-live',\s*'polite'\)/,
        'must set aria-live=polite');
    assert.match(block, /window\.__ytkitAnnounce/,
        'must expose a global announce() helper');
});

test('lowPowerProfile backs up flags before applying, restores on destroy', () => {
    const start = ytkitSource.indexOf("id: 'lowPowerProfile'");
    assert.ok(start > -1, 'lowPowerProfile must exist');
    const block = ytkitSource.slice(start, start + 6000);
    assert.match(block, /_BACKUP_KEY:\s*'ytkit-low-power-backup'/,
        'must persist backup under the documented storage key');
    assert.match(block, /backup\[key\]\s*=\s*appState\.settings\[key\]/,
        'must snapshot current settings before mutating');
    assert.match(block, /enableCPU_Tamer:\s*true/,
        'must explicitly enable CPU Tamer when entering low power');
    const destroyIdx = block.indexOf('destroy()');
    const destroyBlock = block.slice(destroyIdx, destroyIdx + 1000);
    assert.match(destroyBlock, /this\._restore\(\)/,
        'destroy() must restore backed-up flags');
});

// ── v3.32.0 P1: Premium visual system invariants ──

test('oledTheme rewrites --yt-sys-* base/raised/overlay tokens to true black', () => {
    const start = ytkitSource.indexOf("id: 'oledTheme'");
    assert.ok(start > -1, 'oledTheme must exist');
    const block = ytkitSource.slice(start, start + 4000);
    assert.match(block, /--yt-sys-color-baseline--base-background:\s*#000/,
        'must override base-background to true black');
    assert.match(block, /--yt-saturated-base-background:\s*#000/,
        'must also override the legacy saturated base-background');
});

test('rectangularizeYouTube clamps backdrops to 6-8 px and keeps avatars circular', () => {
    const start = ytkitSource.indexOf("id: 'rectangularizeYouTube'");
    assert.ok(start > -1, 'rectangularizeYouTube must exist');
    const block = ytkitSource.slice(start, start + 4000);
    assert.match(block, /border-radius:\s*8px\s*!important/,
        'pill backdrops must be clamped to 8 px');
    // Carve-out: avatars + progress rings must stay circular.
    assert.match(block, /border-radius:\s*50%\s*!important/,
        'avatars/progress rings must stay circular via the 50% carve-out');
    assert.match(block, /yt-avatar-shape/,
        'must explicitly include yt-avatar-shape in the circular carve-out');
});

test('rectangularizeYouTube never sets a border-radius > 12px on backdrops', () => {
    // Hard rule from the user's CLAUDE.md: allowed backdrop radii are
    // 0/4/6/8/10/12. Forbidden are 999px / 50% on non-icon-only elements.
    // The 50% rule above scopes to avatar / progress-ring carve-outs only;
    // grep that no other "border-radius: 999px" / "border-radius: 100" /
    // "border-radius: 99" sneaks into the rectangularize rule body.
    const start = ytkitSource.indexOf("id: 'rectangularizeYouTube'");
    const block = ytkitSource.slice(start, start + 4000);
    assert.ok(!/border-radius:\s*999/.test(block),
        'rectangularizeYouTube must not introduce 999 px radii');
    assert.ok(!/border-radius:\s*100%/.test(block),
        'rectangularizeYouTube must not introduce 100% radii');
});

test('no Astra-injected CSS uses pill (999px) backdrops anywhere in ytkit.js', () => {
    // Hard rule from the user's CLAUDE.md applies to OUR injected UI, not
    // just the rectangularizeYouTube feature. Audit pass found three
    // violations (volume HUD bar, sub-group chip, sub-new badge); guard
    // against the next one before it ships.
    const matches = ytkitSource.match(/border-radius:\s*9{2,}px/g);
    assert.ok(!matches,
        `ytkit.js has pill backdrops (border-radius: 999px) — replace with 0/4/6/8/10/12:\n${matches?.join('\n')}`);
});

test('no Astra-injected CSS uses pill (999px) backdrops in theater-split.user.js', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'theater-split.user.js'),
        'utf8'
    );
    // Standalone userscript must follow the same hard rule.
    const px999 = source.match(/border-radius:\s*9{2,}px/g);
    assert.ok(!px999,
        `theater-split.user.js has pill backdrops:\n${px999?.join('\n')}`);
});

test('ytkit.js does not inject SVG via direct innerHTML (TrustedTypes bypass)', () => {
    // Direct innerHTML assignment of HTML/SVG strings bypasses TrustedHTML
    // and throws under YouTube's strict TrustedTypes CSP. Audit found one
    // such site in the AI handoff button (was: `btn.innerHTML = '<svg...>'`).
    // Use DOM APIs (createElementNS) or the project's TrustedHTML.setHTML
    // wrapper instead.
    const offenders = ytkitSource.match(/\.innerHTML\s*=\s*['"`]\s*<svg/gi);
    assert.ok(!offenders,
        `Direct innerHTML SVG injection bypasses TrustedTypes:\n${offenders?.join('\n')}`);
});

test('ytkit.js DiagnosticLog instantiates from core/diagnostic-log.js factory when present (iter-6 N11)', () => {
    // First M-phase extraction toward N11 (the ytkit.js monolith). The
    // DiagnosticLog implementation now lives in core/diagnostic-log.js;
    // ytkit.js consumes it via the factory, falling back to the legacy
    // inline IIFE only when the core module isn't loaded (userscript
    // build / unit tests that load ytkit.js in isolation).
    const idx = ytkitSource.indexOf('const DiagnosticLog = (function () {');
    assert.ok(idx > -1, 'DiagnosticLog must be an IIFE that picks factory vs legacy');
    const block = ytkitSource.slice(idx, idx + 4000);
    assert.match(block, /globalThis\.YTKitCore && globalThis\.YTKitCore\.createDiagnosticLog/,
        'factory path must guard on YTKitCore.createDiagnosticLog presence');
    assert.match(block, /getSettings:\s*\(\)\s*=>\s*\(appState && appState\.settings\)/,
        'factory must be wired with the ytkit.js appState.settings accessor');
    assert.match(block, /saveSettings:\s*\(settings\)\s*=>\s*\{[\s\S]*?settingsManager\.save\(settings\)/,
        'factory must be wired with the settingsManager.save accessor');
    assert.match(block, /Legacy fallback/,
        'inline-IIFE fallback must remain for userscript/test contexts');

    // Manifest content_scripts must load the new core file BEFORE ytkit.js
    // (otherwise the factory check on ytkit.js's first execution would fail).
    const manifestSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'),
        'utf8'
    );
    const manifest = JSON.parse(manifestSrc);
    for (const cs of manifest.content_scripts || []) {
        if (!Array.isArray(cs.js)) continue;
        const dlIdx = cs.js.indexOf('core/diagnostic-log.js');
        const ytIdx = cs.js.indexOf('ytkit.js');
        if (ytIdx === -1) continue;  // not a content script that loads ytkit
        assert.ok(dlIdx > -1, `content_scripts entry must include core/diagnostic-log.js (${JSON.stringify(cs.matches)})`);
        assert.ok(dlIdx < ytIdx, `core/diagnostic-log.js must load before ytkit.js (${JSON.stringify(cs.matches)})`);
    }
});

test('popup ships a selector-health dashboard wired to the content script (iter-6 N7)', () => {
    // The popup now surfaces a top-K selector trouble list + per-ctx
    // diagnostic counts. Both flow through one round-trip message
    // (YTKIT_GET_SELECTOR_HEALTH) to the active YouTube tab. Hidden
    // gracefully on non-YT tabs or when the content script doesn't
    // respond in time (1500 ms timeout).
    assert.match(popupHtmlSource, /id="selector-health"/,
        'popup.html must declare the selector-health section');
    assert.match(popupHtmlSource, /id="selector-health-list"/,
        'selector-health section must include the trouble list');
    assert.match(popupHtmlSource, /id="selector-health-ctx"/,
        'selector-health section must include the ctx-chip strip');
    assert.match(popupSource, /function renderSelectorHealthDashboard/,
        'popup.js must declare renderSelectorHealthDashboard');
    assert.match(popupSource, /YTKIT_GET_SELECTOR_HEALTH/,
        'popup.js must dispatch the YTKIT_GET_SELECTOR_HEALTH message');
    // The content-script-side handler must exist on the ytkit.js side too.
    assert.match(ytkitSource, /YTKIT_GET_SELECTOR_HEALTH/,
        'ytkit.js must register the YTKIT_GET_SELECTOR_HEALTH message handler');
    assert.match(ytkitSource, /surfaces:\s*surfaces\.slice\(0, 12\)/,
        'ytkit.js handler must bound the response payload (top 12 surfaces)');
    // Timeout / non-YT graceful hide.
    assert.match(popupSource, /selectorHealthSection\.hidden\s*=\s*true/,
        'popup.js must hide the dashboard when no response is available');
});

test('ytkit.js TrustedHTML.setHTML delegates the no-policy fallback to core/trusted-html.js (iter-6 N10)', () => {
    // N10 deduplicates the parallel DOMParser fallback logic. ytkit.js
    // still owns the policy-attempt + diagnostic-recording surface (it
    // captures the TT_POLICY_FAIL reason and writes to DiagnosticLog),
    // but the actual DOMParser-then-appendChild work is delegated to the
    // hardened core helper so both wrappers stay in lockstep.
    const idx = ytkitSource.indexOf('const TrustedHTML = (() => {');
    assert.ok(idx > -1, 'ytkit.js must declare its TrustedHTML wrapper');
    // Read until the IIFE closes — the wrapper now has more conditional
    // paths (policy attempt + diagnostic + core-delegate + inline fallback)
    // and the modifications live near the end.
    const end = ytkitSource.indexOf('})();', idx);
    const block = ytkitSource.slice(idx, end + 5);
    assert.match(block, /globalThis\.YTKitCore/,
        'TrustedHTML wrapper must reach for the core module by name');
    assert.match(block, /core\.setTrustedHTML\(element, html\)/,
        'setHTML must call core.setTrustedHTML on the no-policy path');
    assert.match(block, /core\.toTrustedHTML\(html\)/,
        'create() must call core.toTrustedHTML on the no-policy path');
    // Legacy inline DOMParser fallback must still exist as the last-resort
    // safety net for unit-test contexts that load ytkit.js in isolation.
    assert.match(block, /Inline fallback \(legacy code path\)/,
        'inline DOMParser fallback must remain as last-resort safety net');
});

test('DiagnosticLog exposes per-ctx counters via countsByCtx() (iter-6 N6)', () => {
    // Popup health surface used to surface only TT events. With multiple
    // ctx classes flowing through the ring (trusted-types, selector-health,
    // storage-corruption, settings-migration, console, window) the popup
    // needs cheap O(1)-per-ctx access. countsByCtx() is the derived-view
    // accessor; the per-ctx counter is maintained inline by record() so
    // there's no whole-ring scan on every read.
    //
    // iter-6 N11 (partial M-phase) moved the implementation to
    // core/diagnostic-log.js — but the inline fallback in ytkit.js
    // must mirror the same machinery so the userscript / unit-test
    // build paths still work. Patterns updated to match either the
    // factory or the inline-fallback shape.
    assert.match(ytkitSource, /ctxCounts:\s*Object\.create\(null\)/,
        'DiagnosticLog must own a plain-prototype-less counter map');
    assert.match(ytkitSource, /countsByCtx\(\)\s*\{/,
        'DiagnosticLog must expose countsByCtx()');
    assert.match(ytkitSource, /_resyncCounts/,
        'DiagnosticLog must rebuild counters from the persisted ring on first read');
    // Counter must decrement when the ring trims an entry so the view
    // doesn't drift upward forever. Matches either `this._ctxCounts`
    // (legacy IIFE) or `state.ctxCounts` (post-extraction closure state).
    assert.match(ytkitSource, /while\s*\(arr\.length\s*>\s*(state|this)\.\w*[Cc]ap\)\s*\{[\s\S]*?(state|this)\.\w*[Cc]ounts\[dropCtx\]\s*-=\s*1/,
        'record() must decrement the counter for entries dropped during trim');
    // clear() must reset the in-memory counters too — otherwise stale
    // counts survive a user Clear-Diagnostic-Log click.
    const clearStart = ytkitSource.indexOf('clear() {', ytkitSource.indexOf('const DiagnosticLog'));
    assert.ok(clearStart > -1, 'DiagnosticLog.clear() must exist');
    const clearBlock = ytkitSource.slice(clearStart, clearStart + 600);
    assert.match(clearBlock, /(state|this)\.\w*[Cc]ounts\s*=\s*Object\.create\(null\)/,
        'clear() must reset the counter map');
});

test('popup detects malformed chrome.storage payloads and offers Reset (iter-6 N4)', () => {
    // Storage corruption is rare but real — disk-full mid-write, browser
    // crash mid-flush, profile sync conflict, manual edit of the profile
    // JSON. The detector flags wrong-type values for the four canonical
    // storage shapes (settings object, hiddenVideos/allowedVideos/
    // blockedChannels arrays, bookmarks object) and the banner surfaces
    // a recovery path. Failures also write to the _errors ring buffer
    // under ctx: 'storage-corruption' so future factory runs can
    // promote N4 follow-ups on field signal.
    assert.match(popupSource, /function detectStorageCorruption/,
        'popup.js must declare detectStorageCorruption');
    assert.match(popupSource, /storageBannerCorruptionTpl/,
        'corruption tier must have an i18n key');
    assert.match(popupSource, /function recordCorruptionDiagnostic/,
        'popup.js must persist corruption findings to the _errors ring');
    assert.match(popupSource, /ctx:\s*'storage-corruption'/,
        "ring buffer entries must carry ctx: 'storage-corruption'");
    // Corruption tier must win over quota tier in the banner — corruption
    // is a stronger signal than "storage is large."
    assert.match(popupSource, /corruption.*length\s*>\s*0/s,
        'renderStorageInfo must check corruption before quota');
});

test('popup ships a storage-quota warning banner with two-tier thresholds (iter-6 N2)', () => {
    // The popup now surfaces a proactive nudge when chrome.storage.local
    // approaches problematic size. Astra Deck declares unlimitedStorage
    // so there's no hard ceiling, but a runaway-growth banner is still
    // useful UX. Tier 1 (>20 MB) starts the soft nudge; tier 2 (>50 MB)
    // upgrades the wording.
    assert.match(popupHtmlSource, /id="storage-banner"/,
        'popup.html must declare the storage-banner element');
    assert.match(popupHtmlSource, /id="storage-banner-detail"/,
        'storage-banner must have a detail slot for the size readout');
    assert.match(popupHtmlSource, /id="storage-banner-reset-btn"/,
        'storage-banner must offer a Reset CTA');
    assert.match(popupSource, /STORAGE_WARN_SOFT_BYTES\s*=\s*20\s*\*\s*1024\s*\*\s*1024/,
        'soft threshold must be 20 MB');
    assert.match(popupSource, /STORAGE_WARN_HARD_BYTES\s*=\s*50\s*\*\s*1024\s*\*\s*1024/,
        'hard threshold must be 50 MB');
    assert.match(popupSource, /function renderStorageWarningBanner/,
        'popup.js must declare renderStorageWarningBanner');
    // The Reset CTA must dispatch into the existing destructive-confirm
    // dialog (resetAllData), not a separate path — accidental clicks
    // stay guarded by the same confirmation gate.
    assert.match(popupSource, /storageBannerResetBtn.*addEventListener.*resetAllData/s,
        'storage-banner Reset must call resetAllData() for guarded confirmation');
});

test('ytkit-main.js uses a single MutationObserver on <html> with 3 registered handlers (iter-6 N9)', () => {
    // Audit pass: three separate MutationObservers all watched the same
    // documentElement for different attributes. Every documentElement
    // attribute mutation ran three observer engines in parallel. The
    // consolidation registers all three handlers on one observer with a
    // combined attributeFilter, preserving the original per-handler
    // semantics (each handler still re-reads its attribute).
    const ytkitMainSource = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit-main.js'),
        'utf8'
    );
    const observerInstantiations = (ytkitMainSource.match(/new MutationObserver\(/g) || []).length;
    assert.equal(observerInstantiations, 1,
        `ytkit-main.js should instantiate exactly one MutationObserver after consolidation; found ${observerInstantiations}`);

    // All three feature handlers must be registered with the shared observer.
    const registrations = (ytkitMainSource.match(/_obsRegister\(/g) || []).length;
    assert.ok(registrations >= 4,
        `_obsRegister should appear 4× (1 definition + 3 call sites); found ${registrations}`);

    // Verify the consolidated observer's attributeFilter is built from the
    // registry's union set (not hardcoded), so adding a 4th handler later
    // doesn't require touching the observe() call.
    assert.match(ytkitMainSource, /attributeFilter:\s*Array\.from\(_ObsAttrs\)/,
        'consolidated observer must build attributeFilter from the shared _ObsAttrs set');

    // Re-entrancy hardening: handler errors must be isolated so one
    // misbehaving feature doesn't break the others on the same batch.
    assert.match(ytkitMainSource, /try \{ h\.fn\(\); \} catch/,
        'consolidated dispatcher must wrap each handler in try/catch');
});

test('popup.html ships inline CSP meta with the audited tightenings (iter-6 N3)', () => {
    // Belt-and-suspenders CSP independent of manifest. The manifest CSP can
    // be loosened in a future refactor; the inline meta is a second wall.
    // Stricter than manifest: no remote connect-src, no remote img-src.
    assert.match(popupHtmlSource, /http-equiv="Content-Security-Policy"/,
        'popup.html must declare an inline CSP meta tag');
    // default-src 'none' is the lockdown floor — every other directive
    // is an explicit allow.
    assert.match(popupHtmlSource, /default-src 'none'/,
        'CSP must default-deny');
    // connect-src 'self' is intentional: popup.js fetches its locale
    // override bundle via `chrome.runtime.getURL(...)` which is the
    // extension's own origin. Anything broader is a regression.
    assert.match(popupHtmlSource, /connect-src 'self'/,
        "connect-src must be 'self' only (popup makes no remote network calls)");
    // No remote img-src — popup ships its own icons.
    assert.match(popupHtmlSource, /img-src 'self' data:/,
        'img-src may include data: for inline SVG backgrounds but no remote');
    // frame-ancestors 'none' — popup must never be embedded.
    assert.match(popupHtmlSource, /frame-ancestors 'none'/,
        "frame-ancestors 'none' prevents popup clickjacking");
});

test('every locale matches the EN message key set (no drift, no orphans)', () => {
    // Audit pass: found 4 health-save keys had drifted out of all 9 non-EN
    // locales and zh_CN carried an orphan `languageEyebrow` with no EN
    // counterpart. chrome.i18n falls back to default_locale silently, so
    // the regression was invisible to users on non-EN browsers but the
    // diagnostic "Save" button rendered in English while everything else
    // around it was localized.
    const localesDir = path.join(__dirname, '..', 'extension', '_locales');
    const enKeys = new Set(Object.keys(JSON.parse(
        fs.readFileSync(path.join(localesDir, 'en', 'messages.json'), 'utf8')
    )));
    const localeDirs = fs.readdirSync(localesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .filter((name) => name !== 'en');

    const failures = [];
    for (const locale of localeDirs) {
        const msgs = JSON.parse(fs.readFileSync(
            path.join(localesDir, locale, 'messages.json'), 'utf8'
        ));
        const keys = new Set(Object.keys(msgs));
        for (const k of enKeys) {
            if (!keys.has(k)) failures.push(`${locale}: missing "${k}"`);
        }
        for (const k of keys) {
            if (!enKeys.has(k)) failures.push(`${locale}: orphan "${k}"`);
        }
    }
    assert.ok(failures.length === 0,
        `locale parity violations:\n  ${failures.join('\n  ')}`);
});

test('extensionRequestWithRetry honors server Retry-After header', () => {
    // RFC 7231 §7.1.3 — Retry-After is a strong signal that we should not
    // hammer the server. Audit pass: prior implementation ignored the
    // header and used pure exponential backoff, which on a 429 just made
    // the rate-limit pressure worse.
    const idx = ytkitSource.indexOf('async function extensionRequestWithRetry');
    assert.ok(idx > -1, 'extensionRequestWithRetry must exist');
    const block = ytkitSource.slice(idx, idx + 3000);
    assert.match(block, /_findRetryAfter/,
        'must parse Retry-After from responseHeaders');
    // Helpers live just above the function so we look across a wider window
    // for the ceiling constant.
    const wideBlock = ytkitSource.slice(Math.max(0, idx - 1500), idx + 3000);
    assert.match(wideBlock, /RETRY_AFTER_MAX_MS/,
        'must cap honored Retry-After to a finite ceiling');
});

test('ytkit.js handles YTKIT_SETTINGS_REPLACED bulk import message', () => {
    // The popup's import flow now broadcasts one YTKIT_SETTINGS_REPLACED per
    // tab instead of N YTKIT_SETTING_CHANGED messages. Receiver must route
    // the payload into applyExternalSettingsUpdate so feature re-init still
    // happens without waiting for storage.onChanged to propagate.
    assert.match(ytkitSource, /YTKIT_SETTINGS_REPLACED/,
        'ytkit.js must recognise the bulk-replace message broadcast by popup.js');
    const idx = ytkitSource.indexOf("'YTKIT_SETTINGS_REPLACED'");
    if (idx === -1) {
        // Single-quote literal not present — try double-quote variants too.
        return;
    }
    const block = ytkitSource.slice(idx, idx + 600);
    assert.match(block, /applyExternalSettingsUpdate/,
        'YTKIT_SETTINGS_REPLACED handler must call applyExternalSettingsUpdate');
});

test('classicLayoutProfile is a select with three modes (modern / 2020 / 2016)', () => {
    const start = ytkitSource.indexOf("id: 'classicLayoutProfile'");
    assert.ok(start > -1, 'classicLayoutProfile must exist');
    const block = ytkitSource.slice(start, start + 6000);
    assert.match(block, /type:\s*'select'/, 'must be a select feature');
    assert.match(block, /'modern':\s*'Modern \(default\)'/,
        'must offer the modern (default) option');
    assert.match(block, /'classic-2020':/,
        'must offer the classic-2020 option');
    assert.match(block, /'classic-2016':/,
        'must offer the classic-2016 option');
});

test('tokenThemeBridge maps the Astra accent into --yt-sys-color tokens', () => {
    const start = ytkitSource.indexOf("id: 'tokenThemeBridge'");
    assert.ok(start > -1, 'tokenThemeBridge must exist');
    const block = ytkitSource.slice(start, start + 4000);
    assert.match(block, /themeAccentColor/, 'must read the user themeAccentColor setting');
    assert.match(block, /--yt-sys-color-baseline--call-to-action/,
        'must override call-to-action token');
    assert.match(block, /--yt-sys-color-baseline--static-brand-red/,
        'must override static-brand-red token');
});

// ── v3.33.0 P1: Integrations & interop invariants ──

test('openInAlternativeFrontend opens externally with noopener+noreferrer', () => {
    const start = ytkitSource.indexOf("id: 'openInAlternativeFrontend'");
    assert.ok(start > -1, 'openInAlternativeFrontend must exist');
    const block = ytkitSource.slice(start, start + 4000);
    assert.match(block, /rel\s*=\s*'noopener noreferrer'/,
        'anchor must set rel=noopener noreferrer');
    assert.match(block, /target\s*=\s*'_blank'/,
        'anchor must target _blank');
    assert.match(block, /alternativeFrontendInstance/,
        'must read the user-configurable instance setting');
});

test('vlcMpvHandoff is github-full profile gated and never runs binaries directly', () => {
    const start = ytkitSource.indexOf("id: 'vlcMpvHandoff'");
    assert.ok(start > -1, 'vlcMpvHandoff must exist');
    const block = ytkitSource.slice(start, start + 5000);
    assert.match(block, /mode === 'github-full'/,
        'must gate on github-full profile mode');
    assert.match(block, /ytvlc/,
        'must wire the ytvlc protocol');
    assert.match(block, /ytmpv/,
        'must wire the ytmpv protocol');
    // Hard rule: protocol handshake must go through an anchor click, never
    // window.location, so that pages without a registered handler stay put.
    assert.match(block, /document\.createElement\('a'\)/,
        'must use a transient anchor element for the protocol click');
    assert.match(block, /a\.click\(\)/,
        'must trigger the protocol via anchor.click()');
});

test('astraContextMenu adds a contextmenu listener but never blocks the native menu unconditionally', () => {
    const start = ytkitSource.indexOf("id: 'astraContextMenu'");
    assert.ok(start > -1, 'astraContextMenu must exist');
    const block = ytkitSource.slice(start, start + 8000);
    // preventDefault only fires when the click landed on a player or feed card.
    // (We assert the guard pattern, not the absence of preventDefault.)
    assert.match(block, /if \(!card && !player\) return;/,
        'context handler must early-return when the click is outside Astra targets');
    assert.match(block, /e\.preventDefault\(\)/,
        'must call preventDefault when an Astra target is hit');
    const destroyIdx = block.indexOf('destroy()');
    const destroyBlock = block.slice(destroyIdx, destroyIdx + 1500);
    assert.match(destroyBlock, /removeEventListener\('contextmenu'/,
        'destroy() must remove the contextmenu listener');
});

test('youtubeMusicCompat only runs on music.youtube.com', () => {
    const start = ytkitSource.indexOf("id: 'youtubeMusicCompat'");
    assert.ok(start > -1, 'youtubeMusicCompat must exist');
    const block = ytkitSource.slice(start, start + 3000);
    assert.match(block, /location\.hostname\.includes\('music\.youtube\.com'\)/,
        'must early-return on non-music hostnames');
});

// ── v4.1.0 P1: Deferred-item follow-ups (DeArrow channel override + per-context quality) ──

test('deArrow honors per-channel override before fetching branding', () => {
    const idx = ytkitSource.indexOf('_channelOverrideMode(el)');
    assert.ok(idx > -1, 'deArrow must declare _channelOverrideMode()');
    // The override check must run BEFORE _fetchBranding so we don't waste an
    // API request on overridden channels.
    const block = ytkitSource.slice(idx, idx + 4000);
    assert.match(block, /deArrowChannelOverrides/,
        'must read deArrowChannelOverrides setting');
    const procIdx = ytkitSource.indexOf('async _processPage()');
    const procBlock = ytkitSource.slice(procIdx, procIdx + 4000);
    const overrideCheckPos = procBlock.indexOf('_channelOverrideMode(el)');
    const brandFetchPos = procBlock.indexOf('this._fetchBranding(videoId)');
    assert.ok(overrideCheckPos > -1 && brandFetchPos > -1,
        '_processPage must both check the override and call _fetchBranding');
    assert.ok(overrideCheckPos < brandFetchPos,
        'override check must run BEFORE _fetchBranding to short-circuit the API call');
});

test('deArrowChannelOverridesPanel cycles dearrow → original → off → dearrow', () => {
    const start = ytkitSource.indexOf("id: 'deArrowChannelOverridesPanel'");
    assert.ok(start > -1, 'deArrowChannelOverridesPanel must exist');
    const block = ytkitSource.slice(start, start + 8000);
    const cycleIdx = block.indexOf('_cycleMode(current)');
    assert.ok(cycleIdx > -1, 'must declare _cycleMode()');
    const cycleBlock = block.slice(cycleIdx, cycleIdx + 600);
    assert.match(cycleBlock, /current === 'dearrow'/, 'must transition from dearrow');
    assert.match(cycleBlock, /current === 'original'/, 'must transition from original');
    assert.match(cycleBlock, /return 'dearrow'/, 'must wrap back to dearrow');
});

test('qualityProfileMatrix publishes data-ytkit-quality-context on every context change', () => {
    const start = ytkitSource.indexOf("id: 'qualityProfileMatrix'");
    assert.ok(start > -1, 'qualityProfileMatrix must exist');
    const block = ytkitSource.slice(start, start + 8000);
    assert.match(block, /document\.documentElement\.setAttribute\('data-ytkit-quality-context'/,
        'must write the context to <html data-ytkit-quality-context>');
    assert.match(block, /data-ytkit-quality-target/,
        'must publish the resolved quality target too');
    assert.match(block, /fullscreenchange/,
        'must listen for fullscreenchange');
    assert.match(block, /visibilitychange/,
        'must listen for visibilitychange (background ↔ foreground)');
    assert.match(block, /attributeFilter:\s*\['theater'\]/,
        'must observe ytd-watch-flexy[theater] for theater-mode transitions');
});

test('qualityProfileMatrix destroy() removes both data attributes', () => {
    const start = ytkitSource.indexOf("id: 'qualityProfileMatrix'");
    const block = ytkitSource.slice(start, start + 8000);
    const destroyIdx = block.indexOf('destroy()');
    const destroyBlock = block.slice(destroyIdx, destroyIdx + 1500);
    assert.match(destroyBlock, /removeAttribute\('data-ytkit-quality-context'\)/,
        'destroy() must remove data-ytkit-quality-context');
    assert.match(destroyBlock, /removeAttribute\('data-ytkit-quality-target'\)/,
        'destroy() must remove data-ytkit-quality-target');
    assert.match(destroyBlock, /document\.removeEventListener\('fullscreenchange'/,
        'destroy() must remove the fullscreenchange listener');
});

test('MAIN-world bridge applies per-context quality when data-ytkit-quality-target is set', () => {
    const mainSource = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit-main.js'),
        'utf8'
    );
    assert.match(mainSource, /applyContextQuality/,
        'ytkit-main.js must declare an applyContextQuality function');
    assert.match(mainSource, /data-ytkit-quality-target/,
        'ytkit-main.js must read the per-context quality target attribute');
    // iter-6 N9: after observer consolidation both attributes are
    // registered together via the shared _obsRegister helper (not via a
    // dedicated attributeFilter array on a per-handler observer). The
    // semantic is preserved: both attributes are observed.
    assert.match(mainSource, /_obsRegister\(\['data-ytkit-quality-target',\s*'data-ytkit-quality-context'\]/,
        'ytkit-main.js must register both quality data attributes with the shared observer');
});

// ── v4.2.0 P1: Popularity sort + transcript search panel ──

test('subscriptionGroups popularity sort reads view-count from card metadata', () => {
    const start = ytkitSource.indexOf("id: 'subscriptionGroups'");
    const block = ytkitSource.slice(start, start + 30000);
    assert.match(block, /_parseCompactViewCount/,
        'subscriptionGroups must declare _parseCompactViewCount()');
    assert.match(block, /mode === 'popular'/,
        '_applySort must branch on the popular mode');
    assert.match(block, /\['popular', 'Most popular \(views\)'\]/,
        'sort select must surface the popularity option');
    // higher views → lower score → earlier in DOM
    assert.match(block, /return -views;/,
        'popularity sort score must invert views so higher counts surface first');
});

test('researchTranscriptSearchPanel reuses __ytkitSearchTranscripts + __ytkitClearTranscriptIndex', () => {
    const start = ytkitSource.indexOf("id: 'researchTranscriptSearchPanel'");
    assert.ok(start > -1, 'researchTranscriptSearchPanel must exist');
    const block = ytkitSource.slice(start, start + 14000);
    assert.match(block, /window\.__ytkitSearchTranscripts/,
        'must call the searcher helper exposed by researchTranscriptIndex');
    assert.match(block, /window\.__ytkitClearTranscriptIndex/,
        'must call the clear helper exposed by researchTranscriptIndex');
    assert.match(block, /Transcript Search Index is off — enable it first\./,
        'must surface a clear off-state message when the helpers are missing');
    // Result links must use noopener+noreferrer.
    assert.match(block, /link\.rel\s*=\s*'noopener noreferrer'/,
        'result links must set rel=noopener noreferrer');
    assert.match(block, /link\.target\s*=\s*'_blank'/,
        'result links must open in a new tab');
});

test('researchTranscriptSearchPanel destroy() removes the button, panel, and style tag', () => {
    const start = ytkitSource.indexOf("id: 'researchTranscriptSearchPanel'");
    const block = ytkitSource.slice(start, start + 14000);
    const destroyIdx = block.indexOf('destroy()');
    const destroyBlock = block.slice(destroyIdx, destroyIdx + 1500);
    assert.match(destroyBlock, /\.ytkit-transcript-search-btn/,
        'destroy() must remove every transcript-search button');
    assert.match(destroyBlock, /_panel\?\.remove\(\)/,
        'destroy() must close the panel');
    assert.match(destroyBlock, /_styleElement\?\.remove\(\)/,
        'destroy() must remove the injected style tag');
});

// ── v4.4.0 P1: Audit-pass hardening ──

test('background ALLOWED_FETCH_ORIGINS drops localhost aliases (defends DNS rebinding)', () => {
    // `localhost` resolves via DNS in some browsers/configurations and can be
    // rebound by a hostile network. `127.0.0.1` is loopback-literal and immune.
    // Hardening pass dropped every `http://localhost:*` entry from the
    // allowlists; the only http:// remaining must point at 127.0.0.1.
    assert.ok(!/http:\/\/localhost:/.test(backgroundSource),
        'background.js must not contain any http://localhost: allowlist entries');
    // Sanity: 127.0.0.1 entries still present.
    assert.match(backgroundSource, /http:\/\/127\.0\.0\.1:9751/,
        'background.js must still allow the primary 127.0.0.1 downloader port');
});

test('manifest host_permissions also drop localhost aliases', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'),
        'utf8'
    ));
    const hosts = manifest.host_permissions || [];
    assert.ok(hosts.some((entry) => entry.startsWith('http://127.0.0.1:9751/')),
        'manifest must still allow the loopback-literal downloader origin');
    assert.ok(hosts.every((entry) => !entry.startsWith('http://localhost:')),
        'manifest.host_permissions must not grant localhost aliases; runtime only uses 127.0.0.1');
});

test('chrome.runtime.onMessage rejects senders outside our extension id', () => {
    // Defense-in-depth — even though we don't declare externally_connectable
    // today, a future regression that adds it must not silently widen the
    // trust boundary. Every message must come from sender.id === chrome.runtime.id.
    const listenerStart = backgroundSource.indexOf('chrome.runtime.onMessage.addListener');
    assert.ok(listenerStart > -1, 'onMessage listener must exist');
    const listenerEnd = backgroundSource.indexOf('msg.type === \'OPEN_URL\'', listenerStart);
    const header = backgroundSource.slice(listenerStart, listenerEnd);
    assert.match(header, /sender\?\.id === chrome\.runtime\.id/,
        'onMessage must compare sender.id to chrome.runtime.id before any handler dispatch');
    assert.match(header, /Sender rejected\./,
        'onMessage must surface a clear rejection reason to the caller');
});

test('sanitizeDownloadFilename blocks Unicode RTL override + zero-width chars', () => {
    // U+202E and friends spoof file extensions in OS file managers — the
    // canonical example is `report.pdf<U+202E>exe.gpj` rendering as
    // `report.pdfjpg.exe`. The sanitizer must strip those before
    // chrome.downloads.download() sees them.
    const fnStart = backgroundSource.indexOf('function sanitizeDownloadFilename');
    assert.ok(fnStart > -1, 'sanitizeDownloadFilename must exist');
    const fnBody = backgroundSource.slice(fnStart, fnStart + 2000);
    assert.match(fnBody, /\\u202A-\\u202E/,
        'must strip bidi override characters (U+202A-E)');
    assert.match(fnBody, /\\u2066-\\u2069/,
        'must strip bidi isolate marks (U+2066-9)');
    assert.match(fnBody, /\\u200B-\\u200D/,
        'must strip zero-width spacer/joiner characters');
    assert.match(fnBody, /\\uFEFF/,
        'must strip the byte-order mark');
});

test('popup locale override is validated against the bundled allowlist', () => {
    const popupSource = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'),
        'utf8'
    );
    assert.match(popupSource, /isValidLocaleTag/,
        'popup must declare isValidLocaleTag()');
    assert.match(popupSource, /BUNDLED_LOCALE_SET/,
        'popup must keep a Set of known bundled locales');
    assert.match(popupSource, /BUNDLED_LOCALE_SET\.has\(locale\)/,
        'isValidLocaleTag must consult the allowlist before any fetch');
    // The fetch path must reject invalid locales before calling getURL.
    const initIdx = popupSource.indexOf('async function initI18n');
    const initBody = popupSource.slice(initIdx, initIdx + 1200);
    assert.match(initBody, /isValidLocaleTag\(locale\)/,
        'initI18n must short-circuit when isValidLocaleTag rejects the stored override');
});

test('PageTypes covers music, embed, and live_chat surfaces', () => {
    const pageSource = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'page.js'),
        'utf8'
    );
    assert.match(pageSource, /MUSIC: 'music'/,
        'PageTypes must declare MUSIC for music.youtube.com');
    assert.match(pageSource, /EMBED: 'embed'/,
        'PageTypes must declare EMBED for /embed/ routes');
    assert.match(pageSource, /LIVE_CHAT: 'live_chat'/,
        'PageTypes must declare LIVE_CHAT for the engagement-panel iframe');
    assert.match(pageSource, /isMusicHost/,
        'PageTypes must expose an isMusicHost() helper');
    assert.match(pageSource, /isEmbedPath/,
        'PageTypes must expose an isEmbedPath() helper');
});

test('subscriptionGroups uses an inline dialog instead of window.prompt', () => {
    const start = ytkitSource.indexOf("id: 'subscriptionGroups'");
    const block = ytkitSource.slice(start, start + 36000);
    // Hardening pass replaced window.prompt with _showNewGroupDialog.
    assert.match(block, /_showNewGroupDialog/,
        'subscriptionGroups must expose the inline new-group dialog');
    // Match the call syntax — explanatory comments referencing the deprecated
    // API are allowed and useful for historical context.
    assert.ok(!/window\.prompt\s*\(/.test(block),
        'subscriptionGroups must not call window.prompt(...)');
    // The dialog must focus-trap (aria-modal) and clean up on destroy.
    const dlgIdx = block.indexOf('_showNewGroupDialog');
    const dlgBody = block.slice(dlgIdx, dlgIdx + 8000);
    assert.match(dlgBody, /setAttribute\('aria-modal', 'true'\)/,
        'dialog must declare aria-modal so screen readers trap focus');
    assert.match(dlgBody, /key === 'Escape'/,
        'dialog must dismiss on Esc');
});

test('subscriptionLastVisitData is capped to prevent unbounded growth', () => {
    const start = ytkitSource.indexOf("id: 'subscriptionGroups'");
    const block = ytkitSource.slice(start, start + 36000);
    const stampIdx = block.indexOf('_stampLastVisit()');
    const stampBody = block.slice(stampIdx, stampIdx + 1500);
    assert.match(stampBody, /LAST_VISIT_CAP/,
        '_stampLastVisit must declare a cap constant');
    assert.match(stampBody, /sort\(\(a, b\)/,
        'cap pruning must sort by timestamp before dropping the oldest entries');
});

test('selector stats and emittedMisses are bounded', () => {
    const selSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'selectors.js'),
        'utf8'
    );
    assert.match(selSrc, /SELECTOR_STATS_CAP\s*=\s*\d+/,
        'core/selectors.js must declare a stats cap');
    assert.match(selSrc, /EMITTED_MISSES_CAP\s*=\s*\d+/,
        'core/selectors.js must declare an emitted-misses cap');
    assert.match(selSrc, /_enforceMapCap/,
        'must call the cap-enforcing helper on stats insert');
    assert.match(selSrc, /_enforceSetCap/,
        'must call the cap-enforcing helper on miss emit');
});

test('commentFilterManager rules hash is a short digest, not the raw rule text', () => {
    const start = ytkitSource.indexOf("id: 'commentFilterManager'");
    const block = ytkitSource.slice(start, start + 9000);
    assert.match(block, /_shortHash/,
        'commentFilterManager must declare _shortHash()');
    // The hash must be at most 16 chars and feed _lastRulesHash so the
    // dataset attribute does not pin the entire rule body on every thread.
    assert.match(block, /this\._lastRulesHash\s*=\s*this\._shortHash/,
        '_scanAll must derive the hash via _shortHash');
});

test('videoHider resets the predicate-sandbox circuit on SPA navigate', () => {
    const idx = ytkitSource.indexOf("addNavigateRule('hideVideosFromHomeNav'");
    assert.ok(idx > -1, 'videoHider navigate rule must exist');
    const block = ytkitSource.slice(idx, idx + 600);
    assert.match(block, /_predicateCache\?\.evaluator\?\.reset\?\.\(\)/,
        'navigate rule must reset the predicate evaluator circuit each route');
});

test('core/registry.js register({replace:true}) drops orphaned cleanups for the replaced id', () => {
    const regSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'registry.js'),
        'utf8'
    );
    const fnIdx = regSrc.indexOf('function register(feature, registerOptions');
    assert.ok(fnIdx > -1, 'register() must exist');
    const fnBody = regSrc.slice(fnIdx, fnIdx + 1500);
    assert.match(fnBody, /registerOptions\.replace/, 'replace option must be honoured');
    assert.match(fnBody, /cleanups\.delete\(id\)/,
        'when replacing a registered feature, prior cleanups must be dropped to avoid leaking onto the new feature');
});

// ── v4.3.0 P1: AI tags for subscription groups ──

test('subscriptionAiTags uses Chrome built-in Summarizer and never falls through to remote', () => {
    const start = ytkitSource.indexOf('_generateAiTagsForGroup');
    assert.ok(start > -1, 'subscriptionGroups must declare _generateAiTagsForGroup()');
    const block = ytkitSource.slice(start, start + 5000);
    assert.match(block, /window\.Summarizer/,
        'must check for the top-level Summarizer factory');
    assert.match(block, /window\.ai\?\.summarizer/,
        'must fall back to window.ai.summarizer');
    assert.match(block, /Local Summarizer not available/,
        'must surface an explicit not-available message — never silent fallthrough');
    // The bulk-tag path must NOT call fetch / XHR / extensionFetchJson.
    assert.ok(!/fetch\(/.test(block),
        '_generateAiTagsForGroup must not call fetch() — local-only path');
    assert.ok(!/extensionFetchJson/.test(block),
        '_generateAiTagsForGroup must not route through the background fetch proxy');
});

test('subscriptionAiTags persists generated tags into subscriptionAiTagData per group', () => {
    const start = ytkitSource.indexOf('_generateAiTagsForGroup');
    const block = ytkitSource.slice(start, start + 5000);
    assert.match(block, /_writeAiTagData/,
        'must persist tags through the writer helper');
    assert.match(block, /generatedAt:\s*Date\.now\(\)/,
        'each tag record must carry a generatedAt timestamp');
    assert.match(block, /\.slice\(0,\s*8\)/,
        'must cap tags at 8 per group to keep storage bounded');
});

test('subscriptionAiTags renders chip suffix and binds shift+click for regeneration', () => {
    const start = ytkitSource.indexOf("id: 'subscriptionGroups'");
    const block = ytkitSource.slice(start, start + 30000);
    assert.match(block, /aiTagData\[id\]\?\.tags\?\.length/,
        'chip render must check for stored tags');
    assert.match(block, /Shift\+click to regenerate/,
        'chip title must explain the shift+click regen affordance');
    assert.match(block, /e\.shiftKey && appState\?\.settings\?\.subscriptionAiTags/,
        'click handler must gate regeneration on shift+click AND the subscriptionAiTags toggle');
});

// ── v5.0.0 NX1: settings-schema foundation ──

const settingsSchemaModule = require('../extension/core/settings-schema.js');
const defaultSettings = require('../extension/default-settings.json');

test('v5.0.0 settings-schema exports the required surface', () => {
    const required = [
        'SETTINGS_SCHEMA', 'CATEGORIES', 'RISKS', 'PROFILES', 'SCOPES',
        'VEHICLES', 'TYPES', 'buildDefaultsFromSchema', 'getKeysByCategory',
        'findSettingEntry', 'isInternalSettingKey', 'getStoreSafeKeys',
        'getGithubFullKeys'
    ];
    for (const name of required) {
        assert.ok(name in settingsSchemaModule,
            `settings-schema must export ${name}`);
    }
    assert.ok(Array.isArray(settingsSchemaModule.SETTINGS_SCHEMA),
        'SETTINGS_SCHEMA must be an array');
    assert.equal(settingsSchemaModule.SETTINGS_SCHEMA.length, 354,
        'SETTINGS_SCHEMA must cover all 354 keys');
});

test('v5.0.0 schema entries carry full metadata with values from the canonical enums', () => {
    const { SETTINGS_SCHEMA, CATEGORIES, RISKS, PROFILES, SCOPES, TYPES } = settingsSchemaModule;
    const cats = new Set(CATEGORIES);
    const risks = new Set(RISKS);
    const profiles = new Set(PROFILES);
    const scopes = new Set(SCOPES);
    const types = new Set(TYPES);
    for (const entry of SETTINGS_SCHEMA) {
        assert.ok(cats.has(entry.category), `${entry.key} has invalid category ${entry.category}`);
        assert.ok(types.has(entry.type), `${entry.key} has invalid type ${entry.type}`);
        assert.ok(risks.has(entry.risk), `${entry.key} has invalid risk ${entry.risk}`);
        assert.ok(profiles.has(entry.profile), `${entry.key} has invalid profile ${entry.profile}`);
        assert.ok(scopes.has(entry.scope), `${entry.key} has invalid scope ${entry.scope}`);
        assert.equal(typeof entry.immediateApply, 'boolean', `${entry.key} immediateApply must be boolean`);
        assert.equal(typeof entry.destroyRequired, 'boolean', `${entry.key} destroyRequired must be boolean`);
        assert.equal(typeof entry.internal, 'boolean', `${entry.key} internal must be boolean`);
        assert.equal(typeof entry.since, 'string', `${entry.key} since must be a string`);
        // Internal flag must agree with the `_` prefix.
        assert.equal(entry.internal, entry.key.startsWith('_'),
            `${entry.key} internal flag must agree with leading-underscore convention`);
        // Declared type must match the defaultValue's runtime type.
        const v = entry.defaultValue;
        const runtimeType = Array.isArray(v) ? 'array' : (v === null ? 'null' : typeof v);
        assert.equal(entry.type, runtimeType,
            `${entry.key} type "${entry.type}" must match runtime type "${runtimeType}"`);
    }
});

test('v5.0.0 schema has no duplicate keys', () => {
    const { SETTINGS_SCHEMA } = settingsSchemaModule;
    const seen = new Set();
    for (const entry of SETTINGS_SCHEMA) {
        assert.equal(seen.has(entry.key), false, `Duplicate key in schema: ${entry.key}`);
        seen.add(entry.key);
    }
});

test('v5.0.0 schema key set === default-settings.json key set', () => {
    const { SETTINGS_SCHEMA } = settingsSchemaModule;
    const schemaKeys = new Set(SETTINGS_SCHEMA.map((e) => e.key));
    const defaultKeys = new Set(Object.keys(defaultSettings));
    for (const k of defaultKeys) {
        assert.ok(schemaKeys.has(k), `default-settings has ${k} but schema does not`);
    }
    for (const k of schemaKeys) {
        assert.ok(defaultKeys.has(k), `schema has ${k} but default-settings does not`);
    }
});

test('v5.0.0 schema iteration order matches default-settings.json insertion order', () => {
    const { SETTINGS_SCHEMA } = settingsSchemaModule;
    const defaultKeys = Object.keys(defaultSettings);
    const schemaKeys = SETTINGS_SCHEMA.map((e) => e.key);
    assert.deepEqual(schemaKeys, defaultKeys,
        'A regenerated default-settings.json must be byte-for-byte stable; schema order must match insertion order');
});

test('v5.0.0 buildDefaultsFromSchema round-trips to default-settings.json byte-for-byte', () => {
    const rebuilt = settingsSchemaModule.buildDefaultsFromSchema();
    assert.equal(JSON.stringify(rebuilt), JSON.stringify(defaultSettings),
        'buildDefaultsFromSchema() must produce the same JSON as default-settings.json');
});

test('v5.0.0 every category in CATEGORIES is represented by at least one entry', () => {
    const { CATEGORIES, getKeysByCategory } = settingsSchemaModule;
    const byCat = getKeysByCategory();
    for (const c of CATEGORIES) {
        assert.ok(byCat[c] && byCat[c].length > 0,
            `Category "${c}" must have at least one entry`);
    }
});

test('v5.0.0 getStoreSafeKeys and getGithubFullKeys partition the schema', () => {
    const { SETTINGS_SCHEMA, getStoreSafeKeys, getGithubFullKeys } = settingsSchemaModule;
    const all = SETTINGS_SCHEMA.map((e) => e.key);
    const safe = new Set(getStoreSafeKeys());
    const full = new Set(getGithubFullKeys());
    // Every key must land in exactly one bucket.
    for (const k of all) {
        const inSafe = safe.has(k);
        const inFull = full.has(k);
        assert.equal(inSafe || inFull, true, `${k} must be in store-safe OR github-full`);
        assert.equal(inSafe && inFull, false, `${k} must not be in both store-safe AND github-full`);
    }
});

test('v5.0.0 internal storage-only keys (prefix _) are excluded from popup-target lists', () => {
    const { SETTINGS_SCHEMA, isInternalSettingKey } = settingsSchemaModule;
    for (const entry of SETTINGS_SCHEMA) {
        assert.equal(entry.internal, isInternalSettingKey(entry.key),
            `${entry.key}: isInternalSettingKey must agree with the entry.internal flag`);
        if (entry.internal) {
            assert.equal(entry.immediateApply, false,
                `Internal key ${entry.key} must not declare immediateApply`);
            assert.equal(entry.destroyRequired, false,
                `Internal key ${entry.key} must not declare destroyRequired`);
        }
    }
});

test('v5.0.0 findSettingEntry resolves every schema key and returns null for unknown keys', () => {
    const { SETTINGS_SCHEMA, findSettingEntry } = settingsSchemaModule;
    for (const entry of SETTINGS_SCHEMA) {
        const found = findSettingEntry(entry.key);
        assert.ok(found, `findSettingEntry must resolve ${entry.key}`);
        assert.equal(found.key, entry.key);
    }
    assert.equal(findSettingEntry('definitely-not-a-real-setting-key-12345'), null,
        'findSettingEntry must return null for unknown keys');
});

// ── v5.0.0 NX2: feature-lifecycle + policy-profile foundations ──

// Both core modules attach themselves to globalThis.YTKitCore. The IIFE
// pattern means require() runs the module's side effects, so we need a
// clean globalThis between requires when tests reorder modules. The
// stub globalThis is built per-test.
function loadLifecycleModule() {
    const stub = {};
    const prev = global.YTKitCore;
    global.YTKitCore = stub;
    // Drop from require cache so the IIFE re-runs against the new stub.
    delete require.cache[require.resolve('../extension/core/feature-lifecycle.js')];
    require('../extension/core/feature-lifecycle.js');
    global.YTKitCore = prev;
    return stub;
}

function loadPolicyProfileModule() {
    const stub = {};
    const prev = global.YTKitCore;
    global.YTKitCore = stub;
    delete require.cache[require.resolve('../extension/core/policy-profile.js')];
    require('../extension/core/policy-profile.js');
    global.YTKitCore = prev;
    return stub;
}

test('v5.0.0 feature-lifecycle: defineFeature validates required hooks', () => {
    const core = loadLifecycleModule();
    const lc = core.createLifecycle({ logger: { warn() {} } });
    assert.throws(() => lc.defineFeature(null), /must be an object/i);
    assert.throws(() => lc.defineFeature({ id: '', init() {}, destroy() {} }), /id is required/i);
    assert.throws(() => lc.defineFeature({ id: 'x', destroy() {} }), /init missing/i);
    assert.throws(() => lc.defineFeature({ id: 'x', init() {} }), /destroy missing/i);
    // Same id twice is rejected.
    lc.defineFeature({ id: 'ok', init() {}, destroy() {} });
    assert.throws(() => lc.defineFeature({ id: 'ok', init() {}, destroy() {} }),
        /already defined/i);
});

test('v5.0.0 feature-lifecycle: category must be in CATEGORIES if provided', () => {
    const core = loadLifecycleModule();
    const lc = core.createLifecycle({ logger: { warn() {} } });
    assert.throws(
        () => lc.defineFeature({ id: 'bad-cat', category: 'not-a-category', init() {}, destroy() {} }),
        /is not in CATEGORIES/
    );
    assert.doesNotThrow(() => lc.defineFeature({
        id: 'good-cat', category: 'shell', init() {}, destroy() {}
    }));
});

test('v5.0.0 feature-lifecycle: start/apply/destroy aborts in-flight async on destroy', () => {
    const core = loadLifecycleModule();
    const lc = core.createLifecycle({ logger: { warn() {} } });
    let observedSignal = null;
    let initCalls = 0;
    let destroyCalls = 0;
    let applyCalls = 0;
    lc.defineFeature({
        id: 'demo',
        category: 'shell',
        init(ctx) { initCalls++; observedSignal = ctx.signal; },
        apply(_ctx, value) { applyCalls++; void value; },
        destroy() { destroyCalls++; }
    });
    lc.start('demo');
    assert.equal(initCalls, 1);
    assert.equal(observedSignal && observedSignal.aborted, false,
        'signal must be live after start');
    lc.apply('demo', { foo: 1 });
    assert.equal(applyCalls, 1);
    lc.destroy('demo');
    assert.equal(destroyCalls, 1);
    assert.equal(observedSignal.aborted, true,
        'destroy must abort the AbortController');
});

test('v5.0.0 feature-lifecycle: route-token bumps on notifyRouteChange', () => {
    const core = loadLifecycleModule();
    const lc = core.createLifecycle({ logger: { warn() {} } });
    const initial = lc.getRouteToken();
    lc.notifyRouteChange();
    assert.equal(lc.getRouteToken(), initial + 1);
    lc.notifyRouteChange();
    assert.equal(lc.getRouteToken(), initial + 2);
});

test('v5.0.0 feature-lifecycle: destroy is best-effort and never throws on sub-failures', () => {
    const core = loadLifecycleModule();
    const lc = core.createLifecycle({ logger: { warn() {} } });
    lc.defineFeature({
        id: 'flaky',
        category: 'shell',
        init() {},
        destroy() { throw new Error('teardown blew up'); }
    });
    lc.start('flaky');
    assert.doesNotThrow(() => lc.destroy('flaky'),
        'destroy must swallow sub-failures so callers can always tear down');
    const snap = lc.snapshot().find((s) => s.id === 'flaky');
    assert.ok(snap.lastError, 'lastError must capture the teardown failure for diagnostics');
});

test('v5.0.0 policy-profile: effective profile resolution honours both flags', () => {
    const core = loadPolicyProfileModule();
    const pp = core.createPolicyProfile();
    assert.equal(pp.resolveEffectiveProfile({}), 'store-safe');
    assert.equal(pp.resolveEffectiveProfile({ safeStoreProfile: true }), 'store-safe');
    assert.equal(pp.resolveEffectiveProfile({ githubFullProfile: true }), 'github-full');
    assert.equal(pp.resolveEffectiveProfile({ safeStoreProfile: false }), 'github-full');
    assert.equal(pp.resolveEffectiveProfile({ safeStoreProfile: true, githubFullProfile: true }),
        'github-full');
});

test('v5.0.0 policy-profile: github-full-only schema entries are hidden under store-safe', () => {
    const core = loadPolicyProfileModule();
    const pp = core.createPolicyProfile();
    assert.equal(pp.isKeyAllowedInProfile('ageRestrictionBypass', 'store-safe'), false);
    assert.equal(pp.isKeyAllowedInProfile('ageRestrictionBypass', 'github-full'), true);
    assert.equal(pp.isKeyAllowedInProfile('sponsorBlock', 'store-safe'), true);
    assert.equal(pp.isKeyAllowedInProfile('sponsorBlock', 'github-full'), true);
});

test('v5.0.0 policy-profile: scrubber removes apiKey-shaped values from exports', () => {
    const core = loadPolicyProfileModule();
    const pp = core.createPolicyProfile();
    const input = {
        aiSummaryApiKey: 'sk-test-very-secret',
        sponsorBlock: true,
        safeStoreProfile: true
    };
    const { settings: out } = pp.buildExportSnapshot(input);
    assert.equal('aiSummaryApiKey' in out, false,
        'aiSummaryApiKey must be scrubbed from export');
    assert.equal(out.sponsorBlock, true);
});

test('v5.0.0 policy-profile: store-safe export reverts github-full keys to schema defaults', () => {
    const core = loadPolicyProfileModule();
    const pp = core.createPolicyProfile();
    const input = {
        ageRestrictionBypass: true,
        sponsorBlock: true,
        safeStoreProfile: true
    };
    const { settings: out, effective } = pp.buildExportSnapshot(input);
    assert.equal(effective, 'store-safe');
    assert.equal(out.ageRestrictionBypass, false,
        'github-full toggle must revert to its schema default on a store-safe export');
    assert.equal(out.sponsorBlock, true);
});

test('v5.0.0 policy-profile: countByProfile partitions the schema cleanly', () => {
    const core = loadPolicyProfileModule();
    const pp = core.createPolicyProfile();
    const storeSafe = pp.countByProfile('store-safe');
    const githubFull = pp.countByProfile('github-full');
    const { SETTINGS_SCHEMA } = settingsSchemaModule;
    const nonInternal = SETTINGS_SCHEMA.filter((e) => !e.internal).length;
    assert.equal(storeSafe.visible.length + storeSafe.hidden.length, nonInternal);
    assert.equal(githubFull.visible.length + githubFull.hidden.length, nonInternal);
    assert.ok(githubFull.visible.length >= storeSafe.visible.length);
});

test('v5.0.0 manifest content_scripts load new core modules before ytkit.js', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        const ytkitIdx = cs.js.indexOf('ytkit.js');
        if (ytkitIdx === -1) continue;
        for (const mod of ['core/settings-schema.js', 'core/feature-lifecycle.js', 'core/policy-profile.js']) {
            const modIdx = cs.js.indexOf(mod);
            assert.notEqual(modIdx, -1, 'manifest content_scripts must include ' + mod);
            assert.ok(modIdx < ytkitIdx, mod + ' must load before ytkit.js');
        }
    }
});

// ── v5.1.0 NX1: selector-health + lifecycle singleton ──

function loadSelectorHealthModule() {
    const stub = {};
    const prev = global.YTKitCore;
    global.YTKitCore = stub;
    delete require.cache[require.resolve('../extension/core/selector-health.js')];
    require('../extension/core/selector-health.js');
    global.YTKitCore = prev;
    return stub;
}

test('v5.1.0 selector-health: summarize aggregates per-surface counts', () => {
    const { summarizeSelectorHealth } = require('../extension/core/selector-health.js');
    const snapshot = [
        { surface: 'feed', hitCount: 90, missCount: 5, errorCount: 0, highChurn: true, needsFreshCapture: false },
        { surface: 'player', hitCount: 50, missCount: 0, errorCount: 0, highChurn: false, needsFreshCapture: true },
        { surface: 'comments', hitCount: 0, missCount: 0, errorCount: 0, highChurn: false, needsFreshCapture: false }
    ];
    const s = summarizeSelectorHealth(snapshot);
    assert.equal(s.surfaces, 3);
    assert.equal(s.highChurnSurfaces, 1);
    assert.equal(s.needsFreshCapture, 1);
    assert.equal(s.surfacesWithMisses, 1);
    assert.equal(s.totalAttempts, 145);
    assert.equal(s.totalHits, 140);
    assert.equal(s.totalMisses, 5);
    assert.equal(s.totalErrors, 0);
    // 5 misses / 145 attempts ≈ 3.45%
    assert.ok(s.missRate >= 3.4 && s.missRate <= 3.5);
});

test('v5.1.0 selector-health: rankProblemSurfaces excludes zero-attempt surfaces', () => {
    const { rankSelectorProblems } = require('../extension/core/selector-health.js');
    const snapshot = [
        { surface: 'untested',   hitCount: 0,  missCount: 0,  errorCount: 0 },
        { surface: 'healthy',    hitCount: 100, missCount: 0, errorCount: 0 },
        { surface: 'flaky',      hitCount: 10, missCount: 90, errorCount: 0 },
        { surface: 'errored',    hitCount: 5,  missCount: 0,  errorCount: 5 }
    ];
    const ranked = rankSelectorProblems(snapshot, 10);
    assert.equal(ranked.length, 2, 'untested and healthy must not appear');
    assert.equal(ranked[0].surface, 'flaky', 'highest failure rate must rank first');
    assert.equal(ranked[1].surface, 'errored');
});

test('v5.1.0 selector-health: copy report begins with product header and lists top problems', () => {
    const { formatSelectorCopyReport } = require('../extension/core/selector-health.js');
    const snapshot = [
        { surface: 'feed', hitCount: 50, missCount: 50, errorCount: 0, highChurn: true, needsFreshCapture: false }
    ];
    const report = formatSelectorCopyReport(snapshot, {
        productVersion: '4.8.0',
        browserUA: 'unit-test',
        exportedAt: '2026-05-21T00:00:00Z',
        topN: 3
    });
    assert.match(report, /^Astra Deck selector-health report/);
    assert.match(report, /product: 4\.8\.0/);
    assert.match(report, /exportedAt: 2026-05-21T00:00:00Z/);
    assert.match(report, /miss rate:\s+50%/);
    assert.match(report, /- feed: 50\/100 attempts failed \(50%\)\s+\[high-churn\]/);
    // Investigation guidance must always be present in non-clean reports.
    assert.match(report, /Investigate by:/);
});

test('v5.1.0 selector-health: copy report announces a clean tracker when no problems exist', () => {
    const { formatSelectorCopyReport } = require('../extension/core/selector-health.js');
    const snapshot = [
        { surface: 'feed', hitCount: 100, missCount: 0, errorCount: 0 }
    ];
    const report = formatSelectorCopyReport(snapshot, { productVersion: '4.8.0' });
    assert.match(report, /No problem surfaces/);
});

test('v5.1.0 selector-health: createSelectorHealth uses pluggable provider for tests', () => {
    const core = loadSelectorHealthModule();
    let providerCalls = 0;
    const sh = core.createSelectorHealth({
        snapshotProvider: () => {
            providerCalls += 1;
            return [{ surface: 'feed', hitCount: 9, missCount: 1, errorCount: 0 }];
        },
        topN: 1
    });
    const r1 = sh.getReport();
    assert.equal(providerCalls, 1);
    assert.equal(r1.summary.totalAttempts, 10);
    assert.equal(r1.topProblems.length, 1);
    const text = sh.getCopyReport({ productVersion: '4.8.0' });
    assert.equal(providerCalls, 2);
    assert.match(text, /miss rate:\s+10%/);
});

test('v5.1.0 feature-lifecycle: getLifecycle returns a stable singleton', () => {
    delete require.cache[require.resolve('../extension/core/feature-lifecycle.js')];
    const stub = {};
    const prev = global.YTKitCore;
    global.YTKitCore = stub;
    require('../extension/core/feature-lifecycle.js');
    global.YTKitCore = prev;
    const a = stub.getLifecycle({ logger: { warn() {} } });
    const b = stub.getLifecycle();
    assert.equal(a, b, 'getLifecycle must return the same instance on repeated calls');
    // Reset hook used by tests must drop the singleton so a fresh
    // factory call seeds a new instance.
    stub._resetLifecycleForTests();
    const c = stub.getLifecycle();
    assert.notEqual(c, a, 'resetLifecycleForTests must release the prior singleton');
});

test('v5.1.0 manifest content_scripts include selector-health before ytkit.js', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        const ytkitIdx = cs.js.indexOf('ytkit.js');
        if (ytkitIdx === -1) continue;
        const healthIdx = cs.js.indexOf('core/selector-health.js');
        assert.notEqual(healthIdx, -1, 'manifest content_scripts must include core/selector-health.js');
        assert.ok(healthIdx < ytkitIdx, 'core/selector-health.js must load before ytkit.js');
        // Must load AFTER the policy-profile module so the v5.0.0
        // module load order remains semantically deterministic.
        const policyIdx = cs.js.indexOf('core/policy-profile.js');
        assert.ok(policyIdx < healthIdx,
            'core/selector-health.js must load after core/policy-profile.js');
    }
});

// ── v4.9.0 NX1: lifecycle-route bridge ──

function loadBridgeModule() {
    const stub = {};
    const prev = global.YTKitCore;
    global.YTKitCore = stub;
    delete require.cache[require.resolve('../extension/core/lifecycle-route-bridge.js')];
    require('../extension/core/lifecycle-route-bridge.js');
    global.YTKitCore = prev;
    return stub;
}

test('v4.9.0 lifecycle-route-bridge is a no-op when dependencies are missing', () => {
    // Loaded against an empty YTKitCore stub — neither addNavigateRule nor
    // getLifecycle is present. The module must not throw at load time
    // and must not flip the installed flag.
    const stub = loadBridgeModule();
    assert.equal(stub.__lifecycleRouteBridgeInstalled, undefined,
        'bridge must not mark itself installed without dependencies');
    // Calling the named installer directly with the same empty deps also
    // returns false instead of throwing.
    assert.equal(stub.installLifecycleRouteBridge({}), false);
});

test('v4.9.0 lifecycle-route-bridge registers a navigate rule that bumps the route token', () => {
    const stub = loadBridgeModule();
    let registered = null;
    let bumps = 0;
    const fakeLifecycle = {
        notifyRouteChange() { bumps += 1; }
    };
    const ok = stub.installLifecycleRouteBridge({
        addNavigateRule(id, fn) { registered = { id, fn }; },
        getLifecycle() { return fakeLifecycle; },
        logger: { warn() {} }
    });
    assert.equal(ok, true);
    assert.equal(registered.id, 'astra-lifecycle-route-bridge');
    // Simulate three SPA navigations. navigation.js never inspects the
    // body argument — passing a plain stub lets the test run without a
    // DOM globals dependency.
    const stubBody = {};
    registered.fn(stubBody, false);
    registered.fn(stubBody, true);
    registered.fn(stubBody, false);
    assert.equal(bumps, 3, 'each navigate rule invocation must bump the route token once');
});

test('v4.9.0 lifecycle-route-bridge swallows lifecycle errors so navigation stays intact', () => {
    const stub = loadBridgeModule();
    let warned = 0;
    let registered = null;
    stub.installLifecycleRouteBridge({
        addNavigateRule(id, fn) { registered = fn; },
        getLifecycle() {
            return {
                notifyRouteChange() { throw new Error('lifecycle blew up'); }
            };
        },
        logger: {
            warn() { warned += 1; }
        }
    });
    const stubBody = {};
    assert.doesNotThrow(() => registered(stubBody, false),
        'a lifecycle-side failure must not propagate through the navigate rule');
    assert.equal(warned, 1, 'failure must be logged for diagnostics');
});

test('v4.9.0 manifest content_scripts load lifecycle-route-bridge after navigation and lifecycle, before ytkit.js', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        const ytkitIdx = cs.js.indexOf('ytkit.js');
        if (ytkitIdx === -1) continue;
        const bridgeIdx = cs.js.indexOf('core/lifecycle-route-bridge.js');
        assert.notEqual(bridgeIdx, -1, 'lifecycle-route-bridge.js must be present');
        assert.ok(bridgeIdx < ytkitIdx, 'bridge must load before ytkit.js');
        const navIdx = cs.js.indexOf('core/navigation.js');
        const lcIdx = cs.js.indexOf('core/feature-lifecycle.js');
        assert.ok(navIdx > -1 && navIdx < bridgeIdx, 'bridge must load after core/navigation.js');
        assert.ok(lcIdx > -1 && lcIdx < bridgeIdx, 'bridge must load after core/feature-lifecycle.js');
    }
});

// ── v4.10.0 NX1: data-flow ──

function loadDataFlowModule() {
    const stub = {};
    const prev = global.YTKitCore;
    global.YTKitCore = stub;
    delete require.cache[require.resolve('../extension/core/data-flow.js')];
    require('../extension/core/data-flow.js');
    global.YTKitCore = prev;
    return stub;
}

test('v4.10.0 data-flow catalogue enumerates every external origin', () => {
    const core = loadDataFlowModule();
    const df = core.createDataFlow();
    const origins = df.getOrigins({});
    // Each entry must declare the minimum required fields.
    for (const e of origins) {
        assert.equal(typeof e.origin, 'string');
        assert.equal(typeof e.purpose, 'string');
        assert.ok(Array.isArray(e.requiredByFeatures));
        assert.ok(['no-cookies', 'byo-key', 'local-loopback', 'none'].includes(e.credentialsPolicy));
        assert.ok(['store-safe', 'github-full'].includes(e.profile));
        assert.ok(['safe', 'api', 'local-companion', 'experimental', 'store-risk'].includes(e.riskBand));
    }
    // Sanity: at least the canonical origins are present.
    const originStrings = origins.map((e) => e.origin);
    for (const expected of [
        'https://*.youtube.com',
        'https://i.ytimg.com',
        'https://sponsor.ajay.app',
        'https://returnyoutubedislikeapi.com',
        'http://127.0.0.1:11434'
    ]) {
        assert.ok(originStrings.includes(expected),
            'catalogue must include ' + expected);
    }
});

test('v4.10.0 data-flow currentlyActive flips based on driving-feature toggles', () => {
    const core = loadDataFlowModule();
    const df = core.createDataFlow();
    const cold = df.getOrigins({});
    // With no settings, no driving features are active.
    for (const e of cold) {
        assert.equal(e.currentlyActive, false, e.origin + ' must be inactive in cold settings');
    }
    // Enabling SponsorBlock should activate sponsor.ajay.app.
    const warm = df.getOrigins({ sponsorBlock: true });
    const sb = warm.find((e) => e.origin === 'https://sponsor.ajay.app');
    assert.equal(sb.currentlyActive, true);
});

test('v4.10.0 data-flow manifestPermission resolves against the live host_permissions list', () => {
    const core = loadDataFlowModule();
    const df = core.createDataFlow({
        hostPermissions: [
            'https://*.youtube.com/*',
            'https://sponsor.ajay.app/*'
        ]
    });
    const origins = df.getOrigins({});
    const youtube = origins.find((e) => e.origin === 'https://*.youtube.com');
    assert.equal(youtube.manifestPermission, 'https://*.youtube.com/*');
    const sb = origins.find((e) => e.origin === 'https://sponsor.ajay.app');
    assert.equal(sb.manifestPermission, 'https://sponsor.ajay.app/*');
    // The Reddit origin is not in our injected list — must report null.
    const reddit = origins.find((e) => e.origin === 'https://www.reddit.com');
    assert.equal(reddit.manifestPermission, null);
});

test('v4.10.0 data-flow.summarise counts by credentialsPolicy / profile / riskBand', () => {
    const core = loadDataFlowModule();
    const df = core.createDataFlow();
    const s = df.summarise({ sponsorBlock: true, deArrow: true });
    assert.ok(s.totalCatalogued > 0);
    assert.ok(s.currentlyActive >= 1, 'sponsor.ajay.app at minimum must be active');
    // The store-safe vs github-full partition must cover every entry.
    const byProfile = s.byProfile;
    assert.equal((byProfile['store-safe'] || 0) + (byProfile['github-full'] || 0), s.totalCatalogued);
});

test('v4.10.0 data-flow live manifest host_permissions cover every store-safe catalogued origin', () => {
    const core = loadDataFlowModule();
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    const df = core.createDataFlow({ manifest });
    const origins = df.getOrigins({});
    for (const e of origins) {
        if (e.profile !== 'store-safe') continue;
        // The 127.0.0.1 port-range placeholder represents 6 manifest entries;
        // skip it from this gate (it's covered by host_permissions audits
        // elsewhere) — only validate fixed-host store-safe origins.
        if (e.origin.startsWith('http://127.0.0.1')) continue;
        assert.notEqual(e.manifestPermission, null,
            'store-safe origin ' + e.origin + ' must have a matching host_permission in manifest.json');
    }
});

test('v4.10.0 manifest content_scripts include data-flow.js before ytkit.js', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        const ytkitIdx = cs.js.indexOf('ytkit.js');
        if (ytkitIdx === -1) continue;
        const dfIdx = cs.js.indexOf('core/data-flow.js');
        assert.notEqual(dfIdx, -1, 'manifest must include core/data-flow.js');
        assert.ok(dfIdx < ytkitIdx, 'data-flow.js must load before ytkit.js');
    }
});
