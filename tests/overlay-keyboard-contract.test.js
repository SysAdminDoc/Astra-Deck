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
const fs = require('node:fs');
const path = require('node:path');
const repoRoot = path.join(__dirname, '..');
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
test('Tab wraps at both ends of a dialog that asked to trap it', () => {
    const { doc, dialog, controls, helpers } = dialogFixture();
    helpers.installDialogFocusContract(dialog, { trapFocus: true });

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

// ── every path that removes a panel has to dispose its focus contract ──

// WHEN a panel is removed by ANY path, the dialog contract SHALL be disposed,
// so focus goes back to whatever opened it rather than being stranded on
// <body>. The AI Summary panel had four removal paths and only one of them
// disposed: the toggle, the navigate rule and destroy each called .remove()
// directly. The navigate rule fires on every YouTube navigation, so that was
// the common case. The queue had two: emptying the queue removed the panel from
// under the user — open it from the keyboard, press Clear — and destroy.
function panelTeardownPaths(source, featureId, nextId) {
    const start = source.indexOf(`id: '${featureId}'`);
    assert.ok(start > -1, `${featureId} must exist`);
    const end = source.indexOf(`id: '${nextId}'`, start);
    assert.ok(end > start, `${featureId} must still be followed by ${nextId}`);
    return source.slice(start, end);
}

test('every AI Summary removal path goes through one teardown', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
    const block = panelTeardownPaths(source, 'aiVideoSummary', 'copyChapterMarkdown');

    assert.match(block, /_closeSummaryPanel\(\) \{/, 'the single teardown must exist');
    assert.match(block, /this\._aisumDialogDispose\?\.\(\);/,
        'and it is the thing that disposes the contract');

    // Nothing else may remove the panel behind its back.
    const strays = [...block.matchAll(/this\._panel\??\.remove\(\)/g)];
    assert.equal(strays.length, 1,
        `${strays.length} direct panel removals; only _closeSummaryPanel may remove it`);
    const teardownAt = block.indexOf('_closeSummaryPanel() {');
    const strayAt = block.indexOf('this._panel?.remove()');
    assert.ok(strayAt > teardownAt && strayAt < teardownAt + 700,
        'the one removal must be the one inside the teardown');

    for (const caller of ['_navRule', 'destroy()', 'if (this._panel) {']) {
        assert.ok(block.includes(caller), `${caller} must still be here`);
    }
    const disposeCalls = [...block.matchAll(/this\._closeSummaryPanel\(\)/g)].length;
    assert.ok(disposeCalls >= 4,
        `only ${disposeCalls} paths route through the teardown; the toggle, the navigate rule, destroy and the close button all must`);
});

test('every persistent queue removal path goes through one teardown', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
    const block = panelTeardownPaths(source, 'persistentQueue', 'playlistEnhancer');

    assert.match(block, /_closeQueuePanel\(\) \{/);
    assert.match(block, /this\._queueDialogDispose\?\.\(\);/);

    const strays = [...block.matchAll(/this\._panel\??\.remove\(\)/g)];
    assert.equal(strays.length, 1,
        `${strays.length} direct panel removals; only _closeQueuePanel may remove it`);

    const closes = [...block.matchAll(/this\._closeQueuePanel\(\)/g)].length;
    assert.ok(closes >= 3,
        `only ${closes} paths route through the teardown; the toggle, the empty-queue render and destroy all must`);
});

// WHEN a dialog is not modal, it SHALL NOT trap Tab and SHALL NOT claim to be
// modal. Both of these are corner and side panels with no backdrop, the video
// keeps playing behind them, and nothing outside is inert — so a trap means a
// keyboard user who opens the queue cannot reach the player again, and
// aria-modal tells assistive technology something untrue.
test('the two non-modal panels neither trap nor claim modality', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
    for (const className of ['ytkit-queue-panel', 'ytkit-aisum-panel']) {
        const at = source.indexOf(`panel.className = '${className}'`);
        assert.ok(at > -1, `${className} must still be built here`);
        const build = source.slice(at, at + 900);
        assert.ok(!/aria-modal/.test(build), `${className} must not claim modality`);
    }
    // And neither install asks for the trap.
    const installs = [...source.matchAll(/installDialogFocusContract\(panel, \{[\s\S]{0,300}?\}\);/g)]
        .map((match) => match[0]);
    assert.ok(installs.length >= 2, 'both panels must still install the contract');
    for (const install of installs) {
        assert.ok(!/trapFocus:\s*true/.test(install),
            'neither of these panels is modal, so neither may trap Tab');
    }
});

// The trap itself still works where it is asked for, or the option is a way to
// silently lose it.
test('the trap is opt-in and still traps when asked', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
    assert.match(source, /trapFocus = false \} = \{\}\) \{/,
        'trapping must be the thing a caller asks for, not the default');
    assert.match(source, /if \(event\.key !== 'Tab' \|\| !trapFocus\) return;/,
        'and the guard has to be on the Tab branch');
});

// WHEN a dialog does not ask to trap focus, Tab SHALL leave it. Trapping is
// only correct for something genuinely modal; in a corner widget or a side
// panel it means a keyboard user cannot get back to the page behind it.
test('Tab leaves a dialog that did not ask to trap it', () => {
    const { doc, dialog, controls, helpers } = dialogFixture();
    helpers.installDialogFocusContract(dialog, {});

    controls[2].focus();
    assert.equal(dialog.press('Tab'), false,
        'the last control must let the browser move focus out of a non-modal dialog');
    assert.equal(doc.activeElement, controls[2], 'and the trap must not have moved it');

    controls[0].focus();
    assert.equal(dialog.press('Tab', true), false);

    // Everything else the contract promises still holds without the trap.
    let closed = 0;
    const second = dialogFixture();
    second.helpers.installDialogFocusContract(second.dialog, {
        onClose: () => { closed += 1; },
        returnFocus: second.trigger
    });
    assert.equal(second.doc.activeElement, second.controls[0], 'focus still goes in');
    assert.ok(second.dialog.press('Escape'));
    assert.equal(closed, 1, 'Escape still closes');
});
