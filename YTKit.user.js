// ==UserScript==
// @name         YTKit: YouTube Customization Suite
// @namespace    https://github.com/SysAdminDoc/YTKit
// @version      5.2
// @description  Ultimate YouTube customization. Hide elements, control layout, and enhance your viewing experience with a modern UI.
// @author       Matthew Parker
// @match        https://*.youtube.com/*
// @match        https://*.youtube-nocookie.com/*
// @match        https://youtu.be/*
// @exclude      https://*.youtube.com/embed/*
// @exclude      https://music.youtube.com/*
// @exclude      https://www.youtube.com/shorts/*
// @exclude      https://m.youtube.com/*
// @exclude      https://www.youtube.com/playlist?list=*
// @icon         https://github.com/SysAdminDoc/YTKit/blob/main/assets/ytlogo.png?raw=true
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_getResourceText
// @grant        GM_notification
// @grant        GM_download
// @grant        GM.xmlHttpRequest
// @grant        GM_addStyle
// @grant        GM_openInTab
// @connect      sponsor.ajay.app
// @resource     betterDarkMode https://github.com/SysAdminDoc/YTKit/raw/refs/heads/main/Themes/youtube-dark-theme.css
// @resource     catppuccinMocha https://github.com/SysAdminDoc/YTKit/raw/refs/heads/main/Themes/youtube-catppuccin-theme.css
// @resource     nyanCatProgressBar https://raw.githubusercontent.com/SysAdminDoc/YTKit/raw/refs/heads/main/Themes/nyan-cat-progress-bar.css
// @updateURL    https://github.com/SysAdminDoc/YTKit/raw/refs/heads/main/YTKit.user.js
// @downloadURL  https://github.com/SysAdminDoc/YTKit/raw/refs/heads/main/YTKit.user.js
// @require      https://raw.githubusercontent.com/SysAdminDoc/YTKit/refs/heads/main/features/header.js
// @require      https://raw.githubusercontent.com/SysAdminDoc/YTKit/refs/heads/main/features/sidebar.js
// @require      https://raw.githubusercontent.com/SysAdminDoc/YTKit/refs/heads/main/features/themes.js
// @require      https://raw.githubusercontent.com/SysAdminDoc/YTKit/refs/heads/main/features/general.js
// @require      https://raw.githubusercontent.com/SysAdminDoc/YTKit/refs/heads/main/features/watch-page.js
// @require      https://raw.githubusercontent.com/SysAdminDoc/YTKit/refs/heads/main/features/modules.js
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // This array will be populated by the required feature files.
    const features = [];

    // ——————————————————————————————————————————————————————————————————————————
    // SECTION 0: DYNAMIC CONTENT/STYLE ENGINE
    // ——————————————————————————————————————————————————————————————————————————
    let mutationObserver = null;
    const mutationRules = new Map();
    const navigateRules = new Map();
    let isNavigateListenerAttached = false;

    function waitForElement(selector, callback, timeout = 10000) {
        const intervalTime = 100;
        let elapsedTime = 0;
        const interval = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(interval);
                callback(element);
            }
            elapsedTime += intervalTime;
            if (elapsedTime >= timeout) {
                clearInterval(interval);
            }
        }, intervalTime);
    }

    const runNavigateRules = () => {
        for (const rule of navigateRules.values()) {
            try { rule(document.body); } catch (e) { console.error('[YT Suite] Error applying navigate rule:', e); }
        }
    };
    const ensureNavigateListener = () => {
        if (isNavigateListenerAttached) return;
        window.addEventListener('yt-navigate-finish', runNavigateRules);
        isNavigateListenerAttached = true;
    };
    function addNavigateRule(id, ruleFn) {
        ensureNavigateListener();
        navigateRules.set(id, ruleFn);
        ruleFn(document.body);
    }
    function removeNavigateRule(id) {
        navigateRules.delete(id);
    }

    const runMutationRules = (targetNode) => {
        for (const rule of mutationRules.values()) {
            try { rule(targetNode); } catch (e) { console.error('[YT Suite] Error applying mutation rule:', e); }
        }
    };
    const observerCallback = () => {
        runMutationRules(document.body);
    };
    function startObserver() {
        if (mutationObserver) return;
        mutationObserver = new MutationObserver(observerCallback);
        mutationObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['theater', 'fullscreen', 'hidden', 'video-id', 'page-subtype']
        });
    }
    function stopObserver() {
        if (mutationObserver) {
            mutationObserver.disconnect();
            mutationObserver = null;
        }
    }
    function addMutationRule(id, ruleFn) {
        if (mutationRules.size === 0) startObserver();
        mutationRules.set(id, ruleFn);
        ruleFn(document.body);
    }
    function removeMutationRule(id) {
        mutationRules.delete(id);
        if (mutationRules.size === 0) stopObserver();
    }

    function injectStyle(selector, featureId, isRawCss = false) {
        const style = document.createElement('style');
        style.id = `yt-suite-style-${featureId}`;
        style.textContent = isRawCss ? selector : `${selector} { display: none !important; }`;
        document.head.appendChild(style);
        return style;
    }


    // ——————————————————————————————————————————————————————————————————————————
    // SECTION 1: SETTINGS MANAGER
    // ——————————————————————————————————————————————————————————————————————————
    const settingsManager = {
        defaults: {
            // ... (defaults from your original script)
        },
        async load() { /* ... */ },
        async save(settings) { /* ... */ },
        async getFirstRunStatus() { /* ... */ },
        async setFirstRunStatus(hasRun) { /* ... */ }
    };


    // ——————————————————————————————————————————————————————————————————————————
    // SECTION 3: DOM HELPERS & CORE UI LOGIC
    // ——————————————————————————————————————————————————————————————————————————
    let appState = {};
    function applyBotFilter() { /* ... */ }
    function applyKeywordFilter() { /* ... */ }


    // ——————————————————————————————————————————————————————————————————————————
    // SECTION 4: UI & SETTINGS PANEL
    // ——————————————————————————————————————————————————————————————————————————
    const ICONS = { /* ... */ };
    function createIcon(iconData) { /* ... */ }
    function injectSettingsButton() { /* ... */ }
    function buildSettingsPanel() { /* ... */ }
    function buildToggleAllRow(groupId, groupName) { /* ... */ }
    function buildSettingRow(f) { /* ... */ }
    function createToast(message, type = 'success', duration = 3000) { /* ... */ }
    function updateAllToggleStates() { /* ... */ }
    function attachUIEventListeners() { /* ... */ }


    // ——————————————————————————————————————————————————————————————————————————
    // SECTION 5: STYLES
    // ——————————————————————————————————————————————————————————————————————————
    function injectPanelStyles() { /* ... */ }


    // ——————————————————————————————————————————————————————————————————————————
    // SECTION 6: MAIN BOOTSTRAP
    // ——————————————————————————————————————————————————————————————————————————
    async function main() {
        appState.settings = await settingsManager.load();
        document.documentElement.setAttribute('data-ycs-theme', appState.settings.panelTheme);
        injectPanelStyles();
        buildSettingsPanel();
        injectSettingsButton();
        attachUIEventListeners();
        updateAllToggleStates();

        features.forEach(f => {
            if (appState.settings[f.id]) {
                try {
                    f.init?.();
                } catch (error) {
                    console.error(`[YT Suite] Error initializing feature "${f.id}":`, error);
                }
            }
        });

        document.querySelectorAll('.ycs-feature-cb:checked').forEach(cb => {
            const row = cb.closest('[data-feature-id]');
            if(row) {
                const featureId = row.dataset.featureId;
                const subPanel = document.querySelector(`.ycs-sub-panel[data-parent-feature="${featureId}"]`);
                if (subPanel) subPanel.style.display = 'flex';
            }
        });

        const hasRun = await settingsManager.getFirstRunStatus();
        if (!hasRun) {
            document.body.classList.add('ycs-panel-open');
            await settingsManager.setFirstRunStatus(true);
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        main();
    } else {
        window.addEventListener('DOMContentLoaded', main);
    }

})();
