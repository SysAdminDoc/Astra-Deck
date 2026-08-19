'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

// The guard is a pure DOM-shaped module: it reads names/ids/attributes off
// nodes it is handed. These fakes carry exactly that surface, which keeps the
// test honest about what the guard is allowed to rely on — if it ever starts
// reading textContent (localized) or calling into YouTube, these fakes stop
// satisfying it.
function makeNode({ tag = 'div', attrs = {}, children = [], parent = null } = {}) {
    const node = {
        tagName: tag.toUpperCase(),
        _attrs: attrs,
        children,
        parentElement: parent,
        getAttribute(name) {
            return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null;
        },
        querySelector() { return null; }
    };
    for (const child of children) child.parentElement = node;
    return node;
}

function loadGuard(documentStub) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'core', 'dialog-guard.js'), 'utf8');
    const context = { globalThis: null, document: documentStub };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(source, context);
    return context.YTKitCore;
}

const emptyDocument = { querySelectorAll: () => [] };

test('a verification dialog is refused however deep the clicked control sits', () => {
    const guard = loadGuard(emptyDocument);
    const button = makeNode({ tag: 'button', attrs: { id: 'confirm-button' } });
    let node = button;
    for (let depth = 0; depth < 5; depth += 1) {
        node = makeNode({ tag: 'div', children: [node] });
    }
    makeNode({ tag: 'ytd-age-verification-renderer', children: [node] });

    assert.equal(guard.isComplianceDialog(button), true);
    assert.equal(guard.isSafeToAutoClick(button), false);
});

test('identity, consent, captcha and sign-in surfaces are all refused', () => {
    const guard = loadGuard(emptyDocument);
    const hosts = [
        makeNode({ tag: 'ytd-consent-bump-v2-lightbox' }),
        makeNode({ tag: 'div', attrs: { class: 'playerCaptchaViewModel' } }),
        makeNode({ tag: 'div', attrs: { id: 'identity-flow' } }),
        // Caught by the standalone verification token alone — no age or
        // identity substring to fall back on.
        makeNode({ tag: 'ytd-verification-required-renderer' }),
        makeNode({ tag: 'div', attrs: { 'aria-labelledby': 'age-gate-title' } }),
        makeNode({ tag: 'div', attrs: { id: 'signin-prompt' } })
    ];
    for (const host of hosts) {
        const button = makeNode({ tag: 'button', parent: host });
        host.children = [button];
        assert.equal(guard.isComplianceDialog(button), true, `${host.tagName} ${JSON.stringify(host._attrs)} should be refused`);
    }
});

test('an ordinary confirm dialog is still clickable', () => {
    const guard = loadGuard(emptyDocument);
    const dialog = makeNode({ tag: 'ytd-confirm-dialog-renderer', attrs: { id: 'dialog' } });
    const button = makeNode({ tag: 'button', attrs: { id: 'confirm-button' }, parent: dialog });
    dialog.children = [button];

    assert.equal(guard.isComplianceDialog(button), false);
    assert.equal(guard.isSafeToAutoClick(button), true);
});

test('an open verification dialog anywhere blocks an unrelated auto-click', () => {
    const verification = makeNode({ tag: 'div', attrs: { role: 'dialog', id: 'age-verify-modal' } });
    const guard = loadGuard({ querySelectorAll: () => [verification] });

    const unrelated = makeNode({ tag: 'button', attrs: { id: 'confirm-button' } });
    // The button itself is innocent...
    assert.equal(guard.isComplianceDialog(unrelated), false);
    // ...but clicking anything while a verification modal is up can dismiss it.
    assert.equal(guard.isSafeToAutoClick(unrelated), false);
    assert.equal(guard.findComplianceDialog(), verification);
    // Callers that genuinely only care about their own target can opt out.
    assert.equal(guard.isSafeToAutoClick(unrelated, { scanDocument: false }), true);
});

test('a compliance shell nested inside a bland dialog host is still found', () => {
    const shell = makeNode({ tag: 'div', attrs: { class: 'ytIdentityVerificationHost' } });
    const host = makeNode({ tag: 'tp-yt-paper-dialog', children: [shell] });
    const guard = loadGuard({ querySelectorAll: () => [host] });

    assert.equal(guard.findComplianceDialog(), host);
});

test('the ancestor walk is bounded and terminates on a cyclic parent chain', () => {
    const guard = loadGuard(emptyDocument);
    const node = makeNode({ tag: 'div' });
    node.parentElement = node;
    assert.equal(guard.isComplianceDialog(node), false);
});

test('nodes that throw on attribute access do not break the guard', () => {
    const guard = loadGuard(emptyDocument);
    const hostile = {
        tagName: 'DIV',
        getAttribute() { throw new Error('detached'); },
        parentElement: null,
        children: []
    };
    assert.equal(guard.isComplianceDialog(hostile), false);
});

test('the still-watching dismisser refuses its paused-video fallback during verification', () => {
    const monolith = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');
    const start = monolith.indexOf("id: 'autoDismissStillWatching'");
    assert.ok(start > 0, 'autoDismissStillWatching must exist');
    const end = monolith.indexOf('_debounceTimer', start);
    assert.ok(end > start, 'the feature body must be bounded');
    const body = monolith.slice(start, end);

    // The paused-video branch is the dangerous one: a verification
    // interstitial also pauses playback.
    assert.match(body, /findComplianceDialog\(\)\)\s*return false;/);
    assert.match(body, /btn && isSafeToAutoClick\(btn\)/);
});

test('both unsubscribe-confirm copies consult the guard before clicking', () => {
    const monolith = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');
    const peel = fs.readFileSync(path.join(__dirname, '..', 'extension', 'features', 'subscription-groups', 'index.js'), 'utf8');

    const monolithStart = monolith.indexOf('async _confirmUnsubscribeDialog()');
    assert.ok(monolithStart > 0);
    const monolithBody = monolith.slice(monolithStart, monolithStart + 1200);
    assert.match(monolithBody, /button && isSafeToAutoClick\(button\)/);

    const peelStart = peel.indexOf('async _confirmUnsubscribeDialog()');
    assert.ok(peelStart > 0);
    const peelBody = peel.slice(peelStart, peelStart + 1400);
    assert.match(peelBody, /YTKitCore\.isSafeToAutoClick/);
    assert.match(peelBody, /typeof safeToClick !== 'function' \|\| safeToClick\(button\)/);
});
