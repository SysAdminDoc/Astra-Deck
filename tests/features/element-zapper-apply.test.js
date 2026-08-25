'use strict';

// The apply path is where a stored rule becomes a hidden element, and where
// the v4.58.1 lesson has to hold: nothing gets hidden without the shared
// attribution marker, and nothing gets restored that this feature did not
// hide. The picker half runs against a connected event-aware fake document,
// so placement, pointer hit-testing, refusal copy, and teardown are observable.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { fakeNode, fakeTreeDocument } = require('../helpers/monolith');

const repoRoot = path.join(__dirname, '..', '..');
const moduleSource = fs.readFileSync(
    path.join(repoRoot, 'extension/features/element-zapper/index.js'), 'utf8');

function loadFeatureModule() {
    globalThis.YTKitCore = {};
    globalThis.YTKitFeatures = {};
    for (const file of ['extension/core/hide-attribution.js', 'extension/core/element-zapper.js']) {
        // eslint-disable-next-line no-eval
        (0, eval)(fs.readFileSync(path.join(repoRoot, file), 'utf8'));
    }
    // eslint-disable-next-line no-eval
    (0, eval)(moduleSource);
    return globalThis.YTKitFeatures.createElementZapperFeature;
}

function node(tagName, parent = null) {
    const attrs = new Map();
    const element = {
        nodeType: 1,
        tagName: String(tagName).toUpperCase(),
        id: '',
        className: '',
        parentElement: parent,
        parentNode: parent,
        ownerDocument: null,
        styles: new Map(),
        style: {
            setProperty(name, value) { element.styles.set(name, value); },
            removeProperty(name) { element.styles.delete(name); }
        },
        getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
        setAttribute(name, value) { attrs.set(name, String(value)); },
        removeAttribute(name) { attrs.delete(name); },
        hasAttribute(name) { return attrs.has(name); }
    };
    return element;
}

// A document that answers two kinds of query: a rule selector, and the
// restore sweep's marker selector.
function fakeDocument(matchesBySelector) {
    return {
        querySelectorAll(selector) {
            if (selector === '[data-ytkit-zapped="1"]') {
                return Object.values(matchesBySelector)
                    .flat()
                    .filter((element) => element.getAttribute('data-ytkit-zapped') === '1');
            }
            return matchesBySelector[selector] || [];
        }
    };
}

function build(matchesBySelector, storedRules = [], overrides = {}) {
    const createFeature = loadFeatureModule();
    let stored = storedRules;
    const rules = [];
    const navigate = [];
    const instance = createFeature({
        appState: { settings: {} },
        addMutationRule: (id, fn) => rules.push({ id, fn }),
        removeMutationRule: (id) => rules.splice(rules.findIndex((r) => r.id === id), 1),
        addNavigateRule: (id, fn) => navigate.push({ id, fn }),
        removeNavigateRule: (id) => navigate.splice(navigate.findIndex((r) => r.id === id), 1),
        storageReadJSON: () => stored,
        storageWriteJSON: (_key, value) => { stored = value; },
        injectStyle: () => {},
        showToast: () => {},
        ...overrides,
        documentRef: overrides.documentRef || fakeDocument(matchesBySelector)
    });
    return {
        feature: instance.elementZapperFeature,
        readStored: () => stored,
        mutationRules: rules,
        navigateRules: navigate
    };
}

test('a stored rule hides what it matches and stamps the shared attribution marker', () => {
    const shelf = node('ytd-rich-section-renderer');
    const { feature } = build(
        { 'ytd-rich-section-renderer': [shelf] },
        [{ selector: 'ytd-rich-section-renderer', label: 'News shelf' }]
    );
    feature.init();

    assert.equal(shelf.styles.get('display'), 'none');
    assert.equal(shelf.getAttribute('data-ytkit-zapped'), '1');
    assert.equal(shelf.getAttribute('data-ytkit-hidden-by'), 'elementZapper',
        'a hide with no attribution is a hide nobody can debug');
    assert.equal(shelf.getAttribute('data-ytkit-hidden-rule'), 'News shelf');

    const counts = globalThis.YTKitCore.getHideAttributionCounts();
    assert.equal(counts.find((row) => row.featureId === 'elementZapper')?.hidden, 1);
});

test('destroy restores what this feature hid, and only that', () => {
    const mine = node('ytd-rich-section-renderer');
    const theirs = node('ytd-rich-section-renderer');
    const { feature } = build(
        { 'ytd-rich-section-renderer': [mine, theirs] },
        [{ selector: 'ytd-rich-section-renderer' }]
    );
    feature.init();
    // Video Hider re-judges the second card and takes the marker over. The
    // zapper still carries its own `data-ytkit-zapped` flag on it, so the
    // restore sweep will visit it.
    globalThis.YTKitCore.markCardHidden(theirs, { featureId: 'hideVideosFromHome', rule: 'keyword' });
    feature.destroy();

    assert.equal(mine.getAttribute('data-ytkit-zapped'), null);
    assert.equal(mine.getAttribute('data-ytkit-hidden-by'), null);
    assert.equal(mine.styles.has('display'), false);
    assert.equal(theirs.getAttribute('data-ytkit-hidden-by'), 'hideVideosFromHome',
        'unmarkCardHidden only clears a marker its caller owns, so the other feature keeps its attribution');
});

test('the restore sweep is scoped to this feature\'s own flag', () => {
    // A card another feature hid never carries `data-ytkit-zapped`, so it is
    // not even visited. This is the first of the two protections; the
    // ownership check above is the second, for a card both features touched.
    const untouched = node('ytd-rich-section-renderer');
    const { feature } = build({ 'ytd-rich-section-renderer': [untouched] });
    feature.init();
    globalThis.YTKitCore.markCardHidden(untouched, { featureId: 'hideCollaborations', rule: 'collab' });
    untouched.style.setProperty('display', 'none', 'important');
    feature.destroy();

    assert.equal(untouched.getAttribute('data-ytkit-hidden-by'), 'hideCollaborations');
    assert.equal(untouched.styles.get('display'), 'none',
        'restoring a card this feature never hid would un-hide someone else\'s work');
});

test('adding a rule persists it and applies it immediately', () => {
    const shelf = node('ytd-merch-shelf-renderer');
    const { feature, readStored } = build({ 'ytd-merch-shelf-renderer': [shelf] });
    feature.init();
    assert.equal(shelf.getAttribute('data-ytkit-zapped'), null);

    const added = feature.addRule({ selector: 'ytd-merch-shelf-renderer' });
    assert.ok(added);
    assert.equal(shelf.getAttribute('data-ytkit-zapped'), '1');
    assert.deepEqual(readStored().map((rule) => rule.selector), ['ytd-merch-shelf-renderer']);

    assert.equal(feature.addRule({ selector: 'ytd-merch-shelf-renderer' }), null,
        'the same selector twice is one rule');
    assert.equal(feature.addRule({ selector: 'ytd-player' }), null,
        'the grammar refuses it here too, not only at the picker');
});

test('removing one of two rules that matched the same node keeps the node hidden', () => {
    // The reason removeRule restores everything and re-applies instead of
    // un-hiding just this rule's matches: overlap is normal, and a node the
    // other rule still matches must not reappear.
    const shelf = node('ytd-merch-shelf-renderer');
    const { feature } = build(
        {
            'ytd-merch-shelf-renderer': [shelf],
            'ytd-watch-flexy ytd-merch-shelf-renderer': [shelf]
        },
        [
            { selector: 'ytd-merch-shelf-renderer' },
            { selector: 'ytd-watch-flexy ytd-merch-shelf-renderer' }
        ]
    );
    feature.init();
    assert.equal(shelf.getAttribute('data-ytkit-zapped'), '1');

    assert.equal(feature.removeRule('ytd-merch-shelf-renderer'), true);
    assert.equal(shelf.getAttribute('data-ytkit-zapped'), '1', 'the other rule still matches it');

    assert.equal(feature.removeRule('ytd-watch-flexy ytd-merch-shelf-renderer'), true);
    assert.equal(shelf.getAttribute('data-ytkit-zapped'), null);
    assert.equal(shelf.styles.has('display'), false);
});

test('disabling a rule un-hides without deleting it', () => {
    const shelf = node('ytd-merch-shelf-renderer');
    const { feature, readStored } = build(
        { 'ytd-merch-shelf-renderer': [shelf] },
        [{ selector: 'ytd-merch-shelf-renderer' }]
    );
    feature.init();
    assert.equal(shelf.getAttribute('data-ytkit-zapped'), '1');

    assert.equal(feature.setRuleEnabled('ytd-merch-shelf-renderer', false), true);
    assert.equal(shelf.getAttribute('data-ytkit-zapped'), null);
    assert.equal(readStored().length, 1);
    assert.equal(readStored()[0].enabled, false);

    feature.setRuleEnabled('ytd-merch-shelf-renderer', true);
    assert.equal(shelf.getAttribute('data-ytkit-zapped'), '1');
});

test('an invalid stored rule is dropped at load rather than reaching the DOM', () => {
    const shelf = node('ytd-merch-shelf-renderer');
    const { feature } = build(
        { 'ytd-merch-shelf-renderer': [shelf], 'ytd-player': [node('ytd-player')] },
        [{ selector: 'ytd-player' }, { selector: '.style-scope' }]
    );
    feature.init();
    assert.equal(feature.getRules().length, 0);
    assert.equal(shelf.getAttribute('data-ytkit-zapped'), null);
});

test('lifecycle registers and removes both rule hooks', () => {
    const { feature, mutationRules, navigateRules } = build({});
    feature.init();
    assert.deepEqual(mutationRules.map((rule) => rule.id), ['elementZapper']);
    assert.deepEqual(navigateRules.map((rule) => rule.id), ['elementZapper']);
    feature.destroy();
    assert.equal(mutationRules.length, 0);
    assert.equal(navigateRules.length, 0);
});

// ── Picker contract ──────────────────────────────────────────────────────────

function pickerHarness() {
    const documentRef = fakeTreeDocument();
    const target = documentRef.createElement('ytd-rich-section-renderer');
    target.getBoundingClientRect = () => ({ left: 12, top: 24, width: 320, height: 180 });
    let pointerEventsDuringHitTest = '';
    documentRef.elementFromPoint = () => {
        const overlay = documentRef.body.querySelector('.ytkit-zap-overlay');
        pointerEventsDuringHitTest = overlay?.style.pointerEvents;
        return target;
    };
    const built = build({}, [], { documentRef });
    return { ...built, documentRef, target, pointerEventsDuringHitTest: () => pointerEventsDuringHitTest };
}

test('the picker renders its three owned surfaces into the page body', () => {
    const { feature, documentRef } = pickerHarness();

    assert.equal(feature.startPicking(), true);

    assert.deepEqual(
        documentRef.body.children.map((child) => child.className),
        ['ytkit-zap-overlay', 'ytkit-zap-highlight', 'ytkit-zap-hint']
    );
    const hint = documentRef.body.querySelector('.ytkit-zap-hint');
    // By what each child IS, not where it sits: the hint gained a keyboard
    // line between the pointer instruction and Cancel, and a positional pin
    // fails on that without anything being wrong.
    assert.match(hint.children[0].textContent, /Click a shelf/);
    assert.ok(hint.children.some((child) => /arrow keys/.test(child.textContent)),
        'the hint must say the picker can be driven from the keyboard');
    assert.ok(hint.children.some((child) => child.textContent === 'Cancel'),
        'and must still offer Cancel');
    assert.equal(feature.isPicking(), true);
});

test('the picker names a refused target while the pointer is still moving', () => {
    const { feature, documentRef } = pickerHarness();
    const refusal = globalThis.YTKitCore.ELEMENT_ZAPPER_REFUSAL_REASONS.PLAYER;
    globalThis.YTKitCore.deriveStructuralSelector = () => ({ ok: false, reason: refusal });
    feature.startPicking();
    const overlay = documentRef.body.querySelector('.ytkit-zap-overlay');
    const move = [...overlay.listeners.get('mousemove')][0];

    move({ clientX: 20, clientY: 30 });

    const highlight = documentRef.body.querySelector('.ytkit-zap-highlight');
    const hint = documentRef.body.querySelector('.ytkit-zap-hint');
    assert.equal(highlight.getAttribute('data-refused'), '1');
    assert.match(hint.children[0].textContent, /player is off limits/i);
});

test('the picker hit-tests behind its overlay, positions the highlight, and tears down', () => {
    const { feature, documentRef, target, pointerEventsDuringHitTest } = pickerHarness();
    globalThis.YTKitCore.deriveStructuralSelector = () => ({
        ok: true,
        selector: 'ytd-rich-section-renderer',
        anchor: target,
        anchorTag: 'ytd-rich-section-renderer',
        anchorKind: 'shelf'
    });
    feature.startPicking();
    const overlay = documentRef.body.querySelector('.ytkit-zap-overlay');
    const move = [...overlay.listeners.get('mousemove')][0];

    move({ clientX: 20, clientY: 30 });

    const highlight = documentRef.body.querySelector('.ytkit-zap-highlight');
    assert.equal(pointerEventsDuringHitTest(), 'none');
    assert.equal(overlay.style.pointerEvents, '');
    assert.equal(highlight.style.left, '12px');
    assert.equal(highlight.style.width, '320px');
    assert.equal(documentRef.body.querySelector('.ytkit-zap-hint').children[0].textContent,
        'ytd-rich-section-renderer');

    feature.destroy();
    assert.equal(documentRef.body.children.length, 0);
    assert.equal(documentRef.listeners.get('keydown')?.size || 0, 0);
    assert.equal(feature.isPicking(), false);
});

// ── keyboard targeting ──

// WHEN the picker is open, the arrow keys SHALL move the selection through the
// page and Enter SHALL commit it, so choosing an element to hide does not
// require a pointer. It was mousemove plus click, with Escape as the only key
// the picker understood.
test('the picker can be driven entirely from the keyboard', () => {
    const { feature, documentRef } = pickerHarness();

    const shelf = fakeNode({ tag: 'ytd-rich-shelf-renderer' });
    const child = fakeNode({ tag: 'div', attributes: { id: 'contents' } });
    const sibling = fakeNode({ tag: 'ytd-rich-section-renderer' });
    const parent = fakeNode({ tag: 'ytd-browse' });
    parent.appendChild(shelf);
    parent.appendChild(sibling);
    shelf.appendChild(child);
    documentRef.body.appendChild(parent);

    const derived = [];
    globalThis.YTKitCore.deriveStructuralSelector = (element) => {
        derived.push(element);
        return { ok: true, selector: element.tagName.toLowerCase(), anchor: element, anchorTag: element.tagName, anchorKind: 'shelf' };
    };

    assert.equal(feature.startPicking(), true);
    const press = (key) => {
        let prevented = false;
        const event = { key, preventDefault() { prevented = true; }, stopPropagation() {} };
        for (const fn of documentRef.listeners.get('keydown') || []) fn(event);
        return prevented;
    };
    assert.ok((documentRef.listeners.get('keydown') || []).size > 0, 'the picker listens for keys');

    // First arrow with nothing aimed at picks a starting point rather than
    // doing nothing, which is the state a keyboard user always starts in.
    assert.equal(press('ArrowDown'), true, 'the first press must select something');
    const first = derived[derived.length - 1];
    assert.ok(first, 'a starting element was chosen');

    documentRef.body.querySelector = () => shelf;
    derived.length = 0;
    press('ArrowDown');
    press('ArrowRight');
    press('ArrowUp');
    assert.ok(derived.length >= 1, 'each move re-derives a selector for the new target');
});

test('the picker walks up, down and sideways from where it is', () => {
    const { feature, documentRef } = pickerHarness();
    const parent = fakeNode({ tag: 'ytd-browse' });
    const shelf = fakeNode({ tag: 'ytd-rich-shelf-renderer' });
    const nextShelf = fakeNode({ tag: 'ytd-rich-section-renderer' });
    const inner = fakeNode({ tag: 'div' });
    parent.appendChild(shelf);
    parent.appendChild(nextShelf);
    shelf.appendChild(inner);
    documentRef.body.appendChild(parent);
    documentRef.activeElement = shelf;

    const seen = [];
    globalThis.YTKitCore.deriveStructuralSelector = (element) => {
        seen.push(element);
        return { ok: true, selector: 'x', anchor: element, anchorTag: element.tagName, anchorKind: 'shelf' };
    };

    feature.startPicking();
    const press = (key) => { const e = { key, preventDefault() {}, stopPropagation() {} }; for (const fn of documentRef.listeners.get('keydown') || []) fn(e); };

    press('ArrowDown');
    assert.equal(seen[seen.length - 1], shelf, 'the first press takes the focused element');
    press('ArrowDown');
    assert.equal(seen[seen.length - 1], inner, 'down goes to the first child');
    press('ArrowUp');
    assert.equal(seen[seen.length - 1], shelf, 'up goes back to the parent');
    press('ArrowRight');
    assert.equal(seen[seen.length - 1], nextShelf, 'right goes to the next sibling');
    press('ArrowLeft');
    assert.equal(seen[seen.length - 1], shelf, 'and left comes back');
});

// WHEN Enter is pressed with something selected, the rule SHALL be created,
// exactly as a click would.
test('Enter commits the selection the way a click does', () => {
    const { feature, documentRef } = pickerHarness();
    const shelf = fakeNode({ tag: 'ytd-rich-shelf-renderer' });
    documentRef.body.appendChild(shelf);
    documentRef.activeElement = shelf;
    globalThis.YTKitCore.deriveStructuralSelector = (element) => ({
        ok: true, selector: 'ytd-rich-shelf-renderer', anchor: element, anchorTag: 'YTD-RICH-SHELF-RENDERER', anchorKind: 'shelf'
    });

    feature.startPicking();
    const press = (key) => { const e = { key, preventDefault() {}, stopPropagation() {} }; for (const fn of documentRef.listeners.get('keydown') || []) fn(e); };
    press('ArrowDown');
    assert.equal(feature.isPicking(), true);
    press('Enter');
    assert.equal(feature.isPicking(), false, 'committing closes the picker, as clicking does');
    assert.equal(feature.getRules().length, 1, 'and the rule is saved');
});

// WHEN focus is inside the hint (on Cancel), the picker SHALL leave the keys to
// that button rather than committing underneath it.
test('the Cancel button keeps its own keys', () => {
    const { feature, documentRef } = pickerHarness();
    const shelf = fakeNode({ tag: 'ytd-rich-shelf-renderer' });
    documentRef.body.appendChild(shelf);
    documentRef.activeElement = shelf;
    globalThis.YTKitCore.deriveStructuralSelector = (element) => ({
        ok: true, selector: 'x', anchor: element, anchorTag: 'X', anchorKind: 'shelf'
    });
    feature.startPicking();
    const press = (key) => { const e = { key, preventDefault() {}, stopPropagation() {} }; for (const fn of documentRef.listeners.get('keydown') || []) fn(e); };
    press('ArrowDown');

    const hint = documentRef.body.querySelector('.ytkit-zap-hint');
    const cancel = hint.children.find((child) => child.textContent === 'Cancel');
    documentRef.activeElement = cancel;
    press('Enter');
    assert.equal(feature.isPicking(), true,
        'Enter on Cancel must activate Cancel, not create a rule behind it');
    assert.equal(feature.getRules().length, 0);
});

test('Escape still cancels', () => {
    const { feature, documentRef } = pickerHarness();
    feature.startPicking();
    for (const fn of documentRef.listeners.get('keydown') || []) fn({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
    assert.equal(feature.isPicking(), false);
});
