'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createDownloadUIFeature,
    AUTO_START_RETRY_BUDGET,
} = require('../../extension/features/download-ui');

class FakeNode {
    constructor(tagName = 'div') {
        this.tagName = String(tagName).toUpperCase();
        this.children = [];
        this.parentNode = null;
        this.dataset = {};
        this.attributes = new Map();
        this.className = '';
        this.id = '';
        this.textContent = '';
        this.isConnected = true;
        this.listeners = new Map();
        this.classList = {
            add: (...names) => {
                const values = new Set(this.className.split(/\s+/).filter(Boolean));
                names.forEach((name) => values.add(name));
                this.className = Array.from(values).join(' ');
            },
            remove: (...names) => {
                const blocked = new Set(names);
                this.className = this.className.split(/\s+/).filter((name) => name && !blocked.has(name)).join(' ');
            },
            contains: (name) => this.className.split(/\s+/).includes(name),
        };
    }

    appendChild(child) {
        if (!child) return child;
        child.parentNode = this;
        child.isConnected = true;
        this.children.push(child);
        return child;
    }

    append(...children) {
        children.flat().forEach((child) => this.appendChild(child));
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
        if (name === 'id') this.id = String(value);
    }

    getAttribute(name) {
        return this.attributes.get(name) ?? null;
    }

    addEventListener(type, listener) {
        const handlers = this.listeners.get(type) || [];
        handlers.push(listener);
        this.listeners.set(type, handlers);
    }

    dispatchEvent(event) {
        for (const listener of this.listeners.get(event.type) || []) listener(event);
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
        const selectors = String(selector).split(',').map((value) => value.trim()).filter(Boolean);
        const matches = (node, query) => {
            if (query.startsWith('#')) return node.id === query.slice(1);
            if (query.startsWith('.')) return node.classList.contains(query.slice(1));
            return node.tagName.toLowerCase() === query.toLowerCase();
        };
        const found = [];
        const visit = (node) => {
            if (selectors.some((query) => matches(node, query))) found.push(node);
            node.children.forEach(visit);
        };
        this.children.forEach(visit);
        return found;
    }

    remove() {
        this.isConnected = false;
        if (this.parentNode) {
            this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
            this.parentNode = null;
        }
    }
}

class FakeDocument {
    constructor() {
        this.body = new FakeNode('body');
        this.head = new FakeNode('head');
    }

    createElement(tagName) {
        return new FakeNode(tagName);
    }

    getElementById(id) {
        return this.body.querySelector(`#${id}`) || this.head.querySelector(`#${id}`);
    }
}

test('download manager probes the cached port first, then the canonical fallback order', async () => {
    const calls = [];
    const feature = createDownloadUIFeature({
        requestNativeDownloaderToken: async () => ({ token: 'native-token' }),
        extensionFetchJson: async ({ url }) => {
            const port = Number(new URL(url).port);
            calls.push(port);
            if (port === 9791) {
                return {
                    data: {
                        service: 'astra-downloader',
                        token_required: true,
                        port,
                        version: '2.0.0',
                        downloads: 0,
                    },
                };
            }
            throw new Error('ECONNREFUSED');
        },
    });
    feature.MediaDLManager._port = 9781;

    const result = await feature.MediaDLManager.check(true);

    assert.deepEqual(calls, [9781, 9751, 9761, 9771, 9791]);
    assert.equal(result.ok, true);
    assert.equal(result.port, 9791);
    assert.equal(feature.MediaDLManager.baseUrl(), 'http://127.0.0.1:9791');
});

test('foreign downloader detection names the shadowing service in repair copy', async () => {
    const previousDocument = globalThis.document;
    globalThis.document = new FakeDocument();

    try {
        const feature = createDownloadUIFeature({
            extensionFetchJson: async ({ url }) => {
                if (url.includes(':9751/')) {
                    return { data: { status: 'ok', token: 'legacy-token', version: '4.1.0' } };
                }
                throw new Error('ECONNREFUSED');
            },
        });

        const result = await feature.MediaDLManager.check(true);
        assert.equal(result.ok, false);
        assert.deepEqual(result.foreignServer, { port: 9751, version: '4.1.0' });

        feature.MediaDLManager.showInstallPrompt('retry');
        const prompt = document.body.querySelector('#ytkit-mediadl-install-prompt');
        const description = prompt.querySelector('#ytkit-install-prompt-desc');
        assert.equal(prompt.dataset.mode, 'repair');
        assert.equal(prompt.dataset.state, 'error');
        assert.match(description.textContent, /port 9751/);
        assert.match(description.textContent, /version 4\.1\.0/);
        assert.match(description.textContent, /Startup apps/);
        assert.match(description.textContent, /start Astra Downloader/);
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});

test('auto-start honors the full cold-start retry budget', async () => {
    const protocolCalls = [];
    const retryDelays = [];
    const feature = createDownloadUIFeature({
        openProtocol: (uri) => protocolCalls.push(uri),
        showToast: () => {},
    });
    let checkCalls = 0;
    feature.MediaDLManager.check = async () => {
        checkCalls += 1;
        return checkCalls === AUTO_START_RETRY_BUDGET + 1
            ? { ok: true, token: 'native-token', port: 9751 }
            : { ok: false };
    };

    const previousSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (callback, delay) => {
        retryDelays.push(delay);
        callback();
        return 1;
    };
    try {
        const result = await feature.MediaDLManager.tryAutoStart(AUTO_START_RETRY_BUDGET);
        assert.equal(result.ok, true);
    } finally {
        globalThis.setTimeout = previousSetTimeout;
    }

    assert.deepEqual(protocolCalls, ['mediadl://start']);
    assert.equal(checkCalls, AUTO_START_RETRY_BUDGET + 1);
    assert.deepEqual(retryDelays, Array(AUTO_START_RETRY_BUDGET).fill(1500));
});

test('every documented downloader error code keeps its recovery branch and copy', () => {
    const feature = createDownloadUIFeature();
    const expected = new Map([
        ['po-token-required', /PO token/i],
        ['po-provider-stale', /provider/i],
        ['sabr-limited', /SABR/i],
        ['deno-runtime-missing', /Deno/i],
        ['deno-runtime-unsupported', /Deno|update/i],
        ['js-runtime-missing', /JavaScript runtime/i],
        ['js-runtime-unverified', /verified|repair/i],
        ['js-runtime-unsupported', /update|upgrade/i],
        ['ejs-runtime-not-ready', /readiness|repair/i],
        ['sign-in-required', /signed-in|Sign in/i],
        ['ffmpeg-missing-or-stale', /ffmpeg/i],
        ['network-unreachable', /network/i],
        // Names the fix rather than the mechanism: "verify the native host
        // registration" was accurate and useless to the reader who hit it.
        ['native-channel-required', /private token.*Download setup/is],
    ]);

    for (const [code, pattern] of expected) {
        const failure = feature.classifyDownloaderFailureResponse({ error_code: code });
        assert.equal(failure.code, code);
        assert.match(`${failure.message} ${failure.advice}`, pattern);
        assert.equal(typeof failure.nextAction, 'string');
        assert.ok(failure.nextAction.length > 0);
        assert.match(failure.tone, /^#/);
        assert.ok(failure.duration > 0);
    }
});
