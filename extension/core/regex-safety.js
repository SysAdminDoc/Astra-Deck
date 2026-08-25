(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.hasUnsafeRegexQuantifiers) return;

    // The single ReDoS guard for every pattern compiled out of user or remote
    // text: Video Hider's keyword filters, the comment filter, the predicate
    // sandbox. Its own module because those three do not share a surface:
    // predicate-sandbox.js is deliberately extension-only, while the other two
    // also ship in the userscript bundle. Private per-caller copies are what
    // this replaces; they caught `(a|b+)+` and missed `.*.*.*.*.*.*z`.

    const MAX_REGEX_SOURCE = 200;

    function hasUnsafeRegexQuantifiers(pattern) {
        if (typeof pattern !== 'string') return true;
        // Bounded source length bounds worst-case backtracking work.
        if (pattern.length > MAX_REGEX_SOURCE) return true;

        const adjacent = /([+*?]|\{\d+,?\d*\})\s*[+*?]/.test(pattern);
        const groupInner = /\(([^()]*(?:[+*?]|\{\d+,?\d*\})[^()]*)\)\s*(?:[+*?]|\{\d+,?\d*\})/.test(pattern);
        // Overlapping alternation: (a|a|a)+, (a|aa)+. Exponential on its own.
        const altGroupQuantified = /\([^()]*\|[^()]*\)\s*(?:[+*]|\{\d+,?\d*\})/.test(pattern);
        if (adjacent || groupInner || altGroupQuantified) return true;

        // Polynomial backtracking: `.*.*.*.*`, or sequential quantified
        // groups like `(a+)(a+)(a+)(a+)(a+)b`, backtrack in O(n^k) where k is
        // the open-ended quantifier count. The nesting scan below only sees
        // groups quantified THEMSELVES, so count across the whole pattern.
        // Four yields ~O(n^4), tolerable under the 200-char cap.
        let openEndedQuantifiers = 0;
        for (let qi = 0; qi < pattern.length; qi += 1) {
            const qc = pattern[qi];
            if (qc === '\\') { qi += 1; continue; }
            if (qc === '[') {
                while (qi < pattern.length && pattern[qi] !== ']') {
                    if (pattern[qi] === '\\') qi += 1;
                    qi += 1;
                }
                continue;
            }
            if (qc === '(' || qc === ')') continue;
            if (qc === '+' || qc === '*') openEndedQuantifiers += 1;
            if (qc === '{') {
                const brace = pattern.slice(qi).match(/^\{(\d+),(\d*)}/);
                if (brace && (brace[2] === '' || Number(brace[2]) > Number(brace[1]))) openEndedQuantifiers += 1;
            }
        }
        if (openEndedQuantifiers > 4) return true;

        // Nesting-aware scan for the exponential forms ((a+)+, ((ab)*)*,
        // ((a|b)+)+): a group followed by + * {n,} whose contents hold a
        // quantifier or alternation at ANY depth. The flat `[^()]` heuristics
        // above cannot see those, since a nested paren breaks their character
        // classes. `?` cannot drive repetition, so it is inner risk only.
        const stack = [];
        for (let i = 0; i < pattern.length; i += 1) {
            const ch = pattern[i];
            if (ch === '\\') { i += 1; continue; }
            if (ch === '[') {
                i += 1;
                while (i < pattern.length && pattern[i] !== ']') {
                    if (pattern[i] === '\\') i += 1;
                    i += 1;
                }
                continue;
            }
            if (ch === '(') { stack.push({ innerRisk: false }); continue; }
            if (ch === ')') {
                const group = stack.pop();
                if (!group) continue; // unbalanced — new RegExp() will reject later
                const next = pattern[i + 1];
                const repeated = next === '+' || next === '*' || next === '{';
                if (repeated && group.innerRisk) return true;
                if (stack.length && (repeated || group.innerRisk)) {
                    stack[stack.length - 1].innerRisk = true;
                }
                continue;
            }
            if (stack.length && (ch === '+' || ch === '*' || ch === '?' || ch === '|' || ch === '{')) {
                stack[stack.length - 1].innerRisk = true;
            }
        }
        return false;
    }

    Object.assign(core, { MAX_REGEX_SOURCE, hasUnsafeRegexQuantifiers });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { MAX_REGEX_SOURCE, hasUnsafeRegexQuantifiers };
    }
})();
