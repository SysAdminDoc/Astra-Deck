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
