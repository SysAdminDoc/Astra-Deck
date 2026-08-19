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
const sidepanelCss = fs.readFileSync(path.join(repoRoot, 'extension', 'sidepanel.css'), 'utf8');
const sidepanelHtml = fs.readFileSync(path.join(repoRoot, 'extension', 'sidepanel.html'), 'utf8');
const sidebarHtml = fs.readFileSync(path.join(repoRoot, 'extension', 'sidebar.html'), 'utf8');
const a11ySmoke = fs.readFileSync(path.join(repoRoot, 'scripts', 'smoke-headless-a11y.js'), 'utf8');
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

test('side dashboard uses logical layout and reverses switch travel for RTL', () => {
    assert.match(sidepanelCss, /\.sp-search[\s\S]*padding-inline:\s*32px 58px/,
        'search reserves logical start/end space for its icon and clear action');
    assert.match(sidepanelCss, /\.sp-search-icon[\s\S]*inset-inline-start:\s*10px/,
        'search icon must anchor to inline-start');
    assert.match(sidepanelCss, /\.sp-search-clear[\s\S]*inset-inline-end:\s*5px/,
        'search clear action must anchor to inline-end');
    assert.match(sidepanelCss, /\.sp-empty[\s\S]*text-align:\s*start/,
        'empty-state copy must follow document direction');
    assert.match(sidepanelCss, /\.fp-ms,[\s\S]*text-align:\s*end/,
        'timing and health metadata must align to logical end');
    assert.match(sidepanelCss, /\.sp-settings-list[\s\S]*padding-inline-end:\s*2px/,
        'scrollbar breathing room must use a logical edge');
    assert.match(sidepanelCss, /\.sp-setting-switch::after[\s\S]*inset-inline-start:\s*2px/,
        'switch thumb must start from the locale inline-start');
    assert.match(sidepanelCss, /\[dir="rtl"\][\s\S]*--sp-switch-travel:\s*-14px/,
        'RTL checked switches must travel in the reverse direction');
    assert.doesNotMatch(sidepanelCss,
        /(?:^|\n)\s*(?:left|right|margin-left|margin-right|padding-left|padding-right)\s*:/,
        'side dashboard CSS must not reintroduce physical horizontal properties');
});

test('rendered smoke covers Arabic 200% reflow in sidepanel and Firefox sidebar shells', () => {
    assert.match(a11ySmoke, /name:\s*'sidepanel'[\s\S]*rtlLocales:\s*Object\.freeze\(\['ar'\]\)/,
        'sidepanel surface must opt into Arabic RTL smoke');
    assert.match(a11ySmoke, /name:\s*'sidebar'[\s\S]*page:\s*'sidebar-a11y\.html'[\s\S]*rtlLocales:\s*Object\.freeze\(\['ar'\]\)/,
        'Firefox sidebar shell must opt into the same Arabic RTL smoke');
    assert.match(a11ySmoke, /auditRtlLayout\(client,\s*surface,\s*locale\)/,
        'RTL smoke must assert control geometry, not only set dir=rtl');
    assert.match(a11ySmoke, /checkedTravel < 0/,
        'RTL smoke must prove checked switch travel reverses');
});

// ── CSS content: strings are unreachable by the messages pipeline ─────────

test('no dashboard or popup state text is rendered through CSS content:', () => {
    // `content: "Saving"` / `content: "Try again"` in sidepanel.css and
    // `content: 'on'` / `'off'` in popup.css rendered English in all ten
    // non-EN locales, and no amount of translation could have reached them.
    // Symbols (+, −, empty decorative boxes) are fine; words are not.
    const popupCss = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.css'), 'utf8');
    for (const [label, css] of [['sidepanel.css', sidepanelCss], ['popup.css', popupCss]]) {
        const wordy = [...css.matchAll(/(?:^|[\s;{])content:\s*(['"])(.*?)\1/g)]
            .map((m) => m[2])
            .filter((value) => /[A-Za-z]{2,}/.test(value));
        assert.deepEqual(wordy, [],
            `${label} must not render words through content: — they cannot be localized`);
    }
});

test('the side panel writes its save/retry state through t() into a real element', () => {
    assert.match(sidepanelJs, /state\.className = 'sp-setting-state'/,
        'the state must live in a real element the messages pipeline can fill');
    assert.match(sidepanelJs, /showState\(t\('spRowStateSaving', 'Saving'\)\)/,
        'the saving state must resolve through t()');
    assert.match(sidepanelJs, /showState\(t\('spRowStateRetry', 'Try again'\)\)/,
        'the retry state must resolve through t()');
    assert.match(sidepanelJs, /state\.setAttribute\('aria-hidden', 'true'\)/,
        'the row already carries the state on aria-description; do not announce it twice');
    assert.match(sidepanelCss, /\.sp-setting-state \{/,
        'the element needs the styling the ::after rules used to carry');
});

test('the popup schema switch writes its on/off word through t()', () => {
    const popupJs = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8');
    assert.match(popupJs, /t\('switchLabelOn', 'on'\)/);
    assert.match(popupJs, /t\('switchLabelOff', 'off'\)/);
    assert.match(popupJs, /btn\.textContent = stateWord;/,
        'the visible word must be real text, not generated content');
    assert.match(popupJs, /aria-label', visibleLabel \+ ' \(' \+ stateWord \+ '\)'/,
        'the accessible name must use the same localized word as the pill');
});

test('every locale carries the four new state keys, actually translated', () => {
    const locales = fs.readdirSync(path.join(repoRoot, 'extension', '_locales'));
    const keys = ['spRowStateSaving', 'spRowStateRetry', 'switchLabelOn', 'switchLabelOff'];
    for (const locale of locales) {
        const messages = JSON.parse(fs.readFileSync(
            path.join(repoRoot, 'extension', '_locales', locale, 'messages.json'), 'utf8'));
        for (const key of keys) {
            assert.ok(messages[key], `${locale} is missing ${key}`);
            if (locale === 'en') continue;
            assert.notEqual(messages[key].message, enMessages[key].message,
                `${locale}/${key} still reads English — the whole point of moving it out of CSS`);
        }
    }
});
