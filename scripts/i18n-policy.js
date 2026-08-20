'use strict';

const DO_NOT_TRANSLATE_TERMS = Object.freeze([
    'Astra Deck',
    'Astra Downloader',
    'DeArrow',
    'SponsorBlock',
    'YouTube',
    'MP4',
    'M4A',
    'VP9',
    'AV1',
    'H.264',
    'TrustedTypes'
]);

const REVIEWED_EXACT_MESSAGES = Object.freeze([
    ...DO_NOT_TRANSLATE_TERMS,
    'ETA',
    'Super Chats',
    'CPU Tamer',
    'Picture-in-Picture',
    'Return YouTube Dislike',
    'Theater Split',
    // Typographic classifications that are the same word in several
    // target languages. Counting them as untranslated would push the
    // placeholder ratchet up for a translation that is already correct.
    'Serif',
    'Monospace',
    // Product feature name, same in every catalogue (cf. 'Theater Split').
    'Video Hider',
    // Example URL in the filter-list field placeholder. Translating a URL
    // would make the field demonstrate an address that does not exist.
    'https://example.com/astra-deck-rules.json',
    // Settings-tree section headings that are the same word in at least one
    // Latin-script target language and are translated normally in the rest:
    // "Audio" in de/es/fr/it, "Navigation" in de/fr, "Timing" in de, and
    // "Diagnostics"/"Formats"/"Messages"/"Notifications"/"Session"/"Surfaces"
    // in fr. Counting these as untranslated would push the ratchet up for
    // copy that is already right. Verified per locale on 2026-08-20; every
    // other catalogue does translate them, so a real miss still shows up.
    'Audio',
    'Navigation',
    'Timing',
    'Diagnostics',
    'Formats',
    'Messages',
    'Notifications',
    'Session',
    'Surfaces',
    // Two brand names joined by an ampersand. German keeps the ampersand;
    // the other catalogues use their own conjunction.
    'SponsorBlock & DeArrow'
]);

const DO_NOT_TRANSLATE_MESSAGES = new Set(REVIEWED_EXACT_MESSAGES);
const FEATURE_MESSAGE_RE = /^feature_[A-Za-z0-9_]+_(name|desc)$/;

function messageText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function isFeatureMessageKey(key) {
    return FEATURE_MESSAGE_RE.test(key);
}

function isIntentionallyIdenticalMessage(message) {
    return DO_NOT_TRANSLATE_MESSAGES.has(messageText(message));
}

function missingProtectedTerms(sourceMessage, translatedMessage) {
    const source = messageText(sourceMessage);
    const translated = messageText(translatedMessage);
    return DO_NOT_TRANSLATE_TERMS.filter((term) => (
        source === term && translated !== term
    ));
}

module.exports = {
    DO_NOT_TRANSLATE_TERMS,
    REVIEWED_EXACT_MESSAGES,
    isFeatureMessageKey,
    isIntentionallyIdenticalMessage,
    missingProtectedTerms
};
