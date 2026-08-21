'use strict';

// The user-initiated feature report.
//
// The project takes no telemetry, so the only honest answer to "which of 291
// features do people actually turn on" is a report the user produces and
// chooses where to paste. That only works if it is safe to paste in public,
// and the whole safety property is one rule: setting NAMES go in, setting
// VALUES never do. A URL, a channel name, a note, a bookmark, or a provider
// key riding along would turn a helpful paste into a disclosure.
//
// So the central test populates every one of those with a distinctive sentinel
// and asserts none of them reaches the string.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const popupSource = fs.readFileSync(path.join(REPO_ROOT, 'extension', 'popup.js'), 'utf8');
const schema = require('../extension/core/settings-schema.js');

// popup.js is not a module. Slice the two functions under test out of it and
// evaluate them against injected dependencies, the same way the rest of the
// popup suite exercises its helpers.
function loadReportHelpers() {
    const start = popupSource.indexOf('function describeBrowserForReport(');
    const end = popupSource.indexOf('async function copyEnabledFeatureReport(');
    assert.ok(start > -1 && end > start,
        'popup.js must declare describeBrowserForReport … buildEnabledFeatureReport');
    const block = popupSource.slice(start, end);
    return new Function(
        'window', 'popupState', 'getVisibleSchemaChanges', 't',
        `${block}\nreturn { describeBrowserForReport, buildEnabledFeatureReport };`
    )(
        { __YTKIT_SETTINGS_SCHEMA__: schema },
        { settings: {} },
        (scope, settings) => scope.getChangedSettings(settings),
        (_key, fallback) => fallback
    );
}

const helpers = loadReportHelpers();

// Every schema key whose value could carry something personal, with a sentinel
// that cannot occur by accident.
const SENSITIVE_FIXTURE = {
    hideVideosFilterListUrl: 'https://SENTINEL-filter-list.example/rules.txt',
    downloadCobaltInstance: 'https://SENTINEL-cobalt.example',
    alternativeFrontendInstance: 'https://SENTINEL-frontend.example',
    hideVideosKeywordFilter: 'SENTINEL-keyword',
    chatKeywordFilter: 'SENTINEL-chat-keyword',
    videoNotesData: { SENTINELvideoid: 'SENTINEL-private-note' },
    subscriptionGroupData: { groups: [{ name: 'SENTINEL-group', channels: ['SENTINEL-Channel-Name'] }] },
    deArrowChannelOverrides: { SENTINELchannel: false },
    perChannelIntroOutroData: { SENTINELchannel: { intro: 12 } }
};

function reportWithSettings(extra = {}) {
    const settings = { ...schema.buildDefaultsFromSchema(), ...extra };
    return helpers.buildEnabledFeatureReport({
        scope: schema,
        settings,
        version: '4.83.0',
        profile: 'github-full',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
    });
}

test('no setting value reaches the report, even with every sensitive field populated', () => {
    // Only keys the schema actually ships; a fixture that drifted out of the
    // schema would silently test nothing.
    const known = new Set(schema.SETTINGS_SCHEMA.map((entry) => entry.key));
    const applicable = Object.fromEntries(
        Object.entries(SENSITIVE_FIXTURE).filter(([key]) => known.has(key))
    );
    assert.ok(Object.keys(applicable).length >= 4,
        'the sensitive fixture must still name settings this schema ships');

    const report = reportWithSettings(applicable);

    assert.equal(report.includes('SENTINEL'), false,
        'no populated setting value may appear in the report');
    assert.equal(/https?:\/\//.test(report), false,
        'no URL may appear in the report');
    // The keys themselves are the point of the report and must be there.
    for (const key of Object.keys(applicable)) {
        assert.ok(report.includes(key), `${key} must be listed by name`);
    }
});

test('the report lists exactly the keys that differ from their defaults', () => {
    const report = reportWithSettings({ diagnosticLog: true, redditComments: true });
    const listed = report.split('\n')
        .filter((line) => line.startsWith('  '))
        .map((line) => line.trim())
        .filter((line) => line && !line.includes(' '));
    assert.deepEqual(listed.sort(), ['diagnosticLog', 'redditComments']);
    assert.match(report, /Settings changed from their defaults \(2\)/);
});

test('an untouched install reports nothing changed rather than an empty block', () => {
    const report = reportWithSettings();
    assert.match(report, /Settings changed from their defaults \(0\)/);
    assert.match(report, /\n {2}none\n/);
});

test('the report names the Astra version, the browser, and the profile', () => {
    const report = reportWithSettings({ diagnosticLog: true });
    assert.match(report, /^Astra Deck 4\.83\.0$/m);
    assert.match(report, /^Chrome 129$/m);
    assert.match(report, /^Profile: github-full$/m);
});

test('the report says plainly that nothing was sent anywhere', () => {
    const report = reportWithSettings();
    assert.match(report, /Nothing was sent anywhere/);
    assert.match(report, /you decide whether to paste it/);
});

test('the browser label keeps the engine and major version and drops the rest', () => {
    const { describeBrowserForReport } = helpers;
    assert.equal(describeBrowserForReport(
        'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0'), 'Firefox 142');
    // Edge, Opera, and Brave all carry "Chrome/", so the specific engine has
    // to win over the one it impersonates.
    assert.equal(describeBrowserForReport(
        'Mozilla/5.0 ... Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0'), 'Edge 129');
    assert.equal(describeBrowserForReport(
        'Mozilla/5.0 ... Chrome/128.0.0.0 Safari/537.36 OPR/114.0.0.0'), 'Opera 114');
    assert.equal(describeBrowserForReport(
        'Mozilla/5.0 ... Chrome/129.0.0.0 Safari/537.36'), 'Chrome 129');
    assert.equal(describeBrowserForReport('something unrecognisable'), 'unknown browser');
    // The full UA is a fingerprinting surface; none of its other tokens survive.
    assert.equal(describeBrowserForReport(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0.0.0'),
    'Chrome 129');
});

test('the popup offers the report next to the changed-settings copy', () => {
    const html = fs.readFileSync(path.join(REPO_ROOT, 'extension', 'popup.html'), 'utf8');
    assert.match(html, /id="feature-report-copy"/);
    assert.match(popupSource, /featureReportCopy\.addEventListener\('click'/);
});

test('the four clipboard surfaces share one fallback instead of four copies', () => {
    // Each had grown its own twenty-line hidden-textarea route, differing only
    // in which status string it showed. A fifth copy is how they drift.
    const occurrences = popupSource.split("execCommand('copy')").length - 1;
    assert.equal(occurrences, 1,
        'document.execCommand("copy") must appear once, inside copyTextToClipboard');
});
