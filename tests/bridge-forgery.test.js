'use strict';

// The acceptance test for the bridge hardening, driven end to end against the
// real `ytkit-main.js`.
//
// Two things a page script can do, and neither may reach the bridge:
//
//   * write `<html data-ytkit-codec="...">`. It used to be read directly, so
//     any script on youtube.com could pick the codec the player was allowed to
//     use. Now the bridge reads the sealed copy and the attribute is decor.
//   * dispatch a navigation event. `yt-navigate-finish` is a CustomEvent
//     YouTube itself dispatches, so a listener cannot tell YouTube's from a
//     forgery — same type, same isTrusted, same everything. The bridge stopped
//     listening to it and listens for one the isolated world seals instead.
//
// And the natives: the bridge takes its DOM and JSON entry points at
// document_start, before page script exists, so replacing them afterwards
// changes nothing.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { installBridgeChannel, bridgeChannel } = require('./helpers/main-bridge');

const VP9 = 'video/webm; codecs="vp09.00.10.08"';

const repoRoot = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit-main.js'), 'utf8');
const guardSource = fs.readFileSync(
    path.join(repoRoot, 'extension', 'core', 'injection-guard.js'), 'utf8');

/** A MAIN world with a fake `<html>`, wired the way the manifest wires it. */
function mainWorld({ codec = 'auto' } = {}) {
    const attributes = new Map();
    const observers = new Set();
    const windowListeners = new Map();
    const documentListeners = new Map();

    const fire = (name) => {
        for (const observer of [...observers]) {
            if (observer.active) observer.callback([{ type: 'attributes', attributeName: name }]);
        }
    };

    const documentElement = {
        getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
        setAttribute(name, value) { attributes.set(name, String(value)); fire(name); },
        removeAttribute(name) { if (attributes.delete(name)) fire(name); },
        classList: { add() {}, remove() {}, contains() { return false; } },
        style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } },
    };

    class FakeMutationObserver {
        constructor(callback) { this.callback = callback; this.active = false; observers.add(this); }
        observe() { this.active = true; }
        disconnect() { this.active = false; }
    }

    const addListener = (registry, type, callback) => {
        if (!registry.has(type)) registry.set(type, []);
        registry.get(type).push(callback);
    };

    const originalCanPlayType = function canPlayType() { return 'probably'; };
    const context = {
        MutationObserver: FakeMutationObserver,
        MediaSource: { isTypeSupported: () => true },
        HTMLVideoElement: function HTMLVideoElement() {},
        YTKitCore: {},
        document: {
            documentElement,
            readyState: 'complete',
            querySelector: () => null,
            querySelectorAll: () => [],
            getElementById: () => null,
            addEventListener: (type, callback) => addListener(documentListeners, type, callback),
            removeEventListener() {},
        },
        location: { href: 'https://www.youtube.com/watch?v=forgery', pathname: '/watch' },
        console, Promise, Math, Number, Set, Map, WeakMap, JSON, Date, Infinity, Array, Object, String,
        setTimeout(callback) { callback(); return 1; },
        clearTimeout() {},
        setInterval() { return 1; },
        clearInterval() {},
    };
    context.HTMLVideoElement.prototype = { canPlayType: originalCanPlayType };
    context.addEventListener = (type, callback) => addListener(windowListeners, type, callback);
    context.removeEventListener = () => {};
    context.dispatchEvent = (event) => {
        for (const callback of windowListeners.get(event.type) || []) callback(event);
        return true;
    };
    context.window = context;
    context.self = context;
    context.globalThis = context;

    vm.createContext(context);
    vm.runInContext(guardSource, context, { filename: 'extension/core/injection-guard.js' });

    const channel = installBridgeChannel(documentElement, context.YTKitCore,
        { windowListeners, documentListeners });
    // `codec: null` leaves the sealed state genuinely empty, which is the case
    // that catches a bridge falling back to the attribute when it finds
    // nothing sealed.
    if (codec !== null) channel.publish('data-ytkit-codec', codec);

    vm.runInContext(mainSource, context, { filename: 'extension/ytkit-main.js' });

    return {
        context,
        channel,
        documentElement,
        attributes,
        originalCanPlayType,
        isPatched: () => context.HTMLVideoElement.prototype.canPlayType !== originalCanPlayType,
        canPlayType: (type) => context.HTMLVideoElement.prototype.canPlayType.call({}, type),
    };
}

test('the token is gone from the page before any page script could read it', () => {
    const world = mainWorld();
    assert.equal(world.documentElement.getAttribute(bridgeChannel.TOKEN_ATTR), null,
        'the bridge takes the token as it starts; a token left behind is a token the page has');
    assert.ok(world.channel.token, 'and it really was handed over');
});

test('a forged attribute write does not reach the bridge', () => {
    const world = mainWorld({ codec: 'h264' });
    assert.equal(world.canPlayType(VP9), '', 'h264 is enforced, so vp9 is blocked');

    // Exactly what a page script can do: write the attribute the bridge used
    // to read, and wake its observer doing so.
    world.channel.forge('data-ytkit-codec', 'auto');
    assert.equal(world.documentElement.getAttribute('data-ytkit-codec'), 'auto',
        'the attribute really did change, so this is a real attempt');

    assert.equal(world.canPlayType(VP9), '',
        'the codec the player may use must not follow an attribute the page can write');
});

test('a forged value for a key nothing published is not read either', () => {
    // The sharper version of the test above. Forging over a value that IS
    // sealed can be refused just by preferring the sealed copy; forging a key
    // the isolated world never published is what catches a bridge that falls
    // back to the attribute when it finds nothing sealed.
    const world = mainWorld({ codec: null });
    assert.equal(world.channel.writer.get('data-ytkit-codec'), null,
        'nothing has been published for this key');
    assert.equal(world.canPlayType(VP9), 'probably', 'nothing is enforced yet');

    world.channel.forge('data-ytkit-codec', 'h264');
    assert.equal(world.documentElement.getAttribute('data-ytkit-codec'), 'h264');
    assert.equal(world.canPlayType(VP9), 'probably',
        'an unsealed attribute is not a value, however empty the sealed state is');
});

test('the navigate check is the channel\'s, not a rewrite of it', () => {
    // `_isOwnNavigate` is three lines delegating to the reader, and the
    // reader's own refusal is covered in tests/bridge-channel.test.js. What
    // this pins is the delegation: a wrapper that decided for itself would be
    // a second, unreviewed answer to "is this our event".
    assert.match(mainSource, /_bridgeReader\.isOwnNavigate\(event\)/,
        'the wrapper must ask the channel, not re-implement the check');
    const wrapper = mainSource.slice(
        mainSource.indexOf('function _isOwnNavigate(event) {'),
        mainSource.indexOf('function _isOwnNavigate(event) {') + 200);
    assert.doesNotMatch(wrapper, /return Boolean\(event\);/,
        'accepting any event is exactly the bug the token exists to stop');
});

test('the isolated world can still change the same value', () => {
    // The control. If the bridge ignored everything, the test above would
    // pass for the wrong reason.
    const world = mainWorld({ codec: 'auto' });
    assert.equal(world.canPlayType(VP9), 'probably', 'auto blocks nothing');

    world.channel.publish('data-ytkit-codec', 'h264');
    assert.equal(world.canPlayType(VP9), '', 'a sealed change is applied');

    world.channel.publish('data-ytkit-codec', 'auto');
    assert.equal(world.canPlayType(VP9), 'probably', 'and withdrawn again');
});

test('a forged navigate is not a navigation', () => {
    const world = mainWorld({ codec: 'h264' });

    // The old channel: YouTube's own event names, dispatched by anyone.
    for (const type of ['yt-navigate-finish', 'yt-page-data-updated']) {
        assert.doesNotThrow(() => world.context.dispatchEvent({ type }));
    }
    // And the new name, without the token.
    assert.doesNotThrow(() => world.context.dispatchEvent(world.channel.forgedNavigate()));

    assert.equal(world.isPatched(), true, 'the bridge is still doing its job');
    assert.equal(world.canPlayType(VP9), '',
        'and none of those events changed what it enforces');
});

test('a sealed navigate from the isolated world is accepted', () => {
    const world = mainWorld({ codec: 'h264' });
    assert.doesNotThrow(() => world.context.dispatchEvent(world.channel.navigate()));
    assert.equal(world.isPatched(), true);
});

test('the bridge no longer listens to a page event by name', () => {
    // Exhaustive over the source: the claim is that NO listener anywhere in
    // the bridge is bound to an event a page script can name.
    assert.doesNotMatch(mainSource, /addEventListener\('yt-navigate-finish'/,
        'YouTube\'s navigate event and a forged one are the same object to a listener');
    assert.doesNotMatch(mainSource, /addEventListener\('yt-page-data-updated'/);
    assert.match(mainSource, /_isOwnNavigate\(event\)/,
        'every navigate handler has to check the token');
});

test('the bridge holds its own DOM and JSON natives from document_start', () => {
    const world = mainWorld({ codec: 'h264' });

    // Page script replacing the entry points the bridge uses. It runs after
    // document_start, so it is replacing references the bridge already took.
    world.context.MutationObserver = function Hijacked() {
        throw new Error('page script must not receive the bridge observer');
    };
    world.context.JSON = {
        parse() { throw new Error('page script must not parse the bridge payload'); },
        stringify() { throw new Error('nor serialize it'); },
    };

    assert.doesNotThrow(() => world.channel.publish('data-ytkit-codec', 'auto'),
        'the bridge must not route through natives the page has replaced');
    assert.equal(world.canPlayType(VP9), 'probably', 'and the sealed change still applied');
});

test('the natives are captured before anything else in the bridge runs', () => {
    // Ordering inside one file. `_NATIVE` has to be built before the first
    // thing that uses a native, or the capture is decoration.
    const nativeAt = mainSource.indexOf('var _NATIVE = (function()');
    const observerAt = mainSource.indexOf('new _NATIVE.MutationObserver(');
    const readerAt = mainSource.indexOf('createBridgeReader({');
    assert.ok(nativeAt > 0 && observerAt > 0 && readerAt > 0, 'all three must exist');
    assert.ok(nativeAt < readerAt, 'the reader parses with a captured JSON.parse');
    assert.ok(nativeAt < observerAt, 'and the observer is the captured constructor');
});

test('the bridge publishes its reader for the other MAIN-world modules', () => {
    // `core/audio-track.js` runs in the same world and reads three of these
    // preferences. It has no channel of its own, so it borrows this one; if
    // the bridge stops publishing it, that module quietly goes back to
    // reading `<html>` where any page script can write.
    const world = mainWorld({ codec: 'h264' });
    const reader = world.context.YTKitCore.mainBridgeReader;

    assert.ok(reader, 'the reader has to be reachable from YTKitCore');
    assert.equal(typeof reader.get, 'function');
    assert.equal(reader.get('data-ytkit-codec'), 'h264',
        'and it has to be the live one, not an empty stand-in');

    world.channel.forge('data-ytkit-audio-language', 'de');
    assert.equal(reader.get('data-ytkit-audio-language'), null,
        'a forged attribute is not readable through it either');
});

test('every bridge input is read through the channel, not off the document', () => {
    // Behavioural coverage reaches two of these (the codec pair). The claim
    // is about all twenty-one, and reverting any one of the other nineteen to
    // `document.documentElement.getAttribute(...)` hands that feature back to
    // the page with nothing going red. An exhaustive source sweep is what
    // makes the set complete; the codec tests above are what prove the
    // mechanism works.
    const reads = [...mainSource.matchAll(/_bridgeGet\(([^)]+)\)/g)].map((m) => m[1].trim());
    assert.ok(reads.length >= 19,
        `expected the bridge's inputs to go through the channel, saw ${reads.length}`);

    assert.doesNotMatch(mainSource, /document\.documentElement\.getAttribute\(/,
        'a read straight off the document is an input the page can write');

    // The two OUTPUT attributes are the deliberate exception: the bridge
    // writes them, so it reads them back through the captured native to
    // dedupe. They must not be read through the channel, which never carries
    // them, and they must not be read through the live global either.
    const nativeReads = [...mainSource.matchAll(/_NATIVE\.getAttribute\(([^)]+)\)/g)]
        .map((m) => m[1].trim());
    assert.deepEqual(nativeReads.sort(), ['REASON_ATTR', 'STATUS_ATTR'],
        'only the bridge\'s own outputs may be read back off the attribute');
});
