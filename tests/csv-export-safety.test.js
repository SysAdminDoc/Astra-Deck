'use strict';

// Every CSV the extension writes carries uploader-controlled text: video
// titles, filenames, channel names. A title that begins with `=` is a live
// formula the moment the file opens in Excel, LibreOffice or Sheets.
//
// The bug this pins: quoting a cell does NOT neutralize it. `"=cmd|..."` is
// still evaluated. Two of the three exporters quoted only; the third detected
// the formula lead and responded by quoting, which is the same non-fix.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

function loadCsv() {
    globalThis.YTKitCore = {};
    const src = fs.readFileSync(path.join(repoRoot, 'extension/core/csv.js'), 'utf8');
    // eslint-disable-next-line no-eval
    (0, eval)(src);
    return globalThis.YTKitCore;
}

const core = loadCsv();

test('a formula-leading value is prefixed so a spreadsheet treats it as text', () => {
    for (const lead of ['=', '+', '-', '@', '\t', '\r']) {
        const cell = core.csvCell(`${lead}cmd|' /C calc'!A0`);
        assert.ok(cell.includes(`'${lead}`), `${JSON.stringify(lead)} must be neutralized, got ${cell}`);
    }
});

test('the classic DDE payload as a video title cannot execute', () => {
    const title = '=cmd|\' /C calc\'!A0';
    const cell = core.csvCell(title);
    // The cell must not begin a formula. It is quoted because it contains a
    // comma, but the leading apostrophe is what does the work.
    assert.ok(!/^"?=/.test(cell), `cell still starts a formula: ${cell}`);
    assert.ok(cell.startsWith('"\'=') || cell.startsWith("'="), cell);
});

test('ordinary values are untouched and unquoted', () => {
    assert.equal(core.csvCell('How to build a shed'), 'How to build a shed');
    assert.equal(core.csvCell(42), '42');
    assert.equal(core.csvCell(null), '');
    assert.equal(core.csvCell(undefined), '');
});

test('quoting still happens for commas, quotes and newlines', () => {
    assert.equal(core.csvCell('a,b'), '"a,b"');
    assert.equal(core.csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(core.csvCell('line1\nline2'), '"line1\nline2"');
});

test('a negative number is neutralized rather than silently changed', () => {
    // -5 leads with `-`, so it gets the text prefix. That is the correct
    // trade: a spreadsheet showing '-5 as text is recoverable, a spreadsheet
    // executing a payload is not.
    assert.equal(core.csvCell('-5'), "'-5");
});

test('csvRow neutralizes every cell, not just the first', () => {
    const row = core.csvRow(['safe', '=EVIL()', '+ALSO()']);
    const cells = row.split(',');
    assert.equal(cells[0], 'safe');
    assert.ok(cells[1].startsWith('"\'=') || cells[1].startsWith("'="), row);
    assert.ok(row.includes("'+ALSO()"), row);
});

test('all four shipped exporters route through the shared writer', () => {
    const monolith = fs.readFileSync(path.join(repoRoot, 'extension/ytkit.js'), 'utf8');
    const downloadUi = fs.readFileSync(path.join(repoRoot, 'extension/features/download-ui/index.js'), 'utf8');
    const subscriptionGroups = fs.readFileSync(
        path.join(repoRoot, 'extension/features/subscription-groups/index.js'), 'utf8');

    // Download history.
    const cellStart = downloadUi.indexOf('_csvCell(value) {');
    assert.ok(cellStart > 0);
    assert.match(downloadUi.slice(cellStart, cellStart + 700), /YTKitCore\.csvCell/);

    // Two monolith escapers plus the peeled Subscription Groups escaper. Each
    // must consult the shared writer and carry a safe local fallback.
    let found = 0;
    for (const [label, source] of [['monolith', monolith], ['subscriptionGroups', subscriptionGroups]]) {
        let searchFrom = 0;
        for (;;) {
            const at = source.indexOf('_csvEscape(value) {', searchFrom);
            if (at < 0) break;
            const body = source.slice(at, at + 900);
            assert.match(body, /typeof csvCell === 'function'/, `${label} escaper at ${at} must use the shared writer`);
            assert.match(body, /\^\[=\+\\-@\\t\\r\]/, `${label} escaper at ${at} fallback must neutralize the formula lead`);
            found += 1;
            searchFrom = at + 1;
        }
    }
    assert.equal(found, 3, 'all three feature CSV escapers are covered');
});
