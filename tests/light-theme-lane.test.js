'use strict';

// The light-theme lane gate itself. A gate wired to the wrong data authorises
// everything and reads exactly like one that ran, so these tests drive the
// scanner against synthetic sources and assert it fails when it should.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { checkChainText } = require('./helpers/check-chain');

const repoRoot = path.join(__dirname, '..');
const GATE = path.join(repoRoot, 'scripts', 'check-light-theme-lane.js');
const BASELINE = path.join(repoRoot, 'scripts', 'light-theme-baseline.json');

function runGate() {
    try {
        return { code: 0, out: execFileSync(process.execPath, [GATE], { encoding: 'utf8' }) };
    } catch (error) {
        return { code: error.status ?? 1, out: `${error.stdout || ''}${error.stderr || ''}` };
    }
}

test('the light-theme lane passes on the current tree', () => {
    const { code, out } = runGate();
    assert.equal(code, 0, out);
    assert.match(out, /surface\(s\) carry a light lane/);
});

test('the baseline records the surfaces fixed in the theming pass as covered', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    const covered = new Set(baseline.covered);
    // Seeded from the 2026-08-06 theming fixes: if any of these loses its
    // html:not([dark]) rule the gate fails on the `lost` list.
    for (const token of [
        'ytkit-da-channel-chip',
        'ytkit-local-ai-btn',
        'ytkit-video-notes-container',
        'ytkit-ai-qa-btn'
    ]) {
        assert.ok(covered.has(token), `${token} must be pinned as covered`);
    }
    assert.ok(!baseline.accepted.some((token) => covered.has(token)),
        'a surface cannot be both covered and accepted');
    assert.equal(baseline.accepted.length, 0, 'the corrected light-theme gate has no legacy blind surfaces');
});

test('the measured baseline records the one-time regex delta by surface class', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    const measurement = baseline.measurement;
    const delta = measurement.deltaFromHexPrefix;

    assert.equal(measurement.background, '#ffffff');
    assert.equal(measurement.nearInvisibleBelow, '2.00:1');
    assert.equal(measurement.comparisonPrecision, 'two decimal places');
    assert.deepEqual(Object.fromEntries(Object.entries(delta).map(([key, values]) => [key, values.length])), {
        addedPaleNeutralOrAlphaText: 5,
        removedChromaticLiterals: 4,
        removedThemeAwareHostTokenFallbacks: 10,
        removedRelitPanelOverrides: 2,
        newlyCovered: 1
    });
    const explained = Object.values(delta).flat();
    assert.equal(explained.length, new Set(explained).size, 'every changed surface needs one explanation');
});

test('the scanner flags a new near-invisible surface and clears once a lane is added', (t) => {
    // Exercise the real scanner against a throwaway tree, so the assertion is
    // about behaviour rather than the shape of the current source.
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ytkit-light-lane-'));
    t.after(() => fs.rmSync(stage, { recursive: true, force: true }));

    const scanner = fs.readFileSync(GATE, 'utf8')
        .replace("path.join(__dirname, '..')", JSON.stringify(stage))
        .replace("path.join(__dirname, 'light-theme-baseline.json')",
            JSON.stringify(path.join(stage, 'baseline.json')))
        // The staged tree is one CSS file on purpose; the production scope
        // floor would reject it before the behaviour under test ever runs.
        // Neutralised here rather than given a runtime escape hatch in the gate.
        .replace('const MIN_SOURCES = 30;', 'const MIN_SOURCES = 0;');
    const scannerPath = path.join(stage, 'gate.js');
    fs.writeFileSync(scannerPath, scanner);
    fs.copyFileSync(
        path.join(repoRoot, 'scripts', 'check-contrast.js'),
        path.join(stage, 'check-contrast.js')
    );
    fs.mkdirSync(path.join(stage, 'extension'), { recursive: true });
    fs.writeFileSync(path.join(stage, 'baseline.json'),
        JSON.stringify({ accepted: [], covered: [] }));

    const cssPath = path.join(stage, 'extension', 'early.css');
    const run = () => {
        try {
            return { code: 0, out: execFileSync(process.execPath, [scannerPath], { encoding: 'utf8' }) };
        } catch (error) {
            return { code: error.status ?? 1, out: `${error.stdout || ''}${error.stderr || ''}` };
        }
    };

    // Dark-only surface: must fail.
    fs.writeFileSync(cssPath,
        '.ytkit-brand-new-pill { color: rgba(255,255,255,0.9); background: rgba(0,0,0,0.04); }\n');
    let result = run();
    assert.equal(result.code, 1, 'a new near-invisible surface must fail the gate');
    assert.match(result.out, /ytkit-brand-new-pill/);

    // An opaque shell is a valid source-level ground and remains exempt.
    fs.writeFileSync(cssPath,
        '.ytkit-opaque-pill { color: rgba(255,255,255,0.9); background: #0b1220; }\n');
    result = run();
    assert.equal(result.code, 0, result.out);

    // Add the lane: must pass.
    fs.appendFileSync(cssPath,
        'html:not([dark]) .ytkit-brand-new-pill { color: var(--yt-spec-text-primary, #0f0f0f); }\n');
    result = run();
    assert.equal(result.code, 0, result.out);

    // A rule already fenced to dark mode is not a light-theme problem.
    fs.writeFileSync(cssPath, 'html[dark] .ytkit-dark-only-pill { color: #fff; }\n');
    result = run();
    assert.equal(result.code, 0, result.out);

    // A surface with a dark-legible colour is not flagged at all.
    fs.writeFileSync(cssPath, '.ytkit-neutral-pill { color: var(--yt-spec-text-primary); }\n');
    result = run();
    assert.equal(result.code, 0, result.out);
});

test('the light-theme lane runs inside npm run check', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    assert.match(checkChainText(), /check-light-theme-lane\.js/,
        'the gate is only worth having if it runs with the others');
    assert.equal(pkg.scripts['audit:light-theme'], 'node scripts/check-light-theme-lane.js');
});

test('the rendered light smoke checks page and host theme contexts', () => {
    const smoke = fs.readFileSync(path.join(repoRoot, 'scripts', 'smoke-settings-overlay.js'), 'utf8');
    assert.match(smoke, /const LIGHT_THEME_CONTEXT_CHECKS/);
    assert.match(smoke, /state\.name\.endsWith\('-light'\)[\s\S]{0,160}LIGHT_THEME_CONTEXT_CHECKS/);
    assert.match(smoke, /getBoundingClientRect\(\)/, 'rendered context checks must prove the fixture is on-screen');
    assert.match(smoke, /runtimeGenerated/, 'rendered context checks must prove runtime-generated fixture nodes');
    for (const marker of ['fixture-light-rate', 'movie_player', 'ytkit-po-drop']) {
        assert.match(smoke, new RegExp(marker), `${marker} must be represented in the rendered light fixture`);
    }
});

test('the main userscript like-rate body uses the shared light-theme lane', () => {
    const userscript = fs.readFileSync(path.join(repoRoot, 'YTKit.user.js'), 'utf8');
    const featureStart = userscript.indexOf("id: 'likeViewRatio'");
    const featureEnd = userscript.indexOf("id: 'downloadThumbnail'", featureStart);
    assert.ok(featureStart >= 0 && featureEnd > featureStart, 'like-rate feature body must be present');
    const feature = userscript.slice(featureStart, featureEnd);
    assert.match(feature, /ytkit-meta-chip__value/);
    assert.match(feature, /ytkit-meta-chip__label/);
    assert.doesNotMatch(feature, /style\.cssText\s*=\s*['"]color:#aaa/,
        'the userscript must not ship the legacy near-invisible inline color');
    assert.match(userscript, /html:not\(\[dark\]\) \.ytkit-lv-ratio/);
    assert.match(userscript, /html:not\(\[dark\]\) \.ytkit-lv-ratio \.ytkit-meta-chip__value/);
});
