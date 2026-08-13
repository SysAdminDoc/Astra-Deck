#!/usr/bin/env node
'use strict';

// Rendered visual smoke for the in-page settings overlay.
//
// Static a11y/theme audits (audit-overlays-a11y.js, check-contrast.js) pin
// source contracts but cannot prove the settings window actually RENDERS.
// This smoke stages the real ISOLATED-world content-script stack onto a
// local fixture page with a minimal chrome-API stub, opens the overlay
// through the real YTKIT_OPEN_PANEL message path in Chromium,
// captures desktop plus legacy narrow-window screenshots for dark/light/RTL states, and fails
// on blank render, horizontal overflow, a missing close/focus target, or
// unreadable primary controls.
//
// Usage: npm run smoke:settings-overlay [-- --browser <path>] [--keep-stage]
//        npm run smoke:settings-overlay -- --desktop-only
//        npm run smoke:settings-overlay -- --health-only
//        YTKIT_VISUAL_ISOLATED=1 node scripts/smoke-settings-overlay.js --headed-private
// Screenshots land in build/settings-overlay-smoke/.

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const WebSocket = require('ws');
const { copyDir } = require('../build-extension.js');

const REPO_ROOT = path.join(__dirname, '..');
const EXT_DIR = path.join(REPO_ROOT, 'extension');
const OUT_DIR = path.join(REPO_ROOT, 'build', 'settings-overlay-smoke');
const PANEL_SELECTOR = '#ytkit-settings-panel, [data-ytkit-surface="control-center"], .ytkit-control-center, #ytkit-panel, .ytkit-panel';

const STATES = [
    { name: 'desktop-dark', width: 1440, height: 900, dark: true, dir: 'ltr', mobile: false },
    { name: 'desktop-light', width: 1440, height: 900, dark: false, dir: 'ltr', mobile: false },
    { name: 'desktop-rtl', width: 1440, height: 900, dark: true, dir: 'rtl', mobile: false },
    { name: 'desktop-wide', width: 1920, height: 1080, dark: true, dir: 'ltr', mobile: false },
    { name: 'tablet-dark', width: 760, height: 900, dark: true, dir: 'ltr', mobile: false },
    // mobile: false is deliberate — YouTube desktop is not a mobile-UA site;
    // the honest narrow-screen case is a desktop window at phone width, where
    // window.innerWidth really is 390 (mobile emulation without a viewport
    // meta falls back to a 980px layout viewport and hides real overflow).
    { name: 'mobile-dark', width: 390, height: 844, dark: true, dir: 'ltr', mobile: false },
    { name: 'mobile-light', width: 390, height: 844, dark: false, dir: 'ltr', mobile: false },
];

function parseArgs(argv) {
    const opts = {
        browser: '',
        keepStage: false,
        fallbackOnly: false,
        healthOnly: false,
        headedPrivate: false,
        desktopOnly: false,
        timeoutMs: 45000
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--browser') { opts.browser = path.resolve(argv[++i] || ''); continue; }
        if (arg === '--keep-stage') { opts.keepStage = true; continue; }
        if (arg === '--fallback-only') { opts.fallbackOnly = true; continue; }
        if (arg === '--health-only') { opts.healthOnly = true; continue; }
        if (arg === '--headed-private') { opts.headedPrivate = true; continue; }
        if (arg === '--desktop-only') { opts.desktopOnly = true; continue; }
        if (arg === '--timeout') { opts.timeoutMs = Number(argv[++i]) || opts.timeoutMs; continue; }
        throw new Error(`unknown argument: ${arg}`);
    }
    return opts;
}

function findBrowser(cliPath) {
    const candidates = [];
    const push = (p) => { if (p) candidates.push(p); };
    push(cliPath);
    push(process.env.CHROMIUM_PATH);
    push(process.env.CHROME_PATH);
    push(process.env.EDGE_PATH);
    if (process.platform === 'win32') {
        const pf = process.env.ProgramFiles || 'C:\\Program Files';
        const pfx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        push(path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'));
        push(path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
        push(path.join(pfx86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    } else if (process.platform === 'darwin') {
        push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
        push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
    } else {
        push('/usr/bin/google-chrome');
        push('/usr/bin/chromium');
        push('/usr/bin/chromium-browser');
    }
    return candidates.find((p) => p && fs.existsSync(p)) || null;
}

const CHROME_STUB = `'use strict';
// Minimal chrome-API stub so the real content-script stack boots on a
// local fixture page. Storage is in-memory; onMessage listeners are
// captured so the smoke can drive the real YTKIT_OPEN_PANEL path.
(() => {
    const store = Object.create(null);
    const smokeParams = new URLSearchParams(globalThis.location?.search || '');
    const injectedRuntimeSettings = null; // __ASTRA_SMOKE_RUNTIME_SETTINGS__
    const seededRuntimeSettings = { transcriptViewer: true };
    if (smokeParams.get('settingsDiff') === '1') {
        Object.assign(seededRuntimeSettings, {
            githubFullProfile: true,
            customCssCode: '/* astra-settings-diff-smoke-secret */'
        });
    }
    if (smokeParams.get('filterGrant') === '1') {
        Object.assign(seededRuntimeSettings, {
            privacyDataFlowPanel: true,
            hideVideosFilterListUrl: 'https://lists.example.com/rules.json'
        });
    }
    store.ytSuiteSettings = injectedRuntimeSettings || seededRuntimeSettings;
    const permissionOrigins = new Set(smokeParams.get('filterGrant') === '1'
        ? ['https://lists.example.com/*']
        : []);
    const requestedLocale = smokeParams.get('locale');
    if (requestedLocale) store._localeOverride = requestedLocale;
    const messageListeners = [];
    const changeListeners = [];
    const normalizeKeys = (keys) => {
        if (keys == null) return Object.keys(store);
        if (typeof keys === 'string') return [keys];
        if (Array.isArray(keys)) return keys;
        return Object.keys(keys);
    };
    const readOut = (keys) => {
        const out = {};
        for (const key of normalizeKeys(keys)) {
            if (key in store) out[key] = store[key];
            else if (keys && typeof keys === 'object' && !Array.isArray(keys)) out[key] = keys[key];
        }
        return out;
    };
    const settle = (value, cb) => {
        if (typeof cb === 'function') { cb(value); return undefined; }
        return Promise.resolve(value);
    };
    const clone = (value) => value === undefined
        ? undefined
        : JSON.parse(JSON.stringify(value));
    const permissionRequestOrigins = (request) => Array.isArray(request?.origins)
        ? request.origins.filter((origin) => typeof origin === 'string' && origin)
        : [];
    const handleRuntimeMessage = (message) => {
        const current = clone(store.ytSuiteSettings || {});
        if (message?.type === 'YTKIT_MUTATE_SETTING') {
            const next = { ...current, [message.key]: clone(message.value) };
            store.ytSuiteSettings = next;
            return {
                ok: true,
                persisted: true,
                key: message.key,
                previous: clone(current[message.key]),
                value: clone(next[message.key]),
                settings: clone(next)
            };
        }
        if (message?.type === 'YTKIT_MUTATE_SETTINGS') {
            const next = { ...current, ...clone(message.changes || {}) };
            store.ytSuiteSettings = next;
            return { ok: true, persisted: true, previous: current, value: clone(next), settings: clone(next) };
        }
        if (message?.type === 'YTKIT_REPLACE_SETTINGS') {
            const next = clone(message.settings || {});
            store.ytSuiteSettings = next;
            return { ok: true, persisted: true, previous: current, value: clone(next), settings: clone(next) };
        }
        return {};
    };
    const storageArea = {
        get: (keys, cb) => settle(readOut(keys), cb),
        set: (items, cb) => { Object.assign(store, items); return settle(undefined, cb); },
        remove: (keys, cb) => {
            for (const key of normalizeKeys(keys)) delete store[key];
            return settle(undefined, cb);
        },
        clear: (cb) => {
            for (const key of Object.keys(store)) delete store[key];
            return settle(undefined, cb);
        },
        getBytesInUse: (_keys, cb) => settle(JSON.stringify(store).length, cb)
    };
    const noOpEvent = { addListener() {}, removeListener() {} };
    globalThis.chrome = {
        runtime: {
            id: 'ytkit-smoke-fixture',
            getURL: (p) => new URL(p, document.baseURI).href,
            getManifest: () => ({
                version: '0.0.0-smoke',
                host_permissions: ['https://*.youtube.com/*'],
                optional_host_permissions: ['https://*/*']
            }),
            sendMessage: (msg, cb) => settle(handleRuntimeMessage(msg), cb),
            onMessage: {
                addListener: (fn) => messageListeners.push(fn),
                removeListener: (fn) => {
                    const index = messageListeners.indexOf(fn);
                    if (index >= 0) messageListeners.splice(index, 1);
                }
            },
            lastError: null
        },
        storage: {
            local: storageArea,
            session: storageArea,
            onChanged: { addListener: (fn) => changeListeners.push(fn) }
        },
        i18n: {
            getMessage: () => '',
            getUILanguage: () => document.documentElement.dir === 'rtl' ? 'ar' : 'en'
        },
        permissions: {
            contains: (request, cb) => settle(
                permissionRequestOrigins(request).every((origin) => permissionOrigins.has(origin)),
                cb
            ),
            getAll: (cb) => settle({ origins: Array.from(permissionOrigins), permissions: [] }, cb),
            request: (request, cb) => {
                for (const origin of permissionRequestOrigins(request)) permissionOrigins.add(origin);
                return settle(true, cb);
            },
            remove: (request, cb) => {
                let removed = false;
                for (const origin of permissionRequestOrigins(request)) {
                    removed = permissionOrigins.delete(origin) || removed;
                }
                return settle(removed, cb);
            },
            onAdded: noOpEvent,
            onRemoved: noOpEvent
        },
        tabs: {
            query: (_q, cb) => settle([], cb),
            sendMessage: (_id, _msg, cb) => settle({}, cb),
            create: (_opts, cb) => settle({ id: 1 }, cb)
        },
        sidePanel: { open: (_opts, cb) => settle(undefined, cb) },
        downloads: { download: (_opts, cb) => settle(1, cb) },
        action: { openPopup: (cb) => settle(undefined, cb) },
        extension: { inIncognitoContext: false }
    };
    globalThis.__ytkitSmoke = {
        openPanel() {
            let dispatched = 0;
            for (const listener of messageListeners) {
                try { listener({ type: 'YTKIT_OPEN_PANEL' }, {}, () => {}); dispatched += 1; }
                catch (err) { console.warn('smoke openPanel listener failed', err); }
            }
            return dispatched;
        },
        listenerCount: () => messageListeners.length,
        permissionOrigins: () => Array.from(permissionOrigins),
        readSettings: () => clone(store.ytSuiteSettings || {})
    };
})();
`;

const IN_PAGE_CHECKS = `(() => {
    const PANEL_SELECTOR = ${JSON.stringify(PANEL_SELECTOR)};
    const failures = [];
    const panel = document.querySelector(PANEL_SELECTOR);
    if (!panel) return JSON.stringify({ failures: ['settings overlay root not found (' + PANEL_SELECTOR + ')'] });
    const hasPopover = typeof globalThis.HTMLElement?.prototype?.showPopover === 'function'
        && typeof globalThis.HTMLElement?.prototype?.hidePopover === 'function';
    if (hasPopover) {
        if (panel.getAttribute('popover') !== 'manual') failures.push('settings panel did not opt into manual Popover mode');
        if (!panel.matches(':popover-open')) failures.push('settings panel is not open in the Popover top layer');
    }
    const rect = panel.getBoundingClientRect();
    const controls = panel.querySelectorAll('button, input, select, textarea, [role="tab"]');
    if (rect.width < 280 || rect.height < 300) {
        failures.push('blank/collapsed render: panel rect ' + Math.round(rect.width) + 'x' + Math.round(rect.height));
    }
    if (controls.length < 10) {
        failures.push('blank render: only ' + controls.length + ' interactive controls inside the panel');
    }
    if (rect.left < -1 || rect.right > window.innerWidth + 1) {
        const panelStyle = getComputedStyle(panel);
        failures.push('horizontal overflow: panel spans ' + Math.round(rect.left) + '..' + Math.round(rect.right) + ' in a ' + window.innerWidth + 'px viewport (left ' + panelStyle.left + ', top ' + panelStyle.top + ', inset ' + panelStyle.inset + ', margin ' + panelStyle.margin + ', transform ' + panelStyle.transform + ')');
    }
    if (document.documentElement.scrollWidth > window.innerWidth + 1) {
        failures.push('document horizontal overflow: scrollWidth ' + document.documentElement.scrollWidth + ' > viewport ' + window.innerWidth);
    }
    const headerSearch = panel.querySelector('.ytkit-header > .ytkit-command-search #ytkit-search');
    const liveBadge = panel.querySelector('.ytkit-header-live');
    const sidebarFooter = panel.querySelector('.ytkit-sidebar > .ytkit-sidebar-footer');
    const footerActions = panel.querySelectorAll('.ytkit-footer-actions > button');
    const historyImport = panel.querySelector('.ytkit-insights #ytkit-import-history');
    const insightsRail = panel.querySelector('.ytkit-insights');
    const footerStatus = panel.querySelector('.ytkit-panel-status');
    const selectChrome = panel.querySelector('.ytkit-select-shell-chrome');
    const obsoleteVersionBadge = panel.querySelector('#ytkit-whats-new-badge');
    if (!headerSearch) failures.push('command search is not mounted in the header');
    if (!liveBadge || getComputedStyle(liveBadge).display === 'none') failures.push('live connection badge is not visible');
    if (!sidebarFooter) failures.push('version and project tools are not mounted in the sidebar footer');
    if (footerActions.length !== 4) failures.push('footer action parity expected 4 buttons, found ' + footerActions.length);
    if (!historyImport) failures.push('history import action is not mounted in the insights rail');
    if (obsoleteVersionBadge) failures.push('obsolete version notification badge is visible');
    if (insightsRail && getComputedStyle(insightsRail).display !== 'none') {
        failures.push('redundant desktop insights rail is visible');
    }
    if (selectChrome && getComputedStyle(selectChrome).display !== 'none') {
        failures.push('decorative select outline chrome is visible');
    }
    if (footerStatus) {
        const statusStyle = getComputedStyle(footerStatus);
        if ([statusStyle.borderTopWidth, statusStyle.borderRightWidth, statusStyle.borderBottomWidth, statusStyle.borderLeftWidth].some((width) => parseFloat(width) > 0)) {
            failures.push('footer status retains an outlined box');
        }
    }
    if (window.innerWidth > 900) {
        const featureName = panel.querySelector('.ytkit-feature-name');
        const featureDescription = panel.querySelector('.ytkit-feature-desc');
        const headerRect = panel.querySelector('.ytkit-header')?.getBoundingClientRect();
        const footerRect = panel.querySelector('.ytkit-footer')?.getBoundingClientRect();
        if (featureName && parseFloat(getComputedStyle(featureName).fontSize) < 16) failures.push('desktop setting names are undersized');
        if (featureDescription && parseFloat(getComputedStyle(featureDescription).fontSize) < 14) failures.push('desktop setting descriptions are undersized');
        if (headerRect && headerRect.height > 66) failures.push('desktop settings header is taller than 66px');
        if (footerRect && footerRect.height > 66) failures.push('desktop settings footer is taller than 66px');
    }
    const inactiveSwitch = panel.querySelector('#ytkit-toggle-videoScreenshot')?.closest('.ytkit-switch');
    const activeSwitch = panel.querySelector('#ytkit-toggle-autoMaxResolution')?.closest('.ytkit-switch');
    const inlineStartOffset = (switchEl) => {
        const trackRect = switchEl?.querySelector('.ytkit-switch-track')?.getBoundingClientRect();
        const thumbRect = switchEl?.querySelector('.ytkit-switch-thumb')?.getBoundingClientRect();
        if (!trackRect || !thumbRect) return null;
        return panel.getAttribute('dir') === 'rtl'
            ? trackRect.right - thumbRect.right
            : thumbRect.left - trackRect.left;
    };
    const inactiveOffset = inlineStartOffset(inactiveSwitch);
    const activeOffset = inlineStartOffset(activeSwitch);
    if (inactiveOffset === null || activeOffset === null) {
        failures.push('could not measure settings toggle thumb positions');
    } else if (activeOffset < inactiveOffset + 12) {
        failures.push('active toggle thumb does not move toward inline end (' + inactiveOffset.toFixed(1) + ' -> ' + activeOffset.toFixed(1) + ')');
    }
    if (panel.getAttribute('dir') === 'rtl' && headerSearch) {
        const searchIcon = panel.querySelector('.ytkit-command-search .ytkit-search-icon');
        const searchActions = panel.querySelector('.ytkit-command-search .ytkit-search-actions');
        const inputRect = headerSearch.getBoundingClientRect();
        const iconRect = searchIcon?.getBoundingClientRect();
        const actionsRect = searchActions?.getBoundingClientRect();
        if (!iconRect || iconRect.left < inputRect.left + (inputRect.width / 2)) {
            failures.push('RTL search icon is not anchored to the input start edge');
        }
        if (!actionsRect || actionsRect.right > inputRect.left + (inputRect.width / 2)) {
            failures.push('RTL search actions are not anchored to the input end edge');
        }
        if (iconRect && actionsRect && iconRect.left < actionsRect.right && iconRect.right > actionsRect.left) {
            failures.push('RTL search icon overlaps its actions');
        }
    }
    for (const id of ['ytkit-export', 'ytkit-import', 'ytkit-import-history', 'ytkit-reset-active-section', 'ytkit-close-footer']) {
        if (panel.querySelectorAll('#' + id).length !== 1) failures.push(id + ' must render exactly once');
    }
    const blueLightToggle = panel.querySelector('#ytkit-toggle-blueLightFilter');
    const blueLightIntensity = panel.querySelector('#ytkit-range-blueLightIntensity');
    const blueLightSubFeatures = blueLightIntensity?.closest('.ytkit-sub-features');
    if (!blueLightToggle) failures.push('Blue Light Filter master toggle is missing from the main settings overlay');
    if (!blueLightIntensity) failures.push('Blue Light Intensity range is missing from the main settings overlay');
    if (blueLightToggle?.checked) failures.push('Blue Light Filter must render disabled by default');
    if (blueLightSubFeatures?.dataset.parentId !== 'blueLightFilter') {
        failures.push('Blue Light Intensity must be nested under the Blue Light Filter toggle');
    }
    if (blueLightIntensity && !blueLightIntensity.disabled) {
        failures.push('Blue Light Intensity must stay disabled while the master toggle is off');
    }
    const activeTab = panel.querySelector('.ytkit-nav-btn.active');
    const activePane = activeTab ? panel.querySelector('#ytkit-pane-' + activeTab.dataset.tab) : null;
    if (!activeTab || activeTab.getAttribute('role') !== 'tab' || activeTab.getAttribute('aria-selected') !== 'true') {
        failures.push('active category does not expose selected tab semantics');
    }
    if (!activePane || activePane.getAttribute('role') !== 'tabpanel' || activePane.getAttribute('aria-hidden') !== 'false') {
        failures.push('active settings pane does not expose visible tabpanel semantics');
    }
    const disabledSubFeatures = panel.querySelector('.ytkit-sub-features[aria-disabled="true"]');
    if (!disabledSubFeatures || !disabledSubFeatures.hasAttribute('inert')) {
        failures.push('disabled sub-features are not removed from keyboard interaction');
    } else if (Array.from(disabledSubFeatures.querySelectorAll('input, select, textarea, button')).some((control) => !control.disabled)) {
        failures.push('disabled sub-feature controls remain operable');
    }
    if (window.innerWidth <= 560) {
        const sidebarRect = panel.querySelector('.ytkit-sidebar')?.getBoundingClientRect();
        const navListRect = panel.querySelector('.ytkit-nav-list')?.getBoundingClientRect();
        const footerRect = panel.querySelector('.ytkit-footer')?.getBoundingClientRect();
        const firstNavRect = panel.querySelector('.ytkit-nav-btn')?.getBoundingClientRect();
        if (sidebarRect && sidebarRect.height > 96) failures.push('mobile navigation consumes ' + Math.round(sidebarRect.height) + 'px (>96px)');
        if (navListRect && navListRect.width < Math.min(320, panel.clientWidth - 24)) {
            failures.push('mobile navigation viewport collapses to ' + Math.round(navListRect.width) + 'px');
        }
        if (footerRect && footerRect.height > 180) failures.push('mobile footer consumes ' + Math.round(footerRect.height) + 'px (>180px)');
        if (firstNavRect && (firstNavRect.width < 140 || firstNavRect.height < 44 || firstNavRect.right <= 96)) {
            failures.push('mobile navigation target is clipped at ' + Math.round(firstNavRect.width) + 'x' + Math.round(firstNavRect.height));
        }
    }
    const closeCandidates = Array.from(panel.querySelectorAll('button')).filter((btn) => {
        const label = ((btn.getAttribute('aria-label') || '') + ' ' + (btn.textContent || '')).toLowerCase();
        return label.includes('close');
    });
    const visibleClose = closeCandidates.find((btn) => {
        const r = btn.getBoundingClientRect();
        return r.width >= 20 && r.height >= 20 && getComputedStyle(btn).visibility !== 'hidden';
    });
    if (!visibleClose) failures.push('no visible close target (>=20px, labeled "close") inside the panel');
    if (!panel.contains(document.activeElement)) {
        failures.push('focus is not inside the panel (activeElement=' + (document.activeElement && document.activeElement.tagName) + ')');
    }
    const parseRgb = (value) => {
        const m = String(value || '').match(/rgba?\\(([^)]+)\\)/);
        if (!m) return null;
        const parts = m[1].split(',').map((x) => parseFloat(x));
        if (parts.length >= 4 && parts[3] === 0) return null;
        return parts.slice(0, 3);
    };
    const luminance = (rgb) => {
        const [r, g, b] = rgb.map((v) => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const effectiveBackground = (el) => {
        let node = el;
        while (node && node !== document.documentElement) {
            const bg = parseRgb(getComputedStyle(node).backgroundColor);
            if (bg) return bg;
            node = node.parentElement;
        }
        return document.documentElement.hasAttribute('dark') ? [15, 15, 15] : [255, 255, 255];
    };
    const primary = panel.querySelector('h1, h2, h3, [class*="title"]') || panel.querySelector('button');
    if (primary) {
        const fg = parseRgb(getComputedStyle(primary).color);
        if (fg) {
            const bg = effectiveBackground(primary);
            const l1 = luminance(fg);
            const l2 = luminance(bg);
            const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
            if (ratio < 4.5) {
                failures.push('primary control contrast ' + ratio.toFixed(2) + ':1 < 4.5:1 (' + getComputedStyle(primary).color + ' on rgb(' + bg.join(',') + '))');
            }
        }
    }
    return JSON.stringify({ failures, controls: controls.length, rect: { w: Math.round(rect.width), h: Math.round(rect.height) } });
})()`;

const SCROLLED_HEADER_CHECKS = `(() => {
    const failures = [];
    const content = document.querySelector('#ytkit-settings-panel .ytkit-content');
    const header = document.querySelector('#ytkit-settings-panel .ytkit-pane.active .ytkit-pane-header');
    if (!content || !header) {
        return JSON.stringify({ failures: ['could not stage sticky section header scroll check'] });
    }
    const style = getComputedStyle(header);
    const color = String(style.backgroundColor || '');
    const rgba = color.match(/rgba?\\(([^)]+)\\)/);
    const alpha = rgba && rgba[1].split(',').length >= 4
        ? Number(rgba[1].split(',')[3])
        : (rgba ? 1 : 0);
    if (style.position !== 'sticky') {
        failures.push('section header is not sticky after scrolling');
    }
    if (!Number.isFinite(alpha) || alpha < 0.98) {
        failures.push('sticky section header background is not opaque after scrolling (' + color + ')');
    }
    if (Number(style.zIndex) < 2) {
        failures.push('sticky section header does not stack above scrolling controls');
    }
    const contentRect = content.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    if (headerRect.top < contentRect.top - 1 || headerRect.top > contentRect.top + 32) {
        failures.push('sticky section header escaped its scroll viewport (header ' + Math.round(headerRect.top) + ', content ' + Math.round(contentRect.top) + ')');
    }
    return JSON.stringify({ failures });
})()`;

const CATEGORY_PARITY_CHECKS = `(() => {
    const failures = [];
    const pane = document.querySelector('#ytkit-settings-panel .ytkit-pane.active');
    if (!pane) return JSON.stringify({ failures: ['active category pane is missing'] });
    const paneId = pane.id.replace('ytkit-pane-', '');
    // The Video Hider pane manages stored lists (hidden videos, allowed videos,
    // blocked channels) instead of feature toggles, so there is no feature grid
    // to measure. It gets its own contract rather than an exemption.
    if (pane.classList.contains('ytkit-vh-pane')) {
        const header = pane.querySelector(':scope > .ytkit-pane-header');
        const lead = header?.querySelector('.ytkit-pane-lead');
        const icon = header?.querySelector('.ytkit-pane-icon');
        const title = header?.querySelector('.ytkit-pane-title h2');
        const statusChips = Array.from(header?.querySelectorAll('.ytkit-vh-status-chip') || []);
        const summaryCards = Array.from(pane.querySelectorAll(':scope > .ytkit-vh-summary > .ytkit-vh-summary-card'));
        const tabs = Array.from(pane.querySelectorAll('.ytkit-vh-tab'));
        const body = pane.querySelector('#ytkit-vh-content');
        if (!header || !lead || !icon || !title?.textContent?.trim()) {
            failures.push('list pane is missing its mission lead, icon, or title');
        }
        if (statusChips.length !== 1 || !statusChips[0]?.textContent.trim()) {
            failures.push('list pane expected one non-empty feature-state chip');
        }
        if (summaryCards.length !== 3) failures.push('list pane expected 3 summary cards, found ' + summaryCards.length);
        for (const card of summaryCards) {
            const value = card.querySelector('.ytkit-vh-summary-card__value');
            const label = card.querySelector('.ytkit-vh-summary-card__label');
            if (!value?.textContent.trim() || !label?.textContent.trim()) {
                failures.push('list pane has an empty summary value or label');
            }
            if (label && label.scrollWidth > label.clientWidth + 1) {
                failures.push('list pane summary label is clipped: ' + label.textContent.trim());
            }
        }
        if (tabs.length < 3) failures.push('list pane expected a tablist, found ' + tabs.length + ' tabs');
        if (tabs.some((tab) => !tab.querySelector('.ytkit-vh-tab__badge')?.textContent?.trim())) {
            failures.push('a list-pane tab is missing its count badge');
        }
        if (!tabs.some((tab) => tab.getAttribute('aria-selected') === 'true')) {
            failures.push('list pane has no selected tab');
        }
        if (!body || !body.children.length) failures.push('list pane rendered no content for the selected tab');
        if (body && body.getBoundingClientRect().height < 40) failures.push('list pane content collapsed to no height');
        return JSON.stringify({
            failures,
            paneId,
            title: title?.textContent?.trim() || '',
            sections: tabs.map((tab) => tab.querySelector('.ytkit-vh-tab__label')?.textContent?.trim() || ''),
            contextItems: summaryCards.length,
            parentCards: 0
        });
    }
    const mission = pane.querySelector(':scope > .ytkit-pane-header');
    const lead = mission?.querySelector('.ytkit-pane-lead');
    const icon = mission?.querySelector('.ytkit-pane-icon');
    const title = mission?.querySelector('.ytkit-pane-title h2');
    const contextItems = Array.from(mission?.querySelectorAll('.ytkit-pane-context-item') || []);
    const sections = Array.from(pane.querySelectorAll(':scope > .ytkit-features-grid > .ytkit-feature-section'))
        .filter((section) => getComputedStyle(section).display !== 'none');
    const grid = pane.querySelector(':scope > .ytkit-features-grid');
    const parentCards = Array.from(pane.querySelectorAll(':scope > .ytkit-features-grid .ytkit-feature-card:not(.ytkit-sub-card)'))
        .filter((card) => getComputedStyle(card).display !== 'none');
    const sectionCards = sections.flatMap((section) => Array.from(
        section.querySelectorAll(':scope > .ytkit-feature-section-body > .ytkit-feature-card:not(.ytkit-sub-card)')
    )).filter((card) => getComputedStyle(card).display !== 'none');
    if (!mission || !lead || !icon || !title?.textContent?.trim()) {
        failures.push('mission card is missing its lead, icon, or title');
    }
    if (icon) {
        const rect = icon.getBoundingClientRect();
        if (rect.width < 72 || rect.height < 72) failures.push('mission icon tile is undersized at ' + Math.round(rect.width) + 'x' + Math.round(rect.height));
    }
    if (window.innerWidth > 1180 && contextItems.length !== 3) {
        failures.push('mission card expected 3 live preference chips, found ' + contextItems.length);
    }
    if (sections.length < 2) failures.push('expected at least 2 visible semantic control sections, found ' + sections.length);
    if (window.innerWidth > 900 && grid) {
        const gridWidth = grid.getBoundingClientRect().width;
        for (const section of sections) {
            const width = section.getBoundingClientRect().width;
            if (width < gridWidth * 0.9) failures.push('semantic section is only ' + Math.round(width) + 'px of a ' + Math.round(gridWidth) + 'px content column');
        }
    }
    for (const section of sections) {
        const heading = section.querySelector(':scope > .ytkit-feature-section-title');
        const body = section.querySelector(':scope > .ytkit-feature-section-body');
        if (!heading?.textContent?.trim() || !body) failures.push('semantic section is missing its heading or body');
        if (heading && getComputedStyle(heading).textTransform !== 'uppercase') failures.push('semantic section heading is not uppercase');
    }
    if (sectionCards.length !== parentCards.length) {
        failures.push('semantic sections contain ' + sectionCards.length + ' of ' + parentCards.length + ' parent controls');
    }
    return JSON.stringify({
        failures,
        paneId,
        title: title?.textContent?.trim() || '',
        sections: sections.map((section) => section.querySelector('.ytkit-feature-section-title')?.textContent?.trim() || ''),
        contextItems: contextItems.length,
        parentCards: parentCards.length
    });
})()`;

function buildChromeStub(runtimeSettings = null) {
    if (runtimeSettings === null) return CHROME_STUB;
    const marker = 'const injectedRuntimeSettings = null; // __ASTRA_SMOKE_RUNTIME_SETTINGS__';
    if (!CHROME_STUB.includes(marker)) {
        throw new Error('chrome stub runtime-settings marker is missing');
    }
    return CHROME_STUB.replace(
        marker,
        `const injectedRuntimeSettings = ${JSON.stringify(runtimeSettings)};`
    );
}

function buildFixture(stageDir, { fallbackOnly = false, runtimeSettings = null } = {}) {
    copyDir(EXT_DIR, stageDir);
    const chromeStub = buildChromeStub(runtimeSettings);
    fs.writeFileSync(path.join(stageDir, 'chrome-stub.js'), chromeStub, 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.join(stageDir, 'manifest.json'), 'utf8'));
    const isolatedGroup = (manifest.content_scripts || []).find((group) => {
        const scripts = group['x-ytkit-runtime-modules'] || group.js || [];
        return Array.isArray(scripts) && scripts.includes('ytkit.js')
            && !scripts.includes('ytkit-main.js') && !group.all_frames;
    });
    if (!isolatedGroup) throw new Error('could not locate the ISOLATED-world content-script group in manifest.json');
    const runtimeScripts = isolatedGroup['x-ytkit-runtime-modules'] || isolatedGroup.js;
    const isolatedScripts = fallbackOnly
        ? runtimeScripts.filter((src) => src !== 'features/settings-panel/index.js')
        : ['runtime-bootstrap.js'];
    const scriptTags = ['chrome-stub.js', ...isolatedScripts, 'a11y-fixture-driver.js']
        .map((src) => `    <script src="${src}"></script>`)
        .join('\n');
    fs.writeFileSync(path.join(stageDir, 'a11y-fixture-driver.js'), `'use strict';
(() => {
    const anchor = document.getElementById('fixture-download-anchor');
    let downloadUi = null;
    const ensureDownloadUi = () => {
        if (downloadUi) return downloadUi;
        const factory = globalThis.YTKitFeatures?.createDownloadUIFeature;
        if (typeof factory !== 'function') return null;
        downloadUi = factory({
            appState: { settings: {} },
            extensionFetchJson: async () => ({ data: null }),
            supportsPopover: () => globalThis.YTKitCore?.toast?.supportsPopover?.() === true,
            createCloseWatcher: (onClose) => globalThis.YTKitCore?.toast?.createCloseWatcher?.(onClose) || null,
            destroyCloseWatcher: (watcher) => globalThis.YTKitCore?.toast?.destroyCloseWatcher?.(watcher),
            t: (_key, fallback) => fallback
        });
        return downloadUi;
    };
    globalThis.__ytkitA11y = {
        openDownload() {
            const ui = ensureDownloadUi();
            if (!ui) return false;
            ui.showDownloadPopup(anchor);
            return Boolean(document.querySelector('.ytkit-dl-popup'));
        },
        closeDownload() {
            downloadUi?._closeDlPopup?.();
        }
    };
})();
`, 'utf8');
    const html = `<!DOCTYPE html>
<html lang="en" dark>
<head>
<meta charset="utf-8">
<title>Astra Deck settings overlay smoke fixture</title>
<script>
if (new URLSearchParams(location.search).get('theme') === 'light') {
    document.documentElement.removeAttribute('dark');
}
</script>
<style>
body{margin:0;background:#0f0f0f;color:#e5e7eb;font-family:Roboto,system-ui,sans-serif;}
html:not([dark]) body{background:#f7f8fa;color:#17202b;}
</style>
</head>
<body>
    <div id="fixture-note" style="color:#666;padding:16px;">settings overlay smoke fixture</div>
    <ytd-watch-flexy>
        <div id="top-level-buttons-computed"></div>
        <div id="secondary"></div>
    </ytd-watch-flexy>
    <button id="fixture-download-anchor" type="button">Download fixture</button>
${scriptTags}
</body>
</html>
`;
    const fixturePath = path.join(stageDir, 'fixture.html');
    fs.writeFileSync(fixturePath, html, 'utf8');
    return fixturePath;
}

function httpGetJson(url, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout: timeoutMs }, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (err) { reject(err); }
            });
        });
        req.on('timeout', () => req.destroy(new Error('devtools http timeout')));
        req.on('error', reject);
    });
}

class DevtoolsClient {
    constructor(ws) {
        this.ws = ws;
        this.nextId = 1;
        this.pending = new Map();
        ws.on('message', (raw) => {
            let msg;
            try { msg = JSON.parse(raw); } catch { return; }
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error) reject(new Error(msg.error.message || 'devtools error'));
                else resolve(msg.result);
            }
        });
    }
    send(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
            setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id);
                    reject(new Error(`devtools call timed out: ${method}`));
                }
            }, 15000);
        });
    }
    async evaluate(expression) {
        const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) {
            throw new Error(`page evaluate failed: ${result.exceptionDetails.text || 'exception'}`);
        }
        return result.result?.value;
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(fn, timeoutMs, label) {
    const start = Date.now();
    for (;;) {
        const value = await fn();
        if (value) return value;
        if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
        await sleep(300);
    }
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.headedPrivate && process.env.YTKIT_VISUAL_ISOLATED !== '1') {
        throw new Error('--headed-private requires YTKIT_VISUAL_ISOLATED=1 and an external private-desktop launcher');
    }
    const browserPath = findBrowser(opts.browser);
    if (!browserPath) {
        console.error('[settings-overlay-smoke] no Chromium-family browser found; set CHROME_PATH/EDGE_PATH or pass --browser');
        process.exit(2);
    }

    const stageDir = path.join(REPO_ROOT, 'build', 'settings-overlay-smoke-stage');
    fs.rmSync(stageDir, { recursive: true, force: true });
    const fixturePath = buildFixture(stageDir, opts);
    const outDir = opts.fallbackOnly ? path.join(OUT_DIR, 'fallback') : OUT_DIR;
    fs.rmSync(outDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
    fs.mkdirSync(outDir, { recursive: true });

    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-overlay-smoke-'));
    const fixtureUrl = 'file:///' + fixturePath.split(path.sep).join('/');
    const browserArgs = [
        ...(opts.headedPrivate ? ['--window-size=1356,920'] : ['--headless=new']),
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-port=0',
        '--allow-file-access-from-files',
        `--user-data-dir=${profileDir}`,
        fixtureUrl
    ];
    const browser = spawn(browserPath, browserArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: !opts.headedPrivate
    });

    let stderrBuf = '';
    const devtoolsUrl = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('browser did not expose a DevTools endpoint')), opts.timeoutMs);
        browser.stderr.on('data', (chunk) => {
            stderrBuf += chunk;
            const match = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
            if (match) { clearTimeout(timer); resolve(match[1]); }
        });
        browser.on('exit', (code) => { clearTimeout(timer); reject(new Error(`browser exited early (code ${code})`)); });
    });

    const failuresByState = {};
    const progressPath = path.join(outDir, 'progress.json');
    try {
        const port = new URL(devtoolsUrl).port;
        const pages = await waitFor(async () => {
            const list = await httpGetJson(`http://127.0.0.1:${port}/json/list`).catch(() => []);
            return list.find((entry) => entry.type === 'page' && String(entry.url || '').includes('fixture.html')) || null;
        }, opts.timeoutMs, 'the fixture page target');

        const ws = new WebSocket(pages.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
        await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
        const client = new DevtoolsClient(ws);
        await client.send('Page.enable');
        await client.send('Runtime.enable');
        // Surface page-side warnings/errors — a blank overlay almost always
        // leaves its cause in the console.
        ws.on('message', (raw) => {
            let msg;
            try { msg = JSON.parse(raw); } catch { return; }
            if (msg.method === 'Runtime.consoleAPICalled' && ['warning', 'error'].includes(msg.params?.type)) {
                const text = (msg.params.args || []).map((arg) => arg.value ?? arg.description ?? '').join(' ');
                console.error(`[page-console:${msg.params.type}] ${text.slice(0, 400)}`);
            }
            if (msg.method === 'Runtime.exceptionThrown') {
                const detail = msg.params?.exceptionDetails;
                console.error(`[page-exception] ${detail?.text || ''} ${detail?.exception?.description?.slice(0, 400) || ''}`);
            }
        });

        await waitFor(
            () => client.evaluate('Boolean(globalThis.__ytkitSmoke && globalThis.__ytkitSmoke.listenerCount() > 0)'),
            opts.timeoutMs,
            'the content-script stack to register its message listener'
        );
        await client.evaluate('globalThis.__ytkitRuntimePromise || true');

        const selectedStates = opts.desktopOnly
            ? STATES.filter(({ name }) => name.startsWith('desktop-'))
            : STATES;
        for (const state of selectedStates) {
            await client.send('Emulation.setDeviceMetricsOverride', {
                width: state.width,
                height: state.height,
                deviceScaleFactor: 1,
                mobile: state.mobile
            });
            await client.evaluate(`(() => {
                document.querySelector(${JSON.stringify(PANEL_SELECTOR)})?.remove();
                document.getElementById('ytkit-overlay')?.remove();
                document.body.classList.remove('ytkit-panel-open');
                document.documentElement.toggleAttribute('dark', ${state.dark});
                document.documentElement.setAttribute('dir', '${state.dir}');
                return true;
            })()`);
            await client.evaluate('globalThis.__ytkitSmoke.openPanel()');
            try {
                await waitFor(
                    () => client.evaluate(`Boolean(document.querySelector(${JSON.stringify(PANEL_SELECTOR)}))`),
                    opts.timeoutMs,
                    `the settings overlay in state ${state.name}`
                );
            } catch (err) {
                const diag = await client.evaluate(`JSON.stringify({
                    bodyClasses: document.body.className,
                    panelById: Boolean(document.getElementById('ytkit-settings-panel')),
                    overlayById: Boolean(document.getElementById('ytkit-overlay')),
                    ytkitIds: Array.from(document.querySelectorAll('[id^="ytkit"]')).map(el => el.id).slice(0, 20),
                    ytkitClasses: Array.from(new Set(Array.from(document.querySelectorAll('[class*="ytkit"]')).flatMap(el => Array.from(el.classList)))).slice(0, 30),
                    listenerCount: globalThis.__ytkitSmoke.listenerCount()
                })`).catch(() => 'diagnostics unavailable');
                console.error(`[settings-overlay-smoke] diagnostics: ${diag}`);
                throw err;
            }
            const renderedDir = await client.evaluate(`document.querySelector(${JSON.stringify(PANEL_SELECTOR)})?.getAttribute('dir') || ''`);
            const directionFailures = renderedDir === state.dir
                ? []
                : [`panel direction ${renderedDir || 'missing'} != ${state.dir}`];
            await sleep(600); // let fonts/layout settle before measuring
            const report = JSON.parse(await client.evaluate(IN_PAGE_CHECKS));
            failuresByState[state.name] = [...directionFailures, ...(report.failures || [])];

            if (!opts.healthOnly) {
                const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
                fs.writeFileSync(path.join(outDir, `${state.name}.png`), Buffer.from(shot.data, 'base64'));
            }
            if (['desktop-dark', 'desktop-light', 'desktop-wide'].includes(state.name)) {
                const categoryIds = await client.evaluate(`Array.from(
                    document.querySelectorAll('.ytkit-nav-btn[data-tab]'),
                    (tab) => tab.dataset.tab
                )`);
                for (const categoryId of categoryIds) {
                    const staged = await client.evaluate(`(() => {
                        const tab = document.querySelector('.ytkit-nav-btn[data-tab=${JSON.stringify(categoryId)}]');
                        if (!tab) return false;
                        tab.click();
                        window.scrollTo(0, 0);
                        const content = document.querySelector('.ytkit-content');
                        if (content) content.scrollTop = 0;
                        return true;
                    })()`);
                    if (!staged) {
                        failuresByState[state.name].push(`could not stage category ${categoryId}`);
                        continue;
                    }
                    await sleep(120);
                    const categorySlug = String(categoryId).toLowerCase().replace(/[^a-z0-9]+/g, '-');
                    const parityReport = JSON.parse(await client.evaluate(CATEGORY_PARITY_CHECKS));
                    failuresByState[state.name].push(
                        ...(parityReport.failures || []).map((failure) => `${categoryId}: ${failure}`)
                    );
                    if (!opts.fallbackOnly && !opts.healthOnly) {
                        await client.evaluate('window.scrollTo(0, 0)');
                        const categoryShot = await client.send('Page.captureScreenshot', {
                            format: 'png',
                            captureBeyondViewport: false
                        });
                        fs.writeFileSync(
                            path.join(outDir, `${state.name}-category-${categorySlug}.png`),
                            Buffer.from(categoryShot.data, 'base64')
                        );
                    }

                    const scrollState = await client.evaluate(`(() => {
                        const content = document.querySelector('#ytkit-settings-panel .ytkit-content');
                        if (!content) return { found: false, scrollable: false, scrollTop: 0 };
                        const maxScroll = Math.max(0, content.scrollHeight - content.clientHeight);
                        content.scrollTop = Math.min(220, maxScroll);
                        return {
                            found: true,
                            scrollable: maxScroll > 0,
                            scrollTop: content.scrollTop
                        };
                    })()`);
                    if (!scrollState?.found) {
                        failuresByState[state.name].push(`could not find scroll viewport for category ${categoryId}`);
                        continue;
                    }
                    if (scrollState.scrollable && scrollState.scrollTop <= 0) {
                        failuresByState[state.name].push(`could not scroll category ${categoryId} for sticky header proof`);
                        continue;
                    }
                    await sleep(120);
                    const scrolledReport = JSON.parse(await client.evaluate(SCROLLED_HEADER_CHECKS));
                    failuresByState[state.name].push(
                        ...(scrolledReport.failures || []).map((failure) => `${categoryId}: ${failure}`)
                    );
                    if (!opts.healthOnly) {
                        const scrolledShot = await client.send('Page.captureScreenshot', {
                            format: 'png',
                            captureBeyondViewport: false
                        });
                        fs.writeFileSync(
                            path.join(outDir, `${state.name}-category-${categorySlug}-scrolled-header.png`),
                            Buffer.from(scrolledShot.data, 'base64')
                        );
                    }
                }
            }
            if (state.name === 'desktop-dark') {
                // Section Reset used to key on the feature id, so the features
                // that store under a different settingKey were skipped and any
                // non-checkbox control kept its pre-reset value on screen.
                // Drive a real reset over a select-backed feature and read the
                // rendered control back.
                const resetProof = await client.evaluate(`(() => {
                    const select = document.querySelector('#ytkit-settings-panel select[id^="ytkit-select-"]');
                    if (!select) return { ok: false, reason: 'no select control rendered' };
                    const options = Array.from(select.options).map((option) => option.value);
                    const other = options.find((value) => value !== select.value);
                    if (!other) return { ok: false, reason: 'select has no alternative option' };
                    const before = select.value;
                    select.value = other;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    const pane = select.closest('.ytkit-pane');
                    const resetBtn = pane?.querySelector('.ytkit-reset-group-btn');
                    if (!resetBtn) return { ok: false, reason: 'pane has no reset control' };
                    resetBtn.click();
                    return {
                        ok: true,
                        id: select.id,
                        before,
                        staged: other,
                        after: select.value,
                    };
                })()`);
                if (!resetProof?.ok) {
                    failuresByState[state.name].push(`section reset proof: ${resetProof?.reason || 'unavailable'}`);
                } else if (resetProof.after === resetProof.staged) {
                    failuresByState[state.name].push(
                        `section reset left ${resetProof.id} showing the pre-reset value ${resetProof.staged}`
                    );
                }
            }
            if (state.name === 'desktop-dark') {
                // A sub-feature of a disabled parent must stay visibly and
                // functionally disabled while it matches a search — search used
                // to clear only the opacity, leaving an enabled-looking card
                // that ignored every click.
                const searchProof = await client.evaluate(`(() => {
                    const search = document.getElementById('ytkit-search');
                    if (!search) return { ok: false, reason: 'search input missing' };
                    const groups = Array.from(document.querySelectorAll('.ytkit-sub-features[data-parent-id]'));
                    let target = groups.find((node) => node.hasAttribute('inert'));
                    let toggled = null;
                    if (!target) {
                        // Nothing is disabled in the default profile — turn a
                        // parent off so the disabled state actually exists.
                        for (const group of groups) {
                            const parentToggle = document.getElementById('ytkit-toggle-' + group.dataset.parentId);
                            if (!parentToggle || !parentToggle.checked) continue;
                            parentToggle.click();
                            if (group.hasAttribute('inert')) { target = group; toggled = parentToggle; break; }
                            if (parentToggle.checked !== true) parentToggle.click();
                        }
                    }
                    if (!target) return { ok: false, reason: 'no disabled sub-feature group could be staged' };
                    const label = target.querySelector('.ytkit-feature-name')?.textContent?.trim() || '';
                    if (!label) return { ok: false, reason: 'sub-feature has no searchable label' };
                    search.value = label.slice(0, 6);
                    search.dispatchEvent(new Event('input', { bubbles: true }));
                    // The panel debounces search by 150ms, so the rendered
                    // state has to be read after it settles.
                    window.__ytkitSearchProof = { ok: true, label, parentId: target.dataset.parentId, toggledId: toggled?.id || '' };
                    return { ok: true, label };
                })()`);
                if (searchProof?.ok) {
                    await sleep(400);
                    Object.assign(searchProof, await client.evaluate(`(() => {
                        const proof = window.__ytkitSearchProof || {};
                        const target = document.querySelector('.ytkit-sub-features[data-parent-id=' + JSON.stringify(proof.parentId) + ']');
                        const observed = {
                            inert: target?.hasAttribute('inert') || false,
                            ariaDisabled: target?.getAttribute('aria-disabled') || '',
                            opacity: target?.style.opacity || '',
                        };
                        const search = document.getElementById('ytkit-search');
                        if (search) { search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); }
                        const toggled = proof.toggledId ? document.getElementById(proof.toggledId) : null;
                        if (toggled) toggled.click();
                        return observed;
                    })()`));
                    await sleep(300);
                }
                if (!searchProof?.ok) {
                    failuresByState[state.name].push(`search dimming proof: ${searchProof?.reason || 'unavailable'}`);
                } else if (searchProof.inert && !searchProof.opacity) {
                    failuresByState[state.name].push(
                        `search un-dimmed the inert sub-features of "${searchProof.label}" — it looks enabled but ignores clicks`
                    );
                }
            }
            if (state.name === 'desktop-dark' && !opts.fallbackOnly) {
                const attributionSearchReady = await client.evaluate(`(() => {
                    const search = document.getElementById('ytkit-search');
                    if (!search) return false;
                    search.value = 'CC BY-NC-SA';
                    search.dispatchEvent(new Event('input', { bubbles: true }));
                    return true;
                })()`);
                if (!attributionSearchReady) {
                    failuresByState[state.name].push('could not stage the SponsorBlock attribution search');
                } else {
                    await sleep(400);
                    const attributionProof = await client.evaluate(`(() => {
                        const cards = Array.from(document.querySelectorAll('.ytkit-feature-card'));
                        const byName = (name) => cards.find((card) =>
                            card.querySelector('.ytkit-feature-name')?.textContent?.trim() === name
                        );
                        const sponsor = byName('SponsorBlock');
                        const deArrow = byName('DeArrow');
                        const describe = (card) => {
                            const description = card?.querySelector('.ytkit-feature-desc');
                            const rect = description?.getBoundingClientRect();
                            return {
                                visible: Boolean(card && getComputedStyle(card).display !== 'none' && rect?.width && rect?.height),
                                text: description?.textContent?.trim() || '',
                                clipped: Boolean(description && description.scrollWidth > description.clientWidth + 1)
                            };
                        };
                        sponsor?.scrollIntoView({ block: 'center' });
                        return { sponsor: describe(sponsor), deArrow: describe(deArrow) };
                    })()`);
                    for (const [featureName, proof] of Object.entries(attributionProof || {})) {
                        if (!proof?.visible) {
                            failuresByState[state.name].push(`${featureName} attribution settings card is not visible after search`);
                        } else if (!/CC BY-NC-SA 4\.0/.test(proof.text)) {
                            failuresByState[state.name].push(`${featureName} settings description omits the data licence`);
                        } else if (proof.clipped) {
                            failuresByState[state.name].push(`${featureName} attribution settings description is clipped`);
                        }
                    }
                    await sleep(150);
                    if (!opts.healthOnly) {
                        const attributionShot = await client.send('Page.captureScreenshot', {
                            format: 'png',
                            captureBeyondViewport: false
                        });
                        fs.writeFileSync(
                            path.join(outDir, 'sponsorblock-data-attribution.png'),
                            Buffer.from(attributionShot.data, 'base64')
                        );
                    }
                    await client.evaluate(`(() => {
                        const search = document.getElementById('ytkit-search');
                        if (search) {
                            search.value = '';
                            search.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    })()`);
                    await sleep(300);
                }
            }
            if (state.name === 'desktop-dark' && !opts.fallbackOnly) {
                const featureReady = await client.evaluate(`(() => {
                    const toggle = document.getElementById('ytkit-toggle-blueLightFilter');
                    const intensity = document.getElementById('ytkit-range-blueLightIntensity');
                    const pane = toggle?.closest('.ytkit-pane');
                    const tab = pane ? document.querySelector('.ytkit-nav-btn[data-tab="' + pane.id.replace('ytkit-pane-', '') + '"]') : null;
                    if (!toggle || !intensity || !tab) return false;
                    tab.click();
                    toggle.closest('.ytkit-feature-card')?.scrollIntoView({ block: 'center' });
                    return true;
                })()`);
                if (!featureReady) failuresByState[state.name].push('could not stage the Blue Light Filter visual proof');
                await sleep(300);
                if (!opts.healthOnly) {
                    const featureShot = await client.send('Page.captureScreenshot', {
                        format: 'png',
                        captureBeyondViewport: false
                    });
                    fs.writeFileSync(path.join(outDir, 'blue-light-default.png'), Buffer.from(featureShot.data, 'base64'));
                }
            }
            if (state.name === 'desktop-dark') {
                // Open the download options over the already-open settings
                // panel. In Popover-capable engines the later top-layer entry
                // must win hit testing even though both legacy fallbacks keep
                // their historical maximum z-index values.
                const stackingProof = await client.evaluate(`(() => {
                    const supports = typeof globalThis.HTMLElement?.prototype?.showPopover === 'function'
                        && typeof globalThis.HTMLElement?.prototype?.hidePopover === 'function';
                    const opened = globalThis.__ytkitA11y?.openDownload?.() === true;
                    const popup = document.querySelector('.ytkit-dl-popup');
                    const panel = document.querySelector('#ytkit-settings-panel');
                    if (!opened || !popup || !panel) return { supports, opened, found: Boolean(popup), panelOpen: Boolean(panel) };
                    const rect = popup.getBoundingClientRect();
                    const probe = document.elementFromPoint(
                        rect.left + Math.max(1, Math.min(rect.width / 2, rect.width - 1)),
                        rect.top + Math.max(1, Math.min(rect.height / 2, rect.height - 1))
                    );
                    return {
                        supports,
                        opened,
                        found: true,
                        popover: popup.getAttribute('popover') || '',
                        popupOpen: supports ? popup.matches(':popover-open') : true,
                        panelOpen: supports ? panel.matches(':popover-open') : true,
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                        abovePanel: probe === popup || popup.contains(probe)
                    };
                })()`);
                if (!stackingProof?.opened || !stackingProof?.found) {
                    failuresByState[state.name].push('download options popup did not render for the stacking proof');
                } else if (stackingProof.supports) {
                    if (stackingProof.popover !== 'auto' || !stackingProof.popupOpen) {
                        failuresByState[state.name].push('download options popup is not open as an auto Popover');
                    }
                    if (!stackingProof.panelOpen) {
                        failuresByState[state.name].push('settings panel closed when the download Popover opened');
                    }
                    if (!stackingProof.abovePanel) {
                        failuresByState[state.name].push('download Popover did not win top-layer hit testing over the settings panel');
                    }
                }
                await client.evaluate('globalThis.__ytkitA11y?.closeDownload?.()');
            }
            console.log(`[settings-overlay-smoke:${opts.fallbackOnly ? 'fallback' : 'module'}] ${state.name}: ${report.rect?.w}x${report.rect?.h}, ${report.controls} controls, ${failuresByState[state.name].length} failure(s)`);
            fs.writeFileSync(progressPath, `${JSON.stringify({ completedState: state.name, failuresByState }, null, 2)}\n`, 'utf8');
        }
        ws.close();
    } finally {
        const browserExit = browser.exitCode !== null
            ? Promise.resolve()
            : new Promise((resolve) => browser.once('exit', resolve));
        if (process.platform === 'win32' && browser.pid) {
            try {
                execFileSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' });
            } catch (_) { /* reason: browser may already have exited */ }
        } else {
            browser.kill();
        }
        await Promise.race([browserExit, sleep(3000)]);
        const cleanupFailures = [];
        const removeTempTree = (target, label) => {
            try {
                fs.rmSync(target, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
            } catch (err) {
                cleanupFailures.push(`${label} cleanup failed: ${err.message}`);
            }
        };
        if (!opts.keepStage) removeTempTree(stageDir, 'fixture stage');
        removeTempTree(profileDir, 'browser profile');
        if (cleanupFailures.length) failuresByState.cleanup = cleanupFailures;
    }

    let failed = false;
    for (const [state, failures] of Object.entries(failuresByState)) {
        for (const failure of failures) {
            failed = true;
            console.error(`[settings-overlay-smoke] ${state}: ${failure}`);
        }
    }
    const result = {
        mode: opts.fallbackOnly ? 'fallback' : 'module',
        captureScreenshots: !opts.healthOnly,
        browserMode: opts.headedPrivate ? 'headed-private' : 'headless',
        passed: !failed,
        states: failuresByState
    };
    fs.writeFileSync(path.join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    fs.rmSync(progressPath, { force: true });
    if (!opts.healthOnly) {
        console.log(`[settings-overlay-smoke] screenshots: ${path.relative(REPO_ROOT, outDir).replace(/\\/g, '/')}`);
    }
    if (failed) process.exit(1);
    console.log('[settings-overlay-smoke] PASS — all states rendered with close/focus targets and readable primary controls');
}

if (require.main === module) {
    main().catch((err) => {
        console.error('[settings-overlay-smoke] ' + err.message);
        try {
            const outDir = process.argv.includes('--fallback-only')
                ? path.join(OUT_DIR, 'fallback')
                : OUT_DIR;
            fs.mkdirSync(outDir, { recursive: true });
            fs.writeFileSync(
                path.join(outDir, 'fatal-result.json'),
                `${JSON.stringify({ passed: false, fatal: err.stack || err.message }, null, 2)}\n`,
                'utf8'
            );
        } catch (_) { /* reason: the original failure is more actionable than report I/O */ }
        process.exit(1);
    });
}

module.exports = {
    buildChromeStub,
    buildFixture,
    CHROME_STUB,
    CATEGORY_PARITY_CHECKS,
    SCROLLED_HEADER_CHECKS,
    DevtoolsClient,
    findBrowser,
    PANEL_SELECTOR,
    parseArgs,
    sleep,
    STATES,
    waitFor,
};
