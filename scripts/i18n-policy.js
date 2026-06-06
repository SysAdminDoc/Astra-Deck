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
    'TrustedTypes',
    'ETA'
]);

const DO_NOT_TRANSLATE_MESSAGES = new Set(DO_NOT_TRANSLATE_TERMS);
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
    isFeatureMessageKey,
    isIntentionallyIdenticalMessage,
    missingProtectedTerms
};
