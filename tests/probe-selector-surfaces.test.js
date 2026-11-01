const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { buildCountExpression, parseArgs, recordCounts, selectSurfaces, summarizeSurface } = require('../scripts/probe-selector-surfaces.js');

const LISTS = { stable: ['a-live', 'a-gone'], fallback: ['a-old'] };

test('a selector counts as proven when any stop rendered it', () => {
    const seen = {};
    recordCounts(seen, 'home', { feed: { 'a-live': 0, 'a-gone': 0, 'a-old': 0 } });
    recordCounts(seen, 'videos', { feed: { 'a-live': 30, 'a-gone': 0, 'a-old': 0 } });
    const summary = summarizeSurface(LISTS, seen.feed);
    assert.equal(summary.proven, 1);
    assert.equal(summary.total, 2);
    assert.deepEqual(summary.stable[0].seenOn, ['videos:30']);
    assert.deepEqual(summary.stable[1].seenOn, []);
});

test('a selector the browser refused is not proof of anything', () => {
    const seen = recordCounts({}, 'home', { feed: { 'a-live': -1, 'a-gone': 0, 'a-old': 0 } });
    assert.equal(summarizeSurface(LISTS, seen.feed).proven, 0);
});

test('a fallback hit never raises the stable count', () => {
    const seen = recordCounts({}, 'home', { feed: { 'a-live': 0, 'a-gone': 0, 'a-old': 4 } });
    const summary = summarizeSurface(LISTS, seen.feed);
    assert.equal(summary.proven, 0);
    assert.deepEqual(summary.fallback[0].seenOn, ['home:4']);
});

test('a surface no stop saw summarizes as unproven instead of throwing', () => {
    const summary = summarizeSurface(LISTS, undefined);
    assert.equal(summary.proven, 0);
    assert.equal(summary.total, 2);
});

test('the page script counts every list and survives a selector the browser refuses', () => {
    const expression = buildCountExpression({ feed: LISTS });
    const counts = vm.runInNewContext(expression, {
        document: {
            querySelectorAll(selector) {
                if (selector === 'a-old') throw new Error('not a valid selector');
                return selector === 'a-live' ? [1, 2, 3] : [];
            },
        },
    });
    assert.equal(counts.feed['a-live'], 3);
    assert.equal(counts.feed['a-gone'], 0);
    assert.equal(counts.feed['a-old'], -1);
});

test('asking for a surface that does not exist fails instead of printing nothing', () => {
    assert.throws(() => selectSurfaces({ feed: LISTS }, ['feeed']), /Unknown surface: feeed/);
    assert.deepEqual(Object.keys(selectSurfaces({ b: LISTS, a: LISTS })), ['a', 'b']);
});

test('the command line takes a surface list and a browser, and rejects anything else', () => {
    assert.deepEqual(parseArgs(['--surfaces', 'feed,modals', '--chrome', 'c.exe']), { chrome: 'c.exe', surfaces: ['feed', 'modals'] });
    assert.throws(() => parseArgs(['--headed']), /Unknown option/);
});
