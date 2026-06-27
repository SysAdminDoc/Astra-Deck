'use strict';

// tests/build-fixes.test.js - pins for local build/tooling fixes:
//   1. Windows zip path uses bsdtar, never PowerShell Compress-Archive.
//   2. Ephemeral CRX mode generates one per-run key across profiles.
//   3. Local release scripts replace remote build workflow attestations.
//   4. check-no-eval comment suppression is not fooled by URLs.
//   5. check-contrast rejects non-#rrggbb input.
//   6. check-versions rejects an empty --tag value.
//   7. Staging skip-lists exclude key material and logs.
//   8. ISOLATED content_scripts blocks stay in js-array parity.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');

function runNodeCommand(args) {
    return spawnSync(process.execPath, args, {
        stdio: 'pipe',
        cwd: REPO_ROOT,
        encoding: 'utf8'
    });
}

test('ISOLATED content_scripts blocks declare deep-equal js bundles', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(REPO_ROOT, 'extension', 'manifest.json'), 'utf8'
    ));
    const isolatedJsBlocks = (manifest.content_scripts || []).filter((block) =>
        (block.world === undefined || block.world === 'ISOLATED')
        && Array.isArray(block.js)
        && block.js.length > 0
    );
    assert.equal(isolatedJsBlocks.length, 2,
        'expected exactly two ISOLATED content_scripts blocks with js bundles');
    assert.deepEqual(isolatedJsBlocks[0].js, isolatedJsBlocks[1].js,
        'live_chat ISOLATED bundle must match the main-pages bundle');
});

test('build-extension shouldStageEntry refuses .pem and .log files', () => {
    const { shouldStageEntry } = require('../build-extension.js');
    assert.equal(shouldStageEntry('ytkit.pem'), false, '.pem must never be staged into artifacts');
    assert.equal(shouldStageEntry('debug.log'), false, '.log must never be staged into artifacts');
    assert.equal(shouldStageEntry('manifest.json'), true, 'real extension files must still stage');
    assert.equal(shouldStageEntry('ytkit.js'), true, 'real extension files must still stage');
});

test('duplicate staging skip-lists in scripts/ stay in sync on .pem/.log', () => {
    for (const rel of ['scripts/check-firefox-webext.js', 'scripts/smoke-chromium-optional-hosts.js']) {
        const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
        const listMatch = src.match(/STAGE_SKIP_SUFFIXES = \[[^\]]+\]/);
        assert.ok(listMatch, rel + ' must declare STAGE_SKIP_SUFFIXES');
        assert.match(listMatch[0], /'\.pem'/, rel + ' skip-list must include .pem');
        assert.match(listMatch[0], /'\.log'/, rel + ' skip-list must include .log');
    }
});

test('release readiness key-leak check scans extension/ recursively for *.pem', () => {
    const src = fs.readFileSync(
        path.join(REPO_ROOT, 'scripts', 'generate-release-readiness.js'), 'utf8'
    );
    assert.match(src, /function listPemFiles\(/,
        'generate-release-readiness.js must define a recursive pem scanner');
    assert.match(src, /listPemFiles\(path\.join\(repoRoot, 'extension'\)/,
        'the key-leak check must scan extension/, not just the repo root');
});

test('check-versions exits non-zero on `--tag ""` instead of silently skipping', () => {
    const script = path.join(REPO_ROOT, 'scripts', 'check-versions.js');
    const result = runNodeCommand([script, '--tag', '']);
    assert.notEqual(result.status, 0,
        'an empty --tag value must fail loudly, not silently skip tag validation');
    assert.match(String(result.stderr), /--tag requires a non-empty value/,
        'the error message must explain the empty --tag rejection');
});

test('check-versions exits non-zero when --tag is the last argument', () => {
    const script = path.join(REPO_ROOT, 'scripts', 'check-versions.js');
    const result = runNodeCommand([script, '--tag']);
    assert.notEqual(result.status, 0, 'a value-less --tag must fail loudly');
    assert.match(String(result.stderr), /--tag requires a non-empty value/);
});

test('check-versions still validates a matching explicit tag', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const script = path.join(REPO_ROOT, 'scripts', 'check-versions.js');
    const result = runNodeCommand([script, '--tag', 'v' + pkg.version]);
    assert.equal(result.status, 0,
        'a correct --tag vX.Y.Z must still pass: ' + String(result.stderr));
});

test('createZip never shells out to PowerShell Compress-Archive', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'build-extension.js'), 'utf8');
    assert.doesNotMatch(src, /Compress-Archive/,
        'Compress-Archive writes invalid backslash zip entry separators for AMO/Linux unzip');
    assert.match(src, /System32', 'tar\.exe'/,
        'Windows zip branch must invoke System32 bsdtar by full path');
    assert.match(src, /\['-a', '-cf', zipPath, '-C', sourceDir, \.\.\.entries\]/,
        'bsdtar must receive explicit top-level entries');
});

test('ephemeral CRX mode generates a single per-run PKCS8 key with 0o600 mode', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'build-extension.js'), 'utf8');
    assert.match(src, /crypto\.generateKeyPairSync\('rsa', \{ modulusLength: 2048 \}\)/,
        'ephemeral mode must generate one concrete RSA key up front');
    assert.match(src, /\{ type: 'pkcs8', format: 'pem' \}/,
        'the ephemeral key must be exported as PKCS8 PEM');
    assert.match(src, /mode: 0o600/,
        'the on-disk ephemeral key must be owner-read/write only');
    assert.doesNotMatch(src, /chromeCrxPath\.replace\('\.crx', '\.pem'\)/,
        'the dead crx3-sidecar-pem rename path must stay deleted');

    const builder = require('../build-extension.js');
    const config = builder.resolveCrxSigningConfig({ mode: 'ephemeral' });
    assert.equal(config.mode, 'ephemeral');
    assert.equal(config.keyPath, null,
        'resolveCrxSigningConfig stays key-less for ephemeral mode');
});

test('local artifact commands replace remote build workflow attestations', () => {
    assert.equal(
        fs.existsSync(path.join(REPO_ROOT, '.github', 'workflows', 'build.yml')),
        false,
        'GitHub build workflow must stay absent; releases are built locally'
    );
    const pkg = require('../package.json');
    assert.equal(pkg.scripts.build, 'node build-extension.js');
    assert.equal(pkg.scripts['release:manifest'], 'node scripts/generate-release-manifest.js');
    assert.equal(pkg.scripts['release:readiness'], 'node scripts/generate-release-readiness.js');
});

test('check-no-eval strips string-literal contents before the // suppression test', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'check-no-eval.js'), 'utf8');
    assert.match(src, /function stripStringLiteralContents\(/,
        'check-no-eval must define the string-literal stripper');
    assert.match(src, /stripStringLiteralContents\(lineText\.slice\(0, colIdx\)\)/,
        'comment-suppression check must run on the string-stripped prefix');
});

test('check-contrast rejects non-#rrggbb input and passes legitimately', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'check-contrast.js'), 'utf8');
    assert.match(src, /\^#\[0-9a-fA-F\]\{6\}\$/,
        'parseHex must validate strict #rrggbb input');
    assert.match(src, /throw new Error\('parseHex expects #rrggbb/,
        'parseHex must throw on malformed input instead of coercing NaN to black');
    assert.doesNotMatch(src, /bg: 'rgba\(/,
        'check entries must use pre-composited hex backgrounds');

    const result = runNodeCommand([path.join(REPO_ROOT, 'scripts', 'check-contrast.js')]);
    assert.equal(result.status, 0,
        'contrast audit must pass with the corrected composited button background: ' + String(result.stdout));
});
