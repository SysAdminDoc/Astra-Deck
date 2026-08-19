'use strict';

// `npm run smoke:a11y` died on a CDP timeout roughly one run in three, and a
// red run had become something you assumed was flake — which is exactly how a
// real accessibility failure gets waved through.
//
// Two causes, both in DevtoolsClient:
//
//  * The deadline was a flat 15s per call, armed at send time. The settings
//    surface issues around 850 calls per state across eight states; when the
//    renderer was busy an individual call could exceed 15s while the connection
//    was plainly alive and answering everything else. The window is now an IDLE
//    window: a call fails only if nothing at all comes back over the socket.
//  * The timeout timer was never cleared on success, so a run accumulated
//    thousands of live timers.
//
// And the failure named only the CDP method, so it could not say which of six
// surfaces and eight states was in flight.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const repoRoot = path.join(__dirname, '..');
const { DevtoolsClient } = require('../scripts/smoke-settings-overlay.js');
const a11ySmoke = fs.readFileSync(path.join(repoRoot, 'scripts', 'smoke-headless-a11y.js'), 'utf8');
const overlaySmoke = fs.readFileSync(path.join(repoRoot, 'scripts', 'smoke-settings-overlay.js'), 'utf8');

function fakeSocket() {
    const ws = new EventEmitter();
    ws.sent = [];
    ws.send = (raw) => { ws.sent.push(JSON.parse(raw)); };
    ws.reply = (id, result = {}) => ws.emit('message', JSON.stringify({ id, result }));
    ws.noise = () => ws.emit('message', JSON.stringify({ method: 'Page.frameNavigated', params: {} }));
    return ws;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('answered calls settle and leave no timers behind', async () => {
    const ws = fakeSocket();
    const client = new DevtoolsClient(ws, { callTimeoutMs: 20000 });
    const before = process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;

    // Volume matters here. One leaked timer hides under any sane threshold —
    // the real shape is the keyboard sweep, which issues hundreds of calls per
    // state and left a live 15s timer for every one of them.
    const CALLS = 300;
    const inflight = [];
    for (let i = 0; i < CALLS; i += 1) inflight.push(client.send('Runtime.evaluate', { expression: `${i}` }));
    for (const message of ws.sent) ws.reply(message.id, { result: { value: 1 } });
    await Promise.all(inflight);

    assert.equal(client.pending.size, 0, 'every pending entry must be dropped');
    const after = process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;
    assert.ok(after - before < CALLS / 10,
        `${after - before} timers still armed after ${CALLS} answered calls`);
});

test('a slow call survives as long as the socket is answering', async () => {
    // The whole fix. Under the old fixed deadline this rejected at 200ms even
    // though the target was demonstrably alive the entire time.
    const ws = fakeSocket();
    const client = new DevtoolsClient(ws, { callTimeoutMs: 200 });
    let settled = null;
    const inflight = client.send('Runtime.evaluate').then(
        () => { settled = 'resolved'; },
        (error) => { settled = error; }
    );

    for (let i = 0; i < 8; i += 1) {
        await sleep(80);
        ws.noise();
    }
    assert.equal(settled, null,
        'a call must not fail while the connection is plainly alive');

    ws.reply(ws.sent[0].id);
    await inflight;
    assert.equal(settled, 'resolved');
});

test('a genuinely silent socket still fails the call', async () => {
    const ws = fakeSocket();
    const client = new DevtoolsClient(ws, { callTimeoutMs: 150 });
    await assert.rejects(
        client.send('Emulation.setDeviceMetricsOverride'),
        /devtools call timed out: Emulation\.setDeviceMetricsOverride/
    );
    assert.equal(client.pending.size, 0, 'a timed-out call must not stay pending');
});

test('the timeout says which surface and state it died in', async () => {
    const ws = fakeSocket();
    const client = new DevtoolsClient(ws, { callTimeoutMs: 120 });
    client.context = 'settings/dark/reflow-320 keyboard sweep';
    await assert.rejects(client.send('Runtime.evaluate'), (error) => {
        assert.match(error.message, /during settings\/dark\/reflow-320 keyboard sweep/,
            'the surface and state must be named');
        assert.match(error.message, /no message from the target for \d+s/,
            'the report must distinguish a silent target from a slow one');
        assert.match(error.message, /other call\(s\) still in flight/);
        return true;
    });
});

test('every audit lane stamps the client before it starts', () => {
    for (const [lane, pattern] of [
        ['keyboard sweep', /client\.context = `\$\{surface\.name\}\/\$\{stateName\} keyboard sweep`/],
        ['state setup', /client\.context = `\$\{surface\.name\}\/\$\{theme\}\/\$\{mode\} state setup`/],
        ['focus trap', /client\.context = `\$\{surface\.name\}\/\$\{stateName\} focus trap`/],
        ['feature health', /client\.context = `\$\{surface\.name\}\/\$\{stateName\} feature health`/]
    ]) {
        assert.match(a11ySmoke, pattern, `the ${lane} lane must stamp the client`);
    }
});

test('the idle window is documented as a window, not a per-call budget', () => {
    assert.match(overlaySmoke, /const DEFAULT_CDP_IDLE_TIMEOUT_MS = (\d+);/);
    const value = Number(overlaySmoke.match(/const DEFAULT_CDP_IDLE_TIMEOUT_MS = (\d+);/)[1]);
    assert.ok(value >= 15000, 'the window must not be tighter than the deadline it replaced');
    assert.match(overlaySmoke, /Idle-based, not a fixed per-call deadline/,
        'the reason has to survive, or the next reader tightens it back');
    assert.match(overlaySmoke, /clearTimeout\(timer\);/,
        'the settle path must clear the timer');
});

test('no fixed 15s deadline remains in the client', () => {
    const at = overlaySmoke.indexOf('class DevtoolsClient');
    const body = overlaySmoke.slice(at, overlaySmoke.indexOf('\n}', at));
    assert.doesNotMatch(body, /}, 15000\);/,
        'the flat per-call deadline is what made this lane flaky');
});
