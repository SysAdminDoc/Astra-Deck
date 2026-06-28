#!/usr/bin/env node
'use strict';

// scripts/check-userscript-drift.js — CI guard for userscript/extension module parity.
//
// Validates the contract between the extension's manifest content_scripts and
// the userscript's V5_BUNDLE_MODULES list in sync-userscript.js:
//
//   1. Every V5_BUNDLE_MODULES entry exists on disk.
//   2. Every extension/features/*/index.js in the manifest is covered by
//      V5_BUNDLE_MODULES (new peeled features must be added to the bundle).
//   3. The userscript file contains the BEGIN/END bundle markers.
//
// Core infrastructure modules (env.js, storage.js, selectors.js, etc.) are
// NOT required in V5_BUNDLE_MODULES — the userscript provides its own
// equivalents via GM_* APIs or inline stubs. Only feature modules and the
// shared-surface core modules (settings-schema, policy-profile, etc.) that
// both builds consume must stay in sync.
//
// Exit 0: parity holds. Exit 1: drift detected.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const SYNC_SCRIPT = path.join(REPO_ROOT, 'sync-userscript.js');
const MANIFEST_PATH = path.join(REPO_ROOT, 'extension', 'manifest.json');

const errors = [];

// ── 1. Extract V5_BUNDLE_MODULES from sync-userscript.js ──

const syncSource = fs.readFileSync(SYNC_SCRIPT, 'utf8');
const bundleMatch = syncSource.match(/const V5_BUNDLE_MODULES\s*=\s*\[([\s\S]*?)\];/);
if (!bundleMatch) {
    console.error('[check-userscript-drift] Cannot parse V5_BUNDLE_MODULES from sync-userscript.js');
    process.exit(2);
}
const bundleModules = [];
const lineRe = /['"]([^'"]+)['"]/g;
let m;
while ((m = lineRe.exec(bundleMatch[1])) !== null) {
    bundleModules.push(m[1]);
}
const bundleSet = new Set(bundleModules);

// ── 2. Verify every bundled module exists on disk ──

for (const mod of bundleModules) {
    const full = path.join(REPO_ROOT, mod);
    if (!fs.existsSync(full)) {
        errors.push(`V5_BUNDLE_MODULES lists "${mod}" but it does not exist on disk`);
    }
}

// ── 3. Parse manifest content_scripts JS lists ──

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const manifestJsFiles = new Set();
for (const entry of (manifest.content_scripts || [])) {
    if (entry.world === 'MAIN') continue;
    for (const js of (entry.js || [])) {
        manifestJsFiles.add(js);
    }
}

// ── 4. Flag feature modules in manifest not covered by V5_BUNDLE_MODULES ──
// Feature modules follow the pattern features/*/index.js and must be bundled.
// Exception: extension-only modules must carry a classification so intentional
// gaps do not look the same as accidental drift.
const PARITY_CLASS_ORDER = Object.freeze([
    'chrome-api',
    'native-companion',
    'unsafe-in-userscript',
    'intentional-extension-only',
    'not-yet-ported',
]);
const PARITY_CLASSES = new Set(PARITY_CLASS_ORDER);
const MAX_NOT_YET_PORTED_FEATURES = 19;

const EXTENSION_ONLY_MANIFEST_MODULES = Object.freeze({
    'features/download-ui/index.js': 'native-companion',
});

const EXTENSION_ONLY_FEATURE_CLASSIFICATIONS = Object.freeze({
    aiVideoSummary: 'unsafe-in-userscript',
    antiTranslateAudioTrack: 'not-yet-ported',
    antiTranslateTranscript: 'not-yet-ported',
    astraContextMenu: 'chrome-api',
    audioNormalization: 'intentional-extension-only',
    audioPan: 'intentional-extension-only',
    audioTrackLanguage: 'intentional-extension-only',
    autoDismissContentWarning: 'not-yet-ported',
    bulkCardActions: 'intentional-extension-only',
    chapterJumpButtons: 'not-yet-ported',
    classicLayoutProfile: 'intentional-extension-only',
    classicPlayerChrome: 'intentional-extension-only',
    cleanUiPreset: 'intentional-extension-only',
    commentFilterManager: 'intentional-extension-only',
    commentFilterRules: 'intentional-extension-only',
    copyChapterMarkdown: 'not-yet-ported',
    deArrowChannelOverridesPanel: 'intentional-extension-only',
    deArrowVoting: 'unsafe-in-userscript',
    dearrowPeekButton: 'intentional-extension-only',
    denseMode: 'intentional-extension-only',
    diagnosticLog: 'intentional-extension-only',
    disableLoudnessNormalization: 'intentional-extension-only',
    downloadAudioFormat: 'native-companion',
    downloadCobaltFallback: 'native-companion',
    downloadHealthPanel: 'native-companion',
    downloadHistoryPanel: 'native-companion',
    downloadScreenshotFormat: 'native-companion',
    downloadStreamLinksPanel: 'native-companion',
    downloadSubtitlesWithScreenshot: 'native-companion',
    downloadVideoFormat: 'native-companion',
    feedTriageProfile: 'intentional-extension-only',
    forcedColorsSupport: 'intentional-extension-only',
    frameByFrameButtons: 'not-yet-ported',
    globalAriaLiveRegion: 'intentional-extension-only',
    hideJumpAheadButton: 'not-yet-ported',
    hideLiveChatEngagement: 'intentional-extension-only',
    hideMembersOnly: 'not-yet-ported',
    hidePinnedComments: 'not-yet-ported',
    initialPlayerStateBackground: 'intentional-extension-only',
    initialPlayerStateForeground: 'intentional-extension-only',
    localAiSummary: 'unsafe-in-userscript',
    localAiTranscriptQa: 'unsafe-in-userscript',
    lowPowerProfile: 'intentional-extension-only',
    monetizationIndicator: 'not-yet-ported',
    monoToStereo: 'intentional-extension-only',
    musicVideoSpeedLock: 'not-yet-ported',
    newPlayerUiRestore: 'intentional-extension-only',
    notifyAutoDubbedAudio: 'not-yet-ported',
    oledTheme: 'intentional-extension-only',
    openInAlternativeFrontend: 'not-yet-ported',
    perChannelIntroOutro: 'intentional-extension-only',
    playlistQuickRemove: 'intentional-extension-only',
    playlistSearch: 'intentional-extension-only',
    premiumLiveChat: 'intentional-extension-only',
    presetFocus: 'intentional-extension-only',
    presetPowerUser: 'intentional-extension-only',
    presetPrivacy: 'intentional-extension-only',
    presetResearcher: 'intentional-extension-only',
    qualityProfileMatrix: 'intentional-extension-only',
    reactionSpammer: 'unsafe-in-userscript',
    rectangularizeYouTube: 'intentional-extension-only',
    redditComments: 'unsafe-in-userscript',
    reducedMotion: 'intentional-extension-only',
    researchSpacedReview: 'intentional-extension-only',
    researchTranscriptIndex: 'intentional-extension-only',
    researchTranscriptSearchPanel: 'intentional-extension-only',
    restoreNativeYouTubeUi: 'intentional-extension-only',
    sbPerChannelProfiles: 'intentional-extension-only',
    selectorHealthPanel: 'intentional-extension-only',
    sleepTimer: 'not-yet-ported',
    storageQuotaLRU: 'chrome-api',
    subtitleDownload: 'native-companion',
    tokenThemeBridge: 'intentional-extension-only',
    transcriptAiHandoff: 'unsafe-in-userscript',
    videoAgeColors: 'not-yet-ported',
    vlcMpvHandoff: 'native-companion',
    volumeBoost: 'intentional-extension-only',
    volumeBoostLevel: 'intentional-extension-only',
    volumeWheelMode: 'not-yet-ported',
    watchHistoryAnalytics: 'intentional-extension-only',
    watchLaterCleanup: 'intentional-extension-only',
    watchPageTabs: 'not-yet-ported',
    wheelSeek: 'not-yet-ported',
    zenMode: 'not-yet-ported',
});

for (const [featureId, parityClass] of Object.entries(EXTENSION_ONLY_FEATURE_CLASSIFICATIONS)) {
    if (!PARITY_CLASSES.has(parityClass)) {
        errors.push(`Extension-only feature "${featureId}" uses invalid parity class "${parityClass}"`);
    }
}
for (const [modulePath, parityClass] of Object.entries(EXTENSION_ONLY_MANIFEST_MODULES)) {
    if (!PARITY_CLASSES.has(parityClass)) {
        errors.push(`Extension-only module "${modulePath}" uses invalid parity class "${parityClass}"`);
    }
}

for (const js of manifestJsFiles) {
    if (!js.startsWith('features/')) continue;
    if (Object.hasOwn(EXTENSION_ONLY_MANIFEST_MODULES, js)) continue;
    const relative = 'extension/' + js;
    if (!bundleSet.has(relative)) {
        errors.push(`Manifest content_scripts includes "${js}" but V5_BUNDLE_MODULES does not — add it to sync-userscript.js or document the exclusion`);
    }
}

// ── 5. Verify userscript has bundle markers ──

try {
    const { resolveUserscriptPath } = require(path.join(REPO_ROOT, 'scripts', 'repo-paths'));
    const usPath = resolveUserscriptPath(REPO_ROOT);
    const usText = fs.readFileSync(usPath, 'utf8');
    if (!usText.includes('// ── BEGIN v5.0.0 bundled core modules ──')) {
        errors.push('Userscript is missing the BEGIN v5.0.0 bundled core modules marker');
    }
    if (!usText.includes('// ── END v5.0.0 bundled core modules ──')) {
        errors.push('Userscript is missing the END v5.0.0 bundled core modules marker');
    }
} catch (e) {
    errors.push(`Could not read userscript: ${e.message}`);
}

// ── 6. Feature-ID parity (informational, not gated) ──
// Extract unique feature IDs from the extension (ytkit.js + features/) and the
// userscript, then report the parity ratio. This makes the 79-feature gap
// visible in CI output without blocking the build.

function extractFeatureIds(filePath) {
    try {
        const src = fs.readFileSync(filePath, 'utf8');
        const ids = new Set();
        const re = /^\s+id:\s*'([a-zA-Z][a-zA-Z0-9]*)'/gm;
        let hit;
        while ((hit = re.exec(src)) !== null) ids.add(hit[1]);
        return ids;
    } catch (_) { return new Set(); }
}

const extIds = new Set();
const ytkitPath = path.join(REPO_ROOT, 'extension', 'ytkit.js');
for (const id of extractFeatureIds(ytkitPath)) extIds.add(id);

const featuresDir = path.join(REPO_ROOT, 'extension', 'features');
if (fs.existsSync(featuresDir)) {
    const entries = fs.readdirSync(featuresDir, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const idx = path.join(featuresDir, entry.name, 'index.js');
        for (const id of extractFeatureIds(idx)) extIds.add(id);
    }
}

for (const id of String(process.env.ASTRA_USERSCRIPT_DRIFT_INJECT_EXTENSION_IDS || '').split(/[,\s]+/)) {
    if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(id)) extIds.add(id);
}

const { resolveUserscriptPath: resolveUs } = require(path.join(REPO_ROOT, 'scripts', 'repo-paths'));
const usIds = extractFeatureIds(resolveUs(REPO_ROOT));
const parity = extIds.size > 0 ? Math.round((usIds.size / extIds.size) * 100) : 0;
const extOnly = [...extIds].filter(id => !usIds.has(id)).sort();

const parityClassCounts = Object.fromEntries(PARITY_CLASS_ORDER.map(cls => [cls, 0]));
const unclassifiedExtOnly = [];
for (const id of extOnly) {
    const parityClass = EXTENSION_ONLY_FEATURE_CLASSIFICATIONS[id];
    if (!parityClass) {
        unclassifiedExtOnly.push(id);
    } else if (PARITY_CLASSES.has(parityClass)) {
        parityClassCounts[parityClass] += 1;
    }
}
if (unclassifiedExtOnly.length) {
    errors.push(`Unclassified extension-only feature ID(s): ${unclassifiedExtOnly.join(', ')}. Add a ${PARITY_CLASS_ORDER.join('|')} entry to EXTENSION_ONLY_FEATURE_CLASSIFICATIONS.`);
}

const staleClassifications = Object.keys(EXTENSION_ONLY_FEATURE_CLASSIFICATIONS)
    .filter(id => !extOnly.includes(id))
    .sort();
if (staleClassifications.length) {
    errors.push(`Stale extension-only feature classification(s): ${staleClassifications.join(', ')}. Remove entries after porting or deleting features.`);
}
if (parityClassCounts['not-yet-ported'] > MAX_NOT_YET_PORTED_FEATURES) {
    errors.push(`not-yet-ported userscript parity gap is ${parityClassCounts['not-yet-ported']} (max ${MAX_NOT_YET_PORTED_FEATURES}); port safe features or classify intentional non-portable gaps.`);
}

const classSummary = PARITY_CLASS_ORDER
    .map(cls => `${cls}=${parityClassCounts[cls]}`)
    .join(', ');

// ── Report ──

if (errors.length === 0) {
    console.log(`[check-userscript-drift] OK — ${bundleModules.length} bundled module(s), all on disk`);
    const manifestFeatures = [...manifestJsFiles].filter(f => f.startsWith('features/'));
    console.log(`[check-userscript-drift] ${manifestFeatures.length} manifest feature module(s) covered by V5_BUNDLE_MODULES`);
    console.log(`[check-userscript-drift] Userscript bundle markers present`);
    console.log(`[check-userscript-drift] Feature-ID parity: ${usIds.size}/${extIds.size} (${parity}%) — ${extOnly.length} extension-only`);
    console.log(`[check-userscript-drift] Extension-only classifications: ${classSummary}`);
    process.exit(0);
}

console.error(`[check-userscript-drift] ${errors.length} drift issue(s):`);
for (const err of errors) console.error(`  ✗ ${err}`);
process.exit(1);
