(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.audioTrackSelection) return;

    const ATTRS = Object.freeze({
        language: 'data-ytkit-audio-language',
        descriptive: 'data-ytkit-audio-description',
        original: 'data-ytkit-audio-original',
        status: 'data-ytkit-audio-track-status',
        syncOffset: 'data-ytkit-audio-sync-offset',
        autoGain: 'data-ytkit-audio-auto-gain',
        highPass: 'data-ytkit-audio-high-pass',
        equalizer: 'data-ytkit-audio-eq',
        eqLow: 'data-ytkit-audio-eq-low',
        eqMid: 'data-ytkit-audio-eq-mid',
        eqHigh: 'data-ytkit-audio-eq-high'
    });
    const AUDIO_SYNC_OFFSET_LIMIT_MS = 500;
    const AUDIO_EQ_GAIN_LIMIT_DB = 12;
    const TASK_ID = 'ytkit-main:audioTrack';
    const RETRY_DELAYS = Object.freeze([0, 150, 400, 1000, 1800, 3000]);
    const TASK_EVENTS = Object.freeze([
        'loadedmetadata',
        'canplay',
        'playing',
        'player-state',
        'navigate',
        'page-data'
    ]);

    function normalizeLanguageTag(value) {
        const raw = String(value || '').trim().replace(/_/g, '-');
        if (!raw || !/^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/i.test(raw)) return '';
        return raw.toLowerCase();
    }

    function normalizeAudioSyncOffset(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return 0;
        return Math.max(
            -AUDIO_SYNC_OFFSET_LIMIT_MS,
            Math.min(AUDIO_SYNC_OFFSET_LIMIT_MS, Math.round(parsed))
        );
    }

    function normalizeAudioEqGain(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return 0;
        return Math.max(
            -AUDIO_EQ_GAIN_LIMIT_DB,
            Math.min(AUDIO_EQ_GAIN_LIMIT_DB, Math.round(parsed))
        );
    }

    function getText(value) {
        if (typeof value === 'string') return value;
        if (!value || typeof value !== 'object') return '';
        if (typeof value.simpleText === 'string') return value.simpleText;
        if (Array.isArray(value.runs)) {
            return value.runs.map(run => String(run?.text || '')).join('');
        }
        return '';
    }

    function getTrackLabel(track) {
        return getText(track?.displayName)
            || getText(track?.name)
            || getText(track?.label)
            || '';
    }

    function getTrackLanguage(track) {
        return normalizeLanguageTag(
            track?.languageCode
            || track?.langCode
            || track?.language
            || track?.languageTag
            || ''
        );
    }

    function getTrackId(track) {
        return String(track?.id || track?.audioTrackId || track?.key || '');
    }

    function isDescriptiveTrack(track) {
        if (!track || typeof track !== 'object') return false;
        if (track.isDescriptive === true
            || track.isAudioDescription === true
            || track.audioDescription === true) return true;
        const traits = Array.isArray(track.characteristics)
            ? track.characteristics.join(' ')
            : String(track.characteristics || '');
        return /describes-video|audio.?description|descriptive/i.test(
            `${traits} ${getTrackLabel(track)}`
        );
    }

    function isOriginalTrack(track) {
        if (!track || typeof track !== 'object') return false;
        if (track.isOriginal === true || track.isDefault === true || track.audioIsDefault === true) {
            return true;
        }
        return /(?:^|\W)original(?:\W|$)/i.test(getTrackLabel(track))
            || /\.4(?=\.|$)/.test(getTrackId(track));
    }

    function firstMatching(tracks, predicate) {
        for (const track of tracks) {
            if (track && predicate(track)) return track;
        }
        return null;
    }

    function selectLanguageTrack(tracks, language, preferDescriptive = false) {
        const target = normalizeLanguageTag(language);
        if (!target || !Array.isArray(tracks) || tracks.length === 0) return null;
        const primary = target.split('-')[0];
        const exact = track => getTrackLanguage(track) === target;
        const primaryMatch = track => getTrackLanguage(track).split('-')[0] === primary;
        const described = track => isDescriptiveTrack(track);
        const standard = track => !isDescriptiveTrack(track);

        const passes = preferDescriptive
            ? [
                track => exact(track) && described(track),
                track => primaryMatch(track) && described(track),
                track => exact(track) && standard(track),
                track => primaryMatch(track) && standard(track)
            ]
            : [
                track => exact(track) && standard(track),
                track => primaryMatch(track) && standard(track),
                exact,
                primaryMatch
            ];
        for (const predicate of passes) {
            const match = firstMatching(tracks, predicate);
            if (match) return match;
        }
        return null;
    }

    function selectOriginalTrack(tracks) {
        if (!Array.isArray(tracks) || tracks.length === 0) return null;
        return firstMatching(tracks, isOriginalTrack);
    }

    function sameTrack(left, right) {
        if (!left || !right) return false;
        if (left === right) return true;
        const leftId = getTrackId(left);
        const rightId = getTrackId(right);
        return !!leftId && leftId === rightId;
    }

    function readPreference(documentRef) {
        const root = documentRef?.documentElement;
        if (!root?.getAttribute) return null;
        if (root.getAttribute(ATTRS.original) === 'on') {
            return { mode: 'original', language: '', preferDescriptive: false };
        }
        const language = normalizeLanguageTag(root.getAttribute(ATTRS.language));
        if (!language) return null;
        return {
            mode: 'language',
            language,
            preferDescriptive: root.getAttribute(ATTRS.descriptive) === 'on'
        };
    }

    function createAudioTrackBridge(options = {}) {
        const documentRef = options.document || globalThis.document;
        const taskManager = options.taskManager || core.playerTaskManager;
        const getPlayer = options.getPlayer || (() => (
            documentRef?.getElementById?.('movie_player')
            || documentRef?.querySelector?.('.html5-video-player')
            || null
        ));

        function writeBridgeStatus(status, detail = '') {
            try {
                documentRef?.documentElement?.setAttribute?.(
                    ATTRS.status,
                    detail ? `${status}:${detail}` : status
                );
            } catch (_) {
                // reason: status is diagnostic only; selection must remain best-effort
            }
        }

        function apply(context = {}) {
            const preference = readPreference(documentRef);
            if (!preference) return true;
            const player = context.player || getPlayer();
            if (!player || typeof player.getAvailableAudioTracks !== 'function'
                || typeof player.setAudioTrack !== 'function') return false;

            let tracks;
            try {
                tracks = player.getAvailableAudioTracks();
            } catch (_) {
                return false;
            }
            if (!Array.isArray(tracks) || tracks.length === 0) return false;

            const target = preference.mode === 'original'
                ? selectOriginalTrack(tracks)
                : selectLanguageTrack(
                    tracks,
                    preference.language,
                    preference.preferDescriptive
                );
            if (!target) {
                writeBridgeStatus('no-match', preference.mode === 'original' ? 'original' : preference.language);
                return true;
            }

            const current = typeof player.getAudioTrack === 'function'
                ? player.getAudioTrack()
                : null;
            if (sameTrack(current, target)) {
                writeBridgeStatus('selected', getTrackId(target) || getTrackLanguage(target));
                return true;
            }

            try {
                player.setAudioTrack(target);
                writeBridgeStatus('selected', getTrackId(target) || getTrackLanguage(target));
                return true;
            } catch (_) {
                writeBridgeStatus('retry');
                return false;
            }
        }

        function sync(reason = 'attribute') {
            const preference = readPreference(documentRef);
            if (!preference) {
                taskManager?.cancel?.(TASK_ID);
                writeBridgeStatus('off');
                return false;
            }
            if (!taskManager?.schedule) return apply();
            taskManager.schedule(TASK_ID, apply, {
                owner: 'ytkit-main',
                reason,
                delay: 0,
                needsVideo: true,
                needsPlayer: true,
                maxAttempts: RETRY_DELAYS.length,
                retryDelays: RETRY_DELAYS,
                events: TASK_EVENTS
            });
            return true;
        }

        function destroy() {
            taskManager?.cancel?.(TASK_ID);
        }

        return { apply, sync, destroy, readPreference: () => readPreference(documentRef) };
    }

    const audioTrackSelection = Object.freeze({
        ATTRS,
        AUDIO_SYNC_OFFSET_LIMIT_MS,
        AUDIO_EQ_GAIN_LIMIT_DB,
        TASK_ID,
        normalizeLanguageTag,
        normalizeAudioSyncOffset,
        normalizeAudioEqGain,
        getTrackLabel,
        getTrackLanguage,
        isDescriptiveTrack,
        isOriginalTrack,
        selectLanguageTrack,
        selectOriginalTrack,
        sameTrack,
        readPreference,
        createAudioTrackBridge
    });
    core.audioTrackSelection = audioTrackSelection;

    // MAIN-world scripts share the PAGE's global scope. `typeof module`
    // is only a Node/CommonJS signal here; a page that defined its own
    // CommonJS shim would have had it overwritten with bridge internals.
    // Gate on the Node runtime itself, which a page can never fake.
    const inNodeTests = typeof process !== 'undefined'
        && !!process.versions
        && typeof process.versions.node === 'string';
    if (inNodeTests && typeof module !== 'undefined' && module.exports) {
        module.exports = audioTrackSelection;
    }
})();
