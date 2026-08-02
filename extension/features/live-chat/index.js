(() => {
    'use strict';

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    if (features.liveChat) return;

    const SETTINGS_KEY = 'ytSuiteSettings';
    const REACTION_STATE_KEY = 'ytkitReactionSpammerState';
    const PREMIUM_ATTRIBUTE = 'data-ytkit-livechat-premium';
    const CHAT_FEATURE_IDS = Object.freeze([
        'hideLiveChatEngagement',
        'premiumLiveChat',
        'hiddenChatElementsManager',
        'reactionSpammer',
        'chatKeywordFilter'
    ]);
    const CHAT_ELEMENT_SELECTORS = Object.freeze({
        header: 'yt-live-chat-header-renderer',
        menu: 'yt-live-chat-header-renderer #overflow',
        // The English aria-label only exists on the older header layout; current
        // YouTube moves popout into the header's overflow menu, where the entry
        // is identified by its "open in new" glyph. Both glyph revisions are
        // captured in mhtml/LiveChat.mhtml and are language-independent.
        popout: [
            'yt-live-chat-header-renderer button[aria-label="Popout chat"]',
            'tp-yt-iron-dropdown.yt-live-chat-app ytd-menu-service-item-renderer:has(path[d^="M21,21H3V3h9v1H4v16h16v-8h1V21z"])',
            'tp-yt-iron-dropdown.yt-live-chat-app ytd-menu-service-item-renderer:has(path[d^="M19 19H5V5h7V3H5c-1.11"])'
        ].join(', '),
        reactions: 'yt-reaction-control-panel-overlay-view-model, yt-reaction-control-panel-view-model',
        timestamps: '#show-hide-button.ytd-live-chat-frame',
        polls: 'yt-live-chat-poll-renderer, yt-live-chat-banner-manager, yt-live-chat-action-panel-renderer:has(yt-live-chat-poll-renderer)',
        ticker: 'yt-live-chat-ticker-renderer',
        leaderboard: 'yt-live-chat-participant-list-renderer, yt-pdg-buy-flow-renderer',
        support: 'yt-live-chat-message-buy-flow-renderer, #product-picker, .yt-live-chat-message-input-renderer[id="picker-buttons"]',
        banner: 'yt-live-chat-banner-renderer',
        emoji: '#emoji-picker-button, yt-live-chat-message-input-renderer #picker-buttons yt-icon-button',
        topFan: 'yt-live-chat-author-badge-renderer[type="member"], yt-live-chat-author-badge-renderer[type="top-gifter"]',
        superChats: 'yt-live-chat-paid-message-renderer, yt-live-chat-paid-sticker-renderer',
        levelUp: 'yt-live-chat-viewer-engagement-message-renderer[engagement-type="VIEWER_ENGAGEMENT_MESSAGE_TYPE_LEVEL_UP"]'
    });
    const REACTION_DEPENDENT_CONTROLS = new Set(['reactions', 'support', 'emoji']);
    const FALLBACK_DEFAULTS = Object.freeze({
        hideLiveChatEngagement: true,
        premiumLiveChat: true,
        hiddenChatElementsManager: true,
        hiddenChatElements: Object.freeze([
            'header', 'menu', 'popout', 'timestamps', 'polls', 'ticker',
            'leaderboard', 'support', 'banner', 'emoji', 'topFan',
            'superChats', 'levelUp', 'bots'
        ]),
        reactionSpammer: false,
        reactionSpammerMinIntervalMs: 500,
        chatKeywordFilter: '',
        safeStoreProfile: true,
        githubFullProfile: false
    });

    // Theme-var driven (dark fallbacks) so the panel follows light YouTube
    // like its native siblings, with logical inline properties so the
    // launcher/panel mirror correctly in RTL locales.
    const REACTION_CSS = `
        #ytkit-reaction-spammer-launcher {
            position: fixed; inset-inline-end: 12px; bottom: 12px; z-index: 2147483645;
            min-width: 44px; min-height: 44px; border: 1px solid rgba(var(--ytkit-accent-rgb,167,139,250),.45);
            border-radius: 12px; background: var(--yt-spec-badge-chip-background, #171c26); color: var(--ytkit-accent, #a78bfa); cursor: pointer;
            font: 700 16px/1 Roboto,Arial,sans-serif;
        }
        #ytkit-reaction-spammer-panel {
            position: fixed; inset-inline-end: 12px; bottom: 64px; z-index: 2147483646;
            width: min(280px, calc(100vw - 24px)); max-height: min(520px, calc(100vh - 80px));
            box-sizing: border-box; overflow: auto; padding: 12px; border: 1px solid var(--yt-spec-10-percent-layer, rgba(255,255,255,.14));
            border-radius: 14px; background: var(--yt-spec-menu-background, #111720); color: var(--yt-spec-text-primary, #f8fafc); box-shadow: 0 20px 60px rgba(0,0,0,.5);
            font: 12px/1.4 Roboto,Arial,sans-serif;
        }
        #ytkit-reaction-spammer-panel header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        #ytkit-reaction-spammer-panel h2 { margin: 0; font-size: 14px; }
        #ytkit-reaction-spammer-panel button,
        #ytkit-reaction-spammer-panel input { min-height: 32px; box-sizing: border-box; }
        #ytkit-reaction-spammer-panel button { border: 1px solid var(--yt-spec-10-percent-layer, rgba(255,255,255,.14)); border-radius: 8px; background: var(--yt-spec-badge-chip-background, #202938); color: inherit; cursor: pointer; }
        #ytkit-reaction-spammer-panel button:focus-visible,
        #ytkit-reaction-spammer-panel input:focus-visible { outline: 2px solid var(--ytkit-accent, #a78bfa); outline-offset: 2px; }
        .ytkit-rs-options { display: grid; gap: 6px; margin: 10px 0; }
        .ytkit-rs-options label { display: flex; align-items: center; gap: 8px; }
        .ytkit-rs-controls { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
        .ytkit-rs-warning { margin: 8px 0; color: var(--yt-spec-text-secondary, #fde68a); }
        .ytkit-rs-status { min-height: 18px; margin-top: 8px; color: var(--yt-spec-text-secondary, #cbd5e1); }
        @media (forced-colors: active) {
            #ytkit-reaction-spammer-launcher,
            #ytkit-reaction-spammer-panel { border: 1px solid ButtonText; }
        }
    `;

    function createLiveChatRuntime(options = {}) {
        const scope = options.scope || globalThis;
        const doc = options.document || scope.document;
        const win = options.window || scope.window || scope;
        const browser = options.browser || scope.YTKitBrowser?.ns || scope.chrome || null;
        const core = options.core || scope.YTKitCore || {};
        const schemaApi = options.schemaApi || scope.__YTKIT_SETTINGS_SCHEMA__ || {};
        const policy = options.policy || core.createPolicyProfile?.({
            schema: schemaApi.SETTINGS_SCHEMA,
            findSettingEntry: schemaApi.findSettingEntry
        });
        const injectStyle = options.injectStyle || core.injectStyle;
        const translate = typeof options.t === 'function'
            ? options.t
            : (typeof core.t === 'function' ? core.t : null);
        function t(key, fallback) {
            try {
                if (translate) {
                    const message = translate(key, fallback);
                    if (message) return message;
                } else if (browser?.i18n?.getMessage) {
                    const message = browser.i18n.getMessage(key);
                    if (message) return message;
                }
            } catch (_) {
                // reason: i18n is best-effort; the chat UI must never fail on it.
            }
            return (fallback != null) ? fallback : key;
        }
        const defaults = {
            ...FALLBACK_DEFAULTS,
            ...(schemaApi.buildDefaultsFromSchema?.() || {})
        };
        let settings = { ...defaults };
        let started = false;
        let destroyed = false;
        let observer = null;
        let storageListener = null;
        let pageHideListener = null;
        let scanQueued = false;
        let reactionController = null;

        function isChatPath() {
            return String(win.location?.pathname || '').startsWith('/live_chat');
        }

        function getStyle(id) {
            return doc.getElementById(`yt-suite-style-${id}`);
        }

        function setStyle(id, css, enabled, raw = true) {
            getStyle(id)?.remove();
            if (enabled && css && typeof injectStyle === 'function') injectStyle(css, id, raw);
        }

        function restoreEngagementNodes() {
            doc.querySelectorAll('[data-ytkit-live-chat-engagement-hidden="1"]').forEach((node) => {
                node.style.display = node.dataset.ytkitLiveChatEngagementDisplay || '';
                node.style.visibility = node.dataset.ytkitLiveChatEngagementVisibility || '';
                delete node.dataset.ytkitLiveChatEngagementHidden;
                delete node.dataset.ytkitLiveChatEngagementDisplay;
                delete node.dataset.ytkitLiveChatEngagementVisibility;
            });
        }

        function hideEngagementNode(node) {
            if (!node?.dataset || node.dataset.ytkitLiveChatEngagementHidden === '1') return;
            node.dataset.ytkitLiveChatEngagementDisplay = node.style.display || '';
            node.dataset.ytkitLiveChatEngagementVisibility = node.style.visibility || '';
            node.style.setProperty('display', 'none', 'important');
            node.style.setProperty('visibility', 'hidden', 'important');
            node.dataset.ytkitLiveChatEngagementHidden = '1';
        }

        function scanEngagement() {
            if (!settings.hideLiveChatEngagement) return;
            doc.querySelectorAll('yt-live-chat-viewer-engagement-message-renderer, yt-live-chat-toast-renderer')
                .forEach(hideEngagementNode);
            doc.querySelectorAll('yt-tooltip-renderer').forEach((tooltip) => {
                const details = tooltip.querySelector?.('#details-text')?.textContent?.trim().toLowerCase() || '';
                const inChat = tooltip.classList?.contains('yt-live-chat-app')
                    || tooltip.closest?.('.yt-live-chat-app, tp-yt-iron-dropdown.yt-live-chat-app');
                if (!inChat) return;
                // The sentence match is English-only, so this hid nothing on the
                // ten other shipped locales. A tooltip anchored to an engagement
                // message is engagement chrome in any language; the phrase stays
                // as a fallback for layouts that render the tooltip elsewhere.
                const engagementAnchored = !!tooltip.closest?.('yt-live-chat-viewer-engagement-message-renderer')
                    || !!tooltip.parentElement?.querySelector?.('yt-live-chat-viewer-engagement-message-renderer');
                if (!engagementAnchored
                    && !details.includes('people will be able to see that you subscribe to this channel')) return;
                hideEngagementNode(tooltip);
                hideEngagementNode(tooltip.closest?.('tp-yt-iron-dropdown'));
            });
        }

        function restorePremiumMessages() {
            doc.querySelectorAll('[data-ytkit-livechat-enhanced]').forEach((message) => {
                delete message.dataset.ytkitLivechatEnhanced;
                delete message.dataset.ytkitLivechatAvatarFallback;
                delete message.dataset.ytkitLivechatAvatarMissing;
                delete message.dataset.ytkitAuthorInitial;
            });
        }

        function scanPremiumMessages() {
            if (!settings.premiumLiveChat) return;
            doc.querySelectorAll('yt-live-chat-text-message-renderer:not([data-ytkit-livechat-enhanced])')
                .forEach((message) => {
                    const author = message.querySelector?.('#author-name')?.textContent?.trim().replace(/^@+/, '') || '';
                    message.dataset.ytkitAuthorInitial = Array.from(author)[0]?.toUpperCase() || '?';
                    const photo = message.querySelector?.('#author-photo');
                    const image = photo?.matches?.('img') ? photo : photo?.querySelector?.('img');
                    if (image) {
                        image.loading = 'eager';
                        image.decoding = 'async';
                        if (!image.getAttribute?.('src')) message.dataset.ytkitLivechatAvatarFallback = '1';
                    } else {
                        message.dataset.ytkitLivechatAvatarMissing = '1';
                    }
                    message.dataset.ytkitLivechatEnhanced = '1';
                });
        }

        function restoreFilteredMessages() {
            doc.querySelectorAll('[data-ytkit-chat-filtered="1"]').forEach((message) => {
                message.style.display = message.dataset.ytkitChatFilterDisplay || '';
                delete message.dataset.ytkitChatFiltered;
                delete message.dataset.ytkitChatFilterDisplay;
                delete message.dataset.ytkitChatFilterReason;
                delete message.dataset.ytkitChatFilterSignature;
            });
        }

        function scanMessageFilters() {
            const hidden = settings.hiddenChatElementsManager && Array.isArray(settings.hiddenChatElements)
                ? settings.hiddenChatElements
                : [];
            const hideBots = hidden.includes('bots');
            const keywords = String(settings.chatKeywordFilter || '').toLowerCase()
                .split(',').map((value) => value.trim()).filter(Boolean);
            const signature = `${hideBots}:${keywords.join('|')}`;
            doc.querySelectorAll('yt-live-chat-text-message-renderer').forEach((message) => {
                if (message.dataset?.ytkitChatFilterSignature === signature) return;
                const author = message.querySelector?.('#author-name')?.textContent?.toLowerCase() || '';
                const text = message.querySelector?.('#message')?.textContent?.toLowerCase() || '';
                // Word-boundary/suffix match only: a bare substring test hid
                // legitimate users like "Abbott" or "Botany" by default.
                const reason = hideBots && /\bbot\b|bot$/.test(author)
                    ? 'bot'
                    : (keywords.some((keyword) => author.includes(keyword) || text.includes(keyword)) ? 'keyword' : '');
                if (reason) {
                    if (message.dataset.ytkitChatFiltered !== '1') {
                        message.dataset.ytkitChatFilterDisplay = message.style.display || '';
                    }
                    message.style.setProperty('display', 'none', 'important');
                    message.dataset.ytkitChatFiltered = '1';
                    message.dataset.ytkitChatFilterReason = reason;
                } else if (message.dataset.ytkitChatFiltered === '1') {
                    message.style.display = message.dataset.ytkitChatFilterDisplay || '';
                    delete message.dataset.ytkitChatFiltered;
                    delete message.dataset.ytkitChatFilterDisplay;
                    delete message.dataset.ytkitChatFilterReason;
                }
                message.dataset.ytkitChatFilterSignature = signature;
            });
        }

        function createReactionController() {
            let launcher = null;
            let panel = null;
            let timer = null;
            let running = false;
            let state = { selected: [], intervalMs: 600 };
            // The top-frame reaction spammer persists extra fields (pos,
            // collapsed) under the same storage key; preserve them on write.
            let persistedExtras = {};

            function clampInterval(value) {
                const configuredFloor = Math.max(500, Math.min(60000, Number(settings.reactionSpammerMinIntervalMs) || 500));
                const number = Number(value);
                if (!Number.isFinite(number)) return Math.max(configuredFloor, 600);
                return Math.max(configuredFloor, Math.min(60000, Math.floor(number)));
            }

            async function loadState() {
                try {
                    const stored = await browser?.storage?.local?.get?.(REACTION_STATE_KEY);
                    const value = stored?.[REACTION_STATE_KEY];
                    if (value && typeof value === 'object') {
                        persistedExtras = { ...value };
                        state.selected = Array.isArray(value.selected)
                            ? value.selected.filter((item) => typeof item === 'string')
                            : [];
                        state.intervalMs = clampInterval(value.intervalMs);
                    }
                } catch (_) {
                    // reason: a storage failure leaves safe in-memory defaults active.
                }
            }

            function saveState() {
                try {
                    const write = browser?.storage?.local?.set?.({
                        [REACTION_STATE_KEY]: { ...persistedExtras, ...state }
                    });
                    if (write?.catch) write.catch(() => {
                        // reason: reaction preferences remain usable in memory when storage is unavailable.
                    });
                } catch (_) {
                    // reason: persisting a convenience preference is best-effort.
                }
            }

            function reactionButtons() {
                const buttons = new Map();
                // Accept any labelled reaction image: the "Send X" alt prefix
                // is English-only, and requiring it made the sender list
                // nothing on the 10 non-English locales the extension ships.
                doc.querySelectorAll('#expanded-buttons yt-reaction-control-panel-button-view-model button')
                    .forEach((button) => {
                        const image = button.querySelector?.('img[alt]');
                        const emoji = image?.alt?.replace(/^Send\s+/i, '').trim();
                        if (emoji && !buttons.has(emoji)) buttons.set(emoji, button);
                    });
                return buttons;
            }

            function dispatchReaction(button) {
                if (!button) return false;
                try {
                    const rect = button.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
                    const options = {
                        bubbles: true, cancelable: true, composed: true, button: 0,
                        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2
                    };
                    button.dispatchEvent?.(new win.MouseEvent('mousedown', options));
                    button.dispatchEvent?.(new win.MouseEvent('mouseup', options));
                    button.click?.();
                    return true;
                } catch (_) {
                    return false;
                }
            }

            function setStatus(message) {
                const status = panel?.querySelector?.('.ytkit-rs-status');
                if (status) status.textContent = message;
            }

            function stop() {
                running = false;
                if (timer) win.clearTimeout(timer);
                timer = null;
                const button = panel?.querySelector?.('[data-action="toggle"]');
                if (button) button.textContent = t('reactionSenderStart', 'Start');
                setStatus(t('reactionSenderStopped', 'Stopped'));
            }

            function schedule() {
                if (!running) return;
                const available = reactionButtons();
                const selected = state.selected.filter((emoji) => available.has(emoji));
                if (!selected.length) {
                    stop();
                    setStatus(t('reactionSenderChooseOne', 'Choose at least one available reaction.'));
                    return;
                }
                const emoji = selected[Math.floor(Math.random() * selected.length)];
                dispatchReaction(available.get(emoji));
                setStatus(t('reactionSenderSentTpl', `Sent ${emoji}`).replace('{emoji}', emoji));
                timer = win.setTimeout(schedule, clampInterval(state.intervalMs));
            }

            function renderOptions() {
                const container = panel?.querySelector?.('.ytkit-rs-options');
                if (!container) return;
                container.replaceChildren();
                const available = reactionButtons();
                if (!available.size) {
                    const empty = doc.createElement('p');
                    empty.textContent = t('reactionSenderPickerHint', 'Open YouTube’s reaction picker, then refresh this list.');
                    container.append(empty);
                    return;
                }
                available.forEach((_button, emoji) => {
                    const label = doc.createElement('label');
                    const checkbox = doc.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = state.selected.includes(emoji);
                    checkbox.addEventListener('change', () => {
                        const selected = new Set(state.selected);
                        if (checkbox.checked) selected.add(emoji); else selected.delete(emoji);
                        state.selected = [...selected];
                        saveState();
                    });
                    label.append(checkbox, doc.createTextNode(emoji));
                    container.append(label);
                });
            }

            function closePanel() {
                stop();
                panel?.remove();
                panel = null;
                launcher?.focus?.({ preventScroll: true });
            }

            function openPanel() {
                if (panel) {
                    panel.focus?.({ preventScroll: true });
                    return;
                }
                panel = doc.createElement('section');
                panel.id = 'ytkit-reaction-spammer-panel';
                panel.setAttribute('role', 'dialog');
                panel.setAttribute('aria-modal', 'false');
                panel.setAttribute('aria-labelledby', 'ytkit-rs-title');

                const header = doc.createElement('header');
                const title = doc.createElement('h2');
                title.id = 'ytkit-rs-title';
                title.textContent = t('reactionSenderTitle', 'Reaction sender');
                const close = doc.createElement('button');
                close.type = 'button';
                close.textContent = t('closeBtnAria', 'Close');
                close.addEventListener('click', closePanel);
                header.append(title, close);

                const warning = doc.createElement('p');
                warning.className = 'ytkit-rs-warning';
                warning.textContent = t('reactionSenderRateWarning', 'Rapid reactions may be rate-limited by YouTube. The minimum interval is 500 ms.');
                const optionsList = doc.createElement('div');
                optionsList.className = 'ytkit-rs-options';
                const controls = doc.createElement('div');
                controls.className = 'ytkit-rs-controls';
                const interval = doc.createElement('input');
                interval.type = 'number';
                interval.min = String(Math.max(500, Number(settings.reactionSpammerMinIntervalMs) || 500));
                interval.max = '60000';
                interval.step = '100';
                interval.value = String(clampInterval(state.intervalMs));
                interval.setAttribute('aria-label', t('reactionSenderIntervalAria', 'Reaction interval in milliseconds'));
                interval.addEventListener('change', () => {
                    state.intervalMs = clampInterval(interval.value);
                    interval.value = String(state.intervalMs);
                    saveState();
                });
                const toggle = doc.createElement('button');
                toggle.type = 'button';
                toggle.dataset.action = 'toggle';
                toggle.textContent = t('reactionSenderStart', 'Start');
                toggle.addEventListener('click', () => {
                    if (running) {
                        stop();
                    } else {
                        running = true;
                        toggle.textContent = t('reactionSenderStop', 'Stop');
                        schedule();
                    }
                });
                controls.append(interval, toggle);
                const refresh = doc.createElement('button');
                refresh.type = 'button';
                refresh.textContent = t('reactionSenderRefresh', 'Refresh reactions');
                refresh.addEventListener('click', renderOptions);
                const status = doc.createElement('div');
                status.className = 'ytkit-rs-status';
                status.setAttribute('role', 'status');
                status.textContent = t('reactionSenderStopped', 'Stopped');
                panel.append(header, warning, optionsList, controls, refresh, status);
                doc.body?.append(panel);
                renderOptions();
                close.focus?.({ preventScroll: true });
            }

            async function init() {
                await loadState();
                setStyle('reactionSpammer', REACTION_CSS, true);
                launcher = doc.createElement('button');
                launcher.id = 'ytkit-reaction-spammer-launcher';
                launcher.type = 'button';
                launcher.textContent = '♥';
                launcher.title = t('reactionSenderOpenAria', 'Open reaction sender');
                launcher.setAttribute('aria-label', t('reactionSenderOpenAria', 'Open reaction sender'));
                launcher.addEventListener('click', openPanel);
                doc.body?.append(launcher);
            }

            function destroy() {
                stop();
                panel?.remove();
                launcher?.remove();
                panel = null;
                launcher = null;
                setStyle('reactionSpammer', '', false);
            }

            return { destroy, init, isRunning: () => running };
        }

        function isReactionSpammerAllowed() {
            const effective = policy?.resolveEffectiveProfile?.(settings) || 'store-safe';
            return settings.reactionSpammer === true && effective === 'github-full';
        }

        function applyStyles() {
            setStyle(
                'hideLiveChatEngagement',
                'yt-live-chat-viewer-engagement-message-renderer, yt-live-chat-toast-renderer',
                settings.hideLiveChatEngagement,
                false
            );
            doc.documentElement?.toggleAttribute?.(PREMIUM_ATTRIBUTE, settings.premiumLiveChat === true);

            const hidden = settings.hiddenChatElementsManager && Array.isArray(settings.hiddenChatElements)
                ? settings.hiddenChatElements
                : [];
            const reactionEnabled = isReactionSpammerAllowed();
            const selectors = hidden
                .filter((key) => key !== 'bots')
                .filter((key) => !(reactionEnabled && REACTION_DEPENDENT_CONTROLS.has(key)))
                .map((key) => CHAT_ELEMENT_SELECTORS[key])
                .filter(Boolean)
                .join(', ');
            setStyle('hiddenChatElementsManager', selectors, Boolean(selectors), false);
        }

        async function syncReactionController() {
            if (destroyed) return;
            if (isReactionSpammerAllowed()) {
                if (!reactionController) {
                    reactionController = createReactionController();
                    await reactionController.init();
                    if (destroyed) {
                        // destroy() ran while init was awaiting storage —
                        // tear the fresh controller down so nothing leaks
                        // into a bfcache'd document.
                        reactionController?.destroy();
                        reactionController = null;
                    }
                }
            } else if (reactionController) {
                reactionController.destroy();
                reactionController = null;
            }
        }

        function scan() {
            scanQueued = false;
            if (destroyed) return;
            scanEngagement();
            scanPremiumMessages();
            scanMessageFilters();
        }

        function queueScan() {
            if (scanQueued || destroyed) return;
            scanQueued = true;
            const schedule = win.requestAnimationFrame || ((callback) => win.setTimeout(callback, 0));
            schedule(scan);
        }

        async function applySettings(nextSettings) {
            if (destroyed) return;
            settings = { ...defaults, ...(nextSettings && typeof nextSettings === 'object' ? nextSettings : {}) };
            restoreEngagementNodes();
            restorePremiumMessages();
            restoreFilteredMessages();
            applyStyles();
            await syncReactionController();
            scan();
        }

        async function readSettings() {
            try {
                const snapshot = await browser?.storage?.local?.get?.(SETTINGS_KEY);
                return snapshot?.[SETTINGS_KEY] || {};
            } catch (_) {
                return {};
            }
        }

        async function start() {
            if (started || destroyed || !isChatPath()) return false;
            started = true;
            await applySettings(await readSettings());
            observer = new win.MutationObserver(queueScan);
            observer.observe(doc.documentElement, { childList: true, subtree: true });
            storageListener = (changes, areaName) => {
                if (areaName !== 'local' || !changes?.[SETTINGS_KEY]) return;
                void applySettings(changes[SETTINGS_KEY].newValue || {});
            };
            browser?.storage?.onChanged?.addListener?.(storageListener);
            pageHideListener = () => destroy();
            win.addEventListener?.('pagehide', pageHideListener, { once: true });
            return true;
        }

        function destroy() {
            if (destroyed) return;
            destroyed = true;
            observer?.disconnect();
            observer = null;
            if (storageListener) browser?.storage?.onChanged?.removeListener?.(storageListener);
            if (pageHideListener) win.removeEventListener?.('pagehide', pageHideListener);
            storageListener = null;
            pageHideListener = null;
            reactionController?.destroy();
            reactionController = null;
            restoreEngagementNodes();
            restorePremiumMessages();
            restoreFilteredMessages();
            ['hideLiveChatEngagement', 'hiddenChatElementsManager', 'reactionSpammer']
                .forEach((id) => setStyle(id, '', false));
            doc.documentElement?.removeAttribute?.(PREMIUM_ATTRIBUTE);
        }

        return Object.freeze({
            applySettings,
            destroy,
            getSettings: () => ({ ...settings }),
            isDestroyed: () => destroyed,
            start
        });
    }

    features.liveChat = Object.freeze({
        CHAT_ELEMENT_SELECTORS,
        CHAT_FEATURE_IDS,
        createLiveChatRuntime
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = features.liveChat;
    }
})();
