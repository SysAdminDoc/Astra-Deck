'use strict';

// Watch-sidebar lockups name their channel only in the card's own view model,
// which only the page world can read. ytkit-main.js writes it on the card as
// data-ytkit-lockup-channels while Video Hider has a channel rule, and the
// hider reads it back. The userscript runs the same page-world scripts,
// injected by its host after the bridge token, so a sidebar card hides there
// too. These run the tagger as each vehicle ships it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { installBridgeChannel } = require('./helpers/main-bridge');
const { readUserscriptBuild } = require('./helpers/source');

const repoRoot = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const VIDEO = 'EtJvCpWqN4o';
const CHANNEL = 'UCaF7r2AiXRzA-yuq0B3ZDcA';

function viewModel(videoId = VIDEO) {
    return {
        contentId: videoId,
        contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
        metadata: { lockupMetadataViewModel: { image: { decoratedAvatarViewModel: { rendererContext: { commandContext: { onTap: {
            innertubeCommand: { browseEndpoint: { browseId: CHANNEL, canonicalBaseUrl: '/@hallandoates' } }
        } } } } } } }
    };
}

/** A page world with one sidebar lockup in it. */
function pageWorld() {
    const attributes = new Map();
    const observers = new Set();
    const windowListeners = new Map();
    const documentListeners = new Map();
    const fire = (name) => {
        for (const observer of [...observers]) {
            if (observer.active && observer.options?.attributes) observer.callback([{ type: 'attributes', attributeName: name }]);
        }
    };
    const lockupAttributes = new Map();
    const lockup = {
        nodeType: 1,
        tagName: 'YT-LOCKUP-VIEW-MODEL',
        componentProps: { data: () => viewModel() },
        getAttribute: (name) => (lockupAttributes.has(name) ? lockupAttributes.get(name) : null),
        setAttribute: (name, value) => lockupAttributes.set(name, String(value)),
        closest: (selector) => (selector === 'yt-lockup-view-model' ? lockup : null),
        querySelectorAll: () => []
    };
    const documentElement = {
        nodeType: 1,
        tagName: 'HTML',
        getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
        setAttribute(name, value) { attributes.set(name, String(value)); fire(name); },
        removeAttribute(name) { if (attributes.delete(name)) fire(name); },
        hasAttribute: (name) => attributes.has(name),
        closest: () => null,
        querySelectorAll: (selector) => (selector === 'yt-lockup-view-model' ? [lockup] : []),
        classList: { add() {}, remove() {}, contains() { return false; } },
        style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } }
    };
    class FakeMutationObserver {
        constructor(callback) { this.callback = callback; this.active = false; observers.add(this); }
        observe(_target, options) { this.active = true; this.options = options; }
        disconnect() { this.active = false; }
        takeRecords() { return []; }
    }
    const addListener = (registry, type, callback) => {
        if (!registry.has(type)) registry.set(type, []);
        registry.get(type).push(callback);
    };
    const context = {
        MutationObserver: FakeMutationObserver,
        MediaSource: { isTypeSupported: () => true },
        HTMLVideoElement: function HTMLVideoElement() {},
        HTMLMediaElement: function HTMLMediaElement() {},
        YTKitCore: {},
        document: {
            documentElement,
            readyState: 'complete',
            querySelector: () => null,
            querySelectorAll: (selector) => documentElement.querySelectorAll(selector),
            getElementById: () => null,
            addEventListener: (type, callback) => addListener(documentListeners, type, callback),
            removeEventListener() {}
        },
        location: { href: `https://www.youtube.com/watch?v=${VIDEO}`, pathname: '/watch', search: `?v=${VIDEO}` },
        navigator: { userAgent: 'node' },
        console, Promise, Math, Number, Set, Map, WeakMap, WeakSet, Date, Infinity, Array, Object, String, Boolean,
        Error, TypeError, RangeError, Symbol, Reflect, Proxy, RegExp, Uint8Array, parseInt, parseFloat, isFinite,
        setTimeout(callback) { callback(); return 1; },
        clearTimeout() {},
        setInterval() { return 1; },
        clearInterval() {},
        queueMicrotask: (callback) => callback(),
        requestAnimationFrame: () => 1,
        cancelAnimationFrame() {}
    };
    context.HTMLVideoElement.prototype = { canPlayType: () => 'probably' };
    context.HTMLMediaElement.prototype = {};
    context.addEventListener = (type, callback) => addListener(windowListeners, type, callback);
    context.removeEventListener = () => {};
    context.dispatchEvent = (event) => {
        for (const callback of windowListeners.get(event.type) || []) callback(event);
        return true;
    };
    context.window = context;
    context.self = context;
    context.globalThis = context;
    context.JSON = { parse: JSON.parse, stringify: JSON.stringify };
    vm.createContext(context);
    const channel = installBridgeChannel(documentElement, context.YTKitCore, { windowListeners, documentListeners });
    return { context, channel, lockup };
}

function tagAfterRules(world, run) {
    run(world.context);
    assert.equal(world.lockup.getAttribute('data-ytkit-lockup-channels'), null, 'no channel rule, no reading');
    world.channel.publish('data-ytkit-lockup-channels-on', 'on');
    return world.lockup.getAttribute('data-ytkit-lockup-channels');
}

test('the extension page world tags a sidebar lockup once a channel rule exists', () => {
    const world = pageWorld();
    const tag = tagAfterRules(world, (context) => {
        vm.runInContext(read('extension/core/injection-guard.js'), context);
        vm.runInContext(read('extension/core/feed-prefilter.js'), context);
        vm.runInContext(read('extension/ytkit-main.js'), context);
    });
    assert.equal(tag, `${VIDEO};${CHANNEL}@hallandoates`);
});

test('the userscript injects the same tagger, with the describer, after the bridge token', () => {
    const build = readUserscriptBuild(read('YTKit.user.js'));
    const pageScripts = build.modules.mainWorld;
    assert.ok(pageScripts.indexOf('core/feed-prefilter.js') > -1
        && pageScripts.indexOf('core/feed-prefilter.js') < pageScripts.indexOf('ytkit-main.js'),
    'the describer loads ahead of ytkit-main.js in the page-world bundle');

    const host = read('userscript/host.js');
    const start = host.indexOf('runModule(BUILD.modules.bridgeToken, contentScope);');
    assert.ok(start > -1 && start < host.indexOf('injectMainWorld();', start),
        'the token is in the page before the page-world scripts read it');

    const world = pageWorld();
    const tag = tagAfterRules(world, (context) => {
        vm.runInContext(read('YTKit-core.user.js'), context, { filename: 'YTKit-core.user.js' });
        const pageWorldBundle = context.__astraDeckUserscriptModules?.[build.mainWorldModule];
        assert.equal(typeof pageWorldBundle, 'function', 'the core library registers the page-world bundle');
        pageWorldBundle();
    });
    assert.equal(tag, `${VIDEO};${CHANNEL}@hallandoates`);
});
