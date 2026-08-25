'use strict';

// Six lifecycle defects. The framework contract is that nothing is automatic:
// registry.addCleanup runs only on destroy(), feature-lifecycle aborts its
// signal but never touches timers or observers, and ytkit.js destroys and
// re-inits every `pages`-scoped feature on each SPA page-type change. So a
// teardown bug compounds per navigation rather than happening once.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');
const videoHider = read('extension', 'features', 'video-hider', 'index.js');
const settingsPanel = read('extension', 'features', 'settings-panel', 'index.js');
const monolith = read('extension', 'ytkit.js');

test('hidden-card placeholders are held weakly', () => {
    // The key is a feed card. An infinite-scroll session discards thousands of
    // them, and a strong Map pinned every hidden card plus its placeholder for
    // the life of the page. `_removedVideoNodes` twelve lines below uses a
    // WeakRef and a 200-entry cap to avoid exactly this.
    assert.ok(videoHider.includes('_hiddenReasonPlaceholders: new WeakMap(),'),
        'the placeholder map must not keep feed cards alive');
    assert.ok(!/_hiddenReasonPlaceholders\.values\(\)/.test(videoHider),
        'a WeakMap is not iterable; teardown must sweep the DOM by class');
    assert.ok(videoHider.includes("querySelectorAll?.('.ytkit-video-hidden-placeholder')"),
        'destroy must still remove every placeholder it put in the document');
});

test('video-hider refuses to re-arm its refresh after teardown', () => {
    // destroy() cleared the timer, but a refresh already in flight re-armed it
    // from its own .then(). The zombie kept fetching on the daily cadence and,
    // on success, re-hid videos with the feature switched off.
    assert.ok(videoHider.includes('_destroyed: false,'), 'the module must track teardown');
    const schedule = videoHider.slice(videoHider.indexOf('_scheduleFilterListRefresh() {'));
    assert.ok(schedule.slice(0, 200).includes('if (this._destroyed) return;'),
        'scheduling must bail after destroy');
    assert.ok(schedule.slice(0, 1600).includes('if (this._destroyed) return;\n                    void this._refreshFilterList'),
        'the fired timer must bail too, before the chain re-arms itself');
    assert.ok(videoHider.includes('destroy() {\n                this._destroyed = true;'),
        'destroy must set the flag first');
    assert.ok(videoHider.includes('init() {\n                this._destroyed = false;'),
        'and init must clear it, or a re-enable stays dead');
});

test('the language detector is built once, on use, and released on destroy', () => {
    const block = monolith.slice(monolith.indexOf("id: 'antiTranslate'"));
    const feature = block.slice(0, block.indexOf("id: 'pauseOtherTabs'"));
    assert.ok(feature.includes('_languageDetectorPromise'),
        'concurrent callers must share one in-flight create()');
    assert.ok(!/_process\(\) \{\s*this\._initLanguageDetector\(\);/.test(feature),
        '_process is a broad mutation rule; it must not create a model session per tick');
    assert.ok(feature.includes('await this._initLanguageDetector();'),
        'the detector is created by its only consumer, on first real use');
    assert.ok(feature.includes('detector?.destroy?.()'),
        'destroy must release the on-device session');
    assert.ok(feature.includes('this._languageDetectorPromise = null;'),
        'and clear the in-flight handle so a re-enable rebuilds');
});

test('an oEmbed lookup landing after teardown neither throws nor restyles', () => {
    const block = monolith.slice(monolith.indexOf("id: 'antiTranslateThumbnails'"));
    const feature = block.slice(0, 12000);
    assert.ok(feature.includes('this._inFlight?.delete(videoId);'),
        'destroy nulls _inFlight, so the finally must tolerate it');
    assert.ok(feature.includes('this._oEmbedCache?.set(videoId, null);'),
        'the catch must tolerate a nulled cache, or it throws out of the catch');
    assert.ok(feature.includes('if (!this._restore) return;'),
        'a late lookup must not restyle a torn-down page');
    assert.ok(/\.then\(\(meta\) => \{[\s\S]*?\}, \(error\) => \{/.test(feature),
        'the lookup promise needs a rejection handler');
});

test('every reinit debounce is per feature, not shared', () => {
    // The comment above `_reinitTimers` documents this exact bug. Two of the
    // three input handlers were migrated; the text/textarea one was not, so
    // editing feature A then feature B within 600ms cancelled A's pending
    // destroy/init. A's value was saved and the panel said so, but it was
    // never applied.
    for (const [label, source] of [['settings-panel module', settingsPanel], ['ytkit.js', monolith]]) {
        assert.ok(!source.includes('let _textareaReinitTimer = null;'),
            `${label} must not keep a shared reinit timer`);
        assert.ok(!source.includes('_textareaReinitTimer = setTimeout('),
            `${label} must not schedule through a shared reinit timer`);
        const handler = source.slice(source.indexOf("e.target.matches('.ytkit-input')"));
        assert.ok(handler.slice(0, 1400).includes('_reinitTimers.set(featureId,'),
            `${label} text handler must debounce per feature`);
    }
});

test('a suppression token cannot outlive the change it was written for', () => {
    // `storage.local.set` omits unchanged keys from onChanged, so a token for
    // an already-equal key is never consumed. Without a reaper it survived for
    // the life of the worker and silently swallowed the next genuine change
    // that produced the same serialized value.
    const sync = read('extension', 'core', 'settings-sync.js');
    assert.ok(sync.includes('SUPPRESSION_TTL_MS'), 'suppression tokens need a lifetime');
    assert.ok(sync.includes('setTimeout(() => releaseSuppressed(key, token), SUPPRESSION_TTL_MS);'),
        'markSuppressed must schedule the release');
    assert.ok(sync.includes('function releaseSuppressed(key, token) {'),
        'and the release must decrement the same counter consumeSuppressed uses');

    // And the module still loads with the reaper wired in.
    const api = require('../extension/core/settings-sync.js');
    assert.equal(typeof api, 'object', 'the module must still load');
});
