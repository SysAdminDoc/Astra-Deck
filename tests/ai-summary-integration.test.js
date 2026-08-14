'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const ytkit = read('extension/ytkit.js');
const userscriptFeature = read('extension/core/userscript-ai-summary.js');
const manifest = JSON.parse(read('extension/manifest.json'));
const defaults = JSON.parse(read('extension/default-settings.json'));
const { runtimeModules } = require('./helpers/source');

test('AI artifact core loads before every summary consumer and is bundled for userscripts', () => {
    const isolated = manifest.content_scripts.find((entry) =>
        entry.world === 'ISOLATED' && runtimeModules(entry).includes('ytkit.js')
    );
    assert.ok(isolated);
    const scripts = runtimeModules(isolated);
    assert.ok(scripts.indexOf('core/ai-summary-artifacts.js') > scripts.indexOf('core/transcript-service.js'));
    assert.ok(scripts.indexOf('core/ai-summary-artifacts.js') < scripts.indexOf('ytkit.js'));
    assert.match(read('sync-userscript.js'), /extension\/core\/ai-summary-artifacts\.js/);
});

test('AI summaries live in their own storage key, not the settings bag', () => {
    // v4.49.7: artifacts moved out of ytSuiteSettings so settings saves and
    // YTKIT_SETTINGS_REPLACED broadcasts stop shipping the ≤1.5 MB store to
    // every tab. The bag must not re-grow the key and legacy stores must be
    // extracted (never sanitize-dropped) on load and import.
    assert.equal(Object.prototype.hasOwnProperty.call(defaults, 'aiSummaryArtifactsData'), false);
    assert.doesNotMatch(read('extension/core/settings-schema.js'), /key: "aiSummaryArtifactsData"/);
    assert.match(ytkit, /aiSummaries: 'ytkit-ai-summaries'/);
    assert.match(ytkit, /_extractLegacyArtifacts\(savedSettings\)/);
    assert.match(ytkit, /StorageManager\.setSync\(STORAGE_KEYS\.aiSummaries, clean\)/);
    // Old backups carried the store inside settings; the raw copy must be
    // read before sanitization and routed into the new key on import.
    assert.match(ytkit, /importedData\.settings\?\.aiSummaryArtifactsData/);
    assert.match(ytkit, /aiSummaries: StorageManager\.get\(STORAGE_KEYS\.aiSummaries, \{\}\)/);
    // New backups export the store as a top-level field.
    assert.match(ytkit, /\baiSummaries,\s*\n\s*exportVersion: 4/);
    assert.doesNotMatch(read('extension/core/ai-summary-artifacts.js'), /apiKey|credential/i);
});

test('extension summary UI validates citations before saving and exposes searchable recovery controls', () => {
    const start = ytkit.indexOf("id: 'aiVideoSummary'");
    const end = ytkit.indexOf("id: 'copyChapterMarkdown'", start);
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

test('timestamp bookmark panel exports one current-video highlight pack in both formats', () => {
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

test('gemini requests honor aiSummaryModel via a validated URL model substitution', () => {
    // The model rides in the URL path for Gemini; the setting must be
    // substituted (validated) instead of silently ignored.
    assert.match(userscriptFeature, /\$\{model\}:generateContent/);
    assert.match(userscriptFeature, /\^\[a-zA-Z0-9\]\[a-zA-Z0-9\._-\]\{0,99\}\$/);
    const substitutionIndex = userscriptFeature.indexOf('${model}:generateContent');
    const revalidateIndex = userscriptFeature.indexOf('validateAiProviderEndpoint(provider, rewritten)');
    assert.ok(revalidateIndex > substitutionIndex, 'the rewritten gemini URL must be re-validated');
});

test('userscript credential dialog renders inside a closed shadow root', () => {
    // The password input lives on youtube.com — page scripts must not be able
    // to read input.value or keylog while the dialog is open.
    assert.match(userscriptFeature, /attachShadow\(\{ mode: 'closed' \}\)/);
    const attachIndex = userscriptFeature.indexOf("attachShadow({ mode: 'closed' })");
    const appendIndex = userscriptFeature.indexOf('doc.body.appendChild(host)');
    assert.ok(attachIndex > -1 && appendIndex > attachIndex,
        'the shadow root must be attached before the host enters the document');
    assert.doesNotMatch(userscriptFeature, /doc\.body\.appendChild\(shell\)/);
});

test('userscript keeps isolated BYOK custody while sharing validated artifacts', () => {
    assert.match(userscriptFeature, /createUserscriptCredentialVault/);
    assert.match(userscriptFeature, /artifactService\.buildPrompt/);
    assert.match(userscriptFeature, /artifactService\.parseSummaryResponse/);
    assert.match(userscriptFeature, /artifactService\.mergeArtifact/);
    assert.match(userscriptFeature, /artifactService\.searchArtifacts/);
    assert.match(userscriptFeature, /artifactService\.exportArtifactStore/);
    assert.match(userscriptFeature, /runToken !== this\._runToken \|\| getVideoId\(\) !== transcript\.videoId/);
    assert.doesNotMatch(userscriptFeature, /localStorage\.setItem/);
    const userscript = read('YTKit.user.js');
    assert.match(userscript, /saveSettings: \(settings\) => settingsManager\.save\(settings\)/);
    assert.match(userscript, /aiSummaryArtifactsData:\s*\{\}/);
});
