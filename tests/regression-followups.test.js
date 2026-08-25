'use strict';

// Regression guards for the post-pass-3 follow-ups (userscript download
// port-fallback + identity check, popup byte/count formatting). Single-line
// source patterns (CRLF-safe).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const userscript = fs.readFileSync(path.join(repoRoot, 'YTKit.user.js'), 'utf8');
const popup = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8');
const ytkit = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
const subscriptionGroups = fs.readFileSync(
    path.join(repoRoot, 'extension', 'features', 'subscription-groups', 'index.js'), 'utf8');

test('userscript MediaDLManager probes fallback ports and gates on the Astra identity', () => {
    assert.ok(/_PORT_CANDIDATES:\s*Object\.freeze\(USERSCRIPT_COMPANION_PORT_CATALOGUE\?\.ports/.test(userscript),
        'must consume the shared companion fallback port catalogue');
    assert.ok(/_isAstraDownloaderHealth\(data\)/.test(userscript),
        'must validate the Astra Downloader health identity, not trust any localhost {token}');
    assert.ok(/baseUrl\(\)\s*\{\s*return 'http:\/\/' \+ \(USERSCRIPT_COMPANION_PORT_CATALOGUE/.test(userscript),
        'must expose baseUrl() reflecting the shared host and discovered port');
    assert.ok(/MediaDLManager\.baseUrl\(\) \+ '\/status\//.test(userscript),
        'status poll must use the discovered port');
    assert.ok(/MediaDLManager\.baseUrl\(\) \+ '\/download'/.test(userscript),
        'download must use the discovered port');
    assert.ok(!/url:\s*'http:\/\/127\.0\.0\.1:9751\//.test(userscript),
        'no hardcoded 9751 endpoint URLs should remain (only @connect metadata)');
});

test('popup formatBytes scales beyond MB and counts are locale-aware', () => {
    assert.ok(/BYTE_UNITS = \['B', 'KB', 'MB', 'GB', 'TB'\]/.test(popup),
        'formatBytes must scale through GB/TB, not cap at MB');
    assert.ok(/function formatCount\(n\)/.test(popup),
        'a locale-aware count formatter must exist');
    // Pinned the assignment shape, but what it is asserting is that the counts
    // go through formatCount. The five cards are written through one setter now
    // so the unavailable state can clear itself, and the formatter call moved
    // into that setter's argument list.
    assert.ok(/setStatCards\(\[\s*formatCount\(summary\.keys\)/.test(popup),
        'storage stat counts must use the locale-aware formatter');
});

test('subscriptionGroups duration-asc sort normalizes HH:MM:SS to seconds', () => {
    const i = subscriptionGroups.indexOf("mode === 'duration-asc'");
    assert.ok(i > -1, 'duration-asc branch must exist');
    const block = subscriptionGroups.slice(i, i + 1400);
    assert.ok(/\*\s*3600/.test(block),
        'HH:MM:SS must be scored in seconds (hours*3600), not minutes');
    assert.ok(!/\(Number\(m\[3\]\) \|\| 0\) \/ 60/.test(block),
        'must not use the old minutes-mixing formula (m[3]/60)');
});

test('zenMode uses a static dim overlay instead of backdrop blur', () => {
    const start = ytkit.indexOf("id: 'zenMode'");
    assert.ok(start > -1, 'zenMode feature must exist');
    const block = ytkit.slice(start, start + 1800);
    assert.match(block, /Dims the page around the video player/,
        'zenMode copy must not promise blur');
    assert.match(block, /box-shadow: inset 0 0 140px/,
        'zenMode should use a static vignette on the overlay');
    assert.doesNotMatch(block, /backdrop-filter\s*:\s*blur/i,
        'content-script Zen Mode must not use live backdrop blur');
});

test('sleepTimer uses an inline popover instead of a browser prompt', () => {
    const start = ytkit.indexOf("id: 'sleepTimer'");
    assert.ok(start > -1, 'sleepTimer feature must exist');
    const block = ytkit.slice(start, start + 9000);
    assert.doesNotMatch(block, /\bprompt\s*\(/,
        'sleepTimer must not block YouTube with a browser prompt');
    assert.match(block, /_showTimerPopover/,
        'sleepTimer must expose an inline timer popover');
    assert.match(block, /setAttribute\('role', 'dialog'\)/,
        'sleepTimer popover must declare dialog semantics');
    assert.match(block, /input\.type = 'number'/,
        'sleepTimer popover must use a bounded numeric input');
    assert.match(block, /Enter a value from 1 to 180 minutes\./,
        'sleepTimer validation must render inline feedback');
    assert.match(block, /focusRing/,
        'sleepTimer popover controls must keep visible keyboard focus');
    assert.match(block, /this\._dismissPopover\(\)/,
        'sleepTimer must clean up the popover when state changes');
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
