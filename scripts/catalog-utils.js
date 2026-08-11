'use strict';

function findBalancedObjectLiteral(source, startToken) {
    const start = source.indexOf(startToken);
    if (start === -1) return null;

    const openIndex = source.indexOf('{', start);
    if (openIndex === -1) return null;

    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;
    let escaping = false;

    for (let index = openIndex; index < source.length; index += 1) {
        const char = source[index];
        const next = source[index + 1];

        if (inLineComment) {
            if (char === '\n') inLineComment = false;
            continue;
        }

        if (inBlockComment) {
            if (char === '*' && next === '/') {
                inBlockComment = false;
                index += 1;
            }
            continue;
        }

        if (inSingle) {
            if (!escaping && char === '\'') inSingle = false;
            escaping = char === '\\' && !escaping;
            continue;
        }

        if (inDouble) {
            if (!escaping && char === '"') inDouble = false;
            escaping = char === '\\' && !escaping;
            continue;
        }

        if (inTemplate) {
            if (!escaping && char === '`') inTemplate = false;
            escaping = char === '\\' && !escaping;
            continue;
        }

        escaping = false;

        if (char === '/' && next === '/') {
            inLineComment = true;
            index += 1;
            continue;
        }

        if (char === '/' && next === '*') {
            inBlockComment = true;
            index += 1;
            continue;
        }

        if (char === '\'') {
            inSingle = true;
            continue;
        }

        if (char === '"') {
            inDouble = true;
            continue;
        }

        if (char === '`') {
            inTemplate = true;
            continue;
        }

        if (char === '{') {
            depth += 1;
        } else if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                return source.slice(openIndex, index + 1);
            }
        }
    }

    return null;
}

function extractDefaultsFromSource(source) {
    const objectLiteral = findBalancedObjectLiteral(source, 'defaults:');
    if (!objectLiteral) {
        throw new Error('Could not find settings defaults in source');
    }

    // Node-only build/test helper. Runtime code must not use dynamic evaluation.
    const defaults = Function('"use strict"; return (' + objectLiteral + ');')();
    if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) {
        throw new Error('Parsed defaults are not a plain object');
    }

    return defaults;
}

function extractSettingsVersionFromSource(source) {
    const settingsVersionMatch = source.match(/SETTINGS_VERSION:\s*(\d+)/);
    if (!settingsVersionMatch) {
        throw new Error('Could not find settings version in source');
    }
    return Number(settingsVersionMatch[1]);
}

function skipJsString(source, start, quote) {
    let index = start + 1;
    while (index < source.length) {
        if (source[index] === '\\') {
            index += 2;
            continue;
        }
        if (source[index] === quote) return index + 1;
        index += 1;
    }
    return source.length;
}

function skipJsComment(source, start) {
    if (source[start] !== '/') return start;
    if (source[start + 1] === '/') {
        const end = source.indexOf('\n', start + 2);
        return end === -1 ? source.length : end + 1;
    }
    if (source[start + 1] === '*') {
        const end = source.indexOf('*/', start + 2);
        return end === -1 ? source.length : end + 2;
    }
    return start;
}

function looksLikeRegexStart(source, index) {
    let previous = index - 1;
    while (previous >= 0 && /\s/.test(source[previous])) previous -= 1;
    if (previous < 0) return true;
    if (/[=(:,!&|?{};\[\]]/.test(source[previous])) return true;
    const prefix = source.slice(Math.max(0, previous - 12), previous + 1);
    return /\b(?:return|case|throw|typeof|void|delete|in|of)$/.test(prefix);
}

function skipJsRegex(source, start) {
    let index = start + 1;
    let inClass = false;
    while (index < source.length) {
        if (source[index] === '\\') {
            index += 2;
            continue;
        }
        if (source[index] === '[') inClass = true;
        else if (source[index] === ']') inClass = false;
        else if (source[index] === '/' && !inClass) {
            index += 1;
            while (/[A-Za-z]/.test(source[index] || '')) index += 1;
            return index;
        }
        index += 1;
    }
    return source.length;
}

function findBraceRanges(source) {
    const stack = [];
    const ranges = [];
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (char === '\'' || char === '"' || char === '`') {
            index = skipJsString(source, index, char) - 1;
            continue;
        }
        if (char === '/' && (source[index + 1] === '/' || source[index + 1] === '*')) {
            index = skipJsComment(source, index) - 1;
            continue;
        }
        if (char === '/' && looksLikeRegexStart(source, index)) {
            index = skipJsRegex(source, index) - 1;
            continue;
        }
        if (char === '{') {
            stack.push(index);
        } else if (char === '}' && stack.length) {
            ranges.push({ open: stack.pop(), close: index });
        }
    }
    return ranges;
}

function decodeJsString(body) {
    return body
        .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\([nrtbfv])/g, (_, escaped) => ({
            n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v'
        })[escaped])
        .replace(/\\\r?\n/g, '')
        .replace(/\\([\\'"`])/g, '$1');
}

function readQuotedString(source, start) {
    const quote = source[start];
    if (quote !== '\'' && quote !== '"') return null;
    const end = skipJsString(source, start, quote);
    if (end > source.length || source[end - 1] !== quote) return null;
    return { value: decodeJsString(source.slice(start + 1, end - 1)), end };
}

function readTCall(source, start) {
    const match = source.slice(start).match(/^t\(\s*(['"])(feature_[A-Za-z0-9_]+_(?:name|desc))\1\s*,\s*/);
    if (!match) return null;
    const fallbackStart = start + match[0].length;
    const fallback = readQuotedString(source, fallbackStart);
    if (!fallback) return null;
    let depth = 1;
    let index = fallback.end;
    while (index < source.length) {
        const char = source[index];
        if (char === '\'' || char === '"' || char === '`') {
            index = skipJsString(source, index, char);
            continue;
        }
        if (char === '/' && (source[index + 1] === '/' || source[index + 1] === '*')) {
            index = skipJsComment(source, index);
            continue;
        }
        if (char === '(') depth += 1;
        else if (char === ')') {
            depth -= 1;
            if (depth === 0) {
                return { key: match[2], value: fallback.value, end: index + 1 };
            }
        }
        index += 1;
    }
    return null;
}

function readFeatureExpression(source, start) {
    const trimmedStart = start + (source.slice(start).match(/^\s*/) || [''])[0].length;
    const quoted = readQuotedString(source, trimmedStart);
    if (quoted) return { value: quoted.value, end: quoted.end };
    return readTCall(source, trimmedStart);
}

function findNextArgumentComma(source, start, limit) {
    let parenDepth = 0;
    let bracketDepth = 0;
    let braceDepth = 0;
    for (let index = start; index < limit; index += 1) {
        const char = source[index];
        if (char === '\'' || char === '"' || char === '`') {
            index = skipJsString(source, index, char) - 1;
            continue;
        }
        if (char === '/' && (source[index + 1] === '/' || source[index + 1] === '*')) {
            index = skipJsComment(source, index) - 1;
            continue;
        }
        if (char === '(') parenDepth += 1;
        else if (char === ')') parenDepth -= 1;
        else if (char === '[') bracketDepth += 1;
        else if (char === ']') bracketDepth -= 1;
        else if (char === '{') braceDepth += 1;
        else if (char === '}') braceDepth -= 1;
        else if (char === ',' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) return index;
    }
    return -1;
}

function normalizeFeatureCopy(value) {
    return String(value || '')
        .replace(/[\u2018\u2019]/g, '\'')
        .replace(/[\u201c\u201d]/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractFeatureCopyFromSource(source) {
    const ranges = findBraceRanges(source);
    const copies = {};
    const conflicts = [];
    const add = (key, value, index) => {
        if (!key || value == null) return;
        const next = { value: String(value), index };
        const previous = copies[key];
        if (previous && normalizeFeatureCopy(previous.value) !== normalizeFeatureCopy(next.value)) {
            conflicts.push({ key, first: previous, second: next });
            return;
        }
        if (!previous) copies[key] = next;
    };

    const idRe = /\bid\s*:\s*(['"])([A-Za-z0-9_]+)\1/g;
    let idMatch;
    while ((idMatch = idRe.exec(source)) !== null) {
        const object = ranges
            .filter((range) => range.open < idMatch.index && range.close > idRe.lastIndex)
            .sort((a, b) => b.open - a.open)[0];
        if (!object) continue;
        const id = idMatch[2];
        let depth = 0;
        for (let index = object.open + 1; index < object.close; index += 1) {
            const char = source[index];
            if (char === '\'' || char === '"' || char === '`') {
                index = skipJsString(source, index, char) - 1;
                continue;
            }
            if (char === '/' && (source[index + 1] === '/' || source[index + 1] === '*')) {
                index = skipJsComment(source, index) - 1;
                continue;
            }
            if (char === '{') { depth += 1; continue; }
            if (char === '}') { depth -= 1; continue; }
            if (depth !== 0 || !/[A-Za-z_$]/.test(char)) continue;
            const wordMatch = source.slice(index).match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*:/);
            if (!wordMatch || !['name', 'description'].includes(wordMatch[1])) continue;
            const expressionStart = index + wordMatch[0].length;
            const expression = readFeatureExpression(source, expressionStart);
            if (!expression) continue;
            add(`feature_${id}_${wordMatch[1] === 'name' ? 'name' : 'desc'}`, expression.value, index);
            index = expression.end - 1;
        }
    }

    const cssRe = /\bcssFeature\s*\(\s*(['"])([A-Za-z0-9_]+)\1\s*,/g;
    let cssMatch;
    while ((cssMatch = cssRe.exec(source)) !== null) {
        const nameStart = cssMatch.index + cssMatch[0].length;
        const name = readFeatureExpression(source, nameStart);
        if (!name) continue;
        const nameComma = findNextArgumentComma(source, name.end, source.length);
        if (nameComma === -1) continue;
        const description = readFeatureExpression(source, nameComma + 1);
        if (!description) continue;
        add(`feature_${cssMatch[2]}_name`, name.value, cssMatch.index);
        add(`feature_${cssMatch[2]}_desc`, description.value, cssMatch.index);
    }

    return { copies, conflicts };
}

module.exports = {
    extractDefaultsFromSource,
    extractFeatureCopyFromSource,
    extractSettingsVersionFromSource,
    findBalancedObjectLiteral,
    normalizeFeatureCopy
};
