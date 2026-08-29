'use strict';

// These were two scans asking whether the module file contains the strings
// "createYoutubeMusicCompatFeature" and "music.youtube.com". The host check is
// the whole point of the feature, so it is now exercised against real
// hostnames — including the lookalike the exact match exists to refuse.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createYoutubeMusicCompatFeature } = require('../../extension/features/youtube-music-compat');

function runOn(hostname) {
    const injected = [];
    const previousLocation = globalThis.location;
    globalThis.location = { hostname };
    try {
        const feature = createYoutubeMusicCompatFeature({
            injectStyle: (css) => { injected.push(css); return { remove() { injected.pop(); } }; },
        });
        feature.init();
        return { feature, injected };
    } finally {
        if (previousLocation === undefined) delete globalThis.location;
        else globalThis.location = previousLocation;
    }
}

test('the compat styles land on YouTube Music and nowhere else', () => {
    const music = runOn('music.youtube.com');
    assert.equal(music.injected.length, 1, 'music.youtube.com is the surface this feature exists for');
    assert.match(music.injected[0], /ytmusic-app, ytmusic-app-layout/);
    assert.match(music.injected[0], /background: var\(--yt-sys-color-baseline--base-background/,
        'the theming reuses the design token rather than a hardcoded colour');
    assert.match(music.injected[0], /border-radius: 8px !important/,
        'the rectangularize hook applies to YT Music buttons too');

    for (const hostname of ['www.youtube.com', 'youtube.com', 'studio.youtube.com']) {
        assert.deepEqual(runOn(hostname).injected, [],
            `${hostname} is not YouTube Music and must not be restyled`);
    }
});

test('a lookalike hostname is refused, which is why the check is an exact match', () => {
    // A substring check would have matched all of these.
    for (const hostname of [
        'music.youtube.com.phishing.io',
        'notmusic.youtube.com',
        'music.youtube.com.evil.example',
        'MUSIC.YOUTUBE.COM',
    ]) {
        assert.deepEqual(runOn(hostname).injected, [], `${hostname} must not be treated as YouTube Music`);
    }
});

test('teardown removes the stylesheet it added', () => {
    const music = runOn('music.youtube.com');
    assert.equal(music.injected.length, 1);
    music.feature.destroy();
    assert.deepEqual(music.injected, [], 'the injected stylesheet must not outlive the feature');
    assert.equal(music.feature._styleElement, null, 'and the handle must be dropped');
    music.feature.destroy();
    assert.deepEqual(music.injected, [], 'a second teardown must be harmless');
});
