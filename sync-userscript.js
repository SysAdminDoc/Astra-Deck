#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { getUserscriptBasename, resolveUserscriptPath } = require('./scripts/repo-paths');

const REPO_ROOT = __dirname;
const EXTENSION_SOURCE = path.join(REPO_ROOT, 'extension', 'ytkit.js');
const USERSCRIPT_SOURCE = resolveUserscriptPath(REPO_ROOT);
const USERSCRIPT_BASENAME = getUserscriptBasename(REPO_ROOT);
const USERSCRIPT_RAW_URL = `https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/${USERSCRIPT_BASENAME}`;

const extensionText = fs.readFileSync(EXTENSION_SOURCE, 'utf8');
const versionMatch = extensionText.match(/const YTKIT_VERSION = '([^']+)'/);
if (!versionMatch) {
    console.error('Could not find YTKIT_VERSION in extension/ytkit.js');
    process.exit(1);
}

const targetVersion = versionMatch[1];
let userscriptText = fs.readFileSync(USERSCRIPT_SOURCE, 'utf8');
const before = userscriptText;

userscriptText = userscriptText.replace(/^(\/\/ @name\s+)YTKit v[\d.]+/m, `$1YTKit v${targetVersion}`);
userscriptText = userscriptText.replace(/^(\/\/ @version\s+)[\d.]+/m, `$1${targetVersion}`);
userscriptText = userscriptText.replace(/^(\/\/ @updateURL\s+).+$/m, `$1${USERSCRIPT_RAW_URL}`);
userscriptText = userscriptText.replace(/^(\/\/ @downloadURL\s+).+$/m, `$1${USERSCRIPT_RAW_URL}`);
userscriptText = userscriptText.replace(/const YTKIT_VERSION = '[^']+';/, `const YTKIT_VERSION = '${targetVersion}';`);

if (userscriptText === before) {
    console.log(`Userscript already aligned to v${targetVersion}`);
    process.exit(0);
}

fs.writeFileSync(USERSCRIPT_SOURCE, userscriptText, 'utf8');
console.log(`Userscript metadata synced to v${targetVersion} (${path.basename(USERSCRIPT_SOURCE)})`);
