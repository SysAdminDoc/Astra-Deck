'use strict';

// Regression coverage for the iter-8 N23-extended extraction of the
// SVG icon library + createSVG helper out of ytkit.js into
// extension/core/icons.js (N11 M-phase #6, -326 LOC from ytkit.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const corePath = path.join(repoRoot, 'extension', 'core', 'icons.js');
const ytkitPath = path.join(repoRoot, 'extension', 'ytkit.js');
const manifestPath = path.join(repoRoot, 'extension', 'manifest.json');

// Minimal DOM shim — the icons module needs only createElementNS for SVG.
function installSvgDom() {
    if (typeof globalThis.document !== 'undefined' && globalThis.document.createElementNS) return;
    globalThis.document = {
        createElementNS(_ns, tag) {
            const attrs = {};
            const children = [];
            return {
                _tag: tag,
                _attrs: attrs,
                _children: children,
                setAttribute(k, v) { attrs[k] = String(v); },
                appendChild(child) { children.push(child); return child; }
            };
        }
    };
}

function loadIconsIntoFreshGlobal() {
    installSvgDom();
    globalThis.YTKitCore = {};
    const src = fs.readFileSync(corePath, 'utf8');
    // eslint-disable-next-line no-eval
    (0, eval)(src);
    if (typeof globalThis.YTKitCore.createSVG !== 'function') {
        throw new Error('createSVG not attached to YTKitCore');
    }
    if (typeof globalThis.YTKitCore.ICONS !== 'object') {
        throw new Error('ICONS not attached to YTKitCore');
    }
    return globalThis.YTKitCore;
}

test('core/icons.js attaches createSVG + ICONS to YTKitCore namespace', () => {
    const core = loadIconsIntoFreshGlobal();
    assert.equal(typeof core.createSVG, 'function');
    assert.equal(typeof core.ICONS, 'object');
});

test('ICONS has a non-trivial set of icon factories', () => {
    const core = loadIconsIntoFreshGlobal();
    const keys = Object.keys(core.ICONS);
    // Pre-extraction the inline library carried 80+ named icons; pin a
    // healthy floor so we notice if a future edit deletes half the
    // library by accident.
    assert.ok(keys.length >= 40,
        `ICONS should expose >= 40 named factories, got ${keys.length}`);
    for (const k of keys) {
        assert.equal(typeof core.ICONS[k], 'function',
            `ICONS.${k} must be a factory function`);
    }
});

test('ICONS factory returns a real SVG element with viewBox', () => {
    const core = loadIconsIntoFreshGlobal();
    const svg = core.ICONS.settings();
    assert.equal(svg._tag, 'svg');
    assert.equal(svg._attrs.viewBox, '0 0 24 24');
    assert.ok(svg._children.length > 0,
        'ICONS.settings should append at least one child shape');
});

test('createSVG handles all 6 documented shape types', () => {
    const core = loadIconsIntoFreshGlobal();
    const svg = core.createSVG('0 0 10 10', [
        { type: 'path', d: 'M0 0 L10 10' },
        { type: 'circle', cx: 5, cy: 5, r: 2 },
        { type: 'rect', x: 1, y: 1, width: 3, height: 3 },
        { type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 },
        { type: 'polyline', points: '0,0 5,5 10,0' },
        { type: 'polygon', points: '0,0 10,0 5,10' }
    ]);
    assert.equal(svg._children.length, 6);
    const tags = svg._children.map(c => c._tag);
    assert.deepEqual(tags, ['path', 'circle', 'rect', 'line', 'polyline', 'polygon']);
});

test('createSVG honors options.fill / options.stroke = false', () => {
    const core = loadIconsIntoFreshGlobal();
    // options.stroke === false → no stroke attribute (used by ICONS.github)
    const svg1 = core.createSVG('0 0 10 10', [], { fill: '#ff0000', stroke: false });
    assert.equal(svg1._attrs.fill, '#ff0000');
    assert.equal('stroke' in svg1._attrs, false,
        'stroke attribute must not be set when options.stroke === false');
    // Default: stroke=currentColor, fill=none
    const svg2 = core.createSVG('0 0 10 10', []);
    assert.equal(svg2._attrs.fill, 'none');
    assert.equal(svg2._attrs.stroke, 'currentColor');
});

test('manifest.json loads core/icons.js BEFORE ytkit.js in every ISOLATED entry', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const isoBlocks = manifest.content_scripts.filter(b => b.world === 'ISOLATED');
    assert.ok(isoBlocks.length >= 2,
        'expected at least two ISOLATED content_script entries');
    for (const block of isoBlocks) {
        const idxIcons = block.js.indexOf('core/icons.js');
        const idxYtkit = block.js.indexOf('ytkit.js');
        assert.notEqual(idxIcons, -1, 'core/icons.js missing from content_scripts.js');
        assert.ok(idxIcons < idxYtkit, 'core/icons.js must load before ytkit.js');
    }
});

test('ytkit.js no longer declares the inline `function createSVG(` block', () => {
    const src = fs.readFileSync(ytkitPath, 'utf8');
    // The exact opening of the OLD inline definition.
    assert.equal(src.includes('function createSVG(viewBox, paths, options = {}) {'), false,
        'inline createSVG implementation still present in ytkit.js — extraction is incomplete');
    // The exact opening of the OLD inline ICONS object.
    assert.equal(src.includes("const ICONS = {\n        settings: () => createSVG"), false,
        'inline ICONS const still present in ytkit.js');
    // Confirm the new wire-up references are present.
    assert.ok(src.includes('globalThis.YTKitCore.createSVG'),
        'ytkit.js should reference globalThis.YTKitCore.createSVG');
    assert.ok(src.includes('globalThis.YTKitCore.ICONS'),
        'ytkit.js should reference globalThis.YTKitCore.ICONS');
});
