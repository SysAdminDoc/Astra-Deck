(() => {
    'use strict';

    const VIEW_ATTRIBUTE = 'data-ytkit-subscription-view';
    const ORIGINAL_INDEX_ATTRIBUTE = 'data-ytkit-sub-view-original-index';
    const CARD_SELECTOR = ':scope > ytd-rich-item-renderer, :scope > ytd-video-renderer';
    const CONTAINER_SELECTOR = 'ytd-rich-grid-renderer #contents, ytd-section-list-renderer #contents';
    const VIEW_MODES = Object.freeze(['grid', 'list', 'compact']);
    const ORDER_MODES = Object.freeze(['native', 'newest-loaded']);

    function normalizeViewMode(value) {
        const mode = String(value || 'grid');
        return VIEW_MODES.includes(mode) ? mode : 'grid';
    }

    function normalizeOrderMode(value) {
        const mode = String(value || 'native');
        return ORDER_MODES.includes(mode) ? mode : 'native';
    }

    function normalizeLocalizedDigits(value) {
        const arabicIndic = '٠١٢٣٤٥٦٧٨٩';
        const easternArabicIndic = '۰۱۲۳۴۵۶۷۸۹';
        return String(value || '').replace(/[٠-٩۰-۹]/g, (digit) => {
            const arabicIndex = arabicIndic.indexOf(digit);
            return String(arabicIndex >= 0 ? arabicIndex : easternArabicIndic.indexOf(digit));
        });
    }

    function parseRelativeAgeMs(value) {
        const text = normalizeLocalizedDigits(value).toLocaleLowerCase();
        const units = [
            [/second|sec\b|sekund|segundo|seconde|secondi|секунд|秒|초|ثاني/, 1000],
            [/minute|minut|minuto|minuti|минут|分|분|دقيق/, 60_000],
            [/hour|stund|hora|heure|ore\b|час|時間|小时|시간|ساع/, 3_600_000],
            [/day|tag\b|tage|día|días|dia|dias|jour|giorn|день|дня|дней|日|天|일|يوم|أيام/, 86_400_000],
            [/week|woch|semana|semaine|settiman|недел|週|周|주|أسبوع|أسابيع/, 604_800_000],
            [/month|monat|mes\b|mois|mese|mesi|месяц|месяца|месяцев|ヶ月|か月|个月|個月|개월|شهر|أشهر/, 2_629_746_000],
            [/year|jahr|año|année|anno|лет|год|года|年前|年|년|سنة|سنوات|عام/, 31_556_952_000]
        ];
        for (const [pattern, multiplier] of units) {
            const match = text.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:${pattern.source})`, 'u'));
            if (!match) continue;
            const amount = Number(match[1].replace(',', '.'));
            if (Number.isFinite(amount) && amount >= 0) return amount * multiplier;
        }
        return null;
    }

    function queryAll(root, selector) {
        try { return Array.from(root?.querySelectorAll?.(selector) || []); }
        catch { return []; }
    }

    function extractLoadedAgeMs(card, now = Date.now()) {
        const exactCandidates = [
            card?.dataset?.publishedAt,
            card?.getAttribute?.('data-published-at'),
            card?.querySelector?.('time[datetime], [datetime]')?.getAttribute?.('datetime')
        ].filter(Boolean);
        for (const value of exactCandidates) {
            const timestamp = Date.parse(String(value));
            if (Number.isFinite(timestamp)) return Math.max(0, now - timestamp);
        }

        const metadata = queryAll(card, [
            'yt-content-metadata-view-model',
            '#metadata-line',
            '.inline-metadata-item',
            'ytd-video-meta-block'
        ].join(', ')).map((node) => String(node?.textContent || '')).join(' · ');
        return parseRelativeAgeMs(metadata);
    }

    function stampOriginalIndices(container) {
        const cards = queryAll(container, CARD_SELECTOR);
        let nextIndex = cards.reduce((max, card) => {
            const value = Number(card?.getAttribute?.(ORIGINAL_INDEX_ATTRIBUTE));
            return Number.isFinite(value) ? Math.max(max, value + 1) : max;
        }, 0);
        for (const card of cards) {
            if (card?.getAttribute?.(ORIGINAL_INDEX_ATTRIBUTE) == null) {
                card.setAttribute?.(ORIGINAL_INDEX_ATTRIBUTE, String(nextIndex++));
            }
        }
        return cards;
    }

    function sortLoadedCards(container, orderMode, documentRef = globalThis.document, now = Date.now()) {
        const cards = stampOriginalIndices(container);
        if (!cards.length) return 0;
        const currentOrder = [...cards];
        const originalIndex = (card) => Number(card?.getAttribute?.(ORIGINAL_INDEX_ATTRIBUTE)) || 0;
        if (normalizeOrderMode(orderMode) === 'newest-loaded') {
            cards.sort((left, right) => {
                const leftAge = extractLoadedAgeMs(left, now);
                const rightAge = extractLoadedAgeMs(right, now);
                if (leftAge == null && rightAge != null) return 1;
                if (leftAge != null && rightAge == null) return -1;
                if (leftAge != null && rightAge != null && leftAge !== rightAge) return leftAge - rightAge;
                return originalIndex(left) - originalIndex(right);
            });
        } else {
            cards.sort((left, right) => originalIndex(left) - originalIndex(right));
        }
        if (cards.every((card, index) => card === currentOrder[index])) return cards.length;
        const fragment = documentRef?.createDocumentFragment?.();
        if (!fragment) return 0;
        for (const card of cards) fragment.appendChild(card);
        // Keep the infinite-scroll trigger LAST: appending past the
        // continuation renderer would pin a permanently-intersecting spinner
        // at the top of the feed and misplace YouTube's continuation inserts.
        const anchor = queryAll(container, ':scope > ytd-continuation-item-renderer')[0] || null;
        if (anchor) container.insertBefore?.(fragment, anchor);
        else container.appendChild?.(fragment);
        return cards.length;
    }

    function createSubscriptionViewFeature(deps = {}) {
        const {
            appState = { settings: {} },
            settingsManager = { save() {} },
            addNavigateRule = () => {},
            removeNavigateRule = () => {},
            addMutationRule = () => {},
            removeMutationRule = () => {},
            injectStyle = () => null,
            getSurfaceSelectorChain = () => [],
            documentRef = globalThis.document,
            windowRef = globalThis.window,
            t = (_key, fallback) => fallback,
            schedule = (callback) => setTimeout(callback, 50),
            cancelSchedule = (handle) => clearTimeout(handle)
        } = deps;

        let styleElement = null;
        let controls = null;
        let ownToolbar = null;
        let status = null;
        let scheduled = null;
        let destroyed = true;
        let sorting = false;

        function isSubscriptionsPage() {
            return windowRef?.location?.pathname === '/feed/subscriptions';
        }

        function pageRoot() {
            const selectors = getSurfaceSelectorChain('subscriptions');
            const chain = Array.isArray(selectors) && selectors.length
                ? selectors
                : ['ytd-browse[page-subtype="subscriptions"]', 'ytd-browse'];
            for (const selector of chain) {
                const node = documentRef?.querySelector?.(selector);
                if (node) return node.matches?.('ytd-browse') ? node : node.closest?.('ytd-browse') || node;
            }
            return null;
        }

        function feedTarget() {
            return documentRef?.querySelector?.('ytd-rich-grid-renderer, ytd-section-list-renderer') || null;
        }

        function saveSetting(key, value) {
            appState.settings[key] = value;
            try { void settingsManager.save(appState.settings); }
            catch { /* reason: the shared settings controller surfaces save failures */ }
        }

        function applyView() {
            const root = pageRoot();
            if (!root || !isSubscriptionsPage()) return;
            root.setAttribute?.(VIEW_ATTRIBUTE, normalizeViewMode(appState?.settings?.subscriptionViewMode));
        }

        function restoreOrder() {
            for (const container of queryAll(documentRef, CONTAINER_SELECTOR)) {
                // Only containers we actually reordered carry stamped cards;
                // running the restore sort against untouched feeds (home,
                // search) is pure churn.
                if (!container.querySelector?.(`[${ORIGINAL_INDEX_ATTRIBUTE}]`)) continue;
                sortLoadedCards(container, 'native', documentRef);
            }
        }

        function clearCardState() {
            if (!documentRef?.querySelector?.(`[${ORIGINAL_INDEX_ATTRIBUTE}]`)) return;
            restoreOrder();
            for (const card of queryAll(documentRef, `[${ORIGINAL_INDEX_ATTRIBUTE}]`)) {
                card.removeAttribute?.(ORIGINAL_INDEX_ATTRIBUTE);
            }
        }

        function applyOrder() {
            if (sorting || destroyed || !isSubscriptionsPage()) return;
            if (documentRef?.querySelector?.('.ytkit-sub-toolbar')) return;
            sorting = true;
            let count = 0;
            const mode = normalizeOrderMode(appState?.settings?.subscriptionOrderMode);
            try {
                for (const container of queryAll(documentRef, CONTAINER_SELECTOR)) {
                    count += sortLoadedCards(container, mode, documentRef);
                }
            } finally {
                sorting = false;
            }
            if (status) {
                // Only write when changed: an unconditional textContent
                // assignment replaces the text node every pass, and the
                // resulting mutation record re-triggers this feature's own
                // mutation rule — a self-sustaining loop that also re-runs
                // every other unscoped rule.
                const hint = mode === 'newest-loaded'
                    ? t('subscriptionLoadedOnlyHint', 'Newest first sorts only videos loaded on this page. Scroll to load more.')
                    : '';
                if (status.textContent !== hint) status.textContent = hint;
                const loaded = String(count);
                if (status.dataset.loadedCount !== loaded) status.dataset.loadedCount = loaded;
            }
        }

        function buildControls(groupToolbar) {
            const wrapper = documentRef.createElement('div');
            wrapper.className = 'ytkit-sub-view-controls';
            wrapper.setAttribute('role', 'group');
            wrapper.setAttribute('aria-label', t('subscriptionViewToolbarLabel', 'Subscription view controls'));

            const label = documentRef.createElement('span');
            label.className = 'ytkit-sub-view-label';
            label.textContent = t('subscriptionViewLabel', 'View');
            wrapper.appendChild(label);

            const activeView = normalizeViewMode(appState?.settings?.subscriptionViewMode);
            for (const [mode, key, fallback] of [
                ['grid', 'subscriptionViewGrid', 'Grid'],
                ['list', 'subscriptionViewList', 'List'],
                ['compact', 'subscriptionViewCompact', 'Compact']
            ]) {
                const button = documentRef.createElement('button');
                button.type = 'button';
                button.dataset.viewMode = mode;
                button.textContent = t(key, fallback);
                button.setAttribute('aria-pressed', String(activeView === mode));
                button.addEventListener('click', () => {
                    saveSetting('subscriptionViewMode', mode);
                    applyView();
                    // Update aria-pressed in place — rebuilding the toolbar
                    // would detach the activated button and drop keyboard
                    // focus to <body>.
                    for (const sibling of queryAll(wrapper, 'button[data-view-mode]')) {
                        sibling.setAttribute('aria-pressed', String(sibling.dataset.viewMode === mode));
                    }
                });
                wrapper.appendChild(button);
            }

            if (!groupToolbar) {
                const orderLabel = documentRef.createElement('label');
                orderLabel.className = 'ytkit-sub-view-label';
                orderLabel.htmlFor = 'ytkit-sub-view-order';
                orderLabel.textContent = t('subscriptionOrderLabel', 'Order');
                const select = documentRef.createElement('select');
                select.id = 'ytkit-sub-view-order';
                select.setAttribute('aria-label', t('subscriptionOrderLabel', 'Order'));
                for (const [mode, key, fallback] of [
                    ['native', 'subscriptionOrderNative', 'YouTube order'],
                    ['newest-loaded', 'subscriptionOrderNewestLoaded', 'Newest first (loaded only)']
                ]) {
                    const option = documentRef.createElement('option');
                    option.value = mode;
                    option.textContent = t(key, fallback);
                    option.selected = normalizeOrderMode(appState?.settings?.subscriptionOrderMode) === mode;
                    select.appendChild(option);
                }
                select.addEventListener('change', () => {
                    saveSetting('subscriptionOrderMode', normalizeOrderMode(select.value));
                    applyOrder();
                });
                const hint = documentRef.createElement('span');
                hint.className = 'ytkit-sub-view-hint';
                hint.setAttribute('role', 'status');
                hint.setAttribute('aria-live', 'polite');
                wrapper.append(orderLabel, select, hint);
                status = hint;
            }
            return wrapper;
        }

        function mountControls() {
            if (destroyed || !isSubscriptionsPage()) return;
            applyView();
            const target = feedTarget();
            if (!target?.parentElement) return;
            controls?.remove?.();
            ownToolbar?.remove?.();
            controls = null;
            ownToolbar = null;
            status = null;

            const groupToolbar = documentRef?.querySelector?.('.ytkit-sub-toolbar');
            controls = buildControls(groupToolbar);
            if (groupToolbar) {
                groupToolbar.prepend?.(controls);
            } else {
                const toolbar = documentRef.createElement('div');
                toolbar.className = 'ytkit-sub-view-toolbar';
                toolbar.setAttribute('role', 'toolbar');
                toolbar.setAttribute('aria-label', t('subscriptionViewToolbarLabel', 'Subscription view controls'));
                toolbar.appendChild(controls);
                target.parentElement.insertBefore(toolbar, target);
                ownToolbar = toolbar;
            }
            applyOrder();
        }

        function scheduleRefresh() {
            if (destroyed || sorting || scheduled != null) return;
            scheduled = schedule(() => {
                scheduled = null;
                if (!isSubscriptionsPage()) {
                    // Tear down once when leaving the feed; repeating the full
                    // teardown on every off-page mutation batch would rescan
                    // and re-stamp every card on unrelated feeds.
                    if (controls || ownToolbar) teardownPage();
                    return;
                }
                if (!controls?.isConnected) mountControls();
                else {
                    applyView();
                    applyOrder();
                }
            });
        }

        function teardownPage() {
            if (scheduled != null) cancelSchedule(scheduled);
            scheduled = null;
            controls?.remove?.();
            ownToolbar?.remove?.();
            controls = null;
            ownToolbar = null;
            status = null;
            for (const root of queryAll(documentRef, `[${VIEW_ATTRIBUTE}]`)) root.removeAttribute?.(VIEW_ATTRIBUTE);
            clearCardState();
        }

        function ensureStyles() {
            if (styleElement) return;
            styleElement = injectStyle(`
                .ytkit-sub-view-toolbar{display:flex;align-items:center;gap:8px;margin:0 0 10px;padding:8px 10px;border:1px solid var(--yt-spec-10-percent-layer,rgba(255,255,255,.12));border-radius:10px;background:var(--yt-spec-badge-chip-background,rgba(255,255,255,.05));color:var(--yt-spec-text-primary,#f4f6fb);font:12px/1.3 system-ui;}
                .ytkit-sub-view-controls{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;}
                .ytkit-sub-view-label{color:var(--yt-spec-text-secondary,#aaa);font-weight:700;}
                .ytkit-sub-view-controls button,.ytkit-sub-view-controls select{min-height:36px;box-sizing:border-box;padding:6px 10px;border:1px solid var(--yt-spec-10-percent-layer,rgba(255,255,255,.14));border-radius:7px;background:var(--yt-spec-badge-chip-background,rgba(255,255,255,.07));color:inherit;font:600 12px/1 system-ui;cursor:pointer;}
                .ytkit-sub-view-controls button[aria-pressed="true"]{border-color:var(--yt-spec-call-to-action,#3ea6ff);background:var(--yt-spec-call-to-action,#3ea6ff);color:#081018;}
                html:not([dark]) .ytkit-sub-view-controls button[aria-pressed="true"]{color:#fff;}
                .ytkit-sub-view-controls button:focus-visible,.ytkit-sub-view-controls select:focus-visible{outline:3px solid var(--yt-spec-call-to-action,#3ea6ff);outline-offset:2px;}
                .ytkit-sub-view-hint{color:var(--yt-spec-text-secondary,#aaa);font-size:11px;}
                ytd-browse[${VIEW_ATTRIBUTE}="list"] ytd-rich-grid-renderer #contents,
                ytd-browse[${VIEW_ATTRIBUTE}="compact"] ytd-rich-grid-renderer #contents{display:flex!important;flex-direction:column!important;gap:10px!important;width:100%!important;}
                ytd-browse[${VIEW_ATTRIBUTE}="list"] ytd-rich-item-renderer,
                ytd-browse[${VIEW_ATTRIBUTE}="compact"] ytd-rich-item-renderer{display:block!important;width:100%!important;max-width:none!important;margin:0!important;}
                ytd-browse[${VIEW_ATTRIBUTE}="list"] ytd-rich-item-renderer .ytLockupViewModelHost,
                ytd-browse[${VIEW_ATTRIBUTE}="compact"] ytd-rich-item-renderer .ytLockupViewModelHost{display:grid!important;grid-template-columns:minmax(220px,320px) minmax(0,1fr)!important;align-items:start!important;gap:16px!important;width:100%!important;}
                ytd-browse[${VIEW_ATTRIBUTE}="compact"] ytd-rich-item-renderer .ytLockupViewModelHost{grid-template-columns:180px minmax(0,1fr)!important;gap:12px!important;}
                ytd-browse[${VIEW_ATTRIBUTE}="list"] .ytLockupViewModelContentImage,
                ytd-browse[${VIEW_ATTRIBUTE}="compact"] .ytLockupViewModelContentImage{grid-column:1!important;width:100%!important;}
                ytd-browse[${VIEW_ATTRIBUTE}="list"] .ytLockupViewModelMetadata,
                ytd-browse[${VIEW_ATTRIBUTE}="compact"] .ytLockupViewModelMetadata{grid-column:2!important;min-width:0!important;align-self:start!important;}
                ytd-browse[${VIEW_ATTRIBUTE}="list"] .ytLockupMetadataViewModelDescription,
                ytd-browse[${VIEW_ATTRIBUTE}="list"] #description-text,
                ytd-browse[${VIEW_ATTRIBUTE}="list"] .metadata-snippet-text{display:block!important;overflow:hidden!important;display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:3!important;}
                ytd-browse[${VIEW_ATTRIBUTE}="compact"] .ytLockupMetadataViewModelDescription,
                ytd-browse[${VIEW_ATTRIBUTE}="compact"] #description-text,
                ytd-browse[${VIEW_ATTRIBUTE}="compact"] .metadata-snippet-text{display:block!important;overflow:hidden!important;white-space:nowrap!important;text-overflow:ellipsis!important;}
                @media(max-width:700px){ytd-browse[${VIEW_ATTRIBUTE}="list"] ytd-rich-item-renderer .ytLockupViewModelHost,ytd-browse[${VIEW_ATTRIBUTE}="compact"] ytd-rich-item-renderer .ytLockupViewModelHost{grid-template-columns:140px minmax(0,1fr)!important;gap:10px!important;}}
                @media(forced-colors:active){.ytkit-sub-view-toolbar,.ytkit-sub-view-controls button,.ytkit-sub-view-controls select{border:1px solid CanvasText;}.ytkit-sub-view-controls button[aria-pressed="true"]{background:Highlight;color:HighlightText;}}
                @media(prefers-reduced-motion:reduce){.ytkit-sub-view-toolbar,.ytkit-sub-view-controls *{transition:none!important;scroll-behavior:auto!important;}}
            `, 'subscription-view-controls', true);
        }

        return {
            id: 'subscriptionViewControls',
            name: t('feature_subscriptionViewControls_name', 'Subscription View Controls'),
            description: t('feature_subscriptionViewControls_desc', 'Choose Grid, List, or Compact subscriptions layouts and optionally sort the currently loaded cards newest first.'),
            group: 'Subscriptions',
            icon: 'list-filter',

            init() {
                if (!destroyed) return;
                destroyed = false;
                ensureStyles();
                addNavigateRule('subscriptionViewControls', scheduleRefresh);
                addMutationRule('subscriptionViewControls', scheduleRefresh);
                scheduleRefresh();
            },

            destroy() {
                if (destroyed) return;
                destroyed = true;
                removeNavigateRule('subscriptionViewControls');
                removeMutationRule('subscriptionViewControls');
                teardownPage();
                styleElement?.remove?.();
                styleElement = null;
            },

            _applyView: applyView,
            _applyOrder: applyOrder,
            _mountControls: mountControls
        };
    }

    const ns = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    ns.subscriptionView = Object.freeze({
        VIEW_MODES,
        ORDER_MODES,
        createSubscriptionViewFeature,
        extractLoadedAgeMs,
        normalizeLocalizedDigits,
        normalizeOrderMode,
        normalizeViewMode,
        parseRelativeAgeMs,
        sortLoadedCards
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ns.subscriptionView;
    }
})();
