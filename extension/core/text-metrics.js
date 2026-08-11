(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.parseCompactCount && core.escapeRegExp) return;

    function hex(value, width = 2) {
        return value.toString(16).padStart(width, '0');
    }

    // RegExp.escape() is the platform path. The fallback follows the
    // standard's important edge cases: a leading ASCII letter/digit is
    // hex-escaped so it cannot merge with a preceding escape, and punctuators
    // such as '-' use \x escapes because `\\-` is invalid in a Unicode regex.
    function escapeRegExp(value) {
        const text = String(value ?? '');
        const nativeEscape = globalThis.RegExp?.escape;
        if (typeof nativeEscape === 'function') return nativeEscape(text);

        const syntax = new Set(['^', '$', '\\', '.', '*', '+', '?', '(', ')', '[', ']', '{', '}', '|', '/']);
        const punctuators = new Set([',', '-', '=', '<', '>', '#', '&', '!', '%', ':', ';', '@', '~', "'", '`', '"']);
        let output = '';
        for (let index = 0; index < text.length; index += 1) {
            const char = text[index];
            const code = text.charCodeAt(index);
            if (index === 0 && /[A-Za-z0-9]/.test(char)) {
                output += `\\x${hex(code)}`;
            } else if (syntax.has(char)) {
                output += `\\${char}`;
            } else if (punctuators.has(char)) {
                output += `\\x${hex(code)}`;
            } else if (char === '\f') {
                output += '\\f';
            } else if (char === '\n') {
                output += '\\n';
            } else if (char === '\r') {
                output += '\\r';
            } else if (char === '\t') {
                output += '\\t';
            } else if (char === '\v') {
                output += '\\v';
            } else if (char === ' ') {
                output += '\\x20';
            } else if (code === 0x2028 || code === 0x2029) {
                output += `\\u${hex(code, 4)}`;
            } else if (code >= 0xd800 && code <= 0xdbff
                && index + 1 < text.length
                && text.charCodeAt(index + 1) >= 0xdc00
                && text.charCodeAt(index + 1) <= 0xdfff) {
                output += char + text[index + 1];
                index += 1;
            } else if (code >= 0xd800 && code <= 0xdfff) {
                output += `\\u${hex(code, 4)}`;
            } else {
                output += char;
            }
        }
        return output;
    }

    // YouTube localizes the words around a count, and may also localize the
    // compact suffix (for example "1,2 Mio. Aufrufe" or "12.3万 回視聴").
    // Keep the parser structural: find a numeric token adjacent to a known
    // count label, then normalize its locale-specific separators/suffix.
    const VIEW_COUNT_LABELS = /(?:views?|watching|aufrufe?|ansichten?|visualizaciones?|vues?|visualizações?|visualizzazioni?|просмотр(?:а|ов|ы)?|回視聴|視聴回数|조회수|观看次数?|播放次数?|المشاهدات?|مشاهدة)/i;
    const DEFAULT_NO_COUNT = /(?:\bno\s+views?\b|\bkeine[nr]?\s+aufrufe?\b|\bkeine\s+ansichten?\b|\bkeine\s+visualisierungen\b|нет\s+просмотров|視聴回数\s*(?:なし|ありません)|조회수\s*없음|(?:没有|暂无)观看次数|(?:لا\s+)?مشاهدات)/i;
    const SUFFIX_SOURCE = '(k|m|b|tsd\\.?|mio\\.?|mrd\\.?|md|mln\\.?|mld\\.?|tys\\.?|rb|jt|тыс\\.?|млн\\.?|млрд\\.?|mil|mille|million(?:s|en)?|milliard(?:s|en)?|千|万|億|亿|천|만|억|ألف|مليون|مليار)';
    const TOKEN_SOURCE = `(\\d[\\d\\s.,]*)(?:\\s*${SUFFIX_SOURCE})?`;
    const DIGIT_RANGES = Object.freeze([
        [0x0660, 0x0669], // Arabic-Indic
        [0x06f0, 0x06f9], // Eastern Arabic-Indic
        [0x0966, 0x096f], // Devanagari
        [0x09e6, 0x09ef], // Bengali
        [0x0e50, 0x0e59], // Thai
        [0xff10, 0xff19]  // Fullwidth
    ]);

    function normalizeDigits(value) {
        return Array.from(String(value), char => {
            const code = char.codePointAt(0);
            for (const [start, end] of DIGIT_RANGES) {
                if (code >= start && code <= end) return String(code - start);
            }
            return char;
        }).join('');
    }

    function cloneRegex(pattern) {
        if (!pattern || typeof pattern.source !== 'string' || typeof pattern.flags !== 'string') return null;
        return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
    }

    function matchCountLabel(raw, labels) {
        const regex = cloneRegex(labels);
        return regex ? raw.match(regex) : null;
    }

    function parseSuffix(value) {
        const key = String(value || '').toLowerCase().replace(/\./g, '');
        return {
            k: 1e3,
            m: 1e6,
            b: 1e9,
            tsd: 1e3,
            mio: 1e6,
            mrd: 1e9,
            md: 1e9,
            mln: 1e6,
            mld: 1e9,
            tys: 1e3,
            rb: 1e3,
            jt: 1e6,
            'тыс': 1e3,
            'млн': 1e6,
            'млрд': 1e9,
            mil: 1e3,
            mille: 1e3,
            million: 1e6,
            millions: 1e6,
            millionen: 1e6,
            milliard: 1e9,
            milliards: 1e9,
            milliarden: 1e9,
            '千': 1e3,
            '万': 1e4,
            '億': 1e8,
            '亿': 1e8,
            '천': 1e3,
            '만': 1e4,
            '억': 1e8,
            'ألف': 1e3,
            'مليون': 1e6,
            'مليار': 1e9
        }[key] || 1;
    }

    function normalizeNumber(value, hasSuffix) {
        let numeric = String(value || '').replace(/[\s\u00a0\u202f]/g, '');
        const comma = numeric.lastIndexOf(',');
        const dot = numeric.lastIndexOf('.');

        if (comma > -1 && dot > -1) {
            const decimal = comma > dot ? ',' : '.';
            const grouping = decimal === ',' ? /\./g : /,/g;
            numeric = numeric.replace(grouping, '');
            if (decimal === ',') numeric = numeric.replace(',', '.');
        } else if (comma > -1) {
            const groups = numeric.split(',');
            const groupedInteger = groups.length > 1
                && groups.slice(1).every(group => group.length === 3);
            numeric = groupedInteger ? groups.join('') : numeric.replace(/,/g, '.');
        } else if (dot > -1 && !hasSuffix) {
            const groups = numeric.split('.');
            const groupedInteger = groups.length > 1
                && groups.slice(1).every(group => group.length === 3);
            if (groupedInteger) numeric = groups.join('');
        }
        return numeric;
    }

    function readToken(text, anchored = false, endOnly = false) {
        const regex = new RegExp(`${anchored ? '^' : ''}${TOKEN_SOURCE}\\s*${anchored || endOnly ? '$' : ''}`, 'i');
        const match = String(text || '').match(regex);
        if (!match) return null;
        const suffix = match[2] || '';
        const numeric = normalizeNumber(match[1], !!suffix);
        const number = Number.parseFloat(numeric);
        if (!Number.isFinite(number)) return null;
        return { number, suffix };
    }

    function findToken(raw, labels, allowBare) {
        const label = matchCountLabel(raw, labels);
        if (label) {
            const before = readToken(raw.slice(0, label.index), false, true);
            if (before) return before;
            const after = readToken(raw.slice(label.index + label[0].length).trimStart(), false);
            if (after) return after;
        }

        // A bare numeric token is accepted only when the caller explicitly
        // opts in and the whole candidate is the token. This keeps a title
        // such as "Top 5 videos" from becoming a view count.
        if (allowBare) return readToken(raw.trim(), true);
        return null;
    }

    // Canonical parser for YouTube compact view / watcher counts.
    //
    // Handles comma-grouped integers ("1,234 views" -> 1234), K/M/B and
    // localized suffixes ("1,2 Mio. Aufrufe", "12.3万 回視聴"), "No views"
    // and live "watching" counts. Returns `missingValue` (default null) when
    // the text carries no parseable count, so callers can distinguish "no
    // data" from "0 views". `options.labels` can be supplied for another
    // count type, such as localized subscriber metadata.
    function parseCompactCount(text, missingValue = null, options = {}) {
        const raw = normalizeDigits(String(text || '')
            .replace(/[\u00a0\u202f]/g, ' ')
            .replace(/\u066c/g, ',')
            .replace(/\u066b/g, '.')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase());
        // Empty/whitespace input is "no data", not "0 views". A card read
        // before Polymer hydrates renders no metadata text at all, and the
        // consumers guard on `!== null` precisely so a pre-hydration card is
        // not mistaken for a zero-view one.
        if (!raw) return missingValue;

        const labels = options.labels || VIEW_COUNT_LABELS;
        const zeroPattern = options.zeroPattern === undefined ? DEFAULT_NO_COUNT : options.zeroPattern;
        if (zeroPattern && cloneRegex(zeroPattern)?.test(raw)) return 0;

        const token = findToken(raw, labels, options.allowBare === true);
        if (!token) return missingValue;
        return Math.round(token.number * parseSuffix(token.suffix));
    }

    Object.assign(core, { escapeRegExp, parseCompactCount });
})();
