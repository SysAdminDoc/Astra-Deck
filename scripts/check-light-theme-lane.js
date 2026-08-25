#!/usr/bin/env node
'use strict';

// Light-theme lane for INJECTED page surfaces.
//
// Every theming defect found in the 2026-08-06 audit shared one root cause:
// nothing checked injected CSS against YouTube's light theme, so surfaces
// shipped dark-first and painted low-contrast text onto a light page. Five
// of them were on by default.
//
// YouTube's light theme simply omits the `dark` attribute on <html>, so
// `html:not([dark])` is the lane. This gate finds every injected rule that
// paints text below the near-invisible floor without a `[dark]` scope, and requires the same
// surface to be re-specified inside that lane.
//
// It is a RATCHET: scripts/light-theme-baseline.json records the surfaces that
// predate the gate. Anything new fails immediately, and removing a covered
// surface from the lane fails immediately. Shrinking the baseline is always
// allowed; growing it requires an explicit --update-baseline.
//
// Usage:
//   node scripts/check-light-theme-lane.js
//   node scripts/check-light-theme-lane.js --update-baseline

const fs = require('fs');
const path = require('path');
const { compositeColor, contrast, parseColor } = require('./check-contrast.js');

const REPO_ROOT = path.join(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'light-theme-baseline.json');

// Injected surfaces only: these are the files whose CSS lands on youtube.com.
// Extension-owned pages (popup, side panel) have their own palette and are
// covered by audit:contrast.
const SOURCES = [
    'extension/ytkit.js',
    'extension/ytkit-main.js',
    'extension/early.css',
    'extension/live-chat.css'
];

function collectFeatureModules() {
    const featuresDir = path.join(REPO_ROOT, 'extension', 'features');
    if (!fs.existsSync(featuresDir)) return [];
    return fs.readdirSync(featuresDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `extension/features/${entry.name}/index.js`)
        .filter((rel) => fs.existsSync(path.join(REPO_ROOT, rel)));
}

// extension/core/*.js injects CSS onto youtube.com as much as the feature
// modules do, and was outside this gate entirely.
function collectCoreModules() {
    const coreDir = path.join(REPO_ROOT, 'extension', 'core');
    if (!fs.existsSync(coreDir)) return [];
    return fs.readdirSync(coreDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
        .map((entry) => `extension/core/${entry.name}`);
}

// A floor on the gate's own scope. A hand-written list silently shrinks when a
// file is renamed or a directory moves, and a gate that scans nothing passes
// loudest of all. `check-userscript-symbols.js` set this pattern.
const MIN_SOURCES = 30;

// YouTube's light lane resolves --yt-spec-base-background to white. This gate
// intentionally detects catastrophic near-invisibility, not every WCAG AA
// miss: popup/sidepanel contrast and rendered a11y lanes own the 4.5:1 audit.
// A measured ratio below 2.00:1 catches pale neutrals such as #d8d8d8 while
// keeping chromatically distinct red, salmon, and 2.00:1 amber out of this
// narrow source-level ratchet. Ratios are classified at the same two-decimal
// precision the contrast audit reports, avoiding floating-point boundary noise.
const YOUTUBE_LIGHT_BACKGROUND = '#ffffff';
const LIGHT_THEME_CONTRAST_FLOOR = 2;
const YOUTUBE_LIGHT_BACKGROUND_RGB = parseColor(YOUTUBE_LIGHT_BACKGROUND);

// `color:` only. Backgrounds and borders degrade to "low contrast"; text
// colour degrades to "invisible", which is the failure this gate exists for.
const COLOR_DECL = /(?:^|[;{\s])color\s*:\s*([^;}"'`]+)/gi;

// Astra's palette, in both of its lanes. Until 2026-08-20 this gate read only
// literal colours, which left two holes. A rule saying `color: var(--x)` was
// invisible to it, so tokenising a surface silently removed it from the scan
// without fixing anything. And a light-lane rule counted as coverage the
// moment it contained any `color:` at all, even when the token it named had no
// light value and resolved straight back to the dark one — which is exactly
// how .ytkit-hidden-note carried a light lane for months while rendering
// near-white text on YouTube's light background.
function readPalette() {
    // Absent in a staged tree (tests/light-theme-lane.test.js drives the real
    // scanner against a throwaway directory). No palette means every var()
    // falls back to the literal beside it, which is the pre-2026-08-20
    // behaviour and the right answer when there is nothing to resolve against.
    const monolith = path.join(REPO_ROOT, 'extension', 'ytkit.js');
    if (!fs.existsSync(monolith)) return { dark: new Map(), light: new Map() };
    const src = fs.readFileSync(monolith, 'utf8');
    const open = src.indexOf('const PALETTE_CSS = `');
    if (open === -1) return { dark: new Map(), light: new Map() };
    const text = src.slice(open, src.indexOf('\n`;', open));
    const read = (block) => {
        const out = new Map();
        if (!block) return out;
        for (const m of block.matchAll(/(--ytkit-[A-Za-z0-9-]+)\s*:\s*([^;]+);/g)) {
            out.set(m[1], m[2].replace(/\/\*[\s\S]*?\*\//g, '').trim());
        }
        return out;
    };
    const rootAt = text.indexOf(':root {');
    const laneAt = text.indexOf('html:not([dark]) {');
    const dark = read(rootAt === -1 ? null : text.slice(rootAt, text.indexOf('\n}\n', rootAt)));
    const light = read(laneAt === -1 ? null : text.slice(laneAt));

    // The settings panel carries a second, panel-scoped palette. Its light lane
    // is `html:not([dark]) #ytkit-settings-panel`, not the global one, so
    // without reading it every panel label looks like near-white text with no
    // lane — which it is not: the token it names relights underneath it.
    const visual = path.join(REPO_ROOT, 'extension', 'core', 'settings-visual-system.js');
    if (fs.existsSync(visual)) {
        const panel = fs.readFileSync(visual, 'utf8');
        const block = (marker) => {
            const at = panel.indexOf(marker);
            return at === -1 ? null : panel.slice(at, panel.indexOf('\n        }', at));
        };
        for (const [token, value] of read(block('#ytkit-settings-panel {'))) {
            if (!dark.has(token)) dark.set(token, value);
        }
        for (const [token, value] of read(block('html:not([dark]) #ytkit-settings-panel {'))) {
            if (!light.has(token)) light.set(token, value);
        }
    }
    return { dark, light };
}

const PALETTE = readPalette();

// Surfaces whose own background the shared surface system overrides with
// `background: var(--ytkit-premium-panel) !important`. That token is #ffffff
// under `html:not([dark])`, so in light theme these surfaces do NOT sit on the
// dark ground their base rule paints: the ground is white and any dark-lane
// text on them is unreadable.
//
// This is the blind spot that let the Digital Wellbeing card ship at ~1.05:1.
// The grounding pass below reads each rule's own body, sees `background:
// #12151c`, and marks the surface opaquely grounded, which then exempts it and
// every prefix-descendant. It cannot see an !important override living in a
// different file, and the override always wins.
function readLightGroundOverrides() {
    const overridden = new Set();
    const visual = path.join(REPO_ROOT, 'extension', 'core', 'settings-visual-system.js');
    if (!fs.existsSync(visual)) return overridden;
    const source = fs.readFileSync(visual, 'utf8');
    // Only the blocks that force the premium panel background. The
    // color-scheme resets and the descendant control rules leave the ground
    // alone and must not be read as an override.
    const FORCED = /:is\(([^)]*)\)\s*\{[^}]*background:\s*var\(--ytkit-premium-panel\)\s*!important/g;
    let match;
    while ((match = FORCED.exec(source))) {
        for (const raw of match[1].split(',')) {
            const selector = raw.trim();
            // Ids as well as classes: two of the forced surfaces are named
            // `#ytkit-...` because that is what the extension renders, and a
            // class-only reader left them counted as grounded.
            if (/^[.#]ytkit-/.test(selector)) overridden.add(selector.slice(1));
        }
    }
    return overridden;
}

const LIGHT_GROUND_OVERRIDDEN = readLightGroundOverrides();

// Resolve var() references down to literals for one theme lane. A token with
// no light-lane entry deliberately resolves to its dark value: that is not a
// lookup failure, it is the defect being looked for.
function resolveColor(value, lane) {
    const table = lane === 'light' ? PALETTE.light : PALETTE.dark;
    let out = String(value);
    for (let depth = 0; depth < 4; depth += 1) {
        if (!out.includes('var(')) break;
        const next = out.replace(
            /var\(\s*(--ytkit-[A-Za-z0-9-]+)\s*(?:,\s*([^()]*?(?:\([^()]*\)[^()]*?)*))?\)/g,
            (whole, token, fallback) => {
                if (table.has(token)) return table.get(token);
                if (lane === 'light' && PALETTE.dark.has(token)) return PALETTE.dark.get(token);
                return fallback === undefined ? whole : fallback;
            }
        );
        if (next === out) break;
        out = next;
    }
    return out;
}

// Astra's own surfaces are the ones we control and can fix.
// Capture ids as well as classes. Several injected surfaces use an id for the
// opaque shell and classes for its text, so ignoring `#ytkit-*` made the
// scanner forget the ground that the browser actually paints.
const YTKIT_TOKEN = /[.#](ytkit-[a-z0-9_-]+)/gi;

function ruleBlocks(source) {
    // Deliberately simple: match `<prelude>{<body>}` pairs with no nested
    // braces. Parentheses have to be allowed in the prelude — `html:not([dark])`
    // is the whole point — so JS constructs are excluded by shape instead.
    //
    // The prelude cap was 400, which silently skipped any grouped `:is(...)`
    // list longer than that — and a grouped list is exactly how the shared
    // surface system names a family. A relight written that way was invisible
    // to this scanner, so the surfaces it fixed still read as unlaned.
    const blocks = [];
    const re = /([^{};]{3,2000})\{([^{}]{0,4000})\}/g;
    let match;
    while ((match = re.exec(source)) !== null) {
        const selector = match[1].trim();
        if (/=>|function|return|if\s*\(|for\s*\(|catch/.test(selector)) continue;
        blocks.push({ selector, body: match[2] });
    }
    return blocks;
}

function lightLaneScoped(selector) {
    return /html:not\(\s*\[dark\]\s*\)/i.test(selector)
        || /prefers-color-scheme\s*:\s*light/i.test(selector);
}

function darkScoped(selector) {
    // A rule already fenced to dark mode cannot leak into the light theme.
    return /html\[dark\]|\[dark\]\s|:root\[dark\]/i.test(selector)
        && !lightLaneScoped(selector);
}

function tokensIn(selector) {
    const found = new Set();
    let match;
    YTKIT_TOKEN.lastIndex = 0;
    while ((match = YTKIT_TOKEN.exec(selector)) !== null) found.add(match[1]);
    return found;
}

// A rule that paints its own background is legible on either theme whatever
// the page behind it does, and flagging it wastes the reader's attention on
// surfaces that were never broken — the 2026-08-20 sample found the first two
// examined (.ytkit-video-hide-btn, the blocked-watch dialog) were exactly this.
//
// A wash is not a ground. `background: rgba(15,23,42,0.04)` lets the page
// through almost entirely, so a surface painted with one is still at the mercy
// of the theme behind it — treating that as self-grounded would have excused
// .ytkit-hidden-note, which is the very surface that proved the light lane
// could be inert. Only a substantially opaque colour counts.
const BACKGROUND_DECL = /(?:^|[;{\s])background(?:-color|-image)?\s*:\s*([^;}"'`]+)/gi;
const OPAQUE_ALPHA = 0.7;

// Some injected surfaces use a shell name whose final segment does not match
// the child class family. Keep those relationships explicit and only activate
// them when the shell still proves an opaque ground above. The rendered light
// fixture covers these shells, so this is context evidence rather than an
// accepted-list escape hatch.
const GROUND_FAMILY_ALIASES = Object.freeze([
    Object.freeze({ root: 'ytkit-aisum-panel', family: 'ytkit-aisum' }),
    Object.freeze({ root: 'ytkit-blocked-watch-dialog', family: 'ytkit-blocked-watch' }),
    Object.freeze({ root: 'ytkit-bookmarks-container', family: 'ytkit-bookmark' }),
    Object.freeze({ root: 'ytkit-bookmarks-container', family: 'ytkit-bookmarks' }),
    Object.freeze({ root: 'ytkit-global-toast', family: 'ytkit-toast' }),
    Object.freeze({ root: 'ytkit-mediadl-install-prompt', family: 'ytkit-install-prompt' }),
    Object.freeze({ root: 'ytkit-mini-player-bar', family: 'ytkit-mini-player' }),
    Object.freeze({ root: 'ytkit-po-drop', family: 'ytkit-ql' }),
    Object.freeze({ root: 'ytkit-ql-drop', family: 'ytkit-ql' }),
    Object.freeze({ root: 'ytkit-rc-panel', family: 'ytkit-rc' }),
    Object.freeze({ root: 'ytkit-sb-profile-panel', family: 'ytkit-sb-profile' }),
    Object.freeze({ root: 'ytkit-transcript-batch-panel', family: 'ytkit-transcript-batch' }),
    Object.freeze({ root: 'ytkit-vvf-panel', family: 'ytkit-vvf' }),
    Object.freeze({ root: 'ytkit-wellbeing-card', family: 'ytkit-wellbeing' }),
    Object.freeze({ root: 'ytkit-wha-card', family: 'ytkit-wha' })
]);

function isOpaqueGround(value) {
    if (/^(transparent|none|inherit|initial|unset|revert)\b/i.test(value)) return false;
    // Strip the translucent stops, then see whether any solid colour is left.
    const solid = value.replace(
        /(?:rgba|hsla)\([^()]*?,\s*(?:0?\.\d+|0)\s*\)/gi,
        (stop) => (parseFloat(stop.match(/,\s*(0?\.\d+|0)\s*\)$/)[1]) >= OPAQUE_ALPHA ? stop : '')
    );
    return /#[0-9a-f]{3,8}|\brgba?\(|\bhsla?\(|\b(?:black|white)\b/i.test(solid);
}

function backgroundsIn(body) {
    const out = [];
    BACKGROUND_DECL.lastIndex = 0;
    let decl;
    while ((decl = BACKGROUND_DECL.exec(body)) !== null) out.push(resolveColor(decl[1], 'dark').trim());
    return out;
}

// Two thresholds, because two different questions are being asked.
//
// "Should this surface be reported as needing a light lane?" is the noisy one:
// most of these sit on an Astra panel whose ground a regex cannot walk up to,
// so anything that paints a background at all gets the benefit of the doubt.
// Being wrong here means nagging about a surface that renders fine, and 150 of
// the 254 entries in the pre-2026-08-20 baseline were exactly that.
function providesOwnGround(body) {
    // A rule that shadows its own text has provided legibility explicitly and
    // does not depend on the ground behind it — the photosensitive overlay
    // rides on arbitrary video frames and does exactly this.
    if (/(?:^|[;{\s])text-shadow\s*:/i.test(body)) return true;
    return backgroundsIn(body).some((value) =>
        !/^(transparent|none|inherit|initial|unset|revert)\b/i.test(value)
        && /#[0-9a-f]{3,8}|\brgba?\(|\bhsla?\(|\bgradient\(|\b(?:black|white)\b/i.test(value));
}

// "Does this light lane actually do anything?" is the strict one. Someone
// wrote that rule because they believed the surface needed theming, so a
// four-percent wash does not excuse it resolving to the dark colour anyway.
function providesOpaqueGround(body) {
    if (/(?:^|[;{\s])text-shadow\s*:/i.test(body)) return true;
    return backgroundsIn(body).some(isOpaqueGround);
}

function lightThemeContrast(value) {
    const normalized = String(value || '').replace(/\s*!important\s*$/i, '').trim();
    try {
        return contrast(
            compositeColor(normalized, YOUTUBE_LIGHT_BACKGROUND_RGB),
            YOUTUBE_LIGHT_BACKGROUND_RGB
        );
    } catch (_) {
        // inherit/currentColor and unresolved host tokens have no standalone
        // colour to measure. YouTube owns --yt-spec-* values in the rendered
        // theme, so their dark fallback is not evidence of the light colour.
        // Astra tokens are resolved through the two parsed palettes above.
        return null;
    }
}

function isNearInvisibleOnLight(value) {
    const ratio = lightThemeContrast(value);
    return ratio !== null && Number(ratio.toFixed(2)) < LIGHT_THEME_CONTRAST_FLOOR;
}

function paintsNearInvisibleOnLight(body, lane) {
    COLOR_DECL.lastIndex = 0;
    let decl;
    while ((decl = COLOR_DECL.exec(body)) !== null) {
        if (isNearInvisibleOnLight(resolveColor(decl[1], lane))) return true;
    }
    return false;
}

function hasColorDecl(body) {
    COLOR_DECL.lastIndex = 0;
    return COLOR_DECL.exec(body) !== null;
}

function scan(files) {
    const needsLane = new Map();   // token -> Set(file)
    const hasLane = new Set();     // token
    const inertLane = new Map();   // token -> Set(file): light lane that resolves dark anyway

    const parsed = [];
    for (const rel of files) {
        const abs = path.join(REPO_ROOT, rel);
        if (!fs.existsSync(abs)) continue;
        for (const rule of ruleBlocks(fs.readFileSync(abs, 'utf8'))) parsed.push({ rel, ...rule });
    }

    // Grounding is a property of the surface, not of one rule: an override that
    // sets only `color` sits on the background its base rule painted. Collected
    // across every rule first so a colour-only light lane is judged against the
    // ground the surface actually has.
    const grounded = new Set();
    // Same idea for relighting: a surface whose colour is set from a token that
    // carries a light value is theme-aware wherever that declaration lives. The
    // settings panel does this a lot — ytkit.js gives .ytkit-feature-name the
    // global near-white token and settings-visual-system.js then overrides it
    // with !important using a token that relights. Judged per class rather than
    // per rule for the same reason grounding is: the fix and the flag are
    // routinely in different files.
    const opaquelyGrounded = new Set();
    const themeAware = new Set();
    for (const { selector, body } of parsed) {
        const tokens = tokensIn(selector);
        if (!tokens.size) continue;
        // A surface the shared system repaints white in light theme is not
        // grounded there, whatever its own base rule says.
        if (providesOwnGround(body)) {
            for (const token of tokens) if (!LIGHT_GROUND_OVERRIDDEN.has(token)) grounded.add(token);
        }
        if (providesOpaqueGround(body)) {
            for (const token of tokens) if (!LIGHT_GROUND_OVERRIDDEN.has(token)) opaquelyGrounded.add(token);
        }
        // `color: inherit` and `currentColor` hand the decision to an ancestor,
        // so the surface cannot be independently wrong about the theme. The
        // panel uses this for nav labels, which the ancestor then relights.
        if (/(?:^|[;{\s])color\s*:\s*(?:inherit|currentColor)\b/i.test(body)) {
            for (const token of tokens) themeAware.add(token);
        }
        if (paintsNearInvisibleOnLight(body, 'dark') && !paintsNearInvisibleOnLight(body, 'light')) {
            for (const token of tokens) themeAware.add(token);
        }
    }

    // Ground is inherited down the class-name tree. `.ytkit-pm` paints an
    // opaque ground and `.ytkit-pm-title` sits inside it, so the child is as
    // legible on light theme as the parent — but a per-class scan cannot walk
    // the DOM and would flag all eight children of a perfectly good dark
    // overlay. The naming here is consistently prefix-based (BEM-ish), so the
    // prefix is a usable stand-in for containment.
    //
    // A short prefix like `ytkit-pm` has to qualify — it IS the overlay, and it
    // paints an opaque ground — but a short prefix backed by a four-percent
    // wash would ground half the codebase on nothing. So: an opaque ground
    // qualifies at any depth, a wash only from three segments down, where the
    // name is specific enough that it cannot be a whole family by accident.
    const groundPrefixes = [...new Set([
        ...opaquelyGrounded,
        ...[...grounded].filter((token) => token.split('-').length >= 3)
    ])];
    for (const { root, family } of GROUND_FAMILY_ALIASES) {
        if (opaquelyGrounded.has(root)) groundPrefixes.push(family);
    }
    const inheritsGround = (token) => groundPrefixes.some((prefix) =>
        token !== prefix && (token.startsWith(`${prefix}-`) || token.startsWith(`${prefix}__`)));

    {
        for (const { rel, selector, body } of parsed) {
            const tokens = tokensIn(selector);
            if (!tokens.size) continue;

            if (lightLaneScoped(selector)) {
                if (!hasColorDecl(body)) continue;
                // A light lane whose text still resolves near-white is not
                // coverage. It reads as coverage in the source and paints the
                // dark value on screen, which is worse than no lane at all
                // because it stops anyone looking again.
                const selfGrounded = [...tokens].some(token => opaquelyGrounded.has(token));
                if (paintsNearInvisibleOnLight(body, 'light') && !selfGrounded) {
                    for (const token of tokens) {
                        if (!inertLane.has(token)) inertLane.set(token, new Set());
                        inertLane.get(token).add(rel);
                    }
                    continue;
                }
                for (const token of tokens) hasLane.add(token);
                continue;
            }
            if (darkScoped(selector)) continue;

            if (!paintsNearInvisibleOnLight(body, 'dark')) continue;
            // Near-white in the dark lane but not in the light one means the
            // colour comes from a token that relights, so the surface is
            // already theme-aware and demanding a separate html:not([dark])
            // rule for it would be busywork. This is the shape the burndown
            // should aim for: retokenise, do not hand-write a second rule.
            if (!paintsNearInvisibleOnLight(body, 'light')) continue;
            if ([...tokens].some(token => themeAware.has(token))) continue;
            // A surface is exempt only when the rule itself, or a named
            // ancestor family, proves an opaque ground. Class names that are
            // merely expected to render inside a dark host are not evidence:
            // a detached `.ytkit-po-cc` or `.ytkit-brand-intro` must still be
            // caught by the source scan and covered by a real theme lane.
            if ([...tokens].some(token => opaquelyGrounded.has(token) || inheritsGround(token))) continue;
            for (const token of tokens) {
                if (!needsLane.has(token)) needsLane.set(token, new Set());
                needsLane.get(token).add(rel);
            }
        }
    }
    return { needsLane, hasLane, inertLane };
}

function main() {
    const update = process.argv.includes('--update-baseline');
    const files = [...SOURCES, ...collectFeatureModules(), ...collectCoreModules()];
    if (files.length < MIN_SOURCES) {
        console.error(
            `[light-theme-lane] FAILED — scope collapsed to ${files.length} source(s), below the `
            + `floor of ${MIN_SOURCES}. Peeling a feature out used to drop it from this gate silently.`
        );
        process.exitCode = 1;
        return;
    }
    const { needsLane, hasLane, inertLane } = scan(files);

    const uncovered = [...needsLane.keys()].filter((token) => !hasLane.has(token)).sort();
    const inert = [...inertLane.keys()].filter((token) => !hasLane.has(token)).sort();

    let baseline = { accepted: [], covered: [] };
    if (fs.existsSync(BASELINE_PATH)) {
        baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    }
    const accepted = new Set(baseline.accepted || []);
    const covered = new Set(baseline.covered || []);

    if (update) {
        const next = {
            note: 'Surfaces whose text measures below 2.00:1 against YouTube light background #ffffff with no html:not([dark]) lane. '
                + 'accepted = predates the gate, shrink freely. '
                + 'covered = has a light lane and must keep it.',
            ...(baseline.measurement ? { measurement: baseline.measurement } : {}),
            accepted: uncovered,
            covered: [...hasLane].sort()
        };
        fs.writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n');
        console.log(`[light-theme-lane] baseline updated: ${uncovered.length} accepted, ${next.covered.length} covered`);
        return;
    }

    const regressions = uncovered.filter((token) => !accepted.has(token));
    // A surface that HAD a light lane must not lose it — this is what makes
    // reverting any of the theming fixes fail here.
    const lost = [...covered].filter((token) => !hasLane.has(token)).sort();

    // `inert` is its own trigger, not folded into `lost`: a brand-new light
    // lane that cannot take effect must fail on the day it is written, whether
    // or not the surface was ever recorded as covered.
    if (regressions.length || lost.length || inert.length) {
        if (regressions.length) {
            console.error('[light-theme-lane] FAIL — injected surfaces paint text below 2.00:1 on YouTube light background with no html:not([dark]) rule:');
            for (const token of regressions) {
                console.error(`  .${token}  (${[...needsLane.get(token)].join(', ')})`);
            }
        }
        const inertSet = new Set(inert);
        const dropped = lost.filter((token) => !inertSet.has(token));
        if (dropped.length) {
            console.error('[light-theme-lane] FAIL — these surfaces lost their light-theme lane:');
            for (const token of dropped) console.error(`  .${token}`);
        }
        if (inert.length) {
            console.error('[light-theme-lane] FAIL — these light lanes exist but resolve to the dark colour anyway:');
            for (const token of inert) {
                console.error(`  .${token}  (${[...inertLane.get(token)].join(', ')})`);
            }
            console.error('[light-theme-lane] The token named in the lane has no light value, so the rule paints '
                + 'the dark colour on a light page. Give the token a light value in the palette lane rather than '
                + 'hand-writing a second literal.');
        }
        console.error('[light-theme-lane] Add `html:not([dark]) <selector> { color: … }` next to the rule.');
        process.exit(1);
    }

    const stale = [...accepted].filter((token) => !uncovered.includes(token));
    console.log(`[light-theme-lane] OK — ${hasLane.size} surface(s) carry a light lane; `
        + `${accepted.size} legacy surface(s) still accepted`
        + (stale.length ? `; ${stale.length} accepted entr${stale.length === 1 ? 'y' : 'ies'} now fixed (ratchet down with --update-baseline)` : ''));
}

if (require.main === module) main();

// Exported so the judgement calls can be tested directly. The summary line is
// a poor oracle for them: three of the four reasons this gate now skips a
// surface produce no output at all when they fire.
module.exports = {
    GROUND_FAMILY_ALIASES,
    LIGHT_THEME_CONTRAST_FLOOR,
    YOUTUBE_LIGHT_BACKGROUND,
    isNearInvisibleOnLight,
    lightThemeContrast,
    paintsNearInvisibleOnLight,
    providesOpaqueGround,
    providesOwnGround,
    readPalette,
    resolveColor,
    scan
};
