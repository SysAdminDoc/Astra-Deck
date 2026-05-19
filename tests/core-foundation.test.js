'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const coreSources = [
    'registry.js',
    'selectors.js',
    'trusted-html.js',
    'api-limiter.js'
].map((fileName) => ({
    fileName,
    source: fs.readFileSync(path.join(repoRoot, 'extension', 'core', fileName), 'utf8')
}));

class TestCustomEvent {
    constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
    }
}

function loadFoundation(extra = {}) {
    const context = {
        console,
        Date,
        Math,
        Promise,
        setTimeout,
        clearTimeout,
        CustomEvent: TestCustomEvent,
        globalThis: null,
        ...extra
    };
    context.globalThis = context;
    vm.createContext(context);
    for (const { fileName, source } of coreSources) {
        vm.runInContext(source, context, { filename: `extension/core/${fileName}` });
    }
    return context.globalThis.YTKitCore;
}

test('feature registry registers, tracks health, and runs cleanup in reverse order', () => {
    const core = loadFoundation();
    const calls = [];
    const registry = core.createFeatureRegistry({
        now: () => 1234,
        logger: { error() {} }
    });
    const feature = {
        id: 'demo-feature',
        category: 'tests',
        destroy() {
            calls.push('destroy');
        }
    };

    registry.register(feature);
    registry.addCleanup('demo-feature', () => calls.push('cleanup-a'));
    registry.addCleanup('demo-feature', () => calls.push('cleanup-b'));
    registry.setHealth('demo-feature', { status: 'ready' });

    assert.equal(registry.get('demo-feature'), feature);
    assert.equal(registry.getHealth('demo-feature').status, 'ready');
    assert.equal(registry.destroy('demo-feature'), true);
    assert.deepEqual(calls, ['destroy', 'cleanup-b', 'cleanup-a']);
    assert.equal(registry.getHealth('demo-feature').status, 'destroyed');
});

test('feature registry generates a settings schema from registered metadata and defaults', () => {
    const core = loadFoundation();
    const registry = core.createFeatureRegistry();
    registry.register({
        id: 'qualityMode',
        name: 'Quality Mode',
        category: 'Player',
        type: 'select',
        settingKey: 'qualityMode',
        pages: ['watch'],
        dependsOn: 'playerTools',
        source: 'ytkit'
    });

    const schema = registry.createSettingsSchema({
        qualityMode: 'best',
        diagnosticLog: false,
        _errors: []
    }, { settingsVersion: 7 });

    assert.equal(schema.settingsVersion, 7);
    assert.equal(schema.featureCount, 1);
    assert.equal(schema.entryCount, 3);
    const qualityEntry = JSON.parse(JSON.stringify(schema.entries.find((entry) => entry.key === 'qualityMode')));
    assert.deepEqual(qualityEntry, {
        key: 'qualityMode',
        featureId: 'qualityMode',
        name: 'Quality Mode',
        category: 'Player',
        control: 'select',
        valueType: 'string',
        defaultValue: 'best',
        hasDefault: true,
        pages: ['watch'],
        dependsOn: 'playerTools',
        parentId: null,
        isSubFeature: false,
        source: 'ytkit'
    });
    assert.equal(schema.entries.find((entry) => entry.key === 'diagnosticLog').control, 'toggle');
    assert.equal(schema.entries.find((entry) => entry.key === '_errors').category, 'Internal');
});

test('feature registry supports category cleanup and category health snapshots', () => {
    const core = loadFoundation();
    const registry = core.createFeatureRegistry({ logger: { error() {} } });
    const calls = [];

    registry.register({
        id: 'watchOne',
        name: 'Watch One',
        category: 'Watch',
        destroy() {
            calls.push('feature');
        }
    });
    registry.setHealth('watchOne', { status: 'initialized', initialized: true });
    registry.addCategoryCleanup('Watch', () => calls.push('category-b'));
    registry.addCategoryCleanup('Watch', () => calls.push('category-a'));

    const before = registry.getCategoryHealthSnapshot().find((entry) => entry.category === 'Watch');
    assert.equal(before.featureCount, 1);
    assert.equal(before.initializedCount, 1);
    assert.equal(before.cleanupCount, 2);
    assert.equal(before.statuses.initialized, 1);

    assert.deepEqual(JSON.parse(JSON.stringify(registry.destroyCategory('Watch'))), { ok: true, errors: [] });
    assert.deepEqual(calls, ['feature', 'category-a', 'category-b']);
    assert.equal(registry.getHealth('watchOne').status, 'destroyed');
});

test('surface selectors prefer stable selectors and emit first-miss diagnostics', () => {
    const events = [];
    const core = loadFoundation({
        dispatchEvent(event) {
            events.push(event);
        }
    });
    const player = { id: 'movie_player' };
    const queried = [];
    const root = {
        querySelector(selector) {
            queried.push(selector);
            if (selector === '#movie_player') return player;
            if (selector === 'bad[') throw new Error('invalid selector');
            return null;
        },
        querySelectorAll(selector) {
            if (selector === 'bad[') throw new Error('invalid selector');
            return [];
        }
    };

    assert.equal(core.findSurfaceElement('player', { root }), player);
    assert.deepEqual(queried, ['#movie_player']);
    assert.equal(core.findSurfaceElement(['bad[', '.missing'], { root }), null);
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((event) => event.detail.selector), ['bad[', '.missing']);
});

test('surface selector map promotes roadmap surfaces with stable-first fallback chains', () => {
    const core = loadFoundation();
    const requiredSurfaces = [
        'appShell',
        'nav',
        'search',
        'leftNav',
        'feed',
        'feedCard',
        'thumbnail',
        'shortsShelf',
        'watch',
        'relatedSidebar',
        'player',
        'mainVideo',
        'playerChrome',
        'playerSettings',
        'comments',
        'commentComposer',
        'engagementPanels',
        'profile',
        'notifications',
        'liveChatFrame',
        'liveChat',
        'liveChatPlaceholder'
    ];

    for (const surface of requiredSurfaces) {
        const entry = core.getSurfaceSelectorEntry(surface);
        assert.ok(entry, `${surface} should have a promoted selector-map entry`);
        assert.ok(entry.stable.length >= 1, `${surface} should define at least one stable selector`);
        assert.ok(entry.fallback.length >= 1, `${surface} should define at least one fallback selector`);
        assert.deepEqual(
            entry.selectors.slice(0, entry.stable.length),
            entry.stable,
            `${surface} should try stable selectors before fallbacks`
        );
    }

    assert.ok(core.SurfaceSelectorMap.feed.highChurn, 'feed should be marked high churn');
    assert.ok(core.SurfaceSelectorMap.liveChat.needsFreshCapture, 'live chat should require a fresh capture');
    assert.ok(core.getSurfaceSelectorChain('playerChrome').includes('.ytp-delhi-modern'),
        'player chrome chain should include new-player transition selectors');
});

test('selector health snapshot tracks hits, misses, errors, and exports JSON', () => {
    const events = [];
    const core = loadFoundation({
        dispatchEvent(event) {
            events.push(event);
        }
    });
    const feed = { id: 'feed' };
    const root = {
        querySelector(selector) {
            if (selector === 'bad[') throw new Error('invalid selector');
            if (selector === 'ytd-browse ytd-rich-grid-renderer') return feed;
            return null;
        },
        querySelectorAll(selector) {
            if (selector === 'ytd-notification-topbar-button-renderer') return [{ id: 'bell' }];
            return [];
        }
    };

    assert.equal(core.findSurfaceElement('feed', { root }), feed);
    assert.equal(core.findSurfaceElement(['bad['], { root }), null);
    assert.equal(core.findSurfaceElements('notifications', { root }).length, 1);

    const snapshot = core.getSelectorHealthSnapshot();
    const feedHealth = snapshot.find((entry) => entry.surface === 'feed');
    const notificationHealth = snapshot.find((entry) => entry.surface === 'notifications');
    const customHealth = snapshot.find((entry) => entry.surface === 'custom');

    assert.equal(feedHealth.hitCount, 1);
    assert.equal(notificationHealth.hitCount, 1);
    assert.equal(customHealth, undefined, 'custom one-off selectors should not pollute surface-map reports');
    assert.equal(events.length, 1);
    assert.equal(events[0].detail.selector, 'bad[');
    assert.equal(JSON.parse(core.exportSelectorHealth()).schemaVersion, 1);
});

test('trusted html helper centralizes TrustedTypes policy creation', () => {
    const createdPolicies = [];
    const core = loadFoundation({
        trustedTypes: {
            createPolicy(name, rules) {
                createdPolicies.push(name);
                return {
                    createHTML(value) {
                        return {
                            policy: name,
                            value: rules.createHTML(value)
                        };
                    }
                };
            }
        }
    });

    assert.deepEqual(core.toTrustedHTML('<b>Astra</b>'), {
        policy: 'astraDeck',
        value: '<b>Astra</b>'
    });
    assert.deepEqual(createdPolicies, ['astraDeck']);
});

test('api limiter serializes same-bucket work and reports queue state', async () => {
    const core = loadFoundation();
    const order = [];
    const limiter = core.createApiLimiter({
        capacity: 1,
        refillMs: 0,
        jitterMs: 0,
        setTimeout(callback) {
            callback();
            return 0;
        },
        clearTimeout() {}
    });

    const first = limiter.run('youtube', async () => {
        order.push('first');
        return 1;
    });
    const second = limiter.run('youtube', async () => {
        order.push('second');
        return 2;
    });

    assert.deepEqual(await Promise.all([first, second]), [1, 2]);
    assert.deepEqual(order, ['first', 'second']);
    assert.equal(limiter.getState('youtube').queued, 0);
});
