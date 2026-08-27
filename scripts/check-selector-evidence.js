#!/usr/bin/env node
'use strict';

// Selector-evidence freshness gate.
//
// Every selector pack declares `lastVerified`, `highChurn`, and
// `needsFreshCapture`. Until v4.88.3 none of that meant anything: the only
// assertion in the suite checked that `lastVerified` matched `\d{4}-\d{2}-\d{2}`.
// All 35 surfaces claimed `needsFreshCapture: false` on evidence dated
// 2026-05-19 through 2026-07-14, 29 of them flagged high-churn, while the
// critical-selector canary recorded a YouTube client version from 2026-08-20.
// The metadata was decorative.
//
// A surface needs recapture when its evidence is older than
// STALE_AFTER_DAYS, or older than the day the canary last saw YouTube ship a
// build. High-churn surfaces are held to that bar; the rest are reported but
// not enforced, because a stable surface aging is not by itself a defect.
//
// The recapture itself needs a live browser and is tracked in
// Roadmap_Blocked.md ("Selector fixture refresh for Delhi Modern player").
// This gate cannot perform it, so surfaces already stale on the day the gate
// landed are recorded in selector-evidence-exceptions.json with the date they
// were accepted. The gate fails on anything NEW: a surface that goes stale
// later, a pack whose date moves without the exception being updated, or an
// exception for a surface that is no longer stale. That is the same shape as
// the dependency audit's reviewed-exception list, and it means the debt is
// loud, dated, and cannot quietly grow.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const EXCEPTIONS_PATH = path.join(__dirname, 'selector-evidence-exceptions.json');
const CANARY_PATH = path.join(REPO_ROOT, 'tests', 'fixtures', 'critical-selector-canary.json');

// High-churn YouTube surfaces move faster than a release cycle. Sixty days is
// the point past which evidence stops being a useful claim about the live site.
const STALE_AFTER_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

// `2.20260820.01.00` -> 2026-08-20. The middle field is the build date and is
// the only part that tells us when YouTube last shipped.
function canaryClientVersionDate(version) {
    const match = /^\d+\.(\d{4})(\d{2})(\d{2})\./.exec(String(version || ''));
    if (!match) return null;
    return `${match[1]}-${match[2]}-${match[3]}`;
}

// Returns null only when the canary genuinely cannot be read. The caller
// treats that as a failure rather than as "nothing is stale": an unreadable
// canary silently removed half this gate's criterion, which is the wrong
// direction for a freshness check.
function readCanaryDate() {
    if (!fs.existsSync(CANARY_PATH)) return null;
    try {
        const parsed = JSON.parse(fs.readFileSync(CANARY_PATH, 'utf8'));
        return canaryClientVersionDate(parsed.youtubeClientVersion);
    } catch (_) {
        // reason: a corrupt canary is reported by the caller, not swallowed
        return null;
    }
}

function daysBetween(fromIso, toIso) {
    const from = Date.parse(`${fromIso}T00:00:00Z`);
    const to = Date.parse(`${toIso}T00:00:00Z`);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
    return Math.floor((to - from) / DAY_MS);
}

// `today` is injectable so the gate's own tests do not drift as the clock moves.
function assessSurfaces(surfaceMap, { today, canaryDate, staleAfterDays = STALE_AFTER_DAYS } = {}) {
    const rows = [];
    for (const surface of Object.keys(surfaceMap).sort()) {
        const entry = surfaceMap[surface] || {};
        const lastVerified = typeof entry.lastVerified === 'string' ? entry.lastVerified : null;
        const age = lastVerified ? daysBetween(lastVerified, today) : null;
        const olderThanCanary = Boolean(lastVerified && canaryDate && lastVerified < canaryDate);
        const reasons = [];
        if (!lastVerified) reasons.push('no lastVerified date');
        // A forward-dated pack used to read as fresh forever. A typo in the
        // year is the likeliest way that happens.
        if (age !== null && age < 0) reasons.push(`dated ${lastVerified}, which is in the future`);
        if (age !== null && age > staleAfterDays) reasons.push(`${age} days old (limit ${staleAfterDays})`);
        if (olderThanCanary) reasons.push(`predates the canary's YouTube build ${canaryDate}`);
        rows.push({
            surface,
            lastVerified,
            ageDays: age,
            highChurn: entry.highChurn === true,
            needsFreshCapture: entry.needsFreshCapture === true,
            stale: reasons.length > 0,
            reasons
        });
    }
    return rows;
}

// An absent file is the legitimate end state — every surface recaptured — so
// it must read as "no accepted debt", not as a malformed config.
function readExceptions() {
    if (!fs.existsSync(EXCEPTIONS_PATH)) {
        return { schemaVersion: 1, staleAfterDays: STALE_AFTER_DAYS, surfaces: {} };
    }
    return JSON.parse(fs.readFileSync(EXCEPTIONS_PATH, 'utf8'));
}

// Enforced only for high-churn surfaces. A stable surface aging is reported so
// the number is visible, but it does not fail a build on its own.
function evaluate(rows, exceptions) {
    const accepted = exceptions.surfaces || {};
    const problems = [];
    const outstanding = [];

    for (const row of rows) {
        const exception = accepted[row.surface];
        if (!row.stale) {
            if (exception) {
                problems.push(
                    `${row.surface} is no longer stale — remove its entry from `
                    + 'scripts/selector-evidence-exceptions.json');
            }
            continue;
        }
        if (!row.highChurn) continue;
        if (!exception) {
            problems.push(
                `${row.surface} needs a fresh capture: ${row.reasons.join('; ')}. `
                + 'Recapture per docs/selector-fixture-workflow.md, or record a dated '
                + 'exception in scripts/selector-evidence-exceptions.json.');
            continue;
        }
        if (exception.lastVerified !== row.lastVerified) {
            problems.push(
                `${row.surface} moved to ${row.lastVerified} but its exception still records `
                + `${exception.lastVerified} — re-record or drop the exception.`);
            continue;
        }
        outstanding.push(row);
    }

    for (const surface of Object.keys(accepted)) {
        if (!rows.some((row) => row.surface === surface)) {
            problems.push(`${surface} has an exception but is not a registered selector surface`);
        }
    }

    return { problems, outstanding };
}

function loadRows(today) {
    const { loadSurfaceSelectorMap } = require('./build-selector-fixtures.js');
    return assessSurfaces(loadSurfaceSelectorMap(), {
        today,
        canaryDate: readCanaryDate()
    });
}

function isoToday() {
    return new Date().toISOString().slice(0, 10);
}

function main(argv) {
    const today = isoToday();
    const rows = loadRows(today);
    const record = argv.includes('--record');

    if (record) {
        // acceptedOn is carried forward for a surface already on the list.
        // Re-stamping every entry on each run destroyed the one property that
        // made this file useful: how long each piece of debt has been owed.
        const previous = readExceptions().surfaces || {};
        const surfaces = {};
        for (const row of rows.filter((entry) => entry.stale && entry.highChurn).sort((a, b) => a.surface.localeCompare(b.surface))) {
            const prior = previous[row.surface];
            const carried = prior && prior.lastVerified === row.lastVerified
                ? prior.acceptedOn
                : null;
            surfaces[row.surface] = {
                lastVerified: row.lastVerified,
                acceptedOn: carried || today,
                reason: 'Awaiting the browser-gated capture tracked in Roadmap_Blocked.md.'
            };
        }
        const payload = {
            schemaVersion: 1,
            note: 'High-churn selector surfaces whose evidence predates the freshness limit. '
                + 'Shrinking this file is always allowed; growing it means a surface went stale '
                + 'without a recapture.',
            staleAfterDays: STALE_AFTER_DAYS,
            surfaces
        };
        fs.writeFileSync(EXCEPTIONS_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        console.log(`[selector-evidence] recorded ${Object.keys(surfaces).length} accepted surface(s)`);
        return;
    }

    const exceptions = readExceptions();
    const { problems, outstanding } = evaluate(rows, exceptions);
    if (!readCanaryDate()) {
        problems.unshift(
            'tests/fixtures/critical-selector-canary.json is missing or carries no readable '
            + 'youtubeClientVersion, so surfaces cannot be compared against the YouTube build '
            + 'the canary last saw. Restore it rather than running without half this check.');
    }
    if (Number(exceptions.staleAfterDays) !== STALE_AFTER_DAYS) {
        problems.push(
            `scripts/selector-evidence-exceptions.json records staleAfterDays `
            + `${exceptions.staleAfterDays}, but the gate uses ${STALE_AFTER_DAYS}; `
            + 're-record the exceptions after changing the limit.');
    }

    if (problems.length) {
        for (const problem of problems) console.error(`[selector-evidence] ${problem}`);
        process.exitCode = 1;
        return;
    }

    const stale = rows.filter((row) => row.stale);
    console.log(
        `[selector-evidence] OK — ${rows.length} surface(s) checked, `
        + `${outstanding.length} high-churn surface(s) awaiting a live recapture, `
        + `${stale.length - outstanding.length} stable surface(s) also past ${STALE_AFTER_DAYS} days`);
    if (outstanding.length) {
        const oldest = outstanding.reduce((worst, row) => (row.ageDays > worst.ageDays ? row : worst));
        console.log(
            `[selector-evidence] oldest evidence: ${oldest.surface} at ${oldest.lastVerified} `
            + `(${oldest.ageDays} days). Recapture is browser-gated; see Roadmap_Blocked.md.`);
    }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
    STALE_AFTER_DAYS,
    assessSurfaces,
    canaryClientVersionDate,
    daysBetween,
    evaluate,
    readCanaryDate,
    readExceptions
};
