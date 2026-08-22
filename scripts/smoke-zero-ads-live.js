#!/usr/bin/env node
'use strict';

// Live, isolated Chromium smoke for the always-on zero-ad contract.
//
// This is intentionally outside `npm run check`: it opens public YouTube in a
// disposable browser profile and therefore needs a working network. It proves
// the packaged MV3 ruleset is enabled, captures cold-load network evidence,
// follows a real YouTube SPA link, verifies that known ad shells remain
// collapsed while search/player workflows survive, and opens the real settings
// surface to guard the desktop command-deck contract on a live host page.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const {
    browserCandidates,
    chromiumArgs,
    connectCdp,
    createChromiumStage,
    evaluate,
    extensionIdFromTarget,
    fetchJsonFromDevTools,
    hasLoadExtensionPolicyBlock,
    killProcessTree,
    removeDirWithRetries,
    reserveLoopbackPort,
    sleep,
    waitForBackgroundTarget,
    waitForDevTools,
} = require('./smoke-chromium-optional-hosts');

const REPO_ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'build', 'zero-ad-live-smoke');
const AD_URL_RE = /(?:^|\.)doubleclick\.net\/|(?:^|\.)(?:googlesyndication|googleadservices|googletagservices|2mdn)\.com\/|(?:^|\.)google\.com\/pagead\/|(?:^|\.)youtube\.com\/(?:api\/stats\/ads|ptracking|get_midroll_info)/i;
const AD_SELECTORS = Object.freeze([
    '#masthead-ad',
    '#player-ads',
    'ytd-in-feed-ad-layout-renderer',
    'ytd-ad-slot-renderer',
    'ytd-page-top-ad-layout-renderer',
    'ytd-promoted-video-renderer',
    'ytd-display-ad-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytm-promoted-sparkles-web-renderer',
    'ytd-action-companion-ad-renderer',
    'ytd-companion-slot-renderer',
    'ytd-player-legacy-desktop-watch-ads-renderer',
    '.video-ads',
    '.ytp-ad-module',
    '.ytp-ad-overlay-container',
    '.ytp-ad-player-overlay'
]);

function parseArgs(argv) {
    const options = { browser: '', keepStage: false, timeoutMs: 45000 };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--browser') options.browser = path.resolve(argv[++i] || '');
        else if (arg === '--keep-stage') options.keepStage = true;
        else if (arg === '--timeout-ms') options.timeoutMs = Number(argv[++i]) || options.timeoutMs;
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}

async function waitForYoutubePage(port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let targets = [];
    while (Date.now() < deadline) {
        targets = await fetchJsonFromDevTools(port, '/json/list');
        const page = targets.find(({ type, url }) =>
            type === 'page' && /^https:\/\/(?:www\.)?youtube\.com\//.test(String(url)));
        if (page) return page;
        await sleep(200);
    }
    throw new Error(`Timed out waiting for YouTube page target; saw ${targets.map(({ type, url }) => `${type}:${url}`).join(', ')}`);
}

async function waitForExpression(client, expression, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await evaluate(client, expression).catch(() => false)) return;
        await sleep(250);
    }
    throw new Error(`Timed out waiting for ${label}`);
}

function adEvents(events, startIndex = 0) {
    const requests = new Map();
    const responses = [];
    const failures = [];
    for (const event of events.slice(startIndex)) {
        const params = event.params || {};
        if (event.method === 'Network.requestWillBeSent') {
            const url = params.request?.url || '';
            if (AD_URL_RE.test(new URL(url).hostname + new URL(url).pathname)) {
                requests.set(params.requestId, { url, type: params.type || '' });
            }
        } else if (event.method === 'Network.responseReceived') {
            const request = requests.get(params.requestId);
            if (request) responses.push({ ...request, status: params.response?.status || 0 });
        } else if (event.method === 'Network.loadingFailed') {
            const request = requests.get(params.requestId);
            if (request) {
                failures.push({
                    ...request,
                    blockedReason: params.blockedReason || '',
                    errorText: params.errorText || ''
                });
            }
        }
    }
    return { requests: [...requests.values()], responses, failures };
}

async function pageSnapshot(client, routeName) {
    const snapshot = await evaluate(client, `(() => {
        const selectors = ${JSON.stringify(AD_SELECTORS)};
        const visible = (node) => {
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && Number(style.opacity || 1) > 0
                && rect.width > 0
                && rect.height > 0;
        };
        const shells = selectors.map((selector) => {
            const nodes = Array.from(document.querySelectorAll(selector));
            return {
                selector,
                count: nodes.length,
                visible: nodes.filter(visible).length,
                nonCollapsed: nodes.filter((node) => node.getBoundingClientRect().height > 0).length
            };
        }).filter(({ count }) => count > 0);
        return {
            href: location.href,
            title: document.title,
            route: document.querySelector('ytd-page-manager > *.style-scope:not([hidden])')?.tagName || '',
            astraTrigger: Boolean(document.querySelector('#ytkit-masthead-btn, #ytkit-watch-btn')),
            masthead: Boolean(document.querySelector('ytd-masthead, #masthead')),
            search: Boolean(document.querySelector('yt-searchbox input, input#search')),
            feedCards: document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer').length,
            player: Boolean(document.querySelector('#movie_player, ytd-player')),
            video: Boolean(document.querySelector('video.html5-main-video')),
            shells
        };
    })()`);
    const failures = [];
    if (!snapshot.astraTrigger) failures.push(`${routeName}: Astra content runtime did not create its settings trigger`);
    if (!snapshot.masthead || !snapshot.search) failures.push(`${routeName}: core masthead/search workflow is unavailable`);
    for (const shell of snapshot.shells) {
        if (shell.visible || shell.nonCollapsed) {
            failures.push(`${routeName}: ${shell.selector} retained visible or non-collapsed ad space`);
        }
    }
    if (routeName === 'watch' && (!snapshot.player || !snapshot.video)) {
        failures.push('watch: player/video workflow is unavailable after SPA navigation');
    }
    return { failures, snapshot };
}

async function capture(client, name) {
    const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), Buffer.from(shot.data, 'base64'));
}

async function setWatchTheme(client, dark) {
    await evaluate(client, `(() => {
        const root = document.documentElement;
        root.toggleAttribute('dark', ${dark ? 'true' : 'false'});
        root.style.colorScheme = ${JSON.stringify(dark ? 'dark' : 'light')};
        window.dispatchEvent(new Event('resize'));
        return root.hasAttribute('dark');
    })()`);
    await sleep(250);
}

async function openSettingsPanelFromBackground(backgroundClient) {
    return evaluate(backgroundClient, `(async () => {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs.find((entry) => entry.url?.startsWith('https://www.youtube.com/')) || tabs[0];
        if (!tab?.id) return false;
        const result = await chrome.tabs.sendMessage(tab.id, { type: 'YTKIT_OPEN_PANEL' });
        return Boolean(result?.ok);
    })()`);
}

async function disableTheaterSplit(client, backgroundClient, timeoutMs) {
    const opened = await openSettingsPanelFromBackground(backgroundClient);
    if (!opened) throw new Error('watch themes: settings panel did not open from the extension worker');
    await waitForExpression(
        client,
        "Boolean(document.querySelector('#ytkit-settings-panel'))",
        timeoutMs,
        'settings panel before disabling Theater Split'
    );
    const toggled = await evaluate(client, `(() => {
        const toggle = document.querySelector('#ytkit-toggle-stickyVideo');
        if (!toggle || !toggle.checked) return false;
        toggle.click();
        document.querySelector('#ytkit-settings-panel .ytkit-close, #ytkit-close-footer')?.click();
        return true;
    })()`);
    if (!toggled) throw new Error('watch themes: Theater Split toggle was unavailable or already off');
}

async function captureNormalWatchDetails(client, name) {
    await evaluate(client, `(() => {
        const target = document.querySelector('#below, ytd-watch-metadata');
        if (!target) return false;
        target.scrollIntoView({ block: 'start', behavior: 'instant' });
        return true;
    })()`);
    await sleep(500);
    const details = await evaluate(client, `(() => {
        const target = document.querySelector('#below, ytd-watch-metadata');
        if (!target) return { available: false, visible: false, background: '', color: '', colorScheme: '' };
        const inspect = (selector) => {
            const node = document.querySelector(selector);
            if (!node) return null;
            const style = getComputedStyle(node);
            const whiteDescendants = [...node.querySelectorAll('*')].filter((child) => getComputedStyle(child).backgroundColor === 'rgb(255, 255, 255)').length;
            return {
                selector,
                text: String(node.textContent || '').trim().slice(0, 90),
                color: style.color,
                textFill: style.webkitTextFillColor,
                background: style.backgroundColor,
                backgroundImage: style.backgroundImage,
                beforeBackground: getComputedStyle(node, '::before').backgroundColor,
                afterBackground: getComputedStyle(node, '::after').backgroundColor,
                whiteDescendants,
                opacity: style.opacity,
                display: style.display,
                visibility: style.visibility
            };
        };
        const rect = target.getBoundingClientRect();
        const bodyStyle = getComputedStyle(document.body);
        const rootStyle = getComputedStyle(document.documentElement);
        const authorProbeSelector = 'html.ytkit-watch-restyle.ytkit-watch-restyle:not(.ytkit-split-active):not(.ytkit-split-open) body ytd-comment-view-model #author-text#author-text#author-text';
        const featureStyles = [...document.querySelectorAll('style[id^="yt-suite-style-chatStyleComments"], style[id^="yt-suite-style-watchPageRestyle"]')].map((style) => ({
            id: style.id,
            bytes: style.textContent?.length || 0,
            hasThemeGuard: style.textContent?.includes('YouTube ships late ID-heavy comment rules') || false,
            parsedRules: style.sheet?.cssRules?.length || 0,
            authorGuardRules: style.sheet
                ? [...style.sheet.cssRules].filter((rule) => String(rule.selectorText || '').includes('#author-text#author-text#author-text')).map((rule) => rule.selectorText)
                : []
        }));
        return {
            available: true,
            visible: rect.bottom > 56 && rect.top < window.innerHeight,
            background: bodyStyle.backgroundColor,
            color: bodyStyle.color,
            colorScheme: rootStyle.colorScheme,
            rootClasses: document.documentElement.className,
            premiumText: rootStyle.getPropertyValue('--ytkit-premium-text').trim(),
            authorProbeMatches: document.querySelectorAll(authorProbeSelector).length,
            featureStyles,
            surfaces: [
                'ytd-watch-metadata',
                'ytd-watch-metadata #owner',
                'ytd-comments#comments',
                'ytd-comments-header-renderer #count',
                'ytd-comments-header-renderer #sort-menu',
                'ytd-comment-view-model #author-text, ytd-comment-renderer #author-text',
                'ytd-comment-view-model #content-text, ytd-comment-renderer #content-text',
                'ytd-comment-view-model ytd-comment-engagement-bar button, ytd-comment-renderer ytd-comment-engagement-bar button',
                'ytd-watch-metadata #actions button, ytd-watch-metadata #owner button'
            ].map(inspect)
        };
    })()`);
    await capture(client, name);
    return details;
}

async function verifyWatchThemeSurfaces(client, backgroundClient, timeoutMs) {
    const failures = [];

    await setWatchTheme(client, true);
    await capture(client, 'watch-theater-collapsed-dark-1440x900');

    const playerBox = await evaluate(client, `(() => {
        const player = document.querySelector('#movie_player, ytd-player');
        const rect = player?.getBoundingClientRect();
        return rect ? {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
        } : null;
    })()`);
    if (!playerBox || playerBox.width < 400 || playerBox.height < 240) {
        failures.push('watch themes: collapsed Theater player is not measurable');
    } else {
        await client.send('Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            x: Math.round(playerBox.x + playerBox.width / 2),
            y: Math.round(playerBox.y + playerBox.height / 2),
            deltaX: 0,
            deltaY: 720
        });
    }

    await waitForExpression(
        client,
        "document.documentElement.classList.contains('ytkit-split-open') && Boolean(document.querySelector('#ytkit-split-divider'))",
        timeoutMs,
        'open Theater Split surface'
    );
    await sleep(750);

    const split = await evaluate(client, `(() => {
        const left = document.querySelector('#ytkit-split-left');
        const right = document.querySelector('#ytkit-split-right');
        const divider = document.querySelector('#ytkit-split-divider');
        const leftRect = left?.getBoundingClientRect();
        const rightRect = right?.getBoundingClientRect();
        const dividerRect = divider?.getBoundingClientRect();
        const firstContent = document.querySelector('#below ytd-comment-view-model #content-text, #below ytd-comment-renderer #content-text');
        const firstAuthor = document.querySelector('#below ytd-comment-view-model #author-text, #below ytd-comment-renderer #author-text');
        const firstAction = document.querySelector('#below ytd-comment-view-model ytd-comment-engagement-bar button, #below ytd-comment-renderer ytd-comment-engagement-bar button');
        const ownerControl = document.querySelector('#below ytd-watch-metadata #owner button, #below ytd-watch-metadata #actions button');
        return {
            leftWidth: leftRect?.width || 0,
            rightWidth: rightRect?.width || 0,
            dividerWidth: dividerRect?.width || 0,
            dividerRole: divider?.getAttribute('role') || '',
            dividerOrientation: divider?.getAttribute('aria-orientation') || '',
            dividerValue: Number(divider?.getAttribute('aria-valuenow') || 0),
            dividerTabIndex: divider?.tabIndex ?? -1,
            panelBackground: right ? getComputedStyle(right).backgroundColor : '',
            panelColor: right ? getComputedStyle(right).color : '',
            colorScheme: getComputedStyle(document.documentElement).colorScheme,
            contentColor: firstContent ? getComputedStyle(firstContent).color : '',
            contentBackground: firstContent ? getComputedStyle(firstContent).backgroundColor : '',
            authorColor: firstAuthor ? getComputedStyle(firstAuthor).color : '',
            actionBackground: firstAction ? getComputedStyle(firstAction).backgroundColor : '',
            actionColor: firstAction ? getComputedStyle(firstAction).color : '',
            actionWhiteDescendants: firstAction ? [...firstAction.querySelectorAll('*')].filter((child) => getComputedStyle(child).backgroundColor === 'rgb(255, 255, 255)').length : 0,
            actionBeforeBackground: firstAction ? getComputedStyle(firstAction, '::before').backgroundColor : '',
            actionAfterBackground: firstAction ? getComputedStyle(firstAction, '::after').backgroundColor : '',
            ownerControlBackground: ownerControl ? getComputedStyle(ownerControl).backgroundColor : '',
            ownerControlColor: ownerControl ? getComputedStyle(ownerControl).color : '',
            commentsVisible: Boolean(document.querySelector('#below.ytkit-split-scroll-surface'))
        };
    })()`);
    if (split.leftWidth < 400 || split.rightWidth < 240) failures.push('watch themes: Theater Split columns are not both usable');
    if (split.dividerWidth < 6 || split.dividerWidth > 14) failures.push(`watch themes: divider width is ${split.dividerWidth}px`);
    if (split.dividerRole !== 'separator' || split.dividerOrientation !== 'vertical') {
        failures.push('watch themes: Theater Split divider lacks separator semantics');
    }
    if (split.dividerValue < 25 || split.dividerValue > 85 || split.dividerTabIndex < 0) {
        failures.push('watch themes: Theater Split divider is not operable');
    }
    if (!split.commentsVisible) failures.push('watch themes: Theater Split comments surface is missing');
    await capture(client, 'watch-theater-split-dark-1440x900');

    await setWatchTheme(client, false);
    const splitLight = await evaluate(client, `(() => {
        const right = document.querySelector('#ytkit-split-right');
        const comments = document.querySelector('#below.ytkit-split-scroll-surface');
        const firstContent = document.querySelector('#below ytd-comment-view-model #content-text, #below ytd-comment-renderer #content-text');
        const firstAuthor = document.querySelector('#below ytd-comment-view-model #author-text, #below ytd-comment-renderer #author-text');
        const title = document.querySelector('#below ytd-watch-metadata #title');
        const owner = document.querySelector('#below ytd-watch-metadata #owner');
        const firstAction = document.querySelector('#below ytd-comment-view-model ytd-comment-engagement-bar button, #below ytd-comment-renderer ytd-comment-engagement-bar button');
        const ownerControl = document.querySelector('#below ytd-watch-metadata #owner button, #below ytd-watch-metadata #actions button');
        const contentStyle = firstContent ? getComputedStyle(firstContent) : null;
        const authorStyle = firstAuthor ? getComputedStyle(firstAuthor) : null;
        const ownerStyle = owner ? getComputedStyle(owner) : null;
        return {
            darkAttribute: document.documentElement.hasAttribute('dark'),
            rootClasses: document.documentElement.className,
            panelBackground: right ? getComputedStyle(right).backgroundColor : '',
            panelColor: right ? getComputedStyle(right).color : '',
            commentsBackground: comments ? getComputedStyle(comments).backgroundColor : '',
            colorScheme: getComputedStyle(document.documentElement).colorScheme,
            contentColor: contentStyle?.color || '',
            contentFill: contentStyle?.webkitTextFillColor || '',
            contentBackground: contentStyle?.backgroundColor || '',
            authorColor: authorStyle?.color || '',
            authorFill: authorStyle?.webkitTextFillColor || '',
            titleColor: title ? getComputedStyle(title).color : '',
            ownerBackground: ownerStyle?.backgroundColor || '',
            ownerBackgroundImage: ownerStyle?.backgroundImage || '',
            actionBackground: firstAction ? getComputedStyle(firstAction).backgroundColor : '',
            actionColor: firstAction ? getComputedStyle(firstAction).color : '',
            actionWhiteDescendants: firstAction ? [...firstAction.querySelectorAll('*')].filter((child) => getComputedStyle(child).backgroundColor === 'rgb(255, 255, 255)').length : 0,
            actionBeforeBackground: firstAction ? getComputedStyle(firstAction, '::before').backgroundColor : '',
            actionAfterBackground: firstAction ? getComputedStyle(firstAction, '::after').backgroundColor : '',
            ownerControlBackground: ownerControl ? getComputedStyle(ownerControl).backgroundColor : '',
            ownerControlColor: ownerControl ? getComputedStyle(ownerControl).color : '',
            premiumText: getComputedStyle(document.documentElement).getPropertyValue('--ytkit-premium-text').trim()
        };
    })()`);
    if (splitLight.darkAttribute) failures.push('watch themes: light Theater Split retained YouTube dark mode');
    if (split.colorScheme !== 'dark' || splitLight.colorScheme !== 'light') {
        failures.push('watch themes: Theater Split color-scheme does not follow YouTube');
    }
    if (!split.panelBackground || split.panelBackground === splitLight.panelBackground) {
        failures.push('watch themes: Theater Split panel does not visibly change between dark and light');
    }
    const lightTextChannel = '23, 35, 53';
    if (!splitLight.authorColor.includes(lightTextChannel) || !splitLight.authorFill.includes(lightTextChannel)) {
        failures.push('watch themes: light Theater Split author text is not using the light ink token');
    }
    if (!splitLight.contentColor.includes(lightTextChannel) || !splitLight.contentFill.includes(lightTextChannel)) {
        failures.push('watch themes: light Theater Split comment text is not using the light ink token');
    }
    if (!splitLight.ownerBackground.includes('243, 246, 249') || splitLight.ownerBackgroundImage !== 'none') {
        failures.push('watch themes: light Theater Split owner card retained the dark decorative surface');
    }
    for (const [label, value] of [
        ['dark Theater Split comment', split.contentBackground],
        ['light Theater Split comment', splitLight.contentBackground]
    ]) {
        if (value !== 'rgba(0, 0, 0, 0)') failures.push(`watch themes: ${label} text retained a decorative background`);
    }
    for (const [label, snapshot] of [
        ['dark Theater Split action', split],
        ['light Theater Split action', splitLight]
    ]) {
        if (snapshot.actionBackground === 'rgb(255, 255, 255)'
            || snapshot.actionBeforeBackground === 'rgb(255, 255, 255)'
            || snapshot.actionAfterBackground === 'rgb(255, 255, 255)'
            || snapshot.actionWhiteDescendants > 0) {
            failures.push(`watch themes: ${label} resolved to a white block`);
        }
    }
    await capture(client, 'watch-theater-split-light-1440x900');

    await disableTheaterSplit(client, backgroundClient, timeoutMs);
    await waitForExpression(
        client,
        "!document.documentElement.classList.contains('ytkit-split-active') && !document.querySelector('#ytkit-split-wrapper')",
        timeoutMs,
        'native watch layout after disabling Theater Split'
    );
    await evaluate(client, 'window.scrollTo(0, 0)');
    await sleep(750);

    await setWatchTheme(client, true);
    const normalDark = await pageSnapshot(client, 'watch-normal-dark');
    await capture(client, 'watch-normal-dark-1440x900');
    const normalDarkDetails = await captureNormalWatchDetails(
        client,
        'watch-normal-dark-details-1440x900'
    );

    await evaluate(client, 'window.scrollTo(0, 0)');
    await setWatchTheme(client, false);
    const normalLight = await pageSnapshot(client, 'watch-normal-light');
    await capture(client, 'watch-normal-light-1440x900');
    const normalLightDetails = await captureNormalWatchDetails(
        client,
        'watch-normal-light-details-1440x900'
    );

    failures.push(...normalDark.failures, ...normalLight.failures);
    if (!normalDarkDetails.available || !normalDarkDetails.visible) {
        failures.push('watch themes: normal dark metadata surface is unavailable');
    }
    if (!normalLightDetails.available || !normalLightDetails.visible) {
        failures.push('watch themes: normal light metadata surface is unavailable');
    }
    if (normalDarkDetails.colorScheme !== 'dark' || normalLightDetails.colorScheme !== 'light') {
        failures.push('watch themes: normal watch color-scheme does not follow YouTube');
    }
    if (!normalDarkDetails.background || normalDarkDetails.background === normalLightDetails.background) {
        failures.push('watch themes: normal watch canvas does not visibly change between dark and light');
    }
    for (const surface of normalLightDetails.surfaces.filter((entry) => entry && /#(?:count|sort-menu|author-text|content-text)/.test(entry.selector))) {
        if (!surface.color.includes(lightTextChannel) || !surface.textFill.includes(lightTextChannel)) {
            failures.push(`watch themes: ${surface.selector} is not using readable light-theme ink`);
        }
    }
    for (const details of [normalDarkDetails, normalLightDetails]) {
        const content = details.surfaces.find((surface) => surface?.selector.includes('#content-text'));
        const action = details.surfaces.find((surface) => surface?.selector.includes('ytd-comment-engagement-bar button'));
        if (content?.background !== 'rgba(0, 0, 0, 0)') failures.push('watch themes: normal comment text retained a decorative background');
        if (action?.background === 'rgb(255, 255, 255)'
            || action?.beforeBackground === 'rgb(255, 255, 255)'
            || action?.afterBackground === 'rgb(255, 255, 255)'
            || action?.whiteDescendants > 0) {
            failures.push('watch themes: normal comment action resolved to a white block');
        }
    }
    const report = {
        split,
        splitLight,
        normalDark: normalDark.snapshot,
        normalLight: normalLight.snapshot,
        normalDarkDetails,
        normalLightDetails
    };
    fs.writeFileSync(
        path.join(OUT_DIR, 'watch-theme-snapshot.json'),
        `${JSON.stringify(report, null, 2)}\n`,
        'utf8'
    );
    if (failures.length) throw new Error(failures.join('\n'));
    return report;
}

async function verifyLiveSettings(client, timeoutMs) {
    const opened = await evaluate(client, `(() => {
        const trigger = document.querySelector('#ytkit-masthead-btn, #ytkit-watch-btn');
        if (!trigger) return false;
        trigger.click();
        return true;
    })()`);
    if (!opened) throw new Error('Could not open Astra settings from its live YouTube trigger');
    await waitForExpression(
        client,
        "Boolean(document.querySelector('#ytkit-settings-panel'))",
        timeoutMs,
        'Astra settings panel'
    );
    const selectedVideoHider = await evaluate(client, `(() => {
        const tab = document.querySelector('#ytkit-tab-Video-Hider');
        if (!tab) return false;
        tab.click();
        return true;
    })()`);
    if (!selectedVideoHider) throw new Error('Live settings panel is missing the Video Hider category');
    await waitForExpression(
        client,
        "document.querySelector('#ytkit-tab-Video-Hider')?.classList.contains('active')",
        timeoutMs,
        'Video Hider settings category'
    );
    const snapshot = await evaluate(client, `(() => {
        const panel = document.querySelector('#ytkit-settings-panel');
        const pane = document.querySelector('#ytkit-pane-Video-Hider');
        const visible = (node) => {
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const clippedLabels = Array.from(panel?.querySelectorAll('.ytkit-nav-label, .ytkit-nav-meta, .ytkit-pane-context-value') || [])
            .filter((node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1)
            .map((node) => node.textContent.trim());
        const summaryCards = Array.from(pane?.querySelectorAll('.ytkit-vh-summary-card') || []);
        return {
            panelVisible: Boolean(panel && visible(panel)),
            width: panel?.getBoundingClientRect().width || 0,
            height: panel?.getBoundingClientRect().height || 0,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            paneVisible: Boolean(pane && visible(pane)),
            missionIcon: Boolean(pane?.querySelector('.ytkit-pane-lead .ytkit-pane-icon svg')),
            summaryCount: summaryCards.length,
            summaryLabels: summaryCards.map((card) => card.querySelector('.ytkit-vh-summary-card__label')?.textContent.trim() || ''),
            summaryValues: summaryCards.map((card) => card.querySelector('.ytkit-vh-summary-card__value')?.textContent.trim() || ''),
            clippedLabels
        };
    })()`);
    const failures = [];
    if (!snapshot.panelVisible || !snapshot.paneVisible) failures.push('live settings: panel or Video Hider pane is not visible');
    if (!snapshot.missionIcon) failures.push('live settings: Video Hider mission icon is missing');
    if (snapshot.summaryCount !== 3) failures.push(`live settings: expected 3 summary cards, found ${snapshot.summaryCount}`);
    if (snapshot.summaryLabels.some((label) => !label)) failures.push('live settings: a summary card has no label');
    if (snapshot.summaryValues.some((value) => !value)) failures.push('live settings: a summary card has no value');
    if (snapshot.clippedLabels.length) failures.push(`live settings: clipped labels: ${snapshot.clippedLabels.join(', ')}`);
    if (snapshot.width > snapshot.viewportWidth || snapshot.height > snapshot.viewportHeight) {
        failures.push('live settings: command deck exceeds the desktop viewport');
    }
    await capture(client, 'settings-video-hider-1440x900');
    await evaluate(client, "document.querySelector('#ytkit-settings-panel .ytkit-close, #ytkit-close-footer')?.click()")
        .catch(() => undefined);
    if (failures.length) throw new Error(failures.join('\n'));
    return snapshot;
}

async function runCandidate(candidate, stageDir, options) {
    const browserProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-zero-ad-profile-'));
    const port = await reserveLoopbackPort();
    const browserOptions = { headed: false };
    const args = chromiumArgs(browserProfile, stageDir, browserOptions, port);
    args[args.length - 1] = `https://www.youtube.com/?astra_zero_ad_smoke=${Date.now()}`;
    const proc = spawn(candidate.path, args, {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    let client = null;
    let backgroundClient = null;
    try {
        await waitForDevTools(port, options.timeoutMs);
        const backgroundTarget = await waitForBackgroundTarget(port, options.timeoutMs);
        const extensionId = extensionIdFromTarget(backgroundTarget);
        backgroundClient = await connectCdp(backgroundTarget.webSocketDebuggerUrl);
        await backgroundClient.send('Runtime.enable');
        const hasDnrApi = await evaluate(
            backgroundClient,
            'typeof chrome?.declarativeNetRequest?.getEnabledRulesets === "function"'
        );
        if (!hasDnrApi) {
            const error = new Error(`${candidate.label} does not expose the MV3 DNR API`);
            error.code = 'DNR_UNAVAILABLE';
            throw error;
        }
        const enabledRulesets = await evaluate(
            backgroundClient,
            'chrome.declarativeNetRequest.getEnabledRulesets()'
        );
        if (!enabledRulesets.includes('astra_zero_ads')) {
            throw new Error(`MV3 zero-ad ruleset is not enabled: ${JSON.stringify(enabledRulesets)}`);
        }

        const pageTarget = await waitForYoutubePage(port, options.timeoutMs);
        client = await connectCdp(pageTarget.webSocketDebuggerUrl);
        await client.send('Page.enable');
        await client.send('Runtime.enable');
        await client.send('Network.enable');
        await client.send('Network.setCacheDisabled', { cacheDisabled: true });
        await client.send('Emulation.setDeviceMetricsOverride', {
            width: 1440,
            height: 900,
            deviceScaleFactor: 1,
            mobile: false
        });

        const coldStart = client.events.length;
        await client.send('Network.clearBrowserCache');
        await client.send('Page.navigate', {
            url: `https://www.youtube.com/?astra_zero_ad_cold=${Date.now()}`
        });
        await waitForExpression(
            client,
            "Boolean(document.querySelector('ytd-app') && document.querySelector('ytd-masthead, #masthead'))",
            options.timeoutMs,
            'cold YouTube home shell'
        );
        await waitForExpression(
            client,
            "Boolean(document.querySelector('#ytkit-masthead-btn, #ytkit-watch-btn'))",
            options.timeoutMs,
            'Astra content runtime'
        );
        const liveSettings = await verifyLiveSettings(client, options.timeoutMs);
        await sleep(5000);
        const home = await pageSnapshot(client, 'home');
        await capture(client, 'home-1440x900');
        const coldNetwork = adEvents(client.events, coldStart);

        // A logged-out fresh profile may show an intentionally empty home.
        // Search is read-only and reliably supplies a native watch link, which
        // lets the smoke exercise YouTube's real client-side route transition.
        await client.send('Page.navigate', {
            url: 'https://www.youtube.com/results?search_query=open+source+browser+extensions'
        });
        await waitForExpression(
            client,
            "Boolean(document.querySelector('a[href*=" + JSON.stringify('/watch?v=') + "]'))",
            options.timeoutMs,
            'a search-result watch link'
        );
        const spaStart = client.events.length;
        const clicked = await evaluate(client, `(() => {
            const link = Array.from(document.querySelectorAll('a[href*="/watch?v="]'))
                .find((node) => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
            if (!link) return false;
            link.click();
            return true;
        })()`);
        if (!clicked) throw new Error('Could not click a visible native watch link for SPA verification');
        await waitForExpression(
            client,
            "location.pathname === '/watch' && Boolean(document.querySelector('video.html5-main-video'))",
            options.timeoutMs,
            'SPA watch navigation and player'
        );
        await sleep(5000);
        const watch = await pageSnapshot(client, 'watch');
        await capture(client, 'watch-1440x900');
        const watchThemes = await verifyWatchThemeSurfaces(client, backgroundClient, options.timeoutMs);
        const spaNetwork = adEvents(client.events, spaStart);

        const allResponses = [...coldNetwork.responses, ...spaNetwork.responses];
        const failures = [...home.failures, ...watch.failures];
        if (allResponses.length) {
            failures.push(`ad request received a response: ${allResponses.map(({ url, status }) => `${status} ${url}`).join(', ')}`);
        }
        const allBlocked = [...coldNetwork.failures, ...spaNetwork.failures].filter(({ errorText, blockedReason }) =>
            /BLOCKED_BY_CLIENT/i.test(errorText) || /(?:other|inspector)/i.test(blockedReason));
        if (!allBlocked.length) {
            failures.push('no captured ad request reported a browser-level blocked outcome');
        }
        if (failures.length) throw new Error(failures.join('\n'));

        return {
            browser: candidate.label,
            extensionId,
            enabledRulesets,
            home: home.snapshot,
            watch: watch.snapshot,
            watchThemes,
            liveSettings,
            blockedRequests: allBlocked,
            coldAdRequests: coldNetwork.requests.length,
            spaAdRequests: spaNetwork.requests.length
        };
    } catch (error) {
        if (hasLoadExtensionPolicyBlock(stderr)) error.code = 'LOAD_EXTENSION_BLOCKED';
        error.stderr = stderr;
        throw error;
    } finally {
        client?.close();
        backgroundClient?.close();
        killProcessTree(proc);
        await removeDirWithRetries(browserProfile);
    }
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    const candidates = browserCandidates(options.browser);
    if (!candidates.length) throw new Error('No Chromium-family browser is available');
    const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-zero-ad-stage-'));
    const { stageDir } = createChromiumStage(stageRoot);
    try {
        let lastError = null;
        for (const candidate of candidates) {
            try {
                const result = await runCandidate(candidate, stageDir, options);
                console.log(
                    `[smoke-zero-ads-live] PASS — ${result.browser} loaded ${result.extensionId}; `
                    + `${result.enabledRulesets.join(', ')} enabled; ${result.blockedRequests.length} ad request(s) blocked; `
                    + 'home + SPA watch shells collapsed; live settings + masthead/search/player intact'
                );
                console.log(`[smoke-zero-ads-live] screenshots: ${OUT_DIR}`);
                return result;
            } catch (error) {
                lastError = error;
                if (error.code === 'LOAD_EXTENSION_BLOCKED' || error.code === 'DNR_UNAVAILABLE') continue;
                throw error;
            }
        }
        throw lastError || new Error('Every Chromium candidate rejected --load-extension');
    } finally {
        if (!options.keepStage) await removeDirWithRetries(stageRoot);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error('[smoke-zero-ads-live]', error.message || error);
        process.exitCode = 1;
    });
}

module.exports = { AD_SELECTORS, AD_URL_RE, adEvents, main, pageSnapshot, parseArgs, verifyLiveSettings };
