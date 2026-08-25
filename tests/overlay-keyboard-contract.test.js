'use strict';

// The keyboard contracts the four overlays declared and did not implement.
//
// The gate beside this checks that each overlay CALLS the shared helper. It
// cannot press a key, which is the whole question: does an arrow move the
// selection, does Escape close, does focus come back to whatever opened it.
// The helpers are lifted out of the monolith and run against a fake DOM.

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { sources } = require('./helpers/source');

// The smallest DOM these helpers touch: querySelectorAll, contains, focus,
// tabIndex, getAttribute, and one keydown listener.
function makeDom() {
    const doc = { body: null, activeElement: null };

    function el(role, { disabled = false, checked = null, ariaHidden = null } = {}) {
        return {
            role,
            disabled,
            tabIndex: 0,
            parent: null,
            children: [],
            listeners: {},
            attrs: {},
            focused: 0,
            getAttribute(name) {
                if (name === 'aria-checked') return checked === null ? null : String(checked);
                if (name === 'aria-hidden') return ariaHidden;
                return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null;
            },
            setAttribute(name, value) { this.attrs[name] = String(value); },
            hasAttribute(name) { return Object.hasOwn(this.attrs, name); },
            focus() { this.focused += 1; doc.activeElement = this; },
            addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
            removeEventListener(type, fn) {
                this.listeners[type] = (this.listeners[type] || []).filter((entry) => entry !== fn);
            },
            append(...kids) {
                for (const kid of kids) { kid.parent = this; this.children.push(kid); }
            },
            contains(other) {
                let node = other;
                while (node) { if (node === this) return true; node = node.parent; }
                return false;
            },
            // Enough of a selector engine for the two selectors the helpers use:
            // a comma-separated list of [role="..."] and of bare tag names.
            querySelectorAll(selector) {
                const wanted = selector.split(',').map((part) => part.trim());
                const out = [];
                (function walk(root) {
                    for (const kid of root.children) {
                        const byRole = wanted.some((part) => part === `[role="${kid.role}"]`);
                        const byTag = wanted.some((part) => part.split(':')[0].split('[')[0] === kid.role);
                        if (byRole || byTag) out.push(kid);
                        walk(kid);
                    }
                }(this));
                return out;
            },
            press(key, shiftKey = false) {
                let prevented = false;
                const event = {
                    key,
                    shiftKey,
                    preventDefault() { prevented = true; },
                    stopPropagation() {}
                };
                for (const fn of (this.listeners.keydown || []).slice()) fn(event);
                return prevented;
            }
        };
    }

    doc.body = el('body');
    doc.isConnectedDefault = true;
    return { doc, el };
}

// Load the real helpers with our fake document bound as their global.
function loadHelpers(doc) {
    const source = sources.ytkit;
    const start = source.indexOf('    const MENU_ITEM_SELECTOR =');
    const end = source.indexOf('    function showSpeedPopup(anchorEl, onChange) {', start);
    assert.ok(start > -1 && end > start, 'the overlay helpers must still be in the monolith');
    const body = source.slice(start, end);

    const sandbox = { console, document: doc };
    sandbox.globalThis = sandbox;
    return vm.runInNewContext(
        '(() => {' + body
        + 'return { installMenuKeyboardModel, installDialogFocusContract };})()',
        sandbox
    );
}

function menuFixture(checkedIndex = -1) {
    const { doc, el } = makeDom();
    const menu = el('menu');
    doc.body.append(menu);
    const items = [0, 1, 2, 3].map((index) =>
        el('menuitemradio', { checked: index === checkedIndex }));
    menu.append(...items);
    const trigger = el('button');
    trigger.isConnected = true;
    doc.body.append(trigger);
    trigger.focus();
    return { doc, menu, items, trigger, helpers: loadHelpers(doc) };
}

// ── menus ──

// WHEN a menu opens, focus SHALL move into it, onto the checked item where
// there is one. A radio menu that opens on its first entry hides which option
// is currently in force.
test('a menu takes focus, on the checked item when there is one', () => {
    const { doc, menu, items, helpers } = menuFixture(2);
    helpers.installMenuKeyboardModel(menu, {});
    assert.equal(doc.activeElement, items[2], 'focus opens on the checked option');
    assert.deepEqual(items.map((item) => item.tabIndex), [-1, -1, 0, -1],
        'a menu is ONE tab stop: exactly one item is tabbable');
});

test('a menu with nothing checked opens on its first item', () => {
    const { doc, menu, items, helpers } = menuFixture();
    helpers.installMenuKeyboardModel(menu, {});
    assert.equal(doc.activeElement, items[0]);
});

// WHEN an arrow key is pressed in a menu, the selection SHALL move and wrap,
// and the roving tabindex SHALL follow it. This is what role="menu" promises
// and what 18 menuitemradio children were doing none of.
test('arrow keys move through a menu and wrap at both ends', () => {
    const { doc, menu, items, helpers } = menuFixture(0);
    helpers.installMenuKeyboardModel(menu, {});

    assert.ok(menu.press('ArrowDown'), 'the menu handles the key rather than letting the page scroll');
    assert.equal(doc.activeElement, items[1]);
    menu.press('ArrowDown');
    assert.equal(doc.activeElement, items[2]);
    menu.press('ArrowUp');
    assert.equal(doc.activeElement, items[1]);

    menu.press('End');
    assert.equal(doc.activeElement, items[3], 'End jumps to the last item');
    menu.press('ArrowDown');
    assert.equal(doc.activeElement, items[0], 'and wraps round to the first');
    menu.press('ArrowUp');
    assert.equal(doc.activeElement, items[3], 'wrapping works backwards too');
    menu.press('Home');
    assert.equal(doc.activeElement, items[0]);

    assert.deepEqual(items.map((item) => item.tabIndex), [0, -1, -1, -1],
        'the tab stop follows the selection');
});

// WHEN Escape is pressed, the menu SHALL close. The Astra context menu had no
// keydown handler at all, so anyone who opened it from the keyboard was stuck
// with it.
test('Escape closes a menu', () => {
    const { menu, helpers } = menuFixture();
    let closed = 0;
    helpers.installMenuKeyboardModel(menu, { onClose: () => { closed += 1; } });
    assert.ok(menu.press('Escape'));
    assert.equal(closed, 1);
});

// WHEN Tab is pressed, the menu SHALL close rather than moving focus to
// something behind an overlay that is still on screen.
test('Tab leaves a menu instead of walking behind it', () => {
    const { menu, helpers } = menuFixture();
    let closed = 0;
    helpers.installMenuKeyboardModel(menu, { onClose: () => { closed += 1; } });
    menu.press('Tab');
    assert.equal(closed, 1);
});

// WHEN a menu closes, focus SHALL return to whatever opened it — but only if
// focus is still inside the menu. Yanking it back from wherever the user has
// clicked is its own bug.
test('closing a menu returns focus to its trigger, and only then', () => {
    const { doc, menu, trigger, helpers } = menuFixture();
    const dispose = helpers.installMenuKeyboardModel(menu, { returnFocus: trigger });
    const before = trigger.focused;
    dispose();
    assert.equal(trigger.focused, before + 1, 'focus goes back to the trigger');
    assert.equal(doc.activeElement, trigger);

    const second = menuFixture();
    const disposeSecond = second.helpers.installMenuKeyboardModel(second.menu, {
        returnFocus: second.trigger
    });
    // A real element outside the menu. document.body does NOT work as the
    // stand-in here: the helper deliberately treats body as ours, because that
    // is where focus lands when an overlay is removed from under it.
    const elsewhere = second.trigger;
    second.doc.activeElement = { parent: null };
    const triggerFocuses = second.trigger.focused;
    disposeSecond();
    assert.equal(second.trigger.focused, triggerFocuses,
        'focus that has moved elsewhere is left where the user put it');
});

test('a disabled item is skipped and a menu with no items is left alone', () => {
    const { doc, el } = makeDom();
    const helpers = loadHelpers(doc);
    const empty = el('menu');
    doc.body.append(empty);
    const dispose = helpers.installMenuKeyboardModel(empty, {});
    assert.equal(typeof dispose, 'function', 'an empty menu still returns a usable dispose');

    const menu = el('menu');
    doc.body.append(menu);
    const items = [
        el('menuitem'),
        el('menuitem', { disabled: true }),
        el('menuitem')
    ];
    menu.append(...items);
    helpers.installMenuKeyboardModel(menu, {});
    assert.equal(doc.activeElement, items[0]);
    menu.press('ArrowDown');
    assert.equal(doc.activeElement, items[2], 'a disabled item is not a stop');
});

// ── dialogs ──

function dialogFixture() {
    const { doc, el } = makeDom();
    const dialog = el('dialog');
    doc.body.append(dialog);
    const controls = ['button', 'button', 'button'].map(() => el('button'));
    dialog.append(...controls);
    const trigger = el('button');
    trigger.isConnected = true;
    doc.body.append(trigger);
    trigger.focus();
    return { doc, dialog, controls, trigger, helpers: loadHelpers(doc) };
}

// WHEN a dialog opens, focus SHALL move into it. Both of these were appended to
// <body> with no focus call, so a screen-reader user was told a dialog had
// appeared somewhere in the page with no way to reach it.
test('a dialog takes focus on open', () => {
    const { doc, dialog, controls, helpers } = dialogFixture();
    helpers.installDialogFocusContract(dialog, {});
    assert.equal(doc.activeElement, controls[0], 'the first control receives focus');

    const second = dialogFixture();
    second.helpers.installDialogFocusContract(second.dialog, { initialFocus: second.controls[2] });
    assert.equal(second.doc.activeElement, second.controls[2], 'an explicit target wins');
});

test('a dialog with nothing focusable still receives focus itself', () => {
    const { doc, el } = makeDom();
    const helpers = loadHelpers(doc);
    const dialog = el('dialog');
    doc.body.append(dialog);
    helpers.installDialogFocusContract(dialog, {});
    assert.equal(doc.activeElement, dialog);
    assert.equal(dialog.tabIndex, -1, 'and is made programmatically focusable to do it');
});

// WHEN Tab reaches either end of a dialog, focus SHALL wrap inside it.
test('Tab wraps at both ends of a dialog', () => {
    const { doc, dialog, controls, helpers } = dialogFixture();
    helpers.installDialogFocusContract(dialog, {});

    controls[2].focus();
    assert.ok(dialog.press('Tab'), 'the last control wraps to the first');
    assert.equal(doc.activeElement, controls[0]);

    controls[0].focus();
    assert.ok(dialog.press('Tab', true), 'and shift-Tab wraps backwards');
    assert.equal(doc.activeElement, controls[2]);

    controls[1].focus();
    assert.equal(dialog.press('Tab'), false,
        'in the middle the browser moves focus, the trap does not interfere');
});

test('Escape closes a dialog and focus returns to its trigger', () => {
    const { dialog, trigger, helpers } = dialogFixture();
    let closed = 0;
    const dispose = helpers.installDialogFocusContract(dialog, {
        onClose: () => { closed += 1; },
        returnFocus: trigger
    });
    assert.ok(dialog.press('Escape'));
    assert.equal(closed, 1);

    const before = trigger.focused;
    dispose();
    assert.equal(trigger.focused, before + 1);
});

test('disposing a dialog stops it handling keys', () => {
    const { dialog, helpers } = dialogFixture();
    let closed = 0;
    const dispose = helpers.installDialogFocusContract(dialog, { onClose: () => { closed += 1; } });
    dispose();
    dialog.press('Escape');
    assert.equal(closed, 0, 'a removed overlay must not keep answering keys');
});
