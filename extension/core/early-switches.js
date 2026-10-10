// Astra Deck - early page-world switches (ISOLATED world, document_start)
//
// The isolated runtime publishes its bridge switches from ytkit.js at
// document_idle. On a hard load that is after YouTube's inline ytInitialData,
// ytInitialPlayerResponse and ytcfg have been read, so three page-world
// features lost the first page: Hide AI Chapters (the AI markers stayed on
// the bar), Force DVR (the first live stream got no DVR) and Classic Watch
// Layout (the experiment flags were already read). This script publishes
// those three switches as soon as storage answers, through the same sealed
// channel, so ytkit-main.js has them before the page data lands.
//
// It runs in its own content_scripts entry after the MAIN one. The token
// entry stays the token file alone (tests/build-fixes.test.js), and nothing
// here waits on anything early.css or the token needs. The channel module
// comes in through import(), the same URL the runtime loader imports later,
// so both share one module record, one writer and one state map: nothing the
// runtime publishes can drop a switch this published.
//
// What it publishes is provisional. ytkit.js calls settle() once its first
// init pass is done, and every switch whose feature didn't start (safe mode,
// a conflict, a crash count, a remote disable) is cleared then.

(function () {
    'use strict';

    var root = typeof globalThis !== 'undefined' ? globalThis : this;
    var core = root.YTKitCore || (root.YTKitCore = {});
    if (core.earlyBridgeSwitches) return;

    var SETTINGS_KEY = 'ytSuiteSettings';
    var SAFE_MODE_KEY = 'ytkit_safe_mode';
    var CHANNEL_MODULE = 'core/bridge-channel.js';
    // settings-schema.js watchLayoutFlagOverrides: same pattern and cap, and
    // features/classic-watch-layout normalizes it the same way.
    var FLAG_PATTERN = /^[A-Za-z0-9_,\s-]*$/;
    var MAX_FLAG_TEXT = 4000;

    // Exactly what each feature publishes from its init(), in that order.
    var SWITCHES = Object.freeze([
        Object.freeze({ featureId: 'forceDvr', attribute: 'data-ytkit-force-dvr' }),
        Object.freeze({ featureId: 'hideAutoChapters', attribute: 'data-ytkit-hide-auto-chapters' }),
        Object.freeze({
            featureId: 'restoreClassicWatchLayout',
            attribute: 'data-ytkit-classic-watch-layout',
            flagsKey: 'watchLayoutFlagOverrides',
            flagsAttribute: 'data-ytkit-classic-watch-layout-flags'
        })
    ]);

    // Only a watch page carries the inline data these features act on.
    function isWatchPath(pathname) {
        var path = String(pathname || '');
        return path === '/watch' || path.indexOf('/live/') === 0;
    }

    function isSafeModeUrl(search) {
        return /[?&]ytkit=safe(?:&|$)/.test(String(search || ''));
    }

    function normalizeFlagText(value) {
        if (typeof value !== 'string' || value.length > MAX_FLAG_TEXT || !FLAG_PATTERN.test(value)) return '';
        return value.trim();
    }

    /**
     * The {name, value, featureId} writes for a stored settings object, in
     * publish order. Only a stored `true` counts: every one of these is off
     * by default, and anything else is not the user turning it on.
     */
    function planEarlySwitches(settings) {
        var plan = [];
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return plan;
        for (var i = 0; i < SWITCHES.length; i += 1) {
            var entry = SWITCHES[i];
            if (settings[entry.featureId] !== true) continue;
            if (entry.flagsAttribute) {
                // The list goes first so the page world's first look at the
                // switch already has it (same order as the feature's init).
                var text = normalizeFlagText(settings[entry.flagsKey]);
                if (text) plan.push({ name: entry.flagsAttribute, value: text, featureId: entry.featureId });
            }
            plan.push({ name: entry.attribute, value: 'on', featureId: entry.featureId });
        }
        return plan;
    }

    var published = [];
    var settled = false;

    function publish(plan) {
        if (settled || !plan.length || typeof core.publishBridgeAttribute !== 'function') return 0;
        // No token means the page-world bridge reads nothing; a plain
        // attribute alone would only be something for settle() to undo.
        if (typeof core.getBridgeWriter !== 'function' || !core.getBridgeWriter()) return 0;
        for (var i = 0; i < plan.length; i += 1) {
            core.publishBridgeAttribute(plan[i].name, plan[i].value);
            published.push({ name: plan[i].name, featureId: plan[i].featureId });
        }
        return plan.length;
    }

    /**
     * Called by ytkit.js after its first init pass. A switch stays only when
     * isActive(featureId) says its feature started; the feature has
     * published the same value itself by then.
     */
    function settle(isActive) {
        if (settled) return 0;
        settled = true;
        var cleared = 0;
        for (var i = 0; i < published.length; i += 1) {
            var keep = false;
            try {
                keep = typeof isActive === 'function' && isActive(published[i].featureId) === true;
            } catch (error) {
                keep = false;
            }
            if (keep || typeof core.clearBridgeAttribute !== 'function') continue;
            core.clearBridgeAttribute(published[i].name);
            cleared += 1;
        }
        published = [];
        return cleared;
    }

    function loadChannel(api) {
        if (typeof core.publishBridgeAttribute === 'function') return Promise.resolve();
        var getURL = api && api.runtime && api.runtime.getURL;
        if (typeof getURL !== 'function') return Promise.reject(new Error('no runtime.getURL'));
        return import(getURL.call(api.runtime, CHANNEL_MODULE));
    }

    /** Read storage and publish. Resolves to the number of switches written. */
    function start(options) {
        var opts = options || {};
        var location = opts.location || root.location;
        if (!location || !isWatchPath(location.pathname) || isSafeModeUrl(location.search)) {
            return Promise.resolve(0);
        }
        var api = opts.api || root.chrome || root.browser;
        var storage = api && api.storage && api.storage.local;
        if (!storage || typeof storage.get !== 'function') return Promise.resolve(0);
        var read;
        try {
            read = Promise.resolve(storage.get([SETTINGS_KEY, SAFE_MODE_KEY]));
        } catch (error) {
            return Promise.resolve(0);
        }
        return Promise.all([read, loadChannel(api)]).then(function (results) {
            // Once the runtime has started it owns every switch; publishing
            // from here could only race it.
            if (settled || root.__ytkitRuntimeBootstrap) return 0;
            var stored = results[0] || {};
            if (stored[SAFE_MODE_KEY] === true) return 0;
            return publish(planEarlySwitches(stored[SETTINGS_KEY]));
        }).catch(function () {
            // reason: the runtime still publishes every switch at document_idle,
            // which is how a hard load behaved before this script existed
            return 0;
        });
    }

    var ready = start();

    core.earlyBridgeSwitches = {
        SWITCHES: SWITCHES,
        planEarlySwitches: planEarlySwitches,
        isWatchPath: isWatchPath,
        settle: settle,
        start: start,
        ready: ready,
        get published() {
            return published.map(function (entry) { return { name: entry.name, featureId: entry.featureId }; });
        },
        get settled() { return settled; }
    };

    // Node-only export, behind the same gate the page-world modules use.
    var inNodeTests = typeof process !== 'undefined'
        && !!process.versions
        && typeof process.versions.node === 'string';
    if (inNodeTests && typeof module !== 'undefined' && module.exports) {
        module.exports = core.earlyBridgeSwitches;
    }
})();
