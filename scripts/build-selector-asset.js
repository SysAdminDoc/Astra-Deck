#!/usr/bin/env node
'use strict';

// Build/check the data-only selector asset used for user-triggered hot
// updates. The runtime still ships and loads the JS selector packs first, so
// this file is an integrity-checked update format and an offline source of
// truth—not remotely executable code.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const packageJson = require('../package.json');
const { loadSurfaceSelectorMap } = require('./build-selector-fixtures.js');

const REPO_ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(REPO_ROOT, 'selector-packs.json');

function sortJsonValue(value) {
    if (Array.isArray(value)) return value.map(sortJsonValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJsonValue(value[key])]));
}

function canonicalPayload(payload) {
    return JSON.stringify(sortJsonValue({
        schemaVersion: payload.schemaVersion,
        assetVersion: payload.assetVersion,
        packs: payload.packs
    }));
}

function digestPayload(payload) {
    return crypto.createHash('sha256').update(canonicalPayload(payload), 'utf8').digest('hex');
}

function buildAsset() {
    const map = loadSurfaceSelectorMap();
    const packs = Object.fromEntries(Object.keys(map).sort().map((surface) => [surface, map[surface]]));
    const payload = {
        schemaVersion: 1,
        assetVersion: `${packageJson.version}.selector.1`,
        packs
    };
    return {
        ...payload,
        digest: `sha256:${digestPayload(payload)}`
    };
}

function renderedAsset(asset) {
    return `${JSON.stringify(asset, null, 2)}\n`;
}

function main() {
    const check = process.argv.includes('--check');
    const expected = renderedAsset(buildAsset());
    if (check) {
        let actual = '';
        try { actual = fs.readFileSync(OUTPUT, 'utf8'); } catch (_) {
            console.error(`[build-selector-asset] missing ${path.relative(REPO_ROOT, OUTPUT)}`);
            process.exit(1);
        }
        if (actual !== expected) {
            console.error(`[build-selector-asset] stale ${path.relative(REPO_ROOT, OUTPUT)}; run npm run generate:selector-asset`);
            process.exit(1);
        }
        console.log(`[build-selector-asset] OK — ${Buffer.byteLength(actual)} bytes, ${Object.keys(JSON.parse(actual).packs).length} packs`);
        return;
    }
    fs.writeFileSync(OUTPUT, expected, 'utf8');
    console.log(`[build-selector-asset] wrote ${path.relative(REPO_ROOT, OUTPUT)} (${Buffer.byteLength(expected)} bytes)`);
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error('[build-selector-asset]', error?.stack || error);
        process.exit(1);
    }
}

module.exports = { canonicalPayload, digestPayload, buildAsset };
