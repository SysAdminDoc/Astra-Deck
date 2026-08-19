#!/usr/bin/env node
'use strict';

// Isolated rendered accessibility smoke for Astra Deck's primary surfaces.
// Chromium runs headlessly with a temporary profile; this script never opens
// or reuses the user's browser. It exercises real popup/side-panel documents
// plus the real injected settings, transcript, and download UI stacks.

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const WebSocket = require('ws');
const { generatePseudolocale } = require('./generate-pseudolocale.js');
const {
    buildFixture,
    DevtoolsClient,
    findBrowser,
    PANEL_SELECTOR,
    sleep,
    waitFor,
} = require('./smoke-settings-overlay.js');

const REPO_ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'build', 'headless-a11y');
const FOCUSABLE_SELECTOR = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'summary',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);
// One RTL locale, one long-word German (compounds are the classic clipper), and
// one long-phrase Brazilian Portuguese. Every primary surface renders all three
// at 320 CSS px, which is what makes the reflow claim hold for the 11 bundled
// locales rather than for the two that happened to be covered.
// The pseudo-locale lane rides in on a real bundled locale code. popup.js and
// sidepanel.js only fetch _locales/<code>/messages.json for codes on their
// BUNDLED_LOCALES allowlist — a shipped defence against a hostile override,
// and not something a test should widen. `es` is bundled, is not otherwise
// exercised by this smoke, and the stage is a throwaway copy of extension/, so
// substituting its messages there changes nothing that ships.
const PSEUDO_LOCALE = 'es';
const PSEUDO_LOCALE_LABEL = 'pseudo';
const LOCALE_STATES = Object.freeze(['ar', 'de', 'pt_BR', PSEUDO_LOCALE]);
const localeLabel = (locale) => (locale === PSEUDO_LOCALE ? PSEUDO_LOCALE_LABEL : locale);

const SURFACES = Object.freeze([
    Object.freeze({
        name: 'popup',
        page: 'popup-a11y.html',
        selector: 'body',
        ready: 'document.querySelectorAll("button, input, select, textarea").length >= 20',
        width: 420,
        height: 800,
        settleMs: 2200,
        themes: Object.freeze(['dark']),
        settingsDiff: true,
        filterGrant: true,
        localeStates: LOCALE_STATES,
        ownsDocument: true,
    }),
    Object.freeze({
        name: 'sidepanel',
        page: 'sidepanel-a11y.html',
        selector: 'body',
        ready: 'document.querySelectorAll("button, input, select, textarea, [tabindex]").length >= 4',
        width: 420,
        height: 800,
        settleMs: 1000,
        themes: Object.freeze(['dark']),
        rtlLocales: Object.freeze(['ar']),
        localeStates: LOCALE_STATES,
        ownsDocument: true,
    }),
    Object.freeze({
        name: 'sidebar',
        page: 'sidebar-a11y.html',
        selector: 'body',
        ready: 'document.querySelectorAll("button, input, select, textarea, [tabindex]").length >= 4',
        width: 420,
        height: 800,
        settleMs: 1000,
        themes: Object.freeze(['dark']),
        rtlLocales: Object.freeze(['ar']),
        localeStates: LOCALE_STATES,
        ownsDocument: true,
    }),
    Object.freeze({
        name: 'settings',
        page: 'fixture.html',
        selector: PANEL_SELECTOR,
        ready: `Boolean(document.querySelector(${JSON.stringify(PANEL_SELECTOR)}))`,
        prepare: 'globalThis.__ytkitSmoke.openPanel()',
        width: 1280,
        height: 860,
        settleMs: 500,
        themes: Object.freeze(['dark', 'light']),
        focusTrap: Object.freeze({ root: '#ytkit-settings-panel' }),
        localeStates: LOCALE_STATES,
    }),
    Object.freeze({
        name: 'transcript',
        page: 'fixture.html',
        selector: '#ytkit-transcript-panel',
        ready: 'Boolean(document.querySelector("#ytkit-transcript-panel"))',
        width: 960,
        height: 800,
        settleMs: 300,
        themes: Object.freeze(['dark', 'light']),
        localeStates: LOCALE_STATES,
    }),
    Object.freeze({
        name: 'download',
        page: 'fixture.html',
        selector: '.ytkit-dl-popup',
        ready: 'Boolean(document.querySelector(".ytkit-dl-popup"))',
        prepare: 'globalThis.__ytkitA11y.openDownload()',
        reopenEachState: true,
        width: 900,
        height: 700,
        settleMs: 300,
        themes: Object.freeze(['dark', 'light']),
        focusTrap: Object.freeze({ root: '.ytkit-dl-popup' }),
        localeStates: LOCALE_STATES,
    }),
]);

function parseArgs(argv) {
    const options = { browser: '', keepStage: false, surfaces: [], timeoutMs: 45000 };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--browser') {
            options.browser = path.resolve(argv[++index] || '');
        } else if (arg === '--keep-stage') {
            options.keepStage = true;
        } else if (arg === '--surface') {
            const surface = argv[++index] || '';
            if (!SURFACES.some((candidate) => candidate.name === surface)) {
                throw new Error(`--surface requires one of: ${SURFACES.map((candidate) => candidate.name).join(', ')}`);
            }
            if (!options.surfaces.includes(surface)) options.surfaces.push(surface);
        } else if (arg === '--timeout') {
            options.timeoutMs = Number(argv[++index]) || options.timeoutMs;
        } else {
            throw new Error(`unknown argument: ${arg}`);
        }
    }
    return options;
}

async function removeTreeWithRetry(targetPath) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
            fs.rmSync(targetPath, { recursive: true, force: true });
            return;
        } catch (error) {
            const retryable = error?.code === 'EPERM'
                || error?.code === 'EACCES'
                || error?.code === 'ENOTEMPTY';
            if (!retryable || attempt === 7) throw error;
            await sleep(250 * (attempt + 1));
        }
    }
}

function injectChromeStub(stageDir, sourceName, targetName) {
    const source = fs.readFileSync(path.join(stageDir, sourceName), 'utf8');
    const patched = source.replace(
        /(<body\b[^>]*>)/i,
        '$1\n  <script src="chrome-stub.js"></script>'
    );
    if (patched === source) throw new Error(`Could not inject chrome stub into ${sourceName}.`);
    fs.writeFileSync(path.join(stageDir, targetName), patched, 'utf8');
}

function createStage(stageDir) {
    const fixturePath = buildFixture(stageDir);
    injectChromeStub(stageDir, 'popup.html', 'popup-a11y.html');
    injectChromeStub(stageDir, 'sidepanel.html', 'sidepanel-a11y.html');
    injectChromeStub(stageDir, 'sidebar.html', 'sidebar-a11y.html');
    stagePseudoLocale(stageDir);
    return fixturePath;
}

// Worst-case string length, generated rather than hoped for: every English
// message accented and expanded by ~40%, with placeholders isolated so they
// stay recognisable. Real translations vary; this is the ceiling they vary
// towards, and it is what the 320px reflow lane needs in order to mean
// anything. Written into the stage only — never into extension/_locales.
function stagePseudoLocale(stageDir) {
    const english = JSON.parse(fs.readFileSync(
        path.join(REPO_ROOT, 'extension', '_locales', 'en', 'messages.json'), 'utf8'));
    const pseudo = generatePseudolocale(english);
    const target = path.join(stageDir, '_locales', PSEUDO_LOCALE, 'messages.json');
    if (!fs.existsSync(path.dirname(target))) {
        throw new Error(`the stage is missing _locales/${PSEUDO_LOCALE}; the pseudo lane would silently render real copy`);
    }
    fs.writeFileSync(target, `${JSON.stringify(pseudo, null, 2)}\n`, 'utf8');
    return Object.keys(pseudo).length;
}

function fileUrl(filePath) {
    return `file:///${filePath.split(path.sep).join('/')}`;
}

function httpGetJson(url, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const request = http.get(url, { timeout: timeoutMs }, (response) => {
            let body = '';
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
            });
        });
        request.on('timeout', () => request.destroy(new Error('DevTools HTTP timeout')));
        request.on('error', reject);
    });
}

async function dispatchTab(client, shift = false) {
    const modifiers = shift ? 8 : 0;
    await client.send('Input.dispatchKeyEvent', {
        // keyDown lets Chromium perform the browser's native Tab traversal;
        // the resulting focus is still evaluated through :focus-visible.
        type: 'keyDown',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
        nativeVirtualKeyCode: 9,
        modifiers,
    });
    await client.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
        nativeVirtualKeyCode: 9,
        modifiers,
    });
    // CDP key dispatch can move focus without running the same scroll step
    // that a physical Tab performs in a nested overflow container.
    await client.evaluate('document.activeElement?.scrollIntoView({ block: "center", inline: "nearest" })');
}

function collectFocusableExpression(selector) {
    return `(() => {
        const root = document.querySelector(${JSON.stringify(selector)});
        if (!root) return { error: 'surface root missing', tokens: [] };
        const focusSelector = ${JSON.stringify(FOCUSABLE_SELECTOR)};
        const isVisible = (element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            const closedDetails = element.closest('details:not([open])');
            return !element.closest('[hidden], [inert], [aria-hidden="true"]')
                && (!closedDetails || Boolean(element.closest('summary')))
                && element.tabIndex >= 0
                && style.display !== 'none'
                && style.visibility !== 'hidden'
                && (element.offsetParent !== null || style.position === 'fixed')
                && element.getClientRects().length > 0
                && rect.width > 0
                && rect.height > 0;
        };
        const nodes = Array.from(root.querySelectorAll(focusSelector)).filter(isVisible);
        nodes.forEach((node, index) => { node.dataset.astraA11yFocusId = String(index); });
        return {
            tokens: nodes.map((node) => node.dataset.astraA11yFocusId),
            labels: nodes.map((node) => node.getAttribute('aria-label') || node.textContent?.trim().slice(0, 60) || node.id || node.tagName),
            items: nodes.map((node) => {
                const rect = node.getBoundingClientRect();
                return {
                    label: node.getAttribute('aria-label') || node.textContent?.trim().slice(0, 60) || node.id || node.tagName,
                    rect: [rect.left, rect.top, rect.right, rect.bottom].map(Math.round)
                };
            }),
            candidates: Array.from(root.querySelectorAll(focusSelector)).slice(0, 8).map((node) => {
                const rect = node.getBoundingClientRect();
                const style = getComputedStyle(node);
                return {
                    label: node.getAttribute('aria-label') || node.textContent?.trim().slice(0, 60) || node.id || node.tagName,
                    rect: [rect.left, rect.top, rect.right, rect.bottom].map(Math.round),
                    display: style.display,
                    visibility: style.visibility,
                    tabIndex: node.tabIndex,
                    offset: node.offsetParent !== null
                };
            }),
            root: {
                clientWidth: root.clientWidth,
                scrollWidth: root.scrollWidth,
                clientHeight: root.clientHeight,
                scrollHeight: root.scrollHeight,
                display: getComputedStyle(root).display,
                rect: (() => { const rect = root.getBoundingClientRect(); return [rect.left, rect.top, rect.right, rect.bottom].map(Math.round); })(),
                ancestors: (() => {
                    const values = [];
                    let node = root.parentElement;
                    while (node && values.length < 6) {
                        const rect = node.getBoundingClientRect();
                        values.push({
                            tag: node.tagName,
                            id: node.id || '',
                            display: getComputedStyle(node).display,
                            rect: [rect.left, rect.top, rect.right, rect.bottom].map(Math.round)
                        });
                        node = node.parentElement;
                    }
                    return values;
                })()
            },
            document: {
                clientWidth: document.documentElement.clientWidth,
                scrollWidth: document.documentElement.scrollWidth
            },
            scrollContainers: [root, ...root.querySelectorAll('*')]
                .filter((element) => {
                    const style = getComputedStyle(element);
                    const rect = element.getBoundingClientRect();
                    return /^(auto|scroll)$/.test(style.overflowY)
                        && rect.width > 0 && rect.height > 0;
                })
                .map((element) => ({
                    selector: element.id
                        ? '#' + element.id
                        : element.classList.length
                            ? '.' + Array.from(element.classList).join('.')
                            : element.tagName.toLowerCase(),
                    clientWidth: element.clientWidth,
                    scrollWidth: element.scrollWidth,
                    overflowers: (() => {
                        const containerRect = element.getBoundingClientRect();
                        return Array.from(element.querySelectorAll('*'))
                            .map((child) => {
                                const rect = child.getBoundingClientRect();
                                return {
                                    selector: child.id
                                        ? '#' + child.id
                                        : child.classList.length
                                            ? '.' + Array.from(child.classList).join('.')
                                            : child.tagName.toLowerCase(),
                                    left: Math.round(rect.left),
                                    right: Math.round(rect.right),
                                    width: Math.round(rect.width),
                                    excess: Math.round(Math.max(
                                        0,
                                        containerRect.left - rect.left,
                                        rect.right - containerRect.right
                                    ))
                                };
                            })
                            .filter((entry) => entry.width > 0 && entry.excess > 1)
                            .sort((left, right) => right.excess - left.excess)
                            .slice(0, 5);
                    })()
                }))
        };
    })()`;
}

function focusStateExpression(selector) {
    return `(() => {
        const root = document.querySelector(${JSON.stringify(selector)});
        const active = document.activeElement;
        if (!root || !active || !root.contains(active)) return { inside: false };
        const rect = active.getBoundingClientRect();
        const left = Math.max(0, rect.left);
        const right = Math.min(window.innerWidth, rect.right);
        const top = Math.max(0, rect.top);
        const bottom = Math.min(window.innerHeight, rect.bottom);
        const points = right > left && bottom > top ? [
            [(left + right) / 2, (top + bottom) / 2],
            [left + 1, top + 1],
            [right - 1, top + 1],
            [left + 1, bottom - 1],
            [right - 1, bottom - 1]
        ] : [];
        const unobscured = points.some(([x, y]) => {
            const hit = document.elementFromPoint(x, y);
            return hit && (hit === active || active.contains(hit) || hit.contains(active));
        });
        const style = getComputedStyle(active);
        const outlineVisible = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
        const shadowVisible = style.boxShadow && style.boxShadow !== 'none';
        return {
            inside: true,
            token: active.dataset.astraA11yFocusId || '',
            label: active.getAttribute('aria-label') || active.textContent?.trim().slice(0, 60) || active.id || active.tagName,
            activeId: active.id || '',
            activeClass: active.className || '',
            focusVisible: active.matches(':focus-visible'),
            indicatorVisible: Boolean(outlineVisible || shadowVisible),
            outlineStyle: style.outline,
            boxShadow: style.boxShadow,
            focusRing: getComputedStyle(document.documentElement).getPropertyValue('--ytkit-focus-ring').trim(),
            unobscured,
            rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
        };
    })()`;
}

async function auditKeyboardPath(client, surface, stateName) {
    // Stamp the client so a CDP timeout anywhere in this sweep names the
    // surface and state it died in. This is the heaviest lane by far — the
    // settings surface runs about 850 calls here — and a bare
    // "devtools call timed out: Runtime.evaluate" gave no way to tell which of
    // six surfaces and eight states was in flight.
    client.context = `${surface.name}/${stateName} keyboard sweep`;
    const inventory = await client.evaluate(collectFocusableExpression(surface.selector));
    if (inventory.error) throw new Error(`${surface.name}/${stateName}: ${inventory.error}`);
    if (!inventory.tokens.length) {
        throw new Error(
            `${surface.name}/${stateName}: no visible keyboard controls found; `
            + JSON.stringify({ root: inventory.root, candidates: inventory.candidates })
        );
    }
    if (inventory.root.scrollWidth > inventory.root.clientWidth + 1) {
        throw new Error(
            `${surface.name}/${stateName}: root horizontal overflow `
            + `${inventory.root.scrollWidth} > ${inventory.root.clientWidth}.`
        );
    }
    if (inventory.document.scrollWidth > inventory.document.clientWidth + 1) {
        throw new Error(
            `${surface.name}/${stateName}: document horizontal overflow `
            + `${inventory.document.scrollWidth} > ${inventory.document.clientWidth}.`
        );
    }
    const overflowingScroller = inventory.scrollContainers.find(
        (entry) => entry.scrollWidth > entry.clientWidth + 1
    );
    if (overflowingScroller) {
        throw new Error(
            `${surface.name}/${stateName}: nested horizontal overflow in ${overflowingScroller.selector} `
            + `${overflowingScroller.scrollWidth} > ${overflowingScroller.clientWidth}; `
            + `overflowers=${JSON.stringify(overflowingScroller.overflowers)}.`
        );
    }

    // Establish keyboard modality before focusing the first surface control so
    // :focus-visible is evaluated exactly as it is for a Tab user.
    await dispatchTab(client);
    await client.evaluate(`(() => {
        const root = document.querySelector(${JSON.stringify(surface.selector)});
        root?.querySelector('[data-astra-a11y-focus-id="0"]')?.focus();
    })()`);

    const visited = new Set();
    const visitedLabels = [];
    const failures = [];
    for (let index = 0; index < inventory.tokens.length + 3; index += 1) {
        const state = await client.evaluate(focusStateExpression(surface.selector));
        if (!state.inside) {
            if (visited.size === inventory.tokens.length) break;
            failures.push(`focus left surface after ${visited.size}/${inventory.tokens.length} controls`);
            break;
        }
        if (state.token) {
            if (!visited.has(state.token)) visitedLabels.push(state.label);
            visited.add(state.token);
        }
        if (!state.focusVisible || !state.indicatorVisible) {
            failures.push(
                `no visible keyboard focus indicator on ${state.label} `
                + `(focus-visible=${state.focusVisible}, computed-indicator=${state.indicatorVisible}, `
                + `outline=${state.outlineStyle}, box-shadow=${state.boxShadow}, focus-ring=${state.focusRing}, `
                + `active=${state.activeId}.${state.activeClass})`
            );
        }
        if (!state.unobscured) {
            const rect = state.rect || {};
            failures.push(
                `focused control is fully obscured or offscreen: ${state.label} `
                + `(${Math.round(rect.left || 0)},${Math.round(rect.top || 0)}..`
                + `${Math.round(rect.right || 0)},${Math.round(rect.bottom || 0)}; `
                + `active=${state.activeId}.${state.activeClass})`
            );
        }
        if (visited.size === inventory.tokens.length) break;
        await dispatchTab(client);
    }

    const missing = inventory.tokens.filter((token) => !visited.has(token));
    if (missing.length) {
        const labels = missing.slice(0, 8).map((token) => inventory.labels[Number(token)]);
        const geometry = missing.slice(0, 8).map((token) => inventory.items[Number(token)]?.rect);
        failures.push(
            `keyboard path skipped ${missing.length} control(s): ${labels.join(', ')} `
            + `(rects: ${JSON.stringify(geometry)}; root: ${JSON.stringify(inventory.root.rect)}; `
            + `(visited: ${visitedLabels.join(' -> ')})`
        );
    }
    if (failures.length) {
        throw new Error(`${surface.name}/${stateName}: ${failures.join('; ')}`);
    }
    return visited.size;
}

function focusedTokenExpression(selector) {
    return `(() => {
        const root = document.querySelector(${JSON.stringify(selector)});
        const active = document.activeElement;
        return {
            inside: Boolean(root && active && root.contains(active)),
            token: active?.dataset?.astraA11yFocusId || '',
            label: active?.getAttribute?.('aria-label') || active?.textContent?.trim().slice(0, 60) || active?.id || active?.tagName || '',
        };
    })()`;
}

async function auditFocusTrap(client, surface, stateName) {
    client.context = `${surface.name}/${stateName} focus trap`;
    const trap = surface.focusTrap;
    if (!trap) return 0;
    const inventory = await client.evaluate(collectFocusableExpression(trap.root));
    if (inventory.error) throw new Error(`${surface.name}/${stateName}: ${inventory.error}`);
    if (inventory.tokens.length < 2) {
        throw new Error(`${surface.name}/${stateName}: focus trap needs at least two visible controls`);
    }

    const focusToken = async (token) => {
        await client.evaluate(`(() => {
            const root = document.querySelector(${JSON.stringify(trap.root)});
            root?.querySelector('[data-astra-a11y-focus-id="${token}"]')?.focus();
        })()`);
    };
    const readFocus = () => client.evaluate(focusedTokenExpression(trap.root));
    const failures = [];
    const first = inventory.tokens[0];
    const second = inventory.tokens[1];
    const last = inventory.tokens[inventory.tokens.length - 1];

    // A real Tab from the first control must follow the rendered DOM order.
    await focusToken(first);
    await dispatchTab(client);
    const forwardOrder = await readFocus();
    if (!forwardOrder.inside || forwardOrder.token !== second) {
        failures.push(
            `Tab order left ${trap.root} or skipped the second control `
            + `(expected=${second}:${inventory.labels[Number(second)]}, `
            + `actual=${forwardOrder.token || 'none'}:${forwardOrder.label || 'no active control'})`
        );
    }

    // The final and first controls are the two wrap points that distinguish a
    // real modal focus trap from a source-only aria-modal declaration.
    await focusToken(last);
    await dispatchTab(client);
    const forwardWrap = await readFocus();
    if (!forwardWrap.inside || forwardWrap.token !== first) {
        failures.push(`Tab from the final control did not wrap to ${first}`);
    }

    await focusToken(first);
    await dispatchTab(client, true);
    const backwardWrap = await readFocus();
    if (!backwardWrap.inside || backwardWrap.token !== last) {
        failures.push(`Shift+Tab from the first control did not wrap to ${last}`);
    }

    if (failures.length) throw new Error(`${surface.name}/${stateName}: ${failures.join('; ')}`);
    return 3;
}

// WCAG 2.2 SC 1.4.10 Reflow: content must not require two-dimensional scrolling
// at a viewport equivalent to 320 CSS pixels wide. The zoom-200 lane approximates
// that for wide surfaces but not for narrow ones (the popup halves to ~200 CSS px
// while the side panel halves to 210), so neither proves the 320 px contract on
// its own. This lane pins it exactly, for every surface, at 1x.
const REFLOW_CSS_WIDTH = 320;

// v4.68.0 — the feature-health panel only renders when a live YouTube tab
// answers, so in this harness (tabs.query returns []) it would stay hidden
// and never be proven at any width, in any locale, in forced colors. Drive
// the REAL renderer with a synthetic report instead of stubbing the panel:
// popup.js is a classic script, so its top-level declarations are reachable
// on the global object. The fixture deliberately includes the worst content
// the panel can show — a long localised feature name next to a long selector
// surface — because that is what spills at 320 CSS px.
const FEATURE_HEALTH_FIXTURE = JSON.stringify({
    generatedAt: 0,
    total: 3,
    worstStatus: 'failed',
    counts: { failed: 1, degraded: 1, healthy: 1, idle: 0 },
    features: [
        {
            id: 'subscriptionGroups',
            name: 'Subscription Groups',
            status: 'failed',
            reasons: [{ kind: 'runtime', detail: 'Cannot read properties of null (reading "querySelector")', at: 1 }]
        },
        {
            id: 'videoHider',
            name: 'Video Hider',
            status: 'degraded',
            reasons: [{ kind: 'selector', surface: 'feedCard', detail: 'ytd-rich-item-renderer', at: 1 }]
        },
        { id: 'sponsorBlock', name: 'SponsorBlock', status: 'healthy', reasons: [] }
    ]
});

async function renderFeatureHealthFixture(client, surface) {
    if (surface.name !== 'popup') return;
    const rendered = await client.evaluate(`(() => {
        const section = document.getElementById('feature-health');
        const line = document.getElementById('feature-health-line');
        if (!section || typeof globalThis.renderFeatureHealthRows !== 'function') return 'missing';
        const report = ${FEATURE_HEALTH_FIXTURE};
        globalThis.renderFeatureHealthRows(report);
        if (line) {
            const format = globalThis.YTKitCore?.formatFeatureHealthLine;
            line.textContent = typeof format === 'function' ? format(report) : '';
            line.dataset.status = report.worstStatus;
        }
        section.hidden = false;
        section.open = true;
        return String(document.querySelectorAll('#feature-health-list .feature-health-row').length);
    })()`);
    if (rendered === 'missing') {
        throw new Error(`${surface.name}: popup no longer exposes the feature-health renderer`);
    }
    if (rendered !== '3') {
        throw new Error(`${surface.name}: feature-health fixture rendered ${rendered} rows, expected 3`);
    }
}

// Status must never be communicated by colour alone, and the reason line has
// to survive the narrowest supported viewport — this panel exists to be read
// during a breakage, which is the worst possible time for it to be unusable.
async function auditFeatureHealthPanel(client, surface, stateName) {
    if (surface.name !== 'popup') return 0;
    client.context = `${surface.name}/${stateName} feature health`;
    const result = await client.evaluate(`(() => {
        const rows = Array.from(document.querySelectorAll('#feature-health-list .feature-health-row'));
        const failures = [];
        const section = document.getElementById('feature-health');
        const width = document.documentElement.clientWidth;
        if (!section || section.hidden || !section.getClientRects().length) {
            failures.push('feature-health panel is not visibly rendered');
        }
        for (const row of rows) {
            const badge = row.querySelector('.fh-status');
            const label = badge?.textContent?.trim() || '';
            if (!label) failures.push(row.dataset.status + ' row states its status with colour alone');
            for (const element of [row, badge, row.querySelector('.fh-reason')]) {
                if (!element) continue;
                const rect = element.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) continue;
                if (rect.right > width + 1 || rect.left < -1) {
                    failures.push((element.className || 'row') + ' spills to ' + Math.round(rect.right) + ' of ' + width);
                }
            }
        }
        return { failures, rows: rows.length };
    })()`);
    if (result.failures.length) {
        throw new Error(`${surface.name}/${stateName}: ${result.failures.join('; ')}`);
    }
    return result.rows;
}

async function configureRenderedState(client, surface, theme, mode) {
    // Emulation.setDeviceMetricsOverride timed out here more often than
    // anything else, and named neither the surface nor the state.
    client.context = `${surface.name}/${theme}/${mode} state setup`;
    const zoomed = mode === 'zoom-200';
    const reflow = mode === 'reflow-320';
    const width = reflow ? REFLOW_CSS_WIDTH : (zoomed ? Math.max(200, Math.floor(surface.width / 2)) : surface.width);
    const height = reflow ? Math.min(surface.height, 640) : (zoomed ? Math.max(320, Math.floor(surface.height / 2)) : surface.height);
    await client.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: zoomed ? 2 : 1,
        mobile: false,
    });
    await client.send('Emulation.setEmulatedMedia', {
        media: 'screen',
        features: [
            { name: 'forced-colors', value: mode === 'forced-colors' ? 'active' : 'none' },
            { name: 'prefers-color-scheme', value: theme },
            { name: 'prefers-reduced-motion', value: 'reduce' },
        ],
    });
    await client.evaluate(`(() => {
        document.documentElement.toggleAttribute('dark', ${theme === 'dark'});
        document.documentElement.style.colorScheme = ${JSON.stringify(theme)};
        return true;
    })()`);
    await sleep(120);
    if (mode === 'forced-colors') {
        const active = await client.evaluate("matchMedia('(forced-colors: active)').matches");
        if (!active) throw new Error(`${surface.name}: Chromium did not activate forced-colors emulation.`);
    }
    // Re-render after every state change: a navigation clears the panel, and
    // the reflow lane needs it present before it opens the disclosures and
    // measures.
    await renderFeatureHealthFixture(client, surface);
    return { width, height };
}

async function navigateToSurface(client, stageDir, surface, timeoutMs, theme = 'dark', locale = '') {
    const url = new URL(fileUrl(path.join(stageDir, surface.page)));
    url.searchParams.set('theme', theme);
    if (locale) url.searchParams.set('locale', locale);
    if (surface.settingsDiff) url.searchParams.set('settingsDiff', '1');
    if (surface.filterGrant) url.searchParams.set('filterGrant', '1');
    await client.send('Page.navigate', { url: url.href });
    await waitFor(
        () => client.evaluate("document.readyState === 'complete'"),
        timeoutMs,
        `${surface.name} document load`
    );
    if (surface.page === 'fixture.html') {
        await waitFor(
            () => client.evaluate('Boolean(globalThis.__ytkitSmoke?.listenerCount() > 0 && globalThis.__ytkitA11y)'),
            timeoutMs,
            `${surface.name} content-script fixture boot`
        );
    }
    if (surface.prepare) await client.evaluate(surface.prepare);
    await waitFor(
        () => client.evaluate(surface.ready),
        timeoutMs,
        `${surface.name} rendered surface`
    );
    await sleep(surface.settleMs || 300);
}

// Surface-agnostic. auditRtlLayout below is sidepanel-specific (it reaches for
// .sp-search and friends), so it could never cover popup/settings/transcript/
// download — which is why locale rendering was only ever proven on two surfaces.
// This checks the contract every surface owes in every locale: no horizontal
// scrolling of the document, correct lang/dir, and nothing laid out wider than
// the viewport it has to fit in.
async function auditLocaleReflow(client, surface, locale, stateName) {
    const result = await client.evaluate(`(() => {
        const root = document.documentElement;
        const overflowBy = Math.max(
            root.scrollWidth - root.clientWidth,
            document.body ? document.body.scrollWidth - root.clientWidth : 0
        );
        const viewport = root.clientWidth;
        // Report the worst offenders so a failure names the element to fix
        // rather than only the surface.
        const wide = [];
        for (const element of document.querySelectorAll('button, input, select, textarea, a[href], h1, h2, label, .sp-setting-row, .toggle')) {
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;
            // Fully off-screen elements are the visually-hidden idiom (skip
            // links park at inset-inline-start: -9999px until focused) and are
            // not clipped controls. Content that genuinely forces horizontal
            // scrolling is caught by the document scrollWidth check above; this
            // per-element pass is specifically for controls that ARE on screen
            // and get cut off at the edge.
            if (rect.right <= 0 || rect.left >= viewport) continue;
            const spill = Math.round(Math.max(rect.right - viewport, -rect.left));
            if (spill > 1) {
                wide.push((element.id || element.className || element.tagName) + ' +' + spill + 'px');
                if (wide.length >= 5) break;
            }
        }
        return {
            overflowBy,
            viewport,
            lang: root.lang || '',
            dir: root.dir || getComputedStyle(root).direction || '',
            wide
        };
    })()`);

    const failures = [];
    // 1 px of rounding slack; anything more is a real horizontal scrollbar.
    if (result.overflowBy > 1) {
        failures.push(`document scrolls horizontally by ${result.overflowBy}px at ${result.viewport}px wide`);
    }
    if (result.wide.length) {
        failures.push(`controls spill outside the viewport: ${result.wide.join(', ')}`);
    }
    // lang/dir belong to whoever owns the document. The in-page surfaces
    // (settings, transcript, download) are injected into YouTube's document and
    // inherit ITS direction — smoke-settings-overlay.js covers their RTL
    // mirroring by setting documentElement dir explicitly. Only assert here on
    // the surfaces Astra Deck actually owns.
    if (surface.ownsDocument && locale) {
        if (!result.lang) failures.push('documentElement carries no lang attribute');
        const expectedDir = RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
        if (result.dir !== expectedDir) {
            failures.push(`documentElement dir is "${result.dir}", expected "${expectedDir}" for ${locale}`);
        }
    }
    if (failures.length) {
        throw new Error(`${surface.name}/${stateName}: ${failures.join('; ')}`);
    }
    return 1;
}

async function auditRtlLayout(client, surface, locale) {
    const result = await client.evaluate(`(() => {
        const search = document.querySelector('.sp-search');
        const icon = document.querySelector('.sp-search-icon');
        const clear = document.querySelector('.sp-search-clear');
        const row = document.querySelector('.sp-setting-row');
        const toggle = row?.querySelector('.sp-setting-switch');
        const rect = (element) => {
            const value = element?.getBoundingClientRect();
            return value ? { left: value.left, right: value.right, width: value.width } : null;
        };
        if (!search || !icon || !clear || !row || !toggle) {
            return { error: 'RTL fixture controls missing' };
        }
        const searchRect = rect(search);
        const iconRect = rect(icon);
        const clearRect = rect(clear);
        const wasChecked = row.getAttribute('aria-checked');
        row.setAttribute('aria-checked', 'true');
        const transform = getComputedStyle(toggle, '::after').transform;
        if (wasChecked == null) row.removeAttribute('aria-checked');
        else row.setAttribute('aria-checked', wasChecked);
        const matrix = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform) : null;
        return {
            dir: document.documentElement.dir,
            lang: document.documentElement.lang,
            iconAtInlineStart: (searchRect.right - iconRect.right) < (iconRect.left - searchRect.left),
            clearAtInlineEnd: (clearRect.left - searchRect.left) < (searchRect.right - clearRect.right),
            searchControlsSeparated: iconRect.left >= clearRect.right,
            checkedTravel: matrix ? matrix.m41 : 0,
        };
    })()`);
    if (result.error) throw new Error(`${surface.name}/${locale}/zoom-200: ${result.error}`);
    const failures = [];
    if (result.dir !== 'rtl') failures.push(`document dir is ${result.dir || '(empty)'}`);
    if (!String(result.lang || '').toLowerCase().startsWith(locale.toLowerCase())) {
        failures.push(`document lang is ${result.lang || '(empty)'}`);
    }
    if (!result.iconAtInlineStart) failures.push('search icon is not at RTL inline-start');
    if (!result.clearAtInlineEnd) failures.push('search clear is not at RTL inline-end');
    if (!result.searchControlsSeparated) failures.push('search icon and clear overlap');
    if (!(result.checkedTravel < 0)) failures.push(`checked switch travel is ${result.checkedTravel}, expected negative`);
    if (failures.length) throw new Error(`${surface.name}/${locale}/zoom-200: ${failures.join('; ')}`);
}

async function captureSurface(client, surface, theme) {
    await client.evaluate(`(() => {
        const root = document.querySelector(${JSON.stringify(surface.selector)});
        if (root) root.scrollTop = 0;
        document.scrollingElement.scrollTop = 0;
    })()`);
    const image = await client.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
    });
    const output = path.join(OUT_DIR, `${surface.name}-${theme}.png`);
    fs.writeFileSync(output, Buffer.from(image.data, 'base64'));
}

async function auditPopupSettingsDiff(client, surface, stateName) {
    if (surface.name !== 'popup') return 0;
    const result = await client.evaluate(`(async () => {
        const overview = document.getElementById('schema-overview');
        const count = document.getElementById('schema-overview-diff-count');
        const toggle = document.getElementById('schema-overview-diff-toggle');
        const copy = document.getElementById('schema-overview-diff-copy');
        const diff = document.getElementById('schema-overview-diff');
        const allSettings = document.getElementById('schema-overview-list');
        const rows = document.getElementById('schema-overview-diff-list');
        if (!overview || !count || !toggle || !copy || !diff || !allSettings || !rows) {
            return { error: 'changed-settings controls are missing' };
        }
        overview.open = true;
        let copied = '';
        try {
            Object.defineProperty(navigator, 'clipboard', {
                configurable: true,
                value: { writeText: async (value) => { copied = String(value); } }
            });
        } catch (error) {
            return { error: 'clipboard interception failed: ' + error.message };
        }
        toggle.click();
        copy.click();
        for (let attempt = 0; attempt < 50 && !copied; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
        let payload = null;
        try { payload = JSON.parse(copied); } catch (_) { /* reported below */ }
        const rowKeys = Array.from(rows.children).map((row) => row.querySelector('strong')?.title || '');
        return {
            overviewOpen: overview.open,
            count: count.textContent || '',
            pressed: toggle.getAttribute('aria-pressed'),
            diffHidden: diff.hidden,
            diffVisible: getComputedStyle(diff).display !== 'none' && diff.getClientRects().length > 0,
            allSettingsHidden: allSettings.hidden,
            allSettingsVisible: getComputedStyle(allSettings).display !== 'none' && allSettings.getClientRects().length > 0,
            rowCount: rows.children.length,
            rowKeys,
            rowText: rows.textContent || '',
            copied,
            payload,
        };
    })()`);
    if (result.error) throw new Error(`${surface.name}/${stateName}: ${result.error}`);
    const expectedKeys = [
        'customCssCode',
        'githubFullProfile',
        'hideVideosFilterListUrl',
        'privacyDataFlowPanel',
        'transcriptViewer'
    ];
    const failures = [];
    if (!result.overviewOpen) failures.push('settings overview did not open');
    if (!/\b5\b/.test(result.count)) failures.push(`changed count is ${JSON.stringify(result.count)}, expected 5`);
    if (result.pressed !== 'true') failures.push('changed-only toggle is not pressed');
    if (result.diffHidden) failures.push('changed-settings list stayed hidden');
    if (!result.diffVisible) failures.push('changed-settings list is not visibly rendered');
    if (!result.allSettingsHidden) failures.push('all-settings list stayed visible');
    if (result.allSettingsVisible) failures.push('all-settings list is still visibly rendered');
    if (result.rowCount !== expectedKeys.length) failures.push(`rendered ${result.rowCount} changed rows, expected 5`);
    if (JSON.stringify([...result.rowKeys].sort()) !== JSON.stringify(expectedKeys)) {
        failures.push(`changed row keys are ${JSON.stringify(result.rowKeys)}`);
    }
    if (result.rowText.includes('astra-settings-diff-smoke-secret')) failures.push('rendered row leaked custom CSS');
    if (!result.payload?.astraDeckSettingsDiff) failures.push('copied payload marker is missing');
    if (result.copied.includes('astra-settings-diff-smoke-secret')) failures.push('copied payload leaked custom CSS');
    const copiedChanges = Array.isArray(result.payload?.changed) ? result.payload.changed : [];
    if (copiedChanges.length !== expectedKeys.length) failures.push(`copied ${copiedChanges.length} changes, expected 5`);
    const customCss = copiedChanges.find((change) => change.key === 'customCssCode');
    if (!/^\[redacted/.test(customCss?.current || '')) failures.push('copied custom CSS is not redacted');
    if (failures.length) throw new Error(`${surface.name}/${stateName}: ${failures.join('; ')}`);

    await client.evaluate(`document.getElementById('schema-overview')?.scrollIntoView({ block: 'start' })`);
    await sleep(120);
    const image = await client.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
    });
    fs.writeFileSync(path.join(OUT_DIR, 'popup-settings-diff.png'), Buffer.from(image.data, 'base64'));
    return 1;
}

async function auditPopupFiniteSelect(client, surface, stateName) {
    if (surface.name !== 'popup') return 0;
    const staged = await client.evaluate(`(async () => {
        const overview = document.getElementById('schema-overview');
        const diffToggle = document.getElementById('schema-overview-diff-toggle');
        if (!overview || !diffToggle) return { error: 'settings overview controls are missing' };
        overview.open = true;
        if (diffToggle.getAttribute('aria-pressed') === 'true') diffToggle.click();
        await new Promise((resolve) => setTimeout(resolve, 20));
        const category = document.querySelector('.so-row-head[data-category="quality-codec"]');
        if (!category) return { error: 'quality-codec category is missing' };
        if (category.getAttribute('aria-expanded') !== 'true') category.click();
        await new Promise((resolve) => setTimeout(resolve, 20));
        const select = document.querySelector('select.so-key-select[data-key="codecSelector"]');
        if (!select) return { error: 'codecSelector did not render as a select' };
        const options = Array.from(select.options).map((option) => option.value);
        select.value = 'h264';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return { options, tagName: select.tagName, type: typeof select.value };
    })()`);
    if (staged.error) throw new Error(`${surface.name}/${stateName}: ${staged.error}`);
    const failures = [];
    if (staged.tagName !== 'SELECT') failures.push(`enum control is ${staged.tagName || 'missing'}`);
    if (staged.type !== 'string') failures.push(`enum DOM value type is ${staged.type}`);
    for (const value of ['auto', 'efficient', 'h264', 'vp9', 'av1']) {
        if (!staged.options.includes(value)) failures.push(`enum option ${value} is missing`);
    }
    if (failures.length) throw new Error(`${surface.name}/${stateName}: ${failures.join('; ')}`);

    await waitFor(
        () => client.evaluate(`globalThis.__ytkitSmoke?.readSettings?.().codecSelector === 'h264'`),
        5000,
        `${surface.name}/${stateName} finite-select persistence`
    );
    await client.evaluate(`document.querySelector('.so-key-row[data-key="codecSelector"]')?.scrollIntoView({ block: 'center' })`);
    await sleep(120);
    const rendered = await client.evaluate(`(() => {
        const select = document.querySelector('select.so-key-select[data-key="codecSelector"]');
        return {
            value: select?.value || '',
            focused: document.activeElement === select,
            stored: globalThis.__ytkitSmoke?.readSettings?.().codecSelector
        };
    })()`);
    if (rendered.value !== 'h264') failures.push(`rendered enum value is ${JSON.stringify(rendered.value)}`);
    if (rendered.stored !== 'h264') failures.push(`stored enum value is ${JSON.stringify(rendered.stored)}`);
    if (!rendered.focused) failures.push('rebuilt enum control did not regain focus');
    if (failures.length) throw new Error(`${surface.name}/${stateName}: ${failures.join('; ')}`);

    const image = await client.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
    });
    fs.writeFileSync(path.join(OUT_DIR, 'popup-settings-select.png'), Buffer.from(image.data, 'base64'));
    return 8;
}

async function auditPopupFilterGrant(client, surface, stateName) {
    if (surface.name !== 'popup') return 0;
    await waitFor(
        () => client.evaluate(`Boolean(document.querySelector(
            '#data-flow-grants:not([hidden]) .data-flow-grant-remove'
        ))`),
        5000,
        `${surface.name}/${stateName} granted host row`
    );
    const before = await client.evaluate(`(() => {
        const section = document.getElementById('data-flow-grants');
        const row = section?.querySelector('.data-flow-grant-row');
        const remove = row?.querySelector('.data-flow-grant-remove');
        const preferences = document.getElementById('filter-list-preferences');
        const refreshMode = document.getElementById('filter-list-refresh-mode');
        const staleEnabled = document.getElementById('filter-list-stale-enabled');
        return {
            sectionVisible: Boolean(section && !section.hidden && section.getClientRects().length),
            host: row?.querySelector('.data-flow-grant-host')?.textContent?.trim() || '',
            originPattern: row?.dataset?.originPattern || '',
            removeLabel: remove?.getAttribute('aria-label') || '',
            preferencesVisible: Boolean(preferences && !preferences.hidden && preferences.getClientRects().length),
            refreshMode: refreshMode?.value || '',
            staleEnabled: staleEnabled?.checked,
            permissions: globalThis.__ytkitSmoke?.permissionOrigins?.() || []
        };
    })()`);
    const failures = [];
    if (!before.sectionVisible) failures.push('granted-host section is not visibly rendered');
    if (before.host !== 'lists.example.com') failures.push(`grant host is ${JSON.stringify(before.host)}`);
    if (before.originPattern !== 'https://lists.example.com/*') {
        failures.push(`grant pattern is ${JSON.stringify(before.originPattern)}`);
    }
    if (!before.removeLabel.includes('lists.example.com')) failures.push('remove control does not name the host');
    if (!before.preferencesVisible) failures.push('filter-list preferences are not visibly rendered');
    if (before.refreshMode !== 'daily') failures.push(`default refresh mode is ${JSON.stringify(before.refreshMode)}`);
    if (before.staleEnabled !== true) failures.push('last-known-good rules are not enabled by default');
    if (!before.permissions.includes('https://lists.example.com/*')) failures.push('fixture grant is missing');
    if (failures.length) throw new Error(`${surface.name}/${stateName}: ${failures.join('; ')}`);

    await client.evaluate(`document.getElementById('data-flow-grants')?.scrollIntoView({ block: 'center' })`);
    await sleep(120);
    const image = await client.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
    });
    fs.writeFileSync(path.join(OUT_DIR, 'popup-filter-list-grants.png'), Buffer.from(image.data, 'base64'));

    await client.evaluate(`document.querySelector('#data-flow-grants .data-flow-grant-remove')?.click()`);
    await waitFor(
        () => client.evaluate(`(() => {
            const settings = globalThis.__ytkitSmoke?.readSettings?.() || {};
            const permissions = globalThis.__ytkitSmoke?.permissionOrigins?.() || [];
            const rows = document.querySelectorAll('#data-flow-grants .data-flow-grant-row');
            return settings.hideVideosFilterListUrl === ''
                && !permissions.includes('https://lists.example.com/*')
                && rows.length === 0;
        })()`),
        5000,
        `${surface.name}/${stateName} host grant removal`
    );
    return 5;
}

async function auditSurface(client, stageDir, surface, timeoutMs) {
    const reports = [];
    for (const theme of surface.themes) {
        if (!surface.reopenEachState) {
            await navigateToSurface(client, stageDir, surface, timeoutMs, theme);
        }
        for (const mode of ['normal', 'zoom-200']) {
            let viewport = await configureRenderedState(client, surface, theme, mode);
            if (surface.reopenEachState) {
                await navigateToSurface(client, stageDir, surface, timeoutMs, theme);
                viewport = await configureRenderedState(client, surface, theme, mode);
            }
            if (mode === 'normal') await captureSurface(client, surface, theme);
            const controls = await auditKeyboardPath(client, surface, `${theme}/${mode}`);
            const focusTrapChecks = mode === 'normal'
                ? await auditFocusTrap(client, surface, `${theme}/${mode}`)
                : 0;
            const settingsDiffChecks = mode === 'normal' && theme === 'dark'
                ? await auditPopupSettingsDiff(client, surface, `${theme}/${mode}`)
                : 0;
            const finiteSelectChecks = mode === 'normal' && theme === 'dark'
                ? await auditPopupFiniteSelect(client, surface, `${theme}/${mode}`)
                : 0;
            const filterGrantChecks = mode === 'normal' && theme === 'dark'
                ? await auditPopupFilterGrant(client, surface, `${theme}/${mode}`)
                : 0;
            const featureHealthChecks = await auditFeatureHealthPanel(client, surface, `${theme}/${mode}`);
            reports.push({ controls, featureHealthChecks, filterGrantChecks, finiteSelectChecks, focusTrapChecks, mode, settingsDiffChecks, theme, viewport });
        }
    }
    let forcedViewport = await configureRenderedState(
        client,
        surface,
        surface.themes[0],
        'forced-colors'
    );
    if (surface.reopenEachState) {
        await navigateToSurface(client, stageDir, surface, timeoutMs, surface.themes[0]);
        forcedViewport = await configureRenderedState(
            client,
            surface,
            surface.themes[0],
            'forced-colors'
        );
    }
    const forcedControls = await auditKeyboardPath(
        client,
        surface,
        `${surface.themes[0]}/forced-colors`
    );
    const forcedFeatureHealthChecks = await auditFeatureHealthPanel(
        client,
        surface,
        `${surface.themes[0]}/forced-colors`
    );
    reports.push({
        controls: forcedControls,
        featureHealthChecks: forcedFeatureHealthChecks,
        mode: 'forced-colors',
        theme: surface.themes[0],
        viewport: forcedViewport,
    });
    for (const locale of surface.rtlLocales || []) {
        await navigateToSurface(client, stageDir, surface, timeoutMs, 'dark', locale);
        const viewport = await configureRenderedState(client, surface, 'dark', 'zoom-200');
        await auditRtlLayout(client, surface, locale);
        await captureSurface(client, surface, `${locale}-dark-zoom-200`);
        const controls = await auditKeyboardPath(client, surface, `${locale}/dark/zoom-200`);
        reports.push({ controls, locale, mode: 'zoom-200', theme: 'dark', viewport });
    }

    // Every primary surface, every tracked locale, at the WCAG reflow width.
    // This is deliberately separate from the surface-specific RTL audit above:
    // that one proves the side panel's search row mirrors correctly, this one
    // proves nothing anywhere overflows or gets clipped in any of them.
    for (const locale of surface.localeStates || []) {
        await navigateToSurface(client, stageDir, surface, timeoutMs, 'dark', locale);
        const viewport = await configureRenderedState(client, surface, 'dark', 'reflow-320');
        // Open every disclosure before measuring. The first run of this lane
        // found the popup's maintenance dropdown hanging 177px off-screen only
        // because a previous state had left it open — collapsed panels have
        // zero-size rects and are skipped, so the check silently depended on
        // leftover state. Opening them explicitly makes the lane deterministic
        // and actually exercises the widest content each surface can show.
        await client.evaluate(`(() => {
            for (const element of document.querySelectorAll('details')) element.open = true;
            return document.querySelectorAll('details[open]').length;
        })()`);
        // Let the new viewport actually lay out before measuring. Without this
        // the first reflow measurement can read rects from the PREVIOUS state's
        // width, which produced a spill report that could not be reproduced.
        await client.evaluate(`new Promise((resolve) => requestAnimationFrame(
            () => requestAnimationFrame(() => setTimeout(resolve, 120))
        ))`);
        // Report the pseudo lane by what it is. "es" in a failure would send
        // the reader looking at the Spanish catalogue, which is not what
        // rendered.
        const label = localeLabel(locale);
        if (locale === PSEUDO_LOCALE && surface.ownsDocument) {
            // Without this the lane is theatre: a surface that fell back to its
            // inline English would measure ordinary copy at 320px and pass
            // while proving nothing about long strings.
            //
            // Scoped to ownsDocument on purpose. The three injected surfaces
            // (settings, transcript, download) draw most of their copy from
            // feature descriptors that are still hardcoded English — the
            // grandfathered-literals backlog — so no locale changes what they
            // render, and asserting otherwise would fail on a defect this lane
            // does not own. They still get the 320px pass; it just measures
            // English there until that backlog moves.
            const rendered = await client.evaluate(
                `document.documentElement.innerText.includes('⟦')`);
            if (!rendered) {
                throw new Error(
                    `${surface.name}/${label}: pseudo-locale copy did not render, so this lane `
                    + 'measured real strings; check the staged _locales/' + PSEUDO_LOCALE + ' catalogue'
                );
            }
        }
        const reflowChecks = await auditLocaleReflow(client, surface, locale, `${label}/reflow-320`);
        const featureHealthChecks = await auditFeatureHealthPanel(client, surface, `${label}/reflow-320`);
        await captureSurface(client, surface, `${label}-reflow-320`);
        reports.push({ controls: 0, featureHealthChecks, locale, mode: 'reflow-320', theme: 'dark', viewport, reflowChecks });
    }
    return reports;
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    const browserPath = findBrowser(options.browser);
    if (!browserPath) throw new Error('No Chromium-family browser found. Pass --browser <path>.');

    const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-headless-a11y-stage-'));
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-headless-a11y-profile-'));
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const fixturePath = createStage(stageDir);
    const browser = spawn(browserPath, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-port=0',
        '--allow-file-access-from-files',
        `--user-data-dir=${profileDir}`,
        fileUrl(fixturePath),
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

    let stderr = '';
    const devtoolsUrl = await new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('Browser did not expose a DevTools endpoint.')),
            options.timeoutMs
        );
        browser.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
            const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
            if (match) { clearTimeout(timer); resolve(match[1]); }
        });
        browser.once('exit', (code) => {
            clearTimeout(timer);
            reject(new Error(`Browser exited before the smoke began (code ${code}).`));
        });
    });

    let socket;
    try {
        const port = new URL(devtoolsUrl).port;
        const page = await waitFor(async () => {
            const targets = await httpGetJson(`http://127.0.0.1:${port}/json/list`).catch(() => []);
            return targets.find((target) => target.type === 'page') || null;
        }, options.timeoutMs, 'headless accessibility page target');
        socket = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
        await new Promise((resolve, reject) => {
            socket.once('open', resolve);
            socket.once('error', reject);
        });
        const client = new DevtoolsClient(socket);
        await client.send('Page.enable');
        await client.send('Runtime.enable');

        const selectedSurfaces = options.surfaces.length
            ? SURFACES.filter((surface) => options.surfaces.includes(surface.name))
            : SURFACES;
        for (const surface of selectedSurfaces) {
            const reports = await auditSurface(client, stageDir, surface, options.timeoutMs);
            const total = reports.reduce((sum, report) => sum + report.controls, 0);
            console.log(
                `[headless-a11y] ${surface.name}: ${reports.length} state(s), `
                + `${total} keyboard focus visits, `
                + `${reports.reduce((sum, report) => sum + (report.focusTrapChecks || 0), 0)} focus-trap assertions, `
                + `${reports.reduce((sum, report) => sum + (report.settingsDiffChecks || 0), 0)} settings-diff assertions, `
                + `${reports.reduce((sum, report) => sum + (report.finiteSelectChecks || 0), 0)} finite-select assertions, `
                + `${reports.reduce((sum, report) => sum + (report.filterGrantChecks || 0), 0)} filter-grant assertions, `
                + `${reports.reduce((sum, report) => sum + (report.featureHealthChecks || 0), 0)} feature-health assertions, `
                + 'no obscuring/overflow failures'
            );
        }
        console.log(`[headless-a11y] Captures saved to ${OUT_DIR}`);
        console.log('[headless-a11y] PASS — normal, 200% reflow, 320px reflow x ar/de/pt_BR/pseudo, themes, and forced colors');
    } finally {
        if (socket) socket.close();
        const browserExit = browser.exitCode !== null
            ? Promise.resolve()
            : new Promise((resolve) => browser.once('exit', resolve));
        browser.kill();
        await Promise.race([browserExit, sleep(3000)]);
        if (browser.exitCode === null && browser.pid) {
            if (process.platform === 'win32') {
                try {
                    execFileSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], {
                        stdio: 'ignore',
                        windowsHide: true,
                    });
                } catch (_) { /* reason: browser may exit between the state check and taskkill */ }
            } else {
                browser.kill('SIGKILL');
            }
            await Promise.race([browserExit, sleep(3000)]);
        }
        if (process.platform === 'win32') await sleep(250);
        if (!options.keepStage) await removeTreeWithRetry(stageDir);
        await removeTreeWithRetry(profileDir);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`[headless-a11y] ${error.message || error}`);
        process.exit(1);
    });
}

module.exports = {
    auditKeyboardPath,
    auditFocusTrap,
    auditPopupSettingsDiff,
    auditRtlLayout,
    collectFocusableExpression,
    configureRenderedState,
    createStage,
    FOCUSABLE_SELECTOR,
    focusStateExpression,
    parseArgs,
    SURFACES,
};
