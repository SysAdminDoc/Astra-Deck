#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const BUILD_DIR = path.join(REPO_ROOT, 'build');
const SBOM_NAME = 'astra-deck-npm-sbom.cdx.json';

function readJson(repoRoot, relPath) {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, relPath), 'utf8'));
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

// The package name a lockfile location installs: whatever follows its last
// node_modules/ segment. A location outside node_modules (a file: target such
// as scripts/npm-stubs/x) has no installed name, so the entry must carry one.
function nameFromLocation(location) {
    const marker = 'node_modules/';
    const at = location.lastIndexOf(marker);
    return at === -1 ? null : location.slice(at + marker.length);
}

// Node's lookup: the package's own node_modules first, then each parent's,
// ending at the root's.
function resolveDependency(packages, fromLocation, depName) {
    const segments = fromLocation ? fromLocation.split('/') : [];
    for (let i = segments.length; i >= 0; i -= 1) {
        if (i > 0 && segments[i - 1] === 'node_modules') continue;
        const prefix = segments.slice(0, i).join('/');
        const candidate = (prefix ? prefix + '/' : '') + 'node_modules/' + depName;
        if (Object.prototype.hasOwnProperty.call(packages, candidate)) return candidate;
    }
    return null;
}

// Follows a link entry to the entry that holds the package. A link whose
// target is missing, or is itself a link, is an error rather than a guess.
function followLink(packages, location) {
    const entry = packages[location];
    if (!entry || !entry.link) return { location, entry: entry || {} };
    const target = String(entry.resolved || '');
    const targetEntry = target ? packages[target] : null;
    if (!targetEntry || targetEntry.link) {
        throw new Error(`invalid npm link: ${location} -> ${target || '(no target)'}`);
    }
    return { location: target, entry: targetEntry };
}

function edgesOf(entry) {
    const edges = [];
    for (const name of Object.keys(entry.dependencies || {})) edges.push({ name, optional: false });
    for (const name of Object.keys(entry.optionalDependencies || {})) edges.push({ name, optional: true });
    const peerMeta = entry.peerDependenciesMeta || {};
    for (const name of Object.keys(entry.peerDependencies || {})) {
        edges.push({ name, optional: peerMeta[name]?.optional === true, peer: true });
    }
    return edges;
}

const byNameThenVersion = (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version);

// The SBOM covers what a production install of this package's npm tree pulls
// in: the build and packaging tooling (crx3 and its closure). The extension
// and the userscript bundle no npm packages, so none of this ships inside the
// ZIP, XPI or userscript. Components come from walking the lockfile from the
// root's production dependencies, so dev-only packages, nested copies nothing
// reaches and link stubs never show up as package names. One component per
// PURL: the same name and version installed twice is one entry, two versions
// are two.
function buildSbom(options = {}) {
    const repoRoot = options.repoRoot || REPO_ROOT;
    const pkg = options.pkg || readJson(repoRoot, 'package.json');
    const lock = options.lock || readJson(repoRoot, 'package-lock.json');
    const packages = lock.packages || {};
    const rootRef = `pkg:npm/${encodeURIComponent(pkg.name)}@${encodeURIComponent(pkg.version)}`;

    const byPurl = new Map();
    const refForLocation = new Map();
    const edgesByRef = new Map([[rootRef, new Set()]]);

    function visit(location) {
        if (refForLocation.has(location)) return refForLocation.get(location);
        const { location: real, entry } = followLink(packages, location);
        const name = entry.name || nameFromLocation(location) || nameFromLocation(real);
        const version = entry.version;
        if (!name || !version) {
            throw new Error(`npm package at ${real} has no name or version`);
        }
        const ref = purlFor(name, version);
        refForLocation.set(location, ref);
        if (!byPurl.has(ref)) {
            const component = {
                type: 'library',
                'bom-ref': ref,
                name,
                version,
                purl: ref,
                scope: 'required'
            };
            const licenses = normalizeLicense(entry.license);
            if (licenses.length) component.licenses = licenses;
            if (/^https?:\/\//.test(String(entry.resolved || ''))) {
                component.externalReferences = [{ type: 'distribution', url: entry.resolved }];
            }
            byPurl.set(ref, component);
            edgesByRef.set(ref, new Set());
        }
        for (const edge of edgesOf(entry)) {
            const depLocation = resolveDependency(packages, real, edge.name);
            if (!depLocation) {
                if (edge.optional || edge.peer) continue;
                throw new Error(`npm package ${name}@${version} needs ${edge.name}, which package-lock.json does not install`);
            }
            edgesByRef.get(ref).add(visit(depLocation));
        }
        return ref;
    }

    const rootDeps = [
        ...Object.keys(pkg.dependencies || {}).map((name) => ({ name, optional: false })),
        ...Object.keys(pkg.optionalDependencies || {}).map((name) => ({ name, optional: true }))
    ];
    for (const dep of rootDeps) {
        const location = resolveDependency(packages, '', dep.name);
        if (!location) {
            if (dep.optional) continue;
            throw new Error(`production dependency ${dep.name} is missing from package-lock.json`);
        }
        edgesByRef.get(rootRef).add(visit(location));
    }

    const components = Array.from(byPurl.values()).sort(byNameThenVersion);
    const dependencies = [rootRef, ...components.map((component) => component['bom-ref'])]
        .map((ref) => ({
            ref,
            dependsOn: Array.from(edgesByRef.get(ref)).sort((a, b) => a.localeCompare(b))
        }));

    return {
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        version: 1,
        metadata: {
            component: {
                type: 'application',
                'bom-ref': rootRef,
                name: pkg.name,
                version: pkg.version,
                purl: rootRef,
                description: 'npm build and packaging tooling for Astra Deck. The extension and userscript bundle no npm packages.'
            },
            properties: [{ name: 'astra-deck:sbom-scope', value: 'build-tooling' }]
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
