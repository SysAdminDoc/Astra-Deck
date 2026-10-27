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
const { COMMENTS_PANEL_ROOT, findCommentsRoot, scopeCommentsCss } = require('../extension/core/styles.js');
const chatStyle = require('../extension/features/chat-style-comments/index.js');

// "div#related < div < div#below < ..." from the target element upward.
// Captured chains carry no classes; chains built here may add .class parts.
function parseChain(chain, extraAttributes = {}) {
    return chain.split(' < ').map((part, index) => {
        const tag = part.match(/^[a-z0-9-]+/)[0];
        const id = part.match(/#([\w-]+)/)?.[1] || '';
        const classes = [...part.replace(/\[[^\]]*\]/g, '').matchAll(/\.([\w-]+)/g)].map(([, name]) => name);
        const attrs = {};
        for (const [, name, value] of part.matchAll(/\[([\w-]+)=([^\]]+)\]/g)) attrs[name] = value;
        if (index === 0) Object.assign(attrs, extraAttributes);
        return { tag, id, classes, attrs };
    });
}

// Compound selectors joined by descendant combinators: tag, #id, .class,
// [attr="value"] and :not([attr="value"]) / :not([attr]). A class matches
// only a class the chain names; any other :not() is ignored, which only
// widens tag matches the tests don't rely on. Child combinators and other
// pseudo-classes never match, so rules using them aren't counted.
function parseCompound(text) {
    const notAttrs = [...text.matchAll(/:not\(\[([\w-]+)(?:="([^"]*)")?\]\)/g)]
        .map(([, name, value]) => [name, value]);
    const bare = text.replace(/:not\([^)]*\)/g, '');
    const outsideAttrs = bare.replace(/\[[^\]]*\]/g, '');
    return {
        tag: bare.match(/^[a-z][a-z0-9-]*/)?.[0] || null,
        id: bare.match(/#([\w-]+)/)?.[1] || null,
        classes: [...outsideAttrs.matchAll(/\.([\w-]+)/g)].map(([, name]) => name),
        pseudo: /:/.test(outsideAttrs) || /[>+~]/.test(outsideAttrs),
        attrs: [...bare.matchAll(/\[([\w-]+)="([^"]*)"\]/g)].map(([, name, value]) => [name, value]),
        notAttrs
    };
}

function compoundMatches(compound, element) {
    if (compound.pseudo) return false;
    if (!compound.classes.every((name) => (element.classes || []).includes(name))) return false;
    if (!compound.tag && !compound.id && compound.attrs.length === 0 && compound.classes.length === 0) return false;
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

// Splits a selector list on its top-level commas.
function splitSelectorList(list) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < list.length; i += 1) {
        if (list[i] === '(' || list[i] === '[') depth += 1;
        else if (list[i] === ')' || list[i] === ']') depth -= 1;
        else if (list[i] === ',' && depth === 0) {
            parts.push(list.slice(start, i).trim());
            start = i + 1;
        }
    }
    parts.push(list.slice(start).trim());
    return parts.filter(Boolean);
}

// ":is(A, B C) D" becomes "A D" and "B C D". Exact for the :is() lists
// these rules use, which stand alone or carry only a suffix.
function expandIs(selector) {
    const match = selector.match(/:is\(([^()]*)\)/);
    if (!match) return [selector];
    return splitSelectorList(match[1]).flatMap((alternative) => expandIs(
        selector.slice(0, match.index) + alternative + selector.slice(match.index + match[0].length)
    ));
}

function anyMatch(selector, chain) {
    return expandIs(selector).some((expanded) => selectorMatchesChain(expanded, chain));
}

// Every selector in a stylesheet, @media and @supports bodies included.
function cssSelectors(css) {
    return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{[^{}]*\}/g)]
        .flatMap(([, list]) => splitSelectorList(list.trim()));
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

// The same thread under the video on the classic page, and the panel's
// thread from the capture. Both end at <html> so html:not(...) gates apply.
const CLASSIC_THREAD = 'ytd-comment-thread-renderer < div#contents < ytd-item-section-renderer#sections < ytd-comments#comments < div < div#below < div#primary-inner < div#primary < div#columns < ytd-watch-flexy < ytd-page-manager#page-manager < div#content < ytd-app < body < html';
const PANEL_THREAD = `${capture.chains.commentThreadInPanel} < body < html`;
// Parts of a comment, from the element up to its thread, plus the header
// above the threads. Each is checked under both roots.
const COMMENT_PARTS = [
    '',
    'ytd-comment-view-model#comment < ',
    'ytd-comment-renderer#comment < ',
    'div#body < ytd-comment-view-model#comment < ',
    'yt-attributed-string#content-text < div#expander < div#main < div#body < ytd-comment-view-model#comment < ',
    'a#author-text < div#header-author < div#header < div#main < div#body < ytd-comment-view-model#comment < ',
    'div#author-thumbnail < div#body < ytd-comment-view-model#comment < ',
    'ytd-comment-engagement-bar < div#action-buttons < div#main < div#body < ytd-comment-view-model#comment < ',
    'ytd-comment-replies-renderer < div#replies < '
];
const rootUp = (thread) => thread.split(' < ').slice(2).join(' < ');
const THREAD_PAIRS = [
    ...COMMENT_PARTS.map((part) => [`${part}${CLASSIC_THREAD}`, `${part}${PANEL_THREAD}`]),
    [`ytd-comments-header-renderer < div#header < ${rootUp(CLASSIC_THREAD)}`, `ytd-comments-header-renderer < div#header < ${rootUp(PANEL_THREAD)}`]
].map(([classic, panel]) => [parseChain(classic), parseChain(panel)]);

// Each #comments-scoped rule that reaches a classic thread must reach the
// panel's thread once scoped. Rules that also name #below are Theater
// Split's pane and stay classic-only.
function assertRulesFollowThePanel(css, label) {
    let checked = 0;
    for (const selector of cssSelectors(css)) {
        if (!/#comments(?![\w-])/.test(selector) || /#below/.test(selector)) continue;
        for (const [classic, panel] of THREAD_PAIRS) {
            if (!anyMatch(selector, classic)) continue;
            checked += 1;
            assert.equal(anyMatch(selector, panel), false, `${label}: unscoped "${selector}" already reached the panel`);
            assert.ok(anyMatch(scopeCommentsCss(selector), panel), `${label}: "${selector}" misses the panel thread`);
        }
    }
    return checked;
}

test('the capture holds a panel thread chain inside the comments section panel', () => {
    assert.ok(PANEL_THREAD.startsWith('ytd-comment-thread-renderer < '));
    assert.ok(selectorMatchesChain(`${COMMENTS_PANEL_ROOT} ytd-comment-thread-renderer`, parseChain(PANEL_THREAD)));
    assert.equal(selectorMatchesChain('ytd-comments#comments ytd-comment-thread-renderer', parseChain(PANEL_THREAD)), false,
        'the panel root has no #comments id');
});

test('scopeCommentsCss adds the panel root without changing what a rule matches on the classic page', () => {
    const panelRoot = COMMENTS_PANEL_ROOT;
    assert.equal(scopeCommentsCss('#comments ytd-comment-view-model'), `:is(#comments,${panelRoot}) ytd-comment-view-model`);
    assert.equal(scopeCommentsCss('ytd-comments#comments{padding:0}'), `:is(ytd-comments#comments,${panelRoot}){padding:0}`);
    // A doubled id is a specificity bump. :is() keeps its most specific
    // argument, and the panel argument has no id, so the bump survives.
    assert.equal(scopeCommentsCss('ytd-comments#comments#comments #x'), `:is(ytd-comments#comments#comments,${panelRoot}) #x`);
    assert.equal(scopeCommentsCss('html:not([dark]) #comments.a,#comments>#b'),
        `html:not([dark]) :is(#comments,${panelRoot}).a,:is(#comments,${panelRoot})>#b`);
    for (const untouched of ['#comments-button', '#commentsx', 'ytd-comments ytd-comment-view-model', '.x#comments', 'a-#comments']) {
        assert.equal(scopeCommentsCss(untouched), untouched, untouched);
    }
    const once = scopeCommentsCss('#comments a, ytd-comments#comments b');
    assert.equal(scopeCommentsCss(once), once, 'running it twice changes nothing');
});

test('findCommentsRoot follows the comments to the panel when YouTube hides #comments', () => {
    const root = (name, { hidden = false, threads = false } = {}) => ({
        name,
        hasAttribute: (attribute) => attribute === 'hidden' && hidden,
        querySelector: (selector) => (selector === 'ytd-comment-thread-renderer' && threads ? {} : null)
    });
    const doc = (classic, panel) => ({
        querySelector: (selector) => (selector === 'ytd-comments#comments' ? classic
            : selector === COMMENTS_PANEL_ROOT ? panel : null)
    });
    const pick = (classic, panel) => findCommentsRoot(doc(classic, panel))?.name ?? null;
    assert.equal(pick(root('classic', { hidden: true }), root('panel', { threads: true })), 'panel', 'side-panel page');
    assert.equal(pick(root('classic', { hidden: true }), root('panel')), 'panel', 'side-panel page, panel still loading');
    assert.equal(pick(root('classic', { threads: true }), root('panel', { threads: true })), 'classic');
    assert.equal(pick(root('classic'), root('panel')), 'classic', 'classic page, comments still loading');
    assert.equal(pick(root('classic', { threads: true }), null), 'classic');
    assert.equal(pick(null, root('panel')), 'panel');
    assert.equal(pick(null, null), null);
});

test('Studio Comments styles the panel thread with every rule it gives a classic thread', () => {
    const css = [
        chatStyle.buildCommentRestyleCss(),
        chatStyle.buildPremiumCommentsCss(),
        chatStyle.buildPremiumInteractionCss(),
        chatStyle.buildSelectorSupportFallbackCss()
    ].join('\n');
    assert.ok(assertRulesFollowThePanel(css, 'Studio Comments') >= 15);

    const start = ytkit.indexOf("id: 'chatStyleComments'");
    const block = ytkit.slice(start, ytkit.indexOf("this.id + '-premium-2', true)", start));
    assert.ok(block.includes('this._styleElement = injectStyle(scopeCommentsCss(css), this.id, true);'));
    assert.ok(block.includes("injectStyle(scopeCommentsCss(premiumCss), this.id + '-premium', true)"));
    assert.ok(block.includes('injectStyle(scopeCommentsCss(premiumInteractionCss + selectorSupportFallbackCss)'));
    // The monolith's own fallback copies go through the same calls.
    const fallbackCss = [...block.matchAll(/`([^`]*)`/g)].map(([, text]) => text).join('\n');
    assert.ok(assertRulesFollowThePanel(fallbackCss, 'Studio Comments fallback') >= 15);
});

test('Studio Comments keeps text selection working inside the panel', () => {
    const previous = globalThis.YTKitCore;
    globalThis.YTKitCore = { ...(previous || {}), scopeCommentsCss };
    class FakeElement {
        constructor(selectorsMatched) { this.selectorsMatched = selectorsMatched; }
        closest(selector) {
            return splitSelectorList(selector).some((part) => this.selectorsMatched(part)) ? this : null;
        }
    }
    const previousElement = globalThis.Element;
    globalThis.Element = FakeElement;
    try {
        const commentChain = parseChain(`ytd-comment-view-model#comment < ${PANEL_THREAD}`);
        // The text node's element: the comment's #content-text inside the panel.
        const node = new FakeElement((part) => anyMatch(part, commentChain) || part === '#content-text');
        assert.equal(chatStyle.isCommentTextSelectionTarget(node), true);
    } finally {
        globalThis.Element = previousElement;
        if (previous === undefined) delete globalThis.YTKitCore;
        else globalThis.YTKitCore = previous;
    }
    assert.ok(ytkit.includes("node.closest(scopeCommentsCss('#comments ytd-comment-view-model, #comments ytd-comment-renderer'))"));
});

test('Comment Search builds its bar in the panel and styles it there', () => {
    const start = ytkit.indexOf("id: 'commentSearch'");
    const end = ytkit.indexOf("addNavigateRule('commentSearch'", start);
    const block = ytkit.slice(start, end);
    assert.match(block, /_getThreads\(\) \{\s*const comments = findCommentsRoot\(document\);/);
    assert.match(block, /_create\(\) \{\s*if \(!isWatchPagePath\(\)\) return;\s*const comments = findCommentsRoot\(document\);/);

    const open = block.indexOf('injectStyle(scopeCommentsCss(`');
    assert.ok(open > -1, 'the bar stylesheet goes through scopeCommentsCss');
    const css = block.slice(open + 'injectStyle(scopeCommentsCss(`'.length, block.indexOf('`), `${this.id}-ui`', open));
    const panelBar = parseChain(`div.ytkit-comment-search < div#header < ${rootUp(PANEL_THREAD)}`);
    const classicBar = parseChain(`div.ytkit-comment-search < div#header < ${rootUp(CLASSIC_THREAD)}`);
    const barRules = cssSelectors(css).filter((selector) => anyMatch(selector, classicBar));
    assert.ok(barRules.length >= 3);
    for (const selector of barRules) {
        if (/#below/.test(selector)) continue;
        assert.ok(anyMatch(scopeCommentsCss(selector), panelBar), selector);
    }
    // The mutation rule moves a bar left in the hidden #comments.
    const rule = ytkit.slice(end, ytkit.indexOf('this._scheduleCreate(3000);\n            },', end));
    assert.match(rule, /if \(root && this\._bar && !root\.contains\(this\._bar\)\) \{\s*(?:\/\/[^\n]*\n\s*)*this\._bar\.remove\(\);\s*this\._bar = null;/);
});

test('Comment Search still filters while the side-panel page mutates nonstop', (t) => {
    // The side-panel page fires the mutation rule about every 36 ms, and the
    // rule asks for a filter run each time. A debounce that restarts its
    // timer on every ask never runs: the bar sat at "0 threads" and typing
    // hid nothing.
    const start = ytkit.indexOf("id: 'commentSearch'");
    const method = ytkit.slice(start).match(/_scheduleApply\(delay = 140\) \{[\s\S]*?\n {12}\},/);
    assert.ok(method, '_scheduleApply found');
    // eslint-disable-next-line no-eval
    const feature = eval(`({ _applyTimer: null, runs: 0, _applyFilter() { this.runs += 1; }, ${method[0]} })`);
    t.mock.timers.enable({ apis: ['setTimeout'] });
    for (let i = 0; i < 40; i += 1) {
        feature._scheduleApply(160);
        t.mock.timers.tick(36);
    }
    assert.ok(feature.runs >= 5, `filter ran ${feature.runs} times in 1.4 seconds of steady asks`);
    t.mock.timers.tick(500);
    const settled = feature.runs;
    t.mock.timers.tick(500);
    assert.equal(feature.runs, settled, 'no run without an ask');
});

test('no comments rule brings back the #comments YouTube hid under the video', () => {
    const hiddenRoot = parseChain(capture.chains.comments, { hidden: '' });
    const shownRoot = parseChain(capture.chains.comments);
    const forcesDisplay = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, , body]) => /display:\s*(?!none)[\w-]+\s*!important/.test(body))
        .flatMap(([, list]) => splitSelectorList(list.trim()));
    const focused = ytkit.slice(ytkit.indexOf("id: 'focusedMode'"));
    const sheets = {
        'Studio Comments': scopeCommentsCss(chatStyle.buildPremiumCommentsCss()),
        'Focused Mode': focused.slice(0, focused.indexOf('injectStyle(css, this.id, true)'))
    };
    for (const [label, css] of Object.entries(sheets)) {
        const selectors = forcesDisplay(css);
        assert.ok(selectors.some((selector) => anyMatch(selector, shownRoot)), `${label} still shows a visible #comments`);
        const offender = selectors.find((selector) => anyMatch(selector, hiddenRoot));
        assert.equal(offender, undefined, `${label} forces the hidden #comments back on screen`);
    }
});

test('Comment Filter scans the panel root and its thread selectors match the panel thread', () => {
    require('../extension/core/selector-packs/comments.js');
    const pack = globalThis.YTKitCore.SurfacePackRegistry.get('comments');
    const panelThread = parseChain(PANEL_THREAD);
    assert.ok([...pack.hooks.thread.stable, ...pack.hooks.thread.fallback].some((selector) => selectorMatchesChain(selector, panelThread)));

    const start = ytkit.indexOf("id: 'commentFilterManager'");
    const block = ytkit.slice(start, ytkit.indexOf('_threadSelectorGroup()', start));
    assert.match(block, /_findCommentRoot\(\) \{[\s\S]*?const active = findCommentsRoot\(document\);\s*if \(active\) return active;/);
});
