'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSubscriptionGroupsFeature } = require('../../extension/features/subscription-groups');

class FakeNode {
    constructor(tagName = 'div') {
        this.tagName = String(tagName).toUpperCase();
        this.children = [];
        this.parentNode = null;
        this.dataset = {};
        this.attributes = new Map();
        this.className = '';
        this.id = '';
        this.value = '';
        this.textContent = '';
        this.listeners = new Map();
        this.isConnected = true;
        this.classList = {
            add: (...names) => {
                const values = new Set(this.className.split(/\s+/).filter(Boolean));
                names.forEach((name) => values.add(name));
                this.className = Array.from(values).join(' ');
            },
            remove: (...names) => {
                const blocked = new Set(names);
                this.className = this.className.split(/\s+/).filter((name) => name && !blocked.has(name)).join(' ');
            },
            contains: (name) => this.className.split(/\s+/).includes(name),
        };
    }

    appendChild(child) {
        if (!child) return child;
        child.parentNode = this;
        child.isConnected = true;
        this.children.push(child);
        return child;
    }

    append(...children) {
        children.flat().forEach((child) => this.appendChild(child));
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
        if (name === 'id') this.id = String(value);
    }

    getAttribute(name) {
        return this.attributes.get(name) ?? null;
    }

    addEventListener(type, listener) {
        const handlers = this.listeners.get(type) || [];
        handlers.push(listener);
        this.listeners.set(type, handlers);
    }

    dispatchEvent(event) {
        for (const listener of this.listeners.get(event.type) || []) listener(event);
    }

    focus() {
        this.focused = true;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
        const selectors = String(selector).split(',').map((value) => value.trim()).filter(Boolean);
        const matches = (node, query) => {
            if (query.startsWith('#')) return node.id === query.slice(1);
            if (query.startsWith('.')) return node.classList.contains(query.slice(1));
            return node.tagName.toLowerCase() === query.toLowerCase();
        };
        const found = [];
        const visit = (node) => {
            if (selectors.some((query) => matches(node, query))) found.push(node);
            node.children.forEach(visit);
        };
        this.children.forEach(visit);
        return found;
    }

    insertAdjacentElement(_position, element) {
        if (this.parentNode) {
            const index = this.parentNode.children.indexOf(this);
            element.parentNode = this.parentNode;
            this.parentNode.children.splice(index + 1, 0, element);
        }
        return element;
    }

    remove() {
        this.isConnected = false;
        if (this.parentNode) {
            this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
            this.parentNode = null;
        }
    }
}

class FakeDocument {
    constructor() {
        this.body = new FakeNode('body');
    }

    createElement(tagName) {
        return new FakeNode(tagName);
    }

    querySelector(selector) {
        return this.body.querySelector(selector);
    }

    querySelectorAll(selector) {
        return this.body.querySelectorAll(selector);
    }
}

function makeFeature(settings = {}, options = {}) {
    const appState = { settings: { ...settings } };
    const toasts = [];
    const storage = options.storage || new Map();
    const exports = [];
    const feature = createSubscriptionGroupsFeature({
        appState,
        settingsManager: { save() {} },
        showToast: (...args) => toasts.push(args),
        storageReadJSON: (key, fallback) => storage.has(key) ? storage.get(key) : fallback,
        storageWriteJSON: (key, value) => storage.set(key, value),
        handleFileExport: (...args) => exports.push(args),
    });
    // Import and membership tests should exercise state transitions without
    // requiring YouTube's live DOM to be mounted.
    feature._renderToolbar = () => {};
    feature._applyGroupFilter = () => {};
    feature._applyNewSinceMarkers = () => {};
    feature._renderDeadChannelMarkers = () => {};
    return { appState, feature, toasts, storage, exports };
}

test('subscription groups support create/read/update/delete flows and membership editing', () => {
    const previousDocument = globalThis.document;
    globalThis.document = new FakeDocument();

    try {
        const { appState, feature, toasts } = makeFeature({ subscriptionGroupData: {} });
        const anchor = new FakeNode('button');

        feature._showNewGroupDialog(anchor);
        const dialogInput = document.querySelector('.ytkit-sub-group-dialog__input');
        const createButton = document.querySelector('.ytkit-sub-group-dialog__button--primary');
        dialogInput.value = 'Coding';
        createButton.dispatchEvent({ type: 'click' });

        const parentId = Object.keys(feature._readGroups())[0];
        assert.ok(parentId?.startsWith('g_'));
        assert.equal(feature._readGroups()[parentId].name, 'Coding');

        feature._showNewGroupDialog(anchor, parentId);
        document.querySelector('.ytkit-sub-group-dialog__input').value = 'Frontend';
        document.querySelector('.ytkit-sub-group-dialog__button--primary').dispatchEvent({ type: 'click' });
        const groupsAfterCreate = feature._readGroups();
        const childId = Object.keys(groupsAfterCreate).find((id) => id !== parentId);
        assert.equal(groupsAfterCreate[childId].parentId, parentId);

        feature._setGroupMembership(parentId, 'UCcoding1111111111111111', true);
        feature._setGroupMembership(parentId, 'UCcoding1111111111111111', false);
        assert.deepEqual(feature._readGroups()[parentId].channelIds, []);
        assert.ok(toasts.some(([message]) => /Channel added/.test(message)));
        assert.ok(toasts.some(([message]) => /Channel removed/.test(message)));

        feature._activeGroupId = parentId;
        assert.equal(feature._setActiveSortMode('popular'), 'popular');
        assert.equal(feature._readGroups()[parentId].sortMode, 'popular');
        assert.equal(feature._setActiveSortMode('not-a-sort-mode'), 'default');
        assert.equal(feature._readGroups()[parentId].sortMode, 'default');

        // An explicit replace import is the supported destructive group
        // operation: it updates the retained group and removes the child.
        const replaceResult = feature._importGroups(JSON.stringify({
            groups: {
                [parentId]: {
                    name: 'Coding Updated',
                    color: '#22c55e',
                    channelIds: ['UCupdated2222222222222222'],
                    sortMode: 'date-desc',
                },
            },
        }), { mode: 'replace' });

        assert.equal(replaceResult.ok, true);
        assert.equal(replaceResult.updatedGroups, 1);
        assert.equal(replaceResult.removedGroups, 1);
        assert.deepEqual(Object.keys(appState.settings.subscriptionGroupData), [parentId]);
        assert.equal(appState.settings.subscriptionGroupData[parentId].name, 'Coding Updated');
        assert.deepEqual(appState.settings.subscriptionGroupData[parentId].channelIds, ['UCupdated2222222222222222']);
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});

test('subscription group sort modes persist per group and globally', () => {
    const { appState, feature } = makeFeature({
        subscriptionGroupData: {
            coding: {
                name: 'Coding',
                channelIds: [],
                parentId: '',
                sortMode: 'default',
            },
        },
        subscriptionSortMode: 'default',
    });

    feature._activeGroupId = 'coding';
    for (const mode of feature._SORT_MODES) {
        assert.equal(feature._setActiveSortMode(mode), mode);
        assert.equal(feature._readGroups().coding.sortMode, mode);
    }

    feature._activeGroupId = '';
    assert.equal(feature._setActiveSortMode('unwatched'), 'unwatched');
    assert.equal(appState.settings.subscriptionSortMode, 'unwatched');
    assert.equal(feature._getActiveSortMode(), 'unwatched');
    assert.equal(feature._setActiveSortMode('unknown'), 'default');
    assert.equal(appState.settings.subscriptionSortMode, 'default');
});

test('JSON import reports skipped groups, skipped channels, duplicates, and merge counts', () => {
    const { appState, feature, toasts } = makeFeature({
        subscriptionGroupData: {
            existing: {
                name: 'Existing',
                color: '#7c3aed',
                channelIds: ['UCexisting1111111111111111'],
                parentId: '',
                sortMode: 'default',
            },
        },
    });
    const tooLongGroupId = 'g'.repeat(65);
    const payload = JSON.stringify({
        groups: {
            imported: {
                name: 'Imported',
                color: 'not-a-color',
                channelIds: ['UCone111111111111111111', ' UCone111111111111111111 ', '', 42, 'x'.repeat(64)],
                sortMode: 'not-a-sort-mode',
            },
            invalid: null,
            [tooLongGroupId]: { name: 'Skipped by id', channelIds: [] },
        },
    });

    const result = feature._importGroups(payload);

    assert.deepEqual(result, {
        ok: true,
        importedGroups: 2,
        createdGroups: 1,
        updatedGroups: 0,
        removedGroups: 0,
        importedChannels: 1,
        skippedGroups: 2,
        skippedChannels: 3,
        duplicateChannels: 1,
    });
    assert.equal(appState.settings.subscriptionGroupData.existing.name, 'Existing');
    assert.deepEqual(appState.settings.subscriptionGroupData.imported.channelIds, ['UCone111111111111111111']);
    assert.equal(appState.settings.subscriptionGroupData.imported.color, '#7c3aed');
    assert.equal(appState.settings.subscriptionGroupData.imported.sortMode, 'default');
    assert.match(toasts[0][0], /skipped 1 duplicate channel/);
    assert.match(toasts[0][0], /2 skipped groups/);
});

test('OPML import preserves nested groups and counts duplicate channels with undo', () => {
    const { appState, feature, toasts } = makeFeature({ subscriptionGroupData: {} });
    const opml = `<?xml version="1.0"?>
<opml version="2.0"><body>
  <outline text="News" astra:type="group" astra:id="news" astra:sortMode="popular">
    <outline type="rss" text="One" xmlUrl="https://www.youtube.com/feeds/videos.xml?channel_id=UCone11111111111111111" />
    <outline type="rss" text="One duplicate" xmlUrl="https://www.youtube.com/feeds/videos.xml?channel_id=UCone11111111111111111" />
    <outline text="Tech" astra:type="group" astra:id="tech">
      <outline type="rss" text="Two" htmlUrl="https://www.youtube.com/channel/UCtwo22222222222222222" />
    </outline>
  </outline>
</body></opml>`;

    const result = feature._importGroupsOpml(opml);

    assert.equal(result.ok, true);
    assert.equal(result.importedGroups, 2);
    assert.equal(result.importedChannels, 2);
    assert.equal(result.duplicateChannels, 1);
    assert.equal(appState.settings.subscriptionGroupData.news.sortMode, 'popular');
    assert.deepEqual(appState.settings.subscriptionGroupData.news.channelIds, ['UCone11111111111111111']);
    assert.equal(appState.settings.subscriptionGroupData.tech.parentId, 'news');
    assert.deepEqual(appState.settings.subscriptionGroupData.tech.channelIds, ['UCtwo22222222222222222']);
    assert.match(toasts[0][0], /skipped 1 duplicate channel/);
    assert.equal(toasts[0][2].action.text, 'Undo');

    toasts[0][2].action.onClick();
    assert.deepEqual(appState.settings.subscriptionGroupData, {});
});

test('staged unsubscribe session is bounded, paced, review-list-only, and recoverable in a local log', async () => {
    const staged = Object.fromEntries(Array.from({ length: 26 }, (_, index) => {
        const channelId = `UCstage${String(index).padStart(17, '0')}`;
        return [channelId, { channelId, channelName: `Channel ${index}`, undoUntil: Date.now() + 86400000 }];
    }));
    const { appState, feature, storage } = makeFeature({ subscriptionUnsubscribeStagingData: staged });
    feature._UNSUBSCRIBE_PACE_MS = 0;
    const visited = [];
    feature._findStagedChannelCard = channelId => {
        visited.push(channelId);
        return { channelId, isConnected: true };
    };
    feature._applyNativeUnsubscribeAction = async () => true;

    const result = await feature._runStagedUnsubscribeSession();

    assert.equal(result.requested, 25);
    assert.equal(result.skippedOverCap, 1);
    assert.equal(result.removed, 25);
    assert.equal(result.failed, 0);
    assert.equal(visited.length, 25);
    assert.equal(Object.keys(appState.settings.subscriptionUnsubscribeStagingData).length, 1);
    const log = storage.get(feature._UNSUBSCRIBE_LOG_KEY);
    assert.equal(log.length, 1);
    assert.equal(log[0].entries.length, 25);
    assert.equal(log[0].removed, 25);
    assert.equal(log[0].skippedOverCap, 1);
});

test('staged unsubscribe keeps failed review items and exports every result as JSON', async () => {
    const staged = {
        success: { channelId: 'success', channelName: 'Success', undoUntil: Date.now() + 86400000 },
        failed: { channelId: 'failed', channelName: 'Failed', undoUntil: Date.now() + 86400000 },
    };
    const { appState, feature, storage, exports } = makeFeature({ subscriptionUnsubscribeStagingData: staged });
    feature._UNSUBSCRIBE_PACE_MS = 0;
    feature._findStagedChannelCard = channelId => ({ channelId, isConnected: true });
    feature._applyNativeUnsubscribeAction = async card => card.channelId === 'success';

    const result = await feature._runStagedUnsubscribeSession();

    assert.equal(result.removed, 1);
    assert.equal(result.failed, 1);
    assert.deepEqual(Object.keys(appState.settings.subscriptionUnsubscribeStagingData), ['failed']);
    assert.deepEqual(storage.get(feature._UNSUBSCRIBE_LOG_KEY)[0].entries.map(entry => [entry.channelId, entry.unsubscribed]), [
        ['success', true],
        ['failed', false],
    ]);

    feature._exportUnsubscribeLog();
    assert.equal(exports.length, 1);
    assert.match(exports[0][0], /subscription-unsubscribe-log-\d{4}-\d{2}-\d{2}\.json$/);
    assert.deepEqual(JSON.parse(exports[0][1]).sessions[0].entries[1], {
        channelId: 'failed',
        channelName: 'Failed',
        unsubscribed: false,
        reason: 'unsubscribe-control-not-found',
    });
});

test('staged unsubscribe is a no-op when review staging is empty', async () => {
    const { feature, toasts, storage } = makeFeature({ subscriptionUnsubscribeStagingData: {} });
    let applied = false;
    feature._applyNativeUnsubscribeAction = async () => { applied = true; return true; };

    const result = await feature._runStagedUnsubscribeSession();

    assert.equal(result.requested, 0);
    assert.equal(applied, false);
    assert.equal(storage.has(feature._UNSUBSCRIBE_LOG_KEY), false);
    assert.match(toasts.at(-1)[0], /Nothing is staged/);
});

// ── Unsubscribe evidence ──
// A staged session deletes the 30-day recovery record for every channel it
// reports as removed, so "removed" must mean the unsubscribe actually landed.
// Three paths used to report success without evidence: a clicked menu item, a
// pre-click label, and any open #confirm-button (YouTube's generic confirm id).

async function withFakeDocument(dialogNode, fn) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
    globalThis.document = {
        querySelector: (selector) => (selector === 'ytd-confirm-dialog-renderer' ? dialogNode : null),
        querySelectorAll: () => [],
        body: { click() {} },
    };
    try {
        return await fn();
    } finally {
        if (previous) Object.defineProperty(globalThis, 'document', previous);
        else delete globalThis.document;
    }
}

function makeControl(labelRef) {
    return {
        isConnected: true,
        dataset: {},
        textContent: '',
        getAttribute: (name) => (name === 'aria-label' ? labelRef.value : null),
        click() {},
    };
}

test('a foreign confirm dialog is never auto-confirmed by the unsubscribe session', async () => {
    const { feature } = makeFeature();
    let clicked = false;
    const genericDialog = {
        textContent: 'Clear all watch history? This cannot be undone.',
        querySelector: () => ({ id: 'confirm-button', click() { clicked = true; } }),
    };

    const confirmed = await withFakeDocument(genericDialog, () => feature._confirmUnsubscribeDialog());

    assert.equal(confirmed, false, 'a dialog that says nothing about unsubscribing must not be confirmed');
    assert.equal(clicked, false, 'the generic #confirm-button must not be clicked');
});

test('the unsubscribe confirm dialog is confirmed when the dialog is about unsubscribing', async () => {
    const { feature } = makeFeature();
    let clicked = false;
    const dialog = {
        textContent: 'Unsubscribe from Example Channel?',
        querySelector: () => ({ id: 'confirm-button', click() { clicked = true; } }),
    };

    const confirmed = await withFakeDocument(dialog, () => feature._confirmUnsubscribeDialog());

    assert.equal(confirmed, true);
    assert.equal(clicked, true);
});

test('clicking the unsubscribe menu item is not by itself evidence of removal', async () => {
    const { feature } = makeFeature();
    feature._clickUnsubscribeMenuItem = async () => true;
    const label = { value: 'Unsubscribe from Example Channel' };
    const control = makeControl(label);
    const card = {
        isConnected: true,
        querySelectorAll: () => [control],
        querySelector: () => null,
    };

    // Menu item clicked, but no confirm dialog appears and the control still
    // offers to unsubscribe — the subscription survived.
    const result = await withFakeDocument(null, () => feature._applyNativeUnsubscribeAction(card));

    assert.equal(result, false, 'no confirmation and no label flip must report failure so staging is kept');
});

test('a control that flips away from its unsubscribe label counts as a removal', async () => {
    const { feature } = makeFeature();
    feature._clickUnsubscribeMenuItem = async () => true;
    const label = { value: 'Unsubscribe from Example Channel' };
    const control = makeControl(label);
    control.click = () => { label.value = 'Subscribe'; };
    const card = {
        isConnected: true,
        querySelectorAll: () => [control],
        querySelector: () => null,
    };

    const result = await withFakeDocument(null, () => feature._applyNativeUnsubscribeAction(card));

    assert.equal(result, true);
});

test('a pre-click unsubscribe label is not evidence of removal', async () => {
    const { feature } = makeFeature();
    feature._clickUnsubscribeMenuItem = async () => false;
    const label = { value: 'Unsubscribe from Example Channel' };
    const control = makeControl(label);
    const card = {
        isConnected: true,
        querySelectorAll: () => [control],
        querySelector: () => null,
    };

    const result = await withFakeDocument(null, () => feature._applyNativeUnsubscribeAction(card));

    assert.equal(result, false, 'the label the control was selected by must never prove the click worked');
});
