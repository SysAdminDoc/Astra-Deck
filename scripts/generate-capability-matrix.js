#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT_PATH = path.join(REPO_ROOT, 'build', 'browser-capability-matrix.json');
const { CAPABILITY_MATRIX } = require(path.join(REPO_ROOT, 'extension', 'core', 'capability-probe.js'));
const { BUILD_FLAG_ENV_ROUTES, assertNoForeignFlags } = require('./cli-flag-guard');

const MANIFEST_PATH = path.join(REPO_ROOT, 'extension', 'manifest.json');

// The capability matrix has claimed a Chrome floor since it existed while the
// manifest declared nothing, so a Chrome below the floor installed happily and
// then met undefined behaviour instead of being told it was unsupported. Now
// both state it, which means both can drift. This is the only place that reads
// them together, so it is where they are held equal.
function assertChromeFloorAgrees(manifestOverride = null) {
    const declared = CAPABILITY_MATRIX.browsers?.chromium?.minimumChromeVersion;
    if (typeof declared !== 'string' || !/^\d+$/.test(declared)) {
        throw new Error(
            'capability-probe.js browsers.chromium.minimumChromeVersion must be a major-version string'
        );
    }

    const manifest = manifestOverride
        || JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    if (manifest.minimum_chrome_version !== declared) {
        throw new Error(
            `Chrome floor disagreement: extension/manifest.json declares `
            + `${JSON.stringify(manifest.minimum_chrome_version)} but the capability matrix claims `
            + `${JSON.stringify(declared)}. Both must name the same version.`
        );
    }

    // The prose baseline is what users and reviewers read; a matrix that says
    // "Chrome 120+" beside a manifest floor of 118 would be the same defect
    // wearing a different hat.
    const baseline = String(CAPABILITY_MATRIX.browsers.chromium.baseline || '');
    const stated = /Chrome\s+(\d+)/.exec(baseline);
    if (!stated || stated[1] !== declared) {
        throw new Error(
            `Chrome floor disagreement: the capability matrix baseline reads ${JSON.stringify(baseline)} `
            + `but minimumChromeVersion is ${JSON.stringify(declared)}.`
        );
    }
}

function buildCapabilityMatrix(options = {}) {
    assertChromeFloorAgrees(options.manifest || null);
    // The probe exports a deeply frozen runtime object. A JSON round-trip
    // gives the build artifact a stable, serialization-safe snapshot without
    // exposing functions or mutable references to the runtime module.
    return JSON.parse(JSON.stringify({
        product: 'Astra Deck',
        schemaVersion: CAPABILITY_MATRIX.schemaVersion,
        generatedBy: 'scripts/generate-capability-matrix.js',
        browsers: CAPABILITY_MATRIX.browsers,
        platformApiPolicy: CAPABILITY_MATRIX.platformApiPolicy,
        aiLanes: CAPABILITY_MATRIX.aiLanes,
        capabilities: CAPABILITY_MATRIX.capabilities
    }));
}

function renderCapabilityMatrix() {
    return `${JSON.stringify(buildCapabilityMatrix(), null, 2)}\n`;
}

function writeCapabilityMatrix(outputPath = DEFAULT_OUTPUT_PATH) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, renderCapabilityMatrix(), 'utf8');
    return outputPath;
}

function checkCapabilityMatrix(outputPath = DEFAULT_OUTPUT_PATH) {
    // The matrix is derived entirely from capability-probe.js and written into
    // the gitignored build/ directory, so on a fresh clone there is nothing to
    // compare against — and treating that as drift made `npm run check` fail
    // on every clean checkout. A missing artifact is not drift: generate it
    // and pass. Only a file that disagrees with the source is a failure.
    if (!fs.existsSync(outputPath)) {
        writeCapabilityMatrix(outputPath);
        return;
    }
    const actual = fs.readFileSync(outputPath, 'utf8');
    const expected = renderCapabilityMatrix();
    if (actual !== expected) {
        throw new Error(`Capability matrix is stale: ${path.relative(REPO_ROOT, outputPath)}\nRun npm run generate:capability-matrix`);
    }
}

if (require.main === module) {
    try {
        // Terminal command of `npm run build`, so it is where a swallowed
        // `-- --bump patch` lands. See scripts/cli-flag-guard.js.
        assertNoForeignFlags(process.argv.slice(2), {
            script: 'generate-capability-matrix.js',
            own: ['--output', '--check'],
            envRoutes: BUILD_FLAG_ENV_ROUTES
        });
        let outputPath = DEFAULT_OUTPUT_PATH;
        const outputFlagIndex = process.argv.indexOf('--output');
        if (outputFlagIndex !== -1) {
            const requestedOutput = process.argv[outputFlagIndex + 1];
            if (!requestedOutput || requestedOutput.startsWith('--')) {
                throw new Error('--output requires a file path');
            }
            outputPath = path.resolve(REPO_ROOT, requestedOutput);
        }
        if (process.argv.includes('--check')) {
            checkCapabilityMatrix(outputPath);
            console.log(`Capability matrix is current: ${path.relative(REPO_ROOT, outputPath)}`);
        } else {
            writeCapabilityMatrix(outputPath);
            console.log(`Generated capability matrix: ${path.relative(REPO_ROOT, outputPath)}`);
        }
    } catch (error) {
        console.error(error.message || error);
        process.exitCode = 1;
    }
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    assertChromeFloorAgrees,
    buildCapabilityMatrix,
    checkCapabilityMatrix,
    renderCapabilityMatrix,
    writeCapabilityMatrix
};
