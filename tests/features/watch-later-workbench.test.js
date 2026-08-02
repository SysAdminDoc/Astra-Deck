'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ytkitSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'extension', 'ytkit.js'), 'utf8');

// Window widened when the removal path gained dropdown-ownership checks —
// these slices are length-sensitive.
function featureSlice(id, span = 28000) {
    const start = ytkitSource.indexOf(`id: '${id}'`);
    assert.notEqual(start, -1, `feature ${id} must exist in ytkit.js`);
    return ytkitSource.slice(start, start + span);
}

test('watchLaterWorkbench only activates on the WL playlist and bounds removal sessions', () => {
    const block = featureSlice('watchLaterWorkbench');
    assert.match(block, /params\.get\('list'\) === 'WL'/,
        'workbench must gate on the Watch Later playlist');
    assert.match(block, /_BATCH_LIMIT: 25/,
        'removal sessions are bounded to 25 rows per run');
    assert.match(block, /_PACE_MS: 400/,
        'removal clicks are paced at 400ms');
    assert.match(block, /matched\.slice\(0, this\._BATCH_LIMIT\)/,
        'each run consumes at most one batch');
});

test('watchLaterWorkbench keeps a capped removal log for recovery', () => {
    const block = featureSlice('watchLaterWorkbench');
    assert.match(block, /_LOG_KEY: 'ytkit-wl-removal-log'/,
        'removal log persists under a stable storage key');
    assert.match(block, /log\.slice\(-500\)/,
        'removal log is capped at 500 entries');
    assert.match(block, /Recovery list is in the removal log/,
        'completion toast points users at the recovery log');
});

test('watchLaterWorkbench filters, sorts, and exports the loaded scan', () => {
    const block = featureSlice('watchLaterWorkbench');
    assert.match(block, /watchedPct/,
        'scan must capture the watched percentage per row');
    assert.match(block, /duration-asc/,
        'preview supports duration sorting');
    assert.match(block, /videoId,title,channel,durationSec,watchedPct,url/,
        'CSV export carries the full column set');
    assert.match(block, /_csvEscape/,
        'CSV fields must be escaped');
    assert.match(block, /Scroll the playlist to load more rows/,
        'status must disclose that only loaded rows are covered (no silent cap)');
});

test('watchLaterWorkbench routes its user-facing copy through locale keys', () => {
    const block = featureSlice('watchLaterWorkbench');
    assert.match(block, /heading\.textContent = t\('feature_watchLaterWorkbench_name', 'Watch Later Workbench'\)/,
        'panel title must route through t()');
    assert.match(block, /t\('wlwbPanelAria', 'Watch Later workbench'\)/,
        'panel dialog aria-label must route through t()');
    assert.match(block, /t\('wlwbStatusTpl', /,
        'preview status must route through the {matched}/{loaded} template key');
    assert.match(block, /t\('wlwbRemoveMatchedTpl', /,
        'run button label must route through the {limit} template key');
    const en = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', '_locales', 'en', 'messages.json'), 'utf8'));
    for (const key of ['wlwbPanelAria', 'wlwbStatusTpl', 'wlwbRemoveMatchedTpl', 'wlwbOpenBtn']) {
        assert.ok(en[key]?.message, `en messages must define ${key}`);
    }
});

test('watchLaterWorkbench cleans up its UI on destroy', () => {
    const block = featureSlice('watchLaterWorkbench');
    assert.match(block, /removeNavigateRule\('watchLaterWorkbench'\)/);
    assert.match(block, /this\._panel\?\.remove\(\)/);
});

test('watchLaterWorkbench verifies the open menu belongs to the row it is removing', () => {
    // YouTube reuses one shared iron-dropdown for every row menu. Opening the
    // menu and waiting a fixed 120ms could click the previous row's entry
    // during a slow rebind — removing the wrong video and counting it as a
    // success.
    const block = featureSlice('watchLaterWorkbench');
    assert.match(block, /_openDropdown\(\)/,
        'removal must find the actually-open dropdown, not any menu markup');
    assert.match(block, /_waitFor\(\s*\n?\s*\(\) => this\._openDropdown\(\)\?\.querySelector/,
        'removal must wait for this row\'s menu to open instead of a fixed delay');
    assert.doesNotMatch(block, /menuBtn\.click\(\);\s*\n\s*await new Promise\(r => setTimeout\(r, 120\)\)/,
        'the fixed 120ms menu wait must be gone');
    assert.match(block, /_menuItemOwnership\(node, videoId\)/,
        'menu items must be checked against the row\'s video id');
    assert.match(block, /removal\.removedVideoId \|\| removal\.setVideoId/,
        'ownership must read the removal endpoint\'s target video');
    assert.match(block, /this\._menuItemOwnership\(structural, entry\.videoId\) === false/,
        'a menu that names a different video must abort the removal');
    assert.match(block, /remove from/i,
        'the locale-independent text fallback must survive for unreadable endpoints');
});
