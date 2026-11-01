'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHideVideosFromHomeFeature } = require('../../extension/features/video-hider/index.js');

const VIDEO_A = 'a1b2c3d4e5F';
const VIDEO_B = 'f6g7h8i9j0K';
const CHANNEL_ID = 'UCblocked123';

class FakeElement {
    constructor(tagName, ownerDocument) {
        this.tagName = String(tagName || 'div').toUpperCase();
        this.ownerDocument = ownerDocument;
        this.children = [];
        this.parentNode = null;
        this.attributes = new Map();
        this.dataset = {};
        this.listeners = new Map();
        this.className = '';
        this.id = '';
        this.textContent = '';
        this.disabled = false;
        this.isConnected = true;
    }

    appendChild(child) {
        child.parentNode = this;
        child.isConnected = true;
        this.children.push(child);
        return child;
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    getAttribute(name) {
        return this.attributes.get(name) || null;
    }

    addEventListener(type, callback) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(callback);
    }

    dispatch(type, event = {}) {
        for (const callback of this.listeners.get(type) || []) callback({ target: this, ...event });
    }

    click() {
        this.dispatch('click');
    }

    focus() {
        this.ownerDocument.activeElement = this;
    }

    remove() {
        if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
        this.parentNode = null;
        this.isConnected = false;
    }

    _descendants() {
        return this.children.flatMap(child => [child, ...child._descendants()]);
    }

    querySelectorAll(selector) {
        const descendants = this._descendants();
        if (selector === 'button') return descendants.filter(node => node.tagName === 'BUTTON');
        if (selector === 'button:not([disabled])') return descendants.filter(node => node.tagName === 'BUTTON' && !node.disabled);
        return [];
    }

    querySelector(selector) {
        const action = selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];
        if (action) return this._descendants().find(node => node.dataset.action === action) || null;
        return null;
    }
}

class FakeDialog extends FakeElement {
    constructor(tagName, ownerDocument) {
        super(tagName, ownerDocument);
        this.open = false;
        this.modalOpens = 0;
    }

    showModal() {
        if (this.ownerDocument.refuseModal) throw new Error('refused');
        if (!this.parentNode) throw new Error('showModal on a dialog outside the document');
        this.open = true;
        this.modalOpens += 1;
        this.ownerDocument.order.push('showModal');
    }

    close() {
        this.open = false;
        this.ownerDocument.order.push('close');
    }

    remove() {
        this.ownerDocument.order.push('remove');
        super.remove();
    }
}

class FakeDocument {
    constructor() {
        this.order = [];
        this.refuseModal = false;
        this.body = new FakeElement('body', this);
        this.activeElement = this.body;
        this.listeners = new Map();
        this.video = {
            tagName: 'VIDEO',
            paused: false,
            ended: false,
            pauseCalls: 0,
            playCalls: 0,
            pause() { this.pauseCalls += 1; this.paused = true; },
            play() { this.playCalls += 1; this.paused = false; return Promise.resolve(); }
        };
        this.player = null;
        this.watchRoot = null;
    }

    createElement(tagName) {
        return tagName === 'dialog' ? new FakeDialog(tagName, this) : new FakeElement(tagName, this);
    }

    querySelector(selector) {
        if (selector === 'ytd-watch-flexy') return this.watchRoot;
        if (selector.includes('video')) return this.video;
        return null;
    }

    // A real document has this, and the feature walks it whenever it
    // reprocesses rendered cards (e.g. after Unblock). Returning an empty list
    // keeps these focused tests DOM-free without the fake pretending the
    // method is absent.
    querySelectorAll() {
        return [];
    }

    getElementById(id) {
        return id === 'movie_player' ? this.player : null;
    }

    addEventListener(type, callback, capture) {
        this.listeners.set(`${type}:${Boolean(capture)}`, callback);
    }

    removeEventListener(type, callback, capture) {
        const key = `${type}:${Boolean(capture)}`;
        if (this.listeners.get(key) === callback) this.listeners.delete(key);
    }

    dispatchCaptured(type, target) {
        this.listeners.get(`${type}:true`)?.({ target });
    }
}

function createTimerHarness() {
    const queue = [];
    return {
        queue,
        setTimeoutFn(callback) {
            const handle = { callback, cancelled: false };
            queue.push(handle);
            return handle;
        },
        clearTimeoutFn(handle) {
            if (handle) handle.cancelled = true;
        },
        runNext() {
            const handle = queue.shift();
            if (handle && !handle.cancelled) handle.callback();
        },
        runAll(limit = 100) {
            let count = 0;
            while (queue.length && count < limit) {
                this.runNext();
                count += 1;
            }
            return count;
        }
    };
}

function normalizeChannel(value) {
    const channelId = String(value?.channelId || '').trim();
    const url = String(value?.url || value?.id || '').trim();
    const idFromUrl = url.match(/\/channel\/([^/?#]+)/)?.[1] || '';
    const handle = url.match(/\/(\@[^/?#]+)/)?.[1] || '';
    const identity = channelId || idFromUrl || handle;
    if (!identity) return null;
    return { ...value, id: identity, channelId: channelId || idFromUrl, handle, url };
}

function channelKeys(value) {
    const normalized = normalizeChannel(value);
    return normalized ? [normalized.channelId, normalized.handle, normalized.id].filter(Boolean) : [];
}

function makeFeature(options = {}) {
    const documentRef = options.documentRef || new FakeDocument();
    const timers = options.timers || createTimerHarness();
    let path = '/watch';
    let videoId = VIDEO_A;
    let playerResponse = {
        videoDetails: { videoId: VIDEO_A, channelId: CHANNEL_ID, author: 'Blocked Creator' },
        microformat: { playerMicroformatRenderer: { ownerProfileUrl: `/channel/${CHANNEL_ID}` } }
    };
    let storedChannels = [{ channelId: CHANNEL_ID, id: CHANNEL_ID, name: 'Blocked Creator' }];
    const writes = [];
    let backCalls = 0;

    const feature = createHideVideosFromHomeFeature({
        documentRef,
        getCurrentPath: () => path,
        getVideoId: () => videoId,
        getPlayerResponseGlobal: () => playerResponse,
        normalizeBlockedChannelRecord: normalizeChannel,
        getBlockedChannelIdentityKeys: channelKeys,
        sanitizeImportedBlockedChannels: value => Array.isArray(value) ? value.map(normalizeChannel).filter(Boolean) : [],
        storageRead: (key, fallback) => key === 'ytkit-blocked-channels' ? storedChannels : fallback,
        storageWrite: (key, value) => {
            if (key === 'ytkit-blocked-channels') storedChannels = value;
            writes.push({ key, value });
        },
        setTimeoutFn: timers.setTimeoutFn,
        clearTimeoutFn: timers.clearTimeoutFn,
        navigateBack: () => { backCalls += 1; }
    });

    return {
        feature,
        documentRef,
        timers,
        writes,
        setPath(value) { path = value; },
        setVideoId(value) { videoId = value; },
        setPlayerResponse(value) { playerResponse = value; },
        getBackCalls() { return backCalls; },
        getStoredChannels() { return storedChannels; }
    };
}

test('blocked direct watch routes pause playback and expose an accessible decision dialog', () => {
    const { feature, documentRef } = makeFeature();

    feature._evaluateDirectWatchBlock();

    assert.equal(documentRef.video.paused, true);
    assert.equal(documentRef.video.pauseCalls, 1);
    assert.ok(feature._directWatchDialog);
    const dialog = feature._directWatchDialog;
    assert.equal(dialog.tagName, 'DIALOG');
    assert.equal(dialog.open, true);
    assert.equal(dialog.getAttribute('role'), 'alertdialog');
    assert.equal(dialog.getAttribute('aria-modal'), null, 'showModal is what makes it modal');
    assert.equal(dialog.getAttribute('aria-labelledby'), 'ytkit-blocked-watch-title');
    assert.equal(dialog.getAttribute('aria-describedby'), 'ytkit-blocked-watch-description');
    assert.equal(dialog.children[0].getAttribute('role'), null, 'the card is not a second dialog');
    assert.deepEqual(dialog.querySelectorAll('button').map(button => button.dataset.action), ['back', 'unblock', 'allow-once']);
    assert.equal(documentRef.activeElement.dataset.action, 'back');
    assert.equal(dialog.listeners.has('keydown'), false, 'the browser owns Tab and Escape');
});

function withToastRaise(harness, run) {
    const previous = globalThis.YTKitCore;
    globalThis.YTKitCore = { toast: { raiseActiveToasts: () => harness.documentRef.order.push('raise') } };
    try {
        return run();
    } finally {
        if (previous === undefined) delete globalThis.YTKitCore;
        else globalThis.YTKitCore = previous;
    }
}

const cancelEvent = () => {
    const event = { prevented: false, preventDefault() { event.prevented = true; } };
    return event;
};

test('a toast already up follows the blocked screen into the top layer', () => {
    const harness = makeFeature();
    withToastRaise(harness, () => harness.feature._evaluateDirectWatchBlock());
    assert.deepEqual(harness.documentRef.order, ['showModal', 'raise']);
});

test('the blocked screen still appears when the browser refuses a modal', () => {
    const harness = makeFeature();
    harness.documentRef.refuseModal = true;
    harness.feature._evaluateDirectWatchBlock();
    assert.ok(harness.feature._directWatchDialog);
    assert.equal(harness.feature._directWatchDialog.open, false);
    assert.equal(harness.documentRef.activeElement.dataset.action, 'back');
});

test('closing lets a hosted toast out before the dialog leaves the document', () => {
    const harness = makeFeature();
    withToastRaise(harness, () => {
        harness.feature._evaluateDirectWatchBlock();
        const dialog = harness.feature._directWatchDialog;
        harness.documentRef.order.length = 0;
        dialog.querySelector('[data-action="allow-once"]').click();
        assert.deepEqual(harness.documentRef.order, ['close', 'raise', 'remove']);
        assert.equal(dialog.open, false);
        assert.equal(dialog.isConnected, false);
    });
});

test('closing with nothing open touches no toast', () => {
    const harness = makeFeature();
    withToastRaise(harness, () => harness.feature._closeDirectWatchInterstitial());
    assert.deepEqual(harness.documentRef.order, []);
});

test('closing a dialog the browser refused to open never calls close', () => {
    const harness = makeFeature();
    harness.documentRef.refuseModal = true;
    harness.feature._evaluateDirectWatchBlock();
    const dialog = harness.feature._directWatchDialog;
    dialog.querySelector('[data-action="allow-once"]').click();
    assert.deepEqual(harness.documentRef.order, ['remove']);
});

test('Escape means Back and the screen stays up until the route changes', () => {
    const harness = makeFeature();
    harness.feature._evaluateDirectWatchBlock();
    const dialog = harness.feature._directWatchDialog;

    const event = cancelEvent();
    dialog.dispatch('cancel', event);

    assert.equal(event.prevented, true);
    assert.equal(harness.getBackCalls(), 1);
    assert.ok(harness.feature._directWatchDialog === dialog, 'still the same screen');
    assert.equal(dialog.open, true);
    assert.ok(dialog.querySelectorAll('button').every(button => button.disabled));
});

test('when the browser closes it anyway the screen comes back and still goes Back', () => {
    const harness = makeFeature();
    harness.feature._evaluateDirectWatchBlock();
    const dialog = harness.feature._directWatchDialog;

    dialog.open = false;
    dialog.dispatch('close');

    assert.equal(dialog.open, true);
    assert.equal(dialog.modalOpens, 2);
    assert.equal(harness.getBackCalls(), 1);
    assert.ok(harness.feature._directWatchDialog === dialog);
});

test('a refused reopen still goes Back', () => {
    const harness = makeFeature();
    harness.feature._evaluateDirectWatchBlock();
    const dialog = harness.feature._directWatchDialog;

    dialog.open = false;
    harness.documentRef.refuseModal = true;
    dialog.dispatch('close');

    assert.equal(harness.getBackCalls(), 1);
});

test('one Escape that arrives as cancel and then close goes back one entry', () => {
    const harness = makeFeature();
    harness.feature._evaluateDirectWatchBlock();
    const dialog = harness.feature._directWatchDialog;

    dialog.dispatch('cancel', cancelEvent());
    dialog.open = false;
    dialog.dispatch('close');

    assert.equal(harness.getBackCalls(), 1);
});

test('a repeated Escape goes back once, and a later one can try again', t => {
    t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    const harness = makeFeature();
    harness.feature._evaluateDirectWatchBlock();
    const dialog = harness.feature._directWatchDialog;

    dialog.dispatch('cancel', cancelEvent());
    t.mock.timers.tick(1999);
    dialog.dispatch('cancel', cancelEvent());
    assert.equal(harness.getBackCalls(), 1);

    t.mock.timers.tick(1);
    dialog.dispatch('cancel', cancelEvent());
    assert.equal(harness.getBackCalls(), 2);
});

test('going back from one blocked video to another can go back again at once', t => {
    t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    const harness = makeFeature();
    harness.feature._evaluateDirectWatchBlock();
    harness.feature._directWatchDialog.dispatch('cancel', cancelEvent());
    assert.equal(harness.getBackCalls(), 1);

    harness.setVideoId(VIDEO_B);
    harness.setPlayerResponse({ videoDetails: { videoId: VIDEO_B, channelId: CHANNEL_ID, author: 'Blocked Creator' } });
    harness.feature._evaluateDirectWatchBlock();
    harness.feature._directWatchDialog.dispatch('cancel', cancelEvent());
    assert.equal(harness.getBackCalls(), 2);
});

test('the dialog closing itself is not read as the browser closing it', () => {
    const harness = makeFeature();
    harness.feature._evaluateDirectWatchBlock();
    const dialog = harness.feature._directWatchDialog;
    dialog.querySelector('[data-action="allow-once"]').click();

    dialog.dispatch('close');

    assert.equal(dialog.open, false);
    assert.equal(dialog.modalOpens, 1);
    assert.equal(harness.getBackCalls(), 0);
});

test('a close left over from the last video cannot touch the next screen', () => {
    const harness = makeFeature();
    harness.feature._evaluateDirectWatchBlock();
    const first = harness.feature._directWatchDialog;

    harness.setVideoId(VIDEO_B);
    harness.setPlayerResponse({ videoDetails: { videoId: VIDEO_B, channelId: CHANNEL_ID, author: 'Blocked Creator' } });
    harness.feature._evaluateDirectWatchBlock();
    const second = harness.feature._directWatchDialog;
    assert.ok(second && second !== first, 'a new screen for the new video');

    first.dispatch('close');

    assert.equal(first.open, false);
    assert.equal(second.open, true);
    assert.equal(harness.getBackCalls(), 0);
});

test('a route change leaves focus alone and an explicit close puts it back', () => {
    const harness = makeFeature();
    const button = new FakeElement('button', harness.documentRef);
    harness.documentRef.activeElement = button;
    harness.feature._evaluateDirectWatchBlock();
    harness.setPath('/');
    harness.setVideoId(null);
    harness.feature._evaluateDirectWatchBlock();
    assert.equal(harness.documentRef.activeElement.dataset.action, 'back', 'the route change moved no focus');

    harness.setPath('/watch');
    harness.setVideoId(VIDEO_A);
    harness.documentRef.activeElement = button;
    harness.feature._evaluateDirectWatchBlock();
    harness.feature._directWatchDialog.querySelector('[data-action="allow-once"]').click();
    assert.ok(harness.documentRef.activeElement === button, 'focus is back where it was');
});

test('Allow once resumes only the current route and returning to it blocks again', async () => {
    const harness = makeFeature();
    harness.feature._evaluateDirectWatchBlock();

    harness.feature._directWatchDialog.querySelector('[data-action="allow-once"]').click();
    await Promise.resolve();
    assert.equal(harness.feature._directWatchDialog, null);
    assert.equal(harness.documentRef.video.paused, false);
    assert.equal(harness.documentRef.video.playCalls, 1);

    harness.feature._evaluateDirectWatchBlock();
    assert.equal(harness.feature._directWatchDialog, null, 'same route remains allowed');

    harness.setPath('/feed/subscriptions');
    harness.setVideoId(null);
    harness.feature._evaluateDirectWatchBlock();
    harness.setPath('/watch');
    harness.setVideoId(VIDEO_A);
    harness.feature._evaluateDirectWatchBlock();
    assert.ok(harness.feature._directWatchDialog, 'returning to the route requires a new decision');
});

test('Unblock removes the normalized channel, persists it, and resumes prior playback', async () => {
    const harness = makeFeature();
    harness.feature._evaluateDirectWatchBlock();

    // Unblocking now reprocesses rendered cards so the channel's already-hidden
    // rail entries come back in the same pageview, and that walks the document.
    const previousDocument = globalThis.document;
    globalThis.document = harness.documentRef;
    try {
        harness.feature._directWatchDialog.querySelector('[data-action="unblock"]').click();
        await Promise.resolve();
    } finally {
        // The refresh is debounced, so cancel it before the fake document goes
        // away — otherwise it fires after the test and walks a missing DOM.
        if (harness.feature._processAllDebounceTimer) {
            clearTimeout(harness.feature._processAllDebounceTimer);
            harness.feature._processAllDebounceTimer = null;
        }
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }

    assert.equal(harness.feature._directWatchDialog, null);
    assert.deepEqual(harness.getStoredChannels(), []);
    assert.deepEqual(harness.writes.at(-1), { key: 'ytkit-blocked-channels', value: [] });
    assert.equal(harness.documentRef.video.paused, false);
});

test('Back keeps playback guarded until navigation completes', () => {
    const harness = makeFeature();
    harness.feature._evaluateDirectWatchBlock();

    harness.feature._directWatchDialog.querySelector('[data-action="back"]').click();
    assert.equal(harness.getBackCalls(), 1);
    assert.ok(harness.feature._directWatchDialog);
    assert.ok(harness.feature._directWatchDialog.querySelectorAll('button').every(button => button.disabled));

    harness.documentRef.video.paused = false;
    harness.documentRef.dispatchCaptured('play', harness.documentRef.video);
    assert.equal(harness.documentRef.video.paused, true);
});

test('stale player responses cannot block the wrong SPA route', () => {
    const harness = makeFeature();
    harness.setVideoId(VIDEO_B);
    harness.feature._evaluateDirectWatchBlock();
    assert.equal(harness.feature._directWatchDialog, null);
    assert.equal(harness.timers.queue.length, 1);

    harness.setPlayerResponse({
        videoDetails: { videoId: VIDEO_B, channelId: CHANNEL_ID, author: 'Blocked Creator' }
    });
    harness.timers.runNext();
    assert.ok(harness.feature._directWatchDialog);
});

test('modern watch-owner DOM resolves channel identity when player data is unavailable', () => {
    const harness = makeFeature();
    const root = new FakeElement('ytd-watch-flexy', harness.documentRef);
    root.setAttribute('video-id', VIDEO_A);
    const link = new FakeElement('a', harness.documentRef);
    link.setAttribute('href', `/channel/${CHANNEL_ID}`);
    link.textContent = 'Blocked Creator';
    root.querySelector = () => link;
    harness.documentRef.watchRoot = root;
    harness.setPlayerResponse(null);

    harness.feature._evaluateDirectWatchBlock();

    assert.ok(harness.feature._directWatchDialog);
    assert.equal(harness.documentRef.video.paused, true);
});

test('missing channel identity fails open after bounded retries without loops', () => {
    const harness = makeFeature();
    harness.setPlayerResponse(null);

    harness.feature._evaluateDirectWatchBlock();
    const retryCount = harness.timers.runAll();

    assert.equal(retryCount, 31);
    assert.equal(harness.timers.queue.length, 0);
    assert.equal(harness.feature._directWatchDialog, null);
    assert.equal(harness.documentRef.video.pauseCalls, 0);
});

test('route cleanup cancels identity retries and removes playback guards', () => {
    const harness = makeFeature();
    harness.feature._evaluateDirectWatchBlock();
    assert.ok(harness.documentRef.listeners.has('play:true'));

    harness.setPath('/');
    harness.setVideoId(null);
    harness.feature._evaluateDirectWatchBlock();

    assert.equal(harness.feature._directWatchDialog, null);
    assert.equal(harness.documentRef.listeners.has('play:true'), false);
    assert.equal(harness.feature._directWatchRouteKey, null);
});
