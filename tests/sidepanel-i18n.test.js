'use strict';

// Sidepanel/Firefox-sidebar localization: the dashboard surface must route
// user-facing copy through the same t()/data-i18n conventions as popup.js,
// honour the manual `_localeOverride`, and keep <html lang>/<html dir>
// truthful for RTL locales (ar/he/fa/ur).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const sidepanelJs = fs.readFileSync(path.join(repoRoot, 'extension', 'sidepanel.js'), 'utf8');
const sidepanelHtml = fs.readFileSync(path.join(repoRoot, 'extension', 'sidepanel.html'), 'utf8');
const sidebarHtml = fs.readFileSync(path.join(repoRoot, 'extension', 'sidebar.html'), 'utf8');
const enMessages = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'extension', '_locales', 'en', 'messages.json'), 'utf8'
));

test('sidepanel.js defines the popup i18n helper surface', () => {
    assert.match(sidepanelJs, /function t\(key, fallback\)/,
        'sidepanel must define t(key, fallback)');
    assert.match(sidepanelJs, /function applyI18n\(root = document\)/,
        'sidepanel must define applyI18n for data-i18n markup');
    assert.match(sidepanelJs, /async function initI18n\(\)/,
        'sidepanel must resolve the manual locale override before rendering');
    assert.match(sidepanelJs, /_localeOverride/,
        'sidepanel must honour the popup language-dropdown override key');
    assert.match(sidepanelJs, /function applyDocumentLanguage\(\)/,
        'sidepanel must sync <html lang>/<html dir> to the resolved locale');
    assert.match(sidepanelJs, /RTL_LOCALES = new Set\(\['ar', 'he', 'fa', 'ur'\]\)/,
        'sidepanel must mirror the popup RTL locale set');
    assert.match(sidepanelJs, /RTL_LOCALES\.has\(base\) \? 'rtl' : 'ltr'/,
        'sidepanel must flip document.dir for RTL locales');
    assert.match(sidepanelJs, /initI18n\(\)\.then\(/,
        'i18n must initialize before the first refresh render');
});

test('sidepanel quick settings route labels and descriptions through locale keys', () => {
    const quickSettings = sidepanelJs.slice(
        sidepanelJs.indexOf('const QUICK_SETTINGS'),
        sidepanelJs.indexOf('function getSchema')
    );
    // Reused popup keys where copy is identical; sidepanel-specific spq_ keys otherwise.
    assert.match(quickSettings, /'qt_removeAllShorts_name'/,
        'identical copy must reuse existing popup locale keys');
    assert.match(quickSettings, /'spq_removeAllShorts_desc'/,
        'sidepanel-specific copy must use spq_ keys');
    assert.match(sidepanelJs, /quickLabel: t\(spec\[0\], spec\[1\]\)/,
        'quick labels must resolve through t() with the English fallback inline');
    assert.match(sidepanelJs, /quickDescription: t\(spec\[2\], spec\[3\]\)/,
        'quick descriptions must resolve through t() with the English fallback inline');
});

test('sidepanel.html and sidebar.html carry data-i18n markup that resolves in en messages', () => {
    for (const [label, html] of [['sidepanel.html', sidepanelHtml], ['sidebar.html', sidebarHtml]]) {
        const keys = [...html.matchAll(/data-i18n(?:-attr-[a-z-]+)?="([^"]+)"/g)].map((m) => m[1]);
        assert.ok(keys.length >= 30, `${label} must localize its static copy via data-i18n (found ${keys.length})`);
        for (const key of keys) {
            assert.ok(Object.prototype.hasOwnProperty.call(enMessages, key),
                `${label} data-i18n key "${key}" must exist in _locales/en/messages.json`);
        }
        assert.match(html, /data-i18n-attr-placeholder="spSettingsSearchPlaceholder"/,
            `${label} search placeholder must be localizable`);
    }
});

test('every t() key referenced by sidepanel.js resolves in en messages', () => {
    const keys = [...sidepanelJs.matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1]);
    assert.ok(keys.length >= 60, `sidepanel.js must route runtime copy through t() (found ${keys.length})`);
    for (const key of keys) {
        assert.ok(Object.prototype.hasOwnProperty.call(enMessages, key),
            `sidepanel.js t() key "${key}" must exist in _locales/en/messages.json`);
    }
});

test('sidepanel locale keys exist in every bundled locale', () => {
    const localesDir = path.join(repoRoot, 'extension', '_locales');
    const spKeys = Object.keys(enMessages).filter((k) => /^(sp[A-Z]|spq_|sidepanel|sidebar)/.test(k));
    assert.ok(spKeys.length >= 100, `expected the sidepanel key block in en (found ${spKeys.length})`);
    for (const locale of fs.readdirSync(localesDir)) {
        if (locale === 'en') continue;
        const messages = JSON.parse(fs.readFileSync(path.join(localesDir, locale, 'messages.json'), 'utf8'));
        for (const key of spKeys) {
            assert.ok(Object.prototype.hasOwnProperty.call(messages, key),
                `${locale} must define sidepanel key "${key}"`);
        }
    }
});
