'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Fixture folders this test process made. They are removed when it exits,
// so a failed assertion leaves nothing behind in the temp folder either.
const created = new Set();
process.on('exit', () => {
    for (const dir of created) fs.rmSync(dir, { recursive: true, force: true });
});

function makeTempDir(prefix) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    created.add(dir);
    return dir;
}

module.exports = { makeTempDir };
