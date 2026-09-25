'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const repoRoot = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');
const manifest = JSON.parse(read('extension', 'manifest.json'));
const zeroAdRules = JSON.parse(read('extension', 'rules', 'zero-ads.json'));

function matchesMusic(pattern) {
    return pattern === 'https://*.youtube.com/*'
        || pattern === '*://*.youtube.com/*'
        || pattern === 'https://music.youtube.com/*'
        || pattern === '*://music.youtube.com/*';
}

test('every content-script group that can match YouTube Music explicitly excludes it', () => {
    const matchingGroups = manifest.content_scripts.filter((entry) =>
        (entry.matches || []).some(matchesMusic));

    assert.ok(matchingGroups.length > 0, 'the manifest must still declare desktop YouTube content scripts');
    for (const entry of matchingGroups) {
        assert.ok(
            (entry.exclude_matches || []).includes('https://music.youtube.com/*'),
            `missing YouTube Music exclusion for ${JSON.stringify(entry.js || entry.css || [])}`
        );
    }
});

test('web-accessible resources are not exposed to YouTube Music', () => {
    for (const resourceGroup of manifest.web_accessible_resources || []) {
        assert.equal(
            (resourceGroup.matches || []).some(matchesMusic),
            false,
            `resource group still covers YouTube Music: ${JSON.stringify(resourceGroup.resources || [])}`
        );
    }
});

test('the zero-ad rules leave YouTube Music network traffic untouched', () => {
    for (const rule of zeroAdRules) {
        if (!(rule.condition?.initiatorDomains || []).includes('youtube.com')) continue;
        assert.ok(
            (rule.condition.excludedInitiatorDomains || []).includes('music.youtube.com'),
            `rule ${rule.id} must exclude YouTube Music initiators`
        );
    }
});

test('extension messaging and fetch bridges refuse YouTube Music tabs and origins', () => {
    const background = read('extension', 'background.js');
    const popup = read('extension', 'popup.js');
    const sidepanel = read('extension', 'sidepanel.js');

    assert.match(background, /function isControlledYouTubeUrl\(/);
    assert.match(background, /function isYouTubeMusicUrl\(/);
    assert.match(background, /hostname === 'music\.youtube\.com'/);
    assert.match(background, /filter\(\(tab\) => tab\?\.id && isControlledYouTubeUrl\(tab\.url\)\)/);
    assert.match(background, /if \(isYouTubeMusicUrl\(url\)\) return false;/);
    assert.doesNotMatch(background, /'https:\/\/music\.youtube\.com'/);

    assert.match(popup, /function isControlledYouTubeUrl\(/);
    assert.match(popup, /hostname === 'music\.youtube\.com'/);
    assert.match(popup, /filter\(\(tab\) => isControlledYouTubeUrl\(tab\?\.url\)\)/);

    assert.match(sidepanel, /h === 'music\.youtube\.com'/);
});

test('userscript entry points carry an explicit YouTube Music exclusion', () => {
    for (const filename of ['YTKit.user.js', 'theater-split.user.js']) {
        assert.match(
            read(filename),
            /^\/\/ @exclude\s+https:\/\/music\.youtube\.com\/\*$/m,
            `${filename} must explicitly exclude YouTube Music`
        );
    }
});

test('the former compatibility feature is retired instead of left as a dead toggle', () => {
    const schema = require('../../extension/core/settings-schema');
    const defaults = JSON.parse(read('extension', 'default-settings.json'));
    const runtimeModules = manifest.content_scripts
        .flatMap((entry) => entry['x-ytkit-runtime-modules'] || []);

    assert.equal(schema.findSettingEntry('youtubeMusicCompat'), null);
    assert.equal(schema.isRetiredShippedId('youtubeMusicCompat'), true);
    assert.equal(Object.hasOwn(defaults, 'youtubeMusicCompat'), false);
    assert.equal(runtimeModules.includes('features/youtube-music-compat/index.js'), false);
    assert.equal(fs.existsSync(path.join(repoRoot, 'extension', 'features', 'youtube-music-compat', 'index.js')), false);
    assert.doesNotMatch(read('sync-userscript.js'), /youtube-music-compat/);
});
