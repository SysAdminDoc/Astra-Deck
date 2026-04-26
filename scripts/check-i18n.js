#!/usr/bin/env node
'use strict';

// Build-time i18n consistency checker.
//
// Validates two things:
//
// 1. __MSG_key__ references in manifest.json have a matching key in
//    extension/_locales/en/messages.json.
//
// 2. Every chrome.i18n.getMessage("key") / chrome.i18n.getMessage('key')
//    call found in any JS source file under extension/ has a matching key in
//    extension/_locales/en/messages.json.
//
// Strings remain hardcoded English in most source files and are NOT required
// to route through chrome.i18n.getMessage — migration is incremental.
// This script only validates calls that already use the i18n API, so new
// getMessage() calls added without a messages.json entry are caught
// immediately.
//
// Exit 0: all checks pass.
// Exit 1: at least one missing key found.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const MESSAGES_PATH = path.join(REPO_ROOT, 'extension', '_locales', 'en', 'messages.json');
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

function main() {
    const messages = loadMessages();
    const definedKeys = new Set(Object.keys(messages));
    const errors = [];

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

    if (errors.length === 0) {
        const totalKeys = definedKeys.size;
        const scannedFiles = jsFiles.length;
        console.log(`[check-i18n] OK — ${totalKeys} message key(s) defined; ${manifestKeys.length} manifest ref(s) and 0 getMessage() calls all resolve`);
        console.log(`[check-i18n] Scanned ${scannedFiles} JS file(s) under extension/`);
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

module.exports = { findGetMessageKeys, findManifestMsgKeys };
