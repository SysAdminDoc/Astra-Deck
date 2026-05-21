#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { resolveUserscriptPath } = require('./repo-paths');

const repoRoot = path.join(__dirname, '..');

function listJsFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listJsFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            out.push(fullPath);
        }
    }
    return out;
}

const filesToCheck = [
    path.join(repoRoot, 'build-extension.js'),
    path.join(repoRoot, 'sync-userscript.js'),
    path.join(repoRoot, 'eslint.config.js'),
    ...listJsFiles(path.join(repoRoot, 'extension')),
    ...listJsFiles(path.join(repoRoot, 'scripts'))
];

filesToCheck.push(resolveUserscriptPath(repoRoot));

const optionalScriptChecks = [
    'YT_Reaction_Spammer.user.js'
].map((relativePath) => path.join(repoRoot, relativePath));

for (const filePath of optionalScriptChecks) {
    if (fs.existsSync(filePath)) filesToCheck.push(filePath);
}

for (const filePath of [...new Set(filesToCheck)].sort()) {
    execFileSync(process.execPath, ['--check', filePath], { stdio: 'inherit' });
}
