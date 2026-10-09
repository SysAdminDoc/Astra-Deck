'use strict';

// The copy gate reads string literals at its sinks (textContent, title,
// showToast, ...). A template literal built into a variable first, or handed
// over as a return value, got past it, so a 2026-10-06 sweep found these
// strings English in every locale. Each now comes from the catalogue.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const localesRoot = path.join(repoRoot, 'extension', '_locales');
const catalogues = Object.fromEntries(fs.readdirSync(localesRoot).map((locale) => [
    locale, JSON.parse(fs.readFileSync(path.join(localesRoot, locale, 'messages.json'), 'utf8'))
]));

const YTKIT = 'extension/ytkit.js';
const PANEL = 'extension/features/settings-panel/index.js';
const HIDER = 'extension/features/video-hider/index.js';
const DOWNLOAD = 'extension/features/download-ui/index.js';

// [file, key, plural]
const MOVED = [
    [YTKIT, 'quickLinksRemovedTpl'], [YTKIT, 'quickLinksAddedTpl'], [YTKIT, 'quickLinksLimitNoteTpl'],
    [YTKIT, 'quickLinksUsageNoteTpl'], [YTKIT, 'quickLinksLimitToastTpl'],
    [YTKIT, 'sleepTimerSetAnnounceTpl', true], [YTKIT, 'sleepTimerExtendedAnnounceTpl', true],
    [YTKIT, 'sleepTimerPresetAriaTpl', true], [YTKIT, 'watchTimeStatsTpl'], [YTKIT, 'chapterSkippedToastTpl'],
    [YTKIT, 'playlistSearchFilteredCountTpl'], [YTKIT, 'playlistSearchItemCountTpl', true],
    [YTKIT, 'commentSearchMatchPositionTpl'], [YTKIT, 'commentSearchThreadPositionTpl'],
    [YTKIT, 'commentSearchThreadsReadyTpl'], [YTKIT, 'settingsProfileSavedTpl'],
    [YTKIT, 'settingsProfileNotFoundTpl'], [YTKIT, 'settingsProfileAppliedTpl'],
    [YTKIT, 'settingsProfileDeletedTpl'], [YTKIT, 'settingsProfilesImportedTpl', true],
    [YTKIT, 'chaptersCopiedMarkdownTpl', true], [YTKIT, 'autoDubbedToastTpl'], [YTKIT, 'autoDubbedAnnounceTpl'],
    [YTKIT, 'deArrowChannelChipTpl'], [YTKIT, 'deArrowChannelOverrideToastTpl'],
    [YTKIT, 'transcriptBatchQueuedTpl'], [YTKIT, 'transcriptBatchFetchingTpl'],
    [YTKIT, 'transcriptSearchNoMatchesTpl'], [YTKIT, 'protocolHandoffToastTpl'],
    [YTKIT, 'pageModalEnabledCountTpl', true], [YTKIT, 'pageModalShortcutCountTpl', true],
    [YTKIT, 'quickLinksInvalidUrlNote'], [YTKIT, 'commentNavNoMatches'], [YTKIT, 'commentNavThreadsReady'],
    [YTKIT, 'commentNavFilterTitleTpl'], [YTKIT, 'chaptersNoneFound'], [YTKIT, 'clipboardWriteFailed'],
    [YTKIT, 'statusSettingsImportUndoFailed'], [YTKIT, 'statusSettingsImportInvalidFormat'],
    [PANEL, 'videoHiderHiddenReadyTpl', true], [PANEL, 'videoHiderAllowedProtectedTpl', true],
    [PANEL, 'videoHiderAllowedChannelCountTpl', true], [PANEL, 'videoHiderBlockedChannelCountTpl', true],
    [PANEL, 'settingsSearchSectionMatchesTpl', true], [PANEL, 'settingsHostAccessNeededAll'],
    [HIDER, 'videoHiderInputsUnreadableTpl'], [HIDER, 'videoHiderInputPairTpl'], [HIDER, 'videoHiderInputTrioTpl'],
    [DOWNLOAD, 'dlHealthRuntimeRepairTpl'], [DOWNLOAD, 'dlHealthRuntimeBundledTpl'],
    [DOWNLOAD, 'dlHealthRuntimeRepairTitleTpl']
];

test('each moved string is read through its key and exists in all 11 catalogues', () => {
    assert.equal(Object.keys(catalogues).length, 11);
    const sources = {};
    for (const [file, key, plural] of MOVED) {
        sources[file] ??= read(file);
        const call = plural ? new RegExp(`tCount\\([^;]*?'${key}'`) : new RegExp(`\\bt\\('${key}'`);
        assert.match(sources[file], call, `${file} reads ${key}`);
        for (const name of plural ? [`${key}One`, `${key}Other`] : [key]) {
            const english = catalogues.en[name]?.message;
            assert.ok(english, `en has ${name}`);
            const tokens = english.match(/\{[a-z]+\}/g) || [];
            for (const [locale, messages] of Object.entries(catalogues)) {
                const message = messages[name]?.message;
                assert.ok(message, `${locale} has ${name}`);
                for (const token of tokens) assert.ok(message.includes(token), `${locale} ${name} keeps ${token}`);
            }
        }
    }
});

test('the English template literals the sweep found are gone', () => {
    const ytkit = read(YTKIT);
    for (const pattern of [
        /`Removed "\$\{item\.text\}"`/, /`Added "\$\{name\}"`/, /`Limit reached \(\$\{/, /`Quick Links limit reached/,
        /`Sleep timer (?:set|extended)/, /`Set sleep timer for/, /`Today: \$\{/, /`Skipped: "\$\{/,
        /item\$\{items\.length === 1/, /`Match \$\{/, /`Thread \$\{/, /threads ready`/,
        /`Profile (?:saved|not found|deleted): \$\{/, /`Applied profile: /, /profile\(s\)`/,
        /chapters copied as markdown`/, /`Audio: YouTube selected/, /`Audio track is \$\{/,
        /`DeArrow: \$\{/, /`DeArrow override set/, /queued; one recovery pass per video`/,
        /`Fetching \$\{i \+ 1\}/, /`No transcripts matched/, /`\$\{scheme\.toUpperCase\(\)\} handoff/,
        /`\$\{enabledCount\} Enabled`/, /Shortcuts` \}/,
        // Left English beside the strings above until a 2026-10-09 review.
        /= 'Use a path that starts/, /= 'Visible threads ready'/, /\? 'No matching threads'/, /`Search filter: \$\{/,
        /showToast\('No chapters found'/, /showToast\('Clipboard write failed'/, /status\.textContent = 'Waiting for comments/,
        /'watchFeed(?:Item|Filtered)CountTpl'/
    ]) assert.doesNotMatch(ytkit, pattern);
    const panel = read(PANEL);
    assert.doesNotMatch(panel, /countLabel\(/, 'no English "s" plural on translated words');
    assert.doesNotMatch(panel, /match\$\{directMatches !== 1/);
    assert.doesNotMatch(read(HIDER), /`Can't read \$\{list\}/);
    assert.doesNotMatch(read(DOWNLOAD), /'unverified'\} · repair`/);
});

// A key every locale still carries in English shows half-translated copy
// wherever it wraps a translated piece ("3 blockierte Kanäle in Your List").
test('the keys a 2026-10-09 review found English are translated', () => {
    for (const key of [
        'videoHiderChannelListCount', 'clipboardWriteFailed', 'queueImport', 'quickLinksInvalidUrlNote',
        'commentNavNoMatches', 'commentNavThreadsReady', 'commentNavFilterTitleTpl', 'chaptersNoneFound'
    ]) {
        const english = catalogues.en[key].message;
        for (const [locale, messages] of Object.entries(catalogues)) {
            if (locale === 'en') continue;
            assert.notEqual(messages[key].message, english, `${locale} ${key} is still English`);
        }
    }
});

test('a relative time with an unusable locale tag still uses the browser locale before English', () => {
    const source = read('extension/core/date-time.js');
    assert.match(source, /new Intl\.RelativeTimeFormat\(undefined, \{ numeric: 'auto' \}\)/);
});
