'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CATALOGUE_PATH = path.join(__dirname, 'companion-port-catalogue.json');

function fail(message) {
    throw new Error(`[companion-port-catalogue] ${message}`);
}

function loadCompanionPortCatalogue(filePath = CATALOGUE_PATH) {
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        fail(`could not read ${filePath}: ${error.message}`);
    }
    if (!raw || raw.schemaVersion !== 1) fail('schemaVersion must be 1');
    if (typeof raw.host !== 'string' || !/^[a-z0-9.:-]+$/i.test(raw.host)) {
        fail('host must be a simple host name or address');
    }
    if (!Array.isArray(raw.ports) || raw.ports.length === 0) {
        fail('ports must be a non-empty array');
    }
    const ports = raw.ports.map((port) => Number(port));
    if (ports.some((port) => !Number.isInteger(port) || port < 1024 || port > 65535)) {
        fail('ports must contain integers between 1024 and 65535');
    }
    if (new Set(ports).size !== ports.length) fail('ports must be unique and ordered');
    for (let i = 1; i < ports.length; i += 1) {
        if (ports[i] <= ports[i - 1]) fail('ports must be in ascending order');
    }
    if (typeof raw.origin !== 'string' || !raw.origin.startsWith(`http://${raw.host}:`)) {
        fail('origin must be the HTTP loopback origin for host');
    }

    const hostPermissions = ports.map((port) => `http://${raw.host}:${port}/*`);
    const cspOrigins = hostPermissions.map((permission) => permission.replace(/\/\*$/, ''));
    return Object.freeze({
        schemaVersion: 1,
        host: raw.host,
        origin: raw.origin,
        ports: Object.freeze(ports),
        primaryPort: ports[0],
        hostPermissions: Object.freeze(hostPermissions),
        cspOrigins: Object.freeze(cspOrigins)
    });
}

const COMPANION_PORT_CATALOGUE = loadCompanionPortCatalogue();

module.exports = {
    CATALOGUE_PATH,
    COMPANION_PORT_CATALOGUE,
    loadCompanionPortCatalogue
};
