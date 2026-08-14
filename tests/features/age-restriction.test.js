'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const source = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'extension', 'manifest.json'), 'utf8'));
const { runtimeModules } = require('../helpers/source');

function featureBlock(id, nextId) {
    const start = source.indexOf(`id: '${id}'`);
    const end = source.indexOf(`id: '${nextId}'`, start);
    assert.ok(start >= 0 && end > start, `${id} feature block must exist`);
    return source.slice(start, end);
}

test('ageRestrictionBypass consumes the classified player response and records degradation', () => {
    const block = featureBlock('ageRestrictionBypass', 'autoLikeSubscribed');
    assert.match(block, /classifyAgeRestriction\(playerResponse, videoId\)/);
    assert.match(block, /playability\.drifted/);
    assert.match(block, /setFeatureHealth\(this\.id,[\s\S]*?status: 'degraded'/);
    assert.match(block, /DiagnosticLog\.record\('age-restriction-bypass'/);
    assert.match(block, /Age bypass needs attention/);
});

test('ageRestrictionBypass validates the embed response and restores replaced player content', () => {
    const block = featureBlock('ageRestrictionBypass', 'autoLikeSubscribed');
    assert.match(block, /ytcfg\|ytInitialPlayerResponse\|playerResponse/);
    assert.match(block, /document\.createDocumentFragment\(\)/);
    assert.match(block, /this\._player\.replaceChildren\(this\._originalContent\)/);
    assert.match(block, /iframe\.title = 'Age-restricted YouTube video'/);
    assert.match(block, /destroy\(\)[\s\S]*?this\._restorePlayer\(\)/);
});

test('settings cards expose runtime degradation as an accessible warning badge', () => {
    const cardStart = source.indexOf('function buildFeatureCard(');
    const cardEnd = source.indexOf('function createToast(', cardStart);
    const cardBlock = source.slice(cardStart, cardEnd);
    assert.match(cardBlock, /getFeatureHealthSnapshot\(\)\.find/);
    assert.match(cardBlock, /card\.classList\.add\('ytkit-feature-card--degraded'\)/);
  assert.match(cardBlock, /healthBadge\.textContent = t\('settingsHealthNeedsAttention', 'Needs attention'\)/);
    assert.match(cardBlock, /healthBadge\.setAttribute\('aria-label'/);
});

test('playability classifier loads before the ytkit runtime only on normal pages', () => {
    const normal = manifest.content_scripts.find((entry) => runtimeModules(entry).includes('ytkit.js'));
    const chat = manifest.content_scripts.find((entry) => entry.js?.includes('live-chat.js'));
    const normalScripts = runtimeModules(normal);
    assert.notEqual(normalScripts.indexOf('core/video-type.js'), -1, 'anchor: video-type must be in the manifest or the ordering is vacuous');
    assert.ok(normalScripts.indexOf('core/playability.js') > normalScripts.indexOf('core/video-type.js'));
    assert.ok(normalScripts.indexOf('core/playability.js') < normalScripts.indexOf('ytkit.js'));
    assert.equal(chat.js.includes('core/playability.js'), false,
        'scope-minimal live chat must not inherit normal-player canaries');
});
