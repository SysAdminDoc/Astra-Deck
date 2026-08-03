#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const defaultRoot = path.join(repoRoot, 'astra_downloader');
const requestedRoot = process.argv.indexOf('--root') >= 0
    ? process.argv[process.argv.indexOf('--root') + 1]
    : defaultRoot;

if (!requestedRoot || requestedRoot.startsWith('--')) {
    console.error('[check-python-catch-reasons] --root requires a directory');
    process.exit(2);
}

const checkSource = String.raw`
import ast
import re
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
if not root.is_dir():
    print(f"[check-python-catch-reasons] root does not exist: {root}", file=sys.stderr)
    raise SystemExit(2)

reason_pattern = re.compile(r"#\s*reason\s*:\s*\S+", re.IGNORECASE)
violations = []
for path in sorted(root.rglob("*.py")):
    source = path.read_text(encoding="utf-8")
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as error:
        print(f"[check-python-catch-reasons] syntax error in {path}: {error}", file=sys.stderr)
        raise SystemExit(2)
    lines = source.splitlines()
    for handler in ast.walk(tree):
        if not isinstance(handler, ast.ExceptHandler):
            continue
        if not handler.body or not all(isinstance(statement, ast.Pass) for statement in handler.body):
            continue
        end_line = handler.end_lineno or handler.lineno
        snippet = "\n".join(lines[handler.lineno - 1:end_line])
        if not reason_pattern.search(snippet):
            violations.append(f"{path.relative_to(root.parent).as_posix()}:{handler.lineno}")

if violations:
    print("[check-python-catch-reasons] Missing '# reason:' on pass-only exception handlers:")
    for violation in violations:
        print(f"  - {violation}")
    raise SystemExit(1)

count = sum(
    1
    for path in root.rglob("*.py")
    for handler in ast.walk(ast.parse(path.read_text(encoding="utf-8"), filename=str(path)))
    if isinstance(handler, ast.ExceptHandler)
    and handler.body
    and all(isinstance(statement, ast.Pass) for statement in handler.body)
)
print(f"[check-python-catch-reasons] OK — {count} pass-only exception handler(s) carry a reason")
`;

const candidates = process.platform === 'win32'
    ? [
        { command: 'py', prefix: ['-3.12'] },
        { command: 'python', prefix: [] },
        { command: 'python3', prefix: [] },
    ]
    : [
        { command: process.env.ASTRA_PYTHON || 'python3', prefix: [] },
        { command: 'python', prefix: [] },
    ];

let unavailable = true;
for (const candidate of candidates) {
    const result = spawnSync(
        candidate.command,
        [...candidate.prefix, '-c', checkSource, path.resolve(repoRoot, requestedRoot)],
        { cwd: repoRoot, encoding: 'utf8' },
    );
    if (result.error && result.error.code === 'ENOENT') continue;
    unavailable = false;
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status === null ? 2 : result.status);
}

if (unavailable) {
    console.error('[check-python-catch-reasons] no usable Python interpreter was found');
    process.exit(2);
}
