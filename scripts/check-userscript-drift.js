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
//   3. The userscript file contains the ordered dependency manifest and the
//      generated Greasy Fork library contains the executable module bodies.
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
// Strip comments before scanning for quoted paths. A bare quote regex over the
// raw array body treats an apostrophe in a comment ("the monolith's manager") as
// a string delimiter, swallowing everything to the next quote and silently
// dropping real modules from the list — which surfaces as a pile of bogus
// "manifest includes X but V5_BUNDLE_MODULES does not" errors.
const bundleBody = bundleMatch[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
const lineRe = /['"]([^'"]+)['"]/g;
let m;
while ((m = lineRe.exec(bundleBody)) !== null) {
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
    const scripts = entry['x-ytkit-runtime-modules'] || entry.js || [];
    for (const js of scripts) {
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
    'features/search-while-watching/index.js': 'intentional-extension-only',
    'features/search-hygiene/index.js': 'intentional-extension-only',
    'features/subscription-view/index.js': 'intentional-extension-only',
    'core/selector-packs/searchResults.js': 'intentional-extension-only',
    'core/selector-packs/subscriptions.js': 'intentional-extension-only',
    'features/video-insights/index.js': 'intentional-extension-only',
    'features/replay-chat-density/index.js': 'intentional-extension-only',
    // The extension loads this minimal frame runtime instead of the normal-page
    // monolith. The userscript keeps its existing live-chat implementation.
    'features/live-chat/index.js': 'intentional-extension-only',

    // Core modules the EXTENSION loads as separate files while the
    // userscript keeps the equivalent implementation inside its
    // monolith. Listing them explicitly is the point: a NEW core module
    // added to the manifest now fails this gate until someone decides
    // whether userscript users should get it.
    'core/browser-api.js': 'intentional-extension-only',
    'core/diagnostic-log.js': 'intentional-extension-only',
    'core/env.js': 'intentional-extension-only',
    'core/icons.js': 'intentional-extension-only',
    'core/page.js': 'intentional-extension-only',
    'core/persisted-domains.js': 'intentional-extension-only',
    'core/playability.js': 'intentional-extension-only',
    'core/predicate-sandbox.js': 'intentional-extension-only',
    // Scope rules for the user-configured filter-list URL. The setting is
    // schema vehicle: extension, and the userscript has no optional host
    // permission to grant, so bundling this would only ship rules nothing
    // consults. The userscript-side normalizers fail closed without it.
    'core/remote-list-scope.js': 'intentional-extension-only',
    'core/registry.js': 'intentional-extension-only',
    'core/selector-packs/appShell.js': 'intentional-extension-only',
    'core/selector-packs/commentComposer.js': 'intentional-extension-only',
    'core/selector-packs/comments.js': 'intentional-extension-only',
    'core/selector-packs/engagementPanels.js': 'intentional-extension-only',
    'core/selector-packs/feed.js': 'intentional-extension-only',
    'core/selector-packs/feedCard.js': 'intentional-extension-only',
    'core/selector-packs/feedExperimentChips.js': 'intentional-extension-only',
    'core/selector-packs/feedPlayables.js': 'intentional-extension-only',
    'core/selector-packs/feedPrompt.js': 'intentional-extension-only',
    'core/selector-packs/feedSponsored.js': 'intentional-extension-only',
    'core/selector-packs/leftNav.js': 'intentional-extension-only',
    'core/selector-packs/liveChat.js': 'intentional-extension-only',
    'core/selector-packs/liveChatFrame.js': 'intentional-extension-only',
    'core/selector-packs/liveChatPlaceholder.js': 'intentional-extension-only',
    'core/selector-packs/mainVideo.js': 'intentional-extension-only',
    'core/selector-packs/media.js': 'intentional-extension-only',
    'core/selector-packs/modals.js': 'intentional-extension-only',
    'core/selector-packs/nav.js': 'intentional-extension-only',
    'core/selector-packs/notifications.js': 'intentional-extension-only',
    'core/selector-packs/player.js': 'intentional-extension-only',
    'core/selector-packs/playerChrome.js': 'intentional-extension-only',
    'core/selector-packs/playerSettings.js': 'intentional-extension-only',
    'core/selector-packs/profile.js': 'intentional-extension-only',
    'core/selector-packs/relatedSidebar.js': 'intentional-extension-only',
    'core/selector-packs/search.js': 'intentional-extension-only',
    'core/selector-packs/settingsOverlay.js': 'intentional-extension-only',
    'core/selector-packs/shortsShelf.js': 'intentional-extension-only',
    'core/selector-packs/sidebar.js': 'intentional-extension-only',
    'core/selector-packs/thumbnail.js': 'intentional-extension-only',
    'core/selector-packs/transcriptPanel.js': 'intentional-extension-only',
    'core/selector-packs/watch.js': 'intentional-extension-only',
    'core/selectors.js': 'intentional-extension-only',
    'core/storage-manager.js': 'intentional-extension-only',
    'core/storage.js': 'intentional-extension-only',
    'core/url.js': 'intentional-extension-only',
    'core/video-type.js': 'intentional-extension-only',
});

const EXTENSION_ONLY_FEATURE_CLASSIFICATIONS = Object.freeze({
    // The userscript has no programmatic-rate guard: its per-channel speed
    // feature listens on 'ratechange' and writes playbackRate directly, so a
    // cold-region rate from this feature would be saved as the channel's
    // preferred speed. Its sibling jumpToMostReplayed IS ported - it only
    // seeks, and touches no rate.
    heatmapSmartSpeed: 'unsafe-in-userscript',
    antiTranslateAudioTrack: 'not-yet-ported',
    antiTranslateTranscript: 'not-yet-ported',
    astraContextMenu: 'chrome-api',
    audioNormalization: 'intentional-extension-only',
    audioAutoGain: 'intentional-extension-only',
    audioHighPass: 'intentional-extension-only',
    audioParametricEq: 'intentional-extension-only',
    audioEqLowGainDb: 'intentional-extension-only',
    audioEqMidGainDb: 'intentional-extension-only',
    audioEqHighGainDb: 'intentional-extension-only',
    audioPan: 'intentional-extension-only',
    audioSyncOffsetMs: 'intentional-extension-only',
    shortsDailyLimitMin: 'intentional-extension-only',
    shortsDailyLimitMode: 'intentional-extension-only',
    notificationMaxCount: 'intentional-extension-only',
    notificationHideRead: 'intentional-extension-only',
    commentLanguageAllowlist: 'intentional-extension-only',
    commentDuplicateCollapse: 'intentional-extension-only',
    audioTrackLanguage: 'intentional-extension-only',
    preferDescriptiveAudio: 'intentional-extension-only',
    autoDismissContentWarning: 'not-yet-ported',
    autoExitFullscreen: 'intentional-extension-only',
    autoSubtitlesWhenMuted: 'intentional-extension-only',
    liveSpeedReset: 'intentional-extension-only',
    liveLatencyCatchup: 'intentional-extension-only',
    liveLatencyTargetSeconds: 'intentional-extension-only',
    liveLatencyMaxRate: 'intentional-extension-only',
    forceDvr: 'intentional-extension-only',
    // Every line of feedPrefilter is the MAIN/ISOLATED bridge, which a
    // userscript does not have - it runs in page context already. The pure
    // decision module IS bundled, so a future userscript hook inherits the
    // tested rules instead of a second copy of them.
    feedPrefilter: 'intentional-extension-only',
    replayChatDensity: 'intentional-extension-only',
    // The userscript keeps the inline Video Hider runtime and custom pane,
    // while the extension-only registry cards remain intentionally absent.
    hideVideosSyntheticNarrationFilter: 'intentional-extension-only',
    hideVideosLowSignalFilter: 'intentional-extension-only',
    hideVideosLowSignalMinViews: 'intentional-extension-only',
    hideVideosLowSignalMinAgeDays: 'intentional-extension-only',
    hideVideosUploadCadenceFilter: 'intentional-extension-only',
    hideVideosUploadCadencePerDay: 'intentional-extension-only',
    subtitlesOnRewind: 'intentional-extension-only',
    fullscreenScroll: 'intentional-extension-only',
    persistentQueue: 'intentional-extension-only',
    playbackErrorRecovery: 'intentional-extension-only',
    searchWhileWatching: 'intentional-extension-only',
    searchHideUnrelatedShelves: 'intentional-extension-only',
    searchHideRelatedSearches: 'intentional-extension-only',
    searchHideWatchedRecommended: 'intentional-extension-only',
    subscriptionViewControls: 'intentional-extension-only',
    shortsAutoAdvance: 'intentional-extension-only',
    shortsSpeedControl: 'intentional-extension-only',
    watchLaterWorkbench: 'intentional-extension-only',
    bulkCardActions: 'intentional-extension-only',
    hidePlannedLivestreams: 'intentional-extension-only',
    chapterJumpButtons: 'not-yet-ported',
    classicLayoutProfile: 'intentional-extension-only',
    classicPlayerChrome: 'intentional-extension-only',
    cleanUiPreset: 'intentional-extension-only',
    commentFilterManager: 'intentional-extension-only',
    commentFilterRules: 'intentional-extension-only',
    sponsoredContentFilter: 'intentional-extension-only',
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
    videoInsights: 'intentional-extension-only',
    // The userscript bundles the pure luminance helpers but the settings-backed
    // feature lifecycle is owned by the MV3 MAIN-world bridge.
    photosensitiveFlashProtection: 'intentional-extension-only',
    photosensitiveFlashThreshold: 'intentional-extension-only',
    photosensitiveDimPercent: 'intentional-extension-only',
    vlcMpvHandoff: 'native-companion',
    volumeBoost: 'intentional-extension-only',
    volumeBoostLevel: 'intentional-extension-only',
    bufferPreload: 'intentional-extension-only',
    bufferPreloadSeconds: 'intentional-extension-only',
    audioOnlyPlayback: 'intentional-extension-only',
    commentTranslate: 'intentional-extension-only',
    commentTranslateTarget: 'intentional-extension-only',
    volumeWheelMode: 'not-yet-ported',
    watchHistoryAnalytics: 'intentional-extension-only',
    watchLaterCleanup: 'intentional-extension-only',
    watchPageTabs: 'not-yet-ported',
    wheelSeek: 'not-yet-ported',
    zenMode: 'not-yet-ported',
    // v4.49.0 Wave 11 — external-userscript ingestion (object-literal features only; the
    // cssFeature() toggles carry their id as a positional arg and are invisible
    // to the id-extractor, so they need no classification here).
    hiddenGuideElementsManager: 'intentional-extension-only',
    uiFontFamily: 'intentional-extension-only',
    uiFontSize: 'intentional-extension-only',
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
    // core/ modules are covered too: the exemption used to stop at features/,
    // so a NEW shared-surface core module (the settings-schema / policy-profile
    // class this file's header names as "must stay in sync") could be added to
    // the manifest and silently never reach userscript users, with a green
    // gate. Unclassified is a failure, not a pass.
    if (!js.startsWith('features/') && !js.startsWith('core/')) continue;
    if (Object.hasOwn(EXTENSION_ONLY_MANIFEST_MODULES, js)) continue;
    const relative = 'extension/' + js;
    if (!bundleSet.has(relative)) {
        errors.push(`Manifest content_scripts includes "${js}" but V5_BUNDLE_MODULES does not — add it to sync-userscript.js or classify it in EXTENSION_ONLY_MANIFEST_MODULES`);
    }
}

// ── 5. Verify dependency manifest AND generated library CONTENT ──
//
// Marker presence is not parity. The hardening test that claims to check
// "verbatim contents" only matches one fingerprint substring per module, so a
// module edit that misses that single line ships stale to every Tampermonkey
// install via the raw-main @updateURL — v4.51.2's settings-schema.js did
// exactly that through three releases. Recompute the bundle region with the
// same transforms sync-userscript.js uses and compare both artifacts byte for
// byte, naming the stale module when the library has drifted.

let bundledModuleContentChecked = 0;

try {
    const { resolveUserscriptPath } = require(path.join(REPO_ROOT, 'scripts', 'repo-paths'));
    const usPath = resolveUserscriptPath(REPO_ROOT);
    const usText = fs.readFileSync(usPath, 'utf8');
    const sync = require(SYNC_SCRIPT);
    const hasBegin = usText.includes('// ── BEGIN v5.0.0 bundled core modules ──');
    const hasEnd = usText.includes('// ── END v5.0.0 bundled core modules ──');
    if (!hasBegin) {
        errors.push('Userscript is missing the BEGIN v5.0.0 bundled core modules marker');
    }
    if (!hasEnd) {
        errors.push('Userscript is missing the END v5.0.0 bundled core modules marker');
    }

    if (hasBegin && hasEnd) {
        const actualMatch = usText.match(sync.BUNDLE_BEGIN_RE);
        if (!actualMatch) {
            errors.push('Userscript bundle region could not be extracted for content comparison');
        } else {
            const actual = actualMatch[0];
            let expected;
            try {
                expected = sync.buildBundleRegion(REPO_ROOT);
            } catch (buildError) {
                errors.push(`Could not rebuild the expected bundle: ${buildError.message}`);
            }
            if (expected && expected !== actual) {
                errors.push('Userscript dependency manifest is stale. Run `node sync-userscript.js`.');
            } else if (expected) {
                bundledModuleContentChecked = sync.V5_BUNDLE_MODULES.length;
            }
        }
    }

    const corePath = sync.USERSCRIPT_CORE_SOURCE;
    if (!fs.existsSync(corePath)) {
        errors.push('Generated userscript core library is missing; run `node sync-userscript.js`.');
    } else {
        const coreText = fs.readFileSync(corePath, 'utf8');
        const coreRegionRe = /^\/\/ ── BEGIN v5\.0\.0 bundled core modules ──\r?\n[\s\S]*?^\/\/ ── END v5\.0\.0 bundled core modules ──/m;
        const actualCore = coreText.match(coreRegionRe);
        let expectedCore;
        try {
            expectedCore = sync.buildCoreLibrarySource(REPO_ROOT).match(coreRegionRe);
        } catch (buildError) {
            errors.push(`Could not rebuild the userscript core library: ${buildError.message}`);
        }
        if (!actualCore) {
            errors.push('Generated userscript core library is missing its module markers.');
        } else if (expectedCore && actualCore[0] !== expectedCore[0]) {
            const stale = [];
            for (const rel of sync.V5_BUNDLE_MODULES) {
                const header = sync.coreModuleHeader(rel);
                const sliceFrom = (text) => {
                    const at = text.indexOf(header);
                    if (at === -1) return null;
                    const nextAt = text.indexOf('// ── bundled module: ', at + header.length);
                    const endAt = nextAt === -1
                        ? text.indexOf('// ── END v5.0.0 bundled core modules ──', at)
                        : nextAt;
                    return text.slice(at, endAt === -1 ? undefined : endAt);
                };
                const expectedSlice = sliceFrom(expectedCore[0]);
                const actualSlice = sliceFrom(actualCore[0]);
                if (actualSlice === null) stale.push(`${rel} (absent from the library)`);
                else if (expectedSlice !== actualSlice) stale.push(rel);
            }
            errors.push(stale.length
                ? `Userscript core library is stale for ${stale.length} module(s): ${stale.join(', ')}. Run \`node sync-userscript.js\`.`
                : 'Userscript core library differs from its source modules. Run `node sync-userscript.js`.');
        }
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
const syncForFeatureIds = require(SYNC_SCRIPT);
const usIds = new Set([
    ...extractFeatureIds(resolveUs(REPO_ROOT)),
    ...extractFeatureIds(syncForFeatureIds.USERSCRIPT_CORE_SOURCE),
]);
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
    console.log(`[check-userscript-drift] Userscript bundle markers present; ${bundledModuleContentChecked} bundled module(s) byte-identical to source`);
    console.log(`[check-userscript-drift] Feature-ID parity: ${usIds.size}/${extIds.size} (${parity}%) — ${extOnly.length} extension-only`);
    console.log(`[check-userscript-drift] Extension-only classifications: ${classSummary}`);
    process.exit(0);
}

console.error(`[check-userscript-drift] ${errors.length} drift issue(s):`);
for (const err of errors) console.error(`  ✗ ${err}`);
process.exit(1);
