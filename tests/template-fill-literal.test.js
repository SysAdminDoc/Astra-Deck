'use strict';

// `template.replace('{title}', title)` reads `$&`, `$$`, `` $` `` and `$'` in
// the replacement string, so a YouTube title like "Top $$ tips" came out as
// "Top $ tips", and "$&" repeated the placeholder. A function replacement
// inserts the value as written. This fails on any placeholder that carries
// outside text (a title, channel, comment, search query, handle...) filled
// with a plain string.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const repoRoot = path.join(__dirname, '..');

// Placeholders whose value comes from YouTube, a third-party service or the
// user's own typing.
const OUTSIDE_TEXT = /^\{(title|channel|author|handle|query|name|text|comment|subreddit|playlist|video|creator|term|keyword|file|filename)\}$/;

function walk(node, visit) {
    if (!node || typeof node.type !== 'string') return;
    visit(node);
    for (const key of Object.keys(node)) {
        if (key === 'loc') continue;
        const value = node[key];
        if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
        else if (value && typeof value.type === 'string') walk(value, visit);
    }
}

function literalFills(source) {
    const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, locations: true });
    const found = [];
    walk(ast, (node) => {
        if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') return;
        if (node.callee.property?.name !== 'replace' && node.callee.property?.name !== 'replaceAll') return;
        const [pattern, replacement] = node.arguments;
        if (pattern?.type !== 'Literal' || typeof pattern.value !== 'string' || !OUTSIDE_TEXT.test(pattern.value)) return;
        if (!replacement || /Function/.test(replacement.type)) return;
        found.push({ line: node.loc.start.line, placeholder: pattern.value });
    });
    return found;
}

function shippedScripts() {
    const files = ['extension/ytkit.js', 'extension/popup.js', 'extension/sidepanel.js', 'extension/background.js', 'YTKit.user.js'];
    for (const dir of fs.readdirSync(path.join(repoRoot, 'extension/features'))) {
        const file = `extension/features/${dir}/index.js`;
        if (fs.existsSync(path.join(repoRoot, file))) files.push(file);
    }
    for (const name of fs.readdirSync(path.join(repoRoot, 'extension/core'))) {
        if (name.endsWith('.js')) files.push(`extension/core/${name}`);
    }
    return files;
}

test('outside text is filled into templates with a function replacement', () => {
    const problems = [];
    for (const rel of shippedScripts()) {
        for (const hit of literalFills(fs.readFileSync(path.join(repoRoot, rel), 'utf8'))) {
            problems.push(`${rel}:${hit.line} ${hit.placeholder}`);
        }
    }
    assert.deepEqual(problems, [], 'use .replace(placeholder, () => value) so "$&" and "$$" in the value survive');
});

test('the scanner catches a string fill and allows a function fill', () => {
    const hits = literalFills([
        "a.replace('{title}', title);",
        "a.replace('{title}', () => title);",
        "a.replace('{count}', String(n));"
    ].join('\n'));
    assert.deepEqual(hits.map((hit) => hit.line), [1]);
    assert.equal('Save {title}'.replace('{title}', 'Top $$ tips'), 'Save Top $ tips',
        'the failure this guards against');
});
