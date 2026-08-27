'use strict';

// Selector packs have always declared `lastVerified`, `highChurn`, and
// `needsFreshCapture`. Until v4.88.3 the only assertion in the suite checked
// that the date matched `\d{4}-\d{2}-\d{2}`, so all 35 surfaces could claim
// `needsFreshCapture: false` on evidence up to 100 days old while the canary
// recorded a much newer YouTube build. These drive the gate's logic directly
// with injected dates, so they do not rot as the real clock moves.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const gate = require('../scripts/check-selector-evidence.js');
const { captureProvenance } = require('../scripts/build-selector-fixtures.js');

const repoRoot = path.join(__dirname, '..');

const MAP = Object.freeze({
    fresh: { lastVerified: '2026-08-20', highChurn: true },
    aging: { lastVerified: '2026-05-01', highChurn: true },
    stableAging: { lastVerified: '2026-05-01', highChurn: false },
    undated: { highChurn: true }
});

function assess(overrides = {}) {
    return gate.assessSurfaces({ ...MAP, ...overrides }, {
        today: '2026-08-27',
        canaryDate: '2026-08-20',
        staleAfterDays: 60
    });
}

test('a client version resolves to the day YouTube shipped it', () => {
    assert.equal(gate.canaryClientVersionDate('2.20260820.01.00'), '2026-08-20');
    assert.equal(gate.canaryClientVersionDate('2.20260606.02.00'), '2026-06-06');
    assert.equal(gate.canaryClientVersionDate('nonsense'), null);
    assert.equal(gate.canaryClientVersionDate(undefined), null);
});

test('staleness is measured against both the age limit and the canary build', () => {
    const rows = Object.fromEntries(assess().map((row) => [row.surface, row]));

    assert.equal(rows.fresh.stale, false, 'evidence dated on the canary build is current');
    assert.equal(rows.aging.stale, true);
    assert.match(rows.aging.reasons.join(' '), /118 days old \(limit 60\)/);
    assert.match(rows.aging.reasons.join(' '), /predates the canary's YouTube build 2026-08-20/);
    assert.equal(rows.undated.stale, true);
    assert.match(rows.undated.reasons.join(' '), /no lastVerified date/);
});

test('a newly stale high-churn surface fails the gate', () => {
    const { problems } = gate.evaluate(assess(), { surfaces: {} });
    assert.ok(problems.some((problem) => problem.startsWith('aging needs a fresh capture')),
        'an unaccepted stale high-churn surface must fail');
    assert.ok(problems.some((problem) => /Recapture per docs\/selector-fixture-workflow\.md/.test(problem)),
        'the gate must name how to fix it');
});

test('a stable surface aging is reported but does not fail the gate', () => {
    const { problems } = gate.evaluate(assess(), {
        surfaces: { aging: { lastVerified: '2026-05-01' }, undated: { lastVerified: null } }
    });
    assert.equal(problems.length, 0, 'stableAging must not fail on age alone');
});

test('an exception stops matching once the pack moves', () => {
    const accepted = { surfaces: { aging: { lastVerified: '2026-05-01' }, undated: { lastVerified: null } } };

    const moved = assess({ aging: { lastVerified: '2026-05-02', highChurn: true } });
    const { problems } = gate.evaluate(moved, accepted);
    assert.ok(problems.some((problem) => /aging moved to 2026-05-02/.test(problem)),
        'a pack whose date changed must not ride its old exception');
});

test('an exception for a surface that recovered must be removed', () => {
    const recovered = assess({ aging: { lastVerified: '2026-08-25', highChurn: true } });
    const { problems } = gate.evaluate(recovered, {
        surfaces: { aging: { lastVerified: '2026-05-01' }, undated: { lastVerified: null } }
    });
    assert.ok(problems.some((problem) => /aging is no longer stale/.test(problem)),
        'the exception list must shrink when evidence is refreshed');
});

test('an exception naming an unregistered surface fails', () => {
    const { problems } = gate.evaluate(assess(), {
        surfaces: {
            aging: { lastVerified: '2026-05-01' },
            undated: { lastVerified: null },
            ghostSurface: { lastVerified: '2026-01-01' }
        }
    });
    assert.ok(problems.some((problem) => /ghostSurface has an exception/.test(problem)));
});

test('the committed exception list matches the packs it claims to cover', () => {
    const exceptions = gate.readExceptions();
    const rows = gate.assessSurfaces(
        require('../scripts/build-selector-fixtures.js').loadSurfaceSelectorMap(),
        { today: new Date().toISOString().slice(0, 10), canaryDate: gate.readCanaryDate() }
    );
    const { problems } = gate.evaluate(rows, exceptions);
    assert.deepEqual(problems, [], 'run npm run record:selector-evidence after refreshing captures');

    for (const entry of Object.values(exceptions.surfaces || {})) {
        assert.match(entry.acceptedOn, /^\d{4}-\d{2}-\d{2}$/, 'every exception carries the date it was accepted');
        assert.ok(entry.reason, 'every exception says why it is accepted');
    }
});

test('every generated token fixture records its capture provenance', () => {
    const dir = path.join(repoRoot, 'tests', 'fixtures');
    const fixtures = fs.readdirSync(dir).filter((name) => /^yt-.*\.tokens\.txt$/.test(name));
    assert.ok(fixtures.length >= 8, 'the token fixtures must still be present');

    for (const name of fixtures) {
        const header = fs.readFileSync(path.join(dir, name), 'utf8').split('\n').slice(0, 7).join('\n');
        // Not every capture lives under mhtml/ — the subscriptions snapshot
        // sits at the repository root.
        assert.match(header, /^# Source: \S.*\.mhtml$/m, `${name} must name its source capture`);
        assert.match(header, /^# YouTube client: (\d+\.\d{8}\.\d+\.\d+|unknown)$/m,
            `${name} must record the client version or say it is unknown`);
        assert.match(header, /^# Captured: \d{4}-\d{2}-\d{2} \(from (INNERTUBE_CLIENT_VERSION|file mtime)\)$/m,
            `${name} must record a dated capture and where the date came from`);
    }
});

test('capture provenance prefers YouTube own build stamp over the file clock', () => {
    const watch = path.join(repoRoot, 'mhtml', 'WatchPage.mhtml');
    if (!fs.existsSync(watch)) return; // captures are gitignored; maintainer-only path
    const provenance = captureProvenance(watch);
    assert.equal(provenance.dateSource, 'INNERTUBE_CLIENT_VERSION');
    assert.match(provenance.clientVersion, /^\d+\.\d{8}\.\d+\.\d+$/);
    assert.equal(provenance.capturedOn, gate.canaryClientVersionDate(provenance.clientVersion));
});

test('the selector evidence check is registered as a gate', () => {
    const { GATES } = require('../scripts/run-checks.js');
    const entry = GATES.find((candidate) => candidate.id === 'selector-evidence');
    assert.ok(entry, 'selector evidence must be verified by npm run check');
    assert.equal(entry.script, 'check-selector-evidence.js');
});
