'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const {
    assertNoRuntimeExceptions,
    parseArgs: parseA11yArgs,
    validateRealExtensionPageSnapshot,
} = require('../scripts/smoke-headless-a11y');
const {
    LIVE_SEARCH_URL,
    parseArgs: parseLiveChatArgs,
    validateLiveChatSnapshot,
} = require('../scripts/smoke-live-chat-frame');

const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
const realPageSnapshot = Object.freeze({
    controlCount: 24,
    extensionId,
    manifestVersion: '4.84.0',
    origin: `chrome-extension://${extensionId}`,
    overflowBy: 0,
    protocol: 'chrome-extension:',
    ready: true,
    resourceName: '__MSG_extName__',
    resourceStatus: 200,
    storageRoundTrip: 'stored',
});

test('real extension-page validator accepts the loaded popup contract', () => {
    assert.equal(validateRealExtensionPageSnapshot(realPageSnapshot, 'popup', extensionId), true);
});

test('every real extension-page assertion is baited with a broken observation', async (t) => {
    const mutations = [
        ['main script boot', { ready: false }, /did not finish booting/],
        ['extension protocol', { protocol: 'file:' }, /protocol/],
        ['runtime identity', { extensionId: 'wrong' }, /runtime id/],
        ['dynamic extension origin', { origin: 'file://' }, /origin/],
        ['manifest API', { manifestVersion: '' }, /manifest version/],
        ['storage behavior', { storageRoundTrip: '' }, /storage\.local/],
        ['extension-origin fetch', { resourceStatus: 404 }, /manifest did not load/],
        ['extension-origin payload', { resourceName: '' }, /manifest did not load/],
        ['rendered controls', { controlCount: 0 }, /controls rendered/],
        ['horizontal fit', { overflowBy: 12 }, /overflows horizontally/],
    ];
    for (const [name, patch, expected] of mutations) {
        await t.test(name, () => {
            assert.throws(
                () => validateRealExtensionPageSnapshot(
                    { ...realPageSnapshot, ...patch }, 'popup', extensionId
                ),
                expected
            );
        });
    }
});

test('real extension-page smoke fails on page runtime exceptions', () => {
    assert.equal(assertNoRuntimeExceptions([{ method: 'Page.loadEventFired' }], 0, 'popup/normal'), true);
    assert.throws(
        () => assertNoRuntimeExceptions([
            { method: 'Runtime.consoleAPICalled' },
            {
                method: 'Runtime.exceptionThrown',
                params: { exceptionDetails: { exception: { description: 'Error: boot exploded' } } }
            }
        ], 0, 'sidepanel/forced-colors'),
        /sidepanel\/forced-colors threw during boot: Error: boot exploded/
    );
    assert.equal(assertNoRuntimeExceptions([
        { method: 'Runtime.exceptionThrown', params: { exceptionDetails: { text: 'old navigation' } } },
        { method: 'Page.loadEventFired' }
    ], 1, 'popup/normal'), true, 'the mode marker must isolate prior navigation events');
});

const liveChatSnapshot = Object.freeze({
    chatRootPresent: true,
    framePresent: true,
    frameUrl: 'https://www.youtube.com/live_chat?v=abc123',
    readyState: 'complete',
    runtimeState: 'active',
    sameOrigin: true,
    watchUrl: 'https://www.youtube.com/watch?v=abc123',
});

test('live-chat validator accepts an attached runtime inside the frame', () => {
    assert.equal(validateLiveChatSnapshot(liveChatSnapshot), true);
});

test('every live-chat assertion is baited with a broken frame observation', async (t) => {
    const mutations = [
        ['iframe attachment', { framePresent: false }, /no live-chat iframe/],
        ['iframe route', { frameUrl: 'https://www.youtube.com/watch?v=abc123' }, /frame URL/],
        ['same-origin document', { sameOrigin: false }, /not reachable/],
        ['chat application root', { chatRootPresent: false }, /no chat application root/],
        ['Astra runtime marker', { runtimeState: '' }, /runtime marker/],
    ];
    for (const [name, patch, expected] of mutations) {
        await t.test(name, () => {
            assert.throws(() => validateLiveChatSnapshot({ ...liveChatSnapshot, ...patch }), expected);
        });
    }
});

test('the a11y CLI separates real extension pages from fixture-only states', () => {
    assert.equal(parseA11yArgs(['--real-extension-pages']).mode, 'real');
    assert.equal(parseA11yArgs(['--fixture-states']).mode, 'fixture');
    assert.equal(parseA11yArgs([]).mode, 'all');
    assert.throws(
        () => parseA11yArgs(['--fixture-states', '--real-extension-pages']),
        /cannot be combined/
    );
    assert.throws(
        () => parseA11yArgs(['--mutate-real-page', 'popup']),
        /requires --real-extension-pages/
    );
});

test('live-chat runtime publishes and removes the frame attachment marker', () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'extension', 'features', 'live-chat', 'index.js'), 'utf8'
    );
    assert.match(source, /setAttribute\?\.\(RUNTIME_ATTRIBUTE, 'active'\)/);
    assert.match(source, /removeAttribute\?\.\(RUNTIME_ATTRIBUTE\)/);
    assert.equal(parseLiveChatArgs(['--mutate-runtime']).mutateRuntime, true);
    assert.equal(new URL(LIVE_SEARCH_URL).searchParams.get('sp'), 'EgJAAQ==',
        'the live-only YouTube filter must be encoded exactly once');
});

test('live-chat smoke uses the shared bounded Chromium shutdown contract', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'smoke-live-chat-frame.js'), 'utf8');
    assert.match(source, /await shutdownChromiumProcess\(browser, browserClient\)/);
    assert.doesNotMatch(source, /killProcessTree\(browser\)/);
    assert.match(source, /await removeDirWithRetries\(profileDir\)/);
});

test('release browser smokes include real extension pages and the live-chat frame lane', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts['smoke:live-chat'], 'node scripts/smoke-live-chat-frame.js');
    assert.match(pkg.scripts['release:browser-smokes'], /smoke:a11y/);
    assert.match(pkg.scripts['release:browser-smokes'], /smoke:live-chat/);
});
