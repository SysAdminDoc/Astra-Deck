'use strict';

// npm appends anything after `--` to the LAST command of an `&&` chain, not to
// the first. So `npm run build -- --bump patch` hands `--bump patch` to
// generate-capability-matrix.js and build-extension.js never sees it: the build
// runs unbumped, at the default profile, and exits 0.
//
// The terminal script is the only process in the chain that can observe the
// mistake, because it is the one holding the flags. So each chain terminal
// declares the flags it owns and refuses everything else by name, pointing at
// the env-var route that does reach the front of the chain.

// The build flags that have no other way through an npm chain, and the env var
// build-extension.js reads instead. Kept here so the terminal scripts and the
// build itself cannot drift on the names.
const BUILD_FLAG_ENV_ROUTES = Object.freeze({
    '--bump': 'ASTRA_BUMP=patch|minor|major',
    '--profile': 'ASTRA_BUILD_PROFILE=store-safe|chromium-store|github-full|both',
    '--crx-key': 'ASTRA_CRX_KEY_PATH=<path outside the worktree>',
    '--crx-key-mode': 'ASTRA_CRX_KEY_MODE=external|ephemeral',
    '--no-crx': 'ASTRA_SKIP_CRX=1',
    '--with-userscript': 'npm run build:userscript'
});

/**
 * @param {string[]} argv        process.argv.slice(2)
 * @param {object}   options
 * @param {string}   options.script   script name, for the error message
 * @param {string[]} options.own      flags this script actually implements
 * @param {Object<string,string>} [options.envRoutes]  flag -> env var that works
 */
function assertNoForeignFlags(argv, { script, own, envRoutes = {} }) {
    const owned = new Set(own);
    const foreign = argv.filter((arg) => arg.startsWith('--') && !owned.has(arg));
    if (!foreign.length) return;

    const lines = [
        `${script} received ${foreign.length === 1 ? 'a flag' : 'flags'} it does not implement: ${foreign.join(' ')}`,
        '',
        'This almost always means an npm chain swallowed them. `npm run <chain> --',
        '<flags>` appends to the LAST command of an && chain, so the flags never',
        'reach the script you meant. Use the environment instead:',
        ''
    ];
    for (const flag of foreign) {
        const route = envRoutes[flag];
        lines.push(route ? `  ${flag}  ->  ${route}` : `  ${flag}  ->  no env equivalent; run its script directly`);
    }
    throw new Error(lines.join('\n'));
}

module.exports = { BUILD_FLAG_ENV_ROUTES, assertNoForeignFlags };
