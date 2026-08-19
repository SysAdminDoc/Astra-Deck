'use strict';

// Two places where the display disagreed with reality.
//
// The remaining-time readout appended a fresh span on every navigation while
// the old one stayed in the player, frozen at the previous video's number.
// `.ytp-time-display` survives SPA navigation; only Astra's reference to the
// span was being dropped.
//
// The popup's enum <select> had no option for a value stored before that key
// gained an enum, so the browser selected the first option and the popup
// claimed a value that was not in storage - while the out-of-enum value went
// on driving the runtime.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const ytkit = fs.readFileSync(path.join(repoRoot, 'extension/ytkit.js'), 'utf8');
const userscript = fs.readFileSync(path.join(repoRoot, 'YTKit.user.js'), 'utf8');
const popup = fs.readFileSync(path.join(repoRoot, 'extension/popup.js'), 'utf8');

function stripComments(text) {
    return text.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
}

function remainingTimeUpdate(source) {
    // Anchored on the OUTER guard by its full text: `if (!this._el` also
    // matches the inner create guard, and a lastIndexOf from the className
    // line lands on that one - after the adopt call the test is checking for.
    const start = source.indexOf('if (!this._el || !this._el.isConnected) {');
    assert.ok(start > 0, 'the remaining-time build guard must exist');
    const end = source.indexOf("this._el.className = 'ytkit-remaining-time';", start);
    assert.ok(end > start, 'the slice must reach the span it builds');
    return stripComments(source.slice(start, end + 200));
}

for (const [label, source] of [['ytkit.js', ytkit], ['YTKit.user.js', userscript]]) {
    test(`${label}: the remaining-time readout adopts the span already in the player`, () => {
        const body = remainingTimeUpdate(source);
        assert.match(body, /timeDisplay\.querySelector\('\.ytkit-remaining-time'\)/,
            'appending without looking leaves one dead readout per navigation');
        assert.match(body, /if \(!this\._el \|\| !this\._el\.isConnected\)/,
            'a reference to a detached span must not block re-adoption either');
        // The create path must be reachable only after the adopt attempt.
        const adoptAt = body.indexOf("timeDisplay.querySelector('.ytkit-remaining-time')");
        const createAt = body.indexOf("document.createElement('span')");
        assert.ok(adoptAt > 0 && createAt > adoptAt, 'adopt first, then create');
    });

    test(`${label}: teardown sweeps every readout, not just the tracked one`, () => {
        const at = source.indexOf("removeNavigateRule('remainTime');");
        assert.ok(at > 0);
        const body = stripComments(source.slice(at, at + 400));
        assert.match(body, /querySelectorAll\('\.ytkit-remaining-time'\)[\s\S]{0,80}remove\(\)/,
            'a build before this fix could have left strays behind');
    });
}

// ── popup enum select ───────────────────────────────────────────────────────

function enumBranch() {
    const at = popup.indexOf("const recognized = entry.enum.some");
    assert.ok(at > 0, 'the enum select branch must exist');
    return stripComments(popup.slice(at - 200, at + 1200));
}

test('an out-of-enum stored value is shown as unrecognized instead of silently becoming option one', () => {
    const body = enumBranch();
    assert.match(body, /const recognized = entry\.enum\.some\(\(value\) => value === effective\);/);
    assert.match(body, /legacy\.disabled = true;/,
        'the legacy value is what IS stored, but it must not be re-selectable');
    assert.match(body, /legacy\.selected = true;/);
    assert.match(body, /t\('settingValueUnrecognized'/,
        'the label has to be localizable like the rest of the popup');
});

test('a recognized value still selects its own option, and only its own', () => {
    const body = enumBranch();
    assert.match(body, /option\.selected = recognized && value === effective;/,
        'without the recognized guard the placeholder and a real option both claim selected');
});

test('the unrecognized label is a real locale key', () => {
    const messages = JSON.parse(
        fs.readFileSync(path.join(repoRoot, 'extension/_locales/en/messages.json'), 'utf8'));
    assert.ok(messages.settingValueUnrecognized, 'EN must define the key');
    assert.match(messages.settingValueUnrecognized.message, /\{value\}/,
        'the substitution token must survive into the message, or every locale prints a bare label');
    // NOT $VALUE$. Chrome refuses to load an extension whose message carries a
    // $NAME$ placeholder with no matching `placeholders` entry, and this key
    // shipped that way for exactly one commit - long enough for the live smoke
    // to catch it and for check-i18n.js to grow a gate for it.
    assert.doesNotMatch(messages.settingValueUnrecognized.message, /\$[A-Za-z0-9_]+\$/);
});
