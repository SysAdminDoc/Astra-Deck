#!/usr/bin/env node
/**
 * Popup a11y audit (Pass 18 L7).
 * Verifies: focus-visible on all buttons, aria-label on icon-only buttons,
 * keyboard navigation, dialog semantics.
 */

const fs = require('fs');
const path = require('path');

const popupHtml = fs.readFileSync(
    process.env.ASTRA_POPUP_HTML_PATH || path.join(__dirname, '../extension/popup.html'),
    'utf8'
);
const popupJs = fs.readFileSync(
    process.env.ASTRA_POPUP_JS_PATH || path.join(__dirname, '../extension/popup.js'),
    'utf8'
);
const popupCss = fs.readFileSync(
    process.env.ASTRA_POPUP_CSS_PATH || path.join(__dirname, '../extension/popup.css'),
    'utf8'
);

let issues = [];

// 1. Check for icon-only buttons without aria-label
const buttonMatches = [...popupHtml.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
console.log(`Found ${buttonMatches.length} buttons in popup.html\n`);

function attrValue(attrs, name) {
    const match = attrs.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'));
    return match ? match[1] : '';
}

function stripHtmlTags(value) {
    let out = '';
    let inTag = false;
    for (const ch of String(value || '')) {
        if (ch === '<') {
            inTag = true;
            continue;
        }
        if (inTag) {
            if (ch === '>') inTag = false;
            continue;
        }
        out += ch;
    }
    return out;
}

function strippedText(html) {
    return stripHtmlTags(html)
        .replace(/&times;/g, 'x')
        .replace(/\s+/g, ' ')
        .trim();
}

// v4.47.0 NF14: the confirm-cancel-btn / confirm-accept-btn entries
// that lived here previously were retired alongside the confirm-shell
// modal. No remaining button in popup.html sets its text dynamically
// from JS without a static aria-label or visible text fallback.
const dynamicButtonTextById = new Map([]);

console.log('Button Accessibility Check:');
for (const match of buttonMatches) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    const id = attrValue(attrs, 'id') || '(anonymous button)';
    const ariaLabel = attrValue(attrs, 'aria-label');
    const hasAriaLabel = ariaLabel.trim().length > 0;
    const hasText = strippedText(body).length > 0;
    const hasDynamicText = dynamicButtonTextById.has(id) && dynamicButtonTextById.get(id).test(popupJs);
    const labeled = hasAriaLabel || hasText || hasDynamicText;
    const status = labeled ? '✓' : '✗';
    const labelKind = hasAriaLabel ? 'aria-label' : hasText ? 'text' : hasDynamicText ? 'dynamic text' : 'NO LABEL';
    console.log(`${status} ${id}: ${labelKind}`);
    if (!labeled) issues.push(`Button ${id} has no aria-label, visible text, or audited dynamic label`);
}

// 2. Check for focus-visible CSS coverage
const focusVisibleCss = [
    'button:focus-visible',
    '.toggle:focus-visible',
    '.health-copy-btn:focus-visible',
    '.health-clear-btn:focus-visible',
    '.cta-button:focus-visible',
    'input:focus-visible',
    'textarea:focus-visible',
    '[role="switch"]:focus-visible' // toggles have role="switch"
];

console.log('\nFocus-Visible CSS Coverage:');
for (const selector of focusVisibleCss) {
    const found = popupCss.includes(selector);
    const status = found ? '✓' : '✗';
    console.log(`${status} ${selector}`);
    if (!found) issues.push(`Missing focus-visible CSS selector: ${selector}`);
}

// 3. Check dialog semantics in HTML
console.log('\nDialog Semantics:');
const hasDialogRole = popupHtml.includes('role="dialog"');
const hasAriaModal = popupHtml.includes('aria-modal="true"');
const hasAriaLabelledBy = popupHtml.includes('aria-labelledby=');
console.log(`${hasDialogRole ? '✓' : '✗'} role="dialog" on popup body`);
console.log(`${hasAriaModal ? '✓' : '✗'} aria-modal="true" on popup body`);
console.log(`${hasAriaLabelledBy ? '✓' : '✗'} aria-labelledby="popup-title"` );
if (!hasDialogRole) issues.push('Popup body is missing role="dialog"');
if (!hasAriaModal) issues.push('Popup body is missing aria-modal="true"');
if (!hasAriaLabelledBy) issues.push('Popup body is missing aria-labelledby');

// 4. Check focus trap logic in JS. v4.47.0 NF14: the confirm-dialog
// modal was retired; the Escape close + Tab trap now apply to the
// popup body itself via handlePopupDialogKeydown.
const hasFocusTrap = popupJs.includes('Tab') || popupJs.includes('focusable');
const hasEscapeClose = popupJs.includes("key === 'Escape'");
console.log('\nKeyboard Navigation:');
console.log(`${popupJs.includes('FOCUSABLE_SELECTOR') ? '✓' : '✗'} FOCUSABLE_SELECTOR defined`);
console.log(`${hasEscapeClose ? '✓' : '✗'} Escape close on the popup body`);
console.log(`${hasFocusTrap ? '✓' : '✗'} Tab focus rotation on the popup body (handlePopupDialogKeydown)`);
if (!popupJs.includes('FOCUSABLE_SELECTOR')) issues.push('FOCUSABLE_SELECTOR is not defined');
if (!hasEscapeClose) issues.push('Escape close handling is missing');

// 5. Forced-colors focus lane.
//
// Every focus ring in popup.css is `outline: none` plus a box-shadow, and
// Windows High Contrast does not paint box-shadow. A control whose focus rule
// suppresses the outline therefore has NO focus indicator unless the
// `@media (forced-colors: active)` block restores one for that same selector.
//
// The list of selectors to check is DERIVED from popup.css rather than
// hand-maintained, so adding a new outline-suppressing focus rule fails this
// gate until its forced-colors lane exists. Selectors are compared verbatim
// because specificity decides the winner: a bare `input:focus-visible` in the
// forced-colors block does not beat `.some-panel input:focus-visible`
// declared earlier at higher specificity.
const forcedColorsStart = popupCss.indexOf('@media (forced-colors: active) {');
console.log('\nForced-colors focus lane:');
if (forcedColorsStart === -1) {
    issues.push('popup.css has no @media (forced-colors: active) block');
} else {
    let depth = 0;
    let cursor = popupCss.indexOf('{', forcedColorsStart);
    const blockStart = cursor;
    for (; cursor < popupCss.length; cursor += 1) {
        if (popupCss[cursor] === '{') depth += 1;
        else if (popupCss[cursor] === '}') {
            depth -= 1;
            if (depth === 0) break;
        }
    }
    const forcedColorsBlock = popupCss.slice(blockStart, cursor + 1);
    const outsideForcedColors = popupCss.slice(0, forcedColorsStart) + popupCss.slice(cursor + 1);

    // Whitespace inside a selector is significant (`.panel :focus-visible` is
    // a descendant rule, `.panel:focus-visible` is not), but the amount of it
    // is not. Normalise both sides the same way before comparing.
    // Comments must go first: a `/* ... */` block sitting above a rule is
    // otherwise glued onto its first selector by the matcher below.
    const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const normalizeSelector = (value) => value.replace(/\s+/g, ' ').trim();
    const focusSelectorsIn = (css) => {
        const out = new Set();
        const rule = /([^{}]+)\{([^}]*)\}/g;
        let hit;
        while ((hit = rule.exec(css)) !== null) {
            for (const part of hit[1].split(',')) {
                const selector = normalizeSelector(part);
                if (selector.endsWith(':focus-visible')) out.add(selector);
            }
        }
        return out;
    };

    const laneSelectors = focusSelectorsIn(stripComments(forcedColorsBlock));
    const uncovered = [];
    // Strip once: the loop below carries regex lastIndex across calls.
    const atRiskCss = stripComments(outsideForcedColors);
    const atRiskRule = /([^{}]+)\{([^}]*)\}/g;
    let match;
    while ((match = atRiskRule.exec(atRiskCss)) !== null) {
        const body = match[2];
        // Only rules that remove the outline AND rely on a shadow are at risk.
        if (!/outline:\s*(none|0)\b/.test(body) || !/box-shadow/.test(body)) continue;
        for (const part of match[1].split(',')) {
            const selector = normalizeSelector(part);
            if (!selector.endsWith(':focus-visible')) continue;
            if (!laneSelectors.has(selector) && !uncovered.includes(selector)) {
                uncovered.push(selector);
            }
        }
    }

    console.log(`${uncovered.length === 0 ? '\u2713' : '\u2717'} every outline-suppressing focus rule has a forced-colors lane`);
    for (const selector of uncovered) {
        issues.push(`No forced-colors focus lane for "${selector}" (its box-shadow ring is invisible in High Contrast)`);
    }
}

console.log('\n' + (issues.length > 0 ? `⚠ ${issues.length} issue(s):` : '✓ No a11y issues found'));
for (const issue of issues) console.log(`  - ${issue}`);

process.exit(issues.length > 0 ? 1 : 0);
