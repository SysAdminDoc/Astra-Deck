// Astra Deck - bridge token bootstrap (ISOLATED world, document_start)
//
// Runs before the MAIN-world bridge and before any page script. Generates the
// per-page token, keeps it in the isolated world's own realm — which page
// scripts cannot reach — and leaves a copy on <html> just long enough for the
// bridge to take it. `createBridgeReader` removes the attribute as it reads,
// still inside document_start, so by the time YouTube's first script runs
// there is nothing on the page to find.
//
// Ordering is the whole trick and it is not incidental: Chrome runs content
// scripts in manifest order within a run_at, this entry is listed before the
// MAIN entry, and both are document_start. If that ever changes the bridge
// gets no token, and a bridge with no token reads nothing at all rather than
// falling back to trusting the DOM.
//
// This file stands alone on purpose. Chrome injects a script file once per
// frame even when two content_scripts entries list it, and the first entry to
// name it wins. This entry used to list `core/bridge-channel.js` ahead of this
// file, so the MAIN entry's copy was skipped: the MAIN world never had
// `createBridgeReader`, never took the token, and every sealed read came back
// empty. The isolated world gets the channel module later, from the runtime
// loader. The two names below must match `bridgeChannel.TOKEN_ATTR` and
// `bridgeChannel.TOKEN_GLOBAL`; tests/bridge-isolated-side.test.js holds them
// together.

(function () {
    'use strict';

    var TOKEN_ATTR = 'data-ytkit-bridge-token';
    var TOKEN_GLOBAL = '__ytkitBridgeToken';

    var root = typeof globalThis !== 'undefined' ? globalThis : this;

    // One token per document. A re-injection (an extension update mid-session)
    // must not rotate it out from under a bridge that already took the first.
    if (typeof root[TOKEN_GLOBAL] === 'string' && root[TOKEN_GLOBAL]) return;

    var bytes = new Uint8Array(32);
    var source = root.crypto;
    if (source && typeof source.getRandomValues === 'function') {
        source.getRandomValues(bytes);
    } else {
        // Only reachable in a runtime with no WebCrypto at all. Still
        // unguessable enough to be worth having.
        for (var i = 0; i < bytes.length; i += 1) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }
    var token = '';
    for (var j = 0; j < bytes.length; j += 1) {
        token += (bytes[j] + 0x100).toString(16).slice(1);
    }
    root[TOKEN_GLOBAL] = token;

    try {
        if (document && document.documentElement) {
            document.documentElement.setAttribute(TOKEN_ATTR, token);
        }
    } catch (error) {
        // reason: with no <html> yet there is nothing to hand over; the bridge
        // stays dark, which is the safe direction.
        void error;
    }
})();
