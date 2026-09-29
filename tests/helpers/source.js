'use strict';

// Shared source-loading helpers for per-area feature tests.
//
// The monolithic `tests/hardening.test.js` reads
// `extension/ytkit.js`, `extension/popup.js`, `extension/popup.html`,
// `extension/background.js` at top level. Per-area tests (DeArrow,
// SponsorBlock, Theater Split, …) re-use those same loads — having one
// canonical helper keeps the per-area files thin and avoids each new
// area silently caching a stale snapshot of the source.
//
// Usage:
//   const test = require('node:test');
//   const assert = require('node:assert/strict');
//   const { sources, extractFeatureBlock } = require('./helpers/source');
//   const block = extractFeatureBlock(sources.ytkit, 'sponsorBlock');

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const extensionRoot = path.join(repoRoot, 'extension');

function readUtf8(...segments) {
    return fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
}

// The userscript is generated from extension/ by sync-userscript.js. Three
// @require libraries hold every extension file as a registered function and
// YTKit.user.js holds the host that runs them, so this is everything a manager
// loads, in load order. The bundled copies are compacted (comments stripped,
// indentation re-tabbed), so source pins read extension/ and use
// userscriptBundles() to prove the userscript ships the same file.
const USERSCRIPT_FILES = Object.freeze(['YTKit-core.user.js', 'YTKit-features.user.js', 'YTKit-app.user.js', 'YTKit.user.js']);
const REGISTERED_MODULE_RE = /^__astraDeckRegistry\["([^"]+)"\] = function /gm;

function readUserscriptRuntime() {
    return USERSCRIPT_FILES.map((file) => readUtf8(file)).join('\n');
}

/** The ASTRA_DECK_BUILD object embedded in YTKit.user.js. */
function readUserscriptBuild(main = readUtf8('YTKit.user.js')) {
    const marker = 'const ASTRA_DECK_BUILD = ';
    const start = main.indexOf(marker);
    if (start === -1) throw new Error('readUserscriptBuild: YTKit.user.js carries no ASTRA_DECK_BUILD');
    const end = main.indexOf(';\n', start);
    return JSON.parse(main.slice(start + marker.length, end));
}

/**
 * Extension paths (relative to extension/) the generated userscript ships.
 * The MAIN-world files share one registered bundle, which the build data
 * names file by file.
 */
function userscriptModulePaths(runtime = sources.userscript) {
    const paths = new Set([...runtime.matchAll(REGISTERED_MODULE_RE)].map((match) => match[1]));
    const build = readUserscriptBuild();
    if (paths.has(build.mainWorldModule)) {
        for (const file of build.modules.mainWorld || []) paths.add(file);
    }
    return paths;
}

/** True when the generated userscript ships this extension file. */
function userscriptBundles(extensionPath, runtime = sources.userscript) {
    return userscriptModulePaths(runtime).has(extensionPath);
}

const sources = Object.freeze({
    ytkit: readUtf8('extension', 'ytkit.js'),
    popup: readUtf8('extension', 'popup.js'),
    popupHtml: readUtf8('extension', 'popup.html'),
    background: readUtf8('extension', 'background.js'),
    // Every generated userscript record, libraries first. Size and metadata
    // gates inspect the records separately.
    userscript: readUserscriptRuntime(),
});

const config = Object.freeze({
    repoRoot,
    extensionRoot,
    defaultSettings: JSON.parse(readUtf8('extension', 'default-settings.json')),
    settingsMeta: JSON.parse(readUtf8('extension', 'settings-meta.json')),
    manifest: JSON.parse(readUtf8('extension', 'manifest.json')),
});

function runtimeModules(entry) {
    return Array.isArray(entry?.['x-ytkit-runtime-modules'])
        ? entry['x-ytkit-runtime-modules']
        : (entry?.js || []);
}

function findNormalRuntimeEntry(manifest = config.manifest) {
    return (manifest.content_scripts || []).find((entry) =>
        runtimeModules(entry).includes('ytkit.js')
    );
}

// Theater Split is a controller (features/sticky-video) plus part modules
// (features/sticky-video-*), every one of them listed in the manifest. Source
// pins read them all, so a rule or a method is found whichever part holds it,
// and a new part is picked up without touching a test.
function readTheaterSplitSource() {
    const files = runtimeModules(findNormalRuntimeEntry())
        .filter((file) => /^features\/sticky-video(?:-[a-z]+)*\/index\.js$/.test(file));
    if (!files.includes('features/sticky-video/index.js')) {
        throw new Error('readTheaterSplitSource: the Theater Split controller is not in the manifest');
    }
    return files.map((file) => readUtf8('extension', ...file.split('/'))).join('\n');
}

/**
 * Extract the source-text block corresponding to a feature object
 * literal so per-area tests don't have to compute start/end indices.
 * Returns a tuple `[block, startIndex, endIndex]`.
 *
 * Lookup is the same primitive both `hardening.test.js` and the new
 * per-area test files use: find ``id: 'featureId'`` and slice until the
 * NEXT ``id: '…'`` in the features array.
 */
function extractFeatureBlock(source, featureId) {
    const needle = `id: '${featureId}'`;
    const start = source.indexOf(needle);
    if (start === -1) {
        throw new Error(`extractFeatureBlock: feature '${featureId}' not found`);
    }
    // Find the next `id: '…'` after this one; if none, fall back to
    // a fixed 8000-char window so the helper still returns something
    // useful for the last feature in the array.
    const after = source.indexOf("id: '", start + needle.length);
    const end = after === -1 ? Math.min(source.length, start + 8000) : after;
    return [source.slice(start, end), start, end];
}

module.exports = {
    sources,
    config,
    runtimeModules,
    findNormalRuntimeEntry,
    extractFeatureBlock,
    readTheaterSplitSource,
    USERSCRIPT_FILES,
    readUserscriptRuntime,
    readUserscriptBuild,
    userscriptModulePaths,
    userscriptBundles,
};
