(() => {
    'use strict';

    // extension/core/selector-packs/engagementPanels.js
    //
    // Container for chapters, transcript, AI summary, clips, and any
    // other engagement panel that opens on the right of the watch
    // page. Feature code should resolve the section root first, then
    // narrow to a panel via the panel-id attribute on the renderer.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('engagementPanels')) return;

    const hooks = Object.freeze({
        'panel.aiSummary': Object.freeze({
            stable: Object.freeze([
                'ytd-engagement-panel-section-list-renderer[target-id*="summary" i]',
                'ytd-engagement-panel-section-list-renderer[panel-target-id*="summary" i]'
            ]),
            fallback: Object.freeze([
                'ytd-ai-summary-renderer',
                '[class*="ai-summary" i]'
            ])
        }),
        'panel.aiContext': Object.freeze({
            stable: Object.freeze([
                'ytd-info-panel-content-renderer:has([icon="info_outline"])',
                'ytd-factoid-renderer'
            ]),
            fallback: Object.freeze([
                'ytd-engagement-panel-section-list-renderer[target-id*="context" i]',
                '[data-panel-type="context"]'
            ])
        }),
        'panel.gemini': Object.freeze({
            stable: Object.freeze([
                'ytd-engagement-panel-section-list-renderer[target-id*="gemini" i]',
                'ytd-engagement-panel-section-list-renderer[panel-target-id*="gemini" i]'
            ]),
            fallback: Object.freeze([
                '[data-gemini]',
                '[data-ai-type="gemini"]'
            ])
        })
    });

    registry.set('engagementPanels', Object.freeze({
        surface: 'engagementPanels',
        stable: Object.freeze([
            'ytd-engagement-panel-section-list-renderer',
            '#panels ytd-engagement-panel-section-list-renderer'
        ]),
        fallback: Object.freeze([
            'ytd-engagement-panel-section-list-renderer.style-scope',
            'ytd-engagement-panel-title-header-renderer'
        ]),
        captureEvidence: Object.freeze([
            'mhtml/WatchPage.mhtml',
            'Worldwide Societal Collapse... - YouTube.mhtml'
        ]),
        lastVerified: '2026-05-19',
        highChurn: true,
        needsFreshCapture: false,
        hooks,
        notes: 'Chapters, transcript, AI summary, and clips live here.'
    }));
})();
