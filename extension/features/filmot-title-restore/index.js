(() => {
    'use strict';

    // Puts a title back on a playlist row whose video is gone. YouTube only
    // draws those rows after "Show unavailable videos", so nothing here runs
    // until the user has asked to see them.
    //
    // The user's Filmot key stays in the credential vault, so the lookup runs
    // in the background and this side only ever sees video IDs and results.
    // With no key, or in the userscript, which has no vault, a row links to
    // Filmot's own page for that video instead.

    const STATE_PENDING = 'pending';
    const STATE_RESTORED = 'restored';
    const STATE_LINK = 'link';
    const SLOT_CLASS = 'ytkit-filmot-title';
    const CACHE_KEY = 'ytkit-filmot-cache';
    const CACHE_MAX = 2000;
    const FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
    const MISSING_TTL_MS = 24 * 60 * 60 * 1000;
    const BATCH_SIZE = 50;
    // Just over the background's per-tab spacing of 1.5 seconds.
    const BATCH_DELAY_MS = 1600;
    const BUDGET_PER_MINUTE = 10;
    const FAILURE_PAUSE_MS = 5 * 60 * 1000;
    const VIDEO_ID = /^[\w-]{11}$/;
    const UNAVAILABLE_TITLE = /^\[[^\]]*\]$/;
    // A credit is the user's money: these won't get better on a retry.
    const LINK_ONLY_CODES = new Set(['CREDENTIAL_MISSING', 'FILMOT_REJECTED_KEY', 'FILMOT_NOT_GRANTED']);

    function filmotVideoUrl(videoId) {
        return `https://filmot.com/video/${videoId}`;
    }

    // A deleted lockup has no title link, duration or channel. An older row
    // keeps a bracketed placeholder ("[Deleted video]", localized) as its title.
    function isUnavailableRow(read) {
        if (!read || !VIDEO_ID.test(read.videoId || '')) return false;
        if (read.channel || read.durationText) return false;
        return !read.title || UNAVAILABLE_TITLE.test(read.title);
    }

    function createFilmotTitleRestoreFeature(deps = {}) {
        const {
            DiagnosticLog = null,
            ExternalApiHealth = null,
            addNavigateRule = () => {},
            removeNavigateRule = () => {},
            addScopedMutationRule = () => {},
            removeScopedMutationRule = () => {},
            injectStyle = () => null,
            storageReadJSON = (_key, fallback) => fallback,
            storageWriteJSON = () => {},
            sendRuntimeMessage = null,
            readPlaylistPageRow = () => null,
            rowSelector = '',
            PageTypes = { PLAYLIST: 'playlist' },
            now = () => Date.now(),
            setTimer = (fn, ms) => setTimeout(fn, ms),
            clearTimer = (id) => clearTimeout(id),
            getDocument = () => document,
            t = (_key, fallback) => fallback
        } = deps;

        let _active = false;
        let _styleEl = null;
        let _cache = null;
        let _flushTimer = null;
        let _generation = 0;
        let _inFlight = false;
        let _linkOnly = false;
        let _pausedUntil = 0;
        const _queue = new Map();
        const _budget = { start: 0, count: 0 };

        function _readCache() {
            if (_cache) return _cache;
            try { _cache = storageReadJSON(CACHE_KEY, {}) || {}; } catch { _cache = {}; } // reason: a rebuildable cache starts over empty
            return _cache;
        }

        function _cached(videoId) {
            const entry = _readCache()[videoId];
            if (!entry) return null;
            const ttl = entry.title ? FOUND_TTL_MS : MISSING_TTL_MS;
            return now() - (entry.ts || 0) < ttl ? entry : null;
        }

        function _remember(videoId, record) {
            const cache = _readCache();
            cache[videoId] = { ts: now(), title: record?.title || '', channel: record?.channel || '', date: record?.date || '' };
            const keys = Object.keys(cache);
            if (keys.length > CACHE_MAX) {
                keys.sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0));
                for (const key of keys.slice(0, keys.length - CACHE_MAX)) delete cache[key];
            }
        }

        function _persist() {
            try { storageWriteJSON(CACHE_KEY, _readCache()); } catch { /* reason: the next page look-up refills it */ }
        }

        function _clearRow(row) {
            row.querySelector?.(`.${SLOT_CLASS}`)?.remove();
            delete row.dataset.ytkitFilmot;
            delete row.dataset.ytkitFilmotId;
        }

        function _render(row, videoId, record) {
            // The row may have been recycled for another video while waiting.
            if (row.dataset.ytkitFilmotId !== videoId) return;
            const heading = row.querySelector('h3');
            if (!heading) return;
            heading.querySelector(`.${SLOT_CLASS}`)?.remove();
            const doc = getDocument();
            const link = doc.createElement('a');
            link.className = SLOT_CLASS;
            link.href = filmotVideoUrl(videoId);
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            if (record?.title) {
                link.textContent = record.title;
                link.title = t('filmotRestoredTooltip', 'Title restored from Filmot. Click to open its page for this video.');
                const details = [record.channel, record.date].filter(Boolean).join(' · ');
                if (details) {
                    const meta = doc.createElement('span');
                    meta.className = 'ytkit-filmot-meta';
                    meta.textContent = details;
                    link.append(meta);
                }
                row.dataset.ytkitFilmot = STATE_RESTORED;
            } else {
                link.textContent = t('filmotLookupLink', 'Look this video up on Filmot');
                row.dataset.ytkitFilmot = STATE_LINK;
            }
            heading.append(link);
        }

        function _settleQueue(ids) {
            for (const videoId of ids) {
                const rows = _queue.get(videoId) || [];
                _queue.delete(videoId);
                for (const row of rows) _render(row, videoId, null);
            }
        }

        function _withinBudget() {
            const current = now();
            if (current - _budget.start > 60000) {
                _budget.start = current;
                _budget.count = 0;
            }
            return _budget.count < BUDGET_PER_MINUTE;
        }

        function _schedule(delay = BATCH_DELAY_MS) {
            // Asked-for ids stay queued until the answer, so a second send
            // now would pay for them twice. The answer schedules the next one.
            if (_flushTimer !== null || _inFlight || !_queue.size) return;
            _flushTimer = setTimer(_flush, delay);
        }

        async function _flush() {
            _flushTimer = null;
            if (!_active || _inFlight || !_queue.size) return;
            if (_linkOnly || !sendRuntimeMessage || now() < _pausedUntil) {
                _settleQueue([..._queue.keys()]);
                return;
            }
            if (!_withinBudget()) {
                _schedule(Math.max(BATCH_DELAY_MS, 60000 - (now() - _budget.start)));
                return;
            }
            _budget.count += 1;
            const ids = [..._queue.keys()].slice(0, BATCH_SIZE);
            const generation = _generation;
            let response = null;
            let failure = null;
            _inFlight = true;
            try {
                response = await sendRuntimeMessage({ type: 'YTKIT_FILMOT_LOOKUP', ids });
            } catch (error) {
                failure = error;
            }
            if (!_active || generation !== _generation) return;
            _inFlight = false;
            if (response?.ok) {
                const found = new Map((response.videos || []).map((video) => [video.id, video]));
                for (const videoId of ids) {
                    const record = found.get(videoId) || null;
                    _remember(videoId, record);
                    const rows = _queue.get(videoId) || [];
                    _queue.delete(videoId);
                    for (const row of rows) _render(row, videoId, record);
                }
                _persist();
                ExternalApiHealth?.recordSuccess?.('filmot', { cacheState: 'fresh' });
            } else {
                _onLookupFailed(failure || response?.error, ids);
            }
            _schedule();
        }

        function _onLookupFailed(error, ids) {
            const code = error?.code || '';
            if (LINK_ONLY_CODES.has(code)) _linkOnly = true;
            else _pausedUntil = now() + FAILURE_PAUSE_MS;
            _settleQueue(ids);
            // No key isn't a failure of the service, it's the mode the user chose.
            if (code === 'CREDENTIAL_MISSING') return;
            ExternalApiHealth?.recordFailure?.('filmot', error, { status: error?.status });
            DiagnosticLog?.record?.('FilmotTitleRestore', `Lookup failed: ${code || error?.message || 'unknown'}`);
        }

        function _scan() {
            if (!_active || !rowSelector) return;
            for (const row of getDocument().querySelectorAll(rowSelector)) {
                const read = readPlaylistPageRow(row);
                const unavailable = isUnavailableRow(read);
                if (row.dataset.ytkitFilmot && (!unavailable || row.dataset.ytkitFilmotId !== read?.videoId)) {
                    _clearRow(row);
                }
                if (!unavailable || row.dataset.ytkitFilmot) continue;
                const videoId = read.videoId;
                row.dataset.ytkitFilmot = STATE_PENDING;
                row.dataset.ytkitFilmotId = videoId;
                const cached = _cached(videoId);
                if (cached) {
                    _render(row, videoId, cached);
                    continue;
                }
                const waiting = _queue.get(videoId) || [];
                waiting.push(row);
                _queue.set(videoId, waiting);
            }
            _schedule();
        }

        return {
            id: 'filmotTitleRestore',
            name: t('feature_filmotTitleRestore_name', 'Restore Deleted Video Titles'),
            description: t('feature_filmotTitleRestore_desc', 'Puts titles back on deleted and private videos in a playlist, after you turn on Show unavailable videos in the playlist\'s menu. Sends those video IDs to Filmot using your own API key, set in the toolbar popup. Without a key, each row links to Filmot\'s page for that video.'),
            group: 'Playlists',
            icon: 'history',
            pages: [PageTypes.PLAYLIST],
            init() {
                _active = true;
                _linkOnly = false;
                _inFlight = false;
                _generation += 1;
                _styleEl = injectStyle(`
                    .${SLOT_CLASS}{display:block;color:var(--yt-sys-color-baseline--text-primary,var(--yt-spec-text-primary,inherit));font-size:1.4rem;line-height:2rem;font-weight:500;text-decoration:none;}
                    .${SLOT_CLASS}:hover{text-decoration:underline;}
                    [data-ytkit-filmot="link"] .${SLOT_CLASS}{color:var(--yt-sys-color-baseline--call-to-action,var(--yt-spec-call-to-action,#3ea6ff));font-weight:400;}
                    .ytkit-filmot-meta{display:block;margin-top:2px;color:var(--yt-sys-color-baseline--text-secondary,var(--yt-spec-text-secondary,inherit));font-size:1.2rem;line-height:1.8rem;font-weight:400;}
                    [data-ytkit-filmot="restored"] a#video-title{display:none;}
                `, this.id, true);
                addNavigateRule(this.id, _scan);
                addScopedMutationRule(this.id, rowSelector, _scan);
                _scan();
            },
            destroy() {
                _active = false;
                _generation += 1;
                if (_flushTimer !== null) clearTimer(_flushTimer);
                _flushTimer = null;
                _queue.clear();
                removeNavigateRule(this.id);
                removeScopedMutationRule(this.id);
                for (const row of getDocument().querySelectorAll('[data-ytkit-filmot]')) _clearRow(row);
                _styleEl?.remove?.();
                _styleEl = null;
            }
        };
    }

    const api = Object.freeze({ createFilmotTitleRestoreFeature, isUnavailableRow, filmotVideoUrl, CACHE_KEY });
    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.filmotTitleRestore = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
