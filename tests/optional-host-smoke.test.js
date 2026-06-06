const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const pkg = require('../package.json');
const smoke = require('../scripts/smoke-chromium-optional-hosts.js');

const smokeSource = fs.readFileSync(
    path.join(repoRoot, 'scripts', 'smoke-chromium-optional-hosts.js'),
    'utf8'
);

test('optional-host Chromium smoke is exposed and exact-pins its CDP WebSocket dependency', () => {
    assert.equal(
        pkg.scripts['smoke:optional-hosts'],
        'node scripts/smoke-chromium-optional-hosts.js'
    );
    assert.equal(pkg.devDependencies.ws, '8.21.0');
});

test('optional-host Chromium smoke stages the store-safe manifest and falls back from Chrome policy blocks', () => {
    assert.match(smokeSource, /patchManifestForBuildProfile\(manifest,\s*'store-safe'\)/,
        'smoke must stage the CWS-bound store-safe profile');
    assert.match(smokeSource, /\/background\\.js\$/,
        'smoke must identify Astra Deck by the staged background.js service worker');
    assert.match(smokeSource, /--load-extension is not allowed in Google Chrome, ignoring/i,
        'smoke must detect managed Chrome policies that reject unpacked extensions');
    assert.match(smokeSource, /Microsoft Edge/,
        'smoke must include Edge as a Chromium-family fallback when Chrome is policy-blocked');
});

test('optional-host Chromium smoke seeds enabled optional features and verifies the pre-grant popup state', () => {
    for (const key of [
        'sponsorBlock',
        'returnDislike',
        'redditComments',
        'thumbnailQualityUpgrade',
        'downloadThumbnail',
        'privacyDataFlowPanel',
    ]) {
        assert.equal(smoke.POPUP_BOOT_SETTINGS[key], true, `${key} must be enabled for popup smoke`);
    }

    assert.match(smokeSource, /chrome-extension:\/\/\$\{extensionId\}\/popup\.html/,
        'smoke must open the real extension popup page');
    assert.match(smokeSource, /chrome\.permissions\.getAll/,
        'smoke must inspect current runtime host grants before the prompt');
    assert.match(smokeSource, /optional-host-banner/,
        'smoke must assert the Grant access banner is visible before grant');
    assert.match(smokeSource, /toggle-risk-permission,.so-key-permission-missing/,
        'smoke must assert missing-grant badges are rendered');
    assert.match(smokeSource, /grant not attempted; use --headed --attempt-grant/,
        'headless default must not claim native prompt acceptance');
});

test('optional-host Chromium smoke exposes headed denial and revoke modes', () => {
    assert.equal(smoke.parseArgs(['--headed', '--expect-deny']).expectDeny, true);
    assert.deepEqual(smoke.parseArgs(['--headed', '--attempt-grant', '--revoke-after-grant']), {
        attemptGrant: true,
        browser: '',
        expectDeny: false,
        grantTimeoutMs: 5000,
        headed: true,
        keepStage: false,
        revokeAfterGrant: true,
        stageRoot: '',
        timeoutMs: 12000,
    });
    assert.throws(() => smoke.parseArgs(['--expect-deny', '--attempt-grant']),
        /cannot be combined/);
    assert.throws(() => smoke.parseArgs(['--revoke-after-grant']),
        /requires --attempt-grant/);
    assert.match(smokeSource, /chrome\.permissions\.remove/,
        'smoke must be able to revoke accepted optional-host grants');
    assert.match(smokeSource, /optional host denial confirmed/,
        'smoke must report the denied prompt state explicitly');
    assert.match(smokeSource, /optional host revoke completed/,
        'smoke must report the post-revoke prompt state explicitly');
});

test('optional-host smoke helper validates missing values and prompt readiness', () => {
    assert.deepEqual(smoke.missingValues(['a', 'b'], ['b']), ['a']);
    assert.doesNotThrow(() => smoke.validatePromptReady({
        href: 'chrome-extension://abc/popup.html',
        hasPermissions: true,
        hasStorage: true,
        optional: ['https://one.example/*'],
        currentOrigins: [],
        bannerHidden: false,
        buttonDisabled: false,
        bannerText: '1 enabled enrichment feature needs host access: https://one.example/*.',
        missingBadges: 1,
    }, ['https://one.example/*'], 'chrome-extension://abc/popup.html'));
    assert.throws(() => smoke.validatePromptReady({
        href: 'chrome-extension://abc/popup.html',
        hasPermissions: true,
        hasStorage: true,
        optional: ['https://one.example/*'],
        currentOrigins: ['https://one.example/*'],
        bannerHidden: false,
        buttonDisabled: false,
        bannerText: 'https://one.example/*',
        missingBadges: 1,
    }, ['https://one.example/*'], 'chrome-extension://abc/popup.html'), /Fresh profile already granted/);
});

test('optional-host smoke helper validates grant, denial, and revocation states', () => {
    const expected = ['https://one.example/*', 'https://two.example/*'];

    assert.doesNotThrow(() => smoke.validateGrantCompleted({
        currentOrigins: expected,
        bannerHidden: true,
        buttonBusy: '',
        buttonDisabled: false,
    }, expected));
    assert.throws(() => smoke.validateGrantCompleted({
        currentOrigins: ['https://one.example/*'],
        bannerHidden: true,
        buttonBusy: '',
        buttonDisabled: false,
    }, expected), /Still missing/);

    assert.doesNotThrow(() => smoke.validateGrantDenied({
        currentOrigins: [],
        bannerHidden: false,
        buttonBusy: '',
        buttonDisabled: false,
        status: 'Astra Deck needs host access for this optional feature before it can be enabled.',
    }, expected));
    assert.throws(() => smoke.validateGrantDenied({
        currentOrigins: expected,
        bannerHidden: false,
        buttonBusy: '',
        buttonDisabled: false,
        status: 'Astra Deck needs host access for this optional feature before it can be enabled.',
    }, expected), /denial was expected/);

    assert.doesNotThrow(() => smoke.validateRevokedState({
        currentOrigins: [],
        bannerHidden: false,
        buttonBusy: '',
        buttonDisabled: false,
        missingBadges: 2,
    }, expected));
    assert.throws(() => smoke.validateRevokedState({
        currentOrigins: ['https://one.example/*'],
        bannerHidden: false,
        buttonBusy: '',
        buttonDisabled: false,
        missingBadges: 1,
    }, expected), /left origins granted/);
});
