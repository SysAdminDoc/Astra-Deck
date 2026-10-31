'use strict';

// The tab's feature list follows the build, not the popup's profile. It read a
// lookup no isolated module defines, so store-safe and download-free builds
// showed and ran every GitHub-full feature. Going by the profile instead would
// take AI Summary, Custom CSS and the rest from anyone on the default.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadDeclarations } = require('./helpers/monolith');

const schema = require(path.join(__dirname, '..', 'extension', 'core', 'settings-schema.js'));
const { createPolicyProfile } = require(path.join(__dirname, '..', 'extension', 'core', 'policy-profile.js'));

const githubFullKeys = schema.SETTINGS_SCHEMA
    .filter((entry) => entry.profile === 'github-full')
    .map((entry) => entry.key);
const downloadKeys = schema.SETTINGS_SCHEMA
    .filter((entry) => entry.category === 'downloads' || entry.scope === 'downloads')
    .map((entry) => entry.key);

function policyFor(buildProfile) {
    return createPolicyProfile({
        buildProfile,
        schema: schema.SETTINGS_SCHEMA,
        findSettingEntry: schema.findSettingEntry
    });
}

function tabFilter(YTKitCore) {
    return loadDeclarations(
        ['getFeatureSettingKey', 'artifactPolicy', 'isFeatureAllowedByArtifact'],
        YTKitCore ? { YTKitCore } : {}
    ).isFeatureAllowedByArtifact;
}

test('the schema still has GitHub-full and download keys to filter', () => {
    assert.ok(githubFullKeys.includes('customCssInjection'));
    assert.ok(githubFullKeys.includes('aiVideoSummary'));
    assert.ok(downloadKeys.length > 0);
});

test('a store-safe build leaves out exactly the GitHub-full keys', () => {
    const policy = policyFor('store-safe');
    for (const entry of schema.SETTINGS_SCHEMA) {
        assert.equal(policy.isKeyInArtifact(entry.key), entry.internal || entry.profile !== 'github-full', entry.key);
    }
});

test('a download-free build also leaves out the download keys', () => {
    const policy = policyFor('chromium-store');
    for (const key of [...githubFullKeys, ...downloadKeys]) {
        assert.equal(policy.isKeyInArtifact(key), false, key);
    }
    assert.equal(policy.isKeyInArtifact('hideRelatedVideos'), true);
});

test('every other build offers every key', () => {
    for (const buildProfile of ['github-full', 'development', undefined]) {
        const policy = policyFor(buildProfile);
        for (const entry of schema.SETTINGS_SCHEMA) {
            assert.equal(policy.isKeyInArtifact(entry.key), true, `${buildProfile}: ${entry.key}`);
        }
    }
});

test('a key the schema does not know stays on every build', () => {
    for (const buildProfile of ['store-safe', 'chromium-store', 'github-full']) {
        assert.equal(policyFor(buildProfile).isKeyInArtifact('featureWithNoSchemaEntry'), true, buildProfile);
    }
});

test('the tab filter drops GitHub-full features on a store-safe build', () => {
    const allowed = tabFilter({ createPolicyProfile: () => policyFor('store-safe') });
    assert.equal(allowed({ id: 'customCssInjection' }), false);
    assert.equal(allowed({ id: 'aiVideoSummary' }), false);
    assert.equal(allowed({ id: 'hideRelatedVideos' }), true);
    assert.equal(allowed({ id: 'anything', settingKey: 'customCssInjection' }), false, 'the setting key wins over the id');
});

test('the tab filter keeps GitHub-full features on a full build at the default profile', () => {
    const allowed = tabFilter({ createPolicyProfile: () => policyFor('github-full') });
    for (const key of githubFullKeys) {
        assert.equal(allowed({ id: key }), true, key);
    }
});

test('the tab filter builds one policy for the whole list', () => {
    let built = 0;
    const allowed = tabFilter({
        createPolicyProfile: () => {
            built += 1;
            return policyFor('store-safe');
        }
    });
    for (const key of githubFullKeys) allowed({ id: key });
    assert.equal(built, 1);
});

test('the tab filter fails open with no policy module or a broken one', () => {
    assert.equal(tabFilter(null)({ id: 'customCssInjection' }), true);
    const broken = tabFilter({
        createPolicyProfile: () => {
            throw new Error('malformed manifest');
        }
    });
    assert.equal(broken({ id: 'customCssInjection' }), true);
});
