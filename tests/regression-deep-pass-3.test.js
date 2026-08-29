'use strict';

// Regression guards for the deep-pass-3 audit fixes.
//
// These were 19 single-line source patterns. Each one now runs its subject:
// the SponsorBlock loader is raced against a navigation, the subscription
// group timers are driven through re-schedule and teardown, the transcript
// formatter is called past an hour, the CPU tamer's destroy is called without
// an init, and the popup's profile gate and status banner are executed against
// a fake DOM.
//
// One pin remains and says why: the popup's pagehide teardown is wired inside
// the boot path, which cannot be reached without booting the whole popup.
// `npm run smoke:a11y` boots it for real; this file guards the wiring.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { createSponsorBlockFeature } = require('../extension/features/sponsorblock');
const { createSubscriptionGroupsFeature } = require('../extension/features/subscription-groups');
const {
    loadFeature,
    loadUserscriptFeature,
    loadDeclarationsFrom,
    fakeNode,
    fakeTreeDocument,
} = require('./helpers/monolith');
const { sources } = require('./helpers/source');

const repoRoot = path.join(__dirname, '..');

test('SponsorBlock drops segments fetched for a video the user already left', async () => {
    let currentVideoId = 'AAAAAAAAAAA';
    let releaseFetch;
    const painted = [];

    const feature = createSponsorBlockFeature({
        appState: { settings: { sponsorBlock: true } },
        getVideoId: () => currentVideoId,
        extensionFetchJson: () => new Promise((resolve) => { releaseFetch = resolve; }),
    });
    feature._renderBarSegments = () => painted.push(feature._videoId);
    feature._clearBarSegments = () => {};
    feature._disarmBarObserver = () => {};
    feature._fetchSegments = async (videoId) => {
        await new Promise((resolve) => { releaseFetch = resolve; });
        return [{ category: 'sponsor', segment: [10, 20], videoId }];
    };

    const pending = feature._loadForVideo();
    // Autoplay moves to the next video while the segment request is in flight.
    currentVideoId = 'BBBBBBBBBBB';
    releaseFetch();
    await pending;

    assert.deepEqual(feature._segments, [],
        'segments fetched for the previous video must not be adopted');
    assert.deepEqual(painted, [],
        'painting them would put video A bars on video B and auto-skip the wrong timestamps');
});

test('SponsorBlock keeps segments when the user stayed on the same video', async () => {
    let releaseFetch;
    const painted = [];
    const feature = createSponsorBlockFeature({
        appState: { settings: { sponsorBlock: true } },
        getVideoId: () => 'AAAAAAAAAAA',
    });
    feature._renderBarSegments = () => painted.push(feature._videoId);
    feature._clearBarSegments = () => {};
    feature._disarmBarObserver = () => {};
    feature._fetchSegments = async () => {
        await new Promise((resolve) => { releaseFetch = resolve; });
        return [{ category: 'sponsor', segment: [10, 20] }];
    };

    const pending = feature._loadForVideo();
    releaseFetch();
    await pending;

    assert.equal(feature._segments.length, 1, 'the guard must not reject the normal case');
    assert.deepEqual(painted, ['AAAAAAAAAAA']);
});

test('SponsorBlock drops segments when destroy() fired during the fetch', async () => {
    let releaseFetch;
    const feature = createSponsorBlockFeature({
        appState: { settings: { sponsorBlock: true } },
        getVideoId: () => 'AAAAAAAAAAA',
    });
    feature._renderBarSegments = () => {};
    feature._clearBarSegments = () => {};
    feature._disarmBarObserver = () => {};
    feature._fetchSegments = async () => {
        await new Promise((resolve) => { releaseFetch = resolve; });
        return [{ category: 'sponsor', segment: [10, 20] }];
    };

    const pending = feature._loadForVideo();
    feature._generation += 1;
    releaseFetch();
    await pending;

    assert.deepEqual(feature._segments, [], 'a torn-down feature must not adopt a late response');
});

test('subscription groups clear their deferred navigation timers before re-arming', () => {
    const documentRef = fakeTreeDocument(() => null);
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;

    globalThis.document = documentRef;
    globalThis.window = { location: { pathname: '/feed/subscriptions' }, addEventListener() {}, removeEventListener() {} };

    const navRules = new Map();
    const scheduled = new Map();
    const cleared = [];
    let nextId = 1;

    try {
        const feature = createSubscriptionGroupsFeature({
            addNavigateRule: (id, rule) => navRules.set(id, rule),
            removeNavigateRule: (id) => navRules.delete(id),
            addScopedMutationRule: () => {},
            removeScopedMutationRule: () => {},
            injectStyle: () => ({ remove() {} }),
            storageReadJSON: (_key, fallback) => fallback,
            storageWriteJSON: () => {},
            appState: { settings: {} },
        });
        feature.init();

        // Swap the clock only now: init()'s own timers are not what this
        // guards, and counting them would make the assertions below vague.
        globalThis.setTimeout = (fn, delay) => {
            const id = nextId++;
            scheduled.set(id, { fn, delay });
            return id;
        };
        globalThis.clearTimeout = (id) => { cleared.push(id); scheduled.delete(id); };

        const rule = navRules.get(feature.id);
        assert.ok(rule, 'the feature must register a navigate rule');

        rule();
        assert.deepEqual([...scheduled.values()].map((entry) => entry.delay), [1200, 8000],
            'a subscriptions pageview arms the render and lastVisit timers');
        const firstRound = [...scheduled.keys()];

        rule();
        assert.deepEqual(cleared.filter((id) => firstRound.includes(id)), firstRound,
            're-arming must clear the previous pair, or a stale 8s stamp fires on the wrong page');
        assert.deepEqual([...scheduled.values()].map((entry) => entry.delay), [1200, 8000]);
        const secondRound = [...scheduled.keys()];

        feature.destroy();
        assert.deepEqual(cleared.filter((id) => secondRound.includes(id)), secondRound,
            'teardown clears whatever is armed');
        assert.equal(feature._renderTimer, null, 'and drops the render handle');
        assert.equal(feature._stampTimer, null, 'and drops the lastVisit handle');
    } finally {
        globalThis.setTimeout = realSetTimeout;
        globalThis.clearTimeout = realClearTimeout;
    }
});

test('the deferred lastVisit stamp refuses to run once the page has moved on', () => {
    const documentRef = fakeTreeDocument(() => null);
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;

    globalThis.document = documentRef;
    globalThis.window = { location: { pathname: '/feed/subscriptions' }, addEventListener() {}, removeEventListener() {} };

    const navRules = new Map();
    const scheduled = [];
    try {
        const feature = createSubscriptionGroupsFeature({
            addNavigateRule: (id, rule) => navRules.set(id, rule),
            removeNavigateRule: () => {},
            addScopedMutationRule: () => {},
            removeScopedMutationRule: () => {},
            injectStyle: () => ({ remove() {} }),
            storageReadJSON: (_key, fallback) => fallback,
            storageWriteJSON: () => {},
            appState: { settings: {} },
        });
        feature.init();

        globalThis.setTimeout = (fn, delay) => { scheduled.push({ fn, delay }); return scheduled.length; };
        globalThis.clearTimeout = () => {};

        navRules.get(feature.id)();
        const stamped = [];
        feature._stampLastVisit = () => stamped.push(globalThis.window.location.pathname);

        // The user left before the 8s deadline; the timer still fires.
        globalThis.window.location.pathname = '/';
        scheduled.find((entry) => entry.delay === 8000).fn();
        assert.deepEqual(stamped, [],
            'stamping here would record lastVisit for whatever cards Home was showing');

        // Back on the feed, the same callback does its job.
        globalThis.window.location.pathname = '/feed/subscriptions';
        navRules.get(feature.id)();
        scheduled.filter((entry) => entry.delay === 8000).pop().fn();
        assert.deepEqual(stamped, ['/feed/subscriptions'], 'the guard must not break the normal case');
    } finally {
        globalThis.setTimeout = realSetTimeout;
        globalThis.clearTimeout = realClearTimeout;
    }
});

test('the transcript timestamp grows an hours field past one hour', () => {
    const viewer = loadFeature('transcriptViewer');
    assert.equal(viewer._fmtTimestamp(0), '0:00');
    assert.equal(viewer._fmtTimestamp(59), '0:59');
    assert.equal(viewer._fmtTimestamp(62), '1:02');
    assert.equal(viewer._fmtTimestamp(599), '9:59');
    // The bug: a 1h02m40s cue rendered as 62:40.
    assert.equal(viewer._fmtTimestamp(3760), '1:02:40');
    assert.equal(viewer._fmtTimestamp(7325), '2:02:05');
    assert.equal(viewer._fmtTimestamp(-5), '0:00', 'a negative offset must not render a negative clock');
});

test('the userscript CPU tamer only restores timers it actually replaced', () => {
    const build = ({ webgl = true } = {}) => {
        const host = {
            setTimeout: function original() {},
            clearTimeout: function original() {},
            setInterval: function original() {},
            clearInterval: function original() {},
        };
        const documentRef = fakeTreeDocument(() => null);
        const createElement = documentRef.createElement.bind(documentRef);
        documentRef.createElement = (tag) => {
            const node = createElement(tag);
            // The tamer refuses to patch anything on a machine with no WebGL,
            // so the canvas probe decides which lane this fixture exercises.
            if (String(tag).toLowerCase() === 'canvas') node.getContext = () => (webgl ? {} : null);
            return node;
        };
        const feature = loadUserscriptFeature('enableCPU_Tamer', {
            window: host,
            document: documentRef,
            appState: { settings: {} },
            Promise,
        });
        return { feature, host };
    };

    // destroy() without init(): the timers the page relies on must be left
    // exactly as they were. Restoring here overwrote live page timers.
    const untouched = build();
    const before = { ...untouched.host };
    assert.equal(untouched.feature._patched, false, 'a fresh feature has patched nothing');
    untouched.feature.destroy();
    for (const key of Object.keys(before)) {
        assert.equal(untouched.host[key], before[key],
            `destroy() without init() must leave window.${key} alone`);
    }

    // init() then destroy(): the originals come back.
    const patched = build();
    const originals = { ...patched.host };
    patched.feature.init();
    assert.equal(patched.feature._patched, true, 'init() records that it patched');
    patched.feature.destroy();
    for (const key of Object.keys(originals)) {
        assert.equal(patched.host[key], originals[key], `destroy() must restore window.${key}`);
    }
    assert.equal(patched.feature._patched, false, 'and must clear the flag');

    // No WebGL: the tamer bails before snapshotting, so destroy() must still
    // leave the page's timers alone.
    const bailed = build({ webgl: false });
    const untouchedByBail = { ...bailed.host };
    bailed.feature.init();
    assert.equal(bailed.feature._patched, false, 'a bail-out patches nothing');
    bailed.feature.destroy();
    for (const key of Object.keys(untouchedByBail)) {
        assert.equal(bailed.host[key], untouchedByBail[key],
            `a bailed-out tamer must not restore over window.${key}`);
    }
});

test('the popup gates the companion update buttons on the effective profile', () => {
    const build = (profile) => {
        const updateCompanionButton = fakeNode({ tag: 'button' });
        const updateYtdlpButton = fakeNode({ tag: 'button' });
        const api = loadDeclarationsFrom(sources.popup, ['refreshCompanionUpdateVisibility'], {
            updateCompanionButton,
            updateYtdlpButton,
            popupState: { settings: {} },
            ensurePolicyProfile: () => ({ resolveEffectiveProfile: () => profile }),
        });
        api.refreshCompanionUpdateVisibility();
        return { updateCompanionButton, updateYtdlpButton };
    };

    const storeSafe = build('store-safe');
    assert.equal(storeSafe.updateCompanionButton.hidden, true, 'Update Companion is hidden for store-safe users');
    assert.equal(storeSafe.updateYtdlpButton.hidden, true, 'Update yt-dlp is hidden for store-safe users');

    const githubFull = build('github-full');
    assert.equal(githubFull.updateCompanionButton.hidden, false, 'the github-full profile sees the buttons');
    assert.equal(githubFull.updateYtdlpButton.hidden, false);

    // The decision has exactly one owner: the raw-flag copy that ran last in
    // refreshOptionalHostGrantState and could overwrite the policy result must
    // stay deleted.
    assert.doesNotMatch(sources.popup, /const githubFull = !!\(settings && settings\.githubFullProfile\)/,
        'the second, raw-flag copy of this decision must stay deleted');
});

test('the popup status banner is assertive for errors and polite for everything else', () => {
    const build = () => {
        const statusBanner = fakeNode({ tag: 'div' });
        const api = loadDeclarationsFrom(sources.popup, ['showStatus'], {
            statusBanner,
            popupState: { statusTimer: null },
            setTimeout: () => 1,
            clearTimeout: () => {},
        });
        return { statusBanner, showStatus: api.showStatus };
    };

    const errors = build();
    errors.showStatus('Import failed', 'error');
    assert.equal(errors.statusBanner.getAttribute('role'), 'alert');
    assert.equal(errors.statusBanner.getAttribute('aria-live'), 'assertive');
    assert.equal(errors.statusBanner.textContent, 'Import failed');

    // A routine message after an error must not inherit assertive.
    errors.showStatus('Settings saved', 'success');
    assert.equal(errors.statusBanner.getAttribute('role'), null);
    assert.equal(errors.statusBanner.getAttribute('aria-live'), 'polite');

    // `ok` is normalised to `success`, so it stays polite too.
    const routine = build();
    routine.showStatus('Copied', 'ok');
    assert.equal(routine.statusBanner.getAttribute('role'), null);
    assert.equal(routine.statusBanner.getAttribute('aria-live'), 'polite');
    assert.match(String(routine.statusBanner.className), /success/);
});

test('the popup removes its storage listener on pagehide', () => {
    // The wiring lives inside the popup's boot path, which cannot be reached
    // without booting the whole popup; `npm run smoke:a11y` does that in a real
    // browser. This pin guards the two halves from drifting apart.
    const popup = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8');
    const pagehideAt = popup.indexOf("window.addEventListener('pagehide'");
    assert.ok(pagehideAt > 0, 'a pagehide teardown must exist');
    const teardown = popup.slice(pagehideAt, pagehideAt + 400);
    assert.match(teardown, /removeListener\(onStorageChanged\)/,
        'the onChanged listener must be removed on teardown');
    assert.match(teardown, /clearTimeout\(popupState\.statusTimer\)/,
        'and the status timer cancelled with it');
});
