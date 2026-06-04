#!/usr/bin/env node
'use strict';

// Regenerate selector fixtures from the raw mhtml/ captures.
//
// The raw MHTML files in mhtml/ are ~5 MB each and are gitignored by the
// blanket `*.mhtml` rule. The selector-regression test needs portable,
// repo-committed artifacts derived from them. This script produces one
// sorted token list per MHTML file, each one the set of distinct DOM/CSS
// identifiers our code could plausibly target (ytd-*, ytp-*, yt-*,
// html5-*, the `movie_player` element id, and a few common YT layout
// ids). It also writes selector-surface-matches.json by parsing decoded
// MHTML markup through a small DOM subset matcher for the live-chat and
// liquid-glass player-chrome selector packs. The full MHTML text is
// decoded rather than only the first HTML part because YouTube keeps some
// custom-element selector tokens in CSS parts, especially in the live-chat
// popout capture.
//
// Run after refreshing mhtml/:
//     npm run build:fixtures
//     git add tests/fixtures/*.tokens.txt
//     git commit -m "fixtures: refresh selector canary"

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.join(__dirname, '..');
const MHTML_DIR = path.join(REPO_ROOT, 'mhtml');
const FIXTURE_DIR = path.join(REPO_ROOT, 'tests', 'fixtures');
const PACKS_DIR = path.join(REPO_ROOT, 'extension', 'core', 'selector-packs');

const SOURCES = [
    { mhtml: 'YouTube.mhtml', out: 'yt-home.tokens.txt' },
    { mhtml: 'WatchPage.mhtml', out: 'yt-watch.tokens.txt' },
    { mhtml: 'LiveChat.mhtml', out: 'yt-live-chat.tokens.txt' },
];

const SURFACE_MATCH_SOURCES = [
    { surface: 'playerChrome', mhtml: 'WatchPage.mhtml', fixture: 'yt-watch.tokens.txt' },
    { surface: 'liveChat', mhtml: 'LiveChat.mhtml', fixture: 'yt-live-chat.tokens.txt' },
];

const VOID_TAGS = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
]);

// Patterns we care to canary. YouTube uses ytd-* for Polymer elements,
// ytp-* for player chrome classes, yt-* for newer attributed-string
// components, and html5-* for the media element wrapper. The `movie_player`
// element id is the canonical entry point for the player API.
const TOKEN_PATTERNS = [
    /\b(ytd-[a-z][\w-]*)/g,
    /\b(ytp-[a-z][\w-]*)/g,
    /\b(yt-[a-z][\w-]*)/g,
    /\b(html5-[a-z][\w-]*)/g,
    /\b(movie_player)\b/g,
    /\b(primary|secondary|contents|content|masthead-container|masthead)\b(?=[^a-z])/g,
];

function decodeQuotedPrintable(str) {
    return str
        .replace(/=\r?\n/g, '')
        .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
            String.fromCharCode(parseInt(hex, 16))
        );
}

function extractTokenText(mhtmlPath) {
    const raw = fs.readFileSync(mhtmlPath, 'utf8');
    if (!/Content-Type:\s*text\/(?:html|css)/i.test(raw)) {
        throw new Error(`${mhtmlPath}: no text/html or text/css part found`);
    }
    return decodeQuotedPrintable(raw);
}

function extractTokens(html) {
    const tokens = new Set();
    for (const rx of TOKEN_PATTERNS) {
        let match;
        while ((match = rx.exec(html)) !== null) {
            tokens.add(match[1]);
        }
    }
    return Array.from(tokens).sort();
}

function parseAttributes(raw = '') {
    const attrs = new Map();
    const attrRe = /([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let match;
    while ((match = attrRe.exec(raw)) !== null) {
        const name = match[1].toLowerCase();
        const value = match[2] ?? match[3] ?? match[4] ?? '';
        attrs.set(name, value);
    }
    return attrs;
}

function parseDomElements(html) {
    const elements = [];
    const stack = [];
    const tagRe = /<\/?([A-Za-z][\w-]*)([^<>]*)>/g;
    let match;

    while ((match = tagRe.exec(html)) !== null) {
        const full = match[0];
        const tag = match[1].toLowerCase();
        if (full.startsWith('</')) {
            while (stack.length) {
                const popped = stack.pop();
                if (popped.tag === tag) break;
            }
            continue;
        }

        const attrs = parseAttributes(match[2]);
        const classValue = attrs.get('class') || '';
        const element = {
            tag,
            id: attrs.get('id') || '',
            classes: new Set(classValue.split(/\s+/).filter(Boolean)),
            attrs,
            parent: stack[stack.length - 1] || null,
        };
        elements.push(element);

        if (!full.endsWith('/>') && !VOID_TAGS.has(tag)) {
            stack.push(element);
        }
    }

    return elements;
}

function splitSelectorGroups(selector) {
    const groups = [];
    let buf = '';
    let depth = 0;
    let quote = '';
    for (const ch of String(selector || '')) {
        if (quote) {
            buf += ch;
            if (ch === quote) quote = '';
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            buf += ch;
            continue;
        }
        if (ch === '[' || ch === '(') depth += 1;
        if (ch === ']' || ch === ')') depth = Math.max(0, depth - 1);
        if (ch === ',' && depth === 0) {
            if (buf.trim()) groups.push(buf.trim());
            buf = '';
            continue;
        }
        buf += ch;
    }
    if (buf.trim()) groups.push(buf.trim());
    return groups;
}

function tokenizeSelector(selector) {
    const parts = [];
    let buf = '';
    let depth = 0;
    let quote = '';
    let pendingCombinator = null;

    function pushPart() {
        const compound = buf.trim();
        if (!compound) return;
        parts.push({
            compound,
            combinator: parts.length === 0 ? null : (pendingCombinator || 'descendant'),
        });
        pendingCombinator = null;
        buf = '';
    }

    for (const ch of String(selector || '')) {
        if (quote) {
            buf += ch;
            if (ch === quote) quote = '';
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            buf += ch;
            continue;
        }
        if (ch === '[' || ch === '(') depth += 1;
        if (ch === ']' || ch === ')') depth = Math.max(0, depth - 1);

        if (depth === 0 && ch === '>') {
            pushPart();
            pendingCombinator = 'child';
            continue;
        }
        if (depth === 0 && /\s/.test(ch)) {
            pushPart();
            if (!pendingCombinator) pendingCombinator = 'descendant';
            continue;
        }
        buf += ch;
    }
    pushPart();
    return parts;
}

function stripPseudos(compound) {
    return compound.replace(/:{1,2}[A-Za-z-]+(?:\([^)]*\))?/g, '');
}

function selectorCompoundMatches(element, compound) {
    const clean = stripPseudos(compound);
    const tagMatch = clean.match(/^[A-Za-z][\w-]*/);
    if (tagMatch && element.tag !== tagMatch[0].toLowerCase()) return false;

    for (const match of clean.matchAll(/#([\w-]+)/g)) {
        if (element.id !== match[1]) return false;
    }
    for (const match of clean.matchAll(/\.([\w-]+)/g)) {
        if (!element.classes.has(match[1])) return false;
    }
    for (const match of clean.matchAll(/\[([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/g)) {
        const name = match[1].toLowerCase();
        if (!element.attrs.has(name)) return false;
        const expected = match[2] ?? match[3] ?? match[4];
        if (expected !== undefined) {
            const normalized = String(expected).replace(/^['"]|['"]$/g, '').trim();
            if (element.attrs.get(name) !== normalized) return false;
        }
    }

    return Boolean(tagMatch || clean.includes('#') || clean.includes('.') || clean.includes('['));
}

function selectorPartMatches(element, parts, idx) {
    if (!element || idx < 0) return false;
    if (!selectorCompoundMatches(element, parts[idx].compound)) return false;
    if (idx === 0) return true;

    const relation = parts[idx].combinator || 'descendant';
    if (relation === 'child') {
        return selectorPartMatches(element.parent, parts, idx - 1);
    }

    let parent = element.parent;
    while (parent) {
        if (selectorPartMatches(parent, parts, idx - 1)) return true;
        parent = parent.parent;
    }
    return false;
}

function selectorMatchCount(elements, selector) {
    let count = 0;
    for (const group of splitSelectorGroups(selector)) {
        const parts = tokenizeSelector(group);
        if (!parts.length) continue;
        for (const element of elements) {
            if (selectorPartMatches(element, parts, parts.length - 1)) {
                count += 1;
            }
        }
    }
    return count;
}

function loadSurfaceSelectorMap() {
    const ctx = {
        console,
        Date,
        Math,
        Object,
        Set,
        Map,
        globalThis: null,
        dispatchEvent() {},
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);

    const packFiles = fs.readdirSync(PACKS_DIR)
        .filter((file) => file.endsWith('.js'))
        .sort();
    const files = [
        'extension/core/registry.js',
        ...packFiles.map((file) => `extension/core/selector-packs/${file}`),
        'extension/core/selectors.js',
    ];
    for (const rel of files) {
        vm.runInContext(
            fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'),
            ctx,
            { filename: rel }
        );
    }

    return ctx.globalThis.YTKitCore.SurfaceSelectorMap;
}

function evaluateSelectorGroup(elements, selectors) {
    return selectors.map((selector) => {
        const matchCount = selectorMatchCount(elements, selector);
        return {
            selector,
            matched: matchCount > 0,
            matchCount,
        };
    });
}

function buildSurfaceMatchFixture() {
    const surfaceMap = loadSurfaceSelectorMap();
    const decodedByMhtml = new Map();
    const elementsByMhtml = new Map();
    const surfaces = {};

    for (const target of SURFACE_MATCH_SOURCES) {
        const entry = surfaceMap[target.surface];
        if (!entry) {
            throw new Error(`Selector surface "${target.surface}" is not registered`);
        }

        if (!decodedByMhtml.has(target.mhtml)) {
            const mhtmlPath = path.join(MHTML_DIR, target.mhtml);
            decodedByMhtml.set(target.mhtml, extractTokenText(mhtmlPath));
            elementsByMhtml.set(target.mhtml, parseDomElements(decodedByMhtml.get(target.mhtml)));
        }
        const elements = elementsByMhtml.get(target.mhtml);
        const stable = evaluateSelectorGroup(elements, [...entry.stable]);
        const fallback = evaluateSelectorGroup(elements, [...entry.fallback]);
        const all = [...stable, ...fallback];

        surfaces[target.surface] = {
            source: `mhtml/${target.mhtml}`,
            fixture: target.fixture,
            elementCount: elements.length,
            stable,
            fallback,
            matchedSelectors: all.filter((item) => item.matched).map((item) => item.selector),
        };
    }

    return {
        schemaVersion: 1,
        generatedBy: 'scripts/build-selector-fixtures.js',
        matcher: 'decoded-mhtml-dom-subset',
        surfaces,
    };
}

function main() {
    if (!fs.existsSync(MHTML_DIR)) {
        console.error(`[build-selector-fixtures] mhtml/ not found at ${MHTML_DIR}`);
        console.error('  The raw *.mhtml captures are gitignored; save them locally first.');
        process.exit(1);
    }
    if (!fs.existsSync(FIXTURE_DIR)) {
        fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    }

    for (const { mhtml, out } of SOURCES) {
        const mhtmlPath = path.join(MHTML_DIR, mhtml);
        if (!fs.existsSync(mhtmlPath)) {
            console.error(`[build-selector-fixtures] missing: ${mhtmlPath}`);
            process.exit(1);
        }
        const fixtureText = extractTokenText(mhtmlPath);
        const tokens = extractTokens(fixtureText);
        const outPath = path.join(FIXTURE_DIR, out);
        const header = [
            '# Selector-regression canary fixture.',
            `# Source: mhtml/${mhtml}`,
            '# Regenerated via: npm run build:fixtures',
            `# Captured tokens: ${tokens.length}`,
            '# Encoding: one token per line, sorted.',
            '',
        ].join('\n');
        fs.writeFileSync(outPath, header + tokens.join('\n') + '\n', 'utf8');
        console.log(`[build-selector-fixtures] wrote ${tokens.length} tokens → ${path.relative(REPO_ROOT, outPath)}`);
    }

    const matchFixture = buildSurfaceMatchFixture();
    const matchOutPath = path.join(FIXTURE_DIR, 'selector-surface-matches.json');
    fs.writeFileSync(matchOutPath, `${JSON.stringify(matchFixture, null, 2)}\n`, 'utf8');
    console.log(`[build-selector-fixtures] wrote selector matches → ${path.relative(REPO_ROOT, matchOutPath)}`);
}

if (require.main === module) {
    try {
        main();
    } catch (e) {
        console.error('[build-selector-fixtures]', e);
        process.exit(1);
    }
}

module.exports = {
    buildSurfaceMatchFixture,
    decodeQuotedPrintable,
    extractTokens,
    parseDomElements,
    selectorMatchCount,
};
