'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    OBSERVED_REQUESTS,
    auditZeroAdRules,
    ruleCoversRequest
} = require('../scripts/check-zero-ad-rules');
const {
    CONTRACT,
    buildIsolatedUserscript,
    parseArgs: parseManagerSmokeArgs,
    readManagerFixtures,
    runManager,
    selectManagers
} = require('../scripts/smoke-userscript-managers');
const {
    ZERO_AD_RULESET_ID,
    assertPageSnapshot,
    networkEventsForToken,
    parseArgs: parseFirefoxSmokeArgs
} = require('../scripts/smoke-firefox-webext');
const { removeTempTree } = require('../scripts/firefox-webdriver');

test('zero-ad static rules cover every request captured during live desktop reconnaissance', () => {
    const { failures, rules } = auditZeroAdRules();
    assert.deepEqual(failures, []);
    for (const request of OBSERVED_REQUESTS) {
        assert.ok(
            rules.some((rule) => ruleCoversRequest(rule, request)),
            `${request.url} must be blocked before the request leaves the browser`
        );
    }
});

test('zero-ad rules stay scoped away from media delivery', () => {
    const { rules } = auditZeroAdRules();
    const watchMediaRequest = {
        url: 'https://rr1---sn.example.googlevideo.com/videoplayback?id=video',
        initiator: 'https://www.youtube.com/watch?v=video',
        resourceType: 'media'
    };
    assert.equal(rules.some((rule) => ruleCoversRequest(rule, watchMediaRequest)), false);
});

test('Firefox live smoke requires enabled ruleset, collapsed shells, and intact desktop workflows', () => {
    assert.equal(ZERO_AD_RULESET_ID, 'astra_zero_ads');
    assert.doesNotThrow(() => assertPageSnapshot({
        rulesetState: 'enabled',
        astraTrigger: true,
        masthead: true,
        search: true,
        player: true,
        video: true,
        shells: [{ selector: '#player-ads', visible: 0, nonCollapsed: 0 }]
    }, 'watch'));
    assert.throws(() => assertPageSnapshot({
        rulesetState: 'unavailable',
        astraTrigger: true,
        masthead: true,
        search: true,
        player: true,
        video: true,
        shells: []
    }, 'watch'), /astra_zero_ads enabled/);
    assert.throws(() => assertPageSnapshot({
        rulesetState: 'enabled',
        astraTrigger: true,
        masthead: true,
        search: true,
        player: true,
        video: true,
        shells: [{ selector: '#player-ads', visible: 1, nonCollapsed: 1 }]
    }, 'watch'), /retained visible or non-collapsed ad space/);
});

test('Firefox network evidence filters by the unique deterministic probe token', () => {
    const events = [
        { method: 'network.beforeRequestSent', params: { request: { url: 'https://example.test/other' } } },
        { method: 'network.beforeRequestSent', params: { request: { url: 'https://doubleclick.net/astra-token.gif' } } },
        { method: 'network.fetchError', params: { request: { url: 'https://doubleclick.net/astra-token.gif' } } }
    ];
    assert.deepEqual(networkEventsForToken(events, 0, 'astra-token'), events.slice(1));
    assert.deepEqual(networkEventsForToken(events, 2, 'astra-token'), events.slice(2));
});

test('real userscript-manager smoke pins both signed managers and keeps its shell-only contract honest', () => {
    const fixtures = readManagerFixtures();
    assert.deepEqual(fixtures.managers.map(({ id }) => id).sort(), ['tampermonkey', 'violentmonkey']);
    assert.ok(fixtures.managers.every(({ downloadUrl }) => downloadUrl.startsWith('https://addons.mozilla.org/')));
    assert.ok(fixtures.managers.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256)));
    assert.equal(CONTRACT, 'document-start-shells-only');

    const isolated = buildIsolatedUserscript(43123);
    assert.match(isolated, /@match\s+http:\/\/127\.0\.0\.1:43123\/\*/);
    assert.match(isolated, /@require\s+http:\/\/127\.0\.0\.1:43123\/YTKit-core\.user\.js/);
    assert.match(isolated, /document-start-shells-only/);
    assert.doesNotMatch(isolated, /@updateURL/);
    assert.doesNotMatch(isolated, /@downloadURL/);
    assert.deepEqual(selectManagers(fixtures, ['tampermonkey']).map(({ id }) => id), ['tampermonkey']);
    assert.throws(() => selectManagers(fixtures, ['unknown']), /Unknown manager/);
});

test('Firefox smoke CLI separates live automation from the headed manual permission harness', () => {
    const live = parseFirefoxSmokeArgs(['--geckodriver', 'C:/tools/geckodriver.exe', '--timeout-ms', '12000']);
    assert.equal(live.geckodriver, 'C:/tools/geckodriver.exe');
    assert.equal(live.timeoutMs, 12000);
    assert.equal(live.manualOptionalHosts, false);
    const manager = parseManagerSmokeArgs(['--manager', 'violentmonkey', '--headed']);
    assert.deepEqual(manager.managers, ['violentmonkey']);
    assert.equal(manager.headed, true);
});

test('Chromium zero-ad smoke skips candidates without the MV3 DNR API', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'smoke-zero-ads-live.js'), 'utf8');
    assert.match(source, /declarativeNetRequest\?\.getEnabledRulesets/);
    assert.match(source, /DNR_UNAVAILABLE/);
    assert.match(source, /LOAD_EXTENSION_BLOCKED.*DNR_UNAVAILABLE/s);
});

test('Firefox WebDriver cleanup retries a locked profile before failing', async () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-firefox-cleanup-'));
    const originalRmSync = fs.rmSync;
    let attempts = 0;
    fs.rmSync = (target, options) => {
        attempts += 1;
        if (attempts < 3) {
            const error = new Error('simulated profile lock');
            error.code = 'EPERM';
            throw error;
        }
        return originalRmSync(target, options);
    };
    try {
        await removeTempTree(profile, 'test profile', { attempts: 4, retryDelayMs: 1 });
        assert.equal(attempts, 3);
        assert.equal(fs.existsSync(profile), false);
    } finally {
        fs.rmSync = originalRmSync;
        if (fs.existsSync(profile)) originalRmSync(profile, { recursive: true, force: true });
    }
});

test('userscript-manager smoke closes its fixture when Firefox startup fails', async () => {
    let fixtureClosed = false;
    await assert.rejects(
        runManager(
            { id: 'tampermonkey', name: 'Tampermonkey' },
            { geckodriver: '', headed: false, timeoutMs: 10000 },
            'C:/Program Files/Mozilla Firefox/firefox.exe',
            'C:/tmp/tampermonkey.xpi',
            {
                startFixtureServer: async () => ({
                    baseUrl: 'http://127.0.0.1:43123',
                    close: async () => { fixtureClosed = true; }
                }),
                startFirefoxSession: async () => { throw new Error('driver unavailable'); }
            }
        ),
        /driver unavailable/
    );
    assert.equal(fixtureClosed, true);
});

test('release preparation gates the Chromium, live-chat, Firefox, and real-manager desktop contracts', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.equal(
        pkg.scripts['release:browser-smokes'],
        'npm run smoke:a11y && npm run smoke:zero-ads:live && npm run smoke:live-chat && npm run smoke:firefox && npm run smoke:userscript-managers'
    );
    assert.match(pkg.scripts['release:prepare'], /npm run release:browser-smokes/);
    assert.match(pkg.scripts['release:prepare:no-crx'], /npm run release:browser-smokes/);
});
