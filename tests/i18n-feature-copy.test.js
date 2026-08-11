'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { findFeatureCopyDrifts } = require('../scripts/check-i18n');

const repoRoot = path.join(__dirname, '..');
const sourcePath = path.join(repoRoot, 'extension', 'ytkit.js');
const messagesPath = path.join(repoRoot, 'extension', '_locales', 'en', 'messages.json');
const source = fs.readFileSync(sourcePath, 'utf8');
const messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));

test('English feature catalogue matches ytkit.js feature copy', () => {
    assert.deepStrictEqual(findFeatureCopyDrifts(messages, source), []);
});

test('feature catalogue gate catches an edited inline description', () => {
    const original = "description: 'One-toggle restoration of the pre-Delhi/Liquid Glass player look: opaque square controls, classic progress bar, original time display. CSS-only, no DOM rebuild.'";
    assert.ok(source.includes(original), 'fixture description must remain present in ytkit.js');

    const mutated = source.replace(original, "description: 'One-toggle restoration bait drift'");
    const findings = findFeatureCopyDrifts(messages, mutated);
    assert.ok(findings.some((finding) =>
        finding.type === 'drift' &&
        finding.key === 'feature_classicPlayerChrome_desc'
    ), 'editing inline feature copy must produce a catalog drift');
});
