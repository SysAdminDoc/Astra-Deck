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
    assert.equal(
        pkg.scripts['audit:deps'],
        'npm run audit:deps:production && npm audit --audit-level=moderate',
        'default dependency audit must cover production and the complete toolchain graph'
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

