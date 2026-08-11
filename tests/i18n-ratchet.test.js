'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    buildUiCopyBaseline,
    checkUiCopyBaseline,
    collectHtmlLiterals,
    collectJsLiterals,
    collectStrictJsLiterals
} = require('../scripts/check-localizable-ui-copy');
const { generatePseudolocale, pseudolocalizeMessage } = require('../scripts/generate-pseudolocale');

test('UI-copy ratchet rejects a newly added hardcoded literal at a rendered sink', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-i18n-copy-'));
    const extensionDir = path.join(root, 'extension');
    fs.mkdirSync(extensionDir, { recursive: true });
    const filePath = path.join(extensionDir, 'panel.js');
    fs.writeFileSync(filePath, "status.textContent = 'Existing copy';\n", 'utf8');
    const baseline = buildUiCopyBaseline(extensionDir);
    assert.deepEqual(checkUiCopyBaseline(baseline, baseline), []);

    fs.appendFileSync(filePath, "showToast('New visible feedback');\n", 'utf8');
    const changed = buildUiCopyBaseline(extensionDir);
    assert.match(checkUiCopyBaseline(changed, baseline)[0], /UI-copy fingerprint changed/);
});

test('localized, reviewed-static, and annotated technical strings do not grow UI-copy debt', () => {
    const findings = collectJsLiterals([
        "status.textContent = t('statusReady', 'Ready');",
        "brand.textContent = 'Astra Deck';",
        "// i18n-static: protocol identifier",
        "label.textContent = 'SABR';",
        "status.textContent = 'Needs localization';"
    ].join('\n'));
    assert.deepEqual(findings, [{ sink: 'assignment:textContent', value: 'Needs localization' }]);

    const html = collectHtmlLiterals([
        '<button data-i18n="saveBtn">Save</button>',
        '<input aria-label="Search" data-i18n-attr-aria-label="searchAria">',
        '<button aria-label="New action">New action</button>'
    ].join('\n'));
    assert.deepEqual(html, [
        { sink: 'html-text:button', value: 'New action' },
        { sink: 'html-attr:aria-label', value: 'New action' }
    ]);
});

test('strict UI-copy sinks reject direct literals while allowing t() and reviewed names', () => {
    const findings = collectStrictJsLiterals([
        "button.textContent = 'Needs localization';",
        "button.title = `Tooltip copy`;",
        "button.setAttribute('aria-label', 'Accessible copy');",
        "showToast('Toast copy');",
        "button.textContent = t('buttonLabel', 'Localized');",
        "button.textContent = 'Astra Deck';",
        "button.textContent = 'JSON';",
        "button.textContent = statusText;"
    ].join('\n'));
    assert.deepEqual(findings, [
        { sink: 'assignment:textContent', value: 'Needs localization' },
        { sink: 'assignment:title', value: 'Tooltip copy' },
        { sink: 'feedback:showToast', value: 'Toast copy' },
        { sink: 'attribute:aria-label', value: 'Accessible copy' }
    ]);
});

test('strict UI-copy sink changes identify a new direct literal separately from the legacy ratchet', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-i18n-strict-'));
    const extensionDir = path.join(root, 'extension');
    fs.mkdirSync(extensionDir, { recursive: true });
    const filePath = path.join(extensionDir, 'panel.js');
    fs.writeFileSync(filePath, "status.textContent = 'Existing copy';\n", 'utf8');
    const baseline = buildUiCopyBaseline(extensionDir);

    fs.appendFileSync(filePath, "showToast('New visible feedback');\n", 'utf8');
    const changed = buildUiCopyBaseline(extensionDir);
    const failures = checkUiCopyBaseline(changed, baseline);
    assert.ok(failures.some((failure) => /strict UI-copy sink changed/.test(failure)));
});

test('download, video-notes, settings-panel, and video-hider surfaces keep rendered copy behind locale keys', () => {
    const repoRoot = path.join(__dirname, '..');
    const baseline = JSON.parse(fs.readFileSync(
        path.join(repoRoot, 'scripts', 'i18n-ui-copy-baseline.json'),
        'utf8'
    ));
    assert.equal(baseline.entries['extension/features/download-ui/index.js'], undefined,
        'download UI copy debt should stay at zero after the first burn-down pass');
    assert.equal(baseline.entries['extension/features/video-notes/index.js'], undefined,
        'video-notes copy debt should stay at zero after the first burn-down pass');
    assert.equal(baseline.entries['extension/features/settings-panel/index.js'], undefined,
        'settings-panel rendered sink copy should stay at zero after the burn-down passes');
    assert.equal(baseline.entries['extension/features/video-hider/index.js'], undefined,
        'video-hider rendered sink copy should stay at zero after the burn-down pass');

    const downloadSource = fs.readFileSync(
        path.join(repoRoot, 'extension', 'features', 'download-ui', 'index.js'),
        'utf8'
    );
    const notesSource = fs.readFileSync(
        path.join(repoRoot, 'extension', 'features', 'video-notes', 'index.js'),
        'utf8'
    );
    assert.match(downloadSource, /t\('dlCobaltProfileOnly'/);
    assert.match(downloadSource, /t\('dlFailureTpl'/);
    assert.match(downloadSource, /t\('feature_downloadHistoryPanel_name'/);
    assert.match(notesSource, /i18n-static: numeric character-count display/);
    const settingsSource = fs.readFileSync(
        path.join(repoRoot, 'extension', 'features', 'settings-panel', 'index.js'),
        'utf8'
    );
    assert.match(settingsSource, /t\('settingsPanelContentControls'/);
    assert.match(settingsSource, /t\('videoHiderHiddenCountTpl'/);
    assert.match(settingsSource, /t\(\s*['"]videoHiderRestoreAllTpl/);
    assert.match(settingsSource, /t\(\s*['"]videoHiderOpenHiddenVideoAriaTpl/);
    const videoHiderSource = fs.readFileSync(
        path.join(repoRoot, 'extension', 'features', 'video-hider', 'index.js'),
        'utf8'
    );
    assert.match(videoHiderSource, /t\('videoHiderSubsPauseReasonTpl'/);
    assert.match(videoHiderSource, /t\('videoHiderQuickActionsAria'/);
});

test('generated pseudolocale expands copy and isolates interpolation tokens for RTL proofing', () => {
    const source = 'Downloaded {count} files for $USER$';
    const pseudo = pseudolocalizeMessage(source);
    assert.ok(pseudo.length > source.length);
    assert.ok(pseudo.startsWith('\u2067⟦'));
    assert.ok(pseudo.endsWith('⟧\u2069'));
    assert.match(pseudo, /\u2068\{count\}\u2069/);
    assert.match(pseudo, /\u2068\$USER\$\u2069/);

    const messages = generatePseudolocale({
        downloadStatus: {
            message: source,
            placeholders: { count: { content: '$1' }, user: { content: '$2' } }
        }
    });
    assert.deepEqual(messages.downloadStatus.placeholders, {
        count: { content: '$1' },
        user: { content: '$2' }
    });
    assert.notEqual(messages.downloadStatus.message, source);

    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.match(packageJson.scripts['i18n:pseudolocale'] || '', /generate-pseudolocale\.js/);
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'generate-pseudolocale.js'), 'utf8'), /build.*i18n-pseudolocale/);
});
