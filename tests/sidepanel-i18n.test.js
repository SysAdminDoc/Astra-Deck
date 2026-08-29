'use strict';

// Sidepanel/Firefox-sidebar localization: the dashboard surface must route
// user-facing copy through the same t()/data-i18n conventions as popup.js,
// honour the manual `_localeOverride`, and keep <html lang>/<html dir>
// truthful for RTL locales (ar/he/fa/ur).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadDeclarationsFrom, fakeTreeDocument } = require('./helpers/monolith');

const repoRoot = path.join(__dirname, '..');
const sidepanelJs = fs.readFileSync(path.join(repoRoot, 'extension', 'sidepanel.js'), 'utf8');
const sidepanelCss = fs.readFileSync(path.join(repoRoot, 'extension', 'sidepanel.css'), 'utf8');
const sidepanelHtml = fs.readFileSync(path.join(repoRoot, 'extension', 'sidepanel.html'), 'utf8');
const sidebarHtml = fs.readFileSync(path.join(repoRoot, 'extension', 'sidebar.html'), 'utf8');
const a11ySmoke = fs.readFileSync(path.join(repoRoot, 'scripts', 'smoke-headless-a11y.js'), 'utf8');
const enMessages = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'extension', '_locales', 'en', 'messages.json'), 'utf8'
));

// ── the i18n machinery, run ─────────────────────────────────────────────────
//
// These were eight regex reads of sidepanel.js. Every one of them is a
// behaviour: whether t() prefers the override map, whether applyI18n fills an
// attribute as well as text, whether a hostile stored locale is refused,
// whether <html dir> actually flips. The functions are plain declarations, so
// they are lifted out and driven.

const I18N_CHAIN = ['BUNDLED_LOCALES', 'BUNDLED_LOCALE_SET', 'isValidLocaleTag', 'RTL_LOCALES', 'I18N', 't', 'applyI18n'];

/** The sidepanel i18n helpers over a fake document and a fake extension API. */
function i18nUnder({ uiLanguage = 'en', getMessage = () => '', override = null, map = null } = {}) {
    const documentRef = fakeTreeDocument(() => null);
    const api = loadDeclarationsFrom(sidepanelJs, I18N_CHAIN, {
        document: documentRef,
        ext: { i18n: { getUILanguage: () => uiLanguage, getMessage } },
    });
    api.I18N.override = override;
    api.I18N.map = map;
    return { api, documentRef };
}

test('t() prefers the loaded override, then the browser catalogue, then the inline English', () => {
    const loaded = i18nUnder({ map: { spTitle: 'من اللوحة' }, getMessage: () => 'from browser' }).api;
    assert.equal(loaded.t('spTitle', 'Dashboard'), 'من اللوحة',
        'a manually chosen locale must win over the browser UI language');
    assert.equal(loaded.t('spOther', 'Dashboard'), 'from browser',
        'a key the override does not carry falls through to the browser catalogue');

    const bare = i18nUnder({ getMessage: () => '' }).api;
    assert.equal(bare.t('spTitle', 'Dashboard'), 'Dashboard',
        'and with no catalogue at all the inline English is what the user reads');
    assert.equal(bare.t('spTitle'), 'spTitle', 'a key with no fallback reads as itself, not as undefined');

    // An empty string from either source is not a translation.
    const empty = i18nUnder({ map: { spTitle: '' }, getMessage: () => '' }).api;
    assert.equal(empty.t('spTitle', 'Dashboard'), 'Dashboard');
});

test('t() survives a catalogue that throws rather than leaving the surface blank', () => {
    const angry = i18nUnder({ getMessage: () => { throw new Error('no i18n here'); } }).api;
    assert.equal(angry.t('spTitle', 'Dashboard'), 'Dashboard',
        'i18n is best-effort; a throwing host must not take the dashboard down');
});

test('applyI18n fills text and the three localizable attributes', () => {
    const { api, documentRef } = i18nUnder({
        map: {
            spTitle: 'Tableau de bord',
            spSearchPlaceholder: 'Rechercher',
            spCloseAria: 'Fermer',
            spHelpTitle: 'Aide',
        },
    });

    const heading = documentRef.createElement('h1');
    heading.setAttribute('data-i18n', 'spTitle');
    heading.textContent = 'Dashboard';

    const search = documentRef.createElement('input');
    search.setAttribute('data-i18n-attr-placeholder', 'spSearchPlaceholder');
    search.setAttribute('placeholder', 'Search');

    const close = documentRef.createElement('button');
    close.setAttribute('data-i18n-attr-aria-label', 'spCloseAria');
    close.setAttribute('aria-label', 'Close');

    const help = documentRef.createElement('span');
    help.setAttribute('data-i18n-attr-title', 'spHelpTitle');
    help.setAttribute('title', 'Help');

    const untranslated = documentRef.createElement('p');
    untranslated.setAttribute('data-i18n', 'spNoSuchKey');
    untranslated.textContent = 'Still English';

    const nodes = [heading, search, close, help, untranslated];
    const root = {
        querySelectorAll: (selector) =>
            nodes.filter((node) => node.getAttribute(String(selector).slice(1, -1)) !== null
                && node.getAttribute(String(selector).slice(1, -1)) !== undefined),
    };

    api.applyI18n(root);

    assert.equal(heading.textContent, 'Tableau de bord', 'text content is translated');
    assert.equal(search.getAttribute('placeholder'), 'Rechercher', 'so is a placeholder');
    assert.equal(close.getAttribute('aria-label'), 'Fermer', 'and an accessible name');
    assert.equal(help.getAttribute('title'), 'Aide', 'and a tooltip');
    assert.equal(untranslated.textContent, 'Still English',
        'a key with no translation keeps the inline English rather than blanking');
});

test('applyI18n called with no argument walks the document', () => {
    // sidepanel.js calls `applyI18n()` bare on every render, so the default
    // parameter is load-bearing: without it the call throws on
    // `undefined.querySelectorAll` and the whole panel stops rendering.
    const { api, documentRef } = i18nUnder({ map: { spTitle: 'Tableau de bord' } });

    const heading = documentRef.createElement('h1');
    heading.setAttribute('data-i18n', 'spTitle');
    heading.textContent = 'Dashboard';
    const nodes = [heading];
    documentRef.querySelectorAll = (selector) =>
        nodes.filter((node) => node.getAttribute(String(selector).slice(1, -1)) != null);

    assert.doesNotThrow(() => api.applyI18n(), 'the bare call is the one the panel makes');
    assert.equal(heading.textContent, 'Tableau de bord', 'and it has to reach the document');
});

test('the document language and direction follow the resolved locale', () => {
    const chain = [...I18N_CHAIN, 'applyDocumentLanguage'];
    const run = ({ uiLanguage, override }) => {
        const documentRef = fakeTreeDocument(() => null);
        documentRef.documentElement = {};
        const api = loadDeclarationsFrom(sidepanelJs, chain, {
            document: documentRef,
            ext: { i18n: { getUILanguage: () => uiLanguage, getMessage: () => '' } },
        });
        api.I18N.override = override;
        api.applyDocumentLanguage();
        return documentRef.documentElement;
    };

    for (const locale of ['ar', 'he', 'fa', 'ur']) {
        assert.equal(run({ uiLanguage: locale }).dir, 'rtl', `${locale} reads right to left`);
    }
    for (const locale of ['en', 'de', 'ja', 'pt_BR']) {
        assert.equal(run({ uiLanguage: locale }).dir, 'ltr', `${locale} does not`);
    }

    // A regional Arabic tag is still Arabic, and the tag itself is BCP-47.
    const regional = run({ uiLanguage: 'ar_EG' });
    assert.equal(regional.dir, 'rtl', 'the base subtag is what decides direction');
    assert.equal(regional.lang, 'ar-EG', 'and <html lang> must be a BCP-47 tag, not a Chrome locale id');

    // The manual override outranks the browser UI language.
    assert.equal(run({ uiLanguage: 'en', override: 'ar' }).dir, 'rtl',
        'choosing Arabic in the dropdown must flip the dashboard, whatever the browser is set to');
});

test('a stored locale override is loaded, and a hostile one is refused', async () => {
    const chain = [...I18N_CHAIN, 'initI18n'];
    const run = async (stored, { fetchImpl } = {}) => {
        const fetched = [];
        const api = loadDeclarationsFrom(sidepanelJs, chain, {
            document: fakeTreeDocument(() => null),
            ext: {
                i18n: { getUILanguage: () => 'en', getMessage: () => '' },
                storage: { local: { get: async () => ({ _localeOverride: stored }) } },
                runtime: { getURL: (relative) => `chrome-extension://x/${relative}` },
            },
            fetch: fetchImpl || (async (url) => {
                fetched.push(url);
                return { ok: true, json: async () => ({ spTitle: { message: 'Tableau de bord' } }) };
            }),
        });
        await api.initI18n();
        return { api, fetched };
    };

    const loaded = await run('fr');
    assert.equal(loaded.api.I18N.ready, true);
    assert.equal(loaded.api.I18N.override, 'fr');
    assert.equal(loaded.api.t('spTitle', 'Dashboard'), 'Tableau de bord',
        'the chosen catalogue has to actually reach t()');
    assert.deepEqual(loaded.fetched, ['chrome-extension://x/_locales/fr/messages.json']);

    for (const hostile of ['../../../etc/passwd', 'fr/../../x', 'zz', 'x'.repeat(40), '<script>', 'auto', '']) {
        const refused = await run(hostile);
        assert.equal(refused.fetched.length, 0, `${JSON.stringify(hostile)} must not be fetched`);
        assert.equal(refused.api.I18N.override, null, 'and must not become the active locale');
        assert.equal(refused.api.I18N.ready, true,
            'a refused override must still let the dashboard render');
    }

    // A catalogue that will not load leaves the surface on the browser locale
    // rather than half-applied.
    const missing = await run('fr', { fetchImpl: async () => ({ ok: false }) });
    assert.equal(missing.api.I18N.override, null);
    assert.equal(missing.api.I18N.ready, true);

    const broken = await run('fr', { fetchImpl: async () => { throw new Error('offline'); } });
    assert.equal(broken.api.I18N.ready, true, 'even a throwing fetch must not hang the render');
});

test('the first render waits for the locale to resolve', () => {
    // Ordering between initI18n and the first refresh, at module top level.
    // There is no way to observe it without booting the whole side panel.
    assert.match(sidepanelJs, /initI18n\(\)\.then\(/,
        'rendering before the override resolves paints English and then repaints');
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
