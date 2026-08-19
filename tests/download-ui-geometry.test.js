'use strict';

// Five defects in the download UI, all of the same family: code that was
// correct for the case it was written against and silently wrong for a
// neighbouring one.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'extension/features/download-ui/index.js'), 'utf8');

// Comment lines are stripped from every window. Each of these fixes carries a
// comment naming the wrong-thing-it-replaced, so an absence assertion against
// raw source matches the documentation instead of the code. (This is the third
// time that trap has cost a red run in this repo — strip, then assert.)
function stripComments(text) {
    return text
        .split('\n')
        .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n');
}

function block(needle, length = 1200) {
    const at = source.indexOf(needle);
    assert.ok(at > 0, `${needle} must exist`);
    return stripComments(source.slice(at, at + length));
}

test('the inline clamp is applied on the axis it was measured on', () => {
    const body = block('const rect = popup.getBoundingClientRect();');
    assert.match(body, /popup\.style\.marginLeft = shift \+ 'px'/,
        'the shift comes from physical getBoundingClientRect coordinates');
    assert.doesNotMatch(body, /marginInlineStart/,
        'a logical property maps to margin-right on RTL and moves a left-positioned box nowhere');
});

test('the height cap is applied unconditionally, not only when it already overflows', () => {
    const body = block('const heightCap = Math.max(');
    assert.match(body, /popup\.style\.maxHeight = heightCap \+ 'px';/);
    assert.doesNotMatch(body, /if \(popup\.offsetHeight > heightCap\)/,
        'playlist rows and chip labels render after open, and the popup grows upward');
});

test('the Stream Links close handler touches only its own state', () => {
    const at = source.indexOf("close.className = 'ytkit-stream-links-panel__close'");
    assert.ok(at > 0, 'the close button assignment must exist (the CSS rule is not the handler)');
    const body = stripComments(source.slice(at, at + 700));
    assert.doesNotMatch(body, /_requestToken\+\+/,
        '_requestToken belongs to the History panel this was copied from');
    assert.doesNotMatch(body, /_searchTimer/,
        '_searchTimer belongs to the History panel this was copied from');
    assert.match(body, /panel\.remove\(\)/, 'it must still close');
});

test('Deno provisioning uses the same auth header as every other companion call', () => {
    const at = source.indexOf('provision-deno');
    assert.ok(at > 0);
    // Lookback: the base url sits before the needle inside the same template.
    const body = stripComments(source.slice(at - 400, at + 600));
    assert.match(body, /'X-Auth-Token': data\.token/);
    assert.doesNotMatch(body, /X-MDL-Token'/,
        'X-MDL-Token appears nowhere else in the repo, so the request always 401d');
    assert.match(body, /MediaDLManager\.baseUrl\(\)/,
        'hand-concatenating the port bypasses the manager that knows which one is live');
});

test('every authenticated companion call agrees on the header name', () => {
    const authHeaders = Array.from(source.matchAll(/'X-(?:Auth|MDL)-Token'/g)).map(m => m[0]);
    assert.ok(authHeaders.length >= 3, `expected several authenticated calls, saw ${authHeaders.length}`);
    for (const header of authHeaders) {
        assert.equal(header, "'X-Auth-Token'");
    }
});

test('the health container dedupes parent-wide and adopts what it finds', () => {
    const body = block('_attach() {', 1400);
    assert.match(body, /anchor\.parentElement\?\.querySelector\('\.ytkit-download-health'\)/,
        'sibling panels insert at the same anchor and displace the health container');
    assert.match(body, /this\._container = existing;/,
        'rebinding to nextElementSibling would adopt whichever sibling panel inserted last');
    assert.doesNotMatch(body, /this\._container = anchor\.nextElementSibling;/);
});
