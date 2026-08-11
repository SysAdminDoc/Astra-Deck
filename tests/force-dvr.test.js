'use strict';

// Behavioural tests for the opt-in MAIN-world player-response patch. The
// fixture mirrors the stable live/DVR fields while keeping the test entirely
// offline and independent of YouTube's current response payload.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit-main.js'), 'utf8');
const injectionGuardSource = fs.readFileSync(
    path.join(repoRoot, 'extension', 'core', 'injection-guard.js'),
    'utf8'
);
const liveFixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'fixtures', 'player-response-live-dvr-disabled.json'),
    'utf8'
));

function bootstrap({ initialResponse } = {}) {
    const attributes = new Map();
    const observers = [];
    const documentElement = {
        getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
        setAttribute: (name, value) => {
            attributes.set(name, String(value));
            const records = [{ type: 'attributes', attributeName: name }];
            observers.filter((observer) => observer.active)
                .forEach((observer) => observer.callback(records));
        },
        removeAttribute: (name) => {
            attributes.delete(name);
            const records = [{ type: 'attributes', attributeName: name }];
            observers.filter((observer) => observer.active)
                .forEach((observer) => observer.callback(records));
        },
        classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
        style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' }
    };

    class FakeMutationObserver {
        constructor(callback) {
            this.callback = callback;
            this.active = false;
            observers.push(this);
        }
        observe() { this.active = true; }
        disconnect() { this.active = false; }
    }

    const context = {
        console,
        setTimeout,
        clearTimeout,
        setInterval: () => 0,
        clearInterval: () => {},
        Promise,
        Math,
        Date,
        queueMicrotask,
        MutationObserver: FakeMutationObserver,
        document: {
            documentElement,
            addEventListener() {},
            removeEventListener() {},
            querySelector: () => null,
            querySelectorAll: () => [],
            getElementById: () => null,
            createElement: () => ({
                style: {},
                setAttribute() {},
                removeAttribute() {},
                appendChild() {}
            }),
            head: { appendChild() {} },
            body: { appendChild() {} },
            readyState: 'complete'
        },
        location: { href: 'https://www.youtube.com/watch?v=live-dvr-fixture', pathname: '/watch' },
        performance: { now: () => 0 },
        matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
    };
    context.addEventListener = () => {};
    context.removeEventListener = () => {};
    context.dispatchEvent = () => true;
    context.window = context;
    context.self = context;
    context.globalThis = context;
    if (initialResponse) context.ytInitialPlayerResponse = initialResponse;

    vm.createContext(context);
    vm.runInContext(injectionGuardSource, context, { filename: 'extension/core/injection-guard.js' });
    vm.runInContext(source, context, { filename: 'extension/ytkit-main.js' });

    return {
        context,
        attributes,
        setEnabled(value) {
            if (value) documentElement.setAttribute('data-ytkit-force-dvr', 'on');
            else documentElement.removeAttribute('data-ytkit-force-dvr');
        },
        parse(value) {
            const encoded = JSON.stringify(JSON.stringify(value));
            const serialized = vm.runInContext(`JSON.stringify(JSON.parse(${encoded}))`, context);
            return JSON.parse(serialized);
        },
        status() {
            return {
                status: attributes.get('data-ytkit-force-dvr-status') || null,
                reason: attributes.get('data-ytkit-force-dvr-reason') || null
            };
        }
    };
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

test('Force DVR is off by default and leaves live player responses unchanged', () => {
    const bridge = bootstrap();
    const result = bridge.parse(liveFixture);

    assert.equal(result.videoDetails.isLiveDvrEnabled, false);
    assert.equal(result.playerConfig.mediaCommonConfig.useServerDrivenAbr, true);
    assert.equal(result.streamingData.serverAbrStreamingUrl, 'https://example.test/server-abr');
    assert.deepEqual(bridge.status(), { status: 'off', reason: null });
});

test('opt-in JSON player responses enable DVR and remove conflicting server ABR', () => {
    const bridge = bootstrap();
    bridge.setEnabled(true);
    const result = bridge.parse(liveFixture);

    assert.equal(result.videoDetails.isLiveDvrEnabled, true);
    assert.equal(result.playerConfig.mediaCommonConfig.useServerDrivenAbr, false);
    assert.equal(result.playerConfig.mediaCommonConfig.serverPlaybackStartConfig.enable, false);
    assert.equal(result.streamingData.serverAbrStreamingUrl, undefined);
    assert.equal(bridge.status().status, 'applied');
    assert.equal(bridge.status().reason, 'dvr-enabled');
});

test('opt-in wrapped player responses and the initial global response use the same patch', () => {
    const initial = clone(liveFixture);
    const bridge = bootstrap({ initialResponse: initial });
    bridge.setEnabled(true);

    assert.equal(bridge.context.ytInitialPlayerResponse.videoDetails.isLiveDvrEnabled, true);

    const wrapped = bridge.parse({ playerResponse: clone(liveFixture) });
    assert.equal(wrapped.playerResponse.videoDetails.isLiveDvrEnabled, true);
    assert.equal(wrapped.playerResponse.streamingData.serverAbrStreamingUrl, undefined);
});

test('response shape drift is reported and fails closed', () => {
    const drifted = clone(liveFixture);
    delete drifted.videoDetails.isLiveDvrEnabled;
    const bridge = bootstrap();
    bridge.setEnabled(true);
    const result = bridge.parse(drifted);

    assert.equal(result.videoDetails.isLiveDvrEnabled, undefined);
    assert.equal(result.playerConfig.mediaCommonConfig.useServerDrivenAbr, true);
    assert.deepEqual(bridge.status(), {
        status: 'degraded',
        reason: 'response-shape-drift'
    });
});

test('VOD player responses are ignored without changing their status payload', () => {
    const vod = clone(liveFixture);
    vod.videoDetails.isLive = false;
    vod.videoDetails.isLiveContent = false;
    const bridge = bootstrap();
    bridge.setEnabled(true);
    const result = bridge.parse(vod);

    assert.equal(result.videoDetails.isLiveDvrEnabled, false);
    assert.equal(result.streamingData.serverAbrStreamingUrl, 'https://example.test/server-abr');
    assert.deepEqual(bridge.status(), { status: 'skipped', reason: 'not-live' });
});
