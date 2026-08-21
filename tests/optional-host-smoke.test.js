const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

const repoRoot = path.join(__dirname, '..');
const pkg = require('../package.json');
const smoke = require('../scripts/smoke-chromium-optional-hosts.js');
const { runtimeModules } = require('./helpers/source');

const smokeSource = fs.readFileSync(
    path.join(repoRoot, 'scripts', 'smoke-chromium-optional-hosts.js'),
    'utf8'
);

test('optional-host Chromium smoke is exposed and exact-pins its CDP WebSocket dependency', () => {
    assert.equal(
        pkg.scripts['smoke:optional-hosts'],
        'node scripts/smoke-chromium-optional-hosts.js'
    );
    // Exact, not a range: the CDP client is the one dependency whose bugs
    // show up as a smoke that hangs rather than one that fails. The version
    // moves deliberately, which is what this pin is for.
    assert.equal(pkg.devDependencies.ws, '8.21.3');
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

test('optional-host Chromium smoke gates dynamic assets and runtime modules separately', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(repoRoot, 'extension', 'manifest.json'),
        'utf8'
    ));
    assert.deepEqual(smoke.PAGE_ACCESSIBLE_RESOURCES, [
        'icons/32.png',
        'assets/cat.gif',
        'runtime-core-loader.mjs',
        ...runtimeModules(manifest.content_scripts.find((entry) =>
            runtimeModules(entry).includes('ytkit.js')
        ))
    ]);
    assert.deepEqual(smoke.DYNAMIC_PAGE_RESOURCES, ['icons/32.png', 'assets/cat.gif']);
    assert.deepEqual(smoke.DYNAMIC_RUNTIME_RESOURCES, [
        'runtime-core-loader.mjs',
        ...runtimeModules(manifest.content_scripts.find((entry) =>
            runtimeModules(entry).includes('ytkit.js')
        ))
    ]);
    assert.doesNotThrow(() => smoke.validateDynamicWebAccessibleResourceManifest(manifest));
    assert.match(smokeSource, /chrome\.runtime\.getURL\(resource\)/,
        'package smoke must resolve page assets through the runtime API');
    assert.match(smokeSource, /await fetch\(url\)/,
        'package smoke must load each declared page asset from the packaged extension');

    const broadManifest = structuredClone(manifest);
    broadManifest.web_accessible_resources[0].resources = ['assets/*', 'icons/32.png'];
    assert.throws(
        () => smoke.validateDynamicWebAccessibleResourceManifest(broadManifest),
        /exceed the generated consumer inventory/
    );

    const stableManifest = structuredClone(manifest);
    delete stableManifest.web_accessible_resources[0].use_dynamic_url;
    assert.throws(
        () => smoke.validateDynamicWebAccessibleResourceManifest(stableManifest),
        /Every Chromium web-accessible resource entry must use a per-session dynamic URL/
    );

    const dynamicRuntimeManifest = structuredClone(manifest);
    dynamicRuntimeManifest.web_accessible_resources[1].use_dynamic_url = false;
    assert.throws(
        () => smoke.validateDynamicWebAccessibleResourceManifest(dynamicRuntimeManifest),
        /Every Chromium web-accessible resource entry must use a per-session dynamic URL/
    );
});

test('optional-host Chromium smoke validates dynamic asset and runtime module hosts', () => {
    const results = smoke.PAGE_ACCESSIBLE_RESOURCES.map((resource) => ({
        resource,
        url: `chrome-extension://dynamic-session-id/${resource}`,
        ok: true,
        status: 200,
        bytes: 16,
        contentType: 'application/octet-stream',
        error: '',
    }));
    assert.deepEqual(
        smoke.validateDynamicWebAccessibleResourceResults(results, 'stable-extension-id'),
        { dynamicHost: 'dynamic-session-id', runtimeHost: 'dynamic-session-id' }
    );

    const stableResults = structuredClone(results);
    stableResults[0].url = 'chrome-extension://stable-extension-id/icons/32.png';
    assert.throws(
        () => smoke.validateDynamicWebAccessibleResourceResults(
            stableResults,
            'stable-extension-id'
        ),
        /per-session dynamic host/
    );

    const stableRuntimeResults = structuredClone(results);
    const loaderIndex = stableRuntimeResults.findIndex((entry) =>
        entry.resource === 'runtime-core-loader.mjs');
    stableRuntimeResults[loaderIndex].url =
        'chrome-extension://stable-extension-id/runtime-core-loader.mjs';
    assert.throws(
        () => smoke.validateDynamicWebAccessibleResourceResults(
            stableRuntimeResults,
            'stable-extension-id'
        ),
        /per-session dynamic host/
    );

    const emptyResults = structuredClone(results);
    emptyResults[1].bytes = 0;
    assert.throws(
        () => smoke.validateDynamicWebAccessibleResourceResults(
            emptyResults,
            'stable-extension-id'
        ),
        /did not load/
    );
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
    assert.match(smokeSource, /await chrome\.action\.openPopup\(\)/,
        'smoke must open popup.html through the real toolbar action API');
    assert.doesNotMatch(smokeSource, /\/json\/new\?\$\{popupUrl\}/,
        'smoke must not bypass the toolbar action by navigating to popup.html directly');
    assert.match(smokeSource, /ACTION_POPUP_HEADLESS_UNAVAILABLE/,
        'headless Chromium action gaps should fail with an explicit capability code');
    assert.doesNotMatch(smokeSource, /headedFallback/,
        'the smoke must never launch a headed-browser fallback implicitly');
    assert.doesNotMatch(smokeSource, /\{ \.\.\.opts, headed: true \}/,
        'the smoke must never mutate default options into headed mode');
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

test('optional-host Chromium smoke keeps headed verification explicit and reproducible', () => {
    const defaults = smoke.parseArgs([]);
    const headlessArgs = smoke.chromiumArgs('profile', 'stage', defaults, 9222);
    const headedArgs = smoke.chromiumArgs(
        'profile',
        'stage',
        smoke.parseArgs(['--headed']),
        9222
    );
    assert.ok(headlessArgs.includes('--headless=new'));
    assert.ok(!headedArgs.includes('--headless=new'));

    const command = smoke.buildIsolatedHeadedCommand({
        ...defaults,
        attemptGrant: true,
        grantTimeoutMs: 9000,
        revokeAfterGrant: true,
        timeoutMs: 15000,
    }, 'C:\\Program Files\\Browser\\browser.exe');
    assert.equal(
        command,
        'npm run smoke:optional-hosts -- --headed --browser "C:\\\\Program Files\\\\Browser\\\\browser.exe" --attempt-grant --revoke-after-grant --grant-timeout-ms 9000 --timeout-ms 15000'
    );
    assert.match(smokeSource, /Headless smoke stopped without opening a visible browser/);
    assert.match(smokeSource, /dedicated isolated desktop/);
});

test('optional-host Chromium smoke bounds stalled DevTools HTTP requests', async () => {
    const server = http.createServer(() => {
        // Intentionally hold the response open to simulate a wedged DevTools endpoint.
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;

    try {
        await assert.rejects(
            () => smoke.fetchJsonFromDevTools(port, '/json/version', {}, 25),
            /Timed out waiting for Chromium DevTools response/
        );
    } finally {
        server.close();
    }
});

test('Chromium shutdown asks the browser to close before removing its profile', async () => {
    const proc = new EventEmitter();
    proc.exitCode = null;
    const calls = [];
    const client = {
        async send(method) {
            calls.push(method);
            proc.exitCode = 0;
            proc.emit('exit', 0);
        },
    };

    await smoke.shutdownChromiumProcess(proc, client, 25);

    assert.deepEqual(calls, ['Browser.close']);
    assert.equal(proc.exitCode, 0);
});

test('Chromium shutdown terminates the Windows tree before the parent PID disappears', async () => {
    const proc = new EventEmitter();
    proc.exitCode = null;
    const calls = [];
    await smoke.shutdownChromiumProcess(proc, {
        async send(method) { calls.push(method); }
    }, 25, {
        platform: 'win32',
        sleep: async () => {},
        killProcessTree(target) {
            calls.push('kill-tree');
            target.exitCode = 1;
            target.emit('exit', 1);
        }
    });
    assert.deepEqual(calls, ['Browser.close', 'kill-tree']);
    assert.equal(proc.exitCode, 1);
});

test('Chromium shutdown fails when bounded tree termination leaves the process alive', async () => {
    const proc = new EventEmitter();
    proc.pid = 424242;
    proc.exitCode = null;
    proc.signalCode = null;
    let kills = 0;

    await assert.rejects(
        () => smoke.shutdownChromiumProcess(proc, { send: async () => undefined }, 1, {
            platform: 'win32',
            sleep: async () => undefined,
            isProcessAlive: () => true,
            killProcessTree() { kills += 1; }
        }),
        /Chromium process 424242 did not exit after bounded shutdown/
    );
    assert.equal(kills, 2, 'shutdown must attempt the tree before and after the graceful wait');
});

test('Chromium shutdown accepts an OS-confirmed exit when ChildProcess metadata lags', async () => {
    const proc = new EventEmitter();
    proc.pid = 424243;
    proc.exitCode = null;
    proc.signalCode = null;
    let alive = true;
    let kills = 0;

    await smoke.shutdownChromiumProcess(proc, { send: async () => undefined }, 1, {
        platform: 'win32',
        sleep: async () => undefined,
        isProcessAlive: () => alive,
        killProcessTree() {
            kills += 1;
            alive = false;
            return true;
        }
    });

    assert.equal(kills, 1);
    assert.equal(proc.exitCode, null, 'the OS probe must cover delayed ChildProcess bookkeeping');
});

test('Chromium cleanup removes a disposable profile tree', async () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-cleanup-contract-'));
    fs.mkdirSync(path.join(profile, 'Default', 'Cache'), { recursive: true });
    fs.writeFileSync(path.join(profile, 'Default', 'Cache', 'entry'), 'fixture');

    assert.equal(await smoke.removeDirWithRetries(profile), true);
    assert.equal(fs.existsSync(profile), false);
});

test('Chromium cleanup refuses paths outside its named temporary roots', async () => {
    await assert.rejects(
        () => smoke.removeDirWithRetries(path.join(repoRoot, 'astra-cleanup-bait')),
        /Refusing non-disposable cleanup target/
    );
});

test('Chromium cleanup failure is fatal after its bounded fallback', async () => {
    const target = path.join(os.tmpdir(), 'astra-cleanup-contract-bait');
    await assert.rejects(
        () => smoke.removeDirWithRetries(target, {
            rmSync() {
                const error = new Error('baited EPERM');
                error.code = 'EPERM';
                throw error;
            },
            spawnSync: () => ({ status: 1, stderr: 'baited fallback failure' }),
            existsSync: () => true,
            sleep: async () => {},
            platform: 'win32',
            maxAttempts: 2,
        }),
        /Could not remove disposable browser directory.*baited fallback failure/
    );
});

test('Chromium cleanup passes the validated target to PowerShell through a dedicated environment value', async () => {
    const target = path.join(os.tmpdir(), 'astra-cleanup-contract-fallback');
    let receivedTarget = '';
    const result = await smoke.removeDirWithRetries(target, {
        rmSync() { throw new Error('baited lock'); },
        spawnSync(_command, _args, options) {
            receivedTarget = options.env.ASTRA_DECK_DISPOSABLE_CLEANUP_TARGET;
            return { status: 0, stderr: '' };
        },
        existsSync: () => false,
        sleep: async () => {},
        platform: 'win32',
        maxAttempts: 1,
    });
    assert.equal(result, true);
    assert.equal(receivedTarget, path.resolve(target));
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
