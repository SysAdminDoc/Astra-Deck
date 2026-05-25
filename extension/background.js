// Astra Deck - Background Service Worker
// Handles extension fetch proxying, cookie access, and downloads.
// The toolbar popup owns control-center activation directly via
// chrome.tabs.sendMessage(YTKIT_OPEN_PANEL) — no background mediation needed.

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_FETCH_TIMEOUT_MS = 60000; // 60 seconds

// v3.20.3: explicit cookie-jar wire contract.
// Mirrors normalizeCookieExpiry() in extension/ytkit.js — keep both in sync.
//   Session cookie    → 0 (Netscape format expects 0 for "session")
//   Persistent cookie → positive Number, seconds since epoch (left as-is so
//                       the Python downloader's int(float(x)) lands the same
//                       integer regardless of fractional precision).
//   Anything else     → 0 (treat null/NaN/negative/string/Infinity as session;
//                          server already does the same via
//                          test_astra_downloader.py:333+).
function normalizeCookieExpiry(value) {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : 0;
}

// v3.14.0: Track downloads that requested "show in folder" so the reveal
// fires exactly when the file transitions to `state.complete`. Using a
// setTimeout meant the service worker could be killed mid-wait on slow
// networks.
// v3.20.0: Mirror into `chrome.storage.session` so a SW restart between
// `chrome.downloads.download()` and the `state.complete` transition
// doesn't silently drop the reveal. The in-memory Set stays the fast
// path; the session mirror is authoritative when the SW cold-starts.
const _pendingReveals = new Set();
const _PENDING_REVEALS_KEY = '_pendingReveals';
// Hard cap to defend against pathological cases (millions of downloads queued
// without ever transitioning to a terminal state, or storage.session writes
// failing repeatedly). Beyond this size we drop the oldest pending id —
// dropping a single "show in folder" is acceptable, runaway memory growth is
// not. 1024 is two orders of magnitude over realistic user concurrency.
const PENDING_REVEALS_CAP = 1024;

function _addPendingReveal(downloadId) {
    if (typeof downloadId !== 'number') return;
    if (_pendingReveals.size >= PENDING_REVEALS_CAP && !_pendingReveals.has(downloadId)) {
        const oldest = _pendingReveals.values().next().value;
        if (oldest != null) _pendingReveals.delete(oldest);
    }
    _pendingReveals.add(downloadId);
}

const _pendingRevealsReady = (async () => {
    if (!chrome.storage?.session) return;
    try {
        const stored = await chrome.storage.session.get(_PENDING_REVEALS_KEY);
        const ids = stored?.[_PENDING_REVEALS_KEY];
        if (Array.isArray(ids)) {
            // Respect the same cap on hydration that _addPendingReveal enforces
            // for runtime adds. If the persisted set was somehow > cap (older
            // version, manual edit, partial-write race), an unbounded
            // `_pendingReveals.add(id)` loop would re-introduce the runaway
            // memory growth defended against at runtime. Take the most recent
            // ids (Set preserves insertion order, so slice from the tail).
            const start = Math.max(0, ids.length - PENDING_REVEALS_CAP);
            for (let i = start; i < ids.length; i++) {
                if (typeof ids[i] === 'number') _pendingReveals.add(ids[i]);
            }
        }
    } catch (_) {
        // reason: chrome.storage.session is MV3+ (Chrome 102, Firefox 115);
        // absence is benign — we still fire reveals while the SW stays alive.
    }
})();

function _persistPendingReveals() {
    if (!chrome.storage?.session) return;
    try {
        const payload = { [_PENDING_REVEALS_KEY]: [..._pendingReveals] };
        const maybePromise = chrome.storage.session.set(payload);
        if (maybePromise && typeof maybePromise.catch === 'function') {
            maybePromise.catch(() => {
                // reason: best-effort mirror; Set remains authoritative in memory.
            });
        }
    } catch (_) {
        // reason: storage.session unavailable or quota-exceeded; ignore
    }
}

// v4.47.0 NEW-7: service-worker lifecycle ring. MV3 service workers
// restart unpredictably (~30 s idle kill, suspension on memory
// pressure, post-install). Several Astra Deck bugs surfaced only
// because the maintainer happened to hit a SW restart in development;
// the H25 cap-bypass-on-hydration fix is the most recent example.
// This ring records SW boot events into `chrome.storage.session` so
// the bug-report bundle (NEW-1) can surface "how often did the SW
// die in this browsing session?" without depending on telemetry.
//
// Cap matches the documented-fix shape: 50 entries, oldest dropped on
// overflow. Storage is `chrome.storage.session` (transient — wiped on
// browser restart) so the ring naturally bounds itself to the current
// session. Schema:
//   { ts: number, event: 'sw-start', inFlightReveals: number }
const SW_LIFECYCLE_KEY = '_swLifecycle';
const SW_LIFECYCLE_CAP = 50;

// Audit pass: serialize lifecycle writes so concurrent
// _recordSwLifecycle calls (e.g. sw-start firing alongside an
// immediate reveal-failed for a download that was in-flight when
// the SW restarted) cannot lose entries via a read-modify-write
// race on chrome.storage.session. The SW is single-threaded JS,
// but async/await yields between `get` and `set` create the
// interleaving window. Chaining each call onto the previous one
// guarantees the get→push→set sequence is observed atomically per
// caller. Catch-rethrow-undefined keeps the chain alive even when
// a write rejects (storage quota, browser shutdown mid-write).
let _swLifecycleChain = Promise.resolve();

function _recordSwLifecycle(event) {
    if (!chrome.storage?.session) return;
    _swLifecycleChain = _swLifecycleChain
        .catch(() => undefined)
        .then(async () => {
            try {
                // Wait for the pending-reveals hydration so the in-flight count
                // we record reflects the persisted state, not just whatever the
                // freshly-restarted SW happens to have in memory.
                try { await _pendingRevealsReady; } catch (_) { /* reason: ring records even if hydration failed */ }
                const stored = await chrome.storage.session.get(SW_LIFECYCLE_KEY);
                const arr = Array.isArray(stored?.[SW_LIFECYCLE_KEY])
                    ? stored[SW_LIFECYCLE_KEY]
                    : [];
                arr.push({
                    ts: Date.now(),
                    event,
                    inFlightReveals: _pendingReveals.size,
                });
                // Trim from the head so the most recent events survive.
                while (arr.length > SW_LIFECYCLE_CAP) arr.shift();
                await chrome.storage.session.set({ [SW_LIFECYCLE_KEY]: arr });
            } catch (_) {
                // reason: storage.session may be unavailable on older Firefox or under quota pressure;
                // the SW itself is not affected by ring-record failure.
            }
        });
}

// Fire once at module load — this IS the SW boot. Every fresh SW
// process invocation hits this line; the resulting ring entry is
// the signal that distinguishes "SW restarted between user actions"
// from "SW was alive across the user's whole session."
void _recordSwLifecycle('sw-start');

// Allowed origins for EXT_FETCH proxy — blocks SSRF to private networks.
//
// SECURITY NOTE: The `localhost` alias intentionally is NOT allowlisted.
// Chrome 88+ pins `localhost` to loopback without DNS lookup, but Firefox
// still resolves through DNS — a hostile network or compromised resolver
// can rebind `localhost` to an internal IP and probe the LAN. `127.0.0.1`
// is the literal loopback address and is immune to DNS rebinding. The
// downloader client (MediaDLManager) already prefers `127.0.0.1`, so
// dropping `localhost` is a transparent hardening pass.
const ALLOWED_FETCH_ORIGINS = [
    'https://www.youtube.com',
    'https://youtube.com',
    'https://m.youtube.com',
    'https://music.youtube.com',
    'https://youtu.be',
    'https://www.youtube-nocookie.com',
    'https://i.ytimg.com',
    'https://sponsor.ajay.app',
    'https://returnyoutubedislikeapi.com',
    'https://api.openai.com',
    'https://api.anthropic.com',
    'https://generativelanguage.googleapis.com',
    'https://www.reddit.com',
    'https://old.reddit.com',
    // AstraDownloader — primary port plus fallbacks (must match astra_downloader.PORT_FALLBACKS
    // and MediaDLManager._PORT_CANDIDATES). Extension probes these when 9751 is blocked.
    'http://127.0.0.1:9751',
    'http://127.0.0.1:9761',
    'http://127.0.0.1:9771',
    'http://127.0.0.1:9781',
    'http://127.0.0.1:9791',
    'http://127.0.0.1:9851',
    'http://127.0.0.1:11434',
];

// Origins that are allowed to receive cookies on proxied requests.
// All other origins (third-party APIs like SponsorBlock, RYD, DeArrow) get
// credentials: 'omit' so YouTube session cookies are never leaked off-site.
const CREDENTIALED_FETCH_ORIGINS = new Set([
    'https://www.youtube.com',
    'https://youtube.com',
    'https://m.youtube.com',
    'https://music.youtube.com',
    'https://youtu.be',
    'https://www.youtube-nocookie.com',
    'http://127.0.0.1:9751',
    'http://127.0.0.1:9761',
    'http://127.0.0.1:9771',
    'http://127.0.0.1:9781',
    'http://127.0.0.1:9791',
    'http://127.0.0.1:9851',
]);

const ALLOWED_COOKIE_DOMAINS = new Set([
    '.youtube.com',
    'youtube.com',
    '.www.youtube.com',
    'www.youtube.com',
    '.m.youtube.com',
    'm.youtube.com',
    '.music.youtube.com',
    'music.youtube.com',
    '.youtube-nocookie.com',
    'youtube-nocookie.com',
    '.www.youtube-nocookie.com',
    'www.youtube-nocookie.com'
]);

function shouldSendCredentials(url) {
    try {
        const parsed = new URL(url);
        const originKey = `${parsed.protocol}//${parsed.hostname}${parsed.port ? ':' + parsed.port : ''}`;
        return CREDENTIALED_FETCH_ORIGINS.has(originKey);
    } catch {
        return false;
    }
}

// Headers that must never be forwarded from content-script requests.
// `Authorization` is handled separately so BYO-key API calls can work for
// explicit non-YouTube allowlisted origins without letting arbitrary auth
// headers leak onto first-party YouTube/session-bound requests.
const ALWAYS_BLOCKED_REQUEST_HEADERS = new Set([
    'host', 'origin', 'referer', 'cookie',
    'proxy-authorization', 'sec-fetch-dest', 'sec-fetch-mode',
    'sec-fetch-site', 'sec-fetch-user'
]);

// Headers stripped from responses before returning to content script
const BLOCKED_RESPONSE_HEADERS = new Set([
    'set-cookie', 'set-cookie2', 'authorization', 'proxy-authenticate',
    'proxy-authorization', 'www-authenticate'
]);

const WINDOWS_RESERVED_FILENAME_BASENAMES = new Set([
    'con', 'prn', 'aux', 'nul',
    'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
    'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
]);
const MAX_DOWNLOAD_FILENAME_LENGTH = 180;

function isUrlAllowed(url) {
    try {
        const parsed = new URL(url);
        return ALLOWED_FETCH_ORIGINS.some(origin => {
            const allowed = new URL(origin);
            return parsed.protocol === allowed.protocol
                && parsed.hostname === allowed.hostname
                && (allowed.port === '' || parsed.port === allowed.port);
        });
    } catch {
        return false;
    }
}

function filterHeaders(headers, blocklist) {
    if (!headers || typeof headers !== 'object') return {};
    const filtered = {};
    for (const [key, value] of Object.entries(headers)) {
        if (blocklist.has(key.toLowerCase()) || value == null) continue;
        filtered[key] = Array.isArray(value) ? value.map((item) => String(item)).join(', ') : String(value);
    }
    return filtered;
}

const AUTH_HEADER_ALLOWED_ORIGINS = new Set([
    'https://api.openai.com',
    'https://api.anthropic.com',
    // Local-only services — see SECURITY NOTE above for why `localhost` is omitted.
    'http://127.0.0.1:9751',
    'http://127.0.0.1:9761',
    'http://127.0.0.1:9771',
    'http://127.0.0.1:9781',
    'http://127.0.0.1:9791',
    'http://127.0.0.1:9851',
    'http://127.0.0.1:11434',
]);

function getRequestOrigin(url) {
    try {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.hostname}${parsed.port ? ':' + parsed.port : ''}`;
    } catch {
        return '';
    }
}

function canForwardAuthorizationHeader(url) {
    return AUTH_HEADER_ALLOWED_ORIGINS.has(getRequestOrigin(url));
}

function filterRequestHeaders(headers, url) {
    const filtered = filterHeaders(headers, ALWAYS_BLOCKED_REQUEST_HEADERS);
    if (!canForwardAuthorizationHeader(url)) {
        for (const key of Object.keys(filtered)) {
            if (key.toLowerCase() === 'authorization') {
                delete filtered[key];
            }
        }
    }
    return filtered;
}

function isJsonLikePayload(data) {
    return Array.isArray(data) || (data && typeof data === 'object'
        && !(data instanceof FormData)
        && !(data instanceof URLSearchParams)
        && !(data instanceof Blob)
        && !(data instanceof ArrayBuffer)
        && !ArrayBuffer.isView(data));
}

function hasHeader(headers, name) {
    if (!headers || typeof headers !== 'object') return false;
    const target = String(name).toLowerCase();
    return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

function normalizeRequestBody(data, headers = {}) {
    if (data == null) return null;
    if (typeof data === 'string') return data;
    // ArrayBuffer and TypedArrays survive structured cloning through chrome.runtime messaging
    if (data instanceof ArrayBuffer) return data;
    if (ArrayBuffer.isView(data)) return data;

    const contentTypeHeader = Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-type');
    const contentType = typeof contentTypeHeader?.[1] === 'string' ? contentTypeHeader[1].toLowerCase() : '';
    if (contentType.includes('application/json')) {
        return JSON.stringify(data);
    }

    if (isJsonLikePayload(data)) {
        return JSON.stringify(data);
    }

    return String(data);
}

function isAllowedCookieDomain(domain) {
    if (typeof domain !== 'string') return false;
    const normalized = domain.trim().toLowerCase();
    return ALLOWED_COOKIE_DOMAINS.has(normalized);
}

function sanitizeDownloadFilename(filename) {
    if (typeof filename !== 'string') return undefined;

    let sanitized = filename
        .replace(/[\x00-\x1f\x7f]/g, '')
        // Block Unicode bidirectional and invisible-formatting characters that
        // can spoof file extensions in OS file browsers — e.g.
        // `report.pdf<U+202E>exe.gpj` is rendered as `report.pdfjpg.exe`.
        // Covered ranges: RTL/LTR override + isolate + embed marks (U+202A-E,
        // U+2066-9), zero-width joiners/spacers (U+200B-D, U+FEFF), word joiner
        // (U+2060), and the BOM. Keep emoji and CJK intact.
        .replace(/[\u202A-\u202E\u2066-\u2069\u200B-\u200D\u2060\uFEFF]/g, '')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^[. ]+|[. ]+$/g, '');

    if (!sanitized) return undefined;

    const extensionIndex = sanitized.lastIndexOf('.');
    const extension = extensionIndex > 0 ? sanitized.slice(extensionIndex) : '';
    let baseName = extensionIndex > 0 ? sanitized.slice(0, extensionIndex) : sanitized;
    if (WINDOWS_RESERVED_FILENAME_BASENAMES.has(baseName.toLowerCase())) {
        baseName = '_' + baseName;
    }
    sanitized = baseName + extension;

    if (sanitized.length > MAX_DOWNLOAD_FILENAME_LENGTH) {
        const maxBaseLength = Math.max(1, MAX_DOWNLOAD_FILENAME_LENGTH - extension.length);
        sanitized = sanitized.slice(0, maxBaseLength) + extension;
        sanitized = sanitized.replace(/[. ]+$/g, '');
    }

    return sanitized || undefined;
}

// chrome.action.onClicked does not fire when default_popup is set in the
// manifest, so the toolbar click is handled entirely by popup.html/popup.js.
// v4.5.3: the `commands` keyboard shortcut was retired per the project's
// "no keyboard shortcuts" rule — the toolbar action button is the sole
// visible activator. The orphaned togglePanelForTab/sendTabMessage helpers
// (only callers were the removed chrome.commands listener) were also
// removed; popup.js carries its own sendTabMessage for the OPEN dispatch.
// Removing the manifest entry also removes the Firefox Ctrl+Shift+Y
// collision with "Show Downloads" without a per-vendor patch.

// v3.14.0: Fire "show in folder" reveal when the download reaches the
// complete state, not from a setTimeout. The previous implementation lost
// reveals whenever the MV3 service worker was killed during the wait.
if (chrome.downloads?.onChanged?.addListener) {
    chrome.downloads.onChanged.addListener((delta) => {
        if (!delta) return;
        const state = delta.state?.current;
        if (state !== 'complete' && state !== 'interrupted') return;
        // v3.20.0: await hydration so a reveal added before a SW cold-start
        // is still honoured when the change event arrives post-hydrate.
        void (async () => {
            try { await _pendingRevealsReady; } catch (_) {
                // reason: hydration already logged; fall through to in-memory check
            }
            if (!_pendingReveals.has(delta.id)) return;
            _pendingReveals.delete(delta.id);
            _persistPendingReveals();
            if (state === 'complete') {
                try {
                    chrome.downloads.show(delta.id);
                } catch (err) {
                    // v4.47.0 R3: surface the reveal failure into the SW
                    // lifecycle ring (NEW-7) + console so the bug-report
                    // bundle picks it up. Common causes: file was moved
                    // between download completion and the reveal call,
                    // the user revoked downloads access (Firefox), or
                    // the path traversed a removable volume that was
                    // detached. Previously a silent swallow that hid
                    // the failure from support diagnostics.
                    try { console.warn('[Astra Deck] chrome.downloads.show failed for id', delta.id, err); }
                    catch (_) { /* reason: console may be unavailable in some SW contexts */ }
                    void _recordSwLifecycle('reveal-failed:' + (err?.message || 'unknown'));
                }
            }
        })();
    });
}

// v3.20.1: onErased prunes _pendingReveals if the user clears a download from
// history before it reaches a terminal state (cancel → erase, or crash-recovery
// wipe). Without this the id would persist in the Set across the SW restart
// and leak a slot in the session mirror. Delete is idempotent so a normal
// complete→erase sequence is a safe no-op on the second fire.
if (chrome.downloads?.onErased?.addListener) {
    chrome.downloads.onErased.addListener((downloadId) => {
        if (typeof downloadId !== 'number') return;
        void (async () => {
            try { await _pendingRevealsReady; } catch (_) {
                // reason: hydration already logged; fall through to in-memory check
            }
            if (!_pendingReveals.has(downloadId)) return;
            _pendingReveals.delete(downloadId);
            _persistPendingReveals();
        })();
    });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Guard: reject malformed messages up front so a missing/non-object `msg`
    // cannot throw before any handler runs.
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
        try { sendResponse({ error: 'Invalid message.' }); } catch (_) {
            // reason: sender may have disconnected before response is delivered
        }
        return false;
    }

    // Defense-in-depth sender validation. The manifest does not declare
    // `externally_connectable`, so the only legitimate senders are our own
    // popup, options pages, and content scripts injected on YouTube. We
    // still reject anything whose sender.id doesn't match our own runtime
    // id so a future externally_connectable misconfiguration can't widen
    // the trust boundary by accident. Content-script senders without an
    // `id` field are rejected too: chrome.runtime.sendMessage from a
    // legitimate context always sets it. (`tab` sender means a YouTube
    // tab; `id` matching us means our own contexts.)
    try {
        const isOurExtension = sender?.id === chrome.runtime.id;
        if (!isOurExtension) {
            try { sendResponse({ error: 'Sender rejected.' }); } catch (_) {
                // reason: sender may already be disconnected
            }
            return false;
        }
    } catch (_) {
        // reason: chrome.runtime.id should always exist in a SW context,
        // but if reading it throws we conservatively reject the message.
        try { sendResponse({ error: 'Sender validation failed.' }); } catch (__) { /* reason: sender may already be disconnected; we've already returned false */ }
        return false;
    }

    if (msg.type === 'OPEN_URL') {
        let targetUrl;
        try {
            const parsed = new URL(msg.url);
            if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
                sendResponse({ error: 'Only HTTP(S) URLs can be opened in a tab.' });
                return false;
            }
            targetUrl = parsed.toString();
        } catch (error) {
            sendResponse({ error: 'Invalid URL.' });
            return false;
        }

        const createProperties = {
            url: targetUrl,
            active: msg.active !== false
        };
        if (sender.tab?.id) createProperties.openerTabId = sender.tab.id;
        if (typeof sender.tab?.windowId === 'number') createProperties.windowId = sender.tab.windowId;
        if (typeof sender.tab?.index === 'number') createProperties.index = sender.tab.index + 1;

        chrome.tabs.create(createProperties).then((tab) => {
            sendResponse({ tabId: tab.id || null });
        }).catch((error) => {
            sendResponse({ error: error.message });
        });
        return true;
    }

    if (msg.type === 'EXT_FETCH') {
        const details = msg?.details;
        if (!details || typeof details !== 'object') {
            sendResponse({ error: 'Missing fetch details.' });
            return false;
        }

        const { method, url, headers, data, timeout } = details;
        if (typeof url !== 'string' || !url) {
            sendResponse({ error: 'Invalid fetch URL.' });
            return false;
        }

        if (!isUrlAllowed(url)) {
            sendResponse({ error: `URL not in allowlist: ${url}` });
            return false;
        }

        const validMethods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
        const normalizedMethod = String(method || 'GET').toUpperCase();
        const safeMethod = validMethods.includes(normalizedMethod) ? normalizedMethod : 'GET';

        const controller = new AbortController();
        // Default to 30 s when the caller does not pass a timeout so unauthenticated
        // or hung upstream fetches cannot stall the service worker indefinitely.
        const DEFAULT_FETCH_TIMEOUT_MS = 30000;
        const MIN_FETCH_TIMEOUT_MS = 1000;
        const requestedTimeout = Number.isFinite(timeout) && timeout > 0
            ? timeout
            : DEFAULT_FETCH_TIMEOUT_MS;
        const clampedTimeout = Math.max(MIN_FETCH_TIMEOUT_MS, Math.min(requestedTimeout, MAX_FETCH_TIMEOUT_MS));
        let timer = null;
        let responded = false;

        timer = setTimeout(() => {
            if (responded) return;
            responded = true;
            controller.abort();
            sendResponse({ timeout: true });
        }, clampedTimeout);

        const fetchOpts = {
            method: safeMethod,
            signal: controller.signal,
            credentials: shouldSendCredentials(url) ? 'include' : 'omit'
        };

        const filteredHeaders = filterRequestHeaders(headers, url);
        if (isJsonLikePayload(data) && !hasHeader(filteredHeaders, 'content-type')) {
            filteredHeaders['Content-Type'] = 'application/json';
        }
        if (Object.keys(filteredHeaders).length > 0) {
            fetchOpts.headers = filteredHeaders;
        }
        if (data !== null && data !== undefined && safeMethod !== 'GET' && safeMethod !== 'HEAD') {
            fetchOpts.body = normalizeRequestBody(data, filteredHeaders);
        }

        fetch(url, fetchOpts).then(async (resp) => {
            if (timer) clearTimeout(timer);
            if (responded) return;

            // SSRF hardening: if redirects followed us to an origin that is NOT
            // in the allowlist, reject the response before the body leaks back
            // to the content script. `fetch` defaults to `redirect: 'follow'`,
            // so an allowlisted origin that 302s to an internal IP or an
            // arbitrary host would otherwise bypass the origin allowlist.
            if (resp.url && resp.url !== url && !isUrlAllowed(resp.url)) {
                responded = true;
                sendResponse({ error: `Response URL not in allowlist after redirect: ${resp.url}` });
                try { controller.abort(); } catch (_) {
                    // reason: controller may already be aborted
                }
                return;
            }

            const contentLengthHeader = resp.headers.get('content-length');
            if (contentLengthHeader !== null) {
                const contentLength = parseInt(contentLengthHeader, 10);
                if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
                    responded = true;
                    sendResponse({ error: `Response too large (${contentLength} bytes)` });
                    try { controller.abort(); } catch (_) {
                        // reason: controller may already be aborted by timeout
                    }
                    return;
                }
            }

            // Stream-bounded read so a chunked / unknown-length response cannot
            // OOM the service worker before we reach the size check below.
            //
            // v3.20.4: every "too large" early-return now ALSO aborts the
            // underlying fetch via controller.abort(). Previously the
            // streamed path called reader.cancel() (which closes the reader
            // but doesn't always tear down the network request) and the
            // non-streaming path did neither — both meant we kept reading
            // bytes off the wire long after we'd already responded with
            // "too large" to the caller. Aborting the controller is the
            // belt-and-suspenders cleanup that frees the SW and the
            // socket immediately.
            let text;
            try {
                const reader = resp.body?.getReader();
                if (reader) {
                    const chunks = [];
                    let received = 0;
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        received += value.byteLength;
                        if (received > MAX_RESPONSE_BYTES) {
                            try { reader.cancel(); } catch (_) {
                                // reason: stream may already be closed by caller abort
                            }
                            try { controller.abort(); } catch (_) {
                                // reason: controller may already be aborted by timeout
                            }
                            responded = true;
                            sendResponse({ error: `Response body too large (${received} bytes)` });
                            return;
                        }
                        chunks.push(value);
                    }
                    const merged = new Uint8Array(received);
                    let offset = 0;
                    for (const c of chunks) { merged.set(c, offset); offset += c.byteLength; }
                    text = new TextDecoder('utf-8').decode(merged);
                } else {
                    text = await resp.text();
                    const measuredBytes = new TextEncoder().encode(text).byteLength;
                    if (measuredBytes > MAX_RESPONSE_BYTES) {
                        try { controller.abort(); } catch (_) {
                            // reason: controller may already be aborted by timeout
                        }
                        responded = true;
                        sendResponse({ error: `Response body too large (${measuredBytes} bytes)` });
                        return;
                    }
                }
            } catch (readErr) {
                if (responded) return;
                responded = true;
                sendResponse({ error: readErr.message || 'Failed to read response body' });
                return;
            }

            responded = true;
            const responseHeaders = [...resp.headers.entries()]
                .filter(([k]) => !BLOCKED_RESPONSE_HEADERS.has(k.toLowerCase()))
                .map(([k, v]) => `${k}: ${v}`)
                .join('\r\n');

            sendResponse({
                status: resp.status,
                statusText: resp.statusText,
                responseText: text,
                responseHeaders: responseHeaders,
                finalUrl: resp.url
            });
        }).catch((err) => {
            if (timer) clearTimeout(timer);
            if (responded) return;
            responded = true;
            sendResponse({ error: err.name === 'AbortError' ? 'Request aborted' : err.message });
        });

        return true; // keep sendResponse channel open
    }

    if (msg.type === 'DOWNLOAD_FILE') {
        let downloadUrl;
        try {
            const parsed = new URL(msg.url);
            if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
                sendResponse({ error: 'Only HTTP(S) URLs can be downloaded.' });
                return false;
            }
            downloadUrl = parsed.toString();
        } catch {
            sendResponse({ error: 'Invalid download URL.' });
            return false;
        }

        const filename = sanitizeDownloadFilename(msg.filename);

        const opts = { url: downloadUrl, saveAs: false };
        if (filename) opts.filename = filename;
        chrome.downloads.download(opts, (downloadId) => {
            if (chrome.runtime.lastError) {
                sendResponse({ error: chrome.runtime.lastError.message });
            } else {
                if (msg.showInFolder) {
                    // v3.14.0: switch from setTimeout(900) to chrome.downloads.onChanged.
                    // The service worker can be terminated during the 900 ms window on
                    // slow networks, silently dropping the reveal. Listening for the
                    // `state.complete` transition fires reveal when the file actually
                    // exists, and the SW is kept alive while a download is in flight.
                    // v3.20.0: mirror to chrome.storage.session so a SW cold-start
                    // between add and `state.complete` still honours the reveal.
                    // Audit pass: route through _addPendingReveal so the cap is enforced.
                    _addPendingReveal(downloadId);
                    _persistPendingReveals();
                }
                sendResponse({ downloadId });
            }
        });
        return true;
    }

    if (msg.type === 'EXT_COOKIE_LIST') {
        const requestedDomain = typeof msg.filter?.domain === 'string' ? msg.filter.domain : '.youtube.com';
        const domain = requestedDomain.trim().toLowerCase() || '.youtube.com';
        if (!isAllowedCookieDomain(domain)) {
            sendResponse({ cookies: null, error: `Cookie domain not allowed: ${requestedDomain}` });
            return false;
        }
        chrome.cookies.getAll({ domain }).then(cookies => {
            sendResponse({
                cookies: cookies.map(c => ({
                    domain: c.domain,
                    name: c.name,
                    value: c.value,
                    path: c.path || '/',
                    secure: !!c.secure,
                    httpOnly: !!c.httpOnly,
                    expirationDate: normalizeCookieExpiry(c.expirationDate)
                })),
                error: null
            });
        }).catch(err => {
            sendResponse({ cookies: null, error: err.message });
        });
        return true;
    }

    // v4.47.0 NEW-7: SW lifecycle ring reader. Popup's bug-report
    // bundle (NEW-1) calls this to surface "how often did the SW
    // restart in this session?" in the bundle payload. Returns the
    // raw ring; popup is responsible for any rendering.
    if (msg.type === 'GET_SW_LIFECYCLE') {
        (async () => {
            try {
                if (!chrome.storage?.session) {
                    sendResponse({ entries: [], error: null });
                    return;
                }
                const stored = await chrome.storage.session.get(SW_LIFECYCLE_KEY);
                const entries = Array.isArray(stored?.[SW_LIFECYCLE_KEY])
                    ? stored[SW_LIFECYCLE_KEY]
                    : [];
                sendResponse({ entries, error: null });
            } catch (err) {
                sendResponse({ entries: [], error: err?.message || String(err) });
            }
        })();
        return true;
    }

    // Unknown message type — respond explicitly so the caller sees an
    // actionable error instead of the generic Chrome "The message port closed
    // before a response was received." Without this fallthrough an in-extension
    // typo (e.g. `msg.type = 'EXT_FECTH'`) silently times out the sender's
    // promise after the runtime's idle threshold, which is hard to debug.
    try {
        sendResponse({ error: `Unknown message type: ${msg.type}` });
    } catch (_) {
        // reason: sender may have disconnected before response is delivered
    }
    return false;
});
