'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const zeroAdDom = require(path.join(repoRoot, 'extension/core/zero-ad-dom.js'));

function fakeElement({
    tagName = 'DIV',
    id = '',
    className = '',
    href = '',
    attributes = {},
    rect = { width: 400, height: 180 },
    links = [],
    organicCards = [],
    closest = () => null
} = {}) {
    const attrs = { ...attributes };
    if (href) attrs.href = href;
    return {
        nodeType: 1,
        tagName,
        id,
        className,
        href,
        parentElement: null,
        ownerDocument: { location: { href: 'https://www.youtube.com/watch?v=test' } },
        getAttribute(name) {
            return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
        },
        hasAttribute(name) {
            return Object.prototype.hasOwnProperty.call(attrs, name);
        },
        setAttribute(name, value) {
            attrs[name] = String(value);
        },
        removeAttribute(name) {
            delete attrs[name];
        },
        getBoundingClientRect() {
            return { x: 0, y: 0, ...rect };
        },
        matches(selector) {
            return selector === 'a[href]' && tagName === 'A' && !!href;
        },
        querySelectorAll(selector) {
            if (selector === 'a[href]') return links;
            if (selector.includes('ytd-compact-video-renderer')) return organicCards;
            return [];
        },
        closest
    };
}

function connect(parent, child) {
    child.parentElement = parent;
    return child;
}

test('semantic sponsored badge parsing is exact, domain-aware, and localized', () => {
    assert.deepEqual(
        zeroAdDom.parseSponsoredBadgeText(' Sponsored · base44.com '),
        { text: 'Sponsored · base44.com', label: 'sponsored', domainHint: 'base44.com' }
    );
    assert.equal(zeroAdDom.parseSponsoredBadgeText('Gesponsert')?.label, 'gesponsert');
    assert.equal(zeroAdDom.parseSponsoredBadgeText('スポンサー')?.label, 'スポンサー');
    assert.equal(zeroAdDom.parseSponsoredBadgeText('Patrocinado • example.org')?.domainHint, 'example.org');
    assert.equal(zeroAdDom.parseSponsoredBadgeText('Sponsored content'), null);
    assert.equal(zeroAdDom.parseSponsoredBadgeText('This video is sponsored'), null);
    assert.equal(zeroAdDom.parseSponsoredBadgeText('SponsorBlock'), null);
    assert.equal(zeroAdDom.parseSponsoredBadgeText('Sponsored · invalid-domain'), null);
});

test('semantic ad destination detection protects YouTube links and unwraps redirects', () => {
    assert.equal(zeroAdDom.isAdDestinationHref('/watch?v=abc'), false);
    assert.equal(zeroAdDom.isAdDestinationHref('https://youtu.be/abc'), false);
    assert.equal(zeroAdDom.isAdDestinationHref('https://base44.com/start'), true);
    assert.equal(zeroAdDom.isAdDestinationHref('https://googleads.g.doubleclick.net/pagead/id'), true);
    assert.equal(zeroAdDom.isAdDestinationHref(
        'https://www.youtube.com/redirect?q=https%3A%2F%2Fexample.org%2Foffer'
    ), true);
    assert.equal(zeroAdDom.isAdDestinationHref('javascript:void(0)'), false);
});

test('fallback shell selection requires semantic ad evidence inside the related rail', () => {
    const rail = fakeElement({ tagName: 'YTD-WATCH-NEXT-SECONDARY-RESULTS-RENDERER', rect: { width: 420, height: 900 } });
    const externalLink = fakeElement({ tagName: 'A', href: 'https://base44.com/start' });
    const card = fakeElement({ rect: { width: 410, height: 220 }, links: [externalLink] });
    const badge = fakeElement({ rect: { width: 86, height: 18 } });
    connect(rail, card);
    connect(card, badge);
    rail.contains = (element) => [rail, card, badge].includes(element);

    const info = zeroAdDom.parseSponsoredBadgeText('Sponsored');
    assert.equal(zeroAdDom.findSemanticAdShell(badge, info, rail), card);

    const youtubeLink = fakeElement({ tagName: 'A', href: 'https://www.youtube.com/watch?v=abc' });
    const organicCard = fakeElement({ rect: { width: 410, height: 110 }, links: [youtubeLink] });
    const organicBadge = fakeElement({ rect: { width: 120, height: 18 } });
    connect(rail, organicCard);
    connect(organicCard, organicBadge);
    rail.contains = (element) => [rail, organicCard, organicBadge].includes(element);
    assert.equal(zeroAdDom.findSemanticAdShell(organicBadge, info, rail), null);
});

test('known YouTube ad shells remain eligible without URL heuristics', () => {
    const rail = fakeElement({ tagName: 'YTD-WATCH-NEXT-SECONDARY-RESULTS-RENDERER' });
    const knownShell = fakeElement({ tagName: 'YTD-AD-SLOT-RENDERER' });
    const badge = fakeElement({ closest: () => knownShell });
    connect(rail, knownShell);
    connect(knownShell, badge);
    rail.contains = (element) => [rail, knownShell, badge].includes(element);
    assert.equal(
        zeroAdDom.findSemanticAdShell(badge, zeroAdDom.parseSponsoredBadgeText('Sponsored'), rail),
        knownShell
    );
});

test('an already hidden semantic shell stays marked while its ad evidence remains', () => {
    const rail = fakeElement({ tagName: 'YTD-WATCH-NEXT-SECONDARY-RESULTS-RENDERER' });
    const markedShell = fakeElement({
        attributes: { 'data-ytkit-zero-ad-semantic': '1' },
        rect: { width: 0, height: 0 },
        links: [fakeElement({ tagName: 'A', href: 'https://example.org/offer' })]
    });
    const badge = fakeElement({
        rect: { width: 0, height: 0 },
        closest: (selector) => selector === '[data-ytkit-zero-ad-semantic]' ? markedShell : null
    });
    connect(rail, markedShell);
    connect(markedShell, badge);
    rail.contains = (element) => [rail, markedShell, badge].includes(element);
    assert.equal(
        zeroAdDom.findSemanticAdShell(badge, zeroAdDom.parseSponsoredBadgeText('Sponsored'), rail),
        markedShell
    );
});

test('semantic zero-ad runtime ships in extension and userscript startup paths', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'extension/manifest.json'), 'utf8'));
    const normalRuntime = manifest.content_scripts.find((entry) =>
        Array.isArray(entry['x-ytkit-runtime-modules']));
    const modules = normalRuntime['x-ytkit-runtime-modules'];
    assert.ok(modules.includes('core/zero-ad-dom.js'));
    assert.ok(modules.indexOf('core/zero-ad-dom.js') < modules.indexOf('core/element-zapper.js'));

    const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources || []);
    assert.ok(resources.includes('core/zero-ad-dom.js'));

    const earlyCss = fs.readFileSync(path.join(repoRoot, 'extension/early.css'), 'utf8');
    const userscript = fs.readFileSync(path.join(repoRoot, 'YTKit.user.js'), 'utf8');
    const syncSource = fs.readFileSync(path.join(repoRoot, 'sync-userscript.js'), 'utf8');
    for (const source of [earlyCss, userscript]) {
        assert.match(source, /\[data-ytkit-zero-ad-semantic\]/);
    }
    assert.match(syncSource, /'extension\/core\/zero-ad-dom\.js'/);
});
