#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { patchManifestForFirefox } = require('./manifest-patch');
const {
    BUILD_PROFILE_IDS,
    patchManifestForBuildProfile,
} = require('../build-extension.js');

const REPO_ROOT = path.join(__dirname, '..');
const EXT_DIR = path.join(REPO_ROOT, 'extension');
const WEB_EXT_BIN = path.join(REPO_ROOT, 'node_modules', 'web-ext', 'bin', 'web-ext.js');

const STAGE_SKIP_NAMES = new Set([
    '.git',
    '.DS_Store',
    'Thumbs.db',
    'node_modules',
    '.claude-octopus',
]);

const STAGE_SKIP_SUFFIXES = [
    '.map',
    '.tmp',
    '.bak',
    '.orig',
    '.rej',
];

function shouldStageEntry(entryName) {
    if (STAGE_SKIP_NAMES.has(entryName)) return false;
    return !STAGE_SKIP_SUFFIXES.some((suffix) => entryName.endsWith(suffix));
}

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (!shouldStageEntry(entry.name)) continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(srcPath, destPath);
        else fs.copyFileSync(srcPath, destPath);
    }
}

function createFirefoxStage(profile, stageRoot) {
    if (!BUILD_PROFILE_IDS.includes(profile)) {
        throw new Error(`Invalid Firefox lint profile: ${profile}`);
    }
    const stageDir = path.join(stageRoot, `${profile}-firefox-stage`);
    copyDir(EXT_DIR, stageDir);

    const manifestPath = path.join(stageDir, 'manifest.json');
    const stagedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    patchManifestForBuildProfile(stagedManifest, profile);
    patchManifestForFirefox(stagedManifest);
    fs.writeFileSync(manifestPath, `${JSON.stringify(stagedManifest, null, 2)}\n`, 'utf8');

    return stageDir;
}

function lintArgsForSource(sourceDir) {
    return [
        'lint',
        '--source-dir',
        sourceDir,
        '--output',
        'json',
    ];
}

function summarizeLintOutput(stdout) {
    try {
        const parsed = JSON.parse(stdout);
        const summary = parsed.summary || {};
        return {
            errors: Number(summary.errors ?? parsed.errors?.length ?? 0),
            warnings: Number(summary.warnings ?? parsed.warnings?.length ?? 0),
            notices: Number(summary.notices ?? parsed.notices?.length ?? 0),
        };
    } catch (_) {
        return null;
    }
}

function runWebExtLint(sourceDir) {
    if (!fs.existsSync(WEB_EXT_BIN)) {
        throw new Error('web-ext is not installed. Run `npm ci` before `npm run check:firefox`.');
    }

    const result = spawnSync(process.execPath, [WEB_EXT_BIN, ...lintArgsForSource(sourceDir)], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.error) throw result.error;

    const summary = summarizeLintOutput(result.stdout);
    if (result.status !== 0) {
        if (result.stdout) console.error(result.stdout.trim());
        if (result.stderr) console.error(result.stderr.trim());
        throw new Error(`web-ext lint failed for ${sourceDir} with exit code ${result.status}`);
    }

    return summary;
}

function parseArgs(argv) {
    const opts = {
        keepStage: false,
        stageRoot: '',
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--keep-stage') opts.keepStage = true;
        else if (arg === '--stage-root') {
            const value = argv[i + 1];
            if (!value) throw new Error('--stage-root requires a path');
            opts.stageRoot = path.resolve(value);
            i += 1;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }
    return opts;
}

function main(argv = process.argv.slice(2)) {
    const opts = parseArgs(argv);
    const stageRoot = opts.stageRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'astra-firefox-webext-'));
    fs.mkdirSync(stageRoot, { recursive: true });

    try {
        for (const profile of BUILD_PROFILE_IDS) {
            const stageDir = createFirefoxStage(profile, stageRoot);
            const summary = runWebExtLint(stageDir);
            const suffix = summary
                ? `${summary.errors} errors, ${summary.warnings} warnings, ${summary.notices} notices`
                : 'lint completed';
            console.log(`[check-firefox-webext] ${profile}: ${suffix}`);
        }
    } finally {
        if (!opts.keepStage && fs.existsSync(stageRoot)) {
            fs.rmSync(stageRoot, { recursive: true, force: true });
        }
    }
}

if (require.main === module) {
    try {
        main();
    } catch (err) {
        console.error('[check-firefox-webext]', err.message || err);
        process.exit(1);
    }
}

module.exports = {
    createFirefoxStage,
    lintArgsForSource,
    parseArgs,
    shouldStageEntry,
    summarizeLintOutput,
};
