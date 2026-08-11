#!/usr/bin/env node
'use strict';

// Validate the staged Chromium public-store profile, not just the source
// manifest. The store profile intentionally removes the downloader runtime
// graph, so a manifest-only assertion would miss a stale loader import or a
// file that is still packaged after its manifest reference was pruned.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    BUILD_PROFILE_MANIFEST_KEY,
    DOWNLOAD_UI_MODULE,
    copyDir,
    listFiles,
    patchManifestForBuildProfile,
    patchStagedManifest,
} = require('../build-extension.js');

const ROOT = path.join(__dirname, '..');
const EXTENSION_DIR = path.join(ROOT, 'extension');
const PROFILE = 'chromium-store';

function fail(message) {
    throw new Error(`[check-chromium-store-profile] ${message}`);
}

function check(condition, message) {
    if (!condition) fail(message);
}

function cspSources(manifest) {
    const directive = String(manifest.content_security_policy?.extension_pages || '')
        .split(';')
        .find((part) => part.trim().startsWith('connect-src '));
    return directive ? directive.trim().split(/\s+/).slice(1) : [];
}

function runtimeResources(manifest) {
    return (manifest.content_scripts || [])
        .flatMap((entry) => [
            ...(entry.js || []),
            ...(entry['x-ytkit-runtime-modules'] || [])
        ]);
}

function assertProfileManifest(manifest) {
    check(manifest[BUILD_PROFILE_MANIFEST_KEY] === PROFILE,
        'staged manifest must carry the chromium-store ceiling');
    check(!(manifest.permissions || []).includes('downloads'),
        'chromium-store must not declare the downloads permission');
    for (const permission of ['cookies', 'nativeMessaging']) {
        check(!(manifest.permissions || []).includes(permission),
            `chromium-store must not declare ${permission}`);
    }

    const hosts = [
        ...(manifest.host_permissions || []),
        ...(manifest.optional_host_permissions || [])
    ];
    check(!hosts.some((host) => host.includes('api.cobalt.tools')),
        'chromium-store must not declare the Cobalt host');
    check(!hosts.some((host) => host.includes('127.0.0.1')),
        'chromium-store must not declare loopback host permissions');
    check(!cspSources(manifest).some((source) =>
        source.includes('api.cobalt.tools') || source.includes('127.0.0.1')),
    'chromium-store CSP must not declare Cobalt or loopback origins');

    const resources = runtimeResources(manifest);
    check(!resources.includes(DOWNLOAD_UI_MODULE),
        'chromium-store runtime graph must not name the downloader feature module');
    for (const entry of manifest.web_accessible_resources || []) {
        check(!(entry.resources || []).includes(DOWNLOAD_UI_MODULE),
            'chromium-store web-accessible runtime resources must not name the downloader module');
    }
}

function run() {
    const sourceManifest = JSON.parse(
        fs.readFileSync(path.join(EXTENSION_DIR, 'manifest.json'), 'utf8')
    );
    const profileManifest = patchManifestForBuildProfile(
        JSON.parse(JSON.stringify(sourceManifest)), PROFILE, 'chromium'
    );
    assertProfileManifest(profileManifest);

    const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-chromium-store-'));
    const stageDir = path.join(stageRoot, 'stage');
    try {
        copyDir(EXTENSION_DIR, stageDir);
        patchStagedManifest(stageDir, PROFILE, 'chromium');

        const stagedManifest = JSON.parse(
            fs.readFileSync(path.join(stageDir, 'manifest.json'), 'utf8')
        );
        assertProfileManifest(stagedManifest);
        const stagedFiles = listFiles(stageDir)
            .map((file) => path.relative(stageDir, file).split(path.sep).join('/'));
        check(!fs.existsSync(path.join(stageDir, 'features', 'download-ui')),
            'staged chromium-store artifact still contains the downloader module directory');
        check(!stagedFiles.some((file) => file.toLowerCase().includes('features/download-ui/')),
            'staged chromium-store artifact still contains the downloader module');

        for (const file of ['runtime-bootstrap.js', 'runtime-core-loader.mjs']) {
            const source = fs.readFileSync(path.join(stageDir, file), 'utf8');
            check(!source.includes(DOWNLOAD_UI_MODULE),
                `${file} still names the removed downloader module`);
        }
        const ytkit = fs.readFileSync(path.join(stageDir, 'ytkit.js'), 'utf8');
        check(ytkit.includes('createUnavailableDownloadUIFeature'),
            'ytkit.js must retain the download-free runtime fallback');
        check(!ytkit.includes(DOWNLOAD_UI_MODULE),
            'ytkit.js must not retain the removed downloader module name');
    } finally {
        fs.rmSync(stageRoot, { recursive: true, force: true });
    }

    console.log('[check-chromium-store-profile] OK — download-free Chromium store profile is staged without downloader, Cobalt, or loopback capabilities');
}

try {
    run();
} catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
}
