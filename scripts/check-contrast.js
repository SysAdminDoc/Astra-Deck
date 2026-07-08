#!/usr/bin/env node
/**
 * Contrast checker for popup a11y audit (Pass 18 L7).
 * Validates WCAG AA (4.5:1) contrast ratios for key popup colors.
 */

function luminance(r, g, b) {
    const [rs, gs, bs] = [r, g, b].map(x => {
        x = x / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrast(hex1, hex2) {
    const parseHex = (hex) => {
        // Fail loudly on anything that is not #rrggbb. parseInt('rgba(…)', 16)
        // coerces to NaN, which the bit math turned into rgb(0,0,0) — a check
        // could then silently "pass" against a black background that the
        // surface never uses.
        if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
            throw new Error('parseHex expects #rrggbb, got: ' + hex);
        }
        const num = parseInt(hex.slice(1), 16);
        return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    };
    const [r1, g1, b1] = parseHex(hex1);
    const [r2, g2, b2] = parseHex(hex2);
    const l1 = luminance(r1, g1, b1);
    const l2 = luminance(r2, g2, b2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return ((lighter + 0.05) / (darker + 0.05)).toFixed(2);
}

// Key colors from popup.css
const colors = {
    darkBg: '#08090c',
    healthBannerBg: '#180f0a', // rgba(24, 18, 10, 0.82) on page-bg
    healthTitle: '#ffb84d',
    healthDetail: '#ffd9a8',
    healthCopyBtn: '#ffd9a8',
    // .health-copy-btn background, pre-composited (popup.css):
    //   #08090c page bg
    //   → rgba(24,18,10,0.82) banner base        = rgb(21,16,10)
    //   → rgba(255,169,58,0.06) gradient top stop = rgb(35,26,13)
    //     (top stop is the lightest point — worst case for light text)
    //   → rgba(255,169,58,0.08) button layer      = rgb(53,37,17)
    healthCopyBtnBg: '#352511',
    textPrimary: '#f4f6fb',
    textMuted: '#8f9bb0',
    // storage banner — red/orange lane distinct from amber TT lane.
    storageBannerBg: '#180c0c',     // rgba(24, 12, 12, 0.82) on page-bg
    storageBannerTitle: '#ff8585',
    storageBannerDetail: '#ffd0d0',
};

console.log('WCAG AA Contrast Audit (4.5:1 target for large text, 7:1 for body):\n');

const checks = [
    { name: 'Health Title (#ffb84d) on Health Banner', fg: colors.healthTitle, bg: colors.healthBannerBg, minRatio: 4.5 },
    { name: 'Health Detail (#ffd9a8) on Health Banner', fg: colors.healthDetail, bg: colors.healthBannerBg, minRatio: 4.5 },
    { name: 'Health Copy Btn Text (#ffd9a8) on Btn Bg', fg: colors.healthCopyBtn, bg: colors.healthCopyBtnBg, minRatio: 4.5 },
    { name: 'Primary Text (#f4f6fb) on Dark Bg', fg: colors.textPrimary, bg: colors.darkBg, minRatio: 7 },
    // new storage-banner color lane must also pass AA.
    { name: 'Storage Banner Title (#ff8585) on Storage Banner Bg', fg: colors.storageBannerTitle, bg: colors.storageBannerBg, minRatio: 4.5 },
    { name: 'Storage Banner Detail (#ffd0d0) on Storage Banner Bg', fg: colors.storageBannerDetail, bg: colors.storageBannerBg, minRatio: 4.5 },
];

let failures = 0;
for (const check of checks) {
    const ratio = parseFloat(contrast(check.fg, check.bg));
    const pass = ratio >= check.minRatio;
    const status = pass ? '✓' : '✗';
    console.log(`${status} ${check.name}`);
    console.log(`  Ratio: ${ratio}:1 (target: ${check.minRatio}:1)`);
    if (!pass) failures++;
}

// Drift guard: the ratios above are computed from the constants in this file,
// not from popup.css. Without a coupling check, editing a color in popup.css
// would leave this gate green forever. Verify each *solid* foreground/background
// literal still appears in popup.css so a color rename desyncs the constants and
// fails the gate (forcing a re-audit). The alpha-composited banner backgrounds
// (#180f0a, #352511, #180c0c) are pre-computed blends, not literal in the CSS,
// so they are excluded from this presence check.
const fs = require('fs');
const path = require('path');
const composited = new Set(['healthBannerBg', 'healthCopyBtnBg', 'storageBannerBg']);
const popupCssPath = path.join(__dirname, '..', 'extension', 'popup.css');
let popupCss = '';
try {
    popupCss = fs.readFileSync(popupCssPath, 'utf8').toLowerCase();
} catch (err) {
    console.log(`\n✗ Could not read popup.css for the color-sync check: ${err.message}`);
    failures++;
}
if (popupCss) {
    const missing = [];
    for (const [name, hex] of Object.entries(colors)) {
        if (composited.has(name)) continue;
        if (!popupCss.includes(hex.toLowerCase())) missing.push(`${name} (${hex})`);
    }
    if (missing.length) {
        console.log('\n✗ Contrast constants out of sync with popup.css — these solid');
        console.log('  colors are checked here but no longer present in popup.css:');
        for (const m of missing) console.log(`    ${m}`);
        console.log('  Re-audit the affected surface and update this file.');
        failures += missing.length;
    } else {
        console.log('\n✓ Solid color constants are present in popup.css.');
    }
}

if (failures > 0) {
    console.log(`\n⚠ ${failures} contrast issue(s) found.`);
    process.exit(1);
} else {
    console.log('\n✓ All contrast checks pass.');
    process.exit(0);
}
