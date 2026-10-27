'use strict';

// The release SBOM walks package-lock.json from the production dependencies.
// It used to list every non-dev lock path as a package name, so a nested link
// stub showed up as "web-ext/node_modules/@devicefarmer/adbkit@0.0.0".

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSbom, purlFor } = require('../scripts/generate-release-sbom');

const PKG = { name: 'fixture', version: '1.0.0', dependencies: { a: '^1.0.0', local: 'file:./libs/local' } };

function lockWith(extra = {}) {
    return {
        lockfileVersion: 3,
        packages: {
            '': { name: 'fixture', version: '1.0.0', dependencies: PKG.dependencies },
            'node_modules/a': { version: '1.0.0', resolved: 'https://registry.npmjs.org/a/-/a-1.0.0.tgz', license: 'MIT', dependencies: { b: '^2.0.0', c: '^1.0.0' } },
            // a needs b@2, nested under a; the root copy b@1 serves local.
            'node_modules/a/node_modules/b': { version: '2.0.0', license: 'ISC' },
            'node_modules/b': { version: '1.0.0' },
            'node_modules/c': { version: '1.0.0' },
            'node_modules/local': { resolved: 'libs/local', link: true },
            'libs/local': { name: 'local', version: '0.3.0', dependencies: { b: '^1.0.0', c: '^1.0.0' } },
            'node_modules/devonly': { version: '9.0.0', dev: true },
            'node_modules/devonly/node_modules/stub': { resolved: 'node_modules/devonly/missing', link: true },
            ...extra
        }
    };
}

const names = (sbom) => sbom.components.map((c) => `${c.name}@${c.version}`);
const edges = (sbom, ref) => sbom.dependencies.find((d) => d.ref === ref)?.dependsOn;

test('the SBOM is the production closure with real names, links resolved', () => {
    const sbom = buildSbom({ pkg: PKG, lock: lockWith() });
    assert.deepEqual(names(sbom), ['a@1.0.0', 'b@1.0.0', 'b@2.0.0', 'c@1.0.0', 'local@0.3.0']);
    for (const component of sbom.components) {
        assert.doesNotMatch(component.name, /node_modules/, 'a lock path is never a package name');
        assert.equal(component.purl, purlFor(component.name, component.version));
    }
});

test('dependency edges follow node resolution, and distinct versions stay apart', () => {
    const sbom = buildSbom({ pkg: PKG, lock: lockWith() });
    assert.deepEqual(edges(sbom, 'pkg:npm/fixture@1.0.0'), ['pkg:npm/a@1.0.0', 'pkg:npm/local@0.3.0']);
    assert.deepEqual(edges(sbom, 'pkg:npm/a@1.0.0'), ['pkg:npm/b@2.0.0', 'pkg:npm/c@1.0.0'], 'a gets its nested b');
    assert.deepEqual(edges(sbom, 'pkg:npm/local@0.3.0'), ['pkg:npm/b@1.0.0', 'pkg:npm/c@1.0.0'], 'the link target resolves from the root');
    assert.equal(sbom.components.filter((c) => c.name === 'c').length, 1, 'c reached twice is one component');
});

test('dev-only packages and the links under them never appear', () => {
    const sbom = buildSbom({ pkg: PKG, lock: lockWith() });
    assert.equal(names(sbom).some((n) => n.startsWith('devonly') || n.startsWith('stub')), false);
});

test('a reachable dangling link is an error, not a made-up package', () => {
    const lock = lockWith({ 'node_modules/c': { resolved: 'libs/gone', link: true } });
    assert.throws(() => buildSbom({ pkg: PKG, lock }), /invalid npm link: node_modules\/c -> libs\/gone/);
});

test('a required dependency missing from the lockfile is an error', () => {
    const lock = lockWith();
    delete lock.packages['node_modules/c'];
    assert.throws(() => buildSbom({ pkg: PKG, lock }), /needs c/);
});

test('a local file package only carries a distribution link when it came from a registry', () => {
    const sbom = buildSbom({ pkg: PKG, lock: lockWith() });
    const local = sbom.components.find((c) => c.name === 'local');
    assert.equal(local.externalReferences, undefined);
    assert.equal(sbom.components.find((c) => c.name === 'a').externalReferences[0].url, 'https://registry.npmjs.org/a/-/a-1.0.0.tgz');
});

test('the repository SBOM has no link stubs and says it covers build tooling', () => {
    const sbom = buildSbom();
    assert.equal(names(sbom).some((n) => /adbkit|node_modules/.test(n)), false);
    assert.ok(names(sbom).some((n) => n.startsWith('crx3@')));
    assert.match(sbom.metadata.component.description, /build and packaging tooling/);
    assert.deepEqual(sbom.metadata.properties, [{ name: 'astra-deck:sbom-scope', value: 'build-tooling' }]);
});

test('the adbkit security stub stays pinned for web-ext', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.equal(pkg.overrides['@devicefarmer/adbkit'], 'file:./scripts/npm-stubs/devicefarmer-adbkit');
    assert.equal(pkg.devDependencies['@devicefarmer/adbkit'], 'file:./scripts/npm-stubs/devicefarmer-adbkit');
});
