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
    const end = ytkitSource.indexOf('    ];', start);
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
    // loses the reveal.
    const addStart = backgroundSource.indexOf('_pendingReveals.add(downloadId)');
    assert.ok(addStart > -1, 'DOWNLOAD_FILE handler must still populate _pendingReveals');
    const addBlock = backgroundSource.slice(addStart, addStart + 200);
    assert.match(
        addBlock,
        /_persistPendingReveals\s*\(\s*\)/,
        'DOWNLOAD_FILE handler must mirror the add into storage.session'
    );
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

test('Firefox build rewrites Ctrl+Shift+Y (reserved by Firefox Downloads) to Ctrl+Alt+Y', () => {
    // Chrome manifest is the build input — stays on the original shortcut.
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'),
        'utf8'
    ));
    assert.equal(
        manifest.commands?.['toggle-control-center']?.suggested_key?.default,
        'Ctrl+Shift+Y',
        'Chrome manifest must keep Ctrl+Shift+Y as the default (no vendor conflict there)'
    );

    // Run the actual patch function on a deep copy of the Chrome manifest —
    // this catches drift in either the Chrome-side source spelling or the
    // patch's internal string literals, which a pure source-regex test
    // would silently no-op through.
    const { patchManifestForFirefox } = require('../scripts/manifest-patch');
    const ffManifest = JSON.parse(JSON.stringify(manifest));
    patchManifestForFirefox(ffManifest);

    assert.equal(
        ffManifest.commands?.['toggle-control-center']?.suggested_key?.default,
        'Ctrl+Alt+Y',
        'Firefox-patched manifest must carry Ctrl+Alt+Y'
    );
    assert.notEqual(
        ffManifest.commands?.['toggle-control-center']?.suggested_key?.default,
        'Ctrl+Shift+Y',
        'Firefox-patched manifest must NOT retain the reserved Ctrl+Shift+Y default'
    );
    // The patch must also apply the Firefox-specific gecko + background
    // transformations — a regression that dropped those would silently
    // break Firefox at load time.
    assert.equal(ffManifest.browser_specific_settings?.gecko?.id, 'ytkit@sysadmindoc.github.io');
    assert.equal(ffManifest.browser_specific_settings?.gecko?.strict_min_version, '128.0');
    assert.ok(
        Array.isArray(ffManifest.background?.scripts) && ffManifest.background.scripts.length > 0,
        'Firefox background must be a scripts[] array, not a service_worker entry'
    );

    // Running the patch twice must stay idempotent — protects against a
    // re-run on an already-patched manifest (the guard on 'Ctrl+Shift+Y'
    // ensures the second pass is a no-op for the shortcut).
    patchManifestForFirefox(ffManifest);
    assert.equal(
        ffManifest.commands?.['toggle-control-center']?.suggested_key?.default,
        'Ctrl+Alt+Y',
        'Patch must be idempotent — a second application must not flip the shortcut back'
    );
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
// after a tag push. A developer who bumps three of four sources locally
// (e.g. forgets to run `node sync-userscript.js`) won't notice until CI
// fails post-tag. H10 ports the same check into a local `npm run check`
// hook so drift is caught pre-push.

test('check-versions.js exists and is wired into npm run check', () => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'check-versions.js');
    assert.ok(fs.existsSync(scriptPath), 'scripts/check-versions.js must exist');
    const scriptSource = fs.readFileSync(scriptPath, 'utf8');
    // Confirm the four canonical sources are read.
    assert.match(scriptSource, /readPackageVersion/, 'must read package.json version');
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
        'check-versions must pass on a clean tree — if this fails, version drift exists somewhere in the four canonical sources');
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

test('_locales/en/messages.json contains the four required manifest-level keys', () => {
    const localesPath = path.join(__dirname, '..', 'extension', '_locales', 'en', 'messages.json');
    const messages = JSON.parse(fs.readFileSync(localesPath, 'utf8'));
    for (const key of ['extName', 'extDescription', 'extActionTitle', 'toggleControlCenterDesc']) {
        assert.ok(Object.prototype.hasOwnProperty.call(messages, key),
            `messages.json must define "${key}"`);
        assert.equal(typeof messages[key].message, 'string',
            `messages.json["${key}"].message must be a string`);
        assert.ok(messages[key].message.length > 0,
            `messages.json["${key}"].message must not be empty`);
    }
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
    assert.equal(
        manifest.commands?.['toggle-control-center']?.description,
        '__MSG_toggleControlCenterDesc__',
        'manifest command description must use __MSG_toggleControlCenterDesc__ i18n reference'
    );
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
    const { spawnSync } = require('child_process');
    const result = spawnSync('npm', ['run', 'lint'], {
        stdio: 'pipe',
        cwd: path.join(__dirname, '..'),
        shell: true
    });
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
    // Buttons found in popup.html: openPanel, export-btn, import-btn, reset-btn,
    // clearSearch, health-copy-btn, health-clear-btn, confirm-cancel-btn, confirm-accept-btn
    const buttonIds = [
        'openPanel', 'export-btn', 'import-btn', 'reset-btn',
        'clearSearch', 'health-copy-btn', 'health-clear-btn'
    ];
    for (const id of buttonIds) {
        const hasAriaLabel = popupHtmlSource.includes(`id="${id}"`) && 
                             popupHtmlSource.includes(`aria-label=`);
        const hasVisibleText = popupHtmlSource.match(
            new RegExp(`id="${id}"[^>]*>[^<]+<`, '')
        );
        assert.ok(
            hasAriaLabel || hasVisibleText,
            `Button ${id} must have aria-label or visible text`
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
        '.toggle:focus-visible'
    ]) {
        assert.ok(
            cssSource.includes(selector),
            `${selector} must be defined in popup.css for keyboard focus visibility`
        );
    }
});

test('health banner colors pass WCAG AA contrast (4.5:1 for text)', () => {
    const { spawnSync } = require('child_process');
    const result = spawnSync('npm', ['run', 'audit:contrast'], {
        stdio: 'pipe',
        cwd: path.join(__dirname, '..'),
        shell: true
    });
    assert.equal(result.status, 0,
        'npm run audit:contrast must pass — all health banner colors must meet WCAG AA');
});

test('npm run audit:a11y reports no popup a11y issues', () => {
    const { spawnSync } = require('child_process');
    const result = spawnSync('npm', ['run', 'audit:a11y'], {
        stdio: 'pipe',
        cwd: path.join(__dirname, '..'),
        shell: true
    });
    assert.equal(result.status, 0,
        'npm run audit:a11y must pass — all buttons must be labeled, dialog semantics must be present');
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
    // appear inside the PredicateSandbox IIFE the safety promise is broken.
    const start = ytkitSource.indexOf('const PredicateSandbox = (() => {');
    assert.ok(start > -1, 'PredicateSandbox IIFE must exist in ytkit.js');
    // The IIFE ends at the matching '})()' followed by ';'. We bound the
    // search by 20 KB which is comfortably larger than the implementation.
    const block = ytkitSource.slice(start, start + 20000);
    assert.ok(!/\beval\s*\(/.test(block),
        'PredicateSandbox must not call eval()');
    assert.ok(!/new\s+Function\s*\(/.test(block),
        'PredicateSandbox must not use new Function()');
    assert.ok(!/\bwith\s*\(/.test(block),
        'PredicateSandbox must not use with()');
});

test('PredicateSandbox enforces ReDoS guard on user-supplied match/test patterns', () => {
    const start = ytkitSource.indexOf('const PredicateSandbox = (() => {');
    const block = ytkitSource.slice(start, start + 20000);
    assert.match(block, /hasUnsafeQuantifiers/,
        'PredicateSandbox must expose a ReDoS guard helper');
    assert.match(block, /nested quantifiers \(ReDoS risk\)/,
        'PredicateSandbox must reject regex patterns with nested quantifiers');
});

test('PredicateSandbox compile returns ok:false with error position on parse failure', () => {
    const start = ytkitSource.indexOf('const PredicateSandbox = (() => {');
    const block = ytkitSource.slice(start, start + 20000);
    assert.match(block, /ok:\s*false[\s,]*error/,
        'compile() must return an { ok:false, error, position } shape on failure');
    assert.match(block, /position:\s*e instanceof PredicateError/,
        'compile() must surface PredicateError positions to the caller');
});

test('PredicateSandbox runtime budget + circuit breaker auto-disable', () => {
    const start = ytkitSource.indexOf('const PredicateSandbox = (() => {');
    const block = ytkitSource.slice(start, start + 20000);
    assert.match(block, /BUDGET_MS\s*=\s*5/,
        'Per-card budget must be 5 ms');
    assert.match(block, /ERROR_CIRCUIT\s*=\s*10/,
        'Circuit must open after 10 consecutive errors');
    assert.match(block, /circuitOpen\s*=\s*true/,
        'circuitOpen flag must be flipped when the budget or error gate trips');
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
    const block = ytkitSource.slice(start, start + 6000);
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
    assert.match(block, /setInterval\(\(\) => this\._render\(\),\s*30000\)/,
        'must poll every 30 s');
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
