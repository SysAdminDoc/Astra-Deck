'use strict';

// User-facing surfaces used to append `error.message` or a bare HTTP status to
// their own label. The reader could not act on it, the appended half was
// always English whatever locale they ran, and on the AI credential paths a
// provider response body could land on screen. core/failure-copy.js maps the
// throw onto a closed set of localized causes that each name a next action.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'extension', 'core', 'failure-copy.js'), 'utf8');
const enMessages = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'extension', '_locales', 'en', 'messages.json'), 'utf8')
);

function loadCore(navigatorStub) {
    const context = { globalThis: null };
    context.globalThis = context;
    if (navigatorStub) context.navigator = navigatorStub;
    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'extension/core/failure-copy.js' });
    return context.globalThis.YTKitCore;
}

const core = loadCore();
const translate = (key, fallback) => (enMessages[key] ? enMessages[key].message : fallback);

test('every cause in the closed set has an EN locale entry that names a next action', () => {
    assert.ok(core.FAILURE_CAUSE_CODES.length >= 10, 'the cause set must cover the real failure modes');
    for (const code of core.FAILURE_CAUSE_CODES) {
        const entry = core.FAILURE_CAUSES[code];
        assert.ok(entry && entry.key && entry.fallback, `${code} must carry a key and a fallback`);
        const message = enMessages[entry.key];
        assert.ok(message && message.message, `extension/_locales/en/messages.json must declare ${entry.key}`);
        // "The request was cancelled." is the one cause with nothing to do
        // next; everything else has to tell the reader what to try.
        if (code !== 'cancelled') {
            assert.match(message.message, /\.\s+\S/, `${entry.key} must state a next action after the cause`);
        }
    }
});

test('an HTTP status maps to a cause instead of reaching the reader', () => {
    assert.equal(core.classifyFailureCause({ status: 404 }), 'notFound');
    assert.equal(core.classifyFailureCause({ status: 401 }), 'auth');
    assert.equal(core.classifyFailureCause({ status: 403 }), 'auth');
    assert.equal(core.classifyFailureCause({ status: 429 }), 'rateLimit');
    assert.equal(core.classifyFailureCause({ status: 503 }), 'server');
    assert.equal(core.classifyFailureCause({ response: { status: 500 } }), 'server');
    assert.equal(core.classifyFailureCause(new Error('YouTube returned HTTP 502')), 'server');
});

test('DOM error names classify without prose matching', () => {
    const abort = new Error('The operation was aborted.');
    abort.name = 'AbortError';
    assert.equal(core.classifyFailureCause(abort), 'cancelled');

    const quota = new Error('anything');
    quota.name = 'QuotaExceededError';
    assert.equal(core.classifyFailureCause(quota), 'storage');

    const unsupported = new Error('anything');
    unsupported.name = 'NotSupportedError';
    assert.equal(core.classifyFailureCause(unsupported), 'unsupported');
});

test('the filter-list classifier codes map straight onto causes', () => {
    for (const [code, expected] of [
        ['too-large', 'tooLarge'],
        ['bad-format', 'badData'],
        ['integrity-error', 'badData'],
        ['unreachable', 'network'],
        ['http-error', 'server']
    ]) {
        assert.equal(core.classifyFailureCause({ code }), expected, `${code} must map to ${expected}`);
    }
});

test('an explicit code wins over a status, which wins over the name, which wins over prose', () => {
    const layered = new Error('failed to fetch');
    layered.name = 'QuotaExceededError';
    layered.status = 404;
    layered.code = 'too-large';
    assert.equal(core.classifyFailureCause(layered), 'tooLarge');
    delete layered.code;
    assert.equal(core.classifyFailureCause(layered), 'notFound');
    delete layered.status;
    assert.equal(core.classifyFailureCause(layered), 'storage');
    layered.name = 'Error';
    assert.equal(core.classifyFailureCause(layered), 'network');
});

test('an offline device is named as offline rather than as an unreachable service', () => {
    const offlineCore = loadCore({ onLine: false });
    assert.equal(offlineCore.classifyFailureCause(new Error('Failed to fetch')), 'offline');
    assert.equal(offlineCore.classifyFailureCause(new Error('something odd')), 'offline');
    const onlineCore = loadCore({ onLine: true });
    assert.equal(onlineCore.classifyFailureCause(new Error('Failed to fetch')), 'network');
    assert.equal(onlineCore.classifyFailureCause(new Error('something odd')), 'unknown');
});

test('the described copy never carries the thrown text', () => {
    const leaky = new Error('{"error":{"message":"sk-live-abcdef rejected by provider"}}');
    leaky.status = 401;
    const copy = core.describeFailure(leaky, translate);
    assert.equal(copy, enMessages.failureCauseAuth.message);
    assert.ok(!copy.includes('sk-live'), 'the provider body must not reach the UI');

    const labelled = core.describeFailureWithLabel('Credential could not be saved.', leaky, translate);
    assert.equal(labelled, `Credential could not be saved: ${enMessages.failureCauseAuth.message}`);
    assert.ok(!labelled.includes('sk-live'));
});

test('the diagnostic text keeps what the UI drops', () => {
    const error = new Error('Failed to fetch https://example.test/list.json');
    error.status = 503;
    const detail = core.failureDiagnosticText(error);
    assert.match(detail, /^server http=503 /);
    assert.match(detail, /example\.test/);
});

test('describeFailure works without a translator and falls back to the EN copy', () => {
    assert.equal(core.describeFailure({ status: 404 }), core.FAILURE_CAUSES.notFound.fallback);
});

test('popup.js routes every failure surface through the shared copy helper', () => {
    const popup = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8');
    assert.match(popup, /function failureText\(context, error, labelKey, labelFallback\)/,
        'popup.js must keep the single conversion helper');
    const { scanFile } = require('../scripts/check-raw-error-copy.js');
    assert.deepEqual(scanFile('extension/popup.js'), [],
        'no popup surface may concatenate raw failure text');
});
