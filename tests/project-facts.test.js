'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    BEGIN_MARKER,
    END_MARKER,
    collectProjectFacts,
    renderProjectFactsBlock,
    validateDocument
} = require('../scripts/project-facts');

test('project facts are collected from the shipped source surfaces', () => {
    const facts = collectProjectFacts();

    assert.equal(facts.version, '4.65.0');
    assert.equal(facts.nodeFloor, '>=22');
    assert.deepEqual(facts.firefoxFloor, 'Firefox 142+');
    assert.equal(facts.locales.length, 11);
    assert.equal(facts.schemaEntries, 467);
    assert.equal(facts.schemaCategories, 18);
    // 100 since core/remote-list-scope.js joined the ISOLATED-world graph.
    assert.equal(facts.runtimeModules, 100);
    assert.equal(facts.featureModules.length, 26);
    assert.equal(facts.featureIds.length, 286);
    assert.equal(facts.selectorPackFiles.length, 33);
    assert.equal(facts.selectorSurfaces.length, 35);
    assert.deepEqual(facts.selectorAliases, ['channelProfile', 'masthead']);
    assert.deepEqual(facts.buildProfiles, ['store-safe', 'chromium-store', 'github-full']);
    // 6 since the user-configured filter-list origin pattern is github-full only.
    assert.equal(facts.fullOnlyOrigins.length, 6);
    assert.equal(facts.colorThemes.length, 7);
    assert.deepEqual(facts.themeControls, ['oledTheme', 'denseMode', 'tokenThemeBridge']);
    assert.match(facts.compatibility.music, /bounded YouTube Music/);
    assert.match(facts.compatibility.embed, /bounded \/embed/);
});

test('project-facts validation rejects missing and stale rendered blocks', () => {
    const facts = collectProjectFacts();
    const block = renderProjectFactsBlock(facts);

    assert.deepEqual(validateDocument(`intro\n${block}\n`, facts), []);
    assert.match(
        validateDocument(`intro\n${block.replace('`467` entries', '`466` entries')}\n`, facts)[0],
        /stale/
    );
    assert.match(validateDocument('intro\n', facts)[0], /exactly one/);
    assert.equal(block.startsWith(BEGIN_MARKER), true);
    assert.equal(block.endsWith(END_MARKER), true);
});
