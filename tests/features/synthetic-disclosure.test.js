'use strict';

// The synthetic filter used to read only the card's text. That misses a video
// YouTube itself has labelled — the disclosure travels in the player response,
// not in the title — and it fires on ordinary videos whose titles happen to say
// "AI generated". The disclosure is now the first signal and the patterns are
// the fallback.
//
// The payload is walked, never JSON.stringify'd: stringifying allocates a copy
// of a multi-megabyte object per card, and it matches the key NAME wherever it
// appears as a value, so a video whose description mentions "madeWithAi" would
// read as disclosed.

const test = require('node:test');
const assert = require('node:assert/strict');

require('../../extension/core/text-metrics.js');
require('../../extension/core/date-time.js');
require('../../extension/core/predicate-sandbox.js');
require('../../extension/core/persisted-domains.js');

const MODULE_PATH = '../../extension/features/video-hider/index.js';

function loadModule() {
    const originalFeatures = globalThis.YTKitFeatures;
    globalThis.YTKitFeatures = {};
    delete require.cache[require.resolve(MODULE_PATH)];
    const mod = require(MODULE_PATH);
    globalThis.YTKitFeatures = originalFeatures;
    return mod;
}

/** A plain card with nothing in its text that looks synthetic. */
function plainCard({ videoId = 'dQw4w9WgXcQ', title = 'A woodworking bench build' } = {}) {
    const titleNode = { textContent: title };
    const row = { textContent: '12,000 views · 3 days ago', getAttribute: () => null };
    const link = {
        href: `https://www.youtube.com/watch?v=${videoId}`,
        getAttribute: (key) => (key === 'href' ? `/watch?v=${videoId}` : null),
        textContent: 'A channel',
    };
    return {
        textContent: `${title} 12,000 views`,
        dataset: {},
        className: '',
        querySelector(selector) {
            if (selector.includes('#video-title') || selector.includes('.title')) return titleNode;
            if (selector.includes('a[href*="/watch?v="]')) return link;
            return null;
        },
        querySelectorAll(selector) {
            if (selector === 'a[href]') return [link];
            if (selector.includes('#metadata-line')) return [row];
            if (selector.includes('/watch?v=')) return [link];
            return [];
        },
    };
}

/** A player response for `videoId`, with `disclosure` merged into it. */
function playerResponse(videoId, disclosure = null) {
    const response = {
        videoDetails: { videoId, title: 'A woodworking bench build', author: 'A channel' },
        microformat: {
            playerMicroformatRenderer: {
                lengthSeconds: '600',
                ownerChannelName: 'A channel',
            },
        },
    };
    if (disclosure) Object.assign(response.microformat.playerMicroformatRenderer, disclosure);
    return response;
}

function featureWith({ settings = {}, response = null } = {}) {
    const mod = loadModule();
    return mod.createHideVideosFromHomeFeature({
        appState: {
            settings: {
                hideVideosSyntheticNarrationFilter: true,
                hideVideosLowViewFilter: false,
                hideVideosLowSignalFilter: false,
                hideVideosUploadCadenceFilter: false,
                hideVideosKeywordFilter: '',
                advancedLocalPredicate: false,
                advancedLocalPredicateCode: '',
                ...settings,
            },
        },
        getPlayerResponseGlobal: () => response,
        PredicateSandbox: globalThis.YTKitCore.createPredicateSandbox(),
    });
}

const DISCLOSURE_KEYS = ['generativeAi', 'generatedWithAi', 'alteredOrSynthetic', 'madeWithAi'];

test('a video YouTube discloses as synthetic is hidden, whatever its title says', () => {
    for (const key of DISCLOSURE_KEYS) {
        const feature = featureWith({ response: playerResponse('dQw4w9WgXcQ', { [key]: true }) });
        const card = plainCard();
        const metadata = feature._extractVideoMetadata(card);

        assert.equal(metadata.syntheticNarration, false,
            `${key}: nothing in this card's text looks synthetic`);
        assert.equal(metadata.syntheticDisclosure, key, `${key}: the disclosure must be read`);
        assert.deepEqual(feature._matchesMetadataFilters(card, metadata), {
            hide: true,
            reason: 'synthetic-disclosed',
            disclosureKey: key,
        }, `${key}: the reason must name the signal that fired`);
    }
});

test('the disclosure is found wherever in the payload it sits', () => {
    // Down an array, then two objects. The payload has moved this between
    // microformat, videoDetails and a renderer across the rollout, so a fixed
    // path is a path that stops working.
    const nested = playerResponse('dQw4w9WgXcQ');
    nested.contents = {
        twoColumnWatchNextResults: {
            results: {
                results: {
                    contents: [
                        { videoPrimaryInfoRenderer: { title: { simpleText: 'A woodworking bench build' } } },
                        { videoSecondaryInfoRenderer: { attributedDescription: { alteredOrSynthetic: true } } },
                    ],
                },
            },
        },
    };
    const feature = featureWith({ response: nested });
    const card = plainCard();
    assert.equal(feature._extractVideoMetadata(card).syntheticDisclosure, 'alteredOrSynthetic',
        'the key does not sit in one fixed place, so a fixed path would miss it');
});

test('a disclosure that says NO must never hide anything', () => {
    for (const value of [false, null, undefined, '', 0]) {
        const feature = featureWith({
            response: playerResponse('dQw4w9WgXcQ', { alteredOrSynthetic: value }),
        });
        const card = plainCard();
        const metadata = feature._extractVideoMetadata(card);
        assert.equal(metadata.syntheticDisclosure, null,
            `${JSON.stringify(value)} is the creator declaring it is NOT synthetic`);
        assert.equal(feature._matchesMetadataFilters(card, metadata).hide, false);
    }
});

test('the key name appearing as a VALUE is not a disclosure', () => {
    // This is what a JSON.stringify + regex implementation would get wrong.
    const inProse = playerResponse('dQw4w9WgXcQ');
    inProse.microformat.playerMicroformatRenderer.description = {
        simpleText: 'Chapter 3 covers madeWithAi and alteredOrSynthetic labels on YouTube.',
    };
    assert.equal(featureWith({ response: inProse })._extractVideoMetadata(plainCard()).syntheticDisclosure,
        null, 'a video ABOUT the labels is not a labelled video');

    // And the sharper case: the key name standing alone AS a value. A tag, a
    // tracking param, an enum — all of which a stringify-and-match reads as a
    // disclosure, and none of which is one.
    for (const shape of [
        { keywords: ['woodworking', 'madeWithAi'] },
        { trackingParams: { label: 'alteredOrSynthetic' } },
        { badge: 'generativeAi' },
    ]) {
        const response = playerResponse('dQw4w9WgXcQ');
        Object.assign(response.microformat.playerMicroformatRenderer, shape);
        assert.equal(featureWith({ response })._extractVideoMetadata(plainCard()).syntheticDisclosure,
            null, `${JSON.stringify(shape)} names a key, it does not carry one`);
    }
});

test('a player response for a different video is never read', () => {
    // On a feed there is one loaded player response and many cards. Reading it
    // for all of them would hide every card on the page whenever the video the
    // user is watching happens to be disclosed.
    const feature = featureWith({
        response: playerResponse('SOMEOTHERVID', { alteredOrSynthetic: true }),
    });
    const card = plainCard({ videoId: 'dQw4w9WgXcQ' });
    const metadata = feature._extractVideoMetadata(card);
    assert.equal(metadata.syntheticDisclosure, null);
    assert.equal(feature._matchesMetadataFilters(card, metadata).hide, false);
});

test('with no payload at all the text heuristic still decides, exactly as before', () => {
    const feature = featureWith({ response: null });
    const card = plainCard({ title: 'Narrated with AI generated voice over' });
    const metadata = feature._extractVideoMetadata(card);

    assert.equal(metadata.syntheticDisclosure, null, 'there is nothing to read');
    assert.equal(metadata.syntheticNarration, true, 'so the patterns are what is left');
    assert.deepEqual(feature._matchesMetadataFilters(card, metadata), {
        hide: true,
        reason: 'synthetic-narration',
    }, 'and the existing reason is unchanged');
});

test('the filter stays off until the user turns it on', () => {
    const feature = featureWith({
        settings: { hideVideosSyntheticNarrationFilter: false },
        response: playerResponse('dQw4w9WgXcQ', { alteredOrSynthetic: true }),
    });
    const card = plainCard();
    const metadata = feature._extractVideoMetadata(card);
    assert.equal(metadata.syntheticDisclosure, 'alteredOrSynthetic',
        'the signal is still read, so a predicate can see it');
    assert.equal(feature._matchesMetadataFilters(card, metadata).hide, false,
        'but nothing is hidden until the filter is enabled');
});

test('a payload with a cycle or an absurd depth does not hang the card scan', () => {
    const cyclic = playerResponse('dQw4w9WgXcQ');
    cyclic.self = cyclic;
    cyclic.microformat.back = cyclic;
    const feature = featureWith({ response: cyclic });
    assert.equal(feature._extractVideoMetadata(plainCard()).syntheticDisclosure, null,
        'a cycle must terminate, not spin');

    // Terminating is not enough. A payload that loops back on itself re-visits
    // the same subtree at every level, and each revisit costs nodes out of the
    // walk's budget. Spend them on repeats and the walk never reaches a
    // disclosure that sits deeper in the same payload — it returns null, and
    // a labelled video is treated as unlabelled.
    const loopedButLabelled = playerResponse('dQw4w9WgXcQ');
    const branch = { name: 'a subtree worth revisiting' };
    for (let i = 0; i < 60; i += 1) branch[`child${i}`] = { back: branch, index: i };
    loopedButLabelled.loop = branch;

    let buried = loopedButLabelled;
    for (let i = 0; i < 9; i += 1) {
        buried.next = {};
        buried = buried.next;
    }
    buried.alteredOrSynthetic = true;

    assert.equal(
        featureWith({ response: loopedButLabelled })._extractVideoMetadata(plainCard()).syntheticDisclosure,
        'alteredOrSynthetic',
        'a cycle earlier in the payload must not cost the walk the key it was looking for');

    // Deeper than the walker's budget: unknown, so fall through to the text
    // heuristic rather than claim the video is clean.
    const deep = playerResponse('dQw4w9WgXcQ');
    let node = deep;
    for (let i = 0; i < 200; i += 1) {
        node.next = {};
        node = node.next;
    }
    node.alteredOrSynthetic = true;
    const deepFeature = featureWith({ response: deep });
    assert.equal(deepFeature._extractVideoMetadata(plainCard()).syntheticDisclosure, null,
        'a key past the depth bound is not reported as found');
});

test('the disclosure reaches the predicate context and the hide-reason vocabulary', () => {
    const feature = featureWith({
        response: playerResponse('dQw4w9WgXcQ', { generativeAi: true }),
    });
    const card = plainCard();

    // _buildPredicateCtx reads window.location for the surface scope.
    const originalWindow = globalThis.window;
    globalThis.window = { location: { pathname: '/' } };
    try {
        const ctx = feature._buildPredicateCtx(card, 'dQw4w9WgXcQ', feature._extractVideoMetadata(card));
        assert.equal(ctx.syntheticDisclosure, 'generativeAi',
            'a user predicate must be able to act on the same signal the filter uses');
    } finally {
        globalThis.window = originalWindow;
    }

    assert.ok(feature._RULE_HIDE_REASONS.includes('synthetic-disclosed'),
        'a rule-driven hide has to be covered by the over-hiding guard');
});
