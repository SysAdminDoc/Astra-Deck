#!/usr/bin/env node
'use strict';

// scripts/check-userscript-drift.js: the committed userscript is exactly what
// sync-userscript.js builds from extension/, and it carries everything the
// extension runs.
//
//   1. Every generated record on disk (YTKit.user.js and its @require
//      libraries) is byte-identical to a fresh build. A hand edit, or an
//      extension change committed without `node sync-userscript.js`, fails.
//   2. Every file the manifest runs in a YouTube page (all worlds, the
//      live_chat group, their CSS) and every file background.js loads through
//      importScripts ships in the userscript.
//   3. Every locale the extension ships reaches the userscript: English is
//      embedded, the rest are @resource records.
//   4. Every feature id the extension declares is in a shipped file.
//   5. Every @require and @resource carries a #sha256= hash of the file on
//      disk it names.
//
// The userscript used to be a second implementation with a list of
// "extension-only" features. It runs the extension's own code now, so there is
// no such list: a file the manifest runs and the userscript doesn't is drift.
//
// Exit 0: in sync. Exit 1: drift.

const fs = require('node:fs');
const path = require('node:path');
const {
    LIBRARIES,
    buildUserscriptOutputs,
    findIntegrityMismatches,
    parseUserscriptBuild,
    readBuildPlan,
} = require('../sync-userscript');

const REPO_ROOT = path.join(__dirname, '..');
const EXTENSION_ROOT = path.join(REPO_ROOT, 'extension');
const REGISTERED_RE = /^__astraDeckRegistry\["([^"]+)"\] = function /gm;
const FEATURE_ID_RE = /^\s+id:\s*'([a-zA-Z][a-zA-Z0-9]*)'/gm;

const errors = [];

function firstDifference(expected, actual) {
    const left = expected.split('\n');
    const right = actual.split('\n');
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        if (left[index] !== right[index]) return index + 1;
    }
    return -1;
}

// ── 1. Generated records match a fresh build ──
let outputs;
try {
    outputs = buildUserscriptOutputs(REPO_ROOT);
} catch (error) {
    console.error(`[check-userscript-drift] sync-userscript.js could not build: ${error.message}`);
    process.exit(1);
}
for (const [file, expected] of outputs) {
    const target = path.join(REPO_ROOT, file);
    if (!fs.existsSync(target)) {
        errors.push(`${file} is missing. Run \`node sync-userscript.js\`.`);
        continue;
    }
    const actual = fs.readFileSync(target, 'utf8');
    if (actual !== expected) {
        errors.push(`${file} differs from a fresh build at line ${firstDifference(expected, actual)}. Run \`node sync-userscript.js\`.`);
    }
}

// ── 2. Everything the extension runs in a page or its worker ships ──
const mainText = outputs.get('YTKit.user.js');
const build = parseUserscriptBuild(mainText);
const registered = new Set();
for (const library of LIBRARIES) {
    for (const match of outputs.get(library.file).matchAll(REGISTERED_RE)) registered.add(match[1]);
}
const shipped = new Set(registered);
if (registered.has(build.mainWorldModule)) {
    for (const file of build.modules.mainWorld) shipped.add(file);
}

const plan = readBuildPlan(REPO_ROOT);
const manifest = plan.manifest;
const manifestJs = new Set();
const manifestCss = new Set();
for (const entry of manifest.content_scripts || []) {
    for (const file of entry['x-ytkit-runtime-modules'] || entry.js || []) manifestJs.add(file);
    for (const file of entry.css || []) manifestCss.add(file);
}
const workerFiles = [manifest.background?.service_worker, ...plan.backgroundCore].filter(Boolean);
for (const file of [...manifestJs, ...workerFiles]) {
    if (!shipped.has(file)) errors.push(`extension/${file} runs in the extension but the userscript does not ship it`);
}
const shippedCss = `${build.css.early}\n${build.css.liveChat}`;
for (const file of manifestCss) {
    const css = fs.readFileSync(path.join(EXTENSION_ROOT, file), 'utf8');
    if (!shippedCss.includes(css.trim())) errors.push(`extension/${file} is not carried in the userscript build data`);
}

// ── 3. Locales ──
const locales = fs.readdirSync(path.join(EXTENSION_ROOT, '_locales'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const resourceRe = new RegExp(`^// @resource\\s+${build.localeResourcePrefix}([A-Za-z_]+)\\s`, 'gm');
const resources = new Set([...mainText.matchAll(resourceRe)].map((match) => match[1]));
for (const locale of locales) {
    if (locale === build.defaultLocale) {
        if (!build.messages || !Object.keys(build.messages).length) errors.push(`the ${locale} messages are not embedded in the userscript`);
    } else if (!resources.has(locale)) {
        errors.push(`locale ${locale} has no @resource ${build.localeResourcePrefix}${locale}`);
    }
}

// ── 4. Feature ids ──
function featureIds(file) {
    const ids = new Set();
    for (const match of fs.readFileSync(path.join(EXTENSION_ROOT, file), 'utf8').matchAll(FEATURE_ID_RE)) ids.add(match[1]);
    return ids;
}
const extensionFeatureFiles = [...manifestJs].filter((file) => file === 'ytkit.js' || /^features\/[^/]+\/index\.js$/.test(file));
const extensionIds = new Set();
const shippedIds = new Set();
for (const file of extensionFeatureFiles) {
    for (const id of featureIds(file)) {
        extensionIds.add(id);
        if (shipped.has(file)) shippedIds.add(id);
    }
}
const missingIds = [...extensionIds].filter((id) => !shippedIds.has(id)).sort();
if (missingIds.length) errors.push(`feature id(s) the userscript does not ship: ${missingIds.join(', ')}`);

// ── 5. SRI hashes match the files on disk ──
// Read from disk, not the fresh build: this is what a push serves.
const shippedMain = fs.existsSync(path.join(REPO_ROOT, 'YTKit.user.js'))
    ? fs.readFileSync(path.join(REPO_ROOT, 'YTKit.user.js'), 'utf8')
    : '';
const readShipped = (file) => {
    const target = path.join(REPO_ROOT, file);
    return fs.existsSync(target) ? fs.readFileSync(target) : null;
};
for (const error of findIntegrityMismatches(shippedMain, readShipped)) errors.push(error);

if (errors.length) {
    console.error(`[check-userscript-drift] ${errors.length} drift issue(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
}
console.log(`[check-userscript-drift] OK: ${outputs.size} generated record(s) match a fresh build`);
console.log(`[check-userscript-drift] ${manifestJs.size} manifest script(s), ${workerFiles.length} worker file(s) and ${manifestCss.size} stylesheet(s) ship in the userscript`);
console.log(`[check-userscript-drift] ${locales.length} locale(s) reach the userscript; feature ids ${shippedIds.size}/${extensionIds.size} shipped`);
