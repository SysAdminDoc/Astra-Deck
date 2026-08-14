#!/usr/bin/env node
'use strict';

// Generate the complete GitHub-facing settings knowledgebase in README.md.
// Canonical feature names/descriptions come from shipped runtime definitions;
// subordinate configuration fields use the audited overrides next to this
// script. `--check` makes documentation drift a release-blocking failure.

const fs = require('fs');
const path = require('path');

const {
    CATEGORIES,
    SETTINGS_SCHEMA,
    humanizeSettingKey
} = require('../extension/core/settings-schema');
const { extractFeatureCopyFromSource, normalizeFeatureCopy } = require('./catalog-utils');
const { PURPOSE_OVERRIDES } = require('./settings-reference-overrides');

const REPO_ROOT = path.join(__dirname, '..');
const README_PATH = path.join(REPO_ROOT, 'README.md');
const BEGIN_MARKER = '<!-- BEGIN GENERATED SETTINGS REFERENCE -->';
const END_MARKER = '<!-- END GENERATED SETTINGS REFERENCE -->';

const CATEGORY_LABELS = Object.freeze({
    shell: 'Shell and appearance',
    nav: 'Navigation and Guide',
    shorts: 'Shorts',
    feed: 'Feeds and layout',
    'watch-player': 'Watch page and player controls',
    'playback-audio': 'Playback, audio, and utilities',
    'quality-codec': 'Quality and codecs',
    'content-filter': 'Video Hider and content filtering',
    comments: 'Comments',
    'live-chat': 'Live chat',
    subscriptions: 'Subscriptions',
    enrichment: 'SponsorBlock, DeArrow, and enrichment',
    downloads: 'Downloads and Astra Downloader',
    subtitles: 'Subtitles',
    'research-ai': 'Research, wellbeing, and AI',
    'privacy-profiles': 'Privacy, profiles, and sync',
    'a11y-perf': 'Accessibility and performance',
    'dev-diagnostics': 'Diagnostics'
});

const VEHICLE_LABELS = Object.freeze({
    both: 'Extension + userscript',
    extension: 'Extension only',
    userscript: 'Userscript only'
});

const PROFILE_LABELS = Object.freeze({
    both: 'Store-safe + GitHub-full',
    'store-safe': 'Store-safe',
    'github-full': 'GitHub-full only'
});

const SCOPE_LABELS = Object.freeze({
    global: 'Global',
    feed: 'Feeds',
    watch: 'Watch page',
    player: 'Player',
    comments: 'Comments',
    'live-chat': 'Live chat',
    subscriptions: 'Subscriptions',
    downloads: 'Downloads',
    popup: 'Popup'
});

const RISK_LABELS = Object.freeze({
    safe: '',
    api: 'Remote API',
    'local-companion': 'Local companion',
    experimental: 'Experimental',
    'store-risk': 'Store-sensitive'
});

function walkJavaScript(dir, sink = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '_locales') continue;
        const absolutePath = path.join(dir, entry.name);
        if (entry.isDirectory()) walkJavaScript(absolutePath, sink);
        else if (entry.isFile() && entry.name.endsWith('.js')) sink.push(absolutePath);
    }
    return sink;
}

function collectFeatureCopy() {
    const copies = {};
    const conflicts = [];
    const priorityFor = (file) => {
        if (file === path.join(REPO_ROOT, 'extension', 'ytkit.js')) return 3;
        if (file.includes(`${path.sep}extension${path.sep}features${path.sep}`)) return 2;
        return 1;
    };
    for (const file of walkJavaScript(path.join(REPO_ROOT, 'extension'))) {
        const extracted = extractFeatureCopyFromSource(fs.readFileSync(file, 'utf8'));
        conflicts.push(...extracted.conflicts.map((conflict) => ({ ...conflict, file })));
        for (const [key, record] of Object.entries(extracted.copies)) {
            const previous = copies[key];
            if (previous && normalizeFeatureCopy(previous.value) !== normalizeFeatureCopy(record.value)) {
                const previousPriority = priorityFor(previous.file);
                const nextPriority = priorityFor(file);
                if (nextPriority > previousPriority) copies[key] = { ...record, file };
                else if (nextPriority === previousPriority) conflicts.push({ key, first: previous, second: record, file });
            } else if (!previous) {
                copies[key] = { ...record, file };
            }
        }
    }
    if (conflicts.length) {
        const summary = conflicts.map((conflict) => `${conflict.key} (${path.relative(REPO_ROOT, conflict.file)})`);
        throw new Error(`Conflicting feature copy prevents a deterministic settings reference: ${summary.join(', ')}`);
    }
    return copies;
}

function cleanCopy(value) {
    return normalizeFeatureCopy(value).replace(/\s+/g, ' ').trim();
}

function collectReferenceEntries() {
    const featureCopy = collectFeatureCopy();
    const entries = SETTINGS_SCHEMA.filter((entry) => !entry.internal).map((entry) => {
        const featureName = featureCopy[`feature_${entry.key}_name`]?.value;
        const featureDescription = featureCopy[`feature_${entry.key}_desc`]?.value;
        const explicitName = typeof entry.labelKey === 'string' ? entry.labelKey.trim() : '';
        const explicitDescription = typeof entry.descriptionKey === 'string' ? entry.descriptionKey.trim() : '';
        const title = cleanCopy(explicitName || featureName || humanizeSettingKey(entry.key));
        const purpose = cleanCopy(explicitDescription || featureDescription || PURPOSE_OVERRIDES[entry.key]);
        const purposeSource = explicitDescription
            ? 'schema'
            : featureDescription
                ? 'runtime'
                : PURPOSE_OVERRIDES[entry.key]
                    ? 'override'
                    : '';
        return Object.freeze({ ...entry, title, purpose, purposeSource });
    });

    const keys = new Set(entries.map((entry) => entry.key));
    const missing = entries.filter((entry) => !entry.title || entry.purpose.length < 12);
    const staleOverrides = Object.keys(PURPOSE_OVERRIDES).filter((key) => {
        if (!keys.has(key)) return true;
        const entry = entries.find((candidate) => candidate.key === key);
        return entry.purposeSource !== 'override';
    });
    if (missing.length || staleOverrides.length) {
        const parts = [];
        if (missing.length) parts.push(`missing purpose copy: ${missing.map((entry) => entry.key).join(', ')}`);
        if (staleOverrides.length) parts.push(`stale purpose overrides: ${staleOverrides.join(', ')}`);
        throw new Error(parts.join('; '));
    }
    return entries;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeCell(value) {
    return String(value)
        .replace(/\r?\n/g, ' ')
        .replace(/\|/g, '\\|')
        .trim();
}

function code(value) {
    return `<code>${escapeHtml(value)}</code>`;
}

function formatDefault(entry) {
    const value = entry.defaultValue;
    if (entry.type === 'boolean') return value ? 'On' : 'Off';
    if (entry.type === 'null') return 'None until customized';
    if (entry.type === 'number') return code(String(value));
    if (entry.type === 'string') {
        if (value === '') return 'Empty';
        if (value.includes('\n')) return `${value.split(/\r?\n/).filter(Boolean).length} preset lines`;
        return code(value);
    }
    if (entry.type === 'array') {
        if (!value.length) return 'Empty list';
        if (value.length <= 4) return value.map((item) => code(JSON.stringify(item))).join(', ');
        return `${value.length} selected entries`;
    }
    if (entry.type === 'object') {
        if (Object.keys(value).length === 0) return 'Empty object';
        return code(JSON.stringify(value));
    }
    return code(JSON.stringify(value));
}

function formatConstraints(entry) {
    const parts = [`Default: ${formatDefault(entry)}`];
    if (Array.isArray(entry.enum)) {
        parts.push(`Values: ${entry.enum.map((value) => code(String(value) || '(empty)')).join(', ')}`);
    }
    if (Array.isArray(entry.knownValues)) {
        parts.push(`Choices: ${entry.knownValues.map((value) => code(value)).join(', ')}`);
    }
    if (typeof entry.min === 'number' || typeof entry.max === 'number') {
        const min = typeof entry.min === 'number' ? entry.min : '−∞';
        const max = typeof entry.max === 'number' ? entry.max : '∞';
        parts.push(`Range: ${code(`${min}–${max}`)}`);
    }
    if (entry.type === 'string' && /^#[0-9a-f]{6}$/i.test(entry.defaultValue)) {
        parts.push('Hex color');
    }
    return parts.join('<br>');
}

function formatBehavior(entry) {
    const parts = [
        VEHICLE_LABELS[entry.vehicle] || entry.vehicle,
        PROFILE_LABELS[entry.profile] || entry.profile,
        SCOPE_LABELS[entry.scope] || entry.scope,
        entry.immediateApply
            ? (entry.destroyRequired ? 'Live apply + reversible teardown' : 'Live apply')
            : 'Deferred apply'
    ];
    if (Array.isArray(entry.requires) && entry.requires.length) {
        parts.push(`Requires ${entry.requires.map((value) => code(value)).join(', ')}`);
    }
    if (RISK_LABELS[entry.risk]) parts.push(RISK_LABELS[entry.risk]);
    parts.push(`Since ${code(`v${entry.since}`)}`);
    return parts.join('<br>');
}

function renderEntry(entry) {
    const setting = `<a id="setting-${escapeHtml(entry.key)}"></a><strong>${escapeHtml(entry.title)}</strong><br>${code(entry.key)}`;
    return `| ${setting} | ${escapeCell(entry.purpose)} | ${formatConstraints(entry)} | ${formatBehavior(entry)} |`;
}

function renderSettingsReference(entries = collectReferenceEntries()) {
    const lines = [
        BEGIN_MARKER,
        '### Complete settings reference',
        '',
        `This generated knowledgebase documents all **${entries.length} user-facing settings** in the canonical schema. `
            + `The remaining ${SETTINGS_SCHEMA.length - entries.length} schema entries are internal migration/profile metadata, not user controls. `
            + 'Defaults, accepted values, build availability, scope, apply behavior, capability requirements, and introduction version are source-derived; purpose copy comes from the shipped feature definition or an audited subordinate-field description.',
        '',
        '> `Extension only` settings are unavailable in the standalone userscript. `GitHub-full only` settings require a compatible GitHub-full build/profile and any permission shown in the UI. `Deferred apply` means the value is consumed on the next relevant render or navigation rather than rebuilding the current surface immediately.',
        ''
    ];

    for (const category of CATEGORIES) {
        const categoryEntries = entries.filter((entry) => entry.category === category);
        if (!categoryEntries.length) continue;
        const label = CATEGORY_LABELS[category] || humanizeSettingKey(category.replace(/-/g, '_'));
        lines.push(
            '<details>',
            `<summary><strong>${escapeHtml(label)}</strong> — ${categoryEntries.length} settings</summary>`,
            '',
            '| Setting | Purpose | Default and accepted values | Availability and behavior |',
            '| --- | --- | --- | --- |',
            ...categoryEntries.map(renderEntry),
            '',
            '</details>',
            ''
        );
    }

    lines.push(END_MARKER);
    return lines.join('\n');
}

function replaceReference(content, block) {
    const matches = String(content).match(new RegExp(`${BEGIN_MARKER}[\\s\\S]*?${END_MARKER}`, 'g')) || [];
    if (matches.length > 1) throw new Error(`README contains ${matches.length} settings-reference blocks`);
    if (matches.length === 1) return String(content).replace(matches[0], block);
    const architectureMarker = '\n---\n\n## Architecture';
    const index = String(content).indexOf(architectureMarker);
    if (index === -1) throw new Error('README insertion point before Architecture was not found');
    return String(content).slice(0, index) + `\n\n${block}\n` + String(content).slice(index);
}

function run(mode = 'write') {
    const entries = collectReferenceEntries();
    const block = renderSettingsReference(entries);
    const current = fs.readFileSync(README_PATH, 'utf8');
    const expected = replaceReference(current, block);
    if (mode === 'check') {
        if (expected !== current) {
            console.error('[settings-reference] README.md is stale; run npm run generate:settings-reference');
            process.exitCode = 1;
            return;
        }
        console.log(`[settings-reference] OK — ${entries.length} user-facing settings across ${CATEGORIES.length} categories`);
        return;
    }
    if (expected !== current) fs.writeFileSync(README_PATH, expected, 'utf8');
    console.log(`[settings-reference] rendered — ${entries.length} user-facing settings across ${CATEGORIES.length} categories`);
}

if (require.main === module) {
    run(process.argv.includes('--check') ? 'check' : 'write');
}

module.exports = {
    BEGIN_MARKER,
    CATEGORY_LABELS,
    END_MARKER,
    collectReferenceEntries,
    formatBehavior,
    formatConstraints,
    renderSettingsReference,
    replaceReference,
    run
};
