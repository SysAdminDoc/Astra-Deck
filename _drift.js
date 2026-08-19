// Temporary: report lines present in the ytkit.js inline copy but absent from
// the feature module (and vice versa). Deleted after use.
const fs = require('fs');
const acorn = require('acorn');

const FACTORY = process.argv[2];
const MODULE = process.argv[3];
const src = fs.readFileSync('extension/ytkit.js', 'utf8');
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
        && node.right.type === 'ObjectExpression' && calleeName(node.left) === FACTORY) target = node.right;
    for (const key of Object.keys(node)) {
        const v = node[key];
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v);
    }
}
walk(ast);

const norm = (text) => new Set(text.split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && l !== '}' && l !== '},' && l !== '{'));

const copy = norm(src.slice(target.start, target.end));
const mod = norm(fs.readFileSync(MODULE, 'utf8'));

const onlyInCopy = [...copy].filter((l) => !mod.has(l));
console.log(`lines only in the ytkit.js copy: ${onlyInCopy.length}`);
for (const line of onlyInCopy) console.log('  COPY> ' + line.slice(0, 160));
