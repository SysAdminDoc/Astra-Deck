#!/usr/bin/env node
'use strict';

// Cross-validate the canonical version strings before tag/push.
//
// Product builds are local-only. Running this in `npm run check` catches
// version drift before a local build, tag, or release upload.
//
// PRODUCT-VERSION sources of truth (must all match):
//   1. package.json                  → "version"
//   2. extension/manifest.json       → "version"
//   3. extension/ytkit.js            → const YTKIT_VERSION = '...'
//   4. YTKit.user.js                 → // @version and @name suffix
//   5. YTKit-core.user.js            → @version
//   6. package-lock.json             → root + packages[""].version
//
// SETTINGS-VERSION sources of truth (v4.47.0 NF25 — must all match):
//   1. extension/ytkit.js            → SETTINGS_VERSION: N (in settingsManager)
//   2. extension/popup.js            → const SETTINGS_VERSION_FALLBACK = N
//   3. extension/settings-meta.json  → { "settingsVersion": N }
//
// Exit 0 only if BOTH product-version AND settings-version checks
// pass; exit 1 with a per-source breakdown otherwise.
//
// Optional: pass --tag <vX.Y.Z> to also validate against an external
// tag string (e.g. before `git tag` runs in a release recipe).

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const ACTIVE_DOC_TRUTH_FILES = Object.freeze([
    'README.md',
    path.join('docs', 'architecture.md'),
    path.join('docs', 'repo-settings.md'),
    path.join('docs', 'signing-keys.md'),
    path.join('docs', 'native-messaging-token-bootstrap.md'),
]);
// Files whose present-tense version claims must match the product version.
// The two patterns below ("today, at vX" / "currently agree at vX") only fire
// on present-tense prose, so historical snapshots elsewhere in these documents
// stay valid. docs/architecture.md is included because its opening paragraph
// asserts the current version twice and the release recipe expects it kept in
// step — without it the gate printed a pass while that line named the previous
// release. Retired-policy references remain checked in every active document.
// README deliberately carries NO hardcoded version: its release badge is a
// live shields.io lookup, and the retired-reference scan above forbids
// hardcoding one. It stays in ACTIVE_DOC_TRUTH_FILES for that scan, but it has
// no present-tense claim to verify, so listing it here made the
// claim-must-exist assertion below fire on a file that is correct as written.
const CURRENT_VERSION_TRUTH_FILES = new Set([
    path.join('docs', 'architecture.md'),
]);

function readPackageVersion() {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    return { source: 'package.json', value: String(pkg.version || '') };
}

function readPackageLockVersion() {
    const lock = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package-lock.json'), 'utf8'));
    const rootVersion = String(lock.version || '');
    const packageVersion = String(lock.packages?.['']?.version || '');
    return {
        source: 'package-lock.json (root + packages[""])',
        value: rootVersion && rootVersion === packageVersion ? rootVersion : `${rootVersion || '<empty>'} / ${packageVersion || '<empty>'}`
    };
}

function readManifestVersion() {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'extension', 'manifest.json'), 'utf8'));
    return { source: 'extension/manifest.json', value: String(manifest.version || '') };
}

function readYtkitVersion() {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'extension', 'ytkit.js'), 'utf8');
    const m = src.match(/const YTKIT_VERSION = '([^']+)'/);
    return { source: 'extension/ytkit.js (YTKIT_VERSION)', value: m ? m[1] : '' };
}

function readUserscriptVersion() {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'YTKit.user.js'), 'utf8');
    const m = src.match(/^\/\/ @version\s+(\S+)/m);
    return { source: 'YTKit.user.js (@version)', value: m ? m[1] : '' };
}

function readUserscriptNameVersion(source = fs.readFileSync(path.join(REPO_ROOT, 'YTKit.user.js'), 'utf8')) {
    const m = source.match(/^\/\/ @name\s+YTKit v(\S+)/m);
    return { source: 'YTKit.user.js (@name version)', value: m ? m[1] : '' };
}

// YTKit.user.js carries no executable core of its own; it loads
// YTKit-core.user.js through @require, pinned to the release tag. The v4.90.0
// bump moved @version and left @require on the v4.89.0 tag, and every source
// above still agreed, so userscript installs ran the previous release's core
// with nothing anywhere saying so. The expected URL comes from the same
// function sync-userscript.js writes it with.
function findUserscriptCoreRequireDrift(productVersion, source) {
    const { coreRequireUrl } = require('../sync-userscript.js');
    const expected = coreRequireUrl(productVersion);
    // Read the lines a userscript manager reads: only those between the
    // ==UserScript== markers, and with its relaxed parsing, where anything may
    // precede the `//` (Violentmonkey matches `(.*?)//[ \t]*@key`, to agree
    // with Tampermonkey). An indented @require still loads a core; one above
    // the block loads nothing.
    const lines = source.split(/\r?\n/);
    const open = lines.findIndex((line) => /\/\/[ \t]*==UserScript==/.test(line));
    const close = open === -1 ? -1 : lines.findIndex((line, index) => index > open && /\/\/[ \t]*==\/UserScript==/.test(line));
    const block = close === -1 ? [] : lines.slice(open + 1, close);
    const found = block
        .map((line) => /\/\/[ \t]*@require[ \t]+(\S+)/.exec(line)?.[1])
        .filter(Boolean);
    return found.length === 1 && found[0] === expected ? null : { expected, found };
}

function checkUserscriptCoreRequire(productVersion) {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'YTKit.user.js'), 'utf8');
    const drift = findUserscriptCoreRequireDrift(productVersion, source);
    if (!drift) {
        console.log(`[check-versions] YTKit.user.js @require loads the v${productVersion} core`);
        return true;
    }
    console.error('[check-versions] YTKit.user.js @require does not load this version\'s core:');
    console.error(`  expected ${drift.expected}`);
    console.error(`  found    ${drift.found.length ? drift.found.join(', ') : '<no @require in the header>'}`);
    console.error('Run `node sync-userscript.js`, and push the matching tag before main serves it.');
    return false;
}

function readUserscriptCoreVersion() {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'YTKit-core.user.js'), 'utf8');
    const m = src.match(/^\/\/ @version\s+(\S+)/m);
    return { source: 'YTKit-core.user.js (@version)', value: m ? m[1] : '' };
}

// v4.47.0 NF25 — SETTINGS_VERSION parity sources.
//
// The product version (above) bumps every release; SETTINGS_VERSION
// bumps only when the storage shape changes (currently 7 after v3.23
// reaction-spammer default-OFF migration). The popup keeps a fallback
// constant in case settings-meta.json fails to load; that fallback
// must match ytkit.js or a partial-storage user can silently
// downgrade their schema version on import.
function readYtkitSettingsVersion() {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'extension', 'ytkit.js'), 'utf8');
    const m = src.match(/SETTINGS_VERSION:\s*(\d+)/);
    return { source: 'extension/ytkit.js (SETTINGS_VERSION)', value: m ? m[1] : '' };
}

function readPopupSettingsVersionFallback() {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'extension', 'popup.js'), 'utf8');
    const m = src.match(/const\s+SETTINGS_VERSION_FALLBACK\s*=\s*(\d+)/);
    return { source: 'extension/popup.js (SETTINGS_VERSION_FALLBACK)', value: m ? m[1] : '' };
}

function readSettingsMetaVersion() {
    const meta = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'extension', 'settings-meta.json'), 'utf8'));
    return { source: 'extension/settings-meta.json (settingsVersion)', value: String(meta.settingsVersion || '') };
}

function parseProductTagSegments(tag) {
    const m = String(tag || '').match(/^v(\d+(?:\.\d+)*)$/);
    if (!m) return null;
    return m[1].split('.').map(Number);
}

function compareVersionSegments(a, b) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
        const av = a[i] || 0;
        const bv = b[i] || 0;
        if (av !== bv) return av - bv;
    }
    return 0;
}

// Tags shaped like product tags (v<digits[.digits...]>) that version-sort
// AHEAD of the current product version poison any tooling that infers
// "latest" by version sort — a stray v25.11 outranks every v4.46.x tag in
// `git tag --sort=-version:refname`. Nothing should ever be tagged ahead of
// the version in package.json.
function findStrayProductTags(productVersion, tags) {
    const current = parseProductTagSegments(`v${productVersion}`);
    if (!current) return [];
    return (tags || []).filter((tag) => {
        const segments = parseProductTagSegments(String(tag).trim());
        return segments !== null && compareVersionSegments(segments, current) > 0;
    });
}

function listLocalProductTags() {
    try {
        const out = require('child_process').execFileSync('git', ['tag', '--list', 'v*'], {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        });
        return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    } catch (_) {
        // Deliberately not a skip. A gate that quietly passes when its tool is
        // missing reports success for a check it never ran, which is the same
        // failure mode as an empty scan list.
        return null;
    }
}

function checkProductTagSanity(productVersion) {
    const tags = listLocalProductTags();
    if (tags === null) {
        console.error(
            '[check-versions] Product-tag sanity: FAILED — git is not on PATH, so stray release '
            + 'tags cannot be checked. Install git or put it on PATH; this gate will not pass unrun.'
        );
        return false;
    }
    const stray = findStrayProductTags(productVersion, tags);
    if (!stray.length) {
        console.log(`[check-versions] Product-tag sanity: no tags version-sort ahead of v${productVersion}`);
        return true;
    }
    console.error('[check-versions] Stray product tag(s) version-sort ahead of the current version and can poison latest-by-version-sort tooling:');
    for (const tag of stray) console.error(`  ${tag} (current product version is v${productVersion})`);
    console.error('');
    console.error('Remediate by deleting each stray tag locally and on the remote:');
    for (const tag of stray) console.error(`  git tag -d ${tag} && git push origin :refs/tags/${tag}`);
    return false;
}

// ── Release currency ─────────────────────────────────────────────────────
//
// Every gate in this repo passed while v4.60.0 through v4.62.0 each got a
// chore(release) commit and then no tag, no artifacts and no channel
// promotion. A release commit that never ships is invisible to every other
// check here, because every version string agrees with every other one — they
// just all agree on a version nobody can install.
//
// This lane reports by default and fails under --require-release-current, so
// `npm run check` stays usable between releases while `release:prepare`
// refuses to build on top of an unshipped one. The publication act itself is
// maintainer-local and lives in Roadmap_Blocked.md; this is only the gate that
// stops it being forgotten silently.
const RELEASE_COMMIT_SCAN_DEPTH = 80;

function gitLines(args) {
    try {
        const out = require('child_process').execFileSync('git', args, {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        });
        return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    } catch (_) {
        return null;
    }
}

function findReleaseCommitForVersion(productVersion) {
    const lines = gitLines(['log', `-${RELEASE_COMMIT_SCAN_DEPTH}`, '--format=%h %s']);
    if (lines === null) return null;
    // The convention this repo actually uses: "chore(release): bump to vX.Y.Z".
    const needle = new RegExp(`^(\\S+)\\s+chore\\(release\\)[^\\n]*\\bv?${productVersion.replace(/\./g, '\\.')}\\b`);
    for (const line of lines) {
        const match = line.match(needle);
        if (match) return { sha: match[1], subject: line.slice(match[1].length + 1) };
    }
    return undefined;
}

function newestProductTag(tags) {
    let newest = null;
    let newestSegments = null;
    for (const tag of tags || []) {
        const segments = parseProductTagSegments(String(tag).trim());
        if (!segments) continue;
        if (!newestSegments || compareVersionSegments(segments, newestSegments) > 0) {
            newest = String(tag).trim();
            newestSegments = segments;
        }
    }
    return newest;
}

function readChannelActiveVersions() {
    const file = path.join(REPO_ROOT, 'release-channels.json');
    if (!fs.existsSync(file)) return null;
    try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        const channels = parsed && parsed.channels;
        if (!channels || typeof channels !== 'object') return null;
        return Object.entries(channels).map(([name, channel]) => ({
            name,
            active: channel?.active?.version || null
        }));
    } catch (_) {
        return null;
    }
}

function checkReleaseCurrency(productVersion, strict) {
    const label = strict ? 'FAILED' : 'NOTICE';
    const problems = [];

    const tags = listLocalProductTags();
    if (tags === null) {
        console.error('[check-versions] Release currency: FAILED — git is not on PATH, so tags cannot be read.');
        return false;
    }

    const tagged = tags.includes(`v${productVersion}`);
    if (!tagged) {
        const releaseCommit = findReleaseCommitForVersion(productVersion);
        if (releaseCommit === null) {
            console.error('[check-versions] Release currency: FAILED — git log is unreadable.');
            return false;
        }
        if (releaseCommit) {
            problems.push(
                `v${productVersion} has a release commit (${releaseCommit.sha} ${releaseCommit.subject}) but no v${productVersion} tag`
            );
        }
    }

    const newestTag = newestProductTag(tags);
    const channels = readChannelActiveVersions();
    if (channels === null) {
        problems.push('release-channels.json is missing or unreadable, so channel-pointer lag cannot be reported');
    } else if (newestTag) {
        const newestVersion = newestTag.replace(/^v/, '');
        const lagging = channels.filter((channel) => channel.active && channel.active !== newestVersion);
        if (lagging.length) {
            problems.push(`newest tag is ${newestTag}, but ${lagging.length} of ${channels.length} channel(s) still point elsewhere:`);
            for (const channel of lagging) problems.push(`    ${channel.name}: active ${channel.active}`);
        }
    }

    if (!problems.length) {
        console.log(`[check-versions] Release currency: v${productVersion} is tagged and every channel points at it`);
        return true;
    }

    const write = strict ? console.error : console.log;
    write(`[check-versions] Release currency: ${label} — this build is ahead of what anyone can install:`);
    for (const problem of problems) write(`  ${problem}`);
    write('');
    write('  Tag and publish, then promote:');
    write(`    git tag v${productVersion} && git push origin v${productVersion}`);
    write('    npm run release:prepare && npm run release:promote');
    if (!strict) {
        write('  Reported, not failed: publication is maintainer-local (Roadmap_Blocked.md).');
        write('  Pass --require-release-current to make this a hard failure.');
    }
    return !strict;
}

function parseTagFlag(argv) {
    const idx = argv.indexOf('--tag');
    if (idx === -1) return null;
    // `--tag` with a missing/empty value must fail loudly. An empty string
    // here used to fall through the falsy `if (tagOverride)` gate and
    // silently skip tag validation — e.g. when a CI variable expands empty.
    const raw = argv[idx + 1];
    if (raw === undefined || raw.trim() === '' || raw.startsWith('--')) {
        throw new Error('--tag requires a non-empty value (e.g. --tag v4.46.2); refusing to silently skip tag validation');
    }
    return raw.startsWith('v') ? raw.slice(1) : raw;
}

function lineNumberForIndex(text, index) {
    return text.slice(0, index).split(/\r?\n/).length;
}

function checkActiveDocumentationTruth(productVersion) {
    const failures = [];
    const retiredRefs = [
        { re: /RESEARCH_REPORT\.md/g, label: 'retired RESEARCH_REPORT.md reference' },
        { re: /\.github\/workflows\/[A-Za-z0-9_.\/-]+/g, label: 'retired GitHub Actions workflow path' },
        // "latest release vX.Y.Z" claims go stale the moment the next release
        // ships; install docs must describe the live release state without
        // hardcoding a tag (link to /releases/latest or tell the reader to
        // check `gh release view` instead).
        { re: /latest(?:\s+public)?\s+release\s+`?v\d+(?:\.\d+)+/gi, label: 'hardcoded latest-release version claim (derive from live release metadata)' },
        { re: /\bLatest\s+`v\d+(?:\.\d+)+`/g, label: 'hardcoded latest-release version claim (derive from live release metadata)' },
    ];
    const currentVersionClaims = [
        { re: /today,\s+at\s+v(\d+\.\d+\.\d+)\+?/gi, label: '"today" architecture version claim' },
        { re: /currently\s+agree\s+at\s+v(\d+\.\d+\.\d+)/gi, label: 'current product-version parity claim' },
    ];

    for (const relPath of ACTIVE_DOC_TRUTH_FILES) {
        const absPath = path.join(REPO_ROOT, relPath);
        if (!fs.existsSync(absPath)) continue;
        const text = fs.readFileSync(absPath, 'utf8');
        for (const { re, label } of retiredRefs) {
            let match;
            while ((match = re.exec(text)) !== null) {
                failures.push(`${relPath}:${lineNumberForIndex(text, match.index)} ${label}: ${match[0]}`);
            }
        }
        if (CURRENT_VERSION_TRUTH_FILES.has(relPath)) {
            let claimMatches = 0;
            for (const { re, label } of currentVersionClaims) {
                let match;
                while ((match = re.exec(text)) !== null) {
                    claimMatches += 1;
                    if (match[1] !== productVersion) {
                        failures.push(`${relPath}:${lineNumberForIndex(text, match.index)} stale ${label}: v${match[1]} (expected v${productVersion})`);
                    }
                }
            }
            // Zero matches is indistinguishable from "everything is current":
            // the claims are matched by phrase, so rewording the sentence used
            // to drop the file out of scope silently and let its version rot.
            if (claimMatches === 0) {
                failures.push(
                    `${relPath}: no current-version claim matched; the phrasing changed and this file `
                    + 'is no longer version-checked. Restore a recognised claim or update currentVersionClaims.'
                );
            }
        }
    }

    if (!failures.length) {
        console.log(`[check-versions] Active documentation truth matches v${productVersion} and the local-build policy`);
        return true;
    }

    console.error('[check-versions] Active documentation truth drift detected:');
    for (const failure of failures) console.error(`  ${failure}`);
    console.error('');
    console.error('Fix active docs or move historical/dead-policy references into archived research/history docs.');
    return false;
}

function main(argv) {
    const sources = [
        readPackageVersion(),
        readPackageLockVersion(),
        readManifestVersion(),
        readYtkitVersion(),
        readUserscriptVersion(),
        readUserscriptNameVersion(),
        readUserscriptCoreVersion(),
    ];

    const tagOverride = parseTagFlag(argv);
    if (tagOverride) {
        sources.push({ source: '--tag flag (caller-provided)', value: tagOverride });
    }

    const distinct = new Set(sources.map((s) => s.value));
    const productOk = distinct.size === 1 && sources[0].value !== '';
    // distinct.size === 1 means every read returned the same string; the
    // empty-string check ensures we don't pass when every regex failed
    // and produced ''. (Earlier draft used .includes('') which is always
    // true on any string and silently broke the happy path.)
    if (productOk) {
        const v = sources[0].value;
        console.log(`[check-versions] All ${sources.length} product-version sources agree at v${v}`);
        for (const s of sources) console.log(`  - ${s.source}`);
    } else {
        console.error('[check-versions] Product-version drift detected — sources disagree:');
        for (const s of sources) {
            console.error(`  ${s.value || '<empty>'}  ←  ${s.source}`);
        }
        console.error('');
        console.error('Fix every source then re-run. Useful one-liners:');
        console.error('  node sync-userscript.js               # syncs YTKit.user.js to ytkit.js');
        console.error('  npm install --package-lock-only       # refreshes package-lock.json');
    }

    // v4.47.0 NF25 — SETTINGS_VERSION parity check (independent of
    // product version). The popup's fallback constant, ytkit.js's
    // SETTINGS_VERSION, and settings-meta.json's settingsVersion all
    // describe the same schema version namespace; any drift between
    // them risks silent profile-import corruption when one source
    // fails to load and another picks up.
    const settingsSources = [
        readYtkitSettingsVersion(),
        readPopupSettingsVersionFallback(),
        readSettingsMetaVersion(),
    ];
    const settingsDistinct = new Set(settingsSources.map((s) => s.value));
    const settingsOk = settingsDistinct.size === 1 && settingsSources[0].value !== '';
    if (settingsOk) {
        console.log(`[check-versions] All ${settingsSources.length} SETTINGS_VERSION sources agree at v${settingsSources[0].value}`);
        for (const s of settingsSources) console.log(`  - ${s.source}`);
    } else {
        console.error('[check-versions] SETTINGS_VERSION drift detected — sources disagree:');
        for (const s of settingsSources) {
            console.error(`  ${s.value || '<empty>'}  ←  ${s.source}`);
        }
        console.error('');
        console.error('Fix every source then re-run. The three SETTINGS_VERSION sources');
        console.error('must all hold the same integer (currently independent of product');
        console.error('version; bumps when storage shape changes).');
    }

    const docsOk = productOk && checkActiveDocumentationTruth(sources[0].value);
    const coreRequireOk = !productOk || checkUserscriptCoreRequire(sources[0].value);
    const tagsOk = !productOk || checkProductTagSanity(sources[0].value);
    const releaseOk = !productOk
        || checkReleaseCurrency(sources[0].value, argv.includes('--require-release-current'));

    process.exit(productOk && settingsOk && docsOk && coreRequireOk && tagsOk && releaseOk ? 0 : 1);
}

if (require.main === module) {
    try {
        main(process.argv.slice(2));
    } catch (e) {
        console.error('[check-versions]', e.message || e);
        process.exit(2);
    }
}

module.exports = {
    checkReleaseCurrency,
    compareVersionSegments,
    findStrayProductTags,
    findUserscriptCoreRequireDrift,
    newestProductTag,
    readChannelActiveVersions,
    parseProductTagSegments,
    readUserscriptNameVersion
};
