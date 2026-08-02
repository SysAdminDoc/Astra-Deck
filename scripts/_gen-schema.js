#!/usr/bin/env node
'use strict';

// Compatibility entry point for older contributor checklists. The settings
// schema is canonical and hand-maintained in extension/core/settings-schema.js;
// it must never be regenerated from roadmap prose. Delegate to the enforced
// parity check so this historical command remains safe and useful without
// writing or weakening the canonical schema.

const path = require('path');
const { spawnSync } = require('child_process');

const check = spawnSync(
    process.execPath,
    [path.join(__dirname, 'check-settings.js')],
    { stdio: 'inherit' }
);

if (check.error) {
    console.error('[schema-check] Could not run check-settings.js:', check.error.message);
    process.exit(1);
}

process.exit(check.status === null ? 1 : check.status);
