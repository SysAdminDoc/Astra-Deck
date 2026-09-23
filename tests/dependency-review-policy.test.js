'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { checkChainText } = require('./helpers/check-chain');

const repoRoot = path.join(__dirname, '..');

const dependencyOverrides = require(path.join(repoRoot, 'scripts', 'dependency-overrides.json'));
const dependencyAudit = require(path.join(repoRoot, 'scripts', 'audit-dependencies.js'));

test('dependency review stays local-only with no validate workflow', () => {
    assert.equal(
        fs.existsSync(path.join(repoRoot, '.github', 'workflows', 'validate.yml')),
        false,
        'GitHub validation workflows must stay absent under the local-build policy'
    );

    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    assert.match(checkChainText(), /npm run audit:deps/,
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
    assert.doesNotMatch(checkChainText(), /audit:python/,
        'the check gate must not reference a Python audit this repo cannot run');
});

test('development dependency audit must be clean, with no exception path left', () => {
    // image-size 2.0.2 was the one reviewed exception. web-ext 10.7.0 took the
    // patched release, so the exception record and its validator are gone. A
    // stale "exceptions" list reappearing would be read by nothing, which is
    // worse than not having one.
    assert.equal(fs.existsSync(path.join(repoRoot, 'scripts', 'dependency-audit-exceptions.json')), false);
    assert.equal(Object.hasOwn(dependencyOverrides, 'exceptions'), false);
    assert.equal(dependencyAudit.validateExceptionPolicy, undefined);

    const clean = {
        auditReportVersion: 2,
        vulnerabilities: {},
        metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } },
    };
    assert.doesNotThrow(() => dependencyAudit.validateCleanAudit(clean, 0));

    const finding = structuredClone(clean);
    finding.vulnerabilities['image-size'] = { severity: 'high', isDirect: false, via: [], effects: [] };
    finding.metadata.vulnerabilities.high = 1;
    finding.metadata.vulnerabilities.total = 1;
    assert.throws(() => dependencyAudit.validateCleanAudit(finding, 1), /not clean: image-size \(high\)/);

    // Each signal is enough on its own: a report whose map and totals disagree,
    // or an npm exit code that says something the JSON does not, still fails.
    const totalsOnly = structuredClone(clean);
    totalsOnly.metadata.vulnerabilities.total = 2;
    assert.throws(() => dependencyAudit.validateCleanAudit(totalsOnly, 0), /not clean: 2 finding\(s\)/);
    assert.throws(() => dependencyAudit.validateCleanAudit(clean, 1), /npm exit 1/);
    assert.throws(() => dependencyAudit.validateCleanAudit({ ...clean, auditReportVersion: 3 }, 0),
        /unsupported npm audit report version/);
});

test('every package.json override carries its review record', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    assert.doesNotThrow(() => dependencyAudit.validateResolutionOverrides(dependencyOverrides, pkg));

    const undocumented = structuredClone(pkg);
    undocumented.overrides = { ...pkg.overrides, 'left-pad': '^1.3.0' };
    assert.throws(() => dependencyAudit.validateResolutionOverrides(dependencyOverrides, undocumented),
        /documented resolution overrides vs package.json overrides/);
});
