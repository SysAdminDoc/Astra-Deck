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
    collectJsLiterals
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
