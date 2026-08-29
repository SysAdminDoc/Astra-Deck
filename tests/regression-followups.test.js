'use strict';

// Regression guards for the post-pass-3 follow-ups (userscript download
// port-fallback + identity check, popup byte/count formatting, sort scoring,
// Zen Mode and the sleep-timer popover).
//
// The behavioural half of this file used to be single-line source patterns.
// Those now run: the companion health gate is fed real and hostile payloads,
// the popup formatters and stat-card setters are called against a fake DOM,
// the sort is given cards to order, and Zen Mode and the sleep timer are
// initialised and inspected through what they render.
//
// The rest of the file asserts on ASSETS — popup.html seeds, popup.css rules
// and the 11 locale catalogues. Those are data, and reading them is the only
// form those claims have.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { createSubscriptionGroupsFeature } = require('../extension/features/subscription-groups');
const {
    loadFeature,
    loadUserscriptDeclarations,
    loadDeclarationsFrom,
    fakeNode,
    fakeTreeDocument,
} = require('./helpers/monolith');
const { sources } = require('./helpers/source');

const repoRoot = path.join(__dirname, '..');
const userscript = fs.readFileSync(path.join(repoRoot, 'YTKit.user.js'), 'utf8');
const popup = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8');

// The userscript reads its port catalogue off YTKitCore, which the core
// library populates from scripts/companion-port-catalogue.json. Load the real
// one so this proves the wiring rather than a fixture.
const companionPorts = require('../extension/core/companion-ports.js');

const loadMediaDLManager = () => loadUserscriptDeclarations(
    ['USERSCRIPT_COMPANION_PORT_CATALOGUE', 'MediaDLManager'],
    {
        YTKitCore: { companionPorts },
        fetch: () => new Promise(() => {}),
        AbortController,
        setTimeout: () => 0,
        clearTimeout() {},
        GM_xmlhttpRequest() {},
    }
).MediaDLManager;

test('the userscript companion probes every catalogued fallback port', () => {
    const manager = loadMediaDLManager();
    const ports = Array.from(manager._PORT_CANDIDATES);
    assert.ok(ports.length > 1,
        'a single-port probe meant downloads failed silently whenever the server used a fallback');
    assert.ok(ports.every((port) => Number.isInteger(port) && port > 0 && port < 65536),
        'every candidate must be a real port number');

    // baseUrl() has to follow the discovered port, not a compiled-in one.
    const seen = new Set();
    for (const port of ports) {
        manager._port = port;
        const base = new URL(manager.baseUrl());
        assert.equal(Number(base.port), port, 'baseUrl() must reflect the discovered port');
        seen.add(base.hostname);
    }
    assert.equal(seen.size, 1, 'the host stays fixed while the port moves');

    // No endpoint may pin 9751 behind baseUrl()'s back.
    assert.doesNotMatch(userscript, /url:\s*'http:\/\/127\.0\.0\.1:9751\//,
        'no hardcoded 9751 endpoint URLs should remain (only @connect metadata)');
});

test('the userscript companion refuses any localhost server that is not Astra Downloader', () => {
    const manager = loadMediaDLManager();
    const accepted = [
        [{ service: manager._SERVICE_ID, token: 'abc' }, 'the service id it publishes'],
        [{ token: 'abc', token_required: true, port: 9751 }, 'a hardened pre-service-id build'],
    ];
    for (const [payload, why] of accepted) {
        assert.equal(manager._isAstraDownloaderHealth(payload), true, `must accept ${why}`);
    }

    const refused = [
        [null, 'no payload at all'],
        [{}, 'an empty object'],
        [{ service: manager._SERVICE_ID }, 'the right service with no token'],
        [{ token: 'abc' }, 'a bare {token} from any localhost server'],
        [{ token: 'abc', service: 'something-else' }, 'a different service claiming a token'],
        [{ token: 'abc', token_required: true }, 'a token with no port'],
        [{ token: 'abc', token_required: false, port: 9751 }, 'a server that does not require a token'],
    ];
    for (const [payload, why] of refused) {
        assert.equal(manager._isAstraDownloaderHealth(payload), false, `must refuse ${why}`);
    }
});

test('the popup byte formatter scales past MB and stays locale-aware', () => {
    const { formatBytes, formatCount } = loadDeclarationsFrom(
        sources.popup, ['BYTE_UNITS', 'formatCount', 'formatBytes']
    );

    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(-1), '0 B', 'a negative size is not a size');
    assert.equal(formatBytes(NaN), '0 B');
    assert.equal(formatBytes(512), '512 B');
    assert.match(formatBytes(1536), /^1[.,]5 KB$/);
    // The bug: a multi-GB payload read "2048.00 MB".
    assert.match(formatBytes(2 * 1024 ** 3), /^2 GB$/);
    assert.match(formatBytes(3 * 1024 ** 4), /^3 TB$/);
    // And it stops at the largest unit rather than inventing one.
    assert.match(formatBytes(5 * 1024 ** 5), / TB$/);

    assert.equal(formatCount(0), '0');
    assert.equal(formatCount('nonsense'), '0');
    assert.equal(formatCount(1234567), (1234567).toLocaleString(),
        'counts go through the locale formatter, not String()');
});

test('the popup stat cards clear the unavailable state when the numbers come back', () => {
    const elements = ['keys', 'size', 'hidden', 'blocked', 'bookmarks'].map(() => fakeNode({ tag: 'div' }));
    const api = loadDeclarationsFrom(sources.popup, ['setStatCards', 'setStatCardsUnavailable'], {
        STAT_ELEMENTS: () => elements,
        t: (_key, fallback) => fallback,
    });

    api.setStatCardsUnavailable();
    for (const element of elements) {
        assert.equal(element.textContent, 'Unavailable');
        assert.equal(element.dataset.state, 'unavailable');
        assert.equal(element.getAttribute('title'), 'Unavailable');
    }

    // Recovering must clear the state AND the title on every card, or they keep
    // the muted styling and the tooltip after the numbers return.
    api.setStatCards(['12', '3 KB', '4', '5', '6']);
    for (const [index, element] of elements.entries()) {
        assert.equal(element.textContent, ['12', '3 KB', '4', '5', '6'][index]);
        assert.equal(element.dataset.state, undefined, `card ${index} must drop the unavailable state`);
        assert.equal(element.getAttribute('title'), null, `card ${index} must drop the title`);
    }
});

test('the duration sort scores HH:MM:SS in seconds, not minutes', () => {
    const contents = fakeNode({ tag: 'div' });
    const documentRef = fakeTreeDocument((selector) =>
        (String(selector).includes('#contents') ? contents : null));
    globalThis.document = documentRef;
    globalThis.window = { location: { pathname: '/feed/subscriptions' }, addEventListener() {}, removeEventListener() {} };

    const cards = [];
    const card = (duration, label) => {
        const node = fakeNode({ tag: 'ytd-rich-item-renderer', text: `${label} ${duration}` });
        const badge = fakeNode({ tag: 'span', text: duration });
        // Only the duration badge answers; the video-id lookup finds nothing,
        // which is the same as a card whose link has not rendered yet.
        node.querySelector = (selector) => (String(selector).includes('time-status') || String(selector).includes('badge')
            ? badge
            : null);
        node.querySelectorAll = () => [];
        node.dataset.label = label;
        contents.appendChild(node);
        cards.push(node);
        return node;
    };

    // A 1h02m video must sort AFTER a 10m30s one. The old formula mixed
    // hours into minutes and put the long video first.
    card('1:02:40', 'long');
    card('10:30', 'medium');
    card('0:45', 'short');
    contents.querySelectorAll = () => cards.slice();

    const feature = createSubscriptionGroupsFeature({
        addNavigateRule: () => {},
        removeNavigateRule: () => {},
        addScopedMutationRule: () => {},
        removeScopedMutationRule: () => {},
        injectStyle: () => ({ remove() {} }),
        storageReadJSON: (_key, fallback) => fallback,
        storageWriteJSON: () => {},
        appState: { settings: {} },
    });
    feature._applySort('duration-asc');

    assert.deepEqual(
        contents.children.map((node) => node.dataset.label),
        ['short', 'medium', 'long'],
        'shortest first: 45s, then 10m30s, then 1h02m40s'
    );
});

test('Zen Mode dims with a static overlay and no live blur', () => {
    const injected = [];
    const documentRef = fakeTreeDocument(() => null);
    const feature = loadFeature('zenMode', {
        document: documentRef,
        injectStyle: (css) => { injected.push(css); return { remove() {} }; },
    });

    feature.init();
    assert.equal(injected.length, 1, 'init injects exactly one stylesheet');
    const css = injected[0];
    assert.doesNotMatch(css, /backdrop-filter\s*:\s*blur/i,
        'a content-script live blur is what this feature stopped doing');
    assert.match(css, /box-shadow: inset 0 0 140px/, 'the dim is a static vignette');
    assert.match(css, /background: rgba\(0, 0, 0, 0\.75\)/);
    assert.equal(documentRef.body.classList.contains('ytkit-zen-active'), true,
        'the page has to be marked for the overlay to apply');

    // The description is user-facing copy: it must not promise blur either.
    assert.match(feature.description, /Dims the page around the video player/);
    assert.doesNotMatch(feature.description, /blur/i);

    feature.destroy();
    assert.equal(documentRef.body.classList.contains('ytkit-zen-active'), false,
        'teardown must un-dim the page');
});

test('the sleep timer asks for minutes in its own popover, never a browser prompt', () => {
    // The popover mounts into the player chrome, so the chrome has to be there.
    const chrome = fakeNode({ tag: 'div', attributes: { class: 'ytp-chrome-bottom' } });
    const documentRef = fakeTreeDocument((selector) =>
        (String(selector).includes('ytp-chrome-bottom') ? chrome : null));
    const anchor = fakeNode({ tag: 'button' });
    anchor.getBoundingClientRect = () => ({ top: 100, bottom: 124, left: 200, width: 40 });
    const started = [];
    const promptCalls = [];

    const feature = loadFeature('sleepTimer', {
        document: documentRef,
        window: { innerWidth: 1280, innerHeight: 900 },
        appState: { settings: {} },
        // A browser prompt blocks the whole page; if the feature reaches for
        // one this records it instead of hanging the run.
        prompt: (...args) => { promptCalls.push(args); return '30'; },
        setTimeout: () => 1,
        clearTimeout: () => {},
        showToast: () => {},
        getMainVideoElement: () => null,
    });
    feature._start = (minutes) => started.push(minutes);

    feature._showTimerPopover(anchor);
    assert.deepEqual(promptCalls, [], 'the feature must not block YouTube with a browser prompt');

    const popover = chrome.children[chrome.children.length - 1];
    assert.ok(popover, 'the popover must mount into the player chrome');
    assert.equal(popover.getAttribute('role'), 'dialog', 'it announces itself as a dialog');
    assert.ok(popover.getAttribute('aria-label'), 'and carries a name');

    const descendants = [];
    const collect = (node) => {
        for (const child of node.children || []) { descendants.push(child); collect(child); }
    };
    collect(popover);
    const inputs = descendants.filter((node) => node.tagName === 'INPUT');
    assert.equal(inputs.length, 1, 'one field: the number of minutes');
    assert.equal(inputs[0].type, 'number', 'a bounded numeric input, not free text');
    assert.ok(inputs[0].listeners?.has('focus') && inputs[0].listeners?.has('blur'),
        'popover controls keep a visible keyboard focus ring');

    // Out-of-range input is refused with inline copy rather than silently
    // starting a timer.
    const errorNode = descendants.find((node) => node !== inputs[0] && node.tagName === 'DIV' && !node.children.length);
    inputs[0].value = '999';
    assert.equal(feature._startFromInput(inputs[0], errorNode), false,
        'an out-of-range value must be refused');
    assert.deepEqual(started, [], 'and must not start a timer');
    assert.match(String(errorNode.textContent || ''), /Enter a value from 1 to 180 minutes/,
        'and must say why, inline');

    inputs[0].value = '0';
    assert.equal(feature._startFromInput(inputs[0], errorNode), false, 'zero minutes is not a timer');
    inputs[0].value = 'soon';
    assert.equal(feature._startFromInput(inputs[0], errorNode), false, 'nor is free text');
    assert.deepEqual(started, []);

    inputs[0].value = '45';
    assert.equal(feature._startFromInput(inputs[0], errorNode), true);
    assert.deepEqual(started, [45], 'a valid value starts the timer');

    feature._dismissPopover();
    assert.equal(popover.isConnected, false, 'and the popover is cleaned up');
});

test('userscript UI surfaces avoid backdrop blur filters', () => {
    assert.doesNotMatch(userscript, /backdrop-filter\s*:\s*blur/i,
        'YTKit.user.js must not ship backdrop blur on injected UI surfaces');
    assert.doesNotMatch(userscript, /-webkit-backdrop-filter\s*:\s*blur/i,
        'YTKit.user.js must not ship prefixed backdrop blur either');
});

// WHEN the popup first paints, the five storage cards SHALL read a real zero
// rather than a placeholder glyph; and WHEN extension storage is unavailable,
// they SHALL say so in localized copy alongside the existing recovery message,
// never a bare dash.
test('the popup storage cards seed at zero and name the failure', () => {
    const popupHtml = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.html'), 'utf8');
    const popupJs = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8');
    const messages = JSON.parse(fs.readFileSync(
        path.join(repoRoot, 'extension', '_locales', 'en', 'messages.json'), 'utf8'));

    const IDS = ['stat-keys', 'stat-size', 'stat-hidden-videos', 'stat-blocked-channels', 'stat-bookmarks'];
    for (const id of IDS) {
        const match = popupHtml.match(new RegExp('id="' + id + '">([^<]*)<'));
        assert.ok(match, `${id} must still be in the markup`);
        assert.notEqual(match[1].trim(), '—',
            `${id} seeds a placeholder glyph, which is the first thing a user sees`);
        assert.match(match[1].trim(), /^0( B)?$/, `${id} must seed a real zero`);
    }

    // The dash is gone from the failure path entirely.
    //
    // Sliced from the SETTERS, not from renderStorageInfo. setStatCardsUnavailable
    // is defined above renderStorageInfo, so the old window left the failure
    // path — the one these em-dash bans exist to protect — outside it, and an
    // em dash written there passed unnoticed.
    const start = popupJs.indexOf('function setStatCards(values)');
    assert.ok(start > 0, 'the stat-card setters must still exist');
    const body = popupJs.slice(start, popupJs.indexOf('\nasync function renderSettingsSyncStatus', start));
    assert.ok(body.includes('function setStatCardsUnavailable()'),
        'the unavailable setter has to be inside the window these assertions read');
    // Only what it writes, not what it says: there is a prose em dash in a
    // comment in here and matching that would make this assertion about
    // punctuation rather than about behaviour.
    assert.ok(!/textContent\s*=\s*[^;]*'—'/.test(body),
        'the storage render path must not write an em dash into a stat card');
    assert.ok(!/setStatCards\(\[[^\]]*'—'/.test(body),
        'the storage render path must not seed a stat card with an em dash');

    assert.ok(popupJs.includes("t('spStatUnavailable', 'Unavailable')"),
        'the unavailable state must use the catalog entry that already exists for it');
    assert.ok(messages.spStatUnavailable && messages.spStatUnavailable.message,
        'spStatUnavailable must be present in the EN catalog');

    // The recovery copy is still shown with it, not instead of it.
    assert.match(body, /if \(storageUnavailable\) setStatCardsUnavailable\(\);/);
    assert.match(body, /showStatus\(getStorageUnavailableMessage\(\), 'info', 0\)/);

    // A read that failed for another reason reports zero, not "unavailable".
    assert.match(body, /else setStatCards\(\['0', '0 B', '0', '0', '0'\]\)/);

    // Recovering from the unavailable state has to clear it, or the cards keep
    // the muted styling and the title after the numbers come back.
    // Scoped to the per-element loop, not to the first 500 characters of the
    // function: hoisting the clears out of the loop leaves them as dead code
    // that still reads exactly like a clear.
    const setter = popupJs.slice(popupJs.indexOf('function setStatCards(values)'));
    // Bounded at the loop's own closing brace. Slicing to the next function
    // declaration lets anything declared in between count as "inside the loop",
    // which is exactly what hoisting the clears out of it would produce.
    const loopStart = setter.indexOf('for (let index');
    const loopEnd = setter.indexOf('\n    }', loopStart);
    assert.ok(loopStart > -1 && loopEnd > loopStart, 'the setter must still loop over the elements');
    const loop = setter.slice(loopStart, loopEnd);
    assert.match(loop, /delete element\.dataset\.state/,
        'the state clear has to run per element, inside the loop');
    assert.match(loop, /element\.removeAttribute\('title'\)/,
        'and so does the title clear');

    // The unavailable state has its own treatment, or it renders as a number.
    const popupCss = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.css'), 'utf8');
    const rule = popupCss.slice(popupCss.indexOf('.stat-card-value[data-state="unavailable"]'));
    assert.ok(rule.startsWith('.stat-card-value[data-state="unavailable"]'),
        'the unavailable state must carry its own rule');
    const declarations = rule.slice(0, rule.indexOf('}'));
    assert.match(declarations, /font-variant-numeric:\s*normal/,
        'a word must not be rendered with the tabular figures a count uses');
    assert.match(declarations, /color:\s*var\(--text-muted\)/,
        'and it must not read with the weight of a real number');
});

// WHEN an error message tells the user what to do, that instruction SHALL be
// something they can carry out from the UI they are looking at, in every
// locale — not a DevTools console call and not a browser-specific URL.
test('the two error messages name an action a user can actually take', () => {
    const localesDir = path.join(repoRoot, 'extension', '_locales');
    const locales = fs.readdirSync(localesDir).filter((name) =>
        fs.existsSync(path.join(localesDir, name, 'messages.json')));
    assert.ok(locales.length >= 10, 'every shipped locale must be checked, not just EN');

    for (const locale of locales) {
        const messages = JSON.parse(fs.readFileSync(
            path.join(localesDir, locale, 'messages.json'), 'utf8'));

        // The key the code actually renders, at both call sites. Its sibling
        // selectorHealthCopyFail had no call site at all and was deleted rather
        // than reworded, which is checked separately below.
        const fail = messages.selectorHealthCopySaveFallback?.message || '';
        assert.ok(fail, `${locale}: selectorHealthCopySaveFallback must exist`);
        assert.ok(!/DevTools/i.test(fail),
            `${locale}: a non-developer cannot open DevTools to recover from a failed copy`);
        assert.ok(!/__ytkitDiagnostics|window\./.test(fail),
            `${locale}: the message must not name an internal API, or the retired ytkit brand`);

        const reenable = messages.statusMediadlReenableFail?.message || '';
        assert.ok(reenable, `${locale}: statusMediadlReenableFail must exist`);
        assert.ok(!/chrome:\/\//.test(reenable),
            `${locale}: this build also ships a Firefox sidebar, so a chrome:// URL is wrong there`);
        assert.ok(!/about:addons/.test(reenable),
            `${locale}: naming the Firefox URL instead is the same mistake in reverse`);
    }
});

// WHEN user-facing copy names a developer tool or an internal API, it SHALL be
// caught in EVERY locale, not only in English.
//
// The guard above bans English substrings — "DevTools", "chrome://" — on three
// hand-picked keys. Rewriting an Italian string to send the reader to the
// browser's developer console passed it, which is the exact failure mode it
// exists to prevent: generate-locales prefers an existing locale string when no
// table entry matches the CURRENT English, so a rewritten English message
// leaves every translation describing the old behaviour.
//
// These tokens are language-independent. An API name, a browser URL scheme and
// a retired brand look the same in every locale, so a stale translation carrying
// one is detectable without knowing the language.
const DEVELOPER_TOKENS = [
    ['window.__ytkit', 'an internal API is not something a user can call'],
    ['__ytkitDiagnostics', 'an internal API is not something a user can call'],
    ['__ytkitSearchTranscripts', 'an internal API is not something a user can call'],
    ['chrome://', 'this build also ships a Firefox sidebar'],
    ['about:addons', 'and naming the Firefox URL instead is the same mistake in reverse'],
    ['DevTools', 'a non-developer cannot open DevTools to recover from anything']
];

test('no locale sends a user to a developer tool or an internal API', () => {
    const localesDir = path.join(repoRoot, 'extension', '_locales');
    const locales = fs.readdirSync(localesDir).filter((name) =>
        fs.existsSync(path.join(localesDir, name, 'messages.json')));
    assert.ok(locales.length >= 10, 'every shipped locale must be checked');

    const offenders = [];
    for (const locale of locales) {
        const messages = JSON.parse(fs.readFileSync(
            path.join(localesDir, locale, 'messages.json'), 'utf8'));
        for (const [key, entry] of Object.entries(messages)) {
            const message = String(entry?.message || '');
            for (const [token, why] of DEVELOPER_TOKENS) {
                if (message.includes(token)) offenders.push(`${locale}/${key}: ${token} — ${why}`);
            }
        }
    }
    assert.deepEqual(offenders, []);
});

// WHEN English copy is rewritten, the translations SHALL NOT be left describing
// the old behaviour. A translation identical to the PREVIOUS English is the
// visible signature; a translation that is byte-identical to the CURRENT
// English is a legitimate fall-through and not a defect.
test('the two rewritten messages reach every locale', () => {
    const localesDir = path.join(repoRoot, 'extension', '_locales');
    const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en', 'messages.json'), 'utf8'));
    const locales = fs.readdirSync(localesDir).filter((name) => name !== 'en');

    // The clipboard message was translated rather than left to fall through,
    // because it is short and the instruction matters.
    for (const locale of locales) {
        const messages = JSON.parse(fs.readFileSync(
            path.join(localesDir, locale, 'messages.json'), 'utf8'));
        const clipboard = messages.statusClipboardUnavailable?.message || '';
        assert.ok(clipboard, `${locale}: statusClipboardUnavailable must exist`);
        assert.notEqual(clipboard, 'Clipboard unavailable. Check the browser console for details.',
            `${locale}: still carries the superseded English`);
    }

    // The transcript-index description falls through to the current English in
    // every locale: its translations described a feature that no longer exists
    // and named a retired API, and an accurate English sentence beats an
    // inaccurate translated one.
    const desc = en.feature_researchTranscriptIndex_desc.message;
    for (const locale of locales) {
        const messages = JSON.parse(fs.readFileSync(
            path.join(localesDir, locale, 'messages.json'), 'utf8'));
        assert.equal(messages.feature_researchTranscriptIndex_desc?.message, desc,
            `${locale}: must carry the current description, not a translation of the old one`);
    }
});

// The orphan key is gone rather than reworded.
test('the catalog ships no selector-health copy nothing renders', () => {
    const localesDir = path.join(repoRoot, 'extension', '_locales');
    for (const locale of fs.readdirSync(localesDir)) {
        const file = path.join(localesDir, locale, 'messages.json');
        if (!fs.existsSync(file)) continue;
        const messages = JSON.parse(fs.readFileSync(file, 'utf8'));
        assert.equal(messages.selectorHealthCopyFail, undefined,
            `${locale}: selectorHealthCopyFail has no call site; the code uses its sibling at both`);
        assert.ok(messages.selectorHealthCopySaveFallback?.message,
            `${locale}: the key the code actually renders must exist`);
    }
    const popup = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8');
    assert.ok(!popup.includes('selectorHealthCopyFail'),
        'and nothing may start using it again without adding it back deliberately');
});

// WHEN a template substitution carries text a user or a remote page controls,
// it SHALL use a function replacement.
//
// String.replace expands $&, $` , $' and $$ inside the REPLACEMENT, so a
// selector, a search query or a channel name containing one rewrites the very
// message meant to quote it back. Measured before the fix: typing $` into the
// settings search produced "No settings found for “No settings found for “ X”",
// and a channel display name would do the same to an aria-label.
//
// This is not every .replace('{x}', y) in the tree — most substitute a number
// or a value this code produced. It is the ones fed by text from outside.
const DOLLAR_EXPANSION_SITES = [
    ['extension/features/element-zapper/index.js', "\\.replace\\('\\{selector\\}', \\(\\) => rule\\.selector\\)",
        "the user's own CSS selector"],
    ['extension/features/settings-panel/index.js', "\\.replace\\('\\{query\\}', \\(\\) => rawLabel\\)",
        'the raw text from the settings search box'],
    ['extension/features/subscription-groups/index.js', "\\.replace\\('\\{channel\\}', \\(\\) => name\\.textContent\\)",
        "a channel display name, which is remote text"]
];

test('substitutions fed by outside text use a function replacement', () => {
    for (const [rel, pattern, what] of DOLLAR_EXPANSION_SITES) {
        const source = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
        assert.match(source, new RegExp(pattern),
            `${rel}: this substitutes ${what}, so it cannot be a string replacement`);
    }
});

// And the expansion itself, so the reason is pinned rather than described.
test('a string replacement really does expand a dollar pattern', () => {
    const template = 'No settings found for {query}';
    const hostile = '$` X';
    assert.notEqual(template.replace('{query}', hostile), 'No settings found for $` X',
        'if this ever stops expanding, the guards above can be relaxed');
    assert.equal(template.replace('{query}', () => hostile), 'No settings found for $` X',
        'a function replacement is the form that does not expand');
});
