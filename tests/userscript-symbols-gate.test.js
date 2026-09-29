'use strict';

// check-userscript-symbols.js is the gate on the seam between the extension's
// code and userscript/host.js. These tests make sure it passes on the real
// tree, fails on a reference the adapter can't answer, and keeps its guarded
// list honest.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { GUARDED, surfaceOf } = require('../scripts/check-userscript-symbols');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-userscript-symbols.js');

function runGate(inject) {
    const env = { ...process.env };
    delete env.ASTRA_USERSCRIPT_SYMBOLS_INJECT;
    if (inject) env.ASTRA_USERSCRIPT_SYMBOLS_INJECT = inject;
    return spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env });
}

test('every extension API the shipped code uses resolves on the userscript adapter', () => {
    const result = runGate();
    assert.equal(result.status, 0, result.stderr);
    const match = result.stdout.match(/OK: (\d+) extension API reference\(s\)/);
    assert.ok(match, result.stdout);
    // A scan that found almost nothing would pass for the wrong reason.
    assert.ok(Number(match[1]) >= 20, `only ${match[1]} references were checked`);
});

test('a reference the adapter lacks fails the gate and names the member and world', () => {
    const result = runGate('background:tabs.madeUpForTheGate,content:runtime.alsoMadeUp');
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /background: tabs\.madeUpForTheGate is not on the userscript adapter \(used in \(injected\)\)/);
    assert.match(result.stderr, /content: runtime\.alsoMadeUp is not on the userscript adapter/);
});

test('every guarded absence carries the reason its call sites cope', () => {
    for (const [world, members] of Object.entries(GUARDED)) {
        assert.ok(['content', 'background'].includes(world), world);
        for (const [member, reason] of Object.entries(members)) {
            assert.match(member, /^[a-z]+\.[A-Za-z]+$/, `${world}: ${member}`);
            assert.ok(typeof reason === 'string' && reason.length > 20, `${world}: ${member} needs a reason`);
        }
    }
});

test('surfaceOf reads namespaces and storage areas off an adapter object', () => {
    const surface = surfaceOf({
        runtime: { sendMessage() {}, id: 'x' },
        storage: { local: { get() {}, set() {} }, onChanged: { addListener() {} } },
        notAnObject: 3,
    });
    assert.ok(surface.members.has('runtime.sendMessage'));
    assert.ok(surface.members.has('storage.local'));
    assert.ok(surface.members.has('storage.onChanged'));
    assert.equal(surface.members.has('notAnObject.valueOf'), false);
    assert.deepEqual([...surface.areas.local].sort(), ['get', 'set']);
    assert.equal(surface.areas.sync, undefined);
});
