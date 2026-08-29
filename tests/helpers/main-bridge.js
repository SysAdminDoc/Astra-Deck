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
function installBridgeChannel(documentElement, core = {}, listeners = {}) {
    const token = bridgeChannel.randomToken();
    documentElement.setAttribute(bridgeChannel.TOKEN_ATTR, token);

    core.createBridgeReader = createBridgeReader;
    core.createBridgeWriter = createBridgeWriter;
    core.bridgeChannel = bridgeChannel;

    // The navigate event is built by the REAL writer, captured here rather
    // than hand-rolled, so whatever production sets on it — `bubbles` above
    // all — is what the harness delivers.
    let captured = null;
    class CapturingEvent {
        constructor(type, init = {}) {
            this.type = type;
            this.bubbles = Boolean(init.bubbles);
            this.composed = Boolean(init.composed);
            this.detail = init.detail;
        }
    }

    const writer = createBridgeWriter({
        documentElement,
        token,
        CustomEvent: CapturingEvent,
        eventTarget: { dispatchEvent: (event) => { captured = event; return true; } },
    });

    /**
     * Deliver an event the way the DOM does.
     *
     * This matters more than it looks. The writer dispatches on `document`
     * and every MAIN-world listener is on `window` in the bubble phase, so an
     * event without `bubbles: true` reaches none of them. The first version of
     * this channel shipped exactly that way, and no fixture noticed because
     * the fixtures handed the event straight to the listeners. Model the
     * propagation and the flag becomes load-bearing.
     */
    const deliver = (event) => {
        if (!event) return false;
        const documentListeners = listeners.documentListeners;
        const windowListeners = listeners.windowListeners;
        for (const callback of (documentListeners && documentListeners.get(event.type)) || []) {
            callback(event);
        }
        if (!event.bubbles) return false;
        for (const callback of (windowListeners && windowListeners.get(event.type)) || []) {
            callback(event);
        }
        return true;
    };

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
        /**
         * Send a navigate the bridge will believe, through the real writer and
         * along the path a browser would take it.
         */
        navigate(reason = 'navigate') {
            captured = null;
            writer.notifyNavigate(reason);
            return deliver(captured);
        },
        /** The same journey, with a token the bridge never issued. */
        forgedNavigate(reason = 'navigate') {
            captured = null;
            createBridgeWriter({
                documentElement,
                token: bridgeChannel.randomToken(),
                CustomEvent: CapturingEvent,
                eventTarget: { dispatchEvent: (event) => { captured = event; return true; } },
            }).notifyNavigate(reason);
            return deliver(captured);
        },
        /** A page script naming the event itself, with no detail at all. */
        forgedRawNavigate(reason = 'navigate') {
            return deliver(new CapturingEvent(bridgeChannel.NAVIGATE_EVENT, {
                bubbles: true,
                detail: { reason },
            }));
        },
    };
}

module.exports = { installBridgeChannel, bridgeChannel };
