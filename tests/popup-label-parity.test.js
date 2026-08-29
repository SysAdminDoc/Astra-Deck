'use strict';

// The schema overview row deliberately humanises its label — there is a comment
// in popup.js about voice-control targeting — and then four other things about
// the same row spoke the raw storage key instead: the reset button's tooltip
// and accessible name, the reset toast, and the write-failure status. A user
// looking at "Custom progress bar colour" heard "customProgressBarColor", which
// matches nothing on screen. A third call site used a fourth spelling
// (entry.labelKey || entry.key), so the three disagreed with each other too.
//
// The raw key is still reachable: it stays on the row label's own tooltip.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const popupJs = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8');

function rowBuilder() {
    const at = popupJs.indexOf('function buildSchemaOverviewKeyRow(entry, settings) {');
    assert.ok(at > 0, 'popup.js must still build the schema overview row');
    // Closing-brace anchor, not a character count: this function is ~500 lines
    // and growing, and a fixed window stops reaching its assertions silently.
    const end = popupJs.indexOf('\n}', at);
    assert.ok(end > at, 'could not bound buildSchemaOverviewKeyRow');
    return popupJs.slice(at, end);
}

// ── the humaniser, run over the whole schema ────────────────────────────────

const { humanizeSettingKey, SETTINGS_SCHEMA } = require('../extension/core/settings-schema.js');

test('the humaniser turns every storage key in the schema into something readable', () => {
    // The source assertions below prove the row USES one name everywhere.
    // They cannot tell whether that name is readable — a humaniser that
    // returned its argument unchanged would satisfy every one of them and put
    // "customProgressBarColor" back on screen.
    assert.ok(SETTINGS_SCHEMA.length > 400, `expected the full schema, saw ${SETTINGS_SCHEMA.length}`);

    const unchanged = [];
    for (const entry of SETTINGS_SCHEMA) {
        const label = humanizeSettingKey(entry.key);
        assert.ok(String(label || '').trim(), `${entry.key} humanises to nothing`);
        assert.doesNotMatch(label, /_/, `${entry.key} keeps an underscore in "${label}"`);
        if (label === entry.key) unchanged.push(entry.key);
    }
    // A key that is already one lowercase word legitimately survives; a
    // camelCase key must not.
    for (const key of unchanged) {
        assert.match(key, /^[a-z]+$/,
            `"${key}" reached the screen as the raw storage key`);
    }
});

test('the humaniser splits camelCase and keeps the initialisms readable', () => {
    assert.equal(humanizeSettingKey('customProgressBarColor'), 'Custom progress bar color');
    assert.equal(humanizeSettingKey('aiSummaryApiKey'), 'AI summary API key',
        'AI and API are read as words, not spelled out letter by letter');
    assert.equal(humanizeSettingKey('uiFontSize'), 'UI font size');
    assert.equal(humanizeSettingKey(''), '', 'and an empty key is not decorated into something');
});

test('the row resolves one visible name and renders it', () => {
    const body = rowBuilder();
    assert.match(body, /const visibleLabel = overrideLabel\s*\|\|\s*\(typeof humanizer === 'function' \? humanizer\(entry\.key\) : entry\.key\);/,
        'the humaniser and the labelKey override must resolve to one value');
    assert.match(body, /label\.textContent = visibleLabel;/,
        'the on-screen label must be that value');
});

test('every name the row speaks is the name it shows', () => {
    // Exhaustive over one function's source, and deliberately so: the claim is
    // that NO call site in the row uses anything but `visibleLabel`, which is a
    // statement about all of them. buildSchemaOverviewKeyRow needs the popup's
    // live optional-host state, risk vocabulary and surface chips to run, and
    // `npm run smoke:a11y` renders the real thing; these keep the row from
    // being unwound in between.
    const body = rowBuilder();

    assert.match(body, /\.replace\('\{key\}', visibleLabel\)/,
        'the reset tooltip must use the visible label');
    assert.match(body, /t\('schemaResetAriaTpl'[\s\S]{0,80}\.replace\('\{key\}', visibleLabel\)\)/,
        'the reset button accessible name must use the visible label');
    assert.match(body, /t\('statusPerKeyResetTpl'[\s\S]{0,80}\.replace\('\{key\}', visibleLabel\)/,
        'the reset toast must use the visible label');
    assert.match(body, /btn\.setAttribute\('aria-label', visibleLabel \+ ' \(' \+ stateWord \+ '\)'\)/,
        'the switch accessible name must contain the visible label');

    const writeErrors = [...body.matchAll(/formatSettingWriteError\(([^,]+),/g)].map((m) => m[1]);
    assert.ok(writeErrors.length >= 3, `expected the write-failure call sites, found ${writeErrors.length}`);
    assert.deepEqual([...new Set(writeErrors)], ['visibleLabel'],
        'the three write-failure sites disagreed on which name to use');
});

test('no user-facing string in the row interpolates the raw storage key', () => {
    const body = rowBuilder();
    assert.doesNotMatch(body, /\.replace\('\{key\}', entry\.key\)/,
        'a template token filled with the storage key is a camelCase string on screen');
    assert.doesNotMatch(body, /formatSettingWriteError\(entry\.(key|labelKey)/);
});

test('the raw key is still available where power users expect it', () => {
    // Removing it would trade one usability problem for another: support
    // tickets need the storage key.
    const body = rowBuilder();
    assert.match(body, /label\.title = overrideDesc\s*\?\s*`\$\{entry\.key\}: \$\{overrideDesc\}`\s*:\s*entry\.key;/,
        'the row tooltip must still expose the storage key');
    assert.match(body, /row\.dataset\.key = entry\.key;/,
        'and the row must still be addressable by key');
});
