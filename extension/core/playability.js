(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.classifyAgeRestriction) return;

    const AGE_RESTRICTION_STATUSES = new Set([
        'AGE_VERIFICATION_REQUIRED',
        'AGE_CHECK_REQUIRED',
        'CONTENT_CHECK_REQUIRED'
    ]);
    const AGE_REASON_PATTERN = /\b(age|age[- ]?restricted|confirm your age|verify your age|mature content)\b/i;

    function readReason(playabilityStatus = {}) {
        const candidates = [
            playabilityStatus.reason,
            playabilityStatus.messages?.join?.(' '),
            playabilityStatus.errorScreen?.playerErrorMessageRenderer?.reason?.simpleText,
            playabilityStatus.errorScreen?.playerErrorMessageRenderer?.subreason?.simpleText,
            playabilityStatus.errorScreen?.playerLegacyDesktopYpcOfferRenderer?.itemTitle
        ];
        return candidates.find((value) => typeof value === 'string' && value.trim())?.trim() || '';
    }

    function classifyAgeRestriction(playerResponse, currentVideoId = '') {
        if (!playerResponse || typeof playerResponse !== 'object') {
            return Object.freeze({ blocked: false, drifted: false, reason: '', status: '', videoId: '', code: 'missing-response' });
        }
        const videoId = typeof playerResponse.videoDetails?.videoId === 'string'
            ? playerResponse.videoDetails.videoId
            : '';
        if (currentVideoId && videoId && currentVideoId !== videoId) {
            return Object.freeze({ blocked: false, drifted: false, reason: '', status: '', videoId, code: 'stale-response' });
        }
        const playabilityStatus = playerResponse.playabilityStatus;
        if (!playabilityStatus || typeof playabilityStatus !== 'object') {
            return Object.freeze({ blocked: false, drifted: false, reason: '', status: '', videoId, code: 'missing-playability-status' });
        }
        const status = typeof playabilityStatus.status === 'string'
            ? playabilityStatus.status.trim().toUpperCase()
            : '';
        const reason = readReason(playabilityStatus);
        const explicitStatus = AGE_RESTRICTION_STATUSES.has(status);
        const reasonMatch = AGE_REASON_PATTERN.test(reason);
        const blocked = explicitStatus || (status === 'LOGIN_REQUIRED' && reasonMatch);
        const knownUnblocked = status === 'OK' || status === 'LIVE_STREAM_OFFLINE' || status === 'UNPLAYABLE';
        const drifted = Boolean(status) && !blocked && !knownUnblocked;
        return Object.freeze({
            blocked,
            drifted,
            reason,
            status,
            videoId,
            code: blocked ? 'age-restricted' : (drifted ? 'unknown-blocked-status' : 'not-age-restricted')
        });
    }

    Object.assign(core, {
        AGE_RESTRICTION_STATUSES,
        classifyAgeRestriction
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { AGE_RESTRICTION_STATUSES, classifyAgeRestriction, readReason };
    }
})();
