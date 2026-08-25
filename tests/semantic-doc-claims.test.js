'use strict';

// Documentation claims that the generated fact blocks do not cover.
//
// Those blocks were current while the prose beside them said Node 22 against an
// engines floor of >=24, called the popup the only settings surface next to an
// in-page panel and a side panel, declared "Dark / OLED only. Never ship a
// light theme." against a whole light lane with its own gate and contrast
// probe, described feature modules as route-gated where the bootstrap says
// route gating is deliberately absent, and promised an attestation the release
// path does not produce.
//
// A number in a table is easy to regenerate. A sentence is not, so these
// compare the sentence against the source that decides it. Each assertion fails
// if EITHER side moves alone.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const facts = require('../scripts/project-facts.js');
const claims = (facts.collectProjectFacts
    || Object.values(facts).find((value) => typeof value === 'function'))().semanticClaims;

const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
const README = read('README.md');
const CONTRIBUTING = read('CONTRIBUTING.md');
const ARCHITECTURE = read('docs/architecture.md');

// ── 1. the Node floor ──

test('the documented Node floor is the one package.json enforces', () => {
    assert.match(claims.nodeFloorMajor, /^\d+$/, 'a floor has to be derivable');
    const expected = new RegExp(`Node ${claims.nodeFloorMajor}\\+|Node ${claims.nodeFloorMajor} or newer`);
    for (const [name, text] of [['README.md', README], ['CONTRIBUTING.md', CONTRIBUTING]]) {
        const mentions = [...text.matchAll(/Node (\d+)(?:\+| or newer)/g)].map((match) => match[1]);
        assert.ok(mentions.length > 0, `${name} must state a Node floor`);
        for (const mentioned of mentions) {
            assert.equal(mentioned, claims.nodeFloorMajor,
                `${name} says Node ${mentioned}, package.json engines says ${claims.nodeFloorMajor}`);
        }
        assert.match(text, expected);
    }
});

test('engines and .nvmrc are not allowed to disagree', () => {
    const engines = require('../package.json').engines.node.replace(/\D/g, '');
    const nvmrc = read('.nvmrc').trim().split('.')[0];
    assert.equal(engines, nvmrc, 'the two floors are read by different tools and must agree');
    assert.equal(claims.nodeFloorMajor, engines);
});

// ── 2. settings surfaces ──

test('the popup is not documented as the only settings surface', () => {
    assert.ok(claims.settingsSurfaces.length >= 2,
        `only ${claims.settingsSurfaces.length} settings surface(s) found; the claim below assumes more than one`);
    assert.ok(claims.settingsSurfaces.includes('popup'));

    assert.ok(!/the \*only\* extension surface for settings/.test(ARCHITECTURE),
        'the architecture doc must not call the popup the only settings surface');
    // And the ones that exist are named, so the correction cannot rot into
    // vagueness.
    for (const surface of claims.settingsSurfaces) {
        if (surface === 'popup') continue;
        const needle = surface === 'in-page settings panel' ? 'settings-panel/index.js' : 'sidepanel.html';
        assert.ok(ARCHITECTURE.includes(needle),
            `${surface} exists but the architecture doc does not name ${needle}`);
    }
});

// ── 3. themes ──

test('the light lane is not documented away', () => {
    assert.equal(claims.shipsLightTheme, true,
        'the light-theme gate and the html:not([dark]) lane both exist in this tree');
    assert.ok(!/Never ship a light theme/.test(ARCHITECTURE),
        'the architecture doc forbids what the repo ships and gates');
    assert.ok(!/\*\*Dark \/ OLED only\.\*\*/.test(ARCHITECTURE));
    assert.ok(ARCHITECTURE.includes('check-light-theme-lane.js'),
        'and it should name the gate that enforces the lane');
});

test('the light lane really is enforced, not just described', () => {
    assert.ok(fs.existsSync(path.join(repoRoot, 'scripts', 'check-light-theme-lane.js')));
    assert.ok(fs.existsSync(path.join(repoRoot, 'scripts', 'probe-light-surfaces.js')));
    assert.match(read('extension/core/settings-visual-system.js'), /html:not\(\[dark\]\)/);
});

// ── 4. module gating ──

test('the documented module gates are the gates the bootstrap implements', () => {
    assert.deepEqual(claims.moduleGates, ['settings'],
        'the bootstrap gates on settings only; route gating is deliberately absent');
    assert.ok(!/settings- and route-gated feature modules/.test(README),
        'the README diagram must not claim a route gate that does not exist');
    assert.ok(!/\*\*Settings and route gates\*\*/.test(README));
    assert.match(README, /Route gating is deliberately absent/,
        'and the absence should be stated, since it is a deliberate choice rather than an oversight');

    // The source side of the same claim.
    const bootstrap = read('extension/runtime-bootstrap.js');
    assert.match(bootstrap, /Route gating is deliberately absent/);
    assert.match(bootstrap, /const shouldLoadFeature = /);
});

// ── 5. release provenance ──

test('the release claims match what the release path emits', () => {
    assert.ok(claims.releaseArtifacts.includes('sbom'), 'the manifest generator names an SBOM');
    assert.ok(!claims.releaseArtifacts.includes('attestation'),
        'no attestation is produced, so nothing may promise one');
    assert.ok(!/SBOM \+ attestation/.test(README),
        'the README promised an attestation the local release path does not publish');
    assert.match(README, /SBOM \+ signed manifest/,
        'and should describe what it does publish');
});

test('the release manifest generator is the source for that claim', () => {
    const generator = read('scripts/generate-release-manifest.js');
    assert.match(generator, /SBOM_NAME/);
    assert.ok(!/attestation|in-toto|slsa/i.test(generator),
        'if an attestation is ever produced, the README claim above should come back with it');
});
