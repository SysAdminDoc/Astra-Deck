'use strict';

// These were two scans: does the file mention "YTKitFeatures", and does it
// mention a caption setting. The CSS builder is pure, so it is now called
// across its settings and its declarations read back.

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSubtitleCss, FONT_FAMILY_MAP, featureSpec } = require('../../extension/features/subtitles');

const declaration = (css, property) => {
    const match = new RegExp(`${property}:\\s*([^;]+?)\\s*!important`).exec(css);
    return match ? match[1] : null;
};

test('caption styling follows the settings it is given', () => {
    const css = buildSubtitleCss({
        subStyleFontSize: 150,
        subStyleColor: '#ff0000',
        subStyleBgColor: '#123456',
        subStyleBgOpacity: 40,
        subStyleFontFamily: 'mono',
    });

    assert.equal(declaration(css, 'font-size'), '150%');
    assert.equal(declaration(css, 'color'), '#ff0000');
    assert.equal(declaration(css, 'background'), 'rgba(18, 52, 86, 0.4)',
        'the hex background is converted to rgba so the opacity setting applies');
    assert.equal(declaration(css, 'font-family'), FONT_FAMILY_MAP.mono);
});

test('an unset style falls back to a readable default rather than nothing', () => {
    const css = buildSubtitleCss({});
    assert.equal(declaration(css, 'font-size'), '100%');
    assert.equal(declaration(css, 'color'), '#ffffff');
    assert.equal(declaration(css, 'background'), 'rgba(0, 0, 0, 0.75)');
    assert.equal(declaration(css, 'font-family'), null,
        'no family choice means no font-family rule, so YouTube keeps its own');
    assert.equal(buildSubtitleCss({}), buildSubtitleCss(undefined),
        'no settings at all behaves like empty settings');
});

test('out-of-range values are clamped instead of being written into CSS', () => {
    assert.equal(declaration(buildSubtitleCss({ subStyleFontSize: 5 }), 'font-size'), '50%');
    assert.equal(declaration(buildSubtitleCss({ subStyleFontSize: 5000 }), 'font-size'), '300%');
    assert.equal(declaration(buildSubtitleCss({ subStyleBgOpacity: -20 }), 'background'), 'rgba(0, 0, 0, 0)');
    assert.equal(declaration(buildSubtitleCss({ subStyleBgOpacity: 400 }), 'background'), 'rgba(0, 0, 0, 1)');
});

test('a colour that is not a colour cannot reach the stylesheet', () => {
    const hostile = buildSubtitleCss({ subStyleColor: '#fff; } body { display: none' });
    assert.equal(declaration(hostile, 'color'), '#ffffff',
        'a value that would close the declaration is replaced by the default');
    assert.doesNotMatch(hostile, /body \{ display: none/);
});

test('the text shadow is on by default and can be turned off', () => {
    assert.equal(declaration(buildSubtitleCss({}), 'text-shadow'), '2px 2px 4px rgba(0,0,0,0.9)');
    assert.equal(declaration(buildSubtitleCss({ subStyleTextShadow: false }), 'text-shadow'), 'none');
    assert.equal(declaration(buildSubtitleCss({ subStyleTextShadow: true }), 'text-shadow'), '2px 2px 4px rgba(0,0,0,0.9)');
});

test('the feature spec builds the same CSS the export does', () => {
    assert.equal(featureSpec.id, 'subtitleStyling');
    const settings = { subStyleFontSize: 120 };
    assert.equal(featureSpec.buildCss(settings), buildSubtitleCss(settings),
        'the lifecycle path and the exported builder must not drift apart');
});
