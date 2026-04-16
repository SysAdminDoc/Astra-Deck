'use strict';

const fs = require('fs');
const path = require('path');

const USERSCRIPT_CANDIDATES = Object.freeze([
    'YTKit.user.js',
    'ytkit.user.js'
]);

function resolveUserscriptPath(repoRoot = path.join(__dirname, '..')) {
    for (const candidate of USERSCRIPT_CANDIDATES) {
        const fullPath = path.join(repoRoot, candidate);
        if (fs.existsSync(fullPath)) {
            return fullPath;
        }
    }

    throw new Error(
        `Could not find userscript source. Tried: ${USERSCRIPT_CANDIDATES.join(', ')}`
    );
}

function getUserscriptBasename(repoRoot) {
    return path.basename(resolveUserscriptPath(repoRoot));
}

module.exports = {
    getUserscriptBasename,
    resolveUserscriptPath,
    USERSCRIPT_CANDIDATES
};
