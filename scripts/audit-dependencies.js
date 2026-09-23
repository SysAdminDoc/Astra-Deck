'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const overridesPath = path.join(__dirname, 'dependency-overrides.json');
const lockfilePath = path.join(repoRoot, 'package-lock.json');
const npmrcPath = path.join(repoRoot, '.npmrc');
// --include=dev because this is the DEVELOPMENT audit. NODE_ENV=production, an
// omit=dev npmrc line or npm_config_omit all make a bare `npm audit` skip
// devDependencies and report clean; npm lets --include win over --omit.
const AUDIT_ARGS = Object.freeze(['audit', '--json', '--audit-level=moderate', '--include=dev']);

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sorted(values) {
    return [...values].sort();
}

function canonicalize(value) {
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [key, canonicalize(value[key])])
        );
    }
    return value;
}

function equalJson(actual, expected, label) {
    const actualText = JSON.stringify(canonicalize(actual));
    const expectedText = JSON.stringify(canonicalize(expected));
    if (actualText !== expectedText) {
        throw new Error(`${label} drifted\nexpected: ${expectedText}\nactual: ${actualText}`);
    }
}

// `.npmrc` sets `ignore-scripts=true` and names the 2026-08-04 ChainDrop
// worm as the reason, but nothing read it: deleting the file, or one
// `npm i --ignore-scripts=false`, was invisible to every gate. The lockfile
// invariant is the stronger half — no dependency in this tree declares an
// install script today, so a new one appearing is a decision someone has to
// make deliberately rather than inherit.
function validateInstallScriptPolicy(npmrcText, lockfile) {
    const problems = [];
    const enabled = npmrcText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .some((line) => /^ignore-scripts\s*=\s*true$/i.test(line));
    if (!enabled) {
        problems.push('.npmrc must set ignore-scripts=true — it is the only thing refusing '
            + 'dependency lifecycle hooks, and nothing else in the chain checks for them');
    }

    const withInstallScripts = Object.entries(lockfile?.packages || {})
        .filter(([, meta]) => meta && meta.hasInstallScript === true)
        .map(([name]) => name || '(root)')
        .sort();
    if (withInstallScripts.length) {
        problems.push('package-lock.json declares install script(s) for '
            + `${withInstallScripts.join(', ')}; review each before allowing it`);
    }
    return problems;
}

// package.json cannot carry comments, so an `overrides` pin arrives with no
// record of which advisory it answers or when anyone last looked at it — and a
// pin that looks current is not evidence that it is. The record lives in
// dependency-overrides.json and is checked against package.json here, so it
// cannot drift out of agreement with the pins it describes.
function validateResolutionOverrides(policy, manifest) {
    const documented = Array.isArray(policy.resolutionOverrides) ? policy.resolutionOverrides : [];
    const pinned = manifest.overrides || {};
    equalJson(
        Object.fromEntries(documented.map((item) => [item.package, item.range])),
        pinned,
        'documented resolution overrides vs package.json overrides'
    );
    for (const item of documented) {
        if (!item.reason || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.lastCheckedOn || ''))) {
            throw new Error(
                `resolution override ${item.package} needs a reason and an ISO lastCheckedOn date`
            );
        }
    }
    return documented;
}

function parseAuditOutput(output) {
    const text = String(output || '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < start) {
        throw new Error('npm audit did not return a JSON report');
    }
    return JSON.parse(text.slice(start, end + 1));
}

// The development audit has to be clean. It used to carry one reviewed
// exception (image-size 2.0.2 under web-ext -> addons-linter) with an exact
// graph pinned around it; web-ext 10.7.0 took the patched release, so that
// path is gone rather than left open for the next finding to walk through.
// A new finding is a decision to make in review, not something to absorb here.
function validateCleanAudit(report, exitStatus) {
    if (report?.auditReportVersion !== 2) {
        throw new Error(`unsupported npm audit report version: ${report?.auditReportVersion}`);
    }
    const findings = sorted(Object.keys(report.vulnerabilities || {}))
        .map((name) => `${name} (${report.vulnerabilities[name]?.severity || 'unknown'})`);
    const total = report.metadata?.vulnerabilities?.total;
    if (findings.length || total !== 0 || exitStatus !== 0) {
        throw new Error('development dependency audit is not clean: '
            + `${findings.join(', ') || `${total} finding(s)`}, npm exit ${exitStatus}`);
    }
}

function run() {
    const npmExecPath = process.env.npm_execpath;
    const spawnOptions = {
        cwd: repoRoot,
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 8 * 1024 * 1024,
    };
    // Three launch shapes:
    //  - Under `npm run`, npm_execpath points at npm-cli.js — invoke it with
    //    the current node binary directly (no shell).
    //  - Standalone on Windows, only the `npm.cmd` launcher exists, and Node's
    //    CVE-2024-27980 hardening rejects spawning a `.cmd` without a shell
    //    (EINVAL). Pass a single command string so shell:true does not trip
    //    the DEP0190 unescaped-args warning; the command is a fixed literal.
    //  - Standalone elsewhere, plain `npm`.
    let result;
    if (npmExecPath) {
        result = spawnSync(
            process.execPath,
            [npmExecPath, ...AUDIT_ARGS],
            spawnOptions
        );
    } else if (process.platform === 'win32') {
        result = spawnSync(
            `npm ${AUDIT_ARGS.join(' ')}`,
            { ...spawnOptions, shell: true }
        );
    } else {
        result = spawnSync('npm', [...AUDIT_ARGS], spawnOptions);
    }

    if (result.error) {
        throw result.error;
    }

    const report = parseAuditOutput(result.stdout || result.stderr);
    const policy = readJson(overridesPath);
    // Checked on every run. The overrides are WHY the audit is clean, so they
    // are the one thing worth re-reading exactly when nothing else fails.
    const overrides = validateResolutionOverrides(policy, readJson(path.join(repoRoot, 'package.json')));
    for (const item of overrides) {
        const advisory = item.answersAdvisory ? ` (${item.answersAdvisory})` : '';
        console.log(`[audit-deps] override ${item.package}@${item.range}${advisory}, last checked ${item.lastCheckedOn}`);
    }

    const installScriptProblems = validateInstallScriptPolicy(
        fs.existsSync(npmrcPath) ? fs.readFileSync(npmrcPath, 'utf8') : '',
        readJson(lockfilePath)
    );
    if (installScriptProblems.length) {
        throw new Error(installScriptProblems.join('; '));
    }
    console.log('[audit-deps] install scripts refused by .npmrc; no lockfile entry declares one');

    validateCleanAudit(report, result.status);
    console.log('[audit-deps] development dependency audit is clean');
}

if (require.main === module) {
    try {
        run();
    } catch (error) {
        console.error(`[audit-deps] FAIL — ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = {
    AUDIT_ARGS,
    parseAuditOutput,
    validateCleanAudit,
    validateInstallScriptPolicy,
    validateResolutionOverrides,
};
