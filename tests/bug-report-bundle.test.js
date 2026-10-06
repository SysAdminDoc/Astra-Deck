'use strict';

// One diagnostics bundle, three ways to get it: the popup's Diagnostics →
// Save, the settings panel's bug button, and the userscript manager menu.
// Userscript installs have no popup (#51), so the last two are their only
// route. All three must redact the same way, which this file proves by
// feeding one fixture holding an API key and a token through each and
// comparing what would be copied or saved.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadDeclarationsFrom, loadUserscriptDeclarations } = require('./helpers/monolith');
const { readUserscriptBuild } = require('./helpers/source');

require('../extension/core/persisted-domains.js');
const { createPolicyProfile } = require('../extension/core/policy-profile.js');

const REPO_ROOT = path.join(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(REPO_ROOT, ...segments), 'utf8');
const popupSource = read('extension', 'popup.js');
const hostSource = read('userscript', 'host.js');
const ytkitSource = read('extension', 'ytkit.js');

const SECRETS = Object.freeze({
    aiSummaryApiKey: 'sk-SENTINEL-api-key-0123456789',
    authToken: 'SENTINEL-auth-token',
    aiSummaryEndpoint: 'https://SENTINEL-endpoint.example/v1?key=SENTINEL-query-key',
    customCssCode: 'body { --SENTINEL-css: 1 }'
});
const FIXTURE_SETTINGS = Object.freeze({
    ...SECRETS,
    hideVideosFromHome: false,
    _errors: [{ ts: 1, msg: 'feature init failed' }]
});
const FIXTURE_FILTER_LIST = Object.freeze({
    sourceUrl: 'https://raw.githubusercontent.com/u/r/main/rules.txt?token=SENTINEL-list-token',
    fetchedAt: 1000,
    rules: { keywords: ['a'] }
});
const LIFECYCLE = [{ ts: 5, event: 'sw-start', inFlightReveals: 0 }];

// The fields redaction decides. Version, user agent and capability probes
// describe the environment each surface runs in and may differ.
function redactedView(bundle) {
    const { astraDeckBugReport, schemaVersion, settings, settingsDiff, errors, filterListSubscription } = bundle;
    return { astraDeckBugReport, schemaVersion, settings, settingsDiff, errors, filterListSubscription };
}

function assertNoSecrets(text, surface) {
    assert.doesNotMatch(text, /SENTINEL/, `${surface} leaked a secret from the fixture`);
}

// popup.js is not a module, and the Save handler is an inline listener, so it
// is lifted out and run against stubs. The download it starts carries the
// bundle in a data: URL.
async function bundleFromPopupSave() {
    const start = popupSource.indexOf('if (healthSaveBtn) {\n    healthSaveBtn.addEventListener(\'click\'');
    const end = popupSource.indexOf('\n}\n', start);
    assert.ok(start > -1 && end > start, 'popup.js must wire the Diagnostics Save button');
    let handler = null;
    let saved = null;
    const policy = createPolicyProfile();
    const stubs = {
        healthSaveBtn: { addEventListener: (_type, fn) => { handler = fn; } },
        storageGet: async () => ({
            ytSuiteSettings: structuredClone(FIXTURE_SETTINGS),
            'ytkit-video-filter-list-subscription': structuredClone(FIXTURE_FILTER_LIST)
        }),
        SETTINGS_STORAGE_KEY: 'ytSuiteSettings',
        STORAGE_KEYS: { filterListSubscription: 'ytkit-video-filter-list-subscription' },
        ensurePolicyProfile: () => policy,
        popupState: { _capabilities: null },
        window: { YTKitCore: {} },
        callExtensionApi: async (_api, method, arg) => {
            if (method === 'sendMessage') return { entries: LIFECYCLE };
            if (method === 'query') return [];
            if (method === 'download') { saved = arg; return 1; }
            return null;
        },
        ext: { downloads: { download: true } },
        requestExternalApiHealthSnapshot: async () => null,
        isSupportedInlinePanelUrl: () => false,
        browserApi: {},
        manifestVersion: '0.0.0-test',
        navigator: { userAgent: 'test-agent' },
        document: {},
        showStatus: () => {},
        t: (_key, fallback) => fallback,
        failureText: (_id, error) => { throw error; }
    };
    new Function(...Object.keys(stubs), popupSource.slice(start, end + 2))(...Object.values(stubs));
    await handler();
    assert.ok(saved, 'Save must start a download');
    assert.match(saved.filename, /^astra-deck-diagnostics-.+\.json$/);
    const text = decodeURIComponent(saved.url.replace(/^data:application\/json;charset=utf-8,/, ''));
    return { text, bundle: JSON.parse(text) };
}

// The panel button and the menu command both end in ytkit.js's
// buildBugReportBundle, loaded from the same source the userscript ships.
function loadPageVehicles(clipboard) {
    const policyCore = { createPolicyProfile, persistedDomains: globalThis.YTKitCore.persistedDomains };
    return loadUserscriptDeclarations(['buildBugReportBundle', 'copyBugReportBundle'], {
        YTKitCore: policyCore,
        StorageManager: {
            get: (key, fallback) => {
                if (key === 'ytSuiteSettings') return structuredClone(FIXTURE_SETTINGS);
                if (key === 'ytkit-video-filter-list-subscription') return structuredClone(FIXTURE_FILTER_LIST);
                return fallback;
            }
        },
        STORAGE_KEYS: { settings: 'ytSuiteSettings', filterListSubscription: 'ytkit-video-filter-list-subscription' },
        YTKIT_VERSION: '0.0.0-test',
        sendRuntimeMessage: async (message) => (message.type === 'GET_SW_LIFECYCLE' ? { entries: LIFECYCLE } : null),
        buildFeatureHealthPayload: () => ({ total: 0, features: [] }),
        navigator: { userAgent: 'test-agent', clipboard },
        handleFileExport: () => assert.fail('the clipboard took the bundle, so nothing should download'),
        setTimeout,
        __astraDeckUserscript: {
            manager: 'Violentmonkey 2.47.0',
            errors: [{ stage: 'menu command', message: 'failed at https://SENTINEL-host-error.example/x', at: 3 }]
        }
    });
}

test('one fixture through the popup Save, the panel button and the userscript menu redacts identically', async () => {
    const popup = await bundleFromPopupSave();

    let panelText = null;
    const page = loadPageVehicles({ writeText: async (text) => { panelText = text; } });
    assert.equal(await page.copyBugReportBundle(), 'copied');

    let menuText = null;
    let menuNotice = null;
    const menu = loadDeclarationsFrom(hostSource, ['copyDiagnostics'], {
        contentOnMessage: 'content-listener',
        extensionSender: () => ({ id: 'runtime' }),
        deliverMessage: async (listener, message) => {
            assert.equal(listener, 'content-listener');
            assert.equal(message.type, 'YTKIT_BUILD_BUG_REPORT');
            return { ok: true, report: await page.buildBugReportBundle() };
        },
        GM_API: { setClipboard: (text) => { menuText = text; } },
        HOST_WINDOW: { navigator: {} },
        notify: (message, isError) => { menuNotice = { message, isError: Boolean(isError) }; },
        hostText: (_key, fallback) => fallback
    });
    await menu.copyDiagnostics();
    assert.deepEqual(menuNotice, { message: 'Diagnostic copied to clipboard.', isError: false });

    for (const [surface, text] of [['popup Save', popup.text], ['panel button', panelText], ['menu command', menuText]]) {
        assert.equal(typeof text, 'string', `${surface} produced nothing`);
        assertNoSecrets(text, surface);
    }
    const panel = JSON.parse(panelText);
    const fromMenu = JSON.parse(menuText);
    assert.deepEqual(redactedView(panel), redactedView(popup.bundle));
    assert.deepEqual(redactedView(fromMenu), redactedView(popup.bundle));

    const { settings } = popup.bundle;
    assert.equal(settings.aiSummaryApiKey, `[redacted, ${SECRETS.aiSummaryApiKey.length} chars]`);
    assert.equal(settings.authToken, `[redacted, ${SECRETS.authToken.length} chars]`);
    assert.equal(settings.hideVideosFromHome, false);
    assert.equal('_errors' in settings, false, 'errors travel once, in `errors`');
    assert.deepEqual(popup.bundle.errors, FIXTURE_SETTINGS._errors);
    assert.equal(popup.bundle.filterListSubscription.source, 'https://raw.githubusercontent.com/u/r/main/rules.txt');
    assert.ok(popup.bundle.settingsDiff.some((change) => change.key === 'hideVideosFromHome'));
    assert.deepEqual(popup.bundle.swLifecycle, LIFECYCLE);
    assert.deepEqual(popup.bundle.runtime, { kind: 'extension' });

    // Only the userscript says which manager ran it and what its host hit.
    assert.equal(fromMenu.runtime.kind, 'userscript');
    assert.equal(fromMenu.runtime.manager, 'Violentmonkey 2.47.0');
    assert.deepEqual(fromMenu.runtime.hostErrors, [{ stage: 'menu command', message: 'failed at <url>', at: 3 }]);
});

test('the panel button saves the bundle as a file when the clipboard refuses it', async () => {
    let saved = null;
    const page = loadUserscriptDeclarations(['buildBugReportBundle', 'copyBugReportBundle'], {
        YTKitCore: { createPolicyProfile },
        StorageManager: { get: (key, fallback) => (key === 'ytSuiteSettings' ? { ...SECRETS } : fallback) },
        STORAGE_KEYS: { settings: 'ytSuiteSettings', filterListSubscription: 'ytkit-video-filter-list-subscription' },
        YTKIT_VERSION: '0.0.0-test',
        sendRuntimeMessage: async () => null,
        buildFeatureHealthPayload: () => null,
        navigator: { userAgent: '', clipboard: { writeText: async () => { throw new Error('NotAllowedError'); } } },
        handleFileExport: (filename, text) => { saved = { filename, text }; },
        setTimeout
    });
    assert.equal(await page.copyBugReportBundle(), 'saved');
    assert.match(saved.filename, /^astra-deck-diagnostics-.+\.json$/);
    assertNoSecrets(saved.text, 'saved file');
});

test('the userscript menu reports a failure instead of copying a partial bundle', async () => {
    let copied = false;
    const menu = loadDeclarationsFrom(hostSource, ['copyDiagnostics'], {
        contentOnMessage: null,
        extensionSender: () => ({}),
        deliverMessage: async () => ({ ok: false, error: 'runtime not ready' }),
        GM_API: { setClipboard: () => { copied = true; } },
        HOST_WINDOW: { navigator: {} },
        notify: () => {},
        hostText: (_key, fallback) => fallback
    });
    await assert.rejects(menu.copyDiagnostics(), /runtime not ready/);
    assert.equal(copied, false);
});

test('the page bundle never fetches 127.0.0.1 and survives a failing health snapshot', async () => {
    // From youtube.com a loopback fetch fails CORS (and Chrome may ask about
    // the local network), so the companion probes would read "absent" for
    // a user who has them. They stay unanswered instead.
    const page = loadUserscriptDeclarations(['buildBugReportBundle'], {
        YTKitCore: {
            createPolicyProfile,
            capabilityProbe: {
                PROBES: {
                    cssScope: { async: false, run: () => true },
                    promptApi: { async: false, run: () => { throw new Error('probe broke'); } },
                    mediaDL: { async: true, run: () => assert.fail('the companion probe ran from the page') },
                    ollama: { async: true, run: () => assert.fail('the Ollama probe ran from the page') }
                },
                runAll: () => assert.fail('runAll fetches loopback ports'),
                getAiLaneStatus: () => ({ summary: { activeLane: 'byo-key' } })
            }
        },
        StorageManager: { get: (_key, fallback) => fallback },
        STORAGE_KEYS: { settings: 'ytSuiteSettings', filterListSubscription: 'ytkit-video-filter-list-subscription' },
        YTKIT_VERSION: '0.0.0-test',
        sendRuntimeMessage: async () => null,
        buildFeatureHealthPayload: () => null,
        ExternalApiHealth: { snapshot: () => { throw new Error('snapshot broke'); } },
        navigator: { userAgent: '' },
        setTimeout
    });
    const bundle = await page.buildBugReportBundle();
    // Built inside the sandbox, so compared as data.
    assert.deepEqual(JSON.parse(JSON.stringify(bundle.capabilities)),
        { cssScope: true, promptApi: false, mediaDL: null, ollama: null });
    assert.equal(bundle.externalApiHealth, null);
    assert.deepEqual(bundle.capabilityLanes, { summary: { activeLane: 'byo-key' } });
});

test('the shared builder scrubs host errors and predicate code whoever calls it', () => {
    const bundle = createPolicyProfile().buildBugReport({
        settings: { advancedLocalPredicateCode: 'title.includes("SENTINEL-predicate")' },
        runtime: {
            kind: 'userscript',
            manager: 'Tampermonkey 5.4',
            hostErrors: [{ stage: 'grant', message: 'GET https://x.example/a?token=SENTINEL-q failed', at: 7 }]
        }
    });
    assertNoSecrets(JSON.stringify(bundle), 'builder');
    assert.deepEqual(bundle.runtime.hostErrors, [{ stage: 'grant', message: 'GET <url> failed', at: 7 }]);
    assert.equal(bundle.runtime.manager, 'Tampermonkey 5.4');
    assert.deepEqual(createPolicyProfile().buildBugReport({ runtime: { kind: 'extension' } }).runtime, { kind: 'extension' });
});

test('the userscript menu reports a clipboard the manager refused', async () => {
    let notice = null;
    const menu = loadDeclarationsFrom(hostSource, ['copyDiagnostics'], {
        contentOnMessage: null,
        extensionSender: () => ({}),
        deliverMessage: async () => ({ ok: true, report: { astraDeckBugReport: true } }),
        GM_API: { setClipboard: () => Promise.reject(new Error('clipboard denied')) },
        HOST_WINDOW: { navigator: {} },
        notify: (message) => { notice = message; },
        hostText: (_key, fallback) => fallback
    });
    await assert.rejects(menu.copyDiagnostics(), /clipboard denied/);
    assert.equal(notice, null, 'no "copied" notice after a refusal');
});

test('both routes are wired and named where a userscript user will look', () => {
    // The manager menu command, its label, and the grant it needs.
    assert.match(hostSource, /registerMenuCommand\(BUILD\.diagnosticsMenuLabel,[\s\S]{0,80}copyDiagnostics\(\)/);
    const { USERSCRIPT_GRANTS } = require('../sync-userscript');
    assert.ok(USERSCRIPT_GRANTS.includes('GM_setClipboard'),
        'a menu click has no user activation, so the page clipboard refuses it');
    assert.equal(readUserscriptBuild().diagnosticsMenuLabel, 'Copy Astra Deck diagnostics');
    assert.match(read('YTKit.user.js'), /^\/\/ @grant\s+GM_setClipboard$/m);

    // The content listener answers the menu with the shared builder.
    assert.match(ytkitSource,
        /message\.type === 'YTKIT_BUILD_BUG_REPORT'\) \{\s*buildBugReportBundle\(\)\.then\(/);

    // Both settings panels carry the bug button.
    const panelSource = read('extension', 'features', 'settings-panel', 'index.js');
    for (const [name, source] of [['settings-panel module', panelSource], ['ytkit.js fallback panel', ytkitSource]]) {
        assert.match(source, /diagnosticsBtn\.id = 'ytkit-copy-diagnostics'/, `${name} must build the bug button`);
        assert.match(source, /await copyBugReportBundle\(\)/, `${name} must copy through the shared builder`);
    }
    assert.match(ytkitSource, /\n\s+copyBugReportBundle,\n/, 'ytkit.js must hand the panel module its copy action');

    // The bug template names both routes.
    const template = read('.github', 'ISSUE_TEMPLATE', 'bug_report.md');
    assert.match(template, /\*\*Save log\*\*/);
    assert.match(template, /\*\*Copy Astra Deck diagnostics\*\*/);
    assert.match(template, /bug button/);
});
