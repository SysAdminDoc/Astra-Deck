'use strict';

// The Firefox smoke used to subscribe to log.entryAdded and never read it, and
// that event doesn't carry content-script console calls anyway. It now has
// Firefox print content-process console output to stdout, keeps the [YTKit]
// lines, and fails the first YouTube load on a module failure.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { findExtensionConsoleFailures } = require('../scripts/smoke-firefox-webext');

const smokeSource = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'smoke-firefox-webext.js'), 'utf8');
const driverSource = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'firefox-webdriver.js'), 'utf8');

test('a module failure in the content script console or a page log entry fails the load', () => {
    const stdout = [
        'console.error: "[YTKit] Runtime module load failed: features/dearrow/index.js - no error value was thrown"',
        'console.warn: "[YTKit] testOnly(\\"x\\") only supports live toggle features."',
        'console.error: "[astra-smoke] console capture probe"'
    ];
    const events = [
        { method: 'log.entryAdded', params: { text: '[YTKit] feature module failed to load: features/sponsorblock/index.js - x' } },
        { method: 'log.entryAdded', params: { text: 'YouTube said something' } },
        { method: 'network.fetchError', params: { text: '[YTKit] Runtime module load failed' } }
    ];
    assert.deepEqual(findExtensionConsoleFailures(stdout, events), [
        stdout[0],
        '[YTKit] feature module failed to load: features/sponsorblock/index.js - x'
    ]);
    assert.deepEqual(findExtensionConsoleFailures(['console.log: "[YTKit] Debug enabled"'], []), []);
    assert.deepEqual(findExtensionConsoleFailures(), []);
});

test('the smoke turns on stdout console capture and checks it on the first load', () => {
    assert.match(smokeSource, /'devtools\.console\.stdout\.content': true/);
    assert.match(smokeSource, /captureLine: CONSOLE_CAPTURE_LINE/);
    const firstLoad = smokeSource.indexOf("label: 'YouTube shell, Astra runtime, and enabled Firefox ruleset'");
    const check = smokeSource.indexOf('await assertExtensionConsoleClean(session, context)');
    const nextNavigate = smokeSource.indexOf('injectDeterministicAdShell(\n', firstLoad);
    assert.ok(firstLoad > -1 && check > firstLoad && (nextNavigate === -1 || check < nextNavigate),
        'the check runs right after the first YouTube load');
    assert.match(smokeSource, /heard nothing/, 'a capture that hears nothing fails instead of passing quietly');
    assert.match(driverSource, /capturedLines: \(\) => captured\.slice\(\)/);
});
