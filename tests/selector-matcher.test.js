'use strict';

// `selectorMatches` decides what five fixtures hand back, so every production
// selector those fixtures pin is only as strong as this. It has already been
// wrong twice in ways that mattered:
//
//   * `~=` and `|=` were accepted by the grammar and compared by nothing, so
//     they fell through to "match". A selector narrowed to
//     `button[aria-label~="NOPE"]` then matched any node that merely HAD an
//     aria-label, and the planned-livestream button list — the feature's whole
//     contact surface with the DOM — could be replaced with a selector that
//     matches nothing in a browser while every test stayed green.
//   * Compounds were split on whitespace before parsing, which tore
//     `[aria-label*="Action menu"]` in half. Neither half parsed, so the
//     selector read as "matches nothing": a silent false negative, which is
//     the worst way for a fixture to be wrong.
//
// The rule this file holds: match what a browser matches, and refuse anything
// the grammar does not cover. Refusing is safe, because a fixture that stops
// answering makes its test fail loudly. Matching-by-accident is not.

const test = require('node:test');
const assert = require('node:assert/strict');

const { selectorMatches } = require('./helpers/monolith');

const check = (selector, node, expected, why) =>
    assert.equal(selectorMatches(selector, node), expected,
        `${JSON.stringify(selector)}: ${why}`);

test('a space-separated attribute operator compares the token list', () => {
    check('div[class~="alpha"]', { tag: 'div', className: 'zzz alpha beta' }, true,
        'the token is in the list');
    check('div[class~="alpha"]', { tag: 'div', className: 'zzz' }, false,
        'presence of the attribute is not a match');
    check('div[class~="alpha"]', { tag: 'div', className: 'alphabet' }, false,
        'and a longer token is a different token');
    check('button[aria-label~="NOPE"]', { tag: 'button', attrs: { 'aria-label': 'Notify me' } }, false,
        'this is the shape that left a shipped selector list unpinned');
});

test('a hyphen-prefix attribute operator matches the subtag, not the substring', () => {
    check('div[lang|="en"]', { tag: 'div', attrs: { lang: 'en' } }, true, 'exact');
    check('div[lang|="en"]', { tag: 'div', attrs: { lang: 'en-GB' } }, true, 'or a subtag of it');
    check('div[lang|="en"]', { tag: 'div', attrs: { lang: 'english' } }, false,
        'a longer word that merely starts the same is not a subtag');
    check('div[lang|="en"]', { tag: 'div', attrs: { lang: 'fr' } }, false, 'and an unrelated value is not');
});

test('every other attribute operator compares the way it reads', () => {
    const node = { tag: 'div', attrs: { title: 'Open the menu' } };
    check('div[title="Open the menu"]', node, true, 'exact');
    check('div[title="Open"]', node, false, 'exact is exact');
    check('div[title*="the"]', node, true, 'substring');
    check('div[title^="Open"]', node, true, 'prefix');
    check('div[title^="the"]', node, false, 'a prefix must be at the front');
    check('div[title$="menu"]', node, true, 'suffix');
    check('div[title$="the"]', node, false, 'a suffix must be at the end');
    check('div[title]', node, true, 'presence alone, when that is all that was asked');
    check('div[missing]', node, false, 'and an absent attribute is not present');
});

test('an attribute value containing a space is not torn in half', () => {
    // Both of these are shipped selectors in the monolith.
    check('#menu button[aria-label*="Action menu"]',
        {
            tag: 'button',
            attrs: { 'aria-label': 'Action menu for this video' },
            ancestors: [{ id: 'menu' }],
        }, true, 'the quoted space belongs to the value, not to a combinator');
    check('#menu button[aria-label*="Action menu"]',
        { tag: 'button', attrs: { 'aria-label': 'Share' }, ancestors: [{ id: 'menu' }] },
        false, 'and it still has to actually match');
    check('[style*="display: none"]', { tag: 'div', attrs: { style: 'display: none;' } }, true,
        'so does a colon and a space');
    check('[style*="display: none"]', { tag: 'div', attrs: { style: 'display: block;' } }, false);
});

test('a comma inside an attribute value does not split the selector list', () => {
    // The same bug as the whitespace one, one level up: `split(',')` tears
    // `[aria-label="Share, copy link"]` in half, neither half parses, and the
    // whole selector silently reads as "matches nothing".
    const share = { tag: 'button', attrs: { 'aria-label': 'Share, copy link' } };
    check('button[aria-label="Share, copy link"]', share, true, 'the comma belongs to the value');
    check('button[aria-label="Other, thing"]', share, false, 'and it still has to match');
    check('[data-x="a,b"]', { tag: 'div', attrs: { 'data-x': 'a,b' } }, true);
    check('[data-x="a,b"]', { tag: 'div', attrs: { 'data-x': 'a' } }, false);

    // A real list still splits, including a stray empty branch.
    check('a, button', share, true, 'the second branch');
    check('a, , button', share, true, 'an empty branch is skipped, not fatal');
    check('a, span', share, false);
});

test('a descriptor may spell class and id either way', () => {
    check('.alpha', { tag: 'div', attrs: { class: 'alpha beta' } }, true, 'attrs.class');
    check('.alpha', { tag: 'div', className: 'alpha beta' }, true, 'or className');
    check('.alpha', { tag: 'div', attrs: { class: 'beta' } }, false);
    check('#thumb', { tag: 'div', id: 'thumb' }, true, 'node.id');
    check('#thumb', { tag: 'div', attrs: { id: 'thumb' } }, true, 'or attrs.id');
    check('[class~="alpha"]', { tag: 'div', className: 'alpha' }, true,
        'and a selector may reach the same value the other way round');
});

test('the universal selector matches, and matches only as a compound', () => {
    check('*', { tag: 'div' }, true, 'anything');
    check('div *', { tag: 'span', ancestors: [{ tag: 'div' }] }, true, 'a descendant of a div');
    check('div *', { tag: 'span', ancestors: [{ tag: 'p' }] }, false, 'but not of a p');
});

test('anything the grammar does not cover refuses rather than matching', () => {
    // Refusing is the safe failure: the fixture stops answering and its test
    // goes red. Matching by accident is how a selector stops being pinned.
    const div = { tag: 'div', attrs: { attr: 'v', unclosed: 'x' }, ancestors: [{ tag: 'div' }] };
    for (const selector of [
        'div > span', 'div ~ span', 'div:hover', 'div::after', 'div:nth-child(2)',
        "div[attr='v']", 'div[attr=v]', 'div[unclosed="x', '', '   ',
    ]) {
        check(selector, div, false, 'an unsupported shape must not match');
    }
});

test('a comma list matches on any branch, and tolerates an empty one', () => {
    check('a, b , , c', { tag: 'c' }, true, 'the third real branch');
    check('a, b, c', { tag: 'd' }, false, 'and no branch means no match');
});

test('the shipped selectors the fixtures pin still resolve the way they must', () => {
    const activeReel = {
        tag: 'video',
        ancestors: [{ tag: 'ytd-reel-video-renderer', attrs: { 'is-active': '' } }],
    };
    check('ytd-reel-video-renderer[is-active] video', activeReel, true, 'the reel on screen');
    check('#shorts-player video', activeReel, false, 'is not the mounted neighbour');

    const panel = { tag: 'ytd-playlist-panel-renderer', id: 'playlist', attrs: {} };
    check('ytd-playlist-panel-renderer#playlist:not([hidden])', panel, true, 'a visible panel');
    check('ytd-playlist-panel-renderer#playlist:not([hidden])',
        { ...panel, attrs: { hidden: '' } }, false, 'a collapsed one is not an up-next');

    check('#movie_player .ytp-error',
        { tag: 'div', className: 'ytp-error', ancestors: [{ id: 'movie_player' }] }, true,
        'the player error screen');
    check('#movie_player .ytp-error', { tag: 'div', className: 'ytp-error' }, false,
        'and it has to be inside the player');
});

test('tag names fold case and are never prefix-matched', () => {
    check('DIV', { tag: 'div' }, true, 'a selector may shout');
    check('div', { tag: 'DIV' }, true, 'and so may a node');
    check('yt-lockup-view-model', { tag: 'yt-lockup-view-model-wide' }, false,
        'a longer custom element is a different element');
});
