#!/usr/bin/env node
'use strict';

// Keep every companion port consumer tied to the checked-in JSON catalogue.
// A port mismatch is a functional failure: the downloader can bind on one
// port while the extension probes or is permitted to contact another.

const fs = require('node:fs');
const path = require('node:path');
const { COMPANION_PORT_CATALOGUE } = require('./companion-port-catalogue');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function fail(message) {
    throw new Error(`[check-companion-port-catalogue] ${message}`);
}

function check(condition, message) {
    if (!condition) fail(message);
}

function sameArray(actual, expected, label) {
    check(Array.isArray(actual) && actual.length === expected.length
        && actual.every((value, index) => value === expected[index]),
    `${label} does not match the canonical ordered list`);
}

function extractCspSources(csp) {
    const directive = String(csp || '').split(';').find((part) => part.trim().startsWith('connect-src '));
    return directive ? directive.trim().split(/\s+/).slice(1) : [];
}

const generated = require('../extension/core/companion-ports');
sameArray(generated.ports, COMPANION_PORT_CATALOGUE.ports, 'generated JavaScript ports');
sameArray(generated.hostPermissions, COMPANION_PORT_CATALOGUE.hostPermissions,
    'generated JavaScript host permissions');
sameArray(generated.cspOrigins, COMPANION_PORT_CATALOGUE.cspOrigins,
    'generated JavaScript CSP origins');
check(generated.origin === COMPANION_PORT_CATALOGUE.origin,
    'generated JavaScript origin does not match the catalogue');

const python = read('astra_downloader/companion_ports.py');
check(python.includes(`PORT_HOST = "${COMPANION_PORT_CATALOGUE.host}"`),
    'generated Python host does not match the catalogue');
check(python.includes(`PORT_FALLBACKS = [${COMPANION_PORT_CATALOGUE.ports.join(', ')}]`),
    'generated Python fallback ports do not match the catalogue');
check(python.includes('SERVER_PORT = PORT_FALLBACKS[0]'),
    'generated Python primary port must derive from PORT_FALLBACKS');
check(!/^PORT_FALLBACKS\s*=/m.test(read('astra_downloader/astra_downloader.py')),
    'astra_downloader.py must import, not redeclare, PORT_FALLBACKS');
check(read('astra_downloader/config.py').includes('clamp_int(data.get("ServerPort"), SERVER_PORT'),
    'config.py must use the generated primary port as its default');

const manifest = JSON.parse(read('extension/manifest.json'));
const loopbackHostPrefix = `http://${COMPANION_PORT_CATALOGUE.host}:`;
const ollamaHostPermission = `http://${COMPANION_PORT_CATALOGUE.host}:11434/*`;
const ollamaCspOrigin = `http://${COMPANION_PORT_CATALOGUE.host}:11434`;
const manifestLoopbackHosts = (manifest.host_permissions || [])
    .filter((value) => value.startsWith(loopbackHostPrefix) && value !== ollamaHostPermission);
check(manifestLoopbackHosts.every((value) => COMPANION_PORT_CATALOGUE.hostPermissions.includes(value)),
    'base manifest contains an undeclared companion host permission');
const manifestCompanionHosts = manifestLoopbackHosts
    .filter((value) => COMPANION_PORT_CATALOGUE.hostPermissions.includes(value));
sameArray(manifestCompanionHosts, COMPANION_PORT_CATALOGUE.hostPermissions,
    'base manifest companion host permissions');
const manifestLoopbackCsp = extractCspSources(manifest.content_security_policy?.extension_pages)
    .filter((value) => value.startsWith(loopbackHostPrefix) && value !== ollamaCspOrigin);
check(manifestLoopbackCsp.every((value) => COMPANION_PORT_CATALOGUE.cspOrigins.includes(value)),
    'base manifest contains an undeclared companion CSP origin');
const manifestCompanionCsp = manifestLoopbackCsp
    .filter((value) => COMPANION_PORT_CATALOGUE.cspOrigins.includes(value));
sameArray(manifestCompanionCsp, COMPANION_PORT_CATALOGUE.cspOrigins,
    'base manifest companion CSP origins');

const { buildExtensionPagesCsp, getManifestProfileHostPermissions } = require('../build-extension');
const fullProfileLoopbackHosts = getManifestProfileHostPermissions('github-full')
    .filter((value) => value.startsWith(loopbackHostPrefix) && value !== ollamaHostPermission);
check(fullProfileLoopbackHosts.every((value) => COMPANION_PORT_CATALOGUE.hostPermissions.includes(value)),
    'github-full profile contains an undeclared companion host permission');
const fullProfileHosts = fullProfileLoopbackHosts
    .filter((value) => COMPANION_PORT_CATALOGUE.hostPermissions.includes(value));
sameArray(fullProfileHosts, COMPANION_PORT_CATALOGUE.hostPermissions,
    'github-full companion host permissions');
const fullProfileLoopbackCsp = extractCspSources(buildExtensionPagesCsp('github-full'))
    .filter((value) => value.startsWith(loopbackHostPrefix) && value !== ollamaCspOrigin);
check(fullProfileLoopbackCsp.every((value) => COMPANION_PORT_CATALOGUE.cspOrigins.includes(value)),
    'github-full profile contains an undeclared companion CSP origin');
const fullProfileCsp = fullProfileLoopbackCsp
    .filter((value) => COMPANION_PORT_CATALOGUE.cspOrigins.includes(value));
sameArray(fullProfileCsp, COMPANION_PORT_CATALOGUE.cspOrigins,
    'github-full companion CSP origins');

const downloadUi = read('extension/features/download-ui/index.js');
check(downloadUi.includes('_PORT_CANDIDATES: COMPANION_PORTS'),
    'download UI must consume the shared companion port array');
const capabilityProbe = read('extension/core/capability-probe.js');
check(capabilityProbe.includes('Array.isArray(companionPorts?.ports)'),
    'capability probe must consume the shared companion port array');
const background = read('extension/background.js');
check(background.includes('...COMPANION_ORIGINS'),
    'background proxy allowlists must consume shared companion origins');
check(read('extension/core/data-flow.js').includes('companionPorts.hostPermissions'),
    'data-flow host aliases must consume the shared companion permissions');

const contentScript = manifest.content_scripts.find((entry) => (entry.js || []).includes('core/data-flow.js'));
check(contentScript, 'manifest must load a content script containing data-flow.js');
const companionIndex = contentScript.js.indexOf('core/companion-ports.js');
const dataFlowIndex = contentScript.js.indexOf('core/data-flow.js');
check(companionIndex !== -1 && companionIndex < dataFlowIndex,
    'manifest must load companion-ports.js before data-flow.js');
for (const page of ['extension/popup.html', 'extension/sidepanel.html', 'extension/sidebar.html']) {
    const html = read(page);
    check(html.lastIndexOf('core/companion-ports.js') < html.lastIndexOf('core/data-flow.js'),
        `${page} must load companion-ports.js before data-flow.js`);
}

const userscript = read('YTKit.user.js');
const bundleEnd = userscript.indexOf('// ── END v5.0.0 bundled core modules ──');
check(bundleEnd !== -1, 'userscript bundle marker is missing');
const legacyUserscript = userscript.slice(bundleEnd);
check(legacyUserscript.includes('USERSCRIPT_COMPANION_PORT_CATALOGUE'),
    'userscript legacy companion manager must consume the shared catalogue');
check(!legacyUserscript.includes('_PORT_CANDIDATES: Object.freeze([9751, 9761, 9771, 9781, 9791, 9851])'),
    'userscript legacy companion manager must not redeclare fallback ports');

console.log(`[check-companion-port-catalogue] OK — ${COMPANION_PORT_CATALOGUE.ports.length} ports align across Python, extension, profiles, and userscript`);
