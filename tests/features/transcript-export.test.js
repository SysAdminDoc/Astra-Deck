'use strict';

// The transcript panel's "Copy AI Prompt" hands a whole transcript to another
// tool, so what it says about that transcript matters as much as the text. It
// used to carry only a title and `location.href`: no chapter structure, no
// statement of where the text came from, and an address bar URL that drags a
// playlist position, a `t=` seek and whatever tracking parameters the click
// arrived with into someone else's document.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { loadFeature } = require('../helpers/monolith');

/** The real chapter parser, so the test cannot drift from its output shape. */
function realChapterParser() {
    const core = {};
    vm.runInNewContext(
        fs.readFileSync(
            path.join(__dirname, '..', '..', 'extension', 'core', 'chapters.js'), 'utf8'),
        { globalThis: { YTKitCore: core } });
    return core.parseDescriptionChapters;
}

function buildViewer({ videoId = 'abc12345678', description = '', provenance = null } = {}) {
    const feature = loadFeature('transcriptViewer', {
        getVideoId: () => videoId,
        parseDescriptionChapters: realChapterParser(),
        _rw: { ytInitialPlayerResponse: { videoDetails: { shortDescription: description } } },
        document: {
            querySelector: () => null,
            querySelectorAll: () => [],
            title: 'A Video Title - YouTube',
            documentElement: { lang: 'en' }
        },
        location: { href: 'https://www.youtube.com/watch?v=abc12345678&list=PLxx&index=4&t=90s' }
    });
    feature._cues = [
        { start: 0, text: 'first line' },
        { start: 192, text: 'second line' }
    ];
    feature._lastProvenance = provenance;
    return feature;
}

test('the export uses the canonical watch URL, not the address bar', () => {
    const prompt = buildViewer()._buildLlmPrompt();

    assert.match(prompt, /URL: https:\/\/www\.youtube\.com\/watch\?v=abc12345678$/m,
        'the canonical URL should be the bare watch link');
    assert.doesNotMatch(prompt, /list=PLxx|index=4|t=90s/,
        'playlist position, index and seek must not travel with the export');
});

test('chapters reach the export with their real timestamps', () => {
    const prompt = buildViewer({
        description: 'Notes\n0:00 Intro\n3:12 Setup the rig\n10:45 Results\n'
    })._buildLlmPrompt();

    assert.match(prompt, /\nChapters:\n/, 'a video with chapters should get a chapter section');
    assert.match(prompt, /\[0:00\] Intro/);
    assert.match(prompt, /\[3:12\] Setup the rig/);
    assert.match(prompt, /\[10:45\] Results/);
    // Guards the field-name mismatch this was first written with: the parser
    // returns `startSeconds`, and reading `start` renders every chapter NaN.
    assert.doesNotMatch(prompt, /NaN/, 'chapter timestamps must be real numbers');
});

test('a video without chapters gets no empty chapter section', () => {
    const prompt = buildViewer({ description: 'just a description, no timestamps' })._buildLlmPrompt();

    assert.doesNotMatch(prompt, /Chapters:/, 'an empty section is noise in a prompt');
    assert.match(prompt, /Transcript:\n\[0:00\] first line/, 'the transcript still follows the header');
});

test('a cached or fallback transcript says so in the export', () => {
    const prompt = buildViewer({
        provenance: {
            source: 'dom-panel',
            language: 'en',
            fetchedAt: Date.UTC(2026, 7, 20, 12, 0, 0),
            fallbackReason: 'track-refresh'
        }
    })._buildLlmPrompt();

    assert.match(prompt, /Transcript source: .*source=dom-panel/,
        'the export should name where the text came from');
    assert.match(prompt, /fallback=track-refresh/,
        'a fallback must stay labelled once the text leaves the panel');
    assert.match(prompt, /fetched=2026-08-20T12:00:00\.000Z/,
        'the fetch time should be machine-readable in an export');
});

test('an unknown provenance is omitted rather than guessed', () => {
    const prompt = buildViewer()._buildLlmPrompt();
    assert.doesNotMatch(prompt, /Transcript source:/,
        'no provenance is better than an invented one');
});

test('provenance is cleared when a new video starts loading', () => {
    // Reused panels are the standing hazard on this page: without the reset,
    // the previous video's source line rides along with the next transcript.
    const source = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'ytkit.js'), 'utf8');
    const at = source.indexOf("this._setTranscriptMeta('Loading…'");
    assert.ok(at > -1, 'the transcript load should still reset its panel state');
    const window = source.slice(at, at + 400);
    assert.match(window, /this\._lastProvenance = null/,
        'the load path must clear provenance alongside the cues');
});
