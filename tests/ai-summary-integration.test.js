'use strict';

// How the AI summary feature is WIRED: which service it calls, what it puts on
// the wire, and which storage key the artifacts land in.
//
// `tests/ai-summary-artifacts.test.js` already exercises the artifact service
// itself. What was missing here is the join between them, and this file used to
// assert it with fifty-two regex reads of `ytkit.js` and
// `core/userscript-ai-summary.js`. A pin on `parseSummaryResponse(response,
// transcript.prepared.cues)` proves the call is written, not that it is
// reached, not that the arguments are the ones the service needs, and not that
// the answer is stored.
//
// So the userscript feature is built for real and its request path is driven:
// the Gemini model substitution, the credential header, the response scan and
// the artifact merge all run. Manifest load order and bundle composition stay
// data assertions, because there is no runtime to ask about a load order.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('../extension/core/credential-vault.js');
require('../extension/core/ai-summary-artifacts.js');
const { createUserscriptAiSummaryFeature } = require('../extension/core/userscript-ai-summary.js');

const artifacts = require('../extension/core/ai-summary-artifacts.js');
const { fakeTreeDocument } = require('./helpers/monolith');
const { runtimeModules } = require('./helpers/source');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const ytkit = read('extension/ytkit.js');
const userscriptFeature = read('extension/core/userscript-ai-summary.js');
const manifest = JSON.parse(read('extension/manifest.json'));
const defaults = JSON.parse(read('extension/default-settings.json'));

const GEMINI_DEFAULT =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const CREDENTIAL = 'gm-secret-credential-value';

/**
 * The real userscript feature, with the manager storage, the transcript
 * service and the network call replaced by recorders. Everything between them
 * — endpoint validation, model substitution, header assembly, the response
 * scan — is the production code.
 */
function userscriptFeatureUnder({ settings = {}, credential = CREDENTIAL, respond } = {}) {
    const store = new Map();
    if (credential) store.set('ytkit:ai-credential:openai', credential);
    if (credential) store.set('ytkit:ai-credential:gemini', credential);

    const sent = [];
    const doc = fakeTreeDocument(() => null);

    const feature = createUserscriptAiSummaryFeature({
        document: doc,
        getSettings: () => settings,
        getVideoId: () => 'dQw4w9WgXcQ',
        transcriptService: { fetchTranscript: async () => ({ cues: [], title: '', language: 'en' }) },
        addNavigateRule: () => {},
        removeNavigateRule: () => {},
        credentialStore: {
            getValue: (key, fallback) => (store.has(key) ? store.get(key) : fallback),
            setValue: (key, value) => { store.set(key, value); },
            deleteValue: (key) => { store.delete(key); },
        },
        request: (details) => {
            sent.push(details);
            const body = respond ? respond(details) : { choices: [{ message: { content: 'ok' } }] };
            const responseText = typeof body === 'string' ? body : JSON.stringify(body);
            queueMicrotask(() => details.onload?.({ status: 200, responseText }));
            return { abort() {} };
        },
        t: (_key, fallback) => fallback,
    });

    return { feature, sent, store };
}

/** STORAGE_KEYS, built from the monolith rather than pattern-matched. */
function storageKeys() {
    const at = ytkit.indexOf('const STORAGE_KEYS');
    assert.ok(at > 0, 'the storage key table must exist');
    // The table's own entries are indented inconsistently, so close on the
    // first `});` at the four-space indent rather than at column zero.
    const close = ytkit.indexOf('\n    });', at);
    assert.ok(close > at, 'and close at the declaration indent');
    return new Function(ytkit.slice(at, close + 8) + ' return STORAGE_KEYS;')();
}

/**
 * `_extractLegacyArtifacts`, lifted out of the settings manager with the four
 * collaborators it reads: the plain-object guard, the key table, the artifact
 * service and storage. Storage is a recorder, so the move is observable.
 */
function legacyExtractor({ written = new Map(), existing = {} } = {}) {
    const header = '\n        _extractLegacyArtifacts(settings) {';
    const at = ytkit.indexOf(header);
    assert.ok(at > 0, 'the extractor must be a real method');
    const close = ytkit.indexOf('\n        },', at);
    assert.ok(close > at, 'and close at its own indent');
    const body = ytkit.slice(at + 9, close + 10);

    const isPlainObject = (value) =>
        Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    const StorageManager = {
        get: (key, fallback) => (written.has(key) ? written.get(key) : (existing[key] ?? fallback)),
        setSync: (key, value) => { written.set(key, value); },
    };
    const scope = { YTKitCore: { aiSummaryArtifacts: artifacts } };
    const holder = new Function(
        'isPlainObject', 'STORAGE_KEYS', 'StorageManager', 'globalThis',
        'return { ' + body + ' };'
    )(isPlainObject, storageKeys(), StorageManager, scope);
    return (settings) => holder._extractLegacyArtifacts(settings);
}

/** One valid artifact, built through the real parse-and-create pipeline. */
function sampleArtifact() {
    const prepared = artifacts.prepareCues([
        { start: 0, duration: 30, text: 'An opening line.' },
        { start: 60, duration: 30, text: 'The central point of the video.' },
        { start: 120, duration: 30, text: 'A closing line.' },
    ]);
    const result = artifacts.parseSummaryResponse(JSON.stringify({
        summary: 'A validated overview.',
        bullets: [{ text: 'Central finding.', citations: [prepared.cues[1].id] }],
        tldr: { text: 'Conclusion.', citations: [prepared.cues[2].id] },
    }), prepared.cues);
    return artifacts.createArtifact({
        videoId: 'dQw4w9WgXcQ',
        title: 'A video',
        language: 'en',
        provider: 'openai',
        model: 'gpt-4o-mini',
        generatedAt: '2026-07-14T12:00:00.000Z',
        result,
        cues: prepared.cues,
    });
}

async function rejects(promise) {
    try { await promise; } catch (error) { return error; }
    return null;
}

// ── bundle composition (data, not behaviour) ────────────────────────────────

test('AI artifact core loads before every summary consumer and is bundled for userscripts', () => {
    // A load ORDER inside a manifest. There is no runtime here that could get
    // it wrong at test time, so this is read from the manifest data.
    const isolated = manifest.content_scripts.find((entry) =>
        entry.world === 'ISOLATED' && runtimeModules(entry).includes('ytkit.js')
    );
    assert.ok(isolated);
    const scripts = runtimeModules(isolated);
    assert.ok(scripts.indexOf('core/ai-summary-artifacts.js') > scripts.indexOf('core/transcript-service.js'),
        'the artifact service needs the transcript service that feeds it');
    assert.ok(scripts.indexOf('core/ai-summary-artifacts.js') < scripts.indexOf('ytkit.js'),
        'and ytkit.js calls it at feature-build time');
    assert.match(read('sync-userscript.js'), /extension\/core\/ai-summary-artifacts\.js/,
        'the userscript bundle has to carry it too, or aiVideoSummary is dead there');
});

// ── artifact storage routing ────────────────────────────────────────────────

test('AI summaries live in their own storage key, not the settings bag', () => {
    // v4.49.7: artifacts moved out of ytSuiteSettings so settings saves and
    // YTKIT_SETTINGS_REPLACED broadcasts stop shipping the <=1.5 MB store to
    // every tab.
    assert.equal(Object.hasOwn(defaults, 'aiSummaryArtifactsData'), false);
    assert.doesNotMatch(read('extension/core/settings-schema.js'), /key: "aiSummaryArtifactsData"/);

    const STORAGE_KEYS = storageKeys();
    assert.equal(STORAGE_KEYS.aiSummaries, 'ytkit-ai-summaries',
        'the summaries live under their own key, not inside the settings blob');
    assert.notEqual(STORAGE_KEYS.aiSummaries, STORAGE_KEYS.settings);
});

test('a legacy backup carrying the store inside settings is extracted, not dropped', () => {
    // The extractor, run for real. A pin on the call site cannot tell moving
    // the store from deleting it, and deleting it is exactly what ordinary
    // sanitization would do, because it does not know the key.
    const legacy = { dQw4w9WgXcQ_1: { videoId: 'dQw4w9WgXcQ', summary: 'kept' } };
    const written = new Map();
    const extract = legacyExtractor({ written });

    const moved = extract({ theme: 'dark', aiSummaryArtifactsData: legacy });
    assert.equal(moved.moved, true);
    assert.equal(Object.hasOwn(moved.settings, 'aiSummaryArtifactsData'), false,
        'the settings bag must not keep shipping the store to every tab');
    assert.equal(moved.settings.theme, 'dark', 'and nothing else is disturbed');
    assert.ok(written.has('ytkit-ai-summaries'),
        'a store deleted without being written is a user losing their summaries');

    // Settings with no legacy field are handed straight back.
    const untouched = extract({ theme: 'dark' });
    assert.equal(untouched.moved, false);
    assert.equal(untouched.settings.theme, 'dark');

    // An empty legacy store is dropped without a pointless write.
    const emptyWrites = new Map();
    const emptied = legacyExtractor({ written: emptyWrites })({ aiSummaryArtifactsData: {} });
    assert.equal(emptied.moved, true);
    assert.equal(Object.hasOwn(emptied.settings, 'aiSummaryArtifactsData'), false);
    assert.equal(emptyWrites.size, 0);

    // The import and export paths read and write the same field. Both sit
    // inside routines that need the whole storage stack to reach.
    assert.match(ytkit, /importedData\.settings\?\.aiSummaryArtifactsData/,
        'an import must read the legacy store before the settings are sanitized');
    assert.match(ytkit, /aiSummaries: StorageManager\.get\(STORAGE_KEYS\.aiSummaries, \{\}\)/,
        'and a new export must carry the store as a top-level field');
    assert.match(ytkit, /\baiSummaries,\s*\n\s*exportVersion: 4/);
});

test('the artifact service itself never touches a credential', () => {
    // Exhaustive over a module: the store is exported to a file the user can
    // read, so a credential must never be able to reach it by any path.
    assert.doesNotMatch(read('extension/core/ai-summary-artifacts.js'), /apiKey|credential/i);

    const exported = artifacts.exportArtifactStore(artifacts.mergeArtifact({}, sampleArtifact()));
    assert.equal(JSON.stringify(exported).toLowerCase().includes('credential'), false);
    assert.equal(JSON.stringify(exported).includes(CREDENTIAL), false,
        'the exported store is a file the user shares; nothing secret may be in it');
});

// ── the userscript request path, run for real ───────────────────────────────

test('a Gemini request substitutes the configured model into the validated URL', async () => {
    const { feature, sent } = userscriptFeatureUnder({
        settings: {
            aiSummaryProvider: 'gemini',
            aiSummaryEndpoint: GEMINI_DEFAULT,
            aiSummaryModel: 'gemini-2.5-pro',
        },
        respond: () => ({ candidates: [{ content: { parts: [{ text: 'summarised' }] } }] }),
    });

    const answer = await feature._callLLM('prompt text');
    assert.equal(answer, 'summarised', 'the Gemini response shape is unwrapped');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url,
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
        'a model setting that is silently ignored is a setting that does nothing');
});

test('a Gemini model that could rewrite the path is refused and the endpoint is left alone', async () => {
    for (const model of [
        '../../../v1beta/models/x', 'gemini@evil', 'gemini pro', '.leading-dot',
        'x'.repeat(101), '', '   ',
    ]) {
        const { feature, sent } = userscriptFeatureUnder({
            settings: {
                aiSummaryProvider: 'gemini',
                aiSummaryEndpoint: GEMINI_DEFAULT,
                aiSummaryModel: model,
            },
            respond: () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
        });
        await feature._callLLM('prompt');
        assert.equal(sent[0].url, GEMINI_DEFAULT,
            `a ${JSON.stringify(model)} model must fall back to the endpoint unchanged`);
    }
});

test('a substituted Gemini URL is re-validated before it is used', async () => {
    // The substitution rewrites a URL that was already validated. Without a
    // second pass, the rewrite is trusted on the strength of the pre-rewrite
    // check.
    const { feature } = userscriptFeatureUnder({
        settings: {
            aiSummaryProvider: 'gemini',
            aiSummaryEndpoint: `${GEMINI_DEFAULT}?key=leak`,
            aiSummaryModel: 'gemini-2.5-pro',
        },
    });
    const error = await rejects(feature._callLLM('prompt'));
    assert.ok(error, 'a credential in the endpoint must never reach the wire');
    assert.match(error.message, /not allowed in AI endpoint URLs/);

    const substitutionIndex = userscriptFeature.indexOf('${model}:generateContent');
    const revalidateIndex = userscriptFeature.indexOf('validateAiProviderEndpoint(provider, rewritten)');
    assert.ok(revalidateIndex > substitutionIndex, 'the rewritten gemini URL must be re-validated');
});

test('the credential rides in the provider header and never in the URL or the body', async () => {
    const { feature, sent } = userscriptFeatureUnder({
        settings: { aiSummaryProvider: 'gemini', aiSummaryEndpoint: GEMINI_DEFAULT },
        respond: () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    });
    await feature._callLLM('prompt');

    const [details] = sent;
    assert.equal(details.headers['x-goog-api-key'], CREDENTIAL, 'Gemini takes a header, not a query key');
    assert.equal(details.url.includes(CREDENTIAL), false, 'a URL is logged by proxies and history');
    assert.equal(String(details.data).includes(CREDENTIAL), false, 'and the body is not a place for it either');
    assert.equal(details.anonymous, true,
        'a non-anonymous request attaches the user cookies for the provider origin');
});

test('an OpenAI credential is prefixed as a bearer token', async () => {
    const { feature, sent } = userscriptFeatureUnder({
        settings: { aiSummaryProvider: 'openai', aiSummaryModel: 'gpt-4o-mini' },
    });
    await feature._callLLM('prompt');
    assert.equal(sent[0].headers.Authorization, `Bearer ${CREDENTIAL}`,
        'a bare key in Authorization is rejected by the provider');
    assert.equal(JSON.parse(sent[0].data).model, 'gpt-4o-mini',
        'this provider takes its model in the payload, not the path');
});

test('a provider that echoes the credential back is blocked before the answer is used', async () => {
    const { feature } = userscriptFeatureUnder({
        settings: { aiSummaryProvider: 'openai' },
        respond: () => ({ choices: [{ message: { content: `here is your key ${CREDENTIAL}` } }] }),
    });
    const error = await rejects(feature._callLLM('prompt'));
    assert.ok(error, 'a response carrying the credential must not be handed to the page');
});

test('an oversized provider response is refused rather than buffered into the page', async () => {
    const { feature } = userscriptFeatureUnder({
        settings: { aiSummaryProvider: 'openai' },
        respond: () => 'x'.repeat(2 * 1024 * 1024 + 1),
    });
    const error = await rejects(feature._callLLM('prompt'));
    assert.ok(error);
    assert.match(error.message, /too large/i);
});

test('the local provider is called with no credential at all', async () => {
    const { feature, sent } = userscriptFeatureUnder({
        settings: { aiSummaryProvider: 'ollama' },
        credential: null,
    });
    await feature._callLLM('prompt');
    assert.equal(sent.length, 1, 'a local model must not prompt for a key first');
    assert.equal(Object.keys(sent[0].headers).some((name) => /auth|key/i.test(name)), false,
        'and must not be sent one');
    assert.equal(sent[0].timeout, 300000, 'a local model is slow; a 60s timeout kills every run');
});

// ── the surfaces that stay scans ────────────────────────────────────────────

test('the extension summary UI is wired to the shared artifact service', () => {
    // These are call sites inside the aiVideoSummary feature literal in the
    // monolith. Reaching them needs the transcript service, the runtime
    // message bridge, the artifact store and the panel DOM at once; the
    // service's own behaviour is covered by tests/ai-summary-artifacts.test.js
    // and the userscript copy of this wiring is executed above.
    const start = ytkit.indexOf("id: 'aiVideoSummary'");
    assert.ok(start > 0, 'anchor: the feature must exist');
    const end = ytkit.indexOf("id: 'copyChapterMarkdown'", start);
    assert.ok(end > start, 'and the window must terminate inside the file');
    const block = ytkit.slice(start, end);

    assert.match(block, /TranscriptService\.fetchTranscript\(videoId, \{ signal: options\.signal \}\)/);
    assert.match(block, /this\._fetchTranscript\(videoId, \{ signal: controller\.signal \}\)/);
    assert.match(block, /this\._runController\?\.abort\(\)/);
    assert.match(block, /buildPrompt\(/);
    assert.match(block, /parseSummaryResponse\(response, transcript\.prepared\.cues\)/);
    assert.match(block, /mergeArtifact\(this\._readArtifacts\(\), artifact\)/);
    assert.match(block, /searchArtifacts\(this\._readArtifacts\(\), search\.value\)/);
    assert.match(block, /deleteArtifact\(before, artifactId\)/);
    assert.match(block, /exportArtifactStore\(this\._readArtifacts\(\)\)/);
    assert.match(block, /video\.currentTime = cue\.startSeconds/);
    assert.match(block, /runToken !== this\._runToken \|\| getVideoId\(\) !== videoId/);
    assert.match(block, /prefers-reduced-motion:reduce/);
    assert.match(block, /forced-colors:active/);
});

test('the timestamp bookmark panel exports one current-video highlight pack in both formats', () => {
    const start = ytkit.indexOf("id: 'timestampBookmarks'");
    const end = ytkit.indexOf("id: 'videoNotes'", start);
    assert.ok(start > -1 && end > start);
    const block = ytkit.slice(start, end);
    assert.match(block, /async _exportHighlightPack\(\)/);
    assert.match(block, /TranscriptService\.fetchTranscript\(videoId, \{ signal: controller\.signal \}\)/);
    assert.match(block, /createVideoHighlightBundle\(/);
    assert.match(block, /videoHighlightBundleToMarkdown\(bundle\)/);
    assert.match(block, /handleFileExport\(`\$\{stem\}\.md`/);
    assert.match(block, /handleFileExport\(`\$\{stem\}\.json`/);
    assert.match(block, /createHighlightExport/);
    assert.match(block, /unavailableDomains: \['transcriptIndex'\]/);
    assert.match(block, /dataset\.action = 'export-highlight-pack'/);
});

test('the highlight pack the bookmark panel exports round-trips through markdown', () => {
    // The service the panel above calls, run for real, so the pin on the call
    // site is backed by a proof that the call produces something usable.
    const bundle = artifacts.createVideoHighlightBundle({
        videoId: 'dQw4w9WgXcQ',
        title: 'A video',
        bookmarks: [{ t: 65, note: 'the good part' }],
    });
    const markdown = artifacts.videoHighlightBundleToMarkdown(bundle);
    assert.match(markdown, /the good part/, 'the note the user wrote has to be in the export');
    assert.match(markdown, /1:05/, 'and the timestamp it was taken at');
    assert.doesNotMatch(markdown, /Saved bookmark/,
        'a bookmark the user annotated is titled by its note, not by a generic placeholder');

    // A bookmark with no note still gets a readable line.
    const bare = artifacts.videoHighlightBundleToMarkdown(artifacts.createVideoHighlightBundle({
        videoId: 'dQw4w9WgXcQ',
        title: 'A video',
        bookmarks: [{ t: 65 }],
    }));
    assert.match(bare, /Saved bookmark/, 'the placeholder is what an un-annotated bookmark falls back to');
    assert.match(bare, /1:05/);
});

test('the userscript credential dialog renders inside a closed shadow root', () => {
    // The password input lives on youtube.com — page scripts must not be able
    // to read input.value or keylog while the dialog is open. A closed root is
    // observable only by NOT being reachable, which a fake DOM cannot model.
    assert.match(userscriptFeature, /attachShadow\(\{ mode: 'closed' \}\)/);
    const attachIndex = userscriptFeature.indexOf("attachShadow({ mode: 'closed' })");
    const appendIndex = userscriptFeature.indexOf('doc.body.appendChild(host)');
    assert.ok(attachIndex > -1 && appendIndex > attachIndex,
        'the shadow root must be attached before the host enters the document');
    assert.doesNotMatch(userscriptFeature, /doc\.body\.appendChild\(shell\)/);
});

test('the userscript keeps isolated BYOK custody while sharing validated artifacts', () => {
    assert.match(userscriptFeature, /createUserscriptCredentialVault/);
    assert.match(userscriptFeature, /artifactService\.buildPrompt/);
    assert.match(userscriptFeature, /artifactService\.parseSummaryResponse/);
    assert.match(userscriptFeature, /artifactService\.mergeArtifact/);
    assert.match(userscriptFeature, /artifactService\.searchArtifacts/);
    assert.match(userscriptFeature, /artifactService\.exportArtifactStore/);
    assert.match(userscriptFeature, /runToken !== this\._runToken \|\| getVideoId\(\) !== transcript\.videoId/);
    assert.doesNotMatch(userscriptFeature, /localStorage\.setItem/,
        'localStorage on youtube.com is readable by every page script');

    const userscript = read('YTKit.user.js');
    assert.match(userscript, /saveSettings: \(settings\) => settingsManager\.save\(settings\)/);
    assert.match(userscript, /aiSummaryArtifactsData:\s*\{\}/);
});
