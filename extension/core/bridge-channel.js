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
//     indistinguishable from a forged one. The event carries a sequence number
//     and its seal, never the token: a page listener can read an event's
//     detail, so a token in there was a token handed to the page.
//   * The MAIN side verifies with primitives it took at document_start. It
//     shares a realm with the page, and a seal computed through a
//     `String.prototype.charCodeAt` or `Math.imul` the page has since replaced
//     says whatever the page wants. The reader is never published on a global
//     either, and it has no way to hand its token out.
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
    // The highest counter a writer adopts from the page. Adding 1 to 2^53 gives
    // 2^53 back, so a planted counter at that height froze the channel: every
    // later payload carried the same number and the reader refused it as stale.
    var MAX_ADOPTED_COUNTER = Math.pow(2, 52);

    // Taken now, while this file is evaluated at document_start and no page
    // script exists yet. `FnCall.bind(fn)` is bound to the real `call`, so a
    // page replacing Function.prototype.call later changes nothing here.
    var FnCall = Function.prototype.call;
    var charCodeAt = FnCall.bind(String.prototype.charCodeAt);
    var numberToString = FnCall.bind(Number.prototype.toString);
    var hasOwn = FnCall.bind(Object.prototype.hasOwnProperty);
    var imul = Math.imul;
    var toText = String;
    var isArray = Array.isArray;
    var isFiniteNumber = isFinite;
    var isSafeInteger = Number.isSafeInteger;
    var createObject = Object.create;
    var nativeParse = JSON.parse;
    var nativeNow = Date.now;

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
            var code = charCodeAt(text, i);
            h1 ^= code;
            h1 = imul(h1, 0x01000193) >>> 0;
            h2 = imul(h2 ^ (code + i), 0x85ebca6b) >>> 0;
            h2 = (h2 ^ (h2 >>> 13)) >>> 0;
        }
        return numberToString(h1 >>> 0, 16) + '-' + numberToString(h2 >>> 0, 16);
    }

    // What a navigate event's seal covers. The prefix keeps a state payload's
    // seal from ever doubling as a navigate seal.
    function navigateText(seq, reason) {
        return 'navigate ' + seq + ' ' + reason;
    }

    // Constant-time-ish compare. The seal is short and the attacker has no
    // oracle here, but an early return on the first differing character is a
    // habit worth not forming.
    function sealsMatch(a, b) {
        var left = typeof a === 'string' ? a : '';
        var right = typeof b === 'string' ? b : '';
        if (!left || left.length !== right.length) return false;
        var diff = 0;
        for (var i = 0; i < left.length; i += 1) {
            diff |= charCodeAt(left, i) ^ charCodeAt(right, i);
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
        var parse = opts.parse || JSON.parse;
        var dispatch = opts.dispatchEvent
            || (opts.documentRef || root.document || {}).dispatchEvent;
        var eventTarget = opts.eventTarget || opts.documentRef || root.document;
        var CustomEventRef = opts.CustomEvent || root.CustomEvent;
        // Firefox keeps an object made in a content script out of the page's
        // reach, so the MAIN listener reading `detail.seq` threw "Permission
        // denied" and every navigate event was dropped. cloneInto hands the
        // page a copy it owns. Chromium has no cloneInto and needs none.
        var cloneDetail = opts.cloneInto || root.cloneInto;
        var pageWindow = opts.pageWindow || (opts.documentRef || root.document || {}).defaultView;

        // The authoritative map. Sealing reads THIS, never the DOM: sealing
        // over whatever the DOM currently holds would bless a page script's
        // forged attribute on the next legitimate write.
        var state = Object.create(null);

        // Continue the counter the last writer reached rather than restarting
        // at 1. An extension update can re-evaluate the isolated world while
        // the MAIN-world bridge stays alive: a fresh writer starting at 1
        // publishes payload after payload that the reader rejects as stale,
        // and every one of those state changes is silently lost until the new
        // counter overtakes the old. Read what is already on the page and
        // carry on from there — the payload is not trusted for its VALUES
        // here, only for how far the numbering got, and a page script inflating
        // it can at worst make the reader skip ahead, never roll it back.
        var counter = 0;
        if (element && typeof element.getAttribute === 'function') {
            try {
                var existing = parse(element.getAttribute(STATE_ATTR) || 'null');
                if (existing && typeof existing.n === 'number' && isFinite(existing.n)) {
                    counter = Math.min(MAX_ADOPTED_COUNTER, Math.max(0, Math.floor(existing.n)));
                }
            } catch (error) {
                void error;
            }
        }

        // Navigate events carry their own forward-only number. It starts at
        // the clock so a writer rebuilt after an extension update is already
        // past every number its predecessor sent (that would take one
        // navigation per millisecond to catch up with).
        var navigateSeq = Math.floor(Number((opts.now || nativeNow)()) || 0);

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
                // `bubbles: true` is not decoration. This dispatches on
                // `document` and every listener in the MAIN world is on
                // `window` in the bubble phase, so a non-bubbling event
                // reaches none of them — the whole navigate half of the
                // channel was silently dead in a browser until this was
                // added, and no fixture caught it because the fixtures
                // dispatched straight at the listeners.
                //
                // The detail is readable by every listener on the page, so it
                // carries a sealed sequence number and never the token.
                navigateSeq += 1;
                var why = String(reason || 'navigate');
                var detail = { seq: navigateSeq, reason: why, seal: seal(token, navigateText(navigateSeq, why)) };
                if (typeof cloneDetail === 'function' && pageWindow) detail = cloneDetail(detail, pageWindow);
                send.call(target, new CustomEventRef(NAVIGATE_EVENT, {
                    bubbles: true,
                    composed: true,
                    detail: detail
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
        var parse = opts.parse || nativeParse;
        var token = opts.token;
        // The element's own getAttribute, taken now. Element.prototype is the
        // page's to rewrite later.
        var readAttribute = typeof opts.getAttribute === 'function'
            ? opts.getAttribute
            : (element && typeof element.getAttribute === 'function'
                ? FnCall.bind(element.getAttribute, element)
                : null);

        if (!token && readAttribute) {
            token = readAttribute(TOKEN_ATTR);
            // Taken, not shared. This runs at document_start, so the value is
            // out of the DOM before the first page script can look at it.
            if (element && typeof element.removeAttribute === 'function') {
                element.removeAttribute(TOKEN_ATTR);
            }
        }
        if (typeof token !== 'string') token = '';

        var accepted = createObject(null);
        var acceptedCounter = 0;
        var rejected = 0;
        var lastNavigateSeq = -1;
        var admittedNavigate = null;

        function readSealed() {
            if (!token || !readAttribute) return false;
            var payload = readAttribute(STATE_ATTR);
            var claimed = readAttribute(SEAL_ATTR);
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
            if (!decoded || typeof decoded !== 'object' || isArray(decoded)
                || typeof decoded.n !== 'number' || !isFiniteNumber(decoded.n)
                || !decoded.v || typeof decoded.v !== 'object' || isArray(decoded.v)) {
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
            var next = createObject(null);
            for (var key in decoded.v) {
                if (hasOwn(decoded.v, key)) {
                    next[key] = toText(decoded.v[key]);
                }
            }
            accepted = next;
            return true;
        }

        /**
         * Decide once per dispatch whether a navigate event is ours. Call it
         * from the first listener the event reaches (a capture listener on
         * window, registered at document_start) so a replay of an event object
         * that was already admitted is judged again, and refused, before any
         * other listener asks `isOwnNavigate`.
         */
        function admitNavigate(event) {
            admittedNavigate = null;
            if (!token || !event) return false;
            var detail = event.detail;
            if (!detail || typeof detail !== 'object') return false;
            var seq = detail.seq;
            if (typeof seq !== 'number' || !isSafeInteger(seq) || seq <= lastNavigateSeq) return false;
            var reason = typeof detail.reason === 'string' ? detail.reason : '';
            if (!sealsMatch(detail.seal, seal(token, navigateText(seq, reason)))) return false;
            lastNavigateSeq = seq;
            admittedNavigate = event;
            return true;
        }

        return {
            get hasToken() { return token !== ''; },
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
                return hasOwn(accepted, name) ? accepted[name] : null;
            },
            admitNavigate: admitNavigate,
            /**
             * True only for a navigate event this channel sealed, with a number
             * higher than any it accepted before. Several listeners ask about
             * the same event, so an event already admitted stays admitted until
             * the next `admitNavigate`.
             */
            isOwnNavigate: function (event) {
                if (event && event === admittedNavigate) return true;
                return admitNavigate(event);
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
