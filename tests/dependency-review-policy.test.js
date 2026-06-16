'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const validateWorkflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'validate.yml'),
    'utf8'
);

function dependencyReviewJobSource() {
    const match = validateWorkflow.match(/\n  dependency-review:[\s\S]*?\n\n  [a-z][a-z0-9_-]+:/);
    assert.ok(match, 'dependency-review job must stay present in validate.yml');
    return match[0];
}

test('Dependency review is PR-only and enforced (no continue-on-error)', () => {
    const job = dependencyReviewJobSource();
    assert.match(job, /if:\s*github\.event_name == 'pull_request'/,
        'dependency review should remain PR-only');
    assert.doesNotMatch(job, /continue-on-error/,
        'dependency review must not use continue-on-error — failures must block the PR');
    assert.match(job, /contents:\s*read/);
    assert.match(job, /pull-requests:\s*read/);
});

test('Dependency review keeps the pinned action and moderate vulnerability floor', () => {
    const job = dependencyReviewJobSource();
    assert.match(job,
        /actions\/dependency-review-action@[0-9a-f]{40}\s+#\s+v5\.0\.0/,
        'dependency review action must stay pinned to the resolved v5.0.0 release commit');
    assert.match(job, /fail-on-severity:\s*moderate/,
        'dependency review should keep the moderate vulnerability floor when enforcement is enabled');
    assert.match(job, /vulnerability-check:\s*true/);
    assert.match(job, /license-check:\s*false/);
});
