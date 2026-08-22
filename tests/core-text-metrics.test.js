'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { runtimeModules } = require('./helpers/source');

const repoRoot = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'extension', 'core', 'text-metrics.js'), 'utf8');

function loadCore() {
    const context = { globalThis: null };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'extension/core/text-metrics.js' });
    return context.globalThis.YTKitCore;
}

function loadCoreWithoutNativeRegExpEscape() {
    const context = { globalThis: null };
    class CompatibilityRegExp extends RegExp {}
    CompatibilityRegExp.escape = undefined;
    context.globalThis = context;
    context.RegExp = CompatibilityRegExp;
    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'extension/core/text-metrics.js' });
    return context.globalThis.YTKitCore;
}

test('escapeRegExp uses a literal-safe pattern for filter text', () => {
    const { escapeRegExp } = loadCore();
    const literal = 'foo-bar / (demo) [v2]';
    const pattern = escapeRegExp(literal);
    assert.equal(new RegExp(pattern, 'u').test(literal), true);
    assert.equal(new RegExp(pattern, 'u').test('fooXbar / (demo) [v2]'), false);
    assert.equal(pattern, RegExp.escape(literal));
});

test('escapeRegExp fallback handles leading escapes, punctuators, and surrogate pairs', () => {
    const { escapeRegExp } = loadCoreWithoutNativeRegExpEscape();
    const literal = 'foo-bar / 😊';
    const pattern = escapeRegExp(literal);
    assert.equal(pattern, '\\x66oo\\x2dbar\\x20\\/\\x20😊');
    assert.equal(new RegExp(pattern, 'u').test(literal), true);
    assert.equal(escapeRegExp('1+1'), '\\x31\\+1');
});

test('parseCompactCount preserves comma-grouped integer counts (no decimal coercion)', () => {
    const { parseCompactCount } = loadCore();
    // The bug this module exists to prevent: "1,234" -> 1.234 -> 1.
    assert.equal(parseCompactCount('1,234 views'), 1234);
    assert.equal(parseCompactCount('12,345 views'), 12345);
    assert.equal(parseCompactCount('1,234,567 views'), 1234567);
    assert.equal(parseCompactCount('987 views'), 987);
    assert.equal(parseCompactCount('42 watching'), 42);
});

test('parseCompactCount handles K/M/B suffixes and sentinels', () => {
    const { parseCompactCount } = loadCore();
    assert.equal(parseCompactCount('1.2M views'), 1200000);
    assert.equal(parseCompactCount('12.5K views'), 12500);
    assert.equal(parseCompactCount('3B views'), 3000000000);
    assert.equal(parseCompactCount('No views'), 0);
});

test('parseCompactCount handles localized labels, suffixes, and digits', () => {
    const { parseCompactCount } = loadCore();
    assert.equal(parseCompactCount('1,2 Mio. Aufrufe'), 1_200_000);
    assert.equal(parseCompactCount('987 Aufrufe'), 987);
    assert.equal(parseCompactCount('12.3万 回視聴'), 123_000);
    assert.equal(parseCompactCount('١٬٢٣٤ مشاهدة'), 1234);
    assert.equal(parseCompactCount('Streamed 3 years ago', null, { allowBare: true }), null);
});

test('parseCompactCount accepts a caller-supplied label set for subscriber metadata', () => {
    const { parseCompactCount } = loadCore();
    const labels = /(?:subscribers?|abonnenten?|登録者)/i;
    const zeroPattern = /(?:no\s+subscribers?|登録者\s*なし)/i;
    assert.equal(parseCompactCount('1,2 Mio. Abonnenten', null, { labels, zeroPattern }), 1_200_000);
    assert.equal(parseCompactCount('12.3万 登録者', null, { labels, zeroPattern }), 123_000);
    assert.equal(parseCompactCount('title 42 subscribers', null, { labels, zeroPattern }), 42);
    assert.equal(parseCompactCount('No subscribers', null, { labels, zeroPattern }), 0);
    assert.equal(parseCompactCount('Subscribe to channel', null, { labels, zeroPattern }), null);
});

test('parseCompactCount returns the caller-chosen missingValue when there is no count', () => {
    const { parseCompactCount } = loadCore();
    assert.equal(parseCompactCount('Streamed 3 years ago', null), null);
    assert.equal(parseCompactCount('Streamed 3 years ago', 0), 0);
    // Empty text carries no count, so it takes missingValue like any other
    // unparseable input. "No views" is the only thing that means zero.
    assert.equal(parseCompactCount('', null), null);
    assert.equal(parseCompactCount(null, null), null);
    assert.equal(parseCompactCount('   ', null), null);
    assert.equal(parseCompactCount('', 0), 0);
    assert.equal(parseCompactCount('No views', null), 0);
});

test('text-metrics loads before ytkit.js in the manifest content scripts', () => {
    const manifest = JSON.parse(
        fs.readFileSync(path.join(repoRoot, 'extension', 'manifest.json'), 'utf8')
    );
    for (const block of manifest.content_scripts.filter((b) => runtimeModules(b).includes('ytkit.js'))) {
        const scripts = runtimeModules(block);
        const idxYtkit = scripts.indexOf('ytkit.js');
        if (idxYtkit === -1) continue;
        const idxMetrics = scripts.indexOf('core/text-metrics.js');
        assert.notEqual(idxMetrics, -1, 'core/text-metrics.js must be in content_scripts');
        assert.ok(idxMetrics < idxYtkit, 'core/text-metrics.js must load before ytkit.js');
    }
});

test('no view-count parser uses the broken decimal-coercion pattern', () => {
    // Guard against the bug class returning via a divergent copy. The original
    // bug coerced a comma-grouped integer to a tiny float with
    // `parseFloat(match[1].replace(',', '.'))` right after matching a
    // `(?:views?|watching)` count. This proximity check flags exactly that
    // pairing and deliberately does NOT flag the legitimate relative-age parser
    // (`_extractCardAgeMs`), where ages are never thousands-grouped and comma
    // is a real decimal separator.
    const buggyReplace = /match\[1\]\.replace\(\s*','\s*,\s*'\.'\s*\)/;
    const countRegexMarker = /views\?\|watching/g;
    const files = [
        'extension/ytkit.js',
        'extension/features/video-hider/index.js',
        'YTKit.user.js'
    ];
    for (const rel of files) {
        const src = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
        let m;
        countRegexMarker.lastIndex = 0;
        while ((m = countRegexMarker.exec(src))) {
            const windowAfter = src.slice(m.index, m.index + 400);
            assert.ok(
                !buggyReplace.test(windowAfter),
                `${rel} reintroduces the match[1].replace(',', '.') view-count bug near a (?:views?|watching) match`
            );
        }
    }
});

test('early.css baked-in avatar/shelf hides are opt-out via html:not(.ytkit-restore-native-ui)', () => {
    const earlyCss = fs.readFileSync(path.join(repoRoot, 'extension', 'early.css'), 'utf8');
    // The avatar + rich-section-shelf hides must be gated so a user can restore
    // the native UI; ungated `display:none` on avatars would hide them for
    // everyone with no way back.
    assert.ok(
        /html:not\(\.ytkit-restore-native-ui\)\s+img\.style-scope\.yt-img-shadow/.test(earlyCss),
        'avatar hide must be gated behind the opt-out class'
    );
    assert.ok(
        /html:not\(\.ytkit-restore-native-ui\)\s+div\.style-scope\.ytd-rich-section-renderer/.test(earlyCss),
        'rich-section-shelf hide must be gated behind the opt-out class'
    );

    // The feature that flips the gate must exist and toggle the class on <html>.
    const ytkit = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
    const featureIdx = ytkit.indexOf("id: 'restoreNativeYouTubeUi'");
    assert.ok(featureIdx > -1, 'restoreNativeYouTubeUi feature must exist');
    const block = ytkit.slice(featureIdx, featureIdx + 900);
    assert.ok(/classList\.add\('ytkit-restore-native-ui'\)/.test(block), 'init() must add the class');
    assert.ok(/classList\.remove\('ytkit-restore-native-ui'\)/.test(block), 'destroy() must remove the class');
});

test('extension fetch payloads use data: not body: (extensionRequest drops body)', () => {
    // extensionRequest forwards ONLY details.data as the request body; a
    // details.body is silently dropped. The Cobalt fallback and folder picker
    // shipped with `body: JSON.stringify(...)` and therefore POSTed empty
    // bodies (silent feature breakage). Guard against the pattern recurring.
    const src = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
    assert.ok(
        !/\bbody:\s*JSON\.stringify/.test(src),
        'extension fetch payloads must use `data:`, not `body:` (extensionRequest ignores body)'
    );
});

test('ytkit.js delegates compact-count parsing to the shared core helper', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
    const matches = src.match(/globalThis\.YTKitCore && globalThis\.YTKitCore\.parseCompactCount/g) || [];
    const videoHider = fs.readFileSync(
        path.join(repoRoot, 'extension', 'features', 'video-hider', 'index.js'), 'utf8'
    );
    assert.ok(matches.length >= 1,
        'the remaining ytkit.js compact-count method must delegate to core/text-metrics.js');
    assert.match(videoHider, /globalThis\.YTKitCore && globalThis\.YTKitCore\.parseCompactCount/,
        'the peeled Video Hider compact-count method must delegate to core/text-metrics.js');
});

test('settings search escapes literal filter text in both runtimes', () => {
    for (const rel of ['extension/features/settings-panel/index.js', 'extension/ytkit.js']) {
        const src = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
        assert.match(src, /new RegExp\(escapeRegExp\(q\), 'u'\)/,
            `${rel} must escape the user-supplied search query before matching`);
    }
});
