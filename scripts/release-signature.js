#!/usr/bin/env node
'use strict';

// Detached signature over build/SHA256SUMS.
//
// Releases are built locally with no CI, so the artifacts and their checksum
// file share one origin: whoever can forge an artifact can forge its hash, and
// the checksum file on its own proves only that a download was not corrupted.
// A signature over that file is what turns it into a provenance claim.
//
// Why SSH signatures and not GPG or minisign. `ssh-keygen -Y sign/-Y verify`
// ships with Git for Windows, macOS, and every Linux, so neither the
// maintainer nor the person verifying installs anything. The public half is one
// line, which means it can live in a committed `allowed_signers` file that a
// reader can eyeball, and the verify command is one line with no keyring, no
// trust database, and no "gpg: WARNING: This key is not certified" footgun.
//
// Custody follows the same boundary as ytkit.pem (see docs/signing-keys.md):
// the private key lives outside the worktree, the repo carries only the public
// half, and nothing here ever writes key material into build/ or the repo.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const BUILD_DIR = path.join(REPO_ROOT, 'build');
const SHA256SUMS_NAME = 'SHA256SUMS';
const SIGNATURE_NAME = 'SHA256SUMS.sig';
const ALLOWED_SIGNERS_NAME = 'allowed-signers';
const ALLOWED_SIGNERS_PATH = path.join(REPO_ROOT, ALLOWED_SIGNERS_NAME);

// Namespaces scope a signature to a purpose, so a signature made for one
// context cannot be replayed as proof in another. Anything verifying an Astra
// Deck checksum file must pass this exact string.
const SIGNATURE_NAMESPACE = 'astra-deck-release';

// The identity the allowed-signers file keys on. It is a label, not an
// address that receives mail.
const SIGNER_IDENTITY = 'releases@astra-deck';

function defaultKeyPath() {
    if (process.env.ASTRA_RELEASE_SIGNING_KEY) return process.env.ASTRA_RELEASE_SIGNING_KEY;
    if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
        return path.join(process.env.LOCALAPPDATA, 'Astra-Deck', 'keys', 'release-signing-key');
    }
    const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    return path.join(configHome, 'Astra-Deck', 'keys', 'release-signing-key');
}

/**
 * Reads the committed allowed-signers file.
 *
 * An absent or comment-only file is the "no key published yet" state, and it
 * is a distinct answer from "the file is malformed" — the readiness gate
 * treats the two differently, so they must not collapse into one null here.
 */
function readAllowedSigners(allowedSignersPath = ALLOWED_SIGNERS_PATH) {
    let text;
    try {
        text = fs.readFileSync(allowedSignersPath, 'utf8');
    } catch (_) {
        return { present: false, entries: [], path: allowedSignersPath };
    }
    const entries = text.split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
            const [principal, keyType, keyBody] = line.split(/\s+/);
            return { principal, keyType, keyBody, line };
        })
        // A line without all three fields is not a key, and treating it as one
        // would hand ssh-keygen an argument it reports as a file-format error
        // rather than as the missing key it actually is.
        .filter((entry) => entry.principal && entry.keyType && entry.keyBody);
    return { present: true, entries, path: allowedSignersPath };
}

function assertKeyOutsideRepo(keyPath) {
    const resolved = path.resolve(keyPath);
    const inside = path.relative(REPO_ROOT, resolved);
    if (inside && !inside.startsWith('..') && !path.isAbsolute(inside)) {
        throw new Error(
            `refusing to sign with a key inside the worktree (${inside}); `
            + 'see docs/signing-keys.md §7 for the custody boundary'
        );
    }
}

function signChecksums(options = {}) {
    const buildDir = options.buildDir || BUILD_DIR;
    const keyPath = options.keyPath || defaultKeyPath();
    const checksumPath = path.join(buildDir, SHA256SUMS_NAME);
    const signaturePath = path.join(buildDir, SIGNATURE_NAME);

    if (!fs.existsSync(checksumPath)) {
        throw new Error(`missing ${path.relative(REPO_ROOT, checksumPath)}; run npm run release:manifest first`);
    }
    if (!fs.existsSync(keyPath)) {
        throw new Error(
            `no release signing key at ${keyPath}. Set ASTRA_RELEASE_SIGNING_KEY or `
            + 'generate one per docs/signing-keys.md §9'
        );
    }
    assertKeyOutsideRepo(keyPath);

    // -Y sign writes <input>.sig next to the input.
    execFileSync('ssh-keygen', [
        '-Y', 'sign',
        '-f', keyPath,
        '-n', SIGNATURE_NAMESPACE,
        checksumPath
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    if (!fs.existsSync(signaturePath)) {
        throw new Error(`ssh-keygen reported success but produced no ${SIGNATURE_NAME}`);
    }
    return { signaturePath, checksumPath, keyPath };
}

/**
 * Verifies build/SHA256SUMS against the committed allowed-signers file.
 *
 * Returns a plain result rather than throwing so the readiness report can
 * render every outcome the same way. `status` is one of:
 *   'verified'          signature present and valid for a published key
 *   'no-published-key'  the project has not published a signing key yet
 *   'missing'           a key is published but the release carries no signature
 *   'invalid'           a signature exists and does not verify
 *   'unavailable'       ssh-keygen is not on this machine
 */
function verifyChecksums(options = {}) {
    const buildDir = options.buildDir || BUILD_DIR;
    const allowed = readAllowedSigners(options.allowedSignersPath);
    const checksumPath = path.join(buildDir, SHA256SUMS_NAME);
    const signaturePath = path.join(buildDir, SIGNATURE_NAME);

    if (allowed.entries.length === 0) {
        return {
            status: 'no-published-key',
            details: `${ALLOWED_SIGNERS_NAME} lists no signing key yet`
        };
    }
    if (!fs.existsSync(checksumPath)) {
        return { status: 'missing', details: `missing build/${SHA256SUMS_NAME}` };
    }
    if (!fs.existsSync(signaturePath)) {
        return { status: 'missing', details: `missing build/${SIGNATURE_NAME}` };
    }

    const identity = options.identity || allowed.entries[0].principal || SIGNER_IDENTITY;
    try {
        execFileSync('ssh-keygen', [
            '-Y', 'verify',
            '-f', allowed.path,
            '-I', identity,
            '-n', SIGNATURE_NAMESPACE,
            '-s', signaturePath
        ], {
            input: fs.readFileSync(checksumPath),
            stdio: ['pipe', 'pipe', 'pipe']
        });
    } catch (error) {
        // ENOENT is the tool missing, which is a different answer from a bad
        // signature and must never be reported as one.
        if (error?.code === 'ENOENT') {
            return { status: 'unavailable', details: 'ssh-keygen is not available on this machine' };
        }
        const stderr = String(error?.stderr || '').trim();
        return { status: 'invalid', details: stderr || 'ssh-keygen could not verify the signature' };
    }
    return { status: 'verified', details: `signed by ${identity}` };
}

// This script terminates the build:userscript chain, so a typo'd flag here
// would otherwise be swallowed by npm and read as a step that ran.
function assertKnownArgs(argv) {
    const known = new Set(['--verify', '--key']);
    const unknown = argv.filter((arg) => arg.startsWith('--') && !known.has(arg));
    if (unknown.length) {
        console.error(`[release-signature] unknown argument(s): ${unknown.join(', ')}`);
        process.exit(2);
    }
}

function main() {
    const argv = process.argv.slice(2);
    assertKnownArgs(argv);
    const verifyOnly = argv.includes('--verify');
    const keyArgIndex = argv.indexOf('--key');
    const keyPath = keyArgIndex !== -1 ? argv[keyArgIndex + 1] : undefined;

    if (verifyOnly) {
        const result = verifyChecksums();
        console.log(`[release-signature] ${result.status}: ${result.details}`);
        process.exit(result.status === 'verified' || result.status === 'no-published-key' ? 0 : 1);
    }

    // Signing sits in the release chain so the pipeline is complete, but the
    // project has not published a signing key yet. Skipping quietly here would
    // hide that; failing would lock the release path behind work that has not
    // happened. Say so and continue — the readiness gate carries the warning,
    // and the moment a key line lands in allowed-signers this becomes a hard
    // requirement in both places at once.
    if (readAllowedSigners().entries.length === 0) {
        console.log(
            `[release-signature] skipped: ${ALLOWED_SIGNERS_NAME} publishes no signing key, `
            + 'so a signature would verify against nothing. See docs/signing-keys.md §9.'
        );
        return;
    }

    const { signaturePath, keyPath: used } = signChecksums({ keyPath });
    console.log(`[release-signature] wrote ${path.relative(REPO_ROOT, signaturePath)} using ${used}`);
    const result = verifyChecksums();
    if (result.status !== 'verified' && result.status !== 'no-published-key') {
        throw new Error(`the signature just written does not verify: ${result.details}`);
    }
    console.log(`[release-signature] ${result.status}: ${result.details}`);
}

if (require.main === module) {
    try {
        main();
    } catch (err) {
        console.error('[release-signature] ' + err.message);
        process.exit(1);
    }
}

module.exports = {
    ALLOWED_SIGNERS_NAME,
    assertKnownArgs,
    ALLOWED_SIGNERS_PATH,
    SHA256SUMS_NAME,
    SIGNATURE_NAME,
    SIGNATURE_NAMESPACE,
    SIGNER_IDENTITY,
    defaultKeyPath,
    readAllowedSigners,
    signChecksums,
    verifyChecksums
};
