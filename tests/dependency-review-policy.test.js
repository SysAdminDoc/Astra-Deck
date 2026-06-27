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
