'use strict';

// Inert code that misleads. The settings panel carried a `_panelCleanups`
// registry with three drain sites and zero registrations, plus a
// MutationObserver whose only job was to drain it — waking on every
// document.body class change to iterate an empty array. No leak today, but it
// promised centralized teardown, and the next widget author would have
// registered against it and leaked.
//
// Alongside it: three YTKitCore aliases nothing consumed, and a CSS class with
// no creation site.
//
// One claim in the same audit finding did NOT survive verification and the
// symbols stay — see the last test.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(repoRoot, p), 'utf8');

const settingsPanel = read('extension/features/settings-panel/index.js');
const monolith = read('extension/ytkit.js');
const sidepanelCss = read('extension/sidepanel.css');
const sidepanelJs = read('extension/sidepanel.js');

// ── (a) the registry that registered nothing ──────────────────────────────

test('the inert cleanup registry is gone from both copies', () => {
    for (const [label, source] of [['settings-panel', settingsPanel], ['ytkit.js', monolith]]) {
        assert.doesNotMatch(source, /_panelCleanups/,
            `${label} must not carry a teardown registry nothing registers with`);
    }
});

test('the observer that existed only to drain it is gone too', () => {
    for (const [label, source] of [['settings-panel', settingsPanel], ['ytkit.js', monolith]]) {
        assert.doesNotMatch(source, /buildSettingsPanel\._panelObs/,
            `${label} must not observe every body class change for an empty array`);
    }
});

test('the reason the panel needs no per-open teardown is written down', () => {
    // Without this the next reader re-adds the registry, having found the same
    // six unremoved document listeners the audit did.
    for (const [label, source] of [['settings-panel', settingsPanel], ['ytkit.js', monolith]]) {
        assert.match(source, /No per-open cleanup registry here on purpose/, label);
        assert.match(source, /guarded by\s*\n\s*\/\/ isSettingsPanelOpen\(\)/, label);
    }
});

test('the guard that makes those listeners safe is still in place', () => {
    // The listeners are attached once and gated on the panel being open. If
    // that gate ever goes, the removal above stops being correct.
    assert.match(settingsPanel, /_panelUIListenersAttached/,
        'the attach-once flag must survive');
    assert.match(settingsPanel, /isSettingsPanelOpen\(\)/,
        'the listeners must still be guarded');
});

// ── (b) aliases with no consumers ─────────────────────────────────────────

test('the three dead YTKitCore aliases are gone, and their functions are not', () => {
    const cases = [
        ['extension/core/data-flow.js', 'findDataFlowCoverageGaps', 'function findCoverageGaps'],
        ['extension/core/settings-sync.js', 'settingsSync', 'createSettingsSyncController'],
        ['extension/core/browser-api.js', 'resolveBrowserNamespace', 'function resolveBrowserNamespace']
    ];
    for (const [file, alias, keep] of cases) {
        const source = read(file);
        assert.doesNotMatch(source, new RegExp(`core\\.${alias}\\s*=`),
            `${file} still exports the dead ${alias} alias`);
        assert.match(source, new RegExp(keep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
            `${file}: the live implementation must stay`);
    }
});

test('nothing in the tree reaches for the removed aliases', () => {
    const roots = ['extension', 'scripts'];
    const offenders = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true })) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            const rel = `${dir}/${entry.name}`;
            if (entry.isDirectory()) { walk(rel); continue; }
            if (!entry.name.endsWith('.js')) continue;
            const source = read(rel);
            for (const alias of ['findDataFlowCoverageGaps', 'settingsSync', 'resolveBrowserNamespace']) {
                if (new RegExp(`YTKitCore[?.]*\\.${alias}\\b|core\\.${alias}\\b`).test(source)) {
                    offenders.push(`${rel}:${alias}`);
                }
            }
        }
    };
    roots.forEach(walk);
    assert.deepEqual(offenders, [], 'a caller would have made the alias live, not dead');
});

// ── (d) CSS with no creation site ─────────────────────────────────────────

test('.sp-storage-card is gone, and nothing builds one', () => {
    assert.doesNotMatch(sidepanelCss, /\.sp-storage-card/);
    assert.doesNotMatch(sidepanelJs, /sp-storage-card/,
        'if a creation site ever appears the rule should come back with it');
});

// ── (c) the claim that did not survive verification ───────────────────────

test('the Theme section still matches its two foundation features', () => {
    // The audit called uiStyleManager/colorThemeManager dead regex alternates,
    // on the grounds that they are "element ids, not schema keys". But the
    // regex is tested against feature.id, not a schema key, and both are live
    // feature ids in group Theme. Deleting them would have moved both features
    // out of Foundation into the catch-all Surfaces section.
    const visualSystem = read('extension/core/settings-visual-system.js');
    const foundation = visualSystem.match(/fallback: 'Foundation', match: \/\^\(([^)]*)\)\$\//);
    assert.ok(foundation, 'the Theme > Foundation section must still exist');
    const alternates = foundation[1].split('|');

    for (const id of ['uiStyleManager', 'colorThemeManager']) {
        assert.ok(alternates.includes(id),
            `${id} must stay in the Foundation section: it is a live feature id`);
        assert.match(monolith, new RegExp(`id: '${id}',[\\s\\S]{0,200}?group: 'Theme'`),
            `${id} must still be a Theme feature, or the alternate really is dead`);
    }
    // And the regex really is applied to feature ids, which is the whole point.
    assert.match(settingsPanel, /section\.match\.test\(feature\.id\)/,
        'the section table matches feature ids, not schema keys');
});
