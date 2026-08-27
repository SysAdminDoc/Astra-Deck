'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const exceptionPath = path.join(__dirname, 'dependency-audit-exceptions.json');
const lockfilePath = path.join(repoRoot, 'package-lock.json');
const npmrcPath = path.join(repoRoot, '.npmrc');

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

function getInstalledVersions(lockfile, names) {
    const packages = lockfile?.packages;
    if (!packages || typeof packages !== 'object') {
        throw new Error('package-lock.json is missing its packages map');
    }

    return Object.fromEntries(names.map((name) => {
        const entry = packages[`node_modules/${name}`];
        if (!entry?.version) {
            throw new Error(`package-lock.json has no installed entry for ${name}`);
        }
        return [name, entry.version];
    }));
}

function advisoryShape(entry) {
    return entry
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
            id: `GHSA-${String(item.url || '').split('GHSA-')[1] || ''}`,
            url: item.url,
            range: item.range,
            severity: item.severity,
        }))
        .sort((left, right) => left.id.localeCompare(right.id));
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

function validateExceptionPolicy(report, policy, lockfile) {
    if (report?.auditReportVersion !== 2) {
        throw new Error(`unsupported npm audit report version: ${report?.auditReportVersion}`);
    }
    if (policy?.schemaVersion !== 1 || policy.auditLevel !== 'moderate' || policy.scope !== 'development-only') {
        throw new Error('dependency audit exception policy metadata is invalid');
    }
    if (!Array.isArray(policy.exceptions) || policy.exceptions.length !== 1) {
        throw new Error('dependency audit exception policy must contain exactly one reviewed exception');
    }

    const exception = policy.exceptions[0];
    const vulnerabilityMap = report.vulnerabilities;
    const vulnerabilityNames = sorted(Object.keys(vulnerabilityMap || {}));
    const expectedNames = sorted([
        exception.package,
        ...exception.reachableThrough.map((item) => item.package),
    ]);
    equalJson(vulnerabilityNames, expectedNames, 'audited vulnerability package set');

    const installedVersions = getInstalledVersions(
        lockfile,
        expectedNames
    );
    equalJson(
        installedVersions,
        Object.fromEntries([
            [exception.package, exception.version],
            ...exception.reachableThrough.map((item) => [item.package, item.version]),
        ]),
        'reviewed development dependency versions'
    );

    const imageSize = vulnerabilityMap[exception.package];
    if (!imageSize || imageSize.severity !== exception.severity || imageSize.isDirect !== exception.directDependency) {
        throw new Error('image-size vulnerability metadata no longer matches the reviewed exception');
    }
    equalJson(
        advisoryShape(imageSize.via),
        exception.advisories.map((item) => ({
            id: item.id,
            url: item.url,
            range: item.range,
            severity: exception.severity,
        })).sort((left, right) => left.id.localeCompare(right.id)),
        'image-size advisory set'
    );

    const addonsLinter = vulnerabilityMap['addons-linter'];
    if (!addonsLinter || addonsLinter.severity !== exception.severity || addonsLinter.isDirect !== false) {
        throw new Error('addons-linter is no longer the reviewed transitive boundary');
    }
    equalJson(addonsLinter.via, [exception.package], 'addons-linter dependency path');
    equalJson(addonsLinter.effects, ['web-ext'], 'addons-linter effect path');

    const webExt = vulnerabilityMap['web-ext'];
    if (!webExt || webExt.severity !== exception.severity || webExt.isDirect !== true) {
        throw new Error('web-ext is no longer the reviewed direct development dependency');
    }
    equalJson(webExt.via, ['addons-linter'], 'web-ext dependency path');
    equalJson(webExt.fixAvailable, {
        name: exception.availableFix.package,
        version: exception.availableFix.version,
        isSemVerMajor: exception.availableFix.breaking,
    }, 'npm proposed fix');

    const metadata = report.metadata?.vulnerabilities;
    equalJson(metadata, {
        info: 0,
        low: 0,
        moderate: 0,
        high: 3,
        critical: 0,
        total: 3,
    }, 'audit severity totals');

    if (exception.shipsToUsers || exception.directDependency) {
        throw new Error('reviewed exception is not constrained to development tooling');
    }
    if (!exception.upstreamStatus || !exception.availableFix?.breaking) {
        throw new Error('reviewed exception is missing its upstream status or bounded fix note');
    }

    return exception;
}

// package.json cannot carry comments, so an `overrides` pin arrives with no
// record of which advisory it answers or when anyone last looked at it — and a
// pin that looks current is not evidence that it is. The record lives beside
// the audit exceptions and is checked against package.json here, so it cannot
// drift out of agreement with the pins it describes.
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
            [npmExecPath, 'audit', '--json', '--audit-level=moderate'],
            spawnOptions
        );
    } else if (process.platform === 'win32') {
        result = spawnSync(
            'npm audit --json --audit-level=moderate',
            { ...spawnOptions, shell: true }
        );
    } else {
        result = spawnSync('npm', ['audit', '--json', '--audit-level=moderate'], spawnOptions);
    }

    if (result.error) {
        throw result.error;
    }

    const report = parseAuditOutput(result.stdout || result.stderr);
    const policy = readJson(exceptionPath);
    // Checked before the clean-audit exit below. The overrides are WHY the
    // audit is clean, so skipping their record on a clean run would leave the
    // one thing worth re-reading unchecked exactly when nothing else is.
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

    if (result.status === 0 && report.metadata?.vulnerabilities?.total === 0) {
        console.log('[audit-deps] development dependency audit is clean');
        return;
    }

    const exception = validateExceptionPolicy(report, policy, readJson(lockfilePath));
    console.log(`[audit-deps] accepted one reviewed development-only exception: ${exception.package}@${exception.version}`);
    console.log(`[audit-deps] advisories: ${exception.advisories.map((item) => item.id).join(', ')}`);
    console.log(`[audit-deps] upstream status: ${exception.upstreamStatus}`);
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
    advisoryShape,
    parseAuditOutput,
    validateExceptionPolicy,
    validateInstallScriptPolicy,
};
