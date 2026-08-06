#!/usr/bin/env node
'use strict';

// Light-theme lane for INJECTED page surfaces.
//
// Every theming defect found in the 2026-08-06 audit shared one root cause:
// nothing checked injected CSS against YouTube's light theme, so surfaces
// shipped dark-first and painted near-white text onto a near-white page. Five
// of them were on by default.
//
// YouTube's light theme simply omits the `dark` attribute on <html>, so
// `html:not([dark])` is the lane. This gate finds every injected rule that
// paints near-white text without a `[dark]` scope, and requires the same
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

// A colour that is legible on a dark background and therefore invisible, or
// close to it, on YouTube's light one.
const NEAR_WHITE = new RegExp([
    '#f{3}\\b',
    '#f{6}\\b',
    '#[ef][0-9a-f]{5}\\b',
    'rgba?\\(\\s*2[3-5][0-9]\\s*,\\s*2[3-5][0-9]\\s*,\\s*2[3-5][0-9]',
    '\\bwhite\\b'
].join('|'), 'i');

// `color:` only. Backgrounds and borders degrade to "low contrast"; text
// colour degrades to "invisible", which is the failure this gate exists for.
const COLOR_DECL = /(?:^|[;{\s])color\s*:\s*([^;}"'`]+)/gi;

// Astra's own surfaces are the ones we control and can fix.
const YTKIT_TOKEN = /\.(ytkit-[a-z0-9_-]+)/gi;

function ruleBlocks(source) {
    // Deliberately simple: match `<prelude>{<body>}` pairs with no nested
    // braces. Parentheses have to be allowed in the prelude — `html:not([dark])`
    // is the whole point — so JS constructs are excluded by shape instead.
    const blocks = [];
    const re = /([^{};]{3,400})\{([^{}]{0,4000})\}/g;
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

function scan(files) {
    const needsLane = new Map();   // token -> Set(file)
    const hasLane = new Set();     // token

    for (const rel of files) {
        const abs = path.join(REPO_ROOT, rel);
        if (!fs.existsSync(abs)) continue;
        const source = fs.readFileSync(abs, 'utf8');
        for (const { selector, body } of ruleBlocks(source)) {
            const tokens = tokensIn(selector);
            if (!tokens.size) continue;

            if (lightLaneScoped(selector)) {
                COLOR_DECL.lastIndex = 0;
                if (COLOR_DECL.exec(body)) for (const token of tokens) hasLane.add(token);
                continue;
            }
            if (darkScoped(selector)) continue;

            COLOR_DECL.lastIndex = 0;
            let decl;
            let paintsNearWhite = false;
            while ((decl = COLOR_DECL.exec(body)) !== null) {
                if (NEAR_WHITE.test(decl[1])) { paintsNearWhite = true; break; }
            }
            if (!paintsNearWhite) continue;
            for (const token of tokens) {
                if (!needsLane.has(token)) needsLane.set(token, new Set());
                needsLane.get(token).add(rel);
            }
        }
    }
    return { needsLane, hasLane };
}

function main() {
    const update = process.argv.includes('--update-baseline');
    const files = [...SOURCES, ...collectFeatureModules()];
    const { needsLane, hasLane } = scan(files);

    const uncovered = [...needsLane.keys()].filter((token) => !hasLane.has(token)).sort();

    let baseline = { accepted: [], covered: [] };
    if (fs.existsSync(BASELINE_PATH)) {
        baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    }
    const accepted = new Set(baseline.accepted || []);
    const covered = new Set(baseline.covered || []);

    if (update) {
        const next = {
            note: 'Surfaces that paint near-white text with no html:not([dark]) lane. '
                + 'accepted = predates the gate, shrink freely. '
                + 'covered = has a light lane and must keep it.',
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

    if (regressions.length || lost.length) {
        if (regressions.length) {
            console.error('[light-theme-lane] FAIL — injected surfaces paint near-white text with no html:not([dark]) rule:');
            for (const token of regressions) {
                console.error(`  .${token}  (${[...needsLane.get(token)].join(', ')})`);
            }
        }
        if (lost.length) {
            console.error('[light-theme-lane] FAIL — these surfaces lost their light-theme lane:');
            for (const token of lost) console.error(`  .${token}`);
        }
        console.error('[light-theme-lane] Add `html:not([dark]) <selector> { color: … }` next to the rule.');
        process.exit(1);
    }

    const stale = [...accepted].filter((token) => !uncovered.includes(token));
    console.log(`[light-theme-lane] OK — ${hasLane.size} surface(s) carry a light lane; `
        + `${accepted.size} legacy surface(s) still accepted`
        + (stale.length ? `; ${stale.length} accepted entr${stale.length === 1 ? 'y' : 'ies'} now fixed (ratchet down with --update-baseline)` : ''));
}

main();
