#!/usr/bin/env node
'use strict';

// Greasy Fork applies the 2 MiB code limit to each script record. The main
// artifact and its separately listed @require library therefore both need a
// hard size gate; otherwise a future module addition can move the failure from
// CI to an opaque listing rejection.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MAX_CODE_BYTES = 2 * 1024 * 1024;
const MAIN_PATH = path.join(ROOT, 'YTKit.user.js');
const CORE_PATH = path.join(ROOT, 'YTKit-core.user.js');
const DEFAULT_CORE_URL = 'https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/YTKit-core.user.js';
const GREASY_FORK_CORE_URL_PATTERN = /^https:\/\/update\.greasyfork\.org\/scripts\/\d+\/[^/]+$/;

function isResolvableRequireUrl(value) {
    return value === DEFAULT_CORE_URL || GREASY_FORK_CORE_URL_PATTERN.test(value);
}

function fail(message) {
    console.error(`[check-userscript-size] ${message}`);
    process.exitCode = 1;
}

function read(pathname) {
    if (!fs.existsSync(pathname)) {
        fail(`missing ${path.relative(ROOT, pathname)}; run node sync-userscript.js`);
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
    if (bytes >= MAX_CODE_BYTES) {
        fail(`${file} is ${bytes.toLocaleString()} B; Greasy Fork allows at most ${MAX_CODE_BYTES.toLocaleString()} B`);
    }
    return bytes;
}

const main = read(MAIN_PATH);
const core = read(CORE_PATH);
const mainBlock = metadataBlock(main, 'YTKit.user.js');
const coreBlock = metadataBlock(core, 'YTKit-core.user.js');
const requireUrls = metadataValues(mainBlock, 'require');

if (requireUrls.length !== 1) {
    fail(`YTKit.user.js must declare exactly one @require dependency (found ${requireUrls.length})`);
} else if (!isResolvableRequireUrl(requireUrls[0])) {
    fail(`@require is not a resolvable Astra Deck core URL: ${requireUrls[0]}`);
}

for (const [key, pattern] of [
    ['homepageURL', /github\.com\/SysAdminDoc\/Astra-Deck/],
    ['supportURL', /github\.com\/SysAdminDoc\/Astra-Deck\/issues/],
    ['license', /^MIT$/],
    ['icon', /raw\.githubusercontent\.com\/SysAdminDoc\/Astra-Deck\/main\/extension\/icons\/128\.png/],
]) {
    const values = metadataValues(mainBlock, key);
    if (values.length !== 1 || !pattern.test(values[0])) {
        fail(`YTKit.user.js must declare an accurate @${key}`);
    }
}
if (!metadataValues(mainBlock, 'description')[0]?.includes('YTKit Core Library')) {
    fail('YTKit.user.js description must state the core-library dependency');
}
if (!metadataValues(mainBlock, 'description')[0]?.includes('Astra Downloader companion')) {
    fail('YTKit.user.js description must disclose the optional Astra Downloader companion');
}
if (!metadataValues(mainBlock, 'connect').includes('127.0.0.1')) {
    fail('YTKit.user.js must declare @connect 127.0.0.1 for the local companion');
}

const mainBytes = checkSize(main, 'YTKit.user.js');
const coreBytes = checkSize(core, 'YTKit-core.user.js');
const mainVersion = metadataValues(mainBlock, 'version')[0];
const coreVersion = metadataValues(coreBlock, 'version')[0];
if (mainVersion && coreVersion && mainVersion !== coreVersion) {
    fail(`main/core userscript versions differ (${mainVersion} vs ${coreVersion})`);
}

if (!process.exitCode) {
    const headroom = MAX_CODE_BYTES - mainBytes;
    const coreHeadroom = MAX_CODE_BYTES - coreBytes;
    const dependencyState = requireUrls[0] === DEFAULT_CORE_URL
        ? 'GitHub raw fallback configured'
        : 'Greasy Fork core URL configured';
    console.log(`[check-userscript-size] OK — main ${mainBytes.toLocaleString()} B, core ${coreBytes.toLocaleString()} B; headroom ${headroom.toLocaleString()} B / ${coreHeadroom.toLocaleString()} B (${dependencyState})`);
}

module.exports = {
    DEFAULT_CORE_URL,
    GREASY_FORK_CORE_URL_PATTERN,
    isResolvableRequireUrl,
};
