'use strict';

// `npm run check` used to be one `&&` chain, so "is gate X wired into check?"
// was a substring test against that string. It is now a gate list in
// scripts/run-checks.js, which stops one red gate hiding the rest.
//
// The question every caller is really asking has not changed, so this renders
// the list back into the same shape: one command per gate, newline separated.
// Tests keep asserting what they always asserted, against the live list rather
// than a string that no longer exists.

const { GATES } = require('../../scripts/run-checks.js');

function gateCommand(gate) {
    if (gate.npm) return `npm run ${gate.npm}`;
    return ['node', `scripts/${gate.script}`, ...(gate.args || [])].join(' ');
}

function checkChainText() {
    return GATES.map(gateCommand).join('\n');
}

module.exports = { GATES, checkChainText, gateCommand };
