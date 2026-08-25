'use strict';

// Three parsing defects that all share a shape: the happy path was covered by
// a test, and the input that never occurs in en-US was not.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');

function loadInContext(files, extras = {}) {
    const context = { globalThis: null, console, ...extras };
    context.globalThis = context;
    vm.createContext(context);
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(repoRoot, 'extension', 'core', file), 'utf8'),
            context, { filename: 'extension/core/' + file });
    }
    return context.globalThis.YTKitCore;
}

test('the digital clock pads minutes once an hours field is in front', () => {
    // Intl.DurationFormat landed in Chrome 129 and the manifest floor is 120,
    // so Chrome 120 to 128 takes the fallback. It rendered "1:2:03".
    const core = loadInContext(['date-time.js'], { Intl: { DateTimeFormat: Intl.DateTimeFormat } });
    const format = (seconds) => core.formatDuration(seconds, { style: 'digital' });
    assert.equal(format(3723), '1:02:03');
    assert.equal(format(3663), '1:01:03');
    assert.equal(format(3600), '1:00:00');
    assert.equal(format(36000), '10:00:00');
    // Leading minutes stay unpadded, the way YouTube renders its own durations.
    assert.equal(format(62), '1:02');
    assert.equal(format(7), '0:07');
    assert.equal(format(0), '0:00');
});

test('the platform path and the fallback path agree', () => {
    const withIntl = loadInContext(['date-time.js']);
    const withoutIntl = loadInContext(['date-time.js'], { Intl: { DateTimeFormat: Intl.DateTimeFormat } });
    for (const seconds of [0, 7, 62, 599, 3600, 3663, 3723, 36000, 86399]) {
        assert.equal(
            withoutIntl.formatDuration(seconds, { style: 'digital' }),
            withIntl.formatDuration(seconds, { style: 'digital' }),
            `the two paths must agree at ${seconds}s`
        );
    }
});

test('normalizeDigits is shared, not re-derived', () => {
    const core = loadInContext(['text-metrics.js']);
    assert.equal(typeof core.normalizeDigits, 'function',
        'the transcript scraper needs the same digit table as the count parser');
    assert.equal(core.normalizeDigits('١:٠٢:٠٣'), '1:02:03');
    assert.equal(core.normalizeDigits('０:０７'), '0:07');
    assert.equal(core.normalizeDigits('๑๒'), '12');
    assert.equal(core.normalizeDigits('1:02:03'), '1:02:03', 'ASCII passes through untouched');
});

test('a transcript timestamp survives localized numerals and refuses a broken one', () => {
    // The scraper is a method on a service object built inside the module, so
    // exercise the parse the same way the source writes it.
    const source = fs.readFileSync(
        path.join(repoRoot, 'extension', 'core', 'transcript-service.js'), 'utf8'
    );
    assert.ok(source.includes('globalThis.YTKitCore?.normalizeDigits'),
        'the DOM-panel scraper must normalize the rendered digits');
    assert.ok(source.includes('parts.every(Number.isFinite)'),
        'an unreadable component must not shorten the array and shift the fields');
    assert.ok(!source.includes(".split(':').map(Number).filter(Number.isFinite)"),
        'the length-changing filter is the bug and must not come back');

    // The behaviour the two lines above encode, run directly.
    const core = loadInContext(['text-metrics.js']);
    const parse = (stamp) => {
        const digits = core.normalizeDigits(stamp);
        const parts = digits.split(':').map((part) => Number(part.trim()));
        if (!parts.every(Number.isFinite)) return 0;
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        return 0;
    };
    assert.equal(parse('1:02:03'), 3723);
    assert.equal(parse('١:٠٢:٠٣'), 3723, 'Arabic-Indic numerals must parse, not collapse to zero');
    assert.equal(parse('٠:٠٧'), 7);
    assert.equal(parse('０:０７'), 7, 'fullwidth numerals too');
    // A stamp with an unreadable hour must not be reinterpreted as mm:ss.
    assert.equal(parse('x:02:03'), 0, 'a broken component yields 0, never a shifted reading');
});

test('sanitizeTranscriptProvenance survives an explicit null', () => {
    // A default parameter only fires on `undefined`. Callers pass
    // `row.provenance`, which is null when the property exists and holds null.
    const core = loadInContext(['transcript-service.js']);
    for (const value of [null, undefined, 'nope', 42, false, []]) {
        const clean = core.sanitizeTranscriptProvenance(value);
        assert.equal(typeof clean, 'object', `${JSON.stringify(value)} must not throw`);
        assert.equal(clean.source, 'none');
    }
    const real = core.sanitizeTranscriptProvenance({ source: 'dom-panel' });
    assert.equal(real.source, 'dom-panel', 'a genuine provenance still passes through');
});
