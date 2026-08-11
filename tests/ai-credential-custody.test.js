'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const ytkit = read('extension/ytkit.js');
const background = read('extension/background.js');
const popup = read('extension/popup.js');
const popupHtml = read('extension/popup.html');
const schema = read('extension/core/settings-schema.js');
const defaults = JSON.parse(read('extension/default-settings.json'));
const userscript = read('YTKit-core.user.js') + '\n' + read('YTKit.user.js');

test('ordinary settings and imports cannot carry an AI credential', () => {
    assert.equal(Object.hasOwn(defaults, 'aiSummaryApiKey'), false);
    assert.doesNotMatch(schema, /key:\s*["']aiSummaryApiKey["']/);
    assert.match(ytkit, /RETIRED_SETTING_KEYS[\s\S]*?'aiSummaryApiKey'/);
    assert.match(ytkit, /8:\s*\(s\)\s*=>\s*\{[\s\S]*?delete s\.aiSummaryApiKey/);
    assert.match(popup, /8\(settings\)[\s\S]*?delete settings\.aiSummaryApiKey/);
});

test('extension content sends only provider request data to the worker broker', () => {
    const callStart = ytkit.indexOf('async _callLLM(prompt)');
    const callEnd = ytkit.indexOf('async _run()', callStart);
    const block = ytkit.slice(callStart, callEnd);
    assert.match(block, /type:\s*'YTKIT_AI_SUMMARY_REQUEST'/);
    assert.match(block, /provider,\s*\n\s*endpoint,\s*\n\s*payload,/);
    assert.doesNotMatch(block, /aiSummaryApiKey/);
    assert.doesNotMatch(block, /\?key=/);
    assert.match(background, /headers\[validated\.policy\.credentialHeader\]/);
    assert.match(background, /redirect:\s*credential\s*\?\s*'manual'/);
});

test('Gemini uses a header and provider endpoints reject credential query parameters', () => {
    assert.match(read('extension/core/credential-vault.js'), /credentialHeader:\s*'x-goog-api-key'/);
    assert.doesNotMatch(ytkit.slice(ytkit.indexOf('async _callLLM(prompt)'), ytkit.indexOf('async _run()', ytkit.indexOf('async _callLLM(prompt)'))), /encodeURIComponent\([^)]*credential/);
    assert.match(background, /AI provider response contained credential material and was blocked/);
});

test('popup credential controls are write-only and status-only', () => {
    assert.match(popupHtml, /id="ai-credential-input"[^>]*type="password"/);
    assert.doesNotMatch(popupHtml.match(/<input id="ai-credential-input"[\s\S]*?>/)?.[0] || '', /\svalue=/);
    assert.match(popup, /YTKIT_AI_CREDENTIAL_STATUS/);
    assert.match(popup, /YTKIT_AI_CREDENTIAL_SET/);
    assert.match(popup, /YTKIT_AI_CREDENTIAL_DELETE/);
    assert.match(popup, /aiCredentialInput\.value\s*=\s*''/);
    assert.doesNotMatch(background.slice(background.indexOf("if (msg.type === 'YTKIT_AI_CREDENTIAL_STATUS'"), background.indexOf("if (msg.type === 'YTKIT_AI_SUMMARY_REQUEST'")), /credential:\s*await/);
});

test('userscript credentials live in manager-isolated storage and never in request URLs', () => {
    assert.match(userscript, /@grant\s+GM_deleteValue/);
    assert.match(userscript, /ytkit:ai-credential:/);
    assert.match(userscript, /createUserscriptCredentialVault/);
    assert.match(userscript, /createUserscriptAiSummaryFeature/);
    assert.match(userscript, /id:\s*'aiVideoSummary'/);
    assert.match(userscript, /deleteValue\(key\)/);
    assert.match(userscript, /credentialHeader:\s*'x-goog-api-key'/);
    assert.doesNotMatch(userscript.slice(userscript.indexOf('async _callLLM(prompt)'), userscript.indexOf('async _run()', userscript.indexOf('async _callLLM(prompt)'))), /\?key=/);
});
