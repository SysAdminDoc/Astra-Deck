'use strict';

// Player Dock (on by default) hides every child of .ytp-right-controls except
// its own, so Video Loop Button drew a control nobody could see. The dock's
// Repeat does the same job, and the settings card now says so while the dock
// is on. With the dock off the button is untouched.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadFeature, fakeTreeDocument } = require('../helpers/monolith');

const REPO_ROOT = path.join(__dirname, '..', '..');
const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'pt_BR', 'ru', 'ja', 'ko', 'zh_CN', 'ar'];

function settingsCard(settings) {
    const document = fakeTreeDocument();
    const feature = loadFeature('videoLoopButton', { document, appState: { settings } });
    const card = document.createElement('div');
    const info = document.createElement('div');
    info.className = 'ytkit-feature-info';
    card.appendChild(info);
    return { feature, card, info };
}

test('the Video Loop Button card points to the dock Repeat while Player Dock is on', () => {
    for (const settings of [{ floatingLogoOnWatch: true }, {}]) {
        const { feature, card, info } = settingsCard(settings);
        assert.equal(feature.render(card), null, 'the note goes under the description, not into the control slot');
        assert.equal(info.children.length, 1, `dock ${JSON.stringify(settings)}: one note`);
        assert.match(info.children[0].textContent, /Player Dock is on, it hides this button/);
        assert.ok(info.children[0].classList.contains('ytkit-feature-desc'));
        assert.equal(info.children[0].hidden, false);
    }
});

test('with Player Dock off the note is hidden, and it follows the dock switch', () => {
    const { feature, card, info } = settingsCard({ floatingLogoOnWatch: false });
    feature.render(card);
    assert.equal(info.children.length, 1);
    assert.equal(info.children[0].hidden, true, 'the button shows with the dock off');
    assert.equal(info.children[0].dataset.followsSetting, 'floatingLogoOnWatch',
        'the panel finds the note by the setting it follows');
});

test('the dock note is translated in every shipped locale', () => {
    const english = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'extension', '_locales', 'en', 'messages.json'), 'utf8'))
        .videoLoopButtonDockNote?.message;
    assert.ok(english);
    for (const locale of LOCALES.filter((l) => l !== 'en')) {
        const messages = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'extension', '_locales', locale, 'messages.json'), 'utf8'));
        const message = messages.videoLoopButtonDockNote?.message;
        assert.ok(message, `${locale} has the key`);
        assert.notEqual(message, english, `${locale} is translated, not a copy of the English`);
    }
});
