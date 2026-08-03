#!/usr/bin/env node
'use strict';

// Guard the remaining YouTube aria-label selector debt. Existing selectors
// are tracked in a small ratchet baseline so this check can land without
// breaking the known compatibility fallbacks all at once. New selectors must
// move into a selector pack (or use a structural hook) before they ship.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const EXTENSION_ROOT = path.join(REPO_ROOT, 'extension');
const BASELINE_PATH = path.join(__dirname, 'localized-selector-baseline.json');
const SELECTOR_RE = /\[aria-label(?:\*|\^|\$)?=\s*(['"])(.*?)\1[^\]]*\]/g;

function normalizeSelector(selector) {
    return String(selector || '').replace(/\s+/g, ' ').trim();
}

function walkJavaScript(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) walkJavaScript(fullPath, out);
        else if (entry.isFile() && entry.name.endsWith('.js')) out.push(fullPath);
    }
    return out;
}

function isSelectorPack(relativePath) {
    return relativePath.replace(/\\/g, '/').startsWith('extension/core/selector-packs/');
}

function isIntentionalBlockedFallback(selector) {
    // Popout chat is separately operator-gated because it needs a fresh
    // authenticated live-chat capture. Keep it out of this ratchet until that
    // blocked item is reopened.
    return /aria-label\s*[*^$]?=\s*["']popout chat["']/i.test(selector);
}

function collectSelectorFindingsFromSource(source, relativePath) {
    const findings = [];
    let match;
    SELECTOR_RE.lastIndex = 0;
    while ((match = SELECTOR_RE.exec(String(source || '')))) {
        const selector = normalizeSelector(match[0]);
        if (isIntentionalBlockedFallback(selector)) continue;
        findings.push({
            key: `${relativePath}|${selector}`,
            file: relativePath,
            selector,
            index: match.index
        });
    }
    return findings;
}

function collectSelectorFindings(root = EXTENSION_ROOT) {
    const findings = [];
    for (const fullPath of walkJavaScript(root).sort()) {
        const relativePath = path.relative(REPO_ROOT, fullPath).replace(/\\/g, '/');
        if (isSelectorPack(relativePath)) continue;
        findings.push(...collectSelectorFindingsFromSource(
            fs.readFileSync(fullPath, 'utf8'),
            relativePath
        ));
    }
    const unique = new Map();
    for (const finding of findings) unique.set(finding.key, finding);
    return [...unique.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function readBaseline() {
    const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    if (!Array.isArray(parsed.findings)) throw new Error('localized-selector-baseline.json: findings must be an array');
    return new Set(parsed.findings.map(String));
}

function checkLocalizedSelectors() {
    const findings = collectSelectorFindings();
    const baseline = readBaseline();
    const additions = findings.filter((finding) => !baseline.has(finding.key));
    if (additions.length) {
        const details = additions
            .map((finding) => `  - ${finding.file}: ${finding.selector}`)
            .join('\n');
        throw new Error(
            `New English aria-label selector(s) detected outside selector packs. ` +
            `Move them behind a structural hook or add a reviewed fallback baseline entry:\n${details}`
        );
    }
    return { findings, additions };
}

if (require.main === module) {
    try {
        const result = checkLocalizedSelectors();
        console.log(`Localized selector gate passed (${result.findings.length} tracked fallback selectors).`);
    } catch (error) {
        console.error(`Localized selector gate failed: ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = {
    collectSelectorFindings,
    collectSelectorFindingsFromSource,
    checkLocalizedSelectors,
    isIntentionalBlockedFallback,
    normalizeSelector
};
