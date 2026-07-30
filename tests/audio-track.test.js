'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const audio = require('../extension/core/audio-track');

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

function makeBridgeFixture(attributes, tracks, current = null) {
    const document = makeDocument(attributes);
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
        get scheduled() { return scheduled; }
    };
}

test('language selection prefers an exact BCP-47 match before a primary-subtag match', () => {
    const primary = { id: 'fr-primary', languageCode: 'fr', displayName: 'Français' };
    const exact = { id: 'fr-ca', languageCode: 'fr-CA', displayName: 'Français (Canada)' };
    assert.equal(audio.selectLanguageTrack([primary, exact], 'fr_CA'), exact);
    assert.equal(audio.selectLanguageTrack([primary], 'fr-CA'), primary);
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
