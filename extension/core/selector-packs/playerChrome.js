(() => {
    'use strict';

    // extension/core/selector-packs/playerChrome.js
    //
    // Player chrome (controls strip, progress bar, right controls).
    // The fallback list deliberately bundles legacy + new-player
    // ("Delhi modern", action-pill, overflow-panel) candidates so the
    // resolver still hits during the A/B transition. The 2026-06-04
    // stopped-loading Chrome Stable capture proves Delhi + overflow
    // selectors; action-pill/action-container remain unmatched
    // fallback watchlist entries until that rollout variant appears.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('playerChrome')) return;

    registry.set('playerChrome', Object.freeze({
        surface: 'playerChrome',
        stable: Object.freeze([
            '.ytp-chrome-bottom',
            '.ytp-right-controls',
            '.ytp-progress-bar',
            '.ytp-progress-bar-padding'
        ]),
        fallback: Object.freeze([
            '.ytp-delhi-modern .ytp-chrome-bottom',
            '.ytp-delhi-modern',
            '.ytp-overflow-panel',
            '.ytp-action-pill',
            '.ytp-actions-container'
        ]),
        // The two rollouts this surface has to serve at once. Every selector
        // here already appears in the chains above; this only names which
        // rollout each one belongs to, so a diagnostics bundle can say which
        // player the reporter is actually looking at rather than leaving the
        // maintainer to guess from a version number that is the same either way.
        primaryVariant: 'classic',
        variants: Object.freeze({
            classic: Object.freeze([
                '.ytp-chrome-bottom',
                '.ytp-right-controls',
                '.ytp-progress-bar',
                '.ytp-progress-bar-padding'
            ]),
            delhi: Object.freeze([
                '.ytp-delhi-modern .ytp-chrome-bottom',
                '.ytp-delhi-modern',
                '.ytp-overflow-panel',
                '.ytp-action-pill',
                '.ytp-actions-container'
            ])
        }),
        captureEvidence: Object.freeze([
            'mhtml/WatchPage.mhtml',
            'Worldwide Societal Collapse... - YouTube.mhtml',
            'HARDENING.md#h21'
        ]),
        lastVerified: '2026-06-04',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Player redesign transition surface; 2026-06-04 stopped-loading Chrome Stable capture confirmed Delhi shell, overflow panel, and time-wrapper selectors. Action-pill/action-container remain fallback watchlist entries until captured.'
    }));
})();
