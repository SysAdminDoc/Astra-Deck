'use strict';

// The screen-reader evidence record, its validator, and its staleness rules.
//
// Static gates read source; the keyboard-contract tests press keys against a
// fake DOM. Neither can tell you what NVDA said, in what order, or whether
// Gecko and Blink agreed. So a release that changes one of the covered surfaces
// has to carry a dated record of a person listening — and this is the machinery
// that refuses a missing, incomplete, failing, or stale one.
//
// Nothing here generates a record. A generated observation would be a lie, and
// the point of the record is that it is the one thing in the repo a human had
// to produce.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const evidence = require('../scripts/screen-reader-evidence.js');

const GOOD = {
    date: '2026-08-25',
    astraVersion: '4.85.0',
    browser: 'Chrome',
    browserVersion: '141.0.7390.55',
    assistiveTech: 'NVDA',
    assistiveTechVersion: '2025.2',
    surface: 'popup',
    expected: 'Astra Deck, dialog. Storage, 12 keys.',
    observed: 'Astra Deck, dialog. Storage, 12 keys.',
    result: 'pass',
    notes: ''
};

function fullCoverage(overrides = {}) {
    const records = [];
    for (const surface of evidence.COVERED_SURFACES) {
        for (const browser of evidence.REQUIRED_BROWSERS) {
            records.push({ ...GOOD, surface: surface.id, browser, ...overrides });
        }
    }
    return records;
}

function withEvidenceFile(records, run) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-evidence-'));
    const file = path.join(dir, 'screen-reader-evidence.json');
    fs.writeFileSync(file, JSON.stringify({ records }, null, 2));
    try {
        return run(file);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

// ── the record shape ──

// WHEN a record is written, it SHALL carry every field only a person at the
// machine can supply. A record that could be derived proves nothing about what
// was heard.
test('a complete record validates', () => {
    assert.deepEqual(evidence.validateRecord(GOOD, 0), []);
});

test('every required field is actually required', () => {
    const required = ['date', 'astraVersion', 'browser', 'browserVersion',
        'assistiveTech', 'assistiveTechVersion', 'surface', 'expected', 'result'];
    for (const field of required) {
        const record = { ...GOOD };
        delete record[field];
        assert.ok(evidence.validateRecord(record, 0).length > 0,
            `${field} must be required`);
    }
});

test('a blank string is not a value', () => {
    for (const field of ['astraVersion', 'browserVersion', 'assistiveTechVersion', 'expected']) {
        assert.ok(evidence.validateRecord({ ...GOOD, [field]: '   ' }, 0).length > 0,
            `${field} must reject whitespace`);
    }
});

test('the date has to be a real date', () => {
    for (const date of ['25-08-2026', '2026-8-25', 'yesterday', '2026-13-40', '']) {
        assert.ok(evidence.validateRecord({ ...GOOD, date }, 0).length > 0, `${date} must be refused`);
    }
    assert.deepEqual(evidence.validateRecord({ ...GOOD, date: '2026-02-29' }, 0), [],
        '2026 is not a leap year, but Date.parse accepts it as March 1; the format is what is pinned');
});

test('the surface has to be one the checklist covers', () => {
    assert.ok(evidence.validateRecord({ ...GOOD, surface: 'some-other-panel' }, 0).length > 0);
    for (const surface of evidence.COVERED_SURFACES) {
        assert.deepEqual(evidence.validateRecord({ ...GOOD, surface: surface.id }, 0), []);
    }
});

// WHEN a run happened, what was heard SHALL be recorded. An expected value with
// no observed value is a plan, not evidence.
test('a pass or fail must say what was actually heard', () => {
    for (const result of ['pass', 'fail']) {
        const record = { ...GOOD, result, observed: '' };
        assert.ok(evidence.validateRecord(record, 0).some((error) => /observed/.test(error)),
            `${result} without an observation must be refused`);
    }
});

// WHEN a technology could not be run, that SHALL be an explicit documented
// not-applicable — and never for NVDA, which is the minimum target.
test('a not-applicable has to say why, and NVDA may not be one', () => {
    const jaws = { ...GOOD, assistiveTech: 'JAWS', result: 'not-applicable', observed: '' };
    assert.ok(evidence.validateRecord(jaws, 0).some((error) => /notApplicableReason/.test(error)),
        'an unexplained not-applicable is just a blank');

    assert.deepEqual(
        evidence.validateRecord({ ...jaws, notApplicableReason: 'No JAWS licence on the build machine.' }, 0),
        [], 'a documented not-applicable is allowed for an optional technology');

    const nvda = { ...GOOD, result: 'not-applicable', observed: '', notApplicableReason: 'busy' };
    assert.ok(evidence.validateRecord(nvda, 0).some((error) => /cannot be not-applicable/.test(error)),
        'NVDA is the minimum required target');
});

// ── the verdict ──

test('missing evidence fails, and says how to produce it', () => {
    const verdict = evidence.evaluateEvidence({
        evidencePath: path.join(os.tmpdir(), 'definitely-not-here.json')
    });
    assert.equal(verdict.status, 'fail');
    assert.match(verdict.details, /screen-reader-smoke\.md/);
});

test('unparseable evidence fails rather than being ignored', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-evidence-'));
    const file = path.join(dir, 'evidence.json');
    fs.writeFileSync(file, '{ not json');
    try {
        const verdict = evidence.evaluateEvidence({ evidencePath: file });
        assert.equal(verdict.status, 'fail');
        assert.match(verdict.details, /not valid JSON/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('a recorded failure fails the release', () => {
    const records = fullCoverage();
    records[0] = { ...records[0], result: 'fail', observed: 'silence' };
    withEvidenceFile(records, (file) => {
        const verdict = evidence.evaluateEvidence({
            evidencePath: file,
            runGit: () => ''
        });
        assert.equal(verdict.status, 'fail');
        assert.match(verdict.details, /recorded failure/);
    });
});

// WHEN a covered surface has no record for a required browser, the release
// SHALL be refused. Partial evidence is how a surface goes unlistened-to.
test('a gap in coverage fails, and names the gap', () => {
    const records = fullCoverage().filter((record) =>
        !(record.surface === 'theater-split' && record.browser === 'firefox'));
    withEvidenceFile(records, (file) => {
        const verdict = evidence.evaluateEvidence({ evidencePath: file, runGit: () => '' });
        assert.equal(verdict.status, 'fail');
        assert.match(verdict.details, /theater-split \/ firefox \/ nvda/);
    });
});

test('a not-applicable does not count as coverage for a required target', () => {
    const records = fullCoverage();
    const index = records.findIndex((record) => record.surface === 'popup' && record.browser === 'firefox');
    // A not-applicable NVDA record is refused by validateRecord, so this uses a
    // JAWS one: the NVDA slot is simply absent.
    records[index] = { ...records[index], assistiveTech: 'JAWS' };
    withEvidenceFile(records, (file) => {
        const verdict = evidence.evaluateEvidence({ evidencePath: file, runGit: () => '' });
        assert.equal(verdict.status, 'fail');
        assert.match(verdict.details, /popup \/ firefox \/ nvda/);
    });
});

// WHEN a covered surface changed after the newest record, that evidence is
// stale and the release SHALL be refused.
test('evidence that predates a change to its surface is stale', () => {
    withEvidenceFile(fullCoverage(), (file) => {
        const verdict = evidence.evaluateEvidence({
            evidencePath: file,
            // Pretend popup.js has a commit since the record date.
            runGit: (args) => (args.includes('extension/popup.js') ? 'deadbee\n' : '')
        });
        assert.equal(verdict.status, 'fail');
        assert.match(verdict.details, /predates changes to popup/);
    });
});

test('complete, current evidence passes', () => {
    withEvidenceFile(fullCoverage({ date: new Date().toISOString().slice(0, 10) }), (file) => {
        const verdict = evidence.evaluateEvidence({ evidencePath: file, runGit: () => '' });
        assert.equal(verdict.status, 'pass');
    });
});

// WHEN git cannot answer, the verdict SHALL say so rather than passing. An
// unknown is not a pass.
test('no git means unknown, not fine', () => {
    withEvidenceFile(fullCoverage(), (file) => {
        const verdict = evidence.evaluateEvidence({ evidencePath: file, runGit: () => null });
        assert.equal(verdict.status, 'warn');
        assert.match(verdict.details, /cannot tell whether it is stale/);
    });
});

test('evidence older than the age limit warns even when nothing changed', () => {
    const old = new Date(Date.now() - (evidence.MAX_EVIDENCE_AGE_DAYS + 10) * 86400000)
        .toISOString().slice(0, 10);
    withEvidenceFile(fullCoverage({ date: old }), (file) => {
        const verdict = evidence.evaluateEvidence({ evidencePath: file, runGit: () => '' });
        assert.equal(verdict.status, 'warn');
        assert.match(verdict.details, /days old/);
    });
});

// ── the wiring ──

test('release readiness carries the evidence check', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'scripts', 'generate-release-readiness.js'), 'utf8');
    assert.match(source, /require\('\.\/screen-reader-evidence\.js'\)/);
    assert.match(source, /'screen-reader-evidence',/);
    assert.match(source, /screenReaderEvidence\.evaluateEvidence\(\{ now, repoRoot, runGit: options\.runGit \}\)/,
        'the report has to pass its own clock AND its own repo root: readiness builds '
        + 'reports against a fixture tree in its own tests, and reading the real '
        + 'repository from there failed a complete fixture on evidence it was never '
        + 'meant to carry');
});

test('the covered surfaces each name a source that makes their evidence stale', () => {
    assert.ok(evidence.COVERED_SURFACES.length >= 5,
        'the acceptance names popup, settings, Theater Split, Transcript Q&A and a provider degradation');
    const repoRoot = path.join(__dirname, '..');
    for (const surface of evidence.COVERED_SURFACES) {
        assert.ok(surface.sources.length > 0, `${surface.id} must name at least one source`);
        for (const source of surface.sources) {
            assert.ok(fs.existsSync(path.join(repoRoot, source)),
                `${surface.id} names ${source}, which does not exist`);
        }
    }
});

test('the template is blank, and would not validate as evidence', () => {
    const blank = evidence.template();
    assert.ok(blank.records.length >= 10, 'a row per surface per required browser');
    const errors = blank.records.flatMap((record, index) => evidence.validateRecord(record, index));
    assert.ok(errors.length > 0,
        'the template must not pass validation, or an unfilled one could ship as evidence');
});

// WHEN evidence is missing, the readiness REPORT itself SHALL fail — not merely
// the validator in isolation. Hardcoding a pass into the check would leave the
// validator's own tests green while every release shipped unlistened-to.
test('a readiness report over a tree with no evidence fails on it', () => {
    const os = require('node:os');
    const { buildReadinessReport } = require('../scripts/generate-release-readiness.js');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-no-evidence-'));
    try {
        const report = buildReadinessReport({
            repoRoot: root,
            buildDir: path.join(root, 'build'),
            now: new Date('2026-06-06T12:00:00.000Z'),
            gitTags: [],
            runGit: () => ''
        });
        const entry = report.checks.find((item) => item.id === 'screen-reader-evidence');
        assert.ok(entry, 'the report must carry the check');
        assert.equal(entry.status, 'fail', 'a tree with no evidence must fail on it');
        assert.match(entry.details, /screen-reader-smoke.md/);
        assert.notEqual(report.status, 'pass');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
