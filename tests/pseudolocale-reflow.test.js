'use strict';

// The 320px reflow lane rendered ar/de/pt_BR, which are real translations and
// therefore only as long as they happen to be. The generator for a worst-case
// catalogue already existed (`npm run i18n:pseudolocale`) but its output was
// never wired into the smoke, so the widest string any surface could be asked
// to hold was never actually rendered.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const smoke = fs.readFileSync(path.join(repoRoot, 'scripts', 'smoke-headless-a11y.js'), 'utf8');
const popupJs = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8');
const { pseudolocalizeMessage, generatePseudolocale } = require('../scripts/generate-pseudolocale.js');

test('the pseudo-locale expands by roughly the 40% a translation can grow', () => {
    const source = 'Open the settings workspace on this tab';
    const expanded = pseudolocalizeMessage(source);
    const ratio = expanded.length / source.length - 1;
    assert.ok(ratio >= 0.35 && ratio <= 0.7,
        `expansion was ${(ratio * 100).toFixed(0)}%, which is not a worst case`);
});

test('placeholders survive expansion so the surface still renders real values', () => {
    const expanded = pseudolocalizeMessage('Saved under {videoId} at $TIME$');
    assert.match(expanded, /\{videoId\}/, 'a {token} must not be accented into nonsense');
    assert.match(expanded, /\$TIME\$/, 'a $NAME$ placeholder must survive too');
});

test('every message gets a catalogue entry', () => {
    const english = JSON.parse(fs.readFileSync(
        path.join(repoRoot, 'extension', '_locales', 'en', 'messages.json'), 'utf8'));
    const pseudo = generatePseudolocale(english);
    assert.equal(Object.keys(pseudo).length, Object.keys(english).length);
    for (const key of Object.keys(english)) {
        assert.notEqual(pseudo[key].message, english[key].message, `${key} was left as English`);
    }
});

test('the smoke stages the catalogue into the throwaway copy, never into extension/', () => {
    assert.match(smoke, /function stagePseudoLocale\(stageDir\)/);
    assert.match(smoke, /path\.join\(stageDir, '_locales', PSEUDO_LOCALE, 'messages\.json'\)/,
        'the catalogue must be written into the stage');
    // Defining the stager is not wiring it. Without this the function can sit
    // there unreferenced while the lane renders the real Spanish catalogue.
    const createStage = smoke.slice(
        smoke.indexOf('function createStage(stageDir) {'),
        smoke.indexOf('\n}', smoke.indexOf('function createStage(stageDir) {')));
    assert.match(createStage, /stagePseudoLocale\(stageDir\);/,
        'createStage must actually call the stager');
    assert.doesNotMatch(smoke, /_locales', PSEUDO_LOCALE[^)]*\)\s*,\s*'extension'/);
    // The shipped catalogue must stay untouched: a pseudo-locale in
    // extension/_locales would ship, and would break the locale-count facts.
    assert.equal(fs.existsSync(path.join(repoRoot, 'extension', '_locales', 'qps')), false);
    const bundled = fs.readdirSync(path.join(repoRoot, 'extension', '_locales'));
    assert.equal(bundled.length, 11, 'the shipped locale set must not have grown a pseudo entry');
});

test('the pseudo lane rides a bundled locale rather than widening the allowlist', () => {
    // popup.js and sidepanel.js reject any locale tag that is not bundled. That
    // is a shipped defence against a hostile _localeOverride, and a smoke lane
    // is not a reason to loosen it.
    assert.match(smoke, /const PSEUDO_LOCALE = 'es';/);
    assert.match(popupJs, /return BUNDLED_LOCALE_SET\.has\(locale\);/,
        'the allowlist must still be enforced');
    assert.match(popupJs, /'ar', 'en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pt_BR', 'ru', 'zh_CN'/,
        'and es must still be one of the bundled locales the lane borrows');
});

test('a missing staged catalogue fails loudly instead of rendering English', () => {
    assert.match(smoke, /the stage is missing _locales\/\$\{PSEUDO_LOCALE\}/,
        'an absent catalogue must not degrade into a silent real-copy pass');
});

test('the lane proves the pseudo copy actually rendered', () => {
    assert.match(smoke, /locale === PSEUDO_LOCALE && \(surface\.ownsDocument \|\| surface\.localizedInjectedCopy\)/,
        'the check must cover owned pages and localized injected surfaces');
    assert.match(smoke, /pseudo-locale copy did not render/,
        'a fallback to English must fail the lane, not pass it');
    assert.match(smoke, /grandfathered-literals backlog/,
        'the reason the remaining injected surfaces are exempt must be written down');
});

test('failures name the lane as pseudo, not as the locale it borrows', () => {
    assert.match(smoke, /const localeLabel = \(locale\) => \(locale === PSEUDO_LOCALE \? PSEUDO_LOCALE_LABEL : locale\);/);
    assert.match(smoke, /const label = localeLabel\(locale\);/);
    assert.match(smoke, /auditLocaleReflow\(client, surface, locale, `\$\{label\}\/reflow-320`\)/,
        '"es" in a failure would send the reader to the Spanish catalogue');
    assert.match(smoke, /320px reflow x ar\/de\/pt_BR\/pseudo/,
        'the pass banner must claim only what ran');
});

test('every surface runs the pseudo state', () => {
    assert.match(smoke, /const LOCALE_STATES = Object\.freeze\(\['ar', 'de', 'pt_BR', PSEUDO_LOCALE\]\);/);
    const surfaces = [...smoke.matchAll(/localeStates: LOCALE_STATES/g)];
    assert.equal(surfaces.length, 7, 'all seven primary surfaces must share the locale set');
});

test('Comment Search pseudo copy has browser-checked line spacing and separation', () => {
    assert.match(smoke, /surface\.name === 'comment-search' && locale === PSEUDO_LOCALE/);
    assert.match(smoke, /localized eyebrow gap is/);
    assert.match(smoke, /localized count gap is/);
    assert.match(smoke, /metrics\[key\]\.ratio < 1\.65/);
    assert.match(smoke, /metrics\.count\.ratio < 1\.45/);
});
