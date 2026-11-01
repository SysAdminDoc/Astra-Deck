(() => {
    'use strict';

    // Shared adapter for Chrome's built-in AI task APIs. Keep feature code
    // independent from the legacy window.ai names so a browser rollout or a
    // userscript host can expose either API generation without changing the
    // lane-selection contract.
    const root = globalThis;
    const core = root.YTKitCore || (root.YTKitCore = {});
    if (core.localAi) return;

    const API_DEFINITIONS = Object.freeze({
        summarizer: Object.freeze({ globalName: 'Summarizer', legacyName: 'summarizer' }),
        translator: Object.freeze({ globalName: 'Translator', legacyName: 'translator' }),
        languageDetector: Object.freeze({ globalName: 'LanguageDetector', legacyName: 'languageDetector' }),
        prompt: Object.freeze({ globalName: 'LanguageModel', legacyName: 'languageModel' })
    });
    const AVAILABILITY_VALUES = new Set([
        'available', 'downloadable', 'downloading', 'unavailable', 'unknown'
    ]);

    function getFactory(kind, scope = root) {
        const definition = API_DEFINITIONS[kind];
        if (!definition || !scope) return null;
        try {
            return scope[definition.globalName]
                || scope.ai?.[definition.legacyName]
                || null;
        } catch (_) {
            return null;
        }
    }

    function has(kind, scope = root) {
        return Boolean(getFactory(kind, scope));
    }

    function normalizeAvailability(value) {
        if (value === true) return 'available';
        if (value === false || value == null) return 'unavailable';
        const normalized = String(value).trim().toLowerCase();
        return AVAILABILITY_VALUES.has(normalized) ? normalized : 'unknown';
    }

    // Chromium can leave this question unanswered: Summarizer and LanguageModel were
    // still pending after 60 s on 153, with no on-device model, while Translator took
    // 1 ms. Every caller waits on the answer before it shows anything else.
    const AVAILABILITY_TIMEOUT_MS = 5000;

    async function availability(kind, options = {}, scope = root) {
        const factory = getFactory(kind, scope);
        if (!factory) return 'unavailable';
        if (typeof factory.availability !== 'function') return 'unknown';
        let timer = null;
        try {
            const unanswered = new Promise((resolve) => {
                timer = setTimeout(() => resolve('unavailable'), AVAILABILITY_TIMEOUT_MS);
            });
            return normalizeAvailability(await Promise.race([factory.availability(options), unanswered]));
        } catch (_) {
            return 'unavailable';
        } finally {
            clearTimeout(timer);
        }
    }

    async function create(kind, options = {}, scope = root) {
        const factory = getFactory(kind, scope);
        if (!factory || typeof factory.create !== 'function') {
            throw new Error(`${kind} API is unavailable.`);
        }
        return factory.create(options);
    }

    function lane(localAvailable, fallbackLane) {
        return Object.freeze({
            localAvailable: Boolean(localAvailable),
            activeLane: localAvailable ? 'local' : fallbackLane,
            fallbackLane
        });
    }

    function getLaneStatus(options = {}, scope = root) {
        const summaryFallback = options.summaryFallback || 'byo-key';
        const translationFallback = options.translationFallback || 'byo-key';
        const promptFallback = options.promptFallback || 'configured-provider';
        return Object.freeze({
            summary: Object.freeze({
                capability: 'summarizerApi',
                ...lane(has('summarizer', scope), summaryFallback)
            }),
            transcriptTranslation: Object.freeze({
                capability: 'translatorApi',
                ...lane(has('translator', scope), translationFallback)
            }),
            transcriptQa: Object.freeze({
                capability: 'promptApi',
                ...lane(has('prompt', scope), promptFallback)
            }),
            languageDetection: Object.freeze({
                capability: 'languageDetector',
                ...lane(has('languageDetector', scope), 'conservative-text')
            })
        });
    }

    async function resolveLaneStatus(options = {}, scope = root) {
        const status = getLaneStatus(options, scope);
        const [summaryAvailability, translationAvailability, promptAvailability] = await Promise.all([
            availability('summarizer', options.summaryOptions || {}, scope),
            availability('translator', options.translationOptions || {}, scope),
            availability('prompt', options.promptOptions || {}, scope)
        ]);
        const withAvailability = (entry, value) => Object.freeze({
            ...entry,
            availability: value,
            activeLane: value === 'unavailable' ? entry.fallbackLane : 'local'
        });
        return Object.freeze({
            ...status,
            summary: withAvailability(status.summary, summaryAvailability),
            transcriptTranslation: withAvailability(status.transcriptTranslation, translationAvailability),
            transcriptQa: withAvailability(status.transcriptQa, promptAvailability)
        });
    }

    const surface = Object.freeze({
        API_DEFINITIONS,
        availability,
        create,
        getFactory,
        getLaneStatus,
        has,
        normalizeAvailability,
        resolveLaneStatus
    });
    core.localAi = surface;

    if (typeof module !== 'undefined' && module.exports) module.exports = surface;
})();
