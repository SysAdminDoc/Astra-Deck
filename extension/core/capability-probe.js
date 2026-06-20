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

    // The Astra Downloader companion uses six fallback ports; we only
    // need to know whether ANY of them responds. The probe stops on
    // the first success.
    const MEDIA_DL_PORTS = Object.freeze([9751, 9761, 9771, 9781, 9791, 9851]);
    const OLLAMA_PORT = 11434;
    // Strict timeout so a hung probe never blocks the popup boot.
    const PROBE_TIMEOUT_MS = 1500;

    function hasSummarizerApi() {
        // Chrome 138+ origin-trial built-in summarizer. The API surface
        // is `window.ai.Summarizer` (Capability detection via
        // `availability()` would be more rigorous but requires an
        // async call; existence of the constructor is sufficient for
        // the popup chip rendering, which is the only consumer today).
        return Boolean(
            typeof globalThis !== 'undefined'
            && globalThis.ai
            && typeof globalThis.ai.Summarizer === 'function'
        );
    }

    function fetchWithTimeout(url, ms) {
        // AbortController-bounded fetch so a hung server doesn't pin
        // the probe forever. Rejects with AbortError on timeout, which
        // the caller treats as "not available".
        return new Promise((resolve) => {
            const ctrl = new AbortController();
            const timer = setTimeout(() => {
                try { ctrl.abort(); }
                catch (_) { /* reason: controller may already be torn down */ }
            }, ms);
            fetch(url, { signal: ctrl.signal, cache: 'no-store' })
                .then((res) => {
                    clearTimeout(timer);
                    resolve(Boolean(res && res.ok));
                })
                .catch(() => {
                    clearTimeout(timer);
                    resolve(false);
                });
        });
    }

    async function hasMediaDL() {
        // Astra Downloader exposes /health on each fallback port.
        // Probe in declared order; first OK wins. Total worst case
        // = ports.length * PROBE_TIMEOUT_MS but realistic case = one
        // round trip on the canonical port.
        for (const port of MEDIA_DL_PORTS) {
            const ok = await fetchWithTimeout(`http://127.0.0.1:${port}/health`, PROBE_TIMEOUT_MS);
            if (ok) return true;
        }
        return false;
    }

    async function hasOllama() {
        // Ollama exposes /api/version on its default port. /api/tags
        // would also work but version is the smaller payload.
        return fetchWithTimeout(`http://127.0.0.1:${OLLAMA_PORT}/api/version`, PROBE_TIMEOUT_MS);
    }

    function hasDocumentPip() {
        return Boolean(
            typeof globalThis !== 'undefined'
            && globalThis.documentPictureInPicture
        );
    }

    // Probe table — keys MUST match the CAPABILITIES enum exported
    // by settings-schema.js. The hardening test pins that.
    const PROBES = Object.freeze({
        summarizerApi: { async: false, run: hasSummarizerApi },
        documentPip:   { async: false, run: hasDocumentPip },
        mediaDL:       { async: true,  run: hasMediaDL },
        ollama:        { async: true,  run: hasOllama },
    });

    function probe(name) {
        const entry = PROBES[name];
        if (!entry) {
            // Unknown capability — be defensive, return false rather
            // than throw, so a stale UI element doesn't crash the
            // popup on an unknown name.
            return false;
        }
        return entry.run();
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
