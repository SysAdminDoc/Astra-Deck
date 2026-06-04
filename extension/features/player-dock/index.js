(() => {
    'use strict';

    // extension/features/player-dock/index.js
    //
    // Next-2 monolith peel for Astra Player Dock. The module owns the
    // primary floatingLogoOnWatch runtime/state object; ytkit.js keeps the
    // inline object only as a compatibility fallback and injects monolith
    // helpers through createFloatingLogoOnWatchFeature(deps).

    function createEmptySvg() {
        if (typeof document !== 'undefined' && document.createElementNS) {
            return document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        }
        return { setAttribute() {}, appendChild() {} };
    }

    const defaultIcons = Object.freeze({
        list: createEmptySvg,
        download: createEmptySvg,
        settings: createEmptySvg
    });

    function appendStyleSheetFallback(css) {
        if (typeof document === 'undefined' || !document.createElement) return { remove() {} };
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
        return style;
    }

    function createFloatingLogoOnWatchFeature(deps = {}) {
        const {
            appState = { settings: {} },
            getFeatureById = () => null,
            ICONS = (globalThis.YTKitCore && globalThis.YTKitCore.ICONS) || defaultIcons,
            t = (_key, fallback) => fallback,
            showDownloadPopup = () => {},
            showSpeedPopup = () => {},
            toggleSettingsPanel = () => {},
            BRAND = { name: 'Astra Deck' },
            appendStyleSheet = appendStyleSheetFallback,
            addNavigateRule = () => {},
            removeNavigateRule = () => {}
        } = deps;

        return {
            id: 'floatingLogoOnWatch',
            name: 'Astra Player Dock',
            description: 'Replace native player right-controls with Astra quick links, local tools, and settings',
            group: 'Watch Page',
            icon: 'layout',
            _ruleId: 'floatingLogoRule',
            _styleEl: null,
            _cleanup() {
                const quickLinks = getFeatureById('quickLinkMenu');
                const logoWrap = document.getElementById('ytkit-po-logo-wrap');
                quickLinks?._teardownMenuInteractions?.(logoWrap);
                logoWrap?.remove();
                document.getElementById('ytkit-player-controls')?.remove();
                this._styleEl?.remove();
                this._styleEl = null;
            },
            _getLogoHref() {
                return appState.settings.logoToSubscriptions ? '/feed/subscriptions' : '/';
            },
            _inject() {
                if (!window.location.pathname.startsWith('/watch')) { document.getElementById('ytkit-player-controls')?.remove(); return; }
                const rightControls = document.querySelector('.ytp-right-controls');
                if (!rightControls || document.getElementById('ytkit-player-controls')) return;

                const wrap = document.createElement('div');
                wrap.id = 'ytkit-player-controls';

                // Compact launcher with quick links dropdown
                const logoWrap = document.createElement('div');
                logoWrap.id = 'ytkit-po-logo-wrap';

                const logoLink = document.createElement('a');
                const launcherMeta = getFeatureById('quickLinkMenu')?._getLauncherMeta?.() || {
                    href: this._getLogoHref(),
                    label: 'Go to home'
                };
                logoLink.href = launcherMeta.href;
                logoLink.title = launcherMeta.label;
                logoLink.setAttribute('aria-label', launcherMeta.label);
                logoLink.className = 'ytkit-ql-launcher ytkit-ql-launcher--player';
                const glyph = document.createElement('span');
                glyph.className = 'ytkit-ql-launcher-glyph';
                glyph.setAttribute('aria-hidden', 'true');
                glyph.appendChild(ICONS.list());
                logoLink.appendChild(glyph);
                logoWrap.appendChild(logoLink);

                // Build quick links dropdown
                const qlFeature = getFeatureById('quickLinkMenu');
                if (qlFeature && qlFeature._buildMenu) {
                    qlFeature._buildMenu(logoWrap, 'ytkit-po-drop');
                }

                // Download buttons
                if (appState.settings.showLocalDownloadButton) {
                    const dlBtn = document.createElement('button');
                    dlBtn.type = 'button';
                    dlBtn.className = 'ytp-button ytkit-player-btn ytkit-po-dl';
                    dlBtn.title = t('playerDownloadTitle', 'Download Video');
                    dlBtn.setAttribute('aria-label', t('playerDownloadAria', 'Download video'));
                    const dlIcon = ICONS.download();
                    dlIcon.setAttribute('aria-hidden', 'true');
                    dlBtn.appendChild(dlIcon);
                    dlBtn.addEventListener('click', (e) => { e.stopPropagation(); showDownloadPopup(dlBtn); });
                    wrap.appendChild(dlBtn);
                }

                // Speed control — sits between Download and Settings.
                // Drives the existing persistentSpeed feature so the chosen
                // value auto-applies to every subsequent video without the
                // user having to open Settings.
                const speedBtn = document.createElement('button');
                speedBtn.type = 'button';
                speedBtn.className = 'ytp-button ytkit-player-btn ytkit-po-speed';
                speedBtn.setAttribute('aria-haspopup', 'menu');
                speedBtn.setAttribute('aria-expanded', 'false');
                const _formatSpeedLabel = (v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n) || n <= 0) return '1×';
                    return (Number.isInteger(n) ? n.toString() : n.toString().replace(/0+$/, '').replace(/\.$/, '')) + '×';
                };
                const _syncSpeedBtnLabel = () => {
                    const v = parseFloat(appState?.settings?.persistentSpeedValue) || 1;
                    const lbl = _formatSpeedLabel(v);
                    speedBtn.textContent = lbl;
                    speedBtn.title = t('speedBtnTitleTpl', `Default playback speed: ${lbl} — applies to every video`).replace('{speed}', lbl);
                    speedBtn.setAttribute('aria-label', t('speedBtnAriaTpl', `Default playback speed ${lbl}. Click to change.`).replace('{speed}', lbl));
                };
                _syncSpeedBtnLabel();
                speedBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showSpeedPopup(speedBtn, _syncSpeedBtnLabel);
                });
                wrap.appendChild(speedBtn);

                // Settings gear
                const gearBtn = document.createElement('button');
                gearBtn.type = 'button';
                gearBtn.className = 'ytp-button ytkit-player-btn ytkit-po-gear';
                gearBtn.title = t('playerGearTitleTpl', `${BRAND.name} Settings`).replace('{brand}', BRAND.name);
                gearBtn.setAttribute('aria-label', t('playerGearAriaTpl', `Open ${BRAND.name} settings`).replace('{brand}', BRAND.name));
                gearBtn.setAttribute('aria-haspopup', 'dialog');
                const gearIcon = ICONS.settings();
                gearIcon.setAttribute('aria-hidden', 'true');
                gearBtn.appendChild(gearIcon);
                gearBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleSettingsPanel();
                });
                wrap.appendChild(gearBtn);
                wrap.appendChild(logoWrap);

                rightControls.appendChild(wrap);
                getFeatureById('stickyVideo')?._dockSplitHeader?.();
            },
            init() {
                this._styleEl = appendStyleSheet(`
                    /* Hide native right controls, keep our injected elements */
                    .ytp-right-controls > *:not(#ytkit-player-controls) {
                        display: none !important;
                    }

                    .ytp-right-controls {
                        display: flex !important;
                        align-items: center !important;
                        justify-content: flex-end !important;
                        height: 100% !important;
                        box-sizing: border-box !important;
                        overflow: visible !important;
                    }

                    .ytp-right-controls > #ytkit-player-controls {
                        order: 999 !important;
                    }

                    #ytkit-player-controls {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: flex-end !important;
                        position: relative !important;
                        bottom: 6px !important;
                        z-index: 60 !important;
                        height: auto !important;
                        min-height: 38px !important;
                        margin: 0 0 0 8px !important;
                        padding: 3px !important;
                        gap: 3px !important;
                        border-radius: 12px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.065), rgba(255, 255, 255, 0.018)),
                            rgba(6, 9, 14, 0.58) !important;
                        box-shadow:
                            0 10px 26px rgba(0, 0, 0, 0.26),
                            inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
                        backdrop-filter: none;
                        -webkit-backdrop-filter: none;
                        overflow: visible !important;
                        flex-shrink: 0 !important;
                    }

                    #ytkit-player-controls > * {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        flex-shrink: 0 !important;
                    }

                    #ytkit-player-controls .ytkit-player-btn {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        position: relative !important;
                        top: 0 !important;
                        visibility: visible !important;
                        width: 32px !important;
                        min-width: 32px !important;
                        height: 32px !important;
                        min-height: 32px !important;
                    }

                    #ytkit-po-logo-wrap {
                        position: relative !important;
                        z-index: 1 !important;
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        gap: 3px !important;
                        height: auto !important;
                        margin: 0 0 0 2px !important;
                        padding-left: 5px !important;
                    }

                    #ytkit-po-logo-wrap::before {
                        content: '' !important;
                        width: 1px !important;
                        height: 18px !important;
                        margin-right: 2px !important;
                        border-radius: 10px !important;
                        background: rgba(255, 255, 255, 0.12) !important;
                        flex: 0 0 auto !important;
                    }

                    #ytkit-player-controls .ytkit-player-btn,
                    #ytkit-po-logo-wrap .ytkit-ql-launcher--player,
                    #ytkit-po-logo-wrap .ytkit-ql-toggle {
                        position: relative !important;
                        isolation: isolate !important;
                        border-radius: 11px !important;
                        border: 1px solid rgba(255, 255, 255, 0.085) !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.075), rgba(255, 255, 255, 0.025)),
                            rgba(255, 255, 255, 0.028) !important;
                        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.055) !important;
                        color: rgba(238, 243, 252, 0.88) !important;
                        transition:
                            background-color 160ms var(--ytkit-ease-out),
                            border-color 160ms var(--ytkit-ease-out),
                            color 160ms var(--ytkit-ease-out),
                            box-shadow 160ms var(--ytkit-ease-out),
                            transform 160ms var(--ytkit-ease-out) !important;
                    }

                    #ytkit-player-controls .ytkit-player-btn:hover,
                    #ytkit-po-logo-wrap .ytkit-ql-launcher--player:hover,
                    #ytkit-po-logo-wrap .ytkit-ql-toggle:hover {
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.045)),
                            rgba(255, 255, 255, 0.052) !important;
                        border-color: rgba(255, 255, 255, 0.17) !important;
                        box-shadow:
                            0 8px 18px rgba(0, 0, 0, 0.28),
                            inset 0 1px 0 rgba(255, 255, 255, 0.09) !important;
                        color: #fff !important;
                        transform: translateY(-1px) !important;
                    }

                    #ytkit-player-controls .ytkit-player-btn:active,
                    #ytkit-po-logo-wrap .ytkit-ql-launcher--player:active,
                    #ytkit-po-logo-wrap .ytkit-ql-toggle:active {
                        transform: translateY(0) scale(0.96) !important;
                    }

                    #ytkit-po-logo-wrap .ytkit-ql-launcher--player {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        gap: 0 !important;
                        width: 32px !important;
                        min-width: 32px !important;
                        height: 32px !important;
                        min-height: 32px !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        text-decoration: none !important;
                        color: rgba(209, 229, 255, 0.92) !important;
                        backdrop-filter: none !important;
                        -webkit-backdrop-filter: none !important;
                        flex-shrink: 0 !important;
                    }

                    #ytkit-po-logo-wrap .ytkit-ql-launcher--player:hover {
                        border-color: rgba(96, 165, 250, 0.28) !important;
                        background:
                            linear-gradient(180deg, rgba(96, 165, 250, 0.16), rgba(96, 165, 250, 0.055)),
                            rgba(255, 255, 255, 0.045) !important;
                    }

                    #ytkit-po-logo-wrap .ytkit-ql-toggle {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        width: 28px !important;
                        min-width: 28px !important;
                        height: 32px !important;
                        min-height: 32px !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        color: rgba(209, 229, 255, 0.86) !important;
                    }

                    #ytkit-po-logo-wrap .ytkit-ql-toggle:hover {
                        border-color: rgba(96, 165, 250, 0.28) !important;
                        background:
                            linear-gradient(180deg, rgba(96, 165, 250, 0.16), rgba(96, 165, 250, 0.055)),
                            rgba(255, 255, 255, 0.045) !important;
                    }

                    #ytkit-po-logo-wrap.ytkit-ql-open .ytkit-ql-launcher--player,
                    #ytkit-po-logo-wrap.ytkit-ql-open .ytkit-ql-toggle {
                        border-color: rgba(96, 165, 250, 0.34) !important;
                        background:
                            linear-gradient(180deg, rgba(96, 165, 250, 0.2), rgba(96, 165, 250, 0.075)),
                            rgba(255, 255, 255, 0.052) !important;
                        color: #fff !important;
                    }

                    #ytkit-po-logo-wrap.ytkit-ql-open {
                        z-index: 80 !important;
                    }

                    #ytkit-po-logo-wrap .ytkit-ql-launcher--player .ytkit-ql-launcher-glyph {
                        width: 16px !important;
                        height: 16px !important;
                    }

                    #ytkit-po-logo-wrap .ytkit-ql-launcher--player .ytkit-ql-launcher-glyph svg {
                        width: 16px !important;
                        height: 16px !important;
                    }

                    #ytkit-player-controls .ytkit-po-dl,
                    #ytkit-player-controls .ytkit-po-gear {
                        border-radius: 11px !important;
                    }

                    #ytkit-player-controls .ytkit-po-dl {
                        color: rgba(202, 255, 222, 0.96) !important;
                        border-color: rgba(34, 197, 94, 0.18) !important;
                        background:
                            linear-gradient(180deg, rgba(34, 197, 94, 0.16), rgba(34, 197, 94, 0.052)),
                            rgba(255, 255, 255, 0.03) !important;
                    }

                    #ytkit-player-controls .ytkit-po-dl:hover {
                        background:
                            linear-gradient(180deg, rgba(34, 197, 94, 0.22), rgba(34, 197, 94, 0.08)),
                            rgba(255, 255, 255, 0.046) !important;
                        border-color: rgba(34, 197, 94, 0.34) !important;
                    }

                    #ytkit-player-controls .ytkit-po-gear {
                        color: rgba(255, 221, 208, 0.94) !important;
                        border-color: rgba(255, 107, 74, 0.16) !important;
                        background:
                            linear-gradient(180deg, rgba(255, 107, 74, 0.14), rgba(255, 107, 74, 0.045)),
                            rgba(255, 255, 255, 0.03) !important;
                    }

                    #ytkit-player-controls .ytkit-po-gear:hover {
                        background:
                            linear-gradient(180deg, rgba(255, 107, 74, 0.21), rgba(255, 107, 74, 0.075)),
                            rgba(255, 255, 255, 0.046) !important;
                        border-color: rgba(255, 107, 74, 0.3) !important;
                    }

                    #ytkit-player-controls .ytkit-po-dl svg,
                    #ytkit-player-controls .ytkit-po-gear svg {
                        width: 16px !important;
                        height: 16px !important;
                        display: block !important;
                        overflow: visible !important;
                    }

                    #ytkit-player-controls .ytkit-po-dl svg,
                    #ytkit-player-controls .ytkit-po-dl svg *,
                    #ytkit-player-controls .ytkit-po-gear svg,
                    #ytkit-player-controls .ytkit-po-gear svg * {
                        fill: none !important;
                        stroke: currentColor !important;
                        stroke-width: 1.9 !important;
                        stroke-linecap: round !important;
                        stroke-linejoin: round !important;
                        vector-effect: non-scaling-stroke !important;
                    }

                    #ytkit-po-drop {
                        bottom: calc(100% + 24px) !important;
                        right: -2px !important;
                        min-width: 170px !important;
                        max-height: min(420px, calc(100vh - 132px)) !important;
                        padding: 6px !important;
                        border-radius: 12px !important;
                        border-color: rgba(255, 255, 255, 0.1) !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.022)),
                            rgba(7, 10, 16, 0.96) !important;
                        box-shadow:
                            0 22px 46px rgba(0, 0, 0, 0.46),
                            inset 0 1px 0 rgba(255, 255, 255, 0.055) !important;
                        backdrop-filter: none;
                        -webkit-backdrop-filter: none;
                        overflow-x: hidden !important;
                        overflow-y: auto !important;
                        overscroll-behavior: contain !important;
                        z-index: 80 !important;
                    }

                    #ytkit-po-drop::-webkit-scrollbar {
                        width: 8px !important;
                    }

                    #ytkit-po-drop::-webkit-scrollbar-track {
                        background: transparent !important;
                    }

                    #ytkit-po-drop::-webkit-scrollbar-thumb {
                        border: 2px solid transparent !important;
                        border-radius: 10px !important;
                        background: rgba(255, 255, 255, 0.2) !important;
                        background-clip: padding-box !important;
                    }

                    #ytkit-po-drop .ytkit-ql-row {
                        display: flex !important;
                        align-items: center !important;
                        gap: 4px !important;
                        min-width: 0 !important;
                    }

                    #ytkit-po-drop .ytkit-ql-item {
                        display: flex !important;
                        align-items: center !important;
                        flex: 1 1 auto !important;
                        min-width: 0 !important;
                        gap: 7px !important;
                        padding: 5px 7px !important;
                        min-height: 28px !important;
                        border-radius: 9px !important;
                        font-size: 10.5px !important;
                        line-height: 1.05 !important;
                        color: rgba(235, 241, 250, 0.88) !important;
                    }

                    #ytkit-po-drop .ytkit-ql-item:hover {
                        background: rgba(255, 255, 255, 0.08) !important;
                        color: #fff !important;
                    }

                    #ytkit-po-drop .ytkit-ql-icon {
                        width: 12px !important;
                        height: 12px !important;
                    }

                    #ytkit-po-drop .ytkit-ql-item span {
                        font-size: 10.5px !important;
                        line-height: 1.05 !important;
                    }

                    #ytkit-po-drop .ytkit-ql-del {
                        flex: 0 0 26px !important;
                        width: 26px !important;
                        min-width: 26px !important;
                        height: 26px !important;
                        min-height: 26px !important;
                        margin: 0 2px 0 0 !important;
                        padding: 0 !important;
                        border-radius: 8px !important;
                    }

                    #ytkit-po-drop.ytkit-ql-editing .ytkit-ql-del {
                        display: inline-flex !important;
                    }

                    #ytkit-po-drop .ytkit-ql-del svg {
                        width: 12px !important;
                        height: 12px !important;
                    }

                    #ytkit-po-drop .ytkit-ql-divider {
                        margin: 5px 2px !important;
                    }

                    #ytkit-po-drop .ytkit-ql-bottom {
                        gap: 4px !important;
                        padding: 3px 0 0 !important;
                    }

                    #ytkit-po-drop .ytkit-ql-bottom-btn {
                        min-height: 28px !important;
                        border-radius: 8px !important;
                    }

                    #ytkit-po-drop .ytkit-ql-add-form {
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto !important;
                        align-items: center !important;
                        gap: 5px !important;
                        padding: 2px 1px 1px !important;
                    }

                    #ytkit-po-drop .ytkit-ql-form-note {
                        grid-column: 1 / -1 !important;
                        margin: 0 0 1px !important;
                    }

                    #ytkit-po-drop .ytkit-ql-input {
                        width: auto !important;
                        min-width: 0 !important;
                        height: 27px !important;
                        padding: 0 6px !important;
                        border-radius: 8px !important;
                        font-size: 10px !important;
                    }

                    #ytkit-po-drop .ytkit-ql-add-btn {
                        min-height: 27px !important;
                        padding: 0 8px !important;
                        border-radius: 8px !important;
                        font-size: 10px !important;
                    }

                    .ytkit-po-gear svg {
                        transition: none !important;
                    }

                    .ytkit-po-gear:hover svg {
                        transform: none !important;
                    }

                    button.ytp-button.ytp-autonav-toggle.delhi-fast-follow-autonav-toggle {
                        display: none !important;
                    }
                `);

                const self = this;
                addNavigateRule(this._ruleId, () => self._inject());
            },
            destroy() {
                removeNavigateRule(this._ruleId);
                this._cleanup();
            }
        };
    }

    const api = {
        createFloatingLogoOnWatchFeature
    };

    const root = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    root.floatingLogoOnWatch = Object.assign(root.floatingLogoOnWatch || {}, api);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
