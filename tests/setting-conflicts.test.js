'use strict';

// One conflict map for every surface. It lived only in ytkit.js, so the popup
// and the side panel (one key at a time through the worker) never switched the
// other side of a pair off: turning Audio-Only on from the popup left Always
// Best Quality running with it, and the next page load quietly turned the
// popup's choice back off.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const schema = require('../extension/core/settings-schema');
const { createSettingsMutationController } = require('../extension/core/settings-controller');
const { loadDeclarationsFrom } = require('./helpers/monolith');
const { sources } = require('./helpers/source');

test('the resolver reads sparse settings through their defaults', () => {
    // Always Best Quality is on by default and usually absent from the bag.
    const input = { audioOnlyPlayback: true };
    const resolved = schema.resolveSettingConflicts(input, 'audioOnlyPlayback');
    assert.deepEqual(resolved.switchedOff, ['autoMaxResolution']);
    assert.equal(resolved.settings.autoMaxResolution, false);
    assert.deepEqual(input, { audioOnlyPlayback: true }, 'the input bag is left alone');

    assert.deepEqual(schema.resolveSettingConflicts({ audioOnlyPlayback: false }, 'audioOnlyPlayback').switchedOff, [],
        'switching a feature off resolves nothing');
    assert.deepEqual(schema.resolveSettingConflicts({ audioOnlyPlayback: true, autoMaxResolution: false }, 'audioOnlyPlayback').switchedOff, [],
        'a partner that is already off is not reported');
});

test('the codec selector conflicts only while it names a codec, and its off is "auto"', () => {
    assert.equal(schema.settingConflictOffValue('codecSelector'), 'auto');
    assert.equal(schema.settingConflictOffValue('forceH264'), false);
    assert.deepEqual(schema.resolveSettingConflicts({ forceH264: true, codecSelector: 'auto' }, 'forceH264').switchedOff, []);
    assert.deepEqual(schema.resolveSettingConflicts({ forceH264: true }, 'forceH264').switchedOff, [],
        'an absent selector is its default, auto');
    const toH264 = schema.resolveSettingConflicts({ forceH264: true, codecSelector: 'av1' }, 'forceH264');
    assert.deepEqual([toH264.switchedOff, toH264.settings.codecSelector], [['codecSelector'], 'auto']);
    const toAv1 = schema.resolveSettingConflicts({ forceH264: true, codecSelector: 'av1' }, 'codecSelector');
    assert.deepEqual([toAv1.switchedOff, toAv1.settings.forceH264], [['forceH264'], false]);
});

function workerHarness(initial) {
    let stored = { ...initial };
    const controller = createSettingsMutationController({
        local: true,
        source: 'test',
        readSettings: async () => stored,
        writeSettings: async (next) => { stored = next; }
    });
    return { controller, get stored() { return stored; } };
}

test('the worker\'s single-key write switches the other side of a pair off', async () => {
    const popup = workerHarness({});
    const result = await popup.controller.mutate('audioOnlyPlayback', true);
    assert.equal(result.ok, true);
    assert.deepEqual(result.switchedOff, ['autoMaxResolution']);
    assert.deepEqual({ audio: popup.stored.audioOnlyPlayback, best: popup.stored.autoMaxResolution }, { audio: true, best: false });
    assert.equal(result.settings.autoMaxResolution, false, 'the caller sees the switched-off partner too');

    const codec = workerHarness({ codecSelector: 'av1' });
    const h264 = await codec.controller.mutate('forceH264', true);
    assert.equal(h264.ok, true, 'the partner\'s off value passes validation');
    assert.deepEqual([h264.switchedOff, codec.stored.codecSelector], [['codecSelector'], 'auto']);

    const plain = workerHarness({});
    const off = await plain.controller.mutate('audioOnlyPlayback', false);
    assert.deepEqual(off.switchedOff, []);
    assert.equal(Object.prototype.hasOwnProperty.call(plain.stored, 'autoMaxResolution'), false);
});

test('the popup names what a conflict switched off', async () => {
    const statuses = [];
    const popupState = { settings: {} };
    const api = loadDeclarationsFrom(sources.popup, ['conflictNoticeText', 'writeSetting'], {
        __YTKIT_SETTINGS_SCHEMA__: schema,
        popupState,
        t: (_key, fallback) => fallback,
        showStatus: (message, type) => statuses.push({ message, type }),
        requestOptionalHostsForSetting: async () => {},
        getSettingsMutationController: () => workerHarness({}).controller,
        reconcileFilterListGrantTransition: async () => ({ ok: true }),
        reconcileCobaltGrantTransition: async () => ({ ok: true }),
        refreshOptionalHostGrantState: async () => {}
    });
    const result = await api.writeSetting('audioOnlyPlayback', true);
    assert.deepEqual(result.switchedOff, ['autoMaxResolution']);
    assert.equal(statuses.length, 1);
    assert.match(statuses[0].message, /^Auto-disabled Auto max resolution\. Audio-only pins the lowest quality/);

    statuses.length = 0;
    await api.writeSetting('volumeBoost', true);
    assert.deepEqual(statuses, [], 'no notice when nothing was switched off');
});

test('the popup\'s quick toggle and reset leave the conflict notice on screen', () => {
    // Both callers used to show their own success line right after
    // writeSetting, which replaced the notice before anyone could read it.
    assert.match(sources.popup, /const written = await writeSetting\(key, next\);[\s\S]{0,400}if \(!written\.switchedOff\?\.length\) showStatus\(t\('toggleStatusTpl'/);
    assert.match(sources.popup, /const written = await writeSetting\(entry\.key, entry\.defaultValue\);[\s\S]{0,400}if \(!written\.switchedOff\?\.length\) showStatus\(t\('statusPerKeyResetTpl'/);
});

test('the side panel hands the switched-off keys to its row and names them', async () => {
    const sidepanel = fs.readFileSync(path.join(__dirname, '..', 'extension', 'sidepanel.js'), 'utf8');
    const api = loadDeclarationsFrom(sidepanel, ['formatHumanName', 'conflictNoticeText', 'writeSetting'], {
        __YTKIT_SETTINGS_SCHEMA__: schema,
        _settingsMutationController: workerHarness({}).controller,
        t: (_key, fallback) => fallback
    });
    const saved = await api.writeSetting('audioOnlyPlayback', true);
    assert.deepEqual(saved.switchedOff, ['autoMaxResolution']);
    assert.match(api.conflictNoticeText('audioOnlyPlayback', saved.switchedOff), /^Auto-disabled Auto Max Resolution\. Audio-only pins/);
    assert.match(sidepanel, /const switchedOff = saved\.switchedOff \|\| \[\];\s*if \(switchedOff\.length\) \{\s*setRefreshStatus\(conflictNoticeText\(entry\.key, switchedOff\), 'warn'\);/);
});
