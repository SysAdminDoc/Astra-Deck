'use strict';

// The detached signature over build/SHA256SUMS.
//
// The checksum file and the artifacts it lists are produced by one machine in
// one step, so on its own it proves a download was not corrupted and nothing
// about who produced it. These tests exercise the signature that closes that
// gap end to end against a real throwaway key, because a source-shape
// assertion cannot tell a working signature from a decorative one.

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const signature = require('../scripts/release-signature');
const REPO_ROOT = path.join(__dirname, '..');

function sshKeygenAvailable() {
    try {
        execFileSync('ssh-keygen', ['-Y', 'sign'], { stdio: 'pipe' });
        return true;
    } catch (error) {
        // Missing arguments is the success case here: the binary ran.
        return error?.code !== 'ENOENT';
    }
}

function withFixture(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-sig-'));
    try {
        const buildDir = path.join(dir, 'build');
        fs.mkdirSync(buildDir);
        fs.writeFileSync(path.join(buildDir, 'SHA256SUMS'),
            'd2a84f4b8b650937ec8f73cd8be2c74add5a911ba64df27458ed8229da804a26  astra-deck.zip\n');
        execFileSync('ssh-keygen',
            ['-t', 'ed25519', '-N', '', '-C', 'astra-deck-test', '-f', path.join(dir, 'key'), '-q'],
            { stdio: 'pipe' });
        const pub = fs.readFileSync(path.join(dir, 'key.pub'), 'utf8').trim().split(/\s+/);
        const allowedSignersPath = path.join(dir, 'allowed-signers');
        fs.writeFileSync(allowedSignersPath,
            `# fixture\nreleases@astra-deck ${pub[0]} ${pub[1]}\n`);
        return fn({ dir, buildDir, keyPath: path.join(dir, 'key'), allowedSignersPath });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

const canSign = sshKeygenAvailable();

test('a signed checksum file verifies against the published key', { skip: !canSign }, () => {
    withFixture(({ buildDir, keyPath, allowedSignersPath }) => {
        signature.signChecksums({ buildDir, keyPath });
        assert.equal(fs.existsSync(path.join(buildDir, 'SHA256SUMS.sig')), true);

        const result = signature.verifyChecksums({ buildDir, allowedSignersPath });
        assert.equal(result.status, 'verified');
    });
});

test('editing one byte of the checksum file breaks the signature', { skip: !canSign }, () => {
    withFixture(({ buildDir, keyPath, allowedSignersPath }) => {
        signature.signChecksums({ buildDir, keyPath });
        // The attack this exists to stop: swap the hash, keep the signature.
        fs.writeFileSync(path.join(buildDir, 'SHA256SUMS'),
            '0000000000000000000000000000000000000000000000000000000000000000  astra-deck.zip\n');

        const result = signature.verifyChecksums({ buildDir, allowedSignersPath });
        assert.equal(result.status, 'invalid');
    });
});

test('a signature from a different key does not verify', { skip: !canSign }, () => {
    withFixture(({ dir, buildDir, allowedSignersPath }) => {
        const otherKey = path.join(dir, 'other');
        execFileSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', otherKey, '-q'], { stdio: 'pipe' });
        signature.signChecksums({ buildDir, keyPath: otherKey });

        const result = signature.verifyChecksums({ buildDir, allowedSignersPath });
        assert.equal(result.status, 'invalid');
    });
});

test('a published key with no signature is missing, not merely unverified', { skip: !canSign }, () => {
    withFixture(({ buildDir, allowedSignersPath }) => {
        const result = signature.verifyChecksums({ buildDir, allowedSignersPath });
        assert.equal(result.status, 'missing');
    });
});

test('a signature made for another purpose cannot be replayed here', { skip: !canSign }, () => {
    withFixture(({ buildDir, keyPath, allowedSignersPath }) => {
        const checksumPath = path.join(buildDir, 'SHA256SUMS');
        // Same key, same bytes, different namespace. Without namespace
        // scoping this would verify and a signature the maintainer made for
        // some unrelated purpose would read as a release attestation.
        execFileSync('ssh-keygen',
            ['-Y', 'sign', '-f', keyPath, '-n', 'git', checksumPath],
            { stdio: 'pipe' });

        const result = signature.verifyChecksums({ buildDir, allowedSignersPath });
        assert.equal(result.status, 'invalid');
    });
});

test('an empty or comment-only allowed-signers file reads as no published key', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-sig-'));
    try {
        const allowedSignersPath = path.join(dir, 'allowed-signers');
        fs.writeFileSync(allowedSignersPath, '# nothing published yet\n\n');
        const parsed = signature.readAllowedSigners(allowedSignersPath);
        assert.equal(parsed.present, true);
        assert.deepEqual(parsed.entries, []);

        const result = signature.verifyChecksums({ buildDir: dir, allowedSignersPath });
        assert.equal(result.status, 'no-published-key');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('signing refuses a key stored inside the worktree', { skip: !canSign }, () => {
    // Own fixture rather than the repo's real build/. Pointing at build/ made
    // the test depend on whether some earlier command had left a SHA256SUMS
    // there: with one it reached the key check, without one it failed on the
    // missing checksum file and passed for the wrong reason.
    withFixture(({ dir, buildDir }) => {
        const inRepoKey = path.join(REPO_ROOT, 'release-signing-key');
        fs.writeFileSync(inRepoKey, 'not a real key\n');
        try {
            assert.throws(
                () => signature.signChecksums({ buildDir, keyPath: inRepoKey }),
                /worktree/,
                'a key inside the repo must never be used to sign a release'
            );
        } finally {
            fs.rmSync(inRepoKey, { force: true });
        }
        // And a key that simply is not there reports that, rather than being
        // mistaken for a custody violation.
        assert.throws(
            () => signature.signChecksums({ buildDir, keyPath: path.join(dir, 'absent-key') }),
            /no release signing key/
        );
    });
});

test('the committed allowed-signers file parses and carries the verify command', () => {
    const text = fs.readFileSync(path.join(REPO_ROOT, signature.ALLOWED_SIGNERS_NAME), 'utf8');
    // The file is what a verifier downloads, so the instructions have to be in
    // it rather than only in a doc they may never open.
    assert.match(text, /ssh-keygen -Y verify/);
    assert.match(text, new RegExp(signature.SIGNATURE_NAMESPACE));
    assert.match(text, new RegExp(signature.SIGNER_IDENTITY));

    // Every non-comment line must be a well-formed principal + key.
    for (const entry of signature.readAllowedSigners().entries) {
        assert.match(entry.keyType, /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp\d+|sk-ssh-ed25519@openssh\.com)$/);
        assert.ok(entry.keyBody.length > 40, 'key body must be a real base64 key');
    }
});

test('README documents the exact verify command the allowed-signers file names', () => {
    const readme = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
    assert.match(readme, /ssh-keygen -Y verify/);
    assert.match(readme, new RegExp(`-n ${signature.SIGNATURE_NAMESPACE}`));
    assert.match(readme, /-s SHA256SUMS\.sig/);
});

test('release readiness fails on a missing or invalid signature and warns with no key', () => {
    const source = fs.readFileSync(
        path.join(REPO_ROOT, 'scripts', 'generate-release-readiness.js'), 'utf8');
    const block = source.slice(source.indexOf('SIGNATURE_STATUS_LEVEL'));
    assert.match(block, /missing:\s*'fail'/);
    assert.match(block, /invalid:\s*'fail'/);
    assert.match(block, /'no-published-key':\s*'warning'/);
    assert.match(block, /verified:\s*'pass'/);
});

test('the signature is uploaded beside the checksum file, never listed inside it', () => {
    const manifestScript = fs.readFileSync(
        path.join(REPO_ROOT, 'scripts', 'generate-release-manifest.js'), 'utf8');
    // A file that signs a list cannot be an entry in the list it signs.
    assert.match(manifestScript, /name !== SIGNATURE_NAME/);
});
