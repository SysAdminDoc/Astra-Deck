'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findBalancedObjectLiteral } = require('../scripts/catalog-utils');

// ── searchFilterDefaults: sp values must be raw (not double-encoded) ──

test('searchFilterDefaults sp values are valid base64 sort parameters', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');

    // Extract the spMap from the searchFilterDefaults feature
    const spMapMatch = source.match(/const spMap\s*=\s*\{([^}]+)\}/);
    assert.ok(spMapMatch, 'spMap should exist in source');

    const spMapStr = spMapMatch[1];
    // Values should NOT contain %25 (double-encoded percent signs)
    assert.ok(!spMapStr.includes('%25'), 'sp values must not be double-encoded (%25 found)');

    // Values should be raw base64: CAI=, CAM=, CAE=
    assert.ok(spMapStr.includes("'CAI='") || spMapStr.includes('"CAI="'), 'upload_date should map to CAI=');
    assert.ok(spMapStr.includes("'CAM='") || spMapStr.includes('"CAM="'), 'view_count should map to CAM=');
    assert.ok(spMapStr.includes("'CAE='") || spMapStr.includes('"CAE="'), 'rating should map to CAE=');
});

// ── _sanitizeFilename: must preserve Unicode characters ──

test('_sanitizeFilename preserves Unicode and produces valid filenames', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');

    // Verify the sanitizer no longer strips non-ASCII
    assert.ok(!source.includes("[^\\x00-\\x7F]"), '_sanitizeFilename must not strip non-ASCII characters');
    // Verify it strips control characters
    assert.ok(source.includes("[\\x00-\\x1f]") || source.includes('\\x00-\\x1f'), '_sanitizeFilename should strip control characters');
});

test('copyVideoTitle uses a clipboard fallback path and clears reset timers', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');

    const start = source.indexOf("id: 'copyVideoTitle'");
    const end = source.indexOf("id: 'channelAgeDisplay'");
    assert.ok(start > -1 && end > start, 'copyVideoTitle block should exist');

    const block = source.slice(start, end);
    assert.ok(block.includes("document.execCommand('copy')"), 'copyVideoTitle should fall back to document.execCommand(\'copy\')');
    assert.ok(block.includes('_resetTimer'), 'copyVideoTitle should keep a reset timer for transient button states');
    assert.ok(block.includes('this._clearResetTimer();'), 'copyVideoTitle should clear reset timers during lifecycle changes');
});

test('downloadThumbnail uses shared video id parsing and mutation retries', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');

    const start = source.indexOf("id: 'downloadThumbnail'");
    const end = source.indexOf("id: 'grayscaleThumbnails'");
    assert.ok(start > -1 && end > start, 'downloadThumbnail block should exist');

    const block = source.slice(start, end);
    assert.ok(block.includes('const videoId = getVideoId();'), 'downloadThumbnail should use getVideoId() for the active video');
    assert.ok(block.includes("addMutationRule('downloadThumbnail'"), 'downloadThumbnail should retry when the watch action row hydrates late');
    assert.ok(block.includes('_sanitizeFilename('), 'downloadThumbnail should sanitize title-based filenames');
});

test('videoResolutionBadge supports SD and avoids direct thumbnail style mutation', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');

    const start = source.indexOf("id: 'videoResolutionBadge'");
    const end = source.indexOf("id: 'likeViewRatio'");
    assert.ok(start > -1 && end > start, 'videoResolutionBadge block should exist');

    const block = source.slice(start, end);
    assert.ok(block.includes("label: 'SD'"), 'videoResolutionBadge should include an SD quality path');
    assert.ok(block.includes("thumb.classList.add('ytkit-res-host')"), 'videoResolutionBadge should use a host class for positioning');
    assert.ok(!block.includes("thumb.style.position = 'relative'"), 'videoResolutionBadge should not mutate thumbnail inline position styles');
});

test('playlistEnhancer restores duplicate hiding and copy fallback behavior', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');

    const start = source.indexOf("id: 'playlistEnhancer'");
    const end = source.indexOf("id: 'commentSearch'");
    assert.ok(start > -1 && end > start, 'playlistEnhancer block should exist');

    const block = source.slice(start, end);
    assert.ok(block.includes('Hide Duplicates'), 'playlistEnhancer should expose a duplicate-hiding control');
    assert.ok(block.includes("document.execCommand('copy')"), 'playlistEnhancer should fall back to document.execCommand(\'copy\') for URL copy');
    assert.ok(block.includes("addMutationRule('playlistEnhancer'"), 'playlistEnhancer should resync when playlist panel content hydrates late');
});

test('customSpeedButtons rebinds to swapped videos and exposes pressed states', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');

    const start = source.indexOf("id: 'customSpeedButtons'");
    const end = source.indexOf("id: 'openInNewTab'");
    assert.ok(start > -1 && end > start, 'customSpeedButtons block should exist');

    const block = source.slice(start, end);
    assert.ok(block.includes('_bindVideo(video)'), 'customSpeedButtons should rebind when the active video element changes');
    assert.ok(block.includes("addMutationRule('customSpeedButtons'"), 'customSpeedButtons should resync during late watch-page hydration');
    assert.ok(block.includes("button.setAttribute('aria-pressed'"), 'customSpeedButtons should expose active preset state via aria-pressed');
});

test('videoScreenshot exposes capture states and mutation-driven reinjection', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');

    const start = source.indexOf("id: 'videoScreenshot'");
    const end = source.indexOf("id: 'perChannelSpeed'");
    assert.ok(start > -1 && end > start, 'videoScreenshot block should exist');

    const block = source.slice(start, end);
    assert.ok(block.includes("_setState('capturing')"), 'videoScreenshot should expose an explicit capturing state');
    assert.ok(block.includes('_copyBlobToClipboard(blob)'), 'videoScreenshot should report clipboard-copy outcomes instead of silently ignoring them');
    assert.ok(block.includes("addMutationRule('videoScreenshot'"), 'videoScreenshot should recover when player controls hydrate late');
    assert.ok(block.includes("btn.addEventListener('click'"), 'videoScreenshot should use an event listener rather than relying on btn.onclick');
});

// ── textarea input handler: must be debounced ──

test('textarea input handler uses debounce for feature reinit', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');

    // Find the textarea input handler section
    const idx = source.indexOf('_textareaReinitTimer');
    assert.ok(idx > -1, 'textarea reinit should use a debounce timer (_textareaReinitTimer)');

    // Should not have direct destroy/init in the input handler without debounce
    const handlerSection = source.substring(
        source.indexOf("// Textarea input"),
        source.indexOf("// Select dropdown")
    );
    assert.ok(handlerSection.includes('setTimeout'), 'textarea handler should use setTimeout for debounce');
});

// ── textarea value: must use nullish coalescing ──

test('textarea value uses nullish coalescing to preserve falsy values', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');

    // The textarea value assignment should use ?? not ||
    const textareaValueMatch = source.match(/textarea\.value\s*=\s*appState\.settings\[f\.settingKey \|\| f\.id\]\s*\?\?/);
    assert.ok(textareaValueMatch, 'textarea value should use ?? operator, not ||');
});

// ── guard block: all destructured functions must be checked ──

test('guard block checks all destructured core functions', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');

    // Key functions that must be in the guard block
    const mustGuard = [
        'flushPendingStorageWrites',
        'shouldBuildPrimaryUI',
        'isTopLevelFrame',
        'isLiveChatFrame',
        'storageReadJSON',
        'storageWriteJSON',
    ];

    const guardBlock = source.substring(
        source.indexOf('if (\n        !addMutationRule'),
        source.indexOf("console.error('[YTKit] Core helpers missing")
    );

    for (const fn of mustGuard) {
        assert.ok(guardBlock.includes(`!${fn}`), `guard block must check for ${fn}`);
    }
});

test('MediaDL probe rejects legacy localhost services without Astra health identity', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');

    const start = source.indexOf('const MediaDLManager = {');
    const end = source.indexOf('showInstallPrompt(mode)', start);
    assert.ok(start > -1 && end > start, 'MediaDLManager block should exist');

    const block = source.slice(start, end);
    assert.ok(block.includes("_SERVICE_ID: 'astra-downloader'"), 'MediaDLManager should define the expected service id');
    assert.ok(block.includes('data.service === this._SERVICE_ID'), 'MediaDLManager should prefer explicit Astra health identity');
    assert.ok(block.includes('data.token_required === true && Number.isInteger(data.port)'), 'MediaDLManager should only accept legacy health responses with the Astra schema');
    assert.ok(block.includes('Ignoring non-Astra downloader response'), 'MediaDLManager should log ignored localhost impostor responses');
});

// ── findBalancedObjectLiteral: edge cases ──

test('findBalancedObjectLiteral handles nested braces in strings', () => {
    const source = `
        defaults: {
            key: "value with { braces }",
            nested: { a: 1 }
        }
    `;
    const result = findBalancedObjectLiteral(source, 'defaults:');
    assert.ok(result, 'should find the object literal');
    assert.ok(result.startsWith('{'), 'should start with {');
    assert.ok(result.endsWith('}'), 'should end with }');
});

test('findBalancedObjectLiteral handles template literals', () => {
    const source = "defaults: { key: `template with { braces }`, b: 2 }";
    const result = findBalancedObjectLiteral(source, 'defaults:');
    assert.ok(result, 'should handle template literals');
    assert.ok(result.includes('b: 2'), 'should include full object');
});

test('findBalancedObjectLiteral handles comments with braces', () => {
    const source = `
        defaults: {
            // this { brace should be ignored
            key: true,
            /* also { this one } */
            other: false
        }
    `;
    const result = findBalancedObjectLiteral(source, 'defaults:');
    assert.ok(result, 'should handle comments');
    assert.ok(result.includes('other: false'), 'should include full object after comments');
});

test('findBalancedObjectLiteral returns null for missing token', () => {
    assert.equal(findBalancedObjectLiteral('no match here', 'defaults:'), null);
});

// ── Hardening pass: ensure previously-dead unsafe innerHTML assignments stayed removed ──

test('ytkit.js has no unsafe innerHTML reset on freshly created elements', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');

    // Pattern: assign innerHTML to empty string on a variable that was just
    // created via document.createElement. Such assignments are dead code and
    // also trigger Trusted Types violations on strict YouTube pages.
    const badPattern = /document\.createElement\([^)]+\)[\s\S]{0,200}?\.innerHTML\s*=\s*['"]['"]\s*;/;
    assert.ok(!badPattern.test(source), 'freshly created DOM elements must not be reset via innerHTML = ""');
});

test('ytkit.js Reddit discussion links validate permalink via URL constructor', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');

    // The hardened flow replaces raw concatenation with a URL constructor
    // guard that also requires the result to stay on reddit.com.
    assert.ok(source.includes("new URL(String(d.permalink || ''), 'https://www.reddit.com')"),
        'Reddit permalink should be normalised through the URL constructor');
    assert.ok(/reddit discussion|ytkit-rc-row[\s\S]*?rel = 'noopener noreferrer'/i.test(source)
        || source.includes("row.rel = 'noopener noreferrer';"),
        'Reddit discussion rows should set rel="noopener noreferrer"');
});

test('subtitle download no longer carries the unused unsafe _decode helper', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');

    // Dead code that violated Trusted Types has been removed.
    assert.ok(!/_decode\s*\(\s*s\s*\)\s*\{[\s\S]{0,100}?t\.innerHTML\s*=\s*s/.test(source),
        'subtitle _decode(s) with innerHTML=s must stay removed');
});

test('blocked channel avatar initial survives surrogate-pair names', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');

    // Array.from() iterates by code point so emoji/CJK-only channel names
    // no longer render half of a surrogate pair in the avatar bubble.
    assert.ok(source.includes("Array.from(ch.name || ch.id || '?')[0]"),
        'blocked channel avatar initial should iterate by code point, not UTF-16 unit');
});

test('download progress panel close button stops the poll interval immediately', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');

    // The close handler now clears the 1 s poll interval synchronously so we
    // don't keep hitting the local downloader for a panel the user dismissed.
    const start = source.indexOf('function showDownloadProgress');
    assert.ok(start > -1, 'showDownloadProgress should exist');
    const block = source.slice(start, start + 6000);
    assert.ok(/closeBtn\.addEventListener\('click'[\s\S]*?clearInterval\(pollInterval\)[\s\S]*?panel\.remove\(\)/.test(block),
        'close button should clearInterval(pollInterval) before removing the panel');
});

test('handleFileImport guards against oversized files and FileReader errors', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');

    const start = source.indexOf('function handleFileImport');
    assert.ok(start > -1, 'handleFileImport should exist');
    const block = source.slice(start, start + 1500);
    assert.ok(block.includes('IMPORT_MAX_BYTES'), 'handleFileImport should enforce an import size cap');
    assert.ok(block.includes('reader.onerror'), 'handleFileImport should surface FileReader errors');
});

test('core storage retry rebuild uses a prototype-less merge target', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'core', 'storage.js'), 'utf8');

    // Regression check: before this fix, a retry would replace the no-prototype
    // pendingStorageWrites with a regular object literal, reintroducing a
    // proto-pollution footgun on a hot storage path.
    assert.ok(!/pendingStorageWrites\s*=\s*\{\s*\.\.\.writes/.test(source),
        'storage retry must not rebuild pendingStorageWrites with an object literal');
    assert.ok(source.includes('Object.create(null)'),
        'storage module should keep using Object.create(null) for pending writes');
});
