'use strict';

// The browser probe itself needs pinning. It is the only check that can answer
// what colour the engine actually paints for these surfaces, and the source
// gate beside it cannot: `check-light-theme-lane.js` reads text and was green
// while the Digital Wellbeing card rendered at about 1.05:1.
//
// These are fast assertions about the probe's shape and reach. The probe's own
// verdict comes from `npm run smoke:light-surfaces`, which needs Chromium and
// runs in the release smoke chain.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const probe = require('../scripts/probe-light-surfaces.js');

test('the probe covers a child of every family the surface system repaints', () => {
    const visual = require('../extension/core/settings-visual-system.js');
    const css = visual.SURFACE_VISUAL_SYSTEM_CSS;

    const forced = new Set();
    for (const block of css.matchAll(/:is\(([^)]*)\)\s*\{[^}]*background:\s*var\(--ytkit-premium-panel\)\s*!important/g)) {
        for (const raw of block[1].split(',')) {
            const selector = raw.trim();
            if (selector.startsWith('.ytkit-')) forced.add(selector.slice(1));
        }
    }
    assert.ok(forced.size > 20, 'the forced-surface families must still be readable');

    // A family is covered when the probe renders something inside it. Not every
    // forced surface has relit children, so the floor is the families that do.
    const probed = new Set(probe.allCases().map(([panel]) => panel));
    const covered = [...probed].filter((panel) => forced.has(panel));
    assert.ok(covered.length >= 10,
        `the probe must reach at least ten forced families, reaches ${covered.length}`);
});

test('every probed child is a real class the extension renders', () => {
    const files = [];
    (function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { if (entry.name !== '_locales') walk(full); }
            else if (/\.(js|html)$/.test(full)) files.push(full);
        }
    }(path.join(repoRoot, 'extension')));
    const authored = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');

    for (const [, child, label] of probe.allCases()) {
        assert.ok(authored.includes(child),
            `${label}: .${child} must exist in the extension, or the probe measures nothing`);
    }
});

test('the probe reads real stylesheets, not an empty page', () => {
    // The first version concatenated every extracted chunk into one <style>.
    // A single unbalanced brace in 816 KB of template literals made the browser
    // discard the rest, so every row reported the page default and the probe
    // passed while measuring nothing.
    for (const relative of ['extension/features/digital-wellbeing/index.js']) {
        const chunks = probe.extractCss(relative, null);
        assert.ok(Array.isArray(chunks), 'extractCss must return chunks, not a blob');
        assert.ok(chunks.length > 0, `${relative} must yield at least one CSS chunk`);
        assert.ok(chunks.some((chunk) => chunk.includes('ytkit-wellbeing-title')),
            `${relative} must yield the rules the probe measures`);
        for (const chunk of chunks) {
            const opens = (chunk.match(/\{/g) || []).length;
            const closes = (chunk.match(/\}/g) || []).length;
            assert.equal(opens, closes, 'an unbalanced chunk would poison the sheet it lands in');
        }
    }
});

test('the release smoke chain runs the probe', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts['smoke:light-surfaces'], 'node scripts/probe-light-surfaces.js');
    assert.match(pkg.scripts['release:browser-smokes'], /npm run smoke:light-surfaces/,
        'a release must not ship without the computed-contrast proof');
});

// WHEN a class under a repainted surface sets its own text colour, the probe
// SHALL measure it without anyone remembering to add it.
//
// The hand-written list was picked twice and missed siblings both times: the
// subs banner got its button relit and not its stat rows, the context menu got
// its items and not its header. Enumerating from the source found seven more
// on the first run.
test('the probe derives its cases instead of relying on the hand-written list', () => {
    const visual = require('../extension/core/settings-visual-system.js');
    const styleSources = [
        'extension/ytkit.js',
        'extension/features/download-ui/index.js',
        'extension/features/video-hider/index.js'
    ]
        .map((rel) => path.join(repoRoot, rel))
        .filter((abs) => fs.existsSync(abs))
        .map((abs) => fs.readFileSync(abs, 'utf8'));

    const derived = probe.derivedCases(visual.SURFACE_VISUAL_SYSTEM_CSS, styleSources);
    assert.ok(derived.length >= 20,
        `derivation found only ${derived.length} descendants; it is meant to be the coverage, not a garnish`);

    // And the full set is strictly larger than the list somebody typed.
    assert.ok(probe.allCases().length > probe.CASES.length,
        'allCases must fold the derived set in, or the derivation is decorative');

    // Every derived pair is prefix-contained: the root's own name, then a BEM
    // separator. A pair that fails this is measuring an unrelated element.
    for (const [root, child] of derived) {
        assert.ok(child.startsWith(root + '-') || child.startsWith(root + '__'),
            `${child} is not a descendant of ${root}`);
    }
});

test('the derived cases reach the families the hand-written list kept missing', () => {
    const covered = new Set(probe.allCases().map(([panel, child]) => panel + '>' + child));
    // Each of these shipped below AA in light theme while the probe was green,
    // because nobody had listed it.
    for (const pair of [
        'ytkit-subs-load-banner>ytkit-subs-load-banner__stat-value',
        'ytkit-context-menu>ytkit-context-menu-header',
        'ytkit-dl-history-panel>ytkit-dl-history-panel__empty',
        'ytkit-speed-presets>ytkit-speed-presets__status',
        'ytkit-mediadl-banner>ytkit-mediadl-banner__title'
    ]) {
        assert.ok(covered.has(pair), `${pair} must be in the probe's coverage`);
    }
});
