'use strict';

// RSS Feed Link looked for the channel header YouTube retired, so it found
// nowhere to go and quietly did nothing. These pin the header it reads today
// and that the link follows an in-app move to another channel.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFeature, fakeNode, fakeTreeDocument } = require('../helpers/monolith');

const HEADER_ACTIONS = 'yt-page-header-renderer yt-flexible-actions-view-model';
const feedFor = (id) => `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;

function channelPage(initialId, { headerIsThere = true } = {}) {
    const actions = fakeNode({ tag: 'yt-flexible-actions-view-model' });
    actions.querySelector = (selector) => actions.children.find((node) => `.${node.className}` === selector) || null;
    const page = { channelId: initialId, headerIsThere, actions };
    const documentRef = fakeTreeDocument((selector) => {
        if (selector.includes(HEADER_ACTIONS)) return page.headerIsThere ? actions : null;
        if (selector.startsWith('link[rel="canonical"]')) {
            return { href: `https://www.youtube.com/channel/${page.channelId}` };
        }
        return null;
    });
    documentRef.createElement = (tag) => fakeNode({ tag });
    const timers = [];
    const rules = {};
    const feature = loadFeature('rssFeedLink', {
        document: documentRef,
        setTimeout: (fn, delay) => { const timer = { fn, delay, cleared: false }; timers.push(timer); return timer; },
        clearTimeout: (timer) => { if (timer) timer.cleared = true; },
        addMutationRule: (id, fn) => { rules.mutation = fn; },
        addNavigateRule: (id, fn) => { rules.navigate = fn; },
        removeMutationRule: () => { rules.mutation = null; },
        removeNavigateRule: () => { rules.navigate = null; }
    });
    return { feature, page, actions, timers, rules };
}

function runPendingTimers(timers) {
    for (const timer of timers.splice(0)) {
        if (!timer.cleared) timer.fn();
    }
}

test('the link goes into the header YouTube uses today', () => {
    const { feature, actions } = channelPage('UCfirst');
    feature._inject();
    assert.equal(actions.children.length, 1);
    assert.equal(actions.children[0].href, feedFor('UCfirst'));
});

test('moving to another channel inside the tab updates the link', () => {
    const { feature, page, actions } = channelPage('UCfirst');
    feature._inject();
    const link = actions.children[0];

    page.channelId = 'UCsecond';
    feature._inject();
    assert.equal(actions.children.length, 1, 'still one link');
    assert.ok(actions.children[0] === link, 'the same link stays in place');
    assert.equal(link.href, feedFor('UCsecond'));
});

test('a header that shows up late still gets the link', () => {
    const { feature, page, actions, timers, rules } = channelPage('UCfirst', { headerIsThere: false });
    feature.init();
    runPendingTimers(timers);
    assert.equal(actions.children.length, 0, 'nothing to attach to yet');

    page.headerIsThere = true;
    rules.mutation();
    runPendingTimers(timers);
    assert.equal(actions.children.length, 1);
});

test('a busy page cannot keep putting the link off', () => {
    const { feature, timers, rules } = channelPage('UCfirst');
    feature.init();
    assert.equal(timers.length, 1);
    rules.mutation();
    rules.mutation();
    assert.equal(timers.length, 1, 'a pending timer is left to fire');
    assert.equal(timers[0].cleared, false);
});

test('an unchanged page is left alone', () => {
    const { feature, actions } = channelPage('UCfirst');
    feature._inject();
    let appends = 0;
    const realAppend = actions.appendChild.bind(actions);
    actions.appendChild = (node) => { appends += 1; return realAppend(node); };
    const link = actions.children[0];
    let hrefWrites = 0;
    const realHref = link.href;
    Object.defineProperty(link, 'href', { get: () => realHref, set: () => { hrefWrites += 1; } });

    feature._inject();
    assert.equal(appends, 0);
    assert.equal(hrefWrites, 0, 'writing to the page would wake the mutation rule again');
});
