(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.__playerCoreVersion >= 3) return;

    const DEFAULT_RETRY_DELAYS = Object.freeze([0, 150, 400, 1000, 1800, 3000]);
    const DEFAULT_EVENTS = Object.freeze(['loadedmetadata', 'canplay', 'player-state', 'navigate', 'page-data']);
    const DEFAULT_VIDEO_FRAME_BUDGET_MS = 1;
    const MAX_CONSECUTIVE_OVER_BUDGET_FRAMES = 3;

    function getDefaultDocument() {
        return typeof document !== 'undefined' ? document : null;
    }

    function getDefaultWindow() {
        return typeof window !== 'undefined' ? window : globalThis;
    }

    function getMoviePlayerElement(root = getDefaultDocument()) {
        if (!root) return null;
        if (typeof root.getElementById === 'function') {
            const byId = root.getElementById('movie_player');
            if (byId) return byId;
        }
        return root.querySelector?.('#movie_player') || null;
    }

    function getMainVideoElement(root = getDefaultDocument()) {
        if (!root?.querySelector) return null;
        return root.querySelector('video.html5-main-video')
            || root.querySelector('#movie_player video')
            || null;
    }

    function getPlayerProgressBar(root = getDefaultDocument()) {
        if (!root?.querySelector) return null;
        const paddedBar = root.querySelector('.ytp-progress-bar-padding .ytp-progress-bar');
        return paddedBar || root.querySelector('.ytp-progress-bar') || null;
    }

    // The native YouTube volume slider is linear in amplitude, which makes
    // most of its travel feel compressed near the quiet end. Keep the curve
    // in the shared player core so the extension and userscript use the same
    // mapping and the persisted value remains the user-facing slider position.
    const VOLUME_CURVE_MIN_DB = -40;
    const VOLUME_CURVE_DB_RANGE = 0 - VOLUME_CURVE_MIN_DB;
    // YouTube's player API reports integer percentages. This tolerance lets
    // the controller recognise the rounded echo of its own write without
    // swallowing a nearby user slider movement.
    const VOLUME_CURVE_INTERNAL_EPSILON = 0.012;

    function clampVolumeUnit(value, fallback = 0) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return Math.min(1, Math.max(0, Number(fallback) || 0));
        return Math.min(1, Math.max(0, numeric));
    }

    function sliderToVolumeGain(position) {
        const normalized = clampVolumeUnit(position);
        if (normalized <= 0) return 0;
        const db = VOLUME_CURVE_MIN_DB + normalized * VOLUME_CURVE_DB_RANGE;
        return Math.pow(10, db / 20);
    }

    function volumeGainToSlider(gain) {
        const normalized = clampVolumeUnit(gain);
        if (normalized <= 0) return 0;
        const db = 20 * Math.log10(normalized);
        return clampVolumeUnit((db - VOLUME_CURVE_MIN_DB) / VOLUME_CURVE_DB_RANGE);
    }

    function readVideoVolume(video, fallback = 1) {
        return clampVolumeUnit(video?.volume, clampVolumeUnit(fallback, 1));
    }

    function createVolumeCurveController(options = {}) {
        const root = options.document || getDefaultDocument();
        const getVideo = options.getVideo || (() => getMainVideoElement(root));
        const getPlayer = options.getPlayer || (() => getMoviePlayerElement(root));
        const states = new WeakMap();
        let enabled = Boolean(options.enabled);

        function getState(video) {
            if (!video) return null;
            let state = states.get(video);
            if (!state) {
                state = { logical: 1, gain: 1, hasWrite: false };
                states.set(video, state);
            }
            return state;
        }

        function isOwnWrite(video, observedGain) {
            const state = video ? states.get(video) : null;
            return !!state?.hasWrite
                && Math.abs(observedGain - state.gain) <= VOLUME_CURVE_INTERNAL_EPSILON;
        }

        function setLogicalVolume(video = getVideo(), position = 1, writeOptions = {}) {
            if (!video) return { ok: false, logical: clampVolumeUnit(position, 1), gain: null };
            const logical = clampVolumeUnit(position, 1);
            const gain = enabled ? sliderToVolumeGain(logical) : logical;
            const state = getState(video);
            state.logical = logical;
            state.gain = gain;
            state.hasWrite = true;

            const player = writeOptions.player || getPlayer();
            try {
                if (typeof player?.setVolume === 'function') {
                    player.setVolume(Math.round(gain * 100));
                }
            } catch (_) {
                // reason: the optional player API may not be available yet
            }
            try {
                video.volume = gain;
            } catch (_) {
                // reason: a replaced media element can reject a late write
            }
            if (writeOptions.unmute && logical > 0) {
                try { player?.unMute?.(); } catch (_) { /* reason: optional player API can reject before initialization */ }
                try { if (video.muted) video.muted = false; } catch (_) { /* reason: replaced video can reject a late mute write */ }
            }

            const appliedGain = readVideoVolume(video, gain);
            state.gain = appliedGain;
            return { ok: true, logical, gain, appliedGain };
        }

        function readLogicalVolume(video = getVideo(), fallback = 1) {
            if (!video) return clampVolumeUnit(fallback, 1);
            const observedGain = readVideoVolume(video, fallback);
            const state = states.get(video);
            if (isOwnWrite(video, observedGain)) return state.logical;
            return observedGain;
        }

        function handleVolumeChange(video = getVideo(), changeOptions = {}) {
            if (!video) return { ok: false, logical: 1, gain: null };
            const observedGain = readVideoVolume(video);
            const state = states.get(video);
            if (isOwnWrite(video, observedGain)) {
                return { ok: true, internal: true, logical: state.logical, gain: observedGain };
            }

            // A native slider change is a logical position. Re-map that raw
            // position once; never pass the already-remapped gain back through
            // volumeBoost, which lives in the separate Web Audio graph.
            const logical = observedGain;
            if (!enabled) {
                const nextState = getState(video);
                nextState.logical = logical;
                nextState.gain = observedGain;
                nextState.hasWrite = false;
                return { ok: true, internal: false, logical, gain: observedGain };
            }
            return {
                ...setLogicalVolume(video, logical, changeOptions),
                internal: false,
                remapped: true
            };
        }

        function sync(video = getVideo(), syncOptions = {}) {
            if (!video) return { ok: false, logical: 1, gain: null };
            const observedGain = readVideoVolume(video);
            const state = states.get(video);
            const logical = isOwnWrite(video, observedGain)
                ? state.logical
                : observedGain;
            return setLogicalVolume(video, logical, syncOptions);
        }

        function setEnabled(nextValue, enableOptions = {}) {
            const nextEnabled = Boolean(nextValue);
            if (nextEnabled === enabled) return { changed: false, enabled };

            const video = getVideo();
            let logical = null;
            if (video) {
                const observedGain = readVideoVolume(video);
                const state = states.get(video);
                if (isOwnWrite(video, observedGain)) {
                    logical = state.logical;
                } else {
                    // Enabling interprets the existing linear slider position
                    // as logical. Disabling converts the current curved gain
                    // back to the equivalent linear slider position.
                    logical = nextEnabled ? observedGain : volumeGainToSlider(observedGain);
                }
            }

            enabled = nextEnabled;
            if (video && logical !== null) {
                return {
                    changed: true,
                    enabled,
                    ...setLogicalVolume(video, logical, enableOptions)
                };
            }
            return { changed: true, enabled };
        }

        return {
            isEnabled: () => enabled,
            setEnabled,
            setLogicalVolume,
            readLogicalVolume,
            handleVolumeChange,
            sync,
            sliderToGain: sliderToVolumeGain,
            gainToSlider: volumeGainToSlider
        };
    }

    function isMainVideoTarget(target, root = getDefaultDocument()) {
        const video = getMainVideoElement(root);
        if (video && target === video) return true;
        if (!target) return false;
        return !!target.classList?.contains?.('html5-main-video');
    }

    function getBufferedAhead(video, currentTime) {
        const ranges = video?.buffered;
        if (!ranges || !Number.isFinite(currentTime)) return null;
        try {
            for (let index = 0; index < ranges.length; index += 1) {
                const start = Number(ranges.start(index));
                const end = Number(ranges.end(index));
                if (Number.isFinite(start) && Number.isFinite(end)
                    && currentTime >= start - 0.25 && currentTime <= end) {
                    return Math.max(0, end - currentTime);
                }
            }
        } catch (_) {
            return null;
        }
        return null;
    }

    function getLivePlaybackMetrics(video) {
        if (!video) return null;
        const currentTime = Number(video.currentTime);
        if (!Number.isFinite(currentTime)) return null;
        let latencySeconds = null;
        try {
            const seekable = video.seekable;
            if (seekable && seekable.length > 0) {
                const liveEdge = Number(seekable.end(seekable.length - 1));
                if (Number.isFinite(liveEdge)) latencySeconds = Math.max(0, liveEdge - currentTime);
            }
        } catch (_) {
            latencySeconds = null;
        }
        const bufferSeconds = getBufferedAhead(video, currentTime);
        if (latencySeconds === null && bufferSeconds === null) return null;
        return Object.freeze({ latencySeconds, bufferSeconds });
    }

    function toEventSet(events) {
        const list = Array.isArray(events) && events.length ? events : DEFAULT_EVENTS;
        return new Set(list);
    }

    function computeFrameLuminance(pixels) {
        if (!pixels || typeof pixels.length !== 'number' || pixels.length < 4) return null;
        let total = 0;
        let count = 0;
        for (let index = 0; index + 2 < pixels.length; index += 4) {
            total += (0.2126 * Number(pixels[index])
                + 0.7152 * Number(pixels[index + 1])
                + 0.0722 * Number(pixels[index + 2])) / 255;
            count += 1;
        }
        return count > 0 && Number.isFinite(total) ? total / count : null;
    }

    function createVideoFrameSampler(options = {}) {
        const getVideo = options.getVideo || (() => getMainVideoElement(options.document || getDefaultDocument()));
        const onFrame = typeof options.onFrame === 'function' ? options.onFrame : () => {};
        const onError = typeof options.onError === 'function' ? options.onError : () => {};
        const onUnsupported = typeof options.onUnsupported === 'function' ? options.onUnsupported : () => {};
        const onBudgetExceeded = typeof options.onBudgetExceeded === 'function' ? options.onBudgetExceeded : () => {};
        const readNow = typeof options.now === 'function'
            ? options.now
            : () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
                ? performance.now()
                : Date.now());
        const budgetMs = Number.isFinite(Number(options.budgetMs))
            ? Math.max(0, Number(options.budgetMs))
            : DEFAULT_VIDEO_FRAME_BUDGET_MS;
        let active = false;
        let currentVideo = null;
        let callbackId = null;
        let generation = 0;
        let lastSampleMs = 0;
        let overBudgetFrames = 0;

        function cancelPending() {
            if (callbackId === null || callbackId === undefined) return;
            try { currentVideo?.cancelVideoFrameCallback?.(callbackId); }
            catch (_) { /* reason: a replaced video may no longer own the callback */ }
            callbackId = null;
        }

        function stop() {
            active = false;
            generation += 1;
            cancelPending();
            currentVideo = null;
            lastSampleMs = 0;
            overBudgetFrames = 0;
        }

        function requestNext(token) {
            if (!active || !currentVideo || token !== generation) return false;
            if (typeof currentVideo.requestVideoFrameCallback !== 'function') {
                active = false;
                onUnsupported(currentVideo);
                return false;
            }
            const video = currentVideo;
            try {
                callbackId = video.requestVideoFrameCallback((metadataNow, metadata) => {
                    callbackId = null;
                    if (!active || currentVideo !== video || token !== generation) return;
                    const startedAt = readNow();
                    try {
                        onFrame(video, metadataNow, metadata);
                    } catch (error) {
                        stop();
                        onError(error, video);
                        return;
                    }
                    lastSampleMs = Math.max(0, Number(readNow()) - Number(startedAt));
                    if (lastSampleMs > budgetMs) {
                        overBudgetFrames += 1;
                        if (overBudgetFrames >= MAX_CONSECUTIVE_OVER_BUDGET_FRAMES) {
                            stop();
                            onBudgetExceeded(lastSampleMs, video);
                            return;
                        }
                    } else {
                        overBudgetFrames = 0;
                    }
                    requestNext(token);
                });
                return true;
            } catch (error) {
                stop();
                onError(error, video);
                return false;
            }
        }

        function start(video = null) {
            stop();
            currentVideo = video || getVideo();
            if (!currentVideo) return false;
            active = true;
            return requestNext(generation);
        }

        function sync() {
            if (!active) return start();
            const nextVideo = getVideo();
            if (nextVideo !== currentVideo) return start(nextVideo);
            return true;
        }

        return {
            start,
            stop,
            sync,
            isRunning: () => active,
            getVideo: () => currentVideo,
            getLastSampleMs: () => lastSampleMs,
            getOverBudgetFrames: () => overBudgetFrames,
            budgetMs
        };
    }

    function createPlayerTaskManager(options = {}) {
        const root = options.document || getDefaultDocument();
        const win = options.window || getDefaultWindow();
        const setTimer = options.setTimeout || globalThis.setTimeout?.bind(globalThis);
        const clearTimer = options.clearTimeout || globalThis.clearTimeout?.bind(globalThis);
        const getVideo = options.getVideo || (() => getMainVideoElement(root));
        const getPlayer = options.getPlayer || (() => getMoviePlayerElement(root));
        const tasks = new Map();
        let routeToken = 0;
        let installed = false;

        function canUseTimers() {
            return typeof setTimer === 'function' && typeof clearTimer === 'function';
        }

        function cancelTimer(task) {
            if (task.timer === null || task.timer === undefined) return;
            clearTimer(task.timer);
            task.timer = null;
        }

        function nextDelay(task) {
            const delays = task.retryDelays.length ? task.retryDelays : DEFAULT_RETRY_DELAYS;
            return delays[Math.min(task.attempt, delays.length - 1)];
        }

        function shouldAutoRun(task, reason) {
            return task.events.has('*') || task.events.has(reason);
        }

        function retry(task, reason, token) {
            if (task.attempt >= task.maxAttempts) return;
            task.attempt += 1;
            const delay = nextDelay(task);
            scheduleInternal(task, reason, delay, token);
        }

        function settle(task, result, reason, token) {
            if (token !== routeToken || task.cancelled) return;
            if (result === false || result === 'retry') {
                retry(task, reason, token);
            }
        }

        function runTask(task, reason, token) {
            task.timer = null;
            if (token !== routeToken || task.cancelled) return;

            const video = getVideo();
            const player = getPlayer();
            if ((task.needsVideo && !video) || (task.needsPlayer && !player)) {
                retry(task, reason, token);
                return;
            }

            let result;
            try {
                result = task.callback({
                    id: task.id,
                    owner: task.owner,
                    reason,
                    attempt: task.attempt,
                    routeToken: token,
                    video,
                    player,
                    stale: () => token !== routeToken || task.cancelled
                });
            } catch (error) {
                task.lastError = error;
                retry(task, reason, token);
                return;
            }

            if (result && typeof result.then === 'function') {
                result.then(value => settle(task, value, reason, token))
                    .catch((error) => {
                        task.lastError = error;
                        retry(task, reason, token);
                    });
            } else {
                settle(task, result, reason, token);
            }
        }

        function scheduleInternal(task, reason, delay, token = routeToken) {
            if (!canUseTimers()) return;
            cancelTimer(task);
            const wait = Number.isFinite(Number(delay)) ? Math.max(0, Number(delay)) : 0;
            task.timer = setTimer(() => runTask(task, reason, token), wait);
        }

        function schedule(id, callback, taskOptions = {}) {
            if (!id || typeof callback !== 'function') return null;
            let task = tasks.get(id);
            if (!task) {
                task = {
                    id,
                    owner: taskOptions.owner || id,
                    callback,
                    events: toEventSet(taskOptions.events),
                    retryDelays: Array.isArray(taskOptions.retryDelays) ? taskOptions.retryDelays.slice() : DEFAULT_RETRY_DELAYS.slice(),
                    maxAttempts: Number.isFinite(Number(taskOptions.maxAttempts)) ? Math.max(1, Number(taskOptions.maxAttempts)) : DEFAULT_RETRY_DELAYS.length,
                    needsVideo: taskOptions.needsVideo !== false,
                    needsPlayer: taskOptions.needsPlayer === true,
                    timer: null,
                    attempt: 0,
                    cancelled: false,
                    lastError: null
                };
                tasks.set(id, task);
            } else {
                task.callback = callback;
                task.owner = taskOptions.owner || task.owner || id;
                task.events = toEventSet(taskOptions.events || [...task.events]);
                task.retryDelays = Array.isArray(taskOptions.retryDelays) ? taskOptions.retryDelays.slice() : task.retryDelays;
                task.maxAttempts = Number.isFinite(Number(taskOptions.maxAttempts)) ? Math.max(1, Number(taskOptions.maxAttempts)) : task.maxAttempts;
                task.needsVideo = taskOptions.needsVideo !== undefined ? taskOptions.needsVideo !== false : task.needsVideo;
                task.needsPlayer = taskOptions.needsPlayer !== undefined ? taskOptions.needsPlayer === true : task.needsPlayer;
                task.cancelled = false;
            }
            task.attempt = 0;
            scheduleInternal(task, taskOptions.reason || 'manual', taskOptions.delay || 0);
            return task;
        }

        function cancel(id) {
            const task = tasks.get(id);
            if (!task) return false;
            task.cancelled = true;
            cancelTimer(task);
            tasks.delete(id);
            return true;
        }

        function cancelOwner(owner) {
            for (const [id, task] of tasks) {
                if (task.owner === owner) cancel(id);
            }
        }

        function notify(reason = 'manual') {
            for (const task of tasks.values()) {
                if (!shouldAutoRun(task, reason)) continue;
                task.cancelled = false;
                task.attempt = 0;
                scheduleInternal(task, reason, 0);
            }
        }

        function bumpRoute(reason = 'navigate') {
            routeToken += 1;
            for (const task of tasks.values()) {
                cancelTimer(task);
                task.attempt = 0;
            }
            notify(reason);
        }

        function onMediaEvent(event) {
            if (!isMainVideoTarget(event?.target, root)) return;
            notify(event.type);
        }

        function onNavigateStart() {
            routeToken += 1;
            for (const task of tasks.values()) {
                cancelTimer(task);
                task.attempt = 0;
            }
        }

        function onVisibilityChange() {
            notify('visibility');
        }

        // Named handlers (not inline arrows) so destroy() can actually remove
        // them — otherwise each manager instance leaks these four window
        // listeners and a destroy/install cycle stacks duplicate notify pumps.
        function onNavigateFinish() { bumpRoute('navigate'); }
        function onPageDataUpdated() { notify('page-data'); }
        function onPlayerUpdated() { notify('player-state'); }
        function onPlayerStateChange() { notify('player-state'); }

        function install() {
            if (installed || !root?.addEventListener || !win?.addEventListener) return;
            installed = true;
            root.addEventListener('loadstart', onMediaEvent, true);
            root.addEventListener('loadedmetadata', onMediaEvent, true);
            root.addEventListener('canplay', onMediaEvent, true);
            root.addEventListener('playing', onMediaEvent, true);
            root.addEventListener('visibilitychange', onVisibilityChange, true);
            win.addEventListener('yt-navigate-start', onNavigateStart);
            win.addEventListener('yt-navigate-finish', onNavigateFinish);
            win.addEventListener('yt-page-data-updated', onPageDataUpdated);
            win.addEventListener('yt-player-updated', onPlayerUpdated);
            win.addEventListener('yt-player-state-change', onPlayerStateChange);
        }

        function destroy() {
            for (const task of tasks.values()) cancelTimer(task);
            tasks.clear();
            if (!installed || !root?.removeEventListener || !win?.removeEventListener) return;
            root.removeEventListener('loadstart', onMediaEvent, true);
            root.removeEventListener('loadedmetadata', onMediaEvent, true);
            root.removeEventListener('canplay', onMediaEvent, true);
            root.removeEventListener('playing', onMediaEvent, true);
            root.removeEventListener('visibilitychange', onVisibilityChange, true);
            win.removeEventListener('yt-navigate-start', onNavigateStart);
            win.removeEventListener('yt-navigate-finish', onNavigateFinish);
            win.removeEventListener('yt-page-data-updated', onPageDataUpdated);
            win.removeEventListener('yt-player-updated', onPlayerUpdated);
            win.removeEventListener('yt-player-state-change', onPlayerStateChange);
            installed = false;
        }

        function snapshot() {
            return {
                routeToken,
                tasks: [...tasks.values()].map(task => ({
                    id: task.id,
                    owner: task.owner,
                    attempt: task.attempt,
                    hasTimer: task.timer !== null && task.timer !== undefined,
                    events: [...task.events]
                }))
            };
        }

        install();
        return { schedule, cancel, cancelOwner, notify, bumpRoute, destroy, snapshot };
    }

    const volumeCurveController = core.volumeCurveController || createVolumeCurveController();
    const playerTaskManager = core.playerTaskManager || createPlayerTaskManager();

    Object.assign(core, {
        __playerCoreVersion: 4,
        createPlayerTaskManager,
        createVideoFrameSampler,
        computeFrameLuminance,
        createVolumeCurveController,
        getLivePlaybackMetrics,
        getMainVideoElement,
        getMoviePlayerElement,
        getPlayerProgressBar,
        isMainVideoTarget,
        playerTaskManager,
        schedulePlayerTask: playerTaskManager.schedule,
        cancelPlayerTask: playerTaskManager.cancel,
        cancelPlayerTasksByOwner: playerTaskManager.cancelOwner,
        volumeCurveController,
        sliderToVolumeGain,
        volumeCurve: Object.freeze({
            minDb: VOLUME_CURVE_MIN_DB,
            sliderToGain: sliderToVolumeGain,
            gainToSlider: volumeGainToSlider,
            createController: createVolumeCurveController,
            controller: volumeCurveController
        })
    });
})();
