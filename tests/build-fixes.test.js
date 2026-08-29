'use strict';

// tests/build-fixes.test.js - pins for local build/tooling fixes:
//   1. Windows zip path uses bsdtar, never PowerShell Compress-Archive.
//   2. Ephemeral CRX mode generates one per-run key across profiles.
//   3. Local release scripts replace remote build workflow attestations.
//   4. check-no-eval comment suppression is not fooled by URLs.
//   5. check-contrast rejects non-#rrggbb input.
//   6. check-versions rejects an empty --tag value.
//   7. Staging skip-lists exclude key material and logs.
//   8. The live-chat ISOLATED entry remains scope-minimal.
//   9. The retired schema command validates without rewriting canonical data.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { runtimeModules } = require('./helpers/source');

const REPO_ROOT = path.join(__dirname, '..');

function runNodeCommand(args) {
    return spawnSync(process.execPath, args, {
        stdio: 'pipe',
        cwd: REPO_ROOT,
        encoding: 'utf8'
    });
}

test('ISOLATED content_scripts blocks keep normal pages and live chat isolated', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(REPO_ROOT, 'extension', 'manifest.json'), 'utf8'
    ));
    const isolatedJsBlocks = (manifest.content_scripts || []).filter((block) =>
        (block.world === undefined || block.world === 'ISOLATED')
        && Array.isArray(block.js)
        && block.js.length > 0
    );
    assert.equal(isolatedJsBlocks.length, 3,
        'expected three ISOLATED content_scripts blocks with js bundles');
    const normal = isolatedJsBlocks.find((block) => runtimeModules(block).includes('ytkit.js'));
    const chat = isolatedJsBlocks.find((block) => block.js.includes('live-chat.js'));
    const bootstrap = isolatedJsBlocks.find((block) => block.js.includes('core/bridge-token.js'));
    assert.ok(normal, 'normal pages must retain the runtime module catalogue');
    assert.ok(chat, 'live chat must use the dedicated entry');
    assert.ok(bootstrap, 'the bridge token has to be minted somewhere');

    // The token block is the reason the MAIN-world bridge can tell its own
    // side from the page, and the ordering is what makes it work: it has to
    // run at document_start, and before the MAIN block, or the bridge finds
    // no token and stays dark.
    assert.equal(bootstrap.run_at, 'document_start');
    assert.deepEqual(bootstrap.js, ['core/bridge-channel.js', 'core/bridge-token.js'],
        'nothing else belongs in the pass that runs before every page script');
    const blocks = manifest.content_scripts;
    const mainBlock = blocks.find((block) => block.world === 'MAIN');
    assert.ok(blocks.indexOf(bootstrap) < blocks.indexOf(mainBlock),
        'content scripts run in manifest order, so the token must be minted first');
    assert.deepEqual(bootstrap.matches, mainBlock.matches,
        'a page the bridge runs on with no token is a page its features are dead on');
    assert.deepEqual(bootstrap.exclude_matches, mainBlock.exclude_matches);
    assert.ok(!chat.js.includes('ytkit.js'), 'live chat must not load the normal-page monolith');
    assert.deepEqual(normal.js, ['runtime-bootstrap.js'],
        'normal pages must inject only the thin runtime bootstrap statically');
    assert.ok(chat.js.length < runtimeModules(normal).length / 4,
        'live-chat script count must remain materially below the normal-page entry');
});

test('lint and no-eval inventories cover every shipped top-level content script', () => {
    const packageJson = JSON.parse(fs.readFileSync(
        path.join(REPO_ROOT, 'package.json'), 'utf8'
    ));
    const lintArgs = packageJson.scripts.lint.trim().split(/\s+/);
    assert.equal(lintArgs.shift(), 'eslint', 'lint script must invoke ESLint directly');

    const directLintFiles = lintArgs.filter((arg) => !/[?*\[\]]/.test(arg));
    const eslintConfig = require('../eslint.config.js');
    const configuredFiles = new Set(eslintConfig.flatMap((entry) => entry.files || []));
    for (const file of directLintFiles) {
        assert.ok(configuredFiles.has(file),
            `${file} must appear literally in an eslint.config.js files array`);
    }

    const manifest = JSON.parse(fs.readFileSync(
        path.join(REPO_ROOT, 'extension', 'manifest.json'), 'utf8'
    ));
    const shippedTopLevelScripts = [...new Set((manifest.content_scripts || [])
        .flatMap((block) => block.js || [])
        .filter((file) => path.posix.basename(file) === file && file.endsWith('.js')))];
    const noEvalSource = fs.readFileSync(
        path.join(REPO_ROOT, 'scripts', 'check-no-eval.js'), 'utf8'
    );
    const scanStart = noEvalSource.indexOf('const SCAN_FILES = [');
    const scanEnd = noEvalSource.indexOf('];', scanStart);
    assert.ok(scanStart > -1 && scanEnd > scanStart,
        'check-no-eval.js must expose a parseable SCAN_FILES declaration');
    const scanBlock = noEvalSource.slice(scanStart, scanEnd);
    for (const file of shippedTopLevelScripts) {
        const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        assert.match(scanBlock, new RegExp(`['"]extension/${escaped}['"]`),
            `check-no-eval.js SCAN_FILES must include extension/${file}`);
    }
});

test('build-extension shouldStageEntry refuses key, token, and log files', () => {
    const { shouldStageEntry } = require('../build-extension.js');
    for (const name of [
        '.env',
        '.env.local',
        'cert.p12',
        'debug.log',
        'id_rsa',
        'private.key',
        'token.txt',
        'tokens.json',
        'ytkit.pem'
    ]) {
        assert.equal(shouldStageEntry(name), false, `${name} must never be staged into artifacts`);
    }
    assert.equal(shouldStageEntry('manifest.json'), true, 'real extension files must still stage');
    assert.equal(shouldStageEntry('ytkit.js'), true, 'real extension files must still stage');
});

test('build tooling carries no dead shell bindings', () => {
    const buildSource = fs.readFileSync(path.join(REPO_ROOT, 'build-extension.js'), 'utf8');
    assert.doesNotMatch(buildSource, /\{\s*execSync\s*,/,
        'build-extension.js must retain only the execFileSync API it uses');
});

test('staging scripts reuse the shared build copier and filter', () => {
    for (const rel of ['scripts/check-firefox-webext.js', 'scripts/smoke-chromium-optional-hosts.js']) {
        const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
        assert.doesNotMatch(src, /STAGE_SKIP_SUFFIXES|STAGE_SECRET_SUFFIXES|function copyDir\(/,
            rel + ' must not keep a duplicate staging implementation');
        assert.match(src, /copyDir,/,
            rel + ' must import the shared build copier');
        assert.match(src, /shouldStageEntry,/,
            rel + ' must re-export the shared stage filter for tests');
    }
});

test('packaging boundary excludes repository-only archive and MHTML trees', () => {
    const { copyDir } = require('../build-extension.js');
    const buildSource = fs.readFileSync(path.join(REPO_ROOT, 'build-extension.js'), 'utf8');
    assert.match(buildSource, /const EXT_DIR = path\.join\(__dirname, 'extension'\)/);
    assert.match(buildSource, /copyDir\(EXT_DIR,/,
        'release packaging must start at extension/, not the repository root');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-package-boundary-'));
    try {
        const extension = path.join(root, 'extension');
        fs.mkdirSync(extension, { recursive: true });
        fs.mkdirSync(path.join(root, 'archive'));
        fs.mkdirSync(path.join(root, 'mhtml'));
        fs.writeFileSync(path.join(extension, 'manifest.json'), '{}\n', 'utf8');
        fs.writeFileSync(path.join(root, 'archive', 'old.js'), 'archive-only', 'utf8');
        fs.writeFileSync(path.join(root, 'mhtml', 'capture.mhtml'), 'capture-only', 'utf8');
        const stage = path.join(root, 'stage');
        copyDir(extension, stage);
        assert.deepEqual(fs.readdirSync(stage), ['manifest.json']);
        assert.equal(fs.existsSync(path.join(stage, 'archive')), false);
        assert.equal(fs.existsSync(path.join(stage, 'mhtml')), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('extension staging refuses symlinked entries before copying target bytes', (t) => {
    const { copyDir } = require('../build-extension.js');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-stage-symlink-'));
    try {
        const source = path.join(root, 'extension');
        const stage = path.join(root, 'stage');
        const outsideSecret = path.join(root, 'outside-secret.txt');
        const symlinkPath = path.join(source, 'public.png');
        fs.mkdirSync(source);
        fs.writeFileSync(path.join(source, 'manifest.json'), '{}\n', 'utf8');
        fs.writeFileSync(outsideSecret, 'do-not-package', 'utf8');
        try {
            fs.symlinkSync(outsideSecret, symlinkPath, 'file');
        } catch (error) {
            if (error && (error.code === 'EPERM' || error.code === 'EACCES')) {
                t.skip('filesystem does not permit symlink creation for this user');
                return;
            }
            throw error;
        }
        assert.throws(
            () => copyDir(source, stage),
            /Refusing to stage symlink or reparse point/,
            'staging must fail closed on symlinked extension entries'
        );
        assert.equal(fs.existsSync(path.join(stage, 'public.png')), false,
            'symlink target bytes must not be copied into the stage directory');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('release readiness key-leak check scans extension/ recursively for *.pem', () => {
    const src = fs.readFileSync(
        path.join(REPO_ROOT, 'scripts', 'generate-release-readiness.js'), 'utf8'
    );
    assert.match(src, /function listPemFiles\(/,
        'generate-release-readiness.js must define a recursive pem scanner');
    assert.match(src, /listPemFiles\(path\.join\(repoRoot, 'extension'\)/,
        'the key-leak check must scan extension/, not just the repo root');
});

test('check-versions exits non-zero on `--tag ""` instead of silently skipping', () => {
    const script = path.join(REPO_ROOT, 'scripts', 'check-versions.js');
    const result = runNodeCommand([script, '--tag', '']);
    assert.notEqual(result.status, 0,
        'an empty --tag value must fail loudly, not silently skip tag validation');
    assert.match(String(result.stderr), /--tag requires a non-empty value/,
        'the error message must explain the empty --tag rejection');
});

test('check-versions exits non-zero when --tag is the last argument', () => {
    const script = path.join(REPO_ROOT, 'scripts', 'check-versions.js');
    const result = runNodeCommand([script, '--tag']);
    assert.notEqual(result.status, 0, 'a value-less --tag must fail loudly');
    assert.match(String(result.stderr), /--tag requires a non-empty value/);
});

test('check-versions still validates a matching explicit tag', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const script = path.join(REPO_ROOT, 'scripts', 'check-versions.js');
    const result = runNodeCommand([script, '--tag', 'v' + pkg.version]);
    assert.equal(result.status, 0,
        'a correct --tag vX.Y.Z must still pass: ' + String(result.stderr));
});

test('check-versions reads the visible userscript @name version suffix', () => {
    const { readUserscriptNameVersion } = require('../scripts/check-versions');
    assert.deepEqual(
        readUserscriptNameVersion('// @name        YTKit v4.51.0\n'),
        { source: 'YTKit.user.js (@name version)', value: '4.51.0' }
    );
    assert.equal(
        readUserscriptNameVersion('// @name        YTKit\n').value,
        '',
        'a name without the version suffix must fail the aggregate gate'
    );
});

test('legacy schema command validates without regenerating the canonical schema', () => {
    const script = path.join(REPO_ROOT, 'scripts', '_gen-schema.js');
    const schema = path.join(REPO_ROOT, 'extension', 'core', 'settings-schema.js');
    const before = fs.readFileSync(schema, 'utf8');
    const result = runNodeCommand([script]);
    assert.equal(result.status, 0,
        'the historical contributor command must remain a working parity check: '
        + String(result.stderr));
    assert.equal(fs.readFileSync(schema, 'utf8'), before,
        'the compatibility command must not rewrite the canonical schema');
    const source = fs.readFileSync(script, 'utf8');
    assert.match(source, /check-settings\.js/);
    assert.doesNotMatch(source, /writeFileSync|ROADMAP\.md/,
        'the retired generator must not regain roadmap parsing or file writes');
});

test('createZip writes forward-slash entry names without shelling out', () => {
    // This used to pin the bsdtar invocation, which was the right assertion
    // while packaging shelled out: PowerShell's Compress-Archive writes
    // backslash entry separators that AMO rejects and Linux unzip breaks on,
    // and bsdtar was the fix. Packaging is now written in Node, so the
    // property is structural rather than delegated. The test asserts the
    // property the old one was protecting, not the tool that used to provide it.
    const src = fs.readFileSync(path.join(REPO_ROOT, 'build-extension.js'), 'utf8');
    assert.doesNotMatch(src, /Compress-Archive/,
        'Compress-Archive writes invalid backslash zip entry separators for AMO/Linux unzip');
    assert.doesNotMatch(src, /execFileSync\(\s*bsdtar/,
        'packaging must not shell out; two packagers cannot be relied on to agree byte-for-byte');
    assert.match(src, /prefix \+ '\/' \+ entry\.name/,
        'entry names must be joined with forward slashes on every platform');
    assert.match(src, /local\.writeUInt16LE\(0, 28\)/,
        'no local extra field: that is where a varying timestamp would hide');
});

test('ephemeral CRX mode generates a single per-run PKCS8 key with 0o600 mode', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'build-extension.js'), 'utf8');
    assert.match(src, /crypto\.generateKeyPairSync\('rsa', \{ modulusLength: 2048 \}\)/,
        'ephemeral mode must generate one concrete RSA key up front');
    assert.match(src, /\{ type: 'pkcs8', format: 'pem' \}/,
        'the ephemeral key must be exported as PKCS8 PEM');
    assert.match(src, /mode: 0o600/,
        'the on-disk ephemeral key must be owner-read/write only');
    assert.doesNotMatch(src, /chromeCrxPath\.replace\('\.crx', '\.pem'\)/,
        'the dead crx3-sidecar-pem rename path must stay deleted');

    const builder = require('../build-extension.js');
    const config = builder.resolveCrxSigningConfig({ mode: 'ephemeral' });
    assert.equal(config.mode, 'ephemeral');
    assert.equal(config.keyPath, null,
        'resolveCrxSigningConfig stays key-less for ephemeral mode');
});

test('local artifact commands replace remote build workflow attestations', () => {
    assert.equal(
        fs.existsSync(path.join(REPO_ROOT, '.github', 'workflows', 'build.yml')),
        false,
        'GitHub build workflow must stay absent; releases are built locally'
    );
    const pkg = require('../package.json');
    assert.equal(pkg.scripts.build, 'node build-extension.js && npm run generate:capability-matrix');
    assert.equal(pkg.scripts['release:manifest'], 'node scripts/generate-release-manifest.js');
    assert.equal(pkg.scripts['release:readiness'], 'node scripts/generate-release-readiness.js');
});

test('check-no-eval strips string-literal contents before the // suppression test', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'check-no-eval.js'), 'utf8');
    assert.match(src, /function stripStringLiteralContents\(/,
        'check-no-eval must define the string-literal stripper');
    assert.match(src, /stripStringLiteralContents\(lineText\.slice\(0, colIdx\)\)/,
        'comment-suppression check must run on the string-stripped prefix');
});

test('check-contrast rejects non-#rrggbb input and passes legitimately', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'check-contrast.js'), 'utf8');
    assert.match(src, /\^#\[0-9a-fA-F\]\{6\}\$/,
        'parseHex must validate strict #rrggbb input');
    assert.match(src, /throw new Error\('parseHex expects #rrggbb/,
        'parseHex must throw on malformed input instead of coercing NaN to black');
    assert.doesNotMatch(src, /bg: 'rgba\(/,
        'check entries must use pre-composited hex backgrounds');

    const result = runNodeCommand([path.join(REPO_ROOT, 'scripts', 'check-contrast.js')]);
    assert.equal(result.status, 0,
        'contrast audit must pass with the corrected composited button background: ' + String(result.stdout));
});

test('check-contrast computes every audit from resolved popup and sidepanel tokens', () => {
    const { buildChecks, contrast, loadSurfaceTokens } = require('../scripts/check-contrast');
    const checks = buildChecks();
    assert.equal(checks.length, 12,
        'the audit must cover six rendered token lanes on both surfaces');
    for (const surface of ['popup', 'sidepanel']) {
        const tokens = loadSurfaceTokens(surface);
        assert.ok(tokens['--text-primary'], `${surface} must resolve --text-primary from CSS`);
        assert.ok(tokens[surface === 'popup' ? '--page-bg' : '--bg'],
            `${surface} must resolve its page background from CSS`);
    }
    for (const check of checks) {
        assert.ok(
            contrast(check.foregroundValue, check.backgroundValue) >= check.minimum,
            `${check.surface} ${check.name} must meet its rendered ratio`
        );
    }
});

test('check-contrast composites translucent foregrounds before measuring them', () => {
    const { compositeColor, contrast } = require('../scripts/check-contrast');
    const composited = compositeColor('rgba(255, 0, 0, 0.1)', '#ffffff');
    assert.deepEqual(composited, [255, 230, 230]);
    assert.ok(contrast(composited, '#ffffff') < 2);
});

// ── 10. profile ceilings keep the authenticated companion available ──

test('profile manifests retain the companion handoff and carry an immutable ceiling', () => {
    const {
        patchManifestForBuildProfile,
        getManifestProfilePermissions,
        GITHUB_FULL_ONLY_API_PERMISSIONS,
        BUILD_PROFILE_MANIFEST_KEY
    } = require(path.join(REPO_ROOT, 'build-extension.js'));

    const sourceManifest = JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, 'extension', 'manifest.json'), 'utf8')
    );

    const storeSafe = patchManifestForBuildProfile(
        JSON.parse(JSON.stringify(sourceManifest)), 'store-safe', 'chromium'
    );
    assert.deepEqual(storeSafe.permissions, sourceManifest.permissions,
        'store-safe must retain cookies/nativeMessaging for the authenticated companion handoff');
    assert.equal(storeSafe[BUILD_PROFILE_MANIFEST_KEY], 'store-safe',
        'store-safe artifact must carry its immutable profile ceiling');
    for (const name of Object.keys(GITHUB_FULL_ONLY_API_PERMISSIONS)) {
        assert.equal(storeSafe.permissions.includes(name), false,
            `store-safe must not declare unrelated github-full-only permission ${name}`);
    }

    const githubFull = patchManifestForBuildProfile(
        JSON.parse(JSON.stringify(sourceManifest)), 'github-full', 'chromium'
    );
    assert.equal(githubFull[BUILD_PROFILE_MANIFEST_KEY], 'github-full',
        'github-full artifact must carry its immutable profile ceiling');
    for (const name of Object.keys(GITHUB_FULL_ONLY_API_PERMISSIONS)) {
        assert.equal(githubFull.permissions.includes(name), true,
            `github-full must keep ${name} — the companion path depends on it`);
    }
    assert.deepEqual(githubFull.permissions, sourceManifest.permissions,
        'github-full permissions must match the source manifest exactly');

    // Every stripped permission must be one the source manifest actually
    // declares, so a rename cannot leave a silently-inert entry behind.
    for (const name of Object.keys(GITHUB_FULL_ONLY_API_PERMISSIONS)) {
        assert.equal(sourceManifest.permissions.includes(name), true,
            `GITHUB_FULL_ONLY_API_PERMISSIONS lists ${name}, which extension/manifest.json does not declare`);
    }

    const declared = ['storage', 'cookies'];
    const filtered = getManifestProfilePermissions('store-safe', declared);
    assert.deepEqual(declared, ['storage', 'cookies'], 'input array must not be mutated');
    assert.deepEqual(filtered, ['storage', 'cookies'],
        'store-safe must retain companion permissions');

    const chromiumStore = patchManifestForBuildProfile(
        JSON.parse(JSON.stringify(sourceManifest)), 'chromium-store', 'chromium'
    );
    assert.equal(chromiumStore[BUILD_PROFILE_MANIFEST_KEY], 'chromium-store',
        'chromium-store artifact must carry its immutable profile ceiling');
    assert.equal(chromiumStore.permissions.includes('downloads'), false,
        'chromium-store must not retain the downloads permission');
    assert.equal(chromiumStore.host_permissions.some((host) => host.includes('127.0.0.1')), false,
        'chromium-store must not retain loopback host permissions');
    assert.equal(chromiumStore.content_security_policy.extension_pages.includes('127.0.0.1'), false,
        'chromium-store must not retain loopback CSP origins');
    assert.equal(chromiumStore.content_scripts.some((entry) =>
        [...(entry.js || []), ...(entry['x-ytkit-runtime-modules'] || [])]
            .includes('features/download-ui/index.js')), false,
    'chromium-store must omit the downloader runtime module');
});

test('the store permission rationale documents the shared companion permissions', () => {
    const { GITHUB_FULL_ONLY_API_PERMISSIONS } = require(path.join(REPO_ROOT, 'build-extension.js'));
    const doc = fs.readFileSync(
        path.join(REPO_ROOT, 'docs', 'store-permission-rationale.md'), 'utf8'
    );
    for (const name of Object.keys(GITHUB_FULL_ONLY_API_PERMISSIONS)) {
        const row = doc.split('\n').find((line) => line.startsWith(`| \`${name}\``));
        assert.ok(row, `rationale doc must document ${name}`);
        assert.match(row, /GitHub-full builds only/,
            `the ${name} row must say it is absent from the store-safe artifact`);
    }
    assert.match(doc, /both profiles can use the authenticated local companion/i);
    assert.match(doc, /`http:\/\/127\.0\.0\.1:9751\/\*`/,
        'rationale must document the shared companion loopback grant');
});
