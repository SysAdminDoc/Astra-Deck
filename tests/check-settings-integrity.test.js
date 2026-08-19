'use strict';

// Two defects in the schema gate, one of which was hiding the other.
//
// 1. Both orphan invariants used `corpus.includes(key)`. A key that is a
//    lexical substring of any other identifier could never be flagged: delete
//    every consumer of `sponsorBlock` and the gate stayed green because
//    `sponsorBlockBaseUrl` contains it.
//
// 2. The comment stripper was a non-greedy `/\*[\s\S]*?\*\//` that could not
//    tell a comment from a string containing comment punctuation. ytkit.js
//    carries the URL-pattern literal `'https://*/*'`, whose `/*` opened a
//    fake block comment running
//    75,662 characters and deleted roughly lines 5877-7300 of runtime code
//    from the corpus. Keys implemented only in that region looked
//    unreferenced — and the substring test in (1) is why nobody noticed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const gateSource = fs.readFileSync(path.join(repoRoot, 'scripts/check-settings.js'), 'utf8');
const monolith = fs.readFileSync(path.join(repoRoot, 'extension/ytkit.js'), 'utf8');

// Rebuild the gate's stripper in isolation so the behaviour, not the source
// text, is what gets asserted.
function loadStripper() {
    const start = gateSource.indexOf('function stripJsComments(source) {');
    assert.ok(start > 0, 'the gate must define stripJsComments');
    let depth = 0;
    let index = gateSource.indexOf('{', start);
    const open = index;
    for (; index < gateSource.length; index += 1) {
        if (gateSource[index] === '{') depth += 1;
        else if (gateSource[index] === '}') { depth -= 1; if (depth === 0) break; }
    }
    const body = gateSource.slice(start, index + 1);
    assert.ok(open > 0);
    // eslint-disable-next-line no-new-func
    return new Function(`${body}; return stripJsComments;`)();
}

const stripJsComments = loadStripper();

test('a comment marker inside a string literal does not open a comment', () => {
    const source = `const a = '/*/*';\nconst keyIsHere = 1;\nconst b = 2;`;
    const stripped = stripJsComments(source);
    assert.match(stripped, /keyIsHere/,
        'a string containing comment punctuation must not swallow the code after it');
    assert.match(stripped, /const b = 2/);
});

test('the exact ytkit.js literal that caused the 75k-character hole no longer deletes code', () => {
    const at = monolith.indexOf("'https://*/*'");
    assert.ok(at > 0, 'the literal this test exists for must still be present in ytkit.js');

    // The identifier immediately after that literal was the first casualty of
    // the fake comment. Strip the WHOLE file (slicing would start the scanner
    // in an arbitrary lexical state) and confirm it survives.
    const stripped = stripJsComments(monolith);
    assert.match(stripped, /describeCobaltInstanceUrl/,
        'code immediately after the comment-punctuation literal must survive stripping');

    // Byte totals are the wrong measure here: the correct stripper removes
    // MORE than the broken one (~172k of genuine comments against ~105k,
    // because the bogus 75k match used to swallow real comments as part of
    // one blob). What matters is that code from the deleted region survives.
    for (const identifier of ['describeCobaltInstanceUrl', 'hiddenGuideElements', 'uiStyle']) {
        assert.ok(stripped.includes(identifier),
            `${identifier} lives in the region the fake comment deleted and must survive`);
    }
});

test('real comments are still removed', () => {
    assert.doesNotMatch(stripJsComments('const a = 1; // secretKey\n'), /secretKey/);
    assert.doesNotMatch(stripJsComments('/* secretKey */ const a = 1;'), /secretKey/);
    assert.doesNotMatch(stripJsComments('/**\n * secretKey\n */\nconst a = 1;'), /secretKey/);
});

test('a regex literal containing comment punctuation is not treated as a comment', () => {
    const source = 'const re = /[/*]/; const keyIsHere = 1;';
    assert.match(stripJsComments(source), /keyIsHere/);
});

test('template literals survive intact', () => {
    const source = 'const css = `a { /* not a comment */ color: red; }`; const keyIsHere = 1;';
    const stripped = stripJsComments(source);
    assert.match(stripped, /keyIsHere/);
    assert.match(stripped, /color: red/, 'CSS inside a template is content, not a comment');
});

test('the gate matches schema keys on whole-token boundaries', () => {
    assert.match(gateSource, /corpusReferencesKey/,
        'both orphan invariants must use boundary matching, not corpus.includes(key)');
    assert.doesNotMatch(gateSource, /referenceCorpus\.includes\(key\)/);
    assert.doesNotMatch(gateSource, /runtimeCorpus\.includes\(key\)/);
    assert.match(gateSource, /\(\?<!\[A-Za-z0-9_\$\]\)/, 'a lookbehind boundary must guard the left edge');
});

test('the two keys the stripper defect was hiding have real consumers', () => {
    // Both are implemented inside the region the fake comment used to delete.
    for (const key of ['uiStyle', 'hiddenGuideElements']) {
        const pattern = new RegExp(`(?<![A-Za-z0-9_$])${key}(?![A-Za-z0-9_$])`);
        const stripped = stripJsComments(monolith);
        assert.ok(pattern.test(stripped), `${key} must survive comment stripping — it is read at runtime`);
    }
});
