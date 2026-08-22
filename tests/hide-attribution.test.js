'use strict';

// Explain every hide, not just Video Hider's.
//
// Four features hide feed cards. Until v4.68.0 only Video Hider left any
// trace of having done so, which is why "disable Video Hider" cleared
// nothing during the v4.58.1 incident — the cards were being hidden by
// hideCollaborations, and nothing in the page, the popup, or a bug report
// could say so.
//
// core/hide-attribution.js is the shared marker. These tests cover the
// module's contract; the static half at the bottom pins that all four
// hiders actually route through it, because a marker only one feature
// stamps is exactly the bug this replaces.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

function loadHideAttribution() {
    globalThis.YTKitCore = {};
    const src = fs.readFileSync(path.join(repoRoot, 'extension/core/hide-attribution.js'), 'utf8');
    // eslint-disable-next-line no-eval
    (0, eval)(src);
    return globalThis.YTKitCore;
}

// Minimal element/document stand-ins: this module is DOM-only by design, so
// it can be exercised without a browser.
function createElement(tagName = 'div') {
    const element = {
        nodeType: 1,
        tagName: tagName.toUpperCase(),
        attributes: new Map(),
        dataset: {},
        parentNode: null,
        isConnected: true,
        textContent: '',
        className: '',
        ownerDocument: null,
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; },
        removeAttribute(name) { this.attributes.delete(name); },
        remove() {
            if (!this.parentNode) return;
            const index = this.parentNode.children.indexOf(this);
            if (index >= 0) this.parentNode.children.splice(index, 1);
            this.parentNode = null;
            this.isConnected = false;
        }
    };
    return element;
}

function createParent() {
    const parent = createElement('section');
    parent.children = [];
    parent.insertBefore = (node, reference) => {
        const index = reference ? parent.children.indexOf(reference) : parent.children.length;
        parent.children.splice(index < 0 ? parent.children.length : index, 0, node);
        node.parentNode = parent;
        node.isConnected = true;
        return node;
    };
    return parent;
}

function attachCard(parent, doc) {
    const card = createElement('ytd-rich-item-renderer');
    card.ownerDocument = doc;
    card.parentNode = parent;
    parent.children.push(card);
    return card;
}

function createDocument() {
    return { createElement: (tag) => createElement(tag) };
}

test('a hidden card names the feature and the rule that hid it', () => {
    const core = loadHideAttribution();
    core.resetHideAttribution();
    const parent = createParent();
    const card = attachCard(parent, createDocument());

    const changed = core.markCardHidden(card, {
        featureId: 'hideCollaborations',
        featureName: 'Hide Collaborations',
        rule: 'collaboration'
    });

    assert.equal(changed, true);
    assert.deepEqual(core.describeHiddenCard(card), {
        featureId: 'hideCollaborations',
        rule: 'collaboration'
    });
});

test('re-marking the same card with the same rule is a no-op, not a second hide', () => {
    const core = loadHideAttribution();
    core.resetHideAttribution();
    const parent = createParent();
    const card = attachCard(parent, createDocument());
    const mark = () => core.markCardHidden(card, { featureId: 'f', featureName: 'F', rule: 'r' });

    assert.equal(mark(), true);
    assert.equal(mark(), false, 'a mutation tick that re-judges the same card must not re-count it');
    assert.equal(core.getHideAttributionCounts()[0].hidden, 1);
});

test('a card re-judged under a different rule by the same feature stays one card', () => {
    const core = loadHideAttribution();
    core.resetHideAttribution();
    const parent = createParent();
    const card = attachCard(parent, createDocument());
    core.markCardHidden(card, { featureId: 'videoHider', featureName: 'Video Hider', rule: 'keyword' });
    core.markCardHidden(card, { featureId: 'videoHider', featureName: 'Video Hider', rule: 'duration' });

    const entry = core.getHideAttributionCounts()[0];
    assert.equal(entry.hidden, 1, 'the feature total must not inflate when a rule changes');
    assert.equal(entry.rules.duration, 1);
    assert.ok(!entry.rules.keyword, 'the old rule must give the card up, not keep it');
});

test('a feature can only clear a marker it owns', () => {
    const core = loadHideAttribution();
    core.resetHideAttribution();
    const parent = createParent();
    const card = attachCard(parent, createDocument());
    core.markCardHidden(card, { featureId: 'hideCollaborations', rule: 'collaboration' });

    assert.equal(core.unmarkCardHidden(card, 'removeAllShorts'), false,
        'one hider must not clear another hider\'s attribution');
    assert.equal(core.describeHiddenCard(card).featureId, 'hideCollaborations');

    assert.equal(core.unmarkCardHidden(card, 'hideCollaborations'), true);
    assert.equal(core.describeHiddenCard(card), null);
});

test('restoring a card takes its count back down', () => {
    const core = loadHideAttribution();
    core.resetHideAttribution();
    const parent = createParent();
    const doc = createDocument();
    const first = attachCard(parent, doc);
    const second = attachCard(parent, doc);
    core.markCardHidden(first, { featureId: 'f', rule: 'r' });
    core.markCardHidden(second, { featureId: 'f', rule: 'r' });
    assert.equal(core.getHideAttributionCounts()[0].hidden, 2);

    core.unmarkCardHidden(second, 'f');
    assert.equal(core.getHideAttributionCounts()[0].hidden, 1);
});

test('the note is a sibling of the card, because the card itself is display:none', () => {
    const core = loadHideAttribution();
    core.resetHideAttribution();
    const parent = createParent();
    const card = attachCard(parent, createDocument());
    core.markCardHidden(card, { featureId: 'hideCollaborations', rule: 'collaboration' });

    const note = core.syncHiddenNote(card, { enabled: true, text: 'Hidden by Hide Collaborations: multi-creator upload' });
    assert.ok(note, 'a note must be created when the explain toggle is on');
    assert.equal(note.parentNode, parent);
    assert.notEqual(parent.children.indexOf(note), -1);
    assert.equal(note.textContent, 'Hidden by Hide Collaborations: multi-creator upload');
    assert.equal(note.getAttribute('aria-label'), note.textContent);
    assert.equal(note.dataset.ytkitHiddenBy, 'hideCollaborations');
});

test('turning the explain toggle off removes the note instead of leaving it stranded', () => {
    const core = loadHideAttribution();
    core.resetHideAttribution();
    const parent = createParent();
    const card = attachCard(parent, createDocument());
    core.markCardHidden(card, { featureId: 'f', rule: 'r' });
    core.syncHiddenNote(card, { enabled: true, text: 'note' });
    assert.equal(parent.children.length, 2);

    core.syncHiddenNote(card, { enabled: false, text: 'note' });
    assert.equal(parent.children.length, 1, 'the note must be removed, not merely blanked');
});

test('repeated syncs update one note rather than stacking siblings', () => {
    const core = loadHideAttribution();
    core.resetHideAttribution();
    const parent = createParent();
    const card = attachCard(parent, createDocument());
    core.markCardHidden(card, { featureId: 'f', rule: 'r' });
    for (let i = 0; i < 5; i += 1) core.syncHiddenNote(card, { enabled: true, text: `note ${i}` });

    const notes = parent.children.filter((child) => child.className === 'ytkit-hidden-note');
    assert.equal(notes.length, 1, `expected one note, found ${notes.length}`);
    assert.equal(notes[0].textContent, 'note 4');
});

test('counts are reported worst-first and reset per navigation', () => {
    const core = loadHideAttribution();
    core.resetHideAttribution();
    const parent = createParent();
    const doc = createDocument();
    for (let i = 0; i < 3; i += 1) {
        core.markCardHidden(attachCard(parent, doc), { featureId: 'removeAllShorts', featureName: 'Remove Shorts', rule: 'shorts' });
    }
    core.markCardHidden(attachCard(parent, doc), { featureId: 'hideCollaborations', featureName: 'Hide Collaborations', rule: 'collaboration' });

    const counts = core.getHideAttributionCounts();
    assert.deepEqual(counts.map((c) => [c.featureId, c.hidden]), [
        ['removeAllShorts', 3],
        ['hideCollaborations', 1]
    ]);

    core.resetHideAttribution();
    assert.deepEqual(core.getHideAttributionCounts(), [],
        'a navigation must start the count over — "42 hidden" only means something against one feed');
});

// ── the part that would have caught v4.58.1 ──

test('every feed-hiding feature routes through the shared marker', () => {
    const ytkit = fs.readFileSync(path.join(repoRoot, 'extension/ytkit.js'), 'utf8');
    const videoHider = fs.readFileSync(
        path.join(repoRoot, 'extension/features/video-hider/index.js'), 'utf8'
    );
    // Each of these hid cards with a private mechanism and left no trace of
    // which feature did it. If any of them stops stamping the marker, the
    // popup's per-feature hide counts silently under-report and the note
    // beside the card disappears — the exact failure this replaces.
    const HIDERS = [
        { id: 'removeAllShorts', rule: 'shorts' },
        { id: 'hideCollaborations', rule: 'collaboration' },
        { id: 'hidePlannedLivestreams', rule: 'scheduled' },
    ];
    for (const hider of HIDERS) {
        const start = ytkit.indexOf(`id: '${hider.id}'`);
        assert.ok(start > -1, `${hider.id} feature must exist`);
        // Bound the window at the next feature id so a match cannot be
        // borrowed from a neighbouring feature's body.
        const nextId = ytkit.indexOf("\n            id: '", start + 1);
        const body = ytkit.slice(start, nextId > start ? nextId : start + 20000);
        assert.match(body, /applyHideAttribution\(/,
            `${hider.id} must stamp the shared hide marker`);
        assert.ok(body.includes(`rule: '${hider.rule}'`),
            `${hider.id} must name its matched rule as '${hider.rule}'`);
    }

    // Video Hider keeps its own richer placeholder but must still stamp the
    // shared marker, or the counts cover three hiders out of four.
    const vhStart = videoHider.indexOf('_applyVideoHiddenState(element, shouldHide');
    assert.ok(vhStart > -1, 'Video Hider module must still own _applyVideoHiddenState');
    const vhBody = videoHider.slice(vhStart, vhStart + 2000);
    assert.match(vhBody, /markCardHidden\?\.\(/, 'Video Hider must stamp the shared marker');
    assert.match(vhBody, /unmarkCardHidden\?\.\(/, 'Video Hider must clear the shared marker when it restores a card');
});

test('the explain toggle describes every hider, not only Video Hider', () => {
    const messages = JSON.parse(
        fs.readFileSync(path.join(repoRoot, 'extension/_locales/en/messages.json'), 'utf8')
    );
    const description = messages.videoHiderShowFilterReasonDesc?.message || '';
    // The old copy said "which local rule matched", which read as a Video
    // Hider-only promise and was the accurate description at the time.
    assert.match(description, /Hide Collaborations/, 'the toggle copy must name the other hiders it now covers');
    assert.match(description, /Remove Shorts/);
    for (const key of ['hiddenCardNoteTpl', 'hiddenRuleCollaboration', 'hiddenRuleScheduled', 'hiddenRuleShorts']) {
        assert.ok(messages[key]?.message, `${key} must be localizable`);
    }
    assert.match(messages.hiddenCardNoteTpl.message, /\{feature\}/);
    assert.match(messages.hiddenCardNoteTpl.message, /\{rule\}/);
});

test('hide counts reset on the same route boundary the mutation budgets use', () => {
    const navigation = fs.readFileSync(path.join(repoRoot, 'extension/core/navigation.js'), 'utf8');
    const start = navigation.indexOf('function runNavigateRules');
    assert.ok(start > -1);
    const body = navigation.slice(start, start + 1200);
    assert.match(body, /resetMutationRuleHealthForRoute\(\)/);
    assert.match(body, /resetHideAttribution\?\.\(\)/,
        'per-navigation hide counts must reset where the route actually changes');
});
