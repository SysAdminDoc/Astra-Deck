'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ytkitSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'extension', 'ytkit.js'), 'utf8');

function featureSlice(id, span = 8000) {
    const start = ytkitSource.indexOf(`id: '${id}'`);
    assert.notEqual(start, -1, `feature ${id} must exist in ytkit.js`);
    return ytkitSource.slice(start, start + span);
}

function extractRegex(block, name) {
    const match = block.match(new RegExp(`${name}: (\\/.*\\/i),`));
    assert.ok(match, `${name} literal must exist in the feature block`);
    const lastSlash = match[1].lastIndexOf('/');
    return new RegExp(match[1].slice(1, lastSlash), match[1].slice(lastSlash + 1));
}

test('hidePlannedLivestreams scheduled-metadata regex only matches future-anchored text', () => {
    const block = featureSlice('hidePlannedLivestreams');
    const scheduled = extractRegex(block, '_SCHEDULED_RE');

    const futureTexts = [
        'Scheduled for 7/23/26, 9:45 PM',
        'Premieres 10/31/26, 8:00 PM',
        'Waiting for the creator',
        'Starts in 2 hours',
        'Live in 45 minutes',
        'UPCOMING'
    ];
    for (const text of futureTexts) {
        assert.ok(scheduled.test(text), `future text must match: "${text}"`);
    }

    // Post-premiere / past-tense metadata and channel-byline shapes must
    // NEVER match — a false positive permanently hides a published video.
    const pastTexts = [
        'Premiered 7 hours ago',
        '1,234 views · Premiered 2 days ago',
        'Streamed live 3 hours ago',
        'Premiere Gal',
        'Live in the Studio',
        '12K views · 3 days ago'
    ];
    for (const text of pastTexts) {
        assert.ok(!scheduled.test(text), `past/byline text must not match: "${text}"`);
    }
});

test('hidePlannedLivestreams notify-button regex matches reminder labels, not watch actions', () => {
    const block = featureSlice('hidePlannedLivestreams');
    const notify = extractRegex(block, '_NOTIFY_RE');

    for (const text of ['Notify me', 'Set reminder', 'Benachrichtigen', '设置提醒']) {
        assert.ok(notify.test(text), `reminder label must match: "${text}"`);
    }
    for (const text of ['Watch now', 'Share', 'Save to Watch Later', 'Join']) {
        assert.ok(!notify.test(text), `non-reminder label must not match: "${text}"`);
    }
});

test('hidePlannedLivestreams never scans video titles for the scheduled fallback', () => {
    const block = featureSlice('hidePlannedLivestreams');
    const metaQuery = block.match(/const metaNodes = card\.querySelectorAll\(\s*'([^']+)'/);
    assert.ok(metaQuery, 'metadata node query must exist');
    assert.ok(!/video-title|#title|h3/.test(metaQuery[1]),
        'scheduled fallback must not include title selectors');
});

test('hidePlannedLivestreams cleans up rules, classes, and styles on destroy', () => {
    const block = featureSlice('hidePlannedLivestreams');
    assert.match(block, /removeScopedMutationRule\('hidePlannedLivestreams'\)/);
    assert.match(block, /removeNavigateRule\('hidePlannedLivestreams'\)/);
    assert.match(block, /classList\.remove\('ytkit-planned-livestream-hidden'\)/);
    assert.match(block, /yt-suite-style-planned-livestream-hidden/);
});
