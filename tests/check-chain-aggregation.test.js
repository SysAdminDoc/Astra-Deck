'use strict';

// Two systemic problems, one commit.
//
// (1) `npm run check` was a single `&&` chain, so it stopped at the first red
//     gate. When the i18n copy gate went red, the seventeen gates after it —
//     lint, both a11y audits, contrast, light-theme, the dependency audit, the
//     Firefox checks, the capability matrix — never ran at all, through
//     `npm run check` OR `release:prepare`. Work shipped with them unexercised
//     and nothing said so. A verification chain that hides verification is the
//     worst shape a gate can take.
//
// (2) The copy gate fingerprinted whole CSS blobs as UI copy, because
//     `styleEl.textContent = \`…\`` hits the same sink as a label. Every edit
//     to a stylesheet block in ytkit.js failed with "route new copy through
//     locale keys" and forced a baseline ratchet for a change that touched no
//     user-visible string.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const repoRoot = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const { GATES, MIN_GATES } = require('../scripts/run-checks.js');
const { looksLikeCss, collectJsLiterals, collectStrictJsLiterals, buildUiCopyBaseline } =
    require('../scripts/check-localizable-ui-copy.js');

// ── the chain no longer hides gates behind a failure ──────────────────────

test('npm run check goes through the aggregating runner', () => {
    assert.equal(pkg.scripts.check, 'node scripts/run-checks.js');
    assert.doesNotMatch(pkg.scripts.check, /&&/,
        'an && chain stops at the first failure, which is how seventeen gates went unrun');
});

test('the runner still covers every gate the chain had', () => {
    // The old chain ran 31 distinct gates. Losing one silently is the same
    // class of bug as stopping early, so the list carries its own floor.
    assert.ok(GATES.length >= MIN_GATES,
        `${GATES.length} gates is below the floor of ${MIN_GATES}`);
    const ids = GATES.map((g) => g.id);
    assert.equal(new Set(ids).size, ids.length, 'gate ids must be unique');
    for (const required of [
        'syntax', 'versions', 'i18n', 'i18n-copy', 'settings', 'no-eval',
        'reviewer-resources',
        'userscript-drift', 'firefox-webext', 'startup', 'lint', 'a11y-popup',
        'a11y-overlays', 'contrast', 'light-theme', 'deps', 'i18n-coverage',
        'capability-matrix'
    ]) {
        assert.ok(ids.includes(required), `the ${required} gate must still run`);
    }
});

test('every gate resolves to something that exists', () => {
    for (const gate of GATES) {
        if (gate.npm) {
            assert.ok(pkg.scripts[gate.npm], `${gate.id} points at a missing npm script`);
            continue;
        }
        const file = path.join(repoRoot, 'scripts', gate.script);
        assert.ok(fs.existsSync(file), `${gate.id} points at a missing script: ${gate.script}`);
    }
});

test('a gate that cannot even start is a failure, and says why', () => {
    // Reported as a bare "exit null" at first, which is barely better than a
    // silent pass. Node also refuses to spawn a .cmd without a shell
    // (CVE-2024-27980), which is exactly how lint and deps broke in testing.
    const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'run-checks.js'), 'utf8');
    // [^}]* cannot bound this block: it contains a ${...} placeholder, so the
    // class stops at the template brace. Assert the two halves separately.
    const has = (re, message) => assert.ok(re.test(source), message);
    has(/if \(result\.error\) \{/, 'a spawn failure must be detected');
    has(/could not be started: \$\{result\.error\.message\}/,
        'and reported at the point it happens');
    has(/could not start: \$\{failure\.error\.message\}/, 'and named in the summary');
    has(/const ok = result\.status === 0;/, 'null status must never count as a pass');
    has(/spawnSync\(`npm run \$\{gate\.npm\}`, \{/,
        'npm gates need a single command string: shell for .cmd, no argv for DEP0190');
});

test('the runner exits non-zero and lists every failure', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'run-checks.js'), 'utf8');
    assert.match(source, /const failed = results\.filter\(\(r\) => !r\.ok\);/);
    assert.match(source, /for \(const failure of failed\)/,
        'the summary must name each failure, not just count them');
    assert.match(source, /Every gate ran\./,
        'a full run must say so, or the reader cannot tell it from a fail-fast run');
    assert.match(source, /--fail-fast/,
        'the old behaviour stays available for a quick local loop');
});

test('--fail-fast reports how many gates it skipped', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'run-checks.js'), 'utf8');
    assert.match(source, /gate\(s\) were not run because --fail-fast was set/,
        'a truncated run must not read like a complete one');
});

// ── CSS is not UI copy ────────────────────────────────────────────────────

test('a stylesheet blob is not treated as UI copy', () => {
    assert.equal(looksLikeCss('.a { color: red; display: block; margin: 0; }'), true);
    assert.equal(looksLikeCss('@keyframes x{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}'), true);
    assert.equal(looksLikeCss('body{margin:0;background:#000;overflow:hidden}'), true);
});

test('real copy is still copy, braces and colons included', () => {
    assert.equal(looksLikeCss('Download this video'), false);
    assert.equal(looksLikeCss('Saved under {videoId}'), false);
    assert.equal(looksLikeCss('Ratio: 7.55:1 (target: 4.5:1)'), false,
        'colons alone are not declarations');
    assert.equal(looksLikeCss('{enabled}/{total} on'), false);
    assert.equal(looksLikeCss(''), false);
});

test('the CSS exclusion applies to both the legacy and the strict detector', () => {
    const css = 'el.textContent = `.x { color: red; display: block; margin: 0; }`;';
    const label = 'el.textContent = "Download this video";';
    assert.deepEqual(collectJsLiterals(css), []);
    assert.deepEqual(collectStrictJsLiterals(css), []);
    assert.equal(collectJsLiterals(label).length, 1,
        'a plain label must still be collected');
    assert.equal(collectStrictJsLiterals(label).length, 1);
});

test('the shipped tree has no CSS blob left in the copy baseline', () => {
    // Six were being counted: one in download-ui and five in ytkit.js.
    const ytkit = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
    for (const finding of collectJsLiterals(ytkit)) {
        assert.equal(looksLikeCss(finding.value), false,
            `a CSS blob is still fingerprinted as copy: ${finding.value.slice(0, 60)}`);
    }
});

// ── the gate still does its job ───────────────────────────────────────────

test('an untranslated label alongside a stylesheet is still caught', () => {
    // Through the real baseline builder, so the CSS exclusion is exercised on
    // the same path the gate uses — but against a scratch directory. An
    // earlier version of this test mutated extension/ytkit.js in place, which
    // is unsafe: node --test runs files in parallel, and another suite reading
    // ytkit.js mid-mutation failed against source that never existed on disk.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-copy-gate-'));
    try {
        fs.writeFileSync(path.join(dir, 'probe.js'), [
            "const styleEl = document.createElement('style');",
            'styleEl.textContent = `.ytkit-x { color: red; display: block; margin: 0; }`;',
            "const label = document.createElement('span');",
            "label.textContent = 'Download this video now';"
        ].join('\n'));

        const baseline = buildUiCopyBaseline(dir);
        const entry = Object.values(baseline.entries)[0];
        assert.ok(entry, 'the probe file must produce a baseline entry');
        assert.equal(entry.count, 1, 'the stylesheet must not be counted, the label must');
        assert.equal(entry.strictCount, 1,
            'the strict detector must still see a hardcoded textContent label');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
