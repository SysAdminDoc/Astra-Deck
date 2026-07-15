const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const pkg = require('../package.json');
const smoke = require('../scripts/smoke-headless-a11y.js');
const overlaySmoke = require('../scripts/smoke-settings-overlay.js');
const source = fs.readFileSync(
    path.join(repoRoot, 'scripts', 'smoke-headless-a11y.js'),
    'utf8'
);
const popupCss = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.css'), 'utf8');
const popupJs = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8');
const sidepanelCss = fs.readFileSync(path.join(repoRoot, 'extension', 'sidepanel.css'), 'utf8');
const ytkit = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
const downloadUi = fs.readFileSync(
    path.join(repoRoot, 'extension', 'features', 'download-ui', 'index.js'),
    'utf8'
);

test('headless accessibility smoke covers every roadmap surface through real UI sources', () => {
    assert.equal(pkg.scripts['smoke:a11y'], 'node scripts/smoke-headless-a11y.js');
    assert.deepEqual(
        smoke.SURFACES.map((surface) => surface.name),
        ['popup', 'sidepanel', 'settings', 'transcript', 'download']
    );
    assert.match(source, /injectChromeStub\(stageDir, 'popup\.html', 'popup-a11y\.html'\)/);
    assert.match(source, /injectChromeStub\(stageDir, 'sidepanel\.html', 'sidepanel-a11y\.html'\)/);
    assert.match(source, /globalThis\.__ytkitSmoke\.openPanel\(\)/);
    assert.match(source, /#ytkit-transcript-panel/);
    assert.match(source, /globalThis\.__ytkitA11y\.openDownload\(\)/);
    assert.match(overlaySmoke.CHROME_STUB, /transcriptViewer: true/);
});

test('headless accessibility smoke is isolated and cannot surface a foreground browser', () => {
    assert.match(source, /'--headless=new'/);
    assert.match(source, /windowsHide: true/);
    assert.match(source, /mkdtempSync[\s\S]*astra-headless-a11y-profile-/);
    assert.doesNotMatch(source, /--headed|headless:\s*false|user-data-dir=.*Default/i);
});

test('headless accessibility smoke checks reflow, focus visibility, and obscuring', () => {
    assert.match(source, /\['normal', 'zoom-200'\]/);
    assert.match(source, /deviceScaleFactor: zoomed \? 2 : 1/);
    assert.match(source, /forced-colors/);
    assert.match(source, /prefers-color-scheme/);
    assert.match(source, /active\.matches\(':focus-visible'\)/);
    assert.match(source, /document\.elementFromPoint/);
    assert.match(source, /root\.scrollWidth > inventory\.root\.clientWidth/);
    assert.match(source, /document\.scrollWidth > inventory\.document\.clientWidth/);
    assert.match(source, /Input\.dispatchKeyEvent/);
    assert.match(source, /Page\.captureScreenshot/);
    assert.match(source, /build', 'headless-a11y/);
    assert.match(source, /searchParams\.set\('theme', theme\)/);
});

test('headless accessibility smoke CLI parsing stays deterministic', () => {
    assert.deepEqual(smoke.parseArgs([]), {
        browser: '',
        keepStage: false,
        timeoutMs: 45000,
    });
    assert.equal(smoke.parseArgs(['--timeout', '9000']).timeoutMs, 9000);
    assert.throws(() => smoke.parseArgs(['--headed']), /unknown argument/);
});

test('rendered accessibility fixes remain pinned at their root causes', () => {
    const popupFocusHandler = popupJs.slice(
        popupJs.indexOf('function handlePopupDialogKeydown'),
        popupJs.indexOf('function installPopupFocusManagement')
    );
    assert.doesNotMatch(popupFocusHandler, /preventScroll\s*:\s*true/,
        'popup focus wrapping must reveal the wrapped-to control');
    assert.match(popupCss, /schema-overview-summary:focus-visible/);
    assert.match(popupCss, /@media \(forced-colors: active\)[\s\S]*summary:focus-visible/);
    assert.match(sidepanelCss, /html\s*\{[\s\S]*?min-width:\s*0/,
        'side panel must reflow below the old 240px floor');
    assert.match(sidepanelCss, /body\s*\{[\s\S]*?min-width:\s*0/);
    assert.match(
        ytkit,
        /#secondary:not\(:has\(ytd-live-chat-frame:not\(\[hidden\]\), \.ytkit-bookmarks-container, #ytkit-transcript-panel\)\)/,
        'related-video hiding must preserve transcript and bookmark surfaces'
    );
});

test('download dialog positioning and keyboard containment stay resilient', () => {
    for (const [label, implementation] of [['canonical module', downloadUi]]) {
        assert.match(implementation, /popup\.setAttribute\('aria-modal', 'true'\)/,
            `${label} must expose modal dialog semantics`);
        assert.match(implementation, /const dialogKeydown = \(event\) =>/,
            `${label} must own its Tab and Escape behavior`);
        assert.match(implementation, /controls\[nextIndex\]\.focus\(\)/,
            `${label} must traverse every visible dialog control`);
        assert.match(implementation, /_dlPopupReturnFocus/,
            `${label} must restore focus to the trigger on close`);
        assert.match(implementation, /anchorEl\?\.matches\?\.\('\.ytkit-po-dl'\)/,
            `${label} must only use the named CSS anchor for the player-dock trigger`);
        assert.match(implementation, /popup\.style\.inset = 'auto'/,
            `${label} manual positioning must reset popover UA insets`);
    }
    assert.doesNotMatch(ytkit, /function showDownloadPopup/,
        'ytkit.js must not retain a drifting inline download-dialog fallback');
    assert.match(ytkit, /\.ytkit-dl-popup \[hidden\]\s*\{\s*display:\s*none !important/,
        'inactive format rows must not remain visually rendered or tabbable');
});
