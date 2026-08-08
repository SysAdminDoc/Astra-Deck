'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const EXTENSION_ROOT = path.join(REPO_ROOT, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION_ROOT, 'manifest.json'), 'utf8'));
const liveChatModule = require('../extension/features/live-chat/index.js');
const { runtimeModules } = require('./helpers/source');

function getScriptGroups() {
    const groups = manifest.content_scripts.filter((entry) => entry.world === 'ISOLATED' && entry.js);
    return {
        normal: groups.find((entry) => runtimeModules(entry).includes('ytkit.js')),
        chat: groups.find((entry) => entry.matches?.includes('https://*.youtube.com/live_chat*'))
    };
}

test('live-chat manifest entry declares only its scoped dependency graph', () => {
    const { normal, chat } = getScriptGroups();
    assert.ok(normal, 'normal-page ISOLATED entry must exist');
    assert.ok(chat, 'live-chat ISOLATED entry must exist');
    assert.deepEqual(chat.js, [
        'core/browser-api.js',
        'core/env.js',
        'core/styles.js',
        'core/settings-schema.js',
        'core/policy-profile.js',
        'features/live-chat/index.js',
        'live-chat.js'
    ]);
    assert.deepEqual(chat.css, ['live-chat.css']);
    assert.ok(!chat.js.includes('ytkit.js'), 'chat entry must not load the normal-page monolith');
    assert.ok(!normal.js.includes('live-chat.js'), 'normal-page entry must not load the chat bootstrap');
    for (const script of chat.js) {
        assert.ok(fs.statSync(path.join(EXTENSION_ROOT, script)).isFile(), `${script} must exist`);
    }
});

test('live-chat staged script bytes and count remain materially below normal pages', () => {
    const { normal, chat } = getScriptGroups();
    const bytes = (scripts) => scripts.reduce(
        (total, script) => total + fs.statSync(path.join(EXTENSION_ROOT, script)).size,
        0
    );
    const normalBytes = bytes([...(normal.css || []), ...runtimeModules(normal)]);
    const chatBytes = bytes([...(chat.css || []), ...chat.js]);
    assert.ok(chat.js.length <= 10, `live chat loads ${chat.js.length} scripts; expected at most 10`);
    assert.ok(chatBytes < normalBytes * 0.1,
        `live chat is ${chatBytes} bytes versus ${normalBytes}; expected less than 10%`);
});

test('generated live-chat CSS stays byte-equal to the monolith premium style', () => {
    const { generate } = require('../scripts/generate-live-chat-css.js');
    const generatedPath = path.join(EXTENSION_ROOT, 'live-chat.css');
    assert.equal(fs.readFileSync(generatedPath, 'utf8'), generate());
});

class FakeStyle {
    constructor() {
        this.display = '';
        this.visibility = '';
    }

    setProperty(name, value) {
        this[name] = value;
    }
}

class FakeElement {
    constructor(document, tagName = 'div') {
        this.ownerDocument = document;
        this.tagName = tagName.toUpperCase();
        this.id = '';
        this.dataset = {};
        this.style = new FakeStyle();
        this.children = [];
        this.attributes = new Map();
        this.className = '';
        this.classList = { contains: () => false };
        this.textContent = '';
        this.parentNode = null;
        this.listeners = new Map();
    }

    append(...children) {
        for (const child of children) {
            if (!child) continue;
            child.parentNode = this;
            this.children.push(child);
            this.ownerDocument._register(child);
        }
    }

    addEventListener(type, listener) {
        this.listeners.set(type, listener);
    }

    dispatchEvent(event) {
        this.listeners.get(event.type)?.(event);
        return true;
    }

    click() {
        this.listeners.get('click')?.({ type: 'click' });
    }

    focus() {}

    getAttribute(name) {
        return this.attributes.get(name) ?? null;
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    removeAttribute(name) {
        this.attributes.delete(name);
    }

    toggleAttribute(name, force) {
        if (force) this.attributes.set(name, ''); else this.attributes.delete(name);
    }

    remove() {
        this.ownerDocument._unregister(this);
        if (this.parentNode) {
            this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
        }
        this.parentNode = null;
    }

    replaceChildren(...children) {
        this.children = [];
        this.append(...children);
    }

    querySelector(selector) {
        return this.ownerDocument._queryWithin(this, selector)[0] || null;
    }

    querySelectorAll(selector) {
        return this.ownerDocument._queryWithin(this, selector);
    }
}

class FakeMessage extends FakeElement {
    constructor(document, author, message) {
        super(document, 'yt-live-chat-text-message-renderer');
        this.authorNode = { textContent: author };
        this.messageNode = { textContent: message };
    }

    querySelector(selector) {
        if (selector === '#author-name') return this.authorNode;
        if (selector === '#message') return this.messageNode;
        if (selector === '#author-photo') return null;
        return super.querySelector(selector);
    }
}

class FakeDocument {
    constructor() {
        this.nodes = new Set();
        this.documentElement = new FakeElement(this, 'html');
        this.body = new FakeElement(this, 'body');
        this._register(this.documentElement);
        this._register(this.body);
        this.messages = [];
        this.engagement = [];
        this.tooltips = [];
    }

    _register(node) {
        this.nodes.add(node);
    }

    _unregister(node) {
        this.nodes.delete(node);
    }

    createElement(tagName) {
        return new FakeElement(this, tagName);
    }

    createTextNode(text) {
        const node = new FakeElement(this, '#text');
        node.textContent = text;
        return node;
    }

    getElementById(id) {
        return [...this.nodes].find((node) => node.id === id) || null;
    }

    _queryWithin(root, selector) {
        const descendants = [];
        const visit = (node) => {
            for (const child of node.children || []) {
                descendants.push(child);
                visit(child);
            }
        };
        visit(root);
        if (selector.startsWith('.')) {
            const className = selector.slice(1);
            return descendants.filter((node) => String(node.className).split(/\s+/).includes(className));
        }
        if (selector === '[data-action="toggle"]') {
            return descendants.filter((node) => node.dataset.action === 'toggle');
        }
        return [];
    }

    querySelectorAll(selector) {
        if (selector.includes('yt-live-chat-text-message-renderer')) {
            if (selector.includes('data-ytkit-livechat-enhanced')) {
                return this.messages.filter((message) => message.dataset.ytkitLivechatEnhanced);
            }
            return this.messages;
        }
        if (selector.includes('yt-live-chat-viewer-engagement-message-renderer')) return this.engagement;
        if (selector === 'yt-tooltip-renderer') return this.tooltips;
        if (selector.includes('data-ytkit-live-chat-engagement-hidden')) {
            return this.engagement.filter((node) => node.dataset.ytkitLiveChatEngagementHidden === '1');
        }
        if (selector.includes('data-ytkit-chat-filtered')) {
            return this.messages.filter((message) => message.dataset.ytkitChatFiltered === '1');
        }
        if (selector.includes('data-ytkit-livechat-enhanced')) {
            return this.messages.filter((message) => message.dataset.ytkitLivechatEnhanced);
        }
        return [];
    }
}

test('live-chat runtime applies settings, profile gates reactions, and tears down cleanly', async () => {
    const document = new FakeDocument();
    const engagement = new FakeElement(document, 'yt-live-chat-viewer-engagement-message-renderer');
    const botMessage = new FakeMessage(document, 'Helper Bot', 'automated response');
    const keywordMessage = new FakeMessage(document, 'Viewer', 'spoiler warning');
    document.engagement.push(engagement);
    document.messages.push(botMessage, keywordMessage);

    let observerDisconnected = false;
    class FakeMutationObserver {
        observe() {}
        disconnect() { observerDisconnected = true; }
    }

    const changeListeners = new Set();
    const browser = {
        storage: {
            local: {
                get: async () => ({
                    ytSuiteSettings: {
                        hideLiveChatEngagement: true,
                        premiumLiveChat: true,
                        hiddenChatElementsManager: true,
                        hiddenChatElements: ['bots'],
                        chatKeywordFilter: 'spoiler',
                        reactionSpammer: true,
                        safeStoreProfile: false,
                        githubFullProfile: true
                    }
                }),
                set: async () => {}
            },
            onChanged: {
                addListener: (listener) => changeListeners.add(listener),
                removeListener: (listener) => changeListeners.delete(listener)
            }
        }
    };
    const window = {
        location: { pathname: '/live_chat' },
        MutationObserver: FakeMutationObserver,
        MouseEvent: class { constructor(type) { this.type = type; } },
        addEventListener() {},
        removeEventListener() {},
        requestAnimationFrame: (callback) => callback(),
        setTimeout,
        clearTimeout
    };
    const injectStyle = (_css, id) => {
        const style = document.createElement('style');
        style.id = `yt-suite-style-${id}`;
        document.body.append(style);
        return style;
    };
    const runtime = liveChatModule.createLiveChatRuntime({
        browser,
        document,
        injectStyle,
        policy: {
            resolveEffectiveProfile: (settings) => settings.githubFullProfile ? 'github-full' : 'store-safe'
        },
        scope: { document, window },
        window
    });

    assert.equal(await runtime.start(), true);
    assert.equal(changeListeners.size, 1, 'runtime must subscribe to settings changes');
    assert.ok(document.documentElement.attributes.has('data-ytkit-livechat-premium'));
    assert.equal(engagement.style.display, 'none');
    assert.equal(botMessage.style.display, 'none');
    assert.equal(keywordMessage.style.display, 'none');
    assert.ok(document.getElementById('ytkit-reaction-spammer-launcher'),
        'github-full profile may mount the reaction sender');

    await runtime.applySettings({
        hideLiveChatEngagement: false,
        premiumLiveChat: false,
        hiddenChatElementsManager: false,
        hiddenChatElements: [],
        chatKeywordFilter: '',
        reactionSpammer: true,
        safeStoreProfile: true,
        githubFullProfile: false
    });
    assert.equal(engagement.style.display, '', 'disabled engagement filter must restore inline state');
    assert.equal(botMessage.style.display, '', 'disabled bot filter must restore messages');
    assert.equal(keywordMessage.style.display, '', 'disabled keyword filter must restore messages');
    assert.ok(!document.documentElement.attributes.has('data-ytkit-livechat-premium'));
    assert.equal(document.getElementById('ytkit-reaction-spammer-launcher'), null,
        'store-safe profile must remove the github-full reaction sender');

    runtime.destroy();
    assert.equal(observerDisconnected, true);
    assert.equal(changeListeners.size, 0);
    assert.equal(runtime.isDestroyed(), true);
    for (const id of ['hideLiveChatEngagement', 'premiumLiveChat', 'hiddenChatElementsManager', 'reactionSpammer']) {
        assert.equal(document.getElementById(`yt-suite-style-${id}`), null, `${id} style must be removed`);
    }
});

test('reaction sender copy routes through the injected t() helper in both twins', () => {
    const moduleSource = fs.readFileSync(
        path.join(EXTENSION_ROOT, 'features', 'live-chat', 'index.js'), 'utf8');
    assert.match(moduleSource, /typeof options\.t === 'function'/,
        'createLiveChatRuntime must accept an injected t dependency');
    assert.match(moduleSource, /browser\?\.i18n\?\.getMessage/,
        'default translator must fall back to browser.i18n before the literal');
    assert.match(moduleSource, /title\.textContent = t\('reactionSenderTitle', 'Reaction sender'\)/,
        'live-chat reaction panel title must route through t()');
    assert.match(moduleSource, /t\('reactionSenderSentTpl', /,
        'sent status must route through the {emoji} template key');

    const monolith = fs.readFileSync(path.join(EXTENSION_ROOT, 'ytkit.js'), 'utf8');
    assert.match(monolith, /title\.textContent = t\('feature_reactionSpammer_name', 'Reaction Spammer'\)/,
        'ytkit.js reaction spammer twin must route its panel title through t()');
    assert.match(monolith, /t\('reactionSenderRefresh', 'Refresh reactions'\)/,
        'ytkit.js twin must share the reactionSender* keys');

    const en = JSON.parse(fs.readFileSync(
        path.join(EXTENSION_ROOT, '_locales', 'en', 'messages.json'), 'utf8'));
    for (const key of ['reactionSenderTitle', 'reactionSenderStart', 'reactionSenderStop',
        'reactionSenderStopped', 'reactionSenderRefresh', 'reactionSenderSentTpl']) {
        assert.ok(en[key]?.message, `en messages must define ${key}`);
    }
});

test('live-chat module declares the complete scoped feature set', () => {
    assert.deepEqual(liveChatModule.CHAT_FEATURE_IDS, [
        'hideLiveChatEngagement',
        'premiumLiveChat',
        'hiddenChatElementsManager',
        'reactionSpammer',
        'chatKeywordFilter'
    ]);
});
