#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
    BUILD_PROFILE_IDS,
    copyDir,
    patchStagedManifest,
    shouldStageEntry,
} = require('../build-extension.js');

const REPO_ROOT = path.join(__dirname, '..');
const EXT_DIR = path.join(REPO_ROOT, 'extension');
const WEB_EXT_BIN = path.join(REPO_ROOT, 'node_modules', 'web-ext', 'bin', 'web-ext.js');

function createFirefoxStage(profile, stageRoot) {
    if (!BUILD_PROFILE_IDS.includes(profile)) {
        throw new Error(`Invalid Firefox lint profile: ${profile}`);
    }
    const stageDir = path.join(stageRoot, `${profile}-firefox-stage`);
    copyDir(EXT_DIR, stageDir);

    patchStagedManifest(stageDir, profile, 'firefox');

    return stageDir;
}

// web-ext lint targets Mozilla-hosted submissions and rejects the valid
// self-distribution `browser_specific_settings.gecko.update_url` key. Keep
// that key in the packaged artifact, but remove it from this lint-only stage
// so the AMO policy checker does not mask the rest of the Firefox validation.
function stripSelfHostedUpdateUrlForLint(stageDir) {
    const manifestPath = path.join(stageDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const gecko = manifest.browser_specific_settings?.gecko;
    if (!gecko || !Object.hasOwn(gecko, 'update_url')) return false;
    delete gecko.update_url;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    return true;
}

// Astra Deck self-distributes its Firefox artifact; it is not an AMO-hosted
// listing. `--self-hosted` drops the hosting-specific checks that do not apply
// and would otherwise be permanent noise standing between this gate and
// treating warnings as failures.
function lintArgsForSource(sourceDir) {
    return [
        'lint',
        '--source-dir',
        sourceDir,
        '--self-hosted',
        '--output',
        'json',
    ];
}

// Warnings this project has read and accepted, with the date and the reason.
// Anything NOT listed fails the gate: before v4.88.3 the gate parsed the
// warning count and then threw it away, so four findings sat unread through
// every release.
//
// `import(getURL(path))` is the module-loading architecture itself. The
// argument is never user-controlled: `runtime-bootstrap.js` is generated from
// a frozen module list and `getURL` only mints extension-internal URLs, so
// the linter's "unsafe assignment" is a static-analysis limitation rather than
// a finding. Removing it would mean abandoning dynamic module loading.
const ACCEPTED_LINT_WARNINGS = Object.freeze([
    Object.freeze({
        code: 'UNSAFE_VAR_ASSIGNMENT',
        file: 'runtime-bootstrap.js',
        acceptedOn: '2026-08-27',
        reason: 'dynamic import of a generated, frozen module path through runtime.getURL'
    }),
    Object.freeze({
        code: 'UNSAFE_VAR_ASSIGNMENT',
        file: 'runtime-core-loader.mjs',
        acceptedOn: '2026-08-27',
        reason: 'dynamic import of a generated, frozen module path through runtime.getURL'
    })
]);

function isAcceptedWarning(warning) {
    return ACCEPTED_LINT_WARNINGS.some((accepted) =>
        accepted.code === warning?.code && accepted.file === warning?.file);
}

// Returns the warnings this gate refuses to ignore.
function unacceptedWarnings(parsed) {
    return (parsed?.warnings || []).filter((warning) => !isAcceptedWarning(warning));
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

    let parsed = null;
    try {
        parsed = JSON.parse(result.stdout);
    } catch (_) {
        // reason: an unparseable report is reported below, not silently passed
    }
    if (!parsed) {
        throw new Error(`web-ext lint produced no readable report for ${sourceDir}`);
    }
    const unaccepted = unacceptedWarnings(parsed);
    if (unaccepted.length) {
        for (const warning of unaccepted) {
            console.error(`[check-firefox-webext] ${warning.code} ${warning.file || ''}`
                + `${warning.line ? ':' + warning.line : ''} — ${warning.message}`);
        }
        throw new Error(
            `${unaccepted.length} unaccepted web-ext warning(s) for ${sourceDir}. `
            + 'Fix them, or add a dated entry to ACCEPTED_LINT_WARNINGS explaining why each is safe.');
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
            stripSelfHostedUpdateUrlForLint(stageDir);
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
    ACCEPTED_LINT_WARNINGS,
    isAcceptedWarning,
    unacceptedWarnings,
    createFirefoxStage,
    lintArgsForSource,
    parseArgs,
    shouldStageEntry,
    stripSelfHostedUpdateUrlForLint,
    summarizeLintOutput,
};
