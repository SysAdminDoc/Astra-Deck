'use strict';

// Trusted Types went from convention to invariant in v4.88.3.
//
// `core/trusted-html.js` sanitizes, but it is a content-script module that the
// popup and side panel never load, so a raw `innerHTML =` on either page had
// nothing in front of it at all. Enforcing the directive turned up a
// second problem the same day: `require-trusted-types-for 'script'` makes
// importScripts a TrustedScriptURL sink, and an MV3 worker that throws there
// never registers — the extension loads with no background page at all, which
// reads as "extension is broken", not "CSP is strict".

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'extension', 'manifest.json'), 'utf8'));
const backgroundSource = fs.readFileSync(path.join(repoRoot, 'extension', 'background.js'), 'utf8');
const { patchManifestForBuildProfile, BUILD_PROFILE_IDS } = require('../build-extension.js');

function directives(csp) {
    return csp.split(';').map((part) => part.trim()).filter(Boolean);
}

test('the shipped manifest enforces Trusted Types and allowlists only this project policies', () => {
    const csp = manifest.content_security_policy.extension_pages;
    const parts = directives(csp);

    assert.ok(parts.includes("require-trusted-types-for 'script'"),
        'extension pages must require Trusted Types for script sinks');

    const allowlist = parts.find((part) => part.startsWith('trusted-types '));
    assert.ok(allowlist, 'an explicit trusted-types allowlist must be present');
    assert.deepEqual(allowlist.split(/\s+/).slice(1).sort(), ['astraDeck', 'astraDeckLoader'],
        'only the two policies this project creates may be allowed');
});

test('every staged build profile keeps the Trusted Types directives', () => {
    // The staged manifest regenerates its CSP per profile, so a directive that
    // exists only in the checked-in manifest never reaches a real install.
    for (const profile of BUILD_PROFILE_IDS) {
        const staged = JSON.parse(JSON.stringify(manifest));
        patchManifestForBuildProfile(staged, profile);
        const parts = directives(staged.content_security_policy.extension_pages);
        assert.ok(parts.includes("require-trusted-types-for 'script'"),
            `${profile} must enforce Trusted Types`);
        assert.ok(parts.some((part) => part.startsWith('trusted-types ')),
            `${profile} must carry the policy allowlist`);
    }
});

// Evaluates the loader policy exactly as background.js declares it, against a
// stub trustedTypes, and returns the resulting `_coreScriptUrl`.
function loadCoreScriptUrl({ withTrustedTypes = true } = {}) {
    const start = backgroundSource.indexOf('const _loaderPolicy = (() => {');
    const end = backgroundSource.indexOf('if (typeof importScripts', start);
    assert.ok(start > 0 && end > start, 'the loader policy block must be locatable');

    const created = [];
    const context = {
        TypeError,
        console,
        trustedTypes: withTrustedTypes
            ? {
                createPolicy(name, rules) {
                    created.push(name);
                    return { createScriptURL: rules.createScriptURL };
                }
            }
            : undefined
    };
    vm.createContext(context);
    vm.runInContext(
        `${backgroundSource.slice(start, end)}\nglobalThis.__coreScriptUrl = _coreScriptUrl;\nglobalThis.__policy = _loaderPolicy;`,
        context,
        { filename: 'background-loader-policy' }
    );
    return { coreScriptUrl: context.__coreScriptUrl, created, policy: context.__policy };
}

test('the loader policy mints only core module paths', () => {
    const { coreScriptUrl, created } = loadCoreScriptUrl();
    assert.deepEqual(created, ['astraDeckLoader'],
        'the loader must not claim the astraDeck name that trusted-html.js needs');

    assert.equal(coreScriptUrl('core/settings-schema.js'), 'core/settings-schema.js');
    assert.equal(coreScriptUrl('core/credential-vault.js'), 'core/credential-vault.js');

    for (const hostile of [
        'https://evil.example/payload.js',
        '../ytkit.js',
        'core/../../etc/passwd',
        'core/nested/deep.js',
        'ytkit.js',
        'core/evil.js?x=1',
        'core/EVIL.js'
    ]) {
        assert.throws(() => coreScriptUrl(hostile), /outside core\//,
            `${hostile} must not be mintable`);
    }
});

test('every importScripts entry passes through the loader policy', () => {
    const start = backgroundSource.indexOf('importScripts(');
    const end = backgroundSource.indexOf(');', start);
    const block = backgroundSource.slice(start, end);
    assert.match(block, /\.map\(_coreScriptUrl\)/,
        'importScripts must receive minted script URLs, not bare strings');

    const { coreScriptUrl } = loadCoreScriptUrl();
    const listed = [...block.matchAll(/'(core\/[^']+)'/g)].map((match) => match[1]);
    assert.ok(listed.length >= 9, 'the core import list must still be present');
    for (const entry of listed) {
        assert.equal(coreScriptUrl(entry), entry, `${entry} must be mintable`);
    }
});

test('an engine without Trusted Types still loads its core modules', () => {
    // Firefox runs background.scripts as a classic script; a policy-less engine
    // must not lose the imports.
    const { coreScriptUrl, policy } = loadCoreScriptUrl({ withTrustedTypes: false });
    assert.equal(policy, null);
    assert.equal(coreScriptUrl('core/settings-schema.js'), 'core/settings-schema.js');
});

test('the HTML sink gate covers every Trusted Types sink it claims to', () => {
    const gate = fs.readFileSync(path.join(repoRoot, 'scripts', 'check-no-eval.js'), 'utf8');
    for (const name of ['.innerHTML =', '.outerHTML =', 'insertAdjacentHTML(', 'document.write(']) {
        assert.ok(gate.includes(`name: '${name}'`), `${name} must be a scanned pattern`);
    }
    // `document.write(` and `document.writeln(` both have to match; an earlier
    // draft wrote `writeln?`, which matches "writel" and never "write".
    const pattern = /\{ name: 'document\.write\(', regex: (\/[^/]+\/)g/.exec(gate);
    assert.ok(pattern, 'the document.write pattern must be readable');
    const regex = new RegExp(pattern[1].slice(1, -1));
    assert.ok(regex.test('document.write(x)'), 'document.write must match');
    assert.ok(regex.test('document.writeln(x)'), 'document.writeln must match');
});

test('the sink gate covers compound assignment and the wider sink family', () => {
    // An adversarial review of the first cut found `el.innerHTML += x` sailing
    // through: it is as much a TrustedHTML write as a plain assignment and it
    // is the more natural thing to type. createContextualFragment and the
    // *Unsafe pair were missing outright.
    const { PATTERNS } = require('../scripts/check-no-eval.js');
    const fire = (line) => PATTERNS.some((pattern) => {
        pattern.regex.lastIndex = 0;
        return pattern.regex.test(line);
    });

    for (const hostile of [
        'el.innerHTML = h;',
        'el.innerHTML += h;',
        'el.innerHTML ||= h;',
        'el.innerHTML ??= h;',
        'el.innerHTML &&= h;',
        'el.outerHTML = h;',
        'el.outerHTML += h;',
        "el['innerHTML'] = h;",
        'el["outerHTML"] += h;',
        'el.insertAdjacentHTML("beforeend", h);',
        'document.write(h);',
        'document.writeln(h);',
        'range.createContextualFragment(h);',
        'el.setHTMLUnsafe(h);',
        'Document.parseHTMLUnsafe(h);'
    ]) {
        assert.ok(fire(hostile), `${hostile} must be flagged`);
    }

    for (const safe of [
        'if (el.innerHTML === h) return 1;',
        'if (el.innerHTML !== h) return 1;',
        'const current = el.innerHTML;',
        'return typeof body.innerHTML === "string" ? body.innerHTML : "";',
        'parser.parseFromString(html, "text/html");'
    ]) {
        assert.ok(!fire(safe), `${safe} must not be flagged`);
    }
});
