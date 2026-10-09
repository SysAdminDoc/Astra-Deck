'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sources, userscriptBundles } = require('../helpers/source');
const fs = require('fs');
const path = require('path');
const { fakeNode, fakeTreeDocument } = require('../helpers/monolith');

test('Player Dock monolith fallback stays as a descriptor stub', () => {
    const factoryIndex = sources.ytkit.indexOf(
        'globalThis.YTKitFeatures?.floatingLogoOnWatch?.createFloatingLogoOnWatchFeature?.({'
    );
    const fallbackIndex = sources.ytkit.indexOf("id: 'floatingLogoOnWatch'", factoryIndex);
    const stubEnd = sources.ytkit.indexOf('\n        }),', fallbackIndex);
    assert.ok(factoryIndex > -1 && fallbackIndex > factoryIndex && stubEnd > fallbackIndex,
        'ytkit.js must keep a bounded Player Dock fallback after the module factory');
    const block = sources.ytkit.slice(fallbackIndex, stubEnd);
    assert.ok(block.length < 1200,
        `floatingLogoOnWatch fallback must stay a descriptor stub, got ${block.length} bytes`);
    assert.match(block, /Feature module unavailable/,
        'floatingLogoOnWatch fallback must report a missing module');
    assert.doesNotMatch(block, /_inject\(|appendStyleSheet\(`/,
        'floatingLogoOnWatch fallback must not carry the runtime body');
});

test('Player Dock peeled module exports a factory function', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'player-dock', 'index.js'), 'utf8');
    assert.match(modSrc, /createFloatingLogoOnWatchFeature/,
        'Module must export a createFloatingLogoOnWatchFeature factory');
    assert.match(modSrc, /YTKitFeatures/,
        'Module must register on the YTKitFeatures namespace');
});

function playerDock() {
    return require('../../extension/features/player-dock/index.js').createFloatingLogoOnWatchFeature({
        appState: { settings: { showLocalDownloadButton: true, persistentSpeedValue: 1.5 } },
        getFeatureById: () => null,
        ICONS: new Proxy({}, { get: () => () => fakeNode({ tag: 'svg' }) }),
        t: (_key, fallback) => fallback,
        BRAND: { name: 'Astra Deck' }
    });
}

test('Player Dock goes into the watch player, not the hover preview that comes first', () => {
    // The home feed's inline preview player precedes ytd-page-manager and has
    // its own .ytp-right-controls. A dock put there left the real player with
    // its native controls hidden and nothing in their place.
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;
    const previewControls = fakeNode({ tag: 'div', attributes: { class: 'ytp-right-controls' } });
    const watchControls = fakeNode({ tag: 'div', attributes: { class: 'ytp-right-controls' } });
    const documentRef = fakeTreeDocument((selector) => {
        if (selector === '.ytp-right-controls') return previewControls;
        if (selector === '#movie_player .ytp-right-controls') return watchControls;
        return null;
    });
    documentRef.body.appendChild(previewControls);
    documentRef.body.appendChild(watchControls);
    const stray = fakeNode({ tag: 'div', attributes: { id: 'ytkit-player-controls' } });
    previewControls.appendChild(stray);
    globalThis.document = documentRef;
    globalThis.window = { location: { pathname: '/watch' } };
    try {
        const feature = playerDock();
        feature._inject();
        assert.equal(previewControls.children.length, 0, 'a dock left in the preview player is taken out');
        assert.equal(watchControls.children.length, 1);
        assert.equal(watchControls.children[0].id, 'ytkit-player-controls');
        assert.ok(watchControls.children[0].querySelector('.ytkit-po-gear'), 'it is a freshly built dock');
        feature.destroy();
    } finally {
        globalThis.document = originalDocument;
        globalThis.window = originalWindow;
    }
});

test('Player Dock renders one accessible control group and tears it down', () => {
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;
    const rightControls = fakeNode({ tag: 'div', attributes: { class: 'ytp-right-controls' } });
    const nativeCc = fakeNode({ tag: 'button', attributes: { 'aria-pressed': 'true' } });
    const documentRef = fakeTreeDocument((selector) => {
        if (selector === '#movie_player .ytp-right-controls') return rightControls;
        if (selector === '#movie_player .ytp-subtitles-button' || selector === '.ytp-subtitles-button') return nativeCc;
        return null;
    });
    documentRef.body.appendChild(rightControls);
    globalThis.document = documentRef;
    globalThis.window = { location: { pathname: '/watch' } };
    try {
        const feature = playerDock();

        feature._inject();
        feature._inject();

        assert.equal(rightControls.children.length, 1, 'repeat injection reuses the control group');
        const controls = rightControls.children[0];
        assert.equal(controls.id, 'ytkit-player-controls');
        assert.equal(controls.children.length, 6);
        const download = controls.querySelector('.ytkit-po-dl');
        assert.equal(download.getAttribute('aria-haspopup'), 'dialog');
        assert.equal(download.getAttribute('aria-expanded'), 'false');
        const cc = controls.querySelector('.ytkit-po-cc');
        assert.equal(cc.textContent, 'CC');
        assert.equal(cc.getAttribute('aria-label'), 'Toggle closed captions');
        assert.equal(cc.getAttribute('aria-pressed'), 'true');
        const repeat = controls.querySelector('.ytkit-po-repeat');
        assert.equal(repeat.getAttribute('aria-label'), 'Toggle repeat');
        assert.equal(repeat.getAttribute('aria-pressed'), 'false');
        const speed = controls.querySelector('.ytkit-po-speed');
        assert.match(speed.textContent, /1\.5/);
        assert.equal(speed.getAttribute('aria-haspopup'), 'menu');
        const gear = controls.querySelector('.ytkit-po-gear');
        assert.equal(gear.getAttribute('aria-label'), 'Open Astra Deck settings');

        const click = [...cc.listeners.get('click')][0];
        click({ stopPropagation() {} });
        assert.equal(nativeCc.clicked, 1, 'the rendered mirror delegates to YouTube\'s control');

        feature.destroy();
        assert.equal(rightControls.children.length, 0);
        assert.equal(feature._ccButton, null);
    } finally {
        globalThis.document = originalDocument;
        globalThis.window = originalWindow;
    }
});

// The userscript used to carry its own Player Dock copy, so its CC mirror
// contract was pinned separately. It now runs this module, so the render and
// aria-pressed tests here cover both vehicles.
test('the userscript runs the same Player Dock, CC mirror included', () => {
    assert.ok(userscriptBundles('features/player-dock/index.js'),
        'the userscript must ship the Player Dock module');
});

test('Player Dock speed picker wakes persistent speed reapply task', () => {
    assert.match(sources.ytkit, /f\._scheduleApply\?\.\(0,\s*'player-dock'\)/,
        'speed popup must wake persistentSpeed after changing the default speed');
    assert.match(sources.ytkit, /const video = getMainVideoElement\(\);[\s\S]{0,240}video\.playbackRate = value/,
        'speed popup must apply to the canonical main video element');
});

test('CC mirror prefers the watch player over an earlier inline preview player', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'player-dock', 'index.js'), 'utf8');

    // Drive the real resolver rather than pinning its text: a selector LIST
    // resolves in document order, so the unscoped fallback would win whenever
    // the inline hover-preview player (which precedes ytd-page-manager) owns an
    // instantiated subtitles button.
    const previewButton = { id: 'preview' };
    const watchButton = { id: 'watch' };
    const fakeDocument = {
        querySelector(selector) {
            if (selector === '#movie_player .ytp-subtitles-button') return watchButton;
            if (selector === '.ytp-subtitles-button') return previewButton;
            return null;
        }
    };

    const body = modSrc.match(/_getNativeCcButton\(\)\s*\{([\s\S]*?)\n {12}\},/);
    assert.ok(body, 'module must define _getNativeCcButton');
    const resolve = new Function('document', body[1].replace(/typeof document === 'undefined'/, 'false'));
    assert.equal(resolve(fakeDocument), watchButton,
        'CC mirror must bind the #movie_player subtitles button, not the first one in the document');

    const onlyPreview = { querySelector: (s) => (s === '.ytp-subtitles-button' ? previewButton : null) };
    assert.equal(resolve(onlyPreview), previewButton,
        'CC mirror must still fall back when the watch player is not scoped yet');
});

test('CC observer does not attach before the mirror button exists', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'player-dock', 'index.js'), 'utf8');
    const watchStart = source.indexOf('_watchCcState()');
    const watchBody = source.slice(watchStart, watchStart + 1400);
    assert.match(watchBody, /if \(!this\._ccButton\) return;/,
        'module must bail out of the CC observer when no mirror button is mounted');
    assert.ok(
        watchBody.indexOf('if (!this._ccButton) return;') < watchBody.indexOf('new MutationObserver'),
        'module must bail out before constructing the observer'
    );
});

test('CC mirror follows native aria-pressed state in both directions', () => {
    const mod = require('../../extension/features/player-dock/index.js');
    const native = {
        ariaPressed: 'true',
        getAttribute(name) { return name === 'aria-pressed' ? this.ariaPressed : null; },
        classList: { contains: () => false }
    };
    const mirrorClasses = new Set();
    const mirror = {
        attrs: {},
        classList: {
            toggle(name, force) { if (force) mirrorClasses.add(name); else mirrorClasses.delete(name); },
            contains: (name) => mirrorClasses.has(name)
        },
        getAttribute(name) { return this.attrs[name] ?? null; },
        setAttribute(name, value) { this.attrs[name] = String(value); }
    };
    const originalDocument = globalThis.document;
    globalThis.document = {
        querySelector(selector) {
            return selector === '#movie_player .ytp-subtitles-button' ? native : null;
        }
    };
    try {
        const feature = mod.createFloatingLogoOnWatchFeature({
            appState: { settings: {} },
            getFeatureById: () => null,
            t: (_key, fallback) => fallback
        });
        feature._ccButton = mirror;

        feature._syncCcButton();
        assert.equal(mirror.getAttribute('aria-pressed'), 'true');
        assert.equal(mirror.classList.contains('ytkit-po-cc--active'), true);

        native.ariaPressed = 'false';
        feature._syncCcButton();
        assert.equal(mirror.getAttribute('aria-pressed'), 'false');
        assert.equal(mirror.classList.contains('ytkit-po-cc--active'), false);
    } finally {
        globalThis.document = originalDocument;
    }
});

function fakeRepeatPlayer() {
    const classes = new Set();
    const player = {
        classList: {
            contains: (name) => classes.has(name),
            add: (name) => classes.add(name),
            remove: (name) => classes.delete(name)
        }
    };
    const makeVideo = () => ({ loop: false, closest: (selector) => (selector === '.html5-video-player' ? player : null) });
    return { player, makeVideo };
}

function withFakeMutationObserver(run) {
    const original = globalThis.MutationObserver;
    const observers = [];
    globalThis.MutationObserver = class {
        constructor(callback) { this.callback = callback; this.targets = []; this.connected = true; observers.push(this); }
        observe(target, options) { this.targets.push({ target, options }); }
        disconnect() { this.connected = false; }
    };
    const live = () => observers.filter((o) => o.connected);
    const fire = () => live().forEach((o) => o.callback([]));
    try {
        return run({ fire, live });
    } finally {
        if (original === undefined) delete globalThis.MutationObserver;
        else globalThis.MutationObserver = original;
    }
}

test('Repeat keeps the main video looping, steps aside for ads, and lets go when turned off', () => {
    const mod = require('../../extension/features/player-dock/index.js');
    withFakeMutationObserver(({ fire, live }) => {
        const { player, makeVideo } = fakeRepeatPlayer();
        let video = makeVideo();
        const toasts = [];
        const feature = mod.createFloatingLogoOnWatchFeature({
            appState: { settings: {} },
            t: (_key, fallback) => fallback,
            getMainVideoElement: () => video,
            showToast: (message) => toasts.push(message)
        });

        feature._toggleRepeat();
        assert.equal(video.loop, true, 'turning repeat on loops the main video');
        assert.deepEqual(toasts, ['Repeat on']);
        const observed = live()[0].targets.map((entry) => entry.target);
        assert.ok(observed.includes(video) && observed.includes(player),
            'repeat watches the video loop flag and the player ad class');

        video.loop = false;
        fire();
        assert.equal(video.loop, true, 'repeat re-asserts loop when the player clears it for the next video');

        player.classList.add('ad-showing');
        fire();
        assert.equal(video.loop, false, 'an ad in the same element must never loop');
        player.classList.remove('ad-showing');
        fire();
        assert.equal(video.loop, true, 'repeat comes back once the ad ends');

        const previous = video;
        video = makeVideo();
        feature._applyRepeat();
        assert.equal(previous.loop, false, 'a replaced element is released');
        assert.equal(video.loop, true, 'the new main video picks up repeat');

        feature._toggleRepeat();
        assert.equal(video.loop, false, 'turning repeat off stops the loop');
        assert.equal(live().length, 0, 'no observer survives repeat being off');
        assert.deepEqual(toasts, ['Repeat on', 'Repeat off']);

        video.loop = true;
        feature._applyRepeat();
        assert.equal(video.loop, true, 'with repeat off, a loop YouTube set itself is left alone');
    });
});

test('Repeat button mirrors the mode and the dock teardown releases the loop', () => {
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;
    const rightControls = fakeNode({ tag: 'div', attributes: { class: 'ytp-right-controls' } });
    const documentRef = fakeTreeDocument((selector) => (selector === '#movie_player .ytp-right-controls' ? rightControls : null));
    documentRef.body.appendChild(rightControls);
    globalThis.document = documentRef;
    globalThis.window = { location: { pathname: '/watch' } };
    try {
        const { makeVideo } = fakeRepeatPlayer();
        const video = makeVideo();
        const module = require('../../extension/features/player-dock/index.js');
        const feature = module.createFloatingLogoOnWatchFeature({
            appState: { settings: {} },
            ICONS: new Proxy({}, { get: () => () => fakeNode({ tag: 'svg' }) }),
            t: (_key, fallback) => fallback,
            getMainVideoElement: () => video
        });
        feature._inject();
        const repeat = rightControls.children[0].querySelector('.ytkit-po-repeat');
        const click = [...repeat.listeners.get('click')][0];

        click({ stopPropagation() {} });
        assert.equal(repeat.getAttribute('aria-pressed'), 'true');
        assert.equal(repeat.classList.contains('ytkit-po-repeat--active'), true);
        assert.equal(video.loop, true);

        feature.destroy();
        assert.equal(video.loop, false, 'disabling the dock must not leave the video looping');
        assert.equal(feature._repeatOn, false);
        assert.equal(feature._repeatButton, null);
    } finally {
        globalThis.document = originalDocument;
        globalThis.window = originalWindow;
    }
});
