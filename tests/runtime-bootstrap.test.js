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
        'deferred modules must use the settings and route gate');
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
    assert.equal(runtimeResourceEntry.use_dynamic_url, undefined,
        'relative ES-module imports require the stable extension origin');
    assert.ok(warResources.has('runtime-core-loader.mjs'),
        'the static module graph loader must be exposed for the dynamic import URL');
    assert.match(loaderSource, /import '\.\/core\/browser-api\.js';/);
    assert.match(loaderSource, /import '\.\/features\/download-ui\/index\.js';/);
    assert.match(loaderSource, /import '\.\/ytkit\.js';/);
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
