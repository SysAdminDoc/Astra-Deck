'use strict';

// The MAIN-world bridge shares a realm and a DOM with YouTube's scripts and
// with anything injected beside them. It took its commands off `<html
// data-ytkit-*>` attributes and its timing off page events, every one of which
// a page script can write or dispatch.
//
// This is the channel that replaces that. What it has to be true of:
//
//   * a value the isolated world never published is never read,
//   * a payload whose seal does not match is refused whole,
//   * an old payload cannot be replayed to roll state back,
//   * and a navigate event without the token is not a navigation.
//
// Honest about the limit, and the module says so too: the seal is a keyed
// non-cryptographic hash, because both ends run synchronously at
// document_start and SubtleCrypto is async. It stops a page script that has
// to forge in real time without the token. It is not a defence against
// something that can read the isolated world's memory, and no content script
// could offer one.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createBridgeWriter,
    createBridgeReader,
    bridgeChannel,
} = require('../extension/core/bridge-channel.js');

/** A `<html>` stand-in that records what is on it. */
function fakeRoot(initial = {}) {
    const attrs = { ...initial };
    return {
        attrs,
        getAttribute: (name) => (Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null),
        setAttribute: (name, value) => { attrs[name] = String(value); },
        removeAttribute: (name) => { delete attrs[name]; },
    };
}

function pair(options = {}) {
    const element = options.element || fakeRoot();
    const writer = createBridgeWriter({ documentElement: element, token: options.token });
    const reader = createBridgeReader({ documentElement: element, token: writer.token });
    return { element, writer, reader };
}

test('a value the isolated world published is the value the bridge reads', () => {
    const { writer, reader } = pair();
    writer.set('data-ytkit-codec', 'av01');
    assert.equal(reader.sync(), true, 'the sealed payload is accepted');
    assert.equal(reader.get('data-ytkit-codec'), 'av01');
    assert.equal(reader.get('data-ytkit-quality'), null, 'and nothing else is invented');
});

test('a page script writing the plain attribute changes nothing', () => {
    const { element, writer, reader } = pair();
    writer.set('data-ytkit-codec', 'av01');
    reader.sync();

    // What a page script can do: write the attribute the old bridge read.
    element.setAttribute('data-ytkit-codec', 'vp9');
    assert.equal(reader.sync(), false, 'there is no new sealed payload to accept');
    assert.equal(reader.get('data-ytkit-codec'), 'av01',
        'the bridge reads the sealed copy, not the attribute a page can write');
});

test('a forged payload is refused, and refusing it does not disturb what was accepted', () => {
    const { element, writer, reader } = pair();
    writer.set('data-ytkit-codec', 'av01');
    reader.sync();
    const before = reader.rejectedCount;

    element.setAttribute(bridgeChannel.STATE_ATTR, JSON.stringify({ n: 99, v: { 'data-ytkit-codec': 'vp9' } }));
    assert.equal(reader.sync(), false, 'a payload with no valid seal is not state');
    assert.equal(reader.rejectedCount, before + 1, 'and the refusal is counted');
    assert.equal(reader.get('data-ytkit-codec'), 'av01');
});

test('a seal copied from an older payload does not authenticate a new one', () => {
    const { element, writer, reader } = pair();
    writer.set('data-ytkit-codec', 'av01');
    reader.sync();
    const stolenSeal = element.getAttribute(bridgeChannel.SEAL_ATTR);

    element.setAttribute(bridgeChannel.STATE_ATTR, JSON.stringify({ n: 500, v: { 'data-ytkit-codec': 'vp9' } }));
    element.setAttribute(bridgeChannel.SEAL_ATTR, stolenSeal);
    assert.equal(reader.sync(), false, 'a seal belongs to one payload only');
    assert.equal(reader.get('data-ytkit-codec'), 'av01');
});

test('an old payload cannot be replayed to roll a setting back', () => {
    const { element, writer, reader } = pair();
    writer.set('data-ytkit-resource-unlock', 'on');
    reader.sync();
    const oldPayload = element.getAttribute(bridgeChannel.STATE_ATTR);
    const oldSeal = element.getAttribute(bridgeChannel.SEAL_ATTR);

    writer.clear('data-ytkit-resource-unlock');
    reader.sync();
    assert.equal(reader.get('data-ytkit-resource-unlock'), null, 'the user turned it off');

    // Both halves are genuine and match each other. Only the counter says no.
    element.setAttribute(bridgeChannel.STATE_ATTR, oldPayload);
    element.setAttribute(bridgeChannel.SEAL_ATTR, oldSeal);
    assert.equal(reader.sync(), false, 'a payload older than the last accepted one is stale');
    assert.equal(reader.get('data-ytkit-resource-unlock'), null,
        'replaying it must not switch the feature back on');
});

test('a reader with a different token accepts nothing', () => {
    const element = fakeRoot();
    const writer = createBridgeWriter({ documentElement: element, token: 'a'.repeat(64) });
    const reader = createBridgeReader({ documentElement: element, token: 'b'.repeat(64) });
    writer.set('data-ytkit-codec', 'av01');
    assert.equal(reader.sync(), false);
    assert.equal(reader.get('data-ytkit-codec'), null);
});

test('the token is taken out of the DOM as the bridge picks it up', () => {
    const element = fakeRoot({ [bridgeChannel.TOKEN_ATTR]: 'c'.repeat(64) });
    const reader = createBridgeReader({ documentElement: element });

    assert.equal(reader.token, 'c'.repeat(64), 'the bridge has it');
    assert.equal(element.getAttribute(bridgeChannel.TOKEN_ATTR), null,
        'and the page cannot read it afterwards; this runs before any page script');
});

test('a bridge that never received a token reads nothing at all', () => {
    const element = fakeRoot();
    const writer = createBridgeWriter({ documentElement: element, token: 'd'.repeat(64) });
    const reader = createBridgeReader({ documentElement: element });
    writer.set('data-ytkit-codec', 'av01');

    assert.equal(reader.token, null);
    assert.equal(reader.sync(), false, 'no token means no trusted channel');
    assert.equal(reader.get('data-ytkit-codec'), null,
        'failing closed is right: the features stay off rather than run on unverified input');

    // And it must not fall back to sealing with nothing. The algorithm is in
    // the shipped source, so a page script facing a tokenless bridge would
    // just seal its own payload with the same empty token and be believed.
    //
    // A tokenless reader would seal with `undefined`, and the seal is built by
    // string concatenation, so a writer holding the literal string 'undefined'
    // produces byte-identical output. That is the forgery, spelled out.
    for (const spelling of ['undefined', 'null', '']) {
        const forged = fakeRoot();
        createBridgeWriter({ documentElement: forged, token: spelling })
            .set('data-ytkit-resource-unlock', 'on');
        const victim = createBridgeReader({ documentElement: forged });
        assert.equal(victim.token, null, 'this bridge was never handed a token');
        assert.equal(victim.sync(), false,
            `a payload sealed with ${JSON.stringify(spelling)} must not authenticate`);
        assert.equal(victim.get('data-ytkit-resource-unlock'), null,
            'a bridge with no token has to stay dark, not fall back to a guessable one');
    }
});

test('a validly sealed payload of the wrong shape is still refused', () => {
    // The seal proves who wrote it, not that what they wrote makes sense. A
    // bug on the isolated side must not be able to put the bridge into a state
    // it cannot describe.
    const element = fakeRoot();
    const token = 'f'.repeat(64);
    const reader = createBridgeReader({ documentElement: element, token });

    for (const payload of ['{"n":1}', '{"v":{}}', '[]', '"a string"', 'null', '{"n":"1","v":{}}', '{"n":1,"v":[]}']) {
        // Seal it properly by handing the writer a stringify that returns it.
        createBridgeWriter({ documentElement: element, token, stringify: () => payload })
            .set('data-ytkit-codec', 'av01');
        assert.equal(reader.sync(), false, `${payload} is sealed but is not a state`);
    }

    // The control: the same route with a well-formed payload IS accepted, so
    // the loop above is refusing the shape and not the route.
    createBridgeWriter({ documentElement: element, token }).set('data-ytkit-codec', 'av01');
    assert.equal(reader.sync(), true);
    assert.equal(reader.get('data-ytkit-codec'), 'av01');
});

test('a value too large to seal is never published', () => {
    // The bound belongs on the writer as well as the reader: a huge value
    // would otherwise be sealed, and a sealed payload is one the bridge
    // trusts enough to parse.
    const { element, writer, reader } = pair();
    writer.set('data-ytkit-codec', 'av01');
    reader.sync();

    assert.equal(writer.set('data-ytkit-quality', 'x'.repeat(bridgeChannel.MAX_PAYLOAD_BYTES + 1)), null,
        'an oversized value is refused rather than published');
    assert.equal(reader.sync(), false, 'so there is no new payload to read');
    assert.equal(reader.get('data-ytkit-quality'), null);
    assert.equal(reader.get('data-ytkit-codec'), 'av01', 'and the last good state is untouched');
    assert.ok(element.getAttribute(bridgeChannel.STATE_ATTR).length <= bridgeChannel.MAX_PAYLOAD_BYTES);
});

test('a navigate event counts only when it carries the token', () => {
    const { writer, reader } = pair();
    assert.equal(reader.isOwnNavigate({ detail: { token: writer.token } }), true);
    assert.equal(reader.isOwnNavigate({ detail: { token: 'e'.repeat(64) } }), false,
        'a forged event is the reason the bridge stopped listening to yt-navigate-finish');
    assert.equal(reader.isOwnNavigate({ detail: {} }), false);
    assert.equal(reader.isOwnNavigate({}), false);
    assert.equal(reader.isOwnNavigate(null), false);
});

test('the isolated world dispatches its own navigate, and it is the one that counts', () => {
    const element = fakeRoot();
    const sent = [];
    const writer = createBridgeWriter({
        documentElement: element,
        eventTarget: { dispatchEvent: (event) => { sent.push(event); return true; } },
        CustomEvent: class {
            constructor(type, init) { this.type = type; this.detail = (init || {}).detail; }
        },
    });
    const reader = createBridgeReader({ documentElement: element, token: writer.token });

    assert.equal(writer.notifyNavigate('watch'), true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, bridgeChannel.NAVIGATE_EVENT,
        'a name of our own, because YouTube\'s cannot be told from a forged one');
    assert.equal(sent[0].detail.reason, 'watch');
    assert.equal(reader.isOwnNavigate(sent[0]), true);
});

test('a payload that is not an object, or not JSON at all, is refused', () => {
    const { element, writer, reader } = pair();
    writer.set('data-ytkit-codec', 'av01');
    reader.sync();

    for (const payload of ['not json', '[]', '"a string"', 'null', '{"n":1}', '{"v":{}}']) {
        element.setAttribute(bridgeChannel.STATE_ATTR, payload);
        element.setAttribute(bridgeChannel.SEAL_ATTR, 'whatever');
        assert.equal(reader.sync(), false, `${payload} is not a sealed state`);
    }
    assert.equal(reader.get('data-ytkit-codec'), 'av01', 'and none of it disturbed what was accepted');
});

test('an enormous payload is refused rather than parsed', () => {
    const { element, reader } = pair();
    element.setAttribute(bridgeChannel.STATE_ATTR, 'x'.repeat(bridgeChannel.MAX_PAYLOAD_BYTES + 1));
    element.setAttribute(bridgeChannel.SEAL_ATTR, 'whatever');
    assert.equal(reader.sync(), false, 'a page script must not be able to hand the bridge a megabyte to chew');
});

test('two tokens generated in a row are different, and long enough to be worth having', () => {
    const first = bridgeChannel.randomToken();
    const second = bridgeChannel.randomToken();
    assert.notEqual(first, second);
    assert.match(first, /^[0-9a-f]{64}$/, '256 bits, hex');
});

test('clearing a value removes it rather than blanking it', () => {
    const { writer, reader } = pair();
    writer.set('data-ytkit-quality', 'on');
    reader.sync();
    assert.equal(reader.get('data-ytkit-quality'), 'on');

    writer.clear('data-ytkit-quality');
    reader.sync();
    assert.equal(reader.get('data-ytkit-quality'), null,
        'the feature is off, not set to the empty string');
});

test('the writer seals what it was told, not what the DOM currently says', () => {
    // Sealing over the live DOM would bless a page script's forged attribute
    // on the next legitimate write.
    const { element, writer, reader } = pair();
    writer.set('data-ytkit-codec', 'av01');
    reader.sync();

    element.setAttribute('data-ytkit-quality', 'on');   // forged by a page script
    writer.set('data-ytkit-codec', 'vp9');              // an unrelated legitimate write
    reader.sync();

    assert.equal(reader.get('data-ytkit-codec'), 'vp9', 'the real write lands');
    assert.equal(reader.get('data-ytkit-quality'), null,
        'and the forged attribute is not adopted along with it');
});
