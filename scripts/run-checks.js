#!/usr/bin/env node
'use strict';

// `npm run check` used to be one long `&&` chain. That made it fail-fast, and
// fail-fast on a verification chain is a silent-coverage bug: when the i18n
// copy gate went red, the seventeen gates after it — lint, the a11y audits,
// contrast, light-theme, dependency audit, the Firefox checks, the capability
// matrix — never ran at all, via `npm run check` OR `release:prepare`. Work
// shipped with them unexercised, and nothing said so.
//
// This runner runs every gate, then reports all of them together. A red gate
// can no longer hide the gate behind it. `--fail-fast` restores the old
// behaviour for a quick local loop.

const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');

// Ordered cheapest-first within each group so a quick local run surfaces the
// common failures early even though it no longer stops at them.
const GATES = Object.freeze([
    { id: 'syntax', script: 'check-syntax.js' },
    { id: 'live-chat-css', script: 'generate-live-chat-css.js', args: ['--check'] },
    { id: 'runtime-bootstrap', script: 'generate-runtime-bootstrap.js', args: ['--check'] },
    { id: 'sidebar', script: 'generate-sidebar.js', args: ['--check'] },
    { id: 'selector-asset', script: 'build-selector-asset.js', args: ['--check'] },
    { id: 'project-facts', script: 'project-facts.js', args: ['--check'] },
    { id: 'settings-reference', script: 'generate-settings-reference.js', args: ['--check'] },
    { id: 'versions', script: 'check-versions.js' },
    { id: 'zero-ads', script: 'check-zero-ad-rules.js' },
    { id: 'companion-ports', script: 'check-companion-port-catalogue.js' },
    { id: 'chromium-store', script: 'check-chromium-store-profile.js' },
    { id: 'i18n', script: 'check-i18n.js' },
    { id: 'i18n-keys', script: 'extract-i18n-keys.js', args: ['--check-en'] },
    { id: 'i18n-copy', script: 'check-localizable-ui-copy.js' },
    { id: 'localized-selectors', script: 'check-localized-selectors.js' },
    { id: 'settings', script: 'check-settings.js' },
    { id: 'no-eval', script: 'check-no-eval.js' },
    { id: 'userscript-size', script: 'check-userscript-size.js' },
    { id: 'firefox-injection', script: 'check-firefox-injection.js' },
    { id: 'userscript-drift', script: 'check-userscript-drift.js' },
    { id: 'userscript-symbols', script: 'check-userscript-symbols.js' },
    { id: 'firefox-webext', script: 'check-firefox-webext.js' },
    { id: 'startup', script: 'bench-startup.js', args: ['--check', '--allow-synthetic'] },
    { id: 'lint', npm: 'lint' },
    { id: 'a11y-popup', script: 'audit-popup-a11y.js' },
    { id: 'a11y-overlays', script: 'audit-overlays-a11y.js', args: ['--self-test'] },
    { id: 'contrast', script: 'check-contrast.js' },
    { id: 'light-theme', script: 'check-light-theme-lane.js' },
    { id: 'deps', npm: 'audit:deps' },
    { id: 'i18n-coverage', script: 'i18n-coverage.js', args: ['--no-write', '--check-report', '--check-placeholder-baseline'] },
    { id: 'capability-matrix', script: 'generate-capability-matrix.js', args: ['--check'] }
]);

// A floor on the runner's own scope, like the list-scoped gates it drives. A
// chain that quietly shrinks reports success for checks it never ran, which is
// the failure this whole file exists to stop.
const MIN_GATES = 28;

function runGate(gate) {
    const started = process.hrtime.bigint();
    let result;
    if (gate.npm) {
        // Composite or tool-driven scripts stay in npm so package.json remains
        // their single definition. One command string rather than argv + shell:
        // Node refuses to spawn a .cmd without a shell (CVE-2024-27980) and
        // deprecates passing args alongside one (DEP0190), so the only shape
        // that satisfies both is a single string. The ids below are constants
        // in this file, never input.
        result = spawnSync(`npm run ${gate.npm}`, {
            cwd: REPO_ROOT,
            stdio: 'inherit',
            shell: true
        });
    } else {
        result = spawnSync(process.execPath, [path.join('scripts', gate.script), ...(gate.args || [])], {
            cwd: REPO_ROOT,
            stdio: 'inherit'
        });
    }
    const ms = Number((process.hrtime.bigint() - started) / 1000000n);
    // A signal-killed or unspawnable gate reports status null. Treating either
    // as a pass would be the same silent-coverage bug in a different shape, and
    // "exit null" with nothing else said is barely better — a gate that could
    // not start must say why.
    if (result.error) {
        console.error(`[check] ${gate.id} could not be started: ${result.error.message}`);
    }
    const ok = result.status === 0;
    return { ok, ms, status: result.status, signal: result.signal, error: result.error || null };
}

function main(argv) {
    if (GATES.length < MIN_GATES) {
        console.error(`[check] gate list shrank to ${GATES.length}, below the floor of ${MIN_GATES}.`);
        console.error('[check] Removing a gate is a deliberate act; lower MIN_GATES in the same commit.');
        return 2;
    }

    const failFast = argv.includes('--fail-fast');
    const results = [];

    for (const gate of GATES) {
        console.log(`\n── check: ${gate.id} ──`);
        const outcome = runGate(gate);
        results.push({ id: gate.id, ...outcome });
        if (!outcome.ok && failFast) {
            console.error(`\n[check] --fail-fast: stopping at ${gate.id}.`);
            break;
        }
    }

    const failed = results.filter((r) => !r.ok);
    const ran = results.length;
    console.log('\n── check summary ──');
    if (!failed.length) {
        const total = results.reduce((sum, r) => sum + r.ms, 0);
        console.log(`[check] ${ran}/${GATES.length} gate(s) passed in ${(total / 1000).toFixed(1)}s`);
        return 0;
    }

    console.error(`[check] ${failed.length} of ${ran} gate(s) FAILED:`);
    for (const failure of failed) {
        let how;
        if (failure.error) how = `could not start: ${failure.error.message}`;
        else if (failure.signal) how = `killed by ${failure.signal}`;
        else how = `exit ${failure.status}`;
        console.error(`  ✗ ${failure.id} (${how})`);
    }
    if (failFast) {
        console.error(`[check] ${GATES.length - ran} gate(s) were not run because --fail-fast was set.`);
    } else {
        console.error(`[check] Every gate ran. Scroll up for each failure's own output.`);
    }
    return 1;
}

if (require.main === module) {
    process.exitCode = main(process.argv.slice(2));
}

module.exports = { GATES, MIN_GATES };
