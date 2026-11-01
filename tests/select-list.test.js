'use strict';

// The dropdown list Chromium 135+ draws from `appearance: base-select`. It lets
// Escape through to the page, where a native list kept it, and the settings
// panel and the popup both close on that key.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const EXTENSION = path.join(__dirname, '..', 'extension');
const read = (...parts) => fs.readFileSync(path.join(EXTENSION, ...parts), 'utf8');

function sliceFunction(source, name) {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start > -1, `${name} must exist`);
    const open = source.indexOf('{', start);
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, index + 1);
        }
    }
    throw new Error(`${name} never closes`);
}

function target(select) {
    return { closest: (selector) => (selector === 'select' ? select : null) };
}

for (const [label, file] of [
    ['popup', ['popup.js']]
]) {
    const isSelectListOpen = new Function(
        `${sliceFunction(read(...file), 'isSelectListOpen')}\nreturn isSelectListOpen;`
    )();

    test(`${label}: an open list is told apart from a closed one`, () => {
        assert.equal(isSelectListOpen(target({ matches: (s) => s === ':open' })), true);
        assert.equal(isSelectListOpen(target({ matches: () => false })), false);
    });

    test(`${label}: anything outside a select reads as no open list`, () => {
        assert.equal(isSelectListOpen(target(null)), false);
        assert.equal(isSelectListOpen({}), false);
        assert.equal(isSelectListOpen(null), false);
        assert.equal(isSelectListOpen(undefined), false);
    });

    test(`${label}: a browser that doesn't know :open has no drawn list`, () => {
        const select = { matches() { throw new SyntaxError('unknown pseudo-class'); } };
        assert.equal(isSelectListOpen(target(select)), false);
    });
}

// The panel is a modal dialog now. An open list has its own close watcher on top
// of the dialog's, so the browser sends Escape to the list first, which is what
// this guard used to do by hand. Measured live, Chromium 153: the first Escape
// closes the list, the second closes the panel.
test('the settings panel leaves Escape to the browser', () => {
    const source = read('features', 'settings-panel', 'index.js');
    assert.ok(!source.includes('isSelectListOpen'), 'a second opinion on Escape is how the two drifted apart');
    assert.ok(!/key === 'Escape'/.test(source.slice(source.indexOf("doc.addEventListener('keydown'"))),
        'and no document handler closes it behind the browser\'s back');
});

test('Escape on an open list leaves the popup alone', () => {
    const handler = sliceFunction(read('popup.js'), 'handlePopupDialogKeydown');
    const guard = handler.indexOf('if (isSelectListOpen(event.target)) return;');
    assert.ok(guard > -1, 'the guard must exist');
    assert.ok(guard < handler.indexOf('window.close()'), 'and run before the popup closes');
});

test('the styled list only applies where the browser can draw it', () => {
    const panel = read('core', 'settings-visual-system.js');
    const panelBlock = panel.slice(panel.indexOf('@supports (appearance: base-select)'));
    assert.ok(panelBlock.length > 0, 'the panel rules must sit behind @supports');
    assert.match(panelBlock, /#ytkit-settings-panel \.ytkit-select,\s+#ytkit-settings-panel \.ytkit-select::picker\(select\) \{\s+appearance: base-select !important;/);
    assert.match(panelBlock, /\.ytkit-select::picker\(select\) \{[^}]*background: var\(--ytkit-v3-surface-raised\)/);

    const outside = panel.slice(0, panel.indexOf('@supports (appearance: base-select)'));
    assert.doesNotMatch(outside, /base-select;|base-select !important/, 'nothing may opt in outside @supports');

    const css = read('popup.css');
    const popupBlock = css.slice(css.indexOf('@supports (appearance: base-select)'));
    assert.match(popupBlock, /#languageSelect::picker\(select\) \{\s+appearance: base-select;/,
        '#languageSelect sets appearance: none by id, so it has to be named here to win');
    assert.match(popupBlock, /#languageSelect::picker-icon \{\s+display: none;/,
        'it draws its own chevron, and two would show');
    assert.match(popupBlock, /#languageSelect option:hover/,
        'its option background is set by id, so hover has to be too');
});
