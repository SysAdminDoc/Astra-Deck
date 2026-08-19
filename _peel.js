// Temporary: inspect or replace an inline feature fallback located by AST.
// Deleted after use.
const fs = require('fs');
const acorn = require('acorn');

const FILE = 'extension/ytkit.js';
const FACTORY = process.argv[2];
const STUB_FILE = process.argv[3];

const src = fs.readFileSync(FILE, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', ranges: true });

function calleeName(node) {
    let n = node;
    if (n.type === 'ChainExpression') n = n.expression;
    if (n.type !== 'CallExpression') return null;
    let c = n.callee;
    if (c.type === 'ChainExpression') c = c.expression;
    return c.type === 'MemberExpression' && c.property ? c.property.name : null;
}

let target = null;
function walk(node) {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'LogicalExpression' && node.operator === '||'
        && node.right.type === 'ObjectExpression' && calleeName(node.left) === FACTORY) {
        if (target) throw new Error('more than one fallback matched ' + FACTORY);
        target = node.right;
    }
    for (const key of Object.keys(node)) {
        const v = node[key];
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v);
    }
}
walk(ast);
if (!target) throw new Error(FACTORY + ' fallback not found');

if (!STUB_FILE) {
    console.log('=== line', src.slice(0, target.start).split('\n').length,
        '-', (target.end - target.start).toLocaleString(), 'bytes ===');
    console.log('properties:', target.properties.map((p) => (p.key && (p.key.name || p.key.value)) || '?').join(', '));
    console.log('--- head ---');
    console.log(src.slice(target.start, target.start + 1100));
    process.exit(0);
}

const stub = fs.readFileSync(STUB_FILE, 'utf8').replace(/\s+$/, '');
const before = src.length;
const out = src.slice(0, target.start) + stub + src.slice(target.end);
acorn.parse(out, { ecmaVersion: 'latest', sourceType: 'script' });
fs.writeFileSync(FILE, out, 'utf8');
console.log('removed', (target.end - target.start).toLocaleString(), 'bytes');
console.log('ytkit.js:', before.toLocaleString(), '->', out.length.toLocaleString());
console.log('result parses clean');
