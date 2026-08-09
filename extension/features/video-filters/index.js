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

    const PHOTOSENSITIVE_BOUNDS = Object.freeze({
        photosensitiveFlashThreshold: { min: 0.05, max: 0.8, fallback: 0.2 },
        photosensitiveDimPercent: { min: 10, max: 80, fallback: 35 }
    });
    const PHOTOSENSITIVE_FRAME_BUDGET_MS = 1;
    const PHOTOSENSITIVE_FLASH_HOLD_MS = 900;
    const PHOTOSENSITIVE_EVENT_COOLDOWN_MS = 250;

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

    function readPhotosensitiveSetting(settings, key) {
        const bounds = PHOTOSENSITIVE_BOUNDS[key];
        const raw = settings && settings[key];
        if (raw === undefined || raw === null) return bounds.fallback;
        return clamp(raw, bounds.min, bounds.max);
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

    function sampleVideoLuminance(video, canvas, context) {
        if (!video || !canvas || !context) return null;
        if (canvas.width !== 2) canvas.width = 2;
        if (canvas.height !== 2) canvas.height = 2;
        context.drawImage(video, 0, 0, 2, 2);
        return computeFrameLuminance(context.getImageData(0, 0, 2, 2).data);
    }

    function detectPhotosensitiveFlash(previousLuminance, currentLuminance, threshold) {
        const current = Number(currentLuminance);
        if (!Number.isFinite(current)) return { luminance: null, delta: null, triggered: false };
        const previous = Number(previousLuminance);
        if (!Number.isFinite(previous)) return { luminance: current, delta: 0, triggered: false };
        const delta = Math.abs(current - previous);
        return {
            luminance: current,
            delta,
            triggered: delta >= readPhotosensitiveSetting({ photosensitiveFlashThreshold: threshold }, 'photosensitiveFlashThreshold')
        };
    }

    function buildPhotosensitiveOverlayCss() {
        return `
            .ytkit-photosensitive-alert {
                position: absolute;
                inset: 0;
                z-index: 2147483000;
                display: grid;
                place-items: center;
                padding: 24px;
                box-sizing: border-box;
                background: rgba(0, 0, 0, var(--ytkit-photosensitive-dim, 0.35));
                color: #fff;
                font: 600 14px/1.4 Roboto, system-ui, sans-serif;
                text-align: center;
                text-shadow: 0 1px 3px #000;
                pointer-events: none;
            }
            .ytkit-photosensitive-alert[hidden] { display: none !important; }
            .ytkit-photosensitive-alert__label {
                max-width: min(90%, 420px);
                padding: 8px 12px;
                border: 1px solid rgba(255, 255, 255, 0.35);
                border-radius: 6px;
                background: rgba(0, 0, 0, 0.52);
            }
            html:not([dark]) .ytkit-photosensitive-alert {
                background: rgba(15, 23, 42, var(--ytkit-photosensitive-dim, 0.35));
                color: #f8fafc;
                text-shadow: 0 1px 3px #000;
            }
        `;
    }

    const featureSpec = Object.freeze({
        id: 'videoVisualFilters',
        category: 'playback-audio',
        pageScopes: Object.freeze(['watch', 'shorts', 'embed']),
        buildCss: buildVideoFilterCss,
        isIdentity: isVideoFilterIdentity,
        // v4.47.0 NF5 wave 1: register-only.
        init() { /* reason: wave-1 register-only; inline ytkit.js owns init */ },
        destroy() { /* reason: wave-1 register-only; inline ytkit.js owns destroy */ }
    });

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.videoFilters = Object.freeze({
        buildVideoFilterCss,
        isVideoFilterIdentity,
        readPhotosensitiveSetting,
        computeFrameLuminance,
        sampleVideoLuminance,
        detectPhotosensitiveFlash,
        buildPhotosensitiveOverlayCss,
        PHOTOSENSITIVE_BOUNDS,
        PHOTOSENSITIVE_FRAME_BUDGET_MS,
        PHOTOSENSITIVE_FLASH_HOLD_MS,
        PHOTOSENSITIVE_EVENT_COOLDOWN_MS,
        featureSpec,
        FIELD_BOUNDS
    });

    // v4.47.0 NF5 wave 1: register with the v4.7.0 lifecycle module.
    try {
        if (globalThis.YTKitCore && typeof globalThis.YTKitCore.getLifecycle === 'function') {
            globalThis.YTKitCore.getLifecycle().defineFeature(featureSpec);
        }
    } catch (_) {
        // reason: defineFeature throws on duplicate id; ignore re-registers
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            buildVideoFilterCss, isVideoFilterIdentity,
            readPhotosensitiveSetting, computeFrameLuminance,
            sampleVideoLuminance, detectPhotosensitiveFlash,
            buildPhotosensitiveOverlayCss, PHOTOSENSITIVE_BOUNDS,
            PHOTOSENSITIVE_FRAME_BUDGET_MS, PHOTOSENSITIVE_FLASH_HOLD_MS,
            PHOTOSENSITIVE_EVENT_COOLDOWN_MS, featureSpec, FIELD_BOUNDS
        };
    }
})();
