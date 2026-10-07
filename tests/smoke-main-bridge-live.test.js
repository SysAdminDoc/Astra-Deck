'use strict';

// The live bridge smoke needs a network and a browser, so its verdicts are
// pinned here: each check has to fail on the state it exists to catch.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    admissionFailures,
    pageStateFailures,
    tokenProbeFailures
} = require('../scripts/smoke-main-bridge-live.js');

const CLEAN_STATE = Object.freeze({
    channelModule: true,
    publishedReader: false,
    readerLike: [],
    windowReaders: [],
    tokenOnHtml: false,
    vp9: false,
    av1: false,
    h264: true
});

test('a reader reachable from window fails the page state', () => {
    assert.deepEqual(pageStateFailures(CLEAN_STATE, 'first load'), []);
    const failures = pageStateFailures({ ...CLEAN_STATE, windowReaders: ['yt.bridge'] }, 'first load');
    assert.equal(failures.length, 1);
    assert.match(failures[0], /reachable from window: yt\.bridge/);
});

test("the token probe fails when the token is still there for the page's first script", () => {
    const handedOff = { tokenSet: true, tokenRemoved: true, sawScript: true, tokenAtFirstScript: false };
    assert.deepEqual(tokenProbeFailures(handedOff), []);
    assert.match(tokenProbeFailures({ ...handedOff, tokenAtFirstScript: true }).join('\n'), /first script ran/);
    // A probe that saw nothing must not pass by default.
    assert.match(tokenProbeFailures({ ...handedOff, sawScript: false }).join('\n'), /no page script/);
    assert.match(tokenProbeFailures({ ...handedOff, tokenSet: false }).join('\n'), /never set and taken/);
    assert.match(tokenProbeFailures(null).join('\n'), /never ran/);
});

test('admission fails unless the admitted-navigate count moved', () => {
    assert.deepEqual(admissionFailures(1, 2), []);
    assert.deepEqual(admissionFailures(undefined, 1), [], 'a first load with no navigate yet starts at zero');
    assert.equal(admissionFailures(2, 2).length, 1);
    assert.equal(admissionFailures(undefined, undefined).length, 1);
});
