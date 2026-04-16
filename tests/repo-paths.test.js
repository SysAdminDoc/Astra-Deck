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
    assert.match(
        source,
        /^\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/SysAdminDoc\/YouTube-Kit\/main\/YTKit\.user\.js$/m
    );
    assert.match(
        source,
        /^\/\/ @downloadURL\s+https:\/\/raw\.githubusercontent\.com\/SysAdminDoc\/YouTube-Kit\/main\/YTKit\.user\.js$/m
    );
    assert.match(
        source,
        /^\/\/ @match\s+https:\/\/youtu\.be\/\*$/m
    );
});
