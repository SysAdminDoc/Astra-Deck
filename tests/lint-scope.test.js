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

// WHEN ESLint is upgraded, every rule the config enables SHALL still report.
//
// A lint run that passes proves nothing on its own: it looks identical whether
// the rules are working or silently not loading. That is the specific way an
// ESLint upgrade breaks a repo — a changed plugin API leaves the two local
// rules registered but inert, and every future violation ships green. So the
// rules are exercised against text that violates them, through the real config.
test('every rule the config enables still reports under the installed ESLint', async () => {
    const { ESLint } = require('eslint');
    const linter = new ESLint({ cwd: repoRoot });

    async function rulesFor(code, filePath) {
        const results = await linter.lintText(code, { filePath, warnIgnored: false });
        return new Set(results.flatMap((result) => result.messages.map((message) => message.ruleId)));
    }

    // require-catch-reason: an empty catch with no `// reason:` comment.
    const caught = await rulesFor(
        "'use strict';\ntry { void 0; } catch (_) {}\n",
        path.join(repoRoot, 'extension', 'core', 'csv.js')
    );
    assert.ok(caught.has('local/require-catch-reason'),
        `require-catch-reason did not report; saw ${JSON.stringify([...caught])}`);

    // no-constant-binary-expression, configured with checkRelationalComparisons.
    const constant = await rulesFor(
        "'use strict';\nconst x = (1 === 1) || undefined;\nvoid x;\n",
        path.join(repoRoot, 'extension', 'core', 'csv.js')
    );
    assert.ok(constant.has('no-constant-binary-expression'),
        `no-constant-binary-expression did not report; saw ${JSON.stringify([...constant])}`);

    // no-post-await-addlistener, which only applies to the service worker.
    const listener = await rulesFor(
        "'use strict';\nasync function boot() { await Promise.resolve(); chrome.runtime.onMessage.addListener(() => {}); }\nvoid boot;\n",
        path.join(repoRoot, 'extension', 'background.js')
    );
    assert.ok(listener.has('local/no-post-await-addlistener'),
        `no-post-await-addlistener did not report; saw ${JSON.stringify([...listener])}`);

    // And clean text stays clean, so the assertions above are about the code
    // rather than about the config refusing everything.
    const clean = await rulesFor(
        "'use strict';\nconst x = 1;\nvoid x;\n",
        path.join(repoRoot, 'extension', 'core', 'csv.js')
    );
    assert.deepEqual([...clean], []);
});

test('the installed ESLint is the one package.json asks for', () => {
    const declared = require(path.join(repoRoot, 'package.json')).devDependencies.eslint;
    const installed = require(path.join(repoRoot, 'node_modules', 'eslint', 'package.json')).version;
    const floor = declared.replace(/^[^\d]*/, '');
    const [major, minor] = installed.split('.').map(Number);
    const [floorMajor, floorMinor] = floor.split('.').map(Number);
    assert.equal(major, floorMajor, `installed eslint ${installed} is a different major to ${declared}`);
    assert.ok(minor >= floorMinor, `installed eslint ${installed} is below the declared ${declared}`);
});
