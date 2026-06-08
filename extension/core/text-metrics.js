(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.parseCompactCount) return;

    // Canonical parser for YouTube compact view / watcher counts.
    //
    // Handles comma-grouped integers ("1,234 views" -> 1234), K/M/B suffixes
    // ("1.2M views" -> 1200000), "No views" -> 0, and live "watching" counts.
    // Returns `missingValue` (default null) when the text carries no parseable
    // count, so callers can distinguish "no data" from "0 views".
    //
    // This logic used to be copy-pasted across ytkit.js (twice) and the
    // video-hider feature, each with a broken `match[1].replace(',', '.')` that
    // turned "1,234" into the float 1.234 -> 1 — so a popular video read as
    // "1 view" and got wrongly hidden by the low-view filter. Keeping ONE
    // implementation here (plus tests/.* guard) prevents that bug class from
    // reappearing through divergent copies. See tests: hardening.test.js
    // "no compact-count parser uses the broken decimal-coercion pattern".
    function parseCompactCount(text, missingValue = null) {
        const raw = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!raw || /\bno\s+views?\b/.test(raw)) return 0;
        const match = raw.match(/(\d[\d,.]*)\s*([kmb])?\s*(?:views?|watching)/i);
        if (!match) return missingValue;
        const suffix = match[2] ? match[2].toLowerCase() : '';
        let numeric = match[1];
        if (suffix) {
            // Suffixed counts carry a single decimal separator ("1.2M", "1,2M").
            if (numeric.includes(',') && !numeric.includes('.')) numeric = numeric.replace(',', '.');
            else numeric = numeric.replace(/,/g, '');
        } else {
            // Plain integers are comma-grouped ("1,234", "12,345,678").
            numeric = numeric.replace(/(\d),(?=\d{3}\b)/g, '$1');
            if (numeric.includes(',') && !numeric.includes('.')) numeric = numeric.replace(',', '.');
            else numeric = numeric.replace(/,/g, '');
        }
        const number = parseFloat(numeric);
        if (!Number.isFinite(number)) return missingValue;
        const scale = { k: 1000, m: 1000000, b: 1000000000 }[suffix] || 1;
        return Math.round(number * scale);
    }

    Object.assign(core, { parseCompactCount });
})();
