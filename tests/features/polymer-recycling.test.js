'use strict';

// YouTube's Polymer renderers are recycled: the same DOM node is handed a
// different video, a different comment, or replaced outright between watch
// pages. Any feature that keys state to a node has to survive that. These
// tests drive the three sites that did not.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFeature, fakeNode, fakeDocument } = require('../helpers/monolith');

function card({ watched = false } = {}) {
    const node = fakeNode({ tag: 'ytd-rich-item-renderer' });
    node.watched = watched;
    node.querySelector = (selector) =>
        (node.watched && selector.includes('#progress') ? fakeNode({ tag: 'div' }) : null);
    return node;
}

// ── hideWatchedVideos ──────────────────────────────────────────────────
test('hideWatchedVideos releases a recycled card that now shows an unwatched video', () => {
    const cards = [card({ watched: true }), card({ watched: true })];
    const feature = loadFeature('hideWatchedVideos', {
        appState: { settings: { hideWatchedMode: 'dim' } },
        document: fakeDocument((selector) =>
            (selector.includes('[ytkit-watched-check]')
                ? cards.filter(c => c.hasAttribute('ytkit-watched-check'))
                : cards))
    });

    feature._process();
    assert.equal(cards[0].style.opacity, '0.4');
    assert.equal(cards[0].hasAttribute('ytkit-watched-check'), true);

    // Polymer reuses the node for a fresh, unwatched video.
    cards[0].watched = false;
    feature._process();
    assert.equal(cards[0].style.opacity, '', 'a recycled card must be un-dimmed');
    assert.equal(cards[0].hasAttribute('ytkit-watched-check'), false);
    assert.equal(cards[1].style.opacity, '0.4', 'a still-watched card stays dimmed');
});

test('hideWatchedVideos catches a card whose resume overlay hydrates late', () => {
    const late = card({ watched: false });
    const feature = loadFeature('hideWatchedVideos', {
        appState: { settings: { hideWatchedMode: 'hide' } },
        document: fakeDocument(() => [late])
    });

    // First pass runs before YouTube renders the resume-playback overlay. The
    // old permanent once-marker froze this verdict for the session.
    feature._process();
    assert.ok(!late.style.display, 'an unwatched card is untouched');

    late.watched = true;
    feature._process();
    assert.equal(late.style.display, 'none', 'a late-hydrating watched card must still be caught');
});

test('hideWatchedVideos never restores a card it did not mark', () => {
    const foreign = card({ watched: false });
    foreign.style.display = 'none';   // hidden by some other feature
    const feature = loadFeature('hideWatchedVideos', {
        appState: { settings: { hideWatchedMode: 'hide' } },
        document: fakeDocument(() => [foreign])
    });

    feature._process();
    assert.equal(foreign.style.display, 'none', 'another feature\'s hiding must survive');
});

// ── disableLoudnessNormalization ───────────────────────────────────────
test('disableLoudnessNormalization rebinds the volume clamp when the video element is swapped', () => {
    function videoNode() {
        const node = fakeNode({ tag: 'video' });
        node.listeners = [];
        node.volume = 1;
        node.addEventListener = (type, fn) => node.listeners.push([type, fn]);
        node.removeEventListener = (type, fn) => {
            node.listeners = node.listeners.filter(([t, f]) => !(t === type && f === fn));
        };
        return node;
    }

    let current = videoNode();
    const feature = loadFeature('disableLoudnessNormalization', {
        document: fakeDocument(selector => (selector.includes('video') ? current : []))
    });

    feature._apply();
    assert.equal(current.listeners.length, 1, 'the first video must be clamped');
    const first = current;

    // Re-applying on the same element must not stack listeners.
    feature._apply();
    assert.equal(first.listeners.length, 1);

    // YouTube swaps the <video> node on the next watch page.
    current = videoNode();
    feature._apply();
    assert.equal(first.listeners.length, 0, 'the old element must be released');
    assert.equal(current.listeners.length, 1, 'the new element must be clamped');

    // And the clamp still works on the element actually in play.
    const [, handler] = current.listeners[0];
    current.volume = 0.995;
    handler({ currentTarget: current });
    assert.equal(current.volume, 1);

    feature.destroy();
    assert.equal(current.listeners.length, 0, 'destroy must detach from the CURRENT element');
});

// ── commentFilterManager ───────────────────────────────────────────────
test('commentFilterManager re-evaluates a recycled comment node', () => {
    const feature = loadFeature('commentFilterManager', {
        document: fakeDocument(() => []),
        appState: { settings: { commentFilterRules: 'spam' } }
    });
    feature._lastRulesHash = 'deadbeef';
    feature._getCommentAuthor = thread => thread.author;
    feature._getCommentText = thread => thread.body;

    const thread = fakeNode({ tag: 'ytd-comment-thread-renderer' });
    thread.author = '@someone';
    thread.body = 'buy cheap spam now';
    const before = feature._threadCheckStamp(thread);

    // Same node, different comment — the old stamp carried only the rules
    // hash, so the recycled thread kept the previous verdict and stayed
    // hidden while showing an innocent comment.
    thread.body = 'genuinely useful reply';
    const after = feature._threadCheckStamp(thread);
    assert.notEqual(after, before, 'the checked stamp must change with the content');

    // A rules change still busts the stamp, as before.
    feature._lastRulesHash = 'cafebabe';
    assert.notEqual(feature._threadCheckStamp(thread), after);
});

// ── timestampBookmarks ─────────────────────────────────────────────────
// `#secondary-inner` survives SPA navigation, so the previous video's panel
// container is still in the tree on the next watch page. The navigate rule
// dropped only its element references, leaving an orphan that made _inject()
// early-return forever: the panel kept rendering video A's bookmarks, and
// note edits made in those stale rows were written under video A's id.
test('timestampBookmarks removes its stale container so the next video rebinds', () => {
    const secondary = fakeNode({ tag: 'div', attributes: { id: 'secondary-inner' } });
    // Both lookups read the live child list, so an orphan the navigate rule
    // failed to remove really does block the next _inject() — the same way it
    // does in the page.
    const mounted = () => secondary.children.filter(el => el.matches('.ytkit-bookmarks-container'));
    secondary.querySelector = selector =>
        (selector.includes('ytkit-bookmarks-container') ? (mounted()[0] || null) : null);

    const navRules = new Map();
    const feature = loadFeature('timestampBookmarks', {
        document: fakeDocument(selector =>
            (selector.includes('ytkit-bookmarks-container') ? mounted() : [secondary])),
        addNavigateRule: (id, fn) => navRules.set(id, fn),
        removeNavigateRule: id => navRules.delete(id)
    });
    feature._renderPanel = () => {};

    feature.init();
    feature._inject();
    assert.equal(mounted().length, 1, 'the panel must mount on the first video');
    const stale = mounted()[0];
    const first = feature._panel;
    assert.ok(first, 'the body element must be bound');

    // Navigate to the next video.
    navRules.get('bookmarks')();
    assert.equal(stale.removed, 1, 'the previous video\'s container must be removed');

    feature._inject();
    assert.equal(mounted().length, 1, 'exactly one container may exist');
    assert.notEqual(feature._panel, first, 'the panel must rebind to the new video');
});
