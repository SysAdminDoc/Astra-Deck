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
const LIVE_WATCH_FIXTURE_ID = 'jNQXAC9IVRw';
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
        const healthOverlays = Array.from(document.querySelectorAll(
            '#ytkit-service-state-strip, .ytkit-service-state-pill'
        )).filter(visible).map((node) => String(node.textContent || '').replace(/\s+/g, ' ').trim());
        const semanticSponsored = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
            const text = String(textNode.nodeValue || '').replace(/\s+/g, ' ').trim();
            if (!/^Sponsored(?:\b|\s*[·•])/i.test(text) || text.length > 120) continue;
            const parent = textNode.parentElement;
            if (!parent || !visible(parent)) continue;
            const rail = parent.closest('#secondary, #related, ytd-watch-next-secondary-results-renderer');
            if (!rail) continue;
            const ancestry = [];
            for (let node = parent, depth = 0; node && depth < 12; depth += 1) {
                const classes = Array.from(node.classList || []).slice(0, 4);
                ancestry.push(node.tagName.toLowerCase()
                    + (node.id ? '#' + node.id : '')
                    + (classes.length ? '.' + classes.join('.') : ''));
                const root = node.getRootNode?.();
                node = node.parentElement || (root && root.host instanceof Element ? root.host : null);
            }
            const rect = parent.getBoundingClientRect();
            semanticSponsored.push({
                text,
                ancestry,
                rect: {
                    x: Math.round(rect.x),
                    y: Math.round(rect.y),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height)
                }
            });
        }
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
            shells,
            healthOverlays,
            semanticSponsored
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
    for (const hit of snapshot.semanticSponsored || []) {
        failures.push(`${routeName}: visible Sponsored card in the related rail: ${JSON.stringify(hit)}`);
    }
    if (snapshot.healthOverlays.length) {
        failures.push(`${routeName}: unsolicited health overlay is visible: ${JSON.stringify(snapshot.healthOverlays)}`);
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

async function captureElement(client, name, selector, padding = 12) {
    const clip = await evaluate(client, `(() => {
        const visible = (node) => {
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden'
                && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
        };
        const node = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(visible);
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        const inset = ${padding};
        const x = Math.max(0, rect.x - inset);
        const y = Math.max(0, rect.y - inset);
        return {
            x,
            y,
            width: Math.min(innerWidth - x, rect.width + inset * 2),
            height: Math.min(innerHeight - y, rect.height + inset * 2),
            scale: 1
        };
    })()`);
    if (!clip || clip.width <= 0 || clip.height <= 0) return null;
    const shot = await client.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
        clip
    });
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), Buffer.from(shot.data, 'base64'));
    return clip;
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

async function setWatchSettingEnabled(client, backgroundClient, key, enabled, timeoutMs) {
    const opened = await openSettingsPanelFromBackground(backgroundClient);
    if (!opened) throw new Error('watch themes: settings panel did not open from the extension worker');
    await waitForExpression(
        client,
        "Boolean(document.querySelector('#ytkit-settings-panel'))",
        timeoutMs,
        `settings panel before changing ${key}`
    );
    const result = await evaluate(client, `(() => {
        const toggle = document.querySelector(${JSON.stringify(`#ytkit-toggle-${key}`)});
        if (!toggle) return { found: false, checked: false };
        if (toggle.checked !== ${enabled ? 'true' : 'false'}) toggle.click();
        const checked = toggle.checked;
        document.querySelector('#ytkit-settings-panel .ytkit-close, #ytkit-close-footer')?.click();
        return { found: true, checked };
    })()`);
    if (!result?.found || result.checked !== enabled) {
        throw new Error(`watch themes: ${key} could not be ${enabled ? 'enabled' : 'disabled'}`);
    }
}

async function setStoredWatchSetting(backgroundClient, key, enabled) {
    return evaluate(backgroundClient, `(async () => {
        const stored = await chrome.storage.local.get('ytSuiteSettings');
        const settings = stored.ytSuiteSettings && typeof stored.ytSuiteSettings === 'object'
            ? stored.ytSuiteSettings : {};
        await chrome.storage.local.set({
            ytSuiteSettings: { ...settings, [${JSON.stringify(key)}]: ${enabled ? 'true' : 'false'} }
        });
        return true;
    })()`);
}

async function verifyCommentSortDropdown(client, backgroundClient, timeoutMs) {
    await setStoredWatchSetting(backgroundClient, 'sortCommentsNewest', false);
    await sleep(300);
    await evaluate(client, `(() => {
        const button = document.querySelector([
            '#comments #sort-menu tp-yt-paper-button',
            '#comments #sort-menu yt-sort-filter-sub-menu-renderer tp-yt-paper-button',
            '#comments #sort-menu button',
            '#comments [slot="toolbar"] tp-yt-paper-button',
            '#comments [slot="toolbar"] button',
            '#comments button[aria-label*="Sort comments"]'
        ].join(', '));
        button?.scrollIntoView({ block: 'center', behavior: 'instant' });
        return Boolean(button);
    })()`);
    await waitForExpression(
        client,
        `(() => {
            const button = document.querySelector([
                '#comments #sort-menu tp-yt-paper-button',
                '#comments #sort-menu yt-sort-filter-sub-menu-renderer tp-yt-paper-button',
                '#comments #sort-menu button',
                '#comments [slot="toolbar"] tp-yt-paper-button',
                '#comments [slot="toolbar"] button',
                '#comments button[aria-label*="Sort comments"]'
            ].join(', '));
            const rect = button?.getBoundingClientRect();
            return Boolean(rect && rect.width > 20 && rect.height > 20
                && rect.top >= 0 && rect.bottom <= innerHeight);
        })()`,
        timeoutMs,
        'visible native comment-sort button'
    );
    const clicked = await evaluate(client, `(() => {
        const button = document.querySelector([
            '#comments #sort-menu tp-yt-paper-button',
            '#comments #sort-menu yt-sort-filter-sub-menu-renderer tp-yt-paper-button',
            '#comments #sort-menu button',
            '#comments [slot="toolbar"] tp-yt-paper-button',
            '#comments [slot="toolbar"] button',
            '#comments button[aria-label*="Sort comments"]'
        ].join(', '));
        if (!button) return false;
        button.click();
        return true;
    })()`);
    if (!clicked) throw new Error('comment sort: native button could not be clicked');
    try {
        await waitForExpression(
            client,
            `Array.from(document.querySelectorAll('tp-yt-iron-dropdown')).some(dropdown => {
                if (dropdown.getAttribute('aria-hidden') === 'true') return false;
                if (dropdown.getAttribute('aria-hidden') === 'false' || dropdown.hasAttribute('opened')) return true;
                const rect = dropdown.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            })`,
            timeoutMs,
            'open native comment-sort dropdown'
        );
    } catch (error) {
        const diagnostics = await evaluate(client, `(() => {
            const visible = node => {
                const rect = node.getBoundingClientRect();
                const style = getComputedStyle(node);
                return rect.width > 0 && rect.height > 0
                    && style.display !== 'none' && style.visibility !== 'hidden';
            };
            const describe = node => ({
                tag: node.tagName.toLowerCase(),
                id: node.id || '',
                className: String(node.className || ''),
                role: node.getAttribute('role') || '',
                ariaLabel: node.getAttribute('aria-label') || '',
                ariaHidden: node.getAttribute('aria-hidden'),
                opened: node.hasAttribute('opened'),
                text: String(node.textContent || '').trim().slice(0, 240),
                html: node.outerHTML.slice(0, 800)
            });
            const button = document.querySelector('#comments #sort-menu button');
            const candidates = [...document.querySelectorAll([
                'tp-yt-iron-dropdown',
                'ytd-menu-popup-renderer',
                'yt-list-view-model',
                '[role="menu"]',
                '[role="listbox"]',
                '[popover]'
            ].join(', '))].filter(visible).map(describe);
            return {
                button: button ? describe(button) : null,
                candidates
            };
        })()`);
        fs.writeFileSync(
            path.join(OUT_DIR, 'watch-comment-sort-click-diagnostics.json'),
            JSON.stringify(diagnostics, null, 2) + '\n'
        );
        await capture(client, 'watch-comment-sort-click-diagnostics-1440x900');
        throw new Error(`${error.message}: ${JSON.stringify(diagnostics)}`);
    }
    await setStoredWatchSetting(backgroundClient, 'sortCommentsNewest', true);
    await sleep(500);
    await evaluate(client, `(() => {
        const comments = document.querySelector('#comments');
        if (!comments) return false;
        const marker = document.createElement('span');
        marker.hidden = true;
        marker.dataset.astraSortSmoke = '1';
        comments.appendChild(marker);
        marker.remove();
        return true;
    })()`);
    // Hold past both the mutation delay and the initial four-second run.
    await sleep(5200);
    const snapshot = await evaluate(client, `(() => {
        const dropdown = Array.from(document.querySelectorAll('tp-yt-iron-dropdown')).find(node => {
            if (node.getAttribute('aria-hidden') === 'true') return false;
            if (node.getAttribute('aria-hidden') === 'false' || node.hasAttribute('opened')) return true;
            const candidateRect = node.getBoundingClientRect();
            return candidateRect.width > 0 && candidateRect.height > 0;
        });
        const links = dropdown ? Array.from(dropdown.querySelectorAll('tp-yt-paper-listbox a')) : [];
        const optionNodes = links.length > 0 ? links : (dropdown ? Array.from(dropdown.querySelectorAll([
            'tp-yt-paper-listbox tp-yt-paper-item',
            'ytd-menu-popup-renderer tp-yt-paper-item',
            'ytd-menu-service-item-renderer tp-yt-paper-item'
        ].join(', '))) : []);
        const items = optionNodes.map(node => String(node.textContent || '').replace(/\\s+/g, ' ').trim());
        const rect = dropdown?.getBoundingClientRect();
        const shell = dropdown?.querySelector('#contentWrapper') || dropdown;
        const item = optionNodes[0] || null;
        const shellStyle = shell ? getComputedStyle(shell) : null;
        const itemStyle = item ? getComputedStyle(item) : null;
        const parseRgb = value => {
            const match = String(value || '').match(/rgba?\\((\\d+(?:\\.\\d+)?),\\s*(\\d+(?:\\.\\d+)?),\\s*(\\d+(?:\\.\\d+)?)/i);
            return match ? match.slice(1, 4).map(Number) : null;
        };
        const relativeLuminance = value => {
            const rgb = parseRgb(value);
            if (!rgb) return null;
            const channels = rgb.map(channel => {
                const normalized = channel / 255;
                return normalized <= 0.04045
                    ? normalized / 12.92
                    : Math.pow((normalized + 0.055) / 1.055, 2.4);
            });
            return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        const textLuminance = relativeLuminance(itemStyle?.color);
        const panelLuminance = relativeLuminance(shellStyle?.backgroundColor);
        const contrast = textLuminance == null || panelLuminance == null
            ? null
            : (Math.max(textLuminance, panelLuminance) + 0.05)
                / (Math.min(textLuminance, panelLuminance) + 0.05);
        return {
            open: Boolean(dropdown && rect && rect.width > 0 && rect.height > 0),
            items,
            panel: shellStyle ? {
                background: shellStyle.backgroundColor,
                borderColor: shellStyle.borderColor,
                borderRadius: shellStyle.borderRadius
            } : null,
            firstItem: itemStyle ? {
                color: itemStyle.color,
                background: itemStyle.backgroundColor,
                borderRadius: itemStyle.borderRadius
            } : null,
            contrast,
            rect: rect ? {
                left: Math.round(rect.left),
                top: Math.round(rect.top),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            } : null
        };
    })()`);
    if (!snapshot.open || snapshot.items.length < 2) {
        throw new Error(`comment sort: dropdown closed after the user click: ${JSON.stringify(snapshot)}`);
    }
    if (!snapshot.panel || snapshot.panel.borderRadius !== '8px') {
        throw new Error(`comment sort: popup shell is not on the 8px surface radius: ${JSON.stringify(snapshot)}`);
    }
    if (!Number.isFinite(snapshot.contrast) || snapshot.contrast < 4.5) {
        throw new Error(`comment sort: option text contrast is ${snapshot.contrast}: ${JSON.stringify(snapshot)}`);
    }
    await capture(client, 'watch-comment-sort-open-1440x900');
    await evaluate(client, 'document.body.click()');
    await setStoredWatchSetting(backgroundClient, 'sortCommentsNewest', false);
    return snapshot;
}

async function setTheaterSplitEnabled(client, backgroundClient, enabled, timeoutMs) {
    await setWatchSettingEnabled(client, backgroundClient, 'stickyVideo', enabled, timeoutMs);
    await waitForExpression(
        client,
        enabled
            ? "document.documentElement.classList.contains('ytkit-split-active') && Boolean(document.querySelector('#ytkit-split-wrapper'))"
            : "!document.documentElement.classList.contains('ytkit-split-active') && !document.querySelector('#ytkit-split-wrapper')",
        timeoutMs,
        `${enabled ? 'mounted' : 'removed'} Theater Split layout`
    );
    await sleep(400);
}

async function revealRelatedWatchSurface(client, backgroundClient, timeoutMs) {
    await setWatchSettingEnabled(client, backgroundClient, 'hideRelatedVideos', false, timeoutMs);
    await waitForExpression(
        client,
        `(() => {
            const candidates = document.querySelectorAll([
                '#related .ytLockupMetadataViewModelTitle',
                '#related #video-title',
                'ytd-watch-next-secondary-results-renderer .ytLockupMetadataViewModelTitle',
                'ytd-watch-next-secondary-results-renderer #video-title'
            ].join(', '));
            return [...candidates].some(node => {
                const style = getComputedStyle(node);
                const rect = node.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden'
                    && rect.width > 0 && rect.height > 0;
            }) || [...document.querySelectorAll('ytd-live-chat-frame#chat:not([hidden])')]
                .some(node => node.getBoundingClientRect().width > 0);
        })()`,
        timeoutMs,
        'related videos or live chat after revealing the secondary watch surface'
    );
    await sleep(400);
}

async function verifySemanticSponsoredFallback(client, timeoutMs) {
    const fixtureId = 'astra-semantic-sponsored-fixture';
    const inserted = await evaluate(client, `(() => {
        document.getElementById(${JSON.stringify(fixtureId)})?.remove();
        const rail = document.querySelector('#related, ytd-watch-next-secondary-results-renderer');
        if (!rail) return false;
        const fixture = document.createElement('section');
        fixture.id = ${JSON.stringify(fixtureId)};
        fixture.style.cssText = 'box-sizing:border-box;width:100%;min-height:120px;padding:16px;display:block';
        const badge = document.createElement('span');
        badge.textContent = 'Sponsored · example.org';
        const destination = document.createElement('a');
        destination.href = 'https://example.org/offer';
        destination.textContent = 'Open site';
        fixture.append(badge, destination);
        rail.prepend(fixture);
        return true;
    })()`);
    if (!inserted) throw new Error('semantic zero-ad: related rail fixture could not be inserted');
    await waitForExpression(
        client,
        `(() => {
            const fixture = document.getElementById(${JSON.stringify(fixtureId)});
            if (!fixture?.hasAttribute('data-ytkit-zero-ad-semantic')) return false;
            const style = getComputedStyle(fixture);
            return style.display === 'none'
                && style.visibility === 'hidden'
                && fixture.getBoundingClientRect().height === 0;
        })()`,
        timeoutMs,
        'semantic sponsored-card fallback'
    );
    await sleep(250);
    const result = await evaluate(client, `(() => {
        const fixture = document.getElementById(${JSON.stringify(fixtureId)});
        const markedOrganicCards = document.querySelectorAll([
            '#related ytd-compact-video-renderer[data-ytkit-zero-ad-semantic]',
            'ytd-watch-next-secondary-results-renderer ytd-compact-video-renderer[data-ytkit-zero-ad-semantic]'
        ].join(', ')).length;
        const result = {
            marked: fixture?.hasAttribute('data-ytkit-zero-ad-semantic') === true,
            collapsed: fixture?.getBoundingClientRect().height === 0,
            markedOrganicCards
        };
        fixture?.remove();
        return result;
    })()`);
    if (!result.marked || !result.collapsed || result.markedOrganicCards !== 0) {
        throw new Error(`semantic zero-ad: unsafe fallback result ${JSON.stringify(result)}`);
    }
    return result;
}

async function captureWatchModeState(client) {
    return evaluate(client, `(() => {
        const root = document.documentElement;
        const flexy = document.querySelector('ytd-watch-flexy');
        const player = document.querySelector('#movie_player, ytd-player');
        const metadata = document.querySelector('ytd-watch-metadata');
        const rectOf = (node) => {
            const rect = node?.getBoundingClientRect();
            return rect ? {
                x: rect.x,
                y: rect.y,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                left: rect.left,
                width: rect.width,
                height: rect.height
            } : null;
        };
        const overlapArea = (a, b) => {
            if (!a || !b) return 0;
            const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
            const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
            return width * height;
        };
        const staleGeometry = [];
        const geometry = [
            ['#player-container', ['position', 'top', 'left', 'width', 'height', 'z-index']],
            ['#movie_player', ['width', 'height']],
            ['#movie_player .html5-video-container', ['width', 'height']],
            ['#movie_player video.html5-main-video', ['width', 'height', 'object-fit']],
            ['ytd-player > #container', ['width', 'height', 'padding-bottom']]
        ];
        for (const [selector, properties] of geometry) {
            const node = document.querySelector(selector);
            if (!node) continue;
            for (const property of properties) {
                const value = node.style.getPropertyValue(property);
                const priority = node.style.getPropertyPriority(property);
                const astraValue = (property === 'position' && value === 'fixed')
                    || (property === 'z-index' && value === '9998')
                    || (property === 'height' && (value === '100%' || value === '100vh'))
                    || (property === 'width' && value === '100%')
                    || (property === 'object-fit' && value === 'contain')
                    || (property === 'padding-bottom' && value === '0px');
                if (priority === 'important' && astraValue) {
                    staleGeometry.push(selector + ':' + property + '=' + value + '!important');
                }
            }
        }
        const fullBleedContainers = [
            '#full-bleed-container',
            '#player-full-bleed-container',
            '#player-theater-container'
        ].map(selector => {
            const node = document.querySelector(selector);
            const style = node ? getComputedStyle(node) : null;
            const rect = rectOf(node);
            return {
                selector,
                exists: Boolean(node),
                visible: Boolean(node && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0),
                background: style?.backgroundColor || '',
                pageToken: style?.getPropertyValue('--ytkit-native-theater-page').trim() || '',
                textToken: style?.getPropertyValue('--ytkit-native-theater-text').trim() || '',
                watchCanvas: style?.getPropertyValue('--ytkit-watch-canvas').trim() || '',
                watchText: style?.getPropertyValue('--ytkit-watch-text').trim() || '',
                rect
            };
        });
        const playerRect = rectOf(player);
        const metadataRect = rectOf(metadata);
        const splitActive = root.classList.contains('ytkit-split-active');
        const splitOpen = root.classList.contains('ytkit-split-open');
        const theater = Boolean(flexy?.hasAttribute('theater'));
        const healthOverlayCount = Array.from(document.querySelectorAll(
            '#ytkit-service-state-strip, .ytkit-service-state-pill'
        )).filter((node) => {
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden'
                && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
        }).length;
        return {
            mode: splitActive ? 'theater-split' : (theater ? 'native-theater' : 'normal'),
            theater,
            fullBleedPlayer: Boolean(
                flexy?.hasAttribute('full-bleed-player')
                || document.querySelector('#movie_player.ytp-full-bleed-player')
            ),
            splitActive,
            splitOpen,
            splitWrapper: Boolean(document.querySelector('#ytkit-split-wrapper')),
            rootClasses: root.className,
            colorScheme: getComputedStyle(root).colorScheme,
            sizeButton: Boolean(document.querySelector('button.ytp-size-button, .ytp-size-button')),
            fullscreen: Boolean(document.fullscreenElement),
            healthOverlayCount,
            staleGeometry,
            fullBleedContainers,
            playerRect,
            metadataRect,
            playerMetadataOverlap: overlapArea(playerRect, metadataRect),
            viewport: { width: innerWidth, height: innerHeight },
            scroll: {
                top: document.scrollingElement?.scrollTop || 0,
                height: document.scrollingElement?.scrollHeight || 0,
                clientHeight: document.scrollingElement?.clientHeight || innerHeight
            }
        };
    })()`);
}

function watchModeFailures(snapshot, expectedMode) {
    const failures = [];
    if (!snapshot || snapshot.mode !== expectedMode) {
        failures.push(`expected ${expectedMode}, observed ${snapshot?.mode || 'no watch mode'}`);
        return failures;
    }
    if (!snapshot.sizeButton || snapshot.fullscreen) {
        failures.push('native size control is unavailable or fullscreen is active');
    }
    if (!snapshot.playerRect || snapshot.playerRect.width < 400 || snapshot.playerRect.height < 240) {
        failures.push('player geometry is not usable');
    }
    if (snapshot.healthOverlayCount) {
        failures.push(`${snapshot.healthOverlayCount} unsolicited health overlay(s) are visible`);
    }
    if (expectedMode === 'theater-split') {
        if (!snapshot.splitActive || !snapshot.splitWrapper) failures.push('Theater Split shell is incomplete');
        if (snapshot.theater) failures.push('Theater Split unexpectedly toggled native Theater');
    } else {
        if (snapshot.splitActive || snapshot.splitOpen || snapshot.splitWrapper) {
            failures.push('stale Theater Split classes or wrapper remain');
        }
        if (snapshot.staleGeometry?.length) {
            failures.push(`stale Theater Split geometry remains: ${snapshot.staleGeometry.join(', ')}`);
        }
        if ((expectedMode === 'native-theater') !== snapshot.theater) {
            failures.push('native Theater attribute does not match the requested mode');
        }
    }
    return failures;
}

async function setNativeTheater(client, enabled, timeoutMs) {
    const action = await evaluate(client, `(() => {
        if (document.documentElement.classList.contains('ytkit-split-active')) {
            return { ok: false, reason: 'Theater Split is active' };
        }
        if (document.fullscreenElement) return { ok: false, reason: 'fullscreen is active' };
        const flexy = document.querySelector('ytd-watch-flexy');
        const button = document.querySelector('button.ytp-size-button, .ytp-size-button');
        if (!flexy || !button) return { ok: false, reason: 'native size control is missing' };
        const current = flexy.hasAttribute('theater');
        if (current !== ${enabled ? 'true' : 'false'}) button.click();
        return { ok: true, clicked: current !== ${enabled ? 'true' : 'false'} };
    })()`);
    if (!action?.ok) throw new Error(`watch themes: ${action?.reason || 'native Theater toggle failed'}`);
    await waitForExpression(
        client,
        `Boolean(document.querySelector('ytd-watch-flexy')) && document.querySelector('ytd-watch-flexy').hasAttribute('theater') === ${enabled ? 'true' : 'false'}`,
        timeoutMs,
        `${enabled ? 'native Theater' : 'normal watch'} layout`
    );
    await sleep(600);
    return captureWatchModeState(client);
}

async function captureWatchDetails(client, name) {
    const modeState = await captureWatchModeState(client);
    await evaluate(client, `(() => {
        const target = document.querySelector('#below, ytd-watch-metadata');
        if (!target) return false;
        target.scrollIntoView({ block: 'start', behavior: 'instant' });
        return true;
    })()`);
    await sleep(500);
    const details = await evaluate(client, `(async () => {
        const target = document.querySelector('#below, ytd-watch-metadata');
        if (!target) return { available: false, visible: false, background: '', color: '', colorScheme: '' };
        const rgba = (value) => {
            const parts = String(value || '').match(/[0-9.]+/g)?.map(Number) || [];
            return parts.length >= 3 ? [parts[0], parts[1], parts[2], parts[3] ?? 1] : null;
        };
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const activeFlexy = document.querySelector('ytd-watch-flexy:not([hidden])');
        const pickNode = (selector) => {
            const candidates = [...document.querySelectorAll(selector)].filter(node => {
                if (node.closest('[hidden], [aria-hidden="true"]')) return false;
                const owner = node.closest('ytd-watch-flexy');
                return !owner || !activeFlexy || owner === activeFlexy;
            });
            return candidates.find(node => {
                const style = getComputedStyle(node);
                const rect = node.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden'
                    && rect.width > 0 && rect.height > 0;
            }) || candidates[0] || null;
        };
        const effectiveBackground = (node) => {
            let current = node;
            while (current) {
                const value = getComputedStyle(current).backgroundColor;
                const parsed = rgba(value);
                if (parsed && parsed[3] > 0.98) return value;
                current = current.parentElement;
            }
            return getComputedStyle(document.body).backgroundColor;
        };
        const luminance = (channel) => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
        };
        const contrast = (foreground, background) => {
            const fg = rgba(foreground);
            const bg = rgba(background);
            if (!fg || !bg) return 0;
            const fgLum = 0.2126 * luminance(fg[0]) + 0.7152 * luminance(fg[1]) + 0.0722 * luminance(fg[2]);
            const bgLum = 0.2126 * luminance(bg[0]) + 0.7152 * luminance(bg[1]) + 0.0722 * luminance(bg[2]);
            return (Math.max(fgLum, bgLum) + 0.05) / (Math.min(fgLum, bgLum) + 0.05);
        };
        const inspect = (selector) => {
            const node = pickNode(selector);
            if (!node) return null;
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            const effectiveGround = effectiveBackground(node);
            const whiteDescendants = [...node.querySelectorAll('*')].filter((child) => getComputedStyle(child).backgroundColor === 'rgb(255, 255, 255)').length;
            return {
                selector,
                text: String(node.textContent || '').trim().slice(0, 90),
                color: style.color,
                textFill: style.webkitTextFillColor,
                background: style.backgroundColor,
                effectiveBackground: effectiveGround,
                contrast: contrast(style.color, effectiveGround),
                backgroundImage: style.backgroundImage,
                beforeBackground: getComputedStyle(node, '::before').backgroundColor,
                afterBackground: getComputedStyle(node, '::after').backgroundColor,
                whiteDescendants,
                opacity: style.opacity,
                display: style.display,
                visibility: style.visibility,
                width: rect.width,
                height: rect.height
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
        const metadataSurfaces = [
            'ytd-watch-metadata h1 yt-formatted-string, ytd-watch-metadata #title .yt-core-attributed-string, ytd-watch-metadata #title .ytAttributedStringHost, ytd-watch-metadata h1',
            'ytd-watch-metadata #owner',
            'ytd-watch-metadata #actions button, ytd-watch-metadata #owner button'
        ].map(inspect);
        const commentSelectors = [
            'ytd-comments#comments',
            'ytd-comments-header-renderer #count',
            'ytd-comments-header-renderer #sort-menu',
            'ytd-comment-view-model #author-text, ytd-comment-renderer #author-text',
            'ytd-comment-view-model #content-text, ytd-comment-renderer #content-text',
            'ytd-comment-view-model ytd-comment-engagement-bar button, ytd-comment-renderer ytd-comment-engagement-bar button'
        ];
        const commentTarget = pickNode(
            'ytd-comment-view-model #content-text, ytd-comment-renderer #content-text, ytd-comments#comments'
        );
        commentTarget?.scrollIntoView({ block: 'center', behavior: 'instant' });
        await delay(600);
        const commentSurfaces = commentSelectors.map(inspect);
        const replyThread = pickNode('ytd-comment-thread-renderer:has(ytd-comment-replies-renderer)');
        const connectorCandidates = replyThread
            ? [replyThread, ...replyThread.querySelectorAll('*')].filter((node) => {
                const style = getComputedStyle(node);
                const rect = node.getBoundingClientRect();
                const before = getComputedStyle(node, '::before');
                const after = getComputedStyle(node, '::after');
                const narrowVertical = rect.width > 0 && rect.width <= 8 && rect.height >= 18;
                const lineBorder = Number.parseFloat(style.borderLeftWidth || '0') > 0
                    || Number.parseFloat(style.borderInlineStartWidth || '0') > 0
                    || Number.parseFloat(before.borderLeftWidth || '0') > 0
                    || Number.parseFloat(after.borderLeftWidth || '0') > 0;
                return style.display !== 'none' && style.visibility !== 'hidden'
                    && Number(style.opacity || 1) > 0 && (narrowVertical || lineBorder);
            }).map((node) => {
                const style = getComputedStyle(node);
                const rect = node.getBoundingClientRect();
                const before = getComputedStyle(node, '::before');
                const after = getComputedStyle(node, '::after');
                return {
                    tag: node.tagName.toLowerCase(),
                    id: node.id || '',
                    className: String(node.className || '').slice(0, 180),
                    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                    background: style.backgroundColor,
                    borderLeft: [style.borderLeftWidth, style.borderLeftStyle, style.borderLeftColor].join(' '),
                    borderInlineStart: [style.borderInlineStartWidth, style.borderInlineStartStyle, style.borderInlineStartColor].join(' '),
                    before: [before.content, before.backgroundColor, before.borderLeftWidth, before.borderLeftStyle, before.borderLeftColor].join(' '),
                    after: [after.content, after.backgroundColor, after.borderLeftWidth, after.borderLeftStyle, after.borderLeftColor].join(' ')
                };
            }).slice(0, 30)
            : [];
        const relatedSelector = [
            '#related .ytLockupMetadataViewModelTitle',
            '#related #video-title',
            'ytd-watch-next-secondary-results-renderer .ytLockupMetadataViewModelTitle',
            'ytd-watch-next-secondary-results-renderer #video-title'
        ].join(', ');
        const liveChatSelector = 'ytd-live-chat-frame#chat:not([hidden]):not([aria-hidden="true"])';
        const supportTarget = pickNode(relatedSelector) || pickNode(liveChatSelector);
        supportTarget?.scrollIntoView({ block: 'center', behavior: 'instant' });
        await delay(600);
        const related = inspect(relatedSelector);
        const liveChat = inspect(liveChatSelector);
        const scrollingElement = document.scrollingElement;
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
            connectorCandidates,
            supportSurface: related
                ? { type: 'related', ...related }
                : (liveChat ? { type: 'live-chat', ...liveChat } : null),
            scroll: {
                top: scrollingElement?.scrollTop || 0,
                height: scrollingElement?.scrollHeight || 0,
                clientHeight: scrollingElement?.clientHeight || innerHeight
            },
            surfaces: [
                ...metadataSurfaces,
                ...commentSurfaces,
                related,
                liveChat
            ]
        };
    })()`);
    details.modeState = modeState;
    await capture(client, name);
    return details;
}

function nativeTheaterFailures(details, label, expectedColorScheme) {
    const failures = watchModeFailures(details?.modeState, 'native-theater')
        .map(failure => `${label}: ${failure}`);
    if (!details?.available || !details.visible) {
        failures.push(`${label}: metadata cannot be reached by scrolling`);
        return failures;
    }
    if (details.colorScheme !== expectedColorScheme) {
        failures.push(`${label}: color-scheme is ${details.colorScheme || 'missing'}`);
    }
    const state = details.modeState;
    const fullBleed = state.fullBleedContainers.filter(container => container.exists);
    if (fullBleed.length < 2 || !fullBleed.some(container => container.visible)) {
        failures.push(`${label}: full-bleed Theater containers are missing or collapsed`);
    }
    for (const container of fullBleed) {
        if (!container.pageToken || !container.textToken
            || !container.watchCanvas || !container.watchText) {
            failures.push(`${label}: ${container.selector} is missing watch-theme tokens`);
        }
        if (container.pageToken !== container.watchCanvas || container.textToken !== container.watchText) {
            failures.push(`${label}: ${container.selector} does not resolve the active watch-theme tokens`);
        }
    }
    const player = state.playerRect;
    const viewport = state.viewport;
    if (!player || player.left < -2 || player.right > viewport.width + 2
        || player.top < -2 || player.height > viewport.height + 2) {
        failures.push(`${label}: native Theater player exceeds the viewport`);
    }
    if (state.playerMetadataOverlap > 1) {
        failures.push(`${label}: native Theater player overlaps metadata`);
    }
    if (details.scroll.height <= details.scroll.clientHeight + 100 || details.scroll.top < 40) {
        failures.push(`${label}: page scrolling cannot reach watch details`);
    }
    const legacyConnector = details.connectorCandidates?.find(candidate =>
        String(candidate.className || '').split(/\s+/).includes('continuation'));
    if (legacyConnector) {
        failures.push(`${label}: native reply connector remains visible (${JSON.stringify(legacyConnector)})`);
    }
    const title = details.surfaces.find(surface => surface?.selector.includes('ytd-watch-metadata h1'));
    if (!title?.text || title.contrast < 4.5) failures.push(`${label}: metadata title is not readable`);
    const author = details.surfaces.find(surface => surface?.selector.includes('#author-text'));
    const content = details.surfaces.find(surface => surface?.selector.includes('#content-text'));
    if (author || content) {
        if (!author?.text || author.contrast < 4.5 || !content?.text || content.contrast < 4.5) {
            failures.push(`${label}: rendered comment text is not readable`);
        }
    } else {
        const count = details.surfaces.find(surface => surface?.selector.includes('#count'));
        const sort = details.surfaces.find(surface => surface?.selector.includes('#sort-menu'));
        if (!count?.text || count.contrast < 4.5 || !sort?.text || sort.contrast < 4.5) {
            failures.push(`${label}: empty-comments state is not readable`);
        }
    }
    const support = details.supportSurface;
    if (!support || support.width < 120 || support.height < 24) {
        failures.push(`${label}: related videos or live chat are unavailable`);
    } else if (support.type === 'related' && (!support.text || support.contrast < 4.5)) {
        failures.push(`${label}: related-video text is not readable`);
    }
    return failures;
}

const SPLIT_ENGAGEMENT_TOOLBAR_SELECTOR = '#below.ytkit-split-scroll-surface #comments ytd-comment-engagement-bar #toolbar';
const SPLIT_ENGAGEMENT_LIKE_SELECTOR = [
    `${SPLIT_ENGAGEMENT_TOOLBAR_SELECTOR} #like-button button`,
    `${SPLIT_ENGAGEMENT_TOOLBAR_SELECTOR} #like-button .yt-spec-button-shape-next`,
    `${SPLIT_ENGAGEMENT_TOOLBAR_SELECTOR} button#like-button`
].join(', ');
const SPLIT_ENGAGEMENT_REPLY_SELECTOR = [
    `${SPLIT_ENGAGEMENT_TOOLBAR_SELECTOR} #reply-button-end button`,
    `${SPLIT_ENGAGEMENT_TOOLBAR_SELECTOR} #reply-button-end .yt-spec-button-shape-next`,
    `${SPLIT_ENGAGEMENT_TOOLBAR_SELECTOR} button#reply-button-end`
].join(', ');
const SPLIT_ENGAGEMENT_HEART_SELECTOR = [
    `${SPLIT_ENGAGEMENT_TOOLBAR_SELECTOR} #creator-heart-button button`,
    `${SPLIT_ENGAGEMENT_TOOLBAR_SELECTOR} #creator-heart-button .yt-spec-button-shape-next`,
    `${SPLIT_ENGAGEMENT_TOOLBAR_SELECTOR} button#creator-heart-button`
].join(', ');

async function splitEngagementSnapshot(client) {
    return evaluate(client, `(() => {
        const visible = (node) => {
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden'
                && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
        };
        const pick = (selector) => Array.from(document.querySelectorAll(selector)).find(visible) || null;
        const directToolbarChild = (node, toolbar) => {
            let current = node;
            while (current && current.parentElement !== toolbar) current = current.parentElement;
            return current?.parentElement === toolbar ? current : null;
        };
        const describe = (node) => {
            if (!node) return null;
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            const icon = node.querySelector('yt-icon, svg, .yt-icon-shape');
            const iconRect = icon?.getBoundingClientRect();
            return {
                tag: node.tagName.toLowerCase(),
                id: node.id || node.closest('[id]')?.id || '',
                text: String(node.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80),
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                centerY: rect.top + rect.height / 2,
                width: rect.width,
                height: rect.height,
                padding: style.padding,
                borderRadius: style.borderRadius,
                borderColor: style.borderColor,
                borderStyle: style.borderStyle,
                background: style.backgroundColor,
                color: style.color,
                boxShadow: style.boxShadow,
                transform: style.transform,
                opacity: Number.parseFloat(style.opacity || '1'),
                outlineWidth: style.outlineWidth,
                outlineStyle: style.outlineStyle,
                outlineColor: style.outlineColor,
                fontSize: style.fontSize,
                fontWeight: style.fontWeight,
                cursor: style.cursor,
                ariaPressed: node.getAttribute('aria-pressed'),
                ariaDisabled: node.getAttribute('aria-disabled'),
                disabled: node.matches(':disabled'),
                focusVisible: node.matches(':focus-visible'),
                iconWidth: iconRect?.width || 0,
                iconHeight: iconRect?.height || 0
            };
        };
        const describePseudo = (node, pseudo) => {
            if (!node) return null;
            const style = getComputedStyle(node, pseudo);
            return {
                content: style.content,
                display: style.display,
                width: style.width,
                height: style.height,
                borderTopWidth: style.borderTopWidth,
                borderRightWidth: style.borderRightWidth,
                borderBottomWidth: style.borderBottomWidth,
                borderLeftWidth: style.borderLeftWidth,
                background: style.backgroundColor,
                boxShadow: style.boxShadow
            };
        };
        const toolbar = pick(${JSON.stringify(SPLIT_ENGAGEMENT_TOOLBAR_SELECTOR)});
        const comment = toolbar?.closest('ytd-comment-view-model, ytd-comment-renderer') || null;
        const count = toolbar?.querySelector('#vote-count-middle') || null;
        const like = pick(${JSON.stringify(SPLIT_ENGAGEMENT_LIKE_SELECTOR)});
        const reply = pick(${JSON.stringify(SPLIT_ENGAGEMENT_REPLY_SELECTOR)});
        const heart = pick(${JSON.stringify(SPLIT_ENGAGEMENT_HEART_SELECTOR)});
        const likeHost = directToolbarChild(like, toolbar);
        const replyHost = directToolbarChild(reply, toolbar);
        const heartHost = directToolbarChild(heart, toolbar);
        const toolbarStyle = toolbar ? getComputedStyle(toolbar) : null;
        const countStyle = count ? getComputedStyle(count) : null;
        const likeRect = like?.getBoundingClientRect();
        const countRect = count?.getBoundingClientRect();
        return {
            available: Boolean(toolbar),
            colorScheme: getComputedStyle(document.documentElement).colorScheme,
            toolbarGap: toolbarStyle?.columnGap || toolbarStyle?.gap || '',
            toolbarHeight: toolbar?.getBoundingClientRect().height || 0,
            commentBackground: comment ? getComputedStyle(comment).backgroundColor : '',
            like: describe(like),
            reply: describe(reply),
            heart: describe(heart),
            likeHost: describe(likeHost),
            replyHost: describe(replyHost),
            heartHost: describe(heartHost),
            likeCountGap: likeRect && countRect ? countRect.left - likeRect.right : null,
            likeCountCenterDelta: likeRect && countRect
                ? Math.abs((likeRect.top + likeRect.height / 2) - (countRect.top + countRect.height / 2))
                : null,
            count: count ? {
                ...describe(count),
                text: String(count.textContent || '').trim(),
                margin: countStyle.margin,
                fontVariantNumeric: countStyle.fontVariantNumeric,
                pointerEvents: countStyle.pointerEvents,
                before: describePseudo(count, '::before'),
                after: describePseudo(count, '::after')
            } : null
        };
    })()`);
}

function splitEngagementFailures(states, theme) {
    const failures = [];
    const base = states.default;
    const expectedBackground = theme === 'dark'
        ? 'rgba(151, 178, 208, 0.08)'
        : 'rgba(30, 53, 78, 0.055)';
    const expectedCommentHover = theme === 'dark' ? 'rgb(23, 42, 66)' : 'rgb(232, 237, 243)';
    if (!base?.available || !base.like || !base.reply) {
        return [`${theme}: native Like and Reply controls are unavailable`];
    }
    if (base.colorScheme !== theme) failures.push(`${theme}: color-scheme is ${base.colorScheme}`);
    if (base.toolbarGap !== '8px') failures.push(`${theme}: toolbar gap is ${base.toolbarGap || 'unset'}`);
    if (base.toolbarHeight < 31 || base.toolbarHeight > 33) {
        failures.push(`${theme}: toolbar height is ${base.toolbarHeight}px`);
    }
    for (const [name, control] of [['Like', base.like], ['Reply', base.reply]]) {
        if (control.height < 29 || control.height > 31) failures.push(`${theme} ${name}: height is ${control.height}px`);
        if (control.background !== expectedBackground) failures.push(`${theme} ${name}: surface is ${control.background}`);
        if (control.borderStyle === 'none') failures.push(`${theme} ${name}: border is missing`);
        if (control.borderColor !== 'rgba(0, 0, 0, 0)') failures.push(`${theme} ${name}: default outline is ${control.borderColor}`);
        if (control.boxShadow !== 'none') failures.push(`${theme} ${name}: default elevation is ${control.boxShadow}`);
        if (Number.parseInt(control.fontWeight, 10) < 600) failures.push(`${theme} ${name}: label weight is ${control.fontWeight}`);
    }
    const expectedLikeRadius = '6px';
    if (base.like.borderRadius !== expectedLikeRadius) failures.push(`${theme} Like: radius is ${base.like.borderRadius}`);
    if (base.reply.borderRadius !== '6px') failures.push(`${theme} Reply: radius is ${base.reply.borderRadius}`);
    if (base.like.width < 29 || base.like.width > 31) failures.push(`${theme} Like: width is ${base.like.width}px`);
    if (base.reply.width < 47 || base.reply.width > 62) failures.push(`${theme} Reply: width is ${base.reply.width}px`);
    for (const [name, host] of [['Like host', base.likeHost], ['Reply host', base.replyHost]]) {
        if (!host || host.height < 31 || host.height > 33) {
            failures.push(`${theme} ${name}: wrapper height is ${host?.height ?? 'missing'}px`);
        }
    }
    if (base.heartHost && (base.heartHost.height < 31 || base.heartHost.height > 33)) {
        failures.push(`${theme} creator heart host: wrapper height is ${base.heartHost.height}px`);
    }
    if (base.heart && (base.heart.width < 29 || base.heart.width > 31
        || base.heart.height < 29 || base.heart.height > 31
        || base.heart.background === 'rgba(0, 0, 0, 0)')) {
        failures.push(`${theme} creator heart: geometry or surface is incomplete`);
    }
    if (base.like.iconWidth && (base.like.iconWidth < 16 || base.like.iconWidth > 18)) {
        failures.push(`${theme} Like: icon width is ${base.like.iconWidth}px`);
    }
    if (base.count) {
        if (base.count.height < 29 || base.count.height > 31) failures.push(`${theme}: like count height is ${base.count.height}px`);
        if (base.count.background !== 'rgba(0, 0, 0, 0)') failures.push(`${theme}: like count surface is ${base.count.background}`);
        if (base.count.borderStyle !== 'none') failures.push(`${theme}: like count should not have a box border`);
        if (base.count.boxShadow !== 'none') failures.push(`${theme}: like count shadow is ${base.count.boxShadow}`);
        if (base.count.borderRadius !== '0px') failures.push(`${theme}: like count radius is ${base.count.borderRadius}`);
        if (base.count.fontVariantNumeric !== 'tabular-nums') failures.push(`${theme}: like count is not tabular`);
        if (base.count.pointerEvents !== 'none') failures.push(`${theme}: like count intercepts button input`);
        if (base.likeCountGap < 3 || base.likeCountGap > 5) failures.push(`${theme}: Like/count gap is ${base.likeCountGap}px`);
        if (base.likeCountCenterDelta > 1) failures.push(`${theme}: Like/count vertical delta is ${base.likeCountCenterDelta}px`);
        for (const [side, pseudo] of [['before', base.count.before], ['after', base.count.after]]) {
            if (!pseudo || pseudo.display !== 'none' || !['none', 'normal'].includes(pseudo.content)) {
                failures.push(`${theme}: like count ${side} decoration is still painted`);
            }
        }
    }
    if (base.count && (states.likeHover?.like?.background === base.like.background
        || states.likeHover?.count?.background !== 'rgba(0, 0, 0, 0)'
        || states.likeHover?.count?.color === base.count.color)) {
        failures.push(`${theme} Like: inline-count hover state is not visually cohesive`);
    }
    if (states.hover?.reply?.background === base.reply.background
        || states.hover?.reply?.transform === base.reply.transform
        || states.hover?.reply?.boxShadow === base.reply.boxShadow) {
        failures.push(`${theme} Reply: hover state is not visually distinct`);
    }
    if (states.hover?.commentBackground !== expectedCommentHover) {
        failures.push(`${theme}: comment hover surface is ${states.hover?.commentBackground || 'unset'}`);
    }
    if (!states.focus?.reply?.focusVisible || Number.parseFloat(states.focus.reply.outlineWidth || '0') < 2) {
        failures.push(`${theme} Reply: keyboard focus ring is missing`);
    }
    if (!states.pressed?.reply?.transform || states.pressed.reply.transform === base.reply.transform) {
        failures.push(`${theme} Reply: pressed state is not visually distinct`);
    }
    if (states.selected?.like?.ariaPressed !== 'true'
        || states.selected.like.background === base.like.background
        || states.selected.like.borderColor === base.like.borderColor) {
        failures.push(`${theme} Like: selected state is not visually distinct`);
    }
    if (base.count && (states.selected?.count?.background !== 'rgba(0, 0, 0, 0)'
        || states.selected?.count?.color !== states.selected?.like?.color)) {
        failures.push(`${theme} Like: selected inline count does not follow the selected text color`);
    }
    if (!states.disabled?.reply?.disabled
        || states.disabled.reply.opacity > 0.65
        || states.disabled.reply.cursor !== 'not-allowed'
        || states.disabled.reply.boxShadow !== 'none') {
        failures.push(`${theme} Reply: disabled state is incomplete`);
    }
    return failures;
}

async function captureSplitMetadataLayout(client, theme) {
    await evaluate(client, `(() => {
        const surface = document.querySelector('#below.ytkit-split-scroll-surface');
        if (!surface) return false;
        surface.scrollTop = 0;
        surface.scrollTo?.({ top: 0, left: 0, behavior: 'instant' });
        return true;
    })()`);
    await sleep(350);

    const snapshot = await evaluate(client, `(() => {
        const visible = (node) => {
            if (!node) return false;
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden'
                && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
        };
        const box = (node) => {
            if (!visible(node)) return null;
            const rect = node.getBoundingClientRect();
            return {
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                left: rect.left,
                width: rect.width,
                height: rect.height,
                centerY: rect.top + rect.height / 2
            };
        };
        const firstVisible = (selector) => Array.from(document.querySelectorAll(selector)).find(visible) || null;
        const surface = document.querySelector('#below.ytkit-split-scroll-surface');
        const metadata = firstVisible('#below.ytkit-split-scroll-surface ytd-watch-metadata');
        const title = metadata?.querySelector('#title') || null;
        const heading = title?.querySelector(':scope > h1, h1') || null;
        const utilities = title?.querySelector(':scope > .ytkit-split-title-bar') || null;
        const utilityChildren = utilities
            ? Array.from(utilities.children).filter(visible).map((node) => ({
                className: node.className || node.tagName,
                ...box(node)
            }))
            : [];
        const owner = metadata?.querySelector('#owner') || null;
        const identity = owner?.querySelector('ytd-video-owner-renderer') || null;
        const ownerActions = owner?.querySelector(':scope > .ytkit-split-owner-actions') || null;
        const subscribe = owner
            ? Array.from(owner.querySelectorAll(':scope > #subscribe-button, :scope > yt-subscribe-button-view-model, :scope > ytd-subscribe-button-renderer')).find(visible) || null
            : null;
        const commentsHeader = firstVisible('#below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer');
        const metadataBox = box(metadata);
        const titleBox = box(title);
        const headingBox = box(heading);
        const utilitiesBox = box(utilities);
        const ownerBox = box(owner);
        const identityBox = box(identity);
        const actionsBox = box(ownerActions);
        const subscribeBox = box(subscribe);
        const commentsBox = box(commentsHeader);
        const utilityCenters = utilityChildren.map((child) => child.centerY);
        const ownerActionLabels = ownerActions
            ? Array.from(ownerActions.querySelectorAll('*')).map((node) => {
                const ownText = Array.from(node.childNodes)
                    .filter(child => child.nodeType === Node.TEXT_NODE)
                    .map(child => child.textContent || '')
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                if (!ownText || ownText.length > 24 || !visible(node)) return null;
                const style = getComputedStyle(node);
                let effectiveOpacity = 1;
                for (let current = node; current && current !== ownerActions.parentElement; current = current.parentElement) {
                    effectiveOpacity *= Number.parseFloat(getComputedStyle(current).opacity || '1');
                    if (current === ownerActions) break;
                }
                return {
                    text: ownText,
                    tag: node.tagName.toLowerCase(),
                    id: node.id || '',
                    className: String(node.className || '').slice(0, 160),
                    color: style.color,
                    textFill: style.webkitTextFillColor,
                    opacity: Number.parseFloat(style.opacity || '1'),
                    effectiveOpacity
                };
            }).filter(Boolean)
            : [];
        const replies = firstVisible('#below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer');
        const replyConnectorNodes = replies
            ? [replies, ...replies.querySelectorAll('*')].filter(visible).map((node) => {
                const style = getComputedStyle(node);
                const before = getComputedStyle(node, '::before');
                const after = getComputedStyle(node, '::after');
                const carriesLine = style.borderInlineStartStyle !== 'none'
                    || style.borderLeftStyle !== 'none'
                    || before.borderLeftStyle !== 'none'
                    || before.borderTopStyle !== 'none'
                    || after.borderLeftStyle !== 'none'
                    || after.borderTopStyle !== 'none';
                if (!carriesLine) return null;
                return {
                    tag: node.tagName.toLowerCase(),
                    id: node.id || '',
                    className: String(node.className || '').slice(0, 160),
                    borderLeft: [style.borderLeftWidth, style.borderLeftStyle, style.borderLeftColor].join(' '),
                    before: [
                        before.borderLeftWidth,
                        before.borderLeftStyle,
                        before.borderLeftColor + ';',
                        before.borderTopWidth,
                        before.borderTopStyle,
                        before.borderTopColor
                    ].join(' '),
                    after: [
                        after.borderLeftWidth,
                        after.borderLeftStyle,
                        after.borderLeftColor + ';',
                        after.borderTopWidth,
                        after.borderTopStyle,
                        after.borderTopColor
                    ].join(' ')
                };
            }).filter(Boolean).slice(0, 20)
            : [];
        return {
            available: Boolean(surface && metadataBox && titleBox && headingBox && utilitiesBox && ownerBox && identityBox && commentsBox),
            colorScheme: getComputedStyle(document.documentElement).colorScheme,
            surfaceScrollTop: surface?.scrollTop ?? -1,
            surfaceWidth: surface?.getBoundingClientRect().width || 0,
            metadata: metadataBox,
            title: titleBox,
            heading: headingBox,
            utilities: utilitiesBox,
            utilityChildren,
            utilityRowDelta: utilityCenters.length
                ? Math.max(...utilityCenters) - Math.min(...utilityCenters)
                : 0,
            titleFirst: Boolean(headingBox && utilitiesBox && headingBox.top < utilitiesBox.top),
            owner: ownerBox,
            identity: identityBox,
            subscribe: subscribeBox,
            actions: actionsBox,
            ownerActionLabels,
            replyConnectorNodes,
            commentsHeader: commentsBox,
            identitySubscribeDelta: identityBox && subscribeBox
                ? Math.abs(identityBox.centerY - subscribeBox.centerY)
                : 0,
            ownerActionGap: identityBox && actionsBox ? actionsBox.top - identityBox.bottom : 0,
            metadataTail: metadataBox && ownerBox ? metadataBox.bottom - ownerBox.bottom : 0,
            commentsGap: metadataBox && commentsBox ? commentsBox.top - metadataBox.bottom : 0,
            titleOverflow: Boolean(title && title.scrollWidth > title.clientWidth + 1),
            utilityOverflow: Boolean(utilities && utilities.scrollWidth > utilities.clientWidth + 1),
            ownerOverflow: Boolean(owner && owner.scrollWidth > owner.clientWidth + 1)
        };
    })()`);

    const failures = [];
    if (!snapshot?.available) return { ...snapshot, failures: [`${theme}: compact metadata stack is unavailable`] };
    if (snapshot.colorScheme !== theme) failures.push(`${theme}: metadata color-scheme is ${snapshot.colorScheme}`);
    if (snapshot.surfaceScrollTop > 2) failures.push(`${theme}: metadata surface did not return to the top`);
    if (!snapshot.titleFirst) failures.push(`${theme}: utility controls still precede the video title`);
    if (snapshot.utilityRowDelta > 6) failures.push(`${theme}: title utilities span multiple rows (${snapshot.utilityRowDelta.toFixed(1)}px)`);
    if (snapshot.title.height > 110) failures.push(`${theme}: title card is ${snapshot.title.height.toFixed(1)}px tall`);
    if (snapshot.owner.height > 110) failures.push(`${theme}: owner card is ${snapshot.owner.height.toFixed(1)}px tall`);
    if (snapshot.metadata.height > 235) failures.push(`${theme}: metadata stack is ${snapshot.metadata.height.toFixed(1)}px tall`);
    if (snapshot.identitySubscribeDelta > 16) failures.push(`${theme}: subscribe control is not aligned with channel identity`);
    if (snapshot.actions && (snapshot.ownerActionGap < 4 || snapshot.ownerActionGap > 18)) {
        failures.push(`${theme}: channel-to-action gap is ${snapshot.ownerActionGap.toFixed(1)}px`);
    }
    if (snapshot.metadataTail > 24) failures.push(`${theme}: metadata retains ${snapshot.metadataTail.toFixed(1)}px below the owner card`);
    if (snapshot.commentsGap > 36) failures.push(`${theme}: comments begin ${snapshot.commentsGap.toFixed(1)}px below metadata`);
    const expectedOwnerActionColor = theme === 'dark' ? 'rgb(245, 247, 251)' : 'rgb(23, 35, 53)';
    const unreadableOwnerLabels = snapshot.ownerActionLabels.filter(label => /\d/.test(label.text)
        && (label.color !== expectedOwnerActionColor || label.effectiveOpacity < 0.85));
    if (unreadableOwnerLabels.length) {
        failures.push(`${theme}: owner action labels are unreadable: ${JSON.stringify(unreadableOwnerLabels)}`);
    }
    if (snapshot.titleOverflow || snapshot.utilityOverflow || snapshot.ownerOverflow) {
        failures.push(`${theme}: compact metadata stack overflows horizontally`);
    }
    await captureElement(client, `watch-theater-split-metadata-${theme}`, 'ytd-watch-metadata', 8);
    return { ...snapshot, failures };
}

async function verifySplitEngagementControls(client, theme, timeoutMs) {
    await evaluate(client, `(() => {
        const toolbar = Array.from(document.querySelectorAll(${JSON.stringify(SPLIT_ENGAGEMENT_TOOLBAR_SELECTOR)}))
            .find(node => {
                const style = getComputedStyle(node);
                const rect = node.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
            });
        toolbar?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        return Boolean(toolbar);
    })()`);
    await waitForExpression(
        client,
        `(() => {
            const toolbar = Array.from(document.querySelectorAll(${JSON.stringify(SPLIT_ENGAGEMENT_TOOLBAR_SELECTOR)}))
                .find(node => {
                    const style = getComputedStyle(node);
                    const rect = node.getBoundingClientRect();
                    return style.display !== 'none' && style.visibility !== 'hidden'
                        && rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight;
                });
            return Boolean(toolbar && toolbar.querySelector('#like-button') && toolbar.querySelector('#reply-button-end'));
        })()`,
        timeoutMs,
        `${theme} Theater Split comment engagement controls`
    );
    await sleep(200);

    const states = { default: await splitEngagementSnapshot(client) };
    await captureElement(client, `watch-theater-split-actions-${theme}-default`, SPLIT_ENGAGEMENT_TOOLBAR_SELECTOR);

    const likePoint = await evaluate(client, `(() => {
        const node = Array.from(document.querySelectorAll(${JSON.stringify(SPLIT_ENGAGEMENT_LIKE_SELECTOR)}))
            .find(candidate => candidate.getBoundingClientRect().width > 0 && candidate.getBoundingClientRect().height > 0);
        const rect = node?.getBoundingClientRect();
        return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
    })()`);
    if (!likePoint) throw new Error(`${theme} Theater Split Like control is not measurable`);
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...likePoint });
    await sleep(220);
    states.likeHover = await splitEngagementSnapshot(client);
    await captureElement(client, `watch-theater-split-actions-${theme}-like-hover`, SPLIT_ENGAGEMENT_TOOLBAR_SELECTOR);
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });

    const replyPoint = await evaluate(client, `(() => {
        const node = Array.from(document.querySelectorAll(${JSON.stringify(SPLIT_ENGAGEMENT_REPLY_SELECTOR)}))
            .find(candidate => candidate.getBoundingClientRect().width > 0 && candidate.getBoundingClientRect().height > 0);
        const rect = node?.getBoundingClientRect();
        return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
    })()`);
    if (!replyPoint) throw new Error(`${theme} Theater Split Reply control is not measurable`);

    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...replyPoint });
    await sleep(220);
    states.hover = await splitEngagementSnapshot(client);
    await captureElement(client, `watch-theater-split-actions-${theme}-hover`, SPLIT_ENGAGEMENT_TOOLBAR_SELECTOR);

    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await evaluate(client, `Array.from(document.querySelectorAll(${JSON.stringify(SPLIT_ENGAGEMENT_REPLY_SELECTOR)}))
        .find(node => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0)?.focus()`);
    await sleep(100);
    states.focus = await splitEngagementSnapshot(client);
    await captureElement(client, `watch-theater-split-actions-${theme}-focus`, SPLIT_ENGAGEMENT_TOOLBAR_SELECTOR);

    await evaluate(client, 'document.activeElement instanceof HTMLElement && document.activeElement.blur()');
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...replyPoint });
    await client.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        ...replyPoint,
        button: 'left',
        buttons: 1,
        clickCount: 1
    });
    try {
        await sleep(90);
        states.pressed = await splitEngagementSnapshot(client);
        await captureElement(client, `watch-theater-split-actions-${theme}-pressed`, SPLIT_ENGAGEMENT_TOOLBAR_SELECTOR);
    } finally {
        await client.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: 0,
            y: 0,
            button: 'left',
            buttons: 0,
            clickCount: 1
        });
        await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
        await evaluate(client, 'document.activeElement instanceof HTMLElement && document.activeElement.blur()');
    }

    const selectedOriginal = await evaluate(client, `(() => {
        const node = Array.from(document.querySelectorAll(${JSON.stringify(SPLIT_ENGAGEMENT_LIKE_SELECTOR)}))
            .find(candidate => candidate.getBoundingClientRect().width > 0 && candidate.getBoundingClientRect().height > 0);
        if (!node) return null;
        const original = node.getAttribute('aria-pressed');
        node.setAttribute('aria-pressed', 'true');
        return original;
    })()`);
    await sleep(220);
    states.selected = await splitEngagementSnapshot(client);
    await captureElement(client, `watch-theater-split-actions-${theme}-selected`, SPLIT_ENGAGEMENT_TOOLBAR_SELECTOR);
    await evaluate(client, `(() => {
        const node = Array.from(document.querySelectorAll(${JSON.stringify(SPLIT_ENGAGEMENT_LIKE_SELECTOR)}))
            .find(candidate => candidate.getBoundingClientRect().width > 0 && candidate.getBoundingClientRect().height > 0);
        if (!node) return;
        const original = ${JSON.stringify(selectedOriginal)};
        if (original === null) node.removeAttribute('aria-pressed');
        else node.setAttribute('aria-pressed', original);
    })()`);

    const disabledOriginal = await evaluate(client, `(() => {
        const node = Array.from(document.querySelectorAll(${JSON.stringify(SPLIT_ENGAGEMENT_REPLY_SELECTOR)}))
            .find(candidate => candidate.getBoundingClientRect().width > 0 && candidate.getBoundingClientRect().height > 0);
        if (!node) return null;
        const original = {
            disabled: node.hasAttribute('disabled'),
            ariaDisabled: node.getAttribute('aria-disabled')
        };
        node.setAttribute('disabled', '');
        node.setAttribute('aria-disabled', 'true');
        return original;
    })()`);
    await sleep(220);
    states.disabled = await splitEngagementSnapshot(client);
    await captureElement(client, `watch-theater-split-actions-${theme}-disabled`, SPLIT_ENGAGEMENT_TOOLBAR_SELECTOR);
    await evaluate(client, `(() => {
        const node = Array.from(document.querySelectorAll(${JSON.stringify(SPLIT_ENGAGEMENT_REPLY_SELECTOR)}))
            .find(candidate => candidate.getBoundingClientRect().width > 0 && candidate.getBoundingClientRect().height > 0);
        if (!node) return;
        const original = ${JSON.stringify(disabledOriginal)};
        if (!original?.disabled) node.removeAttribute('disabled');
        if (original?.ariaDisabled === null || original?.ariaDisabled === undefined) node.removeAttribute('aria-disabled');
        else node.setAttribute('aria-disabled', original.ariaDisabled);
    })()`);

    states.failures = splitEngagementFailures(states, theme);
    return states;
}

async function verifyWatchThemeSurfaces(client, backgroundClient, timeoutMs) {
    const failures = [];

    await setWatchTheme(client, true);
    const initialSplitMode = await captureWatchModeState(client);
    failures.push(...watchModeFailures(initialSplitMode, 'theater-split')
        .map(failure => `watch themes: initial Theater Split: ${failure}`));
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
    const splitMetadataDark = await captureSplitMetadataLayout(client, 'dark');
    failures.push(...splitMetadataDark.failures.map(failure => `watch themes: ${failure}`));
    const splitEngagementDark = await verifySplitEngagementControls(client, 'dark', timeoutMs);
    failures.push(...splitEngagementDark.failures.map(failure => `watch themes: ${failure}`));
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
        const metadataIconControls = Array.from(document.querySelectorAll(
            '#below ytd-watch-metadata #owner button, #below ytd-watch-metadata #actions button, #below ytd-watch-metadata #top-level-buttons-computed button'
        )).filter((control) => {
            const rect = control.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && control.querySelector('yt-icon, svg');
        }).slice(0, 8).map((control) => {
            const icon = control.querySelector('yt-icon, svg');
            const controlStyle = getComputedStyle(control);
            const iconStyle = icon ? getComputedStyle(icon) : null;
            return {
                color: controlStyle.color,
                iconColor: iconStyle?.color || '',
                iconFill: iconStyle?.fill || '',
                opacity: Number.parseFloat(controlStyle.opacity || '1')
            };
        });
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
            metadataIconControls,
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
    if (splitLight.authorColor
        && (!splitLight.authorColor.includes(lightTextChannel) || !splitLight.authorFill.includes(lightTextChannel))) {
        failures.push('watch themes: light Theater Split author text is not using the light ink token');
    }
    if (splitLight.contentColor
        && (!splitLight.contentColor.includes(lightTextChannel) || !splitLight.contentFill.includes(lightTextChannel))) {
        failures.push('watch themes: light Theater Split comment text is not using the light ink token');
    }
    if (!splitLight.ownerBackground.includes('243, 246, 249') || splitLight.ownerBackgroundImage !== 'none') {
        failures.push('watch themes: light Theater Split owner card retained the dark decorative surface');
    }
    if (splitLight.metadataIconControls.length < 3) {
        failures.push(`watch themes: light Theater Split exposes only ${splitLight.metadataIconControls.length} visible metadata icon controls`);
    }
    for (const [index, control] of splitLight.metadataIconControls.entries()) {
        const hasLightInk = [control.color, control.iconColor, control.iconFill]
            .some((value) => String(value).includes(lightTextChannel));
        if (control.opacity < 0.75 || !hasLightInk) {
            failures.push(`watch themes: light Theater Split metadata icon ${index + 1} is low-contrast (${JSON.stringify(control)})`);
        }
    }
    for (const [label, value] of [
        ['dark Theater Split comment', split.contentBackground],
        ['light Theater Split comment', splitLight.contentBackground]
    ]) {
        if (value && value !== 'rgba(0, 0, 0, 0)') failures.push(`watch themes: ${label} text retained a decorative background`);
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
    const splitMetadataLight = await captureSplitMetadataLayout(client, 'light');
    failures.push(...splitMetadataLight.failures.map(failure => `watch themes: ${failure}`));
    const splitEngagementLight = await verifySplitEngagementControls(client, 'light', timeoutMs);
    failures.push(...splitEngagementLight.failures.map(failure => `watch themes: ${failure}`));
    await capture(client, 'watch-theater-split-light-1440x900');

    await setTheaterSplitEnabled(client, backgroundClient, false, timeoutMs);
    await evaluate(client, 'window.scrollTo(0, 0)');
    await sleep(750);
    await revealRelatedWatchSurface(client, backgroundClient, timeoutMs);
    await verifySemanticSponsoredFallback(client, timeoutMs);
    const normalAfterSplit = await setNativeTheater(client, false, timeoutMs);
    failures.push(...watchModeFailures(normalAfterSplit, 'normal')
        .map(failure => `watch themes: Theater Split to normal: ${failure}`));

    await setWatchTheme(client, true);
    const normalDark = await pageSnapshot(client, 'watch-normal-dark');
    await capture(client, 'watch-normal-dark-1440x900');
    const normalDarkDetails = await captureWatchDetails(
        client,
        'watch-normal-dark-details-1440x900'
    );

    await evaluate(client, 'window.scrollTo(0, 0)');
    await setWatchTheme(client, false);
    const normalLight = await pageSnapshot(client, 'watch-normal-light');
    await capture(client, 'watch-normal-light-1440x900');
    const normalLightDetails = await captureWatchDetails(
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
        if (content && content.background !== 'rgba(0, 0, 0, 0)') failures.push('watch themes: normal comment text retained a decorative background');
        if (action?.background === 'rgb(255, 255, 255)'
            || action?.beforeBackground === 'rgb(255, 255, 255)'
            || action?.afterBackground === 'rgb(255, 255, 255)'
            || action?.whiteDescendants > 0) {
            failures.push('watch themes: normal comment action resolved to a white block');
        }
    }

    await evaluate(client, 'window.scrollTo(0, 0)');
    await setWatchTheme(client, true);
    const nativeDarkMode = await setNativeTheater(client, true, timeoutMs);
    failures.push(...watchModeFailures(nativeDarkMode, 'native-theater')
        .map(failure => `watch themes: native Theater dark: ${failure}`));
    await capture(client, 'watch-native-theater-dark-1440x900');
    const nativeDarkDetails = await captureWatchDetails(
        client,
        'watch-native-theater-dark-details-1440x900'
    );

    await evaluate(client, 'window.scrollTo(0, 0)');
    await setWatchTheme(client, false);
    const nativeLightMode = await captureWatchModeState(client);
    failures.push(...watchModeFailures(nativeLightMode, 'native-theater')
        .map(failure => `watch themes: native Theater light: ${failure}`));
    await capture(client, 'watch-native-theater-light-1440x900');
    const nativeLightDetails = await captureWatchDetails(
        client,
        'watch-native-theater-light-details-1440x900'
    );
    failures.push(
        ...nativeTheaterFailures(nativeDarkDetails, 'watch themes: dark native Theater', 'dark'),
        ...nativeTheaterFailures(nativeLightDetails, 'watch themes: light native Theater', 'light')
    );
    const darkFullBleed = nativeDarkMode.fullBleedContainers.find(container => container.selector === '#full-bleed-container');
    const lightFullBleed = nativeLightMode.fullBleedContainers.find(container => container.selector === '#full-bleed-container');
    if (!darkFullBleed?.pageToken || darkFullBleed.pageToken === lightFullBleed?.pageToken
        || !darkFullBleed.textToken || darkFullBleed.textToken === lightFullBleed?.textToken) {
        failures.push('watch themes: native Theater full-bleed tokens do not change between dark and light');
    }

    const transitionStates = [normalAfterSplit, nativeDarkMode];
    await evaluate(client, 'window.scrollTo(0, 0)');
    const normalAfterNative = await setNativeTheater(client, false, timeoutMs);
    transitionStates.push(normalAfterNative);
    failures.push(...watchModeFailures(normalAfterNative, 'normal')
        .map(failure => `watch themes: native Theater to normal: ${failure}`));

    await setTheaterSplitEnabled(client, backgroundClient, true, timeoutMs);
    const splitAgain = await captureWatchModeState(client);
    transitionStates.push(splitAgain);
    failures.push(...watchModeFailures(splitAgain, 'theater-split')
        .map(failure => `watch themes: normal to Theater Split: ${failure}`));

    await setTheaterSplitEnabled(client, backgroundClient, false, timeoutMs);
    const normalAfterSecondSplit = await captureWatchModeState(client);
    transitionStates.push(normalAfterSecondSplit);
    failures.push(...watchModeFailures(normalAfterSecondSplit, 'normal')
        .map(failure => `watch themes: second Theater Split cleanup: ${failure}`));

    const nativeAgain = await setNativeTheater(client, true, timeoutMs);
    transitionStates.push(nativeAgain);
    failures.push(...watchModeFailures(nativeAgain, 'native-theater')
        .map(failure => `watch themes: second native Theater entry: ${failure}`));
    const finalNormal = await setNativeTheater(client, false, timeoutMs);
    transitionStates.push(finalNormal);
    failures.push(...watchModeFailures(finalNormal, 'normal')
        .map(failure => `watch themes: final normal cleanup: ${failure}`));

    const report = {
        split,
        splitLight,
        splitMetadataDark,
        splitMetadataLight,
        splitEngagementDark,
        splitEngagementLight,
        normalDark: normalDark.snapshot,
        normalLight: normalLight.snapshot,
        normalDarkDetails,
        normalLightDetails,
        nativeDarkDetails,
        nativeLightDetails,
        transitionModes: transitionStates.map(state => ({
            mode: state.mode,
            theater: state.theater,
            splitActive: state.splitActive,
            splitOpen: state.splitOpen,
            staleGeometry: state.staleGeometry
        }))
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
    await waitForExpression(
        client,
        "Number(getComputedStyle(document.querySelector('#ytkit-pane-Video-Hider')).opacity) >= 0.99",
        timeoutMs,
        'Video Hider category transition'
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
        const visualState = [];
        for (let node = pane; node && node !== document.body; node = node.parentElement) {
            const style = getComputedStyle(node);
            visualState.push({
                tag: node.tagName,
                id: node.id || '',
                className: String(node.className || '').slice(0, 180),
                opacity: style.opacity,
                filter: style.filter,
                visibility: style.visibility,
                pointerEvents: style.pointerEvents,
                inert: node.hasAttribute('inert'),
                ariaDisabled: node.getAttribute('aria-disabled') || ''
            });
            if (node === panel) break;
        }
        const paneRect = pane?.getBoundingClientRect();
        const centerHit = paneRect
            ? document.elementFromPoint(
                paneRect.left + Math.min(Math.max(paneRect.width / 2, 1), Math.max(paneRect.width - 1, 1)),
                paneRect.top + Math.min(Math.max(paneRect.height / 2, 1), Math.max(paneRect.height - 1, 1))
            )
            : null;
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
            clippedLabels,
            visualState,
            centerHit: centerHit ? {
                tag: centerHit.tagName,
                id: centerHit.id || '',
                className: String(centerHit.className || '').slice(0, 180),
                insidePane: Boolean(pane?.contains(centerHit))
            } : null
        };
    })()`);
    const failures = [];
    if (!snapshot.panelVisible || !snapshot.paneVisible) failures.push('live settings: panel or Video Hider pane is not visible');
    if (!snapshot.missionIcon) failures.push('live settings: Video Hider mission icon is missing');
    if (snapshot.summaryCount !== 3) failures.push(`live settings: expected 3 summary cards, found ${snapshot.summaryCount}`);
    if (snapshot.summaryLabels.some((label) => !label)) failures.push('live settings: a summary card has no label');
    if (snapshot.summaryValues.some((value) => !value)) failures.push('live settings: a summary card has no value');
    if (snapshot.clippedLabels.length) failures.push(`live settings: clipped labels: ${snapshot.clippedLabels.join(', ')}`);
    const dimmed = snapshot.visualState.filter((node) => Number(node.opacity) < 0.9 || node.filter !== 'none' || node.inert);
    if (dimmed.length) failures.push(`live settings: Video Hider pane is visually disabled: ${JSON.stringify(dimmed)}`);
    if (snapshot.centerHit && !snapshot.centerHit.insidePane) {
        failures.push(`live settings: another layer covers the Video Hider pane center: ${JSON.stringify(snapshot.centerHit)}`);
    }
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
        // Pin the result to a long-lived public video with an active comment
        // surface so a newly uploaded zero-comment result cannot invalidate the
        // Theater Split interaction fixture.
        await client.send('Page.navigate', {
            url: `https://www.youtube.com/results?search_query=${LIVE_WATCH_FIXTURE_ID}`
        });
        await waitForExpression(
            client,
            `Boolean(document.querySelector('a[href*="/watch?v=${LIVE_WATCH_FIXTURE_ID}"]'))`,
            options.timeoutMs,
            'the pinned search-result watch link'
        );
        const spaStart = client.events.length;
        const clicked = await evaluate(client, `(() => {
            const link = Array.from(document.querySelectorAll('a[href*="/watch?v=${LIVE_WATCH_FIXTURE_ID}"]'))
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
        const commentSortDropdown = await verifyCommentSortDropdown(
            client,
            backgroundClient,
            options.timeoutMs
        );
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
            commentSortDropdown,
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
                    + 'home + SPA watch shells collapsed; normal, native Theater, and Theater Split stayed intact'
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

module.exports = {
    AD_SELECTORS,
    AD_URL_RE,
    adEvents,
    captureWatchModeState,
    main,
    nativeTheaterFailures,
    pageSnapshot,
    parseArgs,
    setNativeTheater,
    setTheaterSplitEnabled,
    verifySemanticSponsoredFallback,
    verifyLiveSettings,
    watchModeFailures
};
