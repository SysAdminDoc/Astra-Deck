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

test('antiTranslate builds no on-device model session at all', () => {
    // Two rounds on this one. It first created a LanguageDetector from
    // `_process()`, a broad mutation rule allowing 120 invocations per 5s
    // window, so concurrent creates orphaned sessions destroy() never released.
    // Moving the create into its consumer fixed the leak and revealed the real
    // problem: that consumer, `_isTranslated`, has no callers anywhere in
    // extension/, tests/, or either userscript artifact. The whole apparatus
    // downloaded a model for a comparison nothing performs, so it is gone.
    const block = monolith.slice(monolith.indexOf("id: 'antiTranslate'"));
    const feature = block.slice(0, block.indexOf("id: 'pauseOtherTabs'"));
    assert.ok(!feature.includes('_languageDetector'),
        'no detector state may come back without a caller to justify it');
    assert.ok(!feature.includes('LanguageDetector'),
        'and nothing may reach for the platform factory');
    assert.ok(!feature.includes('_isTranslated'),
        'the dead consumer goes with it');
    // The feature still does its actual job by string comparison.
    assert.ok(feature.includes("el.setAttribute('ytkit-antitranslate', '1')"),
        'the title restore itself must be untouched');
});

test('no feature keeps a consumer that nothing calls', () => {
    // The check that would have caught the above directly. A private method on
    // a feature object is dead if its name appears exactly once in the whole
    // tree, at its own definition.
    const roots = [
        path.join(repoRoot, 'extension'),
        path.join(repoRoot, 'tests')
    ];
    const sources = [];
    for (const root of roots) {
        (function walk(dir) {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) { if (entry.name !== '_locales') walk(full); }
                // Skip this file: it names the dead symbols in order to
                // forbid them, and would otherwise count itself as a caller.
                else if (full.endsWith('.js') && full !== __filename) {
                    sources.push(fs.readFileSync(full, 'utf8'));
                }
            }
        }(root));
    }
    const haystack = sources.join('\n');

    // Only the methods this audit touched. Widening it to every `_name()` in
    // the tree is a separate, noisier job; see ROADMAP.
    for (const name of ['_isTranslated', '_initLanguageDetector']) {
        const uses = haystack.split(name).length - 1;
        assert.equal(uses, 0, name + ' is dead and must not return');
    }
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
    assert.ok(sync.includes('SUPPRESSION_TTL_MS'), 'suppression marks need a lifetime');
    assert.ok(sync.includes('setTimeout(() => dropSuppressionMark(key, token, mark), SUPPRESSION_TTL_MS);'),
        'markSuppressed must schedule the release for the mark it just made');
    // Identity, not a count. A plain counter cannot tell one mark from
    // another, so a reaper armed for an earlier mark would release a later one
    // that reused the same serialized value, and the genuine echo it was meant
    // to swallow would be uploaded as a local change.
    assert.ok(sync.includes('const mark = {};'), 'each mark must be its own object');
    assert.ok(sync.includes('marks.add(mark);'), 'marks are held as a set, not a tally');
    assert.ok(!sync.includes('values.set(token, (values.get(token) || 0) + 1);'),
        'the countable form cannot distinguish two marks with the same value');

    // And the module still loads with the reaper wired in.
    const api = require('../extension/core/settings-sync.js');
    assert.equal(typeof api, 'object', 'the module must still load');
});
