#!/usr/bin/env node
'use strict';

/**
 * Generate extension/sidebar.html from extension/sidepanel.html.
 *
 * Firefox's sidebar_action and Chromium's side_panel need two HTML entry points
 * for what is one surface. sidebar.html was a hand-maintained byte-for-byte
 * clone of sidepanel.html with nothing keeping the two in sync, so every a11y
 * fix, copy change and markup change had to be made twice -- a smaller instance
 * of the same duplication tax as the module/monolith split, and one that had
 * already started costing double edits.
 *
 * The whole divergence is one line: the document title key. Everything else is
 * shared, so the sidebar is derived rather than duplicated, and `--check` fails
 * if the checked-in file drifts from what this produces.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const SOURCE = path.join(REPO_ROOT, 'extension', 'sidepanel.html');
const OUTPUT = path.join(REPO_ROOT, 'extension', 'sidebar.html');

const TITLE_FROM = '<title data-i18n="sidepanelDocTitle">Astra Deck: Dashboard</title>';
const TITLE_TO = '<title data-i18n="sidebarDocTitle">Astra Deck: Firefox Sidebar</title>';

const BANNER = '<!-- GENERATED FROM sidepanel.html by scripts/generate-sidebar.js -- do not edit directly. -->';

function render() {
    const source = fs.readFileSync(SOURCE, 'utf8');
    if (!source.includes(TITLE_FROM)) {
        throw new Error(
            `sidepanel.html no longer contains the expected title line:\n  ${TITLE_FROM}\n`
            + 'Update TITLE_FROM/TITLE_TO in scripts/generate-sidebar.js to match.'
        );
    }
    const body = source.replace(TITLE_FROM, TITLE_TO);
    // The banner goes after the doctype so the file still starts with it.
    const doctypeEnd = body.indexOf('\n');
    return `${body.slice(0, doctypeEnd)}\n${BANNER}${body.slice(doctypeEnd)}`;
}

function main(argv = process.argv.slice(2)) {
    const check = argv.includes('--check');
    const expected = render();

    if (!check) {
        fs.writeFileSync(OUTPUT, expected, 'utf8');
        console.log(`[generate-sidebar] wrote extension/sidebar.html (${Buffer.byteLength(expected)} bytes)`);
        return 0;
    }

    let actual;
    try {
        actual = fs.readFileSync(OUTPUT, 'utf8');
    } catch {
        console.error('[generate-sidebar] missing extension/sidebar.html; run npm run generate:sidebar');
        return 1;
    }
    if (actual !== expected) {
        console.error('[generate-sidebar] extension/sidebar.html has drifted from sidepanel.html;'
            + ' run npm run generate:sidebar');
        return 1;
    }
    console.log('[generate-sidebar] OK — sidebar.html matches sidepanel.html');
    return 0;
}

if (require.main === module) {
    process.exit(main());
}

module.exports = { OUTPUT, SOURCE, TITLE_FROM, TITLE_TO, main, render };
