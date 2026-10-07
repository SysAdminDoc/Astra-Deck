'use strict';

// English UI copy built where the copy gate can't see it: in a `return`,
// handed to a helper, or set on a property the gate doesn't scan. The
// 2026-09-23 audit found these by walking template literals; each now comes
// from catalogue keys, with counts through a One/Other key pair.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
const LOCALES = fs.readdirSync(path.join(repoRoot, 'extension/_locales'));

// Plain keys, then pair bases (each has a ...One and ...Other key).
const KEYS = [
    'dwDailyLimitBadgeTpl', 'dwDailyLimitHint', 'dwDailyLimitDismissButton', 'dwBreakBadgeTpl', 'dwBreakHint',
    'subImportNewTpl', 'subImportUpdatedTpl', 'subImportRemovedTpl', 'subImportReplacedAll', 'subImportSkippedTpl',
    'dlInstallerRunHint', 'dlInstallerReadyTpl', 'dlInstallerReadyCopiedTpl',
    'bisectReportUnknown', 'bisectReportUnknownBrowser', 'bisectReportCulpritTpl', 'bisectReportNoCulprit', 'bisectReportPageTpl',
    'importPreviewTpl', 'externalHealthAgeNever',
    'featureHealthAgeSecondsTpl', 'featureHealthAgeMinutesTpl', 'featureHealthAgeHoursTpl', 'featureHealthAgeDaysTpl',
    'importSummaryNoChanges', 'importSummarySkippedTpl', 'importSummaryTpl', 'importSummaryExtrasTpl', 'takeoutNothingNew'
];
const PAIRS = [
    'dwDailyLimitMessageTpl', 'dwBreakMessageTpl',
    'subStaleReasonTpl', 'subImportChannelsTpl', 'subImportSkippedGroupsTpl', 'subImportSkippedChannelsTpl',
    'subImportDuplicateChannelsTpl', 'subImportSummaryTpl',
    'bisectReportStepsTpl', 'bisectReportSearchedTpl',
    'importPreviewReplaceTpl', 'importPreviewMergeTpl', 'importPreviewDroppedTpl', 'importPreviewExcludedTpl',
    'importSummarySettingsTpl', 'importSummaryHiddenVideosTpl', 'importSummaryAllowedVideosTpl',
    'importSummaryWatchedVideosTpl', 'importSummaryBlockedChannelsTpl', 'importSummaryAllowedChannelsTpl',
    'importSummaryBookmarksTpl', 'importSummaryAiSummariesTpl', 'importSummaryDuplicatesTpl',
    'takeoutDuplicatesTpl', 'takeoutSkippedTpl', 'takeoutImportedTpl'
];
const ALL_KEYS = [...KEYS, ...PAIRS.flatMap((base) => [`${base}One`, `${base}Other`])];

const placeholders = (text) => (String(text).match(/\{[a-z]+\}/gi) || []).sort().join(',');

test('every converted string has its keys in all 11 locales, placeholders intact', () => {
    assert.equal(LOCALES.length, 11);
    const en = JSON.parse(read('extension/_locales/en/messages.json'));
    for (const locale of LOCALES) {
        const messages = JSON.parse(read(`extension/_locales/${locale}/messages.json`));
        for (const key of ALL_KEYS) {
            assert.ok(messages[key]?.message, `${locale} is missing ${key}`);
            assert.equal(placeholders(messages[key].message), placeholders(en[key].message),
                `${locale} ${key} must keep the English placeholders`);
        }
    }
});

// A non-English t: every catalogue read shows up as its key.
const markerT = (key) => `«${key}»`;

test('the import preview line is built from catalogue keys', () => {
    require('../extension/core/persisted-domains.js');
    const { formatImportPreview } = globalThis.YTKitCore.persistedDomains;
    const preview = { replace: 1, merge: 3, drop: 0, exclusions: [{}, {}] };
    assert.equal(formatImportPreview(preview, { t: markerT }), '«importPreviewTpl»');
    const inner = formatImportPreview(preview, { t: (key, fallback) => (key === 'importPreviewTpl' ? fallback : markerT(key)) });
    assert.equal(inner, '«importPreviewReplaceTplOne», «importPreviewMergeTplOther», «importPreviewDroppedTplOther»; «importPreviewExcludedTplOther»');
    assert.equal(formatImportPreview(preview), '1 item replaces, 3 settings merge, 0 dropped; 2 cache, runtime, diagnostic, or credential domains intentionally excluded',
        'without i18n it is the English line');
});

test('the bisect report reads its labels and counts from the catalogue', () => {
    const bisect = require('../extension/core/feature-bisect.js');
    const session = { phase: 'culprit', candidates: ['hideShorts'], snapshot: ['a', 'b', 'c'], answers: [true] };
    const report = (bisect.formatBisectResult || globalThis.YTKitCore.formatBisectResult)(session, { version: '4.97.0', t: markerT });
    assert.deepEqual(report.split('\n'), [
        '«bisectReportCulpritTpl»',
        'Astra Deck 4.97.0',
        '«bisectReportUnknownBrowser»',
        '«bisectReportPageTpl»',
        '«bisectReportSearchedTplOther»'
    ]);
});

test("the popup's service-health age uses the age templates and a localized never", () => {
    const source = read('extension/popup.js');
    const start = source.indexOf('function formatExternalHealthAge(ts) {');
    const body = source.slice(start, source.indexOf('\n}\n', start) + 2);
    const format = new Function('t', `${body}\nreturn formatExternalHealthAge;`)((key, fallback) => (
        key === 'externalHealthAgeNever' ? '«never»' : `«${key}»${fallback}`
    ));
    assert.equal(format(0), '«never»');
    assert.equal(format(Date.now() - 5 * 60 * 1000), '«featureHealthAgeMinutesTpl»5m ago');
    assert.equal(format(Date.now() - 3 * 24 * 3600 * 1000), '«featureHealthAgeDaysTpl»3d ago');
});

test('a staged channel reason is rendered from its age in the current language', () => {
    globalThis.YTKitFeatures = globalThis.YTKitFeatures || {};
    delete require.cache[require.resolve('../extension/features/subscription-groups/index.js')];
    require('../extension/features/subscription-groups/index.js');
    const feature = globalThis.YTKitFeatures.subscriptionGroups.createSubscriptionGroupsFeature({
        t: (key, fallback) => (key === 'subStaleReasonTplOther' ? 'vor {count} Tagen zuletzt hochgeladen' : fallback)
    });
    assert.equal(feature._staleReason(40), 'vor 40 Tagen zuletzt hochgeladen');
    assert.equal(feature._staleReason(1), '1 day since the newest upload on its page');
});

test('none of the old English template literals survive at their call sites', () => {
    const gone = {
        'extension/features/digital-wellbeing/index.js': [/`You have watched \$\{/, /`You have been watching for \$\{/, /Min Today`/, /Min Session`/,
            /hint: 'Dismissing this reminder/, /buttonText: 'Dismiss Until Tomorrow'/, /hint: 'Playback is paused/],
        'extension/features/subscription-groups/index.js': [/days since newest rendered upload`/, /subscription group\$\{count === 1/,
            /skipped group\$\{/, /duplicate channel\$\{/],
        'extension/features/download-ui/index.js': [/`Setup file ready\. \$\{/],
        'extension/core/feature-bisect.js': [/enabled feature\(s\)/, /`Page: \$\{/],
        'extension/core/persisted-domains.js': [/items replace, \$\{/],
        'extension/popup.js': [/return `\$\{seconds\}s ago`/, /return 'never';/],
        'extension/ytkit.js': [/setting\$\{summary\.settingsUpdated === 1/, /AI summar\$\{/, /Takeout watch entr\$\{/,
            /older entr\$\{/, /`No new watch-history entries imported\./]
    };
    for (const [file, patterns] of Object.entries(gone)) {
        const source = read(file);
        for (const pattern of patterns) assert.doesNotMatch(source, pattern, `${file} still builds ${pattern}`);
    }
});
