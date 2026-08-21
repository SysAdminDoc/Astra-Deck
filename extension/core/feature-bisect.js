(() => {
    'use strict';

    // extension/core/feature-bisect.js
    //
    // "Something broke for you but not for me, and your report is the only
    // signal I get." With 291 features and no telemetry, a reporter has no way
    // to say WHICH one, and two discussions asking for exactly this
    // information have sat unanswered because nobody could answer them.
    //
    // A binary search over the enabled set reaches one culprit in about ten
    // reloads and moves the identifying work to the only person who can
    // reproduce the problem. This module is the state machine: pure, no
    // storage, no DOM, no timers. It is handed the set of enabled feature IDs
    // and a stream of yes/no answers, and it says which features to switch off
    // for the next attempt.
    //
    // Two things it must never get wrong, because both would waste the user's
    // ten reloads and hand the maintainer a false lead:
    //
    //   1. The snapshot is the truth to restore. Every step derives from the
    //      ORIGINAL enabled set, never from whatever the settings happen to
    //      say mid-run, so an interrupted session restores exactly what the
    //      user had rather than whatever half-state it left behind.
    //   2. A run that narrows to nothing reports that no single feature is
    //      responsible. Blaming the last candidate standing is the failure
    //      mode that makes a bisect worse than no bisect — it produces a
    //      confident wrong answer, which costs more than an honest miss.
    //
    // The search. Step 1 turns EVERYTHING in the snapshot off. If the problem
    // still happens with every feature disabled, no feature is responsible and
    // the run ends there rather than continuing to divide a set that cannot
    // contain the answer. After that each step keeps half the candidates
    // enabled: "still happens" means the culprit is among the half left ON,
    // "gone" means it is among the half switched OFF.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createFeatureBisect) return;

    // A session older than this is abandoned, not in progress. Restoring is
    // bounded by a stored deadline rather than by the user remembering to
    // finish, because the failure being investigated is often "the page is
    // unusable" — exactly the state someone closes the tab on.
    const BISECT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

    const PHASE_BASELINE = 'baseline';
    const PHASE_SEARCH = 'search';
    const PHASE_CONFIRM = 'confirm';
    const PHASE_CULPRIT = 'culprit';
    const PHASE_NONE = 'none';

    function normalizeIds(ids) {
        if (!Array.isArray(ids)) return [];
        const seen = new Set();
        for (const id of ids) {
            if (typeof id === 'string' && id) seen.add(id);
        }
        // Sorted so a session is reproducible: the same enabled set always
        // produces the same sequence of steps, which matters when a user
        // reports "it went away at step 4".
        return [...seen].sort();
    }

    /**
     * Starts a bisect over the currently enabled features.
     *
     * @param {string[]} enabledIds feature IDs that are on right now
     * @param {number} startedAt    epoch ms, passed in so this stays pure
     */
    function startFeatureBisect(enabledIds, startedAt) {
        const snapshot = normalizeIds(enabledIds);
        return {
            schemaVersion: 1,
            startedAt: Number(startedAt) || 0,
            snapshot,
            // Candidates narrow; snapshot never does. Restoring reads the
            // snapshot, so a session interrupted at any step gives the user
            // back exactly what they had.
            candidates: snapshot.slice(),
            // The half currently switched OFF. Empty on the baseline step
            // means "everything off"; see disabledForStep below.
            phase: snapshot.length ? PHASE_BASELINE : PHASE_NONE,
            step: 1,
            answers: []
        };
    }

    // Upper bound on steps: the baseline check, one halving per bit, and the
    // confirmation.
    function totalSteps(session) {
        const n = session?.snapshot?.length || 0;
        if (n <= 0) return 0;
        return Math.ceil(Math.log2(n)) + 2;
    }

    /**
     * Which feature IDs must be OFF for the current step.
     *
     * Callers apply this to the live settings without persisting it as the
     * user's choice; the snapshot remains the record of what they actually
     * want.
     */
    function disabledForStep(session) {
        if (!session) return [];
        if (session.phase === PHASE_BASELINE) return session.snapshot.slice();
        if (session.phase === PHASE_CONFIRM) {
            // Only the accused stays on. If the problem does not come back,
            // the search followed a bad answer somewhere and the run has to
            // say so rather than hand over a name.
            return session.snapshot.filter((id) => id !== session.candidates[0]);
        }
        if (session.phase !== PHASE_SEARCH) return [];
        const half = Math.ceil(session.candidates.length / 2);
        // Keep the first half enabled, switch the rest off. Everything outside
        // the candidate set stays as the snapshot had it — narrowing has
        // already cleared those of suspicion, and turning them back off would
        // change the page for no information.
        return session.candidates.slice(half);
    }

    /**
     * Records one answer and returns the next session state.
     *
     * @param {object} session
     * @param {boolean} stillHappens did the problem still occur on that step?
     */
    function answerFeatureBisect(session, stillHappens) {
        if (!session || session.phase === PHASE_CULPRIT || session.phase === PHASE_NONE) {
            return session;
        }
        const answered = {
            ...session,
            answers: [...session.answers, { step: session.step, stillHappens: !!stillHappens }],
            step: session.step + 1
        };

        if (session.phase === PHASE_BASELINE) {
            // Still broken with every feature off: nothing in this extension's
            // enabled set is doing it. Saying so is the whole point — the
            // alternative is dividing a set that cannot contain the answer and
            // naming whatever survives.
            if (stillHappens) return { ...answered, phase: PHASE_NONE, candidates: [] };
            return {
                ...answered,
                phase: session.candidates.length === 1 ? PHASE_CONFIRM : PHASE_SEARCH
            };
        }

        if (session.phase === PHASE_CONFIRM) {
            // The last word. Without it this state machine can never miss: the
            // halving always leaves exactly one name, so an intermittent
            // problem, a misread step, or a cause that is really two features
            // together would all end in a confident accusation. Turning only
            // the accused back on is the cheap check that makes the answer
            // worth acting on.
            if (stillHappens) return { ...answered, phase: PHASE_CULPRIT };
            return { ...answered, phase: PHASE_NONE, candidates: [] };
        }

        const half = Math.ceil(session.candidates.length / 2);
        const kept = session.candidates.slice(0, half);
        const switchedOff = session.candidates.slice(half);
        const candidates = stillHappens ? kept : switchedOff;

        // Both halves are non-empty for any set of two or more, and a set of
        // one never reaches this branch, so neither side can come back empty.
        if (candidates.length === 1) return { ...answered, phase: PHASE_CONFIRM, candidates };
        return { ...answered, phase: PHASE_SEARCH, candidates };
    }

    function isBisectFinished(session) {
        return session?.phase === PHASE_CULPRIT || session?.phase === PHASE_NONE;
    }

    // A session past its deadline is abandoned. The caller restores the
    // snapshot and drops it rather than resuming a search whose answers are
    // about a page state from yesterday.
    function isBisectExpired(session, now, maxAgeMs = BISECT_MAX_AGE_MS) {
        if (!session || !Number.isFinite(session.startedAt) || session.startedAt <= 0) return true;
        const age = now - session.startedAt;
        return age < 0 || age > maxAgeMs;
    }

    /**
     * The block the user copies into a report.
     *
     * Feature IDs, versions, and the page type — the four things the
     * maintainer asked for and nothing else. No URL, no channel, no settings
     * values: a bisect report is pasted in public like the feature report is.
     */
    function formatBisectResult(session, context = {}) {
        const lines = [];
        if (session?.phase === PHASE_CULPRIT && session.candidates.length === 1) {
            lines.push(`Astra Deck feature bisect: ${session.candidates[0]}`);
        } else {
            lines.push('Astra Deck feature bisect: no single feature is responsible');
        }
        lines.push(`Astra Deck ${context.version || 'unknown'}`);
        lines.push(String(context.browser || 'unknown browser'));
        lines.push(`Page: ${context.pageType || 'unknown'}`);
        lines.push(`Searched ${session?.snapshot?.length || 0} enabled feature(s) in ${session?.answers?.length || 0} step(s)`);
        return lines.join('\n');
    }

    core.createFeatureBisect = startFeatureBisect;
    core.answerFeatureBisect = answerFeatureBisect;
    core.disabledForBisectStep = disabledForStep;
    core.isBisectFinished = isBisectFinished;
    core.isBisectExpired = isBisectExpired;
    core.formatBisectResult = formatBisectResult;
    core.bisectTotalSteps = totalSteps;
    core.BISECT_MAX_AGE_MS = BISECT_MAX_AGE_MS;
    core.BISECT_PHASES = Object.freeze({
        BASELINE: PHASE_BASELINE,
        SEARCH: PHASE_SEARCH,
        CONFIRM: PHASE_CONFIRM,
        CULPRIT: PHASE_CULPRIT,
        NONE: PHASE_NONE
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            startFeatureBisect,
            answerFeatureBisect,
            disabledForStep,
            isBisectFinished,
            isBisectExpired,
            formatBisectResult,
            totalSteps,
            BISECT_MAX_AGE_MS,
            BISECT_PHASES: core.BISECT_PHASES
        };
    }
})();
