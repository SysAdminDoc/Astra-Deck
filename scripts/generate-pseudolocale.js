#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const EN_MESSAGES = path.join(REPO_ROOT, 'extension', '_locales', 'en', 'messages.json');
const OUTPUT_PATH = path.join(REPO_ROOT, 'build', 'i18n-pseudolocale', 'messages.json');
const TOKEN_RE = /(\{[A-Za-z0-9_]+\}|__MSG_[A-Za-z0-9_]+__|\$[A-Za-z0-9_@]+\$)/g;
const ACCENTS = Object.freeze({
    a: 'à', b: 'ƀ', c: 'ç', d: 'ð', e: 'ë', f: 'ƒ', g: 'ğ', h: 'ħ', i: 'ï',
    j: 'ĵ', k: 'ķ', l: 'ľ', m: 'ɱ', n: 'ñ', o: 'ô', p: 'þ', q: 'ʠ', r: 'ř',
    s: 'š', t: 'ŧ', u: 'ü', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ÿ', z: 'ž'
});

function expandText(text) {
    let transformed = '';
    for (const char of text) {
        const lower = char.toLowerCase();
        const mapped = ACCENTS[lower];
        if (!mapped) transformed += char;
        else transformed += char === lower ? mapped : mapped.toUpperCase();
    }
    // Two characters per repeat, so 0.2 gives roughly the 40% expansion the
    // reflow lane is meant to exercise — the rule of thumb for how much longer
    // a translation of English runs in the worst case.
    const padding = ' ~'.repeat(Math.max(1, Math.ceil(text.length * 0.2)));
    return transformed + padding;
}

function pseudolocalizeMessage(message) {
    const parts = String(message || '').split(TOKEN_RE);
    const body = parts.map((part) => {
        if (!part) return '';
        TOKEN_RE.lastIndex = 0;
        return TOKEN_RE.test(part) ? `\u2068${part}\u2069` : expandText(part);
    }).join('');
    return `\u2067⟦${body}⟧\u2069`;
}

function generatePseudolocale(messages) {
    return Object.fromEntries(Object.entries(messages).map(([key, entry]) => [key, {
        ...entry,
        message: pseudolocalizeMessage(entry?.message)
    }]));
}

function main(argv = process.argv.slice(2)) {
    let outputPath = OUTPUT_PATH;
    if (argv.length) {
        if (argv.length !== 2 || argv[0] !== '--output') throw new Error('Usage: generate-pseudolocale.js [--output <path>]');
        outputPath = path.resolve(argv[1]);
    }
    const messages = JSON.parse(fs.readFileSync(EN_MESSAGES, 'utf8'));
    const pseudo = generatePseudolocale(messages);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(pseudo, null, 2)}\n`, 'utf8');
    console.log(`[generate-pseudolocale] wrote ${path.relative(REPO_ROOT, outputPath).split(path.sep).join('/')} (${Object.keys(pseudo).length} keys, not packaged)`);
}

if (require.main === module) {
    try { main(); } catch (error) {
        console.error('[generate-pseudolocale]', error.message || error);
        process.exitCode = 1;
    }
}

module.exports = { generatePseudolocale, pseudolocalizeMessage };
