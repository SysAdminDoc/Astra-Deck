const test = require('node:test');
const assert = require('node:assert/strict');

const pkg = require('../package.json');
const smoke = require('../scripts/smoke-private-window.js');

const SEED = smoke.SEED_QUEUE.items[0].id;
const queueOf = (...ids) => JSON.stringify({ items: ids.map((id) => ({ id })) });
const bookmarksOf = (count) => JSON.stringify({ [smoke.VIDEO_ID]: Array.from({ length: count }, (_, i) => ({ t: i })) });
const sentinelCookies = (value) => ({ ok: true, cookies: ['LOGIN_INFO', 'SAPISID'].map((name) => ({ name, value })) });

function storageCase(overrides = {}) {
    const regular = { ytSuiteSettings: { persistentQueue: true }, 'ytkit-queue': queueOf(SEED) };
    return {
        regularBefore: regular,
        regularAfter: structuredClone(regular),
        privateCopy: { queue: queueOf(SEED, smoke.VIDEO_ID), bookmarks: bookmarksOf(1), watchFeedPressed: true },
        reopened: { queue: queueOf(SEED), bookmarks: bookmarksOf(0) },
        ...overrides
    };
}

function managerCase(overrides = {}) {
    const regular = { 'val:1': JSON.stringify({ 'ytkit-queue': queueOf(SEED), ytSuiteSettings: { persistentQueue: true } }) };
    return {
        manager: 'violentmonkey',
        regularBefore: regular,
        regularAfter: structuredClone(regular),
        privateCopy: { queue: 2, bookmarks: 1, pressed: true },
        reopened: { queue: 1, bookmarks: 0, pressed: false },
        ...overrides
    };
}

test('private-window smoke is exposed as an npm script', () => {
    assert.equal(pkg.scripts['smoke:private-window'], 'node scripts/smoke-private-window.js');
});

test('lane selection covers both browsers and both managers', () => {
    assert.deepEqual(smoke.selectLanes('all'), ['chrome', 'firefox', 'violentmonkey', 'tampermonkey']);
    assert.deepEqual(smoke.selectLanes('managers'), ['violentmonkey', 'tampermonkey']);
    assert.deepEqual(smoke.selectLanes('firefox'), ['firefox']);
    assert.deepEqual([...smoke.MANAGER_LANES].sort(), ['tampermonkey', 'violentmonkey']);
    assert.equal(smoke.parseArgs([]).browser, 'all');
    assert.equal(smoke.parseArgs(['--browser', 'managers']).browser, 'managers');
    assert.throws(() => smoke.parseArgs(['--browser', 'edge']), /--browser must be one of/);
    assert.throws(() => smoke.parseArgs(['--browser']), /needs a value/);
    assert.throws(() => smoke.parseArgs(['--timeout-ms', '10']), /at least 5000/);
});

test('changedPaths names the key inside a JSON-string GM value', () => {
    const before = { 'val:1': JSON.stringify({ a: 1, journal: { keys: [] } }), other: 'x' };
    const after = { 'val:1': JSON.stringify({ a: 1, journal: { keys: ['_ytkit_crash_guard'] } }), other: 'x' };
    assert.deepEqual(smoke.changedPaths(before, after), ['val:1.journal.keys']);
    assert.deepEqual(smoke.changedPaths(before, structuredClone(before)), []);
    assert.deepEqual(smoke.changedPaths('a', 'b'), ['(root)']);
    assert.deepEqual(smoke.changedPaths({ k: { b: 1, a: 2 } }, { k: { a: 2, b: 1 } }), [], 'key order is not a change');
});

test('storage fence passes a clean run and fails each kind of leak', () => {
    assert.deepEqual(smoke.assertStorageFence(storageCase()).changedKeys, []);
    const leaked = storageCase();
    leaked.regularAfter['ytkit-queue'] = queueOf(SEED, smoke.VIDEO_ID);
    assert.throws(() => smoke.assertStorageFence(leaked), /regular storage changed: ytkit-queue/);
    const added = storageCase();
    added.regularAfter._ytkit_crash_guard = [1];
    assert.throws(() => smoke.assertStorageFence(added), /regular storage changed: _ytkit_crash_guard/, 'a brand new regular key is a leak too');
    assert.throws(() => smoke.assertStorageFence(storageCase({ privateCopy: { queue: queueOf(smoke.VIDEO_ID), bookmarks: bookmarksOf(1), watchFeedPressed: true } })),
        /lost the regular Watch Feed entry/);
    assert.throws(() => smoke.assertStorageFence(storageCase({ privateCopy: { queue: queueOf(SEED, smoke.VIDEO_ID), bookmarks: bookmarksOf(1), watchFeedPressed: false } })),
        /button does not show the add/);
    assert.throws(() => smoke.assertStorageFence(storageCase({ reopened: { queue: queueOf(), bookmarks: bookmarksOf(0) } })),
        /does not read the regular Watch Feed/);
    assert.throws(() => smoke.assertStorageFence(storageCase({ privateCopy: { queue: queueOf(SEED), bookmarks: bookmarksOf(1), watchFeedPressed: true } })),
        /does not read its own Watch Feed add/);
    assert.throws(() => smoke.assertStorageFence(storageCase({ privateCopy: { queue: queueOf(SEED, smoke.VIDEO_ID), bookmarks: bookmarksOf(0), watchFeedPressed: true } })),
        /does not read its own bookmark/);
    assert.throws(() => smoke.assertStorageFence(storageCase({ reopened: { queue: queueOf(SEED, smoke.VIDEO_ID), bookmarks: bookmarksOf(0) } })),
        /still reads the closed window's Watch Feed add/);
    assert.throws(() => smoke.assertStorageFence(storageCase({ reopened: { queue: queueOf(SEED), bookmarks: bookmarksOf(1) } })),
        /still reads the closed window's bookmark/);
});

test('manager fence needs the seed in regular storage and exact private counts', () => {
    assert.deepEqual(smoke.assertManagerFence(managerCase()).changedKeys, []);
    assert.throws(() => smoke.assertManagerFence(managerCase({ regularBefore: {}, regularAfter: {} })),
        /never reached violentmonkey's storage/);
    const leaked = managerCase();
    leaked.regularAfter['val:1'] = JSON.stringify({ ...JSON.parse(leaked.regularBefore['val:1']), _ytkit_crash_guard: '[1]' });
    assert.throws(() => smoke.assertManagerFence(leaked), /regular GM values changed: val:1\._ytkit_crash_guard/);
    assert.throws(() => smoke.assertManagerFence(managerCase({ privateCopy: { queue: 1, bookmarks: 1, pressed: true } })), /holds 1/);
    assert.throws(() => smoke.assertManagerFence(managerCase({ privateCopy: { queue: 2, bookmarks: 1, pressed: false } })), /button does not show the add/);
    assert.throws(() => smoke.assertManagerFence(managerCase({ reopened: { queue: 0, bookmarks: 0, pressed: false } })), /holds 0, not just the regular entry/);
    assert.throws(() => smoke.assertManagerFence(managerCase({ privateCopy: { queue: 2, bookmarks: 0, pressed: true } })), /does not read its own bookmark/);
    assert.throws(() => smoke.assertManagerFence(managerCase({ reopened: { queue: 2, bookmarks: 0, pressed: true } })), /still shows the closed window's Watch Feed add/);
    assert.throws(() => smoke.assertManagerFence(managerCase({ reopened: { queue: 1, bookmarks: 1, pressed: false } })), /still reads the closed window's bookmark/);
});

test('cookie handoff must return each window its own sentinels', () => {
    const ok = { privateTab: sentinelCookies(smoke.SENTINELS.private), regularTab: sentinelCookies(smoke.SENTINELS.regular) };
    assert.deepEqual(smoke.assertCookieHandoff(ok).private, ['LOGIN_INFO=astra-private-sentinel', 'SAPISID=astra-private-sentinel']);
    assert.throws(() => smoke.assertCookieHandoff({ ...ok, privateTab: sentinelCookies(smoke.SENTINELS.regular) }), /private handoff returned/);
    assert.throws(() => smoke.assertCookieHandoff({ ...ok, regularTab: { ok: true, cookies: [] } }), /regular handoff returned \[\]/);
    assert.throws(() => smoke.assertCookieHandoff({ ...ok, privateTab: { ok: false } }), /private handoff failed/);
    assert.throws(() => smoke.assertCookieHandoff({ ...ok, regularTab: { ok: false } }), /regular handoff failed/);
    const union = { ok: true, cookies: [...sentinelCookies(smoke.SENTINELS.private).cookies, ...sentinelCookies(smoke.SENTINELS.regular).cookies] };
    assert.throws(() => smoke.assertCookieHandoff({ ...ok, privateTab: union }), /private handoff returned/, 'both stores merged is the leak');
});

test('private fetch must go out bare while the regular control carries its cookie', () => {
    const regular = `SAPISID=${smoke.SENTINELS.regular}`;
    assert.ok(smoke.assertAnonymousPrivateFetch({ private: '', regular }));
    assert.throws(() => smoke.assertAnonymousPrivateFetch({ private: `SAPISID=${smoke.SENTINELS.private}`, regular }), /private request sent cookies/);
    assert.throws(() => smoke.assertAnonymousPrivateFetch({ regular }), /never observed/);
    assert.throws(() => smoke.assertAnonymousPrivateFetch({ private: '', regular: '' }), /capture proves nothing/);
});
