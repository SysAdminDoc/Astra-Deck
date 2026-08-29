'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const audio = require('../extension/core/audio-track');
const { installBridgeChannel } = require('./helpers/main-bridge');

function makeDocument(attributes = {}) {
    const values = new Map(Object.entries(attributes));
    return {
        documentElement: {
            getAttribute(name) {
                return values.has(name) ? values.get(name) : null;
            },
            setAttribute(name, value) {
                values.set(name, String(value));
            },
            removeAttribute(name) {
                values.delete(name);
            }
        }
    };
}

/**
 * Seed the preferences the way the isolated world does.
 *
 * This module runs in the MAIN world, where it shares a DOM with YouTube's own
 * scripts, so it stopped reading these three off `<html>`: one `setAttribute`
 * from any page script could pick the audio track the player switched to. It
 * reads the sealed channel now, and so does this fixture — writing the plain
 * attribute is what a page script does, and it must not work.
 */
function sealPreferences(document, attributes) {
    const channel = installBridgeChannel(document.documentElement, {});
    for (const [name, value] of Object.entries(attributes)) channel.publish(name, value);

    const reader = channel.core.createBridgeReader({
        documentElement: document.documentElement,
        token: channel.token
    });
    reader.sync();

    const previous = globalThis.YTKitCore.mainBridgeReader;
    globalThis.YTKitCore.mainBridgeReader = reader;
    return {
        channel,
        reader,
        restore() { globalThis.YTKitCore.mainBridgeReader = previous; },
        /** What a page script can do, and what must not reach the module. */
        forge(name, value) { channel.forge(name, value); }
    };
}

function makeBridgeFixture(attributes, tracks, current = null) {
    const document = makeDocument();
    const sealed = sealPreferences(document, attributes);
    const calls = [];
    let scheduled = null;
    const player = {
        getAvailableAudioTracks: () => tracks,
        getAudioTrack: () => current,
        setAudioTrack(track) {
            calls.push(track);
            current = track;
        }
    };
    const taskManager = {
        schedule(id, callback, options) {
            scheduled = { id, callback, options };
        },
        cancel() {}
    };
    const bridge = audio.createAudioTrackBridge({ document, taskManager, getPlayer: () => player });
    return {
        bridge,
        calls,
        player,
        document,
        sealed,
        get scheduled() { return scheduled; }
    };
}

test('language selection prefers an exact BCP-47 match before a primary-subtag match', () => {
    const primary = { id: 'fr-primary', languageCode: 'fr', displayName: 'Français' };
    const exact = { id: 'fr-ca', languageCode: 'fr-CA', displayName: 'Français (Canada)' };
    assert.equal(audio.selectLanguageTrack([primary, exact], 'fr_CA'), exact);
    assert.equal(audio.selectLanguageTrack([primary], 'fr-CA'), primary);
});

test('audio sync offset is shared and clamped to the bounded bridge range', () => {
    assert.equal(audio.ATTRS.syncOffset, 'data-ytkit-audio-sync-offset');
    assert.equal(audio.ATTRS.autoGain, 'data-ytkit-audio-auto-gain');
    assert.equal(audio.ATTRS.highPass, 'data-ytkit-audio-high-pass');
    assert.equal(audio.ATTRS.equalizer, 'data-ytkit-audio-eq');
    assert.equal(audio.ATTRS.eqLow, 'data-ytkit-audio-eq-low');
    assert.equal(audio.ATTRS.eqMid, 'data-ytkit-audio-eq-mid');
    assert.equal(audio.ATTRS.eqHigh, 'data-ytkit-audio-eq-high');
    assert.equal(audio.normalizeAudioSyncOffset(-999), -500);
    assert.equal(audio.normalizeAudioSyncOffset(245.6), 246);
    assert.equal(audio.normalizeAudioSyncOffset(999), 500);
    assert.equal(audio.normalizeAudioSyncOffset('not-a-number'), 0);
    assert.equal(audio.normalizeAudioEqGain(-99), -12);
    assert.equal(audio.normalizeAudioEqGain(4.6), 5);
    assert.equal(audio.normalizeAudioEqGain(99), 12);
    assert.equal(audio.normalizeAudioEqGain('not-a-number'), 0);
});

test('descriptive preference selects same-language described audio with a standard fallback', () => {
    const standard = { id: 'en-standard', languageCode: 'en-US', displayName: 'English' };
    const described = {
        id: 'en-described',
        languageCode: 'en-US',
        displayName: 'English audio description',
        characteristics: ['public.accessibility.describes-video']
    };
    assert.equal(audio.selectLanguageTrack([standard, described], 'en-US', true), described);
    assert.equal(audio.selectLanguageTrack([standard], 'en-US', true), standard);
});

test('MAIN audio bridge applies the preference on its route-aware player task', () => {
    const spanish = { id: 'es', languageCode: 'es', displayName: 'Español' };
    const fixture = makeBridgeFixture(
        { [audio.ATTRS.language]: 'es-MX' },
        [{ id: 'en', languageCode: 'en', displayName: 'English' }, spanish]
    );

    assert.equal(fixture.bridge.sync('init'), true);
    assert.equal(fixture.scheduled.id, audio.TASK_ID);
    assert.ok(fixture.scheduled.options.events.includes('navigate'));
    assert.equal(
        fixture.scheduled.callback({ reason: 'navigate', player: fixture.player }),
        true
    );
    assert.deepEqual(fixture.calls, [spanish]);
});

test('MAIN audio bridge prefers descriptive audio, leaves no-match playback unchanged, and shares original mode', () => {
    const original = {
        id: 'track.4',
        languageCode: 'ja',
        displayName: { simpleText: '日本語 (Original)' }
    };
    const described = {
        id: 'en-described',
        languageCode: 'en-GB',
        displayName: { simpleText: 'English audio description' },
        isAudioDescription: true
    };
    const dubbed = { id: 'en-dubbed', languageCode: 'en-US', displayName: 'English' };
    const fixture = makeBridgeFixture(
        {
            [audio.ATTRS.language]: 'en-GB',
            [audio.ATTRS.descriptive]: 'on'
        },
        [dubbed, described, original],
        dubbed
    );

    fixture.bridge.sync('attribute');
    fixture.scheduled.callback({ reason: 'navigate', player: fixture.player });
    assert.deepEqual(fixture.calls, [described]);

    fixture.bridge = audio.createAudioTrackBridge({
        document: makeDocument({ [audio.ATTRS.language]: 'de-DE' }),
        taskManager: { schedule(_id, callback) { callback({ player: fixture.player }); }, cancel() {} },
        getPlayer: () => fixture.player
    });
    fixture.bridge.sync('attribute');
    assert.deepEqual(fixture.calls, [described], 'a missing language must not change playback');

    const originalFixture = makeBridgeFixture(
        {
            [audio.ATTRS.language]: 'en',
            [audio.ATTRS.original]: 'on'
        },
        [dubbed, original],
        dubbed
    );
    originalFixture.bridge.sync('attribute');
    originalFixture.scheduled.callback({ reason: 'navigate', player: originalFixture.player });
    assert.deepEqual(originalFixture.calls, [original]);
});

test('a page script cannot choose the audio track by writing the attribute', () => {
    // This module runs in the MAIN world, so `document.documentElement` is the
    // same object YouTube's scripts hold. Until the sealed channel it read
    // these three preferences straight off it, and one setAttribute from
    // anything on the page switched the user's audio track.
    const german = { id: 't-de', languageCode: 'de', displayName: 'Deutsch' };
    const english = { id: 't-en', languageCode: 'en', displayName: 'English' };

    // A real preference is sealed, so the task is scheduled and running. The
    // user has chosen English and is already on it.
    const fixture = makeBridgeFixture(
        { [audio.ATTRS.language]: 'en' }, [english, german], english);

    try {
        assert.equal(fixture.bridge.sync('init'), true, 'the sealed preference is live');
        fixture.sealed.forge(audio.ATTRS.language, 'de');
        fixture.scheduled.callback({ reason: 'navigate', player: fixture.player });

        assert.deepEqual(fixture.calls, [],
            'an attribute the page can write must not reach setAudioTrack');
        assert.equal(fixture.player.getAudioTrack(), english, 'the track is unchanged');

        // The control: the same value, sealed, does switch it. Without this
        // the test above would pass against a bridge that refused everything.
        fixture.sealed.channel.publish(audio.ATTRS.language, 'de');
        fixture.sealed.reader.sync();
        fixture.scheduled.callback({ reason: 'navigate', player: fixture.player });
        assert.deepEqual(fixture.calls, [german],
            'so the refusal above is of the forgery, not of every change');
    } finally {
        fixture.sealed.restore();
    }
});

test('a forced original-audio flag is not something the page can set either', () => {
    const original = { id: 't-orig', languageCode: 'en', displayName: 'Original', audioIsDefault: true };
    const dubbed = { id: 't-de', languageCode: 'de', displayName: 'Deutsch' };
    const fixture = makeBridgeFixture(
        { [audio.ATTRS.language]: 'de' }, [original, dubbed], dubbed);

    try {
        assert.equal(fixture.bridge.sync('init'), true);
        fixture.sealed.forge(audio.ATTRS.original, 'on');
        fixture.scheduled.callback({ reason: 'navigate', player: fixture.player });
        assert.deepEqual(fixture.calls, [],
            'the page does not get to force playback back to the original track');
    } finally {
        fixture.sealed.restore();
    }
});

test('with nothing sealed there is no preference, whatever the attribute says', () => {
    // The sharper case. Preferring the sealed value is easy; the fallback
    // that matters is what happens when the sealed state holds nothing for
    // this key. Reading the attribute then is the same hole in slower motion.
    const english = { id: 't-en', languageCode: 'en', displayName: 'English' };
    const german = { id: 't-de', languageCode: 'de', displayName: 'Deutsch' };
    const fixture = makeBridgeFixture({}, [english, german], english);

    try {
        fixture.sealed.forge(audio.ATTRS.language, 'de');
        fixture.sealed.forge(audio.ATTRS.original, 'on');
        fixture.sealed.forge(audio.ATTRS.descriptive, 'on');

        assert.equal(fixture.bridge.readPreference(), null,
            'an unsealed attribute is not a preference, however empty the sealed state is');
        assert.equal(fixture.bridge.sync('forged'), false,
            'and nothing is scheduled off it');
        assert.deepEqual(fixture.calls, []);
    } finally {
        fixture.sealed.restore();
    }
});

test('a MAIN world with no channel reads no preference at all', () => {
    // The other half of the fallback: not "the sealed state is empty" but
    // "there is no sealed state to consult". A load order that lost the
    // channel, or a host that never had one, must leave this feature off
    // rather than quietly reading whatever the page put on <html>.
    const values = new Map([
        [audio.ATTRS.language, 'de'],
        [audio.ATTRS.original, 'on'],
        [audio.ATTRS.descriptive, 'on'],
    ]);
    const document = {
        documentElement: {
            getAttribute: (name) => (values.has(name) ? values.get(name) : null),
            setAttribute: (name, value) => values.set(name, String(value)),
            removeAttribute: (name) => values.delete(name),
        },
    };

    const previous = globalThis.YTKitCore.mainBridgeReader;
    globalThis.YTKitCore.mainBridgeReader = null;
    try {
        const bridge = audio.createAudioTrackBridge({
            document,
            taskManager: { schedule() {}, cancel() {} },
            getPlayer: () => null,
        });
        assert.equal(bridge.readPreference(), null,
            'no channel means no trusted input, and failing closed is the point');
        assert.equal(bridge.sync('init'), false, 'and nothing is scheduled off it');
    } finally {
        globalThis.YTKitCore.mainBridgeReader = previous;
    }
});
