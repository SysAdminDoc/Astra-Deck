'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

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
    firefoxWatchLinkNodeExpression,
    firefoxWatchLinkExpression,
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

test('Firefox watch navigation activates the visible title link instead of a player overlay', () => {
    const clicks = [];
    const makeLink = ({ href, text, title = false, owner = '' }) => ({
        href,
        textContent: text,
        click: () => clicks.push(text || owner),
        closest: () => owner || null,
        getBoundingClientRect: () => ({ width: 320, height: 180 }),
        matches: () => title
    });
    const playerOverlay = makeLink({
        href: 'https://www.youtube.com/watch?v=overlay',
        text: '',
        owner: 'ytd-player'
    });
    const thumbnail = makeLink({
        href: 'https://www.youtube.com/watch?v=thumbnail',
        text: ''
    });
    const title = makeLink({
        href: 'https://www.youtube.com/watch?v=title',
        text: 'Real search result',
        title: true
    });
    const result = vm.runInNewContext(firefoxWatchLinkExpression({ activate: true }), {
        document: { querySelectorAll: () => [playerOverlay, thumbnail, title] }
    });

    assert.equal(result.clicked, true);
    assert.equal(result.href, title.href);
    assert.deepEqual(clicks, ['Real search result']);
});

test('Firefox smoke exposes the same visible title link for a trusted pointer click', () => {
    const makeLink = ({ href, text, title = false, owner = '' }) => ({
        href,
        textContent: text,
        closest: () => owner || null,
        getBoundingClientRect: () => ({ width: 320, height: 180 }),
        matches: () => title
    });
    const playerOverlay = makeLink({
        href: 'https://www.youtube.com/watch?v=overlay',
        text: '',
        owner: 'ytd-player'
    });
    const title = makeLink({
        href: 'https://www.youtube.com/watch?v=title',
        text: 'Real search result',
        title: true
    });

    const result = vm.runInNewContext(firefoxWatchLinkNodeExpression(), {
        document: { querySelectorAll: () => [playerOverlay, title] }
    });

    assert.equal(result.href, title.href);
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

test('Firefox smoke resettles the home runtime after its blocked-request probe', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'smoke-firefox-webext.js'), 'utf8');
    const probeIndex = source.indexOf('proveMatchingRequestBlocked');
    const settledIndex = source.indexOf("label: 'post-probe Firefox home runtime'");
    const snapshotIndex = source.indexOf("assertPageSnapshot(home, 'home')");

    assert.ok(probeIndex >= 0);
    assert.ok(settledIndex > probeIndex);
    assert.ok(snapshotIndex > settledIndex);
});

test('Firefox probe insertion tolerates a transient BiDi document handoff', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'smoke-firefox-webext.js'), 'utf8');
    const shellBlock = source.slice(
        source.indexOf('async function injectDeterministicAdShell'),
        source.indexOf('async function runAutomatedFirefoxSmoke')
    );
    const requestBlock = source.slice(
        source.indexOf('async function proveMatchingRequestBlocked'),
        source.indexOf('async function injectDeterministicAdShell')
    );

    assert.match(shellBlock, /return waitForJson\(/);
    assert.match(shellBlock, /Firefox deterministic ad-shell probe insertion/);
    assert.match(requestBlock, /await waitForJson\(/);
    assert.match(requestBlock, /Firefox deterministic blocked-request probe insertion/);
});

test('Firefox watch proof follows a new top-level result context when YouTube opens one', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'smoke-firefox-webext.js'), 'utf8');
    assert.match(source, /let watchContext;/);
    assert.match(source, /watchContext = await waitForContext\(/);
    assert.match(source, /new URL\(url\)\.pathname === '\/watch'/);
    assert.match(source, /watchNavigation: context === searchContext \? 'same-context' : 'new-context'/);
});

test('Firefox trusted clicks retry transient pointer handoffs before the DOM fallback', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'firefox-webdriver.js'), 'utf8');
    const clickBlock = source.slice(
        source.indexOf('async function clickElementExpression'),
        source.indexOf('async function waitForContext')
    );
    assert.match(clickBlock, /attempt <= 3/);
    assert.match(clickBlock, /document\.elementFromPoint/);
    assert.match(clickBlock, /method: 'pointer'/);
    assert.match(clickBlock, /method: 'dom-fallback'/);
});

test('Firefox watch proof falls back to trusted Enter activation before giving up', () => {
    const smokeSource = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'smoke-firefox-webext.js'), 'utf8');
    const driverSource = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'firefox-webdriver.js'), 'utf8');
    assert.match(smokeSource, /pressEnterElementExpression\(client, context, watchNodeExpression\)/);
    assert.match(smokeSource, /method: 'keyboard-fallback'/);
    assert.match(driverSource, /async function pressEnterElementExpression/);
    assert.match(driverSource, /type: 'keyDown', value: '\\uE007'/);
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

test('Chromium zero-ad smoke pins its live watch fixture to a comment-capable video', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'smoke-zero-ads-live.js'), 'utf8');
    assert.match(source, /const LIVE_WATCH_FIXTURE_ID = '[A-Za-z0-9_-]{11}';/);
    assert.match(source, /search_query=\$\{LIVE_WATCH_FIXTURE_ID\}/);
    assert.match(source, /a\[href\*="\/watch\?v=\$\{LIVE_WATCH_FIXTURE_ID\}"\]/);
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
    // smoke:light-surfaces joined the chain: it is the only check that reads
    // computed foreground against composited background in a real engine, and
    // the source-level light-theme gate was green while the Digital Wellbeing
    // card rendered at about 1.05:1.
    assert.equal(
        pkg.scripts['release:browser-smokes'],
        'npm run smoke:a11y && npm run smoke:light-surfaces && npm run smoke:theme-controls'
        + ' && npm run smoke:zero-ads:live'
        + ' && npm run smoke:live-chat && npm run smoke:firefox && npm run smoke:userscript-managers'
    );
    assert.match(pkg.scripts['release:prepare'], /npm run release:browser-smokes/);
    assert.match(pkg.scripts['release:prepare:no-crx'], /npm run release:browser-smokes/);
});
