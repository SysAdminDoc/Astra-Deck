#!/usr/bin/env node
'use strict';

// Greasy Fork applies the 2 MiB code limit to each script record. The main
// artifact and each of its @require libraries is its own record, so every one
// needs a hard size gate; otherwise a future module addition moves the failure
// from CI to an opaque listing rejection.

const fs = require('node:fs');
const path = require('node:path');
const { LIBRARIES, MAX_RECORD_BYTES, stripIntegrity } = require('../sync-userscript');

const ROOT = path.join(__dirname, '..');
const MAIN_FILE = 'YTKit.user.js';
const LIBRARY_FILES = LIBRARIES.map((library) => library.file);
const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A tag ref, never a branch ref. `main` is mutable, so an install pinned to
// it re-fetches whatever that pointer says today; see the note in
// sync-userscript.js.
const TAGGED_LIBRARY_URL_PATTERN = new RegExp(
    `^https://raw\\.githubusercontent\\.com/SysAdminDoc/Astra-Deck/refs/tags/v\\d+\\.\\d+\\.\\d+/(?:${LIBRARY_FILES.map(escapeRe).join('|')})#sha256=[a-f0-9]{64}$`);
const GREASY_FORK_LIBRARY_URL_PATTERN = /^https:\/\/update\.greasyfork\.org\/scripts\/\d+\/[^/]+$/;
const MUTABLE_REF_PATTERN = /githubusercontent\.com\/[^/]+\/[^/]+\/(?:main|master|refs\/heads\/)/;

function isResolvableRequireUrl(value) {
    if (MUTABLE_REF_PATTERN.test(String(value || ''))) return false;
    return TAGGED_LIBRARY_URL_PATTERN.test(value) || GREASY_FORK_LIBRARY_URL_PATTERN.test(value);
}

function fail(message) {
    console.error(`[check-userscript-size] ${message}`);
    process.exitCode = 1;
}

function read(file) {
    const pathname = path.join(ROOT, file);
    if (!fs.existsSync(pathname)) {
        fail(`missing ${file}; run node sync-userscript.js`);
        return '';
    }
    return fs.readFileSync(pathname, 'utf8');
}

function metadataBlock(source, file) {
    const start = source.indexOf('// ==UserScript==');
    const end = source.indexOf('// ==/UserScript==');
    if (start < 0 || end <= start) {
        fail(`${file} is missing a complete userscript metadata block`);
        return '';
    }
    return source.slice(start, end + '// ==/UserScript=='.length);
}

function metadataValues(block, key) {
    const re = new RegExp(`^//\\s*@${key}\\s+(.+?)\\s*$`, 'gm');
    return [...block.matchAll(re)].map((match) => match[1].trim());
}

function checkSize(source, file) {
    const bytes = Buffer.byteLength(source, 'utf8');
    if (bytes >= MAX_RECORD_BYTES) {
        fail(`${file} is ${bytes.toLocaleString()} B; Greasy Fork allows at most ${MAX_RECORD_BYTES.toLocaleString()} B`);
    }
    return bytes;
}

function main() {
    const mainSource = read(MAIN_FILE);
    const mainBlock = metadataBlock(mainSource, MAIN_FILE);
    const requireUrls = metadataValues(mainBlock, 'require');

    // Order matters: the libraries only register, and the host checks that
    // every one of them did before it runs anything.
    const requiredFiles = requireUrls.map(stripIntegrity).map((url) => url.slice(url.lastIndexOf('/') + 1));
    if (requireUrls.length !== LIBRARY_FILES.length
        || requiredFiles.some((file, index) => file !== LIBRARY_FILES[index])) {
        fail(`${MAIN_FILE} must @require ${LIBRARY_FILES.join(', ')} in that order (found ${requiredFiles.join(', ') || 'none'})`);
    }
    for (const url of requireUrls) {
        if (!isResolvableRequireUrl(url)) fail(`@require is not a resolvable Astra Deck library URL: ${url}`);
    }

    for (const [key, pattern] of [
        ['homepageURL', /github\.com\/SysAdminDoc\/Astra-Deck/],
        ['supportURL', /github\.com\/SysAdminDoc\/Astra-Deck\/issues/],
        ['license', /^MIT$/],
        ['icon', /raw\.githubusercontent\.com\/SysAdminDoc\/Astra-Deck\/main\/extension\/icons\/128\.png/],
    ]) {
        const values = metadataValues(mainBlock, key);
        if (values.length !== 1 || !pattern.test(values[0])) {
            fail(`${MAIN_FILE} must declare an accurate @${key}`);
        }
    }
    const description = metadataValues(mainBlock, 'description')[0] || '';
    if (!/YTKit librar/i.test(description)) {
        fail(`${MAIN_FILE} description must state the library dependency`);
    }
    if (!description.includes('Astra Downloader companion')) {
        fail(`${MAIN_FILE} description must disclose the optional Astra Downloader companion`);
    }
    if (!metadataValues(mainBlock, 'connect').includes('127.0.0.1')) {
        fail(`${MAIN_FILE} must declare @connect 127.0.0.1 for the local companion`);
    }

    const mainVersion = metadataValues(mainBlock, 'version')[0];
    const sizes = [[MAIN_FILE, checkSize(mainSource, MAIN_FILE)]];
    for (const file of LIBRARY_FILES) {
        const source = read(file);
        const version = metadataValues(metadataBlock(source, file), 'version')[0];
        if (mainVersion && version !== mainVersion) {
            fail(`${file} is v${version}, ${MAIN_FILE} is v${mainVersion}`);
        }
        sizes.push([file, checkSize(source, file)]);
    }

    if (!process.exitCode) {
        const tagged = requireUrls.every((url) => TAGGED_LIBRARY_URL_PATTERN.test(url));
        const report = sizes.map(([file, bytes]) =>
            `${file} ${bytes.toLocaleString()} B (headroom ${(MAX_RECORD_BYTES - bytes).toLocaleString()} B)`).join('; ');
        console.log(`[check-userscript-size] OK: ${report}; ${tagged ? 'tag-pinned GitHub raw libraries' : 'Greasy Fork libraries'}`);
    }
}

if (require.main === module) main();

module.exports = {
    GREASY_FORK_LIBRARY_URL_PATTERN,
    TAGGED_LIBRARY_URL_PATTERN,
    MUTABLE_REF_PATTERN,
    isResolvableRequireUrl,
};
