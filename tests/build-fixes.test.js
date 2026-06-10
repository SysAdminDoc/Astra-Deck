'use strict';

// tests/build-fixes.test.js — pins for the build/tooling audit fixes:
//   1. Windows zip path uses bsdtar (forward-slash entries), never
//      PowerShell 5.1 Compress-Archive (backslash entries break AMO/Linux).
//   2. Ephemeral CRX mode generates ONE per-run key so store-safe and
//      github-full validation artifacts share an extension ID.
//   3. build.yml attestation steps retry once without allowing silent skips.
//   4. check-no-eval comment suppression is not fooled by `//` in URLs.
//   5. check-contrast rejects non-#rrggbb input instead of coercing to black.
//   6. check-versions rejects an empty `--tag` value instead of silently
//      skipping tag validation.
//   7. Staging skip-lists exclude key material and logs from artifacts.
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

// ── 8. manifest ISOLATED content_scripts js-array parity ──

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
        'expected exactly two ISOLATED content_scripts blocks with js bundles (main pages + live_chat frame)');
    assert.deepEqual(isolatedJsBlocks[0].js, isolatedJsBlocks[1].js,
        'the live_chat ISOLATED bundle must list the same js files in the same order as the main-pages bundle — a module added to one but not the other ships a frame with missing core dependencies');
});

// ── 7. staging skip-lists exclude key material and logs ──

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

// ── 6. check-versions rejects empty --tag ──

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

// ── 1. Windows zip path uses bsdtar, not Compress-Archive ──

test('createZip never shells out to PowerShell Compress-Archive', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'build-extension.js'), 'utf8');
    assert.doesNotMatch(src, /Compress-Archive/,
        'Compress-Archive writes backslash zip entry separators — invalid for AMO XPIs and broken for Linux unzip');
    assert.match(src, /System32', 'tar\.exe'/,
        'the Windows zip branch must invoke System32 bsdtar by full path (a bare `tar` resolves to GNU tar under Git Bash and emits a POSIX tar, not a zip)');
    assert.match(src, /\['-a', '-cf', zipPath, '-C', sourceDir, \.\.\.entries\]/,
        'bsdtar must be fed explicit top-level entries so dotfiles are included without the ./ entry-name prefix');
});

// ── 2. ephemeral CRX mode shares one per-run key across profiles ──

test('ephemeral CRX mode generates a single per-run PKCS8 key with 0o600 mode', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'build-extension.js'), 'utf8');
    assert.match(src, /crypto\.generateKeyPairSync\('rsa', \{ modulusLength: 2048 \}\)/,
        'ephemeral mode must generate one concrete RSA key up front');
    assert.match(src, /\{ type: 'pkcs8', format: 'pem' \}/,
        'the ephemeral key must be exported as PKCS8 PEM (what crx3 consumes)');
    assert.match(src, /mode: 0o600/,
        'the on-disk ephemeral key must be owner-read/write only');
    assert.doesNotMatch(src, /chromeCrxPath\.replace\('\.crx', '\.pem'\)/,
        'the dead crx3-sidecar-pem rename path must stay deleted — crx3 never writes a .pem for generated keys');

    const builder = require('../build-extension.js');
    const config = builder.resolveCrxSigningConfig({ mode: 'ephemeral' });
    assert.equal(config.mode, 'ephemeral');
    assert.equal(config.keyPath, null,
        'resolveCrxSigningConfig stays key-less for ephemeral mode; build() supplies the per-run generated key');
});

// ── 3. build.yml attestation retry without silent skips ──

test('build.yml retries attestation once and the retry is fatal', () => {
    const workflow = fs.readFileSync(
        path.join(REPO_ROOT, '.github', 'workflows', 'build.yml'), 'utf8'
    );
    // First attempts are non-fatal and carry ids for the retry gate.
    assert.match(workflow, /id: attest-provenance\n\s+if: startsWith\(github\.ref, 'refs\/tags\/'\)\n\s+continue-on-error: true/,
        'provenance attestation first attempt must be continue-on-error with an id');
    assert.match(workflow, /id: attest-sbom\n\s+if: startsWith\(github\.ref, 'refs\/tags\/'\)\n\s+continue-on-error: true/,
        'SBOM attestation first attempt must be continue-on-error with an id');
    // Retries fire only on first-attempt failure and must NOT be continue-on-error.
    const provenanceRetry = workflow.match(/- name: Attest build provenance \(retry\)\n(.*?)(?=\n\n|\s*$)/s);
    assert.ok(provenanceRetry, 'provenance retry step must exist');
    assert.match(provenanceRetry[1], /steps\.attest-provenance\.outcome == 'failure'/);
    assert.doesNotMatch(provenanceRetry[1], /continue-on-error/,
        'the provenance retry must be fatal — no silent skips');
    const sbomRetry = workflow.match(/- name: Attest npm SBOM \(retry\)\n(.*?)(?=\n\n|\s*$)/s);
    assert.ok(sbomRetry, 'SBOM retry step must exist');
    assert.match(sbomRetry[1], /steps\.attest-sbom\.outcome == 'failure'/);
    assert.doesNotMatch(sbomRetry[1], /continue-on-error/,
        'the SBOM retry must be fatal — no silent skips');
    assert.match(workflow, /timeout-minutes: 30/,
        'the build job must carry a timeout so a hung step cannot burn the 6h default');
});

// ── 4. check-no-eval URL false-green fix ──

test('check-no-eval strips string-literal contents before the // suppression test', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'check-no-eval.js'), 'utf8');
    assert.match(src, /function stripStringLiteralContents\(/,
        'check-no-eval must define the string-literal stripper');
    assert.match(src, /stripStringLiteralContents\(lineText\.slice\(0, colIdx\)\)/,
        'the comment-suppression check must run on the string-stripped prefix, so a URL like https:// cannot false-green a finding');
});

// ── 5. check-contrast strict hex parsing ──

test('check-contrast rejects non-#rrggbb input and passes legitimately', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'check-contrast.js'), 'utf8');
    assert.match(src, /\^#\[0-9a-fA-F\]\{6\}\$/,
        'parseHex must validate strict #rrggbb input');
    assert.match(src, /throw new Error\('parseHex expects #rrggbb/,
        'parseHex must throw on malformed input instead of coercing NaN to black');
    assert.doesNotMatch(src, /bg: 'rgba\(/,
        'check entries must use pre-composited hex backgrounds, never raw rgba() strings');

    const result = runNodeCommand([path.join(REPO_ROOT, 'scripts', 'check-contrast.js')]);
    assert.equal(result.status, 0,
        'contrast audit must pass with the corrected composited button background: ' + String(result.stdout));
});
