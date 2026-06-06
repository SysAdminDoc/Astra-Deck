'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const pkg = require('../package.json');
const {
    buildActionsPolicy,
    collectWorkflowActions,
    isGitHubOwnedActionOwner,
    parseUsesLine,
} = require('../scripts/generate-actions-policy.js');

const SETUP_FIREFOX_REF = 'browser-actions/setup-firefox@0bc507ddf224827e3b1af68e014d5e42ab93e795';

test('actions policy payload generator is exposed and emits selected-actions settings', () => {
    assert.equal(pkg.scripts['policy:actions'], 'node scripts/generate-actions-policy.js');

    const policy = buildActionsPolicy();
    assert.deepEqual(policy.permissions, {
        enabled: true,
        allowed_actions: 'selected',
        sha_pinning_required: true,
    });
    assert.deepEqual(policy.selected_actions, {
        github_owned_allowed: true,
        verified_allowed: false,
        patterns_allowed: [SETUP_FIREFOX_REF],
    });
    assert.ok(policy.inventory.external_action_count >= 18,
        'expected to inventory every workflow action reference');
    assert.ok(policy.inventory.github_owned_actions.some((entry) =>
        entry.startsWith('actions/checkout@')), 'GitHub-owned actions must stay inventoried');
    assert.deepEqual(policy.inventory.non_github_owned_actions, [SETUP_FIREFOX_REF]);
});

test('actions policy inventory parses workflow uses lines without broad owner trust', () => {
    const parsed = parseUsesLine(
        '      - uses: browser-actions/setup-firefox@0bc507ddf224827e3b1af68e014d5e42ab93e795 # v1.7.2',
        path.join(repoRoot, '.github', 'workflows', 'build.yml'),
        45
    );
    assert.equal(parsed.action, 'browser-actions/setup-firefox');
    assert.equal(parsed.githubOwned, false);
    assert.equal(parsed.comment, 'v1.7.2');
    assert.equal(isGitHubOwnedActionOwner('actions'), true);
    assert.equal(isGitHubOwnedActionOwner('github'), true);
    assert.equal(isGitHubOwnedActionOwner('browser-actions'), false);
});

test('actions policy inventory rejects mutable refs and missing version comments', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-actions-policy-'));
    try {
        fs.writeFileSync(path.join(tmp, 'bad.yml'), [
            'name: bad',
            'jobs:',
            '  test:',
            '    runs-on: ubuntu-latest',
            '    steps:',
            '      - uses: actions/checkout@v6',
            '      - uses: browser-actions/setup-firefox@0bc507ddf224827e3b1af68e014d5e42ab93e795',
            ''
        ].join('\n'), 'utf8');
        assert.throws(() => buildActionsPolicy(tmp), /full 40-character SHA/);
        assert.throws(() => buildActionsPolicy(tmp), /same-line version comment/);
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test('actions policy inventory sees only tracked workflow YAML files', () => {
    const entries = collectWorkflowActions(path.join(repoRoot, '.github', 'workflows'));
    assert.ok(entries.length >= 18);
    assert.equal(entries.some((entry) => entry.file.includes('node_modules')), false);
    assert.equal(entries.filter((entry) => !entry.local && !entry.githubOwned).length, 1);
});
