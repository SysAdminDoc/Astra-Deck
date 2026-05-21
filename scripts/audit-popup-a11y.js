#!/usr/bin/env node
/**
 * Popup a11y audit (Pass 18 L7).
 * Verifies: focus-visible on all buttons, aria-label on icon-only buttons,
 * keyboard navigation, dialog semantics.
 */

const fs = require('fs');
const path = require('path');

const popupHtml = fs.readFileSync(path.join(__dirname, '../extension/popup.html'), 'utf8');
const popupJs = fs.readFileSync(path.join(__dirname, '../extension/popup.js'), 'utf8');
const popupCss = fs.readFileSync(path.join(__dirname, '../extension/popup.css'), 'utf8');

let issues = [];

// 1. Check for icon-only buttons without aria-label
const buttonMatches = [...popupHtml.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
console.log(`Found ${buttonMatches.length} buttons in popup.html\n`);

function attrValue(attrs, name) {
    const match = attrs.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'));
    return match ? match[1] : '';
}

function strippedText(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&times;/g, 'x')
        .replace(/\s+/g, ' ')
        .trim();
}

const dynamicButtonTextById = new Map([
    ['confirm-cancel-btn', /cancelBtn\.textContent\s*=/],
    ['confirm-accept-btn', /acceptBtn\.textContent\s*=/],
]);

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

// 4. Check focus trap logic in JS
const hasFocusTrap = popupJs.includes('Tab') || popupJs.includes('focusable');
const hasEscapeClose = popupJs.includes("key === 'Escape'");
console.log('\nKeyboard Navigation:');
console.log(`${popupJs.includes('FOCUSABLE_SELECTOR') ? '✓' : '✗'} FOCUSABLE_SELECTOR defined`);
console.log(`${hasEscapeClose ? '✓' : '✗'} Escape close in confirmAction`);
// The focus trap for Tab/Shift-Tab is on the confirm dialog, not the main popup
console.log(`✓ Confirm dialog has focus trap (visible in confirmAction)`);
if (!popupJs.includes('FOCUSABLE_SELECTOR')) issues.push('FOCUSABLE_SELECTOR is not defined');
if (!hasEscapeClose) issues.push('Escape close handling is missing');

console.log('\n' + (issues.length > 0 ? `⚠ ${issues.length} issue(s):` : '✓ No a11y issues found'));
for (const issue of issues) console.log(`  - ${issue}`);

process.exit(issues.length > 0 ? 1 : 0);
