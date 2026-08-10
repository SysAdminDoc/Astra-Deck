// Astra Deck - Background Service Worker
// Handles extension fetch proxying, cookie access, and downloads.
// The toolbar popup owns control-center activation directly via
// tabs.sendMessage(YTKIT_OPEN_PANEL) — no background mediation needed.

// This service worker cannot load the page-oriented browser-api.js bootstrap,
// so resolve the standards-track namespace inline. Keep all asynchronous API
// calls behind callExtensionApi: Chromium may require callbacks and reports
// failures through runtime.lastError, while Firefox returns Promises and can
// reject callback-shaped overloads synchronously.
const ext = globalThis.browser?.runtime
    ? globalThis.browser
    : (globalThis.chrome?.runtime ? globalThis.chrome : null);

if (!ext) throw new Error('Astra Deck background requires a WebExtension runtime.');

function callExtensionApi(target, method, ...args) {
    return new Promise((resolve, reject) => {
        if (!target || typeof target[method] !== 'function') {
            reject(new Error(`Extension API unavailable: ${method}`));
            return;
        }
        let settled = false;
        const finish = (handler, value) => {
            if (settled) return;
            settled = true;
            handler(value);
        };
        const callback = (value) => {
            const lastError = ext.runtime?.lastError;
            if (lastError) {
                finish(reject, new Error(lastError.message || String(lastError)));
                return;
            }
            finish(resolve, value);
        };
        try {
            const result = target[method](...args, callback);
            if (result && typeof result.then === 'function') {
                result.then(
                    (value) => finish(resolve, value),
                    (error) => finish(reject, error)
                );
            }
        } catch (callbackError) {
            try {
                const result = target[method](...args);
                if (result && typeof result.then === 'function') {
                    result.then(
                        (value) => finish(resolve, value),
                        (error) => finish(reject, error)
                    );
                } else {
                    // The callback-shaped call threw but the bare retry
                    // returned without throwing: this is a void API with no
                    // callback parameter (e.g. downloads.show on Chromium).
                    // The call succeeded — rejecting here would log every
                    // successful invocation as a failure.
                    finish(resolve, result);
                }
            } catch (promiseError) {
                finish(reject, promiseError);
            }
        }
    });
}

// Settings writes from the popup, side panel/sidebar, and in-page workspace
// converge here so their read/validate/write cycles cannot race each other.
// Firefox's background.scripts entry still loads background.js as a classic
// worker script, where importScripts is available as well.
if (typeof importScripts === 'function') {
    importScripts(
        'core/companion-ports.js',
        'core/settings-schema.js',
        'core/settings-controller.js',
        'core/credential-vault.js'
    );
}

const COMPANION_PORT_CATALOGUE = globalThis.YTKitCore?.companionPorts || null;
const COMPANION_ORIGINS = Object.freeze(
    Array.isArray(COMPANION_PORT_CATALOGUE?.cspOrigins)
        ? COMPANION_PORT_CATALOGUE.cspOrigins.slice()
        : []
);

const SETTINGS_STORAGE_KEY = 'ytSuiteSettings';
const _settingsMutationController = globalThis.YTKitCore?.createSettingsMutationController?.({
    local: true,
    source: 'background',
    storageKey: SETTINGS_STORAGE_KEY,
    storage: ext.storage?.local
}) || null;
const _credentialVault = globalThis.YTKitCore?.createCredentialVault?.({
    sessionStorage: ext.storage?.session
}) || null;

async function migrateLegacyAiCredential() {
    if (!_credentialVault || !ext.storage?.local?.get || !ext.storage?.local?.set) return false;
    const stored = await callExtensionApi(ext.storage.local, 'get', SETTINGS_STORAGE_KEY);
    const settings = stored?.[SETTINGS_STORAGE_KEY];
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)
        || !Object.prototype.hasOwnProperty.call(settings, 'aiSummaryApiKey')) return false;
    // migrateLegacy persists the credential first. Only after that succeeds do
    // we remove the ordinary content-script-visible setting.
    const result = await _credentialVault.migrateLegacy(settings);
    await callExtensionApi(ext.storage.local, 'set', { [SETTINGS_STORAGE_KEY]: result.settings });
    return result.migrated;
}

const _credentialMigrationReady = migrateLegacyAiCredential().catch((error) => {
    // Never pass provider errors into lifecycle diagnostics: a storage-layer
    // error could contain IndexedDB keys or implementation details.
    void error;
    void _recordSwLifecycle('ai-credential-migration-failed');
    return false;
});

// Kept identical to popup.js's list — the manifest's content-script matches
// are the source of truth for both.
const YOUTUBE_TAB_URLS = [
    '*://youtube.com/*',
    '*://*.youtube.com/*',
    '*://youtube-nocookie.com/*',
    '*://*.youtube-nocookie.com/*',
    '*://youtu.be/*'
];

async function broadcastSettingsMutation(result, source = '') {
    // The initiating in-page surface already holds an optimistic snapshot and
    // every tab receives the authoritative storage.onChanged event.
    // Skipping its redundant tab message prevents an older queued write from
    // flashing over a newer optimistic change in the same tab.
    if (!result?.ok || source === 'in-page' || !ext.tabs?.query) return;
    try {
        // Content scripts also run on youtube-nocookie.com and youtu.be (see the
        // manifest matches); querying only *.youtube.com left those tabs to
        // converge later through storage.onChanged, and made this the second,
        // divergent copy of the popup's own broadcast list.
        const tabs = await callExtensionApi(ext.tabs, 'query', { url: YOUTUBE_TAB_URLS });
        const message = result.key
            ? { type: 'YTKIT_SETTING_CHANGED', key: result.key, value: result.value, settings: result.settings }
            : { type: 'YTKIT_SETTINGS_REPLACED', settings: result.settings };
        await Promise.allSettled((tabs || []).filter((tab) => tab?.id).map((tab) =>
            callExtensionApi(ext.tabs, 'sendMessage', tab.id, message)
        ));
    } catch (_) {
        // reason: persistence is authoritative; closing/suspended tabs refresh
        // from storage.onChanged or on their next load.
    }
}

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_REQUEST_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_FETCH_TIMEOUT_MS = 60000; // 60 seconds
const MAX_AI_REQUEST_BYTES = 512 * 1024;
const MAX_AI_RESPONSE_BYTES = 2 * 1024 * 1024;

async function performAiSummaryRequest(details) {
    if (!_credentialVault) throw new Error('AI credential vault is unavailable.');
    const validator = globalThis.YTKitCore?.validateAiProviderEndpoint;
    if (typeof validator !== 'function') throw new Error('AI provider policy is unavailable.');
    const validated = validator(details?.provider, details?.endpoint);
    const payload = details?.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('AI request payload must be a plain object.');
    }
    const requestBody = JSON.stringify(payload);
    if (new TextEncoder().encode(requestBody).byteLength > MAX_AI_REQUEST_BYTES) {
        throw new Error('AI request payload is too large.');
    }

    const credential = validated.policy.credentialHeader
        ? await _credentialVault.get(validated.provider)
        : '';
    if (validated.policy.credentialHeader && !credential) {
        const error = new Error(`No ${validated.provider} credential is configured in the toolbar popup.`);
        error.code = 'CREDENTIAL_MISSING';
        throw error;
    }

    const headers = { 'Content-Type': 'application/json' };
    if (credential) {
        headers[validated.policy.credentialHeader] = validated.policy.credentialPrefix + credential;
    }
    if (validated.provider === 'anthropic') headers['anthropic-version'] = '2023-06-01';

    const controller = new AbortController();
    const requestedTimeout = Number(details?.timeout);
    const timeoutMs = Math.max(1000, Math.min(
        Number.isFinite(requestedTimeout) && requestedTimeout > 0 ? requestedTimeout : MAX_FETCH_TIMEOUT_MS,
        MAX_FETCH_TIMEOUT_MS
    ));
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(validated.url, {
            method: 'POST',
            headers,
            body: requestBody,
            credentials: 'omit',
            redirect: credential ? 'manual' : 'follow',
            signal: controller.signal
        });
        if (response.type === 'opaqueredirect') throw new Error('Credentialed AI redirects are blocked.');
        if (response.url && new URL(response.url).origin !== validated.policy.origin) {
            throw new Error('AI response escaped the approved provider origin.');
        }
        const contentLength = Number(response.headers.get('content-length'));
        if (Number.isFinite(contentLength) && contentLength > MAX_AI_RESPONSE_BYTES) {
            throw new Error('AI response is too large.');
        }
        const text = await response.text();
        if (new TextEncoder().encode(text).byteLength > MAX_AI_RESPONSE_BYTES) {
            throw new Error('AI response body is too large.');
        }
        if (credential && text.includes(credential)) {
            throw new Error('AI provider response contained credential material and was blocked.');
        }
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (_) {
            // reason: surface a stable invalid-response error without logging provider output
            throw new Error('AI provider returned invalid JSON.');
        }
        if (!response.ok) {
            // Provider error bodies are untrusted and may echo headers or
            // account metadata. Keep the worker-to-content response generic.
            throw new Error(`AI provider rejected the request (HTTP ${response.status}).`);
        }
        return { ok: true, status: response.status, provider: validated.provider, data };
    } catch (error) {
        if (error?.name === 'AbortError') throw new Error('AI request timed out.');
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

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
// v3.20.0: Mirror into session storage so a SW restart between
// downloads.download() and the `state.complete` transition
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
    if (!ext.storage?.session) return;
    try {
        // Bound the hydration read. Every caller that awaits this promise
        // (reveal handlers, the serialized SW-lifecycle chain) would stall
        // indefinitely if storage.session.get never settled under storage
        // pressure; a timeout lets them proceed with the in-memory Set, which
        // is the fast path anyway.
        const stored = await Promise.race([
            callExtensionApi(ext.storage.session, 'get', _PENDING_REVEALS_KEY),
            new Promise((resolve) => setTimeout(() => resolve(null), 2000)),
        ]);
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
        // reason: storage.session is MV3+ (Chrome 102, Firefox 115);
        // absence is benign — we still fire reveals while the SW stays alive.
    }
})();

function _persistPendingReveals() {
    if (!ext.storage?.session) return;
    try {
        const payload = { [_PENDING_REVEALS_KEY]: [..._pendingReveals] };
        void callExtensionApi(ext.storage.session, 'set', payload).catch(() => {
            // reason: best-effort mirror; Set remains authoritative in memory.
        });
    } catch (_) {
        // reason: storage.session unavailable or quota-exceeded; ignore
    }
}

// v4.47.0 NEW-7: service-worker lifecycle ring. MV3 service workers
// restart unpredictably (~30 s idle kill, suspension on memory
// pressure, post-install). Several Astra Deck bugs surfaced only
// because the maintainer happened to hit a SW restart in development;
// the H25 cap-bypass-on-hydration fix is the most recent example.
// This ring records SW boot events into session storage so
// the bug-report bundle (NEW-1) can surface "how often did the SW
// die in this browsing session?" without depending on telemetry.
//
// Cap matches the documented-fix shape: 50 entries, oldest dropped on
// overflow. Storage is `storage.session` (transient — wiped on
// browser restart) so the ring naturally bounds itself to the current
// session. Schema:
//   { ts: number, event: 'sw-start', inFlightReveals: number }
const SW_LIFECYCLE_KEY = '_swLifecycle';
const SW_LIFECYCLE_CAP = 50;

// Audit pass: serialize lifecycle writes so concurrent
// _recordSwLifecycle calls (e.g. sw-start firing alongside an
// immediate reveal-failed for a download that was in-flight when
// the SW restarted) cannot lose entries via a read-modify-write
// race on storage.session. The SW is single-threaded JS,
// but async/await yields between `get` and `set` create the
// interleaving window. Chaining each call onto the previous one
// guarantees the get→push→set sequence is observed atomically per
// caller. Catch-rethrow-undefined keeps the chain alive even when
// a write rejects (storage quota, browser shutdown mid-write).
let _swLifecycleChain = Promise.resolve();

// Everything else in the diagnostics bundle is redacted before it is shared,
// but lifecycle event names are copied verbatim. A browser-generated message
// can carry environment or path detail, so map it to a fixed token instead.
function _classifyRevealError(err) {
    const message = String(err?.message || err || '').toLowerCase();
    if (!message) return 'unknown';
    if (message.includes('user') && message.includes('cancel')) return 'cancelled';
    if (message.includes('not found') || message.includes('no such')) return 'missing-file';
    if (message.includes('permission') || message.includes('denied')) return 'permission-denied';
    return 'other';
}

function _recordSwLifecycle(event, operationId = '') {
    if (!ext.storage?.session) return Promise.resolve();
    _swLifecycleChain = _swLifecycleChain
        .catch(() => undefined)
        .then(async () => {
            try {
                // Wait for the pending-reveals hydration so the in-flight count
                // we record reflects the persisted state, not just whatever the
                // freshly-restarted SW happens to have in memory.
                try { await _pendingRevealsReady; } catch (_) { /* reason: ring records even if hydration failed */ }
                const stored = await callExtensionApi(ext.storage.session, 'get', SW_LIFECYCLE_KEY);
                const arr = Array.isArray(stored?.[SW_LIFECYCLE_KEY])
                    ? stored[SW_LIFECYCLE_KEY]
                    : [];
                if (operationId && arr.some((entry) => entry?.event === event && entry?.operationId === operationId)) return;
                const entry = {
                    ts: Date.now(),
                    event,
                    inFlightReveals: _pendingReveals.size,
                };
                if (operationId) entry.operationId = operationId;
                arr.push(entry);
                // Trim from the head so the most recent events survive.
                while (arr.length > SW_LIFECYCLE_CAP) arr.shift();
                await callExtensionApi(ext.storage.session, 'set', { [SW_LIFECYCLE_KEY]: arr });
            } catch (_) {
                // reason: storage.session may be unavailable on older Firefox or under quota pressure;
                // the SW itself is not affected by ring-record failure.
            }
        });
    return _swLifecycleChain;
}

// Persist a minimal update checkpoint before Chrome swaps worker versions.
// On the first boot after the swap, the new worker resumes the checkpoint and
// records it with an idempotency key. If it is terminated between the
// "resuming" write and completion, the next boot safely finishes the same
// operation without duplicating the diagnostic event.
const UPDATE_RECOVERY_KEY = '_updateRecovery';

function _newUpdateRecoveryId(version) {
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `update:${String(version || 'unknown').slice(0, 40)}:${random}`;
}

async function _stageUpdateRecovery(details = {}) {
    if (!ext.storage?.local) return null;
    await _pendingRevealsReady.catch(() => {});
    const checkpoint = {
        id: _newUpdateRecoveryId(details.version),
        version: String(details.version || '').slice(0, 40),
        state: 'pending',
        stagedAt: Date.now(),
        pendingRevealIds: [..._pendingReveals].slice(-PENDING_REVEALS_CAP)
    };
    await callExtensionApi(ext.storage.local, 'set', { [UPDATE_RECOVERY_KEY]: checkpoint });
    await _recordSwLifecycle('update-recovery-staged', checkpoint.id);
    return checkpoint;
}

const _updateRecoveryReady = (async () => {
    if (!ext.storage?.local) return null;
    const stored = await callExtensionApi(ext.storage.local, 'get', UPDATE_RECOVERY_KEY);
    const checkpoint = stored?.[UPDATE_RECOVERY_KEY];
    if (!checkpoint || typeof checkpoint !== 'object' || !checkpoint.id
        || !['pending', 'resuming'].includes(checkpoint.state)) return checkpoint || null;
    const runningVersion = String(ext.runtime?.getManifest?.().version || '');
    // A normal worker restart can happen after onUpdateAvailable but before
    // Chrome activates the downloaded version. Leave the checkpoint pending
    // until the running manifest matches its target version; otherwise the old
    // worker could consume the only copy before storage.session is cleared.
    if (checkpoint.version && checkpoint.version !== runningVersion) return checkpoint;
    const resuming = { ...checkpoint, state: 'resuming', resumedAt: Date.now() };
    await callExtensionApi(ext.storage.local, 'set', { [UPDATE_RECOVERY_KEY]: resuming });
    for (const downloadId of Array.isArray(checkpoint.pendingRevealIds) ? checkpoint.pendingRevealIds : []) {
        _addPendingReveal(downloadId);
    }
    if (ext.storage?.session) {
        await callExtensionApi(ext.storage.session, 'set', { [_PENDING_REVEALS_KEY]: [..._pendingReveals] });
    }
    await _recordSwLifecycle('update-recovery-resumed', checkpoint.id);
    const resumed = { ...resuming, state: 'resumed', completedAt: Date.now() };
    // Drop the checkpoint once it has served its purpose. A 'resumed' record
    // was kept forever, so every install accumulated a permanent object that
    // rode along in full-storage reads and the popup's size stats.
    try {
        await callExtensionApi(ext.storage.local, 'remove', UPDATE_RECOVERY_KEY);
    } catch (error) {
        void error;
        await callExtensionApi(ext.storage.local, 'set', { [UPDATE_RECOVERY_KEY]: resumed });
    }
    return resumed;
})().catch((error) => {
    void error;
    void _recordSwLifecycle('update-recovery-failed');
    return null;
});

if (ext.runtime?.onUpdateAvailable?.addListener) {
    ext.runtime.onUpdateAvailable.addListener((details) => {
        void _stageUpdateRecovery(details).catch(() => {
            void _recordSwLifecycle('update-recovery-stage-failed');
        });
    });
}

// ── First-run onboarding ──
//
// The welcome flow used to run only from renderFirstRunSurfaces() when the
// toolbar popup opened, so installing and never clicking the icon was a silent
// no-op — the user got no onboarding at all. onInstalled is the only event that
// fires for an install the user has not interacted with.
//
// Sentinel key names are shared with extension/popup.js; a mismatch would make
// onboarding fire twice or never, so they are pinned by a test.
const FIRST_RUN_SEEN_KEY = 'ytkit_first_run_seen';
const FIRST_RUN_PENDING_KEY = 'ytkit_first_run_pending';
const FIRST_RUN_BADGE_TEXT = '1';

async function _handleFirstInstall(details) {
    // ONLY a genuine fresh install. 'update', 'chrome_update' and
    // 'shared_module_update' must not re-trigger onboarding — the popup's
    // What's New path already covers version changes, and re-badging on every
    // browser update is exactly the nag this project does not ship.
    if (details?.reason !== 'install') return false;

    // A reinstall over live data is an existing user. The popup's upgrade guard
    // stamps FIRST_RUN_SEEN_KEY for them; never overwrite it, or an established
    // install gets onboarded again.
    const stored = await callExtensionApi(ext.storage.local, 'get', [FIRST_RUN_SEEN_KEY]);
    if (stored?.[FIRST_RUN_SEEN_KEY] === true) return false;

    await callExtensionApi(ext.storage.local, 'set', { [FIRST_RUN_PENDING_KEY]: true });

    // Badge the toolbar action so onboarding is discoverable without the user
    // having to guess that the icon is worth clicking. The popup clears it.
    try {
        await callExtensionApi(ext.action, 'setBadgeText', { text: FIRST_RUN_BADGE_TEXT });
        await callExtensionApi(ext.action, 'setBadgeBackgroundColor', { color: '#ff4e45' });
    } catch (_) {
        // reason: badge APIs are cosmetic and vary by browser; the pending
        // sentinel alone still surfaces the welcome card on first popup open.
    }
    return true;
}

if (ext.runtime?.onInstalled?.addListener) {
    ext.runtime.onInstalled.addListener((details) => {
        void _handleFirstInstall(details).catch((error) => {
            void error;
            void _recordSwLifecycle('first-run-stage-failed');
        });
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
    'https://sponsorblock.kavin.rocks',
    'https://returnyoutubedislikeapi.com',
    'https://api.openai.com',
    'https://api.anthropic.com',
    'https://generativelanguage.googleapis.com',
    'https://api.cobalt.tools',
    'https://www.reddit.com',
    'https://old.reddit.com',
    'http://127.0.0.1:11434',
    // The shared catalogue's primary URL is http://127.0.0.1:9751 in the shipped profile;
    // every fallback origin is appended below from that same source.
    ...COMPANION_ORIGINS,
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
    ...COMPANION_ORIGINS,
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
                && (allowed.port === '' ? parsed.port === '' : parsed.port === allowed.port);
        });
    } catch {
        return false;
    }
}

function getRuntimeOptionalHostPermissions() {
    try {
        const origins = ext.runtime?.getManifest?.().optional_host_permissions;
        if (!Array.isArray(origins)) return [];
        return origins.filter((origin) => typeof origin === 'string' && origin.trim());
    } catch (_) {
        // reason: getManifest can be absent in tests or older extension contexts
        return [];
    }
}

function hostPermissionMatchesUrl(pattern, url) {
    const rawPattern = String(pattern || '').trim();
    if (!rawPattern.endsWith('/*')) return false;
    try {
        const parsed = new URL(url);
        const originPattern = rawPattern.slice(0, -2);
        const wildcardMatch = originPattern.match(/^([a-z][a-z0-9+.-]*:)\/\/\*\.([^/:]+)(?::(\d+))?$/i);
        if (wildcardMatch) {
            const [, protocol, baseHost, port = ''] = wildcardMatch;
            const host = parsed.hostname.toLowerCase();
            const normalizedBase = baseHost.toLowerCase();
            return parsed.protocol === protocol
                && (port === '' || parsed.port === port)
                && (host === normalizedBase || host.endsWith('.' + normalizedBase));
        }
        const allowed = new URL(originPattern);
        return parsed.protocol === allowed.protocol
            && parsed.hostname === allowed.hostname
            && (allowed.port === '' || parsed.port === allowed.port);
    } catch (_) {
        // reason: malformed URL or manifest pattern is not a match
        return false;
    }
}

function getRuntimeOptionalHostPermissionsForUrl(url) {
    return getRuntimeOptionalHostPermissions()
        .filter((pattern) => hostPermissionMatchesUrl(pattern, url));
}

function validateRuntimeOptionalHostRequest(origins) {
    if (!Array.isArray(origins) || origins.length === 0 || origins.length > 16) {
        throw new Error('Optional host permission request is invalid.');
    }
    const declared = new Set(getRuntimeOptionalHostPermissions());
    const normalized = Array.from(new Set(origins.map((origin) =>
        typeof origin === 'string' ? origin.trim() : '')));
    if (normalized.some((origin) => !origin || !declared.has(origin))) {
        throw new Error('Optional host permission was not declared by this extension build.');
    }
    return normalized;
}

function requestRuntimeOptionalHostPermissions(origins) {
    let normalized;
    try {
        normalized = validateRuntimeOptionalHostRequest(origins);
    } catch (error) {
        return Promise.reject(error);
    }
    const permissionsApi = ext.permissions;
    if (!permissionsApi || typeof permissionsApi.request !== 'function') {
        return Promise.reject(new Error('Runtime host permission prompts are unavailable.'));
    }
    // Call request() immediately in the message listener's user-gesture task.
    // Chromium propagates a content-script gesture through runtime messaging;
    // awaiting contains() first would risk consuming that transient activation.
    return callExtensionApi(permissionsApi, 'request', { origins: normalized }).then(Boolean);
}

function permissionsContainsOrigins(origins) {
    if (!Array.isArray(origins) || origins.length === 0) return Promise.resolve(true);
    const permissionsApi = ext.permissions;
    if (!permissionsApi || typeof permissionsApi.contains !== 'function') {
        return Promise.reject(new Error('Runtime host permission API is unavailable.'));
    }
    return callExtensionApi(permissionsApi, 'contains', { origins }).then(Boolean);
}

async function requireRuntimeOptionalHostGrant(url) {
    const origins = getRuntimeOptionalHostPermissionsForUrl(url);
    if (!origins.length) return;
    const granted = await permissionsContainsOrigins(origins);
    if (!granted) {
        throw new Error('Runtime host permission not granted: ' + origins.join(', '));
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
    'https://generativelanguage.googleapis.com',
    // Local-only services — see SECURITY NOTE above for why `localhost` is omitted.
    ...COMPANION_ORIGINS,
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

// Credential-bearing request headers. `Authorization` is the classic one, but
// the BYO AI providers authenticate with vendor-specific key headers instead
// (Anthropic: x-api-key; Google Gemini: x-goog-api-key; some proxies: api-key).
// These must be treated exactly like Authorization for both origin scoping and
// the redirect-leak guard — otherwise a 3xx from an allowlisted API host would
// resend the key to every hop under the default redirect:'follow'.
const SENSITIVE_AUTH_HEADERS = new Set([
    'authorization', 'x-api-key', 'x-goog-api-key', 'api-key'
]);

function hasSensitiveAuthHeader(headers) {
    if (!headers || typeof headers !== 'object') return false;
    return Object.keys(headers).some((key) => SENSITIVE_AUTH_HEADERS.has(key.toLowerCase()));
}

function filterRequestHeaders(headers, url) {
    const filtered = filterHeaders(headers, ALWAYS_BLOCKED_REQUEST_HEADERS);
    if (!canForwardAuthorizationHeader(url)) {
        for (const key of Object.keys(filtered)) {
            if (SENSITIVE_AUTH_HEADERS.has(key.toLowerCase())) {
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
        const maxBaseLength = Math.max(0, MAX_DOWNLOAD_FILENAME_LENGTH - extension.length);
        sanitized = sanitized.slice(0, maxBaseLength) + extension;
    }

    // A hostile or malformed trailing segment can itself exceed the cap, so
    // the extension-preserving rebuild above is not sufficient on its own.
    // Enforce the trust-boundary invariant after reassembly as well.
    sanitized = sanitized.slice(0, MAX_DOWNLOAD_FILENAME_LENGTH).replace(/[. ]+$/g, '');

    return sanitized || undefined;
}

// action.onClicked does not fire when default_popup is set in the
// manifest, so the toolbar click is handled entirely by popup.html/popup.js.
// v4.5.3: the `commands` keyboard shortcut was retired per the project's
// "no keyboard shortcuts" rule — the toolbar action button is the sole
// visible activator. The orphaned togglePanelForTab/sendTabMessage helpers
// (only callers were the removed commands listener) were also
// removed; popup.js carries its own sendTabMessage for the OPEN dispatch.
// Removing the manifest entry also removes the Firefox Ctrl+Shift+Y
// collision with "Show Downloads" without a per-vendor patch.

// v3.14.0: Fire "show in folder" reveal when the download reaches the
// complete state, not from a setTimeout. The previous implementation lost
// reveals whenever the MV3 service worker was killed during the wait.
if (ext.downloads?.onChanged?.addListener) {
    ext.downloads.onChanged.addListener((delta) => {
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
            void _recordSwLifecycle(`reveal-${state}`, `download:${delta.id}:${state}`);
            if (state === 'complete') {
                void callExtensionApi(ext.downloads, 'show', delta.id).catch((err) => {
                    // v4.47.0 R3: surface the reveal failure into the SW
                    // lifecycle ring (NEW-7) + console so the bug-report
                    // bundle picks it up. Common causes: file was moved
                    // between download completion and the reveal call,
                    // the user revoked downloads access (Firefox), or
                    // the path traversed a removable volume that was
                    // detached. Previously a silent swallow that hid
                    // the failure from support diagnostics.
                    try { console.warn('[Astra Deck] downloads.show failed for id', delta.id, err); }
                    catch (_) { /* reason: console may be unavailable in some SW contexts */ }
                    void _recordSwLifecycle('reveal-failed:' + _classifyRevealError(err));
                });
            }
        })();
    });
}

// v3.20.1: onErased prunes _pendingReveals if the user clears a download from
// history before it reaches a terminal state (cancel → erase, or crash-recovery
// wipe). Without this the id would persist in the Set across the SW restart
// and leak a slot in the session mirror. Delete is idempotent so a normal
// complete→erase sequence is a safe no-op on the second fire.
if (ext.downloads?.onErased?.addListener) {
    ext.downloads.onErased.addListener((downloadId) => {
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

ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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
    // `id` field are rejected too: runtime.sendMessage from a
    // legitimate context always sets it. (`tab` sender means a YouTube
    // tab; `id` matching us means our own contexts.)
    try {
        const isOurExtension = sender?.id === ext.runtime.id;
        if (!isOurExtension) {
            try { sendResponse({ error: 'Sender rejected.' }); } catch (_) {
                // reason: sender may already be disconnected
            }
            return false;
        }
    } catch (_) {
        // reason: runtime.id should always exist in a SW context,
        // but if reading it throws we conservatively reject the message.
        try { sendResponse({ error: 'Sender validation failed.' }); } catch (__) { /* reason: sender may already be disconnected; we've already returned false */ }
        return false;
    }

    if (msg.type === 'YTKIT_AI_CREDENTIAL_STATUS'
        || msg.type === 'YTKIT_AI_CREDENTIAL_SET'
        || msg.type === 'YTKIT_AI_CREDENTIAL_DELETE') {
        if (sender?.tab) {
            sendResponse({ ok: false, error: { code: 'TRUSTED_CONTEXT_REQUIRED', message: 'Manage AI credentials from the toolbar popup.' } });
            return false;
        }
        (async () => {
            await _credentialMigrationReady;
            if (!_credentialVault) throw new Error('AI credential vault is unavailable.');
            if (msg.type === 'YTKIT_AI_CREDENTIAL_STATUS') {
                sendResponse({ ok: true, providers: await _credentialVault.status() });
                return;
            }
            if (msg.type === 'YTKIT_AI_CREDENTIAL_SET') {
                const result = await _credentialVault.set(msg.provider, msg.credential, { remember: msg.remember === true });
                sendResponse({ ok: true, ...result });
                return;
            }
            const result = await _credentialVault.remove(msg.provider);
            sendResponse({ ok: true, ...result });
        })().catch((error) => {
            sendResponse({
                ok: false,
                error: { code: 'CREDENTIAL_OPERATION_FAILED', message: error?.message || 'Credential operation failed.' }
            });
        });
        return true;
    }

    if (msg.type === 'YTKIT_AI_SUMMARY_REQUEST') {
        (async () => {
            await _credentialMigrationReady;
            sendResponse(await performAiSummaryRequest(msg));
        })().catch((error) => {
            sendResponse({
                ok: false,
                error: {
                    code: error?.code || 'AI_REQUEST_FAILED',
                    message: error?.message || 'AI request failed.'
                }
            });
        });
        return true;
    }

    if (msg.type === 'YTKIT_MUTATE_SETTING'
        || msg.type === 'YTKIT_MUTATE_SETTINGS'
        || msg.type === 'YTKIT_REPLACE_SETTINGS') {
        (async () => {
            await _credentialMigrationReady;
            if (!_settingsMutationController) {
                sendResponse({
                    ok: false,
                    persisted: false,
                    key: msg.key,
                    previous: undefined,
                    value: undefined,
                    settings: null,
                    error: {
                        code: 'MUTATION_SERVICE_UNAVAILABLE',
                        message: 'The settings service is unavailable.'
                    }
                });
                return;
            }
            const result = msg.type === 'YTKIT_MUTATE_SETTING'
                ? await _settingsMutationController.mutate(msg.key, msg.value)
                : msg.type === 'YTKIT_MUTATE_SETTINGS'
                    ? await _settingsMutationController.mutateMany(msg.changes)
                    : await _settingsMutationController.replace(msg.settings);
            if (result.ok) void broadcastSettingsMutation(result, msg.source);
            sendResponse(result);
        })().catch((error) => {
            sendResponse({
                ok: false,
                persisted: false,
                key: msg.key,
                previous: undefined,
                value: undefined,
                settings: null,
                error: {
                    code: 'MUTATION_SERVICE_FAILED',
                    message: error?.message || 'The settings service failed.'
                }
            });
        });
        return true;
    }

    if (msg.type === 'YTKIT_REQUEST_OPTIONAL_HOSTS') {
        requestRuntimeOptionalHostPermissions(msg.origins).then((granted) => {
            sendResponse({ ok: granted, granted });
        }).catch((error) => {
            sendResponse({
                ok: false,
                granted: false,
                error: error?.message || 'Optional host permission request failed.'
            });
        });
        return true;
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

        callExtensionApi(ext.tabs, 'create', createProperties).then((tab) => {
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

        const { method, url, headers, data, timeout, credentials } = details;
        if (typeof url !== 'string' || !url) {
            sendResponse({ error: 'Invalid fetch URL.' });
            return false;
        }

        if (!isUrlAllowed(url)) {
            sendResponse({ error: `URL not in allowlist: ${url}` });
            return false;
        }

        // Chrome runtime messaging JSON-serializes values instead of applying
        // the structured-clone algorithm. ArrayBuffer/view, Blob, and FormData
        // bodies therefore cannot cross this boundary without corruption. The
        // content script rejects them before dispatch; keep this check here as
        // defense in depth for Firefox and extension-page callers, where the
        // original object can still reach the background listener.
        const unsupportedBody = data instanceof ArrayBuffer
            || ArrayBuffer.isView(data)
            || data instanceof Blob
            || data instanceof FormData;
        if (unsupportedBody) {
            sendResponse({
                error: 'Binary and form-data request bodies are not supported by the extension fetch bridge. Encode the body as a string.'
            });
            return false;
        }

        let responded = false;

        const startFetch = () => {
            const validMethods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
            const normalizedMethod = String(method || 'GET').toUpperCase();
            if (!validMethods.includes(normalizedMethod)) {
                responded = true;
                sendResponse({ error: `Unsupported fetch method: ${normalizedMethod}` });
                return;
            }

            const filteredHeaders = filterRequestHeaders(headers, url);
            if (isJsonLikePayload(data) && !hasHeader(filteredHeaders, 'content-type')) {
                filteredHeaders['Content-Type'] = 'application/json';
            }
            let requestBody = null;
            if (data !== null && data !== undefined
                && normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') {
                try {
                    requestBody = normalizeRequestBody(data, filteredHeaders);
                } catch (_) {
                    responded = true;
                    sendResponse({ error: 'Request body could not be serialized.' });
                    return;
                }
                const requestBytes = new TextEncoder().encode(requestBody).byteLength;
                if (requestBytes > MAX_REQUEST_BYTES) {
                    responded = true;
                    sendResponse({ error: `Request body too large (${requestBytes} bytes)` });
                    return;
                }
            }

            const controller = new AbortController();
            const DEFAULT_FETCH_TIMEOUT_MS = 30000;
            const MIN_FETCH_TIMEOUT_MS = 1000;
            const requestedTimeout = Number.isFinite(timeout) && timeout > 0
                ? timeout
                : DEFAULT_FETCH_TIMEOUT_MS;
            const clampedTimeout = Math.max(MIN_FETCH_TIMEOUT_MS, Math.min(requestedTimeout, MAX_FETCH_TIMEOUT_MS));
            let timer = null;

            timer = setTimeout(() => {
                if (responded) return;
                responded = true;
                controller.abort();
                sendResponse({ timeout: true });
            }, clampedTimeout);

            // Origin allowlist decides whether cookies MAY be sent; a caller-
            // supplied credentials:'omit' downgrades an allowlisted request to
            // anonymous. Any other caller value is ignored — the bridge can
            // never upgrade a non-allowlisted origin to 'include'.
            const sendsCredentials = shouldSendCredentials(url) && credentials !== 'omit';
            const fetchOpts = {
                method: normalizedMethod,
                signal: controller.signal,
                credentials: sendsCredentials ? 'include' : 'omit'
            };

            if (Object.keys(filteredHeaders).length > 0) {
                fetchOpts.headers = filteredHeaders;
            }

            // Credential-leak hardening: when this request carries cookies
            // (credentials: 'include') or an Authorization header, do NOT let the
            // browser silently auto-follow cross-origin redirects. With the
            // default `redirect: 'follow'`, a 3xx from an allowlisted origin
            // would resend those secrets to every redirect hop *before* the
            // post-redirect allowlist check below ever runs. `redirect: 'manual'`
            // surfaces a 3xx as an opaqueredirect we reject outright, so secrets
            // never reach an unvalidated host. Non-credentialed requests keep
            // following redirects (no secret to leak).
            if (sendsCredentials || hasSensitiveAuthHeader(filteredHeaders)) {
                fetchOpts.redirect = 'manual';
            }
            if (requestBody !== null) {
                fetchOpts.body = requestBody;
            }

            fetch(url, fetchOpts).then(async (resp) => {
            // NOTE: the clampedTimeout deadline intentionally spans the entire
            // connect + headers + body-drain lifecycle. We do NOT clear the
            // timer here on headers arrival — a slowloris upstream that trickles
            // bytes under MAX_RESPONSE_BYTES must still hit the deadline, whose
            // controller.abort() tears down an in-progress reader.read() and
            // whose callback returns {timeout:true} to the caller. The timer is
            // cleared only on terminal paths below (success / early returns /
            // catch).
            if (responded) return;

            // A credentialed/auth request hit a redirect (see redirect:'manual'
            // above). The browser stopped without following it, so no secret
            // leaked — reject so the content script never receives a body from
            // an unvalidated hop.
            if (resp.type === 'opaqueredirect') {
                responded = true;
                if (timer) { clearTimeout(timer); timer = null; }
                sendResponse({ error: 'Blocked redirect on a credentialed request (possible cross-origin credential leak)' });
                try { controller.abort(); } catch (_) {
                    // reason: controller may already be aborted
                }
                return;
            }

            // SSRF hardening: if redirects followed us to an origin that is NOT
            // in the allowlist, reject the response before the body leaks back
            // to the content script. `fetch` defaults to `redirect: 'follow'`,
            // so an allowlisted origin that 302s to an internal IP or an
            // arbitrary host would otherwise bypass the origin allowlist.
            if (resp.url && resp.url !== url && !isUrlAllowed(resp.url)) {
                responded = true;
                if (timer) { clearTimeout(timer); timer = null; }
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
                    if (timer) { clearTimeout(timer); timer = null; }
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
                            if (timer) { clearTimeout(timer); timer = null; }
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
                        if (timer) { clearTimeout(timer); timer = null; }
                        sendResponse({ error: `Response body too large (${measuredBytes} bytes)` });
                        return;
                    }
                }
            } catch (readErr) {
                if (responded) return;
                responded = true;
                if (timer) { clearTimeout(timer); timer = null; }
                sendResponse({ error: readErr.message || 'Failed to read response body' });
                return;
            }

            responded = true;
            if (timer) { clearTimeout(timer); timer = null; }
            const responseHeaders = [...resp.headers.entries()]
                .filter(([k]) => !BLOCKED_RESPONSE_HEADERS.has(k.toLowerCase()))
                .map(([k, v]) => `${k}: ${String(v).replace(/[\r\n]/g, ' ')}`)
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
        };

        requireRuntimeOptionalHostGrant(url).then(() => {
            startFetch();
        }).catch((err) => {
            if (responded) return;
            responded = true;
            sendResponse({ error: err.message || 'Runtime host permission check failed.' });
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
        callExtensionApi(ext.downloads, 'download', opts).then(async (downloadId) => {
                if (msg.showInFolder) {
                    // v3.14.0: switch from setTimeout(900) to downloads.onChanged.
                    // The service worker can be terminated during the 900 ms window on
                    // slow networks, silently dropping the reveal. Listening for the
                    // `state.complete` transition fires reveal when the file actually
                    // exists, and the SW is kept alive while a download is in flight.
                    // v3.20.0: mirror to storage.session so a SW cold-start
                    // between add and `state.complete` still honours the reveal.
                    // Audit pass: route through _addPendingReveal so the cap is enforced.
                    try { await _pendingRevealsReady; } catch (_) {
                        // reason: hydration already logged; fall through to in-memory add
                    }
                    _addPendingReveal(downloadId);
                    _persistPendingReveals();
                }
                sendResponse({ downloadId });
        }).catch((error) => {
            sendResponse({ error: error?.message || 'Download failed.' });
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
        callExtensionApi(ext.cookies, 'getAll', { domain }).then(cookies => {
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
                await _updateRecoveryReady;
                await _swLifecycleChain.catch(() => undefined);
                if (!ext.storage?.session) {
                    sendResponse({ entries: [], error: null });
                    return;
                }
                const stored = await callExtensionApi(ext.storage.session, 'get', SW_LIFECYCLE_KEY);
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

    if (msg.type === 'NATIVE_MSG_GET_TOKEN') {
        (async () => {
            let responded = false;
            const respond = (payload) => {
                if (responded) return;
                responded = true;
                try { sendResponse(payload); } catch (_) {
                    // reason: sender may have disconnected
                }
            };
            try {
                if (!ext.runtime?.connectNative) {
                    respond({ token: null, error: 'Native messaging unavailable' });
                    return;
                }
                const port = ext.runtime.connectNative('com.astra.deck.downloader');
                const timeout = setTimeout(() => {
                    try { port.disconnect(); } catch (_) { /* reason: already disconnected */ }
                    respond({ token: null, error: 'Native messaging timeout' });
                }, 5000);
                port.onMessage.addListener((response) => {
                    clearTimeout(timeout);
                    try { port.disconnect(); } catch (_) { /* reason: already disconnected */ }
                    if (response && response.ok && response.token) {
                        respond({ token: response.token, error: null });
                    } else {
                        respond({ token: null, error: response?.error || 'Token not available' });
                    }
                });
                port.onDisconnect.addListener(() => {
                    clearTimeout(timeout);
                    // Firefox reports the disconnect reason on port.error;
                    // runtime.lastError is the Chrome-only channel for ports.
                    const lastError = port.error?.message
                        || ext.runtime.lastError?.message
                        || '';
                    respond({ token: null, error: lastError || 'Native host disconnected' });
                });
                port.postMessage({ type: 'get-token' });
            } catch (err) {
                respond({ token: null, error: err?.message || 'Native messaging failed' });
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
