#!/usr/bin/env node
'use strict';

const fs = require('fs');
const acorn = require('acorn');
const path = require('path');
const { getUserscriptBasename, resolveUserscriptPath } = require('./scripts/repo-paths');

const REPO_ROOT = __dirname;
const EXTENSION_SOURCE = path.join(REPO_ROOT, 'extension', 'ytkit.js');
const USERSCRIPT_SOURCE = resolveUserscriptPath(REPO_ROOT);
const USERSCRIPT_BASENAME = getUserscriptBasename(REPO_ROOT);
const USERSCRIPT_RAW_URL = `https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/${USERSCRIPT_BASENAME}`;
const USERSCRIPT_CORE_SOURCE = path.join(REPO_ROOT, 'YTKit-core.user.js');
// The @require target. Pinned to the release TAG, not to `main`.
//
// Until v4.88.3 this pointed at `main`, so every userscript install pulled
// 1.9 MB of executable code from a mutable branch pointer — in a script that
// also grants GM_xmlhttpRequest to OpenAI, Anthropic, Gemini and loopback.
// Anything able to move `main` moved every install at once, with no version
// to notice it by. A tag is immutable once pushed, so a given @version always
// requires the same bytes and the release advances both together.
//
// ASTRA_GREASY_FORK_CORE_URL still overrides for a Greasy Fork or mirrored host.
const CORE_URL_BASE = 'https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck';

function coreRequireUrl(version) {
    if (process.env.ASTRA_GREASY_FORK_CORE_URL) return process.env.ASTRA_GREASY_FORK_CORE_URL;
    return `${CORE_URL_BASE}/refs/tags/v${version}/YTKit-core.user.js`;
}
const CORE_BEGIN_MARKER = '// ── BEGIN v5.0.0 bundled core modules ──';
const CORE_END_MARKER = '// ── END v5.0.0 bundled core modules ──';
const EXTERNAL_BUNDLE_BEGIN_RE = /^[ \t]*\/\/ ── BEGIN v5\.0\.0 bundled core modules ──\r?\n[\s\S]*?^[ \t]*\/\/ ── END v5\.0\.0 bundled core modules ──/m;

// v4.20.0: keep the v5.0.0 core modules in the userscript distribution so the
// userscript path reaches feature parity with the MV3 extension. Each listed
// module is an IIFE that attaches to globalThis.YTKitCore or
// globalThis.YTKitFeatures — safe to concatenate in this order. The main
// artifact carries an ordered dependency manifest; executable bodies are
// generated into YTKit-core.user.js, a separate Greasy Fork library record.
// If a manifest feature cannot ship in the userscript, classify the feature ID
// in scripts/check-userscript-drift.js instead of leaving silent parity drift.
const V5_BUNDLE_MODULES = [
    'extension/core/regex-safety.js',
    'extension/core/styles.js',
    'extension/core/trusted-html.js',
    'extension/core/settings-visual-system.js',
    'extension/core/settings-schema.js',
    'extension/core/injection-guard.js',
    'extension/core/feature-lifecycle.js',
    'extension/core/policy-profile.js',
    'extension/core/settings-controller.js',
    // Bundled so the monolith settingsManager can run imports through the same
    // snapshot/rollback/undo transaction the extension uses, instead of
    // carrying a second implementation. Pure JS, no chrome.* and no DOM.
    // NOTE: no apostrophes in comments inside this array — check-userscript-drift.js
    // scans it with a bare quote regex and one stray quote truncates the list.
    'extension/core/settings-import-transaction.js',
    // Bundled so the userscript filters an authenticated cookie handoff
    // through the SAME reviewed contract the extension uses (four yt-dlp
    // auth cookie names, domain/path/Secure/size validation) instead of
    // posting the whole YouTube jar. Pure JS, no chrome.* and no DOM.
    'extension/core/cookie-handoff.js',
    'extension/core/transcript-service.js',
    'extension/core/transcript-index.js',
    'extension/core/ai-summary-artifacts.js',
    'extension/core/credential-vault.js',
    'extension/core/local-ai.js',
    'extension/core/userscript-ai-summary.js',
    'extension/core/external-api-health.js',
    'extension/core/selector-health.js',
    'extension/core/feature-health.js',
    'extension/core/chapters.js',
    'extension/core/csv.js',
    'extension/core/dialog-guard.js',
    'extension/core/zero-ad-dom.js',
    'extension/core/element-zapper.js',
    'extension/features/element-zapper/index.js',
    'extension/core/hide-attribution.js',
    'extension/core/heatmap.js',
    'extension/core/youtube-thumbnails.js',
    'extension/core/feature-schedule.js',
    'extension/core/feed-prefilter.js',
    'extension/core/companion-ports.js',
    'extension/core/data-flow.js',
    'extension/core/toast.js',
    'extension/core/toast-dom.js',
    'extension/core/navigation.js',
    'extension/core/player.js',
    'extension/core/resource-unlock.js',
    'extension/core/text-metrics.js',
    'extension/core/date-time.js',
    'extension/core/failure-copy.js',
    'extension/core/runtime-flags.js',
    'extension/core/capability-probe.js',
    'extension/features/subtitles/index.js',
    'extension/features/video-filters/index.js',
    'extension/features/blue-light-filter/index.js',
    'extension/features/theme-css/index.js',
    'extension/features/wave-8-css/index.js',
    'extension/features/home-subs-css/index.js',
    'extension/features/chat-style-comments/index.js',
    'extension/features/sticky-video-styles/index.js',
    'extension/features/sticky-video/index.js',
    'extension/features/sticky-chat/index.js',
    'extension/features/video-hider/index.js',
    'extension/features/video-notes/index.js',
    'extension/features/subscription-groups/index.js',
    'extension/features/digital-wellbeing/index.js',
    'extension/features/settings-panel/index.js',
    'extension/features/player-dock/index.js',
    'extension/features/youtube-music-compat/index.js',
    'extension/features/return-dislike/index.js',
    'extension/features/sponsorblock/index.js',
    'extension/features/dearrow/index.js',
    'extension/core/lifecycle-route-bridge.js'
];

const BUNDLE_BEGIN_RE = /^[ \t]*\/\/ ── BEGIN v5\.0\.0 bundled core modules ──\r?\n[\s\S]*?^[ \t]*\/\/ ── END v5\.0\.0 bundled core modules ──/m;

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
// Checked on the compacted text, so prose in a CSS comment cannot trip it.
const NOT_CSS = /=>|\bfunction\b|\breturn\b|\b(?:const|let|var)\s|<[a-zA-Z/!]/;
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

// Every selector and `property: value` pair in `before` must still be present
// in `after`, compared with only the whitespace compaction is allowed to drop
// normalised away. This is deliberately not built on compactCssWhitespace's own
// masking: the v4.90.0 comment-apostrophe bug lived in that masking and deleted
// 183 declarations, and a check sharing the code would have shared the bug.
function cssSegments(text) {
    return new Set(text.replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split(/[{};]/)
        .map((segment) => segment.replace(/\s+/g, ' ')
            .replace(/\s*,\s*/g, ',')
            .replace(/:\s+/g, ':')
            .replace(/\s+!important/g, '!important')
            .trim())
        .filter(Boolean));
}

function assertCssSurvives(before, after, where) {
    const kept = cssSegments(after);
    const lost = [...cssSegments(before)].filter((segment) => !kept.has(segment));
    if (lost.length) {
        throw new Error(`CSS compaction lost ${lost.length} rule fragment(s) in ${where}: `
            + lost.slice(0, 3).map((segment) => JSON.stringify(segment)).join(', '));
    }
}

/**
 * Compact every CSS-shaped template literal in `source`, whatever module it
 * came from. A template is left exactly as written unless all of these hold:
 *   - it is untagged, and its static text has a braced `property: value;`;
 *   - its static text has no backslash, which keeps escapes and regex sources
 *     out of reach, and none of the control characters used as markers here;
 *   - the compacted text shows none of the markers of JavaScript or HTML;
 *   - every interpolation comes back out in order (one inside a CSS comment
 *     would be dropped with the comment, so that template is skipped).
 * A template that passes all of that and still loses a rule fragment is a bug
 * in the compactor, and the build stops rather than ship the smaller file.
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

        const compacted = compactCssWhitespace(staticText);
        if (NOT_CSS.test(compacted)) continue;
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
    if (stripped.length >= body.length) return body;
    try {
        new Function(stripped);
    } catch (_) {
        console.warn('[sync-userscript] kept comments in ' + relativePath + ': stripping did not re-parse');
        return body;
    }
    return stripped;
}

function bundledModuleHeader(rel) {
    return '    // ── bundled module: ' + rel + ' ──';
}

function coreModuleHeader(rel) {
    const index = V5_BUNDLE_MODULES.indexOf(rel);
    if (index < 0) throw new Error('Unknown core module: ' + rel);
    return '//m:' + index.toString(36);
}

function buildExternalBundleRegion() {
    const parts = [
        '    ' + CORE_BEGIN_MARKER,
        '    // The v5.0.0 modules are delivered by the configured @require dependency.',
        '    // This manifest keeps the dependency order visible in the main artifact;',
        '    // the generated YTKit-core.user.js contains the executable module bodies.',
        ''
    ];
    for (const rel of V5_BUNDLE_MODULES) parts.push(bundledModuleHeader(rel));
    parts.push('', '    ' + CORE_END_MARKER);
    return parts.join('\n');
}

// Build the bundled-module region exactly as the userscript must contain it.
// check-userscript-drift.js recomputes this and compares it against the
// shipped bundle, so this function is the single source of truth for the
// transform. A fingerprint-substring check cannot see a stale module body —
// v4.51.2's settings-schema shipped stale through three releases that way.
function buildBundleRegion(repoRoot = REPO_ROOT) {
    // Keep the historical function name as the main-artifact contract. The
    // executable bodies now live in the separately published library below;
    // the main file retains an ordered manifest so stale dependency changes
    // remain visible without paying for a second copy of the code.
    void repoRoot;
    return buildExternalBundleRegion();
}

function buildCoreLibrarySource(repoRoot = REPO_ROOT, version = null) {
    const extensionText = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
    const versionMatch = extensionText.match(/const YTKIT_VERSION = '([^']+)'/);
    if (!versionMatch && !version) {
        throw new Error('Could not find YTKIT_VERSION while building the userscript core library');
    }
    const targetVersion = version || versionMatch[1];
    const parts = [
        '// ==UserScript==',
        '// @name         Astra Deck YTKit Core Library',
        '// @namespace    https://github.com/SysAdminDoc/Astra-Deck',
        `// @version      ${targetVersion}`,
        '// @description  Shared Astra Deck userscript runtime dependency; loaded by YTKit.user.js',
        '// @author       Matthew Parker',
        '// @homepageURL  https://github.com/SysAdminDoc/Astra-Deck',
        '// @supportURL    https://github.com/SysAdminDoc/Astra-Deck/issues',
        '// @license      MIT',
        '// @grant         none',
        '// @run-at        document-start',
        '// ==/UserScript==',
        '',
        CORE_BEGIN_MARKER,
        '// Generated by sync-userscript.js.',
        ''
    ];
    for (const rel of V5_BUNDLE_MODULES) {
        const full = path.join(repoRoot, rel);
        if (!fs.existsSync(full)) {
            const error = new Error('Module not found: ' + rel);
            error.modulePath = rel;
            throw error;
        }
        const moduleBody = shrinkModuleBody(compactStandaloneLineComments(
            compactBundledCssTemplates(
                fs.readFileSync(full, 'utf8').replace(/\s+$/, ''),
                rel
            ),
            rel
        ), rel);
        // A module containing either bundle marker would truncate the region
        // the next sync run's regex matches, silently corrupting the
        // userscript. Refuse to bundle rather than write a poisoned bundle.
        if (/── (?:BEGIN|END) v5\.0\.0 bundled core modules ──/.test(moduleBody)) {
            const error = new Error('Refusing to bundle ' + rel + ': module source contains a v5.0.0 bundle marker, which would corrupt the next sync run.');
            error.modulePath = rel;
            throw error;
        }
        parts.push(coreModuleHeader(rel));
        parts.push(moduleBody);
    }
    parts.push(CORE_END_MARKER, '');
    return parts.join('\n');
}

function upsertMetadataLine(headerText, key, value) {
    const line = `// @${key}      ${value}`;
    const re = new RegExp(`^// @${key}\\s+.*$`, 'm');
    if (re.test(headerText)) return headerText.replace(re, line);
    return headerText.replace(/^\/\/ ==\/UserScript==$/m, `${line}\n// ==/UserScript==`);
}

function main() {
    const extensionText = fs.readFileSync(EXTENSION_SOURCE, 'utf8');
    const versionMatch = extensionText.match(/const YTKIT_VERSION = '([^']+)'/);
    if (!versionMatch) {
        console.error('Could not find YTKIT_VERSION in extension/ytkit.js');
        process.exit(1);
    }

    const targetVersion = versionMatch[1];
    let userscriptText = fs.readFileSync(USERSCRIPT_SOURCE, 'utf8');
    const before = userscriptText;

    const headerEnd = userscriptText.indexOf('// ==/UserScript==');
    if (headerEnd === -1) {
        console.error('Could not find userscript metadata header terminator');
        process.exit(1);
    }
    const headerCloseEnd = headerEnd + '// ==/UserScript=='.length;
    let headerText = userscriptText.slice(0, headerCloseEnd);
    const bodyText = userscriptText.slice(headerCloseEnd);
    headerText = headerText.replace(/^(\/\/ @name\s+)YTKit v[\d.]+/m,
        (_match, prefix) => `${prefix}YTKit v${targetVersion}`);
    headerText = headerText.replace(/^(\/\/ @version\s+)[\d.]+/m,
        (_match, prefix) => `${prefix}${targetVersion}`);
    headerText = headerText.replace(/^(\/\/ @updateURL\s+).+$/m,
        (_match, prefix) => `${prefix}${USERSCRIPT_RAW_URL}`);
    headerText = headerText.replace(/^(\/\/ @downloadURL\s+).+$/m,
        (_match, prefix) => `${prefix}${USERSCRIPT_RAW_URL}`);
    headerText = upsertMetadataLine(headerText, 'require', coreRequireUrl(targetVersion));
    for (const [key, value] of [
        ['homepageURL', 'https://github.com/SysAdminDoc/Astra-Deck'],
        ['supportURL', 'https://github.com/SysAdminDoc/Astra-Deck/issues'],
        ['license', 'MIT'],
        ['icon', 'https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/extension/icons/128.png'],
    ]) {
        headerText = upsertMetadataLine(headerText, key, value);
    }
    headerText = headerText.replace(/^(\/\/ @description\s+).*$/m,
        '$1YouTube customization with filtering, playback, accessibility, and research tools; requires the Astra Deck YTKit Core Library and optionally uses the Astra Downloader companion');
    userscriptText = headerText + bodyText;
    userscriptText = userscriptText.replace(/const YTKIT_VERSION = '[^']+';/,
        () => `const YTKIT_VERSION = '${targetVersion}';`);


    if (BUNDLE_BEGIN_RE.test(userscriptText)) {
        let bundleRegion;
        try {
            bundleRegion = buildBundleRegion(REPO_ROOT);
        } catch (error) {
            console.error(error.message);
            process.exit(1);
        }
        userscriptText = userscriptText.replace(BUNDLE_BEGIN_RE, () => bundleRegion);
    } else if (!EXTERNAL_BUNDLE_BEGIN_RE.test(userscriptText)) {
        // Fail loudly: this tool's whole job is refreshing the bundle region, so
        // silently rewriting only the header and reporting success let a stale
        // bundle reach packaging with a green run.
        console.error('Userscript bundle markers not found — cannot refresh the bundle region.');
        process.exit(1);
    }

    let coreLibraryText;
    try {
        coreLibraryText = buildCoreLibrarySource(REPO_ROOT, targetVersion);
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
    const previousCore = fs.existsSync(USERSCRIPT_CORE_SOURCE)
        ? fs.readFileSync(USERSCRIPT_CORE_SOURCE, 'utf8')
        : null;
    if (previousCore !== coreLibraryText) {
        fs.writeFileSync(USERSCRIPT_CORE_SOURCE, coreLibraryText, 'utf8');
        console.log(`Userscript core library synced to v${targetVersion} (${path.basename(USERSCRIPT_CORE_SOURCE)})`);
    }

    if (userscriptText === before) {
        console.log(`Userscript already aligned to v${targetVersion}`);
        process.exit(0);
    }

    fs.writeFileSync(USERSCRIPT_SOURCE, userscriptText, 'utf8');
    console.log(`Userscript metadata synced to v${targetVersion} (${path.basename(USERSCRIPT_SOURCE)})`);
}

if (require.main === module) {
    main();
}

module.exports = {
    V5_BUNDLE_MODULES,
    buildBundleRegion,
    buildCoreLibrarySource,
    assertCssSurvives,
    compactBundledCssTemplates,
    compactStandaloneLineComments,
    stripSafeLineComments,
    shrinkModuleBody,
    bundledModuleHeader,
    coreModuleHeader,
    BUNDLE_BEGIN_RE,
    EXTERNAL_BUNDLE_BEGIN_RE,
    USERSCRIPT_CORE_SOURCE,
    coreRequireUrl,
};
