'use strict';

// The migration tables in INSTALL.md name settings the way the panel shows them.
// A renamed feature would leave someone hunting for a label that isn't there.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const messages = JSON.parse(fs.readFileSync(path.join(REPO, 'extension/_locales/en/messages.json'), 'utf8'));
const install = fs.readFileSync(path.join(REPO, 'INSTALL.md'), 'utf8');

const featureNames = new Set(
    Object.entries(messages)
        .filter(([key]) => /^feature_.+_name$/.test(key))
        .map(([, entry]) => entry.message)
);

function migrationSection(text) {
    const start = text.indexOf('## Coming from another extension');
    const end = text.indexOf('\n## ', start + 1);
    return start === -1 ? '' : text.slice(start, end === -1 ? undefined : end);
}

// Only the right-hand column names Astra Deck settings. The left one is the other
// extension's wording, and steps outside a table name its buttons.
function missingNames(section, known) {
    const missing = [];
    for (const line of section.split('\n')) {
        const cells = line.split('|');
        if (cells.length < 4) continue;
        for (const match of cells[2].matchAll(/\*\*([^*]+)\*\*/g)) {
            if (!known.has(match[1])) missing.push(match[1]);
        }
    }
    return missing;
}

test('INSTALL.md covers the three extensions people move from', () => {
    const section = migrationSection(install);
    for (const heading of ['### BlockTube', '### Iridium', '### Enhancer for YouTube']) {
        assert.ok(section.includes(heading), `missing ${heading}`);
    }
});

test('every setting the migration tables name exists under that label', () => {
    const section = migrationSection(install);
    const named = [...section.matchAll(/\*\*([^*]+)\*\*/g)].length;
    assert.ok(named > 20, `expected the tables to name settings, found ${named}`);
    assert.deepEqual(missingNames(section, featureNames), []);
});

test('the label check catches a name the panel does not have', () => {
    const fixture = '| Default speed | **Persistent Playback Speed** and **Warp Speed** |';
    assert.deepEqual(missingNames(fixture, featureNames), ['Warp Speed']);
});

test('the migration guide keeps to the repo public writing rules', () => {
    assert.ok(!/[–—]/.test(migrationSection(install)), 'no em or en dashes');
});
