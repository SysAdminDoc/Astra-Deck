#!/usr/bin/env node
'use strict';

// scripts/generate-shipped-identity-baseline.js
//
// Records every setting key and feature ID that has ever been in a tagged
// release, so scripts/check-settings.js can tell the difference between a key
// that was deliberately retired and one that a rename quietly orphaned.
//
// The baseline only ever grows. A key leaves a shipped release the moment it
// is renamed, and the user's browser is still holding a value under the old
// name — so the gate demands the old name resolve to something: a current
// schema key, an alias pointing at one, or an explicit retirement.
//
// Run: node scripts/generate-shipped-identity-baseline.js
// Check: node scripts/generate-shipped-identity-baseline.js --check

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'shipped-identity-baseline.json');
const FEATURE_ID_PATTERN = /^\s+id:\s*'([a-zA-Z][a-zA-Z0-9]*)'/gm;

function userscriptDefaultKeys(source) {
    const marker = /\bdefaults\s*:\s*\{/.exec(String(source || ''));
    if (!marker) return null;
    const openIndex = marker.index + marker[0].lastIndexOf('{');
    const keys = [];
    let depth = 0;
    let bracketDepth = 0;
    let parenDepth = 0;
    let state = 'code';
    let segmentStart = openIndex + 1;

    const readSegmentKey = (endIndex) => {
        const segment = source.slice(segmentStart, endIndex)
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/[^\r\n]*/g, '')
            .trim();
        const match = /^(?:['"]([^'"]+)['"]|([A-Za-z_$][\w$]*))\s*:/.exec(segment);
        const key = match?.[1] || match?.[2];
        if (key) keys.push(key);
    };

    for (let index = openIndex; index < source.length; index += 1) {
        const char = source[index];
        const next = source[index + 1];
        if (state === 'line-comment') {
            if (char === '\n') state = 'code';
            continue;
        }
        if (state === 'block-comment') {
            if (char === '*' && next === '/') { state = 'code'; index += 1; }
            continue;
        }
        if (state !== 'code') {
            if (char === '\\') { index += 1; continue; }
            if (char === state) state = 'code';
            continue;
        }
        if (char === '/' && next === '/') { state = 'line-comment'; index += 1; continue; }
        if (char === '/' && next === '*') { state = 'block-comment'; index += 1; continue; }
        if (char === "'" || char === '"' || char === '`') { state = char; continue; }
        if (char === '{') { depth += 1; continue; }
        if (char === '}') {
            if (depth === 1) {
                readSegmentKey(index);
                return keys;
            }
            depth -= 1;
            continue;
        }
        if (depth !== 1) continue;
        if (char === '[') bracketDepth += 1;
        else if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
        else if (char === '(') parenDepth += 1;
        else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
        else if (char === ',' && bracketDepth === 0 && parenDepth === 0) {
            readSegmentKey(index);
            segmentStart = index + 1;
        }
    }
    return null;
}

function git(args) {
    return execFileSync('git', args, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        // Older tags predate files this walks; a miss is expected and handled
        // by the caller, so git's own complaint is noise.
        stdio: ['ignore', 'pipe', 'ignore']
    });
}

function listReleaseTags() {
    return git(['tag', '--list', 'v*'])
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .sort();
}

function fileAt(ref, relPath) {
    try {
        return git(['show', `${ref}:${relPath}`]);
    } catch (_) {
        // reason: the file may not exist at that point in history
        return null;
    }
}

// settings-schema.js is a plain CommonJS module at every revision that has it,
// so the honest way to read its key set is to run it rather than regex it.
function settingKeysAt(ref) {
    const source = fileAt(ref, 'extension/core/settings-schema.js');
    if (source !== null) {
        const tmp = path.join(os.tmpdir(), `astra-schema-${ref.replace(/[^\w.-]/g, '_')}.js`);
        fs.writeFileSync(tmp, source);
        try {
            delete require.cache[require.resolve(tmp)];
            const mod = require(tmp);
            if (Array.isArray(mod.SETTINGS_SCHEMA)) {
                return mod.SETTINGS_SCHEMA.map((entry) => entry.key).filter(Boolean);
            }
        } catch (_) {
            // reason: fall through to the root userscript used by early tags
        } finally {
            fs.rmSync(tmp, { force: true });
        }
    }
    const userscript = fileAt(ref, 'YTKit.user.js');
    return userscript === null ? null : userscriptDefaultKeys(userscript);
}

function featureIdsAt(ref) {
    let files;
    try {
        files = git(['ls-tree', '-r', '--name-only', ref]).split('\n');
    } catch (_) {
        return null;
    }
    const targets = files.filter((file) => (
        file === 'YTKit.user.js'
        || file === 'extension/ytkit.js'
        || /^extension\/features\/[^/]+\/index\.js$/.test(file)
    ));
    if (!targets.length) return null;
    const ids = new Set();
    for (const file of targets) {
        const source = fileAt(ref, file);
        if (source === null) continue;
        FEATURE_ID_PATTERN.lastIndex = 0;
        let match;
        while ((match = FEATURE_ID_PATTERN.exec(source)) !== null) ids.add(match[1]);
    }
    return [...ids];
}

function buildBaseline(options = {}) {
    const tags = options.releaseTags || listReleaseTags();
    const currentRef = options.currentRef || 'HEAD';
    const readSettingKeys = options.settingKeysAt || settingKeysAt;
    const readFeatureIds = options.featureIdsAt || featureIdsAt;
    const settingKeys = new Set();
    const featureIds = new Set();
    for (const tag of tags) {
        const keys = readSettingKeys(tag);
        const ids = readFeatureIds(tag);
        if (!keys && !ids) continue;
        for (const key of keys || []) settingKeys.add(key);
        for (const id of ids || []) featureIds.add(id);
    }
    // The working tree counts as shipped-in-waiting: a key renamed between the
    // last tag and now must still resolve.
    for (const key of readSettingKeys(currentRef) || []) settingKeys.add(key);
    for (const id of readFeatureIds(currentRef) || []) featureIds.add(id);
    return {
        note: 'Every setting key and feature ID that has appeared in a tagged release or the current release candidate. Tag names are intentionally omitted so a tag without identity changes is a no-op. Generated by scripts/generate-shipped-identity-baseline.js; it only ever grows.',
        settingKeys: [...settingKeys].sort(),
        featureIds: [...featureIds].sort()
    };
}

function serialize(baseline) {
    return JSON.stringify(baseline, null, 2) + '\n';
}

function mergeWithExisting(baseline) {
    if (!fs.existsSync(BASELINE_PATH)) return baseline;
    let existing;
    try {
        existing = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    } catch (_) {
        return baseline;
    }
    const settingKeys = new Set([...(existing.settingKeys || []), ...baseline.settingKeys]);
    const featureIds = new Set([...(existing.featureIds || []), ...baseline.featureIds]);
    return {
        ...baseline,
        settingKeys: [...settingKeys].sort(),
        featureIds: [...featureIds].sort()
    };
}

function main() {
    const check = process.argv.includes('--check');
    const releaseTags = listReleaseTags();
    const baseline = mergeWithExisting(buildBaseline({ releaseTags }));
    const rendered = serialize(baseline);
    if (check) {
        const current = fs.existsSync(BASELINE_PATH) ? fs.readFileSync(BASELINE_PATH, 'utf8') : '';
        if (current !== rendered) {
            console.error('[shipped-identity] FAIL scripts/shipped-identity-baseline.json is stale; run node scripts/generate-shipped-identity-baseline.js');
            process.exit(1);
        }
        console.log(`[shipped-identity] OK — ${baseline.settingKeys.length} setting key(s) and ${baseline.featureIds.length} feature ID(s) scanned from ${releaseTags.length} release tag(s) plus HEAD`);
        return;
    }
    fs.writeFileSync(BASELINE_PATH, rendered);
    console.log(`[shipped-identity] wrote ${baseline.settingKeys.length} setting key(s) and ${baseline.featureIds.length} feature ID(s) scanned from ${releaseTags.length} release tag(s) plus HEAD`);
}

if (require.main === module) main();

module.exports = {
    buildBaseline,
    featureIdsAt,
    mergeWithExisting,
    serialize,
    settingKeysAt,
    userscriptDefaultKeys,
    BASELINE_PATH
};
