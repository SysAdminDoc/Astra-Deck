#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { buildCompanionInventory } = require('./companion-license-inventory');

const REPO_ROOT = path.join(__dirname, '..');
const BUILD_DIR = path.join(REPO_ROOT, 'build');
const SBOM_NAME = 'astra-deck-npm-sbom.cdx.json';

function readJson(repoRoot, relPath) {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, relPath), 'utf8'));
}

function packageNameFromLockPath(lockPath) {
    const prefix = 'node_modules/';
    if (!lockPath.startsWith(prefix)) return null;
    return lockPath.slice(prefix.length);
}

function purlFor(name, version) {
    const encodedName = String(name)
        .split('/')
        .map((part) => encodeURIComponent(part))
        .join('/');
    return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
}

function normalizeLicense(license) {
    if (!license) return [];
    const value = String(license);
    if (/^[A-Za-z0-9-.+]+$/.test(value)) {
        return [{ license: { id: value } }];
    }
    return [{ expression: value }];
}

function buildSbom(options = {}) {
    const repoRoot = options.repoRoot || REPO_ROOT;
    const buildDir = options.buildDir || path.join(repoRoot, 'build');
    const pkg = readJson(repoRoot, 'package.json');
    const lock = readJson(repoRoot, 'package-lock.json');
    const packages = lock.packages || {};
    const componentNames = new Set();

    for (const [lockPath, entry] of Object.entries(packages)) {
        if (!lockPath || entry.dev) continue;
        const name = packageNameFromLockPath(lockPath);
        if (name) componentNames.add(name);
    }

    const components = Array.from(componentNames)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => {
            const entry = packages[`node_modules/${name}`] || {};
            const version = String(entry.version || '0.0.0');
            const component = {
                type: 'library',
                'bom-ref': purlFor(name, version),
                name,
                version,
                purl: purlFor(name, version),
                scope: 'required'
            };
            const licenses = normalizeLicense(entry.license);
            if (licenses.length) component.licenses = licenses;
            if (entry.resolved) {
                component.externalReferences = [{
                    type: 'distribution',
                    url: entry.resolved
                }];
            }
            return component;
        });

    const npmComponents = components.slice();
    const dependencyRefs = new Set(npmComponents.map((component) => component['bom-ref']));
    const companionInventory = buildCompanionInventory(repoRoot, buildDir);
    components.push(...companionInventory.components);

    const dependencies = [
        {
            ref: `pkg:npm/${encodeURIComponent(pkg.name)}@${encodeURIComponent(pkg.version)}`,
            dependsOn: Object.keys(pkg.dependencies || {})
                .map((name) => {
                    const entry = packages[`node_modules/${name}`];
                    return entry ? purlFor(name, entry.version) : null;
                })
                .filter(Boolean)
                .concat(companionInventory.components.length
                    ? [companionInventory.components[0]['bom-ref']]
                    : [])
                .sort((a, b) => a.localeCompare(b))
        }
    ];

    for (const component of npmComponents) {
        const entry = packages[`node_modules/${component.name}`] || {};
        const dependsOn = Object.keys(entry.dependencies || {})
            .map((name) => {
                const depEntry = packages[`node_modules/${name}`];
                return depEntry && !depEntry.dev ? purlFor(name, depEntry.version) : null;
            })
            .filter((ref) => ref && dependencyRefs.has(ref))
            .sort((a, b) => a.localeCompare(b));
        dependencies.push({
            ref: component['bom-ref'],
            dependsOn
        });
    }
    dependencies.push(...companionInventory.dependencies);

    return {
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        version: 1,
        metadata: {
            component: {
                type: 'application',
                'bom-ref': `pkg:npm/${encodeURIComponent(pkg.name)}@${encodeURIComponent(pkg.version)}`,
                name: pkg.name,
                version: pkg.version,
                purl: `pkg:npm/${encodeURIComponent(pkg.name)}@${encodeURIComponent(pkg.version)}`
            }
        },
        components,
        dependencies
    };
}

function main() {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
    const sbomPath = path.join(BUILD_DIR, SBOM_NAME);
    fs.writeFileSync(sbomPath, JSON.stringify(buildSbom(), null, 2) + '\n', 'utf8');
    console.log(`Release SBOM: build/${SBOM_NAME}`);
}

if (require.main === module) {
    try {
        main();
    } catch (err) {
        console.error('[release-sbom] ' + err.message);
        process.exit(1);
    }
}

module.exports = {
    buildSbom,
    purlFor
};
