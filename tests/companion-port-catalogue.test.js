'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const { COMPANION_PORT_CATALOGUE } = require('../scripts/companion-port-catalogue');
const generated = require('../extension/core/companion-ports');
const { ORIGIN_CATALOGUE } = require('../extension/core/data-flow');
const {
    buildExtensionPagesCsp,
    getManifestProfileHostPermissions,
} = require('../build-extension');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('companion port consumers equal the canonical generated modules', () => {
    assert.deepEqual([...generated.ports], COMPANION_PORT_CATALOGUE.ports);
    assert.deepEqual([...generated.hostPermissions], COMPANION_PORT_CATALOGUE.hostPermissions);
    assert.deepEqual([...generated.cspOrigins], COMPANION_PORT_CATALOGUE.cspOrigins);
    assert.equal(ORIGIN_CATALOGUE.find((entry) => entry.requiredByFeatures.includes('showLocalDownloadButton'))?.origin,
        COMPANION_PORT_CATALOGUE.origin);

    const python = read('astra_downloader/companion_ports.py');
    assert.match(python, new RegExp(`PORT_FALLBACKS = \\[${COMPANION_PORT_CATALOGUE.ports.join(', ')}\\]`));
    assert.match(python, /SERVER_PORT = PORT_FALLBACKS\[0\]/);
});

test('base and github-full manifests carry every canonical companion permission', () => {
    const manifest = JSON.parse(read('extension/manifest.json'));
    for (const permission of COMPANION_PORT_CATALOGUE.hostPermissions) {
        assert.ok(manifest.host_permissions.includes(permission), permission);
    }
    for (const origin of COMPANION_PORT_CATALOGUE.cspOrigins) {
        assert.ok(manifest.content_security_policy.extension_pages.includes(origin), origin);
    }

    const fullHosts = getManifestProfileHostPermissions('github-full');
    for (const permission of COMPANION_PORT_CATALOGUE.hostPermissions) {
        assert.ok(fullHosts.includes(permission), `github-full missing ${permission}`);
    }
    const fullCsp = buildExtensionPagesCsp('github-full');
    for (const origin of COMPANION_PORT_CATALOGUE.cspOrigins) {
        assert.ok(fullCsp.includes(origin), `github-full CSP missing ${origin}`);
    }
});

test('extension-side probes and userscript manager consume the catalogue', () => {
    assert.match(read('extension/features/download-ui/index.js'), /_PORT_CANDIDATES: COMPANION_PORTS/);
    assert.match(read('extension/core/capability-probe.js'), /Array\.isArray\(companionPorts\?\.ports\)/);
    assert.match(read('extension/background.js'), /\.\.\.COMPANION_ORIGINS/);
    assert.match(read('YTKit.user.js'), /USERSCRIPT_COMPANION_PORT_CATALOGUE\?\.ports/);
});
