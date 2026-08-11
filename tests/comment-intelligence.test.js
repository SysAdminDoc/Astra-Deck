'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { loadFeature } = require('./helpers/monolith');

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

function makeSponsoredNode({ tag = 'div', text = '' } = {}) {
    const attrs = new Map();
    const classes = new Set();
    const node = {
        tagName: tag.toUpperCase(),
        textContent: text,
        style: { display: '' },
        parentElement: null,
        classList: {
            toggle(name, force) {
                if (force) classes.add(name);
                else classes.delete(name);
            },
            contains(name) { return classes.has(name); }
        },
        hasAttribute(name) { return attrs.has(name); },
        getAttribute(name) { return attrs.get(name) ?? null; },
        setAttribute(name, value) { attrs.set(name, String(value)); },
        removeAttribute(name) { attrs.delete(name); },
        querySelectorAll() { return []; },
        addEventListener(type, callback) {
            if (type === 'click') this._click = callback;
        },
        remove() {
            const parent = this.parentElement;
            const index = parent?.children?.indexOf(this);
            if (index >= 0) parent.children.splice(index, 1);
            this.parentElement = null;
        },
        click() { this._click?.(); }
    };
    const parent = {
        children: [node],
        closest() { return null; },
        insertBefore(child, target) {
            const index = this.children.indexOf(target);
            child.parentElement = this;
            this.children.splice(index < 0 ? this.children.length : index, 0, child);
        }
    };
    node.parentElement = parent;
    return { node, parent };
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

test('sponsored content filtering is an opt-in watch setting', () => {
    const entry = settingsSchema.SETTINGS_SCHEMA.find(({ key }) => key === 'sponsoredContentFilter');
    assert.ok(entry);
    assert.equal(entry.category, 'content-filter');
    assert.equal(entry.scope, 'watch');
    assert.equal(entry.type, 'boolean');
    assert.equal(entry.defaultValue, false);
    assert.equal(entry.profile, 'both');
    assert.equal(defaultSettings.sponsoredContentFilter, false);
});

test('sponsored content filtering explains and reverses comment and description matches', () => {
    const comment = makeSponsoredNode({ tag: 'ytd-comment-thread-renderer', text: 'Use my promo code ASTRA for 20% off.' });
    const description = makeSponsoredNode({ tag: 'div', text: 'This video is sponsored by Acme.' });
    const commentsRoot = {
        querySelectorAll() { return [comment.node]; }
    };
    const feature = loadFeature('sponsoredContentFilter', {
        document: {
            querySelector(selector) {
                return selector.includes('ytd-comments') ? commentsRoot : null;
            },
            querySelectorAll(selector) {
                return selector === '#description-inline-expander' ? [description.node] : [];
            },
            createElement() {
                return makeSponsoredNode({ tag: 'button' }).node;
            }
        },
        isWatchPagePath: () => true,
        injectStyle: () => ({ remove() {} })
    });

    feature.init();
    assert.equal(comment.node.classList.contains('ytkit-sponsored-filter-collapsed'), true);
    assert.equal(description.node.classList.contains('ytkit-sponsored-filter-collapsed'), true);
    assert.match(comment.parent.children[0].textContent, /affiliate promotion/);
    assert.match(description.parent.children[0].textContent, /sponsor disclosure/);

    comment.parent.children[0].click();
    assert.equal(comment.node.classList.contains('ytkit-sponsored-filter-collapsed'), false);
    assert.equal(comment.node.getAttribute('data-ytkit-sponsored-revealed'), '1');
    assert.match(comment.parent.children[0].textContent, /^Hide /);

    comment.parent.children[0].click();
    assert.equal(comment.node.classList.contains('ytkit-sponsored-filter-collapsed'), true);
    assert.equal(comment.node.getAttribute('data-ytkit-sponsored-revealed'), null);

    feature.destroy();
    assert.equal(comment.node.classList.contains('ytkit-sponsored-filter-collapsed'), false);
    assert.equal(description.node.classList.contains('ytkit-sponsored-filter-collapsed'), false);
    assert.deepEqual(comment.parent.children, [comment.node]);
    assert.deepEqual(description.parent.children, [description.node]);
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
    assert.match(block, /addScopedMutationRule\(this\.id/);
    const mutationBlock = block.slice(block.indexOf('addScopedMutationRule'), block.indexOf('addNavigateRule'));
    assert.doesNotMatch(mutationBlock, /document\.querySelectorAll/,
        'mutation handling must not rescan the full document on every observer tick');
});

test('comment filter mutation rule is registered scoped and processes newly added threads', () => {
    // Regression: the rule used to be registered with addMutationRule, whose
    // dispatcher calls rule(document.body) — iterating that as MutationRecords
    // threw on every batch, so lazily-loaded threads were never filtered.
    // navigation.js is the contract of record for both call shapes.
    const navigationSource = read('extension', 'core', 'navigation.js');
    assert.match(navigationSource, /executeMutationRule\(id, 'broad', rule, \[targetNode\]\)/,
        'broad rules receive only the target node');
    assert.match(navigationSource, /executeMutationRule\(id, 'scoped', entry\.ruleFn, \[targetNode, addedElements\]\)/,
        'scoped rules receive the target node and the added elements');

    let scopedSelector = null;
    let scopedRule = null;
    let broadRuleRegistered = false;
    const processed = [];

    const manager = vm.runInNewContext(`(${managerBlock()})`, {
        appState: { settings: { commentFilterRules: '@Spammer' } },
        DebugManager: { log() {} },
        PageTypes: { WATCH: 'watch' },
        t: (_key, fallback) => fallback,
        document: {
            addEventListener() {},
            removeEventListener() {},
            querySelector() { return null; },
            querySelectorAll() { return []; }
        },
        location: { pathname: '/watch' },
        globalThis: {},
        setTimeout: () => 0,
        clearTimeout: () => {},
        injectStyle: () => null,
        addMutationRule: () => { broadRuleRegistered = true; },
        addScopedMutationRule: (_id, selector, ruleFn) => { scopedSelector = selector; scopedRule = ruleFn; },
        addNavigateRule: () => {},
        removeScopedMutationRule: () => {},
        removeNavigateRule: () => {},
        isWatchPagePath: () => true
    });

    manager._processThread = (thread) => { processed.push(thread); };
    manager.init();

    assert.equal(broadRuleRegistered, false, 'the rule must not be registered as a broad mutation rule');
    assert.ok(scopedRule, 'a scoped mutation rule must be registered');
    assert.match(scopedSelector, /ytd-comment-thread-renderer/,
        'the scoped selector must target comment threads so unrelated batches are skipped');

    const directThread = makeThread({ author: 'Spammer' });
    directThread.matches = (selector) => selector === scopedSelector;
    const nestedThread = makeThread({ author: 'Nested' });
    const container = {
        matches: () => false,
        querySelectorAll: (selector) => (selector === scopedSelector ? [nestedThread] : [])
    };
    const unrelated = { matches: () => false, querySelectorAll: () => [] };

    // Exactly the argument shape the real dispatcher passes (targetNode is
    // document.body in production; the rule must not depend on it).
    const targetNode = { nodeName: 'BODY' };
    scopedRule(targetNode, [directThread, container, unrelated]);

    assert.deepEqual(processed, [directThread, nestedThread],
        'direct and nested comment threads added by a mutation batch must be processed');
});
