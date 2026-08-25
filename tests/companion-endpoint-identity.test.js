'use strict';

// Binding the companion's HTTP identity to its native-messaging identity.
//
// The cookie handoff was well guarded on everything except which program it was
// talking to. A crypto capability, one use, a 20 second TTL, bound to the tab
// and document, and requiring a fresh connectNative proof — but that proof only
// shows that A native host is registered. The cookies then go to
// http://127.0.0.1:<port>/download, chosen from whoever answered /health with
// {"service":"astra-downloader"}, with no shared secret between the two
// channels. A local process that binds a companion port first receives the
// native-issued token and, with it, LOGIN_INFO and the SAPISID family.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const contract = require('../extension/core/cookie-handoff.js');
const downloadUi = fs.readFileSync(
    path.join(repoRoot, 'extension', 'features', 'download-ui', 'index.js'), 'utf8');
const background = fs.readFileSync(path.join(repoRoot, 'extension', 'background.js'), 'utf8');

const CHALLENGE = 'a'.repeat(32);
const PROOF = 'b'.repeat(64);

// ── the comparison ──

test('a proof only matches when it is the same answer to the same challenge', () => {
    assert.equal(contract.isEndpointProofValid(CHALLENGE, PROOF, PROOF), true);
    assert.equal(contract.isEndpointProofValid(CHALLENGE, PROOF, 'c'.repeat(64)), false,
        'a different answer is a different program');
});

test('a malformed challenge or proof is refused rather than coerced', () => {
    const cases = [
        [null, PROOF, PROOF, 'no challenge'],
        ['', PROOF, PROOF, 'empty challenge'],
        ['zz' + 'a'.repeat(30), PROOF, PROOF, 'a challenge that is not hex'],
        ['a'.repeat(31), PROOF, PROOF, 'a challenge of the wrong length'],
        [CHALLENGE, null, PROOF, 'no native answer'],
        [CHALLENGE, PROOF, null, 'no endpoint answer'],
        [CHALLENGE, PROOF, 'b'.repeat(63), 'a truncated endpoint answer'],
        [CHALLENGE, PROOF, PROOF.toUpperCase(), 'a case-shifted answer'],
        [CHALLENGE, 'b'.repeat(64) + 'b', PROOF, 'an over-long native answer'],
        // The one the comparison loop alone cannot catch: an answer that shares
        // the whole prefix and continues past it compares equal over
        // nativeProof.length, so only the fixed-length pattern refuses it.
        [CHALLENGE, PROOF, PROOF + 'c', 'an endpoint answer with the right prefix and more after it']
    ];
    for (const [challenge, native, endpoint, why] of cases) {
        assert.equal(contract.isEndpointProofValid(challenge, native, endpoint), false, why);
    }
});

test('the comparison does not short-circuit on the first differing character', () => {
    // Both are full-length hex by the patterns, so the loop runs to the end.
    const early = 'c' + 'b'.repeat(63);
    const late = 'b'.repeat(63) + 'c';
    assert.equal(contract.isEndpointProofValid(CHALLENGE, PROOF, early), false);
    assert.equal(contract.isEndpointProofValid(CHALLENGE, PROOF, late), false);
    const source = fs.readFileSync(
        path.join(repoRoot, 'extension', 'core', 'cookie-handoff.js'), 'utf8');
    const start = source.indexOf('function isEndpointProofValid(');
    const body = source.slice(start, source.indexOf('\n    }', start));
    assert.match(body, /diff \|= /, 'the answer is accumulated, not returned early');
    assert.ok(!/return false;\s*\n\s*\}\s*\n\s*return diff/.test(body.slice(body.indexOf('for ('))),
        'the loop must not bail on the first mismatch');
});

// ── the endpoint prover ──

function loadProver({ respond, headers = {} } = {}) {
    const start = downloadUi.indexOf('            async _proveEndpointIdentity(challenge, nativeProof) {');
    assert.ok(start > -1, 'the prover must exist');
    const end = downloadUi.indexOf('\n            _headers(extra = {}) {', start);
    const body = downloadUi.slice(start, end);

    const requests = [];
    const sandbox = {
        console,
        encodeURIComponent,
        extensionFetchJson: async (options) => {
            requests.push(options);
            return respond ? respond(options) : { data: {} };
        }
    };
    sandbox.globalThis = sandbox;
    sandbox.YTKitCore = { cookieHandoff: contract };
    // The factory destructures cookieHandoff as a dependency; the lifted method
    // closes over that binding, so the sandbox has to supply it too.
    sandbox.cookieHandoff = contract;

    const manager = vm.runInNewContext(
        '({ _port: 9751, baseUrl() { return "http://127.0.0.1:9751"; },'
        + ' _headers(extra) { return Object.assign({}, extra); },'
        + body.replace(/^\s+/, '') + ' })',
        sandbox
    );
    void headers;
    return { manager, requests };
}

// WHEN the endpoint returns the native host's answer, identity is proven.
test('an endpoint that answers the challenge is accepted', async () => {
    const { manager, requests } = loadProver({
        respond: () => ({ data: { challengeProof: PROOF } })
    });
    assert.equal(await manager._proveEndpointIdentity(CHALLENGE, PROOF), null);
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /\/identity\?challenge=a{32}$/,
        'the challenge has to reach the endpoint');
    assert.equal(requests[0].headers['X-MDL-Endpoint-Challenge'], CHALLENGE);
});

// WHEN a squatter answers with anything else, it is refused. This is the whole
// point: it can bind the port and answer /health, but it never saw the
// challenge go out over the native channel.
test('a squatter that answers with the wrong proof is refused', async () => {
    const { manager } = loadProver({
        respond: () => ({ data: { challengeProof: 'c'.repeat(64), service: 'astra-downloader', status: 'ok' } })
    });
    assert.equal(await manager._proveEndpointIdentity(CHALLENGE, PROOF), 'endpoint-proof-mismatch');
});

test('a squatter that echoes the challenge back is refused', async () => {
    const { manager } = loadProver({
        respond: (options) => ({ data: { challengeProof: options.headers['X-MDL-Endpoint-Challenge'] } })
    });
    assert.equal(await manager._proveEndpointIdentity(CHALLENGE, PROOF), 'endpoint-proof-mismatch',
        'the challenge is not the answer to itself');
});

test('an endpoint with no identity route is refused, not trusted', async () => {
    const { manager } = loadProver({
        respond: () => { throw new Error('404'); }
    });
    assert.equal(await manager._proveEndpointIdentity(CHALLENGE, PROOF), 'endpoint-proof-unanswered');
});

test('a missing native answer is refused without even asking the endpoint', async () => {
    const { manager, requests } = loadProver({ respond: () => ({ data: { challengeProof: PROOF } }) });
    assert.equal(await manager._proveEndpointIdentity('', PROOF), 'native-proof-missing');
    assert.equal(await manager._proveEndpointIdentity(CHALLENGE, ''), 'native-proof-missing');
    assert.equal(requests.length, 0,
        'nothing is asked of an endpoint we have no answer to compare against');
});

// ── the wiring ──

// WHEN cookies are about to be read, the endpoint SHALL have proven itself
// first. The order matters: a refusal after the read has already happened
// protects nothing.
test('the endpoint is challenged before any cookie is read', () => {
    const start = downloadUi.indexOf('const proofIsCurrent = proof.token === token');
    assert.ok(start > -1, 'the cookie gate must still be here');
    const gate = downloadUi.slice(start, start + 2200);

    const proveAt = gate.indexOf('_proveEndpointIdentity(proof.endpointChallenge, proof.endpointProof)');
    const readAt = gate.indexOf('browserCookies.getDownloadHandoff(capability)');
    assert.ok(proveAt > -1, 'the challenge has to be issued');
    assert.ok(readAt > proveAt, 'and it has to happen before the cookies are read');

    assert.match(gate, /} else if \(endpointFailure\) \{/,
        'a failed proof must take its own branch rather than falling through');
    assert.match(gate, /recordCookieHandoffDiagnostic\(endpointFailure\)/,
        'and the reason has to be recorded, or a withheld handoff looks like a bug');
});

// WHEN the challenge is generated, it SHALL be fresh and only sent for the
// cookie purpose — a companion that knows nothing about challenges must not be
// sent one on an ordinary token request.
test('the background mints a fresh challenge, and only for cookies', () => {
    assert.match(background, /function randomEndpointChallenge\(\)/);
    // The whole function, not a mention of the API somewhere inside it: the
    // guard clause names getRandomValues too, so matching the file left a
    // constant return in the body passing.
    const minter = background.slice(
        background.indexOf('function randomEndpointChallenge() {'),
        background.indexOf('\n}', background.indexOf('function randomEndpointChallenge() {')));
    assert.match(minter, /globalThis\.crypto\.getRandomValues\(bytes\)/,
        'the challenge has to come from the CSPRNG');
    assert.match(minter, /new Uint8Array\(16\)/, 'and be 16 bytes, matching the 32-hex pattern');
    assert.ok(!/repeat\(/.test(minter) && !/return '[a-z0-9]{4,}'/.test(minter),
        'a constant is not a challenge');
    assert.match(background, /const endpointChallenge = msg\.purpose === COOKIE_HANDOFF_PURPOSE\s*\n\s*\? randomEndpointChallenge\(\)\s*\n\s*: '';/);
    assert.match(background, /port\.postMessage\(endpointChallenge\s*\n\s*\? \{ type: 'get-token', challenge: endpointChallenge \}\s*\n\s*: \{ type: 'get-token' \}\);/,
        'an ordinary token request keeps the old message shape');
});

// WHEN the native host answers with something malformed, the extension SHALL
// treat it as no answer rather than passing it on.
test('a malformed native answer is dropped rather than forwarded', () => {
    const start = background.indexOf('const proofPattern = COOKIE_HANDOFF?.ENDPOINT_PROOF?.proofPattern;');
    assert.ok(start > -1, 'the native response must be validated');
    const block = background.slice(start, start + 700);
    assert.match(block, /proofPattern\?\.test\(response\.challengeProof\)/);
    assert.match(block, /endpointChallenge: endpointProof \? endpointChallenge : ''/,
        'without a usable answer the challenge is not passed on either, so the '
        + 'client refuses before it asks the endpoint anything');
});

// The contract's own shape, so a companion implementer has something fixed to
// build against.
test('the contract pins what the two sides exchange', () => {
    assert.equal(contract.ENDPOINT_PROOF.path, '/identity');
    assert.equal(contract.ENDPOINT_PROOF.header, 'X-MDL-Endpoint-Challenge');
    assert.ok(contract.MINIMUM_ENDPOINT_PROOF_API > contract.MINIMUM_COMPANION_API,
        'answering the challenge is a newer capability than the cookie handoff itself');
    assert.equal(contract.ENDPOINT_PROOF.challengePattern.test(CHALLENGE), true);
    assert.equal(contract.ENDPOINT_PROOF.proofPattern.test(PROOF), true);
});
