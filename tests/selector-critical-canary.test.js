'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'fixtures', 'critical-selector-canary.json'),
    'utf8'
));

function loadModule() {
    const previous = global.YTKitCore;
    global.YTKitCore = {};
    delete require.cache[require.resolve('../extension/core/selector-health.js')];
    const api = require('../extension/core/selector-health.js');
    global.YTKitCore = previous;
    return api;
}

function loadRuntimeSelectorCore() {
    const previous = global.YTKitCore;
    global.YTKitCore = {};
    const files = [
        'extension/core/registry.js',
        ...fs.readdirSync(path.join(__dirname, '..', 'extension', 'core', 'selector-packs'))
            .filter((file) => file.endsWith('.js'))
            .sort()
            .map((file) => `extension/core/selector-packs/${file}`),
        'extension/core/selectors.js',
        'extension/core/selector-health.js'
    ];
    for (const relative of files) {
        const resolved = require.resolve(path.join(__dirname, '..', relative));
        delete require.cache[resolved];
        require(resolved);
    }
    const core = global.YTKitCore;
    global.YTKitCore = previous;
    return core;
}

function buildFixtureRoot(scenario, scripts = []) {
    const nodes = new Map();
    for (const spec of scenario.nodes) {
        const attributes = new Map(Object.entries(spec.attributes || {}));
        nodes.set(spec.id, {
            id: spec.id,
            tagName: spec.tagName,
            isConnected: spec.isConnected !== false,
            hidden: spec.hidden === true,
            inert: spec.inert === true,
            style: { ...(spec.style || {}) },
            classList: new Set(spec.classes || []),
            selectors: new Set(spec.selectors || []),
            parentElement: null,
            parentNode: null,
            hasAttribute(name) { return attributes.has(name); },
            getAttribute(name) { return attributes.get(name) ?? null; }
        });
    }
    for (const spec of scenario.nodes) {
        const node = nodes.get(spec.id);
        const parent = spec.parentId ? nodes.get(spec.parentId) : null;
        node.parentElement = parent;
        node.parentNode = parent;
    }
    return {
        nodes,
        querySelectorAll(selector) {
            if (selector === 'script') return scripts.map((textContent) => ({ textContent }));
            return Array.from(nodes.values()).filter((node) => node.selectors.has(selector));
        }
    };
}

test('critical canary ignores a hidden prior route and selects stamped current content', () => {
    const api = loadModule();
    const scenario = fixture.scenarios.watch;
    const root = buildFixtureRoot(scenario);
    const match = api.findActiveSelectorMatch(root, scenario.rules[0].selectors);

    assert.equal(match.node.id, 'template-stamped-watch');
    assert.equal(match.node.getAttribute('data-template-stamped'), 'true');

    const report = api.probeCriticalSelectorSurfaces({
        root,
        route: scenario.route,
        rules: scenario.rules,
        clientVersion: fixture.youtubeClientVersion,
        resolveFeatureName: (id) => ({
            stickyVideo: 'Theater Split',
            returnDislike: 'Return YouTube Dislike',
            sponsorBlock: 'SponsorBlock'
        })[id] || id,
        now: 1234
    });
    assert.equal(report.status, 'healthy');
    assert.equal(report.youtubeClientVersion, fixture.youtubeClientVersion);
    assert.equal(report.checkedAt, 1234);
    assert.equal(report.failedSurfaces.length, 0);
});

test('critical canary filters inactive matches before applying its bounded scan cap', () => {
    const api = loadModule();
    const hidden = Array.from({ length: 16 }, (_, index) => ({
        id: `hidden-${index}`,
        isConnected: true,
        hidden: false,
        inert: false,
        style: { display: 'none' },
        parentElement: null,
        parentNode: null,
        hasAttribute: () => false,
        getAttribute: () => null
    }));
    const active = {
        id: 'active-after-hidden-rollout-copies',
        isConnected: true,
        hidden: false,
        inert: false,
        style: {},
        parentElement: null,
        parentNode: null,
        hasAttribute: () => false,
        getAttribute: () => null
    };
    const root = { querySelectorAll: () => [...hidden, active] };

    assert.equal(api.findActiveSelectorMatch(root, ['.surface'])?.node, active,
        'sixteen hidden rollout copies must not hide the next live match');
});

test('critical canary rejects nodes hidden only by computed style', () => {
    const api = loadModule();
    const documentRef = {
        defaultView: {
            getComputedStyle: (node) => node.computedStyle
        }
    };
    const computedHidden = {
        id: 'computed-hidden',
        isConnected: true,
        hidden: false,
        inert: false,
        style: {},
        computedStyle: { display: 'none', visibility: 'visible', contentVisibility: 'visible' },
        ownerDocument: documentRef,
        parentElement: null,
        parentNode: null,
        hasAttribute: () => false,
        getAttribute: () => null
    };
    const active = {
        ...computedHidden,
        id: 'computed-visible',
        computedStyle: { display: 'block', visibility: 'visible', contentVisibility: 'visible' }
    };

    assert.equal(api.findActiveSelectorMatch({
        querySelectorAll: () => [computedHidden, active]
    }, ['.surface'])?.node, active);
});

test('selector packs declare a bounded route-specific critical surface set', () => {
    const core = loadRuntimeSelectorCore();
    const watchRules = core.getCriticalSelectorCanaryRules('watch');
    const surfaces = watchRules.map((rule) => rule.surface);
    assert.deepEqual(surfaces, ['appShell', 'mainVideo', 'player', 'watch']);
    assert.ok(watchRules.length <= 8);
    assert.ok(watchRules.every((rule) => rule.selectors.length > 0 && rule.selectors.length <= 8));
    assert.ok(watchRules.find((rule) => rule.surface === 'player').featureIds.includes('sponsorBlock'));
    assert.deepEqual(core.getCriticalSelectorCanaryRules('other'), []);
    assert.deepEqual(core.getCriticalSelectorCanaryRules('live_chat'), [],
        'the dedicated live-chat bundle has no selector-health runtime, so it must not advertise an unrun canary');
});

test('critical canary accepts a camelCase view-model host among mixed feed children', () => {
    const api = loadModule();
    const scenario = fixture.scenarios.feed;
    const root = buildFixtureRoot(scenario);
    const match = api.findActiveSelectorMatch(root, scenario.rules[1].selectors);

    assert.equal(match.node.id, 'camel-case-view-model-card');
    assert.equal(match.node.classList.has('ytLockupViewModelHost'), true);
    assert.equal(match.node.parentElement.id, 'active-feed');
    assert.deepEqual(
        scenario.nodes.filter((node) => node.parentId === 'active-feed').map((node) => node.id),
        ['mixed-filter-chip', 'camel-case-view-model-card', 'mixed-continuation']
    );

    const report = api.probeCriticalSelectorSurfaces({
        root,
        route: scenario.route,
        rules: scenario.rules,
        clientVersion: fixture.youtubeClientVersion
    });
    assert.equal(report.status, 'healthy');
});

test('critical canary collapses repeated surface failures into unique affected features', () => {
    const api = loadModule();
    const scenario = fixture.scenarios.watch;
    const root = buildFixtureRoot({
        ...scenario,
        nodes: scenario.nodes.filter((node) => !['current-player', 'current-video'].includes(node.id))
    });
    const report = api.probeCriticalSelectorSurfaces({
        root,
        route: scenario.route,
        rules: scenario.rules,
        clientVersion: fixture.youtubeClientVersion,
        resolveFeatureName: (id) => id === 'stickyVideo' ? 'Theater Split' : id
    });

    assert.equal(report.status, 'degraded');
    assert.deepEqual(report.failedSurfaces.map((row) => row.surface), ['player', 'mainVideo']);
    assert.equal(report.affectedFeatures.filter((feature) => feature.id === 'stickyVideo').length, 1);
    assert.equal(report.affectedFeatures.find((feature) => feature.id === 'stickyVideo').name, 'Theater Split');
    assert.match(report.fingerprint, /watch\|2\.20260820\.01\.00\|mainVideo,player/);
});

test('critical canary skips surfaces owned only by disabled features', () => {
    const api = loadModule();
    const report = api.probeCriticalSelectorSurfaces({
        root: buildFixtureRoot({ nodes: [] }),
        route: 'watch',
        rules: [{
            surface: 'mainVideo',
            selectors: ['video.html5-main-video'],
            featureIds: ['stickyVideo']
        }],
        includeFeature: () => false,
        clientVersion: fixture.youtubeClientVersion
    });
    assert.equal(report.status, 'healthy');
    assert.deepEqual(report.checked, []);
    assert.deepEqual(report.failedSurfaces, []);
    assert.deepEqual(report.affectedFeatures, []);
});

test('YouTube client version detection is bounded and prefers ytcfg', () => {
    const api = loadModule();
    const scenario = fixture.scenarios.watch;
    const root = buildFixtureRoot(scenario, [
        'window.ytcfg = {};',
        `{"INNERTUBE_CLIENT_VERSION":"${fixture.youtubeClientVersion}"}`
    ]);
    assert.equal(api.getActiveYouTubeClientVersion({ document: root }), fixture.youtubeClientVersion);
    assert.equal(api.getActiveYouTubeClientVersion({
        document: root,
        ytcfg: { get: () => '2.20260821.02.00' }
    }), '2.20260821.02.00');
});

test('critical canary snapshots are defensive copies', () => {
    const api = loadModule();
    const report = api.probeCriticalSelectorSurfaces({
        root: buildFixtureRoot(fixture.scenarios.feed),
        route: 'home',
        rules: fixture.scenarios.feed.rules,
        clientVersion: fixture.youtubeClientVersion
    });
    api.setCriticalSelectorCanarySnapshot(report);
    const first = api.getCriticalSelectorCanarySnapshot();
    first.checked[0].featureIds.push('mutated');
    if (first.checked[0].selectors) first.checked[0].selectors.push('.mutated');
    first.checked.length = 0;
    first.affectedFeatures.push({ id: 'mutated', name: 'mutated' });
    const second = api.getCriticalSelectorCanarySnapshot();
    assert.equal(second.checked.length, 2);
    assert.equal(second.checked[0].featureIds.includes('mutated'), false);
    assert.equal(second.checked[0].selectors?.includes('.mutated') || false, false);
    assert.equal(second.affectedFeatures.some((feature) => feature.id === 'mutated'), false);
});

test('runtime schedules one silent aggregate canary after route settlement', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');
    const start = source.indexOf('const CriticalSelectorCanary = (function ()');
    const end = source.indexOf('function registerRuntimeFeature', start);
    assert.ok(start > -1 && end > start);
    const block = source.slice(start, end);

    assert.match(block, /SETTLE_DELAY_MS\s*=\s*1400/);
    assert.match(block, /addNavigateRule\(RULE_ID, schedule\)/);
    assert.match(block, /report\.status === 'degraded' && attempt === 0/);
    assert.match(block, /lastFailureFingerprint === report\.fingerprint/);
    assert.match(block, /ServiceStateStrip\.updateCriticalCanary\(report\)/);
    assert.match(block, /shouldFeatureBeActive\(feature, appState\.settings \|\| \{\}, route\)/,
        'canary ownership must use the same route, dependency, and remote-disable predicate as feature init');
    assert.doesNotMatch(block, /isFeatureEnabledInSettings\(feature/,
        'settings alone are not enough to make a feature active on this route');
    assert.doesNotMatch(block, /findSurfaceElement|ytkit-selector-miss/,
        'the canary must not emit normal per-selector telemetry');

    const noticeStart = source.indexOf('function openSelectorDiagnostics()');
    const noticeEnd = source.indexOf('return { update, updateCriticalCanary, remove }', noticeStart);
    const notice = source.slice(noticeStart, noticeEnd);
    assert.match(notice, /selectorCanaryDiagnosticsAction/);
    assert.match(notice, /toggleSettingsPanel\(true\)/);
    assert.match(notice, /new Set\(/, 'affected feature names must be deduplicated');
});
