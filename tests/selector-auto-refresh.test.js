'use strict';

// The opt-in scheduled selector refresh.
//
// The hot-update path was already verified end to end, but the only thing that
// could trigger it was a button in the popup — so it helped exactly the users
// who had already worked out that their install was broken. This adds a
// staleness check on page boot.
//
// The properties that matter are all about restraint, because this is the one
// path that makes a network request nobody asked for in that moment: it must
// make no request while the setting is off, no more than one request a day
// while it is on, and it must record a failed attempt so a broken network does
// not retry on every single page load.

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadDeclarations } = require('./helpers/monolith');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_760_000_000_000;

function loadScheduler(overrides = {}) {
    return loadDeclarations(
        ['selectorAutoRefreshDue', 'readSelectorAssetSchedule', 'maybeAutoRefreshSelectorAsset'],
        {
            SELECTOR_ASSET_SCHEDULE_KEY: 'ytkit-selector-asset-schedule',
            SELECTOR_AUTO_REFRESH_INTERVAL_MS: DAY_MS,
            storageReadJSON: () => null,
            storageWriteJSON: async () => {},
            refreshSelectorAsset: async () => ({ ok: true }),
            appState: { settings: {} },
            ...overrides
        }
    );
}

test('nothing is due while the setting is off, however stale the schedule is', () => {
    const api = loadScheduler();

    for (const schedule of [
        { lastCheckedAt: null },
        { lastCheckedAt: NOW - (400 * DAY_MS) },
        { lastCheckedAt: NOW }
    ]) {
        assert.equal(api.selectorAutoRefreshDue({ selectorAutoRefresh: false }, schedule, NOW), false);
        assert.equal(api.selectorAutoRefreshDue({}, schedule, NOW), false,
            'a settings object that has never seen the key must read as off');
    }
});

test('the first run with the setting on is due, and the next is a day later', () => {
    const api = loadScheduler();
    const on = { selectorAutoRefresh: true };

    assert.equal(api.selectorAutoRefreshDue(on, { lastCheckedAt: null }, NOW), true,
        'never checked means due');
    assert.equal(api.selectorAutoRefreshDue(on, { lastCheckedAt: NOW }, NOW), false,
        'just checked means not due');
    assert.equal(api.selectorAutoRefreshDue(on, { lastCheckedAt: NOW - (DAY_MS - 1000) }, NOW), false,
        'a second short of the interval is not due');
    assert.equal(api.selectorAutoRefreshDue(on, { lastCheckedAt: NOW - DAY_MS }, NOW), true,
        'exactly the interval is due');
});

test('a timestamp in the future does not park the schedule forever', () => {
    const api = loadScheduler();
    // A clock correction, a restored profile or a timezone change can leave a
    // stored timestamp ahead of now. Treating that as "checked recently" would
    // disable the refresh until real time caught up.
    assert.equal(
        api.selectorAutoRefreshDue({ selectorAutoRefresh: true }, { lastCheckedAt: NOW + (30 * DAY_MS) }, NOW),
        true
    );
});

test('a stored schedule with junk in it reads as never checked', () => {
    for (const stored of [null, undefined, 'yesterday', { lastCheckedAt: 'soon' }, { lastCheckedAt: -1 }, { lastCheckedAt: 0 }]) {
        const api = loadScheduler({ storageReadJSON: () => stored });
        const schedule = api.readSelectorAssetSchedule();
        assert.equal(schedule.lastCheckedAt, null, `stored ${JSON.stringify(stored)}`);
        assert.equal(schedule.lastSuccessAt, null);
    }
});

test('no request is made while the setting is off', async () => {
    let requests = 0;
    const api = loadScheduler({
        appState: { settings: { selectorAutoRefresh: false } },
        refreshSelectorAsset: async () => { requests += 1; return { ok: true }; }
    });

    const result = await api.maybeAutoRefreshSelectorAsset(NOW);

    assert.equal(result, null);
    assert.equal(requests, 0, 'the off state must cost no network at all');
});

test('a due refresh runs once and records both timestamps', async () => {
    let requests = 0;
    const writes = [];
    const api = loadScheduler({
        appState: { settings: { selectorAutoRefresh: true } },
        storageReadJSON: () => null,
        storageWriteJSON: async (key, value) => { writes.push({ key, value }); },
        refreshSelectorAsset: async () => { requests += 1; return { ok: true }; }
    });

    const result = await api.maybeAutoRefreshSelectorAsset(NOW);

    assert.equal(requests, 1);
    assert.equal(result.ok, true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].key, 'ytkit-selector-asset-schedule');
    assert.equal(writes[0].value.lastCheckedAt, NOW);
    assert.equal(writes[0].value.lastSuccessAt, NOW);
    assert.equal(writes[0].value.lastError, null);
});

test('a failed refresh still records the attempt, so it does not retry every page load', async () => {
    const writes = [];
    const api = loadScheduler({
        appState: { settings: { selectorAutoRefresh: true } },
        storageReadJSON: () => ({ lastCheckedAt: NOW - (2 * DAY_MS), lastSuccessAt: NOW - (9 * DAY_MS) }),
        storageWriteJSON: async (key, value) => { writes.push({ key, value }); },
        refreshSelectorAsset: async () => ({ ok: false, error: 'Selector asset signature could not be verified.' })
    });

    await api.maybeAutoRefreshSelectorAsset(NOW);

    assert.equal(writes.length, 1, 'the attempt is recorded even though it failed');
    assert.equal(writes[0].value.lastCheckedAt, NOW);
    assert.equal(writes[0].value.lastSuccessAt, NOW - (9 * DAY_MS),
        'a failure must not advance the last-success time');
    assert.match(writes[0].value.lastError, /signature/);
});

test('a refresh that throws is contained and still recorded', async () => {
    const writes = [];
    const api = loadScheduler({
        appState: { settings: { selectorAutoRefresh: true } },
        storageWriteJSON: async (key, value) => { writes.push({ key, value }); },
        refreshSelectorAsset: async () => { throw new Error('network is unreachable'); }
    });

    // Page boot must survive this: the shipped packs and any stored asset are
    // already active, so a thrown refresh is not a reason to break the page.
    await assert.doesNotReject(() => api.maybeAutoRefreshSelectorAsset(NOW));
    assert.equal(writes.length, 1);
    assert.match(writes[0].value.lastError, /network is unreachable/);
    assert.equal(writes[0].value.lastSuccessAt, null);
});

test('a storage write that fails does not break the refresh', async () => {
    const api = loadScheduler({
        appState: { settings: { selectorAutoRefresh: true } },
        storageWriteJSON: async () => { throw new Error('quota exceeded'); },
        refreshSelectorAsset: async () => ({ ok: true })
    });

    const result = await api.maybeAutoRefreshSelectorAsset(NOW);
    assert.equal(result.ok, true, 'the asset already applied; losing the timestamp costs one extra attempt');
});
