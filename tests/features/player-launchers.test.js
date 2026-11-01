'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFeature, fakeNode, fakeDocument } = require('../helpers/monolith');

const LAUNCHERS = [
    { name: 'Transcript Q&A', id: 'localAiTranscriptQa', launcher: 'ytkit-ai-qa-btn', opens: '_openQaPanel' },
    { name: 'Local Summary', id: 'localAiSummary', launcher: 'ytkit-local-ai-launcher', opens: '_summarize' }
];

const hasClass = (node, name) => String(node.className || '').split(/\s+/).includes(name);

function controlBar() {
    const bar = fakeNode({ tag: 'div' });
    bar.querySelector = (selector) => bar.children.find((child) => hasClass(child, selector.slice(1))) || null;
    return bar;
}

function makeLauncher(row, { watch = true, controls = controlBar(), elsewhere = [] } = {}) {
    const state = { controls, watch };
    const rules = { navigate: new Map(), mutation: new Map() };
    const timers = new Map();
    let scheduled = 0;
    const doc = fakeDocument((selector) => {
        if (selector === '.ytp-right-controls') return state.controls ? [state.controls] : [];
        const wanted = selector.split(',').map((part) => part.trim().slice(1));
        return [...(state.controls?.children || []), ...elsewhere]
            .filter((node) => node.isConnected && wanted.some((name) => hasClass(node, name)));
    });
    const create = doc.createElement.bind(doc);
    doc.createElement = (tag) => {
        const node = create(tag);
        node.handlers = new Map();
        node.addEventListener = (type, handler) => node.handlers.set(type, handler);
        return node;
    };
    const feature = loadFeature(row.id, {
        document: doc,
        window: {},
        YTKitCore: {},
        isWatchPagePath: () => state.watch,
        injectStyle: () => fakeNode(),
        addNavigateRule: (id, fn) => rules.navigate.set(id, fn),
        removeNavigateRule: (id) => rules.navigate.delete(id),
        addMutationRule: (id, fn) => rules.mutation.set(id, fn),
        removeMutationRule: (id) => rules.mutation.delete(id),
        setTimeout: (fn) => {
            scheduled += 1;
            timers.set(scheduled, fn);
            return scheduled;
        },
        clearTimeout: (handle) => timers.delete(handle)
    });
    const runTimers = () => {
        const due = [...timers.values()];
        timers.clear();
        due.forEach((fn) => fn());
    };
    return {
        feature,
        rules,
        runTimers,
        state,
        timers,
        launchers: () => (state.controls?.children || []).filter((node) => hasClass(node, row.launcher)),
        mutate: () => rules.mutation.get(row.id)(),
        scheduled: () => scheduled
    };
}

for (const row of LAUNCHERS) {
    test(`${row.name} joins the player controls with no other player button to sit beside`, () => {
        const controls = controlBar();
        controls.appendChild(fakeNode({ tag: 'div', attributes: { id: 'youtube-own' } }));
        const harness = makeLauncher(row, { controls });

        harness.feature.init();
        harness.runTimers();

        assert.equal(harness.launchers().length, 1);
        const first = controls.children[0];
        assert.ok(hasClass(first, row.launcher), 'the launcher goes in front of YouTube\'s own controls');
        for (const name of ['ytp-button', 'ytkit-player-btn', 'ytkit-player-btn--text']) {
            assert.ok(hasClass(first, name), `${name} gives it the player button look`);
        }
    });

    test(`${row.name} attaches when the player shows up after the first try`, () => {
        const harness = makeLauncher(row, { controls: null });

        harness.feature.init();
        harness.runTimers();
        assert.equal(harness.timers.size, 0, 'nothing is left retrying on a timer');

        harness.state.controls = controlBar();
        harness.mutate();
        harness.runTimers();

        assert.equal(harness.launchers().length, 1);
    });

    test(`${row.name} leaves its running timer alone while the page keeps mutating`, () => {
        const harness = makeLauncher(row, { controls: null });
        harness.feature.init();
        const afterInit = harness.scheduled();

        for (let i = 0; i < 5; i += 1) harness.mutate();

        assert.equal(harness.scheduled(), afterInit, 'a restarted timer would never fire during a busy load');
        assert.equal(harness.timers.size, 1);
    });

    test(`${row.name} never adds a second launcher`, () => {
        const harness = makeLauncher(row);
        harness.feature.init();
        harness.runTimers();
        const afterAttach = harness.scheduled();

        harness.mutate();
        assert.equal(harness.scheduled(), afterAttach, 'a launcher already in place schedules nothing');

        harness.feature._navRule();
        harness.runTimers();
        harness.feature._attach();

        assert.equal(harness.launchers().length, 1);
    });

    test(`${row.name} comes back when YouTube rebuilds the control bar`, () => {
        const harness = makeLauncher(row);
        harness.feature.init();
        harness.runTimers();

        harness.state.controls = controlBar();
        harness.mutate();
        harness.runTimers();

        assert.equal(harness.launchers().length, 1);
    });

    test(`${row.name} stays out of pages that aren't a watch page`, () => {
        const harness = makeLauncher(row, { watch: false });
        harness.feature.init();
        harness.runTimers();
        const afterInit = harness.scheduled();

        harness.mutate();
        harness.runTimers();

        assert.equal(harness.scheduled(), afterInit);
        assert.equal(harness.launchers().length, 0);
    });

    test(`${row.name} opens from a click the player never hears`, () => {
        const harness = makeLauncher(row);
        harness.feature.init();
        harness.runTimers();
        let opened = 0;
        let stopped = 0;
        harness.feature[row.opens] = () => { opened += 1; };

        harness.launchers()[0].handlers.get('click')({ stopPropagation: () => { stopped += 1; } });

        assert.equal(opened, 1);
        assert.equal(stopped, 1);
    });

    test(`${row.name} clears its rules, its timer and its launcher on the way out`, () => {
        const harness = makeLauncher(row);
        harness.feature.init();
        harness.runTimers();
        const launcher = harness.launchers()[0];
        harness.feature._navRule();
        assert.equal(harness.timers.size, 1, 'a pending retry to clear');

        harness.feature.destroy();

        assert.equal(harness.rules.navigate.size, 0);
        assert.equal(harness.rules.mutation.size, 0);
        assert.equal(harness.timers.size, 0);
        assert.equal(launcher.isConnected, false);
    });
}

test('Local Summary leaves the study export buttons that share its pill style', () => {
    const exportButton = fakeNode({ tag: 'button' });
    exportButton.className = 'ytkit-spaced-export-btn ytkit-local-ai-btn';
    const row = LAUNCHERS.find((entry) => entry.id === 'localAiSummary');
    const harness = makeLauncher(row, { elsewhere: [exportButton] });
    harness.feature.init();
    harness.runTimers();

    harness.feature.destroy();

    assert.equal(exportButton.isConnected, true);
});
