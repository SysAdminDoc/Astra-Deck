'use strict';

// Comment translation on Chrome's built-in on-device Translator. The contract:
// no new origin, the original text is never destroyed, and a browser without
// the API says so rather than failing quietly.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadFeature, fakeNode, fakeDocument } = require('../helpers/monolith');
const { sources } = require('../helpers/source');

const repoRoot = path.join(__dirname, '..', '..');
const schema = require('../../extension/core/settings-schema.js');
const manifest = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'extension', 'manifest.json'), 'utf8'));

// One constructor shared by the sandbox and the fixtures, so the feature's
// `instanceof HTMLElement` guard stays meaningful instead of being deleted
// from production code to suit the test.
function SandboxHTMLElement() {}
function asElement(node) {
    Object.setPrototypeOf(node, SandboxHTMLElement.prototype);
    return node;
}

function commentNode(text) {
    const content = fakeNode({ tag: 'yt-attributed-string', text });
    const parent = fakeNode({ tag: 'div' });
    let inserted = null;
    parent.insertBefore = (node) => { inserted = node; return node; };
    content.parentElement = parent;
    const comment = asElement(fakeNode({ tag: 'ytd-comment-view-model' }));
    comment.querySelector = (sel) => (sel.includes('content-text') ? content : null);
    return { comment, content, parent, get inserted() { return inserted; } };
}

function build(extra = {}) {
    const feature = loadFeature('commentTranslate', {
        document: Object.assign(fakeDocument(() => []), {
            createElement: () => {
                const node = fakeNode({ tag: 'button' });
                node.listeners = {};
                node.addEventListener = (type, fn) => { node.listeners[type] = fn; };
                return node;
            }
        }),
        injectStyle: () => fakeNode({ tag: 'style' }),
        navigator: { language: 'en-GB' },
        getFeatureById: () => null,
        DebugManager: { log() {} },
        // The feature guards on `instanceof HTMLElement`, which does not exist
        // in a bare vm context. A constructor the fakes are instances of keeps
        // the guard meaningful rather than deleting it from production code.
        HTMLElement: SandboxHTMLElement,
        ...extra
    });
    return feature;
}

test('comment translation adds no host permission and is opt-in', () => {
    const entry = schema.SETTINGS_SCHEMA.find((e) => e.key === 'commentTranslate');
    assert.ok(entry);
    assert.equal(entry.defaultValue, false);
    assert.equal(entry.destroyRequired, true, 'it rewrites page text, so teardown must run');

    const target = schema.SETTINGS_SCHEMA.find((e) => e.key === 'commentTranslateTarget');
    assert.equal(target.defaultValue, 'auto');

    // The whole point of the on-device route: no new origin anywhere.
    const hosts = [...(manifest.host_permissions || []), ...(manifest.optional_host_permissions || [])];
    for (const host of hosts) {
        assert.ok(!/translate|deepl|libretranslate/i.test(host),
            `a translation origin leaked into the manifest: ${host}`);
    }
    const start = sources.ytkit.indexOf("id: 'commentTranslate'");
    const block = sources.ytkit.slice(start, start + 7000);
    assert.doesNotMatch(block, /extensionFetchJson|EXT_FETCH|fetch\(/,
        'translation must not make a network request of its own');
});

test('the target language follows the browser unless one is chosen', () => {
    const auto = build({ appState: { settings: { commentTranslateTarget: 'auto' } } });
    assert.equal(auto._targetLanguage(), 'en', 'auto resolves the browser language, region stripped');

    const fixed = build({ appState: { settings: { commentTranslateTarget: 'ja' } } });
    assert.equal(fixed._targetLanguage(), 'ja');
});

test('the link is only offered where it would do something', () => {
    const detector = { _languageFromScript: (s) => (/[а-я]/i.test(s) ? 'ru' : 'en') };
    const feature = build({
        appState: { settings: { commentTranslateTarget: 'en' } },
        getFeatureById: (id) => (id === 'commentFilterManager' ? detector : null)
    });

    // Already English → no link.
    const english = commentNode('This is a perfectly ordinary English comment.');
    feature._decorate(english.comment);
    assert.equal(english.inserted, null, 'a comment already in the target language needs no link');

    // Russian → link.
    const russian = commentNode('Это довольно длинный комментарий на русском языке.');
    feature._decorate(russian.comment);
    assert.ok(russian.inserted, 'a foreign-language comment gets the link');
    assert.equal(russian.inserted.textContent, 'Translate');

    // Too short to detect reliably → no link, and no marker burned either.
    const short = commentNode('lol');
    feature._decorate(short.comment);
    assert.equal(short.inserted, null);
    assert.equal(short.comment.dataset.ytkitCtReady, undefined,
        'a comment that may still hydrate must stay eligible');
});

test('translating preserves the original and toggles back to it', async () => {
    const feature = build({ appState: { settings: { commentTranslateTarget: 'en' } } });
    feature._hasTranslatorApi = () => true;
    feature._translator_ = async () => ({ translate: async (s) => `EN(${s})` });

    const { comment, content } = commentNode('Ceci est un commentaire.');
    const button = fakeNode({ tag: 'button' });

    await feature._toggle(comment, button);
    assert.equal(content.textContent, 'EN(Ceci est un commentaire.)');
    assert.equal(comment.dataset.ytkitCtOriginal, 'Ceci est un commentaire.');
    assert.equal(button.textContent, 'Show original');

    await feature._toggle(comment, button);
    assert.equal(content.textContent, 'Ceci est un commentaire.', 'the original must come back verbatim');
    assert.equal(button.textContent, 'Translate');

    // Second translation is served from the cache, not re-translated.
    let calls = 0;
    feature._translator_ = async () => { calls += 1; return { translate: async () => 'x' }; };
    await feature._toggle(comment, button);
    assert.equal(content.textContent, 'EN(Ceci est un commentaire.)');
    assert.equal(calls, 0, 'a re-toggle must not spend another translation');
});

test('a browser without the Translator says so instead of failing quietly', async () => {
    const feature = build({ appState: { settings: {} } });
    feature._hasTranslatorApi = () => false;

    const { comment, content } = commentNode('Dies ist ein Kommentar.');
    const button = fakeNode({ tag: 'button' });
    await feature._toggle(comment, button);

    assert.equal(button.textContent, 'Translation unavailable in this browser');
    assert.equal(button.disabled, true);
    assert.equal(content.textContent, 'Dies ist ein Kommentar.', 'the comment must be untouched');
});

test('a failed translation leaves the comment readable', async () => {
    const feature = build({ appState: { settings: {} } });
    feature._hasTranslatorApi = () => true;
    feature._translator_ = async () => { throw new Error('model unavailable'); };

    const { comment, content } = commentNode('Questo è un commento.');
    const button = fakeNode({ tag: 'button' });
    await feature._toggle(comment, button);

    assert.equal(button.textContent, 'Translation failed');
    assert.equal(content.textContent, 'Questo è un commento.');
    assert.equal(comment.dataset.ytkitCtTranslated, undefined);
});

test('one translator instance is reused across comments per language pair', () => {
    const start = sources.ytkit.indexOf("id: 'commentTranslate'");
    const block = sources.ytkit.slice(start, start + 7000);
    assert.match(block, /if \(this\._translator && this\._translatorKey === key\) return this\._translator;/,
        'a per-comment instance would download or hold a model each time');
    assert.match(block, /this\._translator\?\.destroy\?\.\(\);/,
        'switching language pairs must release the previous model');
});

test('teardown restores every comment it rewrote', () => {
    const start = sources.ytkit.indexOf("id: 'commentTranslate'");
    const block = sources.ytkit.slice(start, start + 11000);
    const destroyAt = block.indexOf('destroy() {');
    const destroy = block.slice(destroyAt, destroyAt + 1800);
    assert.match(destroy, /node\.textContent = comment\.dataset\.ytkitCtOriginal/,
        'disabling the feature must not leave translated text on the page');
    assert.match(destroy, /this\._translator\?\.destroy\?\.\(\)/);
    assert.match(destroy, /delete comment\.dataset\.ytkitCtTranslated/);
});
