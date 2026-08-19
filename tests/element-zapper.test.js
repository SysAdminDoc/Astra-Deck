'use strict';

// The zapper's grammar is the whole feature.
//
// A picker that emits `.style-scope.ytd-rich-grid-renderer > div:nth-child(3)`
// produces a rule that works for a week. core/element-zapper.js only ever
// emits custom-element tag names, stable Polymer ids, and a curated list of
// structural attributes, and it re-parses stored selectors against that same
// grammar before they reach querySelectorAll — because rules travel in
// backups and a backup is untrusted input.
//
// The refusals carry as much weight as the derivation. Player, playlist,
// page container, Astra's own UI, and — the interesting one — the plain video
// card, whose only structural ancestor is a renderer shared by every card in
// the feed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

function loadZapper() {
    globalThis.YTKitCore = {};
    const src = fs.readFileSync(path.join(repoRoot, 'extension/core/element-zapper.js'), 'utf8');
    // eslint-disable-next-line no-eval
    (0, eval)(src);
    return globalThis.YTKitCore;
}

// Minimal element stand-in. The module is deliberately restricted to
// tagName / id / className / getAttribute / parentElement so this is enough.
function el(tagName, options = {}) {
    return {
        nodeType: 1,
        tagName: String(tagName).toUpperCase(),
        id: options.id || '',
        className: options.className || '',
        parentElement: null,
        _attrs: options.attrs || {},
        getAttribute(name) {
            return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null;
        }
    };
}

// Builds a parent chain from outermost to innermost and returns the leaf.
function chain(...nodes) {
    for (let i = 1; i < nodes.length; i += 1) nodes[i].parentElement = nodes[i - 1];
    return nodes[nodes.length - 1];
}

function homeShelfLeaf() {
    return chain(
        el('ytd-app'),
        el('ytd-browse', { attrs: { 'page-subtype': 'home' } }),
        el('ytd-rich-grid-renderer'),
        el('ytd-rich-section-renderer'),
        el('div'),
        el('span')
    );
}

// ── Derivation ──────────────────────────────────────────────────────────────

test('a click inside a shelf derives a scoped, structural selector', () => {
    const { deriveStructuralSelector } = loadZapper();
    const result = deriveStructuralSelector(homeShelfLeaf());
    assert.equal(result.ok, true);
    assert.equal(result.selector, 'ytd-browse[page-subtype="home"] ytd-rich-section-renderer');
    assert.equal(result.anchorKind, 'section');
    assert.equal(result.scoped, true);
    assert.equal(result.confidence, 'high');
});

test('no class ever reaches the emitted selector', () => {
    const { deriveStructuralSelector } = loadZapper();
    const leaf = chain(
        el('ytd-browse', { attrs: { 'page-subtype': 'subscriptions' } }),
        el('ytd-shelf-renderer', { className: 'style-scope ytd-item-section-renderer' }),
        el('div', { className: 'yt-simple-endpoint style-scope' })
    );
    const result = deriveStructuralSelector(leaf);
    assert.equal(result.ok, true);
    assert.doesNotMatch(result.selector, /\./, 'a class selector is exactly what goes stale on the next deploy');
    assert.equal(result.selector, 'ytd-browse[page-subtype="subscriptions"] ytd-shelf-renderer');
});

test('a generated-looking id is dropped rather than baked into the rule', () => {
    const { deriveStructuralSelector } = loadZapper();
    const stable = deriveStructuralSelector(chain(
        el('ytd-watch-flexy'),
        el('div', { id: 'secondary' }),
        el('ytd-merch-shelf-renderer')
    ));
    assert.equal(stable.selector, 'div#secondary ytd-merch-shelf-renderer');

    const generated = deriveStructuralSelector(chain(
        el('ytd-watch-flexy'),
        el('div', { id: 'panel384726' }),
        el('ytd-merch-shelf-renderer')
    ));
    assert.doesNotMatch(generated.selector, /panel384726/,
        'a digit run marks a generated id; it is dropped, not baked into the rule');
    assert.equal(generated.selector, 'ytd-watch-flexy ytd-merch-shelf-renderer',
        'the walk falls back to the enclosing page rather than inventing a scope');
});

test('localized attributes are not in the allowlist and never will be', () => {
    const { ELEMENT_ZAPPER_ALLOWED_ATTRIBUTES, deriveStructuralSelector } = loadZapper();
    for (const localized of ['aria-label', 'title', 'alt', 'placeholder', 'label']) {
        assert.ok(!ELEMENT_ZAPPER_ALLOWED_ATTRIBUTES.includes(localized),
            `${localized} is user-visible text — a rule built on it breaks in every other language`);
    }
    const result = deriveStructuralSelector(chain(
        el('ytd-browse', { attrs: { 'page-subtype': 'home' } }),
        el('ytd-shelf-renderer', { attrs: { 'aria-label': 'Breaking news', title: 'Breaking news' } })
    ));
    assert.doesNotMatch(result.selector, /aria-label|title/);
});

test('an attribute value with unsafe characters is skipped, not quoted around', () => {
    const { deriveStructuralSelector } = loadZapper();
    const result = deriveStructuralSelector(chain(
        el('ytd-browse', { attrs: { 'page-subtype': 'a"] , script' } }),
        el('ytd-shelf-renderer')
    ));
    assert.equal(result.ok, true);
    assert.equal(result.selector, 'ytd-browse ytd-shelf-renderer',
        'the value is dropped and the bare page scope kept; nothing from it reaches the selector');
    assert.doesNotMatch(result.selector, /script|"\]/);
});

// ── Refusals ────────────────────────────────────────────────────────────────

test('the player subtree is refused', () => {
    const { deriveStructuralSelector, ELEMENT_ZAPPER_REFUSAL_REASONS } = loadZapper();
    const byTag = deriveStructuralSelector(chain(el('ytd-watch-flexy'), el('ytd-player'), el('div')));
    assert.deepEqual(byTag, { ok: false, reason: ELEMENT_ZAPPER_REFUSAL_REASONS.PLAYER });

    const byId = deriveStructuralSelector(chain(el('ytd-watch-flexy'), el('div', { id: 'movie_player' }), el('div')));
    assert.equal(byId.reason, ELEMENT_ZAPPER_REFUSAL_REASONS.PLAYER);

    const byClass = deriveStructuralSelector(chain(el('div', { className: 'html5-video-player' }), el('div')));
    assert.equal(byClass.reason, ELEMENT_ZAPPER_REFUSAL_REASONS.PLAYER);
});

test('playlist item lists are refused for the same reason feed-prefilter protects them', () => {
    const { deriveStructuralSelector, ELEMENT_ZAPPER_REFUSAL_REASONS } = loadZapper();
    const result = deriveStructuralSelector(chain(
        el('ytd-watch-flexy'),
        el('ytd-playlist-panel-renderer'),
        el('ytd-playlist-panel-video-renderer'),
        el('div')
    ));
    assert.equal(result.reason, ELEMENT_ZAPPER_REFUSAL_REASONS.PLAYLIST);
});

test('a plain video card is refused and names itself, rather than hiding the whole feed', () => {
    const { deriveStructuralSelector, ELEMENT_ZAPPER_REFUSAL_REASONS } = loadZapper();
    const result = deriveStructuralSelector(chain(
        el('ytd-browse', { attrs: { 'page-subtype': 'home' } }),
        el('ytd-rich-grid-renderer'),
        el('ytd-rich-item-renderer'),
        el('ytd-rich-grid-media'),
        el('h3')
    ));
    assert.equal(result.ok, false);
    assert.equal(result.reason, ELEMENT_ZAPPER_REFUSAL_REASONS.VIDEO_CARD,
        'a rule on ytd-rich-item-renderer hides every card; that is Video Hider territory');
});

test('a click on a card inside a shelf snaps up to the shelf', () => {
    const { deriveStructuralSelector } = loadZapper();
    // The counterpart to the refusal above: the home grid has no section
    // renderer, so a card click there is refused — but a card inside a shelf
    // does have one, and removing the shelf is the thing the user meant.
    const result = deriveStructuralSelector(chain(
        el('ytd-browse', { attrs: { 'page-subtype': 'home' } }),
        el('ytd-rich-section-renderer'),
        el('ytd-rich-shelf-renderer', { attrs: { 'is-shorts': '' } }),
        el('ytd-rich-item-renderer'),
        el('ytd-rich-grid-media'),
        el('img')
    ));
    assert.equal(result.ok, true);
    assert.equal(result.selector, 'ytd-browse[page-subtype="home"] ytd-rich-shelf-renderer[is-shorts]');
    assert.equal(result.anchorKind, 'section');
});

test('Astra Deck cannot be used to zap Astra Deck', () => {
    const { deriveStructuralSelector, ELEMENT_ZAPPER_REFUSAL_REASONS } = loadZapper();
    const byClass = deriveStructuralSelector(chain(
        el('div', { className: 'ytkit-settings-panel' }),
        el('ytd-shelf-renderer')
    ));
    assert.equal(byClass.reason, ELEMENT_ZAPPER_REFUSAL_REASONS.OWN_UI);
});

test('a page container is never the target', () => {
    const { deriveStructuralSelector, ELEMENT_ZAPPER_REFUSAL_REASONS } = loadZapper();
    const result = deriveStructuralSelector(chain(el('ytd-app'), el('ytd-page-manager')));
    assert.equal(result.ok, false);
    assert.ok([
        ELEMENT_ZAPPER_REFUSAL_REASONS.TOO_BROAD,
        ELEMENT_ZAPPER_REFUSAL_REASONS.NO_ANCHOR
    ].includes(result.reason));
});

test('a non-element is refused before anything is read off it', () => {
    const { deriveStructuralSelector, ELEMENT_ZAPPER_REFUSAL_REASONS } = loadZapper();
    for (const value of [null, undefined, {}, { nodeType: 3 }, 'ytd-shelf-renderer']) {
        assert.equal(deriveStructuralSelector(value).reason, ELEMENT_ZAPPER_REFUSAL_REASONS.NOT_AN_ELEMENT);
    }
});

// ── Selector validation ─────────────────────────────────────────────────────

test('the grammar rejects everything it does not itself emit', () => {
    const { isStructuralSelector } = loadZapper();
    const rejected = [
        'ytd-shelf-renderer.style-scope',
        '.ytd-shelf-renderer',
        'ytd-browse > ytd-shelf-renderer',
        'ytd-browse + ytd-shelf-renderer',
        'ytd-shelf-renderer:nth-child(3)',
        'ytd-shelf-renderer:has(video)',
        '*',
        'ytd-shelf-renderer, ytd-app',
        'ytd-shelf-renderer[aria-label="News"]',
        'ytd-shelf-renderer[page-subtype="a"][role="x"][slot="y"][type="z"]',
        'YTD-SHELF-RENDERER',
        'ytd-shelf-renderer#Generated',
        'a b c d e',
        '',
        '   '
    ];
    for (const selector of rejected) {
        assert.equal(isStructuralSelector(selector), false, `${JSON.stringify(selector)} must be rejected`);
    }
});

test('the grammar accepts what derivation produces', () => {
    const { isStructuralSelector } = loadZapper();
    for (const selector of [
        'ytd-shelf-renderer',
        'ytd-browse[page-subtype="home"] ytd-rich-section-renderer',
        'div#secondary ytd-merch-shelf-renderer',
        'ytd-rich-shelf-renderer[is-shorts]'
    ]) {
        assert.equal(isStructuralSelector(selector), true, `${selector} must be accepted`);
    }
});

test('a refused tag cannot be smuggled in as a stored selector', () => {
    const { isStructuralSelector } = loadZapper();
    for (const selector of [
        'ytd-player',
        'ytd-app',
        'ytd-browse[page-subtype="home"] ytd-rich-item-renderer',
        'ytd-playlist-panel-video-renderer',
        'video',
        'ytkit-settings-panel'
    ]) {
        assert.equal(isStructuralSelector(selector), false,
            `${selector} would defeat the derive-time refusal if a hand-edited backup could carry it`);
    }
});

// ── Rules ───────────────────────────────────────────────────────────────────

test('rule sanitization drops invalid rows and de-duplicates by selector', () => {
    const { sanitizeZapperRules } = loadZapper();
    const rules = sanitizeZapperRules([
        { selector: 'ytd-shelf-renderer', label: 'Shelf' },
        { selector: 'ytd-shelf-renderer', label: 'Duplicate' },
        { selector: 'ytd-player' },
        { selector: '.evil' },
        null,
        'ytd-shelf-renderer',
        { selector: 'ytd-merch-shelf-renderer', enabled: false }
    ]);
    assert.deepEqual(rules.map((rule) => rule.selector), ['ytd-shelf-renderer', 'ytd-merch-shelf-renderer']);
    assert.equal(rules[0].label, 'Shelf');
    assert.equal(rules[0].enabled, true);
    assert.equal(rules[1].enabled, false);
});

test('rule labels are bounded and stripped of control characters', () => {
    const { sanitizeZapperRule } = loadZapper();
    const rule = sanitizeZapperRule({
        selector: 'ytd-shelf-renderer',
        label: `line one\nline   two${'x'.repeat(400)}`
    });
    assert.ok(rule.label.length <= 120);
    assert.doesNotMatch(rule.label, new RegExp('[\\u0000-\\u001f\\u007f]'),
        'a label is rendered into the rule list; control characters do not belong there');
    assert.match(rule.label, /^line one line two/);
});

test('the rule count is capped', () => {
    const { sanitizeZapperRules, ELEMENT_ZAPPER_MAX_RULES } = loadZapper();
    const many = Array.from({ length: ELEMENT_ZAPPER_MAX_RULES + 40 },
        (_, i) => ({ selector: `ytd-shelf-${i}-renderer` }));
    assert.equal(sanitizeZapperRules(many).length, ELEMENT_ZAPPER_MAX_RULES);
});

test('createZapperRule carries the derivation confidence through', () => {
    const { createZapperRule, deriveStructuralSelector } = loadZapper();
    const derivation = deriveStructuralSelector(homeShelfLeaf());
    const rule = createZapperRule(derivation, { label: 'Home shelf', surface: 'home', createdAt: 1755500000000 });
    assert.equal(rule.selector, 'ytd-browse[page-subtype="home"] ytd-rich-section-renderer');
    assert.equal(rule.confidence, 'high');
    assert.equal(rule.surface, 'home');
    assert.equal(rule.createdAt, 1755500000000);
    assert.equal(createZapperRule({ ok: false, reason: 'refused-player' }), null);
});

// ── Apply ───────────────────────────────────────────────────────────────────

function fakeRoot(matchesBySelector) {
    return {
        querySelectorAll(selector) {
            if (!Object.prototype.hasOwnProperty.call(matchesBySelector, selector)) return [];
            return matchesBySelector[selector];
        }
    };
}

test('matched nodes are collected once, with a per-rule report', () => {
    const { collectZapTargets, sanitizeZapperRules } = loadZapper();
    const shelfA = el('ytd-shelf-renderer');
    const shelfB = el('ytd-shelf-renderer');
    const root = fakeRoot({
        'ytd-shelf-renderer': [shelfA, shelfB],
        'ytd-merch-shelf-renderer': [shelfA]
    });
    const rules = sanitizeZapperRules([
        { selector: 'ytd-shelf-renderer' },
        { selector: 'ytd-merch-shelf-renderer' }
    ]);
    const { targets, report } = collectZapTargets(root, rules);
    assert.equal(targets.length, 2, 'a node matched by two rules is hidden once');
    assert.equal(report.applied, 2);
    assert.deepEqual(report.byRule.map((row) => row.hidden), [2, 0]);
});

test('a rule matching more than the cap is refused for the pass, not applied', () => {
    const { collectZapTargets, sanitizeZapperRules, ELEMENT_ZAPPER_MAX_MATCHES_PER_RULE } = loadZapper();
    const many = Array.from({ length: ELEMENT_ZAPPER_MAX_MATCHES_PER_RULE + 1 }, () => el('ytd-shelf-renderer'));
    const root = fakeRoot({ 'ytd-shelf-renderer': many });
    const { targets, report } = collectZapTargets(root, sanitizeZapperRules([{ selector: 'ytd-shelf-renderer' }]));
    assert.equal(targets.length, 0, 'fail open: a rule this broad is misfiring');
    assert.equal(report.refusedRules, 1);
    assert.equal(report.byRule[0].refused, true);
    assert.equal(report.byRule[0].matched, ELEMENT_ZAPPER_MAX_MATCHES_PER_RULE + 1);
});

test('apply-time refusal catches a node the derive-time refusal never saw', () => {
    const { collectZapTargets, sanitizeZapperRules } = loadZapper();
    // The selector is legal, but on this page it happens to match a node that
    // sits inside the player. Re-checking at apply time is the only thing that
    // catches it: derivation ran on a different page, or in an older build.
    const insidePlayer = chain(el('div', { id: 'movie_player' }), el('ytd-shelf-renderer'));
    const clean = el('ytd-shelf-renderer');
    const root = fakeRoot({ 'ytd-shelf-renderer': [insidePlayer, clean] });
    const { targets, report } = collectZapTargets(root, sanitizeZapperRules([{ selector: 'ytd-shelf-renderer' }]));
    assert.deepEqual(targets.map((entry) => entry.node), [clean]);
    assert.equal(report.refusedNodes, 1);
});

test('a disabled rule is skipped and an unparseable one is counted, not thrown', () => {
    const { collectZapTargets } = loadZapper();
    const root = fakeRoot({ 'ytd-shelf-renderer': [el('ytd-shelf-renderer')] });
    const { targets, report } = collectZapTargets(root, [
        { selector: 'ytd-shelf-renderer', enabled: false },
        { selector: '.evil', enabled: true }
    ]);
    assert.equal(targets.length, 0);
    assert.equal(report.skippedRules, 1);
    assert.equal(report.invalidRules, 1);
});

test('a root without querySelectorAll yields nothing instead of throwing', () => {
    const { collectZapTargets } = loadZapper();
    const { targets, report } = collectZapTargets(null, [{ selector: 'ytd-shelf-renderer' }]);
    assert.equal(targets.length, 0);
    assert.equal(report.skippedRules, 1);
});

// ── Persistence ─────────────────────────────────────────────────────────────
//
// Rules are portable user work, so they travel in backups — which makes the
// import boundary the place a hand-edited selector would arrive. The domain
// sanitizer must run the same grammar the picker does, not a generic clone.

const persisted = require('../extension/core/persisted-domains');

test('the zapper rule domain is registered as portable user data', () => {
    const domain = persisted.DURABLE_DOMAIN_REGISTRY.find((entry) => entry.id === 'elementZapperRules');
    assert.ok(domain, 'the registry is the single inventory of durable state');
    assert.equal(domain.backup, 'include');
    assert.equal(domain.key, 'ytkit-element-zapper-rules');
    assert.equal(domain.strategy, 'replace');
    assert.equal(domain.credentialScrub, 'not-applicable');
});

test('an imported backup cannot smuggle a selector the picker would refuse', () => {
    const sanitized = persisted.sanitizeDomainValue('elementZapperRules', [
        { selector: 'ytd-browse[page-subtype="home"] ytd-rich-section-renderer', label: 'News' },
        { selector: 'ytd-player' },
        { selector: 'ytd-rich-item-renderer' },
        { selector: 'div:has(video)' },
        { selector: 'ytkit-settings-panel' }
    ]);
    assert.deepEqual(sanitized.map((rule) => rule.selector),
        ['ytd-browse[page-subtype="home"] ytd-rich-section-renderer']);
});

test('the domain round-trips through the backup boundary', () => {
    const rules = [{ selector: 'ytd-merch-shelf-renderer', label: 'Merch', enabled: false }];
    const domains = persisted.buildIncludedDomainPayload(
        { 'ytkit-element-zapper-rules': rules },
        { transcriptIndex: [] }
    );
    assert.equal(domains.elementZapperRules.length, 1);
    assert.equal(domains.elementZapperRules[0].enabled, false);

    const writes = persisted.domainsToExtensionWrites(domains);
    assert.deepEqual(writes['ytkit-element-zapper-rules'], domains.elementZapperRules);

    const migrated = persisted.migrateBackup({
        exportVersion: persisted.BACKUP_EXPORT_VERSION,
        backupSchemaVersion: persisted.BACKUP_SCHEMA_VERSION,
        domains
    });
    assert.deepEqual(migrated.domains.elementZapperRules, domains.elementZapperRules);
});

test('a missing domain defaults to no rules rather than an object', () => {
    const domains = persisted.buildIncludedDomainPayload({}, { transcriptIndex: [] });
    assert.deepEqual(domains.elementZapperRules, []);
});
