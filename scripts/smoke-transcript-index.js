'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const REPO_ROOT = path.join(__dirname, '..');
const TIMEOUT_MS = 15000;

function browserCandidates() {
    return [
        process.env.CHROME_PATH,
        process.env.EDGE_PATH,
        process.platform === 'win32' ? path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
        process.platform === 'win32' ? path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe') : '',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ].filter(Boolean);
}

function findBrowser() {
    return browserCandidates().find((candidate) => fs.existsSync(candidate)) || null;
}

function timeout(promise, label, ms = TIMEOUT_MS) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), ms); })
    ]).finally(() => clearTimeout(timer));
}

function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
            });
        }).on('error', reject);
    });
}

class DevtoolsClient {
    constructor(socket) {
        this.socket = socket;
        this.nextId = 1;
        this.pending = new Map();
        socket.on('message', (raw) => {
            let message;
            try { message = JSON.parse(raw); } catch (_) { return; }
            if (!message.id || !this.pending.has(message.id)) return;
            const { resolve, reject } = this.pending.get(message.id);
            this.pending.delete(message.id);
            if (message.error) reject(new Error(message.error.message || 'DevTools command failed'));
            else resolve(message.result);
        });
    }

    send(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(expression) {
        const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Page evaluation failed');
        return result.result?.value;
    }
}

async function waitForPage(port, expectedOrigin) {
    const started = Date.now();
    while (Date.now() - started < TIMEOUT_MS) {
        const pages = await getJson(`http://127.0.0.1:${port}/json/list`).catch(() => []);
        const page = pages.find((target) => target.type === 'page'
            && target.webSocketDebuggerUrl
            && String(target.url || '').startsWith(expectedOrigin));
        if (page) return page;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Timed out waiting for the headless page target');
}

async function main() {
    const browserPath = findBrowser();
    if (!browserPath) throw new Error('No Chromium-family browser found; set CHROME_PATH or EDGE_PATH');

    const server = http.createServer((_request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end('<!doctype html><meta charset="utf-8"><title>Transcript index smoke</title>');
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-transcript-index-'));
    const browser = spawn(browserPath, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        origin
    ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

    let stderr = '';
    let socket;
    try {
        const devtoolsUrl = await timeout(new Promise((resolve, reject) => {
            browser.stderr.on('data', (chunk) => {
                stderr += chunk;
                const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
                if (match) resolve(match[1]);
            });
            browser.once('exit', (code) => reject(new Error(`Headless browser exited early (${code})`)));
        }), 'the DevTools endpoint');
        const page = await waitForPage(new URL(devtoolsUrl).port, origin);
        socket = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
        await timeout(new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); }), 'the DevTools socket');
        const client = new DevtoolsClient(socket);
        await client.send('Page.enable');
        await client.send('Runtime.enable');
        await client.send('Page.navigate', { url: origin });
        const navigationStarted = Date.now();
        while (await client.evaluate('location.origin') !== origin) {
            if (Date.now() - navigationStarted > TIMEOUT_MS) throw new Error('Headless fixture did not reach its loopback origin');
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        const sources = [
            fs.readFileSync(path.join(REPO_ROOT, 'extension', 'core', 'transcript-index.js'), 'utf8'),
            fs.readFileSync(path.join(REPO_ROOT, 'extension', 'core', 'persisted-domains.js'), 'utf8')
        ].join('\n');
        await client.evaluate(sources);
        const result = await client.evaluate(`(async () => {
            const helpers = globalThis.YTKitCore.transcriptIndex;
            const persisted = globalThis.YTKitCore.persistedDomains;
            const request = (req) => new Promise((resolve, reject) => {
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            await new Promise((resolve) => {
                const deletion = indexedDB.deleteDatabase(persisted.PAGE_DB.name);
                deletion.onsuccess = deletion.onerror = deletion.onblocked = resolve;
            });
            const record = helpers.prepareTranscriptRecord({
                videoId: 'abcdefghijk',
                title: 'Climate fixture',
                text: 'A climate policy transcript for local search.',
                indexedAt: 1
            });
            await persisted.replaceTranscriptRecords([record], { clearFirst: true });
            let db = await persisted.openPageDb();
            const store = db.transaction(persisted.PAGE_DB.records, 'readonly').objectStore(persisted.PAGE_DB.records);
            const indexes = [...store.indexNames];
            const keys = await request(store.index(persisted.PAGE_DB.termIndex).getAllKeys(IDBKeyRange.bound('climate', 'climate\\uffff')));
            db.close();
            await persisted.snapshotTranscriptRecords('smoke');
            await persisted.clearTranscriptRecords();
            await persisted.restoreTranscriptSnapshot('smoke');
            db = await persisted.openPageDb();
            const restored = await request(db.transaction(persisted.PAGE_DB.records, 'readonly').objectStore(persisted.PAGE_DB.records).get('abcdefghijk'));
            db.close();
            return {
                version: persisted.PAGE_DB.version,
                indexes,
                keyCount: keys.length,
                restoredTerms: restored.searchTerms,
                restoredText: restored.text
            };
        })()`);
        if (result.version !== 3) throw new Error(`Expected schema v3, got ${result.version}`);
        if (!result.indexes.includes('byTerm') || !result.indexes.includes('byIndexedAt')) throw new Error('Expected transcript indexes were not created');
        if (result.keyCount !== 1) throw new Error(`Term lookup returned ${result.keyCount} records`);
        if (!result.restoredTerms.includes('climate') || !result.restoredText.includes('climate policy')) throw new Error('Snapshot restore did not rebuild derived search data');
        console.log('[smoke-transcript-index] schema upgrade, term lookup, and snapshot restore passed');
    } finally {
        try { socket?.close(); } catch (_) { /* reason: socket may already be closed */ }
        const exited = browser.exitCode !== null
            ? Promise.resolve()
            : new Promise((resolve) => browser.once('exit', resolve));
        try { browser.kill(); } catch (_) { /* reason: process may already have exited */ }
        await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
        await new Promise((resolve) => server.close(resolve));
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 });
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error('[smoke-transcript-index]', error.message || error);
        process.exit(1);
    });
}

module.exports = { browserCandidates, findBrowser };
