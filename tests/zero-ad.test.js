'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    OBSERVED_REQUESTS,
    auditZeroAdRules,
    ruleCoversRequest
} = require('../scripts/check-zero-ad-rules');

test('zero-ad static rules cover every request captured during live desktop reconnaissance', () => {
    const { failures, rules } = auditZeroAdRules();
    assert.deepEqual(failures, []);
    for (const request of OBSERVED_REQUESTS) {
        assert.ok(
            rules.some((rule) => ruleCoversRequest(rule, request)),
            `${request.url} must be blocked before the request leaves the browser`
        );
    }
});

test('zero-ad rules stay scoped away from media delivery', () => {
    const { rules } = auditZeroAdRules();
    const watchMediaRequest = {
        url: 'https://rr1---sn.example.googlevideo.com/videoplayback?id=video',
        initiator: 'https://www.youtube.com/watch?v=video',
        resourceType: 'media'
    };
    assert.equal(rules.some((rule) => ruleCoversRequest(rule, watchMediaRequest)), false);
});
