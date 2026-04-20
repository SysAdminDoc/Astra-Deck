'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
    getUserscriptBasename,
    resolveUserscriptPath
} = require('../scripts/repo-paths');

const repoRoot = path.join(__dirname, '..');

test('userscript path helper resolves the tracked source file case-safely', () => {
    const resolvedPath = resolveUserscriptPath(repoRoot);
    assert.ok(fs.existsSync(resolvedPath));
    assert.equal(getUserscriptBasename(repoRoot), 'YTKit.user.js');
});

test('repo-tracked userscript metadata points at the canonical raw install URL', () => {
    const source = fs.readFileSync(resolveUserscriptPath(repoRoot), 'utf8');
    // v3.15.0: URLs migrated from SysAdminDoc/YouTube-Kit to SysAdminDoc/Astra-Deck
    // after the GitHub repo rename. Relying on GitHub's redirect was fragile —
    // userscript auto-updaters (Tampermonkey, Violentmonkey) cached the old URL
    // and occasionally failed to follow redirects on update-check requests.
    assert.match(
        source,
        /^\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/SysAdminDoc\/Astra-Deck\/main\/YTKit\.user\.js$/m
    );
    assert.match(
        source,
        /^\/\/ @downloadURL\s+https:\/\/raw\.githubusercontent\.com\/SysAdminDoc\/Astra-Deck\/main\/YTKit\.user\.js$/m
    );
    assert.match(
        source,
        /^\/\/ @match\s+https:\/\/youtu\.be\/\*$/m
    );
});
