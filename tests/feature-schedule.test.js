'use strict';

// Schedule-driven feature activation ("focus hours").
//
// Three properties carry the whole design and each has a way to be quietly
// wrong:
//
//   Overnight windows. 22:00–06:00 is the shape people actually write, and
//   the naive `now >= start && now < end` comparison is false for every
//   minute of it.
//
//   Restore, never default. Leaving a window must put back the value the user
//   had before it opened. Writing the schema default instead looks identical
//   on a feature that defaults off, and silently discards a preference on one
//   that does not.
//
//   No alarms permission. The runtime asks this module when the next boundary
//   is and sets one local timer. If msUntilNextBoundary is wrong the feature
//   still works — it just fires late — which is exactly the kind of bug that
//   never gets noticed, so it is pinned here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

function loadSchedule() {
    globalThis.YTKitCore = {};
    const src = fs.readFileSync(path.join(repoRoot, 'extension/core/feature-schedule.js'), 'utf8');
    // eslint-disable-next-line no-eval
    (0, eval)(src);
    return globalThis.YTKitCore;
}

// Local-clock constructor: schedules mean the VIEWER's 22:00, so every
// fixture is built in local time, never from a UTC string.
function at(year, month, day, hours, minutes) {
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

const EVENING = { start: '20:00', end: '23:00' };
const OVERNIGHT = { start: '22:00', end: '06:00' };

test('a daytime window is open inside it and closed outside it', () => {
    const core = loadSchedule();
    assert.equal(core.isWithinWindow(EVENING, at(2026, 8, 19, 21, 0)), true);
    assert.equal(core.isWithinWindow(EVENING, at(2026, 8, 19, 19, 59)), false);
    assert.equal(core.isWithinWindow(EVENING, at(2026, 8, 19, 20, 0)), true, 'the start minute is inside');
    assert.equal(core.isWithinWindow(EVENING, at(2026, 8, 19, 23, 0)), false, 'the end minute is outside');
});

test('an overnight window covers the small hours of the FOLLOWING day', () => {
    const core = loadSchedule();
    assert.equal(core.isWithinWindow(OVERNIGHT, at(2026, 8, 19, 23, 30)), true);
    assert.equal(core.isWithinWindow(OVERNIGHT, at(2026, 8, 20, 2, 0)), true,
        'a naive start<=now<end comparison reports false here, which is the bug');
    assert.equal(core.isWithinWindow(OVERNIGHT, at(2026, 8, 20, 6, 0)), false);
    assert.equal(core.isWithinWindow(OVERNIGHT, at(2026, 8, 20, 12, 0)), false);
});

test('an overnight window belongs to the day its START falls on', () => {
    const core = loadSchedule();
    // Weekdays only: Monday(1) through Friday(5).
    const weeknights = { ...OVERNIGHT, days: [1, 2, 3, 4, 5] };
    // 2026-08-21 is a Friday.
    assert.equal(at(2026, 8, 21, 23, 0).getDay(), 5, 'fixture sanity: Friday');
    assert.equal(core.isWithinWindow(weeknights, at(2026, 8, 21, 23, 0)), true,
        'Friday night is a weeknight');
    assert.equal(core.isWithinWindow(weeknights, at(2026, 8, 22, 2, 0)), true,
        'Saturday 02:00 belongs to Friday night, which was scheduled');
    assert.equal(core.isWithinWindow(weeknights, at(2026, 8, 23, 2, 0)), false,
        'Sunday 02:00 belongs to Saturday night, which was not');
});

test('day-of-week filtering excludes unscheduled days entirely', () => {
    const core = loadSchedule();
    const weekend = { ...EVENING, days: [0, 6] };
    assert.equal(at(2026, 8, 22, 21, 0).getDay(), 6, 'fixture sanity: Saturday');
    assert.equal(core.isWithinWindow(weekend, at(2026, 8, 22, 21, 0)), true);
    assert.equal(core.isWithinWindow(weekend, at(2026, 8, 19, 21, 0)), false, 'Wednesday is not in the list');
});

test('a parked schedule keeps its times but never opens', () => {
    const core = loadSchedule();
    assert.equal(core.isWithinWindow({ ...EVENING, enabled: false }, at(2026, 8, 19, 21, 0)), false);
    const normalized = core.normalizeFeatureSchedule({ ...EVENING, enabled: false });
    assert.equal(normalized.start, '20:00', 'the times survive so the schedule can be resumed');
});

test('malformed schedules are dropped, never repaired into a window nobody chose', () => {
    const core = loadSchedule();
    assert.equal(core.normalizeFeatureSchedule(null), null);
    assert.equal(core.normalizeFeatureSchedule({ start: '25:00', end: '06:00' }), null);
    assert.equal(core.normalizeFeatureSchedule({ start: '8:00', end: '09:00' }), null, 'HH must be zero-padded');
    assert.equal(core.normalizeFeatureSchedule({ start: '10:00' }), null, 'a window needs both ends');
    assert.equal(core.normalizeFeatureSchedule({ start: '10:00', end: '10:00' }), null, 'a zero-length window is not a window');
});

test('an empty day list means every day rather than a feature switched off forever', () => {
    const core = loadSchedule();
    assert.deepEqual(core.normalizeFeatureSchedule({ ...EVENING, days: [] }).days, [0, 1, 2, 3, 4, 5, 6]);
    assert.deepEqual(core.normalizeFeatureSchedule({ ...EVENING, days: [9, 'x', -1] }).days, [0, 1, 2, 3, 4, 5, 6]);
    assert.deepEqual(core.normalizeFeatureSchedule({ ...EVENING, days: [3, 1, 1] }).days, [1, 3]);
});

test('the schedule map is bounded and rejects hostile feature ids', () => {
    const core = loadSchedule();
    const raw = { '__proto__': EVENING, 'has space': EVENING, focusedMode: EVENING };
    const normalized = core.normalizeFeatureSchedules(raw);
    assert.deepEqual(Object.keys(normalized), ['focusedMode']);

    const many = {};
    for (let i = 0; i < core.FEATURE_SCHEDULE_MAX + 20; i += 1) many[`feature${i}`] = EVENING;
    assert.equal(Object.keys(core.normalizeFeatureSchedules(many)).length, core.FEATURE_SCHEDULE_MAX);
    assert.deepEqual(core.normalizeFeatureSchedules(null), {});
    assert.deepEqual(core.normalizeFeatureSchedules([EVENING]), {});
});

test('the next boundary is the nearer of the two edges, so one local timer suffices', () => {
    const core = loadSchedule();
    const minutes = (ms) => Math.round(ms / 60000);
    // 19:30, window 20:00-23:00 -> 30 minutes to the opening edge.
    assert.equal(minutes(core.msUntilNextBoundary(EVENING, at(2026, 8, 19, 19, 30))), 30);
    // 22:00 inside the window -> 60 minutes to the closing edge.
    assert.equal(minutes(core.msUntilNextBoundary(EVENING, at(2026, 8, 19, 22, 0))), 60);
    // 23:30, both edges are tomorrow -> 20:30 to the next opening.
    assert.equal(minutes(core.msUntilNextBoundary(EVENING, at(2026, 8, 19, 23, 30))), 20 * 60 + 30);
});

test('a boundary landing mid-minute still returns a positive delay', () => {
    const core = loadSchedule();
    const date = new Date(2026, 7, 19, 19, 59, 30, 0);
    const ms = core.msUntilNextBoundary(EVENING, date);
    assert.ok(ms > 0 && ms <= 60000, `expected under a minute, got ${ms}`);
});

// ── the transition plan ──

test('opening a window records what the user had before switching the feature on', () => {
    const core = loadSchedule();
    const plan = core.planScheduleTransitions({
        schedules: { focusedMode: EVENING },
        settings: { focusedMode: false },
        saved: {},
        now: at(2026, 8, 19, 21, 0)
    });
    assert.deepEqual(plan.activate, [{ featureId: 'focusedMode', previous: false }]);
    assert.deepEqual(plan.saved, { focusedMode: false });
    assert.deepEqual(plan.restore, []);
});

test('closing a window restores the held value, not the schema default', () => {
    const core = loadSchedule();
    // The user had this feature ON before the window opened. Restoring a
    // "default" of false here would silently discard their preference.
    const plan = core.planScheduleTransitions({
        schedules: { focusedMode: EVENING },
        settings: { focusedMode: true },
        saved: { focusedMode: true },
        now: at(2026, 8, 19, 23, 30)
    });
    assert.deepEqual(plan.restore, [{ featureId: 'focusedMode', value: true }]);
    assert.deepEqual(plan.saved, {}, 'the ledger entry is handed back and cleared');
});

test('a window already open does nothing on a repeat tick', () => {
    const core = loadSchedule();
    const plan = core.planScheduleTransitions({
        schedules: { focusedMode: EVENING },
        settings: { focusedMode: true },
        saved: { focusedMode: false },
        now: at(2026, 8, 19, 21, 30)
    });
    assert.deepEqual(plan.activate, [], 'no repeated writes while nothing changed');
    assert.deepEqual(plan.restore, []);
    assert.deepEqual(plan.saved, { focusedMode: false }, 'the held value survives the tick');
});

test('a feature switched off by hand mid-window is switched back on, keeping the original held value', () => {
    const core = loadSchedule();
    const plan = core.planScheduleTransitions({
        schedules: { focusedMode: EVENING },
        settings: { focusedMode: false },
        saved: { focusedMode: true },
        now: at(2026, 8, 19, 21, 30)
    });
    assert.deepEqual(plan.activate, [{ featureId: 'focusedMode', previous: true }]);
    assert.deepEqual(plan.saved, { focusedMode: true },
        'the value to restore at closing time is still what preceded the window');
});

test('deleting a schedule mid-window still hands the held value back', () => {
    const core = loadSchedule();
    // Otherwise the feature is stranded at the schedule's value with nothing
    // left in the system that knows how to undo it.
    const plan = core.planScheduleTransitions({
        schedules: {},
        settings: { focusedMode: true },
        saved: { focusedMode: false },
        now: at(2026, 8, 19, 21, 30)
    });
    assert.deepEqual(plan.restore, [{ featureId: 'focusedMode', value: false, orphaned: true }]);
});

test('with no schedules there is nothing to do and no timer to arm', () => {
    const core = loadSchedule();
    const plan = core.planScheduleTransitions({ schedules: {}, settings: {}, saved: {} });
    assert.equal(plan.scheduleCount, 0);
    assert.equal(plan.nextBoundaryMs, null);
    assert.deepEqual(plan.activate, []);
    assert.deepEqual(plan.restore, []);
});

test('the plan reports the soonest boundary across every schedule', () => {
    const core = loadSchedule();
    const plan = core.planScheduleTransitions({
        schedules: {
            focusedMode: { start: '20:00', end: '23:00' },
            digitalWellbeing: { start: '19:45', end: '21:00' }
        },
        settings: {},
        saved: {},
        now: at(2026, 8, 19, 19, 30)
    });
    assert.equal(Math.round(plan.nextBoundaryMs / 60000), 15,
        'one timer serves every schedule, so it must be armed for the nearest edge');
});

// ── the runtime contract ──

test('focus hours stay on a local timer even when zero-ad recovery uses alarms', () => {
    const ytkit = fs.readFileSync(path.join(repoRoot, 'extension/ytkit.js'), 'utf8');
    const start = ytkit.indexOf('function applyFeatureSchedules');
    assert.ok(start > -1, 'the schedule runtime must exist');
    const body = ytkit.slice(start, ytkit.indexOf('function updateFeatureHealth', start));
    assert.match(body, /setTimeout\(/, 'the next tick is a local timer');
    assert.doesNotMatch(body, /chrome\.alarms|ext\.alarms/, 'no alarms API may appear in the runtime');
    // A long timer can be arbitrarily late after the machine sleeps.
    assert.match(body, /SCHEDULE_MAX_SLEEP_MS/);
});

test('the schedule travels with an export but the restore ledger does not', () => {
    const schema = fs.readFileSync(path.join(repoRoot, 'extension/core/settings-schema.js'), 'utf8');
    assert.match(schema, /key: "featureSchedules", [^\n]*internal: false/,
        'the schedule is user data and must export/import with settings');
    // The ledger describes a moment on one device. Importing someone else's
    // mid-window state would restore values the importing user never set.
    assert.match(schema, /key: "_scheduleRestore", [^\n]*internal: true/,
        'the restore ledger is device-local state, not portable settings');
});
