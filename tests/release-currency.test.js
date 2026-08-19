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
    assert.match(result.output, /release commit .* but no v[\d.]+ tag/,
        'an untagged release commit must be named');
    assert.match(result.output, /newest tag is v[\d.]+, but \d+ of \d+ channel\(s\)/,
        'channel-pointer lag must be reported against the newest tag');
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
