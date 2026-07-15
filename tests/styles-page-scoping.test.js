'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function loadStylesHarness() {
    const previousCore = globalThis.YTKitCore;
    const previousDocument = globalThis.document;
    const styles = new Map();
    const bodyClasses = new Set();

    globalThis.YTKitCore = {};
    globalThis.document = {
        createElement(tag) {
            return {
                tagName: tag,
                id: '',
                textContent: '',
                remove() { styles.delete(this.id); }
            };
        },
        getElementById(id) { return styles.get(id) || null; },
        head: {
            appendChild(style) {
                styles.set(style.id, style);
                return style;
            }
        },
        documentElement: null,
        body: {
            classList: {
                add(value) { bodyClasses.add(value); },
                remove(value) { bodyClasses.delete(value); }
            }
        }
    };

    delete require.cache[require.resolve('../extension/core/styles.js')];
    const stylesModule = require('../extension/core/styles.js');
    return {
        ...stylesModule,
        styles,
        bodyClasses,
        restore() {
            globalThis.YTKitCore = previousCore;
            globalThis.document = previousDocument;
            delete require.cache[require.resolve('../extension/core/styles.js')];
        }
    };
}

test('CSS lifecycle specs normalize and expose immutable page scopes', () => {
    const harness = loadStylesHarness();
    try {
        const scoped = harness.createCssLifecycleSpec({
            id: 'scoped',
            category: 'shell',
            pageScopes: [' Watch ', 'home', 'watch', ''],
            buildCss: () => '.scoped { display: none; }'
        });
        assert.deepEqual(scoped.pageScopes, ['watch', 'home']);
        assert.equal(Object.isFrozen(scoped.pageScopes), true);

        const global = harness.createCssLifecycleSpec({
            id: 'global',
            category: 'shell',
            buildCss: () => '.global { display: none; }'
        });
        assert.deepEqual(global.pageScopes, ['all']);
    } finally {
        harness.restore();
    }
});

test('page-scoped styles mount only on matching routes and leave no long-session residue', () => {
    const harness = loadStylesHarness();
    try {
        const spec = harness.createCssLifecycleSpec({
            id: 'watch-style',
            category: 'watch-player',
            pageScopes: ['watch'],
            buildCss: () => '.watch-only { display: none; }'
        });
        const styleId = 'yt-suite-style-watch-style';
        const bodyClass = 'ytkit-watch-style';

        spec.init({ currentPage: 'home' });
        assert.equal(harness.styles.has(styleId), false);
        assert.equal(harness.bodyClasses.has(bodyClass), false);

        for (let index = 0; index < 50; index += 1) {
            spec.apply({ currentPage: 'watch' });
            assert.equal(harness.styles.size, 1, 'matching route keeps exactly one owned style');
            assert.equal(harness.bodyClasses.has(bodyClass), true);
            spec.apply({ currentPage: 'subscriptions' });
            assert.equal(harness.styles.size, 0, 'leaving scope removes the owned style');
            assert.equal(harness.bodyClasses.has(bodyClass), false, 'leaving scope removes the owned body class');
        }

        spec.destroy({});
        assert.equal(harness.styles.size, 0);
        assert.equal(harness.bodyClasses.size, 0);
    } finally {
        harness.restore();
    }
});

test('every registered style lifecycle spec declares an explicit page scope', () => {
    const files = [
        'extension/features/home-subs-css/index.js',
        'extension/features/wave-8-css/index.js',
        'extension/features/theme-css/index.js',
        'extension/features/blue-light-filter/index.js',
        'extension/features/video-filters/index.js',
        'extension/features/subtitles/index.js'
    ];
    for (const relativePath of files) {
        const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
        assert.match(source, /pageScopes/,
            `${relativePath} must declare page scopes for its lifecycle styles`);
    }

    const ytkitSource = fs.readFileSync(path.join(ROOT, 'extension/ytkit.js'), 'utf8');
    const factoryStart = ytkitSource.indexOf('function cssFeature(');
    const factoryBody = ytkitSource.slice(factoryStart, factoryStart + 2600);
    assert.match(factoryBody, /const lifecyclePages = Array\.isArray\(pageScopes\) && !pageScopes\.includes\('all'\)/);
    assert.match(factoryBody, /\.\.\.\(lifecyclePages \? \{ pages: lifecyclePages \} : \{\}\)/);
    assert.match(factoryBody, /currentPage: appState\.currentPage \|\| getCurrentPage\(\)/);
});
