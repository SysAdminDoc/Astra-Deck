// YTKit v3.0.0 - Ad Blocker Phase 2: CSS / DOM Observer / SSAP
// Runs in world: "ISOLATED" at document_start
// Operates on shared DOM, uses gm-compat shim for settings

(async function() {
    'use strict';

    const gm = window._gmCompat;
    await gm.preload();
    const GM_getValue = gm.GM_getValue.bind(gm);

    // Cross-world bridge: stats from MAIN world
    let _ytabStats = { blocked: 0, pruned: 0, ssapSkipped: 0, active: false };
    window.addEventListener('ytab-stats', function(e) {
        if (e.detail) _ytabStats = e.detail;
    });

    // Send commands to MAIN world
    function ytabCommand(action, data) {
        window.dispatchEvent(new CustomEvent('ytab-command', {
            detail: { action, data }
        }));
    }

    // Cosmetic CSS Injection
    const COSMETIC_SELECTORS = [
        '#player-ads',
        '#merch-shelf',
        '#panels > ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
        '[target-id="engagement-panel-ads"]',
        '.video-ads',
        '.ytp-ad-module',
        '.ytp-ad-overlay-slot',
        '.ytp-ad-overlay-container',
        '.ytp-ad-overlay-image',
        '.ytp-ad-text-overlay',
        '.ytp-ad-progress',
        '.ytp-ad-progress-list',
        '.ytp-ad-player-overlay',
        '.ytp-ad-player-overlay-layout',
        '.ytp-ad-image-overlay',
        '.ytp-ad-action-interstitial',
        '.ytp-ad-skip-button-container',
        '.ytp-ad-skip-button',
        '.ytp-ad-skip-button-slot',
        '.ytp-ad-preview-container',
        '.ytp-ad-message-container',
        '.ytp-ad-persistent-progress-bar-container',
        '.ytp-suggested-action',
        '.ytp-suggested-action-badge',
        '.ytp-visit-advertiser-link',
        '.masthead-ad-control',
        '.ad-div',
        '.pyv-afc-ads-container',
        '.ad-container',
        '.ad-showing > .ad-interrupting',
        '.ytd-ad-slot-renderer',
        '.ytd-in-feed-ad-layout-renderer',
        '.ytd-promoted-video-renderer',
        '.ytd-search-pyv-renderer',
        '.ytd-compact-promoted-video-renderer',
        'div.ytd-ad-slot-renderer',
        'div.ytd-in-feed-ad-layout-renderer',
        'ytd-ad-slot-renderer',
        'ytd-in-feed-ad-layout-renderer',
        'ytd-display-ad-renderer',
        'ytd-promoted-video-renderer',
        'ytd-compact-promoted-video-renderer',
        'ytd-promoted-sparkles-web-renderer',
        'ytd-promoted-sparkles-text-search-renderer',
        'ytd-video-masthead-ad-advertiser-info-renderer',
        'ytd-video-masthead-ad-v3-renderer',
        'ytd-primetime-promo-renderer',
        'ytd-search-pyv-renderer',
        'ytd-banner-promo-renderer',
        'ytd-banner-promo-renderer-background',
        'ytd-action-companion-ad-renderer',
        'ytd-companion-slot-renderer',
        'ytd-player-legacy-desktop-watch-ads-renderer',
        'ytd-brand-video-singleton-renderer',
        'ytd-brand-video-shelf-renderer',
        'ytd-statement-banner-renderer',
        'ytd-mealbar-promo-renderer',
        'ytd-background-promo-renderer',
        'ytd-movie-offer-module-renderer',
        'ytm-promoted-sparkles-web-renderer',
        'ytm-companion-ad-renderer',
        'ad-slot-renderer',
        '[layout*="display-ad-"]',
        '[layout="display-ad-layout-top-landscape-image"]',
        '[layout="display-ad-layout-top-portrait-image"]',
        '[layout="display-ad-layout-bottom-landscape-image"]',
        'ytd-rich-item-renderer:has(> #content > ytd-ad-slot-renderer)',
        'ytd-rich-item-renderer:has(ytd-ad-slot-renderer)',
        'ytd-rich-item-renderer:has(ytd-in-feed-ad-layout-renderer)',
        'ytd-rich-item-renderer:has(ytd-display-ad-renderer)',
        'ytd-rich-item-renderer:has(ytd-promoted-video-renderer)',
        'ytd-rich-item-renderer:has([layout*="display-ad-"])',
        'ytd-rich-item-renderer:has(> .ytd-rich-item-renderer > ytd-ad-slot-renderer)',
        'ytd-rich-section-renderer:has(ytd-ad-slot-renderer)',
        'ytd-rich-section-renderer:has(ytd-statement-banner-renderer)',
        'ytd-rich-section-renderer:has(ytd-brand-video-shelf-renderer)',
        '.grid.ytd-browse > #primary > .style-scope > .ytd-rich-grid-renderer > .ytd-rich-grid-renderer > .ytd-ad-slot-renderer',
        '.ytd-rich-item-renderer.style-scope > .ytd-rich-item-renderer > .ytd-ad-slot-renderer.style-scope',
        'ytd-item-section-renderer > .ytd-item-section-renderer > ytd-ad-slot-renderer.style-scope',
        '.ytd-section-list-renderer > .ytd-item-section-renderer > ytd-search-pyv-renderer.ytd-item-section-renderer',
        'ytd-search-pyv-renderer.ytd-item-section-renderer',
        '.ytd-watch-flexy > .ytd-watch-next-secondary-results-renderer > ytd-ad-slot-renderer',
        '.ytd-watch-flexy > .ytd-watch-next-secondary-results-renderer > ytd-ad-slot-renderer.ytd-watch-next-secondary-results-renderer',
        'ytd-merch-shelf-renderer',
        '#description-inner > ytd-merch-shelf-renderer',
        '#description-inner > ytd-merch-shelf-renderer > #main.ytd-merch-shelf-renderer',
        '.ytd-watch-flexy > ytd-merch-shelf-renderer',
        '.ytd-watch-flexy > ytd-merch-shelf-renderer > #main.ytd-merch-shelf-renderer',
        '#shorts-inner-container > .ytd-shorts:has(> .ytd-reel-video-renderer > ytd-ad-slot-renderer)',
        '.ytReelMetapanelViewModelHost > .ytReelMetapanelViewModelMetapanelItem > .ytShortsSuggestedActionViewModelStaticHost',
        'lazy-list > ad-slot-renderer',
        'ytm-rich-item-renderer > ad-slot-renderer',
        'ytm-companion-slot[data-content-type] > ytm-companion-ad-renderer',
        'ytd-popup-container > .ytd-popup-container > #contentWrapper > .ytd-popup-container[position-type="OPEN_POPUP_POSITION_BOTTOMLEFT"]',
        '#mealbar\\:3 > ytm-mealbar.mealbar-promo-renderer',
        'yt-mealbar-promo-renderer',
        'ytmusic-mealbar-promo-renderer',
        'ytd-enforcement-message-view-model',
        'tp-yt-paper-dialog:has(> ytd-popup-container)',
        '#feed-pyv-container',
        '#feedmodule-PRO',
        '#homepage-chrome-side-promo',
        '#watch-channel-brand-div',
        '#watch-buy-urls',
        '#watch-branded-actions',
        'ytd-movie-renderer',
        '.sparkles-light-cta',
        '.badge-style-type-ad',
        '.GoogleActiveViewElement',
        '.ad-showing .ytp-ad-player-overlay-layout',
        '.ad-showing .video-ads',
        '.ad-showing .ytp-ad-module',
        '.ad-showing .ytp-ad-image-overlay',
        '.ad-showing .ytp-ad-text-overlay',
        '.ad-showing .ytp-ad-overlay-slot',
        '.ad-showing .ytp-ad-skip-button-container',
        '.ad-showing .ytp-ad-preview-container',
        '.ad-showing .ytp-ad-message-container',
        '.ad-showing .ytp-ad-player-overlay-instream-info',
        '.ad-showing .ytp-ad-persistent-progress-bar-container',
        'yt-slimline-survey-view-model',
        'lockup-attachments-view-model:has(yt-slimline-survey-view-model)',
        '.ytSlimlineSurveyViewModelHost',
        'ytd-inline-survey-renderer',
        'ytd-single-option-survey-renderer',
        '.ytwTopLandscapeImageLayoutViewModelHost',
        '.ytwFeedAdMetadataViewModelHost',
        '.ytwAdButtonViewModelHost',
        '.ytwTopBannerImageTextIconButtonedLayoutViewModelHostMetadata',
        '.ytwAdImageViewModelHostImageContainer',
        'ytd-rich-item-renderer[rendered-from-rich-grid]:has(.yt-badge-shape--ad)',
        'ytd-rich-item-renderer[rendered-from-rich-grid]:has([href*="googleadservices.com"])',
        'ytd-rich-item-renderer:has([href*="doubleclick.net"])',
    ];

    const HARDCODED_CSS = COSMETIC_SELECTORS.join(',\n');

    const _CSS_DANGEROUS_PATTERNS = /(?:url\s*\(|@import|expression\s*\(|javascript\s*:|\\00|\\u00|-moz-binding|behavior\s*:|var\s*\(\s*--[^)]*url|image\s*\(|image-set\s*\(|paint\s*\(|env\s*\(|cross-fade\s*\()/i;
    const _CSS_BLOCK_INJECTION = /[{}`]/;

    function sanitizeCSSSelectors(selectorStr) {
        if (!selectorStr || typeof selectorStr !== 'string') return '';
        return selectorStr.split('\n')
            .map(line => line.trim().replace(/^,+|,+$/g, '').trim())
            .filter(line => {
                if (!line) return false;
                if (_CSS_DANGEROUS_PATTERNS.test(line)) return false;
                if (_CSS_BLOCK_INJECTION.test(line)) return false;
                return true;
            })
            .join(',\n');
    }

    let cosmeticEl = null;
    function updateCSS(extraSelectors) {
        const sanitizedExtra = sanitizeCSSSelectors(extraSelectors);
        const allCSS = HARDCODED_CSS + (sanitizedExtra ? ',\n' + sanitizedExtra : '');
        const css = allCSS + ' { display: none !important; visibility: hidden !important; height: 0 !important; max-height: 0 !important; overflow: hidden !important; padding: 0 !important; margin: 0 !important; }';
        if (cosmeticEl && cosmeticEl.parentNode) {
            cosmeticEl.textContent = css;
        } else {
            cosmeticEl = document.createElement('style');
            cosmeticEl.id = 'ytab-cosmetic';
            cosmeticEl.textContent = css;
            (document.head || document.documentElement).appendChild(cosmeticEl);
        }
    }
    const cachedSelectors = GM_getValue('ytab_cached_selectors', '');
    const customFilters = GM_getValue('ytab_custom_filters', '');
    const combined = [cachedSelectors, customFilters].filter(Boolean).join(',\n');
    updateCSS(combined);

    // Fix: YouTube's sidebar drawer scrim
    const _openedFix = document.createElement('style');
    _openedFix.id = 'ytkit-opened-fix';
    _openedFix.textContent = 'tp-yt-app-drawer[opened] + .opened, #scrim.opened { display: none !important; pointer-events: none !important; }';
    (document.head || document.documentElement).appendChild(_openedFix);

    // Early chat cleanup
    if (window.location.pathname.startsWith('/live_chat')) {
        const _chatFix = document.createElement('style');
        _chatFix.id = 'ytkit-chat-early';
        _chatFix.textContent = [
            'yt-live-chat-toast-renderer, yt-live-chat-viewer-engagement-message-renderer { display: none !important; }',
            'yt-live-chat-restricted-participation-renderer yt-live-chat-product-picker-panel-view-model { display: none !important; }',
            'yt-live-chat-restricted-participation-renderer yt-reaction-control-panel-overlay-view-model { display: none !important; }',
            'yt-live-chat-restricted-participation-renderer #picker-buttons { display: none !important; }',
            '#ytkit-chat-subscribe { display: inline-flex; align-items: center; gap: 6px; margin-left: 8px; padding: 6px 14px; background: #c00; color: #fff; border: none; border-radius: 18px; font-size: 12px; font-weight: 600; font-family: "Roboto","Arial",sans-serif; cursor: pointer; transition: background 0.2s, transform 0.15s; text-decoration: none; white-space: nowrap; }',
            '#ytkit-chat-subscribe:hover { background: #e00; transform: scale(1.03); }',
            '#ytkit-chat-subscribe svg { width: 14px; height: 14px; fill: currentColor; flex-shrink: 0; }',
            'yt-live-chat-restricted-participation-renderer #explanation { display: flex !important; align-items: center !important; flex-wrap: wrap !important; gap: 4px !important; }',
        ].join('\n');
        (document.head || document.documentElement).appendChild(_chatFix);

        const _injectSubscribeBtn = () => {
            const renderer = document.querySelector('yt-live-chat-restricted-participation-renderer');
            if (!renderer || document.getElementById('ytkit-chat-subscribe')) return;
            const msgEl = renderer.querySelector('#message');
            if (!msgEl || !msgEl.textContent.includes('Subscribers-only')) return;

            let handle = '';
            const supportBtn = renderer.querySelector('button[aria-label*="@"]');
            if (supportBtn) {
                const m = supportBtn.getAttribute('aria-label').match(/@[\w.-]+/);
                if (m) handle = m[0];
            }
            if (!handle) {
                const tooltip = renderer.querySelector('tp-yt-paper-tooltip');
                if (tooltip) {
                    const m = (tooltip.textContent || '').match(/@[\w.-]+/);
                    if (m) handle = m[0];
                }
            }

            const btn = document.createElement('a');
            btn.id = 'ytkit-chat-subscribe';
            btn.target = '_blank';
            btn.rel = 'noopener';
            btn.href = handle ? `https://www.youtube.com/${handle}?sub_confirmation=1` : '#';
            btn.title = handle ? 'Subscribe to ' + handle : 'Subscribe to this channel';
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M10 20h4c0 1.1-.9 2-2 2s-2-.9-2-2zm10-2.65V11c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C9.63 5.36 8 7.92 8 11v6.35l-2 2V20h16v-.65l-2-2z');
            svg.appendChild(path);
            btn.appendChild(svg);
            btn.appendChild(document.createTextNode(' Subscribe' + (handle ? ' to ' + handle : '')));

            const body = renderer.querySelector('#body') || renderer.querySelector('#explanation');
            if (body) body.appendChild(btn);
        };

        const _chatSubObs = new MutationObserver(_injectSubscribeBtn);
        const _startChatSubObs = () => {
            _injectSubscribeBtn();
            _chatSubObs.observe(document.body, { childList: true, subtree: true });
        };
        if (document.body) _startChatSubObs();
        else document.addEventListener('DOMContentLoaded', _startChatSubObs);
    }

    // Re-inject protection
    let _ensureCSSTimer = null;
    const _ensureCSS = () => {
        if (_ensureCSSTimer) return;
        _ensureCSSTimer = setTimeout(() => {
            _ensureCSSTimer = null;
            if (!cosmeticEl || !cosmeticEl.parentNode) {
                cosmeticEl = null;
                const c = [GM_getValue('ytab_cached_selectors', ''), GM_getValue('ytab_custom_filters', '')].filter(Boolean).join(',\n');
                updateCSS(c);
            }
        }, 200);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _ensureCSS);
    const _cssObserver = new MutationObserver(_ensureCSS);
    const _startCssObs = () => { if (document.head) _cssObserver.observe(document.head, { childList: true }); };
    if (document.head) _startCssObs(); else document.addEventListener('DOMContentLoaded', _startCssObs);

    // DOM Mutation Observer - Active Ad Element Removal
    const AD_REMOVAL_TAGS = new Set([
        'YTD-AD-SLOT-RENDERER', 'YTD-IN-FEED-AD-LAYOUT-RENDERER', 'YTD-DISPLAY-AD-RENDERER',
        'YTD-PROMOTED-VIDEO-RENDERER', 'YTD-COMPACT-PROMOTED-VIDEO-RENDERER',
        'YTD-PROMOTED-SPARKLES-WEB-RENDERER', 'YTD-PROMOTED-SPARKLES-TEXT-SEARCH-RENDERER',
        'YTD-BANNER-PROMO-RENDERER', 'YTD-STATEMENT-BANNER-RENDERER',
        'YTD-VIDEO-MASTHEAD-AD-V3-RENDERER', 'YTD-VIDEO-MASTHEAD-AD-ADVERTISER-INFO-RENDERER',
        'YTD-PRIMETIME-PROMO-RENDERER', 'YTD-BRAND-VIDEO-SINGLETON-RENDERER',
        'YTD-BRAND-VIDEO-SHELF-RENDERER', 'YTD-ACTION-COMPANION-AD-RENDERER',
        'YTD-PLAYER-LEGACY-DESKTOP-WATCH-ADS-RENDERER', 'YTD-SEARCH-PYV-RENDERER',
        'YTD-MEALBAR-PROMO-RENDERER', 'YTD-MOVIE-OFFER-MODULE-RENDERER',
        'YTD-ENFORCEMENT-MESSAGE-VIEW-MODEL', 'AD-SLOT-RENDERER',
        'YTM-PROMOTED-SPARKLES-WEB-RENDERER', 'YTM-COMPANION-AD-RENDERER',
    ]);
    const AD_PARENT_CHECK = new Set([
        'YTD-AD-SLOT-RENDERER', 'YTD-IN-FEED-AD-LAYOUT-RENDERER',
        'YTD-DISPLAY-AD-RENDERER', 'YTD-PROMOTED-VIDEO-RENDERER',
    ]);

    function nukeAdNode(node) {
        if (!node || !node.parentElement) return;
        const parent = node.closest('ytd-rich-item-renderer, ytd-rich-section-renderer');
        if (parent && AD_PARENT_CHECK.has(node.tagName)) { parent.remove(); _ytabStats.blocked++; }
        else { node.remove(); _ytabStats.blocked++; }
    }
    function scanForAds(root) {
        if (!root || typeof root.querySelectorAll !== 'function') return;
        if (root.tagName && AD_REMOVAL_TAGS.has(root.tagName)) { nukeAdNode(root); return; }
        for (const tag of AD_REMOVAL_TAGS) { for (const el of root.querySelectorAll(tag.toLowerCase())) nukeAdNode(el); }
        for (const el of root.querySelectorAll('[layout*="display-ad-"]')) nukeAdNode(el);
    }
    function startDOMCleaner() {
        scanForAds(document);
        let _rafId = null;
        let _pendingRoots = [];
        const processBatch = () => {
            _rafId = null;
            const roots = _pendingRoots.splice(0, 50);
            for (const root of roots) scanForAds(root);
            if (_pendingRoots.length) {
                _rafId = requestAnimationFrame(processBatch);
            }
        };
        const obs = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType === 1) _pendingRoots.push(node);
                }
            }
            if (_pendingRoots.length && !_rafId) {
                _rafId = requestAnimationFrame(processBatch);
            }
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startDOMCleaner);
    else startDOMCleaner();

    // SSAP / Video Ad Control - delegates to page-context engine via CustomEvent bridge
    function startSSAP() { ytabCommand('startSSAP'); }
    function stopSSAP() { ytabCommand('stopSSAP'); }

    // Parse filter list text into CSS selectors (pure function, no MAIN world needed)
    function parseFilterList(text) {
        const selectors = [];
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const t = lines[i].trim();
            if (!t || t.charAt(0) === '!' || t.indexOf('@@') === 0 || t.indexOf('#@#') !== -1 || t.indexOf('||') === 0) continue;
            const m = t.match(/^(?:[a-z][a-z0-9.*,-]*)?##([^+^].+)$/);
            if (m && m[1].indexOf(':style(') === -1 && m[1].indexOf(':remove-attr(') === -1) selectors.push(m[1]);
        }
        const unique = [], seen = {};
        for (let j = 0; j < selectors.length; j++) { if (!seen[selectors[j]]) { seen[selectors[j]] = true; unique.push(selectors[j]); } }
        return unique;
    }

    // Expose functions for ytkit.js to use
    window._ytabSandbox = {
        active: true,
        updateCSS,
        startSSAP,
        stopSSAP,
        parseFilterList,
        get stats() { return _ytabStats; },
        getStats: () => _ytabStats
    };
})();
