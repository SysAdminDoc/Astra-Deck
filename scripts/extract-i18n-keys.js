#!/usr/bin/env node
'use strict';

// Extract every t('key', 'fallback') / t('key', `tpl`) reference from
// extension/ytkit.js + extension/popup.js so _locales/en/messages.json
// can be rebuilt mechanically. Uses a tokenizer rather than a single
// big regex to avoid greedy matching across multiple t() calls.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = [
    path.join(ROOT, 'extension', 'ytkit.js'),
    path.join(ROOT, 'extension', 'popup.js'),
];

const keys = new Map();

function decodeSingleQuotedFallback(raw) {
    let out = '';
    for (let i = 0; i < raw.length; i += 1) {
        const ch = raw[i];
        if (ch !== '\\' || i === raw.length - 1) {
            out += ch;
            continue;
        }
        const next = raw[i + 1];
        if (next === 'n') out += '\n';
        else if (next === "'" || next === '\\') out += next;
        else {
            out += ch;
            out += next;
        }
        i += 1;
    }
    return out;
}

function findKeyAndFallback(src) {
    // Walk char-by-char, find each `t(` followed by a quoted key + comma + quoted fallback.
    let i = 0;
    while (i < src.length) {
        const tIdx = src.indexOf("t('", i);
        if (tIdx < 0) break;
        // Require word-boundary before t (don't match `let t(`, `function t(`, etc.).
        const prev = tIdx === 0 ? '' : src[tIdx - 1];
        if (/[A-Za-z0-9_$]/.test(prev)) { i = tIdx + 1; continue; }

        // Parse key: t('KEY'
        let p = tIdx + 3;
        const keyStart = p;
        while (p < src.length && /[\w]/.test(src[p])) p++;
        const key = src.slice(keyStart, p);
        if (!key) { i = tIdx + 1; continue; }
        if (src[p] !== "'") { i = tIdx + 1; continue; }
        p++; // past closing key quote

        // Skip whitespace, comma, whitespace
        while (p < src.length && /\s/.test(src[p])) p++;
        if (src[p] !== ',') { i = tIdx + 1; continue; }
        p++;
        while (p < src.length && /\s/.test(src[p])) p++;

        // Parse fallback: either '...' or `...`
        let fallback = null;
        if (src[p] === "'") {
            p++;
            const start = p;
            while (p < src.length) {
                if (src[p] === '\\') { p += 2; continue; }
                if (src[p] === "'") break;
                p++;
            }
            fallback = decodeSingleQuotedFallback(src.slice(start, p));
            p++;
        } else if (src[p] === '`') {
            p++;
            const start = p;
            let depth = 0;
            while (p < src.length) {
                if (src[p] === '\\') { p += 2; continue; }
                if (src[p] === '$' && src[p + 1] === '{') { depth++; p += 2; continue; }
                if (depth > 0 && src[p] === '}') { depth--; p++; continue; }
                if (depth === 0 && src[p] === '`') break;
                p++;
            }
            fallback = src.slice(start, p);
            // Strip ${...} interpolation — caller is responsible for replacing
            // {placeholder} markers if they need runtime values.
            fallback = fallback.replace(/\$\{[^}]*\}/g, '…');
        } else {
            i = p;
            continue;
        }

        if (key && !keys.has(key)) keys.set(key, fallback);
        i = p + 1;
    }
}

for (const file of FILES) {
    const src = fs.readFileSync(file, 'utf8');
    findKeyAndFallback(src);
}

// HTML pass: data-i18n="key" / data-i18n-attr-X="key" attributes in popup.html.
// Use the element's textContent (or attribute value) as the English fallback.
const HTML_FILES = [path.join(ROOT, 'extension', 'popup.html')];
for (const file of HTML_FILES) {
    let src;
    try { src = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
    // data-i18n="key": pull next textContent up to closing tag (best-effort,
    // ignoring nested elements — close enough for our markup).
    const reTextKey = /data-i18n="([a-zA-Z_][\w]*)"[^>]*>([^<]*)/g;
    let m;
    while ((m = reTextKey.exec(src))) {
        const k = m[1];
        const txt = m[2].trim();
        if (k && txt && !keys.has(k)) keys.set(k, txt);
    }
    // data-i18n-attr-X="key" with sibling X="value" — match the value of the
    // named attribute that actually carries the English fallback.
    const reAttrKey = /data-i18n-attr-([a-z-]+)="([a-zA-Z_][\w]*)"[^>]*\b\1="([^"]*)"/g;
    while ((m = reAttrKey.exec(src))) {
        const k = m[2];
        const v = m[3].trim();
        if (k && v && !keys.has(k)) keys.set(k, v);
    }
    // Also catch the reverse order: attribute first, then data-i18n-attr-X.
    const reAttrKey2 = /\b([a-z-]+)="([^"]*)"[^>]*data-i18n-attr-\1="([a-zA-Z_][\w]*)"/g;
    while ((m = reAttrKey2.exec(src))) {
        const k = m[3];
        const v = m[2].trim();
        if (k && v && !keys.has(k)) keys.set(k, v);
    }
    // Title elements (data-i18n on <title>): textContent regex above catches it.
}

const out = {};
for (const [k, v] of [...keys.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    out[k] = { message: v };
}
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
