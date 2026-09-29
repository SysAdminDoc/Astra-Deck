#!/usr/bin/env node
'use strict';

// Builds the userscript from the extension's own sources.
//
// The userscript is not a second implementation. YTKit.user.js is a small
// host (userscript/host.js) that stands in for the chrome.* APIs with GM_*
// grants, and three @require libraries carry the extension's files verbatim
// apart from whitespace and comments:
//
//   YTKit-core.user.js      foundation modules, the background worker and the
//                           modules it imports, the MAIN-world scripts, the
//                           live-chat group, core/bridge-token.js
//   YTKit-features.user.js  the peeled feature modules
//   YTKit-app.user.js       extension/ytkit.js
//
// Libraries only REGISTER each file as a function. The host runs them in the
// order and world the manifest gives them. Every file here is generated: edit
// extension/ or userscript/host.js and run `node sync-userscript.js`.
//
// Greasy Fork caps a script record at 2 MiB, which is why the code is split in
// three and why every file is compacted: comments go, CSS templates are
// tightened, and indentation outside string and template literals becomes
// tabs. Each step is checked (CSS token order, JS token stream) and the sync
// stops rather than write a library that differs from its source.

const fs = require('fs');
const acorn = require('acorn');
const path = require('path');
const { getUserscriptBasename } = require('./scripts/repo-paths');

const REPO_ROOT = __dirname;
const EXTENSION_DIR = path.join(REPO_ROOT, 'extension');
const HOST_SOURCE = path.join(REPO_ROOT, 'userscript', 'host.js');
const USERSCRIPT_BASENAME = getUserscriptBasename(REPO_ROOT);
const USERSCRIPT_RAW_URL = `https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/${USERSCRIPT_BASENAME}`;
const USERSCRIPT_CORE_SOURCE = path.join(REPO_ROOT, 'YTKit-core.user.js');
const MAX_RECORD_BYTES = 2 * 1024 * 1024;
const REGISTRY_GLOBAL = '__astraDeckUserscriptModules';
const REGISTRY_LOCAL = '__astraDeckRegistry';
const MAIN_WORLD_MODULE = '@main-world';
const LOCALE_RESOURCE_PREFIX = 'astra-locale-';
const RUNTIME_ID = 'astra-deck-userscript';
const MODULE_PARAMS = 'globalThis, self, window, chrome, browser, fetch, importScripts, trustedTypes';

// The @require targets. Pinned to the release TAG, not to `main`.
//
// Until v4.88.3 this pointed at `main`, so every userscript install pulled
// executable code from a mutable branch pointer, in a script that also grants
// GM_xmlhttpRequest to OpenAI, Anthropic, Gemini and loopback. Anything able
// to move `main` moved every install at once, with no version to notice it
// by. A tag is immutable once pushed, so a given @version always requires the
// same bytes and the release advances both together. The main file itself
// still updates from `main`, which is what moves an install to a new tag.
//
// ASTRA_USERSCRIPT_LIBRARY_BASE overrides the base for a mirrored host.
const LIBRARY_URL_BASE = 'https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck';

function tagUrl(version, relativePath) {
    const base = process.env.ASTRA_USERSCRIPT_LIBRARY_BASE;
    if (base) return `${base.replace(/\/+$/, '')}/${relativePath}`;
    return `${LIBRARY_URL_BASE}/refs/tags/v${version}/${relativePath}`;
}

function coreRequireUrl(version) {
    return tagUrl(version, 'YTKit-core.user.js');
}

const LIBRARIES = Object.freeze([
    { id: 'core', file: 'YTKit-core.user.js', title: 'Astra Deck YTKit Core Library' },
    { id: 'features', file: 'YTKit-features.user.js', title: 'Astra Deck YTKit Feature Library' },
    { id: 'app', file: 'YTKit-app.user.js', title: 'Astra Deck YTKit App Library' },
]);

// Greasy Fork caps each script record at 2 MiB, and most of this repo's CSS is
// written as indented template literals. Every bundled module goes through one
// pass that finds them: the module is parsed, each untagged template literal
// whose static text has the shape of a stylesheet is compacted, and nothing is
// looked up by name. Three mechanisms used to share this job (a named const, a
// named `return`, and a backtick scan over an allowlist of eleven modules), and
// a module that grew a new stylesheet was compacted only if someone remembered
// to list it. Forgetting cost nothing visible; the bundle just got bigger.
//
// A parser rather than a character scan because a backtick inside a string or
// a regex desyncs a scan, and then the text BETWEEN two templates is taken for
// one. extension/core/ai-summary-artifacts.js reads that way: four spans of
// JavaScript with ternaries in them pass the CSS shape test, and compacting
// them would have joined `//` comment lines onto the code after them.
const CSS_SHAPE = /\{[^{}]*[a-z-]+\s*:\s*[^{}]+;/;
// Interpolations used to be the tell that kept a script template out of reach;
// now that they are carried through instead, this list has to recognise
// JavaScript on its own. It is tested by scriptSignals() on the static text
// with CSS comments, quoted strings and unquoted url() blanked, so prose in a
// comment cannot trip it. A `//` left after that is a script comment wherever
// it sits: CSS has none, and joining lines would glue it onto the code after
// it. ` = ` and `++` catch code that leans on automatic semicolon insertion,
// which joining lines also breaks.
const NOT_CSS = /=>|===|!==|&&|\+\+|\s=\s|\/\/|\b(?:function|return|typeof)\b|\b(?:if|for|while|switch|catch)\s*\(|\b(?:else|try)\s*\{|\b(?:const|let|var)\s|\b(?:this|window|document)\.|<[a-zA-Z/!]/;
// To CSS an unquoted url() is one token: a `/*` or `//` inside it is part of
// the address, not a comment.
const UNQUOTED_URL = /\burl\(\s*[^\s'")][^)]*\)/gi;

function scriptSignals(staticText) {
    return NOT_CSS.test(staticText
        .replace(UNQUOTED_URL, 'url()')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""'));
}
// An interpolation is carried through compaction as one opaque token and put
// back byte for byte, so nothing that reads a runtime value is rewritten.
const EXPRESSION_MARK = /\x03(\d+)\x04/;

const COMPACT_LINE_COMMENT_MODULES = new Set([
    'extension/core/settings-schema.js',
]);

function compactCssWhitespace(body) {
    const literals = [];
    let masked = '';
    for (let index = 0; index < body.length;) {
        // CSS comments are dropped here rather than by a regex over the masked
        // text further down. A comment is not code, so an apostrophe inside one
        // ("the anchor's height") must not open a string literal: doing that
        // swallowed everything up to the next apostrophe, and because the
        // swallowed run is restored verbatim the rest of the template silently
        // came through uncompacted. Nothing failed, the bundle just quietly got
        // bigger, which is the failure this whole function exists to prevent.
        if (body[index] === '/' && body[index + 1] === '*') {
            const close = body.indexOf('*/', index + 2);
            index = close === -1 ? body.length : close + 2;
            continue;
        }

        // An unquoted url() is kept whole, so a `/*` in the address is not
        // taken for a comment that swallows the rules after it.
        if ((body[index] === 'u' || body[index] === 'U') && !/[\w-]/.test(body[index - 1] || '')) {
            UNQUOTED_URL.lastIndex = 0;
            const url = UNQUOTED_URL.exec(body.slice(index, index + 4096));
            if (url && url.index === 0) {
                literals.push(url[0]);
                masked += `\u0001${literals.length - 1}\u0002`;
                index += url[0].length;
                continue;
            }
        }

        const quote = body[index];
        if (quote !== '"' && quote !== "'" && quote !== '`') {
            masked += quote;
            index += 1;
            continue;
        }

        const start = index;
        index += 1;
        while (index < body.length) {
            if (body[index] === '\\') {
                index += 2;
                continue;
            }
            const current = body[index];
            index += 1;
            if (current === quote) break;
        }
        const marker = `\u0001${literals.length}\u0002`;
        literals.push(body.slice(start, index));
        masked += marker;
    }

    // CSS comments explain the rules to whoever edits this file; they are not
    // part of what a Greasy Fork reviewer reads, and the source keeps them in
    // full. The core record is against a hard 2 MiB host cap, and these two
    // templates alone carried 4,434 B of them, so relighting a surface was
    // costing prose rather than bytes. The stripping itself now happens in the
    // masking pass above, where a comment cannot be mistaken for a string.
    const compacted = masked
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s*([{};,])\s*/g, '$1')
        // Keep whitespace before pseudo-classes because it can be a descendant
        // combinator (`.toolbar :is(button)`). Only declaration/value spacing
        // after a colon is safe to remove without parsing selectors.
        .replace(/:\s+/g, ':')
        // The space before !important is decoration, not syntax. These
        // templates carry thousands of them.
        .replace(/\s+!important/g, '!important')
        .replace(/;}/g, '}');

    return compacted.replace(/\u0001(\d+)\u0002/g,
        (_match, literalIndex) => literals[Number(literalIndex)]);
}

function untaggedTemplateLiterals(node, found = []) {
    if (!node || typeof node.type !== 'string') return found;
    if (node.type === 'TemplateLiteral') found.push(node);
    for (const [key, value] of Object.entries(node)) {
        // A tagged template hands its raw text to a function (String.raw is how
        // this repo writes regex sources), so its whitespace is data. Its
        // interpolations are still ordinary code and are walked.
        if (node.type === 'TaggedTemplateExpression' && key === 'quasi') {
            value.expressions.forEach((expression) => untaggedTemplateLiterals(expression, found));
        } else if (Array.isArray(value)) {
            value.forEach((child) => untaggedTemplateLiterals(child, found));
        } else if (value && typeof value.type === 'string') {
            untaggedTemplateLiterals(value, found);
        }
    }
    return found;
}

// `after` must carry the same selectors, declarations and braces as `before`,
// in the same order and as many times, compared with only the whitespace and
// final semicolons compaction is allowed to drop normalised away. Order and
// count matter: a dropped duplicate, a declaration moved into another rule and
// two swapped rules all change which declaration wins. This is deliberately
// not built on compactCssWhitespace's own masking: the v4.90.0
// comment-apostrophe bug lived in that masking and deleted 183 declarations,
// and a check sharing the code would have shared the bug.
function cssTokens(text) {
    return text
        // Same reading of url() as CSS: a `/*` in an unquoted address opens
        // no comment. Both sides get it, so equal addresses compare equal.
        .replace(UNQUOTED_URL, (url) => url.replace(/\/\*/g, '/\u0005'))
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        // The one structural change compaction is allowed: a last semicolon.
        .replace(/;(\s*)\}/g, '$1}')
        .split(/([{};])/)
        .map((token) => token.replace(/\s+/g, ' ')
            .replace(/\s*,\s*/g, ',')
            .replace(/:\s+/g, ':')
            .replace(/\s+!important/g, '!important')
            .trim())
        .filter(Boolean);
}

function assertCssSurvives(before, after, where) {
    const expected = cssTokens(before);
    const actual = cssTokens(after);
    const at = expected.findIndex((token, index) => token !== actual[index]);
    if (at !== -1 || actual.length !== expected.length) {
        const index = at === -1 ? expected.length : at;
        throw new Error(`CSS compaction changed the stylesheet in ${where} at token ${index}: `
            + `expected ${JSON.stringify(expected[index] ?? '<end>')}, got ${JSON.stringify(actual[index] ?? '<end>')}`);
    }
}

/**
 * Compact every CSS-shaped template literal in `source`, whatever module it
 * came from. A template is left exactly as written unless all of these hold:
 *   - it is untagged, and its static text has a braced `property: value;`;
 *   - its static text has no backslash, which keeps escapes and regex sources
 *     out of reach, and none of the control characters used as markers here;
 *   - its static text shows none of the markers of JavaScript or HTML;
 *   - every interpolation comes back out in order (one inside a CSS comment
 *     would be dropped with the comment, so that template is skipped).
 * A template that passes all of that and still changes its rules is a bug in
 * the compactor, and the build stops rather than ship the smaller file.
 */
function compactBundledCssTemplates(source, relativePath) {
    let ast;
    try {
        ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
    } catch (error) {
        throw new Error(`Cannot compact ${relativePath}: ${error.message}`);
    }

    const edits = [];
    for (const node of untaggedTemplateLiterals(ast)) {
        const raws = node.quasis.map((quasi) => quasi.value.raw);
        if (raws.some((raw) => /[\\\x01-\x04]/.test(raw))) continue;
        const staticText = raws
            .map((raw, index) => (index ? `\x03${index - 1}\x04` : '') + raw)
            .join('');
        if (!CSS_SHAPE.test(staticText)) continue;

        if (scriptSignals(staticText)) continue;
        const compacted = compactCssWhitespace(staticText);
        const pieces = compacted.split(EXPRESSION_MARK);
        const quasis = pieces.filter((_piece, index) => index % 2 === 0);
        const order = pieces.filter((_piece, index) => index % 2 === 1).map(Number);
        if (quasis.length !== raws.length || order.some((value, index) => value !== index)) continue;
        // Joining lines can close up `$` and `{`; that would be a new interpolation.
        if (quasis.some((quasi) => quasi.includes('${'))) continue;

        const line = source.slice(0, node.start).split('\n').length;
        assertCssSurvives(staticText, compacted, `${relativePath}:${line}`);
        node.quasis.forEach((quasi, index) => {
            edits.push({ start: quasi.start, end: quasi.end, text: quasis[index] });
        });
    }

    let compactedSource = source;
    for (const edit of edits.sort((left, right) => right.start - left.start)) {
        compactedSource = compactedSource.slice(0, edit.start) + edit.text + compactedSource.slice(edit.end);
    }
    return compactedSource;
}

function compactStandaloneLineComments(source, relativePath) {
    if (!COMPACT_LINE_COMMENT_MODULES.has(relativePath)) return source;
    return source.replace(/^[ \t]*\/\/[^\r\n]*(?:\r?\n|$)/gm, '');
}

// Whole-line comments carry the reasoning a maintainer needs and nothing a
// Greasy Fork reviewer reads, and the core record is against a hard 2 MiB host
// cap that routine work now runs into. The source keeps every comment; only
// the bundled copy loses them.
//
// A line-anchored regex cannot do this alone: a `//` line inside a template
// literal is data, and deleting it changes what the module renders. So the
// scanner tracks quotes, comments and template depth, and only drops a line
// that begins a comment while genuinely at top level.
//
// Regex literals are the one construct this does not model. That is why every
// stripped module is re-parsed below and reverted on failure: a mangled module
// cannot reach the bundle, it can only fail to shrink.
// Characters after which a / begins a regex literal rather than a division.
const REGEX_CAN_FOLLOW = new Set([
    '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>', '/'
]);
const REGEX_CAN_FOLLOW_KEYWORD = new Set([
    'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'case', 'do', 'else', 'yield', 'await', 'throw'
]);

function stripSafeLineComments(source) {
    const lines = source.split(/\r?\n/);
    const keep = [];

    // A STACK of lexical contexts, not a depth counter.
    //
    // The counter this replaces decremented on any backtick, so the backtick
    // that OPENS a template nested inside a ${ } expression was read as the one
    // that closes the outer template. Everything after it was scanned as code,
    // and a comment-looking line sitting in template DATA was deleted from the
    // shipped bundle. It also had no notion of a regex literal, so a quote or a
    // backtick inside one desynced the scan for the rest of the file — which it
    // measurably already did, on extension/features/subscription-groups/index.js.
    const stack = [{ kind: 'code', braces: 0 }];
    let inBlockComment = false;
    let quote = null;

    for (const line of lines) {
        const top = stack[stack.length - 1];
        const atTopLevel = !inBlockComment && quote === null
            && stack.length === 1 && top.kind === 'code';
        const trimmed = line.trim();
        // Never drop a line carrying a quote, a backtick or an interpolation.
        //
        // Belt and braces on top of the scanner above. If the scan is ever
        // wrong again, the worst outcome is a comment that survives into the
        // bundle — a few bytes — rather than a line of data silently deleted
        // from a shipped string.
        const carriesData = /['"`]|\$\{/.test(line);
        const dropped = atTopLevel && trimmed.startsWith('//') && !carriesData;

        // Advance the scanner across this line whether or not it is kept, so
        // state stays correct for the lines that follow.
        let lastSignificant = '';
        let lastWord = '';
        // A word reached through a dot is a PROPERTY NAME, not a keyword.
        // `box.of / g` is a division; `for (x of y) / g` is not. Without this
        // the scanner read the division as a regex, and the regex scan swallowed
        // the backtick that opened the next template — deleting a comment-shaped
        // line out of template DATA. Legal since ES5, and `.of`, `.in` and
        // `.new` are all ordinary property names.
        let lastWordIsProperty = false;
        for (let i = 0; i < line.length; i += 1) {
            const ch = line[i];
            const next2 = line.slice(i, i + 2);
            const context = stack[stack.length - 1];

            if (inBlockComment) {
                if (next2 === '*/') { inBlockComment = false; i += 1; }
                continue;
            }
            if (quote !== null) {
                if (ch === '\\') { i += 1; continue; }
                if (ch === quote) quote = null;
                continue;
            }
            if (context.kind === 'template') {
                if (ch === '\\') { i += 1; continue; }
                if (ch === '`') { stack.pop(); continue; }
                if (next2 === '${') { stack.push({ kind: 'code', braces: 0 }); i += 1; continue; }
                continue;
            }

            // code context
            if (next2 === '//') break;            // rest of the line is a comment
            if (next2 === '/*') { inBlockComment = true; i += 1; continue; }
            if (ch === '\'' || ch === '"') { quote = ch; lastSignificant = ch; lastWord = ''; lastWordIsProperty = false; continue; }
            if (ch === '`') { stack.push({ kind: 'template' }); lastSignificant = ch; lastWord = ''; lastWordIsProperty = false; continue; }
            if (ch === '{') { context.braces += 1; lastSignificant = ch; lastWord = ''; lastWordIsProperty = false; continue; }
            if (ch === '}') {
                // The } that closes a ${ } expression pops back into the
                // template it interrupted.
                if (context.braces === 0 && stack.length > 1) { stack.pop(); continue; }
                context.braces -= 1;
                lastSignificant = ch;
                lastWord = '';
                lastWordIsProperty = false;
                continue;
            }
            if (ch === '/') {
                const startsRegex = lastSignificant === ''
                    || REGEX_CAN_FOLLOW.has(lastSignificant)
                    || (!lastWordIsProperty && REGEX_CAN_FOLLOW_KEYWORD.has(lastWord));
                if (startsRegex) {
                    const consumed = skipRegexLiteral(line, i);
                    if (consumed > i) { i = consumed; lastSignificant = '/'; lastWord = ''; lastWordIsProperty = false; continue; }
                }
                lastSignificant = '/';
                lastWord = '';
                lastWordIsProperty = false;
                continue;
            }
            if (/\s/.test(ch)) continue;
            if (/[A-Za-z0-9_$]/.test(ch)) {
                if (!lastWord) lastWordIsProperty = lastSignificant === '.';
                lastWord += ch;
                lastSignificant = ch;
                continue;
            }
            lastSignificant = ch;
            lastWord = '';
            lastWordIsProperty = false;
        }

        // An unterminated plain string means the line ended mid-quote, which
        // only happens if the scanner misread something. Reset rather than
        // carry a wrong state into the rest of the file.
        if (quote !== null) quote = null;
        if (!dropped) keep.push(line);
    }
    return keep.join('\n');
}

// Consume a regex literal starting at `from` (the opening slash). Returns the
// index of its last character, or `from` when this is not a terminated regex on
// this line — a regex cannot span lines, so an unterminated one was division.
function skipRegexLiteral(line, from) {
    let inClass = false;
    // A BACKTICK outside a character class, which is the signature of a misread
    // division: the "regex" has swallowed the opening of a template literal.
    // ``/[`]/`` is an ordinary pattern and must not trip this.
    //
    // Backticks only, not quotes. `/"/g` and `/'/` are everyday regexes —
    // extension/features/subscription-groups/index.js has both on its CSV
    // escaping lines — and treating those as division desyncs the scan in the
    // other direction.
    let looseStringChar = false;
    for (let i = from + 1; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '\\') { i += 1; continue; }
        if (inClass) { if (ch === ']') inClass = false; continue; }
        if (ch === '[') { inClass = true; continue; }
        if (ch === '`') { looseStringChar = true; continue; }
        if (ch === '/') {
            let end = i;
            while (end + 1 < line.length && /[a-z]/.test(line[end + 1])) end += 1;
            // A candidate regex that swallows a backtick or a quote is almost
            // certainly a misread division.
            //
            // `of` and `in` are contextual keywords, so a variable named either
            // is legal and ordinary: `const of = 4; const q = of / g` divides,
            // and reading that `/` as a regex walks the scan into the rest of
            // the line — which is how a template opener got eaten and a
            // comment-shaped line disappeared out of template data. A real
            // regex containing a raw backtick outside a character class is
            // vanishingly rare; preferring the division reading costs at most a
            // surviving comment.
            if (looseStringChar) return from;
            return end;
        }
    }
    return from;
}

// Shrink a module only if the result still parses as the same kind of source.
function shrinkModuleBody(body, relativePath) {
    const stripped = stripSafeLineComments(body);
    if (stripped.length >= body.length) return stripCommentsByParser(body, relativePath);
    try {
        new Function(stripped);
    } catch (_) {
        console.warn('[sync-userscript] kept comments in ' + relativePath + ': stripping did not re-parse');
        return stripCommentsByParser(body, relativePath);
    }
    return stripCommentsByParser(stripped, relativePath);
}

function codeTokens(source) {
    const tokens = [];
    for (const token of acorn.tokenizer(source, { ecmaVersion: 'latest', sourceType: 'script' })) {
        tokens.push(token.type.label + '\u0000' + String(token.value));
    }
    return tokens;
}

// The scanner above keeps any comment line that carries a quote, a backtick or
// an interpolation, because it cannot be sure the line is not template data;
// about 31 KB of comments shipped that way. acorn reports exactly the comments
// the engine sees, so every one of them goes here: a whole-line comment with
// its line, a trailing one with the spaces before it, and an inline block
// comment as one space, so no two tokens can join up. The result has to
// tokenize exactly like the input or the sync stops.
function stripCommentsByParser(body, relativePath) {
    const comments = [];
    acorn.parse(body, {
        ecmaVersion: 'latest',
        sourceType: 'script',
        onComment: (block, _text, start, end) => comments.push({ block, start, end })
    });
    if (!comments.length) return body;

    let out = '';
    let cursor = 0;
    for (const comment of comments) {
        if (comment.start < cursor) continue;
        const lineStart = body.lastIndexOf('\n', comment.start - 1) + 1;
        const newline = body.indexOf('\n', comment.end);
        const lineEnd = newline === -1 ? body.length : newline;
        const wholeLine = lineStart >= cursor
            && !body.slice(lineStart, comment.start).trim()
            && !body.slice(comment.end, lineEnd).trim();
        if (wholeLine) {
            out += body.slice(cursor, lineStart);
            cursor = newline === -1 ? body.length : newline + 1;
        } else if (comment.block) {
            // A block comment that spans lines is a line terminator to
            // automatic semicolon insertion, so it has to leave one behind.
            const spansLines = /[\n\r\p{Zl}\p{Zp}]/u.test(body.slice(comment.start, comment.end));
            out += body.slice(cursor, comment.start) + (spansLines ? '\n' : ' ');
            cursor = comment.end;
        } else {
            out += body.slice(cursor, comment.start).replace(/[ \t]+$/, '');
            cursor = comment.end;
        }
    }
    out += body.slice(cursor);

    const before = codeTokens(body);
    const after = codeTokens(out);
    const at = before.findIndex((token, index) => token !== after[index]);
    if (at !== -1 || before.length !== after.length) {
        throw new Error(`Comment stripping changed the code of ${relativePath} at token ${at === -1 ? before.length : at}`);
    }
    return out;
}

// Leading indentation outside string and template literals becomes tabs, and
// blank lines and trailing spaces outside them go. A line that starts inside a
// multi-line template or string is data and is left exactly as written. The
// result must tokenize exactly like the input or the sync stops.
function reindentOutsideLiterals(source, relativePath) {
    const literalSpans = [];
    acorn.parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'script',
        onToken: (token) => {
            const label = token.type.label;
            if ((label === 'template' || label === 'invalidTemplate' || label === 'string')
                && source.slice(token.start, token.end).includes('\n')) {
                literalSpans.push([token.start, token.end]);
            }
        }
    });
    let spanIndex = 0;
    const insideLiteral = (offset) => {
        while (spanIndex < literalSpans.length && literalSpans[spanIndex][1] <= offset) spanIndex += 1;
        const span = literalSpans[spanIndex];
        return Boolean(span && span[0] < offset && offset < span[1]);
    };

    const lines = source.split('\n');
    const out = [];
    let offset = 0;
    for (const line of lines) {
        const start = offset;
        const end = offset + line.length;
        offset = end + 1;
        const startsInside = insideLiteral(start);
        const endsInside = insideLiteral(end);
        let text = endsInside ? line : line.replace(/[ \t]+$/, '');
        if (!startsInside) {
            const indent = /^ +/.exec(text);
            if (indent) {
                const width = indent[0].length;
                text = '\t'.repeat(Math.floor(width / 4)) + ' '.repeat(width % 4) + text.slice(width);
            }
            if (!text) continue;
        }
        out.push(text);
    }
    const result = out.join('\n');

    const before = codeTokens(source);
    const after = codeTokens(result);
    const at = before.findIndex((token, index) => token !== after[index]);
    if (at !== -1 || before.length !== after.length) {
        throw new Error(`Re-indenting changed the code of ${relativePath} at token ${at === -1 ? before.length : at}`);
    }
    return result;
}

function compactForUserscript(source, relativePath) {
    let out = source.replace(/\r\n/g, '\n').replace(/\s+$/, '');
    out = compactBundledCssTemplates(out, relativePath);
    out = stripCommentsByParser(out, relativePath);
    out = reindentOutsideLiterals(out, relativePath);
    return out;
}

function readText(repoRoot, relativePath) {
    const full = path.join(repoRoot, relativePath);
    if (!fs.existsSync(full)) {
        const error = new Error('Userscript source not found: ' + relativePath);
        error.modulePath = relativePath;
        throw error;
    }
    return fs.readFileSync(full, 'utf8');
}

function readExtensionVersion(repoRoot) {
    const match = readText(repoRoot, 'extension/ytkit.js').match(/const YTKIT_VERSION = '([^']+)'/);
    if (!match) throw new Error('Could not find YTKIT_VERSION in extension/ytkit.js');
    return match[1];
}

// Everything the userscript runs is read from the manifest, the generated
// runtime bootstrap and the worker's importScripts list, so a file added to
// the extension reaches the userscript without anyone listing it here.
function readBuildPlan(repoRoot = REPO_ROOT) {
    const manifest = JSON.parse(readText(repoRoot, 'extension/manifest.json'));
    const groups = manifest.content_scripts || [];
    const isLiveChatGroup = (group) => (group.matches || []).some((match) => match.includes('/live_chat'));
    const mainGroup = groups.find((group) => group.world === 'MAIN');
    const runtimeGroup = groups.find((group) => Array.isArray(group['x-ytkit-runtime-modules']));
    const startGroup = groups.find((group) => group.world !== 'MAIN' && group.run_at === 'document_start' && !isLiveChatGroup(group));
    const liveChatGroup = groups.find(isLiveChatGroup);
    if (!mainGroup || !runtimeGroup || !startGroup || !liveChatGroup) {
        throw new Error('manifest.json no longer has the four content-script groups the userscript host mirrors');
    }
    const runtimeModules = runtimeGroup['x-ytkit-runtime-modules'];
    if (runtimeModules.at(-1) !== 'ytkit.js') throw new Error('ytkit.js must stay the last runtime module');
    const firstFeature = runtimeModules.findIndex((modulePath) => modulePath.startsWith('features/'));
    const criticalFeature = 'features/download-ui/index.js';
    const foundation = [...runtimeModules.slice(0, firstFeature), criticalFeature];
    const features = runtimeModules.slice(firstFeature, -1).filter((modulePath) => modulePath !== criticalFeature);
    if (!runtimeModules.includes(criticalFeature)) throw new Error(`Runtime modules must include ${criticalFeature}`);
    if (startGroup.js?.length !== 1) throw new Error('The document_start ISOLATED group must hold exactly core/bridge-token.js');

    const background = manifest.background?.service_worker;
    const backgroundSource = readText(repoRoot, `extension/${background}`);
    const imported = /importScripts\(\s*\.\.\.\[([\s\S]*?)\]\s*\.map\(/.exec(backgroundSource);
    if (!imported) throw new Error('Could not find the importScripts list in the background worker');
    const backgroundCore = [...imported[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
    if (!backgroundCore.length) throw new Error('The background importScripts list is empty');

    const { FEATURE_SETTINGS } = require(path.join(repoRoot, 'scripts', 'generate-runtime-bootstrap.js'));
    const liveChat = liveChatGroup.js || [];
    const locales = fs.readdirSync(path.join(repoRoot, 'extension', '_locales'))
        .filter((locale) => fs.existsSync(path.join(repoRoot, 'extension', '_locales', locale, 'messages.json')))
        .sort();

    const coreFiles = unique([
        ...startGroup.js,
        ...foundation.filter((modulePath) => modulePath !== criticalFeature),
        ...backgroundCore,
        ...liveChat,
        background,
    ]).filter((modulePath) => !modulePath.startsWith('features/') || liveChat.includes(modulePath));

    return {
        manifest,
        mainWorld: mainGroup.js,
        bridgeToken: startGroup.js[0],
        earlyCss: startGroup.css || [],
        liveChat,
        liveChatCss: liveChatGroup.css || [],
        foundation,
        features,
        app: 'ytkit.js',
        background,
        backgroundCore,
        featureSettings: FEATURE_SETTINGS,
        locales,
        libraries: {
            core: coreFiles,
            features: unique([criticalFeature, ...features]),
            app: ['ytkit.js'],
        },
    };
}

function unique(list) {
    return [...new Set(list)];
}

// ISOLATED files are imported as modules by the extension, so they run
// strict here too. The background worker is a classic script and keeps its
// own mode, as do the MAIN-world scripts.
function wrapRegisteredFile(relativePath, body, strict) {
    return [
        `${REGISTRY_LOCAL}[${JSON.stringify(relativePath)}] = function (${MODULE_PARAMS}) {`,
        strict ? '\'use strict\';' : 'void 0;',
        body,
        '};'
    ].join('\n');
}

function wrapMainWorld(files, bodies) {
    const parts = [
        `${REGISTRY_LOCAL}[${JSON.stringify(MAIN_WORLD_MODULE)}] = function () {`,
        // Not a directive: the page-world scripts keep their own modes.
        'void 0;'
    ];
    files.forEach((file, index) => {
        parts.push(bodies[index], ';');
    });
    parts.push('};');
    return parts.join('\n');
}

function libraryHeader(library, version) {
    return [
        '// ==UserScript==',
        `// @name         ${library.title}`,
        '// @namespace    https://github.com/SysAdminDoc/Astra-Deck',
        `// @version      ${version}`,
        '// @description  Part of the Astra Deck YTKit userscript; loaded by YTKit.user.js through @require. Runs nothing by itself.',
        '// @author       Matthew Parker',
        '// @homepageURL  https://github.com/SysAdminDoc/Astra-Deck',
        '// @supportURL   https://github.com/SysAdminDoc/Astra-Deck/issues',
        '// @license      MIT',
        '// @grant        none',
        '// ==/UserScript==',
        '',
        '// Generated by sync-userscript.js from the extension sources in extension/.',
        '// Do not edit: change extension/ and run `node sync-userscript.js`.',
        '// Each file below is registered as a function and run later by the host in',
        '// YTKit.user.js, in the order and world the extension manifest gives it.',
    ].join('\n');
}

function buildLibrarySource(library, plan, version, repoRoot = REPO_ROOT) {
    const parts = [
        libraryHeader(library, version),
        `(function (${REGISTRY_LOCAL}) {`,
    ];
    for (const relativePath of plan.libraries[library.id]) {
        const source = readText(repoRoot, `extension/${relativePath}`);
        const body = compactForUserscript(source, `extension/${relativePath}`);
        parts.push(wrapRegisteredFile(relativePath, body, relativePath !== plan.background));
    }
    if (library.id === 'core') {
        const bodies = plan.mainWorld.map((relativePath) =>
            compactForUserscript(readText(repoRoot, `extension/${relativePath}`), `extension/${relativePath}`));
        parts.push(wrapMainWorld(plan.mainWorld, bodies));
    }
    parts.push(`})(globalThis.${REGISTRY_GLOBAL} || (globalThis.${REGISTRY_GLOBAL} = Object.create(null)));`, '');
    const text = parts.join('\n');
    acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'script' });
    return text;
}

function flattenMessages(json) {
    const flat = {};
    for (const [key, entry] of Object.entries(json)) {
        if (entry && typeof entry.message === 'string') flat[key] = entry.message;
    }
    return flat;
}

function dataUrl(repoRoot, relativePath, mime) {
    return `data:${mime};base64,${fs.readFileSync(path.join(repoRoot, 'extension', relativePath)).toString('base64')}`;
}

// The manifest as runtime.getManifest() reports it: the GitHub build's
// profile, since GitHub is where the userscript is published, and none of
// the packaging lists the userscript has no use for.
function runtimeManifest(manifest, version) {
    const out = {};
    for (const key of ['manifest_version', 'name', 'short_name', 'description', 'default_locale', 'homepage_url',
        'permissions', 'host_permissions', 'optional_host_permissions', 'minimum_chrome_version']) {
        if (manifest[key] !== undefined) out[key] = manifest[key];
    }
    out.version = version;
    out['x-ytkit-build-profile'] = 'github-full';
    out['x-ytkit-host'] = 'userscript';
    return out;
}

function buildHostData(plan, version, repoRoot = REPO_ROOT) {
    const defaultLocale = plan.manifest.default_locale || 'en';
    const messages = flattenMessages(JSON.parse(readText(repoRoot, `extension/_locales/${defaultLocale}/messages.json`)));
    const requiredModules = unique([
        plan.bridgeToken,
        ...plan.foundation,
        ...plan.features,
        plan.app,
        plan.background,
        ...plan.backgroundCore,
        ...plan.liveChat,
        MAIN_WORLD_MODULE,
    ]);
    return {
        version,
        runtimeId: RUNTIME_ID,
        menuLabel: 'Open Astra Deck settings',
        credentialMenuLabel: 'AI provider key',
        defaultLocale,
        locales: plan.locales,
        localeResourcePrefix: LOCALE_RESOURCE_PREFIX,
        manifest: runtimeManifest(plan.manifest, version),
        permissions: plan.manifest.permissions || [],
        hostPermissions: plan.manifest.host_permissions || [],
        optionalHostPermissions: plan.manifest.optional_host_permissions || [],
        featureSettings: plan.featureSettings,
        mainWorldModule: MAIN_WORLD_MODULE,
        requiredModules,
        modules: {
            bridgeToken: plan.bridgeToken,
            foundation: plan.foundation,
            features: plan.features,
            app: plan.app,
            background: plan.background,
            backgroundCore: plan.backgroundCore,
            liveChat: plan.liveChat,
            // Informational: these run inside the one mainWorldModule bundle.
            mainWorld: plan.mainWorld,
        },
        css: {
            early: plan.earlyCss.map((file) => readText(repoRoot, `extension/${file}`)).join('\n'),
            liveChat: plan.liveChatCss.map((file) => readText(repoRoot, `extension/${file}`)).join('\n'),
        },
        assets: {
            'icons/32.png': dataUrl(repoRoot, 'icons/32.png', 'image/png'),
            'assets/cat.gif': dataUrl(repoRoot, 'assets/cat.gif', 'image/gif'),
        },
        messages,
    };
}

// @connect follows the extension's host permissions: what the worker may
// reach there, GM_xmlhttpRequest may reach here. `https://*/*` (the optional
// grant for a self-hosted AI or Cobalt endpoint) becomes `*`, which makes
// Tampermonkey ask before the first request to any host not listed.
function connectHosts(manifest) {
    const hosts = [];
    for (const pattern of [...(manifest.host_permissions || []), ...(manifest.optional_host_permissions || [])]) {
        const match = /^[a-z*]+:\/\/([^/]+)\//.exec(pattern);
        if (!match) continue;
        const host = match[1].replace(/:\d+$/, '');
        if (host === '*') hosts.push('*');
        else hosts.push(host.replace(/^\*\./, ''));
    }
    const ordered = unique(hosts).filter((host) => host !== '*');
    if (hosts.includes('*')) ordered.push('*');
    return ordered;
}

function matchPatterns(manifest) {
    const runtimeGroup = manifest.content_scripts.find((group) => Array.isArray(group['x-ytkit-runtime-modules']));
    const liveChatGroup = manifest.content_scripts.find((group) => (group.matches || []).some((match) => match.includes('/live_chat')));
    const matches = unique([
        'https://youtube.com/*',
        ...runtimeGroup.matches,
        ...liveChatGroup.matches,
    ]);
    const excludes = (runtimeGroup.exclude_matches || []).filter((pattern) => !pattern.includes('/live_chat'));
    return { matches, excludes };
}

const USERSCRIPT_GRANTS = Object.freeze([
    'GM_getValue',
    'GM_setValue',
    'GM_deleteValue',
    'GM_listValues',
    'GM_addValueChangeListener',
    'GM_addStyle',
    'GM_addElement',
    'GM_xmlhttpRequest',
    'GM_download',
    'GM_openInTab',
    'GM_registerMenuCommand',
    'GM_getResourceText',
    'GM_cookie',
]);

function metaLine(key, value) {
    return `// @${key.padEnd(12)} ${value}`;
}

function buildUserscriptHeader(plan, version) {
    const { matches, excludes } = matchPatterns(plan.manifest);
    const lines = [
        '// ==UserScript==',
        metaLine('name', `YTKit v${version}`),
        metaLine('namespace', 'https://github.com/SysAdminDoc/Astra-Deck'),
        metaLine('version', version),
        metaLine('description', 'The Astra Deck YouTube extension as a userscript, with the same features, settings panel and themes. Loads its three YTKit libraries through @require, and downloads use the optional Astra Downloader companion app.'),
        metaLine('author', 'Matthew Parker'),
        metaLine('homepageURL', 'https://github.com/SysAdminDoc/Astra-Deck'),
        metaLine('supportURL', 'https://github.com/SysAdminDoc/Astra-Deck/issues'),
        metaLine('updateURL', USERSCRIPT_RAW_URL),
        metaLine('downloadURL', USERSCRIPT_RAW_URL),
        metaLine('license', 'MIT'),
        metaLine('icon', 'https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/extension/icons/128.png'),
        ...matches.map((pattern) => metaLine('match', pattern)),
        ...excludes.map((pattern) => metaLine('exclude', pattern)),
        metaLine('run-at', 'document-start'),
        metaLine('inject-into', 'content'),
        ...USERSCRIPT_GRANTS.map((grant) => metaLine('grant', grant)),
        ...connectHosts(plan.manifest).map((host) => metaLine('connect', host)),
        ...LIBRARIES.map((library) => metaLine('require', tagUrl(version, library.file))),
        ...plan.locales
            .filter((locale) => locale !== (plan.manifest.default_locale || 'en'))
            .map((locale) => metaLine('resource', `${LOCALE_RESOURCE_PREFIX}${locale} ${tagUrl(version, `extension/_locales/${locale}/messages.json`)}`)),
        '// ==/UserScript==',
    ];
    return lines.join('\n');
}

function buildUserscriptSource(plan, version, repoRoot = REPO_ROOT) {
    const host = readText(repoRoot, path.relative(repoRoot, HOST_SOURCE));
    const data = buildHostData(plan, version, repoRoot);
    const text = [
        buildUserscriptHeader(plan, version),
        '',
        '// Generated by sync-userscript.js. Do not edit: the code that runs is the',
        '// extension\'s own, packed into the @require libraries above, and the host',
        '// below (userscript/host.js) stands in for the chrome.* APIs with GM_* grants.',
        '//',
        '// localhost is deliberately not in @connect. The companion is always reached',
        '// by literal IP, and Firefox still resolves localhost through DNS, so a',
        '// hostile resolver could rebind it to an internal address and use the grant',
        '// to probe the LAN. The extension refuses it for the same reason.',
        '',
        `${BUILD_MARKER}${JSON.stringify(data, null, '\t')};`,
        '',
        host.replace(/\r\n/g, '\n').replace(/\s+$/, ''),
        '',
    ].join('\n');
    acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'script' });
    return text;
}

const BUILD_MARKER = 'const ASTRA_DECK_BUILD = ';

// The build data embedded in a generated YTKit.user.js, for gates that check
// what shipped rather than what the plan says.
function parseUserscriptBuild(text) {
    const start = String(text).indexOf(BUILD_MARKER);
    if (start === -1) throw new Error('YTKit.user.js carries no ASTRA_DECK_BUILD block');
    const end = text.indexOf(';\n', start);
    return JSON.parse(text.slice(start + BUILD_MARKER.length, end));
}

// Every file this writes, keyed by repo-relative path. check-userscript-drift
// rebuilds this and compares, so it is the single source of truth.
function buildUserscriptOutputs(repoRoot = REPO_ROOT, version = null) {
    const targetVersion = version || readExtensionVersion(repoRoot);
    const plan = readBuildPlan(repoRoot);
    const outputs = new Map();
    for (const library of LIBRARIES) {
        outputs.set(library.file, buildLibrarySource(library, plan, targetVersion, repoRoot));
    }
    outputs.set(USERSCRIPT_BASENAME, buildUserscriptSource(plan, targetVersion, repoRoot));
    for (const [file, text] of outputs) {
        const bytes = Buffer.byteLength(text, 'utf8');
        if (bytes > MAX_RECORD_BYTES) {
            throw new Error(`${file} is ${bytes} bytes, over the ${MAX_RECORD_BYTES}-byte script record limit`);
        }
    }
    return outputs;
}

function buildCoreLibrarySource(repoRoot = REPO_ROOT, version = null) {
    return buildUserscriptOutputs(repoRoot, version).get('YTKit-core.user.js');
}

// No exists-then-read: a file that vanishes between the two is a race CodeQL
// flags (js/file-system-race).
function readUtf8IfPresent(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        if (error && error.code === 'ENOENT') return null;
        throw error;
    }
}

// Writes the records that changed and returns their paths. build-extension.js
// calls this on --bump so every record carries the new version and tag URLs.
function writeUserscriptOutputs(repoRoot = REPO_ROOT, version = null, log = console.log) {
    const written = [];
    for (const [file, text] of buildUserscriptOutputs(repoRoot, version)) {
        const target = path.join(repoRoot, file);
        if (readUtf8IfPresent(target) === text) continue;
        fs.writeFileSync(target, text, 'utf8');
        written.push(file);
        log(`Wrote ${file} (${Buffer.byteLength(text, 'utf8')} bytes)`);
    }
    return written;
}

function main() {
    let written;
    try {
        written = writeUserscriptOutputs(REPO_ROOT);
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
    if (!written.length) console.log('Userscript already up to date');
}

if (require.main === module) {
    main();
}

module.exports = {
    LIBRARIES,
    MAX_RECORD_BYTES,
    USERSCRIPT_GRANTS,
    USERSCRIPT_CORE_SOURCE,
    assertCssSurvives,
    buildCoreLibrarySource,
    buildUserscriptOutputs,
    buildUserscriptHeader,
    compactBundledCssTemplates,
    compactForUserscript,
    compactStandaloneLineComments,
    connectHosts,
    coreRequireUrl,
    parseUserscriptBuild,
    readBuildPlan,
    reindentOutsideLiterals,
    shrinkModuleBody,
    stripCommentsByParser,
    stripSafeLineComments,
    tagUrl,
    writeUserscriptOutputs,
};
