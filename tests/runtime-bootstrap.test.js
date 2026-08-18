'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const manifest = require('../extension/manifest.json');
const bootstrapPath = path.join(repoRoot, 'extension', 'runtime-bootstrap.js');
const loaderPath = path.join(repoRoot, 'extension', 'runtime-core-loader.mjs');
const bootstrapSource = fs.readFileSync(bootstrapPath, 'utf8');
const loaderSource = fs.readFileSync(loaderPath, 'utf8');

function runtimeEntry() {
    return manifest.content_scripts.find((entry) =>
        Array.isArray(entry['x-ytkit-runtime-modules'])
        && entry['x-ytkit-runtime-modules'].includes('ytkit.js')
    );
}

function readGeneratedModules() {
    const match = bootstrapSource.match(
        /const RUNTIME_MODULES = Object\.freeze\(\s*(\[[\s\S]*?\])\s*\);/
    );
    assert.ok(match, 'runtime bootstrap must contain its generated module catalogue');
    return JSON.parse(match[1]);
}

function readGeneratedLoaderModules() {
    const match = loaderSource.match(
        /export const FOUNDATION_MODULES = Object\.freeze\(\s*(\[[\s\S]*?\])\s*\);/
    );
    assert.ok(match, 'the core loader must publish its foundation catalogue for diagnostics');
    return JSON.parse(match[1]);
}

test('normal YouTube pages inject a thin generated bootstrap and defer the runtime graph', () => {
    const entry = runtimeEntry();
    assert.ok(entry, 'normal YouTube runtime entry must exist');
    assert.deepEqual(entry.js, ['runtime-bootstrap.js']);
    assert.ok(fs.statSync(bootstrapPath).size <= 150 * 1024,
        'the always-on isolated script must remain below the 150 KB budget');
    assert.match(bootstrapSource, /import\(getURL\(modulePath\)\)/,
        'the bootstrap must dynamically import extension modules');
    assert.match(bootstrapSource, /Promise\.resolve\(\)\.then\(run\)/,
        'the runtime graph must be scheduled asynchronously after the bootstrap turn');
    assert.match(bootstrapSource, /storage\.get\('ytSuiteSettings'/,
        'the bootstrap must read the persisted settings before selecting deferred features');
    assert.match(bootstrapSource, /shouldLoadFeature/,
        'deferred modules must use the settings gate');
    assert.match(bootstrapSource, /__ytkitRuntimePromise/,
        'duplicate bootstrap execution must be idempotent');
    assert.match(bootstrapSource, /BOOTSTRAP_STATE_KEY/,
        'bootstrap re-entry must expose a diagnostic state object');
    assert.match(bootstrapSource, /duplicateInjections/,
        'duplicate bootstrap attempts must be counted, not silently ignored');
    assert.match(bootstrapSource, /phase = 'failed'/,
        'a failed module load must be observable and retryable');
});

test('generated runtime order, manifest catalogue, and dynamic resource allowlist stay aligned', () => {
    const entry = runtimeEntry();
    const manifestModules = entry['x-ytkit-runtime-modules'];
    const generatedModules = readGeneratedModules();
    assert.deepEqual(generatedModules, manifestModules,
        'runtime bootstrap must be regenerated when the manifest catalogue changes');
    assert.equal(new Set(generatedModules).size, generatedModules.length,
        'runtime module catalogue must not contain duplicates');
    assert.equal(generatedModules.includes('runtime-bootstrap.js'), false,
        'bootstrap must not recursively import itself');

    const warResources = new Set(
        manifest.web_accessible_resources.flatMap((entry) => entry.resources || [])
    );
    const runtimeResourceEntry = manifest.web_accessible_resources.find((entry) =>
        (entry.resources || []).includes('runtime-core-loader.mjs')
    );
    assert.ok(runtimeResourceEntry, 'runtime module resources must have a manifest entry');
    assert.equal(runtimeResourceEntry.use_dynamic_url, true,
        'every Chromium runtime resource must use a per-session dynamic URL');
    assert.ok(warResources.has('runtime-core-loader.mjs'),
        'the static module graph loader must be exposed for the dynamic import URL');
    // The loader imports the 75-module foundation graph CONCURRENTLY so V8 can
    // compile it off-thread; the sequential `await import()` loop it replaced
    // cost ~48 ms of a ~140 ms parse+init. This is safe only while no module
    // calls a sibling at evaluation time — tests/runtime-graph-order.test.js
    // holds that property by loading the graph in reverse.
    assert.match(loaderSource, /await Promise\.all\(FOUNDATION_MODULES\.map\(\(modulePath\) => import\(getURL\(modulePath\)\)\)\)/,
        'the core loader must import the foundation graph concurrently through runtime.getURL');
    assert.doesNotMatch(loaderSource, /for \(const modulePath of FOUNDATION_MODULES\)/,
        'the sequential dynamic-import loop must not come back — it serialized 75 compiles');
    // Static `import './core/x.js'` specifiers resolve against the canonical
    // extension origin, where these resources are deliberately NOT exposed under
    // use_dynamic_url — the real extension fails to boot. Measured, not guessed.
    assert.doesNotMatch(loaderSource, /^import '\.\//m,
        'static relative specifiers are incompatible with use_dynamic_url resources');
    assert.deepEqual(readGeneratedLoaderModules(), generatedModules.slice(0, -1).filter(
        (modulePath) => !modulePath.startsWith('features/') || modulePath === 'features/download-ui/index.js'
    ), 'the loader catalogue must track the manifest catalogue');
    assert.match(loaderSource, /core\/browser-api\.js/);
    assert.match(loaderSource, /features\/download-ui\/index\.js/);
    assert.doesNotMatch(loaderSource, /import '\.\/ytkit\.js';/,
        'the core loader must not construct the monolith before deferred feature factories register');
    assert.match(bootstrapSource, /await timeStage\('monolithMs', \(\) => import\(getURL\('ytkit\.js'\)\)\)/,
        'the bootstrap must construct the monolith after deferred feature imports');
    assert.match(
        bootstrapSource,
        /await timeStage\('featureModulesMs'[\s\S]*?await timeStage\('monolithMs', \(\) => import\(getURL\('ytkit\.js'\)\)\)/,
        'the monolith import must follow the complete deferred feature-module barrier'
    );
    // Stage attribution exists so a future startup regression can be pinned to
    // a stage instead of only showing up in the end-to-end number.
    for (const stage of ['coreLoaderMs', 'settingsReadMs', 'featureModulesMs', 'monolithMs']) {
        assert.ok(bootstrapSource.includes(`timeStage('${stage}'`),
            `the bootstrap must time the ${stage} stage`);
    }
    for (const modulePath of generatedModules) {
        assert.ok(fs.existsSync(path.join(repoRoot, 'extension', modulePath)),
            `${modulePath} must exist on disk`);
        assert.ok(warResources.has(modulePath),
            `${modulePath} must be exposed for the dynamic import URL`);
    }
});

test('runtime bootstrap has no executable code-generation path', () => {
    assert.doesNotMatch(bootstrapSource, /\beval\s*\(|\bnew\s+Function\s*\(/);
    assert.doesNotMatch(bootstrapSource, /set(?:Timeout|Interval)\s*\(\s*["'`]/);
});

test('deferred feature modules are never gated by the landing route', () => {
    // YouTube is an SPA: the bootstrap runs once, on the landing URL, and the
    // session then navigates everywhere. Because the monolith builds its
    // feature array at load time, a module imported after that point can no
    // longer displace the inline fallback that already won — so a route gate
    // silently swapped implementations for the whole session based on nothing
    // but which page the user opened first. That is how the in-page
    // Subscription Groups copy (destructive import) and the fallback Video
    // Hider (no Mark-Watched runtime at all) reached users.
    assert.doesNotMatch(bootstrapSource, /FEATURE_ROUTES/,
        'the bootstrap must not carry a route table for feature modules');
    assert.doesNotMatch(bootstrapSource, /routeMatches/,
        'the bootstrap must not gate feature-module imports by pathname');

    // The settings gate must survive: it keys on user settings, which do not
    // change under the session's feet.
    const gate = bootstrapSource.slice(
        bootstrapSource.indexOf('const shouldLoadFeature'),
        bootstrapSource.indexOf('const loadRuntime')
    );
    assert.ok(gate.length > 0, 'shouldLoadFeature must precede loadRuntime');
    assert.match(gate, /FEATURE_SETTINGS\[modulePath\]/,
        'a module whose every feature is switched off may still be skipped');
    assert.doesNotMatch(gate, /pathname/,
        'the surviving gate must not consider the pathname');

    const generator = fs.readFileSync(
        path.join(repoRoot, 'scripts', 'generate-runtime-bootstrap.js'), 'utf8');
    assert.doesNotMatch(generator, /^const FEATURE_ROUTES/m,
        'the generator must not reintroduce a route table');
});
