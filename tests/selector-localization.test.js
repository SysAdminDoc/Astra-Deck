'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.join(__dirname, '..');
const selectorGate = require(path.join(REPO_ROOT, 'scripts', 'check-localized-selectors.js'));

function loadSelectorCore() {
    const ctx = {
        console,
        Date,
        Math,
        globalThis: null,
        dispatchEvent() {}
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    const packsDir = path.join(REPO_ROOT, 'extension', 'core', 'selector-packs');
    const files = [
        'extension/core/registry.js',
        ...fs.readdirSync(packsDir)
            .filter((file) => file.endsWith('.js'))
            .sort()
            .map((file) => `extension/core/selector-packs/${file}`),
        'extension/core/selectors.js'
    ];
    for (const relative of files) {
        vm.runInContext(
            fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8'),
            ctx,
            { filename: relative }
        );
    }
    return ctx.globalThis.YTKitCore;
}

test('localized selector gate rejects new aria-label selectors and excludes blocked Popout chat', () => {
    const findings = selectorGate.collectSelectorFindingsFromSource(
        'a[aria-label="New action"], b[aria-label*="New action"]',
        'extension/features/example.js'
    );
    assert.equal(findings.length, 2);
    assert.equal(
        selectorGate.collectSelectorFindingsFromSource(
            'button[aria-label="Popout chat"]',
            'extension/features/live-chat/index.js'
        ).length,
        0
    );
});

test('watch and nav hooks put structural selectors before English fallbacks', () => {
    const core = loadSelectorCore();
    const share = core.getSurfaceHookSelectorEntry('watch', 'action.share');
    const create = core.getSurfaceHookSelectorEntry('nav', 'createButton');
    assert.ok(share && create);
    assert.ok(share.stable.some((selector) => selector.includes('yt-button-view-model')));
    assert.ok(share.stable.every((selector) => !selector.includes('aria-label')));
    assert.match(share.fallback.at(-1), /aria-label="Share"/);
    assert.match(create.stable[0], /path\[d\^=/);
    assert.match(create.fallback[0], /aria-label="Create"/);
    assert.ok(Object.isFrozen(core.SurfaceSelectorMap.watch.hooks));
    assert.ok(Object.isFrozen(core.SurfaceSelectorMap.watch.hooks['action.share']));
});

test('hook fallback resolution records structural misses in selector health', () => {
    const core = loadSelectorCore();
    const fallbackNode = { nodeType: 1, tagName: 'BUTTON', attributes: [], classList: [], childElementCount: 0 };
    const root = {
        querySelectorAll(selector) {
            return selector.includes('[aria-label="Share"]') ? [fallbackNode] : [];
        }
    };
    const matches = core.findSurfaceHookElements('watch', 'action.share', { root });
    assert.equal(matches.length, 1);
    const row = core.getSelectorHealthSnapshot().find((item) => item.surface === 'watch.action.share');
    assert.ok(row, 'hook health should be exported as its own diagnostic surface');
    assert.ok(row.selectors.some((item) => item.stable && item.misses > 0),
        'structural misses must be visible before the fallback hit');
    assert.ok(row.selectors.some((item) => !item.stable && item.hits > 0),
        'the fallback hit must be visible in selector health');
});

test('repository localized selector baseline has no unreviewed additions', () => {
    const result = selectorGate.checkLocalizedSelectors();
    assert.equal(result.additions.length, 0);
});
