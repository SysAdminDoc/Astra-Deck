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
    const probed = new Set(probe.CASES.map(([panel]) => panel));
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

    for (const [, child, label] of probe.CASES) {
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
