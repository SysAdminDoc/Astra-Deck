'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.join(__dirname, '..');
const packageJson = require('../package.json');
const popupAudit = path.join(repoRoot, 'scripts', 'audit-popup-a11y.js');

test('npm run check uses non-mutating capability and overlay gates', () => {
    assert.match(packageJson.scripts.check, /npm run audit:overlays -- --self-test/,
        'npm run check must execute overlay mutation canaries');
    assert.match(packageJson.scripts.check, /node scripts\/generate-capability-matrix\.js --check/,
        'npm run check must verify, not rewrite, the capability matrix');
});

test('popup focus audit catches a new outline-suppressing selector', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-popup-a11y-'));
    const cssPath = path.join(tempDir, 'popup.css');
    const currentCss = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.css'), 'utf8');
    fs.writeFileSync(cssPath,
        `${currentCss}\n.popup-gate-bait:focus-visible { outline: none; box-shadow: var(--focus-ring); }\n`,
        'utf8');
    try {
        const result = spawnSync(process.execPath, [popupAudit], {
            cwd: repoRoot,
            env: { ...process.env, ASTRA_POPUP_CSS_PATH: cssPath },
            encoding: 'utf8'
        });
        assert.notEqual(result.status, 0,
            'a new outline-suppressing selector must fail until its forced-colors lane exists');
        assert.match(`${result.stdout}\n${result.stderr}`, /\.popup-gate-bait:focus-visible/,
            'the popup audit must name the uncovered selector');
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('a missing capability matrix is generated, not reported as drift', () => {
    // The matrix is derived from capability-probe.js and lives in the
    // gitignored build/ directory, so treating an absent file as drift made
    // `npm run check` fail on every fresh clone — and, being the last gate in
    // a fail-fast chain, it did so after everything else had already run.
    const { checkCapabilityMatrix, renderCapabilityMatrix } =
        require('../scripts/generate-capability-matrix.js');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-capability-'));
    const outputPath = path.join(tempDir, 'nested', 'browser-capability-matrix.json');
    try {
        assert.equal(fs.existsSync(outputPath), false, 'the fixture must start absent');
        checkCapabilityMatrix(outputPath);
        assert.equal(fs.readFileSync(outputPath, 'utf8'), renderCapabilityMatrix(),
            'the missing artifact must be written from source');

        // A file that disagrees with the source is still a failure.
        fs.writeFileSync(outputPath, '{"stale":true}\n', 'utf8');
        assert.throws(() => checkCapabilityMatrix(outputPath), /stale/,
            'genuine drift must still fail the gate');
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('project-facts gates tracked docs but only warns on local working notes', () => {
    const { DOCUMENT_TARGETS } = require('../scripts/project-facts.js');
    for (const target of DOCUMENT_TARGETS) {
        assert.ok(fs.existsSync(path.join(repoRoot, target)),
            `${target} is a tracked project-facts target and must exist`);
    }
    // CLAUDE.md is untracked, machine-local, and invisible to every other
    // checkout, so its staleness must not fail a shared gate.
    assert.equal(DOCUMENT_TARGETS.includes('CLAUDE.md'), false,
        'CLAUDE.md must not be a gated target');
    const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'project-facts.js'), 'utf8');
    assert.match(source, /OPTIONAL_DOCUMENT_TARGETS\.includes\(relativePath\) \? warnings : errors/,
        'optional targets must route to warnings rather than gate failures');
});
