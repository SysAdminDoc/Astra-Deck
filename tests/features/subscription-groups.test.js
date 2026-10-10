'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
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
        ...(options.deps || {}),
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
        importedGroups: 1,
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

// ── Subscription exports from other apps ──

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const readFixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

// Loads a core module in its own realm and returns what it publishes, so
// the test process's YTKitCore stays untouched.
function loadCore(file) {
    const sandbox = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'core', file), 'utf8'), sandbox);
    return sandbox.YTKitCore;
}

const csvCore = loadCore('csv.js');
const exportDeps = { parseCsv: csvCore.parseCsv };

function withFailureCopy(run) {
    const previous = globalThis.YTKitCore;
    globalThis.YTKitCore = { describeFailure: loadCore('failure-copy.js').describeFailure };
    try {
        return run();
    } finally {
        if (previous === undefined) delete globalThis.YTKitCore;
        else globalThis.YTKitCore = previous;
    }
}

const onlyGroup = (groups) => {
    const ids = Object.keys(groups);
    assert.equal(ids.length, 1, 'the import must land in exactly one group');
    return groups[ids[0]];
};

test('parseCsv reads quoted fields, doubled quotes, CRLF and a byte-order mark', () => {
    const rows = csvCore.parseCsv('﻿a,"b, with comma","say ""hi"""\r\n"line\nbreak",,end\n\n');
    assert.deepEqual(JSON.parse(JSON.stringify(rows)), [
        ['a', 'b, with comma', 'say "hi"'],
        ['line\nbreak', '', 'end'],
        [''],
    ]);
    assert.deepEqual(JSON.parse(JSON.stringify(csvCore.parseCsv('x,y'))), [['x', 'y']]);
    assert.deepEqual(JSON.parse(JSON.stringify(csvCore.parseCsv(''))), []);
});

test('a Google Takeout subscriptions.csv lands every channel in a new group, with undo', () => {
    const { appState, feature, toasts } = makeFeature({ subscriptionGroupData: {} }, { deps: exportDeps });

    const result = feature._importFile(readFixture('subscriptions-takeout-2026.csv'), 'subscriptions.csv');

    assert.equal(result.ok, true);
    assert.equal(result.createdGroups, 1);
    assert.equal(result.importedChannels, 5);
    assert.equal(result.skippedChannels, 0, 'the header row is not a skipped channel');
    const group = onlyGroup(appState.settings.subscriptionGroupData);
    assert.equal(group.name, 'Google Takeout subscriptions');
    assert.equal(group.color, '#7c3aed');
    assert.equal(group.parentId, '');
    assert.equal(group.sortMode, 'default');
    assert.deepEqual(group.channelIds, [
        'UCBR8-60-B28hp2BmDPdntcQ',
        'UCsXVk37bltHxD1rDPwtNM8Q',
        'UCYO_jab_esuFRV4b17AJtAw',
        'UCHnyfMqiRRG1u-2MsSQLbXA',
        'UCY1kMZp36IQSyNx_9h4mpCg',
    ], 'channel ids keep their case and file order');
    assert.match(toasts[0][0], /from Google Takeout/);
    assert.equal(toasts[0][2].action.text, 'Undo');

    toasts[0][2].action.onClick();
    assert.deepEqual(appState.settings.subscriptionGroupData, {});
});

test('the older Takeout subscriptions.json lands every channel in a new group', () => {
    const { appState, feature, toasts } = makeFeature({ subscriptionGroupData: {} }, { deps: exportDeps });

    const result = feature._importFile(readFixture('subscriptions-takeout-legacy.json'), 'subscriptions.json');

    assert.equal(result.ok, true);
    assert.equal(result.importedChannels, 3);
    const group = onlyGroup(appState.settings.subscriptionGroupData);
    assert.equal(group.name, 'Google Takeout subscriptions');
    assert.deepEqual(group.channelIds, [
        'UCAuUUnT6oDeKwE6v1NGQxug',
        'UCBa659QWEk1AI4Tg--mrJ2A',
        'UC_x5XG1OV2P6uZZ5FSM9Ttw',
    ], 'the subscribed channel comes from resourceId, never the subscriber\'s own channelId');
    assert.equal(toasts[0][2].action.text, 'Undo');
    toasts[0][2].action.onClick();
    assert.deepEqual(appState.settings.subscriptionGroupData, {});
});

test('a NewPipe export lands its YouTube channels and skips the other services', () => {
    const { appState, feature, toasts } = makeFeature({ subscriptionGroupData: {} }, { deps: exportDeps });

    const result = feature._importFile(readFixture('subscriptions-newpipe.json'), 'newpipe_subscriptions_202610101200.json');

    assert.equal(result.ok, true);
    assert.equal(result.importedChannels, 3);
    assert.equal(result.skippedChannels, 2, 'SoundCloud and PeerTube entries are skipped and counted');
    const group = onlyGroup(appState.settings.subscriptionGroupData);
    assert.equal(group.name, 'NewPipe subscriptions');
    assert.deepEqual(group.channelIds, [
        'UCHnyfMqiRRG1u-2MsSQLbXA',
        'UCYO_jab_esuFRV4b17AJtAw',
        'UCAuUUnT6oDeKwE6v1NGQxug',
    ]);
    assert.match(toasts[0][0], /from NewPipe/);
    assert.match(toasts[0][0], /2 skipped channels/);
    toasts[0][2].action.onClick();
    assert.deepEqual(appState.settings.subscriptionGroupData, {});
});

test('an export lands in the open group, with a localized header, duplicates and junk rows', () => {
    const existing = {
        name: 'Science',
        color: '#22c55e',
        channelIds: ['UCHnyfMqiRRG1u-2MsSQLbXA'],
        parentId: '',
        sortMode: 'popular',
    };
    const other = { name: 'Music', color: '#7c3aed', channelIds: [], parentId: '', sortMode: 'default' };
    const { appState, feature, toasts } = makeFeature({
        subscriptionGroupData: { science: existing, music: other },
    }, { deps: exportDeps });
    feature._activeGroupId = 'science';
    const csv = [
        '﻿ID de la chaîne,URL de la chaîne,Titre de la chaîne',
        'UCHnyfMqiRRG1u-2MsSQLbXA,http://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA,Veritasium',
        'UCYO_jab_esuFRV4b17AJtAw,http://www.youtube.com/channel/UCYO_jab_esuFRV4b17AJtAw,"3Blue1Brown, ""maths"""',
        'not a channel,,',
        'UCYO_jab_esuFRV4b17AJtAw,http://www.youtube.com/channel/UCYO_jab_esuFRV4b17AJtAw,3Blue1Brown again',
        ',http://www.youtube.com/channel/UCY1kMZp36IQSyNx_9h4mpCg,Id only in the link',
        '',
    ].join('\r\n');

    const result = feature._importFile(csv, 'abonnements.csv');

    assert.equal(result.ok, true);
    assert.equal(result.createdGroups, 0, 'no new group when one is open');
    assert.equal(result.importedChannels, 2);
    assert.equal(result.duplicateChannels, 2);
    assert.equal(result.skippedChannels, 1, 'the junk row is counted');
    const groups = appState.settings.subscriptionGroupData;
    assert.deepEqual(Object.keys(groups).sort(), ['music', 'science']);
    assert.deepEqual(groups.science.channelIds, [
        'UCHnyfMqiRRG1u-2MsSQLbXA',
        'UCYO_jab_esuFRV4b17AJtAw',
        'UCY1kMZp36IQSyNx_9h4mpCg',
    ]);
    assert.equal(groups.science.name, 'Science', 'the open group keeps its name');
    assert.equal(groups.science.sortMode, 'popular');
    assert.deepEqual(groups.music.channelIds, []);
    assert.equal(result.importedGroups, 1, 'the summary counts the group the file filled, not every group');
    assert.match(toasts[0][0], /^Imported 1 subscription group from Google Takeout \(0 new, 1 updated, 2 channels\)\./);
    assert.match(toasts[0][0], /skipped 2 duplicate channels/);

    toasts[0][2].action.onClick();
    assert.deepEqual(appState.settings.subscriptionGroupData.science.channelIds, ['UCHnyfMqiRRG1u-2MsSQLbXA']);
});

test('a named target group wins over the open group, and replace mode keeps only the import', () => {
    const groups = {
        a: { name: 'A', color: '#7c3aed', channelIds: [], parentId: '', sortMode: 'default' },
        b: { name: 'B', color: '#7c3aed', channelIds: [], parentId: '', sortMode: 'default' },
    };
    const targeted = makeFeature({ subscriptionGroupData: structuredClone(groups) }, { deps: exportDeps });
    targeted.feature._activeGroupId = 'a';
    targeted.feature._importFile(readFixture('subscriptions-newpipe.json'), 'subs.json', { groupId: 'b' });
    assert.equal(targeted.appState.settings.subscriptionGroupData.a.channelIds.length, 0);
    assert.equal(targeted.appState.settings.subscriptionGroupData.b.channelIds.length, 3);

    const replaced = makeFeature({ subscriptionGroupData: structuredClone(groups) }, { deps: exportDeps });
    const result = replaced.feature._importFile(readFixture('subscriptions-takeout-2026.csv'), 'subscriptions.csv', { mode: 'replace' });
    assert.equal(result.ok, true);
    assert.equal(result.removedGroups, 2);
    assert.equal(onlyGroup(replaced.appState.settings.subscriptionGroupData).channelIds.length, 5);
    assert.match(replaced.toasts[0][0], /Replaced all groups\./);
    replaced.toasts[0][2].action.onClick();
    assert.deepEqual(Object.keys(replaced.appState.settings.subscriptionGroupData), ['a', 'b']);
});

test('an export stops at 1,000 channels per group and counts the rest as skipped', () => {
    const full = Array.from({ length: 999 }, (_, index) => `UC${String(index).padStart(22, '0')}`);
    const { appState, feature } = makeFeature({
        subscriptionGroupData: { big: { name: 'Big', color: '#7c3aed', channelIds: full, parentId: '', sortMode: 'default' } },
    }, { deps: exportDeps });
    feature._activeGroupId = 'big';

    const result = feature._importFile(readFixture('subscriptions-takeout-2026.csv'), 'subscriptions.csv');

    assert.equal(result.ok, true);
    assert.equal(result.importedChannels, 1);
    assert.equal(result.skippedChannels, 4);
    assert.equal(appState.settings.subscriptionGroupData.big.channelIds.length, 1000);
    assert.equal(appState.settings.subscriptionGroupData.big.channelIds[999], 'UCBR8-60-B28hp2BmDPdntcQ');
});

test('a malformed export changes nothing and shows the bad-data failure copy', () => {
    const cases = [
        ['Channel Id,Channel Url,Channel Title\nnot,a,channel\n', 'subscriptions.csv'],
        [JSON.stringify({ app_version: '0.28.0', subscriptions: [] }), 'newpipe.json'],
        [JSON.stringify([{ snippet: { title: 'No resource id' } }]), 'subscriptions.json'],
    ];
    for (const [text, name] of cases) {
        const seed = { keep: { name: 'Keep', color: '#7c3aed', channelIds: ['UCkeep'], parentId: '', sortMode: 'default' } };
        const { appState, feature, toasts } = makeFeature({ subscriptionGroupData: structuredClone(seed) }, { deps: exportDeps });
        const result = withFailureCopy(() => feature._importFile(text, name));
        assert.equal(result.ok, false, name);
        assert.deepEqual(appState.settings.subscriptionGroupData, seed, `${name} must leave the groups alone`);
        assert.equal(toasts.length, 1);
        assert.equal(toasts[0][0], 'Import failed: The data could not be read. Check the file, then try again.');
    }
});

test('the import button still sends Astra JSON and OPML down their own paths', () => {
    const { feature, toasts } = makeFeature({ subscriptionGroupData: {} }, { deps: exportDeps });
    const json = feature._importFile(JSON.stringify({
        schemaVersion: 2,
        groups: { mine: { name: 'Mine', channelIds: ['UCBR8-60-B28hp2BmDPdntcQ'] } },
    }), 'astra-deck-subscription-groups-2026-10-10.json');
    assert.equal(json.ok, true);
    assert.match(toasts[0][0], /from JSON/);

    const opml = feature._importFile(`<?xml version="1.0"?>
<opml version="2.0"><body>
  <outline text="News" astra:type="group" astra:id="news">
    <outline type="rss" text="One" xmlUrl="https://www.youtube.com/feeds/videos.xml?channel_id=UCBR8-60-B28hp2BmDPdntcQ" />
  </outline>
</body></opml>`, 'groups.opml');
    assert.equal(opml.ok, true);
    assert.match(toasts[1][0], /from OPML/);
});

test('export channel ids follow the blocked-channel rules with the case kept', () => {
    const { feature } = makeFeature({}, { deps: exportDeps });
    assert.equal(feature._channelIdFromExport('https://www.youtube.com/channel/UCBR8-60-B28hp2BmDPdntcQ'), 'UCBR8-60-B28hp2BmDPdntcQ');
    assert.equal(feature._channelIdFromExport('  UC_x5XG1OV2P6uZZ5FSM9Ttw  '), 'UC_x5XG1OV2P6uZZ5FSM9Ttw');
    assert.equal(feature._channelIdFromExport('https://www.youtube.com/@MarkRober'), '@MarkRober');
    assert.equal(feature._channelIdFromExport('@Veritasium'), '@Veritasium');
    assert.equal(feature._channelIdFromExport('UCBR8-60-B28hp2BmDPdntcQextra'), '', 'a longer token is not a channel id');
    assert.equal(feature._channelIdFromExport('xUCBR8-60-B28hp2BmDPdntcQ'), '', 'an id glued to other text is not a channel id');
    assert.equal(feature._channelIdFromExport('mail@example.com'), '', 'an address is not a handle');
    assert.equal(feature._channelIdFromExport('', 42, 'Title', 'UCY1kMZp36IQSyNx_9h4mpCg'), 'UCY1kMZp36IQSyNx_9h4mpCg');
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


// ── Membership cap, group rename/delete, unsubscribe confirm ────────────

function withStubbedDialogs({ promptWith, confirmWith }, run) {
    const priorDocument = globalThis.document;
    const priorPrompt = globalThis.prompt;
    const priorConfirm = globalThis.confirm;
    globalThis.document = new FakeDocument();
    globalThis.prompt = () => promptWith;
    globalThis.confirm = () => confirmWith;
    try {
        return run();
    } finally {
        if (priorDocument === undefined) delete globalThis.document; else globalThis.document = priorDocument;
        if (priorPrompt === undefined) delete globalThis.prompt; else globalThis.prompt = priorPrompt;
        if (priorConfirm === undefined) delete globalThis.confirm; else globalThis.confirm = priorConfirm;
    }
}

test('adding past the 1000-channel cap is refused instead of silently dropped', () => {
    // The old form added the channel, sliced it straight back off, and still
    // toasted "added" — a data drop reported to the user as a success.
    const full = Array.from({ length: 1000 }, (_, i) => `UC${String(i).padStart(22, '0')}`);
    const { appState, feature, toasts } = makeFeature({
        subscriptionGroupData: { g_full: { name: 'Full', channelIds: [...full] } }
    });

    feature._setGroupMembership('g_full', 'UConeTooMany1111111111', true);

    const stored = appState.settings.subscriptionGroupData.g_full.channelIds;
    assert.equal(stored.length, 1000, 'membership must be unchanged at the cap');
    assert.equal(stored.includes('UConeTooMany1111111111'), false,
        'the refused channel must not appear in the group');
    assert.ok(toasts.some(([m]) => /full at 1000/i.test(m)),
        'the user must be told the add was refused and why');
    assert.equal(toasts.some(([m]) => /Channel added/.test(m)), false,
        'a refused add must never report success');
});

test('at the cap, removing a channel and re-adding an existing member still work', () => {
    const full = Array.from({ length: 1000 }, (_, i) => `UC${String(i).padStart(22, '0')}`);
    const { appState, feature } = makeFeature({
        subscriptionGroupData: { g_full: { name: 'Full', channelIds: [...full] } }
    });

    // A removal moves away from the limit; refusing it would strand the user.
    feature._setGroupMembership('g_full', full[0], false);
    assert.equal(appState.settings.subscriptionGroupData.g_full.channelIds.length, 999,
        'a removal at the cap must be allowed');

    // Re-checking a channel that is already a member is a no-op, not an add.
    feature._setGroupMembership('g_full', full[1], true);
    assert.equal(appState.settings.subscriptionGroupData.g_full.channelIds.length, 999,
        're-adding an existing member must not be refused as an overflow');

    // The `included &&` clause is belt-and-braces: `!ids.has(channelId)`
    // already spares every removal of an actual member, so no reachable state
    // distinguishes the two. Pin the intent rather than contrive a scenario.
    const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'subscription-groups', 'index.js'),
        'utf8'
    );
    assert.match(src, /if \(included && !ids\.has\(channelId\) && ids\.size >= this\._MAX_GROUP_CHANNELS\)/,
        'the module must gate the cap refusal on an add, so a removal can never be blocked');
});

test('a group can be renamed from the editor', () => withStubbedDialogs(
    { promptWith: '  Renamed Group  ', confirmWith: true },
    () => {
        const { appState, feature, toasts } = makeFeature({
            subscriptionGroupData: { g_one: { name: 'Original', channelIds: [] } }
        });
        feature._renderMembersPanel = () => {};

        feature._renameGroup('g_one');
        assert.equal(appState.settings.subscriptionGroupData.g_one.name, 'Renamed Group',
            'the new name must be trimmed and stored');
        assert.ok(toasts.some(([m]) => /renamed/i.test(m)));
    }
));

test('a cancelled rename prompt changes nothing', () => withStubbedDialogs(
    { promptWith: null, confirmWith: true },
    () => {
        const { appState, feature, toasts } = makeFeature({
            subscriptionGroupData: { g_one: { name: 'Original', channelIds: [] } }
        });
        feature._renderMembersPanel = () => {};

        feature._renameGroup('g_one');
        assert.equal(appState.settings.subscriptionGroupData.g_one.name, 'Original',
            'dismissing the prompt must not blank the name');
        assert.equal(toasts.length, 0, 'a no-op must not claim it renamed anything');
    }
));

test('a group is deleted immediately, and only that group', () => {
    // This half used to also assert that declining a native confirm kept the
    // group. The confirm is gone: it was the only modal left in a project that
    // answers destruction with immediate-apply plus undo, and the only
    // destructive action you could not take back once you had answered it. The
    // rule the old test really guarded — deleting one group must not touch any
    // other — is unchanged and asserted below; the undo is covered separately.
    const settings = {
        subscriptionGroupData: {
            g_keep: { name: 'Keep', channelIds: ['UCkeep1111111111111111'] },
            g_drop: { name: 'Drop', channelIds: ['UCdrop1111111111111111'] }
        }
    };

    withStubbedDialogs({ promptWith: null }, () => {
        const { appState, feature, toasts } = makeFeature(JSON.parse(JSON.stringify(settings)));
        feature._closeMembersPanel = () => {};
        feature._activeGroupId = 'g_drop';

        feature._deleteGroup('g_drop');
        assert.deepEqual(Object.keys(appState.settings.subscriptionGroupData), ['g_keep'],
            'only the named group may be removed — a replace-import used to be the only way, '
            + 'and it took every other group with it');
        assert.equal(feature._activeGroupId, '',
            'deleting the active group must clear the filter, not leave it pointing at nothing');
        assert.ok(toasts.some(([m]) => /deleted/i.test(m)));
    });
});

test('the unsubscribe confirm anchors on the confirm id, never a bare role=button', () => {
    // querySelector returns the FIRST document-order match. In dialog variants
    // without #confirm-button that is typically Cancel, so the helper clicked
    // Cancel, returned true, and the caller deleted the 30-day staging record
    // for a channel that was still subscribed.
    const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'subscription-groups', 'index.js'),
        'utf8'
    );
    const start = src.indexOf('async _confirmUnsubscribeDialog()');
    assert.ok(start > -1, 'the module must define _confirmUnsubscribeDialog');
    // Comments stripped first: the explanatory note above the fix names the
    // very selector this asserts is absent, and an absence check that matches
    // its own documentation is no check at all.
    const block = src.slice(start, src.indexOf('\n            },', start))
        .split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(block, /\[role="button"\]/,
        'the module must not accept a bare [role="button"] as the confirm control');
    assert.doesNotMatch(block, /'button\[aria-label\]'/,
        'the module must not accept any labelled button as the confirm control');
    assert.match(block, /dialog\.querySelector\('#confirm-button'\)/,
        'the module must anchor on YouTube own confirm id');
    assert.match(block, /closest\?\.\('#cancel-button'\)/,
        'the module must refuse a control that resolves inside the dismiss button');
    assert.doesNotMatch(block, /textContent|innerText/,
        'the module must not read the translated button label to decide');
});

// ── Render assertions ───────────────────────────────────────────────────────
// The empty-group notice is the one piece of feed UI that explains an
// otherwise blank page, and it was covered only by its own logic, never by
// reading the node it attaches. These drive the renderer against the fake DOM
// and assert on what lands next to the toolbar.

function mountedToolbarFeature() {
    const built = makeFeature({ subscriptionGroupData: {} });
    const feature = built.feature;
    // The real toolbar sits inside the feed; the notice is placed after it.
    const container = new FakeNode('div');
    const toolbar = new FakeNode('div');
    toolbar.parentNode = container;
    container.children.push(toolbar);
    document.body.children.push(container);
    container.parentNode = document.body;
    toolbar.isConnected = true;
    feature._toolbar = toolbar;
    return { ...built, container, toolbar };
}

test('an empty group renders a notice explaining the blank feed', () => {
    const previousDocument = globalThis.document;
    globalThis.document = new FakeDocument();
    try {
        const { feature, container } = mountedToolbarFeature();

        feature._renderGroupEmptyState(new Set());

        const notice = container.children.find(
            (child) => child.className === 'ytkit-sub-group-empty');
        assert.ok(notice, 'an empty group must explain itself');
        assert.equal(notice.getAttribute('role'), 'status',
            'the notice has to be announced, not just drawn');
        assert.ok(notice.textContent.length > 0, 'the notice needs copy');
    } finally {
        globalThis.document = previousDocument;
    }
});

test('a populated group renders no empty-state notice', () => {
    const previousDocument = globalThis.document;
    globalThis.document = new FakeDocument();
    try {
        const { feature, container } = mountedToolbarFeature();

        feature._renderGroupEmptyState(new Set(['UCchannel11111111111111']));

        assert.equal(
            container.children.filter((c) => c.className === 'ytkit-sub-group-empty').length,
            0,
            'a group whose channels simply have not rendered yet must not be labelled empty');
    } finally {
        globalThis.document = previousDocument;
    }
});

test('zero total groups renders a labelled next-action state in the canonical module tree', () => {
    const previousDocument = globalThis.document;
    globalThis.document = new FakeDocument();
    try {
        const { feature } = makeFeature({ subscriptionGroupData: {} });
        const moduleBar = new FakeNode('div');
        feature._renderGroupsEmptyState(moduleBar, {});

        const notice = moduleBar.querySelector('.ytkit-sub-groups-empty');
        assert.ok(notice, 'the module must attach the zero-groups state');
        assert.equal(notice.getAttribute('role'), 'status');
        assert.equal(notice.getAttribute('aria-labelledby'), 'ytkit-sub-groups-empty-title');
        assert.equal(notice.children[0].tagName, 'STRONG');
        assert.equal(notice.children[0].id, 'ytkit-sub-groups-empty-title');
        assert.match(notice.children[0].textContent, /groups/i);
        assert.match(notice.children[1].textContent, /\+ Group/,
            'the state must name the control that creates the first group');

        const populatedBar = new FakeNode('div');
        feature._renderGroupsEmptyState(populatedBar, { saved: { name: 'Saved' } });
        assert.equal(populatedBar.querySelector('.ytkit-sub-groups-empty'), null,
            'the zero-groups state must disappear once a group exists');
    } finally {
        globalThis.document = previousDocument;
    }
});

test('re-rendering the empty state does not stack duplicate notices', () => {
    const previousDocument = globalThis.document;
    globalThis.document = new FakeDocument();
    try {
        const { feature, container } = mountedToolbarFeature();

        feature._renderGroupEmptyState(new Set());
        feature._renderGroupEmptyState(new Set());
        feature._renderGroupEmptyState(new Set());

        assert.equal(
            container.children.filter((c) => c.className === 'ytkit-sub-group-empty').length,
            1,
            'each render must clear the previous notice first');
    } finally {
        globalThis.document = previousDocument;
    }
});

// ── Undoing a delete ──

test('the undo restores a deleted group whole, membership and nesting included', () => {
    const settings = {
        subscriptionGroupData: {
            g_parent: { name: 'Parent', channelIds: ['UCparent111111111111'], parentId: '' },
            g_child: { name: 'Child', channelIds: ['UCchild1111111111111'], parentId: 'g_parent' },
            g_other: { name: 'Other', channelIds: ['UCother1111111111111'], parentId: '' }
        }
    };
    withStubbedDialogs({ promptWith: null }, () => {
        const { appState, feature, toasts } = makeFeature(JSON.parse(JSON.stringify(settings)));
        feature._closeMembersPanel = () => {};
        const before = JSON.parse(JSON.stringify(appState.settings.subscriptionGroupData));
        assert.equal(feature._getGroupParentId('g_child'), 'g_parent', 'the child must start nested');

        toasts.length = 0;
        feature._deleteGroup('g_parent');

        assert.equal(appState.settings.subscriptionGroupData.g_parent, undefined);
        assert.ok(appState.settings.subscriptionGroupData.g_child,
            'deleting a parent must not delete its children');
        assert.equal(feature._getGroupParentId('g_child'), '',
            'a child whose parent is gone reads as top-level');

        const [message, , options] = toasts[toasts.length - 1];
        assert.match(String(message), /Deleted/);
        assert.equal(typeof options?.action?.onClick, 'function', 'the toast must offer an undo');

        options.action.onClick();

        assert.deepEqual(appState.settings.subscriptionGroupData, before,
            'undo must restore the tree exactly as it was, membership and nesting included');
        assert.equal(feature._getGroupParentId('g_child'), 'g_parent',
            'restoring the parent re-adopts its children');
    });
});

test('deleting a group never asks for confirmation', () => {
    const previousConfirm = globalThis.confirm;
    let asked = 0;
    globalThis.confirm = () => { asked += 1; return false; };
    try {
        withStubbedDialogs({ promptWith: null }, () => {
            const { appState, feature } = makeFeature({
                subscriptionGroupData: { g_doomed: { name: 'Doomed', channelIds: [], parentId: '' } }
            });
            feature._closeMembersPanel = () => {};
            feature._deleteGroup('g_doomed');
            assert.equal(asked, 0, 'no native confirm may be involved');
            assert.equal(appState.settings.subscriptionGroupData.g_doomed, undefined,
                'and a confirm that would have said no must not have blocked the delete');
        });
    } finally {
        globalThis.confirm = previousConfirm;
    }
});

test('undo refuses to overwrite a group that has taken the id back', () => {
    withStubbedDialogs({ promptWith: null }, () => {
        const { appState, feature, toasts } = makeFeature({
            subscriptionGroupData: { g_first: { name: 'First', channelIds: [], parentId: '' } }
        });
        feature._closeMembersPanel = () => {};
        feature._deleteGroup('g_first');
        const [, , options] = toasts[toasts.length - 1];

        // Something else holds that id now. Restoring would silently replace it.
        feature._writeGroups({ g_first: { name: 'Different group', channelIds: ['UCx'], parentId: '' } });
        options.action.onClick();

        assert.equal(appState.settings.subscriptionGroupData.g_first.name, 'Different group',
            'undo must not clobber whatever holds the id now');
        assert.match(String(toasts[toasts.length - 1][0]), /not restored/);
    });
});
