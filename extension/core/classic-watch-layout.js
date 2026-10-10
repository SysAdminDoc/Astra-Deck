(() => {
    'use strict';

    // YouTube's 2026-10 watch page test moves comments and the description
    // into a side panel on the right, puts recommendations in a grid under
    // the player and drops the theater button. Experiment flags in ytcfg
    // drive it, and the live ytd-watch-flexy carries the result as
    // properties and reflected attributes.
    //
    // This is the page-world half. It turns the flags off in every flag store
    // the page reads, re-applies after each later ytcfg.set, and undoes the
    // element state YouTube already built when the switch arrives after the
    // watch page has rendered. ytkit-main.js owns the bridge and the timing.
    //
    // Nothing is hooked until the user turns the setting on, so a session with
    // it off never sees a wrapped ytcfg.set, a listener or an observer.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createClassicWatchLayout) return;

    // Every flag either published list names for the side-panel page
    // (Techdows 2026-10-08, the MIT classic-watch-layout userscript of
    // 2026-10-07). Turning off one that a given session doesn't carry is a
    // no-op, so the union is safe.
    const DEFAULT_FLAGS = Object.freeze([
        'web_watch_eligible_to_switch_to_grid',
        'web_watch_enable_single_column_grid_view',
        'web_fixed_panel_watch_next',
        'web_fixed_panel_watch_next_grid_swap',
        'web_live_chat_panel_watch_next_grid_swap',
        'web_watch_fixed_default_panels',
        'web_engagement_panel_show_description',
        'web_watch_move_summary_to_sd',
        'web_watch_hero_list',
        'web_watch_split_scroll',
        'swatcheroo_split_scroll',
        'enable_web_side_rail',
        'web_side_rail_dismissible_panels',
        'web_side_rail_default_dismissed_panels',
        'web_side_rail_with_border',
        'kevlar_watch_hide_comments_while_panel_open',
        'kevlar_watch_cinematics',
        'disable_theater_mode'
    ]);

    const FLAG_NAME = /^[A-Za-z][A-Za-z0-9_]{0,95}$/;
    const MAX_EXTRA_FLAGS = 64;

    // Reflected attributes the side-panel CSS keys off. A forced-flag capture
    // on 2026-10-10 (tests/fixtures/watch-side-panel-2026-10.json) carried
    // all of these but show-fixed-side-menu.
    const LAYOUT_ATTRIBUTES = Object.freeze([
        'split-scroll',
        'swatcheroo-split-scroll',
        'using-fixed-panel',
        'fixed-default-panels',
        'show-fixed-side-menu',
        'side-rail-dismissible-panels',
        'fixed-panel-watch-next',
        'side-rail-with-border'
    ]);

    const OBSERVED_ATTRIBUTES = Object.freeze([
        'split-scroll',
        'show-fixed-side-menu',
        'using-fixed-panel',
        'hidden',
        'hide-description'
    ]);

    const COMMENTS_PANEL = 'engagement-panel-comments-section';
    const DESCRIPTION_PANEL = 'engagement-panel-structured-description';
    const SIDE_PANEL_SELECTOR = [COMMENTS_PANEL, DESCRIPTION_PANEL]
        .map((id) => `ytd-engagement-panel-section-list-renderer[target-id="${id}"]`)
        .join(',');
    const OBSERVED_TAGS = new Set(['ytd-comments', 'ytd-watch-metadata']);

    const NAVIGATION_EVENTS = Object.freeze(['yt-navigate-start', 'yt-navigate-finish', 'yt-page-data-updated']);
    const LATE_RETRY_DELAYS = Object.freeze([500, 1500]);
    // Comments arrive as a property (ytd-comments.data), which no observer
    // sees, so after a fix the panels are re-checked on a short schedule
    // until each one's section under the video is showing (about 8 s).
    const SETTLE_DELAYS = Object.freeze([250, 500, 1000, 2000, 4000]);
    const INLINE_DESCRIPTION_SELECTOR = 'ytd-text-inline-expander, #description-inline-expander';

    /**
     * Read the user's field. One flag per line (commas and spaces also
     * separate); a line starting with "-" leaves that built-in flag alone.
     */
    function parseFlagOverrides(value) {
        const add = [];
        const remove = [];
        const seen = new Set();
        for (const raw of String(value ?? '').split(/[\s,]+/)) {
            if (!raw) continue;
            const excluded = raw.startsWith('-');
            const name = excluded ? raw.slice(1) : raw;
            if (!FLAG_NAME.test(name)) continue;
            const key = (excluded ? '-' : '+') + name;
            if (seen.has(key)) continue;
            seen.add(key);
            if (excluded) remove.push(name);
            else if (add.length < MAX_EXTRA_FLAGS) add.push(name);
        }
        return { add, remove };
    }

    /** The flags to turn off: the built-in list, minus exclusions, plus additions. */
    function resolveFlags(value) {
        const { add, remove } = parseFlagOverrides(value);
        const removed = new Set(remove);
        const flags = DEFAULT_FLAGS.filter((flag) => !removed.has(flag));
        for (const flag of add) {
            if (!removed.has(flag) && !flags.includes(flag)) flags.push(flag);
        }
        return flags;
    }

    function isSidePanelLayout(flexy) {
        if (!flexy) return false;
        return Boolean(
            flexy.fixedDefaultPanels || flexy.sideRailDismissiblePanels || flexy.fixedPanelWatchNext ||
            flexy.splitScroll || flexy.showFixedSideMenu || flexy.fixedSideMenu ||
            flexy.hasAttribute?.('split-scroll') || flexy.hasAttribute?.('show-fixed-side-menu')
        );
    }

    function createClassicWatchLayout(options = {}) {
        const root = options.root || globalThis;
        const documentRef = options.document || root.document || null;
        const schedule = options.setTimeout || ((callback, delay) => root.setTimeout(callback, delay));
        const requestFrame = options.requestAnimationFrame
            || (typeof root.requestAnimationFrame === 'function' ? root.requestAnimationFrame.bind(root) : null)
            || ((callback) => schedule(callback, 16));
        const MutationObserverCtor = options.MutationObserver || root.MutationObserver || null;
        const EventCtor = options.Event || root.Event || null;
        const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};

        let enabled = false;
        let flags = DEFAULT_FLAGS.slice();
        let switched = false;
        let frameQueued = false;
        let observer = null;
        let observedFlexy = null;
        let lastStatus = null;
        let lastFlagText = null;
        let settleRun = 0;
        const wrappedConfigs = new WeakSet();
        // Side panels this closes once their inline section shows.
        const pendingPanels = new Set();
        // Flags this turned off, with what they held, so turning the setting
        // off hands YouTube back exactly what it set.
        const overridden = [];

        function report(state) {
            if (state === lastStatus) return;
            lastStatus = state;
            try { onStatus(state); } catch (error) { /* reason: diagnostics must not break the page */ }
        }

        function flagStores() {
            const stores = [];
            const add = (store) => {
                if (store && typeof store === 'object' && !stores.includes(store)) stores.push(store);
            };
            try {
                const cfg = root.ytcfg;
                if (cfg && typeof cfg.get === 'function') add(cfg.get('EXPERIMENT_FLAGS'));
                if (cfg && cfg.data_) add(cfg.data_.EXPERIMENT_FLAGS);
            } catch (error) { /* reason: a page getter can throw; the other stores still apply */ }
            try {
                if (root.yt && root.yt.config_) add(root.yt.config_.EXPERIMENT_FLAGS);
            } catch (error) { /* reason: as above */ }
            return stores;
        }

        function patchFlags() {
            if (!enabled) return 0;
            let changed = 0;
            for (const store of flagStores()) {
                let record = overridden.find((entry) => entry.store === store);
                for (const flag of flags) {
                    // Own flags only: a line like "hasOwnProperty" must never
                    // shadow a method every page call on the store relies on.
                    if (!Object.prototype.hasOwnProperty.call(store, flag)) continue;
                    let value;
                    try { value = store[flag]; } catch (error) { continue; }
                    if (!value) continue;
                    if (!record) {
                        record = { store, originals: new Map() };
                        overridden.push(record);
                    }
                    if (!record.originals.has(flag)) record.originals.set(flag, value);
                    try {
                        store[flag] = false;
                        changed += 1;
                    } catch (error) { /* reason: a frozen store keeps its value; the element fix still runs */ }
                }
            }
            return changed;
        }

        function restoreFlags() {
            for (const { store, originals } of overridden) {
                for (const [flag, value] of originals) {
                    try {
                        if (store[flag] === false) store[flag] = value;
                    } catch (error) { /* reason: leave a store the page locked as it is */ }
                }
            }
            overridden.length = 0;
        }

        // A later ytcfg.set can replace EXPERIMENT_FLAGS wholesale; re-apply
        // straight after it, before anything reads the new object.
        function wrapConfigSet() {
            let cfg;
            try { cfg = root.ytcfg; } catch (error) { return; }
            if (!cfg || (typeof cfg !== 'object' && typeof cfg !== 'function') || wrappedConfigs.has(cfg)) return;
            const original = cfg.set;
            if (typeof original !== 'function') return;
            try {
                cfg.set = function () {
                    const result = original.apply(this, arguments);
                    if (enabled) patchFlags();
                    return result;
                };
                wrappedConfigs.add(cfg);
            } catch (error) { /* reason: a locked ytcfg still gets the navigation-time re-apply */ }
        }

        function dispatchResize() {
            if (!EventCtor || typeof root.dispatchEvent !== 'function') return;
            try { root.dispatchEvent(new EventCtor('resize')); } catch (error) { /* reason: cosmetic nudge only */ }
        }

        // The side-panel page hides the regular comments section under the
        // video. Un-hide it once it has data, and nudge YouTube to load it.
        function showComments(flexy) {
            const comments = flexy.querySelector?.('ytd-comments#comments');
            if (comments && comments.hidden && comments.data) {
                comments.hidden = false;
                schedule(dispatchResize, 100);
            }
        }

        // It also hides the description under the title (hide-description on
        // ytd-watch-metadata) because the panel on the right carries it.
        function showDescription(flexy) {
            const metadata = flexy.querySelector?.('ytd-watch-metadata');
            if (!metadata) return;
            try { if (metadata.hideDescription) metadata.hideDescription = false; } catch (error) { /* reason: the attribute strip below still applies */ }
            try { metadata.removeAttribute?.('hide-description'); } catch (error) { /* reason: keep going */ }
        }

        // A side panel is closed only once the section that replaces it under
        // the video is showing, so a hard load, where the comments arrive
        // later, never leaves the page with neither.
        function inlineReplacementShown(flexy, targetId) {
            if (targetId === COMMENTS_PANEL) {
                const comments = flexy.querySelector?.('ytd-comments#comments');
                return Boolean(comments && !comments.hidden);
            }
            // Un-hiding is not enough: the description has to have been built
            // under the title, or closing its panel would leave none at all.
            const metadata = flexy.querySelector?.('ytd-watch-metadata');
            return Boolean(metadata && !metadata.hasAttribute?.('hide-description')
                && metadata.querySelector?.(INLINE_DESCRIPTION_SELECTOR));
        }

        function closeReplacedPanels(flexy) {
            if (!pendingPanels.size) return;
            for (const panel of documentRef.querySelectorAll?.(SIDE_PANEL_SELECTOR) || []) {
                const targetId = panel.getAttribute?.('target-id');
                if (!pendingPanels.has(targetId) || !inlineReplacementShown(flexy, targetId)) continue;
                panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
                pendingPanels.delete(targetId);
            }
        }

        // Bounded: a section that never shows leaves its panel open, which
        // is YouTube's own layout for it.
        function settlePanels() {
            const runId = ++settleRun;
            let attempt = 0;
            const step = () => {
                if (runId !== settleRun || !enabled || !pendingPanels.size) return;
                const flexy = documentRef?.querySelector?.('ytd-watch-flexy');
                if (flexy) {
                    showDescription(flexy);
                    showComments(flexy);
                    closeReplacedPanels(flexy);
                }
                if (pendingPanels.size && attempt < SETTLE_DELAYS.length) schedule(step, SETTLE_DELAYS[attempt++]);
            };
            if (pendingPanels.size) schedule(step, SETTLE_DELAYS[attempt++]);
        }

        function observe(flexy) {
            if (!MutationObserverCtor || !flexy || observedFlexy === flexy) return;
            observer?.disconnect();
            observer = new MutationObserverCtor((records) => {
                for (const record of records) {
                    const target = record.target;
                    if (target === flexy || OBSERVED_TAGS.has(String(target?.tagName || '').toLowerCase())) {
                        queueRun();
                        return;
                    }
                }
            });
            observer.observe(flexy, { attributes: true, subtree: true, attributeFilter: OBSERVED_ATTRIBUTES.slice() });
            observedFlexy = flexy;
        }

        function fixWatchFlexy() {
            if (!enabled || !documentRef) return false;
            const flexy = documentRef.querySelector?.('ytd-watch-flexy');
            if (!flexy) return false;
            observe(flexy);
            if (switched) {
                showDescription(flexy);
                showComments(flexy);
                closeReplacedPanels(flexy);
            }
            if (!isSidePanelLayout(flexy)) return false;
            switched = true;

            try {
                flexy.sideRailDismissiblePanels = false;
                flexy.fixedPanelWatchNext = false;
                flexy.fixedDefaultPanels = false;
                flexy.fixedSideMenu = null;
                if (typeof flexy._setProperty === 'function') flexy._setProperty('splitScroll', false);
                else flexy.splitScroll = false;
            } catch (error) { /* reason: the attribute strip and CSS below still apply */ }

            // Re-check whether the player should offer the theater button.
            try {
                if (typeof flexy.setPlayerTheaterMode_ === 'function') flexy.setPlayerTheaterMode_();
            } catch (error) { /* reason: the button is cosmetic; the layout fix stands */ }

            for (const attribute of LAYOUT_ATTRIBUTES) {
                try { flexy.removeAttribute(attribute); } catch (error) { /* reason: keep going */ }
            }

            // Recommendations back in the right-hand column.
            try {
                if (typeof flexy.updateWatchFeedLocation === 'function') flexy.updateWatchFeedLocation(flexy.isTwoColumns_);
            } catch (error) { /* reason: the manual move below covers it */ }
            const related = flexy.querySelector?.('#related');
            const secondaryInner = flexy.querySelector?.('#secondary-inner');
            if (flexy.isTwoColumns_ && related && secondaryInner && !secondaryInner.contains(related)) {
                secondaryInner.appendChild(related);
            }

            // Bring the description and comments back under the video, then
            // close their panels on the right once each one is showing there.
            showDescription(flexy);
            showComments(flexy);
            pendingPanels.add(COMMENTS_PANEL);
            pendingPanels.add(DESCRIPTION_PANEL);
            closeReplacedPanels(flexy);
            settlePanels();
            // The player keeps the side-panel width until something resizes it.
            schedule(dispatchResize, 100);
            report('applied');
            return true;
        }

        function run() {
            if (!enabled) return;
            patchFlags();
            fixWatchFlexy();
        }

        function queueRun() {
            if (frameQueued || !enabled) return;
            frameQueued = true;
            requestFrame(() => {
                frameQueued = false;
                run();
            });
        }

        function handleNavigation() {
            run();
            for (const delay of LATE_RETRY_DELAYS) schedule(run, delay);
        }

        // On a hard load core/early-switches.js can turn this on before
        // YouTube's head scripts have created ytcfg. Every script the parser
        // runs adds nodes, so the first mutation batch after ytcfg exists
        // wraps its set() and patches the flags, long before the app reads
        // them. Gone at DOMContentLoaded: a page with no ytcfg by then never
        // gets one.
        let configWatch = null;
        function stopConfigWatch() {
            configWatch?.disconnect();
            configWatch = null;
            documentRef?.removeEventListener?.('DOMContentLoaded', lastConfigLook);
        }

        function configReady() {
            let cfg;
            try { cfg = root.ytcfg; } catch (error) { return false; }
            if (!cfg) return false;
            stopConfigWatch();
            if (!enabled) return true;
            wrapConfigSet();
            patchFlags();
            return true;
        }

        function lastConfigLook() {
            if (!configReady()) stopConfigWatch();
        }

        function watchForConfig() {
            if (configWatch || !MutationObserverCtor) return;
            const target = documentRef?.documentElement;
            if (!target) return;
            let cfg;
            try { cfg = root.ytcfg; } catch (error) { return; }
            if (cfg) return;
            configWatch = new MutationObserverCtor(() => { configReady(); });
            configWatch.observe(target, { childList: true, subtree: true });
            documentRef.addEventListener?.('DOMContentLoaded', lastConfigLook);
        }

        function attach() {
            wrapConfigSet();
            watchForConfig();
            for (const type of NAVIGATION_EVENTS) documentRef?.addEventListener?.(type, handleNavigation);
        }

        function detach() {
            for (const type of NAVIGATION_EVENTS) documentRef?.removeEventListener?.(type, handleNavigation);
            stopConfigWatch();
            observer?.disconnect();
            observer = null;
            observedFlexy = null;
            frameQueued = false;
        }

        /**
         * Turn the override on or off. `flagText` is the user's field; it is
         * re-read on every call so an edit applies without a reload.
         */
        function setEnabled(next, flagText) {
            if (!next) {
                if (!enabled) return;
                enabled = false;
                detach();
                restoreFlags();
                switched = false;
                pendingPanels.clear();
                lastFlagText = null;
                report('off');
                return;
            }
            const text = String(flagText ?? '');
            // The bridge calls this on every sealed change from any feature.
            // Same switch, same list: nothing to do, and re-running the fix
            // here would close panels the user opened since.
            if (enabled && text === lastFlagText) return;
            lastFlagText = text;
            const firstEnable = !enabled;
            enabled = true;
            if (firstEnable) attach();
            // Hand back anything a narrowed list no longer covers, then apply
            // the current one. Both happen in this task, so no page code reads
            // the flags in between.
            restoreFlags();
            flags = resolveFlags(text);
            patchFlags();
            if (!fixWatchFlexy() && lastStatus !== 'applied') report('waiting');
        }

        return Object.freeze({
            setEnabled,
            run,
            getFlags: () => flags.slice(),
            isEnabled: () => enabled
        });
    }

    Object.assign(core, {
        createClassicWatchLayout,
        classicWatchLayout: Object.freeze({
            DEFAULT_FLAGS,
            LAYOUT_ATTRIBUTES,
            parseFlagOverrides,
            resolveFlags,
            isSidePanelLayout
        })
    });

    // Page-world script: `module` could be a page's own shim, so gate on the
    // Node runtime, which a page can't fake (same rule as core/audio-track.js).
    const inNodeTests = typeof process !== 'undefined'
        && !!process.versions
        && typeof process.versions.node === 'string';
    if (inNodeTests && typeof module !== 'undefined' && module.exports) {
        module.exports = { createClassicWatchLayout, DEFAULT_FLAGS, LAYOUT_ATTRIBUTES, parseFlagOverrides, resolveFlags, isSidePanelLayout };
    }
})();
