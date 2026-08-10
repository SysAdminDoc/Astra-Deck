(() => {
    'use strict';

    // extension/core/capability-probe.js
    //
    // v4.47.0 NF10 — runtime capability detection. Pairs with the
    // optional `requires:` field on settings-schema entries (NF17).
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

    // Probe table — keys MUST match the CAPABILITIES enum exported
    // by settings-schema.js. The hardening test pins that.
    const PROBES = Object.freeze({
        summarizerApi:    { async: false, run: hasSummarizerApi },
        documentPip:      { async: false, run: hasDocumentPip },
        languageDetector: { async: false, run: hasLanguageDetector },
        promptApi:        { async: false, run: hasPromptApi },
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
        probe,
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
