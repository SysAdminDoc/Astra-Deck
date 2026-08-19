'use strict';

// Two guards the download popup carried and the speed popup did not.
//
// 1. The no-anchor fallback (Firefox, or any engine without CSS anchor
//    positioning) clamped `left` both ways and flipped above->below when the
//    popup would go off the top — but never clamped the BOTTOM edge and never
//    capped height. In a short viewport that flip put the ~230px grid past the
//    bottom of the screen, and a fixed popup cannot be scrolled back.
//
// 2. The capture-phase listeners are attached on a 50ms timer with no
//    isConnected guard. A fast reopen discards the old cleanup closure, but
//    the pending timer still fires and attaches listeners nothing will ever
//    remove — leaked for the page lifetime, and the orphaned outsideClick
//    closes the NEXT speed popup on its first click.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'extension/ytkit.js'), 'utf8');

function stripComments(text) {
    return text.split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
}

function fallbackPlacement() {
    const at = source.indexOf("if (anchorEl && !CSS.supports?.('anchor-name: --x')) {");
    assert.ok(at > 0, 'the no-anchor fallback placement must exist');
    return stripComments(source.slice(at, at + 1800));
}

function armWindow() {
    const at = source.indexOf('const escHandler = (e) => { if (e.key === \'Escape\') _closeSpeedPopup(); };');
    assert.ok(at > 0, 'the speed popup esc handler must exist');
    return stripComments(source.slice(at, at + 900));
}

test('the fallback caps the popup height', () => {
    const body = fallbackPlacement();
    assert.match(body, /popup\.style\.maxHeight = heightCap \+ 'px'/,
        'a ~230px grid in a short viewport needs a height bound');
    assert.match(body, /overflowY = 'auto'/, 'a capped popup must still be able to show its contents');
});

test('the height cap is derived from the room actually available', () => {
    const body = fallbackPlacement();
    assert.match(body, /const spaceAbove = r\.top - GAP \* 2;/);
    assert.match(body, /const spaceBelow = window\.innerHeight - r\.bottom - GAP \* 2;/);
    assert.match(body, /Math\.max\(MIN_HEIGHT, spaceAbove, spaceBelow\)/);
});

test('the bottom edge is clamped after the above/below flip', () => {
    const body = fallbackPlacement();
    assert.match(body, /if \(top \+ effectiveHeight > window\.innerHeight - GAP\)/,
        'the flip could place the popup past the viewport bottom');
    assert.match(body, /top = Math\.max\(GAP, window\.innerHeight - effectiveHeight - GAP\)/,
        'the correction must not push the popup off the TOP instead');
});

test('the clamp uses the capped height, not the measured one', () => {
    const body = fallbackPlacement();
    assert.match(body, /const effectiveHeight = Math\.min\(ph, heightCap\);/,
        'clamping against an uncapped height would over-correct and leave a gap');
});

test('deferred listeners are not attached to a popup that already closed', () => {
    const body = armWindow();
    assert.match(body, /if \(!popup\.isConnected\) return;/,
        'a fast reopen discards the cleanup closure but not the pending timer');
    // The guard must come BEFORE the attachments it protects.
    const guardAt = body.indexOf('if (!popup.isConnected) return;');
    const attachAt = body.indexOf("document.addEventListener('click', outsideClick, true)");
    assert.ok(guardAt > 0 && attachAt > 0);
    assert.ok(guardAt < attachAt, 'the guard must precede the attachment');
});

test('the cleanup closure still removes both listeners', () => {
    const body = armWindow();
    assert.match(body, /document\.removeEventListener\('click', outsideClick, true\)/);
    assert.match(body, /document\.removeEventListener\('keydown', escHandler\)/);
});

test('the download popup keeps the same two guards', () => {
    // Regression pin: these fixes came from the download popup. If they are
    // ever removed there, this test says so rather than letting the speed
    // popup drift back.
    const dl = fs.readFileSync(path.join(repoRoot, 'extension/features/download-ui/index.js'), 'utf8');
    assert.match(dl, /if \(!popup\.isConnected\) return;/);
    assert.match(dl, /popup\.style\.maxHeight = heightCap \+ 'px';/);
});
