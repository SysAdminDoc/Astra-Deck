'use strict';

// YTKit.user.js loads its three libraries from jsDelivr pinned to a commit.
// jsDelivr builds that from the whole repository at the commit and refuses
// anything over 50 MB ("Package size exceeded the configured limit"), so a
// heavy tracked tree breaks every userscript install even though each file
// is small. v4.101.x and v4.102.0 shipped at about 77 MB, nearly all of it
// superseded settings mockups in outputs/.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
// Headroom under jsDelivr's 50 MB so a release or a screenshot refresh
// doesn't land right on the edge.
const BUDGET_BYTES = 45 * 1024 * 1024;

function trackedFiles() {
    try {
        return execFileSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT, stdio: 'pipe', windowsHide: true })
            .toString('utf8')
            .split('\0')
            .filter(Boolean);
    } catch {
        return null;
    }
}

test('the tracked tree stays under the jsDelivr package limit the userscript @require pins need', (t) => {
    const files = trackedFiles();
    if (!files) {
        t.skip('not a git checkout');
        return;
    }
    let total = 0;
    const sizes = [];
    for (const file of files) {
        let size = 0;
        try {
            size = fs.statSync(path.join(REPO_ROOT, file)).size;
        } catch {
            continue;
        }
        total += size;
        sizes.push([size, file]);
    }
    const largest = sizes.sort((a, b) => b[0] - a[0]).slice(0, 5)
        .map(([size, file]) => `${(size / 1048576).toFixed(1)} MB ${file}`).join(', ');
    assert.ok(total < BUDGET_BYTES,
        `tracked files total ${(total / 1048576).toFixed(1)} MB, budget ${BUDGET_BYTES / 1048576} MB. Largest: ${largest}`);
});

test('every image README and the social preview show is still tracked', () => {
    const files = trackedFiles();
    if (!files) return;
    const tracked = new Set(files);
    const sources = ['README.md', '.github/social-preview.svg'];
    for (const source of sources) {
        const text = fs.readFileSync(path.join(REPO_ROOT, source), 'utf8');
        for (const match of text.matchAll(/outputs\/[A-Za-z0-9._-]+\.png/g)) {
            assert.ok(tracked.has(match[0]), `${source} shows ${match[0]}, which isn't tracked`);
        }
    }
});
