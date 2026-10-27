'use strict';

// antiTranslate on the cards and watch page YouTube renders in 2026: the
// lockup title is translated in its text AND its title attribute, so the
// original has to come from a lookup. These pin what gets written where, what
// never gets a request, and what a later change of mind puts back.

const test = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const path = require('node:path');

const { userscriptBundles } = require('./helpers/source');
const titles = require('../extension/core/original-titles.js');
const { parseLockupChannels } = require('../extension/core/feed-prefilter.js');
const { createAntiTranslateFeatures } = require('../extension/features/anti-translate/index.js');
const schema = require('../extension/core/settings-schema.js');

const repoRoot = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

const VIDEO = 'dQw4w9WgXcQ';
const OTHER = 'aaaaaaaaaaa';
const CHANNEL = 'UCuAXFkgsw1L7xaCfnd5JJOw';
const SECOND_CHANNEL = 'UCaF7r2AiXRzA-yuq0B3ZDcA';

// A small DOM. The shared fakeNode can't evaluate `:not(.class)` or `*=`, and
// a selector it can't read must fail loudly here, never match nothing.
function matchesCompound(el, text) {
    const token = /(^[A-Za-z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:([*^$]?=)"([^"]*)")?\]|:not\(([^()]+)\)/g;
    let consumed = 0;
    const checks = [];
    for (let match = token.exec(text); match; match = token.exec(text)) {
        if (match.index !== consumed) break;
        consumed = token.lastIndex;
        if (match[1]) checks.push(() => el.tagName === match[1].toUpperCase());
        else if (match[2]) checks.push(() => el.getAttribute('id') === match[2]);
        else if (match[3]) checks.push(() => el.classes().includes(match[3]));
        else if (match[4]) {
            const [name, op, value] = [match[4], match[5], match[6]];
            checks.push(() => {
                const actual = el.getAttribute(name);
                if (actual === null) return false;
                if (!op) return true;
                if (op === '=') return actual === value;
                if (op === '*=') return actual.includes(value);
                if (op === '^=') return actual.startsWith(value);
                return actual.endsWith(value);
            });
        } else checks.push(() => !matchesCompound(el, match[7]));
    }
    if (consumed !== text.length) throw new Error(`test DOM cannot read selector '${text}'`);
    return checks.every((check) => check());
}

function matchesSelector(el, selector) {
    return String(selector).split(',').some((part) => {
        const compounds = part.trim().split(/\s+/);
        if (!matchesCompound(el, compounds.at(-1))) return false;
        let at = el.parentElement;
        for (let index = compounds.length - 2; index >= 0; index -= 1) {
            while (at && !matchesCompound(at, compounds[index])) at = at.parentElement;
            if (!at) return false;
            at = at.parentElement;
        }
        return true;
    });
}

class El {
    constructor(tag, attributes = {}, children = [], text = '') {
        this.tagName = tag.toUpperCase();
        this.attributes = new Map(Object.entries(attributes));
        this.children = [];
        this.parentElement = null;
        this._text = text;
        this._root = false;
        children.forEach((child) => this.append(child));
    }
    append(child) { child.parentElement = this; this.children.push(child); return child; }
    remove() {
        const siblings = this.parentElement?.children;
        if (siblings) siblings.splice(siblings.indexOf(this), 1);
        this.parentElement = null;
    }
    classes() { return String(this.getAttribute('class') || '').split(/\s+/).filter(Boolean); }
    get isConnected() { return this._root || Boolean(this.parentElement?.isConnected); }
    get previousElementSibling() {
        const siblings = this.parentElement?.children || [];
        const at = siblings.indexOf(this);
        return at > 0 ? siblings[at - 1] : null;
    }
    get textContent() { return this.children.reduce((text, child) => text + child.textContent, this._text); }
    set textContent(value) {
        this.children.forEach((child) => { child.parentElement = null; });
        this.children = [];
        this._text = String(value);
    }
    get title() { return this.getAttribute('title') || ''; }
    set title(value) { this.setAttribute('title', value); }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    hasAttribute(name) { return this.attributes.has(name); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    matches(selector) { return matchesSelector(this, selector); }
    closest(selector) {
        for (let at = this; at; at = at.parentElement) if (at.matches(selector)) return at;
        return null;
    }
    querySelectorAll(selector) {
        const found = [];
        const walk = (node) => node.children.forEach((child) => {
            if (child.matches(selector)) found.push(child);
            walk(child);
        });
        walk(this);
        return found;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function lockupCard(videoId, translated, { tags = null, channelLink = null, href = `/watch?v=${videoId}` } = {}) {
    const span = new El('span', { class: 'yt-core-attributed-string' }, [], translated);
    const anchor = new El('a', {
        class: 'yt-lockup-metadata-view-model__title ytLockupMetadataViewModelTitle',
        href,
        'aria-label': `${translated} 12 minutes`
    }, [span]);
    const heading = new El('h3', { class: 'yt-lockup-metadata-view-model__heading-reset', title: translated }, [anchor]);
    const metadata = [heading];
    if (channelLink) metadata.push(new El('a', { href: `/channel/${channelLink}` }, [], 'Channel'));
    const lockup = new El('yt-lockup-view-model', tags ? { 'data-ytkit-lockup-channels': tags } : {}, [
        new El('div', { class: 'yt-lockup-metadata-view-model' }, metadata)
    ]);
    return { lockup, anchor, heading, span };
}

function response(status, body = '') {
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: { get: () => null },
        text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
    };
}

function oEmbed(title, author = `/channel/${CHANNEL}`) {
    return { title, author_name: 'Uploader', author_url: `https://www.youtube.com${author}` };
}

const flush = async () => {
    for (let turn = 0; turn < 8; turn += 1) await new Promise((resolve) => setImmediate(resolve));
};

function setup({ answer = () => response(200, oEmbed('Original')), page = '/', videoId = VIDEO, player = null, exceptions = '', clientVersion = '2.20261020.01.00' } = {}) {
    const html = new El('html');
    html._root = true;
    const body = html.append(new El('body'));
    const calls = [];
    const navigateRules = new Map();
    const env = {
        calls,
        body,
        html,
        videoId,
        page,
        player,
        navigate: () => navigateRules.get('antiTranslate')?.()
    };
    const settings = { antiTranslateChannelExceptions: exceptions };
    const [feature, exceptionsFeature] = createAntiTranslateFeatures({
        documentRef: {
            documentElement: html,
            body,
            querySelectorAll: (selector) => html.querySelectorAll(selector),
            querySelector: (selector) => html.querySelector(selector)
        },
        readSetting: (key) => settings[key],
        isWatchPage: () => env.page === '/watch',
        getVideoId: () => env.videoId,
        getPlayerResponse: () => env.player,
        fetchImpl: (url, init) => {
            calls.push({ url, init });
            return Promise.resolve().then(() => answer(url, init));
        },
        getClientVersion: () => clientVersion,
        getApiKey: () => 'AIzaSyTESTKEY000000000000000000000000',
        publishBridgeAttribute: (name, value) => html.setAttribute(name, value),
        // Passes are driven by hand. The feature's own timers would only
        // schedule the same `_process()` later.
        setTimeoutFn: () => 1,
        clearTimeoutFn() {},
        addNavigateRule: (id, handler) => navigateRules.set(id, handler),
        removeNavigateRule: (id) => navigateRules.delete(id),
        createOriginalTitleResolver: titles.createOriginalTitleResolver,
        parseChannelExceptions: titles.parseChannelExceptions,
        titlesDiffer: titles.titlesDiffer,
        parseLockupChannels
    });
    env.feature = feature;
    env.exceptionsFeature = exceptionsFeature;
    env.settings = settings;
    env.pass = async () => { feature._process(); await flush(); };
    feature.init();
    return env;
}

test('a translated lockup gets its original title, attributes and all, from one request', async () => {
    const env = setup();
    const card = lockupCard(VIDEO, 'Nunca te voy a abandonar');
    env.body.append(card.lockup);
    await env.pass();

    assert.equal(card.span.textContent, 'Original');
    assert.equal(card.heading.getAttribute('title'), 'Original', 'the hover title is the original too');
    assert.equal(card.anchor.getAttribute('aria-label'), 'Original 12 minutes', 'a screen reader hears the original');
    assert.equal(card.anchor.getAttribute('ytkit-antitranslate'), VIDEO);
    assert.equal(env.calls.length, 1);
    assert.match(env.calls[0].url, /^https:\/\/www\.youtube\.com\/oembed\?url=/);
    assert.equal(env.calls[0].init.credentials, 'omit');

    await env.pass();
    await env.pass();
    assert.equal(env.calls.length, 1, 'later passes are answered from the cache');
    assert.equal(card.span.textContent, 'Original');
    env.feature.destroy();
});

test('an older card with the original in its title attribute costs no request, then or later', async () => {
    const env = setup();
    const legacy = new El('a', { id: 'video-title', href: `/watch?v=${VIDEO}`, title: 'Original' }, [], 'Traducido');
    env.body.append(new El('ytd-video-renderer', {}, [legacy]));
    await env.pass();
    assert.equal(legacy.textContent, 'Original');
    await env.pass();
    await env.pass();
    assert.equal(env.calls.length, 0);
    env.feature.destroy();
});

test('the watch title takes the player response only when it describes this video', async () => {
    const env = setup({ page: '/watch', player: { videoDetails: { videoId: VIDEO, title: 'Player original', channelId: CHANNEL } } });
    const heading = new El('yt-formatted-string', {}, [], 'Traducido');
    env.body.append(new El('ytd-watch-metadata', {}, [new El('h1', {}, [heading])]));
    await env.pass();
    assert.equal(heading.textContent, 'Player original');
    assert.equal(env.calls.length, 0, 'the page already had it');

    // An in-app navigation leaves the first video's response behind.
    env.videoId = OTHER;
    heading.textContent = 'Otro traducido';
    env.navigate();
    await env.pass();
    assert.equal(heading.textContent, 'Original', 'oEmbed, not the stale player title');
    assert.equal(env.calls.length, 1);
    assert.match(decodeURIComponent(env.calls[0].url), new RegExp(`v=${OTHER}`));
    env.feature.destroy();
});

test('the description is left alone when the player response is for another video', async () => {
    const env = setup({ page: '/watch', videoId: OTHER, player: { videoDetails: { videoId: VIDEO, title: 'T', shortDescription: 'An original description that is comfortably longer than forty characters.' } } });
    const description = new El('yt-attributed-string', {}, [], 'Una descripcion traducida que tambien es bastante larga.');
    env.body.append(new El('div', { id: 'description-inline-expander' }, [description]));
    await env.pass();
    assert.equal(description.textContent, 'Una descripcion traducida que tambien es bastante larga.');

    env.videoId = VIDEO;
    await env.pass();
    assert.equal(description.textContent, 'An original description that is comfortably longer than forty characters.');
    env.feature.destroy();
});

test('a late answer is not written onto a card YouTube reused for another video', async () => {
    let release = null;
    const env = setup({ answer: () => new Promise((resolve) => { release = () => resolve(response(200, oEmbed('Original'))); }) });
    const card = lockupCard(VIDEO, 'Traducido');
    env.body.append(card.lockup);
    env.feature._process();
    await flush();
    card.anchor.setAttribute('href', `/watch?v=${OTHER}`);
    card.span.textContent = 'Some other video';
    release();
    await flush();
    assert.equal(card.span.textContent, 'Some other video');
    assert.equal(card.anchor.hasAttribute('ytkit-antitranslate'), false);
    env.feature.destroy();
});

test('a navigation drops the answer for the page the viewer left', async () => {
    let release = null;
    const env = setup({ answer: () => new Promise((resolve) => { release = () => resolve(response(200, oEmbed('Original'))); }) });
    const card = lockupCard(VIDEO, 'Traducido');
    env.body.append(card.lockup);
    env.feature._process();
    await flush();
    env.navigate();
    release();
    await flush();
    assert.equal(card.span.textContent, 'Traducido');
    env.feature.destroy();
});

test('an excepted channel named by the lockup tags costs no request', async () => {
    const env = setup({ exceptions: CHANNEL });
    const card = lockupCard(VIDEO, 'Traducido', { tags: `${VIDEO};${CHANNEL}` });
    env.body.append(card.lockup);
    await env.pass();
    assert.equal(card.span.textContent, 'Traducido');
    assert.equal(env.calls.length, 0);
    assert.equal(env.html.getAttribute('data-ytkit-lockup-channels-titles'), 'on', 'the MAIN world tags lockups while an exception needs it');

    env.settings.antiTranslateChannelExceptions = '';
    await env.pass();
    assert.equal(env.html.getAttribute('data-ytkit-lockup-channels-titles'), 'off');
    assert.equal(card.span.textContent, 'Original', 'no longer excepted');
    env.feature.destroy();
    assert.equal(env.html.getAttribute('data-ytkit-lockup-channels-titles'), 'off');
});

test('tags for a different video never decide the exception', async () => {
    const env = setup({ exceptions: CHANNEL, answer: () => response(200, oEmbed('Original', `/channel/${SECOND_CHANNEL}`)) });
    const card = lockupCard(VIDEO, 'Traducido', { tags: `${OTHER};${CHANNEL}` });
    env.body.append(card.lockup);
    await env.pass();
    assert.equal(card.span.textContent, 'Original');
    env.feature.destroy();
});

test('a /channel/ link on the card is enough to except it', async () => {
    const env = setup({ exceptions: `https://www.youtube.com/channel/${CHANNEL}` });
    const card = lockupCard(VIDEO, 'Traducido', { channelLink: CHANNEL });
    env.body.append(card.lockup);
    await env.pass();
    assert.equal(card.span.textContent, 'Traducido');
    assert.equal(env.calls.length, 0);
    env.feature.destroy();
});

test('the oEmbed channel decides when the card names none', async () => {
    const env = setup({ exceptions: CHANNEL });
    const card = lockupCard(VIDEO, 'Traducido');
    env.body.append(card.lockup);
    await env.pass();
    assert.equal(env.calls.length, 1);
    assert.equal(card.span.textContent, 'Traducido');
    env.feature.destroy();
});

test('a channel added to the exceptions later gets its translated title back', async () => {
    const env = setup();
    const card = lockupCard(VIDEO, 'Traducido');
    env.body.append(card.lockup);
    await env.pass();
    assert.equal(card.span.textContent, 'Original');

    env.settings.antiTranslateChannelExceptions = CHANNEL;
    await env.pass();
    assert.equal(card.span.textContent, 'Traducido');
    assert.equal(card.heading.getAttribute('title'), 'Traducido');
    assert.equal(card.anchor.getAttribute('aria-label'), 'Traducido 12 minutes');
    assert.equal(card.anchor.hasAttribute('ytkit-antitranslate'), false);
    assert.equal(env.calls.length, 1, 'the cached record named the channel');
    env.feature.destroy();
});

test('a handle seen in one card\'s tags excepts another card that oEmbed names by handle', async () => {
    const env = setup({ exceptions: CHANNEL, answer: () => response(200, oEmbed('Original', '/@SomeHandle')) });
    const tagged = lockupCard(OTHER, 'Uno', { tags: `${OTHER};${CHANNEL}@SomeHandle` });
    const untagged = lockupCard(VIDEO, 'Dos');
    env.body.append(tagged.lockup);
    env.body.append(untagged.lockup);
    await env.pass();
    assert.equal(tagged.span.textContent, 'Uno');
    assert.equal(untagged.span.textContent, 'Dos');
    assert.equal(env.calls.length, 1, 'only the untagged card needed a lookup');
    env.feature.destroy();
});

test('turning it off aborts what is in flight and puts every translated title back', async () => {
    let signal = null;
    const env = setup({
        answer: (url, init) => {
            if (decodeURIComponent(url).includes(OTHER)) {
                signal = init.signal;
                return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
            }
            return response(200, oEmbed('Original'));
        }
    });
    const done = lockupCard(VIDEO, 'Traducido');
    const pending = lockupCard(OTHER, 'Pendiente');
    env.body.append(done.lockup);
    env.body.append(pending.lockup);
    await env.pass();
    assert.equal(done.span.textContent, 'Original');

    env.feature.destroy();
    await flush();
    assert.equal(signal.aborted, true);
    assert.equal(done.span.textContent, 'Traducido');
    assert.equal(done.heading.getAttribute('title'), 'Traducido');
    assert.equal(done.anchor.getAttribute('aria-label'), 'Traducido 12 minutes');
    assert.equal(done.anchor.hasAttribute('ytkit-antitranslate'), false);
    assert.equal(pending.span.textContent, 'Pendiente');

    const before = env.calls.length;
    env.feature._process();
    await flush();
    assert.equal(env.calls.length, before, 'nothing goes out once it is off');
});

test('offline, a feed of passes makes one request per video', async () => {
    const env = setup({ answer: () => { throw new TypeError('Failed to fetch'); } });
    const card = lockupCard(VIDEO, 'Traducido');
    env.body.append(card.lockup);
    for (let pass = 0; pass < 5; pass += 1) await env.pass();
    assert.equal(env.calls.length, 1);
    assert.equal(card.span.textContent, 'Traducido');
    env.feature.destroy();
});

test('one pass starts a bounded number of lookups', async () => {
    const env = setup({ answer: () => new Promise(() => {}) });
    for (let index = 0; index < 40; index += 1) {
        env.body.append(lockupCard(`vid${String(index).padStart(8, '0')}`, `Traducido ${index}`).lockup);
    }
    env.feature._process();
    await flush();
    const stats = env.feature._resolver.stats();
    assert.equal(stats.active + stats.queued, 24);
    env.feature.destroy();
});

test('with DeArrow on, its crowd title stays and the original behind it changes', async () => {
    const env = setup();
    const card = lockupCard(VIDEO, 'Traducido');
    const crowd = new El('a', {
        class: 'yt-lockup-metadata-view-model__title ytLockupMetadataViewModelTitle daCustomTitle',
        href: `/watch?v=${VIDEO}`,
        'data-ytkit-dearrow-title': '1',
        'data-ytkit-orig-title': 'Traducido',
        title: 'Traducido'
    }, [], 'Crowd title');
    card.heading.children.unshift(crowd);
    crowd.parentElement = card.heading;
    env.body.append(card.lockup);
    await env.pass();

    assert.equal(crowd.textContent, 'Crowd title');
    assert.equal(crowd.hasAttribute('ytkit-antitranslate'), false, 'the copy is never processed');
    assert.equal(crowd.getAttribute('data-ytkit-orig-title'), 'Original');
    assert.equal(crowd.getAttribute('data-ytkit-rendered-title'), 'Traducido');
    assert.equal(crowd.getAttribute('title'), 'Original', 'its hover offers the real original');
    assert.equal(card.span.textContent, 'Original', 'the hidden backing title');
    assert.equal(env.calls.length, 1);

    env.feature.destroy();
    assert.equal(crowd.getAttribute('data-ytkit-orig-title'), 'Traducido');
    assert.equal(crowd.hasAttribute('data-ytkit-rendered-title'), false);
    assert.equal(crowd.getAttribute('title'), 'Traducido');
});

// DeArrow copies whatever the heading shows when it draws, so drawing after
// the restore gives it the original and no record of what YouTube rendered.
function crowdCopy(card, origTitle) {
    const crowd = new El('a', {
        class: 'yt-lockup-metadata-view-model__title ytLockupMetadataViewModelTitle daCustomTitle',
        href: card.anchor.getAttribute('href'),
        'data-ytkit-dearrow-title': '1',
        'data-ytkit-orig-title': origTitle,
        title: origTitle
    }, [], 'Crowd title');
    card.heading.children.unshift(crowd);
    crowd.parentElement = card.heading;
    return crowd;
}

test('DeArrow drawing after the restore, or swapping its copy, still learns what YouTube rendered', async () => {
    const env = setup();
    const card = lockupCard(VIDEO, 'Traducido');
    env.body.append(card.lockup);
    await env.pass();
    assert.equal(card.span.textContent, 'Original');

    const first = crowdCopy(card, 'Original');
    await env.pass();
    assert.equal(first.getAttribute('data-ytkit-rendered-title'), 'Traducido', 'the tab-title sync can find the translation');

    first.remove();
    const second = crowdCopy(card, 'Original');
    await env.pass();
    assert.equal(second.getAttribute('data-ytkit-rendered-title'), 'Traducido');
    assert.equal(env.calls.length, 1);

    env.feature.destroy();
    assert.equal(second.getAttribute('data-ytkit-orig-title'), 'Traducido', 'teardown reaches the live copy, not the removed one');
    assert.equal(second.hasAttribute('data-ytkit-rendered-title'), false);
    assert.equal(second.getAttribute('title'), 'Traducido');
});

test('a Mix or playlist card is not given its first video\'s title', async () => {
    const env = setup();
    const mix = lockupCard(VIDEO, 'Mix - Traducido', { href: `/watch?v=${VIDEO}&list=RD${VIDEO}&start_radio=1` });
    env.body.append(mix.lockup);
    await env.pass();
    assert.equal(mix.span.textContent, 'Mix - Traducido');
    assert.equal(env.calls.length, 0);

    // A row inside the playlist itself is that one video.
    const row = new El('a', { id: 'video-title', href: `/watch?v=${VIDEO}&list=PLabc&index=2` }, [], 'Traducido');
    env.body.append(new El('ytd-playlist-panel-video-renderer', {}, [row]));
    await env.pass();
    assert.equal(row.textContent, 'Original');
    env.feature.destroy();
});

test('an exception for any channel named on a collab card keeps its translation', async () => {
    const env = setup({ exceptions: CHANNEL });
    const card = lockupCard(VIDEO, 'Traducido', { tags: `${VIDEO};${SECOND_CHANNEL};${CHANNEL}` });
    env.body.append(card.lockup);
    await env.pass();
    assert.equal(card.span.textContent, 'Traducido');
    assert.equal(env.calls.length, 0);
    env.feature.destroy();
});

test('turning it off puts the translated description back', async () => {
    const original = 'An original description that is comfortably longer than forty characters.';
    const env = setup({ page: '/watch', player: { videoDetails: { videoId: VIDEO, title: 'T', shortDescription: original } } });
    const description = new El('yt-attributed-string', {}, [], 'Una descripcion traducida que tambien es bastante larga.');
    env.body.append(new El('div', { id: 'description-inline-expander' }, [description]));
    await env.pass();
    assert.equal(description.textContent, original);
    env.feature.destroy();
    assert.equal(description.textContent, 'Una descripcion traducida que tambien es bastante larga.');
    assert.equal(description.hasAttribute('ytkit-antitranslate'), false);
});

test('a renderer that keeps putting the translation back gets three writes, not a loop', async () => {
    const env = setup();
    const card = lockupCard(VIDEO, 'Traducido');
    env.body.append(card.lockup);
    let writes = 0;
    for (let pass = 0; pass < 6; pass += 1) {
        await env.pass();
        if (card.span.textContent === 'Original') writes += 1;
        card.span.textContent = 'Traducido';
    }
    assert.equal(writes, 3);
    env.feature.destroy();
});

test('a 401 falls back to the player with the page\'s own client version', async () => {
    const env = setup({
        answer: (url, init) => {
            if (url.includes('/oembed')) return response(401, 'Unauthorized');
            return response(200, { videoDetails: { videoId: JSON.parse(init.body).videoId, title: 'Player original', channelId: CHANNEL } });
        }
    });
    const card = lockupCard(VIDEO, 'Traducido');
    env.body.append(card.lockup);
    await env.pass();
    assert.equal(card.span.textContent, 'Player original');
    const player = env.calls.find((call) => call.url.includes('/youtubei/v1/player'));
    assert.ok(player, 'a player request went out');
    assert.match(player.url, /\?key=AIzaSyTESTKEY0+&prettyPrint=false$/);
    assert.equal(player.init.credentials, 'omit');
    const sent = JSON.parse(player.init.body);
    assert.equal(sent.videoId, VIDEO);
    assert.equal(sent.context.client.clientVersion, '2.20261020.01.00');
    env.feature.destroy();
});

test('the exception list is a textarea under antiTranslate, empty by default, in both builds', () => {
    const env = setup();
    assert.equal(env.exceptionsFeature.parentId, 'antiTranslate');
    assert.equal(env.exceptionsFeature.type, 'textarea');
    assert.equal(env.exceptionsFeature.settingKey, 'antiTranslateChannelExceptions');
    const entry = schema.SETTINGS_SCHEMA.find((setting) => setting.key === 'antiTranslateChannelExceptions');
    assert.equal(entry.defaultValue, '');
    assert.equal(JSON.parse(read('extension/default-settings.json')).antiTranslateChannelExceptions, '');
    env.feature.destroy();

    const manifest = JSON.parse(read('extension/manifest.json'));
    const isolatedLists = [
        ...manifest.content_scripts.map((item) => item['x-ytkit-runtime-modules']).filter(Boolean),
        ...manifest.web_accessible_resources.map((item) => item.resources).filter((list) => list.includes('ytkit.js'))
    ];
    assert.equal(isolatedLists.length, 2);
    for (const list of isolatedLists) {
        for (const file of ['core/original-titles.js', 'features/anti-translate/index.js']) {
            assert.ok(list.indexOf(file) > -1 && list.indexOf(file) < list.indexOf('ytkit.js'), `${file} loads before ytkit.js`);
        }
    }
    assert.match(read('extension/ytkit.js'), /YTKitFeatures\?\.antiTranslate\?\.createAntiTranslateFeatures\?\.\(/);
    assert.ok(userscriptBundles('core/original-titles.js'), 'the userscript ships the lookup');
    assert.ok(userscriptBundles('features/anti-translate/index.js'), 'the userscript ships the feature');
});

test('no readable client version, no player request', async () => {
    const env = setup({ clientVersion: '', answer: () => response(401, 'Unauthorized') });
    const card = lockupCard(VIDEO, 'Traducido');
    env.body.append(card.lockup);
    await env.pass();
    assert.equal(env.calls.length, 1);
    assert.equal(card.span.textContent, 'Traducido');
    env.feature.destroy();
});
