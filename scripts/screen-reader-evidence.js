#!/usr/bin/env node
'use strict';

// Screen-reader evidence: schema, validator, and staleness rules.
//
// Static a11y gates cannot prove announcement order, focus restoration, or
// Blink-versus-Gecko behaviour. `scripts/audit-overlays-a11y.js` reads source
// and `tests/overlay-keyboard-contract.test.js` presses keys against a fake
// DOM; neither can tell you what NVDA actually said. So a release that changes
// one of the surfaces below has to carry a dated record of somebody listening.
//
// The record is data, not prose, so it can be validated and aged. It lives at
// docs/screen-reader-evidence.json and is written by a human after a run —
// nothing in this repo can generate one, and a generated one would be a lie.
//
// Usage:
//   node scripts/screen-reader-evidence.js --check
//   node scripts/screen-reader-evidence.js --template   (prints a blank record)

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const EVIDENCE_PATH = path.join(REPO_ROOT, 'docs', 'screen-reader-evidence.json');

// The surfaces whose announcement behaviour a static gate cannot stand in for.
// Each names the source that, when it changes, makes existing evidence stale.
const COVERED_SURFACES = Object.freeze([
    Object.freeze({
        id: 'popup',
        label: 'Toolbar popup',
        sources: Object.freeze(['extension/popup.js', 'extension/popup.html'])
    }),
    Object.freeze({
        id: 'settings-panel',
        label: 'In-page settings panel',
        sources: Object.freeze(['extension/features/settings-panel/index.js'])
    }),
    Object.freeze({
        id: 'theater-split',
        label: 'Theater Split',
        sources: Object.freeze(['extension/features/sticky-video/index.js'])
    }),
    Object.freeze({
        id: 'transcript-qa',
        label: 'Transcript Q&A modal',
        sources: Object.freeze(['extension/ytkit.js'])
    }),
    Object.freeze({
        id: 'provider-degradation',
        label: 'One provider degradation path',
        sources: Object.freeze(['extension/features/download-ui/index.js'])
    })
]);

const REQUIRED_BROWSERS = Object.freeze(['chrome', 'firefox']);
const REQUIRED_TECH = Object.freeze(['nvda']);
// JAWS and VoiceOver may be recorded as a documented not-applicable instead of
// a run, because neither is reachable from the Windows box this ships from.
const OPTIONAL_TECH = Object.freeze(['jaws', 'voiceover']);
const RESULTS = Object.freeze(['pass', 'fail', 'not-applicable']);
const MAX_EVIDENCE_AGE_DAYS = 180;

function isIsoDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        && !Number.isNaN(Date.parse(value + 'T00:00:00Z'));
}

function nonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

// One observation. Everything here is something only a person at the machine
// can supply, which is the point: a record that could be derived would prove
// nothing about what was heard.
function validateRecord(record, index) {
    const errors = [];
    const where = `record[${index}]`;
    if (!record || typeof record !== 'object') return [`${where} is not an object`];

    if (!isIsoDate(record.date)) errors.push(`${where}.date must be YYYY-MM-DD`);
    if (!nonEmptyString(record.astraVersion)) errors.push(`${where}.astraVersion is required`);
    if (!nonEmptyString(record.browser)) errors.push(`${where}.browser is required`);
    if (!nonEmptyString(record.browserVersion)) errors.push(`${where}.browserVersion is required`);
    if (!nonEmptyString(record.assistiveTech)) errors.push(`${where}.assistiveTech is required`);
    if (!nonEmptyString(record.assistiveTechVersion)) {
        errors.push(`${where}.assistiveTechVersion is required`);
    }
    if (!COVERED_SURFACES.some((surface) => surface.id === record.surface)) {
        errors.push(`${where}.surface must be one of ${COVERED_SURFACES.map((s) => s.id).join(', ')}`);
    }
    if (!nonEmptyString(record.expected)) errors.push(`${where}.expected announcement is required`);
    if (!RESULTS.includes(record.result)) {
        errors.push(`${where}.result must be one of ${RESULTS.join(', ')}`);
    }

    // An observation is required unless the run did not happen, and a
    // not-applicable has to say why or it is just a blank.
    if (record.result === 'not-applicable') {
        if (!nonEmptyString(record.notApplicableReason)) {
            errors.push(`${where}.notApplicableReason is required for a not-applicable result`);
        }
        if (REQUIRED_TECH.includes(String(record.assistiveTech).toLowerCase())) {
            errors.push(`${where}: ${record.assistiveTech} is a required target and cannot be not-applicable`);
        }
    } else if (!nonEmptyString(record.observed)) {
        errors.push(`${where}.observed announcement is required for a ${record.result} result`);
    }

    return errors;
}

function loadEvidence(evidencePath = EVIDENCE_PATH) {
    if (!fs.existsSync(evidencePath)) return { present: false, records: [], errors: [] };
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    } catch (error) {
        return { present: true, records: [], errors: [`evidence file is not valid JSON: ${error.message}`] };
    }
    const records = Array.isArray(parsed?.records) ? parsed.records : null;
    if (!records) return { present: true, records: [], errors: ['evidence file must carry a records array'] };
    const errors = records.flatMap((record, index) => validateRecord(record, index));
    return { present: true, records, errors };
}

// Which of the required combinations a record set actually covers. A
// not-applicable counts as coverage only for an optional technology.
function coverageGaps(records) {
    const gaps = [];
    for (const surface of COVERED_SURFACES) {
        for (const browser of REQUIRED_BROWSERS) {
            for (const tech of REQUIRED_TECH) {
                const hit = records.some((record) => record.surface === surface.id
                    && String(record.browser).toLowerCase().includes(browser)
                    && String(record.assistiveTech).toLowerCase() === tech
                    && record.result !== 'not-applicable');
                if (!hit) gaps.push(`${surface.id} / ${browser} / ${tech}`);
            }
        }
    }
    return gaps;
}

function failures(records) {
    return records
        .filter((record) => record.result === 'fail')
        .map((record) => `${record.surface} / ${record.browser} / ${record.assistiveTech}: ${record.observed}`);
}

function newestDate(records) {
    let newest = '';
    for (const record of records) {
        if (isIsoDate(record.date) && record.date > newest) newest = record.date;
    }
    return newest;
}

function ageInDays(isoDate, now = new Date()) {
    if (!isIsoDate(isoDate)) return Number.POSITIVE_INFINITY;
    const then = Date.parse(isoDate + 'T00:00:00Z');
    return Math.floor((now.getTime() - then) / 86400000);
}

// The evidence is stale when a covered surface's source has been touched since
// the newest record for it. Git is the authority; without git this returns null
// and the caller reports "unknown" rather than inventing a pass.
function surfacesChangedSince(isoDate, options = {}) {
    if (!isIsoDate(isoDate)) return null;
    const runGit = options.runGit || defaultRunGit;
    const changed = [];
    for (const surface of COVERED_SURFACES) {
        for (const source of surface.sources) {
            const out = runGit(['log', '--since', isoDate, '--format=%h', '--', source]);
            if (out === null) return null;
            if (String(out).trim()) { changed.push(surface.id); break; }
        }
    }
    return changed;
}

function defaultRunGit(args) {
    try {
        const { execFileSync } = require('child_process');
        return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (_) {
        // reason: no git, or not a repository; the caller reports unknown
        return null;
    }
}

// One verdict the release-readiness report can render directly.
function evaluateEvidence(options = {}) {
    // Honour the caller's repo root. release-readiness builds reports against a
    // fixture tree in its own tests, and reading the real repository from there
    // made a complete fixture fail on evidence it was never meant to carry.
    const repoRoot = options.repoRoot || REPO_ROOT;
    const evidencePath = options.evidencePath
        || path.join(repoRoot, 'docs', 'screen-reader-evidence.json');
    const loaded = options.loaded || loadEvidence(evidencePath);
    const now = options.now || new Date();

    if (!loaded.present) {
        return {
            status: 'fail',
            details: `missing ${path.relative(repoRoot, evidencePath)}; `
                + 'run docs/screen-reader-smoke.md and record the result'
        };
    }
    if (loaded.errors.length) {
        return { status: 'fail', details: loaded.errors.slice(0, 3).join('; ') };
    }
    const failed = failures(loaded.records);
    if (failed.length) {
        return { status: 'fail', details: `recorded failure(s): ${failed.slice(0, 2).join('; ')}` };
    }
    const gaps = coverageGaps(loaded.records);
    if (gaps.length) {
        return { status: 'fail', details: `no evidence for ${gaps.slice(0, 3).join(', ')}` };
    }

    const newest = newestDate(loaded.records);
    const age = ageInDays(newest, now);
    const changed = surfacesChangedSince(newest, { ...options, repoRoot });
    if (changed === null) {
        return { status: 'warn', details: `evidence dated ${newest}; git unavailable, cannot tell whether it is stale` };
    }
    if (changed.length) {
        return {
            status: 'fail',
            details: `evidence dated ${newest} predates changes to ${changed.join(', ')}; re-run those surfaces`
        };
    }
    if (age > MAX_EVIDENCE_AGE_DAYS) {
        return { status: 'warn', details: `evidence is ${age} days old (limit ${MAX_EVIDENCE_AGE_DAYS})` };
    }
    return { status: 'pass', details: `${loaded.records.length} record(s), newest ${newest}, no covered surface changed since` };
}

function blankRecord(surfaceId) {
    return {
        date: 'YYYY-MM-DD',
        astraVersion: '',
        browser: '',
        browserVersion: '',
        assistiveTech: 'NVDA',
        assistiveTechVersion: '',
        surface: surfaceId,
        expected: '',
        observed: '',
        result: 'pass',
        notes: ''
    };
}

function template() {
    return {
        $comment: 'Written by hand after running docs/screen-reader-smoke.md. Nothing generates this.',
        records: COVERED_SURFACES.flatMap((surface) =>
            REQUIRED_BROWSERS.map((browser) => ({ ...blankRecord(surface.id), browser })))
    };
}

function main(argv) {
    if (argv.includes('--template')) {
        process.stdout.write(JSON.stringify(template(), null, 2) + '\n');
        return 0;
    }
    const verdict = evaluateEvidence({});
    const prefix = '[screen-reader-evidence]';
    if (verdict.status === 'pass') {
        console.log(`${prefix} OK — ${verdict.details}`);
        return 0;
    }
    if (verdict.status === 'warn') {
        console.warn(`${prefix} WARN — ${verdict.details}`);
        return 0;
    }
    console.error(`${prefix} FAIL — ${verdict.details}`);
    return 1;
}

module.exports = {
    COVERED_SURFACES,
    REQUIRED_BROWSERS,
    REQUIRED_TECH,
    OPTIONAL_TECH,
    RESULTS,
    MAX_EVIDENCE_AGE_DAYS,
    EVIDENCE_PATH,
    validateRecord,
    loadEvidence,
    coverageGaps,
    failures,
    newestDate,
    ageInDays,
    surfacesChangedSince,
    evaluateEvidence,
    template
};

if (require.main === module) process.exit(main(process.argv.slice(2)));
