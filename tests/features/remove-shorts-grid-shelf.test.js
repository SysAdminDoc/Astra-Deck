'use strict';

// Remove Shorts and the 2026-10 Shorts grid shelf.
//
// YouTube's newer Shorts shelf is a grid-shelf-view-model that sits straight
// inside the ytd-item-section-renderer holding every other result (live
// search capture, tests/fixtures/shorts-grid-shelf-2026-10.html). The old
// hider walked from a Shorts link to its first ytd-* ancestor, which there
// is the whole section. findShortsHideTarget is the shipped walk, loaded out
// of ytkit.js and run against the fixture.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { selectorMatches, loadDeclarations } = require('../helpers/monolith');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const VOID_TAGS = new Set(['img', 'input', 'br', 'hr', 'meta', 'link']);
const ytkit = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'ytkit.js'), 'utf8');
const earlyCss = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'early.css'), 'utf8');
const { findShortsHideTarget } = loadDeclarations(['SHORTS_SECTION_CONTAINERS', 'findShortsHideTarget']);

function makeElement(tag, attrs, parent) {
    const element = {
        tag,
        tagName: tag.toUpperCase(),
        attrs,
        parent,
        children: [],
        get id() { return attrs.id || ''; },
        get parentElement() { return this.parent && this.parent.tag !== '#root' ? this.parent : null; },
        get ancestors() {
            const chain = [];
            for (let node = this.parent; node && node.tag !== '#root'; node = node.parent) chain.unshift(node);
            return chain;
        },
        getAttribute(name) {
            return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
        },
        matches(selector) {
            return selectorMatches(selector, this);
        },
        closest(selector) {
            for (let node = this; node && node.tag !== '#root'; node = node.parent) {
                if (selectorMatches(selector, node)) return node;
            }
            return null;
        },
        querySelectorAll(selector) {
            const found = [];
            const walk = (node) => {
                for (const child of node.children) {
                    if (selectorMatches(selector, child)) found.push(child);
                    walk(child);
                }
            };
            walk(this);
            return found;
        },
        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        }
    };
    return element;
}

function parseBlock(html) {
    const root = makeElement('#root', {}, null);
    let current = root;
    const token = /<!--[\s\S]*?-->|<\/([\w-]+)\s*>|<([\w-]+)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*\/?>|[^<]+/g;
    for (const match of html.matchAll(token)) {
        if (match[1]) {
            let node = current;
            while (node && node.tag !== match[1].toLowerCase()) node = node.parent;
            if (node && node.parent) current = node.parent;
        } else if (match[2]) {
            const attrs = {};
            match[3].replace(/([^\s=>]+)(?:="([^"]*)")?/g, (_, name, value) => {
                attrs[name] = value === undefined ? '' : value;
            });
            const node = makeElement(match[2].toLowerCase(), attrs, current);
            current.children.push(node);
            if (!VOID_TAGS.has(node.tag)) current = node;
        }
    }
    const top = root.children[0];
    assert.ok(top, 'fixture block must hold an element');
    return top;
}

function fixtureBlocks(file) {
    const html = fs.readFileSync(path.join(FIXTURES, file), 'utf8');
    const blocks = {};
    const marks = [...html.matchAll(/<!--\s*([^>]*?)\s*-->/g)].filter((mark) => mark[1] && !mark[1].includes('\n'));
    marks.forEach((mark, index) => {
        const end = index + 1 < marks.length ? marks[index + 1].index : html.length;
        const body = html.slice(mark.index + mark[0].length, end).trim();
        if (body) blocks[mark[1]] = parseBlock(body);
    });
    return blocks;
}

const blocks = fixtureBlocks('shorts-grid-shelf-2026-10.html');
const shortsLinks = (root) => root.querySelectorAll('a[href^="/shorts"]');

test('on search, a Shorts link in the grid shelf hides the shelf, never the results section around it', () => {
    const section = blocks['search: Shorts grid shelf inside the results section'];
    const links = shortsLinks(section);
    assert.equal(links.length, 4);
    for (const link of links) {
        const target = findShortsHideTarget(link);
        assert.equal(target.tag, 'grid-shelf-view-model');
        assert.notEqual(target, section);
    }
    // The capture's trap, shown directly: the first ytd-* ancestor of the
    // link is the section that also holds both regular results.
    let first = links[0].parentElement;
    while (first && !first.tagName.startsWith('YTD-')) first = first.parentElement;
    assert.equal(first, section);
    assert.equal(section.querySelectorAll('ytd-video-renderer').length, 2);
});

test('the same shelf in a Home rich section goes as a whole', () => {
    const section = blocks['home: Shorts grid shelf in a rich section (modeled)'];
    const [link] = shortsLinks(section);
    assert.equal(findShortsHideTarget(link).tag, 'grid-shelf-view-model');
});

test('a bare Short lockup in a list hides its own card, not the list', () => {
    const list = blocks['watch sidebar: bare Short lockup in the related list (modeled)'];
    const [link] = shortsLinks(list);
    const target = findShortsHideTarget(link);
    assert.equal(target.tag, 'yt-lockup-view-model');
    assert.equal(target.querySelector('a').getAttribute('href'), '/shorts/sidebar-short');
});

test('a grid shelf that also holds regular videos keeps them; only the Short card goes', () => {
    const section = blocks['grid shelf of regular videos (modeled)'];
    const [link] = shortsLinks(section);
    const target = findShortsHideTarget(link);
    assert.equal(target.tag, 'ytm-shorts-lockup-view-model');
});

test('older shapes keep their targets: a rich grid card, and a reel shelf as a whole', () => {
    const grid = blocks['home: Short as a rich grid card'];
    assert.equal(findShortsHideTarget(shortsLinks(grid)[0]).tag, 'ytd-rich-item-renderer');
    const reel = blocks['older reel shelf'];
    assert.equal(findShortsHideTarget(shortsLinks(reel)[0]).tag, 'ytd-reel-shelf-renderer');
    assert.equal(findShortsHideTarget(null), null);
});

test('the CSS layer names the grid shelf, Shorts-only, outside search', () => {
    const start = ytkit.indexOf("id: 'removeAllShorts'");
    assert.ok(start > -1);
    const block = ytkit.slice(start, ytkit.indexOf("injectStyle(css, this.id + '-style', true)", start));
    assert.match(block, /body:not\(\[data-ytkit-search-page\]\) grid-shelf-view-model:has\(ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2\):not\(:has\(yt-lockup-view-model\)\)/);
    assert.match(block, /const parent = findShortsHideTarget\(a\);/, 'the scan uses the shared walk');
    assert.match(earlyCss, /body\.ytkit-removeAllShorts ytd-browse grid-shelf-view-model:has\(ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2\):not\(:has\(yt-lockup-view-model\)\)/,
        'the document_start layer covers Home and Subscriptions before the runtime loads');
});

test('the shortsShelf selector pack lists the grid shelf host', () => {
    require('../../extension/core/selector-packs/shortsShelf.js');
    const pack = globalThis.YTKitCore.SurfacePackRegistry.get('shortsShelf');
    assert.ok([...pack.stable, ...pack.fallback].includes('grid-shelf-view-model.ytGridShelfViewModelHost'));
});
