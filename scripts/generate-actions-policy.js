#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const WORKFLOW_DIR = path.join(REPO_ROOT, '.github', 'workflows');
const GITHUB_OWNED_ACTION_OWNERS = new Set(['actions', 'github']);
const FULL_SHA_RE = /^[0-9a-f]{40}$/;
const VERSION_COMMENT_RE = /^v[0-9]+(?:\.[0-9]+)*/;

function workflowFiles(workflowDir = WORKFLOW_DIR) {
    return fs.readdirSync(workflowDir)
        .filter((file) => /\.ya?ml$/i.test(file))
        .sort()
        .map((file) => path.join(workflowDir, file));
}

function repoRelative(filePath) {
    return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
}

function isGitHubOwnedActionOwner(owner) {
    return GITHUB_OWNED_ACTION_OWNERS.has(String(owner || '').toLowerCase());
}

function parseUsesLine(line, filePath, lineNumber) {
    const match = String(line).match(/^\s*(?:-\s*)?uses:\s*([^#\s]+)(?:\s+#\s*(.*))?$/);
    if (!match) return null;
    const spec = match[1].trim();
    const comment = (match[2] || '').trim();
    if (spec.startsWith('./') || spec.startsWith('../')) {
        return {
            file: repoRelative(filePath),
            line: lineNumber,
            local: true,
            spec
        };
    }

    const atIndex = spec.lastIndexOf('@');
    if (atIndex <= 0 || atIndex === spec.length - 1) {
        throw new Error(`${repoRelative(filePath)}:${lineNumber} uses external action without @ref: ${spec}`);
    }
    const action = spec.slice(0, atIndex);
    const ref = spec.slice(atIndex + 1);
    const owner = action.split('/')[0] || '';
    if (!owner || !action.includes('/')) {
        throw new Error(`${repoRelative(filePath)}:${lineNumber} has unsupported action spec: ${spec}`);
    }
    return {
        action,
        comment,
        file: repoRelative(filePath),
        githubOwned: isGitHubOwnedActionOwner(owner),
        line: lineNumber,
        local: false,
        owner,
        ref,
        spec
    };
}

function collectWorkflowActions(workflowDir = WORKFLOW_DIR) {
    const entries = [];
    for (const filePath of workflowFiles(workflowDir)) {
        const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
        lines.forEach((line, index) => {
            const entry = parseUsesLine(line, filePath, index + 1);
            if (entry) entries.push(entry);
        });
    }
    return entries;
}

function uniqueSorted(values) {
    return Array.from(new Set(values)).sort();
}

function validateActionInventory(entries) {
    const errors = [];
    for (const entry of entries) {
        if (entry.local) continue;
        if (!FULL_SHA_RE.test(entry.ref)) {
            errors.push(`${entry.file}:${entry.line} must pin ${entry.action} to a full 40-character SHA`);
        }
        if (!VERSION_COMMENT_RE.test(entry.comment)) {
            errors.push(`${entry.file}:${entry.line} must keep a same-line version comment for ${entry.action}`);
        }
    }
    if (errors.length) {
        throw new Error(`Workflow action policy inventory is not ready:\n${errors.join('\n')}`);
    }
}

function buildActionsPolicy(workflowDir = WORKFLOW_DIR) {
    const entries = collectWorkflowActions(workflowDir);
    validateActionInventory(entries);
    const external = entries.filter((entry) => !entry.local);
    const githubOwnedActions = uniqueSorted(external
        .filter((entry) => entry.githubOwned)
        .map((entry) => `${entry.action}@${entry.ref}`));
    const nonGitHubOwnedActions = uniqueSorted(external
        .filter((entry) => !entry.githubOwned)
        .map((entry) => `${entry.action}@${entry.ref}`));

    return {
        permissions: {
            enabled: true,
            allowed_actions: 'selected',
            sha_pinning_required: true
        },
        selected_actions: {
            github_owned_allowed: true,
            verified_allowed: false,
            patterns_allowed: nonGitHubOwnedActions
        },
        inventory: {
            workflow_count: workflowFiles(workflowDir).length,
            external_action_count: external.length,
            github_owned_actions: githubOwnedActions,
            non_github_owned_actions: nonGitHubOwnedActions
        }
    };
}

function main() {
    const policy = buildActionsPolicy();
    console.log(JSON.stringify(policy, null, 2));
}

if (require.main === module) {
    try {
        main();
    } catch (err) {
        console.error('[generate-actions-policy]', err.message || err);
        process.exit(1);
    }
}

module.exports = {
    buildActionsPolicy,
    collectWorkflowActions,
    isGitHubOwnedActionOwner,
    parseUsesLine,
    validateActionInventory,
};
