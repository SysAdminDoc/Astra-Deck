'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const { scanFirefoxInjectionApis } = require('../scripts/check-firefox-injection.js');
const { BUILD_PROFILE_IDS } = require('../build-extension.js');
const {
    createFirefoxStage,
    lintArgsForSource,
    summarizeLintOutput
} = require('../scripts/check-firefox-webext.js');
const {
    DEFAULT_START_URL,
    hasStartupFailure,
    parseArgs: parseFirefoxSmokeArgs
} = require('../scripts/smoke-firefox-webext.js');

test('Firefox injection pre-flight gate is wired into npm run check', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    assert.match(
        pkg.scripts.check,
        /node scripts\/check-firefox-injection\.js/,
        'npm run check must include the Firefox programmatic-injection pre-flight gate'
    );
});

test('Firefox injection pre-flight finds no extension executeScript call sites', () => {
    assert.deepEqual(scanFirefoxInjectionApis(REPO_ROOT), []);
});

test('Firefox executeScript audit note records the zero-call-site result', () => {
    const doc = fs.readFileSync(
        path.join(REPO_ROOT, 'docs', 'firefox-executescript-preflight.md'),
        'utf8'
    );
    assert.match(doc, /Firefox 149/);
    assert.match(doc, /Firefox 152/);
    assert.match(doc, /0 call sites/);
    assert.match(doc, /node scripts\/check-firefox-injection\.js/);
    assert.match(doc, /moz-extension:\/\//);
});

test('Firefox web-ext lint gate is pinned and wired into npm run check', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));

    assert.equal(pkg.devDependencies['web-ext'], '10.3.0',
        'web-ext must stay exact-pinned so AMO lint behavior is reproducible');
    assert.equal(pkg.scripts['check:firefox'], 'node scripts/check-firefox-webext.js');
    assert.match(pkg.scripts.check, /npm run check:firefox/,
        'npm run check must include the staged Firefox web-ext lint gate');
    assert.deepEqual(
        lintArgsForSource('stage-dir'),
        ['lint', '--source-dir', 'stage-dir', '--output', 'json'],
        'web-ext lint must target the generated Firefox stage via --source-dir'
    );
    assert.deepEqual(
        summarizeLintOutput('{"summary":{"errors":0,"warnings":1,"notices":2}}'),
        { errors: 0, warnings: 1, notices: 2 },
        'lint JSON summary should stay parseable for concise CI output'
    );
});

test('Firefox web-ext lint stages both profile manifests with Gecko patches', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-firefox-stage-test-'));
    try {
        assert.deepEqual(BUILD_PROFILE_IDS, ['store-safe', 'github-full']);
        for (const profile of BUILD_PROFILE_IDS) {
            const stageDir = createFirefoxStage(profile, tmp);
            const manifest = JSON.parse(fs.readFileSync(path.join(stageDir, 'manifest.json'), 'utf8'));

            assert.equal(
                manifest.browser_specific_settings?.gecko?.id,
                'ytkit@sysadmindoc.github.io',
                `${profile} staged manifest must include the AMO extension id`
            );
            assert.equal(
                manifest.browser_specific_settings?.gecko?.strict_min_version,
                '142.0',
                `${profile} staged manifest must use the web-ext-supported Firefox data-consent floor`
            );
            assert.deepEqual(
                manifest.background,
                { scripts: ['background.js'] },
                `${profile} staged manifest must convert MV3 service_worker to Firefox scripts[]`
            );
        }
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test('Firefox clean-profile smoke command is exposed for AMO pre-submission runs', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const smokeScript = fs.readFileSync(
        path.join(REPO_ROOT, 'scripts', 'smoke-firefox-webext.js'),
        'utf8'
    );
    const buildWorkflow = fs.readFileSync(
        path.join(REPO_ROOT, '.github', 'workflows', 'build.yml'),
        'utf8'
    );

    assert.equal(pkg.scripts['smoke:firefox'], 'node scripts/smoke-firefox-webext.js');
    assert.equal(DEFAULT_START_URL, 'https://www.youtube.com/watch?v=jNQXAC9IVRw');
    assert.deepEqual(
        parseFirefoxSmokeArgs(['--firefox', 'C:/Firefox/firefox.exe', '--timeout-ms', '1234']),
        {
            firefox: 'C:/Firefox/firefox.exe',
            keepStage: false,
            stageRoot: '',
            startUrl: DEFAULT_START_URL,
            timeoutMs: 1234
        }
    );
    assert.match(smokeScript, /createFirefoxStage\('store-safe'/,
        'smoke must launch the AMO-bound store-safe staged manifest');
    assert.match(smokeScript, /manifestVersion:\s*manifest\.manifest_version/,
        'smoke output must report the launched manifest version');
    assert.match(smokeScript, /geckoId:\s*manifest\.browser_specific_settings\?\.gecko\?\.id/,
        'smoke output must report the staged Gecko extension id');
    assert.match(smokeScript, /'run'[\s\S]*'--source-dir'[\s\S]*'--start-url'[\s\S]*'--no-reload'/,
        'smoke must use web-ext run against a clean staged source dir and stable start URL');
    assert.match(smokeScript, /'--arg=-headless'/,
        'smoke must run Firefox headless for CI/operator reproducibility');
    assert.match(buildWorkflow, /browser-actions\/setup-firefox@[0-9a-f]{40}\s+#\s+v1\.7\.2/,
        'release workflow must install Firefox through a pinned setup-firefox action');
    assert.match(buildWorkflow, /npm run smoke:firefox -- --firefox "\$\{\{ steps\.setup-firefox\.outputs\.firefox-path \}\}"/,
        'release workflow must run the clean-profile store-safe Firefox smoke');
    assert.equal(hasStartupFailure('WebExtError: boom'), true);
    assert.equal(hasStartupFailure('Use --verbose or open about:debugging for details'), false);
});
