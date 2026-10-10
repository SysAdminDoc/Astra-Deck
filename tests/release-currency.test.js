'use strict';

// v4.60.0, v4.61.0 and v4.62.0 each got a chore(release) commit and then no
// tag, no artifacts and no channel promotion — and every gate in the repo
// stayed green, because every version string agreed with every other one. They
// just all agreed on a version nobody could install.
//
// This lane is the missing check. It reports by default so `npm run check`
// stays usable between releases (publication is maintainer-local and tracked
// in Roadmap_Blocked.md), and fails under --require-release-current.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const {
    checkReleaseCurrency,
    newestProductTag,
    readChannelActiveVersions
} = require('../scripts/check-versions.js');

function runCheckVersions(args = []) {
    const result = spawnSync(process.execPath, ['scripts/check-versions.js', ...args], {
        cwd: repoRoot,
        encoding: 'utf8'
    });
    return { ...result, output: result.stdout + result.stderr };
}

test('the default run reports the lag without failing the chain', () => {
    const result = runCheckVersions();
    assert.equal(result.status, 0,
        'a permanent hard failure between releases would block every gate run');
    assert.match(result.output, /Release currency:/);
});

test('the report names both halves of the staleness', () => {
    const result = runCheckVersions();
    if (!/Release currency: NOTICE/.test(result.output)) {
        // A properly tagged and promoted tree is the passing state.
        assert.match(result.output, /is tagged and every channel points at it/);
        return;
    }
    // The two halves are independent. Between bumping the version strings and
    // committing them there is no chore(release) commit yet, so only the
    // channel half fires — the notice must still be well-formed in that window.
    const halves = [
        /release commit .* but no v[\d.]+ tag/,
        /newest tag is v[\d.]+, but \d+ of \d+ channel\(s\)/
    ];
    assert.ok(halves.some((half) => half.test(result.output)),
        'a NOTICE must name at least one concrete reason');
    for (const half of halves) {
        const loose = half === halves[0] ? /release commit/ : /newest tag is/;
        if (loose.test(result.output)) {
            assert.match(result.output, half, 'a reported half must carry its detail');
        }
    }
    assert.match(result.output, /git tag v[\d.]+/, 'the report must say how to fix it');
    assert.match(result.output, /--require-release-current/,
        'the report must name the flag that turns it into a failure');
});

test('--require-release-current turns the same finding into a failure', () => {
    const relaxed = runCheckVersions();
    const strict = runCheckVersions(['--require-release-current']);
    const stale = /Release currency: NOTICE/.test(relaxed.output);
    assert.equal(strict.status, stale ? 1 : 0,
        stale ? 'a stale release must fail under the strict flag' : 'a current release must pass');
    if (stale) assert.match(strict.output, /Release currency: FAILED/);
});

test('the strict lane has its own npm entry point', () => {
    assert.equal(pkg.scripts['check:release-current'],
        'node scripts/check-versions.js --require-release-current');
    assert.doesNotMatch(pkg.scripts.check, /--require-release-current/,
        'the chain must keep reporting rather than blocking between releases');
});

// ── the pieces the lane is built from ────────────────────────────────────

test('the newest product tag is picked by version order, not string order', () => {
    // v4.9.0 sorts after v4.10.0 as a string. Getting this wrong would report
    // a lag against the wrong tag, or none at all.
    assert.equal(newestProductTag(['v4.9.0', 'v4.10.0', 'v4.2.0']), 'v4.10.0');
    assert.equal(newestProductTag(['v1.0.0', 'not-a-tag', 'v1.0.1']), 'v1.0.1');
    assert.equal(newestProductTag([]), null);
    assert.equal(newestProductTag(['nightly', 'latest']), null,
        'non-product tags must not be mistaken for a release');
});

test('every channel in release-channels.json is read, not just the first', () => {
    const channels = readChannelActiveVersions();
    assert.ok(Array.isArray(channels) && channels.length >= 5,
        'all five channels must be reported on');
    for (const channel of channels) {
        assert.ok(channel.name, 'each channel must be named in the report');
        assert.match(String(channel.active), /^\d+\.\d+\.\d+$/);
    }
});

test('a missing git is a failure, not a silent pass', () => {
    // Same rule as the stray-tag lane above it: a gate that passes when its
    // tool is absent reports success for a check it never ran.
    const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'check-versions.js'), 'utf8');
    const at = source.indexOf('function checkReleaseCurrency(');
    const body = source.slice(at, source.indexOf('\nfunction parseTagFlag', at));
    // [^}]* rather than [\s\S]*?: the lazy form happily crossed out of the
    // block and matched a `return false` belonging to the next guard, so the
    // assertion passed on a mutant that returned true here.
    assert.match(body, /if \(tags === null\) \{[^}]*return false;[^}]*\}/,
        'an unreadable tag list must fail');
    assert.match(body, /if \(releaseCommit === null\) \{[^}]*return false;[^}]*\}/,
        'an unreadable git log must fail');
    assert.equal(typeof checkReleaseCurrency, 'function');
});

// The v4.90.0 bump rewrote @version and left @require on the v4.89.0 tag, so
// userscript installs ran the previous release's core while every version
// string in the repo agreed. The userscript loads three libraries now (core,
// features, app), and every one has to come from the tag of its own version,
// in the order the host expects to find them registered. They're named by
// the commit the tag points at, on jsDelivr's mirror, since Greasy Fork
// rejects raw.githubusercontent.com.
test('the main userscript @require loads the libraries of its own version', () => {
    const { findUserscriptRequireDrift } = require('../scripts/check-versions.js');
    const { LIBRARIES, libraryUrl } = require('../sync-userscript.js');
    const RELEASE_COMMIT = 'a'.repeat(40);
    const PREVIOUS_COMMIT = 'b'.repeat(40);
    const libraries = (version, commit) => LIBRARIES.map(({ file }) => libraryUrl(version, file, commit));
    const drift = (source, commit = RELEASE_COMMIT) => findUserscriptRequireDrift('4.90.0', source, commit);
    const header = (...requires) => [
        '// ==UserScript==',
        '// @version      4.90.0',
        ...requires.map((url) => `// @require      ${url}`),
        '// ==/UserScript==',
        `    // @require      ${libraryUrl('1.0.0', LIBRARIES[0].file, PREVIOUS_COMMIT)} is only a body comment`
    ].join('\n');
    const current = libraries('4.90.0', RELEASE_COMMIT);
    const stale = libraries('4.89.0', PREVIOUS_COMMIT);

    assert.equal(drift(header(...current)), null);
    assert.deepEqual(drift(header(...stale)), {
        expected: current,
        found: stale
    });
    assert.deepEqual(drift(header(current[0], stale[1], current[2])).found,
        [current[0], stale[1], current[2]],
        'one library left on the previous tag is drift, even when the core moved');
    assert.deepEqual(drift(header()).found, []);
    assert.deepEqual(drift(header(current[0])).found, [current[0]],
        'the core alone is not the userscript: features and app would never load');
    assert.notEqual(drift(header(current[2], current[1], current[0])), null,
        'the libraries must be required in order');
    assert.deepEqual(
        drift(header(...current, stale[0])).found,
        [...current, stale[0]],
        'a second core @require would load two cores'
    );
    const tabbed = header(...current).replace('// ==/UserScript==',
        `//\t@require\t${stale[0]}\n// ==/UserScript==`);
    assert.deepEqual(drift(tabbed).found,
        [...current, stale[0]],
        'a tab after // still declares a @require');
    const indented = header(...current).replace('// ==/UserScript==',
        `  \t// @require      ${stale[0]}\n// ==/UserScript==`);
    assert.deepEqual(drift(indented).found,
        [...current, stale[0]],
        'managers accept anything before the //, so an indented @require loads a second core');
    const aboveBlock = current.map((url) => `// @require      ${url}\n`).join('') + header();
    assert.deepEqual(drift(aboveBlock).found, [],
        'a @require above the metadata block is not metadata, so nothing loads');

    // The release bump comes before its tag, so it writes jsDelivr's tag
    // form. Once the tag exists, a header still on that form is drift: the
    // records have to be rewritten to name the tag's commit.
    const bump = libraries('4.90.0', null);
    assert.equal(bump[0], 'https://cdn.jsdelivr.net/gh/SysAdminDoc/Astra-Deck@v4.90.0/YTKit-core.user.js');
    assert.equal(drift(header(...bump), null), null, 'an untagged bump expects the tag form');
    assert.deepEqual(drift(header(...bump)).expected, current, 'a tagged version expects its commit');
    assert.equal(current[0], `https://cdn.jsdelivr.net/gh/SysAdminDoc/Astra-Deck@${RELEASE_COMMIT}/YTKit-core.user.js`);
    const raw = LIBRARIES.map(({ file }) =>
        `https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/refs/tags/v4.90.0/${file}`);
    assert.deepEqual(drift(header(...raw)).found, raw, 'the raw GitHub URLs v4.97.0 shipped are drift');

    const committed = fs.readFileSync(path.join(repoRoot, 'YTKit.user.js'), 'utf8');
    assert.equal(findUserscriptRequireDrift(pkg.version, committed), null,
        'YTKit.user.js must @require the libraries tagged with its own version');
});

// The developer docs below went stale without the gate noticing: a "latest
// public release" claim two dozen releases old, a Node pin that had moved on,
// and contributor steps for files the schema replaced. They are scanned now.
test('the doc-truth scan covers the developer docs that went stale unchecked', () => {
    const { ACTIVE_DOC_TRUTH_FILES } = require('../scripts/check-versions.js');
    const listed = ACTIVE_DOC_TRUTH_FILES.map((file) => file.split(path.sep).join('/'));
    for (const file of ['docs/hosted-policy-closure.md', 'SOURCE-README.md', 'INSTALL.md', 'CONTRIBUTING.md']) {
        assert.ok(listed.includes(file), `${file} is scanned`);
        assert.ok(fs.existsSync(path.join(repoRoot, file)), `${file} exists`);
    }
});

test('a planted latest-release claim in the hosted-policy runbook fails the doc-truth check', () => {
    const { checkActiveDocumentationTruth } = require('../scripts/check-versions.js');
    const runbook = path.join('docs', 'hosted-policy-closure.md');
    const errors = [];
    const quiet = { log() {}, error: (line) => errors.push(String(line)) };
    const realDoc = (relPath) => {
        const absPath = path.join(repoRoot, relPath);
        return fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf8') : null;
    };

    assert.equal(checkActiveDocumentationTruth(pkg.version, { readDoc: realDoc, console: quiet }), true,
        'the docs as committed pass');
    assert.deepEqual(errors, []);

    const planted = (relPath) => {
        const text = realDoc(relPath);
        return relPath === runbook ? `${text}\n- Latest public release \`v4.46.0\`:\n` : text;
    };
    assert.equal(checkActiveDocumentationTruth(pkg.version, { readDoc: planted, console: quiet }), false);
    assert.ok(errors.some((line) => line.includes('hosted-policy-closure.md')
        && line.includes('hardcoded latest-release version claim')), errors.join('\n'));
});
