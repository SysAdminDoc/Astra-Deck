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
