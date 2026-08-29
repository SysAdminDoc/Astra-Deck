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

(function () {
    'use strict';

    var root = typeof globalThis !== 'undefined' ? globalThis : this;
    var core = root.YTKitCore;
    var channel = core && core.bridgeChannel;
    if (!channel) return;

    // One token per document. A re-injection (an extension update mid-session)
    // must not rotate it out from under a bridge that already took the first.
    if (typeof root[channel.TOKEN_GLOBAL] === 'string' && root[channel.TOKEN_GLOBAL]) return;

    var token = channel.randomToken();
    root[channel.TOKEN_GLOBAL] = token;

    try {
        if (document && document.documentElement) {
            document.documentElement.setAttribute(channel.TOKEN_ATTR, token);
        }
    } catch (error) {
        // reason: with no <html> yet there is nothing to hand over; the bridge
        // stays dark, which is the safe direction.
        void error;
    }
})();
