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
    textPrimary: '#f4f6fb',
    textMuted: '#8f9bb0',
};

console.log('WCAG AA Contrast Audit (4.5:1 target for large text, 7:1 for body):\n');

const checks = [
    { name: 'Health Title (#ffb84d) on Health Banner', fg: colors.healthTitle, bg: colors.healthBannerBg, minRatio: 4.5 },
    { name: 'Health Detail (#ffd9a8) on Health Banner', fg: colors.healthDetail, bg: colors.healthBannerBg, minRatio: 4.5 },
    { name: 'Health Copy Btn Text (#ffd9a8) on Btn Bg', fg: colors.healthCopyBtn, bg: 'rgba(255, 169, 58, 0.08)', minRatio: 4.5 },
    { name: 'Primary Text (#f4f6fb) on Dark Bg', fg: colors.textPrimary, bg: colors.darkBg, minRatio: 7 },
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

if (failures > 0) {
    console.log(`\n⚠ ${failures} contrast issue(s) found.`);
    process.exit(1);
} else {
    console.log('\n✓ All contrast checks pass.');
    process.exit(0);
}
