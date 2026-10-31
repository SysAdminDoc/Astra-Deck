'use strict';

// Keep Volume At Full turns YouTube's Stable Volume off from the MAIN world.
// The numbers the player uses (1 on, anything else off) and the menu markup
// come from real watch pages: the fixture's class and role are what de, ar and
// ja all served, and only the label changes with the language.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { installBridgeChannel } = require('./helpers/main-bridge');

const repoRoot = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit-main.js'), 'utf8');
const guardSource = fs.readFileSync(path.join(repoRoot, 'extension', 'core', 'injection-guard.js'), 'utf8');
const ATTR = 'data-ytkit-stable-volume';
const RESTORE_KEY = 'ytkit-stable-volume-restore';

function playerWithSwitch(pref) {
    const calls = [];
    return {
        calls,
        getDrcUserPreference: () => pref,
        setDrcUserPreference(value) { calls.push(value); pref = value; },
        querySelector: () => null,
    };
}

// The gear's contents only exist once it has been opened, like the real menu.
function playerWithMenu({ checked = 'true', hasItem = true, expanded = 'false' } = {}) {
    const clicks = [];
    const item = {
        getAttribute: (name) => ({ 'aria-checked': checked, 'aria-label': '一定音量' })[name] ?? null,
        click() { clicks.push('item'); checked = 'false'; },
    };
    let rendered = false;
    const button = {
        getAttribute: (name) => (name === 'aria-expanded' ? expanded : null),
        click() { clicks.push('button'); rendered = true; },
    };
    const menu = {
        style: { visibility: '' },
        querySelector: (selector) => (selector === '.ytp-drc-menu-item' && rendered && hasItem ? item : null),
    };
    return {
        clicks,
        menu,
        checked: () => checked,
        querySelector: (selector) => {
            if (selector === '.ytp-settings-button') return button;
            if (selector === '.ytp-settings-menu') return menu;
            return null;
        },
    };
}

function bootstrap({ player = null, stored = {} } = {}) {
    const attributes = new Map();
    const observers = [];
    const listeners = new Map();
    const timers = [];
    const storage = new Map(Object.entries(stored));
    const notify = (name) => {
        const records = [{ type: 'attributes', attributeName: name }];
        observers.filter((observer) => observer.active).forEach((observer) => observer.callback(records));
    };
    const documentElement = {
        getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
        setAttribute(name, value) { attributes.set(name, String(value)); notify(name); },
        removeAttribute(name) { attributes.delete(name); notify(name); },
        classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
        style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' },
    };
    class FakeMutationObserver {
        constructor(callback) { this.callback = callback; this.active = false; observers.push(this); }
        observe() { this.active = true; }
        disconnect() { this.active = false; }
    }
    const context = {
        console,
        setTimeout: (fn) => { timers.push(fn); return timers.length; },
        clearTimeout() {},
        setInterval: () => 0,
        clearInterval() {},
        Promise,
        Math,
        Date,
        queueMicrotask,
        MutationObserver: FakeMutationObserver,
        localStorage: {
            getItem: (key) => (storage.has(key) ? storage.get(key) : null),
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: (key) => storage.delete(key),
        },
        document: {
            documentElement,
            addEventListener(type, fn) {
                if (!listeners.has(type)) listeners.set(type, []);
                listeners.get(type).push(fn);
            },
            removeEventListener() {},
            querySelector: () => null,
            querySelectorAll: () => [],
            getElementById: (id) => (id === 'movie_player' ? player : null),
            createElement: () => ({ style: {}, setAttribute() {}, removeAttribute() {}, appendChild() {} }),
            head: { appendChild() {} },
            body: { appendChild() {} },
            readyState: 'complete',
        },
        location: { href: 'https://www.youtube.com/watch?v=fixture', pathname: '/watch' },
        performance: { now: () => 0 },
        matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => true,
    };
    context.window = context;
    context.self = context;
    context.globalThis = context;
    context.YTKitCore = {};
    vm.createContext(context);
    const channel = installBridgeChannel(documentElement, context.YTKitCore);
    vm.runInContext(guardSource, context, { filename: 'extension/core/injection-guard.js' });
    vm.runInContext(source, context, { filename: 'extension/ytkit-main.js' });

    return {
        storage,
        turnOn: () => channel.publish(ATTR, 'off'),
        turnOff: () => channel.clear(ATTR),
        forge: () => documentElement.setAttribute(ATTR, 'off'),
        // A new video in the main player, and one the feature has to ignore.
        loadstart(classes = ['html5-main-video']) {
            const target = { classList: { contains: (name) => classes.includes(name) } };
            (listeners.get('loadstart') || []).forEach((fn) => fn({ target }));
        },
        runTimers() { timers.splice(0).forEach((fn) => fn()); },
    };
}

test('turning the feature on switches Stable Volume off with the value the menu writes', () => {
    const player = playerWithSwitch(1);
    const page = bootstrap({ player });
    assert.deepEqual(player.calls, [], 'nothing changes until the feature asks');
    page.turnOn();
    assert.deepEqual(player.calls, [0]);
    assert.equal(page.storage.get(RESTORE_KEY), '1');
});

test('turning it off restores with 1, because the player reads true as off', () => {
    const player = playerWithSwitch(1);
    const page = bootstrap({ player });
    page.turnOn();
    page.turnOff();
    assert.deepEqual(player.calls, [0, 1]);
    assert.equal(page.storage.has(RESTORE_KEY), false);
});

test('someone who already had Stable Volume off keeps it off after the feature goes away', () => {
    const player = playerWithSwitch(0);
    const page = bootstrap({ player });
    page.turnOn();
    page.turnOff();
    assert.deepEqual(player.calls, [], 'their own choice is left alone both ways');
    assert.equal(page.storage.has(RESTORE_KEY), false);
});

test('a restore still happens if the feature was turned off with no player on screen', () => {
    const player = playerWithSwitch(0);
    const page = bootstrap({ player, stored: { [RESTORE_KEY]: '1' } });
    page.loadstart();
    assert.deepEqual(player.calls, [1]);
    assert.equal(page.storage.has(RESTORE_KEY), false);
});

test('a player that shows up after the switch still gets it, and other media is ignored', () => {
    const player = playerWithSwitch(1);
    const page = bootstrap({ player });
    page.turnOn();
    player.setDrcUserPreference(1);
    player.calls.length = 0;
    page.loadstart(['some-other-video']);
    assert.deepEqual(player.calls, [], 'a preview or ad element is not a new video');
    page.loadstart();
    assert.deepEqual(player.calls, [0], 'switching it back on in the gear lasts until the next video');
});

test('any value but 1 already means off to the player', () => {
    for (const value of [true, false, 2]) {
        const player = playerWithSwitch(value);
        const page = bootstrap({ player });
        page.turnOn();
        assert.deepEqual(player.calls, [], `${value} must not be rewritten`);
        assert.equal(page.storage.has(RESTORE_KEY), false, `${value} must not record a restore`);
    }
});

test('a page script writing the attribute changes nothing', () => {
    const player = playerWithSwitch(1);
    const page = bootstrap({ player });
    page.forge();
    page.loadstart();
    assert.deepEqual(player.calls, []);
});

test('without the player methods the menu item is clicked by class on a Japanese page', () => {
    const player = playerWithMenu();
    const page = bootstrap({ player });
    page.turnOn();
    assert.equal(player.menu.style.visibility, 'hidden', 'the menu must not flash open');
    page.runTimers();
    assert.deepEqual(player.clicks, ['button', 'item', 'button'], 'open, click, close');
    assert.equal(player.checked(), 'false');
    assert.equal(player.menu.style.visibility, '');
});

test('the menu route tries once, leaves an unchecked item alone and closes again', () => {
    const player = playerWithMenu({ checked: 'false' });
    const page = bootstrap({ player });
    page.turnOn();
    page.runTimers();
    page.loadstart();
    page.runTimers();
    assert.deepEqual(player.clicks, ['button', 'button']);
});

test('a video with no menu item closes the gear again and leaves nothing hidden', () => {
    const player = playerWithMenu({ hasItem: false });
    const page = bootstrap({ player });
    page.turnOn();
    page.runTimers();
    assert.deepEqual(player.clicks, ['button', 'button']);
    assert.equal(player.menu.style.visibility, '');
});

test('a gear menu the person has open is never touched', () => {
    const player = playerWithMenu({ expanded: 'true' });
    const page = bootstrap({ player });
    page.turnOn();
    page.runTimers();
    assert.deepEqual(player.clicks, []);
    assert.equal(player.menu.style.visibility, '');
});
