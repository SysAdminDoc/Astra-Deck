'use strict';

// The download popup captured formats, size estimates, the playlist preview
// and the clip range for the video it was opened on — but the download CTA
// re-read window.location.href at CLICK time.
//
// YouTube's autoplay advances the page with no user gesture, so the popover's
// light-dismiss never fires and nothing else closed it. The popup therefore
// sat over the next video showing video A's formats, and clicking Download
// fetched video B.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'extension/features/download-ui/index.js'), 'utf8');

// The builder runs from showDownloadPopup to the next sibling declaration at
// the same indent. Comment lines are stripped: this file's own comments quote
// `window.location.href` while explaining why it must not be read at click
// time, and a naive count would match the documentation.
function popupBuilder() {
    const at = source.indexOf('function showDownloadPopup(anchorEl)');
    assert.ok(at > 0, 'showDownloadPopup must exist');
    const rest = source.slice(at + 10);
    const endRel = rest.search(/\n {8}(?:function |const \w+ = \{)/);
    const body = endRel > 0 ? rest.slice(0, endRel) : rest;
    assert.ok(body.length > 20000, `the builder slice looks truncated (${body.length} chars)`);
    return body
        .split('\n')
        .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n');
}

test('the popup freezes the url it was opened for', () => {
    const body = popupBuilder();
    assert.match(body, /const openedUrl = window\.location\.href;/,
        'the video the popup describes must be captured once, at open');
});

test('the download CTA uses the frozen url, never a fresh location read', () => {
    const body = popupBuilder();
    assert.match(body, /let requestUrl = openedUrl;/,
        'reading location at click time is what downloaded the wrong video');
    const ctaStart = body.indexOf("dlBtn.addEventListener('click'");
    const ctaEnd = body.indexOf('footer.appendChild(dlBtn)', ctaStart);
    const cta = body.slice(ctaStart, ctaEnd);
    assert.doesNotMatch(cta, /window\.location\.href/,
        'the CTA must not switch to the current page after the popup opens');
});

test('the format probe describes the same video as the CTA', () => {
    const body = popupBuilder();
    assert.match(body, /const videoUrl = openedUrl;/,
        'probing a different url than the CTA downloads is the same bug in another place');
});

test('the playlist id is derived from the frozen url', () => {
    const body = popupBuilder();
    assert.match(body, /new URL\(openedUrl\)\.searchParams\.get\('list'\)/);
});

test('the navigate rule ignores its immediate registration call', () => {
    const body = popupBuilder();
    assert.match(body, /const openedVideoId = getVideoId\(openedUrl\);/,
        'registration needs the opened video identity before addNavigateRule invokes the rule');
    assert.match(body, /const currentVideoId = getVideoId\(window\.location\.href\);[\s\S]{0,260}?if \(!stayedOnOpenedVideo\) _closeDlPopup\(\);/,
        'the immediate rule call must keep the popup open on the same video');
});

test('the navigate rule closes the popup after the video changes', () => {
    const body = popupBuilder();
    assert.match(body, /currentVideoId === openedVideoId/,
        'autoplay must compare the new video with the popup video');
    assert.match(body, /if \(!stayedOnOpenedVideo\) _closeDlPopup\(\);/,
        'autoplay navigation fires no user gesture, so the rule must close the stale popup');
});

test('both cleanup branches remove the navigate rule', () => {
    const body = popupBuilder();
    const removals = body.match(/removeNavigateRule\(DL_POPUP_NAV_RULE_ID\)/g) || [];
    assert.equal(removals.length, 2,
        `the anchored and fallback cleanup paths must both deregister, saw ${removals.length}`);
});

test('the rule id is a stable module-scope constant', () => {
    assert.match(source, /const DL_POPUP_NAV_RULE_ID = 'downloadPopupNavClose';/,
        'an inline literal would let the register and remove calls drift apart');
});
