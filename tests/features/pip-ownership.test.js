'use strict';

// Cross-tab Picture-in-Picture ownership. `__ytkit_videoPopped` coordinates PiP
// within ONE page; nothing coordinated across tabs, so popping out in a second
// tab left the first still playing into the same speakers. What is guaranteed
// here is that the losing tab stops playing and clears its own state — what the
// browser does with the other PiP window varies by engine and is not asserted.

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { sources } = require('../helpers/source');

// Lift the helper out of the monolith and give it a fake BroadcastChannel so
// two "tabs" can be driven against each other in-process.
function loadOwnership(makeChannel) {
    const start = sources.ytkit.indexOf('const PipOwnership = (() => {');
    const end = sources.ytkit.indexOf('\n    })();', start) + '\n    })();'.length;
    assert.ok(start > -1 && end > start, 'the PipOwnership helper must exist');
    const sandbox = {
        console,
        BroadcastChannel: makeChannel,
        DebugManager: { log() {} }
    };
    return vm.runInNewContext(`${sources.ytkit.slice(start, end)}\nPipOwnership`, sandbox);
}

// A shared bus: every channel on the same name receives the others' messages,
// which is what BroadcastChannel does between tabs.
function makeBus() {
    const peers = [];
    function Channel(name) {
        const self = { name, onmessage: null, closed: false };
        self.postMessage = (data) => {
            for (const peer of peers) {
                if (peer === self || peer.closed || peer.name !== name) continue;
                peer.onmessage?.({ data });
            }
        };
        self.close = () => { self.closed = true; };
        peers.push(self);
        return self;
    }
    return { Channel, peers };
}

test('a second tab claiming PiP releases the first', () => {
    const bus = makeBus();
    const tabA = loadOwnership(bus.Channel);
    const tabB = loadOwnership(bus.Channel);

    let aReleased = 0;
    let bReleased = 0;

    assert.equal(tabA.claim(() => { aReleased += 1; }), true);
    assert.equal(aReleased, 0, 'claiming must not release the claimer');

    tabB.claim(() => { bReleased += 1; });
    assert.equal(aReleased, 1, 'the tab that had PiP must give it up');
    assert.equal(bReleased, 0);

    // Ownership is not re-delivered: A already let go.
    tabB.claim(() => { bReleased += 1; });
    assert.equal(aReleased, 1, 'a released tab must not be told twice');
});

test('the loser stops holding local state so a later claim is a no-op for it', () => {
    const bus = makeBus();
    const tabA = loadOwnership(bus.Channel);
    const tabB = loadOwnership(bus.Channel);

    tabA.claim(() => {});
    assert.equal(tabA._state().holdsLocal, true);
    tabB.claim(() => {});
    assert.equal(tabA._state().holdsLocal, false, 'the losing tab must drop its handler');

    // And an explicit release (PiP closed by the user) does the same.
    assert.equal(tabB._state().holdsLocal, true);
    tabB.release();
    assert.equal(tabB._state().holdsLocal, false);
});

test('a denied BroadcastChannel degrades instead of throwing', () => {
    const ownership = loadOwnership(function () { throw new Error('site data blocked'); });
    // Browser privacy settings can deny site-data APIs; PiP must still work,
    // just without cross-tab coordination.
    assert.equal(ownership.claim(() => {}), false);
    assert.equal(ownership._state().hasChannel, false);
    assert.doesNotThrow(() => ownership.release());
    assert.doesNotThrow(() => ownership.close());
});

test('a handler that throws does not break the claiming tab', () => {
    const bus = makeBus();
    const tabA = loadOwnership(bus.Channel);
    const tabB = loadOwnership(bus.Channel);

    tabA.claim(() => { throw new Error('window already gone'); });
    assert.doesNotThrow(() => tabB.claim(() => {}),
        'a torn-down PiP window in another tab must not break this one');
    assert.equal(tabA._state().holdsLocal, false);
});

test('every PiP entry point claims and releases ownership', () => {
    // Three code paths open PiP: popOutPlayer's Document PiP, its legacy
    // fallback, and pipButton. If one skips the announcement the handoff
    // depends on which button the user pressed.
    const claims = sources.ytkit.match(/PipOwnership\.claim\(/g) || [];
    assert.equal(claims.length, 3, 'all three PiP entry points must claim ownership');

    const releases = sources.ytkit.match(/PipOwnership\.release\(\)/g) || [];
    assert.ok(releases.length >= 3, 'each entry point must release when its PiP ends');

    // The losing tab pauses; that is the symptom being fixed.
    assert.match(sources.ytkit, /PipOwnership\.claim\(\(\) => \{[\s\S]{0,260}?video\.pause\(\);/,
        'the loss handler must stop playback, not just close a window');
});

test('PiP ownership does not ride on the pauseOtherTabs channel', () => {
    const start = sources.ytkit.indexOf('const PipOwnership = (() => {');
    const block = sources.ytkit.slice(start, start + 2600);
    assert.match(block, /const CHANNEL_NAME = 'ytkit-pip-ownership';/,
        'pauseOtherTabs is independently toggleable — PiP handoff must not depend on it being on');
});
