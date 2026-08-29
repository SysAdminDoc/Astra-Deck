'use strict';

// Userscript/extension parity, proved by running BOTH vehicles.
//
// This file used to be 55 regex pins on `YTKit.user.js` and `extension/ytkit.js`
// with no behavioural coverage at all. A pin cannot tell a working feature from
// a broken one — `tests/helpers/monolith.js` records the comment-filter
// dispatcher bug that shipped past a pin matching the broken code exactly — and
// for parity specifically a pin is weaker still: two vehicles can both match the
// same regex and still emit different CSS. So every claim here now loads the
// feature or the function and compares what it produces.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const {
    loadFeature,
    loadFallbackFeature,
    loadUserscriptFeature,
    loadDeclarations,
    loadUserscriptDeclarations,
    fakeNode,
    fakeTreeDocument,
} = require('./helpers/monolith');
const { config } = require('./helpers/source');
const { createVideoNotesFeature } = require('../extension/features/video-notes/index.js');

const repoRoot = path.join(__dirname, '..');
const userscriptSource = fs.readFileSync(path.join(repoRoot, 'YTKit.user.js'), 'utf8');

const normalizeCss = (value) => String(value).replace(/\s+/g, ' ').trim();

/** Drive one feature's `_apply()` and return the CSS it injected. */
function applyCss(load, id, settings) {
    const injected = [];
    const feature = load(id, {
        appState: { settings },
        injectStyle: (css) => {
            injected.push(css);
            return { remove() {}, set textContent(next) { injected.push(next); }, get textContent() { return injected[injected.length - 1]; } };
        },
    });
    feature._apply();
    assert.ok(injected.length > 0, `${id} must inject CSS when applied`);
    return normalizeCss(injected[injected.length - 1]);
}

/**
 * The extension keeps its route helpers in `extension/core/page.js`; the
 * userscript inlines them. Evaluating the core module is how the runtime gets
 * them, so it is how a parity check has to get them too.
 */
function loadExtensionCorePage() {
    const context = {
        URL,
        URLSearchParams,
        globalThis: null,
        location: { hostname: 'www.youtube.com', pathname: '/' },
    };
    context.window = { location: context.location };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync(path.join(repoRoot, 'extension', 'core', 'page.js'), 'utf8'),
        context,
        { filename: 'extension/core/page.js' }
    );
    return context.globalThis.YTKitCore;
}

test('userscript metadata and watch guards support youtu.be routes', () => {
    // `@match` is artifact metadata, not code: the userscript manager reads
    // this header, so the header itself is the contract.
    assert.match(userscriptSource, /^\/\/ @match\s+https:\/\/youtu\.be\/\*/m);

    // The route guard is code, so run it. Both vehicles must agree.
    const cases = [
        ['/watch?v=dQw4w9WgXcQ', 'www.youtube.com', true],
        ['/dQw4w9WgXcQ', 'youtu.be', true],
        ['/dQw4w9WgXcQ', 'www.youtu.be', true],
        ['/dQw4w9WgXcQ', 'www.youtube.com', false],
        ['/feed/subscriptions', 'www.youtube.com', false],
        ['/', 'youtu.be', false],
        ['/not-an-id', 'youtu.be', false],
    ];
    const vehicles = [
        ['extension', loadExtensionCorePage().isWatchPagePath],
        ['userscript', loadUserscriptDeclarations(
            ['WATCH_PAGE_VIDEO_ID_PATTERN', 'isYoutuBeHost', 'isWatchPagePath'],
            { window: { location: { pathname: '/', hostname: 'www.youtube.com' } } }
        ).isWatchPagePath],
    ];
    for (const [label, isWatchPagePath] of vehicles) {
        assert.equal(typeof isWatchPagePath, 'function', `${label} must expose isWatchPagePath`);
        for (const [pathname, host, expected] of cases) {
            assert.equal(isWatchPagePath(pathname, host), expected,
                `${label}: ${host}${pathname} must ${expected ? '' : 'not '}be a watch route`);
        }
    }
});

/** Fixtures for the comment handle revealer: one comment root, N author links. */
function handleRevealerFixture(hrefs) {
    class HTMLElementStub {}
    class HTMLAnchorElementStub extends HTMLElementStub {}

    const documentRef = fakeTreeDocument(() => null);
    const authors = hrefs.map((href) => {
        const author = Object.assign(Object.create(HTMLAnchorElementStub.prototype), fakeNode({ tag: 'a' }));
        author.href = href;
        author.isConnected = true;
        author.querySelector = () => null;
        return author;
    });
    const commentRoot = Object.assign(Object.create(HTMLElementStub.prototype), fakeNode({ tag: 'ytd-comment-view-model' }));
    commentRoot.querySelectorAll = () => authors;
    const pageManager = Object.assign(Object.create(HTMLElementStub.prototype), fakeNode({ tag: 'div' }));
    pageManager.matches = () => false;
    pageManager.querySelectorAll = () => [commentRoot];

    const timeouts = [];
    const fetches = [];
    const globals = {
        document: Object.assign(documentRef, {
            getElementById: (id) => (id === 'page-manager' ? pageManager : null),
            querySelectorAll: () => [],
        }),
        location: { origin: 'https://www.youtube.com' },
        URL,
        HTMLElement: HTMLElementStub,
        HTMLAnchorElement: HTMLAnchorElementStub,
        MutationObserver: class { observe() {} disconnect() {} },
        waitForElement: () => () => {},
        setTimeout: (fn, delay) => { timeouts.push({ fn, delay }); return timeouts.length; },
        clearTimeout: () => {},
        fetch: (url, options) => new Promise((resolve) => {
            fetches.push({
                url,
                options,
                settle: (body) => resolve({ ok: true, text: async () => body }),
            });
        }),
    };
    return { globals, authors, timeouts, fetches };
}

test('comment handle revealer deduplicates authors, bounds requests, and aborts on teardown', async () => {
    for (const [label, load] of [['extension', loadFeature], ['userscript', loadUserscriptFeature]]) {
        const fixture = handleRevealerFixture([
            'https://www.youtube.com/@astra',
            'https://www.youtube.com/@astra/',
            'https://www.youtube.com/@other',
            'https://www.youtube.com/@third',
        ]);
        const feature = load('enableHandleRevealer', fixture.globals);
        feature.init();

        // Two anchors point at the same channel once trailing slashes are
        // normalised, so the channel page is fetched once, not twice.
        assert.equal(fixture.fetches.length, 3,
            `${label}: one request per distinct channel, not per anchor`);

        // Every in-flight request carries an abort signal and an 8s deadline.
        for (const call of fixture.fetches) {
            assert.equal(call.options.credentials, 'same-origin', `${label}: requests stay first-party`);
            assert.ok(call.options.signal, `${label}: requests must be abortable`);
            assert.equal(call.options.signal.aborted, false, `${label}: not aborted before teardown`);
        }
        const deadlines = fixture.timeouts.filter((entry) => entry.delay === 8000);
        assert.equal(deadlines.length, 3, `${label}: each request must be bounded at 8s`);
        deadlines[1].fn();
        assert.equal(fixture.fetches[1].options.signal.aborted, true,
            `${label}: firing the deadline must abort that request`);

        // The resolved name reaches BOTH anchors that were waiting on it.
        fixture.fetches[0].settle('<meta property="og:title" content="Astra &amp; Deck">');
        await new Promise((resolve) => setImmediate(resolve));
        const [first, second, third] = fixture.authors;
        assert.equal(first.children[0]?.textContent, '( Astra & Deck )',
            `${label}: the requesting anchor is labelled and entities decoded`);
        assert.equal(second.children[0]?.textContent, '( Astra & Deck )',
            `${label}: the deduplicated anchor is labelled from the same response`);
        assert.equal(third.children.length, 0, `${label}: an unrelated channel is untouched`);

        // Teardown aborts what is still in flight — the third request, which
        // neither settled nor hit its deadline.
        assert.equal(fixture.fetches[2].options.signal.aborted, false,
            `${label}: the third request is still open before teardown`);
        feature.destroy();
        assert.equal(fixture.fetches[2].options.signal.aborted, true,
            `${label}: destroy() must abort in-flight requests`);
    }
});

test('the userscript reaches YouTube through the same page-manager wait as the extension', () => {
    for (const [label, load] of [['extension', loadFeature], ['userscript', loadUserscriptFeature]]) {
        const fixture = handleRevealerFixture([]);
        const waits = [];
        fixture.globals.document.getElementById = () => null;
        fixture.globals.waitForElement = (selector, callback, timeout) => {
            waits.push({ selector, callback, timeout });
            return () => waits.push({ cancelled: true });
        };
        const feature = load('enableHandleRevealer', fixture.globals);
        feature.init();
        assert.deepEqual(
            waits.map(({ selector, timeout }) => [selector, timeout]),
            [['#page-manager', 10000]],
            `${label}: a late page manager is waited for, bounded at 10s`
        );
        feature.destroy();
        assert.equal(waits[waits.length - 1].cancelled, true,
            `${label}: teardown cancels an outstanding wait`);
    }
});

test('the safe DOM and CSS parity batch emits identical CSS in both vehicles', () => {
    const cases = [
        ['titleCaseTransform', { titleCaseMode: 'capitalize' }, /text-transform: capitalize !important/],
        ['titleCaseTransform', { titleCaseMode: 'none' }, /text-transform: none !important/],
        ['customSelectionColor', { selectionColor: '#ff0000' }, /::selection \{ background: #ff0000/],
        ['videoRotation', { videoRotationAngle: 90 }, /transform: rotate\(90deg\) scale\(0\.5625\)/],
        ['videoRotation', { videoRotationAngle: 0 }, /transform: none !important/],
        ['videoRotation', { videoRotationAngle: 45 }, /transform: none !important/],
        ['videoFlip', { videoFlipMode: 'horizontal' }, /scale: -1 1 !important/],
        ['videoFlip', { videoFlipMode: 'none' }, /scale: 1 1 !important/],
    ];
    for (const [id, settings, expected] of cases) {
        const extensionCss = applyCss(loadFeature, id, settings);
        const userscriptCss = applyCss(loadUserscriptFeature, id, settings);
        assert.match(extensionCss, expected, `${id} ${JSON.stringify(settings)} must produce the documented CSS`);
        assert.equal(userscriptCss, extensionCss,
            `${id} ${JSON.stringify(settings)} must emit byte-identical CSS in both vehicles`);
    }
});

test('bypassPlaylistMode strips playlist parameters from thumbnail links', () => {
    for (const [label, load] of [['extension', loadFeature], ['userscript', loadUserscriptFeature]]) {
        const handlers = [];
        const documentRef = fakeTreeDocument(() => null);
        documentRef.addEventListener = (type, handler, capture) => handlers.push({ type, handler, capture });
        documentRef.removeEventListener = (type, handler) => {
            const index = handlers.findIndex((entry) => entry.handler === handler);
            if (index > -1) handlers.splice(index, 1);
        };
        const feature = load('bypassPlaylistMode', {
            document: documentRef,
            window: { location: { href: 'https://www.youtube.com/' } },
            URL,
        });
        feature.init();
        assert.equal(handlers.length, 1, `${label}: one delegated click listener`);
        assert.equal(handlers[0].capture, true, `${label}: the listener runs before YouTube's own`);

        const click = (href) => {
            const anchor = fakeNode({ tag: 'a' });
            anchor.href = href;
            anchor.closest = () => anchor;
            handlers[0].handler({ target: { closest: () => anchor } });
            return anchor.href;
        };
        assert.equal(
            click('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1&index=3&pp=abc'),
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            `${label}: list, index and pp are removed`
        );
        assert.equal(
            click('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42'),
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42',
            `${label}: a link with no playlist is left alone`
        );
        assert.equal(
            click('https://www.youtube.com/feed/subscriptions?list=PL1'),
            'https://www.youtube.com/feed/subscriptions?list=PL1',
            `${label}: non-watch routes keep their parameters`
        );

        feature.destroy();
        assert.equal(handlers.length, 0, `${label}: teardown removes the listener`);
    }
});

test('videoNotes ships its defaults and enforces its write-time caps', () => {
    // Defaults are data, so read them from the shipped defaults file.
    assert.equal(config.defaultSettings.videoNotes, false);
    assert.deepEqual(config.defaultSettings.videoNotesData, {});

    const vehicles = [
        ['extension module', (settings) => createVideoNotesFeature({ appState: { settings }, settingsManager: { save() {} } })],
        ['userscript', (settings) => loadUserscriptFeature('videoNotes', {
            appState: { settings },
            settingsManager: { save() {} },
            document: fakeTreeDocument(() => null),
        })],
    ];
    for (const [label, build] of vehicles) {
        const settings = { videoNotesData: {} };
        const feature = build(settings);

        assert.equal(feature._DATA_KEY, 'videoNotesData', `${label}: notes write to the declared key`);

        // Over-long notes are truncated rather than stored whole.
        const long = 'x'.repeat(feature._MAX_NOTE_CHARS + 500);
        const truncated = feature._writeNotes({ dQw4w9WgXcQ: { note: long, updatedAt: 1 } });
        assert.equal(truncated.dQw4w9WgXcQ.note.length, feature._MAX_NOTE_CHARS,
            `${label}: a note is capped at _MAX_NOTE_CHARS`);

        // More videos than the cap keeps the cap's worth, newest first.
        const many = {};
        for (let i = 0; i < feature._MAX_NOTES + 25; i += 1) {
            many[`vid${String(i).padStart(8, '0')}`] = { note: `note ${i}`, updatedAt: i + 1 };
        }
        const capped = feature._writeNotes(many);
        assert.equal(Object.keys(capped).length, feature._MAX_NOTES,
            `${label}: the store is capped at _MAX_NOTES videos`);
        assert.equal(settings.videoNotesData, capped, `${label}: the capped store is what is persisted`);

        // Junk keys and empty notes never reach storage.
        const filtered = feature._writeNotes({
            dQw4w9WgXcQ: { note: 'keep' },
            '../etc': { note: 'path' },
            bad: { note: 'too short an id' },
            blank: { note: '   ' },
        });
        assert.deepEqual(Object.keys(filtered), ['dQw4w9WgXcQ'],
            `${label}: only well-formed video ids with real text survive`);
    }
});

test('write-time caps for bookmarks and watch-history stores hold in both vehicles', () => {
    const names = [
        'UNSAFE_OBJECT_KEYS', 'isPlainObject', 'isSafeObjectKey', 'VIDEO_ID_PATTERN',
        'IMPORT_LIMITS', 'STORAGE_CAPS', 'formatLocalDateKey', 'sanitizeWatchTimeImportedEntries',
        'sanitizeTimestampBookmarks', 'sanitizeWatchProgressStore', 'sanitizeWatchTimeStats',
    ];
    for (const [label, load] of [['extension', loadDeclarations], ['userscript', loadUserscriptDeclarations]]) {
        const api = load(names);

        // Bookmarks: prototype keys refused, duplicate timestamps collapsed,
        // times floored, notes capped.
        const bookmarks = api.sanitizeTimestampBookmarks({
            dQw4w9WgXcQ: [
                { t: 12.7, n: 'a'.repeat(api.IMPORT_LIMITS.bookmarkNoteChars + 50), d: 5 },
                { t: 12, n: 'duplicate second' },
                { t: -1, n: 'negative' },
            ],
            __proto__: [{ t: 1 }],
            'not an id': [{ t: 1 }],
        });
        assert.deepEqual(Object.keys(bookmarks), ['dQw4w9WgXcQ'], `${label}: only real video ids survive`);
        assert.equal(bookmarks.dQw4w9WgXcQ.length, 1, `${label}: a duplicate second is dropped`);
        assert.equal(bookmarks.dQw4w9WgXcQ[0].t, 12, `${label}: times are floored to whole seconds`);
        assert.equal(bookmarks.dQw4w9WgXcQ[0].n.length, api.IMPORT_LIMITS.bookmarkNoteChars,
            `${label}: notes are capped at the declared limit`);

        // Watch progress: percentages clamped, stale entries dropped, store capped.
        const now = Date.UTC(2026, 7, 28);
        const progress = api.sanitizeWatchProgressStore({
            dQw4w9WgXcQ: { p: 250, t: now },
            aaaaaaaaaaa: { p: -20, t: now - 1000 },
            bbbbbbbbbbb: { p: 50, t: now - api.STORAGE_CAPS.watchProgressMaxAgeMs - 1 },
        }, now);
        assert.equal(progress.dQw4w9WgXcQ.p, 100, `${label}: percentages clamp at 100`);
        assert.equal(progress.aaaaaaaaaaa.p, 0, `${label}: percentages clamp at 0`);
        assert.equal(progress.bbbbbbbbbbb, undefined, `${label}: entries past the age cap are dropped`);

        const crowded = {};
        for (let i = 0; i < api.STORAGE_CAPS.watchProgressVideos + 10; i += 1) {
            crowded[`v${String(i).padStart(10, '0')}`] = { p: 10, t: now - i };
        }
        assert.equal(
            Object.keys(api.sanitizeWatchProgressStore(crowded, now)).length,
            api.STORAGE_CAPS.watchProgressVideos,
            `${label}: the progress store is capped`
        );

        // Watch-time stats: only day buckets inside the retention window, and
        // never a day that has not happened yet.
        const nowDate = new Date(now);
        const today = api.formatLocalDateKey(nowDate);
        const tomorrow = api.formatLocalDateKey(new Date(now + 24 * 60 * 60 * 1000));
        const stats = api.sanitizeWatchTimeStats({
            days: {
                [today]: 120,
                [tomorrow]: 60,
                '1999-01-01': 500,
                'not-a-date': 10,
            },
            total: -5,
        }, nowDate);
        assert.equal(stats.days[today], 120, `${label}: today's bucket is kept`);
        assert.equal(stats.days[tomorrow], undefined, `${label}: a future bucket is refused`);
        assert.equal(stats.days['1999-01-01'], undefined, `${label}: buckets past the retention window are dropped`);
        assert.equal(stats.days['not-a-date'], undefined, `${label}: malformed day keys are dropped`);
        assert.equal(stats.total, 0, `${label}: a negative total is normalised to zero`);
    }
});
