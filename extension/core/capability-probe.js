(() => {
    'use strict';

    // extension/core/capability-probe.js
    //
    // v4.47.0 NF10 — runtime capability detection. Pairs with the
    // optional `requires:` field on settings-schema entries (NF17).
    // Follow-up — the capability matrix below is the executable contract for
    // every probe: where the affordance exists, what permission it needs, and
    // what the feature promises when it is absent. Keep it in this module so
    // the MV3 pages and the userscript share one source of truth.
    //
    // For every well-known capability name in
    // settings-schema.CAPABILITIES, this module exposes a probe that
    // returns a boolean. Probes are intentionally synchronous + cheap
    // where possible (window-API existence checks); the companion-port
    // probe (mediaDL) is async because it makes an HTTP request, and
    // the ollama probe is async for the same reason. Callers can
    // await `runAll()` once at popup boot and cache the result.
    //
    // None of the probes mutate global state. None of them attempt to
    // INVOKE the API — they only confirm whether it is reachable.
    // That keeps the probe surface store-policy-safe: a passive
    // capability check doesn't constitute "using" the API.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.capabilityProbe) return;

    let companionPorts = core.companionPorts || null;
    if (!companionPorts && typeof module !== 'undefined' && module.exports
        && typeof require === 'function') {
        try {
            companionPorts = require('./companion-ports');
        } catch (_) {
            // reason: direct Node consumers may omit the manifest bootstrap.
        }
    }

    // The Astra Downloader companion uses the declared fallback ports; we only
    // need to know whether ANY of them responds. The probe stops on
    // the first success.
    const MEDIA_DL_PORTS = Object.freeze(
        Array.isArray(companionPorts?.ports) ? companionPorts.ports.slice() : []
    );
    const OLLAMA_PORT = 11434;
    // Strict timeout so a hung probe never blocks the popup boot.
    const PROBE_TIMEOUT_MS = 1500;

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        for (const child of Object.values(value)) deepFreeze(child);
        return Object.freeze(value);
    }

    // Browser capability matrix and fallback contract. The browser labels are
    // deliberately descriptive instead of promises of availability: built-in
    // AI APIs can be absent behind rollout, model, device, policy, or flag
    // gates even on a browser version that exposes the global.
    const CAPABILITY_MATRIX = deepFreeze({
        schemaVersion: 1,
        browsers: {
            chromium: {
                // i18n-static: capability-matrix contract label
                label: 'Chrome / Edge / Brave',
                vehicle: 'MV3 extension or userscript',
                baseline: 'Chrome 120+ / equivalent Chromium release',
                note: 'Optional built-in AI APIs remain conditional on browser rollout, model readiness, device policy, and flags.'
            },
            firefox: {
                // i18n-static: capability-matrix contract label
                label: 'Firefox 142+',
                vehicle: 'MV3 extension',
                baseline: 'Firefox 142+',
                note: 'A standards-compatible fallback is required for every optional Chromium API in this matrix.'
            },
            userscript: {
                // i18n-static: capability-matrix contract label
                label: 'Tampermonkey / Violentmonkey',
                vehicle: 'Userscript on a supported desktop browser',
                baseline: 'The host browser decides which web APIs are exposed',
                note: 'Extension-only permissions and companion routing are unavailable unless the host exposes an equivalent bridge.'
            }
        },
        aiLanes: {
            summary: {
                localCapability: 'summarizerApi',
                fallbackLane: 'byo-key',
                localDataPolicy: 'No host permission or provider credential is used when the browser lane is active.'
            },
            transcriptTranslation: {
                localCapability: 'translatorApi',
                fallbackLane: 'byo-key',
                localDataPolicy: 'Transcript text stays on-device when the browser lane is active; the fallback is explicit.'
            }
        },
        capabilities: {
            summarizerApi: {
                api: 'Built-in Summarizer API (global Summarizer or ai.summarizer)',
                availability: {
                    chromium: 'Chrome 138+ when the on-device model is exposed and ready',
                    firefox: 'Unavailable; use the remote/BYO summary path',
                    userscript: 'Available only when the host browser exposes the same web API'
                },
                requiredPermission: [],
                executionWorld: 'YouTube page MAIN world',
                minimumBrowser: { chrome: '138+', edge: 'Chromium-equivalent; rollout-dependent', firefox: 'Not exposed' },
                probe: 'hasSummarizerApi',
                fallback: 'Use the configured BYO-key summary lane only after telling the user that the on-device lane is unavailable.',
                userVisibleDegradation: 'Local Summary explains the fallback and the BYO-key provider handles the request if configured.'
            },
            translatorApi: {
                api: 'Built-in Translator API (global Translator or ai.translator)',
                availability: {
                    chromium: 'Chrome 138+ on desktop when the requested language pack is exposed and ready',
                    firefox: 'Unavailable; use the explicit BYO-key translation fallback',
                    userscript: 'Available only when the host browser exposes the same web API'
                },
                requiredPermission: [],
                executionWorld: 'YouTube page MAIN world',
                minimumBrowser: { chrome: '138+', edge: 'Chromium-equivalent; rollout-dependent', firefox: 'Not exposed' },
                probe: 'hasTranslatorApi',
                fallback: 'Translate through the configured BYO-key provider only after an explicit notice; preserve the original transcript if it fails.',
                userVisibleDegradation: 'The transcript labels whether translation used the local browser model or the BYO-key fallback.'
            },
            mediaDL: {
                api: 'Astra Downloader companion /health endpoint',
                availability: {
                    chromium: 'Available when the companion is running and its loopback origin is reachable',
                    firefox: 'Available under the same companion and optional-host-permission contract',
                    userscript: 'Unavailable without an extension bridge; use Cobalt or transcript-only paths'
                },
                requiredPermission: ['loopback host permission', 'nativeMessaging for auto-start/update paths'],
                executionWorld: 'Extension popup/background or userscript bridge',
                minimumBrowser: { chrome: 'MV3 extension support', edge: 'MV3 extension support', firefox: '142+' },
                probe: 'hasMediaDL',
                fallback: 'Use the Cobalt download path when configured; otherwise hide companion-only download history and health controls.',
                userVisibleDegradation: 'Companion-backed controls show unavailable and downloads retain any explicitly configured fallback.'
            },
            ollama: {
                api: 'Ollama HTTP API at 127.0.0.1:11434',
                availability: {
                    chromium: 'Available when Ollama is running and the extension profile grants loopback access',
                    firefox: 'Available when Ollama is running and the extension profile grants loopback access',
                    userscript: 'Available only if the userscript manager permits the loopback request'
                },
                requiredPermission: ['http://127.0.0.1:11434/*'],
                executionWorld: 'Extension background proxy or userscript request bridge',
                minimumBrowser: { chrome: 'MV3 host permission support', edge: 'MV3 host permission support', firefox: '142+' },
                probe: 'hasOllama',
                fallback: 'Fall back to the selected remote/BYO provider; never silently change a local request into a remote request.',
                userVisibleDegradation: 'Ollama is listed as unavailable while other configured AI providers remain usable.'
            },
            documentPip: {
                api: 'Document Picture-in-Picture API',
                availability: {
                    chromium: 'Chrome 116+ and equivalent Chromium releases when exposed',
                    firefox: 'Firefox 151+; project Firefox baseline uses standard video PiP before then',
                    userscript: 'Available when the host page exposes documentPictureInPicture'
                },
                requiredPermission: [],
                executionWorld: 'YouTube page MAIN world',
                minimumBrowser: { chrome: '116+', edge: 'Chromium-equivalent', firefox: '151+' },
                probe: 'hasDocumentPip',
                fallback: 'Use HTMLVideoElement.requestPictureInPicture() with the browser-native player window.',
                userVisibleDegradation: 'Pop-out controls use standard video PiP instead of the richer custom PiP window.'
            },
            languageDetector: {
                api: 'Built-in Language Detector API',
                availability: {
                    chromium: 'Chrome 138+ when the on-device model is exposed and ready',
                    firefox: 'Unavailable; use conservative text comparison',
                    userscript: 'Available only when the host browser exposes the same web API'
                },
                requiredPermission: [],
                executionWorld: 'YouTube page MAIN world',
                minimumBrowser: { chrome: '138+', edge: 'Chromium-equivalent; rollout-dependent', firefox: 'Not exposed' },
                probe: 'hasLanguageDetector',
                fallback: 'Compare normalized source and translated text without attempting an API call.',
                userVisibleDegradation: 'Automatic-translation filtering becomes conservative and may leave some translated labels visible.'
            },
            promptApi: {
                api: 'Built-in Prompt API (global LanguageModel or ai.languageModel)',
                availability: {
                    chromium: 'Chrome 138+ when Gemini Nano and the Prompt API are enabled and ready',
                    firefox: 'Unavailable; no remote fallback is implied for transcript Q&A',
                    userscript: 'Not part of the userscript vehicle; extension-only feature remains unavailable'
                },
                requiredPermission: [],
                executionWorld: 'YouTube page MAIN world',
                minimumBrowser: { chrome: '138+', edge: 'Chromium-equivalent; rollout-dependent', firefox: 'Not exposed' },
                probe: 'hasPromptApi',
                fallback: 'Keep transcript export and local search available; do not send transcript text to a remote model implicitly.',
                userVisibleDegradation: 'On-device transcript Q&A is unavailable while transcript viewing and export continue to work.'
            },
            regexpEscape: {
                api: 'ECMAScript RegExp.escape() static method',
                availability: {
                    chromium: 'Modern Chromium releases expose the Baseline 2025 method; older versions use the project fallback',
                    firefox: 'Modern Firefox releases expose the Baseline 2025 method; older versions use the project fallback',
                    userscript: 'Available when the host browser exposes RegExp.escape(); the bundled fallback remains active otherwise'
                },
                requiredPermission: [],
                executionWorld: 'YouTube page and extension UI',
                minimumBrowser: { chrome: 'feature-detected', edge: 'feature-detected', firefox: 'feature-detected' },
                probe: 'hasRegExpEscape',
                fallback: 'Escape literal filter text with the project-maintained compatibility implementation.',
                userVisibleDegradation: 'Literal filters remain literal on older browsers; no setting search text is interpreted as regex syntax.'
            }
        }
    });

    function hasSummarizerApi() {
        // Match the shapes the FEATURES actually detect. Chrome stable ships a
        // global Summarizer; the retired origin-trial shape was a lowercase
        // ai.summarizer. The probe previously required ai.Summarizer, which is
        // neither, so it could never agree with the code it gates and both
        // summarizer-backed features rendered a permanent "unavailable" chip on
        // browsers where they worked.
        if (typeof globalThis === 'undefined') return false;
        return typeof globalThis.Summarizer !== 'undefined'
            || typeof globalThis.ai?.summarizer !== 'undefined';
    }

    function hasTranslatorApi() {
        if (typeof globalThis === 'undefined') return false;
        return typeof globalThis.Translator !== 'undefined'
            || typeof globalThis.ai?.translator !== 'undefined';
    }

    // Detect whether we're in an extension popup/sidepanel context where
    // the meta CSP blocks direct loopback fetches (connect-src 'self' does
    // not cover 127.0.0.1). In that case, route through the background
    // service worker via chrome.runtime.sendMessage.
    function isExtensionPopupContext() {
        try {
            return typeof chrome !== 'undefined'
                && chrome?.runtime?.sendMessage
                && typeof document !== 'undefined'
                && /^chrome-extension:|^moz-extension:/.test(document.location?.protocol || '');
        } catch (_) { return false; }
    }

    function fetchViaBackground(url, ms) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve(false), ms);
            try {
                chrome.runtime.sendMessage({
                    type: 'EXT_FETCH',
                    details: { method: 'GET', url, timeout: ms }
                }, (resp) => {
                    clearTimeout(timer);
                    if (chrome.runtime.lastError) { resolve(false); return; }
                    // A response is not a healthy response: an unrelated server
                    // squatting the port answers 404/500 and used to count as
                    // "companion available", which is the same false positive a
                    // legacy server on 9751 caused in the field.
                    const status = Number(resp && resp.status);
                    const ok = Boolean(resp)
                        && !resp.error
                        && !resp.timeout
                        && (!Number.isFinite(status) || (status >= 200 && status < 300));
                    resolve(ok ? { ok: true, body: typeof resp.responseText === 'string' ? resp.responseText : '' } : false);
                });
            } catch (_) {
                clearTimeout(timer);
                resolve(false);
            }
        });
    }

    function fetchWithTimeout(url, ms) {
        // In extension popup/sidepanel, direct fetch to 127.0.0.1 is
        // blocked by the meta CSP. Route through the background SW.
        if (isExtensionPopupContext()) return fetchViaBackground(url, ms);
        return new Promise((resolve) => {
            const ctrl = new AbortController();
            const timer = setTimeout(() => {
                try { ctrl.abort(); }
                catch (_) { /* reason: controller may already be torn down */ }
            }, ms);
            fetch(url, { signal: ctrl.signal, cache: 'no-store' })
                .then((res) => {
                    if (!res || !res.ok) { clearTimeout(timer); resolve(false); return; }
                    return res.text().then((body) => {
                        clearTimeout(timer);
                        resolve({ ok: true, body: typeof body === 'string' ? body : '' });
                    });
                })
                .catch(() => {
                    clearTimeout(timer);
                    resolve(false);
                });
        });
    }

    // A /health response only proves SOMETHING answered. Astra Downloader
    // identifies itself in the payload, and a co-installed legacy server on the
    // same port has already been mistaken for it in the field, so require the
    // identity before reporting the capability as available.
    function looksLikeAstraCompanion(body) {
        if (typeof body !== 'string' || !body) return false;
        let payload;
        try { payload = JSON.parse(body); } catch (_) { return false; }
        if (!payload || typeof payload !== 'object') return false;
        return typeof payload.ytDlp !== 'undefined'
            || typeof payload.appVersion !== 'undefined'
            || typeof payload.app === 'string'
            || typeof payload.astra !== 'undefined';
    }

    async function hasMediaDL() {
        // Astra Downloader exposes /health on each fallback port.
        // Probe in declared order; first identified companion wins.
        for (const port of MEDIA_DL_PORTS) {
            const host = companionPorts?.host || '127.0.0.1';
            const result = await fetchWithTimeout(`http://${host}:${port}/health`, PROBE_TIMEOUT_MS);
            if (result && result.ok && looksLikeAstraCompanion(result.body)) return true;
        }
        return false;
    }

    async function hasOllama() {
        // Ollama exposes /api/version on its default port. /api/tags
        // would also work but version is the smaller payload.
        const result = await fetchWithTimeout(`http://127.0.0.1:${OLLAMA_PORT}/api/version`, PROBE_TIMEOUT_MS);
        if (!result || !result.ok) return false;
        // /api/version answers {"version":"..."} — anything else on this port
        // is not Ollama.
        try {
            const payload = JSON.parse(result.body);
            return !!payload && typeof payload.version === 'string';
        } catch (_) {
            return false;
        }
    }

    function hasDocumentPip() {
        return Boolean(
            typeof globalThis !== 'undefined'
            && globalThis.documentPictureInPicture
        );
    }

    function hasLanguageDetector() {
        return Boolean(
            typeof globalThis !== 'undefined'
            && ((globalThis.LanguageDetector) ||
                (globalThis.ai && typeof globalThis.ai.languageDetector === 'object'))
        );
    }

    function hasPromptApi() {
        return Boolean(
            typeof globalThis !== 'undefined'
            && ((globalThis.LanguageModel) ||
                (globalThis.ai && typeof globalThis.ai.languageModel !== 'undefined'))
        );
    }

    function hasRegExpEscape() {
        return typeof globalThis?.RegExp?.escape === 'function';
    }

    function getAiLaneStatus(options = {}) {
        const localAi = core.localAi;
        if (localAi?.getLaneStatus) return localAi.getLaneStatus(options);
        const summaryLocal = hasSummarizerApi();
        const translationLocal = hasTranslatorApi();
        const promptLocal = hasPromptApi();
        return Object.freeze({
            summary: Object.freeze({
                capability: 'summarizerApi',
                localAvailable: summaryLocal,
                activeLane: summaryLocal ? 'local' : (options.summaryFallback || 'byo-key'),
                fallbackLane: options.summaryFallback || 'byo-key'
            }),
            transcriptTranslation: Object.freeze({
                capability: 'translatorApi',
                localAvailable: translationLocal,
                activeLane: translationLocal ? 'local' : (options.translationFallback || 'byo-key'),
                fallbackLane: options.translationFallback || 'byo-key'
            }),
            transcriptQa: Object.freeze({
                capability: 'promptApi',
                localAvailable: promptLocal,
                activeLane: promptLocal ? 'local' : (options.promptFallback || 'transcript-export'),
                fallbackLane: options.promptFallback || 'transcript-export'
            })
        });
    }

    async function resolveAiLaneStatus(options = {}) {
        if (core.localAi?.resolveLaneStatus) return core.localAi.resolveLaneStatus(options);
        return getAiLaneStatus(options);
    }

    // Probe table — keys MUST match the CAPABILITIES enum exported
    // by settings-schema.js. The hardening test pins that.
    const PROBES = Object.freeze({
        summarizerApi:    { async: false, run: hasSummarizerApi },
        translatorApi:    { async: false, run: hasTranslatorApi },
        documentPip:      { async: false, run: hasDocumentPip },
        languageDetector: { async: false, run: hasLanguageDetector },
        promptApi:        { async: false, run: hasPromptApi },
        regexpEscape:     { async: false, run: hasRegExpEscape },
        mediaDL:          { async: true,  run: hasMediaDL },
        ollama:           { async: true,  run: hasOllama },
    });

    // Always returns Promise<boolean>. Async probes (mediaDL, ollama) resolve
    // a real boolean rather than handing back a raw fetch promise — a bare
    // Promise is always truthy, so `if (await probe('mediaDL'))` is required to
    // read the actual capability. Sync probes are wrapped for a uniform
    // await-me contract; unknown names resolve false.
    async function probe(name) {
        const entry = PROBES[name];
        if (!entry) {
            // Unknown capability — be defensive, return false rather
            // than throw, so a stale UI element doesn't crash the
            // popup on an unknown name.
            return false;
        }
        try {
            return Boolean(entry.async ? await entry.run() : entry.run());
        } catch (_) {
            // reason: probe should never crash the caller; treat any
            // error as "capability not available".
            return false;
        }
    }

    async function runAll() {
        // Returns { capabilityName: boolean } for every known
        // capability. Async probes run in parallel.
        const names = Object.keys(PROBES);
        const results = await Promise.all(names.map(async (name) => {
            try {
                const value = PROBES[name].async ? await PROBES[name].run() : PROBES[name].run();
                return [name, Boolean(value)];
            } catch (_) {
                // reason: probe should never crash the caller; treat
                // any error as "capability not available".
                return [name, false];
            }
        }));
        const out = {};
        for (const [name, value] of results) out[name] = value;
        return Object.freeze(out);
    }

    // Convenience: take a settings-schema entry and the resolved
    // capability map, return true iff every required capability is
    // available. Entries with no `requires:` always return true.
    function isEntryAvailable(entry, capabilityMap) {
        if (!entry || !Array.isArray(entry.requires) || entry.requires.length === 0) return true;
        if (!capabilityMap) return true;
        return entry.requires.every((cap) => capabilityMap[cap] === true);
    }

    const surface = Object.freeze({
        PROBES,
        CAPABILITY_MATRIX,
        getAiLaneStatus,
        probe,
        resolveAiLaneStatus,
        runAll,
        isEntryAvailable,
        // Exposed for tests that need to monkey-patch a probe.
        _MEDIA_DL_PORTS: MEDIA_DL_PORTS,
        _OLLAMA_PORT: OLLAMA_PORT,
    });

    core.capabilityProbe = surface;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = surface;
    }
})();
