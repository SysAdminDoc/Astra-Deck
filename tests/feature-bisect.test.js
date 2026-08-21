'use strict';

// The user-run feature bisect.
//
// The maintainer's stated blind spot is that a reporter cannot say which of
// 291 features broke their page. A binary search over the enabled set answers
// that in about ten reloads, but only if it is right — a bisect that names the
// wrong feature is worse than no bisect, because it sends the maintainer
// somewhere the bug is not.
//
// So the two properties that matter most here are: it finds the actual culprit
// for EVERY starting position, and it says "no single feature" rather than
// blaming whatever survives when the answers cannot identify one.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadBisect() {
    const modulePath = path.join(__dirname, '..', 'extension', 'core', 'feature-bisect.js');
    delete require.cache[require.resolve(modulePath)];
    const previous = globalThis.YTKitCore;
    globalThis.YTKitCore = {};
    try {
        return require(modulePath);
    } finally {
        globalThis.YTKitCore = previous;
    }
}

const bisect = loadBisect();
const NOW = 1_700_000_000_000;

// Drives a whole run against a known culprit, answering each step the way a
// user with that exact bug would. Returns the finished session and the number
// of steps it took.
function runAgainst(enabledIds, culprit) {
    let session = bisect.startFeatureBisect(enabledIds, NOW);
    let guard = 0;
    while (!bisect.isBisectFinished(session)) {
        if (guard++ > 64) throw new Error('bisect did not terminate');
        const off = new Set(bisect.disabledForStep(session));
        // The problem happens exactly when the culprit is still enabled. A
        // null culprit models an external cause: it keeps happening whatever
        // Astra Deck does.
        const stillHappens = culprit === null ? true : !off.has(culprit);
        session = bisect.answerFeatureBisect(session, stillHappens);
    }
    return { session, steps: session.answers.length };
}

test('every feature in the set is found, whatever its position', () => {
    const features = Array.from({ length: 17 }, (_, i) => `feature${String(i).padStart(2, '0')}`);
    for (const culprit of features) {
        const { session, steps } = runAgainst(features, culprit);
        assert.equal(session.phase, 'culprit', `${culprit} must be identified`);
        assert.deepEqual(session.candidates, [culprit]);
        // ceil(log2(17)) + 1 = 6. A search that needs more than its own bound
        // is asking the user for reloads it does not need.
        assert.ok(steps <= bisect.totalSteps(session),
            `${culprit} took ${steps} steps, bound is ${bisect.totalSteps(session)}`);
    }
});

test('the bound holds across set sizes, including the awkward ones', () => {
    for (const size of [1, 2, 3, 5, 8, 31, 32, 33, 100, 291]) {
        const features = Array.from({ length: size }, (_, i) => `f${i}`);
        for (const culprit of [features[0], features[features.length - 1], features[Math.floor(size / 2)]]) {
            const { session, steps } = runAgainst(features, culprit);
            assert.equal(session.phase, 'culprit', `size ${size}, culprit ${culprit}`);
            assert.deepEqual(session.candidates, [culprit]);
            assert.ok(steps <= bisect.totalSteps(session),
                `size ${size}: ${steps} steps exceeds bound ${bisect.totalSteps(session)}`);
        }
    }
});

test('a problem that survives every feature being off blames no feature', () => {
    // The user's page is broken by YouTube, or by another extension. Dividing
    // a set that cannot contain the answer would end by naming one of them.
    const { session, steps } = runAgainst(['a', 'b', 'c', 'd'], null);
    assert.equal(session.phase, 'none');
    assert.deepEqual(session.candidates, []);
    assert.equal(steps, 1, 'the baseline check ends it immediately');
});

test('an accusation that does not reproduce is reported as a miss', () => {
    // Without the confirmation step the halving always leaves exactly one
    // name, so an intermittent problem — or a cause that is really two
    // features together — would end in a confident accusation. Here the user
    // answers "gone" on the baseline, narrows normally, and then the problem
    // does not come back with only the accused enabled.
    let session = bisect.startFeatureBisect(['a', 'b', 'c', 'd'], NOW);
    session = bisect.answerFeatureBisect(session, false);   // baseline: gone
    let guard = 0;
    while (session.phase === 'search') {
        if (guard++ > 32) throw new Error('did not terminate');
        session = bisect.answerFeatureBisect(session, false);
    }
    assert.equal(session.phase, 'confirm', 'the search must end in a confirmation');
    assert.equal(session.candidates.length, 1);

    // Only the accused is left on for that check.
    const off = bisect.disabledForStep(session);
    assert.equal(off.includes(session.candidates[0]), false);
    assert.equal(off.length, 3);

    session = bisect.answerFeatureBisect(session, false);   // it does not reproduce
    assert.equal(session.phase, 'none',
        'a name that does not reproduce must not be reported as the culprit');
    assert.deepEqual(session.candidates, []);
});

test('the confirmation step is not skippable, so no run ends unverified', () => {
    // Every path from the baseline to a culprit passes through confirm.
    for (const size of [1, 2, 5, 9]) {
        const features = Array.from({ length: size }, (_, i) => `f${i}`);
        for (const culprit of features) {
            let session = bisect.startFeatureBisect(features, NOW);
            const phases = [];
            let guard = 0;
            while (!bisect.isBisectFinished(session)) {
                if (guard++ > 64) throw new Error('did not terminate');
                phases.push(session.phase);
                const off = new Set(bisect.disabledForStep(session));
                session = bisect.answerFeatureBisect(session, !off.has(culprit));
            }
            assert.equal(session.phase, 'culprit');
            assert.equal(phases[phases.length - 1], 'confirm',
                `size ${size}, ${culprit}: the last question must be the confirmation`);
        }
    }
});

test('the snapshot is never narrowed, so an abandoned run restores everything', () => {
    const features = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    let session = bisect.startFeatureBisect(features, NOW);
    session = bisect.answerFeatureBisect(session, false);
    session = bisect.answerFeatureBisect(session, true);
    session = bisect.answerFeatureBisect(session, false);

    assert.deepEqual(session.snapshot, [...features].sort(),
        'the snapshot is the record of what the user actually wants back');
    assert.ok(session.candidates.length < features.length, 'candidates did narrow');
});

test('the baseline step switches every snapshot feature off', () => {
    const session = bisect.startFeatureBisect(['a', 'b', 'c'], NOW);
    assert.equal(session.phase, 'baseline');
    assert.deepEqual(bisect.disabledForStep(session).sort(), ['a', 'b', 'c']);
});

test('a search step leaves half on and switches half off, and nothing else', () => {
    let session = bisect.startFeatureBisect(['a', 'b', 'c', 'd'], NOW);
    session = bisect.answerFeatureBisect(session, false);
    const off = bisect.disabledForStep(session);
    assert.equal(off.length, 2);
    // Everything switched off must be a candidate; features already cleared of
    // suspicion stay as the user had them, because turning them off changes
    // the page for no information.
    for (const id of off) assert.ok(session.candidates.includes(id));
});

test('a finished session asks for nothing further to be switched off', () => {
    const { session } = runAgainst(['a', 'b', 'c', 'd'], 'c');
    assert.equal(session.phase, 'culprit');
    assert.deepEqual(bisect.disabledForStep(session), [],
        'a finished run must not leave features switched off');
    // Answering again is a no-op rather than a state change.
    assert.equal(bisect.answerFeatureBisect(session, true), session);
});

test('starting with nothing enabled finishes immediately rather than looping', () => {
    const session = bisect.startFeatureBisect([], NOW);
    assert.equal(session.phase, 'none');
    assert.equal(bisect.totalSteps(session), 0);
    assert.deepEqual(bisect.disabledForStep(session), []);
});

test('duplicate and junk IDs are dropped before the search starts', () => {
    const session = bisect.startFeatureBisect(['b', 'a', 'b', '', null, 42, 'a'], NOW);
    assert.deepEqual(session.snapshot, ['a', 'b']);
});

test('a session past its deadline is abandoned, not resumed', () => {
    const session = bisect.startFeatureBisect(['a', 'b'], NOW);
    assert.equal(bisect.isBisectExpired(session, NOW + 1000), false);
    assert.equal(bisect.isBisectExpired(session, NOW + bisect.BISECT_MAX_AGE_MS + 1), true);
    // A clock change backwards must not make a session immortal.
    assert.equal(bisect.isBisectExpired(session, NOW - 1000), true);
    assert.equal(bisect.isBisectExpired(null, NOW), true);
});

test('the result names the feature, both versions, and the page type only', () => {
    const { session } = runAgainst(['a', 'b', 'c', 'd'], 'b');
    const report = bisect.formatBisectResult(session, {
        version: '4.84.0',
        browser: 'Chrome 129',
        pageType: 'watch'
    });
    assert.match(report, /^Astra Deck feature bisect: b$/m);
    assert.match(report, /^Astra Deck 4\.84\.0$/m);
    assert.match(report, /^Chrome 129$/m);
    assert.match(report, /^Page: watch$/m);
    assert.match(report, /Searched 4 enabled feature\(s\) in \d+ step\(s\)/);
    // Same rule as the feature report: this gets pasted in public.
    assert.equal(/https?:\/\//.test(report), false);
});

test('a miss says so in the report rather than naming a survivor', () => {
    const { session } = runAgainst(['a', 'b'], null);
    const report = bisect.formatBisectResult(session, { version: '4.84.0' });
    assert.match(report, /no single feature is responsible/);
});

test('the module is pure: no storage, timers, DOM, or clock of its own', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'core', 'feature-bisect.js'), 'utf8');
    for (const forbidden of ['Date.now', 'setTimeout', 'localStorage', 'chrome.', 'document.', 'fetch(']) {
        assert.equal(source.includes(forbidden), false,
            `feature-bisect.js must not reach for ${forbidden}`);
    }
});

// ── The popup half ──
//
// The state machine above is pure; these cover the parts it deliberately does
// not own. The restore path matters most: a bisect that leaves a user's
// features switched off is worse than never offering one.

const popupSource = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8');

// The module attaches itself to globalThis.YTKitCore under one set of names
// and exports another for CommonJS. The popup reads the YTKitCore names, so
// the shim has to present those or the helpers silently do nothing.
const BISECT_CORE_SHIM = {
    createFeatureBisect: bisect.startFeatureBisect,
    answerFeatureBisect: bisect.answerFeatureBisect,
    disabledForBisectStep: bisect.disabledForStep,
    isBisectFinished: bisect.isBisectFinished,
    isBisectExpired: bisect.isBisectExpired,
    formatBisectResult: bisect.formatBisectResult,
    bisectTotalSteps: bisect.totalSteps,
    BISECT_PHASES: bisect.BISECT_PHASES
};

function loadPopupBisectHelpers(popupState, options = {}) {
    // From the storage key, not from the first function: BISECT_SESSION_KEY is
    // declared above them and a slice that omits it throws inside a
    // best-effort catch, so every write silently does nothing.
    const start = popupSource.indexOf('const BISECT_SESSION_KEY =');
    const end = popupSource.indexOf('function renderBisect(');
    assert.ok(start > -1 && end > start, 'popup.js must declare the bisect helpers');
    const block = popupSource.slice(start, end);
    const writes = [];
    const module = new Function(
        'window', 'popupState', 'storageGet', 'storageSet', 'storageRemove',
        'replaceSettings', 'showStatus', 't', 'callExtensionApi',
        'ext', 'manifestVersion', 'describeBrowserForReport', 'copyTextToClipboard',
        'renderBisect', 'isPlainObject', 'writes',
        `${block}
        return {
            enabledFeatureIdsForBisect, applyBisectSettings, restoreBisectSnapshot,
            describeBisectPageType, startFeatureBisectRun, answerFeatureBisectRun,
            abortFeatureBisectRun, resumeOrExpireFeatureBisect, sanitizeBisectSettings,
            __persistStale: writeBisectSession
        };`
    );
    let stored = null;
    const api = module(
        {
            __YTKIT_SETTINGS_SCHEMA__: require('../extension/core/settings-schema.js'),
            YTKitCore: BISECT_CORE_SHIM
        },
        popupState,
        async () => (stored ? { 'ytkit-feature-bisect': stored } : {}),
        options.storageSet || (async (entries) => { stored = entries['ytkit-feature-bisect']; }),
        async () => { stored = null; },
        options.replaceSettings || (async (settings) => {
            writes.push(settings);
            popupState.settings = settings;
        }),
        () => {}, (_k, fallback) => fallback,
        async () => [{ url: 'https://www.youtube.com/watch?v=abc' }],
        { tabs: {} }, '4.84.0', () => 'Chrome 129', async () => true, () => {},
        (value) => !!value && typeof value === 'object' && !Array.isArray(value),
        writes
    );
    return { api, writes, session: () => stored };
}

test('only boolean features that are on become bisect candidates', () => {
    const schema = require('../extension/core/settings-schema.js');
    const settings = {
        ...schema.buildDefaultsFromSchema(),
        diagnosticLog: true,
        redditComments: true,
        subStyleColor: '#ff0000'   // a value, not a feature
    };
    const { api } = loadPopupBisectHelpers({ settings });
    const ids = api.enabledFeatureIdsForBisect(settings);
    assert.ok(ids.includes('diagnosticLog'));
    assert.ok(ids.includes('redditComments'));
    assert.equal(ids.includes('subStyleColor'), false,
        'a colour cannot be the feature that broke the page');
    for (const id of ids) {
        assert.equal(typeof settings[id], 'boolean');
        assert.equal(id.startsWith('_'), false, 'internal keys are not user choices');
    }
});

test('a step writes the snapshot view of the world, not the previous step\'s', async () => {
    const settings = { a: true, b: true, c: true, d: true, _unrelated: 'keep me' };
    const { api, writes } = loadPopupBisectHelpers({ settings });
    const session = {
        ...bisect.startFeatureBisect(['a', 'b', 'c', 'd'], NOW),
        settings: { ...settings }
    };

    await api.applyBisectSettings(session, ['c', 'd']);
    assert.deepEqual(writes[0], { a: true, b: true, c: false, d: false, _unrelated: 'keep me' });

    // The next step switches a DIFFERENT half off. Derived from the settings
    // the run started with, c and d come back on; derived from the previous
    // step's state they would stay off and the search would read a page it
    // never asked for.
    await api.applyBisectSettings(session, ['a', 'b']);
    assert.deepEqual(writes[1], { a: false, b: false, c: true, d: true, _unrelated: 'keep me' });
});

test('finishing, aborting, and abandoning all restore the snapshot exactly', async () => {
    // Real schema keys: startFeatureBisectRun reads the shipped schema to
    // decide what is a feature, so invented names would give it nothing to
    // search and the test would pass by doing nothing.
    const [A, B, C, D] = ['hideCreateButton', 'hideVoiceSearch', 'logoToSubscriptions', 'widenSearchBar'];
    // safeStoreProfile is the key that made this test worth writing: it is a
    // default-on non-internal boolean, so it landed in the candidate set, and
    // switching it off made the settings controller switch githubFullProfile
    // ON — a key no snapshot named and no restore put back.
    const original = {
        [A]: true, [B]: true, [C]: true, [D]: true,
        safeStoreProfile: true,
        githubFullProfile: false,
        customCssCode: '.ytkit { color: red }',
        _settingsVersion: 9
    };
    for (const ending of ['finish', 'abort', 'abandon']) {
        const popupState = { settings: { ...original } };
        const { api, writes, session } = loadPopupBisectHelpers(popupState);
        await api.startFeatureBisectRun();
        assert.ok(session(), 'a session must be persisted');

        if (ending === 'finish') {
            let guard = 0;
            while (session() && guard++ < 32) {
                // Answer as a user whose problem is caused by C.
                const off = new Set(bisect.disabledForStep(session()));
                await api.answerFeatureBisectRun(!off.has(C));
            }
        } else if (ending === 'abort') {
            await api.answerFeatureBisectRun(false);
            await api.abortFeatureBisectRun();
        } else {
            // Walked away. The deadline, not the user, gives the settings back.
            const stale = { ...session(), startedAt: Date.now() - bisect.BISECT_MAX_AGE_MS - 1 };
            await api.applyBisectSettings(stale, [A, B]);
            await api.__persistStale(stale);
            await api.resumeOrExpireFeatureBisect();
        }

        if (ending !== 'abandon') {
            assert.equal(session(), null, `${ending} must clear the session`);
        }
        assert.deepEqual(popupState.settings, original,
            `${ending} must give back exactly the settings the user had`);
        assert.ok(writes.length > 0);
    }
});

test('the page type is a shape, never the URL the user was on', () => {
    const { api } = loadPopupBisectHelpers({ settings: {} });
    assert.equal(api.describeBisectPageType('https://www.youtube.com/watch?v=SECRET'), 'watch');
    assert.equal(api.describeBisectPageType('https://www.youtube.com/shorts/abc'), 'shorts');
    assert.equal(api.describeBisectPageType('https://www.youtube.com/@SomeChannel'), 'channel');
    assert.equal(api.describeBisectPageType('https://www.youtube.com/feed/subscriptions'), 'subscriptions');
    assert.equal(api.describeBisectPageType('https://www.youtube.com/'), 'home');
    assert.equal(api.describeBisectPageType('https://example.com/'), 'not-youtube');
    assert.equal(api.describeBisectPageType('not a url'), 'unknown');
});

test('the popup offers the bisect and wires every control', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'extension', 'popup.html'), 'utf8');
    for (const id of ['bisect-panel', 'bisect-start', 'bisect-yes', 'bisect-no',
        'bisect-abort', 'bisect-copy', 'bisect-result', 'bisect-prompt']) {
        assert.match(html, new RegExp(`id="${id}"`), `popup.html must carry #${id}`);
    }
    for (const handler of ['startFeatureBisectRun', 'answerFeatureBisectRun',
        'abortFeatureBisectRun', 'copyFeatureBisectResult', 'resumeOrExpireFeatureBisect']) {
        assert.ok(popupSource.includes(`${handler}(`), `popup.js must call ${handler}`);
    }
});

// ── Regressions found by adversarial review of the shipping commit ──

test('a run never leaves the user on a different profile than it found them', () => {
    // safeStoreProfile is a default-on, non-internal boolean, so it was a
    // bisect candidate; switching it off made the settings controller switch
    // githubFullProfile on. That key was in no snapshot, so no restore put it
    // back and every run silently moved a default install to github-full.
    const schema = require('../extension/core/settings-schema.js');
    const settings = { ...schema.buildDefaultsFromSchema(), diagnosticLog: true };
    assert.equal(settings.safeStoreProfile, true, 'the fixture must reproduce the default install');

    const { api } = loadPopupBisectHelpers({ settings });
    const ids = api.enabledFeatureIdsForBisect(settings);
    assert.equal(ids.includes('safeStoreProfile'), false,
        'a mode that re-derives other settings is not a feature to bisect');
    assert.equal(ids.includes('githubFullProfile'), false);
});

test('a settings key the schema no longer ships cannot wedge the restore', async () => {
    // A session can outlive an update by up to its deadline. The settings
    // controller rejects a replacement containing a key it does not know, and
    // every path restores before clearing, so one retired key made the restore
    // throw on every attempt with the features still off.
    const { api } = loadPopupBisectHelpers({ settings: {} });
    const cleaned = api.sanitizeBisectSettings({
        diagnosticLog: true,
        retiredGhostFeature: true,
        _settingsVersion: 9
    });
    assert.equal('retiredGhostFeature' in cleaned, false, 'an unknown key must be dropped');
    assert.equal(cleaned.diagnosticLog, true, 'a known key must survive');
    assert.equal(cleaned._settingsVersion, 9, 'internal bookkeeping must survive');
});

test('a restore that throws still clears the session and says so', async () => {
    const popupState = { settings: { diagnosticLog: true } };
    let cleared = false;
    const { api, session } = loadPopupBisectHelpers(popupState, {
        replaceSettings: async () => { throw new Error('UNKNOWN_SETTING'); }
    });
    void cleared;
    await api.startFeatureBisectRun().catch(() => {});
    // Starting failed at the first write, which is itself correct; drive the
    // abort path directly against a stored session instead.
    await api.__persistStale({
        schemaVersion: 1, startedAt: Date.now(), snapshot: ['diagnosticLog'],
        candidates: ['diagnosticLog'], phase: 'baseline', step: 1, answers: [],
        settings: { diagnosticLog: true }
    });
    await api.abortFeatureBisectRun();
    assert.equal(session(), null,
        'a failed restore must not keep a session that would fail again forever');
});

test('a session that cannot be saved never switches a feature off', async () => {
    // Without a stored session, Yes, No, and Stop all read null and return, so
    // applying a step first left every feature off with no route back.
    const schema = require('../extension/core/settings-schema.js');
    const settings = { ...schema.buildDefaultsFromSchema(), diagnosticLog: true };
    const { api, writes } = loadPopupBisectHelpers({ settings }, {
        storageSet: async () => { throw new Error('QUOTA_BYTES exceeded'); }
    });
    await api.startFeatureBisectRun();
    assert.deepEqual(writes, [],
        'a run that cannot be recorded must not touch settings at all');
});

test('the expiry restore does not depend on the popup having loaded settings', async () => {
    // resumeOrExpireFeatureBisect runs at module scope, before the bootstrap
    // has loaded settings, so popupState.settings is still {}. Restoring by
    // merging onto that dropped every key the snapshot did not name.
    const stored = {
        schemaVersion: 1,
        startedAt: Date.now() - bisect.BISECT_MAX_AGE_MS - 1,
        snapshot: ['diagnosticLog'],
        candidates: ['diagnosticLog'],
        phase: 'baseline',
        step: 1,
        answers: [],
        settings: { diagnosticLog: true, customCssCode: '.x{}', _settingsVersion: 9 }
    };
    const popupState = { settings: {} };   // the popup has not loaded yet
    const { api, writes, session } = loadPopupBisectHelpers(popupState);
    await api.__persistStale(stored);
    await api.resumeOrExpireFeatureBisect();

    assert.equal(session(), null, 'an expired session must be cleared');
    assert.deepEqual(writes[writes.length - 1], stored.settings,
        'the restore must replay the whole stored bag, not merge onto an empty one');
});
