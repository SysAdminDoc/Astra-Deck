'use strict';

// YouTube's 2026-10 side-panel watch page, from a live capture.
//
// tests/fixtures/watch-side-panel-2026-10.json was taken from live YouTube
// with the side-panel flags forced on. On that page ytd-watch-flexy stays,
// but the related list moves under the player, the comments section under
// the video is hidden, and comments render in an engagement panel inside
// #secondary. These tests run Astra's rules against the captured ancestor
// chains so a selector that only fits the classic page fails here first.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const capture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'watch-side-panel-2026-10.json'), 'utf8'));
const ytkit = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
const { LAYOUT_ATTRIBUTES, isSidePanelLayout } = require('../extension/core/classic-watch-layout.js');

// "div#related < div < div#below < ..." from the target element upward.
function parseChain(chain, extraAttributes = {}) {
    return chain.split(' < ').map((part, index) => {
        const tag = part.match(/^[a-z0-9-]+/)[0];
        const id = part.match(/#([\w-]+)/)?.[1] || '';
        const attrs = {};
        for (const [, name, value] of part.matchAll(/\[([\w-]+)=([^\]]+)\]/g)) attrs[name] = value;
        if (index === 0) Object.assign(attrs, extraAttributes);
        return { tag, id, attrs };
    });
}

// Compound selectors joined by descendant combinators: tag, #id, .class,
// [attr="value"] and :not([attr="value"]) / :not([attr]). Captured chains
// carry no classes, so a class never matches; any other :not() is ignored,
// which only widens tag matches the tests don't rely on.
function parseCompound(text) {
    const notAttrs = [...text.matchAll(/:not\(\[([\w-]+)(?:="([^"]*)")?\]\)/g)]
        .map(([, name, value]) => [name, value]);
    const bare = text.replace(/:not\([^)]*\)/g, '');
    return {
        tag: bare.match(/^[a-z][a-z0-9-]*/)?.[0] || null,
        id: bare.match(/#([\w-]+)/)?.[1] || null,
        hasClass: /\.[\w-]/.test(bare.replace(/\[[^\]]*\]/g, '')),
        attrs: [...bare.matchAll(/\[([\w-]+)="([^"]*)"\]/g)].map(([, name, value]) => [name, value]),
        notAttrs
    };
}

function compoundMatches(compound, element) {
    if (compound.hasClass) return false;
    if (!compound.tag && !compound.id && compound.attrs.length === 0) return false;
    if (compound.tag && compound.tag !== element.tag) return false;
    if (compound.id && compound.id !== element.id) return false;
    const excluded = compound.notAttrs.some(([name, value]) => (value === undefined
        ? Object.prototype.hasOwnProperty.call(element.attrs, name)
        : element.attrs[name] === value));
    return !excluded && compound.attrs.every(([name, value]) => element.attrs[name] === value);
}

function selectorMatchesChain(selector, chain) {
    const compounds = selector.trim().split(/\s+/).map(parseCompound);
    if (!compoundMatches(compounds[compounds.length - 1], chain[0])) return false;
    let level = 1;
    for (let i = compounds.length - 2; i >= 0; i -= 1) {
        while (level < chain.length && !compoundMatches(compounds[i], chain[level])) level += 1;
        if (level >= chain.length) return false;
        level += 1;
    }
    return true;
}

function cssFeatureSource(id) {
    const start = ytkit.indexOf(`cssFeature('${id}'`);
    assert.ok(start > -1, `${id} is a cssFeature`);
    const open = ytkit.indexOf('`', start);
    return ytkit.slice(open + 1, ytkit.indexOf('`', open + 1));
}

// The selector list inside "#secondary:not(:has(...))".
function secondaryExemptions(css) {
    const match = css.match(/#secondary:not\(:has\(([\s\S]*?)\)\)\s*\{\s*display:\s*none/);
    assert.ok(match, 'the right column collapses behind an exemption list');
    return match[1].split(/,(?![^\[]*\])/).map((part) => part.trim());
}

const CLASSIC_RELATED = 'div#related < div#secondary-inner < div#secondary < div#columns < ytd-watch-flexy < ytd-page-manager#page-manager';

test('the capture is the side-panel page: same element, related under the player, comments in a right-hand panel', () => {
    assert.match(capture.chains.related, /^div#related < .*div#below < .*div#primary < div#columns < ytd-watch-flexy/);
    assert.equal(capture.commentsHiddenUnderVideo, true);
    assert.match(capture.chains.commentsPanel,
        /^ytd-engagement-panel-section-list-renderer\[target-id=engagement-panel-comments-section\] < div#panels < div#secondary-inner < div#secondary < div#columns < ytd-watch-flexy/);
    assert.ok(capture.commentThreadsInPanel > 0);
    assert.equal(capture.commentThreadsInCommentsId, 0,
        'panel comments sit in a ytd-comments with no #comments id, so #comments-scoped rules miss them');
});

test('Hide Related Videos hides the related list wherever YouTube puts it', () => {
    const css = cssFeatureSource('hideRelatedVideos');
    const relatedRules = [...css.matchAll(/([^{}]+)\{\s*display:\s*none !important;\s*\}/g)]
        .map(([, selector]) => selector.trim())
        .filter((selector) => /#related$/.test(selector));
    assert.ok(relatedRules.length > 0);

    const sidePanel = parseChain(capture.chains.related);
    const classic = parseChain(CLASSIC_RELATED);
    assert.ok(relatedRules.some((selector) => selectorMatchesChain(selector, sidePanel)), 'side-panel page, under the player');
    assert.ok(relatedRules.some((selector) => selectorMatchesChain(selector, classic)), 'classic page, right column');
    // Proof the capture is what catches it: the old rule only knew the column.
    assert.equal(selectorMatchesChain('ytd-watch-flexy #secondary #related', sidePanel), false);
});

test('Hide Related Videos keeps the right column while YouTube has a panel open in it', () => {
    const exemptions = secondaryExemptions(cssFeatureSource('hideRelatedVideos'));
    const openPanel = parseChain(capture.chains.commentsPanel, { visibility: 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED' });
    const closedPanel = parseChain(capture.chains.commentsPanel, { visibility: 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN' });
    assert.ok(exemptions.some((selector) => selectorMatchesChain(selector, openPanel)),
        'an open comments panel keeps #secondary on screen');
    assert.equal(exemptions.some((selector) => selectorMatchesChain(selector, closedPanel)), false,
        'a closed panel does not');
    assert.ok(exemptions.includes('ytd-live-chat-frame:not([hidden])'), 'live chat still keeps it');
    // YouTube's ad panel (engagement-panel-ads, present on the captured
    // pages) opened in the column must not hold it open by itself.
    const adChain = capture.chains.commentsPanel.replace('target-id=engagement-panel-comments-section', 'target-id=engagement-panel-ads');
    assert.notEqual(adChain, capture.chains.commentsPanel);
    const openAdPanel = parseChain(adChain, { visibility: 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED' });
    assert.equal(exemptions.some((selector) => selectorMatchesChain(selector, openAdPanel)), false,
        'an open ad panel does not');
});

test('Focused Mode keeps the comments panel on the side-panel page', () => {
    const start = ytkit.indexOf("id: 'focusedMode'");
    assert.ok(start > -1);
    const block = ytkit.slice(start, ytkit.indexOf('injectStyle(css, this.id, true)', start));
    const exemptions = secondaryExemptions(block);
    const openPanel = parseChain(capture.chains.commentsPanel, { visibility: 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED' });
    assert.ok(exemptions.some((selector) => selectorMatchesChain(selector, openPanel)));
});

test('Classic Watch Layout strips every side-panel attribute the capture carries', () => {
    const sidePanelAttributes = capture.flexyAttributes.filter((name) => /split-scroll|fixed-|side-rail|using-fixed-panel/.test(name));
    assert.ok(sidePanelAttributes.length >= 6);
    for (const name of sidePanelAttributes) assert.ok(LAYOUT_ATTRIBUTES.includes(name), name);

    const attrs = new Set(capture.flexyAttributes);
    const flexy = { ...capture.flexyProperties, hasAttribute: (name) => attrs.has(name) };
    assert.equal(isSidePanelLayout(flexy), true);
});
