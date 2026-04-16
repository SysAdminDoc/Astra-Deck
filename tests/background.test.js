'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const backgroundSource = fs.readFileSync(path.join(repoRoot, 'extension', 'background.js'), 'utf8');

function loadBackground({ fetchImpl, downloadsDownloadImpl } = {}) {
    let messageListener = null;
    const chrome = {
        commands: {
            onCommand: {
                addListener() {}
            }
        },
        tabs: {
            query: async () => [],
            sendMessage() {},
            create: async () => ({ id: 1 })
        },
        runtime: {
            lastError: null,
            openOptionsPage: async () => {},
            onMessage: {
                addListener(listener) {
                    messageListener = listener;
                }
            }
        },
        downloads: {
            download: downloadsDownloadImpl || ((opts, callback) => callback(1)),
            show() {}
        },
        cookies: {
            getAll: async () => []
        }
    };

    const context = {
        AbortController,
        ArrayBuffer,
        Blob,
        FormData,
        Headers,
        Response,
        TextDecoder,
        TextEncoder,
        URL,
        URLSearchParams,
        chrome,
        clearTimeout,
        console,
        fetch: fetchImpl || (async () => new Response('', {
            status: 200,
            headers: { 'content-length': '0' }
        })),
        globalThis: null,
        setTimeout
    };
    context.globalThis = context;

    vm.createContext(context);
    vm.runInContext(backgroundSource, context, { filename: 'extension/background.js' });

    return { chrome, context, messageListener };
}

function dispatchMessage(listener, message, sender = { tab: { id: 9, windowId: 1, index: 0 } }) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('Timed out waiting for sendResponse')), 1000);
        const sendResponse = (response) => {
            clearTimeout(timeoutId);
            resolve(response);
        };

        try {
            listener(message, sender, sendResponse);
        } catch (error) {
            clearTimeout(timeoutId);
            reject(error);
        }
    });
}

test('background EXT_FETCH preserves empty-string request bodies', async () => {
    let capturedOptions = null;
    const { messageListener } = loadBackground({
        fetchImpl: async (_url, options) => {
            capturedOptions = options;
            return new Response('', {
                status: 200,
                headers: { 'content-length': '0' }
            });
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'EXT_FETCH',
        details: {
            method: 'POST',
            url: 'https://www.youtube.com/api/test',
            headers: { 'Content-Type': 'text/plain' },
            data: ''
        }
    });

    assert.equal(capturedOptions?.body, '');
    assert.equal(response.status, 200);
    assert.equal(response.responseText, '');
});

test('background DOWNLOAD_FILE sanitizes reserved Windows filenames', async () => {
    let capturedOptions = null;
    const { messageListener } = loadBackground({
        downloadsDownloadImpl: (options, callback) => {
            capturedOptions = options;
            callback(42);
        }
    });

    const response = await dispatchMessage(messageListener, {
        type: 'DOWNLOAD_FILE',
        url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
        filename: 'CON.txt'
    });

    assert.equal(capturedOptions?.filename, '_CON.txt');
    assert.equal(response.downloadId, 42);
});
