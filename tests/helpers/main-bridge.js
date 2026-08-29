'use strict';

// Wiring for the MAIN-world bridge tests.
//
// These harnesses used to drive `ytkit-main.js` by writing `data-ytkit-*`
// attributes on a fake `<html>`. That is exactly the thing the bridge stopped
// believing: a plain attribute write is what a page script can do, so a test
// that drives the bridge that way is a test that proves a page script can.
//
// So a harness now publishes through the sealed channel, the same way the
// isolated world does. The bonus is that the old path stays available and
// stays wrong: `documentElement.setAttribute(...)` still fires the observer
// and still changes nothing, which is a property worth asserting directly.

const {
    createBridgeWriter,
    createBridgeReader,
    bridgeChannel,
} = require('../../extension/core/bridge-channel.js');

/**
 * Seed the token and hand back a publisher.
 *
 * Call BEFORE evaluating `ytkit-main.js`: the bridge takes the token out of
 * the DOM as it builds its reader, which in the real extension happens at
 * document_start before any page script exists.
 *
 * @param {object} documentElement the fake `<html>` the harness already built
 * @param {object} core the `YTKitCore` object going into the vm context
 */
function installBridgeChannel(documentElement, core = {}) {
    const token = bridgeChannel.randomToken();
    documentElement.setAttribute(bridgeChannel.TOKEN_ATTR, token);

    core.createBridgeReader = createBridgeReader;
    core.createBridgeWriter = createBridgeWriter;
    core.bridgeChannel = bridgeChannel;

    const writer = createBridgeWriter({ documentElement, token });

    return {
        core,
        token,
        writer,
        /** Publish a value the way the isolated world does. */
        publish(name, value) {
            documentElement.setAttribute(name, String(value));
            return writer.set(name, value);
        },
        /** Withdraw one, the way the isolated world does. */
        clear(name) {
            documentElement.removeAttribute(name);
            return writer.clear(name);
        },
        /** What a page script can do: the attribute, and nothing behind it. */
        forge(name, value) {
            documentElement.setAttribute(name, String(value));
        },
        /** A navigate the bridge will believe. */
        navigate(reason = 'navigate') {
            return {
                type: bridgeChannel.NAVIGATE_EVENT,
                detail: { token, reason },
            };
        },
        /** One it will not. */
        forgedNavigate(reason = 'navigate') {
            return {
                type: bridgeChannel.NAVIGATE_EVENT,
                detail: { token: bridgeChannel.randomToken(), reason },
            };
        },
    };
}

module.exports = { installBridgeChannel, bridgeChannel };
