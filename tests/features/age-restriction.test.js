'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'extension', 'manifest.json'), 'utf8'));
const { runtimeModules } = require('../helpers/source');
const { fakeNode, fakeTreeDocument, loadFeature } = require('../helpers/monolith');

function ageGateFixture({ embedText = 'ytInitialPlayerResponse' } = {}) {
    const originalVideo = fakeNode({ tag: 'video' });
    const nativeError = fakeNode({ tag: 'div', text: 'Sign in to confirm your age' });
    const player = fakeNode({ tag: 'div', children: [originalVideo, nativeError] });
    const ageGate = fakeNode({ tag: 'div' });
    const loginPrompt = fakeNode({ tag: 'div', text: 'Sign in to confirm your age' });
    const documentRef = fakeTreeDocument((selector) => {
        if (selector.includes('ytd-player-error-message-renderer')) return ageGate;
        if (selector.includes('#reason')) return loginPrompt;
        if (selector === '#player-container, #player') return player;
        return null;
    });
    const health = [];
    const diagnostics = [];
    const toasts = [];
    const feature = loadFeature('ageRestrictionBypass', {
        document: documentRef,
        _rw: { ytInitialPlayerResponse: { playabilityStatus: { status: 'LOGIN_REQUIRED' } } },
        getVideoId: () => 'dQw4w9WgXcQ',
        classifyAgeRestriction: () => ({ blocked: true, drifted: false, status: 'LOGIN_REQUIRED' }),
        extensionFetchText: async () => ({ text: embedText }),
        setFeatureHealth: (_id, state) => health.push(state),
        DiagnosticLog: { record: (...args) => diagnostics.push(args) },
        showToast: (...args) => toasts.push(args),
        describeFailureCause: (error) => error.message
    });
    return { feature, player, ageGate, originalVideo, nativeError, health, diagnostics, toasts };
}

test('ageRestrictionBypass replaces the gated player with one accessible embed', async () => {
    const { feature, player, ageGate, health, toasts } = ageGateFixture();

    await feature._bypass();

    assert.equal(player.children.length, 1, 'the native error contents are moved out before the embed attaches');
    const [iframe] = player.children;
    assert.equal(iframe.tagName, 'IFRAME');
    assert.equal(iframe.title, 'Age-restricted YouTube video');
    assert.equal(iframe.dataset.ytkitVideoId, 'dQw4w9WgXcQ');
    assert.match(iframe.src, /\/embed\/dQw4w9WgXcQ\?autoplay=1$/);
    assert.match(iframe.getAttribute('sandbox'), /allow-scripts/);
    assert.equal(ageGate.style.display, 'none');
    assert.equal(health.at(-1).status, 'initialized');
    assert.match(toasts.at(-1)[0], /bypassed/i);
});

test('ageRestrictionBypass teardown removes the embed and restores the exact native children', async () => {
    const { feature, player, ageGate, originalVideo, nativeError } = ageGateFixture();
    await feature._bypass();

    feature.destroy();

    assert.deepEqual(player.children, [originalVideo, nativeError]);
    assert.equal(player.children.some((child) => child.tagName === 'IFRAME'), false);
    assert.equal(ageGate.style.display, '');
    assert.equal(feature._iframe, null);
    assert.equal(feature._originalContent, null);
});

test('ageRestrictionBypass renders no replacement from an unrecognized embed response', async () => {
    const { feature, player, health, diagnostics, toasts } = ageGateFixture({ embedText: '<html>consent interstitial</html>' });

    await feature._bypass();

    assert.equal(player.children.some((child) => child.tagName === 'IFRAME'), false);
    assert.equal(health.at(-1).status, 'degraded');
    assert.equal(diagnostics.at(-1)[0], 'age-restriction-bypass');
    assert.match(toasts.at(-1)[0], /needs attention/i);
});

test('playability classifier loads before the ytkit runtime only on normal pages', () => {
    const normal = manifest.content_scripts.find((entry) => runtimeModules(entry).includes('ytkit.js'));
    const chat = manifest.content_scripts.find((entry) => entry.js?.includes('live-chat.js'));
    const normalScripts = runtimeModules(normal);
    assert.notEqual(normalScripts.indexOf('core/video-type.js'), -1, 'anchor: video-type must be in the manifest or the ordering is vacuous');
    assert.ok(normalScripts.indexOf('core/playability.js') > normalScripts.indexOf('core/video-type.js'));
    assert.ok(normalScripts.indexOf('core/playability.js') < normalScripts.indexOf('ytkit.js'));
    assert.equal(chat.js.includes('core/playability.js'), false,
        'scope-minimal live chat must not inherit normal-player canaries');
});
