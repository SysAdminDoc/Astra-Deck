#!/usr/bin/env node
'use strict';

// A ratchet on the monolith peel.
//
// Peeling features out of `extension/ytkit.js` into `extension/features/*/index.js`
// is an active migration with no finish line: `scripts/check-userscript-drift.js`
// requires a NEWLY peeled feature to be registered, but nothing counts what is
// left, so the monolith can grow back between releases and no gate says so.
// Every other invariant here carries a ratchet — `MIN_GATES` in run-checks.js,
// the shipped-identity baseline, the light-theme lane baseline, the i18n
// placeholder baseline — and this is the one that did not.
//
// The measure is feature IDs, not lines or brace shapes. A feature counts as
// peeled when its id is declared by a module under `extension/features/`;
// ytkit.js keeps a descriptor stub for peeled features (subscription-groups is
// nine lines in the monolith), so the stub's id still appears in ytkit.js
// and an id-in-ytkit count alone would never fall. The remainder is therefore
// the ids ytkit.js declares that NO module declares.
//
// The id pattern is the one `scripts/project-facts.js#collectFeatureIds` already
// uses, so this gate and the generated project-facts table cannot disagree about
// what a feature is.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'monolith-peel-baseline.json');
const MONOLITH_PATH = path.join(REPO_ROOT, 'extension', 'ytkit.js');
const FEATURES_DIR = path.join(REPO_ROOT, 'extension', 'features');

const ID_PATTERN = /^\s+id:\s*'([a-zA-Z][a-zA-Z0-9]*)'/gm;

function declaredIds(filePath) {
    const source = fs.readFileSync(filePath, 'utf8');
    const ids = new Set();
    ID_PATTERN.lastIndex = 0;
    let match;
    while ((match = ID_PATTERN.exec(source)) !== null) ids.add(match[1]);
    return ids;
}

function featureModulePaths() {
    return fs.readdirSync(FEATURES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(FEATURES_DIR, entry.name, 'index.js'))
        .filter((modulePath) => fs.existsSync(modulePath))
        .sort();
}

// A module counts a feature as peeled only if it looks like an implementation.
//
// Without this the ratchet has an obvious way past it: leave the feature
// implemented inline in ytkit.js and drop a one-line module that declares
// nothing but `id: 'thing'`. The id then appears on both sides, the remainder
// falls, and the gate reports progress for work nobody did.
//
// The test is structural rather than a line count: a real module declares at
// least one function AND either exports for the test suite or registers itself
// on globalThis.YTKitFeatures. All 19 id-declaring modules in the tree satisfy
// it; a bare descriptor satisfies neither half.
function looksLikeImplementation(source) {
    const hasFunction = source.includes('function ') || source.includes('function(');
    const isReachable = /module\.exports/.test(source) || /globalThis\.YTKitFeatures/.test(source);
    return hasFunction && isReachable;
}

function measure() {
    const monolithIds = declaredIds(MONOLITH_PATH);
    const modulePaths = featureModulePaths();
    const moduleIds = new Set();
    const descriptorOnlyModules = [];
    for (const modulePath of modulePaths) {
        const ids = declaredIds(modulePath);
        if (!ids.size) continue;
        if (!looksLikeImplementation(fs.readFileSync(modulePath, 'utf8'))) {
            descriptorOnlyModules.push(path.relative(REPO_ROOT, modulePath).split(path.sep).join('/'));
            continue;
        }
        for (const id of ids) moduleIds.add(id);
    }
    const inlineOnly = [...monolithIds].filter((id) => !moduleIds.has(id)).sort();
    return {
        inlineOnly,
        descriptorOnlyModules,
        monolithIdCount: monolithIds.size,
        moduleIdCount: moduleIds.size,
        featureModuleCount: modulePaths.length,
        totalFeatureIds: new Set([...monolithIds, ...moduleIds]).size,
    };
}

function readBaseline() {
    if (!fs.existsSync(BASELINE_PATH)) return null;
    return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

function writeBaseline(current, reason) {
    const baseline = {
        schemaVersion: 1,
        recordedAt: new Date().toISOString().slice(0, 10),
        reason,
        inlineOnlyFeatureIdCount: current.inlineOnly.length,
        featureModuleCount: current.featureModuleCount,
        // The full list, not just the count: when the number moves, the gate has
        // to be able to name which feature moved rather than saying "one more".
        inlineOnlyFeatureIds: current.inlineOnly,
    };
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
    return baseline;
}

function main(argv) {
    const record = argv.includes('--record');
    const acceptGrowth = argv.includes('--accept-growth');
    if (acceptGrowth && !record) {
        console.error('[monolith-peel] --accept-growth only means anything with --record.');
        return 1;
    }
    const current = measure();

    if (current.descriptorOnlyModules.length) {
        console.error('[monolith-peel] FAIL — these modules declare a feature id but implement nothing, '
            + 'so they would count a feature as peeled that is still inline:');
        for (const modulePath of current.descriptorOnlyModules) console.error(`[monolith-peel]   ${modulePath}`);
        return 1;
    }

    console.log(`[monolith-peel] ${current.featureModuleCount} peeled feature module(s) declaring `
        + `${current.moduleIdCount} feature id(s)`);
    console.log(`[monolith-peel] extension/ytkit.js declares ${current.monolithIdCount} feature id(s), `
        + `${current.totalFeatureIds} in total across both`);
    console.log(`[monolith-peel] remainder: ${current.inlineOnly.length} feature id(s) still implemented inline`);

    const baseline = readBaseline();
    if (!baseline) {
        if (!record) {
            console.error('[monolith-peel] no baseline recorded. Run with --record to write the first one.');
            return 1;
        }
        const written = writeBaseline(current, 'First recording of the peel remainder.');
        console.log(`[monolith-peel] recorded ${written.inlineOnlyFeatureIdCount} inline feature id(s).`);
        return 0;
    }

    const previous = new Set(baseline.inlineOnlyFeatureIds || []);
    const currentSet = new Set(current.inlineOnly);
    const added = current.inlineOnly.filter((id) => !previous.has(id));
    const peeled = [...previous].filter((id) => !currentSet.has(id)).sort();

    if (peeled.length) {
        console.log(`[monolith-peel] peeled since ${baseline.recordedAt}: ${peeled.join(', ')}`);
    }

    if (added.length && !acceptGrowth) {
        console.error(`[monolith-peel] FAIL — the monolith grew by ${added.length} feature id(s) since `
            + `${baseline.recordedAt}: ${added.join(', ')}`);
        console.error('[monolith-peel] A feature landing inline is a deliberate act, the same way removing a gate is.');
        console.error('[monolith-peel] Peel it into extension/features/<name>/index.js, or accept it in the SAME');
        console.error('[monolith-peel] commit with: node scripts/check-monolith-peel.js --record --accept-growth');
        return 1;
    }

    if (added.length && acceptGrowth) {
        // Deliberate and loud. Plain --record must never be able to raise the
        // ratchet, or the gate quietly records whatever it is handed; the
        // operator has to say the growth is intended.
        console.warn(`[monolith-peel] accepting ${added.length} new inline feature id(s): ${added.join(', ')}`);
    }

    if (record) {
        const written = writeBaseline(current, baseline.reason || 'Ratchet lowered after a peel.');
        console.log(`[monolith-peel] recorded ${written.inlineOnlyFeatureIdCount} inline feature id(s) `
            + `(was ${baseline.inlineOnlyFeatureIdCount}).`);
        return 0;
    }

    if (peeled.length) {
        console.warn(`[monolith-peel] the remainder fell to ${current.inlineOnly.length} from `
            + `${baseline.inlineOnlyFeatureIdCount}; lower the ratchet with --record.`);
    }

    console.log(`[monolith-peel] OK — remainder is ${current.inlineOnly.length}, at or below the recorded `
        + `${baseline.inlineOnlyFeatureIdCount}.`);
    return 0;
}

if (require.main === module) {
    process.exitCode = main(process.argv.slice(2));
}

module.exports = { measure, main, BASELINE_PATH };
