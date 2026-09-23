'use strict';

// Theater Split's stylesheets, split out of features/sticky-video into their
// own part module. These pin what the part owes the controller: it loads on
// its own, every rule stays behind a Theater Split class or id, and the
// controller injects exactly these three sheets under the ids STYLE_IDS names.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..', '..');
const STYLES_PATH = '../../extension/features/sticky-video-styles/index.js';
const CONTROLLER_PATH = '../../extension/features/sticky-video/index.js';
const BUILDERS = ['buildSplitShellCss', 'buildSplitMetaCss', 'buildSplitCommentsCss'];

function loadStyles() {
    const originalFeatures = globalThis.YTKitFeatures;
    delete require.cache[require.resolve(STYLES_PATH)];
    globalThis.YTKitFeatures = {};
    const mod = require(STYLES_PATH);
    const registered = globalThis.YTKitFeatures.stickyVideoStyles;
    globalThis.YTKitFeatures = originalFeatures;
    return { mod, registered };
}

/** Selectors of every style rule, comments removed, keyframe steps and at-rules skipped. */
function ruleSelectors(css) {
    const selectors = [];
    let buffer = '';
    for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
        if (ch === '{') { selectors.push(buffer.trim()); buffer = ''; }
        else if (ch === '}' || ch === ';') buffer = '';
        else buffer += ch;
    }
    return selectors
        .filter((selector) => selector && !selector.startsWith('@'))
        .flatMap((selector) => selector.split(/,(?![^()]*\))/).map((part) => part.trim()))
        .filter((selector) => selector && !/^(from|to|\d+%)$/.test(selector));
}

test('the styles part loads on its own and registers a frozen API', () => {
    const { mod, registered } = loadStyles();
    assert.equal(registered, mod, 'the global registration and module.exports must be the same object');
    assert.ok(Object.isFrozen(mod));
    assert.deepEqual(Object.keys(mod).sort(), ['STYLE_IDS', ...BUILDERS].sort());
    assert.deepEqual(mod.STYLE_IDS, {
        shell: 'stickyVideo',
        meta: 'stickyVideo-meta-layout',
        comments: 'stickyVideo-comments'
    });
});

test('every rule in the three sheets stays behind a Theater Split selector', () => {
    const { mod } = loadStyles();
    for (const name of BUILDERS) {
        const css = mod[name]();
        assert.equal(mod[name](), css, `${name} must be deterministic`);
        const open = (css.match(/\{/g) || []).length;
        assert.equal((css.match(/\}/g) || []).length, open, `${name} must balance its braces`);
        const selectors = ruleSelectors(css);
        assert.ok(selectors.length > 50, `${name} produced only ${selectors.length} selectors`);
        // A rule that does not name an Astra class or id would restyle YouTube
        // whether or not Theater Split is open.
        const unscoped = selectors.filter((selector) => !selector.includes('ytkit'));
        assert.deepEqual(unscoped, [], `${name} has rules that escape Theater Split`);
    }
});

test('the controller injects exactly these sheets under the STYLE_IDS ids', () => {
    const { mod: styles } = loadStyles();
    delete require.cache[require.resolve(CONTROLLER_PATH)];
    const injected = [];
    const feature = require(CONTROLLER_PATH).createStickyVideoFeature({
        injectStyle: (css, id) => { injected.push({ css, id }); return { remove() {} }; }
    });
    feature.init();
    assert.deepEqual(injected.map((sheet) => sheet.id),
        [styles.STYLE_IDS.shell, styles.STYLE_IDS.meta, styles.STYLE_IDS.comments]);
    assert.deepEqual(injected.map((sheet) => sheet.css), BUILDERS.map((name) => styles[name]()));
});

// The extension imports feature modules concurrently, so the controller may
// load before its parts. It must look them up when the factory is called, and
// hand back nothing (ytkit.js then uses its descriptor stub) if one never came.
test('the controller resolves every part at call time, whatever order they loaded in', () => {
    const featuresDir = path.join(repoRoot, 'extension', 'features');
    const read = (dir) => fs.readFileSync(path.join(featuresDir, dir, 'index.js'), 'utf8');
    const parts = fs.readdirSync(featuresDir).filter((dir) => dir.startsWith('sticky-video-')).sort();
    assert.ok(parts.includes('sticky-video-styles'));
    // A browser-like global: no module, no require. The controller loads first.
    const context = vm.createContext({ YTKitFeatures: {} });
    vm.runInContext(read('sticky-video'), context);
    const create = context.YTKitFeatures.stickyVideo.createStickyVideoFeature;
    for (const dir of parts) {
        assert.equal(create({}), null, `with ${dir} still missing there is nothing to run`);
        vm.runInContext(read(dir), context);
    }
    const feature = create({});
    assert.equal(feature?.id, 'stickyVideo', 'the same factory works once every part has registered');
});
