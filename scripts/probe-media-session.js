#!/usr/bin/env node
'use strict';

// Does a Web Audio graph on the <video> cost the user their media keys?
//
// Six audio features (mono-to-stereo, volume boost, normalization, auto-gain,
// high-pass, sync offset) route YouTube's <video> through createMediaElementSource
// in ytkit-main.js. Media Session is write-only to a page, so asking the page
// proves nothing. This asks each browser's own controller instead, on a local
// page that plays a tone with a media session, before the graph, with it
// attached, and after a toggle-off re-route (Astra never closes its context):
//
//   Chromium: chrome://media-internals, Audio Focus. The session the OS media
//             flyout and the hardware keys follow must stay Active and
//             Controllable.
//   Firefox:  MediaControlService (chrome context, through Marionette) sends a
//             play/pause key down the same path a hardware key takes. It must
//             reach the page's action handler every time. Headless Firefox has
//             no OS key source, and without media.mediacontrol.testingevents
//             its controller never follows the page at all, graph or no graph.
//
// Usage: node scripts/probe-media-session.js [--chromium <exe>] [--firefox <exe>]
// Chromium comes from --chromium, CHROMIUM_PATH or CHROME_PATH; Firefox from
// --firefox, FIREFOX_PATH or its usual install path. Exit 1 when a check fails.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const { startFirefoxSession } = require('./firefox-webdriver');
const { resolveFirefoxExecutable } = require('./smoke-firefox-webext');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toneWav(seconds = 30, rate = 8000) {
    const samples = seconds * rate;
    const buf = Buffer.alloc(44 + samples * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples * 2, 4); buf.write('WAVE', 8);
    buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
    buf.write('data', 36); buf.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++) buf.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 2);
    return buf;
}

const PAGE = `<!doctype html><meta charset="utf-8"><title>Astra media session probe</title>
<video id="v" src="tone.wav" loop style="display:block;width:320px;height:240px"></video>
<script>
const v = document.getElementById('v');
window.__log = [];
navigator.mediaSession.metadata = new MediaMetadata({ title: 'Astra probe', artist: 'Astra' });
for (const a of ['play', 'pause', 'seekbackward', 'seekforward']) navigator.mediaSession.setActionHandler(a, () => window.__log.push(a));
window.attachGraph = () => {
    window.__ctx = new AudioContext();
    window.__src = window.__ctx.createMediaElementSource(v);
    window.__gain = window.__ctx.createGain();
    window.__gain.gain.value = 1.5;
    window.__src.connect(window.__gain).connect(window.__ctx.destination);
    return window.__ctx.state;
};
// What turning the last audio feature off does in ytkit-main.js: the source
// and context stay, only the in-context nodes are re-routed.
window.rerouteGraph = () => { window.__gain.disconnect(); window.__src.disconnect(); window.__src.connect(window.__ctx.destination); return 'rerouted'; };
v.play().then(() => { window.__playing = true; }, (e) => { window.__playErr = String(e); });
</script>`;

function writeFixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-media-session-'));
    fs.writeFileSync(path.join(dir, 'tone.wav'), toneWav());
    fs.writeFileSync(path.join(dir, 'page.html'), PAGE);
    return { dir, url: 'file:///' + path.join(dir, 'page.html').replace(/\\/g, '/') };
}

function argValue(flag) {
    const at = process.argv.indexOf(flag);
    return at > 0 ? process.argv[at + 1] : '';
}

async function probeChromium(executable, fixture) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-media-session-chromium-'));
    const chrome = spawn(executable, [
        '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
        '--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files',
        '--no-first-run', '--no-default-browser-check', 'about:blank'
    ], { stdio: 'ignore', windowsHide: true });
    let ws = null;
    try {
        let port = '';
        for (let i = 0; i < 150 && !port; i++) {
            await sleep(100);
            try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch (_) { /* reason: not written yet */ }
        }
        if (!port) throw new Error('Chromium never wrote DevToolsActivePort');
        const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
        ws = new WebSocket(version.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
        let nextId = 0;
        const pending = new Map();
        ws.on('message', (raw) => {
            const msg = JSON.parse(raw);
            if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
        });
        const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
            const id = ++nextId;
            pending.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
            ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
        const open = async (url) => {
            const { targetId } = await send('Target.createTarget', { url });
            const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
            return sessionId;
        };
        const evaluate = async (sessionId, expression) => {
            const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
            if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
            return res.result.value;
        };
        const page = await open(fixture.url);
        for (let i = 0; i < 75; i++) {
            await sleep(200);
            const s = await evaluate(page, '({ playing: !!window.__playing, err: window.__playErr || null })').catch(() => ({}));
            if (s.err) throw new Error(`playback refused: ${s.err}`);
            if (s.playing) break;
        }
        const internals = await open('chrome://media-internals/');
        await sleep(1500);
        const session = async () => {
            const text = await evaluate(internals, `new Promise((resolve) => {
                const tab = [...document.querySelectorAll('*')].find((el) => el.children.length === 0 && /^\\s*audio focus\\s*$/i.test(el.textContent || ''));
                if (tab) tab.click();
                setTimeout(() => resolve(document.body.innerText), 1200);
            })`);
            const lines = text.split('\n');
            const at = lines.findIndex((line) => line.includes('page.html'));
            const line = at >= 0 ? (lines[at + 1] || '') : '';
            return { line: line.replace(/ (GroupId|Identity)=\S+/g, '').trim(), ok: /\bActive\b/.test(line) && /\bControllable\b/.test(line) };
        };
        const steps = [];
        steps.push({ step: 'before graph', ...(await session()) });
        await evaluate(page, 'window.attachGraph()');
        await sleep(1500);
        steps.push({ step: 'graph attached', ...(await session()) });
        await evaluate(page, 'window.rerouteGraph()');
        await sleep(1500);
        steps.push({ step: 'graph re-routed', ...(await session()) });
        return { browser: version.Browser, steps };
    } finally {
        ws?.close();
        chrome.kill();
        await sleep(500);
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { /* reason: Chromium can hold the profile a moment longer */ }
    }
}

async function probeFirefox(executable, fixture) {
    const session = await startFirefoxSession({
        firefox: executable,
        systemAccess: true,
        prefs: {
            'media.autoplay.default': 0,
            'media.autoplay.blocking_policy': 0,
            'media.hardwaremediakeys.enabled': true,
            'media.mediacontrol.testingevents.enabled': true
        }
    });
    const call = async (method, endpoint, body) => {
        const res = await fetch(`${session.baseUrl}${endpoint}`, {
            method,
            headers: { 'content-type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const json = await res.json();
        if (json?.value?.error) throw new Error(`${endpoint}: ${json.value.error}: ${json.value.message}`);
        return json.value;
    };
    const exec = (script) => call('POST', '/execute/sync', { script, args: [] });
    try {
        await call('POST', '/url', { url: fixture.url });
        // Firefox's controller only follows media a person started, so press
        // the video once, as a viewer would have.
        const video = await call('POST', '/element', { using: 'css selector', value: '#v' });
        await call('POST', `/element/${Object.values(video)[0]}/click`, {});
        await exec("document.getElementById('v').play();");
        await sleep(2000);
        const press = async (step) => {
            await call('POST', '/moz/context', { context: 'chrome' });
            const service = await exec(`return {
                title: MediaControlService.getCurrentActiveMediaMetadata().title,
                state: MediaControlService.getCurrentMediaSessionPlaybackState(),
                sent: (MediaControlService.generateMediaControlKey('playpause'), true)
            };`);
            await call('POST', '/moz/context', { context: 'content' });
            await sleep(800);
            const log = await exec('const log = window.__log.slice(); window.__log.length = 0; return log;');
            return { step, ...service, handled: log, ok: service.title === 'Astra probe' && log.length > 0 };
        };
        const steps = [];
        steps.push(await press('before graph'));
        await exec('return window.attachGraph();');
        await sleep(1500);
        steps.push(await press('graph attached'));
        await exec('return window.rerouteGraph();');
        await sleep(1500);
        steps.push(await press('graph re-routed'));
        return { browser: `Firefox ${session.browserVersion}`, steps };
    } finally {
        await session.close();
    }
}

async function main() {
    const fixture = writeFixture();
    const report = { date: new Date().toISOString().slice(0, 10) };
    try {
        const chromium = argValue('--chromium') || process.env.CHROMIUM_PATH || process.env.CHROME_PATH;
        if (!chromium) throw new Error('Pass --chromium <exe> or set CHROMIUM_PATH.');
        report.chromium = await probeChromium(chromium, fixture);
        report.firefox = await probeFirefox(resolveFirefoxExecutable(argValue('--firefox')), fixture);
    } finally {
        try { fs.rmSync(fixture.dir, { recursive: true, force: true }); } catch (_) { /* reason: a browser can hold the tone a moment longer */ }
    }
    console.log(JSON.stringify(report, null, 2));
    const failed = [report.chromium, report.firefox].flatMap((b) => b.steps.filter((s) => !s.ok).map((s) => `${b.browser}: ${s.step}`));
    if (failed.length) {
        console.error(`media session lost: ${failed.join('; ')}`);
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main().catch((error) => { console.error(error); process.exitCode = 1; });
}
