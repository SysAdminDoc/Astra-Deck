'use strict';

// Behavioural tests for the power-efficient codec mode in the MAIN-world
// bridge. The mode asks the device which codec it decodes smoothly AND power
// efficiently, and must stay a no-op whenever that answer carries no signal.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { installBridgeChannel } = require('./helpers/main-bridge');

const repoRoot = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit-main.js'), 'utf8');
const injectionGuardSource = fs.readFileSync(
    path.join(repoRoot, 'extension', 'core', 'injection-guard.js'),
    'utf8'
);

/**
 * Run ytkit-main.js against a stubbed page and return handles for driving the
 * codec bridge: the html element's attribute, the patched canPlayType, and the
 * decodingInfo the page would see.
 */
function bootstrapBridge({ decodingInfo, codec = 'auto', hasMediaCapabilities = true } = {}) {
    const attributes = new Map();
    const attributeListeners = [];
    const observers = [];
    // Seeded through the sealed channel below, not straight into the
    // attribute map: the bridge reads the sealed copy now.
    const initialCodec = codec;

    const documentElement = {
        getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
        setAttribute: (name, value) => {
            attributes.set(name, String(value));
            attributeListeners.forEach((listener) => listener([{ type: 'attributes', attributeName: name }]));
        },
        removeAttribute: (name) => { attributes.delete(name); },
        classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
        style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' }
    };

    class FakeMutationObserver {
        constructor(callback) {
            this.active = false;
            attributeListeners.push(callback);
            observers.push(this);
        }
        observe() { this.active = true; }
        disconnect() { this.active = false; }
    }

    const originalCanPlayType = function canPlayType(type) {
        return /avc1|vp0?9|av01/i.test(type) ? 'probably' : '';
    };

    const context = {
        console,
        setTimeout,
        clearTimeout,
        setInterval: () => 0,
        clearInterval: () => {},
        Promise,
        JSON,
        Math,
        Date,
        queueMicrotask,
        MutationObserver: FakeMutationObserver,
        Set,
        HTMLVideoElement: function HTMLVideoElement() {},
        MediaSource: { isTypeSupported: () => true },
        navigator: hasMediaCapabilities ? { mediaCapabilities: { decodingInfo } } : {},
        document: {
            documentElement,
            addEventListener() {},
            removeEventListener() {},
            querySelector: () => null,
            querySelectorAll: () => [],
            getElementById: () => null,
            createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
            head: { appendChild() {} },
            body: { appendChild() {} },
            readyState: 'complete'
        },
        location: { href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', pathname: '/watch' }
    };
    context.addEventListener = () => {};
    context.removeEventListener = () => {};
    context.dispatchEvent = () => true;
    context.window = context;
    context.self = context;
    context.globalThis = context;
    context.HTMLVideoElement.prototype = { canPlayType: originalCanPlayType };
    if (hasMediaCapabilities) {
        context.MediaCapabilities = function MediaCapabilities() {};
        context.MediaCapabilities.prototype = { decodingInfo };
    }

    vm.createContext(context);
    vm.runInContext(injectionGuardSource, context, { filename: 'extension/core/injection-guard.js' });
    // Seed the token before the bridge builds its reader: it takes the token
    // out of the DOM as it starts, the way it does at document_start.
    const channel = installBridgeChannel(documentElement, context.YTKitCore);
    if (initialCodec) channel.publish('data-ytkit-codec', initialCodec);
    vm.runInContext(source, context, { filename: 'extension/ytkit-main.js' });

    return {
        context,
        observerCount: () => observers.length,
        activeObserverCount: () => observers.filter((observer) => observer.active).length,
        channel,
        documentElement,
        // What the isolated world does.
        setCodec: (value) => channel.publish('data-ytkit-codec', value),
        // What a page script can do: the attribute, with nothing behind it.
        forgeCodec: (value) => channel.forge('data-ytkit-codec', value),
        canPlayType: (type) => context.HTMLVideoElement.prototype.canPlayType.call({}, type),
        isPatched: () => context.HTMLVideoElement.prototype.canPlayType !== originalCanPlayType
};
}

test('repeated MAIN-world injection keeps one bridge and records the duplicate', () => {
    const bridge = bootstrapBridge({ codec: 'auto' });
    const before = bridge.observerCount();
    vm.runInContext(source, bridge.context, { filename: 'extension/ytkit-main.js' });

    assert.equal(bridge.observerCount(), before,
        'a second classic-script evaluation must not create another observer sequence');
    assert.equal(bridge.activeObserverCount(), 1,
        'the original MAIN-world bridge remains the only active observer');
    assert.equal(bridge.context.__ytkitMainRuntime.duplicateInjections, 1,
        'the guard must expose the rejected update re-entry');
});

const flush = async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

function decodingInfoFrom(table) {
    return function decodingInfo(config) {
        const contentType = config?.video?.contentType || '';
        const key = /avc1/i.test(contentType) ? 'h264' : (/vp0?9/i.test(contentType) ? 'vp9' : 'av1');
        return Promise.resolve(table[key]);
    };
}

test('efficient mode enforces the one codec this device decodes power-efficiently', async () => {
    const bridge = bootstrapBridge({
        codec: 'efficient',
        decodingInfo: decodingInfoFrom({
            h264: { supported: true, smooth: true, powerEfficient: true },
            vp9: { supported: true, smooth: true, powerEfficient: false },
            av1: { supported: true, smooth: false, powerEfficient: false }
        })
    });
    await flush();

    assert.equal(bridge.isPatched(), true, 'a discriminating answer must be enforced');
    assert.equal(bridge.canPlayType('video/mp4; codecs="avc1.640028"'), 'probably',
        'the efficient codec stays playable');
    assert.equal(bridge.canPlayType('video/webm; codecs="vp09.00.10.08"'), '',
        'a supported-but-inefficient codec is blocked');
    assert.equal(bridge.canPlayType('video/mp4; codecs="av01.0.08M.08"'), '',
        'a non-smooth codec is blocked');
});

test('efficient mode is a no-op when every supported codec is equally efficient', async () => {
    const bridge = bootstrapBridge({
        codec: 'efficient',
        decodingInfo: decodingInfoFrom({
            h264: { supported: true, smooth: true, powerEfficient: true },
            vp9: { supported: true, smooth: true, powerEfficient: true },
            av1: { supported: true, smooth: true, powerEfficient: true }
        })
    });
    await flush();

    assert.equal(bridge.isPatched(), false,
        'an answer that does not discriminate must leave YouTube alone');
    assert.equal(bridge.canPlayType('video/webm; codecs="vp09.00.10.08"'), 'probably');
});

test('efficient mode is a no-op when nothing reports as power efficient', async () => {
    const bridge = bootstrapBridge({
        codec: 'efficient',
        decodingInfo: decodingInfoFrom({
            h264: { supported: true, smooth: true, powerEfficient: false },
            vp9: { supported: true, smooth: true, powerEfficient: false },
            av1: { supported: false, smooth: false, powerEfficient: false }
        })
    });
    await flush();

    assert.equal(bridge.isPatched(), false);
});

test('efficient mode survives a rejecting or absent MediaCapabilities', async () => {
    const rejecting = bootstrapBridge({
        codec: 'efficient',
        decodingInfo: () => Promise.reject(new Error('not supported here'))
    });
    await flush();
    assert.equal(rejecting.isPatched(), false, 'a rejected probe must not block anything');

    const absent = bootstrapBridge({ codec: 'efficient', hasMediaCapabilities: false });
    await flush();
    assert.equal(absent.isPatched(), false, 'no API means no change');
    assert.equal(absent.canPlayType('video/mp4; codecs="av01.0.08M.08"'), 'probably');
});

test('an explicit codec choice still wins over the efficient probe', async () => {
    const bridge = bootstrapBridge({
        codec: 'efficient',
        decodingInfo: decodingInfoFrom({
            h264: { supported: true, smooth: true, powerEfficient: true },
            vp9: { supported: true, smooth: true, powerEfficient: false },
            av1: { supported: true, smooth: true, powerEfficient: false }
        })
    });
    await flush();
    assert.equal(bridge.canPlayType('video/webm; codecs="vp09.00.10.08"'), '');

    bridge.setCodec('av1');
    await flush();
    assert.equal(bridge.canPlayType('video/mp4; codecs="av01.0.08M.08"'), 'probably',
        'switching to a forced codec must take effect immediately');
    assert.equal(bridge.canPlayType('video/mp4; codecs="avc1.640028"'), '');

    bridge.setCodec('auto');
    await flush();
    assert.equal(bridge.isPatched(), false, 'auto must restore the original implementations');
});
