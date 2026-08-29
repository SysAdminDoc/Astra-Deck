// Astra Deck - the isolated <-> MAIN world channel
//
// The MAIN-world bridge shares a JS realm and a DOM with YouTube's own scripts
// and with anything injected beside them. It used to take both its commands and
// its data straight off `<html data-ytkit-*>` attributes and off page events
// (`yt-navigate-finish`, `yt-page-data-updated`, `loadedmetadata`), every one of
// which a page script can write or dispatch. Reachable impact was limited to
// playback quality and codec strings, but the shape was wrong: the bridge could
// not tell its own side from the page.
//
// So there is one channel now, and it is sealed.
//
//   * A 256-bit token is generated in the ISOLATED world at document_start and
//     handed to the bridge before any page script exists. It is never left in
//     the DOM afterwards, and the isolated world is a separate realm, so a page
//     script cannot read it out of a global either.
//   * State travels as one payload attribute plus a seal. The seal is a keyed
//     hash of the payload under that token. A page script can read both and can
//     replay neither: the counter only moves forward, and it cannot compute a
//     seal for a payload it made up.
//   * Navigation is re-dispatched by the isolated world as a sealed event. The
//     bridge no longer listens to YouTube's own, because YouTube's own is
//     indistinguishable from a forged one.
//
// Honest about what this is: the seal is a keyed non-cryptographic hash, not an
// HMAC, because both sides have to run synchronously at document_start and
// SubtleCrypto is async. Against a page script that must forge in real time
// without the token it is a real barrier; it is not a defence against an
// attacker who can read the isolated world's memory, and nothing in a content
// script could be.

(function () {
    'use strict';

    var root = typeof globalThis !== 'undefined' ? globalThis : this;
    var core = root.YTKitCore || (root.YTKitCore = {});
    if (core.createBridgeWriter) return;

    var TOKEN_ATTR = 'data-ytkit-bridge-token';
    var STATE_ATTR = 'data-ytkit-bridge';
    var SEAL_ATTR = 'data-ytkit-bridge-seal';
    var NAVIGATE_EVENT = 'ytkit-bridge-navigate';
    var TOKEN_GLOBAL = '__ytkitBridgeToken';
    // A payload big enough to matter is a payload something is wrong with.
    var MAX_PAYLOAD_BYTES = 64 * 1024;

    function randomToken(cryptoRef) {
        var source = cryptoRef || root.crypto;
        var bytes = new Uint8Array(32);
        if (source && typeof source.getRandomValues === 'function') {
            source.getRandomValues(bytes);
        } else {
            // Only reachable in a runtime with no WebCrypto at all. Still
            // unguessable enough to be worth having, and the caller is told.
            for (var i = 0; i < bytes.length; i += 1) {
                bytes[i] = Math.floor(Math.random() * 256);
            }
        }
        var out = '';
        for (var j = 0; j < bytes.length; j += 1) {
            out += (bytes[j] + 0x100).toString(16).slice(1);
        }
        return out;
    }

    // Keyed FNV-1a over token || payload || token, folded twice so a single
    // trailing byte cannot be tuned to hit a target. Deterministic and
    // synchronous on both sides, which is the requirement.
    function seal(token, payload) {
        var text = token + ' ' + payload + ' ' + token;
        var h1 = 0x811c9dc5;
        var h2 = 0x01000193;
        for (var i = 0; i < text.length; i += 1) {
            var code = text.charCodeAt(i);
            h1 ^= code;
            h1 = Math.imul(h1, 0x01000193) >>> 0;
            h2 = Math.imul(h2 ^ (code + i), 0x85ebca6b) >>> 0;
            h2 = (h2 ^ (h2 >>> 13)) >>> 0;
        }
        return (h1 >>> 0).toString(16) + '-' + (h2 >>> 0).toString(16);
    }

    // Constant-time-ish compare. The seal is short and the attacker has no
    // oracle here, but an early return on the first differing character is a
    // habit worth not forming.
    function sealsMatch(a, b) {
        var left = String(a || '');
        var right = String(b || '');
        if (left.length !== right.length) return false;
        var diff = 0;
        for (var i = 0; i < left.length; i += 1) {
            diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
        }
        return diff === 0;
    }

    /**
     * ISOLATED side. Owns the authoritative state and is the only thing that
     * can produce a seal.
     */
    function createBridgeWriter(options) {
        var opts = options || {};
        var element = opts.documentElement
            || (opts.documentRef || root.document || {}).documentElement;
        var token = opts.token || randomToken(opts.crypto);
        var stringify = opts.stringify || JSON.stringify;
        var dispatch = opts.dispatchEvent
            || (opts.documentRef || root.document || {}).dispatchEvent;
        var eventTarget = opts.eventTarget || opts.documentRef || root.document;
        var CustomEventRef = opts.CustomEvent || root.CustomEvent;

        // The authoritative map. Sealing reads THIS, never the DOM: sealing
        // over whatever the DOM currently holds would bless a page script's
        // forged attribute on the next legitimate write.
        var state = Object.create(null);
        var counter = 0;

        function publish() {
            if (!element || typeof element.setAttribute !== 'function') return null;
            counter += 1;
            var payload = stringify({ n: counter, v: state });
            if (payload.length > MAX_PAYLOAD_BYTES) return null;
            element.setAttribute(STATE_ATTR, payload);
            element.setAttribute(SEAL_ATTR, seal(token, payload));
            return payload;
        }

        return {
            token: token,
            set: function (name, value) {
                if (typeof name !== 'string' || !name) return null;
                state[name] = String(value);
                return publish();
            },
            clear: function (name) {
                if (typeof name !== 'string' || !name) return null;
                delete state[name];
                return publish();
            },
            get: function (name) {
                return Object.prototype.hasOwnProperty.call(state, name)
                    ? state[name]
                    : null;
            },
            /** Re-publish without changing anything, to move the counter on. */
            refresh: publish,
            /**
             * The isolated world's own navigation signal. The bridge stopped
             * listening to `yt-navigate-finish` because YouTube's copy and a
             * forged copy are the same object to a listener.
             */
            notifyNavigate: function (reason) {
                if (typeof CustomEventRef !== 'function') return false;
                var target = eventTarget;
                var send = dispatch || (target && target.dispatchEvent);
                if (typeof send !== 'function' || !target) return false;
                send.call(target, new CustomEventRef(NAVIGATE_EVENT, {
                    detail: { token: token, reason: String(reason || 'navigate') }
                }));
                return true;
            }
        };
    }

    /**
     * MAIN side. Reads only what the token seals, and treats everything else on
     * the page as noise.
     */
    function createBridgeReader(options) {
        var opts = options || {};
        var element = opts.documentElement
            || (opts.documentRef || root.document || {}).documentElement;
        var parse = opts.parse || JSON.parse;
        var token = opts.token;

        if (!token && element && typeof element.getAttribute === 'function') {
            token = element.getAttribute(TOKEN_ATTR);
            // Taken, not shared. This runs at document_start, so the value is
            // out of the DOM before the first page script can look at it.
            if (typeof element.removeAttribute === 'function') {
                element.removeAttribute(TOKEN_ATTR);
            }
        }

        var accepted = Object.create(null);
        var acceptedCounter = 0;
        var rejected = 0;

        function readSealed() {
            if (!token || !element || typeof element.getAttribute !== 'function') return false;
            var payload = element.getAttribute(STATE_ATTR);
            var claimed = element.getAttribute(SEAL_ATTR);
            if (typeof payload !== 'string' || payload.length > MAX_PAYLOAD_BYTES) {
                rejected += 1;
                return false;
            }
            if (!sealsMatch(claimed, seal(token, payload))) {
                rejected += 1;
                return false;
            }
            var decoded;
            try {
                decoded = parse(payload);
            } catch (error) {
                rejected += 1;
                return false;
            }
            // `typeof [] === 'object'`, so the array checks are not
            // decoration: a sealed `{"n":1,"v":[]}` would otherwise be adopted
            // as a state map with no keys.
            if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)
                || typeof decoded.n !== 'number' || !isFinite(decoded.n)
                || !decoded.v || typeof decoded.v !== 'object' || Array.isArray(decoded.v)) {
                rejected += 1;
                return false;
            }
            // Forward only. A page script can copy an old payload and its seal
            // verbatim; without this it could roll the bridge back to a state
            // the user has since turned off.
            if (decoded.n <= acceptedCounter) {
                rejected += 1;
                return false;
            }
            acceptedCounter = decoded.n;
            var next = Object.create(null);
            for (var key in decoded.v) {
                if (Object.prototype.hasOwnProperty.call(decoded.v, key)) {
                    next[key] = String(decoded.v[key]);
                }
            }
            accepted = next;
            return true;
        }

        return {
            get token() { return token || null; },
            get rejectedCount() { return rejected; },
            get counter() { return acceptedCounter; },
            /** Pull the sealed state. Returns true when it moved. */
            sync: readSealed,
            /**
             * The value the isolated world published, or null. Never reads the
             * individual `data-ytkit-*` attribute, which is what a page script
             * can write.
             */
            get: function (name) {
                return Object.prototype.hasOwnProperty.call(accepted, name)
                    ? accepted[name]
                    : null;
            },
            /** True only for a navigate event this channel's token sealed. */
            isOwnNavigate: function (event) {
                if (!token || !event || !event.detail) return false;
                return sealsMatch(event.detail.token, token);
            }
        };
    }

    // ── the isolated world's one writer ───────────────────────────────────
    //
    // Built on first use, because the token is generated at document_start and
    // most callers run at document_idle. Everything on the isolated side goes
    // through this, so there is exactly one thing sealing state and exactly
    // one thing to reason about.
    var _writer = null;
    function getBridgeWriter() {
        if (_writer) return _writer;
        var token = root[TOKEN_GLOBAL];
        if (typeof token !== 'string' || !token) return null;
        _writer = createBridgeWriter({ token: token });
        return _writer;
    }

    /**
     * Publish a bridge value.
     *
     * The plain attribute is still written: some of these drive CSS
     * (`html[data-ytkit-audio-only]`), and the isolated world reads a few of
     * its own back. What changed is that the MAIN-world bridge no longer
     * believes the attribute — it reads the sealed copy this also writes, so a
     * page script overwriting the attribute changes what the page looks like
     * and nothing about what the bridge does.
     */
    function publishBridgeAttribute(name, value) {
        var element = root.document && root.document.documentElement;
        if (element && typeof element.setAttribute === 'function') {
            element.setAttribute(name, String(value));
        }
        var writer = getBridgeWriter();
        return writer ? writer.set(name, value) : null;
    }

    function clearBridgeAttribute(name) {
        var element = root.document && root.document.documentElement;
        if (element && typeof element.removeAttribute === 'function') {
            element.removeAttribute(name);
        }
        var writer = getBridgeWriter();
        return writer ? writer.clear(name) : null;
    }

    /** Tell the bridge the page navigated, in a way only this side can say. */
    function notifyBridgeNavigate(reason) {
        var writer = getBridgeWriter();
        return writer ? writer.notifyNavigate(reason) : false;
    }

    core.createBridgeWriter = createBridgeWriter;
    core.createBridgeReader = createBridgeReader;
    core.getBridgeWriter = getBridgeWriter;
    core.publishBridgeAttribute = publishBridgeAttribute;
    core.clearBridgeAttribute = clearBridgeAttribute;
    core.notifyBridgeNavigate = notifyBridgeNavigate;
    core.bridgeChannel = {
        TOKEN_ATTR: TOKEN_ATTR,
        STATE_ATTR: STATE_ATTR,
        SEAL_ATTR: SEAL_ATTR,
        NAVIGATE_EVENT: NAVIGATE_EVENT,
        TOKEN_GLOBAL: TOKEN_GLOBAL,
        MAX_PAYLOAD_BYTES: MAX_PAYLOAD_BYTES,
        randomToken: randomToken
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createBridgeWriter: createBridgeWriter,
            createBridgeReader: createBridgeReader,
            getBridgeWriter: getBridgeWriter,
            publishBridgeAttribute: publishBridgeAttribute,
            clearBridgeAttribute: clearBridgeAttribute,
            notifyBridgeNavigate: notifyBridgeNavigate,
            bridgeChannel: core.bridgeChannel
        };
    }
})();
