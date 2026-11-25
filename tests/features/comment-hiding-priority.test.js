'use strict';

// Theater Split's pane gives every comment thread `display: block !important`.
// A plain inline `display: none` loses to that, so the Comment Filter, Comment
// Search and Hide Pinned Comments all marked threads hidden while they stayed
// on screen. Their hide has to be an inline !important, and the pane's rule has
// to leave [hidden] threads (Collapse Similar Comments) alone.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFeature, fakeNode, fakeDocument } = require('../helpers/monolith');

function thread() {
    return fakeNode({ tag: 'ytd-comment-thread-renderer' });
}

function displayOf(node) {
    return { value: node.style.getPropertyValue('display'), priority: node.style.getPropertyPriority('display') };
}

test('the Comment Filter hides with an !important inline display and restores the original', () => {
    const feature = loadFeature('commentFilterManager', { document: fakeDocument(() => []) });
    const node = thread();
    node.style.display = 'flex';

    feature._setVisibilityReason(node, 'filter', true);
    assert.deepEqual(displayOf(node), { value: 'none', priority: 'important' });

    feature._setVisibilityReason(node, 'filter', false);
    assert.deepEqual(displayOf(node), { value: 'flex', priority: '' });
});

test('the language allowlist hides the same way', () => {
    const feature = loadFeature('commentFilterManager', { document: fakeDocument(() => []) });
    const node = thread();

    feature._setVisibilityReason(node, 'language', true);
    assert.deepEqual(displayOf(node), { value: 'none', priority: 'important' });

    feature._setVisibilityReason(node, 'language', false);
    assert.deepEqual(displayOf(node), { value: '', priority: '' });
});

test('the Comment Filter leaves a thread another hider had hidden still hidden', () => {
    const feature = loadFeature('commentFilterManager', { document: fakeDocument(() => []) });
    const node = thread();
    node.style.setProperty('display', 'none', 'important');

    feature._setVisibilityReason(node, 'filter', true);
    feature._setVisibilityReason(node, 'filter', false);
    assert.deepEqual(displayOf(node), { value: 'none', priority: 'important' });
});

test('Comment Search hides with an !important inline display and restores the original', () => {
    const feature = loadFeature('commentSearch', { document: fakeDocument(() => []), HTMLElement: Object });
    const node = thread();

    feature._hideThreadForSearch(node);
    assert.deepEqual(displayOf(node), { value: 'none', priority: 'important' });

    feature._restoreSearchHiddenThread(node);
    assert.deepEqual(displayOf(node), { value: '', priority: '' });
});

test('Comment Search keeps a pinned thread hidden when the search clears', () => {
    const feature = loadFeature('commentSearch', { document: fakeDocument(() => []), HTMLElement: Object });
    const node = thread();
    node.dataset.ytkitPinnedCommentHidden = '1';

    feature._hideThreadForSearch(node);
    feature._restoreSearchHiddenThread(node);
    assert.deepEqual(displayOf(node), { value: 'none', priority: 'important' });
});

test('Hide Pinned Comments hides with an !important inline display and restores the original', () => {
    const feature = loadFeature('hidePinnedComments', { document: fakeDocument(() => []), HTMLElement: Object });
    const node = thread();
    feature._isPinnedThread = () => true;

    feature._hidePinnedThreads([node]);
    assert.deepEqual(displayOf(node), { value: 'none', priority: 'important' });

    feature._restoreThread(node);
    assert.deepEqual(displayOf(node), { value: '', priority: '' });
});

test("Theater Split's pane never forces display on a [hidden] comment", () => {
    const originalFeatures = globalThis.YTKitFeatures;
    globalThis.YTKitFeatures = {};
    const styles = require('../../extension/features/sticky-video-styles/index.js');
    globalThis.YTKitFeatures = originalFeatures;
    const css = styles.buildSplitCommentsCss().replace(/\/\*[\s\S]*?\*\//g, '');
    const forced = [];
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/display:\s*(?!none)[\w-]+\s*!important/.test(match[2])) continue;
        for (const selector of match[1].split(/,(?![^()]*\))/).map((part) => part.trim())) {
            if (/(?:ytd-comment-thread-renderer|ytd-comment-view-model, ytd-comment-renderer\))$/.test(selector.replace(/:where\(:not\(\[hidden\]\)\)$/, ''))) {
                forced.push(selector);
            }
        }
    }
    assert.ok(forced.length >= 2, 'the pane still lays out threads and comment hosts');
    for (const selector of forced) {
        assert.ok(selector.endsWith(':where(:not([hidden]))'), `${selector} must skip [hidden] comments`);
    }
});
