'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

const auditExceptions = require(path.join(repoRoot, 'scripts', 'dependency-audit-exceptions.json'));
const dependencyAudit = require(path.join(repoRoot, 'scripts', 'audit-dependencies.js'));

test('dependency review stays local-only with no validate workflow', () => {
    assert.equal(
        fs.existsSync(path.join(repoRoot, '.github', 'workflows', 'validate.yml')),
        false,
        'GitHub validation workflows must stay absent under the local-build policy'
    );

    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    assert.match(pkg.scripts.check, /npm run audit:deps/,
        'local check script must include dependency auditing');
    assert.equal(
        pkg.scripts['audit:deps'],
        'npm run audit:deps:production && node scripts/audit-dependencies.js',
        'default dependency audit must cover production and the reviewed toolchain graph'
    );
    assert.equal(
        pkg.scripts['audit:deps:production'],
        'npm audit --omit=dev --audit-level=moderate',
        'production dependency audit must keep the moderate vulnerability floor'
    );
    // Python dependency auditing moved to SysAdminDoc/AstraDownloader with
    // the companion. Assert it is gone rather than leaving a silent hole: a
    // reintroduced audit:python here would audit a tree this repo no longer
    // contains and pass vacuously.
    assert.equal(pkg.scripts['audit:python'], undefined,
        'Python dependency auditing belongs to the AstraDownloader repository');
    assert.doesNotMatch(pkg.scripts.check, /audit:python/,
        'the check gate must not reference a Python audit this repo cannot run');
});

test('development dependency exception is narrow, machine-readable, and strict', () => {
    assert.equal(auditExceptions.schemaVersion, 1);
    assert.equal(auditExceptions.auditLevel, 'moderate');
    assert.equal(auditExceptions.scope, 'development-only');
    assert.equal(auditExceptions.exceptions.length, 1);

    const exception = auditExceptions.exceptions[0];
    assert.equal(exception.package, 'image-size');
    assert.deepEqual(
        exception.advisories.map((item) => item.id).sort(),
        ['GHSA-5p2g-fcmc-qvqq', 'GHSA-w3rx-r6r6-pgpr']
    );
    assert.equal(exception.shipsToUsers, false);

    const report = {
        auditReportVersion: 2,
        vulnerabilities: {
            'addons-linter': {
                severity: 'high',
                isDirect: false,
                via: ['image-size'],
                effects: ['web-ext'],
            },
            'image-size': {
                severity: 'high',
                isDirect: false,
                via: exception.advisories.map((item) => ({
                    url: item.url,
                    range: item.range,
                    severity: 'high',
                })),
            },
            'web-ext': {
                severity: 'high',
                isDirect: true,
                via: ['addons-linter'],
                fixAvailable: {
                    name: 'web-ext',
                    version: '5.5.0',
                    isSemVerMajor: true,
                },
            },
        },
        metadata: {
            vulnerabilities: {
                info: 0,
                low: 0,
                moderate: 0,
                high: 3,
                critical: 0,
                total: 3,
            },
        },
    };
    const lockfile = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'));
    assert.doesNotThrow(() => dependencyAudit.validateExceptionPolicy(report, auditExceptions, lockfile));

    const widened = structuredClone(report);
    widened.vulnerabilities['other-package'] = {
        severity: 'high',
        isDirect: false,
        via: [],
        effects: [],
    };
    assert.throws(
        () => dependencyAudit.validateExceptionPolicy(widened, auditExceptions, lockfile),
        /audited vulnerability package set/
    );
});
