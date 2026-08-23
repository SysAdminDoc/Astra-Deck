'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    DOCUMENT_TARGETS,
    collectStagedInventories,
    renderGeneratedBlock,
    validateDocument,
} = require('../scripts/generate-reviewer-resource-docs.js');

const repoRoot = path.join(__dirname, '..');

test('reviewer resource docs match all staged profile and browser manifests', () => {
    const inventories = collectStagedInventories();
    assert.equal(inventories.length, 6);
    assert.deepEqual(
        inventories.map(({ profile, browser }) => `${profile}/${browser}`),
        [
            'store-safe/chromium',
            'store-safe/firefox',
            'chromium-store/chromium',
            'chromium-store/firefox',
            'github-full/chromium',
            'github-full/firefox',
        ],
    );
    const block = renderGeneratedBlock(inventories);
    assert.match(block, /runtime-core-loader\.mjs/);
    assert.match(block, /use_dynamic_url: true/);
    assert.match(block, /no remote code is loaded/i);
    for (const relativePath of DOCUMENT_TARGETS) {
        const content = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
        assert.deepEqual(validateDocument(content, block), [], `${relativePath} must be current`);
    }
});

test('reviewer resource docs reject staged-resource and prose drift independently', () => {
    const inventories = collectStagedInventories();
    const expectedBlock = renderGeneratedBlock(inventories);
    const changedInventories = structuredClone(inventories);
    changedInventories[0].entries[1].resources.push('core/staged-resource-bait.js');
    const changedBlock = renderGeneratedBlock(changedInventories);
    assert.notEqual(changedBlock, expectedBlock, 'a staged resource change must change generated reviewer copy');

    const relativePath = DOCUMENT_TARGETS[0];
    const content = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
    assert.ok(validateDocument(content, changedBlock).includes('generated reviewer resource inventory is stale'),
        'a staged resource change alone must make current documentation stale');

    const proseDrift = content.replace('no remote code is loaded', 'remote code status is not stated');
    assert.ok(validateDocument(proseDrift, expectedBlock).includes('generated reviewer resource inventory is stale'),
        'a prose change alone inside the generated block must fail');

    const falseClaim = content + '\nJavaScript is not web-accessible in any build profile.\n';
    assert.ok(validateDocument(falseClaim, expectedBlock)
        .includes('document still claims packaged JavaScript is not web-accessible'));
});
