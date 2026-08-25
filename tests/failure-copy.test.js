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
const os = require('node:os');
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

test('every converted file routes its failure surfaces through the shared copy', () => {
    const popup = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8');
    assert.match(popup, /function failureText\(context, error, labelKey, labelFallback\)/,
        'popup.js must keep the single conversion helper');
    const { scanFile, CONVERTED_FILES } = require('../scripts/check-raw-error-copy.js');
    assert.ok(CONVERTED_FILES.length >= 6, 'the converted list only grows');
    for (const file of CONVERTED_FILES) {
        assert.deepEqual(scanFile(file), [], `no ${file} surface may concatenate raw failure text`);
    }
});

test('the gate sees raw text bound to a local before it reaches the sink', () => {
    const { scanFile } = require('../scripts/check-raw-error-copy.js');
    // Outside the repo on purpose: a transient file under extension/ is visible
    // to the directory-walking tests, which run in parallel under `node --test`.
    const fixture = path.join(os.tmpdir(), `astra-raw-error-copy-${process.pid}.js`);
    fs.writeFileSync(fixture, [
        'function render(error) {',
        "    const message = 'Import failed: ' + error.message;",
        '    showToast(message);',
        '}',
        'function allowed(error) {',
        '    // raw-error-copy: reviewed, this is our own localized copy',
        "    const message = error.message || 'fallback';",
        '    showToast(message);',
        '}',
        ''
    ].join('\n'), 'utf8');
    try {
        const violations = scanFile(fixture);
        assert.equal(violations.length, 1, 'the tainted local must be reported once');
        assert.equal(violations[0].line, 3);
    } finally {
        fs.unlinkSync(fixture);
    }
});

test('an error-shaped field on an ordinary receiver is raw text too', () => {
    const { scanFile } = require('../scripts/check-raw-error-copy.js');
    // `registry.setHealth` stores `String(error.message)` under `lastError`, so
    // the receiver-shaped rule never sees it. A feature card that put that in a
    // tooltip shipped the raw exception to a reader, and to a screen reader.
    const fixture = path.join(os.tmpdir(), `astra-raw-error-field-${process.pid}.js`);
    fs.writeFileSync(fixture, [
        'function render(health) {',
        '    badge.title = health.lastError;',
        '}',
        'function alsoRaw(service) {',
        "    pill.setAttribute('aria-label', service.lastErrorMessage);",
        '}',
        'function sanitized(health) {',
        '    badge.title = describeFailureCause(health.lastError);',
        '}',
        'function sanitizedThroughLocal(health) {',
        '    const cause = describeFailureCause(health.lastError);',
        '    badge.title = cause;',
        '}',
        ''
    ].join('\n'), 'utf8');
    try {
        const violations = scanFile(fixture);
        assert.deepEqual(violations.map((entry) => entry.line), [2, 5],
            'only the two unsanitized field reads may be reported');
    } finally {
        fs.unlinkSync(fixture);
    }
});

test('stripping a sanitizer call does not swallow text outside it', () => {
    const { stripSanitizedCalls } = require('../scripts/check-raw-error-copy.js');
    assert.equal(stripSanitizedCalls('a = describeFailureCause(e.message) + e.stack;'),
        'a =  + e.stack;', 'text after the call must survive so the gate still sees it');
    assert.equal(stripSanitizedCalls('a = describeFailureCause(wrap(e.message));'),
        'a = ;', 'a nested call inside the arguments must be consumed with them');
    assert.equal(stripSanitizedCalls('a = describeFailureCause(e.message'),
        'a = ', 'an argument list cut off by the expression window must not leak');
});

test('the external API error classes map onto a localized cause', () => {
    const core = loadCore();
    // The health pill holds a class, not a throw. Prose matching on the raw
    // message left `server-error` and `invalid-payload` as "unknown".
    assert.equal(core.classifyFailureCause({ code: 'server-error' }), 'server');
    assert.equal(core.classifyFailureCause({ code: 'rate-limited' }), 'rateLimit');
    assert.equal(core.classifyFailureCause({ code: 'network-error' }), 'network');
    assert.equal(core.classifyFailureCause({ code: 'invalid-payload' }), 'badData');
    assert.equal(core.classifyFailureCause({ code: 'client-error' }), 'badData');
    assert.equal(core.classifyFailureCause({ code: 'no-data' }), 'notFound');
    assert.equal(core.classifyFailureCause({ code: 'permission-denied' }), 'permission');
    assert.equal(core.classifyFailureCause({ code: 'unknown-error' }), 'unknown');
});
