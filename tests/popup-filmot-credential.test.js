'use strict';

// The Filmot key box in the toolbar popup. popup.js is not a module, so these
// run its real credential functions against stub controls, the way
// popup-fixes.test.js does.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const popupSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8');

function sliceCredentialFunctions() {
    const start = popupSource.indexOf('async function refreshAiCredentialManager()');
    const end = popupSource.indexOf('async function deleteAiCredential()');
    assert.ok(start > -1 && end > start, 'popup.js must keep the refresh and save functions together');
    return popupSource.slice(start, end);
}

function setup({
    settings = { filmotTitleRestore: true },
    effective = 'store-safe',
    filmotHosts = ['https://apiv1.filmot.com/*'],
    send = async () => ({ ok: true, providers: {} }),
    request = async () => true,
    provider = 'filmot',
    credential = 'a-key'
} = {}) {
    const options = ['openai', 'anthropic', 'gemini', 'filmot'].map((value) => ({ value, hidden: false, disabled: false }));
    const controls = {
        section: { hidden: true },
        provider: { value: provider, options, dataset: {} },
        input: { value: credential, setCustomValidity() {}, reportValidity() {} },
        remember: { checked: false },
        status: { textContent: '' }
    };
    const calls = { sent: [], requested: [], statuses: [], order: [], logged: [] };
    const make = new Function(
        'aiCredentialSection', 'aiCredentialProvider', 'aiCredentialInput', 'aiCredentialRemember', 'aiCredentialStatus', 'aiCredentialDelete',
        'popupState', 'ensurePolicyProfile', 'getFilmotHostOrigins', 'requestOptionalHostOrigins', 'sendRuntimeMessage',
        'showStatus', 'setAiCredentialBusy', 'renderAiCredentialStatus', 'failureText', 'logFailure', 't', 'aiCredentialProviders',
        `${sliceCredentialFunctions()}\nreturn { refreshAiCredentialManager, saveAiCredential };`
    );
    const api = make(
        controls.section, controls.provider, controls.input, controls.remember, controls.status, { disabled: false },
        { settings },
        () => ({ resolveEffectiveProfile: () => effective }),
        () => filmotHosts,
        (origins) => {
            calls.order.push('request');
            calls.requested.push(origins);
            return request(origins);
        },
        (message) => {
            calls.order.push(message.type);
            calls.sent.push(message);
            return send(message);
        },
        (text, kind) => { calls.statuses.push({ text, kind }); },
        () => {},
        () => {},
        (_area, _error, _key, fallback) => fallback,
        (context, error) => { calls.logged.push({ context, message: error.message }); },
        (_key, fallback) => fallback,
        Object.create(null)
    );
    return { ...api, controls, calls };
}

const enabledProviders = (controls) => controls.provider.options.filter((option) => !option.disabled).map((option) => option.value);

test('a default-profile popup offers only the Filmot key while the feature is on', async () => {
    const { refreshAiCredentialManager, controls } = setup({ provider: 'openai' });
    await refreshAiCredentialManager();
    assert.equal(controls.section.hidden, false);
    assert.deepEqual(enabledProviders(controls), ['filmot']);
    assert.equal(controls.provider.value, 'filmot', 'a hidden provider must not stay selected');
    for (const option of controls.provider.options) {
        assert.equal(option.hidden, option.value !== 'filmot', `${option.value} visibility`);
    }
});

test('the key box stays hidden with the feature off', async () => {
    const { refreshAiCredentialManager, controls, calls } = setup({ settings: { filmotTitleRestore: false } });
    await refreshAiCredentialManager();
    assert.equal(controls.section.hidden, true);
    assert.deepEqual(calls.sent, [], 'a hidden box has no status to fetch');
});

test('a store build, which has no Filmot host, keeps the key box hidden', async () => {
    const { refreshAiCredentialManager, controls } = setup({ filmotHosts: [] });
    await refreshAiCredentialManager();
    assert.equal(controls.section.hidden, true);
});

test('the full profile still offers every provider, with or without the feature', async () => {
    for (const settings of [{ filmotTitleRestore: true }, { filmotTitleRestore: false }]) {
        const { refreshAiCredentialManager, controls } = setup({ settings, effective: 'github-full', provider: 'openai' });
        await refreshAiCredentialManager();
        assert.equal(controls.section.hidden, false);
        assert.deepEqual(enabledProviders(controls), ['openai', 'anthropic', 'gemini', 'filmot']);
        assert.equal(controls.provider.value, 'openai', 'the full profile keeps the user\'s choice');
    }
});

test('saving a Filmot key asks for its host inside the click, before the key is sent', async () => {
    const { saveAiCredential, calls, controls } = setup();
    await saveAiCredential();
    assert.deepEqual(calls.requested, [['https://apiv1.filmot.com/*']]);
    assert.deepEqual(calls.order.slice(0, 2), ['request', 'YTKIT_AI_CREDENTIAL_SET']);
    assert.equal(calls.sent[0].provider, 'filmot');
    assert.equal(calls.sent[0].credential, 'a-key');
    assert.equal(controls.input.value, '');
    assert.equal(calls.statuses[0].kind, 'success');
});

test('a popup closed over the prompt has already sent the key', async () => {
    // Firefox can close the popup while its prompt is up, so this answer never comes.
    const { saveAiCredential, calls } = setup({ request: () => new Promise(() => {}) });
    saveAiCredential();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.sent[0]?.type, 'YTKIT_AI_CREDENTIAL_SET');
    assert.equal(calls.sent[0]?.credential, 'a-key');
});

test('refusing the host keeps the key and says why it can\'t be used yet', async () => {
    const { saveAiCredential, calls, controls } = setup({
        request: async () => { throw new Error('raw browser text'); }
    });
    await saveAiCredential();
    assert.equal(calls.sent[0].credential, 'a-key');
    assert.equal(controls.input.value, '', 'the key is saved, so the box empties');
    assert.deepEqual(calls.statuses.map((status) => status.kind), ['error']);
    assert.match(calls.statuses[0].text, /Key saved.*allow Astra Deck to reach Filmot/);
    assert.doesNotMatch(calls.statuses[0].text, /raw browser text/, 'the cause goes to the log, not the screen');
    assert.deepEqual(calls.logged, [{ context: 'ai-credential-host', message: 'raw browser text' }]);
});

test('an AI key asks for no Filmot host', async () => {
    const { saveAiCredential, calls } = setup({ provider: 'openai', effective: 'github-full' });
    await saveAiCredential();
    assert.deepEqual(calls.requested, []);
    assert.equal(calls.sent[0].provider, 'openai');
    assert.equal(calls.statuses[0].kind, 'success');
});

test('a key the vault refused stays in the box to try again', async () => {
    const { saveAiCredential, calls, controls } = setup({
        send: async () => ({ ok: false, error: { message: 'no' } })
    });
    await saveAiCredential();
    assert.equal(controls.input.value, 'a-key');
    assert.deepEqual(calls.statuses.map((status) => status.kind), ['error']);
});
