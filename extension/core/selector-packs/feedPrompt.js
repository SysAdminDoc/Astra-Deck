(() => {
    'use strict';

    // extension/core/selector-packs/feedPrompt.js
    //
    // YouTube experiments increasingly insert prompts, identity nudges, and
    // feedback surveys into the same feed surfaces as videos. This canary
    // keeps prompt-generation and survey variants visible to selector health.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('feedPrompt')) return;

    registry.set('feedPrompt', Object.freeze({
        surface: 'feedPrompt',
        stable: Object.freeze(['ytd-feedback-survey-renderer', 'ytd-feedback-question-renderer', 'ytd-identity-prompt-footer-renderer']),
        fallback: Object.freeze(['ytd-feedback-elicitation-single-question-renderer', 'ytd-feedback-option-renderer', 'ytd-feed-nudge-renderer']),
        captureEvidence: Object.freeze([
            'mhtml/YouTube.mhtml',
            'mhtml/SearchResults.mhtml'
        ]),
        lastVerified: '2026-06-29',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Prompt, survey, and identity-nudge feed inserts are tracked as their own high-churn surface.'
    }));
})();
