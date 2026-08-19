'use strict';

// The apply path is where a stored rule becomes a hidden element, and where
// the v4.58.1 lesson has to hold: nothing gets hidden without the shared
// attribution marker, and nothing gets restored that this feature did not
// hide. The picker half is pinned from source — it is pointer-event
// choreography that a fake document cannot honestly exercise.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const moduleSource = fs.readFileSync(
    path.join(repoRoot, 'extension/features/element-zapper/index.js'), 'utf8');

function stripComments(text) {
    return text.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
}

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

function build(matchesBySelector, storedRules = []) {
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
        documentRef: fakeDocument(matchesBySelector)
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

// ── Picker contract (source-pinned) ─────────────────────────────────────────

test('the picker names the refusal while the pointer is still moving', () => {
    const body = stripComments(moduleSource);
    const describe = body.indexOf('const describe = (element) =>');
    assert.ok(describe > 0);
    const window = body.slice(describe, describe + 700);
    assert.match(window, /derivation\.ok !== true/);
    assert.match(window, /setAttribute\('data-refused', '1'\)/,
        'the outline itself has to say no, not a toast after the click');
    assert.match(window, /_describeRefusal\(derivation\.reason\)/);
});

test('the picker tears down every listener and node it added', () => {
    const body = stripComments(moduleSource);
    const stop = body.indexOf('stopPicking() {');
    assert.ok(stop > 0);
    const window = body.slice(stop, stop + 500);
    assert.match(window, /removeEventListener\('keydown', picker\.onKey, true\)/);
    for (const owned of ['overlay', 'highlight', 'hint']) {
        assert.match(window, new RegExp(`picker\\.${owned}\\.remove\\(\\)`), `${owned} must be removed`);
    }
    // destroy() must stop an in-flight pick, or the overlay outlives the
    // feature that owns it and the page keeps a crosshair cursor forever.
    const destroy = body.indexOf('destroy() {');
    assert.match(body.slice(destroy, destroy + 300), /this\.stopPicking\(\)/);
});

test('the overlay steps aside to read the element under the cursor', () => {
    const body = stripComments(moduleSource);
    const move = body.indexOf('const onMove = (event) =>');
    assert.ok(move > 0);
    const window = body.slice(move, move + 600);
    // The overlay covers the page to capture the click, so elementFromPoint
    // would otherwise only ever return the overlay itself.
    assert.match(window, /overlay\.style\.pointerEvents = 'none';[\s\S]*elementFromPoint/);
    assert.match(window, /elementFromPoint[\s\S]*overlay\.style\.pointerEvents = ''/);
});
