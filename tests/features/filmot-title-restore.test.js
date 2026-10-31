'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createFilmotTitleRestoreFeature,
    isUnavailableRow,
    filmotVideoUrl
} = require('../../extension/features/filmot-title-restore/index.js');

const ID = (n) => String(n).padStart(11, 'x');

function makeLink() {
    const link = {
        children: [],
        append(child) { this.children.push(child); },
        remove() { this.removed = true; this.parent?.drop(this); },
        set innerHTML(_value) { throw new Error('API text must never become markup'); }
    };
    return link;
}

function makeRow(read) {
    const heading = {
        items: [],
        append(child) { child.parent = this; this.items.push(child); },
        drop(child) { this.items = this.items.filter((item) => item !== child); },
        querySelector() { return this.items[0] || null; }
    };
    return {
        read,
        dataset: {},
        heading,
        querySelector(selector) {
            return selector === 'h3' ? heading : heading.querySelector(selector);
        }
    };
}

const deadRow = (id) => makeRow({ videoId: id, title: '', channel: '', durationText: '' });

function setup({ rows = [], send = null, stored = {}, withSend = true } = {}) {
    const state = { rows, time: 1_000_000, timers: [], sent: [], written: null, health: [] };
    const deps = {
        DiagnosticLog: { record() {} },
        ExternalApiHealth: {
            recordSuccess(service) { state.health.push(['ok', service]); },
            recordFailure(service, error) { state.health.push(['fail', service, error?.code]); }
        },
        storageReadJSON: () => stored,
        storageWriteJSON: (_key, value) => { state.written = value; },
        readPlaylistPageRow: (row) => row.read,
        rowSelector: 'row',
        now: () => state.time,
        setTimer: (fn, ms) => { state.timers.push({ fn, ms }); return state.timers.length; },
        clearTimer: () => { state.timers.length = 0; },
        addScopedMutationRule: (_id, _selector, fn) => { state.rescan = fn; },
        addNavigateRule: () => {},
        getDocument: () => ({
            createElement: makeLink,
            querySelectorAll: (selector) => (selector === 'row'
                ? state.rows
                : state.rows.filter((row) => row.dataset.ytkitFilmot))
        })
    };
    if (withSend) {
        deps.sendRuntimeMessage = async (message) => {
            state.sent.push(message);
            return send(message);
        };
    }
    state.feature = createFilmotTitleRestoreFeature(deps);
    state.flush = async () => {
        const timer = state.timers.shift();
        if (timer) await timer.fn();
    };
    return state;
}

const answerWith = (titles = {}) => ({ ids }) => ({
    ok: true,
    videos: ids.filter((id) => titles[id]).map((id) => ({ id, title: titles[id], channel: 'Chan', date: '2013-01-02' }))
});

const slot = (row) => row.heading.items[0];

test('a row counts as unavailable only without a title, a channel and a duration', () => {
    assert.equal(isUnavailableRow({ videoId: ID(1), title: '', channel: '', durationText: '' }), true);
    assert.equal(isUnavailableRow({ videoId: ID(1), title: '[Deleted video]', channel: '', durationText: '' }), true);
    assert.equal(isUnavailableRow({ videoId: ID(1), title: '[Vidéo supprimée]', channel: '', durationText: '' }), true);
    assert.equal(isUnavailableRow({ videoId: ID(1), title: 'A video', channel: '', durationText: '' }), false);
    assert.equal(isUnavailableRow({ videoId: ID(1), title: '[Official Video]', channel: 'Someone', durationText: '' }), false);
    assert.equal(isUnavailableRow({ videoId: ID(1), title: '', channel: '', durationText: '3:12' }), false);
    assert.equal(isUnavailableRow({ videoId: '', title: '', channel: '', durationText: '' }), false);
    assert.equal(isUnavailableRow(null), false);
});

test('a looked-up title lands in the row as text, linked to its Filmot page', async () => {
    const title = '<img src=x onerror=alert(1)> Old upload';
    const row = deadRow(ID(1));
    const state = setup({ rows: [row], send: answerWith({ [ID(1)]: title }) });
    state.feature.init();
    assert.equal(row.dataset.ytkitFilmot, 'pending');
    await state.flush();

    assert.deepEqual(state.sent, [{ type: 'YTKIT_FILMOT_LOOKUP', ids: [ID(1)] }]);
    assert.equal(row.dataset.ytkitFilmot, 'restored');
    assert.equal(slot(row).textContent, title);
    assert.equal(slot(row).href, filmotVideoUrl(ID(1)));
    assert.equal(slot(row).rel, 'noopener noreferrer');
    assert.equal(slot(row).children[0].textContent, 'Chan · 2013-01-02');
    assert.ok(state.written[ID(1)].title === title, 'the title goes in the cache');
    assert.deepEqual(state.health, [['ok', 'filmot']]);
});

test('normal rows are left alone and cost nothing', async () => {
    const row = makeRow({ videoId: ID(1), title: 'Live video', channel: 'Chan', durationText: '3:12' });
    const state = setup({ rows: [row], send: answerWith() });
    state.feature.init();
    await state.flush();
    assert.equal(state.sent.length, 0);
    assert.equal(row.dataset.ytkitFilmot, undefined);
});

test('the userscript, with no vault to ask, links every row', async () => {
    const row = deadRow(ID(1));
    const state = setup({ rows: [row], withSend: false });
    state.feature.init();
    await state.flush();
    assert.equal(row.dataset.ytkitFilmot, 'link');
    assert.equal(slot(row).href, filmotVideoUrl(ID(1)));
    assert.deepEqual(state.health, []);
});

test('no key means links from then on, with no further requests and no alarm', async () => {
    const first = deadRow(ID(1));
    const state = setup({ rows: [first], send: () => ({ ok: false, error: { code: 'CREDENTIAL_MISSING' } }) });
    state.feature.init();
    await state.flush();
    assert.equal(first.dataset.ytkitFilmot, 'link');
    assert.equal(state.timers.length, 0, 'the settled row left nothing to retry');

    state.rows.push(deadRow(ID(2)));
    state.rescan();
    await state.flush();
    assert.equal(state.sent.length, 1);
    assert.equal(state.rows[1].dataset.ytkitFilmot, 'link');
    assert.deepEqual(state.health, []);
});

test('a key Filmot refuses stops spending and says so in the health log', async () => {
    const state = setup({
        rows: [deadRow(ID(1))],
        send: () => ({ ok: false, error: { code: 'FILMOT_REJECTED_KEY', status: 401 } })
    });
    state.feature.init();
    await state.flush();
    state.rows.push(deadRow(ID(2)));
    state.rescan();
    await state.flush();
    assert.equal(state.sent.length, 1);
    assert.equal(state.rows[1].dataset.ytkitFilmot, 'link');
    assert.deepEqual(state.health, [['fail', 'filmot', 'FILMOT_REJECTED_KEY']]);
});

test('an outage pauses lookups for a while, then they come back', async () => {
    let healthy = false;
    const state = setup({
        rows: [deadRow(ID(1))],
        send: (message) => (healthy
            ? answerWith({ [ID(3)]: 'Back' })(message)
            : { ok: false, error: { code: 'FILMOT_FAILED', status: 429 } })
    });
    state.feature.init();
    await state.flush();
    assert.equal(state.rows[0].dataset.ytkitFilmot, 'link');

    state.rows.push(deadRow(ID(2)));
    state.rescan();
    await state.flush();
    assert.equal(state.sent.length, 1, 'still paused');
    assert.equal(state.rows[1].dataset.ytkitFilmot, 'link');

    healthy = true;
    state.time += 5 * 60 * 1000 + 1;
    state.rows.push(deadRow(ID(3)));
    state.rescan();
    await state.flush();
    assert.equal(state.sent.length, 2);
    assert.equal(state.rows[2].dataset.ytkitFilmot, 'restored');
});

test('moving to another playlist during an outage does not end the pause', async () => {
    const state = setup({
        rows: [deadRow(ID(1))],
        send: () => ({ ok: false, error: { code: 'FILMOT_FAILED', status: 429 } })
    });
    state.feature.init();
    await state.flush();
    state.feature.destroy();

    state.rows = [deadRow(ID(2))];
    state.feature.init();
    await state.flush();
    assert.equal(state.sent.length, 1);
    assert.equal(state.rows[0].dataset.ytkitFilmot, 'link');
});

test('the cache keeps its newest entries when it fills up', async () => {
    const stored = {};
    for (let i = 0; i < 2000; i += 1) stored[`old${String(i).padStart(8, '0')}`] = { ts: 500_000 + i, title: 'Old' };
    const state = setup({ rows: [deadRow(ID(1))], stored, send: answerWith({ [ID(1)]: 'New' }) });
    state.feature.init();
    await state.flush();
    const kept = Object.keys(state.written);
    assert.equal(kept.length, 2000);
    assert.ok(kept.includes(ID(1)), 'the new one is in');
    assert.ok(!kept.includes('old00000000'), 'the oldest one is out');
});

test('a rejected send behaves like an outage', async () => {
    const state = setup({ rows: [deadRow(ID(1))], send: () => { throw new Error('Extension context invalidated'); } });
    state.feature.init();
    await state.flush();
    assert.equal(state.rows[0].dataset.ytkitFilmot, 'link');
    assert.equal(state.health[0][1], 'filmot');
});

test('a cached title costs no credit, and an old one gets asked again', async () => {
    const stored = { [ID(1)]: { ts: 1_000_000, title: 'Cached', channel: '', date: '' } };
    const row = deadRow(ID(1));
    const state = setup({ rows: [row], stored, send: answerWith({ [ID(1)]: 'Fresh' }) });
    state.feature.init();
    assert.equal(row.dataset.ytkitFilmot, 'restored');
    assert.equal(slot(row).textContent, 'Cached');
    assert.equal(state.timers.length, 0);
    state.feature.destroy();

    state.time += 31 * 24 * 60 * 60 * 1000;
    state.feature.init();
    await state.flush();
    assert.equal(state.sent.length, 1);
    assert.equal(slot(row).textContent, 'Fresh');
});

test('a video Filmot does not know gets the link, and is not asked about again that day', async () => {
    const row = deadRow(ID(1));
    const state = setup({ rows: [row], send: answerWith() });
    state.feature.init();
    await state.flush();
    assert.equal(row.dataset.ytkitFilmot, 'link');
    state.feature.destroy();

    state.feature.init();
    assert.equal(row.dataset.ytkitFilmot, 'link');
    assert.equal(state.timers.length, 0);
    state.feature.destroy();

    state.time += 24 * 60 * 60 * 1000 + 1;
    state.feature.init();
    await state.flush();
    assert.equal(state.sent.length, 2);
});

test('a long playlist goes out in batches of 50', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => deadRow(ID(i)));
    const state = setup({ rows, send: answerWith() });
    state.feature.init();
    await state.flush();
    await state.flush();
    await state.flush();
    assert.deepEqual(state.sent.map((message) => message.ids.length), [50, 50, 20]);
    assert.equal(state.timers.length, 0);
    assert.ok(rows.every((row) => row.dataset.ytkitFilmot === 'link'));
});

test('the per-minute budget holds a batch back instead of dropping it', async () => {
    const rows = Array.from({ length: 550 }, (_, i) => deadRow(ID(i)));
    const state = setup({ rows, send: answerWith() });
    state.feature.init();
    for (let i = 0; i < 10; i += 1) await state.flush();
    assert.equal(state.sent.length, 10);
    await state.flush();
    assert.equal(state.sent.length, 10, 'the 11th waits');
    assert.ok(state.timers[0].ms > 1600, 'and it waits for the window, not the short spacing');
    state.time += 60001;
    await state.flush();
    assert.equal(state.sent.length, 11);
    assert.ok(rows.every((row) => row.dataset.ytkitFilmot === 'link'));
});

test('two rows of the same video share one lookup', async () => {
    const rows = [deadRow(ID(1)), deadRow(ID(1))];
    const state = setup({ rows, send: answerWith({ [ID(1)]: 'Same' }) });
    state.feature.init();
    await state.flush();
    assert.deepEqual(state.sent[0].ids, [ID(1)]);
    assert.ok(rows.every((row) => slot(row).textContent === 'Same'));
});

test('a row YouTube recycles for a live video is cleaned up', async () => {
    const row = deadRow(ID(1));
    const state = setup({ rows: [row], send: answerWith({ [ID(1)]: 'Gone' }) });
    state.feature.init();
    await state.flush();
    assert.equal(row.dataset.ytkitFilmot, 'restored');

    row.read = { videoId: ID(2), title: 'Live', channel: 'Chan', durationText: '1:00' };
    state.rescan();
    assert.equal(row.dataset.ytkitFilmot, undefined);
    assert.equal(row.heading.items.length, 0);
});

test('a row recycled for another deleted video gets that video, and a late answer can not overwrite it', async () => {
    const row = deadRow(ID(1));
    const state = setup({ rows: [row], send: answerWith({ [ID(1)]: 'First', [ID(2)]: 'Second' }) });
    state.feature.init();
    row.read = { ...row.read, videoId: ID(2) };
    state.rescan();
    assert.equal(row.dataset.ytkitFilmotId, ID(2));
    await state.flush();
    assert.equal(slot(row).textContent, 'Second');
});

test('an answer for a row that has since moved on to another video is not drawn on it', async () => {
    let release;
    const row = deadRow(ID(1));
    const state = setup({
        rows: [row],
        send: (message) => (message.ids[0] === ID(1)
            ? new Promise((resolve) => { release = () => resolve(answerWith({ [ID(1)]: 'First' })(message)); })
            : answerWith({ [ID(2)]: 'Second' })(message))
    });
    state.feature.init();
    const inFlight = state.flush();
    await Promise.resolve();

    row.read = { ...row.read, videoId: ID(2) };
    state.rescan();
    release();
    await inFlight;
    assert.equal(row.heading.items.length, 0, 'the first video\'s title never landed');

    await state.flush();
    assert.equal(slot(row).textContent, 'Second');
});

test('leaving a playlist drops what was waiting, so nothing is paid for on the next page', async () => {
    const state = setup({ rows: [deadRow(ID(1))], send: answerWith({ [ID(1)]: 'One' }) });
    state.feature.init();
    state.feature.destroy();

    state.rows = [];
    state.timers.length = 0;
    state.feature.init();
    await state.flush();
    assert.equal(state.sent.length, 0);
});

test('a scan during a slow lookup does not pay for the same videos twice', async () => {
    let release;
    const first = deadRow(ID(1));
    const state = setup({
        rows: [first],
        send: (message) => (message.ids[0] === ID(1)
            ? new Promise((resolve) => { release = () => resolve(answerWith({ [ID(1)]: 'One' })(message)); })
            : answerWith({ [ID(2)]: 'Two' })(message))
    });
    state.feature.init();
    const inFlight = state.flush();
    await Promise.resolve();

    const second = deadRow(ID(2));
    state.rows.push(second);
    state.rescan();
    assert.equal(state.timers.length, 0, 'nothing else goes out while one is on its way');

    release();
    await inFlight;
    assert.equal(slot(first).textContent, 'One');
    await state.flush();
    assert.deepEqual(state.sent.map((message) => message.ids), [[ID(1)], [ID(2)]]);
    assert.equal(slot(second).textContent, 'Two');
});

test('turning it off puts every row back and drops a pending answer', async () => {
    let release;
    const row = deadRow(ID(1));
    const waiting = deadRow(ID(2));
    const state = setup({
        rows: [row],
        send: (message) => (message.ids[0] === ID(1)
            ? answerWith({ [ID(1)]: 'One' })(message)
            : new Promise((resolve) => { release = () => resolve(answerWith({ [ID(2)]: 'Two' })(message)); }))
    });
    state.feature.init();
    await state.flush();

    state.rows.push(waiting);
    state.rescan();
    const inFlight = state.flush();
    await Promise.resolve();
    state.feature.destroy();
    release();
    await inFlight;

    assert.equal(row.dataset.ytkitFilmot, undefined);
    assert.equal(row.heading.items.length, 0);
    assert.equal(waiting.heading.items.length, 0, 'the late answer drew nothing');
});

test('an answer from before a restart neither blocks nor overwrites the new start', async () => {
    let release;
    const row = deadRow(ID(1));
    const state = setup({
        rows: [row],
        send: (message) => (state.sent.length === 1
            ? new Promise((resolve) => { release = () => resolve(answerWith({ [ID(1)]: 'Old' })(message)); })
            : answerWith({ [ID(1)]: 'New' })(message))
    });
    state.feature.init();
    const stale = state.flush();
    await Promise.resolve();
    state.feature.destroy();

    state.feature.init();
    release();
    await stale;
    assert.equal(row.heading.items.length, 0, 'the old answer drew nothing');

    await state.flush();
    assert.equal(slot(row).textContent, 'New');
    assert.equal(state.sent.length, 2);
});

test('a fresh start forgets the session\'s no-key state, so a newly added key is used', async () => {
    let hasKey = false;
    const row = deadRow(ID(1));
    const state = setup({
        rows: [row],
        send: (message) => (hasKey
            ? answerWith({ [ID(1)]: 'Now' })(message)
            : { ok: false, error: { code: 'CREDENTIAL_MISSING' } })
    });
    state.feature.init();
    await state.flush();
    state.feature.destroy();

    hasKey = true;
    state.feature.init();
    await state.flush();
    assert.equal(slot(row).textContent, 'Now');
});
