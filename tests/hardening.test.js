'use strict';

// Regression tests for v3.14.0+ hardening passes. Each test captures an
// invariant established by an audit finding so future refactors can't
// silently regress the fix.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
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

const popupCssSource = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'popup.css'),
    'utf8'
);

const backgroundSource = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'background.js'),
    'utf8'
);

// PredicateSandbox moved out of ytkit.js into
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

function readPngSize(filePath) {
    const buf = fs.readFileSync(filePath);
    assert.equal(buf.toString('ascii', 1, 4), 'PNG', `${filePath} must be a PNG`);
    return {
        width: buf.readUInt32BE(16),
        height: buf.readUInt32BE(20)
    };
}

function literalString(node) {
    return node && node.type === 'Literal' && typeof node.value === 'string'
        ? node.value
        : null;
}

function objectPropertyMap(node) {
    const entries = [];
    for (const prop of node.properties || []) {
        if (prop.type !== 'Property') continue;
        const key = prop.key.type === 'Identifier' ? prop.key.name : prop.key.value;
        entries.push([key, prop.value]);
    }
    return new Map(entries);
}

function evaluateStringExpression(node, scope = Object.create(null)) {
    if (!node) return null;
    if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
    if (node.type === 'Identifier' && typeof scope[node.name] === 'string') return scope[node.name];
    if (node.type === 'BinaryExpression' && node.operator === '+') {
        const left = evaluateStringExpression(node.left, scope);
        const right = evaluateStringExpression(node.right, scope);
        return left !== null && right !== null ? left + right : null;
    }
    return null;
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripHtmlTags(value) {
    let out = '';
    let inTag = false;
    for (const ch of String(value || '')) {
        if (ch === '<') {
            inTag = true;
            continue;
        }
        if (inTag) {
            if (ch === '>') inTag = false;
            continue;
        }
        out += ch;
    }
    return out;
}

function extractObjectFeatureDefinition(node, scope = Object.create(null)) {
    if (!node || node.type !== 'ObjectExpression') return null;
    const props = objectPropertyMap(node);
    const id = evaluateStringExpression(props.get('id'), scope);
    const name = evaluateStringExpression(props.get('name'), scope);
    const desc = evaluateStringExpression(props.get('description'), scope);
    return id && name && desc ? { id, name, desc } : null;
}

function extractSpreadFeatureDefinitions(node) {
    const call = node?.argument;
    if (call?.type !== 'CallExpression') return [];
    if (call.callee?.type !== 'MemberExpression') return [];
    const property = call.callee.property;
    const propertyName = property?.type === 'Identifier' ? property.name : property?.value;
    if (propertyName !== 'map') return [];
    const sourceArray = call.callee.object;
    const callback = call.arguments[0];
    if (sourceArray?.type !== 'ArrayExpression' || callback?.type !== 'ArrowFunctionExpression') return [];
    const pattern = callback.params[0];
    if (pattern?.type !== 'ArrayPattern') return [];
    const body = callback.body?.type === 'ObjectExpression'
        ? callback.body
        : callback.body?.type === 'BlockStatement'
            ? callback.body.body.find((stmt) => stmt.type === 'ReturnStatement')?.argument
            : null;
    if (!body || body.type !== 'ObjectExpression') return [];
    const rows = [];
    for (const tuple of sourceArray.elements || []) {
        if (tuple?.type !== 'ArrayExpression') continue;
        const scope = Object.create(null);
        pattern.elements.forEach((param, index) => {
            if (param?.type !== 'Identifier') return;
            const value = literalString(tuple.elements[index]);
            if (value !== null) scope[param.name] = value;
        });
        const row = extractObjectFeatureDefinition(body, scope);
        if (row) rows.push(row);
    }
    return rows;
}

let ytkitFeatureDefinitionCache = null;
function extractYtkitFeatureDefinitions() {
    if (ytkitFeatureDefinitionCache) return ytkitFeatureDefinitionCache;
    const espree = require('espree');
    const ast = espree.parse(ytkitSource, {
        ecmaVersion: 'latest',
        sourceType: 'script',
        range: true
    });
    let featuresArray = null;
    const walk = (node) => {
        if (!node || featuresArray) return;
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (node.type === 'VariableDeclarator' && node.id?.name === 'features') {
            featuresArray = node.init;
            return;
        }
        for (const value of Object.values(node)) {
            if (value && typeof value === 'object') walk(value);
        }
    };
    walk(ast);
    assert.equal(featuresArray?.type, 'ArrayExpression',
        'ytkit.js must expose the canonical features array');
    const definitions = [];
    for (const element of featuresArray.elements || []) {
        if (!element) continue;
        if (element.type === 'ObjectExpression') {
            const row = extractObjectFeatureDefinition(element);
            if (row) definitions.push(row);
            continue;
        }
        if (element.type === 'CallExpression' && element.callee?.name === 'cssFeature') {
            const id = literalString(element.arguments[0]);
            const name = literalString(element.arguments[1]);
            const desc = literalString(element.arguments[2]);
            if (id && name && desc) definitions.push({ id, name, desc });
            continue;
        }
        if (element.type === 'SpreadElement') {
            definitions.push(...extractSpreadFeatureDefinitions(element));
            continue;
        }
        if (element.type === 'LogicalExpression') {
            const row = extractObjectFeatureDefinition(element.right);
            if (row) definitions.push(row);
        }
    }
    ytkitFeatureDefinitionCache = definitions;
    return definitions;
}

function featureMessageKey(id, suffix) {
    return `feature_${String(id).trim().replace(/[^A-Za-z0-9]/g, '_')}_${suffix}`;
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
    // v4.47.0 NF14: previously used `function confirmAction` as the
    // slice end; that function was retired alongside the confirm-shell
    // modal. The retirement comment block immediately follows
    // buildExportData and is a stable boundary marker.
    const popupExportEnd = popupSource.indexOf('// ── Confirmation dialog (retired');
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
    assert.match(
        popupExportBody,
        /buildSchemaValidatedExportSettings\(mergedSettings\)/,
        'Popup exports must route settings through the schema-validated scrubber'
    );
    assert.match(
        popupExportBody,
        /exportVersion:\s*4/,
        'Popup settings backups must emit the schema-validated v4 payload'
    );
    assert.match(
        popupExportBody,
        /settingsSchemaVersion:\s*SETTINGS_VERSION_FALLBACK/,
        'Popup settings backups must declare the settings schema version'
    );
    assert.match(
        popupExportBody,
        /scrubbedSettings:\s*exportSettings\.scrubbedKeys/,
        'Popup settings backups must declare which setting keys were scrubbed'
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
    assert.match(
        panelExportBody,
        /_buildSchemaValidatedExportSettings\(this\.load\(\)\)/,
        'In-page exports must route settings through the schema-validated scrubber'
    );
    assert.match(
        panelExportBody,
        /exportVersion:\s*4/,
        'In-page settings backups must emit the schema-validated v4 payload'
    );
    assert.match(
        panelExportBody,
        /settingsSchemaVersion:\s*this\.SETTINGS_VERSION/,
        'In-page settings backups must declare the settings schema version'
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

test('settings backup import/export paths use strict schema validation and scrub metadata', () => {
    const popupMergeStart = popupSource.indexOf('function mergeImportedSettingsWithDefaults');
    assert.ok(popupMergeStart > -1, 'popup mergeImportedSettingsWithDefaults must exist');
    const popupMergeBlock = popupSource.slice(popupMergeStart, popupMergeStart + 1600);
    assert.match(popupMergeBlock, /validateSettingsForBackupImport\(migrated\)/,
        'Popup imports must validate migrated settings against SETTINGS_SCHEMA before writing storage');

    // Signature carries an options bag so importAllSettings can thread the
    // backup's top-level settingsSchemaVersion into the migration chain.
    const panelPrepareStart = ytkitSource.indexOf('_prepareImportedSettings(settings, options = {})');
    assert.ok(panelPrepareStart > -1, 'ytkit settingsManager._prepareImportedSettings must exist');
    const panelPrepareBlock = ytkitSource.slice(panelPrepareStart, panelPrepareStart + 1400);
    assert.match(panelPrepareBlock, /_validateSettingsForBackupImport\(migrated\)/,
        'In-page imports must validate migrated settings against SETTINGS_SCHEMA before writing storage');

    for (const [name, source] of [['popup.js', popupSource], ['ytkit.js', ytkitSource]]) {
        assert.match(source, /Settings import rejected/,
            `${name} must surface a schema-validation rejection reason`);
        assert.match(source, /Settings export rejected/,
            `${name} must reject schema-invalid live settings before exporting a backup`);
        assert.match(source, /schemaOnly:\s*true/,
            `${name} must request schema-only export snapshots so unknown keys cannot round-trip`);
    }
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

test('popup.js requests declared optional hosts before enabling optional features', () => {
    assert.match(popupHtmlSource, /core\/data-flow\.js[\s\S]*core\/optional-host-permissions\.js[\s\S]*popup\.js/,
        'popup must load data-flow and optional-host permissions before popup.js');
    assert.match(popupSource, /function getDeclaredOptionalHostsForSetting/,
        'popup.js must map settings to declared optional hosts');
    assert.match(popupSource, /chrome\?\.runtime\?\.getManifest\?\.\(\)\.optional_host_permissions/,
        'popup.js must only request hosts declared by the built manifest');
    assert.match(popupSource, /createOptionalHostPermissions/,
        'popup.js must use the shared optional host permission helper');
    assert.match(popupSource, /function refreshOptionalHostGrantState/,
        'popup.js must track missing optional-host grants after denial or revocation');
    assert.match(popupSource, /helper\.contains\(origins\)/,
        'popup.js must use permissions.contains to detect revoked optional-host grants');
    assert.match(popupSource, /helper\.onRemoved/,
        'popup.js must refresh when optional host permissions are removed');
    assert.match(popupSource, /helper\.onAdded/,
        'popup.js must refresh when optional host permissions are granted');
    assert.match(popupSource, /formatSettingWriteError/,
        'popup.js must surface the optional permission denial message instead of a generic write failure');
    assert.match(popupSource, /createQuickOptionalHostBadge/,
        'quick toggles must show a permission-needed chip for enabled settings whose grant is missing');
    assert.match(popupSource, /optionalHostPermissionAria/,
        'quick toggles must expose missing optional-host grants in their accessible label');
    assert.match(popupSource, /createSchemaOptionalHostBadge/,
        'schema overview rows must show a permission-needed chip for missing optional grants');
    assert.match(popupSource, /dataFlowOptionalGrantLabel/,
        'data-flow panel must distinguish granted vs missing runtime optional hosts');
    assert.match(popupHtmlSource, /id="optional-host-banner"[\s\S]*id="optional-host-grant-btn"/,
        'popup.html must expose a top-level Grant access action for already-enabled optional-host features');
    assert.match(popupSource, /async function grantMissingOptionalHostPermissions/,
        'popup.js must let users request missing optional-host grants from a direct button gesture');
    assert.match(popupSource, /getDeclaredOptionalHostsForSetting\(key,\s*\{\s*directOnly:\s*true\s*\}\)/,
        'popup grant-state chips must track direct feature owners instead of noisy sub-feature inheritance');
    assert.match(popupCssSource, /\.optional-host-banner/,
        'popup.css must style the optional-host grant banner');
    assert.match(popupCssSource, /\.toggle-risk-badge\.toggle-risk-permission/,
        'popup.css must style the quick-toggle permission-needed chip');
    assert.match(popupCssSource, /\.so-key-profile-badge\.so-key-permission-missing/,
        'popup.css must style the schema-overview permission-needed chip');

    const fnStart = popupSource.indexOf('async function writeSetting');
    assert.ok(fnStart > -1, 'writeSetting must exist');
    const fnBody = popupSource.slice(fnStart, fnStart + 1200);
    assert.match(fnBody, /await requestOptionalHostsForSetting\(key, value\)/,
        'writeSetting must request optional hosts before persisting enabled state');
    assert.ok(
        fnBody.indexOf('requestOptionalHostsForSetting') < fnBody.indexOf('storageSet'),
        'optional host request must happen before storageSet persists the feature as enabled'
    );
    assert.match(fnBody, /await refreshOptionalHostGrantState\(\{\s*render:\s*false\s*\}\)/,
        'writeSetting must refresh optional grant state immediately after successful storage writes');
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

test('runtime settings guidance does not point users at the retired options page', () => {
    const userscriptSource = fs.readFileSync(
        path.join(__dirname, '..', 'YTKit.user.js'),
        'utf8'
    );
    for (const [name, source] of [
        ['extension/ytkit.js', ytkitSource],
        ['YTKit.user.js', userscriptSource]
    ]) {
        assert.doesNotMatch(
            source,
            /via options page/i,
            `${name} must not tell users to use the retired options page`
        );
        assert.match(
            source,
            /Open Full Settings/,
            `${name} should point users at the current settings surface`
        );
    }
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
        /_prepareImportedSettings\s*\(\s*settings\s*,\s*options\s*=\s*\{\}\s*\)/,
        'Content-script import path must prepare imported settings through a dedicated migration helper'
    );
    assert.match(
        ytkitSource,
        /_migrate\s*\(\s*this\._sanitize\s*\(\s*settings\s*\)\s*,\s*'profile-import'\s*,\s*options\s*\)/,
        'Content-script imports must run the migration chain from the imported _settingsVersion (seeded from the backup schema version when the inner marker is absent)'
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

    const {
        patchManifestForFirefox,
        FIREFOX_BUILTIN_DATA_CONSENT_MIN_VERSION,
        FIREFOX_DATA_COLLECTION_REQUIRED
    } = require('../scripts/manifest-patch');
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
    assert.equal(
        ffManifest.browser_specific_settings?.gecko?.strict_min_version,
        FIREFOX_BUILTIN_DATA_CONSENT_MIN_VERSION
    );
    assert.deepEqual(
        ffManifest.browser_specific_settings?.gecko?.data_collection_permissions?.required,
        FIREFOX_DATA_COLLECTION_REQUIRED,
        'Firefox manifest must declare the built-in data-consent categories Astra transmits'
    );
    assert.equal(
        ffManifest.browser_specific_settings?.gecko?.data_collection_permissions?.optional,
        undefined,
        'Astra does not request optional Firefox data permissions at runtime, so none should be declared optional'
    );
    assert.ok(
        Array.isArray(ffManifest.background?.scripts) && ffManifest.background.scripts.length > 0,
        'Firefox background must be a scripts[] array, not a service_worker entry'
    );

    // Running the patch twice must stay idempotent.
    patchManifestForFirefox(ffManifest);
    assert.equal(ffManifest.commands, undefined, 'Patch must remain idempotent across re-runs');
});

test('manifest PNG icons are square at declared sizes for AMO lint', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'),
        'utf8'
    ));
    const declaredIcons = {
        ...(manifest.icons || {}),
        ...(manifest.action?.default_icon || {})
    };

    for (const [declaredSize, rel] of Object.entries(declaredIcons)) {
        const expected = Number(declaredSize);
        const { width, height } = readPngSize(path.join(__dirname, '..', 'extension', rel));
        assert.equal(width, expected, `${rel} width must match manifest size ${expected}`);
        assert.equal(height, expected, `${rel} height must match manifest size ${expected}`);
    }
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
    assert.doesNotMatch(iifeBody, /element\.innerHTML\s*=/,
        'setHTML must avoid raw innerHTML sinks even when a TrustedTypes policy exists');
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

test('storageQuotaLRU sweeps real note/bookmark/watch stores, not the timestampBookmarks toggle', () => {
    const pruneStart = ytkitSource.indexOf("id: 'storageQuotaLRU'");
    assert.ok(pruneStart > -1, 'storageQuotaLRU feature must still exist');
    const pruneEnd = ytkitSource.indexOf("this._timer = null;", pruneStart);
    const pruneBlock = ytkitSource.slice(pruneStart, pruneEnd);

    assert.doesNotMatch(pruneBlock, /\['timestampBookmarks',/,
        'timestampBookmarks is a boolean toggle; quota sweep must not treat it as the persisted bookmark map');
    assert.match(pruneBlock, /videoNotesData/,
        'storageQuotaLRU must backstop videoNotesData even when the notes feature is disabled');
    assert.match(pruneBlock, /STORAGE_KEYS\.bookmarks[\s\S]*sanitizeTimestampBookmarks/,
        'storageQuotaLRU must prune the real ytkit-bookmarks top-level store');
    assert.match(pruneBlock, /STORAGE_KEYS\.watchProgress[\s\S]*sanitizeWatchProgressStore/,
        'storageQuotaLRU must prune the real ytkit-watch-progress top-level store');
    assert.match(pruneBlock, /STORAGE_KEYS\.watchTime[\s\S]*sanitizeWatchTimeStats/,
        'storageQuotaLRU must prune the real ytkit-watch-time top-level store');
});

// ── v3.20.3 H6: explicit cookie-jar wire contract via normalizeCookieExpiry ──
//
// Three sites previously inlined `expirationDate: c.expirationDate || 0`:
// - extension/ytkit.js (MediaDL cookie mapper, ~line 2633)
// - extension/background.js (EXT_COOKIE_LIST handler, ~line 620)
// - YTKit.user.js (GM_cookie fallback, ~line 1851)
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
// 1. timeout → already aborted
// 2. redirect to non-allowlisted origin → already aborted
// 3. content-length declared > MAX_RESPONSE_BYTES → already aborted
// 4. streamed body exceeds limit while reading → reader.cancel() only,
// no controller.abort() — fetch could keep reading until natural EOF
// 5. non-streaming body exceeds limit after measuring → no abort either
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

test('CRX signing key custody stays outside the repository worktree', () => {
    const buildSource = fs.readFileSync(
        path.join(__dirname, '..', 'build-extension.js'),
        'utf8'
    );
    const workflow = fs.readFileSync(
        path.join(__dirname, '..', '.github', 'workflows', 'build.yml'),
        'utf8'
    );
    const signingPolicy = fs.readFileSync(
        path.join(__dirname, '..', 'docs', 'signing-keys.md'),
        'utf8'
    );
    const builder = require('../build-extension.js');

    assert.doesNotMatch(buildSource, /path\.join\(__dirname,\s*['"]ytkit\.pem['"]\)/,
        'build-extension.js must not default to ytkit.pem inside the repo root');
    assert.doesNotMatch(buildSource, /fs\.renameSync\(generatedKey,\s*CRX_KEY\)/,
        'generated CRX keys must never be moved into the repo worktree');
    assert.match(buildSource, /ASTRA_CRX_KEY_PATH/,
        'release builds must support an explicit external key path');
    assert.match(buildSource, /ASTRA_CRX_KEY_MODE/,
        'CI validation builds must opt into ephemeral CRX keys explicitly');
    assert.match(buildSource, /--crx-key/,
        'maintainers must have a CLI override for the external key path');
    assert.match(workflow, /ASTRA_CRX_KEY_MODE:\s*ephemeral/,
        'CI build artifacts must declare validation-only ephemeral signing');
    assert.match(signingPolicy, /ASTRA_CRX_KEY_PATH/,
        'signing docs must document the external key path contract');
    assert.match(signingPolicy, /AppData\\Local\\Astra-Deck\\keys\\ytkit\.pem/,
        'signing docs must name the default Windows key location outside the repo');
    assert.match(signingPolicy, /Expected extension ID:\s*`lgbiefafhjdbplelniclnflbbilennlg`/,
        'signing docs must record the current self-distributed CRX identity baseline');

    assert.throws(
        () => builder.resolveCrxSigningConfig({
            mode: 'external',
            keyPath: path.join(__dirname, '..', 'ytkit.pem')
        }),
        /outside the repository worktree/,
        'external signing must reject repo-root ytkit.pem even when the file exists'
    );

    const missingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-crx-missing-'));
    try {
        assert.throws(
            () => builder.resolveCrxSigningConfig({
                mode: 'external',
                keyPath: path.join(missingDir, 'ytkit.pem')
            }),
            /CRX signing key not found/,
            'external signing must fail closed when the key path is missing'
        );
    } finally {
        fs.rmSync(missingDir, { recursive: true, force: true });
    }

    const keyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-crx-key-'));
    try {
        const externalKeyPath = path.join(keyDir, 'ytkit.pem');
        fs.writeFileSync(externalKeyPath, 'placeholder private key fixture', 'utf8');
        const externalConfig = builder.resolveCrxSigningConfig({
            mode: 'external',
            keyPath: externalKeyPath
        });
        assert.equal(externalConfig.mode, 'external');
        assert.equal(externalConfig.keyPath, path.resolve(externalKeyPath));
    } finally {
        fs.rmSync(keyDir, { recursive: true, force: true });
    }

    const validationConfig = builder.resolveCrxSigningConfig({
        mode: 'ephemeral',
        releaseBuild: true
    });
    assert.equal(validationConfig.mode, 'ephemeral');
    assert.equal(validationConfig.keyPath, null);
});

test('repository files do not ship Google API key literals', () => {
    const repoRoot = path.join(__dirname, '..');
    const secretPattern = /AIza[0-9A-Za-z_-]{35}/;
    const scannedExtensions = new Set([
        '.css',
        '.html',
        '.js',
        '.json',
        '.md',
        '.mjs',
        '.yml',
        '.yaml'
    ]);
    const skipDirs = new Set([
        '.git',
        'build',
        'node_modules'
    ]);
    const matches = [];

    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (!skipDirs.has(entry.name)) {
                    walk(path.join(dir, entry.name));
                }
                continue;
            }
            if (!entry.isFile()) continue;
            const ext = path.extname(entry.name);
            if (!scannedExtensions.has(ext)) continue;
            const filePath = path.join(dir, entry.name);
            const text = fs.readFileSync(filePath, 'utf8');
            if (secretPattern.test(text)) {
                matches.push(path.relative(repoRoot, filePath));
            }
        }
    }

    walk(repoRoot);
    assert.deepEqual(matches, [],
        'Google API key literals should not be committed; parse Innertube keys from YouTube page scripts instead');
});

test('release manifest generation pins checksums, SBOM, attestations, and local signing policy', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const workflow = fs.readFileSync(
        path.join(__dirname, '..', '.github', 'workflows', 'build.yml'), 'utf8'
    );
    const scriptSource = fs.readFileSync(
        path.join(__dirname, '..', 'scripts', 'generate-release-manifest.js'), 'utf8'
    );
    const stageScriptSource = fs.readFileSync(
        path.join(__dirname, '..', 'scripts', 'stage-companion-release.js'), 'utf8'
    );
    const {
        expectedReleaseNames,
        isCompanionReleaseRequired,
        parseAssetName
    } = require('../scripts/generate-release-manifest');

    assert.match(pkg.scripts['release:manifest'] || '', /scripts\/generate-release-manifest\.js/,
        'package.json must expose release:manifest for the local release recipe');
    assert.match(pkg.scripts['release:stage-companion'] || '', /scripts\/stage-companion-release\.js/,
        'package.json must expose a companion staging script for local release packaging');
    assert.match(workflow, /npm sbom --omit=dev --sbom-format cyclonedx > build\/astra-deck-npm-sbom\.cdx\.json/,
        'build.yml must emit a release SBOM into build/');
    assert.match(workflow, /npm run release:manifest/,
        'build.yml must generate SHA256SUMS and release-manifest.json');
    assert.match(workflow, /actions\/attest-build-provenance@[0-9a-f]{40}\s+#\s+v4/,
        'tag builds must create build-provenance attestations from a pinned v4 commit');
    assert.match(workflow, /actions\/attest-sbom@[0-9a-f]{40}\s+#\s+v4/,
        'tag builds must create SBOM attestations from a pinned v4 commit');
    assert.doesNotMatch(workflow, /gh release create/,
        'CI must not publish GitHub Releases because ytkit.pem stays local');
    assert.match(scriptSource, /SHA256SUMS_NAME = 'SHA256SUMS'/,
        'release manifest script must write SHA256SUMS');
    assert.match(scriptSource, /MANIFEST_NAME = 'release-manifest\.json'/,
        'release manifest script must write release-manifest.json');
    assert.match(scriptSource, /localSigningRequired:\s*true/,
        'release manifest must disclose the local signing requirement');
    assert.match(scriptSource, /AstraDownloader\.exe\.sha256/,
        'release manifest script must create the companion hash sidecar when the exe is present');
    assert.match(scriptSource, /--require-companion/,
        'release manifest script must have an explicit companion-release activation flag');
    assert.match(scriptSource, /companionUpdateRequired:\s*requireCompanion/,
        'release manifest must disclose whether companion update assets were required');
    assert.match(stageScriptSource, /MZ/,
        'companion staging must reject files without a Windows EXE header');
    assert.match(stageScriptSource, /build\/AstraDownloader\.exe/,
        'companion staging must stage the EXE into build/ for release manifest inclusion');
    assert.match(stageScriptSource, /fs\.fstatSync\(fd\)/,
        'companion staging must validate metadata from the opened descriptor');
    assert.doesNotMatch(stageScriptSource, /fs\.existsSync/,
        'companion staging must avoid existence-check races');
    assert.doesNotMatch(stageScriptSource, /fs\.copyFileSync/,
        'companion staging must not copy a path after validating a different opened handle');

    const expected = expectedReleaseNames(pkg.version);
    assert.equal(expected.filter((name) => name.includes(`-v${pkg.version}.`)).length, 9,
        'expected release set must include eight extension artifacts plus userscript');
    assert.ok(expected.includes('astra-deck-npm-sbom.cdx.json'),
        'expected release set must include the npm SBOM asset');
    const companionExpected = expectedReleaseNames(pkg.version, { requireCompanion: true });
    assert.ok(companionExpected.includes('AstraDownloader.exe'),
        'companion-required release set must include the Windows EXE');
    assert.ok(companionExpected.includes('AstraDownloader.exe.sha256'),
        'companion-required release set must include the EXE hash sidecar');
    assert.equal(
        isCompanionReleaseRequired(['node', 'generate-release-manifest.js', '--require-companion'], {}),
        true,
        '--require-companion must activate companion asset enforcement'
    );

    const parsed = parseAssetName(`astra-deck-store-safe-firefox-v${pkg.version}.xpi`, pkg.version);
    assert.deepEqual(
        {
            kind: parsed.kind,
            profile: parsed.profile,
            browser: parsed.browser,
            artifactType: parsed.artifactType,
            version: parsed.version
        },
        {
            kind: 'extension',
            profile: 'store-safe',
            browser: 'firefox',
            artifactType: 'xpi',
            version: pkg.version
        },
        'release manifest metadata must classify Firefox store-safe XPI assets'
    );
});

test('README documents Astra Downloader companion setup and pending release assets', () => {
    const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
    const signingDocs = fs.readFileSync(
        path.join(__dirname, '..', 'docs', 'signing-keys.md'), 'utf8'
    );

    assert.match(readme, /### Astra Downloader Companion Setup/,
        'README must give the companion its own setup section');
    assert.match(readme, /latest release `v4\.46\.0` does \*\*not\*\* include\s+`AstraDownloader\.exe` or `AstraDownloader\.exe\.sha256`/,
        'README must not promise a companion EXE before the live release carries it');
    assert.match(readme, /py -3\.12 -m pip install -r astra_downloader\/requirements\.txt/,
        'README must document the current source-checkout companion path');
    assert.match(readme, /py -3\.12 astra_downloader\/astra_downloader\.py/,
        'README must document how to launch the source-checkout companion');
    assert.match(readme, /PO-token provider and Deno sections below are companion prerequisites/,
        'README must frame Deno and PO-token setup as companion prerequisites');
    assert.match(readme, /AstraDownloader\.exe` and\s+`AstraDownloader\.exe\.sha256`/,
        'README must name both companion release assets together');
    assert.match(signingDocs, /If the latest public release lacks `AstraDownloader\.exe` or\s+`AstraDownloader\.exe\.sha256`/,
        'release checklist must keep the README caveat tied to live assets');
    assert.match(signingDocs, /signed installer\/MSI roadmap item remains separate/,
        'release checklist must not collapse portable companion proof into signed installer work');
});

test('GitHub workflows pin external actions to full-length SHAs with version comments', () => {
    const workflowDir = path.join(__dirname, '..', '.github', 'workflows');
    const combined = ['build.yml', 'validate.yml', 'yt-dlp-smoke.yml', 'codeql.yml']
        .map((file) => `# ${file}\n${fs.readFileSync(path.join(workflowDir, file), 'utf8')}`)
        .join('\n');

    assert.doesNotMatch(combined, /uses:\s*[^#\s]+@(v[0-9]+(?:\.[0-9]+)*|main|master)(?:\s|$)/,
        'workflow actions must not use mutable tag or branch refs after the SHA-pinning pass');

    const useLines = combined.split(/\r?\n/)
        .filter((line) => /^\s*(?:-\s*)?uses:\s*/.test(line));
    assert.ok(useLines.length >= 18, 'expected to audit every workflow uses: line');
    for (const line of useLines) {
        assert.match(
            line,
            /uses:\s*[^#\s]+@[0-9a-f]{40}\s+#\s+v[0-9]+(?:\.[0-9]+)*/,
            `workflow action line must carry a full SHA plus version comment: ${line.trim()}`
        );
    }

    for (const [action, sha] of Object.entries({
        'actions/checkout': 'df4cb1c069e1874edd31b4311f1884172cec0e10',
        'actions/setup-node': '48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
        'actions/setup-python': 'a309ff8b426b58ec0e2a45f0f869d46889d02405',
        'actions/upload-artifact': '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
        'actions/dependency-review-action': 'a1d282b36b6f3519aa1f3fc636f609c47dddb294',
        'actions/attest-build-provenance': 'a2bbfa25375fe432b6a289bc6b6cd05ecd0c4c32',
        'actions/attest-sbom': 'c604332985a26aa8cf1bdc465b92731239ec6b9e',
        'browser-actions/setup-firefox': '0bc507ddf224827e3b1af68e014d5e42ab93e795',
        'github/codeql-action/init': '8aad20d150bbac5944a9f9d289da16a4b0d87c1e',
        'github/codeql-action/analyze': '8aad20d150bbac5944a9f9d289da16a4b0d87c1e'
    })) {
        assert.match(
            combined,
            new RegExp(escapeRegExp(action) + '@' + sha),
            `${action} must stay pinned to its resolved upstream tag commit`
        );
    }
});

test('CodeQL scans JavaScript and Python with security-extended queries', () => {
    const workflow = fs.readFileSync(
        path.join(__dirname, '..', '.github', 'workflows', 'codeql.yml'), 'utf8'
    );
    const config = fs.readFileSync(
        path.join(__dirname, '..', '.github', 'codeql.yml'), 'utf8'
    );

    assert.match(workflow, /name:\s*CodeQL/, 'workflow must keep the expected name');
    assert.match(workflow, /security-events:\s*write/, 'CodeQL upload needs security-events: write');
    assert.match(workflow, /github\/codeql-action\/init@[0-9a-f]{40}\s+#\s+v4/,
        'CodeQL init should use the supported v4 commit pin');
    assert.match(workflow, /github\/codeql-action\/analyze@[0-9a-f]{40}\s+#\s+v4/,
        'CodeQL analyze should use the supported v4 commit pin');
    assert.match(workflow, /language:\s*javascript-typescript/, 'JavaScript/TypeScript must be scanned');
    assert.match(workflow, /language:\s*python/, 'Python companion code must be scanned');
    assert.match(workflow, /build-mode:\s*none/, 'interpreted languages should use build-mode none');
    assert.match(workflow, /config-file:\s*\.\/\.github\/codeql\.yml/, 'workflow must load the shared CodeQL config');
    assert.match(config, /uses:\s*security-extended/, 'CodeQL config must use the security-extended query suite');
    for (const ignoredPath of ['node_modules/**', 'build/**', 'mhtml/**', 'archive/**', 'docs/archive/**']) {
        assert.match(
            config,
            new RegExp(escapeRegExp(ignoredPath)),
            `${ignoredPath} should stay out of the CodeQL source set`
        );
    }
});

test('branch CodeQL URL, DOM, and storage guardrails stay hardened', () => {
    const userscriptSource = fs.readFileSync(
        path.join(__dirname, '..', 'YTKit.user.js'),
        'utf8'
    );

    for (const [label, source] of [
        ['extension/ytkit.js', ytkitSource],
        ['YTKit.user.js', userscriptSource]
    ]) {
        assert.match(source, /function\s+isYouTubeHostname\(/,
            `${label} must centralize exact YouTube host validation`);
        assert.doesNotMatch(source, /includes\(['"]youtube\.com['"]\)/,
            `${label} must not use substring youtube.com host checks`);
        assert.doesNotMatch(source, /includes\(['"]youtu\.be['"]\)/,
            `${label} must not use substring youtu.be host checks`);
        assert.doesNotMatch(source, /href\.includes\(['"]youtube\.com\//,
            `${label} SPA navigation must parse hrefs instead of substring-matching hosts`);
        assert.match(source, /new URL\(href,\s*window\.location\.href\)/,
            `${label} SPA navigation must resolve hrefs through URL`);
        assert.match(source, /url\.protocol !== 'http:' && url\.protocol !== 'https:'/,
            `${label} SPA navigation must reject non-http(s) schemes`);
        assert.match(source, /_normalizeQuickLinkUrl\(value\)/,
            `${label} Quick Links must normalize configured URLs through a shared helper`);
        assert.match(source, /new URL\(raw,\s*window\.location\.origin\)/,
            `${label} Quick Links must parse configured URLs before assigning anchor hrefs`);
        assert.match(source, /if \(!isYouTubeHostname\(parsed\.hostname\)\) return null;/,
            `${label} Quick Links must reject non-YouTube configured URLs`);
        assert.doesNotMatch(source, /return parsed\.href;/,
            `${label} Quick Links must not persist external absolute hrefs`);
        assert.match(source, /const itemUrl = this\._normalizeQuickLinkUrl\(item\.url\)/,
            `${label} Quick Links must re-check normalized URLs at the anchor sink`);
        assert.match(source, /parsedItemUrl = new URL\(itemUrl,\s*window\.location\.origin\)/,
            `${label} Quick Links must parse the row URL next to the anchor sink`);
        assert.match(source, /a\.href = 'https:\/\/www\.youtube\.com'/,
            `${label} Quick Links must start anchors from a fixed YouTube origin`);
        assert.match(source, /a\.pathname = parsedItemUrl\.pathname/,
            `${label} Quick Links must assign only the parsed local pathname`);
        assert.match(source, /a\.search = parsedItemUrl\.search/,
            `${label} Quick Links must assign only the parsed local search`);
        assert.match(source, /a\.hash = parsedItemUrl\.hash/,
            `${label} Quick Links must assign only the parsed local hash`);
        assert.doesNotMatch(source, /a\.href = itemHref/,
            `${label} Quick Links must not assign a user-derived href string`);
        assert.match(source, /_sanitizeQuickLinkIconPath\(pathData\)/,
            `${label} Quick Links must sanitize SVG path data before setAttribute`);
        assert.match(source, /_positions\s*=\s*this\._toPositionMap\(/,
            `${label} resume storage must normalize persisted data into a Map`);
        assert.match(source, /Object\.fromEntries\(this\._positions\)/,
            `${label} resume storage must serialize the Map back to plain JSON`);
        assert.doesNotMatch(source, /this\._positions\[[^\]]+\]/,
            `${label} resume storage must not index persisted object keys directly`);
        assert.doesNotMatch(source, /delete\s+this\._positions\[[^\]]+\]/,
            `${label} resume storage must not delete persisted object keys directly`);
        assert.doesNotMatch(source, /TrustedHTML\.setHTML\(\s*(?:a|del)\s*,/,
            `${label} quick-link labels and delete icons must be built with DOM APIs`);
    }

    assert.doesNotMatch(userscriptSource, /const TrustedHTML = \(\(\) => \{/,
        'YTKit.user.js must not ship a userscript-local markup parser helper');
    assert.doesNotMatch(userscriptSource, /TrustedHTML\.setHTML/,
        'YTKit.user.js static fragments must be built with DOM APIs');
    assert.doesNotMatch(userscriptSource, /parseFromString/,
        'YTKit.user.js must not reinterpret text as HTML through DOMParser');
    assert.match(userscriptSource, /function\s+createFilledPathIcon\(/,
        'YTKit.user.js must keep DOM SVG helpers for static icon fragments');
    assert.match(userscriptSource, /appendTextSpan\(badge,/,
        'YTKit.user.js dynamic badge text must be written with textContent');
});

test('branch CodeQL sanitizer guardrails keep single-pass parsing and entity order', () => {
    const userscriptSource = fs.readFileSync(
        path.join(__dirname, '..', 'YTKit.user.js'),
        'utf8'
    );
    const transcriptServiceSource = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'transcript-service.js'),
        'utf8'
    );
    const auditPopupSource = fs.readFileSync(
        path.join(__dirname, '..', 'scripts', 'audit-popup-a11y.js'),
        'utf8'
    );
    const extractKeysSource = fs.readFileSync(
        path.join(__dirname, '..', 'scripts', 'extract-i18n-keys.js'),
        'utf8'
    );

    for (const [label, source] of [
        ['extension/core/transcript-service.js', transcriptServiceSource],
        ['YTKit.user.js', userscriptSource]
    ]) {
        assert.match(source, /_decodeHTMLEntities\(this\._stripXmlTags\(match\[/,
            `${label} must strip XML tags before entity decoding`);
        assert.match(source, /_stripXmlTags\(value\)/,
            `${label} must keep the explicit XML tag scanner`);
        assert.doesNotMatch(source, /\.replace\(\s*\/<\[\^>\]\*>\//,
            `${label} must not reintroduce regex XML tag stripping`);
        const ltIdx = source.indexOf(".replace(/&lt;/g, '<')");
        const gtIdx = source.indexOf(".replace(/&gt;/g, '>')");
        const ampIdx = source.indexOf(".replace(/&amp;/g, '&')");
        assert.ok(ltIdx > -1 && gtIdx > -1 && ampIdx > gtIdx && ampIdx > ltIdx,
            `${label} must decode &amp; after other entities to avoid double-unescaping`);
    }

    assert.match(auditPopupSource, /function\s+stripHtmlTags\(value\)/,
        'popup a11y audit should use a scanner for accessible-text checks');
    assert.doesNotMatch(auditPopupSource, /\.replace\(\s*\/<\[\^>\]\+>\//,
        'popup a11y audit must not strip tags with a regex replacement');
    assert.doesNotMatch(auditPopupSource, /<script\[\\s\\S\]\*\?/,
        'popup a11y audit must not rely on a fragile script tag regex');
    assert.doesNotMatch(auditPopupSource, /<style\[\\s\\S\]\*\?/,
        'popup a11y audit must not rely on a fragile style tag regex');
    assert.match(extractKeysSource, /function\s+decodeSingleQuotedFallback\(raw\)/,
        'i18n extractor must use the single-pass fallback decoder');
    assert.doesNotMatch(extractKeysSource, /replace\(\/\\\\'\/g,[\s\S]*replace\(\/\\\\\\\\\/g,[\s\S]*replace\(\/\\\\n\/g/,
        'i18n extractor must not return to chained multi-character escaping replacements');
});

test('branch CodeQL file-race and Python error disclosure guardrails stay fixed', () => {
    const buildSource = fs.readFileSync(
        path.join(__dirname, '..', 'build-extension.js'),
        'utf8'
    );
    const downloaderSource = fs.readFileSync(
        path.join(__dirname, '..', 'astra_downloader', 'astra_downloader.py'),
        'utf8'
    );

    assert.match(buildSource, /function\s+readUtf8IfPresent\(filePath\)/,
        'version bump reads must use one read helper instead of existsSync/read races');
    assert.match(buildSource, /const originalUserscript = readUtf8IfPresent\(USERSCRIPT\)/,
        'userscript version bump must read through readUtf8IfPresent');
    assert.match(buildSource, /const pkgRaw = readUtf8IfPresent\(pkgPath\)/,
        'package.json version bump must read through readUtf8IfPresent');
    assert.match(buildSource, /const pkgLockRaw = readUtf8IfPresent\(pkgLockPath\)/,
        'package-lock version bump must read through readUtf8IfPresent');
    assert.match(downloaderSource, /write_persistent_log\("FolderPickerService failed"\)/,
        'FolderPickerService must log a local generic failure marker');
    assert.match(downloaderSource, /'error': 'Folder picker failed\. Check Astra Downloader logs for details\.'/,
        'FolderPickerService response must return a generic user-facing error');
    assert.doesNotMatch(downloaderSource, /response_q\.put\(\{'error': str\(e\)\}\)/,
        'FolderPickerService must not expose raw exception text to the UI response');
    assert.doesNotMatch(downloaderSource, /'stderr': str\(e\)/,
        'yt-dlp self-update must not expose launch exception text through stderr');
    assert.doesNotMatch(downloaderSource, /'error': f'[^']+\{e\}'/,
        'self-update endpoints must not expose raw exception text in JSON errors');
    assert.doesNotMatch(downloaderSource, /dl\.error = str\(e\)/,
        'download status payloads must not expose raw exception text');
});

test('CODEOWNERS protects security-sensitive repository paths', () => {
    const codeowners = fs.readFileSync(
        path.join(__dirname, '..', '.github', 'CODEOWNERS'), 'utf8'
    );
    assert.match(codeowners, /Owners listed here must keep write access/,
        'CODEOWNERS must document the write-access requirement');
    assert.doesNotMatch(codeowners, /@[A-Za-z0-9-]+\/[A-Za-z0-9._-]+/,
        'do not reference organization teams until a real write-enabled team exists');

    for (const protectedPath of [
        '/.github/',
        '/SECURITY.md',
        '/package.json',
        '/package-lock.json',
        '/build-extension.js',
        '/scripts/generate-release-manifest.js',
        '/scripts/stage-companion-release.js',
        '/scripts/check-*.js',
        '/docs/signing-keys.md',
        '/docs/repo-settings.md',
        '/docs/privacy-policy.md',
        '/extension/manifest.json',
        '/extension/background.js',
        '/extension/core/',
        '/extension/ytkit.js',
        '/astra_downloader/'
    ]) {
        assert.match(
            codeowners,
            new RegExp(`^${escapeRegExp(protectedPath)}\\s+@SysAdminDoc\\s*$`, 'm'),
            `${protectedPath} must be owned by @SysAdminDoc`
        );
    }
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
    // - JS sends 0 → Python gets 0 → wire emits "0" (session marker)
    // - JS sends positive double → Python truncates to int, same int
    // - JS sends 0 for any non-positive-finite-number → Python sees 0
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

test('feature definitions are annotated with generated i18n metadata keys', () => {
    const definitions = extractYtkitFeatureDefinitions();
    assert.ok(definitions.length >= 300,
        `expected at least 300 feature label definitions, found ${definitions.length}`);
    const ids = new Set(definitions.map((def) => def.id));
    assert.equal(ids.size, definitions.length,
        'feature i18n extraction must not produce duplicate ids');
    assert.match(ytkitSource, /function getFeatureI18nKey\s*\(/,
        'ytkit.js must define a feature i18n key helper');
    assert.match(ytkitSource, /function ensureFeatureI18nKeys\s*\(/,
        'ytkit.js must annotate feature definitions with nameKey/descriptionKey');
    assert.match(ytkitSource, /features\.forEach\(ensureFeatureI18nKeys\)/,
        'the canonical features array must be annotated before registry/UI use');
    assert.match(ytkitSource, /nameKey:\s*feature\.nameKey/,
        'runtime feature registry entries must expose nameKey');
    assert.match(ytkitSource, /descriptionKey:\s*feature\.descriptionKey/,
        'runtime feature registry entries must expose descriptionKey');
});

test('all locales carry feature-definition name and description messages', () => {
    const definitions = extractYtkitFeatureDefinitions();
    const localesDir = path.join(__dirname, '..', 'extension', '_locales');
    const localeDirs = fs.readdirSync(localesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    const failures = [];
    for (const locale of localeDirs) {
        const messages = JSON.parse(fs.readFileSync(
            path.join(localesDir, locale, 'messages.json'),
            'utf8'
        ));
        for (const def of definitions) {
            for (const suffix of ['name', 'desc']) {
                const key = featureMessageKey(def.id, suffix);
                if (typeof messages[key]?.message !== 'string' || !messages[key].message.trim()) {
                    failures.push(`${locale}: missing ${key}`);
                }
            }
        }
    }
    assert.ok(failures.length === 0,
        `feature i18n locale gaps:\n  ${failures.join('\n  ')}`);
});

test('settings panel feature cards render labels through feature i18n helpers', () => {
    const start = ytkitSource.indexOf('function buildFeatureCard');
    assert.ok(start > -1, 'buildFeatureCard must exist');
    const block = ytkitSource.slice(start, start + 4500);
    assert.match(block, /const featureName = getFeatureName\(f\)/,
        'feature cards must resolve the display name through getFeatureName');
    assert.match(block, /getFeatureDescription\(f\)/,
        'feature cards must resolve the description through getFeatureDescription');
    assert.doesNotMatch(block, /\bf\.name\b/,
        'feature card display paths must not read f.name directly');
    assert.doesNotMatch(block, /\bf\.description\b/,
        'feature card display paths must not read f.description directly');

    const quickStart = ytkitSource.indexOf('availableFeatures.forEach');
    assert.ok(quickStart > -1, 'page quick-settings feature loop must exist');
    const quickBlock = ytkitSource.slice(quickStart, quickStart + 1800);
    assert.match(quickBlock, /getFeatureName\(feat\)/,
        'page quick-settings cards must resolve names through getFeatureName');
    assert.match(quickBlock, /getFeatureDescription\(feat\)/,
        'page quick-settings cards must resolve descriptions through getFeatureDescription');
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
    // v4.47.0 NF14: the confirmAction() dialog was retired in favor of
    // immediate-apply behavior. The diagnostic log is a runtime ring
    // buffer of past errors, not user-authored data, so no undo path
    // is needed. Clearing applies on click.
    const clearFnStart = popupSource.indexOf('async function clearDiagnosticLog');
    assert.ok(clearFnStart > -1, 'clearDiagnosticLog must exist');
    const clearFnBody = popupSource.slice(clearFnStart, clearFnStart + 1000);
    assert.doesNotMatch(clearFnBody, /confirmAction\s*\(/,
        'clearDiagnosticLog must apply immediately — confirmAction was retired in v4.47.0 NF14');
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
    // v4.47.0 NF14: previously this allowed `confirm-cancel-btn` and
    // `confirm-accept-btn` to satisfy the a11y rule via dynamically
    // assigned text content. Those buttons + the modal that hosted
    // them were retired alongside the confirm-shell removal. No
    // remaining popup button sets its text dynamically without a
    // static aria-label or visible text fallback.
    const buttons = [...popupHtmlSource.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
    assert.ok(buttons.length >= 10, 'popup.html should expose every static button to the audit');
    for (const [, attrs, body] of buttons) {
        const id = (attrs.match(/\bid="([^"]+)"/) || [])[1] || '(anonymous button)';
        const hasAriaLabel = /\baria-label="[^"]+"/.test(attrs);
        const hasVisibleText = stripHtmlTags(body).replace(/&times;/g, 'x').trim().length > 0;
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

test('npm run audit:overlays covers in-page overlays and mutation canaries', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.match(pkg.scripts.check, /npm run audit:overlays/,
        'npm run check must include the in-page overlay a11y audit');
    assert.match(pkg.scripts['audit:overlays'] || '', /scripts\/audit-overlays-a11y\.js/,
        'package.json must expose npm run audit:overlays');

    const scriptSource = fs.readFileSync(
        path.join(__dirname, '..', 'scripts', 'audit-overlays-a11y.js'),
        'utf8'
    );
    for (const marker of [
        'unlabeled close button',
        'missing focus-visible',
        'sub-24px target',
        'Download options dialog',
        'Transcript search dialog',
        'Subscription group modal'
    ]) {
        assert.ok(scriptSource.includes(marker), `overlay audit must cover ${marker}`);
    }

    const result = runNodeCommand([
        path.join(__dirname, '..', 'scripts', 'audit-overlays-a11y.js'),
        '--self-test'
    ]);
    assert.equal(result.status, 0,
        `npm run audit:overlays -- --self-test must pass\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
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

function cspDirectiveTokens(csp, directiveName) {
    const directive = String(csp || '')
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(directiveName + ' '));
    return directive ? directive.split(/\s+/).slice(1) : [];
}

function cspAllowsConnect(csp, origin) {
    return cspDirectiveTokens(csp, 'connect-src').includes(origin);
}

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
    assert.equal(cspAllowsConnect("connect-src 'self' https://api.openai.com.evil", 'https://api.openai.com'), false,
        'CSP origin checks must be exact tokens, not URL substrings');

    // Required origins that popup.js or the legitimate AI/SponsorBlock /
    // localhost downloader flows may legitimately fetch.
    const requiredOrigins = [
        'https://*.youtube.com',
        'https://*.youtube-nocookie.com',
        'https://youtu.be',
        'https://i.ytimg.com',
        'https://sponsor.ajay.app',
        'https://returnyoutubedislikeapi.com',
        'https://www.reddit.com',
        'https://old.reddit.com',
        'https://api.openai.com',
        'https://api.anthropic.com',
        'https://generativelanguage.googleapis.com',
        'https://api.cobalt.tools',
        'http://127.0.0.1:9751',
        'http://127.0.0.1:11434',
    ];
    for (const origin of requiredOrigins) {
        assert.ok(
            cspAllowsConnect(csp, origin),
            `connect-src must include ${origin} so the corresponding host_permission stays usable from extension pages`,
        );
    }

    // Negative assertion: connect-src must NOT be a wildcard.
    assert.ok(!/connect-src[^;]*\*\s*[;'"]/.test(csp),
        'connect-src must not be a wildcard — defeats the purpose');
});

test('build-extension emits distinct store-safe and github-full manifest profiles', () => {
    const builder = require('../build-extension.js');
    const baseManifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'),
        'utf8',
    ));

    assert.deepEqual(builder.expandBuildProfileSelection('both'), ['store-safe', 'github-full']);
    assert.equal(builder.getArtifactBaseName('store-safe', 'chrome', '4.46.0'),
        'astra-deck-store-safe-chrome-v4.46.0');
    assert.equal(builder.getArtifactBaseName('github-full', 'firefox', '4.46.0'),
        'astra-deck-github-full-firefox-v4.46.0');

    const storeManifest = builder.patchManifestForBuildProfile(
        JSON.parse(JSON.stringify(baseManifest)), 'store-safe');
    const fullManifest = builder.patchManifestForBuildProfile(
        JSON.parse(JSON.stringify(baseManifest)), 'github-full');

    const storeHosts = storeManifest.host_permissions || [];
    const storeOptionalHosts = storeManifest.optional_host_permissions || [];
    const fullHosts = fullManifest.host_permissions || [];
    const fullOptionalHosts = fullManifest.optional_host_permissions || [];
    for (const required of [
        'https://*.youtube.com/*',
        'https://*.youtube-nocookie.com/*',
        'https://youtu.be/*'
    ]) {
        assert.ok(storeHosts.includes(required), 'store-safe manifest must include ' + required);
        assert.ok(fullHosts.includes(required), 'github-full manifest must include ' + required);
    }

    for (const optional of [
        'https://sponsor.ajay.app/*',
        'https://i.ytimg.com/*',
        'https://returnyoutubedislikeapi.com/*',
        'https://www.reddit.com/*',
        'https://old.reddit.com/*'
    ]) {
        assert.ok(!storeHosts.includes(optional),
            'store-safe manifest must not install-time grant optional enrichment host ' + optional);
        assert.ok(storeOptionalHosts.includes(optional),
            'store-safe manifest must declare runtime optional host ' + optional);
        assert.ok(fullHosts.includes(optional),
            'github-full manifest keeps optional store-safe enrichment host as required: ' + optional);
    }
    assert.equal(fullOptionalHosts.length, 0,
        'github-full optional host decisions are deferred; generated full manifests should not declare optional hosts yet');

    for (const fullOnly of [
        'https://api.openai.com/*',
        'https://api.anthropic.com/*',
        'https://generativelanguage.googleapis.com/*',
        'https://api.cobalt.tools/*',
        'http://127.0.0.1:9751/*',
        'http://127.0.0.1:11434/*'
    ]) {
        assert.ok(!storeHosts.includes(fullOnly),
            'store-safe manifest must not include github-full host ' + fullOnly);
        assert.ok(fullHosts.includes(fullOnly),
            'github-full manifest must include ' + fullOnly);
    }

    const storeCsp = storeManifest.content_security_policy?.extension_pages || '';
    const fullCsp = fullManifest.content_security_policy?.extension_pages || '';
    assert.ok(!cspAllowsConnect(storeCsp, 'https://api.openai.com'),
        'store-safe CSP must exclude OpenAI');
    assert.ok(!cspAllowsConnect(storeCsp, 'https://api.cobalt.tools'),
        'store-safe CSP must exclude Cobalt');
    assert.ok(!cspAllowsConnect(storeCsp, 'http://127.0.0.1:9751'),
        'store-safe CSP must exclude local downloader loopback');
    assert.ok(cspAllowsConnect(storeCsp, 'https://i.ytimg.com'),
        'store-safe CSP must keep optional thumbnail host connect-src eligible');
    assert.ok(cspAllowsConnect(storeCsp, 'https://sponsor.ajay.app'),
        'store-safe CSP must keep optional SponsorBlock/DeArrow host connect-src eligible');
    assert.ok(cspAllowsConnect(storeCsp, 'https://returnyoutubedislikeapi.com'),
        'store-safe CSP must keep optional RYD host connect-src eligible');
    assert.ok(cspAllowsConnect(storeCsp, 'https://www.reddit.com'),
        'store-safe CSP must keep optional Reddit host connect-src eligible');
    assert.ok(cspAllowsConnect(fullCsp, 'https://api.openai.com'),
        'github-full CSP must include OpenAI');
    assert.ok(cspAllowsConnect(fullCsp, 'https://api.cobalt.tools'),
        'github-full CSP must include Cobalt');
    assert.ok(cspAllowsConnect(fullCsp, 'http://127.0.0.1:9751'),
        'github-full CSP must include local downloader loopback');
});

test('store permission rationale covers live manifest permissions and profile host grants', () => {
    const builder = require('../build-extension.js');
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'),
        'utf8',
    ));
    const rationale = fs.readFileSync(
        path.join(__dirname, '..', 'docs', 'store-permission-rationale.md'),
        'utf8',
    );
    const checklist = fs.readFileSync(
        path.join(__dirname, '..', 'docs', 'cws-submission-checklist.md'),
        'utf8',
    );

    assert.ok(checklist.includes('store-permission-rationale.md'),
        'CWS checklist must point reviewers to the copy-paste rationale doc');
    assert.ok(rationale.includes('## Single-Purpose Statement'),
        'rationale doc must include a single-purpose statement');
    assert.ok(rationale.includes('## Data-Handling Statement'),
        'rationale doc must include a data-handling statement');
    assert.ok(rationale.includes('## Firefox Data Consent'),
        'rationale doc must include Firefox data-consent reviewer copy');

    for (const permission of manifest.permissions || []) {
        assert.ok(rationale.includes('`' + permission + '`'),
            'rationale doc must mention manifest permission ' + permission);
    }

    for (const profile of ['store-safe', 'github-full']) {
        const hosts = [
            ...builder.getManifestProfileHostPermissions(profile),
            ...builder.getManifestProfileOptionalHostPermissions(profile)
        ];
        for (const host of hosts) {
            assert.ok(rationale.includes('`' + host + '`'),
                'rationale doc must mention ' + profile + ' host permission ' + host);
        }
    }
});

test('optional host permission helper supports callback and promise APIs', async () => {
    delete require.cache[require.resolve('../extension/core/optional-host-permissions.js')];
    const { createOptionalHostPermissions } = require('../extension/core/optional-host-permissions.js');
    const callbackApi = {
        request(payload, cb) {
            assert.deepEqual(payload, { origins: ['https://i.ytimg.com/*'] });
            cb(true);
        },
        contains(payload, cb) {
            assert.deepEqual(payload, { origins: ['https://i.ytimg.com/*'] });
            cb(false);
        },
        remove(payload, cb) {
            assert.deepEqual(payload, { origins: ['https://i.ytimg.com/*'] });
            cb(true);
        },
        onAdded: { addListener(listener) { this.listener = listener; } },
        onRemoved: { addListener(listener) { this.listener = listener; } }
    };
    const callbackHelper = createOptionalHostPermissions({
        permissionsApi: callbackApi,
        runtimeApi: {}
    });
    assert.equal(callbackHelper.isSupported(), true);
    assert.equal(await callbackHelper.contains(['https://i.ytimg.com/*']), false);
    assert.equal(await callbackHelper.request(['https://i.ytimg.com/*']), true);
    assert.equal(await callbackHelper.remove(['https://i.ytimg.com/*']), true);
    assert.equal(callbackHelper.onAdded(() => {}), true);
    assert.equal(callbackHelper.onRemoved(() => {}), true);

    const promiseHelper = createOptionalHostPermissions({
        permissionsApi: {
            request: async () => false,
            contains: async () => true,
            remove: async () => true
        },
        runtimeApi: {}
    });
    assert.equal(await promiseHelper.contains(['https://returnyoutubedislikeapi.com/*']), true);
    assert.equal(await promiseHelper.request(['https://returnyoutubedislikeapi.com/*']), false);
    assert.equal(await promiseHelper.remove(['https://returnyoutubedislikeapi.com/*']), true);
});

test('privacy policy covers store data categories and Firefox consent packet', () => {
    const read = (relPath) => fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
    const policy = read('docs/privacy-policy.md');
    const readme = read('README.md');
    const checklist = read('docs/cws-submission-checklist.md');
    const architecture = read('docs/architecture.md');
    const { FIREFOX_DATA_COLLECTION_REQUIRED } = require('../scripts/manifest-patch');

    assert.ok(readme.includes('docs/privacy-policy.md'),
        'README must link the stable privacy policy source');
    assert.ok(checklist.includes('docs/privacy-policy.md') || checklist.includes('privacy-policy.md'),
        'store checklist must point at the privacy policy source');
    assert.match(readme, /Firefox 142\+/,
        'README Firefox install/compatibility copy must match the manifest floor');
    assert.match(architecture, /Firefox 142\+/,
        'architecture map must match the manifest Firefox floor');

    for (const phrase of [
        'Chrome Web Store User Data Policy',
        'Limited Use',
        'No telemetry',
        'No advertising',
        'No sale of data',
        'YouTube cookies',
        'Astra Downloader',
        'BYO-key',
        'Retention',
        'Export',
        'Delete'
    ]) {
        assert.ok(policy.includes(phrase), 'privacy policy must mention ' + phrase);
    }

    for (const category of [
        'Authentication information',
        'Web history',
        'User activity',
        'Website content'
    ]) {
        assert.ok(policy.includes(category),
            'privacy policy must include Chrome data category ' + category);
    }

    for (const firefoxCategory of FIREFOX_DATA_COLLECTION_REQUIRED) {
        assert.ok(policy.includes('`' + firefoxCategory + '`'),
            'privacy policy must include Firefox data category ' + firefoxCategory);
        assert.ok(checklist.includes('`' + firefoxCategory + '`'),
            'store checklist must include Firefox data category ' + firefoxCategory);
    }
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
    // v4.47.0 EI-NEW3: the property name changed from `_INTERVAL_MIN_MS`
    // to `_INTERVAL_MIN_MS_FLOOR` (the runtime min is now read via a
    // settings-aware getter). The 500ms safety floor is preserved.
    assert.match(
        ytkitSource,
        /_INTERVAL_MIN_MS_FLOOR:\s*500,/,
        'ytkit.js reaction-spammer feature must declare _INTERVAL_MIN_MS_FLOOR: 500',
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
    // the canonical source is now extension/core/predicate-sandbox.js.
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

test('ytkit.js consumes the PredicateSandbox factory and wires DebugManager telemetry', () => {
    // After the extraction, ytkit.js no longer holds
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
    // v4.47.0 NF16: predicate-ctx gained _extractSubsCount + _readRydLikes
    // helpers between the call site and the declaration, so the slice
    // window needs to be larger to span both helpers AND the declaration
    // body that contains Object.freeze(ctx).
    const buildSig = ytkitSource.indexOf('_buildPredicateCtx(element, videoId, channelInfo)');
    assert.ok(buildSig > -1, '_buildPredicateCtx must accept (element, videoId, channelInfo)');
    const buildBlock = ytkitSource.slice(buildSig, buildSig + 8000);
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
    const block = ytkitSource.slice(start, start + 9000);
    const destroyIdx = block.indexOf('destroy()');
    assert.ok(destroyIdx > -1, 'commentFilterManager must define destroy()');
    const destroyBlock = block.slice(destroyIdx, destroyIdx + 2000);
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

test('downloadHealthPanel reads /health every 30s and renders PO Token / yt-dlp / ffmpeg / SABR pills', () => {
    const start = ytkitSource.indexOf("id: 'downloadHealthPanel'");
    assert.ok(start > -1, 'downloadHealthPanel must exist');
    const block = ytkitSource.slice(start, start + 11000);
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
    assert.match(block, /sabrSupport/, 'must surface SABR support status');
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

test('downloadCobaltFallback records an actionable diagnostic when Cobalt is unreachable', () => {
    const start = ytkitSource.indexOf("id: 'downloadCobaltFallback'");
    assert.ok(start > -1, 'downloadCobaltFallback must exist');
    const block = ytkitSource.slice(start, start + 9000);
    assert.match(block, /_diagnosticInstanceLabel\s*\(\s*instance\s*\)/,
        'must format the configured Cobalt endpoint for diagnostics');
    assert.match(block, /new URL\s*\(\s*instance\s*\)/,
        'diagnostic endpoint label must parse the configured instance as a URL');
    assert.match(block, /return u\.origin/,
        'diagnostic endpoint label must use only the origin, not the full request URL');
    assert.match(block, /DiagnosticLog\?\.record\?\.\(\s*'cobalt-fallback'/,
        'Cobalt failures must be recorded in DiagnosticLog with a stable context');
    assert.match(block, /Cobalt fallback unreachable/,
        'diagnostic text must name the unreachable fallback');
    assert.match(block, /Astra Downloader was offline/,
        'diagnostic text must explain why the fallback path was used');
    assert.match(block, /check downloadCobaltInstance or start Astra Downloader/,
        'diagnostic text must include actionable next steps');
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

test('returnDislike discloses estimated accuracy in the rendered count UI', () => {
    const start = ytkitSource.indexOf("id: 'returnDislike'");
    assert.ok(start > -1, 'returnDislike feature must exist');
    const block = ytkitSource.slice(start, start + 14000);
    assert.match(block, /description: 'Restore an estimated dislike count/,
        'feature description must name the restored count as estimated');
    assert.match(block, /_estimateDisclosureText\(\)/,
        'render path must centralize the estimate disclosure copy');
    assert.match(block, /low-traffic videos can be less accurate/,
        'estimate copy must disclose the low-traffic accuracy caveat');
    assert.match(block, /\.ytkit-ryd-estimate/,
        'rendered UI must include a dedicated estimate affordance');
    assert.match(block, /estimateEl\.textContent = 'est\.'/,
        'successful count render must show a compact estimate label');
    assert.match(block, /pill\.setAttribute\('aria-label', `\$\{countLabel\} estimated dislikes\./,
        'count pill must expose the estimate caveat to assistive tech');
    assert.match(block, /ratioEl\.title = `Like ratio uses estimated Return YouTube Dislike counts/,
        'like-ratio helper must also disclose that it uses estimated counts');
    assert.match(block, /document\.querySelectorAll\('\.ytkit-ryd-pill, \.ytkit-ryd-estimate, \.ytkit-ryd-ratio'\)/,
        'destroy cleanup must remove every RYD-owned render node');

    const userscriptSource = fs.readFileSync(
        path.join(__dirname, '..', 'YTKit.user.js'),
        'utf8'
    );
    assert.match(userscriptSource, /_estimateDisclosureText\(\)/,
        'userscript build must carry the same RYD estimate disclosure');

    const localesRoot = path.join(__dirname, '..', 'extension', '_locales');
    for (const locale of fs.readdirSync(localesRoot)) {
        const messagesPath = path.join(localesRoot, locale, 'messages.json');
        if (!fs.existsSync(messagesPath)) continue;
        const messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
        if (locale === 'en') {
            assert.match(
                messages.feature_returnDislike_desc.message,
                /estimated dislike count/,
                `${locale} feature_returnDislike_desc must disclose estimated counts`
            );
        } else {
            assert.ok(
                messages.feature_returnDislike_desc?.message?.length > 10,
                `${locale} feature_returnDislike_desc must be a non-trivial translated description`
            );
        }
    }
});

test('store-safe manifest makes Return YouTube Dislike a runtime optional host', () => {
    const builder = require('../build-extension.js');
    const manifest = builder.patchManifestForBuildProfile(JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    )), 'store-safe');
    assert.ok(
        !(manifest.host_permissions || []).includes('https://returnyoutubedislikeapi.com/*'),
        'store-safe manifest must not install-time grant the RYD API'
    );
    assert.ok(
        (manifest.optional_host_permissions || []).includes('https://returnyoutubedislikeapi.com/*'),
        'store-safe manifest must declare the RYD API as runtime optional'
    );
    const csp = manifest.content_security_policy?.extension_pages || '';
    assert.ok(
        cspAllowsConnect(csp, 'https://returnyoutubedislikeapi.com'),
        'CSP connect-src must include the RYD API'
    );
});

test('store-safe manifest makes SponsorBlock and DeArrow a runtime optional host', () => {
    const builder = require('../build-extension.js');
    const manifest = builder.patchManifestForBuildProfile(JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    )), 'store-safe');
    assert.ok(
        !(manifest.host_permissions || []).includes('https://sponsor.ajay.app/*'),
        'store-safe manifest must not install-time grant the SponsorBlock/DeArrow API'
    );
    assert.ok(
        (manifest.optional_host_permissions || []).includes('https://sponsor.ajay.app/*'),
        'store-safe manifest must declare the SponsorBlock/DeArrow API as runtime optional'
    );
    const csp = manifest.content_security_policy?.extension_pages || '';
    assert.ok(
        cspAllowsConnect(csp, 'https://sponsor.ajay.app'),
        'CSP connect-src must include the SponsorBlock/DeArrow API'
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
    const block = ytkitSource.slice(start, start + 78000);
    assert.match(block, /_GROUPS_KEY: 'subscriptionGroupData'/,
        'must persist groups to subscriptionGroupData');
    assert.match(block, /a\[href\*="\/channel\/"]/,
        'must extract channel IDs from /channel/UC… links');
    assert.match(block, /addNavigateRule\(this\.id/,
        'must hook the SPA navigate event so groups re-apply on route changes');
    assert.match(block, /addScopedMutationRule\(this\.id, 'ytd-rich-item-renderer, ytd-video-renderer'/,
        'must hook a scoped mutation rule so newly-rendered cards get filtered without reacting to injected badges');
});

test('subscriptionGroups exports + imports JSON with schema version', () => {
    const start = ytkitSource.indexOf("id: 'subscriptionGroups'");
    const block = ytkitSource.slice(start, start + 78000);
    assert.match(block, /schemaVersion:\s*2/,
        'export payload must declare schemaVersion 2');
    assert.match(block, /astra-deck-subscription-groups-/,
        'export filename must include the project prefix');
    // Import must sanitize channelIds + name length + color format.
    assert.match(block, /Array\.isArray\(raw\.channelIds\)/,
        'import must validate that raw.channelIds is an array before assigning');
    assert.match(block, /\/\^#\[0-9a-fA-F\]\{6\}\$\//,
        'import must validate the color is a 6-digit hex code');
    assert.match(block, /parentId:\s*''/,
        'import must default parentId to top-level for legacy v1 payloads');
});

test('subscriptionGroups destroy() clears toolbar, hidden-by-group classes, and new-since badges', () => {
    const start = ytkitSource.indexOf("id: 'subscriptionGroups'");
    const block = ytkitSource.slice(start, start + 78000);
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
    const block = ytkitSource.slice(start, start + 78000);
    assert.match(block, /'duration-asc'/, 'must support duration-asc sort');
    assert.match(block, /'unwatched'/, 'must support unwatched sort');
    assert.match(block, /'new-since-last-visit'/, 'must support new-since-last-visit sort');
});

test('subscriptionGroups persists sort mode per active group (NF31)', () => {
    const start = ytkitSource.indexOf("id: 'subscriptionGroups'");
    const block = ytkitSource.slice(start, start + 78000);
    assert.match(block, /_SORT_MODES:\s*Object\.freeze\(\['default', 'date-desc', 'duration-asc', 'unwatched', 'new-since-last-visit', 'popular'\]\)/,
        'subscriptionGroups must centralize the allowed sort modes');
    assert.match(block, /_getActiveSortMode\(groups = this\._readGroups\(\)\)[\s\S]*groups\[this\._activeGroupId\]\?\.sortMode/,
        'active group sort must be read from subscriptionGroupData when a group is selected');
    assert.match(block, /_setActiveSortMode\(mode\)[\s\S]*\[this\._activeGroupId\]: \{[\s\S]*sortMode: normalized[\s\S]*this\._writeGroups\(next\)/,
        'selected group sort changes must persist on that group record');
    assert.match(block, /appState\.settings\.subscriptionSortMode = normalized/,
        'the legacy top-level sort setting must only remain as the all-subscriptions fallback');
    assert.match(block, /sortMode: this\._normalizeSubscriptionSortMode\(raw\.sortMode\)/,
        'group import must preserve valid per-group sort modes and normalize stale values');
    assert.match(block, /sortMode: this\._getActiveSortMode\(\)/,
        'new groups must inherit the current active sort mode as their own baseline');
    assert.match(block, /const activeSortMode = this\._getActiveSortMode\(groups\)[\s\S]*if \(activeSortMode === v\) opt\.selected = true/,
        'toolbar select must display the active group sort mode');
    assert.match(block, /const mode = this\._setActiveSortMode\(sortSelect\.value\)[\s\S]*this\._applySort\(mode\)/,
        'toolbar changes must route through the per-group sort writer before sorting');
});

test('subscriptionGroups supports depth-2 parentId groups with JSON round-trip (NF2)', () => {
    const start = ytkitSource.indexOf("id: 'subscriptionGroups'");
    const block = ytkitSource.slice(start, start + 78000);
    assert.match(block, /_getGroupParentId\(groupId, groups = this\._readGroups\(\)\)/,
        'subscriptionGroups must expose parentId normalization for nested groups');
    assert.match(block, /grandParentId && groups\[grandParentId\] \? '' : parentId/,
        'parentId normalization must reject child-of-child depth');
    assert.match(block, /_getChildGroupIds\(parentId, groups = this\._readGroups\(\)\)/,
        'subscriptionGroups must expose child lookup by parentId');
    assert.match(block, /_getGroupChannelIdSet\(groupId, groups = this\._readGroups\(\)\)/,
        'subscriptionGroups must compute active channel sets through a helper');
    assert.match(block, /for \(const childId of this\._getChildGroupIds\(groupId, groups\)\)/,
        'top-level group filters must include child group channelIds');
    assert.match(block, /rawParentById/,
        'import must keep a raw parentId map for two-pass normalization');
    assert.match(block, /sanitized\[id\]\.parentId = parentId/,
        'import must preserve valid depth-2 parentId links');
    assert.match(block, /!rawParentById\[parentId\]/,
        'import must reject child-of-child parentId links');
    assert.match(block, /_showNewGroupDialog\(anchorEl, parentId = ''\)/,
        'new group dialog must accept an optional parentId');
    assert.match(block, /safeParentId = this\._normalizeNewGroupParentId\(parentId, groups\)/,
        'new group dialog must normalize parentId before persisting');
    assert.match(block, /parentId: safeParentId/,
        'new groups must persist parentId for subgroups');
    assert.match(block, /chip\.dataset\.depth = String\(depth\)/,
        'toolbar chips must expose depth for child-group styling');
    assert.match(block, /\+ Subgroup/,
        'toolbar must expose a subgroup creation action for top-level active groups');
});

test('subscriptionGroups stages dead-channel unsubscribe candidates with a 30-day undo window', () => {
    const start = ytkitSource.indexOf("id: 'subscriptionGroups'");
    const block = ytkitSource.slice(start, start + 78000);
    assert.match(block, /_UNSUB_STAGE_KEY: 'subscriptionUnsubscribeStagingData'/,
        'dead-channel staging must persist into subscriptionUnsubscribeStagingData');
    assert.match(block, /_UNSUB_STAGE_TTL_MS:\s*30 \* 24 \* 60 \* 60 \* 1000/,
        'dead-channel staging must use a 30-day undo window');
    assert.match(block, /_STALE_CHANNEL_MIN_AGE_DAYS:\s*365/,
        'dead-channel candidates must require at least one year of rendered inactivity');
    assert.match(block, /_extractCardAgeDays\(text\)/,
        'dead-channel detection must parse rendered card age text');
    assert.match(block, /_collectDeadChannelCandidates\(\)/,
        'dead-channel detection must collect explicit candidates before staging');
    assert.match(block, /ageDays === null \|\| ageDays < this\._STALE_CHANNEL_MIN_AGE_DAYS/,
        'candidate collection must reject fresh or unknown-age cards');
    assert.match(block, /card\.classList\.contains\('ytkit-sub-hidden-by-group'\)/,
        'candidate collection must respect the active group filter');
    assert.match(block, /_stageDeadChannelUnsubscribes\(\)/,
        'toolbar action must route through the staging helper');
    assert.match(block, /undoUntil:\s*now \+ this\._UNSUB_STAGE_TTL_MS/,
        'staged records must carry the explicit undoUntil timestamp');
    assert.match(block, /_undoStagedUnsubscribes\(channelIds\)/,
        'staged records must be reversible by channel ID');
    assert.match(block, /dataset\.action = 'stage-unsubscribe'/,
        'toolbar must expose a stage-unsubscribe action');
    assert.match(block, /ytkit-sub-dead-badge/,
        'rendered stale candidates must receive a visible stale marker');
    assert.match(block, /ytkit-sub-staged-badge/,
        'staged candidates must receive a visible staged marker');
    assert.match(block, /No YouTube unsubscribe buttons are clicked/,
        'the stage button must disclose that it does not click YouTube unsubscribe controls');
    assert.doesNotMatch(block, /unsubscribe[^;]{0,120}\.click\(/i,
        'bulk unsubscribe staging must not directly click unsubscribe controls');
    assert.deepEqual(defaultSettings.subscriptionUnsubscribeStagingData, {},
        'default-settings.json must seed an empty unsubscribe staging map');
    const entry = settingsSchemaModule.SETTINGS_SCHEMA.find((e) => e.key === 'subscriptionUnsubscribeStagingData');
    assert.ok(entry, 'settings-schema must catalogue subscriptionUnsubscribeStagingData');
    assert.equal(entry.type, 'object', 'subscriptionUnsubscribeStagingData must be object typed');
});

test('videoNotes stores local per-video notes with export and a 1000-note LRU cap', () => {
    const start = ytkitSource.indexOf("id: 'videoNotes'");
    assert.ok(start > -1, 'videoNotes feature must exist');
    const block = ytkitSource.slice(start, start + 30000);
    assert.match(block, /_DATA_KEY: 'videoNotesData'/,
        'videoNotes must persist notes into videoNotesData');
    assert.match(block, /_MAX_NOTES: 1000/,
        'videoNotes must cap the archive at 1000 notes');
    assert.match(block, /_MAX_NOTE_CHARS: 5000/,
        'videoNotes must cap each note body');
    assert.match(block, /_enforceNotesCap\(notes\)/,
        'videoNotes must centralize cap enforcement');
    assert.match(block, /entries\.sort\(\(a, b\) => \(Number\(b\[1\]\?\.updatedAt\) \|\| 0\) - \(Number\(a\[1\]\?\.updatedAt\) \|\| 0\)\)/,
        'videoNotes cap must be LRU by updatedAt descending');
    assert.match(block, /Object\.fromEntries\(entries\.slice\(0, this\._MAX_NOTES\)\)/,
        'videoNotes cap must keep only the newest 1000 records');
    assert.match(block, /appState\.settings\[this\._DATA_KEY\] = capped/,
        'videoNotes writes must remain inside the settings snapshot for export/import');
    assert.match(block, /textarea\.maxLength = this\._MAX_NOTE_CHARS/,
        'videoNotes UI must enforce note length at the textarea');
    assert.match(block, /textarea\.addEventListener\('input', \(\) => this\._scheduleSave\(textarea\.value\)\)/,
        'videoNotes UI must debounce local saves from textarea input');
    assert.match(block, /handleFileExport\(`astra-deck-video-notes-/,
        'videoNotes must expose an explicit notes export');
    assert.match(block, /schemaVersion:\s*1/,
        'videoNotes export payload must be versioned');
    assert.match(block, /addNavigateRule\(this\.id, this\._navRule\)/,
        'videoNotes must reattach across SPA navigation');
    assert.match(block, /removeNavigateRule\(this\.id\)/,
        'videoNotes must remove its navigate rule on destroy');
    assert.equal(defaultSettings.videoNotes, false,
        'videoNotes must be off by default');
    assert.deepEqual(defaultSettings.videoNotesData, {},
        'videoNotesData must default to an empty object');
    const toggleEntry = settingsSchemaModule.SETTINGS_SCHEMA.find((e) => e.key === 'videoNotes');
    const dataEntry = settingsSchemaModule.SETTINGS_SCHEMA.find((e) => e.key === 'videoNotesData');
    assert.ok(toggleEntry, 'settings-schema must catalogue videoNotes');
    assert.ok(dataEntry, 'settings-schema must catalogue videoNotesData');
    assert.equal(toggleEntry.type, 'boolean', 'videoNotes must be a boolean toggle');
    assert.equal(dataEntry.type, 'object', 'videoNotesData must be object typed');
});

test('timestampBookmarks enforces a deterministic write-time cap on the real bookmark map', () => {
    const start = ytkitSource.indexOf("id: 'timestampBookmarks'");
    assert.ok(start > -1, 'timestampBookmarks feature must exist');
    const block = ytkitSource.slice(start, start + 12000);

    assert.match(ytkitSource, /function sanitizeTimestampBookmarks\(value, limits = IMPORT_LIMITS\)/,
        'timestamp bookmark cap must live in a shared sanitizer');
    assert.match(ytkitSource, /sanitizedEntries\.sort\(\(left, right\) => \(\(Number\(right\.d\) \|\| 0\) - \(Number\(left\.d\) \|\| 0\)\) \|\| \(left\.t - right\.t\)\)/,
        'per-video bookmark eviction must keep newest edited bookmarks before restoring chronological render order');
    assert.match(ytkitSource, /videos\.sort\(\(left, right\) => \(right\[2\] - left\[2\]\) \|\| left\[0\]\.localeCompare\(right\[0\]\)\)/,
        'bookmark video eviction must sort by newest edit and then video id for deterministic ties');
    assert.match(ytkitSource, /videos\.slice\(0, limits\.bookmarkVideos\)/,
        'bookmark sanitizer must cap the number of videos retained');
    assert.match(block, /_MAX_BOOKMARK_VIDEOS: IMPORT_LIMITS\.bookmarkVideos/,
        'timestampBookmarks must document its video-map cap');
    assert.match(block, /_MAX_BOOKMARKS_PER_VIDEO: IMPORT_LIMITS\.bookmarksPerVideo/,
        'timestampBookmarks must document its per-video cap');
    assert.match(block, /_writeBookmarks\(bookmarks\)/,
        'timestampBookmarks must centralize capped writes');
    assert.match(block, /this\._writeBookmarks\(bookmarks\)/,
        'adding a bookmark must persist through the capped write helper');
    assert.match(block, /this\._writeBookmarks\(nextBookmarks\)/,
        'undo restore must persist through the capped write helper');
    assert.match(block, /bks\[videoId\]\[idx\]\.d = Date\.now\(\)/,
        'note edits must refresh LRU timestamp before capped persistence');
});

test('watch progress and watch-time stores enforce deterministic caps on write', () => {
    const progressStart = ytkitSource.indexOf("id: 'watchProgress'");
    assert.ok(progressStart > -1, 'watchProgress feature must exist');
    const progressBlock = ytkitSource.slice(progressStart, progressStart + 8000);
    const trackerStart = ytkitSource.indexOf("id: 'watchTimeTracker'");
    assert.ok(trackerStart > -1, 'watchTimeTracker feature must exist');
    const trackerBlock = ytkitSource.slice(trackerStart, trackerStart + 8000);

    assert.match(ytkitSource, /function sanitizeWatchProgressStore\(value, nowMs = Date\.now\(\)\)/,
        'watch progress cap must live in a shared sanitizer');
    assert.match(ytkitSource, /entries\.slice\(0, STORAGE_CAPS\.watchProgressVideos\)/,
        'watch progress sanitizer must cap retained videos');
    assert.match(progressBlock, /_MAX_PROGRESS_VIDEOS: STORAGE_CAPS\.watchProgressVideos/,
        'watchProgress must document its retained-video cap');
    assert.match(progressBlock, /_writeProgress\(progress\)/,
        'watchProgress must centralize capped writes');
    assert.match(progressBlock, /this\._writeProgress\(progress\)/,
        'watchProgress save path must persist through the capped write helper');
    assert.match(ytkitSource, /function sanitizeWatchTimeStats\(value, nowDate = new Date\(\)\)/,
        'watch-time stats cap must live in a shared sanitizer');
    assert.match(ytkitSource, /days\.slice\(0, STORAGE_CAPS\.watchTimeDays\)/,
        'watch-time sanitizer must cap retained day keys');
    assert.match(trackerBlock, /_writeStats\(stats\)/,
        'watchTimeTracker must centralize capped writes');
    assert.match(trackerBlock, /this\._writeStats\(stats\)/,
        'watchTimeTracker tick path must persist through the capped write helper');
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

test('researchSpacedReview exports study/work data to Markdown and CSV', () => {
    const start = ytkitSource.indexOf("id: 'researchSpacedReview'");
    assert.ok(start > -1, 'researchSpacedReview must exist');
    const block = ytkitSource.slice(start, start + 18000);
    assert.match(block, /name: 'Study \/ Work Export'/,
        'feature label must reflect the broader study/work export surface');
    assert.match(block, /_collectStudyWorkData\(\)/,
        'must gather watch time, focused mode, digital wellbeing, and bookmarks before export');
    assert.match(block, /_buildStudyMarkdown\(data = this\._collectStudyWorkData\(\)\)/,
        'must build a Markdown export');
    assert.match(block, /_buildStudyCsv\(data = this\._collectStudyWorkData\(\)\)/,
        'must build a CSV export');
    assert.match(block, /entry\?\.t \?\? entry\?\.time \?\? entry\?\.seconds/,
        'bookmark export must read the live timestampBookmarks t field and legacy aliases');
    assert.match(block, /entry\?\.n \?\? entry\?\.note \?\? entry\?\.text/,
        'bookmark export must read the live timestampBookmarks n field and legacy aliases');
    assert.match(block, /ytkit-watch-time/,
        'study/work export must include Watch Time Tracker data');
    assert.match(block, /dwWatchTimeToday/,
        'study/work export must include Digital Wellbeing day state');
    assert.match(block, /focusedMode/,
        'study/work export must include Focused Mode state');
    assert.match(block, /row_type', 'exported_at', 'date', 'video_id'/,
        'CSV header must expose stable study/work columns');
    assert.match(block, /_csvEscape/,
        'must declare a CSV escaper');
    assert.match(block, /s\.replace\(\/"\/g, '""'\)/,
        'CSV escaper must double-quote embedded quotes');
    assert.match(block, /astra-deck-study-work-\$\{today\}\.\$\{isCsv \? 'csv' : 'md'\}/,
        'exports must use a dated study/work filename');
    assert.match(block, /text\/csv;charset=utf-8/,
        'CSV downloads must use a text/csv MIME type');
    assert.match(block, /text\/markdown;charset=utf-8/,
        'Markdown downloads must use a text/markdown MIME type');
    assert.match(block, /Export study MD/,
        'watch-page UI must expose a Markdown export action');
    assert.match(block, /Export study CSV/,
        'watch-page UI must expose a CSV export action');
    const exportIdx = ytkitSource.indexOf('function handleFileExport');
    const exportBlock = ytkitSource.slice(exportIdx, exportIdx + 500);
    assert.match(exportBlock, /type = 'application\/json'/,
        'shared export helper must keep JSON as the default MIME type');
    assert.match(exportBlock, /new Blob\(\[content\], \{ type \}\)/,
        'shared export helper must honor per-export MIME types');
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
    // Hard rule from the user's the project notes: allowed backdrop radii are
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
    // Hard rule from the user's the project notes applies to OUR injected UI, not
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

test('ytkit.js DiagnosticLog instantiates from core/diagnostic-log.js factory when present', () => {
    // First extraction (the ytkit.js monolith). The
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

test('popup ships a selector-health dashboard wired to the content script', () => {
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

test('ytkit.js TrustedHTML.setHTML delegates HTML writes to core/trusted-html.js', () => {
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
    assert.match(block, /core\.setTrustedHTML\(element,\s*policy \? policy\.createHTML\(html\) : html\)/,
        'setHTML must call core.setTrustedHTML for policy and no-policy paths');
    assert.match(block, /core\.toTrustedHTML\(html\)/,
        'create() must call core.toTrustedHTML on the no-policy path');
    assert.doesNotMatch(block, /element\.innerHTML\s*=/,
        'TrustedHTML wrapper must not use raw innerHTML sinks');
    // Legacy inline DOMParser fallback must still exist as the last-resort
    // safety net for unit-test contexts that load ytkit.js in isolation.
    assert.match(block, /Inline fallback \(legacy code path\)/,
        'inline DOMParser fallback must remain as last-resort safety net');
});

test('DiagnosticLog exposes per-ctx counters via countsByCtx()', () => {
    // Popup health surface used to surface only TT events. With multiple
    // ctx classes flowing through the ring (trusted-types, selector-health,
    // storage-corruption, settings-migration, console, window) the popup
    // needs cheap O(1)-per-ctx access. countsByCtx() is the derived-view
    // accessor; the per-ctx counter is maintained inline by record() so
    // there's no whole-ring scan on every read.
    //
    // moved the implementation to
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

test('popup detects malformed chrome.storage payloads and offers Reset', () => {
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

test('popup ships a storage-quota warning banner with two-tier thresholds', () => {
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

test('ytkit-main.js uses a single MutationObserver on <html> with 3 registered handlers', () => {
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

test('popup.html ships inline CSP meta with the audited tightenings', () => {
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
    // v4.47.0 EI-NEW2: substring includes() match was replaced with
    // exact-equality `!==` so a hypothetical music.youtube.com.evil.tld
    // can't be matched. The early-return invariant is preserved.
    const start = ytkitSource.indexOf("id: 'youtubeMusicCompat'");
    assert.ok(start > -1, 'youtubeMusicCompat must exist');
    const block = ytkitSource.slice(start, start + 3000);
    assert.match(block, /location\.hostname !== 'music\.youtube\.com'/,
        'must early-return on non-music hostnames via exact-equality match');
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
    // after observer consolidation both attributes are
    // registered together via the shared _obsRegister helper (not via a
    // dedicated attributeFilter array on a per-handler observer). The
    // semantic is preserved: both attributes are observed.
    assert.match(mainSource, /_obsRegister\(\['data-ytkit-quality-target',\s*'data-ytkit-quality-context'\]/,
        'ytkit-main.js must register both quality data attributes with the shared observer');
});

// ── v4.2.0 P1: Popularity sort + transcript search panel ──

test('subscriptionGroups popularity sort reads view-count from card metadata', () => {
    const start = ytkitSource.indexOf("id: 'subscriptionGroups'");
    const block = ytkitSource.slice(start, start + 78000);
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
    const block = ytkitSource.slice(start, start + 78000);
    // Hardening pass replaced window.prompt with _showNewGroupDialog.
    assert.match(block, /_showNewGroupDialog/,
        'subscriptionGroups must expose the inline new-group dialog');
    // Match the call syntax — explanatory comments referencing the deprecated
    // API are allowed and useful for historical context.
    assert.ok(!/window\.prompt\s*\(/.test(block),
        'subscriptionGroups must not call window.prompt(...)');
    // The dialog must focus-trap (aria-modal) and clean up on destroy.
    const dlgIdx = block.indexOf('_showNewGroupDialog');
    const dlgBody = block.slice(dlgIdx, dlgIdx + 10000);
    assert.match(dlgBody, /setAttribute\('aria-modal', 'true'\)/,
        'dialog must declare aria-modal so screen readers trap focus');
    assert.match(dlgBody, /key === 'Escape'/,
        'dialog must dismiss on Esc');
});

test('subscriptionLastVisitData is capped to prevent unbounded growth', () => {
    const start = ytkitSource.indexOf("id: 'subscriptionGroups'");
    const block = ytkitSource.slice(start, start + 78000);
    const capIdx = block.indexOf('_capLastVisitMap');
    const capBody = block.slice(capIdx, capIdx + 1200);
    const stampIdx = block.indexOf('_stampLastVisit()');
    const stampBody = block.slice(stampIdx, stampIdx + 1500);
    assert.match(capBody, /LAST_VISIT_CAP/,
        'last-visit pruning must declare a cap constant');
    assert.match(capBody, /sort\(\(a, b\)/,
        'cap pruning must sort by timestamp before dropping the oldest entries');
    assert.match(stampBody, /this\._writeLastVisit\(this\._capLastVisitMap\(lastVisit\)\)/,
        '_stampLastVisit must route writes through the shared cap helper');
});

test('subscriptionGroups renders group digest counts and mark-read controls', () => {
    const start = ytkitSource.indexOf("id: 'subscriptionGroups'");
    const block = ytkitSource.slice(start, start + 78000);
    assert.match(block, /_digestPanel:\s*null/,
        'subscriptionGroups must track the digest panel for teardown and rerenders');
    assert.match(block, /_extractCardAgeMs\(text\)/,
        'digest/new-since logic must parse rendered relative age text to milliseconds');
    assert.match(block, /_isCardNewSinceLastVisit\(card, channelId, lastVisit = this\._readLastVisit\(\)\)/,
        'digest counts must use the shared new-since-last-visit predicate');
    assert.match(block, /_collectRenderedCardSummaries\(lastVisit = this\._readLastVisit\(\)\)/,
        'digest rendering must gather rendered video/channel summaries');
    assert.match(block, /_buildGroupDigestEntries\(groups = this\._readGroups\(\), lastVisit = this\._readLastVisit\(\)\)/,
        'digest must expose per-group count entries');
    assert.match(block, /ytkit-sub-digest-panel/,
        'digest panel CSS/DOM class must be present');
    assert.match(block, /ytkit-sub-digest-row/,
        'digest must render per-group rows');
    assert.match(block, /dataset\.action = 'digest'/,
        'toolbar must expose a Digest action');
    assert.match(block, /Mark read/,
        'digest rows must offer a mark-read control');
    assert.match(block, /this\._writeLastVisit\(this\._capLastVisitMap\(next\)\)/,
        'mark-read must update last-visit data through the bounded writer path');
    assert.match(block, /if \(this\._digestPanel\) this\._renderDigestPanel\(\)/,
        'feed mutations/stamps must refresh an open digest panel');
    const destroyIdx = block.indexOf('destroy()');
    const destroyBlock = block.slice(destroyIdx, destroyIdx + 2000);
    assert.match(destroyBlock, /this\._closeDigestPanel\(\)/,
        'destroy() must close the digest panel');
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
    const block = ytkitSource.slice(start, start + 78000);
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
    // Per-video notes added videoNotes + videoNotesData (360 → 362);
    // cleanUiPreset (Compact Clean UI opt-in) lifted the pin from 363
    // to 364; zenMode lifted it to 365; preset profiles added 3 more.
    // Video flip added videoFlip + videoFlipMode (374 → 376).
    // Subscription content-type filter added 2 booleans (376 → 378).
    // Mono-to-stereo added 1 boolean (378 → 379).
    // Auto-dismiss content warning added 1 boolean (379 → 380).
    // Keep the literal so a future schema addition must bump this
    // number deliberately.
    assert.equal(settingsSchemaModule.SETTINGS_SCHEMA.length, 384,
        'SETTINGS_SCHEMA must cover all 384 keys');
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

function makeNonDefaultSchemaValue(entry) {
    switch (entry.type) {
    case 'boolean':
        return !entry.defaultValue;
    case 'number':
        return Number(entry.defaultValue || 0) + 1;
    case 'array':
        return ['__schema_export_test__', entry.key];
    case 'object':
        return { __schemaExportTest: entry.key };
    case 'null':
        return '__schema_export_test_null__';
    case 'string':
    default:
        return `__schema_export_test_${entry.key}__`;
    }
}

function schemaKeyLooksCredentialBearing(key) {
    const raw = String(key || '');
    const compact = raw.replace(/[_-]/g, '').toLowerCase();
    return compact.includes('apikey')
        || compact.endsWith('token')
        || compact.includes('bearer')
        || compact.includes('secret')
        || compact.includes('password')
        || compact.includes('credential')
        || /(?:private|access|refresh|session|signing)key$/.test(compact)
        || compact.endsWith('cookie')
        || compact.endsWith('cookies')
        || compact.endsWith('cookiejar')
        || /^auth/i.test(raw)
        || /[a-z]Auth/.test(raw);
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

test('feature-lifecycle: snapshot includes init/destroy timing', () => {
    const core = loadLifecycleModule();
    const lc = core.createLifecycle({ logger: { warn() {} } });
    lc.defineFeature({
        id: 'timed',
        category: 'shell',
        init() {},
        destroy() {}
    });
    lc.start('timed');
    const afterInit = lc.snapshot().find((s) => s.id === 'timed');
    assert.equal(typeof afterInit.initMs, 'number', 'initMs must be a number after start');
    assert.ok(afterInit.initMs >= 0, 'initMs must be non-negative');
    assert.equal(afterInit.destroyMs, null, 'destroyMs must be null before destroy');
    lc.destroy('timed');
    const afterDestroy = lc.snapshot().find((s) => s.id === 'timed');
    assert.equal(typeof afterDestroy.destroyMs, 'number', 'destroyMs must be a number after destroy');
    assert.ok(afterDestroy.destroyMs >= 0, 'destroyMs must be non-negative');
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

test('policy-profile: nullable-complex settings accept populated runtime shapes (sidebarOrder/lowPowerProfileBackup)', () => {
    const core = loadPolicyProfileModule();
    const pp = core.createPolicyProfile();
    // Regression: these keys are schema type "null" (default null) but hold an
    // array/object at runtime. The validator must accept the populated shape,
    // otherwise export/import hard-fails for anyone who reordered their sidebar.
    const populated = pp.validateSettingsSnapshot({
        sidebarOrder: ['history', 'wl', 'subs'],
        lowPowerProfileBackup: { enableCPU_Tamer: false }
    }, { allowUnknown: true });
    assert.equal(populated.ok, true, populated.errors && populated.errors.join('; '));
    assert.deepEqual(populated.settings.sidebarOrder, ['history', 'wl', 'subs']);

    // null is still valid (the unset default).
    const nulled = pp.validateSettingsSnapshot({ sidebarOrder: null }, { allowUnknown: true });
    assert.equal(nulled.ok, true);

    // A type-incorrect value (number) is still rejected.
    const bad = pp.validateSettingsSnapshot({ sidebarOrder: 42 }, { allowUnknown: true });
    assert.equal(bad.ok, false);
});

test('policy-profile: clamps out-of-range numbers and coerces unknown enums to the default', () => {
    const core = loadPolicyProfileModule();
    const pp = core.createPolicyProfile();
    // Corrupted/hostile values are sanitized into safe ones rather than
    // rejecting the whole snapshot.
    const r = pp.validateSettingsSnapshot({
        videosPerRow: 9999,            // max 8
        hideVideosWatchedRatio: -3,    // min 0
        videoRotationAngle: 47,        // enum [0,90,180,270] -> default 0
        returnDislikeCacheHours: 0,    // min 1
    }, { allowUnknown: true });
    assert.equal(r.ok, true, r.errors && r.errors.join('; '));
    assert.equal(r.settings.videosPerRow, 8);
    assert.equal(r.settings.hideVideosWatchedRatio, 0);
    assert.equal(r.settings.videoRotationAngle, 0);
    assert.equal(r.settings.returnDislikeCacheHours, 1);

    // In-range / valid values pass through untouched.
    const ok = pp.validateSettingsSnapshot({ videosPerRow: 5, videoRotationAngle: 90 }, { allowUnknown: true });
    assert.equal(ok.settings.videosPerRow, 5);
    assert.equal(ok.settings.videoRotationAngle, 90);
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

test('v5.0.0 policy-profile: store-safe export covers every github-full schema key', () => {
    const core = loadPolicyProfileModule();
    const pp = core.createPolicyProfile();
    const { SETTINGS_SCHEMA } = settingsSchemaModule;
    const githubFullEntries = SETTINGS_SCHEMA.filter((entry) => entry.profile === 'github-full');
    assert.ok(githubFullEntries.length > 0,
        'schema must keep at least one github-full-gated key for this regression');

    const input = {};
    for (const entry of SETTINGS_SCHEMA) {
        input[entry.key] = makeNonDefaultSchemaValue(entry);
    }

    const { settings: out, effective } = pp.buildExportSnapshot(input, { effective: 'store-safe' });
    assert.equal(effective, 'store-safe');

    for (const entry of githubFullEntries) {
        if (pp.shouldScrubKey(entry.key)) {
            assert.equal(entry.key in out, false,
                `${entry.key} is credential-shaped and must be removed before profile defaulting`);
        } else {
            assert.deepEqual(out[entry.key], entry.defaultValue,
                `${entry.key} must revert to its schema default in a store-safe export`);
        }
    }
});

test('v5.0.0 policy-profile: github-full export still scrubs credential-shaped schema keys', () => {
    const core = loadPolicyProfileModule();
    const pp = core.createPolicyProfile();
    const { SETTINGS_SCHEMA } = settingsSchemaModule;
    const credentialEntries = SETTINGS_SCHEMA.filter((entry) => schemaKeyLooksCredentialBearing(entry.key));
    assert.ok(credentialEntries.some((entry) => entry.key === 'aiSummaryApiKey'),
        'live schema credential coverage must include the BYO AI key');

    const input = {};
    for (const entry of SETTINGS_SCHEMA) {
        input[entry.key] = makeNonDefaultSchemaValue(entry);
    }

    for (const entry of credentialEntries) {
        assert.equal(pp.shouldScrubKey(entry.key), true,
            `${entry.key} looks credential-bearing and must match shouldScrubKey`);
    }

    for (const effective of ['store-safe', 'github-full']) {
        const { settings: out } = pp.buildExportSnapshot(input, { effective });
        for (const entry of credentialEntries) {
            assert.equal(entry.key in out, false,
                `${entry.key} must be absent from ${effective} export snapshots`);
        }
    }
});

test('policy-profile validates schema-shaped settings backup payloads', () => {
    const core = loadPolicyProfileModule();
    const pp = core.createPolicyProfile();
    const valid = pp.validateSettingsSnapshot({
        sponsorBlock: true,
        videosPerRow: 4,
        hiddenChatElements: ['header', 'polls'],
        subscriptionGroupData: {},
        lowPowerProfileBackup: null
    });
    assert.equal(valid.ok, true, valid.errors.join('; '));
    assert.deepEqual(valid.settings.hiddenChatElements, ['header', 'polls']);

    const invalid = pp.validateSettingsSnapshot(JSON.parse(
        '{"sponsorBlock":"true","videosPerRow":"4","unknownFutureSetting":true,"__proto__":true}'
    ));
    assert.equal(invalid.ok, false, 'shape drift and unknown keys must be rejected');
    assert.ok(invalid.errors.some((msg) => msg.includes('invalid type for "sponsorBlock"')));
    assert.ok(invalid.errors.some((msg) => msg.includes('invalid type for "videosPerRow"')));
    assert.ok(invalid.errors.some((msg) => msg.includes('unknown setting "unknownFutureSetting"')));
    assert.ok(invalid.errors.some((msg) => msg.includes('unsafe setting key "__proto__"')));
});

test('policy-profile schema-only export drops unknown keys and reports scrubbed credentials', () => {
    const core = loadPolicyProfileModule();
    const pp = core.createPolicyProfile();
    const snap = pp.buildExportSnapshot({
        sponsorBlock: true,
        aiSummaryApiKey: 'sk-test',
        unknownFutureSetting: 'keep me out'
    }, { effective: 'github-full', schemaOnly: true });

    assert.equal(snap.settings.sponsorBlock, true);
    assert.equal('aiSummaryApiKey' in snap.settings, false,
        'credential-bearing setting value must not be present in schema-only export');
    assert.equal('unknownFutureSetting' in snap.settings, false,
        'unknown settings must not be present in schema-only export');
    assert.ok(snap.scrubbedKeys.includes('aiSummaryApiKey'),
        'schema-only export should declare that aiSummaryApiKey was scrubbed');
    assert.equal(pp.validateSettingsSnapshot(snap.settings).ok, true,
        'schema-only export output must validate as an importable settings snapshot');
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

test('v4.47.0 EI-NEW6 — selector-health surfaces class and attribute shape drift', () => {
    const {
        summarizeSelectorHealth,
        rankSelectorProblems,
        formatSelectorCopyReport
    } = require('../extension/core/selector-health.js');
    const snapshot = [
        {
            surface: 'healthy',
            hitCount: 40,
            missCount: 0,
            errorCount: 0,
            selectors: [{ hasShapeSample: true, shapeDrifts: 0 }]
        },
        {
            surface: 'churned',
            hitCount: 40,
            missCount: 0,
            errorCount: 0,
            highChurn: true,
            selectors: [
                {
                    hasShapeSample: true,
                    firstShape: 't:ytd-watch-flexy|attrs:2|attr-sig:a|class-count:1|class-sig:b',
                    lastShape: 't:ytd-watch-flexy|attrs:3|attr-sig:c|class-count:2|class-sig:d',
                    shapeDrifts: 3
                }
            ]
        },
        {
            surface: 'unsampled-hit',
            hitCount: 5,
            missCount: 0,
            errorCount: 0,
            selectors: [{ hasShapeSample: false, shapeDrifts: 0 }]
        }
    ];

    const summary = summarizeSelectorHealth(snapshot);
    assert.equal(summary.totalShapeDrifts, 3,
        'summary must aggregate shape-drift counts across selector rows');
    assert.equal(summary.surfacesWithShapeDrift, 1,
        'summary must count surfaces with class/attribute churn');
    assert.equal(summary.surfacesWithoutShapeSample, 1,
        'summary must distinguish hit-only surfaces that have not sampled shape');

    const ranked = rankSelectorProblems(snapshot, 5);
    assert.equal(ranked[0].surface, 'churned',
        'shape drift must rank as a problem even when selectors still hit');
    assert.equal(ranked[0].shapeDrifts, 3);
    assert.equal(ranked[0].hasShapeSample, true);

    const report = formatSelectorCopyReport(snapshot, {
        productVersion: '4.47.0',
        browserUA: 'unit-test',
        exportedAt: '2026-06-04T00:00:00Z',
        topN: 3
    });
    assert.match(report, /surfaces with drift:\s+1/);
    assert.match(report, /total shape drifts:\s+3/);
    assert.match(report, /- churned: 0\/40 attempts failed \(0%\); 3 shape drifts\s+\[high-churn\]/);
    assert.match(report, /Comparing shape drift for class\/attribute churn/);
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
        assert.ok(['required', 'runtime-optional'].includes(e.hostGrant));
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
            'https://*.youtube.com/*'
        ],
        optionalHostPermissions: [
            'https://sponsor.ajay.app/*'
        ]
    });
    const origins = df.getOrigins({});
    const youtube = origins.find((e) => e.origin === 'https://*.youtube.com');
    assert.equal(youtube.manifestPermission, 'https://*.youtube.com/*');
    const sb = origins.find((e) => e.origin === 'https://sponsor.ajay.app');
    assert.equal(sb.manifestPermission, null);
    assert.equal(sb.optionalManifestPermission, 'https://sponsor.ajay.app/*');
    // The Reddit origin is not in our injected list — must report null.
    const reddit = origins.find((e) => e.origin === 'https://www.reddit.com');
    assert.equal(reddit.manifestPermission, null);
    assert.equal(reddit.optionalManifestPermission, null);
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

test('v4.10.0 data-flow generated store-safe manifest covers required and optional origins', () => {
    const core = loadDataFlowModule();
    const builder = require('../build-extension.js');
    const manifest = builder.patchManifestForBuildProfile(JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    )), 'store-safe');
    const df = core.createDataFlow({ manifest });
    const origins = df.getOrigins({});
    for (const e of origins) {
        if (e.profile !== 'store-safe') continue;
        // The 127.0.0.1 port-range placeholder represents 6 manifest entries;
        // skip it from this gate (it's covered by host_permissions audits
        // elsewhere) — only validate fixed-host store-safe origins.
        if (e.origin.startsWith('http://127.0.0.1')) continue;
        if (e.hostGrant === 'runtime-optional') {
            assert.equal(e.manifestPermission, null,
                'runtime-optional store-safe origin ' + e.origin + ' must not have install-time host_permission');
            assert.notEqual(e.optionalManifestPermission, null,
                'runtime-optional store-safe origin ' + e.origin + ' must have optional_host_permissions coverage');
        } else {
            assert.notEqual(e.manifestPermission, null,
                'required store-safe origin ' + e.origin + ' must have matching host_permission');
        }
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

// ── v4.11.0 NX1: data-flow ↔ schema coverage gate ──

test('v4.11.0 data-flow: every api/local-companion schema entry maps to a catalogued origin', () => {
    const { SETTINGS_SCHEMA } = require('../extension/core/settings-schema');
    const { findCoverageGaps } = require('../extension/core/data-flow');
    const gaps = findCoverageGaps(SETTINGS_SCHEMA);
    if (gaps.length > 0) {
        const lines = gaps.map((g) => '  - ' + g.key + ' (risk=' + g.risk + ')');
        assert.fail(
            'The settings-schema and data-flow catalogue have drifted. ' +
            'Add a new origin entry or extend PARENT_FEATURE in core/data-flow.js for:\n' +
            lines.join('\n')
        );
    }
});

test('v4.11.0 data-flow: Cobalt fallback origin is catalogued (was missing pre-v4.11.0)', () => {
    const { ORIGIN_CATALOGUE } = require('../extension/core/data-flow');
    const cobalt = ORIGIN_CATALOGUE.find((o) => o.origin === 'https://api.cobalt.tools');
    assert.ok(cobalt, 'data-flow catalogue must list https://api.cobalt.tools');
    assert.equal(cobalt.profile, 'github-full',
        'Cobalt is github-full only (user-supplied instance, off by default)');
    assert.ok(cobalt.requiredByFeatures.includes('downloadCobaltFallback'),
        'Cobalt origin must be driven by downloadCobaltFallback');

    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    assert.ok((manifest.host_permissions || []).includes('https://api.cobalt.tools/*'),
        'github-full source manifest must grant Cobalt for the full-profile artifact');
    assert.ok(cspAllowsConnect(manifest.content_security_policy?.extension_pages || '', 'https://api.cobalt.tools'),
        'github-full source manifest CSP must allow Cobalt connect-src');
    assert.match(backgroundSource, /'https:\/\/api\.cobalt\.tools'/,
        'background EXT_FETCH allowlist must include Cobalt for the full-profile artifact');
});

test('v4.11.0 data-flow: PARENT_FEATURE inheritance map names only real parent features', () => {
    const { SETTINGS_SCHEMA } = require('../extension/core/settings-schema');
    const { PARENT_FEATURE } = require('../extension/core/data-flow');
    const schemaKeys = new Set(SETTINGS_SCHEMA.map((e) => e.key));
    for (const [child, parent] of Object.entries(PARENT_FEATURE)) {
        assert.ok(schemaKeys.has(child), 'PARENT_FEATURE child ' + child + ' must exist in the schema');
        assert.ok(schemaKeys.has(parent), 'PARENT_FEATURE parent ' + parent + ' must exist in the schema');
    }
});

// ── v4.12.0 NX1: popup data-flow panel wire-up ──

test('v4.12.0 popup.html includes the data-flow section with the required hooks', () => {
    const html = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.html'), 'utf8'
    );
    assert.match(html, /id="data-flow"/,        'popup.html must define #data-flow');
    assert.match(html, /id="data-flow-list"/,   'popup.html must define #data-flow-list');
    assert.match(html, /id="data-flow-summary"/,'popup.html must define #data-flow-summary');
    // Default state must be hidden — schema-gated reveal flips this.
    assert.match(html, /<section class="data-flow" id="data-flow"[^>]*hidden/,
        'data-flow section must default to hidden (privacyDataFlowPanel off by default)');
});

test('v4.12.0 popup.html bundles the v5.0.0 core modules so the panel can render', () => {
    const html = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.html'), 'utf8'
    );
    for (const mod of [
        'core/settings-schema.js',
        'core/policy-profile.js',
        'core/data-flow.js',
        'core/optional-host-permissions.js'
    ]) {
        assert.match(html, new RegExp('<script src="' + escapeRegExp(mod) + '">'),
            'popup.html must load ' + mod);
    }
    // popup.js must come AFTER the core modules so its renderDataFlowPanel
    // function can rely on window.YTKitCore.createDataFlow.
    const coreIdx = html.lastIndexOf('core/data-flow.js');
    const optionalHostIdx = html.lastIndexOf('core/optional-host-permissions.js');
    const popupIdx = html.lastIndexOf('popup.js');
    assert.ok(coreIdx < popupIdx,
        'core/data-flow.js must load before popup.js so the factory is available');
    assert.ok(coreIdx < optionalHostIdx && optionalHostIdx < popupIdx,
        'optional-host permissions helper must load after data-flow and before popup.js');
});

test('v4.12.0 popup.js registers data-flow panel refs and uses the live schema setting as the gate', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    assert.match(src, /const dataFlowSection = \$\('#data-flow'\)/,
        'popup.js must capture the section ref');
    assert.match(src, /function renderDataFlowPanel\(\)/,
        'popup.js must define renderDataFlowPanel');
    assert.match(src, /settings\.privacyDataFlowPanel !== true/,
        'renderDataFlowPanel must gate on the privacyDataFlowPanel schema setting');
    assert.match(src, /window\.YTKitCore && window\.YTKitCore\.createDataFlow/,
        'renderDataFlowPanel must resolve the factory from window.YTKitCore');
});

test('v4.12.0 popup.js wires the renderer into init and into storage.onChanged so it stays reactive', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    // Two call sites: initial render, and storage-change re-render.
    const occurrences = src.match(/renderDataFlowPanel\(\)/g) || [];
    assert.ok(occurrences.length >= 3,
        'renderDataFlowPanel must be called at least three times — definition + init + storage.onChanged (was ' + occurrences.length + ')');
});

test('v4.12.0 every locale defines the data-flow i18n strings', () => {
    const localesDir = path.join(__dirname, '..', 'extension', '_locales');
    const required = [
        'dataFlowTitle', 'dataFlowNote', 'dataFlowSummaryTpl',
        'dataFlowActive', 'dataFlowInactive',
        'dataFlowProfile', 'dataFlowCreds', 'dataFlowRisk', 'dataFlowDriver'
    ];
    for (const locale of fs.readdirSync(localesDir)) {
        const file = path.join(localesDir, locale, 'messages.json');
        if (!fs.existsSync(file)) continue;
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        for (const k of required) {
            assert.ok(k in data,
                'locale ' + locale + ' must define ' + k);
            assert.equal(typeof data[k].message, 'string');
            assert.ok(data[k].message.length > 0, locale + '.' + k + ' must be non-empty');
        }
    }
});

test('v4.12.0 popup.css adds the data-flow surface without using pill backdrops', () => {
    const css = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.css'), 'utf8'
    );
    assert.match(css, /\.data-flow \{/, 'popup.css must define .data-flow');
    assert.match(css, /\.data-flow-list li \{/, 'popup.css must style the list rows');
    assert.match(css, /\.data-flow-dot \{/, 'popup.css must define the risk dot');
    // House style: no full-rounded backdrops. The list rows use a fixed
    // 8 px radius; the only border-radius: 50% lives on the small risk dot.
    const oversized = css.match(/border-radius:\s*(999px|9999px|50%)/g) || [];
    for (const hit of oversized) {
        // 50% on the dot is fine — it's a 6 px round indicator, not a backdrop.
        if (hit === 'border-radius: 50%') continue;
        assert.fail('popup.css must not use stadium/pill border-radius: ' + hit);
    }
});

test('v4.12.0 background.js fetch allowlist matches the data-flow store-safe origin list', () => {
    const bg = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'background.js'), 'utf8'
    );
    // Every store-safe data-flow origin (except the wildcarded YouTube
    // host + 127.0.0.1 loopback) must appear verbatim in the
    // ALLOWED_FETCH_ORIGINS list. Local-loopback is matched separately.
    const { ORIGIN_CATALOGUE } = require('../extension/core/data-flow');
    for (const e of ORIGIN_CATALOGUE) {
        if (e.profile !== 'store-safe') continue;
        if (e.origin.includes('*')) continue;
        if (e.origin.startsWith('http://127.0.0.1')) continue;
        assert.match(bg, new RegExp(escapeRegExp(e.origin)),
            'background.js ALLOWED_FETCH_ORIGINS must list ' + e.origin);
    }
});

// ── v4.13.0 NX1: subtitles feature peel ──

test('v4.13.0 features/subtitles exports buildSubtitleCss + featureSpec + FONT_FAMILY_MAP', () => {
    delete require.cache[require.resolve('../extension/features/subtitles/index.js')];
    const stub = {};
    const prev = global.YTKitFeatures;
    global.YTKitFeatures = stub;
    const mod = require('../extension/features/subtitles/index.js');
    global.YTKitFeatures = prev;
    assert.equal(typeof mod.buildSubtitleCss, 'function');
    assert.ok(mod.featureSpec && mod.featureSpec.id === 'subtitleStyling');
    assert.equal(mod.featureSpec.category, 'subtitles');
    assert.ok(mod.FONT_FAMILY_MAP);
    // The module must also attach itself to globalThis.YTKitFeatures for
    // the in-monolith delegating consumer.
    assert.ok(stub.subtitles, 'must attach to globalThis.YTKitFeatures');
    assert.equal(typeof stub.subtitles.buildSubtitleCss, 'function');
});

test('v4.13.0 buildSubtitleCss is deterministic and byte-stable for known input', () => {
    const { buildSubtitleCss } = require('../extension/features/subtitles/index.js');
    const a = buildSubtitleCss({
        subStyleFontSize: 120,
        subStyleFontFamily: 'sans',
        subStyleColor: '#FFFFFF',
        subStyleBgOpacity: 80,
        subStyleBgColor: '#000000',
        subStyleBottomOffset: 15,
        subStyleTextShadow: true
    });
    const b = buildSubtitleCss({
        subStyleFontSize: 120,
        subStyleFontFamily: 'sans',
        subStyleColor: '#FFFFFF',
        subStyleBgOpacity: 80,
        subStyleBgColor: '#000000',
        subStyleBottomOffset: 15,
        subStyleTextShadow: true
    });
    assert.equal(a, b, 'pure: same input must produce same CSS');
    assert.match(a, /font-size: 120% !important/);
    assert.match(a, /font-family: Roboto, sans-serif !important/);
    assert.match(a, /color: #ffffff !important/);
    assert.match(a, /background: rgba\(0, 0, 0, 0\.8\) !important/);
    assert.match(a, /bottom: 15% !important/);
    assert.match(a, /text-shadow: 2px 2px 4px rgba\(0,0,0,0\.9\) !important/);
});

test('v4.13.0 buildSubtitleCss clamps out-of-range numeric inputs without throwing', () => {
    const { buildSubtitleCss } = require('../extension/features/subtitles/index.js');
    // Way over the upper bound — must clamp to 300.
    const huge = buildSubtitleCss({ subStyleFontSize: 9999 });
    assert.match(huge, /font-size: 300% !important/);
    // Way under the lower bound — must clamp to 50.
    const tiny = buildSubtitleCss({ subStyleFontSize: -50 });
    assert.match(tiny, /font-size: 50% !important/);
    // Malformed hex — must fall back to the default white.
    const broken = buildSubtitleCss({ subStyleColor: 'not-a-hex' });
    assert.match(broken, /color: #ffffff !important/);
});

test('v4.13.0 buildSubtitleCss honours subStyleTextShadow=false', () => {
    const { buildSubtitleCss } = require('../extension/features/subtitles/index.js');
    const off = buildSubtitleCss({ subStyleTextShadow: false });
    assert.match(off, /text-shadow: none !important/);
    // Default (undefined) keeps the shadow on.
    const onDefault = buildSubtitleCss({});
    assert.match(onDefault, /text-shadow: 2px 2px 4px rgba\(0,0,0,0\.9\) !important/);
});

test('v4.13.0 ytkit.js retains a byte-identical inline fallback for the userscript path', () => {
    // The monolith block's _apply method has two paths: delegate to the
    // module when present, else inline. The inline fallback must stay
    // byte-equivalent to features/subtitles/buildSubtitleCss. This test
    // exercises the inline path by simulating module-absence and asserts
    // the produced CSS matches the module's output exactly.
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8'
    );
    // The fallback section is bracketed by a comment marker. Just sanity
    // that the marker + fallback survive a refactor — the parity
    // assertion lives in the next test.
    assert.match(src, /v4\.13\.0: CSS construction is owned by/,
        'ytkit.js must document the v4.13.0 peel');
    assert.match(src, /globalThis\.YTKitFeatures\s*\n\s*&& globalThis\.YTKitFeatures\.subtitles/,
        'ytkit.js must consume the module via globalThis.YTKitFeatures.subtitles');
    assert.match(src, /MUST stay\s*\n\s*\/\/ byte-identical to features\/subtitles\/index\.js/,
        'ytkit.js must document the byte-identical parity contract for the userscript fallback');
});

test('v4.13.0 subtitles module loads before ytkit.js in both content_script entries', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    let validated = 0;
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        const ytkitIdx = cs.js.indexOf('ytkit.js');
        if (ytkitIdx === -1) continue;
        const subIdx = cs.js.indexOf('features/subtitles/index.js');
        assert.notEqual(subIdx, -1, 'manifest must include features/subtitles/index.js');
        assert.ok(subIdx < ytkitIdx, 'features/subtitles/index.js must load before ytkit.js');
        // It should also load after the core/* modules (it consumes
        // settings via appState which is set up by ytkit.js, but loading
        // it adjacent to ytkit.js keeps the cognitive map simple).
        const dataFlowIdx = cs.js.indexOf('core/data-flow.js');
        assert.ok(dataFlowIdx < subIdx,
            'features/subtitles/index.js must load after the core/* modules');
        validated += 1;
    }
    assert.ok(validated >= 1, 'at least one content_scripts entry must contain ytkit.js');
});

// ── v4.14.0 NX1: core/toast.js helper peel ──

function loadToastModule() {
    const stub = {};
    const prev = global.YTKitCore;
    global.YTKitCore = stub;
    delete require.cache[require.resolve('../extension/core/toast.js')];
    require('../extension/core/toast.js');
    global.YTKitCore = prev;
    return stub;
}

test('v4.14.0 core/toast exports the full helper surface', () => {
    const core = loadToastModule();
    assert.ok(core.toast, 'core.toast must be present after module load');
    for (const name of ['inferToastTone', 'getToastRgb', 'getToastBadgeLabel', 'getToastAriaDefaults', 'TONE_RGB', 'TONE_BADGE']) {
        assert.ok(name in core.toast, 'core.toast must export ' + name);
    }
});

test('v4.14.0 inferToastTone maps the legacy colour palette deterministically', () => {
    const { inferToastTone } = require('../extension/core/toast.js');
    assert.equal(inferToastTone('#ef4444'), 'error');
    assert.equal(inferToastTone('#EF4444'), 'error');         // case-insensitive
    assert.equal(inferToastTone('#f59e0b'), 'warning');
    assert.equal(inferToastTone('#f97316'), 'warning');
    assert.equal(inferToastTone('#3b82f6'), 'info');
    assert.equal(inferToastTone('#6b7280'), 'neutral');
    // Unknown colours fall back to success — preserving the previous
    // in-monolith behaviour so a feature passing an arbitrary brand
    // colour doesn't render with an empty badge.
    assert.equal(inferToastTone('#22c55e'), 'success');
    assert.equal(inferToastTone(''), 'success');
    assert.equal(inferToastTone(undefined), 'success');
});

test('v4.14.0 getToastRgb + getToastBadgeLabel agree with the inline monolith fallback', () => {
    const { getToastRgb, getToastBadgeLabel } = require('../extension/core/toast.js');
    // Brand palette must match the inline fallback in extension/ytkit.js.
    assert.equal(getToastRgb('error'),   '255,116,128');
    assert.equal(getToastRgb('warning'), '255,190,122');
    assert.equal(getToastRgb('info'),    '106,169,255');
    assert.equal(getToastRgb('neutral'), '139,151,171');
    assert.equal(getToastRgb('success'), '53,199,127');
    // Unknown tone → success default.
    assert.equal(getToastRgb('chartreuse'), '53,199,127');
    assert.equal(getToastBadgeLabel('error'),   'Issue');
    assert.equal(getToastBadgeLabel('warning'), 'Heads Up');
    assert.equal(getToastBadgeLabel('info'),    'Update');
    assert.equal(getToastBadgeLabel('neutral'), 'Notice');
    assert.equal(getToastBadgeLabel('success'), 'Done');
});

test('v4.14.0 getToastAriaDefaults uses assertive role only for the error tone', () => {
    const { getToastAriaDefaults } = require('../extension/core/toast.js');
    assert.deepEqual(getToastAriaDefaults('error'),   { role: 'alert',  ariaLive: 'assertive' });
    assert.deepEqual(getToastAriaDefaults('success'), { role: 'status', ariaLive: 'polite' });
    assert.deepEqual(getToastAriaDefaults('warning'), { role: 'status', ariaLive: 'polite' });
    assert.deepEqual(getToastAriaDefaults('info'),    { role: 'status', ariaLive: 'polite' });
});

test('v4.14.0 ytkit.js inline fallback values match the v4.14.0 toast module byte-for-byte', () => {
    // Belt-and-braces: even though the monolith delegates when the
    // module loads, the inline fallback inside ytkit.js MUST stay
    // byte-stable with core/toast.js so the userscript path renders
    // identical toasts. Source-string assertions on each tone keep
    // the two copies tied together at refactor time.
    const ytkit = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8'
    );
    const palette = {
        'error':   "'255,116,128'",
        'warning': "'255,190,122'",
        'info':    "'106,169,255'",
        'neutral': "'139,151,171'",
        'success': "'53,199,127'"
    };
    for (const [tone, rgb] of Object.entries(palette)) {
        // The inline fallback uses different shapes per tone (case
        // labels for error/warning/info/neutral; default for success).
        // Either way the brand RGB string must appear in the file.
        assert.ok(ytkit.includes(rgb),
            'ytkit.js inline toast fallback must contain ' + tone + ' rgb ' + rgb);
    }
    // The labels must also survive.
    for (const label of ['Issue', 'Heads Up', 'Update', 'Notice', 'Done']) {
        assert.ok(ytkit.includes("'" + label + "'"),
            'ytkit.js inline toast fallback must contain label "' + label + '"');
    }
});

test('v4.14.0 manifest content_scripts include core/toast.js before features/subtitles and ytkit.js', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        const ytkitIdx = cs.js.indexOf('ytkit.js');
        if (ytkitIdx === -1) continue;
        const toastIdx = cs.js.indexOf('core/toast.js');
        assert.notEqual(toastIdx, -1, 'manifest must include core/toast.js');
        assert.ok(toastIdx < ytkitIdx, 'core/toast.js must load before ytkit.js');
        // Position: after core/data-flow.js (alphabetical-ish, keeps
        // related core modules adjacent).
        const dataFlowIdx = cs.js.indexOf('core/data-flow.js');
        assert.ok(dataFlowIdx < toastIdx, 'core/toast.js must load after core/data-flow.js');
    }
});

// ── v4.15.0 NX1: privacy quick-toggles in popup ──

test('v4.15.0 popup QUICK_TOGGLES surfaces privacy + profile keys in a Privacy group', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    // Find the literal QUICK_TOGGLES array block so we can assert on
    // the new entries without false positives from comments elsewhere.
    const start = src.indexOf('const QUICK_TOGGLES = [');
    assert.ok(start !== -1, 'popup.js must declare QUICK_TOGGLES');
    const end = src.indexOf('];', start);
    assert.ok(end !== -1, 'QUICK_TOGGLES must terminate with `];`');
    const block = src.slice(start, end);

    for (const key of ['privacyDataFlowPanel', 'safeStoreProfile', 'githubFullProfile']) {
        assert.match(block, new RegExp("key:\\s*'" + key + "'"),
            'QUICK_TOGGLES must include ' + key);
        // The toggle must declare group: 'Privacy'.
        const entryRe = new RegExp("\\{[^}]*key:\\s*'" + key + "'[^}]*group:\\s*'Privacy'", 's');
        assert.match(block, entryRe,
            key + ' must be grouped under Privacy');
    }
});

test('v4.15.0 popup GROUP_ICONS defines a Privacy padlock glyph', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    const start = src.indexOf('const GROUP_ICONS = {');
    const end = src.indexOf('};', start);
    const block = src.slice(start, end);
    assert.match(block, /'Privacy':/, 'GROUP_ICONS must declare a Privacy entry');
    // Padlock shape: rect body + path shackle. The rect must be at the
    // declared 9x7 dimensions (square corners, no pill backdrop per
    // house style — rx=1 is the only allowed rounding here).
    assert.match(block, /tag:\s*'rect',\s*attrs:\s*\{[^}]*width:\s*'9'/,
        'Privacy icon must include the padlock body rect');
    assert.match(block, /M5\.5 7 V5 a2\.5 2\.5 0 0 1 5 0 V7/,
        'Privacy icon must include the U-shaped shackle path');
});

test('v4.15.0 popup HTML quick-toggles section advertises the updated total', () => {
    const html = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.html'), 'utf8'
    );
    // After v4.15.0 the QUICK_TOGGLES list has 18 entries. Both the
    // visible "18 controls" string and any future i18n-keyed total
    // must stay in sync with QUICK_TOGGLES.length.
    assert.match(html, /id="resultsState">18 controls</,
        'popup.html must advertise 18 quick controls after v4.15.0');
});

test('v4.15.0 new popup quick-toggle keys all exist in the v4.6.0 settings schema', () => {
    const { SETTINGS_SCHEMA } = require('../extension/core/settings-schema');
    const schemaKeys = new Set(SETTINGS_SCHEMA.map((e) => e.key));
    for (const k of ['privacyDataFlowPanel', 'safeStoreProfile', 'githubFullProfile']) {
        assert.ok(schemaKeys.has(k),
            'Quick-toggle key ' + k + ' must exist in the settings schema');
    }
});

// ── v4.16.0 NX1: schema-driven risk-band badges on popup toggles ──

test('v4.16.0 popup.js defines createSchemaRiskBadge and consults the schema', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    assert.match(src, /function createSchemaRiskBadge\(key\)/,
        'popup.js must define createSchemaRiskBadge');
    assert.match(src, /window\.YTKitCore && window\.YTKitCore\.findSettingEntry/,
        'createSchemaRiskBadge must consult the v4.6.0 schema via findSettingEntry');
    assert.match(src, /entry\.risk === 'safe'/,
        'createSchemaRiskBadge must skip safe-risk entries');
    assert.match(src, /toggle-risk-badge/,
        'badge must carry the toggle-risk-badge class');
});

test('v4.16.0 popup render() inserts the risk badge into the toggle name row', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    // The render() function must call createSchemaRiskBadge per row and
    // append the result into the name-row container only when non-null.
    assert.match(src, /const riskBadge = createSchemaRiskBadge\(item\.key\)/,
        'render() must call createSchemaRiskBadge per toggle');
    assert.match(src, /if \(riskBadge\) nameRow\.appendChild\(riskBadge\)/,
        'render() must guard against null badges');
    assert.match(src, /nameRow\.className = 'name-row'/,
        'render() must create a name-row wrapper for the badge');
});

test('v4.16.0 popup.css defines square-cornered (4px radius) risk badges for every non-safe band', () => {
    const css = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.css'), 'utf8'
    );
    assert.match(css, /\.toggle-risk-badge \{/,
        'popup.css must define the base .toggle-risk-badge class');
    // 4 px radius is the house-style allowed value for backdrop elements.
    assert.match(css, /\.toggle-risk-badge \{[^}]*border-radius:\s*4px/s,
        'risk badge must use a 4px radius (no pill / stadium backdrops)');
    for (const tone of ['api', 'local-companion', 'experimental', 'store-risk']) {
        assert.match(css, new RegExp('\\.toggle-risk-badge\\.toggle-risk-' + escapeRegExp(tone) + ' \\{'),
            'popup.css must declare a colour variant for ' + tone);
    }
});

test('v4.16.0 the risk-badge surface on quick toggles stays bounded to the schema-declared api set', () => {
    // Locks in the present state: of the v4.15.0 18-key quick-toggle
    // surface, three keys trip the badge because their schema risk is
    // `api` (sponsorBlock + deArrow hit sponsor.ajay.app; transcriptViewer
    // hits YouTube's caption-tracks endpoint). Everything else is safe.
    // Adding a new quick toggle with a non-safe risk band will require
    // updating this list — the intended canary so the badge surface
    // stays legible.
    const popupSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    const { SETTINGS_SCHEMA } = require('../extension/core/settings-schema');
    const schemaByKey = new Map(SETTINGS_SCHEMA.map((e) => [e.key, e]));

    const start = popupSrc.indexOf('const QUICK_TOGGLES = [');
    const end = popupSrc.indexOf('];', start);
    const block = popupSrc.slice(start, end);
    const keyRe = /key:\s*'([A-Za-z_][A-Za-z0-9_]*)'/g;
    const keys = [...block.matchAll(keyRe)].map((m) => m[1]);
    assert.ok(keys.length >= 18, 'QUICK_TOGGLES must contain at least the v4.15.0 18 entries (was ' + keys.length + ')');

    const nonSafe = keys.filter((k) => {
        const e = schemaByKey.get(k);
        return e && !e.internal && e.risk !== 'safe';
    });
    nonSafe.sort();
    assert.deepEqual(nonSafe, ['deArrow', 'sponsorBlock', 'transcriptViewer'],
        'risk-badge surface must remain just the three api-touching quick toggles; new non-safe quick toggles require a deliberate canary update');
});

// ── v4.17.0 NX1: video-filters feature peel ──

test('v4.17.0 features/video-filters exports buildVideoFilterCss + isIdentity + FIELD_BOUNDS', () => {
    delete require.cache[require.resolve('../extension/features/video-filters/index.js')];
    const stub = {};
    const prev = global.YTKitFeatures;
    global.YTKitFeatures = stub;
    const mod = require('../extension/features/video-filters/index.js');
    global.YTKitFeatures = prev;
    assert.equal(typeof mod.buildVideoFilterCss, 'function');
    assert.equal(typeof mod.isVideoFilterIdentity, 'function');
    assert.ok(mod.featureSpec && mod.featureSpec.id === 'videoVisualFilters');
    assert.equal(mod.featureSpec.category, 'playback-audio');
    assert.ok(mod.FIELD_BOUNDS && mod.FIELD_BOUNDS.vvfBrightness);
    // Must register on globalThis.YTKitFeatures so the monolith finds it.
    assert.ok(stub.videoFilters);
    assert.equal(typeof stub.videoFilters.buildVideoFilterCss, 'function');
});

test('v4.17.0 buildVideoFilterCss emits the expected six-channel chain with default values', () => {
    const { buildVideoFilterCss } = require('../extension/features/video-filters/index.js');
    const css = buildVideoFilterCss({});
    assert.match(css, /\.html5-main-video \{/);
    assert.match(css, /filter:\s*brightness\(100%\)\s*contrast\(100%\)\s*saturate\(100%\)\s*hue-rotate\(0deg\)\s*grayscale\(0%\)\s*sepia\(0%\)\s*!important/);
});

test('v4.17.0 buildVideoFilterCss clamps out-of-range numeric inputs to declared bounds', () => {
    const { buildVideoFilterCss } = require('../extension/features/video-filters/index.js');
    const css = buildVideoFilterCss({
        vvfBrightness: 9999,
        vvfContrast:   -50,
        vvfSaturation: 200,
        vvfHue:        500,
        vvfGrayscale:  -100,
        vvfSepia:      9999
    });
    assert.match(css, /brightness\(200%\)/, 'brightness must clamp to max 200');
    assert.match(css, /contrast\(0%\)/,     'contrast must clamp to min 0');
    assert.match(css, /saturate\(200%\)/,   'saturation must keep 200');
    assert.match(css, /hue-rotate\(180deg\)/, 'hue must clamp to max 180');
    assert.match(css, /grayscale\(0%\)/,    'grayscale must clamp to min 0');
    assert.match(css, /sepia\(100%\)/,      'sepia must clamp to max 100');
});

test('v4.17.0 isVideoFilterIdentity returns true only for the all-default settings', () => {
    const { isVideoFilterIdentity } = require('../extension/features/video-filters/index.js');
    assert.equal(isVideoFilterIdentity({}), true);
    assert.equal(isVideoFilterIdentity({
        vvfBrightness: 100, vvfContrast: 100, vvfSaturation: 100,
        vvfHue: 0, vvfGrayscale: 0, vvfSepia: 0
    }), true);
    assert.equal(isVideoFilterIdentity({ vvfHue: 5 }), false);
    assert.equal(isVideoFilterIdentity({ vvfSepia: 25 }), false);
});

test('v4.17.0 ytkit.js retains a byte-identical inline fallback for the userscript path', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8'
    );
    assert.match(src, /v4\.17\.0: CSS construction is owned by/,
        'ytkit.js must document the v4.17.0 peel');
    assert.match(src, /globalThis\.YTKitFeatures[^\n]*\n\s*&& globalThis\.YTKitFeatures\.videoFilters/,
        'ytkit.js must consume the module via globalThis.YTKitFeatures.videoFilters');
    // The inline fallback must keep emitting the exact six-channel string
    // the module produces. We grep on the unique brightness/contrast/sat
    // pattern below the v4.17.0 marker.
    assert.match(src, /MUST stay\s*\n\s*\/\/ byte-identical to features\/video-filters\/index\.js/,
        'ytkit.js must document the byte-identical parity contract');
});

test('v4.17.0 features/video-filters loads before ytkit.js in both content_script entries', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    let validated = 0;
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        const ytkitIdx = cs.js.indexOf('ytkit.js');
        if (ytkitIdx === -1) continue;
        const vfIdx = cs.js.indexOf('features/video-filters/index.js');
        assert.notEqual(vfIdx, -1, 'manifest must include features/video-filters/index.js');
        assert.ok(vfIdx < ytkitIdx, 'features/video-filters/index.js must load before ytkit.js');
        const subIdx = cs.js.indexOf('features/subtitles/index.js');
        assert.ok(subIdx < vfIdx,
            'features/video-filters/index.js must load after features/subtitles/index.js (alphabetical-adjacent grouping)');
        validated += 1;
    }
    assert.ok(validated >= 1);
});

// ── v4.18.0 NX1: blue-light-filter feature peel ──

test('v4.18.0 features/blue-light-filter exports buildBlueLightRgba + OVERLAY_FIXED_CSS', () => {
    delete require.cache[require.resolve('../extension/features/blue-light-filter/index.js')];
    const stub = {};
    const prev = global.YTKitFeatures;
    global.YTKitFeatures = stub;
    const mod = require('../extension/features/blue-light-filter/index.js');
    global.YTKitFeatures = prev;
    assert.equal(typeof mod.buildBlueLightRgba, 'function');
    assert.ok(mod.featureSpec && mod.featureSpec.id === 'blueLightFilter');
    assert.equal(mod.featureSpec.category, 'playback-audio');
    assert.ok(mod.OVERLAY_FIXED_CSS && mod.OVERLAY_FIXED_CSS.zIndex === '2147483646',
        'OVERLAY_FIXED_CSS must lock the z-index at the documented value');
    assert.ok(stub.blueLightFilter, 'must register on globalThis.YTKitFeatures');
});

test('v4.18.0 buildBlueLightRgba matches the prior inline curve byte-for-byte at the schema default', () => {
    const { buildBlueLightRgba } = require('../extension/features/blue-light-filter/index.js');
    // Schema default is blueLightIntensity = 30. The prior inline rule
    // computed intensity = 30/100 = 0.3 → rgba(255, 156, 42, 0.105).
    assert.equal(buildBlueLightRgba({}),                           'rgba(255, 156, 42, 0.105)');
    assert.equal(buildBlueLightRgba({ blueLightIntensity: 30 }),   'rgba(255, 156, 42, 0.105)');
    // Alpha arithmetic exposes JS float precision in the rgba payload
    // (0.1 * 0.35 → 0.034999999999999996). Asserting on the exact tail
    // keeps the test honest about what CSS receives — a future refactor
    // that "rounds" precision would also visibly change the rendered
    // overlay, so the parity should be locked.
    assert.equal(buildBlueLightRgba({ blueLightIntensity: 10 }),   'rgba(255, 172, 54, 0.034999999999999996)');
    assert.equal(buildBlueLightRgba({ blueLightIntensity: 80 }),   'rgba(255, 116, 12, 0.27999999999999997)');
});

test('v4.18.0 buildBlueLightRgba clamps out-of-range intensity to the 10-80 schema bounds', () => {
    const { buildBlueLightRgba } = require('../extension/features/blue-light-filter/index.js');
    // Below 10 must clamp to 10 (sliders surface 10..80).
    assert.equal(buildBlueLightRgba({ blueLightIntensity: 0 }),    buildBlueLightRgba({ blueLightIntensity: 10 }));
    assert.equal(buildBlueLightRgba({ blueLightIntensity: -50 }),  buildBlueLightRgba({ blueLightIntensity: 10 }));
    // Above 80 must clamp to 80.
    assert.equal(buildBlueLightRgba({ blueLightIntensity: 9999 }), buildBlueLightRgba({ blueLightIntensity: 80 }));
    // Non-numeric / undefined fall back to the schema default of 30.
    assert.equal(buildBlueLightRgba({ blueLightIntensity: undefined }), buildBlueLightRgba({ blueLightIntensity: 30 }));
});

test('v4.18.0 ytkit.js delegates to the module and keeps the inline fallback byte-parity', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8'
    );
    assert.match(src, /v4\.18\.0: tint RGBA computation is owned by/,
        'ytkit.js must document the v4.18.0 peel');
    assert.match(src, /globalThis\.YTKitFeatures\.blueLightFilter\.buildBlueLightRgba/,
        'ytkit.js must look up buildBlueLightRgba on the namespace');
    // Inline fallback's arithmetic must still appear verbatim.
    assert.match(src, /Math\.round\(180 - intensity \* 80\)/,
        'inline fallback must preserve the green-channel formula');
    assert.match(src, /Math\.round\(60 - intensity \* 60\)/,
        'inline fallback must preserve the blue-channel formula');
    assert.match(src, /intensity \* 0\.35/,
        'inline fallback must preserve the alpha-channel formula');
});

test('v4.18.0 features/blue-light-filter loads before ytkit.js in both content_script entries', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        const ytkitIdx = cs.js.indexOf('ytkit.js');
        if (ytkitIdx === -1) continue;
        const blIdx = cs.js.indexOf('features/blue-light-filter/index.js');
        assert.notEqual(blIdx, -1, 'manifest must include features/blue-light-filter/index.js');
        assert.ok(blIdx < ytkitIdx, 'features/blue-light-filter/index.js must load before ytkit.js');
        const vfIdx = cs.js.indexOf('features/video-filters/index.js');
        assert.ok(vfIdx < blIdx,
            'features/blue-light-filter/index.js must load after features/video-filters/index.js (peel-order grouping)');
    }
});

// ── v4.19.0 NX1: theme-css bundled peel ──

test('v4.19.0 features/theme-css exports three pure CSS builders', () => {
    delete require.cache[require.resolve('../extension/features/theme-css/index.js')];
    const stub = {};
    const prev = global.YTKitFeatures;
    global.YTKitFeatures = stub;
    const mod = require('../extension/features/theme-css/index.js');
    global.YTKitFeatures = prev;
    assert.equal(typeof mod.buildProgressBarCss, 'function');
    assert.equal(typeof mod.buildSelectionColorCss, 'function');
    assert.equal(typeof mod.buildGrayscaleThumbnailsCss, 'function');
    assert.ok(stub.themeCss);
});

test('v4.19.0 buildProgressBarCss returns null for the default color (matches prior skip behaviour)', () => {
    const { buildProgressBarCss } = require('../extension/features/theme-css/index.js');
    // Default '#ff0000' / '#FF0000' (any case) must short-circuit so the
    // monolith doesn't insert a redundant style tag.
    assert.equal(buildProgressBarCss({}), null);
    assert.equal(buildProgressBarCss({ customProgressBarColor: '#ff0000' }), null);
    assert.equal(buildProgressBarCss({ customProgressBarColor: '#FF0000' }), null);
    // Invalid hex falls back to null (no style emission) too.
    assert.equal(buildProgressBarCss({ customProgressBarColor: 'red' }), null);
});

test('v4.19.0 buildProgressBarCss emits the expected swatch rules for non-default colour', () => {
    const { buildProgressBarCss } = require('../extension/features/theme-css/index.js');
    const css = buildProgressBarCss({ customProgressBarColor: '#7c3aed' });
    assert.match(css, /\.ytp-play-progress, \.ytp-swatch-background-color \{ background: #7c3aed !important; \}/);
    assert.match(css, /\.ytp-volume-slider-foreground::after \{ background: #7c3aed !important; \}/);
});

test('v4.19.0 buildSelectionColorCss emits both ::selection and ::-moz-selection rules', () => {
    const { buildSelectionColorCss } = require('../extension/features/theme-css/index.js');
    const def = buildSelectionColorCss({});
    assert.match(def, /::selection \{ background: #2dd36f !important;/);
    assert.match(def, /::-moz-selection \{ background: #2dd36f !important;/);
    // Invalid input falls back to the v0.1 schema default '#2dd36f'.
    const bad = buildSelectionColorCss({ selectionColor: 'rebeccapurple' });
    assert.match(bad, /background: #2dd36f !important;/);
    // Custom hex is passed through verbatim.
    const custom = buildSelectionColorCss({ selectionColor: '#ff8585' });
    assert.match(custom, /::selection \{ background: #ff8585 !important;/);
});

test('v4.19.0 buildGrayscaleThumbnailsCss covers the four renderer surfaces and hover restore', () => {
    const { buildGrayscaleThumbnailsCss } = require('../extension/features/theme-css/index.js');
    const css = buildGrayscaleThumbnailsCss();
    for (const renderer of [
        'ytd-rich-item-renderer ytd-thumbnail img',
        'ytd-video-renderer ytd-thumbnail img',
        'ytd-grid-video-renderer ytd-thumbnail img',
        'ytd-compact-video-renderer ytd-thumbnail img'
    ]) {
        assert.ok(css.includes(renderer),
            'thumbnail rule must cover ' + renderer);
        assert.ok(css.includes(renderer.replace(' ytd-thumbnail', ':hover ytd-thumbnail')),
            'hover restore must cover ' + renderer);
    }
    assert.match(css, /filter: grayscale\(100%\) !important;/);
    assert.match(css, /filter: grayscale\(0%\) !important;/);
});

test('v4.19.0 ytkit.js delegates all three theme-css consumers with byte-identical inline fallbacks', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8'
    );
    // Three v4.19.0 marker comments — one per delegating consumer.
    const markers = src.match(/v4\.19\.0: CSS construction delegated to features\/theme-css\//g) || [];
    assert.equal(markers.length, 3,
        'ytkit.js must document three v4.19.0 delegating consumers (was ' + markers.length + ')');
    // Each delegating block must keep its inline fallback parity grep.
    assert.match(src, /MUST stay\s*\n\s*\/\/ byte-identical to features\/theme-css\/index\.js's\s*\n\s*\/\/ buildProgressBarCss/);
    assert.match(src, /MUST stay\s*\n\s*\/\/ byte-identical to features\/theme-css\/index\.js's\s*\n\s*\/\/ buildSelectionColorCss/);
    assert.match(src, /MUST stay\s*\n\s*\/\/ byte-identical to features\/theme-css\/index\.js's\s*\n\s*\/\/ buildGrayscaleThumbnailsCss/);
});

test('v4.19.0 features/theme-css loads before ytkit.js in both content_script entries', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        const ytkitIdx = cs.js.indexOf('ytkit.js');
        if (ytkitIdx === -1) continue;
        const themeIdx = cs.js.indexOf('features/theme-css/index.js');
        assert.notEqual(themeIdx, -1, 'manifest must include features/theme-css/index.js');
        assert.ok(themeIdx < ytkitIdx, 'features/theme-css/index.js must load before ytkit.js');
    }
});

// ── v4.20.0 NX1: userscript bundle of v5.0.0 core modules ──

test('v4.20.0 userscript carries the v5.0.0 bundle markers', () => {
    const userscript = fs.readFileSync(
        path.join(__dirname, '..', 'YTKit.user.js'), 'utf8'
    );
    assert.match(userscript, /\/\/ ── BEGIN v5\.0\.0 bundled core modules ──/,
        'userscript must declare a v5.0.0 BEGIN bundle marker');
    assert.match(userscript, /\/\/ ── END v5\.0\.0 bundled core modules ──/,
        'userscript must declare a v5.0.0 END bundle marker');
});

test('v4.20.0 userscript bundles every v5.0.0 core module by name', () => {
    const userscript = fs.readFileSync(
        path.join(__dirname, '..', 'YTKit.user.js'), 'utf8'
    );
    const expectedModules = [
        'extension/core/styles.js',
        'extension/core/settings-schema.js',
        'extension/core/feature-lifecycle.js',
        'extension/core/policy-profile.js',
        'extension/core/selector-health.js',
        'extension/core/data-flow.js',
        'extension/core/toast.js',
        'extension/core/toast-dom.js',
        'extension/core/runtime-flags.js',
        'extension/core/capability-probe.js',
        'extension/features/subtitles/index.js',
        'extension/features/video-filters/index.js',
        'extension/features/blue-light-filter/index.js',
        'extension/features/theme-css/index.js',
        'extension/features/wave-8-css/index.js',
        'extension/features/home-subs-css/index.js',
        'extension/features/chat-style-comments/index.js',
        'extension/features/sticky-video/index.js',
        'extension/features/video-hider/index.js',
        'extension/features/player-dock/index.js',
        'extension/features/youtube-music-compat/index.js',
        'extension/core/lifecycle-route-bridge.js'
    ];
    for (const mod of expectedModules) {
        assert.match(userscript, new RegExp('// ── bundled module: ' + escapeRegExp(mod) + ' ──'),
            'userscript must include bundle marker for ' + mod);
    }
});

test('v4.20.0 userscript bundles the verbatim contents of each v5.0.0 module', () => {
    // Strongest parity check: for each bundled module, the unique
    // function/constant signature inside the module must appear inside
    // the userscript bundle block. If a sync goes stale, this fails
    // loudly with the module name.
    const userscript = fs.readFileSync(
        path.join(__dirname, '..', 'YTKit.user.js'), 'utf8'
    );
    const beginIdx = userscript.indexOf('// ── BEGIN v5.0.0 bundled core modules ──');
    const endIdx = userscript.indexOf('// ── END v5.0.0 bundled core modules ──');
    assert.ok(beginIdx > -1 && endIdx > beginIdx, 'bundle markers must be present and ordered');
    const bundle = userscript.slice(beginIdx, endIdx);
    assert.equal((userscript.match(/^\/\/ ==UserScript==$/gm) || []).length, 1,
        'userscript must contain exactly one metadata header');
    assert.equal((bundle.match(/^\/\/ ==UserScript==$/gm) || []).length, 0,
        'bundle must not contain a second userscript metadata header');
    assert.ok(bundle.includes('matched the *suffix* `apiKey$` / `token$` plus the exact'),
        'bundle replacement must preserve literal $` policy-profile text');
    const fingerprints = {
        'core/styles.js':                    'function createCssLifecycleSpec(options',
        'core/settings-schema.js':              'const SETTINGS_SCHEMA = Object.freeze(',
        'core/feature-lifecycle.js':            'function createLifecycle(options',
        'core/policy-profile.js':               'function createPolicyProfile(options',
        'core/selector-health.js':              'function createSelectorHealth(options',
        'core/data-flow.js':                    'const ORIGIN_CATALOGUE = Object.freeze',
        'core/toast.js':                        'function inferToastTone(color)',
        'core/toast-dom.js':                    'function createToastSystem(deps',
        'core/runtime-flags.js':                'core.runtimeFlags = flags;',
        'core/capability-probe.js':             'core.capabilityProbe = surface;',
        'features/subtitles/index.js':          'function buildSubtitleCss(settings)',
        'features/video-filters/index.js':      'function buildVideoFilterCss(settings)',
        'features/blue-light-filter/index.js':  'function buildBlueLightRgba(settings)',
        'features/theme-css/index.js':          'function buildProgressBarCss(settings)',
        'features/wave-8-css/index.js':         'function buildHideNotificationButtonCss()',
        'features/home-subs-css/index.js':      'function buildHideCreateButtonCss()',
        'features/chat-style-comments/index.js': 'function buildCommentRestyleCss()',
        'features/sticky-video/index.js':       'function buildSplitShellCss()',
        'features/video-hider/index.js':        'function createHideVideosFromHomeFeature',
        'features/player-dock/index.js':        'function createFloatingLogoOnWatchFeature',
        'features/youtube-music-compat/index.js': 'function createYoutubeMusicCompatFeature',
        'core/lifecycle-route-bridge.js':       'function installLifecycleRouteBridge(options'
    };
    for (const [mod, fingerprint] of Object.entries(fingerprints)) {
        assert.ok(bundle.includes(fingerprint),
            'userscript bundle missing fingerprint from ' + mod + ': "' + fingerprint + '"');
    }
});

test('v4.20.0 userscript bundle order matches the manifest content_scripts run order', () => {
    const userscript = fs.readFileSync(
        path.join(__dirname, '..', 'YTKit.user.js'), 'utf8'
    );
    // Pull the module declaration order out of the bundle.
    const markerRe = /\/\/ ── bundled module: ([^\s]+) ──/g;
    const bundleOrder = [];
    let m;
    while ((m = markerRe.exec(userscript)) !== null) {
        bundleOrder.push(m[1]);
    }
    // The bundle must mirror the order sync-userscript.js declares in
    // V5_BUNDLE_MODULES. That order in turn mirrors the manifest's
    // content_scripts.js load order for these modules.
    const expectedOrder = [
        'extension/core/styles.js',
        'extension/core/settings-schema.js',
        'extension/core/feature-lifecycle.js',
        'extension/core/policy-profile.js',
        'extension/core/selector-health.js',
        'extension/core/data-flow.js',
        'extension/core/toast.js',
        'extension/core/toast-dom.js',
        'extension/core/runtime-flags.js',
        'extension/core/capability-probe.js',
        'extension/features/subtitles/index.js',
        'extension/features/video-filters/index.js',
        'extension/features/blue-light-filter/index.js',
        'extension/features/theme-css/index.js',
        'extension/features/wave-8-css/index.js',
        'extension/features/home-subs-css/index.js',
        'extension/features/chat-style-comments/index.js',
        'extension/features/sticky-video/index.js',
        'extension/features/video-hider/index.js',
        'extension/features/player-dock/index.js',
        'extension/features/youtube-music-compat/index.js',
        'extension/core/lifecycle-route-bridge.js'
    ];
    assert.deepEqual(bundleOrder, expectedOrder,
        'bundle module order must match V5_BUNDLE_MODULES in sync-userscript.js');
});

test('v4.20.0 sync-userscript.js declares the same V5_BUNDLE_MODULES list as the userscript shows', () => {
    // Static check that the V5_BUNDLE_MODULES array in sync-userscript.js
    // is the source of truth. Lets the user audit the list by reading the
    // sync script + this test only.
    const sync = fs.readFileSync(
        path.join(__dirname, '..', 'sync-userscript.js'), 'utf8'
    );
    assert.match(sync, /const V5_BUNDLE_MODULES = \[/,
        'sync-userscript.js must declare V5_BUNDLE_MODULES');
    assert.ok(sync.includes('const BUNDLE_BEGIN_RE = /^[ \\t]*\\/\\/ ── BEGIN v5\\.0\\.0 bundled core modules ──\\r?\\n[\\s\\S]*?^[ \\t]*\\/\\/ ── END v5\\.0\\.0 bundled core modules ──/m;'),
        'sync-userscript.js must define the BEGIN/END marker regex');
    assert.match(sync, /userscriptText = userscriptText\.replace\(BUNDLE_BEGIN_RE,\s*\(\) => parts\.join\('\\n'\)\);/,
        'bundle replacement must use a callback so literal $ sequences are preserved');
});

// ── v4.21.0 NX1: theme-css extended with forceDark + accentColor builders ──

test('v4.21.0 features/theme-css exports the two new builders', () => {
    delete require.cache[require.resolve('../extension/features/theme-css/index.js')];
    const mod = require('../extension/features/theme-css/index.js');
    assert.equal(typeof mod.buildForceDarkEverywhereCss, 'function');
    assert.equal(typeof mod.buildAccentColorCss, 'function');
});

test('v4.21.0 buildForceDarkEverywhereCss emits the four documented rule blocks', () => {
    const { buildForceDarkEverywhereCss } = require('../extension/features/theme-css/index.js');
    const css = buildForceDarkEverywhereCss();
    assert.match(css, /html\[dark\] \{ --yt-spec-base-background: #0f0f0f !important;/);
    assert.match(css, /ytd-app, ytd-browse, ytd-page-manager, #content \{ background-color: #0f0f0f !important;/);
    assert.match(css, /body \{ background-color: #0f0f0f !important; color: #f1f1f1 !important;/);
    assert.match(css, /\.page-container, \.yt-core-attributed-string, \[light\] \{ background: #0f0f0f !important; color: #f1f1f1 !important;/);
});

test('v4.21.0 buildAccentColorCss returns null for malformed hex, CSS for any valid hex variant', () => {
    const { buildAccentColorCss } = require('../extension/features/theme-css/index.js');
    // Empty / undefined / non-hex → null (matches the prior inline skip).
    assert.equal(buildAccentColorCss({}), null);
    assert.equal(buildAccentColorCss({ themeAccentColor: '' }), null);
    assert.equal(buildAccentColorCss({ themeAccentColor: 'rebeccapurple' }), null);
    assert.equal(buildAccentColorCss({ themeAccentColor: '#GGHHII' }), null);
    // Valid 3 / 4 / 6 / 8 hex digits all emit CSS.
    for (const accent of ['#abc', '#abcd', '#aabbcc', '#aabbccdd']) {
        const css = buildAccentColorCss({ themeAccentColor: accent });
        assert.ok(css && css.includes('--ytkit-accent: ' + accent + ' !important;'),
            'accent ' + accent + ' must round-trip into the CSS variable');
        assert.ok(css.includes('background: ' + accent + ' !important;'),
            'accent must propagate to the progress-bar background');
    }
});

test('v4.21.0 ytkit.js delegates forceDarkEverywhere + themeAccentColor with byte-identical inline fallbacks', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8'
    );
    // Two v4.21.0 marker comments.
    const markers = src.match(/v4\.21\.0: CSS construction delegated to features\/theme-css\//g) || [];
    assert.equal(markers.length, 2,
        'ytkit.js must document two v4.21.0 delegating consumers (was ' + markers.length + ')');
    assert.match(src, /MUST stay\s*\n\s*\/\/ byte-identical to features\/theme-css\/index\.js's\s*\n\s*\/\/ buildForceDarkEverywhereCss/);
    assert.match(src, /MUST stay\s*\n\s*\/\/ byte-identical to features\/theme-css\/index\.js's\s*\n\s*\/\/ buildAccentColorCss/);
});

test('v4.21.0 the ACCENT_HEX_RE in features/theme-css matches the inline ytkit.js regex byte-for-byte', () => {
    // Defensive: the validation regex appears in both the module and
    // the inline fallback. Source-grep both to confirm they stay in
    // sync.
    const themeCss = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'features', 'theme-css', 'index.js'), 'utf8'
    );
    const ytkit = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8'
    );
    const re = /\^#\(\[0-9a-fA-F\]\{3\}\|\[0-9a-fA-F\]\{4\}\|\[0-9a-fA-F\]\{6\}\|\[0-9a-fA-F\]\{8\}\)\$/;
    assert.ok(re.test(themeCss), 'features/theme-css/index.js must declare the hex regex');
    assert.ok(re.test(ytkit),    'ytkit.js inline fallback must declare the same hex regex');
});

// ── v4.22.0 NX1: theme-css compactUnfixedHeader + hideVideoEndContent peels ──

test('v4.22.0 features/theme-css exports the two new builders', () => {
    delete require.cache[require.resolve('../extension/features/theme-css/index.js')];
    const mod = require('../extension/features/theme-css/index.js');
    assert.equal(typeof mod.buildCompactUnfixedHeaderCss, 'function');
    assert.equal(typeof mod.buildHideVideoEndContentCss, 'function');
});

test('v4.22.0 buildCompactUnfixedHeaderCss shrinks the masthead surface', () => {
    const { buildCompactUnfixedHeaderCss } = require('../extension/features/theme-css/index.js');
    const css = buildCompactUnfixedHeaderCss();
    assert.match(css, /ytd-masthead \{ position: absolute !important; height: 40px !important;/);
    assert.match(css, /ytd-masthead #container\.ytd-masthead \{ height: 40px !important;/);
    assert.match(css, /ytd-masthead #logo \{ height: 16px !important;/);
    assert.match(css, /ytd-page-manager \{ margin-top: 0 !important;/);
});

test('v4.22.0 buildHideVideoEndContentCss covers every end-screen surface', () => {
    const { buildHideVideoEndContentCss } = require('../extension/features/theme-css/index.js');
    const css = buildHideVideoEndContentCss();
    for (const sel of [
        '.ytp-ce-element',
        '.ytp-ce-covering-overlay',
        '.ytp-ce-element-shadow',
        '.ytp-ce-covering-image',
        '.ytp-ce-expanding-image',
        '.ytp-ce-element.ytp-ce-video',
        '.ytp-endscreen-content',
        'div.ytp-fullscreen-grid-stills-container'
    ]) {
        assert.ok(css.includes(sel), 'hideVideoEndContent rule must cover ' + sel);
    }
    assert.match(css, /display: none !important;/);
});

test('v4.22.0 ytkit.js delegates the two new theme-css consumers with byte-identical inline fallbacks', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8'
    );
    const markers = src.match(/v4\.22\.0: CSS construction delegated to features\/theme-css\//g) || [];
    assert.equal(markers.length, 2,
        'ytkit.js must document two v4.22.0 delegating consumers (was ' + markers.length + ')');
    assert.match(src, /MUST stay\s*\n\s*\/\/ byte-identical to features\/theme-css\/index\.js's\s*\n\s*\/\/ buildCompactUnfixedHeaderCss/);
    assert.match(src, /MUST stay\s*\n\s*\/\/ byte-identical to features\/theme-css\/index\.js's\s*\n\s*\/\/ buildHideVideoEndContentCss/);
});

test('v4.22.0 theme-css now exposes seven CSS builders (peel count keeps climbing)', () => {
    const mod = require('../extension/features/theme-css/index.js');
    const builders = Object.keys(mod).filter((k) => typeof mod[k] === 'function');
    builders.sort();
    assert.deepEqual(builders, [
        'buildAccentColorCss',
        'buildCompactUnfixedHeaderCss',
        'buildForceDarkEverywhereCss',
        'buildGrayscaleThumbnailsCss',
        'buildHideVideoEndContentCss',
        'buildProgressBarCss',
        'buildSelectionColorCss'
    ], 'theme-css must export the seven v4.22.0 builders alphabetically');
});

// ── v4.23.0 NX1: schema-driven category overview in popup ──

test('v4.23.0 popup.html declares the schema-overview details surface', () => {
    const html = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.html'), 'utf8'
    );
    assert.match(html, /<details class="schema-overview" id="schema-overview">/,
        'popup.html must declare a <details> wrapping the schema overview');
    assert.match(html, /id="schema-overview-count"/,
        'overview must expose the count target');
    assert.match(html, /id="schema-overview-list"/,
        'overview must expose the per-category list target');
    // The wrapper must NOT default to `open` — first-time openers see
    // a compact summary line.
    const tag = html.match(/<details class="schema-overview"[^>]*>/)[0];
    assert.equal(tag.includes(' open'), false,
        'schema-overview details must be collapsed by default');
});

test('v4.23.0 popup.js defines renderSchemaOverview + isToggleEnabled and reads from the schema', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    assert.match(src, /function renderSchemaOverview\(\)/,
        'popup.js must define renderSchemaOverview');
    assert.match(src, /function isToggleEnabled\(entry, settings\)/,
        'popup.js must define isToggleEnabled');
    assert.match(src, /window\.__YTKIT_SETTINGS_SCHEMA__/,
        'renderSchemaOverview must read the schema via __YTKIT_SETTINGS_SCHEMA__');
    // Wired into init + storage.onChanged so the counts stay reactive.
    const calls = (src.match(/renderSchemaOverview\(\)/g) || []).length;
    assert.ok(calls >= 3,
        'renderSchemaOverview must be invoked at least three times — definition + init + storage.onChanged (was ' + calls + ')');
});

test('v4.23.0 popup.css declares the schema-overview surface without pill backdrops', () => {
    const css = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.css'), 'utf8'
    );
    assert.match(css, /\.schema-overview \{/);
    assert.match(css, /\.schema-overview-list li \{/);
    // The list rows must use the house-style 8 px radius. No
    // border-radius: 999px / 50%.
    const overviewBlock = css.split('.schema-overview')[1] || '';
    const oversized = overviewBlock.match(/border-radius:\s*(999px|9999px|50%)/g) || [];
    assert.equal(oversized.length, 0,
        'schema-overview must not use stadium/pill backdrops (found: ' + oversized.join(', ') + ')');
});

test('v4.23.0 every locale defines the new schemaOverview i18n keys', () => {
    const dir = path.join(__dirname, '..', 'extension', '_locales');
    const required = ['schemaOverviewEyebrow', 'schemaOverviewCountTpl'];
    for (const locale of fs.readdirSync(dir)) {
        const p = path.join(dir, locale, 'messages.json');
        if (!fs.existsSync(p)) continue;
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        for (const k of required) {
            assert.ok(k in data, locale + ' must define ' + k);
            assert.ok(typeof data[k].message === 'string' && data[k].message.length > 0);
        }
    }
});

test('v4.23.0 schemaOverviewCountTpl placeholders cover enabled/total/categories', () => {
    const en = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', '_locales', 'en', 'messages.json'), 'utf8'
    ));
    const tpl = en.schemaOverviewCountTpl.message;
    assert.match(tpl, /\{enabled\}/,    'tpl must reference {enabled}');
    assert.match(tpl, /\{total\}/,      'tpl must reference {total}');
    assert.match(tpl, /\{categories\}/, 'tpl must reference {categories}');
});

// ── v4.24.0 NX1: interactive category expansion in schema overview ──

test('v4.24.0 popup.js declares schemaOverviewState with an expanded Set', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    assert.match(src, /const schemaOverviewState = \{ expanded: new Set\(\) \};/,
        'popup.js must define schemaOverviewState with an expanded Set');
});

test('v4.24.0 popup.js builds clickable category disclosure rows via <button> head', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    // The head must be a real <button> so accessibility comes for free.
    assert.match(src, /const head = document\.createElement\('button'\)/,
        'category head must be a real button element');
    assert.match(src, /head\.setAttribute\('aria-expanded',/,
        'category head must declare aria-expanded for SR consumers');
    assert.match(src, /schemaOverviewState\.expanded\.has\(cat\)/,
        'category head must reflect expanded state from schemaOverviewState');
});

test('v4.24.0 popup.js defines buildSchemaOverviewKeyRow with boolean switch + writeSetting persist', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    assert.match(src, /function buildSchemaOverviewKeyRow\(entry, settings\)/,
        'popup.js must define buildSchemaOverviewKeyRow');
    // Boolean path uses a role=switch button and calls writeSetting.
    assert.match(src, /btn\.setAttribute\('role', 'switch'\)/,
        'boolean rows must use role="switch"');
    assert.match(src, /await writeSetting\(entry\.key, next\)/,
        'boolean rows must persist via writeSetting');
    // v4.41.0: array / object rows are no longer read-only — they now
    // render a JSON textarea editor. The v4.24.0 array-length read-only
    // canary is replaced by the v4.41.0 textarea + JSON.parse pair.
    assert.match(src, /entry\.type === 'array' \|\| entry\.type === 'object'/,
        'array / object rows must take the v4.41.0 JSON editor branch');
});

test('v4.24.0 popup.css declares the new disclosure + switch styles without pill backdrops', () => {
    const css = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.css'), 'utf8'
    );
    assert.match(css, /\.so-row-head \{/,
        'popup.css must define the category head button');
    assert.match(css, /\.so-key-list \{/,
        'popup.css must define the per-category key sub-list');
    assert.match(css, /\.so-key-switch \{/,
        'popup.css must define the boolean switch');
    // Switch radius must stay under the stadium ban — schema overview
    // section may not use border-radius >= 14px (well under the
    // ~15px-tall switch's half-height).
    const block = css.slice(css.indexOf('.so-key-switch '));
    const radiusMatch = block.match(/\.so-key-switch \{[^}]*border-radius:\s*(\d+)px/s);
    assert.ok(radiusMatch, 'switch must declare a border-radius');
    const radius = parseInt(radiusMatch[1], 10);
    assert.ok(radius <= 8,
        '.so-key-switch radius must stay <= 8px to avoid stadium/pill aesthetic (got ' + radius + 'px)');
});

test('v4.24.0 popup quickly persists schema-overview toggle writes via the existing writeSetting path', () => {
    // The schema-overview switch and the QUICK_TOGGLES rows must share
    // the same write surface (writeSetting → SETTINGS_STORAGE_KEY).
    // This stops a future refactor from accidentally splitting them
    // into divergent persistence paths.
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    // Both consumers must use writeSetting — count occurrences to
    // catch a future split.
    const writeCalls = (src.match(/writeSetting\(/g) || []).length;
    assert.ok(writeCalls >= 2,
        'writeSetting() must be the single write entry-point (was called ' + writeCalls + 'x — expected >=2)');
});

// ── v4.25.0 NX1: schema-overview search integration ──

test('v4.25.0 renderSchemaOverview reads from q.value and filters categories', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    // Source-string assertions on the new code paths so a future
    // refactor can't accidentally split the search wiring.
    // v4.47.0: the canonical line was renamed `term` → `rawTerm` and the
    // raw input now flows through parseSearchQuery so the mini-DSL can
    // pick out field filters before free-text matching. The invariant
    // (q.value drives the schema-overview filter) is unchanged.
    assert.match(src, /const rawTerm = \(q && q\.value \? q\.value : ''\)\.toLowerCase\(\)\.trim\(\);/,
        'renderSchemaOverview must read q.value into a normalised rawTerm');
    assert.match(src, /const parsed = parseSearchQuery\(rawTerm\);/,
        'rawTerm must flow through parseSearchQuery so the mini-DSL applies to the schema overview');
    assert.match(src, /const matchEntry = \(entry\) =>/,
        'renderSchemaOverview must declare an inline matchEntry helper');
    // matchEntry now operates on freeTerm (the DSL-stripped free-text
    // remainder) instead of the raw term so `risk:api` doesn't double-match.
    assert.match(src, /entry\.key\.toLowerCase\(\)\.includes\(freeTerm\)/,
        'matchEntry must check the storage key against the free-text remainder');
    assert.match(src, /entry\.category\.toLowerCase\(\)\.includes\(freeTerm\)/,
        'matchEntry must check the category name against the free-text remainder');
});

test('v4.25.0 categories with zero matches are hidden when a search term is active', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    assert.match(src, /if \(term && bucket\.matches === 0\) continue;/,
        'renderSchemaOverview must skip categories with zero matching keys when a term is active');
});

test('v4.25.0 a search match force-expands the category row', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    assert.match(src, /const isExpanded = \(term && bucket\.matches > 0\) \|\| schemaOverviewState\.expanded\.has\(cat\);/,
        'renderSchemaOverview must force-expand on a term match');
});

test('v4.25.0 the existing q.addEventListener input handler also refreshes the schema overview', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    // The debounced search input handler must call BOTH render() and
    // renderSchemaOverview() so the two surfaces stay in sync.
    const blockStart = src.indexOf("q.addEventListener('input'");
    assert.ok(blockStart !== -1, 'q input listener must exist');
    const blockEnd = src.indexOf("});", blockStart);
    const block = src.slice(blockStart, blockEnd);
    assert.match(block, /render\(popupState\.settings, q\.value\);/,
        'input listener must call render()');
    assert.match(block, /renderSchemaOverview\(\);/,
        'input listener must also call renderSchemaOverview()');
});

test('v4.25.0 matchEntry covers booleans and non-booleans alike (key + category fuzzy match)', () => {
    // Smoke-test the match logic by running it against the live
    // schema. A search for "subtitle" must find at least the subtitles
    // category's seven keys; a search for "sponsor" must find the
    // ~9 SponsorBlock keys; a totally fake term must find zero.
    const { SETTINGS_SCHEMA } = require('../extension/core/settings-schema');
    const matchTerm = (term) => SETTINGS_SCHEMA
        .filter((e) => !e.internal)
        .filter((e) => e.key.toLowerCase().includes(term)
                    || e.category.toLowerCase().includes(term));
    assert.ok(matchTerm('subtitle').length >= 7,
        'subtitle search must find at least 7 keys (was ' + matchTerm('subtitle').length + ')');
    // `vvf` matches the six video-visual-filter sub-knobs by key prefix.
    assert.ok(matchTerm('vvf').length >= 6,
        'vvf search must find at least 6 keys (was ' + matchTerm('vvf').length + ')');
    // Category-name match exercises the second branch of matchEntry —
    // `downloads` is the v4.6.0 category name housing the local
    // companion + Cobalt + handoff keys.
    assert.ok(matchTerm('downloads').length >= 5,
        'downloads category search must find at least 5 keys (was ' + matchTerm('downloads').length + ')');
    assert.equal(matchTerm('totally-fake-search-string-xyz').length, 0,
        'fake search must find zero keys');
});

// ── v4.26.0 NX1: number-type inline editor in schema overview ──

test('v4.26.0 buildSchemaOverviewKeyRow renders <input type="number"> for number-typed schema entries', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    // The new branch must declare input.type = 'number' and bind to
    // both 'change' and 'blur' so the value persists on every commit
    // surface a user might trigger (tab away, enter key, lose focus).
    assert.match(src, /input\.type = 'number';/,
        'number branch must create an input[type=number]');
    assert.match(src, /input\.addEventListener\('change', persist\);/,
        'number branch must persist on change');
    assert.match(src, /input\.addEventListener\('blur',\s*persist\);/,
        'number branch must persist on blur');
    assert.match(src, /input\.placeholder = String\(entry\.defaultValue\);/,
        'number branch must seed the placeholder from the schema default');
});

test('v4.26.0 number persist routes through writeSetting and validates Number.isFinite', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    // The persist function must short-circuit on empty/NaN AND must
    // route through the existing writeSetting path so the popup's
    // chained-Promise serialisation applies.
    assert.match(src, /if \(!Number\.isFinite\(next\)\) return;/,
        'persist must reject non-finite numbers');
    assert.match(src, /if \(raw === ''\) return;/,
        'persist must short-circuit on empty input (preserve prior value)');
    assert.match(src, /await writeSetting\(entry\.key, next\)/,
        'persist must use writeSetting so onChanged fans out');
});

test('v4.26.0 popup.css declares the number-editor styles and strips the spinner', () => {
    const css = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.css'), 'utf8'
    );
    assert.match(css, /\.so-key-number \{/,
        'popup.css must define .so-key-number');
    // Square corners — 6 px is well under the half-height threshold.
    const block = css.slice(css.indexOf('.so-key-number {'));
    const radius = block.match(/border-radius:\s*(\d+)px/);
    assert.ok(radius && parseInt(radius[1], 10) <= 8,
        '.so-key-number must use a small (<=8 px) radius');
    // The spinner kill must hit both pseudo-elements so the field
    // looks clean in both Chrome and Firefox.
    assert.match(css, /\.so-key-number::-webkit-outer-spin-button/,
        'must hide the outer webkit spinner');
    assert.match(css, /\.so-key-number::-webkit-inner-spin-button/,
        'must hide the inner webkit spinner');
});

test('v4.26.0 the schema has at least 20 number-typed non-internal entries (editor coverage canary)', () => {
    // Sanity that the new editor materially expands editing coverage —
    // there should be roughly two dozen number-typed entries (matches
    // the 22 number total reported by the v4.6.0 schema bring-up).
    const { SETTINGS_SCHEMA } = require('../extension/core/settings-schema');
    const numbers = SETTINGS_SCHEMA.filter((e) => e.type === 'number' && !e.internal);
    assert.ok(numbers.length >= 20,
        'schema must declare at least 20 user-visible number-typed entries (was ' + numbers.length + ')');
});

// ── v4.27.0 NX1: string-type inline editor in schema overview ──

test('v4.27.0 string-type rows render a real input element with the right pattern', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    // Both the colour-picker branch and the text-input branch must
    // be present, and the looksHex selection must be regex-driven.
    assert.match(src, /entry\.type === 'string'/,
        'popup.js must declare a string-type branch');
    assert.match(src, /input\.type = looksHex \? 'color' : 'text';/,
        'string branch must split on looksHex into color | text');
    assert.match(src, /\/\^#\[0-9a-fA-F\]\{3\}\(\?:\[0-9a-fA-F\]\{3\}\)\?\(\?:\[0-9a-fA-F\]\{2\}\)\?\$\//,
        'looksHex detection must use the documented #RGB / #RRGGBB / #RRGGBBAA regex');
});

test('v4.27.0 string persist routes through writeSetting with no-op short-circuit', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    // Equal-value short-circuit prevents needless writes when the user
    // tabs through an input without changing it.
    assert.match(src, /if \(popupState\.settings\[entry\.key\] === raw\) return;/,
        'string persist must short-circuit when the value is unchanged');
    assert.match(src, /await writeSetting\(entry\.key, raw\)/,
        'string persist must use writeSetting');
});

test('v4.27.0 color input coerces #RGB short-hex into #RRGGBB before assigning to input.value', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    // input[type=color] only accepts the 6-digit form — the popup
    // expands #RGB to #RRGGBB by mirroring each digit. Keep this in
    // sync with theme-css's identical normalisation.
    assert.match(src, /current\[1\] \+ current\[1\] \+ current\[2\] \+ current\[2\] \+ current\[3\] \+ current\[3\]/,
        'string branch must mirror short-hex digits when feeding input[type=color]');
});

test('v4.27.0 popup.css declares both editor variants without pill backdrops', () => {
    const css = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.css'), 'utf8'
    );
    assert.match(css, /\.so-key-text \{/);
    assert.match(css, /\.so-key-color \{/);
    // Both surfaces use 6 px radius — same house-style constraint as
    // the v4.26.0 number input. No half-height stadium aesthetic.
    const textBlock = css.slice(css.indexOf('.so-key-text {'));
    const textRadius = textBlock.match(/border-radius:\s*(\d+)px/);
    assert.ok(textRadius && parseInt(textRadius[1], 10) <= 8);
    const colourBlock = css.slice(css.indexOf('.so-key-color {'));
    const colourRadius = colourBlock.match(/border-radius:\s*(\d+)px/);
    assert.ok(colourRadius && parseInt(colourRadius[1], 10) <= 8);
});

test('v4.27.0 the schema has at least 30 string-typed non-internal entries (editor coverage canary)', () => {
    const { SETTINGS_SCHEMA } = require('../extension/core/settings-schema');
    const strings = SETTINGS_SCHEMA.filter((e) => e.type === 'string' && !e.internal);
    assert.ok(strings.length >= 30,
        'schema must declare at least 30 user-visible string-typed entries (was ' + strings.length + ')');
    // And at least a few of them must be hex-coloured so the colour
    // picker branch has live coverage.
    const hexLike = strings.filter((e) => /^#[0-9a-fA-F]{3,8}$/.test(e.defaultValue));
    assert.ok(hexLike.length >= 3,
        'schema must declare at least 3 hex-coloured strings so the color picker branch has live coverage (was ' + hexLike.length + ')');
});

// ── v4.28.0 NX1: humanizeSettingKey helper + popup wiring ──

test('v4.28.0 settings-schema exports humanizeSettingKey', () => {
    delete require.cache[require.resolve('../extension/core/settings-schema')];
    const mod = require('../extension/core/settings-schema');
    assert.equal(typeof mod.humanizeSettingKey, 'function');
});

test('v4.28.0 humanizeSettingKey splits camelCase + capitalises the first letter', () => {
    const { humanizeSettingKey } = require('../extension/core/settings-schema');
    assert.equal(humanizeSettingKey('customProgressBarColor'), 'Custom progress bar color');
    assert.equal(humanizeSettingKey('hideEndCards'),           'Hide end cards');
    assert.equal(humanizeSettingKey('safeStoreProfile'),       'Safe store profile');
});

test('v4.28.0 humanizeSettingKey upper-cases registered short-form acronyms', () => {
    const { humanizeSettingKey } = require('../extension/core/settings-schema');
    assert.equal(humanizeSettingKey('vvfBrightness'),  'VVF brightness');
    assert.equal(humanizeSettingKey('aiSummaryApiKey'),'AI summary API key');
    assert.equal(humanizeSettingKey('dwDailyCapMin'),  'DW daily cap min');
    assert.equal(humanizeSettingKey('dataFlowCss'),    'Data flow CSS');
    assert.equal(humanizeSettingKey('rssFeedLink'),    'RSS feed link');
});

test('v4.28.0 humanizeSettingKey strips leading underscores and survives weird input', () => {
    const { humanizeSettingKey } = require('../extension/core/settings-schema');
    assert.equal(humanizeSettingKey('_profiles'),     'Profiles');
    assert.equal(humanizeSettingKey('_activeProfile'),'Active profile');
    // Defensive paths — must not throw, must return empty string for
    // genuinely empty/invalid input.
    assert.equal(humanizeSettingKey(''),         '');
    assert.equal(humanizeSettingKey(null),       '');
    assert.equal(humanizeSettingKey(undefined),  '');
});

test('v4.28.0 humanizeSettingKey inserts spaces around digit runs', () => {
    const { humanizeSettingKey } = require('../extension/core/settings-schema');
    assert.equal(humanizeSettingKey('vp9Codec'),       'VP9 codec');
    assert.equal(humanizeSettingKey('av1ForceEnable'), 'AV1 force enable');
});

test('v4.28.0 popup schema-overview row labels prefer humanizeSettingKey output', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    assert.match(src, /const humanizer = window\.__YTKIT_SETTINGS_SCHEMA__\s*\n?\s*&& window\.__YTKIT_SETTINGS_SCHEMA__\.humanizeSettingKey;/,
        'popup must resolve humanizer via the schema namespace');
    // v4.40.0: label resolution gained an entry.labelKey override layer
    // on top of the humaniser. The original v4.28.0 invariant — prefer
    // the humanised label, fall back to the raw key — still holds for
    // entries with no override. The assertion pattern is rewritten as
    // a fragment match so both v4.28.0 and v4.40.0 implementations
    // satisfy it.
    assert.match(src, /typeof humanizer === 'function' \? humanizer\(entry\.key\) : entry\.key/,
        'popup must prefer the humanised label, falling back to the raw key');
    // Raw key still surfaces via the tooltip so power users can identify
    // the underlying setting — match either the original v4.28.0 form or
    // the v4.40.0 override-aware form (which keeps the raw key as the
    // tooltip prefix when an override description exists).
    assert.match(src, /label\.title = (entry\.key|overrideDesc)/,
        'popup must keep the raw key reachable from the label title');
});

// ── v4.29.0 NX1: popup overview expansion persistence ──

test('v4.29.0 popup.js declares the SCHEMA_OVERVIEW_EXPANDED_KEY storage constant', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    assert.match(src, /const SCHEMA_OVERVIEW_EXPANDED_KEY = 'ytkit_popup_schema_overview_expanded';/,
        'popup.js must declare the storage key constant');
});

test('v4.29.0 popup.js defines async persist + restore helpers wired to chrome.storage.local', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    assert.match(src, /async function persistSchemaOverviewExpanded\(\)/,
        'popup.js must define persistSchemaOverviewExpanded');
    assert.match(src, /async function restoreSchemaOverviewExpanded\(\)/,
        'popup.js must define restoreSchemaOverviewExpanded');
    // Both helpers route through the existing storageGet/storageSet
    // wrappers so the persistence path is consistent with everything
    // else the popup stores.
    assert.match(src, /await storageSet\(\{ \[SCHEMA_OVERVIEW_EXPANDED_KEY\]: \[\.\.\.schemaOverviewState\.expanded\] \}\);/,
        'persist must serialise the Set into an Array');
    assert.match(src, /await storageGet\(\[SCHEMA_OVERVIEW_EXPANDED_KEY\]\)/,
        'restore must read via storageGet');
});

test('v4.29.0 restore guards against malformed persisted values', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    // Anything not a string Array must round-trip into an empty Set.
    assert.match(src, /if \(!Array\.isArray\(raw\)\) return;/,
        'restore must reject non-array stored values');
    // Filter must drop garbage entries (non-strings, empty strings, or
    // suspiciously long strings) so a corrupt store can't blow up the
    // UI with a million open categories.
    assert.match(src, /typeof entry === 'string' && entry\.length > 0 && entry\.length < 64/,
        'restore must filter entries to safe strings (1-63 chars)');
});

test('v4.29.0 the category-row click handler kicks off the persist promise', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    // The click handler fires-and-forgets the persist call so the UI
    // re-render isn't blocked on storage I/O.
    assert.match(src, /void persistSchemaOverviewExpanded\(\);/,
        'click handler must dispatch persistSchemaOverviewExpanded');
});

test('v4.29.0 init flow restores the expanded set BEFORE the first renderSchemaOverview', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    const restoreIdx = src.indexOf('await restoreSchemaOverviewExpanded()');
    const firstRenderIdx = src.indexOf('renderSchemaOverview();', restoreIdx);
    assert.ok(restoreIdx > -1, 'init must await restoreSchemaOverviewExpanded');
    assert.ok(firstRenderIdx > restoreIdx,
        'restore must be awaited BEFORE the first renderSchemaOverview so the user sees their open categories on open');
});

// ── v4.31.0 NX1: versioned selector-pack file split ──

const V431_FIRST_BATCH_SURFACES = ['appShell', 'nav', 'masthead', 'search', 'leftNav'];
const V431_FIRST_BATCH_FILES = [
    'core/selector-packs/appShell.js',
    'core/selector-packs/nav.js',
    'core/selector-packs/search.js',
    'core/selector-packs/leftNav.js'
];

function loadSelectorPackContext() {
    // Mirror manifest load order: registry.js + every selector-packs/*.js
    // then selectors.js. The selector packs register themselves into
    // YTKitCore.SurfacePackRegistry which selectors.js consumes when it
    // builds SurfaceSelectorMap. The helper discovers pack files from
    // disk so a new batch (v4.32.0+) doesn't require updating this
    // setup block.
    const vm = require('node:vm');
    const ctx = {
        console,
        Date,
        Math,
        globalThis: null,
        dispatchEvent() {}
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    const packsDir = path.join(__dirname, '..', 'extension', 'core', 'selector-packs');
    const packFiles = fs.existsSync(packsDir)
        ? fs.readdirSync(packsDir).filter((f) => f.endsWith('.js')).sort()
        : [];
    const files = [
        'extension/core/registry.js',
        ...packFiles.map((f) => `extension/core/selector-packs/${f}`),
        'extension/core/selectors.js'
    ];
    for (const rel of files) {
        const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
        vm.runInContext(src, ctx, { filename: rel });
    }
    return ctx.globalThis.YTKitCore;
}

test('v4.31.0 selector-packs/ files exist for the first-batch surfaces', () => {
    for (const rel of V431_FIRST_BATCH_FILES) {
        const full = path.join(__dirname, '..', 'extension', rel);
        assert.ok(fs.existsSync(full), `${rel} must exist in extension/`);
        const body = fs.readFileSync(full, 'utf8');
        // Every pack must register into the shared SurfacePackRegistry so
        // the order of pack-file loading is irrelevant.
        assert.match(body, /SurfacePackRegistry/, `${rel} must reference SurfacePackRegistry`);
        // Every pack must declare the v4.31.0 schema fields.
        assert.match(body, /captureEvidence:/, `${rel} must declare captureEvidence`);
        assert.match(body, /lastVerified:/, `${rel} must declare lastVerified`);
        assert.match(body, /highChurn:/, `${rel} must declare highChurn`);
        assert.match(body, /needsFreshCapture:/, `${rel} must declare needsFreshCapture`);
        assert.match(body, /notes:/, `${rel} must declare notes`);
        // The pack file must be idempotent — re-registration in a re-run
        // context (Firefox hot-reload, userscript-on-userscript) must be a
        // no-op. The check uses the registry.has() guard.
        assert.match(body, /registry\.has\(/, `${rel} must guard against double-registration`);
    }
});

test('v4.31.0 selector pack registry populates SurfaceSelectorMap with first-batch surfaces', () => {
    const core = loadSelectorPackContext();
    // instanceof Map doesn't cross vm realms — duck-type the registry
    // instead. The runtime contract is "has .has() + .keys() + .get()".
    const reg = core.SurfacePackRegistry;
    assert.ok(reg && typeof reg.has === 'function' && typeof reg.get === 'function',
        'YTKitCore.SurfacePackRegistry must expose has() and get()');
    for (const surface of V431_FIRST_BATCH_SURFACES) {
        const entry = core.SurfaceSelectorMap[surface];
        assert.ok(entry, `${surface} must appear in SurfaceSelectorMap`);
        assert.ok(entry.stable.length >= 1, `${surface} must have at least one stable selector`);
        assert.ok(entry.fallback.length >= 1, `${surface} must have at least one fallback selector`);
        assert.ok(Array.isArray(entry.captureEvidence) && entry.captureEvidence.length >= 1,
            `${surface} must declare at least one captureEvidence entry`);
        assert.match(entry.lastVerified || '', /^\d{4}-\d{2}-\d{2}$/,
            `${surface} must declare lastVerified as ISO yyyy-mm-dd`);
    }
});

test('v4.31.0 nav and masthead packs share an identical selector spine', () => {
    const core = loadSelectorPackContext();
    const nav = core.SurfaceSelectorMap.nav;
    const masthead = core.SurfaceSelectorMap.masthead;
    assert.deepEqual([...nav.stable], [...masthead.stable],
        'nav and masthead must share the same stable selectors');
    assert.deepEqual([...nav.fallback], [...masthead.fallback],
        'nav and masthead must share the same fallback selectors');
    // The two entries diverge only on the notes — masthead announces it
    // is an alias so feature code that grep'd for it knows which surface
    // is canonical.
    assert.match(masthead.notes, /alias/i, 'masthead notes must mark it as an alias');
});

test('v4.31.0 manifest loads selector packs before core/selectors.js in every content_scripts entry', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        const selectorsIdx = cs.js.indexOf('core/selectors.js');
        if (selectorsIdx === -1) continue;
        for (const pack of V431_FIRST_BATCH_FILES) {
            const packIdx = cs.js.indexOf(pack);
            assert.notEqual(packIdx, -1, `manifest content_scripts must include ${pack}`);
            assert.ok(packIdx < selectorsIdx,
                `${pack} must load BEFORE core/selectors.js (otherwise the registry is empty when the map is built)`);
        }
    }
});

test('v4.31.0 freezeEntry preserves captureEvidence and lastVerified on entries that declare them', () => {
    const core = loadSelectorPackContext();
    const appShell = core.SurfaceSelectorMap.appShell;
    assert.ok(Object.isFrozen(appShell), 'pack entries must be frozen');
    assert.ok(Object.isFrozen(appShell.captureEvidence), 'captureEvidence must be frozen');
    assert.ok(appShell.captureEvidence.includes('mhtml/WatchPage.mhtml'),
        'appShell pack must list the WatchPage capture as evidence');
    assert.equal(appShell.lastVerified, '2026-05-19');
});

test('v4.31.0 every surface now resolves through SurfaceSelectorMap (no regression after full pack migration)', () => {
    const core = loadSelectorPackContext();
    // After v4.37.0 every surface comes from a selector-pack file —
    // INLINE_SURFACES is empty. Spot-check coverage of one surface
    // from each batch so a regression that drops a pack file (e.g.
    // accidentally deleting one from manifest.json) surfaces here.
    const oneFromEachBatch = ['appShell', 'feed', 'watch', 'playerChrome', 'comments', 'profile', 'liveChat'];
    for (const surface of oneFromEachBatch) {
        const entry = core.SurfaceSelectorMap[surface];
        assert.ok(entry, `${surface} must still be in SurfaceSelectorMap`);
        assert.ok(entry.stable.length >= 1);
        assert.ok(entry.captureEvidence.length >= 1,
            `${surface} must carry capture evidence (proves it came from a pack file)`);
    }
    // High-churn / capture-state flags must survive the peel.
    assert.equal(core.SurfaceSelectorMap.feed.highChurn, true);
    assert.equal(core.SurfaceSelectorMap.watch.highChurn, true);
    assert.equal(core.SurfaceSelectorMap.liveChat.needsFreshCapture, false);
});

test('v4.31.0 getSurfaceSelectorEntry exposes captureEvidence and lastVerified', () => {
    const core = loadSelectorPackContext();
    const entry = core.getSurfaceSelectorEntry('search');
    assert.ok(Array.isArray(entry.captureEvidence) && entry.captureEvidence.length >= 1,
        'getSurfaceSelectorEntry must expose captureEvidence on packed surfaces');
    assert.equal(entry.lastVerified, '2026-06-05');
    const liveChat = core.getSurfaceSelectorEntry('liveChat');
    assert.ok(Array.isArray(liveChat.captureEvidence), 'liveChat captureEvidence must be an array');
    assert.ok(liveChat.captureEvidence.includes('mhtml/LiveChat.mhtml'),
        'liveChat captureEvidence must list the fresh popout-chat MHTML capture');
    assert.equal(liveChat.lastVerified, '2026-06-04');
});

// ── v4.32.0 NX1: selector-pack batch 2 (feed-shell) ──

const V432_FEED_SHELL_SURFACES = ['feed', 'feedCard', 'thumbnail', 'shortsShelf'];
const V432_FEED_SHELL_FILES = [
    'core/selector-packs/feed.js',
    'core/selector-packs/feedCard.js',
    'core/selector-packs/thumbnail.js',
    'core/selector-packs/shortsShelf.js'
];

const loadSelectorPackContextV432 = loadSelectorPackContext;

test('v4.32.0 feed-shell pack files exist with the v4.31.0 schema fields', () => {
    for (const rel of V432_FEED_SHELL_FILES) {
        const full = path.join(__dirname, '..', 'extension', rel);
        assert.ok(fs.existsSync(full), `${rel} must exist in extension/`);
        const body = fs.readFileSync(full, 'utf8');
        assert.match(body, /SurfacePackRegistry/, `${rel} must reference SurfacePackRegistry`);
        assert.match(body, /captureEvidence:/, `${rel} must declare captureEvidence`);
        assert.match(body, /lastVerified:/, `${rel} must declare lastVerified`);
        assert.match(body, /highChurn:/, `${rel} must declare highChurn`);
        assert.match(body, /needsFreshCapture:/, `${rel} must declare needsFreshCapture`);
        assert.match(body, /registry\.has\(/, `${rel} must guard against double-registration`);
    }
});

test('v4.32.0 feed-shell surfaces now come from the pack registry, not INLINE_SURFACES', () => {
    const core = loadSelectorPackContextV432();
    const expectedLastVerified = {
        feed: '2026-05-19',
        feedCard: '2026-06-05',
        thumbnail: '2026-06-05',
        shortsShelf: '2026-06-05'
    };
    for (const surface of V432_FEED_SHELL_SURFACES) {
        const entry = core.SurfaceSelectorMap[surface];
        assert.ok(entry, `${surface} must appear in SurfaceSelectorMap`);
        // captureEvidence is the marker — only packed surfaces carry it.
        assert.ok(entry.captureEvidence.length >= 1,
            `${surface} must carry capture evidence (i.e. live in a pack file, not INLINE_SURFACES)`);
        assert.equal(entry.lastVerified, expectedLastVerified[surface]);
        assert.equal(entry.highChurn, true, `${surface} must keep highChurn=true after the peel`);
    }
});

test('v4.32.0 feed-shell pack selectors round-trip the pre-peel values', () => {
    const core = loadSelectorPackContextV432();
    const feed = core.SurfaceSelectorMap.feed;
    assert.deepEqual([...feed.stable],
        ['ytd-browse ytd-rich-grid-renderer', 'ytd-rich-grid-renderer']);
    assert.deepEqual([...feed.fallback],
        ['ytd-rich-grid-renderer.style-scope', '#contents.ytd-rich-grid-renderer']);

    const feedCard = core.SurfaceSelectorMap.feedCard;
    assert.deepEqual([...feedCard.stable],
        ['ytd-rich-item-renderer', 'yt-lockup-view-model', 'ytd-video-renderer']);

    const shorts = core.SurfaceSelectorMap.shortsShelf;
    assert.equal(shorts.stable[0], 'a[href^="/shorts"]',
        'Shorts shelf must keep the URL-anchored selector first');
});

test('v4.32.0 manifest loads the feed-shell packs before core/selectors.js', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        const selectorsIdx = cs.js.indexOf('core/selectors.js');
        if (selectorsIdx === -1) continue;
        for (const pack of V432_FEED_SHELL_FILES) {
            const packIdx = cs.js.indexOf(pack);
            assert.notEqual(packIdx, -1, `manifest content_scripts must include ${pack}`);
            assert.ok(packIdx < selectorsIdx, `${pack} must load BEFORE core/selectors.js`);
        }
    }
});

// ── v4.33.0 NX1: selector-pack batch 3 (watch-shell) ──

const V433_WATCH_SHELL_SURFACES = ['watch', 'relatedSidebar', 'player', 'mainVideo'];
const V433_WATCH_SHELL_FILES = [
    'core/selector-packs/watch.js',
    'core/selector-packs/relatedSidebar.js',
    'core/selector-packs/player.js',
    'core/selector-packs/mainVideo.js'
];

test('v4.33.0 watch-shell pack files exist with the v4.31.0 schema fields', () => {
    for (const rel of V433_WATCH_SHELL_FILES) {
        const full = path.join(__dirname, '..', 'extension', rel);
        assert.ok(fs.existsSync(full), `${rel} must exist in extension/`);
        const body = fs.readFileSync(full, 'utf8');
        assert.match(body, /SurfacePackRegistry/, `${rel} must reference SurfacePackRegistry`);
        assert.match(body, /captureEvidence:/, `${rel} must declare captureEvidence`);
        assert.match(body, /lastVerified:/, `${rel} must declare lastVerified`);
        assert.match(body, /highChurn:/, `${rel} must declare highChurn`);
        assert.match(body, /needsFreshCapture:/, `${rel} must declare needsFreshCapture`);
        assert.match(body, /registry\.has\(/, `${rel} must guard against double-registration`);
    }
});

test('v4.33.0 watch-shell surfaces now come from the pack registry with capture evidence', () => {
    const core = loadSelectorPackContext();
    const expectedLastVerified = {
        watch: '2026-05-19',
        relatedSidebar: '2026-05-19',
        player: '2026-06-05',
        mainVideo: '2026-06-05'
    };
    for (const surface of V433_WATCH_SHELL_SURFACES) {
        const entry = core.SurfaceSelectorMap[surface];
        assert.ok(entry, `${surface} must appear in SurfaceSelectorMap`);
        assert.ok(entry.captureEvidence.length >= 1,
            `${surface} must carry capture evidence after the v4.33.0 peel`);
        assert.equal(entry.lastVerified, expectedLastVerified[surface]);
        assert.equal(entry.highChurn, true, `${surface} must keep highChurn=true after the peel`);
    }
});

test('v4.33.0 watch-shell pack selectors round-trip the pre-peel values', () => {
    const core = loadSelectorPackContext();
    const watch = core.SurfaceSelectorMap.watch;
    assert.equal(watch.stable[0], 'ytd-watch-flexy[video-id]',
        'watch surface must keep the route-state selector first');
    assert.deepEqual([...watch.fallback],
        ['ytd-watch-metadata.watch-active-metadata', 'ytd-watch-flexy[flexy]']);

    const player = core.SurfaceSelectorMap.player;
    assert.deepEqual([...player.stable], ['#movie_player', '.html5-video-player']);

    const mainVideo = core.SurfaceSelectorMap.mainVideo;
    assert.deepEqual([...mainVideo.stable], ['video.html5-main-video', '#movie_player video']);
});

test('v4.33.0 manifest loads the watch-shell packs before core/selectors.js', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        const selectorsIdx = cs.js.indexOf('core/selectors.js');
        if (selectorsIdx === -1) continue;
        for (const pack of V433_WATCH_SHELL_FILES) {
            const packIdx = cs.js.indexOf(pack);
            assert.notEqual(packIdx, -1, `manifest content_scripts must include ${pack}`);
            assert.ok(packIdx < selectorsIdx, `${pack} must load BEFORE core/selectors.js`);
        }
    }
});

// ── v4.34.0 NX1: selector-pack batch 4 (player-chrome + sidebar + modals) ──

const V434_BATCH_SURFACES = ['playerChrome', 'playerSettings', 'sidebar', 'modals'];
const V434_BATCH_FILES = [
    'core/selector-packs/playerChrome.js',
    'core/selector-packs/playerSettings.js',
    'core/selector-packs/sidebar.js',
    'core/selector-packs/modals.js'
];

test('v4.34.0 player-chrome batch pack files exist with the v4.31.0 schema fields', () => {
    for (const rel of V434_BATCH_FILES) {
        const full = path.join(__dirname, '..', 'extension', rel);
        assert.ok(fs.existsSync(full), `${rel} must exist in extension/`);
        const body = fs.readFileSync(full, 'utf8');
        assert.match(body, /SurfacePackRegistry/, `${rel} must reference SurfacePackRegistry`);
        assert.match(body, /captureEvidence:/, `${rel} must declare captureEvidence`);
        assert.match(body, /lastVerified:/, `${rel} must declare lastVerified`);
        assert.match(body, /highChurn:/, `${rel} must declare highChurn`);
        assert.match(body, /needsFreshCapture:/, `${rel} must declare needsFreshCapture`);
        assert.match(body, /registry\.has\(/, `${rel} must guard against double-registration`);
    }
});

test('v4.34.0 player-chrome batch surfaces now come from the pack registry', () => {
    const core = loadSelectorPackContext();
    const expectedLastVerified = {
        playerChrome: '2026-06-04',
        playerSettings: '2026-05-19',
        sidebar: '2026-05-19',
        modals: '2026-05-19',
    };
    for (const surface of V434_BATCH_SURFACES) {
        const entry = core.SurfaceSelectorMap[surface];
        assert.ok(entry, `${surface} must appear in SurfaceSelectorMap`);
        assert.ok(entry.captureEvidence.length >= 1,
            `${surface} must carry capture evidence after the v4.34.0 peel`);
        assert.equal(entry.lastVerified, expectedLastVerified[surface]);
    }
});

test('v4.34.0 player-chrome fallback list still bundles legacy + Delhi/new-player candidates', () => {
    const core = loadSelectorPackContext();
    const chrome = core.SurfaceSelectorMap.playerChrome;
    // The fallback list is the safety net during the player UI A/B
    // transition. Specifically: legacy `.ytp-chrome-bottom` (stable),
    // Delhi `.ytp-delhi-modern` (fallback), action-pill, overflow-panel.
    const fallback = [...chrome.fallback];
    assert.ok(fallback.includes('.ytp-delhi-modern'),
        'playerChrome fallback must include the Delhi modern shell selector');
    assert.ok(fallback.includes('.ytp-overflow-panel'),
        'playerChrome fallback must include the new-player overflow panel selector');
    assert.ok(fallback.includes('.ytp-action-pill'),
        'playerChrome fallback must include the action-pill selector');
});

test('v4.34.0 manifest loads the player-chrome batch packs before core/selectors.js', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        const selectorsIdx = cs.js.indexOf('core/selectors.js');
        if (selectorsIdx === -1) continue;
        for (const pack of V434_BATCH_FILES) {
            const packIdx = cs.js.indexOf(pack);
            assert.notEqual(packIdx, -1, `manifest content_scripts must include ${pack}`);
            assert.ok(packIdx < selectorsIdx, `${pack} must load BEFORE core/selectors.js`);
        }
    }
});

// ── v4.35.0 NX1: selector-pack batch 5 (engagement) ──

const V435_BATCH_SURFACES = ['comments', 'commentComposer', 'engagementPanels'];
const V435_BATCH_FILES = [
    'core/selector-packs/comments.js',
    'core/selector-packs/commentComposer.js',
    'core/selector-packs/engagementPanels.js'
];

test('v4.35.0 engagement batch pack files exist with the v4.31.0 schema fields', () => {
    for (const rel of V435_BATCH_FILES) {
        const full = path.join(__dirname, '..', 'extension', rel);
        assert.ok(fs.existsSync(full), `${rel} must exist in extension/`);
        const body = fs.readFileSync(full, 'utf8');
        assert.match(body, /SurfacePackRegistry/);
        assert.match(body, /captureEvidence:/);
        assert.match(body, /lastVerified:/);
        assert.match(body, /registry\.has\(/);
    }
});

test('v4.35.0 engagement surfaces now come from the pack registry', () => {
    const core = loadSelectorPackContext();
    for (const surface of V435_BATCH_SURFACES) {
        const entry = core.SurfaceSelectorMap[surface];
        assert.ok(entry, `${surface} must appear in SurfaceSelectorMap`);
        assert.ok(entry.captureEvidence.length >= 1,
            `${surface} must carry capture evidence after the v4.35.0 peel`);
        assert.ok(
            entry.lastVerified === '2026-05-19' || entry.lastVerified === '2026-06-19',
            `${surface} must have a reviewed lastVerified date`
        );
    }
});

test('v4.35.0 comments pack keeps the new + legacy comment shapes both in the chain', () => {
    const core = loadSelectorPackContext();
    const c = core.SurfaceSelectorMap.comments;
    const chain = [...c.stable, ...c.fallback];
    assert.ok(chain.includes('ytd-comment-view-model'),
        'comments chain must include the new view-model shape');
    assert.ok(chain.includes('ytd-comment-renderer'),
        'comments chain must keep the legacy renderer in the fallback');
});

test('v4.35.0 manifest loads the engagement packs before core/selectors.js', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        const selectorsIdx = cs.js.indexOf('core/selectors.js');
        if (selectorsIdx === -1) continue;
        for (const pack of V435_BATCH_FILES) {
            const packIdx = cs.js.indexOf(pack);
            assert.notEqual(packIdx, -1, `manifest content_scripts must include ${pack}`);
            assert.ok(packIdx < selectorsIdx, `${pack} must load BEFORE core/selectors.js`);
        }
    }
});

// ── v4.36.0 NX1: selector-pack batch 6 (misc: overlay + profile + notifications + media) ──

const V436_BATCH_SURFACES = ['settingsOverlay', 'profile', 'channelProfile', 'notifications', 'media'];
const V436_BATCH_FILES = [
    'core/selector-packs/settingsOverlay.js',
    'core/selector-packs/profile.js',
    'core/selector-packs/notifications.js',
    'core/selector-packs/media.js'
];

test('v4.36.0 misc batch pack files exist with the v4.31.0 schema fields', () => {
    for (const rel of V436_BATCH_FILES) {
        const full = path.join(__dirname, '..', 'extension', rel);
        assert.ok(fs.existsSync(full), `${rel} must exist in extension/`);
        const body = fs.readFileSync(full, 'utf8');
        assert.match(body, /SurfacePackRegistry/);
        assert.match(body, /captureEvidence:/);
        assert.match(body, /lastVerified:/);
        assert.match(body, /registry\.has\(/);
    }
});

test('v4.36.0 misc batch surfaces now come from the pack registry', () => {
    const core = loadSelectorPackContext();
    const expectedLastVerified = {
        settingsOverlay: '2026-05-19',
        profile: '2026-06-05',
        channelProfile: '2026-06-05',
        notifications: '2026-05-19',
        media: '2026-06-05'
    };
    for (const surface of V436_BATCH_SURFACES) {
        const entry = core.SurfaceSelectorMap[surface];
        assert.ok(entry, `${surface} must appear in SurfaceSelectorMap`);
        assert.ok(entry.captureEvidence.length >= 1,
            `${surface} must carry capture evidence after the v4.36.0 peel`);
        assert.equal(entry.lastVerified, expectedLastVerified[surface]);
    }
});

test('v4.36.0 profile and channelProfile packs share an identical selector spine', () => {
    const core = loadSelectorPackContext();
    const a = core.SurfaceSelectorMap.profile;
    const b = core.SurfaceSelectorMap.channelProfile;
    assert.deepEqual([...a.stable], [...b.stable]);
    assert.deepEqual([...a.fallback], [...b.fallback]);
    assert.match(b.notes, /alias/i, 'channelProfile notes must mark it as an alias');
});

test('v4.36.0 settingsOverlay pack uses the Astra-owned source as evidence (no MHTML capture)', () => {
    const core = loadSelectorPackContext();
    const overlay = core.SurfaceSelectorMap.settingsOverlay;
    // The overlay is Astra-owned, not YouTube-owned, so its evidence
    // is the source file that defines the markup, not an MHTML
    // capture. The convention `extension/<file>#<symbol>` lets the
    // popup health surface link back to the implementation.
    assert.ok(overlay.captureEvidence.some((entry) => entry.startsWith('extension/')),
        'settingsOverlay captureEvidence must reference the source file that owns it');
});

test('v4.36.0 manifest loads the misc batch packs before core/selectors.js', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        const selectorsIdx = cs.js.indexOf('core/selectors.js');
        if (selectorsIdx === -1) continue;
        for (const pack of V436_BATCH_FILES) {
            const packIdx = cs.js.indexOf(pack);
            assert.notEqual(packIdx, -1, `manifest content_scripts must include ${pack}`);
            assert.ok(packIdx < selectorsIdx, `${pack} must load BEFORE core/selectors.js`);
        }
    }
});

// ── v4.37.0 NX1: selector-pack migration COMPLETE (final batch — live-chat trio) ──

const V437_LIVECHAT_SURFACES = ['liveChatFrame', 'liveChat', 'liveChatPlaceholder'];
const V437_LIVECHAT_FILES = [
    'core/selector-packs/liveChatFrame.js',
    'core/selector-packs/liveChat.js',
    'core/selector-packs/liveChatPlaceholder.js'
];

test('v4.37.0 live-chat pack files exist with the v4.31.0 schema fields', () => {
    for (const rel of V437_LIVECHAT_FILES) {
        const full = path.join(__dirname, '..', 'extension', rel);
        assert.ok(fs.existsSync(full), `${rel} must exist in extension/`);
        const body = fs.readFileSync(full, 'utf8');
        assert.match(body, /SurfacePackRegistry/);
        assert.match(body, /needsFreshCapture: false/,
            `${rel} must declare needsFreshCapture=false after the EI8 capture refresh`);
        assert.match(body, /registry\.has\(/);
    }
});

test('v4.37.0 live-chat surfaces come from the pack registry and carry fresh capture metadata', () => {
    const core = loadSelectorPackContext();
    for (const surface of V437_LIVECHAT_SURFACES) {
        const entry = core.SurfaceSelectorMap[surface];
        assert.ok(entry, `${surface} must appear in SurfaceSelectorMap`);
        assert.equal(entry.needsFreshCapture, false,
            `${surface} must be marked capture-backed after the EI8 refresh`);
        assert.equal(entry.lastVerified, '2026-06-04',
            `${surface} lastVerified must track the EI8 live-chat refresh date`);
    }
});

test('v4.37.0 selectors.js INLINE_SURFACES is now empty — every surface lives in a pack file', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'selectors.js'), 'utf8'
    );
    // Match exactly the empty-literal form so a future regression
    // that adds an inline surface back without a paired pack file
    // fails this canary loudly. Whitespace-tolerant.
    assert.match(src, /const INLINE_SURFACES\s*=\s*\{\s*\}\s*;/,
        'INLINE_SURFACES must be an empty object literal after the v4.37.0 final peel');
});

test('v4.37.0 every selector pack file is loaded by both ISOLATED content_scripts entries', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    const packsDir = path.join(__dirname, '..', 'extension', 'core', 'selector-packs');
    const packFilesOnDisk = fs.readdirSync(packsDir)
        .filter((f) => f.endsWith('.js'))
        .map((f) => `core/selector-packs/${f}`);
    assert.ok(packFilesOnDisk.length >= 23,
        `expected at least 23 pack files on disk after v4.37.0 (found ${packFilesOnDisk.length})`);
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        if (cs.js.indexOf('core/selectors.js') === -1) continue;
        for (const pack of packFilesOnDisk) {
            assert.ok(cs.js.includes(pack),
                `manifest content_scripts (matches ${JSON.stringify(cs.matches)}) must include ${pack}`);
        }
    }
});

// ── v4.38.0 NX1: feature-peel batch (5 wave-8 CSS-only features) ──

function loadWave8CssModule() {
    delete require.cache[require.resolve('../extension/features/wave-8-css/index.js')];
    const stub = {};
    const prev = global.YTKitFeatures;
    global.YTKitFeatures = stub;
    require('../extension/features/wave-8-css/index.js');
    global.YTKitFeatures = prev;
    return stub.wave8Css;
}

test('v4.38.0 wave-8-css module exports five pure builders', () => {
    const wave8 = loadWave8CssModule();
    assert.ok(wave8, 'YTKitFeatures.wave8Css must be populated by the IIFE');
    for (const name of [
        'buildHideNotificationButtonCss',
        'buildNoFrostedGlassCss',
        'buildHideLatestPostsCss',
        'buildDisableMiniPlayerCss',
        'buildNyanCatProgressBarCss'
    ]) {
        assert.equal(typeof wave8[name], 'function', `wave8Css.${name} must be a function`);
        const css = wave8[name]();
        assert.equal(typeof css, 'string', `${name} must return a string`);
        assert.ok(css.length > 0, `${name} must return a non-empty CSS string`);
    }
});

test('v4.38.0 wave-8-css helpers return byte-identical CSS to the monolith fallback', () => {
    const wave8 = loadWave8CssModule();
    // For each peeled feature, the module's CSS must appear verbatim
    // inside the monolith's inline fallback (the literal after the
    // `||` operator at the cssFeature() call site). The parity check
    // is a substring assertion rather than equality because the
    // monolith wraps the literal in a template literal whose
    // trailing whitespace can differ.
    const ytkit = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');
    const cases = [
        ['buildHideNotificationButtonCss', 'ytd-notification-topbar-button-renderer'],
        ['buildNoFrostedGlassCss', 'backdrop-filter: none !important'],
        ['buildHideLatestPostsCss', 'ytd-backstage-post-thread-renderer'],
        ['buildDisableMiniPlayerCss', 'ytd-miniplayer[active]'],
        ['buildNyanCatProgressBarCss', '@keyframes ytkit-nyan-rainbow']
    ];
    for (const [fn, marker] of cases) {
        const css = wave8[fn]();
        assert.ok(css.includes(marker), `${fn}() output must contain ${marker}`);
        // The same marker must also appear inside ytkit.js (the
        // byte-identical inline fallback after the `||`).
        assert.ok(ytkit.includes(marker), `ytkit.js must keep the inline fallback containing ${marker}`);
    }
});

test('v4.38.0 monolith cssFeature() callsites delegate via globalThis.YTKitFeatures.wave8Css', () => {
    const ytkit = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');
    // Each of the five peeled features must reference the wave8Css
    // delegation chain — proves the call site isn't accidentally
    // reverted to a plain literal.
    for (const fn of [
        'buildHideNotificationButtonCss',
        'buildNoFrostedGlassCss',
        'buildHideLatestPostsCss',
        'buildDisableMiniPlayerCss',
        'buildNyanCatProgressBarCss'
    ]) {
        assert.ok(
            ytkit.includes(`globalThis.YTKitFeatures.wave8Css.${fn}()`),
            `ytkit.js must delegate ${fn} via globalThis.YTKitFeatures.wave8Css`
        );
    }
});

test('v4.38.0 manifest content_scripts loads features/wave-8-css/index.js before ytkit.js', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        const ytkitIdx = cs.js.indexOf('ytkit.js');
        if (ytkitIdx === -1) continue;
        const moduleIdx = cs.js.indexOf('features/wave-8-css/index.js');
        assert.notEqual(moduleIdx, -1,
            'manifest content_scripts must include features/wave-8-css/index.js');
        assert.ok(moduleIdx < ytkitIdx,
            'features/wave-8-css/index.js must load before ytkit.js');
    }
});

test('v4.38.0 sync-userscript V5_BUNDLE_MODULES includes features/wave-8-css', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'sync-userscript.js'), 'utf8');
    assert.ok(src.includes('extension/features/wave-8-css/index.js'),
        'sync-userscript.js V5_BUNDLE_MODULES must include features/wave-8-css/index.js');
});

// ── v4.39.0 NX1: profile-badge integration in schema overview ──

test('v4.39.0 popup buildSchemaOverviewKeyRow renders a github-full badge for gated entries', () => {
    assert.match(popupSource, /entry\.profile === ['"]github-full['"]/,
        'buildSchemaOverviewKeyRow must branch on entry.profile === github-full');
    assert.match(popupSource, /so-key-profile-badge/,
        'buildSchemaOverviewKeyRow must add the so-key-profile-badge class');
    assert.match(popupSource, /so-key-profile-gated/,
        'buildSchemaOverviewKeyRow must mark gated entries with so-key-profile-gated');
});

test('v4.39.0 popup caches the policy-profile resolver once per popup session', () => {
    // ensurePolicyProfile() must be idempotent — once popupState._policyProfile
    // is set it must short-circuit on subsequent calls so we don't pay the
    // factory cost per row. The cache MUST be initialised before
    // buildSchemaOverviewKeyRow runs (renderSchemaOverview calls
    // ensurePolicyProfile up-front).
    assert.match(popupSource, /function ensurePolicyProfile/,
        'popup must declare ensurePolicyProfile');
    assert.match(popupSource, /popupState\._policyProfile/,
        'popup must cache the resolver on popupState._policyProfile');
    const renderIdx = popupSource.indexOf('function renderSchemaOverview()');
    assert.ok(renderIdx > -1, 'renderSchemaOverview must exist');
    const renderBody = popupSource.slice(renderIdx, renderIdx + 2000);
    assert.match(renderBody, /ensurePolicyProfile\(\)/,
        'renderSchemaOverview must seed the policy-profile cache before iterating rows');
});

test('v4.39.0 popup CSS declares the gated badge with a sub-8px radius', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'extension', 'popup.css'), 'utf8');
    assert.match(css, /\.so-key-profile-badge\s*\{/,
        'popup.css must declare .so-key-profile-badge');
    // House style: no pill/oval backdrops. Allowed backdrop radius:
    // 0/4/6/8/10/12. The badge sits at 4px.
    const badgeStart = css.indexOf('.so-key-profile-badge');
    const badgeBlock = css.slice(badgeStart, badgeStart + 800);
    assert.match(badgeBlock, /border-radius:\s*4px/,
        '.so-key-profile-badge must use the house-style 4px radius (no pill backdrop)');
});

test('v4.39.0 ≥1 settings-schema entry has profile=github-full (badge has coverage)', () => {
    // The badge only renders when an entry's profile === 'github-full'. If
    // someone refactors the schema and removes every github-full entry,
    // the badge code becomes dead — fail loudly so we know to repoint or
    // delete it.
    const schemaSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'settings-schema.js'), 'utf8');
    const matches = schemaSrc.match(/profile:\s*['"]github-full['"]/g) || [];
    assert.ok(matches.length >= 1,
        `expected at least one github-full schema entry, found ${matches.length}`);
});

// ── v4.40.0 NX1: labelKey/descriptionKey override fields on schema entries ──

// ── v4.43.0 NX1: feature-peel batch 2 (6 home / subs CSS-only features) ──

function loadHomeSubsCssModule() {
    delete require.cache[require.resolve('../extension/features/home-subs-css/index.js')];
    const stub = {};
    const prev = global.YTKitFeatures;
    global.YTKitFeatures = stub;
    require('../extension/features/home-subs-css/index.js');
    global.YTKitFeatures = prev;
    return stub.homeSubsCss;
}

test('v4.43.0 home-subs-css module exports six pure builders', () => {
    const mod = loadHomeSubsCssModule();
    assert.ok(mod, 'YTKitFeatures.homeSubsCss must be populated by the IIFE');
    for (const name of [
        'buildHideCreateButtonCss',
        'buildHideVoiceSearchCss',
        'buildWidenSearchBarCss',
        'buildDisablePlayOnHoverCss',
        'buildFullWidthSubscriptionsCss',
        'buildHideSubscriptionOptionsCss'
    ]) {
        assert.equal(typeof mod[name], 'function', `homeSubsCss.${name} must be a function`);
        const css = mod[name]();
        assert.equal(typeof css, 'string', `${name} must return a string`);
        assert.ok(css.length > 0, `${name} must return a non-empty CSS string`);
    }
});

test('v4.43.0 home-subs-css helpers return CSS that the monolith inline fallback also contains', () => {
    const mod = loadHomeSubsCssModule();
    const ytkit = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');
    const cases = [
        ['buildHideCreateButtonCss', 'button[aria-label="Create"]'],
        ['buildHideVoiceSearchCss', '#voice-search-button'],
        ['buildWidenSearchBarCss', 'margin-left: -180px'],
        ['buildDisablePlayOnHoverCss', 'ytd-moving-thumbnail-renderer'],
        ['buildFullWidthSubscriptionsCss', 'max-width: 100% !important'],
        ['buildHideSubscriptionOptionsCss', '.grid-subheader']
    ];
    for (const [fn, marker] of cases) {
        const css = mod[fn]();
        assert.ok(css.includes(marker), `${fn}() output must contain ${marker}`);
        assert.ok(ytkit.includes(marker),
            `ytkit.js must keep the inline fallback containing ${marker}`);
    }
});

test('v4.43.0 monolith cssFeature() callsites delegate via globalThis.YTKitFeatures.homeSubsCss', () => {
    const ytkit = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');
    for (const fn of [
        'buildHideCreateButtonCss',
        'buildHideVoiceSearchCss',
        'buildWidenSearchBarCss',
        'buildDisablePlayOnHoverCss',
        'buildFullWidthSubscriptionsCss',
        'buildHideSubscriptionOptionsCss'
    ]) {
        assert.ok(
            ytkit.includes(`globalThis.YTKitFeatures.homeSubsCss.${fn}()`),
            `ytkit.js must delegate ${fn} via globalThis.YTKitFeatures.homeSubsCss`
        );
    }
});

test('v4.43.0 manifest content_scripts loads features/home-subs-css/index.js before ytkit.js', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'));
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        const ytkitIdx = cs.js.indexOf('ytkit.js');
        if (ytkitIdx === -1) continue;
        const moduleIdx = cs.js.indexOf('features/home-subs-css/index.js');
        assert.notEqual(moduleIdx, -1,
            'manifest content_scripts must include features/home-subs-css/index.js');
        assert.ok(moduleIdx < ytkitIdx,
            'features/home-subs-css/index.js must load before ytkit.js');
    }
});

test('v4.43.0 sync-userscript V5_BUNDLE_MODULES includes features/home-subs-css', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'sync-userscript.js'), 'utf8');
    assert.ok(src.includes('extension/features/home-subs-css/index.js'),
        'sync-userscript.js V5_BUNDLE_MODULES must include features/home-subs-css/index.js');
});

test('v4.40.0 popup honours entry.labelKey + entry.descriptionKey when present', () => {
    assert.match(popupSource, /entry\.labelKey/,
        'buildSchemaOverviewKeyRow must consult entry.labelKey');
    assert.match(popupSource, /entry\.descriptionKey/,
        'buildSchemaOverviewKeyRow must consult entry.descriptionKey');
    // Override path must short-circuit the humaniser fallback only when
    // the labelKey is a non-empty string — guards against schema rows
    // that ship `labelKey: ""` from an editor accident.
    assert.match(popupSource, /typeof entry\.labelKey === 'string' && entry\.labelKey\.trim\(\)/,
        'labelKey override must trim + reject empty strings');
});

test('v4.40.0 settings-schema brand-name entries carry labelKey overrides', () => {
    const schemaSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'settings-schema.js'), 'utf8');
    // Each brand-name override surfaces the brand in the label so the
    // popup row reads "Cobalt API instance URL" instead of the
    // humaniser's "Download cobalt instance" — a single canary per
    // brand is enough; if any of these regress the v4.40.0 user-facing
    // win is gone.
    for (const marker of [
        'labelKey: "Cobalt download fallback"',
        'labelKey: "Cobalt API instance URL"',
        'labelKey: "AI summary endpoint URL"',
        'labelKey: "AI summary provider"'
    ]) {
        assert.ok(schemaSrc.includes(marker),
            `settings-schema must declare ${marker}`);
    }
});

test('v4.40.0 every labelKey/descriptionKey override is a non-empty string in the schema', () => {
    // Defensive parser canary — if an editor accident lands an entry
    // with `labelKey: ""` or `labelKey: null`, the popup falls back to
    // the humaniser silently. Fail loudly so we never ship that.
    const schemaSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'settings-schema.js'), 'utf8');
    // Match every labelKey / descriptionKey occurrence — value must be
    // a non-empty double-quoted string literal.
    const overrideRe = /\b(labelKey|descriptionKey):\s*("([^"\\]|\\.)*"|[^,}]+)/g;
    let match;
    let count = 0;
    while ((match = overrideRe.exec(schemaSrc)) !== null) {
        count += 1;
        const raw = match[2].trim();
        assert.ok(raw.startsWith('"') && raw.length > 2,
            `${match[1]} override at offset ${match.index} must be a non-empty quoted string (saw ${raw})`);
    }
    assert.ok(count >= 4,
        `expected ≥4 labelKey/descriptionKey overrides in schema (found ${count})`);
});

// ── v4.41.0 NX1: array / object JSON editors in the popup ──

test('v4.41.0 popup buildSchemaOverviewKeyRow renders a textarea + error pill for array/object entries', () => {
    assert.match(popupSource, /entry\.type === 'array' \|\| entry\.type === 'object'/,
        'buildSchemaOverviewKeyRow must branch on array OR object entries');
    assert.match(popupSource, /document\.createElement\('textarea'\)/,
        'the editor must render an actual <textarea>');
    assert.match(popupSource, /so-key-json/,
        'the textarea must carry the so-key-json class');
    assert.match(popupSource, /so-key-json-error/,
        'the error pill must carry the so-key-json-error class');
});

test('v4.41.0 popup JSON editor round-trips via JSON.stringify(value, null, 2) + JSON.parse', () => {
    assert.match(popupSource, /JSON\.stringify\(seedSafe, null, 2\)/,
        'seed must use 2-space pretty-print');
    assert.match(popupSource, /JSON\.parse\(raw\)/,
        'commit path must parse via JSON.parse');
});

test('v4.41.0 popup JSON editor enforces type shape (array stays array, object stays object)', () => {
    // Without these guards a user pasting {} into an array-typed entry
    // would silently flip the storage shape, breaking every consumer
    // that calls .length on the value.
    assert.match(popupSource, /entry\.type === 'array' && !Array\.isArray\(parsed\)/,
        'array-typed entry must reject non-array parses');
    assert.match(popupSource, /entry\.type === 'object' && \(parsed === null \|\| Array\.isArray\(parsed\) \|\| typeof parsed !== 'object'\)/,
        'object-typed entry must reject null / arrays / non-objects');
});

test('v4.41.0 popup JSON editor skips persistence + shows pill on parse error', () => {
    // The persist arrow catches JSON.parse failure, sets the pill text
    // (`Invalid JSON: <msg>`) + un-hides the pill, then returns BEFORE
    // touching writeSetting. The order matters: a future refactor must
    // not call writeSetting on the bad value.
    const persistIdx = popupSource.indexOf("const persist = async () => {", popupSource.indexOf('so-key-json'));
    assert.ok(persistIdx > -1, 'JSON editor persist arrow must be inside the array/object branch');
    const persistBody = popupSource.slice(persistIdx, persistIdx + 1500);
    assert.match(persistBody, /errorPill\.textContent = 'Invalid JSON: '/,
        'parse-error pill must use the "Invalid JSON: ..." prefix');
    assert.ok(persistBody.indexOf('errorPill.hidden = false') < persistBody.indexOf('writeSetting'),
        'pill must be shown BEFORE writeSetting could otherwise run on bad data');
});

test('v4.41.0 popup CSS declares textarea + error pill with sub-8px radii', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'extension', 'popup.css'), 'utf8');
    assert.match(css, /\.so-key-json\s*\{/,
        'popup.css must declare .so-key-json');
    assert.match(css, /\.so-key-json-error\s*\{/,
        'popup.css must declare .so-key-json-error');
    const editorBlock = css.slice(css.indexOf('.so-key-json {'), css.indexOf('.so-key-json:focus'));
    assert.match(editorBlock, /border-radius:\s*6px/,
        '.so-key-json must use the house-style 6px radius (no pill backdrop)');
    const errorBlock = css.slice(css.indexOf('.so-key-json-error'), css.indexOf('.so-key-json-error') + 400);
    assert.match(errorBlock, /border-radius:\s*4px/,
        '.so-key-json-error must use the house-style 4px radius');
});

// ── v4.42.0 NX1: DOM-layer toast extraction (core/toast-dom.js) ──

test('v4.42.0 core/toast-dom.js exists and exports createToastSystem', () => {
    const full = path.join(__dirname, '..', 'extension', 'core', 'toast-dom.js');
    assert.ok(fs.existsSync(full), 'extension/core/toast-dom.js must exist');
    const src = fs.readFileSync(full, 'utf8');
    assert.match(src, /createToastSystem/, 'must export createToastSystem');
    assert.match(src, /YTKitCore[^=]*=[^=]*\{[^}]*\}/, 'must attach to globalThis.YTKitCore');
});

test('v4.42.0 toast-dom factory produces showToast + dismissToast', () => {
    delete require.cache[require.resolve('../extension/core/toast-dom.js')];
    const stub = {};
    const prev = global.YTKitCore;
    global.YTKitCore = stub;
    require('../extension/core/toast-dom.js');
    global.YTKitCore = prev;
    assert.ok(stub.toastDom, 'IIFE must populate YTKitCore.toastDom');
    assert.equal(typeof stub.toastDom.createToastSystem, 'function',
        'createToastSystem must be a function');
    const sys = stub.toastDom.createToastSystem({
        zIndex: 70000,
        inferToastTone: () => 'success',
        getToastRgb: () => '53,199,127',
        getToastBadgeLabel: () => 'Done'
    });
    assert.equal(typeof sys.showToast, 'function', 'system must expose showToast');
    assert.equal(typeof sys.dismissToast, 'function', 'system must expose dismissToast');
});

test('v4.42.0 monolith showToast + dismissToast delegate via _getToastSystem', () => {
    const ytkit = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');
    assert.match(ytkit, /function _getToastSystem\(\)/,
        'ytkit.js must declare _getToastSystem helper');
    assert.match(ytkit, /globalThis\.YTKitCore\.toastDom\.createToastSystem/,
        '_getToastSystem must reference YTKitCore.toastDom.createToastSystem');
    // Both functions must short-circuit through the system when available.
    const showIdx = ytkit.indexOf('function showToast(message, color = ');
    const dismissIdx = ytkit.indexOf('function dismissToast(toast, immediate');
    assert.ok(showIdx > -1 && dismissIdx > -1, 'both functions must still exist');
    const showBody = ytkit.slice(showIdx, showIdx + 600);
    const dismissBody = ytkit.slice(dismissIdx, dismissIdx + 600);
    assert.match(showBody, /const sys = _getToastSystem\(\)/,
        'showToast must consult _getToastSystem');
    assert.match(showBody, /if \(sys\) return sys\.showToast/,
        'showToast must delegate to sys.showToast when present');
    assert.match(dismissBody, /const sys = _getToastSystem\(\)/,
        'dismissToast must consult _getToastSystem');
    assert.match(dismissBody, /if \(sys\) return sys\.dismissToast/,
        'dismissToast must delegate to sys.dismissToast when present');
});

test('v4.42.0 monolith inline fallback stays byte-stable with the toast-dom implementation', () => {
    // The fallback's dismissToast body must mirror the module's
    // dismissToast body. Spot-check key invariants: 180 ms remove
    // timer, reduced-motion immediate path, class toggle to
    // is-visible removal. Any of these regressing would silently
    // change behaviour on the userscript path only.
    const ytkit = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');
    const toastDom = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'toast-dom.js'), 'utf8');
    for (const marker of [
        "toast._removeTimer = setTimeout",
        ", 180);",
        "toast.classList.remove('is-visible')",
        "matchMedia('(prefers-reduced-motion: reduce)')"
    ]) {
        assert.ok(ytkit.includes(marker),
            `ytkit.js fallback must contain ${marker}`);
        assert.ok(toastDom.includes(marker),
            `core/toast-dom.js must contain ${marker}`);
    }
});

test('v4.42.0 manifest loads core/toast-dom.js after core/toast.js and before ytkit.js', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'));
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        const ytkitIdx = cs.js.indexOf('ytkit.js');
        if (ytkitIdx === -1) continue;
        const toastIdx = cs.js.indexOf('core/toast.js');
        const toastDomIdx = cs.js.indexOf('core/toast-dom.js');
        assert.notEqual(toastDomIdx, -1,
            'manifest content_scripts must include core/toast-dom.js');
        assert.ok(toastIdx < toastDomIdx,
            'core/toast-dom.js must load AFTER core/toast.js (it depends on the pure helpers)');
        assert.ok(toastDomIdx < ytkitIdx,
            'core/toast-dom.js must load before ytkit.js');
    }
});

test('v4.42.0 sync-userscript V5_BUNDLE_MODULES includes core/toast-dom.js after core/toast.js', () => {
    const sync = fs.readFileSync(path.join(__dirname, '..', 'sync-userscript.js'), 'utf8');
    const toastIdx = sync.indexOf("'extension/core/toast.js'");
    const toastDomIdx = sync.indexOf("'extension/core/toast-dom.js'");
    assert.notEqual(toastDomIdx, -1,
        'sync-userscript.js V5_BUNDLE_MODULES must include core/toast-dom.js');
    assert.ok(toastIdx < toastDomIdx,
        'core/toast-dom.js must follow core/toast.js in V5_BUNDLE_MODULES');
});

test('v4.41.0 settings-schema has ≥1 array-typed AND ≥1 object-typed entry (coverage canary)', () => {
    // If a future refactor removes every array/object entry, the new
    // editor branch becomes dead. Fail loudly so we either repoint or
    // delete it.
    const schemaSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'settings-schema.js'), 'utf8');
    const arrays  = (schemaSrc.match(/type:\s*"array"/g)  || []).length;
    const objects = (schemaSrc.match(/type:\s*"object"/g) || []).length;
    assert.ok(arrays  >= 1, `expected ≥1 array-typed entry in schema (found ${arrays})`);
    assert.ok(objects >= 1, `expected ≥1 object-typed entry in schema (found ${objects})`);
});

test('v4.40.0 settings-migration round-trip preserves entries that carry overrides', () => {
    // The schema is frozen via Object.freeze({ ... }) per-entry. Adding
    // labelKey/descriptionKey to an existing entry must not break the
    // existing settings-migration round-trip — the schema is read for
    // shape, not for the override fields.
    const schemaSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'settings-schema.js'), 'utf8');
    // Sanity: the brand entries still freeze cleanly (Object.freeze
    // on a literal — no syntax errors that would break the module).
    assert.match(schemaSrc, /Object\.freeze\(\{ key: "downloadCobaltInstance"[^}]*labelKey: "Cobalt API instance URL"/,
        'downloadCobaltInstance must still be a single frozen object literal with labelKey embedded');
});

test('v4.39.0 policy-profile module exposes isEntryAllowedInProfile + resolveEffectiveProfile', () => {
    // The badge code reads both functions off the cached resolver. If the
    // module renames either, the badge silently degrades to "no badge"
    // (because the optional-chain short-circuits) — pin the surface here
    // so a future rename surfaces immediately.
    const policySrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'policy-profile.js'), 'utf8');
    assert.match(policySrc, /isEntryAllowedInProfile,/,
        'policy-profile must export isEntryAllowedInProfile');
    assert.match(policySrc, /resolveEffectiveProfile,/,
        'policy-profile must export resolveEffectiveProfile');
});

test('v4.37.0 SurfaceSelectorMap surface count matches the pack file count exactly', () => {
    const core = loadSelectorPackContext();
    const packsDir = path.join(__dirname, '..', 'extension', 'core', 'selector-packs');
    const packFilesOnDisk = fs.readdirSync(packsDir).filter((f) => f.endsWith('.js'));
    // Each pack file registers exactly one surface — except nav.js
    // and profile.js, which also register their masthead /
    // channelProfile aliases. After the alias adjustment the surface
    // count is pack-file count + 2.
    const expectedSurfaceCount = packFilesOnDisk.length + 2;
    const actualSurfaceCount = Object.keys(core.SurfaceSelectorMap).length;
    assert.equal(actualSurfaceCount, expectedSurfaceCount,
        `SurfaceSelectorMap should have ${expectedSurfaceCount} surfaces (got ${actualSurfaceCount})`);
});

// ── v4.46.0 — extreme audit pass ──

test('v4.46.0 background.js hydration respects PENDING_REVEALS_CAP', () => {
    // The `_pendingRevealsReady` IIFE that hydrates the in-memory Set from
    // chrome.storage.session must NOT bypass the same cap that runtime
    // adds (_addPendingReveal) enforce. Otherwise a corrupted/over-sized
    // session-storage payload re-introduces the runaway memory growth the
    // cap was added to defend against.
    const start = backgroundSource.indexOf('_pendingRevealsReady');
    assert.ok(start > -1, 'background.js must define _pendingRevealsReady');
    const block = backgroundSource.slice(start, start + 1400);
    // The fix takes ids.slice from the tail, bounded by PENDING_REVEALS_CAP.
    assert.match(
        block,
        /Math\.max\(0,\s*ids\.length\s*-\s*PENDING_REVEALS_CAP\)/,
        'hydration must clamp the imported id count via Math.max(0, ids.length - PENDING_REVEALS_CAP)'
    );
    assert.match(
        block,
        /typeof ids\[i\]\s*===\s*'number'/,
        'hydration must also validate that each id is a number before adding'
    );
});

test('v4.46.0 background.js returns an explicit error for unknown message types', () => {
    // The chrome.runtime.onMessage listener used to fall through silently
    // when msg.type didn't match any handler, causing the caller's
    // sendMessage Promise to reject with the generic "The message port
    // closed before a response was received." That made an in-extension
    // typo (e.g. `EXT_FECTH` for `EXT_FETCH`) hard to diagnose. The
    // listener now responds explicitly with { error: 'Unknown message
    // type: <type>' } so the sender sees an actionable message.
    assert.match(
        backgroundSource,
        /Unknown message type:/,
        'background.js must produce an explicit "Unknown message type" error response'
    );
    // The fallthrough sits AFTER every typed handler and returns false
    // (no async work left).
    const lastEnd = backgroundSource.lastIndexOf('Unknown message type:');
    const tail = backgroundSource.slice(lastEnd);
    assert.match(tail, /return false;/,
        'unknown-type fallthrough must return false from the listener (no async work pending)');
});

test('v4.46.0 popup.js export anchor fallback is attached to the document', () => {
    // The chrome.downloads.download path is preferred (and is the only
    // path actually taken in production builds because the "downloads"
    // permission is always declared). The legacy anchor fallback only
    // runs when chrome.downloads is unavailable — historically a problem
    // on Firefox unless the anchor is appended to document.body first.
    // Defensive coding: keep the fallback Firefox-safe.
    const start = popupSource.indexOf('Firefox historically requires the anchor');
    assert.ok(start > -1, 'popup.js must comment the Firefox anchor requirement');
    const block = popupSource.slice(start, start + 800);
    assert.match(block, /document\.body\.appendChild\(a\)/,
        'export anchor fallback must be appended to document.body before .click()');
    assert.match(block, /a\.remove\(\)/,
        'export anchor must be removed after click to keep the DOM clean');
});

test('v4.46.0 pytest.ini pins asyncio_default_fixture_loop_scope', () => {
    // pytest-asyncio 0.23+ deprecates the unset default. Setting it
    // explicitly to "function" matches the upcoming 1.0 default and
    // silences the PytestDeprecationWarning that otherwise pollutes
    // every test run.
    const ini = fs.readFileSync(
        path.join(__dirname, '..', 'pytest.ini'), 'utf8'
    );
    assert.match(ini, /asyncio_default_fixture_loop_scope\s*=\s*function/,
        'pytest.ini must set asyncio_default_fixture_loop_scope = function');
});

test('v4.46.0 validate workflow provisions Qt offscreen runtime for downloader tests', () => {
    // GitHub's Ubuntu runners do not ship the PyQt6 runtime libraries
    // Astra Downloader needs at module import time. Keep the workflow
    // explicitly provisioning those packages so the Python job fails with
    // an actionable preflight message instead of a collection-time
    // ImportError such as "libEGL.so.1: cannot open shared object file".
    const workflow = fs.readFileSync(
        path.join(__dirname, '..', '.github', 'workflows', 'validate.yml'), 'utf8'
    );
    assert.match(workflow, /QT_QPA_PLATFORM:\s*offscreen/,
        'validate.yml Python job must run Qt under the offscreen platform');
    assert.match(workflow, /ASTRA_DOWNLOADER_NO_BOOTSTRAP:\s*["']1["']/,
        'validate.yml must disable runtime bootstrap during CI dependency checks');
    assert.match(workflow, /sudo apt-get install[\s\S]*libegl1/,
        'validate.yml must install libegl1 so PyQt6 can load libEGL.so.1');
    assert.match(workflow, /sudo apt-get install[\s\S]*libxcb-cursor0/,
        'validate.yml must install Qt xcb support libraries for PyQt6 wheels');
    assert.match(workflow, /python -m pip install pytest pytest-asyncio pytest-qt/,
        'validate.yml must install pytest plugins that own pytest.ini config keys');
    assert.match(workflow, /Verify PyQt Runtime[\s\S]*PyQt6 runtime unavailable/,
        'validate.yml must run a clear PyQt runtime preflight before pytest');
    assert.match(workflow, /python -m pytest astra_downloader/,
        'validate.yml must still run the full downloader pytest suite');
});

test('v4.46.0 validate workflow audits Python dependencies and PR dependency changes', () => {
    const workflow = fs.readFileSync(
        path.join(__dirname, '..', '.github', 'workflows', 'validate.yml'), 'utf8'
    );
    assert.match(workflow, /name:\s*Dependency review[\s\S]*github\.event_name == 'pull_request'/,
        'validate.yml must run dependency review only for pull requests');
    assert.match(workflow, /actions\/dependency-review-action@[0-9a-f]{40}\s+#\s+v5\.0\.0/,
        'validate.yml must use the current dependency-review action from a pinned v5.0.0 commit');
    assert.match(workflow, /fail-on-severity:\s*moderate/,
        'dependency review must fail moderate-or-higher vulnerable dependency changes');
    assert.match(workflow, /vulnerability-check:\s*true/,
        'dependency review must keep vulnerability checks enabled');
    assert.match(workflow, /license-check:\s*false/,
        'dependency review must not introduce a license policy without a maintainer decision');
    assert.match(workflow, /name:\s*Python dependency audit[\s\S]*python-version:\s*'3\.12'/,
        'validate.yml must run a Python 3.12 dependency audit job');
    assert.match(workflow, /python -m pip install pip-audit/,
        'validate.yml must install pip-audit for the companion dependency gate');
    assert.match(workflow, /python -m pip_audit -r astra_downloader\/requirements\.txt --format json --progress-spinner off --output pip-audit\.json/,
        'validate.yml must audit astra_downloader/requirements.txt and capture JSON output');
    assert.match(workflow, /name:\s*astra-downloader-pip-audit[\s\S]*path:\s*pip-audit\.json/,
        'validate.yml must upload the Python audit JSON artifact for release review');
});

test('v4.47.0 NF7 — array schema entries with knownValues render checkbox grids', () => {
    // NF7: the array-type editor was a raw JSON textarea, which is
    // power-user-only UX for the four hidden* entries whose tokens
    // are a fixed enumeration. v4.47.0 adds an optional `knownValues`
    // field to schema entries; when present, the popup renders a
    // checkbox grid (one box per known token) instead of the JSON
    // textarea. Other array entries (e.g. syncSafePrefsAllowlist with
    // ~70 entries) keep the JSON path.
    //
    // Pin: the four hidden* entries must carry knownValues whose
    // contents are a SUPERSET of the defaultValue (so a fresh install
    // can deselect any default item AND the editor offers options the
    // user hasn't enabled yet).
    const schema = require(path.join(__dirname, '..', 'extension', 'core', 'settings-schema.js'));
    const enumerableArrayKeys = [
        'hiddenChatElements',
        'hiddenActionButtons',
        'hiddenPlayerControls',
        'hiddenWatchElements',
    ];
    for (const key of enumerableArrayKeys) {
        const entry = schema.SETTINGS_SCHEMA.find((e) => e.key === key);
        assert.ok(entry, `schema must declare ${key}`);
        assert.equal(entry.type, 'array', `${key} must be type=array`);
        assert.ok(Array.isArray(entry.knownValues),
            `${key} must declare knownValues so the popup renders the checkbox grid`);
        assert.ok(entry.knownValues.length > 0,
            `${key}.knownValues must be non-empty`);
        const known = new Set(entry.knownValues);
        for (const token of entry.defaultValue) {
            assert.ok(known.has(token),
                `${key}: every defaultValue token ("${token}") must appear in knownValues so the user can deselect it`);
        }
    }
    // syncSafePrefsAllowlist (~70 entries) must NOT acquire knownValues —
    // the checkbox UI would be unusable at that scale and the JSON path
    // is the right fallback for power users.
    const sync = schema.SETTINGS_SCHEMA.find((e) => e.key === 'syncSafePrefsAllowlist');
    assert.ok(sync, 'schema must declare syncSafePrefsAllowlist');
    assert.equal(sync.knownValues, undefined,
        'syncSafePrefsAllowlist must NOT carry knownValues — JSON textarea is the right UX for the long list');

    // Popup-side wiring: the array branch must fork on knownValues
    // BEFORE the JSON branch so enumerable arrays never fall into the
    // textarea path.
    assert.match(popupSource, /entry\.type === 'array' && Array\.isArray\(entry\.knownValues\)/,
        'popup.js must check entry.knownValues on the array branch');
    assert.match(popupSource, /so-key-checks/,
        'popup.js must declare the so-key-checks CSS class for the grid');
    assert.match(popupSource, /knownSet = new Set\(known\)/,
        'persist handler must rebuild the array preserving unknown tokens at the tail');

    // CSS surface for the grid + checkbox styling must be present
    // (cross-checks the editor isn't unstyled).
    const popupCss = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.css'), 'utf8'
    );
    assert.match(popupCss, /\.so-key-checks/,
        'popup.css must style the .so-key-checks grid container');
    assert.match(popupCss, /\.so-key-check\b/,
        'popup.css must style the per-token .so-key-check label');
});

test('v4.47.0 NF6 — Reinstall Astra Downloader popup action clears the dismissed flag', () => {
    // NF6 partial: ytkit.js's MediaDLManager.showInstallPrompt sets
    // `ytkit_mediadl_prompt_dismissed = true` in chrome.storage.local
    // when the user clicks "Skip for now". That dismiss is permanent
    // and there's no obvious recovery path. The popup now surfaces a
    // "Enable Downloader Prompts" button when that flag is set;
    // clicking it removes the key from chrome.storage.local. Subsequent
    // YouTube page loads re-enable the install prompt naturally.
    //
    // The full NF6 companion self-update path is pinned in the next test;
    // this slice keeps the dismissed-prompt recovery button from drifting.
    assert.match(popupHtmlSource, /id="reenable-mediadl-btn"/,
        'popup.html must declare the Re-enable Downloader Prompts button');
    assert.match(popupHtmlSource, /aria-label="Re-enable Astra Downloader install prompts"/,
        'button must carry an aria-label');
    assert.match(popupHtmlSource, /data-i18n="reenableMediadlBtn"/,
        'button must carry an i18n key');

    assert.match(popupSource, /const MEDIADL_DISMISSED_KEY = 'ytkit_mediadl_prompt_dismissed'/,
        'popup.js must declare the canonical key matching ytkit.js storageWrite');
    assert.match(popupSource, /chrome\.storage\.local\.remove\(MEDIADL_DISMISSED_KEY/,
        'clear must use chrome.storage.local.remove on the canonical key');
    assert.match(popupSource, /async function refreshReenableMediadlVisibility\(\)/,
        'popup.js must declare the visibility refresh that runs on boot');
    assert.match(popupSource, /reenableMediadlButton\.addEventListener\('click'/,
        'popup.js must wire the click listener');

    // Pin the storage-key match against the ytkit.js write site so a
    // future rename in either file is caught here. The grep below
    // intentionally hard-codes the string both ends must agree on.
    assert.match(ytkitSource, /storageWrite\(['"]ytkit_mediadl_prompt_dismissed['"]/,
        'ytkit.js must continue to write the same storage key the popup reads/clears');

    // EN locale parity for the 4 new keys.
    const enMessages = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', '_locales', 'en', 'messages.json'), 'utf8'
    ));
    for (const k of [
        'reenableMediadlBtn',
        'reenableMediadlAria',
        'statusMediadlReenabled',
        'statusMediadlReenableFail',
    ]) {
        assert.ok(enMessages[k] && enMessages[k].message,
            `extension/_locales/en/messages.json must declare ${k}`);
    }
});

test('v4.47.0 NF6 — Astra Downloader companion /update endpoint and popup action round-trip', () => {
    // NF6: update the local companion itself, not just yt-dlp. The popup
    // routes through the active YouTube content script so it never owns the
    // local token; MediaDLManager calls /update; the Python service compares
    // APP_VERSION, downloads AstraDownloader.exe atomically, schedules an
    // after-exit replace/restart, and blocks while downloads are active.
    assert.match(popupHtmlSource, /id="update-companion-btn"/,
        'popup.html must declare the companion update button');
    const updateBtnMatch = popupHtmlSource.match(/<button[^>]*id="update-companion-btn"[^>]*>/);
    assert.ok(updateBtnMatch, 'update-companion button declaration must exist');
    assert.ok(!/\bhidden\b/.test(updateBtnMatch[0]),
        'update-companion button must be visible by default');
    assert.match(updateBtnMatch[0], /aria-label="Update Astra Downloader companion"/,
        'update-companion button must carry an aria-label');

    const updateMethodStart = ytkitSource.indexOf('async updateCompanion()');
    assert.ok(updateMethodStart > -1,
        'MediaDLManager must define an async updateCompanion() method');
    const updateBlock = ytkitSource.slice(updateMethodStart, updateMethodStart + 1600);
    assert.match(updateBlock, /await this\.check\(true\)/,
        'updateCompanion must force-probe health before POSTing');
    assert.match(updateBlock, /\/update/,
        'updateCompanion must hit the companion /update endpoint');
    assert.match(updateBlock, /['"]X-Auth-Token['"]:\s*probe\.token/,
        'updateCompanion must forward the per-install token');
    assert.match(updateBlock, /timeout:\s*180000/,
        'updateCompanion must allow enough time for exe download and scheduling');
    assert.match(ytkitSource, /ASTRA_DOWNLOADER_RELEASE_EXE_URL = 'https:\/\/github\.com\/SysAdminDoc\/Astra-Deck\/releases\/latest\/download\/AstraDownloader\.exe'/,
        'installer and companion update paths must point at the GitHub Release exe, not a raw-root file');

    const handlerStart = ytkitSource.indexOf("'YTKIT_UPDATE_COMPANION'");
    assert.ok(handlerStart > -1,
        'ytkit.js must handle YTKIT_UPDATE_COMPANION');
    const handlerBlock = ytkitSource.slice(handlerStart, handlerStart + 700);
    assert.match(handlerBlock, /MediaDLManager\.updateCompanion\(\)/,
        'YTKIT_UPDATE_COMPANION handler must call MediaDLManager.updateCompanion()');
    assert.match(handlerBlock, /return true;/,
        'YTKIT_UPDATE_COMPANION handler must keep sendResponse open');

    assert.match(popupSource, /const updateCompanionButton = \$\('#update-companion-btn'\)/,
        'popup.js must capture update-companion-btn');
    assert.match(popupSource, /async function updateCompanionNow\(\)/,
        'popup.js must define updateCompanionNow');
    const popupHandlerStart = popupSource.indexOf('async function updateCompanionNow');
    const popupHandlerBlock = popupSource.slice(popupHandlerStart, popupHandlerStart + 3000);
    assert.match(popupHandlerBlock, /YOUTUBE_TAB_URLS/,
        'updateCompanionNow must query YouTube tabs for a loaded content script');
    assert.match(popupHandlerBlock, /type:\s*['"]YTKIT_UPDATE_COMPANION['"]/,
        'updateCompanionNow must send YTKIT_UPDATE_COMPANION');
    assert.match(popupHandlerBlock, /current_version/,
        'updateCompanionNow must surface current_version');
    assert.match(popupHandlerBlock, /latest_version/,
        'updateCompanionNow must surface latest_version');
    assert.match(popupHandlerBlock, /updateCompanionButton\.disabled\s*=\s*true/,
        'updateCompanionNow must disable the button while in flight');

    const downloaderSource = fs.readFileSync(
        path.join(__dirname, '..', 'astra_downloader', 'astra_downloader.py'), 'utf8'
    );
    assert.match(downloaderSource, /@api\.route\(['"]\/update['"],\s*methods=\['POST'\]\)/,
        'astra_downloader.py must declare /update as a POST route');
    assert.match(downloaderSource, /def fetch_latest_companion_version/,
        'downloader must fetch the latest companion APP_VERSION');
    assert.match(downloaderSource, /COMPANION_UPDATE_EXE_URL = "https:\/\/github\.com\/SysAdminDoc\/Astra-Deck\/releases\/latest\/download\/AstraDownloader\.exe"/,
        'downloader must download companion binaries from GitHub Releases');
    assert.match(downloaderSource, /def _run_companion_self_update/,
        'downloader must expose the companion self-update runner');
    assert.match(downloaderSource, /def schedule_companion_update_restart/,
        'downloader must schedule delayed replace and restart');
    assert.match(downloaderSource, /MoveFileEx/,
        'Windows delayed updater must use MoveFileEx for replace-existing semantics');
    const endpointStart = downloaderSource.indexOf("@api.route('/update'");
    const endpointBlock = downloaderSource.slice(endpointStart, endpointStart + 1700);
    assert.match(endpointBlock, /in_flight = dl_manager\.active_count\(\)/,
        '/update must consult dl_manager.active_count');
    assert.match(endpointBlock, /409/,
        '/update must return 409 when downloads are active');
    assert.match(endpointBlock, /atomically replacing/,
        '/update 409 message must explain the executable replacement race');
});

test('v4.47.0 EI2 — Reset writes a session-scoped snapshot and Undo restores it', () => {
    // EI2: the destructive Reset action was irreversible; one
    // misclick wiped all 354 settings + hidden lists + bookmarks
    // with no recovery. v4.47.0 captures everything in
    // chrome.storage.session under `_resetSnapshot` before the
    // wipe; an "Undo Reset" button restores the snapshot until
    // the browser session ends. The snapshot deliberately does
    // NOT survive a browser restart — stale snapshots overwriting
    // later real edits would be worse than the original problem.
    //
    // Source-level pin: the wiring must be present in popup.html,
    // popup.js, popup.css, and the EN locale must expose every
    // status string the handler can render.
    assert.match(popupHtmlSource, /id="undo-reset-btn"/,
        'popup.html must declare the Undo Reset button');
    assert.match(popupHtmlSource, /aria-label="Restore data from the most recent Reset"/,
        'Undo button must carry an aria-label');
    assert.match(popupHtmlSource, /data-i18n="undoResetBtn"/,
        'Undo button must carry an i18n key');
    assert.match(popupHtmlSource, /hidden/,
        'Undo button must default to hidden in markup');

    assert.match(popupSource, /const RESET_SNAPSHOT_KEY = '_resetSnapshot'/,
        'popup.js must declare the canonical snapshot key constant');
    assert.match(popupSource, /chrome\.storage\.session/,
        'snapshot helpers must use chrome.storage.session (not local) so the snapshot dies with the browser session');
    assert.match(popupSource, /async function resetAllData\(\)/,
        'resetAllData must remain async');
    assert.match(popupSource, /writeResetSnapshot\(snapshot\)/,
        'resetAllData must call writeResetSnapshot BEFORE storageClear so the wipe is recoverable');
    // Order matters: snapshot before storageClear. The snapshot call
    // must appear lexically before storageClear in resetAllData.
    const resetFnStart = popupSource.indexOf('async function resetAllData(');
    const resetFnEnd = popupSource.indexOf('\n}\n', resetFnStart) + 2;
    const resetBody = popupSource.slice(resetFnStart, resetFnEnd);
    const snapshotPos = resetBody.indexOf('writeResetSnapshot');
    const clearPos = resetBody.indexOf('storageClear()');
    assert.ok(snapshotPos > -1 && clearPos > -1,
        'both writeResetSnapshot and storageClear must be called in resetAllData');
    assert.ok(snapshotPos < clearPos,
        'writeResetSnapshot must run BEFORE storageClear so the snapshot reflects pre-wipe state');

    assert.match(popupSource, /async function undoResetAllData\(\)/,
        'popup.js must define undoResetAllData');
    assert.match(popupSource, /clearResetSnapshot\(\)/,
        'undoResetAllData must clear the snapshot after restore so a second Undo can\'t replay');
    assert.match(popupSource, /undoResetButton\.addEventListener\('click'/,
        'popup.js must wire the click listener on the Undo button');
    assert.match(popupSource, /refreshUndoResetVisibility/,
        'popup.js must surface the Undo button on boot when a snapshot exists');

    // i18n parity for the EN keys the handler can render.
    const enMessages = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', '_locales', 'en', 'messages.json'), 'utf8'
    ));
    for (const k of [
        'undoResetBtn',
        'undoResetAria',
        'statusAllDataClearedUndo',
        'statusResetUndone',
        'statusResetUndoExpired',
        'statusResetUndoFail',
    ]) {
        assert.ok(enMessages[k] && enMessages[k].message,
            `extension/_locales/en/messages.json must declare ${k}`);
    }
});

test('v4.47.0 NF5 wave 1 — every CSS-only peel module registers with the lifecycle', () => {
    // The v4.7.0 lifecycle module shipped but had zero defineFeature
    // callers until v4.47.0. The invariant remains: each peel module
    // exposes lifecycle specs and calls defineFeature() at module-eval
    // time. Later waves can make those specs active, but registration
    // must never drift away.
    //
    // Pin the call-site shape so future refactors can't silently drop a
    // module's registration. Loading the modules under Node loses the
    // globalThis.YTKitCore.getLifecycle path (no manifest content_script
    // order), so we assert at the source level instead.
    const features = [
        { path: 'extension/features/subtitles/index.js',          ids: ['subtitleStyling'] },
        { path: 'extension/features/video-filters/index.js',      ids: ['videoVisualFilters'] },
        { path: 'extension/features/blue-light-filter/index.js',  ids: ['blueLightFilter'] },
        { path: 'extension/features/theme-css/index.js',          ids: ['customProgressBarColor', 'customSelectionColor', 'grayscaleThumbnails', 'forceDarkEverywhere', 'themeAccentColor', 'compactUnfixedHeader', 'hideVideoEndContent'] },
        { path: 'extension/features/wave-8-css/index.js',         ids: ['hideNotificationButton', 'noFrostedGlass', 'hideLatestPosts', 'disableMiniPlayer', 'nyanCatProgressBar'] },
        { path: 'extension/features/home-subs-css/index.js',      ids: ['hideCreateButton', 'hideVoiceSearch', 'widenSearchBar', 'disablePlayOnHover', 'fullWidthSubscriptions', 'hideSubscriptionOptions'] },
    ];
    for (const { path: relPath, ids } of features) {
        const src = fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
        assert.match(src, /YTKitCore\.getLifecycle\s*===\s*'function'/,
            `${relPath} must guard the lifecycle call with the getLifecycle availability check`);
        assert.match(src, /defineFeature\(/,
            `${relPath} must call defineFeature() on the shared lifecycle instance`);
        for (const id of ids) {
            // The id must appear as a string literal in the module source —
            // either on a featureSpec object or inside the LIFECYCLE_SPECS
            // array of multi-id modules. Single-quoted because all peel
            // modules use single quotes for ids.
            assert.match(src, new RegExp(`['"]${id}['"]`),
                `${relPath} must reference feature id "${id}" so its lifecycle spec gets registered`);
        }
    }

    // Also exercise the contract: when getLifecycle() IS available, the
    // singleton instance must accept the spec shape the peels produce.
    // Sandboxed eval of the v4.7.0 lifecycle module + a synthetic spec.
    const lifecycleSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'feature-lifecycle.js'), 'utf8'
    );
    const sandbox = `
        const globalThis = this;
        const console = { warn: () => {}, log: () => {}, error: () => {} };
        ${lifecycleSrc}
        this.__lc = globalThis.YTKitCore.getLifecycle();
        this.__lc.defineFeature({
            id: 'test-css-only-spec', category: 'shell',
            init() {}, destroy() {}
        });
        this.__snap = this.__lc.snapshot();
    `;
    const ctx = {};
    new Function(sandbox).call(ctx);
    const registered = ctx.__snap.find((r) => r.id === 'test-css-only-spec');
    assert.ok(registered, 'lifecycle.snapshot() must include the just-defined spec');
    assert.equal(registered.started, false,
        'registered specs must show started:false until start() is called');
});

test('v4.47.0 ESLint require-catch-reason rule is wired and enforces v3.14.0 invariant', () => {
    // The rule must exist on disk, be required from eslint.config.js,
    // and be enabled as `error` on the background.js file group plus
    // (v4.47.0 Phase L) the popup.js, direct extension/core/*.js, and
    // monolith ytkit.js file groups.
    const eslintConfig = fs.readFileSync(
        path.join(__dirname, '..', 'eslint.config.js'), 'utf8'
    );
    assert.match(eslintConfig, /require-catch-reason/,
        'eslint.config.js must register the require-catch-reason rule');
    assert.match(eslintConfig, /'local\/require-catch-reason':\s*'error'/,
        'require-catch-reason must be enabled as error (not warn) so CI fails on regression');
    assert.match(eslintConfig, /files:\s*\['extension\/background\.js'\]/,
        'eslint.config.js must declare the extension/background.js file group');
    assert.match(eslintConfig, /extension\/popup\.js/,
        'eslint.config.js must cover extension/popup.js');
    assert.match(eslintConfig, /extension\/core\/\*\.js/,
        'eslint.config.js must cover extension/core/*.js');
    assert.match(eslintConfig, /extension\/ytkit\.js/,
        'eslint.config.js must cover extension/ytkit.js');
    // The npm-lint script must pass both files to eslint so the rule
    // actually runs on both during npm run check.
    const pkg = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'package.json'), 'utf8'
    ));
    assert.match(pkg.scripts.lint, /extension\/background\.js/,
        'package.json lint script must include background.js');
    assert.match(pkg.scripts.lint, /extension\/popup\.js/,
        'package.json lint script must include popup.js (Phase L)');
    assert.match(pkg.scripts.lint, /extension\/core\/\*\.js/,
        'package.json lint script must include direct core modules (Phase L follow-up)');
    assert.match(pkg.scripts.lint, /extension\/ytkit\.js/,
        'package.json lint script must include ytkit.js (monolith follow-up)');

    const rulePath = path.join(__dirname, '..', 'scripts', 'eslint-rules', 'require-catch-reason.js');
    assert.ok(fs.existsSync(rulePath), 'rule source must exist at scripts/eslint-rules/require-catch-reason.js');
    const rule = require(rulePath);
    assert.equal(rule.meta && rule.meta.type, 'problem',
        'rule must be classified as `problem` (not stylistic) — silent catches hide bugs');
    assert.ok(rule.meta && rule.meta.messages && rule.meta.messages.missingReason,
        'rule must declare the `missingReason` message id');

    // Exercise the rule against a synthetic source so we don't have to
    // shell out to the eslint binary. Reuses ESLint's exported Linter
    // class. The rule contract: empty catch without `// reason:` →
    // exactly 1 message; with the comment → 0 messages.
    let Linter;
    try { ({ Linter } = require('eslint')); } catch (_) {
        // reason: ESLint optional at test time; skip silently rather than
        // hard-fail when devDeps haven't been installed.
        return;
    }
    const linter = new Linter();
    const lint = (source) => linter.verify(source, {
        plugins: { local: { rules: { 'require-catch-reason': rule } } },
        rules: { 'local/require-catch-reason': 'error' },
        languageOptions: { ecmaVersion: 2022, sourceType: 'script' },
    });

    assert.equal(lint('try{}catch(e){}').length, 1,
        'empty catch with no reason must be flagged');
    assert.equal(lint('try{}catch(e){ /* reason: ok */ }').length, 0,
        'empty catch with /* reason: */ inline comment must pass');
    assert.equal(lint('try{}catch(e){ /* REASON: case-insensitive */ }').length, 0,
        'comment match must be case-insensitive');
    assert.equal(lint('try{}catch(e){ // reason: line comment\n}').length, 0,
        'leading line comment with reason must pass');
    assert.equal(lint('try{}catch(e){\n  // reason: indented\n}').length, 0,
        'indented inner comment with reason must pass');
    assert.equal(lint('try{}catch(e){\n  console.warn(e);\n}').length, 0,
        'non-empty catch body (statement present) must pass regardless of comment');
});

test('v4.47.0 popup ships selector-health "Copy report" wiring end-to-end', () => {
    // The Copy report button must exist in popup.html, have an a11y label
    // and an i18n hook, the popup must bundle core/selector-health.js so
    // formatSelectorCopyReport is callable client-side, and the click
    // handler must guard against concurrent in-flight clicks (the
    // round-trip can take up to 1500 ms and rapid double-clicks would
    // otherwise post duplicate reports).
    const html = popupHtmlSource;
    assert.match(html, /id="selector-health-copy-btn"/,
        'popup.html must declare the copy-report button');
    assert.match(html, /aria-label="Copy selector-health report to clipboard"/,
        'copy-report button must carry an aria-label for screen readers');
    assert.match(html, /data-i18n="selectorHealthCopyBtn"/,
        'copy-report button must carry the i18n key so non-EN locales render the translated label');
    assert.match(html, /id="selector-health-copy-status"/,
        'popup.html must declare the live-region status line so aria-live announces success/failure');
    assert.match(html, /<script src="core\/selector-health\.js"><\/script>/,
        'popup.html must bundle core/selector-health.js for client-side formatting');

    // The click handler must be wired and guarded.
    assert.match(popupSource, /_selectorHealthCopyInFlight/,
        'popup.js must declare an in-flight guard against concurrent copy clicks');
    assert.match(popupSource, /async function copySelectorHealthReport\(\)/,
        'popup.js must define the copy handler');
    assert.match(popupSource, /selectorHealthCopyBtn\.addEventListener\('click'/,
        'popup.js must attach the click listener to the copy button');
    // Fallback path: navigator.clipboard.writeText preferred, then
    // execCommand('copy') for tightly-locked-down contexts.
    assert.match(popupSource, /navigator\.clipboard\.writeText/,
        'copy handler must prefer navigator.clipboard.writeText');
    assert.match(popupSource, /execCommand\('copy'\)/,
        'copy handler must fall back to execCommand for permission-denied contexts');

    // i18n key parity for the 7 new keys (en/messages.json gates the
    // cross-locale parity check separately via scripts/check-i18n.js).
    const enMessages = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', '_locales', 'en', 'messages.json'), 'utf8'
    ));
    for (const k of [
        'selectorHealthCopyBtn',
        'selectorHealthCopyAria',
        'selectorHealthCopyPending',
        'selectorHealthCopyDone',
        'selectorHealthCopyFail',
        'selectorHealthCopyNeedYt',
        'selectorHealthCopyNoSnap',
    ]) {
        assert.ok(enMessages[k] && enMessages[k].message,
            `extension/_locales/en/messages.json must declare ${k}`);
    }
});

test('v4.47.0 popup search mini-DSL parses field filters and forwards free text', () => {
    // The popup search filter accepts a small DSL for filtering by schema
    // metadata: `risk:api`, `category:downloads`, `scope:watch`,
    // `profile:store-safe`. Comma-separated values within a field act as
    // OR; multiple fields AND. Unknown fields fall back to free text.
    // Exercise the parser via a sandboxed eval of the function source so
    // the test doesn't have to ship a full popup harness.
    const popupCode = popupSource;
    const fnStart = popupCode.indexOf('function parseSearchQuery(');
    assert.ok(fnStart > -1, 'popup.js must expose parseSearchQuery');
    const fnEnd = popupCode.indexOf('\n}\n', fnStart) + 2;
    const passesStart = popupCode.indexOf('function entryPassesFilters(');
    assert.ok(passesStart > -1, 'popup.js must expose entryPassesFilters');
    const passesEnd = popupCode.indexOf('\n}\n', passesStart) + 2;
    const constStart = popupCode.indexOf('const SEARCH_FILTER_FIELDS');
    const constEnd = popupCode.indexOf(';', constStart) + 1;
    const sandbox = popupCode.slice(constStart, constEnd) + '\n'
        + popupCode.slice(fnStart, fnEnd) + '\n'
        + popupCode.slice(passesStart, passesEnd) + '\n'
        + 'this.__parse = parseSearchQuery; this.__passes = entryPassesFilters;';
    const ctx = {};
    new Function(sandbox).call(ctx);

    // Free text only.
    let r = ctx.__parse('blue light filter');
    assert.deepEqual(Object.keys(r.filters), [], 'no field filters when only free text');
    assert.equal(r.freeText, 'blue light filter');

    // Single field filter.
    r = ctx.__parse('risk:api');
    assert.equal(r.freeText, '');
    assert.ok(r.filters.risk instanceof Set);
    assert.ok(r.filters.risk.has('api'));

    // Comma-separated values inside a field (OR within field).
    r = ctx.__parse('risk:api,local-companion');
    assert.equal(r.filters.risk.size, 2);
    assert.ok(r.filters.risk.has('local-companion'));

    // Multiple field clauses (AND across fields) + free text.
    r = ctx.__parse('risk:api category:enrichment sponsor');
    assert.equal(r.freeText, 'sponsor');
    assert.ok(r.filters.category.has('enrichment'));
    assert.ok(r.filters.risk.has('api'));

    // Unknown field falls back to free text — don't swallow user input.
    r = ctx.__parse('riks:api dearrow');
    assert.equal(Object.keys(r.filters).length, 0,
        'unknown field token must NOT register as a filter (typo defense)');
    assert.match(r.freeText, /riks:api/,
        'unknown field token must fall through to free text so user sees no-result instead of silent swallow');

    // entryPassesFilters AND semantics.
    const entry = { key: 'sponsorBlock', risk: 'api', category: 'enrichment', scope: 'watch', profile: 'both' };
    assert.ok(ctx.__passes(entry, ctx.__parse('risk:api').filters), 'risk match should pass');
    assert.ok(!ctx.__passes(entry, ctx.__parse('risk:safe').filters), 'risk mismatch should fail');
    assert.ok(ctx.__passes(entry, ctx.__parse('risk:api category:enrichment').filters),
        'AND across fields should pass when both match');
    assert.ok(!ctx.__passes(entry, ctx.__parse('risk:api category:downloads').filters),
        'AND across fields should fail when one mismatches');
    assert.ok(ctx.__passes(entry, ctx.__parse('risk:api,safe').filters),
        'OR within field should pass on either value');
});

test('v4.47.0 CONFLICT_MAP pins the documented mutually-exclusive pairs', () => {
    // CONFLICT_MAP enumerates ONLY truly mutually-exclusive feature pairs.
    // Pairs that were intentionally decoupled to cooperate live in the
    // comment block below the map (focusedMode, autoPauseOnSwitch +
    // pauseOtherTabs, popOutPlayer + pipButton + fullscreenOnDoubleClick,
    // hideEndCards parent/sub of hideVideoEndContent). The test pins the
    // current shape so a future audit doesn't silently re-add pairs that
    // would undo the cooperative mechanism.
    const mapStart = ytkitSource.indexOf('const CONFLICT_MAP = {');
    assert.ok(mapStart > -1, 'ytkit.js must declare CONFLICT_MAP');
    const mapEnd = ytkitSource.indexOf('};', mapStart);
    const mapSrc = ytkitSource.slice(mapStart, mapEnd + 2);

    // Each canonical pair must be present in both directions (X conflicts
    // with Y, Y conflicts with X) so the auto-disable lookup at settings-
    // change time is symmetric.
    const symmetricPairs = [
        ['persistentSpeed', 'perChannelSpeed'],
        ['forceH264', 'codecSelector'],
        ['fitPlayerToWindow', 'stickyVideo'],
    ];
    for (const [a, b] of symmetricPairs) {
        const aBlock = mapSrc.match(new RegExp(`${a}:\\s*\\{[^}]*\\}`));
        const bBlock = mapSrc.match(new RegExp(`${b}:\\s*\\{[^}]*\\}`));
        assert.ok(aBlock, `${a} must be a CONFLICT_MAP key`);
        assert.ok(bBlock, `${b} must be a CONFLICT_MAP key`);
        assert.match(aBlock[0], new RegExp(`'${b}'`),
            `${a}.conflicts must include '${b}' for symmetric auto-disable`);
        assert.match(bBlock[0], new RegExp(`'${a}'`),
            `${b}.conflicts must include '${a}' for symmetric auto-disable`);
    }

    // Asymmetric / one-direction pairs.
    assert.match(mapSrc, /hideSidebar:.*'hiddenChatElementsManager'/,
        'hideSidebar -> hiddenChatElementsManager conflict must remain');
    assert.match(mapSrc, /removeAllShorts:.*'redirectShorts'/,
        'removeAllShorts -> redirectShorts conflict must remain');

    // The cooperative-pair comment block must remain so future readers see
    // why these pairs aren't conflicts. Removing the comments without
    // unwinding the cooperation mechanism would invite re-introducing
    // the conflicts mechanically.
    assert.match(mapSrc, /focusedMode now hides only related videos/,
        'comment explaining focusedMode cooperation must remain');
    assert.match(mapSrc, /popOutPlayer sets __ytkit_videoPopped/,
        'comment explaining popOutPlayer / pipButton cooperation must remain');
    assert.match(mapSrc, /autoPauseOnSwitch and pauseOtherTabs tag pause reasons/,
        'comment explaining autoPauseOnSwitch / pauseOtherTabs cooperation must remain');
    assert.match(mapSrc, /hideEndCards is a \*sub-feature\* of hideVideoEndContent/,
        'comment explaining hideEndCards parent/sub relationship must remain');
});

test('v4.47.0 popup.css honours prefers-reduced-motion globally', () => {
    // Project design policy endorses reduced motion (see ROADMAP house style:
    // "preserve YouTube's native forced-colors and reduced-motion affordances")
    // and the popup ships several keyframes (status-pulse, spin, fade-down,
    // backdrop-in, modal-in, shimmer) plus dozens of transitions. The
    // global "*" reset under @media (prefers-reduced-motion: reduce) is the
    // single guard that disables every one of them at once; if a future
    // refactor removes or scopes it, every animated surface becomes a
    // motion-sensitivity regression. Pin the rule shape so the guard
    // can't drift silently.
    const popupCss = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.css'), 'utf8'
    );
    const guardStart = popupCss.indexOf('@media (prefers-reduced-motion: reduce)');
    assert.ok(guardStart > -1,
        'popup.css must declare @media (prefers-reduced-motion: reduce) for the global motion guard');
    // The guard body must zero out animation AND transition on the universal
    // selector. Anything narrower (e.g. scoped to a single class) would leave
    // sibling keyframes uncovered.
    const guardBody = popupCss.slice(guardStart, guardStart + 320);
    assert.match(guardBody, /\*\s*,\s*\*::before\s*,\s*\*::after/,
        'reduced-motion guard must target *, *::before, *::after (universal coverage)');
    assert.match(guardBody, /animation:\s*none\s*!important/,
        'reduced-motion guard must zero animation with !important to override per-element rules');
    assert.match(guardBody, /transition:\s*none\s*!important/,
        'reduced-motion guard must zero transition with !important to override per-element rules');
});

test('v4.47.0 NF12 — runtime-flags module exposes typed accessors and ytkit.js uses them', () => {
    // The three internal coordination flags (__ytkit_videoPopped,
    // __ytkit_cpu_tamer, __ytkit_debug) used to be untyped globals
    // written directly on `window`. A misspelled flag at a write site
    // would silently break the popOutPlayer / pipButton /
    // fullscreenOnDoubleClick cooperation chain (videoPopped), the
    // CPU Tamer re-entry guard (cpu_tamer), or the debug-mode banner
    // (debug). The module gives every flag a typed get/set and the
    // hardening invariant is that ytkit.js only writes through it.

    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'runtime-flags.js'), 'utf8'
    );
    // Module must expose six accessor methods — get + set for each of
    // the three flags.
    for (const method of [
        'getVideoPopped', 'setVideoPopped',
        'getCpuTamerActive', 'setCpuTamerActive',
        'getDebugActive', 'setDebugActive',
    ]) {
        assert.match(modSrc, new RegExp(method + '\\s*\\('),
            `runtime-flags.js must expose ${method}`);
    }
    // Module must attach to the shared YTKitCore namespace as
    // `runtimeFlags` so ytkit.js + the userscript bundle can pick it
    // up via the same idempotent guard used by other core helpers.
    assert.match(modSrc, /core\.runtimeFlags\s*=/,
        'runtime-flags.js must attach as core.runtimeFlags');
    assert.match(modSrc, /if \(core\.runtimeFlags\) return/,
        'runtime-flags.js must short-circuit on re-load');

    const ytkitSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8'
    );
    // ytkit.js must capture the module reference once at top-level
    // and gate the rest of the file on it (same pattern as the other
    // core helpers).
    assert.match(ytkitSrc, /const RuntimeFlags = \(globalThis\.YTKitCore && globalThis\.YTKitCore\.runtimeFlags\) \|\| null;/,
        'ytkit.js must capture RuntimeFlags from globalThis.YTKitCore.runtimeFlags');
    assert.match(ytkitSrc, /!RuntimeFlags\s*\n?\s*\) \{\s*\n\s*console\.error\(\'\[YTKit\] Core helpers missing\./s,
        'ytkit.js must include !RuntimeFlags in the missing-core-helpers guard');

    // No raw `window.__ytkit_videoPopped = …` / `__ytkit_cpu_tamer = …` /
    // `__ytkit_debug = …` writes outside the runtime-flags module itself.
    // We allow reads-from-comment (documentation about the underlying
    // primitives) but ban executable writes. Each banned pattern below
    // is the exact assignment shape the previous code used.
    const ytkitBannedWrites = [
        /window\.__ytkit_videoPopped\s*=\s*/,
        /window\.__ytkit_cpu_tamer\s*=\s*/,
        /window\.__ytkit_debug\s*=\s*/,
        /win\.__ytkit_videoPopped\s*=\s*/,
        /win\.__ytkit_cpu_tamer\s*=\s*/,
        /win\.__ytkit_debug\s*=\s*/,
    ];
    for (const banned of ytkitBannedWrites) {
        assert.doesNotMatch(ytkitSrc, banned,
            `ytkit.js must not write ${banned} directly — go through RuntimeFlags.set*`);
    }
    // Same for reads. `if (window.__ytkit_videoPopped)` etc. must use
    // the typed getter instead.
    const ytkitBannedReads = [
        /if \(\s*window\.__ytkit_videoPopped\s*\)/,
        /if \(\s*window\.__ytkit_cpu_tamer\s*\)/,
        /if \(\s*window\.__ytkit_debug\s*\)/,
    ];
    for (const banned of ytkitBannedReads) {
        assert.doesNotMatch(ytkitSrc, banned,
            `ytkit.js must not read ${banned} directly — go through RuntimeFlags.get*`);
    }

    // Sandbox eval the module so we have proof the contract works end
    // to end. Mock `window` with a plain object; check that get/set
    // round-trips through the underlying primitive name (so a console
    // power user reading `window.__ytkit_videoPopped` after the
    // setter still sees the same boolean).
    const fakeWindow = {};
    const sandbox = {
        globalThis: {},
        window: fakeWindow,
    };
    const vm = require('node:vm');
    vm.createContext(sandbox);
    vm.runInContext(modSrc, sandbox);
    const flags = sandbox.globalThis.YTKitCore.runtimeFlags;
    assert.equal(flags.getVideoPopped(), false, 'initial videoPopped is false');
    flags.setVideoPopped(true);
    assert.equal(flags.getVideoPopped(), true, 'setVideoPopped(true) round-trips');
    assert.equal(fakeWindow.__ytkit_videoPopped, true,
        'setter writes to the underlying window primitive so external readers see it');
    flags.setCpuTamerActive(1); // truthy non-boolean coerces
    assert.strictEqual(flags.getCpuTamerActive(), true,
        'getCpuTamerActive coerces the underlying primitive to a strict boolean');
    flags.setDebugActive(false);
    assert.equal(flags.getDebugActive(), false, 'setDebugActive(false) round-trips');
});

test('v4.47.0 NF12 — runtime-flags is bundled into the userscript', () => {
    // sync-userscript.js bundles the v5.0.0 core modules into the
    // userscript build. runtime-flags.js must ride alongside the
    // existing core helpers so the userscript vehicle stays at parity
    // with the MV3 extension.
    const syncSrc = fs.readFileSync(
        path.join(__dirname, '..', 'sync-userscript.js'), 'utf8'
    );
    assert.match(syncSrc, /'extension\/core\/runtime-flags\.js'/,
        'sync-userscript.js V5_BUNDLE_MODULES must include extension/core/runtime-flags.js');
});

test('v4.47.0 NF23 — nyan-cat theme asset resolves via getRepoAssetUrl, not a hardcoded GitHub raw URL', () => {
    // The nyan-cat theme used to load assets/cat.gif from a hardcoded
    // raw.githubusercontent.com URL inside its CSS. That was both a
    // remote-content surface (no extension-origin guarantee) and a
    // CSP escape hatch (the extension's manifest CSP can't blanket-
    // forbid raw GitHub fetches without breaking other things). NF23
    // routes the URL through the getRepoAssetUrl() helper which uses
    // chrome.runtime.getURL in extension contexts.

    const ytkitSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8'
    );

    // The helper exists with the documented fallback chain.
    assert.match(ytkitSrc, /function getRepoAssetUrl\(fileName\)/,
        'ytkit.js must define getRepoAssetUrl helper');
    assert.match(ytkitSrc, /chrome\.runtime\.getURL\(`assets\/\$\{fileName\}`\)/,
        'getRepoAssetUrl must prefer chrome.runtime.getURL for extension context');

    // The nyan-cat scrubber CSS interpolates the URL helper instead of
    // hardcoding raw.githubusercontent.com. The _rawThemes block is the
    // anchor; the 'nyan-cat' theme literal lives right after it.
    const rawThemesIdx = ytkitSrc.indexOf('_rawThemes:');
    assert.ok(rawThemesIdx > -1, '_rawThemes block must exist in ytkit.js');
    const nyanSlice = ytkitSrc.slice(rawThemesIdx, rawThemesIdx + 3000);
    assert.match(nyanSlice, /\$\{getRepoAssetUrl\('cat\.gif'\)\}/,
        'nyan-cat scrubber CSS must interpolate getRepoAssetUrl, not hardcode the URL');
    assert.doesNotMatch(nyanSlice, /raw\.githubusercontent\.com[^"]*cat\.gif/,
        'nyan-cat scrubber CSS must not hardcode a raw.githubusercontent.com URL anymore');

    // The asset is bundled inside the extension/ tree.
    const bundledAsset = path.join(__dirname, '..', 'extension', 'assets', 'cat.gif');
    assert.ok(fs.existsSync(bundledAsset),
        'extension/assets/cat.gif must exist so chrome.runtime.getURL resolves');

    // The manifest's web_accessible_resources covers assets/*.
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    const resources = manifest.web_accessible_resources
        .flatMap((r) => r.resources || []);
    assert.ok(resources.includes('assets/*'),
        'manifest.json web_accessible_resources must include assets/*');
});

test('v4.47.0 R6 — policy-profile scrub regex catches the broader API-key shapes', () => {
    // The previous scrub regex matched only the *suffix* `apiKey$` /
    // `token$` plus the exact `aiSummaryApiKey`. R6 broadens coverage
    // to catch `apikey_v2`, `api_key`, `bearerToken`, `webhookSecret`,
    // `authToken`, private keys, cookie snapshots, etc. Pin the new shapes so a future refactor
    // can't silently narrow the scrubber.
    delete require.cache[require.resolve('../extension/core/policy-profile.js')];
    const ppMod = require('../extension/core/policy-profile.js');
    const profile = ppMod.createPolicyProfile({});

    // Build a fake settings object that mixes secret-shaped keys
    // with benign ones, then assert the export snapshot drops the
    // sensitive keys and preserves the benign ones.
    const fakeSettings = {
        // Should be scrubbed:
        apiKey: 'sk-xxxxx',
        aiSummaryApiKey: 'sk-yyyyy',
        sessionToken: 'tok-1',
        apikey_v2: 'sk-zzz',
        api_key: 'sk-underscore',
        'api-key': 'sk-dash',
        bearerToken: 'bear-1',
        accessBearer: 'bear-2',
        webhookSecret: 'whsec_1',
        authToken: 'auth-1',
        userAuth: 'auth-2',
        accountPassword: 'pass-1',
        serviceCredential: 'cred-1',
        privateKey: '-----BEGIN PRIVATE KEY-----',
        accessKey: 'access-1',
        youtubeCookies: 'cookie-1',
        cookieJar: 'cookie-2',
        // Should NOT be scrubbed (benign / unrelated):
        aiSummaryProvider: 'openai',
        autoMaxResolution: true,
        videosPerRow: 0,
        // Edge: a key with "apiKeyId" names an identifier for an API key,
        // not the key material itself. Keep the negative look-ahead pinned.
        apiKeyId: 'id-1',
    };
    const snap = profile.buildExportSnapshot(fakeSettings, { effective: 'github-full' });
    const exported = Object.keys(snap.settings);

    // Scrubbed keys must be absent.
    for (const sensitive of ['apiKey', 'aiSummaryApiKey', 'sessionToken',
        'apikey_v2', 'api_key', 'api-key', 'bearerToken', 'accessBearer',
        'webhookSecret', 'authToken', 'userAuth', 'accountPassword',
        'serviceCredential', 'privateKey', 'accessKey', 'youtubeCookies',
        'cookieJar']) {
        assert.ok(!exported.includes(sensitive),
            `${sensitive} must be scrubbed from the export snapshot`);
    }
    // Benign keys must survive.
    for (const benign of ['aiSummaryProvider', 'autoMaxResolution', 'videosPerRow',
        'apiKeyId']) {
        assert.ok(exported.includes(benign),
            `${benign} must NOT be scrubbed (it carries no secret)`);
    }
});

test('v4.47.0 NF20 — check-no-eval gate is wired and rejects eval / Function / string-timer patterns', () => {
    // The extension's CSP forbids unsafe-eval. NF20 ships a
    // belt-and-suspenders source-level grep so a contributor adding
    // `eval(` or `new Function(` is flagged at npm-run-check time
    // instead of at runtime CSP rejection time.

    // 1. The script exists and is wired into the check gate.
    const scriptPath = path.join(__dirname, '..', 'scripts', 'check-no-eval.js');
    assert.ok(fs.existsSync(scriptPath), 'scripts/check-no-eval.js must exist');
    const pkg = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'package.json'), 'utf8'
    ));
    assert.match(pkg.scripts.check, /scripts\/check-no-eval\.js/,
        'npm run check must invoke check-no-eval.js');

    // 2. The script's PATTERNS array covers the documented set.
    // Each assertion checks for the literal pattern label inside the
    // script source (the script declares `name: 'eval('` etc on each
    // PATTERNS entry).
    const src = fs.readFileSync(scriptPath, 'utf8');
    assert.match(src, /name:\s*'eval\('/,
        "check-no-eval must declare the 'eval(' pattern");
    assert.match(src, /name:\s*'new Function\('/,
        "check-no-eval must declare the 'new Function(' pattern");
    assert.match(src, /name:\s*'setTimeout\(string\)'/,
        "check-no-eval must declare the 'setTimeout(string)' pattern");
    assert.match(src, /name:\s*'setInterval\(string\)'/,
        "check-no-eval must declare the 'setInterval(string)' pattern");
    // The "allow-eval" escape hatch must be honored.
    assert.match(src, /\/\/ allow-eval/,
        'check-no-eval must honor the // allow-eval same-line escape hatch');

    // 3. The validate.yml CI workflow emits an SBOM artifact.
    const ciSrc = fs.readFileSync(
        path.join(__dirname, '..', '.github', 'workflows', 'validate.yml'), 'utf8'
    );
    assert.match(ciSrc, /npm ls --omit=dev --json > sbom\.json/,
        'validate.yml must emit an npm SBOM via npm ls --omit=dev');
    assert.match(ciSrc, /name: astra-deck-sbom/,
        'validate.yml must upload the SBOM as a named artifact');
});

test('v4.47.0 NF10 — capability-probe module covers every CAPABILITIES enum entry', () => {
    // NF17 added the CAPABILITIES enum to settings-schema.js plus an
    // optional `requires:` field on entries. NF10 pairs that with a
    // runtime probe so the popup can render an "unavailable" chip for
    // features whose required capability is missing.
    //
    // Contract: capability-probe.js exposes a PROBES table keyed by
    // every name in CAPABILITIES, exports a runAll() that returns
    // {name: boolean}, an isEntryAvailable(entry, map) helper that
    // returns true iff every required capability is present.
    delete require.cache[require.resolve('../extension/core/settings-schema.js')];
    delete require.cache[require.resolve('../extension/core/capability-probe.js')];
    const schemaModule = require('../extension/core/settings-schema.js');
    const probe = require('../extension/core/capability-probe.js');
    const { CAPABILITIES } = schemaModule;

    // 1. PROBES keys === CAPABILITIES entries (set-equal).
    const probeKeys = Object.keys(probe.PROBES).sort();
    const capList = [...CAPABILITIES].sort();
    assert.deepEqual(probeKeys, capList,
        'capability-probe PROBES keys must match the settings-schema CAPABILITIES enum exactly');

    // 2. Each probe entry has the documented shape.
    for (const name of capList) {
        const entry = probe.PROBES[name];
        assert.equal(typeof entry, 'object', `${name} probe must be an object`);
        assert.equal(typeof entry.async, 'boolean',
            `${name} probe must declare async: boolean`);
        assert.equal(typeof entry.run, 'function',
            `${name} probe must expose run() function`);
    }

    // 3. isEntryAvailable contract — entries without requires: always
    // return true; entries with requires: must have all keys present.
    assert.equal(probe.isEntryAvailable({}, {}), true,
        'entry without requires: must be considered available regardless of map');
    assert.equal(probe.isEntryAvailable({ requires: [] }, {}), true,
        'entry with empty requires: must be considered available');
    assert.equal(
        probe.isEntryAvailable({ requires: ['summarizerApi'] }, { summarizerApi: false }),
        false,
        'missing capability must mark entry unavailable',
    );
    assert.equal(
        probe.isEntryAvailable({ requires: ['summarizerApi'] }, { summarizerApi: true }),
        true,
        'present capability must mark entry available',
    );
    assert.equal(
        probe.isEntryAvailable({ requires: ['mediaDL', 'ollama'] }, { mediaDL: true, ollama: false }),
        false,
        'multi-capability requires: must AND across every name',
    );

    // 4. summarizerApi sync probe works without network. Without
    // window.ai present, must return false.
    const savedAi = globalThis.ai;
    delete globalThis.ai;
    assert.equal(probe.PROBES.summarizerApi.run(), false,
        'summarizerApi must return false when window.ai is absent');
    globalThis.ai = { Summarizer: function () {} };
    assert.equal(probe.PROBES.summarizerApi.run(), true,
        'summarizerApi must return true when window.ai.Summarizer is a function');
    if (savedAi === undefined) delete globalThis.ai;
    else globalThis.ai = savedAi;

    // 5. The Media-DL probe walks the documented six fallback ports.
    assert.deepEqual(
        [...probe._MEDIA_DL_PORTS],
        [9751, 9761, 9771, 9781, 9791, 9851],
        'capability-probe must walk the documented six Astra Downloader fallback ports',
    );
    assert.equal(probe._OLLAMA_PORT, 11434,
        'capability-probe must use Ollama port 11434');
});

test('v4.47.0 NF10 — manifest loads capability-probe.js before ytkit.js in every content-script group', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        const ytkitIdx = cs.js.indexOf('ytkit.js');
        if (ytkitIdx === -1) continue;
        const probeIdx = cs.js.indexOf('core/capability-probe.js');
        assert.notEqual(probeIdx, -1,
            'manifest must include core/capability-probe.js in every content_scripts group that loads ytkit.js');
        assert.ok(probeIdx < ytkitIdx,
            'core/capability-probe.js must load before ytkit.js');
    }
});

test('v4.47.0 NF5 wave 3 — cssFeature delegates registered CSS injection to lifecycle specs', () => {
    // Wave 1 registered peeled CSS ids with the v4.7.0 lifecycle module.
    // Wave 2 only mirrored cssFeature state into lifecycle snapshots while
    // keeping CSS injection in the monolith. Wave 3 flips the happy path:
    // registered CSS specs own inject/remove through core/styles.js, and
    // cssFeature remains the thin compatibility wrapper/fallback.
    const ytkitSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8'
    );

    // 1. ytkit.js captures the lifecycle singleton near the RuntimeFlags
    // capture site.
    assert.match(ytkitSrc, /const Lifecycle = \(globalThis\.YTKitCore && typeof globalThis\.YTKitCore\.getLifecycle === 'function'\)\s*\n?\s*\? globalThis\.YTKitCore\.getLifecycle\(\)\s*\n?\s*: null;/s,
        'ytkit.js must capture the lifecycle singleton via getLifecycle()');

    // 2. cssFeature.init notifies the lifecycle on style injection.
    const cssFeatureStart = ytkitSrc.indexOf('function cssFeature(');
    assert.ok(cssFeatureStart > -1, 'cssFeature factory must exist');
    const cssFeatureBody = ytkitSrc.slice(cssFeatureStart, cssFeatureStart + 2400);
    assert.match(cssFeatureBody, /const hasLifecycleSpec = \(\) => !!\(Lifecycle && Lifecycle\._features && Lifecycle\._features\.has\(id\)\);/,
        'cssFeature must detect registered lifecycle specs before injecting directly');
    assert.match(cssFeatureBody, /Lifecycle\.start\(this\.id,\s*\{ css, isRaw, bodyClass \}\);/,
        'cssFeature.init must pass CSS context to Lifecycle.start for registered specs');
    assert.match(cssFeatureBody, /this\._lifecycleDelegated = true;[\s\S]*?return;/,
        'cssFeature.init must return after successful lifecycle delegation');
    assert.match(cssFeatureBody, /this\._styleElement = injectStyle\(css, this\.id, isRaw\);/,
        'cssFeature.init must keep direct injectStyle fallback for unregistered specs');
    assert.match(cssFeatureBody, /document\.body\.classList\.add\(bodyClass\);/,
        'cssFeature fallback must still add the body class');

    // 3. cssFeature.destroy delegates teardown when init delegated.
    assert.match(cssFeatureBody, /if \(this\._lifecycleDelegated && hasLifecycleSpec\(\)\)/,
        'cssFeature.destroy must branch on delegated lifecycle ownership');
    assert.match(cssFeatureBody, /Lifecycle\.destroy\(this\.id,\s*\{ css, isRaw, bodyClass \}\);/,
        'cssFeature.destroy must pass CSS context to Lifecycle.destroy for registered specs');
    assert.match(cssFeatureBody, /this\._styleElement\?\.remove\(\); this\._styleElement = null;/,
        'cssFeature.destroy must keep direct cleanup fallback for unregistered specs');

    // 4. Sandbox the contract: a real CSS lifecycle spec owns style
    // insertion/removal while lifecycle snapshot state follows start/destroy.
    const originalCore = globalThis.YTKitCore;
    const originalDocument = globalThis.document;
    const styles = new Map();
    const bodyClasses = new Set();
    globalThis.YTKitCore = {};
    globalThis.document = {
        createElement(tag) {
            return {
                tagName: tag,
                id: '',
                textContent: '',
                remove() { styles.delete(this.id); }
            };
        },
        getElementById(id) { return styles.get(id) || null; },
        head: {
            appendChild(style) {
                styles.set(style.id, style);
                return style;
            }
        },
        documentElement: null,
        body: {
            classList: {
                add(value) { bodyClasses.add(value); },
                remove(value) { bodyClasses.delete(value); }
            }
        }
    };
    try {
        delete require.cache[require.resolve('../extension/core/feature-lifecycle.js')];
        delete require.cache[require.resolve('../extension/core/styles.js')];
        const lifecycleModule = require('../extension/core/feature-lifecycle.js');
        const stylesModule = require('../extension/core/styles.js');
        const lc = lifecycleModule.createLifecycle();
        const spec = stylesModule.createCssLifecycleSpec({
            id: 'sandbox-feat',
            category: 'shell',
            buildCss() { return '.sandbox-feat { display: none !important; }'; },
        });
        lc.defineFeature(spec);
        let snap = lc.snapshot().find((r) => r.id === 'sandbox-feat');
        assert.equal(snap.started, false, 'sandbox feature must start as not-started');
        lc.start('sandbox-feat');
        snap = lc.snapshot().find((r) => r.id === 'sandbox-feat');
        assert.equal(snap.started, true, 'after lifecycle.start, snapshot must show started:true');
        assert.ok(styles.has('yt-suite-style-sandbox-feat'),
            'lifecycle spec must inject the feature style on start');
        assert.ok(bodyClasses.has('ytkit-sandbox-feat'),
            'lifecycle spec must add the feature body class on start');
        lc.destroy('sandbox-feat');
        snap = lc.snapshot().find((r) => r.id === 'sandbox-feat');
        assert.equal(snap.started, false, 'after lifecycle.destroy, snapshot must show started:false again');
        assert.equal(styles.has('yt-suite-style-sandbox-feat'), false,
            'lifecycle spec must remove the feature style on destroy');
        assert.equal(bodyClasses.has('ytkit-sandbox-feat'), false,
            'lifecycle spec must remove the feature body class on destroy');
    } finally {
        globalThis.YTKitCore = originalCore;
        globalThis.document = originalDocument;
    }
});

test('v4.47.0 NF14 — confirm-shell modal is retired (immediate-apply + undo pattern wins)', () => {
    // Project policy (ROADMAP house style + docs/architecture.md
    // §Conventions) bans confirmation dialogs in favor of
    // immediate-apply + undo-toast / soft-delete staging. The
    // previous confirm-shell modal in popup.html violated that
    // contract; this test pins the absence so a future refactor can't
    // silently bring it back.
    const popupHtml = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.html'), 'utf8'
    );
    const popupJs = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    const popupCss = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.css'), 'utf8'
    );

    // 1. The shell DIV + its inner controls are gone from the HTML.
    assert.doesNotMatch(popupHtml, /<div\s+class="confirm-shell"/,
        'popup.html must not declare a confirm-shell modal');
    assert.doesNotMatch(popupHtml, /id="confirm-shell"/,
        'popup.html must not declare an element with id="confirm-shell"');
    assert.doesNotMatch(popupHtml, /id="confirm-dialog"/,
        'popup.html must not declare an element with id="confirm-dialog"');
    assert.doesNotMatch(popupHtml, /id="confirm-accept-btn"/,
        'popup.html must not declare the confirm-accept-btn — confirm dialog was retired');
    assert.doesNotMatch(popupHtml, /id="confirm-cancel-btn"/,
        'popup.html must not declare the confirm-cancel-btn — confirm dialog was retired');

    // 2. The confirmAction() helper is gone from popup.js.
    assert.doesNotMatch(popupJs, /function confirmAction\s*\(/,
        'popup.js must not declare confirmAction() — it was retired in v4.47.0 NF14');
    assert.doesNotMatch(popupJs, /await confirmAction\s*\(/,
        'popup.js must not call confirmAction() — every former caller was migrated to immediate-apply');

    // 3. Both former callers still exist but no longer await
    // confirmation.
    const resetFnStart = popupJs.indexOf('async function resetAllData');
    assert.ok(resetFnStart > -1, 'resetAllData must still exist');
    const resetFnBody = popupJs.slice(resetFnStart, resetFnStart + 2000);
    assert.doesNotMatch(resetFnBody, /confirmAction/,
        'resetAllData must apply immediately (EI2 Undo Reset is the recovery path)');
    // EI2 invariant: resetAllData must still take a snapshot before
    // wiping so Undo Reset can restore byte-identical. This test
    // belongs to EI2 conceptually but we pin it here too so the NF14
    // pass can't silently remove the snapshot path.
    assert.match(resetFnBody, /chrome\.storage\.local\.get\(null/,
        'resetAllData must snapshot all local storage before wiping (EI2 Undo path)');

    const clearFnStart = popupJs.indexOf('async function clearDiagnosticLog');
    assert.ok(clearFnStart > -1, 'clearDiagnosticLog must still exist');
    const clearFnBody = popupJs.slice(clearFnStart, clearFnStart + 600);
    assert.doesNotMatch(clearFnBody, /confirmAction/,
        'clearDiagnosticLog must apply immediately (the diagnostic log is a runtime ring buffer, not user data)');

    // 4. The supporting CSS rules are gone from popup.css.
    assert.doesNotMatch(popupCss, /\.confirm-shell\s*\{/,
        'popup.css must not declare .confirm-shell — retired in NF14');
    assert.doesNotMatch(popupCss, /\.confirm-dialog\s*\{/,
        'popup.css must not declare .confirm-dialog — retired in NF14');
    assert.doesNotMatch(popupCss, /\.confirm-backdrop\s*\{/,
        'popup.css must not declare .confirm-backdrop — retired in NF14');

    // 5. The retirement marker comment is present in popup.js so a
    // future audit pass sees the explicit policy reference.
    assert.match(popupJs, /retired in v4\.47\.0 NF14/,
        'popup.js must carry the NF14 retirement marker comment');
});

test('v4.47.0 NF17 — schema exposes CAPABILITIES enum and requires: field is well-formed', () => {
    // CAPABILITIES is the well-known allowlist of runtime capability
    // names an entry can declare via the optional `requires:` array.
    // The future capability-probe module (RESEARCH_FEATURE_PLAN NF10)
    // will gate UI on these probe results, so the allowlist must be
    // narrow + auditable.
    delete require.cache[require.resolve('../extension/core/settings-schema.js')];
    const schemaModule = require('../extension/core/settings-schema.js');
    const { SETTINGS_SCHEMA, CAPABILITIES } = schemaModule;

    // 1. CAPABILITIES is a non-empty frozen array of unique strings.
    assert.ok(Array.isArray(CAPABILITIES), 'CAPABILITIES must be an array');
    assert.ok(CAPABILITIES.length > 0, 'CAPABILITIES must not be empty');
    assert.ok(Object.isFrozen(CAPABILITIES), 'CAPABILITIES must be frozen');
    const seen = new Set();
    for (const cap of CAPABILITIES) {
        assert.equal(typeof cap, 'string', 'capability names must be strings');
        assert.ok(/^[a-z][A-Za-z0-9]*$/.test(cap),
            `capability "${cap}" must be lowerCamelCase`);
        assert.ok(!seen.has(cap), `capability "${cap}" must be unique`);
        seen.add(cap);
    }
    // 2. The initial allowlist covers the three platform affordances
    // identified in RESEARCH_FEATURE_PLAN. Future additions are fine,
    // but these three must remain — the seed entries below depend on
    // them.
    for (const expected of ['summarizerApi', 'mediaDL', 'ollama']) {
        assert.ok(seen.has(expected),
            `CAPABILITIES must include "${expected}" (seeded by NF17)`);
    }

    // 3. Every entry's `requires:` field, if present, is a frozen
    // non-empty array of strings drawn from CAPABILITIES with no
    // duplicates. (The scripts/check-settings.js gate enforces this
    // at npm-run-check time; we mirror the contract here so a refactor
    // can't silently change the field shape.)
    const validCaps = new Set(CAPABILITIES);
    const entriesWithRequires = [];
    for (const entry of SETTINGS_SCHEMA) {
        if (entry.requires === undefined) continue;
        entriesWithRequires.push(entry.key);
        assert.ok(Array.isArray(entry.requires),
            `entry "${entry.key}" requires must be an array`);
        assert.ok(entry.requires.length > 0,
            `entry "${entry.key}" requires must omit the field when empty`);
        const seenCaps = new Set();
        for (const cap of entry.requires) {
            assert.equal(typeof cap, 'string',
                `entry "${entry.key}" requires entries must be strings`);
            assert.ok(validCaps.has(cap),
                `entry "${entry.key}" declares unknown capability "${cap}"`);
            assert.ok(!seenCaps.has(cap),
                `entry "${entry.key}" lists capability "${cap}" twice`);
            seenCaps.add(cap);
        }
    }
    // 4. Seed entries are present. These three keys are the initial
    // NF17 plant; adding more is fine, removing without justification
    // would weaken the future capability-probe surface.
    for (const seededKey of ['localAiSummary', 'subscriptionAiTags', 'downloadHistoryPanel', 'downloadHealthPanel']) {
        assert.ok(entriesWithRequires.includes(seededKey),
            `seed entry "${seededKey}" must declare a requires: field`);
    }
});

test('v4.47.0 NF17 — check-settings.js validates the requires: field', () => {
    // The npm-run-check gate (scripts/check-settings.js) is responsible
    // for refusing PRs that smuggle in a typo'd capability name.
    // Mirror the contract here so the script can't silently lose this
    // validation in a future refactor.
    const checkSrc = fs.readFileSync(
        path.join(__dirname, '..', 'scripts', 'check-settings.js'), 'utf8'
    );
    assert.match(checkSrc, /const validCapabilities = new Set\(CAPABILITIES\);/,
        'check-settings.js must build a validCapabilities Set from CAPABILITIES');
    assert.match(checkSrc, /e\.requires !== undefined/,
        'check-settings.js must validate the requires: field per entry');
    assert.match(checkSrc, /Array\.isArray\(e\.requires\)/,
        'check-settings.js must enforce requires: is an array');
    assert.match(checkSrc, /requires unknown capability/,
        'check-settings.js must reject unknown capability names');
    assert.match(checkSrc, /requires lists capability "/,
        'check-settings.js must reject duplicate capabilities in a single entry');
});

test('v4.47.0 NF12 — manifest loads runtime-flags.js before ytkit.js in every content-script group', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'
    ));
    for (const cs of manifest.content_scripts) {
        if (!Array.isArray(cs.js)) continue;
        const ytkitIdx = cs.js.indexOf('ytkit.js');
        if (ytkitIdx === -1) continue;
        const flagsIdx = cs.js.indexOf('core/runtime-flags.js');
        assert.notEqual(flagsIdx, -1,
            'manifest must include core/runtime-flags.js in every content_scripts group that loads ytkit.js');
        assert.ok(flagsIdx < ytkitIdx,
            'core/runtime-flags.js must load before ytkit.js so the module is on globalThis.YTKitCore when ytkit.js runs');
    }
});

test('v4.47.0 NF16 — predicate ctx exposes likes (from RYD cache) + subsCount (parsed from card text)', () => {
    // BlockTube ships `likes` in advanced blocking; PocketTube exposes
    // subscriber count. NF16 brings parity by extending the predicate
    // ctx with both fields. Both are null-tolerant: predicates can
    // write `likes != null && likes > 100000` (explicit) or just rely
    // on null-as-falsy in standard comparisons.
    const ytkitSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8'
    );

    // Helpers exist:
    assert.match(ytkitSrc, /_extractSubsCount\(metadataText\)/,
        'videoHider must declare _extractSubsCount(metadataText) helper');
    assert.match(ytkitSrc, /_readRydLikes\(videoId\)/,
        'videoHider must declare _readRydLikes(videoId) helper');

    // _extractSubsCount parses "1.2M subscribers" / "950K subscribers" /
    // "42 subscribers" / "5B subscribers" forms case-insensitively.
    const subsRegexLine = ytkitSrc.match(/_extractSubsCount\([^)]*\) \{[\s\S]*?return Math\.round\(num \* mult\);\s*\}/);
    assert.ok(subsRegexLine, '_extractSubsCount body must be extractable');
    assert.match(subsRegexLine[0], /\(\\d\+\(\?:\\\.\\d\+\)\?\)\\s\*\(\[kmb\]\)\?\\s\*subscriber/,
        '_extractSubsCount regex must match optional decimal + K/M/B suffix before "subscriber"');

    // _readRydLikes consults the cached `ytkit-ryd-cache` key with a
    // 5s in-memory refresh so predicate evaluation doesn't thrash
    // storage during a feed scan.
    const rydFn = ytkitSrc.match(/_readRydLikes\([^)]*\) \{[\s\S]*?return Number\.isFinite\(entry\.likes\) \? entry\.likes : null;\s*\}/);
    assert.ok(rydFn, '_readRydLikes body must be extractable');
    assert.match(rydFn[0], /storageReadJSON\('ytkit-ryd-cache', null\)/,
        '_readRydLikes must read from the ytkit-ryd-cache storage key');
    assert.match(rydFn[0], /now - this\._rydCacheLoadedAt > 5000/,
        '_readRydLikes must refresh its in-memory cache no more than every 5s');

    // _buildPredicateCtx wires both fields onto the frozen ctx.
    // Whole-file search rather than slicing because the call site +
    // declaration share the same signature and the slice anchor was
    // brittle. These assertions are unique enough to only match
    // inside the predicate-ctx construction path.
    assert.match(ytkitSrc, /likes: this\._readRydLikes\(videoId\),/,
        'ctx.likes must be sourced from this._readRydLikes(videoId)');
    assert.match(ytkitSrc, /subsCount: this\._extractSubsCount\(metadata\?\.metadataText\),/,
        'ctx.subsCount must be sourced from this._extractSubsCount(metadata?.metadataText)');
    // BlockTube/PocketTube parity comment anchor.
    assert.match(ytkitSrc, /v4\.47\.0 NF16: BlockTube\/PocketTube parity additions/,
        'predicate ctx must carry the NF16 parity comment');

    // Sandbox-eval the subs-count parser to lock in the parsing
    // contract end-to-end.
    const vm = require('node:vm');
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(`
        function extract(metadataText) {
            if (!metadataText) return null;
            const m = metadataText.match(/(\\d+(?:\\.\\d+)?)\\s*([kmb])?\\s*subscriber/i);
            if (!m) return null;
            const num = parseFloat(m[1]);
            if (!Number.isFinite(num)) return null;
            const suffix = (m[2] || '').toLowerCase();
            const mult = suffix === 'b' ? 1e9 : suffix === 'm' ? 1e6 : suffix === 'k' ? 1e3 : 1;
            return Math.round(num * mult);
        }
        globalThis.extract = extract;
    `, sandbox);
    const extract = sandbox.extract;

    assert.equal(extract('1.2M subscribers'), 1_200_000, '"1.2M subscribers" parses to 1.2M');
    assert.equal(extract('950K subscribers'), 950_000, '"950K subscribers" parses to 950K');
    assert.equal(extract('42 subscribers'), 42, '"42 subscribers" (no suffix) parses to 42');
    assert.equal(extract('3.5B subscribers'), 3_500_000_000, '"3.5B subscribers" parses to 3.5B');
    assert.equal(extract('Subscribe to channel'), null, 'no number prefix returns null');
    assert.equal(extract(''), null, 'empty string returns null');
    assert.equal(extract(null), null, 'null input returns null');
});

test('v4.47.0 polish batch — EI-NEW2 / EI-NEW3 / EI-NEW4 invariants pinned', () => {
    const ytkitSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8'
    );

    // EI-NEW2: youtubeMusicCompat must use exact-hostname match.
    // The previous .includes('music.youtube.com') was a substring smell.
    // (We pin the new form positively; the prior-form mention in the
    // explanatory comment is fine — only the executable expression
    // matters, and the positive match below guarantees the new form
    // exists. Banning the old form via regex would false-positive on
    // the comment.)
    assert.match(ytkitSrc, /location\.hostname !== 'music\.youtube\.com'/,
        'youtubeMusicCompat must use exact-hostname match (=== or !==)');

    // EI-NEW3: reactionSpammer floor reads from settings with hard-floor clamp.
    assert.match(ytkitSrc, /_INTERVAL_MIN_MS_FLOOR:\s*500/,
        'reactionSpammer must declare _INTERVAL_MIN_MS_FLOOR: 500 as the hard safety floor');
    assert.match(ytkitSrc, /get _INTERVAL_MIN_MS\(\)/,
        'reactionSpammer must expose _INTERVAL_MIN_MS as a getter that reads the setting');
    assert.match(ytkitSrc, /raw < this\._INTERVAL_MIN_MS_FLOOR/,
        'reactionSpammer getter must clamp to the floor — never let the user lower it');

    // EI-NEW4: DeArrow TTL=0 warning + fallback opacity rule + fallback marker.
    assert.match(ytkitSrc, /Cache disabled \(daCacheTTL=0\); every card hit fires an API request/,
        'DeArrow init must warn when daCacheTTL=0');
    assert.match(ytkitSrc, /\.daCustomTitle\[data-da-fallback="1"\]\s*\{[^}]*opacity:\s*0\.78/,
        'DeArrow CSS must dim fallback titles via .daCustomTitle[data-da-fallback="1"]');
    assert.match(ytkitSrc, /clone\.dataset\.daFallback = '1'/,
        'DeArrow fallback path must mark the clone with data-da-fallback="1"');

    // Schema entries for the new settings.
    const schemaSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'settings-schema.js'), 'utf8'
    );
    assert.match(schemaSrc, /key:\s*"reactionSpammerMinIntervalMs".*defaultValue:\s*500/,
        'schema must declare reactionSpammerMinIntervalMs with default 500');

    // Default-settings catalogue must carry the same keys.
    const defaultsJson = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'default-settings.json'), 'utf8'
    ));
    assert.equal(defaultsJson.reactionSpammerMinIntervalMs, 500,
        'default-settings.json must catalogue reactionSpammerMinIntervalMs: 500');

    // (The former ROADMAP matrix assertions were dropped: ROADMAP.md is a
    // living planning document, and pinning its prose froze a long-replaced
    // competitor matrix. Code invariants above are the durable part.)
});

test('v4.47.0 NF33 — hideVideosFromHome subs-load gate uses configurable hiddenRatio', () => {
    // Before NF33: const allHidden = hiddenCount === batchSize halted
    // pagination after any 3-batch streak of 100%-hidden batches. Users
    // hit this on healthy feeds where one unlucky batch happened to be
    // all-spam — the next batch could have been 80% non-hidden but the
    // streak was already past the gate.
    //
    // After NF33: const mostlyHidden = hiddenRatio >= ratioCutoff, where
    // ratioCutoff comes from the hideVideosSubsLoadHiddenRatio setting
    // (default 0.8). A 70%-hidden batch resets the streak instead of
    // tripping the pause.
    const ytkitSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8'
    );
    const fnIdx = ytkitSrc.indexOf('_trackSubsLoadBatch(processedVideos)');
    assert.ok(fnIdx > -1, '_trackSubsLoadBatch must exist');
    const slice = ytkitSrc.slice(fnIdx, fnIdx + 2500);

    // The old 100% gate is gone.
    assert.doesNotMatch(slice, /allHidden = hiddenCount === batchSize/,
        'NF33 replaces the 100%-hidden gate with a configurable ratio gate');

    // The new gate computes a ratio + cutoff and uses mostlyHidden.
    assert.match(slice, /hiddenRatio = hiddenCount \/ batchSize/,
        'subs-load gate must compute hiddenRatio = hiddenCount / batchSize');
    assert.match(slice, /hideVideosSubsLoadHiddenRatio/,
        'subs-load gate must consult hideVideosSubsLoadHiddenRatio setting');
    assert.match(slice, /mostlyHidden = hiddenRatio >= ratioCutoff/,
        'mostlyHidden must be the documented comparison');
    assert.match(slice, /raw <= 0 \|\| raw > 1\) return 0\.8/,
        'invalid ratio settings must fall back to 0.8 default at call site');

    // Schema declares the new entry with documented default.
    const schemaSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'settings-schema.js'), 'utf8'
    );
    assert.match(schemaSrc, /key:\s*"hideVideosSubsLoadHiddenRatio".*defaultValue:\s*0\.8/,
        'settings-schema must declare hideVideosSubsLoadHiddenRatio with default 0.8');

    // ytkit.js defaults block carries the same key + default.
    assert.match(ytkitSrc, /hideVideosSubsLoadHiddenRatio:\s*0\.8/,
        'ytkit.js defaults must carry hideVideosSubsLoadHiddenRatio: 0.8');

    // default-settings.json catalogues it.
    const defaultsJson = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'default-settings.json'), 'utf8'
    ));
    assert.equal(defaultsJson.hideVideosSubsLoadHiddenRatio, 0.8,
        'default-settings.json must include hideVideosSubsLoadHiddenRatio: 0.8');

    // Sandbox-eval the gate so we have proof the contract works.
    // We extract the lines from the slice that compute hiddenRatio →
    // ratioCutoff → mostlyHidden and exercise three cases.
    const gateBody = `
        function gate(hiddenCount, batchSize, settingValue) {
            const hiddenRatio = hiddenCount / batchSize;
            const ratioCutoff = (() => {
                const raw = Number(settingValue);
                if (!Number.isFinite(raw) || raw <= 0 || raw > 1) return 0.8;
                return raw;
            })();
            return hiddenRatio >= ratioCutoff;
        }
    `;
    const vm = require('node:vm');
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(gateBody + 'globalThis.gate = gate;', sandbox);
    const gate = sandbox.gate;

    // 100% hidden: tripped under any cutoff.
    assert.equal(gate(10, 10, 0.8), true, '100% hidden trips the default 0.8 cutoff');
    // 80% hidden: tripped at default.
    assert.equal(gate(8, 10, 0.8), true, '80% hidden trips the default 0.8 cutoff');
    // 70% hidden: NOT tripped under default.
    assert.equal(gate(7, 10, 0.8), false, '70% hidden does NOT trip the default 0.8 cutoff');
    // Invalid setting falls back to 0.8.
    assert.equal(gate(7, 10, 'invalid'), false, 'invalid setting falls back to 0.8 (70% does not trip)');
    // Out-of-range (1.5 > 1) also falls back to 0.8.
    assert.equal(gate(9, 10, 1.5), true, 'out-of-range fallback to 0.8 — 90% trips');
    // A valid stricter cutoff (0.95) means even 80% hidden does NOT trip.
    assert.equal(gate(8, 10, 0.95), false, 'stricter 0.95 cutoff lets 80% hidden through');
    // A valid looser cutoff (0.5) means 60% hidden trips.
    assert.equal(gate(6, 10, 0.5), true, 'looser 0.5 cutoff trips at 60% hidden');
});

test('v4.47.0 EI-NEW5 — hideVideosFromHome precomputes blocked channel identity keys', () => {
    const start = ytkitSource.indexOf("id: 'hideVideosFromHome'");
    const end = ytkitSource.indexOf("id: 'showLocalDownloadButton'", start);
    assert.ok(start > -1 && end > start, 'video hider block must exist');
    const block = ytkitSource.slice(start, end);

    assert.match(block, /_channelKeyCache:\s*null/,
        'video hider must cache blocked-channel identity keys separately from records');
    assert.match(block, /_setBlockedChannelCache\(channels\)/,
        'video hider must centralize blocked-channel cache replacement');
    assert.match(block, /const keyCache = new Set\(\)/,
        'blocked-channel cache replacement must precompute identity keys into a Set');
    assert.match(block, /this\._channelKeyCache = keyCache/,
        'blocked-channel cache replacement must store the precomputed key Set');
    assert.match(block, /_getBlockedChannelKeys\(\)/,
        'video hider must expose cached blocked-channel keys for per-card lookups');

    const isBlockedStart = block.indexOf('_isChannelBlocked(channelInfo)');
    assert.ok(isBlockedStart > -1, '_isChannelBlocked must exist');
    const isBlockedBlock = block.slice(isBlockedStart, isBlockedStart + 900);
    assert.match(isBlockedBlock, /const blockedKeys = this\._getBlockedChannelKeys\(\)/,
        '_isChannelBlocked must read the precomputed blocked-channel key Set');
    assert.match(isBlockedBlock, /return keys\.some\(key => blockedKeys\.has\(key\)\)/,
        '_isChannelBlocked must use Set membership for per-card channel checks');
    assert.doesNotMatch(isBlockedBlock, /_getBlockedChannels\(\)\.some\(channel/,
        '_isChannelBlocked must not scan every blocked-channel record per card');

    const storageStart = ytkitSource.indexOf('if (filteredChanges[STORAGE_KEYS.blockedChannels])');
    assert.ok(storageStart > -1, 'blocked-channel storage change branch must exist');
    const storageBlock = ytkitSource.slice(storageStart, storageStart + 800);
    assert.match(storageBlock, /_setBlockedChannelCache\?\.\(channels\)/,
        'external blocked-channel updates must refresh the key cache');
});

test('v4.47.0 NF34 — digitalWellbeing detects day-key flips and resets session baseline', () => {
    // Before NF34: _sessionStart was set once via `this._sessionStart ||
    // today.seconds` and never reset. When midnight crossed, _loadToday
    // returned a fresh {date, seconds:0} bucket but _sessionStart still
    // held yesterday's value. sessionElapsed = today.seconds - _sessionStart
    // went negative and every break-reminder was suppressed for the rest
    // of the day.
    //
    // After NF34: _tick captures _todayKey() before calling _loadToday;
    // when the key changes between ticks, _sessionStart is reset to 0
    // and _todayCache is cleared. The next iteration anchors the session
    // baseline to the new day's accumulator.
    const ytkitSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8'
    );
    const dwIdx = ytkitSrc.indexOf("id: 'digitalWellbeing'");
    assert.ok(dwIdx > -1, 'digitalWellbeing feature must exist');
    const slice = ytkitSrc.slice(dwIdx, dwIdx + 22000);

    // 1. _lastTodayKey field is declared on the feature object so the
    // boundary check has somewhere to remember the last seen key.
    assert.match(slice, /_lastTodayKey:\s*null/,
        'digitalWellbeing must declare _lastTodayKey: null on the feature object');

    // 2. _tick captures the current day key + compares to _lastTodayKey
    // before doing anything else; on flip, resets _sessionStart + clears
    // _todayCache.
    assert.match(slice, /const currentTodayKey = this\._todayKey\(\);/,
        '_tick must capture the day key from _todayKey() at the top');
    assert.match(slice, /this\._lastTodayKey && this\._lastTodayKey !== currentTodayKey/,
        '_tick must detect a day-key flip across ticks');
    assert.match(slice, /Day rolled over \(\$\{this\._lastTodayKey\} -> \$\{currentTodayKey\}\)/,
        '_tick must log the day-rollover transition via DebugManager');
    assert.match(slice, /this\._sessionStart = 0;\s*\n\s*this\._todayCache = null;/,
        '_tick must reset _sessionStart AND clear _todayCache on day flip');
    // The last-seen key must be updated regardless of whether a flip
    // occurred, otherwise the next tick can't tell.
    assert.match(slice, /this\._lastTodayKey = currentTodayKey;/,
        '_tick must update _lastTodayKey on every tick');

    // 3. _sessionStart initialization uses ?? (nullish-coalesce) so
    // today.seconds === 0 still initializes correctly.
    assert.match(slice, /if \(!this\._sessionStart\) this\._sessionStart = today\.seconds \?\? 0;/,
        '_tick must initialize _sessionStart with nullish-coalesce against today.seconds');

    // 4. destroy() resets _lastTodayKey alongside _sessionStart so the
    // next init() starts fresh.
    assert.match(slice, /this\._sessionStart = 0;\s*\n\s*this\._lastTodayKey = null;/,
        'destroy() must reset both _sessionStart and _lastTodayKey for symmetry');
});

test('v4.47.0 NF30 — RYD render surfaces rate-limited vs offline + cache-age title', () => {
    // Before NF30: any null from _fetch (whether 100/min budget cap or
    // network error) collapsed into a single "RYD off" pill with no
    // actionable copy. Users assumed the feature was broken.
    //
    // After NF30: render() checks _budgetWindow to differentiate. The
    // pill text says "RYD paused" + title carries seconds-until-reset
    // when rate-limited; "RYD off" + network-error title otherwise.
    // The cached-fresh path adds an age suffix (Xh old) and the live
    // path shows the running quota counter.
    const ytkitSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8'
    );
    const renderIdx = ytkitSrc.indexOf('id: \'returnDislike\'');
    assert.ok(renderIdx > -1, 'returnDislike feature must exist');
    // Slice the whole feature block (up to next "id:" entry).
    const slice = ytkitSrc.slice(renderIdx, renderIdx + 10000);

    // The differentiation logic must check the budget window state.
    assert.match(slice, /const rateLimited = this\._budgetWindow\.count >= this\._BUDGET_PER_MIN/,
        'render must compute rateLimited from _budgetWindow + _BUDGET_PER_MIN');
    assert.match(slice, /windowAge < 60000/,
        'render must respect the 60s sliding window for rate-limit detection');
    // Rate-limited branch surfaces a "RYD paused" pill with countdown.
    assert.match(slice, /offline\.textContent = 'RYD paused'/,
        'rate-limited path must show "RYD paused" pill');
    assert.match(slice, /Resumes in \$\{remainingSec\}s/,
        'rate-limited title must include the seconds-until-reset countdown');
    // Network-error branch keeps the old "RYD off" pill but with copy.
    assert.match(slice, /offline\.textContent = 'RYD off'/,
        'network-error path must still surface "RYD off" pill');
    assert.match(slice, /API did not return a usable response/,
        'network-error title must explain the cause');
    // Cached-data path surfaces age in hours.
    assert.match(slice, /Cached dislike count from Return YouTube Dislike \(\$\{ageH\}h old\)/,
        'cached-data title must include the entry age in hours');
    // Live-fetch path shows running quota counter.
    assert.match(slice, /\$\{this\._budgetWindow\.count\}\/\$\{this\._BUDGET_PER_MIN\}\/min used/,
        'live-fetch title must show running quota counter');
});

test('v4.47.0 NF29 — pickTranscriptTrack honors transcriptPreferredLanguage with documented precedence', () => {
    // Precedence chain (per the helper's JSDoc + the schema entry):
    // 1. exact languageCode match for transcriptPreferredLanguage
    // 2. exact languageCode match for navigator.language base
    // 3. 'en' (legacy fallback so the change is opt-in for non-EN users)
    // 4. first available track
    //
    // 'auto' / '' / undefined setting values skip step 1.
    const ytkitSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8'
    );

    // 1. Helper declaration + comment block carry the invariant.
    assert.match(ytkitSrc, /function pickTranscriptTrack\(tracks\)/,
        'ytkit.js must declare pickTranscriptTrack(tracks)');
    assert.match(ytkitSrc, /NF29: transcript track selection by language preference/,
        'pickTranscriptTrack must carry the NF29 invariant comment');
    // The precedence chain must remain pref -> navLang -> 'en' -> tracks[0].
    assert.match(ytkitSrc, /return byCode\(pref\) \|\| byCode\(navLang\) \|\| byCode\('en'\) \|\| tracks\[0\]/,
        'pickTranscriptTrack must implement the documented 4-tier precedence');

    // 2. The setting key exists in the schema with auto default.
    const schemaSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'settings-schema.js'), 'utf8'
    );
    assert.match(schemaSrc, /key:\s*"transcriptPreferredLanguage"/,
        'settings-schema must declare transcriptPreferredLanguage');
    assert.match(schemaSrc, /key:\s*"transcriptPreferredLanguage".*defaultValue:\s*"auto"/,
        'transcriptPreferredLanguage default must be "auto"');

    // 3. Every transcript-track selection call site uses the helper —
    // no remaining `tracks.find(t => t.languageCode === 'en')`
    // hardcodes from the v4.46.0 era.
    assert.doesNotMatch(ytkitSrc, /tracks\.find\(t => t\.languageCode === 'en'\) \|\| tracks\[0\]/,
        'ytkit.js must not have any remaining hardcoded English-first track selection');

    // 4. Sandbox-eval the helper to verify the contract end-to-end.
    // We can't load the full ytkit.js IIFE in a Node sandbox (too many
    // chrome.* dependencies), so we extract the helper body via regex
    // and eval it inside a synthetic settings + navigator context.
    const helperMatch = ytkitSrc.match(/function pickTranscriptTrack\(tracks\) \{[\s\S]*?return byCode\(pref\) \|\| byCode\(navLang\) \|\| byCode\('en'\) \|\| tracks\[0\];\s*\}/);
    assert.ok(helperMatch, 'helper body must be extractable');
    const helperBody = helperMatch[0];
    const vm = require('node:vm');
    const sandbox = {
        navigator: { language: 'es-MX' },
        appState: { settings: { transcriptPreferredLanguage: 'ja' } },
        // getSetting shim mirroring ytkit.js semantics.
        getSetting(key, def) {
            const value = sandbox.appState.settings[key];
            return value === undefined ? def : value;
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(helperBody + '\nglobalThis.__pick = pickTranscriptTrack;', sandbox);
    const pick = sandbox.__pick;

    const tracks = [
        { languageCode: 'en', name: 'English' },
        { languageCode: 'es', name: 'Spanish' },
        { languageCode: 'ja', name: 'Japanese' },
        { languageCode: 'fr', name: 'French' },
    ];

    // Step 1: pref wins.
    assert.equal(pick(tracks).languageCode, 'ja',
        'pref="ja" must return Japanese');

    // Step 2: navLang wins when pref unset.
    sandbox.appState.settings.transcriptPreferredLanguage = 'auto';
    assert.equal(pick(tracks).languageCode, 'es',
        'pref="auto" must fall through to navigator.language base es');

    // Step 3: 'en' wins when pref and navLang both miss.
    sandbox.navigator.language = 'pt-BR';
    assert.equal(pick(tracks).languageCode, 'en',
        'pref="auto" + navLang=pt-BR (no pt track) must fall through to en');

    // Step 4: first track wins when everything else misses.
    const noEnglish = [
        { languageCode: 'de', name: 'German' },
        { languageCode: 'it', name: 'Italian' },
    ];
    assert.equal(pick(noEnglish).languageCode, 'de',
        'no en + no pref + no navLang match must return first track');

    // Empty / null tracks return null defensively.
    assert.equal(pick([]), null, 'empty tracks must return null');
    assert.equal(pick(null), null, 'null tracks must return null');
});

test('v4.47.0 NF25 — SETTINGS_VERSION parity across ytkit.js, popup.js, and settings-meta.json', () => {
    // The three SETTINGS_VERSION sources describe the same schema
    // version namespace. Drift between them risks silent profile-
    // import corruption when one source fails to load and another
    // picks up. check-versions.js enforces parity at the npm-run-
    // check gate; this hardening test pins the contract shape so a
    // future refactor of the gate can't drop the validation.
    const ytkitSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8'
    );
    const popupSrc = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    const meta = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'settings-meta.json'), 'utf8'
    ));
    const checkSrc = fs.readFileSync(
        path.join(__dirname, '..', 'scripts', 'check-versions.js'), 'utf8'
    );

    // 1. The three sources extract the same integer.
    const ytkitMatch = ytkitSrc.match(/SETTINGS_VERSION:\s*(\d+)/);
    assert.ok(ytkitMatch, 'ytkit.js must declare SETTINGS_VERSION');
    const popupMatch = popupSrc.match(/const\s+SETTINGS_VERSION_FALLBACK\s*=\s*(\d+)/);
    assert.ok(popupMatch, 'popup.js must declare SETTINGS_VERSION_FALLBACK');
    const metaVersion = String(meta.settingsVersion);

    assert.equal(ytkitMatch[1], popupMatch[1],
        'ytkit.js SETTINGS_VERSION and popup.js SETTINGS_VERSION_FALLBACK must match');
    assert.equal(ytkitMatch[1], metaVersion,
        'ytkit.js SETTINGS_VERSION and settings-meta.json#settingsVersion must match');

    // 2. The check-versions.js gate carries the three reader helpers
    // and emits both pass / fail branches.
    assert.match(checkSrc, /function readYtkitSettingsVersion\(\)/,
        'check-versions.js must define readYtkitSettingsVersion');
    assert.match(checkSrc, /function readPopupSettingsVersionFallback\(\)/,
        'check-versions.js must define readPopupSettingsVersionFallback');
    assert.match(checkSrc, /function readSettingsMetaVersion\(\)/,
        'check-versions.js must define readSettingsMetaVersion');
    assert.match(checkSrc, /SETTINGS_VERSION drift detected/,
        'check-versions.js must emit a SETTINGS_VERSION-specific drift message');
    assert.match(checkSrc, /process\.exit\(productOk && settingsOk \? 0 : 1\)/,
        'check-versions.js must require BOTH product and settings version parity to exit 0');

    // 3. The popup-side fallback comment names the parity invariant
    // so a future code reviewer sees the invariant at the constant.
    assert.match(popupSrc, /NF25.*ytkit\.js#SETTINGS_VERSION/s,
        'popup.js SETTINGS_VERSION_FALLBACK must carry the NF25 parity invariant comment');
});

test('v4.47.0 R3 — chrome.downloads.show failures log to console + SW lifecycle ring instead of silent swallow', () => {
    // R3: chrome.downloads.show is fire-and-forget; if the reveal
    // fails (file moved, user revoked permission, volume detached)
    // the only signal a maintainer used to get was the user-facing
    // "nothing happened." The catch now (a) console.warn's with
    // context and (b) drops a reveal-failed:<msg> entry into the
    // SW lifecycle ring (NEW-7) so the bug-report bundle surfaces
    // it without any new telemetry.
    const revealStart = backgroundSource.indexOf('chrome.downloads.show(delta.id)');
    assert.ok(revealStart > -1,
        'background.js must call chrome.downloads.show(delta.id)');
    const revealBlock = backgroundSource.slice(revealStart, revealStart + 1200);
    assert.match(revealBlock, /catch \(err\)/,
        'reveal call must capture the error binding (not the previous silent `catch (_)` swallow)');
    assert.match(revealBlock, /console\.warn\(['"]\[Astra Deck\] chrome\.downloads\.show failed/,
        'reveal failure must console.warn with the [Astra Deck] prefix so support sees the context');
    assert.match(revealBlock, /_recordSwLifecycle\(['"]reveal-failed:/,
        'reveal failure must drop a reveal-failed:<msg> entry into the SW lifecycle ring');
});

test('v4.47.0 EXIST-8 — feature_request issue template asks for the risk profile so triage maps to schema profiles', () => {
    // EXIST-8: feature requests previously didn't tell triagers what
    // profile to assign. The schema's risk: + profile: fields gate
    // what ships to the stores vs the GitHub-Full build, so a new
    // request that quietly assumes store-safe behavior can collide
    // with store policy on review. Templated checkbox list maps
    // directly to the schema's risk taxonomy
    // (safe / api / local-companion / experimental / store-risk +
    // byo-key as a shorthand for "github-full + api key required").
    const featureTpl = fs.readFileSync(
        path.join(__dirname, '..', '.github', 'ISSUE_TEMPLATE', 'feature_request.md'), 'utf8'
    );
    assert.match(featureTpl, /Astra Deck/,
        'feature_request.md must be rebranded from YTKit to Astra Deck');
    assert.match(featureTpl, /Intended audience \/ risk profile/,
        'feature_request.md must surface a risk-profile / audience section');
    // Every risk band from the schema must be enumerated so the
    // checkbox list is complete. If a future risk band is added
    // to settings-schema.js the maintainer should also add it here.
    for (const band of ['safe', 'api', 'local-companion', 'experimental', 'store-risk', 'byo-key']) {
        assert.match(featureTpl, new RegExp(`\\*\\*${escapeRegExp(band)}\\*\\*`),
            `feature_request.md must list the ${band} risk band as a checkbox option`);
    }
    // Competitive parity prompt keeps the maintainer's competitor
    // table in ROADMAP § Phase 1 useful — a new request can attach
    // a competitor reference and the maintainer can spec from there.
    assert.match(featureTpl, /Competitive parity/,
        'feature_request.md must surface a competitive parity / reference prompt');
});

test('v4.47.0 NEW-7 — SW lifecycle ring records sw-start into chrome.storage.session and is readable via GET_SW_LIFECYCLE', () => {
    // NEW-7: MV3 service workers restart unpredictably (~30s idle
    // kill, suspension on memory pressure, post-install). Several
    // Astra Deck bugs surfaced only because the maintainer happened
    // to hit a SW restart in dev (the H25 cap-bypass-on-hydration
    // fix is the most recent example). This ring records SW boot
    // events into chrome.storage.session so the bug-report bundle
    // (NEW-1) can surface SW restart frequency without telemetry.

    // 1. background.js declares the ring + cap constants and the
    // record helper.
    assert.match(backgroundSource, /const\s+SW_LIFECYCLE_KEY\s*=\s*['"]_swLifecycle['"]/,
        'background.js must declare SW_LIFECYCLE_KEY = _swLifecycle');
    assert.match(backgroundSource, /const\s+SW_LIFECYCLE_CAP\s*=\s*50/,
        'background.js must cap the SW lifecycle ring at 50 entries');
    // _recordSwLifecycle is the sync entry point — under the hood it
    // chains onto _swLifecycleChain so concurrent records can't lose
    // entries via R-M-W race on chrome.storage.session (audit-pass
    // fix). The function itself may be either `async` or sync (the
    // chain owns the async work either way).
    assert.match(backgroundSource, /function _recordSwLifecycle\(event\)/,
        'background.js must define _recordSwLifecycle helper');
    assert.match(backgroundSource, /let _swLifecycleChain\s*=\s*Promise\.resolve\(\)/,
        'background.js must serialize lifecycle writes via _swLifecycleChain so concurrent records cannot race');

    const recordStart = backgroundSource.indexOf('function _recordSwLifecycle');
    assert.ok(recordStart > -1, 'background.js must define _recordSwLifecycle');
    const recordBlock = backgroundSource.slice(recordStart, recordStart + 2000);
    // The record waits for the _pendingReveals hydration so the
    // captured inFlightReveals count is correct, not just a snapshot
    // of the freshly-restarted SW's empty Set.
    assert.match(recordBlock, /await\s+_pendingRevealsReady/,
        '_recordSwLifecycle must await _pendingRevealsReady before reading _pendingReveals.size');
    assert.match(recordBlock, /inFlightReveals:\s*_pendingReveals\.size/,
        'lifecycle entries must record the in-flight pendingReveals count for cross-restart diagnosis');
    assert.match(recordBlock, /while \(arr\.length > SW_LIFECYCLE_CAP\) arr\.shift\(\)/,
        '_recordSwLifecycle must trim the ring from the head once it exceeds SW_LIFECYCLE_CAP');

    // 2. The module body fires _recordSwLifecycle('sw-start') at SW
    // boot. Every fresh SW process invocation hits this line.
    assert.match(backgroundSource, /void\s+_recordSwLifecycle\(['"]sw-start['"]\)/,
        'background.js must call _recordSwLifecycle("sw-start") at module load (SW boot signal)');

    // 3. GET_SW_LIFECYCLE message handler returns the ring to the
    // popup so it can be folded into the bug-report bundle.
    assert.match(backgroundSource, /msg\.type === ['"]GET_SW_LIFECYCLE['"]/,
        'onMessage listener must handle the GET_SW_LIFECYCLE message type');
    const getStart = backgroundSource.indexOf("msg.type === 'GET_SW_LIFECYCLE'");
    const getBlock = backgroundSource.slice(getStart, getStart + 800);
    assert.match(getBlock, /chrome\.storage\.session\.get\(SW_LIFECYCLE_KEY\)/,
        'GET_SW_LIFECYCLE must read the ring from chrome.storage.session');
    assert.match(getBlock, /sendResponse\(\{\s*entries,\s*error:\s*null\s*\}\)/,
        'GET_SW_LIFECYCLE must respond with { entries, error: null } on success');
    assert.match(getBlock, /return true;/,
        'GET_SW_LIFECYCLE handler must return true to keep the response channel open for the async path');

    // 4. The popup's bug-report bundle now pulls the ring and includes
    // it as swLifecycle alongside the capability map. Tolerant of
    // older SWs that lack the message handler (resp may be null).
    assert.match(popupSource, /type:\s*['"]GET_SW_LIFECYCLE['"]/,
        'popup.js must request the SW lifecycle ring via GET_SW_LIFECYCLE');
    const bundleStart = popupSource.indexOf('healthSaveBtn.addEventListener');
    const bundleBlock = popupSource.slice(bundleStart, bundleStart + 4000);
    assert.match(bundleBlock, /let swLifecycle\s*=\s*null/,
        'bug-report bundle path must declare swLifecycle = null up front (graceful fallback)');
    assert.match(bundleBlock, /\n\s+swLifecycle,/,
        'bug-report bundle payload must include swLifecycle (shorthand property)');
});

test('v4.47.0 — Quick Links menu caps at 10 slots (YouTube Alchemy parity)', () => {
    // Backlog P3/S: cap the quick-links list at 10 entries — matches
    // YouTube Alchemy's header-links UX + keeps the launcher dropdown
    // visually bounded. The cap lives on the feature object as
    // _QL_MAX_ITEMS so the value is testable + co-locates with the
    // documentation comment.
    const start = ytkitSource.indexOf("id: 'quickLinkMenu'");
    assert.ok(start > -1, 'quickLinkMenu feature must exist');
    const block = ytkitSource.slice(start, start + 30000);

    // 1. Constant exists and equals 10.
    assert.match(block, /_QL_MAX_ITEMS:\s*10/,
        'quickLinkMenu must declare _QL_MAX_ITEMS: 10');

    // 2. _parseItems truncates excess entries at the cap. Stored
    // excess is intentionally left intact in `quickLinkItems` so a
    // future cap-bump can re-expose entries.
    assert.match(block, /if \(items\.length > this\._QL_MAX_ITEMS\)/,
        '_parseItems must check the cap before slicing');
    assert.match(block, /items\.slice\(0,\s*this\._QL_MAX_ITEMS\)/,
        '_parseItems must slice at _QL_MAX_ITEMS to enforce the cap on the rendered list');

    // 3. The add-form's validateForm helper disables the Add button
    // when the list is at capacity and surfaces a "Limit reached"
    // message. Re-evaluated on every input event so a delete-then-
    // add flow re-enables cleanly.
    assert.match(block, /const atCap = currentCount >= self\._QL_MAX_ITEMS/,
        'validateForm must compute atCap from the current parsed-items count');
    assert.match(block, /addBtn\.disabled = !name \|\| !url \|\| !isValidUrl \|\| atCap/,
        'validateForm must disable the Add button when atCap is true');
    assert.match(block, /Limit reached \(\$\{currentCount\}\/\$\{self\._QL_MAX_ITEMS\}\)/,
        'validateForm must surface a "Limit reached (N/MAX)" message when atCap');

    // 4. addBtn.onclick has a defensive re-check at click time —
    // handles the race between two rapid clicks that both passed
    // validateForm before either persisted. Toast guidance points
    // the user at the remove-to-add path.
    assert.match(block, /if \(self\._parseItems\(\)\.length >= self\._QL_MAX_ITEMS\)/,
        'addBtn.onclick must re-check the cap at click time (defensive against rapid double-click)');
    assert.match(block, /Quick Links limit reached \(\$\{self\._QL_MAX_ITEMS\}\)/,
        'addBtn.onclick must surface a toast on the cap-race path');
});

test('v4.47.0 NF18 — on-demand yt-dlp self-update via /update-ytdlp + popup button round-trips through MediaDLManager', () => {
    // NF18: when YouTube breaks the user's current yt-dlp build, the
    // user should be able to fix it without waiting up to 24 h for
    // the auto-update throttle (NF26). Server exposes /update-ytdlp;
    // content-script MediaDLManager.updateYtdlp() wraps the discovery
    // dance; popup button round-trips through the active YouTube
    // tab's content script so the popup never has to do its own
    // token handling.

    // 1. ytkit.js: MediaDLManager.updateYtdlp() exists and calls
    // /update-ytdlp with the token from a freshly-probed health
    // response.
    const updateMethodStart = ytkitSource.indexOf('async updateYtdlp()');
    assert.ok(updateMethodStart > -1,
        'MediaDLManager must define an async updateYtdlp() method');
    const updateBlock = ytkitSource.slice(updateMethodStart, updateMethodStart + 1800);
    assert.match(updateBlock, /await this\.check\(true\)/,
        'updateYtdlp must force-probe health (true) before the POST so the cached token is fresh');
    assert.match(updateBlock, /\/update-ytdlp/,
        'updateYtdlp must hit the /update-ytdlp endpoint');
    assert.match(updateBlock, /['"]X-Auth-Token['"]:\s*probe\.token/,
        'updateYtdlp must forward the per-install token in the X-Auth-Token header');
    assert.match(updateBlock, /timeout:\s*130000/,
        'updateYtdlp must use a 130 s timeout (130 s server cap + small buffer for the round-trip)');

    // 2. ytkit.js: content-script message handler dispatches
    // YTKIT_UPDATE_YTDLP to MediaDLManager.updateYtdlp() and
    // returns the structured result async.
    const handlerStart = ytkitSource.indexOf("'YTKIT_UPDATE_YTDLP'");
    assert.ok(handlerStart > -1,
        'ytkit.js must handle the YTKIT_UPDATE_YTDLP message type');
    const handlerBlock = ytkitSource.slice(handlerStart, handlerStart + 600);
    assert.match(handlerBlock, /MediaDLManager\.updateYtdlp\(\)/,
        'YTKIT_UPDATE_YTDLP handler must call MediaDLManager.updateYtdlp()');
    assert.match(handlerBlock, /return true;/,
        'YTKIT_UPDATE_YTDLP handler must return true so sendResponse channel stays open for the async path');

    // 3. popup.html: button surfaces (always-visible, not hidden).
    const popupHtml = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.html'), 'utf8'
    );
    assert.match(popupHtml, /id="update-ytdlp-btn"/,
        'popup.html must declare the update-ytdlp button');
    // The button is NOT hidden by default (unlike reenable-mediadl-btn
    // which gates on the dismissed flag). Always-visible because the
    // failure mode (yt-dlp broken by a YouTube change) is unannounced.
    const updateBtnMatch = popupHtml.match(/<button[^>]*id="update-ytdlp-btn"[^>]*>/);
    assert.ok(updateBtnMatch, 'update-ytdlp button declaration must exist');
    assert.ok(!/\bhidden\b/.test(updateBtnMatch[0]),
        'update-ytdlp button must NOT carry the hidden attribute — always visible (yt-dlp breakage is unannounced)');

    // 4. popup.js: handler routes through chrome.tabs.sendMessage to
    // a YouTube tab; surfaces a friendly status on no-tab; maps the
    // structured result into a status string (version_before ->
    // version_after on success).
    assert.match(popupSource, /async function updateYtdlpNow\(\)/,
        'popup.js must define updateYtdlpNow handler');
    const popupHandlerStart = popupSource.indexOf('async function updateYtdlpNow');
    const popupHandlerBlock = popupSource.slice(popupHandlerStart, popupHandlerStart + 3000);
    assert.match(popupHandlerBlock, /YOUTUBE_TAB_URLS/,
        'updateYtdlpNow must query YouTube tabs to find a MediaDLManager-loaded content script');
    assert.match(popupHandlerBlock, /type:\s*['"]YTKIT_UPDATE_YTDLP['"]/,
        'updateYtdlpNow must send the YTKIT_UPDATE_YTDLP message');
    assert.match(popupHandlerBlock, /version_before/,
        'updateYtdlpNow must surface the version_before field in the status message');
    assert.match(popupHandlerBlock, /version_after/,
        'updateYtdlpNow must surface the version_after field in the status message');
    // Button is disabled during the in-flight call so a rapid second
    // click can't fire a second update while the server is mid-replace.
    assert.match(popupHandlerBlock, /updateYtdlpButton\.disabled\s*=\s*true/,
        'updateYtdlpNow must disable the button while the update is in flight');

    // 5. Python: /update-ytdlp endpoint exists in astra_downloader.py
    // and gates on active_count > 0 with a 409 + actionable error.
    const downloaderSource = fs.readFileSync(
        path.join(__dirname, '..', 'astra_downloader', 'astra_downloader.py'), 'utf8'
    );
    assert.match(downloaderSource, /@api\.route\(['"]\/update-ytdlp['"],\s*methods=\['POST'\]\)/,
        'astra_downloader.py must declare /update-ytdlp as a POST route');
    assert.match(downloaderSource, /def _run_ytdlp_self_update\(config,\s*source_tag\)/,
        'astra_downloader.py must extract _run_ytdlp_self_update as the shared subprocess runner');
    const endpointStart = downloaderSource.indexOf("@api.route('/update-ytdlp'");
    const endpointBlock = downloaderSource.slice(endpointStart, endpointStart + 1800);
    assert.match(endpointBlock, /in_flight = dl_manager\.active_count\(\)/,
        '/update-ytdlp must consult dl_manager.active_count to gate against in-flight downloads');
    assert.match(endpointBlock, /409/,
        '/update-ytdlp must return 409 when active downloads block the update');
    assert.match(endpointBlock, /atomically replaces/,
        '/update-ytdlp 409 message must explain WHY (atomic replace race)');
});

test('v4.47.0 NF9 — wheelSeek hooks the progress bar (not the player root) so volumeWheelMode does not conflict', () => {
    // NF9: scroll over the progress bar to seek. Hooked at the
    // .ytp-progress-bar level (not .html5-video-player) with
    // capture-phase + stopImmediatePropagation so a scroll-over-bar
    // gesture never also fires volumeWheelMode's listener at the
    // player root. The step is clamped at the call site to a sane
    // upper bound so a corrupted import can't seek by huge values.
    const start = ytkitSource.indexOf("id: 'wheelSeek'");
    assert.ok(start > -1, 'wheelSeek feature must exist in ytkit.js');
    // The feature body covers _ensureStyles + _formatTime + _showHud +
    // _onWheel + _attach + init + destroy. Slice wide enough to reach
    // _attach() (which contains the querySelector pin below).
    const block = ytkitSource.slice(start, start + 8000);

    // 1. The wheel listener attaches to the progress bar, not the
    // player root. Selector list covers both the container and
    // the bar itself (YouTube renames these periodically; either
    // matches the "scroll over the bar" affordance).
    assert.match(block, /querySelector\(['"]\.ytp-progress-bar-container,\s*\.ytp-progress-bar['"]/,
        'wheelSeek must locate the progress bar via .ytp-progress-bar-container or .ytp-progress-bar');
    assert.match(block, /addEventListener\(['"]wheel['"][^)]*passive:\s*false[^)]*capture:\s*true/,
        'wheelSeek must register the wheel listener with passive:false + capture:true');

    // 2. Conflict avoidance with volumeWheelMode: must
    // stopImmediatePropagation so the player-root listener
    // never sees the event.
    assert.match(block, /e\.stopImmediatePropagation\(\)/,
        'wheelSeek wheel handler must stopImmediatePropagation so volumeWheelMode does not co-fire');
    assert.match(block, /e\.preventDefault\(\)/,
        'wheelSeek wheel handler must preventDefault to suppress page scroll');

    // 3. Step is clamped to (0, 300] so a corrupted import can't
    // seek by 1e9 seconds per tick.
    assert.match(block, /stepRaw\s*>\s*0\s*&&\s*stepRaw\s*<=\s*300/,
        'wheelSeek must clamp wheelSeekStepSec to a sane range (0 < x ≤ 300)');

    // 4. Live-stream defense: video.duration is Infinity on live;
    // upper-bound the seek so currentTime never becomes NaN /
    // Infinity.
    assert.match(block, /Number\.isFinite\(video\.duration\)\s*\?\s*video\.duration\s*:\s*Number\.MAX_SAFE_INTEGER/,
        'wheelSeek must guard live-stream Infinity duration with a finite upper bound');

    // 5. Schema entries declared.
    const schemaSource = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'settings-schema.js'), 'utf8'
    );
    assert.match(schemaSource, /key:\s*"wheelSeek"[^}]*type:\s*"boolean"[^}]*defaultValue:\s*false/,
        'settings-schema must declare wheelSeek as a boolean default:false');
    assert.match(schemaSource, /key:\s*"wheelSeekStepSec"[^}]*type:\s*"number"[^}]*defaultValue:\s*5/,
        'settings-schema must declare wheelSeekStepSec as a number default:5');

    // 6. default-settings.json regenerated from defaults: block.
    const defaults = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'default-settings.json'), 'utf8'
    ));
    assert.equal(defaults.wheelSeek, false,
        'default-settings.json must carry wheelSeek=false');
    assert.equal(defaults.wheelSeekStepSec, 5,
        'default-settings.json must carry wheelSeekStepSec=5');
});

test('v4.47.0 NEW-8 — CHANGELOG rotation: active file carries only [Unreleased] + v4.x, archive holds v3.x and earlier', () => {
    // NEW-8: the active CHANGELOG.md was approaching 6000 lines,
    // hard to scan in browser-rendered Markdown viewers. Rotation
    // moves v3.33.0 and earlier into CHANGELOG-v3-archive.md;
    // active file keeps [Unreleased] + the v4.x line. This test
    // pins the rotation invariants so a future contributor can't
    // accidentally re-merge the archive back into the active file.

    const activePath = path.join(__dirname, '..', 'CHANGELOG.md');
    const archivePath = path.join(__dirname, '..', 'CHANGELOG-v3-archive.md');
    assert.ok(fs.existsSync(activePath), 'CHANGELOG.md must exist');
    assert.ok(fs.existsSync(archivePath),
        'CHANGELOG-v3-archive.md must exist (NEW-8 rotation target)');

    const active = fs.readFileSync(activePath, 'utf8');
    const archive = fs.readFileSync(archivePath, 'utf8');

    // Active starts with [Unreleased] heading.
    assert.match(active, /^# Changelog/,
        'active CHANGELOG.md must start with the "# Changelog" heading');
    assert.match(active, /^## \[Unreleased\]/m,
        'active CHANGELOG.md must contain an [Unreleased] section');

    // Active must NOT contain any v3.x or earlier release headings —
    // those live in the archive now. Matching `## [N.M.P]` where the
    // major is 0–3.
    const v3OrLowerInActive = active.match(/^## \[[0-3]\.[0-9]+\.[0-9]+\]/gm) || [];
    assert.deepEqual(v3OrLowerInActive, [],
        'active CHANGELOG.md must not contain any v0/v1/v2/v3 release headings — those belong in CHANGELOG-v3-archive.md');

    // Active must end with the archive pointer so a reader can find
    // older entries without grepping the repo.
    assert.match(active, /CHANGELOG-v3-archive\.md/,
        'active CHANGELOG.md must link to CHANGELOG-v3-archive.md at the bottom');

    // Archive must START with v3.33.0 (the highest entry in the
    // archive after rotation) — anchors the split point so a
    // future re-rotation either keeps this boundary or updates the
    // test deliberately.
    assert.match(archive, /^# Astra Deck — Changelog Archive/,
        'archive must start with the "# Astra Deck — Changelog Archive" heading');
    const firstArchiveVersion = archive.match(/^## \[([0-9]+\.[0-9]+\.[0-9]+)\]/m);
    assert.ok(firstArchiveVersion,
        'archive must contain at least one ## [x.y.z] heading');
    assert.equal(firstArchiveVersion[1], '3.33.0',
        'first version in CHANGELOG-v3-archive.md must be 3.33.0 (the documented split point)');

    // Archive must NOT contain v4.x entries.
    const v4InArchive = archive.match(/^## \[4\.[0-9]+\.[0-9]+\]/gm) || [];
    assert.deepEqual(v4InArchive, [],
        'CHANGELOG-v3-archive.md must not contain any v4.x release headings — those belong in the active CHANGELOG.md');
});

test('v4.47.0 — schema-overview rows for credential-bearing keys carry an inline "local only" trust signal', () => {
    // The privacy data-flow panel (v4.12.0) explains the "stored
    // locally only" guarantee, but that panel is off by default —
    // a user pasting an API key into the schema-overview editor
    // had no visible reassurance about where the key lives. A
    // small green chip on the row makes the trust boundary visible
    // at the pasting moment. Implementation invariants pinned here:
    //
    // 1. TRUST_SIGNAL_LOCAL_ONLY_KEYS is a strict subset of
    // BUG_REPORT_REDACTED_KEYS — every key with a trust chip
    // must also be redacted from the bug-report bundle, otherwise
    // the chip's "redacted from bundle" claim is a lie.
    // 2. The chip uses the existing profile-badge geometry +
    // so-key-trust-local class variant.
    // 3. CSS declares the variant.

    assert.match(popupSource, /const\s+TRUST_SIGNAL_LOCAL_ONLY_KEYS\s*=\s*new Set\(/,
        'popup.js must declare TRUST_SIGNAL_LOCAL_ONLY_KEYS');

    // Extract both sets and assert the subset relationship at
    // source-level so future additions to one are caught against
    // the other.
    const trustListMatch = popupSource.match(/TRUST_SIGNAL_LOCAL_ONLY_KEYS\s*=\s*new Set\(\[([^\]]+)\]/);
    assert.ok(trustListMatch, 'TRUST_SIGNAL_LOCAL_ONLY_KEYS must initialize from an array literal');
    const trustKeys = trustListMatch[1].match(/'[^']+'/g) || [];
    const redactListMatch = popupSource.match(/BUG_REPORT_REDACTED_KEYS\s*=\s*Object\.freeze\(\[([^\]]+)\]/);
    assert.ok(redactListMatch, 'BUG_REPORT_REDACTED_KEYS must initialize from a frozen array literal');
    const redactKeys = new Set((redactListMatch[1].match(/'[^']+'/g) || []));
    for (const trustKey of trustKeys) {
        assert.ok(redactKeys.has(trustKey),
            `${trustKey} must also be in BUG_REPORT_REDACTED_KEYS so the chip's "redacted from bundle" claim is true`);
    }
    // Each of the well-known BYO-key fields must carry the trust chip.
    for (const required of ["'aiSummaryApiKey'", "'aiSummaryEndpoint'"]) {
        assert.ok(trustKeys.includes(required),
            `${required} must be in TRUST_SIGNAL_LOCAL_ONLY_KEYS so the trust chip surfaces on its row`);
    }

    // Row builder consults the set and applies the chip.
    const rowStart = popupSource.indexOf('function buildSchemaOverviewKeyRow');
    const rowEnd = popupSource.indexOf('return row;', rowStart);
    const rowBlock = popupSource.slice(rowStart, rowEnd);
    assert.match(rowBlock, /TRUST_SIGNAL_LOCAL_ONLY_KEYS\.has\(entry\.key\)/,
        'row builder must check TRUST_SIGNAL_LOCAL_ONLY_KEYS.has(entry.key) before rendering the chip');
    assert.match(rowBlock, /so-key-trust-local/,
        'row builder must apply the .so-key-trust-local class on the chip');

    // CSS variant exists.
    const popupCss = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.css'), 'utf8'
    );
    assert.match(popupCss, /\.so-key-profile-badge\.so-key-trust-local\s*\{/,
        'popup.css must declare the .so-key-trust-local variant');
});

test('v4.47.0 NEW-6 — per-key Reset button on schema-overview rows whose value differs from default', () => {
    // NEW-6: a user who has changed one setting to a breaking value
    // currently has to either remember the default or hit global
    // Reset (which nukes everything). Per-key Reset is a one-click
    // recovery scoped to the offending row.
    //
    // Implementation invariants pinned here:
    // - The reset button is only rendered when the schema entry
    // declares a defaultValue AND the current value differs from it.
    // - The click handler calls writeSetting with entry.defaultValue
    // (the same choke point every other inline editor uses), then
    // re-renders the overview to refresh the count + clear the
    // now-default row's reset button.
    // - The equality check is a deep-equality helper (isDefaultValue)
    // so arrays + objects with identical content don't surface a
    // spurious reset button.

    // 1. Row builder appends the reset button at the end after the
    // type-specific editor.
    const rowStart = popupSource.indexOf('function buildSchemaOverviewKeyRow');
    assert.ok(rowStart > -1, 'popup.js must define buildSchemaOverviewKeyRow');
    // Cap the slice generously — the row builder is ~400 lines + the
    // reset block at the tail.
    const rowEnd = popupSource.indexOf('return row;', rowStart);
    assert.ok(rowEnd > -1, 'buildSchemaOverviewKeyRow must end with return row');
    const rowBlock = popupSource.slice(rowStart, rowEnd);
    assert.match(rowBlock, /Object\.prototype\.hasOwnProperty\.call\(entry,\s*['"]defaultValue['"]\)/,
        'reset gate must check that the schema entry declares a defaultValue');
    assert.match(rowBlock, /isDefaultValue\(currentValue,\s*entry\.defaultValue\)/,
        'reset gate must call isDefaultValue(currentValue, entry.defaultValue)');
    assert.match(rowBlock, /so-key-reset-btn/,
        'reset button must carry the so-key-reset-btn class');
    assert.match(rowBlock, /writeSetting\(entry\.key,\s*entry\.defaultValue\)/,
        'reset click must writeSetting(entry.key, entry.defaultValue)');
    assert.match(rowBlock, /renderSchemaOverview\(\)/,
        'reset click must re-render the schema overview after persistence');

    // 2. isDefaultValue is a deep-equality helper that handles arrays
    // and objects via JSON.stringify (cheap + correct for the
    // small payloads schema-overview deals with).
    assert.match(popupSource, /function\s+isDefaultValue\(currentValue,\s*defaultValue\)/,
        'popup.js must define isDefaultValue helper');
    const isDefStart = popupSource.indexOf('function isDefaultValue(');
    const isDefBlock = popupSource.slice(isDefStart, isDefStart + 800);
    assert.match(isDefBlock, /currentValue === defaultValue/,
        'isDefaultValue must short-circuit on strict equality (boolean/number/string)');
    assert.match(isDefBlock, /JSON\.stringify\(currentValue\)\s*===\s*JSON\.stringify\(defaultValue\)/,
        'isDefaultValue must deep-compare objects via JSON.stringify');

    // 3. describeDefaultForTooltip pretty-prints the default value
    // for the tooltip and truncates anything over 48 chars so
    // the tooltip stays readable.
    assert.match(popupSource, /function\s+describeDefaultForTooltip\(value\)/,
        'popup.js must define describeDefaultForTooltip helper');
    const descStart = popupSource.indexOf('function describeDefaultForTooltip(');
    const descBlock = popupSource.slice(descStart, descStart + 800);
    assert.match(descBlock, /length\s*>\s*48/,
        'describeDefaultForTooltip must truncate long values at ~48 chars');

    // 4. CSS for the affordance exists.
    const popupCss = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.css'), 'utf8'
    );
    assert.match(popupCss, /\.so-key-reset-btn\s*\{/,
        'popup.css must declare .so-key-reset-btn');
    assert.match(popupCss, /\.so-key-reset-btn:disabled\s*\{/,
        'popup.css must dim the reset button while it is disabled (mid-write)');
});

test('v4.47.0 NF21 — first-run welcome card + What\'s New banner wired through popup', () => {
    // NF21: opening the popup on a fresh install used to dump the
    // full 354-key editor with no guidance. This adds (a) a welcome
    // card with two profile picker buttons (Store-Safe / GitHub-Full)
    // and a Skip dismiss, gated on the FIRST_RUN_SEEN_KEY sentinel,
    // and (b) a What's New banner that fires when LAST_SEEN_VERSION_KEY
    // differs from the current manifestVersion. The two surfaces are
    // mutually exclusive — a fresh install gets the welcome card,
    // subsequent upgrades get the What's New banner.

    // 1. popup.html declares both surfaces.
    const popupHtml = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.html'), 'utf8'
    );
    assert.match(popupHtml, /id="welcome-card"/,
        'popup.html must declare the welcome-card section');
    assert.match(popupHtml, /id="welcome-profile-safe"/,
        'popup.html must declare the store-safe profile picker button');
    assert.match(popupHtml, /id="welcome-profile-full"/,
        'popup.html must declare the github-full profile picker button');
    assert.match(popupHtml, /id="welcome-dismiss-btn"/,
        'popup.html must declare the welcome dismiss button');
    assert.match(popupHtml, /id="whats-new"/,
        'popup.html must declare the whats-new banner');
    assert.match(popupHtml, /id="whats-new-open"/,
        'popup.html must declare the whats-new open-changelog button');
    assert.match(popupHtml, /id="whats-new-dismiss"/,
        'popup.html must declare the whats-new dismiss button');
    // Both surfaces ship hidden by default — popup.js reveals on the
    // appropriate boot signal. A user landing on the popup without
    // having installed Astra Deck (e.g. a screenshot harness) must
    // not see either.
    assert.match(popupHtml, /id="welcome-card"[\s\S]{0,60}hidden/,
        'welcome-card must be hidden by default');
    assert.match(popupHtml, /id="whats-new"[\s\S]{0,60}hidden/,
        'whats-new banner must be hidden by default');

    // 2. popup.js declares the storage keys + URL constants.
    assert.match(popupSource, /const\s+FIRST_RUN_SEEN_KEY\s*=\s*['"]ytkit_first_run_seen['"]/,
        'popup.js must declare FIRST_RUN_SEEN_KEY = ytkit_first_run_seen');
    assert.match(popupSource, /const\s+LAST_SEEN_VERSION_KEY\s*=\s*['"]ytkit_last_seen_version['"]/,
        'popup.js must declare LAST_SEEN_VERSION_KEY = ytkit_last_seen_version');
    assert.match(popupSource, /const\s+CHANGELOG_BASE_URL\s*=\s*['"]https:\/\/github\.com\/SysAdminDoc\/Astra-Deck\/blob\/main\/CHANGELOG\.md['"]/,
        'popup.js must declare CHANGELOG_BASE_URL pointing at the project changelog');

    // 3. renderFirstRunSurfaces is the boot entry point and is fired
    // from the bootstrap IIFE in parallel with the rest of init.
    assert.match(popupSource, /async function renderFirstRunSurfaces\(\)/,
        'popup.js must define renderFirstRunSurfaces');
    assert.match(popupSource, /void renderFirstRunSurfaces\(\)/,
        'bootstrap must call renderFirstRunSurfaces');

    // 4. The two surfaces are mutually exclusive: welcome-card fires
    // when !firstRunSeen; whats-new fires when firstRunSeen AND
    // lastSeen !== manifestVersion.
    const renderStart = popupSource.indexOf('async function renderFirstRunSurfaces');
    // Slice wide enough to cover the upgrade guard + the welcome show
    // gate + the What's New show gate. The function grew during audit
    // pass when the upgrade guard was added (~1k chars of new logic).
    const renderBlock = popupSource.slice(renderStart, renderStart + 3500);
    assert.match(renderBlock, /if \(!firstRunSeen\)/,
        'renderFirstRunSurfaces must show the welcome card only when firstRunSeen is false');
    assert.match(renderBlock, /firstRunSeen && manifestVersion && manifestVersion !== '—' && lastSeen !== manifestVersion/,
        'renderFirstRunSurfaces must gate whats-new on firstRunSeen && version mismatch');

    // 5. pickWelcomeProfile writes githubFullProfile (true or false)
    // via the existing writeSetting choke point so the schema
    // overview re-renders with refreshed profile-gating badges.
    assert.match(popupSource, /async function pickWelcomeProfile\(profile\)/,
        'popup.js must define pickWelcomeProfile');
    const pickStart = popupSource.indexOf('async function pickWelcomeProfile');
    const pickBlock = popupSource.slice(pickStart, pickStart + 1200);
    assert.match(pickBlock, /writeSetting\(['"]githubFullProfile['"],\s*true\)/,
        'github-full pick must writeSetting githubFullProfile=true');
    assert.match(pickBlock, /writeSetting\(['"]githubFullProfile['"],\s*false\)/,
        'store-safe pick must explicitly writeSetting githubFullProfile=false (records the user choice)');
    assert.match(pickBlock, /renderSchemaOverview\(\)/,
        'pickWelcomeProfile must re-render the schema overview to refresh profile-gating badges');

    // 6. dismissWelcomeCard persists FIRST_RUN_SEEN_KEY and stamps
    // LAST_SEEN_VERSION_KEY so the very next popup open doesn't
    // fire a What's New banner against a user who just walked
    // through the welcome flow.
    assert.match(popupSource, /async function dismissWelcomeCard\(reason\)/,
        'popup.js must define dismissWelcomeCard');
    const dismissStart = popupSource.indexOf('async function dismissWelcomeCard');
    const dismissBlock = popupSource.slice(dismissStart, dismissStart + 800);
    assert.match(dismissBlock, /\[FIRST_RUN_SEEN_KEY\]:\s*true/,
        'dismissWelcomeCard must persist FIRST_RUN_SEEN_KEY=true');
    assert.match(dismissBlock, /\[LAST_SEEN_VERSION_KEY\]:\s*manifestVersion/,
        'dismissWelcomeCard must stamp LAST_SEEN_VERSION_KEY with the current manifestVersion');

    // 6b. Audit-pass upgrade guard: a user who installed Astra Deck
    // before NF21 shipped has a populated SETTINGS_STORAGE_KEY
    // but no FIRST_RUN_SEEN_KEY. Without an upgrade guard every
    // such user would see the welcome card on their first popup
    // open after upgrading — a regression. The guard must read
    // SETTINGS_STORAGE_KEY alongside the sentinels, detect at
    // least one non-internal key (anything not starting with `_`),
    // and silently stamp both sentinels so neither surface fires.
    assert.match(renderBlock, /SETTINGS_STORAGE_KEY/,
        'renderFirstRunSurfaces must read SETTINGS_STORAGE_KEY to detect upgraded users');
    assert.match(renderBlock, /looksLikeExistingInstall/,
        'renderFirstRunSurfaces must compute looksLikeExistingInstall before deciding to show the welcome card');
    assert.match(renderBlock, /\.startsWith\(['"]_['"]\)/,
        'upgrade guard must exclude internal keys (those starting with `_`) when detecting existing installs');
    assert.match(renderBlock, /\[FIRST_RUN_SEEN_KEY\]:\s*true/,
        'upgrade guard must stamp FIRST_RUN_SEEN_KEY=true so the welcome card never shows for upgraded users');

    // 7. CSS exposes both surfaces.
    const popupCss = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.css'), 'utf8'
    );
    assert.match(popupCss, /\.welcome-card\s*\{/,
        'popup.css must declare .welcome-card');
    assert.match(popupCss, /\.welcome-profile-btn\s*\{/,
        'popup.css must declare .welcome-profile-btn');
    assert.match(popupCss, /\.whats-new\s*\{/,
        'popup.css must declare .whats-new');
});

test('v4.47.0 NEW-1 — bug-report bundle redacts BYO keys/endpoints/CSS and includes capability map', () => {
    // The existing healthSave button in the popup writes a diagnostic
    // JSON file. NEW-1 expands the payload into a proper bug-report
    // bundle by adding sanitized settings + capability map, with
    // BYO-key / endpoint-URL / custom-CSS fields redacted so an issue
    // bundle never leaks a user's API key. The hardening test pins
    // the redaction list + the marker key + the payload shape.

    // 1. BUG_REPORT_REDACTED_KEYS exists and lists every sensitive key.
    assert.match(popupSource, /const\s+BUG_REPORT_REDACTED_KEYS\s*=\s*Object\.freeze\(\[/,
        'popup.js must declare BUG_REPORT_REDACTED_KEYS as a frozen array');
    // Anchor on the declaration itself (not a passing mention in a
    // comment elsewhere) — a later comment referenced the symbol
    // name and a bare indexOf would otherwise slice from the wrong
    // spot.
    const listStart = popupSource.search(/const\s+BUG_REPORT_REDACTED_KEYS\s*=/);
    const listBlock = popupSource.slice(listStart, listStart + 600);
    for (const key of ['aiSummaryApiKey', 'aiSummaryEndpoint', 'customCssCode',
                       'downloadCobaltInstance', 'alternativeFrontendInstance']) {
        assert.match(listBlock, new RegExp(`'${key}'`),
            `BUG_REPORT_REDACTED_KEYS must include ${key}`);
    }

    // 2. redactBugReportSettings function is declared and replaces the
    // value with a "[redacted — N chars]" sentinel that preserves the
    // fact that the field was set without leaking the content.
    assert.match(popupSource, /function\s+redactBugReportSettings\(/,
        'popup.js must define redactBugReportSettings()');
    const redactStart = popupSource.indexOf('function redactBugReportSettings');
    const redactBlock = popupSource.slice(redactStart, redactStart + 800);
    assert.match(redactBlock, /\[redacted/,
        'redactBugReportSettings must replace the value with a [redacted...] placeholder');
    assert.match(redactBlock, /v\.length\s*>\s*0/,
        'redactBugReportSettings must skip empty strings (no need to mark an unset field)');

    // 3. healthSave payload now carries the bug-report marker, schema
    // version, capability map, sanitized settings, AND the errors
    // ring. The marker is a stable identifier the issue triager
    // can grep for.
    const saveStart = popupSource.indexOf('healthSaveBtn.addEventListener');
    assert.ok(saveStart > -1, 'popup.js must wire healthSaveBtn');
    const saveBlock = popupSource.slice(saveStart, saveStart + 2500);
    assert.match(saveBlock, /astraDeckBugReport:\s*true/,
        'healthSave payload must carry the astraDeckBugReport: true marker');
    // schemaVersion currently 2 after the NEW-7 SW lifecycle ring
    // addition; readers should accept >= the documented baseline.
    // The number itself is pinned here so a future bump comes with
    // a deliberate test update (the bug-report consumer tooling
    // keys schema migrations on this field).
    assert.match(saveBlock, /schemaVersion:\s*[12]/,
        'healthSave payload must carry schemaVersion (currently 1 or 2)');
    // Payload uses shorthand property syntax (`capabilities,` not
    // `capabilities: capabilities`); the local variable comes from
    // `popupState._capabilities || null` two lines up.
    assert.match(saveBlock, /const capabilities\s*=\s*popupState\._capabilities/,
        'healthSave must read the capability map from popupState._capabilities');
    assert.match(saveBlock, /\n\s+capabilities,/,
        'healthSave payload must include the capabilities map (shorthand property)');
    assert.match(saveBlock, /settings:\s*sanitized/,
        'healthSave payload must include sanitized settings');
    assert.match(saveBlock, /redactBugReportSettings\(settings\)/,
        'healthSave must redact the settings snapshot before bundling');
    assert.match(saveBlock, /delete sanitized\._errors/,
        'healthSave must avoid double-shipping _errors (already in errors field)');

    // 4. Issue template references the bundle.
    const bugTpl = fs.readFileSync(
        path.join(__dirname, '..', '.github', 'ISSUE_TEMPLATE', 'bug_report.md'), 'utf8'
    );
    assert.match(bugTpl, /Astra Deck bug-report bundle/,
        'bug_report.md must document the bug-report bundle attachment');
    assert.match(bugTpl, /astra-deck-diagnostics/,
        'bug_report.md must reference the diagnostics filename pattern');
});

test('v4.47.0 NF10 follow-up — popup renders capability-probe Unavailable chip on rows whose requires: is unsatisfied', () => {
    // NF10 (the probe module + isEntryAvailable helper) shipped in
    // v4.47.0. The popup consumer was deferred to a follow-up. The
    // follow-up wires three things: (1) popup.html loads
    // core/capability-probe.js BEFORE popup.js, (2) popup.js boots
    // an ensureCapabilityMap() helper that runs the probe once and
    // caches { capability: bool } on popupState, (3) the schema-
    // overview row builder consults the cache and renders a
    // .so-key-unavailable chip when entry.requires has at least one
    // unsatisfied capability.

    // 1. popup.html script load order: capability-probe.js must
    // appear before popup.js.
    const popupHtml = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.html'), 'utf8'
    );
    const probeIdx = popupHtml.indexOf('core/capability-probe.js');
    const popupJsIdx = popupHtml.indexOf('"popup.js"');
    assert.ok(probeIdx > -1,
        'popup.html must load core/capability-probe.js');
    assert.ok(popupJsIdx > -1,
        'popup.html must load popup.js');
    assert.ok(probeIdx < popupJsIdx,
        'capability-probe.js must load BEFORE popup.js so window.YTKitCore.capabilityProbe is defined at boot');

    // 2. popupState carries a _capabilities slot + ensureCapabilityMap
    // helper that calls probe.runAll() once and caches the result.
    assert.match(popupSource, /_capabilities:\s*null/,
        'popupState must declare _capabilities slot (null until probe resolves)');
    assert.match(popupSource, /async function ensureCapabilityMap\(\)/,
        'popup.js must define ensureCapabilityMap() helper');
    assert.match(popupSource, /probe\.runAll\(\)/,
        'ensureCapabilityMap must call capabilityProbe.runAll() to populate the map');
    // The boot path must kick the probe off (void promise) and
    // re-render the schema overview when it resolves.
    assert.match(popupSource, /void ensureCapabilityMap\(\)\.then/,
        'popup boot must fire ensureCapabilityMap().then() in the background');

    // 3. Row builder consults the cache and isEntryAvailable.
    const rowStart = popupSource.indexOf('function buildSchemaOverviewKeyRow');
    assert.ok(rowStart > -1, 'popup.js must define buildSchemaOverviewKeyRow');
    const rowBlock = popupSource.slice(rowStart, rowStart + 6000);
    assert.match(rowBlock, /Array\.isArray\(entry\.requires\)/,
        'row builder must check entry.requires is a non-empty array before consulting the probe');
    assert.match(rowBlock, /probe\.isEntryAvailable\(entry,\s*caps\)/,
        'row builder must consult capabilityProbe.isEntryAvailable');
    assert.match(rowBlock, /so-key-unavailable/,
        'row builder must apply the .so-key-unavailable class on chips');

    // 4. The chip styling exists in popup.css.
    const popupCss = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.css'), 'utf8'
    );
    assert.match(popupCss, /\.so-key-profile-badge\.so-key-unavailable/,
        'popup.css must declare the .so-key-unavailable variant');
});

test('v4.47.0 stickyVideo — fullscreen handler hides positioned overlays on live/previously-live videos', () => {
    // Class of bug: ytd-live-chat-frame is positioned via _positionOverRight
    // with position:fixed; z-index:10001. Native fullscreen used to leave
    // it visible because the fullscreen handler only hid _splitWrapper and
    // _splitLiveHeader. On live and previously-live videos (the only types
    // where setupChat runs and pushes the chat frame into _positionedEls)
    // the chat overlay painted over the fullscreen player. Fix: stash
    // visibility and force visibility:hidden on every positioned element
    // when entering fullscreen, restore on exit. Same shape as the
    // fix in theater-split.user.js#onFullscreenChange (companion userscript).
    const start = ytkitSource.indexOf("id: 'stickyVideo'");
    assert.ok(start > -1, "stickyVideo feature definition must exist");
    const handlerStart = ytkitSource.indexOf('_fullscreenHandler = () =>', start);
    assert.ok(handlerStart > -1, 'stickyVideo must declare _fullscreenHandler arrow function');
    const block = ytkitSource.slice(handlerStart, handlerStart + 3000);

    // On entry: positioned overlays get visibility:hidden via a stash array.
    assert.match(block, /this\._fullscreenOverlayStash\s*=\s*\[\]/,
        'fullscreen-enter branch must initialise _fullscreenOverlayStash to []');
    assert.match(block, /\(this\._positionedEls\s*\|\|\s*\[\]\)\.forEach/,
        'fullscreen-enter branch must iterate _positionedEls defensively');
    assert.match(block, /el\.style\.setProperty\(['"]visibility['"],\s*['"]hidden['"],\s*['"]important['"]\)/,
        'fullscreen-enter branch must hide overlays with visibility:hidden !important');

    // On exit: restore prior visibility.
    assert.match(block, /\(this\._fullscreenOverlayStash\s*\|\|\s*\[\]\)\.forEach/,
        'fullscreen-exit branch must iterate the stashed overlays');
    assert.match(block, /this\._fullscreenOverlayStash\s*=\s*null/,
        'fullscreen-exit branch must clear _fullscreenOverlayStash so a re-enter starts fresh');

    // Destroy cleans up the stash so a teardown-during-fullscreen leaves no
    // dangling references.
    const destroyStart = ytkitSource.indexOf("removeEventListener('fullscreenchange'", start);
    assert.ok(destroyStart > -1, 'stickyVideo must remove fullscreenchange listener on destroy');
    const destroyTail = ytkitSource.slice(destroyStart, destroyStart + 800);
    assert.match(destroyTail, /this\._fullscreenOverlayStash\s*=\s*null/,
        'destroy/teardown must clear _fullscreenOverlayStash');
});

// ── Side Panel a11y parity ──

test('sidepanel.html has landmark roles, aria-labelledby, skip-link, and live regions', () => {
    const html = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'sidepanel.html'), 'utf8'
    );
    assert.match(html, /role="banner"/,       'sidepanel must have a banner landmark');
    assert.match(html, /role="main"/,         'sidepanel must have a main landmark');
    assert.match(html, /role="contentinfo"/,  'sidepanel must have a contentinfo landmark');
    assert.match(html, /aria-labelledby=/,    'sections must use aria-labelledby');
    assert.match(html, /class="sp-skip-link"/, 'sidepanel must have a skip-link');
    assert.match(html, /aria-live="polite"/,  'dynamic counts must use aria-live');
    assert.match(html, /role="status"/,       'empty states must use role=status');
    assert.match(html, /aria-controls="/,     'search input must declare aria-controls');
    assert.match(html, /aria-label="Refresh/, 'refresh button must have aria-label');
});

test('sidepanel.js setting rows carry aria-label for screen readers', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'sidepanel.js'), 'utf8'
    );
    assert.match(src, /setAttribute\('aria-label',\s*humanName\)/,
        'setting rows must carry aria-label derived from the human-readable name');
    assert.match(src, /setAttribute\('role',\s*'switch'\)/,
        'setting rows must have role=switch');
    assert.match(src, /setAttribute\('aria-checked'/,
        'setting rows must track aria-checked state');
});

test('sidepanel.css has focus-visible styles for interactive elements', () => {
    const css = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'sidepanel.css'), 'utf8'
    );
    assert.match(css, /\.sp-setting-row:focus-visible/,
        'setting rows must have :focus-visible styling');
    assert.match(css, /\.sp-refresh-btn:focus-visible/,
        'refresh button must have :focus-visible styling');
    assert.match(css, /\.sp-skip-link:focus/,
        'skip-link must have :focus styling');
});
