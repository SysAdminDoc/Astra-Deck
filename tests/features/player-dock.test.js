'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sources } = require('../helpers/source');
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

test('Player Dock renders one accessible control group and tears it down', () => {
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;
    const rightControls = fakeNode({ tag: 'div', attributes: { class: 'ytp-right-controls' } });
    const nativeCc = fakeNode({ tag: 'button', attributes: { 'aria-pressed': 'true' } });
    const documentRef = fakeTreeDocument((selector) => {
        if (selector === '.ytp-right-controls') return rightControls;
        if (selector === '#movie_player .ytp-subtitles-button' || selector === '.ytp-subtitles-button') return nativeCc;
        return null;
    });
    documentRef.body.appendChild(rightControls);
    globalThis.document = documentRef;
    globalThis.window = { location: { pathname: '/watch' } };
    try {
        const module = require('../../extension/features/player-dock/index.js');
        const feature = module.createFloatingLogoOnWatchFeature({
            appState: { settings: { showLocalDownloadButton: true, persistentSpeedValue: 1.5 } },
            getFeatureById: () => null,
            ICONS: new Proxy({}, { get: () => () => fakeNode({ tag: 'svg' }) }),
            t: (_key, fallback) => fallback,
            BRAND: { name: 'Astra Deck' }
        });

        feature._inject();
        feature._inject();

        assert.equal(rightControls.children.length, 1, 'repeat injection reuses the control group');
        const controls = rightControls.children[0];
        assert.equal(controls.id, 'ytkit-player-controls');
        assert.equal(controls.children.length, 5);
        const download = controls.querySelector('.ytkit-po-dl');
        assert.equal(download.getAttribute('aria-haspopup'), 'dialog');
        assert.equal(download.getAttribute('aria-expanded'), 'false');
        const cc = controls.querySelector('.ytkit-po-cc');
        assert.equal(cc.textContent, 'CC');
        assert.equal(cc.getAttribute('aria-label'), 'Toggle closed captions');
        assert.equal(cc.getAttribute('aria-pressed'), 'true');
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

test('the userscript Player Dock keeps its CC mirror contract', () => {
    const coreSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'YTKit-core.user.js'), 'utf8');
    assert.match(coreSrc, /ytkit-po-cc/);
    assert.match(coreSrc, /\.ytp-subtitles-button/);
    assert.match(coreSrc, /nativeButton\.click\(\)/);
    assert.match(coreSrc, /aria-pressed/);
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
    const coreSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'YTKit-core.user.js'), 'utf8');
    for (const [label, source] of [
        ['module', fs.readFileSync(
            path.join(__dirname, '..', '..', 'extension', 'features', 'player-dock', 'index.js'), 'utf8')],
        ['userscript core', coreSrc]
    ]) {
        const watchStart = source.indexOf('_watchCcState()');
        const watchBody = source.slice(watchStart, watchStart + 1400);
        assert.match(watchBody, /if \(!this\._ccButton\) return;/,
            `${label} must bail out of the CC observer when no mirror button is mounted`);
        assert.ok(
            watchBody.indexOf('if (!this._ccButton) return;') < watchBody.indexOf('new MutationObserver'),
            `${label} must bail out before constructing the observer`
        );
    }
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
