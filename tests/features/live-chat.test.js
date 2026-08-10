'use strict';

// Per-area test bed for the live-chat feature module.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('live-chat popout and subscribe-tooltip matches are not English-only', () => {
    // Both were text/aria-label matches, so the toggles silently no-opped on
    // the ten non-English locales — and the popout label only ever existed on
    // the older header layout, where current YouTube puts the entry in the
    // header's overflow menu instead.
    const source = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'live-chat', 'index.js'), 'utf8');
    const popoutStart = source.indexOf('popout: [');
    assert.ok(popoutStart > -1, 'the popout selector must list alternatives');
    const popout = source.slice(popoutStart, popoutStart + 700);
    assert.match(popout, /button\[aria-label="Popout chat"\]/,
        'the legacy English label stays as one anchor');
    assert.match(popout, /ytd-menu-service-item-renderer:has\(path\[d\^="M21,21H3V3h9v1H4v16h16v-8h1V21z"\]\)/,
        'the current open-in-new glyph must be matched');
    assert.match(popout, /ytd-menu-service-item-renderer:has\(path\[d\^="M19 19H5V5h7V3H5c-1\.11"\]\)/,
        'the older open-in-new glyph revision must also be matched');

    const tooltipStart = source.indexOf('const engagementAnchored');
    assert.ok(tooltipStart > -1, 'the tooltip check must have a structural path');
    const tooltip = source.slice(tooltipStart - 400, tooltipStart + 700);
    assert.match(tooltip, /yt-live-chat-viewer-engagement-message-renderer/,
        'a tooltip anchored to an engagement message must be recognized in any language');
    assert.match(tooltip, /people will be able to see that you subscribe to this channel/,
        'the English phrase stays as a fallback for other layouts');
});

test('recycled chat renderers re-evaluate instead of keeping the previous message verdict', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'live-chat', 'index.js'), 'utf8');

    // Live chat recycles yt-live-chat-text-message-renderer nodes the same way
    // the feed recycles card renderers. A settings-only signature let a
    // recycled node keep the verdict computed for the message it used to hold,
    // so a hidden node stayed hidden over innocent new text.
    const scanStart = source.indexOf('function scanMessageFilters()');
    const scanBody = source.slice(scanStart, source.indexOf('function createReactionController'));
    assert.match(scanBody, /const settingsSignature = /,
        'the settings part of the signature must be named separately');
    assert.match(scanBody, /const signature = `\$\{settingsSignature\}[\s\S]{0,80}\$\{author\}/,
        'the per-message signature must include the author');
    assert.match(scanBody, /text\.slice\(0, 120\)/,
        'the per-message signature must include the message text');
    assert.ok(scanBody.indexOf('const signature =') > scanBody.indexOf('const author ='),
        'the signature must be computed after reading the content it covers');

    const premiumStart = source.indexOf('function scanPremiumMessages()');
    const premiumBody = source.slice(premiumStart, source.indexOf('function scanMessageFilters'));
    assert.doesNotMatch(premiumBody, /renderer:not\(\[data-ytkit-livechat-enhanced\]\)/,
        'skipping every marked node leaves a recycled node showing the previous author initial');
    assert.match(premiumBody, /ytkitLivechatAuthor === author/,
        'the premium scan must re-derive when the author changes');
});
