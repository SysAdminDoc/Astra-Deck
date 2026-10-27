'use strict';

// The signing script is what stands between an edited feed and a silent
// authenticity failure on every install. These exercise its crypto contract
// and its gate directly, because a signature helper that always returns true
// passes every integration test in the suite.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const signer = require('../scripts/sign-remote-feeds.js');

const repoRoot = path.join(__dirname, '..');

function stageRepo() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-feed-sig-'));
    fs.mkdirSync(path.join(dir, 'extension'), { recursive: true });
    for (const feed of signer.SIGNED_FEEDS) {
        fs.copyFileSync(path.join(repoRoot, feed.file), path.join(dir, feed.file));
        fs.copyFileSync(path.join(repoRoot, feed.file + signer.SIGNATURE_SUFFIX),
            path.join(dir, feed.file + signer.SIGNATURE_SUFFIX));
    }
    fs.copyFileSync(path.join(repoRoot, 'extension', 'background.js'),
        path.join(dir, 'extension', 'background.js'));
    return dir;
}

test('every shipped feed signature verifies against the embedded public key', () => {
    assert.deepEqual(signer.checkEmbeddedKeyMatches(), [],
        'extension/background.js must carry the same public key the signer uses');
    assert.deepEqual(signer.checkAll(), [],
        'each committed feed signature must verify — run npm run sign:feeds');
});

test('a one-byte change to a feed invalidates its signature', () => {
    for (const feed of signer.SIGNED_FEEDS) {
        const payload = fs.readFileSync(path.join(repoRoot, feed.file));
        const signature = Buffer.from(
            fs.readFileSync(path.join(repoRoot, feed.file + signer.SIGNATURE_SUFFIX), 'utf8').trim(), 'base64');

        assert.equal(signer.verifyPayload(payload, signature), true,
            `${feed.file} must verify untouched`);

        const tampered = Buffer.from(payload);
        tampered[tampered.length - 1] ^= 0x01;
        assert.equal(signer.verifyPayload(tampered, signature), false,
            `${feed.file} must not verify after a single-byte change`);
    }
});

test('malformed signatures are refused rather than throwing', () => {
    const payload = fs.readFileSync(path.join(repoRoot, signer.SIGNED_FEEDS[0].file));
    assert.equal(signer.verifyPayload(payload, Buffer.alloc(0)), false, 'empty');
    assert.equal(signer.verifyPayload(payload, Buffer.alloc(63)), false, 'short');
    assert.equal(signer.verifyPayload(payload, Buffer.alloc(65)), false, 'long');
    assert.equal(signer.verifyPayload(payload, Buffer.alloc(64)), false, 'all-zero');
    assert.equal(signer.verifyPayload(payload, 'not a buffer'), false, 'wrong type');
});

test('the gate reports an edited feed whose signature was not refreshed', () => {
    const staged = stageRepo();
    try {
        const target = path.join(staged, signer.SIGNED_FEEDS[0].file);
        fs.appendFileSync(target, '\nastraDeck,4.0.0,4.99.0,unsigned-edit\n');

        const problems = signer.checkAll(staged);
        assert.equal(problems.length, 1, 'exactly the edited feed must be reported');
        assert.match(problems[0], /does not verify against the shipped public key/);
        assert.match(problems[0], /sign:feeds/, 'the gate must name the command that fixes it');
    } finally {
        fs.rmSync(staged, { recursive: true, force: true });
    }
});

test('the gate reports a missing signature file', () => {
    const staged = stageRepo();
    try {
        fs.rmSync(path.join(staged, signer.SIGNED_FEEDS[1].file + signer.SIGNATURE_SUFFIX));
        const problems = signer.checkAll(staged);
        assert.equal(problems.length, 1);
        assert.match(problems[0], /is missing or malformed/);
    } finally {
        fs.rmSync(staged, { recursive: true, force: true });
    }
});

test('DER and raw signature encodings round-trip', () => {
    // The signer converts Node's DER output to the raw r||s pair WebCrypto
    // wants. A one-way bug here would ship signatures the browser refuses.
    const payload = fs.readFileSync(path.join(repoRoot, signer.SIGNED_FEEDS[0].file));
    const raw = Buffer.from(
        fs.readFileSync(path.join(repoRoot, signer.SIGNED_FEEDS[0].file + signer.SIGNATURE_SUFFIX), 'utf8').trim(),
        'base64');
    const der = signer.rawToDerSignature(raw);
    assert.equal(der[0], 0x30, 'a DER signature is a sequence');
    assert.deepEqual(signer.derToRawSignature(der), raw, 'DER -> raw must return the original bytes');
    assert.equal(signer.verifyPayload(payload, signer.derToRawSignature(der)), true);
});

test('the signing script is registered as a check gate', () => {
    const { GATES } = require('../scripts/run-checks.js');
    const gate = GATES.find((entry) => entry.id === 'feed-signatures');
    assert.ok(gate, 'feed signatures must be verified by npm run check');
    assert.equal(gate.script, 'sign-remote-feeds.js');
    assert.deepEqual(gate.args, ['--check']);
});

// The known-breakage feed carries a signed sequence and expiry. A release
// re-signs it, so a committed copy close to expiry warns and an expired or
// envelope-less one fails the gate.
const envelopeFeed = signer.SIGNED_FEEDS.find((feed) => feed.envelope);
const DAY_MS = 24 * 60 * 60 * 1000;

test('the next envelope raises the sequence and starts a fresh window', () => {
    const now = Date.parse('2026-10-27T01:03:36.789Z');
    const current = '# astra-feed: sequence=6 issued=2026-09-01T00:00:00Z expires=2026-10-31T00:00:00Z\nfeature,issue,broken-from,fixed-in\n';
    const next = signer.nextEnvelope(current, now);
    assert.equal(next.sequence, 7);
    assert.equal(next.issuedAt, Date.parse('2026-10-27T01:03:36Z'), 'whole seconds, so it round-trips the stamp');
    assert.equal(next.expiresAt - next.issuedAt, 60 * DAY_MS);
    assert.equal(signer.nextEnvelope('feature,issue,broken-from,fixed-in\n', now).sequence, 1);
});

test('the gate fails an expired or envelope-less feed and warns two weeks out', () => {
    assert.ok(envelopeFeed, 'the known-breakage feed is signed with an envelope');
    const text = fs.readFileSync(path.join(repoRoot, envelopeFeed.file), 'utf8');
    const { expiresAt } = require('../extension/core/feature-disable-feed.js').readFeedEnvelope(text);

    const warnings = [];
    assert.deepEqual(signer.checkAll(repoRoot, { now: expiresAt - 7 * DAY_MS, warnings }), []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /next release re-signs it/);

    const expired = signer.checkAll(repoRoot, { now: expiresAt });
    assert.equal(expired.length, 1);
    assert.match(expired[0], /expired.*sign:feeds/);

    assert.match(signer.checkEnvelope(envelopeFeed, 'feature,issue,broken-from,fixed-in\n', Date.now()).problem,
        /no valid "# astra-feed:" first line/);
});
