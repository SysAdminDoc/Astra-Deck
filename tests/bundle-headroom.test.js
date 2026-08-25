'use strict';

// Greasy Fork caps each script record at 2 MiB, and the core library spent this
// release sitting against that cap: relighting one theme lane consumed the last
// 3.2 KB, and the only lever left was deleting the comments that explained why
// each surface needed relighting. The generator strips whole-line comments from
// bundled module bodies now, which reclaimed about 193 KB.
//
// This pins a floor so the next feature that fills the bundle fails loudly here
// rather than by making someone shave prose off a code comment.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sync = require('../sync-userscript.js');

const repoRoot = path.join(__dirname, '..');
const MAX_CODE_BYTES = 2 * 1024 * 1024;
const MIN_CORE_HEADROOM = 50 * 1024;

test('the core library keeps real headroom under the host cap', () => {
    const bytes = fs.statSync(path.join(repoRoot, 'YTKit-core.user.js')).size;
    const headroom = MAX_CODE_BYTES - bytes;
    assert.ok(headroom > 0,
        `YTKit-core.user.js is ${bytes} B, over the ${MAX_CODE_BYTES} B host cap`);
    assert.ok(headroom >= MIN_CORE_HEADROOM,
        `only ${headroom} B of core headroom left, below the ${MIN_CORE_HEADROOM} B floor. `
        + 'Reclaim space in sync-userscript.js rather than trimming source comments.');
});

test('bundled module bodies carry no whole-line comments', () => {
    const core = fs.readFileSync(path.join(repoRoot, 'YTKit-core.user.js'), 'utf8');
    // The generator's own module markers are the one exception: they are added
    // after stripping and the drift checker slices the library by them.
    const commentLines = core.split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('//'))
        .filter((line) => !/^\/\/m:[0-9a-z]+$/.test(line))
        .filter((line) => !line.startsWith('// =='))
        .filter((line) => !line.startsWith('// @'))
        .filter((line) => !line.includes('bundled core modules'));
    assert.ok(commentLines.length < 40,
        `${commentLines.length} whole-line comments survived into the bundle; `
        + `first: ${JSON.stringify(commentLines.slice(0, 3))}`);
});

test('stripping never touches a line inside a template literal', () => {
    const backtick = String.fromCharCode(96);
    const sample = [
        'const a = 1;',
        '// removed',
        'const t = ' + backtick + 'first line',
        '// kept: this is template DATA',
        'last line' + backtick + ';',
        '// removed too'
    ].join('\n');
    const stripped = sync.stripSafeLineComments(sample);
    assert.ok(!stripped.includes('// removed'), 'a top-level comment must go');
    assert.ok(!stripped.includes('// removed too'),
        'and so must one after the template closes');
    assert.ok(stripped.includes('// kept: this is template DATA'),
        'a comment-looking line inside a template is data and must stay');
});

test('stripping leaves quoted and block-commented regions alone', () => {
    const sample = [
        "const s = 'a string with // inside it';",
        '/* a block comment',
        '// that contains a line comment',
        '*/',
        '// a real one',
        'const b = 2;'
    ].join('\n');
    const stripped = sync.stripSafeLineComments(sample);
    assert.ok(stripped.includes("'a string with // inside it'"),
        'a // inside a string is not a comment');
    assert.ok(stripped.includes('// that contains a line comment'),
        'a // inside a block comment belongs to that block');
    assert.ok(!stripped.includes('// a real one'), 'a genuine top-level comment goes');
});

test('a module that would not re-parse keeps its comments', () => {
    // The scanner does not model regex literals, so the generator re-parses
    // every stripped module and reverts on failure. A mangled module can only
    // fail to shrink; it can never reach the bundle.
    const source = fs.readFileSync(path.join(repoRoot, 'sync-userscript.js'), 'utf8');
    assert.match(source, /function shrinkModuleBody\(body, relativePath\)/,
        'the guard must still wrap the stripper');
    assert.match(source, /new Function\(stripped\)/,
        'the guard must re-parse the stripped body');
    assert.match(source, /return body;/,
        'and hand back the original when it does not parse');

    // Exercise it: a body the stripper would break must come back untouched.
    const broken = 'const x = 1; function (';
    assert.equal(sync.shrinkModuleBody(broken, 'test/fixture.js'), broken,
        'an unparseable body must be returned unchanged');
});
