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

test('early.css avatar hide leaves the signed-in account button its picture (#51)', () => {
    const earlyCss = fs.readFileSync(path.join(repoRoot, 'extension', 'early.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = earlyCss.match(/[^{}]*img\.style-scope\.yt-img-shadow[^{}]*\{[^}]*\}/g) || [];
    assert.equal(selectors.length, 1, 'one rule hides yt-img-shadow images');
    assert.match(selectors[0], /display:\s*none/);
    for (const selector of selectors[0].split('{')[0].split(',').filter((part) => part.includes('img.style-scope.yt-img-shadow'))) {
        assert.ok(
            selector.includes(':not(ytd-topbar-menu-button-renderer img)'),
            `avatar hide must spare the masthead account button: ${selector.trim()}`
        );
        // Same wrapper, not avatars: a signed-in watch page capture had the
        // merch shelf's and the Products panel's pictures display:none.
        for (const host of ['ytd-product-list-item-renderer', 'ytd-merch-shelf-item-renderer']) {
            assert.ok(selector.includes(`:not(${host} img)`), `avatar hide must spare product pictures in ${host}`);
        }
    }
});

test('early.css never takes the box away from the infinite-scroll trigger', () => {
    // YouTube loads the next page of a grid when an IntersectionObserver sees
    // ytd-continuation-item-renderer. A display:none default on it stopped
    // channel /videos grids at the first 30 videos.
    const earlyCss = fs.readFileSync(path.join(repoRoot, 'extension', 'early.css'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    const offenders = [];
    for (const [, selectors, body] of earlyCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/display\s*:\s*none/i.test(body)) continue;
        for (const selector of selectors.split(',')) {
            const subject = selector.trim().split(/\s+/).pop() || '';
            if (/^ytd-continuation-item-renderer\b/.test(subject)) offenders.push(selector.trim());
        }
    }
    assert.deepEqual(offenders, []);
    assert.match(earlyCss, /ytd-continuation-item-renderer\.style-scope\.ytd-rich-grid-renderer\s*\{\s*visibility:\s*hidden/,
        'the grid spinner stays hidden without losing its box');
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

test('peeled feature runtimes delegate compact-count parsing to the shared core helper', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
    const subscriptionGroups = fs.readFileSync(
        path.join(repoRoot, 'extension', 'features', 'subscription-groups', 'index.js'), 'utf8'
    );
    const videoHider = fs.readFileSync(
        path.join(repoRoot, 'extension', 'features', 'video-hider', 'index.js'), 'utf8'
    );
    assert.match(subscriptionGroups, /globalThis\.YTKitCore && globalThis\.YTKitCore\.parseCompactCount/,
        'Subscription Groups compact-count parsing must delegate to core/text-metrics.js');
    assert.match(videoHider, /globalThis\.YTKitCore && globalThis\.YTKitCore\.parseCompactCount/,
        'the peeled Video Hider compact-count method must delegate to core/text-metrics.js');
    assert.doesNotMatch(src, /_parseCompactViewCount/,
        'the monolith must not retain the peeled Subscription Groups parser');
});

test('settings search escapes literal filter text', () => {
    for (const rel of ['extension/features/settings-panel/index.js']) {
        const src = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
        assert.match(src, /new RegExp\(escapeRegExp\(q\), 'u'\)/,
            `${rel} must escape the user-supplied search query before matching`);
    }
});

// Shared by Video Hider and Watch Feed: a 2026-09 lockup says it is upcoming
// only in words. Accents and Hangul survive the fold.
test('isUpcomingCardText reads upcoming wording in every shipped language', () => {
    const { isUpcomingCardText } = loadCore();
    for (const text of [
        'Upcoming 9 waiting Scheduled for 10/7/26, 7:45 AM',
        'Premieres 10/10/26, 12:00 PM',
        'Programado para mañana · Establecer recordatorio',
        'Première prévue pour demain',
        '配信予定 · リマインダーを設定',
        '예정 · 알림 설정',
        'مجدول · تعيين تذكير',
        'Премьера состоится завтра',
        'Waiting for the creator',
        'Live in 45 minutes',
        'Starts in 2 hours',
        'Comienza en 5 minutos',
        'قادم',
        '예약됨',
        '5분 후 시작',
        // Folding strips Arabic hamza and keeps kana voicing marks, on the
        // card text and the pattern alike.
        'リマインダー',
        '開始まで 2 時間',
        'يبدأ خلال ساعة'
    ]) assert.equal(isUpcomingCardText(text), true, text);
    for (const text of ['Mix · Cyndi Lauper, Rick Astley, a-ha, and more', '1.1M views 6d ago', '4:12', '', null]) {
        assert.equal(isUpcomingCardText(text), false, String(text));
    }
});

// A match hides the card, and the rows include the channel byline.
test('isUpcomingCardText never reads a finished premiere or a channel name as upcoming', () => {
    const { isUpcomingCardText } = loadCore();
    for (const text of [
        'Premiered 7 hours ago',
        'Premiere Gal',
        'Live in the Studio',
        'Streamed live 3 hours ago',
        'Se estrenó hace 2 horas',
        'Премьера состоялась',
        'プレミア公開: 2 時間前',
        '首播于 2 小时前',
        'العرض الأول',
        // Channel names a 2026-10-09 review read as upcoming: a bare "starts
        // in" phrase, a booking word, and the Arabic badge word inside a name.
        'Life Starts In Kitchen',
        'Todo comienza en casa',
        'قناة الجيل القادم',
        '예약왕'
    ]) assert.equal(isUpcomingCardText(text), false, text);
});

// The readers skip the channel byline, because some names can't be told
// from a badge word ("Le meilleur est à venir").
test('cardTextWithoutByline drops a lockup byline row and a meta block channel name', () => {
    const { cardTextWithoutByline } = loadCore();
    const el = (tag, attrs = {}, children = []) => {
        const node = {
            tagName: tag.toUpperCase(), attrs, children, parent: null,
            get textContent() { return this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join(''); },
            matches(selector) {
                return selector.split(',').some((one) => {
                    const s = one.trim();
                    if (s.startsWith('.')) return String(attrs.class || '').split(' ').includes(s.slice(1));
                    if (s.startsWith('#')) return attrs.id === s.slice(1);
                    if (s === '[aria-label]') return 'aria-label' in attrs;
                    return s.toUpperCase() === this.tagName;
                });
            },
            closest(selector) {
                for (let n = this; n; n = n.parent) if (n.matches(selector)) return n;
                return null;
            },
            querySelectorAll(selector) {
                const found = [];
                const walk = (n) => n.children.forEach((c) => {
                    if (typeof c === 'string') return;
                    if (c.matches(selector)) found.push(c);
                    walk(c);
                });
                walk(this);
                return found;
            },
            querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        };
        for (const child of children) if (typeof child !== 'string') child.parent = node;
        return node;
    };
    const span = (text, label) => el('span', { class: 'ytContentMetadataViewModelMetadataText', ...(label ? { 'aria-label': label } : {}) }, [text]);
    const row = (...spans) => el('div', { class: 'ytContentMetadataViewModelMetadataRow' }, spans);

    // The 2026-10 lockup shape (tests/fixtures/feed-card-layouts-2026-10.html).
    const channel = span('Le meilleur est à venir');
    const views = span('412M', '412 million views');
    const model = el('yt-content-metadata-view-model', {}, [row(channel), row(views, span('17y ago', '17 years ago'))]);
    assert.equal(cardTextWithoutByline(channel), '');
    assert.equal(cardTextWithoutByline(channel.parent), '');
    assert.doesNotMatch(cardTextWithoutByline(model), /venir/);
    assert.match(cardTextWithoutByline(model), /412M/);
    assert.equal(cardTextWithoutByline(views), '412M');

    // A channel page prints no byline: its only row is the schedule.
    const scheduled = span('Scheduled for 10/7/26, 7:45 AM');
    const channelPage = el('yt-content-metadata-view-model', {}, [row(span('9 waiting', '9 waiting'), scheduled)]);
    assert.match(cardTextWithoutByline(channelPage), /Scheduled for/);
    assert.match(cardTextWithoutByline(scheduled), /Scheduled for/);

    // The legacy meta block names the channel in ytd-channel-name.
    const name = el('ytd-channel-name', {}, ['Le meilleur est à venir']);
    const block = el('ytd-video-meta-block', {}, [el('div', { id: 'byline-container' }, [name]), el('div', { id: 'metadata-line' }, ['3 days ago'])]);
    assert.doesNotMatch(cardTextWithoutByline(block), /venir/);
    assert.match(cardTextWithoutByline(block), /3 days ago/);
    assert.equal(cardTextWithoutByline(name), '');
    assert.equal(cardTextWithoutByline(null), '');
});
