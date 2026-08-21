'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const schema = require('../extension/core/settings-schema');
const {
    BEGIN_MARKER,
    END_MARKER,
    collectReferenceEntries,
    renderEntry,
    renderSettingsReference,
    replaceReference
} = require('../scripts/generate-settings-reference');

const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');

test('settings reference covers every user-facing schema entry with audited purpose copy', () => {
    const entries = collectReferenceEntries();
    const expectedKeys = schema.SETTINGS_SCHEMA.filter((entry) => !entry.internal).map((entry) => entry.key);
    assert.equal(entries.length, 472);
    assert.deepEqual(entries.map((entry) => entry.key), expectedKeys);
    for (const entry of entries) {
        assert.ok(entry.title.length >= 2, `${entry.key} needs a readable title`);
        assert.ok(entry.purpose.length >= 12, `${entry.key} needs a specific purpose`);
        assert.ok(['runtime', 'schema', 'override'].includes(entry.purposeSource),
            `${entry.key} must identify its purpose-copy source`);
    }
});

test('README generated reference is current and anchors every setting exactly once', () => {
    const entries = collectReferenceEntries();
    const block = renderSettingsReference(entries);
    assert.equal(block.startsWith(BEGIN_MARKER), true);
    assert.equal(block.endsWith(END_MARKER), true);
    assert.equal(replaceReference(readme, block), readme,
        'README settings reference is stale; run npm run generate:settings-reference');
    for (const entry of entries) {
        const anchor = `id="setting-${entry.key}"`;
        assert.equal(readme.split(anchor).length - 1, 1,
            `${entry.key} must have exactly one knowledgebase anchor`);
    }
});

test('README reference groups every canonical category in schema order', () => {
    let previous = -1;
    for (const category of schema.CATEGORIES) {
        const firstEntry = schema.SETTINGS_SCHEMA.find((entry) => entry.category === category && !entry.internal);
        assert.ok(firstEntry, `${category} needs at least one user-facing setting`);
        const index = readme.indexOf(`id="setting-${firstEntry.key}"`);
        assert.ok(index > previous, `${category} must follow canonical schema category order`);
        previous = index;
    }
});

test('a pipe anywhere in an entry is escaped, not just in the purpose column', () => {
    // Latent when this was written: no shipped value contains a pipe. It stays
    // latent only by luck, and the --check gate cannot catch it — the generator
    // and README would agree on the same truncated table.
    const entry = {
        key: 'pipeFixture',
        title: 'Title | with pipe',
        purpose: 'Purpose | with pipe',
        category: 'general',
        type: 'string',
        defaultValue: 'a|b',
        knownValues: ['left|right', 'plain'],
        risk: 'safe',
        profile: 'both',
        scope: 'global',
        vehicle: 'both',
        immediateApply: true,
        destroyRequired: false,
        internal: false,
        since: '4.72.0'
    };

    const row = renderEntry(entry);
    const cells = row.split(/(?<!\\)\|/).slice(1, -1);
    assert.equal(cells.length, 4,
        `a pipe in any cell must not split the row into extra columns, got ${cells.length}`);
    assert.match(row, /Title \\\| with pipe/, 'the title pipe must be escaped');
    assert.match(row, /Purpose \\\| with pipe/, 'the purpose pipe must be escaped');
    assert.doesNotMatch(row.replace(/\\\|/g, ''), /a\|b|left\|right/,
        'no unescaped pipe may survive from a default or an enum value');
});
