'use strict';

// popup.html and sidepanel.html both load their page stylesheet first and
// surface-system.css second, so a `:root` custom property declared on a page
// is overridden before it ever paints. Sixty such declarations had accumulated
// across popup.css and sidepanel.css by 2026-08-20 and every single one held a
// different value from the one that actually shipped: popup's `--radius-md`
// said 12px while 10px rendered, and a documented AA contrast fix on
// `--text-subtle` had been silently inert since it was written.
//
// The failure mode is nasty because it is invisible from the page: editing a
// token there changes nothing, so the next person edits it again.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'extension');

/** Every custom property declared in a `:root` block of a stylesheet. */
function rootTokens(file) {
    const css = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const tokens = new Map();
    const blocks = /:root\s*\{([\s\S]*?)\}/g;
    let block;
    while ((block = blocks.exec(css))) {
        const decl = /(--[A-Za-z0-9-]+)\s*:\s*([^;]+);/g;
        let match;
        while ((match = decl.exec(block[1]))) tokens.set(match[1], match[2].trim());
    }
    return tokens;
}

/** The stylesheets a page loads, in document order. */
function stylesheetOrder(page) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    return [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)]
        .map(match => match[1]);
}

const PAGES = [
    { page: 'popup.html', css: 'popup.css' },
    { page: 'sidepanel.html', css: 'sidepanel.css' }
];

test('surface-system.css is still the last stylesheet each page loads', () => {
    // The whole argument below rests on this order. If a page ever loads its
    // own sheet last, the page tokens win instead and the tokens removed on
    // 2026-08-20 would come back to life with different values.
    for (const { page } of PAGES) {
        const sheets = stylesheetOrder(page);
        assert.ok(sheets.length >= 2, `${page} should load a page sheet and the shared system`);
        assert.equal(sheets.at(-1), 'surface-system.css',
            `${page} must load surface-system.css last for it to be the source of truth`);
    }
});

test('no page stylesheet redeclares a shared surface-system token', () => {
    const shared = rootTokens('surface-system.css');
    assert.ok(shared.size > 30, 'the shared system should define the full palette');

    for (const { css } of PAGES) {
        const overridden = [...rootTokens(css).keys()].filter(name => shared.has(name));
        assert.deepEqual(overridden, [],
            `${css} declares ${overridden.length} token(s) that surface-system.css overrides; `
            + 'they cannot affect rendering, so move the value into surface-system.css instead');
    }
});

test('every page-only token is genuinely absent from the shared system', () => {
    const shared = rootTokens('surface-system.css');
    for (const { css } of PAGES) {
        const tokens = rootTokens(css);
        assert.ok(tokens.size > 0, `${css} should still own its page-specific tokens`);
        for (const name of tokens.keys()) {
            assert.equal(shared.has(name), false,
                `${name} is defined in both ${css} and surface-system.css`);
        }
    }
});

// ── Colour literals outside :root ──────────────────────────────────────
// A hex written into a rule bypasses the palette entirely, so a theme change
// silently misses it. 85 such uses in popup.css and 22 in sidepanel.css were
// collapsed onto the tint scale in surface-system.css on 2026-08-21. What is
// left is only the fallback arm of a `var(--token, #hex)`, which never paints
// while the token exists and is kept so the arm still names the right colour.
const PAINTING_LITERAL_BUDGET = { 'popup.css': 0, 'sidepanel.css': 0 };

/** Hex literals in a stylesheet that are outside :root and would actually paint. */
function paintingLiterals(file) {
    const css = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const rootRanges = [];
    const roots = /:root[^{]*\{/g;
    for (let match = roots.exec(css); match; match = roots.exec(css)) {
        let depth = 1;
        let index = roots.lastIndex;
        while (index < css.length && depth > 0) {
            if (css[index] === '{') depth += 1;
            else if (css[index] === '}') depth -= 1;
            index += 1;
        }
        rootRanges.push([match.index, index]);
    }
    const found = [];
    const hex = /#[0-9a-fA-F]{3,8}\b/g;
    for (let match = hex.exec(css); match; match = hex.exec(css)) {
        if (rootRanges.some(([start, end]) => match.index >= start && match.index < end)) continue;
        if (/var\([^)]*,\s*$/.test(css.slice(Math.max(0, match.index - 120), match.index))) continue;
        found.push({ value: match[0], line: css.slice(0, match.index).split('\n').length });
    }
    return found;
}

test('no page stylesheet paints a colour the palette does not own', () => {
    for (const [file, budget] of Object.entries(PAINTING_LITERAL_BUDGET)) {
        const literals = paintingLiterals(file);
        assert.ok(literals.length <= budget,
            `${file} paints ${literals.length} raw hex literal(s) (budget ${budget}): `
            + literals.slice(0, 8).map(({ value, line }) => `${value}@${line}`).join(', ')
            + '. Add a rung to the tint scale in surface-system.css and use it.');
    }
});

test('every var() fallback arm names the value its token actually carries', () => {
    // A stale fallback is a lie that only shows up if the token ever goes
    // missing, which is exactly when nobody is looking. Five of these said
    // #f4f6fb while --astra-text has been #f4f6fa, and one said #c7cad1 for
    // --text-muted, which is #909baa.
    const shared = rootTokens('surface-system.css');
    const resolve = (name, seen = new Set()) => {
        if (seen.has(name)) return null;
        seen.add(name);
        const value = shared.get(name);
        if (!value) return null;
        const nested = /^var\(\s*(--[A-Za-z0-9-]+)\s*\)$/.exec(value);
        return nested ? resolve(nested[1], seen) : value;
    };

    for (const { css } of PAGES) {
        const source = fs.readFileSync(path.join(ROOT, css), 'utf8');
        const arms = source.matchAll(/var\(\s*(--[A-Za-z0-9-]+)\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/g);
        for (const [, token, literal] of arms) {
            const declared = resolve(token);
            if (!declared || !declared.startsWith('#')) continue;
            assert.equal(literal.toLowerCase(), declared.toLowerCase(),
                `${css}: var(${token}, ${literal}) but ${token} resolves to ${declared}`);
        }
    }
});
