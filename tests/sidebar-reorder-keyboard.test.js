'use strict';

// The sidebar order is a persisted preference that could only be set by
// dragging. `addDragReorder` binds dragstart/dragover/drop and nothing else, so
// a keyboard user could see the order and never change it, and a user without
// a precise pointer could not either.
//
// The panel module is a factory too large to mount here, so the three functions
// that do the reordering are lifted out and run against a fake nav list. That
// is the shipped logic, not a restatement of it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const panelPath = path.join(repoRoot, 'extension', 'features', 'settings-panel', 'index.js');
const source = fs.readFileSync(panelPath, 'utf8');

function loadReorder(tabs, { active = 0 } = {}) {
    const start = source.indexOf('        function selectedNavBtn() {');
    const end = source.indexOf('        navList.addEventListener(\'click\'', start);
    assert.ok(start > -1 && end > start, 'the reorder functions must still be in the panel module');
    const body = source.slice(start, end);

    const order = tabs.slice();
    const nodes = order.map((id, index) => ({
        dataset: { tab: id },
        classList: {
            contains: (name) => name === 'active' && nodes.indexOf(node(index)) === activeIndex.value
        },
        focused: 0,
        focus() { this.focused += 1; },
        before(other) { move(other, nodes.indexOf(this)); },
        after(other) { move(other, nodes.indexOf(this) + 1); }
    }));
    function node(index) { return nodes[index]; }
    const activeIndex = { value: active };

    function move(target, to) {
        const from = nodes.indexOf(target);
        if (from < 0) return;
        const wasActive = from === activeIndex.value;
        nodes.splice(from, 1);
        const insertAt = from < to ? to - 1 : to;
        nodes.splice(insertAt, 0, target);
        if (wasActive) activeIndex.value = nodes.indexOf(target);
    }

    const navList = {
        querySelector: (selector) => (selector.includes('.active')
            ? nodes[activeIndex.value] || null
            : nodes[0] || null),
        querySelectorAll: () => nodes.slice()
    };

    const saved = [];
    const toasts = [];
    const sandbox = {
        console,
        navList,
        appState: { settings: {} },
        settingsManager: { save: (settings) => saved.push(JSON.parse(JSON.stringify(settings))) },
        showToast: (message) => toasts.push(message),
        t: (_key, fallback) => fallback,
        moveUpBtn: { disabled: false },
        moveDownBtn: { disabled: false }
    };
    sandbox.globalThis = sandbox;
    const api = vm.runInNewContext(
        '(() => {' + body
        + 'return { moveSelectedCategory, syncReorderButtons, selectedNavBtn };})()',
        sandbox
    );
    return { api, sandbox, nodes, saved, toasts, order: () => nodes.map((n) => n.dataset.tab), activeIndex };
}

const CATS = ['Playback', 'Shell', 'Comments', 'Downloads'];

// WHEN the move-down control is used, the selected category SHALL move one
// place down and the new order SHALL be persisted — the same write the drop
// handler makes, so the two paths cannot disagree about what the order is.
test('moving a category down reorders it and saves', () => {
    const { api, nodes, saved, order } = loadReorder(CATS, { active: 0 });
    assert.equal(api.moveSelectedCategory(1), true);
    assert.deepEqual(order(), ['Shell', 'Playback', 'Comments', 'Downloads']);
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0].sidebarOrder, ['Shell', 'Playback', 'Comments', 'Downloads']);
    assert.equal(nodes[1].focused, 1,
        'focus follows the category, or the next press moves whatever landed here');
});

test('moving a category up reorders it and saves', () => {
    const { api, saved, order } = loadReorder(CATS, { active: 2 });
    assert.equal(api.moveSelectedCategory(-1), true);
    assert.deepEqual(order(), ['Playback', 'Comments', 'Shell', 'Downloads']);
    assert.deepEqual(saved[0].sidebarOrder, ['Playback', 'Comments', 'Shell', 'Downloads']);
});

// WHEN the selection is already at an end, the move SHALL be refused rather
// than silently wrapping or writing an unchanged order.
test('the ends refuse to move further, and write nothing', () => {
    const top = loadReorder(CATS, { active: 0 });
    assert.equal(top.api.moveSelectedCategory(-1), false);
    assert.deepEqual(top.order(), CATS);
    assert.deepEqual(top.saved, []);

    const bottom = loadReorder(CATS, { active: 3 });
    assert.equal(bottom.api.moveSelectedCategory(1), false);
    assert.deepEqual(bottom.order(), CATS);
    assert.deepEqual(bottom.saved, []);
});

// WHEN the selection sits at an end, the control for that direction SHALL be
// disabled, so the state is visible rather than discovered by pressing.
test('the controls disable themselves at the ends', () => {
    const top = loadReorder(CATS, { active: 0 });
    top.api.syncReorderButtons();
    assert.equal(top.sandbox.moveUpBtn.disabled, true);
    assert.equal(top.sandbox.moveDownBtn.disabled, false);

    const middle = loadReorder(CATS, { active: 1 });
    middle.api.syncReorderButtons();
    assert.equal(middle.sandbox.moveUpBtn.disabled, false);
    assert.equal(middle.sandbox.moveDownBtn.disabled, false);

    const bottom = loadReorder(CATS, { active: 3 });
    bottom.api.syncReorderButtons();
    assert.equal(bottom.sandbox.moveUpBtn.disabled, false);
    assert.equal(bottom.sandbox.moveDownBtn.disabled, true);
});

test('a successful move says so', () => {
    const { api, toasts } = loadReorder(CATS, { active: 1 });
    api.moveSelectedCategory(1);
    assert.deepEqual(toasts, ['Category moved.']);
});

// The controls are real buttons in the sidebar, reachable by tab, and they are
// NOT inside the tablist — a tablist's children have to be tabs.
test('the reorder controls are buttons outside the tablist', () => {
    assert.match(source, /reorderBar\.setAttribute\('role', 'group'\)/,
        'the pair is a group, not a second tablist');
    assert.match(source, /button\.type = 'button';/);
    assert.match(source, /sidebar\.appendChild\(reorderBar\);\s*\n\s*sidebar\.appendChild\(navList\);/,
        'the controls sit beside the tablist, not inside it');
    assert.match(source, /button\.setAttribute\('aria-label', t\(labelKey, fallback\)\)/,
        'an arrow glyph is not a name');
});

// The drop path keeps the buttons honest, or dragging leaves them stale.
test('a drop refreshes the control state', () => {
    const dropStart = source.indexOf("btn.addEventListener('drop'");
    assert.ok(dropStart > -1, 'the drag path must still exist');
    const dropBlock = source.slice(dropStart, dropStart + 1400);
    assert.match(dropBlock, /syncReorderButtons\(\)/,
        'after a drag the ends have moved, and the buttons have to know');
});
