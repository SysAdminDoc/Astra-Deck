(() => {
    'use strict';

    // extension/features/video-filters/index.js
    //
    // v4.17.0 second feature peel from extension/ytkit.js. Owns the
    // CSS-`filter` chain applied to .html5-main-video, driven by these
    // seven settings-schema keys (category `playback-audio` in the
    // v4.6.0 schema; sub-toggles inherit from videoVisualFilters):
    //
    //   videoVisualFilters  (boolean) master toggle
    //   vvfBrightness       (number)  0-200%   default 100
    //   vvfContrast         (number)  0-200%   default 100
    //   vvfSaturation       (number)  0-200%   default 100
    //   vvfHue              (number)  -180-180 deg, default 0
    //   vvfGrayscale        (number)  0-100%   default 0
    //   vvfSepia            (number)  0-100%   default 0
    //
    // Like v4.13.0's subtitles peel, this slice exports a single pure
    // helper buildVideoFilterCss(settings) that ytkit.js's existing
    // _apply() delegates to. The byte-stable inline fallback in ytkit.js
    // is exercised by parity tests so the userscript path keeps working
    // unchanged while the extension path delegates.

    function clamp(value, min, max) {
        const n = Number(value);
        if (!Number.isFinite(n)) return min;
        return Math.max(min, Math.min(max, n));
    }

    const FIELD_BOUNDS = Object.freeze({
        vvfBrightness: { min: 0,    max: 200, fallback: 100 },
        vvfContrast:   { min: 0,    max: 200, fallback: 100 },
        vvfSaturation: { min: 0,    max: 200, fallback: 100 },
        vvfHue:        { min: -180, max: 180, fallback: 0 },
        vvfGrayscale:  { min: 0,    max: 100, fallback: 0 },
        vvfSepia:      { min: 0,    max: 100, fallback: 0 }
    });

    function readField(settings, key) {
        const bounds = FIELD_BOUNDS[key];
        const raw = settings && settings[key];
        if (raw === undefined || raw === null) return bounds.fallback;
        return clamp(raw, bounds.min, bounds.max);
    }

    // Pure: same input → same CSS. The CSS shape is preserved
    // byte-for-byte against the previous inline ytkit.js implementation
    // so existing visual regressions stay quiet.
    function buildVideoFilterCss(settings) {
        const s = settings || {};
        const filterChain = [
            'brightness(' + readField(s, 'vvfBrightness') + '%)',
            'contrast('   + readField(s, 'vvfContrast')   + '%)',
            'saturate('   + readField(s, 'vvfSaturation') + '%)',
            'hue-rotate(' + readField(s, 'vvfHue')        + 'deg)',
            'grayscale('  + readField(s, 'vvfGrayscale')  + '%)',
            'sepia('      + readField(s, 'vvfSepia')      + '%)'
        ].join(' ');
        return '.html5-main-video { filter: ' + filterChain + ' !important; }';
    }

    // Detect whether the current settings render an effective no-op (all
    // defaults). Callers can short-circuit injection in that case.
    function isVideoFilterIdentity(settings) {
        const s = settings || {};
        for (const key of Object.keys(FIELD_BOUNDS)) {
            const bounds = FIELD_BOUNDS[key];
            const value = readField(s, key);
            if (value !== bounds.fallback) return false;
        }
        return true;
    }

    const featureSpec = Object.freeze({
        id: 'videoVisualFilters',
        category: 'playback-audio',
        buildCss: buildVideoFilterCss,
        isIdentity: isVideoFilterIdentity
    });

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.videoFilters = Object.freeze({
        buildVideoFilterCss,
        isVideoFilterIdentity,
        featureSpec,
        FIELD_BOUNDS
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            buildVideoFilterCss, isVideoFilterIdentity,
            featureSpec, FIELD_BOUNDS
        };
    }
})();
