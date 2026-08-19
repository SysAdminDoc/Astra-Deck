(() => {
    'use strict';

    // extension/core/feature-schedule.js
    //
    // v4.69.0 — "focus hours": let any boolean feature carry an optional
    // active window.
    //
    // Three constraints shape this module, and all three are why it is pure:
    //
    //   NO ALARMS. `chrome.alarms` would be a new permission for something the
    //   page can work out itself. The runtime asks this module when the next
    //   boundary is and sets one local timer; nothing is scheduled with the
    //   browser.
    //
    //   LOCAL TIME, NOT UTC. "22:00" means the viewer's 22:00. Every
    //   comparison is against the local-clock fields of a Date, never its
    //   epoch value, so a schedule keeps meaning the same thing across DST and
    //   across travel.
    //
    //   RESTORE, DON'T DEFAULT. Leaving a window must put back the value the
    //   user had before the window opened — not the schema default. The caller
    //   owns that saved value; this module only says what should happen and
    //   never invents a value to write.
    //
    // Windows may cross midnight (22:00–06:00). Such a window is evaluated
    // against the day its START falls on, so "weekdays 22:00–06:00" still
    // covers Friday 23:00 and Saturday 02:00, and does not accidentally open
    // on Sunday evening.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.normalizeFeatureSchedule) return;

    const MINUTES_PER_DAY = 24 * 60;
    const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
    // Bound the map: this is user-authored config, but it round-trips through
    // settings import, where the file is not trusted.
    const MAX_SCHEDULES = 64;
    const FEATURE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;

    function parseTimeOfDay(value) {
        if (typeof value !== 'string') return null;
        const match = TIME_PATTERN.exec(value.trim());
        if (!match) return null;
        return Number(match[1]) * 60 + Number(match[2]);
    }

    function formatTimeOfDay(minutes) {
        if (!Number.isFinite(minutes)) return null;
        const wrapped = ((Math.floor(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
        const hh = String(Math.floor(wrapped / 60)).padStart(2, '0');
        const mm = String(wrapped % 60).padStart(2, '0');
        return `${hh}:${mm}`;
    }

    function normalizeDays(value) {
        // Absent means every day. An explicit empty list is a schedule that can
        // never open, which is almost certainly a mistake — treat it the same
        // as "every day" rather than silently disabling the feature forever.
        if (!Array.isArray(value) || value.length === 0) return [0, 1, 2, 3, 4, 5, 6];
        const days = new Set();
        for (const entry of value) {
            const day = Number(entry);
            if (Number.isInteger(day) && day >= 0 && day <= 6) days.add(day);
        }
        return days.size ? [...days].sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5, 6];
    }

    function normalizeScheduleEntry(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        const start = parseTimeOfDay(raw.start);
        const end = parseTimeOfDay(raw.end);
        if (start === null || end === null) return null;
        // A zero-length window is not a window.
        if (start === end) return null;
        return Object.freeze({
            start: formatTimeOfDay(start),
            end: formatTimeOfDay(end),
            days: Object.freeze(normalizeDays(raw.days)),
            // A schedule can be parked without losing its times.
            enabled: raw.enabled !== false
        });
    }

    // Accepts the raw settings value and returns only well-formed entries.
    // A malformed entry is dropped, never repaired into something that would
    // silently switch a feature on at a time the user never chose.
    function normalizeFeatureSchedules(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
        const out = {};
        let kept = 0;
        for (const [featureId, value] of Object.entries(raw)) {
            if (kept >= MAX_SCHEDULES) break;
            if (!FEATURE_ID_PATTERN.test(featureId)) continue;
            const entry = normalizeScheduleEntry(value);
            if (!entry) continue;
            out[featureId] = entry;
            kept += 1;
        }
        return out;
    }

    function localMinutes(date) {
        return date.getHours() * 60 + date.getMinutes();
    }

    // Does `date` fall inside the window? Overnight windows belong to the day
    // their START falls on, so the previous day's window is what covers the
    // small hours.
    function isWithinWindow(schedule, date = new Date()) {
        const entry = normalizeScheduleEntry(schedule);
        if (!entry || !entry.enabled) return false;
        const days = entry.days;
        const start = parseTimeOfDay(entry.start);
        const end = parseTimeOfDay(entry.end);
        const now = localMinutes(date);
        const today = date.getDay();
        if (start < end) {
            return days.includes(today) && now >= start && now < end;
        }
        // Overnight. Either we are after the start on a scheduled day, or
        // before the end on the day AFTER a scheduled day.
        if (days.includes(today) && now >= start) return true;
        const yesterday = (today + 6) % 7;
        return days.includes(yesterday) && now < end;
    }

    // Milliseconds until this schedule's state could next change. The runtime
    // uses the smallest across all schedules to set ONE local timer, which is
    // how this works without an alarms permission.
    function msUntilNextBoundary(schedule, date = new Date()) {
        const entry = normalizeScheduleEntry(schedule);
        if (!entry) return null;
        const start = parseTimeOfDay(entry.start);
        const end = parseTimeOfDay(entry.end);
        const nowMinutes = localMinutes(date);
        const secondsPast = date.getSeconds() + date.getMilliseconds() / 1000;
        let best = null;
        for (const boundary of [start, end]) {
            let delta = boundary - nowMinutes;
            if (delta <= 0) delta += MINUTES_PER_DAY;
            const ms = delta * 60000 - secondsPast * 1000;
            if (ms > 0 && (best === null || ms < best)) best = ms;
        }
        return best;
    }

    // What should be true right now.
    //
    // `saved` maps featureId -> the value the user had before its window last
    // opened. Returning `restore: true` with no value would let the caller
    // invent a default, so a feature with no saved value is restored to false —
    // the only value we can be sure was not chosen by the schedule itself.
    function planScheduleTransitions(input = {}) {
        const schedules = normalizeFeatureSchedules(input.schedules);
        const settings = input.settings && typeof input.settings === 'object' ? input.settings : {};
        const saved = input.saved && typeof input.saved === 'object' ? input.saved : {};
        const now = input.now instanceof Date ? input.now : new Date();

        const activate = [];
        const restore = [];
        const stillSaved = {};
        let nextBoundaryMs = null;

        for (const [featureId, schedule] of Object.entries(schedules)) {
            const boundary = msUntilNextBoundary(schedule, now);
            if (boundary !== null && (nextBoundaryMs === null || boundary < nextBoundaryMs)) {
                nextBoundaryMs = boundary;
            }
            const inside = isWithinWindow(schedule, now);
            const held = Object.prototype.hasOwnProperty.call(saved, featureId);
            const current = settings[featureId] === true;

            if (inside) {
                if (!held) {
                    // Opening: remember what the user had, then switch on.
                    activate.push({ featureId, previous: current });
                    stillSaved[featureId] = current;
                } else {
                    stillSaved[featureId] = saved[featureId] === true;
                    // Already inside; only act if something switched it back off.
                    if (!current) activate.push({ featureId, previous: stillSaved[featureId] });
                }
            } else if (held) {
                // Closing: put back exactly what was there before.
                restore.push({ featureId, value: saved[featureId] === true });
            }
        }

        // A saved value whose schedule was deleted mid-window must still be
        // handed back, or the feature would be stuck at the schedule's value
        // with nothing left to restore it.
        for (const featureId of Object.keys(saved)) {
            if (Object.prototype.hasOwnProperty.call(schedules, featureId)) continue;
            restore.push({ featureId, value: saved[featureId] === true, orphaned: true });
        }

        return { activate, restore, saved: stillSaved, nextBoundaryMs, scheduleCount: Object.keys(schedules).length };
    }

    function describeSchedule(schedule, translate) {
        const t = typeof translate === 'function' ? translate : (_key, fallback) => fallback;
        const entry = normalizeScheduleEntry(schedule);
        if (!entry) return null;
        const everyDay = entry.days.length === 7;
        const window = `${entry.start}–${entry.end}`;
        if (everyDay) {
            return t('featureScheduleEveryDayTpl', 'Active {window} every day').replace('{window}', window);
        }
        return t('featureScheduleDaysTpl', 'Active {window} on {days}')
            .replace('{window}', window)
            .replace('{days}', entry.days.join(', '));
    }

    Object.assign(core, {
        FEATURE_SCHEDULE_MAX: MAX_SCHEDULES,
        describeSchedule,
        isWithinWindow,
        msUntilNextBoundary,
        normalizeFeatureSchedule: normalizeScheduleEntry,
        normalizeFeatureSchedules,
        planScheduleTransitions
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            FEATURE_SCHEDULE_MAX: MAX_SCHEDULES,
            describeSchedule,
            isWithinWindow,
            msUntilNextBoundary,
            normalizeFeatureSchedule: normalizeScheduleEntry,
            normalizeFeatureSchedules,
            planScheduleTransitions
        };
    }
})();
