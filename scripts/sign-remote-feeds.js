#!/usr/bin/env node
'use strict';

// Detached signatures for the two documents that can change shipped behavior
// without a release: `selector-packs.json` and `feature-disable-feed.csv`.
//
// Both are fetched from raw.githubusercontent.com at runtime. Before v4.88.3
// neither carried an authenticity check. The feed had none at all, and the
// selector asset verified a `sha256:` digest that is parsed out of the very
// document it is meant to vouch for — so it caught truncation and corruption
// but not substitution. Anyone able to write the repository or intercept the
// CDN could pause features or replace selectors on every install.
//
// The signature is ECDSA P-256 over SHA-256, raw (r||s) form, base64. Not
// Ed25519: WebCrypto did not expose Ed25519 until Chrome 137, and this project
// supports Chrome 120. ECDSA P-256 has been available in every supported
// engine for years.
//
// The private key never enters the repository. See docs/signing-keys.md §12.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

// Mirrors FEED_SIGNING_PUBLIC_KEY in extension/background.js. The gate below
// fails if the two ever disagree, so a rotated key cannot ship half-applied.
const PUBLIC_KEY_JWK = Object.freeze({
    kty: 'EC',
    crv: 'P-256',
    x: 'JHadRIB-_yJUD9ROm7AclgBUER4Yo1jp5tCvijBoHqo',
    y: 'CBJ2lKr699c_TgmBPKEJV4QhoEmLlV4a3yfC0qnCuGQ'
});

const SIGNED_FEEDS = Object.freeze([
    Object.freeze({ file: 'selector-packs.json', label: 'selector asset' }),
    Object.freeze({ file: 'feature-disable-feed.csv', label: 'feature disable feed' })
]);

const SIGNATURE_SUFFIX = '.sig';

function defaultPrivateKeyPath() {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, 'Astra-Deck', 'keys', 'feed-signing.pem');
}

function resolvePrivateKeyPath() {
    return process.env.ASTRA_FEED_SIGNING_KEY_PATH || defaultPrivateKeyPath();
}

// Node's `sign()` emits DER for EC keys; WebCrypto's `verify()` expects the raw
// r||s pair. Converting here keeps the browser side free of an ASN.1 reader.
function derToRawSignature(der) {
    if (der[0] !== 0x30) throw new Error('signature is not a DER sequence');
    let offset = 2;
    if (der[1] & 0x80) offset = 2 + (der[1] & 0x7f);
    const readInt = () => {
        if (der[offset] !== 0x02) throw new Error('signature component is not a DER integer');
        const length = der[offset + 1];
        let start = offset + 2;
        let end = start + length;
        offset = end;
        let bytes = der.subarray(start, end);
        // Strip DER's sign padding, then left-pad to the curve's 32 bytes.
        while (bytes.length > 32 && bytes[0] === 0x00) bytes = bytes.subarray(1);
        if (bytes.length > 32) throw new Error('signature component is too large for P-256');
        const padded = Buffer.alloc(32);
        bytes.copy(padded, 32 - bytes.length);
        return padded;
    };
    const r = readInt();
    const s = readInt();
    return Buffer.concat([r, s]);
}

function rawToDerSignature(raw) {
    if (raw.length !== 64) throw new Error('raw signature must be 64 bytes');
    const encodeInt = (bytes) => {
        let start = 0;
        while (start < bytes.length - 1 && bytes[start] === 0x00) start += 1;
        let value = bytes.subarray(start);
        if (value[0] & 0x80) value = Buffer.concat([Buffer.from([0x00]), value]);
        return Buffer.concat([Buffer.from([0x02, value.length]), value]);
    };
    const r = encodeInt(raw.subarray(0, 32));
    const s = encodeInt(raw.subarray(32, 64));
    const body = Buffer.concat([r, s]);
    return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

function publicKeyObject() {
    return crypto.createPublicKey({ key: { ...PUBLIC_KEY_JWK }, format: 'jwk' });
}

function signPayload(payload, privateKeyPem) {
    const key = crypto.createPrivateKey(privateKeyPem);
    const der = crypto.sign('sha256', payload, key);
    return derToRawSignature(der);
}

function verifyPayload(payload, rawSignature) {
    if (!Buffer.isBuffer(rawSignature) || rawSignature.length !== 64) return false;
    let der;
    try {
        der = rawToDerSignature(rawSignature);
    } catch (_) {
        // reason: a malformed signature is a failed verification, not a crash
        return false;
    }
    try {
        return crypto.verify('sha256', payload, publicKeyObject(), der);
    } catch (_) {
        // reason: an unusable signature is a failed verification
        return false;
    }
}

function readSignature(sigPath) {
    if (!fs.existsSync(sigPath)) return null;
    const text = fs.readFileSync(sigPath, 'utf8').trim();
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return null;
    const raw = Buffer.from(text, 'base64');
    return raw.length === 64 ? raw : null;
}

function checkAll(repoRoot = REPO_ROOT) {
    const problems = [];
    for (const feed of SIGNED_FEEDS) {
        const payloadPath = path.join(repoRoot, feed.file);
        const sigPath = payloadPath + SIGNATURE_SUFFIX;
        if (!fs.existsSync(payloadPath)) {
            problems.push(`${feed.file} is missing`);
            continue;
        }
        const raw = readSignature(sigPath);
        if (!raw) {
            problems.push(`${feed.file}${SIGNATURE_SUFFIX} is missing or malformed — run npm run sign:feeds`);
            continue;
        }
        if (!verifyPayload(fs.readFileSync(payloadPath), raw)) {
            problems.push(`${feed.file}${SIGNATURE_SUFFIX} does not verify against the shipped public key — run npm run sign:feeds`);
        }
    }
    return problems;
}

// The embedded key is the one the browser actually trusts. A rotation that
// updates the signing key but not background.js would produce signatures the
// extension refuses, and every install would silently stop taking updates.
function checkEmbeddedKeyMatches(repoRoot = REPO_ROOT) {
    const source = fs.readFileSync(path.join(repoRoot, 'extension', 'background.js'), 'utf8');
    const problems = [];
    for (const [field, value] of Object.entries(PUBLIC_KEY_JWK)) {
        if (!source.includes(`'${value}'`) && !source.includes(`"${value}"`)) {
            problems.push(`extension/background.js does not carry the signing key's ${field} value`);
        }
    }
    return problems;
}

function main(argv) {
    const check = argv.includes('--check');
    const problems = [...checkEmbeddedKeyMatches(), ...(check ? checkAll() : [])];

    if (check) {
        if (problems.length) {
            for (const problem of problems) console.error(`[sign-feeds] ${problem}`);
            process.exitCode = 1;
            return;
        }
        console.log(`[sign-feeds] OK — ${SIGNED_FEEDS.length} feed signature(s) verify against the shipped public key`);
        return;
    }

    if (problems.length) {
        for (const problem of problems) console.error(`[sign-feeds] ${problem}`);
        process.exitCode = 1;
        return;
    }

    const keyPath = resolvePrivateKeyPath();
    if (!fs.existsSync(keyPath)) {
        console.error(`[sign-feeds] signing key not found at ${keyPath}`);
        console.error('[sign-feeds] Set ASTRA_FEED_SIGNING_KEY_PATH or see docs/signing-keys.md §12.');
        process.exitCode = 1;
        return;
    }
    const privateKeyPem = fs.readFileSync(keyPath, 'utf8');

    for (const feed of SIGNED_FEEDS) {
        const payloadPath = path.join(REPO_ROOT, feed.file);
        const payload = fs.readFileSync(payloadPath);
        const raw = signPayload(payload, privateKeyPem);
        if (!verifyPayload(payload, raw)) {
            console.error(`[sign-feeds] refusing to write a signature for ${feed.file} that does not verify`);
            process.exitCode = 1;
            return;
        }
        fs.writeFileSync(payloadPath + SIGNATURE_SUFFIX, raw.toString('base64') + '\n');
        console.log(`[sign-feeds] signed ${feed.file} (${payload.length} bytes)`);
    }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
    PUBLIC_KEY_JWK,
    SIGNED_FEEDS,
    SIGNATURE_SUFFIX,
    checkAll,
    checkEmbeddedKeyMatches,
    derToRawSignature,
    rawToDerSignature,
    signPayload,
    verifyPayload,
    resolvePrivateKeyPath
};
