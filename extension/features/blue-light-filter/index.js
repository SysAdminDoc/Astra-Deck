(() => {
    'use strict';

    // extension/features/blue-light-filter/index.js
    //
    // v4.18.0 third feature peel from extension/ytkit.js. Owns the warm-
    // tint RGBA computation that drives the blueLightFilter overlay,
    // driven by two settings-schema keys (category `playback-audio`):
    //
    //   blueLightFilter      (boolean) master toggle
    //   blueLightIntensity   (number)  10-80 (% sliders surface 10..80)
    //
    // Like the v4.13.0 and v4.17.0 peels, this slice exports a pure
    // helper that ytkit.js's existing _apply() delegates to. The DOM
    // overlay element + lifecycle (init/destroy) stay in the monolith.
    //
    // Tint curve (preserved byte-for-byte against the prior inline
    // implementation):
    //   intensity = clampedIntensity / 100         // 0.10 .. 0.80
    //   r = 255
    //   g = 180 - intensity * 80
    //   b = 60  - intensity * 60
    //   a = intensity * 0.35

    function clamp(value, min, max) {
        const n = Number(value);
        if (!Number.isFinite(n)) return min;
        return Math.max(min, Math.min(max, n));
    }

    function readIntensity(settings) {
        const raw = settings && settings.blueLightIntensity;
        if (raw === undefined || raw === null) return 30;        // schema default
        return clamp(raw, 10, 80);
    }

    // Pure: same intensity → same rgba string. The arithmetic mirrors
    // ytkit.js's prior inline expression (intensity / 100, then the
    // 180-80i / 60-60i / 0.35i triple), with `Math.round` on the
    // integer channels to preserve the original behaviour.
    function buildBlueLightRgba(settings) {
        const intensityPct = readIntensity(settings);
        const intensity = intensityPct / 100;
        const r = 255;
        const g = Math.round(180 - intensity * 80);
        const b = Math.round(60  - intensity * 60);
        const a = intensity * 0.35;
        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
    }

    // Convenience: the fixed inline CSS the monolith applies to the
    // overlay element. Exposed so a future popup-side preview can
    // render a swatch without duplicating the rules.
    const OVERLAY_FIXED_CSS = Object.freeze({
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: '2147483646',
        mixBlendMode: 'multiply',
        transition: 'background 0.3s'
    });

    const featureSpec = Object.freeze({
        id: 'blueLightFilter',
        category: 'playback-audio',
        buildRgba: buildBlueLightRgba,
        OVERLAY_FIXED_CSS,
        // v4.47.0 NF5 wave 1: register-only; inline ytkit.js owns
        // mount/remove of the warm-tint overlay element.
        init() { /* reason: wave-1 register-only; inline ytkit.js owns init */ },
        destroy() { /* reason: wave-1 register-only; inline ytkit.js owns destroy */ }
    });

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.blueLightFilter = Object.freeze({
        buildBlueLightRgba,
        OVERLAY_FIXED_CSS,
        featureSpec
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
        module.exports = { buildBlueLightRgba, OVERLAY_FIXED_CSS, featureSpec };
    }
})();
