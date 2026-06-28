(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.__playerCoreVersion >= 2) return;

    const DEFAULT_RETRY_DELAYS = Object.freeze([0, 150, 400, 1000, 1800, 3000]);
    const DEFAULT_EVENTS = Object.freeze(['loadedmetadata', 'canplay', 'player-state', 'navigate', 'page-data']);

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

    function isMainVideoTarget(target, root = getDefaultDocument()) {
        const video = getMainVideoElement(root);
        if (video && target === video) return true;
        if (!target) return false;
        return !!target.classList?.contains?.('html5-main-video');
    }

    function toEventSet(events) {
        const list = Array.isArray(events) && events.length ? events : DEFAULT_EVENTS;
        return new Set(list);
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
            const delay = nextDelay(task);
            task.attempt += 1;
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

        function install() {
            if (installed || !root?.addEventListener || !win?.addEventListener) return;
            installed = true;
            root.addEventListener('loadstart', onMediaEvent, true);
            root.addEventListener('loadedmetadata', onMediaEvent, true);
            root.addEventListener('canplay', onMediaEvent, true);
            root.addEventListener('playing', onMediaEvent, true);
            root.addEventListener('visibilitychange', onVisibilityChange, true);
            win.addEventListener('yt-navigate-start', onNavigateStart);
            win.addEventListener('yt-navigate-finish', () => bumpRoute('navigate'));
            win.addEventListener('yt-page-data-updated', () => notify('page-data'));
            win.addEventListener('yt-player-updated', () => notify('player-state'));
            win.addEventListener('yt-player-state-change', () => notify('player-state'));
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

    const playerTaskManager = core.playerTaskManager || createPlayerTaskManager();

    Object.assign(core, {
        __playerCoreVersion: 2,
        createPlayerTaskManager,
        getMainVideoElement,
        getMoviePlayerElement,
        getPlayerProgressBar,
        isMainVideoTarget,
        playerTaskManager,
        schedulePlayerTask: playerTaskManager.schedule,
        cancelPlayerTask: playerTaskManager.cancel,
        cancelPlayerTasksByOwner: playerTaskManager.cancelOwner
    });
})();
