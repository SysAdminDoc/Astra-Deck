'use strict';

// npm appends `-- <flags>` to the LAST command of an `&&` chain. `npm run build
// -- --bump patch` therefore handed the flags to generate-capability-matrix.js,
// which ignored them, so the build ran unbumped at the default profile and
// exited 0 — silently wrong, which is the worst kind of build tooling.
//
// Two halves to the fix, both covered here: the chain terminal refuses flags it
// does not own and names the env var that works, and build-extension.js reads
// those env vars.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const buildSource = fs.readFileSync(path.join(repoRoot, 'build-extension.js'), 'utf8');
const { BUILD_FLAG_ENV_ROUTES } = require('../scripts/cli-flag-guard');

function run(args) {
    return spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' });
}

// ── the chain terminal refuses what it cannot act on ──────────────────────

test('a swallowed build flag fails the chain instead of being ignored', () => {
    const result = run(['scripts/generate-capability-matrix.js', '--check', '--bump', 'patch']);

    assert.notEqual(result.status, 0, '--bump reaching the matrix generator must not exit 0');
    const output = result.stdout + result.stderr;
    assert.match(output, /--bump/, 'the failure must name the flag that was swallowed');
    assert.match(output, /ASTRA_BUMP/, 'the failure must name the env route that works');
    assert.match(output, /LAST command of an && chain/,
        'the failure must explain why the flag never arrived');
});

test('the flags the terminal does own still work', () => {
    const result = run(['scripts/generate-capability-matrix.js', '--check']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('every npm chain that ends in a generator ends in one that rejects foreign flags', () => {
    // The guard only holds while the terminal command is a flag-rejecting
    // script. Appending a new command to either chain silently reopens the hole,
    // so the chain shape itself is pinned.
    for (const scriptName of ['build', 'build:userscript', 'build:userscript:no-crx']) {
        const chain = pkg.scripts[scriptName];
        assert.ok(chain, `package.json must define ${scriptName}`);
        const last = chain.split('&&').pop().trim();
        const target = last.startsWith('npm run ')
            ? pkg.scripts[last.replace('npm run ', '').trim()]
            : last;
        const file = (target.match(/(scripts\/[\w-]+\.js)/) || [])[1];
        assert.ok(file, `${scriptName} must terminate in a repo script, got: ${last}`);
        const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
        assert.match(source, /assertNoForeignFlags|assertKnownArgs/,
            `${file} terminates ${scriptName} and must reject flags it does not own`);
    }
});

// ── the env routes the failure advertises must actually be read ───────────

test('every advertised env route is one build-extension.js reads', () => {
    for (const [flag, route] of Object.entries(BUILD_FLAG_ENV_ROUTES)) {
        if (!route.startsWith('ASTRA_')) continue; // e.g. --with-userscript points at an npm script
        const name = route.split('=')[0];
        // Two idioms in the file: a direct process.env read, and a named
        // constant indexed into an injectable env object (the CRX key pair).
        const read = new RegExp(`process\\.env\\.${name}\\b|_ENV = '${name}'`);
        assert.ok(read.test(buildSource),
            `${flag} advertises ${name}, so build-extension.js must read it`);
    }
});

test('build-extension.js resolves bump and profile from the environment', () => {
    // The CLI flags are still first: the env var only fills in when the flag is
    // absent, so a direct `node build-extension.js --profile store-safe` is
    // never overridden by a stale shell variable.
    assert.match(buildSource,
        /if \(bumpIndex !== -1 \|\| \(IS_CLI && process\.env\.ASTRA_BUMP\)\)/,
        'bump must fall back to ASTRA_BUMP');
    assert.match(buildSource,
        /bumpType = bumpIndex !== -1 \? args\[bumpIndex \+ 1\] : process\.env\.ASTRA_BUMP;/,
        'an explicit --bump must win over the env var');
    assert.match(buildSource,
        /if \(profileIndex !== -1 \|\| \(IS_CLI && process\.env\.ASTRA_BUILD_PROFILE\)\)/,
        'profile must fall back to ASTRA_BUILD_PROFILE');
    assert.match(buildSource,
        /profileType = profileIndex !== -1 \? args\[profileIndex \+ 1\] : process\.env\.ASTRA_BUILD_PROFILE;/,
        'an explicit --profile must win over the env var');
});

// ── capture:surface is no longer a silent alias for capture:watch ─────────

test('capture:surface and capture:watch are no longer the same command', () => {
    assert.notEqual(pkg.scripts['capture:surface'], pkg.scripts['capture:watch'],
        'a byte-identical alias captures the watch page under the name of a surface capture');
    assert.match(pkg.scripts['capture:surface'], /--require-surface/);
});

test('capture:surface without --surface refuses rather than defaulting to watch', () => {
    const result = run(['scripts/capture-watch-mhtml.js', '--require-surface']);
    assert.notEqual(result.status, 0, 'a missing --surface must not fall through to the watch default');
    const output = result.stdout + result.stderr;
    assert.match(output, /requires --surface/);
    assert.match(output, /capture:watch/, 'the error must point at the script that does default to watch');
});

test('capture:surface with an explicit --surface is accepted', () => {
    // --help exits 0 after parsing, so this reaches the requireSurface check
    // without launching a browser.
    const result = run(['scripts/capture-watch-mhtml.js', '--require-surface', '--surface', 'search', '--help']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
});
