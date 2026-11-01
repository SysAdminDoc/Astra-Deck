'use strict';

// A toast and the page modal enter through @starting-style: the visible class
// goes on with the node, and the stylesheet says where the fade starts. They
// used to wait a frame for it, and a hidden tab doesn't run frames.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { fakeDocument } = require('./helpers/monolith');

const EXTENSION = path.join(__dirname, '..', 'extension');
const ytkit = fs.readFileSync(path.join(EXTENSION, 'ytkit.js'), 'utf8').replace(/\r\n/g, '\n');
const toastDom = fs.readFileSync(path.join(EXTENSION, 'core', 'toast-dom.js'), 'utf8').replace(/\r\n/g, '\n');

function declarations(body) {
    const values = {};
    for (const part of body.split(';')) {
        const colon = part.indexOf(':');
        if (colon > -1) values[part.slice(0, colon).trim()] = part.slice(colon + 1).replace(/\s+/g, ' ').trim();
    }
    return values;
}

function ruleBody(source, selector) {
    const start = source.indexOf(`\n        ${selector} {\n`);
    assert.ok(start > -1, `${selector} must have its own rule`);
    const open = source.indexOf('{', start);
    return declarations(source.slice(open + 1, source.indexOf('}', open)));
}

function startingStyle(source, selector) {
    const blocks = source.split('@starting-style {').slice(1);
    for (const block of blocks) {
        const at = block.indexOf(`${selector} {`);
        const end = block.indexOf('\n        }');
        if (at > -1 && at < end) {
            const open = block.indexOf('{', at);
            return declarations(block.slice(open + 1, block.indexOf('}', open)));
        }
    }
    return null;
}

test('a toast is visible in the same task, with no frame to wait for', () => {
    delete require.cache[require.resolve('../extension/core/toast-dom.js')];
    const saved = {
        YTKitCore: global.YTKitCore,
        document: global.document,
        window: global.window,
        requestAnimationFrame: global.requestAnimationFrame,
    };
    let frames = 0;
    const stub = {};
    global.YTKitCore = stub;
    global.document = fakeDocument(() => []);
    global.window = { matchMedia: () => ({ matches: false }) };
    global.requestAnimationFrame = () => { frames += 1; };
    try {
        require('../extension/core/toast-dom.js');
        const system = stub.toastDom.createToastSystem({ supportsPopover: () => false });
        const toast = system.showToast('Saved', '#22c55e', { duration: 0 });
        assert.equal(toast.classList.contains('is-visible'), true);
        assert.equal(frames, 0);
    } finally {
        Object.assign(global, saved);
    }
});

test('the monolith keeps the same entrance for the userscript', () => {
    for (const source of [toastDom, ytkit]) {
        assert.doesNotMatch(source, /requestAnimationFrame\(\(\) => toast\.classList\.add/);
        assert.match(source, /^\s+toast\.classList\.add\('is-visible'\);$/m);
    }
});

test('a toast starts from the hidden state its own rule describes', () => {
    const base = ruleBody(ytkit, '.ytkit-global-toast');
    const start = startingStyle(ytkit, '.ytkit-global-toast.is-visible');
    assert.ok(start, 'the visible state needs a starting style');
    assert.equal(start.opacity, base.opacity);
    assert.equal(start.transform, base.transform);
});

test('the page modal and its overlay start from their hidden states', () => {
    const modal = ruleBody(ytkit, '.ytkit-pm');
    const modalStart = startingStyle(ytkit, '.ytkit-pm-visible');
    assert.ok(modalStart, 'the modal needs a starting style');
    assert.equal(modalStart.opacity, modal.opacity);
    assert.equal(modalStart.transform, modal.transform);

    const overlay = ruleBody(ytkit, '.ytkit-pm-overlay');
    const overlayStart = startingStyle(ytkit, '.ytkit-pm-ov-visible');
    assert.ok(overlayStart, 'the overlay needs a starting style');
    assert.equal(overlayStart.opacity, overlay.opacity);
});

test('the page modal keeps its place and its fade as a dialog', () => {
    const modal = ruleBody(ytkit, '.ytkit-pm');
    // A closed dialog is display:none by the browser's rule, which would cut
    // the fade off the moment close() runs.
    assert.equal(modal.display, 'block');
    // The browser centers a dialog with these and caps it short of our box.
    assert.equal(modal.margin, '0');
    assert.equal(modal.padding, '0');
    assert.equal(modal['max-width'], 'none');
    assert.equal(modal.left, 'auto');
    assert.equal(modal.bottom, 'auto');
    assert.match(ytkit, /\.ytkit-pm::backdrop \{\s+background: transparent;/,
        'the overlay already paints the dim, and a second one would double it');
});

test('the page modal only waits a frame for focus', () => {
    assert.match(ytkit, /^\s+ov\.classList\.add\('ytkit-pm-ov-visible'\);$/m);
    const at = ytkit.indexOf("modal.classList.add('ytkit-pm-visible');");
    assert.ok(at > -1);
    const after = ytkit.slice(at, at + 260);
    assert.match(after, /requestAnimationFrame\(\(\) => \{\s+\(closeBtn \|\| getFocusableUiElements\(modal\)\[0\]\)\?\.focus/);
    const before = ytkit.slice(at - 60, at);
    assert.doesNotMatch(before, /requestAnimationFrame/);
});
