'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createSettingsMutationController } = require('../extension/core/settings-controller');

const schema = new Map([
    ['safeStoreProfile', {
        key: 'safeStoreProfile', type: 'boolean', defaultValue: true, profile: 'both'
    }],
    ['githubFullProfile', {
        key: 'githubFullProfile', type: 'boolean', defaultValue: false, profile: 'both'
    }],
    ['ordinaryToggle', {
        key: 'ordinaryToggle', type: 'boolean', defaultValue: false, profile: 'both'
    }],
    ['githubToggle', {
        key: 'githubToggle', type: 'boolean', defaultValue: false, profile: 'github-full'
    }],
    ['boundedNumber', {
        key: 'boundedNumber', type: 'number', defaultValue: 5, min: 1, max: 10, profile: 'both'
    }]
]);

function createHarness(initial = {}, options = {}) {
    let settings = { safeStoreProfile: true, githubFullProfile: false, ...initial };
    const writes = [];
    const controller = createSettingsMutationController({
        local: true,
        source: 'test',
        findSettingEntry: (key) => schema.get(key) || null,
        readSettings: async () => settings,
        writeSettings: async (next) => {
            if (options.writeSettings) await options.writeSettings(next, writes.length);
            settings = next;
            writes.push(next);
        }
    });
    return { controller, get settings() { return settings; }, writes };
}

test('settings controller validates and clamps through one stable result contract', async () => {
    const harness = createHarness({ boundedNumber: 5 });
    const clamped = await harness.controller.mutate('boundedNumber', 99);
    const invalid = await harness.controller.mutate('boundedNumber', '99');

    assert.deepEqual({
        ok: clamped.ok,
        persisted: clamped.persisted,
        previous: clamped.previous,
        value: clamped.value
    }, { ok: true, persisted: true, previous: 5, value: 10 });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.persisted, false);
    assert.equal(invalid.error.code, 'INVALID_SETTING_VALUE');
    assert.equal(invalid.previous, 10);
    assert.equal(harness.writes.length, 1);
});

test('settings controller enforces profile gates and canonical profile flags', async () => {
    const harness = createHarness();
    const blocked = await harness.controller.mutate('githubToggle', true);
    const enabledProfile = await harness.controller.mutate('githubFullProfile', true);
    const allowed = await harness.controller.mutate('githubToggle', true);
    const restoredSafe = await harness.controller.mutate('safeStoreProfile', true);

    assert.equal(blocked.error.code, 'PROFILE_BLOCKED');
    assert.equal(enabledProfile.settings.githubFullProfile, true);
    assert.equal(enabledProfile.settings.safeStoreProfile, false);
    assert.equal(allowed.ok, true);
    assert.equal(restoredSafe.settings.safeStoreProfile, true);
    assert.equal(restoredSafe.settings.githubFullProfile, false);
});

test('settings controller serializes concurrent mutations without losing either write', async () => {
    let releaseFirst;
    const firstWriteStarted = new Promise((resolve) => {
        releaseFirst = resolve;
    });
    let allowFirstToFinish;
    const firstWriteMayFinish = new Promise((resolve) => {
        allowFirstToFinish = resolve;
    });
    const harness = createHarness({}, {
        writeSettings: async (_next, writeIndex) => {
            if (writeIndex === 0) {
                releaseFirst();
                await firstWriteMayFinish;
            }
        }
    });

    const first = harness.controller.mutate('ordinaryToggle', true);
    await firstWriteStarted;
    const second = harness.controller.mutate('boundedNumber', 8);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.writes.length, 0, 'the second write must wait for the first transaction');

    allowFirstToFinish();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(firstResult.ok, true);
    assert.equal(secondResult.ok, true);
    assert.equal(harness.settings.ordinaryToggle, true);
    assert.equal(harness.settings.boundedNumber, 8);
    assert.equal(harness.writes.length, 2);
});

test('patch mutations merge against the latest serialized state', async () => {
    const harness = createHarness({ ordinaryToggle: false, boundedNumber: 5 });

    const [first, second] = await Promise.all([
        harness.controller.mutate('ordinaryToggle', true),
        harness.controller.mutateMany({ boundedNumber: 8 })
    ]);

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(harness.settings.ordinaryToggle, true);
    assert.equal(harness.settings.boundedNumber, 8);
});

test('failed writes return the exact previous state needed for UI rollback', async () => {
    const harness = createHarness({ ordinaryToggle: false }, {
        writeSettings: async () => { throw new Error('quota exceeded'); }
    });
    const result = await harness.controller.mutate('ordinaryToggle', true);

    assert.equal(result.ok, false);
    assert.equal(result.persisted, false);
    assert.equal(result.error.code, 'STORAGE_WRITE_FAILED');
    assert.equal(result.previous, false);
    assert.equal(result.value, false);
    assert.equal(result.settings.ordinaryToggle, false);
    assert.equal(harness.settings.ordinaryToggle, false);
});

test('replacement rejects new unknown keys but preserves unchanged future-version data', async () => {
    const harness = createHarness({ futureSetting: { retained: true }, ordinaryToggle: false });
    const preserved = await harness.controller.replace({
        safeStoreProfile: true,
        githubFullProfile: false,
        futureSetting: { retained: true },
        ordinaryToggle: true,
        _settingsVersion: 9
    });
    const rejected = await harness.controller.replace({
        ...harness.settings,
        inventedSetting: true
    });

    assert.equal(preserved.ok, true);
    assert.deepEqual(preserved.settings.futureSetting, { retained: true });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error.code, 'UNKNOWN_SETTING');
});

test('client controller forwards the same contract through runtime messaging', async () => {
    const messages = [];
    const client = createSettingsMutationController({
        source: 'popup',
        runtime: {
            async sendMessage(message) {
                messages.push(message);
                return {
                    ok: true,
                    persisted: true,
                    key: message.key,
                    previous: false,
                    value: message.value,
                    settings: { ordinaryToggle: message.value }
                };
            }
        }
    });

    const result = await client.mutate('ordinaryToggle', true);
    assert.equal(result.ok, true);
    assert.deepEqual(messages, [{
        type: 'YTKIT_MUTATE_SETTING',
        key: 'ordinaryToggle',
        value: true,
        source: 'popup'
    }]);

    await client.mutateMany({ boundedNumber: 7 });
    assert.deepEqual(messages[1], {
        type: 'YTKIT_MUTATE_SETTINGS',
        changes: { boundedNumber: 7 },
        source: 'popup'
    });
});
