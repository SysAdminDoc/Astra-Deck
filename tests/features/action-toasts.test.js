'use strict';

// Action notices (actionToasts) are off by default: confirmation toasts stay
// quiet, warnings and errors still show, the open settings panel keeps its
// feedback, and screen readers hear what was suppressed. These run the real
// isQuietToast/showToast out of ytkit.js against fakes.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadDeclarations } = require('../helpers/monolith');
const { SETTINGS_SCHEMA } = require('../../extension/core/settings-schema');

const TONE_OF = {
    '#ef4444': 'error',
    '#f59e0b': 'warning',
    '#f97316': 'warning',
    '#3b82f6': 'info',
    '#6b7280': 'neutral',
    '#22c55e': 'success',
};

function harness({ actionToasts, panelOpen = false, onScreen = null } = {}) {
    const shown = [];
    const announced = [];
    const dismissed = [];
    const settings = actionToasts === undefined ? {} : { actionToasts };
    const api = loadDeclarations(['isQuietToast', 'showQuietToast', 'showToast'], {
        appState: { settings },
        document: {
            body: { classList: { contains: (name) => panelOpen && name === 'ytkit-panel-open' } },
            querySelector: (selector) => (selector === '.ytkit-global-toast' ? onScreen : null),
        },
        inferToastTone: (color) => TONE_OF[String(color).toLowerCase()] || 'neutral',
        normalizeToastTone: (tone) => tone || 'neutral',
        announceA11y: (message) => announced.push(message),
        _getToastSystem: () => ({
            showToast(message) {
                shown.push(message);
                return { message };
            },
        }),
        dismissToast: (toast, immediate) => { dismissed.push([toast, immediate]); },
    });
    return { showToast: api.showToast, shown, announced, dismissed };
}

test('action notices default to off in the schema and the shipped defaults', () => {
    const entry = SETTINGS_SCHEMA.find((e) => e.key === 'actionToasts');
    assert.ok(entry, 'actionToasts must be a schema key');
    assert.equal(entry.defaultValue, false);
    assert.equal(entry.vehicle, 'both', 'the userscript must get the same quiet default');
    const defaults = JSON.parse(fs.readFileSync(path.join(__dirname, '../../extension/default-settings.json'), 'utf8'));
    assert.equal(defaults.actionToasts, false);
});

test('with notices off, confirmations are announced but never drawn', () => {
    const h = harness({ actionToasts: false });
    assert.equal(h.showToast('Video hidden', '#6b7280', { actions: [{ text: 'Undo', onClick() {} }] }), null);
    assert.equal(h.showToast('Marked as watched', '#22c55e'), null);
    assert.equal(h.showToast('Copied link', '#3b82f6'), null);
    assert.equal(h.showToast('Skipped: "Intro"', '#7c3aed'), null, 'an unmapped color is neutral, so it stays quiet');
    assert.deepEqual(h.shown, []);
    assert.deepEqual(h.announced, ['Video hidden', 'Marked as watched', 'Copied link', 'Skipped: "Intro"']);
});

test('a settings object without the key behaves like the default', () => {
    const h = harness();
    h.showToast('Repeat on', '#22c55e');
    assert.deepEqual(h.shown, []);
    assert.deepEqual(h.announced, ['Repeat on']);
});

test('warnings and errors still show with notices off', () => {
    const h = harness({ actionToasts: false });
    h.showToast('No chapters found', '#f59e0b');
    h.showToast('Download failed', '#ef4444');
    h.showToast('Saved', '#22c55e', { tone: 'error' });
    assert.deepEqual(h.shown, ['No chapters found', 'Download failed', 'Saved']);
    assert.deepEqual(h.announced, []);
});

test('the open settings panel keeps its confirmations', () => {
    const h = harness({ actionToasts: false, panelOpen: true });
    h.showToast('Settings exported', '#22c55e');
    assert.deepEqual(h.shown, ['Settings exported']);
});

test('turning notices on restores every toast', () => {
    const h = harness({ actionToasts: true });
    h.showToast('Video hidden', '#6b7280');
    h.showToast('Marked as watched', '#22c55e');
    assert.deepEqual(h.shown, ['Video hidden', 'Marked as watched']);
    assert.deepEqual(h.announced, []);
});

test('a quiet notice still clears the toast it would have replaced', () => {
    const warning = { text: 'Astra Downloader is not paired yet' };
    const h = harness({ actionToasts: false, onScreen: warning });
    h.showToast('Astra Downloader connected', '#22c55e');
    assert.deepEqual(h.shown, []);
    assert.deepEqual(h.dismissed, [[warning, true]], 'removed at once, the way a new toast replaces it');

    const empty = harness({ actionToasts: false });
    empty.showToast('Video hidden', '#6b7280');
    assert.deepEqual(empty.dismissed, [], 'nothing on screen, nothing to clear');
});
