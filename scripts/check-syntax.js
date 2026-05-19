#!/usr/bin/env node
'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const { resolveUserscriptPath } = require('./repo-paths');

const repoRoot = path.join(__dirname, '..');
const filesToCheck = [
    'build-extension.js',
    'sync-userscript.js',
    'extension/background.js',
    'extension/popup.js',
    'extension/ytkit.js',
    'extension/ytkit-main.js',
    'extension/core/api-limiter.js',
    'extension/core/env.js',
    'extension/core/navigation.js',
    'extension/core/page.js',
    'extension/core/player.js',
    'extension/core/registry.js',
    'extension/core/selectors.js',
    'extension/core/storage.js',
    'extension/core/styles.js',
    'extension/core/trusted-html.js',
    'extension/core/url.js',
    'scripts/audit-storage-size.js',
    'scripts/audit-popup-a11y.js',
    'scripts/catalog-utils.js',
    'scripts/check-i18n.js',
    'scripts/check-syntax.js',
    'scripts/check-versions.js',
    'scripts/check-contrast.js',
    'scripts/eslint-rules/no-post-await-addlistener.js',
    'scripts/repo-paths.js',
    'eslint.config.js'
].map((relativePath) => path.join(repoRoot, relativePath));

filesToCheck.push(resolveUserscriptPath(repoRoot));

const optionalScriptChecks = [
    'YT_Reaction_Spammer.user.js'
].map((relativePath) => path.join(repoRoot, relativePath));

for (const filePath of optionalScriptChecks) {
    if (require('fs').existsSync(filePath)) filesToCheck.push(filePath);
}

for (const filePath of filesToCheck) {
    execFileSync(process.execPath, ['--check', filePath], { stdio: 'inherit' });
}
