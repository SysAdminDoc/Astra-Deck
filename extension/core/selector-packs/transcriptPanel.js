(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('transcriptPanel')) return;

    // YouTube currently serves two transcript engagement-panel identifiers.
    // Keep them as one named surface so every transcript consumer follows the
    // same rollout-aware chain and selector-health diagnostics record drift.
    registry.set('transcriptPanel', Object.freeze({
        surface: 'transcriptPanel',
        stable: Object.freeze([
            'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]',
            '[data-target-id="PAmodern_transcript_view"]'
        ]),
        fallback: Object.freeze([
            'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"]',
            'ytd-transcript-renderer'
        ]),
        captureEvidence: Object.freeze([
            'tests/fixtures/transcript-panel-classic.html',
            'tests/fixtures/transcript-panel-modern.html'
        ]),
        lastVerified: '2026-07-14',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Legacy searchable transcript and PAmodern_transcript_view rollout shapes.'
    }));
})();
