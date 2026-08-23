#!/usr/bin/env node
'use strict';

// Render reviewer-facing web_accessible_resources facts from the same staged
// manifests that are packaged for Chromium and Firefox. `--check` makes either
// a manifest-policy change or a hand-edited generated block fail the main gate.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    BUILD_PROFILE_IDS,
    copyDir,
    patchStagedManifest,
} = require('../build-extension.js');

const REPO_ROOT = path.join(__dirname, '..');
const EXTENSION_DIR = path.join(REPO_ROOT, 'extension');
const DOCUMENT_TARGETS = Object.freeze([
    path.join('docs', 'cws-submission-checklist.md'),
    path.join('docs', 'store-permission-rationale.md'),
]);
const BROWSERS = Object.freeze(['chromium', 'firefox']);
const BEGIN_MARKER = '<!-- BEGIN GENERATED REVIEWER RESOURCE INVENTORY -->';
const END_MARKER = '<!-- END GENERATED REVIEWER RESOURCE INVENTORY -->';

function assertSafeTemporaryRoot(tempRoot) {
    const resolved = path.resolve(tempRoot);
    const tempPrefix = path.resolve(os.tmpdir()) + path.sep;
    if (!resolved.startsWith(tempPrefix)
            || !path.basename(resolved).startsWith('astra-reviewer-resources-')) {
        throw new Error(`Refusing to remove unexpected temporary path: ${resolved}`);
    }
}

function normalizeResourceEntry(entry, profile, browser, index) {
    if (!Array.isArray(entry.resources) || !entry.resources.length) {
        throw new Error(`${profile}/${browser} resource entry ${index + 1} has no resources`);
    }
    if (!Array.isArray(entry.matches) || !entry.matches.length) {
        throw new Error(`${profile}/${browser} resource entry ${index + 1} has no matches`);
    }
    const dynamicUrl = Object.hasOwn(entry, 'use_dynamic_url')
        ? entry.use_dynamic_url
        : null;
    if (browser === 'chromium' && dynamicUrl !== true) {
        throw new Error(`${profile}/${browser} resource entry ${index + 1} must use dynamic URLs`);
    }
    if (browser === 'firefox' && dynamicUrl !== null) {
        throw new Error(`${profile}/${browser} resource entry ${index + 1} must omit use_dynamic_url`);
    }
    return Object.freeze({
        resources: Object.freeze(entry.resources.slice()),
        matches: Object.freeze(entry.matches.slice()),
        dynamicUrl,
    });
}

function collectStagedInventories() {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-reviewer-resources-'));
    const inventories = [];
    try {
        for (const profile of BUILD_PROFILE_IDS) {
            for (const browser of BROWSERS) {
                const stageDir = path.join(tempRoot, `${profile}-${browser}`);
                copyDir(EXTENSION_DIR, stageDir);
                patchStagedManifest(stageDir, profile, browser === 'firefox' ? 'firefox' : 'chrome');
                const manifest = JSON.parse(fs.readFileSync(
                    path.join(stageDir, 'manifest.json'),
                    'utf8',
                ));
                const entries = (manifest.web_accessible_resources || [])
                    .map((entry, index) => normalizeResourceEntry(entry, profile, browser, index));
                if (!entries.length) {
                    throw new Error(`${profile}/${browser} staged manifest has no web-accessible resources`);
                }
                inventories.push(Object.freeze({ profile, browser, entries: Object.freeze(entries) }));
            }
        }
        return Object.freeze(inventories);
    } finally {
        assertSafeTemporaryRoot(tempRoot);
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
}

function resourceSetSignature(inventory) {
    return JSON.stringify(inventory.entries.map((entry) => ({
        resources: entry.resources,
        matches: entry.matches,
    })));
}

function renderGeneratedBlock(inventories = collectStagedInventories()) {
    const sets = [];
    const setBySignature = new Map();
    const rows = [];
    for (const inventory of inventories) {
        const signature = resourceSetSignature(inventory);
        let set = setBySignature.get(signature);
        if (!set) {
            set = {
                id: String.fromCharCode(65 + sets.length),
                entries: inventory.entries,
                consumers: [],
            };
            sets.push(set);
            setBySignature.set(signature, set);
        }
        set.consumers.push(`\`${inventory.profile}\` ${inventory.browser}`);
        rows.push({
            profile: inventory.profile,
            browser: inventory.browser,
            setId: set.id,
            count: inventory.entries.reduce((sum, entry) => sum + entry.resources.length, 0),
            dynamicUrl: inventory.entries.every((entry) => entry.dynamicUrl === true)
                ? '`true` on every entry'
                : 'omitted',
        });
    }

    const lines = [
        BEGIN_MARKER,
        '### Generated web-accessible resource inventory',
        '',
        'This block is generated from temporary package stages for every build profile and browser target. Run `node scripts/generate-reviewer-resource-docs.js --write` after changing the manifest or runtime graph.',
        '',
        'The runtime loader and its packaged JavaScript modules are web-accessible because the isolated content runtime imports them through `runtime.getURL()`. They remain local extension code under `script-src \'self\'`; no remote code is loaded. Chromium assigns per-session resource aliases through `use_dynamic_url: true`. Firefox omits that Chromium-only key and serves the same reviewed paths from its randomized extension origin.',
        '',
        '| Build profile | Browser target | Exact resource set | Paths | `use_dynamic_url` |',
        '| --- | --- | --- | ---: | --- |',
        ...rows.map((row) => `| \`${row.profile}\` | ${row.browser} | ${row.setId} | ${row.count} | ${row.dynamicUrl} |`),
        '',
    ];

    for (const set of sets) {
        lines.push(`#### Resource set ${set.id}`);
        lines.push('');
        lines.push(`Used by: ${set.consumers.join(', ')}.`);
        lines.push('');
        set.entries.forEach((entry, index) => {
            lines.push(`Entry ${index + 1} match patterns:`);
            lines.push('');
            for (const match of entry.matches) lines.push(`- \`${match}\``);
            lines.push('');
            lines.push(`Entry ${index + 1} resource paths:`);
            lines.push('');
            for (const resource of entry.resources) lines.push(`- \`${resource}\``);
            lines.push('');
        });
    }
    lines.push(END_MARKER);
    return lines.join('\n');
}

function replaceGeneratedBlock(content, block) {
    const start = content.indexOf(BEGIN_MARKER);
    const end = content.indexOf(END_MARKER);
    if (start < 0 || end < start) {
        throw new Error('reviewer resource inventory markers are missing or out of order');
    }
    return content.slice(0, start) + block + content.slice(end + END_MARKER.length);
}

function validateDocument(content, expectedBlock) {
    const errors = [];
    let updated;
    try {
        updated = replaceGeneratedBlock(content, expectedBlock);
    } catch (error) {
        return [error.message];
    }
    if (updated !== content) errors.push('generated reviewer resource inventory is stale');
    if (/web_accessible_resources[\s\S]{0,180}(?:only|restricted)[\s\S]{0,120}`icons\/\*`/i.test(content)) {
        errors.push('document still claims web-accessible resources are restricted to wildcard assets');
    }
    if (/JavaScript[\s\S]{0,100}(?:is\s+not|isn['’]t|are\s+not|not)\s+web-accessible/i.test(content)) {
        errors.push('document still claims packaged JavaScript is not web-accessible');
    }
    if (/Chromium[\s\S]{0,120}use_dynamic_url[\s\S]{0,40}(?:false|disabled|off)/i.test(content)) {
        errors.push('document contradicts Chromium dynamic resource URLs');
    }
    if (/Firefox[\s\S]{0,120}(?:stable|fixed|persistent)[\s\S]{0,80}moz-extension(?:\s+origin|:\/\/)/i.test(content)) {
        errors.push('document contradicts Firefox runtime-assigned extension origins');
    }
    return errors;
}

function run(mode = 'check') {
    const block = renderGeneratedBlock();
    const errors = [];
    for (const relativePath of DOCUMENT_TARGETS) {
        const absolutePath = path.join(REPO_ROOT, relativePath);
        const content = fs.readFileSync(absolutePath, 'utf8');
        if (mode === 'write') {
            const updated = replaceGeneratedBlock(content, block);
            if (updated !== content) fs.writeFileSync(absolutePath, updated, 'utf8');
            continue;
        }
        for (const error of validateDocument(content, block)) {
            errors.push(`${relativePath}: ${error}`);
        }
    }
    if (errors.length) {
        console.error('[reviewer-resources] documentation drift detected:');
        for (const error of errors) console.error(`  x ${error}`);
        process.exitCode = 1;
        return false;
    }
    console.log(`[reviewer-resources] ${mode === 'write' ? 'rendered' : 'OK'}: ${DOCUMENT_TARGETS.length} documents match six staged manifests`);
    return true;
}

if (require.main === module) {
    run(process.argv.includes('--write') ? 'write' : 'check');
}

module.exports = {
    BEGIN_MARKER,
    BROWSERS,
    DOCUMENT_TARGETS,
    END_MARKER,
    collectStagedInventories,
    renderGeneratedBlock,
    replaceGeneratedBlock,
    resourceSetSignature,
    run,
    validateDocument,
};
