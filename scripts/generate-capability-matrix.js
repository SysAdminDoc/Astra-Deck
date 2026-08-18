#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT_PATH = path.join(REPO_ROOT, 'build', 'browser-capability-matrix.json');
const { CAPABILITY_MATRIX } = require(path.join(REPO_ROOT, 'extension', 'core', 'capability-probe.js'));

function buildCapabilityMatrix() {
    // The probe exports a deeply frozen runtime object. A JSON round-trip
    // gives the build artifact a stable, serialization-safe snapshot without
    // exposing functions or mutable references to the runtime module.
    return JSON.parse(JSON.stringify({
        product: 'Astra Deck',
        schemaVersion: CAPABILITY_MATRIX.schemaVersion,
        generatedBy: 'scripts/generate-capability-matrix.js',
        browsers: CAPABILITY_MATRIX.browsers,
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
    buildCapabilityMatrix,
    checkCapabilityMatrix,
    renderCapabilityMatrix,
    writeCapabilityMatrix
};
