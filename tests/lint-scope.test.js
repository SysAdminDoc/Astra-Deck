'use strict';

// The gate scripts, the build script and the userscript sync script enforce
// every invariant the extension relies on. Until v4.70.0 they were the only
// JavaScript in the repository that was never linted — so the code that
// checks everything else was itself unchecked.
//
// This pins the scope so it cannot quietly shrink back.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { checkChainText } = require('./helpers/check-chain');

const repoRoot = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const eslintConfig = fs.readFileSync(path.join(repoRoot, 'eslint.config.js'), 'utf8');

test('the lint script covers the tooling tier, not just extension source', () => {
    const lint = pkg.scripts.lint;
    for (const target of ['scripts/**/*.js', 'build-extension.js', 'sync-userscript.js', 'extension/runtime-core-loader.mjs']) {
        assert.ok(lint.includes(target), `npm run lint must cover ${target}`);
    }
});

test('the tooling tier is configured with Node globals and the catch-reason rule', () => {
    const at = eslintConfig.indexOf("'scripts/**/*.js'");
    assert.ok(at > 0, 'eslint.config.js must declare a scripts/ tier');
    const block = eslintConfig.slice(at, at + 900);
    assert.match(block, /local\/require-catch-reason.*error/s,
        'a silently swallowed error in a gate is how a gate starts passing without checking anything');
    assert.match(block, /sharedNodeGlobals/, 'the tooling tier runs under Node, not a browser');
    assert.match(block, /sourceType:\s*'commonjs'/);
});

test('the ESM runtime loader is linted as a module', () => {
    const at = eslintConfig.indexOf("'extension/runtime-core-loader.mjs'");
    assert.ok(at > 0, 'the .mjs loader must have its own tier');
    assert.match(eslintConfig.slice(at, at + 500), /sourceType:\s*'module'/);
});

test('every gate script the check chain runs is inside the lint glob', () => {
    // A gate that lives outside scripts/ would silently escape the new tier.
    const chain = checkChainText();
    const referenced = Array.from(chain.matchAll(/node (scripts\/[\w.-]+\.js)/g)).map(m => m[1]);
    assert.ok(referenced.length >= 10, `expected the check chain to run many gates, saw ${referenced.length}`);
    for (const script of referenced) {
        assert.ok(script.startsWith('scripts/'),
            `${script} runs in the check chain but sits outside the linted scripts/ glob`);
        assert.ok(fs.existsSync(path.join(repoRoot, script)), `${script} must exist`);
    }
});
