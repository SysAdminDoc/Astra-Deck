'use strict';

// Theater Split on a past live stream. The pane used to stack the chat replay
// over the comments, half the height each. It now shows one at a time under a
// toggle bar, comments first. These drive the real controller with its chat
// part merged on, against a small DOM that keeps a tree and its listeners.

const test = require('node:test');
const assert = require('node:assert/strict');

const CONTROLLER_PATH = '../../extension/features/sticky-video/index.js';

function styleDeclaration() {
    const values = new Map();
    return {
        getPropertyValue: (name) => values.get(name)?.value || '',
        getPropertyPriority: (name) => values.get(name)?.priority || '',
        setProperty: (name, value, priority = '') => { values.set(name, { value: String(value), priority }); },
        removeProperty: (name) => { values.delete(name); },
        snapshot: () => Object.fromEntries([...values].map(([key, entry]) =>
            [key, entry.priority ? `${entry.value} !${entry.priority}` : entry.value]))
    };
}

function matches(node, selector) {
    return selector.split(',').map((part) => part.trim()).some((part) => {
        if (/^#[\w-]+$/.test(part)) return node.id === part.slice(1);
        if (/^\.[\w-]+$/.test(part)) return String(node.className).split(/\s+/).includes(part.slice(1));
        if (/^[\w-]+$/.test(part)) return node.tagName === part;
        return false;
    });
}

function domNode(tagName, { id = '', children = [] } = {}) {
    const attributes = new Map();
    const listeners = new Map();
    const node = {
        tagName,
        id,
        className: '',
        textContent: '',
        style: styleDeclaration(),
        dataset: {},
        children: [],
        parentNode: null,
        scrollTop: 0,
        classList: { add() {}, remove() {}, contains: () => false },
        get isConnected() { return node.parentNode ? node.parentNode.isConnected : node.tagName === 'body'; },
        setAttribute: (name, value) => { attributes.set(name, String(value)); },
        getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
        hasAttribute: (name) => attributes.has(name),
        removeAttribute: (name) => { attributes.delete(name); },
        addEventListener: (type, handler) => { listeners.set(type, [...(listeners.get(type) || []), handler]); },
        removeEventListener: (type, handler) => {
            listeners.set(type, (listeners.get(type) || []).filter((entry) => entry !== handler));
        },
        listeners: (type) => listeners.get(type) || [],
        fire: (type, event = {}) => { for (const handler of node.listeners(type)) handler({ currentTarget: node, ...event }); },
        appendChild: (child) => { child.parentNode = node; node.children.push(child); return child; },
        remove: () => {
            if (!node.parentNode) return;
            node.parentNode.children.splice(node.parentNode.children.indexOf(node), 1);
            node.parentNode = null;
        },
        querySelectorAll: (selector) => {
            const found = [];
            const walk = (parent) => parent.children.forEach((child) => {
                if (matches(child, selector)) found.push(child);
                walk(child);
            });
            walk(node);
            return found;
        },
        querySelector: (selector) => node.querySelectorAll(selector)[0] || null
    };
    children.forEach((child) => node.appendChild(child));
    return node;
}

// A watch page with a chat replay and comments, and the split already open.
function pastLivePage({ withComments = true, withChat = true, type = 'vod' } = {}) {
    const body = domNode('body');
    const below = withComments ? body.appendChild(domNode('div', { id: 'below', children: [domNode('ytd-comments')] })) : null;
    const chat = withChat ? body.appendChild(domNode('ytd-live-chat-frame', { id: 'chat', children: [domNode('iframe')] })) : null;
    const saved = { document: globalThis.document, location: globalThis.location };
    globalThis.document = {
        body,
        documentElement: domNode('html'),
        createElement: (tagName) => domNode(tagName),
        querySelector: (selector) => body.querySelector(selector),
        querySelectorAll: (selector) => body.querySelectorAll(selector)
    };
    globalThis.location = { href: 'https://www.youtube.com/watch?v=ysuK79CjRZ4' };
    delete require.cache[require.resolve(CONTROLLER_PATH)];
    const split = require(CONTROLLER_PATH).createStickyVideoFeature({
        DebugManager: { log() {} },
        VideoTypeDetector: { refresh: () => type, getChatEl: () => chat },
        t: (key, fallback) => `${fallback}`
    });
    split._isActive = true;
    split._isSplit = true;
    split._videoType = type;
    split._positionedEls = [];
    split._splitInlineStyleStash = new Map();
    const bar = () => body.querySelector('#ytkit-split-replay-tabs');
    const tab = (pane) => bar()?.querySelectorAll('.ytkit-split-replay-tab').find((el) => el.dataset.ytkitPane === pane);
    const restore = () => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete globalThis[key];
            else globalThis[key] = value;
        }
    };
    return { body, below, chat, split, bar, tab, restore };
}

const shown = (el) => el.style.getPropertyValue('visibility') === 'visible'
    && el.style.getPropertyValue('pointer-events') === 'auto';
const hidden = (el) => el.style.getPropertyValue('visibility') === 'hidden'
    && el.style.getPropertyValue('pointer-events') === 'none';

test('a past live stream opens on its comments, with a toggle bar over both surfaces', () => {
    const page = pastLivePage();
    try {
        page.split._layoutSplitReplay(page.chat, page.below, 32);
        const bar = page.bar();
        assert.ok(bar, 'the toggle bar is mounted');
        assert.equal(bar.style.snapshot().width, 'calc(32% - 2px) !important');
        assert.ok(page.split._positionedEls.includes(bar), 'the divider drag and fullscreen treat it like the pane');

        const track = bar.querySelector('.ytkit-split-replay-track');
        assert.equal(track.getAttribute('role'), 'group');
        assert.equal(track.getAttribute('aria-label'), 'Side panel content');
        assert.equal(page.tab('comments').textContent, 'Comments');
        assert.equal(page.tab('chat').textContent, 'Live chat replay');
        assert.equal(page.tab('comments').getAttribute('aria-pressed'), 'true');
        assert.equal(page.tab('chat').getAttribute('aria-pressed'), 'false');

        // Both sit under the bar at full height, instead of 45/55 stacked.
        for (const el of [page.chat, page.below]) {
            assert.equal(el.style.getPropertyValue('top'), '48px');
            assert.equal(el.style.getPropertyValue('height'), 'calc(100vh - 48px)');
        }
        assert.ok(shown(page.below), 'the comments show first');
        assert.ok(hidden(page.chat), 'the chat replay stays mounted but hidden');
        assert.equal(page.split._scrollTarget, page.below);
    } finally {
        page.restore();
    }
});

test('the toggle switches to the chat replay and back, and the pull-to-close follows it', () => {
    const page = pastLivePage();
    try {
        page.split._layoutSplitReplay(page.chat, page.below, 32);
        // _expandSplit attaches these to whatever surface the pane shows.
        const wheel = () => {};
        page.split._rightWheelHandler = wheel;
        page.split._rightTouchHandler = () => {};
        page.split._rightTouchMoveHandler = () => {};
        page.below.addEventListener('wheel', wheel);

        page.tab('chat').fire('click');
        assert.equal(page.split._splitReplayPane, 'chat');
        assert.ok(shown(page.chat));
        assert.ok(hidden(page.below));
        assert.equal(page.tab('chat').getAttribute('aria-pressed'), 'true');
        assert.equal(page.tab('comments').getAttribute('aria-pressed'), 'false');
        assert.equal(page.split._scrollTarget, page.chat);
        assert.deepEqual(page.chat.listeners('wheel'), [wheel]);
        assert.deepEqual(page.below.listeners('wheel'), []);

        page.tab('comments').fire('click');
        assert.ok(shown(page.below));
        assert.ok(hidden(page.chat));
        assert.equal(page.split._scrollTarget, page.below);
        assert.deepEqual(page.below.listeners('wheel'), [wheel]);
        assert.deepEqual(page.chat.listeners('wheel'), []);
    } finally {
        page.restore();
    }
});

test('pulling up on the bar closes the pane once the surface under it is at the top', () => {
    const page = pastLivePage();
    try {
        page.split._layoutSplitReplay(page.chat, page.below, 32);
        const collapsed = [];
        page.split._collapseSplit = (dismissed) => collapsed.push(dismissed);

        page.below.scrollTop = 120;
        page.bar().fire('wheel', { deltaY: -40 });
        assert.deepEqual(collapsed, [], 'a comments list scrolled down keeps the pane open');
        page.below.scrollTop = 0;
        page.bar().fire('wheel', { deltaY: 40 });
        assert.deepEqual(collapsed, [], 'scrolling down never closes it');
        page.bar().fire('wheel', { deltaY: -40 });
        assert.deepEqual(collapsed, [false]);

        page.bar().fire('touchstart', { touches: [{ clientY: 10 }] });
        page.bar().fire('touchmove', { touches: [{ clientY: 50 }] });
        assert.deepEqual(collapsed, [false, false]);
    } finally {
        page.restore();
    }
});

test('with only one of the two surfaces there is no bar, and the one there fills the pane', () => {
    const page = pastLivePage();
    try {
        page.split._layoutSplitReplay(page.chat, page.below, 32);
        assert.ok(page.bar());

        // The comments surface went away: the bar leaves with it.
        page.split._layoutSplitReplay(page.chat, null, 32);
        assert.equal(page.bar(), null);
        assert.equal(page.split._splitReplayTabs, null);
        assert.ok(!page.split._positionedEls.some((el) => el.id === 'ytkit-split-replay-tabs'));
        assert.equal(page.chat.style.getPropertyValue('top'), '0');
        assert.equal(page.chat.style.getPropertyValue('height'), '100vh');
    } finally {
        page.restore();
    }
});

test('a pane picked while the split is closed is kept for the next open, and unposition drops the bar', () => {
    const page = pastLivePage();
    try {
        page.split._isSplit = false;
        page.split._setSplitReplayPane('chat');
        assert.equal(page.split._splitReplayPane, 'chat');
        assert.equal(page.chat.style.getPropertyValue('visibility'), '', 'nothing is restyled while closed');

        page.split._isSplit = true;
        page.split._layoutSplitReplay(page.chat, page.below, 32);
        assert.ok(shown(page.chat), 'the next open shows the pane picked last');

        page.split._unpositionAll();
        assert.equal(page.bar(), null);
        assert.equal(page.split._splitReplayTabs, null);
        assert.deepEqual(page.split._positionedEls, []);
    } finally {
        page.restore();
    }
});

test('a chat replay that turns up after the split opened joins the toggle', () => {
    const page = pastLivePage();
    try {
        page.split._videoType = 'standard';
        page.split._handleChatFound(page.chat, { position: true, rightPct: 30 });
        assert.equal(page.split._videoType, 'vod');
        assert.ok(page.bar(), 'the late replay brings the toggle bar');
        assert.ok(shown(page.below), 'the comments stay in front');
        assert.ok(hidden(page.chat));
        assert.equal(page.chat.style.getPropertyValue('top'), '48px');
    } finally {
        page.restore();
    }
});
