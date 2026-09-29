'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const EXTENSION = path.join(__dirname, '..', 'extension');

function loadIcons() {
    const node = (tag) => ({
        tag,
        attrs: {},
        children: [],
        style: { setProperty() {} },
        setAttribute(key, value) { this.attrs[key] = value; },
        appendChild(child) { this.children.push(child); },
        querySelectorAll() { return []; },
    });
    const previousDocument = globalThis.document;
    const previousCore = globalThis.YTKitCore;
    globalThis.document = { createElementNS: (_ns, tag) => node(tag) };
    globalThis.YTKitCore = {};
    try {
        const source = fs.readFileSync(path.join(EXTENSION, 'core', 'icons.js'), 'utf8');
        new Function(source)();
        return globalThis.YTKitCore.ICONS;
    } finally {
        globalThis.document = previousDocument;
        globalThis.YTKitCore = previousCore;
    }
}

function sourceFiles() {
    const files = [path.join(EXTENSION, 'ytkit.js')];
    for (const dir of ['core', 'features']) {
        for (const entry of fs.readdirSync(path.join(EXTENSION, dir), { recursive: true })) {
            if (String(entry).endsWith('.js')) files.push(path.join(EXTENSION, dir, String(entry)));
        }
    }
    return files;
}

// Feature definitions name their icon with a Lucide id, and the settings
// panel draws ICONS[feature.icon] || ICONS.settings. Before this gate, 95 of
// those names were missing, so 161 settings rows all drew the same gear.
test('every icon a feature or category names exists in ICONS', () => {
    const icons = loadIcons();
    const missing = [];
    for (const file of sourceFiles()) {
        const source = fs.readFileSync(file, 'utf8');
        for (const match of source.matchAll(/^\s+icon: '([^']+)'/gm)) {
            if (typeof icons[match[1]] !== 'function') {
                missing.push(`${path.relative(EXTENSION, file)}: ${match[1]}`);
            }
        }
    }
    assert.deepEqual(missing, [], 'add the glyph to core/icons.js or use an existing name');
});

test('every icon renders only attributes it was given', () => {
    const document = globalThis.document;
    const icons = loadIcons();
    const created = [];
    globalThis.document = {
        createElementNS: (_ns, tag) => {
            const el = {
                tag,
                attrs: {},
                setAttribute(key, value) { this.attrs[key] = value; },
                appendChild() {},
            };
            created.push(el);
            return el;
        },
    };
    try {
        for (const [name, render] of Object.entries(icons)) {
            created.length = 0;
            render();
            const parts = created.filter((el) => el.tag !== 'svg');
            assert.ok(parts.length > 0, `${name} draws nothing`);
            for (const part of parts) {
                for (const [key, value] of Object.entries(part.attrs)) {
                    assert.notEqual(String(value), 'undefined', `${name} <${part.tag}> has ${key}="undefined"`);
                }
            }
        }
    } finally {
        globalThis.document = document;
    }
});
