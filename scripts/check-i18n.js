#!/usr/bin/env node
'use strict';

// Build-time i18n consistency checker.
//
// Validates:
//
// 1. __MSG_key__ references in manifest.json have a matching key in
//    extension/_locales/en/messages.json.
//
// 2. Every chrome.i18n.getMessage("key") / chrome.i18n.getMessage('key')
//    call found in any JS source file under extension/ has a matching key in
//    extension/_locales/en/messages.json.
//
// 3. Feature names/descriptions extracted from extension/ytkit.js match the
//    canonical feature_*_{name,desc} messages in the English catalogue.
//
// Migration of existing hardcoded English remains incremental, but
// check-localizable-ui-copy.js fingerprints that debt so newly added literals
// at rendered UI sinks must route through t()/data-i18n. This script validates
// that every locale reference resolves and every locale has structural parity.
//
// Exit 0: all checks pass.
// Exit 1: at least one missing key found.

const fs = require('fs');
const path = require('path');
const {
    extractFeatureCopyFromSource,
    normalizeFeatureCopy
} = require('./catalog-utils');

const REPO_ROOT = path.join(__dirname, '..');
const MESSAGES_PATH = path.join(REPO_ROOT, 'extension', '_locales', 'en', 'messages.json');
const LOCALES_DIR = path.join(REPO_ROOT, 'extension', '_locales');
const MANIFEST_PATH = path.join(REPO_ROOT, 'extension', 'manifest.json');
const EXTENSION_DIR = path.join(REPO_ROOT, 'extension');

// JS files under extension/ to scan for chrome.i18n.getMessage() calls.
// Excludes node_modules and build output. Add new top-level files here when
// they're introduced; core/ subdirectory is included via directory walk below.
const JS_SCAN_ROOTS = [EXTENSION_DIR];
const JS_EXTENSIONS = new Set(['.js']);

function loadMessages() {
    try {
        const raw = fs.readFileSync(MESSAGES_PATH, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.error(`[check-i18n] Cannot read ${MESSAGES_PATH}: ${err.message}`);
        process.exit(2);
    }
}

function collectJsFiles(dir, collected = []) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return collected; }
    for (const entry of entries) {
        // Skip dotfiles, node_modules, and build output
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectJsFiles(fullPath, collected);
        } else if (entry.isFile() && JS_EXTENSIONS.has(path.extname(entry.name))) {
            collected.push(fullPath);
        }
    }
    return collected;
}

// Match both single- and double-quoted key literals in getMessage() calls.
// Deliberately conservative — only literal string keys, not variable references.
const GET_MESSAGE_RE = /chrome\.i18n\.getMessage\(\s*(['"])([^'"]+)\1/g;

function findGetMessageKeys(src) {
    const keys = [];
    let m;
    GET_MESSAGE_RE.lastIndex = 0;
    while ((m = GET_MESSAGE_RE.exec(src)) !== null) {
        keys.push(m[2]);
    }
    return keys;
}

// Match __MSG_key__ placeholders in any string value in the manifest.
const MSG_PLACEHOLDER_RE = /__MSG_([A-Za-z0-9_]+)__/g;

function findManifestMsgKeys(manifestText) {
    const keys = [];
    let m;
    MSG_PLACEHOLDER_RE.lastIndex = 0;
    while ((m = MSG_PLACEHOLDER_RE.exec(manifestText)) !== null) {
        keys.push(m[1]);
    }
    return keys;
}

// Match t('key', …) / t("key", …) call sites. The fallback argument is a
// template literal in most call sites, so the call is not parsed — instead the
// window between this key and the next t( call (bounded) is scanned for the
// chained .replace('{token}', …) calls that belong to it.
const T_CALL_RE = /\bt\(\s*(['"])([A-Za-z0-9_]+)\1/g;
const REPLACE_TOKEN_RE = /\.replace\(\s*(['"])\{([A-Za-z0-9_]+)\}\1/g;
const REPLACE_WINDOW = 600;
const FEATURE_COPY_KEY_RE = /^feature_[A-Za-z0-9_]+_(?:name|desc)$/;

function findReplaceTokenUsages(src) {
    const usages = [];
    const starts = [];
    let m;
    T_CALL_RE.lastIndex = 0;
    while ((m = T_CALL_RE.exec(src)) !== null) starts.push({ key: m[2], index: m.index });

    for (let i = 0; i < starts.length; i += 1) {
        const { key, index } = starts[i];
        const nextCall = i + 1 < starts.length ? starts[i + 1].index : src.length;
        // A trailing `;` closes the statement the substitutions belong to.
        const semicolon = src.indexOf(';', index);
        const end = Math.min(
            nextCall,
            semicolon === -1 ? src.length : semicolon,
            index + REPLACE_WINDOW,
            src.length
        );
        const window = src.slice(index, end);
        const tokens = [];
        let r;
        REPLACE_TOKEN_RE.lastIndex = 0;
        while ((r = REPLACE_TOKEN_RE.exec(window)) !== null) tokens.push(r[2]);
        if (tokens.length) usages.push({ key, tokens });
    }
    return usages;
}

function findFeatureCopyDrifts(messages, source) {
    const { copies, conflicts } = extractFeatureCopyFromSource(source);
    const findings = conflicts.map((conflict) => ({
        type: 'conflict',
        key: conflict.key,
        first: conflict.first.value,
        second: conflict.second.value
    }));

    for (const [key, copy] of Object.entries(copies)) {
        if (!FEATURE_COPY_KEY_RE.test(key)) continue;
        const catalog = messages[key]?.message;
        if (typeof catalog !== 'string') {
            findings.push({ type: 'missing', key, inline: copy.value });
        } else if (normalizeFeatureCopy(catalog) !== normalizeFeatureCopy(copy.value)) {
            findings.push({
                type: 'drift',
                key,
                catalog,
                inline: copy.value
            });
        }
    }
    return findings;
}

function main() {
    const messages = loadMessages();
    const definedKeys = new Set(Object.keys(messages));
    const errors = [];

    // ── 0. Validate feature names/descriptions against the EN catalogue ──
    let ytkitSource;
    try { ytkitSource = fs.readFileSync(path.join(EXTENSION_DIR, 'ytkit.js'), 'utf8'); } catch (err) {
        console.error('[check-i18n] Cannot read extension/ytkit.js: ' + err.message);
        process.exit(2);
    }
    for (const finding of findFeatureCopyDrifts(messages, ytkitSource)) {
        if (finding.type === 'missing') {
            errors.push('extension/_locales/en/messages.json: missing feature copy key "' + finding.key + '" for inline value ' + JSON.stringify(finding.inline));
        } else if (finding.type === 'drift') {
            errors.push('extension/_locales/en/messages.json: "' + finding.key + '" differs from extension/ytkit.js inline copy (catalog=' + JSON.stringify(finding.catalog) + '; inline=' + JSON.stringify(finding.inline) + ')');
        } else {
            errors.push('extension/ytkit.js: conflicting inline values for "' + finding.key + '" (' + JSON.stringify(finding.first) + ' vs ' + JSON.stringify(finding.second) + ')');
        }
    }

    // ── 1. Validate __MSG_key__ references in manifest.json ──
    let manifestText;
    try { manifestText = fs.readFileSync(MANIFEST_PATH, 'utf8'); } catch (err) {
        console.error(`[check-i18n] Cannot read manifest.json: ${err.message}`);
        process.exit(2);
    }
    const manifestKeys = findManifestMsgKeys(manifestText);
    for (const key of manifestKeys) {
        if (!definedKeys.has(key)) {
            errors.push(`manifest.json: __MSG_${key}__ references missing key "${key}"`);
        }
    }

    // ── 2. Validate chrome.i18n.getMessage() calls in extension JS ──
    const jsFiles = [];
    for (const root of JS_SCAN_ROOTS) collectJsFiles(root, jsFiles);

    for (const filePath of jsFiles) {
        let src;
        try { src = fs.readFileSync(filePath, 'utf8'); } catch { continue; }
        const keys = findGetMessageKeys(src);
        const relPath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
        for (const key of keys) {
            if (!definedKeys.has(key)) {
                errors.push(`${relPath}: chrome.i18n.getMessage("${key}") references missing key "${key}"`);
            }
        }
    }

    // ── 3. Validate per-locale parity against en/messages.json ──
    // Audit pass: 4 health-save keys had drifted out of every non-EN locale
    // and a zh_CN-only orphan (languageEyebrow) had no EN counterpart. Catch
    // both flavours of drift in CI before they ship.
    let localeDirs = [];
    try {
        localeDirs = fs.readdirSync(LOCALES_DIR, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name)
            .filter((name) => name !== 'en');
    } catch (err) {
        console.error(`[check-i18n] Cannot list locales dir: ${err.message}`);
        process.exit(2);
    }

    for (const locale of localeDirs) {
        const localePath = path.join(LOCALES_DIR, locale, 'messages.json');
        let localeMessages;
        try {
            localeMessages = JSON.parse(fs.readFileSync(localePath, 'utf8'));
        } catch (err) {
            errors.push(`_locales/${locale}/messages.json: ${err.message}`);
            continue;
        }
        const localeKeys = new Set(Object.keys(localeMessages));
        // Keys EN has that this locale lacks → user sees default-locale fallback (English).
        for (const key of definedKeys) {
            if (!localeKeys.has(key)) {
                errors.push(`_locales/${locale}/messages.json: missing key "${key}" (present in EN)`);
            }
        }
        // Keys this locale has that EN doesn't → dead translation, unreachable from any code path.
        for (const key of localeKeys) {
            if (!definedKeys.has(key)) {
                errors.push(`_locales/${locale}/messages.json: orphan key "${key}" (not in EN)`);
            }
        }
    }

    // ── 4. Validate substitution tokens consumed via .replace('{token}', …) ──
    // Audit pass: 11 *Tpl keys shipped a literal "…" where the token belonged.
    // Because the key existed, t() returned the broken catalogue string and the
    // caller's .replace() was a no-op — users saw "…% complete." for months.
    // EN is the source of truth for which tokens a key must carry; no locale
    // may fall back to a bare ellipsis, and none may drop substitution entirely.
    const consumedTokens = new Map(); // key -> Set(token)
    for (const filePath of jsFiles) {
        let src;
        try { src = fs.readFileSync(filePath, 'utf8'); } catch { continue; }
        for (const found of findReplaceTokenUsages(src)) {
            if (!consumedTokens.has(found.key)) consumedTokens.set(found.key, new Set());
            for (const token of found.tokens) consumedTokens.get(found.key).add(token);
        }
    }

    const localeCache = new Map();
    const readLocale = (locale) => {
        if (!localeCache.has(locale)) {
            try {
                localeCache.set(locale, JSON.parse(
                    fs.readFileSync(path.join(LOCALES_DIR, locale, 'messages.json'), 'utf8')
                ));
            } catch { localeCache.set(locale, null); }
        }
        return localeCache.get(locale);
    };

    for (const [key, tokens] of consumedTokens) {
        if (!definedKeys.has(key)) continue; // already reported by section 2
        const enMessage = messages[key]?.message ?? '';
        for (const token of tokens) {
            if (!enMessage.includes(`{${token}}`)) {
                errors.push(`_locales/en/messages.json: "${key}" is substituted with {${token}} in code but the message has no {${token}} placeholder`);
            }
        }
        // A locale may legitimately omit a token English needs (zh_CN folds the
        // plural noun into the sentence) and may legitimately END in an ellipsis
        // (progress copy: "Removing 3 / 10…"). The defect signature is an
        // ellipsis standing IN PLACE OF a token the locale never carries.
        for (const locale of ['en', ...localeDirs]) {
            const localeMessages = readLocale(locale);
            if (!localeMessages) continue;
            const message = localeMessages[key]?.message;
            if (typeof message !== 'string') continue;
            const present = [...tokens].filter((token) => message.includes(`{${token}}`));
            const missing = [...tokens].filter((token) => !message.includes(`{${token}}`));
            if (missing.length && /…|\.\.\./.test(message)) {
                errors.push(`_locales/${locale}/messages.json: "${key}" uses an ellipsis where ${missing.map((t) => `{${t}}`).join(', ')} belongs`);
            }
            if (tokens.size > 0 && present.length === 0) {
                errors.push(`_locales/${locale}/messages.json: "${key}" carries no substitution token (expected one of ${[...tokens].map((t) => `{${t}}`).join(', ')})`);
            }
        }
    }

    // A message whose TEXT contains a literal \\uXXXX sequence was
    // double-escaped when it was authored: the catalogue wins over the inline
    // fallback, so users read the escape itself. videoNotesSaveFailed shipped
    // that way in all 11 locales.
    const ESCAPE_LITERAL = /\\u[0-9a-fA-F]{4}/;
    for (const locale of ['en', ...localeDirs]) {
        const localeMessages = readLocale(locale);
        if (!localeMessages) continue;
        for (const [key, entry] of Object.entries(localeMessages)) {
            const message = entry && entry.message;
            if (typeof message !== 'string') continue;
            if (ESCAPE_LITERAL.test(message)) {
                errors.push(`_locales/${locale}/messages.json: "${key}" contains a literal \\uXXXX escape; write the character itself`);
            }
        }
    }

    // Chrome REFUSES TO INSTALL an extension whose message carries a $NAME$
    // placeholder with no matching `placeholders` entry. Not a warning - the
    // whole extension fails to load, service worker included, which is exactly
    // as loud and as late as it sounds: every unit test and every other gate
    // passes, and the first sign of trouble is a browser that will not run it.
    //
    // This repo substitutes in JS with {token} instead (299 keys and counting),
    // so a $NAME$ here is almost always a slip rather than a real Chrome
    // placeholder. Both spellings are allowed; only the undeclared one is not.
    const DOLLAR_PLACEHOLDER = /\$[A-Za-z0-9_]+\$/g;
    for (const locale of ['en', ...localeDirs]) {
        const localeMessages = readLocale(locale);
        if (!localeMessages) continue;
        for (const [key, entry] of Object.entries(localeMessages)) {
            const message = entry && entry.message;
            if (typeof message !== 'string') continue;
            const used = message.match(DOLLAR_PLACEHOLDER);
            if (!used) continue;
            const declared = new Set(Object.keys(entry.placeholders || {}).map((name) => name.toLowerCase()));
            for (const raw of new Set(used)) {
                const name = raw.slice(1, -1).toLowerCase();
                if (declared.has(name)) continue;
                errors.push(
                    `_locales/${locale}/messages.json: "${key}" uses the placeholder ${raw} without a matching `
                    + '"placeholders" entry. Chrome refuses to load the extension. Declare it, or use the '
                    + `repo's {token} convention and substitute with .replace().`
                );
            }
        }
    }

    if (errors.length === 0) {
        const totalKeys = definedKeys.size;
        const scannedFiles = jsFiles.length;
        const getMessageCallCount = jsFiles.reduce((sum, filePath) => {
            try { return sum + findGetMessageKeys(fs.readFileSync(filePath, 'utf8')).length; } catch { return sum; }
        }, 0);
        console.log(`[check-i18n] OK — ${totalKeys} message key(s) defined; ${manifestKeys.length} manifest ref(s) and ${getMessageCallCount} getMessage() call(s) all resolve`);
        console.log(`[check-i18n] Substitution OK — ${consumedTokens.size} key(s) consumed via .replace() carry their tokens in every locale`);
        console.log(`[check-i18n] Scanned ${scannedFiles} JS file(s) under extension/`);
        console.log(`[check-i18n] Locale parity OK — ${localeDirs.length} non-EN locale(s) match EN key set`);
        console.log('[check-i18n] Placeholder OK — every $NAME$ placeholder is declared; Chrome will accept every catalogue');
        process.exit(0);
    }

    console.error(`[check-i18n] ${errors.length} unresolved i18n reference(s):`);
    for (const err of errors) console.error(`  ✗ ${err}`);
    console.error('');
    console.error('Add missing keys to extension/_locales/en/messages.json then re-run.');
    process.exit(1);
}

if (require.main === module) {
    try {
        main();
    } catch (err) {
        console.error('[check-i18n]', err.message || err);
        process.exit(2);
    }
}

module.exports = {
    findFeatureCopyDrifts,
    findGetMessageKeys,
    findManifestMsgKeys,
    findReplaceTokenUsages
};
