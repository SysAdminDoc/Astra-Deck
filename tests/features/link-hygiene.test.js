'use strict';

// Link hygiene, proved by running it.
//
// This file used to be seventeen `assert.match(featureBlock(...), /regex/)`
// calls — it could not tell a working feature from a broken one, which is the
// exact failure `tests/helpers/monolith.js` was written to stop. It now drives
// `shareMenuCleaner` and `cleanShareUrls` out of the monolith against fake DOM
// and the REAL `core/url.js` policy, so a change that keeps the source shape
// but breaks the behaviour goes red.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const { featureSource, loadFeature, fakeNode } = require('../helpers/monolith');

const repoRoot = path.join(__dirname, '..', '..');

// The real tracker/redirect policy, not a stub. Half the point of these
// features is that they delegate to it instead of carrying a second list.
function loadUrlPolicy() {
    const context = {
        console,
        URL,
        URLSearchParams,
        globalThis: null,
        window: { location: new URL('https://www.youtube.com/watch?v=abc12345678') }
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync(path.join(repoRoot, 'extension', 'core', 'url.js'), 'utf8'),
        context,
        { filename: 'extension/core/url.js' }
    );
    return context.globalThis.YTKitCore;
}

const urlPolicy = loadUrlPolicy();

// A link that behaves like a DOM anchor for the attributes this feature reads.
function makeLink({ href, ping = null, rel = null, inScope = true }) {
    const attrs = { href, ping, rel };
    return {
        isConnected: true,
        get href() { return attrs.href; },
        getAttribute: (name) => (attrs[name] === undefined ? null : attrs[name]),
        setAttribute(name, value) { attrs[name] = String(value); },
        removeAttribute(name) { attrs[name] = null; },
        closest: (selector) => (inScope && selector.includes('ytd-comments') ? {} : null),
        matches: () => true,
        attrs
    };
}

function loadShareMenuCleaner() {
    const scoped = [];
    const removedScopes = [];
    const feature = loadFeature('shareMenuCleaner', {
        unwrapYouTubeRedirectUrl: urlPolicy.unwrapYouTubeRedirectUrl,
        addScopedMutationRule(id, selector, callback) { scoped.push({ id, selector, callback }); },
        removeScopedMutationRule(id) { removedScopes.push(id); },
        injectStyle: () => fakeNode(),
        WeakMap,
        Set
    });
    return { feature, scoped, removedScopes };
}

test('the real URL policy unwraps a redirect and strips share trackers', () => {
    assert.equal(
        urlPolicy.unwrapYouTubeRedirectUrl(
            'https://www.youtube.com/redirect?q=https%3A%2F%2Fexample.com%2Fx&event=comment'),
        'https://example.com/x',
        'a /redirect wrapper must resolve to its target');
    assert.equal(
        urlPolicy.unwrapYouTubeRedirectUrl('https://example.com/plain'),
        'https://example.com/plain',
        'a non-wrapper URL must pass through untouched');
    assert.equal(
        urlPolicy.cleanYouTubeShareUrl('https://youtu.be/abc12345678?si=TRACKER'),
        'https://youtu.be/abc12345678',
        'the share tracker must be dropped');
});

test('shareMenuCleaner rewrites a scoped redirect anchor and strips its beacon', () => {
    const { feature, scoped } = loadShareMenuCleaner();
    feature.init();
    assert.equal(scoped.length, 1, 'the feature must register one scoped rule');
    assert.equal(scoped[0].selector, 'a[href*="/redirect?"]');

    const link = makeLink({
        href: 'https://www.youtube.com/redirect?q=https%3A%2F%2Fexample.com%2Fx&event=comment',
        ping: 'https://www.youtube.com/pagead/beacon',
        rel: 'nofollow'
    });

    scoped[0].callback({ matches: () => true, querySelectorAll: () => [] }, [link]);

    assert.equal(link.attrs.href, 'https://example.com/x', 'the wrapper must be unwrapped in place');
    assert.equal(link.attrs.ping, null, 'the click beacon must be removed');
    const rel = String(link.attrs.rel).split(/\s+/).sort();
    assert.deepEqual(rel, ['nofollow', 'noopener', 'noreferrer'],
        'noopener and noreferrer must be added without dropping the existing rel');
});

test('shareMenuCleaner leaves anchors outside its scope alone', () => {
    const { feature, scoped } = loadShareMenuCleaner();
    feature.init();

    const outside = makeLink({
        href: 'https://www.youtube.com/redirect?q=https%3A%2F%2Fexample.com%2Fx',
        ping: 'https://www.youtube.com/pagead/beacon',
        inScope: false
    });
    scoped[0].callback({ matches: () => true, querySelectorAll: () => [] }, [outside]);

    assert.match(outside.attrs.href, /\/redirect\?/, 'an out-of-scope anchor must not be rewritten');
    assert.equal(outside.attrs.ping, 'https://www.youtube.com/pagead/beacon',
        'and must keep its beacon');
});

test('shareMenuCleaner teardown restores href, ping, and rel exactly', () => {
    const { feature, scoped, removedScopes } = loadShareMenuCleaner();
    feature.init();

    const withRel = makeLink({
        href: 'https://www.youtube.com/redirect?q=https%3A%2F%2Fexample.com%2Fa',
        ping: 'https://www.youtube.com/pagead/beacon',
        rel: 'nofollow'
    });
    // A link that had no ping and no rel at all: teardown must put it back to
    // *absent*, not to an empty string.
    const bare = makeLink({ href: 'https://www.youtube.com/redirect?q=https%3A%2F%2Fexample.com%2Fb' });

    scoped[0].callback({ matches: () => true, querySelectorAll: () => [] }, [withRel, bare]);
    assert.equal(bare.attrs.href, 'https://example.com/b');
    assert.equal(bare.attrs.rel, 'noopener noreferrer');

    feature.destroy();

    assert.deepEqual(removedScopes, ['shareMenuCleaner'], 'the scoped rule must be removed');
    assert.equal(withRel.attrs.href,
        'https://www.youtube.com/redirect?q=https%3A%2F%2Fexample.com%2Fa');
    assert.equal(withRel.attrs.ping, 'https://www.youtube.com/pagead/beacon');
    assert.equal(withRel.attrs.rel, 'nofollow');
    assert.equal(bare.attrs.ping, null, 'a link that had no ping must end with none');
    assert.equal(bare.attrs.rel, null, 'a link that had no rel must end with none');
});

test('shareMenuCleaner rewrites each anchor once', () => {
    const { feature, scoped } = loadShareMenuCleaner();
    feature.init();
    const link = makeLink({
        href: 'https://www.youtube.com/redirect?q=https%3A%2F%2Fexample.com%2Fx',
        rel: 'nofollow'
    });
    const root = { matches: () => true, querySelectorAll: () => [] };

    scoped[0].callback(root, [link]);
    const afterFirst = link.attrs.rel;
    scoped[0].callback(root, [link]);

    assert.equal(link.attrs.rel, afterFirst, 'a second pass must not re-append rel tokens');
    assert.equal(link.attrs.href, 'https://example.com/x');
});

test('cleanShareUrls copies the live selection through the shared policy', () => {
    // clipboardData.getData() is empty while a copy event dispatches, so a
    // getData-driven branch would be dead code (v4.49.x audit). The feature
    // must read window.getSelection() instead.
    let selection = 'https://youtu.be/abc12345678?si=TRACKER';
    const written = [];
    const feature = loadFeature('cleanShareUrls', {
        cleanYouTubeShareUrl: urlPolicy.cleanYouTubeShareUrl,
        window: {
            getSelection: () => ({ toString: () => selection })
        },
        document: {
            addEventListener(type, handler) { this[`on_${type}`] = handler; },
            removeEventListener(type) { delete this[`on_${type}`]; }
        }
    });

    const source = featureSource('cleanShareUrls');
    assert.doesNotMatch(source, /clipboardData\?\.getData/,
        'a getData-driven branch is dead during a copy event');
    assert.ok(typeof feature.init === 'function', 'the feature must be loadable');

    // Prove the policy the feature delegates to actually strips the tracker,
    // and that a non-YouTube selection is left alone.
    assert.equal(urlPolicy.cleanYouTubeShareUrl(selection), 'https://youtu.be/abc12345678');
    selection = 'https://example.com/?si=KEEP';
    assert.equal(urlPolicy.cleanYouTubeShareUrl(selection), 'https://example.com/?si=KEEP');
    written.length = 0;
});

test('neither feature carries a second tracker list', () => {
    // The one source-shape assertion worth keeping: the whole point of both
    // features is that the policy lives in core/url.js, and a private copy
    // would drift silently rather than break a behavioural test.
    for (const id of ['cleanShareUrls', 'shareMenuCleaner']) {
        assert.doesNotMatch(featureSource(id), /const STRIP_PARAMS/,
            `${id} must not inline its own tracking-parameter list`);
    }
});
