'use strict';

// Injected CSS reaches for `--ytkit-*` custom properties that the palette must
// actually define. Twenty were referenced under names nothing declared, so
// every one of those `var()` calls could only ever yield its fallback literal:
// the surface was hardwired to a hex scattered across feature files and could
// not follow a theme change no matter what the palette said. One of them,
// `--ytkit-shadow-md`, was referenced with NO fallback at all, which makes the
// whole declaration invalid at computed-value time — the settings-panel
// preview tooltip simply rendered with no shadow.
//
// A phantom token is invisible in every other check: the CSS parses, nothing
// throws, and the surface looks plausible because the fallback is a real
// colour. Only a referenced-vs-defined comparison catches it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Set from JavaScript at runtime (geometry, z-index, per-video tints) rather
// than declared in a stylesheet, so absence from the palette is correct.
const RUNTIME_SET = new Set([
    '--ytkit-banner-z',
    '--ytkit-floating-chat-opacity',
    '--ytkit-floating-chat-x',
    '--ytkit-floating-chat-y',
    '--ytkit-photosensitive-dim',
    '--ytkit-progress-width',
    '--ytkit-split-right-width',
    '--ytkit-toast-rgb',
    '--ytkit-toast-z',
    '--ytkit-vh-accent'
]);

// Was three tokens whose call sites disagreed about the fallback, so no single
// definition was a no-op. Emptied on 2026-08-20 by splitting them along the
// line the disagreement was actually drawn on: page-embedded cards that must
// follow YouTube's theme (--ytkit-card-*, which has a light lane) versus
// Astra's own opaque dark overlays that must not (--ytkit-overlay-*, which
// deliberately does not). Kept as a pin so re-adding a name here is a
// deliberate act rather than a quiet regression.
const KNOWN_DIVERGENT = new Set([]);

function injectedSources() {
    const files = [
        'extension/ytkit.js',
        'extension/ytkit-main.js',
        'extension/early.css',
        'extension/live-chat.css'
    ];
    for (const dir of ['extension/features', 'extension/core']) {
        const abs = path.join(ROOT, dir);
        if (!fs.existsSync(abs)) continue;
        for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                const rel = `${dir}/${entry.name}/index.js`;
                if (fs.existsSync(path.join(ROOT, rel))) files.push(rel);
            } else if (entry.name.endsWith('.js')) {
                files.push(`${dir}/${entry.name}`);
            }
        }
    }
    return files.filter(rel => fs.existsSync(path.join(ROOT, rel)));
}

function scan() {
    const defined = new Set();
    const referenced = new Map();
    const files = injectedSources();
    for (const rel of files) {
        const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        for (const m of src.matchAll(/(--ytkit-[A-Za-z0-9-]+)\s*:/g)) defined.add(m[1]);
        for (const m of src.matchAll(/setProperty\(\s*['"](--ytkit-[A-Za-z0-9-]+)['"]/g)) defined.add(m[1]);
        for (const m of src.matchAll(/var\(\s*(--ytkit-[A-Za-z0-9-]+)/g)) {
            if (!referenced.has(m[1])) referenced.set(m[1], new Set());
            referenced.get(m[1]).add(rel);
        }
    }
    return { defined, referenced, fileCount: files.length };
}

test('the token scan covers the whole injected surface', () => {
    const { fileCount } = scan();
    // A scope floor: a hand-rolled file list silently shrinks and the gate
    // goes quiet without failing.
    assert.ok(fileCount >= 30,
        `expected the full injected source set, scanned only ${fileCount}`);
});

test('no injected CSS references a --ytkit- token nothing defines', () => {
    const { defined, referenced } = scan();
    const phantom = [...referenced.keys()]
        .filter(name => !defined.has(name))
        .filter(name => !RUNTIME_SET.has(name))
        .filter(name => !KNOWN_DIVERGENT.has(name))
        .sort();

    assert.deepEqual(phantom, [],
        'these resolve to their fallback literal forever, so the surface cannot be themed: '
        + phantom.map(name => `${name} (${[...referenced.get(name)].join(', ')})`).join('; '));
});

test('every var() without a fallback names a token that exists', () => {
    // This is the sharp case: no fallback and no definition makes the whole
    // declaration invalid, so the property silently does not apply.
    const { defined } = scan();
    const offenders = [];
    for (const rel of injectedSources()) {
        const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        for (const m of src.matchAll(/var\(\s*(--ytkit-[A-Za-z0-9-]+)\s*\)/g)) {
            if (!defined.has(m[1]) && !RUNTIME_SET.has(m[1])) offenders.push(`${m[1]} in ${rel}`);
        }
    }
    assert.deepEqual(offenders, [],
        'a var() with no fallback and no definition drops its declaration entirely');
});

test('the divergent-token list stays empty', () => {
    assert.deepEqual([...KNOWN_DIVERGENT], [],
        'a token here is referenced but undefined and exempted from the phantom check — '
        + 'split it by call site instead');
});

test('the page-embedded card family carries a light lane and the overlay family does not', () => {
    // The distinction is the whole point of the split. A card sits on
    // YouTube's own background and must follow YouTube's theme; an overlay
    // paints its own opaque dark ground and reads correctly on either, so
    // giving it a light lane would turn the ground light while the near-white
    // text stayed put — the exact defect check:light-theme exists to catch.
    const src = fs.readFileSync(path.join(ROOT, 'extension', 'ytkit.js'), 'utf8');
    const lightLane = src.match(/html:not\(\[dark\]\)\s*\{([^{}]*)\}/);
    assert.ok(lightLane, 'the palette must carry an html:not([dark]) lane');

    const relit = new Set([...lightLane[1].matchAll(/(--ytkit-[A-Za-z0-9-]+)\s*:/g)].map(m => m[1]));
    assert.deepEqual([...relit].sort(),
        ['--ytkit-card-bg', '--ytkit-card-border', '--ytkit-card-text'],
        'only the page-embedded card family may be relit on light theme');

    const { defined, referenced } = scan();
    const overlay = [...referenced.keys()].filter(name => name.startsWith('--ytkit-overlay-'));
    assert.ok(overlay.length >= 4, `expected the overlay family in use, found ${overlay.length}`);
    for (const name of overlay) {
        assert.ok(defined.has(name), `${name} is used but never defined`);
        assert.ok(!relit.has(name), `${name} must not be relit on light theme`);
    }
});

test('text on the accent surface clears the WCAG AA floor on every built-in accent', () => {
    // --ytkit-accent-contrast was undefined and the subscription-group primary
    // dialog button fell back to #fff, which against the shipped accent is
    // 2.82:1 — below the 4.5:1 AA floor for body text. Two other call sites
    // had already chosen a dark value; defining the token adopts that.
    //
    // The accent is themeable, so one fixed contrast colour has to hold across
    // every accent the product itself declares. A user-chosen accent can still
    // defeat it, which is why the check runs over the built-in set rather than
    // claiming a guarantee it cannot make.
    const src = fs.readFileSync(path.join(ROOT, 'extension', 'ytkit.js'), 'utf8');

    const luminance = (hex) => {
        const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
            .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const ratio = (a, b) => {
        const [la, lb] = [luminance(a), luminance(b)];
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };

    const contrast = src.match(/--ytkit-accent-contrast:\s*(#[0-9a-fA-F]{6})\s*;/);
    assert.ok(contrast, '--ytkit-accent-contrast must be defined as a hex in the palette');

    const accents = [...src.matchAll(/--ytkit-accent:\s*(#[0-9a-fA-F]{6})\s*(?:!important\s*)?;/g)]
        .map(m => m[1].toLowerCase());
    const unique = [...new Set(accents)];
    assert.ok(unique.length >= 2,
        `expected the built-in accent set, found ${unique.length}`);

    const failures = unique
        .map(accent => ({ accent, value: ratio(accent, contrast[1]) }))
        .filter(entry => entry.value < 4.5);

    assert.deepEqual(failures.map(f => `${f.accent} ${f.value.toFixed(2)}:1`), [],
        `${contrast[1]} must clear 4.5:1 on every built-in accent`);

    // Guards the premise: if white ever cleared AA on the shipped accent, the
    // original #fff fallback would not have been a defect at all.
    assert.ok(ratio('#ff6b4a', '#ffffff') < 4.5,
        'white on the shipped accent should still be the failing case this fixed');
});
