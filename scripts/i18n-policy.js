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
    'Theater Split'
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
