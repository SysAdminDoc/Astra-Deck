'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

test('dependency review stays local-only with no validate workflow', () => {
    assert.equal(
        fs.existsSync(path.join(repoRoot, '.github', 'workflows', 'validate.yml')),
        false,
        'GitHub validation workflows must stay absent under the local-build policy'
    );

    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    assert.match(pkg.scripts.check, /npm run audit:deps/,
        'local check script must include dependency auditing');
    assert.equal(pkg.scripts['audit:deps'], 'npm audit --omit=dev --audit-level=moderate',
        'local dependency audit must keep the moderate vulnerability floor');
    assert.match(pkg.scripts.check, /npm run audit:python/,
        'local check script must include Python companion dependency auditing');
    assert.equal(pkg.scripts['audit:python'], 'node scripts/audit-python-deps.js',
        'Python dependency audit must stay local and source-controlled');
});

test('requirements stay pinned for local companion dependency review', () => {
    const requirements = fs.readFileSync(
        path.join(repoRoot, 'astra_downloader', 'requirements.txt'), 'utf8'
    );
    assert.match(requirements, /^yt-dlp==\d{4}\.\d+\.\d+$/m,
        'yt-dlp must remain exactly pinned for reviewed local updates');
    assert.match(requirements, /^curl_cffi==\d+\.\d+\.\d+$/m,
        'curl_cffi must remain exactly pinned for reviewed local updates');
});

test('Python companion audit emits release-review JSON and fails closed', () => {
    const audit = require(path.join(repoRoot, 'scripts', 'audit-python-deps.js'));
    assert.equal(
        audit.OUTPUT_PATH.endsWith(path.join('build', 'astra-downloader-pip-audit.json')),
        true,
        'Python audit must emit the named release-review artifact'
    );
    assert.equal(audit.FAILURE_FLOOR, 'moderate',
        'Python audit must fail moderate-or-higher findings');
    assert.equal(audit.isActionableSeverity('low'), false,
        'low-severity findings should not fail the release gate');
    assert.equal(audit.isActionableSeverity('unknown'), true,
        'unknown-severity findings must fail closed unless reviewed in code');

    const report = audit.normalizeAudit({
        dependencies: [{
            name: 'flask',
            version: '3.1.2',
            vulns: [{
                id: 'PYSEC-TEST-1',
                aliases: ['CVE-2099-0001'],
                severity: 'HIGH',
                fix_versions: ['3.1.3'],
                description: 'synthetic advisory'
            }]
        }]
    }, {
        now: new Date('2026-06-29T00:00:00.000Z')
    });
    assert.equal(report.status, 'fail',
        'unreviewed high-severity Python findings must fail the gate');
    assert.equal(report.summary.actionableFindings, 1);
    assert.equal(report.actionableFindings[0].package, 'flask');
});
