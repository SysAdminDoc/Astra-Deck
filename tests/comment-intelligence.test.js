'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const REPO_ROOT = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8');
const ytkitSource = read('extension', 'ytkit.js');
const commentsPackSource = read('extension', 'core', 'selector-packs', 'comments.js');
const defaultSettings = JSON.parse(read('extension', 'default-settings.json'));
const settingsSchema = require(path.join(REPO_ROOT, 'extension', 'core', 'settings-schema.js'));

function managerBlock() {
    const start = ytkitSource.indexOf("        {\n            id: 'commentFilterManager'");
    const end = ytkitSource.indexOf("\n        {\n            id: 'commentFilterRules'", start);
    assert.ok(start >= 0 && end > start, 'comment filter manager block must exist');
    return ytkitSource.slice(start, end).replace(/,\s*$/, '');
}

function loadCommentsPack() {
    const context = { console, globalThis: null };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(commentsPackSource, context, { filename: 'comments.js' });
    return context.YTKitCore.SurfacePackRegistry.get('comments');
}

function makeThread({ body = '', author = '', attributes = {} } = {}) {
    const attrs = new Map(Object.entries(attributes));
    const bodyNode = { textContent: body };
    const authorNode = { textContent: author };
    return {
        style: { display: '' },
        dataset: {},
        hidden: false,
        parentElement: null,
        hasAttribute(name) { return attrs.has(name); },
        getAttribute(name) { return attrs.get(name) ?? null; },
        setAttribute(name, value) { attrs.set(name, String(value)); },
        removeAttribute(name) { attrs.delete(name); },
        querySelector(selector) {
            if (selector.includes('#content-text')) return bodyNode;
            if (selector.includes('#author-text')) return authorNode;
            return null;
        },
        querySelectorAll() { return []; }
    };
}

test('comment intelligence settings are safe, local, and bounded', () => {
    const schemaByKey = new Map(settingsSchema.SETTINGS_SCHEMA.map((entry) => [entry.key, entry]));
    for (const [key, type, defaultValue] of [
        ['commentLanguageAllowlist', 'string', ''],
        ['commentDuplicateCollapse', 'boolean', false]
    ]) {
        const entry = schemaByKey.get(key);
        assert.ok(entry, `${key} must be present in the settings schema`);
        assert.equal(entry.category, 'comments');
        assert.equal(entry.scope, 'comments');
        assert.equal(entry.type, type);
        assert.equal(entry.defaultValue, defaultValue);
        assert.equal(defaultSettings[key], defaultValue);
        assert.equal(entry.profile, 'both');
    }
});

test('comment selector pack exposes frozen root, thread, author, and body hooks', () => {
    const pack = loadCommentsPack();
    assert.ok(pack);
    assert.ok(Object.isFrozen(pack.hooks));
    for (const hook of ['root', 'thread', 'author', 'body']) {
        const entry = pack.hooks[hook];
        assert.ok(entry, `${hook} hook must exist`);
        assert.ok(Object.isFrozen(entry));
        assert.ok(entry.stable.length > 0);
        assert.ok(entry.fallback.length > 0);
    }
    assert.match(pack.hooks.thread.stable.join(' '), /ytd-comment-view-model/);
    assert.match(pack.hooks.body.stable.join(' '), /#content-text/);
});

test('comment language filtering uses explicit metadata and fails open when uncertain', () => {
    const manager = vm.runInNewContext(`(${managerBlock()})`, {
        appState: { settings: { commentFilterRules: '', commentLanguageAllowlist: 'en, en-US' } },
        DebugManager: { log() {} },
        PageTypes: { WATCH: 'watch' },
        t: (_key, fallback) => fallback
    });
    assert.equal(manager._normaliseLanguageCode('en_US'), 'en-us');
    assert.equal(manager._languageMatches('en-US', new Set(['en'])), true);
    assert.equal(manager._shouldHideForLanguage(makeThread({
        body: 'Bonjour tout le monde',
        attributes: { lang: 'fr' }
    })), true);
    assert.equal(manager._shouldHideForLanguage(makeThread({
        body: 'This is a comment for you',
        attributes: { lang: 'en-US' }
    })), false);
    assert.equal(manager._shouldHideForLanguage(makeThread({ body: 'wow' })), false,
        'short or undetected comments must remain visible');
    assert.equal(manager._languageFromScript('한국어 댓글'), 'ko');
    assert.equal(manager._languageFromScript('コメントです'), 'ja');
});

test('comment filtering preserves author rules and duplicate similarity is conservative', () => {
    const manager = vm.runInNewContext(`(${managerBlock()})`, {
        appState: { settings: { commentFilterRules: '@Creator' } },
        DebugManager: { log() {} },
        PageTypes: { WATCH: 'watch' },
        t: (_key, fallback) => fallback
    });
    assert.equal(manager._shouldHideThread(makeThread({ author: 'Creator' })), true);
    assert.equal(manager._shouldHideThread(makeThread({ author: 'Creator', body: 'keep this' })), true);
    assert.equal(manager._duplicateSimilarity(
        manager._normaliseDuplicateText('This is a really useful comment about the topic'),
        manager._normaliseDuplicateText('This is a really useful comment about the topic!')
    ), 1);
    assert.equal(manager._duplicateSimilarity('wow', 'wow'), 0,
        'very short repeated comments must not be collapsed');

    const block = managerBlock();
    assert.match(block, /aria-expanded/);
    assert.match(block, /aria-controls/);
    assert.match(block, /data-ytkit-comment-duplicate-hidden/);
    assert.match(block, /commentDuplicateCollapse/);
    assert.match(block, /addMutationRule\(this\.id/);
    assert.match(block, /m\.addedNodes/);
    const mutationBlock = block.slice(block.indexOf('addMutationRule'), block.indexOf('addNavigateRule'));
    assert.doesNotMatch(mutationBlock, /document\.querySelectorAll/,
        'mutation handling must not rescan the full document on every observer tick');
});
