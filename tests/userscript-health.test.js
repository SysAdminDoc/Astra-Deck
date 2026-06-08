// tests/userscript-health.test.js
//
// v4.47.0 NEW-2 (Pass-3 research): drift detection across the three
// top-level userscripts. Only YTKit.user.js is auto-synced by
// build-extension.js — theater-split.user.js and YT_Reaction_Spammer.user.js
// are hand-maintained and can drift silently. The bug class:
// theater-split.user.js's fullscreen handler was leaking the chat overlay
// on live videos for an unknown stretch of time before a Pass-3 audit
// caught it (see CHANGELOG [Unreleased] stickyVideo + theater-split.user.js
// fullscreen entry). This test pins the invariants every standalone
// userscript must carry so future drift fails before it ships.
//
// Scope: metadata block well-formedness, @match consistency, version-
// in-header == version-in-body parity, and a small set of "this fix
// shipped" pins for known regressions.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');

// Per the the project notes Continuation Brief 2026-04-24 the @name header
// drifted vs the @version header on theater-split.user.js (1.0.5 vs
// 1.0.6) and Tampermonkey can use either as the "is this the same
// script?" key — keep them in sync.
const STANDALONE_USERSCRIPTS = [
    {
        file: 'YTKit.user.js',
        // YTKit is auto-synced by sync-userscript.js so its version
        // tracks the extension's YTKIT_VERSION; we still validate the
        // metadata block shape.
        requiresExcludes: ['m.youtube.com', 'studio.youtube.com'],
        liveChatOnly: false,
    },
    {
        file: 'theater-split.user.js',
        requiresExcludes: ['m.youtube.com', 'studio.youtube.com'],
        liveChatOnly: false,
    },
    {
        file: 'YT_Reaction_Spammer.user.js',
        // Live-chat-only by design: @match targets *only* /live_chat
        // routes. Per RESEARCH_FEATURE_PLAN Non-Goals, this script
        // should never escape live-chat scope to keep
        // automated-behavior surface small.
        requiresExcludes: [],
        liveChatOnly: true,
    },
];

function readUserscript(file) {
    return fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
}

function extractMetadataBlock(source) {
    const start = source.indexOf('// ==UserScript==');
    const end = source.indexOf('// ==/UserScript==');
    if (start === -1 || end === -1 || end <= start) return null;
    return source.slice(start, end + '// ==/UserScript=='.length);
}

function metadataValue(block, key) {
    // Tampermonkey metadata syntax: `// @key   value`. Captures the
    // first occurrence (some keys like @match repeat — caller can
    // build a multi-value extractor instead).
    const re = new RegExp(`^//\\s*@${key}\\s+(.+?)\\s*$`, 'm');
    const m = block.match(re);
    return m ? m[1].trim() : null;
}

function metadataValues(block, key) {
    const re = new RegExp(`^//\\s*@${key}\\s+(.+?)\\s*$`, 'gm');
    const out = [];
    let m;
    while ((m = re.exec(block)) !== null) out.push(m[1].trim());
    return out;
}

for (const desc of STANDALONE_USERSCRIPTS) {
    test(`userscript-health: ${desc.file} carries a well-formed metadata block`, () => {
        const src = readUserscript(desc.file);
        const block = extractMetadataBlock(src);
        assert.ok(block, `${desc.file}: must contain a // ==UserScript== ... // ==/UserScript== block`);
        for (const required of ['name', 'version', 'match', 'run-at', 'grant']) {
            assert.ok(
                metadataValue(block, required) !== null,
                `${desc.file}: metadata block must declare @${required}`,
            );
        }
    });

    test(`userscript-health: ${desc.file} @match / @exclude scope matches its declared role`, () => {
        const src = readUserscript(desc.file);
        const block = extractMetadataBlock(src);
        assert.ok(block, `${desc.file}: metadata block must exist`);
        const matches = metadataValues(block, 'match');
        const excludes = metadataValues(block, 'exclude');

        if (desc.liveChatOnly) {
            assert.ok(
                matches.every((m) => /\/live_chat/.test(m)),
                `${desc.file}: every @match must target /live_chat (script is scoped to live chat only)`,
            );
        } else {
            // General-purpose YouTube userscripts must explicitly exclude
            // mobile + studio so the script doesn't load on surfaces it
            // wasn't designed for.
            for (const needle of desc.requiresExcludes) {
                assert.ok(
                    excludes.some((e) => e.includes(needle)),
                    `${desc.file}: must @exclude ${needle} (general-purpose script)`,
                );
            }
        }
    });

    test(`userscript-health: ${desc.file} header @version matches @name version suffix when present`, () => {
        // The the project notes Continuation Brief 2026-04-24 documents that
        // theater-split.user.js drifted v1.0.5 (@name) vs v1.0.6
        // (@version) — a userscript manager keyed on @name treats the
        // script as unchanged and the version bump never lands. Pin
        // the invariant.
        const src = readUserscript(desc.file);
        const block = extractMetadataBlock(src);
        const nameValue = metadataValue(block, 'name') || '';
        const versionValue = metadataValue(block, 'version') || '';
        const versionInName = nameValue.match(/v(\d+\.\d+\.\d+)/);
        if (versionInName) {
            assert.equal(
                versionInName[1],
                versionValue,
                `${desc.file}: @name suffix v${versionInName[1]} must match @version ${versionValue}`,
            );
        }
        // Standalone version string sanity: semver shape.
        assert.match(
            versionValue,
            /^\d+\.\d+\.\d+$/,
            `${desc.file}: @version must be a x.y.z semver triple (got ${JSON.stringify(versionValue)})`,
        );
    });

    test(`userscript-health: ${desc.file} @namespace + @updateURL + @downloadURL point at the project (or are absent)`, () => {
        const src = readUserscript(desc.file);
        const block = extractMetadataBlock(src);
        const ns = metadataValue(block, 'namespace');
        const upd = metadataValue(block, 'updateURL');
        const dl = metadataValue(block, 'downloadURL');
        // namespace + update URLs are optional; when present they must
        // point at github.com/SysAdminDoc/... (project ownership) so
        // a Tampermonkey auto-update can't be hijacked by a fork.
        if (ns) {
            assert.ok(
                /SysAdminDoc/.test(ns),
                `${desc.file}: @namespace must reference SysAdminDoc (got ${JSON.stringify(ns)})`,
            );
        }
        if (upd) {
            assert.ok(
                /SysAdminDoc\/Astra-Deck/.test(upd) || /SysAdminDoc\/yt-reaction-spammer/.test(upd),
                `${desc.file}: @updateURL must point at a SysAdminDoc project (got ${JSON.stringify(upd)})`,
            );
        }
        if (dl) {
            assert.ok(
                /SysAdminDoc\/Astra-Deck/.test(dl) || /SysAdminDoc\/yt-reaction-spammer/.test(dl),
                `${desc.file}: @downloadURL must point at a SysAdminDoc project (got ${JSON.stringify(dl)})`,
            );
        }
    });
}

test('userscript-health: theater-split.user.js retains the Pass-3 fullscreen-overlay-stash fix', () => {
    // The Pass-3 audit caught a bug where the fullscreen handler
    // hid splitWrapper while the player was still inside it (breaking
    // fullscreen on live videos) and left the chat overlay rendering
    // on top. The fix introduced fullscreenStash + enterFullscreenStash
    // + exitFullscreenStash. Pin the helpers + the stash semantics
    // so a future "while you're in there" refactor can't quietly
    // regress this.
    const src = readUserscript('theater-split.user.js');
    assert.match(src, /let fullscreenStash\s*=\s*null/,
        'theater-split.user.js must declare let fullscreenStash = null');
    assert.match(src, /function enterFullscreenStash\(\)/,
        'theater-split.user.js must define enterFullscreenStash()');
    assert.match(src, /function exitFullscreenStash\(\)/,
        'theater-split.user.js must define exitFullscreenStash()');
    // Enter must (a) move the player out of the wrapper (so wrapper
    // display:none doesn't trip the Chromium exit-fullscreen rule)
    // and (b) hide every positioned overlay.
    assert.match(src, /document\.body\.appendChild\(player\)/,
        'enterFullscreenStash must move the player onto <body> while fullscreen is active');
    assert.match(src, /el\.style\.setProperty\(['"]visibility['"],\s*['"]hidden['"],\s*['"]important['"]\)/,
        'enterFullscreenStash must hide positioned overlays with visibility:hidden !important');
});

test('userscript-health: YT_Reaction_Spammer.user.js retains the v0.3.0 N3 500 ms floor', () => {
    // v0.3.0 N3 introduced MIN_INTERVAL_MS = 500 to keep the spam
    // rate below YouTube's automated-behavior heuristics threshold.
    // Lowering it is a store-policy and reputation hazard.
    const src = readUserscript('YT_Reaction_Spammer.user.js');
    assert.match(src, /const\s+MIN_INTERVAL_MS\s*=\s*500/,
        'YT_Reaction_Spammer.user.js must keep MIN_INTERVAL_MS at 500 (v0.3.0 N3 safety floor)');
});
