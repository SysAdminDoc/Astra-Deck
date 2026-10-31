'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { runtimeModules, readUserscriptBuild, userscriptBundles } = require('./helpers/source');

const repoRoot = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'extension', 'core', 'date-time.js'), 'utf8');

function loadCore() {
    const context = { globalThis: null, Intl };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'extension/core/date-time.js' });
    return context.globalThis.YTKitCore;
}

test('calendar-only YouTube dates remain on the authored local day', () => {
    const { parseYouTubeDate, formatAbsoluteYouTubeDate } = loadCore();
    const parsed = parseYouTubeDate('2026-07-14');
    assert.equal(parsed.getFullYear(), 2026);
    assert.equal(parsed.getMonth(), 6);
    assert.equal(parsed.getDate(), 14);
    assert.match(formatAbsoluteYouTubeDate('2026-07-14', { locale: 'en-US' }), /July 14, 2026/);
});

test('timestamp formatting includes locale date and time only when metadata provides a time', () => {
    const { formatAbsoluteYouTubeDate, hasExplicitTime } = loadCore();
    assert.equal(hasExplicitTime('2026-07-14'), false);
    assert.equal(hasExplicitTime('2026-07-14T16:30:00Z'), true);
    const formatted = formatAbsoluteYouTubeDate('2026-07-14T16:30:00Z', { locale: 'en-US' });
    assert.match(formatted, /2026/);
    assert.match(formatted, /\d{1,2}:30/);
});

test('relative card ages become explicitly approximate locale-formatted calendar dates', () => {
    const { formatApproximateYouTubeDate, parseRelativeYouTubeAge } = loadCore();
    const relative = parseRelativeYouTubeAge('3 years ago', '2026-07-14T12:00:00');
    assert.ok(relative);
    assert.equal(relative.approximate, true);
    assert.equal(relative.unit, 'year');
    assert.equal(relative.date.getFullYear(), 2023);
    assert.match(formatApproximateYouTubeDate(relative, { locale: 'en-US' }), /Jul 14, 2023/);

    const clamped = parseRelativeYouTubeAge('1 month ago', '2026-03-31T12:00:00');
    assert.equal(clamped.date.getMonth(), 1);
    assert.equal(clamped.date.getDate(), 28);
});

test('stored timestamps render as bounded locale-relative freshness labels', () => {
    const { formatRelativeTimestamp } = loadCore();
    const now = Date.parse('2026-08-13T12:00:00Z');
    assert.equal(formatRelativeTimestamp(now - (2 * 60 * 60 * 1000), { now, locale: 'en-US' }), '2 hours ago');
    assert.equal(formatRelativeTimestamp(now + (24 * 60 * 60 * 1000), { now, locale: 'en-US' }), 'tomorrow');
    assert.equal(formatRelativeTimestamp(0, { now, locale: 'en-US' }), '');
});

test('duration formatting uses the platform formatter across every bundled locale', () => {
    const { formatDuration } = loadCore();
    const locales = ['ar', 'en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pt-BR', 'ru', 'zh-CN'];

    for (const locale of locales) {
        const formatted = formatDuration(3723, { locale, style: 'narrow' });
        assert.ok(formatted, `${locale} should produce a duration`);
        assert.doesNotMatch(formatted, /undefined|null/);
    }

    assert.equal(formatDuration(3723, { locale: 'en-US', style: 'narrow' }), '1h 2m 3s');
    assert.equal(formatDuration(3723, { locale: 'en-US', style: 'narrow', includeSeconds: false }), '1h 2m');
    assert.equal(formatDuration(3723, { locale: 'en-US', style: 'digital' }), '1:02:03');
    assert.equal(formatDuration(62, { locale: 'en-US', style: 'digital' }), '1:02');
});

test('duration formatting falls back when Intl.DurationFormat is unavailable', () => {
    const context = { globalThis: null, Intl: { DateTimeFormat: Intl.DateTimeFormat } };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'extension/core/date-time.js' });

    assert.equal(context.globalThis.YTKitCore.formatDuration(3723, { style: 'narrow' }), '1h 2m 3s');
    assert.equal(context.globalThis.YTKitCore.formatDuration(3723, { includeSeconds: false }), '1h 2m');
});

test('date-time core loads before ytkit and is bundled for userscript parity', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'extension', 'manifest.json'), 'utf8'));
    for (const block of manifest.content_scripts.filter((item) => runtimeModules(item).includes('ytkit.js'))) {
        const scripts = runtimeModules(block);
        const dateIndex = scripts.indexOf('core/date-time.js');
        const ytkitIndex = scripts.indexOf('ytkit.js');
        assert.notEqual(dateIndex, -1);
        assert.ok(dateIndex < ytkitIndex);
    }

    // The userscript host runs every foundation module before the app module,
    // mirroring the manifest, so the same order holds there by construction.
    const { modules } = readUserscriptBuild();
    assert.ok(modules.foundation.includes('core/date-time.js'),
        'the userscript runs the date-time core with the other foundation modules');
    assert.equal(modules.app, 'ytkit.js', 'ytkit.js runs after the foundation group in the userscript');
    assert.ok(userscriptBundles('core/date-time.js'), 'the userscript ships the date-time core');
});

// Live on 2026-10-31: after an in-app navigation the microdata tags and the first
// JSON-LD block kept the tab's first video, and only the second block moved on.
function watchDocument({ blocks = [], metaDate = '', metaUrl = '' } = {}) {
    const link = { getAttribute: (name) => (name === 'href' ? metaUrl : null) };
    const meta = {
        getAttribute: (name) => (name === 'content' ? metaDate : null),
        parentElement: { querySelector: (selector) => (selector.includes('itemprop="url"') && metaUrl ? link : null) }
    };
    return {
        querySelector: (selector) => (selector.includes('datePublished') && metaDate ? meta : null),
        querySelectorAll: (selector) => (selector.includes('ld+json')
            ? blocks.map((block) => ({ textContent: typeof block === 'string' ? block : JSON.stringify(block) }))
            : [])
    };
}

test('a watch page date only counts when its tag names this video', () => {
    const { readWatchUploadDate } = loadCore();
    const first = { '@type': 'VideoObject', uploadDate: '2026-06-20T06:00:00-07:00' };
    const moved = { '@type': 'VideoObject', uploadDate: '2026-10-24T09:00:00-07:00', embedUrl: 'https://www.youtube.com/embed/secondVideo' };

    assert.equal(readWatchUploadDate(watchDocument({ blocks: [first, moved] }), 'secondVideo'), moved.uploadDate,
        'the block that names the video wins over one that names nothing');
    assert.equal(readWatchUploadDate(watchDocument({ blocks: [first, moved] }), 'thirdVideo'), '',
        'a block for another video is not this video');
    assert.equal(readWatchUploadDate(watchDocument({ blocks: [first] }), 'secondVideo'), '',
        'a block that names no video proves nothing');

    const staleMeta = { metaDate: '2026-06-20', metaUrl: 'https://www.youtube.com/watch?v=firstVideo' };
    assert.equal(readWatchUploadDate(watchDocument(staleMeta), 'secondVideo'), '',
        'microdata left by the tab first video is refused');
    assert.equal(readWatchUploadDate(watchDocument(staleMeta), 'firstVideo'), '2026-06-20',
        'microdata naming this video is fine');
    assert.equal(readWatchUploadDate(watchDocument({ metaDate: '2026-06-20' }), 'secondVideo'), '',
        'microdata with no url proves nothing');
});

test('a watch page date read survives odd blocks and no video id', () => {
    const { readWatchUploadDate } = loadCore();
    const good = { '@type': 'VideoObject', uploadDate: '2026-10-24', url: 'https://www.youtube.com/watch?v=abc' };
    const page = { '@type': 'WebPage', uploadDate: '2020-01-01', url: 'https://www.youtube.com/watch?v=abc' };
    assert.equal(readWatchUploadDate(watchDocument({ blocks: ['{ half written', page, good] }), 'abc'), '2026-10-24',
        'a broken block and a block of another type are skipped');
    assert.equal(readWatchUploadDate(watchDocument({ blocks: [good] }), ''), '', 'no id, no date');
    assert.equal(readWatchUploadDate(null, 'abc'), '', 'no document, no date');
});
