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
// `require-trusted-types-for 'script'` (added to the extension-pages CSP in
// v4.88.3) makes importScripts a TrustedScriptURL sink, and an MV3 worker that
// throws here never registers at all — the extension loads with no background
// page. The policy is created inline rather than imported because the module
// that owns the HTML policy is itself one of the scripts being imported.
//
// It is deliberately not the `astraDeck` policy: creating a duplicate name
// throws, and `core/trusted-html.js` needs that name later. The CSP allowlists
// both. Only same-directory `core/*.js` paths are minted, so the policy cannot
// be borrowed to load anything else.
const _loaderPolicy = (() => {
    if (typeof trustedTypes === 'undefined' || !trustedTypes.createPolicy) return null;
    try {
        return trustedTypes.createPolicy('astraDeckLoader', {
            createScriptURL(value) {
                const url = String(value);
                if (!/^core\/[a-z0-9-]+\.js$/.test(url)) {
                    throw new TypeError('Refused to mint a script URL outside core/');
                }
                return url;
            }
        });
    } catch (_) {
        // reason: an engine without Trusted Types needs no policy at all
        return null;
    }
})();

function _coreScriptUrl(pathname) {
    return _loaderPolicy ? _loaderPolicy.createScriptURL(pathname) : pathname;
}

if (typeof importScripts === 'function') {
    importScripts(
        ...[
            'core/companion-ports.js',
            'core/cookie-handoff.js',
            'core/remote-list-scope.js',
            'core/settings-schema.js',
            'core/persisted-domains.js',
            'core/policy-profile.js',
            'core/settings-sync.js',
            'core/settings-controller.js',
            'core/credential-vault.js'
        ].map(_coreScriptUrl)
    );
}

const COMPANION_PORT_CATALOGUE = globalThis.YTKitCore?.companionPorts || null;
const COOKIE_HANDOFF = globalThis.YTKitCore?.cookieHandoff || null;
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

const _settingsSync = globalThis.YTKitCore?.createSettingsSyncController?.({
    localStorage: ext.storage?.local,
    syncStorage: ext.storage?.sync,
    settingsKey: SETTINGS_STORAGE_KEY,
    schema: globalThis.__YTKIT_SETTINGS_SCHEMA__?.SETTINGS_SCHEMA,
    policy: globalThis.YTKitCore?.createPolicyProfile?.(),
    callApi: callExtensionApi
}) || null;
_settingsSync?.installListeners();
// A debounced push lives on a timer inside this worker. Chrome suspends the
// worker on idle and the timer dies with it, so a change made in the last
// moments before teardown was written locally and never reached the account.
// onSuspend is the one notice we get.
if (ext.runtime?.onSuspend?.addListener) {
    ext.runtime.onSuspend.addListener(() => {
        try {
            const pending = _settingsSync?.flushLocalChanges?.();
            if (pending?.catch) pending.catch(() => { /* reason: teardown is not a place to report */ });
        } catch (_) {
            // reason: never throw out of a suspend handler
        }
    });
}
void _credentialMigrationReady
    .then(() => _settingsSync?.initialize())
    .catch((error) => {
        void error;
        void _recordSwLifecycle('settings-sync-startup-failed');
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
const ZERO_AD_RULESET_ID = 'astra_zero_ads';
const ZERO_AD_PAUSE_KEY = 'ytkit_zero_ad_pause_until';
const ZERO_AD_PAUSE_ALARM = 'ytkit-zero-ad-restore';
const ZERO_AD_PAUSE_MS = 15 * 60 * 1000;

async function readZeroAdPauseUntil() {
    const stored = await callExtensionApi(ext.storage.session, 'get', ZERO_AD_PAUSE_KEY);
    const pauseUntil = Number(stored?.[ZERO_AD_PAUSE_KEY]);
    return Number.isFinite(pauseUntil) && pauseUntil > 0 ? pauseUntil : null;
}

async function setZeroAdRulesEnabled(enabled) {
    const current = await callExtensionApi(
        ext.declarativeNetRequest,
        'getEnabledRulesets'
    );
    const normalized = Array.isArray(current) ? current : [];
    const isEnabled = normalized.includes(ZERO_AD_RULESET_ID);
    if (isEnabled === enabled) return normalized;
    await callExtensionApi(ext.declarativeNetRequest, 'updateEnabledRulesets', enabled
        ? { enableRulesetIds: [ZERO_AD_RULESET_ID] }
        : { disableRulesetIds: [ZERO_AD_RULESET_ID] });
    return enabled
        ? Array.from(new Set([...normalized, ZERO_AD_RULESET_ID]))
        : normalized.filter((id) => id !== ZERO_AD_RULESET_ID);
}

async function scheduleZeroAdRestore(pauseUntil) {
    await callExtensionApi(ext.alarms, 'create', ZERO_AD_PAUSE_ALARM, { when: pauseUntil });
}

async function clearZeroAdPauseRecord() {
    await callExtensionApi(ext.storage.session, 'remove', ZERO_AD_PAUSE_KEY);
    try {
        await callExtensionApi(ext.alarms, 'clear', ZERO_AD_PAUSE_ALARM);
    } catch (_) {
        // reason: restoration is authoritative; a missing alarm API or alarm
        // does not make an already-enabled ruleset unsafe.
    }
}

async function reconcileZeroAdPause(now = Date.now()) {
    const pauseUntil = await readZeroAdPauseUntil();
    if (pauseUntil && pauseUntil > now) {
        await setZeroAdRulesEnabled(false);
        await scheduleZeroAdRestore(pauseUntil);
        return { paused: true, pauseUntil };
    }
    await setZeroAdRulesEnabled(true);
    await clearZeroAdPauseRecord();
    return { paused: false, pauseUntil: null };
}

let _zeroAdRecoveryReady = reconcileZeroAdPause().catch((error) => {
    void error;
    return { paused: false, pauseUntil: null };
});

async function pauseZeroAdRulesForSession() {
    await _zeroAdRecoveryReady;
    const pauseUntil = Date.now() + ZERO_AD_PAUSE_MS;
    await callExtensionApi(ext.storage.session, 'set', { [ZERO_AD_PAUSE_KEY]: pauseUntil });
    try {
        await setZeroAdRulesEnabled(false);
        await scheduleZeroAdRestore(pauseUntil);
    } catch (error) {
        // Never leave a ruleset disabled without a durable restoration path.
        await setZeroAdRulesEnabled(true).catch(() => {});
        await clearZeroAdPauseRecord().catch(() => {});
        throw error;
    }
    return getZeroAdStatus({ reconcile: false });
}

async function resumeZeroAdRulesForSession() {
    await _zeroAdRecoveryReady;
    await setZeroAdRulesEnabled(true);
    await clearZeroAdPauseRecord();
    return getZeroAdStatus({ reconcile: false });
}

async function getZeroAdStatus({ reconcile = true } = {}) {
    await _zeroAdRecoveryReady;
    const pause = reconcile
        ? await reconcileZeroAdPause()
        : {
            pauseUntil: await readZeroAdPauseUntil(),
            paused: false
        };
    const enabledRulesets = await callExtensionApi(
        ext.declarativeNetRequest,
        'getEnabledRulesets'
    );
    const normalized = Array.isArray(enabledRulesets)
        ? enabledRulesets.filter((id) => typeof id === 'string')
        : [];
    return {
        ok: true,
        rulesetId: ZERO_AD_RULESET_ID,
        enabled: normalized.includes(ZERO_AD_RULESET_ID),
        enabledRulesets: normalized,
        paused: pause.paused === true
            || (!!pause.pauseUntil && pause.pauseUntil > Date.now()
                && !normalized.includes(ZERO_AD_RULESET_ID)),
        pauseUntil: pause.pauseUntil || null,
        pauseDurationMs: ZERO_AD_PAUSE_MS
    };
}

if (ext.alarms?.onAlarm?.addListener) {
    ext.alarms.onAlarm.addListener((alarm) => {
        if (alarm?.name !== ZERO_AD_PAUSE_ALARM) return;
        _zeroAdRecoveryReady = reconcileZeroAdPause().catch((error) => {
            void error;
            return { paused: false, pauseUntil: null };
        });
    });
}

// The AI summary endpoint is reachable from the isolated content script by
// design -- the in-page summary button calls it. That is a deliberate
// capability, but unlike EXT_FETCH it carried no grant re-check and no
// throttle, so a compromised content script could drive the user's paid
// provider key for arbitrary completions at whatever rate it liked. The key
// itself is safe (origin-locked vault, response scanned for credential
// material); what was unbounded was the SPEND.
const AI_MAX_IN_FLIGHT_PER_TAB = 2;
const AI_MIN_REQUEST_INTERVAL_MS = 1500;
const AI_TAB_BUDGET_TTL_MS = 5 * 60 * 1000;
const _aiTabBudgets = new Map();

function _pruneAiTabBudgets(now) {
    if (_aiTabBudgets.size < 64) return;
    for (const [tabId, budget] of _aiTabBudgets) {
        if (budget.inFlight <= 0 && now - budget.lastStart > AI_TAB_BUDGET_TTL_MS) {
            _aiTabBudgets.delete(tabId);
        }
    }
}

// Returns a release() the caller MUST invoke, or throws a coded error.
function acquireAiRequestSlot(sender) {
    // A popup-originated request has no tab and is already trust-gated.
    const tabId = sender?.tab?.id;
    if (!Number.isInteger(tabId)) return () => {};
    const now = Date.now();
    _pruneAiTabBudgets(now);
    const budget = _aiTabBudgets.get(tabId) || { inFlight: 0, lastStart: 0 };
    if (budget.inFlight >= AI_MAX_IN_FLIGHT_PER_TAB) {
        const error = new Error('Too many AI requests are already in flight for this tab.');
        error.code = 'AI_RATE_LIMITED';
        throw error;
    }
    if (now - budget.lastStart < AI_MIN_REQUEST_INTERVAL_MS) {
        const error = new Error('AI requests from this tab are being sent too quickly.');
        error.code = 'AI_RATE_LIMITED';
        throw error;
    }
    budget.inFlight += 1;
    budget.lastStart = now;
    _aiTabBudgets.set(tabId, budget);
    let released = false;
    return () => {
        if (released) return;
        released = true;
        const current = _aiTabBudgets.get(tabId);
        if (current) current.inFlight = Math.max(0, current.inFlight - 1);
    };
}

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
    // Same door EXT_FETCH goes through. A provider origin the user never
    // granted must not be reachable just because a credential exists for it.
    await requireRuntimeOptionalHostGrant(validated.url);

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
        // Streamed against the cap: a chunked provider response declares no
        // content-length, so buffering first and measuring after let an
        // oversized body into the worker before the limit could apply.
        let text;
        try {
            ({ text } = await readTextBounded(
                response, MAX_AI_RESPONSE_BYTES, 'AI response', controller));
        } catch (err) {
            if (/exceeds the \d+-byte limit/.test(err?.message || '')) {
                throw new Error('AI response is too large.');
            }
            throw err;
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

// v3.20.3: explicit cookie-jar wire contract. The narrowed authenticated
// handoff also normalizes in core/cookie-handoff.js; this final mapper keeps
// the service-worker response and userscript fallback wire-compatible.
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

const COOKIE_HANDOFF_CAPABILITY_TTL_MS = 20 * 1000;
const COOKIE_HANDOFF_CAPABILITY_LIMIT = 64;
const COOKIE_HANDOFF_PURPOSE = 'cookie-handoff';
const COOKIE_HANDOFF_SERVICE = 'astra-downloader';
const _cookieHandoffCapabilities = new Map();

function cookieHandoffProtocolVersion() {
    return Number.isInteger(COOKIE_HANDOFF?.PROTOCOL_VERSION)
        ? COOKIE_HANDOFF.PROTOCOL_VERSION
        : 1;
}

function emptyCookieHandoffDiagnostics(status) {
    return {
        protocolVersion: cookieHandoffProtocolVersion(),
        examinedCount: 0,
        acceptedCount: 0,
        acceptedBytes: 0,
        droppedCount: 0,
        reasons: {},
        status
    };
}

function cookieHandoffFailure(code) {
    return {
        ok: false,
        cookies: [],
        diagnostics: emptyCookieHandoffDiagnostics(code),
        error: {
            code,
            message: 'Authenticated cookie handoff is unavailable.'
        }
    };
}

function cookieHandoffSenderBinding(sender) {
    const tabId = sender?.tab?.id;
    if (!Number.isInteger(tabId) || tabId < 0) return null;
    if (sender?.frameId !== undefined && sender.frameId !== 0) return null;

    let parsed;
    try {
        parsed = new URL(sender?.url || sender?.tab?.url || '');
    } catch (_) {
        return null;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:'
        || (hostname !== 'youtube.com' && !hostname.endsWith('.youtube.com'))) {
        return null;
    }

    return {
        tabId,
        frameId: 0,
        documentId: typeof sender.documentId === 'string' ? sender.documentId.slice(0, 256) : null,
        // Second document-identity leg. When the host does not populate
        // documentId, issue-time and consume-time both hold null and
        // `null === null` passes -- the advertised document binding quietly
        // degrades to tab+container, and within the 20s TTL a same-tab
        // top-frame navigation could satisfy a binding a different document
        // originated. The document's own URL closes that gap without
        // requiring documentId support.
        // Keep the query string because two different watch documents share
        // `/watch`. Without documentId (including Firefox 142), stripping the
        // video ID let a same-tab navigation reuse the prior binding during
        // its short lifetime. Fragments stay excluded because they don't
        // identify a different HTTP document.
        documentUrl: parsed.origin + parsed.pathname + parsed.search,
        cookieStoreId: typeof sender.tab.cookieStoreId === 'string'
            ? sender.tab.cookieStoreId.slice(0, 128)
            : null
    };
}

function sameCookieHandoffBinding(left, right) {
    return !!left && !!right
        && left.tabId === right.tabId
        && left.frameId === right.frameId
        && left.documentId === right.documentId
        && left.documentUrl === right.documentUrl
        && left.cookieStoreId === right.cookieStoreId;
}

function pruneCookieHandoffCapabilities(now = Date.now()) {
    for (const [token, capability] of _cookieHandoffCapabilities) {
        if (!capability || capability.expiresAt <= now) _cookieHandoffCapabilities.delete(token);
    }
}

function randomCookieHandoffToken() {
    if (typeof globalThis.crypto?.getRandomValues !== 'function') return '';
    const bytes = new Uint8Array(24);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// A fresh challenge per attempt. The native host answers it; the HTTP endpoint
// then has to return the same answer, which is the only thing distinguishing the
// companion from anything else that can bind a companion port.
function randomEndpointChallenge() {
    if (typeof globalThis.crypto?.getRandomValues !== 'function') return '';
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function issueCookieHandoffCapability(sender) {
    const binding = cookieHandoffSenderBinding(sender);
    if (!binding || !COOKIE_HANDOFF?.sanitizeCookieHandoff) return null;
    const now = Date.now();
    pruneCookieHandoffCapabilities(now);

    // A document gets one live grant. Reissuing proof revokes its prior grant
    // rather than leaving a pile of independently usable credentials.
    for (const [token, capability] of _cookieHandoffCapabilities) {
        if (sameCookieHandoffBinding(capability.binding, binding)) {
            _cookieHandoffCapabilities.delete(token);
        }
    }
    if (_cookieHandoffCapabilities.size >= COOKIE_HANDOFF_CAPABILITY_LIMIT) {
        const oldestToken = _cookieHandoffCapabilities.keys().next().value;
        if (oldestToken) _cookieHandoffCapabilities.delete(oldestToken);
    }

    let token = '';
    for (let attempt = 0; attempt < 3 && !token; attempt += 1) {
        const candidate = randomCookieHandoffToken();
        if (candidate && !_cookieHandoffCapabilities.has(candidate)) token = candidate;
    }
    if (!token) return null;

    const capability = {
        binding,
        expiresAt: now + COOKIE_HANDOFF_CAPABILITY_TTL_MS
    };
    _cookieHandoffCapabilities.set(token, capability);
    return {
        token,
        protocolVersion: cookieHandoffProtocolVersion(),
        expiresAt: capability.expiresAt
    };
}

function consumeCookieHandoffCapability(token, protocolVersion, sender) {
    const now = Date.now();
    pruneCookieHandoffCapabilities(now);
    if (typeof token !== 'string' || !/^[a-f0-9]{48}$/.test(token)) {
        return { ok: false, code: 'COOKIE_CAPABILITY_INVALID' };
    }

    const capability = _cookieHandoffCapabilities.get(token);
    if (!capability) return { ok: false, code: 'COOKIE_CAPABILITY_INVALID' };

    // Delete before any asynchronous cookie API work. Every grant is one-use,
    // including failed attempts with the wrong protocol or tab binding.
    _cookieHandoffCapabilities.delete(token);
    if (protocolVersion !== cookieHandoffProtocolVersion()) {
        return { ok: false, code: 'COOKIE_HANDOFF_PROTOCOL_MISMATCH' };
    }
    const binding = cookieHandoffSenderBinding(sender);
    if (!sameCookieHandoffBinding(capability.binding, binding)) {
        return { ok: false, code: 'COOKIE_CAPABILITY_CONTEXT_MISMATCH' };
    }
    if (capability.expiresAt <= now) {
        return { ok: false, code: 'COOKIE_CAPABILITY_INVALID' };
    }
    return { ok: true, binding };
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
    'https://www.reddit.com',
    'https://old.reddit.com',
    // Fixed, data-only selector updates from the project-owned repository.
    // The caller cannot supply an arbitrary URL; the dedicated message below
    // fetches only SELECTOR_ASSET_URL and keeps the same origin allowlist.
    'https://raw.githubusercontent.com',
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
// Detached-signature verification for the two documents that can change
// shipped behavior without a release.
//
// The feature-disable feed had no authenticity check of any kind, and the
// selector asset's `sha256:` digest is parsed out of the same document it
// vouches for — it catches truncation and corruption, never substitution.
// Whoever can write the repository or intercept the CDN could pause features
// or replace selectors on every install.
//
// ECDSA P-256 over SHA-256, raw r||s, base64, served from `<url>.sig`. Not
// Ed25519: WebCrypto did not expose it until Chrome 137 and this project
// supports Chrome 120. The private half never enters the repository; see
// docs/signing-keys.md §12 and scripts/sign-remote-feeds.js.
const FEED_SIGNING_PUBLIC_KEY = Object.freeze({
    kty: 'EC',
    crv: 'P-256',
    x: 'JHadRIB-_yJUD9ROm7AclgBUER4Yo1jp5tCvijBoHqo',
    y: 'CBJ2lKr699c_TgmBPKEJV4QhoEmLlV4a3yfC0qnCuGQ'
});
const FEED_SIGNATURE_SUFFIX = '.sig';
const FEED_SIGNATURE_BYTES = 64;
const MAX_FEED_SIGNATURE_BYTES = 256;
const FEED_SIGNATURE_TIMEOUT_MS = 10000;

let _feedSigningKeyPromise = null;

function importFeedSigningKey() {
    if (_feedSigningKeyPromise) return _feedSigningKeyPromise;
    _feedSigningKeyPromise = (async () => {
        const subtle = globalThis.crypto?.subtle;
        if (!subtle?.importKey) return null;
        return subtle.importKey(
            'jwk',
            { ...FEED_SIGNING_PUBLIC_KEY, ext: true, key_ops: ['verify'] },
            // i18n-static: WebCrypto algorithm identifier, not user copy
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify']
        );
    })().catch(() => null);
    return _feedSigningKeyPromise;
}

function decodeFeedSignature(text) {
    if (typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) return null;
    let binary;
    try {
        binary = atob(trimmed);
    } catch (_) {
        // reason: a signature that does not decode is a failed verification
        return null;
    }
    if (binary.length !== FEED_SIGNATURE_BYTES) return null;
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function fetchFeedSignature(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
        try { controller.abort(); } catch (_) {
            // reason: already aborted
        }
    }, FEED_SIGNATURE_TIMEOUT_MS);
    try {
        const response = await fetch(url + FEED_SIGNATURE_SUFFIX, {
            method: 'GET',
            headers: { Accept: 'text/plain' },
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'error',
            signal: controller.signal
        });
        if (!response.ok) return null;
        const { text } = await readTextBounded(
            response, MAX_FEED_SIGNATURE_BYTES, 'Feed signature', controller);
        return text;
    } catch (_) {
        // reason: an unreachable signature is an unverifiable payload
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// Fails closed on every path: no key, no signature, malformed signature, a
// signature that does not match, or a runtime without WebCrypto. The caller
// keeps whatever it already had.
async function verifyFeedSignature(payloadText, signatureText) {
    const key = await importFeedSigningKey();
    if (!key) return false;
    const signature = decodeFeedSignature(signatureText);
    if (!signature) return false;
    try {
        return await globalThis.crypto.subtle.verify(
            // i18n-static: WebCrypto algorithm identifier, not user copy
            { name: 'ECDSA', hash: 'SHA-256' },
            key,
            signature,
            new TextEncoder().encode(payloadText)
        );
    } catch (_) {
        // reason: a verification that throws has not verified
        return false;
    }
}

const SELECTOR_ASSET_URL = 'https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/refs/heads/main/selector-packs.json';
const MAX_SELECTOR_ASSET_BYTES = 256 * 1024;
const MAX_COBALT_RESPONSE_BYTES = 512 * 1024;
const COBALT_REQUEST_TIMEOUT_MS = 15000;

// The broken-feature disable feed. Same host and same shape as the selector
// asset above: a fixed project-owned URL, fetched through its own message so a
// compromised page cannot redirect it, data only, credentials omitted.
//
// The worker owns the cache rather than each tab because every YouTube tab
// asks on boot and they would otherwise each hit the network. Cached in
// storage.local (not session) so a worker eviction does not turn one fetch per
// six hours into one fetch per wake.
const FEATURE_DISABLE_FEED_URL = 'https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/refs/heads/main/feature-disable-feed.csv';
const MAX_FEATURE_DISABLE_FEED_BYTES = 64 * 1024;
// v4.88.3 bumped this key. The previous key holds entries written before
// signature verification existed, and the cache is served for up to 30 days
// (FEATURE_DISABLE_FEED_STALE_MS) without re-fetching. Reusing the key would
// have let a payload cached by an older build — including one an attacker had
// substituted while the feed was unauthenticated — keep being served past the
// upgrade that was supposed to start verifying it. A new key means the first
// read after upgrade is a miss, which fetches and verifies.
const FEATURE_DISABLE_FEED_CACHE_KEY = 'ytkit-feature-disable-feed-v2';
const FEATURE_DISABLE_FEED_LEGACY_CACHE_KEYS = Object.freeze(['ytkit-feature-disable-feed']);
const FEATURE_DISABLE_FEED_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const FEATURE_DISABLE_FEED_STALE_MS = 30 * 24 * 60 * 60 * 1000;
const FEATURE_DISABLE_FEED_TIMEOUT_MS = 10000;

// One in-flight fetch per worker lifetime. Ten tabs opening at once must not
// become ten requests to the same file.
let _featureDisableFeedInflight = null;

function classifyFeatureDisableFeedCache(cachedAt, now) {
    if (!Number.isFinite(cachedAt) || cachedAt <= 0) return 'expired';
    const age = now - cachedAt;
    if (age < 0) return 'expired';
    if (age <= FEATURE_DISABLE_FEED_MAX_AGE_MS) return 'fresh';
    if (age <= FEATURE_DISABLE_FEED_STALE_MS) return 'stale';
    return 'expired';
}

async function readFeatureDisableFeedCache() {
    if (!ext.storage?.local?.get) return null;
    try {
        const stored = await callExtensionApi(ext.storage.local, 'get', FEATURE_DISABLE_FEED_CACHE_KEY);
        const entry = stored?.[FEATURE_DISABLE_FEED_CACHE_KEY];
        if (!entry || typeof entry.text !== 'string') return null;
        return { text: entry.text, cachedAt: Number(entry.cachedAt) || 0 };
    } catch (_) {
        // reason: a corrupt or unreadable cache is a cache miss, never an error
        return null;
    }
}

// Removes cache entries written by builds that did not verify the feed. Best
// effort: failing to clean up costs disk, never correctness, because nothing
// reads the legacy key any more.
async function purgeLegacyFeatureDisableFeedCache() {
    if (!ext.storage?.local?.remove) return;
    try {
        await callExtensionApi(ext.storage.local, 'remove', FEATURE_DISABLE_FEED_LEGACY_CACHE_KEYS.slice());
    } catch (_) {
        // reason: an unreachable storage area is not worth failing a fetch over
    }
}

async function writeFeatureDisableFeedCache(text) {
    if (!ext.storage?.local?.set) return;
    try {
        await callExtensionApi(ext.storage.local, 'set', {
            [FEATURE_DISABLE_FEED_CACHE_KEY]: { text, cachedAt: Date.now() }
        });
    } catch (_) {
        // reason: failing to cache costs a refetch, nothing more
    }
}

function fetchFeatureDisableFeed() {
    if (_featureDisableFeedInflight) return _featureDisableFeedInflight;
    const controller = new AbortController();
    const timer = setTimeout(() => {
        try { controller.abort(); } catch (_) {
            // reason: already aborted
        }
    }, FEATURE_DISABLE_FEED_TIMEOUT_MS);

    // The promise is assigned BEFORE anything clears it. Written as
    // `_featureDisableFeedInflight = (async () => { ... finally { flag = null } })()`
    // the body runs first, so the one path that returns without ever awaiting
    // — the allowlist refusal below — cleared the flag and only then had the
    // resolved promise stored into it. The guard above would hand that
    // already-settled promise to every later caller and the feed would never
    // be fetched again for the worker's lifetime.
    const run = (async () => {
        try {
            if (!isUrlAllowed(FEATURE_DISABLE_FEED_URL)) return null;
            const response = await fetch(FEATURE_DISABLE_FEED_URL, {
                method: 'GET',
                headers: { Accept: 'text/csv,text/plain' },
                credentials: 'omit',
                cache: 'no-store',
                redirect: 'error',
                signal: controller.signal
            });
            if (!response.ok) return null;
            const { text } = await readTextBounded(
                response, MAX_FEATURE_DISABLE_FEED_BYTES, 'Feature disable feed', controller);
            // Verified BEFORE the cache write, so an unsigned or tampered body
            // never becomes the last-known-good copy.
            const signature = await fetchFeedSignature(FEATURE_DISABLE_FEED_URL);
            if (!await verifyFeedSignature(text, signature)) return null;
            await writeFeatureDisableFeedCache(text);
            await purgeLegacyFeatureDisableFeedCache();
            return text;
        } catch (_) {
            // reason: a feed that cannot be fetched is a silent no-op by design
            return null;
        } finally {
            clearTimeout(timer);
        }
    })();
    _featureDisableFeedInflight = run;
    // A .then callback cannot run before the assignment above, whatever the
    // body did.
    const clear = () => { _featureDisableFeedInflight = null; };
    run.then(clear, clear);
    return run;
}

// Reads a response body with the cap enforced AS IT ARRIVES.
//
// The content-length pre-check only helps when the server declares one. A
// chunked response declares nothing, so the old form fell through to
// `response.text()` and buffered the entire body into the service worker
// before measuring it — the cap was a post-mortem, not a limit. EXT_FETCH has
// streamed against an incremental cap since v3.20.4; this is the same shape,
// so the two remaining unbounded callers (the selector asset and the Cobalt
// response) stop being the exception.
//
// `controller` is optional: pass the AbortController driving the fetch and an
// over-limit body tears down the socket instead of being left to drain.
async function readTextBounded(response, maxBytes, label, controller = null) {
    const tooLarge = () => new Error(`${label} exceeds the ${maxBytes}-byte limit`);
    const contentLength = response.headers?.get?.('content-length');
    if (contentLength !== null && contentLength !== undefined) {
        const declared = Number.parseInt(contentLength, 10);
        if (Number.isFinite(declared) && declared > maxBytes) {
            try { controller?.abort?.(); } catch (_) {
                // reason: controller may already be aborted by a timeout
            }
            throw tooLarge();
        }
    }

    const reader = response.body?.getReader?.();
    if (!reader) {
        // No streaming body available (a mocked response, or a browser that
        // does not expose one). Fall back to the old behaviour rather than
        // failing the request outright.
        const text = await response.text();
        const bytes = new TextEncoder().encode(text).byteLength;
        if (bytes > maxBytes) throw tooLarge();
        return { text, bytes };
    }

    const chunks = [];
    let received = 0;
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) {
            try { reader.cancel(); } catch (_) {
                // reason: the stream may already be closed by an abort
            }
            try { controller?.abort?.(); } catch (_) {
                // reason: controller may already be aborted by a timeout
            }
            throw tooLarge();
        }
        chunks.push(value);
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
    return { text: new TextDecoder('utf-8').decode(merged), bytes: received };
}

// The broad optional pattern that makes user-chosen HTTPS origins grantable.
// It is declared only by the github-full build; store-safe strips it, so this
// exact-origin permission door does not exist in store artifacts at all.
const REMOTE_LIST_HOST_PATTERN = globalThis.YTKitCore?.REMOTE_LIST_HOST_PATTERN || 'https://*/*';
const COBALT_PUBLIC_INSTANCE_HOST = globalThis.YTKitCore?.COBALT_PUBLIC_INSTANCE_HOST || 'api.cobalt.tools';

function describeRemoteListUrl(url) {
    const describe = globalThis.YTKitCore?.describeRemoteListUrl;
    if (typeof describe !== 'function') return { ok: false, reason: 'scope-service-unavailable' };
    return describe(url);
}

function describeCobaltInstanceUrl(url) {
    const describe = globalThis.YTKitCore?.describeCobaltInstanceUrl;
    if (typeof describe !== 'function') return { ok: false, reason: 'scope-service-unavailable' };
    return describe(url);
}

function isStaticAllowlistedUrl(url) {
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

// A user-configured filter-list URL is admissible only when the build declares
// the broad optional pattern AND the URL survives the public-host denylist.
// Admissible is not the same as permitted: requireRuntimeOptionalHostGrant
// still demands that the user actually granted this exact origin.
function isRemoteListUrlAdmissible(url) {
    if (!getRuntimeOptionalHostPermissions().includes(REMOTE_LIST_HOST_PATTERN)) return false;
    const described = describeRemoteListUrl(url);
    // The dynamic GET door exists for user-owned data sources, not as an
    // alternate route back to Cobalt's public service. The dedicated Cobalt
    // contract applies the stricter instance validator as well.
    return described.ok === true && described.hostname !== COBALT_PUBLIC_INSTANCE_HOST;
}

function isUrlAllowed(url) {
    return isStaticAllowlistedUrl(url) || isRemoteListUrlAdmissible(url);
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

// Specific declared patterns only; the broad remote-list pattern is handled
// separately below.
//
// Belt-and-braces, not load-bearing today: hostPermissionMatchesUrl cannot
// match `https://*/*` anyway, because its wildcard branch requires a `*.host`
// shape and the literal branch compares hostnames. Removing this filter
// changes no current behaviour and no test — verified by mutation. It stays
// because the day someone teaches that matcher to understand a bare `*`, this
// list would start matching every https URL and youtube.com itself would
// begin demanding a runtime grant.
function getRuntimeOptionalHostPermissionsForUrl(url) {
    return getRuntimeOptionalHostPermissions()
        .filter((pattern) => pattern !== REMOTE_LIST_HOST_PATTERN)
        .filter((pattern) => hostPermissionMatchesUrl(pattern, url));
}

// `https://example.com/*` is not itself declared — the build declares the
// broad `https://*/*` pattern that covers it. Accept a requested origin when
// it is exactly the pattern a permitted filter-list URL would produce, so a
// caller cannot widen the request into `https://*/*` itself.
function isGrantableRemoteListOrigin(origin) {
    if (!getRuntimeOptionalHostPermissions().includes(REMOTE_LIST_HOST_PATTERN)) return false;
    if (typeof origin !== 'string' || !origin.endsWith('/*')) return false;
    const described = describeRemoteListUrl(origin.slice(0, -2) + '/');
    return described.ok === true
        && described.hostname !== COBALT_PUBLIC_INSTANCE_HOST
        && described.originPattern === origin;
}

function validateRuntimeOptionalHostRequest(origins) {
    if (!Array.isArray(origins) || origins.length === 0 || origins.length > 16) {
        throw new Error('Optional host permission request is invalid.');
    }
    const declared = new Set(getRuntimeOptionalHostPermissions());
    const normalized = Array.from(new Set(origins.map((origin) =>
        typeof origin === 'string' ? origin.trim() : '')));
    if (normalized.some((origin) => !origin
        || (!declared.has(origin) && !isGrantableRemoteListOrigin(origin)))) {
        throw new Error('Optional host permission was not declared by this extension build.');
    }
    // The broad pattern is a capability the build declares, never something a
    // page-driven request may ask the user to grant wholesale.
    if (normalized.includes(REMOTE_LIST_HOST_PATTERN)) {
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
    if (origins.length) {
        const granted = await permissionsContainsOrigins(origins);
        if (!granted) {
            throw new Error('Runtime host permission not granted: ' + origins.join(', '));
        }
    }

    // Statically allowlisted origins are governed entirely by the check above.
    // Anything still here reached isUrlAllowed through the remote-list door,
    // so re-derive its scope and require the user's own per-origin grant.
    if (isStaticAllowlistedUrl(url)) return;
    const described = describeRemoteListUrl(url);
    if (!described.ok) {
        throw new Error('Remote list host is not permitted: ' + described.reason);
    }
    const remoteGranted = await permissionsContainsOrigins([described.originPattern]);
    if (!remoteGranted) {
        throw new Error('Runtime host permission not granted: ' + described.originPattern);
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
// the redirect-leak guard — the manual redirect loop re-evaluates them at
// every hop instead of letting fetch() forward them implicitly.
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

const EXT_FETCH_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
// Redirects are refused, not followed, so the only bound that matters is zero.
// Kept as a named constant because the refusal is a deliberate policy rather
// than an oversight, and because the gate in tests/hardening.test.js reads it.
const MAX_EXT_FETCH_REDIRECTS = 0;
const EXT_FETCH_BODY_HEADERS = new Set([
    'content-length', 'content-type', 'transfer-encoding'
]);

function normalizeExtFetchUrl(url) {
    try {
        return new URL(url).toString();
    } catch (_) {
        return '';
    }
}

async function fetchWithValidatedRedirects(url, options) {
    let currentUrl = normalizeExtFetchUrl(url);
    if (!currentUrl || !isUrlAllowed(currentUrl)) {
        throw new Error(`URL not in allowlist: ${url}`);
    }

    const currentMethod = options.method;
    const currentBody = options.body ?? null;
    const baseHeaders = options.headers || {};
    const requestedCredentials = options.credentials;

    {
        const hopHeaders = filterRequestHeaders(baseHeaders, currentUrl);
        if (currentBody === null || currentMethod === 'GET' || currentMethod === 'HEAD') {
            for (const key of Object.keys(hopHeaders)) {
                if (EXT_FETCH_BODY_HEADERS.has(key.toLowerCase())) delete hopHeaders[key];
            }
        }

        const hopOptions = {
            ...options,
            method: currentMethod,
            credentials: requestedCredentials === 'include' && shouldSendCredentials(currentUrl)
                ? 'include'
                : 'omit',
            redirect: 'manual'
        };
        delete hopOptions.headers;
        delete hopOptions.body;
        if (Object.keys(hopHeaders).length > 0) hopOptions.headers = hopHeaders;
        if (currentBody !== null && currentMethod !== 'GET' && currentMethod !== 'HEAD') {
            hopOptions.body = currentBody;
        }

        const response = await fetch(currentUrl, hopOptions);
        const observedUrl = response.url ? normalizeExtFetchUrl(response.url) : '';
        if (observedUrl && observedUrl !== currentUrl) {
            if (!isUrlAllowed(observedUrl)) {
                throw new Error(`Response URL not in allowlist after redirect: ${observedUrl}`);
            }
            throw new Error('Response URL changed before redirect validation.');
        }

        // REDIRECTS ARE REFUSED, DELIBERATELY, AND THIS IS THE ONLY OUTCOME.
        //
        // `redirect: 'manual'` above makes the browser return an opaque-redirect
        // filtered response for ANY 3xx: type 'opaqueredirect', status 0, empty
        // headers. There is no way to read `Location` from it, so a redirect
        // target cannot be checked against the allowlist or re-checked against
        // the user's optional-host grant before the worker would contact it.
        //
        // This used to be followed by a hop-following loop that read
        // response.status and the Location header. That branch could never run
        // in a browser — only under a test mock that returned a plain
        // Response(null, {status: 302, headers: {location}}), which is type
        // 'basic' with readable headers. The code therefore advertised per-hop
        // validation it did not have, while shipping fail-closed behaviour.
        //
        // Fail-closed is the right outcome, so the dead branch is gone rather
        // than the guard. The cost is real and accepted: an allowlisted endpoint
        // that legitimately 3xx-bounces (http→https, trailing-slash
        // normalisation) is refused rather than followed. Fixing that would mean
        // giving up per-hop validation entirely — `redirect: 'follow'` only lets
        // us check the FINAL url, after every intermediate host has already been
        // contacted — which is a worse trade for an SSRF boundary.
        if (response.type === 'opaqueredirect' || EXT_FETCH_REDIRECT_STATUSES.has(response.status)) {
            if (hopOptions.credentials === 'include' || hasSensitiveAuthHeader(hopHeaders)) {
                throw new Error('Blocked redirect on a credentialed request (possible cross-origin credential leak)');
            }
            throw new Error(
                `Blocked redirect from ${currentUrl}: its target cannot be validated before the request is made, `
                + 'so redirects are refused. Point the setting at the final URL instead.'
            );
        }

        return { response, finalUrl: currentUrl };
    }
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

function canonicalYouTubeWatchUrl(sender) {
    const raw = sender?.tab?.url || sender?.url;
    if (typeof raw !== 'string' || !raw) return '';
    try {
        const parsed = new URL(raw);
        const hostname = parsed.hostname.toLowerCase();
        let videoId = '';
        if (hostname === 'youtu.be' || hostname === 'www.youtu.be') {
            videoId = parsed.pathname.split('/').filter(Boolean)[0] || '';
        } else if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) {
            if (parsed.pathname === '/watch') videoId = parsed.searchParams.get('v') || '';
        }
        if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return '';
        return `https://www.youtube.com/watch?v=${videoId}`;
    } catch (_) {
        return '';
    }
}

function cobaltFailure(code, message) {
    return {
        ok: false,
        error: {
            code: String(code || 'COBALT_REQUEST_FAILED').slice(0, 80),
            message: String(message || 'Self-hosted Cobalt request failed.').slice(0, 240)
        }
    };
}

async function performCobaltRequest(sender) {
    const mediaUrl = canonicalYouTubeWatchUrl(sender);
    if (!mediaUrl) {
        return cobaltFailure('COBALT_WATCH_TAB_REQUIRED', 'Open a YouTube watch page before using the Cobalt fallback.');
    }

    const stored = await callExtensionApi(ext.storage.local, 'get', SETTINGS_STORAGE_KEY);
    const settings = stored?.[SETTINGS_STORAGE_KEY];
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        return cobaltFailure('COBALT_SETTINGS_UNAVAILABLE', 'Cobalt settings are unavailable.');
    }
    const policy = globalThis.YTKitCore?.createPolicyProfile?.();
    const effectiveProfile = policy?.resolveEffectiveProfile?.(settings)
        || (settings.githubFullProfile === true || settings.safeStoreProfile === false
            ? 'github-full' : 'store-safe');
    if (effectiveProfile !== 'github-full' || settings.downloadCobaltFallback !== true) {
        return cobaltFailure('COBALT_FEATURE_DISABLED', 'Enable the self-hosted Cobalt fallback in the GitHub/full profile first.');
    }

    const instance = describeCobaltInstanceUrl(settings.downloadCobaltInstance);
    if (!instance.ok) {
        return cobaltFailure('COBALT_INSTANCE_REQUIRED', 'Configure a self-hosted Cobalt HTTPS origin first.');
    }
    if (!getRuntimeOptionalHostPermissions().includes(REMOTE_LIST_HOST_PATTERN)) {
        return cobaltFailure('COBALT_PROFILE_UNAVAILABLE', 'This build does not support user-supplied Cobalt hosts.');
    }
    const granted = await permissionsContainsOrigins([instance.originPattern]);
    if (!granted) {
        return cobaltFailure('COBALT_PERMISSION_REQUIRED', 'Grant site access to the configured Cobalt host, then retry.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), COBALT_REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(instance.url, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: mediaUrl }),
            credentials: 'omit',
            redirect: 'error',
            signal: controller.signal
        });
        if (!response.ok) {
            return cobaltFailure('COBALT_HTTP_ERROR', `Self-hosted Cobalt returned HTTP ${response.status}.`);
        }
        const { text } = await readTextBounded(
            response, MAX_COBALT_RESPONSE_BYTES, 'Cobalt response', controller);
        let data;
        try {
            data = JSON.parse(text);
        } catch (_) {
            return cobaltFailure('COBALT_INVALID_RESPONSE', 'Self-hosted Cobalt returned invalid JSON.');
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)
            || !['redirect', 'tunnel', 'picker', 'local-processing', 'error'].includes(data.status)) {
            return cobaltFailure('COBALT_INVALID_RESPONSE', 'Self-hosted Cobalt returned an unsupported response.');
        }
        return { ok: true, data };
    } catch (error) {
        if (error?.name === 'AbortError') {
            return cobaltFailure('COBALT_TIMEOUT', 'Self-hosted Cobalt timed out.');
        }
        if (/Cobalt response exceeds the \d+-byte limit/.test(error?.message || '')) {
            return cobaltFailure('COBALT_RESPONSE_TOO_LARGE', 'Self-hosted Cobalt returned too much data.');
        }
        return cobaltFailure('COBALT_REQUEST_FAILED', 'Could not reach the self-hosted Cobalt instance.');
    } finally {
        clearTimeout(timer);
    }
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

    // Content runtimes publish this non-sensitive health bit on the shared
    // document root. Browser smokes and support diagnostics can then prove
    // that Firefox loaded the declared ruleset without reaching through the
    // browser's protected moz-extension:// automation boundary.
    if (msg.type === 'YTKIT_ZERO_AD_STATUS') {
        getZeroAdStatus().then(sendResponse).catch((error) => {
            sendResponse({
                ok: false,
                rulesetId: ZERO_AD_RULESET_ID,
                enabled: false,
                enabledRulesets: [],
                paused: false,
                pauseUntil: null,
                error: error?.message || 'Zero-ad ruleset status is unavailable.'
            });
        });
        return true;
    }

    if (msg.type === 'YTKIT_ZERO_AD_PAUSE_SESSION'
        || msg.type === 'YTKIT_ZERO_AD_RESUME_SESSION') {
        const operation = msg.type === 'YTKIT_ZERO_AD_PAUSE_SESSION'
            ? pauseZeroAdRulesForSession
            : resumeZeroAdRulesForSession;
        operation().then(sendResponse).catch((error) => {
            sendResponse({
                ok: false,
                rulesetId: ZERO_AD_RULESET_ID,
                error: error?.message || 'Zero-ad recovery is unavailable.'
            });
        });
        return true;
    }

    if (msg.type === 'YTKIT_SYNC_STATUS' || msg.type === 'YTKIT_SYNC_UNDO') {
        (async () => {
            if (!_settingsSync) {
                sendResponse({
                    ok: false,
                    available: false,
                    error: { code: 'SYNC_SERVICE_UNAVAILABLE', message: 'Settings sync is unavailable.' }
                });
                return;
            }
            const result = msg.type === 'YTKIT_SYNC_STATUS'
                ? await _settingsSync.getStatus()
                : await _settingsSync.undo();
            sendResponse(result);
        })().catch((error) => {
            sendResponse({
                ok: false,
                error: {
                    code: error?.code || 'SYNC_OPERATION_FAILED',
                    message: error?.message || 'Settings sync operation failed.'
                }
            });
        });
        return true;
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
            const release = acquireAiRequestSlot(sender);
            try {
                sendResponse(await performAiSummaryRequest(msg));
            } finally {
                release();
            }
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

    if (msg.type === 'YTKIT_COBALT_REQUEST') {
        performCobaltRequest(sender).then(sendResponse).catch(() => {
            sendResponse(cobaltFailure('COBALT_REQUEST_FAILED', 'Self-hosted Cobalt request failed.'));
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

    if (msg.type === 'YTKIT_FETCH_SELECTOR_ASSET') {
        // This is deliberately a separate message instead of a caller-owned
        // EXT_FETCH URL. It prevents a compromised page or feature from
        // turning selector refresh into an arbitrary remote data fetch.
        if (!isUrlAllowed(SELECTOR_ASSET_URL)) {
            sendResponse({ ok: false, error: 'Selector asset origin is not allowlisted.' });
            return false;
        }
        // The controller exists so an over-limit body can abort the request
        // rather than being left to drain into a worker that already gave up
        // on it.
        const selectorAssetController = new AbortController();
        fetch(SELECTOR_ASSET_URL, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'error',
            signal: selectorAssetController.signal
        }).then(async (response) => {
            if (!response.ok) throw new Error(`Selector asset HTTP ${response.status}`);
            const { text, bytes } = await readTextBounded(
                response, MAX_SELECTOR_ASSET_BYTES, 'Selector asset', selectorAssetController);
            // The asset's own `sha256:` digest travels inside the asset, so it
            // cannot detect substitution. The detached signature can.
            const signature = await fetchFeedSignature(SELECTOR_ASSET_URL);
            if (!await verifyFeedSignature(text, signature)) {
                throw new Error('Selector asset signature could not be verified.');
            }
            sendResponse({
                ok: true,
                text,
                bytes,
                url: SELECTOR_ASSET_URL,
                fetchedAt: Date.now(),
                etag: response.headers?.get?.('etag') || null
            });
        }).catch((error) => {
            sendResponse({ ok: false, error: error?.message || 'Selector asset fetch failed.' });
        });
        return true;
    }

    if (msg.type === 'YTKIT_FETCH_FEATURE_DISABLE_FEED') {
        // Answers from cache whenever the cache is usable, so the common case
        // costs no network at all. A stale-but-usable cache is returned
        // immediately and refreshed behind the response; the caller never
        // waits on the network for a list it already has.
        (async () => {
            const cached = await readFeatureDisableFeedCache();
            const freshness = cached
                ? classifyFeatureDisableFeedCache(cached.cachedAt, Date.now())
                : 'expired';

            if (freshness === 'fresh') {
                sendResponse({ ok: true, text: cached.text, cachedAt: cached.cachedAt, source: 'cache' });
                return;
            }
            if (freshness === 'stale') {
                sendResponse({ ok: true, text: cached.text, cachedAt: cached.cachedAt, source: 'stale' });
                void fetchFeatureDisableFeed();
                return;
            }
            const text = await fetchFeatureDisableFeed();
            if (typeof text === 'string') {
                sendResponse({ ok: true, text, cachedAt: Date.now(), source: 'network' });
                return;
            }
            // No usable cache and no network. The feed contributing nothing is
            // the designed failure: features keep running exactly as the user
            // configured them.
            sendResponse({ ok: false, text: '', source: 'unavailable' });
        })();
        return true;
    }

    if (msg.type === 'EXT_FETCH') {
        const details = msg?.details;
        if (!details || typeof details !== 'object') {
            sendResponse({ error: 'Missing fetch details.' });
            return false;
        }

        const { method, url, headers, data, timeout, credentials, maxResponseBytes } = details;
        if (typeof url !== 'string' || !url) {
            sendResponse({ error: 'Invalid fetch URL.' });
            return false;
        }

        if (!isUrlAllowed(url)) {
            sendResponse({ error: `URL not in allowlist: ${url}` });
            return false;
        }

        // The broad github-full optional permission exists for anonymous,
        // data-only filter-list GETs. It must never turn EXT_FETCH into a
        // general-purpose POST proxy after one site grant. Self-hosted Cobalt
        // uses the dedicated YTKIT_COBALT_REQUEST contract above, which owns
        // its request shape and reads the destination from validated settings.
        if (!isStaticAllowlistedUrl(url)) {
            const dynamicMethod = String(method || 'GET').toUpperCase();
            if (dynamicMethod !== 'GET' && dynamicMethod !== 'HEAD') {
                sendResponse({ error: 'User-granted HTTPS hosts only support anonymous GET/HEAD through EXT_FETCH.' });
                return false;
            }
            if (data !== null && data !== undefined) {
                sendResponse({ error: 'User-granted HTTPS hosts do not accept request bodies through EXT_FETCH.' });
                return false;
            }
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
            const requestedResponseBytes = Number(maxResponseBytes);
            const responseByteLimit = Number.isFinite(requestedResponseBytes) && requestedResponseBytes > 0
                ? Math.max(1024, Math.min(Math.floor(requestedResponseBytes), MAX_RESPONSE_BYTES))
                : MAX_RESPONSE_BYTES;
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

            if (requestBody !== null) {
                fetchOpts.body = requestBody;
            }

            fetchWithValidatedRedirects(url, fetchOpts).then(async ({ response: resp, finalUrl }) => {
            // NOTE: the clampedTimeout deadline intentionally spans the entire
            // connect + headers + body-drain lifecycle. We do NOT clear the
            // timer here on headers arrival — a slowloris upstream that trickles
            // bytes under MAX_RESPONSE_BYTES must still hit the deadline, whose
            // controller.abort() tears down an in-progress reader.read() and
            // whose callback returns {timeout:true} to the caller. The timer is
            // cleared only on terminal paths below (success / early returns /
            // catch).
            if (responded) return;

            const contentLengthHeader = resp.headers.get('content-length');
            if (contentLengthHeader !== null) {
                const contentLength = parseInt(contentLengthHeader, 10);
                if (Number.isFinite(contentLength) && contentLength > responseByteLimit) {
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
                        if (received > responseByteLimit) {
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
                    if (measuredBytes > responseByteLimit) {
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
                finalUrl
            });
        }).catch((err) => {
            if (timer) clearTimeout(timer);
            if (responded) return;
            responded = true;
            try { controller.abort(); } catch (_) {
                // reason: controller may already be aborted
            }
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
        // The former caller-selected cookie query was too broad to defend:
        // any extension content runtime could request raw YouTube-family
        // cookies. Keep a deterministic rejection for old content bundles.
        sendResponse({
            cookies: null,
            error: {
                code: 'COOKIE_BRIDGE_RETIRED',
                message: 'Generic cookie access is unavailable.'
            }
        });
        return false;
    }

    if (msg.type === 'YTKIT_COOKIE_HANDOFF') {
        const consumed = consumeCookieHandoffCapability(
            msg.capability,
            msg.protocolVersion,
            sender
        );
        if (!consumed.ok) {
            sendResponse(cookieHandoffFailure(consumed.code));
            return false;
        }
        if (!COOKIE_HANDOFF?.sanitizeCookieHandoff || !ext.cookies?.getAll) {
            sendResponse(cookieHandoffFailure('COOKIE_API_UNAVAILABLE'));
            return false;
        }

        const query = { domain: COOKIE_HANDOFF.QUERY_DOMAIN };
        if (consumed.binding.cookieStoreId) query.storeId = consumed.binding.cookieStoreId;
        callExtensionApi(ext.cookies, 'getAll', query).then((rawCookies) => {
            const handoff = COOKIE_HANDOFF.sanitizeCookieHandoff(rawCookies);
            sendResponse({
                ok: true,
                cookies: handoff.cookies.map(c => ({
                    domain: c.domain,
                    name: c.name,
                    value: c.value,
                    path: c.path,
                    secure: c.secure,
                    httpOnly: c.httpOnly,
                    expirationDate: normalizeCookieExpiry(c.expirationDate)
                })),
                diagnostics: handoff.diagnostics,
                error: null
            });
        }).catch(() => {
            // Cookie API errors can contain browser/profile details. Keep the
            // content response stable and redacted.
            sendResponse(cookieHandoffFailure('COOKIE_READ_FAILED'));
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
                // Only for the cookie purpose. A plain token request keeps the
                // old message shape, so a companion that does not know about
                // challenges is not sent one.
                const endpointChallenge = msg.purpose === COOKIE_HANDOFF_PURPOSE
                    ? randomEndpointChallenge()
                    : '';
                const port = ext.runtime.connectNative('com.astra.deck.downloader');
                const timeout = setTimeout(() => {
                    try { port.disconnect(); } catch (_) { /* reason: already disconnected */ }
                    respond({ token: null, error: 'Native messaging timeout' });
                }, 5000);
                port.onMessage.addListener((response) => {
                    clearTimeout(timeout);
                    try { port.disconnect(); } catch (_) { /* reason: already disconnected */ }
                    const token = typeof response?.token === 'string'
                        && response.token.length > 0
                        && response.token.length <= 512
                        && !/[\u0000-\u001f\u007f]/.test(response.token)
                        ? response.token
                        : null;
                    if (response?.ok && token) {
                        const service = response.service === COOKIE_HANDOFF_SERVICE
                            ? COOKIE_HANDOFF_SERVICE
                            : null;
                        const api = Number.isInteger(response.api) ? response.api : null;
                        const minimumApi = Number.isInteger(COOKIE_HANDOFF?.MINIMUM_COMPANION_API)
                            ? COOKIE_HANDOFF.MINIMUM_COMPANION_API
                            : Number.POSITIVE_INFINITY;
                        const cookieCapability = msg.purpose === COOKIE_HANDOFF_PURPOSE
                            && service === COOKIE_HANDOFF_SERVICE
                            && api >= minimumApi
                            ? issueCookieHandoffCapability(sender)
                            : null;
                        const proofPattern = COOKIE_HANDOFF?.ENDPOINT_PROOF?.proofPattern;
                        const endpointProof = endpointChallenge
                            && typeof response?.challengeProof === 'string'
                            && proofPattern?.test(response.challengeProof)
                            ? response.challengeProof
                            : null;
                        respond({
                            token,
                            service,
                            api,
                            cookieCapability,
                            endpointChallenge: endpointProof ? endpointChallenge : '',
                            endpointProof,
                            error: null
                        });
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
                port.postMessage(endpointChallenge
                    ? { type: 'get-token', challenge: endpointChallenge }
                    : { type: 'get-token' });
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
