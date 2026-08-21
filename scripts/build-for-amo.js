#!/usr/bin/env node
'use strict';

// Builds the Firefox artifact the way an AMO reviewer will, and proves the
// build reproduces before anyone submits it.
//
// AMO auto-builds a submitted source tree and compares the result against the
// uploaded package. A match "can move through review much more quickly";
// otherwise review runs anywhere from three days to five weeks. `build-extension.js`
// is exactly the kind of generator that triggers mandatory source submission,
// so the rebuild is going to happen and the only question is whether it
// matches.
//
// What this script does that a plain build does not:
//
//   1. Builds twice from the same tree and fails if the two artifacts differ.
//      Reproducibility that is not checked is reproducibility that is not
//      true — the packaging step recorded file access times until v4.84.0 and
//      nobody noticed, because nothing ever compared two builds.
//   2. Refuses anything that would make the reviewer's rebuild diverge: a
//      version bump mid-build, CRX signing, the userscript bundle.
//
// It deliberately does NOT run `npm ci`. The reviewer runs that themselves
// against the submitted package-lock.json, and running it here would be this
// script proving something about its own node_modules rather than about the
// lockfile.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');
const BUILD_DIR = path.join(REPO_ROOT, 'build');

// The environment AMO's reviewers rebuild in, published and specific. Recorded
// here and in SOURCE-README.md so a mismatch is a known quantity rather than a
// surprise during review.
const REVIEWER_ENVIRONMENT = Object.freeze({
    os: 'Ubuntu 24.04.4 LTS',
    arch: 'ARM64 (aarch64)',
    node: '24.14.0',
    npm: '11.9.0'
});

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function artifactPath(version, profile) {
    return path.join(BUILD_DIR, `astra-deck-${profile}-firefox-v${version}.xpi`);
}

function runBuild(profile) {
    execFileSync(process.execPath, [
        path.join(REPO_ROOT, 'build-extension.js'),
        '--profile', profile,
        // No CRX: it is a Chrome artifact, it needs the maintainer key, and a
        // key the reviewer does not have would make the rebuild diverge.
        '--no-crx'
    ], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
}

function parseArgs(argv) {
    const known = new Set(['--profile']);
    const unknown = argv.filter((arg) => arg.startsWith('--') && !known.has(arg));
    if (unknown.length) {
        console.error(`[build-for-amo] unknown argument(s): ${unknown.join(', ')}`);
        process.exit(2);
    }
    const index = argv.indexOf('--profile');
    const profile = index === -1 ? 'store-safe' : argv[index + 1];
    if (!['store-safe', 'chromium-store', 'github-full'].includes(profile)) {
        console.error('[build-for-amo] --profile must be store-safe, chromium-store, or github-full');
        process.exit(2);
    }
    return { profile };
}

function main() {
    const { profile } = parseArgs(process.argv.slice(2));
    const version = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).version;
    const target = artifactPath(version, profile);

    console.log(`[build-for-amo] building ${profile} v${version} twice to prove it reproduces`);
    runBuild(profile);
    if (!fs.existsSync(target)) {
        throw new Error(`build produced no ${path.relative(REPO_ROOT, target)}`);
    }
    const first = sha256(target);

    runBuild(profile);
    const second = sha256(target);

    if (first !== second) {
        throw new Error(
            'the build is NOT reproducible: two runs of the same tree produced different artifacts\n'
            + `  run 1: ${first}\n  run 2: ${second}\n`
            + 'A reviewer rebuilding the submitted source will see the same mismatch.'
        );
    }

    console.log(`[build-for-amo] ${path.relative(REPO_ROOT, target).replace(/\\/g, '/')}`);
    console.log(`[build-for-amo] sha256 ${first}`);
    console.log('[build-for-amo] reproducible: two runs, identical bytes');
    console.log(
        `[build-for-amo] reviewer environment on record: ${REVIEWER_ENVIRONMENT.os} `
        + `${REVIEWER_ENVIRONMENT.arch}, Node ${REVIEWER_ENVIRONMENT.node}, npm ${REVIEWER_ENVIRONMENT.npm}`
    );
    console.log(`[build-for-amo] this run: ${process.platform}/${process.arch}, Node ${process.versions.node}`);
    console.log('[build-for-amo] see SOURCE-README.md before submitting');
}

if (require.main === module) {
    try {
        main();
    } catch (err) {
        console.error('[build-for-amo] ' + err.message);
        process.exit(1);
    }
}

module.exports = { REVIEWER_ENVIRONMENT, artifactPath, parseArgs, sha256 };
