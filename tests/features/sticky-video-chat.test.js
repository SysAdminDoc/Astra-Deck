'use strict';

// Theater Split's live chat placement, split out of features/sticky-video into
// its own part module. These drive the real methods, merged onto a real feature
// object, against a small fake DOM.

const test = require('node:test');
const assert = require('node:assert/strict');

const PART_PATH = '../../extension/features/sticky-video-chat/index.js';
const CONTROLLER_PATH = '../../extension/features/sticky-video/index.js';
const METHODS = [
    '_forceChatFill',
    '_restoreChatFill',
    '_setupChat',
    '_positionChat',
    '_prepareSecondaryForChat',
    '_stopChatObserver',
    '_handleChatFound',
    '_watchForChat',
    '_waitForChat'
];

function loadPart() {
    const originalFeatures = globalThis.YTKitFeatures;
    delete require.cache[require.resolve(PART_PATH)];
    globalThis.YTKitFeatures = {};
    const mod = require(PART_PATH);
    const registered = globalThis.YTKitFeatures.stickyVideoChat;
    globalThis.YTKitFeatures = originalFeatures;
    return { mod, registered };
}

function styleDeclaration(initial = {}) {
    const values = new Map(Object.entries(initial).map(([key, value]) => [key, { value, priority: '' }]));
    return {
        getPropertyValue: (name) => values.get(name)?.value || '',
        getPropertyPriority: (name) => values.get(name)?.priority || '',
        setProperty: (name, value, priority = '') => { values.set(name, { value: String(value), priority }); },
        removeProperty: (name) => { values.delete(name); },
        get display() { return this.getPropertyValue('display'); },
        set display(value) { values.set('display', { value, priority: '' }); },
        snapshot: () => Object.fromEntries([...values].map(([key, entry]) =>
            [key, entry.priority ? `${entry.value} !${entry.priority}` : entry.value]))
    };
}

function element({ style = {}, children = {}, attrs = {} } = {}) {
    const attributes = new Map(Object.entries(attrs));
    return {
        style: styleDeclaration(style),
        dataset: {},
        hidden: false,
        querySelector: (selector) => {
            for (const [key, child] of Object.entries(children)) {
                if (selector.includes(key)) return child;
            }
            return null;
        },
        hasAttribute: (name) => attributes.has(name),
        getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
        removeAttribute: (name) => { attributes.delete(name); }
    };
}

function feature(deps = {}) {
    delete require.cache[require.resolve(CONTROLLER_PATH)];
    const created = require(CONTROLLER_PATH).createStickyVideoFeature(deps);
    created._isActive = true;
    return created;
}

function withDocument(nodes, run) {
    const saved = globalThis.document;
    const queried = [];
    globalThis.document = {
        body: {},
        querySelector: (selector) => { queried.push(selector); return nodes[selector] || null; }
    };
    try {
        return run(queried);
    } finally {
        if (saved === undefined) delete globalThis.document;
        else globalThis.document = saved;
    }
}

test('the chat part loads on its own and hands out fresh methods', () => {
    const { mod, registered } = loadPart();
    assert.equal(registered, mod);
    assert.ok(Object.isFrozen(mod));
    const methods = mod.createStickyVideoChatMethods({});
    assert.deepEqual(Object.keys(methods).sort(), [...METHODS].sort());
    assert.notEqual(mod.createStickyVideoChatMethods({})._handleChatFound, methods._handleChatFound);
});

test('chat fill makes the frame fill the pane and restore puts back what was there', () => {
    const showHide = element({ style: { display: 'block' } });
    const container = element({ style: { width: '400px' } });
    const frame = element();
    const chat = element({ children: { '#show-hide-button': showHide, '#container': container, iframe: frame } });
    const split = feature();

    split._forceChatFill(chat);
    assert.equal(showHide.style.snapshot().display, 'none !important', 'the collapse toggle is hidden');
    assert.deepEqual(container.style.snapshot(), {
        width: '100% !important', height: '100% !important', 'max-height': 'none !important',
        'min-height': '0 !important', 'border-radius': '0 !important'
    });
    assert.equal(frame.style.snapshot().border, 'none !important');

    split._restoreChatFill(chat);
    assert.deepEqual(showHide.style.snapshot(), { display: 'block' });
    assert.deepEqual(container.style.snapshot(), { width: '400px' }, 'only what the page had comes back');
    assert.deepEqual(frame.style.snapshot(), {}, 'and what it did not have is removed');
});

test('a late chat frame is claimed for live chat or a replay, and ignored when comments win', () => {
    const logs = [];
    const DebugManager = { log: (_area, message) => logs.push(message) };
    const chat = element();
    const comments = element({ children: { 'ytd-comments': element() } });

    // A standard video that has comments keeps them, whatever chat frame shows up.
    const related = element({ style: { display: 'block' } });
    const secondary = element({ children: { '#related': related } });
    withDocument({ '#below': comments, '#secondary': secondary }, () => {
        const split = feature({ DebugManager, VideoTypeDetector: { refresh: () => 'standard', getChatEl: () => chat } });
        split._getBelow = () => comments;
        split._handleChatFound(chat, { position: true, rightPct: 30 });
        assert.equal(split._videoType, 'standard');
        assert.deepEqual(secondary.style.snapshot(), {}, 'the sidebar is left alone');
        assert.match(logs.at(-1), /Late chat ignored, using standard comments panel/);
    });

    // A replay claims the chat pane: the sidebar is kept rendered for the frame,
    // made inert, and the related list inside it is hidden.
    withDocument({ '#secondary': secondary }, () => {
        const split = feature({ DebugManager, VideoTypeDetector: { refresh: () => 'vod', getChatEl: () => chat } });
        split._getBelow = () => comments;
        split._handleChatFound(chat, { position: false });
        assert.equal(split._videoType, 'vod');
        assert.deepEqual(secondary.style.snapshot(), {
            display: 'block !important', 'pointer-events': 'none !important'
        });
        assert.equal(secondary.dataset.ytkitSplitHidden, '1');
        assert.equal(related.style.display, 'none');
        assert.match(logs.at(-1), /Late chat detected, reclassified as vod/,
            'without a position request the frame is classified but not moved');
    });
});

test('a chat frame that arrives late is picked up once, and the watch gives up on its timeout', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const savedObserver = globalThis.MutationObserver;
    const observers = [];
    globalThis.MutationObserver = class {
        constructor(callback) { this.callback = callback; this.connected = false; observers.push(this); }
        observe(target, options) { this.connected = true; this.target = target; this.options = options; }
        disconnect() { this.connected = false; }
    };
    try {
        withDocument({}, () => {
            let chat = null;
            const split = feature({ VideoTypeDetector: { refresh: () => 'live', getChatEl: () => chat } });
            const handled = [];
            split._handleChatFound = (found, options) => handled.push({ found, options });

            split._watchForChat({ position: true, rightPct: 30, timeoutMs: 5000 });
            assert.equal(observers.length, 1);
            assert.equal(observers[0].target, globalThis.document.body);
            assert.deepEqual(observers[0].options, { childList: true, subtree: true });

            observers[0].callback();
            assert.equal(handled.length, 0, 'a mutation with no chat frame yet changes nothing');
            chat = element();
            observers[0].callback();
            assert.equal(handled.length, 1);
            assert.equal(handled[0].found, chat);
            assert.equal(handled[0].options.rightPct, 30);
            assert.equal(observers[0].connected, false, 'the observer stops once the frame is found');
            assert.equal(split._chatObserver, null);

            // No frame ever comes: the watch disconnects itself after the timeout.
            chat = null;
            split._watchForChat({ timeoutMs: 5000 });
            assert.equal(observers[1].connected, true);
            t.mock.timers.tick(4999);
            assert.equal(observers[1].connected, true);
            t.mock.timers.tick(1);
            assert.equal(observers[1].connected, false);
            assert.equal(split._chatObserver, null);
            assert.equal(handled.length, 1);
        });
    } finally {
        if (savedObserver === undefined) delete globalThis.MutationObserver;
        else globalThis.MutationObserver = savedObserver;
    }
});
