const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const gate = path.join(repoRoot, 'scripts', 'check-python-catch-reasons.js');

test('Python catch-reason gate accepts the companion tree', () => {
    const output = execFileSync(process.execPath, [gate], {
        cwd: repoRoot,
        encoding: 'utf8',
    });
    assert.match(output, /pass-only exception handler\(s\) carry a reason/);
});

test('Python catch-reason gate rejects an unreasoned pass-only handler', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-python-catch-'));
    try {
        fs.writeFileSync(
            path.join(root, 'fixture.py'),
            'try:\n    raise OSError()\nexcept OSError:\n    pass\n',
            'utf8',
        );
        assert.throws(
            () => execFileSync(process.execPath, [gate, '--root', root], {
                cwd: repoRoot,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
            }),
            (error) => error.status === 1
                && /Missing '# reason:'/.test(`${error.stdout}${error.stderr}`)
                && /fixture\.py:3/.test(`${error.stdout}${error.stderr}`),
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
