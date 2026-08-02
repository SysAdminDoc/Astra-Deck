'use strict';

// Behavioural tests for the power-efficient codec mode in the MAIN-world
// bridge. The mode asks the device which codec it decodes smoothly AND power
// efficiently, and must stay a no-op whenever that answer carries no signal.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit-main.js'), 'utf8');

/**
 * Run ytkit-main.js against a stubbed page and return handles for driving the
 * codec bridge: the html element's attribute, the patched canPlayType, and the
 * decodingInfo the page would see.
 */
function bootstrapBridge({ decodingInfo, codec = 'auto', hasMediaCapabilities = true } = {}) {
    const attributes = new Map();
    const attributeListeners = [];
    if (codec) attributes.set('data-ytkit-codec', codec);

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
        constructor(callback) { attributeListeners.push(callback); }
        observe() {}
        disconnect() {}
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
    vm.runInContext(source, context, { filename: 'extension/ytkit-main.js' });

    return {
        context,
        setCodec: (value) => documentElement.setAttribute('data-ytkit-codec', value),
        canPlayType: (type) => context.HTMLVideoElement.prototype.canPlayType.call({}, type),
        isPatched: () => context.HTMLVideoElement.prototype.canPlayType !== originalCanPlayType
    };
}

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
