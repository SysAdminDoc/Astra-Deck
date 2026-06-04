#!/usr/bin/env node
'use strict';

// Firefox 149 deprecated, and Firefox 152 removes, programmatic
// content-script injection into moz-extension:// documents. Astra Deck
// currently avoids the affected APIs entirely; this check keeps that
// audited state from silently changing.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const SCAN_ROOTS = ['extension'];
const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

const API_PATTERNS = [
    {
        api: 'scripting.executeScript',
        regex: /\b(?:(?:chrome|browser)\.)?scripting\.executeScript\s*\(/g,
    },
    {
        api: 'scripting.registerContentScripts',
        regex: /\b(?:(?:chrome|browser)\.)?scripting\.registerContentScripts\s*\(/g,
    },
    {
        api: 'tabs.executeScript',
        regex: /\b(?:(?:chrome|browser)\.)?tabs\.executeScript\s*\(/g,
    },
];

function walkFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'build') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...walkFiles(full));
        } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
            out.push(full);
        }
    }
    return out;
}

function lineInfo(text, index) {
    const before = text.slice(0, index);
    const lines = before.split(/\r?\n/);
    return {
        line: lines.length,
        column: lines[lines.length - 1].length + 1,
    };
}

function scanFile(filePath, repoRoot = REPO_ROOT) {
    const text = fs.readFileSync(filePath, 'utf8');
    const rel = path.relative(repoRoot, filePath).replace(/\\/g, '/');
    const findings = [];

    for (const { api, regex } of API_PATTERNS) {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(text)) !== null) {
            const { line, column } = lineInfo(text, match.index);
            const sourceLine = text.split(/\r?\n/)[line - 1]?.trim() || '';
            findings.push({
                api,
                file: rel,
                line,
                column,
                sourceLine,
            });
        }
    }

    return findings;
}

function scanFirefoxInjectionApis(repoRoot = REPO_ROOT) {
    const findings = [];
    for (const relRoot of SCAN_ROOTS) {
        const root = path.join(repoRoot, relRoot);
        if (!fs.existsSync(root)) continue;
        for (const file of walkFiles(root)) {
            findings.push(...scanFile(file, repoRoot));
        }
    }
    findings.sort((a, b) =>
        a.file.localeCompare(b.file) ||
        a.line - b.line ||
        a.column - b.column ||
        a.api.localeCompare(b.api)
    );
    return findings;
}

function main() {
    const findings = scanFirefoxInjectionApis();
    if (findings.length) {
        console.error('[check-firefox-injection] Programmatic injection APIs need Firefox 149/152 audit:');
        for (const finding of findings) {
            console.error(`  ${finding.file}:${finding.line}:${finding.column} ${finding.api} — ${finding.sourceLine}`);
        }
        console.error('Review each target and document why it cannot inject into moz-extension:// documents.');
        process.exit(1);
    }

    console.log('[check-firefox-injection] OK — no scripting/tabs programmatic injection call sites under extension/');
}

if (require.main === module) {
    main();
}

module.exports = {
    scanFirefoxInjectionApis,
};
