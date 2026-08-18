'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const REPO_ROOT = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8');
const ytkitSource = read('extension', 'ytkit.js');
const notificationsPackSource = read('extension', 'core', 'selector-packs', 'notifications.js');
const defaultSettings = JSON.parse(read('extension', 'default-settings.json'));
const settingsSchema = require(path.join(REPO_ROOT, 'extension', 'core', 'settings-schema.js'));
const captureTokens = [
    read('tests', 'fixtures', 'yt-home.tokens.txt'),
    read('tests', 'fixtures', 'yt-watch.tokens.txt')
].join('\n');

function notificationFeatureBlock() {
    const start = ytkitSource.indexOf("        {\n            id: 'chronologicalNotifications'");
    const end = ytkitSource.indexOf("\n\n        {\n            id: 'notificationMaxCount'", start);
    assert.ok(start >= 0 && end > start, 'chronological notification feature block must exist');
    return ytkitSource.slice(start, end).replace(/,\s*$/, '');
}

function loadNotificationsPack() {
    const context = { console, globalThis: null };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(notificationsPackSource, context, { filename: 'notifications.js' });
    return context.YTKitCore.SurfacePackRegistry.get('notifications');
}

function fakeNode(attributes = {}, className = '', label = '') {
    const attrs = new Map(Object.entries(attributes));
    return {
        hidden: false,
        className,
        parentElement: null,
        hasAttribute(name) { return attrs.has(name); },
        getAttribute(name) { return attrs.get(name) ?? null; },
        setAttribute(name, value) { attrs.set(name, String(value)); },
        removeAttribute(name) { attrs.delete(name); },
        querySelectorAll() { return []; },
        querySelector() { return null; },
        matches() { return false; },
        getAttributeForTest(name) { return name === 'aria-label' ? label : attrs.get(name) ?? null; }
    };
}

test('notification policies have independent safe defaults and bounded schema metadata', () => {
    const expected = {
        notificationMaxCount: { type: 'number', defaultValue: 0, min: 0, max: 100 },
        notificationHideRead: { type: 'boolean', defaultValue: false }
    };
    const schemaByKey = new Map(settingsSchema.SETTINGS_SCHEMA.map((entry) => [entry.key, entry]));
    for (const [key, contract] of Object.entries(expected)) {
        const entry = schemaByKey.get(key);
        assert.ok(entry, `${key} must be present in the settings schema`);
        assert.equal(defaultSettings[key], contract.defaultValue);
        assert.equal(entry.category, 'comments');
        assert.equal(entry.scope, 'comments');
        assert.equal(entry.type, contract.type);
        if (contract.min !== undefined) assert.equal(entry.min, contract.min);
        if (contract.max !== undefined) assert.equal(entry.max, contract.max);
    }
});

test('notification selector pack exposes captured popup and row hook chains', () => {
    const pack = loadNotificationsPack();
    assert.ok(pack);
    assert.ok(Object.isFrozen(pack.hooks));
    for (const [hook, requiredToken] of [
        ['popup.root', 'ytd-multi-page-menu-renderer'],
        ['element.item', 'ytd-notification-renderer']
    ]) {
        const entry = pack.hooks[hook];
        assert.ok(entry, `${hook} hook must exist`);
        assert.ok(Object.isFrozen(entry));
        assert.ok(entry.stable.length > 0);
        assert.ok(entry.fallback.length > 0);
        assert.match(captureTokens, new RegExp(`^${requiredToken}$`, 'm'),
            `${hook} token must remain present in capture-backed fixtures`);
    }
});

test('notification filtering is explicit-state only and loop-safe', () => {
    const feature = vm.runInNewContext(`(${notificationFeatureBlock()})`, {
        t: (_key, fallback) => fallback
    });
    const unread = fakeNode({ 'is-unread': '' });
    const read = fakeNode({ 'is-read': '' });
    assert.equal(feature._readState(unread), 'unread');
    assert.equal(feature._readState(read), 'read');
    assert.equal(feature._readState(fakeNode()), 'unknown');

    const item = fakeNode();
    feature._hiddenOriginalState.clear();
    feature._setHidden(item, 'read', true);
    assert.equal(item.hidden, true);
    assert.equal(item.hasAttribute('data-ytkit-notification-read-hidden'), true);
    feature._setHidden(item, 'read', false);
    assert.equal(item.hidden, false);
    assert.equal(item.hasAttribute('data-ytkit-notification-read-hidden'), false);

    // `hidden` is only a UA-level display:none, which any author-level `display`
    // on the Polymer host outranks — so the assertions above can all hold while
    // the notification stays painted. The marker attributes need a real CSS
    // backstop, and this pins it.
    const injected = [];
    const styled = vm.runInNewContext(`(${notificationFeatureBlock()})`, {
        t: (_key, fallback) => fallback,
        injectStyle: (css, id, enabled) => injected.push({ css, id, enabled })
    });
    styled._ensureHiddenCss();
    assert.equal(injected.length, 1, 'the hide markers must carry a stylesheet');
    assert.equal(injected[0].enabled, true);
    assert.match(injected[0].css, /\[data-ytkit-notification-read-hidden\]/);
    assert.match(injected[0].css, /\[data-ytkit-notification-cap-hidden\]/);
    assert.match(injected[0].css, /display:\s*none\s*!important/,
        'the backstop must outrank an author-level display on the Polymer host');
    assert.match(notificationFeatureBlock(), /this\._ensureHiddenCss\(\);/,
        'init() must install the backstop, not just define it');

    const block = notificationFeatureBlock();
    assert.match(block, /sorted\.every\(\(item, index\) => item === groupItems\[index\]\)/,
        'sorting must avoid appendChild when the order is already stable');
    assert.match(block, /addMutationRule\(this\.id/,
        'late-arriving notifications must be observed through the shared mutation runtime');
    assert.match(block, /notificationMaxCount/);
    assert.match(block, /notificationHideRead/);
    assert.match(block, /_restoreHiddenItems\(\)/,
        'destroy and disabled states must restore feature-owned visibility changes');
});
