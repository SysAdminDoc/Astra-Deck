'use strict';

// Per-area test bed for the SponsorBlock feature.
//
// NX12 modularization seed (v3.23.0). Future SponsorBlock regressions
// land here; pre-existing tests in `tests/hardening.test.js` migrate
// incrementally.

const test = require('node:test');
const assert = require('node:assert/strict');
const { sources, config, extractFeatureBlock } = require('../helpers/source');

test('SponsorBlock feature block is reachable via the shared helper', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'sponsorBlock');
    assert.ok(block.length > 100,
        'SponsorBlock feature block must contain non-trivial source');
    assert.match(block, /_loadForVideo|_checkSkip|_segments/,
        'SponsorBlock feature must carry its segment-load / skip API');
});

test('SponsorBlock skip path announces via aria-live with a human-friendly category label (NX5)', () => {
    // The aria-live announcement landed in _checkSkip alongside the
    // already-shipped no-toast invariant. Pin the label map so a
    // refactor can't reduce screen-reader output to "Skipped sponsor"
    // (which is fine but the v3.23.0 surface uses richer labels).
    const block = sources.ytkit;
    const idx = block.indexOf('_checkSkip()');
    assert.ok(idx > -1, '_checkSkip must exist');
    const region = block.slice(idx, idx + 3500);
    assert.match(region, /announceA11y\(/,
        'SponsorBlock skip must announce via announceA11y');
    assert.match(region, /Skipped \$\{label\}/,
        'SponsorBlock announcement must use a human-friendly category label, not the raw category id');
});

test('poi_highlight stays a marker, never a skip target (v3.20.1 Pass 8)', () => {
    // Pin the documented SponsorBlock API contract: poi_highlight is
    // a jump-to reference, never an auto-skip end. Pass 8 closed this
    // correctness finding; this regression keeps it closed.
    const block = sources.ytkit;
    const idx = block.indexOf('_checkSkip()');
    const region = block.slice(idx, idx + 1500);
    assert.match(region, /poi_highlight/,
        '_checkSkip must reference poi_highlight by name');
    assert.match(region, /continue/,
        '_checkSkip must short-circuit on poi_highlight (continue, not skip)');
});

test('SponsorBlock uses event-driven setTimeout scheduling, not requestAnimationFrame', () => {
    // Upstream SponsorBlock v6.1.5 (2026-04-21) fixed "segments not skipping
    // when video is scrolled away" — their old code path was gated on a
    // requestAnimationFrame loop that stops firing when YouTube hides the
    // off-screen video via IntersectionObserver. Our SponsorBlock has
    // always used event-driven setTimeout boundaries (scheduled from the
    // `playing` / `seeked` / `ratechange` events), which fire regardless
    // of viewport. This test pins the architecture so a future refactor
    // can't accidentally introduce the same regression.
    const [block] = extractFeatureBlock(sources.ytkit, 'sponsorBlock');
    assert.match(block, /_scheduleNextSkip\(\) \{/,
        '_scheduleNextSkip must exist as the boundary-scheduling primitive');
    assert.match(block, /setTimeout\(\(\) => \{[\s\S]*?_checkSkip\(\)/,
        '_scheduleNextSkip must schedule _checkSkip via setTimeout (not rAF)');
    // The dangerous regression would be using requestAnimationFrame ANYWHERE
    // inside the SponsorBlock feature object for skip orchestration. Bar
    // segment rendering is fine to repaint via rAF batching, but skip
    // SCHEDULING must not be — rAF is the failure mode upstream patched.
    assert.equal(/requestAnimationFrame\([^)]*_checkSkip/.test(block), false,
        'SponsorBlock must NEVER schedule _checkSkip via requestAnimationFrame');
    assert.equal(/requestAnimationFrame\([^)]*_scheduleNextSkip/.test(block), false,
        'SponsorBlock must NEVER schedule the boundary planner via requestAnimationFrame');
});

test('SponsorBlock pauses scheduling when video is paused', () => {
    // The schedule chain self-terminates on a paused video so a long-paused
    // background tab doesn't accumulate dangling timers. Pin the early-return.
    const [block] = extractFeatureBlock(sources.ytkit, 'sponsorBlock');
    assert.match(block, /_scheduleNextSkip\(\) \{[\s\S]*?if \(!video \|\| video\.paused/,
        '_scheduleNextSkip must early-return on a missing / paused video element');
});

test('SponsorBlock skip detection ignores element visibility', () => {
    // The match condition for "should skip now" reads video.currentTime
    // against segment bounds — it does NOT consult IntersectionObserver,
    // getBoundingClientRect, offsetParent, or any other visibility primitive.
    // This is exactly why the scrolled-away bug never reproduces here.
    const block = sources.ytkit;
    const idx = block.indexOf('_checkSkip()');
    const region = block.slice(idx, idx + 1800);
    assert.equal(/IntersectionObserver|getBoundingClientRect|offsetParent/.test(region), false,
        '_checkSkip must remain viewport-agnostic — never consult IntersectionObserver / ' +
        'getBoundingClientRect / offsetParent. Adding any of those would re-introduce ' +
        'the scrolled-away segment-skip regression that upstream SB v6.1.5 patched.');
});

// ── SponsorBlock Per-Channel Skip Profiles ──

test('SponsorBlock per-channel profiles default settings exist', () => {
    const { defaultSettings } = config;
    assert.strictEqual(defaultSettings.sbPerChannelProfiles, false,
        'sbPerChannelProfiles must default to false');
    assert.deepStrictEqual(defaultSettings.sbPerChannelProfilesData, {},
        'sbPerChannelProfilesData must default to an empty object');
});

test('SponsorBlock _getEnabledCategories checks per-channel overrides when sbPerChannelProfiles is on', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'sponsorBlock');
    assert.match(block, /sbPerChannelProfiles/,
        '_getEnabledCategories must reference sbPerChannelProfiles setting');
    assert.match(block, /sbPerChannelProfilesData/,
        '_getEnabledCategories must read sbPerChannelProfilesData for channel overrides');
    assert.match(block, /profile\.categories\[apiName\]/,
        '_getEnabledCategories must look up per-category overrides from the channel profile');
});

test('sbPerChannelProfiles feature block exists with correct id and category labels', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'sbPerChannelProfiles');
    assert.ok(block.length > 100,
        'sbPerChannelProfiles feature block must contain non-trivial source');
    assert.match(block, /SponsorBlock Per-Channel Profiles/,
        'Feature must have a descriptive name');
    assert.match(block, /_CATEGORY_LABELS/,
        'Feature must carry category labels for the UI');
    assert.match(block, /ytkit-sb-channel-chip/,
        'Feature must render a channel chip on the watch page');
});

test('sbPerChannelProfiles caps storage at 500 entries', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'sbPerChannelProfiles');
    assert.match(block, /500/,
        'Per-channel profiles must enforce a 500-entry cap');
    assert.match(block, /entries\.sort/,
        'Over-cap pruning must sort by updatedAt before evicting');
});

test('sbPerChannelProfiles has reset-to-global-defaults action', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'sbPerChannelProfiles');
    assert.match(block, /Reset to global defaults/,
        'Panel must include a reset action to clear per-channel overrides');
    assert.match(block, /_resetChannel/,
        'Feature must have a _resetChannel method');
});
