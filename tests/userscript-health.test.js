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
const {
    isResolvableRequireUrl,
} = require('../scripts/check-userscript-size');
const { LIBRARIES: USERSCRIPT_LIBRARIES, MAX_RECORD_BYTES } = require('../sync-userscript');
const { USERSCRIPT_FILES } = require('./helpers/source');

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

test('userscript-health: Greasy Fork records stay below the 2 MiB code cap', () => {
    const main = readUserscript('YTKit.user.js');
    // Every generated file is its own Greasy Fork record: the main script and
    // the three @require libraries that carry the extension's files.
    for (const file of USERSCRIPT_FILES) {
        assert.ok(Buffer.byteLength(readUserscript(file), 'utf8') < MAX_RECORD_BYTES,
            `${file} must remain below Greasy Fork’s per-record 2 MiB limit`);
    }
    // The raw-GitHub half of this used to accept the `main` branch. A branch
    // pointer is mutable, so the same @version could require different bytes
    // on different days; v4.88.3 pinned it to an immutable tag ref, and the
    // jsDelivr move pinned it to the tag's commit.
    const block = extractMetadataBlock(main);
    const requires = metadataValues(block, 'require');
    // Each URL ends in its #sha256= pin since the SRI change; the name is before it.
    assert.deepEqual(requires.map((url) => url.split('#')[0]).map((url) => url.slice(url.lastIndexOf('/') + 1)),
        USERSCRIPT_LIBRARIES.map(({ file }) => file),
        'YTKit.user.js must @require each library once, in the order the host expects to find them registered');
    for (const url of requires) {
        assert.ok(isResolvableRequireUrl(url),
            `${url} must be a commit-pinned jsDelivr URL or a numbered Greasy Fork record`);
    }
    // Greasy Fork takes libraries only from its CDN list, and raw GitHub
    // isn't on it. check-userscript-drift fails on the same list.
    const { findOffCdnLibraryUrls } = require('../sync-userscript');
    assert.deepEqual(findOffCdnLibraryUrls(main), [],
        'every @require and @resource comes from cdn.jsdelivr.net/gh/SysAdminDoc/Astra-Deck');
    const rawLocale = 'https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/refs/tags/v4.97.0/extension/_locales/de/messages.json';
    const withRaw = main.replace(/^(\/\/ @resource\s+astra-locale-de\s+)\S+$/m, `$1${rawLocale}`);
    assert.notEqual(withRaw, main, 'the positive control needs a German @resource to swap');
    assert.deepEqual(findOffCdnLibraryUrls(withRaw), [rawLocale],
        'a raw GitHub @resource is caught, not only a @require');
    assert.doesNotMatch(main, /^\/\/ @require\s+\S*Astra-Deck\/(?:main|master|refs\/heads\/)/m,
        'and never through a mutable branch pointer');
    assert.doesNotMatch(main, /REPLACE_WITH_GREASY_FORK_CORE_ID/,
        'YTKit.user.js must not ship a placeholder @require');
    assert.match(main, /^\/\/ @homepageURL\s+https:\/\/github\.com\/SysAdminDoc\/Astra-Deck/m,
        'YTKit.user.js must advertise the project homepage');
    assert.match(main, /^\/\/ @supportURL\s+https:\/\/github\.com\/SysAdminDoc\/Astra-Deck\/issues/m,
        'YTKit.user.js must advertise the project support page');
    assert.match(main, /^\/\/ @license\s+MIT$/m,
        'YTKit.user.js must declare its MIT license');
    assert.match(main, /^\/\/ @icon\s+https:\/\/raw\.githubusercontent\.com\/SysAdminDoc\/Astra-Deck\/main\/extension\/icons\/128\.png/m,
        'YTKit.user.js must declare the project icon');
    assert.match(main, /@connect\s+127\.0\.0\.1/,
        'YTKit.user.js must disclose local-companion traffic');
    // Both dependencies are disclosed where an install dialog shows them: the
    // libraries it pulls in, and the companion app downloads need.
    const description = metadataValue(block, 'description') || '';
    assert.match(description, /librar(?:y|ies)/i,
        'YTKit.user.js description must disclose the @require libraries');
    assert.match(description, /Astra Downloader companion/,
        'YTKit.user.js description must disclose the optional companion app');
});

test('userscript-health: core dependency gate rejects placeholders and unknown hosts', () => {
    // This used to assert that the raw `main` branch URL was acceptable. It
    // is not: a branch pointer is mutable, so a given @version could require
    // different bytes on different days, in a script that grants
    // GM_xmlhttpRequest to three AI providers and loopback. Only jsDelivr's
    // mirror at a commit (or, for the one bump commit before its tag exists,
    // at the release tag) or a numbered Greasy Fork record may resolve.
    // The URL must also carry the #sha256= of its bytes.
    const sha = `#sha256=${'a'.repeat(64)}`;
    const commit = 'c'.repeat(40);
    assert.equal(
        isResolvableRequireUrl(`https://cdn.jsdelivr.net/gh/SysAdminDoc/Astra-Deck@${commit}/YTKit-core.user.js${sha}`),
        true,
        'a commit-pinned, hash-pinned jsDelivr core must be accepted');
    assert.equal(
        isResolvableRequireUrl(`https://cdn.jsdelivr.net/gh/SysAdminDoc/Astra-Deck@v4.98.0/YTKit-core.user.js${sha}`),
        true,
        'so must the release-tag form a bump writes before its tag exists');
    assert.equal(
        isResolvableRequireUrl(`https://cdn.jsdelivr.net/gh/SysAdminDoc/Astra-Deck@${commit}/YTKit-core.user.js`),
        false,
        'a commit-pinned core with no hash must fail closed');
    for (const ref of ['main', 'latest', commit.slice(0, 7), `${commit}0`]) {
        assert.equal(
            isResolvableRequireUrl(`https://cdn.jsdelivr.net/gh/SysAdminDoc/Astra-Deck@${ref}/YTKit-core.user.js${sha}`),
            false,
            `jsDelivr @${ref} is a moving or partial ref and must fail closed`);
    }
    assert.equal(
        isResolvableRequireUrl(`https://cdn.jsdelivr.net/gh/SysAdminDoc/Astra-Deck/YTKit-core.user.js${sha}`),
        false,
        'jsDelivr with no ref serves the default branch and must fail closed');
    assert.equal(
        isResolvableRequireUrl(`https://cdn.jsdelivr.net/gh/someone-else/Astra-Deck@${commit}/YTKit-core.user.js${sha}`),
        false,
        'another owner\'s mirror must fail closed');
    assert.equal(
        isResolvableRequireUrl(
            `https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/refs/tags/v4.88.3/YTKit-core.user.js${sha}`),
        false,
        'the raw GitHub tag URL v4.88.3 to v4.97.0 shipped is not on Greasy Fork\'s CDN list');
    assert.equal(
        isResolvableRequireUrl(
            'https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/YTKit-core.user.js'),
        false,
        'a mutable branch pointer must fail closed');
    assert.equal(
        isResolvableRequireUrl(
            'https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/refs/heads/main/YTKit-core.user.js'),
        false,
        'and so must its explicit refs/heads form');
    assert.equal(isResolvableRequireUrl('https://update.greasyfork.org/scripts/12345/ytkit-core.js'), true,
        'a numbered Greasy Fork core record must be accepted');
    assert.equal(isResolvableRequireUrl('https://update.greasyfork.org/scripts/REPLACE_WITH_GREASY_FORK_CORE_ID/ytkit-core.js'), false,
        'the placeholder Greasy Fork core record must fail closed');
    assert.equal(isResolvableRequireUrl('https://invalid.example.invalid/ytkit-core.js'), false,
        'an unresolvable external core host must fail closed');
});

// A tag can be deleted and re-pushed, so each @require and @resource also
// pins the SHA-256 of the bytes its URL serves. Tampermonkey refuses a
// mismatch (the manager smoke's tamper lane shows it); the drift gate fails
// on one before a push can serve it.
test('userscript-health: every @require and @resource pins the SHA-256 of the file it names', () => {
    const { findIntegrityMismatches, integrityFragment, readPinnedBytes } = require('../sync-userscript');
    const root = path.join(__dirname, '..');
    const main = readUserscript('YTKit.user.js');
    const version = /^\/\/ @version\s+(\S+)$/m.exec(main)[1];
    const files = fs.readdirSync(path.join(root, 'extension', '_locales'))
        .map((locale) => `extension/_locales/${locale}/messages.json`)
        .concat(USERSCRIPT_LIBRARIES.map(({ file }) => file));
    const served = readPinnedBytes(root, version, new Map(files.map((file) => [file, fs.readFileSync(path.join(root, file))])));
    const read = (file) => served.get(file) || null;
    assert.deepEqual(findIntegrityMismatches(main, read), []);
    const header = main.split('// ==/UserScript==')[0];
    const locales = fs.readdirSync(path.join(root, 'extension', '_locales')).length;
    assert.equal((header.match(/^\/\/ @require\s+\S+#sha256=[a-f0-9]{64}$/gm) || []).length, USERSCRIPT_LIBRARIES.length);
    assert.equal((header.match(/^\/\/ @resource\s+\S+\s+\S+#sha256=[a-f0-9]{64}$/gm) || []).length, locales - 1,
        'every locale but the embedded English one is a pinned @resource');

    const tampered = (target) => (file) => (file === target ? Buffer.concat([read(file), Buffer.from('\n')]) : read(file));
    assert.match(findIntegrityMismatches(main, tampered('YTKit-app.user.js')).join('\n'),
        /YTKit-app\.user\.js does not match/);
    assert.match(findIntegrityMismatches(main, tampered('extension/_locales/de/messages.json')).join('\n'),
        /_locales\/de\/messages\.json does not match/);
    assert.match(findIntegrityMismatches(main.replace(/(YTKit-core\.user\.js)#sha256=[a-f0-9]{64}/, '$1'), read).join('\n'),
        /YTKit-core\.user\.js carries no #sha256= hash/);
    assert.match(findIntegrityMismatches(main, (file) => (file === 'YTKit-features.user.js' ? null : read(file))).join('\n'),
        /YTKit-features\.user\.js is pinned by YTKit\.user\.js but missing/);
    assert.equal(integrityFragment(Buffer.from('abc')),
        '#sha256=ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

// Main keeps moving between releases while its @require still names the last
// tag. Hashing the newer tree there would make every fresh Tampermonkey
// install from main refuse what the old tag serves, so a tagged version pins
// the tag's blob, and only an untagged one (the release bump) pins the tree.
test('userscript-health: SRI pins name the tag the URL serves, not newer bytes on main', () => {
    const { execFileSync } = require('node:child_process');
    const os = require('node:os');
    const { readPinnedBytes, resolveLibraryPin } = require('../sync-userscript');
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-sri-'));
    const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe', windowsHide: true });
    try {
        git('init', '-q');
        git('config', 'user.email', 'test@example.invalid');
        git('config', 'user.name', 'test');
        git('config', 'commit.gpgsign', 'false');
        git('config', 'tag.gpgsign', 'false');
        fs.writeFileSync(path.join(repo, 'lib.js'), 'released\n');
        git('add', 'lib.js');
        git('commit', '-q', '-m', 'release');
        git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0');
        fs.writeFileSync(path.join(repo, 'lib.js'), 'changed on main\n');

        const working = new Map([['lib.js', Buffer.from('changed on main\n')], ['new.js', Buffer.from('added after the tag\n')]]);
        const tagged = readPinnedBytes(repo, '1.0.0', working);
        assert.equal(tagged.get('lib.js').toString(), 'released\n', 'a tagged version pins what the tag serves');
        assert.equal(tagged.get('new.js').toString(), 'added after the tag\n', 'a file the tag lacks falls back to the tree');
        const bump = readPinnedBytes(repo, '1.1.0', working);
        assert.equal(bump.get('lib.js').toString(), 'changed on main\n', 'an untagged version pins the tree it will tag');
        const notARepo = readPinnedBytes(path.join(repo, 'missing'), '1.0.0', working);
        assert.equal(notARepo.get('lib.js').toString(), 'changed on main\n', 'no git checkout pins the tree');

        // The URLs name the commit the (annotated) tag points at, which is
        // where jsDelivr reads the bytes hashed above.
        const released = git('rev-list', '-n', '1', 'v1.0.0').toString().trim();
        git('commit', '-q', '-am', 'moved on');
        assert.equal(resolveLibraryPin(repo, '1.0.0'), released, 'a tagged version pins the tag\'s commit, not HEAD');
        assert.equal(resolveLibraryPin(repo, '1.1.0'), null, 'an untagged version has no commit to pin yet');
        assert.equal(resolveLibraryPin(path.join(repo, 'missing'), '1.0.0'), null, 'no git checkout has no commit');
    } finally {
        fs.rmSync(repo, { recursive: true, force: true });
    }
});

// Between releases YTKit.user.js on main pins the last release's libraries.
// Main once required two feature modules v4.97.0's libraries didn't carry,
// and every fresh install stopped at the host's library check. The drift
// gate now fails on any required module the pinned libraries don't register.
test('userscript-health: the pinned libraries register every module the loader requires', () => {
    const { LIBRARIES, findUnregisteredRequiredModules, parseUserscriptBuild } = require('../sync-userscript');
    const main = readUserscript('YTKit.user.js');
    const libraries = new Map(LIBRARIES.map(({ file }) => [file, Buffer.from(readUserscript(file))]));
    assert.deepEqual(findUnregisteredRequiredModules(main, libraries), []);

    const build = parseUserscriptBuild(main);
    assert.ok(build.requiredModules.includes('ytkit.js'));
    assert.ok(build.optionalModules.some((file) => file.startsWith('features/')),
        'feature modules are optional, so a newer one on main never blocks an install');
    // The download UI is the foundation's critical feature, and the live-chat
    // frame's app is its feature module; the host boots on both.
    const liveChatApp = new Set(build.modules.liveChat);
    assert.deepEqual(build.requiredModules.filter((file) => (
        file.startsWith('features/') && file !== 'features/download-ui/index.js' && !liveChatApp.has(file)
    )), [], 'no other feature module is required');
    assert.ok(liveChatApp.has('features/live-chat/index.js'), 'the exemption covers a real live-chat module');
    const app = libraries.get('YTKit-app.user.js').toString('utf8');
    const withoutApp = app.replace(/^__astraDeckRegistry\["ytkit\.js"\] = function /m, '__astraDeckRegistry["ytkit-renamed.js"] = function ');
    assert.notEqual(withoutApp, app, 'the positive control needs the app registration to rename');
    libraries.set('YTKit-app.user.js', Buffer.from(withoutApp));
    assert.deepEqual(findUnregisteredRequiredModules(main, libraries), ['ytkit.js']);
});
